// The mouth, not the mind (Invariant 9): every product fact the voice speaks is text the builder handed
// it. The facts this check can see are numbers (amounts, counts, percentages, prices), whether the
// transcript writes them in digits or in words. A number in what the voice said that no line handed to
// it in this session holds is reported; the room shows it as a grey flag and the record keeps it.
import { numbersIn } from './numbers.ts';

/** The forms a number may take once spoken: ₹30.00 is said "thirty rupees", 1,500 "fifteen hundred". */
function forms(n: number): number[] {
  // Paise said as rupees, and rupees as paise: the builder's line may say either.
  return [n, Math.round(n * 100), n / 100];
}

export interface MouthReport {
  /** True when every number the voice said came from a line it was given. */
  ok: boolean;
  /** Numbers the voice said that no line it was given holds. */
  unsupported: number[];
}

/**
 * Checks what the voice said against the lines the builder handed it. Small counting words in the
 * voice's own acknowledgements ("one moment") are allowed only when a line holds them too: nothing is
 * exempt.
 */
export function mouthCheck(said: string, given: string[]): MouthReport {
  const allowed = new Set(given.flatMap((l) => numbersIn(l).flatMap(forms)));
  const unsupported = numbersIn(said).filter((n) => !allowed.has(n));
  return { ok: unsupported.length === 0, unsupported: [...new Set(unsupported)] };
}
