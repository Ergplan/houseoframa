/** One verdict from an audit on one brick. */
export interface Finding {
  /** Finding identifier. */
  id: string;
  /** The audit that produced the finding. */
  auditId: string;
  /** Path of the brick the finding concerns. */
  brick: string;
  /** The check that produced the finding (MASTER-PROMPT §7.3). */
  check: string;
  /** Pass, a note, or a defect. */
  verdict: 'pass' | 'note' | 'defect';
  /** The finding in words. */
  text: string;
  /** File the finding points at, when any. */
  file?: string;
  /** Line the finding points at, when any. */
  line?: number;
}
