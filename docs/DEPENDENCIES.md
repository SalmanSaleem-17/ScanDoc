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
