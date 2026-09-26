package expo.modules.scandoc

import org.opencv.core.Point
import kotlin.math.*

data class TrackingResult(val quad: List<Point>?, val state: String, val guidance: String,
  val progress: Double, val ready: Boolean, val motion: Double, val page: DetectedPage?)

/** All timers use monotonic time. Missing/poor frames always revoke readiness immediately. */
class DocumentTracker {
  private var raw: List<Point>? = null
  private var smoothed: List<Point>? = null
  private var lastSeen = 0L; private var stableSince = 0L; private var frames = 0
  private var locked: List<Point>? = null; private var missingSince = 0L
  private var changeSince = 0L
  private var message = "SEARCHING"; private var pending = message; private var pendingSince = 0L
  private var focusUntil = 0L
  // The last three raw quads; the median of them is what gets smoothed, so a
  // single frame where the detector snapped to a table edge or a shadow
  // cannot move the overlay or reset stability.
  private val recent = ArrayDeque<List<Point>>()
  fun focus(now: Long) { focusUntil=now+1000; stableSince=0; frames=0 }
  fun captured() { locked=raw?.map { Point(it.x,it.y) }; stableSince=0; frames=0 }
  fun reset() { raw=null;smoothed=null;lastSeen=0;stableSince=0;frames=0;missingSince=0;changeSince=0;recent.clear() }
  private fun median(p: List<Point>): List<Point> {
    recent.addLast(p); while(recent.size>3) recent.removeFirst()
    if(recent.size<3) return p
    return p.indices.map { i -> Point(recent.map { it[i].x }.sorted()[1], recent.map { it[i].y }.sorted()[1]) }
  }
  fun update(page: DetectedPage?, now: Long): TrackingResult {
    if(page==null) {
      stableSince=0; frames=0
      if(missingSince==0L) missingSince=now
      if(now-missingSince>700) {locked=null;raw=null}
      if(now-lastSeen>300) smoothed=null
      return TrackingResult(smoothed,if(locked!=null) "WAITING_FOR_CHANGE" else "SEARCHING",guide(if(locked!=null) "NEXT_PAGE" else "SEARCHING",now),0.0,false,1.0,null)
    }
    missingSince=0
    if(now-lastSeen>350) recent.clear()
    val p=median(page.corners)
    val motion=raw?.let { DocumentDetector.displacement(p,it) } ?: 1.0
    val same=raw!=null && motion<.12 && now-lastSeen<350
    // Heavy smoothing while the page is still; a quick catch-up when it
    // genuinely moves, but never so quick that the overlay jitters.
    val alpha=if(motion<.006) .18 else if(motion<.03) .35 else .6
    smoothed=if(same && smoothed!=null) p.indices.map { i -> Point(smoothed!![i].x*(1-alpha)+p[i].x*alpha,smoothed!![i].y*(1-alpha)+p[i].y*alpha) } else p
    raw=p;lastSeen=now
    locked?.let { captured ->
      if(DocumentDetector.displacement(p,captured)>.14) {
        if(changeSince==0L)changeSince=now
        if(now-changeSince>500){locked=null;changeSince=0}
      } else changeSince=0
    }
    val reason=when {
      locked!=null -> "NEXT_PAGE"
      !page.fullyVisible -> "FIT_DOCUMENT"
      page.brightness<.20 -> "MORE_LIGHT"
      page.glare>.65 -> "REDUCE_GLARE"
      page.coverage<.12 -> "MOVE_CLOSER"
      page.coverage>.88 -> "MOVE_FARTHER"
      page.perspective<.48 -> "REDUCE_ANGLE"
      page.sharpness<55 || motion>.012 || !same || now<focusUntil -> "HOLD_STEADY"
      page.confidence<.78 -> "HOLD_STEADY"
      else -> "READY"
    }
    if(reason=="READY") { if(stableSince==0L)stableSince=now;frames++ } else {stableSince=0;frames=0}
    // A confident, sharp, still page is captured after 0.7 s; a marginal one
    // must hold for longer, so the shot is taken from a steady hand.
    val duration=if(page.confidence>.9 && page.sharpness>90)700.0 else if(page.confidence>.84)1000.0 else 1400.0
    val progress=if(stableSince==0L)0.0 else ((now-stableSince)/duration).coerceIn(0.0,1.0)
    val ready=progress>=1 && frames>=6
    val state=when {locked!=null->"WAITING_FOR_CHANGE";ready->"CAPTURE_READY";progress>.1->"STABLE";same->"TRACKING";else->"DETECTED"}
    return TrackingResult(smoothed,state,guide(if(reason=="READY" && !ready) "HOLD_STEADY" else reason,now),progress,ready,motion,page)
  }
  private fun guide(next: String,now: Long): String {
    if(next!=pending){pending=next;pendingSince=now}
    if(now-pendingSince>=250 || next=="NEXT_PAGE")message=next
    return message
  }
}
