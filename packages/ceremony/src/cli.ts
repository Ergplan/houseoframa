// rama gate <repoPath> --base <commit> [--test-report <vitest-or-jest.json>]
// rama-ceremony import-session <site> <reference/weekend-prototype/discovery.js>
// rama-ceremony import-decisions <site> [--from docs/DECISIONS.md]
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { locateSite, readSiteBlueprint } from '@rama/blueprint/site';
import { createDb, discoverySessions } from '@rama/db';
import { formatGate, runGate } from './gate.ts';
import { parseDecisionsLog, parseWeekendSession, type ImportedSession } from './imports.ts';
import { addTurn, decide, startSession } from './store.ts';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const IMPORT_COMPONENT = 'rama:ceremony-import@0.1.0';
const USAGE = `usage:
  rama gate <repoPath> --base <commit> [--test-report <file>]
  rama-ceremony import-session <site> <discovery.js>
  rama-ceremony import-decisions <site> [--from docs/DECISIONS.md]`;

const flag = (argv: string[], name: string) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};

async function importSession(siteId: string, imported: ImportedSession): Promise<string> {
  const site = locateSite(siteId);
  if (!site) throw new Error(`no site "${siteId}"`);
  const { db, close } = createDb();
  try {
    const [already] = await db
      .select()
      .from(discoverySessions)
      .where(
        and(eq(discoverySessions.siteId, siteId), eq(discoverySessions.source, imported.source)),
      );
    if (already)
      throw new Error(
        `${imported.source} is already imported for "${siteId}" (session ${already.id})`,
      );
    const sessionId = await startSession(db, siteId, {
      title: imported.title,
      reconstructed: true,
      source: imported.source,
      createdBy: IMPORT_COMPONENT,
    });
    for (const t of imported.turns) {
      await addTurn(db, siteId, sessionId, {
        speaker: t.speaker,
        text: t.text,
        at: new Date(t.at),
        createdBy: IMPORT_COMPONENT,
      });
    }
    for (const d of imported.decisions) {
      await decide(
        db,
        { id: site.id, repoDir: site.repoDir },
        { ...d, at: new Date(d.at), sessionId, reconstructed: true, createdBy: IMPORT_COMPONENT },
      );
    }
    return `imported ${imported.turns.length} turns and ${imported.decisions.length} decision cards into "${siteId}", flagged reconstructed`;
  } finally {
    await close();
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, a, b] = argv;
  if (command === 'gate') {
    const base = flag(argv, '--base');
    if (!a || !base) throw new Error(USAGE);
    const r = runGate(path.resolve(a), base, { testReport: flag(argv, '--test-report') });
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
  throw new Error(USAGE);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: Error) => {
    console.error(err.message);
    process.exit(2);
  },
);
