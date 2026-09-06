/**
 * Placeholder product "photo": a simple bottle silhouette with a colored
 * label band, used until real product photography is wired up via
 * `product.imageUrl`. Swap the SVG for an <Image> once that's available —
 * this component's prop shape (`size`, `bandColor`) is intentionally the
 * only thing screens depend on, so that swap is a one-file change.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';

export function ProductThumb({ size = 46, bandColor = colors.info }: { size?: number; bandColor?: string }) {
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
