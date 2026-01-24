import type { Follow } from "../types";

export const getTitle = (follow: Follow) => {
  if (follow.cache_payload && typeof follow.cache_payload === "object") {
    return (
      (follow.cache_payload as { title?: string; name?: string }).title ||
      (follow.cache_payload as { name?: string }).name ||
      `TMDB ${follow.tmdb_id}`
    );
  }
  return `TMDB ${follow.tmdb_id}`;
};
