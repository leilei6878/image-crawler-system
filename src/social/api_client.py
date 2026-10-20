"""CLI facade for the management API, which owns all real crawl state."""

import os
from urllib.parse import quote, urlsplit

import requests


def run_api_command(args, session=None):
    base_url = args.server_url.rstrip("/")
    parsed = urlsplit(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username:
        raise ValueError("server-url must be an http(s) URL without credentials")
    token = os.environ.get("ADMIN_API_TOKEN")
    if not token:
        raise ValueError("Set ADMIN_API_TOKEN to use the management API")
    session = session or requests.Session()
    method, payload = "POST", {}
    if args.command == "create-social-source":
        route = "/social/sources"
        payload = {key: getattr(args, key, None) for key in (
            "platform", "account_name", "profile_url", "crawl_mode", "schedule_type", "max_items", "notes"
        )}
        payload["rate_limit_policy"] = {
            "requests_per_minute": args.requests_per_minute,
            "min_delay_seconds": args.min_delay_seconds,
            "burst": 1,
        }
    elif args.command == "create-job":
        route = "/social/jobs"
        payload = {key: getattr(args, key, None) for key in (
            "source_id", "crawl_mode", "schedule_type", "max_items", "interval_seconds", "cron_expression", "notes"
        )}
    elif args.command in {"run-job", "job-status"}:
        job_id = quote(str(args.job_id), safe="")
        route = "/social/jobs/" + job_id + ("/run" if args.command == "run-job" else "/status")
        if args.command == "job-status":
            method = "GET"
    else:
        raise ValueError("Unsupported management API command")
    response = session.request(
        method, base_url + "/api" + route,
        json={key: value for key, value in payload.items() if value is not None} if method == "POST" else None,
        headers={"Authorization": "Bearer " + token},
        timeout=30, allow_redirects=False,
    )
    if not 200 <= response.status_code < 300:
        raise RuntimeError(f"Management API returned HTTP {response.status_code}")
    return response.json()
