import json

STATUS_ALIASES = {
    "success": ["success", "ok"],
    "warning": ["warning", "warn"],
    "failure": ["failure", "fail", "error"],
}


def normalize_report_status(raw):
    if raw is None:
        return "unknown"
    value = str(raw).strip().lower()
    if not value:
        return "unknown"
    for normalized, aliases in STATUS_ALIASES.items():
        if value in aliases:
            return normalized
    return "unknown"


def expand_status_filter(status_param):
    if not status_param:
        return None
    value = str(status_param).strip().lower()
    if value in STATUS_ALIASES:
        return STATUS_ALIASES[value]
    return None


def parse_report_data(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _format_duration_seconds(report_data):
    if not isinstance(report_data, dict):
        return None
    for key in ("duration_seconds", "duration", "elapsed_seconds"):
        raw = report_data.get(key)
        if isinstance(raw, (int, float)):
            return float(raw)
    for key in ("duration_ms", "elapsed_ms", "runtime_ms"):
        raw = report_data.get(key)
        if isinstance(raw, (int, float)):
            return float(raw) / 1000.0
    return None


def _first_existing(data, keys):
    for key in keys:
        value = data.get(key)
        if value is not None and value != "":
            return value
    return None


def build_daily_summary(reports, range_label, date_label):
    counts = {"success": 0, "warning": 0, "failure": 0, "unknown": 0}
    normalized_items = []

    for report in reports:
        normalized = normalize_report_status(report.get("status"))
        counts[normalized] = counts.get(normalized, 0) + 1
        normalized_items.append((report, normalized))

    if counts["failure"] > 0:
        overall_status = "failure"
    elif counts["warning"] > 0:
        overall_status = "warning"
    elif len(reports) == 0:
        overall_status = "empty"
    else:
        overall_status = "success"

    prefix_map = {
        "success": "[SUCCESS]",
        "warning": "[WARNING]",
        "failure": "[FAILURE]",
        "empty": "[EMPTY]",
    }
    prefix = prefix_map.get(overall_status, "[EMPTY]")
    subject_text = f"{prefix} Daily Admin Summary ({date_label})"

    lines = [
        "DropBinge admin summary report.",
        f"Range: {range_label or '-'}",
        f"Total reports: {len(reports)}",
        f"Counts: success={counts['success']}, warning={counts['warning']}, failure={counts['failure']}, unknown={counts['unknown']}",
        "",
        "Details:",
    ]

    if not normalized_items:
        lines.append("- No reports in selected range.")
    else:
        for report, normalized in normalized_items:
            crawler_name = report.get("crawler_name") or report.get("job_name") or "-"
            raw_status = report.get("status") or "-"
            report_data = parse_report_data(report.get("report_data"))
            duration_seconds = _format_duration_seconds(report_data)
            summary = _first_existing(
                report_data,
                [
                    "message",
                    "error",
                    "detail",
                    "summary",
                    "events_emitted",
                    "claimed",
                ],
            )
            duration_text = (
                f"{duration_seconds:.2f}s" if isinstance(duration_seconds, (int, float)) else "-"
            )
            lines.append(
                f"- {crawler_name} / raw={raw_status} / normalized={normalized} / duration={duration_text} / summary={summary if summary is not None else '-'}"
            )

    return {
        "overall_status": overall_status,
        "subject_text": subject_text,
        "summary_text": "\n".join(lines),
        "counts": counts,
    }


def build_daily_notification_text(generated_at, stats, items):
    lines = [
        "DropBinge daily notification report.",
        f"Generated at: {generated_at}",
        f"Date: {stats.get('date', '-')}",
        (
            "Counts: total={total}, sent={sent}, pending={pending}, failed={failed}, recipients={recipients}".format(
                total=stats.get("total_items", 0),
                sent=stats.get("sent_count", 0),
                pending=stats.get("pending_count", 0),
                failed=stats.get("failed_count", 0),
                recipients=stats.get("unique_recipients", 0),
            )
        ),
        "",
        "Items:",
    ]

    if not items:
        lines.append("- No notification items in selected range.")
    else:
        for item in items:
            title = item.get("title") or f"TMDB {item.get('tmdb_id', '-')}"
            status = item.get("status") or "-"
            channel = item.get("channel") or "-"
            user_email = item.get("user_email") or "-"
            lines.append(f"- {title} / {channel} / {status} / {user_email}")

    return "\n".join(lines)
