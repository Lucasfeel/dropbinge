import argparse
import time

import config
from database import create_standalone_connection
from services.email_provider import build_email_provider_from_config
from services.outbox_dispatcher import dispatch_email_outbox_once


def _parse_args():
    parser = argparse.ArgumentParser(description="Dispatch email notification outbox.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="Run a single batch and exit.")
    mode.add_argument("--loop", action="store_true", help="Run continuously.")
    parser.add_argument("--dry-run", action="store_true", help="Do not send emails.")
    return parser.parse_args()


def main():
    args = _parse_args()
    run_loop = args.loop
    dry_run = args.dry_run or config.EMAIL_DISPATCH_DRY_RUN

    provider = build_email_provider_from_config()
    if provider is None and not dry_run:
        raise SystemExit("EMAIL_ENABLED is false or SMTP config missing. Use --dry-run to skip sending.")

    conn = create_standalone_connection()
    try:
        while True:
            summary = dispatch_email_outbox_once(
                conn,
                provider=provider,
                app_base_url=config.APP_BASE_URL,
                batch_size=config.EMAIL_DISPATCH_BATCH_SIZE,
                max_attempts=config.EMAIL_DISPATCH_MAX_ATTEMPTS,
                stale_minutes=config.EMAIL_DISPATCH_STALE_SENDING_MINUTES,
                backoff_base=config.EMAIL_DISPATCH_BACKOFF_BASE_SECONDS,
                backoff_max=config.EMAIL_DISPATCH_BACKOFF_MAX_SECONDS,
                dry_run=dry_run,
            )
            print(summary)
            if not run_loop:
                break
            time.sleep(config.EMAIL_DISPATCH_LOOP_SECONDS)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
