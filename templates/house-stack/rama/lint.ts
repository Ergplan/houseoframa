// The figures lint (Invariant 10: traced by construction). Any number a screen shows outside a <Figure>
// fails the build, naming the file and the line; so does a <Figure> whose function is not the one
// rama/figures.ts names for it, and an entry of rama/figures.ts House of Rama could not read as written.
//
//   node rama/lint.ts [product folder] [--json]
//
// It runs before every build (`prebuild`) and in CI, and House of Rama runs its own copy of this file
// after every lift, so editing the product's copy changes nothing House of Rama sees.
import { existsSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export interface LintFinding {
  file: string;
  line: number;
  sentence: string;
}

const REGISTRY = 'rama/figures.ts';
const FIGURE_COMPONENT = 'components/Figure.tsx';
const SHOWS = new Set(['count', 'rupees', 'percent']);
/** Attributes whose value a person reads on the screen. */
const SHOWN_ATTRIBUTES = new Set(['placeholder', 'title', 'alt', 'aria-label']);
const SHOWN_VALUE_ON = new Set(['input', 'textarea']);

const NUMBER_TO_TEXT = new Set([
  'toFixed',
  'toString',
  'toLocaleString',
  'toPrecision',
  'toExponential',
]);
const DIGIT = /\d/;

function program(dir: string): ts.Program {
  const configFile = path.join(dir, 'tsconfig.json');
  const read = ts.readConfigFile(configFile, (f) => ts.sys.readFile(f));
  const parsed = ts.parseJsonConfigFileContent(read.config ?? {}, ts.sys, dir);
  return ts.createProgram({
    rootNames: parsed.fileNames.filter((f) => !f.includes('/node_modules/')),
    options: { ...parsed.options, noEmit: true, plugins: [] },
  });
}

/** What a figure entry says, read from the object literal as written. */
interface Entry {
  id: string;
  fn: ts.Symbol | null;
  show: string | null;
}

export function lintFigures(dir: string): LintFinding[] {
  const root = path.resolve(dir);
  const findings: LintFinding[] = [];
  if (!existsSync(path.join(root, 'tsconfig.json')))
    return [{ file: 'tsconfig.json', line: 1, sentence: 'The product has no tsconfig.json.' }];
  const prog = program(root);
  const checker = prog.getTypeChecker();
  const rel = (sf: ts.SourceFile) => path.relative(root, sf.fileName).split(path.sep).join('/');
  const report = (sf: ts.SourceFile, node: ts.Node, said: string) => {
    const at = line(sf, node);
    findings.push({ file: rel(sf), line: at, sentence: `${rel(sf)}, line ${at}: ${said}` });
  };
  const unmarked = (sf: ts.SourceFile, node: ts.Node, why: string) =>
    report(
      sf,
      node,
      `${why[0]!.toUpperCase()}${why.slice(1)} is shown without a Figure. Show it through <Figure id> (${REGISTRY}) or write it in words.`,
    );
  const own = prog
    .getSourceFiles()
    .filter(
      (sf) =>
        !sf.isDeclarationFile && !rel(sf).startsWith('..') && !rel(sf).includes('node_modules/'),
    );

  // The symbol a name stands for, through any renaming on the way in.
  const target = (node: ts.Node): ts.Symbol | null => {
    let s = checker.getSymbolAtLocation(node) ?? null;
    if (s && s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s);
    return s;
  };

  const text = (e: ts.Expression | undefined) =>
    e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : null;

  const entries = new Map<string, Entry>();
  const registry = own.find((sf) => rel(sf) === REGISTRY);
  if (!registry)
    findings.push({
      file: REGISTRY,
      line: 1,
      sentence: `${REGISTRY} is missing: every figure is listed there.`,
    });
  else readRegistry(registry);

  function readRegistry(sf: ts.SourceFile) {
    let found = false;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'defineFigures'
      ) {
        found = true;
        const arg = node.arguments[0];
        if (!arg || !ts.isObjectLiteralExpression(arg)) {
          report(
            sf,
            node,
            'defineFigures is given something other than a list written out in full.',
          );
          return;
        }
        for (const p of arg.properties) readEntry(sf, p);
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    if (!found) report(sf, sf, `${REGISTRY} does not list its figures with defineFigures.`);
  }

  function readEntry(sf: ts.SourceFile, p: ts.ObjectLiteralElementLike) {
    if (!ts.isPropertyAssignment(p) || !(ts.isStringLiteral(p.name) || ts.isIdentifier(p.name))) {
      report(sf, p, 'Each figure is written as “id”: { … }.');
      return;
    }
    const id = p.name.text;
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id))
      report(sf, p, `The figure “${id}” needs an id of lowercase words joined by dashes.`);
    if (!ts.isObjectLiteralExpression(p.initializer)) {
      report(sf, p, `The figure “${id}” is not written out in full.`);
      return;
    }
    const field = (name: string) => {
      const f = (p.initializer as ts.ObjectLiteralExpression).properties.find(
        (x): x is ts.PropertyAssignment =>
          ts.isPropertyAssignment(x) && ts.isIdentifier(x.name) && x.name.text === name,
      );
      return f?.initializer;
    };
    for (const name of ['title', 'what', 'english']) {
      const v = text(field(name));
      if (!v?.trim())
        report(
          sf,
          p,
          `The figure “${id}” needs its ${name === 'english' ? 'way of working it out in plain English' : name} written as plain text.`,
        );
    }
    const inputs = field('inputs');
    if (!inputs || !ts.isArrayLiteralExpression(inputs))
      report(sf, p, `The figure “${id}” needs its inputs listed.`);
    else
      for (const i of inputs.elements) {
        const ok =
          ts.isObjectLiteralExpression(i) &&
          ['label', 'source', 'data'].every((k) =>
            i.properties.some(
              (x) =>
                ts.isPropertyAssignment(x) &&
                ts.isIdentifier(x.name) &&
                x.name.text === k &&
                Boolean(text(x.initializer)?.trim()),
            ),
          );
        if (!ok)
          report(
            sf,
            i,
            `An input of “${id}” needs its label, where it enters and where it is kept, as plain text.`,
          );
      }
    const show = text(field('show'));
    if (!show || !SHOWS.has(show))
      report(sf, p, `The figure “${id}” needs show: count, rupees or percent.`);
    const fnNode = field('fn');
    let fn: ts.Symbol | null = null;
    if (!fnNode || !ts.isIdentifier(fnNode))
      report(sf, p, `The figure “${id}” needs fn: the name of the function that works it out.`);
    else {
      fn = target(fnNode);
      const decl = fn?.valueDeclaration ?? fn?.declarations?.[0];
      const at = decl ? rel(decl.getSourceFile()) : null;
      if (!decl || !at || at.startsWith('..') || at.includes('node_modules/'))
        report(sf, fnNode, `The function of “${id}” is not one of the product’s own.`);
      else if (at === REGISTRY || at.endsWith('.tsx'))
        report(
          sf,
          fnNode,
          `The function of “${id}” must be written in a .ts file of its building, not here.`,
        );
      else if (!(
        ts.isFunctionDeclaration(decl) ||
        (ts.isVariableDeclaration(decl) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)))
      ))
        report(
          sf,
          fnNode,
          `“${fnNode.text}”, the function of “${id}”, is not written as a function.`,
        );
    }
    entries.set(id, { id, fn, show });
  }

  // A number, or what may be one; a type that also holds elements (a component's children) passes them on
  // and is judged where they are written.
  const numberLike = (t: ts.Type): boolean => {
    if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return true;
    if (t.flags & (ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike)) return true;
    if (t.isUnion())
      return t.types.some(numberLike) && !t.types.some((m) => m.flags & ts.TypeFlags.Object);
    return false;
  };
  const isNumber = (e: ts.Expression) => numberLike(checker.getTypeAtLocation(e));

  /** Whether the expression, shown as a child of an element, shows a number; and why. */
  function shows(e: ts.Expression, depth = 0): string | null {
    while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e))
      e = e.expression;
    if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return null;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))
      return DIGIT.test(e.text) ? `the number in “${e.text.trim().slice(0, 40)}”` : null;
    // A list written in place (and joined, or shown as it is): any element may be shown.
    if (ts.isArrayLiteralExpression(e) && depth < 5) {
      for (const el of e.elements) {
        const why = shows(el, depth + 1);
        if (why) return why;
      }
    }
    if (ts.isConditionalExpression(e)) return shows(e.whenTrue, depth) ?? shows(e.whenFalse, depth);
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return shows(e.right, depth);
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken)
        return shows(e.left, depth) ?? shows(e.right, depth);
      // Text joined from parts: a part that holds a number is shown.
      if (op === ts.SyntaxKind.PlusToken) return shows(e.left, depth) ?? shows(e.right, depth);
    }
    const type = checker.getTypeAtLocation(e);
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown))
      return `“${e.getText().slice(0, 40)}”, whose kind is not known, so it may be a number`;
    if (numberLike(type)) return `the number “${e.getText().slice(0, 40)}”`;
    // Text whose every possible value is known, and one of them holds a number.
    const texts = type.isUnion() ? type.types : [type];
    const numbered = texts.find((t) => t.isStringLiteral() && DIGIT.test(t.value));
    if (numbered?.isStringLiteral())
      return `“${e.getText().slice(0, 40)}”, which may be “${numbered.value.slice(0, 40)}”`;
    // One element of a list or record written in the code: any of its elements may be shown.
    if (ts.isElementAccessExpression(e) && depth < 5) {
      const decl = target(e.expression)?.valueDeclaration;
      let held: ts.Expression | undefined =
        decl && ts.isVariableDeclaration(decl) ? decl.initializer : undefined;
      while (held && (ts.isAsExpression(held) || ts.isSatisfiesExpression(held)))
        held = held.expression;
      const elements = held
        ? ts.isArrayLiteralExpression(held)
          ? [...held.elements]
          : ts.isObjectLiteralExpression(held)
            ? held.properties.flatMap((p) => (ts.isPropertyAssignment(p) ? [p.initializer] : []))
            : []
        : [];
      for (const el of elements) {
        const why = shows(el, depth + 1);
        if (why) return `“${e.getText().slice(0, 40)}”, which may be ${why}`;
      }
    }
    // A name for a value written in the product's own code: what it was given is what is shown.
    if ((ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) && depth < 5) {
      const decl = target(ts.isPropertyAccessExpression(e) ? e.name : e)?.valueDeclaration;
      const given =
        decl && (ts.isVariableDeclaration(decl) || ts.isPropertyAssignment(decl))
          ? decl.initializer
          : undefined;
      if (given && !rel(given.getSourceFile()).includes('node_modules/')) {
        const why = shows(given, depth + 1);
        if (why) return `“${e.getText().slice(0, 40)}”, which holds ${why}`;
      }
    }
    if (ts.isTemplateExpression(e)) {
      const span = e.templateSpans.find((s) => isNumber(s.expression));
      if (span) return `the number “${span.expression.getText().slice(0, 40)}” written into text`;
      for (const part of e.templateSpans) {
        const why = depth < 5 ? shows(part.expression, depth + 1) : null;
        if (why) return `${why}, written into text`;
      }
      if (DIGIT.test(e.head.text) || e.templateSpans.some((s) => DIGIT.test(s.literal.text)))
        return `the number in “${e.getText().slice(0, 40)}”`;
      return null;
    }
    if (ts.isCallExpression(e)) {
      const callee = e.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        NUMBER_TO_TEXT.has(callee.name.text) &&
        isNumber(callee.expression)
      )
        return `the number “${callee.expression.getText().slice(0, 40)}” written as text`;
      const sym = target(ts.isPropertyAccessExpression(callee) ? callee.name : callee);
      const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
      const words = decl && ts.getJSDocTags(decl).some((t) => t.tagName.text === 'words');
      const numeric = e.arguments.find((a) => isNumber(a));
      if (numeric && !words)
        return `“${e.getText().slice(0, 40)}”, text made from the number “${numeric.getText().slice(0, 30)}”`;
      // A built-in method that makes text (concat, join, toUpperCase…): what it is called on and given.
      const builtIn = decl && rel(decl.getSourceFile()).includes('node_modules/');
      if (builtIn && ts.isPropertyAccessExpression(callee) && depth < 5) {
        for (const part of [callee.expression, ...e.arguments]) {
          const why = shows(part, depth + 1);
          if (why) return `“${e.getText().slice(0, 40)}”, made from ${why}`;
        }
      }
      // A function of the product's own: what it gives back is what is shown.
      const fn =
        decl &&
        (ts.isFunctionDeclaration(decl) || ts.isMethodDeclaration(decl)
          ? decl
          : ts.isVariableDeclaration(decl) &&
              decl.initializer &&
              (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
            ? decl.initializer
            : null);
      if (
        fn &&
        fn.body &&
        !words &&
        depth < 5 &&
        !rel(fn.getSourceFile()).includes('node_modules/')
      ) {
        for (const given of returnsOf(fn.body)) {
          const why = shows(given, depth + 1);
          if (why) return `“${e.getText().slice(0, 40)}”, which gives ${why}`;
        }
      }
    }
    return null;
  }

  function checkFigure(sf: ts.SourceFile, el: ts.JsxSelfClosingElement | ts.JsxOpeningElement) {
    const attr = (name: string) =>
      el.attributes.properties.find(
        (a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === name,
      );
    const idAttr = attr('id')?.initializer;
    const id = idAttr && ts.isStringLiteral(idAttr) ? idAttr.text : null;
    if (!id) {
      report(sf, el, 'A Figure needs its id written as plain text, so it can be traced.');
      return;
    }
    const entry = entries.get(id);
    if (!entry) {
      report(sf, el, `The Figure “${id}” is not in ${REGISTRY}.`);
      return;
    }
    const fnInit = attr('fn')?.initializer;
    const fnExpr = fnInit && ts.isJsxExpression(fnInit) ? fnInit.expression : undefined;
    const fn = fnExpr && ts.isIdentifier(fnExpr) ? target(fnExpr) : null;
    if (!fn || (entry.fn && fn !== entry.fn))
      report(
        sf,
        el,
        `The Figure “${id}” must be worked out by the function ${REGISTRY} names for it.`,
      );
    const showInit = attr('show')?.initializer;
    const show = showInit && ts.isStringLiteral(showInit) ? showInit.text : null;
    if (show !== entry.show)
      report(
        sf,
        el,
        `The Figure “${id}” must be shown as ${REGISTRY} says (${entry.show ?? 'not said'}).`,
      );
  }

  const tagOf = (el: ts.JsxSelfClosingElement | ts.JsxOpeningElement) => el.tagName.getText();

  for (const sf of own) {
    const file = rel(sf);
    if (!file.endsWith('.tsx') || /\.test\.tsx$/.test(file) || file === FIGURE_COMPONENT) continue;
    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
        const open = ts.isJsxElement(node) ? node.openingElement : node;
        if (tagOf(open) === 'Figure') {
          checkFigure(sf, open);
          return; // what a Figure holds is the Figure's
        }
        const tag = tagOf(open);
        const tagDecl = /^[A-Z]/.test(tag) ? target(open.tagName)?.declarations?.[0] : undefined;
        const ownComponent = Boolean(
          tagDecl && !rel(tagDecl.getSourceFile()).includes('node_modules/'),
        );
        // Props spread in (`{...{ text: '123' }}`, or a name for such an object) count as written.
        const spread = open.attributes.properties.flatMap((a) => {
          if (!ts.isJsxSpreadAttribute(a)) return [];
          let o: ts.Expression | undefined = a.expression;
          const named = ts.isIdentifier(o);
          if (ts.isIdentifier(o)) {
            const d = target(o)?.valueDeclaration;
            o = d && ts.isVariableDeclaration(d) ? d.initializer : undefined;
          }
          return o && ts.isObjectLiteralExpression(o)
            ? o.properties.flatMap((p) =>
                ts.isPropertyAssignment(p) &&
                (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
                  ? [{ node: (named ? a : p) as ts.Node, name: p.name.text, given: p.initializer }]
                  : [],
              )
            : [];
        });
        const written = open.attributes.properties.flatMap((a) =>
          ts.isJsxAttribute(a) && a.initializer
            ? [
                {
                  node: a as ts.Node,
                  name: a.name.getText(),
                  given: ts.isStringLiteral(a.initializer)
                    ? (a.initializer as ts.Expression)
                    : ts.isJsxExpression(a.initializer)
                      ? a.initializer.expression
                      : undefined,
                },
              ]
            : [],
        );
        for (const a of [...written, ...spread]) {
          if (!a.given) continue;
          const name = a.name;
          // Text handed to one of the product's own components may be shown by it, where the lint sees
          // only "some text": every prop but `key` is judged where it is handed over (a number handed
          // over is judged where the component shows it). A library's component (a link, an image) is
          // judged only by the attributes a person reads.
          const handed =
            ownComponent && name !== 'key' && !(!ts.isStringLiteral(a.given) && isNumber(a.given));
          const shown =
            handed ||
            (!ownComponent && SHOWN_ATTRIBUTES.has(name)) ||
            ((name === 'value' || name === 'defaultValue') && SHOWN_VALUE_ON.has(tag));
          if (!shown) continue;
          const why = shows(a.given);
          if (why) unmarked(sf, a.node, why);
        }
      }
      if (ts.isJsxText(node) && DIGIT.test(node.text)) {
        unmarked(sf, node, `the number in “${node.text.trim().slice(0, 40)}”`);
      }
      if (
        ts.isJsxExpression(node) &&
        node.expression &&
        (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
      ) {
        const why = shows(node.expression);
        if (why) unmarked(sf, node, why);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** What a function body gives back: its return statements' values, not those of functions inside it. */
function returnsOf(body: ts.ConciseBody): ts.Expression[] {
  if (!ts.isBlock(body)) return [body];
  const out: ts.Expression[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
    if (ts.isFunctionLike(n)) return;
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(body, visit);
  return out;
}

const line = (sf: ts.SourceFile, node: ts.Node) =>
  sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

const self =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (self) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--')) ?? process.cwd();
  const found = lintFigures(dir);
  if (args.includes('--json')) process.stdout.write(JSON.stringify(found) + '\n');
  else if (found.length) {
    for (const f of found) console.error(f.sentence);
    console.error(
      `\n${found.length} thing${found.length === 1 ? '' : 's'} to fix before the build.`,
    );
  } else console.log('Every number on a screen is a traced figure.');
  process.exitCode = found.length ? 1 : 0;
}
