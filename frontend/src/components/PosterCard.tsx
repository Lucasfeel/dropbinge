import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const IMG_BASE = "https://image.tmdb.org/t/p/w342";

const getPosterUrl = (path: string | null | undefined) => (path ? `${IMG_BASE}${path}` : null);

type PosterCardProps = {
  title: string;
  subtitle?: string;
  posterPath: string | null;
  to?: string;
  action?: ReactNode;
};

export const PosterCard = ({ title, subtitle, posterPath, to, action }: PosterCardProps) => {
  const posterUrl = getPosterUrl(posterPath);
  return (
    <div className="poster-tile">
      <div className="poster-tile-media">
        {to ? (
          <Link to={to} className="poster-tile-link" aria-label={title}>
            {posterUrl ? (
              <img src={posterUrl} alt={title} />
            ) : (
              <div className="poster-fallback" />
            )}
          </Link>
        ) : (
          <div className="poster-tile-link" aria-label={title}>
            {posterUrl ? <img src={posterUrl} alt={title} /> : <div className="poster-fallback" />}
          </div>
        )}
      </div>
      <div className="poster-tile-footer">
        <div className="poster-tile-text">
          {to ? (
            <Link to={to} className="poster-tile-title">
              {title}
            </Link>
          ) : (
            <div className="poster-tile-title">{title}</div>
          )}
          {subtitle && (
            <div className="poster-meta">
              <span>{subtitle}</span>
            </div>
          )}
          {action && <div className="poster-tile-extra">{action}</div>}
        </div>
      </div>
    </div>
  );
};
