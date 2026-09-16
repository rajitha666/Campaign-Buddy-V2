// Spec §4 — Profile
import { apiClient } from './client';
import type { User, TodayAssignment } from './types';

export async function getMe(): Promise<User> {
  const { data } = await apiClient.get<{ data: User }>('/me');
  return data.data;
}

export async function getTodayAssignment(): Promise<TodayAssignment> {
  const { data } = await apiClient.get<{ data: TodayAssignment }>('/me/assignments/today');
  return data.data;
}
