import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { createAuth } from "../src/modules/auth/service";
import type { Profile } from "./src/api";

// Use the development computer's address when the preview opens on a phone.
function getDevelopmentHost() {
  if (!__DEV__) return "localhost";
  if (Platform.OS === "web") return globalThis.location?.hostname || "localhost";
  const hostUri = Constants.expoConfig?.hostUri;
  return hostUri ? new URL(`http://${hostUri}`).hostname : "localhost";
}
const configuredApiURL = process.env.EXPO_PUBLIC_API_URL?.trim();
export const apiURL = configuredApiURL && configuredApiURL !== "local"
  ? configuredApiURL.replace(/\/$/, "")
  : `http://${getDevelopmentHost()}:3000`;
export const authClient = createAuthClient({
  baseURL: apiURL,
  plugins: [
    inferAdditionalFields<ReturnType<typeof createAuth>>(),
    expoClient({
      scheme: "sslschool",
      storagePrefix: "ssl-school",
      storage: SecureStore,
    }),
  ],
});
export class SessionExpiredError extends Error {}

export async function getProfile(): Promise<Profile> {
  const profile = await schoolRequest<Profile | null>("/me");
  if (!profile) throw new Error("We couldn't load your profile. Please try again.");
  return profile;
}

export async function schoolRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (Platform.OS !== "web")
    headers.Cookie = (await authClient.getCookie()) || "";
  const controller = new AbortController();
  const timeout = method === "GET" ? setTimeout(() => controller.abort(), 15000) : undefined;
  try {
    const response = await fetch(`${apiURL}/api${path}`, {
      method,
      headers,
      credentials: Platform.OS === "web" ? "include" : "omit",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.status === 401)
      throw new SessionExpiredError("Your session has expired. Please sign in again.");
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error || "Unable to load school data. Please try again.");
    }
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("The school server took too long to respond. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
