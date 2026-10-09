// Thin fetch wrapper for the LememCon API. `fetchImpl` is injectable for tests.

export class ApiError extends Error {
  status: number;
  // The parsed JSON error body, when there was one.
  body: unknown;

  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// VITE_API_URL is the API origin; unset means the relative /api path.
export const apiBase = (): string => {
  const origin = import.meta.env.VITE_API_URL;
  return origin ? `${origin.replace(/\/+$/, "")}/api` : "/api";
};

export async function apiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const res = await fetchImpl(`${apiBase()}${path}`, {
    method: init.method ?? "GET",
    credentials: "include",
    headers:
      init.body === undefined
        ? undefined
        : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ApiError(res.status, body?.error ?? `HTTP ${res.status}`, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
