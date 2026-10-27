// The brains asked by voice (Stage 10): "Claude Code builds, OpenAI checks and OpenAI speaks". Each
// company or builder named before a verb takes that seat; a seat not named keeps what it had. The
// models are the ones the seat already names, or the first House of Rama has used on that company;
// they are changed in Settings → Brains, not by voice. The rule is Stage 9's: seatProblems decides.
import {
  BUILDER_VENDOR,
  SEATS,
  VENDOR_REGISTRY,
  vendorEntry,
  type Seat,
  type SeatChoice,
  type Seats,
} from '@rama/model';
import { normalise } from './grammar.ts';

// What people say for each company and each builder.
const COMPANIES: [RegExp, string][] = [
  [/\b(?:anthropic|claude)\b/, 'anthropic'],
  [/\b(?:open ?ai|chat ?gpt|gpt)\b/, 'openai'],
  [/\b(?:google|gemini)\b/, 'gemini'],
  [/\b(?:grok|x ?ai)\b/, 'grok'],
  [/\b(?:kimi|moonshot)\b/, 'kimi'],
  [/\b(?:ollama|llama)\b/, 'ollama'],
];
const BUILDERS: [RegExp, string][] = [
  [/\b(?:claude|cloud|clawed|claud) code\b/, 'claude-code'],
  [/\bcodex\b/, 'codex'],
  [/\bgemini (?:cli|c l i)\b/, 'gemini-cli'],
  [/\bantigravity|anti gravity\b/, 'antigravity'],
];
const VERBS: [RegExp, Seat][] = [
  [/\b(?:builds?|building|will build)\b/, 'builder'],
  [/\b(?:checks?|checking|audits?|auditing|will check)\b/, 'auditor'],
  [/\b(?:drafts?|drafting|writes?|will draft)\b/, 'drafter'],
  [/\b(?:speaks?|speaking|talks?|will speak|voice)\b/, 'voice'],
];

function modelFor(vendor: string, seat: Seat, current: SeatChoice | undefined): string {
  if (current?.vendor === vendor && current.model) return current.model;
  const models = vendorEntry(vendor)?.models ?? [];
  if (seat === 'voice') return models.find((m) => m.includes('realtime')) ?? '';
  return models.find((m) => !m.includes('realtime')) ?? '';
}

/**
 * The seats a spoken answer names, over the ones already in place; null when no seat was named.
 * A clause is read on its own: "Claude Code builds" sets the builder, "OpenAI checks" the auditor.
 */
export function parseBrains(
  said: string,
  current: Partial<Seats>,
): { seats: Partial<Seats>; named: Seat[] } | null {
  const clauses = said
    .split(/[,;.]|\b(?:and|then|while|but)\b/i)
    .map((c) => normalise(c))
    .filter(Boolean);
  const out: Partial<Seats> = { ...current };
  const named: Seat[] = [];
  for (const clause of clauses) {
    const verb = VERBS.find(([re]) => re.test(clause));
    if (!verb) continue;
    const seat = verb[1];
    const builder = BUILDERS.find(([re]) => re.test(clause))?.[1];
    const vendor = builder
      ? BUILDER_VENDOR[builder]
      : COMPANIES.find(([re]) => re.test(clause))?.[1];
    if (!vendor) continue;
    if (seat === 'builder') {
      const b = builder ?? VENDOR_REGISTRY.find((v) => v.id === vendor)?.builders[0] ?? '';
      out.builder = { vendor, model: modelFor(vendor, seat, current.builder), builder: b };
    } else out[seat] = { vendor, model: modelFor(vendor, seat, current[seat]) };
    if (!named.includes(seat)) named.push(seat);
  }
  return named.length ? { seats: out, named } : null;
}

const BUILDER_WORDS: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'gemini-cli': 'Gemini CLI',
  antigravity: 'Antigravity',
};

/** The seats as the voice reads them back: companies and builders, no model names. */
export function brainsSpoken(seats: Partial<Seats>): string {
  const verb: Record<Seat, string> = {
    builder: 'builds',
    auditor: 'checks',
    drafter: 'drafts',
    voice: 'speaks',
  };
  return SEATS.filter((s) => seats[s])
    .map((s) => {
      const c = seats[s]!;
      const company = vendorEntry(c.vendor)?.label ?? c.vendor;
      return s === 'builder' && c.builder
        ? `${BUILDER_WORDS[c.builder] ?? c.builder}, from ${company}, ${verb[s]}`
        : `${company} ${verb[s]}`;
    })
    .join('; ');
}
