import { Link } from "react-router-dom";

import type { TitleSummary } from "../types";

const IMG_BASE = "https://image.tmdb.org/t/p/w342";

const getPosterUrl = (path: string | null | undefined) => (path ? `${IMG_BASE}${path}` : null);

type PosterGridCardProps = {
  item: TitleSummary;
  mediaType: "movie" | "tv";
  onSelect?: (item: TitleSummary) => void;
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
  onSelect,
}: PosterGridCardProps) => {
  const posterUrl = getPosterUrl(item.poster_path);
  const rating = formatRating(item.vote_average);
  const metaDate = formatMetaDate(item.date);
  const isSeason = mediaType === "tv" && typeof item.season_number === "number";
  const link = isSeason
    ? `/title/tv/${item.series_id ?? item.id}/season/${item.season_number}`
    : `/title/${mediaType}/${item.id}`;
  const seasonLabel = isSeason ? `S${item.season_number}` : null;
  const metaItems = [seasonLabel, metaDate, rating].filter(Boolean) as string[];

  const handleSelect = () => {
    if (onSelect) {
      onSelect(item);
    }
  };

  return (
    <Link
      to={link}
      className="poster-tile poster-tile-interactive"
      aria-label={item.title}
      onClick={handleSelect}
    >
      <div className="poster-tile-media">
        {item.is_completed ? <span className="poster-completed-badge">COMPLETED</span> : null}
        {posterUrl ? <img src={posterUrl} alt={item.title} loading="lazy" /> : <div className="poster-fallback" />}
        <span className="poster-tile-hint">View details</span>
      </div>
      <div className="poster-tile-footer">
        <div className="poster-tile-text">
          <div className="poster-tile-title">{item.title}</div>
          <div className="poster-meta">
            {metaItems.map((value) => (
              <span key={value}>{value}</span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
};
