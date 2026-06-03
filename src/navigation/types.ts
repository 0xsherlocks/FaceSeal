import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Splash: undefined;
  Home: undefined;
  Verify: undefined;
  Enroll: undefined;
  History: undefined;
};

export type NavProp<T extends keyof RootStackParamList> =
  NativeStackNavigationProp<RootStackParamList, T>;
