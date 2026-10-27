// The room on a real site (Stage 10): the conductor's deps on the records. Turns go to the discovery
// session, cards through packages/ceremony's decide (append-only, audited, mirrored to the product's
// .rama/decisions.jsonl), the brains through Stage 9's chooseProductSeats, figures and trails from the
// last capture of the current commit, "what if" through the product's own function in the sandbox.
// The room's state (act, the question asked, where it looks) is kept in work/<site>/voice.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { readSiteBlueprint, workDir, type SiteLocation } from '@rama/blueprint/site';
import {
  addTurn,
  currentDecisions,
  decide,
  draftQuestion,
  listDecisions,
  listSessions,
  readSignoffs,
  signaturesInForce,
  startSession,
} from '@rama/ceremony';
import { ensurePerson, modelCalls, readMembers, secretFor, type Db, type Member } from '@rama/db';
import { call, type CallDeps, type Seats } from '@rama/model';
import { readCapture, runInSandbox, showroomOf } from '@rama/trace';
import { chooseProductSeats, seatsOf, siteLakefront } from '@rama/workbench';
import type { Decision } from '@rama/shared';
import { mouthCheck } from './mouth.ts';
import type { Building, RoomDeps, RoomState } from './conductor.ts';
import type { FigureOnHand } from './track.ts';

export const EARS_COMPONENT = 'rama:ears@0.1.0';

const stateFile = (siteId: string, env: NodeJS.ProcessEnv) =>
  path.join(workDir(env), siteId, 'voice.json');

export function readRoom(siteId: string, env: NodeJS.ProcessEnv = process.env): RoomState | null {
  const f = stateFile(siteId, env);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as RoomState) : null;
}

export function writeRoom(state: RoomState, env: NodeJS.ProcessEnv = process.env): void {
  const f = stateFile(state.siteId, env);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, `${JSON.stringify(state, null, 2)}\n`);
}

