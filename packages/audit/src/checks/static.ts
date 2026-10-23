// Checks that read the code and run nothing: the TypeScript parser over each code brick that is not a
// test. Each finds a pattern a person should look at; none of them guesses intent.
import ts from 'typescript';
import type { CheckFinding, CheckName } from '../findings.ts';
import { lineOf, parse, walk } from '../source.ts';

type Find = (f: Omit<CheckFinding, 'brick' | 'file'>) => void;

const text = (sf: ts.SourceFile, n: ts.Node) => n.getText(sf);

/** `eslint-disable…`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` in a comment. */
function silencedLint(src: string, find: Find): void {
  const re =
    /(?:\/\/|\/\*)\s*(eslint-disable(?:-next-line|-line)?|@ts-ignore|@ts-expect-error|@ts-nocheck)\b([^\n*]*)/g;
  for (const m of src.matchAll(re)) {
    const line = src.slice(0, m.index).split('\n').length;
    const rest = m[2]!.trim().replace(/^--\s*/, '');
    find({
      check: 'silenced-lint',
      verdict: 'note',
      line,
      text: `A check is silenced (${m[1]}${rest ? `: ${rest.slice(0, 100)}` : ''}).`,
    });
  }
}

const isEmptyHandler = (n: ts.Node | undefined): boolean => {
  if (!n) return false;
  if (!(ts.isArrowFunction(n) || ts.isFunctionExpression(n))) return false;
  const b = n.body;
  if (ts.isBlock(b)) return b.statements.length === 0;
  return (
    b.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(b) && b.text === 'undefined') ||
    ts.isVoidExpression(b)
  );
};

