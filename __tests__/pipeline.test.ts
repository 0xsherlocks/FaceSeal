/**
 * Pure-logic unit tests — no native modules required.
 * All AI pipeline branches, enrollment maths, and FFT are covered here.
 */

import { averageEmbedding, averageEmbeddingFromCaptures, missingAngles } from '../src/pipeline/enrollment';
import { runVerificationPipeline } from '../src/pipeline/verification';
import type { PipelineDeps, FaceBox, EnvironmentCheckResult, FaceDetectionResult, LivenessResult, MatchResult } from '../src/pipeline/verification';
import { FFTAnalyzer } from '../src/services/FFTAnalyzer';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeBox(score = 0.92): FaceBox {
  return { x: 0.2, y: 0.1, width: 0.6, height: 0.8, score };
}

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  const goodEnv: EnvironmentCheckResult = { condition: 'normal', confidence: 0.95 };
  const goodDetect: FaceDetectionResult = {
    faces: [makeBox()],
    primaryFace: makeBox(),
  };
  const goodLiveness: LivenessResult = { isLive: true, score: 0.88, method: 'minifasnet_fft' };
  const goodMatch: MatchResult = { isMatch: true, similarity: 0.91 };

  return {
    checkEnvironment: jest.fn().mockResolvedValue(goodEnv),
    detectFace: jest.fn().mockResolvedValue(goodDetect),
    checkLiveness: jest.fn().mockResolvedValue(goodLiveness),
    matchFace: jest.fn().mockResolvedValue(goodMatch),
    logResult: jest.fn().mockResolvedValue(undefined),
    getLocation: jest.fn().mockResolvedValue({ latitude: 28.61, longitude: 77.20 }),
    ...overrides,
  };
}

// ─── enrollment ───────────────────────────────────────────────────────────────

describe('averageEmbedding', () => {
  it('returns empty Float32Array for no inputs', () => {
    const result = averageEmbedding([]);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(0);
  });

  it('returns normalised single embedding unchanged (unit vector)', () => {
    const v = [3, 4]; // magnitude = 5
    const result = averageEmbedding([v]);
    expect(result[0]).toBeCloseTo(0.6, 5);
    expect(result[1]).toBeCloseTo(0.8, 5);
    // Should be unit length
    const norm = Math.sqrt(result[0] ** 2 + result[1] ** 2);
    expect(norm).toBeCloseTo(1, 5);
  });

  it('averages two embeddings then L2-normalises', () => {
    const result = averageEmbedding([[1, 0], [0, 1]]);
    const norm = Math.sqrt(result[0] ** 2 + result[1] ** 2);
    expect(norm).toBeCloseTo(1, 5);
    // Both components equal after averaging [0.5,0.5]
    expect(result[0]).toBeCloseTo(result[1], 5);
  });
});

describe('averageEmbeddingFromCaptures', () => {
  it('delegates to averageEmbedding correctly', () => {
    const captures = [
      { angle: 'front' as const, embedding: [1, 0] },
      { angle: 'left' as const, embedding: [0, 1] },
    ];
    const result = averageEmbeddingFromCaptures(captures);
    expect(result).toBeInstanceOf(Float32Array);
    const norm = Math.sqrt(result[0] ** 2 + result[1] ** 2);
    expect(norm).toBeCloseTo(1, 5);
  });
});

describe('missingAngles', () => {
  it('returns all angles when no captures', () => {
    const missing = missingAngles([]);
    expect(missing).toEqual(['front', 'left', 'right', 'up', 'down']);
  });

  it('returns only uncaptured angles', () => {
    const captures = [
      { angle: 'front' as const, embedding: [1, 0] },
      { angle: 'left' as const, embedding: [0, 1] },
    ];
    const missing = missingAngles(captures);
    expect(missing).toEqual(['right', 'up', 'down']);
  });

  it('returns empty array when all angles captured', () => {
    const captures = (['front', 'left', 'right', 'up', 'down'] as const).map(angle => ({
      angle,
      embedding: [1],
    }));
    expect(missingAngles(captures)).toEqual([]);
  });
});

// ─── verification pipeline ────────────────────────────────────────────────────

