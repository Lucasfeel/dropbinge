import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";

type TabKey = "overview" | "users" | "ops";
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

const TARGET_LABEL = {
  movie: "Movie",
  tv_full: "TV Full",
  tv_season: "TV Season",
} as const;

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
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

export const AdminPage = () => {
  const { token, user, loadingUser, logout } = useAuth();

  const [tab, setTab] = useState<TabKey>("overview");
  const [toast, setToast] = useState<{ text: string; tone: Tone } | null>(null);

  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

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

  const canAccessAdmin = Boolean(token && user?.is_admin);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const notify = (text: string, tone: Tone = "info") => {
    setToast({ text, tone });
  };

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

  useEffect(() => {
    if (!canAccessAdmin) {
      return;
    }
    void loadOverview();
    void loadOutboxSummary();
  }, [canAccessAdmin]);

  useEffect(() => {
    if (!canAccessAdmin) {
      return;
    }
    if (tab === "users") {
      void loadUsers(usersQuery, usersOffset);
    }
    if (tab === "ops") {
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
      await Promise.all([loadOverview(), loadOutboxSummary()]);
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
      if (parsedLimitUsers) {
        body.limit_users = parsedLimitUsers;
      }
      if (parsedLimitFollows) {
        body.limit_follows = parsedLimitFollows;
      }
      await apiFetch("/api/admin/ops/refresh-all", {
        method: "POST",
        body: JSON.stringify(body),
      });
      notify("Refresh-all started.", "success");
      await Promise.all([loadOverview(), loadOutboxSummary()]);
    } catch (error) {
      notify(messageOf(error, "Failed to start refresh-all."), "error");
    } finally {
      setOpsLoading(false);
    }
  };

  const refreshSelectedUser = async () => {
    if (!selectedUser) {
      return;
    }
    setDetailActionLoading(true);
    try {
      await apiFetch(`/api/admin/users/${selectedUser.id}/refresh`, {
        method: "POST",
        body: JSON.stringify({ force: true }),
      });
      notify("User refresh completed.", "success");
      await Promise.all([loadUserFollows(selectedUser.id), loadOverview()]);
    } catch (error) {
      notify(messageOf(error, "Failed to refresh selected user."), "error");
    } finally {
      setDetailActionLoading(false);
    }
  };

  const deleteFollow = async (followId: number, title: string | null, tmdbId: number) => {
    const confirmed = window.confirm(`Delete follow: ${title || `TMDB ${tmdbId}`}?`);
    if (!confirmed || !selectedUser) {
      return;
    }
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

  const followBreakdown = useMemo(
    () => Object.entries(overview?.follow_breakdown || {}),
    [overview],
  );
  const outboxStatus = useMemo(() => Object.entries(overview?.outbox_status || {}), [overview]);
  const hasPrev = usersOffset > 0;
  const hasNext = usersOffset + usersLimit < usersTotal;

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
        <div className={`admin-toast ${toast.tone === "success" ? "success" : ""} ${toast.tone === "error" ? "error" : ""}`}>
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
          <button type="button" className={`admin-tab-btn ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>
            Overview
          </button>
          <button type="button" className={`admin-tab-btn ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>
            Users
          </button>
          <button type="button" className={`admin-tab-btn ${tab === "ops" ? "active" : ""}`} onClick={() => setTab("ops")}>
            Ops
          </button>
        </nav>

        {tab === "overview" ? (
          <section className="admin-section">
            <div className="admin-card-grid">
              <article className="admin-card">
                <h2>Core Metrics</h2>
                {overviewLoading ? <p className="admin-muted">Loading...</p> : null}
                <dl className="admin-kv">
                  <div><dt>Users</dt><dd>{overview?.users_total ?? "-"}</dd></div>
                  <div><dt>Follows</dt><dd>{overview?.follows_total ?? "-"}</dd></div>
                  <div><dt>Events (24h)</dt><dd>{overview?.change_events_24h ?? "-"}</dd></div>
                  <div><dt>Outbox (24h)</dt><dd>{overview?.outbox_24h ?? "-"}</dd></div>
                </dl>
              </article>

              <article className="admin-card">
                <h2>Follow Breakdown</h2>
                <ul className="admin-chip-list">
                  {followBreakdown.map(([key, value]) => (
                    <li key={key}><span>{key}</span><strong>{value}</strong></li>
                  ))}
                </ul>
                {followBreakdown.length === 0 ? <p className="admin-muted">No data</p> : null}
              </article>

              <article className="admin-card">
                <h2>Outbox Status</h2>
                <ul className="admin-chip-list">
                  {outboxStatus.map(([key, value]) => (
                    <li key={key}><span>{key}</span><strong>{value}</strong></li>
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
                {(overview?.top_users || []).length === 0 ? <p className="admin-muted">No data</p> : null}
              </article>

              <article className="admin-card">
                <h2>Timeline</h2>
                <dl className="admin-kv compact">
                  <div><dt>Newest user</dt><dd>{formatDate(overview?.latest_user_created_at)}</dd></div>
                  <div><dt>Newest follow</dt><dd>{formatDate(overview?.latest_follow_created_at)}</dd></div>
                  <div><dt>Oldest pending</dt><dd>{formatDate(overview?.oldest_pending_created_at)}</dd></div>
                  <div><dt>Admin restriction</dt><dd>{overview?.admin_restricted ? "ADMIN_EMAILS enabled" : "not configured"}</dd></div>
                </dl>
              </article>
            </div>
          </section>
        ) : null}

        {tab === "users" ? (
          <section className="admin-section admin-two-col">
            <article className="admin-card">
              <h2>User Search</h2>
              <div className="admin-search-row">
                <input value={usersQuery} onChange={(event) => setUsersQuery(event.target.value)} placeholder="email or user_id" />
                <button type="button" className="admin-link-btn" disabled={usersLoading} onClick={() => { setUsersOffset(0); void loadUsers(usersQuery, 0); }}>
                  Search
                </button>
              </div>

              <div className="admin-list">
                {users.map((item) => (
                  <button key={item.id} type="button" className={`admin-user-item ${selectedUser?.id === item.id ? "active" : ""}`} onClick={() => void loadUserFollows(item.id)}>
                    <div>
                      <strong>{item.email}</strong>
                      <p className="admin-muted">user_id: {item.id}</p>
                    </div>
                    <div className="admin-user-meta">
                      <span>{item.follows_count} follows</span>
                      {item.pending_outbox_count > 0 ? <span>{item.pending_outbox_count} pending</span> : null}
                      {item.is_admin ? <span className="admin-pill">admin</span> : null}
                    </div>
                  </button>
                ))}
                {usersLoading ? <p className="admin-muted">Loading...</p> : null}
                {!usersLoading && users.length === 0 ? <p className="admin-muted">No users found.</p> : null}
              </div>

              <div className="admin-inline-actions spread">
                <button type="button" className="admin-link-btn secondary" disabled={!hasPrev || usersLoading} onClick={() => void loadUsers(usersQuery, Math.max(0, usersOffset - usersLimit))}>
                  Prev
                </button>
                <span className="admin-muted">
                  {usersTotal === 0 ? "0" : `${usersOffset + 1}-${Math.min(usersOffset + usersLimit, usersTotal)}`} / {usersTotal}
                </span>
                <button type="button" className="admin-link-btn secondary" disabled={!hasNext || usersLoading} onClick={() => void loadUsers(usersQuery, usersOffset + usersLimit)}>
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
                    <button type="button" className="admin-link-btn" disabled={detailActionLoading} onClick={() => void refreshSelectedUser()}>
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
                            status: {follow.status_raw || "-"} / cache: {formatDate(follow.cache_updated_at)}
                          </p>
                        </div>
                        <div className="admin-inline-actions">
                          <span className="admin-pill">{follow.frequency}</span>
                          <button type="button" className="admin-link-btn danger" disabled={detailActionLoading} onClick={() => void deleteFollow(follow.id, follow.title, follow.tmdb_id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                    {detailLoading ? <p className="admin-muted">Loading...</p> : null}
                    {!detailLoading && selectedFollows.length === 0 ? <p className="admin-muted">No follows.</p> : null}
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
                <input value={dispatchBatch} onChange={(event) => setDispatchBatch(event.target.value)} placeholder="e.g. 50" />
              </div>
              <button type="button" className="admin-link-btn" disabled={opsLoading} onClick={() => void runDispatch()}>
                Run Email Dispatch
              </button>

              <hr className="admin-divider" />

              <div className="admin-field">
                <label>limit_users (optional)</label>
                <input value={limitUsers} onChange={(event) => setLimitUsers(event.target.value)} placeholder="e.g. 100" />
              </div>
              <div className="admin-field">
                <label>limit_follows (optional)</label>
                <input value={limitFollows} onChange={(event) => setLimitFollows(event.target.value)} placeholder="e.g. 500" />
              </div>
              <label className="admin-checkbox">
                <input type="checkbox" checked={forceRefresh} onChange={(event) => setForceRefresh(event.target.checked)} />
                use force_fetch
              </label>
              <button type="button" className="admin-link-btn" disabled={opsLoading} onClick={() => void runRefreshAll()}>
                Run Refresh All
              </button>
            </article>

            <article className="admin-card">
              <h2>Outbox Summary</h2>
              {summaryLoading ? <p className="admin-muted">Loading...</p> : null}

              <h3>By Status</h3>
              <ul className="admin-chip-list">
                {Object.entries(summary?.by_status || {}).map(([status, count]) => (
                  <li key={status}><span>{status}</span><strong>{count}</strong></li>
                ))}
              </ul>

              <h3>By Channel + Status</h3>
              <div className="admin-list">
                {(summary?.by_channel_and_status || []).map((row) => (
                  <div key={`${row.channel}-${row.status}`} className="admin-list-item">
                    <span>{row.channel} / {row.status}</span>
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
                      <p className="admin-muted">{item.channel} / attempts: {item.attempt_count}</p>
                      {item.last_error ? <p className="admin-error-text">{item.last_error}</p> : null}
                    </div>
                    <span className="admin-muted">{formatDate(item.created_at)}</span>
                  </div>
                ))}
              </div>
              <p className="admin-muted">oldest pending: {formatDate(summary?.oldest_pending_created_at)}</p>
            </article>
          </section>
        ) : null}
      </div>
    </div>
  );
};
