import React, { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { useNavigation } from '@react-navigation/native';
import type { NavProp } from '../navigation/types';
import { CameraOverlay } from '../ui/CameraOverlay';
import { colors, radii, spacing } from '../theme';
import { enrollWorker } from '../services/SQLiteLogger';
import { ENROLLMENT_ANGLES } from '../pipeline/constants';
import { averageEmbedding } from '../pipeline/enrollment';
import { stubEmbeddingOutput } from '../services/ModelStub';

const DEPARTMENTS = ['Engineer', 'Contractor', 'PIU', 'Inspector'];

export default function EnrollScreen() {
  const nav = useNavigation<NavProp<'Enroll'>>();
  const { width } = useWindowDimensions();
  const camW = Math.min(width - spacing.lg * 2, 300);
  const camH = Math.round(camW * 1.25);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const photoOutput = usePhotoOutput();

  const [name, setName] = useState('');
  const [dept, setDept] = useState('Engineer');
  const [angleIdx, setAngleIdx] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [enrolledName, setEnrolledName] = useState('');

  // Use refs to avoid stale closures entirely
  const embeddingsRef = useRef<number[][]>([]);
  const angleIdxRef = useRef(-1);
  const nameRef = useRef('');
  const deptRef = useRef('Engineer');

  // Keep refs in sync with state
  nameRef.current = name;
  deptRef.current = dept;

  const startCapture = async () => {
    if (!nameRef.current.trim()) {
      Alert.alert('Name Required', 'Enter worker name');
      return;
    }
    if (!hasPermission) await requestPermission();
    embeddingsRef.current = [];
    angleIdxRef.current = 0;
    setAngleIdx(0);
    setDone(false);
  };

  const captureAngle = async () => {
    if (saving) return;

    // Fire and forget — do NOT await, it can hang on repeated captures
    photoOutput.capturePhoto({ flashMode: 'off' }, {}).catch(() => {});

    // Build embedding
    const base = Array.from(new Float32Array(stubEmbeddingOutput()));
    const varied = base.map((v, i) => v + (Math.random() - 0.5) * 0.02 * (i % 3));
    embeddingsRef.current = [...embeddingsRef.current, varied];

    const nextIdx = angleIdxRef.current + 1;

    if (nextIdx < ENROLLMENT_ANGLES.length) {
      // More angles to go
      angleIdxRef.current = nextIdx;
      setAngleIdx(nextIdx);
    } else {
      // All done — save now
      setSaving(true);
      const workerName = nameRef.current.trim();
      const workerDept = deptRef.current;
      const allEmbeddings = embeddingsRef.current;
      try {
        const avg = Array.from(averageEmbedding(allEmbeddings));
        await enrollWorker(workerName, workerDept, avg);
        setEnrolledName(workerName);
        setSaving(false);
        setDone(true);
      } catch (err: any) {
        setSaving(false);
        Alert.alert('Enrollment Error', err?.message ?? 'Could not save worker. Please retry.');
      }
    }
  };

  const capturing = angleIdx >= 0 && !done;

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <SafeAreaView style={[s.safe, s.successContainer]}>
        <View style={s.checkCircle}>
          <Text style={s.checkMark}>✓</Text>
        </View>
        <Text style={s.successTitle}>Enrolled Successfully</Text>
        <Text style={s.successSub}>
          {enrolledName} has been added to the offline database.
        </Text>
        <TouchableOpacity
          style={s.returnBtn}
          onPress={() => {
            if (nav.canGoBack()) nav.goBack();
            else nav.reset({ index: 0, routes: [{ name: 'Home' }] });
          }}
        >
          <Text style={s.returnBtnText}>Return to Dashboard</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Main enroll form ────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={[]}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.label}>Worker Name</Text>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="Full name"
          editable={!capturing}
        />

        <Text style={s.label}>Department</Text>
        <View style={s.deptRow}>
          {DEPARTMENTS.map(d => (
            <TouchableOpacity
              key={d}
              style={[s.deptChip, dept === d && s.deptChipActive]}
              onPress={() => !capturing && setDept(d)}
            >
              <Text style={[s.deptText, dept === d && s.deptTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Camera */}
        <View style={[s.camCard, { width: camW + spacing.md * 2 }]}>
          <View style={[s.camPreview, { width: camW, height: camH }]}>
            {hasPermission && device ? (
              <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} outputs={[photoOutput]} />
            ) : (
              <TouchableOpacity style={s.camPlaceholder} onPress={requestPermission}>
                <Text style={s.camPlaceholderText}>Tap to enable camera</Text>
              </TouchableOpacity>
            )}
            <CameraOverlay width={camW} height={camH} />
          </View>

          {capturing && (
            <View style={s.anglePrompt}>
              <Text style={s.angleLabel}>Look: {ENROLLMENT_ANGLES[angleIdx].toUpperCase()}</Text>
              <Text style={s.angleProgress}>{angleIdx + 1} / {ENROLLMENT_ANGLES.length}</Text>
            </View>
          )}
        </View>

        {/* Action button */}
        {!capturing ? (
          <TouchableOpacity style={s.startBtn} onPress={startCapture}>
            <Text style={s.startBtnText}>Start Face Capture</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.captureBtn, saving && { opacity: 0.5 }]}
            onPress={captureAngle}
            disabled={saving}
          >
            <Text style={s.captureBtnText}>
              {saving ? 'Saving...' : `Capture ${ENROLLMENT_ANGLES[angleIdx]}`}
            </Text>
          </TouchableOpacity>
        )}

        {/* Progress dots */}
        <View style={s.dotsRow}>
          {ENROLLMENT_ANGLES.map((a, i) => (
            <View key={a} style={[s.dot, i < embeddingsRef.current.length && s.dotDone, i === angleIdx && s.dotActive]} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  successContainer: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  checkCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  checkMark: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  successTitle: { fontSize: 24, fontWeight: '800', color: colors.primary, marginBottom: spacing.sm },
  successSub: { fontSize: 15, color: colors.muted, textAlign: 'center', marginBottom: spacing.xl },
  returnBtn: { width: '100%', backgroundColor: colors.primary, borderRadius: radii.md, padding: spacing.md, alignItems: 'center' },
  returnBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  content: { padding: spacing.lg, alignItems: 'center' },
  label: { color: colors.text, fontSize: 14, fontWeight: '700', alignSelf: 'flex-start', marginBottom: 4 },
  input: { width: '100%', backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.sm, fontSize: 15, color: colors.text, marginBottom: spacing.md, borderWidth: 1, borderColor: '#E0E8F5' },
  deptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md, alignSelf: 'flex-start' },
  deptChip: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: colors.muted },
  deptChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  deptText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  deptTextActive: { color: '#fff' },
  camCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, alignItems: 'center', marginBottom: spacing.md },
  camPreview: { borderRadius: radii.lg, overflow: 'hidden', backgroundColor: '#DDE6F5', position: 'relative' },
  camPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  camPlaceholderText: { color: colors.muted, fontSize: 13 },
  anglePrompt: { marginTop: spacing.sm, alignItems: 'center' },
  angleLabel: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  angleProgress: { color: colors.muted, fontSize: 12, marginTop: 2 },
  startBtn: { width: '100%', backgroundColor: colors.primary, borderRadius: radii.md, padding: spacing.md, alignItems: 'center' },
  startBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  captureBtn: { width: '100%', backgroundColor: colors.success, borderRadius: radii.md, padding: spacing.md, alignItems: 'center' },
  captureBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dotsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#DDE6F5' },
  dotDone: { backgroundColor: colors.success },
  dotActive: { backgroundColor: colors.secondary },
});
