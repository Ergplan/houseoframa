// Numbers as people say them and as a transcript writes them: "three", "fifteen hundred", "1,500",
// "₹30.00", "five percent". Plain code, used both to read a spoken "what if" and to compare the
// numbers in what the voice said with the numbers it was given (mouth.ts).

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALES: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
  lakh: 100_000,
  lakhs: 100_000,
  million: 1_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
};

const isNumberWord = (w: string) => w in UNITS || w in TENS || w in SCALES;

/** The value of a run of number words ("fifteen hundred", "one thousand five hundred"), or null. */
export function wordsToNumber(words: string[]): number | null {
  if (!words.length || !words.every((w) => isNumberWord(w) || w === 'and')) return null;
  let total = 0;
  let current = 0;
  let any = false;
  for (const w of words) {
    if (w === 'and') continue;
    any = true;
    if (w in UNITS) current += UNITS[w]!;
    else if (w in TENS) current += TENS[w]!;
    else {
      const scale = SCALES[w]!;
      if (scale === 100) current = (current || 1) * 100;
      else {
        total += (current || 1) * scale;
        current = 0;
      }
    }
  }
  return any ? total + current : null;
}

/** A value said in words or digits ("three", "3", "1,500", "₹30") as a number, or null. */
export function spokenNumber(text: string): number | null {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[₹,]/g, '')
    .replace(/\b(rupees?|paise|cups?|percent)\b/g, '')
    .trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return wordsToNumber(t.split(/[\s-]+/).filter(Boolean));
}

/**
 * Every number in a text, as plain numbers: digits ("1,500", "₹30.00", "5%") and runs of number words
 * ("fifteen hundred", "thirty"). "a" and "an" are not counted as one.
 */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const words = text
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .split(/[^a-z0-9.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);
  let run: string[] = [];
  const flush = () => {
    while (run.length && run.at(-1) === 'and') run.pop();
    const n = wordsToNumber(run);
    if (n !== null) out.push(n);
    run = [];
  };
  for (const w of words) {
    if (/^\d+(\.\d+)?$/.test(w)) {
      flush();
      out.push(Number(w));
    } else if (isNumberWord(w) || (w === 'and' && run.length)) run.push(w);
    else flush();
  }
  flush();
  return out;
}
