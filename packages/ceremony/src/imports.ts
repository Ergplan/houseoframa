// Records rebuilt after the fact, imported as the first record of a site and flagged `reconstructed`:
//  - the weekend's discovery session (reference/weekend-prototype/discovery.js), for the site it
//    describes, Procurement Studio. Its own note says the roles are real and the words illustrative;
//  - a target's own decisions log (EkBill's docs/DECISIONS.md: dated entries of Decision, Why, Asked by).
// Nothing here invents a turn or a decision: every line comes from the source file.
import ts from 'typescript';
import type { Decision } from '@rama/shared';

export interface ImportedTurn {
  speaker: string;
  text: string;
  at: string;
}

export interface ImportedDecision {
  title: string;
  statement: string;
  bricks: string[];
  status: 'decided' | 'open' | 'not-built';
  by: string;
  at: string;
}

export interface ImportedSession {
  title: string;
  source: string;
  turns: ImportedTurn[];
  decisions: ImportedDecision[];
}

/** Evaluates a literal (objects, arrays, strings, numbers, booleans) from the TypeScript AST; anything else is refused. */
function literal(node: ts.Expression): unknown {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((e) => literal(e));
  if (ts.isObjectLiteralExpression(node)) {
    const out: Record<string, unknown> = {};
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p)) throw new Error(`unsupported property at ${p.pos}`);
      const key = ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name) ? p.name.text : null;
      if (key === null) throw new Error(`unsupported key at ${p.pos}`);
      out[key] = literal(p.initializer);
    }
    return out;
  }
  throw new Error(`not a plain literal: ${ts.SyntaxKind[node.kind]}`);
}

function constLiteral(source: string, name: string): unknown {
  const sf = ts.createSourceFile(
    'discovery.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer)
        return literal(d.initializer);
    }
  }
  throw new Error(`no const ${name} in the session file`);
}

/** The weekend's session: 8 topics of turns and decision cards, held on 28 Sep 2026 (IST) per its agenda. */
export function parseWeekendSession(source: string, date = '2026-09-28'): ImportedSession {
  const people = constLiteral(source, 'PEOPLE') as Record<string, { name: string; org: string }>;
  const session = constLiteral(source, 'SESSION') as {
    topic: string;
    time: string;
    items: {
      w?: string;
      t?: string;
      dec?: string;
      warn?: string;
      text?: string;
      bricks?: string[];
    }[];
  }[];
  const turns: ImportedTurn[] = [];
  const decisions: ImportedDecision[] = [];
  for (const topic of session) {
    const at = `${date}T${topic.time}:00+05:30`;
    turns.push({ speaker: 'agenda', text: topic.topic, at });
    for (const item of topic.items) {
      if (item.w) {
        const who = people[item.w];
        if (!who) throw new Error(`unknown speaker ${item.w}`);
        turns.push({ speaker: who.name, text: item.t ?? '', at });
      } else {
        const title = item.dec ?? item.warn ?? '';
        decisions.push({
          title,
          statement: item.text ?? '',
          bricks: item.bricks ?? [],
          status: item.dec ? 'decided' : /^open\b/i.test(title) ? 'open' : 'not-built',
          by: 'the committee (reconstructed)',
          at,
        });
      }
    }
  }
  return {
    title: `Discovery session, ${date} (reconstructed from what the repository shipped; illustrative dialogue)`,
    source: 'reference/weekend-prototype/discovery.js',
    turns,
    decisions,
  };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A section heading's date: `2026-10-13 — …` or `19 Oct 2026: …` (and `20 Oct 2026, evening: …`). */
function headingDate(heading: string): string | null {
  const iso = /^(\d{4}-\d{2}-\d{2})\b/.exec(heading);
  if (iso) return iso[1]!;
  const dmy = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})\b/.exec(heading);
  const month = dmy ? MONTHS.indexOf(dmy[2]!.toLowerCase()) : -1;
  return dmy && month >= 0
    ? `${dmy[3]}-${String(month + 1).padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`
    : null;
}

