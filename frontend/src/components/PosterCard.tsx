import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

const getPosterSources = (path: string | null | undefined) => {
  if (!path) return null;
  return {
    src: `${TMDB_IMAGE_BASE}/w342${path}`,
    srcSet: `${TMDB_IMAGE_BASE}/w185${path} 185w, ${TMDB_IMAGE_BASE}/w342${path} 342w`,
    sizes: "(max-width: 767px) 31vw, (max-width: 1199px) 23vw, 18vw",
  };
};

type PosterCardProps = {
  title: string;
  subtitle?: string;
  posterPath: string | null;
  to?: string;
  action?: ReactNode;
  isCompleted?: boolean;
};

export const PosterCard = ({
  title,
  subtitle,
  posterPath,
  to,
  action,
  isCompleted,
}: PosterCardProps) => {
  const poster = getPosterSources(posterPath);
  return (
    <div className="poster-tile">
      <div className="poster-tile-media">
        {isCompleted ? <div className="poster-completed-badge">COMPLETED</div> : null}
        {to ? (
          <Link to={to} className="poster-tile-link" aria-label={title}>
            {poster ? (
              <img
                src={poster.src}
                srcSet={poster.srcSet}
                sizes={poster.sizes}
                alt={title}
                loading="lazy"
                decoding="async"
                width={342}
                height={513}
              />
            ) : (
              <div className="poster-fallback" />
            )}
          </Link>
        ) : (
          <div className="poster-tile-link" aria-label={title}>
            {poster ? (
              <img
                src={poster.src}
                srcSet={poster.srcSet}
                sizes={poster.sizes}
                alt={title}
                loading="lazy"
                decoding="async"
                width={342}
                height={513}
              />
            ) : (
              <div className="poster-fallback" />
            )}
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
