---
name: asc
description: >
  Fetch and analyze App Store Connect data (Sales and Trends, App Analytics) with the
  asc CLI. Use when asked about downloads, revenue, impressions, product page views,
  conversion rates, or any App Store performance question. Covers how to run the
  commands and — critically — how to interpret the report data without common mistakes.
---

# asc — App Store Connect data fetching and analysis

The `asc` CLI downloads raw report files from the App Store Connect API. It never
aggregates or interprets data; that is your job. All command results are single-line
JSON on stdout. Diagnostics and errors go to stderr (errors always include a `code`;
`details`, when present, may carry a `hint` — read them before retrying).

Run commands with `pnpm dev -- <args>` in this repo (or `asc <args>` if the built
binary is installed). Always pass `--json`.

## Setup expectations

Credentials come from environment variables (see `.env.example`): `ASC_ISSUER_ID`,
`ASC_KEY_ID`, `ASC_PRIVATE_KEY_PATH` (or `ASC_PRIVATE_KEY`), plus `ASC_VENDOR_NUMBER`
for Sales and Trends and optionally `ASC_APP_ID` as the default app for analytics
commands. Exit code 2 with `*_NOT_CONFIGURED` means missing env vars — never prompt;
report what is missing.

## Two data sources, two questions

1. **Sales and Trends** (`asc reports fetch`) — the transaction ledger. Answers
   "how many downloads / how much revenue per day, country, device".
2. **App Analytics** (`asc analytics fetch`) — store behavior. Answers "how many
   people saw the app (impressions, product page views), where they came from, and
   how that converts to downloads".

### Typical flows

```sh
# Sales: daily downloads & revenue, saved as reports/sales-summary-<date>.tsv(.gz)
pnpm dev -- reports fetch --from 2026-06-01 --to 2026-06-07 --json

# Analytics: one-time setup per app (idempotent, safe to re-run)
pnpm dev -- apps list --json                       # find the app ID
pnpm dev -- analytics request ensure --app <id> --json

# Discover exact report names (pass to --report verbatim)
pnpm dev -- analytics reports --app <id> --json

# Fetch report files, saved as reports/analytics-<report>-<granularity>-<date>-<n>.tsv
pnpm dev -- analytics fetch --app <id> --report "App Store Discovery and Engagement Standard" \
  --from 2026-06-01 --to 2026-06-07 --json
```

Analytics files are decompressed tab-separated text with a header row; aggregate them
yourself (awk, Python, etc.). Sales files may be gzipped (`.tsv.gz`) — gunzip first.

## Interpretation pitfalls (read before drawing conclusions)

- **Sales `Units` counts first-time downloads only** (Product Type Identifier `1`).
  Updates (`7`), redownloads (`3`), and in-app purchases (`IA*`) are separate rows.
  Do not sum `Units` across product types blindly.
- **Privacy thresholding in analytics reports**: rows representing fewer than ~5
  unique users/devices are omitted entirely. Fine-grained slices (small country ×
  source combinations) undercount; totals computed from sliced rows will be lower
  than the true total. Prefer coarser dimensions when sums matter.
- **Population differs by category**: App Store engagement and commerce data
  (impressions, page views, downloads, purchases) covers ALL users. App Usage data
  (sessions, active devices, installs/deletions) covers only users who opted in to
  share data with developers. Never compute a ratio that mixes the two populations
  without saying so.
- **Conversion rate** = downloads ÷ unique viewers. Use "App Store Discovery and
  Engagement Standard" (unique counts of impressions/page views) as the denominator
  and a downloads report (e.g. "App Downloads Standard") as the numerator, matched on
  the same date range and territory.
- **Standard vs Detailed variants**: most analytics reports exist as two separate
  reports, "<Name> Standard" and "<Name> Detailed" (e.g. "App Downloads Detailed").
  Detailed adds finer dimensions but loses more rows to privacy thresholding. Prefer
  Standard when computing totals; use Detailed for breakdowns.
- **Data freshness**: analytics instances appear ~daily with 24–48h lag. A newly
  created request produces nothing for up to 48 hours — an empty `files: []` result
  with a stderr warning is normal, not an error.
- **`stoppedDueToInactivity: true`** means Apple stopped generating the ONGOING
  report because it was not fetched for a long time. Run
  `asc analytics request ensure` again and expect a gap in the data.
- **Retention**: daily/weekly/monthly Sales and Trends reports are only available
  for ~1 year back. For older history, create a snapshot request once
  (`analytics request ensure --access-type ONE_TIME_SNAPSHOT`) and fetch its data
  with `analytics fetch --access-type ONE_TIME_SNAPSHOT ...`.

## Operational notes

- `analytics request ensure` is the only mutating command; everything else is
  read-only. It is idempotent, so prefer running it over checking first.
- Fetch regularly (e.g. daily) — continuous fetching both accumulates a local
  archive in `reports/` and keeps Apple generating the ONGOING reports.
- Prefer analyzing files already in `reports/` before hitting the API again.
