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
  if (typeof document !== 'undefined') {
    // Web (Expo web build): the picked uri is a blob/data url, not a native file.
    const blob = await (await fetch(photo.uri)).blob();
    form.append('image', blob, photo.name);
  } else {
    // React Native's FormData reads {uri, name, type} straight off the device.
    form.append('image', { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
  }
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
