// Mock for react-native-vision-camera (v5 / Nitro)
const React = require('react');
const mockDevice = { id: 'mock-front', position: 'front', name: 'Mock Front' };
const mockPhotoOutput = {
  capturePhoto: jest.fn().mockResolvedValue({ path: '/mock/photo.jpg', width: 112, height: 112 }),
};
module.exports = {
  Camera: ({ children }) => React.createElement('View', null, children),
  useCameraDevice: jest.fn(() => mockDevice),
  useCameraPermission: jest.fn(() => ({
    hasPermission: true,
    requestPermission: jest.fn().mockResolvedValue(true),
    status: 'authorized',
    canRequestPermission: false,
  })),
  usePhotoOutput: jest.fn(() => mockPhotoOutput),
  useFrameOutput: jest.fn(() => ({})),
};