export function staticChecks(
  file: string,
  src: string,
  opts: { formula: boolean },
): Omit<CheckFinding, 'brick'>[] {
  const out: Omit<CheckFinding, 'brick'>[] = [];
  const find: Find = (f) => out.push({ ...f, file });
  silencedLint(src, find);
  const sf = parse(file, src);
  // Names bound to a sorted list (`const xs = [...ys].sort(…)`), for positional-assumption.
  const sorted = new Set<string>();
  const isSortCall = (e: ts.Expression): boolean => {
    let cur: ts.Expression = e;
    while (
      ts.isParenthesizedExpression(cur) ||
      ts.isAsExpression(cur) ||
      ts.isNonNullExpression(cur)
    )
      cur = cur.expression;
    return (
      ts.isCallExpression(cur) &&
      ts.isPropertyAccessExpression(cur.expression) &&
      ['sort', 'toSorted'].includes(cur.expression.name.text)
    );
  };
  walk(sf, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      isSortCall(n.initializer)
    )
      sorted.add(n.name.text);
  });
  const env = (e: ts.Expression) => /^process\.env\b|^import\.meta\.env\b/.test(e.getText(sf));
  const report = (check: CheckName, verdict: 'note' | 'defect', n: ts.Node, t: string) =>
    out.push({ check, verdict, file, line: lineOf(sf, n), text: t });

  walk(sf, (n) => {
    // swallowed-error
    if (ts.isCatchClause(n) && n.block.statements.length === 0) {
      report('swallowed-error', 'note', n, 'An error is caught and dropped: an empty catch block.');
    }
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'catch' &&
      isEmptyHandler(n.arguments[0])
    ) {
      report(
        'swallowed-error',
        'note',
        n,
        'A rejected promise is caught and dropped: `.catch()` with an empty handler.',
      );
    }
    // any-type
    if (n.kind === ts.SyntaxKind.AnyKeyword)
      report('any-type', 'note', n, 'Typed as `any`: the compiler checks nothing here.');
    // magic-constant-in-formula
    if (opts.formula && ts.isNumericLiteral(n)) {
      const v = Number(n.text);
      const index = ts.isElementAccessExpression(n.parent) && n.parent.argumentExpression === n;
      if (
        ![0, 1, 2, 10, 100, 1000].includes(v) &&
        !index &&
        !ts.isEnumMember(n.parent) &&
        !ts.isLiteralTypeNode(n.parent)
      ) {
        report(
          'magic-constant-in-formula',
          'note',
          n,
          `The constant ${n.text} is written into a formula file: an assumption in code, not in reviewed data.`,
        );
      }
    }
    // browser-storage-write
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const call = text(sf, n.expression);
      if (
        /(?:^|\.)(localStorage|sessionStorage)\.setItem$/.test(call) ||
        /(?:^|\.)indexedDB\.open$/.test(call)
      ) {
        report(
          'browser-storage-write',
          'note',
          n,
          `Data is written to the browser (${call}): it stays on this device, unseen by anyone else.`,
        );
      }
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = text(sf, n.left);
      if (
        /^(?:window\.)?(localStorage|sessionStorage)[.[]/.test(left) ||
        /^document\.cookie$/.test(left)
      ) {
        report(
          'browser-storage-write',
          'note',
          n,
          `Data is written to the browser (${left}): it stays on this device, unseen by anyone else.`,
        );
      }
    }
    // env-fallback
    if (
      ts.isBinaryExpression(n) &&
      [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
        n.operatorToken.kind,
      ) &&
      env(n.left) &&
      (env(n.right) || ts.isStringLiteralLike(n.right) || ts.isNumericLiteral(n.right))
    ) {
      report(
        'env-fallback',
        'note',
        n,
        `If ${text(sf, n.left)} is unset, ${text(sf, n.right).slice(0, 60)} is used without a word.`,
      );
    }
    // positional-assumption
    if (
      ts.isElementAccessExpression(n) &&
      ts.isNumericLiteral(n.argumentExpression) &&
      Number(n.argumentExpression.text) >= 1
    ) {
      const target = n.expression;
      if (isSortCall(target) || (ts.isIdentifier(target) && sorted.has(target.text))) {
        report(
          'positional-assumption',
          'defect',
          n,
          `Takes item ${n.argumentExpression.text} of a sorted list: it assumes the list always has at least ${Number(n.argumentExpression.text) + 1} items in a fixed order.`,
        );
      }
    }
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'at' &&
      n.arguments[0]
    ) {
      const a = n.arguments[0];
      const k = ts.isNumericLiteral(a)
        ? Number(a.text)
        : ts.isPrefixUnaryExpression(a) && ts.isNumericLiteral(a.operand)
          ? -Number(a.operand.text)
          : null;
      const target = n.expression.expression;
      if (
        k !== null &&
        (k >= 1 || k <= -2) &&
        (isSortCall(target) || (ts.isIdentifier(target) && sorted.has(target.text)))
      ) {
        report(
          'positional-assumption',
          'defect',
          n,
          `Takes item ${k} of a sorted list: it assumes how many items the list holds.`,
        );
      }
    }
  });
  return out;
}

/**
 * A Next.js route handler that may run long (`maxDuration` over 60 s, or a streamed response) with no
 * sign-in check in it: anyone with the URL can keep it, and what it spends, running.
 */
export function longUnauthRoute(file: string, src: string): Omit<CheckFinding, 'brick'>[] {
  if (!/(^|\/)app\/(.+\/)?route\.(ts|js|mjs)$/.test(file)) return [];
  const sf = parse(file, src);
  let duration: number | null = null;
  let streams = false;
  walk(sf, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'maxDuration' &&
      n.initializer &&
      ts.isNumericLiteral(n.initializer)
    ) {
      duration = Number(n.initializer.text);
    }
    if (
      ts.isNewExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'ReadableStream'
    )
      streams = true;
    if (ts.isStringLiteralLike(n) && n.text === 'text/event-stream') streams = true;
  });
  const long = (duration !== null && duration > 60) || streams;
  if (!long) return [];
  const guarded =
    /\b(auth|session|getViewer|requireUser|currentUser|verifyToken|getServerSession|cookies\(\))/i.test(
      src,
    );
  if (guarded) return [];
  return [
    {
      check: 'long-unauth-route',
      verdict: 'defect',
      file,
      line: 1,
      text: `A route that ${duration && duration > 60 ? `may run ${duration} s` : 'streams its response'} with no sign-in check in it.`,
    },
  ];
}
