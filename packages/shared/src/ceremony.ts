/** A decision card from a discovery session. */
export interface Decision {
  /** Decision identifier. */
  id: string;
  /** The site the decision belongs to. */
  siteId: string;
  /** Short title. */
  title: string;
  /** The decision as stated and confirmed. */
  statement: string;
  /** Paths of the bricks the decision concerns. */
  bricks: string[];
  /** The screen the decision concerns, when there is one. */
  screenId?: string;
  /** Whether the decision is made, still open, or made but not built. */
  status: 'decided' | 'open' | 'not-built';
  /** The person who recorded the decision. */
  by: string;
  /** When the decision was recorded, ISO 8601. */
  at: string;
  /** True when the record was reconstructed after the fact rather than captured live. */
  reconstructed?: boolean;
}

/** A named signature on a screen or brick at a commit. Append-only: a reversal is a new Signoff that supersedes the old one. */
export interface Signoff {
  /** Signoff identifier. */
  id: string;
  /** The site the signature belongs to. */
  siteId: string;
  /** The person who signed. */
  person: string;
  /** What was signed: a screen or brick, at a commit. */
  target: { kind: 'screen' | 'brick'; id: string; commit: string };
  /** The statement the person signed. */
  statement: string;
  /** When it was signed, ISO 8601. */
  at: string;
  /** The Signoff this one reverses or replaces, when any. */
  supersedes?: string;
}
