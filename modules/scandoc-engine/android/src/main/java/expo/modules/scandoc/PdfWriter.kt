package expo.modules.scandoc

import java.io.File
import java.io.RandomAccessFile
import java.util.Locale

/** Image-only PDF. Streams a single JPEG at a time; no source text, EXIF, or attachments survive. */
object PdfWriter {
  data class Page(val jpeg: File, val width: Int, val height: Int)
  fun write(output: File, count: Int, pageAt: (Int) -> Page, progress: (Int) -> Unit) {
    RandomAccessFile(output, "rw").use { out ->
      out.setLength(0)
      fun text(value: String) { out.write(value.toByteArray(Charsets.US_ASCII)) }
      val offsets = LongArray(3 + count * 3)
      fun obj(id: Int, value: String) { offsets[id] = out.filePointer; text("$id 0 obj\n$value\nendobj\n") }
      text("%PDF-1.4\n")
      obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
      obj(2, "<< /Type /Pages /Count $count /Kids [${(0 until count).joinToString(" ") { "${3 + it * 3} 0 R" }}] >>")
      for (index in 0 until count) {
        val page = pageAt(index); val id = 3 + index * 3
        val width = if (page.width > page.height) 842 else 595
        val height = if (page.width > page.height) 595 else 842
        val scale = minOf(width.toDouble() / page.width, height.toDouble() / page.height)
        val w = page.width * scale; val h = page.height * scale
        val content = String.format(Locale.US, "q %.3f 0 0 %.3f %.3f %.3f cm /Im0 Do Q\n", w, h, (width - w) / 2, (height - h) / 2)
        obj(id, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $width $height] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>")
        offsets[id + 1] = out.filePointer
        text("${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length()} >>\nstream\n")
        page.jpeg.inputStream().use { input -> val buffer = ByteArray(65536); while (true) { val read = input.read(buffer); if (read < 0) break; out.write(buffer, 0, read) } }
        text("\nendstream\nendobj\n")
        obj(id + 2, "<< /Length ${content.toByteArray(Charsets.US_ASCII).size} >>\nstream\n${content}endstream")
        progress(index + 1)
      }
      val xref = out.filePointer
      text("xref\n0 ${offsets.size}\n0000000000 65535 f \n")
      for (index in 1 until offsets.size) text(String.format(Locale.US, "%010d 00000 n \n", offsets[index]))
      text("trailer\n<< /Size ${offsets.size} /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n")
    }
  }
}
