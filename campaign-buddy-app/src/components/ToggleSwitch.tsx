/**
 * Thin wrapper around RN's core Switch so every toggle in the app (reorder
 * flag, "reorder only" filter, etc.) uses the same on/off colors without
 * repeating trackColor/thumbColor props everywhere.
 */
import React from 'react';
import { Switch } from 'react-native';
import { colors } from '@/theme';

export function ToggleSwitch({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: colors.line, true: colors.mango }}
      thumbColor={colors.white}
      ios_backgroundColor={colors.line}
    />
  );
}
