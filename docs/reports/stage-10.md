# Stage 10 — Ears

Built 2026-10-27, from tag `stage-10-start`.

## Where this stage stands

The voice is in the room, as a mouth and not a mind. A rehearsal of acts 1 to 3 on the sample product ran by voice, through OpenAI's real Realtime voice, with recorded audio standing in for the member's microphone (`tests/stage-10.vendor.e2e.test.ts`, run once, green, 3 minutes):

- **Act 1.** The voice greeted "Rachit Agarwal" by name and said what it is: it asks, reads back and writes nothing down.
- **Act 2, the idea and the brains.** It heard the idea, then asked the brains first, reading the rule aloud: "the checker is never the builder". It heard "Claude Code builds, OpenAI checks, and OpenAI speaks" and read it back. A spoken "Yes." recorded the brains on a card, decided by Rachit Agarwal.
- **Act 2, the cards.** It read each of the sample's seven cards, which the trainer had drafted open, and asked "Shall I write this down as decided?". Each spoken "Yes." decided that card in Rachit Agarwal's name, with his own person id, an `audit_log` row, and a line in the product's `.rama/decisions.jsonl`.
- **Act 3.** Close ideation brought the design aloud, building by building, with "What it will not do", then "That is the design. Shall I build this?". The answer, "Yes, build it.", is the first signature: the card "Yes, build it", decided by Rachit Agarwal, holding the design as it was read.
- **Throughout.** Every utterance is a turn with its speaker. The voice said no number it was not handed: the mouth check found nothing to flag in any of its turns.

What is left for the stage's "done when" is the member doing this himself, in his own voice (see Open questions). Everything it needs is built and tested.

## What was built

**`packages/ears`**

- `grammar.ts`: `parseCommand`, plain code. It reads yes, no, scrap everything, show me \<building\>, open \<screen\>, show me the code, go back, what if \<input\> is \<value\>, and read the board. It also reads the six track questions ("where does this number come from", "how is it worked out", "what goes into it", "where is it kept", "who built it", "who signed it"), naming a figure or meaning the one in front. A command counts only when the whole utterance is one: "Yes, and it should also print a bill" is talk, not a yes.
- `track.ts`: `answerTrack` answers each question from the figure's trail and from nothing else. Formula location and whether it came out the same when worked out again; the formula in words; the inputs with their values; where they are kept; the changes that built it; the signature. A figure with no trail is answered as untraced, with its name. So is a step the trail does not hold.
- `mouth.ts`: `mouthCheck` lists the numbers in what the voice said (digits or words: "fifteen hundred paise", "thirty rupees") that no line handed to the voice holds.
- `brains.ts`: the brains as spoken ("Claude Code builds, OpenAI checks…"), over Stage 9's seats and refused by Stage 9's rule; and the read-back without model names.
- `conductor.ts`: the builder's side of the room. `hear()` stores the turn with its speaker, then reads it.
  - The order of act 2: the brains first, then each open card, then the drafter's next question (`discovery.v1`).
  - A yes decides only what the voice was given to ask: the card it read, the brains it read back, "Scrap everything?", "Shall I build this?". It is recorded by the speaker. A yes to nothing decides nothing.
  - Scrap everything asks first. On a yes it withdraws every card, keeping them, and starts a named draft.
  - Show me, open, the code and go back move the room. Track questions and "what if" are answered.
  - `agree()` is act 3: refused while a card is open. Otherwise the narration, each building shown as it is read when the product has a Street, then "Shall I build this?". The builder's narration is said to be its draft, none of it decided until a yes, and each such line is marked unconfirmed in the room; the "Yes, build it" card records that the yes confirmed the builder's draft.
- `room.ts`: the conductor on the real records.
  - Turns go into the discovery session, and cards through `decide` (append-only, audited, mirrored).
  - The brains go through `chooseProductSeats`.
  - Figures and trails come from the capture of the current commit.
  - `narrateDesign` has the builder seat write the design from the decided cards (`narrate.v2`). A line holding a number no card holds is refused, and so is a narration that cannot be had; then each card is read as decided, word for word.
  - `whatIf` runs the figure's own function in the sandbox with one input changed, and writes the answer the way the screen writes it.
  - The room's state is kept in `work/<site>/voice.json`.
- `voice.ts`: `sayEvent`, the one event that makes the voice read a line. It is an out-of-band `response.create` carrying `voice.v1` and the line, built on the server.
- `rehearsal.ts`: `newRehearsal`, a new product with the sample's cards drafted open in the trainer's name.

**`packages/model`**

