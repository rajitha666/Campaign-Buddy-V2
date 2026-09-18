/**
 * The backend blocks sales/stats/stock writes until the rep has an open
 * shift (requireOpenShift — see products/salesSummary/stats routes). Without
 * this notice, tapping Save while not checked in just fails silently on web
 * (react-native-web's Alert.alert is a no-op there) and shows a native alert
 * on-device that's easy to miss — better to say it up front and disable the
 * button than let the rep tap it into the void.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme';

export function CheckInRequiredNotice() {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>You need to check in before you can save changes here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.pendingTint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  text: { color: colors.pending, fontSize: fontSize.sm, fontWeight: '600', textAlign: 'center' },
});
