package expo.modules.scandoc

import android.content.Context
import android.graphics.*
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import kotlin.math.*

class Images(private val context: Context, private val job: File) {
  fun file(uri: String): File {
    val parsed = Uri.parse(uri); require(parsed.scheme == "file")
    val file = File(requireNotNull(parsed.path)).canonicalFile
    require(listOf(context.filesDir, context.cacheDir).any { file.path.startsWith(it.canonicalPath + File.separator) })
    require(file.isFile)
    return file
  }
  fun load(uri: String, edge: Int): Bitmap {
    val input = file(uri)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(input.path, bounds)
    require(bounds.outWidth > 0 && bounds.outHeight > 0)
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= edge) sample *= 2
    var bitmap = requireNotNull(BitmapFactory.decodeFile(input.path, BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }))
    val exif = ExifInterface(input)
    val matrix = Matrix()
    if (exif.isFlipped) matrix.postScale(-1f, 1f)
    matrix.postRotate(exif.rotationDegrees.toFloat())
    if (!matrix.isIdentity) {
      val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      if (rotated !== bitmap) bitmap.recycle()
      bitmap = rotated
    }
    val scale = edge.toDouble() / maxOf(bitmap.width, bitmap.height)
    if (scale < 1) {
      val resized = Bitmap.createScaledBitmap(bitmap, maxOf(1, (bitmap.width * scale).toInt()), maxOf(1, (bitmap.height * scale).toInt()), true)
      if (resized !== bitmap) bitmap.recycle()
      bitmap = resized
    }
    return bitmap
  }
  /**
   * Draws a small label in the bottom-right corner: light text on a soft dark
   * pill, sized from the page width so it reads the same on any page. Returns
   * a mutable copy when the source cannot be drawn on, recycling the source.
   */
  fun stamp(source: Bitmap, text: String): Bitmap {
    val bitmap = if (source.isMutable) source else source.copy(Bitmap.Config.ARGB_8888, true).also { source.recycle() }
    val canvas = Canvas(bitmap)
    val size = (bitmap.width * 0.024f).coerceIn(14f, 48f)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = size; color = Color.WHITE; typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD) }
    val padX = size * 0.8f; val padY = size * 0.45f
    val textWidth = paint.measureText(text)
    val margin = size * 0.9f
    val right = bitmap.width - margin; val bottom = bitmap.height - margin
    val rect = RectF(right - textWidth - padX * 2, bottom - size - padY * 2, right, bottom)
    canvas.drawRoundRect(rect, size * 0.6f, size * 0.6f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(150, 15, 23, 42) })
    canvas.drawText(text, rect.left + padX, rect.bottom - padY - paint.descent() + size * 0.1f, paint)
    return bitmap
  }
  fun save(bitmap: Bitmap): String {
    val output = File(job, "${UUID.randomUUID()}.jpg")
    output.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.JPEG, 95, it)) }
    return Uri.fromFile(output).toString()
  }
  fun detect(uri: String): JSONObject {
    check(org.opencv.android.OpenCVLoader.initLocal())
    val bitmap=load(uri,2000)
    val rgba=org.opencv.core.Mat();val gray=org.opencv.core.Mat()
    try {
      org.opencv.android.Utils.bitmapToMat(bitmap,rgba)
      org.opencv.imgproc.Imgproc.cvtColor(rgba,gray,org.opencv.imgproc.Imgproc.COLOR_RGBA2GRAY)
      val detector=DocumentDetector()
      val page=try{detector.detect(gray,null,1600)}finally{detector.close()}
      val result=JSONObject().put("confidence",page?.confidence?:0.0)
      if(page!=null && page.confidence>=.70)result.put("corners",JSONArray(page.corners.flatMap{listOf(it.x,it.y)}))
      return result
    }finally{bitmap.recycle();rgba.release();gray.release()}
  }
  fun quality(uri: String): JSONObject {
    val b = load(uri, 600)
    try {
      val w = b.width; val h = b.height; val pixels = IntArray(w * h); b.getPixels(pixels, 0, w, 0, 0, w, h)
      fun gray(index: Int): Double { val c = pixels[index]; return Color.red(c) * .299 + Color.green(c) * .587 + Color.blue(c) * .114 }
      var sum = 0.0; var square = 0.0; var bright = 0; var dark = 0; var count = 0; var edgeInk = 0; var edgeCount = 0
      for (y in 1 until h - 1) for (x in 1 until w - 1) {
        val i = y * w + x; val g = gray(i)
        val lap = gray(i - 1) + gray(i + 1) + gray(i - w) + gray(i + w) - 4 * g
        sum += lap; square += lap * lap; count++
        if (g > 250) bright++
        if (g < 45) dark++
        if (x < w * .025 || x > w * .975 || y < h * .025 || y > h * .975) { edgeCount++; if (g < 90) edgeInk++ }
      }
      val variance = if (count > 0) square / count - (sum / count).pow(2) else 0.0
      val issues = JSONArray()
      if (variance < 65) issues.put("Possible blur or low detail. Hold steady and tap to focus before retaking.")
      if (bright > count * .45) issues.put("Large bright areas. Check for glare or washed-out text; white paper can also cause this warning.")
      if (dark > count * .35) issues.put("The page looks dark. Add even lighting and avoid casting a shadow.")
      if (edgeCount > 0 && edgeInk > edgeCount * .18) issues.put("Content may touch the frame. Check that all page edges are visible.")
      return JSONObject().put("issues", issues).put("sharpness", variance).put("heuristic", true)
    } finally { b.recycle() }
  }
  fun edit(args: JSONObject): JSONObject {
    val source = load(args.getString("uri"), 2600)
    var bitmap = source
    try {
      val points = args.optJSONArray("corners")
      if (points != null) {
        require(points.length() == 8)
        val src = FloatArray(8) { i -> val value = points.getDouble(i); require(value.isFinite() && value in 0.0..1.0); (value * if (i % 2 == 0) source.width else source.height).toFloat() }
        fun length(a: Int, b: Int) = hypot((src[a] - src[b]).toDouble(), (src[a + 1] - src[b + 1]).toDouble())
        val width = maxOf(length(0, 2), length(6, 4)).toInt().coerceAtLeast(32)
        val height = maxOf(length(0, 6), length(2, 4)).toInt().coerceAtLeast(32)
        val transform = Matrix(); require(transform.setPolyToPoly(src, 0, floatArrayOf(0f, 0f, width.toFloat(), 0f, width.toFloat(), height.toFloat(), 0f, height.toFloat()), 0, 4))
        bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        Canvas(bitmap).apply { drawColor(Color.WHITE); drawBitmap(source, transform, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)) }
      } else bitmap = source.copy(Bitmap.Config.ARGB_8888, true)
      if (args.optBoolean("enhance", false)) {
        val enhanced = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888)
        val matrix = ColorMatrix(floatArrayOf(1.18f,0f,0f,0f,-12f, 0f,1.18f,0f,0f,-12f, 0f,0f,1.18f,0f,-12f, 0f,0f,0f,1f,0f))
        Canvas(enhanced).drawBitmap(bitmap, 0f, 0f, Paint().apply { colorFilter = ColorMatrixColorFilter(matrix) })
        bitmap.recycle(); bitmap = enhanced
      }
      val regions = args.optJSONArray("redactions") ?: JSONArray()
      val canvas = Canvas(bitmap); val paint = Paint().apply { color = Color.BLACK; isAntiAlias = false }
      for (i in 0 until regions.length()) {
        val r = regions.getJSONArray(i); require(r.length() == 4)
        val x = r.getDouble(0); val y = r.getDouble(1); val w = r.getDouble(2); val h = r.getDouble(3)
        require(listOf(x,y,w,h).all { it.isFinite() } && x >= 0 && y >= 0 && w > 0 && h > 0 && x+w <= 1.001 && y+h <= 1.001)
        // Expand two pixels to avoid interpolation leaving readable boundary pixels.
        canvas.drawRect((x*bitmap.width-2).toFloat(), (y*bitmap.height-2).toFloat(), ((x+w)*bitmap.width+2).toFloat(), ((y+h)*bitmap.height+2).toFloat(), paint)
      }
      return JSONObject().put("uri", save(bitmap)).put("width", bitmap.width).put("height", bitmap.height)
    } finally { if (bitmap !== source) bitmap.recycle(); source.recycle() }
  }
  fun book(args: JSONObject): JSONObject {
    val b = load(args.getString("uri"), 2600)
    val outputs = JSONArray()
    try {
      val split = args.optDouble("split", .5); require(split in .2.. .8)
      val curve = args.optDouble("curve", 0.0); require(curve in -.18.. .18)
      val divider = (b.width * split).toInt()
      for ((side, range) in listOf(0 to divider, divider to b.width).withIndex()) {
        val width = range.second - range.first
        val page = Bitmap.createBitmap(width, b.height, Bitmap.Config.ARGB_8888)
        try {
          // Manual vertical bow correction; the user previews and adjusts the curve.
          val row = IntArray(width)
          for (y in 0 until b.height) {
            for (x in 0 until width) {
              val nearSpine = if (side == 0) x.toDouble()/width else 1-x.toDouble()/width
              val bow = curve * b.height * nearSpine.pow(2) * sin(PI*y/b.height)
              val sy = (y + bow).roundToInt()
              row[x] = if (sy in 0 until b.height) b.getPixel(range.first+x, sy) else Color.WHITE
            }
            page.setPixels(row, 0, width, 0, y, width, 1)
          }
          outputs.put(save(page))
        } finally { page.recycle() }
      }
      if (args.optBoolean("rtl", false)) return JSONObject().put("uris", JSONArray().put(outputs.getString(1)).put(outputs.getString(0)))
      return JSONObject().put("uris", outputs)
    } finally { b.recycle() }
  }
  fun compare(args: JSONObject): JSONObject {
    val a = load(args.getString("first"), 1200); val originalB = load(args.getString("second"), 1200)
    val b = Bitmap.createScaledBitmap(originalB, a.width, a.height, true)
    val output = a.copy(Bitmap.Config.ARGB_8888, true)
    try {
      var changed = 0
      val row = IntArray(a.width)
      for (y in 0 until a.height) {
        for (x in 0 until a.width) {
          val c = a.getPixel(x,y); val d = b.getPixel(x,y)
          val delta = (abs(Color.red(c)-Color.red(d))+abs(Color.green(c)-Color.green(d))+abs(Color.blue(c)-Color.blue(d))) / 3
          if (delta > 45) { row[x] = Color.rgb(230, 70, 90); changed++ } else { val g = (Color.red(c)+Color.green(c)+Color.blue(c))/3; row[x] = Color.rgb(g,g,g) }
        }
        output.setPixels(row, 0, a.width, 0, y, a.width, 1)
      }
      return JSONObject().put("uri", save(output)).put("changedPercent", changed*100.0/(a.width*a.height))
    } finally { a.recycle(); b.recycle(); if (b !== originalB) originalB.recycle(); output.recycle() }
  }
  fun reportPage(args: JSONObject): JSONObject {
    val lines = args.getJSONArray("lines"); require(lines.length() <= 38)
    val bitmap = Bitmap.createBitmap(1240, 1754, Bitmap.Config.ARGB_8888)
    try {
      val canvas = Canvas(bitmap); canvas.drawColor(Color.WHITE)
      val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(6,26,64); textSize = 26f; typeface = Typeface.create("sans-serif", Typeface.NORMAL) }
      for (i in 0 until lines.length()) canvas.drawText(lines.getString(i).take(85), 60f, 90f + i*42, paint)
      return JSONObject().put("uri", save(bitmap))
    } finally { bitmap.recycle() }
  }
}
