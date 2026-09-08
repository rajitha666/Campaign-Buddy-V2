import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { HomeStackParamList } from '@/navigation/types';
import * as productsApi from '@/api/products';
import { ProductThumb } from '@/components/ProductThumb';
import { Stepper } from '@/components/Stepper';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { CustomFieldInput, type CustomFieldValue } from '@/components/CustomFieldInput';
import { Button } from '@/components/Button';
import { ProductDetailsSheet } from '@/components/ProductDetailsSheet';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';
import { getApiErrorMessage } from '@/api/client';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'ProductUpdate'>;
type Route = RouteProp<HomeStackParamList, 'ProductUpdate'>;

export function ProductUpdateScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const queryClient = useQueryClient();

  const [openingStock, setOpeningStock] = useState(params.openingStock);
  const [soldToday, setSoldToday] = useState(params.soldToday);
  const [otherInterested, setOtherInterested] = useState(params.otherInterestedCustomers);
  const [reorderFlag, setReorderFlag] = useState(params.reorderFlag);
  const [detailsVisible, setDetailsVisible] = useState(false);

  const customFields = params.customFields ?? [];
  const [customValues, setCustomValues] = useState<Record<string, CustomFieldValue>>(() =>
    Object.fromEntries(customFields.map((f) => [f.key, f.value]))
  );

  const remaining = Math.max(openingStock - soldToday, 0);

  const saveMutation = useMutation({
    mutationFn: () =>
      productsApi.updateStock(params.campaignProductAssignmentId, {
        openingStock,
        soldToday,
        otherInterestedCustomers: otherInterested,
        reorderFlag,
        customFields: customFields.length ? customValues : undefined,
      }),
    onSuccess: () => {
      // Invalidate so Home/Products/Stats refetch with the new numbers —
      // soldToday changing here is also what moves DailyStats.totalSales
      // (server-computed, see spec §6.5 note).
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stats', 'today'] });
      navigation.goBack();
    },
    onError: (err) => Alert.alert('Could not save', getApiErrorMessage(err)),
  });

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <View style={styles.topnav}>
        <Pressable style={styles.backRow} onPress={() => navigation.goBack()}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M15 5l-7 7 7 7" stroke="#F4F6F3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <View>
            <Text style={styles.title}>Update stock</Text>
          </View>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroImg}>
          <ProductThumb size={64} bandColor={params.bandColor} />
          <Pressable style={styles.viewDetailsBtn} onPress={() => setDetailsVisible(true)}>
            <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
              <Circle cx={12} cy={12} r={9} stroke="white" strokeWidth={1.8} />
              <Path d="M12 11v5.5" stroke="white" strokeWidth={1.8} strokeLinecap="round" />
              <Circle cx={12} cy={8} r={1} fill="white" />
            </Svg>
            <Text style={styles.viewDetailsLabel}>View details</Text>
          </Pressable>
        </View>

        <Text style={styles.name}>{params.productName}</Text>
        <Text style={styles.meta}>
          Unit price LKR {params.unitPrice.toLocaleString()} · SKU {params.sku}
        </Text>

        <Row
          label="Opening stock"
          sub="Units received at check-in"
          right={<Stepper value={openingStock} onChange={setOpeningStock} />}
        />
        <Row
          label="Sold today"
          sub="Updates remaining stock live"
          right={<Stepper value={soldToday} onChange={setSoldToday} max={openingStock} />}
        />
        <Row
          label="Other interested customers"
          sub="Asked about it, didn't buy today"
          right={<Stepper value={otherInterested} onChange={setOtherInterested} />}
          last
        />
        <Row
          label="Flag for reorder"
          sub="Lets the campaign owner know this needs restocking"
          right={<ToggleSwitch value={reorderFlag} onValueChange={setReorderFlag} />}
          last
          noBorder
        />

        {customFields.length > 0 && (
          <View style={styles.customBlock}>
            <Text style={styles.customHeading}>Additional details</Text>
            {customFields.map((f, i) => (
              <CustomFieldInput
                key={f.key}
                field={f}
                value={customValues[f.key] ?? null}
                onChange={(v) => setCustomValues((prev) => ({ ...prev, [f.key]: v }))}
                last={i === customFields.length - 1}
              />
            ))}
          </View>
        )}

        <View style={styles.remainingCard}>
          <Text style={styles.remainingLabel}>Remaining in stock</Text>
          <Text style={styles.remainingValue}>{remaining} units</Text>
        </View>

        <Button
          label="Save update"
          onPress={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>

      <ProductDetailsSheet
        visible={detailsVisible}
        onClose={() => setDetailsVisible(false)}
        productId={params.productId}
        bandColor={params.bandColor}
      />
    </SafeAreaView>
  );
}

function Row({
  label,
  sub,
  right,
  last,
  noBorder,
}: {
  label: string;
  sub: string;
  right: React.ReactNode;
  last?: boolean;
  noBorder?: boolean;
}) {
  return (
    <View style={[styles.row, (last || noBorder) && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.surface },
  topnav: { backgroundColor: colors.ink, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.white },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  heroImg: {
    width: '100%',
    height: 190,
    borderRadius: radius.xxl,
    backgroundColor: '#EEF1EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  viewDetailsBtn: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(18,36,31,0.88)',
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  viewDetailsLabel: { color: colors.white, fontSize: fontSize.sm, fontWeight: '600' },
  name: { fontFamily: fontFamily.display, fontSize: fontSize.lg, marginTop: spacing.lg, lineHeight: 23, color: colors.textPrimary },
  meta: { fontSize: fontSize.base, color: colors.textMuted, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  rowSub: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  customBlock: { marginTop: spacing.lg },
  customHeading: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  remainingCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.successTint,
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  remainingLabel: { fontSize: 13.5, fontWeight: '600', color: colors.success },
  remainingValue: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.success },
});
