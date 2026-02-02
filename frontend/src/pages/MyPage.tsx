import { useState } from "react";

import tmdbLogo from "../assets/tmdb-logo.svg";
import { PosterCard } from "../components/PosterCard";
import { SectionHeader } from "../components/SectionHeader";
import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useFollowStore } from "../stores/followStore";

export const MyPage = () => {
  const { token, login, register, logout } = useAuth();
  const { items, removeFollow, retryHydrate } = useFollowStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await login(email, password);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      await register(email, password);
    } finally {
      setLoading(false);
    }
  };

  const refreshNow = async () => {
    await apiFetch("/api/my/refresh?force=1", { method: "POST" });
  };

  return (
    <div className="page">
      {!token ? (
        <>
          <SectionHeader title="Guest Collection" subtitle="Your local follows stay on this device." />
          {items.length === 0 ? (
            <p className="muted">No guest follows yet. Add one from search.</p>
          ) : (
            <div className="grid">
              {items.map((item) => (
                <PosterCard
                  key={item.key}
                  title={item.title}
                  subtitle={item.meta?.date || "TBD"}
                  posterPath={item.posterPath}
                  to={`/title/${item.mediaType}/${item.tmdbId}`}
                  action={
                    <div className="poster-action-row">
                      <button className="button tiny secondary" onClick={() => removeFollow(item.key)}>
                        Remove
                      </button>
                      {item.meta?.note && (
                        <button className="button tiny" onClick={() => retryHydrate(item)}>
                          Retry hydrate
                        </button>
                      )}
                    </div>
                  }
                />
              ))}
            </div>
          )}

          <SectionHeader title="Account" subtitle="Log in to sync your follows and alerts." />
          <div className="card">
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
              <button className="button" onClick={handleLogin} disabled={loading}>
                Login
              </button>
              <button className="button secondary" onClick={handleRegister} disabled={loading}>
                Register
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <SectionHeader title="My follows" subtitle="Synced to your account." />
          {items.length === 0 ? (
            <p className="muted">No follows yet. Add one from search.</p>
          ) : (
            <div className="grid">
              {items.map((item) => (
                <PosterCard
                  key={item.key}
                  title={item.title}
                  subtitle={item.meta?.date || "TBD"}
                  posterPath={item.posterPath}
                  to={`/title/${item.mediaType}/${item.tmdbId}`}
                  action={
                    <button className="button tiny secondary" onClick={() => removeFollow(item.key)}>
                      Unfollow
                    </button>
                  }
                />
              ))}
            </div>
          )}
          <div className="card">
            <SectionHeader title="Account" />
            <div className="button-row">
              <button className="button" onClick={refreshNow}>
                Refresh now
              </button>
              <button className="button secondary" onClick={logout}>
                Log out
              </button>
            </div>
          </div>
        </>
      )}

      <SectionHeader title="TMDB Attribution" />
      <div className="card tmdb-card">
        <img src={tmdbLogo} alt="TMDB logo" />
        <p className="muted">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      </div>
    </div>
  );
};
