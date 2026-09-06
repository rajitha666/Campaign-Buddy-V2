import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontFamily } from '@/theme';

export function Avatar({ initials, size = 46 }: { initials: string; size?: number }) {
  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.label, { fontSize: size * 0.37 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.mangoTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: fontFamily.display, color: colors.mangoDark },
});
