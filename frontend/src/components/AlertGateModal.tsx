import { useEffect, useState } from "react";

import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useFollowStore } from "../stores/followStore";

type PendingAction = {
  input: {
    mediaType: "movie" | "tv";
    tmdbId: number;
    seasonNumber?: number | null;
    targetType?: "movie" | "tv_full" | "tv_season";
  };
  roles: { drop: boolean; binge?: boolean };
};

type AlertGateModalProps = {
  open: boolean;
  onClose: () => void;
  modeTitle: string;
  pendingAction: PendingAction;
  onSuccess: () => void;
};

const STORAGE_KEY = "dropbinge_alert_email";

const resolveTargetType = (input: PendingAction["input"]) => {
  if (input.targetType) return input.targetType;
  if (input.mediaType === "movie") return "movie";
  if (typeof input.seasonNumber === "number") return "tv_season";
  return "tv_full";
};

export const AlertGateModal = ({
  open,
  onClose,
  modeTitle,
  pendingAction,
  onSuccess,
}: AlertGateModalProps) => {
  const { login, register } = useAuth();
  const { setRoles } = useFollowStore();
  const [tab, setTab] = useState<"email" | "auth">("auth");
  const [email, setEmail] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const savedEmail = window.localStorage.getItem(STORAGE_KEY) || "";
    setTab("auth");
    setEmail(savedEmail);
    setAuthEmail(savedEmail);
    setPassword("");
    setError(null);
    setLoading(false);
  }, [open]);

  if (!open) return null;

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const targetType = resolveTargetType(pendingAction.input);
      const payload: Record<string, unknown> = {
        email: email.trim().toLowerCase(),
        target_type: targetType,
        tmdb_id: pendingAction.input.tmdbId,
        roles: {
          drop: pendingAction.roles.drop,
          binge: pendingAction.roles.binge ?? false,
        },
      };
      if (targetType === "tv_season") {
        payload.season_number = pendingAction.input.seasonNumber ?? null;
      }
      await apiFetch("/api/public/subscribe-email", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (payload.email) {
        window.localStorage.setItem(STORAGE_KEY, payload.email as string);
      }
      await setRoles(pendingAction.input, pendingAction.roles);
      onSuccess();
      onClose();
    } catch (err) {
      let rawMessage = err instanceof Error ? err.message : String(err);
      try {
        const parsed = JSON.parse(rawMessage);
        if (parsed?.error === "login_required") {
          setError("This email already has an account. Please log in.");
          return;
        }
      } catch (parseError) {
        rawMessage = rawMessage;
      }
      setError("Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (mode: "login" | "register") => {
    setLoading(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(authEmail, password);
      } else {
        await register(authEmail, password);
      }
      await setRoles(pendingAction.input, pendingAction.roles);
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Email already registered") || message.includes("409")) {
        setError("Email already registered. Please log in.");
      } else if (message.includes("Invalid credentials") || message.includes("401")) {
        setError("Invalid credentials. Please try again.");
      } else {
        setError("Request failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-overlay">
      <button className="dialog-backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="dialog-panel" role="dialog" aria-modal="true">
        <h3 className="dialog-title">{modeTitle}</h3>
        <p className="muted">Log in to manage alerts, or use email-only.</p>
        {tab === "email" ? (
          <form onSubmit={handleEmailSubmit}>
            <div className="field">
              <label htmlFor="alert-gate-email">Email</label>
              <input
                id="alert-gate-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </div>
            {error ? <p className="dialog-error">{error}</p> : null}
            <div className="dialog-actions">
              <button className="button" type="submit" disabled={loading}>
                {loading ? "Submitting..." : "Enable alerts"}
              </button>
            </div>
            <button
              className="inline-link"
              type="button"
              onClick={() => {
                setTab("auth");
                setError(null);
              }}
              disabled={loading}
            >
              Back to log in
            </button>
            <p className="muted">Email-only alerts don’t require a password.</p>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleAuth("login");
            }}
          >
            <div className="field">
              <label htmlFor="alert-gate-auth-email">Email</label>
              <input
                id="alert-gate-auth-email"
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label htmlFor="alert-gate-auth-password">Password</label>
              <input
                id="alert-gate-auth-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <button
              className="inline-link"
              type="button"
              onClick={() => {
                setTab("email");
                setError(null);
              }}
              disabled={loading}
            >
              Or continue with email-only
            </button>
            {error ? <p className="dialog-error">{error}</p> : null}
            <div className="dialog-actions">
              <button className="button" type="submit" disabled={loading}>
                {loading ? "Working..." : "Log in"}
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={loading}
                onClick={() => handleAuth("register")}
              >
                Sign up
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
