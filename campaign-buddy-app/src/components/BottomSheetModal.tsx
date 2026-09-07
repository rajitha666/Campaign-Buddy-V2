/**
 * Bottom-sheet popup used for product details, the new time-off request
 * form, and the checkout confirmation. Matches the HTML prototype's
 * scrim + sheet pattern: tapping the dimmed backdrop closes it, tapping
 * inside the sheet does not.
 *
 * Built on RN core `Modal` (no @gorhom/bottom-sheet or reanimated
 * dependency) to keep the scaffold buildable without extra native linking.
 * If your team wants drag-to-dismiss / snap points later, swap this one
 * component for @gorhom/bottom-sheet — every screen calls it the same way
 * (`<BottomSheetModal visible={...} onClose={...}>`), so that's a
 * contained change.
 */
import React from 'react';
import { Modal, View, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors, radius, spacing } from '@/theme';

interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function BottomSheetModal({ visible, onClose, children }: BottomSheetModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        {/* Inner Pressable with no onPress swallows taps so they don't bubble to the scrim above. */}
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <View style={styles.dragHandle} />
          <ScrollView
            style={styles.sheet}
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    // absolute-fill rather than flex:1 — on RN Web the Modal's host node has no
    // intrinsic height, so a flex child collapses and the sheet lands below the
    // fold. Filling the viewport explicitly keeps it pinned to the bottom.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 3,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  sheet: {
    // transparent — background lives on sheetWrap so the drag handle sits
    // visually inside the same white card, not floating on the scrim.
  },
  sheetContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl + spacing.sm,
  },
});
