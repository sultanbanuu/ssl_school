import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const baseURL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');
export const auth = createAuthClient({ baseURL, plugins: [expoClient({ scheme: 'ssl-school', storagePrefix: 'ssl-school', storage: SecureStore })] });
export type Profile = { id: string; firstName: string | null; role: 'student' | 'admin' | 'manager' | 'teacher' };
export type Course = { courseId: string; name: string; monthlyPrice: string };
export type Payment = { id: string; studentId: string; courseId: string; courseName: string | null; amount: string; status: 'pending' | 'approved' | 'cancelled'; submittedAt: string | null; startDate: string | null; endDate: string | null; cancellationReason: string | null; receiptAvailable: boolean; availableActions: ('approve' | 'cancel')[] };
export type Upload = { uploadId: string; uploadUrl: string; headers: Record<string, string>; amount: string; courseName: string; submitBefore: string };
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const headers: Record<string, string> = {};
  if (Platform.OS !== 'web') headers.Cookie = await auth.getCookie();
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(`${baseURL}/api${path}`, { method: body === undefined ? 'GET' : method, headers, credentials: Platform.OS === 'web' ? 'include' : 'omit', body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error('The school server could not be reached. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(typeof data.error === 'string' ? data.error : 'Request failed. Please try again.', response.status);
  return data as T;
}
export const money = (amount: string) => `${amount} ${process.env.EXPO_PUBLIC_CURRENCY || 'AZN'}`;
