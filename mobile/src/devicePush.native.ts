import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api";

const key = "school-push-token";
let pending: Promise<unknown> = Promise.resolve();
let generation = 0;
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });

export function enableDevicePush(prompt = true): Promise<string> {
  const ticket = generation;
  const operation = pending.catch(() => {}).then(async () => {
    if (ticket !== generation) return "";
    if (!Device.isDevice || Constants.appOwnership === "expo") return "Push notifications need an installed development or production app on a physical device.";
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    if (!projectId) return "Device notifications are not configured yet. Your school updates are still available in this inbox.";
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("school-updates", { name: "School updates", importance: Notifications.AndroidImportance.HIGH });
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && prompt && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      const token = await SecureStore.getItemAsync(key);
      if (token) { await api("/notifications/devices", { token }, "DELETE"); await SecureStore.deleteItemAsync(key); }
      return "Allow notifications in your device settings to receive school updates when the app is closed.";
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (ticket !== generation) return "";
    const previous = await SecureStore.getItemAsync(key);
    if (previous && previous !== token) await api("/notifications/devices", { token: previous }, "DELETE");
    await SecureStore.setItemAsync(key, token);
    await api("/notifications/devices", { token });
    return "Device notifications are enabled.";
  });
  pending = operation;
  return operation;
}

export async function removeDevicePush() {
  generation++;
  await pending.catch(() => {});
  const token = await SecureStore.getItemAsync(key);
  if (token) {
    // Finish while the session is authenticated; a failed removal keeps sign-out retryable.
    await api("/notifications/devices", { token }, "DELETE");
    await SecureStore.deleteItemAsync(key);
  }
}

export function listenForPush(userId: string, open: () => void) {
  let active = true;
  const seen = new Set<string>();
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!active || !response) return;
    const request = response.notification.request;
    if (request.content.data?.userId !== userId || seen.has(request.identifier)) return;
    seen.add(request.identifier);
    open();
    void Notifications.clearLastNotificationResponseAsync();
  };
  const listener = Notifications.addNotificationResponseReceivedListener(handle);
  const tokenListener = Notifications.addPushTokenListener(() => { void enableDevicePush(false).catch(() => {}); });
  void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
  return () => { active = false; listener.remove(); tokenListener.remove(); };
}
