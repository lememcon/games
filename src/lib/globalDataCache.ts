// One load per global (non-year) dataset, shared by every hook that asks for
// it. Only the global fetch is cached; an injected fetch runs uncached. A
// failed load is evicted so a retry refetches. Consumers must treat the
// returned data as read-only.
type Key = "years" | "games";

const cache = new Map<Key, Promise<unknown>>();

export const resetGlobalDataCache = (): void => cache.clear();

// Drop one dataset, or every one when none is given.
export const invalidateGlobalData = (key?: Key): void => {
  if (key === undefined) cache.clear();
  else cache.delete(key);
};

export const loadGlobal = <T>(
  key: Key,
  fetchImpl: typeof fetch,
  fetcher: (fetchImpl: typeof fetch) => Promise<T>,
): Promise<T> => {
  if (fetchImpl !== globalThis.fetch) return fetcher(fetchImpl);

  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;

  const promise = fetcher(fetchImpl).catch((e: unknown) => {
    if (cache.get(key) === promise) cache.delete(key);
    throw e;
  });
  cache.set(key, promise);
  return promise;
};
