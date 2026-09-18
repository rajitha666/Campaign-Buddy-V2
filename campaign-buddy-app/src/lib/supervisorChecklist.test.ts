import { describe, it, expect } from 'vitest';
import {
  groupTasksByCategory,
  buildSavePayload,
  photoProgress,
  checklistProgress,
  checklistUnlocked,
} from './supervisorChecklist';
import type { ChecklistTask } from '@/api/types';

const task = (over: Partial<ChecklistTask> & { id: string }): ChecklistTask => ({
  category: 'Sale',
  taskType: 'range',
  task: 't',
  imageCount: 0,
  response: null,
  ...over,
});
const answered = (over: Partial<NonNullable<ChecklistTask['response']>>) => ({ rating: null, feedback: null, photos: [], ...over });
const shot = (url: string) => ({ url, uploadedAt: '2026-09-18T09:00:00.000Z' });

describe('groupTasksByCategory', () => {
  it('groups tasks by category in first-appearance order', () => {
    const groups = groupTasksByCategory([
      task({ id: 'a', category: 'Sale' }),
      task({ id: 'b', category: 'Outlet PR' }),
      task({ id: 'c', category: 'Sale' }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(['Sale', 'Outlet PR']);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['a', 'c']);
  });
});

describe('buildSavePayload', () => {
  const tasks = [
    task({ id: 'r', taskType: 'range', response: answered({ rating: 3 }) }),
    task({ id: 'f', taskType: 'feedback' }),
  ];

  it('sends only answers that differ from what is already saved', () => {
    const payload = buildSavePayload(tasks, { r: { rating: 3 }, f: { feedback: 'Low stock' } });
    expect(payload).toEqual([{ taskId: 'f', feedback: 'Low stock' }]);
  });

  it('sends a changed rating, and null to clear one', () => {
    expect(buildSavePayload(tasks, { r: { rating: 5 } })).toEqual([{ taskId: 'r', rating: 5 }]);
    expect(buildSavePayload(tasks, { r: { rating: null } })).toEqual([{ taskId: 'r', rating: null }]);
  });

  it('treats blank feedback as clearing it', () => {
    const withFeedback = [task({ id: 'f', taskType: 'feedback', response: answered({ feedback: 'old' }) })];
    expect(buildSavePayload(withFeedback, { f: { feedback: '   ' } })).toEqual([{ taskId: 'f', feedback: null }]);
  });

  it('returns nothing when there are no edits', () => {
    expect(buildSavePayload(tasks, {})).toEqual([]);
  });
});

describe('photoProgress', () => {
  it('reports captured vs required photos', () => {
    const t = task({ id: 'p', taskType: 'photo', imageCount: 3, response: answered({ photos: [shot('a'), shot('b')] }) });
    expect(photoProgress(t)).toEqual({ taken: 2, required: 3, complete: false, canAddMore: true });
  });

  it('is complete and full once the required count is reached', () => {
    const t = task({ id: 'p', taskType: 'photo', imageCount: 1, response: answered({ photos: [shot('a')] }) });
    expect(photoProgress(t)).toMatchObject({ complete: true, canAddMore: false });
  });

  it('handles a task with no response yet', () => {
    expect(photoProgress(task({ id: 'p', taskType: 'photo', imageCount: 2 })).taken).toBe(0);
  });
});

describe('checklistProgress', () => {
  it('counts a task as done when rated, given feedback, or fully photographed — including unsaved drafts', () => {
    const tasks = [
      task({ id: 'r', taskType: 'range' }),
      task({ id: 'f', taskType: 'feedback', response: answered({ feedback: 'ok' }) }),
      task({ id: 'p', taskType: 'photo', imageCount: 1 }),
    ];
    expect(checklistProgress(tasks, {})).toEqual({ done: 1, total: 3 });
    expect(checklistProgress(tasks, { r: { rating: 4 } })).toEqual({ done: 2, total: 3 });
  });
});

// A supervisor can only be checked in at one outlet at a time, so once they
// check out and move on, the checklist for the outlet they just left must
// stay reachable (forgotten photo, late note).
describe('checklistUnlocked', () => {
  it('is open while checked in, and stays open after check-out the same day', () => {
    expect(checklistUnlocked({ checkedIn: true, checkInAt: '2026-09-18T09:00:00Z' })).toBe(true);
    expect(checklistUnlocked({ checkedIn: false, checkInAt: '2026-09-18T09:00:00Z' })).toBe(true);
  });

  it('is locked if the supervisor never checked in at this outlet today', () => {
    expect(checklistUnlocked({ checkedIn: false, checkInAt: null })).toBe(false);
  });
});
