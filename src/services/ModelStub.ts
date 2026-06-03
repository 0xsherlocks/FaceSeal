/**
 * ModelStub — returns plausible synthetic outputs for every model type.
 * Used when USE_STUB = true in PipelineRunner (no real .tflite on disk).
 * Flip USE_STUB to false and supply real assets to go live.
 */

// ─── face detector stub ──────────────────────────────────────────────────────
// Returns one detection: centered box, score 0.92
// Encoded as flat [x, y, w, h, score] = 5 floats in a Float32Array.
export function stubDetectorOutput(): ArrayBuffer {
  return Float32Array.from([0.2, 0.1, 0.6, 0.8, 0.92]).buffer;
}

// ─── liveness stub ───────────────────────────────────────────────────────────
// Returns [live_prob, spoof_prob] normalised to ~1.
// live_prob = 0.88 → score after softmax ≈ 0.88.
export function stubLivenessOutput(): ArrayBuffer {
  return Float32Array.from([0.88, 0.12]).buffer;
}

// ─── recogniser stub ─────────────────────────────────────────────────────────
// Returns a 128-dim unit vector (all same value, normalised).
export function stubEmbeddingOutput(): ArrayBuffer {
  const dim = 128;
  const value = 1 / Math.sqrt(dim);
  return Float32Array.from(Array(dim).fill(value)).buffer;
}

// ─── pixel stub ──────────────────────────────────────────────────────────────
// Returns a flat RGBA byte array for a 112×112 face crop (mid-brightness).
export function stubFacePixels(width = 112, height = 112): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 160;     // R
    pixels[i + 1] = 140; // G
    pixels[i + 2] = 130; // B
    pixels[i + 3] = 255; // A
  }
  return pixels;
}
