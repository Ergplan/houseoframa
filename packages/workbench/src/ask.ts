// Ask the code (Stage 13): a person selects a piece of a product's code and asks it a question, typed or
// spoken. The Explainer (the drafter seat) answers from that piece alone — its lines, its file's name,
// the plan step it serves and the figures it works out — and names the lines it rests on; a question
// the code does not answer gets "The code does not say." The answer is an explanation, shown as one: it
// is never a record and changes none (Invariants 6 and 9). Each question and answer is kept as a turn
// of the site's transcript, so a trainer can see what the customer asked.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { call } from '@rama/model';
import { workDir, type SiteLocation } from '@rama/blueprint/site';
import { bannedWords } from './explain.ts';

export const ASK_COMPONENT = 'rama:workbench-ask@0.1.0';
export const MAX_ASK_LINES = 120;
export const MAX_QUESTION = 400;

const Answer = z.object({
  answer: z.string().min(1).max(1200),
  lines: z.array(z.number().int()).max(60),
  said: z.boolean(),
});

export interface AskCodeInput {
  file: string;
  plain: string | null;
  source: string;
  from: number;
  to: number;
  step: string | null;
  figures: { title: string; what: string }[];
  question: string;
  person: string;
}

export interface AskedTurn {
  at: string;
  person: string;
  file: string;
  from: number;
  to: number;
  question: string;
  answer: string;
  lines: number[];
  said: boolean;
  vendor: string | null;
  model: string | null;
}

export class AskError extends Error {
  override name = 'AskError';
}

export const askFile = (siteId: string, env: NodeJS.ProcessEnv = process.env) =>
  path.join(workDir(env), siteId, 'asked.jsonl');

export function askedTurns(siteId: string, env: NodeJS.ProcessEnv = process.env): AskedTurn[] {
  const f = askFile(siteId, env);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as AskedTurn);
}

/** The selected lines, numbered, at most MAX_ASK_LINES of them. */
export function selection(
  source: string,
  from: number,
  to: number,
): { line: number; text: string }[] {
  const lines = source.split('\n');
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 1 ||
    to < from ||
    from > lines.length
  )
    throw new AskError('Choose the lines to ask about: the first and last line of the piece.');
  const last = Math.min(to, lines.length, from + MAX_ASK_LINES - 1);
  return lines.slice(from - 1, last).map((text, i) => ({ line: from + i, text }));
}

export async function askCode(
  site: SiteLocation,
  input: AskCodeInput,
  opts: { env?: NodeJS.ProcessEnv; call?: typeof call; now?: () => Date } = {},
): Promise<AskedTurn> {
  const env = opts.env ?? process.env;
  const question = input.question.trim();
  if (!question) throw new AskError('Say or type a question first.');
  if (question.length > MAX_QUESTION) throw new AskError('Ask one shorter question at a time.');
  const code = selection(input.source, input.from, input.to);
  const res = await (opts.call ?? call)(
    {
      name: 'ask',
      version: 1,
      input: {
        file: input.file,
        plain: input.plain,
        code,
        step: input.step,
        figures: input.figures,
        question,
      },
      output: Answer,
      role: 'drafter',
      siteId: site.id,
      createdBy: ASK_COMPONENT,
      maxTokens: 800,
    },
    { env },
  );
  const asked = new Set(code.map((c) => c.line));
  const banned = bannedWords(res.output.answer, env);
  const turn: AskedTurn = {
    at: (opts.now ?? (() => new Date()))().toISOString(),
    person: input.person,
    file: input.file,
    from: code[0]!.line,
    to: code.at(-1)!.line,
    question,
    // An answer in developer words is not shown as it came: the person is told so instead.
    answer: banned.length
      ? 'The Explainer answered in words this room does not use, so its answer is not shown. Ask again, or ask the trainer.'
      : res.output.answer.trim(),
    // Only lines that were in the piece are named.
    lines: [...new Set(res.output.lines.filter((l) => asked.has(l)))].sort((a, b) => a - b),
    said: res.output.said && !banned.length,
    vendor: res.vendor,
    model: res.model,
  };
  mkdirSync(path.dirname(askFile(site.id, env)), { recursive: true });
  appendFileSync(askFile(site.id, env), `${JSON.stringify(turn)}\n`);
  return turn;
}
