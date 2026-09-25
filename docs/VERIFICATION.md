# Verification — advanced workflows

Verified in the current workspace:

- `npm run typecheck`: passed.
- `npm test`: 43 tests passed (originally 32), including the Documents/Tools raw-text regression check, the PDF page-range/split-planning tests, and the crop geometry tests.
- `expo install --check`: compatible SDK 57 dependency versions.
- `expo export --platform android`: successful Hermes bundle export after the latest application changes.
- Android engine Kotlin compilation: passed, including the new OCR preparation module. The compiler confirms every Leptonica and Tesseract signature used (`ReadFile.readBitmap`, `Convert.convertTo8`, `AdaptiveMap.backgroundNormMorph`, `Scale.scale`, `Binarize.otsuAdaptiveThreshold`, `Skew.findSkew`, `Rotate.rotate`, `Rotate.rotateOrth`, `TessBaseAPI.setPageSegMode`, `setVariable`, `setImage(Pix)`).
- `:scandoc-engine:connectedDebugAndroidTest -PreactNativeArchitectures=x86_64 --max-workers=2`: **BUILD SUCCESSFUL**, 15 tests passed on Pixel 7 API 34 / Android 14 emulator, including the two new OCR tests.

Native tests verify:

1. Redaction replaces pixels while preserving the original source file.
2. Generated three-page PDFs parse and render in Android PdfRenderer; output omits source text and embedded-file structures.
3. Book splitting produces two pages; pixel comparison recognizes identical and changed images.
4. Bundled English OCR recognizes synthetic printed text offline.

The instrumentation tests are Java because Kotlin test friend-path serialization breaks on comma-containing Windows directories. Production engine code remains Kotlin. No project-folder rename is required for these checks.

The merge, split and PDF-to-image workflows added in this change reuse the already-tested native `pdfInfo`, `render` and `pdf` operations; no new native code was introduced, so the existing engine test results still apply. Their page-selection and split-planning logic is covered by unit tests, but the end-to-end flows have only been verified by typecheck and Android bundle export, not on a device.

The crop editor's geometry is unit tested, including a test asserting that its live validity guard agrees with `validCorners`, the rule applied at export time; the editor therefore cannot present a crop that the export step would reject. That the shared geometry and the gesture callbacks actually compile to worklets was checked by running `babel-preset-expo` over both files and counting the generated worklets (12 and 8). Gesture feel, magnifier placement, rotation and detection have not been exercised on a device.

A pre-existing build failure was found and fixed while compiling: `DocumentCameraView.kt` could not resolve `ListenableFuture`, so the native module did not build at all. See DEPENDENCIES.md. Any earlier "Kotlin compilation passed" result predates the camera work and did not cover this file.

**The OCR change was measured, not assumed**, on a Pixel 7 API 34 emulator with a synthetic page that is skewed 4 degrees and lit by a strong left-to-right gradient. All 15 native tests pass.

- Raw photo, previous settings: `Total amount 1232` — wrong digits, and the line `Thank you for your business` was lost entirely.
- After background normalisation: `Total amount 1234.56` and the full closing line. This stage is the one that recovers the shadowed side of the page.

Measuring also found two defects that reasoning had missed:

1. `Skew.findSkew` reports **degrees** but `Rotate.rotate` takes **radians**. Passing the angle straight through rotated the page by about 223 degrees, threw the text off the canvas and returned **empty text for every page**. The first run of the comparison test caught this; a stage-by-stage diagnostic isolated it.
2. An upside-down page recognised as confident nonsense — `SSauISNG INOK 40} NOK yueyy` at **87/100 mean confidence**. The original gate only probed orientation below 65, so it would never have fired. Orientation is now judged by counting ordinary words (a letter followed by lower case), which scored 1 for that nonsense and 7 for the same page upright.

Tesseract re-reads sideways text on its own, so more than one quarter turn can read correctly; the test therefore asserts that the corrected page reads, not that a particular angle was chosen.

These results are from one synthetic fixture on an emulator. They demonstrate the pipeline works and that the defects are fixed; they are not a measurement of accuracy on real documents, which remains outstanding.

