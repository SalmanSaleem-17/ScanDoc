package expo.modules.scandoc

import android.graphics.Bitmap
import com.googlecode.leptonica.android.AdaptiveMap
import com.googlecode.leptonica.android.Binarize
import com.googlecode.leptonica.android.Convert
import com.googlecode.leptonica.android.Pix
import com.googlecode.leptonica.android.ReadFile
import com.googlecode.leptonica.android.Rotate
import com.googlecode.leptonica.android.Scale
import com.googlecode.leptonica.android.Skew
import com.googlecode.tesseract.android.TessBaseAPI
import kotlin.math.abs
import kotlin.math.max

/**
 * Tesseract is built for clean, upright, bitonal text; a camera photo is none
 * of those. Pages are therefore normalised before recognition: lighting is
 * flattened, the page is binarised and small skew is corrected.
 *
 * Leptonica Pix objects wrap native memory that the garbage collector does not
 * manage, so every intermediate is released explicitly.
 */
object Ocr {
  // Body text recognition degrades below roughly 300 dpi; 3000px on the long
  // edge is about 260 dpi for A4, and the fallback covers low-memory devices.
  const val ANALYSIS_EDGE = 3000
  const val FALLBACK_EDGE = 1800
  // Orientation is probed on a small copy so four extra passes stay cheap.
  private const val PROBE_EDGE = 1000
  // Below this the angle is noise: Tesseract tolerates a fraction of a degree
  // easily, and rotating anyway only adds fill artefacts at the edges. Above
  // MAX_SKEW the estimate is unreliable and a wrong rotation is worse than none.
  private const val MIN_SKEW = 0.5f
  private const val MAX_SKEW = 12f
  // Thin strokes classify poorly, so small pages are doubled first.
  private const val UPSCALE_BELOW = 1500

  fun pageSegMode(name: String?): Int = when (name) {
    "block" -> TessBaseAPI.PageSegMode.PSM_SINGLE_BLOCK
    "line" -> TessBaseAPI.PageSegMode.PSM_SINGLE_LINE
    "sparse" -> TessBaseAPI.PageSegMode.PSM_SPARSE_TEXT
    "column" -> TessBaseAPI.PageSegMode.PSM_SINGLE_COLUMN
    // Full page layout analysis. The Tesseract C++ API otherwise defaults to a
    // single block, which loses columns, headers and reading order.
    else -> TessBaseAPI.PageSegMode.PSM_AUTO
  }

  private fun replace(old: Pix, next: Pix?): Pix {
    if (next == null || next === old) return old
    old.recycle()
    return next
  }

  /** Grey, lighting-corrected, optionally deskewed, binarised page. */
  fun prepare(bitmap: Bitmap, deskew: Boolean): Pix {
    var working = ReadFile.readBitmap(bitmap)
      ?: throw IllegalStateException("Could not read this page.")
    try {
      working = replace(working, Convert.convertTo8(working))
      // Removes shadows and uneven lighting. This is the largest single gain
      // on photographs of paper.
      working = replace(working, AdaptiveMap.backgroundNormMorph(working))
      if (max(working.width, working.height) < UPSCALE_BELOW)
        working = replace(working, Scale.scale(working, 2f))
      var binary = Binarize.otsuAdaptiveThreshold(working)
        ?: throw IllegalStateException("Could not prepare this page.")
      if (deskew) {
        val angle = Skew.findSkew(binary)
        if (angle.isFinite() && abs(angle) >= MIN_SKEW && abs(angle) <= MAX_SKEW) {
          // Rotate the grey page and binarise again: rotating 1bpp pixels
          // frays character edges and costs more accuracy than the skew did.
          // Skew.findSkew reports degrees but Rotate.rotate takes radians, as
          // Leptonica's pixRotate does. Passing degrees straight through spins
          // the page far enough to throw the text off the canvas and returns
          // nothing at all; an instrumentation test covers this.
          val rotated = Rotate.rotate(working, Math.toRadians(angle.toDouble()).toFloat())
          if (rotated != null) {
            try {
              val cleaned = Binarize.otsuAdaptiveThreshold(rotated)
              if (cleaned != null) {
                binary.recycle()
                binary = cleaned
              }
            } finally {
              rotated.recycle()
            }
          }
        }
      }
      return binary
    } finally {
      working.recycle()
    }
  }

  private val WHITESPACE = Regex("\\s+")
  private val PUNCTUATION = charArrayOf(
    '.', ',', ':', ';', '!', '?', '"', '\'', '(', ')', '[', ']', '{', '}', '-',
  )

  /**
   * Counts tokens that look like ordinary words: a letter followed by lower
   * case. Measured on an upside-down page, Tesseract reported 87/100 mean
   * confidence for pure nonsense, so its own confidence cannot detect a flipped
   * page. Reversed text is instead full of mid-word capitals and stray symbols
   * ("SSauISNG INOK 40} NOK yueyy"), which this separates cleanly: the same page
   * scored 1 upside down and 7 the right way up.
   */
  fun plausibleWords(text: String): Int {
    var count = 0
    for (token in text.split(WHITESPACE)) {
      val word = token.trim(*PUNCTUATION)
      if (word.length < 3 || !word[0].isLetter()) continue
      var lower = true
      for (index in 1 until word.length)
        if (!word[index].isLowerCase()) {
          lower = false
          break
        }
      if (lower) count++
    }
    return count
  }

  /** A page worth a second opinion about its orientation. */
  fun looksUnreadable(text: String, confidence: Int): Boolean =
    plausibleWords(text) < 3 || confidence < 55

  /**
   * The bundled model has no osd data, so orientation is found by trying the
   * four quarter turns on a downscaled copy and keeping the one that yields the
   * most ordinary words. Ties keep the smaller rotation. Returns degrees.
   *
   * Tesseract's layout analysis already re-reads sideways text on its own, so
   * more than one turn can read correctly; the point of this is the upside-down
   * case, which it does not recover from.
   */
  fun probeRotation(tess: TessBaseAPI, binary: Pix, checkpoint: () -> Unit): Int {
    val edge = max(binary.width, binary.height)
    val small =
      if (edge > PROBE_EDGE) Scale.scale(binary, PROBE_EDGE.toFloat() / edge) else null
    val base = small ?: binary
    try {
      var bestDegrees = 0
      var bestScore = -1
      for (quarter in 0..3) {
        checkpoint()
        val candidate = if (quarter == 0) base else Rotate.rotateOrth(base, quarter)
        if (candidate == null) continue
        try {
          tess.setImage(candidate)
          val candidateScore = plausibleWords(tess.getUTF8Text() ?: "")
          // Strictly greater, so an equally readable turn never displaces a
          // smaller one.
          if (candidateScore > bestScore) {
            bestScore = candidateScore
            bestDegrees = quarter * 90
          }
        } finally {
          if (candidate !== base) candidate.recycle()
        }
      }
      return bestDegrees
    } finally {
      small?.recycle()
    }
  }

  fun turn(binary: Pix, degrees: Int): Pix? =
    if (degrees == 0) null else Rotate.rotateOrth(binary, degrees / 90)
}
