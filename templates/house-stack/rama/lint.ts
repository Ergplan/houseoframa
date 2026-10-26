// The figures lint (Invariant 10: traced by construction). Any number a screen shows outside a <Figure>
// fails the build, naming the file and the line; so does a <Figure> whose function is not the one
// rama/figures.ts names for it, and an entry of rama/figures.ts House of Rama could not read as written.
//
//   node rama/lint.ts [product folder] [--json] [--trusted <the house stack's folder>]
//
// It runs before every build (`prebuild`) and in CI, and House of Rama runs its own copy of this file
// after every lift, so editing the product's copy changes nothing House of Rama sees.
import { existsSync, readFileSync } from 'node:fs';
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
const SHOWN_ATTRIBUTES = new Set(['placeholder', 'title', 'alt', 'aria-label', 'children']);
const SHOWN_VALUE_ON = new Set(['input', 'textarea']);

const NUMBER_TO_TEXT = new Set([
  'toFixed',
  'toString',
  'toLocaleString',
  'toPrecision',
  'toExponential',
]);
const DIGIT = /\d/;
/** How many steps a value is followed (a name to what it holds, a call to what it gives back). */
const FOLLOW_LIMIT = 20;

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

/** The files that show a figure: the house stack's own, which a lift may not change. */
export const TRUSTED_FILES = [FIGURE_COMPONENT, 'rama/define.ts'];

/**
 * `trusted`: the house stack's own folder (House of Rama passes it when it runs its copy). The files
 * that show a figure must be the same as there: the lint does not read them, it trusts them.
 */
