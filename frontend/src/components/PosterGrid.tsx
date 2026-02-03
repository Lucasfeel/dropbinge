import type { TitleSummary } from "../types";
import { PosterGridCard } from "./PosterGridCard";

type PosterGridProps = {
  items: TitleSummary[];
  mediaType: "movie" | "tv";
};

export const PosterGrid = ({ items, mediaType }: PosterGridProps) => (
  <div className="poster-grid">
    {items.map((item) => (
      <PosterGridCard
        key={`${mediaType}-${item.id}`}
        item={item}
        mediaType={mediaType}
      />
    ))}
  </div>
);
