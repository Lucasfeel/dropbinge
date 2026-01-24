import { useState } from "react";

import { apiFetch } from "../api";
import { FollowCard } from "../components/FollowCard";
import { FollowModal } from "../components/FollowModal";
import { useAuth } from "../hooks/useAuth";
import { useFollows } from "../hooks/useFollows";
import type { Follow, FollowPayload } from "../types";
import { clearFollowIntent, getFollowIntent } from "../utils/followIntent";

export const MyPage = () => {
  const { token, login, register, logout } = useAuth();
  const { follows, refresh } = useFollows();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [editFollow, setEditFollow] = useState<Follow | null>(null);
  const [pendingPayload, setPendingPayload] = useState<FollowPayload | null>(null);
  const [pendingDetail, setPendingDetail] = useState<any | null>(null);

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
        </>
      )}
    </div>
  );
};
