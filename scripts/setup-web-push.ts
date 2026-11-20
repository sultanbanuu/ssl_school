import * as webPush from "web-push";
import { readFile, appendFile } from "node:fs/promises";

// Generate once; never print the private key or overwrite existing settings.
const path = new URL("../.env", import.meta.url);
const env = await readFile(path, "utf8").catch(() => "");
if (/^WEB_PUSH_(PUBLIC_KEY|PRIVATE_KEY|SUBJECT)=/m.test(env)) {
  console.log("Web push settings already exist in .env; left unchanged.");
} else {
  const keys = webPush.generateVAPIDKeys();
  const subject = process.argv[2] ?? "mailto:push@ssl-school.local";
  if (!/^(mailto:[^\s]+@[^\s]+|https:\/\/[^\s]+)$/.test(subject)) throw new Error("Use a mailto: contact or HTTPS URL as the subject.");
  await appendFile(path, `\n# Browser push: keep the private key server-only.\nWEB_PUSH_PUBLIC_KEY=${keys.publicKey}\nWEB_PUSH_PRIVATE_KEY=${keys.privateKey}\nWEB_PUSH_SUBJECT=${subject}\n`);
  console.log("Saved web push keys to .env. Restart the API. Use a real contact subject before production deployment.");
}
