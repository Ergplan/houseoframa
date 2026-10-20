// Path globs for layer rules: `**` spans any number of segments, `*` and `?` stay inside one segment,
// `{a,b}` alternates. A leading `**/` also matches at the root, so `**/lib/**` matches `lib/x.ts`.

function toRegexSource(glob: string): string {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const slash = glob[i + 2] === '/';
        out += slash ? '(?:.*/)?' : '.*';
        i += slash ? 2 : 1;
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) throw new Error(`unclosed { in glob "${glob}"`);
      out += `(?:${glob
        .slice(i + 1, end)
        .split(',')
        .map((alt) => toRegexSource(alt))
        .join('|')})`;
      i = end;
    } else {
      out += /[.+^$()|[\]\\]/.test(c) ? `\\${c}` : c;
    }
  }
  return out;
}

const cache = new Map<string, RegExp>();

export function globToRegExp(glob: string): RegExp {
  let re = cache.get(glob);
  if (!re) {
    re = new RegExp(`^${toRegexSource(glob)}$`);
    cache.set(glob, re);
  }
  return re;
}

export function matchGlob(glob: string, path: string): boolean {
  return globToRegExp(glob).test(path);
}
