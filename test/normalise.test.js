import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { DNOS } from "../config/dnos.js";
import { normaliseRecord, mergeByFaultId, isActive } from "../scripts/lib/normalise.js";
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

test("UKPN text-encoded postcode lists are cleaned up", () => {
  const raw = { fault_id: "INCD-1", postcode: '["CT18 8", \\"CT4 6\\"]', location_latitude: 51.1, location_longitude: 1.1 };
  assert.deepEqual(normaliseRecord(raw, dno("ukpn")).properties.postcodes, ["CT18 8", "CT4 6"]);
});

test("SPEN timestamps labelled +00:00 are read as UK local time", () => {
  const raw = { fault_id: "INCD-2", upload_date: "2026-10-15T12:00:34+00:00", location_latitude: 55.9, location_longitude: -3.2 };
  assert.equal(normaliseRecord(raw, dno("spen")).properties.as_at, "2026-10-15T11:00:34.000Z");
});

test("NPg per-postcode rows merge into one outage per reference", async () => {
  const raw = JSON.parse(await fixture("npg-sample.json"));
  const features = mergeByFaultId(raw.map((r) => normaliseRecord(r, dno("npg"))));
  assert.equal(features.length, 2);

  const [planned, restored] = features;
  assert.equal(planned.id, "npg:PPCR80199");
  assert.deepEqual(planned.properties.postcodes, ["DL8 3PN", "DL8 3PJ"]);
  assert.equal(planned.geometry.type, "MultiPoint");
  assert.equal(planned.geometry.coordinates.length, 2);
  assert.equal(planned.properties.status, "In Progress");
  assert.equal(planned.properties.planned, true);
  assert.equal(planned.properties.voltage, "LV");
  assert.equal(planned.properties.customers_off, 73);
  // Local time labelled +00:00: 12:05:14 BST is 11:05:14 UTC.
  assert.equal(planned.properties.as_at, "2026-10-15T11:05:14.000Z");
  assert.equal(isActive(planned), true);

  assert.equal(restored.properties.status, "Restored");
  assert.equal(isActive(restored), false);
});

test("SSEN Power Track faults normalise with derived status", async () => {
  const body = JSON.parse(await fixture("ssen-sample.json"));
  const records = body.faults.map((r) => ({ ...r, _feed_timestamp: body.timestampUtc }));
  const [psi, onSite, waiting] = records.map((r) => normaliseRecord(r, dno("ssen")));

  assert.equal(psi.id, "ssen:254583");
  assert.equal(psi.properties.planned, true);
  assert.equal(psi.properties.voltage, null);
  assert.equal(psi.properties.status, "In Progress"); // planned start is in the past
  assert.equal(psi.properties.licence_area, "Southern England");
  assert.equal(psi.geometry.type, "Point");

  assert.equal(onSite.properties.status, "In Progress");
  assert.equal(onSite.properties.voltage, "LV");
  assert.equal(onSite.properties.customers_off, 5);

  assert.equal(waiting.properties.status, "Awaiting");
  assert.equal(waiting.properties.licence_area, "North of Scotland");
  assert.equal(waiting.properties.as_at, "2026-10-15T11:55:59.000Z");
});
