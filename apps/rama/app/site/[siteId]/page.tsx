import { notFound } from 'next/navigation';
import { locateSite, readSiteBlueprint } from '@rama/blueprint/site';
import { readCapture } from '@rama/trace/showroom';
import { readSignoffs, signaturesInForce } from '@rama/ceremony/records';
import { latestAudit } from '@rama/audit';
import { toAuditView, type AuditView } from '@rama/audit/view';
import { createDb } from '@rama/db';
import { SiteView } from '../../../components/site/SiteView';

export const dynamic = 'force-dynamic';

/** Screens whose signature in force (from the target's .rama/signoffs.jsonl) names the Blueprint's commit. */
function signedAt(repoDir: string, commit: string): string[] {
  return [...signaturesInForce(readSignoffs(repoDir)).values()]
    .filter((s) => s.target.kind === 'screen' && s.target.commit === commit)
    .map((s) => s.target.id);
}

/** The site's latest audit, or null when it has none or the database cannot be reached (the site still renders). */
async function auditOf(siteId: string): Promise<AuditView | null> {
  try {
    const conn = createDb();
    try {
      const a = await latestAudit(conn.db, siteId);
      return a ? toAuditView(a) : null;
    } finally {
      await conn.close();
    }
  } catch {
    return null;
  }
}

export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const brick = (await searchParams)?.brick;
  const site = locateSite(siteId);
  if (!site) notFound();
  const blueprint = readSiteBlueprint(site);
  if (!blueprint) {
    return (
      <main className="stub">
        <h1>{site.name}</h1>
        <p>
          This site has no Blueprint yet. Run <code>pnpm rama site extract {site.id}</code>.
        </p>
      </main>
    );
  }
  const capture = readCapture(site.id);
  const captured = (capture?.screens ?? []).map((s) => ({
    name: s.name,
    title: s.title,
    shot: s.shot,
    bricks: s.bricks,
  }));
  return (
    <SiteView
      siteId={site.id}
      name={site.name}
      blueprint={blueprint}
      member={process.env.RAMA_MEMBER_NAME?.trim() || null}
      captured={captured}
      signedScreens={signedAt(site.repoDir, blueprint.commit)}
      initialBrick={(Array.isArray(brick) ? brick[0] : brick) ?? null}
      audit={await auditOf(site.id)}
    />
  );
}
