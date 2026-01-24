import { useEffect, useState } from "react";

import { apiFetch } from "../api";
import { FollowCard } from "../components/FollowCard";
import { FollowModal } from "../components/FollowModal";
import { useAuth } from "../hooks/useAuth";
import { useFollows } from "../hooks/useFollows";
import type { ActivityOutboxItem, ActivityResponse, Follow, FollowPayload } from "../types";
import { clearFollowIntent, getFollowIntent } from "../utils/followIntent";

export const MyPage = () => {
  const { token, login, register, logout } = useAuth();
  const { follows, refresh } = useFollows();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [editFollow, setEditFollow] = useState<Follow | null>(null);
  const [pendingPayload, setPendingPayload] = useState<FollowPayload | null>(null);
  const [pendingDetail, setPendingDetail] = useState<any | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [expandedEventIds, setExpandedEventIds] = useState<number[]>([]);
  const [expandedOutboxIds, setExpandedOutboxIds] = useState<number[]>([]);

  useEffect(() => {
    if (!token) {
      setActivity(null);
      setActivityLoaded(false);
      setShowAllEvents(false);
      setExpandedEventIds([]);
      setExpandedOutboxIds([]);
    }
  }, [token]);

  const getFollowSubtitle = (follow: Follow) => {
    if (follow.target_type === "movie") {
      return `Movie · ${follow.release_date || "TBD"}`;
    }
    if (follow.target_type === "tv_season") {
      return `TV Season S${follow.season_number ?? "?"} · ${follow.season_air_date || "TBD"}`;
    }
    return `Full run · Status: ${follow.status_raw || "TBD"} · Next: ${follow.next_air_date || "TBD"}`;
  };

  const deleteFollow = async (followId: number) => {
    await apiFetch(`/api/my/follows/${followId}`, { method: "DELETE" });
    refresh();
  };

  const refreshNow = async () => {
    await apiFetch("/api/my/refresh", { method: "POST" });
    refresh();
    if (activityLoaded) {
      loadActivity();
    }
  };

  const loadActivity = async () => {
    setActivityLoading(true);
    setActivityLoaded(true);
    try {
      const data = await apiFetch<ActivityResponse>("/api/my/activity");
      setActivity(data);
    } finally {
      setActivityLoading(false);
    }
  };

  const openFollowIntent = async () => {
    const intent = getFollowIntent();
    if (!intent) return;
    try {
      const detail =
        intent.mediaType === "movie"
          ? await apiFetch(`/api/tmdb/movie/${intent.tmdbId}`)
          : await apiFetch(`/api/tmdb/tv/${intent.tmdbId}`);
      setPendingPayload(intent.payload);
      setPendingDetail(detail);
    } catch (error) {
      clearFollowIntent();
    }
  };

  const handleLogin = async () => {
    await login(email, password);
    await refresh();
    await openFollowIntent();
  };

  const handleRegister = async () => {
    await register(email, password);
    await refresh();
    await openFollowIntent();
  };

  const toggleExpanded = (id: number, setExpanded: (next: number[]) => void, expanded: number[]) => {
    if (expanded.includes(id)) {
      setExpanded(expanded.filter((item) => item !== id));
    } else {
      setExpanded([...expanded, id]);
    }
  };

  const sortedOutbox = (items: ActivityOutboxItem[]) => {
    const order = { pending: 0, sent: 1, failed: 2 };
    return [...items].sort((a, b) => {
      const statusDiff = order[a.status] - order[b.status];
      if (statusDiff !== 0) return statusDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  };

  const recentEvents = activity?.recent_events ?? [];
  const displayEvents = showAllEvents ? recentEvents : recentEvents.slice(0, 20);
  const outboxItems = activity?.outbox ?? [];
  const pendingCount = activity?.meta.counts.outbox_pending ?? 0;

  return (
    <div className="page">
      {!token ? (
        <div className="card">
          <h3>Log in</h3>
          <div className="field">
            <label>Email</label>
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="button-row">
            <button className="button" onClick={handleLogin}>
              Login
            </button>
            <button className="button secondary" onClick={handleRegister}>
              Register
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="button-row">
            <button className="button secondary" onClick={refreshNow}>
              Refresh now
            </button>
            <button className="button secondary" onClick={logout}>
              Log out
            </button>
          </div>
          <h3>My Follows</h3>
          {follows.map((follow) => (
            <FollowCard
              key={follow.id}
              follow={follow}
              subtitle={getFollowSubtitle(follow)}
              actions={
                <>
                  <button className="button secondary" onClick={() => setEditFollow(follow)}>
                    Edit
                  </button>
                  <button className="button secondary" onClick={() => deleteFollow(follow.id)}>
                    Unfollow
                  </button>
                </>
              }
            />
          ))}
          {editFollow && (
            <FollowModal
              payload={{
                targetType: editFollow.target_type,
                tmdbId: editFollow.tmdb_id,
                seasonNumber: editFollow.season_number ?? undefined,
              }}
              existingFollow={editFollow}
              onClose={() => setEditFollow(null)}
              onSaved={() => {
                refresh();
                setEditFollow(null);
              }}
            />
          )}
          {!editFollow && pendingPayload && pendingDetail && (
            <FollowModal
              payload={pendingPayload}
              detail={pendingDetail}
              existingFollows={follows}
              onClose={() => {
                clearFollowIntent();
                setPendingPayload(null);
                setPendingDetail(null);
              }}
              onSaved={() => {
                clearFollowIntent();
                refresh();
                setPendingPayload(null);
                setPendingDetail(null);
              }}
            />
          )}
          <div className="card">
            <h3>My Activity</h3>
            <div className="button-row">
              <button className="button secondary" onClick={loadActivity} disabled={activityLoading}>
                {activityLoading ? "Loading..." : "Load activity"}
              </button>
            </div>
            {activity && (
              <>
                <div className="card">
                  <h4>Recent events</h4>
                  {displayEvents.length === 0 ? (
                    <p className="muted">No recent events yet.</p>
                  ) : (
                    <ul className="list">
                      {displayEvents.map((event) => (
                        <li key={event.id}>
                          <strong>{event.title || "Untitled"}</strong> — {event.summary}
                          <div className="muted">
                            {event.target_type} · {event.tmdb_id}
                          </div>
                          <button
                            className="button secondary"
                            onClick={() =>
                              toggleExpanded(event.id, setExpandedEventIds, expandedEventIds)
                            }
                          >
                            {expandedEventIds.includes(event.id) ? "Hide details" : "Details"}
                          </button>
                          {expandedEventIds.includes(event.id) && (
                            <pre>{JSON.stringify(event.event_payload, null, 2)}</pre>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {recentEvents.length > 20 && (
                    <button
                      className="button secondary"
                      onClick={() => setShowAllEvents((prev) => !prev)}
                    >
                      {showAllEvents ? "Show less" : "Show all"}
                    </button>
                  )}
                </div>
                <div className="card">
                  <h4>Notification outbox</h4>
                  <p className="muted">Pending: {pendingCount}</p>
                  {outboxItems.length === 0 ? (
                    <p className="muted">No notifications queued yet.</p>
                  ) : (
                    <ul className="list">
                      {sortedOutbox(outboxItems).map((item) => (
                        <li key={item.id}>
                          <strong>{item.title || "Untitled"}</strong> — {item.summary}
                          <div className="muted">
                            {item.channel} · {item.status} · {item.created_at}
                          </div>
                          <button
                            className="button secondary"
                            onClick={() =>
                              toggleExpanded(item.id, setExpandedOutboxIds, expandedOutboxIds)
                            }
                          >
                            {expandedOutboxIds.includes(item.id) ? "Hide details" : "Details"}
                          </button>
                          {expandedOutboxIds.includes(item.id) && (
                            <pre>{JSON.stringify(item.payload, null, 2)}</pre>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
