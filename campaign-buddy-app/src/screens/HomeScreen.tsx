import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { HomeStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { useAttendance } from '@/context/AttendanceContext';
import * as profileApi from '@/api/profile';
import * as statsApi from '@/api/stats';
import * as productsApi from '@/api/products';
import { Avatar } from '@/components/Avatar';
import { StatTile } from '@/components/StatTile';
import { ProductListItem } from '@/components/ProductListItem';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';

// Rotates through a few label-band colors for products that don't have a
// real photo yet — purely cosmetic, see ProductThumb.tsx.
const BAND_COLORS = [colors.info, colors.success, '#8B5FBF'];

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { checkedIn, checkInAt } = useAttendance();
  const [statsExpanded, setStatsExpanded] = useState(false);

  const assignmentQuery = useQuery({
    queryKey: ['assignment', 'today'],
    queryFn: profileApi.getTodayAssignment,
  });

  const statsQuery = useQuery({
    queryKey: ['stats', 'today'],
    queryFn: statsApi.getTodayStats,
  });

  const productsQuery = useQuery({
    queryKey: ['products', assignmentQuery.data?.campaign.id, assignmentQuery.data?.outlet.id],
    queryFn: () =>
      productsApi.getCampaignProducts(
        assignmentQuery.data!.campaign.id,
        assignmentQuery.data!.outlet.id
      ),
    enabled: !!assignmentQuery.data,
  });

  const checkInTime = checkInAt
    ? new Date(checkInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.greetRow}>
          <View>
            <Text style={styles.greetName}>Good morning, {user?.displayName ?? user?.fullName?.split(' ')[0] ?? ''}</Text>
            <Text style={styles.greetSub}>
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Profile')}>
            <Avatar initials={user?.avatarInitials ?? '—'} />
          </Pressable>
        </View>

        {assignmentQuery.data && (
          <View style={styles.campaignCard}>
            <View style={styles.locRow}>
              <PinIcon color="#A9BDB4" />
              <Text style={styles.locText}>{assignmentQuery.data.outlet.name}</Text>
            </View>
            <Text style={styles.campaignName}>{assignmentQuery.data.campaign.name}</Text>
            <Pressable
              style={styles.checkinChip}
              onPress={() => navigation.getParent()?.navigate('AttendanceTab' as never)}
            >
              <CheckIcon color="#7FE3B4" />
              <Text style={styles.checkinChipText}>
                {checkedIn ? `Checked in${checkInTime ? ` · ${checkInTime}` : ''}` : 'Not checked in'}
              </Text>
            </Pressable>
          </View>
        )}

        <Pressable style={styles.sectionHeaderRow} onPress={() => setStatsExpanded((v) => !v)}>
          <Text style={styles.sectionLabel}>Today's stats</Text>
          <View style={styles.chevronBtn}>
            <ChevronIcon expanded={statsExpanded} />
          </View>
        </Pressable>

        {/* Collapsed by default so the product list — the thing reps use
            most — gets priority screen space. See product notes: "make
            today's stats minimizable to have product list more focused". */}
        <Pressable
          style={styles.statsCompact}
          onPress={() => navigation.navigate('StatsUpdate')}
        >
          <StatTile label="Sales" value={formatK(statsQuery.data?.totalSales)} />
          <Divider />
          <StatTile
            label="Foot fall"
            value={String(statsQuery.data?.footFall ?? 0)}
            onUpdate={() => navigation.navigate('StatsUpdate')}
          />
          <Divider />
          <StatTile
            label="Approached"
            value={String(statsQuery.data?.approached ?? 0)}
            onUpdate={() => navigation.navigate('StatsUpdate')}
          />
          <Divider />
          <StatTile
            label="Conversion"
            value={String(statsQuery.data?.converted ?? 0)}
            onUpdate={() => navigation.navigate('StatsUpdate')}
          />
        </Pressable>

        {statsExpanded && (
          <Text style={styles.conversionNote}>
            Conversion rate{' '}
            <Text style={{ color: colors.success, fontWeight: '700' }}>
              {Math.round((statsQuery.data?.conversionRate ?? 0) * 100)}%
            </Text>{' '}
            of approached shoppers
          </Text>
        )}

        <View style={styles.searchBar}>
          <SearchIcon />
          <TextInput
            placeholder="Search products"
            placeholderTextColor="#A9B2AC"
            style={styles.searchInput}
          />
        </View>

        <Pressable style={styles.listHead} onPress={() => navigation.navigate('Products')}>
          <Text style={styles.listHeadLabel}>Campaign products</Text>
          <Text style={styles.listHeadCount}>{productsQuery.data?.length ?? 0} products ›</Text>
        </Pressable>

        {productsQuery.data?.map((item, i) => (
          <ProductListItem
            key={item.campaignProductAssignmentId}
            item={item}
            variant="compact"
            bandColor={BAND_COLORS[i % BAND_COLORS.length]}
            onPress={() =>
              navigation.navigate('ProductUpdate', {
                campaignProductAssignmentId: item.campaignProductAssignmentId,
                productId: item.product.id,
                productName: item.product.name,
                unitPrice: item.product.unitPrice,
                sku: item.product.sku,
                openingStock: item.openingStock,
                soldToday: item.soldToday,
                otherInterestedCustomers: item.otherInterestedCustomers,
                reorderFlag: item.reorderFlag,
                bandColor: BAND_COLORS[i % BAND_COLORS.length],
              })
            }
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatK(n?: number) {
  if (n === undefined) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

function Divider() {
  return <View style={styles.divider} />;
}

function PinIcon({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" stroke={color} strokeWidth={1.8} />
      <Circle cx={12} cy={9} r={2.4} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}
function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path d="M5 13l4 4L19 7" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function SearchIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke="#A9B2AC" strokeWidth={1.8} />
      <Path d="M21 21l-4-4" stroke="#A9B2AC" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <Svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
    >
      <Path d="M6 9l6 6 6-6" stroke="#647169" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  greetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  greetName: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary },
  greetSub: { fontSize: fontSize.base, color: colors.textMuted, marginTop: 2 },
  campaignCard: { backgroundColor: colors.ink, borderRadius: radius.xxl, padding: spacing.lg, marginTop: spacing.lg },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  locText: { color: '#A9BDB4', fontSize: 12.5 },
  campaignName: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.white, marginTop: spacing.sm },
  checkinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  checkinChipText: { color: '#DCE9E3', fontSize: fontSize.sm, fontWeight: '600' },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionLabel: { fontSize: fontSize.base, fontWeight: '700', color: colors.textPrimary },
  chevronBtn: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: 6,
  },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.line, marginHorizontal: 4 },
  conversionNote: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 1,
    marginTop: spacing.lg,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, color: colors.textPrimary, padding: 0 },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  listHeadLabel: { fontSize: fontSize.base, fontWeight: '700', color: colors.textPrimary },
  listHeadCount: { fontSize: fontSize.sm, color: colors.textMuted },
});
