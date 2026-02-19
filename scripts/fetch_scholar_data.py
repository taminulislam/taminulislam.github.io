#!/usr/bin/env python3
"""
Fetch Google Scholar profile data and save to site/scholar_data.json.

Uses the `scholarly` library to pull publication and citation statistics.
Designed to run locally or in GitHub Actions (scheduled).

Usage:
    pip install scholarly
    python scripts/fetch_scholar_data.py
"""

from __future__ import annotations

import json
import signal
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

try:
    from scholarly import scholarly, ProxyGenerator
except ImportError:
    print("ERROR: 'scholarly' package not installed. Run: pip install scholarly")
    raise SystemExit(1)

SCHOLAR_ID = "Kgo_S9sAAAAJ"
OUTPUT_PATH = Path("site") / "scholar_data.json"
TIMEOUT_SECONDS = 120  # 2-minute timeout for the entire fetch


class TimeoutError(Exception):
    pass


def _timeout_handler(signum, frame):
    raise TimeoutError("Google Scholar fetch timed out")


def fetch_scholar_data(scholar_id: str) -> dict:
    """Fetch author profile and publication data from Google Scholar."""

    # Set up a free proxy to avoid Google blocking GitHub Actions IPs
    print("Setting up free proxy...")
    try:
        pg = ProxyGenerator()
        pg.FreeProxies()
        scholarly.use_proxy(pg)
        print("Proxy configured successfully.")
    except Exception as e:
        print(f"Warning: Could not set up proxy ({e}). Trying without proxy...")

    print(f"Fetching scholar profile: {scholar_id}")
    author = scholarly.search_author_id(scholar_id)
    # Only fetch basics and indices — skip filling individual publications
    # to avoid being blocked by Google
    author = scholarly.fill(author, sections=["basics", "indices", "publications"])

    total_citations = author.get("citedby", 0)
    h_index = author.get("hindex", 0)
    i10_index = author.get("i10index", 0)

    # Extract citations per year from the author profile
    citations_per_year: dict[str, int] = {}
    cites_per_year = author.get("cites_per_year", {})
    for year, count in sorted(cites_per_year.items()):
        year_str = str(year)
        if int(year_str) >= 2020:
            citations_per_year[year_str] = count

    # Count publications per year
    pubs_per_year: dict[str, int] = defaultdict(int)
    publications = author.get("publications", [])
    for pub in publications:
        bib = pub.get("bib", {})
        pub_year = bib.get("pub_year", "")
        if pub_year and int(pub_year) >= 2020:
            pubs_per_year[str(pub_year)] += 1

    # Sort by year
    pubs_per_year_sorted = dict(sorted(pubs_per_year.items()))

    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    data = {
        "lastUpdated": now_utc,
        "scholarId": scholar_id,
        "totalCitations": total_citations,
        "hIndex": h_index,
        "i10Index": i10_index,
        "publicationsPerYear": pubs_per_year_sorted,
        "citationsPerYear": citations_per_year,
    }

    return data


def main() -> int:
    # Set a timeout (Unix only; on Windows signal.SIGALRM is not available)
    if hasattr(signal, "SIGALRM"):
        signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(TIMEOUT_SECONDS)
        print(f"Timeout set to {TIMEOUT_SECONDS}s")

    try:
        data = fetch_scholar_data(SCHOLAR_ID)
    except TimeoutError:
        print(f"ERROR: Timed out after {TIMEOUT_SECONDS}s.")
        print("Keeping existing data if available.")
        return 1
    except Exception as e:
        print(f"ERROR fetching scholar data: {e}")
        print("Keeping existing data if available.")
        return 1
    finally:
        if hasattr(signal, "SIGALRM"):
            signal.alarm(0)  # Cancel the alarm

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Scholar data saved to {OUTPUT_PATH}")
    print(f"  Total citations: {data['totalCitations']}")
    print(f"  h-index: {data['hIndex']}")
    print(f"  Publications: {data['publicationsPerYear']}")
    print(f"  Citations/year: {data['citationsPerYear']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
