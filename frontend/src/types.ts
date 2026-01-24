export type Prefs = {
  notify_date_changes: boolean;
  notify_status_milestones: boolean;
  notify_season_binge_ready: boolean;
  notify_episode_drops: boolean;
  notify_full_run_concluded: boolean;
  channel_email: boolean;
  channel_whatsapp: boolean;
  frequency: "important_only" | "all_updates";
};

export type Follow = {
  id: number;
  target_type: "movie" | "tv_season" | "tv_full";
  tmdb_id: number;
  season_number: number | null;
  cache_payload?: Record<string, unknown>;
  status_raw?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  last_air_date?: string | null;
  next_air_date?: string | null;
  season_air_date?: string | null;
  season_last_episode_air_date?: string | null;
  cache_updated_at?: string | null;
} & Prefs;

export type User = { id: number; email: string };

export type FollowPayload = {
  targetType: "movie" | "tv_full" | "tv_season";
  tmdbId: number;
  seasonNumber?: number;
};
