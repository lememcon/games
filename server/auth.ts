import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import type { Db } from "./db";
import * as schema from "./db/schema";
import type { Env } from "./env";
import { effectiveUser } from "./roles";
import type { ResolvedSession, UserStore } from "./types";

/**
 * Where Better Auth sends the browser when an OAuth callback fails before it
 * can recover the per-request `errorCallbackURL` (e.g. an expired or
 * already-used state, or a missing state param). Without this it lands on the API host's own
 * `/api/auth/error`. The SPA origin is WEB_ORIGIN, else the origin of
 * BETTER_AUTH_URL (the same-origin proxy topology).
 *
 * Limit: if BETTER_AUTH_URL is the API host and WEB_ORIGIN is unset this still
 * resolves to the API host; the SPA's per-request `errorCallbackURL` covers
 * every failure after state is parsed, but not that early one.
 */
export function resolveErrorUrl(
  env: Pick<Env, "BETTER_AUTH_URL" | "WEB_ORIGIN">,
): string {
  return env.WEB_ORIGIN || new URL(env.BETTER_AUTH_URL).origin;
}

export function createAuth(env: Env, db: Db) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    onAPIError: { errorURL: resolveErrorUrl(env) },
    trustedOrigins: [
      new URL(env.BETTER_AUTH_URL).origin,
      ...(env.WEB_ORIGIN ? [env.WEB_ORIGIN] : []),
    ],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    // Roles live in app_user, which Better Auth never exposes. These routes
    // would let a user edit their profile or attach another identity.
    disabledPaths: ["/update-user", "/link-social", "/unlink-account"],
    account: { accountLinking: { enabled: false } },
    user: {
      additionalFields: {
        // Not user-settable: /update-user is disabled and the value only comes
        // from the Discord profile. `input: false` would make Better Auth drop it.
        username: { type: "string", required: false },
      },
    },
    session: {
      // Keep the cookie cache off: a cached session would let a demoted or
      // removed user keep access until it expires. Every request re-reads the DB.
      cookieCache: { enabled: false },
    },
    socialProviders: {
      discord: {
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
        // Only the `identify` scope is requested, so Discord returns no email.
        // Better Auth requires one, so synthesize a unique placeholder.
        disableDefaultScope: true,
        scope: ["identify"],
        // Refresh name, avatar and username on every sign-in.
        overrideUserInfoOnSignIn: true,
        mapProfileToUser: (profile) => ({
          email: `${profile.id}@discord.invalid`,
          emailVerified: false,
          username: profile.username,
        }),
      },
    },
    advanced: {
      useSecureCookies: new URL(env.BETTER_AUTH_URL).protocol === "https:",
      // The app sits behind Traefik, which sets X-Forwarded-For.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
      // The SPA and API are sibling subdomains; share the cookie across them.
      ...(env.COOKIE_DOMAIN && {
        crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN },
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Maps a Better Auth session to an app user. Identity is the Discord id of the
 * single linked Discord account; role and status are read from the store on
 * every request, never from the session.
 */
export function createSessionResolver(auth: Auth, store: UserStore) {
  return async (headers: Headers): Promise<ResolvedSession> => {
    const { headers: responseHeaders, response: result } =
      await auth.api.getSession({ headers, returnHeaders: true });
    if (!result) return { user: null, headers: responseHeaders };

    // Fail closed unless the login has exactly one Discord account.
    const ids = await store.discordIds(result.user.id);
    if (ids.length !== 1) return { user: null, headers: responseHeaders };
    const [discordId] = ids;

    const row = await store.getOrCreate(discordId);
    const effective = effectiveUser(discordId, row);
    if (effective.role !== row.role || effective.status !== row.status)
      await store.repairProtected(discordId);

    return {
      user: {
        discordId,
        name: result.user.name,
        image: result.user.image ?? null,
        ...effective,
      },
      headers: responseHeaders,
    };
  };
}
