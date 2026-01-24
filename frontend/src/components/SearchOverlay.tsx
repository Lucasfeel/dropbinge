import { useEffect, useState } from "react";

import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useFollows } from "../hooks/useFollows";
import type { Follow } from "../types";
import type { FollowPayload } from "../types";
import { FollowModal } from "./FollowModal";

type SearchOverlayProps = {
  open: boolean;
  onClose: () => void;
  onFollowCreated: () => void;
};

export const SearchOverlay = ({ open, onClose, onFollowCreated }: SearchOverlayProps) => {
  const { isAuthenticated } = useAuth();
  const { follows } = useFollows();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [followPayload, setFollowPayload] = useState<FollowPayload | null>(null);
  const [existingFollow, setExistingFollow] = useState<Follow | undefined>(undefined);

  const runSearch = async () => {
    if (!query.trim()) return;
    try {
      const data = await apiFetch<any>(`/api/tmdb/search?q=${encodeURIComponent(query)}`);
      setResults(data.results || []);
    } catch (error) {
      setResults([]);
    }
  };

  const loadDetail = async (item: any) => {
    setSelected(item);
    try {
      if (item.media_type === "movie") {
        const data = await apiFetch<any>(`/api/tmdb/movie/${item.id}`);
        setDetail(data);
      } else if (item.media_type === "tv") {
        const data = await apiFetch<any>(`/api/tmdb/tv/${item.id}`);
        setDetail(data);
      }
    } catch (error) {
      setDetail(null);
    }
  };

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(null);
      setDetail(null);
      setFollowPayload(null);
      setExistingFollow(undefined);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Global Search</h3>
        {!isAuthenticated ? (
          <p className="muted">Log in to search TMDB and follow titles.</p>
        ) : (
          <>
            <div className="field">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search TMDB..."
                style={{ flex: 1, marginRight: 8 }}
              />
              <button className="button secondary" onClick={runSearch}>
                Search
              </button>
            </div>
            {!selected && (
              <ul className="list">
                {results.map((result) => (
                  <li key={`${result.media_type}-${result.id}`}>
                    <button className="button secondary" onClick={() => loadDetail(result)}>
                      {result.title || result.name} ({result.media_type})
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected && detail && (
              <div className="card">
                <h4>{detail.title || detail.name}</h4>
                <p className="muted">
                  {selected.media_type === "movie"
                    ? detail.release_date || "TBD"
                    : detail.first_air_date || "TBD"}
                </p>
                {selected.media_type === "movie" ? (
                  (() => {
                    const existingMovieFollow = follows.find(
                      (follow) => follow.target_type === "movie" && follow.tmdb_id === detail.id,
                    );
                    return (
                      <button
                        className="button"
                        onClick={() => {
                          setFollowPayload({ targetType: "movie", tmdbId: detail.id });
                          setExistingFollow(existingMovieFollow);
                        }}
                      >
                        {existingMovieFollow ? "Edit follow" : "Follow"}
                      </button>
                    );
                  })()
                ) : (
                  (() => {
                    const existingFullFollow = follows.find(
                      (follow) => follow.target_type === "tv_full" && follow.tmdb_id === detail.id,
                    );
                    return (
                      <>
                        <div className="button-row">
                          <button
                            className="button"
                            onClick={() => {
                              setFollowPayload({ targetType: "tv_full", tmdbId: detail.id });
                              setExistingFollow(existingFullFollow);
                            }}
                          >
                            {existingFullFollow ? "Edit follow" : "Follow full run"}
                          </button>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setFollowPayload({
                                targetType: "tv_season",
                                tmdbId: detail.id,
                              });
                              setExistingFollow(undefined);
                            }}
                          >
                            Follow season
                          </button>
                        </div>
                        <p className="muted">
                          Full run: get notified when the show concludes (Ended/Canceled) and
                          optionally when the next drop date appears or changes.
                        </p>
                        <p className="muted">
                          Season: pick a season to track premiere date changes and when it becomes
                          binge-ready.
                        </p>
                      </>
                    );
                  })()
                )}
              </div>
            )}
            {followPayload && (
              <FollowModal
                payload={followPayload}
                detail={detail}
                existingFollow={existingFollow}
                existingFollows={follows}
                onClose={() => {
                  setFollowPayload(null);
                  setExistingFollow(undefined);
                }}
                onSaved={() => {
                  onFollowCreated();
                  setFollowPayload(null);
                  setExistingFollow(undefined);
                }}
              />
            )}
          </>
        )}
        <div className="button-row">
          <button className="button secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
