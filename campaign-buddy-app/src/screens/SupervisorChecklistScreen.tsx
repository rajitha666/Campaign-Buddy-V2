/**
 * Outlet checklist — pushed from a visit on the supervisor's "My Route" tab.
 * The supervisor scores the promoter (1–5, fixed definitions), leaves feedback
 * and captures the outlet-setup photos the campaign asks for. Ratings and
 * feedback are saved together with the button; each photo uploads immediately
 * (it can't sit in memory across a flaky connection). Online-only for now.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Platform } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupervisorRouteStackParamList } from '@/navigation/types';
import * as checklistApi from '@/api/supervisorChecklist';
import { getApiErrorMessage } from '@/api/client';
import { RatingSelector } from '@/components/RatingSelector';
import { PhotoCapture } from '@/components/PhotoCapture';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { capturePhoto } from '@/lib/capturePhoto';
import { showAlert } from '@/lib/showAlert';
import {
  buildSavePayload,
  checklistProgress,
  groupTasksByCategory,
  photoProgress,
  type ChecklistDrafts,
} from '@/lib/supervisorChecklist';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';

type Nav = NativeStackNavigationProp<SupervisorRouteStackParamList, 'SupervisorChecklist'>;
type Route = NativeStackScreenProps<SupervisorRouteStackParamList, 'SupervisorChecklist'>['route'];

function confirmDiscard(onDiscard: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm('You have unsaved answers. Leave without saving?')) onDiscard();
    return;
  }
  Alert.alert('Unsaved answers', 'Leave without saving your answers?', [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: onDiscard },
  ]);
}

export function SupervisorChecklistScreen() {
  const navigation = useNavigation<Nav>();
  const { assignmentId, outletName, campaignName } = useRoute<Route>().params;
  const queryClient = useQueryClient();
  const queryKey = ['supervisor', 'checklist', assignmentId];
  const query = useQuery({ queryKey, queryFn: () => checklistApi.getChecklist(assignmentId) });
  const [drafts, setDrafts] = useState<ChecklistDrafts>({});
  const [savedNotice, setSavedNotice] = useState(false);

  const tasks = query.data?.tasks ?? [];
  const payload = buildSavePayload(tasks, drafts);
  const progress = checklistProgress(tasks, drafts);

  const dirty = useRef(false);
  dirty.current = payload.length > 0;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirty.current) return;
        e.preventDefault();
        confirmDiscard(() => navigation.dispatch(e.data.action));
      }),
    [navigation]
  );

  function edit(taskId: string, change: { rating?: number | null; feedback?: string | null }) {
    setSavedNotice(false);
    setDrafts((d) => ({ ...d, [taskId]: { ...d[taskId], ...change } }));
  }

  const saveMutation = useMutation({
    mutationFn: () => checklistApi.saveResponses(assignmentId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setDrafts({});
      setSavedNotice(true);
      // Briefly show the "Saved" confirmation, then land back on Home (My
      // Route — the supervisor's home tab).
      window.setTimeout(() => {
        dirty.current = false;
        navigation.popToTop();
      }, 900);
    },
    onError: (err) => showAlert('Could not save', getApiErrorMessage(err)),
  });

  const photoMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const photo = await capturePhoto();
      if (photo) await checklistApi.uploadPhoto(assignmentId, taskId, photo);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => showAlert('Could not add photo', err instanceof Error && !('response' in err) ? err.message : getApiErrorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (v: { taskId: string; url: string }) => checklistApi.deletePhoto(assignmentId, v.taskId, v.url),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => showAlert('Could not remove photo', getApiErrorMessage(err)),
  });

  const scale = query.data?.ratingScale ?? [];

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <View style={styles.topnav}>
        <Pressable style={styles.backRow} onPress={() => navigation.goBack()}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M15 5l-7 7 7 7" stroke="#F4F6F3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Outlet checklist</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {outletName} · {campaignName}
              {query.data?.visitNo && query.data.visitNo > 1 ? ` · Visit ${query.data.visitNo}` : ''}
            </Text>
          </View>
        </Pressable>
      </View>

      {query.isLoading ? (
        <Text style={styles.stateText}>Loading checklist…</Text>
      ) : query.isError ? (
        <View style={styles.state}>
          <Text style={styles.stateText}>Could not load the checklist. {getApiErrorMessage(query.error)}</Text>
          <Button label="Try again" variant="secondary" onPress={() => query.refetch()} style={{ marginTop: spacing.md }} />
        </View>
      ) : tasks.length === 0 ? (
        <Text style={styles.stateText}>No checklist has been set up for this campaign yet.</Text>
      ) : (
        <>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            extraScrollHeight={24}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.promoter}>Scoring promoter: {query.data?.promoter.name}</Text>
            <Text style={styles.progress}>
              {progress.done} of {progress.total} done
            </Text>

            {groupTasksByCategory(tasks).map((group) => (
              <View key={group.category}>
                <Text style={styles.category}>{group.category}</Text>
                {group.tasks.map((t) => {
                  const draft = drafts[t.id];
                  return (
                    <Card key={t.id} style={{ marginBottom: spacing.md }}>
                      <Text style={styles.taskText}>{t.task}</Text>
                      {t.taskType === 'range' ? (
                        <RatingSelector
                          scale={scale}
                          value={draft?.rating !== undefined ? draft.rating : t.response?.rating ?? null}
                          onChange={(rating) => edit(t.id, { rating })}
                        />
                      ) : t.taskType === 'feedback' ? (
                        <TextInput
                          multiline
                          value={draft?.feedback !== undefined ? draft.feedback ?? '' : t.response?.feedback ?? ''}
                          onChangeText={(feedback) => edit(t.id, { feedback })}
                          placeholder="Type your feedback"
                          placeholderTextColor={colors.textMuted}
                          style={styles.feedback}
                        />
                      ) : (
                        <PhotoCapture
                          photos={t.response?.photos ?? []}
                          required={photoProgress(t).required}
                          busy={
                            (photoMutation.isPending && photoMutation.variables === t.id) ||
                            (removeMutation.isPending && removeMutation.variables?.taskId === t.id)
                          }
                          onCapture={() => photoMutation.mutate(t.id)}
                          onRemove={(url) => removeMutation.mutate({ taskId: t.id, url })}
                        />
                      )}
                    </Card>
                  );
                })}
              </View>
            ))}
          </KeyboardAwareScrollView>

          <View style={styles.footer}>
            {savedNotice ? <Text style={styles.saved}>Saved</Text> : null}
            <Button
              label="Save checklist"
              onPress={() => saveMutation.mutate()}
              disabled={payload.length === 0}
              loading={saveMutation.isPending}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.surface },
  topnav: { backgroundColor: colors.ink, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.white },
  subtitle: { color: '#9FB2AA', fontSize: 12.5, marginTop: 2 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl },
  state: { padding: spacing.xl },
  stateText: { padding: spacing.xl, fontSize: fontSize.base, color: colors.textMuted },
  promoter: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  progress: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  category: { fontSize: fontSize.base, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.md },
  taskText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.md },
  feedback: {
    minHeight: 76,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceCard,
    textAlignVertical: 'top',
  },
  footer: { padding: spacing.lg, backgroundColor: colors.surfaceCard, borderTopWidth: 1, borderTopColor: colors.line },
  saved: { textAlign: 'center', color: colors.success, fontWeight: '600', marginBottom: spacing.sm },
});
