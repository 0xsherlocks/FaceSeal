import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View, Image, Animated, Platform, PermissionsAndroid } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NavProp } from '../navigation/types';
import { colors, radii, spacing } from '../theme';
import { getWorkerCount, getTodayCount, getPendingSyncCount, seedDummyData } from '../services/SQLiteLogger';
import { syncToAws } from '../services/AwsSync';
import { USE_STUB } from '../services/PipelineRunner';
import { useCameraPermission } from 'react-native-vision-camera';

export default function HomeScreen() {
  const nav = useNavigation<NavProp<'Home'>>();
  const [workers, setWorkers] = useState(0);
  const [today, setToday] = useState(0);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncProgress = useRef(new Animated.Value(0)).current;
  const { hasPermission, requestPermission } = useCameraPermission();

  // Request permissions + seed database on first mount
  useEffect(() => {
    (async () => {
      try {
        // Camera permission
        if (!hasPermission) {
          await requestPermission();
        }
        // Location permission (Android)
        if (Platform.OS === 'android') {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location Permission',
              message: 'FaceSeal needs GPS to tag verification locations.',
              buttonPositive: 'Allow',
            },
          );
        }
        // Seed dummy data for demo
        await seedDummyData();
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStats = useCallback(async () => {
    try {
      setWorkers(await getWorkerCount());
      setToday(await getTodayCount());
      setPending(await getPendingSyncCount());
    } catch {}
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  // refresh when returning to this screen
  useEffect(() => {
    const unsub = nav.addListener('focus', loadStats);
    return unsub;
  }, [nav, loadStats]);

  const handleSync = useCallback(async () => {
    if (syncing) { return; }
    setSyncing(true);
    syncProgress.setValue(0);

    // Simulated sync animation for demo
    Animated.timing(syncProgress, {
      toValue: 1,
      duration: 2500,
      useNativeDriver: false,
    }).start(async () => {
      const r = await syncToAws();
      setSyncing(false);
      if (r.error) {
        Alert.alert('Sync Failed', r.error + '\nRecords saved locally for later sync.');
      } else if (r.uploaded === 0) {
        Alert.alert('Nothing to Sync', 'All records are already synced.');
      } else {
        Alert.alert('Sync Complete', `Uploaded: ${r.uploaded}\nPurged: ${r.purged}`);
      }
      loadStats();
    });
  }, [loadStats, syncing, syncProgress]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={s.content}>
        {USE_STUB && (
          <View style={s.stubBanner}>
            <Text style={s.stubTitle}>PROTOTYPE MODE</Text>
            <Text style={s.stubText}>Running with heuristic-based liveness detection.{'\n'}TFLite models integration in final version.</Text>
          </View>
        )}
        {/* Header */}
        <View style={s.header}>
          <Image source={require('../../assets/logo.png')} style={s.logoImage} resizeMode="contain" />
          <View>
            <Text style={s.title}>FaceSeal</Text>
            <Text style={s.subtitle}>Offline Face Verification · NHAI</Text>
          </View>
        </View>

        {/* Status Cards */}
        <View style={s.statsRow}>
          <StatCard label="Workers" value={String(workers)} color={colors.primary} />
          <StatCard label="Today" value={String(today)} color={colors.success} />
          <StatCard label="Pending Sync" value={String(pending)} color="#FFA000" />
        </View>

        {/* Offline badge */}
        <View style={s.offlineBadge}>
          <View style={[s.dot, { backgroundColor: colors.success }]} />
          <Text style={s.offlineText}>100% Offline · No Internet Required</Text>
        </View>

        {/* Action Buttons */}
        <TouchableOpacity style={s.primaryBtn} onPress={() => nav.navigate('Verify')}>
          <View>
            <Text style={s.primaryBtnText}>Start Verification</Text>
            <Text style={s.primaryBtnSub}>Scan face to verify identity</Text>
          </View>
          <Text style={s.primaryChevron}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.secondaryBtn} onPress={() => nav.navigate('Enroll')}>
          <View>
            <Text style={s.secondaryBtnText}>Enroll Worker</Text>
            <Text style={s.secondaryBtnSub}>Register new worker with face</Text>
          </View>
          <Text style={s.secondaryChevron}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.secondaryBtn} onPress={() => nav.navigate('History')}>
          <View>
            <Text style={s.secondaryBtnText}>Verification History</Text>
            <Text style={s.secondaryBtnSub}>View past records + GPS logs</Text>
          </View>
          <Text style={s.secondaryChevron}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[s.syncBtn, syncing && { opacity: 0.7 }]} onPress={handleSync} disabled={syncing}>
          <Text style={s.syncBtnText}>{syncing ? 'Syncing...' : 'Sync to AWS'}</Text>
          {syncing && (
            <View style={s.syncBarBg}>
              <Animated.View style={[s.syncBarFill, { width: syncProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
            </View>
          )}
        </TouchableOpacity>

        {/* Pipeline info */}
        <View style={s.infoCard}>
          <Text style={s.infoTitle}>Verification Pipeline</Text>
          {['Face Detection (YOLOv8n)', 'Liveness Check (MiniFASNet + FFT)', 'Face Match (MobileFaceNet)', 'Log Result (SQLite + GPS)'].map((step, i) => (
            <View key={step} style={s.stepRow}>
              <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
              <Text style={s.stepLabel}>{step}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[s.statCard, { borderColor: color }]}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  stubBanner: { backgroundColor: '#E3F2FD', padding: spacing.sm, borderRadius: radii.md, marginBottom: spacing.md, width: '100%', borderWidth: 1, borderColor: '#64B5F6' },
  stubTitle: { color: '#1565C0', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  stubText: { color: '#1565C0', fontSize: 11 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  logoImage: { width: 50, height: 50 },
  title: { color: colors.primary, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.sm, alignItems: 'center', borderWidth: 1.5 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: '#E8F5E9', borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4 },
  offlineText: { color: '#2E7D32', fontSize: 12, fontWeight: '600' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  primaryBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  primaryChevron: { color: 'rgba(255,255,255,0.5)', fontSize: 24, fontWeight: '300' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: '#E0E8F5' },
  secondaryBtnText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  secondaryBtnSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  secondaryChevron: { color: colors.muted, fontSize: 24, fontWeight: '300' },
  syncBtn: { backgroundColor: '#E3F2FD', borderRadius: radii.md, padding: spacing.sm, alignItems: 'center', marginTop: spacing.xs, marginBottom: spacing.lg },
  syncBtnText: { color: '#1565C0', fontSize: 14, fontWeight: '700' },
  syncBarBg: { width: '90%', height: 4, backgroundColor: '#BBDEFB', borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  syncBarFill: { height: 4, backgroundColor: '#1565C0', borderRadius: 2 },
  infoCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md },
  infoTitle: { color: colors.primary, fontSize: 16, fontWeight: '700', marginBottom: spacing.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  stepLabel: { color: colors.text, fontSize: 13, fontWeight: '500' },
});
