// rama gate <repoPath> --base <commit> [--test-report <vitest-or-jest.json>]
// rama-ceremony import-session <site> <reference/weekend-prototype/discovery.js>
// rama-ceremony import-decisions <site> [--from docs/DECISIONS.md]
// rama-ceremony install-gate <site> [--ref <houseoframa ref>]
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateSite, readSiteBlueprint } from '@rama/blueprint/site';
import { createDb } from '@rama/db';
import { formatGate, runGate } from './gate.ts';
import { installGate } from './install.ts';
import { appSealer, generateSigningKey, sealerFrom } from './seal.ts';
import { parseDecisionsLog, parseWeekendSession, type ImportedSession } from './imports.ts';
import { importRecord } from './importer.ts';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const USAGE = `usage:
  rama gate <repoPath> --base <commit> [--test-report <file>] [--public-key <base64>]
  rama-ceremony import-session <site> <discovery.js>
  rama-ceremony import-decisions <site> [--from docs/DECISIONS.md]
  rama-ceremony install-gate <site> [--ref <houseoframa ref>]
  rama-ceremony signing-key   (prints the public key; writes a new private key to .env if none)`;

const flag = (argv: string[], name: string) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};

async function importSession(siteId: string, imported: ImportedSession): Promise<string> {
  const site = locateSite(siteId);
  if (!site) throw new Error(`no site "${siteId}"`);
  const { db, close } = createDb();
  try {
    const o = await importRecord(db, { id: site.id, repoDir: site.repoDir }, imported);
    const orphaned = o.orphaned.length
      ? `; ${o.orphaned.length} recorded cards are no longer in the source (kept): ${o.orphaned.join(', ')}`
      : '';
    return `"${siteId}" from ${imported.source}: ${o.turns} turns, ${o.added} cards added, ${o.superseded} superseded, ${o.unchanged} unchanged, all flagged reconstructed${orphaned}`;
  } finally {
    await close();
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, a, b] = argv;
  if (command === 'gate') {
    const base = flag(argv, '--base');
    if (!a || !base) throw new Error(USAGE);
    const r = runGate(path.resolve(a), base, {
      testReport: flag(argv, '--test-report'),
      publicKey: flag(argv, '--public-key'),
    });
    console.log(formatGate(r));
    return r.ok ? 0 : 1;
  }
  if (command === 'import-session') {
    if (!a || !b) throw new Error(USAGE);
    console.error(await importSession(a, parseWeekendSession(readFileSync(b, 'utf8'))));
    return 0;
  }
  if (command === 'import-decisions') {
    if (!a) throw new Error(USAGE);
    const site = locateSite(a);
    const bp = site ? readSiteBlueprint(site) : null;
    if (!site || !bp) throw new Error(`no site "${a}" with a Blueprint`);
    const from = flag(argv, '--from') ?? 'docs/DECISIONS.md';
    const files = new Set(bp.nodes.map((n) => n.path));
    const imported = parseDecisionsLog(
      readFileSync(path.join(site.repoDir, from), 'utf8'),
      (p) => files.has(p),
      `${from} @ ${bp.commit.slice(0, 7)}`,
    );
    console.error(await importSession(a, imported));
    return 0;
  }
  if (command === 'install-gate') {
    const site = a ? locateSite(a) : null;
    if (!site) throw new Error(a ? `no site "${a}"` : USAGE);
    const ref =
      flag(argv, '--ref') ??
      (await import('node:child_process'))
        .execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
        .trim();
    // The workflow's gate counts only sealed signatures, so it needs this server's public key.
    const sealer = appSealer();
    console.error(
      `wrote ${installGate(site.repoDir, ref, sealer.publicKey)} (House of Rama at ${ref}; seals checked against this server's key); commit it in the target, and make "rama gate" a required check`,
    );
    return 0;
  }
  if (command === 'signing-key') {
    // Writes a new Ed25519 key to .env when none is set (never printed), and prints the public key.
    let sealer = sealerFrom();
    if (!sealer) {
      const key = generateSigningKey();
      appendFileSync(
        envFile,
        `\n# House of Rama's signing key for signature seals (secret; generated ${new Date().toISOString().slice(0, 10)}).\nRAMA_SIGNING_KEY=${key.privateKey}\n`,
      );
      sealer = sealerFrom({ RAMA_SIGNING_KEY: key.privateKey });
      console.error(
        `wrote a new RAMA_SIGNING_KEY to ${envFile}; restart the app to seal new signatures`,
      );
    }
    console.log(sealer!.publicKey);
    return 0;
  }
  throw new Error(USAGE);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: Error) => {
    console.error(err.message);
    process.exit(2);
  },
);
