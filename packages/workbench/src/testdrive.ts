// Test drive (rule 16): the whole loop on the built-in sample product, with no voice, no camera and no
// keys needed, reported as pass or fail in words with timings. Each run makes the sample afresh as its
// own product (testdrive-<n>) from its decision cards, and the builder builds it on the house stack
// through the build loop (Stage 9), as any product is built: the real builder when it can run here, the
// recording of a real build when it cannot. Its records are append-only, so a run never reuses
// another's, and an earlier run's checkout is kept, signature journal and all (Invariant 3).
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createProductSite,
  workDir,
  writeSiteBlueprint,
  type SiteLocation,
} from '@rama/blueprint/site';
import { appSealer, decide, listDecisions, sign, walkthrough } from '@rama/ceremony';
import { ensurePerson, readSecret, sites, type Db } from '@rama/db';
import { readCapture, showroomOf } from '@rama/trace';
import { callAudit, runTests } from './actions.ts';
import { build } from './build.ts';
import {
  builderFor,
  claudeCodeHere,
  type BuilderDriver,
  type BuilderId,
} from './builders/index.ts';
import { seatProblems, vendorEntry } from '@rama/model';
import { seatsOf } from './seats.ts';
import { startJob, StepError, type StartedJob } from './jobs.ts';
import { SAMPLE_CARDS, SAMPLE_IDEA, SAMPLE_NAME, sampleRecording } from './sample.ts';
import { siteStates } from './states.ts';

export const TEST_DRIVE_PERSON = 'Test drive';
export const TEST_DRIVE_COMPONENT = 'rama:workbench-testdrive@0.2.0';

/** The next run's site id. Earlier runs are kept: their journals are append-only records too. */
function nextSiteId(env: NodeJS.ProcessEnv): string {
  let n = 0;
  try {
    for (const d of readdirSync(workDir(env))) {
      const m = /^testdrive-(\d+)$/.exec(d);
      if (m) n = Math.max(n, Number(m[1]));
    }
  } catch {
    // no work dir yet
  }
  return `testdrive-${n + 1}`;
}

/**
 * The builder Test drive uses: the builder seat's (Settings → Brains, else the setup file) when it is
 * wired, has its key and can run on this computer; else the recording of a real build, which needs no
 * key (rule 16). RAMA_TESTDRIVE_BUILDER=recorded asks for the recording (the watcher and CI, which never
 * call a vendor).
 */
export async function testDriveBuilder(
  withDb: <T>(fn: (db: Db) => Promise<T>) => Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ driver: BuilderDriver; why: string }> {
  const recording = (why: string) => ({
    driver: builderFor('recorded', { recording: sampleRecording(env) }),
    why,
  });
  if (env.RAMA_TESTDRIVE_BUILDER === 'recorded')
    return recording('the recorded lifts were asked for');
  const { seats } = await withDb((db) => seatsOf(db, null, env));
  const problems = seatProblems(seats);
  if (problems.length) return recording(`the brains cannot build: ${problems[0]}`);
  const seat = seats.builder!;
  const driver = builderFor(seat.builder as BuilderId, { model: seat.model, env });
  if (!driver.wired) return recording(`${driver.label} is not wired as a builder yet`);
  const keyName = vendorEntry(seat.vendor)?.key;
  const key = keyName ? await withDb((db) => readSecret(db, keyName, env)) : 'none needed';
  if (!key) return recording(`no ${vendorEntry(seat.vendor)?.label ?? seat.vendor} key is set`);
  if (seat.builder === 'claude-code' && !claudeCodeHere(env))
    return recording('Claude Code is not on this computer');
  return { driver, why: `${driver.label} builds it now, on ${seat.model}` };
}

/** Starts a Test drive as a job; `db` is opened by the caller for the job's whole run. */
export function startTestDrive(
  withDb: <T>(fn: (db: Db) => Promise<T>) => Promise<T>,
  person: string,
  env: NodeJS.ProcessEnv = process.env,
): StartedJob {
  return startJob(
    { kind: 'testdrive', siteId: null, person },
    (step, job) => testDrive(withDb, step, env, (id) => (job.about = id)),
    env,
  );
}

