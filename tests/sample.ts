// The sample product (fixtures/sample-product, the Chai Stall) as a site for an end-to-end test: built
// from scripts/make-sample.mjs into a temporary work dir, added as a site, its packages linked from House
// of Rama's own, and photographed. It stands where EkBill stood before Stage 7, and runs in CI.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addSite, type SiteLocation } from '../packages/blueprint/src/site.ts';
import { capture, type Capture } from '../packages/trace/src/capture.ts';
import { captureDir } from '../packages/trace/src/showroom.ts';
import { linkHouseModules } from '../packages/workbench/src/modules.ts';
import type { Blueprint } from '@rama/shared';

const MAKE = fileURLToPath(new URL('../scripts/make-sample.mjs', import.meta.url));

export async function sampleSite(
  work: string,
  id: string,
  opts: { photograph?: boolean } = {},
): Promise<{ site: SiteLocation; blueprint: Blueprint; capture: Capture | null; source: string }> {
  const source = path.join(work, `${id}-source`);
  execFileSync('node', [MAKE, source]);
  const env = { ...process.env, RAMA_WORK_DIR: work };
  const { site, blueprint } = addSite(source, { id, name: 'Chai Stall', env });
  linkHouseModules(site.repoDir);
  const c =
    opts.photograph === false
      ? null
      : await capture(site, blueprint, { outDir: captureDir(id, env) });
  return { site, blueprint, capture: c, source };
}
