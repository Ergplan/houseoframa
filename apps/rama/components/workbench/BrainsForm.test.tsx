import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VENDOR_REGISTRY } from '@rama/model';
import { BUILDER_OPTIONS } from '@rama/workbench';
import { BrainsForm } from './BrainsForm';

const render = (seats: Parameters<typeof BrainsForm>[0]['seats']) =>
  renderToStaticMarkup(
    <BrainsForm
      action="/api/settings/brains"
      seats={seats}
      vendors={VENDOR_REGISTRY}
      builders={BUILDER_OPTIONS}
      submit="Save the brains"
    />,
  );
/** The vendors offered for a seat, by the select's options. */
const offered = (html: string, seat: string) => {
  const select = new RegExp(`<select[^>]*name="${seat}\\.vendor"[^>]*>([\\s\\S]*?)</select>`).exec(
    html,
  )?.[1];
  return [...(select ?? '').matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
};

describe('Settings → Brains (the builder is never the auditor, Invariant 5)', () => {
  it('leaves the builder’s company off the auditor list: Claude Code builds, so Anthropic cannot check', () => {
    const html = render({
      builder: { vendor: 'anthropic', model: 'claude-sonnet-5-5', builder: 'claude-code' },
    });
    const auditors = offered(html, 'auditor');
    expect(auditors).not.toContain('anthropic');
    expect(auditors).toEqual(
      expect.arrayContaining(['openai', 'gemini', 'grok', 'kimi', 'ollama']),
    );
    // Every other seat still offers the builder's company.
    expect(offered(html, 'drafter')).toContain('anthropic');
  });

  it('follows the builder: with Codex (OpenAI) building, OpenAI is off the list and Anthropic is on', () => {
    const html = render({
      builder: { vendor: 'openai', model: 'gpt-6.1-sol', builder: 'codex' },
      auditor: { vendor: 'openai', model: 'gpt-6.1-sol' },
    });
    expect(offered(html, 'auditor')).not.toContain('openai');
    expect(offered(html, 'auditor')).toContain('anthropic');
    // A stored auditor of the builder's company is not kept: the first other company is chosen.
    expect(html).not.toMatch(
      /name="auditor\.vendor"[^>]*>[\s\S]*?<option selected="" value="openai"/,
    );
    expect(html).toContain('data-unwired');
    expect(html).toContain('Codex is not wired as a builder yet');
  });

  it('asks Ollama where it answers, and offers the voice only to a vendor that can speak', () => {
    const html = render({
      builder: { vendor: 'anthropic', model: 'claude-sonnet-5-5', builder: 'claude-code' },
      auditor: { vendor: 'ollama', model: 'llama4' },
    });
    expect(html).toContain('name="auditor.baseUrl"');
    expect(html).toContain('value="http://localhost:11434/v1"');
    expect(offered(html, 'voice')).toEqual(['openai']);
  });
});
