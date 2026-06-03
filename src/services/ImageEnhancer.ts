/**
 * Image enhancement for challenging lighting — pure JS, no native deps.
 * Used before ML inference to improve accuracy in harsh sunlight / low light.
 */

/** Apply gamma correction to RGBA pixel data in-place. */
export function gammaCorrection(pixels: Uint8Array, gamma: number): void {
  const invGamma = 1.0 / gamma;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(255 * Math.pow(i / 255, invGamma));
  }
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = lut[pixels[i]];
    pixels[i + 1] = lut[pixels[i + 1]];
    pixels[i + 2] = lut[pixels[i + 2]];
    // alpha unchanged
  }
}

/** Apply histogram equalization on luminance channel (RGBA data, in-place). */
export function histogramEqualization(pixels: Uint8Array): void {
  const hist = new Uint32Array(256);
  const count = pixels.length / 4;
  // Build luminance histogram
  for (let i = 0; i < pixels.length; i += 4) {
    const lum = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    hist[lum]++;
  }
  // CDF
  const cdf = new Uint32Array(256);
  cdf[0] = hist[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + hist[i];
  }
  const cdfMin = cdf.find(v => v > 0) ?? 0;
  const denom = Math.max(1, count - cdfMin);
  // Build LUT
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(((cdf[i] - cdfMin) / denom) * 255);
  }
  // Apply per-channel scaling based on luminance shift
  for (let i = 0; i < pixels.length; i += 4) {
    const oldLum = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    const newLum = lut[oldLum];
    if (oldLum > 0) {
      const scale = newLum / oldLum;
      pixels[i] = Math.min(255, Math.round(pixels[i] * scale));
      pixels[i + 1] = Math.min(255, Math.round(pixels[i + 1] * scale));
      pixels[i + 2] = Math.min(255, Math.round(pixels[i + 2] * scale));
    }
  }
}

/** Auto-enhance: apply adaptive gamma + histogram eq for outdoor conditions. */
export function autoEnhance(pixels: Uint8Array): void {
  // Measure average luminance
  let totalLum = 0;
  const count = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    totalLum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }
  const avgLum = totalLum / Math.max(1, count);
  // Dark scene: brighten with gamma < 1
  if (avgLum < 80) {
    gammaCorrection(pixels, 0.6);
  }
  // Bright scene: darken with gamma > 1
  else if (avgLum > 200) {
    gammaCorrection(pixels, 1.6);
  }
  histogramEqualization(pixels);
}
