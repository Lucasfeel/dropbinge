import datetime
import logging
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import config
from services import tmdb_client, tmdb_http_cache


logger = logging.getLogger(__name__)

INDEX_KIND = "index:tv_upcoming_seasons"
INDEX_VERSION = "v1"
PAGE_SIZE = 20


def _now_iso():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _today_iso():
    return datetime.date.today().isoformat()


def _cache_key(language):
    query_key = f"{INDEX_VERSION}|lang={language or ''}"
    return tmdb_http_cache.make_cache_key(INDEX_KIND, query_key=query_key)


def _load_index(db, language):
    cache_key = _cache_key(language)
    payload = tmdb_http_cache.get_cached(db, *cache_key)
    if payload and isinstance(payload.get("items"), list):
        return payload
    return None


def _save_index(db, language, payload, ttl_seconds):
    cache_key = _cache_key(language)
    tmdb_http_cache.set_cached(
        db,
        cache_key[0],
        cache_key[1],
        cache_key[2],
        payload,
        ttl_seconds,
    )


def _season_start_date(season, next_episode):
    air_date = season.get("air_date")
    if air_date:
        return air_date
    next_season = next_episode.get("season_number")
    next_air_date = next_episode.get("air_date")
    if next_air_date and next_season == season.get("season_number"):
        return next_air_date
    return None


def _extract_upcoming_seasons(tv_details, today_iso):
    if not tv_details:
        return []
    status = tv_details.get("status")
    if status in {"Ended", "Canceled"}:
        return []
    last_episode = tv_details.get("last_episode_to_air") or {}
    last_aired_season = last_episode.get("season_number")
    if not isinstance(last_aired_season, int):
        last_aired_season = None
    next_episode = tv_details.get("next_episode_to_air") or {}
    series_id = tv_details.get("id")
    series_name = tv_details.get("name") or f"TMDB {series_id}"
    results = []
    for season in tv_details.get("seasons") or []:
        season_number = season.get("season_number")
        if not isinstance(season_number, int) or season_number < 1:
            continue
        if last_aired_season is not None and last_aired_season >= season_number:
            continue
        season_start_date = _season_start_date(season, next_episode)
        if not season_start_date or season_start_date <= today_iso:
            continue
        season_id = season.get("id") or abs(
            tmdb_http_cache.stable_bigint_hash(f"tv:{series_id}:season:{season_number}")
        )
        results.append(
            {
                "id": season_id,
                "media_type": "tv",
                "title": series_name,
                "poster_path": season.get("poster_path") or tv_details.get("poster_path"),
                "backdrop_path": tv_details.get("backdrop_path"),
                "date": season_start_date,
                "vote_average": tv_details.get("vote_average"),
                "vote_count": tv_details.get("vote_count"),
                "season_number": season_number,
                "season_name": season.get("name"),
                "series_id": series_id,
                "series_name": series_name,
                "popularity": tv_details.get("popularity"),
                "is_completed": False,
            }
        )
    return results


def _dedupe_sort_trim(items, max_items=None):
    max_items = max_items or config.TMDB_UPCOMING_MAX_ITEMS
    deduped = {}
    for item in items:
        key = (item.get("series_id"), item.get("season_number"))
        if key[0] is None or key[1] is None:
            continue
        existing = deduped.get(key)
        if existing is None:
            deduped[key] = item
            continue
        existing_date = existing.get("date")
        candidate_date = item.get("date")
        if candidate_date and (not existing_date or candidate_date < existing_date):
            deduped[key] = item
    sorted_items = sorted(
        deduped.values(),
        key=lambda entry: (
            entry.get("date") or "9999-12-31",
            -(entry.get("popularity") or 0),
        ),
    )
    return sorted_items[:max_items]


