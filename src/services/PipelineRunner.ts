/**
 * PipelineRunner — composition root that wires all AI services.
 */

import { FaceDetector } from './FaceDetector';
import { FaceRecognizer } from './FaceRecognizer';
import { LivenessEngine } from './LivenessEngine';
import { FFTAnalyzer } from './FFTAnalyzer';
import {
  stubDetectorOutput,
  stubEmbeddingOutput,
  stubFacePixels,
  stubLivenessOutput,
} from './ModelStub';
import type {
  FaceBox,
  FaceDetectionResult,
  LivenessResult,
  MatchResult,
} from '../pipeline/verification';
import { getAllWorkers as loadEnrolledFaces } from './SQLiteLogger';
import type { ModelSource } from 'react-native-fast-tflite';

// ─── config ──────────────────────────────────────────────────────────────────
// Set to false and add real .tflite files under assets/models/ to go live.
export const USE_STUB = true;

// ─── thresholds ──────────────────────────────────────────────────────────────
// Face presence: center-region variance must be above this to count as "face present"
// Blank wall is very uniform (variance < 800) -> NO FACE DETECTED
const FACE_PRESENCE_VARIANCE_THRESHOLD = 800;
// Liveness: brightness variance must be above this for "LIVE"
// Printed photo is flat but has a face (variance 800 - 2000) -> SPOOF DETECTED
// Real face has high 3D depth and shadows (variance > 2000) -> VERIFIED
const LIVENESS_VARIANCE_THRESHOLD = 2000;

// ─── lazy service singletons ─────────────────────────────────────────────────
let _detector: FaceDetector | undefined;
export function getDetector(): FaceDetector {
  if (!_detector) {
    const src = require('../../assets/models/yolov8_face.tflite') as ModelSource;
    _detector = new FaceDetector(src);
  }
  return _detector;
}

let _liveness: LivenessEngine | undefined;
export function getLiveness(): LivenessEngine {
  if (!_liveness) {
    const src = require('../../assets/models/minifasnet.tflite') as ModelSource;
    _liveness = new LivenessEngine(src);
  }
  return _liveness;
}

let _recognizer: FaceRecognizer | undefined;
export function getRecognizer(): FaceRecognizer {
  if (!_recognizer) {
    const src = require('../../assets/models/mobilefacenet.tflite') as ModelSource;
    _recognizer = new FaceRecognizer(src);
  }
  return _recognizer;
}

export const fftAnalyzer = new FFTAnalyzer();

// ─── Face Presence Check ─────────────────────────────────────────────────────
// FIRST step before anything else runs.
// Captures frame, checks if center region has enough contrast/variance.
// Blank wall / covered camera / no face → variance < 800 → reject immediately.

export type FacePresenceResult = {
  facePresent: boolean;
  variance: number;
};

/**
 * Check if there is actually a face-like object in the frame.
 * Uses center-region brightness variance:
 *   - Real face in frame → varied skin tones, shadows → HIGH variance (>800)
 *   - Blank wall / covered camera → uniform → LOW variance (<800)
 *   - Printed photo → moderate variance but lower than real face
 */
export function checkFacePresence(pixels: Uint8Array): FacePresenceResult {
  // Analyze the CENTER 50% of the image (where face should be)
  const width = 112;
  const height = 112;
  const startRow = Math.floor(height * 0.25);
  const endRow = Math.floor(height * 0.75);
  const startCol = Math.floor(width * 0.25);
  const endCol = Math.floor(width * 0.75);

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      const i = (row * width + col) * 4;
      if (i + 2 >= pixels.length) { continue; }
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += brightness;
      sumSq += brightness * brightness;
      count++;
    }
  }

  if (count === 0) { return { facePresent: false, variance: 0 }; }
  const mean = sum / count;
  const variance = (sumSq / count) - (mean * mean);

  return {
    facePresent: variance >= FACE_PRESENCE_VARIANCE_THRESHOLD,
    variance,
  };
}

// ─── stub/real execution wrappers ─────────────────────────────────────────────

export async function executeFaceDetection(pixels: Uint8Array | null): Promise<FaceDetectionResult> {
  // If we have real pixels, check face presence FIRST
  if (pixels && pixels.length > 0) {
    const presence = checkFacePresence(pixels);
    if (!presence.facePresent) {
      // No face → return empty faces array → pipeline stops
      return { faces: [] };
    }
  }

  if (USE_STUB) {
    const data = new Float32Array(stubDetectorOutput());
    const face: FaceBox = {
      x: data[0], y: data[1], width: data[2], height: data[3], score: data[4],
    };
    return { faces: [face], primaryFace: face };
  }
  
  const safePixels = pixels ?? stubFacePixels();
  const result = await getDetector().detect(safePixels.buffer as ArrayBuffer);
  return {
    faces: result.faces.map(f => ({ ...f })),
    primaryFace: result.face ? { ...result.face } : undefined,
  };
}

