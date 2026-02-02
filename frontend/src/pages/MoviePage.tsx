import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ChipFilterRow } from "../components/ChipFilterRow";
import { HorizontalRail } from "../components/HorizontalRail";
import { PosterCard } from "../components/PosterCard";
import { SectionHeader } from "../components/SectionHeader";
import { useFollowStore } from "../stores/followStore";

const FILTERS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "tbd", label: "TBD" },
  { key: "now", label: "Now" },
  { key: "all", label: "All" },
];

export const MoviePage = () => {
  const { items } = useFollowStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "upcoming";

  const movies = items.filter((item) => item.mediaType === "movie");
  const filtered = useMemo(() => {
    const today = new Date();
    if (filter === "tbd") {
      return movies.filter((item) => !item.meta?.date);
    }
    if (filter === "upcoming") {
      return movies.filter((item) => item.meta?.date && new Date(item.meta.date) >= today);
    }
    if (filter === "now") {
      return movies.filter((item) => item.meta?.date && new Date(item.meta.date) <= today);
    }
    return movies;
  }, [filter, movies]);

  return (
    <div className="page">
      <SectionHeader title="Movies" subtitle="Track upcoming films and release changes." />
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
          <h3>Discover movies</h3>
          <p className="muted">Search for titles and follow to build your schedule.</p>
        </div>
        <button className="button" onClick={() => navigate("/")}>Search now</button>
      </div>

      <SectionHeader title="Your picks" />
      {filtered.length === 0 ? (
        <p className="muted">No movies yet for this filter.</p>
      ) : (
        <HorizontalRail>
          {filtered.map((item) => (
            <PosterCard
              key={item.key}
              title={item.title}
              subtitle={item.meta?.date || "TBD"}
              posterPath={item.posterPath}
              to={`/title/movie/${item.tmdbId}`}
            />
          ))}
        </HorizontalRail>
      )}

      <SectionHeader title="Upcoming & schedule" subtitle="Curated placeholders until discovery feeds ship." />
      <HorizontalRail>
        {[1, 2, 3].map((index) => (
          <div key={index} className="tbd-card">
            <div className="tbd-bar" />
            <div className="muted">Add a title to fill this rail</div>
          </div>
        ))}
      </HorizontalRail>
    </div>
  );
};
