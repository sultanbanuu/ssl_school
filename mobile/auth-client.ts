import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { createAuth } from "../src/auth";

// On a physical phone localhost is the phone, not the development computer.
const developmentHost = __DEV__ && Platform.OS !== "web" && Constants.expoConfig?.hostUri
  ? new URL(`http://${Constants.expoConfig.hostUri}`).hostname
  : "localhost";
export const apiURL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || `http://${developmentHost}:3000`;
export const authClient = createAuthClient({
  baseURL: apiURL,
  plugins: [inferAdditionalFields<ReturnType<typeof createAuth>>(), expoClient({ scheme: "sslschool", storagePrefix: "ssl-school", storage: SecureStore })],
});
export class SessionExpiredError extends Error {}

export async function getProfile() {
  const headers: Record<string, string> = {};
  if (Platform.OS !== "web") headers.Cookie = await authClient.getCookie() || "";
  const response = await fetch(`${apiURL}/api/me`, { headers, credentials: Platform.OS === "web" ? "include" : "omit" });
  if (response.status === 401) throw new SessionExpiredError("Your session has expired. Please sign in again.");
  if (!response.ok) throw new Error("We couldn't load your profile. Please try again.");
  return response.json() as Promise<{ id: string; firstName: string | null; role: "student" | "teacher" | "manager" | "admin" }>;
}

export async function schoolRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (Platform.OS !== "web") headers.Cookie = await authClient.getCookie() || "";
  const response = await fetch(`${apiURL}/api${path}`, { method, headers, credentials: Platform.OS === "web" ? "include" : "omit", body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 401) throw new SessionExpiredError("Your session has expired. Please sign in again.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to load school data. Please try again.");
  return result as T;
}
