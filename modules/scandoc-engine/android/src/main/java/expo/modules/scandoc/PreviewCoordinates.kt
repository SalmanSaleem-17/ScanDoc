package expo.modules.scandoc

import android.graphics.Matrix

/** CameraX supplies sensor->buffer and sensor->view including rotation, viewport crop and zoom. */
object PreviewCoordinates {
  fun uprightNormalized(bufferPoints: FloatArray,width: Int,height: Int,rotation: Int): List<Double>? {
    val points=(0..3).map { i ->
      val x=bufferPoints[i*2].toDouble()/width;val y=bufferPoints[i*2+1].toDouble()/height
      when(rotation){
        90->org.opencv.core.Point(1-y,x)
        180->org.opencv.core.Point(1-x,1-y)
        270->org.opencv.core.Point(y,1-x)
        else->org.opencv.core.Point(x,y)
      }
    }
    if(points.any{!it.x.isFinite() || !it.y.isFinite() || it.x !in 0.0..1.0 || it.y !in 0.0..1.0})return null
    return DocumentDetector.order(points).flatMap{listOf(it.x,it.y)}
  }
  fun bufferToPreview(sensorToBuffer: Matrix, sensorToView: Matrix): Matrix? {
    val transform=Matrix()
    if(!sensorToBuffer.invert(transform))return null
    transform.postConcat(sensorToView)
    return transform
  }
}
