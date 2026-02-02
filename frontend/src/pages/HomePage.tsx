import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../api";
import { HorizontalRail } from "../components/HorizontalRail";
import { PosterCard } from "../components/PosterCard";
import { SectionHeader } from "../components/SectionHeader";
import { useFollowStore } from "../stores/followStore";
import { getRecentSearches } from "../utils/searchHistory";

const TRENDING_SEEDS = [
  { mediaType: "movie" as const, tmdbId: 603 },
  { mediaType: "movie" as const, tmdbId: 27205 },
  { mediaType: "tv" as const, tmdbId: 1399 },
];

export const HomePage = () => {
  const navigate = useNavigate();
  const { items: followItems } = useFollowStore();
  const [trendItems, setTrendItems] = useState<any[]>([]);
  const [recentSearches, setRecentSearches] = useState(getRecentSearches());

  useEffect(() => {
    let active = true;
    const loadTrending = async () => {
      try {
        const data = await Promise.all(
          TRENDING_SEEDS.map((seed) =>
            apiFetch<any>(`/api/tmdb/${seed.mediaType}/${seed.tmdbId}`),
          ),
        );
        if (active) {
          setTrendItems(data.map((item, index) => ({ ...item, mediaType: TRENDING_SEEDS[index].mediaType })));
        }
      } catch (error) {
        if (active) {
          setTrendItems([]);
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

  return (
    <div className="page">
      <SectionHeader title="Today’s Trend" subtitle="Top picks to start your night." />
      <div className="trend-grid">
        {trendItems.length === 0
          ? TRENDING_SEEDS.map((seed) => (
              <div key={`${seed.mediaType}-${seed.tmdbId}`} className="trend-placeholder" />
            ))
          : trendItems.map((item) => (
              <PosterCard
                key={item.id}
                title={item.title || item.name}
                subtitle={item.release_date || item.first_air_date || "TBD"}
                posterPath={item.poster_path}
                to={`/title/${item.mediaType}/${item.id}`}
              />
            ))}
      </div>

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
          {recentSearches.map((item) => (
            <PosterCard
              key={item.key}
              title={item.title}
              subtitle={item.meta?.date || "TBD"}
              posterPath={item.posterPath}
              to={`/title/${item.mediaType}/${item.tmdbId}`}
            />
          ))}
        </HorizontalRail>
      )}

      <SectionHeader title="My follows" />
      {followItems.length === 0 ? (
        <p className="muted">No follows yet. Tap a title to start tracking.</p>
      ) : (
        <HorizontalRail>
          {followItems.slice(0, 12).map((item) => (
            <PosterCard
              key={item.key}
              title={item.title}
              subtitle={item.meta?.date || "TBD"}
              posterPath={item.posterPath}
              to={`/title/${item.mediaType}/${item.tmdbId}`}
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
