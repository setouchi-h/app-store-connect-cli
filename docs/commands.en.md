# asc Command Reference

[日本語](./commands.md) | English

## CLI Overview

`asc` is an App Store Connect analytics CLI. It uses the App Store Connect API to call API endpoints directly, list apps, generate API authentication JWTs, download Sales and Trends reports, and download App Analytics reports (Analytics Reports API).

- **Command name**: `asc` (registered as `bin` in `package.json`; during development, run `pnpm dev -- <args>` to execute `tsx src/cli.ts`)
- **Version**: `0.1.0`

### Global Options

| Option | Description |
| --- | --- |
| `--json` | Flag for JSON output. Successful results are always emitted as JSON anyway, so its practical effect is to **switch error output (stderr) to JSON format as well**. It can be specified on the root command or on any subcommand. |
| `-V, --version` | Print the version (`0.1.0`) and exit. |
| `-h, --help` | Print help and exit. |

## Command List

| Command | Description |
| --- | --- |
| [`asc api get/post/patch/delete`](#asc-api-getpostpatchdelete) | Call App Store Connect JSON API endpoints directly |
| [`asc api download`](#asc-api-download) | Save a raw App Store Connect API response to a file |
| [`asc apps list`](#asc-apps-list) | List apps from App Store Connect |
| [`asc auth token`](#asc-auth-token) | Generate a JWT for the App Store Connect API |
| [`asc reports list`](#asc-reports-list) | List supported report definitions |
| [`asc reports fetch`](#asc-reports-fetch) | Download raw Sales and Trends reports |
| [`asc analytics request ensure`](#asc-analytics-request-ensure) | Create an App Analytics report request (idempotent) |
| [`asc analytics request list`](#asc-analytics-request-list) | List analytics report requests |
| [`asc analytics reports`](#asc-analytics-reports) | List available App Analytics reports |
| [`asc analytics fetch`](#asc-analytics-fetch) | Download App Analytics report files |

---

## asc api get/post/patch/delete

### Description

Calls any App Store Connect JSON API endpoint with authentication. Use this for endpoints that do not have a dedicated high-level command yet, or when you want the raw Apple JSON:API response.

`<path>` can be an API path such as `/v1/apps` or an absolute URL on the configured API origin, such as `https://api.appstoreconnect.apple.com/...`. JSON responses are emitted directly on stdout. `204 No Content` and non-JSON responses are emitted as JSON objects containing fields such as `status`.

### Options

| Option | Required | Description |
| --- | --- | --- |
| `<path>` | **Required** | API path or absolute URL on the configured API origin |
| `-q, --query <key=value>` | - | Query parameter. Repeat for multiple values |
| `-H, --header <name=value>` | - | Extra request header. Accepts `Name=value` or `Name: value`. Repeat for multiple values |
| `--accept <media-type>` | - | `Accept` header. Defaults to `application/json` |
| `--body <json-or-@file>` | - | JSON request body. Use `@body.json` to read from a file |
| `--json` | - | Format error output as JSON (JSON responses are always JSON) |

### Examples

```sh
asc api get /v1/apps --query limit=200

asc api post /v1/analyticsReportRequests \
  --body @request.json

asc api patch /v1/apps/1234567890 \
  --body '{"data":{"type":"apps","id":"1234567890","attributes":{"name":"My App"}}}'
```

---

## asc api download

### Description

Saves a raw App Store Connect API response to a file. Use this to directly fetch gzip/TSV responses such as Sales and Trends reports without going through a dedicated high-level command.

### Options

| Option | Required | Description |
| --- | --- | --- |
| `<path>` | **Required** | API path or absolute URL on the configured API origin |
| `-o, --out <path>` | **Required** | Destination file path |
| `-q, --query <key=value>` | - | Query parameter. Repeat for multiple values |
| `-H, --header <name=value>` | - | Extra request header. Repeat for multiple values |
| `--accept <media-type>` | - | `Accept` header |
| `--json` | - | Format error output as JSON (results are always JSON) |

### Example

```sh
asc api download /v1/salesReports \
  --query 'filter[frequency]=DAILY' \
  --query 'filter[reportDate]=2026-06-01' \
  --query 'filter[reportSubType]=SUMMARY' \
  --query 'filter[reportType]=SALES' \
  --query 'filter[vendorNumber]=12345678' \
  --out reports/sales-summary-2026-06-01.tsv.gz
```

### Output Example (JSON)

```json
{
  "status": 200,
  "path": "/path/to/reports/sales-summary-2026-06-01.tsv.gz",
  "bytes": 1024,
  "contentType": "application/a-gzip"
}
```

---

## asc apps list

### Description

Calls the App Store Connect API (`GET /v1/apps`, `limit=200`) and retrieves the list of apps. Requires the authentication environment variables (`ASC_ISSUER_ID` / `ASC_KEY_ID` / `ASC_PRIVATE_KEY_PATH` or `ASC_PRIVATE_KEY`).

### Options

| Option | Required | Description |
| --- | --- | --- |
| `--json` | - | Format error output as JSON (results are always JSON) |

### Example

```sh
asc apps list
```

### Output Example (JSON)

```json
{
  "apps": [
    {
      "id": "1234567890",
      "name": "My App",
      "bundleId": "com.example.myapp",
      "sku": "MYAPP001",
      "primaryLocale": "ja"
    }
  ]
}
```

`name` / `bundleId` / `sku` / `primaryLocale` are omitted when they are not present in the `attributes` of the API response.

---

## asc auth token

### Description

Generates a JWT for the App Store Connect API (ES256 signature, audience `appstoreconnect-v1`) from the credentials in the environment variables (Issuer ID, Key ID, private key). The token is valid for up to 20 minutes.

### Options

| Option | Required | Description |
| --- | --- | --- |
| `--json` | - | Format error output as JSON (results are always JSON) |

### Example

```sh
asc auth token
```

### Output Example (JSON)

```json
{
  "issuerId": "00000000-0000-0000-0000-000000000000",
  "keyId": "ABC123DEFG",
  "token": "eyJhbGciOiJFUzI1NiIsImtpZCI6IkFCQzEyM0RFRkciLCJ0eXAiOiJKV1QifQ...",
  "tokenType": "Bearer",
  "issuedAt": "2026-06-10T00:00:00.000Z",
  "expiresAt": "2026-06-10T00:20:00.000Z"
}
```

---

## asc reports list

### Description

Lists the report definitions supported by this CLI. It only prints static definitions, so no environment variables or API access are required. Currently the only supported report is the daily Sales and Trends summary report (`sales-summary-daily`).

### Options

| Option | Required | Description |
| --- | --- | --- |
| `--json` | - | Format error output as JSON (results are always JSON) |

### Example

```sh
asc reports list
```

### Output Example (JSON)

```json
{
  "reports": [
    {
      "id": "sales-summary-daily",
      "apiPath": "/v1/salesReports",
      "reportType": "SALES",
      "reportSubType": "SUMMARY",
      "frequency": "DAILY",
      "description": "Daily Sales and Trends summary report.",
      "requiresVendorNumber": true
    }
  ]
}
```

---

## asc reports fetch

### Description

Downloads the daily Sales and Trends summary reports (raw) for the specified date range from the App Store Connect API (`GET /v1/salesReports`), one day at a time, and saves them under `ASC_REPORTS_DIR` (default `./reports`). File names are `sales-summary-<YYYY-MM-DD>.tsv.gz` (when the response is gzip) or `.tsv`. The destination directory is created automatically if it does not exist.

In addition to the authentication environment variables, `ASC_VENDOR_NUMBER` is required.

### Options

| Option | Required | Description |
| --- | --- | --- |
| `--from <YYYY-MM-DD>` | **Required** | Start date in `YYYY-MM-DD` format |
| `--to <YYYY-MM-DD>` | **Required** | End date in `YYYY-MM-DD` format. Must be on or after `--from` |
| `--json` | - | Format error output as JSON (results are always JSON) |

An invalid date format or `--from` > `--to` results in a validation error (`VALIDATION_FAILED`, exit code 2).

### Example

```sh
asc reports fetch --from 2026-06-01 --to 2026-06-03
```

### Output Example (JSON)

```json
{
  "report": "sales-summary-daily",
  "from": "2026-06-01",
  "to": "2026-06-03",
  "days": 3,
  "files": [
    { "date": "2026-06-01", "path": "reports/sales-summary-2026-06-01.tsv.gz", "bytes": 1024 },
    { "date": "2026-06-02", "path": "reports/sales-summary-2026-06-02.tsv.gz", "bytes": 980 },
    { "date": "2026-06-03", "path": "reports/sales-summary-2026-06-03.tsv.gz", "bytes": 1101 }
  ]
}
```

---

## asc analytics request ensure

### Description

Creates an App Analytics (Analytics Reports API) report generation request (`POST /v1/analyticsReportRequests`). If an **active** request with the same `accessType` already exists, it returns the existing one instead of creating a duplicate — the command is **idempotent** and safe to run repeatedly. A request stopped with `stoppedDueToInactivity` is not treated as existing; a new request is created instead (per Apple's spec, a stopped request never resumes — a new one is required).

Registering `ONGOING` (the default) makes Apple generate daily, weekly, and monthly reports continuously (the first data can take up to 48 hours). Use `--access-type ONE_TIME_SNAPSHOT` to generate all available historical data once.

### Options

| Option | Required | Description |
| --- | --- | --- |
| `--app <appId>` | - (required unless `ASC_APP_ID` is set) | App Store Connect app ID. Look it up with `asc apps list` |
| `--access-type <type>` | - | `ONGOING` (default) or `ONE_TIME_SNAPSHOT` |
| `--json` | - | Switch error output to JSON (results are always JSON) |

### Example

```sh
asc analytics request ensure --app 1234567890
```

### Output Example (JSON)

```json
{
  "request": {
    "id": "f8f99a6a-0000-0000-0000-000000000000",
    "accessType": "ONGOING",
    "stoppedDueToInactivity": false
  },
  "created": true
}
```

---

## asc analytics request list

### Description

Lists the report generation requests associated with an app (`GET /v1/apps/{id}/analyticsReportRequests`).

When `stoppedDueToInactivity` is `true`, Apple has stopped generating reports because they were not downloaded for an extended period. Re-run `asc analytics request ensure` to recover.

### Options

| Option | Required | Description |
| --- | --- | --- |
| `--app <appId>` | - (required unless `ASC_APP_ID` is set) | App Store Connect app ID |
| `--json` | - | Switch error output to JSON (results are always JSON) |

### Example

```sh
asc analytics request list --app 1234567890
```

### Output Example (JSON)

```json
{
  "requests": [
    {
      "id": "f8f99a6a-0000-0000-0000-000000000000",
      "accessType": "ONGOING",
      "stoppedDueToInactivity": false
    }
  ]
}
```

---

## asc analytics reports

### Description

Lists the reports available for the report request (`GET /v1/analyticsReportRequests/{id}/reports`), including names and categories. Use this command to find the exact report name to pass to `asc analytics fetch --report`. When multiple requests exist, an active (non-stopped) one is preferred.

If no request with the given `--access-type` exists, the command fails with `ASC_ANALYTICS_REQUEST_NOT_FOUND` (exit code 2). Run `asc analytics request ensure` first.

### Options

| Option | Required | Description |
| --- | --- | --- |
| `--app <appId>` | - (required unless `ASC_APP_ID` is set) | App Store Connect app ID |
| `--access-type <type>` | - | Which request to resolve: `ONGOING` (default) or `ONE_TIME_SNAPSHOT` |
| `--category <category>` | - | Filter by category (e.g. `APP_STORE_ENGAGEMENT`) |
| `--json` | - | Switch error output to JSON (results are always JSON) |

### Example

```sh
asc analytics reports --app 1234567890
```

### Output Example (JSON)

```json
{
  "requestId": "f8f99a6a-0000-0000-0000-000000000000",
  "accessType": "ONGOING",
  "stoppedDueToInactivity": false,
  "reports": [
    {
      "id": "r-1",
      "name": "App Store Discovery and Engagement Standard",
      "category": "APP_STORE_ENGAGEMENT"
    },
    {
      "id": "r-2",
      "name": "App Downloads Standard",
      "category": "APP_STORE_COMMERCE"
    }
  ]
}
```

---

## asc analytics fetch

### Description

Filters the report's instances (one generated artifact per processing date) by date range and downloads each instance's segment files into `ASC_REPORTS_DIR` (default `./reports`). Internally it resolves the request for the given `--access-type` (preferring an active one), matches the report by name, lists instances (`filter[granularity]`), reads segment URLs, and downloads the files. Historical data generated by a `ONE_TIME_SNAPSHOT` request is fetched with `--access-type ONE_TIME_SNAPSHOT`.

Gzip-compressed segments are **decompressed** before saving. File names follow `analytics-<report-name-slug>-<granularity>-<processing-date>-<index>.tsv` (e.g. `analytics-app-store-discovery-and-engagement-standard-daily-2026-06-01-1.tsv`).

If no instances fall within the range, the command exits successfully with `files: []` (and a warning on stderr). If the report name does not match, it fails with `ASC_ANALYTICS_REPORT_NOT_FOUND` and includes the available report names in `details.available`.

### Options

| Option | Required | Description |
| --- | --- | --- |
| `--app <appId>` | - (required unless `ASC_APP_ID` is set) | App Store Connect app ID |
| `--report <name>` | **Required** | Report name (e.g. `"App Store Discovery and Engagement Standard"`). See `asc analytics reports` |
| `--access-type <type>` | - | Which request to resolve: `ONGOING` (default) or `ONE_TIME_SNAPSHOT` |
| `--granularity <granularity>` | - | `DAILY` (default) / `WEEKLY` / `MONTHLY` |
| `--from <YYYY-MM-DD>` | **Required** | Start date (lower bound of processingDate) |
| `--to <YYYY-MM-DD>` | **Required** | End date. Must be on or after `--from` |
| `--json` | - | Switch error output to JSON (results are always JSON) |

### Example

```sh
asc analytics fetch --app 1234567890 \
  --report "App Store Discovery and Engagement Standard" \
  --from 2026-06-01 --to 2026-06-07
```

### Output Example (JSON)

```json
{
  "report": "App Store Discovery and Engagement Standard",
  "category": "APP_STORE_ENGAGEMENT",
  "granularity": "DAILY",
  "from": "2026-06-01",
  "to": "2026-06-07",
  "instances": 7,
  "stoppedDueToInactivity": false,
  "files": [
    {
      "date": "2026-06-01",
      "path": "reports/analytics-app-store-discovery-and-engagement-standard-daily-2026-06-01-1.tsv",
      "bytes": 20480
    }
  ]
}
```

---

## Environment Variables

See `.env.example` for a sample configuration. Empty strings are treated as unset.

| Variable | Required | Commands | Description |
| --- | --- | --- | --- |
| `ASC_ISSUER_ID` | Required | `api *` / `apps list` / `auth token` / `reports fetch` | Issuer ID for the App Store Connect API |
| `ASC_KEY_ID` | Required | `api *` / `apps list` / `auth token` / `reports fetch` | Key ID of the API key |
| `ASC_PRIVATE_KEY_PATH` | Required (either this or `ASC_PRIVATE_KEY`) | `api *` / `apps list` / `auth token` / `reports fetch` | Path to the private key (`.p8`) file |
| `ASC_PRIVATE_KEY` | Required (either this or `ASC_PRIVATE_KEY_PATH`) | `api *` / `apps list` / `auth token` / `reports fetch` | Private key contents (PKCS#8 PEM string). Takes precedence when both are set |
| `ASC_VENDOR_NUMBER` | Required (reports only) | `reports fetch` | Vendor Number for Sales and Trends reports |
| `ASC_API_BASE_URL` | Optional | `api *` / `apps list` / `auth token` / `reports fetch` / `analytics *` | Base URL of the API. Default `https://api.appstoreconnect.apple.com` |
| `ASC_REPORTS_DIR` | Optional | `reports fetch` / `analytics fetch` | Directory where reports are saved. Default `./reports` |
| `ASC_APP_ID` | Optional | `analytics *` | Default app ID used when `--app` is omitted |

The authentication variables (`ASC_ISSUER_ID` / `ASC_KEY_ID` / private key) are also required by the `api` and `analytics` commands. `reports list` requires no environment variables.

---

## Output Conventions

- **stdout**: On success, only the **JSON result** is printed (a single line of JSON plus a newline). Designed for piping and post-processing with tools like `jq`.
- **stderr**: Diagnostics and errors.
  - Default error format: `ERROR_CODE: message` (followed by pretty-printed JSON when `details` are present)
  - With `--json`: `{"ok":false,"error":{"code":"...","message":"...","details":...}}`
- **Exit codes**:
  - `0`: success
  - `2`: **missing configuration** (missing auth environment variables = `ASC_AUTH_NOT_CONFIGURED`, missing `ASC_VENDOR_NUMBER` = `ASC_REPORTS_NOT_CONFIGURED`, missing app ID = `ASC_APP_ID_REQUIRED`), input validation errors (`VALIDATION_FAILED`), missing prerequisites (no ONGOING request = `ASC_ANALYTICS_REQUEST_NOT_FOUND`, unknown report name = `ASC_ANALYTICS_REPORT_NOT_FOUND`), and API 4xx errors
  - `1`: API 5xx errors and other unexpected errors

### Error Example for Missing Configuration (exit code 2)

```
ASC_AUTH_NOT_CONFIGURED: App Store Connect authentication is not configured.
{
  "missing": [
    "ASC_ISSUER_ID",
    "ASC_KEY_ID",
    "ASC_PRIVATE_KEY_PATH"
  ],
  "hint": "Set ASC_ISSUER_ID, ASC_KEY_ID, and ASC_PRIVATE_KEY_PATH. See .env.example."
}
```
