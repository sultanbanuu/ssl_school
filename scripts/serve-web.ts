import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Local preview of the built site (bun run web:build first). Mirrors static
// hosting: /app serves app/index.html, unknown paths fall back to the landing page.
const root = resolve(process.argv[2] || "dist-web");
const port = Number(process.env.PORT || 8090);
Bun.serve({
  port,
  fetch(request) {
    let path = decodeURIComponent(new URL(request.url).pathname);
    let file = join(root, path);
    if (!file.startsWith(root)) return new Response("Not found", { status: 404 });
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) file = join(root, "index.html");
    return new Response(Bun.file(file));
  },
});
console.log(`Serving ${root} on http://localhost:${port}`);
