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
  /** Cover mirror (S3-compatible). All of these are set together or none are. */
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  /** https origin the mirrored covers are served from, without a trailing slash. */
  COVER_BASE_URL?: string;
  /** https endpoint of an S3-compatible provider; unset means AWS. */
  S3_ENDPOINT?: string;
}

const required = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
] as const;

const s3Required = [
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "COVER_BASE_URL",
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

  const s3Set = s3Required.filter((key) => get(key));
  if (s3Set.length > 0 && s3Set.length < s3Required.length) {
    const missing = s3Required.filter((key) => !get(key));
    errors.push(
      `S3 cover storage is all-or-none; missing: ${missing.join(", ")}`,
    );
  }

  const httpsOrigin = (key: string): string | undefined => {
    if (!get(key)) return undefined;
    try {
      const url = new URL(get(key));
      if (
        url.protocol === "https:" &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password
      )
        return url.origin;
    } catch {
      // falls through to the error below
    }
    errors.push(`${key} must be an https origin`);
    return undefined;
  };
  const coverBaseUrl = httpsOrigin("COVER_BASE_URL");
  const s3Endpoint = httpsOrigin("S3_ENDPOINT");

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
    S3_BUCKET: get("S3_BUCKET") || undefined,
    S3_REGION: get("S3_REGION") || undefined,
    S3_ACCESS_KEY_ID: get("S3_ACCESS_KEY_ID") || undefined,
    S3_SECRET_ACCESS_KEY: get("S3_SECRET_ACCESS_KEY") || undefined,
    COVER_BASE_URL: coverBaseUrl,
    S3_ENDPOINT: s3Endpoint,
  };
}
