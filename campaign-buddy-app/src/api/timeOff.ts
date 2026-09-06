// Spec §7 — Time Off
import { apiClient } from './client';
import type { TimeOffBalance, TimeOffRequest, TimeOffReason } from './types';

export async function getTimeOffBalance(): Promise<TimeOffBalance> {
  const { data } = await apiClient.get<{ data: TimeOffBalance }>('/time-off/balance');
  return data.data;
}

export async function getTimeOffRequests(): Promise<TimeOffRequest[]> {
  const { data } = await apiClient.get<{ data: TimeOffRequest[] }>('/time-off/requests');
  return data.data;
}

export interface CreateTimeOffRequest {
  fromDate: string; // ISODate
  toDate: string;
  reason: TimeOffReason;
  note?: string;
}

export async function createTimeOffRequest(payload: CreateTimeOffRequest): Promise<TimeOffRequest> {
  const { data } = await apiClient.post<{ data: TimeOffRequest }>('/time-off/requests', payload);
  return data.data;
}
