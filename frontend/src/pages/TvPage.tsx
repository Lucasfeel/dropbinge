import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ChipFilterRow } from "../components/ChipFilterRow";
import { HorizontalRail } from "../components/HorizontalRail";
import { PosterCard } from "../components/PosterCard";
import { SectionHeader } from "../components/SectionHeader";
import { useFollowStore } from "../stores/followStore";

const FILTERS = [
  { key: "upcoming", label: "Upcoming Seasons" },
  { key: "tbd", label: "TBD" },
  { key: "airing", label: "Airing" },
  { key: "all", label: "All" },
];

export const TvPage = () => {
  const { items } = useFollowStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "upcoming";

  const tvItems = items.filter((item) => item.mediaType === "tv");
  const filtered = useMemo(() => {
    const today = new Date();
    if (filter === "tbd") {
      return tvItems.filter((item) => !item.meta?.date);
    }
    if (filter === "upcoming") {
      return tvItems.filter((item) => item.meta?.date && new Date(item.meta.date) >= today);
    }
    if (filter === "airing") {
      return tvItems.filter((item) => item.meta?.date && new Date(item.meta.date) <= today);
    }
    return tvItems;
  }, [filter, tvItems]);

  return (
    <div className="page">
      <SectionHeader title="TV" subtitle="Track upcoming seasons and air dates." />
      <ChipFilterRow>
        {FILTERS.map((item) => (
          <button
            key={item.key}
            className={`chip ${filter === item.key ? "active" : ""}`}
            onClick={() => setParams({ filter: item.key })}
          >
            {item.label}
          </button>
        ))}
      </ChipFilterRow>

      <div className="discovery-card">
        <div>
          <h3>Discover TV</h3>
          <p className="muted">Search for series and follow seasons or full runs.</p>
        </div>
        <button className="button" onClick={() => navigate("/")}>Search now</button>
      </div>

      <SectionHeader title="Your TV list" />
      {filtered.length === 0 ? (
        <p className="muted">No TV follows yet. Add one from search.</p>
      ) : (
        <HorizontalRail>
          {filtered.map((item) => (
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

      <SectionHeader title="Airing now" subtitle="Stay ready for the next episode." />
      <HorizontalRail>
        {[1, 2].map((index) => (
          <div key={index} className="tbd-card">
            <div className="tbd-bar" />
            <div className="muted">Add a series to populate</div>
          </div>
        ))}
      </HorizontalRail>
    </div>
  );
};
