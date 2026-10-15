// Plain JSON APIs that return { <timestamp>, <records>: [...] }: SSEN's
// Power Track API. The feed-level timestamp is copied onto each record as
// `_feed_timestamp` so it can be mapped to as_at.

import { fetchWithRetry } from "../http.js";

function headers(apiKey) {
  return apiKey ? { Authorization: apiKey } : {};
}

const at = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);

async function fetchFeed(source, apiKey) {
  const res = await fetchWithRetry(source.url, { headers: headers(apiKey) });
  return res.json();
}

export async function fetchMetadata(source, apiKey) {
  return { portalUpdated: at(await fetchFeed(source, apiKey), source.timestampPath) ?? null };
}

export async function fetchRecords(source, apiKey) {
  const body = await fetchFeed(source, apiKey);
  const records = at(body, source.recordsPath);
  if (!Array.isArray(records)) throw new Error(`Unexpected response: no "${source.recordsPath}" array`);
  const feedTimestamp = at(body, source.timestampPath) ?? null;
  return records.map((r) => ({ ...r, _feed_timestamp: feedTimestamp }));
}
