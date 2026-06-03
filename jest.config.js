module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    'react-native-vision-camera': '<rootDir>/__mocks__/react-native-vision-camera.js',
    'react-native-fast-tflite': '<rootDir>/__mocks__/react-native-fast-tflite.js',
    'react-native-quick-sqlite': '<rootDir>/__mocks__/react-native-quick-sqlite.js',
    'react-native-geolocation-service': '<rootDir>/__mocks__/react-native-geolocation-service.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-vision-camera|react-native-fast-tflite|react-native-reanimated|react-native-safe-area-context|react-native-screens|react-native-nitro-modules|react-native-worklets|@react-navigation)/)',
  ],
};
