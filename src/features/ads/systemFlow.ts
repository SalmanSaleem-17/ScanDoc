// The app hands control to system UI it opened itself: file and folder
// pickers, the share sheet, the image library, the system Settings page or
// the browser for the privacy policy. Android reports that as the app going
// to the background, so coming back would look like a "return after an
// absence" and could be met with an app-open ad. Marking the hand-off here
// lets the ads policy tell the two apart. The mark expires on its own in case
// the return is never observed.
const WINDOW_MS = 30 * 60 * 1000;
let until = 0;

export function beginSystemFlow(now = Date.now()) {
  until = now + WINDOW_MS;
}
export function inSystemFlow(now = Date.now()) {
  return now < until;
}
export function endSystemFlow() {
  until = 0;
}
