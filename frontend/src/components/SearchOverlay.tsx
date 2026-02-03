import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "../api";
import { PosterGridCard } from "./PosterGridCard";
import { addRecentSearch } from "../utils/searchHistory";
import type { TitleSummary } from "../types";

type SearchOverlayProps = {
  open: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
};

export const SearchOverlay = ({ open, query, onQueryChange, onClose }: SearchOverlayProps) => {
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

  const displayResults = useMemo<TitleSummary[]>(
    () =>
      results
        .filter((result) => result.media_type === "movie" || result.media_type === "tv")
        .map((result) => ({
          id: result.id,
          media_type: result.media_type,
          title: result.title || result.name || `TMDB ${result.id}`,
          poster_path: result.poster_path || null,
          backdrop_path: null,
          date: result.release_date || result.first_air_date || null,
          vote_average: result.vote_average ?? null,
          vote_count: result.vote_count ?? null,
        })),
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
        <div className="search-results poster-grid">
          {displayResults.map((result) => {
            const mediaType = result.media_type === "tv" ? "tv" : "movie";
            return (
              <PosterGridCard
                key={`${result.media_type}-${result.id}`}
                item={result}
                mediaType={mediaType}
                onSelect={() => {
                  addRecentSearch({
                    key: `${result.media_type}:${result.id}`,
                    mediaType: result.media_type,
                    tmdbId: result.id,
                    title: result.title,
                    posterPath: result.poster_path || null,
                    meta: { date: result.date },
                    addedAt: Date.now(),
                  });
                  onClose();
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
