// Where each level of a site's lakefront lives: the Street at /site/<id>, a building at ?b=<building>,
// the code at ?at=code (with the building it was opened from). Plain links, so the back button, the
// breadcrumb and a shared address all work.
import type { Place } from '@rama/stage';

export function placeHref(siteId: string, place: Place): string {
  const base = `/site/${encodeURIComponent(siteId)}`;
  const q = new URLSearchParams();
  if (place.level === 'street' && place.selected) q.set('sel', place.selected);
  if (place.level === 'building') q.set('b', place.building);
  if (place.level === 'code') {
    q.set('at', 'code');
    if (place.building) q.set('b', place.building);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
