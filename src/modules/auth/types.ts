import type { Actor } from "../../shared/authorization";

export type GetSession = (
  headers: Headers,
) => Promise<{ user: { id: string } } | null>;

export type AuthHandler = (request: Request) => Promise<Response>;
export type ActorFor = (request: Request) => Promise<Actor>;
