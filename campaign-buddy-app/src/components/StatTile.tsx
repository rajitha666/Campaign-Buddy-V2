/**
 * One cell in Home's "Today's stats" compact row. `onUpdate` is omitted
 * for the Sales tile (auto-calculated, no manual update) and provided for
 * Foot fall / Approached / Conversion, which navigate to the
 * StatsUpdateScreen when tapped.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';

interface StatTileProps {
  label: string;
  value: string;
  onUpdate?: () => void;
}

export function StatTile({ label, value, onUpdate }: StatTileProps) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {onUpdate && (
          <Pressable onPress={onUpdate} hitSlop={8} style={styles.updateBtn}>
            <Text style={styles.updatePlus}>+</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, alignItems: 'center' },
  label: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  value: { fontFamily: fontFamily.display, fontSize: 16.5, color: colors.ink },
  updateBtn: {
    width: 17,
    height: 17,
    borderRadius: radius.sm - 2,
    backgroundColor: colors.mangoTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updatePlus: { color: colors.mangoDark, fontSize: 12, fontWeight: '700', lineHeight: 14 },
});
