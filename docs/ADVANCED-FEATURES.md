# Advanced workflows

All processing is local. The custom Android engine is an Expo local module under `modules/scandoc-engine`; it does not exist inside Expo Go. Keep SDK 57, then build the app with `npm run android`. Native integration uses Tesseract4Android 4.9.0 (Apache-2.0), Android Bitmap/Matrix/Canvas/PdfRenderer, and an image-only streaming PDF writer. There is no document upload or OCR telemetry SDK.

## Workflows and boundaries

| Addition | Entry point | Behavior and limits |
| --- | --- | --- |
| Scan quality check | Capture → Review page | Heuristic sharpness, overexposure, dark-region and frame-edge checks. These are advisory, not validated diagnoses of blur or glare. |
| OCR page preparation | Tools → Text & smart naming | Leptonica grayscale, morphological background normalisation, optional deskew and Otsu binarisation before Tesseract; page segmentation set to full-page analysis; `user_defined_dpi` declared. Pages are read at up to 3000px on the long edge, falling back to 1800px if memory runs short. |
| OCR orientation | Tools → Text & smart naming | No `osd.traineddata` is bundled, so orientation is found by scoring the four quarter turns on a downscaled copy. Turns are ranked by how many ordinary words they produce, because Tesseract reports high confidence for upside-down nonsense (measured at 87/100) and cannot be used to detect a flip. Ties keep the smaller rotation. It only runs when the upright read looks unusable, so the usual case stays a single pass. Tesseract re-reads sideways text itself, so the reported angle is one that reads well, not a measurement of how the page was held. |
| Smart naming | Tools → Text & smart naming | OCR-derived title/category/date suggestion, editable before applying. Receipt preset also suggests a PDF name. |
| Full-text search | Documents | Local SQLite FTS5 index after OCR or editing saved text. Prefix token matching, with marked result snippets. Does not make exported PDFs text-searchable. |
| Quick presets | Tools → Scan workspace | Document, Receipt, Study, Book. Receipt/Study export runs OCR and assigns a folder; crop/enhance is reviewed manually. |
| One database, versioned | Everywhere | All metadata is in one SQLite file opened once through database.ts, in WAL mode, with a user_version-driven migration list. Version 1 is the idempotent baseline every existing install already has; later schema changes are appended entries, each applied in its own transaction. A database newer than the app is refused with a clear message rather than altered. The migration planner is unit tested. |
| Trash retention and permanent deletion | Documents, Settings, Document screen | Trashed documents are removed automatically after 30 days, applied once per launch before the library is listed. Empty trash (Documents Trash filter, Settings Storage) and Delete forever (a trashed document) remove the file, its recognised text, its search index entry, its folder, any receipt and its cached preview in one transaction. The retention boundary is unit tested. |
| Storage overview | Settings | Library and Trash sizes and counts, so what emptying the trash frees is visible before doing it. |
| Document previews | Documents, Home | PDFs show their first page instead of an icon. The engine renders page one, the result is downscaled to 320px and cached under the cache directory; rendering is serialised so a long list draws one page at a time. Without the native engine the icon is shown. |
| Home quick actions, sort, refresh | Home, Documents | Import, Read text, Merge PDFs and Compress as a grid on Home; an explicit Sort by control and pull-to-refresh in Documents, replacing a tap-to-cycle sort label. |
| Advertising (Google AdMob) | Tab bar banner, after finished tasks, Settings | Consent first: Google's UMP form runs before any ad request and the SDK is initialised only if ads may be requested; declining starts nothing and loses nothing. One anchored adaptive banner above the tab bar; an interstitial only after a workflow task completes, never in the first 90 seconds of a session, at most every 3 minutes and 6 per session; an app-open ad only when returning after 3 or more minutes away, never on a cold start; never over the camera or the page editor. A rewarded video grants an ad-free hour that stacks. Development builds use Google's test units. Ad content is capped at rating G. The rules live in src/features/ads/policy.mjs and are unit tested. The module is optional so Expo Go keeps working without it. |
| Document picker | Any workflow screen | Rendered as an overlay inside the app's own window, not a react-native Modal. A Modal is a separate Android window that does not inherit the activity's status bar appearance, so its clock and icons stayed white and unreadable on a light page. The Android back gesture closes the overlay and returns to the workflow. |
| Crop and perspective | Draft page → Adjust crop | Direct-manipulation quad: draggable corners and edges, whole-frame drag, magnifier, dimmed discard area, automatic detection, rotation and fine-adjust nudges. The live guard is the same validity rule the export uses, so a crop shown on screen can always be applied. Rotation rewrites the draft page; the original photo is preserved and restorable. |
| Redaction | Workspace → Editable copy → Page editor | User selects rectangular regions. Pixels are replaced before JPEG encoding; new image-only PDFs omit original text, attachments, and metadata. Inspect outputs before distributing sensitive documents. |
| Receipt report | Tools → Receipt reports | User-reviewed merchant/date/currency/amount. Integer-cent totals per currency, formula-safe CSV, summary PDF plus receipt pages. No currency conversion. |
| Comparison | Tools → Compare documents | Count-aware added/removed OCR lines across documents, plus normalized first-page visual difference. No automatic geometric registration; lighting/angle changes can produce differences. |
| Resume scans | Tools → Scan workspace | Each capture is copied into persistent draft storage before review. Pages survive navigation/restart, can be reordered/removed, and draft remains after export. |
| Export target | Tools → Export size target | Tries five resolution/quality combinations, saves measured result and reports target success/failure honestly. Re-rasterizes PDFs, losing forms, links, selectable text, signatures and tags in the output copy. |
| Merge PDFs | Tools → Merge PDFs | Ordered multi-document merge. Page counts are read from each PDF and never guessed; an unreadable file blocks the merge instead of being skipped silently. Output is a new image-only PDF; sources are untouched. |
| Split PDFs | Tools → Split PDF | Extract chosen pages, split every N pages, or one file per page. The output list is produced by the same function that writes the files, so the preview cannot disagree with the result. Files already written survive a later failure or cancellation. |
| PDF to images | Tools → PDF to images | All or chosen pages saved as JPEG at up to 1800 pixels on the longest edge. Pages are rendered one at a time; a single unreadable page is counted and reported rather than discarding the rest. |
| Book scanning | Workspace → Book → Page editor | Adjustable split, reading direction, and manual vertical bow correction with previews. Not automatic 3D page dewarping. |

