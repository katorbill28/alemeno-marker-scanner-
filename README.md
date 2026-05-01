# alemeno-marker-scanner-
# Alemeno Marker Scanner

React Native Android app for the Alemeno frontend internship assignment. It uses the provided **Marker 1** geometry, scans camera frames, extracts valid markers, corrects orientation, and displays 20 normalized `300x300` marker crops.

## What is included

- Expo React Native camera app in `src/App.js`
- Pure JavaScript marker detector in `src/detector/markerDetector.js`
- Supplied marker assets copied into `assets/reference`
- Test runner for the provided Marker 1 correct/incorrect images
- Approach PDF at `docs/approach.pdf`
- APK build profile in `eas.json`

## Run locally

```bash
npm install
npm run start
```

Open the project on an Android device through Expo Go, or run a native Android build:

```bash
npm run android
```

## Validate marker detection

```bash
npm run test:markers
```

Expected result: all Marker 1 correct samples pass and all Marker 1 incorrect samples are rejected.

## Build APK

This repo includes an EAS profile that produces an installable APK:

```bash
npx eas build -p android --profile preview
```

For a fully local native build, install Android Studio, set `ANDROID_HOME`, use a modern JDK supported by React Native, then run:

```bash
npx expo prebuild --platform android
cd android
gradlew assembleRelease
```

