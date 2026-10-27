// The build loop (Stage 9): "Start build" has the builder build the product from its decision cards on
// the house stack, one lift at a time. After every lift House of Rama, by itself, redraws the picture,
// runs the figures lint and the tests, builds and photographs every screen, works every figure out again
// with the product's own code, and runs the merge gate; the lakefront shows the result at once. A lift
// with a problem is a grey flag with House of Rama's sentence and what the builder does next, and the
// next lift is the fix. "Pause build" stops after the lift in hand. The build is done when the builder
// says so and the product shows every figure traced and every screen Verified.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  siteRecord,
  updateSiteRecord,
  writeSiteBlueprint,
  type SiteLocation,
} from '@rama/blueprint/site';
import { appSealer, currentDecisions, listDecisions, runGate } from '@rama/ceremony';
import { readSecret, type Db } from '@rama/db';
import { readCapture, showroomOf } from '@rama/trace';
import { photograph } from './actions.ts';
import type { BuilderDriver, LiftInput } from './builders/types.ts';
import { pushTo } from './github.ts';
import { linkHouseModules } from './modules.ts';
import { startJob, StepError, type Job, type Step, type StartedJob } from './jobs.ts';
import { commitAll, houseRef } from './products.ts';
import { layDownScaffold, lintProduct, onHouseStack } from './scaffold.ts';
import { siteStates } from './states.ts';
import { runSiteTests } from './tests.ts';
import { startTail } from './tail.ts';
import { explainFile } from './explain.ts';
import { figuresOfBlock, productFigures } from './code.ts';

export const BUILD_COMPONENT = 'rama:workbench-build@0.1.0';
/** Lifts in one build, at most: a build that needs more stops and says so. */
export const MAX_LIFTS = 16;
/** Lifts in a row that make nothing, or keep failing, before the build stops. */
export const MAX_STUCK = 3;
export const HOUSE_STACK_SUBJECT = 'Start from the house stack';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const git = (repoDir: string, args: string[]) =>
  execFileSync('git', ['-C', repoDir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const head = (repoDir: string) => {
  try {
    return git(repoDir, ['rev-parse', 'HEAD']);
  } catch {
    return null;
  }
};

/** What House of Rama found after one lift. */
export interface LiftCheck {
  commit: string;
  ok: boolean;
  /** What is wrong with the lift: each one stops the build being done, and the next lift fixes it. */
  problems: string[];
  /** What still stands between the product and done, though nothing is wrong. */
  notYet: string[];
  figures: { traced: number; shown: number; agree: number };
  screens: { verified: number; of: number };
  ms: number;
}

/** The sentence a lift shows when it is checked and nothing is wrong. */
export const checkedSentence = (c: LiftCheck) =>
  `${plural(c.screens.of, 'screen')}; ${c.figures.traced} of ${plural(c.figures.shown, 'figure')} traced and ${c.figures.agree} worked out again the same; ${c.screens.verified} of ${plural(c.screens.of, 'screen')} Verified. Checked in ${Math.round(c.ms / 1000)} s.`;

/**
 * Puts the product's packages in place: links to House of Rama's own when the versions match, else the
 * product's own install. Returns why it could not, or null.
 */
export function ensurePackages(repoDir: string): string | null {
  if (existsSync(path.join(repoDir, 'node_modules'))) return null;
  if (linkHouseModules(repoDir).linked) return null;
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: repoDir,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
    } as unknown as NodeJS.ProcessEnv,
    timeout: 10 * 60_000,
  });
  return r.status === 0
    ? null
    : `The product’s packages could not be installed: ${(r.stderr || '').trim().split('\n').at(-1) ?? ''}`;
}

