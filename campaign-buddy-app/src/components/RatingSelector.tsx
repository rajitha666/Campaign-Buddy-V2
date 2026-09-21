import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { RatingScaleEntry } from '@/api/types';
import { applyDesignationLabel } from '@/lib/designationLabel';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';

interface Props {
  scale: RatingScaleEntry[];
  value: number | null;
  onChange: (value: number | null) => void;
  /** The campaign's designation label; null/absent → "promoter". */
  promoterLabel?: string | null;
}

// 1–5 score for a promoter. The chosen rung's label + definition is shown under
// the row so every supervisor reads the same standard while scoring.
export function RatingSelector({ scale, value, onChange, promoterLabel }: Props) {
  const selected = scale.find((r) => r.value === value);
  return (
    <View>
      <View style={styles.row}>
        {scale.map((r) => {
          const on = r.value === value;
          return (
            <Pressable
              key={r.value}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${r.value}, ${r.label}`}
              accessibilityState={{ selected: on }}
              onPress={() => onChange(on ? null : r.value)}
              style={[styles.dot, on && styles.dotOn]}
            >
              <Text style={[styles.dotText, on && styles.dotTextOn]}>{r.value}</Text>
            </Pressable>
          );
        })}
      </View>
      {selected ? (
        <Text style={styles.definition}>
          <Text style={styles.definitionLabel}>{selected.label}</Text> — {selected.description}
        </Text>
      ) : (
        <Text style={styles.hint}>{applyDesignationLabel('Tap a number to rate the promoter', promoterLabel)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  dot: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  dotText: { fontFamily: fontFamily.display, fontSize: fontSize.md, color: colors.textMuted },
  dotTextOn: { color: colors.white },
  definition: { fontSize: 12.5, color: colors.textPrimary, marginTop: spacing.sm, lineHeight: 18 },
  definitionLabel: { fontWeight: '700' },
  hint: { fontSize: 12.5, color: colors.textMuted, marginTop: spacing.sm },
});
