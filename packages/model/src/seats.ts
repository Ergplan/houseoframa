// The four seats of a product (Stage 9): builder, auditor (also the independent reviewer), drafter
// (descriptions, narration text) and voice. Each names a vendor from vendors.json and a model; the
// builder seat also names its agent driver. The rule that keeps the audit independent (Invariant 5):
// the builder and the auditor are never the same vendor. It is checked here, for the Settings screen
// and for every call, so neither a screen nor a stored setting can get round it.
import registry from '../vendors.json' with { type: 'json' };
import type { SecretName } from '@rama/db';

export const SEATS = ['builder', 'auditor', 'drafter', 'voice'] as const;
export type Seat = (typeof SEATS)[number];

export const SEAT_WORDS: Record<Seat, { label: string; does: string }> = {
  builder: { label: 'Builder', does: 'builds the product, one lift at a time' },
  auditor: {
    label: 'Auditor',
    does: 'checks the work and signs its report; it also reviews each stage',
  },
  drafter: { label: 'Drafter', does: 'drafts descriptions and narration for a person to confirm' },
  voice: { label: 'Voice', does: 'speaks and listens in the room' },
};

export type Protocol = 'anthropic' | 'openai' | 'openai-compatible';

export interface VendorEntry {
  id: string;
  label: string;
  protocol: Protocol;
  baseUrl: string;
  /** The Settings key it needs; null when it needs none (a model on this computer). */
  key: SecretName | null;
  seats: Seat[];
  local: boolean;
  models: string[];
  builders: string[];
}

export const VENDOR_REGISTRY = registry.vendors as VendorEntry[];

export const vendorEntry = (id: string): VendorEntry | undefined =>
  VENDOR_REGISTRY.find((v) => v.id === id);

/** One seat's choice. `builder` names the agent driver, for the builder seat only. */
export interface SeatChoice {
  vendor: string;
  model: string;
  builder?: string;
  /** Where the vendor answers, when not at its usual address (Ollama on another computer). */
  baseUrl?: string;
}
export type Seats = Record<Seat, SeatChoice>;

/** The vendor each builder driver runs on. */
export const BUILDER_VENDOR: Record<string, string> = Object.fromEntries(
  VENDOR_REGISTRY.flatMap((v) => v.builders.map((b) => [b, v.id])),
);

/** Why these seats cannot stand, one plain sentence each; empty when they can. */
export function seatProblems(seats: Partial<Seats>): string[] {
  const out: string[] = [];
  for (const seat of SEATS) {
    const c = seats[seat];
    if (!c) {
      out.push(`No one is chosen for the ${SEAT_WORDS[seat].label.toLowerCase()} seat.`);
      continue;
    }
    const v = vendorEntry(c.vendor);
    if (!v) out.push(`“${c.vendor}” is not a vendor House of Rama knows.`);
    else if (!v.seats.includes(seat))
      out.push(`${v.label} cannot hold the ${SEAT_WORDS[seat].label.toLowerCase()} seat.`);
    if (!c.model.trim())
      out.push(`The ${SEAT_WORDS[seat].label.toLowerCase()} seat needs its model named.`);
  }
  const b = seats.builder;
  if (b) {
    if (!b.builder) out.push('The builder seat needs its builder named.');
    else if (BUILDER_VENDOR[b.builder] !== b.vendor)
      out.push(
        `The builder ${b.builder} does not run on ${vendorEntry(b.vendor)?.label ?? b.vendor}.`,
      );
  }
  if (b && seats.auditor && b.vendor === seats.auditor.vendor)
    out.push(
      `The auditor cannot be ${vendorEntry(b.vendor)?.label ?? b.vendor}, the builder’s own vendor: the checker is never the builder (Invariant 5).`,
    );
  return out;
}

/** The vendors the auditor seat may name once the builder is chosen: never the builder's own. */
export const auditorChoices = (builderVendor: string): VendorEntry[] =>
  VENDOR_REGISTRY.filter((v) => v.seats.includes('auditor') && v.id !== builderVendor);

/** The seats as the server's setup file says, for a laptop where nobody has chosen in Settings yet. */
export function envSeats(env: Record<string, string | undefined>): Partial<Seats> {
  const builderVendor = env.BUILDER_VENDOR;
  const auditorVendor = env.AUDITOR_VENDOR;
  const model = (vendor: string | undefined) =>
    vendor === 'anthropic'
      ? env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'
      : vendor === 'openai'
        ? (env.OPENAI_MODEL ?? '')
        : '';
  const out: Partial<Seats> = {};
  if (builderVendor)
    out.builder = {
      vendor: builderVendor,
      model: model(builderVendor),
      builder: VENDOR_REGISTRY.find((v) => v.id === builderVendor)?.builders[0] ?? '',
    };
  if (auditorVendor) out.auditor = { vendor: auditorVendor, model: model(auditorVendor) };
  // Drafting was the builder vendor's work before the seats: it stays there until someone chooses.
  if (builderVendor) out.drafter = { vendor: builderVendor, model: model(builderVendor) };
  out.voice = { vendor: 'openai', model: 'gpt-realtime' };
  return out;
}

export const BRAINS_SETTING = 'brains';
export const brainsSettingOf = (siteId: string) => `brains:${siteId}`;
