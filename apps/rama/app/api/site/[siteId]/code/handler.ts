// The code level's file (Stage 11): GET code?path=&commit= gives a file of the site now or at a commit,
// its blocks with the plain English beside each, the figures each serves (each a way to its trail), the
// change the commit made (for the typing in replay), and the commits that touched it (the scrubber).
// POST explain/confirm {hash} is a named person confirming a drafted sentence. GET typing?since= gives
// the builder's edits of the lift in hand, as they are made.
import { z } from 'zod';
import type { SiteLocation } from '@rama/blueprint/site';
import type { Blueprint } from '@rama/shared';
import type { Member } from '@rama/db';
import type { CodeView, Confirmed, EditEvent } from '@rama/workbench';
import { placeHref } from '../../../../../components/lakefront/places';

export interface CodeDeps {
  blueprint: (site: SiteLocation) => Blueprint | null;
  view: (
    site: SiteLocation,
    path: string,
    commit: string | undefined,
    href: (key: string) => string,
  ) => CodeView | null;
  confirm: (site: SiteLocation, hash: string, who: Member) => Promise<Confirmed>;
  edits: (siteId: string, since: number) => EditEvent[];
  /** Whether a build is running on the site. */
  building: (siteId: string) => boolean;
  /** The building a file stands in, for a figure's way to its trail. */
  buildingOf: (site: SiteLocation, path: string) => string | null;
}

const fail = (status: number, sentence: string) =>
  Response.json({ ok: false, sentence }, { status });

export function handleCode(site: SiteLocation, url: URL, deps: CodeDeps): Response {
  const path = url.searchParams.get('path') ?? '';
  const commit = url.searchParams.get('commit') ?? undefined;
  if (!path || path.includes('..') || path.startsWith('/'))
    return fail(400, 'expected ?path= of a file of the site');
  if (commit !== undefined && !/^[0-9a-f]{7,40}$/.test(commit)) return fail(400, 'not a commit');
  const bp = deps.blueprint(site);
  const building = deps.buildingOf(site, path);
  const href = (key: string) =>
    building
      ? `${placeHref(site.id, { level: 'building', building })}&figure=${encodeURIComponent(key)}`
      : `/site/${encodeURIComponent(site.id)}/showroom?figure=${encodeURIComponent(key)}`;
  const view = deps.view(site, path, commit, href);
  if (!view) return fail(404, commit ? 'The file was not there at that point.' : 'No such file.');
  const commits = (bp?.commits ?? [])
    .filter((c) => c.changes.some((ch) => ch.path === path))
    .map((c) => ({ sha: c.sha, at: c.at, subject: c.subject, author: c.author }));
  return Response.json({ ok: true, view, commits });
}

export async function handleConfirm(site: SiteLocation, who: Member, raw: unknown, deps: CodeDeps) {
  const body = z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/) }).safeParse(raw);
  if (!body.success) return fail(400, 'expected {hash}');
  try {
    const c = await deps.confirm(site, body.data.hash, who);
    return Response.json({ ok: true, confirmed: c });
  } catch (err) {
    return fail(409, (err as Error).message);
  }
}

export function handleTyping(site: SiteLocation, url: URL, deps: CodeDeps): Response {
  const since = Number(url.searchParams.get('since') ?? 0);
  if (!Number.isInteger(since) || since < 0) return fail(400, 'expected ?since= a count');
  return Response.json({
    ok: true,
    building: deps.building(site.id),
    edits: deps.edits(site.id, since),
  });
}
