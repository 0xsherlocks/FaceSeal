import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../theme';
import { getVerifications, type VerificationRecord } from '../services/SQLiteLogger';

export default function HistoryScreen() {
  const [records, setRecords] = useState<VerificationRecord[]>([]);

  const load = useCallback(async () => {
    try { setRecords(await getVerifications()); } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const renderItem = ({ item }: { item: VerificationRecord }) => {
    const date = new Date(item.timestamp);
    const isVerified = item.result === 'Verified';
    const isSpoof = item.result === 'Spoof Detected';
    const resultColor = isVerified ? colors.success : isSpoof ? colors.danger : '#FFA000';
    const resultIcon = isVerified ? '✓' : '✕';
    const resultBg = isVerified ? '#E6FAF0' : isSpoof ? '#FDECEA' : '#FFF8E1';

    return (
      <View style={s.card}>
        {/* Top row: icon badge + result + time */}
        <View style={s.cardTop}>
          <View style={[s.iconBadge, { backgroundColor: resultBg }]}>
            <Text style={[s.iconText, { color: resultColor }]}>{resultIcon}</Text>
          </View>
          <View style={s.cardTopText}>
            <View style={s.cardTopRow}>
              <View style={[s.resultBadge, { backgroundColor: resultColor }]}>
                <Text style={s.resultText}>{item.result}</Text>
              </View>
              <Text style={s.dateText}>
                {date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}{' '}
                {date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Text style={s.workerName}>{item.worker_name ?? 'Unknown Person'}</Text>
          </View>
        </View>

        {/* Scores row */}
        <View style={s.scoresRow}>
          {item.confidence != null && (
            <View style={s.scorePill}>
              <Text style={s.scoreLabel}>Match</Text>
              <Text style={[s.scoreValue, { color: isVerified ? colors.success : colors.danger }]}>
                {Math.round(item.confidence * 100)}%
              </Text>
            </View>
          )}
          {item.liveness_score != null && (
            <View style={s.scorePill}>
              <Text style={s.scoreLabel}>Liveness</Text>
              <Text style={[s.scoreValue, { color: (item.liveness_score ?? 0) > 0.5 ? colors.success : colors.danger }]}>
                {Math.round(item.liveness_score * 100)}%
              </Text>
            </View>
          )}
        </View>

        {/* GPS */}
        {item.gps_lat != null && item.gps_lng != null && (
          <Text style={s.gps}>📍 {item.gps_lat.toFixed(4)}, {item.gps_lng.toFixed(4)}</Text>
        )}

        {/* Sync badge */}
        <View style={[s.syncBadge, item.sync_status === 'synced' ? s.syncedBadge : s.pendingBadge]}>
          <Text style={s.syncText}>{item.sync_status === 'synced' ? '☁ Synced' : '⏳ Pending Sync'}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={[]}>
      {/* Summary header */}
      <View style={s.summaryRow}>
        <View style={[s.summaryCard, { borderColor: colors.success }]}>
          <Text style={[s.summaryValue, { color: colors.success }]}>
            {records.filter(r => r.result === 'Verified').length}
          </Text>
          <Text style={s.summaryLabel}>Verified</Text>
        </View>
        <View style={[s.summaryCard, { borderColor: colors.danger }]}>
          <Text style={[s.summaryValue, { color: colors.danger }]}>
            {records.filter(r => r.result === 'Spoof Detected').length}
          </Text>
          <Text style={s.summaryLabel}>Spoofs</Text>
        </View>
        <View style={[s.summaryCard, { borderColor: '#FFA000' }]}>
          <Text style={[s.summaryValue, { color: '#FFA000' }]}>
            {records.filter(r => r.result === 'Rejected').length}
          </Text>
          <Text style={s.summaryLabel}>Rejected</Text>
        </View>
      </View>

      {records.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📋</Text>
          <Text style={s.emptyText}>No verifications yet</Text>
          <Text style={s.emptySub}>Start a verification from the Home screen</Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={s.list}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  summaryRow: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
  summaryCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.sm, alignItems: 'center', borderWidth: 1.5 },
  summaryValue: { fontSize: 22, fontWeight: '900' },
  summaryLabel: { color: colors.muted, fontSize: 10, fontWeight: '600', marginTop: 2 },
  list: { padding: spacing.md, gap: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xs },
  iconBadge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 20, fontWeight: '800' },
  cardTopText: { flex: 1 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  resultBadge: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  resultText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  dateText: { color: colors.muted, fontSize: 11 },
  workerName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  scoresRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs, marginTop: spacing.xs },
  scorePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  scoreLabel: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  scoreValue: { fontSize: 13, fontWeight: '800' },
  gps: { color: colors.muted, fontSize: 11, marginBottom: 4 },
  syncBadge: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  syncedBadge: { backgroundColor: '#E8F5E9' },
  pendingBadge: { backgroundColor: '#FFF8E1' },
  syncText: { fontSize: 10, fontWeight: '600', color: colors.text },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyText: { color: colors.text, fontSize: 18, fontWeight: '700' },
  emptySub: { color: colors.muted, fontSize: 13, marginTop: 4 },
});
