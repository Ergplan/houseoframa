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

/** `name.length` (optionally `name?.length`). */
const isLength = (sf: ts.SourceFile, e: ts.Expression, name: string) =>
  ts.isPropertyAccessExpression(e) && e.name.text === 'length' && e.expression.getText(sf) === name;

/** The least length a condition proves when it is true (0 when it proves nothing). */
function provenWhenTrue(sf: ts.SourceFile, e: ts.Expression, name: string): number {
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (isLength(sf, e, name)) return 1;
  if (!ts.isBinaryExpression(e)) return 0;
  const op = e.operatorToken.kind;
  if (op === ts.SyntaxKind.AmpersandAmpersandToken)
    return Math.max(provenWhenTrue(sf, e.left, name), provenWhenTrue(sf, e.right, name));
  const lit = (x: ts.Expression) => (ts.isNumericLiteral(x) ? Number(x.text) : null);
  const K = ts.SyntaxKind;
  if (isLength(sf, e.left, name) && lit(e.right) !== null) {
    const L = lit(e.right)!;
    if (op === K.GreaterThanToken) return L + 1;
    if (
      op === K.GreaterThanEqualsToken ||
      op === K.EqualsEqualsEqualsToken ||
      op === K.EqualsEqualsToken
    )
      return L;
  }
  if (isLength(sf, e.right, name) && lit(e.left) !== null) {
    const L = lit(e.left)!;
    if (op === K.LessThanToken) return L + 1;
    if (
      op === K.LessThanEqualsToken ||
      op === K.EqualsEqualsEqualsToken ||
      op === K.EqualsEqualsToken
    )
      return L;
  }
  return 0;
}

/** The least length known after `if (cond) <exit>`: what the condition being false proves. */
function provenWhenFalse(sf: ts.SourceFile, e: ts.Expression, name: string): number {
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken)
    return provenWhenTrue(sf, e.operand, name);
  if (!ts.isBinaryExpression(e)) return 0;
  const op = e.operatorToken.kind;
  const K = ts.SyntaxKind;
  if (op === K.BarBarToken)
    return Math.max(provenWhenFalse(sf, e.left, name), provenWhenFalse(sf, e.right, name));
  const lit = (x: ts.Expression) => (ts.isNumericLiteral(x) ? Number(x.text) : null);
  if (isLength(sf, e.left, name) && lit(e.right) !== null) {
    const L = lit(e.right)!;
    if (op === K.LessThanToken) return L;
    if (op === K.LessThanEqualsToken) return L + 1;
    if ((op === K.EqualsEqualsEqualsToken || op === K.EqualsEqualsToken) && L === 0) return 1;
  }
  if (isLength(sf, e.right, name) && lit(e.left) !== null) {
    const L = lit(e.left)!;
    if (op === K.GreaterThanToken) return L;
    if (op === K.GreaterThanEqualsToken) return L + 1;
  }
  return 0;
}

const exits = (st: ts.Statement): boolean => {
  if (
    ts.isReturnStatement(st) ||
    ts.isThrowStatement(st) ||
    ts.isContinueStatement(st) ||
    ts.isBreakStatement(st)
  )
    return true;
  return ts.isBlock(st) && st.statements.length > 0 && exits(st.statements.at(-1)!);
};

/**
 * True when the list is known to hold at least `need` items where it is read: in the true branch of an
 * enclosing `if` or `? :`, or the right of an `&&`, whose condition proves it; or after an earlier
 * `if (…) return` (or throw) in an enclosing block whose condition being false proves it.
 */
function lengthGuarded(sf: ts.SourceFile, access: ts.Node, name: string, need: number): boolean {
  let child: ts.Node = access;
  for (let p = access.parent; p; child = p, p = p.parent) {
    if (
      ts.isIfStatement(p) &&
      child === p.thenStatement &&
      provenWhenTrue(sf, p.expression, name) >= need
    )
      return true;
    if (
      ts.isConditionalExpression(p) &&
      child === p.whenTrue &&
      provenWhenTrue(sf, p.condition, name) >= need
    )
      return true;
    if (
      ts.isBinaryExpression(p) &&
      child === p.right &&
      p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      provenWhenTrue(sf, p.left, name) >= need
    ) {
      return true;
    }
    if (ts.isBlock(p) || ts.isSourceFile(p)) {
      const before = p.statements.slice(0, p.statements.indexOf(child as ts.Statement));
      if (
        before.some(
          (st) =>
            ts.isIfStatement(st) &&
            !st.elseStatement &&
            exits(st.thenStatement) &&
            provenWhenFalse(sf, st.expression, name) >= need,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

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
      const need = Number(n.argumentExpression.text) + 1;
      const guarded = ts.isIdentifier(target) && lengthGuarded(sf, n, target.text, need);
      if (
        !guarded &&
        (isSortCall(target) || (ts.isIdentifier(target) && sorted.has(target.text)))
      ) {
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
      const guarded =
        k !== null &&
        ts.isIdentifier(target) &&
        lengthGuarded(sf, n, target.text, k >= 0 ? k + 1 : -k);
      if (
        k !== null &&
        !guarded &&
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
