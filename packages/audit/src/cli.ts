// rama-audit check <site> [--no-run]          the checks only: no model, nothing written
// rama-audit run <site> [--skip typecheck,build,test]   checks, the auditor's reading, the signed report
// rama-audit show <site>                       the latest report, and whether its hash still verifies
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractSite, locateSite } from '@rama/blueprint/site';
import { createDb } from '@rama/db';
import { readCapture } from '@rama/trace/showroom';
import { listDecisions, listSignoffs } from '@rama/ceremony';
import { auditChecks } from './checks/index.ts';
import { latestAudit, runAudit, verifyReport } from './report.ts';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const USAGE = `usage:
  rama-audit check <site> [--no-run]
  rama-audit run <site> [--skip typecheck,build,test]
  rama-audit show <site>`;
const flag = (argv: string[], name: string) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};

async function main(argv: string[]): Promise<number> {
  const [command, siteId] = argv;
  if (!command || !siteId) throw new Error(USAGE);
  const site = locateSite(siteId);
  if (!site) throw new Error(`no site "${siteId}"`);
  // The checkout as it is now, not the stored Blueprint, which may name an older commit: the scripts run
  // on the checkout, and the report must name what they ran on.
  const bp = extractSite(site);
  const formulaFiles = [
    ...new Set(Object.values(readCapture(site.id)?.mappings ?? {}).map((m) => m.file)),
  ].sort();
  const skip = (flag(argv, '--skip') ?? '').split(',').filter(Boolean) as (
    'typecheck' | 'build' | 'test'
  )[];
  const { db, close } = createDb();
  try {
    if (command === 'check') {
      const [signoffs, decisions] = await Promise.all([
        listSignoffs(db, site.id),
        listDecisions(db, site.id),
      ]);
      const r = auditChecks({
        repoDir: site.repoDir,
        bp,
        signoffs,
        decisions,
        formulaFiles,
        run: argv.includes('--no-run') ? false : { skip },
      });
      console.log(JSON.stringify(r, null, 2));
      const d = r.findings.filter((f) => f.verdict === 'defect').length;
      console.error(
        `${site.id} at ${bp.commit.slice(0, 7)}: ${d} defects, ${r.findings.length - d} notes; not run: ${
          r.runs
            .filter((x) => !x.ran)
            .map((x) => x.check)
            .join(', ') || 'none'
        }`,
      );
      return 0;
    }
    if (command === 'run') {
      const { report, body } = await runAudit(db, {
        siteId: site.id,
        name: site.name,
        repoDir: site.repoDir,
        bp,
        formulaFiles,
        run: { skip },
      });
      console.log(JSON.stringify(report, null, 2));
      console.error(
        `${site.id} at ${bp.commit.slice(0, 7)}: ${body.counts.defects} defects, ${body.counts.notes} notes, ${body.counts.passes} clean bricks; signed by ${report.vendor} ${report.model}`,
      );
      return 0;
    }
    if (command === 'show') {
      const a = await latestAudit(db, site.id);
      if (!a) {
        console.error(`no audit of "${site.id}" yet`);
        return 1;
      }
      const v = await verifyReport(db, a.report);
      console.log(
        JSON.stringify(
          { ...a.report, commit: a.commit, counts: a.body.counts, verified: v },
          null,
          2,
        ),
      );
      return v.ok ? 0 : 1;
    }
    throw new Error(USAGE);
  } finally {
    await close();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: Error) => {
    console.error(err.message);
    process.exit(2);
  },
);
