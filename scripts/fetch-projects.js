#!/usr/bin/env node
/**
 * Snapshot all Vercel projects into public/projects.json.
 * Runs as a prebuild step so the deployed site ships with the latest list.
 * Each row from `vercel projects ls` becomes { name, url, updated }.
 * Falls back gracefully if the CLI isn't logged in (e.g. CI without token).
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "public", "projects.json");
const SHOTS_DIR = path.join(__dirname, "..", "public", "projects-shots");

// Override the Vercel-reported URL for projects that have a custom domain we'd
// rather feature on imjoey.me. Keyed by Vercel project name (slug).
const URL_OVERRIDES = {
  "100-things": "https://www.ahundredthings.com",
};

function parseTable(text) {
  // strip CLI banner / warnings — keep only lines that look like a row
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  // header row contains "Project Name" and "Latest Production URL"
  const headerIdx = lines.findIndex(
    (l) => /Project Name/.test(l) && /Latest Production URL/.test(l)
  );
  if (headerIdx === -1) return [];
  const header = lines[headerIdx];
  // figure out column starts using header position
  const nameStart = header.indexOf("Project Name");
  const urlStart = header.indexOf("Latest Production URL");
  const updatedStart = header.indexOf("Updated");
  const nodeStart = header.indexOf("Node Version");

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.trim()) continue;
    // each col is fixed-width, but be tolerant: use slice + trim
    const name = ln.slice(nameStart, urlStart).trim();
    const url = ln.slice(urlStart, updatedStart > 0 ? updatedStart : ln.length).trim();
    const updated = updatedStart > 0
      ? ln.slice(updatedStart, nodeStart > 0 ? nodeStart : ln.length).trim()
      : "";
    if (!name || !url) continue;
    rows.push({ name, url, updated });
  }
  return rows;
}

function main() {
  let raw = "";
  try {
    // vercel writes table output to stderr — merge it into stdout so we can parse
    raw = execSync("vercel projects ls 2>&1", { encoding: "utf8" });
  } catch (err) {
    // not logged in or no projects — write empty list so the build still succeeds
    console.warn("[fetch-projects] vercel CLI failed:", err.message);
    fs.writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), projects: [] }, null, 2));
    return;
  }

  const projects = parseTable(raw).map((p) => {
    const shotFile = path.join(SHOTS_DIR, `${p.name}.png`);
    const shotRel = `/projects-shots/${p.name}.png`;
    const url = URL_OVERRIDES[p.name] || p.url;
    return { ...p, url, shot: fs.existsSync(shotFile) ? shotRel : null };
  });

  const payload = { fetchedAt: new Date().toISOString(), projects };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));

  const missing = projects.filter((p) => !p.shot).map((p) => p.name);
  console.log(`[fetch-projects] wrote ${projects.length} projects to ${OUT}`);
  if (missing.length) {
    console.log(`[fetch-projects] missing screenshots: ${missing.join(", ")}`);
    console.log(`[fetch-projects] drop PNGs at public/projects-shots/{slug}.png to enable previews`);
  }
}

main();
