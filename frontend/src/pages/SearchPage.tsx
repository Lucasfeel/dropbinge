import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiFetch } from "../api";
import { fetchTrendingAllDay } from "../api/tmdbLists";
import { PosterGridCard } from "../components/PosterGridCard";
import { SectionHeader } from "../components/SectionHeader";
import { addRecentSearch, getRecentSearches } from "../utils/searchHistory";
import type { TitleSummary } from "../types";

export const SearchPage = () => {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState(getRecentSearches());
  const [trendingItems, setTrendingItems] = useState<TitleSummary[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = () => setRecentSearches(getRecentSearches());
    window.addEventListener("storage", handler);
    window.addEventListener("db:recent-searches", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("db:recent-searches", handler);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadTrending = async () => {
      setTrendingLoading(true);
      try {
        const response = await fetchTrendingAllDay(1);
        if (active) {
          setTrendingItems(response.results || []);
        }
      } catch (error) {
        if (active) {
          setTrendingItems([]);
        }
      } finally {
        if (active) {
          setTrendingLoading(false);
        }
      }
    };
    loadTrending();
    return () => {
      active = false;
    };
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
      {query.trim() ? (
        <>
          {loading && <div className="muted">Searching...</div>}
          {!loading && displayResults.length === 0 && (
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
        </>
      ) : (
        <>
          <SectionHeader title="Recent searches" action={<span className="muted">Local</span>} />
          {recentSearches.length === 0 ? (
            <p className="muted">No recent searches yet.</p>
          ) : (
            <div className="poster-grid">
              {recentSearches.map((item) => (
                <PosterGridCard
                  key={item.key}
                  item={{
                    id: item.tmdbId,
                    media_type: item.mediaType,
                    title: item.title,
                    poster_path: item.posterPath,
                    backdrop_path: null,
                    date: item.meta?.date || null,
                    vote_average: null,
                    vote_count: null,
                  }}
                  mediaType={item.mediaType}
                  onSelect={() => setParams({ q: item.title })}
                />
              ))}
            </div>
          )}
          <SectionHeader title="Today's trending" subtitle="What's popular right now." />
          {trendingLoading ? (
            <p className="muted">Loading trending titles...</p>
          ) : (
            <div className="poster-grid">
              {trendingItems.map((item) => {
                const mediaType = item.media_type === "tv" ? "tv" : "movie";
                return (
                  <PosterGridCard
                    key={`${item.media_type}-${item.id}`}
                    item={item}
                    mediaType={mediaType}
                    onSelect={() => {
                      addRecentSearch({
                        key: `${item.media_type}:${item.id}`,
                        mediaType: item.media_type,
                        tmdbId: item.id,
                        title: item.title,
                        posterPath: item.poster_path || null,
                        meta: { date: item.date },
                        addedAt: Date.now(),
                      });
                    }}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
