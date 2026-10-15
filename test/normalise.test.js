import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { DNOS } from "../config/dnos.js";
import { normaliseRecord, isActive } from "../scripts/lib/normalise.js";
import { parseTimestamp } from "../scripts/lib/time.js";
import { parseCsv } from "../scripts/lib/csv.js";

const dno = (id) => DNOS.find((d) => d.id === id);
const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("parseTimestamp handles offsets, UK local time and placeholders", () => {
  assert.equal(parseTimestamp("2026-10-15T10:00:00+00:00"), "2026-10-15T10:00:00.000Z");
  // Naive values are UK local time: BST in October, GMT in January.
  assert.equal(parseTimestamp("2026-10-15T11:22:00"), "2026-10-15T10:22:00.000Z");
  assert.equal(parseTimestamp("2026-01-15T11:22:00"), "2026-01-15T11:22:00.000Z");
  assert.equal(parseTimestamp("2026-10-15T11:15:12+00:00", { ignoreOffset: true }), "2026-10-15T10:15:12.000Z");
  assert.equal(parseTimestamp("0001-01-01T00:00:00+00:00"), null);
  assert.equal(parseTimestamp(""), null);
  assert.equal(parseTimestamp(null), null);
});

test("ENW NEO records normalise to GeoJSON features", async () => {
  const raw = JSON.parse(await fixture("enw-sample.json"));
  const [point, polygon, completed, line] = raw.map((r) => normaliseRecord(r, dno("enw")));

  assert.equal(point.id, "enw:INC 143009641");
  assert.deepEqual(point.geometry, { type: "Point", coordinates: [-2.8599925983, 54.2520412293] });
  assert.equal(point.properties.voltage, "LV");
  assert.equal(point.properties.customers_off, 2);
  assert.deepEqual(point.properties.postcodes, ["LA11 6"]);
  assert.equal(point.properties.restored, null);
  // ENW's as_at is UK local time mislabelled as +00:00.
  assert.equal(point.properties.as_at, "2026-10-15T10:15:12.000Z");

  assert.equal(polygon.geometry.type, "Polygon");
  assert.equal(polygon.properties.planned, true);
  assert.equal(line.geometry.type, "LineString");
  assert.equal(line.properties.etr, null);

  assert.equal(isActive(point), true);
  assert.equal(isActive(completed), false);
});

test("NGED CSV records normalise to point features", async () => {
  const raw = parseCsv(await fixture("nged-sample.csv"));
  assert.equal(raw.length, 2);
  const [planned, fault] = raw.map((r) => normaliseRecord(r, dno("nged")));

  assert.deepEqual(planned.geometry, { type: "Point", coordinates: [-3.86788, 50.71778] });
  assert.equal(planned.properties.planned, true);
  assert.deepEqual(planned.properties.postcodes, ["TQ13 8EJ", "TQ13 8EH", "TQ13 8EL"]);
  assert.equal(planned.properties.as_at, "2026-10-15T10:22:00.000Z");
  assert.equal(fault.properties.customers_off, 266);
  assert.equal(fault.properties.etr, "2026-10-15T11:30:00.000Z");
});

test("every configured DNO has a secret name and boundary", () => {
  for (const d of DNOS) {
    assert.match(d.secretEnv, /^[A-Z]+_API_KEY$/, d.id);
    assert.ok(d.boundaryNames.length > 0, d.id);
    if (d.source) assert.ok(d.fields, `${d.id} has a source but no field mapping`);
  }
});
