const TOKEN_KEY = "dropbinge_token";
const inflightGetRequests = new Map<string, Promise<unknown>>();

export const getToken = () => window.localStorage.getItem(TOKEN_KEY);

export const setToken = (token: string | null) => {
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
};

export const apiFetch = async <T>(path: string, options: RequestInit = {}) => {
  const token = getToken();
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const dedupeKey = `${token || ""}:${path}`;

  const request = async () => {
    const response = await fetch(path, { ...options, headers });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Request failed");
    }
    return (await response.json()) as T;
  };

  if (method !== "GET") {
    return request();
  }

  const existing = inflightGetRequests.get(dedupeKey) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const pending = request().finally(() => {
    inflightGetRequests.delete(dedupeKey);
  });
  inflightGetRequests.set(dedupeKey, pending);
  return pending;
};
