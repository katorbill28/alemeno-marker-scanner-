# Alemeno Marker Scanner - Technical README

React Native Android app for the Alemeno frontend internship assignment.

The app uses the provided **Marker 1** geometry, scans camera frames, extracts valid markers, corrects perspective and orientation, and displays 20 normalized marker crops.

## Stack

- React Native
- Expo SDK 54
- Expo Camera
- JavaScript marker detector
- `jpeg-js` for JPEG decode/encode
- `base64-js` for base64 conversion

## Key Requirements Covered

- Android React Native application
- Live camera feed
- Custom marker detection
- Marker extraction
- Perspective correction
- Orientation correction
- 20 processed marker results
- Output marker display at `300x300`
- Correct/incorrect marker validation using supplied images

## Project Structure

```text
Assignment
├── assets
│   └── reference
│       └── supplied marker images
├── docs
│   └── approach.pdf
├── scripts
│   ├── generate-approach-pdf.js
│   └── test-marker-detector.js
├── src
│   ├── App.js
│   └── detector
│       └── markerDetector.js
├── app.json
├── eas.json
├── package.json
├── README.md
└── README_TECHNICAL.md
```

## Main App Flow

`src/App.js` handles:

- camera permissions
- camera preview
- picture size selection
- scan loop
- 20-result state
- reset/stop controls
- fallback sample marker loading
- result rendering

The scan loop captures frames with `takePictureAsync`, passes the JPEG base64 to the detector, and appends accepted marker crops until 20 valid results are collected.

## Detector Flow

Detector file:

```text
src/detector/markerDetector.js
```

High-level pipeline:

1. Decode JPEG base64 into raw RGBA pixels.
2. Downsample frame for faster scanning.
3. Build an adaptive dark-pixel mask.
4. Find connected dark components.
5. Select the largest square-like marker candidate.
6. Estimate four corners using component extremes.
7. Validate border continuity.
8. Apply perspective warp to `300x300`.
9. Detect finder-square corner.
10. Rotate output so finder square is top-left.
11. Validate Marker 1 geometry.
12. Encode final result as JPEG base64.

## Validation Rules

The detector checks:

- square-like connected component
- continuous outer border
- black border density on all sides
- filled finder square in expected position
- absence of finder squares in wrong corners
- limited central black density
- red invalid marker marks in supplied incorrect samples

This helps reject similar but incorrect shapes.

## Run App

```powershell
cd "c:\Users\Torshi\OneDrive\Desktop\Assignment"
npm.cmd install
npx.cmd expo start --lan --clear
```

If LAN does not work:

```powershell
npx.cmd expo start --tunnel --clear
```

Open in Expo Go on Android.

## Test Marker Detection

```powershell
npm.cmd run test:markers
```

Expected result:

```text
PASS Marker1-TestImage1-Correct.jpg expected=true actual=true
PASS Marker1-TestImage2-Correct.jpg expected=true actual=true
PASS Marker1-TestImage3-Correct.jpg expected=true actual=true
PASS Marker1-TestImage4-Incorrect.jpg expected=false actual=false
PASS Marker1-TestImage5-Incorrect.jpg expected=false actual=false
PASS Marker1-TestImage6-Incorrect.jpg expected=false actual=false
PASS Marker1-TestImage7-Incorrect.jpg expected=false actual=false
```

## Build Check

```powershell
$env:EXPO_NO_TELEMETRY='1'
$env:EXPO_HOME=(Join-Path (Get-Location) '.expo-home')
npx.cmd expo export --platform android --output-dir dist
```

## APK Build

This project includes `eas.json`.

Build APK:

```powershell
npx.cmd eas build -p android --profile preview
```

## Notes

Live camera scanning can be sensitive when scanning from another display because screen glare, reflections, blur, or low contrast can affect camera pixels.

For reliable live camera testing, use a printed marker or a bright display with the full marker clearly visible.

The fallback **Load 20 sample markers** button demonstrates the final 20-result UI using supplied correct marker images.

