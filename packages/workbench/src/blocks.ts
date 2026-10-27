// A file split into blocks (Stage 11), by the TypeScript parser and nothing else: the import group, a
// type, a function or component, a query, a table, a route handler, a test. Every line belongs to exactly
// one block: comments and blank lines before a statement go with it, anything after the last statement
// goes with the last. The English pane says one or two sentences per block.
import { createHash } from 'node:crypto';
import ts from 'typescript';

export type BlockKind =
  | 'imports'
  | 'type'
  | 'component'
  | 'function'
  | 'query'
  | 'table'
  | 'route'
  | 'test'
  | 'value'
  | 'other';

export interface Block {
  kind: BlockKind;
  /** The name the block declares, when it declares one. */
  name: string | null;
  /** First and last line, 1-based and inclusive. */
  from: number;
  to: number;
  /** sha256 of the block's text: an explanation is kept by it, so a block is never explained twice. */
  hash: string;
  text: string;
}

const ROUTE_VERBS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const TEST_CALLS = new Set(['describe', 'it', 'test']);

const exported = (n: ts.Node) =>
  ts.canHaveModifiers(n) &&
  (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** What a top-level statement is, and the name it declares. */
function classify(
  st: ts.Statement,
  sf: ts.SourceFile,
  file: string,
): { kind: BlockKind; name: string | null } {
  if (ts.isImportDeclaration(st) || ts.isImportEqualsDeclaration(st))
    return { kind: 'imports', name: null };
  if (ts.isExportDeclaration(st) && st.moduleSpecifier) return { kind: 'imports', name: null };
  if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st))
    return { kind: 'type', name: st.name.text };
  const text = st.getText(sf);
  if (ts.isFunctionDeclaration(st)) {
    const name = st.name?.text ?? 'default';
    if (ROUTE_VERBS.has(name) && exported(st) && /\/route\.tsx?$/.test(file))
      return { kind: 'route', name };
    if (/^[A-Z]/.test(name) || (/\.tsx$/.test(file) && /<\w/.test(text)))
      return { kind: 'component', name };
    return { kind: 'function', name };
  }
  if (ts.isClassDeclaration(st)) return { kind: 'function', name: st.name?.text ?? 'default' };
  if (ts.isVariableStatement(st)) {
    const d = st.declarationList.declarations[0]!;
    const name = ts.isIdentifier(d.name) ? d.name.text : null;
    const init = d.initializer;
    if (
      init &&
      ts.isCallExpression(init) &&
      /^(?:pgTable|sqliteTable|mysqlTable)$/.test(init.expression.getText(sf))
    )
      return { kind: 'table', name };
    if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
      if (name && ROUTE_VERBS.has(name) && /\/route\.tsx?$/.test(file))
        return { kind: 'route', name };
      if (name && /^[A-Z]/.test(name)) return { kind: 'component', name };
      return { kind: 'function', name };
    }
    if (/\b(?:select|insert|update|delete)\(|\.from\(|sql`/.test(text))
      return { kind: 'query', name };
    return { kind: 'value', name };
  }
  if (ts.isExpressionStatement(st) && ts.isCallExpression(st.expression)) {
    const callee = st.expression.expression.getText(sf).split('.')[0]!;
    if (TEST_CALLS.has(callee)) {
      const first = st.expression.arguments[0];
      return { kind: 'test', name: first && ts.isStringLiteralLike(first) ? first.text : null };
    }
  }
  if (ts.isExportAssignment(st))
    return {
      kind: /^[A-Z]/.test(st.expression.getText(sf)) ? 'component' : 'value',
      name: 'default',
    };
  return { kind: 'other', name: null };
}

const hashOf = (s: string) => createHash('sha256').update(s).digest('hex');

/** The blocks of a file, in order, covering every line once. A file the parser reads nothing in is one block. */
export function splitBlocks(file: string, source: string): Block[] {
  if (source === '') return [];
  const lines = source.split('\n');
  const total = source.endsWith('\n') ? lines.length - 1 : lines.length;
  if (total === 0) return [];
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  // Each statement, from the line its leading comments start on (getFullStart is after the last one's end).
  const parts: { kind: BlockKind; name: string | null; to: number }[] = [];
  for (const st of sf.statements) {
    const c = classify(st, sf, file);
    const to = lineOf(st.getEnd());
    const last = parts.at(-1);
    // Imports run together as one group.
    if (last && last.kind === 'imports' && c.kind === 'imports') last.to = to;
    else parts.push({ ...c, to });
  }
  if (!parts.length) parts.push({ kind: 'other', name: null, to: total });
  const blocks: Block[] = [];
  let from = 1;
  parts.forEach((p, i) => {
    const to = i === parts.length - 1 ? total : Math.max(from, Math.min(p.to, total));
    const text = lines.slice(from - 1, to).join('\n');
    blocks.push({ kind: p.kind, name: p.name, from, to, hash: hashOf(text), text });
    from = to + 1;
  });
  return blocks.filter((b) => b.from <= b.to);
}
