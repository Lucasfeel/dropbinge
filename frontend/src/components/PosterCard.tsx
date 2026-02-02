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
  const content = (
    <>
      <div className="poster-wrapper">
        {getPosterUrl(posterPath) ? (
          <img src={getPosterUrl(posterPath) as string} alt={title} />
        ) : (
          <div className="poster-fallback" />
        )}
      </div>
      <div className="poster-info">
        <div className="poster-title">{title}</div>
        {subtitle && <div className="muted">{subtitle}</div>}
        {action && <div className="poster-action">{action}</div>}
      </div>
    </>
  );

  if (to) {
    return (
      <Link className="poster-card" to={to}>
        {content}
      </Link>
    );
  }
  return <div className="poster-card">{content}</div>;
};