def _fetch_changed_tv_ids(start_date, end_date, max_ids):
    page = 1
    tv_ids = []
    seen = set()
    while True:
        payload = tmdb_client.list_tv_changes(
            page=page, start_date=start_date, end_date=end_date
        )
        results = payload.get("results") or []
        for entry in results:
            tv_id = entry.get("id")
            if not tv_id or tv_id in seen:
                continue
            seen.add(tv_id)
            tv_ids.append(tv_id)
            if len(tv_ids) >= max_ids:
                return tv_ids
        total_pages = payload.get("total_pages") or 1
        if page >= total_pages:
            break
        page += 1
    return tv_ids


def _get_tv_details_cached(tv_id, language, force_refresh):
    cache_key = tmdb_http_cache.make_cache_key("http:tv_detail", tmdb_id=tv_id)
    if not force_refresh:
        cached = tmdb_http_cache.get_cached(None, *cache_key)
        if cached is not None:
            return cached
    payload = tmdb_client.get_tv_details(tv_id, language=language)
    tmdb_http_cache.set_cached(
        None,
        cache_key[0],
        cache_key[1],
        cache_key[2],
        payload,
        tmdb_http_cache.TV_TTL_SECONDS,
    )
    return payload


def _get_tv_popular_page_cached(page, language=None):
    query_key = f"page={page}&language={language or ''}"
    cache_key = tmdb_http_cache.make_cache_key("http:tv_popular_raw", query_key=query_key)
    cached = tmdb_http_cache.get_cached(None, *cache_key)
    if cached is not None:
        return cached
    payload = tmdb_client.list_tv_popular(page=page, language=language)
    tmdb_http_cache.set_cached(
        None,
        cache_key[0],
        cache_key[1],
        cache_key[2],
        payload,
        tmdb_http_cache.LIST_TTL_SECONDS,
    )
    return payload


def _get_tv_on_the_air_page_cached(page, language=None):
    query_key = f"page={page}&language={language or ''}"
    cache_key = tmdb_http_cache.make_cache_key("http:tv_on_the_air_raw", query_key=query_key)
    cached = tmdb_http_cache.get_cached(None, *cache_key)
    if cached is not None:
        return cached
    payload = tmdb_client.list_tv_on_the_air(page=page, language=language)
    tmdb_http_cache.set_cached(
        None,
        cache_key[0],
        cache_key[1],
        cache_key[2],
        payload,
        tmdb_http_cache.LIST_TTL_SECONDS,
    )
    return payload


def _full_rebuild_scan(language, target_items):
    items = []
    seen_ids = set()
    feeds = [
        ("popular", config.TMDB_UPCOMING_FULL_REBUILD_POPULAR_PAGES, _get_tv_popular_page_cached),
        ("on-the-air", config.TMDB_UPCOMING_FULL_REBUILD_ON_THE_AIR_PAGES, _get_tv_on_the_air_page_cached),
    ]
    today_iso = _today_iso()
    for _, max_pages, fetcher in feeds:
        for page in range(1, max_pages + 1):
            payload = fetcher(page, language)
            for entry in payload.get("results") or []:
                tv_id = entry.get("id")
                if not tv_id or tv_id in seen_ids:
                    continue
                seen_ids.add(tv_id)
                details = _get_tv_details_cached(tv_id, language, force_refresh=False)
                items.extend(_extract_upcoming_seasons(details, today_iso))
                if len(items) >= target_items:
                    return _dedupe_sort_trim(items, target_items), len(seen_ids)
    return _dedupe_sort_trim(items, target_items), len(seen_ids)


def get_upcoming_seasons_page(db, page, language):
    payload = _load_index(db, language)
    if not payload:
        response = {"page": page, "total_pages": 0, "results": []}
        return response, False
    items = payload.get("items") or []
    total_pages = math.ceil(len(items) / PAGE_SIZE) if items else 0
    start_idx = (page - 1) * PAGE_SIZE
    end_idx = page * PAGE_SIZE
    page_items = items[start_idx:end_idx] if start_idx < len(items) else []
    response = {
        "page": page,
        "total_pages": total_pages,
        "results": page_items,
    }
    return response, True


