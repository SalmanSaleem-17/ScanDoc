# Advanced workflows

All processing is local. The custom Android engine is an Expo local module under `modules/scandoc-engine`; it does not exist inside Expo Go. Keep SDK 57, then build the app with `npm run android`. Native integration uses Tesseract4Android 4.9.0 (Apache-2.0), Android Bitmap/Matrix/Canvas/PdfRenderer, and an image-only streaming PDF writer. There is no document upload or OCR telemetry SDK.

## Workflows and boundaries

| Addition | Entry point | Behavior and limits |
| --- | --- | --- |
| Scan quality check | Capture → Review page | Heuristic sharpness, overexposure, dark-region and frame-edge checks. These are advisory, not validated diagnoses of blur or glare. |
| Smart naming | Tools → Text & smart naming | OCR-derived title/category/date suggestion, editable before applying. Receipt preset also suggests a PDF name. |
| Full-text search | Documents | Local SQLite FTS5 index after OCR or editing saved text. Prefix token matching, with marked result snippets. Does not make exported PDFs text-searchable. |
| Quick presets | Tools → Scan workspace | Document, Receipt, Study, Book. Receipt/Study export runs OCR and assigns a folder; crop/enhance is reviewed manually. |
| Redaction | Workspace → Editable copy → Page editor | User selects rectangular regions. Pixels are replaced before JPEG encoding; new image-only PDFs omit original text, attachments, and metadata. Inspect outputs before distributing sensitive documents. |
| Receipt report | Tools → Receipt reports | User-reviewed merchant/date/currency/amount. Integer-cent totals per currency, formula-safe CSV, summary PDF plus receipt pages. No currency conversion. |
| Comparison | Tools → Compare documents | Count-aware added/removed OCR lines across documents, plus normalized first-page visual difference. No automatic geometric registration; lighting/angle changes can produce differences. |
| Resume scans | Tools → Scan workspace | Each capture is copied into persistent draft storage before review. Pages survive navigation/restart, can be reordered/removed, and draft remains after export. |
| Export target | Tools → Export size target | Tries five resolution/quality combinations, saves measured result and reports target success/failure honestly. Re-rasterizes PDFs, losing forms, links, selectable text, signatures and tags in the output copy. |
| Book scanning | Workspace → Book → Page editor | Adjustable split, reading direction, and manual vertical bow correction with previews. Not automatic 3D page dewarping. |

## Memory and cancellation

Native work is serialized on a worker thread, image decoding is downsampled, and PDF generation streams one JPEG at a time to disk. Imported PDFs render one page at a time to temporary files. PDF output and imported editable copies are limited to 300 pages. OCR currently bundles English only. Cancellation is cooperative between steps and after an OCR call; work does not survive process termination. Persistent draft pages do survive termination once the save completes.

Output files use UUID paths. Temporary native job directories are cleaned by the caller after use. Failed jobs remove their output directory. A killed process may leave temporary files in the OS cache; cache reconciliation remains a hardening item. Deleting/replacing draft pages uses filesystem cleanup after database changes and can leave orphan files if interrupted; originals in the library remain untouched.

## OCR model provenance

- Model: https://github.com/tesseract-ocr/tessdata_fast/tree/4.1.0
- Bundled file: `eng.traineddata`
- SHA256: `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`
- License is bundled beside the model.
- Engine: https://github.com/adaptech-cz/Tesseract4Android (4.9.0)
- Engine dependencies include Tesseract (Apache-2.0), Leptonica (BSD-style), JPEG and PNG libraries; preserve their packaged notices when releasing.

## Required device acceptance

Test native build on a real Android device: camera deny/regrant, force-stop/resume, 50-page draft, cancellation during OCR/PDF export, low storage, corrupt/password-protected PDF, upright/rotated/mirrored EXIF, redaction after crop, output inspected at high zoom, and extracted-text/metadata checks on redacted PDF. Test calibrated blur/glare datasets before describing quality feedback as reliable automatic detection. Test difficult book curvature before broadening dewarping claims.
