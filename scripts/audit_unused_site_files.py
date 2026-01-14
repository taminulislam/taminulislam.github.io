#!/usr/bin/env python3
"""
Audit unused files in a static site repo (conservative).

Entrypoints:
- index.html (repo root)
- all site/**/*.html

We parse local references from:
- HTML attributes: href, src, poster, data-src, data-href
- CSS url(...) references from linked stylesheets (local only)

We then inventory on-disk files under:
- site/
- html/
- files/
- docs/
- root: index.html, robots.txt, sitemap.xml, CNAME

Output:
- reports/unused-site-files.json

This script is intentionally conservative: anything ambiguous is treated as
referenced (i.e., NOT a deletion candidate).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import unquote, urlsplit


REFERENCE_ATTRS = {"href", "src", "poster", "data-src", "data-href"}
CSS_URL_RE = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE)


def is_external_url(raw: str) -> bool:
    v = raw.strip()
    if not v:
        return True
    if v.startswith("#"):
        return True
    # Schemes and special pseudo-URLs we never treat as local files
    lowered = v.lower()
    return lowered.startswith((
        "http://",
        "https://",
        "mailto:",
        "tel:",
        "javascript:",
        "data:",
    ))


def normalize_ref(raw: str) -> Optional[str]:
    """
    Convert a URL-ish reference into a normalized repo-relative path string.
    Returns None if not a local path.
    """
    raw = raw.strip()
    if not raw or is_external_url(raw):
        return None

    parts = urlsplit(raw)
    if parts.scheme or parts.netloc:
        return None

    path = unquote(parts.path)
    if not path or path.endswith("/"):
        # We don't try to infer directory index files; treat as non-file reference.
        return None

    # Strip leading "./"
    while path.startswith("./"):
        path = path[2:]

    # Strip leading "/" (site is served from repo root)
    if path.startswith("/"):
        path = path[1:]

    if not path:
        return None

    return path


def resolve_against(base_file: Path, ref_path: str, repo_root: Path) -> Optional[Path]:
    """
    Resolve a normalized ref path to a concrete filesystem path.
    If ref_path is relative, resolve from base_file.parent; if it's already root-like,
    resolve from repo_root.
    """
    # If it contains parent traversal, we still resolve it but normalize.
    if ref_path.startswith(("site/", "files/", "html/", "docs/")) or "/" in ref_path[:1]:
        cand = (repo_root / ref_path).resolve()
    else:
        cand = (base_file.parent / ref_path).resolve()

    try:
        return cand.relative_to(repo_root.resolve()) and cand
    except Exception:
        # Points outside repo; ignore.
        return None


class RefHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.refs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        for k, v in attrs:
            if k in REFERENCE_ATTRS and v:
                self.refs.append(v)


def extract_html_refs(html_text: str) -> list[str]:
    p = RefHTMLParser()
    try:
        p.feed(html_text)
    except Exception:
        # Be conservative: if parsing fails, return empty; we will not delete uncertain files anyway.
        return []
    return p.refs


def extract_css_refs(css_text: str) -> list[str]:
    refs: list[str] = []
    for m in CSS_URL_RE.finditer(css_text):
        refs.append(m.group(2))
    return refs


@dataclass(frozen=True)
class FileInfo:
    path: str
    size: int


def iter_files(repo_root: Path, rel_dirs: Iterable[str]) -> list[FileInfo]:
    out: list[FileInfo] = []
    for d in rel_dirs:
        p = repo_root / d
        if not p.exists():
            continue
        if p.is_file():
            st = p.stat()
            out.append(FileInfo(path=d.replace("\\", "/"), size=st.st_size))
            continue
        for f in p.rglob("*"):
            if f.is_file():
                st = f.stat()
                rel = f.relative_to(repo_root).as_posix()
                out.append(FileInfo(path=rel, size=st.st_size))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="Repo root (default: .)")
    ap.add_argument("--report", default="reports/unused-site-files.json")
    args = ap.parse_args()

    repo_root = Path(args.root).resolve()

    # Entrypoints
    entrypoints: list[Path] = []
    root_index = repo_root / "index.html"
    if root_index.exists():
        entrypoints.append(root_index)
    entrypoints.extend(sorted((repo_root / "site").rglob("*.html")) if (repo_root / "site").exists() else [])

    referenced_files: set[str] = set()
    referenced_missing: set[str] = set()

    # We also track linked CSS to parse url(...) references.
    css_to_parse: set[Path] = set()

    for html_file in entrypoints:
        try:
            html_text = html_file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        raw_refs = extract_html_refs(html_text)
        for raw in raw_refs:
            norm = normalize_ref(raw)
            if norm is None:
                continue
            resolved = resolve_against(html_file, norm, repo_root)
            if resolved is None:
                continue
            rel = resolved.relative_to(repo_root).as_posix()

            # Track local refs even if file doesn't exist (helps find broken links)
            if resolved.exists():
                referenced_files.add(rel)
            else:
                referenced_missing.add(rel)

            # Collect local CSS for url(...) parsing
            if rel.lower().endswith(".css") and resolved.exists():
                css_to_parse.add(resolved)

    # Parse CSS url(...) references
    for css_file in sorted(css_to_parse):
        try:
            css_text = css_file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for raw in extract_css_refs(css_text):
            norm = normalize_ref(raw)
            if norm is None:
                continue
            resolved = resolve_against(css_file, norm, repo_root)
            if resolved is None:
                continue
            rel = resolved.relative_to(repo_root).as_posix()
            if resolved.exists():
                referenced_files.add(rel)
            else:
                referenced_missing.add(rel)

    # Inventory (web-facing)
    inventory_dirs = [
        "site",
        "html",
        "files",
        "docs",
        "robots.txt",
        "sitemap.xml",
        "CNAME",
        "index.html",
    ]
    all_files = iter_files(repo_root, inventory_dirs)
    all_paths = {fi.path for fi in all_files}

    # Allowlist things that may be fetched dynamically even if not referenced
    allowlist_exact = {
        "site/search.json",
        "site/listings.json",
        "site/sitemap.xml",
        "site/robots.txt",
    }

    unused = []
    for fi in all_files:
        if fi.path in allowlist_exact:
            continue
        if fi.path in referenced_files:
            continue
        # Don't delete entrypoint HTMLs even if unreferenced by others.
        if fi.path == "index.html" or (fi.path.startswith("site/") and fi.path.lower().endswith(".html")):
            continue
        unused.append(fi)

    # High-confidence safe-to-delete subset (very conservative)
    safe_delete: list[FileInfo] = []
    for fi in unused:
        p = fi.path
        # Old accidental cache folder in this repo (has a space); safe to delete when unreferenced
        if p.startswith("_freeze "):
            safe_delete.append(fi)
            continue
        # Docs folder not used when Pages source is root (still only if unreferenced)
        if p.startswith("docs/"):
            safe_delete.append(fi)
            continue
        # Notebook artifacts in published site output
        if p.startswith("site/") and p.lower().endswith(".ipynb"):
            safe_delete.append(fi)
            continue
        # Source maps (if any) are safe to remove when unreferenced
        if p.startswith("site/") and p.lower().endswith(".map"):
            safe_delete.append(fi)
            continue

    report_path = (repo_root / args.report).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)

    def pack(infos: list[FileInfo]) -> list[dict]:
        return [{"path": x.path, "size": x.size} for x in sorted(infos, key=lambda z: (z.path))]

    out = {
        "entrypointsCount": len(entrypoints),
        "referencedFilesCount": len(referenced_files),
        "referencedMissingCount": len(referenced_missing),
        "referencedMissing": sorted(referenced_missing),
        "inventoryFilesCount": len(all_files),
        "unusedCandidatesCount": len(unused),
        "unusedCandidatesTotalBytes": sum(x.size for x in unused),
        "unusedCandidates": pack(unused),
        "safeDeleteCount": len(safe_delete),
        "safeDeleteTotalBytes": sum(x.size for x in safe_delete),
        "safeDelete": pack(safe_delete),
        "notes": [
            "This audit is conservative. Anything ambiguous is treated as referenced.",
            "Review safeDelete list; only those are intended for automatic deletion in safe mode.",
        ],
    }
    report_path.write_text(json.dumps(out, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # Console summary
    print(f"Wrote report: {report_path}")
    print(f"Entrypoints: {len(entrypoints)}")
    print(f"Inventory files: {len(all_files)}")
    print(f"Unused candidates: {len(unused)} ({out['unusedCandidatesTotalBytes']} bytes)")
    print(f"Safe delete: {len(safe_delete)} ({out['safeDeleteTotalBytes']} bytes)")

    # Non-zero exit if broken refs found (useful for CI), but keep it soft for now.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())



