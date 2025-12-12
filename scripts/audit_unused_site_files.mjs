#!/usr/bin/env node
/**
 * Audit unused files in a static site repo (conservative).
 *
 * Entrypoints:
 * - index.html (repo root)
 * - all site/(recursive)/*.html
 *
 * Parses local references from:
 * - HTML attributes: href, src, poster, data-src, data-href
 * - CSS url(...) references from linked stylesheets (local only)
 *
 * Inventories:
 * - site/, html/, files/, docs/
 * - any root directories starting with "_freeze"
 * - root: index.html, robots.txt, sitemap.xml, CNAME
 *
 * Writes:
 * - reports/unused-site-files.json
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REFERENCE_ATTR_RE =
  /\b(?:href|src|poster|data-src|data-href)\s*=\s*["']([^"']+)["']/gi;
const CSS_URL_RE = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

function isExternalUrl(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return true;
  if (v.startsWith("#")) return true;
  const lowered = v.toLowerCase();
  return (
    lowered.startsWith("http://") ||
    lowered.startsWith("https://") ||
    lowered.startsWith("mailto:") ||
    lowered.startsWith("tel:") ||
    lowered.startsWith("javascript:") ||
    lowered.startsWith("data:")
  );
}

function normalizeRef(raw) {
  const v = String(raw ?? "").trim();
  if (!v || isExternalUrl(v)) return null;

  // Strip query/hash via URL (supports relative URLs with a dummy base).
  let pathname = v;
  try {
    const u = new URL(v, "https://example.invalid/");
    pathname = u.pathname ?? v;
  } catch {
    // fall back to basic split
    pathname = v.split("#")[0].split("?")[0];
  }

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // ignore bad encodings
  }

  while (pathname.startsWith("./")) pathname = pathname.slice(2);
  if (pathname.startsWith("/")) pathname = pathname.slice(1);
  if (!pathname) return null;
  if (pathname.endsWith("/")) return null;

  return pathname;
}

function toRepoRel(repoRoot, absPath) {
  const rel = path.relative(repoRoot, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

function resolveAgainst(repoRoot, baseFileAbs, refPath) {
  const baseDir = path.dirname(baseFileAbs);
  let abs;
  if (
    refPath.startsWith("site/") ||
    refPath.startsWith("files/") ||
    refPath.startsWith("html/") ||
    refPath.startsWith("docs/")
  ) {
    abs = path.resolve(repoRoot, refPath);
  } else {
    abs = path.resolve(baseDir, refPath);
  }
  return abs;
}

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readText(p) {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return "";
  }
}

function extractHtmlRefs(htmlText) {
  const refs = [];
  for (const m of htmlText.matchAll(REFERENCE_ATTR_RE)) refs.push(m[1]);
  return refs;
}

function extractCssRefs(cssText) {
  const refs = [];
  for (const m of cssText.matchAll(CSS_URL_RE)) refs.push(m[2]);
  return refs;
}

async function* walkFiles(rootAbs) {
  const stack = [rootAbs];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const abs = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(abs);
      else if (ent.isFile()) yield abs;
    }
  }
}

async function listInventory(repoRoot) {
  const roots = ["site", "html", "files", "docs"];
  const out = [];

  // Root singletons
  const singles = ["index.html", "robots.txt", "sitemap.xml", "CNAME"];
  for (const s of singles) {
    const abs = path.join(repoRoot, s);
    if (await exists(abs)) {
      const st = await fs.stat(abs);
      out.push({ path: s, size: st.size });
    }
  }

  // Root dirs
  for (const r of roots) {
    const absRoot = path.join(repoRoot, r);
    if (!(await exists(absRoot))) continue;
    for await (const abs of walkFiles(absRoot)) {
      const rel = toRepoRel(repoRoot, abs);
      if (!rel) continue;
      const st = await fs.stat(abs);
      out.push({ path: rel, size: st.size });
    }
  }

  // Any root directories starting with "_freeze"
  try {
    const rootEntries = await fs.readdir(repoRoot, { withFileTypes: true });
    for (const ent of rootEntries) {
      if (!ent.isDirectory()) continue;
      if (!ent.name.startsWith("_freeze")) continue;
      const absRoot = path.join(repoRoot, ent.name);
      for await (const abs of walkFiles(absRoot)) {
        const rel = toRepoRel(repoRoot, abs);
        if (!rel) continue;
        const st = await fs.stat(abs);
        out.push({ path: rel, size: st.size });
      }
    }
  } catch {
    // ignore
  }

  // De-dupe (same file might be included twice if overlap)
  const seen = new Set();
  const deduped = [];
  for (const fi of out) {
    if (seen.has(fi.path)) continue;
    seen.add(fi.path);
    deduped.push(fi);
  }
  return deduped;
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name, def) => {
    const idx = args.indexOf(name);
    if (idx === -1) return def;
    return args[idx + 1] ?? def;
  };

  const repoRoot = path.resolve(getArg("--root", "."));
  const reportRel = getArg("--report", "reports/unused-site-files.json");
  const reportAbs = path.resolve(repoRoot, reportRel);

  const entrypoints = [];
  const rootIndex = path.join(repoRoot, "index.html");
  if (await exists(rootIndex)) entrypoints.push(rootIndex);
  const siteDir = path.join(repoRoot, "site");
  if (await exists(siteDir)) {
    for await (const abs of walkFiles(siteDir)) {
      if (abs.toLowerCase().endsWith(".html")) entrypoints.push(abs);
    }
  }

  const referencedFiles = new Set();
  const referencedMissing = new Set();
  const cssToParse = new Set();

  for (const htmlAbs of entrypoints) {
    const htmlText = await readText(htmlAbs);
    for (const raw of extractHtmlRefs(htmlText)) {
      const norm = normalizeRef(raw);
      if (!norm) continue;
      const resolvedAbs = resolveAgainst(repoRoot, htmlAbs, norm);
      const rel = toRepoRel(repoRoot, resolvedAbs);
      if (!rel) continue;
      if (await exists(resolvedAbs)) referencedFiles.add(rel);
      else referencedMissing.add(rel);
      if (rel.toLowerCase().endsWith(".css") && (await exists(resolvedAbs))) {
        cssToParse.add(resolvedAbs);
      }
    }
  }

  for (const cssAbs of Array.from(cssToParse).sort()) {
    const cssText = await readText(cssAbs);
    for (const raw of extractCssRefs(cssText)) {
      const norm = normalizeRef(raw);
      if (!norm) continue;
      const resolvedAbs = resolveAgainst(repoRoot, cssAbs, norm);
      const rel = toRepoRel(repoRoot, resolvedAbs);
      if (!rel) continue;
      if (await exists(resolvedAbs)) referencedFiles.add(rel);
      else referencedMissing.add(rel);
    }
  }

  const inventory = await listInventory(repoRoot);
  const referencedSet = referencedFiles;

  const allowlistExact = new Set([
    "site/search.json",
    "site/listings.json",
    "site/sitemap.xml",
    "site/robots.txt",
  ]);

  const unusedCandidates = [];
  for (const fi of inventory) {
    if (allowlistExact.has(fi.path)) continue;
    if (referencedSet.has(fi.path)) continue;
    if (fi.path === "index.html") continue;
    if (fi.path.startsWith("site/") && fi.path.toLowerCase().endsWith(".html")) continue;
    unusedCandidates.push(fi);
  }

  const safeDelete = [];
  for (const fi of unusedCandidates) {
    const p = fi.path;
    if (p.startsWith("docs/")) safeDelete.push(fi);
    else if (p.startsWith("_freeze")) safeDelete.push(fi);
    else if (p.startsWith("site/") && p.toLowerCase().endsWith(".ipynb")) safeDelete.push(fi);
    else if (p.startsWith("site/") && p.toLowerCase().endsWith(".map")) safeDelete.push(fi);
  }

  await fs.mkdir(path.dirname(reportAbs), { recursive: true });
  const sum = (arr) => arr.reduce((a, b) => a + (b.size ?? 0), 0);

  const report = {
    entrypointsCount: entrypoints.length,
    referencedFilesCount: referencedFiles.size,
    referencedMissingCount: referencedMissing.size,
    referencedMissing: Array.from(referencedMissing).sort(),
    inventoryFilesCount: inventory.length,
    unusedCandidatesCount: unusedCandidates.length,
    unusedCandidatesTotalBytes: sum(unusedCandidates),
    unusedCandidates: unusedCandidates.map((x) => ({ path: x.path, size: x.size })).sort((a, b) => a.path.localeCompare(b.path)),
    safeDeleteCount: safeDelete.length,
    safeDeleteTotalBytes: sum(safeDelete),
    safeDelete: safeDelete.map((x) => ({ path: x.path, size: x.size })).sort((a, b) => a.path.localeCompare(b.path)),
    notes: [
      "This audit is conservative. Anything ambiguous is treated as referenced.",
      "Review safeDelete list; only those are intended for automatic deletion in safe mode.",
    ],
  };

  await fs.writeFile(reportAbs, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`Wrote report: ${reportAbs}`);
  console.log(`Entrypoints: ${entrypoints.length}`);
  console.log(`Inventory files: ${inventory.length}`);
  console.log(`Unused candidates: ${unusedCandidates.length} (${report.unusedCandidatesTotalBytes} bytes)`);
  console.log(`Safe delete: ${safeDelete.length} (${report.safeDeleteTotalBytes} bytes)`);
}

await main();