describe('runVerificationPipeline', () => {
  it('returns success when all steps pass', async () => {
    const deps = makeDeps();
    const result = await runVerificationPipeline(deps);
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.similarity).toBeGreaterThan(0);
    }
    expect(deps.logResult).toHaveBeenCalledTimes(1);
  });

  it('returns retry/lighting for night condition', async () => {
    const deps = makeDeps({
      checkEnvironment: jest.fn().mockResolvedValue({ condition: 'night', confidence: 0.9 }),
    });
    const result = await runVerificationPipeline(deps);
    expect(result.status).toBe('retry');
    if (result.status === 'retry') {
      expect(result.reason).toBe('lighting');
    }
    expect(deps.detectFace).not.toHaveBeenCalled();
  });

  it('returns retry/lighting for backlit condition', async () => {
    const deps = makeDeps({
      checkEnvironment: jest.fn().mockResolvedValue({ condition: 'backlit', confidence: 0.85 }),
    });
    const result = await runVerificationPipeline(deps);
    expect(result.status).toBe('retry');
    if (result.status === 'retry') {
      expect(result.reason).toBe('lighting');
    }
  });

  it('returns retry/no_face when no faces detected', async () => {
    const deps = makeDeps({
      detectFace: jest.fn().mockResolvedValue({ faces: [], primaryFace: undefined }),
    });
    const result = await runVerificationPipeline(deps);
    expect(result.status).toBe('retry');
    if (result.status === 'retry') {
      expect(result.reason).toBe('no_face');
    }
  });

  it('returns retry/multiple_faces for 2+ faces', async () => {
    const deps = makeDeps({
      detectFace: jest.fn().mockResolvedValue({
        faces: [makeBox(), makeBox(0.85)],
        primaryFace: makeBox(),
      }),
    });
    const result = await runVerificationPipeline(deps);
    expect(result.status).toBe('retry');
    if (result.status === 'retry') {
      expect(result.reason).toBe('multiple_faces');
    }
  });

  it('returns retry/low_confidence when detection score < threshold', async () => {
    const lowBox = makeBox(0.3); // below default 0.6 threshold
    const deps = makeDeps({
      detectFace: jest.fn().mockResolvedValue({
        faces: [lowBox],
        primaryFace: lowBox,
      }),
    });
    const result = await runVerificationPipeline(deps);
    expect(result.status).toBe('retry');
    if (result.status === 'retry') {
      expect(result.reason).toBe('low_confidence');
    }
  });

  it('returns blocked/spoof_detected when liveness fails', async () => {
    const deps = makeDeps({
      checkLiveness: jest.fn().mockResolvedValue({
        isLive: false,
        score: 0.2,
        method: 'minifasnet_fft' as const,
      }),
    });
    const result = await runVerificationPipeline(deps);
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.reason).toBe('spoof_detected');
    }
  });

  it('always calls logResult regardless of outcome', async () => {
    const deps = makeDeps({
      detectFace: jest.fn().mockResolvedValue({ faces: [], primaryFace: undefined }),
    });
    await runVerificationPipeline(deps);
    expect(deps.logResult).toHaveBeenCalledTimes(1);
  });

  it('calls getLocation and includes it in the log', async () => {
    const mockLocation = { latitude: 12.97, longitude: 77.59 };
    const deps = makeDeps({
      getLocation: jest.fn().mockResolvedValue(mockLocation),
    });
    await runVerificationPipeline(deps);
    const logCall = (deps.logResult as jest.Mock).mock.calls[0][0];
    expect(logCall.location).toEqual(mockLocation);
  });
});

// ─── FFT analyzer ─────────────────────────────────────────────────────────────

describe('FFTAnalyzer', () => {
  const analyzer = new FFTAnalyzer();

  it('returns zero-ish values for empty input', () => {
    const result = analyzer.analyze([]);
    expect(result.frequencyRegularity).toBe(0);
    expect(result.dominantFrequency).toBe(0);
    expect(result.spectralFlatness).toBe(1);
  });

  it('returns valid numbers for random pixel data', () => {
    const pixels = Array.from({ length: 256 }, (_, i) => i % 256);
    const result = analyzer.analyze(pixels);
    expect(result.frequencyRegularity).toBeGreaterThanOrEqual(0);
    expect(result.frequencyRegularity).toBeLessThanOrEqual(1);
    expect(result.spectralFlatness).toBeGreaterThanOrEqual(0);
    expect(result.spectralFlatness).toBeLessThanOrEqual(1);
    expect(typeof result.dominantFrequency).toBe('number');
  });

  it('returns high regularity for a sine-like signal', () => {
    const samples = Array.from({ length: 128 }, (_, i) =>
      Math.round(127 + 127 * Math.sin(2 * Math.PI * 4 * i / 128)),
    );
    const result = analyzer.analyze(samples);
    // A pure tone should have higher regularity than white noise
    expect(result.frequencyRegularity).toBeGreaterThan(0.1);
  });

  it('returns lower spectral flatness for pure tone than for noise', () => {
    const tone = Array.from({ length: 128 }, (_, i) =>
      Math.round(127 + 127 * Math.sin(2 * Math.PI * 8 * i / 128)),
    );
    const noise = Array.from({ length: 128 }, () => Math.floor(Math.random() * 256));
    const toneFlatness = analyzer.analyze(tone).spectralFlatness;
    const noiseFlatness = analyzer.analyze(noise).spectralFlatness;
    // Noise tends to be flatter than a pure tone
    expect(noiseFlatness).toBeGreaterThan(toneFlatness);
  });
});
