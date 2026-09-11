/**
 * Two variants, matching the two places this list appears in the
 * prototype:
 *  - "compact" (Home screen): available/sold/reorder pills, no progress bar.
 *  - "detailed" (full Campaign product list): progress bar + chevron, no
 *    reorder pill (that screen has its own "Reorder only" filter instead).
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme';
import { ProductThumb } from './ProductThumb';
import type { CampaignProductListItem } from '@/api/types';

interface ProductListItemProps {
  item: CampaignProductListItem;
  bandColor: string;
  variant: 'compact' | 'detailed';
  onPress: () => void;
}

export function ProductListItem({ item, bandColor, variant, onPress }: ProductListItemProps) {
  const pct = item.openingStock > 0 ? item.soldToday / item.openingStock : 0;

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <ProductThumb size={variant === 'compact' ? 46 : 52} bandColor={bandColor} imageUrl={item.product.imageUrl} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {item.product.name}
        </Text>

        {variant === 'compact' ? (
          <>
            <Text style={styles.price}>LKR {item.product.unitPrice.toLocaleString()} per unit</Text>
            <View style={styles.pillRow}>
              <Pill label={`Available ${item.remainingStock}`} bg={colors.infoTint} fg={colors.info} />
              <Pill label={`Sold ${item.soldToday}`} bg={colors.successTint} fg={colors.success} />
              {item.reorderFlag && <Pill label="Reorder" bg={colors.pendingTint} fg={colors.pending} />}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.meta}>
              LKR {item.product.unitPrice.toLocaleString()} · Sold {item.soldToday}
            </Text>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(pct, 1) * 100}%` }]} />
              </View>
              <Text style={styles.progressLabel}>
                {item.soldToday}/{item.openingStock}
              </Text>
            </View>
          </>
        )}
      </View>
    </Pressable>
  );
}

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, alignItems: 'center' },
  body: { flex: 1 },
  name: { fontSize: fontSize.base, fontWeight: '600', color: colors.textPrimary, lineHeight: 17 },
  price: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  meta: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 3 },
  pillRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 5, flexWrap: 'wrap', rowGap: 6 },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  pillLabel: { fontSize: 11, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  progressTrack: { width: 60, height: 6, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.mango, borderRadius: 4 },
  progressLabel: { fontSize: 11, color: colors.textMuted },
});
