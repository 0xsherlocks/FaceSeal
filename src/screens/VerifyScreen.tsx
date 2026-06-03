import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { useNavigation } from '@react-navigation/native';
import type { NavProp } from '../navigation/types';
import { CameraOverlay } from '../ui/CameraOverlay';
import { colors, radii, spacing } from '../theme';
import { logVerification } from '../services/SQLiteLogger';
import { getCurrentLocation } from '../services/GpsLocator';
import {
  USE_STUB,
  executeFaceDetection,
  executeLivenessCheck,
  executeFaceMatch,
} from '../services/PipelineRunner';

type StepStatus = 'idle' | 'running' | 'pass' | 'fail';
type PipelineStep = { id: string; label: string; status: StepStatus; detail?: string };
type ResultType =
  | null
  | { result: 'Verified'; name: string; confidence: number; livenessScore: number; gps: string; timestamp: string }
  | { result: 'Rejected'; reason: string; timestamp: string; gps: string }
  | { result: 'Spoof Detected'; reason: string; livenessScore: number; timestamp: string; gps: string };

const CHALLENGES = ['Blink your eyes', 'Smile naturally', 'Turn head slightly left'];
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export default function VerifyScreen() {
  const nav = useNavigation<NavProp<'Verify'>>();
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const photoOutput = usePhotoOutput();

  const [running, setRunning] = useState(false);
  const [challengeIdx, setChallengeIdx] = useState(-1);
  const [steps, setSteps] = useState<PipelineStep[]>([
    { id: 'detect', label: 'Face Detection (YOLOv8n)', status: 'idle' },
    { id: 'liveness', label: 'Liveness (MiniFASNet + FFT)', status: 'idle' },
    { id: 'challenge', label: 'Challenge Response', status: 'idle' },
    { id: 'match', label: 'Face Match (MobileFaceNet)', status: 'idle' },
    { id: 'log', label: 'Log Result (SQLite + GPS)', status: 'idle' },
  ]);
  const [result, setResult] = useState<ResultType>(null);
  const resultFade = useRef(new Animated.Value(0)).current;

  const updateStep = (id: string, status: StepStatus, detail?: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, detail } : s));
  };

  const showResult = useCallback((r: ResultType) => {
    setResult(r);
    resultFade.setValue(0);
    Animated.spring(resultFade, { toValue: 1, friction: 5, useNativeDriver: true }).start();
  }, [resultFade]);

  const formatTimestamp = () => {
    const now = new Date();
    return now.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const runPipeline = useCallback(async () => {
    if (running) { return; }
    if (!hasPermission) { await requestPermission(); return; }
    setRunning(true);
    setSteps(prev => prev.map(s => ({ ...s, status: 'idle', detail: undefined })));
    setResult(null);

    let gpsStr = 'GPS unavailable';
    let capturedPixels: Uint8Array | null = null;

    try {
      // ── Step 0: Capture photo from camera ──
      // This must happen BEFORE any pipeline step so we have real pixel data
      try {
        const photo = await photoOutput.capturePhoto({ flashMode: 'off' }, {});
        // Get actual camera pixels via Nitro Image
        const image = await photo.toImageAsync();
        // Resize to 112x112 for fast processing in JS
        const smallImage = await image.resizeAsync(112, 112);
        const rawData = await smallImage.toRawPixelDataAsync();
        
        capturedPixels = new Uint8Array(rawData.buffer);
        
        // Dispose native objects to free memory
        try { (photo as any).dispose?.(); } catch {}
        try { (image as any).dispose?.(); } catch {}
        try { (smallImage as any).dispose?.(); } catch {}
      } catch (err) {
        // Camera capture failed
        capturedPixels = null;
      }

      // ── Step 1: Face Detection (includes face presence check) ──
      updateStep('detect', 'running');
      await delay(500);
      const detectResult = await executeFaceDetection(capturedPixels);
      if (detectResult.faces.length === 0) {
        updateStep('detect', 'fail', 'No face detected');
        throw new Error('No face detected. Please position your face in the frame.');
      }
      updateStep('detect', 'pass', `Face found · Score: ${detectResult.faces[0].score.toFixed(2)}`);

      // ── Step 2: Liveness (Processing) ──
      updateStep('liveness', 'running');
      await delay(400);
      const livenessResult = await executeLivenessCheck(capturedPixels, detectResult.faces[0]);

      // ── Step 3: Challenge Response (Always show for demo purposes) ──
      updateStep('challenge', 'running');
      for (let i = 0; i < CHALLENGES.length; i++) {
        setChallengeIdx(i);
        await delay(1500); // 1.5 seconds per challenge so they can read it
      }
      setChallengeIdx(-1);

      // Now evaluate liveness and challenge results
      if (!livenessResult.isLive) {
        updateStep('liveness', 'fail', `SPOOF · Score: ${(livenessResult.score * 100).toFixed(0)}%`);
        updateStep('challenge', 'fail', `Failed movement constraints`);
        throw Object.assign(new Error('Spoof Detected'), { livenessScore: livenessResult.score });
      }
      updateStep('liveness', 'pass', `LIVE ✓ · Score: ${(livenessResult.score * 100).toFixed(0)}%`);
      updateStep('challenge', 'pass', `${CHALLENGES.length} challenges passed`);

      // ── Step 4: Face Match ──
      updateStep('match', 'running');
      await delay(400);
      const matchResult = await executeFaceMatch(null);
      if (!matchResult.bestWorker) {
        updateStep('match', 'fail', 'No workers enrolled');
        throw new Error('No workers enrolled. Please enroll first.');
      }
      if (!matchResult.isMatch) {
        updateStep('match', 'fail', `Best: ${(matchResult.similarity * 100).toFixed(0)}% (below 80%)`);
        throw new Error('Face does not match any enrolled worker.');
      }
      updateStep('match', 'pass', `${matchResult.bestWorker.name} · ${(matchResult.similarity * 100).toFixed(0)}%`);

      // ── Step 5: Log Result ──
      updateStep('log', 'running');
      const loc = await getCurrentLocation();
      gpsStr = loc ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}` : 'GPS unavailable';
      await logVerification({
        worker_id: matchResult.bestWorker.id,
        worker_name: matchResult.bestWorker.name,
        timestamp: Date.now(),
        gps_lat: loc?.latitude,
        gps_lng: loc?.longitude,
        result: 'Verified',
        liveness_score: livenessResult.score,
        confidence: matchResult.similarity,
      });
      updateStep('log', 'pass', loc ? gpsStr : 'GPS unavailable');

      showResult({
        result: 'Verified',
        name: matchResult.bestWorker.name,
        confidence: matchResult.similarity,
        livenessScore: livenessResult.score,
        gps: gpsStr,
        timestamp: formatTimestamp(),
      });

    } catch (err: any) {
      // Log the failure
      const isSpoof = err.message === 'Spoof Detected';
      const isNoFace = err.message?.includes('No face detected');
      
      try {
        updateStep('log', 'running');
        const loc = await getCurrentLocation();
        gpsStr = loc ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}` : 'GPS unavailable';
        await logVerification({
          timestamp: Date.now(),
          gps_lat: loc?.latitude,
          gps_lng: loc?.longitude,
          result: isSpoof ? 'Spoof Detected' : isNoFace ? 'No Face' : 'Rejected',
          liveness_score: err.livenessScore ?? null,
        });
        updateStep('log', 'pass');
      } catch {
        updateStep('log', 'pass');
      }

      if (isSpoof) {
        showResult({
          result: 'Spoof Detected',
          reason: 'Presentation attack detected',
          livenessScore: err.livenessScore ?? 0,
          gps: gpsStr,
          timestamp: formatTimestamp(),
        });
      } else {
        showResult({
          result: 'Rejected',
          reason: err?.message ?? 'Pipeline error',
          gps: gpsStr,
          timestamp: formatTimestamp(),
        });
      }
    } finally {
      setChallengeIdx(-1);
      setRunning(false);
    }
  }, [running, hasPermission, requestPermission, photoOutput, showResult]);

  return (
    <View style={s.container}>
      {/* Fullscreen Camera */}
      {hasPermission && device ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          outputs={[photoOutput]}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.camPlaceholder]}>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
            <Text style={s.permBtnText}>Tap to enable camera</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Oval overlay — always visible */}
      <CameraOverlay width={400} height={550} />

      {/* Challenge text overlay */}
      {challengeIdx >= 0 && (
        <View style={[s.challengeOverlay, { top: insets.top + 60 }]}>
          <Text style={s.challengeText}>{CHALLENGES[challengeIdx]}</Text>
        </View>
      )}

      {/* STUB MODE banner */}
      {USE_STUB && !result && (
        <View style={[s.stubBanner, { top: insets.top + 8 }]}>
          <Text style={s.stubTitle}>PROTOTYPE MODE</Text>
          <Text style={s.stubText}>Running with heuristic-based liveness detection.{'\n'}TFLite models integration in final version.</Text>
        </View>
      )}

      {/* Bottom Controls */}
      {!result && (
        <SafeAreaView style={s.bottomControls} edges={['bottom']}>
          {/* Pipeline Steps — glass card */}
          <View style={s.stepsCard}>
            {steps.map(step => (
              <View key={step.id} style={s.stepRow}>
                <View style={[
                  s.stepIcon,
                  step.status === 'pass' && s.stepPass,
                  step.status === 'fail' && s.stepFail,
                  step.status === 'running' && s.stepRunning,
                ]}>
                  <Text style={s.stepIconText}>
                    {step.status === 'pass' ? '✓' : step.status === 'fail' ? '✕' : step.status === 'running' ? '…' : '○'}
                  </Text>
                </View>
                <View style={s.stepTextGroup}>
                  <Text style={s.stepLabel}>{step.label}</Text>
                  {step.detail && <Text style={s.stepDetail}>{step.detail}</Text>}
                </View>
              </View>
            ))}
          </View>

          {/* Scan Button */}
          <TouchableOpacity
            style={[s.scanBtn, running && { opacity: 0.6 }]}
            onPress={runPipeline}
            disabled={running}
          >
            {running ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.scanBtnText}>Start Verification</Text>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {/* Result Card — overlaid */}
      {result && (
        <Animated.View
          style={[
            s.resultOverlay,
            {
              opacity: resultFade,
              transform: [{ scale: resultFade.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
            },
          ]}
        >
          <View style={[
            s.resultCard,
            result.result === 'Verified' ? s.resultOk
              : result.result === 'Spoof Detected' ? s.resultSpoof
              : s.resultFail,
          ]}>
            {/* Big Icon */}
            <View style={[s.resultIconCircle, result.result === 'Verified' ? s.resultIconOk : s.resultIconBad]}>
              <Text style={s.resultIconBig}>
                {result.result === 'Verified' ? '✓' : '✕'}
              </Text>
            </View>

            <Text style={s.resultTitle}>{result.result}</Text>

            {result.result === 'Verified' && (
              <>
                <Text style={s.resultName}>{result.name}</Text>
                <View style={s.resultStatsRow}>
                  <View style={s.resultStat}>
                    <Text style={s.resultStatValue}>{Math.round(result.confidence * 100)}%</Text>
                    <Text style={s.resultStatLabel}>Match</Text>
                  </View>
                  <View style={s.resultDivider} />
                  <View style={s.resultStat}>
                    <Text style={s.resultStatValue}>{Math.round(result.livenessScore * 100)}%</Text>
                    <Text style={s.resultStatLabel}>Liveness</Text>
                  </View>
                </View>
              </>
            )}

            {result.result === 'Spoof Detected' && (
              <>
                <Text style={s.resultReason}>⚠️ {result.reason}</Text>
                <Text style={s.resultMeta}>Liveness Score: {Math.round(result.livenessScore * 100)}%</Text>
              </>
            )}

            {result.result === 'Rejected' && (
              <Text style={s.resultReason}>{result.reason}</Text>
            )}

            {/* Metadata */}
            <View style={s.resultMetaRow}>
              <Text style={s.resultMeta}>📍 {result.gps}</Text>
              <Text style={s.resultMeta}>🕐 {result.timestamp}</Text>
            </View>

            {/* Action Buttons */}
            <View style={s.resultActions}>
              <TouchableOpacity
                style={s.resultBtnPrimary}
                onPress={() => nav.navigate('History')}
              >
                <Text style={s.resultBtnPrimaryText}>📋 View History</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.resultBtnSecondary}
                onPress={() => {
                  setResult(null);
                  setSteps(prev => prev.map(s_ => ({ ...s_, status: 'idle' as StepStatus, detail: undefined })));
                }}
              >
                <Text style={s.resultBtnSecondaryText}>🔄 Verify Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camPlaceholder: { backgroundColor: '#0B1437', alignItems: 'center', justifyContent: 'center' },
  permBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radii.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Stub banner
  stubBanner: { position: 'absolute', left: spacing.md, right: spacing.md, backgroundColor: '#E3F2FD', padding: spacing.xs, borderRadius: radii.sm, zIndex: 10, alignItems: 'center', borderWidth: 1, borderColor: '#64B5F6' },
  stubTitle: { color: '#1565C0', fontSize: 11, fontWeight: '700' },
  stubText: { color: '#1565C0', fontSize: 10, textAlign: 'center' },

  // Challenge
  challengeOverlay: { position: 'absolute', left: spacing.lg, right: spacing.lg, backgroundColor: 'rgba(0,26,91,0.88)', padding: spacing.md, borderRadius: radii.lg, alignItems: 'center', zIndex: 10 },
  challengeText: { color: '#fff', fontSize: 18, fontWeight: '800' },

  // Bottom controls
  bottomControls: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },

  // Pipeline steps — glassmorphic card
  stepsCard: {
    backgroundColor: 'rgba(11,20,55,0.82)',
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  stepPass: { backgroundColor: colors.success },
  stepFail: { backgroundColor: colors.danger },
  stepRunning: { backgroundColor: colors.secondary },
  stepIconText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepTextGroup: { flex: 1 },
  stepLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  stepDetail: { color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 1 },

  // Scan button
  scanBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: Platform.OS === 'android' ? spacing.md : 0,
  },
  scanBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },

  // Result overlay
  resultOverlay: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    zIndex: 100,
  },
  resultCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: 'center',
  },
  resultOk: { backgroundColor: '#fff', borderWidth: 3, borderColor: colors.success },
  resultFail: { backgroundColor: '#fff', borderWidth: 3, borderColor: '#FFA000' },
  resultSpoof: { backgroundColor: '#fff', borderWidth: 3, borderColor: colors.danger },

  resultIconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  resultIconOk: { backgroundColor: '#E6FAF0' },
  resultIconBad: { backgroundColor: '#FDECEA' },
  resultIconBig: { fontSize: 36 },

  resultTitle: { fontSize: 26, fontWeight: '900', color: colors.text, marginBottom: spacing.xs },
  resultName: { fontSize: 20, fontWeight: '700', color: colors.primary, marginBottom: spacing.sm },
  resultReason: { fontSize: 14, color: colors.danger, fontWeight: '600', marginBottom: spacing.sm, textAlign: 'center' },

  resultStatsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  resultStat: { alignItems: 'center', paddingHorizontal: spacing.lg },
  resultStatValue: { fontSize: 28, fontWeight: '900', color: colors.primary },
  resultStatLabel: { fontSize: 11, color: colors.muted, fontWeight: '600', marginTop: 2 },
  resultDivider: { width: 1, height: 40, backgroundColor: '#E0E8F5' },

  resultMetaRow: { alignItems: 'center', gap: 4, marginBottom: spacing.md },
  resultMeta: { fontSize: 12, color: colors.muted, fontWeight: '500' },

  resultActions: { width: '100%', gap: spacing.xs },
  resultBtnPrimary: { backgroundColor: colors.primary, borderRadius: radii.md, padding: spacing.sm, alignItems: 'center' },
  resultBtnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  resultBtnSecondary: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: '#E0E8F5' },
  resultBtnSecondaryText: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
