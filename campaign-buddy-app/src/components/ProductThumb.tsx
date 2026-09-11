/**
 * Product "photo": renders the real product image when `imageUrl` is given
 * (falling back to the placeholder if it fails to load), otherwise a bottle
 * silhouette with a colored label band. Screens that don't yet have an
 * imageUrl to pass through keep the placeholder unchanged.
 */
import React, { useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';

interface ProductThumbProps {
  size?: number;
  bandColor?: string;
  imageUrl?: string | null;
}

export function ProductThumb({ size = 46, bandColor = colors.info, imageUrl }: ProductThumbProps) {
  const [failed, setFailed] = useState(false);

  if (imageUrl && !failed) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: size, height: size, borderRadius: size * 0.24, backgroundColor: '#EEF1EC' }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.24 }]}>
      <View style={[styles.bottle, { width: size * 0.36, height: size * 0.5 }]}>
        <View style={[styles.band, { backgroundColor: bandColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#EEF1EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottle: {
    backgroundColor: '#2B2420',
    borderRadius: 3,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  band: { height: '35%', width: '100%' },
});
