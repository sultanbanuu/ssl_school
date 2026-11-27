import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Run against the exact export being uploaded, including release-copy exports.
const root = resolve(process.argv[2] || "tmp/lesson-counter-web");
// The site build moves the app page to /app/; plain Expo exports keep it at the root.
const appHtml = existsSync(resolve(root, "app/index.html")) ? "app/index.html" : "index.html";
const html = readFileSync(resolve(root, appHtml), "utf8");
const bundlePath = html.match(/src="\/(\_expo\/static\/js\/web\/index-[^"]+\.js)"/)?.[1];
if (!bundlePath) throw new Error("Cannot find the exported application bundle");
// Expo can split StudentApp into a lazily loaded chunk. Validate every exported
// web chunk rather than assuming all screens live in the entry bundle.
const bundle = readdirSync(resolve(root, "_expo/static/js/web"))
  .filter(name => name.endsWith(".js"))
  .map(name => readFileSync(resolve(root, "_expo/static/js/web", name), "utf8"))
  .join("\n");
if (bundle.includes("days until payment is due") || bundle.includes("Payment due date unavailable")) {
  throw new Error("Deployment blocked: this export contains the obsolete payment-day counter. Rebuild from the updated source.");
}
if (!bundle.includes("Lesson count unavailable") || !bundle.includes('"LESSONS"')) {
  throw new Error("Deployment blocked: remaining lesson counter is missing");
}
console.log("Verified remaining lesson counter in", bundlePath);
