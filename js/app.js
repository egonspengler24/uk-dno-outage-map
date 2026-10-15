const REFRESH_MS = 5 * 60 * 1000; // re-read the static JSON every 5 minutes
const OUTAGES_URL = "data/outages.json";
const STATUS_URL = "data/status.json";
const BOUNDARIES_URL = "data/dno_boundaries.geojson";
const MASTS_URL = "data/masts.geojson";

// Feed freshness thresholds (NEO feeds are agreed to refresh every 15 min).
const FRESH_MIN = 30;
const LAGGING_MIN = 60;

const FRESHNESS_COLORS = {
  fresh: "#37b24d",
  lagging: "#f59f00",
  stale: "#e03131",
  nodata: "#6c757d",
};

const STATUS_COLORS = {
  "in progress": "#d7263d",
  awaiting: "#f4a300",
  restored: "#2e7d32",
  completed: "#2e7d32",
};

let statusData = null;
let outagesData = null;
let boundariesData = null;
let mastsLoaded = false;

function statusColor(status) {
  return STATUS_COLORS[(status || "").toLowerCase()] || "#6c757d";
}

function isRestored(p) {
  return Boolean(p.restored) || /complete|restored|closed/i.test(p.status || "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" });
}

function formatTime(iso) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })
    : formatDate(iso);
}

function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ${mins % 60} min ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function ageMinutes(iso) {
  return iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Infinity;
}

// How fresh is the data we are showing for this DNO?
function freshness(dno) {
  if (dno.state === "not_configured" || dno.state === "awaiting_credentials") return "nodata";
  if (!dno.dataAsAt) return dno.state === "error" ? "stale" : "nodata";
  const age = ageMinutes(dno.dataAsAt);
  if (dno.state === "error" || age > LAGGING_MIN) return "stale";
  return age > FRESH_MIN ? "lagging" : "fresh";
}

// ---- Map ------------------------------------------------------------------

const map = L.map("map", { preferCanvas: true }).setView([54.6, -3.2], 6);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

function dnoForArea(longname) {
  return statusData?.dnos.find((d) => d.boundaryNames.includes(longname)) ?? null;
}

const boundariesLayer = L.geoJSON(null, {
  style: (feature) => {
    const dno = dnoForArea(feature.properties.longname);
    const level = dno ? freshness(dno) : "nodata";
    const color = FRESHNESS_COLORS[level];
    return {
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: level === "nodata" ? 0.06 : 0.12,
      dashArray: level === "nodata" ? "5 5" : null,
    };
  },
  onEachFeature: (feature, layer) => {
    layer.bindTooltip(() => {
      const dno = dnoForArea(feature.properties.longname);
      const area = escapeHtml(feature.properties.longname);
      return dno ? `<strong>${escapeHtml(dno.name)}</strong><br/>${area}<br/>${escapeHtml(dnoDetail(dno).text)}` : area;
    }, { sticky: true });
  },
}).addTo(map);

const outagesLayer = L.geoJSON(null, {
  filter: (feature) => {
    const p = feature.properties || {};
    if (!document.getElementById("toggle-planned").checked && p.planned) return false;
    if (!document.getElementById("toggle-restored").checked && isRestored(p)) return false;
    return true;
  },
  style: (feature) => {
    const color = statusColor(feature.properties?.status);
    return {
      color,
      weight: feature.geometry.type.includes("LineString") ? 4 : 2,
      fillColor: color,
      fillOpacity: 0.35,
      dashArray: feature.properties?.planned ? "6 4" : null,
    };
  },
  pointToLayer: (feature, latlng) => {
    const color = statusColor(feature.properties?.status);
    return L.circleMarker(latlng, {
      radius: 6,
      weight: 2,
      color,
      fillColor: color,
      fillOpacity: 0.7,
      dashArray: feature.properties?.planned ? "3 3" : null,
    });
  },
  onEachFeature: bindOutagePopup,
}).addTo(map);

const mastsLayer = L.geoJSON(null, {
  pointToLayer: (feature, latlng) =>
    L.circleMarker(latlng, { radius: 3, weight: 1, color: "#3388ff", fillColor: "#3388ff", fillOpacity: 0.5 }),
  onEachFeature: (feature, layer) => {
    const p = feature.properties || {};
    const html =
      `<strong>Cell/mast</strong><br/>` +
      `Radio: ${escapeHtml(p.radio ?? "?")}<br/>` +
      `Cell ID: ${escapeHtml(p.cellid ?? "?")}<br/>` +
      `Network: MCC ${escapeHtml(p.mcc ?? "?")} / MNC ${escapeHtml(p.net ?? "?")}<br/>` +
      `Range: ${Number.isFinite(p.range_m) ? `${p.range_m} m` : "?"}`;
    layer.bindTooltip(html, { sticky: true, direction: "top", opacity: 0.9 });
    layer.bindPopup(html);
  },
});

