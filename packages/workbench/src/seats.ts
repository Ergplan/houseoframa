// A product's seats (Stage 9): which brains build, check, draft and speak. A product's own choice, made in
// discovery, wins; else the default in Settings → Brains; else the server's setup file. A choice that
// breaks the rules (the builder's vendor auditing its own work above all) is refused when it is made,
// and refused again by every call (packages/model resolveSeat), so a stored setting cannot slip past.
import { decide } from '@rama/ceremony';
import { getSetting, putSetting, type Db, type Member } from '@rama/db';
import {
  BRAINS_SETTING,
  brainsSettingOf,
  BUILDER_VENDOR,
  envSeats,
  SEAT_WORDS,
  SEATS,
  seatProblems,
  vendorEntry,
  type Seats,
} from '@rama/model';
import type { SiteLocation } from '@rama/blueprint/site';
import { builderFor } from './builders/index.ts';
import type { BuilderDriver, BuilderId } from './builders/types.ts';
import { BUILDER_IDS } from './builders/types.ts';

export type SeatsFrom = 'product' | 'settings' | 'setup file';

export async function seatsOf(
  db: Db,
  siteId: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ seats: Partial<Seats>; from: SeatsFrom }> {
  const own = siteId ? await getSetting<Seats>(db, brainsSettingOf(siteId)) : undefined;
  if (own) return { seats: own, from: 'product' };
  const dflt = await getSetting<Seats>(db, BRAINS_SETTING);
  if (dflt) return { seats: dflt, from: 'settings' };
  return { seats: envSeats(env), from: 'setup file' };
}

/** The seats in a sentence: "Claude Code (Anthropic, claude-sonnet-5-5) builds; OpenAI (gpt-6.1-sol) checks; …". */
export function seatsSentence(seats: Partial<Seats>): string {
  const verb = {
    builder: 'builds',
    auditor: 'checks',
    drafter: 'drafts',
    voice: 'speaks',
  } as const;
  return SEATS.filter((s) => seats[s])
    .map((s) => {
      const c = seats[s]!;
      const v = vendorEntry(c.vendor)?.label ?? c.vendor;
      const who =
        s === 'builder' && c.builder
          ? `${builderLabel(c.builder)} (${v}, ${c.model})`
          : `${v} (${c.model})`;
      return `${who} ${verb[s]}`;
    })
    .join('; ');
}

export const builderLabel = (id: string) =>
  ({
    'claude-code': 'Claude Code',
    codex: 'Codex',
    'gemini-cli': 'Gemini CLI',
    antigravity: 'Antigravity',
  })[id] ?? id;

/** Reads the four seats from a form: `<seat>.vendor`, `<seat>.model`, `builder.builder`, `<seat>.baseUrl`. */
export function seatsFromForm(form: FormData): Partial<Seats> {
  const out: Partial<Seats> = {};
  for (const seat of SEATS) {
    const vendor = String(form.get(`${seat}.vendor`) ?? '').trim();
    if (!vendor) continue;
    const baseUrl = String(form.get(`${seat}.baseUrl`) ?? '').trim();
    out[seat] = {
      vendor,
      model: String(form.get(`${seat}.model`) ?? '').trim(),
      ...(seat === 'builder' ? { builder: String(form.get('builder.builder') ?? '').trim() } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    };
  }
  return out;
}

/** Problems with a choice, plus one the registry cannot know: a base URL must be a web address. */
export function choiceProblems(seats: Partial<Seats>): string[] {
  const out = seatProblems(seats);
  for (const s of SEATS) {
    const u = seats[s]?.baseUrl;
    if (u && !/^https?:\/\/[^\s]+$/.test(u))
      out.push(`The ${SEAT_WORDS[s].label.toLowerCase()} seat’s address is not a web address.`);
  }
  return out;
}

/** Saves the default seats (Settings → Brains). Returns the problems instead when they cannot stand. */
export async function chooseDefaultSeats(
  db: Db,
  seats: Partial<Seats>,
  by: Member,
): Promise<string[]> {
  const problems = choiceProblems(seats);
  if (!problems.length) await putSetting(db, BRAINS_SETTING, seats, by.id);
  return problems;
}

/**
 * A product's seats, as its customer answered in discovery: stored for the product, and recorded as a
 * decision card decided by the person who said yes, like any other answer.
 */
export async function chooseProductSeats(
  db: Db,
  site: SiteLocation,
  seats: Partial<Seats>,
  by: Member,
  at = new Date(),
): Promise<string[]> {
  const problems = choiceProblems(seats);
  if (problems.length) return problems;
  await putSetting(db, brainsSettingOf(site.id), seats, by.id);
  await decide(
    db,
    { id: site.id, repoDir: site.repoDir },
    {
      title: 'The brains',
      statement: `${seatsSentence(seats)}. The checker is never the builder.`,
      bricks: [],
      status: 'decided',
      by: by.name,
      at,
      createdBy: by.id,
    },
  );
  return [];
}

/** The builder a product's builder seat names, with its model; refused with the seats' problems. */
export async function productBuilder(
  withDb: <T>(fn: (db: Db) => Promise<T>) => Promise<T>,
  site: SiteLocation,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BuilderDriver> {
  // For engineers and the end-to-end tests: replay a recorded build instead of paying a builder.
  if (env.RAMA_BUILDER_RECORDING)
    return builderFor('recorded', { recording: env.RAMA_BUILDER_RECORDING });
  const { seats } = await withDb((db) => seatsOf(db, site.id, env));
  const problems = seatProblems(seats);
  const b = seats.builder;
  const id = b?.builder as BuilderId | undefined;
  if (problems.length || !b || !id || !(BUILDER_IDS as readonly string[]).includes(id))
    return unready(problems.join(' ') || 'No builder is chosen in Settings → Brains.');
  return builderFor(id, { model: b.model, env });
}

/** A driver that builds nothing and says why: the console shows its sentence as a grey flag. */
function unready(why: string): BuilderDriver {
  return {
    id: 'codex',
    label: 'No builder',
    wired: false,
    lift: () => Promise.reject(new Error(why)),
  };
}

/** The builders a seat may name, for the Brains form: each with its vendor and whether it is wired. */
export const BUILDER_OPTIONS = (['claude-code', 'codex', 'gemini-cli', 'antigravity'] as const).map(
  (id) => ({
    id,
    label: builderLabel(id),
    vendor: BUILDER_VENDOR[id]!,
    wired: builderFor(id).wired,
  }),
);
