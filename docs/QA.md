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
- Live scanner: the preview streams within a few seconds of the permission being granted, and the edge overlay follows a page. If the native view errors or shows nothing for 20 s the standard camera takes over with "Edges are detected after you take the photo"; capture still works there.
- Deny with "Don't ask again", open Settings from the prompt, grant, return: the scanner opens without leaving the screen (permission is re-read on foreground).

## Compression

- Large/rotated JPEG, PNG transparency, WebP, malformed image, low memory/storage.
- Before/after sizes reflect actual files; larger output is reported honestly.
- Original is preserved; compression result opens/shares; temporary output cleaned after failures.
- Navigate away during processing, background app, then return; ensure no duplicate save.

## Advertising

- Expo Go: no red error about RNGoogleMobileAdsModule at launch or when opening tabs; Settings shows no Ads section; every premium tool is open and PDFs still carry the watermark.
- Built app: there is no banner anywhere. A native ad card (icon, headline, "Ad" badge, media, body, call to action) appears as the last item on Home, Tools, Settings and at the foot of the Documents list only once it has loaded; nothing is reserved for it before that, and it never appears in a document, the camera or the editor.
- First launch in an EEA test region (UMP debug geography) shows the consent form before any ad; decline it and confirm no ad card appears, nothing breaks, every tool is open, and Settings says ads are off.
- Accept consent: a test native card appears within a few seconds on Home.
- Watermark: create a PDF and open it; every page carries a small "Scanned with ScanDoc" pill in the bottom-right corner. Settings → "Remove the PDF watermark for 4 hours" → watch the test video to the end; the row now shows the time left, the draft screen says "No watermark", and the next PDF has no label. Merge, Split, Compress PDF, receipts reports and Add pages all follow the same rule.
- Premium tools: open Merge PDFs with no reward active; the gate card appears with "Watch video · unlock for 4 hours" (disabled until the video is loaded). Close the video early: "Video not finished", still gated. Watch to the end: the tool opens and shows "Unlocked for another 3 h 59 min"; Settings lists it. The other five tools (OCR, Split, PDF to Images, Compress PDF, Compare) each gate independently.
- Finish an OCR, merge or compress task within the first 90 seconds of a session: no interstitial. Finish another after that: an interstitial may appear once, then not again for 3 minutes.
- Background the app for under 3 minutes and return: no app-open ad. Over 3 minutes: one may appear, except on the camera or editor.
- Settings → Ads & rewards → Remove ads for 15 minutes: the native cards disappear and no interstitial or app-open ad shows; the row counts down; watching again adds 15 minutes.
- Ad privacy settings reopens the consent form only where the region requires it.
- Every ad seen in a development build must be a Google test ad.

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
- Pull down on Documents to refresh; the sort control (Recent → Name → Largest) cycles on tap and the choice survives a restart.
- Long-press a document: the header shows "1 selected" with Select all and Cancel; taps now toggle; the back gesture cancels. Merge PDF is enabled from two selections and opens the merge tool pre-filled in selection order; Save to device writes every selected file; Move to Trash confirms once for the whole selection. In the Trash filter the bar offers Restore and Delete forever instead. The one-line tip disappears after the first selection.
- Document screen: a PDF shows every page as a numbered grid cell (renders arrive one at a time), tapping a cell opens the full-screen viewer at that page with swipe and a "n / N" counter, and the back gesture closes the viewer. Images show a single cell.
- Draft screen: the name is the title (pencil opens rename and the optional size limit); pages are a numbered grid; tapping a page selects it and the bottom bar changes to Edit / Move left / Move right / Remove (Back deselects); with nothing selected the bar is Camera / Gallery / Create PDF. Move left is disabled on the first page and Move right on the last.
- Add pages: from a PDF, Add opens the scanner; captured pages land in a draft titled "Add pages"; finishing it appends them to the same file (same name and id, page count and size updated, grid refreshed) and the draft disappears. Cancelling leaves the original untouched.
- Save: an image document's action reads "Gallery" and, after the one-time photos permission, the image appears in the device gallery (Photos app) under its document name; a PDF's action reads "Save" and goes to the export folder. A mixed selection in Documents sends each to the right place and only asks for a folder when a PDF is included.
- Read Text: "Take photo" opens the camera, "From gallery" the photo picker; either imports the photo into the library and reads it straight away. Copy puts the text on the clipboard (paste it elsewhere to confirm); the word and character count updates as the text is edited; Export TXT names the file after the suggested document name.
- Save to device (PDFs): the first save asks for a folder through the system picker and later saves reuse it; Settings → Storage shows the folder name and lets you change it; a saved PDF opens from the Files app. Delete the chosen folder and save again: the picker reappears once.

## Release build (R8)

- Install a release APK (or the Play internal-testing build): every native tool runs (scan with live edges, OCR, merge, split, PDF to images, compress), because R8 keeps `expo.modules.scandoc`, OpenCV and Tesseract classes; an R8-stripped class would surface as "could not find" errors or a silent engine failure.
- Play Console: the "no deobfuscation file" warning is gone for the new version code.

## Visual design (light and dark)

- Home: brand header with round Search and Settings buttons; the scan card shows the SCAN chip, "Scan a Document", the Scan Now button and the vector phone illustration in both themes; Quick Tools is a 4×2 grid of tinted tiles; "Resume N unfinished scans" appears only when drafts exist; the empty Recent state shows the folder illustration with Scan Document and Import Files side by side.
- Tab bar: a floating pill with the Scan button raised out of its centre; nothing above it is clipped and nothing ever sits between content and the pill.
- Tools: the same tinted tiles grouped under Scan & capture, Document and PDF & image; in Expo Go a grey dot marks tools that need the full build.
- Dark theme: navy backgrounds, tinted tiles keep their hue, hero card stays legible; switch in Settings → Appearance and check every tab.

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
