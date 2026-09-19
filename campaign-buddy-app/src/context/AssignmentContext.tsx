/**
 * Multi-outlet promoters: which of today's assignments is live.
 *
 * A promoter can be on two (or more) outlet Activations the same day, so the
 * app must let them CHOOSE one instead of silently using the server's
 * arbitrary findFirst pick ("only one of my outlets shows" bug). Sources the
 * list from GET /me/assignments (day-cached, offline-tolerant) and falls back
 * to the single /me/assignments/today object when the list is empty, so
 * single-assignment promoters and offline cold-starts behave as before.
 *
 * While the user has a chosen outlet open, the selection is also written to
 * the day's `assignment:` offline cache — the product-stock offline paths
 * (readBase / applyQueuedWrite) derive campaign+outlet from it.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { localDayKey } from '@/lib/date';
import * as offlineQueries from '@/offline/queries';
import { cacheKeys, patchCache } from '@/offline/localApply';
import type { TodayAssignment } from '@/api/types';


interface AssignmentContextValue {
  assignments: TodayAssignment[];
  /** The chosen assignment (defaults to the first); `undefined` until loaded. */
  assignment: TodayAssignment | undefined;
  /** True when there is more than one outlet to pick between. */
  hasMultiple: boolean;
  isLoading: boolean;
  select: (assignmentId: string) => void;
}

const AssignmentContext = createContext<AssignmentContextValue | undefined>(undefined);

export function AssignmentProvider({ children }: { children: React.ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useQuery({ queryKey: ['assignments', 'me'], queryFn: offlineQueries.getMyAssignments });
  // Fallback keeps old behaviour when the list is empty (offline cache miss, or
  // a promoter whose single assignment is only readable from /today).
  const fallbackQuery = useQuery({
    queryKey: ['assignment', 'today'],
    queryFn: offlineQueries.getTodayAssignment,
    enabled: !listQuery.data || listQuery.data.length === 0,
  });

  const assignments = useMemo(() => {
    if (listQuery.data?.length) return listQuery.data;
    if (fallbackQuery.data) return [fallbackQuery.data];
    return [];
  }, [listQuery.data, fallbackQuery.data]);

  const isLoading = listQuery.isLoading || fallbackQuery.isLoading;

  const value = useMemo<AssignmentContextValue>(() => {
    const assignment = assignments.find((a) => a.assignmentId === selectedId) ?? assignments[0];
    return {
      assignments,
      assignment,
      hasMultiple: assignments.length > 1,
      isLoading: isLoading || (assignments.length === 0 && !listQuery.data),
      select: setSelectedId,
    };
  }, [assignments, selectedId, isLoading, listQuery.data]);

  // Keep the offline "which outlet am I on" cache in step with the selection,
  // so offline product-stock reads and patches land on the chosen outlet.
  const chosen = assignments.find((a) => a.assignmentId === selectedId);
  useEffect(() => {
    if (!chosen) return;
    patchCache(cacheKeys.assignment(localDayKey()), () => chosen).catch(() => {});
  }, [chosen]);

  return <AssignmentContext.Provider value={value}>{children}</AssignmentContext.Provider>;
}

export function useAssignment(): AssignmentContextValue {
  const ctx = useContext(AssignmentContext);
  if (!ctx) throw new Error('useAssignment must be used within an AssignmentProvider');
  return ctx;
}
