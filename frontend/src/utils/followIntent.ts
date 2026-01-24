import type { FollowPayload } from "../types";

type FollowIntent = {
  payload: FollowPayload;
  mediaType: "movie" | "tv";
  tmdbId: number;
};

const STORAGE_KEY = "dropbinge_follow_intent";

export const setFollowIntent = (intent: FollowIntent) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
};

export const getFollowIntent = (): FollowIntent | null => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FollowIntent;
  } catch (error) {
    return null;
  }
};

export const clearFollowIntent = () => {
  window.localStorage.removeItem(STORAGE_KEY);
};
