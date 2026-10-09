export type Role = "anonymous" | "user" | "admin";

export interface AppUser {
  id: string;
  name: string;
  role: Exclude<Role, "anonymous">;
}

export interface ResolvedSession {
  user: AppUser | null;
  headers?: Headers;
}

export interface AppDeps {
  /** Public origin of the site, e.g. https://games.lememcon.com. */
  baseUrl: string;
  /** Directory holding the built SPA (Vite's dist/). */
  staticDir: string;
  /**
   * Resolves the signed-in user from the request headers (null if anonymous).
   * `headers` carries any refreshed session Set-Cookie to forward.
   */
  resolveSession: (headers: Headers) => Promise<ResolvedSession>;
  /** Better Auth's request handler, mounted at /api/auth/*. */
  authHandler: (request: Request) => Promise<Response>;
}

export type AppEnv = { Variables: { user: AppUser | null } };
