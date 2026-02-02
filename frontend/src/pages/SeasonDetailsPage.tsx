import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiFetch } from "../api";
import { followKey, useFollowStore } from "../stores/followStore";

const IMG_BASE = "https://image.tmdb.org/t/p/w500";

export const SeasonDetailsPage = () => {
  const navigate = useNavigate();
  const { tmdbId, seasonNumber } = useParams();
  const [details, setDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { addFollow, removeFollow, isFollowing } = useFollowStore();

  const id = Number(tmdbId);
  const season = Number(seasonNumber);
  const key = followKey("tv", id, season);
  const following = isFollowing(key);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiFetch<any>(`/api/tmdb/tv/${id}/season/${season}`);
        if (active) {
          setDetails(data);
        }
      } catch (error) {
        if (active) {
          setDetails(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    if (!Number.isNaN(id) && !Number.isNaN(season)) {
      load();
    }
    return () => {
      active = false;
    };
  }, [id, season]);

  if (loading) {
    return <div className="page">Loading...</div>;
  }

  if (!details) {
    return (
      <div className="page">
        <p className="muted">We couldn’t load this season.</p>
      </div>
    );
  }

  const posterUrl = details?.poster_path ? `${IMG_BASE}${details.poster_path}` : null;

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-poster">
          {posterUrl ? <img src={posterUrl} alt={details.name} /> : <div className="poster-fallback" />}
        </div>
        <div className="detail-info">
          <h1>{details.name}</h1>
          <p className="muted">{details.air_date || "TBD"}</p>
          <div className="detail-actions">
            <button
              className={following ? "button secondary" : "button"}
              onClick={async () => {
                if (following) {
                  await removeFollow(key);
                } else {
                  await addFollow({ mediaType: "tv", tmdbId: id, seasonNumber: season });
                }
              }}
            >
              {following ? "Tracking" : "Track season"}
            </button>
            <button className="button ghost" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>
        </div>
      </div>
      <div className="season-episodes">
        <h3>Episodes</h3>
        {(details.episodes || []).map((episode: any) => (
          <div key={episode.id} className="episode-row">
            <div>
              <strong>{episode.episode_number}. {episode.name}</strong>
              <div className="muted">{episode.air_date || "TBD"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
