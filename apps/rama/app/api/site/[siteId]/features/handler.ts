// Name this building (Stage 8): a person confirms a building's name, or puts it in their own words, with
// a sentence on what it does. The name goes into the product's `.rama/features.json`, confirmed by them,
// and the write is recorded in `audit_log`. A form route: it answers with a sentence on the building.
import type { Blueprint } from '@rama/shared';
import type { Member } from '@rama/db';
import type { SiteLocation } from '@rama/blueprint/site';
import { nameFeature, type FeaturesFile } from '@rama/stage';
import { back } from '../../../../../server/http';

export interface FeaturesDeps {
  blueprint: (site: SiteLocation) => Blueprint | null;
  read: (site: SiteLocation) => { file: FeaturesFile | null; problem: string | null };
  write: (site: SiteLocation, file: FeaturesFile) => void;
  log: (e: {
    siteId: string;
    building: string;
    name: string;
    does: string | null;
    at: Date;
    personId: string;
  }) => Promise<void>;
  baseUrl: string;
  now: () => Date;
}

export async function handleNameBuilding(
  site: SiteLocation,
  who: Member,
  form: FormData | null,
  deps: FeaturesDeps,
): Promise<Response> {
  const id = String(form?.get('building') ?? '');
  const page = `/site/${site.id}?b=${encodeURIComponent(id)}`;
  const bp = deps.blueprint(site);
  if (!bp)
    return back(deps.baseUrl, `/site/${site.id}`, {
      ok: false,
      sentence: 'Nothing is drawn for this site yet.',
    });
  const current = deps.read(site);
  if (current.problem)
    return back(deps.baseUrl, page, {
      ok: false,
      sentence: `The names file cannot be read, so nothing was changed: ${current.problem}`,
    });
  const at = deps.now();
  let file: FeaturesFile;
  try {
    file = nameFeature(
      bp,
      current.file,
      id,
      {
        name: String(form?.get('name') ?? ''),
        does: form?.get('does') ? String(form.get('does')) : null,
      },
      { person: who.name, at: at.toISOString() },
    );
  } catch (err) {
    return back(deps.baseUrl, page, { ok: false, sentence: (err as Error).message });
  }
  const named = file.features.find((f) => f.id === id)!;
  deps.write(site, file);
  await deps.log({
    siteId: site.id,
    building: id,
    name: named.name,
    does: named.does ?? null,
    at,
    personId: who.id,
  });
  return back(deps.baseUrl, page, {
    ok: true,
    sentence: `“${named.name}” is the building’s name, confirmed by ${who.name}.`,
  });
}
