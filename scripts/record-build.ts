// Records a real build of a product as the recording the recorded builder replays (Stage 9): Test drive
// without a builder key, the watcher and CI. Writes each lift as `git format-patch` output (the house
// stack's own lift as 0000-, for make-sample.mjs) and lifts.json with the builder's answers, read from
// the build's model_calls rows, and narration.jsonl with what the builder said and did as it worked. For engineers:
//
//   pnpm record-build <siteId> fixtures/sample-build
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { locateSite, siteRecord, workDir } from '@rama/blueprint/site';
import { createDb, modelCalls } from '@rama/db';

if (existsSync('.env')) process.loadEnvFile('.env');

const [siteId, out] = process.argv.slice(2);
if (!siteId || !out) {
  console.error('usage: pnpm record-build <siteId> <out dir>');
  process.exit(2);
}
const site = locateSite(siteId);
const record = siteRecord(siteId);
if (!site || !record?.houseStack)
  throw new Error(`${siteId} is not a product built on the house stack`);
const git = (...args: string[]) =>
  execFileSync('git', ['-C', site.repoDir, ...args], { encoding: 'utf8' }).trim();

const dir = path.resolve(out);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
// The house stack's lift, then the builder's lifts, one patch each.
git(
  'format-patch',
  '--quiet',
  '--no-signature',
  '--zero-commit',
  '-o',
  dir,
  '--root',
  record.houseStack,
);
const layDown = readdirSync(dir).filter((f) => f.endsWith('.patch'));
if (layDown.length !== 1) throw new Error('the house stack should be one lift');
execFileSync('mv', [path.join(dir, layDown[0]!), path.join(dir, `0000-${layDown[0]!.slice(5)}`)]);
git(
  'format-patch',
  '--quiet',
  '--no-signature',
  '--zero-commit',
  '--start-number',
  '1',
  '-o',
  dir,
  `${record.houseStack}..HEAD`,
);
const patches = readdirSync(dir)
  .filter((f) => f.endsWith('.patch') && !f.startsWith('0000-'))
  .sort();

const { db, close } = createDb();
try {
  const rows = (await db.select().from(modelCalls))
    .filter((r) => r.siteId === siteId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const lifts = rows.filter((r) => r.role === 'builder' && r.status === 'ok');
  // Each answered run made one lift; a run that made no lift would leave the two out of step.
  if (lifts.length !== patches.length)
    throw new Error(`${lifts.length} answered builder runs, ${patches.length} lifts: not one each`);
  const outputs = lifts.map(
    (r) =>
      r.output as {
        answer: { said: string; next: string | null; done: boolean };
        costUsd: number | null;
      },
  );
  const recording = {
    builder: 'Claude Code',
    model: lifts[0]!.model,
    recordedAt: new Date().toISOString(),
    costUsd: outputs.reduce((a, o) => a + (o.costUsd ?? 0), 0),
    lifts: outputs.map((o, i) => ({ ...o.answer, patch: patches[i]! })),
  };
  writeFileSync(path.join(dir, 'lifts.json'), JSON.stringify(recording, null, 2) + '\n');
  // What the builder said and did while it worked (Stage 13), for the film of every replay.
  const narration = path.join(workDir(), siteId, 'narration.jsonl');
  if (existsSync(narration)) copyFileSync(narration, path.join(dir, 'narration.jsonl'));
  console.log(
    `${patches.length} lifts recorded in ${out}, $${recording.costUsd.toFixed(2)} of building.`,
  );
} finally {
  await close();
}
