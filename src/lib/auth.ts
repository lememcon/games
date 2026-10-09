import { apiFetch } from "@/lib/api";

// Only same-origin relative paths are allowed as the post-login destination, so
// the OAuth callback cannot be turned into an open redirect.
export const safeCallbackPath = (path: string): string =>
  path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
    ? path
    : "/";

export async function signInWithDiscord(
  loc: Pick<Location, "origin" | "pathname" | "search"> = window.location,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const callbackURL =
    loc.origin + safeCallbackPath(`${loc.pathname}${loc.search}`);
  // Failures after the state is recovered land back on the SPA, not the API host.
  const errorCallbackURL = `${loc.origin}/`;
  const { url } = await apiFetch<{ url: string }>(
    "/auth/sign-in/social",
    {
      method: "POST",
      body: { provider: "discord", callbackURL, errorCallbackURL },
    },
    fetchImpl,
  );
  return url;
}

export async function signOut(fetchImpl: typeof fetch = fetch): Promise<void> {
  await apiFetch("/auth/sign-out", { method: "POST", body: {} }, fetchImpl);
}
