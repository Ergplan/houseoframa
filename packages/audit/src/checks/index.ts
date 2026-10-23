// Every check of MASTER-PROMPT §7.3 over one site at one commit. Plain code, no model (Invariant 6).
import type { Blueprint, Decision, Signoff } from '@rama/shared';
import { isCode } from '@rama/blueprint/metrics';
import { sortFindings, type CheckFinding, type CheckResults, type CheckRun } from '../findings.ts';
import { sourceReader, type ReadSource } from '../source.ts';
import { openDecisions, unconfirmedGlossary, unsignedChanges } from './ceremony.ts';
import { runChecks, type RunOptions } from './run.ts';
import { longUnauthRoute, staticChecks } from './static.ts';

export interface CheckContext {
  repoDir: string;
  bp: Blueprint;
  signoffs: Signoff[];
  decisions: Decision[];
  /** Files that hold a traced figure's formula (from the site's capture), for magic-constant-in-formula. */
  formulaFiles: string[];
  run?: RunOptions | false;
  read?: ReadSource;
}

const STATIC = [
  'silenced-lint',
  'swallowed-error',
  'any-type',
  'magic-constant-in-formula',
  'browser-storage-write',
  'env-fallback',
  'long-unauth-route',
  'positional-assumption',
] as const;

export function auditChecks(ctx: CheckContext): CheckResults {
  const { bp } = ctx;
  const read = ctx.read ?? sourceReader(ctx.repoDir, bp);
  const findings: CheckFinding[] = [];
  const runs: CheckRun[] = [];
  const formula = new Set(ctx.formulaFiles);
  const code = bp.nodes.filter((n) => isCode(n.path) && !n.test);
  for (const n of code) {
    const src = read(n.path);
    if (src === null) continue;
    for (const f of [
      ...staticChecks(n.path, src, { formula: formula.has(n.path) }),
      ...longUnauthRoute(n.path, src),
    ]) {
      findings.push({ ...f, brick: n.path });
    }
  }
  for (const check of STATIC) {
    runs.push({
      check,
      ran: true,
      detail:
        check === 'magic-constant-in-formula'
          ? formula.size
            ? `${formula.size} formula file${formula.size === 1 ? '' : 's'}: ${[...formula].join(', ')}`
            : 'no traced formula on this site, so no formula file to read'
          : `${code.length} code bricks (tests left out)`,
    });
  }
  if (ctx.run === false) {
    for (const check of ['typecheck', 'build', 'test-coverage-per-brick'] as const)
      runs.push({ check, ran: false, detail: 'not run: checks without running the target' });
  } else {
    const r = runChecks(ctx.repoDir, bp, ctx.run ?? {});
    runs.push(...r.runs);
    findings.push(...r.findings);
  }
  findings.push(...unsignedChanges(ctx.repoDir, bp, ctx.signoffs));
  runs.push({
    check: 'unsigned-change',
    ran: true,
    detail: `${bp.screens.length} screens against their signatures`,
  });
  findings.push(...unconfirmedGlossary(bp));
  runs.push({
    check: 'unconfirmed-glossary',
    ran: true,
    detail: `${bp.edges.length} import edges`,
  });
  findings.push(...openDecisions(bp, ctx.decisions));
  runs.push({
    check: 'open-decision',
    ran: true,
    detail: `${ctx.decisions.length} decision records`,
  });
  const order = (c: string) =>
    [
      'typecheck',
      'build',
      'test-coverage-per-brick',
      ...STATIC,
      'unsigned-change',
      'unconfirmed-glossary',
      'open-decision',
    ].indexOf(c);
  return {
    commit: bp.commit,
    runs: runs.sort((a, b) => order(a.check) - order(b.check)),
    findings: sortFindings(findings),
  };
}