/** Runs every check House of Rama makes after a lift, at the checkout's HEAD. */
export async function checkLift(
  site: SiteLocation,
  base: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LiftCheck> {
  const started = Date.now();
  const repoDir = site.repoDir;
  const problems: string[] = [];
  const notYet: string[] = [];
  const bp = writeSiteBlueprint(site);
  // The product's packages first: the lint and the tests read them.
  const packages = ensurePackages(repoDir);
  if (packages) problems.push(packages);

  // The lint runs in its own process while the tests run and the app is built and photographed.
  const linting = lintProduct(repoDir, env);

  let passing: string[] = [];
  try {
    const run = runSiteTests(site, env);
    passing = run.passing;
    for (const t of run.failing) problems.push(`The checks in ${t} fail.`);
  } catch (err) {
    problems.push((err as Error).message);
  }

  let photographed = false;
  try {
    await photograph(site, env);
    photographed = true;
  } catch (err) {
    problems.push((err as Error).message);
  }
  for (const f of await linting) problems.unshift(f.sentence);
  const figures = { traced: 0, shown: 0, agree: 0 };
  const c = readCapture(site.id, env);
  if (photographed && c && c.commit === bp.commit) {
    for (const s of c.screens)
      for (const f of s.figures) {
        figures.shown++;
        if (c.mappings[f.id]) figures.traced++;
        else
          problems.push(
            `The screen “${s.title}” shows “${f.text}” with no trail: it is not a Figure.`,
          );
      }
    const room = showroomOf(c, bp);
    for (const t of Object.values(room.trails)) {
      if (t.result?.matches === true) figures.agree++;
      else
        problems.push(
          `“${t.title}” did not come out the same when worked out again: the screen shows ${t.result?.shown ?? 'nothing'}, the product’s own code gives ${t.result?.computed ?? 'nothing'}${t.reexecutionError ? ` (${t.reexecutionError})` : ''}.`,
        );
    }
  }

  // The merge gate, from the house stack's first lift: every screen changed since needs a passing test.
  const dir = mkdtempSync(path.join(tmpdir(), 'rama-gate-'));
  try {
    const report = path.join(dir, 'report.json');
    writeFileSync(
      report,
      JSON.stringify({
        testResults: passing.map((t) => ({ name: path.join(repoDir, t), status: 'passed' })),
      }),
    );
    const gate = runGate(repoDir, base, {
      testReport: report,
      publicKey: appSealer(env).publicKey,
    });
    for (const p of gate.problems) problems.push(`The merge gate refuses the lift: ${p}.`);
    for (const s of gate.screens.filter((x) => !x.ok))
      problems.push(
        s.uncovered.length
          ? `The merge gate refuses the screen ${s.route}: it changed and no passing check stands behind ${s.uncovered.join(', ')}.`
          : `The merge gate refuses the screen ${s.route}: it changed, and nothing it changed can be checked by a test; it needs a signature.`,
      );
  } catch (err) {
    problems.push(`The merge gate could not run: ${(err as Error).message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const st = siteStates(site, bp, env);
  for (const s of st.screens.filter((x) => !x.state.verified))
    notYet.push(`The screen “${s.name}” (${s.route}) is not Verified yet: ${s.state.why[0] ?? ''}`);
  if (!st.screens.length) notYet.push('The product has no screens yet.');
  return {
    commit: bp.commit,
    ok: problems.length === 0,
    problems,
    notYet,
    figures,
    screens: { verified: st.screens.filter((s) => s.state.verified).length, of: st.screens.length },
    ms: Date.now() - started,
  };
}

/** Whether the build has nothing left to do: no problem, every figure traced, every screen Verified. */
export const complete = (c: LiftCheck) =>
  c.ok &&
  c.notYet.length === 0 &&
  c.figures.traced === c.figures.shown &&
  c.figures.agree === c.figures.traced &&
  c.screens.of > 0 &&
  c.screens.verified === c.screens.of;

// Pause requests, by site, in this process (the loop and the routes may load their own copies).
const g = globalThis as { __ramaPause?: Set<string> };
const pauses = (g.__ramaPause ??= new Set<string>());

/** Asks the build running on the site to stop after the lift in hand. */
export function pauseBuild(siteId: string): void {
  pauses.add(siteId);
}

/** The decision cards the builder builds from: those in force that someone said yes to. */
export async function briefOf(db: Db, siteId: string): Promise<LiftInput['cards']> {
  return currentDecisions(await listDecisions(db, siteId))
    .filter((d) => d.status === 'decided')
    .map((d) => ({ title: d.title, statement: d.statement, by: d.by }));
}

export interface BuildOptions {
  driver: BuilderDriver;
  /** Who pressed Start build. */
  person: string;
  /** Recorded on the builder's model calls. */
  createdBy?: string;
  maxLifts?: number;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

/** Starts the build on a product as a job; one build runs per product at a time. */
export function startBuild(
  withDb: <T>(fn: (db: Db) => Promise<T>) => Promise<T>,
  site: SiteLocation,
  opts: BuildOptions,
): StartedJob {
  pauses.delete(site.id);
  return startJob(
    { kind: 'build', siteId: site.id, person: opts.person },
    (step, job) => build(withDb, step, site, opts, job),
    opts.env,
  );
}

export async function build(
  withDb: <T>(fn: (db: Db) => Promise<T>) => Promise<T>,
  step: Step,
  site: SiteLocation,
  opts: BuildOptions,
  job?: Job,
): Promise<void> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? (() => new Date());
  const record = siteRecord(site.id, env);
  if (site.kind !== 'product' || !record)
    throw new StepError('Only a product made here is built here.');
  if (!opts.driver.wired) {
    await step(
      'Builder',
      async () => {
        await opts.driver.lift({} as never);
        return '';
      },
      'Choose Claude Code as the builder in Settings → Brains, then press Start build.',
    );
    return;
  }
  // The recorded builder replays another's lifts: the company is that builder's.
  const by = opts.driver.id === 'recorded' ? 'claude-code' : opts.driver.id;
  updateSiteRecord(
    site.id,
    { builder: by, builtBy: [...new Set([...(record.builtBy ?? []), by])] },
    env,
  );
  const product = { name: site.name, idea: record.idea ?? site.name };
  const cards = await withDb((db) => briefOf(db, site.id));
  if (!cards.length)
    await step('Brief', () => {
      throw new StepError(
        'No decision card has a yes yet, so there is nothing to build.',
        'Say yes to the cards in the site office, then press Start build.',
      );
    });

  const lifts: LiftInput['lifts'] = [];
  let base = record.houseStack ?? null;
  // The last lift’s check (a holder: it is set inside steps).
  const was: { last: LiftCheck | null } = { last: null };
  // A lift with a problem is a grey flag, not the end: the loop carries on with the fix. A builder that
  // cannot run, or a run that failed, ends the build with its sentence.
  const lift = async (name: string, run: () => Promise<string>, next?: string) => {
    try {
      await step(name, run, next);
    } catch (err) {
      if (!(err instanceof StepError)) throw err;
    }
  };

  if (!base || !onHouseStack(site.repoDir)) {
    await step('Lift 0: the house stack', async () => {
      layDownScaffold(
        site.repoDir,
        { id: site.id, name: site.name, idea: product.idea },
        { ref: houseRef(), publicKey: appSealer(env).publicKey },
        env,
      );
      base = commitAll(site.repoDir, HOUSE_STACK_SUBJECT, 'House of Rama', now());
      updateSiteRecord(site.id, { houseStack: base }, env);
      was.last = await checkLift(site, base, env);
      lifts.push({
        n: 0,
        subject: HOUSE_STACK_SUBJECT,
        ok: was.last.ok,
        problems: was.last.problems,
      });
      if (!was.last.ok)
        throw new StepError(
          `The house stack itself did not pass: ${was.last.problems.join(' ')}`,
          'An engineer looks at templates/house-stack.',
        );
      return `The house stack is laid down. ${checkedSentence(was.last)}`;
    });
  }

  let session: string | null = null;
  let stuck = 0;
  let cost = 0;
  const max = opts.maxLifts ?? MAX_LIFTS;
  for (let n = 1; n <= max; n++) {
    if (pauses.has(site.id)) {
      pauses.delete(site.id);
      await step(
        'Paused',
        () => `Paused after lift ${n - 1}, as asked. Press Start build to go on.`,
      );
      return;
    }
    const fixing = Boolean(was.last && !was.last.ok);
    const before = head(site.repoDir);
    // What the lift brought back: set inside the step.
    const got: { answer?: Awaited<ReturnType<BuilderDriver['lift']>>; check?: LiftCheck } = {};
    let subject = '';
    await lift(
      `Lift ${n}`,
      async () => {
        // The builder's edits, as it makes them, for the code typed inside the glass (Stage 11).
        const tail = startTail(site.repoDir, site.id, n, { env });
        const answer = await opts.driver
          .lift({
            repoDir: site.repoDir,
            siteId: site.id,
            session,
            createdBy: opts.createdBy ?? BUILD_COMPONENT,
            input: {
              product,
              cards,
              lifts,
              ask: fixing ? 'fix' : 'next',
              problems: fixing ? was.last!.problems : [],
              notYet: was.last?.notYet ?? [],
            },
          })
          .finally(() => tail.stop());
        got.answer = answer;
        session = answer.session ?? session;
        cost += answer.costUsd ?? 0;
        const after = head(site.repoDir);
        if (!after || after === before) {
          stuck++;
          throw new StepError(
            `The builder made no lift: “${answer.answer.said}”`,
            'The builder is asked for the lift again.',
          );
        }
        subject = git(site.repoDir, ['log', '-1', '--format=%s']);
        // Plain English for the blocks the lift changed, drafted beside the build, never holding it up.
        void explainLift(site, before!, after, env);
        const check = await checkLift(site, base!, env);
        got.check = check;
        was.last = check;
        lifts.push({ n, subject, ok: check.ok, problems: check.problems });
        if (!check.ok) {
          stuck = fixing ? stuck + 1 : 1;
          throw new StepError(
            `“${subject}”: ${check.problems.slice(0, 3).join(' ')}${check.problems.length > 3 ? ` And ${plural(check.problems.length - 3, 'more problem')}.` : ''}`,
            `The builder fixes ${check.problems.length === 1 ? 'this' : 'these'} in the next lift.`,
          );
        }
        stuck = 0;
        const sent = await pushIfOnGitHub(withDb, site, env);
        return `“${subject}”: ${answer.answer.said} ${checkedSentence(check)}${sent}${answer.answer.next ? ` Next: ${answer.answer.next}` : ''}`;
      },
      'The builder is asked for the lift again.',
    );
    if (job && cost) job.about = `builder cost so far: $${cost.toFixed(2)}`;
    if (stuck >= MAX_STUCK) {
      await step('Stopped', () => {
        throw new StepError(
          `The build stopped: ${plural(stuck, 'lift')} in a row did not get past the checks.`,
          'The trainer reads the grey flags above, then presses Start build again.',
        );
      });
      return;
    }
    if (got.answer?.answer.done && got.check && complete(got.check)) {
      const done = got.check;
      await step(
        'Built',
        () =>
          `Built in ${plural(n, 'lift')}: ${done.figures.traced} of ${plural(done.figures.shown, 'figure')} traced, ${done.screens.verified} of ${plural(done.screens.of, 'screen')} Verified.`,
      );
      return;
    }
  }
  await step('Stopped', () => {
    throw new StepError(
      `The build stopped after ${plural(max, 'lift')} without being done: ${was.last?.notYet[0] ?? was.last?.problems[0] ?? 'the builder did not say it was done'}`,
      'The trainer reads the flags above, then presses Start build again.',
    );
  });
}

/** Sends the lift to the product's place on GitHub, when it has one; says so, or says why not. */
async function pushIfOnGitHub(
  withDb: <T>(fn: (db: Db) => Promise<T>) => Promise<T>,
  site: SiteLocation,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const remote = siteRecord(site.id, env)?.remote;
  if (!remote) return '';
  try {
    const token = await withDb((db) => readSecret(db, 'GITHUB_TOKEN', env));
    pushTo(site.repoDir, `${remote}.git`, token ?? null);
    return ' Sent to GitHub.';
  } catch (err) {
    return ` ${(err as Error).message}`;
  }
}

/**
 * Drafts the English for every block a lift changed (Stage 11): one drafter call per block not yet
 * explained, cached by hash. Without a drafter key nothing is drafted and the pane says "Not explained
 * yet"; a failure here never touches the build.
 */
export async function explainLift(
  site: SiteLocation,
  from: string,
  to: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ drafted: number; failed: string | null }> {
  let drafted = 0;
  let failed: string | null = null;
  try {
    const changed = git(site.repoDir, ['diff', '--name-only', '--diff-filter=AM', from, to])
      .split('\n')
      .filter((f) => /\.tsx?$/.test(f));
    const figures = productFigures(site.repoDir);
    for (const file of changed) {
      const source = git(site.repoDir, ['show', `${to}:${file}`]);
      const r = await explainFile(site, file, source, (b) => figuresOfBlock(file, b, figures), {
        env,
        createdBy: BUILD_COMPONENT,
      });
      drafted += r.drafted;
      if (r.failed) {
        failed = r.failed;
        break;
      }
    }
  } catch (err) {
    failed = (err as Error).message;
  }
  return { drafted, failed };
}
