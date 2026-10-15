// One-off: downloads the DNO licence area boundaries published by Northern
// Powergrid and writes a lighter copy to data/dno_boundaries.geojson
// (coordinates rounded to ~10 m, duplicate points removed). The output is
// committed; rerun only if the boundaries change.
//
//   npm run build-boundaries

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE =
  "https://northernpowergrid.opendatasoft.com/api/explore/v2.1/catalog/datasets/all_dno_boundaries/exports/geojson";
const PRECISION = 4;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "data", "dno_boundaries.geojson");

const round = (n) => Number(n.toFixed(PRECISION));

function simplifyRing(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const pt = [round(x), round(y)];
    const prev = out.at(-1);
    if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) out.push(pt);
  }
  return out;
}

function simplifyGeometry(geometry) {
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: geometry.coordinates.map(simplifyRing) };
  }
  if (geometry.type === "MultiPolygon") {
    return { type: "MultiPolygon", coordinates: geometry.coordinates.map((p) => p.map(simplifyRing)) };
  }
  return geometry;
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const src = await res.json();

const out = {
  type: "FeatureCollection",
  attribution: "DNO licence area boundaries © Northern Powergrid, Northern Powergrid Open Data Licence v1.0",
  features: src.features.map((f) => ({
    type: "Feature",
    properties: { longname: f.properties.longname },
    geometry: simplifyGeometry(f.geometry),
  })),
};

await writeFile(OUT, JSON.stringify(out));
console.log(`Wrote ${out.features.length} boundaries to ${path.relative(process.cwd(), OUT)}`);
