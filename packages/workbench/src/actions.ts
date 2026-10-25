// What the buttons on a site do (rule 15), each as job steps that end in a plain sentence: refresh the
// picture, photograph the screens, run the tests, call the audit. Each used to be a command an engineer
// typed; the CLI keeps them for engineers and CI.
import { execFileSync } from 'node:child_process';
import { runAudit } from '@rama/audit';
import { siteRecord, writeSiteBlueprint, type SiteLocation } from '@rama/blueprint/site';
import { modelCalls, readSecret, type Db } from '@rama/db';
import { BUILDER_VENDOR, seatProblems, vendorEntry, type CallResult } from '@rama/model';
import { capture, captureDir, readCapture } from '@rama/trace';
import { StepError } from './jobs.ts';
import { linkHouseModules } from './modules.ts';
import { builderLabel, builtByProblems, seatsOf } from './seats.ts';
import { runSiteTests } from './tests.ts';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Brings the site's picture up to date: an outside site fetches its latest history first. */
export function refreshSite(site: SiteLocation, env: NodeJS.ProcessEnv = process.env): string {
  if (site.id === 'self')
    throw new StepError(
      'House of Rama’s own picture is redrawn by its builder with every change, not from here.',
    );
  if (site.kind !== 'product' && siteRecord(site.id, env)?.source.match(/^(https?|git|ssh):|@/)) {
    try {
      execFileSync('git', ['-C', site.repoDir, 'pull', '--ff-only', '--quiet'], {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        timeout: 120_000,
      });
    } catch {
      throw new StepError(
        'Could not fetch the latest history of this site.',
        'Check the internet connection, or that the site is still where it was added from.',
      );
    }
  }
  const bp = writeSiteBlueprint(site);
  const last = bp.commits.at(-1);
  return `The picture is up to date: ${plural(bp.screens.length, 'screen')}, ${plural(bp.nodes.length, 'file')}${
    last ? `, last changed ${last.at.slice(0, 10)} (“${last.subject}”)` : ''
  }.`;
}

/** Builds the product, photographs each screen, finds every figure and re-computes the traced ones. */
export async function photograph(
  site: SiteLocation,
  env: NodeJS.ProcessEnv = process.env,
  log: (s: string) => void = () => {},
): Promise<string> {
  const bp = writeSiteBlueprint(site);
  linkHouseModules(site.repoDir);
  let c;
  try {
    c = await capture(site, bp, { outDir: captureDir(site.id, env), log });
  } catch (err) {
    const why = (err as Error).message;
    if (/screens\.json/.test(why))
      throw new StepError(
        'This product does not say yet which screens to photograph.',
        'The builder adds the list of screens to the product.',
      );
    throw new StepError(
      `The product could not be built and photographed: ${why.split('\n')[0]!.slice(0, 300)}`,
      'The builder looks at why the product does not build.',
    );
  }
  const shown = c.screens.flatMap((s) => s.figures);
  const traced = shown.filter((f) => c.mappings[f.id]);
  const runs = Object.values(c.runs);
  const agree = runs.filter((r) => r.ok).length;
  return `${plural(c.screens.length, 'screen')} photographed; ${traced.length} of ${plural(shown.length, 'figure')} traced; ${agree} of ${runs.length} re-computed by the product’s own code.`;
}

/** Runs the product's tests; fails the step when any test file fails. */
export function runTests(site: SiteLocation, env: NodeJS.ProcessEnv = process.env): string {
  let run;
  try {
    run = runSiteTests(site, env);
  } catch (err) {
    throw new StepError((err as Error).message, 'The builder adds tests to the product.');
  }
  const total = run.passing.length + run.failing.length;
  if (run.failing.length)
    throw new StepError(
      `${run.failing.length} of ${plural(total, 'test file')} failed: ${run.failing.join(', ')}.`,
      'The builder fixes what the failing tests found.',
    );
  return `${run.passing.length} of ${plural(total, 'test file')} passed.`;
}

