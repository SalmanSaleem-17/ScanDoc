# Live document detection

This is a native Android implementation for an Expo development/production build. Expo Go retains manual camera capture; it does not simulate live detection. Rebuild the native app after pulling these changes.

## Pipeline

`CameraX Y plane → bounded grayscale analysis → Gaussian blur → adaptive Canny thresholds → morphological close → contour approximation → scored convex quadrilaterals → temporal tracker → quality gates → native boundary overlay → high-resolution JPEG → post-capture refinement → perspective correction → draft`

- `DocumentCameraView.kt` owns CameraX PreviewView, image analysis and still capture. The preview uses CameraX's lifecycle, tap focus and pinch zoom. The analyzer keeps only the latest frame and closes every ImageProxy in `finally`.
- The PreviewView runs in PERFORMANCE (SurfaceView) mode. Inside a React Native view tree the COMPATIBLE (TextureView) mode never received a draw pass, so the camera opened, the Preview requested its surface and the screen stayed black; a SurfaceView streams as soon as it is attached and sized. The view also measures and lays out its children itself (`onMeasure`, `onLayout`) and answers `requestLayout()` from them with one posted measure+layout pass, guarded so a pass never queues another (that unguarded chain froze the main thread in testing). On the JavaScript side `LiveScanner` falls back to the standard expo-camera screen if the native view reports an error or never becomes ready within 20 s (60 s in development builds, where emulators start CameraX far more slowly).
- `DocumentDetector.kt` downsamples to a 640-pixel maximum edge for live analysis. It scores coverage, corner geometry, sampled edge support, contour agreement, center position and previous-candidate proximity. It does not simply select the largest contour. Native Mats and edge buffers are reused.
- `DocumentTracker.kt` implements smoothing, time-based readiness, missed-frame grace, guidance hysteresis and a post-capture lock. All capture gates must hold for at least six analyzed frames and 600–1250 ms, depending on confidence. A missed frame immediately revokes readiness even while retaining the last overlay briefly.
- `PreviewCoordinates.kt` composes CameraX sensor-to-buffer and sensor-to-view matrices. The preview mapping accounts for rotation, crop, scale and zoom. Still-image fallback corners are transformed through the capture's sensor-to-buffer matrix, normalized and rotated to match its EXIF orientation. No front-camera mirroring assumptions are used.
- `Images.detect` performs a separate 1600-pixel analysis and local subpixel corner refinement on the oriented captured photo. Reliable mapped live corners are a fallback. If neither detector succeeds, the photo remains available for manual crop.
- The original JPEG is persisted before refinement. A separate SQLite source record protects it from replacement. The crop editor can restore the original. Removing the page or draft deletes both source and edited files.

## UI and capture behavior

Manual capture stays available regardless of detector confidence. Auto can be switched off. Flash supports off/auto/on using CameraX. The native overlay only appears for detected candidates; there is no default rectangle. Auto capture keeps the camera open for multiple pages. Manual capture opens the crop editor. Gallery import and draft review remain available.

After capture, automatic capture remains locked until the page disappears for more than 700 ms or its corners move substantially for more than 500 ms. An unchanged page cannot immediately retrigger. A page changed in exactly the same position may require briefly lifting it out of view; content fingerprinting is not implemented.

The scanner has its own dark safe-area surface and light system icons. The preview occupies the space between the toolbar and capture controls, so neither control set covers the usable document area. Other screens own all safe-area edges, except tab screens, whose bottom inset is owned by the tab bar. Document-picker modals have their own SafeAreaProvider. Home's secondary actions now have a consistent gap and can wrap on narrow displays.

## Quality and performance

Quality measurements are made inside the detected page: Laplacian variance, average luminance and severe highlight clipping. Clipped corners, excessive perspective, motion, poor confidence, insufficient coverage or low detail reset the capture timer. Tap focus adds a settling interval.

The analyzer adapts its interval between 67–200 ms according to processing duration and reduces frequency further under Android thermal pressure. This is a scheduling target, not a measured device FPS promise. Full camera frames never pass into JavaScript. Only metrics and saved-file references cross the boundary.

Long-press the scanner title in a development build to show measured analysis FPS, last/P95 processing time, confidence, motion, detail, light and coverage. No document contents, names or image buffers are logged. Preview FPS, memory and CPU must be measured separately with Android Studio/Perfetto.

## Validation and remaining work

Native instrumentation fixtures cover blank input, a textured angled page, corner ordering, capture history, poor light, motion, clipping, missed detections, duplicate suppression and coordinate rotation/crop/scale. Synthetic fixtures are not a substitute for a real document corpus.

Before release, collect consented local test scenes covering white-on-white, receipts, cards, shadows, glare, fabric/wood, multiple pages and severe skew on at least three physical Android camera/sensor combinations. Record corner error relative to manually annotated corners, false positives, missed detections, time to detection/capture, P50/P95 latency and thermal behavior. Do not store private user documents in diagnostics.

Current limitations requiring further work:

- Quality thresholds are initial conservative values, not calibrated across phones. White paper and glare are inherently ambiguous in luminance-only analysis; severe clipping is a warning heuristic, not a glare segmentation model.
- No segmentation model, curved-page detector, ID-specific prior, gyroscope fusion or explicit autofocus-state tracking. Tap-focus settling and image quality checks provide conservative initial gates.
- Candidate debug contours, a document-content fingerprint and downloadable calibration profiles are not implemented.
- Enhancement uses the existing modest contrast transform; it is not full shadow removal or illumination normalization.
- App orientation remains portrait. Coordinate tests include 0/90/180/270-degree camera transforms; a complete landscape UI is not enabled.
- OpenCV increases native binary size. ARM builds, 16 KB page-size packaging, long-running camera memory behavior and real-device performance still require release validation.

## Build

```powershell
npx expo prebuild --platform android
npx expo run:android
```

Use a development build to exercise live detection and native navigation-bar configuration. A Metro reload alone cannot add native modules or apply the navigation-bar contrast setting. The `expo-navigation-bar` style matches icon color in the installed SDK implementation (`light` icons on dark surfaces).

Dependencies: CameraX 1.6.0 matches the installed Expo camera dependency; OpenCV 4.12.0 is the official Android Maven artifact under Apache-2.0. See [CameraX](https://developer.android.com/jetpack/androidx/releases/camera), [OpenCV Android distribution](https://opencv.org/enhanced-opencv-for-android-support-arm-performance-gains/), and [OpenCV licensing](https://opencv.org/license/).

This implementation is not yet a production-readiness certification. Physical-camera accuracy and the real-world dataset requirements remain release gates.
