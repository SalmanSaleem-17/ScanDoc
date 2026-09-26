# ScanDoc: Scanner, PDF & OCR

Android-first, offline document toolkit using Expo SDK 57, React Native 0.86, Expo Router and TypeScript. Published on Google Play as com.scandoc.scanner; release builds come from EAS with the locally held keystore described below.

## Run the preview

```powershell
npm.cmd install
npm.cmd start -- --go --clear
```

Use matching Expo Go SDK 57. The library, import/share, compression, camera, persistent drafts and receipt CSV work in Expo Go. Advanced processing clearly identifies when the native engine is missing.

## Run all processing tools

Offline OCR, perspective correction, quality analysis, book editing, redaction, visual comparison and PDF processing use a local Android module. **Updating Expo Go does not add this custom module. Build ScanDoc itself once.**

With Android SDK tools and a compatible JDK configured, connect a device with USB debugging or start an emulator:

```powershell
npm.cmd run android
```

Android builds are cache-heavy: Gradle and npm together can hold well over 10 GB, and they default to your system drive. If that drive is short of space the build fails in confusing ways — Gradle reports "Problems writing to Binary store" rather than "disk full". Point both at a roomier drive before building:

```powershell
setx GRADLE_USER_HOME "D:\gradle-home"
npm.cmd config set cache "D:\npm-cache"
```

`setx` only affects terminals opened afterwards, so close and reopen your terminal before building. Old caches left behind at `%USERPROFILE%\.gradle` and `%LOCALAPPDATA%\npm-cache` can then be deleted; Windows may keep a few lock files until a restart.

Release builds are minified with R8 and have unused resources removed (`expo-build-properties` in app.json, with keep rules for the engine module, OpenCV and Tesseract, which are reached by name from JNI and by reflection). The App Bundle carries the R8 mapping, so Play deobfuscates crash and ANR reports without a separate upload.

Release builds are signed with a keystore you hold, not one EAS generates. `eas.json` sets `credentialsSource: "local"` on the `preview` and `production` profiles, so `eas build` reads `credentials.json` at the project root, which points at `credentials/android/release.keystore`. Both are gitignored and must exist on the machine that runs the build; the originals and the password file live outside the repository (see your own notes for the location). If EAS ever asks "Generate a new Android Keystore?", the answer is **no**: a build signed with a different key will not match the key registered in Google Play developer verification.

For subsequent JavaScript changes:

```powershell
npm.cmd start -- --dev-client
```

Install/open the ScanDoc development app, rather than Expo Go. Native dependency changes require rebuilding. `eas.json` contains development and APK preview build profiles if you configure your own EAS project. No cloud build or store publishing is performed automatically.

## Current workflows

