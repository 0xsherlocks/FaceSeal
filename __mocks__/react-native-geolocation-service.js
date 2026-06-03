// Mock for react-native-geolocation-service
const Geolocation = {
  getCurrentPosition: jest.fn((resolve, _reject, _options) => {
    resolve({
      coords: {
        latitude: 28.6139,
        longitude: 77.209,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    });
  }),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
  stopObserving: jest.fn(),
  requestAuthorization: jest.fn().mockResolvedValue('whenInUse'),
};

module.exports = Geolocation;
