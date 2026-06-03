// Mock for react-native-fast-tflite v3
// loadTensorflowModel returns a stub TfliteModel whose runSync returns
// a single all-zeros ArrayBuffer.

const mockModel = {
  delegates: [],
  inputs: [{ name: 'input', dataType: 'float32', shape: [1, 112, 112, 3] }],
  outputs: [{ name: 'output', dataType: 'float32', shape: [1, 128] }],
  runSync: jest.fn((_inputs) => {
    // Return 128-float zero vector
    return [new Float32Array(128).buffer];
  }),
  run: jest.fn(async (_inputs) => {
    return [new Float32Array(128).buffer];
  }),
};

module.exports = {
  loadTensorflowModel: jest.fn().mockResolvedValue(mockModel),
  useTensorflowModel: jest.fn(() => ({
    state: 'loaded',
    model: mockModel,
    error: undefined,
  })),
};
