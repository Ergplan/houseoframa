// ---------- trails: click a figure on a real screen, get formula, inputs, data, build history and sign-off ----------
// Every number below was produced by running the repository's own calc.ts / history.ts (not retyped from the screenshot).
const HOT={ // hotspots per screen, in % of the captured image
  package:[
    {t:'thermax_quoted',x:2.6,y:54.4,w:7.2,h:4.6},{t:'thermax_gross',x:10.4,y:55,w:5.2,h:3.6},{t:'thermax_pertph',x:16.2,y:55,w:6.3,h:3.6},
    {t:'spread',x:5.4,y:36.2,w:6.3,h:4},{t:'track92',x:2.6,y:60,w:9.3,h:4},{t:'cheema_quoted',x:35.2,y:54.4,w:7.2,h:4.6},{t:'thermodyne_quoted',x:67.9,y:54.4,w:7.2,h:4.6},
  ],
  site:[{t:'l1_total',x:75.4,y:65.1,w:10.8,h:3},{t:'spread_total',x:86.7,y:63.2,w:10.8,h:3},{t:'thermodyne_quoted',x:91.6,y:53.9,w:5.8,h:2.5}],
  history:[{t:'track92',x:28.4,y:29,w:3.7,h:7.7},{t:'warranty66',x:21.8,y:47,w:10.3,h:4}],
};
const fmtINR=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const DATA_IN_CODE={file:'lib/data.ts',note:'There is no database in this build. Vendor quotes, benchmarks and plant assumptions are written into lib/data.ts as sample data, and the screen says "Sample bids" and "illustrative demo data" for that reason. In the production build each of these inputs becomes a row in the quotes table with a vendor, a date and the person who entered it.'};
const TRACES={
 thermax_quoted:{figure:'₹1.50 Cr',title:'Thermax · quoted, ex GST',screen:'package',
  what:'The sum of the sixteen bill-of-quantities lines Thermax priced for the 4 TPH biomass boiler, before GST.',
  formula:{en:'Add up quantity × rate for every line the vendor quoted.',code:'quoted += qty × rate   // calc.ts lines 43–45, amt() line 18',file:'lib/calc.ts'},
  inputs:[['16 BoQ lines, vendor A (Thermax)','lib/data.ts, boiler rows b1–b16'],['Largest: b1 boiler shell','1 × ₹52,00,000'],['b2 combustion grate','1 × ₹18,50,000'],['b10 air pollution control','1 × ₹12,00,000'],['b3 economiser','1 × ₹9,50,000'],['b16 IBR, erection, commissioning','1 × ₹9,50,000'],['… eleven more lines','₹48,50,000 together'],['Total','₹1,50,00,000']],
  data:[DATA_IN_CODE.note,'Master data does not touch this figure; it is a pure sum of the quote.','Shown as "₹1.50 Cr" by money(), calc.ts lines 9–15, which rounds to two decimals of a crore.'],
  files:['lib/data.ts','lib/calc.ts','components/AssetView.tsx']},
 thermax_gross:{figure:'₹1.77 Cr',title:'Thermax · including GST',screen:'package',
  what:'The quoted total plus GST, line by line.',
  formula:{en:'For each quoted line add quantity × rate × GST% ; then gross = quoted + GST.',code:'gst += amount × r.gst / 100 ; gross = quoted + gst   // calc.ts lines 45, 49',file:'lib/calc.ts'},
  inputs:[['Quoted, ex GST','₹1,50,00,000'],['GST rate on all 16 boiler lines','18% (data.ts, 4th field of each row)'],['GST','₹27,00,000'],['Gross','₹1,77,00,000']],
  data:[DATA_IN_CODE.note,'The 18% is stored per line, so a line at a different slab would be computed correctly; in this dataset every boiler line is 18%.'],
  files:['lib/data.ts','lib/calc.ts','components/AssetView.tsx']},
 thermax_pertph:{figure:'₹37,50,000 per TPH',title:'Thermax · price per tonne of steam per hour',screen:'package',
  what:'The scope-adjusted price divided by the offered capacity, so bids of different sizes can be compared.',
  formula:{en:'Per-unit price = (quoted + scope gaps loaded) ÷ vendor capacity.',code:'perUnit = scopeAdj / v.cap ; scopeAdj = quoted + gapLoad   // calc.ts lines 48–49',file:'lib/calc.ts'},
  inputs:[['Quoted','₹1,50,00,000'],['Scope gaps loaded','₹0 (Thermax quoted every line)'],['Capacity offered','4 TPH (data.ts, vendor A cap)'],['Per TPH','₹37,50,000']],
  data:[DATA_IN_CODE.note,'For Thermodyne the same formula gives ₹23,42,000 per TPH because its quote is for 5 TPH, which is why per-unit price and quoted price rank the vendors differently.'],
  files:['lib/data.ts','lib/calc.ts','components/AssetView.tsx']},
 spread:{figure:'Spread 37%',title:'Boiler package · spread between lowest and highest quote',screen:'package',
  what:'How far apart the three quotes are, before any normalisation. Over 25% the chip turns amber.',
  formula:{en:'Spread = (highest quoted ÷ lowest quoted − 1) × 100.',code:'spread = (out[byQuoted[2]].quoted / out[byQuoted[0]].quoted − 1) × 100   // AssetView.tsx line 19',file:'components/AssetView.tsx'},
  inputs:[['Highest quoted (Thermax)','₹1,50,00,000'],['Lowest quoted (Thermodyne)','₹1,09,20,000'],['Spread','37.4% → shown as 37%'],['Amber threshold','25% (AssetView.tsx line 31)']],
  data:['Computed on screen from the two quoted totals; not stored anywhere.','Note the formula assumes exactly three vendors (byQuoted[2]). A package with two or four bids would mis-state the spread. This is the kind of thing a test would have caught.'],
  files:['components/AssetView.tsx','lib/calc.ts','lib/data.ts']},
 cheema_quoted:{figure:'₹1.21 Cr',title:'Cheema Boilers · quoted, ex GST',screen:'package',
  what:'Fifteen quoted lines; one line not quoted and loaded for comparison.',
  formula:{en:'Sum of quantity × rate for the 15 lines quoted; the missing line is loaded separately at the highest price another vendor quoted for it.',code:'fill = max(other vendors’ amount for that line) ; gapLoad += fill   // calc.ts line 46',file:'lib/calc.ts'},
  inputs:[['Quoted (15 lines)','₹1,21,20,000'],['Not quoted: b9 online soot blowing','loaded at ₹4,50,000 (Thermax’s price)'],['Scope-adjusted','₹1,25,70,000'],['Lifecycle fuel penalty vs Thermax, 5 years','+₹40,65,336 at 84% efficiency'],['Normalised total','₹1,66,35,336 → ₹1.66 Cr, rank 2']],
  data:[DATA_IN_CODE.note,'The fuel penalty uses the Master data assumptions: ₹8,000/t briquettes, GCV 3,800 kcal/kg, 6,000 hours, 0.7 load, 5 years. Change any of them in Master data and this normalised figure recomputes; the quoted figure does not.'],
  files:['lib/data.ts','lib/calc.ts','components/AssetView.tsx','components/MasterModal.tsx']},
 thermodyne_quoted:{figure:'₹1.09 Cr',title:'Thermodyne Engineering · lowest quote, highest normalised cost',screen:'package',
  what:'The cheapest quote on paper and the most expensive once scope, capacity and fuel are accounted for. This single figure is the argument for the whole product.',
  formula:{en:'Quoted = Σ qty × rate (14 lines). Then: load the 2 missing lines at others’ highest price; scale to the required 4 TPH with (required ÷ offered)^0.6; add the 5-year fuel penalty from its 80% efficiency.',code:'scopeAdj = quoted + gapLoad ; capF = (a.req.cap / v.cap)^a.scaleExp ; norm = scopeAdj × capF + lcDelta   // calc.ts lines 48–52',file:'lib/calc.ts'},
  inputs:[['Quoted (14 lines)','₹1,09,20,000'],['Not quoted: b9 soot blowing, b14 ash removal','loaded ₹4,50,000 + ₹3,40,000'],['Scope-adjusted','₹1,17,10,000'],['Capacity factor (4 ÷ 5)^0.6','0.8747 → ₹1,02,42,616'],['Fuel penalty vs Thermax, 5 yrs, 80% vs 87%','+₹99,60,073'],['Normalised total','₹2,02,02,689 → ₹2.02 Cr, rank 3 of 3']],
  data:[DATA_IN_CODE.note,'The lifecycle line uses lifecycle(), calc.ts lines 34–37: heat = duty 22,40,000 kcal/h × load 0.7 × 6,000 h; fuel tonnes = heat ÷ (GCV × efficiency) ÷ 1000; cost = tonnes × ₹8,000 × 5 years. All six assumptions come from Master data (DEFAULT_MASTER in data.ts, or the values saved in this browser).','The exponent 0.6 (scaleExp) is a hard-coded engineering rule of thumb in data.ts. Nobody on the discovery call set it; it should be a reviewed assumption.'],
  files:['lib/data.ts','lib/calc.ts','components/AssetView.tsx','components/MasterModal.tsx','lib/store.tsx']},
 track92:{figure:'92 / 100',title:'Thermax · track record with the client',screen:'history',
  what:'A composite score from the client’s own experience with this vendor: quality of similar work, warranties honoured and plant satisfaction, with recent years weighing more.',
  formula:{en:'Score = quality ÷ 5 × 40 + (warranties honoured ÷ claims) × 30 + satisfaction ÷ 10 × 30, where quality and satisfaction are year-weighted averages (oldest 1, next 2, newest 3).',code:'score = round((quality/5)×40 + warranty×30 + (satisfaction/10)×30)   // history.ts lines 35–44',file:'lib/history.ts'},
  inputs:[['Reviews','2023, 2024, 2025 (17 reviewers in total)'],['Quality 4.5 / 4.4 / 4.6, weighted','4.52 → 36.1 points'],['Warranty claims honoured','6 of 6 → 30.0 points'],['Satisfaction 8.6 / 8.3 / 8.8, weighted','8.60 → 25.8 points'],['Score','91.9 → 92, band "good" (≥ 80)']],
  data:['Review data lives in HISTORY in lib/history.ts as sample data.','Reviews added through "Add annual review" are merged in by mergedHistory() but saved only in that person’s browser (store.tsx lines 22–23, key ps.reviews). Two committee members can therefore see two different scores for the same vendor. For a committee product this must move to shared storage with a name against each review.'],
  files:['lib/history.ts','lib/calc.ts','components/VendorHistory.tsx','lib/store.tsx']},
 warranty66:{figure:'6 of 6 claims · 100%',title:'Thermax · warranties honoured',screen:'history',
  what:'Every warranty claim the plant raised against Thermax was honoured. This is 30 of the 92 points.',
  formula:{en:'Warranty share = honoured ÷ claims across all reviews (not year-weighted).',code:'warranty = claims ? honored / claims : 1   // history.ts line 39',file:'lib/history.ts'},
  inputs:[['2023','3 claims, 3 honoured'],['2024','2 claims, 2 honoured'],['2025','1 claim, 1 honoured'],['Share','6 ÷ 6 = 100% → 30 points']],
  data:['Note the fallback: a vendor with zero claims scores a full 30 points, the same as one who honoured every claim. A new vendor with no history returns no score at all, which is the safer behaviour. Whether "no claims" should equal "all claims honoured" is a question for the committee, not the code.'],
  files:['lib/history.ts','components/VendorHistory.tsx']},
 l1_total:{figure:'₹3.37 Cr',title:'L1 total, six packages, ex GST',screen:'site',
  what:'The lowest quote in each of the six packages, added together. The number the CFO takes to the board.',
  formula:{en:'For every package, take the lowest quoted total; add the six.',code:'ASSETS.forEach(a => { l1 += out[byQuoted[0]].quoted })   // Studio.tsx lines 49–50',file:'components/Studio.tsx'},
  inputs:[['Rooftop solar · Oriano Clean Energy','₹1,45,26,000'],['Continuous fryer · Prakashwala','₹18,80,000'],['Bhujia extruder · Sneha Food Equipments','₹6,75,000'],['Pouch packaging · Pakona Engineers','₹17,30,000'],['Thermic fluid heater · Thermodyne','₹39,75,000'],['Biomass boiler · Thermodyne','₹1,09,20,000'],['Total','₹3,37,06,000']],
  data:[DATA_IN_CODE.note,'This is the lowest quoted figure, not the recommended award. On the boiler the lowest quote is also the worst normalised value, so a board paper built on L1 alone understates the likely spend.'],
  files:['components/Studio.tsx','lib/calc.ts','lib/data.ts']},
 spread_total:{figure:'+₹1.40 Cr',title:'Spread L1 → H1 across the plant',screen:'site',
  what:'How much more the plant would pay if the highest quote won every package.',
  formula:{en:'For every package, highest quoted minus lowest quoted; add the six.',code:'h1 += out[byQuoted[2]].quoted ; shown as money(h1 − l1)   // Studio.tsx lines 50, 80',file:'components/Studio.tsx'},
  inputs:[['Σ highest quotes','₹4,77,10,000'],['Σ lowest quotes','₹3,37,06,000'],['Spread','₹1,40,04,000']],
  data:['Same three-vendor assumption as the package spread (byQuoted[2]); correct for this dataset, fragile for any other.'],
  files:['components/Studio.tsx','lib/calc.ts','lib/data.ts']},
};
function buildTrail(files){ // commits that touched these files, newest first, from git
  const rows=[];files.forEach(f=>{const n=byPath[f];if(!n)return;n.changes.forEach(x=>rows.push({c:x.c,f,ch:x.ch}));});
  rows.sort((a,b)=>a.c.t-b.c.t);
  return rows.map(r=>`<div class="dep"><span class="lnk" data-p="${r.f}">${r.f}</span><div class="en">${r.ch.kind==='A'?'laid':'reworked +'+r.ch.add+' / −'+r.ch.del} · lift ${r.c.i+1}, ${fmtT(r.c.t)} IST · ${esc(r.c.author)} · "${esc(r.c.subject)}"</div></div>`).join('');
}
function showTrail(id){const t=TRACES[id];if(!t)return;glow=new Set(t.files);sel=null;
  mon.innerHTML=`<h2>Trail · ${esc(t.figure)}</h2><h3 style="font-family:var(--sans);word-break:normal">${esc(t.title)}</h3><p>${esc(t.what)}</p>
  <h2 style="margin-top:16px">1 · Formula</h2><p>${esc(t.formula.en)}</p><pre class="code">${esc(t.formula.code)}</pre><div class="links"><span class="lnk" data-p="${t.formula.file}">▪ ${t.formula.file}</span></div>
  <h2 style="margin-top:16px">2 · Inputs</h2><dl class="kv">${t.inputs.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  <h2 style="margin-top:16px">3 · Where the data lives</h2>${t.data.map(d=>`<p>${esc(d)}</p>`).join('')}
  <h2 style="margin-top:16px">4 · Build trail</h2><div class="links">${buildTrail(t.files)}</div>
  <h2 style="margin-top:16px">5 · Review &amp; sign-off</h2>
  <div class="sig"><div><span class="k">Reviewed by</span><span class="v">—</span></div><div><span class="k">Signed off by</span><span class="v">—</span></div><div><span class="k">Status</span><span class="v red">Unsigned</span></div><div><span class="k">Automated check</span><span class="v red">None</span></div></div>
  <p class="note">Nothing in the repository records a review or a sign-off for this figure, and no test checks it. In House of Rama a figure cannot show without a name in this block: either a test that proves it or a reviewer who confirmed it in a walkthrough, with the date.</p>
  <p><button class="primary" id="trailGlow">Show on building</button> <button class="back" id="back">◀ Back to screen</button></p>`;
  wireLinks();document.getElementById('back').onclick=()=>openShow(t.screen);document.getElementById('trailGlow').onclick=()=>{closeShow();if(k<C.length){k=C.length;p=1;}};
}
