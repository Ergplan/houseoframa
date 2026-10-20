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
  // Untraced figures: the smallest element whose text holds an amount or a percentage (an amount may be
  // split across child elements, like "₹" and "39,914"), or whose whole text is a number (a count). An
  // element is skipped when a child already qualifies, so each figure is marked once, where it is drawn.
  const amount = new RegExp(arg.pattern);
  // A count or amount without a currency: grouped digits, or up to nine plain ones. A leading "+" or ten
  // or more plain digits is an identifier (a phone number, an account), not a figure.
  const number = /^[\u2212-]?(\d{1,3}(,\d{2,3})+|\d{1,9})(\.\d+)?$/;
  const covered = (el) => traced.some((t) => t === el || t.contains(el) || el.contains(t));
  const candidates = Array.from(document.querySelectorAll('body *')).filter(
    (el) =>
      !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName) &&
      visible(el) &&
      !covered(el),
  );
  const smallest = (els) =>
    els.filter((el) => !els.some((other) => other !== el && el.contains(other)));
  // First amounts and percentages, at the smallest element holding one; then bare numbers not inside one.
  const amounts = smallest(candidates.filter((el) => amount.test(text(el))));
  const numbers = smallest(
    candidates.filter(
      (el) =>
        number.test(text(el)) && !amounts.some((a) => a === el || a.contains(el) || el.contains(a)),
    ),
  );
  for (const el of candidates) {
    if (amounts.includes(el) || numbers.includes(el))
      out.push({ id: null, origin: 'detected', text: text(el), box: box(el) });
  }
  return out;
}
