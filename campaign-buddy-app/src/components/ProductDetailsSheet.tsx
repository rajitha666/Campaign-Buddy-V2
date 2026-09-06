/**
 * Opens from the "View details" button on the product image in
 * ProductUpdateScreen. Read-only — no editable fields here, matching the
 * mockup ("tap outside this card to go back").
 */
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BottomSheetModal } from './BottomSheetModal';
import { ProductThumb } from './ProductThumb';
import * as productsApi from '@/api/products';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';

interface ProductDetailsSheetProps {
  visible: boolean;
  onClose: () => void;
  productId: string | null;
  bandColor: string;
}

export function ProductDetailsSheet({ visible, onClose, productId, bandColor }: ProductDetailsSheetProps) {
  const detailsQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => productsApi.getProductDetails(productId!),
    enabled: visible && !!productId,
  });

  const d = detailsQuery.data;

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      {!d ? (
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.mango} />
      ) : (
        <>
          <View style={styles.topRow}>
            <ProductThumb size={72} bandColor={bandColor} />
          </View>
          <Text style={styles.name}>{d.name}</Text>
          <Text style={styles.meta}>
            SKU {d.sku} · LKR {d.unitPrice.toLocaleString()} per unit
          </Text>
          <Text style={styles.desc}>{d.description}</Text>

          <View style={styles.attrGrid}>
            {d.attributes.map((attr) => (
              <View key={attr} style={styles.attrChip}>
                <Text style={styles.attrChipLabel}>{attr}</Text>
              </View>
            ))}
          </View>

          <View style={styles.divider} />

          <InfoRow k="In this campaign since" v={d.addedToCampaignAt} />
          <InfoRow k="Supplier" v={d.supplierName} />
          <InfoRow k="Sold across all outlets today" v={`${d.soldAcrossAllOutletsToday} units`} />

          <Text style={styles.hint}>Tap outside this card to go back</Text>
        </>
      )}
    </BottomSheetModal>
  );
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoK}>{k}</Text>
      <Text style={styles.infoV}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row' },
  name: { fontFamily: fontFamily.display, fontSize: fontSize.lg, marginTop: spacing.md, color: colors.textPrimary },
  meta: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
  desc: { fontSize: fontSize.base, color: colors.textPrimary, lineHeight: 20, marginTop: spacing.md },
  attrGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  attrChip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  attrChipLabel: { fontSize: 11.5, fontWeight: '600', color: colors.textPrimary },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.lg },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  infoK: { fontSize: 12.5, color: colors.textMuted },
  infoV: { fontSize: 12.5, fontWeight: '600', color: colors.textPrimary },
  hint: { textAlign: 'center', fontSize: 11, color: '#9AA79F', marginTop: spacing.lg },
});