/** The auditor's stand-in when no OpenAI key is set (Test drive only): it adds nothing to the checks. */
export function standInAuditor(db: Db) {
  return async function standIn(req: {
    name: string;
    version: number;
    input: unknown;
    siteId: string;
    createdBy: string;
  }): Promise<CallResult<never>> {
    const output = {
      narration: [
        {
          part: 'verdict',
          text: 'Test drive: no auditor key is set, so a stand-in passed the checks on as they are. No second opinion was given.',
        },
      ],
      alterations: [],
      timeMachine: [],
      verdictChanges: [],
    };
    const [row] = await db
      .insert(modelCalls)
      .values({
        siteId: req.siteId,
        prompt: req.name,
        promptVersion: req.version,
        promptHash: 'stand-in',
        role: 'auditor',
        vendor: 'stand-in',
        model: 'test drive, no auditor key',
        input: req.input as object,
        output,
        status: 'ok',
        attempts: 1,
        ms: 0,
        createdBy: req.createdBy,
      })
      .returning({ id: modelCalls.id });
    return {
      output: output as never,
      callId: row!.id,
      vendor: 'stand-in' as never,
      model: 'test drive, no auditor key',
      attempts: 1,
      inputTokens: null,
      outputTokens: null,
    };
  };
}

/**
 * Calls the audit: the checks, then the auditor seat (a different company from the builder). Without
 * the auditor's key it is refused, unless `standIn` (Test drive) lets the stand-in pass the checks on.
 */
export async function callAudit(
  db: Db,
  site: SiteLocation,
  opts: { standIn?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  const env = opts.env ?? process.env;
  const { seats } = await seatsOf(db, site.id, env);
  const auditor = seats.auditor ? vendorEntry(seats.auditor.vendor) : undefined;
  // The seats as they are now, and the builders that actually built it: neither's company audits.
  const problems = [
    ...seatProblems(seats),
    ...builtByProblems(site.id, seats.auditor?.vendor, env),
  ];
  if (problems.length && !opts.standIn)
    throw new StepError(problems.join(' '), 'Choose the brains again in Settings → Brains.');
  const key = auditor?.key
    ? await readSecret(db, auditor.key, env)
    : auditor
      ? 'none needed'
      : undefined;
  const ready = Boolean(key) && problems.length === 0;
  if (!ready && !opts.standIn)
    throw new StepError(
      `The audit needs the ${auditor?.label ?? 'auditor'} key: the auditor must be a different company from the builder.`,
      `Enter the ${auditor?.label ?? 'auditor'} key in Settings, then call the audit again.`,
    );
  const bp = writeSiteBlueprint(site);
  const formulaFiles = [
    ...new Set(Object.values(readCapture(site.id, env)?.mappings ?? {}).map((m) => m.file)),
  ].sort();
  const builtBy = siteRecord(site.id, env)?.builder;
  const builderVendor = builtBy ? BUILDER_VENDOR[builtBy] : undefined;
  const { report, body } = await runAudit(db, {
    siteId: site.id,
    name: site.name,
    repoDir: site.repoDir,
    bp,
    formulaFiles,
    run: {},
    builtByVendors: [
      ...new Set((siteRecord(site.id, env)?.builtBy ?? []).flatMap((b) => BUILDER_VENDOR[b] ?? [])),
    ],
    builder:
      builtBy && builderVendor
        ? {
            label: builderLabel(builtBy),
            vendor: vendorEntry(builderVendor)?.label ?? builderVendor,
            vendorId: builderVendor,
          }
        : null,
    ...(ready ? {} : { call: standInAuditor(db) as never }),
  });
  const by = ready ? `signed by ${report.vendor}` : 'passed on by a stand-in (no auditor key)';
  return `${plural(body.counts.defects, 'defect')}, ${plural(body.counts.notes, 'note')}, ${plural(body.counts.passes, 'clean file')}; ${by}.`;
}
