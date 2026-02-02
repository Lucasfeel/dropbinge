import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ChipFilterRow } from "../components/ChipFilterRow";
import { GridSkeleton } from "../components/GridSkeleton";
import { PosterGrid } from "../components/PosterGrid";
import { SectionHeader } from "../components/SectionHeader";
import { fetchMoviePopular, fetchMovieUpcoming } from "../api/tmdbLists";
import { followKey, useFollowStore } from "../stores/followStore";
import type { TitleSummary } from "../types";

const FILTERS = [
  { key: "popular", label: "Popular" },
  { key: "upcoming", label: "Upcoming" },
  { key: "tracked", label: "My Tracked" },
];

export const MoviePage = () => {
  const { items, addFollow, removeFollow, isFollowing } = useFollowStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "popular";
  const sort = params.get("sort") || "popularity";
  const [browseItems, setBrowseItems] = useState<TitleSummary[]>([]);
  const [browsePage, setBrowsePage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
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
        })),
    [items],
  );

  const fetcher = useMemo(() => {
    if (filter === "upcoming") return fetchMovieUpcoming;
    return fetchMoviePopular;
  }, [filter]);

  const loadBrowse = useCallback(
    async (nextPage: number, replace: boolean) => {
      setError(null);
      setLoading(true);
      try {
        const response = await fetcher(nextPage);
        setBrowsePage(response.page);
        setTotalPages(response.total_pages);
        setBrowseItems((prev) => (replace ? response.results : [...prev, ...response.results]));
      } catch (err) {
        setError("Unable to load browse results. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [fetcher],
  );

  useEffect(() => {
    if (filter === "tracked") {
      setBrowseItems(trackedItems);
      setBrowsePage(1);
      setTotalPages(1);
      setError(null);
      return;
    }
    loadBrowse(1, true);
  }, [filter, loadBrowse, trackedItems]);

  useEffect(() => {
    if (filter === "tracked") {
      setBrowseItems(trackedItems);
    }
  }, [filter, trackedItems]);

  const sortedBrowse = useMemo(() => {
    if (sort !== "rating") return browseItems;
    return [...browseItems].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  }, [browseItems, sort]);

  const getFollowState = useCallback(
    (item: TitleSummary) => isFollowing(followKey("movie", item.id)),
    [isFollowing],
  );

  const handleToggleFollow = useCallback(
    async (item: TitleSummary) => {
      const key = followKey("movie", item.id);
      if (isFollowing(key)) {
        await removeFollow(key);
        return;
      }
      await addFollow({ mediaType: "movie", tmdbId: item.id });
    },
    [addFollow, isFollowing, removeFollow],
  );

  const canLoadMore = filter !== "tracked" && browsePage < totalPages;

  return (
    <div className="page">
      <div className="page-hero">
        <SectionHeader title="Movies" subtitle="Track upcoming films and release changes." />
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
          </select>
        </div>
      </div>

      <div className="discovery-card">
        <div>
          <h3>Discover movies</h3>
          <p className="muted">Search for titles and follow to build your schedule.</p>
        </div>
        <button className="button" onClick={() => navigate("/")}>
          Search now
        </button>
      </div>

      {trackedItems.length > 0 ? (
        <>
          <SectionHeader title="My tracked" subtitle="Your saved movie watchlist." />
          <PosterGrid
            items={trackedItems}
            mediaType="movie"
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
        <PosterGrid
          items={sortedBrowse}
          mediaType="movie"
          onToggleFollow={handleToggleFollow}
          getFollowState={getFollowState}
        />
      )}
      {canLoadMore && (
        <div className="load-more">
          <button className="button secondary" onClick={() => loadBrowse(browsePage + 1, false)}>
            Load more
          </button>
        </div>
      )}
    </div>
  );
};
