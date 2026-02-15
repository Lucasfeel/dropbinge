import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchMovieUpcoming, fetchTrendingAllDay } from "../api/tmdbLists";
import { HorizontalRail } from "../components/HorizontalRail";
import { GridSkeleton } from "../components/GridSkeleton";
import { PosterGridCard } from "../components/PosterGridCard";
import { SectionHeader } from "../components/SectionHeader";
import { setBrowseCache } from "../stores/browseCache";
import { useFollowStore } from "../stores/followStore";
import type { TitleSummary } from "../types";
import { getRecentSearches } from "../utils/searchHistory";

const pickTrendingItems = (items: TitleSummary[], limit = 12) => {
  const seen = new Set<string>();
  const filtered: TitleSummary[] = [];
  for (const item of items) {
    const key = `${item.media_type}-${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (item.is_completed) continue;
    filtered.push(item);
    if (filtered.length >= limit) break;
  }
  return filtered;
};

export const HomePage = () => {
  const navigate = useNavigate();
  const { items: followItems } = useFollowStore();
  const [trendItems, setTrendItems] = useState<TitleSummary[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [blockbusterItems, setBlockbusterItems] = useState<TitleSummary[]>([]);
  const [blockbusterLoading, setBlockbusterLoading] = useState(true);
  const [recentSearches, setRecentSearches] = useState(getRecentSearches());

  useEffect(() => {
    let active = true;
    const loadTrending = async () => {
      setTrendLoading(true);
      try {
        const firstPage = await fetchTrendingAllDay(1);
        if (!active) return;
        const firstPass = pickTrendingItems(firstPage.results, 12);
        let finalList = firstPass;

        if (firstPass.length < 12) {
          try {
            const secondPage = await fetchTrendingAllDay(2);
            if (!active) return;
            finalList = pickTrendingItems([...firstPage.results, ...secondPage.results], 12);
          } catch (pageError) {
            finalList = firstPass;
          }
        }

        if (!active) return;
        setTrendItems(finalList);
        setTrendLoading(false);
      } catch (error) {
        if (active) {
          setTrendItems([]);
          setTrendLoading(false);
        }
      }
    };
    loadTrending();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadBlockbusters = async () => {
      setBlockbusterLoading(true);
      try {
        const response = await fetchMovieUpcoming(1);
        if (!active) return;
        setBlockbusterItems(response.results.slice(0, 12));
        setBrowseCache("movie:upcoming:popularity", {
          items: response.results,
          page: response.page,
          totalPages: response.total_pages,
          hasMore: typeof response.has_more === "boolean" ? response.has_more : null,
          updatedAt: Date.now(),
        });
      } catch (error) {
        if (active) {
          setBlockbusterItems([]);
        }
      } finally {
        if (active) {
          setBlockbusterLoading(false);
        }
      }
    };
    loadBlockbusters();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handler = () => setRecentSearches(getRecentSearches());
    window.addEventListener("storage", handler);
    window.addEventListener("db:recent-searches", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("db:recent-searches", handler);
    };
  }, []);

  const recentItems = useMemo<TitleSummary[]>(
    () =>
      recentSearches.map((item) => ({
        id: item.tmdbId,
        media_type: item.mediaType,
        title: item.title,
        poster_path: item.posterPath,
        backdrop_path: null,
        date: item.meta?.date || null,
        vote_average: null,
        vote_count: null,
      })),
    [recentSearches],
  );
  const followSummaries = useMemo<TitleSummary[]>(
    () =>
      followItems.map((item) => ({
        id: item.tmdbId,
        media_type: item.mediaType,
        title: item.title,
        poster_path: item.posterPath,
        backdrop_path: null,
        date: item.meta?.date || null,
        vote_average: null,
        vote_count: null,
        is_completed: item.isCompleted ? true : undefined,
      })),
    [followItems],
  );

  return (
    <div className="page home-page">
      <SectionHeader title="Today’s Trend" subtitle="Top picks to start your night." />
      {trendLoading ? (
        <GridSkeleton count={12} />
      ) : (
        <div className="poster-grid">
          {trendItems.map((item) => {
            const mediaType = item.media_type === "tv" ? "tv" : "movie";
            return (
              <PosterGridCard
                key={`${mediaType}-${item.id}`}
                item={item}
                mediaType={mediaType}
              />
            );
          })}
        </div>
      )}

      <SectionHeader title="Quick Actions" />
      <div className="quick-actions">
        <button className="quick-card" onClick={() => navigate("/movie?filter=upcoming")}>
          <span>Upcoming &amp; Schedule</span>
          <span className="muted">Plan what’s next</span>
        </button>
        <button
          className="quick-card"
          onClick={() => navigate("/movie?filter=out-now&sort=latest")}
        >
          <span>Out Now</span>
          <span className="muted">See what’s just released</span>
        </button>
      </div>

      <SectionHeader title="Recently searched" action={<span className="muted">Local</span>} />
      {recentSearches.length === 0 ? (
        <p className="muted">Search for a title to build your history.</p>
      ) : (
        <HorizontalRail>
          {recentItems.map((item) => (
            <PosterGridCard
              key={`${item.media_type}-${item.id}`}
              item={item}
              mediaType={item.media_type}
            />
          ))}
        </HorizontalRail>
      )}

      <SectionHeader title="My follows" />
      {followItems.length === 0 ? (
        <p className="muted">No follows yet. Tap a title to start tracking.</p>
      ) : (
        <HorizontalRail>
          {followSummaries.slice(0, 12).map((item) => (
            <PosterGridCard
              key={`${item.media_type}-${item.id}`}
              item={item}
              mediaType={item.media_type}
            />
          ))}
        </HorizontalRail>
      )}

      <SectionHeader title="Blockbuster" subtitle="Upcoming hits with high popularity." />
      {blockbusterLoading ? (
        <GridSkeleton count={12} />
      ) : (
        <HorizontalRail>
          {blockbusterItems.map((item) => (
            <PosterGridCard
              key={`movie-${item.id}`}
              item={item}
              mediaType="movie"
            />
          ))}
        </HorizontalRail>
      )}
    </div>
  );
};
