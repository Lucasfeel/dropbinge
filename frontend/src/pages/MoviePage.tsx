import { useState } from "react";

import { ChipRow } from "../components/ChipRow";
import { FollowCard } from "../components/FollowCard";
import { useFollows } from "../hooks/useFollows";

export const MoviePage = () => {
  const { follows } = useFollows();
  const [filter, setFilter] = useState("upcoming");
  const today = new Date();

  const movies = follows.filter((follow) => follow.target_type === "movie");

  const filtered = movies.filter((follow) => {
    const date = follow.release_date ? new Date(follow.release_date) : null;
    if (filter === "tbd") return !date;
    if (filter === "upcoming") return date && date >= today;
    if (filter === "now") return date && date <= today;
    return true;
  });

  return (
    <div className="page">
      <ChipRow>
        {["upcoming", "tbd", "now", "all"].map((key) => (
          <button
            key={key}
            className={`chip ${filter === key ? "active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {key.toUpperCase()}
          </button>
        ))}
      </ChipRow>
      {filtered.map((follow) => (
        <FollowCard
          key={follow.id}
          follow={follow}
          subtitle={follow.release_date || "TBD"}
        />
      ))}
    </div>
  );
};
