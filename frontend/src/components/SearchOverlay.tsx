import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../api";
import { addRecentSearch } from "../utils/searchHistory";

const IMG_BASE = "https://image.tmdb.org/t/p/w185";

const getPosterUrl = (path: string | null | undefined) =>
  path ? `${IMG_BASE}${path}` : null;

type SearchOverlayProps = {
  open: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
};

export const SearchOverlay = ({ open, query, onQueryChange, onClose }: SearchOverlayProps) => {
  const navigate = useNavigate();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiFetch<any>(`/api/tmdb/search?q=${encodeURIComponent(query)}`);
        setResults(data.results || []);
      } catch (error) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const displayResults = useMemo(
    () => results.filter((result) => result.media_type === "movie" || result.media_type === "tv"),
    [results],
  );

  if (!open) return null;

  return (
    <div className="search-overlay">
      <button className="search-backdrop" onClick={onClose} aria-label="Close search" />
      <div className="search-panel">
        <div className="search-panel-header">
          <h3>Search</h3>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="search-input-row">
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search for a title"
          />
        </div>
        {loading && <div className="muted">Searching...</div>}
        {!loading && displayResults.length === 0 && query.trim() && (
          <div className="muted">No results yet.</div>
        )}
        <div className="search-results">
          {displayResults.map((result) => {
            const title = result.title || result.name;
            const date = result.release_date || result.first_air_date || null;
            const posterUrl = getPosterUrl(result.poster_path);
            return (
              <button
                key={`${result.media_type}-${result.id}`}
                className="search-result"
                onClick={() => {
                  addRecentSearch({
                    key: `${result.media_type}:${result.id}`,
                    mediaType: result.media_type,
                    tmdbId: result.id,
                    title: title || `TMDB ${result.id}`,
                    posterPath: result.poster_path || null,
                    meta: { date },
                    addedAt: Date.now(),
                  });
                  navigate(`/title/${result.media_type}/${result.id}`);
                  onClose();
                }}
              >
                <div className="result-poster">
                  {posterUrl ? (
                    <img src={posterUrl} alt={title} />
                  ) : (
                    <div className="poster-fallback" />
                  )}
                </div>
                <div className="result-meta">
                  <div className="result-title">{title}</div>
                  <div className="muted">{date || "TBD"}</div>
                </div>
                <span className="result-tag">{result.media_type === "movie" ? "Movie" : "TV"}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
