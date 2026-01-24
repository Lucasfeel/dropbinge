import { useState } from "react";

import { ChipRow } from "../components/ChipRow";
import { FollowCard } from "../components/FollowCard";
import { useFollows } from "../hooks/useFollows";

export const TvPage = () => {
  const { follows } = useFollows();
  const [filter, setFilter] = useState("upcoming");
  const today = new Date();
  const seasons = follows.filter((follow) => follow.target_type === "tv_season");

  const filtered = seasons.filter((follow) => {
    const date = follow.season_air_date ? new Date(follow.season_air_date) : null;
    if (filter === "tbd") return !date;
    if (filter === "upcoming") return date && date >= today;
    if (filter === "airing") {
      const last = follow.season_last_episode_air_date
        ? new Date(follow.season_last_episode_air_date)
        : null;
      return date && last && date <= today && last >= today;
    }
    return true;
  });

  return (
    <div className="page">
      <ChipRow>
        {[
          ["upcoming", "Upcoming Seasons"],
          ["tbd", "TBD Seasons"],
          ["airing", "Airing Now"],
          ["all", "All"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`chip ${filter === key ? "active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </ChipRow>
      {filtered.map((follow) => (
        <FollowCard
          key={follow.id}
          follow={follow}
          subtitle={`Season ${follow.season_number} · ${follow.season_air_date || "TBD"}`}
        />
      ))}
    </div>
  );
};
