import type { MouseEvent } from "react";
import { Link } from "react-router-dom";

import type { TitleSummary } from "../types";

const IMG_BASE = "https://image.tmdb.org/t/p/w342";

const getPosterUrl = (path: string | null | undefined) => (path ? `${IMG_BASE}${path}` : null);

type PosterGridCardProps = {
  item: TitleSummary;
  mediaType: "movie" | "tv";
  isFollowed?: boolean;
  onToggleFollow?: (item: TitleSummary) => void;
  onSelect?: (item: TitleSummary) => void;
  showAction?: boolean;
};

const formatMetaDate = (date: string | null) => {
  if (!date) return "TBD";
  return date.slice(0, 4);
};

const formatRating = (voteAverage: number | null) => {
  if (!voteAverage) return null;
  return `${Math.round(voteAverage * 10)}%`;
};

export const PosterGridCard = ({
  item,
  mediaType,
  isFollowed,
  onToggleFollow,
  onSelect,
  showAction = true,
}: PosterGridCardProps) => {
  const posterUrl = getPosterUrl(item.poster_path);
  const rating = formatRating(item.vote_average);
  const metaDate = formatMetaDate(item.date);
  const link = `/title/${mediaType}/${item.id}`;
  const actionEnabled = showAction && Boolean(onToggleFollow);
  const followed = Boolean(isFollowed);

  const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (onToggleFollow) {
      onToggleFollow(item);
    }
  };

  const handleSelect = () => {
    if (onSelect) {
      onSelect(item);
    }
  };

  return (
    <div className="poster-tile">
      <div className="poster-tile-media">
        <Link to={link} className="poster-tile-link" aria-label={item.title} onClick={handleSelect}>
          {posterUrl ? (
            <img src={posterUrl} alt={item.title} loading="lazy" />
          ) : (
            <div className="poster-fallback" />
          )}
        </Link>
      </div>
      <div className="poster-tile-footer">
        <div className="poster-tile-text">
          <Link to={link} className="poster-tile-title" onClick={handleSelect}>
            {item.title}
          </Link>
          <div className="poster-meta">
            <span>{metaDate}</span>
            {rating && <span>{rating}</span>}
          </div>
        </div>
        {actionEnabled ? (
          <button
            type="button"
            className={`tile-action ${followed ? "active" : ""}`}
            onClick={handleToggle}
            aria-label={followed ? "Unfollow" : "Follow"}
          >
            {followed ? "✓" : "+"}
          </button>
        ) : null}
      </div>
    </div>
  );
};
