// A rehearsal (Stage 10): the sample product, made new, its cards drafted by the trainer and left open,
// so that acts 1 to 3 run by voice: the brains asked, each card read and decided by a spoken yes, the
// design explained aloud, and "Yes, build it" as the first signature. Nothing of it is decided here.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createProductSite, workDir, type SiteLocation } from '@rama/blueprint/site';
import { decide } from '@rama/ceremony';
import { sites, type Db, type Member } from '@rama/db';
import { SAMPLE_CARDS, SAMPLE_IDEA } from '@rama/workbench';

export const REHEARSAL_NAME = 'Chai Stall (rehearsal)';

function nextRehearsalId(env: NodeJS.ProcessEnv): string {
  let n = 0;
  try {
    for (const d of readdirSync(workDir(env))) {
      const m = /^rehearsal-(\d+)$/.exec(d);
      if (m) n = Math.max(n, Number(m[1]));
    }
  } catch {
    // no work dir yet
  }
  return `rehearsal-${n + 1}`;
}

/** Makes a rehearsal product owned by the trainer, with the sample's cards drafted open, in order. */
export async function newRehearsal(
  db: Db,
  trainer: Member,
  env: NodeJS.ProcessEnv = process.env,
  now: () => Date = () => new Date(),
): Promise<SiteLocation> {
  const id = nextRehearsalId(env);
  const site = createProductSite({ id, name: REHEARSAL_NAME, idea: SAMPLE_IDEA, env }, (repoDir) =>
    execFileSync('git', ['-C', repoDir, 'init', '--quiet', '--initial-branch=main']),
  );
  await db.insert(sites).values({
    siteId: id,
    name: REHEARSAL_NAME,
    repo: id,
    memberId: trainer.id,
    createdBy: trainer.id,
  });
  for (const c of SAMPLE_CARDS)
    await decide(
      db,
      { id, repoDir: site.repoDir },
      {
        ...c,
        bricks: [],
        status: 'open',
        by: trainer.name,
        at: now(),
        createdBy: trainer.id,
      },
    );
  return site;
}
