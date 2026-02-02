import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch, getToken } from "../api";
import type { Follow } from "../types";
import { useAuth } from "../hooks/useAuth";

export type FollowItem = {
  key: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  meta: { date?: string | null; tbd?: boolean; note?: string };
  addedAt: number;
  seasonNumber?: number | null;
  targetType?: "movie" | "tv_full" | "tv_season";
  serverId?: number;
};

const STORAGE_KEY = "db_guest_follows_v1";

const buildKey = (mediaType: "movie" | "tv", tmdbId: number, seasonNumber?: number | null) => {
  if (mediaType === "tv" && typeof seasonNumber === "number") {
    return `tv:${tmdbId}:season:${seasonNumber}`;
  }
  return `${mediaType}:${tmdbId}`;
};

const readGuestFollows = (): FollowItem[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FollowItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const writeGuestFollows = (items: FollowItem[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

const hydrateFromDetails = async (
  mediaType: "movie" | "tv",
  tmdbId: number,
  seasonNumber?: number | null,
) => {
  if (mediaType === "movie") {
    return apiFetch<any>(`/api/tmdb/movie/${tmdbId}`);
  }
  if (typeof seasonNumber === "number") {
    return apiFetch<any>(`/api/tmdb/tv/${tmdbId}/season/${seasonNumber}`);
  }
  return apiFetch<any>(`/api/tmdb/tv/${tmdbId}`);
};

const buildItemFromDetails = (
  mediaType: "movie" | "tv",
  tmdbId: number,
  details: any,
  seasonNumber?: number | null,
): FollowItem => {
  const title = details?.title || details?.name || `TMDB ${tmdbId}`;
  const posterPath = details?.poster_path ?? null;
  const date = mediaType === "movie" ? details?.release_date : details?.first_air_date;
  const seasonDate = details?.air_date;
  const metaDate = typeof seasonNumber === "number" ? seasonDate : date;
  const tbd = !metaDate;
  return {
    key: buildKey(mediaType, tmdbId, seasonNumber),
    mediaType,
    tmdbId,
    title,
    posterPath,
    meta: { date: metaDate || null, tbd },
    addedAt: Date.now(),
    seasonNumber: typeof seasonNumber === "number" ? seasonNumber : undefined,
  };
};

const buildItemFromServer = (follow: Follow): FollowItem => {
  const mediaType = follow.target_type === "movie" ? "movie" : "tv";
  const seasonNumber = follow.target_type === "tv_season" ? follow.season_number : undefined;
  const title =
    (follow.cache_payload as { title?: string; name?: string } | undefined)?.title ||
    (follow.cache_payload as { name?: string } | undefined)?.name ||
    `TMDB ${follow.tmdb_id}`;
  const posterPath = (follow.cache_payload as { poster_path?: string } | undefined)?.poster_path ?? null;
  const date =
    follow.target_type === "movie"
      ? follow.release_date
      : follow.target_type === "tv_season"
        ? follow.season_air_date
        : follow.first_air_date;
  return {
    key: buildKey(mediaType, follow.tmdb_id, seasonNumber),
    mediaType,
    tmdbId: follow.tmdb_id,
    title,
    posterPath,
    meta: { date: date || null, tbd: !date },
    addedAt: Date.now(),
    seasonNumber: seasonNumber ?? undefined,
    targetType: follow.target_type,
    serverId: follow.id,
  };
};

export const followStore = {
  list: async (): Promise<FollowItem[]> => {
    const token = getToken();
    if (!token) {
      return readGuestFollows();
    }
    const data = await apiFetch<{ follows: Follow[] }>("/api/my/follows");
    return data.follows.map(buildItemFromServer);
  },
  add: async (input: { mediaType: "movie" | "tv"; tmdbId: number; seasonNumber?: number | null }) => {
    const token = getToken();
    const key = buildKey(input.mediaType, input.tmdbId, input.seasonNumber);
    if (!token) {
      const items = readGuestFollows();
      if (items.some((item) => item.key === key)) {
        return items.find((item) => item.key === key) as FollowItem;
      }
      try {
        const details = await hydrateFromDetails(input.mediaType, input.tmdbId, input.seasonNumber);
        const item = buildItemFromDetails(input.mediaType, input.tmdbId, details, input.seasonNumber);
        const next = [item, ...items];
        writeGuestFollows(next);
        return item;
      } catch (error) {
        const fallback: FollowItem = {
          key,
          mediaType: input.mediaType,
          tmdbId: input.tmdbId,
          title: `TMDB ${input.tmdbId}`,
          posterPath: null,
          meta: { tbd: true, note: "Tap to retry hydrate" },
          addedAt: Date.now(),
          seasonNumber: input.seasonNumber,
        };
        writeGuestFollows([fallback, ...items]);
        return fallback;
      }
    }

    const targetType = input.mediaType === "movie" ? "movie" : "tv_full";
    const payload: any = {
      target_type: targetType,
      tmdb_id: input.tmdbId,
    };
    if (input.mediaType === "tv" && typeof input.seasonNumber === "number") {
      payload.target_type = "tv_season";
      payload.season_number = input.seasonNumber;
    }
    await apiFetch<{ id: number }>("/api/my/follows", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const details = await hydrateFromDetails(input.mediaType, input.tmdbId, input.seasonNumber);
    return buildItemFromDetails(input.mediaType, input.tmdbId, details, input.seasonNumber);
  },
  remove: async (key: string) => {
    const token = getToken();
    if (!token) {
      const items = readGuestFollows();
      writeGuestFollows(items.filter((item) => item.key !== key));
      return;
    }
    const data = await apiFetch<{ follows: Follow[] }>("/api/my/follows");
    const match = data.follows.find((follow) => {
      const mediaType = follow.target_type === "movie" ? "movie" : "tv";
      const seasonNumber = follow.target_type === "tv_season" ? follow.season_number : undefined;
      return buildKey(mediaType, follow.tmdb_id, seasonNumber) === key;
    });
    if (match) {
      await apiFetch(`/api/my/follows/${match.id}`, { method: "DELETE" });
    }
  },
  isFollowing: async (key: string) => {
    const items = await followStore.list();
    return items.some((item) => item.key === key);
  },
  retryHydrate: async (item: FollowItem) => {
    const token = getToken();
    if (token) {
      return item;
    }
    const items = readGuestFollows();
    try {
      const details = await hydrateFromDetails(item.mediaType, item.tmdbId, item.seasonNumber);
      const nextItem = buildItemFromDetails(
        item.mediaType,
        item.tmdbId,
        details,
        item.seasonNumber,
      );
      const next = items.map((entry) => (entry.key === item.key ? nextItem : entry));
      writeGuestFollows(next);
      return nextItem;
    } catch (error) {
      return item;
    }
  },
};

export const useFollowStore = () => {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<FollowItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await followStore.list();
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) return;
    const handler = () => refresh();
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [isAuthenticated, refresh]);

  const addFollow = useCallback(
    async (input: { mediaType: "movie" | "tv"; tmdbId: number; seasonNumber?: number | null }) => {
      const item = await followStore.add(input);
      await refresh();
      return item;
    },
    [refresh],
  );

  const removeFollow = useCallback(
    async (key: string) => {
      await followStore.remove(key);
      await refresh();
    },
    [refresh],
  );

  const retryHydrate = useCallback(
    async (item: FollowItem) => {
      const next = await followStore.retryHydrate(item);
      await refresh();
      return next;
    },
    [refresh],
  );

  const isFollowing = useCallback(
    (key: string) => items.some((item) => item.key === key),
    [items],
  );

  return useMemo(
    () => ({
      items,
      loading,
      refresh,
      addFollow,
      removeFollow,
      retryHydrate,
      isFollowing,
    }),
    [items, loading, refresh, addFollow, removeFollow, retryHydrate, isFollowing],
  );
};

export const followKey = buildKey;
