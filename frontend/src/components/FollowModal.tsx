import { useMemo, useState } from "react";

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
};

export const FollowModal = ({
  payload,
  detail,
  onClose,
  onSaved,
  existingFollow,
}: FollowModalProps) => {
  const [prefs, setPrefs] = useState<Prefs>(getInitialPrefs(existingFollow));
  const [seasonNumber, setSeasonNumber] = useState<number | undefined>(payload.seasonNumber);

  const seasons = useMemo(() => {
    if (!detail?.seasons) return [];
    return detail.seasons.filter((season: any) => typeof season.season_number === "number");
  }, [detail]);

  const updatePref = (key: keyof Prefs, value: boolean | string) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (payload.targetType === "tv_season" && seasonNumber === undefined) {
      return;
    }
    if (existingFollow) {
      await apiFetch(`/api/my/follows/${existingFollow.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(prefs),
        },
      );
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
              onChange={(event) => setSeasonNumber(Number(event.target.value))}
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
        {payload.targetType === "tv_season" && !detail?.seasons && (
          <p className="muted">Season {seasonNumber ?? payload.seasonNumber ?? "TBD"}</p>
        )}
        {payload.targetType === "movie" && (
          <>
            <div className="field">
              <label>Date set/changed</label>
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
              <label>Season date changes</label>
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
            </div>
          </>
        )}
        {payload.targetType === "tv_full" && (
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
        <div className="button-row">
          <button className="button" onClick={save}>
            Save
          </button>
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
