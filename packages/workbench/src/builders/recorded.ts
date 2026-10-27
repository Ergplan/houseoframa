// The recorded builder: the lifts a real builder made, replayed (Test drive without a builder key, and
// the tests). A recording is a folder holding `lifts.json`, which lists each lift's patch and the
// builder's answer, and the patches themselves (`git format-patch` of the real build). Each lift applies
// the next patch as the commit the builder made, with its author, message and time, and answers as the
// builder answered. Nothing is made up: what the recording does not hold, it does not do. Its
// `explanations/` are the drafter's sentences from the real build, kept by block hash.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { workDir } from '@rama/blueprint/site';
import path from 'node:path';
import { z } from 'zod';
import { LiftAnswer, type BuilderDriver } from './types.ts';

export const Recording = z.object({
  /** The real builder that made the lifts, and with which model. */
  builder: z.string().min(1),
  model: z.string().min(1),
  /** When, and what it cost then. */
  recordedAt: z.string().min(1),
  costUsd: z.number().nullable(),
  lifts: z.array(LiftAnswer.extend({ patch: z.string().regex(/^[\w.-]+\.patch$/) })).min(1),
});
export type Recording = z.infer<typeof Recording>;

export const readRecording = (dir: string): Recording =>
  Recording.parse(JSON.parse(readFileSync(path.join(dir, 'lifts.json'), 'utf8')));

export function recorded(dir: string): BuilderDriver {
  const rec = readRecording(dir);
  let next = 0;
  return {
    id: 'recorded',
    label: `${rec.builder} (recorded)`,
    wired: true,
    async lift(req) {
      const lift = rec.lifts[next];
      if (!lift)
        return {
          answer: { said: 'The recording holds no more lifts.', next: null, done: true },
          session: null,
          callId: null,
          costUsd: null,
        };
      next++;
      // The committer is the builder too, at the time it committed: the replayed lift is that commit.
      execFileSync(
        'git',
        [
          '-C',
          req.repoDir,
          'am',
          '--quiet',
          '--committer-date-is-author-date',
          path.join(dir, lift.patch),
        ],
        {
          stdio: 'pipe',
          env: {
            PATH: process.env.PATH ?? '',
            HOME: process.env.HOME ?? '',
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_COMMITTER_NAME: `${rec.builder} (builder)`,
            GIT_COMMITTER_EMAIL: 'builder@houseoframa.local',
          } as unknown as NodeJS.ProcessEnv,
        },
      );
      // The English the drafter wrote beside the real build's blocks, recorded with it (Stage 11): the
      // pane shows it as drafted and unconfirmed. Each lift brings the sentences drafted after it,
      // made at this lift's commit (the house stack's own lift's, at the first), so a replay shows
      // them from there on.
      const said = path.join(dir, 'explanations');
      if (existsSync(said)) {
        const into = path.join(workDir(), req.siteId, 'explain');
        mkdirSync(into, { recursive: true });
        const rev = (ref: string) =>
          execFileSync('git', ['-C', req.repoDir, 'rev-parse', ref], { encoding: 'utf8' }).trim();
        for (const f of readdirSync(said).filter((x) => x.endsWith('.json'))) {
          const d = JSON.parse(readFileSync(path.join(said, f), 'utf8')) as { lift?: number };
          const at =
            d.lift === next ? rev('HEAD') : d.lift === 0 && next === 1 ? rev('HEAD^') : null;
          if (at)
            writeFileSync(path.join(into, f), `${JSON.stringify({ ...d, commit: at }, null, 2)}\n`);
        }
      }
      const { patch: _patch, ...answer } = lift;
      void _patch;
      return { answer, session: null, callId: null, costUsd: null };
    },
  };
}
