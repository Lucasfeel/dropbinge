import type { TitleSummary } from "../types";

export type BrowseCacheValue = {
  items: TitleSummary[];
  page: number;
  totalPages: number | null;
  updatedAt: number;
};

const CACHE_PREFIX = "dropbinge:browse-cache:";
const CACHE_TTL_MS = 10 * 60 * 1000;
const memoryCache = new Map<string, BrowseCacheValue>();

const isExpired = (value: BrowseCacheValue, now = Date.now()) =>
  now - value.updatedAt > CACHE_TTL_MS;

const storageKey = (key: string) => `${CACHE_PREFIX}${key}`;

const readFromSession = (key: string): BrowseCacheValue | null => {
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BrowseCacheValue;
    if (!parsed || !Array.isArray(parsed.items) || typeof parsed.updatedAt !== "number") {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
};

const removeKey = (key: string) => {
  memoryCache.delete(key);
  try {
    window.sessionStorage.removeItem(storageKey(key));
  } catch (error) {
    // Ignore sessionStorage failures to keep UI responsive.
  }
};

export const getBrowseCache = (key: string): BrowseCacheValue | null => {
  const fromMemory = memoryCache.get(key);
  if (fromMemory) {
    if (isExpired(fromMemory)) {
      removeKey(key);
      return null;
    }
    return fromMemory;
  }

  const fromSession = readFromSession(key);
  if (!fromSession) return null;
  if (isExpired(fromSession)) {
    removeKey(key);
    return null;
  }
  memoryCache.set(key, fromSession);
  return fromSession;
};

export const setBrowseCache = (key: string, value: BrowseCacheValue): void => {
  memoryCache.set(key, value);
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch (error) {
    // Ignore sessionStorage write issues.
  }
};

export const clearBrowseCache = (prefix?: string): void => {
  if (!prefix) {
    memoryCache.clear();
    try {
      const keysToRemove: string[] = [];
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (key && key.startsWith(CACHE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
    } catch (error) {
      // Ignore storage access failures.
    }
    return;
  }

  const matchPrefix = prefix;
  [...memoryCache.keys()].forEach((key) => {
    if (key.startsWith(matchPrefix)) {
      memoryCache.delete(key);
    }
  });

  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const rawKey = window.sessionStorage.key(index);
      if (!rawKey || !rawKey.startsWith(CACHE_PREFIX)) continue;
      const logicalKey = rawKey.slice(CACHE_PREFIX.length);
      if (logicalKey.startsWith(matchPrefix)) {
        keysToRemove.push(rawKey);
      }
    }
    keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
  } catch (error) {
    // Ignore storage access failures.
  }
};
