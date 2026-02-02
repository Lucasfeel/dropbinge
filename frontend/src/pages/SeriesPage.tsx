import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { HorizontalRail } from "../components/HorizontalRail";
import { PosterCard } from "../components/PosterCard";
import { SectionHeader } from "../components/SectionHeader";
import { useFollowStore } from "../stores/followStore";

export const SeriesPage = () => {
  const { items } = useFollowStore();
  const navigate = useNavigate();

  const series = useMemo(
    () => items.filter((item) => item.mediaType === "tv" && item.targetType === "tv_full"),
    [items],
  );

  return (
    <div className="page">
      <SectionHeader
        title="Series"
        subtitle="Full-run tracking for entire shows. Track when they conclude and key changes."
      />
      <div className="discovery-card">
        <div>
          <h3>Find a series</h3>
          <p className="muted">Search for a show to start tracking its full run.</p>
        </div>
        <button className="button" onClick={() => navigate("/")}>Search now</button>
      </div>

      <SectionHeader title="Tracked series" />
      {series.length === 0 ? (
        <p className="muted">No series tracked yet.</p>
      ) : (
        <HorizontalRail>
          {series.map((item) => (
            <PosterCard
              key={item.key}
              title={item.title}
              subtitle={item.meta?.date || "TBD"}
              posterPath={item.posterPath}
              to={`/title/tv/${item.tmdbId}`}
            />
          ))}
        </HorizontalRail>
      )}
    </div>
  );
};
