export const PIPELINE_STEPS = [
  { id: 'environment', label: 'Environment check (day/night/backlit)' },
  { id: 'detect', label: 'Face detect (YOLO)' },
  { id: 'liveness', label: 'Liveness check (MiniFASNet + FFT)' },
  { id: 'match', label: 'Face match (MobileFaceNet)' },
  { id: 'log', label: 'Log result (SQLite + GPS)' },
];

export const ENROLLMENT_STEPS = [
  { id: 'angles', label: 'Capture 5 angles automatically' },
  { id: 'average', label: 'Average embeddings for accuracy' },
];

export const ENROLLMENT_ANGLES = [
  'front',
  'left',
  'right',
  'up',
  'down',
] as const;

export const EDGE_CASES = [
  { id: 'no_face', label: 'No face detected', action: 'Retry message' },
  { id: 'spoof', label: 'Spoof detected', action: 'Block + log attempt' },
  { id: 'low_conf', label: 'Low confidence', action: 'Ask retake' },
  { id: 'multi_face', label: 'Multiple faces', action: 'Ask single person' },
];
