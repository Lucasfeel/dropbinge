import { NavLink, Route, Routes } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getToken, setToken } from "./api";

type Follow = {
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
  notify_date_changes: boolean;
  notify_status_milestones: boolean;
  notify_season_binge_ready: boolean;
  notify_episode_drops: boolean;
  notify_full_run_concluded: boolean;
  channel_email: boolean;
  channel_whatsapp: boolean;
  frequency: "important_only" | "all_updates";
};

type User = { id: number; email: string };

const defaultPrefs = {
  notify_date_changes: true,
  notify_status_milestones: false,
  notify_season_binge_ready: true,
  notify_episode_drops: false,
  notify_full_run_concluded: true,
  channel_email: true,
  channel_whatsapp: false,
  frequency: "important_only" as const,
};

const useFollows = (token: string | null) => {
  const [follows, setFollows] = useState<Follow[]>([]);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ follows: Follow[] }>("/api/my/follows");
      setFollows(data.follows);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { follows, refresh, loading };
};

const getTitle = (follow: Follow) => {
  if (follow.cache_payload && typeof follow.cache_payload === "object") {
    return (
      (follow.cache_payload as { title?: string; name?: string }).title ||
      (follow.cache_payload as { name?: string }).name ||
      `TMDB ${follow.tmdb_id}`
    );
  }
  return `TMDB ${follow.tmdb_id}`;
};

