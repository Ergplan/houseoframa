// Care (Stage 11): the small tab at the end of the journey, for what keeps the site well rather than an
// act of the session: redraw the picture, photograph the screens, run the tests, GitHub, the agenda and
// the key lights. The journey bar above holds its buttons; the panels are SiteShell's CarePanel.
import { pageSite } from '../../../../server/session';
import { SiteShell } from '../../../../components/workbench/SiteShell';

export const dynamic = 'force-dynamic';

export default async function Care(props: {
  params: Promise<{ siteId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await props.params;
  const { member, site } = await pageSite(siteId);
  const q = (await props.searchParams) ?? {};
  return (
    <SiteShell site={site} member={member} here="Care" q={q}>
      {null}
    </SiteShell>
  );
}
