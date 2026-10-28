// Every page of a site (Stage 10): the voice's room stays at the foot while a session lasts, so the
// voice keeps talking as "show me" moves the room from page to page. Products only: an outside site has
// no discovery to hold.
import { Suspense, type ReactNode } from 'react';
import { readMembers } from '@rama/db';
import { readRoom } from '@rama/ears';
import { TEST_DRIVE_PERSON } from '@rama/workbench';
import { pageSite } from '../../../server/session';
import { voiceMode } from '../../../server/voice';
import { VoiceRoom } from '../../../components/ears/VoiceRoom';

export const dynamic = 'force-dynamic';

export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const { site, member } = await pageSite(siteId);
  if (site.kind !== 'product') return children;
  const room = readRoom(site.id);
  const open = Boolean(room && !room.endedAt);
  return (
    <>
      {children}
      {/* The voice stays at the foot of the screen only while a session is open. */}
      <div className={`voice-dock${open ? ' voice-dock--open' : ''}`}>
        <Suspense fallback={null}>
          <VoiceRoom
            siteId={site.id}
            // Test drive signs in to run the sample on its own; it is never a person in the room.
            members={readMembers()
              .map((m) => m.name)
              .filter((n) => n !== TEST_DRIVE_PERSON)}
            present={member.name}
            mode={await voiceMode(site.id)}
            open={open}
            idea={open ? Boolean(room!.idea) : false}
            people={open ? room!.people : []}
            act={open ? room!.act : 1}
            clips={process.env.RAMA_VOICE_CLIPS === '1'}
          />
        </Suspense>
      </div>
    </>
  );
}
