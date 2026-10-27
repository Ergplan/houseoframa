// Records the drafter's plain English for the sample build (Stage 11): the recorded lifts are replayed
// into a throwaway repository, and after each lift every block it changed is explained, as the build
// loop does live (explainLift: prompt explain.v1, the drafter seat, one call per block, by hash). The
// sentences go to fixtures/sample-build/explanations/, which the recorded builder replays with its
// lifts, and what they cost to cost.json, for the stage report. Engineers only: `pnpm record-explanations`.
//
// The drafter seat is the one in Settings → Brains, or the setup file's; RAMA_DRAFTER=openai puts it on
// OpenAI's model for this run (when the Anthropic account cannot be used).
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SELF_SITE_ID } from '@rama/db';
import { call, costOf, type CallDeps, type ModelCallRow } from '@rama/model';
import type { SiteLocation } from '@rama/blueprint/site';
import { explainFile, figuresOfBlock, productFigures } from '@rama/workbench';
import { makeSample, sampleLifts } from './make-sample.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
const out = path.resolve(import.meta.dirname, '../fixtures/sample-build/explanations');
const work = mkdtempSync(path.join(tmpdir(), 'rama-explain-'));
const env = { ...process.env, RAMA_WORK_DIR: work };
const repo = path.join(work, 'sample', 'repo');
makeSample(repo);
const site = {
  id: 'sample',
  name: 'Chai Stall',
  kind: 'product',
  repoDir: repo,
  blueprintPath: '',
  options: {},
} as unknown as SiteLocation;
const git = (args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });

const rows: ModelCallRow[] = [];
const overrides: Partial<CallDeps> = {
  // The rows are counted here, against this repository's own site, rather than written.
  record: async (row) => (rows.push({ ...row, siteId: SELF_SITE_ID }), `row-${rows.length}`),
  ...(process.env.RAMA_DRAFTER === 'openai'
    ? {
        seats: async () => ({
          builder: { vendor: 'anthropic', model: 'claude-sonnet-5-5', builder: 'claude-code' },
          auditor: { vendor: 'openai', model: process.env.OPENAI_MODEL! },
          drafter: { vendor: 'openai', model: process.env.OPENAI_MODEL! },
          voice: { vendor: 'openai', model: 'gpt-realtime' },
        }),
      }
    : {}),
};

const commits = git(['rev-list', '--reverse', 'HEAD']).trim().split('\n');
const lifts = sampleLifts().length;
// The builder's lifts are the last ones; the house stack's lift is explained too (its files are the product's).
for (const sha of commits.slice(-lifts)) {
  const parent = commits[commits.indexOf(sha) - 1];
  const changed = (
    parent
      ? git(['diff', '--name-only', '--diff-filter=AM', parent, sha])
      : git(['show', '--name-only', '--format=', sha])
  )
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !f.startsWith('rama/lint'));
  git(['checkout', '--quiet', sha]);
  const figures = productFigures(repo);
  for (const file of changed) {
    const source = git(['show', `${sha}:${file}`]);
    const r = await explainFile(site, file, source, (b) => figuresOfBlock(file, b, figures), {
      env,
      call: (req) => call(req, overrides),
      createdBy: 'rama:record-explanations@0.1.0',
      // The lift it follows (0: the house stack's own); the replaying builder sets the real commit.
      lift: commits.slice(-lifts).indexOf(sha),
      commit: null,
    });
    console.log(
      `${sha.slice(0, 7)} ${file}: ${r.drafted} drafted${r.failed ? ` (stopped: ${r.failed})` : ''}`,
    );
    if (r.failed) process.exit(1);
  }
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const cache = path.join(work, 'sample', 'explain');
for (const f of existsSync(cache) ? readdirSync(cache) : [])
  copyFileSync(path.join(cache, f), path.join(out, f));
const tokens = rows.reduce(
  (t, r) => ({ in: t.in + (r.inputTokens ?? 0), out: t.out + (r.outputTokens ?? 0) }),
  { in: 0, out: 0 },
);
const model = rows[0]?.model ?? '';
const cost = costOf(model, tokens.in, tokens.out);
writeFileSync(
  path.join(out, '..', 'explanations-cost.json'),
  `${JSON.stringify({ recordedAt: new Date().toISOString(), vendor: rows[0]?.vendor, model, calls: rows.length, inputTokens: tokens.in, outputTokens: tokens.out, usd: cost?.usd ?? null, inr: cost?.inr ?? null }, null, 2)}\n`,
);
console.log(
  `${rows.length} calls, ${tokens.in} in / ${tokens.out} out, ${cost ? `$${cost.usd.toFixed(3)} (₹${cost.inr.toFixed(0)})` : 'no price'}`,
);
rmSync(work, { recursive: true, force: true });
