/**
 * New time-off request form. Date fields are simplified to fixed
 * placeholders here — swap in a real date picker (e.g.
 * @react-native-community/datetimepicker) for production; the important
 * part for backend integration is the `fromDate`/`toDate` shape sent to
 * POST /time-off/requests (spec §7), which this already matches.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BottomSheetModal } from './BottomSheetModal';
import { Button } from './Button';
import * as timeOffApi from '@/api/timeOff';
import type { TimeOffReason } from '@/api/types';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';
import { getApiErrorMessage } from '@/api/client';

const REASONS: { value: TimeOffReason; label: string }[] = [
  { value: 'sick_leave', label: 'Sick leave' },
  { value: 'annual_leave', label: 'Annual leave' },
  { value: 'personal', label: 'Personal' },
  { value: 'other', label: 'Other' },
];

interface TimeOffRequestSheetProps {
  visible: boolean;
  onClose: () => void;
  defaultFromDate: string; // ISODate
  defaultToDate: string;
}

export function TimeOffRequestSheet({
  visible,
  onClose,
  defaultFromDate,
  defaultToDate,
}: TimeOffRequestSheetProps) {
  const queryClient = useQueryClient();
  const [fromDate] = useState(defaultFromDate);
  const [toDate] = useState(defaultToDate);
  const [reason, setReason] = useState<TimeOffReason>('sick_leave');
  const [note, setNote] = useState('');

  const days =
    Math.round((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86_400_000) + 1;

  const submitMutation = useMutation({
    mutationFn: () => timeOffApi.createTimeOffRequest({ fromDate, toDate, reason, note: note || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-off'] });
      onClose();
    },
    onError: (err) => Alert.alert('Could not submit request', getApiErrorMessage(err)),
  });

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.title}>New time off request</Text>
      </View>

      <View style={styles.dateRow}>
        <DateField label="From" value={fromDate} />
        <DateField label="To" value={toDate} />
      </View>

      <View style={styles.dayCount}>
        <Text style={styles.dayCountLabel}>Total duration</Text>
        <Text style={styles.dayCountValue}>{days} {days === 1 ? 'day' : 'days'}</Text>
      </View>

      <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Reason</Text>
      <View style={styles.reasonOptions}>
        {REASONS.map((r) => (
          <Pressable
            key={r.value}
            onPress={() => setReason(r.value)}
            style={[styles.reasonChip, reason === r.value && styles.reasonChipSelected]}
          >
            <Text style={[styles.reasonChipLabel, reason === r.value && styles.reasonChipLabelSelected]}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.noteInput}
        placeholder="Add a note for your approver (optional)"
        placeholderTextColor="#A9B2AC"
        value={note}
        onChangeText={setNote}
        multiline
      />

      <Button
        label="Submit request"
        onPress={() => submitMutation.mutate()}
        loading={submitMutation.isPending}
        style={{ marginTop: spacing.xl }}
      />
    </BottomSheetModal>
  );
}

function DateField({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.dateBox}>
        <Text style={styles.dateBoxText}>
          {new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.textPrimary },
  dateRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.sm },
  dateBox: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md + 1,
    backgroundColor: colors.surfaceCard,
  },
  dateBoxText: { fontSize: fontSize.md, color: colors.textPrimary },
  dayCount: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.infoTint,
    borderRadius: radius.md,
    padding: spacing.md + 3,
    marginTop: spacing.lg,
  },
  dayCountLabel: { fontSize: 12.5, fontWeight: '600', color: colors.info },
  dayCountValue: { fontFamily: fontFamily.display, fontSize: fontSize.md, color: colors.info },
  reasonOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  reasonChip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md + 1,
  },
  reasonChipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  reasonChipLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  reasonChipLabelSelected: { color: colors.white },
  noteInput: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md + 1,
    marginTop: spacing.md,
    fontSize: 13.5,
    color: colors.textPrimary,
    minHeight: 46,
    textAlignVertical: 'top',
    backgroundColor: colors.surfaceCard,
  },
});
