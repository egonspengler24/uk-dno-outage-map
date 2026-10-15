// Opendatasoft (Explore API v2.1) portals: ENW, UKPN, SPEN, NPg.
// Dataset metadata is public; records need `Authorization: Apikey <key>`.

import { fetchWithRetry } from "../http.js";

function headers(apiKey) {
  return apiKey ? { Authorization: `Apikey ${apiKey}` } : {};
}

function datasetUrl(source) {
  return `${source.baseUrl}/api/explore/v2.1/catalog/datasets/${encodeURIComponent(source.dataset)}`;
}

export async function fetchMetadata(source, apiKey) {
  const res = await fetchWithRetry(datasetUrl(source), { headers: headers(apiKey) });
  const meta = (await res.json()).metas?.default ?? {};
  return { portalUpdated: meta.data_processed ?? meta.modified ?? null };
}

export async function fetchRecords(source, apiKey) {
  // The export endpoint returns every record in one go (the /records
  // endpoint is capped at 100 per page and 10,000 overall).
  const res = await fetchWithRetry(`${datasetUrl(source)}/exports/json?timezone=UTC`, {
    headers: headers(apiKey),
  });
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error("Unexpected export response (not an array)");
  return body;
}
