import { describe, expect, it } from 'vitest';
import type { Signoff } from '@rama/shared';
import { generateSigningKey, sealerFrom, verifySeal } from '../src/seal.ts';

const key = generateSigningKey();
const other = generateSigningKey();
const sealer = sealerFrom({ RAMA_SIGNING_KEY: key.privateKey })!;
const record: Signoff = {
  id: 's1',
  siteId: 'shop',
  person: 'Asha Rao',
  target: { kind: 'screen', id: '/gst', commit: 'abc1234def' },
  statement: 'GST this quarter shows ₹21,483.',
  at: '2026-10-24T10:00:00.000Z',
};

describe('seals on signatures', () => {
  it('seals a record so that only House of Rama’s public key verifies it, and only as written', () => {
    const sealed = { ...record, seal: sealer.seal(record) };
    expect(sealer.publicKey).toBe(key.publicKey);
    expect(verifySeal(sealed, key.publicKey)).toBe(true);
    expect(verifySeal(sealed, other.publicKey)).toBe(false);
    expect(verifySeal({ ...sealed, person: 'Someone Else' }, key.publicKey)).toBe(false);
    expect(
      verifySeal({ ...sealed, target: { ...record.target, commit: 'fff0000aaa' } }, key.publicKey),
    ).toBe(false);
    expect(verifySeal({ ...sealed, withdrawn: true }, key.publicKey)).toBe(false);
    expect(verifySeal(record, key.publicKey)).toBe(false);
    expect(verifySeal({ ...record, seal: 'not-a-seal' }, key.publicKey)).toBe(false);
    expect(verifySeal(sealed, 'not-a-key')).toBe(false);
  });

  it('is off without a key, and refuses a key that is not an Ed25519 private key', () => {
    expect(sealerFrom({})).toBeNull();
    expect(() => sealerFrom({ RAMA_SIGNING_KEY: 'nonsense' })).toThrow(
      /not an Ed25519 private key/,
    );
    expect(() => sealerFrom({ RAMA_SIGNING_KEY: key.publicKey })).toThrow(
      /not an Ed25519 private key/,
    );
  });
});
