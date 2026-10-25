// The house stack's rama/figures.ts (templates/house-stack), read as it is written, without running it:
// `defineFigures({ id: { fn: dayTotal, title, what, english, inputs, show, files } })`, where `fn` is
// the function itself, brought in from the file that holds it. Its file and line come from that file,
// read by the parser, so nobody writes them by hand (Invariant 10: traced by construction).
//
// The older form (fn, file and line written as text) is read by running the file in the sandbox
// (capture.ts); this reader answers only for the new form, and says why when it cannot read an entry.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { FigureMapping } from './config.ts';

export interface ConventionReading {
  mappings: Record<string, FigureMapping & { show?: string }>;
  /** Entries it could not read, with why: each such figure is shown untraced. */
  unread: { id: string; why: string }[];
}

const parse = (file: string, text: string) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** Whether the file uses the house stack's form: its figures are listed with defineFigures. */
export function isHouseStackConvention(text: string): boolean {
  return /\bdefineFigures\s*\(/.test(text);
}

const literal = (e: ts.Expression | undefined) =>
  e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : undefined;

function field(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const p of obj.properties)
    if (
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === name
    )
      return p.initializer;
  return undefined;
}

/** The file a relative module name stands for, from the importing file; null when none is found. */
function resolve(repoDir: string, from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`])
    if (/\.tsx?$/.test(c) && existsSync(path.join(repoDir, c))) return c;
  return null;
}

/** The line an exported function starts on in a file, following one `export { x as y }` rename. */
function functionLine(text: string, file: string, name: string): number | null {
  const sf = parse(file, text);
  let local = name;
  for (const st of sf.statements)
    if (
      ts.isExportDeclaration(st) &&
      !st.moduleSpecifier &&
      st.exportClause &&
      ts.isNamedExports(st.exportClause)
    )
      for (const el of st.exportClause.elements)
        if (el.name.text === name) local = el.propertyName?.text ?? name;
  const exported = (n: ts.Node) =>
    (ts.getCombinedModifierFlags(n as ts.Declaration) & ts.ModifierFlags.Export) !== 0 ||
    local !== name;
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === local)
      return exported(st) || isListed(sf, local) ? lineOf(st) : null;
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (
          ts.isIdentifier(d.name) &&
          d.name.text === local &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
        )
          return exported(st) || isListed(sf, local) ? lineOf(st) : null;
  }
  return null;
}

const isListed = (sf: ts.SourceFile, local: string) =>
  sf.statements.some(
    (st) =>
      ts.isExportDeclaration(st) &&
      !st.moduleSpecifier &&
      st.exportClause &&
      ts.isNamedExports(st.exportClause) &&
      st.exportClause.elements.some((el) => (el.propertyName?.text ?? el.name.text) === local),
  );

/** Reads a house-stack rama/figures.ts; null when the file is not in that form. */
export function readConvention(repoDir: string, file: string): ConventionReading | null {
  const full = path.join(repoDir, file);
  if (!existsSync(full)) return null;
  const text = readFileSync(full, 'utf8');
  if (!isHouseStackConvention(text)) return null;
  const sf = parse(file, text);
  // Local name → [module, name in that module].
  const brought = new Map<string, [string, string]>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const named = st.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named) || st.importClause?.isTypeOnly) continue;
    for (const el of named.elements)
      if (!el.isTypeOnly)
        brought.set(el.name.text, [st.moduleSpecifier.text, el.propertyName?.text ?? el.name.text]);
  }
  const out: ConventionReading = { mappings: {}, unread: [] };
  let list: ts.ObjectLiteralExpression | null = null;
  const find = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'defineFigures'
    ) {
      const a = n.arguments[0];
      if (a && ts.isObjectLiteralExpression(a)) list = a;
      return;
    }
    ts.forEachChild(n, find);
  };
  find(sf);
  if (!list) return out;
  for (const p of (list as ts.ObjectLiteralExpression).properties) {
    if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)))
      continue;
    const id = p.name.text;
    const unread = (why: string) => out.unread.push({ id, why });
    if (!ts.isObjectLiteralExpression(p.initializer)) {
      unread('it is not written out in full');
      continue;
    }
    const obj = p.initializer;
    const fnNode = field(obj, 'fn');
    if (!fnNode || !ts.isIdentifier(fnNode)) {
      unread('it does not name its function');
      continue;
    }
    const from = brought.get(fnNode.text);
    const fnFile = from ? resolve(repoDir, file, from[0]) : null;
    if (!from || !fnFile) {
      unread(`its function ${fnNode.text} is not brought in from the product’s own files`);
      continue;
    }
    const line = functionLine(readFileSync(path.join(repoDir, fnFile), 'utf8'), fnFile, from[1]);
    if (line === null) {
      unread(`${fnFile} has no shared function ${from[1]}`);
      continue;
    }
    const inputsNode = field(obj, 'inputs');
    const listed: readonly ts.Expression[] =
      inputsNode && ts.isArrayLiteralExpression(inputsNode) ? inputsNode.elements : [];
    const inputs = listed
      .filter((e): e is ts.ObjectLiteralExpression => ts.isObjectLiteralExpression(e))
      .map((i) => ({
        label: literal(field(i, 'label')) ?? '',
        source: literal(field(i, 'source')) ?? '',
        ...(literal(field(i, 'data')) ? { data: literal(field(i, 'data'))! } : {}),
      }))
      .filter((i) => i.label && i.source);
    const filesNode = field(obj, 'files');
    const files = (filesNode && ts.isArrayLiteralExpression(filesNode) ? filesNode.elements : [])
      .map((e) => literal(e))
      .filter((f): f is string => Boolean(f));
    const title = literal(field(obj, 'title'));
    const what = literal(field(obj, 'what'));
    const english = literal(field(obj, 'english'));
    const show = literal(field(obj, 'show'));
    out.mappings[id] = {
      fn: from[1],
      file: fnFile,
      line,
      inputs,
      files,
      ...(title ? { title } : {}),
      ...(what ? { what } : {}),
      ...(english ? { english } : {}),
      ...(show ? { show } : {}),
    };
  }
  return out;
}
