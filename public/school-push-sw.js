self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (!payload?.title || !payload.userId) return;
    await self.registration.showNotification(payload.title, {
      body: payload.body, tag: payload.notificationId, data: { userId: payload.userId },
    });
    for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
      client.postMessage({ type: "school-push-received", userId: payload.userId });
    }
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const userId = event.notification.data?.userId;
    for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin !== self.location.origin || !clientUrl.pathname.startsWith("/app")) continue;
      await client.focus();
      client.postMessage({ type: "school-push-open", userId });
      return;
    }
    await self.clients.openWindow(`/app/?pushUser=${encodeURIComponent(userId)}`);
  })());
});
