// ---------- discovery session: the conversation before the first commit ----------
// Reconstructed from what the repository actually shipped. Roles, not real names; illustrative dialogue, not a recording.
const PEOPLE={
  ph:{name:'Procurement Head',org:'client',ini:'PH',c:'#ffb429'},
  pe:{name:'Plant Engineer',org:'client',ini:'PE',c:'#5ad45a'},
  fc:{name:'Finance Controller',org:'client',ini:'FC',c:'#c98cff'},
  jw:{name:'jouleWise consultant',org:'advisor',ini:'JW',c:'#4fe3d8'},
  rm:{name:'Rama',org:'master agent',ini:'R',c:'#ece8dc'},
};
const SESSION=[
 {topic:'The problem',time:'10:00',items:[
  {w:'ph',t:'We have three quotes for the biomass boiler and they do not compare. One includes the chimney, one excludes erection, one is priced per TPH. The committee argues about the spreadsheet instead of the boiler.'},
  {w:'fc',t:'And it is not one package. Solar, fryer, extruder, packaging, thermic fluid heater, boiler. Six decisions, 18 offers, one capex approval for Bikaner Unit 2.'},
  {w:'rm',t:'So the job is not a vendor portal. It is a way for the committee to see every offer on one basis and know why one is cheaper. I will keep the scope to those six packages for this plant.'},
  {dec:'Scope: six capex packages, one plant',text:'The Studio covers exactly the six Bikaner Unit 2 packages. Vendor quotes are sample data until the real ones are loaded, and the screen says so.',bricks:['lib/data.ts','components/Studio.tsx'],screen:'site'},
 ]},
 {topic:'How it should open',time:'10:20',items:[
  {w:'pe',t:'When I open it I want to see the plant, not a table. Where the boiler sits, where the fryer line is. Then click the machine.'},
  {w:'jw',t:'An isometric site plan as the home screen, with the L1 figure printed on each machine. The whole capex spread visible before you open anything.'},
  {w:'rm',t:'Agreed. Site plan first, packages as clickable equipment, open purchase requisitions listed beside it with L1 and L1-to-H1 spread.'},
  {dec:'Home screen is the site plan',text:'Isometric plant drawing with every package labelled and priced; the requisition list sits next to it.',bricks:['lib/iso.ts','components/Studio.tsx','lib/calc.ts'],screen:'site'},
 ]},
 {topic:'Comparing bids line by line',time:'10:45',items:[
  {w:'ph',t:'Inside a package I need the bill of quantities side by side. Item by item. Who quoted what spec, what quantity, what rate.'},
  {w:'fc',t:'And when a vendor leaves something out, do not just mark it missing. Load it. Otherwise the vendor who forgot the chimney wins.'},
  {w:'rm',t:'Scope gaps get filled at the best quoted rate for that line and added to that vendor\'s total. Lowest amount per line is shaded. A market benchmark column sits at the end for every line.'},
  {dec:'BoQ comparison with gap loading',text:'16 lines for the boiler, three vendors, lowest shaded, gaps loaded not ignored, GST and grand totals, benchmark per line.',bricks:['components/AssetView.tsx','lib/calc.ts','lib/data.ts'],screen:'boq'},
 ]},
 {topic:'Putting offers on one basis',time:'11:15',items:[
  {w:'fc',t:'Price is not the decision. A cheaper boiler at 80% efficiency costs us more briquettes for ten years.'},
  {w:'pe',t:'Then the assumptions matter: briquette price, GCV, running hours, load factor. Those are ours, not the vendor\'s, and they change.'},
  {w:'rm',t:'Three normalisations: scope-adjusted price, capacity-adjusted price per TPH or kWp, and lifecycle cost over the horizon. The plant assumptions live in one editable Master data form and every figure recomputes.'},
  {dec:'Normalisation driven by Master data',text:'Fuel price, GCV, hours, load factor, horizon and tariff are inputs the client owns; scope, capacity and lifecycle adjustments follow from them.',bricks:['lib/calc.ts','components/MasterModal.tsx','lib/store.tsx'],screen:'master'},
  {w:'pe',t:'How will I know the normalisation arithmetic is right?'},
  {w:'jw',t:'We will walk you through it on screen. Every line shows its working.'},
  {warn:'Promised, not built: automated checks on the formulas',text:'The walkthrough was delivered; automated tests for lib/calc.ts were not. This is the gap House of Rama exists to close, and the reason every brick on this site carries a red dot.',bricks:['lib/calc.ts']},
 ]},
 {topic:'Seeing the machine',time:'11:40',items:[
  {w:'pe',t:'The committee has never seen an economiser. They approve line 13 without knowing what it is.'},
  {w:'jw',t:'A low-resolution 3D wireframe of each machine, where every BoQ line is a numbered part. Click the part, see what it is, what to check, and what each vendor offered for it.'},
  {w:'rm',t:'And a guided tour in a sensible order: furnace, grate, drum, tubes, economiser, ID fan, chimney. Offered technical specs sit beside the model against the requirement.'},
  {dec:'3D walkthrough, one part per BoQ line',text:'Orbit and walk-inside views, 16 numbered parts for the boiler, a tech-fit sheet with good / warn / bad per parameter.',bricks:['components/Walkthrough.tsx','lib/walkEngine.ts','lib/data.ts','public/boiler-ref.jpg'],screen:'walk'},
 ]},
 {topic:'Trusting the vendor',time:'12:05',items:[
  {w:'ph',t:'We have bought from Thermax before. That history should count. And I want to know what the market says about the new names.'},
  {w:'rm',t:'Two things, kept separate. Our own track record: past jobs, warranties honoured, plant satisfaction, scored out of 100. And web intel per vendor, every claim with a source link.'},
  {dec:'Vendor track record + sourced intel',text:'Track score from the client\'s own experience; dealer ratings, complaint flags and strengths from the web, each with its source.',bricks:['components/VendorHistory.tsx','lib/history.ts','lib/data.ts','components/AssetView.tsx'],screen:'history'},
 ]},
 {topic:'Talking to it',time:'12:20',items:[
  {w:'ph',t:'In the committee I will not be typing. Can I just ask it which boiler suits 10.5 kg/cm² and have it show me?'},
  {w:'jw',t:'A voice advisor that moves the screen for you: opens the package, highlights the part, starts the walkthrough, answers from the Studio\'s own data.'},
  {w:'rm',t:'The OpenAI key stays on the server; the browser only ever gets a short-lived session key. Typed questions use the same channel, with web search when voice is off.'},
  {dec:'AI Proc Advisory, server-held keys',text:'Realtime voice over WebRTC with function calls that drive the UI; three API routes; the key is read only on the server.',bricks:['components/RealTalk.tsx','lib/focus.ts','lib/ai.ts','app/api/realtime/session/route.ts','app/api/llm/route.ts','app/api/health/route.ts','lib/server/config.ts'],screen:'advisory'},
 ]},
 {topic:'Shipping it',time:'12:40',items:[
  {w:'fc',t:'Where does it run and who can open it? Anyone with the link can spend our API credits.'},
  {w:'rm',t:'Vercel, one click. A password gate in front of every route when STUDIO_PASSWORD is set. Sample vendor data is labelled illustrative on screen until real quotes replace it.'},
  {dec:'Vercel deployment behind a password',text:'Password gate, environment template, deployment notes in the README.',bricks:['proxy.ts','vercel.json','.env.example','README.md','start.command'],screen:'advisory'},
  {w:'ph',t:'Last question. When this recommends an award, who signs it?'},
  {w:'rm',t:'Today, nobody inside the software. That stays open.'},
  {warn:'Open: who signs off an award',text:'No sign-off step was designed or built. House of Rama\'s next sprint is exactly this ceremony: a named person confirms a screen in a walkthrough and its bricks turn green.',bricks:[]},
 ]},
];
const discEl=document.getElementById('discov');
function openDisc(topicIdx=0){closeShow();playing=false;setPlay();
  discEl.hidden=false;
  discEl.innerHTML=`<div class="bar"><h4>Discovery session · Procurement Studio</h4><span class="real amb">Reconstructed · illustrative dialogue</span><button id="closeDisc">✕ Back to site</button></div>
  <div class="disc"><nav class="agenda"><h5>Agenda · 28 Sep 2026</h5>${SESSION.map((s,i)=>`<button data-i="${i}" class="${i===topicIdx?'on':''}">${s.topic}<small>${s.time} IST</small></button>`).join('')}</nav>
  <div class="chat" id="chat">${SESSION.map((s,i)=>`<div class="topic" id="t${i}"><time>${s.time}</time>${esc(s.topic)}</div>`+s.items.map(it=>{
    if(it.w){const pp=PEOPLE[it.w];return `<div class="msg ${it.w==='rm'?'agent':''}"><div class="av" style="background:${pp.c}">${pp.ini}</div><div><div class="who"><b>${pp.name}</b> · ${pp.org}</div><div class="body">${esc(it.t)}</div></div></div>`;}
    const warn=!!it.warn;return `<div class="dec ${warn?'warn':''}"><div class="h"><span class="pill ${warn?'red':'green'}">${warn?'Not built':'Decision'}</span><b>${esc(it.dec||it.warn)}</b></div><div>${esc(it.text)}</div>
      ${it.bricks.length?`<div class="chips">${it.bricks.map(b=>`<span data-p="${b}">${b}</span>`).join('')}</div><button data-glow="${it.bricks.join(',')}" ${it.screen?`data-screen="${it.screen}"`:''}>Show on building</button>`:''}
      ${it.screen&&!warn?`<button data-open="${it.screen}">See the screen</button>`:''}</div>`;}).join('')).join('')}
  <p class="note" style="color:var(--dim);font-size:13px;max-width:720px;margin:8px 0 20px">This session is reconstructed from the features the repository shipped on 28 September 2026. The roles are real roles in a capex committee; the words are illustrative. In House of Rama proper this screen is the live record of the real session, and every decision card is written at the moment it is agreed.</p></div></div>`;
  discEl.querySelector('#closeDisc').onclick=closeDisc;
  discEl.querySelectorAll('.agenda button').forEach(b=>b.onclick=()=>{discEl.querySelectorAll('.agenda button').forEach(x=>x.classList.toggle('on',x===b));document.getElementById('t'+b.dataset.i).scrollIntoView({block:'start'});});
  discEl.querySelectorAll('[data-glow]').forEach(b=>b.onclick=()=>{glow=new Set(b.dataset.glow.split(','));if(k<C.length){k=C.length;p=1;}closeDisc();sel=null;
    mon.innerHTML=`<h2>Decision on the building</h2><p>${esc(b.closest('.dec').querySelector('b').textContent)}</p><p><span class="pill amber">${glow.size} bricks lit</span></p><div class="links">${[...glow].map(q=>`<span class="lnk" data-p="${q}">▪ ${q}</span>`).join('')}</div>${b.dataset.screen?`<p><button class="back" data-open2="${b.dataset.screen}">See the screen it became</button></p>`:''}<button class="back" id="back">◀ Trust report</button>`;
    wireLinks();document.getElementById('back').onclick=()=>{glow=new Set();showReport();};const o=mon.querySelector('[data-open2]');if(o)o.onclick=()=>openShow(o.dataset.open2);});
  discEl.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{closeDisc();openShow(b.dataset.open);});
  discEl.querySelectorAll('.chips span').forEach(c=>c.onclick=()=>{const n=byPath[c.dataset.p];if(!n)return;closeDisc();if(k<C.length){k=C.length;p=1;}sel=n;showBrick(n);});
  if(topicIdx)document.getElementById('t'+topicIdx).scrollIntoView({block:'start'});
  mon.innerHTML=`<h2>Before the first commit</h2><p class="big">Eight decisions, two things left open.</p><p>The committee met on the morning of 28 September; the first commit landed at 16:37 the same afternoon. Each decision card names the bricks that implemented it.</p>
  <div class="links">${SESSION.flatMap(s=>s.items.filter(i=>i.dec||i.warn)).map(i=>`<span class="lnk" style="color:${i.warn?'var(--red)':'var(--green)'};font-family:var(--sans)">${i.warn?'○':'●'} ${esc(i.dec||i.warn)}</span>`).join('')}</div>
  <p class="note">Why this screen exists: trust in agent-built software starts before the code. A team that watched the requirements being agreed, and can see which brick each requirement became, does not have to take the build on faith.</p>`;
}
function closeDisc(){discEl.hidden=true;discEl.innerHTML='';}
document.getElementById('discBtn').onclick=()=>openDisc(0);
