import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchTrendingAllDay } from "../api/tmdbLists";
import { HorizontalRail } from "../components/HorizontalRail";
import { GridSkeleton } from "../components/GridSkeleton";
import { PosterGridCard } from "../components/PosterGridCard";
import { SectionHeader } from "../components/SectionHeader";
import { followKey, useFollowStore } from "../stores/followStore";
import type { TitleSummary } from "../types";
import { getRecentSearches } from "../utils/searchHistory";

export const HomePage = () => {
  const navigate = useNavigate();
  const { items: followItems, addFollow, removeFollow, isFollowing } = useFollowStore();
  const [trendItems, setTrendItems] = useState<TitleSummary[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [recentSearches, setRecentSearches] = useState(getRecentSearches());

  useEffect(() => {
    let active = true;
    const loadTrending = async () => {
      setTrendLoading(true);
      try {
        const response = await fetchTrendingAllDay(1);
        if (!active) return;
        setTrendItems(response.results.slice(0, 12));
      } catch (error) {
        if (active) {
          setTrendItems([]);
        }
      } finally {
        if (active) {
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
    const handler = () => setRecentSearches(getRecentSearches());
    window.addEventListener("storage", handler);
    window.addEventListener("db:recent-searches", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("db:recent-searches", handler);
    };
  }, []);

  const trendList = useMemo(() => trendItems.slice(0, 12), [trendItems]);
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
      })),
    [followItems],
  );

  const getFollowState = useCallback(
    (id: number, mediaType: "movie" | "tv") => isFollowing(followKey(mediaType, id)),
    [isFollowing],
  );

  const handleToggleFollow = useCallback(
    async (item: TitleSummary, mediaType: "movie" | "tv") => {
      const key = followKey(mediaType, item.id);
      if (isFollowing(key)) {
        await removeFollow(key);
        return;
      }
      await addFollow({ mediaType, tmdbId: item.id });
    },
    [addFollow, isFollowing, removeFollow],
  );

  return (
    <div className="page home-page">
      <SectionHeader title="Today’s Trend" subtitle="Top picks to start your night." />
      {trendLoading ? (
        <GridSkeleton count={12} />
      ) : (
        <div className="poster-grid">
          {trendList.map((item) => {
            const mediaType = item.media_type === "tv" ? "tv" : "movie";
            return (
              <PosterGridCard
                key={`${mediaType}-${item.id}`}
                item={item}
                mediaType={mediaType}
                isFollowed={getFollowState(item.id, mediaType)}
                onToggleFollow={(target) => handleToggleFollow(target, mediaType)}
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
        <button className="quick-card" onClick={() => navigate("/movie?filter=tbd")}>
          <span>TBD Watch</span>
          <span className="muted">Track missing dates</span>
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
              isFollowed={getFollowState(item.id, item.media_type)}
              onToggleFollow={(target) => handleToggleFollow(target, item.media_type)}
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
              isFollowed={getFollowState(item.id, item.media_type)}
              onToggleFollow={(target) => handleToggleFollow(target, item.media_type)}
            />
          ))}
        </HorizontalRail>
      )}

      <SectionHeader title="TBD updates" subtitle="Placeholder until backend feeds arrive." />
      <HorizontalRail>
        {[1, 2, 3].map((index) => (
          <div key={index} className="tbd-card">
            <div className="tbd-bar" />
            <div className="muted">Coming soon</div>
          </div>
        ))}
      </HorizontalRail>
    </div>
  );
};