def refresh_upcoming_seasons_index(db, language, full_rebuild=False):
    start_time = time.perf_counter()
    now_iso = _now_iso()
    existing = _load_index(db, language)
    existing_items = list((existing or {}).get("items") or [])
    generated_at = (existing or {}).get("generated_at") or now_iso
    mode = "full" if full_rebuild else "incremental"

    try:
        if full_rebuild:
            items, processed_tv_ids = _full_rebuild_scan(
                language,
                config.TMDB_UPCOMING_MAX_ITEMS,
            )
            payload = {
                "version": INDEX_VERSION,
                "language": language,
                "generated_at": now_iso,
                "last_refresh_at": now_iso,
                "items": items,
            }
            _save_index(
                db,
                language,
                payload,
                config.TMDB_CACHE_TTL_TV_UPCOMING_INDEX_SECONDS,
            )
            took_ms = int((time.perf_counter() - start_time) * 1000)
            return {
                "ok": True,
                "mode": mode,
                "processed_tv_ids": processed_tv_ids,
                "items": len(items),
                "generated_at": payload["generated_at"],
                "took_ms": took_ms,
            }

        lookback_days = max(1, min(config.TMDB_UPCOMING_CHANGES_LOOKBACK_DAYS, 14))
        start_date = (datetime.date.today() - datetime.timedelta(days=lookback_days)).isoformat()
        end_date = datetime.date.today().isoformat()
        changed_ids = _fetch_changed_tv_ids(
            start_date=start_date,
            end_date=end_date,
            max_ids=config.TMDB_UPCOMING_MAX_ITEMS,
        )
        changed_id_set = set(changed_ids)
        refreshed_items = [
            item for item in existing_items if item.get("series_id") not in changed_id_set
        ]
        today_iso = _today_iso()
        if changed_ids:
            with ThreadPoolExecutor(max_workers=config.TMDB_UPCOMING_DETAIL_WORKERS) as executor:
                future_map = {
                    executor.submit(_get_tv_details_cached, tv_id, language, True): tv_id
                    for tv_id in changed_ids
                }
                for future in as_completed(future_map):
                    tv_id = future_map[future]
                    details = future.result()
                    if not details:
                        continue
                    refreshed_items.extend(_extract_upcoming_seasons(details, today_iso))

        trimmed = _dedupe_sort_trim(refreshed_items)
        payload = {
            "version": INDEX_VERSION,
            "language": language,
            "generated_at": generated_at,
            "last_refresh_at": now_iso,
            "items": trimmed,
        }
        _save_index(
            db,
            language,
            payload,
            config.TMDB_CACHE_TTL_TV_UPCOMING_INDEX_SECONDS,
        )
        took_ms = int((time.perf_counter() - start_time) * 1000)
        return {
            "ok": True,
            "mode": mode,
            "processed_tv_ids": len(changed_ids),
            "items": len(trimmed),
            "generated_at": payload["generated_at"],
            "took_ms": took_ms,
        }
    except tmdb_client.TMDBRateLimitError:
        logger.warning("tmdb upcoming seasons refresh rate limited")
        took_ms = int((time.perf_counter() - start_time) * 1000)
        return {
            "ok": False,
            "mode": mode,
            "error": "rate_limited",
            "processed_tv_ids": 0,
            "items": len(existing_items),
            "generated_at": generated_at,
            "took_ms": took_ms,
        }
    except tmdb_client.TMDBError:
        logger.exception("tmdb upcoming seasons refresh failed")
        took_ms = int((time.perf_counter() - start_time) * 1000)
        return {
            "ok": False,
            "mode": mode,
            "error": "tmdb_error",
            "processed_tv_ids": 0,
            "items": len(existing_items),
            "generated_at": generated_at,
            "took_ms": took_ms,
        }
    except Exception:
        logger.exception("unexpected error refreshing upcoming seasons index")
        took_ms = int((time.perf_counter() - start_time) * 1000)
        return {
            "ok": False,
            "mode": mode,
            "error": "internal_error",
            "processed_tv_ids": 0,
            "items": len(existing_items),
            "generated_at": generated_at,
            "took_ms": took_ms,
        }
