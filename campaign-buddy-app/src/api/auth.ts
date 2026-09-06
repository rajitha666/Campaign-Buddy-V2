// Spec §3 — Auth
import { apiClient } from './client';
import type { User } from './types';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await apiClient.post<{ data: LoginResponse }>('/auth/login', {
    username,
    password,
  });
  return data.data;
}

export async function forgotPassword(username: string): Promise<void> {
  await apiClient.post('/auth/forgot-password', { username });
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<Pick<LoginResponse, 'accessToken' | 'expiresIn'>> {
  const { data } = await apiClient.post<{ data: Pick<LoginResponse, 'accessToken' | 'expiresIn'> }>(
    '/auth/refresh',
    { refreshToken }
  );
  return data.data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}
