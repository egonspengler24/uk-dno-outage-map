// Converts one raw DNO record into a GeoJSON Feature with a common set of
// properties, using the DNO's `fields` mapping from config/dnos.js.

import { parseTimestamp } from "./time.js";

function isEmpty(value) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

// Reads a mapped field; `spec` is a column name, a list of fallback column
// names, a function deriving the value from the raw record, or null (not
// provided by this DNO).
function pick(raw, spec) {
  if (!spec) return null;
  if (typeof spec === "function") return spec(raw);
  for (const name of Array.isArray(spec) ? spec : [spec]) {
    if (!isEmpty(raw[name])) return raw[name];
  }
  return null;
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  if (isEmpty(value)) return null;
  const text = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(text)) return true;
  if (["false", "no", "n", "0"].includes(text)) return false;
  return null;
}

function toNumber(value) {
  if (isEmpty(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Postcodes arrive as arrays, comma-separated text, or (UKPN) a JSON-ish
// list encoded as text with stray brackets, quotes and backslashes.
function toPostcodes(value) {
  if (isEmpty(value)) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .flatMap((p) => String(p).replace(/[[\]"'\\]/g, "").split(/[,;]/))
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function toText(value) {
  return isEmpty(value) ? null : String(value).trim();
}

// Accepts a GeoJSON Feature, a bare geometry, or an Opendatasoft geo point
// ({lat, lon}).
function toGeometry(value) {
  if (!value || typeof value !== "object") return null;
  if (value.type === "Feature") return toGeometry(value.geometry);
  if (value.type && Array.isArray(value.coordinates)) return value;
  const lat = toNumber(value.lat);
  const lon = toNumber(value.lon ?? value.lng);
  if (lat !== null && lon !== null) return { type: "Point", coordinates: [lon, lat] };
  return null;
}

function validLatLon(lat, lon) {
  // Generous UK bounding box; rejects 0,0 and swapped coordinates.
  return lat !== null && lon !== null && lat > 49 && lat < 61.5 && lon > -11 && lon < 3;
}

export function normaliseRecord(raw, dno) {
  const f = dno.fields;
  const ts = (spec) => parseTimestamp(pick(raw, spec), { ignoreOffset: dno.ignoreTimezoneOffset });

  let geometry = toGeometry(pick(raw, f.geometry));
  if (!geometry) {
    const lat = toNumber(pick(raw, f.lat));
    const lon = toNumber(pick(raw, f.lon));
    if (validLatLon(lat, lon)) geometry = { type: "Point", coordinates: [lon, lat] };
  }

  const faultId = toText(pick(raw, f.fault_id));

  return {
    type: "Feature",
    id: `${dno.id}:${faultId}`,
    geometry,
    properties: {
      dno: dno.id,
      fault_id: faultId,
      status: toText(pick(raw, f.status)),
      planned: toBool(pick(raw, f.planned)),
      voltage: toText(pick(raw, f.voltage)),
      customers_off: toNumber(pick(raw, f.customers_off)),
      postcodes: toPostcodes(pick(raw, f.postcodes)),
      licence_area: toText(pick(raw, f.licence_area)),
      start: ts(f.start),
      etr: ts(f.etr),
      restored: ts(f.restored),
      as_at: ts(f.as_at),
    },
  };
}

// For feeds that publish one row per affected postcode (NPg): merges
// features sharing a fault_id into one, combining postcodes and turning the
// individual locations into a MultiPoint.
export function mergeByFaultId(features) {
  const merged = new Map();
  for (const f of features) {
    const existing = merged.get(f.id);
    if (!existing) {
      merged.set(f.id, { ...f, properties: { ...f.properties }, points: f.geometry?.type === "Point" ? [f.geometry.coordinates] : [] });
      continue;
    }
    const p = existing.properties;
    p.postcodes = [...new Set([...p.postcodes, ...f.properties.postcodes])];
    if (f.properties.as_at && (!p.as_at || f.properties.as_at > p.as_at)) p.as_at = f.properties.as_at;
    if (f.geometry?.type === "Point") existing.points.push(f.geometry.coordinates);
  }

  return [...merged.values()].map(({ points, ...f }) => {
    const unique = [...new Map(points.map((c) => [c.join(","), c])).values()];
    if (unique.length > 1) f.geometry = { type: "MultiPoint", coordinates: unique };
    return f;
  });
}

export function isActive(feature) {
  const status = (feature.properties.status || "").toLowerCase();
  return !feature.properties.restored && !/complete|restored|closed/.test(status);
}
