#!/usr/bin/env bash
# Daily App Store Connect data fetch, intended for cron/launchd.
#
# Fetches into $ASC_REPORTS_DIR (default ./reports):
#   - Sales and Trends daily summaries for the last SALES_WINDOW_DAYS days
#   - App Analytics report files for the last ANALYTICS_WINDOW_DAYS days
#
# Behavior:
#   - Idempotent: re-runs overwrite the same files, so overlapping windows are safe.
#   - Runs `analytics request ensure` every time (idempotent); this also recovers
#     automatically when Apple stops an ONGOING request due to inactivity.
#   - Sales failures for a single day are warnings only: Apple publishes a day's
#     report with up to ~1 day of delay, and days with zero transactions 404.
#   - Analytics failures make the script exit non-zero so the scheduler can alert.
#
# Requirements:
#   - `pnpm build` has been run (executes dist/cli.js).
#   - Credentials in the repo's .env or exported in the environment, including
#     ASC_APP_ID (used as the default app for analytics commands). See .env.example.
#
# Configuration (env or .env):
#   ASC_DAILY_ANALYTICS_REPORTS  Comma-separated analytics report names to fetch.
#                                Verify exact names with: asc analytics reports --json
#   SALES_WINDOW_DAYS            How many trailing days of sales to (re)fetch. Default 3.
#   ANALYTICS_WINDOW_DAYS        Trailing window for analytics instances. Default 7,
#                                which absorbs the 24-48h reporting lag and a few
#                                days of scheduler downtime.

set -u -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Relative paths in .env (ASC_PRIVATE_KEY_PATH, ASC_REPORTS_DIR) resolve from the repo root.
cd "$REPO_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# cron/launchd run with a minimal PATH that usually lacks node (nvm/homebrew
# installs); use the first match: newest nvm version, then Homebrew, /usr/local.
if ! command -v node >/dev/null 2>&1; then
  for dir in "$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)" /opt/homebrew/bin /usr/local/bin; do
    if [[ -n $dir && -x "$dir/node" ]]; then
      PATH="$dir:$PATH"
      break
    fi
  done
  export PATH
fi

ASC=(node "$REPO_DIR/dist/cli.js")
SALES_WINDOW_DAYS="${SALES_WINDOW_DAYS:-3}"
ANALYTICS_WINDOW_DAYS="${ANALYTICS_WINDOW_DAYS:-7}"
ANALYTICS_REPORTS="${ASC_DAILY_ANALYTICS_REPORTS:-App Store Discovery and Engagement Standard,App Store Discovery and Engagement Detailed,App Downloads Standard,App Downloads Detailed}"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >&2
}

days_ago() {
  if date -v -1d +%F >/dev/null 2>&1; then
    date -v "-${1}d" +%F # BSD date (macOS)
  else
    date -d "${1} days ago" +%F # GNU date (Linux)
  fi
}

failures=0

# --- Sales and Trends: one request per day so a missing day cannot abort the rest ---
for ((offset = 1; offset <= SALES_WINDOW_DAYS; offset++)); do
  day="$(days_ago "$offset")"
  log "sales: fetching $day"
  if ! "${ASC[@]}" reports fetch --from "$day" --to "$day" --json; then
    log "sales: WARNING fetch failed for $day (not published yet, or no transactions that day)"
  fi
done

# --- App Analytics ---
from="$(days_ago "$ANALYTICS_WINDOW_DAYS")"
to="$(days_ago 1)"

log "analytics: ensuring ONGOING report request"
if ! "${ASC[@]}" analytics request ensure --json; then
  log "analytics: ERROR request ensure failed"
  failures=$((failures + 1))
fi

IFS=',' read -r -a reports <<<"$ANALYTICS_REPORTS"
for report in "${reports[@]}"; do
  report="${report#"${report%%[![:space:]]*}"}"
  report="${report%"${report##*[![:space:]]}"}"
  [[ -z $report ]] && continue
  log "analytics: fetching '$report' $from..$to"
  if ! "${ASC[@]}" analytics fetch --report "$report" --from "$from" --to "$to" --json; then
    log "analytics: ERROR fetch failed for '$report'"
    failures=$((failures + 1))
  fi
done

if ((failures > 0)); then
  log "done with $failures failure(s)"
  exit 1
fi

log "done"
