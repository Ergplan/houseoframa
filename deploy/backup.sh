#!/bin/sh
# Nightly Postgres backup for the pod box (docs/DEPLOY.md): at BACKUP_HOUR (UTC) each day, a custom-format
# dump to /backups/rama-<date>.dump, written to a temporary name first so a half-written dump is never
# mistaken for a backup; dumps older than BACKUP_KEEP_DAYS are removed. `--now` takes one dump and exits.
set -eu
dump() {
  day=$(date -u +%Y-%m-%d)
  pg_dump --format=custom --file="/backups/.rama-$day.dump.partial"
  mv "/backups/.rama-$day.dump.partial" "/backups/rama-$day.dump"
  find /backups -name 'rama-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
  echo "backup: /backups/rama-$day.dump"
}
if [ "${1:-}" = "--now" ]; then dump; exit 0; fi
while true; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) ${BACKUP_HOUR:-2}:00" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  dump || echo "backup: failed at $(date -u)"
done
