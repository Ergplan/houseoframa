// POST /api/rehearsal (Stage 10): a rehearsal of acts 1 to 3 by voice on the sample product. Only a
// trainer starts one: the cards are drafted in the trainer's name, for the people in the room to decide.
import type { Member } from '@rama/db';
import type { SiteLocation } from '@rama/blueprint/site';

export interface RehearsalDeps {
  make: (trainer: Member) => Promise<SiteLocation>;
  baseUrl: string;
  back: (base: string, page: string, said?: { ok: boolean; sentence: string }) => Response;
}

export async function handleRehearsal(who: Member, deps: RehearsalDeps): Promise<Response> {
  if (who.role !== 'trainer')
    return deps.back(deps.baseUrl, '/testdrive', {
      ok: false,
      sentence: 'A trainer starts a rehearsal: the cards are drafted in the trainer’s name.',
    });
  const site = await deps.make(who);
  return deps.back(deps.baseUrl, `/site/${site.id}/discovery`, {
    ok: true,
    sentence: `${site.name} is ready, its cards drafted by ${who.name} and open. Start the session with the voice.`,
  });
}
