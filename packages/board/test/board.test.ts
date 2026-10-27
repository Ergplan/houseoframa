// The board, minimal (Stage 10): a frame is read through packages/model (board.v1, the drafter seat,
// with the picture), kept with its reading as a draft, and listed newest first. Nothing else is written.
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { call } from '@rama/model';
import { boardFrame, listBoards, readBoard } from '../src/board.ts';

const work = mkdtempSync(path.join(tmpdir(), 'rama-board-'));
const env = { ...process.env, RAMA_WORK_DIR: work };
afterAll(() => rmSync(work, { recursive: true, force: true }));

// A one-pixel PNG: the frame's content does not matter to a stand-in reader.
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('reading the board', () => {
  it('sends the frame to the drafter seat with board.v1 and keeps the reading as a draft', async () => {
    const asked: Parameters<typeof call>[0][] = [];
    const stand = (async (req: Parameters<typeof call>[0]) => {
      asked.push(req);
      return {
        output: {
          boxes: [
            { id: 'b1', label: 'Orders' },
            { id: 'b2', label: 'Day total' },
          ],
          arrows: [
            { from: 'b1', to: 'b2', label: 'add up' },
            { from: 'b2', to: 'b9', label: '' },
          ],
          labels: ['GST 5%?'],
        },
        callId: 'c1',
        vendor: 'anthropic',
        model: 'claude-sonnet-5-5',
        attempts: 1,
        inputTokens: 1,
        outputTokens: 1,
      };
    }) as unknown as typeof call;
    const d = await readBoard(
      {
        siteId: 'chai',
        product: 'Chai',
        image: { mediaType: 'image/png', base64: PIXEL },
        by: 'Tara',
        createdBy: 'p1',
      },
      { env, call: stand, now: () => new Date('2026-10-27T10:00:00Z') },
    );
    expect(asked[0]).toMatchObject({
      name: 'board',
      version: 1,
      role: 'drafter',
      input: { product: 'Chai' },
    });
    expect(asked[0]!.images).toEqual([{ mediaType: 'image/png', base64: PIXEL }]);
    expect(d).toMatchObject({
      by: 'Tara',
      draft: true,
      loose: 1,
      frame: '2026-10-27T10-00-00-000Z.png',
    });
    expect(readdirSync(path.join(work, 'chai/board')).sort()).toEqual([
      '2026-10-27T10-00-00-000Z.json',
      '2026-10-27T10-00-00-000Z.png',
    ]);
    expect(listBoards('chai', env)[0]!.reading.boxes.map((b) => b.label)).toEqual([
      'Orders',
      'Day total',
    ]);
    expect(boardFrame('chai', d.frame, env)!.length).toBeGreaterThan(0);
    expect(boardFrame('chai', '../../etc/passwd', env)).toBeNull();
  });

  it('refuses an empty frame before any model is asked', async () => {
    const never = (async () => {
      throw new Error('asked');
    }) as unknown as typeof call;
    await expect(
      readBoard(
        {
          siteId: 'chai',
          product: 'Chai',
          image: { mediaType: 'image/jpeg', base64: '' },
          by: 'Tara',
          createdBy: 'p1',
        },
        { env, call: never },
      ),
    ).rejects.toThrow('the frame is empty');
  });
});
