import MascotLoader from "./MascotLoader";
import { phoneSchema } from "../src/shared/phone";
import React, { lazy, Suspense, useEffect, useState } from "react";
import * as Linking from "expo-linking";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { authClient, getProfile, SessionExpiredError } from "./auth-client";
import {
  birthDateSchema,
  learningTimeOptions,
  learningTimeSchema,
} from "../src/modules/auth/schemas";

const StaffSchoolApp = lazy(() => import("./SchoolApp").then(({ StaffSchoolApp }) => ({ default: StaffSchoolApp })));
const StudentApp = lazy(() => import("./StudentApp").then(({ StudentApp }) => ({ default: StudentApp })));
type Profile = Awaited<ReturnType<typeof getProfile>>;
const authHorizontalPadding = 22;
const authColumnGap = 40;
const authMaxWidth = 1060;
const scoreCardsAspectRatio = 16 / 9;
const OPENING_MIN_MS = 2500;
export default function App() {
  const [mode, setMode] = useState<"signup" | "signin" | "verify" | "forgot" | "reset">("signin");
  const [resetToken, setResetToken] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const link = Linking.useURL();
  const [resendAt, setResendAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [notice, setNotice] = useState(() => Platform.OS === "web" && new URLSearchParams(globalThis.location.search).has("error")
    ? "This verification link is invalid or has expired. Sign in to request a new link."
    : "");
  const verificationCallback = Platform.OS === "web" ? `${globalThis.location.origin}/app/` : "sslschool://";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [surname, setSurname] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthDateTouched, setBirthDateTouched] = useState(false);
  const [learningTime, setLearningTime] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  // Keep the opening mascot loader up for about 2.5 seconds, even when the session check is quick.
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    const elapsed = typeof performance !== "undefined" ? performance.now() : 0;
    const timer = setTimeout(() => setIntroDone(true), Math.max(0, OPENING_MIN_MS - elapsed));
    return () => clearTimeout(timer);
  }, []);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const signup = mode === "signup";
  const recovery = mode === "forgot" || mode === "reset";
  const { width, height } = useWindowDimensions();
  const compact = width < 760;

  useEffect(() => {
    if (resendAt <= Date.now()) { setResendSeconds(0); return; }
    const update = () => setResendSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  useEffect(() => {
    const url = Platform.OS === "web" ? globalThis.location.href : link;
    if (!url) return;
    const params = new URL(url).searchParams;
    if (params.get("flow") !== "reset-password") return;
    const token = params.get("token") || "";
    setResetToken(token);
    setMode(token ? "reset" : "forgot");
    setNotice("");
    setError(params.has("error") || !token ? "This reset link is invalid or has expired. Request a new link below." : "");
    setPassword("");
    setConfirm("");
    if (Platform.OS === "web") globalThis.history.replaceState(null, "", globalThis.location.pathname);
  }, [link]);

  async function submitRecovery() {
    if (busy) return;
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    if (mode === "forgot" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return setError("Enter a valid email address.");
    if (mode === "reset" && (password.length < 12 || password.length > 128)) return setError("Use a password between 12 and 128 characters.");
    if (mode === "reset" && password !== confirm) return setError("Your passwords don't match.");
    setBusy(true);
    try {
      const result = mode === "forgot"
        ? await authClient.requestPasswordReset({ email: cleanEmail, redirectTo: `${verificationCallback}?flow=reset-password` })
        : await authClient.resetPassword({ token: resetToken, newPassword: password });
      if (result.error) {
        setError(result.error.status === 429 ? "Too many attempts. Please wait a minute and try again." : mode === "reset" ? "This reset link is invalid or has expired. Request a new link." : "We couldn't send the reset email. Please try again.");
        return;
      }
      if (mode === "forgot") {
        setResetSent(true);
        setNotice("If an account exists for this email, a password-reset link has been sent. Check your inbox and spam folder. The link expires in one hour.");
      } else {
        setResetToken(""); setPassword(""); setConfirm(""); setProfile(null); setSignedIn(false); setMode("signin");
        setNotice("Your password has been reset. Sign in with your new password.");
      }
    } catch {
      setError("Couldn't connect to SSL School. Please try again.");
    } finally { setBusy(false); }
  }

  function showVerification(cleanEmail: string) {
    setEmail(cleanEmail);
    setMode("verify");
    setPassword("");
    setConfirm("");
    setResendAt(Date.now() + 60000);
  }

  async function resendVerification() {
    if (busy || Date.now() < resendAt) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return setError("Enter your email address first.");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await authClient.sendVerificationEmail({ email: cleanEmail, callbackURL: verificationCallback });
      if (result.error) {
        if (result.error.status === 429) setResendAt(Date.now() + 60000);
        setError(result.error.status === 429 ? "Please wait a minute before requesting another email." : "We couldn't send the verification email. Please try again or contact the school.");
        return;
      }
      showVerification(cleanEmail);
      setNotice("If this account needs verification, a new link has been requested. Check your inbox and spam folder.");
    } catch {
      setError("Couldn't connect to SSL School. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const centerSignIn = !compact && !signup && !signedIn;
  const stickySignupImage = Platform.OS === "web" && signup && !compact && !signedIn;
  const imageColumnWidth = (Math.min(authMaxWidth, width - 2 * authHorizontalPadding) - authColumnGap) / 2;
  const signupImageTop = Math.max(0, (height - imageColumnWidth / scoreCardsAspectRatio) / 2);

  function handleFailure(error: unknown) {
    if (error instanceof SessionExpiredError) {
      setProfile(null);
      setSignedIn(false);
      setMode("signin");
      setError(error.message);
    } else {
      setError(
        error instanceof Error
          ? error.message
          : "Couldn't connect to SSL School. Check your connection and try again.",
      );
    }
  }

  async function restore(clearError = true) {
    setChecking(true);
    if (clearError) setError("");
    try {
      setProfile(await getProfile());
      setSignedIn(true);
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        setProfile(null);
        setSignedIn(false);
      } else {
        setSignedIn(true);
        handleFailure(error);
      }
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    void restore(false);
  }, []);

  async function submit() {
    if (busy) return;
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    setNotice("");
    if (signup && (!name.trim() || name.trim().length > 160))
      return setError("Enter your name (up to 160 characters).");
    if (signup && (!surname.trim() || surname.trim().length > 160))
      return setError("Enter your surname (up to 160 characters).");
    if (signup && !phoneSchema.safeParse(phone).success) return setError("Enter your phone number with country code, e.g. +994501234567.");
    if (signup && !birthDateSchema.safeParse(birthDate).success)
      return setError(
        "Enter a valid birth date in YYYY-MM-DD format that is not in the future.",
      );
    if (signup && !learningTimeSchema.safeParse(learningTime).success)
      return setError("Choose how many hours you can spend learning.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
      return setError("Enter a valid email address.");
    if (password.length < 12 || password.length > 128)
      return setError("Use a password between 12 and 128 characters.");
    if (signup && password !== confirm)
      return setError("Your passwords don't match.");
    setBusy(true);
    try {
      const result = signup
        ? await authClient.signUp.email({
            name: `${name.trim()} ${surname.trim()}`,
            firstName: name.trim(),
            lastName: surname.trim(),
            phone: phoneSchema.parse(phone),
            birthDate,
            learningTime,
            email: cleanEmail,
            password,
            callbackURL: verificationCallback,
          })
        : await authClient.signIn.email({ email: cleanEmail, password, callbackURL: verificationCallback });
      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          showVerification(cleanEmail);
          return;
        }
        setError(
          result.error.status === 429
            ? "Too many attempts. Please wait a moment and try again."
            : result.error.status >= 500
              ? "The school server couldn't process sign-in. Please try again shortly or contact the school."
            : result.error.message || "Unable to sign in. Please try again.",
        );
        return;
      }
      if (signup) {
        showVerification(cleanEmail);
        return;
      }
      setSignedIn(true);
      setPassword("");
      setConfirm("");
      setProfile(await getProfile());
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const { removeDevicePush } = await import("./src/devicePush");
      await removeDevicePush();
      const result = await authClient.signOut();
      if (result.error) throw new Error("Couldn't sign out. Please try again.");
      setProfile(null);
      setSignedIn(false);
      setPassword("");
      setConfirm("");
      setMode("signin");
    } catch {
      setError("Couldn't sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function switchMode() {
    setNotice("");
    setMode(signup ? "signin" : "signup");
    setError("");
    setPassword("");
    setConfirm("");
  }

  // While a sign-in request is in flight, show the full mascot loader instead of a small button spinner.
  const signingIn = busy && mode === "signin" && !signedIn;
  if (checking || !introDone || signingIn || (signedIn && busy && !profile && !error)) return <OpeningSchool />;

  if (signedIn && profile && !recovery) {
    const SchoolApp = profile.role === "student" ? StudentApp : StaffSchoolApp;
    return (
      <Suspense fallback={<OpeningSchool />}>
        <SchoolApp
          key={profile.id}
          profile={profile}
          onSignOut={logout}
          busy={busy}
          error={error}
          onFailure={handleFailure}
        />
      </Suspense>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[s.scroll, centerSignIn && s.centeredScroll]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[s.shell, centerSignIn && s.centeredShell]}>
          <View style={s.brand}>
            <Image
              source={require("./assets/brand/logo.png")}
              style={s.logo}
              accessible={false}
            />
            <Image
              source={require("./assets/brand/tag-brand-name.png")}
              style={s.brandTag}
              resizeMode="contain"
              accessibilityLabel="SSL School"
              accessible
            />
          </View>
          <View style={[s.layout, centerSignIn && s.centeredLayout]}>
            {!compact && (
              <View style={[s.intro, stickySignupImage && s.stickyIntro, stickySignupImage && { top: signupImageTop }]}>
                <Image
                  source={require("./assets/score-cards.png")}
                  style={s.scoreCards}
                  resizeMode="contain"
                  accessible
                  accessibilityLabel="Example scores out of 100: Speaking 95, Vocabulary 98, Listening 100, Sentence structure 97."
                />
              </View>
            )}
            <View
              style={[
                s.card,
                compact && { flexBasis: "auto", width: "100%", padding: 22 },
              ]}
            >
              {signedIn && !recovery ? (
                <>
                  <Text style={s.title}>Unable to open SSL School</Text>
                  {!!error && (
                    <Text accessibilityRole="alert" style={s.error}>
                      {error}
                    </Text>
                  )}
                  <Pressable accessibilityRole="button" disabled={busy} style={s.primary} onPress={() => void restore()}>
                    <Text style={s.primaryText}>Retry loading profile</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={logout}
                    style={s.secondary}
                  >
                    <Text style={s.link}>
                      {busy ? "Signing out…" : "Sign out"}
                    </Text>
                  </Pressable>
                </>
              ) : mode === "verify" ? (
                <>
                  <Text style={s.eyebrow}>VERIFY YOUR EMAIL</Text>
                  <Text accessibilityRole="header" style={s.title}>Check your email.</Text>
                  <Text style={s.subtitle}>We've sent a verification link to</Text>
                  <Text selectable style={[s.link, { marginBottom: 24 }]}>{email}</Text>
                  <Text style={s.subtitle}>Open the link to verify your email, then come back here to sign in. The link expires in one hour.</Text>
                  <Text style={s.hint}>Can't find it? Check your spam or junk folder, or request another email below.</Text>
                  {!!notice && <Text accessibilityRole="alert" style={s.subtitle}>{notice}</Text>}
                  {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
                  <Pressable accessibilityRole="button" disabled={busy} style={s.primary} onPress={() => { setMode("signin"); setNotice(""); setError(""); }}>
                    <Text style={s.primaryText}>Back to sign in →</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={busy || resendSeconds > 0} accessibilityState={{ disabled: busy || resendSeconds > 0 }} style={[s.secondary, (busy || resendSeconds > 0) && { opacity: 0.6 }]} onPress={resendVerification}>
                    <Text style={s.link}>{busy ? "Sending…" : resendSeconds > 0 ? `Resend email in ${resendSeconds}s` : "Resend verification email"}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {signup && <Text style={s.eyebrow}>YOUR LEARNING JOURNEY</Text>}
                  <Text style={s.title}>
                    {signup ? "Start something good." : mode === "forgot" ? "Forgot Password?" : mode === "reset" ? "Reset password" : "Sign in"}
                  </Text>
                  {signup && <Text style={s.subtitle}>Create your student account. We'll take it from here.</Text>}
                  {mode === "forgot" && !resetSent && <Text style={s.subtitle}>Enter your email to receive a password-reset link.</Text>}
                  {!!notice && <Text accessibilityRole="alert" style={s.subtitle}>{notice}</Text>}
                  {signup && (
                    <>
                      <Field
                        label="Name"
                        value={name}
                        onChangeText={setName}
                        placeholder="Your name"
                        autoComplete="given-name"
                        editable={!busy}
                        maxLength={160}
                      />
                      <Field
                        label="Surname"
                        value={surname}
                        onChangeText={setSurname}
                        placeholder="Your surname"
                        autoComplete="family-name"
                        editable={!busy}
                        maxLength={160}
                      />
                      <Field
                        label="Phone number" value={phone} onChangeText={setPhone} placeholder="+994 50 123 45 67" keyboardType="phone-pad" autoComplete="tel" editable={!busy} maxLength={32}
                      />
                      <Field
                        label="Birth date (YYYY-MM-DD)"
                        value={birthDate}
                        onChangeText={setBirthDate}
                        onBlur={() => setBirthDateTouched(true)}
                        placeholder="YYYY-MM-DD"
                        autoCapitalize="none"
                        editable={!busy}
                        maxLength={10}
                      />
                      <View style={{ minHeight: 44 }}>{birthDateTouched && !birthDateSchema.safeParse(birthDate).success && <Text accessibilityRole="alert" style={s.error}>Enter a valid birth date with dashes: YYYY-MM-DD.</Text>}</View>
                      <View
                        accessibilityRole="radiogroup"
                        accessibilityLabel="How many hours can you spend learning?"
                      >
                        <Text style={s.label}>
                          How many hours can you spend learning?
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 8,
                          }}
                        >
                          {learningTimeOptions.map((option) => (
                            <Pressable
                              key={option}
                              accessibilityRole="radio"
                              accessibilityState={{
                                checked: learningTime === option,
                                disabled: busy,
                              }}
                              disabled={busy}
                              onPress={() => setLearningTime(option)}
                              style={[
                                s.input,
                                learningTime === option && {
                                  backgroundColor: "#7064ed",
                                  borderColor: "#7064ed",
                                },
                              ]}
                            >
                              <Text style={{ color: "#f5f5f3" }}>{option}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    </>
                  )}
                  {mode !== "reset" && <Field
                    label="Email address"
                    value={email}
                    onChangeText={(value) => { setEmail(value); setResetSent(false); setNotice(""); }}
                    placeholder="you@example.com"
                    autoComplete="email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!busy}
                  />}
                  {mode !== "forgot" && <View>
                    <View style={s.passwordLabel}>
                      <Text style={s.label}>Password</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          visible ? "Hide password" : "Show password"
                        }
                        onPress={() => setVisible(!visible)}
                      >
                        <Text style={s.link}>{visible ? "Hide" : "Show"}</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      accessibilityLabel="Password"
                      style={s.input}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Enter your password"
                      placeholderTextColor="#929a97"
                      secureTextEntry={!visible}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete={
                        signup || mode === "reset" ? "new-password" : "current-password"
                      }
                      editable={!busy}
                      maxLength={128}
                    />
                    {(signup || mode === "reset") && (
                      <Text style={s.hint}>Use 12–128 characters.</Text>
                    )}
                  </View>}
                  {(signup || mode === "reset") && (
                    <Field
                      label="Confirm password"
                      value={confirm}
                      onChangeText={setConfirm}
                      placeholder="Enter your password again"
                      secureTextEntry={!visible}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      editable={!busy}
                      maxLength={128}
                    />
                  )}
                  {!!error && (
                    <Text accessibilityRole="alert" style={s.error}>
                      {error}
                    </Text>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy || (mode === "forgot" && resetSent) }}
                    disabled={busy || (mode === "forgot" && resetSent)}
                    onPress={recovery ? submitRecovery : submit}
                    style={({ pressed }) => [
                      s.primary,
                      (pressed || busy) && { opacity: 0.75 },
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={s.primaryText}>
                        {signup ? "Create account  →" : mode === "forgot" ? (resetSent ? "Reset link requested" : "Send reset link") : mode === "reset" ? "Reset password" : "Sign in  →"}
                      </Text>
                    )}
                  </Pressable>
                  {(mode === "signin" || mode === "reset") && (
                    <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={() => { setMode("forgot"); setResetSent(false); setPassword(""); setConfirm(""); setError(""); setNotice(""); }}>
                      <Text style={s.link}>{mode === "reset" ? "Request a new reset link" : "Forgot Password?"}</Text>
                    </Pressable>
                  )}
                  <View style={s.divider} />
                  {recovery ? <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={() => { setMode("signin"); setResetToken(""); setPassword(""); setConfirm(""); setError(""); setNotice(""); }}><Text style={s.link}>Back to sign in</Text></Pressable> : <View style={s.switchRow}>
                    <Text style={s.switchText}>
                      {signup
                        ? "Already learning with us?"
                        : "New to SSL School?"}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={switchMode}
                    >
                      <Text style={s.link}>
                        {signup ? "Sign in" : "Create an account"}
                      </Text>
                    </Pressable>
                  </View>}
                </>
              )}
            </View>
          </View>
          {signup && (
            <Text style={s.footer}>
              SSL School / A new way to find your voice.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
function OpeningSchool() {
  return (
    <View style={[s.page, s.loading]}>
      <StatusBar barStyle="light-content" />
      <MascotLoader size="large" label="Loading" accessibilityLabel="Opening SSL School" />
    </View>
  );
}

function Field({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        placeholderTextColor="#929a97"
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#272727" },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: authHorizontalPadding,
    paddingTop: 56,
    paddingBottom: 24,
  },
  centeredScroll: { paddingTop: 32, paddingBottom: 112 },
  shell: { width: "100%", maxWidth: authMaxWidth, alignSelf: "center" },
  centeredShell: { flexGrow: 1 },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 42,
  },
  logo: { width: 104, height: 104 },
  brandTag: { width: 128, height: 27, tintColor: "#f5f5f3" },
  layout: {
    flexDirection: "row",
    gap: authColumnGap,
    alignItems: "flex-start",
  },
  centeredLayout: { marginVertical: "auto" },
  intro: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 340,
    aspectRatio: scoreCardsAspectRatio,
    alignSelf: "center",
  },
  stickyIntro: { position: "sticky" as ViewStyle["position"], alignSelf: "flex-start" },
  scoreCards: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
    transform: [{ scale: 1.08 }],
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.6,
    color: "#b5b5b5",
    fontWeight: "700",
    marginBottom: 20,
  },
  card: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 340,
    backgroundColor: "#272727",
    padding: 28,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#3d3d3d",
    gap: 18,
    maxWidth: 510,
  },
  title: {
    fontSize: 28,
    letterSpacing: -0.8,
    lineHeight: 35,
    fontWeight: "600",
    color: "#f5f5f3",
  },
  subtitle: { fontSize: 14, lineHeight: 22, color: "#b5b5b5" },
  label: { fontSize: 12, color: "#f5f5f3", fontWeight: "600", marginBottom: 8 },
  input: {
    backgroundColor: "#272727",
    borderWidth: 1,
    borderColor: "#3d3d3d",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: "#f5f5f3",
    minHeight: 49,
  },
  passwordLabel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hint: { fontSize: 11, lineHeight: 18, color: "#b5b5b5", marginTop: 6 },
  primary: {
    backgroundColor: "#7064ed",
    borderRadius: 11,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
  },
  primaryText: { fontSize: 14, fontWeight: "600", color: "#f5f5f3" },
  link: {
    fontSize: 12,
    fontWeight: "600",
    color: "#f5f5f3",
    paddingVertical: 5,
  },
  error: {
    backgroundColor: "#272727",
    color: "#ff9b90",
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 20,
  },
  divider: { height: 1, backgroundColor: "#272727", marginTop: 5 },
  switchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  switchText: { fontSize: 12, color: "#b5b5b5" },
  footer: {
    textAlign: "center",
    color: "#b5b5b5",
    fontSize: 11,
    marginTop: 32,
  },
  loading: { justifyContent: "center", alignItems: "center", gap: 16 },
  secondary: { alignItems: "center", padding: 12 },
});
