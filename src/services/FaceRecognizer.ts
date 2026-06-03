import { loadTensorflowModel, type ModelSource, type TensorflowModelDelegate } from 'react-native-fast-tflite';

export type FaceEmbedding = number[];

export type FaceDatabaseRecord = {
  id: string;
  embedding: FaceEmbedding;
};

export type FaceMatchResult = {
  matched: boolean;
  similarity: number;
  bestMatch?: FaceDatabaseRecord;
};

export type FaceEmbeddingInput = ArrayBuffer | ArrayBufferView | number[];

const DEFAULT_MODEL_SOURCE = undefined as unknown as ModelSource;

export class FaceRecognizer {
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

  async embed(faceCrop112: FaceEmbeddingInput): Promise<FaceEmbedding> {
    const model = await this.load();
    const outputs = model.runSync([toArrayBuffer(faceCrop112)]);

    if (outputs.length === 0) {
      return [];
    }

    return Array.from(new Float32Array(outputs[0].slice(0)));
  }

  matchAgainstDatabase(
    embedding: FaceEmbedding,
    database: FaceDatabaseRecord[],
    minimumSimilarity = 0.8,
  ): FaceMatchResult {
    let bestMatch: FaceDatabaseRecord | undefined;
    let bestSimilarity = -1;

    for (const record of database) {
      const similarity = cosineSimilarity(embedding, record.embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = record;
      }
    }

    return {
      matched: bestSimilarity >= minimumSimilarity,
      similarity: bestSimilarity < 0 ? 0 : bestSimilarity,
      bestMatch,
    };
  }
}

function cosineSimilarity(left: FaceEmbedding, right: FaceEmbedding): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  if (denominator === 0) {
    return 0;
  }

  return clamp01((dotProduct / denominator + 1) / 2);
}

function toArrayBuffer(input: FaceEmbeddingInput): ArrayBuffer {
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
