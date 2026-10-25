'use client';
// The four seats as a form (Stage 9): Settings → Brains for the default, and discovery for a product.
// Choosing a builder takes its company off the auditor list at once (Invariant 5: the checker is never
// the builder); the server refuses the same choice again, so a form sent by other means cannot get past.
import { useState } from 'react';
import type { SeatChoice, Seats, VendorEntry } from '@rama/model';

export interface BuilderOption {
  id: string;
  label: string;
  vendor: string;
  wired: boolean;
}

export interface BrainsFormProps {
  action: string;
  seats: Partial<Seats>;
  vendors: VendorEntry[];
  builders: BuilderOption[];
  submit: string;
}

const SEAT_TEXT = {
  builder: 'Builds the product, one lift at a time.',
  auditor: 'Checks the work and signs its report. Never the builder’s company.',
  drafter: 'Drafts descriptions and narration for a person to confirm.',
  voice: 'Speaks and listens in the room.',
} as const;

function Model({ seat, vendor, value }: { seat: string; vendor?: VendorEntry; value: string }) {
  const list = `${seat}-models`;
  return (
    <>
      <input
        className="eg-input"
        name={`${seat}.model`}
        defaultValue={value}
        key={`${seat}-${vendor?.id}`}
        list={list}
        placeholder="The model’s name"
        aria-label={`The ${seat}’s model`}
      />
      <datalist id={list}>
        {(vendor?.models ?? []).map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </>
  );
}

export function BrainsForm(p: BrainsFormProps) {
  const vendorOf = (id: string) => p.vendors.find((v) => v.id === id);
  const firstWired = p.builders.find((b) => b.wired) ?? p.builders[0]!;
  const [builder, setBuilder] = useState(p.seats.builder?.builder ?? firstWired.id);
  const builderVendor = p.builders.find((b) => b.id === builder)?.vendor ?? '';
  const auditors = p.vendors.filter((v) => v.seats.includes('auditor') && v.id !== builderVendor);
  const [auditor, setAuditor] = useState(
    p.seats.auditor && p.seats.auditor.vendor !== builderVendor
      ? p.seats.auditor.vendor
      : (auditors[0]?.id ?? ''),
  );
  // The auditor follows the builder: if the builder now is the auditor's company, it moves on.
  const auditorNow = auditor === builderVendor ? (auditors[0]?.id ?? '') : auditor;
  const [drafter, setDrafter] = useState(p.seats.drafter?.vendor ?? builderVendor);
  const [voice, setVoice] = useState(p.seats.voice?.vendor ?? 'openai');
  const chosen = p.builders.find((b) => b.id === builder);
  const model = (s: keyof Seats, vendor: string): string => {
    const c: SeatChoice | undefined = p.seats[s];
    return c && c.vendor === vendor ? c.model : (vendorOf(vendor)?.models[0] ?? '');
  };
  const pick = (seat: keyof Seats, value: string, set: (v: string) => void) => (
    <select
      className="eg-input"
      name={`${seat}.vendor`}
      value={value}
      onChange={(e) => set(e.target.value)}
      aria-label={`Who holds the ${seat} seat`}
      data-seat={seat}
    >
      {(seat === 'auditor' ? auditors : p.vendors.filter((v) => v.seats.includes(seat))).map(
        (v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ),
      )}
    </select>
  );
  return (
    <form action={p.action} method="post" className="brains eg-stack" data-brains>
      <fieldset className="seat" data-seat-row="builder">
        <legend>Builder</legend>
        <p className="eg-muted">{SEAT_TEXT.builder}</p>
        <input type="hidden" name="builder.vendor" value={builderVendor} />
        <select
          className="eg-input"
          name="builder.builder"
          value={builder}
          onChange={(e) => setBuilder(e.target.value)}
          aria-label="Who builds"
          data-seat="builder"
        >
          {p.builders.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label} ({vendorOf(b.vendor)?.label ?? b.vendor}){b.wired ? '' : ', not wired yet'}
            </option>
          ))}
        </select>
        <Model
          seat="builder"
          vendor={vendorOf(builderVendor)}
          value={model('builder', builderVendor)}
        />
        {chosen && !chosen.wired ? (
          <small className="why" data-unwired>
            {chosen.label} is not wired as a builder yet: a build with it stops at once and says so.
          </small>
        ) : null}
      </fieldset>
      <fieldset className="seat" data-seat-row="auditor">
        <legend>Auditor</legend>
        <p className="eg-muted">{SEAT_TEXT.auditor}</p>
        {pick('auditor', auditorNow, setAuditor)}
        <Model seat="auditor" vendor={vendorOf(auditorNow)} value={model('auditor', auditorNow)} />
        {vendorOf(auditorNow)?.local ? (
          <input
            className="eg-input"
            name="auditor.baseUrl"
            defaultValue={p.seats.auditor?.baseUrl ?? vendorOf(auditorNow)?.baseUrl}
            aria-label="Where it answers"
          />
        ) : null}
      </fieldset>
      <fieldset className="seat" data-seat-row="drafter">
        <legend>Drafter</legend>
        <p className="eg-muted">{SEAT_TEXT.drafter}</p>
        {pick('drafter', drafter, setDrafter)}
        <Model seat="drafter" vendor={vendorOf(drafter)} value={model('drafter', drafter)} />
        {vendorOf(drafter)?.local ? (
          <input
            className="eg-input"
            name="drafter.baseUrl"
            defaultValue={p.seats.drafter?.baseUrl ?? vendorOf(drafter)?.baseUrl}
            aria-label="Where it answers"
          />
        ) : null}
      </fieldset>
      <fieldset className="seat" data-seat-row="voice">
        <legend>Voice</legend>
        <p className="eg-muted">{SEAT_TEXT.voice}</p>
        {pick('voice', voice, setVoice)}
        <Model seat="voice" vendor={vendorOf(voice)} value={model('voice', voice)} />
      </fieldset>
      <p className="eg-muted" style={{ margin: 0 }}>
        The checker is never the builder: the auditor list leaves out the builder’s company.
      </p>
      <button type="submit" className="eg-btn eg-btn--primary">
        {p.submit}
      </button>
    </form>
  );
}
