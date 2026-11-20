import React, { useEffect, useState } from "react";
import { Platform, Pressable, Switch, Text, View } from "react-native";
import { browserPushEnabled, disableBrowserPush, enableDevicePush, testBrowserNotification } from "./devicePush";

export function BrowserNotificationSettings({ userId, promptOnly = false }: { userId: string; promptOnly?: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let active = true;
    const refresh = () => { void browserPushEnabled().then(value => { if (active) setEnabled(value); }).catch(() => { if (active) setEnabled(false); }); };
    refresh();
    window.addEventListener("school-push-settings", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => { active = false; window.removeEventListener("school-push-settings", refresh); window.removeEventListener("focus", refresh); window.removeEventListener("storage", refresh); };
  }, [userId]);
  if (Platform.OS !== "web" || (promptOnly && enabled !== false)) return null;
  const change = async (value: boolean) => {
    setBusy(true);
    try {
      setStatus(await (value ? enableDevicePush() : disableBrowserPush()));
      setEnabled(await browserPushEnabled());
    } catch (error) { setStatus(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return <View style={{ backgroundColor: "#272727", borderRadius: 16, padding: 18, marginBottom: 12, gap: 12 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#f5f5f3", fontSize: 17, fontWeight: "700" }}>Browser notifications</Text>
      </View>
      {!promptOnly && <Switch accessibilityLabel="Browser notifications" value={enabled === true} disabled={busy || enabled === null} onValueChange={value => void change(value)} trackColor={{ false: "#666", true: "#a49dff" }} />}
    </View>
    {promptOnly && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void change(true)}><Text style={{ color: "#c2baff", fontSize: 16, fontWeight: "700" }}>{busy ? "Enabling notifications…" : "Enable browser notifications"}</Text></Pressable>}
    {!promptOnly && enabled && <Pressable accessibilityRole="button" disabled={busy} onPress={async () => { try { setStatus(await testBrowserNotification(userId)); } catch (error) { setStatus(error instanceof Error ? error.message : "Please try again."); } }}><Text style={{ color: "#c2baff", fontSize: 16 }}>Send test desktop notification</Text></Pressable>}
    {!!status && <Text accessibilityRole="alert" style={{ color: "#b5b5b5", fontSize: 14 }}>{status}</Text>}
  </View>;
}
