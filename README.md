# app-store-connect-cli

`asc` is a Node.js/TypeScript ESM CLI for downloading App Store Connect report data for automated workflows.

## Setup

```sh
pnpm install
cp .env.example .env
```

Fill `.env` with your own App Store Connect API values. Do not commit real credentials or `.p8` private keys.

Required for authenticated Apple API calls:

- `ASC_ISSUER_ID`
- `ASC_KEY_ID`
- `ASC_PRIVATE_KEY_PATH`
- `ASC_VENDOR_NUMBER` for Sales and Trends report downloads (`reports fetch` only; not needed for `analytics` commands)

Optional:

- `ASC_API_BASE_URL` for test or proxy endpoints
- `ASC_REPORTS_DIR` defaults to `./reports`
- `ASC_APP_ID` default app ID for `analytics` commands when `--app` is omitted

## Development

```sh
pnpm dev -- --help
pnpm dev -- auth token --help
pnpm build
pnpm test
```

## Usage

All command results are emitted as JSON on stdout. Diagnostics, validation messages, and error context go to stderr.

```sh
pnpm dev -- apps list --json
pnpm dev -- auth token --json
pnpm dev -- api get /v1/apps --query limit=200 --json
pnpm dev -- api post /v1/analyticsReportRequests --body @request.json --json
pnpm dev -- api download /v1/salesReports --query 'filter[frequency]=DAILY' --out report.tsv.gz --json
pnpm dev -- reports list --json
pnpm dev -- reports fetch --from 2026-01-01 --to 2026-01-31 --json
pnpm dev -- analytics request ensure --app 1234567890 --json
pnpm dev -- analytics reports --app 1234567890 --json
pnpm dev -- analytics fetch --app 1234567890 --report "App Store Discovery and Engagement Standard" --from 2026-01-01 --to 2026-01-31 --json
```

`api` commands are thin authenticated wrappers around App Store Connect API endpoints. Use them when you need an endpoint that does not have a dedicated high-level command yet.

`reports fetch` downloads daily Sales and Trends summary reports and stores the raw report files in `reports/`.

`analytics fetch` downloads App Analytics report files (Analytics Reports API) — App Store impressions, product page views, downloads, and more — into `reports/` as decompressed `.tsv` files. Run `analytics request ensure` once per app first; Apple then generates report instances continuously (the first data can take up to 48 hours). See [docs/commands.md](./docs/commands.md) for details.

## Daily automation

`scripts/fetch-daily.sh` fetches recent Sales and Trends summaries plus App
Analytics report files (daily, weekly, and monthly granularities) in one run.
It is idempotent and uses overlapping date windows, so missed days self-heal on
the next run. Requires `pnpm build` and a filled `.env` including `ASC_APP_ID`.

```sh
./scripts/fetch-daily.sh           # run once manually
./scripts/install-launchd.sh      # macOS: schedule it daily at 22:30 via launchd
./scripts/install-launchd.sh 06:00 # ...or at another time
./scripts/install-launchd.sh --uninstall
```

On Linux, register the script with cron instead:

```cron
30 22 * * * /path/to/app-store-connect-cli/scripts/fetch-daily.sh >> "$HOME/asc-fetch.log" 2>&1
```

Logs append to `~/Library/Logs/asc-fetch.log` (launchd). Customize report names,
granularities, and window sizes via the variables documented in the script header.

## Automation Rules

- Treat stdout as the only machine-readable result stream.
- Read stderr for warnings, validation failures, and actionable error details.
- Always pass `--json` in automated workflows.
- Never prompt for missing values; set environment variables before running commands.
- Never write or commit real App Store Connect credentials, private keys, or downloaded report files.
- Prefer `reports list` before `reports fetch` so automated workflows can validate supported report contracts.

## Project Layout

```text
src/
  cli.ts
  commands/
  appstore/
  schemas/
  utils/
tests/
reports/
```
