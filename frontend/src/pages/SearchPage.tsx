import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiFetch } from "../api";
import { PosterGridCard } from "../components/PosterGridCard";
import { SectionHeader } from "../components/SectionHeader";
import { addRecentSearch } from "../utils/searchHistory";
import type { TitleSummary } from "../types";

export const SearchPage = () => {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
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
  }, [query]);

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

  return (
    <div className="page search-page">
      <SectionHeader title="Search" subtitle="Find movies, TV, and series details." />
      <div className="search-input-row">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            if (next) {
              setParams({ q: next });
            } else {
              setParams({});
            }
          }}
          placeholder="Search movies, TV, series"
          aria-label="Search"
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
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
