#!/usr/bin/env bash
# Install (or remove) a launchd agent that runs fetch-daily.sh once a day.
#
# Unlike cron, a launchd calendar job missed because the machine was asleep
# fires once on the next wake, so this is the recommended scheduler on macOS.
#
# Usage:
#   scripts/install-launchd.sh [HH:MM]      Install, default 22:30. Daily sales
#                                           reports for all territories are
#                                           published by 5 am Pacific Time
#                                           (~21:00-22:00 JST), so a late-evening
#                                           JST run fetches yesterday's data.
#   scripts/install-launchd.sh --uninstall  Unload and delete the agent.
#
# The generated plist embeds this repository's absolute path; re-run after
# moving the repository. Logs append to ~/Library/Logs/asc-fetch.log.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="local.asc.fetch-daily"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/asc-fetch.log"

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Uninstalled $LABEL"
  exit 0
fi

TIME="${1:-22:30}"
if [[ ! $TIME =~ ^([01]?[0-9]|2[0-3]):[0-5][0-9]$ ]]; then
  echo "error: time must be HH:MM (24h), got '$TIME'" >&2
  exit 2
fi
HOUR=$((10#${TIME%%:*}))
MINUTE=$((10#${TIME##*:}))

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>$LABEL</string>
	<key>ProgramArguments</key>
	<array>
		<string>$SCRIPT_DIR/fetch-daily.sh</string>
	</array>
	<key>StartCalendarInterval</key>
	<dict>
		<key>Hour</key>
		<integer>$HOUR</integer>
		<key>Minute</key>
		<integer>$MINUTE</integer>
	</dict>
	<key>StandardOutPath</key>
	<string>$LOG</string>
	<key>StandardErrorPath</key>
	<string>$LOG</string>
</dict>
</plist>
EOF
plutil -lint "$PLIST" >/dev/null

# Reload so re-running picks up a changed time or repository path.
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed $LABEL: daily at $TIME, logging to $LOG"
