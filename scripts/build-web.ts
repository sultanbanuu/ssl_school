import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

// Builds the full sslschool.az site:
//   /      -> marketing landing page (landing/)
//   /app/  -> SSL School web app (Expo export), with login and signup
// Expo bundles keep their absolute /_expo/... paths, so they work from /app/.
const out = resolve(process.argv[2] || "dist-web");
const landing = resolve("landing");

rmSync(out, { recursive: true, force: true });
// Expo picks .env files by NODE_ENV; without "production" it bakes in the local API address.
const exported = Bun.spawnSync(["bunx", "expo", "export", "--platform", "web", "--output-dir", out, "--clear"], {
  stdout: "inherit",
  stderr: "inherit",
  // Bun preloads local .env files; drop those values so Expo reads .env.production.local itself.
  env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("EXPO_PUBLIC_"))), NODE_ENV: "production" },
});
if (exported.exitCode !== 0) throw new Error("Expo web export failed");

mkdirSync(resolve(out, "app"), { recursive: true });
renameSync(resolve(out, "index.html"), resolve(out, "app/index.html"));

// Copy file by file so a landing file can never silently replace an exported app file.
for (const entry of readdirSync(landing, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const source = resolve(entry.parentPath, entry.name);
  const target = resolve(out, relative(landing, source));
  if (existsSync(target)) throw new Error(`Landing file ${relative(landing, source)} collides with the app export`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

const bundles = readdirSync(resolve(out, "_expo/static/js/web")).map(name => readFileSync(resolve(out, "_expo/static/js/web", name), "utf8")).join(" ");
const apiURL = process.env.SITE_API_URL || "https://api.sslschool.az";
if (!bundles.includes(apiURL)) throw new Error(`Build blocked: the web app does not point at ${apiURL}. Check EXPO_PUBLIC_API_URL in .env.production.local.`);

const verified = Bun.spawnSync(["bun", "scripts/verify-web-counter.ts", out], { stdout: "inherit", stderr: "inherit" });
if (verified.exitCode !== 0) throw new Error("Web counter verification failed");
console.log(`Site ready in ${out}: landing at /, web app at /app/`);
