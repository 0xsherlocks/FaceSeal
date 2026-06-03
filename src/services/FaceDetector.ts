import { loadTensorflowModel, type ModelSource, type TensorflowModelDelegate } from 'react-native-fast-tflite';

export type FaceBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
};

export type FaceDetectionInput = ArrayBuffer | ArrayBufferView | number[];

export type FaceDetectionResult = {
  face: FaceBoundingBox | null;
  faces: FaceBoundingBox[];
};

const DEFAULT_MODEL_SOURCE = undefined as unknown as ModelSource;

export class FaceDetector {
  private modelPromise?: ReturnType<typeof loadTensorflowModel>;

  constructor(
    private readonly modelSource: ModelSource = DEFAULT_MODEL_SOURCE,
    private readonly delegates: TensorflowModelDelegate[] = [],
  ) {}

  async load() {
    if (!this.modelPromise) {
      this.modelPromise = loadTensorflowModel(this.modelSource, this.delegates);
    }

    return this.modelPromise;
  }

  async detect(frame: FaceDetectionInput): Promise<FaceDetectionResult> {
    const model = await this.load();
    const outputs = model.runSync([toArrayBuffer(frame)]);
    const faces = decodeDetections(outputs);

    return {
      face: faces[0] ?? null,
      faces,
    };
  }
}

function decodeDetections(outputs: ArrayBuffer[]): FaceBoundingBox[] {
  if (outputs.length === 0) {
    return [];
  }

  const scores = toFloat32Array(outputs[0]);
  if (scores.length === 0) {
    return [];
  }

  const detections: FaceBoundingBox[] = [];

  if (scores.length >= 5) {
    const stride = scores.length % 5 === 0 ? 5 : 6;
    for (let index = 0; index + 4 < scores.length; index += stride) {
      const score = clamp01(scores[index + 4]);
      if (score < 0.01) {
        continue;
      }

      detections.push({
        x: clamp01(scores[index]),
        y: clamp01(scores[index + 1]),
        width: clamp01(scores[index + 2]),
        height: clamp01(scores[index + 3]),
        score,
      });
    }
  } else {
    detections.push({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      score: clamp01(scores[0]),
    });
  }

  return detections.sort((left, right) => right.score - left.score);
}

function toArrayBuffer(input: FaceDetectionInput): ArrayBuffer {
  if (input instanceof ArrayBuffer) {
    return input;
  }

  if (ArrayBuffer.isView(input)) {
    return copyArrayBufferView(input);
  }

  return Float32Array.from(input).buffer;
}

function copyArrayBufferView(input: ArrayBufferView): ArrayBuffer {
  const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return Uint8Array.from(bytes).buffer;
}

function toFloat32Array(buffer: ArrayBuffer): Float32Array {
  return new Float32Array(buffer.slice(0));
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}
