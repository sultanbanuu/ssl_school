import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { authClient, getProfile, SessionExpiredError } from "./auth-client";
import { Lessons } from "./Lessons";

type Profile = Awaited<ReturnType<typeof getProfile>>;
export default function App() {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const signup = mode === "signup";
  const compact = useWindowDimensions().width < 760;

  function handleFailure(error: unknown) {
    if (error instanceof SessionExpiredError) {
      setProfile(null); setSignedIn(false); setMode("signin");
      setError(error.message);
    } else {
      setError(error instanceof Error ? error.message : "Couldn't connect to SSL School. Check your connection and try again.");
    }
  }

  async function restore() {
    setChecking(true); setError("");
    try {
      const result = await authClient.getSession();
      if (result.error) throw new Error("We couldn't check your session. Please try again.");
      setSignedIn(!!result.data);
      if (result.data) setProfile(await getProfile());
      else setProfile(null);
    } catch (error) { handleFailure(error); }
    finally { setChecking(false); }
  }
  useEffect(() => { void restore(); }, []);

  async function submit() {
    if (busy) return;
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    if (signup && (!name.trim() || name.trim().length > 160)) return setError("Enter your name (up to 160 characters).");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return setError("Enter a valid email address.");
    if (password.length < 12 || password.length > 128) return setError("Use a password between 12 and 128 characters.");
    if (signup && password !== confirm) return setError("Your passwords don't match.");
    setBusy(true);
    try {
      const result = signup
        ? await authClient.signUp.email({ name: name.trim(), email: cleanEmail, password })
        : await authClient.signIn.email({ email: cleanEmail, password });
      if (result.error) {
        setError(result.error.status === 429 ? "Too many attempts. Please wait a moment and try again." : result.error.message || "Unable to sign in. Please try again.");
        return;
      }
      setSignedIn(true); setPassword(""); setConfirm("");
      setProfile(await getProfile());
    } catch (error) { handleFailure(error); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Couldn't sign out. Please try again.");
      setProfile(null); setSignedIn(false); setPassword(""); setConfirm(""); setMode("signin");
    } catch { setError("Couldn't sign out. Please try again."); }
    finally { setBusy(false); }
  }
  function switchMode() { setMode(signup ? "signin" : "signup"); setError(""); setPassword(""); setConfirm(""); }

  return <KeyboardAvoidingView style={s.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <StatusBar barStyle="dark-content" />
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.shell}>
        <View style={s.brand}><View style={s.logo}><Text style={s.logoText}>s.</Text></View><Text style={s.brandName}>ssl school<Text style={s.brandDot}>.</Text></Text><Text style={s.brandTag}>ENGLISH, EVERY DAY</Text></View>
        <View style={s.layout}>
          {!compact && <View style={s.intro}>
            <Text style={s.eyebrow}>A LITTLE PRACTICE. A WORLD OF POSSIBILITY.</Text>
            <Text style={s.hero}>Your next{`\n`}chapter starts{`\n`}with <Text style={s.heroAccent}>hello.</Text></Text>
            <Text style={s.introCopy}>Build your confidence, find your voice, and make English part of your everyday life.</Text>
            <View style={s.note}><Text style={s.noteIcon}>✦</Text><View style={{ flex: 1 }}><Text style={s.noteTitle}>Small steps. Real progress.</Text><Text style={s.noteCopy}>Your learning journey, at your pace.</Text></View></View>
            <Text style={s.introFooter}>LEARN · PRACTICE · GROW</Text>
          </View>}
          <View style={[s.card, compact && { flexBasis: "auto", width: "100%", padding: 22 }]}>
            {checking ? <View style={s.loading}><ActivityIndicator color="#245e50" /><Text style={s.subtitle}>Getting things ready…</Text></View>
            : signedIn ? <>
              <Text style={s.eyebrow}>YOU'RE IN</Text>
              <Text style={s.title}>Hello{profile?.firstName ? `, ${profile.firstName}` : ""}.</Text>
              <Text style={s.subtitle}>{profile ? "Your SSL School account is ready." : "You're signed in. Let's load your profile."}</Text>
              {profile && <Lessons key={profile.id} role={profile.role} onFailure={handleFailure} />}
              {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
              {!profile && <Pressable style={s.primary} onPress={restore}><Text style={s.primaryText}>Retry loading profile</Text></Pressable>}
              <Pressable accessibilityRole="button" disabled={busy} onPress={logout} style={s.secondary}><Text style={s.link}>{busy ? "Signing out…" : "Sign out"}</Text></Pressable>
            </> : <>
              <Text style={s.eyebrow}>YOUR LEARNING JOURNEY</Text>
              <Text style={s.title}>{signup ? "Start something good." : "Welcome back."}</Text>
              <Text style={s.subtitle}>{signup ? "Create your student account. We'll take it from here." : "Sign in and take your next step."}</Text>
              {signup && <Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" editable={!busy} />}
              <Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" autoComplete="email" keyboardType="email-address" autoCapitalize="none" editable={!busy} />
              <View><View style={s.passwordLabel}><Text style={s.label}>Password</Text><Pressable accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"} onPress={() => setVisible(!visible)}><Text style={s.link}>{visible ? "Hide" : "Show"}</Text></Pressable></View><TextInput accessibilityLabel="Password" style={s.input} value={password} onChangeText={setPassword} placeholder="Enter your password" placeholderTextColor="#929a97" secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete={signup ? "new-password" : "current-password"} editable={!busy} maxLength={128} />{signup && <Text style={s.hint}>Use 12–128 characters.</Text>}</View>
              {signup && <Field label="Confirm password" value={confirm} onChangeText={setConfirm} placeholder="Enter your password again" secureTextEntry={!visible} autoComplete="new-password" autoCapitalize="none" editable={!busy} maxLength={128} />}
              {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={submit} style={({ pressed }) => [s.primary, (pressed || busy) && { opacity: 0.75 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>{signup ? "Create account  →" : "Sign in  →"}</Text>}</Pressable>
              {!signup && <Text style={s.hint}>Forgot your password? Contact your school administrator.</Text>}
              <View style={s.divider} /><View style={s.switchRow}><Text style={s.switchText}>{signup ? "Already learning with us?" : "New to SSL School?"}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={switchMode}><Text style={s.link}>{signup ? "Sign in" : "Create an account"}</Text></Pressable></View>
            </>}
          </View>
        </View>
        <Text style={s.footer}>SSL School  /  A new way to find your voice.</Text>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <View><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} style={s.input} placeholderTextColor="#929a97" autoCorrect={false} {...props} /></View>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f6f5ef" }, scroll: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 56, paddingBottom: 24 }, shell: { width: "100%", maxWidth: 1120, alignSelf: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 42 }, logo: { backgroundColor: "#245e50", width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, logoText: { color: "#fff", fontSize: 28, fontWeight: "700" }, brandName: { fontSize: 24, fontWeight: "700", color: "#1e3931" }, brandDot: { color: "#c47747" }, brandTag: { fontSize: 9, letterSpacing: 2, color: "#73817a", marginLeft: 10 },
  layout: { flexDirection: "row", flexWrap: "wrap", gap: 40, alignItems: "center" }, intro: { flexGrow: 1, flexBasis: 340, paddingVertical: 14 }, eyebrow: { fontSize: 10, letterSpacing: 1.6, color: "#637c70", fontWeight: "700", marginBottom: 20 }, hero: { fontSize: 52, lineHeight: 57, fontWeight: "600", letterSpacing: -2, color: "#203d33" }, heroAccent: { color: "#bb7046", fontStyle: "italic" }, introCopy: { fontSize: 16, lineHeight: 26, color: "#64746b", maxWidth: 365, marginTop: 24 }, note: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 32, backgroundColor: "#e9eee4", padding: 19, borderRadius: 16, maxWidth: 370 }, noteIcon: { fontSize: 28, color: "#58784e" }, noteTitle: { fontSize: 14, fontWeight: "600", color: "#2c4c3d" }, noteCopy: { fontSize: 12, color: "#6c7c6d", marginTop: 5 }, introFooter: { fontSize: 9, letterSpacing: 3, color: "#8b968c", marginTop: 34 },
  card: { flexGrow: 1, flexBasis: 360, backgroundColor: "#fff", padding: 28, borderRadius: 24, borderWidth: 1, borderColor: "#e6e9e0", gap: 18, maxWidth: 510 }, title: { fontSize: 28, letterSpacing: -0.8, lineHeight: 35, fontWeight: "600", color: "#203d33" }, subtitle: { fontSize: 14, lineHeight: 22, color: "#748077" }, label: { fontSize: 12, color: "#374c40", fontWeight: "600", marginBottom: 8 }, input: { backgroundColor: "#fcfcfa", borderWidth: 1, borderColor: "#dce2d9", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: "#203d33", minHeight: 49 }, passwordLabel: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, hint: { fontSize: 11, lineHeight: 18, color: "#7c877e", marginTop: 6 }, primary: { backgroundColor: "#245e50", borderRadius: 11, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 5 }, primaryText: { fontSize: 14, fontWeight: "600", color: "#fff" }, link: { fontSize: 12, fontWeight: "600", color: "#245e50", paddingVertical: 5 }, error: { backgroundColor: "#fff1eb", color: "#a03d2b", padding: 12, borderRadius: 8, fontSize: 13, lineHeight: 20 }, divider: { height: 1, backgroundColor: "#eef0e9", marginTop: 5 }, switchRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 6 }, switchText: { fontSize: 12, color: "#7c877e" }, footer: { textAlign: "center", color: "#929b91", fontSize: 11, marginTop: 32 }, loading: { paddingVertical: 70, alignItems: "center", gap: 16 }, account: { backgroundColor: "#f0f4ed", padding: 20, borderRadius: 12 }, accountRole: { fontSize: 22, color: "#245e50", fontWeight: "600" }, secondary: { alignItems: "center", padding: 12 },
});