export async function testDrive(
  withDb: <T>(fn: (db: Db) => Promise<T>) => Promise<T>,
  step: Parameters<Parameters<typeof startJob>[1]>[0],
  env: NodeJS.ProcessEnv = process.env,
  made: (siteId: string) => void = () => {},
): Promise<void> {
  let site!: SiteLocation;
  const at = () => new Date();
  const driver = await withDb((db) =>
    ensurePerson(db, { name: TEST_DRIVE_PERSON, role: 'customer' }, TEST_DRIVE_COMPONENT),
  );

  await step('Idea', async () => {
    const id = nextSiteId(env);
    made(id);
    site = createProductSite({ id, name: SAMPLE_NAME, idea: SAMPLE_IDEA, env }, (repoDir) => {
      execFileSync('git', ['-C', repoDir, 'init', '--quiet', '--initial-branch=main']);
    });
    await withDb(async (db) => {
      await db.insert(sites).values({
        siteId: id,
        name: SAMPLE_NAME,
        repo: id,
        memberId: driver.id,
        createdBy: TEST_DRIVE_COMPONENT,
      });
      const ref = { id, repoDir: site.repoDir };
      for (const c of SAMPLE_CARDS) {
        const card = await decide(db, ref, {
          ...c,
          bricks: [],
          status: 'open',
          by: TEST_DRIVE_PERSON,
          at: at(),
          createdBy: driver.id,
        });
        // The recorded yes: each card is decided only now, by name.
        await decide(db, ref, {
          ...c,
          bricks: [],
          status: 'decided',
          by: TEST_DRIVE_PERSON,
          at: at(),
          supersedes: card.id,
          createdBy: driver.id,
        });
      }
      const cards = await listDecisions(db, id);
      if (cards.filter((d) => d.status === 'decided').length !== SAMPLE_CARDS.length)
        throw new StepError('The cards were not all decided by the yes.');
    });
    return `The idea is on ${SAMPLE_CARDS.length} cards, each decided by a recorded yes from “${TEST_DRIVE_PERSON}”.`;
  });

  let builder!: BuilderDriver;
  await step('Builder', async () => {
    const chosen = await testDriveBuilder(withDb, env);
    builder = chosen.driver;
    return `${builder.label} builds the stall: ${chosen.why}.`;
  });
  await build(withDb, step, site, {
    driver: builder,
    person: TEST_DRIVE_PERSON,
    createdBy: driver.id,
    env,
  });

  await step('Street', () => {
    const bp = writeSiteBlueprint(site);
    if (bp.screens.length !== 3)
      throw new StepError(`The stall should have 3 screens; it has ${bp.screens.length}.`);
    const named = (
      JSON.parse(readFileSync(path.join(site.repoDir, '.rama/features.json'), 'utf8')) as {
        features: { name: string }[];
      }
    ).features.map((f) => f.name);
    const want = SAMPLE_CARDS.flatMap((c) => /^Building: (.+)$/.exec(c.title)?.[1] ?? []);
    const missing = want.filter((w) => !named.includes(w));
    if (missing.length)
      throw new StepError(`The Street does not name ${missing.map((m) => `“${m}”`).join(', ')}.`);
    return `The Street has ${named.length} buildings, named as the cards name them: ${named.map((n) => `“${n}”`).join(', ')}.`;
  });

  await step('Traced', () => {
    const c = readCapture(site.id, env)!;
    const bp = writeSiteBlueprint(site);
    const shown = c.screens.flatMap((s) => s.figures);
    const untraced = shown.filter((f) => !c.mappings[f.id]).length;
    const trails = Object.values(showroomOf(c, bp).trails);
    const wrong = trails.filter((t) => t.result?.matches !== true).length;
    if (c.commit !== bp.commit)
      throw new StepError('The screens were not photographed after the last lift.');
    if (untraced)
      throw new StepError(
        `${untraced} figure${untraced === 1 ? ' is' : 's are'} untraced on the stall.`,
      );
    if (wrong)
      throw new StepError(
        `${wrong} figure${wrong === 1 ? '' : 's'} did not come out the same when worked out again by the product’s own code.`,
      );
    const st = siteStates(site, bp, env);
    const unverified = st.screens.filter((s) => !s.state.verified);
    if (unverified.length)
      throw new StepError(
        `${unverified.map((s) => s.route).join(', ')} not Verified after the build.`,
      );
    return `${shown.length} of ${shown.length} figures traced and worked out again the same; all ${st.screens.length} screens Verified before anyone signs.`;
  });

  await step('Tests', () => runTests(site, env));

  await step('Walkthrough', async () => {
    const c = readCapture(site.id, env)!;
    const customer = c.screens.filter((s) => s.audience === 'customer' && s.blueprintScreen);
    await withDb(async (db) => {
      const script = walkthrough(
        showroomOf(c, writeSiteBlueprint(site)),
        [],
        [],
        TEST_DRIVE_PERSON,
      );
      for (const s of customer) {
        const line = script.find((w) => w.screenId === s.blueprintScreen);
        await sign(
          db,
          { id: site.id, repoDir: site.repoDir },
          {
            person: TEST_DRIVE_PERSON,
            personId: driver.id,
            target: { kind: 'screen', id: s.blueprintScreen!, commit: c.commit },
            statement: line?.statement ?? `I have seen ${s.title} and it is right.`,
            at: at(),
            sealer: appSealer(env),
          },
        );
      }
    });
    return `“Test drive” walked and signed ${customer.length} customer screens; the staff screen is left to its tests.`;
  });

  await step('Three states', () => {
    const st = siteStates(site, writeSiteBlueprint(site), env);
    const by = Object.fromEntries(st.screens.map((s) => [s.route, s.state.state]));
    const want = { '/': 'Confirmed', '/new': 'Confirmed', '/total': 'Verified' };
    for (const [route, state] of Object.entries(want))
      if (by[route] !== state)
        throw new StepError(
          `The screen ${route} should be ${state}; it is ${by[route] ?? 'missing'}.`,
        );
    return `${st.tally.Confirmed} Confirmed, ${st.tally.Verified} Verified, ${st.tally.Unverified} Unverified; ${st.counts.map((c) => c.sentence).join('; ')}.`;
  });

  await step('Audit', () => withDb((db) => callAudit(db, site, { standIn: true, env })));
}

/** Whether a site is a Test drive's sample product. */
export const isTestDriveSite = (id: string) => /^testdrive-\d+$/.test(id);

/** The latest Test drive's site id among these, for the home page to list that run only. */
export const latestTestDrive = (ids: string[]): string | null =>
  ids
    .filter(isTestDriveSite)
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))[0] ?? null;
