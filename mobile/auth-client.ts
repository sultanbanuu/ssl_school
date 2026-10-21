import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const apiURL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:3000";
export const authClient = createAuthClient({
  baseURL: apiURL,
  plugins: [expoClient({ scheme: "sslschool", storagePrefix: "ssl-school", storage: SecureStore })],
});
export class SessionExpiredError extends Error {}

export async function getProfile() {
  const headers: Record<string, string> = {};
  if (Platform.OS !== "web") headers.Cookie = await authClient.getCookie() || "";
  const response = await fetch(`${apiURL}/api/me`, { headers, credentials: "include" });
  if (response.status === 401) throw new SessionExpiredError("Your session has expired. Please sign in again.");
  if (!response.ok) throw new Error("We couldn't load your profile. Please try again.");
  return response.json() as Promise<{ id: string; firstName: string | null; role: "student" | "teacher" | "manager" | "admin" }>;
}

export async function schoolRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (Platform.OS !== "web") headers.Cookie = await authClient.getCookie() || "";
  const response = await fetch(`${apiURL}/api${path}`, { method, headers, credentials: "include", body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 401) throw new SessionExpiredError("Your session has expired. Please sign in again.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to load school data. Please try again.");
  return result as T;
}
