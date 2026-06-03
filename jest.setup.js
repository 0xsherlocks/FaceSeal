/* eslint-env jest */

jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Camera: React.memo(({ style }) =>
      React.createElement(View, { style, testID: 'mock-camera' }),
    ),
    useCameraDevice: position => ({ id: `mock-${position}-camera`, position }),
    useCameraPermission: () => ({
      status: 'authorized',
      hasPermission: true,
      canRequestPermission: false,
      requestPermission: async () => true,
    }),
  };
});
