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
}

export interface SourceFacts {
  imports: ImportRef[];
  exports: string[];
  env: string[];
  envDynamic: boolean;
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

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const clause = stmt.importClause;
      const symbols: string[] = [];
      let allType = Boolean(clause?.isTypeOnly);
      if (clause) {
        if (clause.name) symbols.push('default');
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) symbols.push('*');
        if (nb && ts.isNamedImports(nb)) {
          for (const el of nb.elements) symbols.push((el.propertyName ?? el.name).text);
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
      if (spec) imports.push({ spec, symbols, typeOnly: allType });
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

  const visit = (node: ts.Node) => {
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
  };
}
