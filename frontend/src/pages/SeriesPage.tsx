import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ChipFilterRow } from "../components/ChipFilterRow";
import { GridSkeleton } from "../components/GridSkeleton";
import { PosterGrid } from "../components/PosterGrid";
import { SectionHeader } from "../components/SectionHeader";
import { fetchTvCompleted, fetchTvOnTheAir, fetchTvPopular } from "../api/tmdbLists";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { getBrowseCache, setBrowseCache } from "../stores/browseCache";
import { useFollowStore } from "../stores/followStore";
import type { TitleSummary } from "../types";

const FILTERS = [
  { key: "top-rated", label: "Top Rated" },
  { key: "on-the-air", label: "On The Air" },
  { key: "completed", label: "Completed" },
];
const DEFAULT_FILTER = "top-rated";
const FILTER_KEYS = new Set(FILTERS.map((item) => item.key));

export const SeriesPage = () => {
  const { items } = useFollowStore();
  const [params, setParams] = useSearchParams();
  const rawFilter = params.get("filter");
  const filter = rawFilter && FILTER_KEYS.has(rawFilter) ? rawFilter : DEFAULT_FILTER;
  const sort = params.get("sort") || "rating";
  const cacheKey = `series:${filter}:${sort}`;
  const [browseItems, setBrowseItems] = useState<TitleSummary[]>([]);
  const [browsePage, setBrowsePage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const cacheKeyRef = useRef(cacheKey);
  const browseItemsRef = useRef<TitleSummary[]>([]);

  const series = useMemo(() => items.filter((item) => item.mediaType === "tv"), [items]);
  const trackedItems = useMemo(
    () =>
      series
        .filter((item) => item.targetType === "tv_full")
        .map((item) => ({
          id: item.tmdbId,
          media_type: "tv" as const,
          title: item.title,
          poster_path: item.posterPath,
          backdrop_path: null,
          date: item.meta?.date || null,
          vote_average: null,
          vote_count: null,
          is_completed: item.isCompleted ? true : undefined,
        })),
    [series],
  );

  const fetcher = useMemo(() => {
    if (filter === "completed") return fetchTvCompleted;
    if (filter === "on-the-air") return fetchTvOnTheAir;
    return fetchTvPopular;
  }, [filter]);

  const loadBrowse = useCallback(
    async (nextPage: number, replace: boolean, requestKey: string = cacheKeyRef.current) => {
      if (!mountedRef.current) return;
      setError(null);
      setLoading(true);
      try {
        const response = await fetcher(nextPage);
        if (!mountedRef.current || cacheKeyRef.current !== requestKey) return;
        const nextItems = replace ? response.results : [...browseItemsRef.current, ...response.results];
        browseItemsRef.current = nextItems;
        setBrowseItems(nextItems);
        setBrowsePage(response.page);
        setTotalPages(response.total_pages);
        setBrowseCache(requestKey, {
          items: nextItems,
          page: response.page,
          totalPages: response.total_pages,
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
    [fetcher],
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
      setError(null);
      setLoading(false);
    } else {
      setError(null);
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

  const hasMore = !error && (totalPages === null ? true : browsePage < totalPages);
  const isRefreshing = loading && browseItems.length > 0;
  const loadMore = useCallback(() => {
    if (!hasMore || loading || error) return;
    void loadBrowse(browsePage + 1, false, cacheKey);
  }, [browsePage, cacheKey, error, hasMore, loadBrowse, loading]);
  const sentinelRef = useInfiniteScroll({ onLoadMore: loadMore, hasMore, loading });

  return (
    <div className="page series-page">
      <div className="page-hero">
        <SectionHeader
          title="Series"
          subtitle="Full-run tracking for entire shows. Track when they conclude and key changes."
        />
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
          <label className="muted" htmlFor="series-sort">
            Sort
          </label>
          <select
            id="series-sort"
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
          <SectionHeader title="My tracked" subtitle="Series you are tracking end-to-end." />
          <PosterGrid items={trackedItems} mediaType="tv" />
        </>
      ) : (
        <>
          <SectionHeader title="My tracked" />
          <p className="muted">Search and add titles to track.</p>
        </>
      )}

      <SectionHeader title="Browse" subtitle="Browse popular and long-running series." />
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