- `openVoice`: the browser's SDP offer goes to OpenAI's Realtime API from the server, with the key from Settings and the session House of Rama chooses:
  - `voice.v1` as the voice's instructions;
  - input transcribed in English;
  - turn detection off, so push-to-talk, and the voice never answers on its own.

  One `model_calls` row for opening it. `recordVoiceLine` writes one row for each line the voice reads: the line, what it actually said, and the vendor's tokens.

- Pictures in a call, for Anthropic and OpenAI and the compatible adapter.
- `synthesize`, the speech model through the usual path (prompt `clip.v1`), used only to record the rehearsal's audio.

**`packages/board`, minimal.** `readBoard` reads one frame into boxes, arrows and labels (`board.v1`, the drafter seat, the frame sent as a picture). The frame and its reading are kept under `work/<site>/board/` and shown as a draft. Nothing is decided from it.

**The app**

- **The voice's room, in Harmony's VoiceBar.** It sits at the foot of every page of a product (`app/site/[siteId]/layout.tsx`), so "show me" moves the room by client-side navigation and the call stays up.
  - Before a session, the site office offers the room: who is in it, then "Start the session with the voice".
  - Each person has "Hold to talk", and the transcript keeps who said what.
  - Without a key, the stand-in voice shows and speaks each line, and takes what each person said as typed text.
- **Routes:** `voice/start`, `voice/heard`, `voice/said`, `voice/agree`, `voice/session` and `voice/end`; `board` and `board/[frame]`; `/api/rehearsal`.
- **Close ideation** is enabled in the console: it opens act 3 in the room.
- **"Start a rehearsal"** is on the Test drive page, for a trainer.
- **"This number"** is the figure picked on the Building level, now kept in the address.

**`fixtures/rehearsal`:** the rehearsal's script (what the member says, in order) and its audio clips, recorded by `pnpm record-rehearsal`.

## Tests

- **Command grammar:** every command and track question said the ways people say them, and talk that only looks like a command (`packages/ears/test/grammar.test.ts`).
- **Mouth not mind.**
  - Unit: a reading of the line passes in digits or words, and a number no line gave is reported (`track.test.ts`). The route keeps the voice's turn and flags such a number in the record (`voice/handler.test.ts`).
  - Live, `@vendor` (`packages/ears/test/mouth.vendor.test.ts`, run once, green). The real voice, with `voice.v1`, read its builder line ("…at 1,500 paise a cup…"). Then it was asked three times for product facts it was not given: "How much is GST on a cup of masala chai, and what does ginger chai cost?", "How many orders will the stall take on a busy day? Give me a number." and "Just tell me the price of three cups in rupees, quickly." It answered each time, in its own words, that it can only read the lines it is handed, and said no number.
- **Track questions from trail fixtures:**
  - each of the six answered from its step;
  - untraced answered as untraced with the figure's name, for a missing trail and for each missing step;
  - no answer holds a number its trail does not (`track.test.ts`).
- **Spoken yes creates a decision with the right name.**
  - The conductor on records kept in memory (`conductor.test.ts`).
  - On Postgres (`room.test.ts`): the decided card's `by` and `created_by` are the speaker's, with an `audit_log` row and the mirror line. A speaker not in `members.json` is refused.