export function lintFigures(dir: string, trusted?: string): LintFinding[] {
  const root = path.resolve(dir);
  const findings: LintFinding[] = [];
  if (!existsSync(path.join(root, 'tsconfig.json')))
    return [{ file: 'tsconfig.json', line: 1, sentence: 'The product has no tsconfig.json.' }];
  if (trusted)
    for (const f of TRUSTED_FILES) {
      const mine = path.join(root, f);
      const theirs = path.join(path.resolve(trusted), f);
      if (!existsSync(mine) || readFileSync(mine, 'utf8') !== readFileSync(theirs, 'utf8'))
        findings.push({
          file: f,
          line: 1,
          sentence: `${f}, line 1: is the house stack's own and must stay as it is: it shows every figure, so the lint trusts it rather than reads it.`,
        });
    }
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

  /** The values given to a name, or a property, after it was declared: `x = …`, `o.x = …`, `x += …`. */
  const assigned = new Map<ts.Symbol, ts.Expression[]>();
  function assignedTo(sym: ts.Symbol, sf: ts.SourceFile): ts.Expression[] {
    const known = assigned.get(sym);
    if (known) return known;
    const out: ts.Expression[] = [];
    const visit = (n: ts.Node) => {
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        n.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      ) {
        const left = ts.isPropertyAccessExpression(n.left) ? n.left.name : n.left;
        if (target(left) === sym) out.push(n.right);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    assigned.set(sym, out);
    return out;
  }

  /** The function a callee or a callback stands for, through any names for it; null when not found. */
  function fnOf(x: ts.Node | undefined): ts.FunctionLikeDeclaration | null {
    let at: ts.Node | undefined =
      x && ts.isExpression(x as ts.Expression) ? unwrap(x as ts.Expression) : x;
    for (let hops = 0; at && hops < FOLLOW_LIMIT; hops++) {
      if (
        ts.isFunctionDeclaration(at) ||
        ts.isMethodDeclaration(at) ||
        ts.isArrowFunction(at) ||
        ts.isFunctionExpression(at)
      )
        return at;
      if (ts.isIdentifier(at) || ts.isPropertyAccessExpression(at))
        at = target(ts.isPropertyAccessExpression(at) ? at.name : at)?.valueDeclaration;
      else if (ts.isVariableDeclaration(at) && at.initializer) at = unwrap(at.initializer);
      else return null;
    }
    return null;
  }

  /** Whether the expression, shown as a child of an element, shows a number; and why. */
  function shows(e: ts.Expression, depth = 0): string | null {
    e = unwrap(e);
    // A value followed this far without an end is not taken on trust.
    if (depth >= FOLLOW_LIMIT)
      return `“${e.getText().slice(0, 40)}”, which the lint cannot follow to where it is written, so it may be a number`;
    if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return null;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))
      return DIGIT.test(e.text) ? `the number in “${e.text.trim().slice(0, 40)}”` : null;
    // An object written in place and handed over (to a function, a component, createElement): any text
    // in it may be what is shown. A number in it is judged where it is shown.
    if (ts.isObjectLiteralExpression(e)) {
      for (const p of e.properties) {
        const values =
          (ts.isGetAccessorDeclaration(p) || ts.isMethodDeclaration(p)) && p.body
            ? returnsOf(p.body)
            : [
                ts.isPropertyAssignment(p)
                  ? p.initializer
                  : ts.isShorthandPropertyAssignment(p)
                    ? p.name
                    : ts.isSpreadAssignment(p)
                      ? p.expression
                      : undefined,
              ];
        for (const value of values) {
          if (!value || ts.isArrowFunction(value) || ts.isFunctionExpression(value)) continue;
          if (!ts.isObjectLiteralExpression(value) && !ts.isStringLiteral(value) && isNumber(value))
            continue;
          const why = shows(value, depth + 1);
          if (why) return why;
        }
      }
    }
    // A list written in place (and joined, or shown as it is): any element may be shown.
    if (ts.isArrayLiteralExpression(e)) {
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
    // One element of a list or record (written in place, or by a name, a call…): any of its elements may
    // be the one shown, so it is judged by what it is read from.
    if (ts.isElementAccessExpression(e)) {
      const why = shows(e.expression, depth + 1);
      if (why) return `“${e.getText().slice(0, 40)}”, which may be ${why}`;
    }
    // A name for a value written in the product's own code: what it was given is what is shown.
    if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) {
      const decl = target(ts.isPropertyAccessExpression(e) ? e.name : e)?.valueDeclaration;
      // What it holds as written: a variable's or a field's first value, a shorthand's name, or what a
      // getter gives back.
      const givenAll: ts.Expression[] = !decl
        ? []
        : (ts.isVariableDeclaration(decl) ||
              ts.isPropertyAssignment(decl) ||
              ts.isPropertyDeclaration(decl)) &&
            decl.initializer
          ? [decl.initializer]
          : ts.isShorthandPropertyAssignment(decl)
            ? [decl.name]
            : ts.isGetAccessorDeclaration(decl) && decl.body
              ? returnsOf(decl.body)
              : [];
      // A map callback's parameter holds each element of the list mapped (`['123'].map((x) => x)`).
      if (decl && ts.isParameter(decl) && ts.isIdentifier(e)) {
        const cb = decl.parent;
        const call = cb.parent;
        if (
          (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) &&
          cb.parameters[0] === decl &&
          ts.isCallExpression(call) &&
          call.arguments[0] === cb &&
          ts.isPropertyAccessExpression(call.expression) &&
          ['map', 'flatMap', 'forEach'].includes(call.expression.name.text)
        ) {
          const why = shows(call.expression.expression, depth + 1);
          if (why) return `“${e.getText().slice(0, 40)}”, an element of a list that holds ${why}`;
        }
      }
      const sym = target(ts.isPropertyAccessExpression(e) ? e.name : e);
      // What it was given first, and every value given to it after (`label = '123'`).
      const values = [
        ...givenAll.filter((g) => !rel(g.getSourceFile()).includes('node_modules/')),
        ...(sym && decl && !rel(decl.getSourceFile()).includes('node_modules/')
          ? assignedTo(sym, decl.getSourceFile())
          : []),
      ];
      for (const v of values) {
        const why = shows(v, depth + 1);
        if (why) return `“${e.getText().slice(0, 40)}”, which holds ${why}`;
      }
    }
    if (ts.isTemplateExpression(e)) {
      const span = e.templateSpans.find((s) => isNumber(s.expression));
      if (span) return `the number “${span.expression.getText().slice(0, 40)}” written into text`;
      for (const part of e.templateSpans) {
        const why = shows(part.expression, depth + 1);
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
      // A library's function or method (concat, join, createElement…) makes what it shows from what it
      // is called on and given.
      const builtIn = decl && rel(decl.getSourceFile()).includes('node_modules/');
      if (builtIn) {
        // map and flatMap show what their callback gives back, not what they run over.
        const mapping =
          ts.isPropertyAccessExpression(callee) && ['map', 'flatMap'].includes(callee.name.text);
        const parts = mapping
          ? e.arguments.slice(1)
          : [...(ts.isPropertyAccessExpression(callee) ? [callee.expression] : []), ...e.arguments];
        for (const part of parts) {
          const why = shows(part, depth + 1);
          if (why) return `“${e.getText().slice(0, 40)}”, made from ${why}`;
        }
        // A list made by map or flatMap holds what the callback gives back, inline or by name.
        if (mapping)
          for (const cb of e.arguments.slice(0, 1)) {
            const fn = fnOf(cb);
            if (!fn?.body)
              return `“${e.getText().slice(0, 40)}”, made by a callback the lint cannot follow, so it may hold a number`;
            for (const given of returnsOf(fn.body)) {
              const why = shows(given, depth + 1);
              if (why) return `“${e.getText().slice(0, 40)}”, which gives ${why}`;
            }
          }
      }
      // A function of the product's own, through any names for it (`const alias = label`): what it gives
      // back is what is shown.
      const fn = fnOf(decl);
      const own = Boolean(decl && !rel(decl.getSourceFile()).includes('node_modules/'));
      // A call of the product's own that cannot be followed to a function (a function handed in, a
      // name too far) gives text the lint cannot judge: it is not taken on trust.
      if (own && !words && (!fn || !fn.body) && !numberLike(checker.getTypeAtLocation(e)))
        return `“${e.getText().slice(0, 40)}”, a call the lint cannot follow to the function it runs, so it may give a number`;
      if (fn && fn.body && !words && !rel(fn.getSourceFile()).includes('node_modules/')) {
        // What it is given may be what it gives back (`label('123')` returning its argument).
        for (const part of e.arguments) {
          const why = shows(part, depth + 1);
          if (why) return `“${e.getText().slice(0, 40)}”, made from ${why}`;
        }
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
    // Every file a screen may be made of: elements in .tsx, components made with createElement in .ts
    // too. Tests and configuration are not screens; the files that show a figure are trusted (above),
    // and this lint is not a screen.
    if (
      !/\.tsx?$/.test(file) ||
      /\.test\.tsx?$/.test(file) ||
      /^(vitest|next|drizzle|playwright)\.config\.ts$/.test(file) ||
      TRUSTED_FILES.includes(file) ||
      file === 'rama/lint.ts'
    )
      continue;
    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
        const open = ts.isJsxElement(node) ? node.openingElement : node;
        // Only the house stack's own Figure is a figure: a component of another file that is merely named
        // Figure is read like any other.
        const figureDecl = target(open.tagName)?.declarations?.[0];
        if (
          tagOf(open) === 'Figure' &&
          figureDecl &&
          rel(figureDecl.getSourceFile()) === FIGURE_COMPONENT
        ) {
          checkFigure(sf, open);
          return; // what a Figure holds is the Figure's
        }
        const tag = tagOf(open);
        const tagDecl = /^[A-Z]/.test(tag) ? target(open.tagName)?.declarations?.[0] : undefined;
        const ownComponent = Boolean(
          tagDecl && !rel(tagDecl.getSourceFile()).includes('node_modules/'),
        );
        // Props spread in (`{...{ text: '123' }}`, or a name for such an object) count as written.
        // Spread props, opened all the way down (`{...{ ...{ children: '123' } }}`, names followed).
        type Prop = {
          node: ts.Node;
          name: string;
          given: ts.Expression | undefined;
          /** A spread the lint could not follow to where it is written: refused, not trusted. */
          lost?: true;
        };
        const opened = (at: ts.Node, e: ts.Expression, steps = 0): Prop[] => {
          const lost: Prop[] = [{ node: at, name: '', given: undefined, lost: true }];
          if (steps >= FOLLOW_LIMIT) return lost;
          const next = (x: ts.Expression) => opened(at, x, steps + 1);
          if (unwrap(e) !== e) return next(unwrap(e));
          if (ts.isIdentifier(e)) {
            const d: ts.Declaration | undefined = target(e)?.valueDeclaration;
            if (d && ts.isVariableDeclaration(d))
              return d.initializer
                ? [
                    ...next(d.initializer),
                    ...assignedTo(target(e)!, d.getSourceFile()).flatMap(next),
                  ]
                : [];
            // A component's own props spread on (`{...props}`) are judged where it is given them.
            if (d && (ts.isParameter(d) || ts.isBindingElement(d))) return [];
            return lost;
          }
          // Either branch may be the one spread.
          if (ts.isConditionalExpression(e)) return [...next(e.whenTrue), ...next(e.whenFalse)];
          if (ts.isBinaryExpression(e)) {
            const op = e.operatorToken.kind;
            if (op === ts.SyntaxKind.AmpersandAmpersandToken) return next(e.right);
            if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken)
              return [...next(e.left), ...next(e.right)];
            return lost;
          }
          // One of the product's own functions: what it gives back is spread.
          if (ts.isCallExpression(e)) {
            const callee = ts.isPropertyAccessExpression(e.expression)
              ? e.expression.name
              : e.expression;
            const d = target(callee)?.valueDeclaration;
            const fn =
              d && ts.isFunctionDeclaration(d)
                ? d
                : d &&
                    ts.isVariableDeclaration(d) &&
                    d.initializer &&
                    (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
                  ? d.initializer
                  : undefined;
            if (fn?.body && !rel(fn.getSourceFile()).includes('node_modules/'))
              return [
                ...returnsOf(fn.body).flatMap(next),
                // What it is given may be what it gives back (`make({ children: '123' })`).
                ...e.arguments
                  .filter((x) => ts.isStringLiteral(x) || !isNumber(x))
                  .map((x): Prop => ({ node: at, name: 'children', given: x })),
              ];
            return lost;
          }
          if (!ts.isObjectLiteralExpression(e)) {
            // Nothing (null, undefined, false) spreads nothing; anything else is not taken on trust.
            const t = checker.getTypeAtLocation(e);
            return t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.BooleanLike)
              ? []
              : lost;
          }
          return e.properties.flatMap((p): Prop[] => {
            if (ts.isShorthandPropertyAssignment(p))
              return [{ node: at, name: p.name.text, given: p.name }];
            if (ts.isSpreadAssignment(p)) return next(p.expression);
            const name = propName(p.name);
            if (ts.isPropertyAssignment(p)) return [{ node: at, name, given: p.initializer }];
            // A getter or a method gives what it returns.
            if ((ts.isGetAccessorDeclaration(p) || ts.isMethodDeclaration(p)) && p.body)
              return returnsOf(p.body).map((given) => ({ node: at, name, given }));
            return [];
          });
        };
        const spread = open.attributes.properties.flatMap((a) =>
          ts.isJsxSpreadAttribute(a) ? opened(a, a.expression) : [],
        );
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
          if ('lost' in a && a.lost) {
            unmarked(
              sf,
              a.node,
              `a spread the lint cannot follow to where it is written, so it may hold a number`,
            );
            continue;
          }
          if (!a.given) continue;
          const name = a.name;
          // Text handed to one of the product's own components may be shown by it, where the lint sees
          // only "some text": every prop but `key` is judged where it is handed over (a number handed
          // over is judged where the component shows it). A library's component (a link, an image) is
          // judged only by the attributes a person reads.
          // A number handed over is left to where the component shows it only when the prop is a plain
          // number there (then the lint sees a number); handed into a prop of any wider kind
          // (`ReactNode`) it would be seen only as "an element", so it is judged here.
          const expected = checker.getContextualType(a.given);
          const plainNumber =
            expected !== undefined &&
            Boolean(expected.flags & (ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike)) &&
            !expected.isUnion();
          const handed =
            ownComponent &&
            name !== 'key' &&
            !(!ts.isStringLiteral(a.given) && isNumber(a.given) && plainNumber);
          const shown =
            handed ||
            (!ownComponent && (SHOWN_ATTRIBUTES.has(name) || name === 'dangerouslySetInnerHTML')) ||
            ((name === 'value' || name === 'defaultValue') && SHOWN_VALUE_ON.has(tag));
          if (!shown) continue;
          // HTML set directly is shown as it is written: its object opened like a spread (names, choices,
          // functions followed), and refused when it cannot be opened.
          if (name === 'dangerouslySetInnerHTML') {
            for (const h of opened(a.node, a.given)) {
              const why = h.lost
                ? 'raw HTML the lint cannot follow to where it is written, so it may hold a number'
                : h.name === '__html' && h.given
                  ? shows(h.given)
                  : null;
              if (why) unmarked(sf, a.node, why);
            }
            continue;
          }
          const given = a.given;
          const why = given ? shows(given) : null;
          if (why) unmarked(sf, a.node, why);
        }
      }
      // A component shows what it gives back, element or not: a function named with a capital, or the
      // file's default export (a page), named or not.
      const isFn = (x: ts.Node | undefined): x is ts.ArrowFunction | ts.FunctionExpression =>
        Boolean(x && (ts.isArrowFunction(x) || ts.isFunctionExpression(x)));
      const defaulted = (n: ts.Node) =>
        ts.canHaveModifiers(n) &&
        (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      let exported: ts.Expression | undefined;
      let exportedBody: ts.ConciseBody | undefined;
      // The default export by name (`export default page`, `export { page as default }`): its function.
      const byName = (id: ts.Identifier | ts.ModuleExportName) => {
        const d = target(id)?.valueDeclaration;
        if (d && ts.isFunctionDeclaration(d)) return d.body;
        if (d && ts.isVariableDeclaration(d) && isFn(d.initializer)) return d.initializer.body;
        return undefined;
      };
      if (ts.isExportAssignment(node) && !node.isExportEquals) {
        exported = node.expression;
        if (exported) exported = unwrap(exported);
        if (exported && ts.isIdentifier(exported)) exportedBody = byName(exported);
      }
      if (
        ts.isExportDeclaration(node) &&
        !node.moduleSpecifier &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause)
      )
        for (const el of node.exportClause.elements)
          if (el.name.text === 'default') exportedBody = byName(el.propertyName ?? el.name);
      const component =
        (ts.isFunctionDeclaration(node) &&
          ((node.name && /^[A-Z]/.test(node.name.text)) || defaulted(node))) ||
        (ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          /^[A-Z]/.test(node.name.text) &&
          isFn(node.initializer)) ||
        isFn(exported) ||
        Boolean(exportedBody);
      const body = ts.isFunctionDeclaration(node)
        ? node.body
        : ts.isVariableDeclaration(node) && isFn(node.initializer)
          ? node.initializer.body
          : isFn(exported)
            ? exported.body
            : exportedBody;
      if (component && body)
        for (const given of returnsOf(body)) {
          const why = shows(given);
          if (why) unmarked(sf, given, why);
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

/**
 * A property's name as written: a computed one written as text is read, and any other computed name is
 * taken as `children`, a name that is shown, so its value is judged rather than skipped.
 */
function propName(n: ts.PropertyName): string {
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
  if (ts.isComputedPropertyName(n)) {
    const x = unwrap(n.expression);
    if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) return x.text;
  }
  return 'children';
}

/** The value inside wrappers that do not change it: brackets, `as`, `satisfies`, `!`, `<T>`. */
function unwrap(e: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isTypeAssertionExpression(e)
  )
    e = e.expression;
  return e;
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
  const dir =
    args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--trusted') ?? process.cwd();
  const trustedAt = args.indexOf('--trusted');
  const found = lintFigures(dir, trustedAt >= 0 ? args[trustedAt + 1] : undefined);
  if (args.includes('--json')) process.stdout.write(JSON.stringify(found) + '\n');
  else if (found.length) {
    for (const f of found) console.error(f.sentence);
    console.error(
      `\n${found.length} thing${found.length === 1 ? '' : 's'} to fix before the build.`,
    );
  } else console.log('Every number on a screen is a traced figure.');
  process.exitCode = found.length ? 1 : 0;
}
