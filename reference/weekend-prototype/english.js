// ---------- plain English for every link ----------
// Each exported symbol in the repo, described the way a reviewer would say it. The import statements decide which phrases appear; the words here only translate them.
const WORDS={
  // lib/data.ts
  ASSETS:'the six packages with their vendors and bills of quantities',DEFAULT_MASTER:'the default plant assumptions',INTEL:'the web intel on each vendor',TECH:'the technical-spec comparison per package',PARTS:'what each machine part is and what to check on it',SRC:'the source links behind the research',RESEARCH_DATE:'the date the market research was done',
  Asset:'the shape of a package record',Cell:'the shape of one quoted line',Master:'the shape of the plant assumptions',Row:'the shape of a BoQ row',Vendor:'the shape of a vendor record',
  // lib/calc.ts
  compute:'per-vendor totals after loading scope gaps and normalising for capacity and lifecycle cost',money:'rupee figures in lakh and crore',rate:'unit rates formatted',amt:'quantity × rate for one line',aName:'the package name as renamed in Master data',assetById:'a package looked up by its id',benchFor:'the market benchmark for a line',benchFlag:'whether a quote sits inside the benchmark range',aiContext:'the package summary handed to the AI',portfolio:'the whole-plant capex total and spread',partInfo:'a part’s description for the 3D view',rowObj:'a BoQ row in named fields',Comp:'the shape of a comparison result',Disc:'the shape of discovered market prices',
  // lib/iso.ts
  siteSVG:'the isometric plant map',
  // lib/store.tsx
  useStudio:'the shared state: open package, assumptions, selection, AI health, reviews',StudioProvider:'the shared state set up for the whole app',
  // lib/history.ts
  mergedHistory:'a vendor’s past jobs and reviews, including ones added in this browser',trackScore:'the 0–100 track score',scoreBand:'the good / warn / bad band for a score',Review:'the shape of a review',
  // lib/focus.ts
  flash:'scroll to and highlight a section',flashEl:'highlight one element',SECTIONS:'which screen section each spoken target means',assetFromText:'which package a sentence is about',makeScanner:'spotting vendors, parts and figures in a spoken answer',findFigure:'the on-screen figure a sentence refers to',inView:'whether an element is on screen',Mention:'the shape of a spotted mention',
  // lib/ai.ts
  llm:'a text answer from the model via /api/llm',llmJson:'a structured answer from the model',errText:'API errors turned into plain English',Turn:'the shape of a chat turn',
  // lib/walkEngine.ts
  createEngine:'the 3D machine built with its cameras',TOUR:'the guided tour order',Engine:'the shape of the 3D engine',
  // lib/server/config.ts
  cfg:'server-side settings and the OpenAI key',
  // components
  AssetView:'the package screen it opens when you click a machine',MasterModal:'the Master data form',RealTalk:'the voice advisor dock',Walkthrough:'the 3D walkthrough',AiPanel:'the typed Q&A panel',AiKind:'the kinds of AI brief',Markdown:'rendering of AI answers',VendorHistory:'the vendor track record',Studio:'the whole Studio screen',
};
const edgeSyms=(a,b)=>(G.edgeSyms&&G.edgeSyms[a+'>'+b])||[];
function english(a,b){ // what brick a takes from brick b
  const ss=edgeSyms(a,b);const ph=ss.map(s=>WORDS[s]).filter(Boolean);
  if(!ph.length)return '';
  const shapes=ph.filter(p=>p.startsWith('the shape of')),rest=ph.filter(p=>!p.startsWith('the shape of'));
  const out=[...rest];if(shapes.length&&!rest.length)out.push('only the record formats');else if(shapes.length)out.push('and the record formats');
  return out.join('; ');
}
function depList(n){ // "Depends on" in English
  return n.imports.map(q=>`<div class="dep"><span class="lnk" data-p="${q}">↓ ${q}</span><div class="en">${esc(english(n.path,q)||'used, but only for its formats')}</div></div>`).join('');
}
function useList(n){ // "Used by" in English, from the other side
  return n.importers.map(q=>`<div class="dep"><span class="lnk" data-p="${q}">↑ ${q}</span><div class="en">takes ${esc(english(q,n.path)||'its formats')}</div></div>`).join('');
}
function reviewerLine(n){ // one paragraph a CFO can read
  const floors=G.layers.map(l=>l.id);const by={};n.imports.forEach(q=>{const f=byPath[q].layer;(by[f]=by[f]||[]).push(q);});
  const parts=floors.filter(f=>by[f]).map(f=>{const names=by[f].map(q=>q.split('/').pop().replace(/\.(tsx?|css|mjs|json)$/,''));return `${by[f].length} on the ${LAYER_SHORT[f].toLowerCase()} floor (${names.join(', ')})`;});
  const needs=n.imports.length?`It needs ${n.imports.length} other brick${n.imports.length>1?'s':''}: ${parts.join('; ')}.`:'It needs nothing else to do its job.';
  const used=n.importers.length?` ${n.importers.length} brick${n.importers.length>1?'s rely':' relies'} on it, so a change here is felt in ${n.importers.length>1?'all of them':'that screen'}.`:' Nothing else relies on it, so it can change without side effects.';
  const test=n.importers.length>=4?' With this many dependants and no test behind it, this is one of the bricks a reviewer should ask to see verified first.':'';
  return needs+used+test;
}
