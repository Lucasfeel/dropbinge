import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiFetch } from "../api";
import { AlertGateModal } from "../components/AlertGateModal";
import { BellIcon } from "../components/icons/BellIcon";
import { PosterCard } from "../components/PosterCard";
import { SectionHeader } from "../components/SectionHeader";
import { useAuth } from "../hooks/useAuth";
import { followKey, useFollowStore } from "../stores/followStore";

const IMG_BASE = "https://image.tmdb.org/t/p/w500";
const todayIso = () => new Date().toISOString().split("T")[0];

export const DetailsPage = () => {
  const navigate = useNavigate();
  const { mediaType, tmdbId } = useParams();
  const [details, setDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<any | null>(null);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState(false);
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

  useEffect(() => {
    let active = true;
    const loadProviders = async () => {
      setProvidersLoading(true);
      setProvidersError(false);
      try {
        const data = await apiFetch<any>(`/api/tmdb/watch-providers/${type}/${id}?region=US`);
        if (active) {
          setProviders(data);
        }
      } catch (error) {
        if (active) {
          setProviders(null);
          setProvidersError(true);
        }
      } finally {
        if (active) {
          setProvidersLoading(false);
        }
      }
    };
    if (details && !Number.isNaN(id)) {
      loadProviders();
    }
    return () => {
      active = false;
    };
  }, [details, id, type]);

  const posterUrl = details?.poster_path ? `${IMG_BASE}${details.poster_path}` : null;
  const title = details?.title || details?.name || "Unknown title";
  const date = details?.release_date || details?.first_air_date || null;
  const followItem = getItemByKey(followKeyValue);
  const dropEnabled = followItem?.dropEnabled ?? false;
  const bingeEnabled = followItem?.bingeEnabled ?? false;
  const status = details?.status;
  const isMovieCompleted =
    type === "movie" &&
    (status === "Released" || (details?.release_date && details.release_date <= todayIso()));
  const isTvCompleted = type === "tv" && (status === "Ended" || status === "Canceled");
  const isCompleted = type === "movie" ? isMovieCompleted : isTvCompleted;
  const canRemove = dropEnabled || bingeEnabled;

  const seasons = useMemo(() => details?.seasons || [], [details]);
  const nextSeasonNumber = details?.next_episode_to_air?.season_number;
  const lastSeasonNumber = details?.last_episode_to_air?.season_number;
  const resolveSeasonCompleted = (seasonNumber: number) => {
    if (seasonNumber === 0) return false;
    if (status === "Ended" || status === "Canceled") return true;
    if (typeof nextSeasonNumber === "number") {
      return seasonNumber < nextSeasonNumber;
    }
    if (typeof lastSeasonNumber === "number") {
      return seasonNumber < lastSeasonNumber;
    }
    return false;
  };
  const providerImageBase = "https://image.tmdb.org/t/p/w92";
  const providerGroups = useMemo(() => {
    if (!providers) return [];
    const order = ["flatrate", "free", "ads", "rent", "buy"] as const;
    return order
      .map((key) => ({ key, items: providers[key] || [] }))
      .filter((group) => group.items.length > 0);
  }, [providers]);
  const providerLabels: Record<string, string> = {
    flatrate: "Stream",
    free: "Free",
    ads: "With ads",
    rent: "Rent",
    buy: "Buy",
  };

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
          {isCompleted ? <div className="poster-completed-badge">COMPLETED</div> : null}
          {posterUrl ? <img src={posterUrl} alt={title} /> : <div className="poster-fallback" />}
        </div>
        <div className="detail-info">
          <h1>{title}</h1>
          <p className="muted">{date || "TBD"}</p>
          <div className="detail-actions">
            {isCompleted ? null : type === "movie" ? (
              <button
                className={`role-btn ${dropEnabled ? "button secondary" : "button"}`}
                disabled={rolePending}
                onClick={async () => {
                  await applyRolesWithGate(
                    { mediaType: "movie", tmdbId: id },
                    { drop: !dropEnabled },
                  );
                }}
              >
                <BellIcon className="role-btn-icon" />
                <span>Drop</span>
              </button>
            ) : (
              <>
                <button
                  className={`role-btn ${dropEnabled ? "button secondary" : "button"}`}
                  disabled={rolePending}
                  onClick={async () => {
                    await applyRolesWithGate(
                      { mediaType: "tv", tmdbId: id, targetType: "tv_full" },
                      { drop: !dropEnabled, binge: bingeEnabled },
                    );
                  }}
                >
                  <BellIcon className="role-btn-icon" />
                  <span>Drop</span>
                </button>
                <button
                  className={`role-btn ${bingeEnabled ? "button secondary" : "button"}`}
                  disabled={rolePending}
                  onClick={async () => {
                    await applyRolesWithGate(
                      { mediaType: "tv", tmdbId: id, targetType: "tv_full" },
                      { drop: dropEnabled, binge: !bingeEnabled },
                    );
                  }}
                >
                  <BellIcon className="role-btn-icon" />
                  <span>Binge</span>
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
                    if (type === "movie") {
                      await setRoles({ mediaType: "movie", tmdbId: id }, { drop: false });
                    } else {
                      await setRoles(
                        { mediaType: "tv", tmdbId: id, targetType: "tv_full" },
                        { drop: false, binge: false },
                      );
                    }
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

      {type === "tv" && (
        <>
          <SectionHeader title="Seasons" subtitle="Season premieres and binge-ready dates." />
          <div className="season-grid">
            {seasons.map((season: any) => {
              const seasonNumber = season.season_number;
              const completed =
                typeof seasonNumber === "number" ? resolveSeasonCompleted(seasonNumber) : false;
              return (
                <PosterCard
                  key={season.id}
                  title={season.name || `Season ${seasonNumber}`}
                  subtitle={season.air_date || "TBD"}
                  posterPath={season.poster_path}
                  to={`/title/tv/${id}/season/${seasonNumber}`}
                  isCompleted={completed}
                />
              );
            })}
          </div>
        </>
      )}

      <SectionHeader title="Where to watch" subtitle="Availability for your region." />
      {providersLoading ? (
        <p className="muted">Loading providers...</p>
      ) : providersError ? (
        <p className="muted">No providers available for this region.</p>
      ) : providerGroups.length === 0 ? (
        <p className="muted">No providers available for this region.</p>
      ) : (
        <div className="provider-groups">
          {providerGroups.map((group) => (
            <div key={group.key} className="provider-group">
              <h4>{providerLabels[group.key]}</h4>
              <div className="provider-grid">
                {group.items.map((provider: any) => (
                  <div key={provider.provider_id} className="provider-chip">
                    {provider.logo_path ? (
                      <img
                        src={`${providerImageBase}${provider.logo_path}`}
                        alt={provider.provider_name}
                      />
                    ) : null}
                    <span>{provider.provider_name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
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
