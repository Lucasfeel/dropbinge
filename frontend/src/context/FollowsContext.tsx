import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiFetch } from "../api";
import type { Follow } from "../types";
import { useAuth } from "../hooks/useAuth";

type FollowsContextValue = {
  follows: Follow[];
  loading: boolean;
  refresh: () => Promise<void>;
};

export const FollowsContext = createContext<FollowsContextValue | null>(null);

export const FollowsProvider = ({ children }: { children: ReactNode }) => {
  const { token } = useAuth();
  const [follows, setFollows] = useState<Follow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setFollows([]);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{ follows: Follow[] }>("/api/my/follows");
      setFollows(data.follows);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setFollows([]);
      return;
    }
    refresh();
  }, [refresh, token]);

  const value = useMemo(
    () => ({
      follows,
      loading,
      refresh,
    }),
    [follows, loading, refresh],
  );

  return <FollowsContext.Provider value={value}>{children}</FollowsContext.Provider>;
};
