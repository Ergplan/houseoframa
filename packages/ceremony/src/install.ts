// Puts the gate's workflow into a target's checkout (.github/workflows/rama-gate.yml), pinned to a
// House of Rama ref. It writes to the local checkout only: House of Rama never pushes to a target, and
// the target's team commits the file.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homeDir } from '@rama/db';

export const GATE_WORKFLOW = '.github/workflows/rama-gate.yml';
// Found when used, not at load: inside the app's server bundle import.meta.dirname is undefined.
const template = () =>
  import.meta.dirname
    ? path.join(import.meta.dirname, '..', 'ci', 'rama-gate.yml')
    : path.join(homeDir(), 'packages/ceremony/ci/rama-gate.yml');

/** The workflow pinned to a House of Rama ref, with the public key its gate checks seals against . */
export function gateWorkflow(ref: string, publicKey: string): string {
  if (!/^[\w./-]+$/.test(ref)) throw new Error(`not a git ref: ${ref}`);
  if (!/^[A-Za-z0-9+/=]+$/.test(publicKey)) throw new Error('not a base64 public key');
  return readFileSync(template(), 'utf8')
    .replace('ref: RAMA_REF', `ref: ${ref}`)
    .replace("PUBLIC_KEY: 'RAMA_PUBLIC_KEY'", `PUBLIC_KEY: '${publicKey}'`);
}

export function installGate(repoDir: string, ref: string, publicKey: string): string {
  const file = path.join(repoDir, GATE_WORKFLOW);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, gateWorkflow(ref, publicKey));
  return file;
}
