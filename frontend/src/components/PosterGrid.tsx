import type { TitleSummary } from "../types";
import { PosterGridCard } from "./PosterGridCard";

type PosterGridProps = {
  items: TitleSummary[];
  mediaType: "movie" | "tv";
  onToggleFollow: (item: TitleSummary) => void;
  getFollowState: (item: TitleSummary) => boolean;
};

export const PosterGrid = ({ items, mediaType, onToggleFollow, getFollowState }: PosterGridProps) => (
  <div className="poster-grid">
    {items.map((item) => (
      <PosterGridCard
        key={`${mediaType}-${item.id}`}
        item={item}
        mediaType={mediaType}
        isFollowed={getFollowState(item)}
        onToggleFollow={onToggleFollow}
      />
    ))}
  </div>
);