- Home, Documents, Tools, Settings behind a floating tab bar with a raised Scan button; light/dark/system themes with a shared token set (surfaces, tinted tool tiles, hero gradient) and vector illustrations that follow the theme.
- Private filesystem storage, SQLite metadata, import, search, sorting (remembered), rename, share/export and recoverable trash.
- Save routes by kind: images go to the device gallery (one-time photos permission), PDFs to a folder chosen once through the system folder picker and remembered in Settings.
- Read Text takes a photo or picks one from the gallery, reads it at once, and offers Copy, Share and Export TXT.
- Folders: a document carries one folder label (Receipts and Study are assigned by their presets). The Documents tab shows a strip of folders in use with counts and filters by one; the document screen has a folder chip; a selection can be moved to a folder or a new one typed on the spot. Folders exist exactly while a document is in them, so there is nothing to tidy.
- Finishing a scan turns the draft into the document (no leftover draft, no second copy on a second tap). After a page is saved the editor offers "Add another page" or "Done", and the live scanner shows a Done button as soon as one page is captured.
- Enhancement presets in the page editor: Original, Auto, Magic colour (local contrast on the L channel, colours kept), Grayscale, Black & white (adaptive threshold) and Brighten, applied by the engine at full resolution.
- Long-press a document to select several: merge them into one PDF in the order selected, move them to Trash, or restore / delete forever from the Trash filter. The Android back gesture cancels a selection.
- The document screen shows a first-page render for PDFs (cached at two sizes) with Share, Rename, Tools and Trash as one action row.
- Scanning falls back from the native live-detection camera to the standard camera if the native view fails or never starts streaming, so capture works on every device.
- Camera captures persist immediately into drafts. Resume them from Home → Resume scans or Tools → Scan workspace.
- Multi-page drafts shown as a numbered page grid under the document name: tap a page to edit, move or remove it; add pages from the camera or gallery; four-corner perspective crop and contrast enhancement; PDF export with an optional size limit.
- Full-screen crop editor: drag corners, drag an edge to slide it, drag inside the frame to move the whole selection, with a magnifier under the fingertip, a dimmed discard area, automatic edge detection, 90-degree rotation and fine-adjust nudges for precise or screen-reader use.
- Quality warnings for possible blur, excessive brightness/darkness and content at the frame edge. These are heuristics requiring user review.
- Free, supported by a small number of Google AdMob ads: consent-first, a native card at the end of each tab screen (no banner), never over the camera or editor. One rewarded video buys 15 ad-free minutes, 4 hours without the PDF watermark, or 4 hours of a premium tool (OCR, Merge, Split, PDF to Images, Compress PDF, Compare); tools are never blocked when a video cannot be shown, so Expo Go keeps every feature.
- Bundled English OCR with page preparation: lighting is flattened, skew straightened and the page binarised before recognition, full-page layout analysis is enabled, the source resolution is declared, and pages that read poorly are retried in the other three orientations. Editable recognized text, local full-text search and editable suggested names.
- Document, Receipt, Study and Book presets; receipt/study export runs OCR and assigns a folder.
- Rectangle-based pixel redaction and image-only PDF export without the source PDF text/attachments.
- Reviewed receipt records, separate currency totals, formula-safe CSV and PDF report with receipt images.
- Added/removed text-line comparison, plus first-page visual difference image export.
- Merge several documents into one PDF in an order you control, split a PDF by chosen pages / every N pages / each page, and save PDF pages as JPEG images.
- Size-targeted PDF export tries bounded resolution/quality settings and reports actual results.
- Book splitting with configurable spine, reading order, manual bow correction and previews.

See [advanced workflow details and limits](docs/ADVANCED-FEATURES.md). These tools are implemented but require native build and device validation before production use. In particular, quality checks are not calibrated detectors, book correction is not automatic 3D dewarping, English is the only bundled OCR language, and exported image-only PDFs are not text-searchable.

## Privacy and reliability

No accounts, cloud uploads, analytics, or document logging. The only network traffic is Google AdMob ad requests, made after consent and never carrying document content. OCR uses Tesseract4Android with a bundled model, not an online service. Documents and metadata stay in private app storage; AsyncStorage contains only preferences. Android cloud backup is disabled in the app configuration.

Share important documents to a location you control: uninstalling the app removes its private library. Trash remains recoverable. Drafts remain after export until explicitly discarded. Native work runs on a serial worker, bounds image resolution and streams JPEG pages into PDFs. PDF workflows allow up to 300 pages and run in the foreground, with cooperative cancellation between steps. Processing does not continue after the app is killed.

Redaction creates a new image-based representation; always inspect it before sharing sensitive information. Re-rasterizing existing PDFs does not preserve forms, signatures, links, selectable text or accessibility tags. Filesystem/database crash reconciliation, calibrated image-quality testing, large-input stress testing, and full accessibility/device coverage remain release gates.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run check
npm.cmd run export:android
```

The tests cover filename/file signatures, suggested and sequential export names, exact-cent money parsing, safe CSV, name suggestions, line comparison, valid crop geometry, PDF page-range and split planning, and literal-text placement in native layout containers.

After Android prebuild, native tests can run on an emulator/device:

```powershell
cd android
.\gradlew.bat :scandoc-engine:connectedDebugAndroidTest
```

Native tests exercise pixel replacement, generated PDF parsing/rendering, book splitting, image differences and OCR with the bundled model. See [QA checklist](docs/QA.md) and [dependency review](docs/DEPENDENCIES.md).
