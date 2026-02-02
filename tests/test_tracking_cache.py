import datetime

from services.tmdb_tracking_cache import compute_tracking_ttl_seconds


def test_tv_ttl_final_status_is_seven_days():
    payload = {"status": "Ended"}
    ttl = compute_tracking_ttl_seconds("tv", payload, "tv_full")
    assert ttl == 7 * 24 * 60 * 60


def test_tv_ttl_next_episode_is_six_hours():
    payload = {"status": "Returning Series", "next_episode_to_air": {"air_date": "2030-01-01"}}
    ttl = compute_tracking_ttl_seconds("tv", payload, "tv_full")
    assert ttl == 6 * 60 * 60


def test_tv_ttl_no_signal_is_twenty_four_hours():
    payload = {"status": "Returning Series", "last_air_date": (datetime.date.today() - datetime.timedelta(days=120)).isoformat()}
    ttl = compute_tracking_ttl_seconds("tv", payload, "tv_full")
    assert ttl == 24 * 60 * 60
