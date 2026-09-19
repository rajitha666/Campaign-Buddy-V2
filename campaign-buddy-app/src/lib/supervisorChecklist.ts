import type { ChecklistAnswer, ChecklistTask } from '@/api/types';

/** Unsaved edits, keyed by task id. Absent field = untouched; null = cleared. */
export type ChecklistDrafts = Record<string, { rating?: number | null; feedback?: string | null }>;

export function groupTasksByCategory(tasks: ChecklistTask[]): Array<{ category: string; tasks: ChecklistTask[] }> {
  const groups = new Map<string, ChecklistTask[]>();
  for (const t of tasks) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
  return [...groups].map(([category, list]) => ({ category, tasks: list }));
}

const normFeedback = (v: string | null | undefined) => (v == null || v.trim() === '' ? null : v.trim());

/** The answers worth sending: only edits that differ from what is already saved. */
export function buildSavePayload(tasks: ChecklistTask[], drafts: ChecklistDrafts): ChecklistAnswer[] {
  const payload: ChecklistAnswer[] = [];
  for (const t of tasks) {
    const d = drafts[t.id];
    if (!d) continue;
    const answer: ChecklistAnswer = { taskId: t.id };
    if (d.rating !== undefined && d.rating !== (t.response?.rating ?? null)) answer.rating = d.rating;
    if (d.feedback !== undefined && normFeedback(d.feedback) !== normFeedback(t.response?.feedback)) {
      answer.feedback = normFeedback(d.feedback);
    }
    if (answer.rating !== undefined || answer.feedback !== undefined) payload.push(answer);
  }
  return payload;
}

export function photoProgress(task: ChecklistTask) {
  const taken = task.response?.photos.length ?? 0;
  return { taken, required: task.imageCount, complete: taken >= task.imageCount, canAddMore: taken < task.imageCount };
}

/**
 * The checklist opens once the supervisor has checked in at the outlet today —
 * and stays open after check-out, because they can only be checked in at one
 * outlet at a time and must still be able to finish the one they just left.
 */
export function checklistUnlocked(attendance: { checkedIn: boolean; checkInAt: string | null }): boolean {
  return attendance.checkedIn || attendance.checkInAt != null;
}

/** How many tasks have an answer (saved or drafted) out of the total. */
export function checklistProgress(tasks: ChecklistTask[], drafts: ChecklistDrafts): { done: number; total: number } {
  const done = tasks.filter((t) => {
    if (t.taskType === 'photo') return photoProgress(t).complete;
    const d = drafts[t.id];
    if (t.taskType === 'range') return (d?.rating !== undefined ? d.rating : t.response?.rating) != null;
    return normFeedback(d?.feedback !== undefined ? d.feedback : t.response?.feedback) != null;
  }).length;
  return { done, total: tasks.length };
}
