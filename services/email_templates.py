def _target_label(target_type, season_number):
    if target_type == "movie":
        return "Movie"
    if target_type == "tv_full":
        return "TV Series"
    if target_type == "tv_season":
        if season_number is not None:
            return f"TV Season {season_number}"
        return "TV Season"
    return "Title"


def _build_deep_link(app_base_url, target_type, tmdb_id, season_number):
    if not app_base_url:
        return None
    if target_type == "movie":
        return f"{app_base_url}/title/movie/{tmdb_id}"
    if target_type == "tv_full":
        return f"{app_base_url}/title/tv/{tmdb_id}"
    if target_type == "tv_season":
        if season_number is None:
            return None
        return f"{app_base_url}/title/tv/{tmdb_id}/season/{season_number}"
    return None


def _event_subject(event_type, title):
    if event_type == "date_set":
        return f"[DropBinge] DROP — {title} — Date set"
    if event_type == "date_changed":
        return f"[DropBinge] DROP — {title} — Date changed"
    if event_type == "season_binge_ready":
        return f"[DropBinge] BINGE — {title} — Season ready"
    if event_type == "full_run_concluded":
        return f"[DropBinge] BINGE — {title} — Series concluded"
    if event_type == "status_milestone":
        return f"[DropBinge] UPDATE — {title} — Status changed"
    return f"[DropBinge] UPDATE — {title} — Activity update"


def _format_field_label(field_name):
    if field_name == "next_air_date":
        return "Next episode date"
    if field_name:
        return field_name.replace("_", " ").title()
    return None


def build_email_message(outbox_payload, *, app_base_url=None):
    event_type = outbox_payload.get("event_type") or "update"
    event_payload = outbox_payload.get("event_payload") or {}
    target_type = outbox_payload.get("target_type")
    tmdb_id = outbox_payload.get("tmdb_id")
    season_number = outbox_payload.get("season_number")
    title = outbox_payload.get("title") or "Untitled"

    subject = _event_subject(event_type, title)
    target_label = _target_label(target_type, season_number)
    field_label = _format_field_label(event_payload.get("field"))
    deep_link = _build_deep_link(app_base_url, target_type, tmdb_id, season_number)

    lines = [f"Title: {title}", f"Target: {target_label}"]

    if event_type == "date_set":
        if field_label:
            lines.append(f"Field: {field_label}")
        lines.append(f"To: {event_payload.get('to')}")
    elif event_type == "date_changed":
        if field_label:
            lines.append(f"Field: {field_label}")
        lines.append(f"From: {event_payload.get('from')}")
        lines.append(f"To: {event_payload.get('to')}")
    elif event_type == "season_binge_ready":
        lines.append(f"Last episode air date: {event_payload.get('last_episode_air_date')}")
    elif event_type == "full_run_concluded":
        lines.append(f"From: {event_payload.get('from')}")
        lines.append(f"To: {event_payload.get('to')}")
    elif event_type == "status_milestone":
        lines.append(f"From: {event_payload.get('from')}")
        lines.append(f"To: {event_payload.get('to')}")

    if deep_link:
        lines.append(f"Link: {deep_link}")

    lines.append("You are receiving this because you follow this title in DropBinge.")
    text = "\n".join(lines)

    html_lines = [f"<p>{line}</p>" for line in lines]
    if deep_link:
        html_lines = html_lines[:-2] + [
            f'<p>Link: <a href="{deep_link}">{deep_link}</a></p>'
        ] + html_lines[-2:]
    html = "\n".join(html_lines)

    return {"subject": subject, "text": text, "html": html}
