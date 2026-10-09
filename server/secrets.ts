import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";
const INFO = "lememcon:bgg-key:v1";
const SALT = "lememcon-secrets-salt";

/** AES-256 key derived from the server secret; the secret itself is never used directly. */
const deriveKey = (secret: string) =>
  Buffer.from(hkdfSync("sha256", secret, SALT, INFO, 32));

/**
 * Encrypts with AES-256-GCM and a random 12-byte IV. `aad` (the setting key)
 * binds the ciphertext to its row. Stored as `v1:iv:tag:ciphertext` (base64).
 */
export function encryptSecret(
  plaintext: string,
  secret: string,
  aad: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ct]
    .map((part) => (typeof part === "string" ? part : part.toString("base64")))
    .join(":");
}

/** Returns null for anything that does not decrypt: tampering, wrong secret or AAD, bad format. */
export function decryptSecret(
  stored: string,
  secret: string,
  aad: string,
): string | null {
  const [version, iv, tag, ct, ...rest] = stored.split(":");
  if (version !== VERSION || !iv || !tag || ct === undefined || rest.length)
    return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(secret),
      Buffer.from(iv, "base64"),
    );
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ct, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/** Shows only the last 4 characters, and only for keys long enough that this reveals little. */
export function maskSecret(secret: string): string {
  const dots = "•".repeat(8);
  return secret.length >= 16 ? `${dots}${secret.slice(-4)}` : dots;
}
