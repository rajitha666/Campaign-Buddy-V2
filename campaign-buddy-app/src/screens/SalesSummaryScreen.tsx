import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as salesSummaryApi from '@/api/salesSummary';
import { Button } from '@/components/Button';
import { CustomFieldInput, type CustomFieldValue } from '@/components/CustomFieldInput';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';
import { getApiErrorMessage } from '@/api/client';

export function SalesSummaryScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const summaryQuery = useQuery({ queryKey: ['sales-summary', 'today'], queryFn: salesSummaryApi.getTodaySalesSummary });
  const [remarks, setRemarks] = useState<string | null>(null);
  const [customValues, setCustomValues] = useState<Record<string, CustomFieldValue>>({});

  const displayedRemarks = remarks ?? summaryQuery.data?.remarks ?? '';
  const customFields = summaryQuery.data?.customFields ?? [];
  const confirmed = !!summaryQuery.data?.confirmed;

  // Seed the editable map from the server once the summary loads / changes.
  useEffect(() => {
    if (!summaryQuery.data) return;
    setCustomValues((prev) => {
      const next = { ...prev };
      for (const f of summaryQuery.data.customFields ?? []) {
        if (!(f.key in next)) next[f.key] = f.value;
      }
      return next;
    });
  }, [summaryQuery.data]);

  const confirmMutation = useMutation({
    mutationFn: () =>
      salesSummaryApi.confirmSalesSummary({
        remarks: displayedRemarks || undefined,
        customFields: customFields.length ? customValues : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-summary', 'today'] });
      // Land back on Home after confirming — matches the prototype's
      // "Confirm & submit" behavior.
      navigation.getParent()?.navigate('HomeTab' as never);
    },
    onError: (err) => Alert.alert('Could not confirm', getApiErrorMessage(err)),
  });

  const s = summaryQuery.data;
  const conversionPct = s && s.approached > 0 ? Math.round((s.converted / s.approached) * 100) : 0;

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <View style={styles.topnav}>
        <Text style={styles.title}>Daily sales</Text>
        <Text style={styles.subtitle}>
          {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total sales today</Text>
          <Text style={styles.totalValue}>LKR {(s?.totalSales ?? 0).toLocaleString()}</Text>
          <View style={styles.subRow}>
            <SubItem n={s?.itemsReceived ?? 0} l="Items received" />
            <SubItem n={s?.itemsSold ?? 0} l="Items sold" />
            <SubItem n={s?.itemsRemaining ?? 0} l="Items remaining" />
          </View>
        </View>

        <View style={styles.metricGrid}>
          <Metric
            bg={colors.infoTint}
            icon={
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path d="M4 21c1.5-4 4.2-6 8-6s6.5 2 8 6" stroke={colors.info} strokeWidth={1.8} strokeLinecap="round" />
                <Circle cx={12} cy={8} r={3.4} stroke={colors.info} strokeWidth={1.8} />
              </Svg>
            }
            n={s?.footFall ?? 0}
            l="Foot fall"
          />
          <Metric
            bg={colors.pendingTint}
            icon={
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path d="M8 12h8M8 8h8M8 16h5" stroke={colors.pending} strokeWidth={1.8} strokeLinecap="round" />
              </Svg>
            }
            n={s?.approached ?? 0}
            l="Approached"
          />
          <Metric
            bg={colors.successTint}
            icon={
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path d="M5 13l4 4L19 7" stroke={colors.success} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            }
            n={s?.converted ?? 0}
            l="Converted"
          />
        </View>
        <Text style={styles.convNote}>
          Conversion rate <Text style={styles.convBold}>{conversionPct}%</Text> of approached shoppers
        </Text>

        <View style={styles.remarksBlock}>
          <Text style={styles.fieldLabel}>Remarks</Text>
          <TextInput
            style={styles.remarksInput}
            value={displayedRemarks}
            onChangeText={setRemarks}
            editable={!confirmed}
            placeholder="Add any notes about today"
            placeholderTextColor={colors.textMuted}
            multiline
          />
        </View>

        {customFields.length > 0 && (
          <View style={styles.customBlock}>
            <Text style={styles.fieldLabel}>Additional details</Text>
            {customFields.map((f, i) => (
              <CustomFieldInput
                key={f.key}
                field={f}
                value={customValues[f.key] ?? null}
                onChange={(v) => setCustomValues((prev) => ({ ...prev, [f.key]: v }))}
                disabled={confirmed}
                last={i === customFields.length - 1}
              />
            ))}
          </View>
        )}

        <Button
          label={s?.confirmed ? 'Confirmed ✓' : 'Confirm & submit'}
          onPress={() => confirmMutation.mutate()}
          loading={confirmMutation.isPending}
          disabled={s?.confirmed}
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function SubItem({ n, l }: { n: number; l: string }) {
  return (
    <View style={styles.subItem}>
      <Text style={styles.subN}>{n}</Text>
      <Text style={styles.subL}>{l}</Text>
    </View>
  );
}

function Metric({ bg, icon, n, l }: { bg: string; icon: React.ReactNode; n: number; l: string }) {
  return (
    <View style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: bg }]}>{icon}</View>
      <Text style={styles.metricN}>{n}</Text>
      <Text style={styles.metricL}>{l}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.surface },
  topnav: { backgroundColor: colors.ink, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.white },
  subtitle: { color: '#9FB2AA', fontSize: 12.5, marginTop: 2 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  totalCard: { backgroundColor: colors.ink, borderRadius: radius.xxl, padding: spacing.xl, marginTop: spacing.sm },
  totalLabel: { fontSize: 12.5, color: '#9FB2AA' },
  totalValue: { fontFamily: fontFamily.display, fontSize: fontSize.display, color: colors.white, marginTop: 4 },
  subRow: { flexDirection: 'row', gap: spacing.xxl, marginTop: spacing.lg },
  subItem: {},
  subN: { fontFamily: fontFamily.display, fontSize: 16, color: colors.white },
  subL: { fontSize: 11, color: '#9FB2AA', marginTop: 2 },
  metricGrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  metric: {
    flex: 1,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  metricIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  metricN: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.textPrimary },
  metricL: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  convNote: { textAlign: 'center', fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  convBold: { color: colors.success, fontWeight: '700' },
  remarksBlock: { marginTop: spacing.xl },
  customBlock: { marginTop: spacing.xl },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.sm },
  remarksInput: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md + 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    minHeight: 60,
    textAlignVertical: 'top',
    backgroundColor: colors.surfaceCard,
  },
});
