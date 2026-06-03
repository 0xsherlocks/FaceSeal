import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

type Props = {
  width: number;
  height: number;
};

export function CameraOverlay({ width, height }: Props) {
  const scanAnim = useRef(new Animated.Value(0)).current;
  const cornerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 2200,
          useNativeDriver: true,
        }),
      ]),
    );

    const cornerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(cornerAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(cornerAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );

    scanLoop.start();
    cornerLoop.start();

    return () => {
      scanLoop.stop();
      cornerLoop.stop();
    };
  }, [cornerAnim, scanAnim]);

  const overlay = useMemo(() => {
    const ovalWidth = Math.min(width * 0.72, 280);
    const ovalHeight = Math.min(height * 0.7, ovalWidth * 1.25);
    const lineTravel = Math.max(ovalHeight - 12, 12);

    return {
      ovalWidth,
      ovalHeight,
      lineTravel,
    };
  }, [height, width]);

  const lineTranslate = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, overlay.lineTravel],
  });

  const cornerOpacity = cornerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  const cornerScale = cornerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1.04],
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.centerWrap}>
        <View
          style={[
            styles.faceArea,
            {
              width: overlay.ovalWidth,
              height: overlay.ovalHeight,
            },
          ]}
        >
          <View
            style={[
              styles.oval,
              {
                borderRadius: overlay.ovalWidth / 2,
              },
            ]}
          />

          <Animated.View
            style={[
              styles.scanLine,
              {
                width: overlay.ovalWidth * 0.78,
                transform: [{ translateY: lineTranslate }],
              },
            ]}
          />

          <Animated.View
            style={[
              styles.cornerGroup,
              {
                opacity: cornerOpacity,
                transform: [{ scale: cornerScale }],
              },
            ]}
          >
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceArea: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  oval: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderColor: colors.secondary,
    backgroundColor: 'transparent',
  },
  scanLine: {
    position: 'absolute',
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.secondary,
    opacity: 0.9,
  },
  cornerGroup: {
    ...StyleSheet.absoluteFill,
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: colors.primary,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
});
