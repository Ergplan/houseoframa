// New product and Create repository (Stage 7), as functions of their dependencies. Any signed-in person
// may start a product, which is theirs; Create repository needs the product's owner or a trainer (the
// site authorization). Answers are 303s with a plain sentence, never a command.
import type { Member } from '@rama/db';
import type { Flag } from '@rama/workbench';
import { back } from '../../../server/http';

export interface ProductRouteDeps {
  member: () => Promise<Member | Response>;
  newProduct: (input: { name: string; idea: string; person: Member }) => Promise<{
    siteId: string;
    flags: Flag[];
  }>;
  baseUrl: string;
}

/** The flags as one sentence for the page: the last one that was not done, else the last one. */
export const summary = (flags: Flag[]): Flag => {
  const grey = flags.filter((f) => !f.ok).at(-1);
  if (grey) return { ok: false, sentence: [grey.sentence, grey.next].filter(Boolean).join(' ') };
  return flags.at(-1) ?? { ok: true, sentence: 'Done.' };
};

/** POST /api/products: `name` and `idea`. */
export async function handleNewProduct(
  form: FormData | null,
  deps: ProductRouteDeps,
): Promise<Response> {
  const who = await deps.member();
  if (who instanceof Response) return who;
  const name = String(form?.get('name') ?? '').trim();
  const idea = String(form?.get('idea') ?? '').trim();
  if (!name || !idea)
    return back(deps.baseUrl, '/', {
      ok: false,
      sentence: 'A new product needs a name and its idea in one line.',
    });
  if (name.length > 80 || idea.length > 300)
    return back(deps.baseUrl, '/', {
      ok: false,
      sentence: 'Keep the name under 80 letters and the idea to one line.',
    });
  const { siteId, flags } = await deps.newProduct({ name, idea, person: who });
  return back(deps.baseUrl, `/site/${siteId}`, summary(flags));
}
