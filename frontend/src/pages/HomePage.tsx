import { useEffect, useState } from "react";

import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";

export const HomePage = () => {
  const { token } = useAuth();
  const [home, setHome] = useState<any | null>(null);

  useEffect(() => {
    if (!token) {
      setHome(null);
      return;
    }
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
