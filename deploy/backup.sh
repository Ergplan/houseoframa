#!/bin/sh
# Nightly Postgres backup for the pod box (docs/DEPLOY.md): at BACKUP_HOUR (UTC) each day, a custom-format
# dump to $BACKUP_DIR (default /backups) as rama-<date>.dump, written to a temporary name first so a
# half-written dump is never mistaken for a backup; dumps older than BACKUP_KEEP_DAYS are removed. `--now` takes one dump and exits.
# With BACKUP_COPY_COMMAND set, each new dump is then copied off the box by running that command with the
# dump's path as $1 (for example `rclone copy "$1" offsite:rama`). A failed copy is logged; the local dump
# stays either way.
set -eu
dir=${BACKUP_DIR:-/backups}
dump() {
  day=$(date -u +%Y-%m-%d)
  pg_dump --format=custom --file="$dir/.rama-$day.dump.partial"
  mv "$dir/.rama-$day.dump.partial" "$dir/rama-$day.dump"
  find "$dir" -name 'rama-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
  echo "backup: $dir/rama-$day.dump"
  if [ -n "${BACKUP_COPY_COMMAND:-}" ]; then
    if sh -c "$BACKUP_COPY_COMMAND" copy "$dir/rama-$day.dump"; then
      echo "backup: copied rama-$day.dump off the box"
    else
      echo "backup: the copy of rama-$day.dump off the box failed; the dump is kept here"
    fi
  fi
}
if [ "${1:-}" = "--now" ]; then dump; exit 0; fi
while true; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) ${BACKUP_HOUR:-2}:00" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  dump || echo "backup: failed at $(date -u)"
done