function bindOutagePopup(feature, layer) {
  const p = feature.properties || {};
  const dno = statusData?.dnos.find((d) => d.id === p.dno);
  const rows = [
    ["DNO", dno?.name ?? p.dno],
    ["Status", p.status],
    ["Planned", p.planned === null || p.planned === undefined ? null : p.planned ? "Yes" : "No"],
    ["Voltage", p.voltage],
    ["Customers off", p.customers_off],
    ["Postcodes", p.postcodes?.length ? p.postcodes.join(", ") : null],
    ["Licence area", p.licence_area],
    ["Started", formatDate(p.start)],
    ["Est. restoration", formatDate(p.etr)],
    ["Restored", formatDate(p.restored)],
    ["Data as at", formatDate(p.as_at)],
  ];

  const rowsHtml = rows
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `<tr><td class="label">${label}</td><td>${escapeHtml(value)}</td></tr>`)
    .join("");

  layer.bindPopup(
    `<div class="outage-popup"><h3>${escapeHtml(p.fault_id ?? "Outage")}</h3><table>${rowsHtml}</table></div>`
  );
}

// ---- Panel ----------------------------------------------------------------

function dnoDetail(dno) {
  switch (dno.state) {
    case "not_configured":
      return { text: "Feed not yet set up" };
    case "awaiting_credentials":
      return {
        text: `Awaiting API key${dno.portalUpdated ? ` · portal updated ${formatTime(dno.portalUpdated)} (${ago(dno.portalUpdated)})` : ""}`,
      };
    case "error":
      return {
        text: `Fetch failed: ${dno.message}${dno.dataAsAt ? ` · showing data from ${formatTime(dno.dataAsAt)} (${ago(dno.dataAsAt)})` : ""}`,
        error: true,
      };
    default:
      return { text: `Data as at ${formatTime(dno.dataAsAt)} (${ago(dno.dataAsAt)})` };
  }
}

function renderPanel() {
  if (!statusData) return;
  const list = document.getElementById("dno-list");
  list.replaceChildren(
    ...statusData.dnos.map((dno) => {
      const li = document.createElement("li");
      li.title = "Zoom to licence area";
      const detail = dnoDetail(dno);
      const count = dno.state === "ok" || dno.recordCount ? ` <span class="count">· ${dno.activeCount} active</span>` : "";
      li.innerHTML =
        `<span class="dot" style="background:${FRESHNESS_COLORS[freshness(dno)]}"></span>` +
        `<span class="name">${escapeHtml(dno.shortName)}${count}</span>` +
        `<span class="detail${detail.error ? " error" : ""}">${escapeHtml(detail.text)}</span>`;
      li.addEventListener("click", () => zoomToDno(dno));
      return li;
    })
  );

  document.getElementById("dno-attribution").innerHTML = statusData.dnos
    .filter((d) => d.state === "ok" || d.recordCount)
    .map((d) => `Outage data &copy; <a href="${escapeHtml(d.portalUrl)}" target="_blank" rel="noopener">${escapeHtml(d.name)}</a>${d.licence ? ` (${escapeHtml(d.licence)})` : ""}.<br/>`)
    .join("");

  const live = statusData.dnos.filter((d) => d.state === "ok").length;
  const active = statusData.dnos.reduce((n, d) => n + (d.activeCount || 0), 0);
  document.getElementById("last-updated").textContent =
    `${active} active outages · ${live} of ${statusData.dnos.length} feeds live · checked ${formatTime(statusData.generated_at)}`;
}

function zoomToDno(dno) {
  const layers = boundariesLayer.getLayers().filter((l) => dno.boundaryNames.includes(l.feature.properties.longname));
  if (layers.length) map.fitBounds(L.featureGroup(layers).getBounds(), { padding: [20, 20] });
}

function redraw() {
  boundariesLayer.setStyle(boundariesLayer.options.style);
  outagesLayer.clearLayers();
  if (outagesData) outagesLayer.addData(outagesData);
  renderPanel();
}

// ---- Data loading ---------------------------------------------------------

async function getJson(url) {
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function loadData() {
  try {
    [statusData, outagesData] = await Promise.all([getJson(STATUS_URL), getJson(OUTAGES_URL)]);
    redraw();
  } catch (err) {
    console.error("Failed to load outage data:", err);
    document.getElementById("last-updated").textContent = "Could not load outage data - showing last known state.";
  }
}

async function loadBoundaries() {
  try {
    boundariesData = await (await fetch(BOUNDARIES_URL)).json();
    boundariesLayer.addData(boundariesData);
    boundariesLayer.bringToBack();
  } catch (err) {
    console.error("Failed to load licence area boundaries:", err);
  }
}

async function loadMasts() {
  if (mastsLoaded) return;
  mastsLoaded = true;
  try {
    const res = await fetch(MASTS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mastsLayer.addData(await res.json());
  } catch (err) {
    mastsLoaded = false;
    console.error("Failed to load mast data:", err);
  }
}

document.getElementById("toggle-masts").addEventListener("change", (e) => {
  if (e.target.checked) {
    loadMasts();
    map.addLayer(mastsLayer);
  } else {
    map.removeLayer(mastsLayer);
  }
});
document.getElementById("toggle-planned").addEventListener("change", redraw);
document.getElementById("toggle-restored").addEventListener("change", redraw);

loadBoundaries().then(loadData);
setInterval(loadData, REFRESH_MS);
// Keep the "x min ago" text and freshness colours current between reloads.
setInterval(() => {
  boundariesLayer.setStyle(boundariesLayer.options.style);
  renderPanel();
}, 60 * 1000);
