/**
 * Matches `.btn-primary` / `.btn-secondary` from the HTML prototype.
 * Use `variant="alert"` for destructive-ish actions styled in the mockups
 * with alert-colored text on a secondary button (e.g. "Check out").
 */
import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';

type Variant = 'primary' | 'secondary' | 'alert';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, style }: ButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        variant === 'alert' && styles.alertBorder,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.white : colors.ink} />
      ) : (
        <Text
          style={[
            styles.label,
            isPrimary ? styles.labelPrimary : styles.labelSecondary,
            variant === 'alert' && styles.labelAlert,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.mango },
  secondary: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  alertBorder: { borderColor: '#F3D3D0' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  label: { fontFamily: fontFamily.display, fontSize: fontSize.md },
  labelPrimary: { color: colors.white },
  labelSecondary: { color: colors.ink },
  labelAlert: { color: colors.alert },
});
