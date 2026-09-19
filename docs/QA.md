# Android acceptance checklist

Status: not yet executed on an emulator or physical device. No Android SDK/JDK was available on PATH in the implementation environment.

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

## Release gates

- Address lifecycle recovery, large inputs, database pagination, cached thumbnails, import format validation and dependency advisories.
- Add native integration tests for storage rollback and processing errors.
- Run actual 100+ image and 100-page workloads once those pipelines are implemented.
- Verify manifest permissions, Android backup policy and privacy text against the built APK.
- Validate native debug and release builds. No production-ready claim until these gates pass.