/**
 * A decisions log in EkBill's form. Two shapes occur: a dated section (`## 2026-10-13 — <heading>`) of
 * `### <title>` entries, and a section that is itself one entry (`## 19 Oct 2026: <title>`). An entry's
 * `- Decision:` line is the card, its `- Why:` is kept with it, and `- Asked by:` names who asked. Bricks
 * are the backticked paths in the entry that are files of the repository (`isFile`); nothing else is linked.
 * An entry without a Decision line, or under a heading with no date, is not a card.
 */
export function parseDecisionsLog(
  markdown: string,
  isFile: (p: string) => boolean,
  source = 'docs/DECISIONS.md',
): ImportedSession {
  const decisions: ImportedDecision[] = [];
  let date: string | null = null;
  let current: { title: string; lines: string[] } | null = null;
  const flush = () => {
    if (current && date) {
      const body = current.lines.join('\n');
      const field = (name: string) => {
        const m = new RegExp(
          `^- ${name}:\\s*([\\s\\S]*?)(?=^- [A-Z][a-z ]+:|(?![\\s\\S]))`,
          'm',
        ).exec(body);
        return m ? m[1]!.replace(/\s+/g, ' ').trim() : '';
      };
      const decision = field('Decision');
      if (decision) {
        const why = field('Why');
        const paths = [...body.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]!).filter(isFile);
        decisions.push({
          title: current.title,
          statement: why ? `${decision} Why: ${why}` : decision,
          bricks: [...new Set(paths)].sort(),
          status: 'decided',
          by: field('Asked by') || 'not recorded',
          at: `${date}T00:00:00Z`,
        });
      }
    }
    current = null;
  };
  for (const raw of markdown.split('\n')) {
    const section = /^## (.+)$/.exec(raw);
    if (section) {
      flush();
      date = headingDate(section[1]!);
      // `## 19 Oct 2026: <title>` (or `, evening: <title>`): the section is the entry.
      const own = /^\d{1,2} [A-Za-z]{3}[a-z]* \d{4}[^:]*:\s*(.+)$/.exec(section[1]!);
      if (own && date) current = { title: own[1]!.trim(), lines: [] };
      continue;
    }
    const entry = /^### (.+)$/.exec(raw);
    if (entry) {
      flush();
      current = { title: entry[1]!.trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(raw);
  }
  flush();
  return {
    title: `Decisions imported from ${source} (reconstructed from the log, not a live session)`,
    source,
    turns: [],
    decisions,
  };
}

/**
 * What a corrected re-import adds to cards already recorded from the same source, append-only: a card
 * recorded exactly as imported is left alone; one recorded under the same title with different content
 * is superseded by the imported version; a title not yet recorded is added. Recorded cards the import no
 * longer has are reported, never removed.
 */
export function planReimport(
  recorded: Decision[],
  imported: ImportedDecision[],
): {
  add: (ImportedDecision & { supersedes?: string })[];
  unchanged: number;
  orphaned: Decision[];
} {
  const same = (d: Decision, i: ImportedDecision) =>
    d.statement === i.statement &&
    d.status === i.status &&
    d.by === i.by &&
    Date.parse(d.at) === Date.parse(i.at) &&
    JSON.stringify(d.bricks) === JSON.stringify(i.bricks);
  const superseded = new Set(recorded.map((d) => d.supersedes).filter(Boolean));
  const current = recorded.filter((d) => !superseded.has(d.id));
  const used = new Set<string>();
  const add: (ImportedDecision & { supersedes?: string })[] = [];
  let unchanged = 0;
  for (const i of imported) {
    const candidates = current.filter((d) => d.title === i.title && !used.has(d.id));
    const exact = candidates.find((d) => same(d, i));
    if (exact) {
      used.add(exact.id);
      unchanged++;
      continue;
    }
    const prior = candidates[0];
    if (prior) used.add(prior.id);
    add.push(prior ? { ...i, supersedes: prior.id } : i);
  }
  return { add, unchanged, orphaned: current.filter((d) => !used.has(d.id)) };
}
