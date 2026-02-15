import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ChipFilterRow } from "../components/ChipFilterRow";
import { GridSkeleton } from "../components/GridSkeleton";
import { PosterGrid } from "../components/PosterGrid";
import { SectionHeader } from "../components/SectionHeader";
import { fetchTvSeasons } from "../api/tmdbLists";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { getBrowseCache, setBrowseCache } from "../stores/browseCache";
import { useFollowStore } from "../stores/followStore";
import type { TitleSummary } from "../types";

type TvFilter = "on-the-air" | "completed";

const FILTERS = [
  { key: "on-the-air", label: "On The Air" },
  { key: "completed", label: "Completed" },
];
const DEFAULT_FILTER = "on-the-air";
const FILTER_KEYS = new Set(FILTERS.map((item) => item.key));

export const TvPage = () => {
  const { items } = useFollowStore();
  const [params, setParams] = useSearchParams();
  const rawFilter = params.get("filter");
  const normalizedFilter = rawFilter === "upcoming" ? DEFAULT_FILTER : rawFilter;
  const filter =
    normalizedFilter && FILTER_KEYS.has(normalizedFilter)
      ? (normalizedFilter as TvFilter)
      : DEFAULT_FILTER;
  const sort = params.get("sort") || "popularity";
  const cacheKey = `tv:${filter}:${sort}`;
  const [browseItems, setBrowseItems] = useState<TitleSummary[]>([]);
  const [browsePage, setBrowsePage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [hasMoreOverride, setHasMoreOverride] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const cacheKeyRef = useRef(cacheKey);
  const browseItemsRef = useRef<TitleSummary[]>([]);

  const trackedItems = useMemo(
    () =>
      items
        .filter((item) => item.mediaType === "tv" && typeof item.seasonNumber === "number")
        .map((item) => ({
          id: item.tmdbId,
          media_type: "tv" as const,
          title: item.title,
          poster_path: item.posterPath,
          backdrop_path: null,
          date: item.meta?.date || null,
          vote_average: null,
          vote_count: null,
          season_number: item.seasonNumber ?? undefined,
          series_id: item.tmdbId,
          is_completed: item.isCompleted ? true : undefined,
        })),
    [items],
  );

  const loadBrowse = useCallback(
    async (nextPage: number, replace: boolean, requestKey: string = cacheKeyRef.current) => {
      if (!mountedRef.current) return;
      setError(null);
      setLoading(true);
      try {
        const response = await fetchTvSeasons(nextPage, filter);
        if (!mountedRef.current || cacheKeyRef.current !== requestKey) return;
        const nextItems = replace ? response.results : [...browseItemsRef.current, ...response.results];
        const resolvedHasMore =
          typeof response.has_more === "boolean" ? response.has_more : null;
        browseItemsRef.current = nextItems;
        setBrowseItems(nextItems);
        setBrowsePage(response.page);
        setTotalPages(response.total_pages);
        setHasMoreOverride(resolvedHasMore);
        setBrowseCache(requestKey, {
          items: nextItems,
          page: response.page,
          totalPages: response.total_pages,
          hasMore: resolvedHasMore,
          updatedAt: Date.now(),
        });
      } catch (err) {
        if (!mountedRef.current || cacheKeyRef.current !== requestKey) return;
        setError("Unable to load browse results. Please try again.");
      } finally {
        if (!mountedRef.current || cacheKeyRef.current !== requestKey) return;
        setLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    cacheKeyRef.current = cacheKey;
  }, [cacheKey]);

  useEffect(() => {
    if (rawFilter && rawFilter !== filter) {
      setParams({ filter: DEFAULT_FILTER, sort }, { replace: true });
    }
  }, [filter, rawFilter, setParams, sort]);

  useEffect(() => {
    const cached = getBrowseCache(cacheKey);
    if (cached) {
      browseItemsRef.current = cached.items;
      setBrowseItems(cached.items);
      setBrowsePage(cached.page);
      setTotalPages(cached.totalPages);
      setHasMoreOverride(cached.hasMore ?? null);
      setError(null);
      setLoading(false);
    } else {
      setError(null);
      setHasMoreOverride(null);
      if (browseItemsRef.current.length === 0) {
        setBrowsePage(1);
        setTotalPages(null);
      }
    }
    void loadBrowse(1, true, cacheKey);
  }, [cacheKey, loadBrowse]);

  const toTimestamp = (value?: string | null) => {
    if (!value) return 0;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : 0;
  };

  const sortedBrowse = useMemo(() => {
    if (sort === "rating") {
      return [...browseItems].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    }
    if (sort === "latest") {
      return [...browseItems].sort((a, b) => toTimestamp(b.date) - toTimestamp(a.date));
    }
    return browseItems;
  }, [browseItems, sort]);

  const hasMore = !error && (hasMoreOverride ?? (totalPages === null ? true : browsePage < totalPages));
  const isRefreshing = loading && browseItems.length > 0;
  const loadMore = useCallback(() => {
    if (!hasMore || loading || error) return;
    if (import.meta.env.DEV) {
      console.debug("[TvPage] loadMore", {
        page: browsePage,
        nextPage: browsePage + 1,
        hasMore,
        loading,
        itemsCount: browseItemsRef.current.length,
      });
    }
    void loadBrowse(browsePage + 1, false, cacheKey);
  }, [browsePage, cacheKey, error, hasMore, loadBrowse, loading]);
  const sentinelRef = useInfiniteScroll({ onLoadMore: loadMore, hasMore, loading });

  return (
    <div className="page tv-page">
      <div className="page-hero">
        <SectionHeader title="TV" subtitle="Track upcoming seasons and air dates." />
      </div>
      <div className="filter-controls">
        <ChipFilterRow>
          {FILTERS.map((item) => (
            <button
              key={item.key}
              className={`chip ${filter === item.key ? "active" : ""}`}
              onClick={() => setParams({ filter: item.key, sort })}
            >
              {item.label}
            </button>
          ))}
        </ChipFilterRow>
        <div className="sort-select">
          <label className="muted" htmlFor="tv-sort">
            Sort
          </label>
          <select
            id="tv-sort"
            value={sort}
            onChange={(event) => setParams({ filter, sort: event.target.value })}
          >
            <option value="popularity">Popularity</option>
            <option value="rating">Rating</option>
            <option value="latest">Latest</option>
          </select>
        </div>
      </div>

      {trackedItems.length > 0 ? (
        <>
          <SectionHeader title="My tracked" subtitle="Shows you are following." />
          <PosterGrid items={trackedItems} mediaType="tv" />
        </>
      ) : (
        <>
          <SectionHeader title="My tracked" />
          <p className="muted">Search and add titles to track.</p>
        </>
      )}

      <SectionHeader title="Browse" subtitle="Fresh seasons and fan favorites." />
      {error ? (
        <div className="card">
          <p>{error}</p>
          <button className="button secondary" onClick={() => void loadBrowse(1, true, cacheKey)}>
            Retry
          </button>
        </div>
      ) : null}
      {loading && browseItems.length === 0 ? (
        <GridSkeleton count={8} />
      ) : !error && browseItems.length === 0 ? (
        <div className="card">
          <p>No results.</p>
        </div>
      ) : (
        <PosterGrid items={sortedBrowse} mediaType="tv" />
      )}
      {isRefreshing ? <p className="muted">Updating list...</p> : null}
      <div ref={sentinelRef} style={{ height: 1 }} />
    </div>
  );
};