const SearchOverlay = ({
  open,
  onClose,
  onFollowCreated,
}: {
  open: boolean;
  onClose: () => void;
  onFollowCreated: () => void;
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [followPayload, setFollowPayload] = useState<{
    targetType: "movie" | "tv_full" | "tv_season";
    tmdbId: number;
    seasonNumber?: number;
  } | null>(null);

  const runSearch = async () => {
    if (!query.trim()) return;
    try {
      const data = await apiFetch<any>(`/api/tmdb/search?q=${encodeURIComponent(query)}`);
      setResults(data.results || []);
    } catch (error) {
      setResults([]);
    }
  };

  const loadDetail = async (item: any) => {
    setSelected(item);
    try {
      if (item.media_type === "movie") {
        const data = await apiFetch<any>(`/api/tmdb/movie/${item.id}`);
        setDetail(data);
      } else if (item.media_type === "tv") {
        const data = await apiFetch<any>(`/api/tmdb/tv/${item.id}`);
        setDetail(data);
      }
    } catch (error) {
      setDetail(null);
    }
  };

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(null);
      setDetail(null);
      setFollowPayload(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Global Search</h3>
        <div className="field">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search TMDB..."
            style={{ flex: 1, marginRight: 8 }}
          />
          <button className="button secondary" onClick={runSearch}>
            Search
          </button>
        </div>
        {!selected && (
          <ul className="list">
            {results.map((result) => (
              <li key={`${result.media_type}-${result.id}`}>
                <button className="button secondary" onClick={() => loadDetail(result)}>
                  {result.title || result.name} ({result.media_type})
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected && detail && (
          <div className="card">
            <h4>{detail.title || detail.name}</h4>
            <p className="muted">
              {selected.media_type === "movie" ? detail.release_date || "TBD" : detail.first_air_date || "TBD"}
            </p>
            {selected.media_type === "movie" ? (
              <button
                className="button"
                onClick={() =>
                  setFollowPayload({ targetType: "movie", tmdbId: detail.id })
                }
              >
                Follow
              </button>
            ) : (
              <div className="button-row">
                <button
                  className="button"
                  onClick={() =>
                    setFollowPayload({ targetType: "tv_full", tmdbId: detail.id })
                  }
                >
                  Follow full run
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    setFollowPayload({
                      targetType: "tv_season",
                      tmdbId: detail.id,
                    })
                  }
                >
                  Follow season
                </button>
              </div>
            )}
          </div>
        )}
        {followPayload && (
          <FollowModal
            payload={followPayload}
            detail={detail}
            onClose={() => setFollowPayload(null)}
            onSaved={() => {
              onFollowCreated();
              setFollowPayload(null);
            }}
          />
        )}
        <div className="button-row">
          <button className="button secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const FollowModal = ({
  payload,
  detail,
  onClose,
  onSaved,
  existingFollow,
}: {
  payload: { targetType: "movie" | "tv_full" | "tv_season"; tmdbId: number; seasonNumber?: number };
  detail?: any;
  onClose: () => void;
  onSaved: () => void;
  existingFollow?: Follow;
}) => {
  const [prefs, setPrefs] = useState({
    ...defaultPrefs,
    ...(existingFollow || {}),
  });
  const [seasonNumber, setSeasonNumber] = useState<number | undefined>(
    payload.seasonNumber,
  );

  const seasons = useMemo(() => {
    if (!detail?.seasons) return [];
    return detail.seasons.filter((season: any) => typeof season.season_number === "number");
  }, [detail]);

  const updatePref = (key: keyof typeof prefs, value: boolean | string) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (payload.targetType === "tv_season" && seasonNumber === undefined) {
      return;
    }
    if (existingFollow) {
      await apiFetch(`/api/my/follows/${existingFollow.id}`, {
        method: "PATCH",
        body: JSON.stringify(prefs),
      });
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
          <label>WhatsApp <span className="muted">(coming soon)</span></label>
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

const HomePage = ({ token }: { token: string | null }) => {
  const [home, setHome] = useState<any | null>(null);
  useEffect(() => {
    if (!token) return;
    apiFetch("/api/my/home").then(setHome).catch(() => setHome(null));
  }, [token]);
  if (!token) {
    return <div className="page">Log in to see your DropBinge home feed.</div>;
  }
  return (
    <div className="page">
      <h2>Upcoming Drops</h2>
      {(home?.upcoming_drops || []).map((item: any) => (
        <div className="card" key={`up-${item.id}`}>
          <strong>{item.cache_payload?.title || item.cache_payload?.name || "TBD"}</strong>
          <div className="muted">{item.date}</div>
        </div>
      ))}
      <h2>TBD Updates</h2>
      {(home?.tbd_updates || []).map((item: any) => (
        <div className="card" key={`tbd-${item.id}`}>
          <strong>{item.cache_payload?.title || item.cache_payload?.name || "TBD"}</strong>
          <div className="muted">TBD</div>
        </div>
      ))}
      <h2>Recent Completes</h2>
      {(home?.recent_completes || []).map((item: any) => (
        <div className="card" key={`comp-${item.id}`}>
          <strong>{item.cache_payload?.title || item.cache_payload?.name || "TBD"}</strong>
          <div className="muted">{item.event_type}</div>
        </div>
      ))}
    </div>
  );
};

const MoviePage = ({ token }: { token: string | null }) => {
  const { follows } = useFollows(token);
  const [filter, setFilter] = useState("upcoming");
  const today = new Date();

  const movies = follows.filter((follow) => follow.target_type === "movie");

  const filtered = movies.filter((follow) => {
    const date = follow.release_date ? new Date(follow.release_date) : null;
    if (filter === "tbd") return !date;
    if (filter === "upcoming") return date && date >= today;
    if (filter === "now") return date && date <= today;
    return true;
  });

  return (
    <div className="page">
      <div className="chip-row">
        {["upcoming", "tbd", "now", "all"].map((key) => (
          <button
            key={key}
            className={`chip ${filter === key ? "active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {key.toUpperCase()}
          </button>
        ))}
      </div>
      {filtered.map((follow) => (
        <div className="card" key={follow.id}>
          <strong>{getTitle(follow)}</strong>
          <div className="muted">{follow.release_date || "TBD"}</div>
        </div>
      ))}
    </div>
  );
};

const TvPage = ({ token }: { token: string | null }) => {
  const { follows } = useFollows(token);
  const [filter, setFilter] = useState("upcoming");
  const today = new Date();
  const seasons = follows.filter((follow) => follow.target_type === "tv_season");

  const filtered = seasons.filter((follow) => {
    const date = follow.season_air_date ? new Date(follow.season_air_date) : null;
    if (filter === "tbd") return !date;
    if (filter === "upcoming") return date && date >= today;
    if (filter === "airing") {
      const last = follow.season_last_episode_air_date
        ? new Date(follow.season_last_episode_air_date)
        : null;
      return date && last && date <= today && last >= today;
    }
    return true;
  });

  return (
    <div className="page">
      <div className="chip-row">
        {[
          ["upcoming", "Upcoming Seasons"],
          ["tbd", "TBD Seasons"],
          ["airing", "Airing Now"],
          ["all", "All"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`chip ${filter === key ? "active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {filtered.map((follow) => (
        <div className="card" key={follow.id}>
          <strong>{getTitle(follow)}</strong>
          <div className="muted">
            Season {follow.season_number} · {follow.season_air_date || "TBD"}
          </div>
        </div>
      ))}
    </div>
  );
};

const SeriesPage = ({ token }: { token: string | null }) => {
  const { follows } = useFollows(token);
  const series = follows.filter((follow) => follow.target_type === "tv_full");
  return (
    <div className="page">
      {series.map((follow) => (
        <div className="card" key={follow.id}>
          <strong>{getTitle(follow)}</strong>
          <div className="muted">{follow.status_raw || "Status TBD"}</div>
        </div>
      ))}
    </div>
  );
};

const MyPage = ({
  token,
  onAuthUpdated,
}: {
  token: string | null;
  onAuthUpdated: (token: string | null, user: User | null) => void;
}) => {
  const { follows, refresh } = useFollows(token);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [editFollow, setEditFollow] = useState<Follow | null>(null);

  const login = async () => {
    const data = await apiFetch<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    onAuthUpdated(data.token, data.user);
  };

  const register = async () => {
    const data = await apiFetch<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    onAuthUpdated(data.token, data.user);
  };

  const logout = () => {
    setToken(null);
    onAuthUpdated(null, null);
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
            <button className="button" onClick={login}>
              Login
            </button>
            <button className="button secondary" onClick={register}>
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
            <div className="card" key={follow.id}>
              <strong>{getTitle(follow)}</strong>
              <div className="muted">{follow.target_type}</div>
              <div className="button-row">
                <button className="button secondary" onClick={() => setEditFollow(follow)}>
                  Edit
                </button>
                <button className="button secondary" onClick={() => deleteFollow(follow.id)}>
                  Unfollow
                </button>
              </div>
            </div>
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

const App = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [tokenState, setTokenState] = useState(getToken());
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!tokenState) return;
    apiFetch<{ user: User }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => {
        setToken(null);
        setTokenState(null);
      });
  }, [tokenState]);

  const handleAuthUpdated = (token: string | null, userValue: User | null) => {
    setTokenState(token);
    setUser(userValue);
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>DropBinge</h1>
        <button className="search-button" onClick={() => setSearchOpen(true)}>
          Search
        </button>
      </header>
      <Routes>
        <Route path="/" element={<HomePage token={tokenState} />} />
        <Route path="/movie" element={<MoviePage token={tokenState} />} />
        <Route path="/tv" element={<TvPage token={tokenState} />} />
        <Route path="/series" element={<SeriesPage token={tokenState} />} />
        <Route
          path="/my"
          element={<MyPage token={tokenState} onAuthUpdated={handleAuthUpdated} />}
        />
      </Routes>
      <nav className="bottom-nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Home
        </NavLink>
        <NavLink to="/movie" className={({ isActive }) => (isActive ? "active" : "")}>
          Movie
        </NavLink>
        <NavLink to="/tv" className={({ isActive }) => (isActive ? "active" : "")}>
          TV
        </NavLink>
        <NavLink to="/series" className={({ isActive }) => (isActive ? "active" : "")}>
          Series
        </NavLink>
        <NavLink to="/my" className={({ isActive }) => (isActive ? "active" : "")}>
          My
        </NavLink>
      </nav>
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onFollowCreated={() => {}}
      />
      {user && <div className="muted" style={{ padding: 12 }}>Signed in as {user.email}</div>}
    </div>
  );
};

export default App;
