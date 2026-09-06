/**
 * The +/- counter used everywhere a rep enters a quantity: opening stock,
 * sold today, other interested customers, foot fall/approached/conversion.
 *
 * Deliberately uncontrolled-feeling but fully controlled: parent owns
 * `value` and receives the new value via `onChange`. Parents are expected
 * to debounce/batch their own PATCH calls (see ProductUpdateScreen.tsx for
 * the pattern) rather than firing a network request on every single tap.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';

interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: 'default' | 'large';
}

export function Stepper({ value, onChange, min = 0, max, size = 'default' }: StepperProps) {
  const large = size === 'large';
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={dec}
        disabled={value <= min}
        style={[styles.btn, large && styles.btnLarge, value <= min && styles.btnDisabled]}
      >
        <Text style={styles.btnLabel}>–</Text>
      </Pressable>
      <Text style={[styles.value, large && styles.valueLarge]}>{value}</Text>
      <Pressable
        onPress={inc}
        disabled={max !== undefined && value >= max}
        style={[styles.btn, large && styles.btnLarge, max !== undefined && value >= max && styles.btnDisabled]}
      >
        <Text style={styles.btnLabel}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  btn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLarge: { width: 40, height: 40 },
  btnDisabled: { opacity: 0.4 },
  btnLabel: { fontFamily: fontFamily.display, fontSize: 17, color: colors.ink },
  value: {
    fontFamily: fontFamily.display,
    fontSize: fontSize.lg,
    minWidth: 28,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  valueLarge: { fontSize: 21, minWidth: 34 },
});