## Memory and cancellation

Native work is serialized on a worker thread, image decoding is downsampled, and PDF generation streams one JPEG at a time to disk. Imported PDFs render one page at a time to temporary files. PDF output, imported editable copies and the merge/split/PDF-to-image workflows are limited to 300 pages per run. OCR currently bundles English only. Cancellation is cooperative between steps and after an OCR call; work does not survive process termination. Persistent draft pages do survive termination once the save completes.

Output files use UUID paths. Temporary native job directories are cleaned by the caller after use. Failed jobs remove their output directory. A killed process may leave temporary files in the OS cache; cache reconciliation remains a hardening item. Deleting/replacing draft pages uses filesystem cleanup after database changes and can leave orphan files if interrupted; originals in the library remain untouched.

## OCR model provenance

- Model: https://github.com/tesseract-ocr/tessdata_fast/tree/4.1.0
- Bundled file: `eng.traineddata`
- SHA256: `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`
- License is bundled beside the model.
- `tessdata_fast` is the fastest and least accurate of the three upstream tiers. The standard `tessdata` model is more accurate at roughly +11MB; it has not been adopted and remains a deliberate size trade-off.
- Engine: https://github.com/adaptech-cz/Tesseract4Android (4.9.0)
- Engine dependencies include Tesseract (Apache-2.0), Leptonica (BSD-style), JPEG and PNG libraries; preserve their packaged notices when releasing.

## Required device acceptance

Test native build on a real Android device: camera deny/regrant, force-stop/resume, 50-page draft, cancellation during OCR/PDF export, low storage, corrupt/password-protected PDF, upright/rotated/mirrored EXIF, redaction after crop, output inspected at high zoom, and extracted-text/metadata checks on redacted PDF. Test calibrated blur/glare datasets before describing quality feedback as reliable automatic detection. Test difficult book curvature before broadening dewarping claims.
