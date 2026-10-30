// Ask the code (Stage 13): POST ask {path, commit?, from, to, question} answers a question about the
// selected lines of a product file, from those lines alone, naming the lines it rests on; GET ask gives
// the questions asked so far. The answer is an explanation, never a record (Invariants 6 and 9).
import { z } from 'zod';
import type { SiteLocation } from '@rama/blueprint/site';
import type { Member } from '@rama/db';
import { AskError, MAX_QUESTION, type AskCodeInput, type AskedTurn } from '@rama/workbench';

export interface AskDeps {
  source: (site: SiteLocation, path: string, commit: string | undefined) => string | null;
  /** The file's plain-word name and the plan step it serves, when known. */
  about: (site: SiteLocation, path: string) => { plain: string | null; step: string | null };
  figures: (
    site: SiteLocation,
    path: string,
    from: number,
    to: number,
  ) => { title: string; what: string }[];
  ask: (site: SiteLocation, input: AskCodeInput) => Promise<AskedTurn>;
  turns: (siteId: string) => AskedTurn[];
}

const Body = z.object({
  path: z.string().min(1).max(300),
  commit: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/)
    .optional(),
  from: z.number().int().min(1),
  to: z.number().int().min(1),
  question: z.string().min(1).max(MAX_QUESTION),
});

const fail = (status: number, sentence: string) =>
  Response.json({ ok: false, sentence }, { status });

export async function handleAsk(site: SiteLocation, who: Member, raw: unknown, deps: AskDeps) {
  const body = Body.safeParse(raw);
  if (!body.success) return fail(400, 'expected {path, commit?, from, to, question}');
  const b = body.data;
  if (b.path.includes('..') || b.path.startsWith('/'))
    return fail(400, 'not a file of the product');
  const source = deps.source(site, b.path, b.commit);
  if (source === null) return fail(404, 'No such file.');
  const about = deps.about(site, b.path);
  try {
    const turn = await deps.ask(site, {
      file: b.path,
      plain: about.plain,
      source,
      from: b.from,
      to: b.to,
      step: about.step,
      figures: deps.figures(site, b.path, b.from, b.to),
      question: b.question,
      person: who.name,
    });
    return Response.json({ ok: true, turn });
  } catch (err) {
    if (err instanceof AskError) return fail(400, err.message);
    // No Explainer key, or the vendor failed: say so plainly; nothing is guessed in its place.
    return fail(
      503,
      `The Explainer could not answer: ${(err as Error).message.split('\n')[0]} A trainer sets the Explainer’s key in Settings.`,
    );
  }
}

export function handleAsked(site: SiteLocation, deps: AskDeps) {
  return Response.json({ ok: true, turns: deps.turns(site.id) });
}
