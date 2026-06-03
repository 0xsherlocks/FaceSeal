import { ENROLLMENT_ANGLES } from './constants';

export type EnrollmentAngle = (typeof ENROLLMENT_ANGLES)[number];

export type EnrollmentCapture = {
  angle: EnrollmentAngle;
  embedding: number[];
};

export function averageEmbedding(embeddings: number[][]): Float32Array {
  if (embeddings.length === 0) {
    return new Float32Array(0);
  }

  const length = embeddings[0].length;
  const sum = new Float32Array(length);

  for (const vector of embeddings) {
    for (let i = 0; i < length; i += 1) {
      sum[i] += vector[i];
    }
  }

  const scale = 1 / embeddings.length;
  for (let i = 0; i < length; i += 1) {
    sum[i] *= scale;
  }

  const norm = Math.sqrt(sum.reduce((acc, value) => acc + value * value, 0));
  if (norm > 0) {
    for (let i = 0; i < length; i += 1) {
      sum[i] /= norm;
    }
  }

  return sum;
}

export function averageEmbeddingFromCaptures(
  captures: EnrollmentCapture[],
): Float32Array {
  return averageEmbedding(captures.map(capture => capture.embedding));
}

export function missingAngles(captures: EnrollmentCapture[]): EnrollmentAngle[] {
  const captured = new Set(captures.map(capture => capture.angle));
  return ENROLLMENT_ANGLES.filter(angle => !captured.has(angle));
}
