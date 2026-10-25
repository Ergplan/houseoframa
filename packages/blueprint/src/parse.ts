// Reads one JS/TS source file with the TypeScript parser (syntax only, no type checker):
// its imports, its exports and the environment variables it reads.
import ts from 'typescript';
import { byString } from './json.ts';

export { CODE_EXTENSIONS, isCode } from './files.ts';

export interface ImportRef {
  spec: string;
  /** Imported names; `default`; `*` for namespace, re-export-all, dynamic import or require. Empty for side-effect imports. */
  symbols: string[];
  typeOnly: boolean;
  /** True for `export … from`: the names pass through this file to its importers. */
  reexport?: true;
}

/** A table the file defines with Drizzle (`pgTable('orders', { … })`, or the sqlite and mysql forms). */
export interface TableDef {
  /** The table's name in the database. */
  name: string;
  /** The exported binding that holds it. */
  symbol: string;
  line: number;
  /** The keys of the columns object, in source order. */
  columns: string[];
}

export interface SourceFacts {
  imports: ImportRef[];
  exports: string[];
  env: string[];
  envDynamic: boolean;
  tables: TableDef[];
  /**
   * How the file uses names it imports, keyed by the imported name (a namespace import's members by
   * their property name): `writes` when passed to `.insert()`, `.update()` or `.delete()`, `reads` for
   * any other use as a value. Uses in types only are not uses.
   */
  uses: Record<string, { reads: boolean; writes: boolean }>;
  /** Hosts of the web addresses written in the file's strings (`https://api.openai.com/…` → `api.openai.com`). */
  hosts: string[];
}

const TABLE_FNS = new Set(['pgTable', 'sqliteTable', 'mysqlTable']);
const WRITE_FNS = new Set(['insert', 'update', 'delete']);

/** True when the node sits inside a type (an annotation, `typeof x`, a type argument). */
function inType(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isTypeNode(n)) return true;
    if (ts.isStatement(n) || ts.isSourceFile(n)) return false;
  }
  return false;
}

function scriptKind(path: string): ts.ScriptKind {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.(m|c)?js$/.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);

const isProcessEnv = (node: ts.Expression): boolean =>
  ts.isPropertyAccessExpression(node) &&
  node.name.text === 'env' &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === 'process';

const isImportMetaEnv = (node: ts.Expression): boolean =>
  ts.isPropertyAccessExpression(node) &&
  node.name.text === 'env' &&
  ts.isMetaProperty(node.expression) &&
  node.expression.keywordToken === ts.SyntaxKind.ImportKeyword;

const isEnvObject = (node: ts.Expression) => isProcessEnv(node) || isImportMetaEnv(node);

/** String values a const binding can hold: a string literal, or an array of string literals. */
function constStrings(sf: ts.SourceFile): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclarationList(node) &&
      node.flags & ts.NodeFlags.Const
    ) {
      for (const d of node.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        let init = d.initializer;
        while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) {
          init = init.expression;
        }
        if (ts.isStringLiteralLike(init)) out.set(d.name.text, [init.text]);
        else if (ts.isArrayLiteralExpression(init) && init.elements.every(ts.isStringLiteralLike)) {
          out.set(d.name.text, init.elements.map((e) => (e as ts.StringLiteralLike).text));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * Names an `process.env[x]` read can take. Resolved when x is a string literal, a const string, or the
 * loop variable of `for (const x of ARR)` where ARR is a const array of string literals. Otherwise null.
 */
function envNamesFor(expr: ts.Expression, consts: Map<string, string[]>): string[] | null {
  if (ts.isStringLiteralLike(expr)) return [expr.text];
  if (!ts.isIdentifier(expr)) return null;
  const direct = consts.get(expr.text);
  if (direct && direct.length === 1) return direct;
  // Find the binding of the identifier: a for-of over a const array.
  let node: ts.Node = expr;
  while (node.parent) {
    node = node.parent;
    if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer)) {
      const decl = node.initializer.declarations[0];
      if (decl && ts.isIdentifier(decl.name) && decl.name.text === expr.text) {
        if (ts.isIdentifier(node.expression)) return consts.get(node.expression.text) ?? null;
        if (ts.isArrayLiteralExpression(node.expression) && node.expression.elements.every(ts.isStringLiteralLike)) {
          return node.expression.elements.map((e) => (e as ts.StringLiteralLike).text);
        }
        return null;
      }
    }
  }
  return null;
}

