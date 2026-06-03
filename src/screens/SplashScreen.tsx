import React, { useEffect, useRef } from 'react';
import { StyleSheet, Image, Animated, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NavProp } from '../navigation/types';
import { colors } from '../theme';

export default function SplashScreen() {
  const nav = useNavigation<NavProp<'Splash'>>();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const textFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // After logo appears, fade in text
      Animated.timing(textFade, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    });

    const timer = setTimeout(() => {
      // Reset navigation stack so there's no "back" to splash
      nav.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        }),
      );
    }, 2500);

    return () => clearTimeout(timer);
  }, [nav, fadeAnim, scaleAnim, textFade]);

  return (
    <SafeAreaView style={s.container}>
      <Animated.View style={[s.logoWrap, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <Image 
          source={require('../../assets/logo.png')} 
          style={s.logo} 
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.View style={[s.textWrap, { opacity: textFade }]}>
        <Text style={s.tagline}>Offline Face Verification</Text>
        <Text style={s.sub}>NHAI · Zero Internet Required</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
  },
  logo: {
    width: 220,
    height: 220,
  },
  textWrap: {
    alignItems: 'center',
    marginTop: 16,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  sub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    fontWeight: '500',
  },
});
