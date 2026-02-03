import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ChipFilterRow } from "../components/ChipFilterRow";
import { GridSkeleton } from "../components/GridSkeleton";
import { PosterGrid } from "../components/PosterGrid";
import { SectionHeader } from "../components/SectionHeader";
import { fetchMovieCompleted, fetchMovieOutNow, fetchMovieUpcoming } from "../api/tmdbLists";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { useFollowStore } from "../stores/followStore";
import type { TitleSummary } from "../types";

const FILTERS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "out-now", label: "Out Now" },
  { key: "completed", label: "Completed" },
];
const DEFAULT_FILTER = "upcoming";
const FILTER_KEYS = new Set(FILTERS.map((item) => item.key));

export const MoviePage = () => {
  const { items } = useFollowStore();
  const [params, setParams] = useSearchParams();
  const rawFilter = params.get("filter");
  const filter = rawFilter && FILTER_KEYS.has(rawFilter) ? rawFilter : DEFAULT_FILTER;
  const sort = params.get("sort") || "popularity";
  const [browseItems, setBrowseItems] = useState<TitleSummary[]>([]);
  const [browsePage, setBrowsePage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    async (nextPage: number, replace: boolean) => {
      setError(null);
      setLoading(true);
      try {
        const response = await fetcher(nextPage);
        setBrowsePage(response.page);
        setTotalPages(response.total_pages);
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const windowStart = new Date(todayMidnight);
        windowStart.setDate(windowStart.getDate() - 60);
        const results =
          filter === "out-now"
            ? response.results.filter((item) => {
                const ts = Date.parse(item.date ?? "");
                return (
                  Number.isFinite(ts) &&
                  ts >= windowStart.getTime() &&
                  ts <= todayMidnight.getTime()
                );
              })
            : response.results;
        setBrowseItems((prev) => (replace ? results : [...prev, ...results]));
      } catch (err) {
        setError("Unable to load browse results. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [fetcher, filter],
  );

  useEffect(() => {
    if (rawFilter && rawFilter !== filter) {
      setParams({ filter: DEFAULT_FILTER, sort }, { replace: true });
    }
  }, [filter, rawFilter, setParams, sort]);

  useEffect(() => {
    setBrowseItems([]);
    setBrowsePage(1);
    setTotalPages(null);
    setError(null);
    loadBrowse(1, true);
  }, [filter, loadBrowse]);

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

  const hasMore = !error && (totalPages ? browsePage < totalPages : true);
  const isLoadingMore = loading && browseItems.length > 0;
  const loadMore = useCallback(() => {
    if (!hasMore || loading || error) return;
    loadBrowse(browsePage + 1, false);
  }, [browsePage, error, hasMore, loadBrowse, loading]);
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
          <button className="button secondary" onClick={() => loadBrowse(1, true)}>
            Retry
          </button>
        </div>
      ) : null}
      {loading && browseItems.length === 0 ? (
        <GridSkeleton count={8} />
      ) : (
        <PosterGrid items={sortedBrowse} mediaType="movie" />
      )}
      {isLoadingMore ? <GridSkeleton count={4} /> : null}
      <div ref={sentinelRef} style={{ height: 1 }} />
    </div>
  );
};
