// One entry per UK Distribution Network Operator (DNO).
//
// To bring a DNO online:
//   1. Create an account on its open data portal and generate an API key.
//   2. Add the key as a GitHub Actions secret named by `secretEnv`
//      (repo → Settings → Secrets and variables → Actions).
//   3. If `source` is null, fill in the endpoint details and `fields` mapping.
//   4. Make sure the secret is passed through in .github/workflows/update-outages.yml.
//
// `fields` maps our normalised outage properties to the DNO's own column
// names. A value can be a single column name or a list of fallbacks (the
// first non-empty one wins). Although NEO is an agreed format, each DNO's
// column names differ slightly, so check them against the portal's schema.
//
// `boundaryNames` are the `longname` values in data/dno_boundaries.geojson
// that belong to this DNO, used to colour licence areas on the map.

export const DNOS = [
  {
    id: "enw",
    name: "Electricity North West",
    shortName: "ENW",
    boundaryNames: ["ENWL"],
    portalUrl: "https://electricitynorthwest.opendatasoft.com/explore/dataset/sp-enw-live-neop/",
    licence: "SP ENW Shared Licence",
    secretEnv: "ENWL_API_KEY",
    keyRequired: true,
    source: {
      type: "opendatasoft",
      baseUrl: "https://electricitynorthwest.opendatasoft.com",
      dataset: "sp-enw-live-neop",
    },
    // ENW's timestamps are UK local wall-clock time but labelled +00:00
    // (as_at_date runs an hour ahead of the portal's UTC processing time
    // during BST), so we discard the offset and read them as Europe/London.
    ignoreTimezoneOffset: true,
    fields: {
      fault_id: "fault_id",
      status: "status",
      planned: "planned",
      voltage: "voltagelevel",
      customers_off: "confirmedoff",
      postcodes: "postcode",
      licence_area: "licence_area",
      start: "outage_start_date",
      etr: "etr",
      restored: "date_time_of_restoration",
      as_at: "as_at_date",
      geometry: "geo_shape",
      lat: "location_latitude",
      lon: "location_longitude",
    },
  },
  {
    id: "ukpn",
    name: "UK Power Networks",
    shortName: "UKPN",
    boundaryNames: ["UKPN (London)", "UKPN (East)", "UKPN (South)"],
    portalUrl: "https://ukpowernetworks.opendatasoft.com/explore/dataset/ukpn-national-energy-outage/",
    licence: "CC BY 4.0",
    secretEnv: "UKPN_API_KEY",
    keyRequired: true,
    source: {
      type: "opendatasoft",
      baseUrl: "https://ukpowernetworks.opendatasoft.com",
      dataset: "ukpn-national-energy-outage",
    },
    fields: {
      fault_id: "fault_id",
      status: "status",
      planned: "planned",
      voltage: "voltage",
      customers_off: "confirmed_off",
      postcodes: "postcode",
      licence_area: "licence_area",
      start: "outage_start_date",
      etr: "etr",
      restored: "date_of_restoration",
      as_at: "as_at_date",
      geometry: "geopoint",
      lat: "location_latitude",
      lon: "location_longitude",
    },
  },
  {
    id: "spen",
    name: "SP Energy Networks",
    shortName: "SPEN",
    boundaryNames: ["SPEN (SP Distribution)", "SPEN (SP MANWEB)"],
    portalUrl: "https://spenergynetworks.opendatasoft.com/explore/dataset/national-energy-outage-data/",
    licence: "CC BY 4.0",
    secretEnv: "SPEN_API_KEY",
    keyRequired: true,
    source: {
      type: "opendatasoft",
      baseUrl: "https://spenergynetworks.opendatasoft.com",
      dataset: "national-energy-outage-data",
    },
    // Like ENW, SPEN's timestamps are UK local time labelled +00:00
    // (upload_date runs an hour ahead of real UTC during BST).
    ignoreTimezoneOffset: true,
    // SPEN has no confirmed-off count column.
    fields: {
      fault_id: "fault_id",
      status: "status",
      planned: "planned",
      voltage: "voltage",
      customers_off: null,
      postcodes: "post_code",
      licence_area: "licence_area",
      start: ["date_of_reported_fault", "planned_outage_start_date"],
      etr: "etr",
      restored: "date_of_restoration",
      as_at: "upload_date",
      geometry: "geo_shape",
      lat: "location_latitude",
      lon: "location_longitude",
    },
  },
  {
    id: "npg",
    name: "Northern Powergrid",
    shortName: "NPg",
    boundaryNames: ["NPG (Northern Electric)", "NPG (Yorkshire Electric)"],
    portalUrl: "https://northernpowergrid.opendatasoft.com/explore/dataset/live-power-cuts-data/",
    licence: "Northern Powergrid Open Data Licence v1.0",
    secretEnv: "NPG_API_KEY",
    // Records are currently public; the key is sent if the secret is set.
    keyRequired: false,
    source: {
      type: "opendatasoft",
      baseUrl: "https://northernpowergrid.opendatasoft.com",
      dataset: "live-power-cuts-data",
    },
    // NPg's own power-cut format rather than NEO: one row per affected
    // postcode, so rows are merged by reference. Timestamps are UK local
    // time labelled +00:00.
    groupByFaultId: true,
    ignoreTimezoneOffset: true,
    fields: {
      fault_id: "reference",
      // incidentstatus codes, inferred from the customer messages that
      // accompany them: 4 = work scheduled, 5 = in progress, 6 = power
      // restored / work completed.
      status: (r) => ({ 4: "Awaiting", 5: "In Progress", 6: "Restored" })[r.incidentstatus] ?? null,
      planned: (r) => r.natureofoutage === "Planned Work on System",
      voltage: (r) => r.type?.split("_")[0] ?? null,
      customers_off: "totalconfirmedpowercut",
      postcodes: "postcode",
      licence_area: "area",
      start: "loggedtime",
      etr: "estimatedtimetillresolution",
      restored: null,
      as_at: "updatedate",
      geometry: "geopoint",
      lat: "lat",
      lon: "lng",
    },
  },
  {
    id: "nged",
    name: "National Grid Electricity Distribution",
    shortName: "NGED",
    boundaryNames: ["WPD (Midlands)", "WPD (East Midlands)", "WPD (South Wales)", "WPD (South West)"],
    portalUrl: "https://connecteddata.nationalgrid.co.uk/dataset/live-power-cuts",
    licence: "NGED Open Data Licence",
    secretEnv: "NGED_API_KEY",
    // The NEO-format CSV is currently downloadable without a key. If NGED
    // start requiring one, set this to true and add the NGED_API_KEY secret.
    keyRequired: false,
    source: {
      type: "ckan",
      baseUrl: "https://connecteddata.nationalgrid.co.uk",
      dataset: "live-power-cuts",
      resourceName: "Live Detailed Power Cuts",
    },
    fields: {
      fault_id: "fault_id",
      status: "status",
      planned: "planned",
      voltage: "voltage",
      customers_off: "confirmed_off",
      postcodes: "postcode",
      licence_area: "licence_area",
      start: ["date_of_reported_fault", "planned_outage_start_date"],
      etr: "etr",
      restored: "date_of_restoration",
      as_at: "upload_date",
      geometry: null,
      lat: "location_latitude",
      lon: "location_longitude",
    },
  },
  {
    id: "ssen",
    name: "Scottish and Southern Electricity Networks",
    shortName: "SSEN",
    boundaryNames: ["SSE", "SSE (Southern)"],
    portalUrl: "https://data.ssen.co.uk/@ssen-distribution/realtime_outage_dataset",
    licence: "CC BY 4.0",
    secretEnv: "SSEN_API_KEY",
    // The Power Track API is public; the key is sent if the secret is set.
    // (SSEN's CKAN catalogue blocks non-browser clients, but the API that
    // the catalogue points to does not.)
    keyRequired: false,
    source: {
      type: "json",
      url: "https://external.distribution.prd.ssen.co.uk/opendataportal-prd/v4/api/getallfaults",
      recordsPath: "faults",
      timestampPath: "timestampUtc",
    },
    // SSEN's own Power Track format rather than NEO. `type` is PSI (planned
    // supply interruption), HV or LV. Restored outages drop out of the feed.
    fields: {
      fault_id: "reference",
      // jobStatus codes are undocumented, so status follows the published
      // stages: engineer on site, or planned work past its start, is in
      // progress; anything else is awaiting.
      status: (r) =>
        r.engineerOnSiteTimeUtc || (r.type === "PSI" && Date.parse(r.loggedAtUtc) <= Date.now())
          ? "In Progress"
          : "Awaiting",
      planned: (r) => r.type === "PSI",
      voltage: (r) => (r.type === "HV" || r.type === "LV" ? r.type : null),
      customers_off: "customerCount",
      postcodes: "affectedAreas",
      // SHEPD covers the north of Scotland, SEPD central southern England.
      licence_area: (r) =>
        r.location?.latitude == null ? null : r.location.latitude > 55 ? "North of Scotland" : "Southern England",
      start: "loggedAtUtc",
      etr: "estimatedRestorationTimeUtc",
      restored: null,
      as_at: "_feed_timestamp",
      geometry: (r) =>
        r.location ? { type: "Point", coordinates: [r.location.longitude, r.location.latitude] } : null,
      lat: null,
      lon: null,
    },
  },
];
