import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";

type TabKey =
  | "overview"
  | "contents"
  | "users"
  | "cdcEvents"
  | "reports"
  | "dailyNotification"
  | "ops";
type Tone = "info" | "success" | "error";

type OverviewPayload = {
  admin_restricted: boolean;
  users_total: number;
  follows_total: number;
  follow_breakdown: Record<string, number>;
  outbox_status: Record<string, number>;
  change_events_24h: number;
  outbox_24h: number;
  oldest_pending_created_at: string | null;
  latest_user_created_at: string | null;
  latest_follow_created_at: string | null;
  top_users: Array<{ id: number; email: string; follows_count: number }>;
};

type UsersPayload = {
  users: Array<{
    id: number;
    email: string;
    follows_count: number;
    pending_outbox_count: number;
    is_admin: boolean;
  }>;
  limit: number;
  offset: number;
  total: number;
};

type UserFollowsPayload = {
  user: { id: number; email: string; created_at: string; is_admin: boolean };
  follows: Array<{
    id: number;
    target_type: "movie" | "tv_full" | "tv_season";
    tmdb_id: number;
    season_number: number | null;
    title: string | null;
    status_raw: string | null;
    cache_updated_at: string | null;
    frequency: string;
  }>;
};

type OutboxSummaryPayload = {
  by_status: Record<string, number>;
  by_channel_and_status: Array<{ channel: string; status: string; count: number }>;
  oldest_pending_created_at: string | null;
  recent_failures: Array<{
    id: number;
    email: string;
    channel: string;
    attempt_count: number;
    last_error: string | null;
    created_at: string;
  }>;
};

type CdcEventItem = {
  id: number;
  created_at: string | null;
  event_type: string;
  event_payload: Record<string, unknown> | null;
  user_id: number | null;
  user_email: string | null;
  source: string | null;
  content_id: string | null;
  tmdb_id: number | null;
  season_number: number | null;
  title: string | null;
};

type CdcEventsPayload = {
  success: boolean;
  events: CdcEventItem[];
  limit: number;
  offset: number;
};

type JobReportItem = {
  id: number;
  crawler_name: string;
  status: string;
  normalized_status: string;
  report_data: Record<string, unknown>;
  created_at: string | null;
};

type JobReportsPayload = {
  success: boolean;
  reports: JobReportItem[];
  limit: number;
  offset: number;
};

type DailySummaryPayload = {
  success: boolean;
  range: { created_from: string | null; created_to: string | null };
  overall_status: string;
  subject_text: string;
  summary_text: string;
  total_reports: number;
  counts: Record<string, number>;
  items: JobReportItem[];
};

type DailyNotificationItem = {
  id: number;
  title: string | null;
  channel: string;
  status: string;
  user_email: string | null;
  target_type: string | null;
  tmdb_id: number | null;
  season_number: number | null;
  created_at: string | null;
  sent_at: string | null;
  last_error: string | null;
};

type DailyNotificationStats = {
  date: string;
  duration_seconds: number | null;
  total_items: number;
  sent_count: number;
  pending_count: number;
  failed_count: number;
  other_count: number;
  unique_recipients: number;
  event_counts: Record<string, number>;
};

type DailyNotificationPayload = {
  success: boolean;
  date: string;
  range: { from: string; to: string };
  generated_at: string;
  stats: DailyNotificationStats;
  items?: DailyNotificationItem[];
  completed_items?: DailyNotificationItem[];
  text_report: string;
};

type ManagedContentFields = {
  status_raw: string | null;
  release_date: string | null;
  next_air_date: string | null;
  final_state: string | null;
  final_completed_at: string | null;
};

type ManagedContentOverride = ManagedContentFields & {
  id: number;
  reason: string | null;
  admin_email: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ManagedContentItem = {
  key: string;
  media_type: "movie" | "tv" | "season";
  tmdb_id: number;
  season_number: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  base: ManagedContentFields;
  override: ManagedContentOverride | null;
  effective: ManagedContentFields & { missing_final_completed_at: boolean };
  updated_at: string | null;
};

type ManagedContentsPayload = {
  success: boolean;
  items: ManagedContentItem[];
  limit: number;
  offset: number;
};

type ManagedContentOverrideEntry = {
  media_type: "movie" | "tv" | "season";
  tmdb_id: number;
  season_number: number;
  title: string;
  override: ManagedContentOverride | null;
  base: {
    status_raw: string | null;
    final_state: string | null;
    final_completed_at: string | null;
  };
};

type ManagedContentOverridesPayload = {
  success: boolean;
  items: ManagedContentOverrideEntry[];
  limit: number;
  offset: number;
};

type ManagedContentAuditLog = {
  id: number;
  created_at: string | null;
  action_type: "OVERRIDE_UPSERT" | "OVERRIDE_DELETE";
  reason: string | null;
  admin_email: string | null;
  media_type: "movie" | "tv" | "season";
  tmdb_id: number;
  season_number: number;
  title: string | null;
  base_status_raw: string | null;
  base_final_state: string | null;
  base_final_completed_at: string | null;
  effective_final_state: string | null;
  effective_final_completed_at: string | null;
  payload: Record<string, unknown>;
};

type ManagedContentAuditPayload = {
  success: boolean;
  logs: ManagedContentAuditLog[];
  limit: number;
  offset: number;
};

type OpsSettings = {
  dispatchBatch: string;
  limitUsers: string;
  limitFollows: string;
  forceRefresh: boolean;
};

const OPS_SETTINGS_STORAGE_KEY = "dropbinge_admin_ops_settings";
const TARGET_LABEL = {
  movie: "Movie",
  tv_full: "TV Full",
  tv_season: "TV Season",
} as const;
const CONTENT_MEDIA_LABEL = {
  movie: "Movie",
  tv: "TV",
  season: "Season",
} as const;

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
};

const todayDateInput = () => new Date().toISOString().slice(0, 10);
const toDateInput = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) {
    return normalized.slice(0, 10);
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
};

