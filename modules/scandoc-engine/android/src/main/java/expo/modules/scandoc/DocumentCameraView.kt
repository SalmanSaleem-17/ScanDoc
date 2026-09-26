package expo.modules.scandoc

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.os.SystemClock
import android.util.Size
import android.view.View
import androidx.camera.core.*
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.view.*
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.opencv.android.OpenCVLoader
import org.opencv.core.CvType
import org.opencv.core.Mat
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

private const val TAG="ScanDocCamera"
class DocumentCameraView(context: Context, appContext: AppContext) : ExpoView(context,appContext) {
  private val onDetection by EventDispatcher()
  private val onReady by EventDispatcher()
  private val onError by EventDispatcher()
  // PERFORMANCE mode draws through a SurfaceView, which receives frames as soon
  // as it is attached and sized. COMPATIBLE mode (TextureView) needs the view
  // tree to draw it before a SurfaceTexture exists, and inside a React Native
  // hierarchy that draw never came: the camera opened, the Preview requested
  // its surface, and the screen stayed black. expo-camera hosts its PreviewView
  // the same way (default mode) and streams reliably here.
  private val preview=PreviewView(context).apply { implementationMode=PreviewView.ImplementationMode.PERFORMANCE;scaleType=PreviewView.ScaleType.FILL_CENTER;elevation=0f }
  private val overlay=BoundaryOverlay(context)
  private val executor=Executors.newSingleThreadExecutor()
  private val tracker=DocumentTracker()
  private var detector: DocumentDetector?=null
  private var controller: LifecycleCameraController?=null
  private var lifecycle: LifecycleOwner?=null
  private var gray: Mat?=null
  private var bytes=ByteArray(0)
  @Volatile private var sensorToView: Matrix?=null
  @Volatile private var running=false
  @Volatile private var capturing=false
  @Volatile private var latest: TrackingResult?=null
  @Volatile private var latestAt=0L
  @Volatile private var liveSensorCorners: FloatArray?=null
  private val latencies=java.util.ArrayDeque<Long>()
  private var measuredAt=0L;private var measuredCount=0;private var measuredFps=0.0
  private var lastAnalysis=0L;private var interval=80L
  private var flashMode=ImageCapture.FLASH_MODE_OFF
  private var disposed=false
  var cameraActive=true
    set(value){field=value;if(value)start() else stop()}
  init { addView(preview);addView(overlay) }
  // React Native sizes this view with Yoga and ignores requestLayout() coming
  // from native children. PreviewView adds its TextureView only when the
  // camera asks for a surface and relies on a layout pass following that
  // request; without one the surface stays 0x0, the stream never starts and
  // the screen stays black although the camera is open. So every request is
  // answered with an explicit measure + layout of this view and its children.
  // One pass is queued at a time, and a pass never queues another: laying the
  // children out makes them request layout again, which would otherwise post
  // an endless chain of passes and freeze the main thread.
  private var relayoutQueued=false
  private var relayingOut=false
  private val relayout=Runnable {
    relayoutQueued=false
    if(width>0 && height>0 && !relayingOut){
      relayingOut=true
      try {
        measure(MeasureSpec.makeMeasureSpec(width,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(height,MeasureSpec.EXACTLY))
        layout(left,top,right,bottom)
      } finally { relayingOut=false }
    }
  }
  override fun requestLayout(){
    super.requestLayout()
    if(!relayingOut && !relayoutQueued){relayoutQueued=true;post(relayout)}
  }
  // A child's requestLayout() only reaches this view while no layout is
  // already pending on it, and React Native never runs the measure pass that
  // would clear that state. Rather than depend on it, the layout pass is
  // repeated on a short timer from the moment the camera starts until the
  // preview reports STREAMING (bounded, so a camera that never streams costs
  // nothing after a few seconds).
  @Volatile private var streaming=false
  private var kicksLeft=0
  private val kick=object:Runnable {
    override fun run(){
      if(!running || streaming || kicksLeft<=0)return
      kicksLeft--
      if(!relayingOut){relayoutQueued=true;relayout.run()}
      postDelayed(this,250)
    }
  }
  override fun onMeasure(widthMeasureSpec: Int,heightMeasureSpec: Int){
    preview.measure(widthMeasureSpec,heightMeasureSpec);overlay.measure(widthMeasureSpec,heightMeasureSpec)
    setMeasuredDimension(resolveSize(preview.measuredWidth,widthMeasureSpec),resolveSize(preview.measuredHeight,heightMeasureSpec))
  }
  override fun onLayout(changed: Boolean,l: Int,t: Int,r: Int,b: Int) {
    val w=r-l;val h=b-t
    val ws=MeasureSpec.makeMeasureSpec(w,MeasureSpec.EXACTLY);val hs=MeasureSpec.makeMeasureSpec(h,MeasureSpec.EXACTLY)
    preview.measure(ws,hs);preview.layout(0,0,w,h)
    overlay.measure(ws,hs);overlay.layout(0,0,w,h)
  }
  override fun onAttachedToWindow(){super.onAttachedToWindow();post{start()}}
  override fun onDetachedFromWindow(){stop();super.onDetachedFromWindow()}
  fun setFlash(value: String){flashMode=when(value){"on"->ImageCapture.FLASH_MODE_ON;"auto"->ImageCapture.FLASH_MODE_AUTO;else->ImageCapture.FLASH_MODE_OFF};controller?.imageCaptureFlashMode=flashMode}
  private fun start(){
    if(disposed || !cameraActive || !isAttachedToWindow || controller!=null)return
    try {
      check(OpenCVLoader.initLocal())
      val owner=appContext.currentActivity as? LifecycleOwner ?: error("Lifecycle unavailable")
      val next=LifecycleCameraController(context)
      next.setEnabledUseCases(CameraController.IMAGE_CAPTURE or CameraController.IMAGE_ANALYSIS)
      next.imageAnalysisResolutionSelector=ResolutionSelector.Builder().setResolutionStrategy(ResolutionStrategy(Size(640,480),ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER)).build()
      next.imageAnalysisBackpressureStrategy=ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST
      next.imageCaptureMode=ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY
      // The still image should be the sensor's best, not the preview's size:
      // OCR and the crop both gain from every pixel.
      next.imageCaptureResolutionSelector=ResolutionSelector.Builder().setResolutionStrategy(ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY).build()
      next.imageCaptureFlashMode=flashMode
      next.isTapToFocusEnabled=true;next.isPinchToZoomEnabled=true
      next.setImageAnalysisAnalyzer(executor,object:ImageAnalysis.Analyzer {
        override fun getTargetCoordinateSystem()=ImageAnalysis.COORDINATE_SYSTEM_VIEW_REFERENCED
        override fun updateTransform(matrix: Matrix?){sensorToView=matrix?.let { Matrix(it) }}
        override fun analyze(image: ImageProxy){analyzeFrame(image)}
      })
      preview.controller=next;controller=next;running=true
      lifecycle=owner
      next.bindToLifecycle(owner)
      streaming=false
      preview.previewStreamState.observe(owner) { state ->
        android.util.Log.d(TAG,"preview stream state $state")
        if(state==PreviewView.StreamState.STREAMING)streaming=true
        if(running && state==PreviewView.StreamState.STREAMING)onReady(mapOf("ready" to true))
      }
      kicksLeft=60
      removeCallbacks(kick);postDelayed(kick,250)
      next.initializationFuture.addListener({
        try { next.initializationFuture.get() } catch(_:Exception) {
          if(controller===next){stop();onError(mapOf("message" to "Camera unavailable. Try reopening the scanner."))}
        }
      },context.mainExecutor)
      preview.setOnTouchListener { _,event ->
        if(event.action==android.view.MotionEvent.ACTION_DOWN)executor.execute { tracker.focus(SystemClock.elapsedRealtime()) }
        false
      }
    }catch(_:Exception){stop();onError(mapOf("message" to "Camera unavailable. Try reopening the scanner."))}
  }
  fun dispose(){
    disposed=true
    stop()
    if(!capturing)executor.shutdown()
  }
  private fun stop(){
    running=false;removeCallbacks(kick);latest=null;latestAt=0;sensorToView=null
    lifecycle?.let{preview.previewStreamState.removeObservers(it)};lifecycle=null
    controller?.clearImageAnalysisAnalyzer();controller?.unbind();controller=null;preview.controller=null
    overlay.show(null,false)
    if(!executor.isShutdown)executor.execute { detector?.close();detector=null;gray?.release();gray=null;bytes=ByteArray(0);tracker.reset() }
  }
  private fun analyzeFrame(image: ImageProxy){
    val started=SystemClock.elapsedRealtime()
    try {
      if(!running || capturing || started-lastAnalysis<interval)return
      lastAnalysis=started
      val mapping=sensorToView?.let{Matrix(it)} ?: return
      val inverse=PreviewCoordinates.bufferToPreview(image.imageInfo.sensorToBufferTransformMatrix,mapping) ?: return
      val w=image.width;val h=image.height;val plane=image.planes[0]
      if(bytes.size!=w*h)bytes=ByteArray(w*h)
      val buffer=plane.buffer.duplicate();val origin=buffer.position()
      for(y in 0 until h)for(x in 0 until w)bytes[y*w+x]=buffer.get(origin+y*plane.rowStride+x*plane.pixelStride)
      val frame=gray ?: Mat().also{gray=it};frame.create(h,w,CvType.CV_8UC1);frame.put(0,0,bytes)
      val cv=detector ?: DocumentDetector().also{detector=it}
      var page=cv.detect(frame,latest?.page?.corners)
      liveSensorCorners=if(page!=null && page.confidence>=.84) {
        val p=page.corners.flatMap{listOf((it.x*w).toFloat(),(it.y*h).toFloat())}.toFloatArray()
        val toSensor=Matrix()
        if(image.imageInfo.sensorToBufferTransformMatrix.invert(toSensor)){toSensor.mapPoints(p);p}else null
      }else null
      // Gate on the visible preview, not the larger sensor buffer hidden by FILL_CENTER.
      if(page!=null){
        val p=page.corners.flatMap{listOf((it.x*w).toFloat(),(it.y*h).toFloat())}.toFloatArray()
        inverse.mapPoints(p)
        val visible=p.indices.all { i -> p[i]>=4 && p[i]<= (if(i%2==0) width else height)-4 }
        val visibleArea=kotlin.math.abs((0..3).sumOf { i -> val j=(i+1)%4;(p[i*2]*p[j*2+1]-p[j*2]*p[i*2+1]).toDouble() })/2
        page=page.copy(fullyVisible=page.fullyVisible && visible,coverage=visibleArea/maxOf(1.0,width.toDouble()*height))
      }
      val result=tracker.update(page,started);latest=result;latestAt=started
      val points=result.quad?.flatMap{listOf((it.x*w).toFloat(),(it.y*h).toFloat())}?.toFloatArray()
      if(points!=null)inverse.mapPoints(points)
      val elapsed=SystemClock.elapsedRealtime()-started
      interval=(elapsed*2).coerceIn(67L,200L)
      if(android.os.Build.VERSION.SDK_INT>=29 && (context.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager).currentThermalStatus>=3)interval=maxOf(interval,250L)
      latencies.addLast(elapsed);if(latencies.size>60)latencies.removeFirst()
      measuredCount++
      if(measuredAt==0L)measuredAt=started
      if(started-measuredAt>=1000){measuredFps=measuredCount*1000.0/(started-measuredAt);measuredAt=started;measuredCount=0}
      val sorted=latencies.sorted();val p95=sorted[((sorted.size-1)*.95).toInt()]
      val average=latencies.average()
      post {
        if(!running)return@post
        overlay.show(points,result.ready)
        onDetection(mapOf("state" to result.state,"guidance" to result.guidance,"progress" to result.progress,
          "captureReady" to result.ready,"confidence" to (page?.confidence?:0.0),"sharpness" to (page?.sharpness?:0.0),
          "brightness" to (page?.brightness?:0.0),"coverage" to (page?.coverage?:0.0),"motion" to result.motion,
          "processingMs" to elapsed,"analysisFps" to measuredFps,"p95Ms" to p95,"averageMs" to average))
      }
    }catch(_:Exception){latest=null;latestAt=0;tracker.reset();post{overlay.show(null,false)}}
    finally{image.close()}
  }
  fun capture(automatic: Boolean,promise: Promise){
    val camera=controller
    if(camera==null || capturing || !running || (automatic && (latest?.ready!=true || SystemClock.elapsedRealtime()-latestAt>300))){
      promise.reject("NOT_READY","Camera is not ready. Try again.",null);return
    }
    capturing=true
    val sensorHint=if(SystemClock.elapsedRealtime()-latestAt<300)liveSensorCorners?.clone() else null
    val folder=File(context.cacheDir,"ScanDocCaptures").apply{mkdirs()}
    val output=File(folder,"${UUID.randomUUID()}.jpg")
    // Focus and meter on the page itself before the shutter: an automatic
    // capture is triggered by geometry and stillness, and the lens may still
    // be set for whatever was in front of it a moment ago. The wait is
    // bounded so a camera that cannot focus (fixed-focus, or already locked)
    // never blocks the shot.
    fun shoot() {
      try {
        camera.takePicture(executor,object:ImageCapture.OnImageCapturedCallback(){
        override fun onCaptureSuccess(image:ImageProxy){
          try {
            require(image.format==android.graphics.ImageFormat.JPEG)
            output.outputStream().channel.use { channel ->
              val buffer=image.planes[0].buffer.duplicate()
              while(buffer.hasRemaining())channel.write(buffer)
            }
            val rotation=image.imageInfo.rotationDegrees
            val exif=androidx.exifinterface.media.ExifInterface(output)
            val orientation=when(rotation){90->6;180->3;270->8;else->1}
            exif.setAttribute(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION,orientation.toString());exif.saveAttributes()
            val hint=sensorHint?.also{image.imageInfo.sensorToBufferTransformMatrix.mapPoints(it)}?.let{
              PreviewCoordinates.uprightNormalized(it,image.width,image.height,rotation)
            }
            tracker.captured()
            promise.resolve(mapOf("uri" to android.net.Uri.fromFile(output).toString(),"corners" to hint))
          }catch(_:Exception){output.delete();promise.reject("CAPTURE_FAILED","Could not save the photo. Check available storage and try again.",null)}
          finally{image.close();capturing=false;if(disposed)executor.shutdown()}
        }
        override fun onError(error:ImageCaptureException){capturing=false;if(disposed)executor.shutdown();output.delete();promise.reject("CAPTURE_FAILED","Could not capture. Try again.",null)}
        })
      }catch(_:Exception){capturing=false;output.delete();promise.reject("CAPTURE_FAILED","Could not capture. Try again.",null)}
    }
    val quad=latest?.quad
    if(automatic && quad!=null && width>0 && height>0){
      try {
        val cx=(quad.sumOf { it.x }/4*width).toFloat(); val cy=(quad.sumOf { it.y }/4*height).toFloat()
        val point=preview.meteringPointFactory.createPoint(cx,cy)
        val action=FocusMeteringAction.Builder(point,FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE).setAutoCancelDuration(3,java.util.concurrent.TimeUnit.SECONDS).build()
        val future=camera.cameraControl?.startFocusAndMetering(action)
        if(future==null){shoot();return}
        val fired=java.util.concurrent.atomic.AtomicBoolean(false)
        fun once(){ if(fired.compareAndSet(false,true)) shoot() }
        future.addListener({ once() },context.mainExecutor)
        postDelayed({ once() },450)
      }catch(_:Exception){shoot()}
    } else shoot()
  }
}

private class BoundaryOverlay(context: Context):View(context){
  private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
  private val path=Path()
  private var points:FloatArray?=null
  private var ready=false
  private var animator:ValueAnimator?=null
  fun show(next:FloatArray?,isReady:Boolean){
    animator?.cancel();ready=isReady
    val previous=points
    if(next==null || previous==null){points=next;invalidate();return}
    animator=ValueAnimator.ofFloat(0f,1f).apply{
      duration=80
      addUpdateListener { animation ->val t=animation.animatedValue as Float;points=FloatArray(8){previous[it]+(next[it]-previous[it])*t};invalidate() }
      start()
    }
  }
  override fun onDetachedFromWindow(){animator?.cancel();super.onDetachedFromWindow()}
  override fun onDraw(canvas:Canvas){
    super.onDraw(canvas);val p=points?:return
    path.reset();path.moveTo(p[0],p[1]);for(i in 1..3)path.lineTo(p[i*2],p[i*2+1]);path.close()
    paint.color=if(ready)Color.rgb(18,183,106) else Color.rgb(23,215,255)
    paint.style=Paint.Style.FILL;paint.alpha=24;canvas.drawPath(path,paint)
    paint.style=Paint.Style.STROKE;paint.alpha=230;paint.strokeWidth=2*resources.displayMetrics.density;canvas.drawPath(path,paint)
    paint.style=Paint.Style.FILL
    for(i in 0..3)canvas.drawCircle(p[i*2],p[i*2+1],3*resources.displayMetrics.density,paint)
  }
}