The app was built, installed and driven on a Pixel 7 API 34 emulator to check light-mode safe areas. Home, Settings, Tools and the workflow screens all paint the top inset correctly in light mode, including with the device in dark mode and with a tall display cutout enabled. One real defect was found and fixed: the document picker was a react-native Modal, which opens a separate Android window that does not inherit the activity's status bar appearance, so its clock and icons rendered white on the light page and were unreadable. Setting `statusBarTranslucent` corrected the colour but made Android draw a second status bar at the bottom of the modal, so that approach was rejected; the picker is now an overlay inside the app's own window. Screenshots confirm the icons are dark and legible afterwards, and that the back gesture closes the overlay.

Still open from that session: with the full-screen picker overlay visible, the emulator's screenshot shows a second status bar row near the bottom of the screen. It does not appear on any ordinary screen, it did not appear with the previous Modal, and it could not be attributed; check it on a physical device before release.

The app has been run on a physical Android phone through the Expo dev client.
That exercises the real camera, real touch input and real device performance,
which the emulator could not. It is not equivalent to a release build: the dev
client loads JavaScript from Metro rather than the embedded Hermes bundle, runs
with __DEV__ true, and was built for a single architecture. Which flows were
exercised on that phone, and what they produced, is not recorded here.

Advertising: react-native-google-mobile-ads 17.1.0 was integrated with a
consent-first provider, one banner above the tab bar, capped interstitials
after finished tasks, app-open ads only on a return after a real absence, and a
rewarded ad-free hour; the placement rules are unit tested
(tests/ads-policy.test.mjs). The module is loaded through a guarded require so
Expo Go keeps working. Verified at commit time: typecheck, 41 tests, bundle
export, expo-doctor 21/21 and the fingerprint step. Two upstream traps were
handled: the library's Gradle script needs the root-level
react-native-google-mobile-ads key in app.json (a typo in its "key absent"
branch otherwise fails the build), and a stale generated autolinking file had
to be cleared after the package rename. The native side was then confirmed on
the emulator rather than assumed: a local debug build with the SDK succeeded
(Gradle, 17 min), autolinking reported com.scandoc.scanner, and the merged
manifest carries com.google.android.gms.permission.AD_ID and the AdMob
APPLICATION_ID. In the installed dev client, logcat showed the UMP consent
request complete, the Mobile Ads SDK initialise, and four requests marked
"sent from a test device" (the banner plus the interstitial, rewarded and
app-open preloads). Screenshots of Home and Settings show the "Test Ad"
adaptive banner directly above the tab bar with the status bar and the rest of
the layout unchanged; no interstitial appeared during the 90-second warm-up,
as the policy requires.

Production "camera not opening" (2026-09-25). Reproduced on the emulator
with both a local release APK and the debug client: CameraX opened the camera
and the Preview requested its surface, but the preview never reached
STREAMING and the screen stayed black. The native view's PreviewView was in
COMPATIBLE (TextureView) mode and, inside a React Native view tree, the
TextureView it adds on the surface request never received a draw pass. The
fix has three parts in DocumentCameraView.kt: PERFORMANCE (SurfaceView) mode,
explicit onMeasure/onLayout of the children, and a bounded relayout pass
repeated every 250 ms from camera start until the stream state reports
STREAMING. An unguarded requestLayout override tried first re-queued itself
from its own layout pass and produced an ANR; the shipped version queues one
pass at a time and never from inside a pass. Verified with logcat on the
rebuilt debug client: "Surface created / Surface set on Preview" within
300 ms of the first kick, "preview stream state STREAMING" 4 s later, the
edge-detection UI live and the shutter enabled; a page was then captured,
cropped, saved to a PDF and appended to. JavaScript falls back to the
standard expo-camera screen if the native view errors or shows nothing for
20 s (60 s in development builds, where CameraX retries initialisation for a
missing front camera). The emulator's own virtual camera wedged once during
this work (the system Camera app went black too) and needed a reboot; that
was the emulator, not the app.

Expo Go "RNGoogleMobileAdsModule could not be found" red box: Metro reports an
error thrown while loading a module through ErrorUtils rather than returning
it to the caller, so the guarded require never caught it and re-ran on every
render. The loader now asks TurboModuleRegistry for the native module before
requiring the library. Verified in Expo Go: zero occurrences in logcat across
Home, Documents, Tools and Settings.

