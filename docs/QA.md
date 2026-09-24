# Android acceptance checklist

Status: four native engine tests pass on an Android 14 emulator; TypeScript, eleven JavaScript tests and Android bundling pass. See VERIFICATION.md. The full UI/device acceptance checklist below remains pending.

## Foundation

- Fresh launch requests no permissions; empty library has useful actions.
- Test 320dp phone, regular phone, tablet, font scaling and TalkBack.
- Verify every screen in light/dark/system themes, cutout devices, gesture navigation and 3-button navigation.
- Import PDF/JPEG/PNG/WebP, cancel picker, deny provider access, import empty/corrupted files and simulate low storage.
- Verify partial batch failure retains successful files and displays failure count.
- Restart app: library and theme persist. Repeated same-name imports never overwrite originals.
- Search, sort, rename with invalid characters; trash and restore; exported content matches saved file.
- Open an imported PDF using Share to a reader; unknown page counts must not be fabricated.

## Camera

- First request, denial, permanent denial/settings recovery, unavailable camera, torch unsupported.
- Rapid capture/save taps, retake, Android hardware back, background/foreground, interruption during saving.
- Verify files persist after restart and cancelled captures do not accumulate in cache.

## Compression

- Large/rotated JPEG, PNG transparency, WebP, malformed image, low memory/storage.
- Before/after sizes reflect actual files; larger output is reported honestly.
- Original is preserved; compression result opens/shares; temporary output cleaned after failures.
- Navigate away during processing, background app, then return; ensure no duplicate save.

## Capture and import on slow devices

- In Expo Go (no native engine) and in the development build, capture a page, then immediately capture another; both must appear in the draft with their images intact.
- Import several files at once from the picker; every imported file must open. A row with a missing file is a failure.
- Replace a page (rotate in the editor) and confirm the previous image is gone and the new one opens.

## Storage and trash

- Move a document to Trash, then check Documents (Trash filter) shows the retention note and Empty trash; the Document screen shows days remaining, Restore and Delete forever.
- Delete forever: the file is gone from the ScanDoc folder, it no longer appears in search results, any receipt for it is gone, and Settings storage counts drop accordingly.
- Set the device clock 31 days ahead, relaunch: trashed items are removed and live items untouched. Set it back.
- Settings Storage: counts and sizes match the library; Empty trash now is hidden when the trash is empty.
- Install over a build from before database versioning: the library opens, drafts and search still work (baseline migration is idempotent).
- PDF cards show a first-page preview after a moment; image cards show the image; with the engine absent (Expo Go) PDFs show the icon and nothing errors.
- Pull down on Documents to refresh; the Sort by control changes order immediately.

## System bars and safe areas

- In Expo Go and in a built app, in light mode: the status bar area must show the page background with dark icons, never an opaque black strip. Check with gesture navigation and with 3-button navigation.

- Check every screen with the app theme set to Light, Dark and System default, and separately with the *device* in the opposite mode to the app. The status bar clock and icons must stay legible against whatever the app paints behind them.
- Open the document picker from each workflow screen; confirm the status bar remains readable and the Android back gesture closes the picker rather than leaving the screen.
- Repeat on a device with a display cutout and on one with 3-button navigation.
- Confirm no control is ever hidden behind the status bar or the navigation bar.

## OCR

- Compare recognition before and after "Clean up the page first" on real photographs: shadowed pages, grey recycled paper, a receipt, a page with columns and a faint carbon copy.
- Confirm "One block" and "Scattered text" layouts behave differently on a multi-column page and on a page of labels.
- Feed a sideways and an upside-down page with detection on and off; confirm the reported rotation matches what was applied.
- Confirm a page with no readable text reports that honestly rather than returning noise.
- Measure time per page at 3000px on a slow device, and confirm the 1800px fallback engages instead of crashing under memory pressure.
- Cancel during recognition of a long document; confirm it stops between pages and saved text is not corrupted.
- Confirm the recognition score is never presented as an accuracy guarantee.

## Crop editor

- Drag each corner and each edge to the image border and past it; the quad must stop at the edge and never invert or cross.
- Pinch-free single-finger drag only: confirm the magnifier appears under a dragged corner, moves aside when the corner is beneath it, and hides on release.
- Confirm the dimmed area always matches the discarded region, including for a strongly skewed quad.
- Auto detect on a clear page, a low-contrast page and a blank wall; a failed detection must leave the current corners untouched and explain itself.
- Rotate left/right repeatedly: the aspect ratio, corners and preview must stay consistent, the original photo must remain restorable, and no temporary file may be left in the cache.
- Fine adjust with TalkBack: each corner is selectable and the nudge controls announce and move as labelled.
- Very tall, very wide and near-square photos on a small phone and a tablet; portrait only.
- Crop a page, then crop the result again; confirm the second crop maps to what is on screen.

## PDF tools

- Merge: two or more PDFs, PDFs mixed with images, a single document (blocked), a damaged/password-protected file (blocked with a reason, not skipped), reorder and remove entries, and a selection over 300 pages.
- Split: extract ranges, every N pages and each page; invalid ranges beyond the page count; confirm the previewed file list matches what is saved.
- PDF to images: all pages and chosen pages; confirm exported images are numbered in page order and the source PDF is unchanged.
- Cancel part-way through a multi-file split and a long image export: already-saved files must remain and be reported, with no partial file left behind.
- Background the app during each operation, then return; confirm no duplicate saves and no temporary files left in the cache.

## Release gates

- Address lifecycle recovery, large inputs, database pagination, cached thumbnails, import format validation and dependency advisories.
- Add native integration tests for storage rollback and processing errors.
- Run actual 100+ image and 100-page workloads once those pipelines are implemented.
- Verify manifest permissions, Android backup policy and privacy text against the built APK.
- Validate native debug and release builds. No production-ready claim until these gates pass.
