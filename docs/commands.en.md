# asc Command Reference

[日本語](./commands.md) | English

## CLI Overview

`asc` is an App Store Connect analytics CLI. It uses the App Store Connect API to list apps, generate API authentication JWTs, and download Sales and Trends reports.

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
| [`asc apps list`](#asc-apps-list) | List apps from App Store Connect |
| [`asc auth token`](#asc-auth-token) | Generate a JWT for the App Store Connect API |
| [`asc reports list`](#asc-reports-list) | List supported report definitions |
| [`asc reports fetch`](#asc-reports-fetch) | Download raw Sales and Trends reports |

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

## Environment Variables

See `.env.example` for a sample configuration. Empty strings are treated as unset.

| Variable | Required | Commands | Description |
| --- | --- | --- | --- |
| `ASC_ISSUER_ID` | Required | `apps list` / `auth token` / `reports fetch` | Issuer ID for the App Store Connect API |
| `ASC_KEY_ID` | Required | `apps list` / `auth token` / `reports fetch` | Key ID of the API key |
| `ASC_PRIVATE_KEY_PATH` | Required (either this or `ASC_PRIVATE_KEY`) | `apps list` / `auth token` / `reports fetch` | Path to the private key (`.p8`) file |
| `ASC_PRIVATE_KEY` | Required (either this or `ASC_PRIVATE_KEY_PATH`) | `apps list` / `auth token` / `reports fetch` | Private key contents (PKCS#8 PEM string). Takes precedence when both are set |
| `ASC_VENDOR_NUMBER` | Required (reports only) | `reports fetch` | Vendor Number for Sales and Trends reports |
| `ASC_API_BASE_URL` | Optional | `apps list` / `auth token` / `reports fetch` | Base URL of the API. Default `https://api.appstoreconnect.apple.com` |
| `ASC_REPORTS_DIR` | Optional | `reports fetch` | Directory where reports are saved. Default `./reports` |

`reports list` requires no environment variables.

---

## Output Conventions

- **stdout**: On success, only the **JSON result** is printed (a single line of JSON plus a newline). Designed for piping and post-processing with tools like `jq`.
- **stderr**: Diagnostics and errors.
  - Default error format: `ERROR_CODE: message` (followed by pretty-printed JSON when `details` are present)
  - With `--json`: `{"ok":false,"error":{"code":"...","message":"...","details":...}}`
- **Exit codes**:
  - `0`: success
  - `2`: **missing configuration** (missing auth environment variables = `ASC_AUTH_NOT_CONFIGURED`, missing `ASC_VENDOR_NUMBER` = `ASC_REPORTS_NOT_CONFIGURED`), input validation errors (`VALIDATION_FAILED`), and API 4xx errors
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
