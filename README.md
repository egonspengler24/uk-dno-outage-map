# UK Power Cuts - DNO NEO Feed Map

A static, GitHub-Pages-hosted Leaflet map that pulls together the **National
Energy Outage (NEO)** feeds published by each UK Distribution Network
Operator (DNO) and shows:

- every current outage (points, lines and polygons as supplied by the DNO),
- each DNO's licence area coloured by **how fresh its feed is**,
- a panel listing every DNO with when its data was last refreshed, or why
  it isn't live yet,
- an optional mobile mast overlay (OpenCelliD).

A scheduled GitHub Actions job fetches every feed every 15 minutes,
normalises the records to one shape, and deploys the site plus
`data/outages.json` and `data/status.json` to GitHub Pages. The page never
calls a DNO API directly and never sees an API key.

## DNO feed status

| DNO | Portal | Dataset | Key needed | Secret | Status |
|---|---|---|---|---|---|
| Electricity North West | Opendatasoft | `sp-enw-live-neop` | Yes | `ENWL_API_KEY` | Live |
| UK Power Networks | Opendatasoft | `ukpn-national-energy-outage` | Yes | `UKPN_API_KEY` | Live |
| SP Energy Networks | Opendatasoft | `national-energy-outage-data` | Yes | `SPEN_API_KEY` | Live |
| National Grid Electricity Distribution | CKAN (CSV) | `live-power-cuts` → "Live Detailed Power Cuts" | No | `NGED_API_KEY` (optional) | Live |
| Northern Powergrid | Opendatasoft | `live-power-cuts-data` (NPg format, not NEO) | No | `NPG_API_KEY` (optional) | Live |
| SSEN | Power Track JSON API | `getallfaults` (SSEN format, not NEO) | No | `SSEN_API_KEY` (optional) | Live |

All DNO settings live in [`config/dnos.js`](config/dnos.js).

## Setup

### 1. Switch GitHub Pages to deploy from Actions (one-off)

Repo → Settings → Pages → "Build and deployment" → Source: **GitHub
Actions**. (The workflow now deploys the site itself instead of committing
data to `main`.)

### 2. Add DNO API keys as repository secrets

Never put keys in any committed file. For each DNO you have an account with:

```bash
gh secret set ENWL_API_KEY
```

(`gh` prompts for the value so it doesn't end up in your shell history.) Or
use the web UI: Settings → Secrets and variables → Actions → New repository
secret.

On Opendatasoft portals, create the key under your account → API keys.

### 3. Run it

Actions → "Update outages" → Run workflow. It also runs on every push to
`main`, and every 15 minutes via the Cloudflare Worker (below). Fetch
problems appear as warnings on the run summary and in the map panel.

### 4. 15-minute refresh (Cloudflare Worker)

GitHub's own `schedule` trigger is best-effort and didn't fire for this
repo, so a Cloudflare Worker ([`worker/`](worker/)) starts the workflow at
:02, :17, :32 and :47 past each hour. The workflow keeps an hourly
GitHub schedule as a backup.

1. Create a GitHub fine-grained personal access token
   (Settings → Developer settings → Fine-grained tokens): repository access
   **only `uk-dno-outage-map`**, permission **Actions: Read and write**.
2. Deploy the Worker and store the token as a Worker secret:

   ```bash
   cd worker
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put GITHUB_TOKEN
   ```

3. Check: runs triggered by `workflow_dispatch` appear in the Actions tab
   at those times. `npx wrangler tail` shows the Worker's logs live.

When the token expires, create a new one and rerun `wrangler secret put`.

## Adding a DNO that's still a placeholder

1. Find its NEO dataset on the portal (log in first; it may not be public).
2. In `config/dnos.js`, fill in `source` and the `fields` mapping (match
   each of our properties to the DNO's column names).
3. If the portal isn't Opendatasoft, CKAN or a plain JSON API, add an adapter in
   `scripts/lib/adapters/` exporting `fetchMetadata` and `fetchRecords`, and
   register it in `scripts/fetch-outages.js`.
4. Add the secret, and if you invent a new secret name, pass it through in
   `.github/workflows/update-outages.yml`.
5. Ideally add a sample record to `test/fixtures/` and a test case.

## Running locally

```bash
ENWL_API_KEY=your_key npm run fetch-outages
```

```bash
npx serve .
```

Then open the printed URL (opening `index.html` via `file://` blocks the
`fetch()` calls). `npm test` runs the normalisation tests.

## How freshness is shown

For each DNO the status file records:

- **dataAsAt** - the newest `as_at`/upload timestamp in the DNO's records,
- **portalUpdated** - when the portal says the dataset was last processed
  (public metadata, so it's shown even before a key is added),
- **lastSuccess / lastAttempt** - our own fetch times.

Licence areas are green if the data is under 30 minutes old, amber up to 60
minutes, red beyond that or on a fetch error, and grey when there's no feed
yet. If a fetch fails, the DNO's last good records are carried over from
the live site.

## Data quirks handled

- Field names differ between DNOs despite the common NEO format, hence the
  per-DNO `fields` mapping.
- ENW and SPEN label UK local time as `+00:00`; `ignoreTimezoneOffset: true` fixes
  this. Naive timestamps (e.g. NGED's CSV) are read as UK local time.
- Placeholder dates such as `0001-01-01` become `null`.

## Mobile mast layer (optional)

1. Sign up for a free key at https://opencellid.org/.
2. `OPENCELLID_API_KEY=your_key npm run fetch-masts`
3. Commit the resulting `data/masts.geojson` (static data, not a secret).

The layer loads only when "Mobile masts" is ticked. OpenCelliD entries are
crowd-sourced and approximate; data is CC-BY-SA 4.0.

## Licensing

UKPN and SPEN publish under CC BY 4.0; NGED and Northern Powergrid under
their own open data licences. **Check ENW's "SP ENW Shared Licence" terms**
before making raw ENW records public. Attribution for every live feed is
shown in the map panel. Licence area boundaries come from Northern
Powergrid's `all_dno_boundaries` dataset (`npm run build-boundaries`).
