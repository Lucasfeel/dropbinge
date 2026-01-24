import { useState } from "react";

import { apiFetch } from "../api";
import { FollowCard } from "../components/FollowCard";
import { FollowModal } from "../components/FollowModal";
import { useAuth } from "../hooks/useAuth";
import { useFollows } from "../hooks/useFollows";
import type { Follow } from "../types";

export const MyPage = () => {
  const { token, login, register, logout } = useAuth();
  const { follows, refresh } = useFollows();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [editFollow, setEditFollow] = useState<Follow | null>(null);

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
            <button className="button" onClick={() => login(email, password)}>
              Login
            </button>
            <button className="button secondary" onClick={() => register(email, password)}>
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
        </>
      )}
    </div>
  );
};