Library and document screen (verified on the debug client): long-press
selection with Select all, Merge PDF, Save to device and Move to Trash;
document screen as a numbered page grid with a full-screen swipe viewer; Add
appends scanned pages to the same PDF (2 pages · 97 KB after appending, same
id and name); Save to device wrote Download/ScanDoc/Scan_2026-09-25.pdf
through the system folder picker (Android refuses the top-level Download
folder, so the UI explains that a sub-folder is needed); the share sheet now
shows the document's name instead of its stored id. An app-open ad appeared
on return from the folder picker because the picker had been open for more
than three minutes; returns from pickers, share sheets and Settings that the
app opened itself are now excluded from app-open ads (tests/ads-policy.test.mjs).
Still to check on a phone: the thin (~3 dp) black line at the very top of the
screen seen only in the release APK on the emulator, and the whole flow on an
ARM device.

Native ads, rewards and the watermark (2026-09-25). The banner is gone; one
native ad card (NativeAdCard.tsx) is the last item of Home, Tools, Settings
and the Documents list, taking no space until an ad has loaded. Rewards
(rewards.mjs, 6 tests): one rewarded unit buys 15 ad-free minutes (stacking),
4 hours without the PDF watermark, or 4 hours of one premium tool (OCR,
Merge, Split, PDF to Images, Compress PDF, Compare); the gate for a premium
tool appears only when a video can be shown, so Expo Go and users without
consent keep every tool. The watermark ("Scanned with ScanDoc") is drawn onto
each page image by the engine before the PDF is written (Images.stamp), so it
survives any viewer; every "pdf" call site passes ads.pdfWatermark. Typecheck
and 49 tests pass; the debug build compiled with the engine change.

On the emulator the native ad never rendered: the SDK logged "Incorrect
native ad response. Click actions were not properly specified" and the
library reported [googleMobileAds/internal-error] for both the NATIVE and
NATIVE_VIDEO test units, while banner, interstitial, rewarded and app-open
test units load on the same device. The card handles that by never appearing
(one retry after 20 s, then nothing), so the screens are unaffected. An ANR
trace read as root showed the SDK decoding that response on the main thread
(Uri.decode inside play-services-ads 25.4.0), which on this loaded emulator
exceeded the input timeout; on a phone the same work takes milliseconds. To
confirm on a device: open Home in the debug build and expect a "Test Ad"
native card at the bottom within a few seconds; if the same log line appears
there, the native unit or its format settings in AdMob need attention (the
production unit is Native Advanced, ca-app-pub-5067154930063661/1204296600).
Follow-up the same day: the Merge gate rendered on the emulator with the
video button enabled, the rewarded test video played to its end card, and
the rewards rows in Settings rendered (durations now 15 min / 4 h / 4 h).
The end card's close control never became reachable on the emulator (its
WebView also drew the video black), so the unlock could not be completed
there; the flow up to the reward is verified, the grant itself is covered by
tests/rewards.test.mjs and needs one run on a phone. While the four tab
screens each requested their own native ad, the app ANR'd repeatedly on
Home under emulator load; the card now shares a single request across all
cards, deferred until after first paint and JS idle, with one retry and a
three-minute refresh. Images now save to the gallery through
expo-media-library (write-only; the read-media permissions the plugin adds
are blocked in app.json and absent from the merged manifest), PDFs to the
export folder, and Read Text can take or pick a photo and copy the result;
these compiled and typecheck, and their on-device pass is still pending.

R8 (2026-09-25, evening). Release builds are now minified and shrunk with
keep rules for expo.modules.scandoc, org.opencv, com.googlecode.tesseract
and com.googlecode.leptonica (neither AAR ships consumer rules). A local
minified release APK built in 27 min (118.8 MB against 130.5 MB before,
mapping.txt 83 MB) and, installed on the emulator, started its JS, rendered
Home completely and logged no ClassNotFound, NoClassDefFound or
UnsatisfiedLink errors. The engine itself (a PDF export) was not reached
under R8 because the emulator sat above load 4 and ANR'd first; the keep
rules cover those packages whole, so a stripped class is unlikely, but the
first phone run of the minified build should open the scanner and create a
PDF before anything else. Play's "no deobfuscation file" warning should be
gone from the next upload, since the AAB embeds the mapping.

