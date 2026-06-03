export type FFTAnalysisResult = {
  frequencyRegularity: number;
  dominantFrequency: number;
  spectralFlatness: number;
};

export type FacePixelInput = ArrayLike<number>;

export class FFTAnalyzer {
  analyze(facePixels: FacePixelInput): FFTAnalysisResult {
    const samples = normalizeSamples(facePixels);
    if (samples.length < 4) {
      return {
        frequencyRegularity: 0,
        dominantFrequency: 0,
        spectralFlatness: 1,
      };
    }

    const centered = centerSamples(samples);
    const spectrum = computeMagnitudeSpectrum(centered);
    const totalMagnitude = spectrum.reduce((sum, value) => sum + value, 0) || 1;
    const dominantMagnitude = Math.max(...spectrum);
    const dominantIndex = spectrum.indexOf(dominantMagnitude);
    const spectralFlatness = computeSpectralFlatness(spectrum);

    const regularityFromPeak = dominantMagnitude / totalMagnitude;
    const regularityFromFlatness = 1 - spectralFlatness;
    const frequencyRegularity = clamp01((regularityFromPeak + regularityFromFlatness) / 2);

    return {
      frequencyRegularity,
      dominantFrequency: dominantIndex / spectrum.length,
      spectralFlatness,
    };
  }
}

function normalizeSamples(input: FacePixelInput): Float32Array {
  const maxSamples = 256;
  const values = Array.from(input);
  if (values.length <= maxSamples) {
    return Float32Array.from(values, toNormalizedValue);
  }

  const sampled = new Float32Array(maxSamples);
  const step = values.length / maxSamples;
  for (let index = 0; index < maxSamples; index += 1) {
    sampled[index] = toNormalizedValue(values[Math.floor(index * step)] ?? 0);
  }

  return sampled;
}

function centerSamples(samples: Float32Array): Float32Array {
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return Float32Array.from(samples, value => value - mean);
}

function computeMagnitudeSpectrum(samples: Float32Array): number[] {
  const size = nextPowerOfTwo(samples.length);
  const spectrum: number[] = [];
  const sampleCount = Math.max(1, size / 2);

  for (let frequency = 1; frequency < sampleCount; frequency += 1) {
    let real = 0;
    let imaginary = 0;

    for (let index = 0; index < samples.length; index += 1) {
      const angle = (2 * Math.PI * frequency * index) / size;
      real += samples[index] * Math.cos(angle);
      imaginary -= samples[index] * Math.sin(angle);
    }

    spectrum.push(Math.sqrt(real * real + imaginary * imaginary));
  }

  return spectrum.length > 0 ? spectrum : [0];
}

function computeSpectralFlatness(spectrum: number[]): number {
  const epsilon = 1e-9;
  const safeSpectrum = spectrum.map(value => Math.max(value, epsilon));
  const arithmeticMean = safeSpectrum.reduce((sum, value) => sum + value, 0) / safeSpectrum.length;
  const geometricMean = Math.exp(
    safeSpectrum.reduce((sum, value) => sum + Math.log(value), 0) / safeSpectrum.length,
  );

  return clamp01(geometricMean / arithmeticMean);
}

function nextPowerOfTwo(value: number): number {
  let power = 1;
  while (power < value) {
    power *= 2;
  }

  return power;
}

function toNormalizedValue(value: number): number {
  return Number.isFinite(value) ? value / 255 : 0;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}
