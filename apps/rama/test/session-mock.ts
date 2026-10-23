// For the view tests: a signed-in member who owns every site. Authorization itself is tested against
// real sessions in app/authz.test.tsx; these tests are about what the views show.
import { notFound } from 'next/navigation';
import { listSites, locateSite } from '@rama/blueprint/site';
import type { Member } from '@rama/db';

export const TEST_MEMBER: Member = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Asha Rao',
  email: 'asha@example.com',
  role: 'member',
};

export async function sessionMock(actual: Record<string, unknown>) {
  return {
    ...actual,
    currentMember: async () => TEST_MEMBER,
    requireMember: async () => TEST_MEMBER,
    siteIdsOf: async () => new Set(listSites().map((s) => s.id)),
    pageSite: async (siteId: string) => {
      const site = locateSite(siteId);
      if (!site) notFound();
      return { member: TEST_MEMBER, site };
    },
  };
}
