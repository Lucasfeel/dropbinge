import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ChipFilterRow } from "../components/ChipFilterRow";
import { GridSkeleton } from "../components/GridSkeleton";
import { PosterGrid } from "../components/PosterGrid";
import { SectionHeader } from "../components/SectionHeader";
import { fetchTvPopular } from "../api/tmdbLists";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { followKey, useFollowStore } from "../stores/followStore";
import type { TitleSummary } from "../types";

const FILTERS = [
  { key: "popular", label: "Popular" },
  { key: "top-rated", label: "Top Rated" },
  { key: "tracked", label: "My Tracked" },
];

export const SeriesPage = () => {
  const { items, addFollow, removeFollow, isFollowing } = useFollowStore();
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "popular";
  const sort = params.get("sort") || "popularity";
  const [browseItems, setBrowseItems] = useState<TitleSummary[]>([]);
  const [browsePage, setBrowsePage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        })),
    [series],
  );

  const loadBrowse = useCallback(async (nextPage: number, replace: boolean) => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetchTvPopular(nextPage);
      setBrowsePage(response.page);
      setTotalPages(response.total_pages);
      setBrowseItems((prev) => (replace ? response.results : [...prev, ...response.results]));
    } catch (err) {
      setError("Unable to load browse results. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (filter === "tracked") {
      setBrowseItems(trackedItems);
      setBrowsePage(1);
      setTotalPages(null);
      setError(null);
      return;
    }
    setBrowseItems([]);
    setBrowsePage(1);
    setTotalPages(null);
    setError(null);
    loadBrowse(1, true);
  }, [filter, loadBrowse, trackedItems]);

  useEffect(() => {
    if (filter === "tracked") {
      setBrowseItems(trackedItems);
    }
  }, [filter, trackedItems]);

  const sortedBrowse = useMemo(() => {
    if (filter === "top-rated") {
      return [...browseItems].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    }
    if (sort !== "rating") return browseItems;
    return [...browseItems].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  }, [browseItems, filter, sort]);

  const getFollowState = useCallback(
    (item: TitleSummary) => isFollowing(followKey("tv", item.id)),
    [isFollowing],
  );

  const handleToggleFollow = useCallback(
    async (item: TitleSummary) => {
      const key = followKey("tv", item.id);
      if (isFollowing(key)) {
        await removeFollow(key);
        return;
      }
      await addFollow({ mediaType: "tv", tmdbId: item.id });
    },
    [addFollow, isFollowing, removeFollow],
  );

  const hasMore = filter !== "tracked" && (totalPages ? browsePage < totalPages : true);
  const isLoadingMore = loading && browseItems.length > 0;
  const loadMore = useCallback(() => {
    if (!hasMore || loading || filter === "tracked") return;
    loadBrowse(browsePage + 1, false);
  }, [browsePage, filter, hasMore, loadBrowse, loading]);
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
          </select>
        </div>
      </div>

      {trackedItems.length > 0 ? (
        <>
          <SectionHeader title="My tracked" subtitle="Series you are tracking end-to-end." />
          <PosterGrid
            items={trackedItems}
            mediaType="tv"
            onToggleFollow={handleToggleFollow}
            getFollowState={getFollowState}
          />
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
          <button className="button secondary" onClick={() => loadBrowse(1, true)}>
            Retry
          </button>
        </div>
      ) : null}
      {loading && browseItems.length === 0 ? (
        <GridSkeleton count={8} />
      ) : (
        <PosterGrid
          items={sortedBrowse}
          mediaType="tv"
          onToggleFollow={handleToggleFollow}
          getFollowState={getFollowState}
        />
      )}
      {isLoadingMore ? <GridSkeleton count={4} /> : null}
      <div ref={sentinelRef} style={{ height: 1 }} />
    </div>
  );
};
