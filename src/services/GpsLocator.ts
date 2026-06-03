import Geolocation from 'react-native-geolocation-service';
import type { LocationPoint } from '../pipeline/verification';

const TIMEOUT_MS = 5000;
const MAX_AGE_MS = 10000;

export function getCurrentLocation(): Promise<LocationPoint | null> {
  return new Promise(resolve => {
    Geolocation.getCurrentPosition(
      position => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? undefined,
        });
      },
      _error => {
        // Location unavailable (offline / permission denied): return null
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: TIMEOUT_MS,
        maximumAge: MAX_AGE_MS,
      },
    );
  });
}
