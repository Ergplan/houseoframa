// Colours of the building. Ported from the weekend prototype
// (reference/weekend-prototype/house-of-rama.html, LAYER_COLOR and the crane palette), extended so a
// floor a target defines for itself still gets a stable colour.

const LAYER_COLOR: Record<string, string> = {
  foundation: '#8a7a63',
  data: '#4fe3d8',
  logic: '#ffb429',
  api: '#c98cff',
  interface: '#5ad45a',
  shell: '#ff8c5a',
  reference: '#7d8597',
  design: '#6c9fe0',
  tests: '#e06c9f',
};
// Kept apart from the colours above, so a floor of the target's own never looks like a standard one.
const EXTRA = ['#d4d4d4', '#d4a05a', '#9fa86c', '#e0a0e0', '#a0c0ff', '#c08060'];
export const CRANE_COLORS = ['#e0493a', '#ffb429', '#4fe3d8', '#c98cff', '#5ad45a', '#ff8c5a'];

/** A small, stable hash: the same id gets the same colour on every machine. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function layerColor(id: string): string {
  return LAYER_COLOR[id] ?? EXTRA[hash(id) % EXTRA.length]!;
}

/** "Foundation — manifests, config" → "FOUNDATION". */
export function layerShort(label: string, id: string): string {
  return (label.split(' — ')[0] || id).toUpperCase();
}

export const INK = '#1a1200';
export const UNTESTED = '#ff4d5e';
export const IMPORTS = '#4fe3d8';
export const IMPORTED_BY = '#ffb429';
