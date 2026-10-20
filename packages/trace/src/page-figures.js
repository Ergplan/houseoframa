/* global document, window */
// Runs inside the captured page (capture.ts sends it as text). Finds every figure: traced ones first
// (the convention's data-rama-figure, then the overlay's selectors), then every amount, percentage or
// count that no traced figure covers: those are recorded untraced.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called by name from capture.ts, as text
function collectFigures(arg) {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left + window.scrollX),
      y: Math.round(r.top + window.scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };
  const text = (el) => (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const traced = [];
  const out = [];
  for (const el of Array.from(document.querySelectorAll('[data-rama-figure]'))) {
    if (!visible(el)) continue;
    traced.push(el);
    out.push({
      id: el.getAttribute('data-rama-figure'),
      origin: 'attribute',
      text: text(el),
      box: box(el),
      args: el.getAttribute('data-rama-args'),
      value: el.getAttribute('data-rama-value'),
    });
  }
  for (const f of arg.overlay) {
    const el = document.querySelector(f.selector);
    if (!el || !visible(el)) continue;
    traced.push(el);
    out.push({ id: f.id, origin: 'overlay', text: text(el), box: box(el) });
  }
  // Untraced figures. Every element is judged by its residual text: the visible text under it that is not
  // inside a traced figure or a figure already marked. Each pass marks the smallest elements whose residual
  // text qualifies, then repeats, so an ancestor whose own text holds another figure is marked too. Passes,
  // in order: amounts and percentages (an amount may be split across child elements, like "₹" and
  // "39,914"); elements whose residual text is a whole number (a count); and, conservatively, numbers
  // inside words ("13 bills"), which the detector cannot tell from labels and so marks rather than leave
  // bare. Dates, years, times and letter-digit identifiers are not figures.
  const amount = new RegExp(arg.pattern);
  // A count or amount without a currency: grouped digits, or up to nine plain ones. A leading "+" or ten
  // or more plain digits is an identifier (a phone number, an account), not a figure.
  const NUMERIC = /^[\u2212-]?(\d{1,3}(,\d{2,3})+|\d{1,9})(\.\d+)?$/;
  const MONTH = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?$/i;
  const numberInWords = (t) => {
    const tokens = t
      .split(/[\s·;()]+/) // a d/m or d/m/y date stays one token, and is not numeric
      .map((w) => w.replace(/[.,:;!?]+$/, ''))
      .filter(Boolean);
    return tokens.some(
      (w, i) =>
        NUMERIC.test(w) &&
        !/^(19|20)\d{2}$/.test(w) &&
        !MONTH.test(tokens[i - 1] ?? '') &&
        !MONTH.test(tokens[i + 1] ?? ''),
    );
  };
  const SKIP = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'];
  const insideTraced = (node) => traced.some((t) => t === node || t.contains(node));
  const candidates = Array.from(document.querySelectorAll('body, body *')).filter(
    (el) => !SKIP.includes(el.tagName) && visible(el) && !insideTraced(el),
  );
  const marked = [];
  // The text nodes an element is judged by. <body> is judged by its own direct text only: everything else
  // on the page belongs to an element below it, which is judged in its own right.
  const residualNodes = (el) => {
    const nodes = [];
    const walk = document.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const host = n.parentElement;
      if (!host || SKIP.includes(host.tagName) || !visible(host) || insideTraced(n)) continue;
      if (el.tagName === 'BODY' && host !== el) continue;
      if (marked.some((m) => m !== el && el.contains(m) && m.contains(n))) continue; // a figure nested inside
      nodes.push(n);
    }
    return nodes;
  };
  // A form field shows its value, which is no text node: an input or textarea is judged by its value, a
  // select by its chosen option. Checkboxes, radios, buttons and hidden fields show no figure.
  const fieldValue = (el) => {
    if (el.tagName === 'SELECT') return el.selectedOptions?.[0]?.textContent ?? '';
    if (el.tagName === 'TEXTAREA') return el.value;
    if (
      el.tagName === 'INPUT' &&
      ![
        'hidden',
        'checkbox',
        'radio',
        'button',
        'submit',
        'reset',
        'image',
        'file',
        'password',
      ].includes(el.type)
    ) {
      return el.value;
    }
    return null;
  };
  const residual = (el) =>
    fieldValue(el)?.replace(/\s+/g, ' ').trim() ??
    residualNodes(el)
      .map((n) => n.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  // A detected figure's hotspot is drawn around the text it was judged by (its residual text), not the
  // whole element: tight around a split amount, around body text, and around the part of an element that is
  // not a traced figure inside it.
  const figureBox = (el) => {
    const rects = residualNodes(el)
      .map((n) => {
        const r = document.createRange();
        r.selectNodeContents(n);
        return r.getBoundingClientRect();
      })
      .filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return box(el);
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    return {
      x: Math.round(left + window.scrollX),
      y: Math.round(top + window.scrollY),
      w: Math.round(Math.max(...rects.map((r) => r.right)) - left),
      h: Math.round(Math.max(...rects.map((r) => r.bottom)) - top),
    };
  };
  const smallest = (els) =>
    els.filter((el) => !els.some((other) => other !== el && el.contains(other)));
  const pass = (qualifies) => {
    for (;;) {
      const hits = candidates.filter(
        (el) =>
          !marked.includes(el) && !marked.some((m) => m.contains(el)) && qualifies(residual(el)),
      );
      const found = smallest(hits);
      if (!found.length) return;
      marked.push(...found);
    }
  };
  pass((t) => amount.test(t));
  pass((t) => NUMERIC.test(t));
  pass((t) => numberInWords(t));
  // Texts are read once everything is marked: each figure's own text, without the figures inside it.
  const texts = new Map(marked.map((el) => [el, residual(el)]));
  // Figures drawn as pixels cannot be read, so every canvas and video, and every image or CSS background
  // image large enough to hold a figure a person reads (48 × 32 px or more), is marked untraced as a whole.
  // Smaller images are icons: they cannot hold a legible figure, and marking them would make the honest
  // rate untrue.
  const LEGIBLE = (r) => r.width >= 48 && r.height >= 32;
  for (const el of candidates) {
    if (texts.has(el)) continue;
    const r = el.getBoundingClientRect();
    if (el.tagName === 'CANVAS') texts.set(el, 'canvas');
    else if (el.tagName === 'VIDEO') texts.set(el, 'video');
    else if (el.tagName === 'IMG' && LEGIBLE(r)) {
      const name =
        el.getAttribute('alt') ||
        (el.getAttribute('src') ?? '').split('/').pop()?.split('?')[0] ||
        'unnamed';
      texts.set(el, `image: ${name.slice(0, 60)}`);
    } else if (LEGIBLE(r) && /url\(/.test(window.getComputedStyle(el).backgroundImage)) {
      texts.set(el, 'background image');
    }
  }
  for (const el of candidates) {
    if (!texts.has(el)) continue;
    const pixels =
      ['CANVAS', 'VIDEO', 'IMG'].includes(el.tagName) || texts.get(el) === 'background image';
    out.push({
      id: null,
      origin: 'detected',
      text: texts.get(el),
      box: pixels ? box(el) : figureBox(el),
    });
  }
  return out;
}
