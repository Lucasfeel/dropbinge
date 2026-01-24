import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiFetch, getToken, setToken } from "../api";
import type { User } from "../types";

type AuthContextValue = {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  loadingUser: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  const hydrateUser = useCallback(async () => {
    setLoadingUser(true);
    try {
      const data = await apiFetch<{ user: User }>("/api/auth/me");
      setUser(data.user);
    } catch (error) {
      setToken(null);
      setTokenState(null);
      setUser(null);
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoadingUser(false);
      return;
    }
    hydrateUser();
  }, [hydrateUser, token]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      loadingUser,
      login,
      register,
      logout,
    }),
    [token, user, loadingUser, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
