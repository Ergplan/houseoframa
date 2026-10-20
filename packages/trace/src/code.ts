// The formula's lines, for a trail: the declaration that starts on the mapped line, read with the
// TypeScript parser (syntax only), so braces in types, strings, template literals and comments cannot
// end it early. Used at capture time only; the app never loads the parser.
import ts from 'typescript';

const kindOf = (file: string) =>
  file.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : /\.(m|c)?jsx?$/.test(file)
      ? file.endsWith('x')
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.JS
      : ts.ScriptKind.TS;

/**
 * The outermost declaration or statement that starts on `line` (1-based), to where it ends. At most
 * `max` lines: a longer one is cut, and the last line says so. When nothing starts on that line (a data
 * file, a line inside an expression), just that line.
 */
export function codeAt(source: string, line: number, file = 'figure.ts', max = 40): string {
  const lines = source.split('\n');
  if (line < 1 || line > lines.length) return '';
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kindOf(file));
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line;
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    if (found) return;
    const start = lineOf(node.getStart(sf));
    const end = lineOf(node.getEnd());
    if (start === line - 1) {
      found = node;
      return;
    }
    if (start <= line - 1 && end >= line - 1) ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  const endLine = found ? lineOf(found.getEnd()) : line - 1;
  const taken = lines.slice(line - 1, endLine + 1);
  if (taken.length <= max) return taken.join('\n');
  return [
    ...taken.slice(0, max),
    `// … cut at ${max} lines: the function continues in the file`,
  ].join('\n');
}