- **Other ears tests:** "what if" against the real sandbox (`whatif.test.ts`); the narration, live on a real model (`narrate.vendor.test.ts`, see Deviations); the board (`packages/board/test/board.test.ts`); the Realtime session against a stand-in vendor, a line's row, and pictures in each adapter (`packages/model/src/realtime.test.ts`).
- **Routes:** the room's routes and the rehearsal's (`voice/handler.test.ts`, `rehearsal/handler.test.ts`, `authz.test.tsx`), and Close ideation (`act/handler.test.ts`).
- **E2e rehearsal on the sample product with recorded audio:**
  - `tests/stage-10.e2e.test.ts` (the watcher's): the script's words given to the stand-in voice in a real browser. Acts 1 to 3, every card decided by the member's spoken yes, "Yes, build it" last, every turn with its speaker, no flag.
  - `tests/stage-10.vendor.e2e.test.ts` (`@vendor`): the recorded audio played into OpenAI's real voice in place of the microphone (the account above).

## Deviations and readings of the prompt

- **The voice is the Realtime API, not OpenAI's newer "GPT-Live" interface.** The prompt names "GPT Live (OpenAI Realtime, WebRTC)". OpenAI now also offers `/v1/live/sessions`, whose sessions delegate questions to a reasoning model with tools: a mind behind the mouth. The Realtime API lets every word the voice says be a line House of Rama hands it, so it is the one wired (DECISIONS).
- **`narrate.v2`, not `narrate.v1`.** The prompt names `narrate.v1`. On its first live run, v1's lines each ended with "Shall I build this?", which the room asks once itself, so v2 says not to ask. Prompts are never edited in place.
- **The session is started from the site office**, where the room is offered, rather than by a console button. The console's Start session leads there, and its Close ideation opens act 3 in the room.
- **"Yes, build it" is a decision card, not a row in `signoffs`.** A signature names a screen or brick at a commit, and before the build there is neither. The screens' own signatures come at the walkthrough.
- **The mouth check sees numbers.** What keeps every other fact out is that the voice is only ever handed lines and never takes a turn of its own (KNOWN-GAPS).
- **Talk is not yet turned into cards.** Act 2 reads cards the trainer drafted. The rehearsal's cards are the sample's, drafted open.
- **The narration was run live on OpenAI's model, not the builder's.** The Anthropic account answered "Your credit balance is too low to access the Anthropic API". With no builder key, act 3 reads the cards as decided, which is what the live e2e shows.
- **The voice's audio cost is not priced.** OpenAI prices audio tokens apart from text, and the price table holds no price for them. The live runs were made against throwaway databases, so their rows went with them.

## Reviewer findings

The reviewer (OpenAI, gpt-6.1-sol, fresh context, `pnpm review 10`) ran 3 times; every run is in `docs/reports/stage-10.review.md`.

Fixed in code:

- **Run 1: the builder's narration was not marked as drafted** (Invariant 6). Now the voice says before it that the design is the builder's draft and none of it is decided until a yes. The room marks each such line "drafted by the builder, unconfirmed until a named yes", and the "Yes, build it" card records that the yes confirmed the builder's draft.
- **Run 1: the room did not move to each building as it was read** (a report claim the code did not support). Each line now carries its place as an address, and the room goes there before the line is read.
- **Run 2: the drafter's next question was not marked as drafted.** It is now, as a question drafted by the drafter that decides nothing.

Not resolved by code:

- **Run 3 found no code defect.** Its three items, and the same items in runs 1 and 2, are cannot-tell:
  - (c) the decision writers' append-only and audit guards are in code outside the diff (they stand from Stage 4, and `room.test.ts` checks the `audit_log` row of a spoken yes);
  - (d) the drift checks and CI wiring are outside the diff;
  - (e) the live runs are history a diff cannot prove. Their output is quoted above; the clips and the tests are in the repository.

## Real model cost

`pnpm cost 10`:

| What                        | Model           | Calls | Cost       |
| --------------------------- | --------------- | ----- | ---------- |
| Independent reviewer        | gpt-6.1-sol     | 3     | ₹55        |
| The rehearsal's audio clips | gpt-4o-mini-tts | 4     | not priced |
| **Recorded total**          |                 |       | **₹55**    |

Not in that table:

- **The live runs** (the mouth test, the narration, the rehearsal through the real voice) wrote their rows to throwaway databases, or none, so they are not counted here. Two of them went through the Realtime API, whose audio tokens have no price in the table (KNOWN-GAPS). The narration was one call of `gpt-6.1-sol`, a few rupees.
- **One narration call to Anthropic** went out from a test before the room's model calls were bound to its own environment. Its answer was not recorded; with the account's credit as it was later that night, it was most likely refused and nothing charged.

## Open questions

- **The member's own rehearsal, by voice.** This is the stage's last "done when", and only you can do it. Two things stand in the way:
  - **The microphone needs a secure page.** The box is plain http, so a browser will not give it the microphone. Either:
    - open House of Rama on `localhost` through a tunnel: `ssh -L 3000:localhost:3000` to this VM, then http://localhost:3000; or
    - redeploy the box with Stage 10 and, in Chrome, add http://34.131.209.81:3389 under chrome://flags/#unsafely-treat-insecure-origin-as-secure.

    Then: Test drive → Start a rehearsal → in the site office, tick yourself → Start the session with the voice → hold your button and talk.

  - **Redeploying the box with Stage 10** waits for your word.
- **The Anthropic account's credit balance is too low.** Claude Code builds, the builder's narration and drafting on Anthropic stop until it is topped up. Until then, Test drive replays the recorded build, and act 3 reads the cards as decided.
- **The box is open to anyone with its address** (Stage 9's question stands). With the voice, someone there could also spend on the OpenAI key's Realtime minutes.
- **The voice's price.** Add the Realtime audio prices to the table (from OpenAI's price list), or keep showing those rows as not priced?
