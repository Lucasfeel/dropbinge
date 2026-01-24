import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "../api";
import type { Follow, FollowPayload, Prefs } from "../types";

const defaultPrefs: Prefs = {
  notify_date_changes: true,
  notify_status_milestones: false,
  notify_season_binge_ready: true,
  notify_episode_drops: false,
  notify_full_run_concluded: true,
  channel_email: true,
  channel_whatsapp: false,
  frequency: "important_only",
};

const getInitialPrefs = (existingFollow?: Follow): Prefs => {
  if (!existingFollow) return defaultPrefs;
  return {
    notify_date_changes: existingFollow.notify_date_changes,
    notify_status_milestones: existingFollow.notify_status_milestones,
    notify_season_binge_ready: existingFollow.notify_season_binge_ready,
    notify_episode_drops: existingFollow.notify_episode_drops,
    notify_full_run_concluded: existingFollow.notify_full_run_concluded,
    channel_email: existingFollow.channel_email,
    channel_whatsapp: existingFollow.channel_whatsapp,
    frequency: existingFollow.frequency,
  };
};

type FollowModalProps = {
  payload: FollowPayload;
  detail?: any;
  onClose: () => void;
  onSaved: () => void;
  existingFollow?: Follow;
  existingFollows?: Follow[];
};

export const FollowModal = ({
  payload,
  detail,
  onClose,
  onSaved,
  existingFollow,
  existingFollows,
}: FollowModalProps) => {
  const [prefs, setPrefs] = useState<Prefs>(getInitialPrefs(existingFollow));
  const [seasonNumber, setSeasonNumber] = useState<number | undefined>(payload.seasonNumber);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seasons = useMemo(() => {
    if (!detail?.seasons) return [];
    return detail.seasons.filter((season: any) => typeof season.season_number === "number");
  }, [detail]);

  const activeExistingFollow = useMemo(() => {
    if (existingFollow) return existingFollow;
    if (payload.targetType !== "tv_season" || seasonNumber === undefined) return undefined;
    return existingFollows?.find(
      (follow) =>
        follow.target_type === "tv_season" &&
        follow.tmdb_id === payload.tmdbId &&
        follow.season_number === seasonNumber,
    );
  }, [existingFollow, existingFollows, payload.targetType, payload.tmdbId, seasonNumber]);

  useEffect(() => {
    if (activeExistingFollow) {
      setPrefs(getInitialPrefs(activeExistingFollow));
    } else if (!existingFollow) {
      setPrefs(defaultPrefs);
    }
  }, [activeExistingFollow, existingFollow]);

  const updatePref = (key: keyof Prefs, value: boolean | string) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (payload.targetType === "tv_season" && seasonNumber === undefined) {
      setError("Please select a season.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (activeExistingFollow) {
        await apiFetch(`/api/my/follows/${activeExistingFollow.id}`, {
          method: "PATCH",
          body: JSON.stringify(prefs),
        });
      } else {
        await apiFetch("/api/my/follows", {
          method: "POST",
          body: JSON.stringify({
            target_type: payload.targetType,
            tmdb_id: payload.tmdbId,
            season_number: payload.targetType === "tv_season" ? seasonNumber : undefined,
            prefs,
          }),
        });
      }
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("follow_already_exists") || message.includes("409")) {
        setError("You already follow this target. Use Edit to change options.");
      } else {
        setError("Failed to save. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Follow options</h3>
        {payload.targetType === "tv_season" && detail?.seasons && (
          <div className="field">
            <label>Season</label>
            <select
              value={seasonNumber ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setSeasonNumber(value === "" ? undefined : Number(value));
                setError(null);
              }}
            >
              <option value="">Select</option>
              {seasons.map((season: any) => (
                <option key={season.id} value={season.season_number}>
                  Season {season.season_number}
                </option>
              ))}
            </select>
          </div>
        )}
        {payload.targetType === "tv_season" && seasonNumber === undefined && (
          <p className="muted">Please select a season.</p>
        )}
        {payload.targetType === "tv_season" && !detail?.seasons && (
          <p className="muted">Season {seasonNumber ?? payload.seasonNumber ?? "TBD"}</p>
        )}
        {payload.targetType === "movie" && (
          <>
            <div className="field">
              <label>Release date set/changed</label>
              <input
                type="checkbox"
                checked={prefs.notify_date_changes}
                onChange={(event) => updatePref("notify_date_changes", event.target.checked)}
              />
            </div>
            <div className="field">
              <label>Status milestones</label>
              <input
                type="checkbox"
                checked={prefs.notify_status_milestones}
                onChange={(event) =>
                  updatePref("notify_status_milestones", event.target.checked)
                }
              />
            </div>
          </>
        )}
        {payload.targetType === "tv_season" && (
          <>
            <div className="field">
              <label>Season premiere date set/changed</label>
              <input
                type="checkbox"
                checked={prefs.notify_date_changes}
                onChange={(event) => updatePref("notify_date_changes", event.target.checked)}
              />
            </div>
            <div className="field">
              <label>Season binge-ready</label>
              <input
                type="checkbox"
                checked={prefs.notify_season_binge_ready}
                onChange={(event) =>
                  updatePref("notify_season_binge_ready", event.target.checked)
                }
              />
              <p className="muted">
                Notifies when the final episode of the season has aired (binge-ready).
              </p>
            </div>
          </>
        )}
        {payload.targetType === "tv_full" && (
          <>
            <div className="field">
              <label>Full run concluded</label>
              <input
                type="checkbox"
                checked={prefs.notify_full_run_concluded}
                onChange={(event) =>
                  updatePref("notify_full_run_concluded", event.target.checked)
                }
              />
            </div>
            <div className="field">
              <label>Next drop date set/changed</label>
              <input
                type="checkbox"
                checked={prefs.notify_date_changes}
                onChange={(event) => updatePref("notify_date_changes", event.target.checked)}
              />
              <p className="muted">
                Tracks changes to the next known episode air date (TMDB next_episode_to_air).
              </p>
            </div>
          </>
        )}
        <div className="field">
          <label>Email</label>
          <input
            type="checkbox"
            checked={prefs.channel_email}
            onChange={(event) => updatePref("channel_email", event.target.checked)}
          />
        </div>
        <div className="field">
          <label>
            WhatsApp <span className="muted">(coming soon)</span>
          </label>
          <input type="checkbox" checked={prefs.channel_whatsapp} disabled />
        </div>
        <div className="field">
          <label>Frequency</label>
          <select
            value={prefs.frequency}
            onChange={(event) => updatePref("frequency", event.target.value)}
          >
            <option value="important_only">Important only</option>
            <option value="all_updates">All updates</option>
          </select>
        </div>
        {error && <p className="muted">{error}</p>}
        <div className="button-row">
          <button
            className="button"
            onClick={save}
            disabled={saving || (payload.targetType === "tv_season" && seasonNumber === undefined)}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
