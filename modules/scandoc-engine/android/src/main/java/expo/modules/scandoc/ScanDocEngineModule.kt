package expo.modules.scandoc

import android.graphics.*
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.googlecode.tesseract.android.TessBaseAPI
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class ScanDocEngineModule : Module() {
  private val worker = Executors.newSingleThreadExecutor()
  private val cancelled = ConcurrentHashMap.newKeySet<String>()
  override fun definition() = ModuleDefinition {
    Name("ScanDocEngine")
    Events("progress")
    Constant("supportsLiveDetection") { true }
    View(DocumentCameraView::class) {
      Events("onDetection", "onReady", "onError")
      OnViewDestroys { view -> view.dispose() }
      Prop("active") { view: DocumentCameraView, value: Boolean -> view.cameraActive = value }
      Prop("flash") { view: DocumentCameraView, value: String -> view.setFlash(value) }
      AsyncFunction("capture") { view: DocumentCameraView, automatic: Boolean, promise: Promise -> view.capture(automatic, promise) }
    }
    Function("cancel") { id: String -> cancelled.add(id); Unit }
    AsyncFunction("process") { operation: String, payload: String, id: String, promise: Promise ->
      worker.execute {
        var job: File? = null
        try {
          require(id.matches(Regex("[a-zA-Z0-9-]{1,80}")))
          val context = requireNotNull(appContext.reactContext)
          job = File(context.cacheDir, "ScanDocEngine/$id").apply { mkdirs() }
          fun checkpoint() { if (cancelled.contains(id)) throw InterruptedException() }
          fun progress(done: Int, total: Int) { checkpoint(); sendEvent("progress", mapOf("id" to id, "completed" to done, "total" to total)) }
          val args = JSONObject(payload)
          val images = Images(context, job)
          checkpoint()
          val result = when (operation) {
            "detect" -> images.detect(args.getString("uri"))
            "quality" -> images.quality(args.getString("uri"))
            "edit" -> images.edit(args)
            "book" -> images.book(args)
            "compare" -> images.compare(args)
            "ocr" -> {
              val tessDir = File(context.filesDir, "ocr/tessdata").apply { mkdirs() }
              val trained = File(tessDir, "eng.traineddata")
              if (!trained.exists()) {
                val partial = File(tessDir, "eng.partial")
                try {
                  context.assets.open("tessdata/eng.traineddata").use { input -> partial.outputStream().use { input.copyTo(it) } }
                  check(partial.renameTo(trained))
                } finally { partial.delete() }
              }
              val tess = TessBaseAPI()
              try {
                check(tess.init(tessDir.parent, "eng"))
                tess.setPageSegMode(Ocr.pageSegMode(args.optString("layout", "auto")))
                // Without this Tesseract estimates the source resolution and a
                // wrong estimate measurably changes the result.
                tess.setVariable("user_defined_dpi", args.optInt("dpi", 300).coerceIn(70, 2400).toString())
                val clean = args.optBoolean("preprocess", true)
                val uri = args.getString("uri")
                val bitmap = try {
                  images.load(uri, if (clean) Ocr.ANALYSIS_EDGE else 2400)
                } catch (error: OutOfMemoryError) {
                  images.load(uri, Ocr.FALLBACK_EDGE)
                }
                val page = try {
                  if (clean) Ocr.prepare(bitmap, args.optBoolean("deskew", true))
                  else requireNotNull(com.googlecode.leptonica.android.ReadFile.readBitmap(bitmap))
                } finally { bitmap.recycle() }
                try {
                  checkpoint()
                  tess.setImage(page)
                  var text = tess.getUTF8Text() ?: ""
                  var confidence = tess.meanConfidence()
                  var rotation = 0
                  // Only pay for the orientation probe when the upright read
                  // looks unusable, so the common case stays a single pass.
                  if (args.optBoolean("autoRotate", true) && Ocr.looksUnreadable(text, confidence)) {
                    checkpoint()
                    rotation = Ocr.probeRotation(tess, page) { checkpoint() }
                    val turned = Ocr.turn(page, rotation)
                    if (turned != null) {
                      try {
                        tess.setImage(turned)
                        text = tess.getUTF8Text() ?: ""
                        confidence = tess.meanConfidence()
                      } finally { turned.recycle() }
                    } else rotation = 0
                  }
                  checkpoint()
                  JSONObject().put("text", text).put("confidence", confidence).put("rotation", rotation)
                } finally { page.recycle() }
              } finally { tess.recycle() }
            }
            "pdfInfo" -> {
              val descriptor = ParcelFileDescriptor.open(images.file(args.getString("uri")), ParcelFileDescriptor.MODE_READ_ONLY)
              descriptor.use { fd -> PdfRenderer(fd).use { pdf -> JSONObject().put("pages", pdf.pageCount) } }
            }
            "render" -> {
              val descriptor = ParcelFileDescriptor.open(images.file(args.getString("uri")), ParcelFileDescriptor.MODE_READ_ONLY)
              descriptor.use { fd -> PdfRenderer(fd).use { pdf ->
                val index = args.getInt("page"); require(index in 0 until pdf.pageCount)
                pdf.openPage(index).use { page ->
                  val scale = 1800.0 / maxOf(page.width, page.height)
                  val bitmap = Bitmap.createBitmap(maxOf(1, (page.width * scale).toInt()), maxOf(1, (page.height * scale).toInt()), Bitmap.Config.ARGB_8888)
                  try {
                    bitmap.eraseColor(Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    JSONObject().put("uri", images.save(bitmap)).put("pages", pdf.pageCount)
                  } finally { bitmap.recycle() }
                }
              } }
            }
            "pdf" -> {
              val sources = args.getJSONArray("uris"); require(sources.length() in 1..300)
              val target = args.optLong("targetBytes", 0)
              // A short line of text stamped on every page (the free tier's
              // watermark); empty means none. Drawn onto the page image, so it
              // survives any viewer and cannot be stripped as a PDF object.
              val watermark = args.optString("watermark", "").trim()
              val output = File(job, "document.pdf")
              val attempts = if (target > 0) listOf(1800 to 85, 1500 to 70, 1200 to 55, 950 to 40, 750 to 30) else listOf(2000 to 90)
              var usedWidth = 2000; var usedQuality = 90
              for ((attempt, settings) in attempts.withIndex()) {
                usedWidth = settings.first; usedQuality = settings.second
                PdfWriter.write(output, sources.length(), { page ->
                  checkpoint()
                  val bitmap = images.load(sources.getString(page), usedWidth).let { if (watermark.isEmpty()) it else images.stamp(it, watermark) }
                  try {
                    val jpeg = File(job, "page.jpg")
                    jpeg.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.JPEG, usedQuality, it)) }
                    PdfWriter.Page(jpeg, bitmap.width, bitmap.height)
                  } finally { bitmap.recycle() }
                }, { page -> progress(attempt * sources.length() + page, attempts.size * sources.length()) })
                if (target == 0L || output.length() <= target) break
              }
              File(job, "page.jpg").delete()
              JSONObject().put("uri", Uri.fromFile(output).toString()).put("size", output.length()).put("pages", sources.length()).put("targetMet", target == 0L || output.length() <= target).put("maxEdge", usedWidth).put("quality", usedQuality)
            }
            "reportPage" -> images.reportPage(args)
            else -> throw IllegalArgumentException("Unsupported operation")
          }
          checkpoint()
          promise.resolve(result.toString())
        } catch (error: Exception) {
          job?.deleteRecursively()
          // Never bridge raw errors: parser exceptions may contain private file paths.
          promise.reject(if (error is InterruptedException) "CANCELLED" else "PROCESSING_FAILED", if (error is InterruptedException) "Operation cancelled." else "Could not process this file. Check its format, available storage, and whether the PDF is password protected.", null)
        } catch (error: OutOfMemoryError) {
          job?.deleteRecursively()
          promise.reject("MEMORY_LIMIT", "This file is too large for available memory. Try a smaller image.", null)
        } finally { cancelled.remove(id) }
      }
    }
  }
}
