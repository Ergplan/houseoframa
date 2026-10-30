// The trainer is called (Stage 13): the customer sits alone with the voice, and a person who writes code
// is called only when the builder cannot get past a grey flag by itself. A call is a line in
// work/.calls.jsonl, append-only: it is answered by a later line naming it, written when a build of that
// product starts again. The trainer's home lists the calls not yet answered; the film says one is open.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { workDir } from '@rama/blueprint/site';

export interface TrainerCall {
  id: string;
  siteId: string;
  at: string;
  /** What stopped the build, and what the trainer is asked to do. */
  sentence: string;
  next: string | null;
}

interface Answered {
  answers: string;
  at: string;
  by: string;
}

const file = (env: NodeJS.ProcessEnv) => path.join(workDir(env), '.calls.jsonl');

function lines(env: NodeJS.ProcessEnv): (TrainerCall | Answered)[] {
  const f = file(env);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as TrainerCall | Answered);
}

const add = (line: TrainerCall | Answered, env: NodeJS.ProcessEnv) => {
  mkdirSync(path.dirname(file(env)), { recursive: true });
  appendFileSync(file(env), `${JSON.stringify(line)}\n`);
};

export function callTrainer(
  siteId: string,
  sentence: string,
  next: string | null,
  env: NodeJS.ProcessEnv = process.env,
  now: () => Date = () => new Date(),
): TrainerCall {
  const c: TrainerCall = { id: randomUUID(), siteId, at: now().toISOString(), sentence, next };
  add(c, env);
  return c;
}

/** The calls no line has answered yet, oldest first; for one product when a site is given. */
export function openCalls(
  siteId: string | null,
  env: NodeJS.ProcessEnv = process.env,
): TrainerCall[] {
  const all = lines(env);
  const answered = new Set(all.flatMap((l) => ('answers' in l ? [l.answers] : [])));
  return all.filter(
    (l): l is TrainerCall =>
      'siteId' in l && !answered.has(l.id) && (siteId === null || l.siteId === siteId),
  );
}

/** Answers every open call of a product: a build of it is starting again. */
export function answerCalls(
  siteId: string,
  by: string,
  env: NodeJS.ProcessEnv = process.env,
  now: () => Date = () => new Date(),
): number {
  const open = openCalls(siteId, env);
  for (const c of open) add({ answers: c.id, at: now().toISOString(), by }, env);
  return open.length;
}
