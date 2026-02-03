import { apiFetch } from "../api";
import type { TitleSummaryResponse } from "../types";

export const fetchMoviePopular = (page = 1) =>
  apiFetch<TitleSummaryResponse>(`/api/tmdb/list/movie/popular?page=${page}`);

export const fetchMovieUpcoming = (page = 1) =>
  apiFetch<TitleSummaryResponse>(`/api/tmdb/list/movie/upcoming?page=${page}`);

export const fetchMovieOutNow = (page = 1) =>
  apiFetch<TitleSummaryResponse>(`/api/tmdb/list/movie/out_now?page=${page}`);

export const fetchMovieCompleted = (page = 1) =>
  apiFetch<TitleSummaryResponse>(`/api/tmdb/list/movie/completed?page=${page}`);

export const fetchTvPopular = (page = 1) =>
  apiFetch<TitleSummaryResponse>(`/api/tmdb/list/tv/popular?page=${page}`);

export const fetchTvOnTheAir = (page = 1) =>
  apiFetch<TitleSummaryResponse>(`/api/tmdb/list/tv/on_the_air?page=${page}`);

export const fetchTvCompleted = (page = 1) =>
  apiFetch<TitleSummaryResponse>(`/api/tmdb/list/tv/completed?page=${page}`);

export const fetchTvSeasons = (
  page = 1,
  list: "on-the-air" | "popular" | "completed" | "upcoming" = "on-the-air",
) =>
  apiFetch<TitleSummaryResponse>(
    `/api/tmdb/list/tv/seasons?page=${page}&list=${encodeURIComponent(list)}`,
  );

export const fetchTrendingAllDay = (page = 1) =>
  apiFetch<TitleSummaryResponse>(`/api/tmdb/list/trending/all/day?page=${page}`);
