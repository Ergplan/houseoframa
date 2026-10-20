# House style: traceable figures

How a target on the house stack (Next.js, TypeScript, Postgres, Drizzle) makes the figures on its screens traceable, so House of Rama can show, for every number a person reads, the formula behind it, its inputs, where they live, the commits that built it and who signed it off. A figure that does not follow this is shown **untraced**; there is no third state (Invariant 2).

## 1. Mark the figure on the screen

A traceable figure is one DOM element:

```tsx
<span
  data-rama-figure="bill-total" // the figure's id: lowercase, digits, dots and dashes
  data-rama-args={JSON.stringify([bill.lines])} // the arguments the screen computed it from (JSON array)
  data-rama-value={String(totalPaise)} // the raw value the element formats
>
  ₹{formatRupees(totalPaise)}
</span>
```

- `data-rama-figure` names the figure. The same id may appear on several screens.
- `data-rama-args` carries the exact arguments the screen passed to the function. House of Rama re-executes the function with them; without them the trail says the figure was not re-executed.
- `data-rama-value` is the unformatted result. The re-executed result must equal it. Without it the element's text is compared instead.
- Put the attributes on the smallest element that shows the number, so the hotspot sits on the number.

## 2. Map the figure to its code: `rama/figures.ts`

The target exports one mapping, in its own code, so it is reviewed and versioned with the code it describes:

```ts
// rama/figures.ts
export const figures = {
  'bill-total': {
    fn: 'billTotal', // the exported function that computes the figure
    file: 'lib/bill.ts', // its file, relative to the repository
    line: 12, // the line it starts on
    title: 'Bill total',
    what: 'What the customer is asked to pay on this bill.',
    english: 'Quantity times rate per line, plus GST at the line rate, rounded to the rupee.',
    inputs: [
      { label: 'Lines', source: 'billTotal(lines)', data: 'documents.lines' },
      {
        label: 'Rate pack',
        source: 'rules/gst/rates.json',
        data: 'rules/gst/rates.json (file constant)',
      },
    ],
    files: ['rules/gst/rates.json'], // more files whose commits belong to the figure's build trail
  },
};
```

- `fn` must be exported from `file` and callable with the element's `data-rama-args`. It must not need a request, a session, a database connection or a vendor key: a figure's formula is a pure function of its inputs.
- `inputs[].data` says where each input lives: `table.column`, a file constant, a fixture file, or browser storage. A missing `data` is shown as "not recorded".
- `english` is written by a person. House of Rama never drafts it.

## 3. Say how to photograph the app: `.rama/screens.json`

```json
{
  "app": {
    "install": "npm ci",
    "build": "npm run build",
    "start": "npm start -- -p {port}",
    "cwd": ".",
    "ready": "/"
  },
  "viewport": { "width": 390, "height": 844 },
  "roles": { "staff": { "query": "as=staff" } },
  "screens": [
    { "name": "bills", "title": "Bills", "route": "/bills", "role": "owner" },
    { "name": "bill", "route": "/bills/INV-042", "steps": [{ "waitFor": "[data-guide=paper]" }] }
  ]
}
```

- The app is built and started in its checkout with **no secrets**: the environment holds only `PATH`, `HOME` and `NODE_ENV`. A screen that cannot render without a database or a key cannot be captured; give the app a demo or fixture mode for its screens.
- `steps` run before the photograph: `click`, `fill` (with `value`), `press`, `waitFor`, `wait`.
- `roles` say how a role is put on. A role not listed adds nothing to the route.
- Screenshots are full-page: the viewport is grown to the page height, so fixed bars sit where the user sees them.

## 4. A target that does not follow this yet: `.rama/figures.json`

For a target whose code is not instrumented (EkBill, Stage 3), the mapping is written by hand in an overlay in the target's `.rama/`, reviewed like any overlay (Invariant 1). Each entry is a §2 entry plus:

- `title`, `what` and `english` are required;
- `screen` (a name or a list of names) and `selector` (CSS) say where it sits;
- `run` names a module, relative to the repository, whose default export re-executes the target's **own** function with the screen's inputs and returns `{ text, value, inputs: [{ label, value }] }`. `text` is formatted with the target's own formatter, the one the screen uses.

A harness may build the inputs the screen used (for example the demo viewer the screen is drawn for), but it never computes the figure itself and never retypes a value. If it cannot run, the trail says so and shows no value.

## 5. What House of Rama does with it

- **Capture** (`rama-trace capture <site>`) photographs every screen, records each figure's box and text, and records the bricks behind each screen (the route's import closure in the Blueprint).
- **Untraced figures.** Every figure no traced figure covers is recorded **untraced**: the smallest element whose text holds an amount or a percentage (an amount split across elements, like "₹" and "39,914", is marked once, around both), then every element whose whole text is a number (a count) and that is not inside one. A leading "+" or ten or more plain digits is an identifier (a phone number), not a figure. Last, conservatively, the smallest element with a number inside words ("13 bills", "40 din"): the detector cannot tell a count from a label, so such a number is marked untraced rather than left bare. Plain dates ("22 Sept", "12/10"), years and times, and identifiers mixing letters and digits ("INV-042", a GSTIN) are left alone. Every element is judged by its residual text, the visible text not inside a traced figure or a figure already marked, and each pass repeats until nothing new qualifies. So a figure is marked wherever it is drawn, even beside or around other figures, traced or not, including text directly in `<body>`. A detected figure's hotspot is drawn around the text it was judged by. Amounts and percentages use `figurePattern` (default `[₹$€£]\s?\d[\d,]*(\.\d+)?|\d+(\.\d+)?\s?%`). A `data-rama-figure` with no mapping is untraced too. All are outlined grey in the Showroom.
- **One trail per appearance.** A figure may appear on several screens with different arguments; each appearance is re-executed with its own and checked against its own screen.
- **Re-execution** happens in a separate Node process in the target's checkout: TypeScript through tsx, the `react-server` condition set (so `server-only` modules load as in the target's own scripts), and no environment beyond `PATH`, `HOME` and `NODE_ENV`. The result is compared with what the screen showed; whitespace does not count.
- **The trail** has five sections: the formula (English, code from the mapped line to where its braces close, file and line), the inputs with their re-executed values, where the data lives, the build trail (commits that touched the files, newest first), and review and sign-off (Stage 4).
- **The honest rate.** The Showroom states figures traced over figures shown. An untraced figure correctly shown as untraced is never scored as a failure.
