# Deploying House of Rama on the pod box

One box runs everything, with Docker Compose (`deploy/compose.box.yml`):

| Service   | What it is                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db`      | Postgres 16. Reachable only inside the box; data in the `pgdata` volume.                                                                                                   |
| `app`     | The app, built for production (`Dockerfile`), with git and Playwright's Chromium for site captures. It migrates and seeds at start. Site clones live in the `work` volume. |
| `backup`  | A nightly `pg_dump` at `BACKUP_HOUR` UTC into `./backups/rama-<date>.dump`, keeping `BACKUP_KEEP_DAYS` days.                                                               |
| `watcher` | The checks of `scripts/watch.mjs`, run once (`--profile checks`).                                                                                                          |

## 1. On the box

- Docker with the compose plugin.
- A checkout of this repository at the commit to run.
- A public address (`RAMA_BASE_URL`), ideally https behind a reverse proxy (Caddy or nginx) forwarding to `APP_PORT`. Session cookies are marked Secure when that address is https.

## 2. `.env` at the repository root

Copy `.env.example` and fill in at least:

```
POSTGRES_PASSWORD=<a long random string>
RAMA_MEMBER_NAME=<the first member's name>
RAMA_BASE_URL=https://<the box's address>
RAMA_ACCOUNTS='[{"username":"rachit","password":"<8+ chars>","name":"Rachit Agarwal","role":"manager"},{"username":"member2","password":"<8+ chars>","name":"Second Member"}]'
RAMA_POD_TOKEN=<a long random string, also given to the pod controller>
BUILDER_VENDOR=anthropic
AUDITOR_VENDOR=openai
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-6.1-sol
GIT_SHA=<git rev-parse --short HEAD>
```

`DATABASE_URL` is set by the compose file. Members sign in at `/login` with a username and password from `RAMA_ACCOUNTS`; to add or change an account, edit `.env` and restart the app.

## 3. Start

```
docker compose -f deploy/compose.box.yml --env-file .env up -d --build
curl -s http://localhost:${APP_PORT:-3000}/api/health     # {"ok":true,"commit":"<GIT_SHA>"}
```

## 4. Pods and sites

```
docker compose -f deploy/compose.box.yml exec app pnpm rama-pod add 1 "Prototype pod"
docker compose -f deploy/compose.box.yml exec app pnpm rama site add <gitUrl> --id <id>
```

A site belongs to the member named in `RAMA_MEMBER_NAME` when added from the command line. The pod controller polls `GET /api/pod/<n>/status` with `Authorization: Bearer $RAMA_POD_TOKEN`.

## 5. Backups and restore

Take a backup now, and list the backups:

```
docker compose -f deploy/compose.box.yml exec backup sh /deploy/backup.sh --now
ls backups/
```

Restore into a fresh database, then point the app at it or rename it:

```
docker compose -f deploy/compose.box.yml exec backup sh -c 'createdb restored && pg_restore --dbname=restored /backups/rama-<date>.dump'
```

## 6. Update

```
git pull && docker compose -f deploy/compose.box.yml --env-file .env up -d --build
```

The app migrates at start. Volumes (database, site clones) are kept.

## Verified

On 2026-10-23, on the build machine (not the pod box), under a separate project on port 3100:

- the image built in 5.5 minutes;
- `/api/health` answered with the commit, `/login` served, and `/site/self` sent an anonymous visitor to `/login`;
- the pod status answered 503 with no controller token;
- `backup.sh --now` wrote a dump, and `pg_restore` of it into a fresh database restored the seeded member.

The trial stack and its volumes were then removed.
