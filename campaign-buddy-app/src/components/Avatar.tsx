import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, fontFamily } from '@/theme';

// Shows a staff profile photo when one is set (#18/#29), initials otherwise.
export function Avatar({
  initials,
  imageUrl,
  size = 46,
}: {
  initials: string;
  imageUrl?: string | null;
  size?: number;
}) {
  const shape: object = { width: size, height: size, borderRadius: size / 2 };
  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={[styles.base, styles.image, shape]} />;
  }
  return (
    <View style={[styles.base, shape]}>
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
  image: {},
  label: { fontFamily: fontFamily.display, color: colors.mangoDark },
});
