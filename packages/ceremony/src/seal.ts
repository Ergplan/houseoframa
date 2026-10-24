// Seals on signatures. House of Rama signs every signature record it writes with an Ed25519 private key
// held by the server (RAMA_SIGNING_KEY, a secret in .env), over the record's canonical JSON without the
// seal. The gate verifies the seal against the public key it is handed by the workflow on the base branch,
// so a signature line typed into `.rama/signoffs.jsonl` by hand, or edited, counts for nothing.
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  type KeyObject,
} from 'node:crypto';
import type { Signoff } from '@rama/shared';
import { line } from './records.ts';

/** What is sealed: the record as its line, with no seal. */
const sealed = (record: Signoff) => Buffer.from(line({ ...record, seal: undefined }));

export interface Sealer {
  seal: (record: Signoff) => string;
  /** The public key, base64 SPKI DER: what the gate is given. */
  publicKey: string;
}

const privateFrom = (b64: string): KeyObject =>
  createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' });
const publicFrom = (b64: string): KeyObject =>
  createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });

export class SealError extends Error {
  override name = 'SealError';
}

/** The sealer for RAMA_SIGNING_KEY, or a SealError: no signature is written without one. */
export function requireSealer(env: Record<string, string | undefined> = process.env): Sealer {
  const s = sealerFrom(env);
  if (!s)
    throw new SealError(
      'RAMA_SIGNING_KEY is not set, so no signature can be sealed: run `pnpm rama-ceremony signing-key`',
    );
  return s;
}

/** The sealer for RAMA_SIGNING_KEY (base64 PKCS#8 DER of an Ed25519 key), or null when none is configured. */
export function sealerFrom(env: Record<string, string | undefined> = process.env): Sealer | null {
  const raw = env.RAMA_SIGNING_KEY?.trim();
  if (!raw) return null;
  let key: KeyObject;
  try {
    key = privateFrom(raw);
  } catch {
    throw new Error(
      'RAMA_SIGNING_KEY is not an Ed25519 private key (base64 PKCS#8 DER): run `pnpm rama-ceremony signing-key`',
    );
  }
  if (key.asymmetricKeyType !== 'ed25519')
    throw new Error('RAMA_SIGNING_KEY must be an Ed25519 key');
  return {
    seal: (record) => edSign(null, sealed(record), key).toString('base64'),
    publicKey: createPublicKey(key).export({ format: 'der', type: 'spki' }).toString('base64'),
  };
}

/** True when the record's seal is House of Rama's, for this public key, over exactly this record. */
export function verifySeal(record: Signoff, publicKey: string): boolean {
  if (!record.seal) return false;
  try {
    return edVerify(
      null,
      sealed(record),
      publicFrom(publicKey),
      Buffer.from(record.seal, 'base64'),
    );
  } catch {
    return false;
  }
}

/** A new key pair: the private half for RAMA_SIGNING_KEY, the public half for the gate. */
export function generateSigningKey(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
  };
}
