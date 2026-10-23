// The local member confirms an audit report's drafted text (the auditor's narration, alterations and time
// machine): until a named person does, it is shown as unconfirmed (Invariant 6). One append-only row,
// audited by trigger. No auth until Stage 6 (rule 11): the person is the single local member.
import { z } from 'zod';
import type { SiteLocation } from '@rama/blueprint/site';

export const ConfirmReportBody = z.object({ reportId: z.string().uuid() });

export interface ConfirmReportDeps {
  locate: (siteId: string) => SiteLocation | null;
  memberName: string | undefined;
  personId: (name: string) => Promise<string>;
  confirm: (input: {
    siteId: string;
    reportId: string;
    person: string;
    personId: string;
    at: Date;
  }) => Promise<{ person: string; at: string }>;
  now: () => Date;
}

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });

export async function handleConfirmReport(
  siteId: string,
  raw: unknown,
  deps: ConfirmReportDeps,
): Promise<Response> {
  const site = deps.locate(siteId);
  if (!site) return fail(404, `no site "${siteId}"`);
  const body = ConfirmReportBody.safeParse(raw);
  if (!body.success) return fail(400, 'expected {reportId}');
  const member = deps.memberName?.trim();
  if (!member)
    return fail(409, 'RAMA_MEMBER_NAME is not set: there is no local member to confirm as');
  let personId: string;
  try {
    personId = await deps.personId(member);
  } catch (err) {
    return fail(503, `cannot tell who is confirming: ${(err as Error).message}`);
  }
  try {
    const c = await deps.confirm({
      siteId: site.id,
      reportId: body.data.reportId,
      person: member,
      personId,
      at: deps.now(),
    });
    return Response.json({ ok: true, confirmation: c });
  } catch (err) {
    if (/no audit report/.test((err as Error).message)) return fail(404, (err as Error).message);
    throw err;
  }
}
