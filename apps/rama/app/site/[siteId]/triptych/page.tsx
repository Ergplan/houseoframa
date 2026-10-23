import { pageSite } from '../../../../server/session';
import { TriptychView } from '../../../../components/floor/TriptychView';

export const dynamic = 'force-dynamic';

export default async function Triptych({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await pageSite(siteId);
  return <TriptychView siteId={site.id} />;
}
