# FaceSeal

> **Hackathon 7.0 submission** · Offline face verification for React Native

Offline, on-device face verification for Android (iOS-ready). No cloud calls,
no internet dependency — designed for zero-network field environments.

---

## Architecture

```
Camera frame
     │
     ▼
┌─────────────────────────────────────┐
│         PipelineRunner              │
│                                     │
│  1. Environment check (luminance)   │ ← pure JS
│  2. Face detect      (YOLOv8 face)  │ ← TFLite
│  3. Liveness         (MiniFASNet    │ ← TFLite
│                       + FFT)        │ ← pure JS
│  4. Face match       (MobileFaceNet)│ ← TFLite
│  5. Log result       (SQLite + GPS) │ ← device
└─────────────────────────────────────┘
     │
     ▼
ResultBanner (Verified / Blocked / Retry)
```

---

## Models

Place `.tflite` files in `assets/models/`:

| File | Source | Size |
|---|---|---|
| `yolov8_face.tflite` | Ultralytics YOLOv8n-face → export tflite | ~6 MB |
| `minifasnet.tflite` | Mini-FASNet-Type1 converted from PyTorch | ~1 MB |
| `mobilefacenet.tflite` | MobileFaceNet 128-dim embedding | ~4 MB |

Convert scripts are in `tools/model-conversion/`. See that folder's README.

When models are on disk, open `src/services/PipelineRunner.ts` and set:

```ts
const USE_STUB = false;
```

Until then the app runs in **stub mode** — all pipeline stages fire with
realistic synthetic scores so the full UI flow can be demoed.

---

## Quick Start (Android)

```sh
# Install deps
npm install

# Start Metro
npm start

# Run on device / emulator (API 26+, 3 GB RAM)
npm run android
```

Permissions required: `CAMERA`, `ACCESS_FINE_LOCATION`.
Both are declared in `android/app/src/main/AndroidManifest.xml`.

---

## Checks

```sh
npm run lint          # ESLint — 0 errors, 2 warnings (unused vars)
npx tsc --noEmit      # TypeScript — 0 errors
npm test -- --runInBand  # Jest — pipeline + FFT + enrollment + App smoke
```

---

## Project Structure

```
src/
  pipeline/
    constants.ts       – pipeline step / edge-case labels
    verification.ts    – runVerificationPipeline() core logic + all types
    enrollment.ts      – averageEmbedding, missingAngles
  services/
    FaceDetector.ts    – YOLOv8 TFLite wrapper
    FaceRecognizer.ts  – MobileFaceNet TFLite wrapper + cosine similarity
    LivenessEngine.ts  – MiniFASNet TFLite wrapper
    FFTAnalyzer.ts     – pure-JS DFT spectral flatness anti-spoof
    PipelineRunner.ts  – composition root; flip USE_STUB to go live
    ModelStub.ts       – synthetic model outputs for demo mode
    SQLiteLogger.ts    – react-native-quick-sqlite logging + enrollment DB
    GpsLocator.ts      – react-native-geolocation-service wrapper
  ui/
    CameraOverlay.tsx  – animated scan line + corner markers
    ResultBanner.tsx   – animated Verified / Blocked / Retry banner
  theme.ts             – colors, radii, spacing tokens
assets/models/         – drop .tflite files here
tools/model-conversion/ – Python scripts for YOLOv8 and MobileFaceNet
```

---

## Evaluation Criteria Alignment

| Criterion | Weight | Approach |
|---|---|---|
| Innovation (edge AI, <20 MB) | 30 | TFLite INT8/FP16 quantisation via conversion scripts; FFT+MiniFASNet anti-spoof |
| Feasibility (<1 s on mid-range) | 30 | `runSync` synchronous TFLite inference; single photo trigger; no network |
| Scalability (sync/purge) | 20 | SQLite log with `outcome`, `lat`, `lng`, timestamp; ready for AWS sync column |
| Presentation & docs | 20 | Typed codebase, architecture diagram, model sourcing guide, passing lint+tsc+tests |

---

## Known Limitations (MVP)

- Pixel buffer from `takePhoto()` is not yet decoded into a `Uint8Array` for
  real model inference — this requires a native image-reading bridge or
  `react-native-nitro-image`. The stub mode covers the demo.
- Enrollment screen UI is planned (data model + DB tables are ready in SQLiteLogger).
- iOS is structurally supported but untested on this repo.

---

## License

Open-source for hackathon purposes. Models are subject to their own licences
(Ultralytics AGPL-3, MobileFaceNet MIT, MiniFASNet MIT).
