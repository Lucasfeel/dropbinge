import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiFetch } from "../api";
import { PosterCard } from "../components/PosterCard";
import { SectionHeader } from "../components/SectionHeader";
import { followKey, useFollowStore } from "../stores/followStore";

const IMG_BASE = "https://image.tmdb.org/t/p/w500";

export const DetailsPage = () => {
  const navigate = useNavigate();
  const { mediaType, tmdbId } = useParams();
  const [details, setDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { addFollow, removeFollow, isFollowing } = useFollowStore();

  const id = Number(tmdbId);
  const type = mediaType === "movie" ? "movie" : "tv";
  const followKeyValue = followKey(type, id);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiFetch<any>(`/api/tmdb/${type}/${id}`);
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
    if (!Number.isNaN(id)) {
      load();
    }
    return () => {
      active = false;
    };
  }, [id, type]);

  const posterUrl = details?.poster_path ? `${IMG_BASE}${details.poster_path}` : null;
  const title = details?.title || details?.name || "Unknown title";
  const date = details?.release_date || details?.first_air_date || null;
  const following = isFollowing(followKeyValue);
  const followLabel = type === "tv" ? "Track series" : "Track";

  const seasons = useMemo(() => details?.seasons || [], [details]);

  if (loading) {
    return <div className="page">Loading...</div>;
  }

  if (!details) {
    return (
      <div className="page">
        <p className="muted">We couldn’t load this title. Try again.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-poster">
          {posterUrl ? <img src={posterUrl} alt={title} /> : <div className="poster-fallback" />}
        </div>
        <div className="detail-info">
          <h1>{title}</h1>
          <p className="muted">{date || "TBD"}</p>
          <div className="detail-actions">
            <button
              className={following ? "button secondary" : "button"}
              onClick={async () => {
                if (following) {
                  await removeFollow(followKeyValue);
                } else {
                  await addFollow({ mediaType: type, tmdbId: id });
                }
              }}
            >
              {following ? "Tracking" : followLabel}
            </button>
            <button className="button ghost" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>
        </div>
      </div>

      {type === "tv" && (
        <>
          <SectionHeader title="Seasons" subtitle="Track a season premiere or binge-ready date." />
          <div className="season-grid">
            {seasons.map((season: any) => {
              const seasonKey = followKey("tv", id, season.season_number);
              const seasonFollowing = isFollowing(seasonKey);
              return (
                <PosterCard
                  key={season.id}
                  title={season.name || `Season ${season.season_number}`}
                  subtitle={season.air_date || "TBD"}
                  posterPath={season.poster_path}
                  to={`/title/tv/${id}/season/${season.season_number}`}
                  action={
                    <button
                      className={seasonFollowing ? "button tiny secondary" : "button tiny"}
                      onClick={async (event) => {
                        event.preventDefault();
                        if (seasonFollowing) {
                          await removeFollow(seasonKey);
                        } else {
                          await addFollow({
                            mediaType: "tv",
                            tmdbId: id,
                            seasonNumber: season.season_number,
                          });
                        }
                      }}
                    >
                      {seasonFollowing ? "Tracking" : "Track season"}
                    </button>
                  }
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
