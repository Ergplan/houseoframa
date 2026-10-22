// Rama's next question in a discovery session, drafted through packages/model (prompt discovery.v1,
// builder vendor). It is stored as a draft turn: a suggestion the member may ask or ignore, never a
// decision (Invariant 6). Decision cards are written only when a person confirms them.
import { z } from 'zod';
import { call as modelCall } from '@rama/model';
import type { Decision } from '@rama/shared';

export const DISCOVERY_COMPONENT = 'rama:ceremony-discovery@0.1.0';
const Question = z.object({ question: z.string().min(3).max(400) });

export async function draftQuestion(
  input: { site: string; turns: { speaker: string; text: string }[]; decisions: Decision[] },
  opts: { siteId: string; call?: typeof modelCall },
): Promise<string> {
  const call = opts.call ?? modelCall;
  const res = await call({
    name: 'discovery',
    version: 1,
    input: {
      site: input.site,
      turns: input.turns.slice(-30).map((t) => ({ speaker: t.speaker, text: t.text })),
      decisions: input.decisions.map((d) => ({
        title: d.title,
        statement: d.statement,
        status: d.status,
      })),
    },
    output: Question,
    role: 'builder',
    siteId: opts.siteId,
    createdBy: DISCOVERY_COMPONENT,
    maxTokens: 2000,
  });
  return res.output.question.trim();
}
