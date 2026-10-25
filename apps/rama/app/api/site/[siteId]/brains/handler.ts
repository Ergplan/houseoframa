// A product's brains, asked in discovery (Stage 9): "Which brains will build, check and speak?" The
// answer is stored for the product and recorded as a decision card decided by the person who gave it.
// The rules are the same as in Settings → Brains: the checker is never the builder (Invariant 5).
import type { Member } from '@rama/db';
import type { SiteLocation } from '@rama/blueprint/site';
import type { Seats } from '@rama/model';
import { seatsFromForm } from '@rama/workbench';
import { back } from '../../../../../server/http';

export interface BrainsDeps {
  choose: (site: SiteLocation, seats: Partial<Seats>, who: Member) => Promise<string[]>;
  baseUrl: string;
}

export async function handleProductBrains(
  site: SiteLocation,
  who: Member,
  form: FormData | null,
  deps: BrainsDeps,
): Promise<Response> {
  const page = `/site/${site.id}/discovery`;
  if (site.kind !== 'product')
    return back(deps.baseUrl, page, {
      ok: false,
      sentence: 'Only a product made here has brains to choose.',
    });
  const problems = await deps.choose(site, form ? seatsFromForm(form) : {}, who);
  return back(
    deps.baseUrl,
    page,
    problems.length
      ? { ok: false, sentence: problems.join(' ') }
      : { ok: true, sentence: `The brains are chosen, on a card decided by ${who.name}.` },
  );
}
