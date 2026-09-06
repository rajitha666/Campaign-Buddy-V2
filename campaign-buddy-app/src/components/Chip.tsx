/**
 * Status chip — the recurring motif across the app (attendance status,
 * time-off status, reorder flag, etc). Keep new statuses mapped to one of
 * these four tones rather than inventing new colors per screen.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme';

export type ChipTone = 'success' | 'pending' | 'alert' | 'info';

const TONE_STYLES: Record<ChipTone, { bg: string; fg: string }> = {
  success: { bg: colors.successTint, fg: colors.success },
  pending: { bg: colors.pendingTint, fg: colors.pending },
  alert: { bg: colors.alertTint, fg: colors.alert },
  info: { bg: colors.infoTint, fg: colors.info },
};

interface ChipProps {
  label: string;
  tone: ChipTone;
}

export function Chip({ label, tone }: ChipProps) {
  const t = TONE_STYLES[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.bg }]}>
      <Text style={[styles.label, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  label: { fontSize: fontSize.sm, fontWeight: '600' },
});
