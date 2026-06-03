import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './src/navigation/types';
import { colors } from './src/theme';
import HomeScreen from './src/screens/HomeScreen';
import VerifyScreen from './src/screens/VerifyScreen';
import EnrollScreen from './src/screens/EnrollScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SplashScreen from './src/screens/SplashScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.primary,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Verify" component={VerifyScreen} options={{ title: 'Verify Identity' }} />
          <Stack.Screen name="Enroll" component={EnrollScreen} options={{ title: 'Enroll Worker' }} />
          <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'Verification History' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
