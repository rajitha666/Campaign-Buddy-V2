import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as profileApi from '@/api/profile';
import * as performanceApi from '@/api/performance';
import { ProductThumb } from '@/components/ProductThumb';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';

const BAND_COLORS = [colors.success, '#8B5FBF', colors.info];
const CHART_HEIGHT = 100;

export function PerformanceScreen() {
  const assignmentQuery = useQuery({ queryKey: ['assignment', 'today'], queryFn: profileApi.getTodayAssignment });

  const performanceQuery = useQuery({
    queryKey: ['performance', assignmentQuery.data?.campaign.id, assignmentQuery.data?.outlet.id],
    queryFn: () =>
      performanceApi.getCampaignPerformance(assignmentQuery.data!.campaign.id, assignmentQuery.data!.outlet.id),
    enabled: !!assignmentQuery.data,
  });

  const p = performanceQuery.data;
  const maxSale = p ? Math.max(...p.dailySales.map((d) => d.amount), 1) : 1;

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <View style={styles.topnav}>
        <Text style={styles.title}>Performance</Text>
        <Text style={styles.subtitle}>
          {assignmentQuery.data ? `${assignmentQuery.data.campaign.name} · ${assignmentQuery.data.outlet.name}` : ' '}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {p && (
          <>
            <View style={styles.campaignCard}>
              <Text style={styles.campaignName}>{p.campaignName}</Text>
              <View style={styles.metaRow}>
                <MetaItem
                  n={new Date(p.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  l="Start date"
                />
                <MetaItem n={`Day ${p.dayNumber} of ${p.totalDays}`} l="Days passed" />
              </View>
            </View>

            <View style={styles.perfStats}>
              <PerfStat n={`LKR ${formatK(p.totalSales)}`} l="Total sales" />
              <PerfStat n={String(p.totalUnitsSold)} l="Units sold" />
              <PerfStat n={String(p.totalApproached)} l="Approached" />
            </View>

            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Sales this period</Text>
              <Text style={styles.chartTotal}>
                LKR {p.totalSales.toLocaleString()} total · {p.dailySales.length} days
              </Text>
              <View style={styles.bars}>
                {p.dailySales.map((point, i) => {
                  const isLast = i === p.dailySales.length - 1;
                  const height = Math.max((point.amount / maxSale) * CHART_HEIGHT, 4);
                  return (
                    <View key={point.date} style={styles.barCol}>
                      <View
                        style={[
                          styles.bar,
                          { height, backgroundColor: isLast ? colors.ink : colors.mango },
                        ]}
                      />
                      <Text style={styles.barDay}>
                        {new Date(point.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <Text style={styles.sectionLabel}>Top products</Text>
            {p.topProducts.map((product, i) => (
              <View key={product.productId} style={styles.rankCard}>
                <View style={styles.rankNum}>
                  <Text style={styles.rankNumText}>{i + 1}</Text>
                </View>
                <ProductThumb size={40} bandColor={BAND_COLORS[i % BAND_COLORS.length]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rankName}>{product.name}</Text>
                  <Text style={styles.rankMeta}>LKR {product.unitPrice.toLocaleString()} per unit</Text>
                </View>
                <Text style={styles.rankSold}>{product.unitsSold}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatK(n: number) {
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
}

function MetaItem({ n, l }: { n: string; l: string }) {
  return (
    <View>
      <Text style={styles.metaN}>{n}</Text>
      <Text style={styles.metaL}>{l}</Text>
    </View>
  );
}

function PerfStat({ n, l }: { n: string; l: string }) {
  return (
    <View style={styles.perfStat}>
      <Text style={styles.perfStatN}>{n}</Text>
      <Text style={styles.perfStatL}>{l}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.surface },
  topnav: { backgroundColor: colors.ink, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.white },
  subtitle: { color: '#9FB2AA', fontSize: 12.5, marginTop: 2 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  campaignCard: { backgroundColor: colors.ink, borderRadius: radius.xxl, padding: spacing.xl, marginTop: spacing.sm },
  campaignName: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.white },
  metaRow: { flexDirection: 'row', gap: spacing.xxl, marginTop: spacing.lg },
  metaN: { fontFamily: fontFamily.display, fontSize: 15, color: colors.white },
  metaL: { fontSize: 10.5, color: '#9FB2AA', marginTop: 2 },
  perfStats: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  perfStat: {
    flex: 1,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md + 1,
    alignItems: 'center',
  },
  perfStatN: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.ink },
  perfStatL: { fontSize: 10.5, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  chartCard: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  chartTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.textPrimary },
  chartTotal: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    height: CHART_HEIGHT + 24,
    marginTop: spacing.lg,
    paddingHorizontal: 2,
  },
  barCol: { flex: 1, alignItems: 'center', gap: spacing.sm },
  bar: { width: '100%', borderRadius: 5, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  barDay: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  sectionLabel: { fontSize: fontSize.base, fontWeight: '700', marginTop: spacing.xl, marginBottom: spacing.sm },
  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rankNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumText: { fontFamily: fontFamily.display, fontSize: 11, color: colors.textMuted },
  rankName: { fontSize: fontSize.base, fontWeight: '600', color: colors.textPrimary },
  rankMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rankSold: { fontFamily: fontFamily.display, fontSize: fontSize.md, color: colors.ink },
});
