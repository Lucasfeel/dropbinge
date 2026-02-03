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
  dropEnabled: boolean;
  bingeEnabled: boolean;
  isCompleted?: boolean;
};

const STORAGE_KEY = "db_guest_follows_v2";
const LEGACY_STORAGE_KEY = "db_guest_follows_v1";

const buildKey = (mediaType: "movie" | "tv", tmdbId: number, seasonNumber?: number | null) => {
  if (mediaType === "tv" && typeof seasonNumber === "number") {
    return `tv:${tmdbId}:season:${seasonNumber}`;
  }
  return `${mediaType}:${tmdbId}`;
};

const getDefaultRoles = (mediaType: "movie" | "tv") => ({
  dropEnabled: true,
  bingeEnabled: mediaType === "tv",
});

const ensureRoleFlags = (item: FollowItem): FollowItem => {
  const defaults = getDefaultRoles(item.mediaType);
  return {
    ...item,
    dropEnabled: item.dropEnabled ?? defaults.dropEnabled,
    bingeEnabled: item.bingeEnabled ?? defaults.bingeEnabled,
    isCompleted: item.isCompleted ?? false,
  };
};

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const getTodayIso = () => new Date().toISOString().split("T")[0];

const isOnOrBeforeToday = (value: unknown, today: string) =>
  isIsoDate(value) && value <= today;

const isSeasonCompleted = (episodes: Array<{ air_date?: string | null }>, today: string) => {
  const dates = episodes.map((episode) => episode.air_date).filter(isIsoDate);
  if (dates.length === 0) return false;
  return !dates.some((airDate) => airDate > today);
};

const readGuestFollows = (): FollowItem[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!legacy) return [];
      const parsedLegacy = JSON.parse(legacy) as FollowItem[];
      const migrated = Array.isArray(parsedLegacy) ? parsedLegacy.map(ensureRoleFlags) : [];
      if (migrated.length > 0) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      }
      return migrated;
    }
    const parsed = JSON.parse(raw) as FollowItem[];
    return Array.isArray(parsed) ? parsed.map(ensureRoleFlags) : [];
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
  roles?: { dropEnabled: boolean; bingeEnabled: boolean },
  targetType?: "movie" | "tv_full" | "tv_season",
): FollowItem => {
  const title = details?.title || details?.name || `TMDB ${tmdbId}`;
  const posterPath = details?.poster_path ?? null;
  const date = mediaType === "movie" ? details?.release_date : details?.first_air_date;
  const seasonDate = details?.air_date;
  const metaDate = typeof seasonNumber === "number" ? seasonDate : date;
  const tbd = !metaDate;
  const resolvedRoles = roles ?? getDefaultRoles(mediaType);
  const today = getTodayIso();
  let isCompleted = false;
  if (mediaType === "movie") {
    isCompleted =
      details?.status === "Released" || isOnOrBeforeToday(details?.release_date, today);
  } else if (typeof seasonNumber === "number") {
    isCompleted = isSeasonCompleted(details?.episodes || [], today);
  } else {
    isCompleted = ["Ended", "Canceled"].includes(details?.status);
  }
  return {
    key: buildKey(mediaType, tmdbId, seasonNumber),
    mediaType,
    tmdbId,
    title,
    posterPath,
    meta: { date: metaDate || null, tbd },
    addedAt: Date.now(),
    seasonNumber: typeof seasonNumber === "number" ? seasonNumber : undefined,
    dropEnabled: resolvedRoles.dropEnabled,
    bingeEnabled: resolvedRoles.bingeEnabled,
    targetType,
    isCompleted,
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
  const dropEnabled = follow.notify_date_changes;
  const bingeEnabled =
    follow.target_type === "tv_full"
      ? follow.notify_full_run_concluded
      : follow.target_type === "tv_season"
        ? follow.notify_season_binge_ready
        : false;
  const status = follow.status_raw ?? (follow.cache_payload as { status?: string } | undefined)?.status;
  const today = getTodayIso();
  let isCompleted = false;
  if (follow.target_type === "movie") {
    isCompleted =
      status === "Released" || isOnOrBeforeToday(follow.release_date, today);
  } else if (follow.target_type === "tv_full") {
    isCompleted = status === "Ended" || status === "Canceled";
  } else if (follow.target_type === "tv_season") {
    const episodes = (follow.cache_payload as { episodes?: Array<{ air_date?: string | null }> })
      ?.episodes;
    if (episodes) {
      isCompleted = isSeasonCompleted(episodes, today);
    }
  }
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
    dropEnabled,
    bingeEnabled,
    isCompleted,
  };
};

const resolveTargetType = (input: {
  mediaType: "movie" | "tv";
  seasonNumber?: number | null;
  targetType?: "movie" | "tv_full" | "tv_season";
}) => {
  if (input.targetType) return input.targetType;
  if (input.mediaType === "movie") return "movie";
  if (typeof input.seasonNumber === "number") return "tv_season";
  return "tv_full";
};

