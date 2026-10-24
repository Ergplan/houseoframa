// deploy/backup.sh, run for real with a stand-in pg_dump: the dump lands under its date, old dumps go,
// and BACKUP_COPY_COMMAND copies the new one off the box; a failed copy keeps the local dump.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../deploy/backup.sh', import.meta.url));
let dir: string;
let bin: string;
const today = new Date().toISOString().slice(0, 10);

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'rama-backup-'));
  bin = path.join(dir, 'bin');
  mkdirSync(bin);
  // A pg_dump that writes where --file says.
  writeFileSync(
    path.join(bin, 'pg_dump'),
    '#!/bin/sh\nfor a in "$@"; do case "$a" in --file=*) echo dump > "${a#--file=}";; esac; done\n',
  );
  chmodSync(path.join(bin, 'pg_dump'), 0o755);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const run = (backups: string, env: Record<string, string> = {}) =>
  spawnSync('sh', [SCRIPT, '--now'], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      BACKUP_DIR: backups,
      BACKUP_KEEP_DAYS: '14',
      ...env,
    },
  });

describe('deploy/backup.sh', () => {
  it('writes the dump under its date and removes dumps older than the keep window', () => {
    const backups = path.join(dir, 'a');
    mkdirSync(backups);
    const old = path.join(backups, 'rama-2020-01-01.dump');
    writeFileSync(old, 'old');
    utimesSync(old, new Date('2020-01-01'), new Date('2020-01-01'));
    const r = run(backups);
    expect(r.status, r.stderr).toBe(0);
    expect(readdirSync(backups)).toEqual([`rama-${today}.dump`]);
  });

  it('copies the new dump off the box with BACKUP_COPY_COMMAND, the dump path as $1', () => {
    const backups = path.join(dir, 'b');
    const offsite = path.join(dir, 'offsite');
    mkdirSync(backups);
    mkdirSync(offsite);
    const r = run(backups, { BACKUP_COPY_COMMAND: `cp "$1" "${offsite}/"` });
    expect(r.stdout).toContain(`backup: copied rama-${today}.dump off the box`);
    expect(existsSync(path.join(offsite, `rama-${today}.dump`))).toBe(true);
  });

  it('keeps the local dump and says so when the copy fails', () => {
    const backups = path.join(dir, 'c');
    mkdirSync(backups);
    const r = run(backups, { BACKUP_COPY_COMMAND: 'exit 3' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('the copy of');
    expect(r.stdout).toContain('failed; the dump is kept here');
    expect(existsSync(path.join(backups, `rama-${today}.dump`))).toBe(true);
  });
});
