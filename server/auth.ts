import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, eq } from "drizzle-orm";

import type { Db } from "./db";
import * as schema from "./db/schema";
import type { Env } from "./env";
import type { AppUser } from "./types";

export function createAuth(env: Env, db: Db) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    socialProviders: {
      discord: {
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
        // Only the `identify` scope is requested, so Discord returns no email.
        // Better Auth requires one, so synthesize a unique placeholder.
        disableDefaultScope: true,
        scope: ["identify"],
        mapProfileToUser: (profile) => ({
          email: `${profile.id}@discord.invalid`,
          emailVerified: false,
        }),
      },
    },
    advanced: {
      useSecureCookies: new URL(env.BETTER_AUTH_URL).protocol === "https:",
      // The app sits behind Traefik, which sets X-Forwarded-For.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Maps a Better Auth session to an app user; admin = allowlisted Discord id. */
export function createSessionResolver(
  auth: Auth,
  db: Db,
  adminDiscordIds: string[],
) {
  return async (headers: Headers): Promise<AppUser | null> => {
    const result = await auth.api.getSession({ headers });
    if (!result) return null;

    const [discord] = await db
      .select({ accountId: schema.account.accountId })
      .from(schema.account)
      .where(
        and(
          eq(schema.account.userId, result.user.id),
          eq(schema.account.providerId, "discord"),
        ),
      )
      .limit(1);

    return {
      id: result.user.id,
      name: result.user.name,
      role:
        discord && adminDiscordIds.includes(discord.accountId)
          ? "admin"
          : "user",
    };
  };
}
