import { api } from "./api";

let pending: Promise<unknown> = Promise.resolve();
let generation = 0;
const storageKey = "school-web-push-token";
const disabledKey = "school-web-push-disabled";
const changed = () => window.dispatchEvent(new Event("school-push-settings"));
export async function browserPushEnabled(): Promise<boolean> {
  if (!supported() || Notification.permission !== "granted" || localStorage.getItem(disabledKey) === "true" || !localStorage.getItem(storageKey)) return false;
  const registration = await navigator.serviceWorker.getRegistration("/school-push-sw.js");
  return Boolean(await registration?.pushManager.getSubscription());
}
export async function disableBrowserPush(): Promise<string> {
  localStorage.setItem(disabledKey, "true");
  try { await removeDevicePush(); }
  catch (error) { localStorage.removeItem(disabledKey); changed(); throw error; }
  localStorage.setItem(disabledKey, "true");
  changed();
  return "Browser notifications are off. Your updates are still available in the inbox.";
}
const supported = () => typeof window !== "undefined" && window.isSecureContext &&
  "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;

export async function testBrowserNotification(userId: string): Promise<string> {
  if (!supported()) return "Desktop notifications require HTTPS or localhost and a supported browser.";
  if (Notification.permission !== "granted") return "Enable browser notifications first, then send a test.";
  const registration = await navigator.serviceWorker.getRegistration("/school-push-sw.js");
  if (!registration?.active) return "Enable browser notifications first, then send a test.";
  await registration.showNotification("SSL School test notification", {
    body: "Desktop notifications are working. Click here to open your school inbox.",
    tag: "school-desktop-test",
    data: { userId },
  });
  return "Test notification sent to your desktop. If it does not appear, check browser and operating-system notification settings. This checks desktop display; an admin announcement tests server delivery.";
}

export function enableDevicePush(prompt = true): Promise<string> {
  if (!supported()) return Promise.resolve("Browser push needs HTTPS or localhost and a supported browser. On iPhone or iPad, add this website to your Home Screen first.");
  if (!prompt && localStorage.getItem(disabledKey) === "true") return Promise.resolve("");
  // Request permission inside the button gesture, before any network awaits.
  const permission = prompt && Notification.permission === "default"
    ? Notification.requestPermission() : Promise.resolve(Notification.permission);
  const ticket = generation;
  const operation = pending.catch(() => {}).then(async () => {
    const granted = await permission;
    if (ticket !== generation) return "";
    if (granted !== "granted") return granted === "denied"
      ? "Notifications are blocked. Allow them in your browser’s site settings, then try again."
      : "Notifications were not enabled. You can try again whenever you’re ready.";
    const { publicKey } = await api<{ publicKey: string | null }>("/notifications/push-config");
    if (!publicKey) return "Browser push is not configured on the server yet. Your updates are still available here.";
    await navigator.serviceWorker.register("/school-push-sw.js");
    const registration = await navigator.serviceWorker.ready;
    const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    let subscription = await registration.pushManager.getSubscription();
    if (subscription?.options.applicationServerKey &&
      String(new Uint8Array(subscription.options.applicationServerKey)) !== String(bytes)) {
      const old = localStorage.getItem(storageKey);
      if (old) await api("/notifications/devices", { token: old }, "DELETE");
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    if (ticket !== generation) return "";
    const json = subscription.toJSON();
    const token = `web:${JSON.stringify({ endpoint: subscription.endpoint, keys: json.keys })}`;
    const previous = localStorage.getItem(storageKey);
    if (previous && previous !== token) await api("/notifications/devices", { token: previous }, "DELETE");
    await api("/notifications/devices", { token });
    localStorage.setItem(storageKey, token);
    localStorage.removeItem(disabledKey);
    changed();
    return "Browser notifications are enabled. School updates can arrive even when this tab is closed.";
  });
  pending = operation;
  return operation;
}

export async function removeDevicePush(): Promise<void> {
  generation++;
  await pending.catch(() => {});
  if (typeof window === "undefined") return;
  const token = localStorage.getItem(storageKey);
  if (token) await api("/notifications/devices", { token }, "DELETE");
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration("/school-push-sw.js");
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
    for (const notification of await registration?.getNotifications() ?? []) notification.close();
  }
  localStorage.removeItem(storageKey);
  changed();
}

export function listenForPush(userId: string, open: () => void): () => void {
  if (!supported()) return () => {};
  const url = new URL(window.location.href);
  if (url.searchParams.get("pushUser") === userId) {
    url.searchParams.delete("pushUser");
    window.history.replaceState(null, "", url);
    open();
  }
  const handle = (event: MessageEvent) => {
    if (event.data?.userId !== userId) return;
    if (event.data.type === "school-push-open") open();
    if (event.data.type === "school-push-received") window.dispatchEvent(new Event("school-push-received"));
  };
  navigator.serviceWorker.addEventListener("message", handle);
  return () => navigator.serviceWorker.removeEventListener("message", handle);
}
