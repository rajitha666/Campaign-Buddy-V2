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

// Staff profile picture (#18/#29) — multipart to POST /me/photo; the backend
// stores it and returns the URL that also comes back on GET /me.
export async function uploadPhoto(image: FormData): Promise<string> {
  // No explicit Content-Type: the RN fetch adapter leaves it to the platform,
  // which builds the multipart boundary header FormData needs.
  const { data } = await apiClient.post<{ data: { profilePictureUrl: string } }>('/me/photo', image);
  return data.data.profilePictureUrl;
}
