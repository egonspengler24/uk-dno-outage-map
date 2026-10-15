// Fetches National Energy Outage (NEO) data from every configured DNO and
// writes:
//   data/outages.json - GeoJSON FeatureCollection of normalised outages
//   data/status.json  - per-DNO fetch status and freshness timestamps
//
// API keys come from the environment (GitHub Actions secrets), named by each
// DNO's `secretEnv` in config/dnos.js. Never hardcode keys here.
//
// If a DNO fetch fails, its last good data is carried over from the previous
// run: from PREVIOUS_DATA_URL (the live site's /data folder, set by the
// workflow) or, when running locally, from the existing files in data/.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DNOS } from "../config/dnos.js";
import { normaliseRecord, mergeByFaultId, isActive } from "./lib/normalise.js";
import { parseTimestamp } from "./lib/time.js";
import * as opendatasoft from "./lib/adapters/opendatasoft.js";
import * as ckan from "./lib/adapters/ckan.js";

const ADAPTERS = { opendatasoft, ckan };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

// GitHub Actions annotations show up on the workflow run summary.
const inActions = process.env.GITHUB_ACTIONS === "true";
function warn(message) {
  console.log(inActions ? `::warning::${message}` : `WARNING: ${message}`);
}

async function loadPrevious(name) {
  try {
    const base = process.env.PREVIOUS_DATA_URL;
    if (base) {
      const res = await fetch(`${base.replace(/\/$/, "")}/${name}`, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return null;
      return await res.json();
    }
    return JSON.parse(await readFile(path.join(DATA_DIR, name), "utf8"));
  } catch {
    return null;
  }
}

function latest(timestamps) {
  return timestamps.filter(Boolean).sort().at(-1) ?? null;
}

async function fetchDno(dno, now, previousStatus, previousFeatures) {
  const apiKey = process.env[dno.secretEnv] || null;
  const status = {
    id: dno.id,
    name: dno.name,
    shortName: dno.shortName,
    boundaryNames: dno.boundaryNames,
    portalUrl: dno.portalUrl,
    licence: dno.licence,
    keyRequired: dno.keyRequired,
    keyConfigured: Boolean(apiKey),
    state: null,
    message: null,
    lastAttempt: now,
    lastSuccess: previousStatus?.lastSuccess ?? null,
    portalUpdated: null,
    dataAsAt: previousStatus?.dataAsAt ?? null,
    recordCount: 0,
    activeCount: 0,
    unlocatedCount: 0,
  };

  if (!dno.source || !dno.fields) {
    status.state = "not_configured";
    status.message = "NEO endpoint not yet identified";
    return { status, features: [] };
  }

  const adapter = ADAPTERS[dno.source.type];
  if (!adapter) throw new Error(`Unknown source type "${dno.source.type}" for ${dno.id}`);

  // Portal metadata is usually public, so freshness can be shown even
  // before a key has been added.
  try {
    status.portalUpdated = parseTimestamp((await adapter.fetchMetadata(dno.source, apiKey)).portalUpdated);
  } catch (err) {
    warn(`${dno.shortName}: could not read portal metadata - ${err.message}`);
  }

  if (dno.keyRequired && !apiKey) {
    status.state = "awaiting_credentials";
    status.message = `Add the ${dno.secretEnv} secret to enable this feed`;
    return { status, features: [] };
  }

  try {
    const records = await adapter.fetchRecords(dno.source, apiKey);
    let features = records.map((r) => normaliseRecord(r, dno));
    if (dno.groupByFaultId) features = mergeByFaultId(features);
    const located = features.filter((f) => f.geometry);

    status.state = "ok";
    status.lastSuccess = now;
    status.recordCount = features.length;
    status.activeCount = features.filter(isActive).length;
    status.unlocatedCount = features.length - located.length;
    status.dataAsAt = latest(features.map((f) => f.properties.as_at)) ?? status.portalUpdated ?? now;

    if (Date.parse(status.dataAsAt) - Date.parse(now) > 5 * 60_000) {
      warn(`${dno.shortName}: data timestamp ${status.dataAsAt} is in the future - check timezone handling`);
    }
    console.log(`${dno.shortName}: ${features.length} records (${status.activeCount} active, ${status.unlocatedCount} without location)`);
    return { status, features: located };
  } catch (err) {
    const carried = previousFeatures.filter((f) => f.properties?.dno === dno.id);
    status.state = "error";
    status.message = err.message;
    status.recordCount = carried.length;
    status.activeCount = carried.filter(isActive).length;
    warn(`${dno.shortName}: ${err.message}${carried.length ? ` (showing ${carried.length} records from last success)` : ""}`);
    return { status, features: carried };
  }
}

async function main() {
  const now = new Date().toISOString();
  const [previousStatus, previousOutages] = await Promise.all([
    loadPrevious("status.json"),
    loadPrevious("outages.json"),
  ]);
  const prevById = Object.fromEntries((previousStatus?.dnos ?? []).map((d) => [d.id, d]));
  const prevFeatures = previousOutages?.features ?? [];

  const results = await Promise.all(DNOS.map((dno) => fetchDno(dno, now, prevById[dno.id], prevFeatures)));

  const features = results.flatMap((r) => r.features);
  const outages = { type: "FeatureCollection", generated_at: now, feature_count: features.length, features };
  const status = { generated_at: now, dnos: results.map((r) => r.status) };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, "outages.json"), JSON.stringify(outages));
  await writeFile(path.join(DATA_DIR, "status.json"), JSON.stringify(status, null, 2));

  const summary = status.dnos.map((d) => `${d.shortName}=${d.state}`).join(", ");
  console.log(`Wrote ${features.length} outages. ${summary}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
