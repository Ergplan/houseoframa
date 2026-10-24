// Test drive (rule 16): the whole loop on the built-in sample product, with no voice, no camera and no
// keys needed, reported as pass or fail in words with timings. Each run builds the sample afresh as its
// own product (testdrive-<n>): its records are append-only, so a run never reuses another's.
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  createProductSite,
  listSites,
  workDir,
  writeSiteBlueprint,
  type SiteLocation,
} from '@rama/blueprint/site';
import { appSealer, decide, listDecisions, sign, walkthrough } from '@rama/ceremony';
import { ensurePerson, homeDir, sites, type Db } from '@rama/db';
import { readCapture, showroomOf } from '@rama/trace';
import { callAudit, photograph, runTests } from './actions.ts';
import { startJob, StepError, type StartedJob } from './jobs.ts';
import { siteStates } from './states.ts';

export const TEST_DRIVE_PERSON = 'Test drive';
export const TEST_DRIVE_COMPONENT = 'rama:workbench-testdrive@0.1.0';
const SAMPLE_NAME = 'Chai Stall (Test drive)';
const SAMPLE_IDEA = 'A chai stall takes orders through the day and sees the day’s takings and GST.';

/** The next run's site id; earlier runs' checkouts are cleared (their records stay in Postgres). */
function nextSiteId(env: NodeJS.ProcessEnv): string {
  const root = workDir(env);
  let n = 0;
  try {
    for (const d of readdirSync(root)) {
      const m = /^testdrive-(\d+)$/.exec(d);
      if (m) {
        n = Math.max(n, Number(m[1]));
        rmSync(path.join(root, d), { recursive: true, force: true });
      }
    }
  } catch {
    // no work dir yet
  }
  return `testdrive-${n + 1}`;
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
      rmSync(repoDir, { recursive: true, force: true });
      execFileSync('node', [path.join(homeDir(env), 'scripts/make-sample.mjs'), repoDir], {
        stdio: 'ignore',
      });
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
      const card = await decide(db, ref, {
        title: 'Build the chai stall',
        statement: SAMPLE_IDEA,
        bricks: [],
        status: 'open',
        by: TEST_DRIVE_PERSON,
        at: at(),
        createdBy: driver.id,
      });
      // The recorded yes: the card is decided only now, by name.
      await decide(db, ref, {
        title: card.title,
        statement: card.statement,
        bricks: [],
        status: 'decided',
        by: TEST_DRIVE_PERSON,
        at: at(),
        supersedes: card.id,
        createdBy: driver.id,
      });
      const cards = await listDecisions(db, id);
      if (cards.at(-1)?.status !== 'decided')
        throw new StepError('The first card was not decided by the yes.');
    });
    return 'The idea is on its first card, decided by a recorded yes from “Test drive”.';
  });

  await step('Street', () => {
    const bp = writeSiteBlueprint(site);
    if (bp.screens.length !== 3)
      throw new StepError(`The sample should have 3 screens; it has ${bp.screens.length}.`);
    return `The product is drawn from its history: ${bp.screens.length} screens, ${bp.nodes.length} files, ${bp.commits.length} rounds of building work.`;
  });

  await step('Build', async () => {
    const said = await photograph(site, env);
    const c = readCapture(site.id, env)!;
    const shown = c.screens.flatMap((s) => s.figures);
    const untraced = shown.filter((f) => !c.mappings[f.id]).length;
    const trails = Object.values(showroomOf(c, writeSiteBlueprint(site)).trails);
    const wrong = trails.filter((t) => t.result?.matches !== true).length;
    if (untraced)
      throw new StepError(
        `${untraced} figure${untraced === 1 ? ' is' : 's are'} untraced on the sample.`,
      );
    if (wrong)
      throw new StepError(
        `${wrong} figure${wrong === 1 ? '' : 's'} did not come out the same when re-computed by the product’s own code.`,
      );
    return said;
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

/** Test drive sites, newest first: for the home page to tell a run's product from a real one. */
export const isTestDriveSite = (id: string) => /^testdrive-\d+$/.test(id);
export const testDriveSites = (env: NodeJS.ProcessEnv = process.env) =>
  listSites(env).filter((s) => isTestDriveSite(s.id));
