# Verification — advanced workflows

Verified in the current workspace:

- `npm run typecheck`: passed.
- `npm test`: 32 tests passed, including the Documents/Tools raw-text regression check, the PDF page-range/split-planning tests, and the crop geometry tests.
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
to be cleared after the package rename. A local debug build with the SDK, the
merged manifest showing AD_ID, and the consent form plus a test banner on the
emulator were still being confirmed when this was committed; the results are
recorded in the following commit.

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
