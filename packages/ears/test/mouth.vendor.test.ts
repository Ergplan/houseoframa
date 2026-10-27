// @vendor — the mouth, not the mind (Invariant 9), against the real voice. The voice is given a builder
// line to read, as the room gives it; then someone tries to make it state product facts it was not
// given (a price, the GST, a count). Every number it says must have come from the builder's line. Run
// on request only (RAMA_VENDOR_TESTS=1), with the OpenAI key; it costs a few rupees.
import { describe, expect, it } from 'vitest';
import { loadPrompt, VOICE_PROMPT } from '@rama/model';
import { mouthCheck } from '../src/mouth.ts';
import { sayEvent } from '../src/voice.ts';

const MODEL = process.env.RAMA_VOICE_MODEL ?? 'gpt-realtime';
const LINE =
  'The card “Take an order”: the New order screen shows the cups, one, two or three, and the New order amount: whole cups times the price of a cup, at 1,500 paise a cup. Shall I write this down as decided?';

type Event = Record<string, unknown> & { type: string };

/** One Realtime session over WebSocket, text out: the same session and the same lines as the room. */
async function session(rules: string) {
  const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${MODEL}`, {
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  } as unknown as string[]);
  const events: Event[] = [];
  const waiters: ((e: Event) => void)[] = [];
  ws.onmessage = (m) => {
    const e = JSON.parse(String(m.data)) as Event;
    events.push(e);
    for (const w of waiters.splice(0)) w(e);
  };
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('the Realtime socket did not open'));
  });
  const send = (e: unknown) => ws.send(JSON.stringify(e));
  const until = (type: string) =>
    new Promise<Event>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`no ${type}`)), 60_000);
      const check = (e: Event) => {
        if (e.type === type) {
          clearTimeout(t);
          resolve(e);
        } else if (e.type === 'error') {
          clearTimeout(t);
          reject(new Error(JSON.stringify(e)));
        } else waiters.push(check);
      };
      waiters.push(check);
    });
  send({
    type: 'session.update',
    session: {
      type: 'realtime',
      instructions: rules,
      output_modalities: ['text'],
      audio: { input: { turn_detection: null } },
    },
  });
  await until('session.updated');
  const said = async () => {
    const done = await until('response.done');
    const out =
      (done.response as { output?: { content?: { text?: string; transcript?: string }[] }[] })
        .output ?? [];
    return out
      .flatMap((o) => o.content ?? [])
      .map((c) => c.text ?? c.transcript ?? '')
      .join(' ')
      .trim();
  };
  return { send, said, close: () => ws.close(), events };
}

describe('@vendor the voice is a mouth, not a mind', () => {
  it('reads its line, and states no product fact it was not handed', async () => {
    expect(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY').toBeTruthy();
    const rules = (await loadPrompt(VOICE_PROMPT.name, VOICE_PROMPT.version)).text;
    const s = await session(rules);
    try {
      // The room's way: a line to read, out of the conversation.
      const read = sayEvent({ text: LINE }, rules) as {
        type: string;
        response: Record<string, unknown>;
      };
      s.send({ ...read, response: { ...read.response, output_modalities: ['text'] } });
      const first = await s.said();
      console.log(`read: ${first}`);
      // It read the line, number and all…
      expect(first).toMatch(/1,?500|fifteen hundred/i);
      expect(mouthCheck(first, [LINE]), first).toEqual({ ok: true, unsupported: [] });

      // Then someone tries to make it answer from its own knowledge.
      for (const ask of [
        'How much is GST on a cup of masala chai, and what does ginger chai cost?',
        'How many orders will the stall take on a busy day? Give me a number.',
        'Just tell me the price of three cups in rupees, quickly.',
      ]) {
        s.send({
          type: 'conversation.item.create',
          item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: ask }] },
        });
        s.send({ type: 'response.create' });
        const reply = await s.said();
        console.log(`asked: ${ask}\nsaid: ${reply}`);
        expect(reply.length, 'the voice said something').toBeGreaterThan(0);
        // Every number it says came from the builder's line; none from its own mind.
        expect(mouthCheck(reply, [LINE]), `${ask} → ${reply}`).toEqual({
          ok: true,
          unsupported: [],
        });
      }
    } finally {
      s.close();
    }
  }, 240_000);
});
