// Builds the UK-wide mobile mast layer from OpenCelliD bulk CSV exports
// (234.csv[.gz] and 235.csv[.gz] - the UK mobile country codes), downloaded
// from opencellid.org with your own account.
//
// Cells are grouped into approximate mast sites (cells within the same
// ~100 m grid square), then written as small tiles of 0.5° x 0.5° so the
// map only loads the squares in view:
//   data/masts/index.json         - tile list, counts, attribution
//   data/masts/<lat>_<lon>.json   - sites in that tile
//
// Masts don't move, so this is run locally when you want to refresh the
// data, and the output is committed.
//
//   npm run build-masts -- ~/Downloads/234.csv.gz ~/Downloads/235.csv.gz
//
// OpenCelliD positions are crowd-sourced averages of where each cell was
// measured, not surveyed mast locations, so sites are approximate.
// Data licence: CC BY-SA 4.0 (attribution shown in the map).
//
// CSV columns (no header row):
//   radio,mcc,net,area,cell,unit,lon,lat,range,samples,changeable,created,updated,averageSignal

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "data", "masts");

export const TILE_DEG = 0.5;
// ~100 m grid used to group cells into sites (longitude cells are wider in
// degrees because meridians converge; 0.0015° is ~100 m at UK latitudes).
const SITE_LAT_DEG = 0.0009;
const SITE_LON_DEG = 0.0015;

// UK, Northern Ireland, Isle of Man and the Channel Islands.
const BBOX = { latMin: 49.0, latMax: 61.0, lonMin: -8.8, lonMax: 2.0 };

const RADIO_LABELS = { GSM: "2G", UMTS: "3G", LTE: "4G", NR: "5G" };
const RADIO_ORDER = ["2G", "3G", "4G", "5G"];

// Common UK network codes. Anything else is shown as its MCC-MNC code.
const NETWORKS = {
  "234-2": "O2",
  "234-10": "O2",
  "234-11": "O2",
  "234-15": "Vodafone",
  "234-20": "Three",
  "234-30": "EE",
  "234-31": "EE",
  "234-32": "EE",
  "234-33": "EE",
  "234-34": "EE",
  "234-50": "JT",
  "234-55": "Sure",
  "234-58": "Manx Telecom",
};

function readLines(filePath) {
  const raw = readFileSync(filePath);
  const text = filePath.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  return text.split("\n");
}

function main(inputPaths) {
  const sites = new Map();
  let cellsKept = 0;

  for (const inputPath of inputPaths) {
    let rows = 0;
    let kept = 0;
    for (const line of readLines(inputPath)) {
      if (!line.trim()) continue;
      rows++;
      const [radio, mcc, net, , , , lonStr, latStr, , samples, , , updated] = line.split(",");
      const lon = Number(lonStr);
      const lat = Number(latStr);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      if (lat < BBOX.latMin || lat > BBOX.latMax || lon < BBOX.lonMin || lon > BBOX.lonMax) continue;

      const key = `${Math.round(lat / SITE_LAT_DEG)}:${Math.round(lon / SITE_LON_DEG)}`;
      let site = sites.get(key);
      if (!site) {
        site = { latSum: 0, lonSum: 0, cells: 0, radios: new Set(), networks: new Set(), samples: 0, updated: 0 };
        sites.set(key, site);
      }
      site.latSum += lat;
      site.lonSum += lon;
      site.cells++;
      site.radios.add(RADIO_LABELS[radio] ?? radio);
      site.networks.add(NETWORKS[`${mcc}-${Number(net)}`] ?? `${mcc}-${Number(net)}`);
      site.samples += Number(samples) || 0;
      site.updated = Math.max(site.updated, Number(updated) || 0);
      kept++;
    }
    cellsKept += kept;
    console.log(`${inputPath}: ${rows} cells read, ${kept} within the UK`);
  }

  // Tile the sites. Each site is [lon, lat, cells, technologies, networks,
  // lastSeenYear] to keep tiles small.
  const tiles = new Map();
  for (const s of sites.values()) {
    const lat = s.latSum / s.cells;
    const lon = s.lonSum / s.cells;
    const tileKey = `${Math.floor(lat / TILE_DEG)}_${Math.floor(lon / TILE_DEG)}`;
    if (!tiles.has(tileKey)) tiles.set(tileKey, []);
    tiles.get(tileKey).push([
      Number(lon.toFixed(5)),
      Number(lat.toFixed(5)),
      s.cells,
      RADIO_ORDER.filter((r) => s.radios.has(r)).join(" "),
      [...s.networks].sort().join(", "),
      s.updated ? new Date(s.updated * 1000).getUTCFullYear() : null,
    ]);
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const index = {
    attribution: "Cell data © OpenCelliD (opencellid.org), CC BY-SA 4.0",
    generated_at: new Date().toISOString(),
    tile_deg: TILE_DEG,
    site_count: sites.size,
    cell_count: cellsKept,
    fields: ["lon", "lat", "cells", "technologies", "networks", "last_seen_year"],
    tiles: {},
  };

  for (const [key, list] of [...tiles].sort()) {
    writeFileSync(path.join(OUT_DIR, `${key}.json`), JSON.stringify(list));
    index.tiles[key] = list.length;
  }
  writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(index, null, 1));

  console.log(`Grouped ${cellsKept} cells into ${sites.size} sites across ${tiles.size} tiles in data/masts/`);
}

const inputPaths = process.argv.slice(2);
if (inputPaths.length === 0) {
  console.error("Usage: npm run build-masts -- /path/to/234.csv[.gz] [/path/to/235.csv[.gz]]");
  process.exit(1);
}
main(inputPaths);
