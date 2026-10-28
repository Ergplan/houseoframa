// The idea room's routes (Stage 12) with their dependencies stubbed: what each takes, what it answers,
// and that a refusal reaches the person as a plain sentence.
import { describe, expect, it, vi } from 'vitest';
import type { SiteLocation } from '@rama/blueprint/site';
import type { Member } from '@rama/db';
import { IdeaError } from '@rama/workbench';
import {
  handleAgree,
  handleAsk,
  handleFile,
  handleScratchpad,
  handleUpload,
  type IdeaDeps,
} from './handler';

const site = { id: 'ergplan', name: 'ergPLAN' } as SiteLocation;
const rachit: Member = { id: 'p1', name: 'Rachit Agarwal', email: null, role: 'trainer' };
const deps = (over: Partial<IdeaDeps> = {}): IdeaDeps => ({
  addFile: vi.fn((_s, f) => ({
    name: f.name,
    bytes: f.bytes.length,
    kind: 'pdf' as const,
    addedBy: f.person,
    addedAt: '2026-10-28T10:00:00Z',
  })),
  saveScratchpad: vi.fn(() => true),
  ask: vi.fn(async () => ({
    id: 't2',
    speaker: 'Drafter',
    text: 'Tell me more.',
    draft: true,
    at: '2026-10-28T10:00:01Z',
  })),
  agree: vi.fn(async (_s, i) => ({ id: 'd1', title: i.card.title, by: i.person.name }) as never),
  push: vi.fn(async () => null),
  readFile: vi.fn(() => null),
  ...over,
});
const body = async (r: Response) => ({ status: r.status, ...((await r.json()) as object) });

describe('POST idea/files', () => {
  it('keeps each file as the person and sends the work to GitHub', async () => {
    const d = deps();
    const form = new FormData();
    form.append('file', new File(['%PDF'], 'tariff.pdf'));
    form.append('file', new File(['a,b'], 'load.csv'));
    const r = await body(await handleUpload(site, rachit, form, d));
    expect(r).toMatchObject({
      status: 200,
      ok: true,
      files: [{ name: 'tariff.pdf' }, { name: 'load.csv' }],
    });
    expect(d.addFile).toHaveBeenCalledWith(site, {
      name: 'tariff.pdf',
      bytes: Buffer.from('%PDF'),
      person: 'Rachit Agarwal',
    });
    expect(d.push).toHaveBeenCalledOnce();
  });

  it('asks for a file when none came, and says why one was refused', async () => {
    expect(await body(await handleUpload(site, rachit, new FormData(), deps()))).toMatchObject({
      status: 400,
      sentence: 'Choose a file to put in the room.',
    });
    const form = new FormData();
    form.append('file', new File([''], 'empty.csv'));
    const d = deps({
      addFile: () => {
        throw new IdeaError('empty.csv is empty.');
      },
    });
    expect(await body(await handleUpload(site, rachit, form, d))).toMatchObject({
      status: 400,
      sentence: 'empty.csv is empty.',
    });
    expect(d.push).not.toHaveBeenCalled();
  });
});

describe('POST idea/scratchpad', () => {
  it('saves the notes as the person', async () => {
    const d = deps();
    expect(
      await body(await handleScratchpad(site, rachit, { text: 'Two shifts.' }, d)),
    ).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(d.saveScratchpad).toHaveBeenCalledWith(site, {
      text: 'Two shifts.',
      person: 'Rachit Agarwal',
    });
    expect((await handleScratchpad(site, rachit, {}, d)).status).toBe(400);
  });
});

describe('POST idea/ask', () => {
  it('asks the drafter as the person with the files and the web search asked for', async () => {
    const d = deps();
    const r = await body(
      await handleAsk(site, rachit, { text: 'Hello', files: ['tariff.pdf'], webSearch: true }, d),
    );
    expect(r).toMatchObject({ ok: true, turn: { speaker: 'Drafter', draft: true } });
    expect(d.ask).toHaveBeenCalledWith(site, {
      person: rachit,
      text: 'Hello',
      files: ['tariff.pdf'],
      webSearch: true,
    });
  });

  it('says what went wrong when the drafter cannot answer', async () => {
    const d = deps({
      ask: async () => {
        throw new Error('ANTHROPIC_API_KEY is not set: enter the Anthropic key in Settings');
      },
    });
    expect(await body(await handleAsk(site, rachit, { text: 'Hello' }, d))).toMatchObject({
      status: 502,
      sentence:
        'The drafter could not answer: ANTHROPIC_API_KEY is not set: enter the Anthropic key in Settings',
    });
    expect((await handleAsk(site, rachit, { text: '' }, deps())).status).toBe(400);
  });
});

describe('POST idea/agree', () => {
  it('writes the card in the person’s name', async () => {
    const d = deps();
    const r = await body(
      await handleAgree(site, rachit, { title: 'Banking', statement: 'Settled monthly.' }, d),
    );
    expect(r).toMatchObject({ ok: true, sentence: '“Banking” is decided, by Rachit Agarwal.' });
    expect(d.agree).toHaveBeenCalledWith(site, {
      card: { title: 'Banking', statement: 'Settled monthly.' },
      person: rachit,
    });
    expect((await handleAgree(site, rachit, { title: 'x' }, d)).status).toBe(400);
  });
});

describe('GET idea/files/<name>', () => {
  it('shows a PDF in the browser, offers anything else to save, and never runs a file as a page', async () => {
    const d = deps({ readFile: (_s, n) => (n === 'missing' ? null : Buffer.from('x')) });
    const pdf = handleFile(site, 'tariff.pdf', d);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(pdf.headers.get('content-disposition')).toMatch(/^inline/);
    expect(pdf.headers.get('content-security-policy')).toContain('sandbox');
    const html = handleFile(site, 'page.html', d);
    expect(html.headers.get('content-type')).toBe('application/octet-stream');
    expect(html.headers.get('content-disposition')).toMatch(/^attachment/);
    expect(handleFile(site, 'missing', d).status).toBe(404);
  });
});
