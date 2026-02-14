import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";

type TabKey =
  | "contents"
  | "missingCompletion"
  | "missingPublication"
  | "opsLog"
  | "cdcEvents"
  | "reports"
  | "dailyNotification";

type Tone = "info" | "success" | "error";
type ManagedMediaType = "movie" | "tv" | "season";

type ManagedContentFields = {
  status_raw: string | null;
  release_date: string | null;
  first_air_date: string | null;
  last_air_date: string | null;
  next_air_date: string | null;
  season_air_date: string | null;
  season_last_episode_air_date: string | null;
  season_count: number | null;
  episode_count: number | null;
  last_episode_date: string | null;
  next_episode_date: string | null;
  final_state: string | null;
  final_completed_at: string | null;
};

type ManagedContentOverride = {
  id: number;
  status_raw: string | null;
  release_date: string | null;
  next_air_date: string | null;
  final_state: string | null;
  final_completed_at: string | null;
  reason: string | null;
  admin_email: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ManagedContentItem = {
  key: string;
  media_type: ManagedMediaType;
  tmdb_id: number;
  season_number: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  base: ManagedContentFields;
  override: ManagedContentOverride | null;
  effective: {
    status_raw: string | null;
    release_date: string | null;
    next_air_date: string | null;
    final_state: string | null;
    final_completed_at: string | null;
    missing_final_completed_at: boolean;
  };
  payload?: Record<string, unknown>;
  fetched_at?: string | null;
  expires_at?: string | null;
  updated_at: string | null;
};

type ManagedContentsPayload = {
  success: boolean;
  items: ManagedContentItem[];
  limit: number;
  offset: number;
};

type ManagedContentAuditLog = {
  id: number;
  created_at: string | null;
  action_type: "OVERRIDE_UPSERT" | "OVERRIDE_DELETE" | string;
  reason: string | null;
  admin_email: string | null;
  media_type: ManagedMediaType;
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

type CdcEventItem = {
  id: number;
  created_at: string | null;
  event_type: string;
  event_payload: Record<string, unknown> | null;
  follow_id: number | null;
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

type ContentLookupTarget = {
  media_type: ManagedMediaType;
  tmdb_id: number;
  season_number: number;
};

const MEDIA_LABEL: Record<ManagedMediaType, string> = {
  movie: "Movie",
  tv: "TV",
  season: "Season",
};

const SOURCE_LABEL: Record<string, string> = {
  movie: "Movie",
  tv_full: "TV Full",
  tv_season: "TV Season",
};

const todayDateInput = () => new Date().toISOString().slice(0, 10);

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
    "duration_seconds",
  ];
  for (const key of keys) {
    const value = reportData[key];
    if (value !== undefined && value !== null && value !== "") {
      return `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`;
    }
  }
  return "-";
};

const formatPayloadSnippet = (payload: Record<string, unknown> | null | undefined) => {
  if (!payload) {
    return "-";
  }
  try {
    const serialized = JSON.stringify(payload);
    return serialized.length > 240 ? `${serialized.slice(0, 240)}...` : serialized;
  } catch {
    return "-";
  }
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

const contentTargetText = (item: ContentLookupTarget) =>
  `${MEDIA_LABEL[item.media_type]} / tmdb:${item.tmdb_id}${
    item.media_type === "season" ? ` / season:${item.season_number}` : ""
  }`;

export const AdminPage = () => {
  const { token, user, loadingUser, logout } = useAuth();
  const canAccessAdmin = Boolean(token && user?.is_admin);

  const [tab, setTab] = useState<TabKey>("contents");
  const [toast, setToast] = useState<{ text: string; tone: Tone } | null>(null);

  const [contentQ, setContentQ] = useState("");
  const [contentMediaType, setContentMediaType] = useState("");
  const [contentHasOverride, setContentHasOverride] = useState("");
  const [contents, setContents] = useState<ManagedContentItem[]>([]);
  const [contentsLoading, setContentsLoading] = useState(false);
  const [contentOffset, setContentOffset] = useState(0);
  const [contentLimit] = useState(30);
  const [contentLastCount, setContentLastCount] = useState(0);
  const [selectedContent, setSelectedContent] = useState<ManagedContentItem | null>(null);

  const [overrideStatusRaw, setOverrideStatusRaw] = useState("");
  const [overrideReleaseDate, setOverrideReleaseDate] = useState("");
  const [overrideNextAirDate, setOverrideNextAirDate] = useState("");
  const [overrideFinalState, setOverrideFinalState] = useState("");
  const [overrideFinalCompletedAt, setOverrideFinalCompletedAt] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSaving, setOverrideSaving] = useState(false);

  const [missingCompletionQ, setMissingCompletionQ] = useState("");
  const [missingCompletionMediaType, setMissingCompletionMediaType] = useState("");
  const [missingCompletionItems, setMissingCompletionItems] = useState<ManagedContentItem[]>([]);
  const [missingCompletionLoading, setMissingCompletionLoading] = useState(false);
  const [missingCompletionOffset, setMissingCompletionOffset] = useState(0);
  const [missingCompletionLimit] = useState(30);
  const [missingCompletionLastCount, setMissingCompletionLastCount] = useState(0);

  const [missingPublicationQ, setMissingPublicationQ] = useState("");
  const [missingPublicationMediaType, setMissingPublicationMediaType] = useState("");
  const [missingPublicationItems, setMissingPublicationItems] = useState<ManagedContentItem[]>([]);
  const [missingPublicationLoading, setMissingPublicationLoading] = useState(false);
  const [missingPublicationOffset, setMissingPublicationOffset] = useState(0);
  const [missingPublicationLimit] = useState(30);
  const [missingPublicationLastCount, setMissingPublicationLastCount] = useState(0);

  const [auditQ, setAuditQ] = useState("");
  const [auditActionType, setAuditActionType] = useState("");
  const [auditMediaType, setAuditMediaType] = useState("");
  const [auditLogs, setAuditLogs] = useState<ManagedContentAuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditLimit] = useState(30);
  const [auditLastCount, setAuditLastCount] = useState(0);

  const [cdcQ, setCdcQ] = useState("");
  const [cdcEventType, setCdcEventType] = useState("");
  const [cdcSource, setCdcSource] = useState("");
  const [cdcContentId, setCdcContentId] = useState("");
  const [cdcCreatedFrom, setCdcCreatedFrom] = useState("");
  const [cdcCreatedTo, setCdcCreatedTo] = useState("");
  const [cdcEvents, setCdcEvents] = useState<CdcEventItem[]>([]);
  const [cdcLoading, setCdcLoading] = useState(false);
  const [cdcOffset, setCdcOffset] = useState(0);
  const [cdcLimit] = useState(50);
  const [cdcLastCount, setCdcLastCount] = useState(0);

  const [reportsCrawlerName, setReportsCrawlerName] = useState("");
  const [reportsStatus, setReportsStatus] = useState("");
  const [reportsCreatedFrom, setReportsCreatedFrom] = useState("");
  const [reportsCreatedTo, setReportsCreatedTo] = useState("");
  const [reports, setReports] = useState<JobReportItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsOffset, setReportsOffset] = useState(0);
  const [reportsLimit] = useState(50);
  const [reportsLastCount, setReportsLastCount] = useState(0);
  const [dailySummary, setDailySummary] = useState<DailySummaryPayload | null>(null);
  const [dailySummaryLoading, setDailySummaryLoading] = useState(false);
  const [cleanupKeepDays, setCleanupKeepDays] = useState("14");
  const [cleanupLoading, setCleanupLoading] = useState(false);

  const [dailyDate, setDailyDate] = useState(todayDateInput());
  const [dailyIncludeFailed, setDailyIncludeFailed] = useState(false);
  const [dailyIncludePending, setDailyIncludePending] = useState(false);
  const [dailyPayload, setDailyPayload] = useState<DailyNotificationPayload | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);

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
    const current = selectedContent?.override;
    setOverrideStatusRaw(current?.status_raw || "");
    setOverrideReleaseDate(toDateInput(current?.release_date));
    setOverrideNextAirDate(toDateInput(current?.next_air_date));
    setOverrideFinalState(current?.final_state || "");
    setOverrideFinalCompletedAt(toDateInput(current?.final_completed_at));
    setOverrideReason(current?.reason || "");
  }, [selectedContent]);

  const loadContents = async (
    nextOffset = contentOffset,
    filters?: { q?: string; mediaType?: string; hasOverride?: string },
  ) => {
    setContentsLoading(true);
    try {
      const q = filters?.q ?? contentQ;
      const mediaType = filters?.mediaType ?? contentMediaType;
      const hasOverride = filters?.hasOverride ?? contentHasOverride;
      const params = new URLSearchParams({
        limit: String(contentLimit),
        offset: String(nextOffset),
      });
      if (q.trim()) {
        params.set("q", q.trim());
      }
      if (mediaType) {
        params.set("media_type", mediaType);
      }
      if (hasOverride) {
        params.set("has_override", hasOverride);
      }
      const payload = await apiFetch<ManagedContentsPayload>(
        `/api/admin/contents/search?${params.toString()}`,
      );
      const items = payload.items || [];
      setContents(items);
      setContentOffset(payload.offset);
      setContentLastCount(items.length);
      setSelectedContent((prev) => {
        if (!items.length) {
          return null;
        }
        if (!prev) {
          return items[0];
        }
        const matched = items.find((item) => item.key === prev.key);
        return matched || items[0];
      });
    } catch (error) {
      notify(messageOf(error, "Failed to load contents."), "error");
    } finally {
      setContentsLoading(false);
    }
  };

  const loadContentLookup = async (target: ContentLookupTarget | ManagedContentItem) => {
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
      setContents((prev) => {
        const exists = prev.some((item) => item.key === content.key);
        if (!exists) {
          return prev;
        }
        return prev.map((item) => (item.key === content.key ? content : item));
      });
    } catch (error) {
      notify(messageOf(error, "Failed to load content details."), "error");
    }
  };

  const loadMissingCompletion = async (
    nextOffset = missingCompletionOffset,
    filters?: { q?: string; mediaType?: string },
  ) => {
    setMissingCompletionLoading(true);
    try {
      const q = filters?.q ?? missingCompletionQ;
      const mediaType = filters?.mediaType ?? missingCompletionMediaType;
      const params = new URLSearchParams({
        limit: String(missingCompletionLimit),
        offset: String(nextOffset),
      });
      if (q.trim()) {
        params.set("q", q.trim());
      }
      if (mediaType) {
        params.set("media_type", mediaType);
      }
      const payload = await apiFetch<ManagedContentsPayload>(
        `/api/admin/contents/missing-final-date?${params.toString()}`,
      );
      const items = payload.items || [];
      setMissingCompletionItems(items);
      setMissingCompletionOffset(payload.offset);
      setMissingCompletionLastCount(items.length);
    } catch (error) {
      notify(messageOf(error, "Failed to load missing final-date contents."), "error");
    } finally {
      setMissingCompletionLoading(false);
    }
  };

  const loadMissingPublication = async (
    nextOffset = missingPublicationOffset,
    filters?: { q?: string; mediaType?: string },
  ) => {
    setMissingPublicationLoading(true);
    try {
      const q = filters?.q ?? missingPublicationQ;
      const mediaType = filters?.mediaType ?? missingPublicationMediaType;
      const params = new URLSearchParams({
        limit: String(missingPublicationLimit),
        offset: String(nextOffset),
      });
      if (q.trim()) {
        params.set("q", q.trim());
      }
      if (mediaType) {
        params.set("media_type", mediaType);
      }
      const payload = await apiFetch<ManagedContentsPayload>(
        `/api/admin/contents/missing-publication-date?${params.toString()}`,
      );
      const items = payload.items || [];
      setMissingPublicationItems(items);
      setMissingPublicationOffset(payload.offset);
      setMissingPublicationLastCount(items.length);
    } catch (error) {
      notify(messageOf(error, "Failed to load missing publication-date contents."), "error");
    } finally {
      setMissingPublicationLoading(false);
    }
  };

  const loadAuditLogs = async (
    nextOffset = auditOffset,
    filters?: { q?: string; actionType?: string; mediaType?: string },
  ) => {
    setAuditLoading(true);
    try {
      const q = filters?.q ?? auditQ;
      const actionType = filters?.actionType ?? auditActionType;
      const mediaType = filters?.mediaType ?? auditMediaType;
      const params = new URLSearchParams({
        limit: String(auditLimit),
        offset: String(nextOffset),
      });
      if (q.trim()) {
        params.set("q", q.trim());
      }
      if (actionType) {
        params.set("action_type", actionType);
      }
      if (mediaType) {
        params.set("media_type", mediaType);
      }
      const payload = await apiFetch<ManagedContentAuditPayload>(
        `/api/admin/audit/logs?${params.toString()}`,
      );
      const logs = payload.logs || [];
      setAuditLogs(logs);
      setAuditOffset(payload.offset);
      setAuditLastCount(logs.length);
    } catch (error) {
      notify(messageOf(error, "Failed to load operation logs."), "error");
    } finally {
      setAuditLoading(false);
    }
  };

  const loadCdcEvents = async (
    nextOffset = cdcOffset,
    filters?: {
      q?: string;
      eventType?: string;
      source?: string;
      contentId?: string;
      createdFrom?: string;
      createdTo?: string;
    },
  ) => {
    setCdcLoading(true);
    try {
      const q = filters?.q ?? cdcQ;
      const eventType = filters?.eventType ?? cdcEventType;
      const source = filters?.source ?? cdcSource;
      const contentId = filters?.contentId ?? cdcContentId;
      const createdFrom = filters?.createdFrom ?? cdcCreatedFrom;
      const createdTo = filters?.createdTo ?? cdcCreatedTo;
      const params = new URLSearchParams({
        limit: String(cdcLimit),
        offset: String(nextOffset),
      });
      if (q.trim()) {
        params.set("q", q.trim());
      }
      if (eventType) {
        params.set("event_type", eventType);
      }
      if (source) {
        params.set("source", source);
      }
      if (contentId.trim()) {
        params.set("content_id", contentId.trim());
      }
      if (createdFrom) {
        params.set("created_from", createdFrom);
      }
      if (createdTo) {
        params.set("created_to", createdTo);
      }
      const payload = await apiFetch<CdcEventsPayload>(`/api/admin/cdc/events?${params.toString()}`);
      const items = payload.events || [];
      setCdcEvents(items);
      setCdcOffset(payload.offset);
      setCdcLastCount(items.length);
    } catch (error) {
      notify(messageOf(error, "Failed to load CDC events."), "error");
    } finally {
      setCdcLoading(false);
    }
  };

  const loadReports = async (
    nextOffset = reportsOffset,
    filters?: {
      crawlerName?: string;
      status?: string;
      createdFrom?: string;
      createdTo?: string;
    },
  ) => {
    setReportsLoading(true);
    try {
      const crawlerName = filters?.crawlerName ?? reportsCrawlerName;
      const status = filters?.status ?? reportsStatus;
      const createdFrom = filters?.createdFrom ?? reportsCreatedFrom;
      const createdTo = filters?.createdTo ?? reportsCreatedTo;
      const params = new URLSearchParams({
        limit: String(reportsLimit),
        offset: String(nextOffset),
      });
      if (crawlerName.trim()) {
        params.set("crawler_name", crawlerName.trim());
      }
      if (status) {
        params.set("status", status);
      }
      if (createdFrom) {
        params.set("created_from", createdFrom);
      }
      if (createdTo) {
        params.set("created_to", createdTo);
      }
      const payload = await apiFetch<JobReportsPayload>(
        `/api/admin/reports/daily-crawler?${params.toString()}`,
      );
      const items = payload.reports || [];
      setReports(items);
      setReportsOffset(payload.offset);
      setReportsLastCount(items.length);
    } catch (error) {
      notify(messageOf(error, "Failed to load job reports."), "error");
    } finally {
      setReportsLoading(false);
    }
  };

  const loadDailySummary = async (filters?: { createdFrom?: string; createdTo?: string }) => {
    setDailySummaryLoading(true);
    try {
      const createdFrom = filters?.createdFrom ?? reportsCreatedFrom;
      const createdTo = filters?.createdTo ?? reportsCreatedTo;
      const params = new URLSearchParams();
      if (createdFrom) {
        params.set("created_from", createdFrom);
      }
      if (createdTo) {
        params.set("created_to", createdTo);
      }
      const url = params.toString()
        ? `/api/admin/reports/daily-summary?${params.toString()}`
        : "/api/admin/reports/daily-summary";
      const payload = await apiFetch<DailySummaryPayload>(url);
      setDailySummary(payload);
    } catch (error) {
      notify(messageOf(error, "Failed to load daily summary."), "error");
      setDailySummary(null);
    } finally {
      setDailySummaryLoading(false);
    }
  };

  const loadDailyNotification = async () => {
    setDailyLoading(true);
    try {
      const params = new URLSearchParams();
      if (dailyDate) {
        params.set("date", dailyDate);
      }
      if (dailyIncludeFailed) {
        params.set("include_failed", "1");
      }
      if (dailyIncludePending) {
        params.set("include_pending", "1");
      }
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

  const saveContentOverride = async () => {
    if (!selectedContent) {
      return;
    }
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
        setSelectedContent(payload.content);
        setContents((prev) =>
          prev.map((item) => (item.key === payload.content?.key ? payload.content : item)),
        );
      }
      notify("Override saved.", "success");
      await Promise.all([loadContents(contentOffset), loadMissingCompletion(0), loadMissingPublication(0)]);
    } catch (error) {
      notify(messageOf(error, "Failed to save override."), "error");
    } finally {
      setOverrideSaving(false);
    }
  };

  const deleteContentOverride = async () => {
    if (!selectedContent) {
      return;
    }
    const confirmed = window.confirm(`Delete override for ${selectedContent.title}?`);
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
        setSelectedContent(payload.content);
        setContents((prev) =>
          prev.map((item) => (item.key === payload.content?.key ? payload.content : item)),
        );
      }
      notify("Override deleted.", "success");
      await Promise.all([loadContents(contentOffset), loadMissingCompletion(0), loadMissingPublication(0)]);
    } catch (error) {
      notify(messageOf(error, "Failed to delete override."), "error");
    } finally {
      setOverrideSaving(false);
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
      const payload = await apiFetch<{ success: boolean; deleted_count: number }>(
        "/api/admin/reports/daily-crawler/cleanup",
        {
          method: "POST",
          body: JSON.stringify({ keep_days: keepDays }),
        },
      );
      notify(`Old reports cleaned up (${payload.deleted_count}).`, "success");
      await Promise.all([loadReports(0), loadDailySummary()]);
    } catch (error) {
      notify(messageOf(error, "Failed to cleanup reports."), "error");
    } finally {
      setCleanupLoading(false);
    }
  };

  const copyDailySummary = async () => {
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
      notify("Report copied.", "success");
    } catch {
      notify("Copy failed.", "error");
    }
  };

  const openContentFromList = async (item: ManagedContentItem) => {
    setTab("contents");
    setSelectedContent(item);
    await loadContentLookup(item);
  };

  useEffect(() => {
    if (!canAccessAdmin) {
      return;
    }
    if (tab === "contents") {
      void loadContents(0);
    } else if (tab === "missingCompletion") {
      void loadMissingCompletion(0);
    } else if (tab === "missingPublication") {
      void loadMissingPublication(0);
    } else if (tab === "opsLog") {
      void loadAuditLogs(0);
    } else if (tab === "cdcEvents") {
      void loadCdcEvents(0);
    } else if (tab === "reports") {
      void Promise.all([loadReports(0), loadDailySummary()]);
    } else if (tab === "dailyNotification") {
      void loadDailyNotification();
    }
  }, [canAccessAdmin, tab]);

  const hasContentPrev = contentOffset > 0;
  const hasContentNext = contentLastCount >= contentLimit;
  const hasMissingCompletionPrev = missingCompletionOffset > 0;
  const hasMissingCompletionNext = missingCompletionLastCount >= missingCompletionLimit;
  const hasMissingPublicationPrev = missingPublicationOffset > 0;
  const hasMissingPublicationNext = missingPublicationLastCount >= missingPublicationLimit;
  const hasAuditPrev = auditOffset > 0;
  const hasAuditNext = auditLastCount >= auditLimit;
  const hasCdcPrev = cdcOffset > 0;
  const hasCdcNext = cdcLastCount >= cdcLimit;
  const hasReportsPrev = reportsOffset > 0;
  const hasReportsNext = reportsLastCount >= reportsLimit;
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
          <button
            type="button"
            className={`admin-tab-btn ${tab === "contents" ? "active" : ""}`}
            onClick={() => setTab("contents")}
          >
            콘텐츠 관리
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${tab === "missingCompletion" ? "active" : ""}`}
            onClick={() => setTab("missingCompletion")}
          >
            완결일 미설정
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${tab === "missingPublication" ? "active" : ""}`}
            onClick={() => setTab("missingPublication")}
          >
            공개일 미설정
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${tab === "opsLog" ? "active" : ""}`}
            onClick={() => setTab("opsLog")}
          >
            운영로그
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${tab === "cdcEvents" ? "active" : ""}`}
            onClick={() => setTab("cdcEvents")}
          >
            CDC 이벤트
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${tab === "reports" ? "active" : ""}`}
            onClick={() => setTab("reports")}
          >
            작업로그
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${tab === "dailyNotification" ? "active" : ""}`}
            onClick={() => setTab("dailyNotification")}
          >
            일일알림리포트
          </button>
        </nav>

        {tab === "contents" ? (
          <section className="admin-section admin-two-col">
            <article className="admin-card">
              <h2>콘텐츠 검색</h2>
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
                  <option value="movie">Movie</option>
                  <option value="tv">TV</option>
                  <option value="season">Season</option>
                </select>
              </div>
              <div className="admin-field">
                <label>Has Override</label>
                <select
                  value={contentHasOverride}
                  onChange={(event) => setContentHasOverride(event.target.value)}
                >
                  <option value="">All</option>
                  <option value="true">Only with override</option>
                  <option value="false">Only without override</option>
                </select>
              </div>
              <div className="admin-inline-actions">
                <button type="button" className="admin-link-btn" onClick={() => void loadContents(0)}>
                  Search
                </button>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  onClick={() => {
                    setContentQ("");
                    setContentMediaType("");
                    setContentHasOverride("");
                    void loadContents(0, { q: "", mediaType: "", hasOverride: "" });
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
                        {contentTargetText(item)} / updated: {formatDate(item.updated_at)}
                      </p>
                    </div>
                    {item.override ? <span className="admin-pill">override</span> : null}
                  </button>
                ))}
                {contentsLoading ? <p className="admin-muted">Loading...</p> : null}
                {!contentsLoading && contents.length === 0 ? (
                  <p className="admin-muted">No contents.</p>
                ) : null}
              </div>
            </article>

            <article className="admin-card">
              <div className="admin-inline-actions spread">
                <h2>콘텐츠 상세</h2>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!selectedContent}
                  onClick={() => {
                    if (selectedContent) {
                      void loadContentLookup(selectedContent);
                    }
                  }}
                >
                  Refresh
                </button>
              </div>
              {!selectedContent ? (
                <p className="admin-muted">검색 결과에서 콘텐츠를 선택하세요.</p>
              ) : (
                <div className="admin-stack">
                  <div className="admin-detail-header">
                    <div>
                      <h2>{selectedContent.title || `TMDB ${selectedContent.tmdb_id}`}</h2>
                      <p className="admin-muted">{contentTargetText(selectedContent)}</p>
                    </div>
                    {selectedContent.override ? (
                      <span className="admin-pill">override active</span>
                    ) : (
                      <span className="admin-pill">no override</span>
                    )}
                  </div>

                  <dl className="admin-kv compact">
                    <div>
                      <dt>base final_state</dt>
                      <dd>{selectedContent.base.final_state || "-"}</dd>
                    </div>
                    <div>
                      <dt>base final_completed_at</dt>
                      <dd>{selectedContent.base.final_completed_at || "-"}</dd>
                    </div>
                    <div>
                      <dt>effective final_state</dt>
                      <dd>{selectedContent.effective.final_state || "-"}</dd>
                    </div>
                    <div>
                      <dt>effective final_completed_at</dt>
                      <dd>{selectedContent.effective.final_completed_at || "-"}</dd>
                    </div>
                    <div>
                      <dt>effective release_date</dt>
                      <dd>{selectedContent.effective.release_date || "-"}</dd>
                    </div>
                    <div>
                      <dt>effective next_air_date</dt>
                      <dd>{selectedContent.effective.next_air_date || "-"}</dd>
                    </div>
                    <div>
                      <dt>effective status_raw</dt>
                      <dd>{selectedContent.effective.status_raw || "-"}</dd>
                    </div>
                    <div>
                      <dt>updated_at</dt>
                      <dd>{formatDate(selectedContent.updated_at)}</dd>
                    </div>
                  </dl>

                  <hr className="admin-divider" />

                  <h3>Override 편집</h3>
                  <div className="admin-field">
                    <label>override status_raw</label>
                    <input
                      value={overrideStatusRaw}
                      onChange={(event) => setOverrideStatusRaw(event.target.value)}
                    />
                  </div>
                  <div className="admin-field">
                    <label>override final_state</label>
                    <input
                      value={overrideFinalState}
                      onChange={(event) => setOverrideFinalState(event.target.value)}
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
                      Save
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
                        const current = selectedContent.override;
                        setOverrideStatusRaw(current?.status_raw || "");
                        setOverrideReleaseDate(toDateInput(current?.release_date));
                        setOverrideNextAirDate(toDateInput(current?.next_air_date));
                        setOverrideFinalState(current?.final_state || "");
                        setOverrideFinalCompletedAt(toDateInput(current?.final_completed_at));
                        setOverrideReason(current?.reason || "");
                      }}
                    >
                      Reset Form
                    </button>
                  </div>
                </div>
              )}
            </article>
          </section>
        ) : null}

        {tab === "missingCompletion" ? (
          <section className="admin-section">
            <article className="admin-card">
              <div className="admin-inline-actions spread">
                <h2>완결일 미설정</h2>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={missingCompletionLoading}
                  onClick={() => void loadMissingCompletion(0)}
                >
                  Refresh
                </button>
              </div>
              <div className="admin-form-grid">
                <div className="admin-field">
                  <label>Search</label>
                  <input
                    value={missingCompletionQ}
                    onChange={(event) => setMissingCompletionQ(event.target.value)}
                    placeholder="title or tmdb id"
                  />
                </div>
                <div className="admin-field">
                  <label>Media Type</label>
                  <select
                    value={missingCompletionMediaType}
                    onChange={(event) => setMissingCompletionMediaType(event.target.value)}
                  >
                    <option value="">All</option>
                    <option value="movie">Movie</option>
                    <option value="tv">TV</option>
                    <option value="season">Season</option>
                  </select>
                </div>
              </div>
              <div className="admin-inline-actions">
                <button
                  type="button"
                  className="admin-link-btn"
                  onClick={() => void loadMissingCompletion(0)}
                >
                  Search
                </button>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  onClick={() => {
                    setMissingCompletionQ("");
                    setMissingCompletionMediaType("");
                    void loadMissingCompletion(0, { q: "", mediaType: "" });
                  }}
                >
                  Reset
                </button>
              </div>
              <div className="admin-list">
                {missingCompletionItems.map((item) => (
                  <div key={item.key} className="admin-list-item top">
                    <div>
                      <strong>{item.title || `TMDB ${item.tmdb_id}`}</strong>
                      <p className="admin-muted">{contentTargetText(item)}</p>
                      <p className="admin-muted">
                        effective final: {item.effective.final_state || "-"} / completed:{" "}
                        {item.effective.final_completed_at || "-"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="admin-link-btn secondary"
                      onClick={() => void openContentFromList(item)}
                    >
                      Open
                    </button>
                  </div>
                ))}
                {missingCompletionLoading ? <p className="admin-muted">Loading...</p> : null}
                {!missingCompletionLoading && missingCompletionItems.length === 0 ? (
                  <p className="admin-muted">No missing items.</p>
                ) : null}
              </div>
              <div className="admin-inline-actions spread">
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasMissingCompletionPrev || missingCompletionLoading}
                  onClick={() =>
                    void loadMissingCompletion(
                      Math.max(0, missingCompletionOffset - missingCompletionLimit),
                    )
                  }
                >
                  Prev
                </button>
                <span className="admin-muted">offset: {missingCompletionOffset}</span>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasMissingCompletionNext || missingCompletionLoading}
                  onClick={() => void loadMissingCompletion(missingCompletionOffset + missingCompletionLimit)}
                >
                  Next
                </button>
              </div>
            </article>
          </section>
        ) : null}

        {tab === "missingPublication" ? (
          <section className="admin-section">
            <article className="admin-card">
              <div className="admin-inline-actions spread">
                <h2>공개일 미설정</h2>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={missingPublicationLoading}
                  onClick={() => void loadMissingPublication(0)}
                >
                  Refresh
                </button>
              </div>
              <div className="admin-form-grid">
                <div className="admin-field">
                  <label>Search</label>
                  <input
                    value={missingPublicationQ}
                    onChange={(event) => setMissingPublicationQ(event.target.value)}
                    placeholder="title or tmdb id"
                  />
                </div>
                <div className="admin-field">
                  <label>Media Type</label>
                  <select
                    value={missingPublicationMediaType}
                    onChange={(event) => setMissingPublicationMediaType(event.target.value)}
                  >
                    <option value="">All</option>
                    <option value="movie">Movie</option>
                    <option value="tv">TV</option>
                    <option value="season">Season</option>
                  </select>
                </div>
              </div>
              <div className="admin-inline-actions">
                <button
                  type="button"
                  className="admin-link-btn"
                  onClick={() => void loadMissingPublication(0)}
                >
                  Search
                </button>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  onClick={() => {
                    setMissingPublicationQ("");
                    setMissingPublicationMediaType("");
                    void loadMissingPublication(0, { q: "", mediaType: "" });
                  }}
                >
                  Reset
                </button>
              </div>
              <div className="admin-list">
                {missingPublicationItems.map((item) => (
                  <div key={item.key} className="admin-list-item top">
                    <div>
                      <strong>{item.title || `TMDB ${item.tmdb_id}`}</strong>
                      <p className="admin-muted">{contentTargetText(item)}</p>
                      <p className="admin-muted">
                        effective release: {item.effective.release_date || "-"} / next_air:{" "}
                        {item.effective.next_air_date || "-"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="admin-link-btn secondary"
                      onClick={() => void openContentFromList(item)}
                    >
                      Open
                    </button>
                  </div>
                ))}
                {missingPublicationLoading ? <p className="admin-muted">Loading...</p> : null}
                {!missingPublicationLoading && missingPublicationItems.length === 0 ? (
                  <p className="admin-muted">No missing items.</p>
                ) : null}
              </div>
              <div className="admin-inline-actions spread">
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasMissingPublicationPrev || missingPublicationLoading}
                  onClick={() =>
                    void loadMissingPublication(
                      Math.max(0, missingPublicationOffset - missingPublicationLimit),
                    )
                  }
                >
                  Prev
                </button>
                <span className="admin-muted">offset: {missingPublicationOffset}</span>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasMissingPublicationNext || missingPublicationLoading}
                  onClick={() =>
                    void loadMissingPublication(missingPublicationOffset + missingPublicationLimit)
                  }
                >
                  Next
                </button>
              </div>
            </article>
          </section>
        ) : null}

        {tab === "opsLog" ? (
          <section className="admin-section admin-two-col">
            <article className="admin-card">
              <h2>운영로그 필터</h2>
              <div className="admin-field">
                <label>Search</label>
                <input
                  value={auditQ}
                  onChange={(event) => setAuditQ(event.target.value)}
                  placeholder="title or tmdb id"
                />
              </div>
              <div className="admin-field">
                <label>Action Type</label>
                <select
                  value={auditActionType}
                  onChange={(event) => setAuditActionType(event.target.value)}
                >
                  <option value="">All</option>
                  <option value="OVERRIDE_UPSERT">OVERRIDE_UPSERT</option>
                  <option value="OVERRIDE_DELETE">OVERRIDE_DELETE</option>
                </select>
              </div>
              <div className="admin-field">
                <label>Media Type</label>
                <select
                  value={auditMediaType}
                  onChange={(event) => setAuditMediaType(event.target.value)}
                >
                  <option value="">All</option>
                  <option value="movie">Movie</option>
                  <option value="tv">TV</option>
                  <option value="season">Season</option>
                </select>
              </div>
              <div className="admin-inline-actions">
                <button type="button" className="admin-link-btn" onClick={() => void loadAuditLogs(0)}>
                  Search
                </button>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  onClick={() => {
                    setAuditQ("");
                    setAuditActionType("");
                    setAuditMediaType("");
                    void loadAuditLogs(0, { q: "", actionType: "", mediaType: "" });
                  }}
                >
                  Reset
                </button>
              </div>
              <div className="admin-inline-actions spread">
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasAuditPrev || auditLoading}
                  onClick={() => void loadAuditLogs(Math.max(0, auditOffset - auditLimit))}
                >
                  Prev
                </button>
                <span className="admin-muted">offset: {auditOffset}</span>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={!hasAuditNext || auditLoading}
                  onClick={() => void loadAuditLogs(auditOffset + auditLimit)}
                >
                  Next
                </button>
              </div>
            </article>

            <article className="admin-card">
              <h2>운영로그</h2>
              <div className="admin-list">
                {auditLogs.map((log) => (
                  <div key={log.id} className="admin-list-item top">
                    <div>
                      <strong>{log.title || `TMDB ${log.tmdb_id}`}</strong>
                      <p className="admin-muted">
                        {MEDIA_LABEL[log.media_type]} / tmdb:{log.tmdb_id}
                        {log.media_type === "season" ? ` / season:${log.season_number}` : ""}
                      </p>
                      <p className="admin-muted">
                        {log.action_type} / by {log.admin_email || "-"} / {formatDate(log.created_at)}
                      </p>
                      <p className="admin-muted">
                        effective final: {log.effective_final_state || "-"} /{" "}
                        {log.effective_final_completed_at || "-"}
                      </p>
                      {log.reason ? <p className="admin-muted">reason: {log.reason}</p> : null}
                      <p className="admin-muted">payload: {formatPayloadSnippet(log.payload)}</p>
                    </div>
                  </div>
                ))}
                {auditLoading ? <p className="admin-muted">Loading...</p> : null}
                {!auditLoading && auditLogs.length === 0 ? (
                  <p className="admin-muted">No operation logs.</p>
                ) : null}
              </div>
            </article>
          </section>
        ) : null}

        {tab === "cdcEvents" ? (
          <section className="admin-section admin-two-col">
            <article className="admin-card">
              <h2>CDC 이벤트 필터</h2>
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
                <input
                  value={cdcEventType}
                  onChange={(event) => setCdcEventType(event.target.value)}
                  placeholder="date_changed, status_milestone..."
                />
              </div>
              <div className="admin-field">
                <label>Source</label>
                <select value={cdcSource} onChange={(event) => setCdcSource(event.target.value)}>
                  <option value="">All</option>
                  <option value="movie">movie</option>
                  <option value="tv_full">tv_full</option>
                  <option value="tv_season">tv_season</option>
                </select>
              </div>
              <div className="admin-field">
                <label>Content ID (tmdb)</label>
                <input
                  value={cdcContentId}
                  onChange={(event) => setCdcContentId(event.target.value)}
                  placeholder="12345"
                />
              </div>
              <div className="admin-form-grid">
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
              </div>
              <div className="admin-inline-actions">
                <button type="button" className="admin-link-btn" onClick={() => void loadCdcEvents(0)}>
                  Search
                </button>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  onClick={() => {
                    setCdcQ("");
                    setCdcEventType("");
                    setCdcSource("");
                    setCdcContentId("");
                    setCdcCreatedFrom("");
                    setCdcCreatedTo("");
                    void loadCdcEvents(0, {
                      q: "",
                      eventType: "",
                      source: "",
                      contentId: "",
                      createdFrom: "",
                      createdTo: "",
                    });
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
              <h2>CDC 이벤트</h2>
              <div className="admin-list">
                {cdcEvents.map((event) => (
                  <div key={event.id} className="admin-list-item top">
                    <div>
                      <strong>{event.title || `TMDB ${event.tmdb_id || "-"}`}</strong>
                      <p className="admin-muted">
                        {SOURCE_LABEL[event.source || ""] || event.source || "-"} / tmdb:
                        {event.tmdb_id ?? "-"}
                        {event.source === "tv_season" && event.season_number !== null
                          ? ` / season:${event.season_number}`
                          : ""}
                      </p>
                      <p className="admin-muted">
                        {event.event_type} / {formatDate(event.created_at)}
                      </p>
                      <p className="admin-muted">user: {event.user_email || "-"}</p>
                      <p className="admin-muted">
                        payload: {formatPayloadSnippet(event.event_payload || {})}
                      </p>
                    </div>
                  </div>
                ))}
                {cdcLoading ? <p className="admin-muted">Loading...</p> : null}
                {!cdcLoading && cdcEvents.length === 0 ? <p className="admin-muted">No CDC events.</p> : null}
              </div>
            </article>
          </section>
        ) : null}

        {tab === "reports" ? (
          <section className="admin-section admin-two-col">
            <article className="admin-card">
              <h2>작업로그 필터</h2>
              <div className="admin-field">
                <label>crawler_name</label>
                <input
                  value={reportsCrawlerName}
                  onChange={(event) => setReportsCrawlerName(event.target.value)}
                  placeholder="scheduled publication cdc"
                />
              </div>
              <div className="admin-field">
                <label>status</label>
                <select value={reportsStatus} onChange={(event) => setReportsStatus(event.target.value)}>
                  <option value="">All</option>
                  <option value="success">success</option>
                  <option value="warning">warning</option>
                  <option value="failure">failure</option>
                  <option value="ok">ok</option>
                  <option value="warn">warn</option>
                  <option value="fail">fail</option>
                  <option value="skip">skip</option>
                </select>
              </div>
              <div className="admin-form-grid">
                <div className="admin-field">
                  <label>created_from</label>
                  <input
                    type="datetime-local"
                    value={reportsCreatedFrom}
                    onChange={(event) => setReportsCreatedFrom(event.target.value)}
                  />
                </div>
                <div className="admin-field">
                  <label>created_to</label>
                  <input
                    type="datetime-local"
                    value={reportsCreatedTo}
                    onChange={(event) => setReportsCreatedTo(event.target.value)}
                  />
                </div>
              </div>
              <div className="admin-inline-actions">
                <button
                  type="button"
                  className="admin-link-btn"
                  onClick={() => void Promise.all([loadReports(0), loadDailySummary()])}
                >
                  Search
                </button>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  onClick={() => {
                    setReportsCrawlerName("");
                    setReportsStatus("");
                    setReportsCreatedFrom("");
                    setReportsCreatedTo("");
                    void Promise.all([
                      loadReports(0, { crawlerName: "", status: "", createdFrom: "", createdTo: "" }),
                      loadDailySummary({ createdFrom: "", createdTo: "" }),
                    ]);
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
              <h3>로그 정리</h3>
              <div className="admin-inline-actions">
                <input
                  value={cleanupKeepDays}
                  onChange={(event) => setCleanupKeepDays(event.target.value)}
                  placeholder="keep days"
                />
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  disabled={cleanupLoading}
                  onClick={() => void cleanupReports()}
                >
                  Cleanup
                </button>
              </div>
            </article>

            <article className="admin-card">
              <div className="admin-inline-actions spread">
                <h2>작업로그</h2>
                <button
                  type="button"
                  className="admin-link-btn secondary"
                  onClick={() => void Promise.all([loadReports(0), loadDailySummary()])}
                >
                  Refresh
                </button>
              </div>

              {dailySummary ? (
                <div className="admin-stack">
                  <div className="admin-inline-actions">
                    <span className={statusBadgeClass(dailySummary.overall_status)}>
                      {dailySummary.overall_status}
                    </span>
                    <button
                      type="button"
                      className="admin-link-btn secondary"
                      disabled={!dailySummary.summary_text}
                      onClick={() => void copyDailySummary()}
                    >
                      Copy Summary
                    </button>
                  </div>
                  <p className="admin-muted">{dailySummary.subject_text}</p>
                  <pre className="admin-pre">{dailySummary.summary_text}</pre>
                </div>
              ) : (
                <p className="admin-muted">{dailySummaryLoading ? "Loading summary..." : "No summary."}</p>
              )}

              <h3>Crawler Reports</h3>
              <div className="admin-list">
                {reports.map((report) => (
                  <div key={report.id} className="admin-list-item top">
                    <div>
                      <div className="admin-inline-actions">
                        <strong>{report.crawler_name}</strong>
                        <span className={statusBadgeClass(report.normalized_status)}>
                          {report.normalized_status}
                        </span>
                      </div>
                      <p className="admin-muted">{formatDate(report.created_at)}</p>
                      <p className="admin-muted">{formatReportSummary(report.report_data || {})}</p>
                      <p className="admin-muted">
                        payload: {formatPayloadSnippet(report.report_data || {})}
                      </p>
                    </div>
                  </div>
                ))}
                {reportsLoading ? <p className="admin-muted">Loading...</p> : null}
                {!reportsLoading && reports.length === 0 ? <p className="admin-muted">No reports.</p> : null}
              </div>
            </article>
          </section>
        ) : null}

        {tab === "dailyNotification" ? (
          <section className="admin-section">
            <article className="admin-card">
              <div className="admin-inline-actions spread">
                <h2>일일알림리포트</h2>
                <div className="admin-inline-actions">
                  <button
                    type="button"
                    className="admin-link-btn secondary"
                    disabled={!dailyPayload?.text_report}
                    onClick={() => void copyDailyNotification()}
                  >
                    Copy Report
                  </button>
                </div>
              </div>

              <div className="admin-form-grid">
                <div className="admin-field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={dailyDate}
                    onChange={(event) => setDailyDate(event.target.value)}
                  />
                </div>
                <div className="admin-field">
                  <label>Options</label>
                  <div className="admin-inline-actions">
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
                      include pending
                    </label>
                  </div>
                </div>
              </div>
              <div className="admin-inline-actions">
                <button
                  type="button"
                  className="admin-link-btn"
                  disabled={dailyLoading}
                  onClick={() => void loadDailyNotification()}
                >
                  Load
                </button>
              </div>

              {dailyPayload ? (
                <div className="admin-stack">
                  <div className="admin-kv compact">
                    <div>
                      <dt>date</dt>
                      <dd>{dailyPayload.stats.date}</dd>
                    </div>
                    <div>
                      <dt>total</dt>
                      <dd>{dailyPayload.stats.total_items}</dd>
                    </div>
                    <div>
                      <dt>sent</dt>
                      <dd>{dailyPayload.stats.sent_count}</dd>
                    </div>
                    <div>
                      <dt>pending</dt>
                      <dd>{dailyPayload.stats.pending_count}</dd>
                    </div>
                    <div>
                      <dt>failed</dt>
                      <dd>{dailyPayload.stats.failed_count}</dd>
                    </div>
                    <div>
                      <dt>unique recipients</dt>
                      <dd>{dailyPayload.stats.unique_recipients}</dd>
                    </div>
                  </div>
                  <p className="admin-muted">
                    generated: {formatDate(dailyPayload.generated_at)} / duration:{" "}
                    {typeof dailyPayload.stats.duration_seconds === "number"
                      ? `${dailyPayload.stats.duration_seconds.toFixed(2)}s`
                      : "-"}
                  </p>
                  <pre className="admin-pre">{dailyPayload.text_report}</pre>

                  <h3>Items</h3>
                  <div className="admin-list">
                    {dailyItems.map((item) => (
                      <div key={item.id} className="admin-list-item top">
                        <div>
                          <strong>{item.title || `TMDB ${item.tmdb_id || "-"}`}</strong>
                          <p className="admin-muted">
                            {item.channel} / {item.status} / {item.user_email || "-"}
                          </p>
                          <p className="admin-muted">
                            created: {formatDate(item.created_at)} / sent: {formatDate(item.sent_at)}
                          </p>
                          {item.last_error ? <p className="admin-error-text">{item.last_error}</p> : null}
                        </div>
                      </div>
                    ))}
                    {dailyItems.length === 0 ? <p className="admin-muted">No items.</p> : null}
                  </div>
                </div>
              ) : (
                <p className="admin-muted">{dailyLoading ? "Loading..." : "No report loaded."}</p>
              )}
            </article>
          </section>
        ) : null}
      </div>
    </div>
  );
};
