package expo.modules.scandoc

import org.opencv.core.*
import org.opencv.imgproc.Imgproc
import kotlin.math.*

data class DetectedPage(
  val corners: List<Point>, val confidence: Double, val coverage: Double,
  val sharpness: Double, val brightness: Double, val glare: Double,
  val perspective: Double, val fullyVisible: Boolean
)

/** Owns reusable native buffers. Call only on a single analysis executor. */
class DocumentDetector : AutoCloseable {
  private val small = Mat(); private val smooth = Mat(); private val edges = Mat()
  private val closed = Mat(); private val hierarchy = Mat(); private val mask = Mat()
  private val lap = Mat(); private val clipped = Mat()
  private var edgePixels=ByteArray(0)
  private val kernel = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, Size(3.0, 3.0))

  fun detect(gray: Mat, previous: List<Point>? = null, maxEdge: Int = 640): DetectedPage? {
    val scale = min(1.0, maxEdge.toDouble() / max(gray.cols(), gray.rows()))
    Imgproc.resize(gray, small, Size(gray.cols() * scale, gray.rows() * scale), 0.0, 0.0, Imgproc.INTER_AREA)
    Imgproc.GaussianBlur(small, smooth, Size(5.0, 5.0), 0.0)
    val mean=MatOfDouble();val deviation=MatOfDouble()
    val contrast=try{Core.meanStdDev(smooth,mean,deviation);deviation.toArray()[0]}finally{mean.release();deviation.release()}
    // Contrast, not paper brightness, sets edge thresholds: light-on-light pages need lower thresholds.
    Imgproc.Canny(smooth,edges,(contrast*.65).coerceIn(12.0,60.0),(contrast*1.8).coerceIn(35.0,150.0))
    Imgproc.morphologyEx(edges, closed, Imgproc.MORPH_CLOSE, kernel)
    val contours = ArrayList<MatOfPoint>()
    Imgproc.findContours(closed, contours, hierarchy, Imgproc.RETR_LIST, Imgproc.CHAIN_APPROX_SIMPLE)
    if(edgePixels.size!=edges.rows()*edges.cols())edgePixels=ByteArray(edges.rows()*edges.cols())
    edges.get(0,0,edgePixels)
    val w = small.cols().toDouble(); val h = small.rows().toDouble()
    var best: List<Point>? = null; var bestScore = 0.0
    var tracked: List<Point>?=null;var trackedScore=0.0
    try {
      for (contour in contours.sortedByDescending { abs(Imgproc.contourArea(it)) }.take(40)) {
        val area = abs(Imgproc.contourArea(contour)); val coverage = area / (w * h)
        if (coverage < .035 || coverage > .97) continue
        val curve = MatOfPoint2f(*contour.toArray()); val approx = MatOfPoint2f()
        try {
          Imgproc.approxPolyDP(curve, approx, .018 * Imgproc.arcLength(curve, true), true)
          if (approx.total() != 4L) continue
          val integer = MatOfPoint(*approx.toArray())
          val convex = try { Imgproc.isContourConvex(integer) } finally { integer.release() }
          if (!convex) continue
          val p = order(approx.toList()).map { Point(it.x / w, it.y / h) }
          val lengths = p.indices.map { distance(p[it], p[(it + 1) % 4]) }
          if (lengths.min() < .035) continue
          val geometry = geometry(p.map{Point(it.x*w,it.y*h)})
          if (geometry < .35) continue
          val center = Point(p.sumOf { it.x } / 4, p.sumOf { it.y } / 4)
          val position = (1.0 - distance(center, Point(.5, .5))).coerceIn(0.0, 1.0)
          var support = 0.0
          for (i in 0..3) for (step in 0..31) {
            val t = step / 31.0; val a = p[i]; val b = p[(i + 1) % 4]
            val x = ((a.x + (b.x-a.x)*t)*w).toInt().coerceIn(2, small.cols()-3)
            val y = ((a.y + (b.y-a.y)*t)*h).toInt().coerceIn(2, small.rows()-3)
            var found = false
            for (dy in -2..2) for (dx in -2..2) if (edgePixels[(y+dy)*small.cols()+x+dx].toInt() != 0) found = true
            if (found) support++
          }
          support /= 128.0
          val temporal = previous?.let { (1 - displacement(p, it)*4).coerceIn(0.0,1.0) } ?: .5
          val continuity = (area / max(1.0, abs(Imgproc.contourArea(approx)))).coerceIn(0.0,1.0)
          val score = .20*min(1.0,coverage/.45) + .22*geometry + .28*support + .10*position + .10*continuity + .10*temporal
          if(previous!=null && displacement(p,previous)<.08 && score>trackedScore){tracked=p;trackedScore=score}
          if (score > bestScore) { bestScore = score; best = p }
        } finally { curve.release(); approx.release() }
      }
    } finally { contours.forEach { it.release() } }
    if(tracked!=null && trackedScore>=bestScore-.08){best=tracked;bestScore=trackedScore}
    var p = best ?: return null
    if (bestScore < .60) return null
    if(maxEdge>640) {
      val refined=MatOfPoint2f(*p.map{Point(it.x*w,it.y*h)}.toTypedArray())
      try {
        Imgproc.cornerSubPix(small,refined,Size(7.0,7.0),Size(-1.0,-1.0),TermCriteria(TermCriteria.EPS+TermCriteria.MAX_ITER,20,.1))
        val candidate=refined.toList().map{Point(it.x/w,it.y/h)}
        if(displacement(candidate,p)<.015 && geometry(candidate)>.35)p=candidate
      }finally{refined.release()}
    }
    mask.create(small.rows(), small.cols(), CvType.CV_8UC1); mask.setTo(Scalar(0.0))
    val poly = MatOfPoint(*p.map { Point(it.x*w,it.y*h) }.toTypedArray())
    try { Imgproc.fillConvexPoly(mask, poly, Scalar(255.0)) } finally { poly.release() }
    // Erode away the paper boundary: measure detail in the page, not the desk edge.
    Imgproc.erode(mask,mask,kernel,Point(-1.0,-1.0),3)
    val brightness = Core.mean(small,mask).`val`[0]/255.0
    Imgproc.Laplacian(small,lap,CvType.CV_32F)
    val avg = MatOfDouble(); val std = MatOfDouble()
    val variance = try { Core.meanStdDev(lap,avg,std,mask); std.toArray()[0].pow(2) } finally { avg.release(); std.release() }
    Imgproc.threshold(small,clipped,252.0,255.0,Imgproc.THRESH_BINARY)
    Core.bitwise_and(clipped,mask,clipped)
    val clippedRatio = Core.countNonZero(clipped).toDouble()/max(1,Core.countNonZero(mask))
    // Clipping alone cannot distinguish white paper from glare; only flag severe clipping.
    val glare = if (clippedRatio > .65 && brightness > .92) clippedRatio else 0.0
    return DetectedPage(p,bestScore,area(p),variance,brightness,glare,geometry(p.map{Point(it.x*w,it.y*h)}),p.all { it.x in .018.. .982 && it.y in .018.. .982 })
  }

  override fun close() { listOf(small,smooth,edges,closed,hierarchy,mask,lap,clipped,kernel).forEach { it.release() } }
  companion object {
    fun distance(a: Point,b: Point) = hypot(a.x-b.x,a.y-b.y)
    fun displacement(a: List<Point>,b: List<Point>) = a.indices.maxOf { distance(a[it],b[it]) }
    fun area(p: List<Point>) = abs(p.indices.sumOf { p[it].x*p[(it+1)%4].y-p[(it+1)%4].x*p[it].y })/2
    fun order(points: List<Point>): List<Point> {
      require(points.size == 4)
      val cx=points.sumOf { it.x }/4; val cy=points.sumOf { it.y }/4
      val sorted=points.sortedBy { atan2(it.y-cy,it.x-cx) }
      val start=sorted.indices.minBy { sorted[it].x+sorted[it].y }
      return (0..3).map { sorted[(start+it)%4] }
    }
    fun geometry(p: List<Point>): Double {
      val cosines=p.indices.map { i ->
        val a=p[(i+3)%4];val b=p[i];val c=p[(i+1)%4]
        abs(((a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y))/max(.00001,distance(a,b)*distance(c,b)))
      }
      return (1-cosines.max()).coerceIn(0.0,1.0)
    }
  }
}
