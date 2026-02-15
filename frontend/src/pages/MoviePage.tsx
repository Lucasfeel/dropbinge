import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ChipFilterRow } from "../components/ChipFilterRow";
import { GridSkeleton } from "../components/GridSkeleton";
import { PosterGrid } from "../components/PosterGrid";
import { SectionHeader } from "../components/SectionHeader";
import { fetchMovieCompleted, fetchMovieOutNow, fetchMovieUpcoming } from "../api/tmdbLists";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { getBrowseCache, setBrowseCache } from "../stores/browseCache";
import { useFollowStore } from "../stores/followStore";
import type { TitleSummary } from "../types";

const FILTERS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "out-now", label: "Out Now" },
  { key: "completed", label: "Completed" },
];
const DEFAULT_FILTER = "upcoming";
const FILTER_KEYS = new Set(FILTERS.map((item) => item.key));
const UPCOMING_SKELETON_DELAY_MS = 180;
const UPCOMING_SKELETON_MIN_MS = 550;
const UPCOMING_PREFILL_MIN_ITEMS = 12;
const UPCOMING_PREFILL_MAX_PAGES = 3;

export const MoviePage = () => {
  const { items } = useFollowStore();
  const [params, setParams] = useSearchParams();
  const rawFilter = params.get("filter");
  const filter = rawFilter && FILTER_KEYS.has(rawFilter) ? rawFilter : DEFAULT_FILTER;
  const sort = params.get("sort") || "popularity";
  const cacheKey = `movie:${filter}:${sort}`;
  const [browseItems, setBrowseItems] = useState<TitleSummary[]>([]);
  const [browsePage, setBrowsePage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [hasMoreOverride, setHasMoreOverride] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInitialSkeleton, setShowInitialSkeleton] = useState(false);
  const mountedRef = useRef(false);
  const cacheKeyRef = useRef(cacheKey);
  const browseItemsRef = useRef<TitleSummary[]>([]);
  const skeletonDelayTimerRef = useRef<number | null>(null);
  const skeletonHideTimerRef = useRef<number | null>(null);
  const skeletonShownAtRef = useRef<number | null>(null);

  const trackedItems = useMemo(
    () =>
      items
        .filter((item) => item.mediaType === "movie")
        .map((item) => ({
          id: item.tmdbId,
          media_type: "movie" as const,
          title: item.title,
          poster_path: item.posterPath,
          backdrop_path: null,
          date: item.meta?.date || null,
          vote_average: null,
          vote_count: null,
          is_completed: item.isCompleted ? true : undefined,
        })),
    [items],
  );

  const fetcher = useMemo(() => {
    if (filter === "completed") return fetchMovieCompleted;
    if (filter === "out-now") return fetchMovieOutNow;
    return fetchMovieUpcoming;
  }, [filter]);

  const loadBrowse = useCallback(
    async (nextPage: number, replace: boolean, requestKey: string = cacheKeyRef.current) => {
      if (!mountedRef.current) return;
      setError(null);
      setLoading(true);
      try {
        const deriveHasMore = (
          page: number,
          totalPages: number,
          rawHasMore: boolean | undefined,
        ) => ({
          fallbackValue: page < totalPages,
          rawValue: typeof rawHasMore === "boolean" ? rawHasMore : null,
        });

        const response = await fetcher(nextPage);
        if (!mountedRef.current || cacheKeyRef.current !== requestKey) return;
        let mergedResults = response.results;
        let mergedPage = response.page;
        let mergedTotalPages = response.total_pages;
        let hasMoreState = deriveHasMore(response.page, response.total_pages, response.has_more);
        if (
          replace &&
          filter === "upcoming" &&
          nextPage === 1 &&
          mergedResults.length < UPCOMING_PREFILL_MIN_ITEMS &&
          (hasMoreState.rawValue ?? hasMoreState.fallbackValue)
        ) {
          const seenIds = new Set<number>(mergedResults.map((item) => item.id));
          const bufferedResults = [...mergedResults];
          let prefillPagesFetched = 1;
          while (
            bufferedResults.length < UPCOMING_PREFILL_MIN_ITEMS &&
            prefillPagesFetched < UPCOMING_PREFILL_MAX_PAGES &&
            (hasMoreState.rawValue ?? hasMoreState.fallbackValue)
          ) {
            const extraResponse = await fetcher(mergedPage + 1);
            if (!mountedRef.current || cacheKeyRef.current !== requestKey) return;
            mergedPage = extraResponse.page;
            mergedTotalPages = extraResponse.total_pages;
            hasMoreState = deriveHasMore(
              extraResponse.page,
              extraResponse.total_pages,
              extraResponse.has_more,
            );
            extraResponse.results.forEach((item) => {
              if (seenIds.has(item.id)) return;
              seenIds.add(item.id);
              bufferedResults.push(item);
            });
            prefillPagesFetched += 1;
          }
          mergedResults = bufferedResults;
        }
        const nextItems = replace ? mergedResults : [...browseItemsRef.current, ...mergedResults];
        browseItemsRef.current = nextItems;
        setBrowseItems(nextItems);
        setBrowsePage(mergedPage);
        setTotalPages(mergedTotalPages);
        setHasMoreOverride(hasMoreState.rawValue);
        setBrowseCache(requestKey, {
          items: nextItems,
          page: mergedPage,
          totalPages: mergedTotalPages,
          hasMore: hasMoreState.rawValue,
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
    [fetcher, filter],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (skeletonDelayTimerRef.current !== null) {
        window.clearTimeout(skeletonDelayTimerRef.current);
        skeletonDelayTimerRef.current = null;
      }
      if (skeletonHideTimerRef.current !== null) {
        window.clearTimeout(skeletonHideTimerRef.current);
        skeletonHideTimerRef.current = null;
      }
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

  const isInitialLoading = loading && browseItems.length === 0;
  const useUpcomingSkeletonDelay = filter === "upcoming";
  useEffect(() => {
    if (!useUpcomingSkeletonDelay) {
      if (skeletonDelayTimerRef.current !== null) {
        window.clearTimeout(skeletonDelayTimerRef.current);
        skeletonDelayTimerRef.current = null;
      }
      if (skeletonHideTimerRef.current !== null) {
        window.clearTimeout(skeletonHideTimerRef.current);
        skeletonHideTimerRef.current = null;
      }
      if (showInitialSkeleton) {
        setShowInitialSkeleton(false);
      }
      skeletonShownAtRef.current = null;
      return;
    }

    if (isInitialLoading) {
      if (skeletonHideTimerRef.current !== null) {
        window.clearTimeout(skeletonHideTimerRef.current);
        skeletonHideTimerRef.current = null;
      }
      if (!showInitialSkeleton && skeletonDelayTimerRef.current === null) {
        skeletonDelayTimerRef.current = window.setTimeout(() => {
          skeletonDelayTimerRef.current = null;
          skeletonShownAtRef.current = Date.now();
          setShowInitialSkeleton(true);
        }, UPCOMING_SKELETON_DELAY_MS);
      }
      return;
    }

    if (skeletonDelayTimerRef.current !== null) {
      window.clearTimeout(skeletonDelayTimerRef.current);
      skeletonDelayTimerRef.current = null;
    }

    if (!showInitialSkeleton) {
      return;
    }

    const shownAt = skeletonShownAtRef.current ?? Date.now();
    const remaining = Math.max(UPCOMING_SKELETON_MIN_MS - (Date.now() - shownAt), 0);
    if (remaining === 0) {
      setShowInitialSkeleton(false);
      skeletonShownAtRef.current = null;
      return;
    }
    if (skeletonHideTimerRef.current === null) {
      skeletonHideTimerRef.current = window.setTimeout(() => {
        skeletonHideTimerRef.current = null;
        setShowInitialSkeleton(false);
        skeletonShownAtRef.current = null;
      }, remaining);
    }
  }, [isInitialLoading, showInitialSkeleton, useUpcomingSkeletonDelay]);

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
  const showBrowseSkeleton = isInitialLoading && (!useUpcomingSkeletonDelay || showInitialSkeleton);
  const showUpcomingLoadingHint = useUpcomingSkeletonDelay && isInitialLoading && !showInitialSkeleton;
  const loadMore = useCallback(() => {
    if (!hasMore || loading || error) return;
    if (import.meta.env.DEV) {
      console.debug("[MoviePage] loadMore", {
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
    <div className="page movie-page">
      <div className="page-hero">
        <SectionHeader title="Movies" subtitle="Browse upcoming releases and what's out now." />
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
          <label className="muted" htmlFor="movie-sort">
            Sort
          </label>
          <select
            id="movie-sort"
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
          <SectionHeader title="My tracked" subtitle="Your saved movie watchlist." />
          <PosterGrid items={trackedItems} mediaType="movie" />
        </>
      ) : (
        <>
          <SectionHeader title="My tracked" />
          <p className="muted">Search and add titles to track.</p>
        </>
      )}

      <SectionHeader title="Browse" subtitle="Browse the latest and upcoming films." />
      {error ? (
        <div className="card">
          <p>{error}</p>
          <button className="button secondary" onClick={() => void loadBrowse(1, true, cacheKey)}>
            Retry
          </button>
        </div>
      ) : null}
      {showBrowseSkeleton ? (
        <GridSkeleton count={8} />
      ) : showUpcomingLoadingHint ? (
        <div className="card">
          <p>Loading upcoming releases...</p>
        </div>
      ) : !error && browseItems.length === 0 ? (
        <div className="card">
          <p>No results.</p>
        </div>
      ) : (
        <PosterGrid items={sortedBrowse} mediaType="movie" />
      )}
      {isRefreshing ? <p className="muted">Updating list...</p> : null}
      <div ref={sentinelRef} style={{ height: 1 }} />
    </div>
  );
};
