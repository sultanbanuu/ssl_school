import type { Config } from "../../config";

export async function sendVerificationEmail(config: Config, email: string, url: string, send: typeof fetch = fetch) {
  return sendAuthEmail(config, email, "Verify your SSL School email", `Welcome to SSL School!\n\nVerify your email using this link:\n${url}\n\nThis link expires in one hour. After verification, return to SSL School and sign in. If you didn't request this email, you can ignore it.`, send);
}

export async function sendPasswordResetEmail(config: Config, email: string, url: string, send: typeof fetch = fetch) {
  return sendAuthEmail(config, email, "Reset your SSL School password", `Reset your password using this link:\n${url}\n\nThis link expires in one hour and can only be used once. If you didn't request a password reset, ignore this email. Your password will stay unchanged.`, send);
}

async function sendAuthEmail(config: Config, email: string, subject: string, text: string, send: typeof fetch) {
  if (!config.RESEND_API_KEY || !config.EMAIL_FROM) {
    throw new Error("Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
  }
  const response = await send("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.EMAIL_FROM,
      to: [email],
      subject,
      text,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    // Keep credentials, recipient addresses and verification tokens out of logs.
    const hint = response.status === 403
      ? "Check EMAIL_FROM uses a verified domain and the API key has sending permission."
      : response.status === 401
        ? "Check RESEND_API_KEY."
        : response.status === 429
          ? "Resend rate or account quota limit reached."
          : "Check Resend request logs for the rejection reason.";
    console.error(`Authentication email delivery failed (Resend HTTP ${response.status}). ${hint}`);
    throw new Error("Unable to deliver email. Please try again later.");
  }
}