const buildRolePrefs = (
  targetType: "movie" | "tv_full" | "tv_season",
  roles: { drop: boolean; binge?: boolean },
) => {
  const binge = roles.binge ?? false;
  if (targetType === "movie") {
    return {
      notify_date_changes: roles.drop,
      notify_season_binge_ready: false,
      notify_full_run_concluded: false,
    };
  }
  if (targetType === "tv_season") {
    return {
      notify_date_changes: roles.drop,
      notify_season_binge_ready: binge,
      notify_full_run_concluded: false,
    };
  }
  return {
    notify_date_changes: roles.drop,
    notify_season_binge_ready: false,
    notify_full_run_concluded: binge,
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
        const targetType = resolveTargetType(input);
        const item = buildItemFromDetails(
          input.mediaType,
          input.tmdbId,
          details,
          input.seasonNumber,
          undefined,
          targetType,
        );
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
          targetType: resolveTargetType(input),
          ...getDefaultRoles(input.mediaType),
          isCompleted: false,
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
    return buildItemFromDetails(
      input.mediaType,
      input.tmdbId,
      details,
      input.seasonNumber,
      undefined,
      targetType,
    );
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
  setRoles: async (
    input: {
      mediaType: "movie" | "tv";
      tmdbId: number;
      seasonNumber?: number | null;
      targetType?: "movie" | "tv_full" | "tv_season";
    },
    roles: { drop: boolean; binge?: boolean },
  ) => {
    const token = getToken();
    const targetType = resolveTargetType(input);
    const mediaType = targetType === "movie" ? "movie" : "tv";
    const seasonNumber = targetType === "tv_season" ? input.seasonNumber : undefined;
    const key = buildKey(mediaType, input.tmdbId, seasonNumber);
    const shouldFollow = roles.drop || roles.binge;
    const nextRoles = {
      dropEnabled: roles.drop,
      bingeEnabled: roles.binge ?? false,
    };

    if (!token) {
      const items = readGuestFollows();
      const index = items.findIndex((item) => item.key === key);
      if (!shouldFollow) {
        if (index >= 0) {
          const next = items.filter((item) => item.key !== key);
          writeGuestFollows(next);
        }
        return;
      }
      if (index >= 0) {
        const next = items.map((item) =>
          item.key === key ? { ...item, ...nextRoles, targetType } : item,
        );
        writeGuestFollows(next);
        return;
      }
      try {
        const details = await hydrateFromDetails(mediaType, input.tmdbId, seasonNumber);
        const item = buildItemFromDetails(
          mediaType,
          input.tmdbId,
          details,
          seasonNumber,
          nextRoles,
          targetType,
        );
        const next = [item, ...items];
        writeGuestFollows(next);
      } catch (error) {
        const fallback: FollowItem = {
          key,
          mediaType,
          tmdbId: input.tmdbId,
          title: `TMDB ${input.tmdbId}`,
          posterPath: null,
          meta: { tbd: true, note: "Tap to retry hydrate" },
          addedAt: Date.now(),
          seasonNumber,
          targetType,
          ...nextRoles,
          isCompleted: false,
        };
        writeGuestFollows([fallback, ...items]);
      }
      return;
    }

    const data = await apiFetch<{ follows: Follow[] }>("/api/my/follows");
    const match = data.follows.find((follow) => {
      const followSeason = follow.target_type === "tv_season" ? follow.season_number : undefined;
      const followMediaType = follow.target_type === "movie" ? "movie" : "tv";
      return buildKey(followMediaType, follow.tmdb_id, followSeason) === key;
    });
    if (!shouldFollow) {
      if (match) {
        await apiFetch(`/api/my/follows/${match.id}`, { method: "DELETE" });
      }
      return;
    }
    const prefs = buildRolePrefs(targetType, roles);
    if (!match) {
      const payload: any = {
        target_type: targetType,
        tmdb_id: input.tmdbId,
        prefs,
      };
      if (targetType === "tv_season") {
        payload.season_number = input.seasonNumber;
      }
      await apiFetch<{ id: number }>("/api/my/follows", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return;
    }
    await apiFetch(`/api/my/follows/${match.id}`, {
      method: "PATCH",
      body: JSON.stringify({ prefs }),
    });
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
          {
            dropEnabled: item.dropEnabled ?? getDefaultRoles(item.mediaType).dropEnabled,
            bingeEnabled: item.bingeEnabled ?? getDefaultRoles(item.mediaType).bingeEnabled,
          },
          item.targetType,
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

  const setRoles = useCallback(
    async (
      input: {
        mediaType: "movie" | "tv";
        tmdbId: number;
        seasonNumber?: number | null;
        targetType?: "movie" | "tv_full" | "tv_season";
      },
      roles: { drop: boolean; binge?: boolean },
    ) => {
      await followStore.setRoles(input, roles);
      await refresh();
    },
    [refresh],
  );

  const isFollowing = useCallback(
    (key: string) => items.some((item) => item.key === key),
    [items],
  );

  const getItemByKey = useCallback(
    (key: string) => items.find((item) => item.key === key),
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
      setRoles,
      isFollowing,
      getItemByKey,
    }),
    [
      items,
      loading,
      refresh,
      addFollow,
      removeFollow,
      retryHydrate,
      setRoles,
      isFollowing,
      getItemByKey,
    ],
  );
};

export const followKey = buildKey;