const messageOf = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const parseOptionalPositiveInt = (value: string) => {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const statusBadgeClass = (normalizedStatus: string) => {
  if (normalizedStatus === "success") {
    return "admin-pill status-success";
  }
  if (normalizedStatus === "warning") {
    return "admin-pill status-warning";
  }
  if (normalizedStatus === "failure") {
    return "admin-pill status-failure";
  }
  return "admin-pill";
};

const formatReportSummary = (reportData: Record<string, unknown>) => {
  const keys = [
    "message",
    "error",
    "detail",
    "events_emitted",
    "processed_follows",
    "claimed",
    "sent",
    "failed",
  ];
  for (const key of keys) {
    const value = reportData[key];
    if (value !== undefined && value !== null && value !== "") {
      if (typeof value === "string") {
        return `${key}: ${value}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    }
  }
  return "-";
};

const copyText = async (text: string) => {
  if (!text) {
    throw new Error("Empty text");
  }
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "true");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(el);
  if (!ok) {
    throw new Error("Copy failed");
  }
};

export const AdminPage = () => {
  const { token, user, loadingUser, logout } = useAuth();

  const [tab, setTab] = useState<TabKey>("overview");
  const [toast, setToast] = useState<{ text: string; tone: Tone } | null>(null);

  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const [contentQ, setContentQ] = useState("");
  const [contentMediaType, setContentMediaType] = useState("");
  const [contentHasOverride, setContentHasOverride] = useState("");
  const [contentMissingFinalDate, setContentMissingFinalDate] = useState(false);
  const [contentOffset, setContentOffset] = useState(0);
  const [contentLimit] = useState(30);
  const [contentLastCount, setContentLastCount] = useState(0);
  const [contents, setContents] = useState<ManagedContentItem[]>([]);
  const [contentsLoading, setContentsLoading] = useState(false);
  const [selectedContent, setSelectedContent] = useState<ManagedContentItem | null>(null);

  const [overrideStatusRaw, setOverrideStatusRaw] = useState("");
  const [overrideReleaseDate, setOverrideReleaseDate] = useState("");
  const [overrideNextAirDate, setOverrideNextAirDate] = useState("");
  const [overrideFinalState, setOverrideFinalState] = useState("");
  const [overrideFinalCompletedAt, setOverrideFinalCompletedAt] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSaving, setOverrideSaving] = useState(false);

  const [contentOverrides, setContentOverrides] = useState<ManagedContentOverrideEntry[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(false);
  const [overridesOffset, setOverridesOffset] = useState(0);
  const [overridesLimit] = useState(20);
  const [overridesLastCount, setOverridesLastCount] = useState(0);

  const [missingContents, setMissingContents] = useState<ManagedContentItem[]>([]);
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingOffset, setMissingOffset] = useState(0);
  const [missingLimit] = useState(20);
  const [missingLastCount, setMissingLastCount] = useState(0);

  const [contentAuditActionType, setContentAuditActionType] = useState("");
  const [contentAuditLogs, setContentAuditLogs] = useState<ManagedContentAuditLog[]>([]);
  const [contentAuditLoading, setContentAuditLoading] = useState(false);
  const [contentAuditOffset, setContentAuditOffset] = useState(0);
  const [contentAuditLimit] = useState(20);
  const [contentAuditLastCount, setContentAuditLastCount] = useState(0);

  const [usersQuery, setUsersQuery] = useState("");
  const [users, setUsers] = useState<UsersPayload["users"]>([]);
  const [usersOffset, setUsersOffset] = useState(0);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLimit, setUsersLimit] = useState(20);
  const [usersLoading, setUsersLoading] = useState(false);

  const [selectedUser, setSelectedUser] = useState<UserFollowsPayload["user"] | null>(null);
  const [selectedFollows, setSelectedFollows] = useState<UserFollowsPayload["follows"]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailActionLoading, setDetailActionLoading] = useState(false);

  const [summary, setSummary] = useState<OutboxSummaryPayload | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [opsLoading, setOpsLoading] = useState(false);
  const [dispatchBatch, setDispatchBatch] = useState("");
  const [limitUsers, setLimitUsers] = useState("");
  const [limitFollows, setLimitFollows] = useState("");
  const [forceRefresh, setForceRefresh] = useState(false);

  const [cdcQ, setCdcQ] = useState("");
  const [cdcEventType, setCdcEventType] = useState("");
  const [cdcSource, setCdcSource] = useState("");
  const [cdcContentId, setCdcContentId] = useState("");
  const [cdcCreatedFrom, setCdcCreatedFrom] = useState("");
  const [cdcCreatedTo, setCdcCreatedTo] = useState("");
  const [cdcOffset, setCdcOffset] = useState(0);
  const [cdcLimit] = useState(50);
  const [cdcLastCount, setCdcLastCount] = useState(0);
  const [cdcEvents, setCdcEvents] = useState<CdcEventItem[]>([]);
  const [cdcLoading, setCdcLoading] = useState(false);

  const [reportsCrawlerName, setReportsCrawlerName] = useState("");
  const [reportsStatus, setReportsStatus] = useState("");
  const [reportsCreatedFrom, setReportsCreatedFrom] = useState("");
  const [reportsCreatedTo, setReportsCreatedTo] = useState("");
  const [reportsOffset, setReportsOffset] = useState(0);
  const [reportsLimit] = useState(50);
  const [reportsLastCount, setReportsLastCount] = useState(0);
  const [reports, setReports] = useState<JobReportItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [dailySummary, setDailySummary] = useState<DailySummaryPayload | null>(null);
  const [dailySummaryLoading, setDailySummaryLoading] = useState(false);
  const [cleanupKeepDays, setCleanupKeepDays] = useState("14");
  const [cleanupLoading, setCleanupLoading] = useState(false);

  const [dailyDate, setDailyDate] = useState(todayDateInput());
  const [dailyIncludeFailed, setDailyIncludeFailed] = useState(false);
  const [dailyIncludePending, setDailyIncludePending] = useState(false);
  const [dailyPayload, setDailyPayload] = useState<DailyNotificationPayload | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);

  const canAccessAdmin = Boolean(token && user?.is_admin);

  const notify = (text: string, tone: Tone = "info") => {
    setToast({ text, tone });
  };

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPS_SETTINGS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as OpsSettings;
      if (typeof parsed.dispatchBatch === "string") {
        setDispatchBatch(parsed.dispatchBatch);
      }
      if (typeof parsed.limitUsers === "string") {
        setLimitUsers(parsed.limitUsers);
      }
      if (typeof parsed.limitFollows === "string") {
        setLimitFollows(parsed.limitFollows);
      }
      if (typeof parsed.forceRefresh === "boolean") {
        setForceRefresh(parsed.forceRefresh);
      }
    } catch {
      // ignore local storage parse errors
    }
  }, []);

  const saveOpsSettings = () => {
    const payload: OpsSettings = {
      dispatchBatch,
      limitUsers,
      limitFollows,
      forceRefresh,
    };
    window.localStorage.setItem(OPS_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    notify("Trigger settings saved.", "success");
  };

  useEffect(() => {
    const current = selectedContent?.override;
    setOverrideStatusRaw(current?.status_raw || "");
    setOverrideReleaseDate(toDateInput(current?.release_date));
    setOverrideNextAirDate(toDateInput(current?.next_air_date));
    setOverrideFinalState(current?.final_state || "");
    setOverrideFinalCompletedAt(toDateInput(current?.final_completed_at));
    setOverrideReason(current?.reason || "");
  }, [selectedContent]);

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const payload = await apiFetch<OverviewPayload>("/api/admin/overview");
      setOverview(payload);
    } catch (error) {
      notify(messageOf(error, "Failed to load overview."), "error");
    } finally {
      setOverviewLoading(false);
    }
  };

  const loadContents = async (nextOffset = contentOffset) => {
    setContentsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(contentLimit),
        offset: String(nextOffset),
      });
      if (contentQ.trim()) params.set("q", contentQ.trim());
      if (contentMediaType) params.set("media_type", contentMediaType);
      if (contentHasOverride) params.set("has_override", contentHasOverride);
      if (contentMissingFinalDate) params.set("missing_final_date", "1");
      const payload = await apiFetch<ManagedContentsPayload>(
        `/api/admin/contents/search?${params.toString()}`,
      );
      const items = payload.items || [];
      setContents(items);
      setContentOffset(payload.offset);
      setContentLastCount(items.length);
      setSelectedContent((prev) => {
        if (!prev) {
          return null;
        }
        const matched = items.find((item) => item.key === prev.key);
        return matched || null;
      });
    } catch (error) {
      notify(messageOf(error, "Failed to load contents."), "error");
    } finally {
      setContentsLoading(false);
    }
  };

  const loadContentLookup = async (
    target:
      | { media_type: "movie" | "tv" | "season"; tmdb_id: number; season_number: number }
      | ManagedContentItem,
  ) => {
    try {
      const params = new URLSearchParams({
        media_type: target.media_type,
        tmdb_id: String(target.tmdb_id),
        season_number: String(target.season_number),
      });
      const payload = await apiFetch<{ success: boolean; content: ManagedContentItem }>(
        `/api/admin/contents/lookup?${params.toString()}`,
      );
      const content = payload.content;
      setSelectedContent(content);
      setContents((prev) => prev.map((item) => (item.key === content.key ? content : item)));
    } catch (error) {
      notify(messageOf(error, "Failed to load content details."), "error");
    }
  };

  const loadContentOverrides = async (nextOffset = overridesOffset) => {
    setOverridesLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(overridesLimit),
        offset: String(nextOffset),
      });
      if (contentQ.trim()) params.set("q", contentQ.trim());
      if (contentMediaType) params.set("media_type", contentMediaType);
      const payload = await apiFetch<ManagedContentOverridesPayload>(
        `/api/admin/contents/overrides?${params.toString()}`,
      );
      setContentOverrides(payload.items || []);
      setOverridesOffset(payload.offset);
      setOverridesLastCount((payload.items || []).length);
    } catch (error) {
      notify(messageOf(error, "Failed to load override history."), "error");
    } finally {
      setOverridesLoading(false);
    }
  };

  const loadMissingContents = async (nextOffset = missingOffset) => {
    setMissingLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(missingLimit),
        offset: String(nextOffset),
      });
      if (contentQ.trim()) params.set("q", contentQ.trim());
      if (contentMediaType) params.set("media_type", contentMediaType);
      const payload = await apiFetch<ManagedContentsPayload>(
        `/api/admin/contents/missing-final-date?${params.toString()}`,
      );
      setMissingContents(payload.items || []);
      setMissingOffset(payload.offset);
      setMissingLastCount((payload.items || []).length);
    } catch (error) {
      notify(messageOf(error, "Failed to load missing final-date contents."), "error");
    } finally {
      setMissingLoading(false);
    }
  };

  const loadContentAuditLogs = async (nextOffset = contentAuditOffset) => {
    setContentAuditLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(contentAuditLimit),
        offset: String(nextOffset),
      });
      if (contentQ.trim()) params.set("q", contentQ.trim());
      if (contentMediaType) params.set("media_type", contentMediaType);
      if (contentAuditActionType) params.set("action_type", contentAuditActionType);
      const payload = await apiFetch<ManagedContentAuditPayload>(
        `/api/admin/audit/logs?${params.toString()}`,
      );
      setContentAuditLogs(payload.logs || []);
      setContentAuditOffset(payload.offset);
      setContentAuditLastCount((payload.logs || []).length);
    } catch (error) {
      notify(messageOf(error, "Failed to load content audit logs."), "error");
    } finally {
      setContentAuditLoading(false);
    }
  };

  const saveContentOverride = async () => {
    if (!selectedContent) return;
    setOverrideSaving(true);
    try {
      const body = {
        media_type: selectedContent.media_type,
        tmdb_id: selectedContent.tmdb_id,
        season_number: selectedContent.season_number,
        override_status_raw: overrideStatusRaw.trim() || null,
        override_release_date: overrideReleaseDate || null,
        override_next_air_date: overrideNextAirDate || null,
        override_final_state: overrideFinalState.trim() || null,
        override_final_completed_at: overrideFinalCompletedAt || null,
        reason: overrideReason.trim() || null,
      };
      const payload = await apiFetch<{ success: boolean; content: ManagedContentItem | null }>(
        "/api/admin/contents/override",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      if (payload.content) {
        const updatedContent = payload.content;
        setSelectedContent(updatedContent);
        setContents((prev) =>
          prev.map((item) => (item.key === updatedContent.key ? updatedContent : item)),
        );
      }
      notify("Content override saved.", "success");
      await Promise.all([loadContentOverrides(0), loadMissingContents(0), loadContentAuditLogs(0)]);
    } catch (error) {
      notify(messageOf(error, "Failed to save content override."), "error");
    } finally {
      setOverrideSaving(false);
    }
  };

  const deleteContentOverride = async () => {
    if (!selectedContent) return;
    const confirmed = window.confirm(
      `Delete override for ${selectedContent.title || `TMDB ${selectedContent.tmdb_id}`}?`,
    );
    if (!confirmed) {
      return;
    }
    setOverrideSaving(true);
    try {
      const payload = await apiFetch<{ success: boolean; content: ManagedContentItem | null }>(
        "/api/admin/contents/override",
        {
          method: "DELETE",
          body: JSON.stringify({
            media_type: selectedContent.media_type,
            tmdb_id: selectedContent.tmdb_id,
            season_number: selectedContent.season_number,
            reason: overrideReason.trim() || null,
          }),
        },
      );
      if (payload.content) {
        const updatedContent = payload.content;
        setSelectedContent(updatedContent);
        setContents((prev) =>
          prev.map((item) => (item.key === updatedContent.key ? updatedContent : item)),
        );
      }
      notify("Content override deleted.", "success");
      await Promise.all([loadContentOverrides(0), loadMissingContents(0), loadContentAuditLogs(0)]);
    } catch (error) {
      notify(messageOf(error, "Failed to delete content override."), "error");
    } finally {
      setOverrideSaving(false);
    }
  };

  const loadUsers = async (query: string, offset: number) => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        q: query,
        limit: String(usersLimit),
        offset: String(offset),
      });
      const payload = await apiFetch<UsersPayload>(`/api/admin/users?${params.toString()}`);
      setUsers(payload.users);
      setUsersOffset(payload.offset);
      setUsersTotal(payload.total);
      setUsersLimit(payload.limit);
    } catch (error) {
      notify(messageOf(error, "Failed to load users."), "error");
    } finally {
      setUsersLoading(false);
    }
  };

  const loadUserFollows = async (userId: number) => {
    setDetailLoading(true);
    try {
      const payload = await apiFetch<UserFollowsPayload>(`/api/admin/users/${userId}/follows`);
      setSelectedUser(payload.user);
      setSelectedFollows(payload.follows);
    } catch (error) {
      setSelectedUser(null);
      setSelectedFollows([]);
      notify(messageOf(error, "Failed to load user details."), "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const loadOutboxSummary = async () => {
    setSummaryLoading(true);
    try {
      const payload = await apiFetch<OutboxSummaryPayload>("/api/admin/outbox/summary");
      setSummary(payload);
    } catch (error) {
      notify(messageOf(error, "Failed to load outbox summary."), "error");
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadCdcEvents = async (nextOffset = cdcOffset) => {
    setCdcLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(cdcLimit),
        offset: String(nextOffset),
      });
      if (cdcQ.trim()) params.set("q", cdcQ.trim());
      if (cdcEventType) params.set("event_type", cdcEventType);
      if (cdcSource) params.set("source", cdcSource);
      if (cdcContentId.trim()) params.set("content_id", cdcContentId.trim());
      if (cdcCreatedFrom) params.set("created_from", cdcCreatedFrom);
      if (cdcCreatedTo) params.set("created_to", cdcCreatedTo);
      const payload = await apiFetch<CdcEventsPayload>(
        `/api/admin/cdc/events?${params.toString()}`,
      );
      setCdcEvents(payload.events || []);
      setCdcOffset(payload.offset);
      setCdcLastCount((payload.events || []).length);
    } catch (error) {
      notify(messageOf(error, "Failed to load CDC events."), "error");
    } finally {
      setCdcLoading(false);
    }
  };

  const loadReports = async (nextOffset = reportsOffset) => {
    setReportsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(reportsLimit),
        offset: String(nextOffset),
      });
      if (reportsCrawlerName.trim()) params.set("crawler_name", reportsCrawlerName.trim());
      if (reportsStatus) params.set("status", reportsStatus);
      if (reportsCreatedFrom) params.set("created_from", reportsCreatedFrom);
      if (reportsCreatedTo) params.set("created_to", reportsCreatedTo);
      const payload = await apiFetch<JobReportsPayload>(
        `/api/admin/reports/daily-crawler?${params.toString()}`,
      );
      setReports(payload.reports || []);
      setReportsOffset(payload.offset);
      setReportsLastCount((payload.reports || []).length);
    } catch (error) {
      notify(messageOf(error, "Failed to load reports."), "error");
    } finally {
      setReportsLoading(false);
    }
  };

  const loadDailySummary = async () => {
    setDailySummaryLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportsCreatedFrom) params.set("created_from", reportsCreatedFrom);
      if (reportsCreatedTo) params.set("created_to", reportsCreatedTo);
      const url = params.toString()
        ? `/api/admin/reports/daily-summary?${params.toString()}`
        : "/api/admin/reports/daily-summary";
      const payload = await apiFetch<DailySummaryPayload>(url);
      setDailySummary(payload);
    } catch (error) {
      notify(messageOf(error, "Failed to load daily summary."), "error");
    } finally {
      setDailySummaryLoading(false);
    }
  };

  const loadDailyNotification = async () => {
    setDailyLoading(true);
    try {
      const params = new URLSearchParams();
      if (dailyDate) params.set("date", dailyDate);
      if (dailyIncludeFailed) params.set("include_failed", "1");
      if (dailyIncludePending) params.set("include_pending", "1");
      const payload = await apiFetch<DailyNotificationPayload>(
        `/api/admin/reports/daily-notification?${params.toString()}`,
      );
      setDailyPayload(payload);
    } catch (error) {
      notify(messageOf(error, "Failed to load daily notification report."), "error");
      setDailyPayload(null);
    } finally {
      setDailyLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccessAdmin) return;
    void loadOverview();
    void loadOutboxSummary();
  }, [canAccessAdmin]);

  useEffect(() => {
    if (!canAccessAdmin) return;
    if (tab === "contents") {
      void Promise.all([
        loadContents(0),
        loadContentOverrides(0),
        loadMissingContents(0),
        loadContentAuditLogs(0),
      ]);
    } else if (tab === "users") {
      void loadUsers(usersQuery, usersOffset);
    } else if (tab === "cdcEvents") {
      void loadCdcEvents(0);
    } else if (tab === "reports") {
      void Promise.all([loadReports(0), loadDailySummary()]);
    } else if (tab === "dailyNotification") {
      void loadDailyNotification();
    } else if (tab === "ops") {
      void loadOutboxSummary();
    }
  }, [canAccessAdmin, tab]);

  const runDispatch = async () => {
    setOpsLoading(true);
    try {
      const batchSize = parseOptionalPositiveInt(dispatchBatch);
      const body = batchSize ? { batch_size: batchSize } : {};
      await apiFetch("/api/admin/ops/dispatch-email", {
        method: "POST",
        body: JSON.stringify(body),
      });
      notify("Email dispatch started.", "success");
      await Promise.all([loadOverview(), loadOutboxSummary(), loadReports(0), loadDailySummary()]);
    } catch (error) {
      notify(messageOf(error, "Failed to start dispatch job."), "error");
    } finally {
      setOpsLoading(false);
    }
  };

  const runRefreshAll = async () => {
    setOpsLoading(true);
    try {
      const parsedLimitUsers = parseOptionalPositiveInt(limitUsers);
      const parsedLimitFollows = parseOptionalPositiveInt(limitFollows);
      const body: { limit_users?: number; limit_follows?: number; force: boolean } = {
        force: forceRefresh,
      };
      if (parsedLimitUsers) body.limit_users = parsedLimitUsers;
      if (parsedLimitFollows) body.limit_follows = parsedLimitFollows;
      await apiFetch("/api/admin/ops/refresh-all", {
        method: "POST",
        body: JSON.stringify(body),
      });
      notify("Refresh-all started.", "success");
      await Promise.all([
        loadOverview(),
        loadOutboxSummary(),
        loadCdcEvents(0),
        loadReports(0),
        loadDailySummary(),
      ]);
    } catch (error) {
      notify(messageOf(error, "Failed to start refresh-all."), "error");
    } finally {
      setOpsLoading(false);
    }
  };

  const refreshSelectedUser = async () => {
    if (!selectedUser) return;
    setDetailActionLoading(true);
    try {
      await apiFetch(`/api/admin/users/${selectedUser.id}/refresh`, {
        method: "POST",
        body: JSON.stringify({ force: true }),
      });
      notify("User refresh completed.", "success");
      await Promise.all([
        loadUserFollows(selectedUser.id),
        loadOverview(),
        loadCdcEvents(0),
        loadReports(0),
        loadDailySummary(),
      ]);
    } catch (error) {
      notify(messageOf(error, "Failed to refresh selected user."), "error");
    } finally {
      setDetailActionLoading(false);
    }
  };

  const deleteFollow = async (followId: number, title: string | null, tmdbId: number) => {
    const confirmed = window.confirm(`Delete follow: ${title || `TMDB ${tmdbId}`}?`);
    if (!confirmed || !selectedUser) return;
    setDetailActionLoading(true);
    try {
      await apiFetch(`/api/admin/follows/${followId}`, { method: "DELETE" });
      notify("Follow deleted.", "success");
      await Promise.all([loadUserFollows(selectedUser.id), loadOverview()]);
    } catch (error) {
      notify(messageOf(error, "Failed to delete follow."), "error");
    } finally {
      setDetailActionLoading(false);
    }
  };

  const cleanupReports = async () => {
    const keepDays = parseOptionalPositiveInt(cleanupKeepDays);
    if (!keepDays) {
      notify("keep_days must be a positive number.", "error");
      return;
    }
    setCleanupLoading(true);
    try {
      await apiFetch("/api/admin/reports/daily-crawler/cleanup", {
        method: "POST",
        body: JSON.stringify({ keep_days: keepDays }),
      });
      notify("Old reports cleaned up.", "success");
      await Promise.all([loadReports(0), loadDailySummary()]);
    } catch (error) {
      notify(messageOf(error, "Failed to cleanup reports."), "error");
    } finally {
      setCleanupLoading(false);
    }
  };

  const copySummary = async () => {
    try {
      await copyText(dailySummary?.summary_text || "");
      notify("Summary copied.", "success");
    } catch {
      notify("Copy failed.", "error");
    }
  };

  const copyDailyNotification = async () => {
    try {
      await copyText(dailyPayload?.text_report || "");
      notify("Daily report copied.", "success");
    } catch {
      notify("Copy failed.", "error");
    }
  };

  const followBreakdown = useMemo(
    () => Object.entries(overview?.follow_breakdown || {}),
    [overview],
  );
  const outboxStatus = useMemo(() => Object.entries(overview?.outbox_status || {}), [overview]);
  const hasContentPrev = contentOffset > 0;
  const hasContentNext = contentLastCount >= contentLimit;
  const hasOverridesPrev = overridesOffset > 0;
  const hasOverridesNext = overridesLastCount >= overridesLimit;
  const hasMissingPrev = missingOffset > 0;
  const hasMissingNext = missingLastCount >= missingLimit;
  const hasContentAuditPrev = contentAuditOffset > 0;
  const hasContentAuditNext = contentAuditLastCount >= contentAuditLimit;
  const hasUsersPrev = usersOffset > 0;
  const hasUsersNext = usersOffset + usersLimit < usersTotal;
  const hasCdcPrev = cdcOffset > 0;
  const hasCdcNext = cdcLastCount >= cdcLimit;
  const hasReportsPrev = reportsOffset > 0;
  const hasReportsNext = reportsLastCount >= reportsLimit;
  const selectedContentTarget = selectedContent
    ? `${CONTENT_MEDIA_LABEL[selectedContent.media_type]} / tmdb:${selectedContent.tmdb_id}${
        selectedContent.media_type === "season" ? ` / season:${selectedContent.season_number}` : ""
      }`
    : "-";
  const dailyItems = dailyPayload?.items || dailyPayload?.completed_items || [];

  if (!token) {
    return (
      <div className="admin-console">
        <div className="admin-shell">
          <div className="admin-card">
            <h1>Admin Console</h1>
            <p className="admin-muted">Sign in to access this page.</p>
            <Link to="/me" className="admin-link-btn">
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loadingUser) {
    return (
      <div className="admin-console">
        <div className="admin-shell">
          <div className="admin-card">
            <h1>Admin Console</h1>
            <p className="admin-muted">Checking permissions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user?.is_admin) {
    return (
      <div className="admin-console">
        <div className="admin-shell">
          <div className="admin-card">
            <h1>Admin Console</h1>
            <p className="admin-muted">You do not have admin access.</p>
            <p className="admin-muted">Add your email to `ADMIN_EMAILS`.</p>
            <div className="admin-inline-actions">
              <Link to="/" className="admin-link-btn secondary">
                Home
              </Link>
              <button type="button" className="admin-link-btn" onClick={logout}>
                Log out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-console">
      {toast ? (
        <div
          className={`admin-toast ${toast.tone === "success" ? "success" : ""} ${
            toast.tone === "error" ? "error" : ""
          }`}
        >
          {toast.text}
        </div>
      ) : null}
      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <h1>Admin Console</h1>
            <p className="admin-muted">DropBinge operations dashboard</p>
            <p className="admin-muted">Admin: {user.email}</p>
          </div>
          <div className="admin-inline-actions">
            <Link to="/" className="admin-link-btn secondary">
              Home
            </Link>
            <button type="button" className="admin-link-btn" onClick={logout}>
              Log out
            </button>
          </div>
        </header>

        <nav className="admin-tab-row">
          <button type="button" className={`admin-tab-btn ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
          <button type="button" className={`admin-tab-btn ${tab === "contents" ? "active" : ""}`} onClick={() => setTab("contents")}>Contents</button>
          <button type="button" className={`admin-tab-btn ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>Users</button>
          <button type="button" className={`admin-tab-btn ${tab === "cdcEvents" ? "active" : ""}`} onClick={() => setTab("cdcEvents")}>CDC Events</button>
          <button type="button" className={`admin-tab-btn ${tab === "reports" ? "active" : ""}`} onClick={() => setTab("reports")}>Reports</button>
          <button type="button" className={`admin-tab-btn ${tab === "dailyNotification" ? "active" : ""}`} onClick={() => setTab("dailyNotification")}>Daily Notification</button>
          <button type="button" className={`admin-tab-btn ${tab === "ops" ? "active" : ""}`} onClick={() => setTab("ops")}>Ops</button>
        </nav>

        {tab === "overview" ? (
          <section className="admin-section">
            <div className="admin-card-grid">
              <article className="admin-card">
                <h2>Core Metrics</h2>
                {overviewLoading ? <p className="admin-muted">Loading...</p> : null}
                <dl className="admin-kv">
                  <div>
                    <dt>Users</dt>
                    <dd>{overview?.users_total ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>Follows</dt>
                    <dd>{overview?.follows_total ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>Events (24h)</dt>
                    <dd>{overview?.change_events_24h ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>Outbox (24h)</dt>
                    <dd>{overview?.outbox_24h ?? "-"}</dd>
                  </div>
                </dl>
              </article>

              <article className="admin-card">
                <h2>Follow Breakdown</h2>
                <ul className="admin-chip-list">
                  {followBreakdown.map(([key, value]) => (
                    <li key={key}>
                      <span>{key}</span>
                      <strong>{value}</strong>
                    </li>
                  ))}
                </ul>
                {followBreakdown.length === 0 ? <p className="admin-muted">No data</p> : null}
              </article>

              <article className="admin-card">
                <h2>Outbox Status</h2>
                <ul className="admin-chip-list">
                  {outboxStatus.map(([key, value]) => (
                    <li key={key}>
                      <span>{key}</span>
                      <strong>{value}</strong>
                    </li>
                  ))}
                </ul>
                {outboxStatus.length === 0 ? <p className="admin-muted">No data</p> : null}
              </article>
            </div>

            <div className="admin-card-grid">
              <article className="admin-card">
                <h2>Top Follow Users</h2>
                <div className="admin-list">
                  {(overview?.top_users || []).map((item) => (
                    <div key={item.id} className="admin-list-item">
                      <div>
                        <strong>{item.email}</strong>
                        <p className="admin-muted">user_id: {item.id}</p>
                      </div>
                      <span className="admin-pill">{item.follows_count} follows</span>
                    </div>
                  ))}
                </div>
                {(overview?.top_users || []).length === 0 ? (
                  <p className="admin-muted">No data</p>
                ) : null}
              </article>

              <article className="admin-card">
                <h2>Timeline</h2>
                <dl className="admin-kv compact">
                  <div>
                    <dt>Newest user</dt>
                    <dd>{formatDate(overview?.latest_user_created_at)}</dd>
                  </div>
                  <div>
                    <dt>Newest follow</dt>
                    <dd>{formatDate(overview?.latest_follow_created_at)}</dd>
                  </div>
                  <div>
                    <dt>Oldest pending</dt>
                    <dd>{formatDate(overview?.oldest_pending_created_at)}</dd>
                  </div>
                  <div>
                    <dt>Admin restriction</dt>
                    <dd>{overview?.admin_restricted ? "ADMIN_EMAILS enabled" : "not configured"}</dd>
                  </div>
                </dl>
              </article>
            </div>
          </section>
        ) : null}

        {tab === "contents" ? (
          <section className="admin-section admin-two-col">
            <article className="admin-card">
              <h2>Content Search</h2>
              <div className="admin-field">
                <label>Search</label>
                <input
                  value={contentQ}
                  onChange={(event) => setContentQ(event.target.value)}
                  placeholder="title or tmdb id"
                />
              </div>
              <div className="admin-field">
                <label>Media Type</label>
                <select
                  value={contentMediaType}
                  onChange={(event) => setContentMediaType(event.target.value)}
                >
                  <option value="">All</option>
                  <option value="movie">movie</option>
                  <option value="tv">tv</option>
                  <option value="season">season</option>
                </select>
              </div>
              <div className="admin-field">
                <label>Has Override</label>
                <select
                  value={contentHasOverride}
                  onChange={(event) => setContentHasOverride(event.target.value)}
                >
                  <option value="">All</option>
                  <option value="true">only with override</option>
                  <option value="false">only without override</option>
                </select>
              </div>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={contentMissingFinalDate}
                  onChange={(event) => setContentMissingFinalDate(event.target.checked)}
                />
                missing final completed date only
              </label>

              <div className="admin-inline-actions">
                <button
                  type="button"
                  className="admin-link-btn"
                  disabled={contentsLoading}
                  onClick={() =>
                    void Promise.all([
                      loadContents(0),
                      loadContentOverrides(0),
                      loadMissingContents(0),
                      loadContentAuditLogs(0),
                    ])
                  }
                >
                  Search
                </button>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={contentsLoading}
                  onClick={() => {
                    setContentQ("");
                    setContentMediaType("");
                    setContentHasOverride("");
                    setContentMissingFinalDate(false);
                    setContentOffset(0);
                    setContentLastCount(0);
                    setContents([]);
                    setSelectedContent(null);
                    setContentOverrides([]);
                    setOverridesOffset(0);
                    setOverridesLastCount(0);
                    setMissingContents([]);
                    setMissingOffset(0);
                    setMissingLastCount(0);
                    setContentAuditActionType("");
                    setContentAuditLogs([]);
                    setContentAuditOffset(0);
                    setContentAuditLastCount(0);
                  }}
                >
                  Reset
                </button>
              </div>

              <div className="admin-inline-actions spread">
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasContentPrev || contentsLoading}
                  onClick={() => void loadContents(Math.max(0, contentOffset - contentLimit))}
                >
                  Prev
                </button>
                <span className="admin-muted">offset: {contentOffset}</span>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasContentNext || contentsLoading}
                  onClick={() => void loadContents(contentOffset + contentLimit)}
                >
                  Next
                </button>
              </div>

              <div className="admin-list">
                {contents.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`admin-user-item ${selectedContent?.key === item.key ? "active" : ""}`}
                    onClick={() => setSelectedContent(item)}
                  >
                    <div>
                      <strong>{item.title || `TMDB ${item.tmdb_id}`}</strong>
                      <p className="admin-muted">
                        {CONTENT_MEDIA_LABEL[item.media_type]} / tmdb:{item.tmdb_id}
                        {item.media_type === "season" ? ` / season:${item.season_number}` : ""}
                      </p>
                      <p className="admin-muted">
                        effective: {item.effective.final_state || "-"} /{" "}
                        {item.effective.final_completed_at || "-"}
                      </p>
                    </div>
                    <div className="admin-user-meta">
                      <span>{formatDate(item.updated_at)}</span>
                      {item.override ? <span className="admin-pill">override</span> : null}
                    </div>
                  </button>
                ))}
                {contentsLoading ? <p className="admin-muted">Loading...</p> : null}
                {!contentsLoading && contents.length === 0 ? (
                  <p className="admin-muted">No content found.</p>
                ) : null}
              </div>
            </article>

            <div className="admin-stack">
              <article className="admin-card">
                <div className="admin-inline-actions spread">
                  <h2>Content Details</h2>
                  <button
                    type="button"
                    className="admin-link-btn secondary"
                    disabled={!selectedContent || overrideSaving}
                    onClick={() => {
                      if (!selectedContent) return;
                      void loadContentLookup(selectedContent);
                    }}
                  >
                    Refresh
                  </button>
                </div>
                {!selectedContent ? (
                  <p className="admin-muted">Select content from the search results.</p>
                ) : (
                  <>
                    <div className="admin-detail-header">
                      <div>
                        <strong>{selectedContent.title || `TMDB ${selectedContent.tmdb_id}`}</strong>
                        <p className="admin-muted">{selectedContentTarget}</p>
                        <p className="admin-muted">cache updated: {formatDate(selectedContent.updated_at)}</p>
                      </div>
                      {selectedContent.override ? (
                        <span className="admin-pill">override active</span>
                      ) : (
                        <span className="admin-pill">no override</span>
                      )}
                    </div>

                    <dl className="admin-kv compact">
                      <div>
                        <dt>Base status</dt>
                        <dd>{selectedContent.base.status_raw || "-"}</dd>
                      </div>
                      <div>
                        <dt>Effective status</dt>
                        <dd>{selectedContent.effective.status_raw || "-"}</dd>
                      </div>
                      <div>
                        <dt>Base final</dt>
                        <dd>{selectedContent.base.final_state || "-"}</dd>
                      </div>
                      <div>
                        <dt>Effective final</dt>
                        <dd>{selectedContent.effective.final_state || "-"}</dd>
                      </div>
                      <div>
                        <dt>Base final date</dt>
                        <dd>{selectedContent.base.final_completed_at || "-"}</dd>
                      </div>
                      <div>
                        <dt>Effective final date</dt>
                        <dd>{selectedContent.effective.final_completed_at || "-"}</dd>
                      </div>
                      <div>
                        <dt>Base release date</dt>
                        <dd>{selectedContent.base.release_date || "-"}</dd>
                      </div>
                      <div>
                        <dt>Effective release date</dt>
                        <dd>{selectedContent.effective.release_date || "-"}</dd>
                      </div>
                      <div>
                        <dt>Base next air date</dt>
                        <dd>{selectedContent.base.next_air_date || "-"}</dd>
                      </div>
                      <div>
                        <dt>Effective next air date</dt>
                        <dd>{selectedContent.effective.next_air_date || "-"}</dd>
                      </div>
                    </dl>

                    <hr className="admin-divider" />

                    <h3>Override Editor</h3>
                    <div className="admin-field">
                      <label>override status_raw</label>
                      <input
                        value={overrideStatusRaw}
                        onChange={(event) => setOverrideStatusRaw(event.target.value)}
                        placeholder="Released, Ended, Returning Series..."
                      />
                    </div>
                    <div className="admin-field">
                      <label>override final_state</label>
                      <input
                        value={overrideFinalState}
                        onChange={(event) => setOverrideFinalState(event.target.value)}
                        placeholder="Released, Ended, Canceled, binge_ready..."
                      />
                    </div>
                    <div className="admin-form-grid">
                      <div className="admin-field">
                        <label>override release_date</label>
                        <input
                          type="date"
                          value={overrideReleaseDate}
                          onChange={(event) => setOverrideReleaseDate(event.target.value)}
                        />
                      </div>
                      <div className="admin-field">
                        <label>override next_air_date</label>
                        <input
                          type="date"
                          value={overrideNextAirDate}
                          onChange={(event) => setOverrideNextAirDate(event.target.value)}
                        />
                      </div>
                    </div>
                    <div className="admin-field">
                      <label>override final_completed_at</label>
                      <input
                        type="date"
                        value={overrideFinalCompletedAt}
                        onChange={(event) => setOverrideFinalCompletedAt(event.target.value)}
                      />
                    </div>
                    <div className="admin-field">
                      <label>reason</label>
                      <input
                        value={overrideReason}
                        onChange={(event) => setOverrideReason(event.target.value)}
                        placeholder="optional"
                      />
                    </div>
                    <div className="admin-inline-actions">
                      <button
                        type="button"
                        className="admin-link-btn"
                        disabled={overrideSaving}
                        onClick={() => void saveContentOverride()}
                      >
                        Save Override
                      </button>
                      <button
                        type="button"
                        className="admin-link-btn danger"
                        disabled={overrideSaving || !selectedContent.override}
                        onClick={() => void deleteContentOverride()}
                      >
                        Delete Override
                      </button>
                      <button
                        type="button"
                        className="admin-link-btn secondary"
                        disabled={overrideSaving}
                        onClick={() => {
                          setOverrideStatusRaw(selectedContent.override?.status_raw || "");
                          setOverrideReleaseDate(toDateInput(selectedContent.override?.release_date));
                          setOverrideNextAirDate(toDateInput(selectedContent.override?.next_air_date));
                          setOverrideFinalState(selectedContent.override?.final_state || "");
                          setOverrideFinalCompletedAt(
                            toDateInput(selectedContent.override?.final_completed_at),
                          );
                          setOverrideReason(selectedContent.override?.reason || "");
                        }}
                      >
                        Reset Form
                      </button>
                    </div>
                  </>
                )}
              </article>

              <article className="admin-card">
                <div className="admin-inline-actions spread">
                  <h2>Missing Final Date</h2>
                  <button
                    type="button"
                    className="admin-link-btn secondary"
                    disabled={missingLoading}
                    onClick={() => void loadMissingContents(0)}
                  >
                    Refresh
                  </button>
                </div>
                <div className="admin-list compact">
                  {missingContents.map((item) => (
                    <div key={item.key} className="admin-list-item top">
                      <div>
                        <strong>{item.title || `TMDB ${item.tmdb_id}`}</strong>
                        <p className="admin-muted">
                          {CONTENT_MEDIA_LABEL[item.media_type]} / tmdb:{item.tmdb_id}
                          {item.media_type === "season" ? ` / season:${item.season_number}` : ""}
                        </p>
                        <p className="admin-muted">
                          effective final: {item.effective.final_state || "-"} / missing date
                        </p>
                      </div>
                      <button
                        type="button"
                        className="admin-link-btn secondary"
                        onClick={() => void loadContentLookup(item)}
                      >
                        Open
                      </button>
                    </div>
                  ))}
                  {missingLoading ? <p className="admin-muted">Loading...</p> : null}
                  {!missingLoading && missingContents.length === 0 ? (
                    <p className="admin-muted">No missing items.</p>
                  ) : null}
                </div>
                <div className="admin-inline-actions spread">
                  <button
                    type="button"
                    className="admin-link-btn secondary"
                    disabled={!hasMissingPrev || missingLoading}
                    onClick={() => void loadMissingContents(Math.max(0, missingOffset - missingLimit))}
                  >
                    Prev
                  </button>
                  <span className="admin-muted">offset: {missingOffset}</span>
                  <button
                    type="button"
                    className="admin-link-btn secondary"
                    disabled={!hasMissingNext || missingLoading}
                    onClick={() => void loadMissingContents(missingOffset + missingLimit)}
                  >
                    Next
                  </button>
                </div>
              </article>

              <article className="admin-card">
                <div className="admin-inline-actions spread">
                  <h2>Override History</h2>
                  <button
                    type="button"
                    className="admin-link-btn secondary"
                    disabled={overridesLoading}
                    onClick={() => void loadContentOverrides(0)}
                  >
                    Refresh
                  </button>
                </div>
                <div className="admin-list compact">
                  {contentOverrides.map((entry) => (
                    <div key={`${entry.media_type}-${entry.tmdb_id}-${entry.season_number}`} className="admin-list-item top">
                      <div>
                        <strong>{entry.title || `TMDB ${entry.tmdb_id}`}</strong>
                        <p className="admin-muted">
                          {CONTENT_MEDIA_LABEL[entry.media_type]} / tmdb:{entry.tmdb_id}
                          {entry.media_type === "season" ? ` / season:${entry.season_number}` : ""}
                        </p>
                        <p className="admin-muted">
                          override final: {entry.override?.final_state || "-"} /{" "}
                          {entry.override?.final_completed_at || "-"}
                        </p>
                        <p className="admin-muted">
                          reason: {entry.override?.reason || "-"} / by: {entry.override?.admin_email || "-"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="admin-link-btn secondary"
                        onClick={() =>
                          void loadContentLookup({
                            media_type: entry.media_type,
                            tmdb_id: entry.tmdb_id,
                            season_number: entry.season_number,
                          })
                        }
                      >
                        Open
                      </button>
                    </div>
                  ))}
                  {overridesLoading ? <p className="admin-muted">Loading...</p> : null}
                  {!overridesLoading && contentOverrides.length === 0 ? (
                    <p className="admin-muted">No override history.</p>
                  ) : null}
                </div>
                <div className="admin-inline-actions spread">
                  <button
                    type="button"
                    className="admin-link-btn secondary"
                    disabled={!hasOverridesPrev || overridesLoading}
                    onClick={() =>
                      void loadContentOverrides(Math.max(0, overridesOffset - overridesLimit))
                    }
                  >
                    Prev
                  </button>
                  <span className="admin-muted">offset: {overridesOffset}</span>
                  <button
                    type="button"
                    className="admin-link-btn secondary"
                    disabled={!hasOverridesNext || overridesLoading}
                    onClick={() => void loadContentOverrides(overridesOffset + overridesLimit)}
                  >
                    Next
                  </button>
                </div>
              </article>

              <article className="admin-card">
                <div className="admin-inline-actions spread">
                  <h2>Content Audit Logs</h2>
                  <button
                    type="button"
                    className="admin-link-btn secondary"
                    disabled={contentAuditLoading}
                    onClick={() => void loadContentAuditLogs(0)}
                  >
                    Refresh
                  </button>
                </div>
                <div className="admin-field">
                  <label>Action Type</label>
                  <select
                    value={contentAuditActionType}
                    onChange={(event) => setContentAuditActionType(event.target.value)}
                  >
                    <option value="">All</option>
                    <option value="OVERRIDE_UPSERT">OVERRIDE_UPSERT</option>
                    <option value="OVERRIDE_DELETE">OVERRIDE_DELETE</option>
                  </select>
                </div>
                <div className="admin-list compact">
                  {contentAuditLogs.map((log) => (
                    <div key={log.id} className="admin-list-item top">
                      <div>
                        <strong>{log.title || `TMDB ${log.tmdb_id}`}</strong>
                        <p className="admin-muted">
                          {log.action_type} / {CONTENT_MEDIA_LABEL[log.media_type]} / tmdb:{log.tmdb_id}
                          {log.media_type === "season" ? ` / season:${log.season_number}` : ""}
                        </p>
                        <p className="admin-muted">
                          effective final: {log.effective_final_state || "-"} /{" "}
                          {log.effective_final_completed_at || "-"}
                        </p>
                        <p className="admin-muted">
                          by: {log.admin_email || "-"} / reason: {log.reason || "-"}
                        </p>
                      </div>
                      <span className="admin-muted">{formatDate(log.created_at)}</span>
                    </div>
                  ))}
                  {contentAuditLoading ? <p className="admin-muted">Loading...</p> : null}
                  {!contentAuditLoading && contentAuditLogs.length === 0 ? (
                    <p className="admin-muted">No audit logs.</p>
                  ) : null}
                </div>
                <div className="admin-inline-actions spread">
                  <button
                    type="button"
                    className="admin-link-btn secondary"
                    disabled={!hasContentAuditPrev || contentAuditLoading}
                    onClick={() =>
                      void loadContentAuditLogs(Math.max(0, contentAuditOffset - contentAuditLimit))
                    }
                  >
                    Prev
                  </button>
                  <span className="admin-muted">offset: {contentAuditOffset}</span>
                  <button
                    type="button"
                    className="admin-link-btn secondary"
                    disabled={!hasContentAuditNext || contentAuditLoading}
                    onClick={() => void loadContentAuditLogs(contentAuditOffset + contentAuditLimit)}
                  >
                    Next
                  </button>
                </div>
              </article>
            </div>
          </section>
        ) : null}

        {tab === "users" ? (
          <section className="admin-section admin-two-col">
            <article className="admin-card">
              <h2>User Search</h2>
              <div className="admin-search-row">
                <input
                  value={usersQuery}
                  onChange={(event) => setUsersQuery(event.target.value)}
                  placeholder="email or user_id"
                />
                <button
                  type="button"
                  className="admin-link-btn"
                  disabled={usersLoading}
                  onClick={() => {
                    setUsersOffset(0);
                    void loadUsers(usersQuery, 0);
                  }}
                >
                  Search
                </button>
              </div>

              <div className="admin-list">
                {users.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`admin-user-item ${selectedUser?.id === item.id ? "active" : ""}`}
                    onClick={() => void loadUserFollows(item.id)}
                  >
                    <div>
                      <strong>{item.email}</strong>
                      <p className="admin-muted">user_id: {item.id}</p>
                    </div>
                    <div className="admin-user-meta">
                      <span>{item.follows_count} follows</span>
                      {item.pending_outbox_count > 0 ? (
                        <span>{item.pending_outbox_count} pending</span>
                      ) : null}
                      {item.is_admin ? <span className="admin-pill">admin</span> : null}
                    </div>
                  </button>
                ))}
                {usersLoading ? <p className="admin-muted">Loading...</p> : null}
                {!usersLoading && users.length === 0 ? (
                  <p className="admin-muted">No users found.</p>
                ) : null}
              </div>

              <div className="admin-inline-actions spread">
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasUsersPrev || usersLoading}
                  onClick={() => void loadUsers(usersQuery, Math.max(0, usersOffset - usersLimit))}
                >
                  Prev
                </button>
                <span className="admin-muted">
                  {usersTotal === 0
                    ? "0"
                    : `${usersOffset + 1}-${Math.min(usersOffset + usersLimit, usersTotal)}`}{" "}
                  / {usersTotal}
                </span>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasUsersNext || usersLoading}
                  onClick={() => void loadUsers(usersQuery, usersOffset + usersLimit)}
                >
                  Next
                </button>
              </div>
            </article>

            <article className="admin-card">
              <h2>User Details</h2>
              {!selectedUser ? <p className="admin-muted">Select a user from the list.</p> : null}
              {selectedUser ? (
                <>
                  <div className="admin-detail-header">
                    <div>
                      <strong>{selectedUser.email}</strong>
                      <p className="admin-muted">user_id: {selectedUser.id}</p>
                      <p className="admin-muted">joined: {formatDate(selectedUser.created_at)}</p>
                    </div>
                    <button
                      type="button"
                      className="admin-link-btn"
                      disabled={detailActionLoading}
                      onClick={() => void refreshSelectedUser()}
                    >
                      Refresh User
                    </button>
                  </div>

                  <div className="admin-list">
                    {selectedFollows.map((follow) => (
                      <div key={follow.id} className="admin-list-item">
                        <div>
                          <strong>{follow.title || `TMDB ${follow.tmdb_id}`}</strong>
                          <p className="admin-muted">
                            {TARGET_LABEL[follow.target_type]} / tmdb:{follow.tmdb_id}
                            {follow.season_number !== null ? ` / season:${follow.season_number}` : ""}
                          </p>
                          <p className="admin-muted">
                            status: {follow.status_raw || "-"} / cache:{" "}
                            {formatDate(follow.cache_updated_at)}
                          </p>
                        </div>
                        <div className="admin-inline-actions">
                          <span className="admin-pill">{follow.frequency}</span>
                          <button
                            type="button"
                            className="admin-link-btn danger"
                            disabled={detailActionLoading}
                            onClick={() =>
                              void deleteFollow(follow.id, follow.title, follow.tmdb_id)
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                    {detailLoading ? <p className="admin-muted">Loading...</p> : null}
                    {!detailLoading && selectedFollows.length === 0 ? (
                      <p className="admin-muted">No follows.</p>
                    ) : null}
                  </div>
                </>
              ) : null}
            </article>
          </section>
        ) : null}

        {tab === "cdcEvents" ? (
          <section className="admin-section admin-two-col">
            <article className="admin-card">
              <h2>CDC Filters</h2>
              <div className="admin-field">
                <label>Search</label>
                <input
                  value={cdcQ}
                  onChange={(event) => setCdcQ(event.target.value)}
                  placeholder="email or tmdb id"
                />
              </div>
              <div className="admin-field">
                <label>Event Type</label>
                <select value={cdcEventType} onChange={(event) => setCdcEventType(event.target.value)}>
                  <option value="">All</option>
                  <option value="date_set">date_set</option>
                  <option value="date_changed">date_changed</option>
                  <option value="status_milestone">status_milestone</option>
                  <option value="season_binge_ready">season_binge_ready</option>
                  <option value="full_run_concluded">full_run_concluded</option>
                </select>
              </div>
              <div className="admin-field">
                <label>Source Type</label>
                <select value={cdcSource} onChange={(event) => setCdcSource(event.target.value)}>
                  <option value="">All</option>
                  <option value="movie">movie</option>
                  <option value="tv_full">tv_full</option>
                  <option value="tv_season">tv_season</option>
                </select>
              </div>
              <div className="admin-field">
                <label>Content Id</label>
                <input
                  value={cdcContentId}
                  onChange={(event) => setCdcContentId(event.target.value)}
                  placeholder="tmdb id"
                />
              </div>
              <div className="admin-field">
                <label>Created From</label>
                <input
                  type="datetime-local"
                  value={cdcCreatedFrom}
                  onChange={(event) => setCdcCreatedFrom(event.target.value)}
                />
              </div>
              <div className="admin-field">
                <label>Created To</label>
                <input
                  type="datetime-local"
                  value={cdcCreatedTo}
                  onChange={(event) => setCdcCreatedTo(event.target.value)}
                />
              </div>
              <div className="admin-inline-actions">
                <button
                  type="button"
                  className="admin-link-btn"
                  disabled={cdcLoading}
                  onClick={() => void loadCdcEvents(0)}
                >
                  Search
                </button>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={cdcLoading}
                  onClick={() => {
                    setCdcQ("");
                    setCdcEventType("");
                    setCdcSource("");
                    setCdcContentId("");
                    setCdcCreatedFrom("");
                    setCdcCreatedTo("");
                    setCdcOffset(0);
                    setCdcEvents([]);
                    setCdcLastCount(0);
                  }}
                >
                  Reset
                </button>
              </div>
              <div className="admin-inline-actions spread">
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasCdcPrev || cdcLoading}
                  onClick={() => void loadCdcEvents(Math.max(0, cdcOffset - cdcLimit))}
                >
                  Prev
                </button>
                <span className="admin-muted">offset: {cdcOffset}</span>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasCdcNext || cdcLoading}
                  onClick={() => void loadCdcEvents(cdcOffset + cdcLimit)}
                >
                  Next
                </button>
              </div>
            </article>

            <article className="admin-card">
              <h2>CDC Events</h2>
              <div className="admin-list">
                {cdcEvents.map((event) => (
                  <div key={event.id} className="admin-list-item">
                    <div>
                      <strong>{event.event_type}</strong>
                      <p className="admin-muted">
                        {event.user_email || "-"} / {event.source || "-"} /{" "}
                        {event.title || `TMDB ${event.tmdb_id || "-"}`}
                      </p>
                      <p className="admin-muted">
                        content_id: {event.content_id || "-"} / season:{" "}
                        {event.season_number === null ? "-" : event.season_number}
                      </p>
                      {event.event_payload ? (
                        <p className="admin-muted">
                          payload: {JSON.stringify(event.event_payload).slice(0, 160)}
                        </p>
                      ) : null}
                    </div>
                    <span className="admin-muted">{formatDate(event.created_at)}</span>
                  </div>
                ))}
                {cdcLoading ? <p className="admin-muted">Loading...</p> : null}
                {!cdcLoading && cdcEvents.length === 0 ? (
                  <p className="admin-muted">No events found.</p>
                ) : null}
              </div>
            </article>
          </section>
        ) : null}

        {tab === "reports" ? (
          <section className="admin-section admin-two-col">
            <article className="admin-card">
              <h2>Report Filters</h2>
              <div className="admin-field">
                <label>Job Name</label>
                <input
                  value={reportsCrawlerName}
                  onChange={(event) => setReportsCrawlerName(event.target.value)}
                  placeholder="dispatch_email, refresh_all, refresh_user"
                />
              </div>
              <div className="admin-field">
                <label>Status</label>
                <select
                  value={reportsStatus}
                  onChange={(event) => setReportsStatus(event.target.value)}
                >
                  <option value="">All</option>
                  <option value="success">success</option>
                  <option value="warning">warning</option>
                  <option value="failure">failure</option>
                </select>
              </div>
              <div className="admin-field">
                <label>Created From</label>
                <input
                  type="datetime-local"
                  value={reportsCreatedFrom}
                  onChange={(event) => setReportsCreatedFrom(event.target.value)}
                />
              </div>
              <div className="admin-field">
                <label>Created To</label>
                <input
                  type="datetime-local"
                  value={reportsCreatedTo}
                  onChange={(event) => setReportsCreatedTo(event.target.value)}
                />
              </div>
              <div className="admin-inline-actions">
                <button
                  type="button"
                  className="admin-link-btn"
                  disabled={reportsLoading}
                  onClick={() => void Promise.all([loadReports(0), loadDailySummary()])}
                >
                  Search
                </button>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={reportsLoading}
                  onClick={() => {
                    setReportsCrawlerName("");
                    setReportsStatus("");
                    setReportsCreatedFrom("");
                    setReportsCreatedTo("");
                    setReportsOffset(0);
                    setReports([]);
                    setReportsLastCount(0);
                    setDailySummary(null);
                  }}
                >
                  Reset
                </button>
              </div>
              <div className="admin-inline-actions spread">
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasReportsPrev || reportsLoading}
                  onClick={() => void loadReports(Math.max(0, reportsOffset - reportsLimit))}
                >
                  Prev
                </button>
                <span className="admin-muted">offset: {reportsOffset}</span>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasReportsNext || reportsLoading}
                  onClick={() => void loadReports(reportsOffset + reportsLimit)}
                >
                  Next
                </button>
              </div>

              <hr className="admin-divider" />

              <div className="admin-field">
                <label>Cleanup Keep Days</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={cleanupKeepDays}
                  onChange={(event) => setCleanupKeepDays(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="admin-link-btn danger"
                disabled={cleanupLoading}
                onClick={() => void cleanupReports()}
              >
                Cleanup Old Reports
              </button>
            </article>

            <div className="admin-stack">
              <article className="admin-card">
                <div className="admin-inline-actions spread">
                  <h2>Daily Summary</h2>
                  <div className="admin-inline-actions">
                    <button
                      type="button"
                      className="admin-link-btn secondary"
                      disabled={dailySummaryLoading}
                      onClick={() => void loadDailySummary()}
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      className="admin-link-btn"
                      disabled={!dailySummary?.summary_text}
                      onClick={() => void copySummary()}
                    >
                      Copy Summary
                    </button>
                  </div>
                </div>
                {dailySummaryLoading ? <p className="admin-muted">Loading...</p> : null}
                {dailySummary ? (
                  <>
                    <p className="admin-muted">{dailySummary.subject_text}</p>
                    <ul className="admin-chip-list">
                      {Object.entries(dailySummary.counts || {}).map(([key, count]) => (
                        <li key={key}>
                          <span>{key}</span>
                          <strong>{count}</strong>
                        </li>
                      ))}
                      <li>
                        <span>total_reports</span>
                        <strong>{dailySummary.total_reports}</strong>
                      </li>
                    </ul>
                    <pre className="admin-pre">{dailySummary.summary_text}</pre>
                  </>
                ) : null}
              </article>

              <article className="admin-card">
                <h2>Report List</h2>
                <div className="admin-list">
                  {reports.map((report) => (
                    <div key={report.id} className="admin-list-item">
                      <div>
                        <strong>{report.crawler_name}</strong>
                        <p className="admin-muted">
                          {formatDate(report.created_at)} / {report.status}
                        </p>
                        <p className="admin-muted">{formatReportSummary(report.report_data)}</p>
                        <details>
                          <summary className="admin-muted">raw report data</summary>
                          <pre className="admin-pre compact">
                            {JSON.stringify(report.report_data, null, 2)}
                          </pre>
                        </details>
                      </div>
                      <span className={statusBadgeClass(report.normalized_status)}>
                        {report.normalized_status}
                      </span>
                    </div>
                  ))}
                  {reportsLoading ? <p className="admin-muted">Loading...</p> : null}
                  {!reportsLoading && reports.length === 0 ? (
                    <p className="admin-muted">No reports found.</p>
                  ) : null}
                </div>
              </article>
            </div>
          </section>
        ) : null}

        {tab === "dailyNotification" ? (
          <section className="admin-section admin-two-col">
            <article className="admin-card">
              <h2>Daily Notification Report</h2>
              <div className="admin-field">
                <label>Date</label>
                <input
                  type="date"
                  value={dailyDate}
                  onChange={(event) => setDailyDate(event.target.value)}
                />
              </div>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={dailyIncludeFailed}
                  onChange={(event) => setDailyIncludeFailed(event.target.checked)}
                />
                include failed
              </label>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={dailyIncludePending}
                  onChange={(event) => setDailyIncludePending(event.target.checked)}
                />
                include pending/sending
              </label>
              <div className="admin-inline-actions">
                <button
                  type="button"
                  className="admin-link-btn"
                  disabled={dailyLoading}
                  onClick={() => void loadDailyNotification()}
                >
                  Load Report
                </button>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!dailyPayload?.text_report}
                  onClick={() => void copyDailyNotification()}
                >
                  Copy Report
                </button>
              </div>
            </article>

            <article className="admin-card">
              <h2>Summary</h2>
              {dailyLoading ? <p className="admin-muted">Loading...</p> : null}
              {dailyPayload ? (
                <>
                  <ul className="admin-chip-list">
                    <li>
                      <span>total</span>
                      <strong>{dailyPayload.stats.total_items}</strong>
                    </li>
                    <li>
                      <span>sent</span>
                      <strong>{dailyPayload.stats.sent_count}</strong>
                    </li>
                    <li>
                      <span>pending</span>
                      <strong>{dailyPayload.stats.pending_count}</strong>
                    </li>
                    <li>
                      <span>failed</span>
                      <strong>{dailyPayload.stats.failed_count}</strong>
                    </li>
                    <li>
                      <span>recipients</span>
                      <strong>{dailyPayload.stats.unique_recipients}</strong>
                    </li>
                  </ul>
                  <p className="admin-muted">
                    duration:{" "}
                    {typeof dailyPayload.stats.duration_seconds === "number"
                      ? `${dailyPayload.stats.duration_seconds.toFixed(2)}s`
                      : "-"}
                  </p>
                  <p className="admin-muted">
                    event_counts: {JSON.stringify(dailyPayload.stats.event_counts || {})}
                  </p>
                  <pre className="admin-pre">{dailyPayload.text_report}</pre>

                  <h3>Items</h3>
                  <div className="admin-list">
                    {dailyItems.map((item) => (
                      <div key={item.id} className="admin-list-item">
                        <div>
                          <strong>{item.title || `TMDB ${item.tmdb_id || "-"}`}</strong>
                          <p className="admin-muted">
                            {item.channel} / {item.status} / {item.user_email || "-"}
                          </p>
                          <p className="admin-muted">
                            created: {formatDate(item.created_at)} / sent: {formatDate(item.sent_at)}
                          </p>
                          {item.last_error ? (
                            <p className="admin-error-text">{item.last_error}</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {dailyItems.length === 0 ? (
                      <p className="admin-muted">No items in selected date.</p>
                    ) : null}
                  </div>
                </>
              ) : null}
            </article>
          </section>
        ) : null}

        {tab === "ops" ? (
          <section className="admin-section admin-two-col">
            <article className="admin-card">
              <h2>Manual Operations</h2>
              <div className="admin-field">
                <label>dispatch batch (optional)</label>
                <input
                  value={dispatchBatch}
                  onChange={(event) => setDispatchBatch(event.target.value)}
                  placeholder="e.g. 50"
                />
              </div>
              <button
                type="button"
                className="admin-link-btn"
                disabled={opsLoading}
                onClick={() => void runDispatch()}
              >
                Run Email Dispatch
              </button>

              <hr className="admin-divider" />

              <div className="admin-field">
                <label>limit_users (optional)</label>
                <input
                  value={limitUsers}
                  onChange={(event) => setLimitUsers(event.target.value)}
                  placeholder="e.g. 100"
                />
              </div>
              <div className="admin-field">
                <label>limit_follows (optional)</label>
                <input
                  value={limitFollows}
                  onChange={(event) => setLimitFollows(event.target.value)}
                  placeholder="e.g. 500"
                />
              </div>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={forceRefresh}
                  onChange={(event) => setForceRefresh(event.target.checked)}
                />
                use force_fetch
              </label>
              <div className="admin-inline-actions">
                <button
                  type="button"
                  className="admin-link-btn"
                  disabled={opsLoading}
                  onClick={() => void runRefreshAll()}
                >
                  Run Refresh All
                </button>
                <button type="button" className="admin-link-btn secondary" onClick={saveOpsSettings}>
                  Save Trigger Settings
                </button>
              </div>
            </article>

            <article className="admin-card">
              <div className="admin-inline-actions spread">
                <h2>Outbox Summary</h2>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={summaryLoading}
                  onClick={() => void loadOutboxSummary()}
                >
                  Refresh
                </button>
              </div>
              {summaryLoading ? <p className="admin-muted">Loading...</p> : null}

              <h3>By Status</h3>
              <ul className="admin-chip-list">
                {Object.entries(summary?.by_status || {}).map(([status, count]) => (
                  <li key={status}>
                    <span>{status}</span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>

              <h3>By Channel + Status</h3>
              <div className="admin-list">
                {(summary?.by_channel_and_status || []).map((row) => (
                  <div key={`${row.channel}-${row.status}`} className="admin-list-item">
                    <span>
                      {row.channel} / {row.status}
                    </span>
                    <strong>{row.count}</strong>
                  </div>
                ))}
              </div>

              <h3>Recent Failures</h3>
              <div className="admin-list">
                {(summary?.recent_failures || []).map((item) => (
                  <div key={item.id} className="admin-list-item">
                    <div>
                      <strong>{item.email}</strong>
                      <p className="admin-muted">
                        {item.channel} / attempts: {item.attempt_count}
                      </p>
                      {item.last_error ? (
                        <p className="admin-error-text">{item.last_error}</p>
                      ) : null}
                    </div>
                    <span className="admin-muted">{formatDate(item.created_at)}</span>
                  </div>
                ))}
              </div>
              <p className="admin-muted">
                oldest pending: {formatDate(summary?.oldest_pending_created_at)}
              </p>
            </article>
          </section>
        ) : null}
      </div>
    </div>
  );
};
