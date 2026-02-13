import { memo } from "react";
import { Link } from "react-router-dom";

import type { TitleSummary } from "../types";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

const getPosterSources = (path: string | null | undefined) => {
  if (!path) return null;
  return {
    src: `${TMDB_IMAGE_BASE}/w342${path}`,
    srcSet: `${TMDB_IMAGE_BASE}/w185${path} 185w, ${TMDB_IMAGE_BASE}/w342${path} 342w`,
    sizes: "(max-width: 767px) 31vw, (max-width: 1199px) 23vw, 18vw",
  };
};

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

export const PosterGridCard = memo(({
  item,
  mediaType,
  onSelect,
}: PosterGridCardProps) => {
  const poster = getPosterSources(item.poster_path);
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
        {poster ? (
          <img
            src={poster.src}
            srcSet={poster.srcSet}
            sizes={poster.sizes}
            alt={item.title}
            loading="lazy"
            decoding="async"
            width={342}
            height={513}
          />
        ) : (
          <div className="poster-fallback" />
        )}
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
});
