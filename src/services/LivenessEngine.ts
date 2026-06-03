import { loadTensorflowModel, type ModelSource, type TensorflowModelDelegate } from 'react-native-fast-tflite';

export type LivenessResult = {
  score: number;
  isLive: boolean;
};

export type LivenessInput = ArrayBuffer | ArrayBufferView | number[];

const DEFAULT_MODEL_SOURCE = undefined as unknown as ModelSource;

export class LivenessEngine {
  private modelPromise?: ReturnType<typeof loadTensorflowModel>;

  constructor(
    private readonly modelSource: ModelSource = DEFAULT_MODEL_SOURCE,
    private readonly delegates: TensorflowModelDelegate[] = [],
    private readonly liveThreshold = 0.5,
  ) {}

  async load() {
    if (!this.modelPromise) {
      this.modelPromise = loadTensorflowModel(this.modelSource, this.delegates);
    }

    return this.modelPromise;
  }

  async analyze(faceCrop: LivenessInput): Promise<LivenessResult> {
    const model = await this.load();
    const outputs = model.runSync([toArrayBuffer(faceCrop)]);
    const score = decodeLivenessScore(outputs);

    return {
      score,
      isLive: score >= this.liveThreshold,
    };
  }
}

function decodeLivenessScore(outputs: ArrayBuffer[]): number {
  if (outputs.length === 0) {
    return 0;
  }

  const values = new Float32Array(outputs[0].slice(0));
  if (values.length === 0) {
    return 0;
  }

  if (values.length === 1) {
    return clamp01(values[0]);
  }

  if (values.length >= 2) {
    const live = clamp01(values[0]);
    const spoof = clamp01(values[1]);
    const total = live + spoof;
    if (total > 0) {
      return clamp01(live / total);
    }
  }

  return clamp01(values[0]);
}

function toArrayBuffer(input: LivenessInput): ArrayBuffer {
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

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}
