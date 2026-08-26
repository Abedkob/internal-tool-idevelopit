type CacheEntry = {
  expiresAt: number;
  value: Promise<unknown>;
};

const browserCache = new Map<string, CacheEntry>();

export function cachedBrowserQuery<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  if (typeof window === "undefined") return loader();

  const now = Date.now();
  const cached = browserCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value as Promise<T>;

  const value = loader().catch((error) => {
    browserCache.delete(key);
    throw error;
  });
  browserCache.set(key, { expiresAt: now + ttlMs, value });
  return value;
}

export function invalidateBrowserQueries(prefixes?: string[]) {
  if (!prefixes?.length) {
    browserCache.clear();
    return;
  }

  for (const key of browserCache.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) browserCache.delete(key);
  }
}
