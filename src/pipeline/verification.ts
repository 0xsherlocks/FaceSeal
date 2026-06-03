export type LightingCondition = 'day' | 'night' | 'backlit' | 'normal';

export type EnvironmentCheckResult = {
  condition: LightingCondition;
  confidence: number;
};

export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
};

export type FaceDetectionResult = {
  faces: FaceBox[];
  primaryFace?: FaceBox;
};

export type LivenessResult = {
  isLive: boolean;
  score: number;
  method: 'minifasnet_fft';
};

export type MatchResult = {
  isMatch: boolean;
  similarity: number;
};

export type LocationPoint = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

export type VerificationOutcome =
  | {
      status: 'success';
      similarity: number;
    }
  | {
      status: 'retry';
      reason: 'no_face' | 'multiple_faces' | 'low_confidence' | 'lighting';
      message: string;
    }
  | {
      status: 'blocked';
      reason: 'spoof_detected';
      message: string;
    };

export type VerificationLogEntry = {
  timestamp: number;
  outcome: VerificationOutcome;
  environment: EnvironmentCheckResult;
  faceCount: number;
  liveness?: LivenessResult;
  match?: MatchResult;
  location?: LocationPoint | null;
};

export type PipelineDeps = {
  checkEnvironment: () => Promise<EnvironmentCheckResult>;
  detectFace: () => Promise<FaceDetectionResult>;
  checkLiveness: (face: FaceBox) => Promise<LivenessResult>;
  matchFace: (face: FaceBox) => Promise<MatchResult>;
  logResult: (entry: VerificationLogEntry) => Promise<void>;
  getLocation?: () => Promise<LocationPoint | null>;
};

export type Thresholds = {
  minDetectScore: number;
  minLivenessScore: number;
  minMatchScore: number;
};

const defaultThresholds: Thresholds = {
  minDetectScore: 0.6,
  minLivenessScore: 0.75,
  minMatchScore: 0.8,
};

export async function runVerificationPipeline(
  deps: PipelineDeps,
  thresholds: Thresholds = defaultThresholds,
): Promise<VerificationOutcome> {
  const environment = await deps.checkEnvironment();

  if (environment.condition === 'night' || environment.condition === 'backlit') {
    return finalize(
      deps,
      environment,
      0,
      {
        status: 'retry',
        reason: 'lighting',
        message: 'Adjust lighting and try again.',
      },
    );
  }

  const detection = await deps.detectFace();
  const faceCount = detection.faces.length;

  if (faceCount === 0) {
    return finalize(
      deps,
      environment,
      faceCount,
      {
        status: 'retry',
        reason: 'no_face',
        message: 'No face detected. Please retry.',
      },
    );
  }

  if (faceCount > 1) {
    return finalize(
      deps,
      environment,
      faceCount,
      {
        status: 'retry',
        reason: 'multiple_faces',
        message: 'Multiple faces detected. Use one person only.',
      },
    );
  }

  const primaryFace = detection.primaryFace ?? detection.faces[0];
  if (primaryFace.score < thresholds.minDetectScore) {
    return finalize(
      deps,
      environment,
      faceCount,
      {
        status: 'retry',
        reason: 'low_confidence',
        message: 'Low detection confidence. Please retake.',
      },
    );
  }

  const liveness = await deps.checkLiveness(primaryFace);
  if (!liveness.isLive || liveness.score < thresholds.minLivenessScore) {
    return finalize(
      deps,
      environment,
      faceCount,
      {
        status: 'blocked',
        reason: 'spoof_detected',
        message: 'Spoof detected. Attempt blocked.',
      },
      liveness,
    );
  }

  const match = await deps.matchFace(primaryFace);
  if (!match.isMatch || match.similarity < thresholds.minMatchScore) {
    return finalize(
      deps,
      environment,
      faceCount,
      {
        status: 'retry',
        reason: 'low_confidence',
        message: 'Low match confidence. Please retake.',
      },
      liveness,
      match,
    );
  }

  return finalize(
    deps,
    environment,
    faceCount,
    {
      status: 'success',
      similarity: match.similarity,
    },
    liveness,
    match,
  );
}

async function finalize(
  deps: PipelineDeps,
  environment: EnvironmentCheckResult,
  faceCount: number,
  outcome: VerificationOutcome,
  liveness?: LivenessResult,
  match?: MatchResult,
): Promise<VerificationOutcome> {
  const location = deps.getLocation ? await deps.getLocation() : null;
  await deps.logResult({
    timestamp: Date.now(),
    outcome,
    environment,
    faceCount,
    liveness,
    match,
    location,
  });

  return outcome;
}
