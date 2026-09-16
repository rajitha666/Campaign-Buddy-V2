import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, fontFamily } from '@/theme';
import { resolveFileUrl } from '@/lib/files';

// Shows a staff profile photo when one is set (#18/#29), initials otherwise.
// The photo is uploaded from the portal, so the app only displays it (#41).
export function Avatar({
  initials,
  imageUrl,
  size = 46,
}: {
  initials: string;
  imageUrl?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  // profilePictureUrl arrives as a relative /uploads path — resolve it against
  // the API origin or the photo never loads on-device.
  const resolved = resolveFileUrl(imageUrl);
  const shape: object = { width: size, height: size, borderRadius: size / 2 };
  if (resolved && !failed) {
    return (
      <Image
        source={{ uri: resolved }}
        style={[styles.base, styles.image, shape]}
        onError={() => setFailed(true)}
      />
    );
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
