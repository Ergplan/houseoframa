// The words that move between the levels: "open Take an order", "inside", "show me the code", "go back";
// and, into the ground (Stage 11), "open orders" or "show me the table". Typed now; spoken from Stage 10,
// through the same function. Plain code, no model: a phrase it does not know is answered with a sentence
// that says what it does know.

export type Place =
  | { level: 'street'; selected?: string | null }
  | { level: 'building'; building: string }
  | { level: 'code'; building: string | null }
  | { level: 'ground'; table: string };

export type Understood = { to: Place } | { say: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|a|an|please|me|to|of)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The building a phrase names: its whole name, else the one building whose name holds every word said. */
export function findBuilding(
  phrase: string,
  buildings: { id: string; name: string }[],
): { id: string; name: string } | null {
  const said = norm(phrase);
  if (!said) return null;
  const exact = buildings.find((b) => norm(b.name) === said || b.id === said.replace(/ /g, '-'));
  if (exact) return exact;
  const words = said.split(' ');
  const hits = buildings.filter((b) => {
    const name = norm(b.name).split(' ');
    return words.every((w) => name.some((n) => n.startsWith(w)));
  });
  return hits.length === 1 ? hits[0]! : null;
}

const KNOWN =
  'Say "open" and a building’s name or a table’s, "inside" to look through the glass, "show me the code", "show me the table", or "go back".';

/** A table of the ground a phrase names: its name, with spaces for underscores, one or many. */
export function findTable(phrase: string, tables: { name: string }[]): { name: string } | null {
  const said = norm(phrase).replace(/ (table|records?|rows?)$/, '');
  if (!said) return null;
  const forms = (n: string) => {
    const w = n.toLowerCase().replace(/_/g, ' ');
    return [w, w.replace(/s$/, ''), w.replace(/ies$/, 'y')];
  };
  return tables.find((t) => forms(t.name).includes(said)) ?? null;
}

export function understand(
  text: string,
  here: Place,
  buildings: { id: string; name: string }[],
  /** The ground's tables, with the buildings that read or write each (Stage 11). */
  tables: { name: string; by: string[] }[] = [],
): Understood {
  const t = norm(text);
  const current =
    here.level === 'street'
      ? (here.selected ?? null)
      : here.level === 'ground'
        ? null
        : here.building;
  if (/^(go )?back$|^up$|^(go )?out$/.test(t)) {
    if (here.level === 'ground') return { to: { level: 'street' } };
    if (here.level === 'code')
      return {
        to: here.building ? { level: 'building', building: here.building } : { level: 'street' },
      };
    if (here.level === 'building') return { to: { level: 'street', selected: here.building } };
    return { say: 'This is the Street: there is nothing above it.' };
  }
  if (/^(street|go street|show street|whole street)$/.test(t)) return { to: { level: 'street' } };
  if (/^(show )?code$|^show code$/.test(t)) {
    if (here.level === 'street' && !current) return { to: { level: 'code', building: null } };
    return { to: { level: 'code', building: current } };
  }
  // "show me the table": the one the product keeps, or the one the building in view touches.
  if (/^(show |open )?(table|tables|ground|records)$/.test(t)) {
    if (here.level === 'ground') return { say: `This is the table ${here.table}, opened.` };
    const near = current ? tables.filter((x) => x.by.includes(current)) : [];
    const pick = near.length === 1 ? near[0]! : tables.length === 1 ? tables[0]! : null;
    if (pick) return { to: { level: 'ground', table: pick.name } };
    if (!tables.length) return { say: 'The product keeps no records of its own yet.' };
    return {
      say: `Which table? Say "open" and its name: ${(near.length ? near : tables).map((x) => x.name).join(', ')}.`,
    };
  }
  if (/^(go )?inside$|^look inside$|^through glass$/.test(t)) {
    if (here.level === 'building') return { to: { level: 'code', building: here.building } };
    if (here.level === 'street' && current) return { to: { level: 'building', building: current } };
    if (here.level === 'code') return { say: 'This is already the code, the innermost level.' };
    if (here.level === 'ground')
      return { say: 'This is a table of the ground; say "go back" first.' };
    return { say: 'Inside which building? Say "open" and its name.' };
  }
  const named = /^(open|go|go into|enter|show|zoom|zoom into|into)\b ?(.*)$/.exec(t);
  const rest = named ? named[2]! : t;
  if (named && !rest) {
    if (here.level === 'street' && current) return { to: { level: 'building', building: current } };
    return { say: 'Open which building? Say its name.' };
  }
  // A building's whole name first, then a table's ("open orders" is the table, not the building whose
  // name has the word orders in it), then the one building whose name holds every word said.
  const whole = buildings.find((x) => norm(x.name) === rest);
  if (whole) return { to: { level: 'building', building: whole.id } };
  const table = findTable(rest, tables);
  if (table) return { to: { level: 'ground', table: table.name } };
  const b = findBuilding(rest, buildings);
  if (b) return { to: { level: 'building', building: b.id } };
  return { say: `There is no building called “${text.trim()}”. ${KNOWN}` };
}
