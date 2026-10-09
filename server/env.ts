export interface Env {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  /** Origin of the SPA allowed to call the API with credentials (CORS/CSRF). */
  WEB_ORIGIN?: string;
  /** Parent domain for the session cookie, e.g. .lememcon.com (unset on localhost). */
  COOKIE_DOMAIN?: string;
  PORT: number;
}

const required = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
] as const;

const SECRET_PLACEHOLDER = "replace-with-output-of-openssl-rand-base64-32";

/** Validate raw environment variables, reporting every problem at once. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const errors: string[] = [];
  const get = (key: string) => source[key]?.trim() ?? "";

  for (const key of required) {
    if (!get(key)) errors.push(`${key} is required`);
  }

  if (get("BETTER_AUTH_SECRET") && get("BETTER_AUTH_SECRET").length < 32) {
    errors.push("BETTER_AUTH_SECRET must be at least 32 characters");
  }

  if (get("BETTER_AUTH_SECRET") === SECRET_PLACEHOLDER) {
    errors.push("BETTER_AUTH_SECRET must not be the .env.example placeholder");
  }

  if (get("BETTER_AUTH_URL")) {
    try {
      new URL(get("BETTER_AUTH_URL"));
    } catch {
      errors.push("BETTER_AUTH_URL must be an absolute URL");
    }
  }

  let webOrigin: string | undefined;
  if (get("WEB_ORIGIN")) {
    try {
      webOrigin = new URL(get("WEB_ORIGIN")).origin;
    } catch {
      errors.push("WEB_ORIGIN must be an absolute URL");
    }
  }

  const port = get("PORT") ? Number(get("PORT")) : 8080;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("PORT must be an integer between 1 and 65535");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment:\n- ${errors.join("\n- ")}`);
  }

  return {
    DATABASE_URL: get("DATABASE_URL"),
    BETTER_AUTH_SECRET: get("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: get("BETTER_AUTH_URL"),
    DISCORD_CLIENT_ID: get("DISCORD_CLIENT_ID"),
    DISCORD_CLIENT_SECRET: get("DISCORD_CLIENT_SECRET"),
    WEB_ORIGIN: webOrigin,
    COOKIE_DOMAIN: get("COOKIE_DOMAIN") || undefined,
    PORT: port,
  };
}
