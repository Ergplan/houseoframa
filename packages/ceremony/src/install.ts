// Puts the gate's workflow into a target's checkout (.github/workflows/rama-gate.yml), pinned to a
// House of Rama ref. It writes to the local checkout only: House of Rama never pushes to a target, and
// the target's team commits the file.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const GATE_WORKFLOW = '.github/workflows/rama-gate.yml';
const TEMPLATE = path.join(import.meta.dirname, '..', 'ci', 'rama-gate.yml');

export function gateWorkflow(ref: string): string {
  if (!/^[\w./-]+$/.test(ref)) throw new Error(`not a git ref: ${ref}`);
  return readFileSync(TEMPLATE, 'utf8').replace('ref: RAMA_REF', `ref: ${ref}`);
}

export function installGate(repoDir: string, ref: string): string {
  const file = path.join(repoDir, GATE_WORKFLOW);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, gateWorkflow(ref));
  return file;
}
