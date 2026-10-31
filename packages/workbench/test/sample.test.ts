// The sample Test drive builds is the one its recording was made of: the Chai Stall by default, or the
// sample a recording names in its sample.json (Read my bill), with the state each screen ends in.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { CHAI_STALL, sampleOf, sampleRecording } from '../src/sample.ts';

const fixtures = path.resolve(import.meta.dirname, '../../../fixtures');

describe('the sample of a recording', () => {
  it('is the Chai Stall when the recording names none', () => {
    expect(sampleOf(path.join(fixtures, 'sample-build'))).toEqual(CHAI_STALL);
    expect(CHAI_STALL.states).toEqual({
      '/': 'Confirmed',
      '/new': 'Confirmed',
      '/total': 'Verified',
    });
  });

  it('is Read my bill from its own sample.json, its two customer screens to be Confirmed', () => {
    const s = sampleOf(path.join(fixtures, 'sample-build-bill'));
    expect(s.name).toBe('Read my bill (Test drive)');
    expect(s.cards).toHaveLength(7);
    expect(s.screens).toBe(2);
    expect(s.states).toEqual({ '/': 'Confirmed', '/check': 'Confirmed' });
  });

  it('is read from RAMA_SAMPLE_RECORDING when an engineer sets it', () => {
    expect(sampleRecording({ RAMA_SAMPLE_RECORDING: '/x/y' })).toBe('/x/y');
    expect(sampleRecording({ RAMA_HOME: '/home/r' })).toMatch(/fixtures\/sample-build$/);
  });
});
