// Supervisor outlet checklist — docs/api-spec.md §4 /me/assignments/:id/supervisor-tasks
import { apiClient } from './client';
import type { ChecklistAnswer, ChecklistPhoto, SupervisorChecklist } from './types';

const base = (assignmentId: string) => `/me/assignments/${assignmentId}/supervisor-tasks`;

export async function getChecklist(assignmentId: string): Promise<SupervisorChecklist> {
  const { data } = await apiClient.get<{ data: SupervisorChecklist }>(base(assignmentId));
  return data.data;
}

export async function saveResponses(assignmentId: string, responses: ChecklistAnswer[]): Promise<void> {
  await apiClient.put(`${base(assignmentId)}/responses`, { responses });
}

export interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
}

/** Uploads one outlet-setup photo; resolves to the task's full photo list. */
export async function uploadPhoto(assignmentId: string, taskId: string, photo: PickedPhoto): Promise<ChecklistPhoto[]> {
  const form = new FormData();
  // Read the local file into a real Blob first. React Native's {uri, name, type}
  // FormData part only works with the old XHR-backed fetch, but the app's fetch
  // adapter hands the body to the global fetch — expo/fetch on SDK 57 — which
  // rejects it with "Unsupported FormDataPart implementation" (android upload bug).
  // expo/fetch reads file:// content URIs on both web (blob url) and native.
  const blob = await (await fetch(photo.uri)).blob();
  // expo/fetch guesses the Blob type from the file's extension; the image
  // manipulator's cache path may have none, giving an unusable MIME that the
  // backend rejects. The picker-provided type (the app always encodes JPEG) wins.
  const typed = blob.type === photo.type ? blob : new Blob([blob], { type: photo.type });
  form.append('image', typed, photo.name);
  const { data } = await apiClient.post<{ data: { photos: ChecklistPhoto[] } }>(`${base(assignmentId)}/${taskId}/photos`, form, {
    // The custom fetch adapter hands the body to fetch untouched, so axios must
    // not stamp a urlencoded Content-Type on it — fetch has to set the multipart boundary.
    headers: { 'Content-Type': false as unknown as string },
  });
  return data.data.photos;
}

export async function deletePhoto(assignmentId: string, taskId: string, url: string): Promise<ChecklistPhoto[]> {
  const { data } = await apiClient.delete<{ data: { photos: ChecklistPhoto[] } }>(`${base(assignmentId)}/${taskId}/photos`, {
    params: { url },
  });
  return data.data.photos;
}
