export interface Env {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  /** Immutable Discord user ids (snowflakes) that get the admin role. */
  ADMIN_DISCORD_IDS: string[];
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

  const adminIds = get("ADMIN_DISCORD_IDS")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (adminIds.some((id) => !/^\d{15,25}$/.test(id))) {
    errors.push(
      "ADMIN_DISCORD_IDS must be comma-separated numeric Discord ids",
    );
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
    ADMIN_DISCORD_IDS: adminIds,
    PORT: port,
  };
}
