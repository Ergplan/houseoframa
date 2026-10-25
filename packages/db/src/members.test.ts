// members.json (rule 11): the people of version 1, read at start, and the sign-in mode.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { authMode, ownerName, parseMembers, readMembers } from './members.ts';

describe('members.json', () => {
  it('reads names and roles, and refuses a bad role or a name twice', () => {
    expect(
      parseMembers('[{"name":"Asha Rao","role":"trainer"},{"name":"Ravi","role":"customer"}]'),
    ).toEqual([
      { name: 'Asha Rao', role: 'trainer' },
      { name: 'Ravi', role: 'customer' },
    ]);
    expect(() => parseMembers('[{"name":"Asha","role":"boss"}]')).toThrow();
    expect(() =>
      parseMembers('[{"name":"Asha","role":"trainer"},{"name":"Asha","role":"customer"}]'),
    ).toThrow(/twice/);
    expect(() => parseMembers('Asha')).toThrow(/not JSON/);
  });

  it('keeps an email when a member gives one, and refuses one that is not an address', () => {
    expect(parseMembers('[{"name":"Asha","role":"trainer","email":"asha@example.com"}]')).toEqual([
      { name: 'Asha', role: 'trainer', email: 'asha@example.com' },
    ]);
    expect(() => parseMembers('[{"name":"Asha","role":"trainer","email":"asha"}]')).toThrow();
  });

  it("is read from the checkout's root; the owner is RAMA_MEMBER_NAME, else the first trainer", () => {
    const home = mkdtempSync(path.join(tmpdir(), 'rama-members-'));
    try {
      expect(readMembers({ RAMA_HOME: home })).toEqual([]);
      expect(ownerName({ RAMA_HOME: home })).toBeUndefined();
      writeFileSync(
        path.join(home, 'members.json'),
        '[{"name":"Ravi","role":"customer"},{"name":"Asha Rao","role":"trainer"}]',
      );
      expect(readMembers({ RAMA_HOME: home })).toHaveLength(2);
      expect(ownerName({ RAMA_HOME: home })).toBe('Asha Rao');
      expect(ownerName({ RAMA_HOME: home, RAMA_MEMBER_NAME: 'CI' })).toBe('CI');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("this repository's members.json parses", () => {
    expect(readMembers().length).toBeGreaterThan(0);
  });

  it('signs in by picking a name unless AUTH_MODE=password; anything else is refused', () => {
    expect(authMode({})).toBe('members');
    expect(authMode({ AUTH_MODE: 'password' })).toBe('password');
    expect(() => authMode({ AUTH_MODE: 'magic' })).toThrow(/not a sign-in mode/);
  });
});
