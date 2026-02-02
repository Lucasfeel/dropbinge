export type SearchHistoryItem = {
  key: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  meta?: { date?: string | null };
  addedAt: number;
};

const STORAGE_KEY = "db_recent_searches_v1";
const MAX_ITEMS = 12;

export const getRecentSearches = (): SearchHistoryItem[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SearchHistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

export const addRecentSearch = (item: SearchHistoryItem) => {
  const items = getRecentSearches().filter((entry) => entry.key !== item.key);
  const next = [item, ...items].slice(0, MAX_ITEMS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("db:recent-searches"));
};
