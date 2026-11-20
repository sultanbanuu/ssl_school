import * as webPush from "web-push";
import { z } from "zod";

// Only browser push providers are accepted: never send server requests to arbitrary URLs.
export const webSubscription = z.strictObject({
  endpoint: z.string().max(1200).url().refine(value => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "fcm.googleapis.com" ||
        // Chrome now issues FCM endpoints on regional hosts such as jmt17.google.com/fcm/send/...
        (/^[a-z0-9-]+\.google\.com$/.test(url.hostname) && url.pathname.startsWith("/fcm/")) ||
        url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname === "web.push.apple.com" || url.hostname.endsWith(".push.apple.com") ||
        url.hostname === "wns.windows.com" || url.hostname.endsWith(".wns.windows.com") ||
        url.hostname === "notify.windows.com" || url.hostname.endsWith(".notify.windows.com"));
  }, "Unsupported browser push provider"),
  keys: z.strictObject({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}(==)?$/),
  }),
});
export function webPushConfig() {
  const { WEB_PUSH_PUBLIC_KEY: publicKey, WEB_PUSH_PRIVATE_KEY: privateKey, WEB_PUSH_SUBJECT: subject } = process.env;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}
export async function sendWebPush(token: string, payload: string) {
  const vapidDetails = webPushConfig();
  if (!vapidDetails) throw new Error("Web push is not configured");
  const subscription = webSubscription.parse(JSON.parse(token.slice(4)));
  await webPush.sendNotification(subscription, payload, { vapidDetails, timeout: 15000, TTL: 3600 });
}
