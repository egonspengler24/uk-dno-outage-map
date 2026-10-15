// CKAN portals publishing the feed as a CSV resource: NGED.

import { fetchWithRetry } from "../http.js";
import { parseCsv } from "../csv.js";

function headers(apiKey) {
  return apiKey ? { Authorization: apiKey } : {};
}

async function findResource(source, apiKey) {
  const url = `${source.baseUrl}/api/3/action/package_show?id=${encodeURIComponent(source.dataset)}`;
  const res = await fetchWithRetry(url, { headers: headers(apiKey) });
  const pkg = (await res.json()).result;
  const resource = pkg?.resources?.find((r) => r.name === source.resourceName);
  if (!resource) throw new Error(`Resource "${source.resourceName}" not found in ${source.dataset}`);
  return resource;
}

export async function fetchMetadata(source, apiKey) {
  const resource = await findResource(source, apiKey);
  const modified = resource.last_modified ?? resource.metadata_modified ?? null;
  // CKAN timestamps are UTC without an offset.
  return { portalUpdated: modified && !/[Z+]/.test(modified) ? `${modified}Z` : modified };
}

export async function fetchRecords(source, apiKey) {
  const resource = await findResource(source, apiKey);
  const res = await fetchWithRetry(resource.url, { headers: headers(apiKey) });
  return parseCsv(await res.text());
}
