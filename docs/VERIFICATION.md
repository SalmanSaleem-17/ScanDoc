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

Not yet verified: complete UI flows on a physical phone, camera image-quality calibration, real receipt extraction accuracy, complex book curvature, 50/100/300-page stress tests, low-storage/process-kill fault injection, all accessibility configurations, ARM device builds, or a release APK. OCR accuracy has never been measured against real documents, only synthetic printed text; the new preparation pipeline, orientation probe, layout modes and memory fallback are all unrun. The crop editor has not been run on hardware: dragging, the magnifier, rotation, automatic detection and TalkBack use of the fine-adjust controls all remain device-acceptance items. Merge/split/PDF-to-image have not been run against real multi-page PDFs on hardware, including the 300-page limit, cancellation part-way through a multi-file split, and low-storage behaviour. This is development functionality, not a production-readiness certification.

The reported React Native `Text strings must be rendered within a <Text> component` error was caused by three explicit whitespace children in Documents/Tools. Those children were removed; the source regression test checks every app/src TSX file for literal text in non-text containers.
