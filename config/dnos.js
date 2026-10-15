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
    portalUrl: "https://northernpowergrid.opendatasoft.com/",
    licence: "Northern Powergrid Open Data Licence v1.0",
    secretEnv: "NPG_API_KEY",
    keyRequired: true,
    // TODO: no NEO dataset is visible publicly on the NPg portal. Once you
    // have an account, look for it after logging in and fill this in, e.g.
    // { type: "opendatasoft", baseUrl: "https://northernpowergrid.opendatasoft.com", dataset: "<id>" }
    source: null,
    fields: null,
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
    portalUrl: "https://www.ssen.co.uk/",
    licence: null,
    secretEnv: "SSEN_API_KEY",
    keyRequired: true,
    // TODO: SSEN's NEO endpoint hasn't been identified yet. Once known, add
    // a `source` (and a new adapter in scripts/lib/adapters/ if it isn't
    // Opendatasoft or CKAN) plus the `fields` mapping.
    source: null,
    fields: null,
  },
];
