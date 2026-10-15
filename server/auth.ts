import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { discord } from "better-auth/social-providers";

import type { Db } from "./db";
import * as schema from "./db/schema";
import type { Env } from "./env";
import { effectiveUser, isProtected } from "./roles";
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

/** The LememCon Discord server; only its members may sign in. */
export const GUILD_ID = "190322800400138240";

/**
 * Whether the access token's owner is in the LememCon server, from their
 * guild list (the `guilds` scope). Discord caps that list at 200 guilds, so
 * one page is complete. Any failure counts as not a member.
 */
export async function isGuildMember(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl("https://discord.com/api/users/@me/guilds", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return false;
    const guilds: unknown = await res.json();
    return (
      Array.isArray(guilds) &&
      guilds.some((g: { id?: unknown }) => g?.id === GUILD_ID)
    );
  } catch {
    return false;
  }
}

export function createAuth(env: Env, db: Db) {
  const discordOptions = {
    clientId: env.DISCORD_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
    // `identify` returns no email, and `guilds` lets us check server membership.
    // Better Auth requires an email, so synthesize a unique placeholder.
    disableDefaultScope: true,
    scope: ["identify", "guilds"],
    // Refresh name, avatar and username on every sign-in.
    overrideUserInfoOnSignIn: true,
    mapProfileToUser: (profile: { id: string; username: string }) => ({
      email: `${profile.id}@discord.invalid`,
      emailVerified: false,
      username: profile.username,
    }),
  };
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
        ...discordOptions,
        // Returning null aborts the sign-in before any user or session exists.
        // The built-in protected admins skip the check so they cannot be locked out.
        getUserInfo: async (token) => {
          const info = await discord(discordOptions).getUserInfo(token);
          if (!info || isProtected(info.data.id)) return info;
          return (await isGuildMember(token.accessToken!)) ? info : null;
        },
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
        name: row.displayName ?? result.user.name,
        displayName: row.displayName,
        color: row.color,
        discordName: result.user.name,
        image: result.user.image ?? null,
        ...effective,
      },
      headers: responseHeaders,
    };
  };
}
