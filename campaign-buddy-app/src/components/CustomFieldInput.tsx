import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { CustomSalesField } from '@/api/types';
import { ToggleSwitch } from './ToggleSwitch';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';

export type CustomFieldValue = number | boolean | string | null;

interface Props {
  field: CustomSalesField;
  value: CustomFieldValue;
  onChange: (value: CustomFieldValue) => void;
  disabled?: boolean;
  /** hide the bottom divider (last row in a group) */
  last?: boolean;
}

// Renders one admin-defined custom sales field as an editable row (issue #13).
export function CustomFieldInput({ field, value, onChange, disabled, last }: Props) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <View style={styles.labelCol}>
        <Text style={styles.label}>
          {field.label}
          {field.required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      </View>
      <View style={styles.control}>
        {field.type === 'boolean' ? (
          <ToggleSwitch value={value === true} onValueChange={(v) => onChange(v)} />
        ) : field.type === 'select' ? (
          <View style={styles.chips}>
            {field.options.map((opt) => {
              const selected = value === opt;
              return (
                <Pressable
                  key={opt}
                  disabled={disabled}
                  onPress={() => onChange(selected ? null : opt)}
                  style={[styles.chip, selected && styles.chipOn, disabled && styles.chipDisabled]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <TextInput
            editable={!disabled}
            value={value == null ? '' : String(value)}
            onChangeText={(t) => {
              if (field.type === 'number') {
                onChange(t.trim() === '' ? null : Number(t.replace(/[^0-9.-]/g, '')));
              } else {
                onChange(t === '' ? null : t);
              }
            }}
            keyboardType={field.type === 'number' ? 'numeric' : 'default'}
            placeholder={field.type === 'number' ? '0' : 'Enter a value'}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, disabled && styles.inputDisabled]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  labelCol: { flex: 1 },
  label: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  req: { color: colors.alert },
  control: { flexShrink: 0, maxWidth: '58%', alignItems: 'flex-end' },
  input: {
    minWidth: 90,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    textAlign: 'right',
    backgroundColor: colors.surfaceCard,
  },
  inputDisabled: { color: colors.textMuted, backgroundColor: colors.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end' },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipDisabled: { opacity: 0.5 },
  chipText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted, fontFamily: fontFamily.body },
  chipTextOn: { color: colors.white },
});
