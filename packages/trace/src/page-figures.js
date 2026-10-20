/* global document, window */
// Runs inside the captured page (capture.ts sends it as text). Finds every figure: traced ones first
// (the convention's data-rama-figure, then the overlay's selectors), then every leaf whose text matches
// the figure pattern and that no traced figure covers: those are recorded untraced.
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
  const re = new RegExp(arg.pattern);
  const covered = (el) => traced.some((t) => t === el || t.contains(el) || el.contains(t));
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    if (el.children.length > 0 || !visible(el) || covered(el)) continue;
    const t = text(el);
    if (t && re.test(t)) out.push({ id: null, origin: 'detected', text: t, box: box(el) });
  }
  return out;
}
