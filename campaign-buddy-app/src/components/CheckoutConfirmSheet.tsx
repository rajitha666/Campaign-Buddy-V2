/**
 * Opens when the rep taps "Check out" on the Attendance screen.
 *
 *  - "Yes, check out" -> calls useAttendance().checkOut() directly.
 *  - "No, confirm sales summary" -> closes this sheet and navigates to the
 *    Sales tab so the rep can review/confirm numbers BEFORE checking out.
 *    Note this does NOT call checkOut() — the rep needs to come back and
 *    tap "Check out" again once they've confirmed. That's intentional: we
 *    never want to silently check someone out from inside the Sales screen.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { BottomSheetModal } from './BottomSheetModal';
import { Button } from './Button';
import { useAttendance } from '@/context/AttendanceContext';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';
import { getApiErrorMessage } from '@/api/client';

interface CheckoutConfirmSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function CheckoutConfirmSheet({ visible, onClose }: CheckoutConfirmSheetProps) {
  const { checkOut } = useAttendance();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);

  async function handleYes() {
    setLoading(true);
    try {
      await checkOut();
      onClose();
    } catch (err) {
      Alert.alert('Could not check out', getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function handleNo() {
    onClose();
    navigation.getParent()?.navigate('SalesTab' as never);
  }

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <View style={styles.icon}>
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Rect x={4} y={5} width={16} height={14} stroke={colors.pending} strokeWidth={1.8} />
          <Path d="M4 10h16" stroke={colors.pending} strokeWidth={1.8} />
        </Svg>
      </View>
      <Text style={styles.title}>Before you check out</Text>
      <Text style={styles.question}>Did you confirm the sales summary for today?</Text>
      <Button label="Yes, check out" onPress={handleYes} loading={loading} style={styles.btnGap} />
      <Button label="No, confirm sales summary" onPress={handleNo} variant="secondary" style={styles.btnGap} />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.pendingTint,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: spacing.xs,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginTop: spacing.md,
    color: colors.textPrimary,
  },
  question: {
    fontSize: 13.5,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  btnGap: { marginTop: spacing.lg },
});