Why the emulator struggled with ads (measured, not guessed): with the app
idle on Home, a SIGQUIT thread dump showed the JS thread asleep and the main
thread inside Choreographer with every frame janky (90th percentile 1150 ms,
frame counter not advancing), the process at 600 MB PSS with a 325 MB native
heap and seven live WebViews. Each ad format holds a WebView, and on this
emulator each failed native attempt left another; the guest has 2.5 GB of
RAM with under 850 MB available, so it paged. The native card now shares one
request, the app-open ad is prepared on first background instead of at
launch, and the remaining WebViews are the interstitial, the rewarded video
and the native card. A phone with 6 GB or more will not page like this, but
the same dumpsys meminfo count ("WebViews:") is the number to watch there:
expect three or four, not seven.

The light-mode "black strip at the top" reported from a phone was reproduced
in Expo Go on the emulator with 3-button navigation and diagnosed on the
device rather than by reasoning. Measured from inside the running app, the top
safe-area inset in Expo Go is the full status-bar height (51.8dp on the
emulator), so the layout is already edge-to-edge; what Expo Go leaves wrong is
the bar's own background, which stays opaque black. Built apps get a
transparent bar from the platform's mandatory edge-to-edge window (prebuild
rejects any attempt to configure it otherwise), which is why the development
build never showed it. The root layout now sets the Android status bar
translucent and transparent on mount; in built apps React Native ignores those
calls with a native log line, in Expo Go they take effect. The deprecated
androidStatusBar manifest field was tried and is ignored by Expo Go 57, so it
is not used. Before-and-after screenshots were taken in Expo Go in light and
dark mode. An earlier round of "after" screenshots was invalid because the
emulator was being served a stale bundle by a Metro instance whose file
watcher had stopped; the check that the device runs current code is now part
of the routine.

A capture failure reported from Expo Go on a physical phone ("FileSystemFile.copy
has been rejected ... NoSuchFileException" on the camera's temporary file) was
traced to a race, not to Expo Go: expo-file-system 57 registers File.copy() and
File.move() as asynchronous native functions, and the app called them without
awaiting in five places (adding a page, replacing a page, importing a file,
splitting a page and caching a preview). The caller therefore inserted the
database row, returned, and deleted the camera's temporary file while the copy
was still running; on a fast development device the copy usually finished
first, which is why it had not shown up before. Every call is now awaited, with
the file written before any row refers to it, and tests/async-file-ops.test.mjs
fails the suite if an un-awaited copy or move is ever reintroduced.

The first `eas build --profile production` failed before uploading anything
with `ENOENT ... expo-module-gradle-plugin/bin/.gradle/8.9/gc.properties`
while computing the project fingerprint. A Gradle daemon was writing its cache
inside that included build at the same moment the fingerprint walk read it;
the default ignore list covers the plugin's `build/` but not its `.gradle/`.
A `.fingerprintignore` now excludes those caches (and the local emulator and
export folders), and `fingerprint:generate --platform android` was run
locally to confirm it completes and includes no Gradle cache files.

Storage hygiene: a single versioned database opener replaced two independent
openers, and permanent deletion, Empty trash and 30-day retention were added.
The migration planner and retention boundary are unit tested (tests/library.test.mjs);
the runtime paths (opening an existing database, deleting a document and its
related rows and preview, the launch purge) have not yet been exercised on a
device and are recorded as pending below until they are.

Not yet verified: behaviour in a release build, the storage hygiene runtime paths above, ARM device builds, camera
image-quality calibration, real receipt extraction accuracy, complex book
curvature, 50/100/300-page stress tests, low-storage and process-kill fault
injection, and accessibility configurations including TalkBack. OCR accuracy has
never been measured against real documents, only synthetic printed text, so the
preparation pipeline, orientation probe, layout modes and memory fallback have no
measured accuracy on real pages. The crop editor's dragging, magnifier, rotation
and fine-adjust controls, and merge/split/PDF-to-image against real multi-page
PDFs including the 300-page limit and cancellation part-way through, have no
recorded results. This is development functionality, not a production-readiness certification.

The reported React Native `Text strings must be rendered within a <Text> component` error was caused by three explicit whitespace children in Documents/Tools. Those children were removed; the source regression test checks every app/src TSX file for literal text in non-text containers.
