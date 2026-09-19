# ScanDoc: Scanner, PDF & OCR

An Android-first, offline document toolkit built with Expo Router and TypeScript. This repository is the **initial foundation**, not a finished Play Store release.

## Run

Requires Node 22.13+ and npm. From this folder:

```powershell
npm.cmd install
npm.cmd start
```

The project uses **Expo SDK 57**, React Native 0.86.3, and React 19.2.3. Expo Go SDK 54 (shown in the supplied screenshot) cannot run this project. Use matching SDK 57 Expo Go for foundation testing or an Android development build. Scripts call the Node entry point directly because Windows executable shims can break when a workspace path contains `&`.

For a local development build, install Android Studio, its SDK/platform tools and the JDK required by the installed React Native version, attach a device with USB debugging, then run `npm.cmd run android`. `eas.json` also defines development, preview APK, and production profiles; EAS builds need your own Expo account/project configuration. No cloud build or store publishing has been performed.

## Implemented in this iteration

- Home, Documents, Tools, Settings; central Scan action and runtime safe-area bottom navigation.
- Light/dark/system themes, persisted as a lightweight preference.
- Private files under ScanDoc/{Scans,PDF,Images,Compressed,OCR,Exports}; SQLite metadata, UUID filenames, and original-file preservation.
- System file picker for PDF/JPEG/PNG/WebP, sequential import, per-file errors, storage checks.
- Search by name/type, recent/name/size sorting, file details, rename, native sharing/export, recoverable trash.
- Manual camera capture with contextual permission handling, torch, review, retake, and JPEG save.
- Native JPEG compression with quality selection, measured results, save, share, and temporary output cleanup.
- Reusable UI primitives and a sequential, cancellable batch-operation foundation.

No sample documents, simulated OCR, fake detection outlines, or placeholder processing actions are presented as working features.

## Remaining phases

1. Complete foundation: folders, paginated database queries, thumbnail cache, import cancellation/recovery, accessible device QA, onboarding and bundled Inter fonts.
2. Scanner: native edge detection, stability/auto-capture, four-corner perspective correction, enhancement, multi-page draft recovery and PDF generation. Current capture is manual and saves JPEG only.
3. Image tools: resize, batch controls, format conversion and image-to-PDF.
4. PDF engine: native file-based merge/split/render/organize/compress with password/corruption handling. Imported PDFs currently use an external reader through Share; no internal PDF renderer yet.
5. On-device OCR, editable results, text index and searchable PDFs.
6. Signature, annotations and page editing.
7. Performance, accessibility, tablet/device testing and release hardening.

Choose maintained native engines after an Android compatibility/license review; expose their file-based APIs through `src/services`. Native capabilities will require a rebuilt development client. The installed Expo camera does not supply document edge detection or perspective correction.

## Reliability boundaries

- App-private files are deleted on uninstall. Share important files to a user-controlled location.
- Trash is recoverable indefinitely in this iteration; permanent deletion is not exposed.
- PDF page counts are unknown until a real parser is integrated. Imports validate supported extensions, basic readability and a bounded file-signature read; deeper PDF validation belongs to the native engine.
- File copies and SQLite writes are compensating operations, not a cross-filesystem atomic transaction. Startup orphan reconciliation remains to be implemented.
- Compression processes one image at a time natively but very large decoded images still require device memory. No claim of 100-page/100-image production readiness.
- Processing is foreground work, not a persistent Android background job. Cancellation support in the batch service stops between files, not during a native call.
- Android hardware back, camera app-background behavior, lifecycle draft recovery and image cache cleanup need further hardening.
- No ads, accounts, analytics, cloud uploads, or tracking are included.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run check
npm.cmd run export:android
```

See `docs/QA.md` for the device acceptance checklist and `docs/DEPENDENCIES.md` for dependency review. Passing TypeScript and bundling is not a substitute for Android device testing.
