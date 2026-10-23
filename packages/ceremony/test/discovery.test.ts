import { describe, expect, it, vi } from 'vitest';
import { DISCOVERY_COMPONENT, draftQuestion } from '../src/discovery.ts';

describe('draftQuestion', () => {
  it('asks the builder through prompt discovery.v1 with the last 30 turns and the cards, and trims the question', async () => {
    const call = vi.fn(async () => ({ output: { question: '  Who signs a bill?  ' } }));
    const turns = Array.from({ length: 35 }, (_, i) => ({ speaker: 'Asha', text: `turn ${i}` }));
    const q = await draftQuestion(
      {
        site: 'Shop',
        turns,
        decisions: [
          {
            id: 'd',
            siteId: 's',
            title: 'T',
            statement: 'S',
            bricks: ['x'],
            status: 'open',
            by: 'b',
            at: 'a',
          },
        ],
      },
      { siteId: 's', call: call as never },
    );
    expect(q).toBe('Who signs a bill?');
    const req = (call.mock.calls[0] as unknown[])[0] as Record<string, unknown> & {
      input: { turns: unknown[] };
    };
    expect(req).toMatchObject({
      name: 'discovery',
      version: 1,
      role: 'builder',
      siteId: 's',
      createdBy: DISCOVERY_COMPONENT,
    });
    expect(req.input.turns).toHaveLength(30);
    expect(req.input.turns[0]).toEqual({ speaker: 'Asha', text: 'turn 5' });
    expect(req.input).toMatchObject({
      decisions: [{ title: 'T', statement: 'S', status: 'open' }],
    });
  });
});
