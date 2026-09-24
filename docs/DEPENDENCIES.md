# Dependency review — 2026-09-19

Expo SDK 57.0.24 is the stable npm release used for this foundation. `expo install` selected the matching React/React Native/native package versions; `expo install --check` passes. Package versions are locked by package-lock.json.

Sources reviewed:
- https://expo.dev/changelog/sdk-57
- https://docs.expo.dev/versions/latest/sdk/filesystem/
- https://docs.expo.dev/versions/latest/sdk/imagepicker/
- https://docs.expo.dev/versions/latest/sdk/print/ (research only; not installed)

Expo packages are maintained in the Expo project and support Android. React Native, Expo, AsyncStorage, Gesture Handler, Reanimated, Worklets and the installed icon wrapper use MIT licensing (verify notices during release packaging). The app uses existing supplied icon artwork; its distribution rights must be owned by the publisher.

`npm audit --omit=dev` currently reports 15 moderate findings, no high or critical findings. The dependency paths include decode-uri-component through query-string/Expo Router, and uuid through xcode/Expo build tooling. npm proposes incompatible SDK downgrades as fixes; those were not applied. Resolve and re-evaluate before release. Do not use `npm audit fix --force` without checking SDK compatibility.

SDK 54 Expo Go is incompatible with this SDK 57 project. Foundation modules are available in matching Expo Go; a development build is the intended production development environment. Future native scanner/OCR/PDF engines need separate Android support, maintenance and licensing reviews before installation.


## Advanced workflow update

The local Android engine now uses Tesseract4Android 4.9.0, AndroidX ExifInterface 1.4.1, and a bundled English tessdata_fast 4.1.0 model. It avoids network-dependent OCR and analytics SDKs. Android tests use AndroidX Test Runner 1.7.0 and JUnit extension 1.3.0. See ADVANCED-FEATURES.md for upstream sources, licenses and model hash; VERIFICATION.md records native compile/test results. expo-system-ui was added using Expo version matching, and react-dom is pinned to 19.2.3 to match React and avoid npm resolving an incompatible optional peer. The earlier audit result is historical; reassess dependencies before release.


## Crop editor update

`react-native-svg` 15.15.4 (MIT, Software Mansion) was added with `expo install` for the crop overlay: it draws the even-odd dim mask and the quad outline as animated paths. `expo install --check` reports compatible versions. It contains native code, so the Android development build must be rebuilt after pulling this change; a Metro reload alone is not enough.

The crop gestures use the already-installed `react-native-gesture-handler` and `react-native-reanimated`/`react-native-worklets`. `babel-preset-expo` adds `react-native-worklets/plugin` automatically when the package is present, which is what compiles the shared crop geometry into worklets; this was verified by running the preset over the source and counting the generated worklets rather than assuming it. Rotation uses the already-installed `expo-image-manipulator`. No new dependency was added for either.


## OCR and native build update

No new runtime dependency was added for the OCR work: page preparation uses the Leptonica wrappers (`AdaptiveMap`, `Binarize`, `Skew`, `Rotate`, `Scale`, `Convert`) already shipped inside Tesseract4Android 4.9.0.

`com.google.guava:guava:33.3.1-android` was added as **compileOnly**. CameraX exposes `ListenableFuture`, but Gradle resolves `com.google.guava:listenablefuture` to the marker artifact `9999.0-empty-to-avoid-conflict-with-guava`, which contains no classes, and the Expo module plugin's consistent resolution pins the compile classpath to that same empty jar. Without this the module does not compile. Guava is already on the app's runtime classpath at the same version, so nothing extra is packaged and the APK does not grow.
