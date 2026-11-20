import { Elysia } from "elysia";
import type { AuthHandler } from "./types";

// Better Auth owns validation and handling of the wildcard endpoints.
export function authRoutes(authHandler: AuthHandler) {
  return new Elysia().all("/api/auth/*", ({ request }) => authHandler(request), {
    // Elysia must not read the body first: Better Auth reads the raw request itself.
    parse: "none",
  });
}
