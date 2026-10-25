// The house stack (templates/house-stack, Stage 9): the figures lint refuses a number shown outside a
// Figure, naming the file and the line; and the scaffold, laid down in an empty product, builds and
// passes every check House of Rama makes after a lift, the merge gate included.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProductSite, type SiteLocation } from '@rama/blueprint/site';
import { appSealer } from '@rama/ceremony';
import { checkLift, complete } from '../src/build.ts';
import { commitAll } from '../src/products.ts';
import { layDownScaffold, lintProduct, onHouseStack } from '../src/scaffold.ts';

let work: string;
let env: NodeJS.ProcessEnv;
let site: SiteLocation;
let base: string;

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'rama-house-stack-'));
  env = { ...process.env, RAMA_WORK_DIR: work };
  site = createProductSite(
    { id: 'tea-shop', name: 'Tea “Shop”', idea: "A tea shop's orders.", env },
    (repoDir) => execFileSync('git', ['-C', repoDir, 'init', '--quiet', '--initial-branch=main']),
  );
  layDownScaffold(
    site.repoDir,
    { id: site.id, name: site.name, idea: "A tea shop's orders." },
    { ref: 'main', publicKey: appSealer(env).publicKey },
    env,
  );
  base = commitAll(site.repoDir, 'Start from the house stack', 'House of Rama');
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('the house stack', () => {
  it('is laid down with the product’s name and idea put in, escaped for each file, and the gate keyed', () => {
    expect(onHouseStack(site.repoDir)).toBe(true);
    const read = (f: string) => readFileSync(path.join(site.repoDir, f), 'utf8');
    expect(JSON.parse(read('package.json'))).toMatchObject({
      name: 'tea-shop',
      description: "A tea shop's orders.",
    });
    expect(read('app/page.tsx')).toContain("{'Tea “Shop”'}");
    expect(read('app/page.tsx')).toContain("{'A tea shop\\'s orders.'}");
    expect(read('.github/workflows/rama-gate.yml')).toContain(
      `PUBLIC_KEY: '${appSealer(env).publicKey}'`,
    );
    expect(read('README.md')).toMatch(/^# Tea “Shop”\n\nA tea shop's orders\./);
  });

  it('builds, and passes every check after its first lift: lint, tests, photographs, figures and the gate', async () => {
    const c = await checkLift(site, base, env);
    expect(c.problems).toEqual([]);
    expect(c).toMatchObject({
      ok: true,
      figures: { traced: 1, shown: 1, agree: 1 },
      screens: { verified: 1, of: 1 },
    });
    expect(complete(c)).toBe(true);
    // Checked within a minute on a quiet machine (30 to 43 s a lift on the real build). This bound only
    // catches a check that has grown far slower: with the watcher's full suite running beside it on
    // the same machine, one check took 92 s.
    expect(c.ms).toBeLessThan(150_000);
  });

  it('lint: refuses every number shown outside a Figure, naming the file and the line', async () => {
    writeFileSync(
      path.join(site.repoDir, 'app/count.tsx'),
      [
        "import { Figure } from '../components/Figure';",
        "import { buildingCount, planned } from '../features/welcome/plan';",
        '',
        '/** @words */',
        "const inWords = (n: number) => (n === 1 ? 'one' : 'many');",
        'const rupees = (p: number) => `₹${p / 100}`;',
        '',
        'export function Count() {',
        '  const b = planned();',
        '  const n = b.length;',
        '  return (',
        '    <div>',
        '      <p>Open 9 to 5</p>',
        '      <p>{n} buildings</p>',
        '      <p>{rupees(4500)}</p>',
        '      <p>{`${n} in all`}</p>',
        '      <p>{n.toFixed(1)}</p>',
        '      <p>{inWords(n)} building</p>',
        '      <input defaultValue={n} />',
        '      <Figure id="building-count" fn={buildingCount} args={[b]} show="count" />',
        '      <Figure id="building-count" fn={buildingCount} args={[b]} show="rupees" />',
        '      <Figure id="no-such" fn={buildingCount} args={[b]} show="count" />',
        '    </div>',
        '  );',
        '}',
        '',
      ].join('\n'),
    );
    try {
      const found = await lintProduct(site.repoDir, env);
      expect(found.map((f) => [f.file, f.line])).toEqual([
        ['app/count.tsx', 13],
        ['app/count.tsx', 14],
        ['app/count.tsx', 15],
        ['app/count.tsx', 16],
        ['app/count.tsx', 17],
        ['app/count.tsx', 19],
        ['app/count.tsx', 21],
        ['app/count.tsx', 22],
      ]);
      expect(found[1]!.sentence).toBe(
        'app/count.tsx, line 14: The number “n” is shown without a Figure. Show it through <Figure id> (rama/figures.ts) or write it in words.',
      );
      expect(found[6]!.sentence).toMatch(/must be shown as rama\/figures\.ts says \(count\)/);
      expect(found[7]!.sentence).toMatch(/“no-such” is not in rama\/figures\.ts/);
      // The product's own build refuses it too: the lint runs before every build.
      expect(() =>
        execFileSync('npm', ['run', 'lint:figures'], { cwd: site.repoDir, stdio: 'pipe' }),
      ).toThrow();
    } finally {
      rmSync(path.join(site.repoDir, 'app/count.tsx'));
    }
  });

  it('lint: refuses a number held in text a name stands for, or in text whose values are all known', async () => {
    writeFileSync(
      path.join(site.repoDir, 'app/named.tsx'),
      [
        "const label: string = '123';",
        "function tableName(): string { return 'Table 9'; }",
        '/** @words */',
        "const inWords = (n: number): string => (n === 1 ? 'one' : 'Table 2');",
        "type Table = 'Table 1' | 'Table 2';",
        'export function Named({ t }: { t: Table }) {',
        "  const o = { code: 'A7', name: 'Masala chai' };",
        "  const joined = 'Table ' + o.name;",
        '  return (',
        '    <div>',
        '      <p>{label}</p>',
        '      <p>{t}</p>',
        '      <p>{o.code}</p>',
        '      <p>{o.name}</p>',
        "      <p>{'1' + '23'}</p>",
        '      <p>{joined}</p>',
        '      <p>{tableName()}</p>',
        '      <p>{inWords(1)}</p>',
        '    </div>',
        '  );',
        '}',
        '',
      ].join('\n'),
    );
    try {
      const found = await lintProduct(site.repoDir, env);
      expect(found.map((f) => [f.file, f.line])).toEqual([
        ['app/named.tsx', 11],
        ['app/named.tsx', 12],
        ['app/named.tsx', 13],
        ['app/named.tsx', 15],
        ['app/named.tsx', 17],
      ]);
      expect(found[0]!.sentence).toMatch(
        /“label”, which holds the number in “123” is shown without a Figure/,
      );
      expect(found[1]!.sentence).toMatch(/“t”, which may be “Table 1”/);
      expect(found[3]!.sentence).toMatch(/The number in “1” is shown without a Figure/);
      expect(found[4]!.sentence).toMatch(/“tableName\(\)”, which gives the number in “Table 9”/);
    } finally {
      rmSync(path.join(site.repoDir, 'app/named.tsx'));
    }
  });

  it('lint: follows text into templates, list and record elements, library calls, a component’s props and returns, and children', async () => {
    writeFileSync(
      path.join(site.repoDir, 'app/made.tsx'),
      [
        "import { createElement } from 'react';",
        "const label: string = '123';",
        "const ROOMS = ['Room 1', 'Room 2'];",
        "const WORDS = ['one cup', 'two cups'];",
        "const NAMES = { a: 'Table 4' };",
        "const TABLE = { text: 'Table 6' };",
        'export function Made({ i }: { i: number }) {',
        '  return (',
        '    <div>',
        '      <p>{`${label}`}</p>',
        '      <p>{ROOMS[i]}</p>',
        '      <p>{WORDS[i]}</p>',
        '      <p>{NAMES.a}</p>',
        "      <p>{label.concat('!')}</p>",
        "      <p>{['a', '5'].join(' ')}</p>",
        "      <p>{'cups'.toUpperCase()}</p>",
        '      <Label text="Table 3" />',
        '      <Label text={label} />',
        '      <Label text="Masala chai" href="/order/12" />',
        '      <Label text="Masala chai" id="123" />',
        "      <Label {...{ text: 'Table 5' }} />",
        '      <Label {...TABLE} />',
        '    </div>',
        '  );',
        '}',
        'function Label(p: { text: string; href?: string }) {',
        '  return <p>{p.text}</p>;',
        '}',
        'export const Count = () => 123;',
        "export function Name() { return 'Room 8'; }",
        'export default () => 123;',
        "export const Made2 = () => createElement('p', null, 'Table 7');",
        'export const Made3 = () => <p children="Table 8" />;',
        "export const Made4 = () => <p dangerouslySetInnerHTML={{ __html: 'Table 9' }} />;",
        "const HTML = { __html: 'Table 10' };",
        'export const Made5 = () => <p dangerouslySetInnerHTML={HTML} />;',
        "export const Made6 = () => createElement('p', { children: 'Table 11' });",
        '',
      ].join('\n'),
    );
    try {
      const found = await lintProduct(site.repoDir, env);
      expect(found.map((f) => f.line)).toEqual([
        10, 11, 13, 14, 15, 17, 18, 19, 20, 21, 22, 29, 30, 31, 32, 33, 34, 36, 37,
      ]);
      expect(found.every((f) => f.file === 'app/made.tsx')).toBe(true);
    } finally {
      rmSync(path.join(site.repoDir, 'app/made.tsx'));
    }
  });

  it('lint: reads a component made with createElement in a .ts file, and leaves figure functions alone', async () => {
    writeFileSync(
      path.join(site.repoDir, 'features/welcome/count.ts'),
      [
        "import { createElement } from 'react';",
        '/** A count, worked out: a figure function, not a component. */',
        'export const total = (xs: number[]) => xs.length + 2;',
        "export const Count = () => createElement('p', null, '123');",
        '',
      ].join('\n'),
    );
    try {
      const found = await lintProduct(site.repoDir, env);
      expect(found.map((f) => [f.file, f.line])).toEqual([['features/welcome/count.ts', 4]]);
    } finally {
      rmSync(path.join(site.repoDir, 'features/welcome/count.ts'));
    }
    // A component merely named Figure is not the house stack's: what it holds is read.
    writeFileSync(
      path.join(site.repoDir, 'app/fake.tsx'),
      [
        "import type { ReactNode } from 'react';",
        'function Figure(p: { id: string; children: ReactNode }) {',
        '  return <div>{p.children}</div>;',
        '}',
        'export function Fake() {',
        '  return <Figure id="building-count">123</Figure>;',
        '}',
        '',
      ].join('\n'),
    );
    try {
      const found = await lintProduct(site.repoDir, env);
      expect(found.map((f) => [f.file, f.line])).toEqual([['app/fake.tsx', 6]]);
    } finally {
      rmSync(path.join(site.repoDir, 'app/fake.tsx'));
    }
    // What a map callback gives back is shown; what a sort or filter callback gives back is not.
    writeFileSync(
      path.join(site.repoDir, 'app/mapped.tsx'),
      [
        'export function Mapped({ xs }: { xs: { n: number; name: string }[] }) {',
        '  return (',
        '    <ul>',
        "      {['x'].map(() => '123')}",
        '      {xs.map((x) => x.n)}',
        '      {[...xs].sort((a, b) => a.n - b.n).filter((x) => x.n > 1).map((x) => <li key={x.name}>{x.name}</li>)}',
        '    </ul>',
        '  );',
        '}',
        '',
      ].join('\n'),
    );
    try {
      const found = await lintProduct(site.repoDir, env);
      expect(found.map((f) => [f.file, f.line])).toEqual([
        ['app/mapped.tsx', 4],
        ['app/mapped.tsx', 5],
      ]);
    } finally {
      rmSync(path.join(site.repoDir, 'app/mapped.tsx'));
    }
    // A value given to a name, or a property, after it was declared.
    writeFileSync(
      path.join(site.repoDir, 'app/later.tsx'),
      [
        'export function Later() {',
        "  let label: string = '';",
        "  label = '123';",
        "  const o = { code: '' };",
        "  o.code = 'A9';",
        '  const pass = (x: string): string => x;',
        '  const passed = (p: { text: string; n: number }): string => p.text;',
        '  return (',
        '    <p>',
        '      {label}',
        '      {o.code}',
        "      {pass('Table 12')}",
        "      {passed({ text: 'Table 13', n: 2 })}",
        "      {passed({ text: 'Masala chai', n: 2 })}",
        '    </p>',
        '  );',
        '}',
        '',
      ].join('\n'),
    );
    try {
      const found = await lintProduct(site.repoDir, env);
      expect(found.map((f) => [f.file, f.line])).toEqual([
        ['app/later.tsx', 10],
        ['app/later.tsx', 11],
        ['app/later.tsx', 12],
        ['app/later.tsx', 13],
      ]);
    } finally {
      rmSync(path.join(site.repoDir, 'app/later.tsx'));
    }
    // Only the product's own configuration at its root is not read: a component in a file merely named
    // so is.
    writeFileSync(
      path.join(site.repoDir, 'features/welcome/count.config.ts'),
      "import { createElement } from 'react';\nexport const Count = () => createElement('p', null, '123');\n",
    );
    try {
      const found = await lintProduct(site.repoDir, env);
      expect(found.map((f) => [f.file, f.line])).toEqual([['features/welcome/count.config.ts', 2]]);
    } finally {
      rmSync(path.join(site.repoDir, 'features/welcome/count.config.ts'));
    }
    // A value is followed through as many names as it takes, and one too far to follow is refused.
    const chain = (n: number) =>
      [
        "const v0: string = '123';",
        ...Array.from({ length: n }, (_, i) => `const v${i + 1}: string = v${i};`),
        `export const Far = () => <p>{v${n}}</p>;`,
        '',
      ].join('\n');
    for (const [n, says] of [
      [8, /“v8”, which holds “v7”/],
      [30, /cannot follow to where it is written/],
    ] as const) {
      writeFileSync(path.join(site.repoDir, 'app/far.tsx'), chain(n));
      try {
        const found = await lintProduct(site.repoDir, env);
        expect(found).toHaveLength(1);
        expect(found[0]!.sentence).toMatch(says);
      } finally {
        rmSync(path.join(site.repoDir, 'app/far.tsx'));
      }
    }
    // Spread props are opened all the way down.
    writeFileSync(
      path.join(site.repoDir, 'app/spread.tsx'),
      "const inner = { children: 'Table 14' };\nexport const S = () => <p {...{ ...{ ...inner } }} />;\n",
    );
    try {
      const found = await lintProduct(site.repoDir, env);
      expect(found.map((f) => [f.file, f.line])).toEqual([['app/spread.tsx', 2]]);
    } finally {
      rmSync(path.join(site.repoDir, 'app/spread.tsx'));
    }
    // A component kept beside House of Rama's files is read like any other.
    writeFileSync(
      path.join(site.repoDir, 'rama/Count.tsx'),
      'export function Count() {\n  return <p>123</p>;\n}\n',
    );
    try {
      const found = await lintProduct(site.repoDir, env);
      expect(found.map((f) => [f.file, f.line])).toEqual([['rama/Count.tsx', 2]]);
    } finally {
      rmSync(path.join(site.repoDir, 'rama/Count.tsx'));
    }
    // A page whose default export is a name for a lower-case function, in either form.
    for (const end of ['export default page;', 'export { page as default };']) {
      writeFileSync(
        path.join(site.repoDir, 'app/page2.ts'),
        [
          "import { createElement } from 'react';",
          'function page() {',
          "  return createElement('p', null, '123');",
          '}',
          end,
          '',
        ].join('\n'),
      );
      try {
        const found = await lintProduct(site.repoDir, env);
        expect(found.map((f) => [f.file, f.line])).toEqual([['app/page2.ts', 3]]);
      } finally {
        rmSync(path.join(site.repoDir, 'app/page2.ts'));
      }
    }
  });

  it('lint: House of Rama refuses a lift that changes the files that show a figure', async () => {
    const figure = path.join(site.repoDir, 'components/Figure.tsx');
    const define = path.join(site.repoDir, 'rama/define.ts');
    const before = [readFileSync(figure, 'utf8'), readFileSync(define, 'utf8')] as const;
    writeFileSync(
      figure,
      before[0].replace('{SHOW[props.show](value)}', '{SHOW[props.show](value)} <span>123</span>'),
    );
    writeFileSync(
      define,
      before[1].replace(
        "count: (n: number) => n.toLocaleString('en-IN'),",
        'count: (n: number) => `${n + 1}`,',
      ),
    );
    try {
      const found = (await lintProduct(site.repoDir, env)).map((f) => f.sentence);
      expect(found).toEqual([
        "components/Figure.tsx, line 1: is the house stack's own and must stay as it is: it shows every figure, so the lint trusts it rather than reads it.",
        "rama/define.ts, line 1: is the house stack's own and must stay as it is: it shows every figure, so the lint trusts it rather than reads it.",
      ]);
    } finally {
      writeFileSync(figure, before[0]);
      writeFileSync(define, before[1]);
    }
    expect(await lintProduct(site.repoDir, env)).toEqual([]);
  });

  it('lint: refuses a Figure worked out by another function than its own, and a figure list it cannot read', async () => {
    const figures = path.join(site.repoDir, 'rama/figures.ts');
    const before = readFileSync(figures, 'utf8');
    writeFileSync(
      path.join(site.repoDir, 'features/welcome/other.ts'),
      'export function otherCount(xs: unknown[]): number {\n  return xs.length + 1;\n}\n',
    );
    writeFileSync(
      path.join(site.repoDir, 'app/page.tsx'),
      readFileSync(path.join(site.repoDir, 'app/page.tsx'), 'utf8').replace(
        "import { buildingCount, planned } from '../features/welcome/plan';",
        "import { planned } from '../features/welcome/plan';\nimport { otherCount as buildingCount } from '../features/welcome/other';",
      ),
    );
    writeFileSync(figures, before.replace("title: 'Buildings planned'", 'title: `Buildings ${1}`'));
    try {
      const found = (await lintProduct(site.repoDir, env)).map((f) => f.sentence);
      expect(found).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /^app\/page\.tsx, line \d+: The Figure “building-count” must be worked out by the function rama\/figures\.ts names for it\.$/,
          ),
          expect.stringMatching(
            /^rama\/figures\.ts, line \d+: The figure “building-count” needs its title written as plain text\.$/,
          ),
        ]),
      );
    } finally {
      execFileSync('git', ['-C', site.repoDir, 'checkout', '--', '.']);
      rmSync(path.join(site.repoDir, 'features/welcome/other.ts'));
    }
    expect(await lintProduct(site.repoDir, env)).toEqual([]);
  });
});
