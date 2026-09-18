/**
 * The +/- counter used everywhere a rep enters a quantity: opening stock,
 * sold today, other interested customers, foot fall/approached/conversion.
 *
 * Deliberately uncontrolled-feeling but fully controlled: parent owns
 * `value` and receives the new value via `onChange`. Parents are expected
 * to debounce/batch their own PATCH calls (see ProductUpdateScreen.tsx for
 * the pattern) rather than firing a network request on every single tap.
 *
 * The number itself is also tappable — reps entering a large count (e.g.
 * opening stock of 60) shouldn't have to tap "+" sixty times.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';
import { parseStepperInput } from '@/lib/stepper';

interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: 'default' | 'large';
}

export function Stepper({ value, onChange, min = 0, max, size = 'default' }: StepperProps) {
  const large = size === 'large';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1);

  const startEditing = () => {
    setDraft(String(value));
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    onChange(parseStepperInput(draft, min, max));
  };

  return (
    <View style={styles.row}>
      <Pressable
        onPress={dec}
        disabled={value <= min}
        style={[styles.btn, large && styles.btnLarge, value <= min && styles.btnDisabled]}
      >
        <Text style={styles.btnLabel}>–</Text>
      </Pressable>
      {editing ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          autoFocus
          selectTextOnFocus
          style={[styles.value, styles.valueInput, large && styles.valueLarge]}
        />
      ) : (
        <Pressable onPress={startEditing}>
          <Text style={[styles.value, large && styles.valueLarge]}>{value}</Text>
        </Pressable>
      )}
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
  // Explicit width, not just minWidth — react-native-web renders TextInput as
  // a plain <input>, which defaults to a much wider intrinsic size than the
  // Text it replaces. Left unconstrained, that width wins inside a flex row
  // that doesn't grow/shrink its children, crushing the label next to it.
  // Only applied to the editing TextInput, not the static Text (valueLarge) —
  // that one should still be free to grow for a longer number.
  valueInput: { padding: 0, minWidth: 34, width: 40 },
  valueLarge: { fontSize: 21, minWidth: 34 },
});
