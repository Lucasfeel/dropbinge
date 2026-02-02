import { apiFetch } from "../api";
import type { TitleSummaryResponse } from "../types";

export const fetchMoviePopular = (page = 1) =>
  apiFetch<TitleSummaryResponse>(`/api/tmdb/list/movie/popular?page=${page}`);

export const fetchMovieUpcoming = (page = 1) =>
  apiFetch<TitleSummaryResponse>(`/api/tmdb/list/movie/upcoming?page=${page}`);

export const fetchTvPopular = (page = 1) =>
  apiFetch<TitleSummaryResponse>(`/api/tmdb/list/tv/popular?page=${page}`);

export const fetchTvOnTheAir = (page = 1) =>
  apiFetch<TitleSummaryResponse>(`/api/tmdb/list/tv/on_the_air?page=${page}`);

export const fetchTrendingAllDay = (page = 1) =>
  apiFetch<TitleSummaryResponse>(`/api/tmdb/list/trending/all/day?page=${page}`);
