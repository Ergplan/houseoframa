import Link from 'next/link';
import { pageSite } from '../../../../server/session';
import { readSiteBlueprint } from '@rama/blueprint/site';
import { readCapture, showroomOf } from '@rama/trace/showroom';
import { readDecisions, readSignoffs, signaturesInForce } from '@rama/ceremony/records';
import { walkthrough } from '@rama/ceremony/walkthrough';
import { WalkthroughView } from '../../../../components/ceremony/WalkthroughView';

export const dynamic = 'force-dynamic';

export default async function Walkthrough({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { member, site } = await pageSite(siteId);
  const capture = readCapture(site.id);
  const blueprint = readSiteBlueprint(site);
  if (!capture || !blueprint) {
    return (
      <main className="stub">
        <h1>Walkthrough · {site.name}</h1>
        <p>
          A walkthrough signs real screens, and none have been captured for this site yet. Run{' '}
          <code>pnpm rama-trace capture {site.id}</code>.
        </p>
        <Link href={`/site/${site.id}`}>◀ Back to the site</Link>
      </main>
    );
  }
  const signoffs = readSignoffs(site.repoDir);
  const showroom = showroomOf(capture, blueprint, signaturesInForce(signoffs));
  return (
    <WalkthroughView
      siteId={site.id}
      name={site.name}
      commit={capture.commit}
      member={member.name}
      steps={walkthrough(showroom, readDecisions(site.repoDir), signoffs, member.name)}
    />
  );
}
