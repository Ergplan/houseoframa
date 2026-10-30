// The film's server helpers (Stage 13).
import { siteRecord, type SiteLocation } from '@rama/blueprint/site';

/** The site's name, idea and builder, as its record keeps them. */
export function readSiteRecordName(site: SiteLocation) {
  const rec = siteRecord(site.id) as { idea?: string; builder?: string } | null;
  return { name: site.name, idea: rec?.idea ?? null, builder: rec?.builder ?? null };
}
