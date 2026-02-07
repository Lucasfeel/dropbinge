import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiFetch } from "../api";
import { AlertGateModal } from "../components/AlertGateModal";
import { useAuth } from "../hooks/useAuth";
import { followKey, useFollowStore } from "../stores/followStore";

const IMG_BASE = "https://image.tmdb.org/t/p/w500";
const todayIso = () => new Date().toISOString().split("T")[0];

export const SeasonDetailsPage = () => {
  const navigate = useNavigate();
  const { tmdbId, seasonNumber } = useParams();
  const [details, setDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { getItemByKey, setRoles } = useFollowStore();
  const { isAuthenticated } = useAuth();
  const [rolePending, setRolePending] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    input: {
      mediaType: "movie" | "tv";
      tmdbId: number;
      seasonNumber?: number | null;
      targetType?: "movie" | "tv_full" | "tv_season";
    };
    roles: { drop: boolean; binge?: boolean };
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const id = Number(tmdbId);
  const season = Number(seasonNumber);
  const key = followKey("tv", id, season);
  const followItem = getItemByKey(key);
  const dropEnabled = followItem?.dropEnabled ?? false;
  const bingeEnabled = followItem?.bingeEnabled ?? false;

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
  const episodeDates = (details?.episodes || [])
    .map((episode: { air_date?: string | null }) => episode.air_date)
    .filter((value: string | null | undefined): value is string =>
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
    );
  const isCompleted =
    episodeDates.length > 0 && !episodeDates.some((airDate: string) => airDate > todayIso());
  const canRemove = dropEnabled || bingeEnabled;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  };

  const applyRolesWithGate = async (
    input: {
      mediaType: "movie" | "tv";
      tmdbId: number;
      seasonNumber?: number | null;
      targetType?: "movie" | "tv_full" | "tv_season";
    },
    roles: { drop: boolean; binge?: boolean },
  ) => {
    if (!isAuthenticated && (roles.drop || roles.binge)) {
      setPendingAction({ input, roles });
      setGateOpen(true);
      return;
    }
    setRolePending(true);
    try {
      await setRoles(input, roles);
      showToast("Alert settings saved");
    } finally {
      setRolePending(false);
    }
  };

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-poster">
          {isCompleted ? <div className="poster-completed-badge">COMPLETED</div> : null}
          {posterUrl ? <img src={posterUrl} alt={details.name} /> : <div className="poster-fallback" />}
        </div>
        <div className="detail-info">
          <h1>{details.name}</h1>
          <p className="muted">{details.air_date || "TBD"}</p>
          <div className="detail-actions">
            {isCompleted ? null : (
              <>
                <button
                  className={dropEnabled ? "button secondary" : "button"}
                  disabled={rolePending}
                  onClick={async () => {
                    await applyRolesWithGate(
                      { mediaType: "tv", tmdbId: id, seasonNumber: season, targetType: "tv_season" },
                      { drop: !dropEnabled, binge: bingeEnabled },
                    );
                  }}
                >
                  Drop
                </button>
                <button
                  className={bingeEnabled ? "button secondary" : "button"}
                  disabled={rolePending}
                  onClick={async () => {
                    await applyRolesWithGate(
                      { mediaType: "tv", tmdbId: id, seasonNumber: season, targetType: "tv_season" },
                      { drop: dropEnabled, binge: !bingeEnabled },
                    );
                  }}
                >
                  Binge
                </button>
              </>
            )}
            {isCompleted && canRemove ? (
              <button
                className="button secondary"
                disabled={rolePending}
                onClick={async () => {
                  setRolePending(true);
                  try {
                    await setRoles(
                      { mediaType: "tv", tmdbId: id, seasonNumber: season, targetType: "tv_season" },
                      { drop: false, binge: false },
                    );
                  } finally {
                    setRolePending(false);
                  }
                }}
              >
                Remove
              </button>
            ) : null}
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
      {gateOpen && pendingAction ? (
        <AlertGateModal
          open={gateOpen}
          modeTitle="Enable alerts"
          pendingAction={pendingAction}
          onClose={() => {
            setGateOpen(false);
            setPendingAction(null);
          }}
          onSuccess={() => {
            showToast("Alert settings saved");
          }}
        />
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
};
