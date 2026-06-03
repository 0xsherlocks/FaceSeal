import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../theme';
import type { VerificationOutcome } from '../pipeline/verification';

type Props = {
  outcome: VerificationOutcome | null;
};

const CONFIG: Record<
  VerificationOutcome['status'],
  { bg: string; border: string; icon: string; label: string }
> = {
  success: {
    bg: '#E6FAF0',
    border: colors.success,
    icon: '✓',
    label: 'Verified',
  },
  blocked: {
    bg: '#FDECEA',
    border: colors.danger,
    icon: '✕',
    label: 'Blocked',
  },
  retry: {
    bg: '#FFF8E1',
    border: '#FFA000',
    icon: '↻',
    label: 'Retry',
  },
};

export function ResultBanner({ outcome }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (!outcome) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 16,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    // Reset then slide in
    opacity.setValue(0);
    translateY.setValue(16);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, outcome, translateY]);

  if (!outcome) {
    return null;
  }

  const cfg = CONFIG[outcome.status];
  const detail =
    outcome.status === 'success'
      ? `Similarity: ${Math.round(outcome.similarity * 100)}%`
      : outcome.message;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.border,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: cfg.border }]}>
        <Text style={styles.icon}>{cfg.icon}</Text>
      </View>
      <View style={styles.textGroup}>
        <Text style={[styles.label, { color: cfg.border }]}>{cfg.label}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  textGroup: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  detail: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
});