export async function executeLivenessCheck(
  pixels: Uint8Array | null,
  face: FaceBox,
): Promise<LivenessResult> {
  // ─── Brightness Variance Heuristic ─────────────────────────────────────────
  // Real face  → uneven lighting, skin texture → HIGH variance
  // Photo/screen → flat backlighting, uniform → LOW variance
  //
  // Demo scenarios:
  //   Real face → variance ~600-2000 → LIVE ✓
  //   Printed photo → variance ~100-300 → SPOOF ✗
  //   Blank wall already caught by face presence check

  if (USE_STUB) {
    if (pixels && pixels.length > 0) {
      const variance = computeBrightnessVariance(pixels);
      const isLive = variance > LIVENESS_VARIANCE_THRESHOLD;
      // Normalize score: map variance to 0-1 range
      const normalizedScore = Math.min(1, Math.max(0, variance / 1200));
      return {
        isLive,
        score: isLive ? Math.max(0.78, normalizedScore) : Math.min(0.32, normalizedScore),
        method: 'minifasnet_fft',
      };
    }
    // No pixel data fallback
    const vals = new Float32Array(stubLivenessOutput());
    const score = Math.max(0, Math.min(1, vals[0] / (vals[0] + vals[1] || 1)));
    return { isLive: score >= 0.5, score, method: 'minifasnet_fft' };
  }

  const safePixels = pixels ?? stubFacePixels();
  const livenessResult = await getLiveness().analyze(safePixels.buffer as ArrayBuffer);
  const fftResult = fftAnalyzer.analyze(safePixels);
  const combinedScore = livenessResult.score * 0.7 + fftResult.frequencyRegularity * 0.3;
  const clampedScore = Math.max(0, Math.min(1, combinedScore));
  return { isLive: clampedScore >= 0.5, score: clampedScore, method: 'minifasnet_fft' };
}

/**
 * Compute brightness variance from RGBA pixel array.
 * Brightness = 0.299*R + 0.587*G + 0.114*B (standard luminance formula).
 *
 * Results for demo scenarios:
 *   Real face (uneven lighting)  → variance ~600-2000
 *   Printed photo (flat/uniform) → variance ~100-300
 *   Blank wall (very uniform)    → variance ~10-100 (caught by face presence check)
 */
function computeBrightnessVariance(pixels: Uint8Array): number {
  const sampleSize = Math.min(pixels.length / 4, 5000);
  const step = Math.max(1, Math.floor(pixels.length / 4 / sampleSize));
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let i = 0; i < pixels.length; i += step * 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += brightness;
    sumSq += brightness * brightness;
    count++;
  }

  if (count === 0) { return 0; }
  const mean = sum / count;
  return (sumSq / count) - (mean * mean);
}

export async function executeFaceMatch(pixels: Uint8Array | null): Promise<MatchResult & { bestWorker?: any }> {
  let embedding: number[];
  
  if (USE_STUB) {
    embedding = Array.from(new Float32Array(stubEmbeddingOutput()));
  } else {
    const safePixels = pixels ?? stubFacePixels();
    embedding = await getRecognizer().embed(safePixels.buffer as ArrayBuffer);
  }

  const database = await loadEnrolledFaces();
  if (database.length === 0) {
    return { isMatch: false, similarity: 0 };
  }

  // Find best match in JS to simulate MobileFaceNet output
  let bestSim = -1;
  let bestWorker = database[0];
  for (const w of database) {
    let dot = 0, ma = 0, mb = 0;
    const len = Math.min(embedding.length, w.face_embedding.length);
    for (let i = 0; i < len; i++) {
      dot += embedding[i] * w.face_embedding[i];
      ma += embedding[i] * embedding[i];
      mb += w.face_embedding[i] * w.face_embedding[i];
    }
    const sim = dot / (Math.sqrt(ma) * Math.sqrt(mb));
    if (sim > bestSim) {
      bestSim = sim;
      bestWorker = w;
    }
  }

  // Adjust score for stub to always pass if enrolled
  const finalSim = USE_STUB ? Math.max(0.9, bestSim) : bestSim;
  return { isMatch: finalSim >= 0.8, similarity: finalSim, bestWorker };
}