export function parseSource(path: string, source: string): SourceFacts {
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path));
  const imports: ImportRef[] = [];
  const exports = new Set<string>();
  const env = new Set<string>();
  let envDynamic = false;
  const consts = constStrings(sf);
  const tables: TableDef[] = [];
  // Local names of runtime imports: a named import's local name → its imported name; namespaces apart.
  const named = new Map<string, string>();
  const namespaces = new Set<string>();
  const uses: SourceFacts['uses'] = {};
  const hosts = new Set<string>();
  const use = (name: string, write: boolean) => {
    const u = (uses[name] ??= { reads: false, writes: false });
    if (write) u.writes = true;
    else u.reads = true;
  };

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const clause = stmt.importClause;
      const symbols: string[] = [];
      let allType = Boolean(clause?.isTypeOnly);
      if (clause) {
        if (clause.name) symbols.push('default');
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) symbols.push('*');
        if (nb && ts.isNamespaceImport(nb) && !clause.isTypeOnly) namespaces.add(nb.name.text);
        if (nb && ts.isNamedImports(nb)) {
          for (const el of nb.elements) {
            symbols.push((el.propertyName ?? el.name).text);
            if (!clause.isTypeOnly && !el.isTypeOnly) named.set(el.name.text, (el.propertyName ?? el.name).text);
          }
          if (!clause.isTypeOnly && !clause.name && nb.elements.length > 0) {
            allType = nb.elements.every((el) => el.isTypeOnly);
          }
        }
      }
      imports.push({ spec: stmt.moduleSpecifier.text, symbols, typeOnly: clause ? allType : false });
    } else if (ts.isExportDeclaration(stmt)) {
      const spec = stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : null;
      const symbols: string[] = [];
      let allType = stmt.isTypeOnly;
      if (!stmt.exportClause) {
        symbols.push('*');
        exports.add('*');
      } else if (ts.isNamespaceExport(stmt.exportClause)) {
        symbols.push('*');
        exports.add(stmt.exportClause.name.text);
      } else {
        for (const el of stmt.exportClause.elements) {
          symbols.push((el.propertyName ?? el.name).text);
          exports.add(el.name.text);
        }
        if (!stmt.isTypeOnly && stmt.exportClause.elements.length > 0) {
          allType = stmt.exportClause.elements.every((el) => el.isTypeOnly);
        }
      }
      if (spec) imports.push({ spec, symbols, typeOnly: allType, reexport: true });
    } else if (ts.isExportAssignment(stmt)) {
      exports.add('default');
    } else if (hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) {
      const isDefault = hasModifier(stmt, ts.SyntaxKind.DefaultKeyword);
      if (isDefault) exports.add('default');
      else if (ts.isVariableStatement(stmt)) {
        for (const d of stmt.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) exports.add(d.name.text);
          else for (const el of d.name.elements) if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) exports.add(el.name.text);
        }
      } else if (
        (ts.isFunctionDeclaration(stmt) ||
          ts.isClassDeclaration(stmt) ||
          ts.isInterfaceDeclaration(stmt) ||
          ts.isTypeAliasDeclaration(stmt) ||
          ts.isEnumDeclaration(stmt) ||
          ts.isModuleDeclaration(stmt)) &&
        stmt.name &&
        ts.isIdentifier(stmt.name)
      ) {
        exports.add(stmt.name.text);
      }
    }
  }

  const writeArg = (node: ts.Node) =>
    ts.isCallExpression(node.parent) &&
    node.parent.arguments[0] === node &&
    ts.isPropertyAccessExpression(node.parent.expression) &&
    WRITE_FNS.has(node.parent.expression.name.text);

  const visit = (node: ts.Node) => {
    // export const orders = pgTable('orders', { … })
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      TABLE_FNS.has(node.initializer.expression.text) &&
      node.initializer.arguments[0] &&
      ts.isStringLiteralLike(node.initializer.arguments[0]) &&
      ts.isVariableStatement(node.parent.parent) &&
      hasModifier(node.parent.parent, ts.SyntaxKind.ExportKeyword)
    ) {
      const cols = node.initializer.arguments[1];
      tables.push({
        name: node.initializer.arguments[0].text,
        symbol: node.name.text,
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        columns:
          cols && ts.isObjectLiteralExpression(cols)
            ? cols.properties.flatMap((p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? [p.name.text] : []))
            : [],
      });
    }
    // Uses of imported names as values: `db.insert(orders)` writes, `from(orders)` reads.
    if (ts.isIdentifier(node) && named.has(node.text) && !inType(node)) {
      const p = node.parent;
      const isName =
        (ts.isPropertyAccessExpression(p) && p.name === node) ||
        ts.isImportSpecifier(p) ||
        ts.isPropertyAssignment(p) && p.name === node ||
        ts.isExportSpecifier(p);
      if (!isName) use(named.get(node.text)!, writeArg(node));
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      namespaces.has(node.expression.text) &&
      !inType(node)
    ) {
      use(node.name.text, writeArg(node));
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node)) {
      const m = /^https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[/:?#]|$)/i.exec(node.text);
      if (m) hosts.add(m[1]!.toLowerCase());
    }
    // Dynamic import('x') and require('x').
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]!)) {
      const arg = (node.arguments[0] as ts.StringLiteralLike).text;
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) imports.push({ spec: arg, symbols: ['*'], typeOnly: false });
      else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        imports.push({ spec: arg, symbols: ['*'], typeOnly: false });
      }
    }
    // process.env.X / import.meta.env.X
    if (ts.isPropertyAccessExpression(node) && isEnvObject(node.expression)) env.add(node.name.text);
    // process.env[x]
    if (ts.isElementAccessExpression(node) && isEnvObject(node.expression)) {
      const names = envNamesFor(node.argumentExpression, consts);
      if (names) names.forEach((n) => env.add(n));
      else envDynamic = true;
    }
    // const { A, B: b } = process.env
    if (ts.isVariableDeclaration(node) && node.initializer && isEnvObject(node.initializer) && ts.isObjectBindingPattern(node.name)) {
      for (const el of node.name.elements) {
        const key = el.propertyName ?? el.name;
        if (ts.isIdentifier(key) || ts.isStringLiteral(key)) env.add(key.text);
        else envDynamic = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return {
    imports,
    exports: [...exports].sort(byString),
    env: [...env].sort(byString),
    envDynamic,
    tables,
    uses,
    hosts: [...hosts].sort(byString),
  };
}