/** A person in the room, as a member of members.json with a row in people. */
export async function memberNamed(
  db: Db,
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Member> {
  const entry = readMembers(env).find((m) => m.name === name);
  if (!entry) throw new Error(`${name} is not in members.json`);
  return ensurePerson(db, { name: entry.name, role: entry.role }, EARS_COMPONENT);
}

/** The buildings of the product and every figure on their screens, from the capture of this commit. */
export function lakefrontOf(
  site: SiteLocation,
  env: NodeJS.ProcessEnv = process.env,
): { buildings: Building[]; figures: (FigureOnHand & { building: string })[] } {
  const bp = readSiteBlueprint(site);
  if (!bp) return { buildings: [], figures: [] };
  const lf = siteLakefront(site, bp, env);
  const capture = readCapture(site.id, env);
  const room =
    capture && capture.commit === bp.commit
      ? showroomOf(capture, bp, signaturesInForce(readSignoffs(site.repoDir)))
      : null;
  const screenName = new Map(room?.screens.map((s) => [s.blueprintScreen, s]) ?? []);
  const buildings: Building[] = lf.street.buildings.map((b) => ({
    id: b.id,
    name: b.name,
    screens: b.screens.map((id) => ({
      id: screenName.get(id)?.name ?? id,
      title: screenName.get(id)?.title ?? id,
    })),
  }));
  const figures: (FigureOnHand & { building: string })[] = [];
  for (const b of lf.street.buildings)
    for (const f of lf.facades[b.id] ?? []) {
      const screen = screenName.get(f.screen);
      for (const g of f.figures) {
        const trail = room?.trails[g.key] ?? null;
        figures.push({
          key: g.key,
          name: trail?.title ?? g.text ?? g.id,
          screen: f.title ?? screen?.title ?? f.screen,
          trail,
          building: b.id,
        });
      }
    }
  return { buildings, figures };
}

const Narration = z.object({
  lines: z
    .array(z.object({ building: z.string().nullable(), text: z.string().min(1).max(1500) }))
    .min(1)
    .max(30),
});

/**
 * The design explained aloud. The builder seat writes it from the decided cards (narrate.v2); a line
 * holding a number no card holds is refused, and so is a narration that cannot be had: then each card is
 * read as it was decided, word for word. Which it was is said in `by`.
 */
export async function narrateDesign(
  site: SiteLocation,
  cards: Decision[],
  buildings: Building[],
  opts: { call?: typeof call; createdBy: string },
): Promise<{
  lines: { building: string | null; text: string }[];
  by: 'builder' | 'cards';
  why?: string;
}> {
  const decided = cards.filter((c) => c.status === 'decided');
  const own = (b: Building) =>
    decided.filter((c) => c.title.includes(b.name) || c.statement.includes(`“${b.name}”`));
  const verbatim = () => {
    const lines: { building: string | null; text: string }[] = [];
    const used = new Set<string>();
    for (const b of buildings)
      for (const c of own(b)) {
        used.add(c.id);
        lines.push({ building: b.name, text: c.statement });
      }
    for (const c of decided.filter((c) => !used.has(c.id) && !/^yes, build it$/i.test(c.title)))
      lines.push({ building: null, text: `${c.title}: ${c.statement}` });
    return lines;
  };
  try {
    const res = await (opts.call ?? call)({
      name: 'narrate',
      version: 2,
      input: {
        product: site.name,
        cards: decided.map((c) => ({ title: c.title, statement: c.statement })),
        buildings: buildings.map((b) => ({ name: b.name, cards: own(b).map((c) => c.title) })),
      },
      output: Narration,
      role: 'builder',
      siteId: site.id,
      createdBy: opts.createdBy,
      maxTokens: 4000,
    });
    const sources = decided.map((c) => `${c.title} ${c.statement}`);
    const bad = res.output.lines.find((l) => !mouthCheck(l.text, sources).ok);
    if (bad)
      return {
        lines: verbatim(),
        by: 'cards',
        why: `the builder's narration gave a number no card holds (${mouthCheck(bad.text, sources).unsupported.join(', ')})`,
      };
    return { lines: res.output.lines, by: 'builder' };
  } catch (err) {
    return { lines: verbatim(), by: 'cards', why: (err as Error).message };
  }
}

/**
 * The buildings the cards name ("Building: Take an order"), for a product not built yet: the design is
 * explained from its cards before anything stands on the Street.
 */
export function cardBuildings(cards: Decision[]): Building[] {
  return cards
    .filter((c) => c.status === 'decided')
    .flatMap((c) => {
      const m = /^Building:\s*(.+)$/.exec(c.title);
      return m
        ? [
            {
              id: m[1]!
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, ''),
              name: m[1]!.trim(),
              screens: [],
            },
          ]
        : [];
    });
}

/** "What if": the figure's own function, run with one input changed, shown the way its screen shows it. */
export async function whatIf(
  site: SiteLocation,
  figure: FigureOnHand,
  input: string,
  value: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const name = `“${figure.name}”`;
  const capture = readCapture(site.id, env);
  const id = figure.key.split('/').pop()!.replace(/~\d+$/, '');
  const mapping = capture?.mappings[id];
  const shown = capture?.screens
    .flatMap((s) => s.figures.map((f, i) => ({ s, f, i })))
    .find(({ s, f }) => figure.key.startsWith(`${s.name}/`) && f.id === id)?.f;
  if (!figure.trail || !mapping || !shown?.args)
    return `${name} cannot be worked out again with another value: it is untraced, or its screen gives no inputs to change.`;
  const at = mapping.inputs.findIndex((i) => i.label.toLowerCase().includes(input.toLowerCase()));
  if (at === -1)
    return `${name} has no input called “${input}”. Its inputs are ${mapping.inputs.map((i) => i.label).join(', ')}.`;
  if (typeof shown.args[at] !== 'number')
    return `${name}'s input “${mapping.inputs[at]!.label}” is not a single number, so it cannot be changed by voice.`;
  const args = shown.args.map((a, n) => (n === at ? value : a));
  const run = await runInSandbox(site.repoDir, {
    kind: 'call',
    file: mapping.file,
    fn: mapping.fn,
    args,
  });
  if (!run.ok) return `${name} could not be worked out again: ${run.error.split('\n')[0]}`;
  const showAs = (mapping as { show?: string }).show;
  const shownAs = showAs
    ? await runInSandbox(site.repoDir, {
        kind: 'show',
        file: 'rama/define.ts',
        show: showAs,
        value: run.value,
      })
    : null;
  const text = shownAs?.ok ? String(shownAs.value) : String(run.value);
  return `If ${mapping.inputs[at]!.label} were ${value}, ${name} would be ${text}, worked out by the product’s own code. Nothing is saved; the screen still shows ${shown.text}.`;
}

