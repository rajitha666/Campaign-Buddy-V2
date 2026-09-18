import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Button } from './Button';
import { resolveFileUrl } from '@/lib/files';
import type { ChecklistPhoto } from '@/api/types';
import { colors, fontSize, radius, spacing } from '@/theme';

interface Props {
  photos: ChecklistPhoto[];
  required: number;
  busy: boolean;
  onCapture: () => void;
  onRemove: (url: string) => void;
}

// Thumbnails of the photos already saved for a task, a remove control on each,
// and a camera button until the required number has been captured.
export function PhotoCapture({ photos, required, busy, onCapture, onRemove }: Props) {
  const canAddMore = photos.length < required;
  return (
    <View>
      {photos.length > 0 ? (
        <View style={styles.grid}>
          {photos.map(({ url }) => (
            <View key={url} style={styles.thumbWrap}>
              <Image source={{ uri: resolveFileUrl(url) ?? undefined }} style={styles.thumb} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                disabled={busy}
                onPress={() => onRemove(url)}
                style={styles.remove}
              >
                <Text style={styles.removeText}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={styles.count}>
        {photos.length} of {required} photo{required === 1 ? '' : 's'}
      </Text>
      {canAddMore ? (
        <Button
          label={photos.length === 0 ? 'Take photo' : 'Take another photo'}
          variant="secondary"
          onPress={onCapture}
          loading={busy}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: { width: 84, height: 84 },
  thumb: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.line },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.alert,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: colors.white, fontSize: 16, lineHeight: 18, fontWeight: '700' },
  count: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
});
