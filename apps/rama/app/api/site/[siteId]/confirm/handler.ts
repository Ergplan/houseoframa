// The local member confirms a drafted phrase (a dependency edge) or a brick's drafted purpose. The
// confirmation is written to the target's own `.rama/` overlay in its checkout (Invariant 1), the
// site's Blueprint is regenerated from it, and the write is appended to audit_log with the person
// (Invariant 8). No auth until Stage 6 (rule 11): the person is the single local member.
import { z } from 'zod';
import type { Confirmation, SiteLocation } from '@rama/blueprint/site';

export const ConfirmBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('edge'),
    from: z.string().min(1),
    to: z.string().min(1),
    shown: z.string(),
  }),
  z.object({ kind: z.literal('purpose'), path: z.string().min(1), shown: z.string() }),
]);
export type ConfirmBody = z.infer<typeof ConfirmBody>;

export interface ConfirmDeps {
  locate: (siteId: string) => SiteLocation | null;
  memberName: string | undefined;
  /** The member's person id; throws when the database cannot be reached or the member is not seeded. */
  personId: (name: string) => Promise<string>;
  confirmEdge: (
    site: SiteLocation,
    edge: { from: string; to: string; shown: string },
    person: string,
    at: Date,
  ) => Confirmation;
  confirmPurpose: (
    site: SiteLocation,
    brick: { path: string; shown: string },
    person: string,
    at: Date,
  ) => Confirmation;
  log: (entry: {
    siteId: string;
    file: string;
    keys: string[];
    text: string;
    personId: string;
    at: Date;
  }) => Promise<void>;
  now: () => Date;
}

const STATUS = { 'not-found': 404, conflict: 409, invalid: 400 } as const;
const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });

export async function handleConfirm(
  siteId: string,
  raw: unknown,
  deps: ConfirmDeps,
): Promise<Response> {
  const site = deps.locate(siteId);
  if (!site) return fail(404, `no site "${siteId}"`);
  const body = ConfirmBody.safeParse(raw);
  if (!body.success)
    return fail(400, 'expected {kind:"edge",from,to,shown} or {kind:"purpose",path,shown}');
  const member = deps.memberName?.trim();
  if (!member)
    return fail(409, 'RAMA_MEMBER_NAME is not set: there is no local member to confirm as');

  let personId: string;
  try {
    personId = await deps.personId(member);
  } catch (err) {
    return fail(503, `cannot record who confirmed: ${(err as Error).message}`);
  }

  const at = deps.now();
  let result: Confirmation;
  try {
    const b = body.data;
    result =
      b.kind === 'edge'
        ? deps.confirmEdge(site, { from: b.from, to: b.to, shown: b.shown }, member, at)
        : deps.confirmPurpose(site, { path: b.path, shown: b.shown }, member, at);
  } catch (err) {
    const code = (err as { code?: keyof typeof STATUS }).code;
    if (code && STATUS[code]) return fail(STATUS[code], (err as Error).message);
    throw err;
  }

  if (result.confirmed.length) {
    await deps.log({
      siteId: site.id,
      file: body.data.kind === 'edge' ? '.rama/glossary.json' : '.rama/purposes.json',
      keys: result.confirmed,
      text: body.data.shown,
      personId,
      at,
    });
  }
  return Response.json({
    ok: true,
    confirmed: result.confirmed,
    missing: result.missing,
    by: member,
    at: at.toISOString(),
  });
}