/** The conductor's deps for one site, on one database connection. */
export function roomDeps(
  db: Db,
  site: SiteLocation,
  state: () => RoomState,
  opts: { env?: NodeJS.ProcessEnv; now?: () => Date; call?: typeof call } = {},
): RoomDeps {
  const env = opts.env ?? process.env;
  const now = opts.now ?? (() => new Date());
  const ref = { id: site.id, repoDir: site.repoDir };
  const cards = async () => currentDecisions(await listDecisions(db, site.id));
  const lake = () => lakefrontOf(site, env);
  // Every model call the room makes (the next question, the narration) reads its keys, seats and
  // database from the room's own environment, and its row goes into the room's database.
  const model: Partial<CallDeps> = {
    env,
    secret: (name) => secretFor(name, env),
    record: async (row) =>
      (await db.insert(modelCalls).values(row).returning({ id: modelCalls.id }))[0]!.id,
  };
  const modelCall: typeof call = opts.call ?? ((req) => call(req, model));
  return {
    turn: async (speaker, text) => {
      const by = speaker === 'Rama' ? EARS_COMPONENT : (await memberNamed(db, speaker, env)).id;
      await addTurn(db, site.id, state().sessionId, { speaker, text, at: now(), createdBy: by });
    },
    cards,
    yes: async (cardId, speaker) => {
      const m = await memberNamed(db, speaker, env);
      const all = await listDecisions(db, site.id);
      const card = all.find((d) => d.id === cardId);
      if (!card) throw new Error('no such card');
      if (all.some((d) => d.supersedes === card.id))
        throw new Error('the card has changed since it was read out');
      return decide(db, ref, {
        title: card.title,
        statement: card.statement,
        bricks: card.bricks,
        ...(card.screenId ? { screenId: card.screenId } : {}),
        sessionId: card.sessionId ?? state().sessionId,
        status: 'decided',
        by: m.name,
        at: now(),
        supersedes: card.id,
        createdBy: m.id,
      });
    },
    record: async (card, speaker) => {
      const m = await memberNamed(db, speaker, env);
      return decide(db, ref, {
        ...card,
        bricks: [],
        sessionId: state().sessionId,
        status: 'decided',
        by: m.name,
        at: now(),
        createdBy: m.id,
      });
    },
    scrap: async (speaker) => {
      const m = await memberNamed(db, speaker, env);
      for (const card of (await cards()).filter((d) => d.status !== 'withdrawn'))
        await decide(db, ref, {
          title: card.title,
          statement: card.statement,
          bricks: card.bricks,
          ...(card.screenId ? { screenId: card.screenId } : {}),
          ...(card.sessionId ? { sessionId: card.sessionId } : {}),
          status: 'withdrawn',
          by: m.name,
          at: now(),
          supersedes: card.id,
          createdBy: m.id,
        });
      const name = `Scrapped by ${m.name}, ${now().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
      const sessionId = await startSession(db, site.id, {
        title: `Draft: ${name}`,
        createdBy: m.id,
      });
      return { name, sessionId };
    },
    seats: async () => {
      const s = await seatsOf(db, site.id, env);
      return { seats: s.seats, chosen: s.from === 'product' };
    },
    chooseSeats: async (seats: Seats, speaker) =>
      chooseProductSeats(db, site, seats, await memberNamed(db, speaker, env), now(), env),
    question: async () => {
      try {
        const sessions = await listSessions(db, site.id);
        const turns = sessions.find((s) => s.id === state().sessionId)?.turns ?? [];
        return await draftQuestion(
          { site: site.name, turns, decisions: await cards() },
          { siteId: site.id, call: modelCall },
        );
      } catch {
        return null;
      }
    },
    narrate: async () => {
      const all = await cards();
      const built = lake().buildings;
      return (
        await narrateDesign(site, all, built.length ? built : cardBuildings(all), {
          createdBy: EARS_COMPONENT,
          call: modelCall,
        })
      ).lines;
    },
    buildings: () => lake().buildings,
    figures: () => lake().figures,
    whatIf: (figure, input, value) => whatIf(site, figure, input, value, env),
  };
}
