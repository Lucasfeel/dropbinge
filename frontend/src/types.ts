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

export type ActivityEvent = {
  id: number;
  created_at: string;
  follow_id: number;
  target_type: "movie" | "tv_season" | "tv_full";
  tmdb_id: number;
  season_number: number | null;
  title: string | null;
  event_type: "date_set" | "date_changed" | "status_milestone" | "season_binge_ready" | "full_run_concluded";
  summary: string;
  event_payload: Record<string, unknown>;
};

export type ActivityOutboxItem = {
  id: number;
  created_at: string;
  sent_at: string | null;
  follow_id: number;
  target_type: "movie" | "tv_season" | "tv_full";
  tmdb_id: number;
  season_number: number | null;
  title: string | null;
  channel: "email" | "whatsapp";
  status: "pending" | "sent" | "failed";
  summary: string;
  payload: Record<string, unknown>;
};

export type ActivityResponse = {
  recent_events: ActivityEvent[];
  outbox: ActivityOutboxItem[];
  meta: {
    as_of: string;
    counts: {
      recent_events: number;
      outbox: number;
      outbox_pending: number;
    };
  };
};
