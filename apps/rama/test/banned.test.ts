import { describe, expect, it } from 'vitest';
import { BANNED, bannedIn, visibleText } from './banned';

describe('bannedIn', () => {
  it('finds every banned word in its forms, as a whole word, in any case', () => {
    expect(BANNED).toContain('commit');
    expect(
      bannedIn('Two Commits, one repo, the repositories, imported routes, an env, a SHA'),
    ).toEqual(['Commits', 'repo', 'repositories', 'imported', 'routes', 'env', 'SHA']);
    expect(bannedIn('an important commitment to the environment, shall we')).toEqual([]);
  });

  it('reads the text a person sees, with labels and placeholders, not class names', () => {
    expect(visibleText('<div class="brick" aria-label="A route">x<b>y</b></div>')).toBe(
      ' x y A route',
    );
  });
});
