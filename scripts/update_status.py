#!/usr/bin/env python3
"""
Update site/status.json with run metadata.

Designed to be run locally or in GitHub Actions. In Actions it will pull useful
context from environment variables.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo  # py3.9+
    from zoneinfo import ZoneInfoNotFoundError
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore
    ZoneInfoNotFoundError = Exception  # type: ignore


STATUS_PATH = Path("site") / "status.json"
LOCAL_TZ_NAME = "America/New_York"


@dataclass(frozen=True)
class RunContext:
    repository: str
    workflow: str
    run_id: str
    run_attempt: str
    sha: str
    actor: str
    ref: str


def _env(name: str, default: str = "") -> str:
    v = os.getenv(name)
    return default if v is None else v


def get_run_context() -> RunContext:
    return RunContext(
        repository=_env("GITHUB_REPOSITORY"),
        workflow=_env("GITHUB_WORKFLOW"),
        run_id=_env("GITHUB_RUN_ID"),
        run_attempt=_env("GITHUB_RUN_ATTEMPT"),
        sha=_env("GITHUB_SHA"),
        actor=_env("GITHUB_ACTOR"),
        ref=_env("GITHUB_REF"),
    )


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def now_local_iso(tz_name: str) -> str:
    if ZoneInfo is None:
        # Fallback: still provide something deterministic if zoneinfo isn't available.
        return now_utc_iso()
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        # Common on Windows without the tzdata package installed.
        return now_utc_iso()
    return datetime.now(tz).replace(microsecond=0).isoformat()


def read_existing(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    ctx = get_run_context()
    existing = read_existing(STATUS_PATH)

    # Keep a stable top-level schema; preserve any extra keys users may add.
    out = dict(existing) if isinstance(existing, dict) else {}
    out.update(
        {
            "generatedBy": "scripts/update_status.py",
            "localTimezone": LOCAL_TZ_NAME,
            "lastRunLocal": now_local_iso(LOCAL_TZ_NAME),
            "lastRunUtc": now_utc_iso(),
            "note": "Automated site metadata update (scheduled).",
            "run": {
                "actor": ctx.actor,
                "ref": ctx.ref,
                "repository": ctx.repository,
                "runAttempt": ctx.run_attempt,
                "runId": ctx.run_id,
                "sha": ctx.sha,
                "workflow": ctx.workflow,
            },
        }
    )

    write_json(STATUS_PATH, out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


