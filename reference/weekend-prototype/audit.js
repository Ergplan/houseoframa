// ---------- audit: drones from a second opinion fly the site, discovery to data and back ----------
// V1 is scripted from static checks run against commit fac615d on 17 Oct 2026 (tsc, build, grep for silenced lint, any-types,
// hard-coded constants, storage, env handling) plus the formula trails. The production feature runs a model from a different
// vendor than the builder; this preview was prepared by the same vendor and says so on the report.
const VERDICT={ // path -> [verdict, one-line finding]
 'components/AssetView.tsx':['fail','Spread assumes exactly three bids (byQuoted[2], line 19). A package with two or four vendors shows a wrong spread or crashes.'],
 'components/Studio.tsx':['fail','H1 total takes the third vendor by position (line 50). Same three-bid assumption, on the number that goes to the board.'],
 'lib/store.tsx':['fail','Master data, discovered prices and vendor reviews are saved only in this browser (lines 22–23). Two committee members can see two different scores.'],
 'lib/calc.ts':['warn','Benchmark tolerances +8% / −8% are hard-coded (lines 30–31); bench typed as any (line 5). Formulas are correct for this dataset; no test proves it.'],
 'lib/data.ts':['warn','Capacity exponent 0.6 and all vendor quotes are constants in code. Sample data is labelled on screen, which is right; the exponent was never put to the committee.'],
 'lib/history.ts':['warn','A vendor with zero warranty claims scores the full 30 points (line 39). Policy question, not a bug.'],
 'lib/server/config.ts':['warn','Accepts four different names for the OpenAI key, including OPENAI_API_KEY1 added at 17:01 to work around a deployment setting. Fix the setting, not the code.'],
 'components/RealTalk.tsx':['warn','Two silenced lint warnings (lines 203, 208) and three swallowed errors. Voice failures will be silent.'],
 'components/Walkthrough.tsx':['warn','One silenced lint warning on an effect dependency (line 27).'],
 'components/AiPanel.tsx':['warn','One silenced lint warning on an effect dependency (line 20).'],
 'proxy.ts':['warn','Password compared with === and no rate limit. Fine behind Vercel protection, weak as the only gate.'],
 'app/api/llm/route.ts':['warn','300-second streaming route. With no password set, anyone with the URL can run the client’s OpenAI bill for five minutes per call.'],
};
const PASS_NOTE='Compiles, builds, no console output, no TODOs, no key in the browser bundle.';
function auditScript(){
  const S=[];const say=(t,d=3.2)=>S.push({kind:'say',t,d});const phase=(t)=>S.push({kind:'phase',t,d:1.2});
  phase('Audit requested');
  say('Second-opinion audit of Procurement Studio, commit fac615d. Two drones. We will fly from the discovery session to the data and back, and say everything we see.');
  phase('Discovery');
  say('Eight decisions recorded in the site office. All eight have bricks in the building. Two items were left open: automated checks on the formulas, and who signs off an award. Both are still open.',4);
  G.layers.forEach(L=>{
    const bricks=nodes.filter(n=>n.layer===L.id).sort((a,b)=>a.x-b.x);
    phase(L.label.split(' — ')[0]+' floor');
    const clean=bricks.filter(b=>!VERDICT[b.path]);
    bricks.forEach(b=>{const v=VERDICT[b.path];S.push({kind:'scan',n:b,v:v?v[0]:'pass',note:v?v[1]:PASS_NOTE,d:v?3.6:0.45});if(v)say((v[0]==='fail'?'Defect. ':'Note. ')+b.path.split('/').pop()+'. '+v[1],v[0]==='fail'?4.2:3.4);});
    if(clean.length)say(`${clean.length} of ${bricks.length} bricks on this floor are clean by static checks. None of them has a test.`,2.4);
  });
  phase('Screens');
  say('Eight screens photographed from the built app. Every figure we traced recomputes to the value on screen: 1.50 crore, 37 percent, 92 out of 100, 3.37 crore. The arithmetic is right for this dataset.',4);
  phase('Sign-offs');
  say('Thirty-four bricks. Zero tests. Zero reviews recorded. Zero sign-offs. There is no signature anywhere in this repository, so there is none we can confirm and none we can reject. The building is unsigned.',4.4);
  phase('Verdict');
  say('Three defects, nine notes, twenty-two clean. The building stands; it needs alteration in five places before a committee should rely on it. Estimates follow.',3.6);
  S.push({kind:'report',d:1});
  return S;
}
const ALTER=[
 ['Tests for compute(), lifecycle() and trackScore() using tonight’s traced figures as golden values','agent 1–2 h','review 1 h','closes the open item from discovery'],
 ['Generalise spread and H1 to any number of bids (AssetView.tsx 19, Studio.tsx 50)','agent 15 min','review 15 min','defect'],
 ['Move the 0.6 exponent, ±8% benchmark tolerance and 25% spread threshold into Master data as named, reviewed assumptions','agent 1 h','committee 30 min','defect of process'],
 ['Shared storage for Master data and vendor reviews, with a name and date on every review (needs sign-in and a database)','agent 4–8 h','review 2 h','defect'],
 ['Decide the zero-claims warranty rule; one line of code either way','agent 10 min','committee 15 min','policy'],
 ['Single env name for the key; remove the three fallbacks','agent 10 min','—','hygiene'],
 ['Resolve the five silenced lint warnings and the swallowed voice errors','agent 1 h','review 30 min','hygiene'],
];
const TIMEMACHINE=[
 ['16:37','29 files laid in one lift, no test among them.','A ten-line test of compute() written here would have taken twenty minutes and would have caught the three-bid assumption the moment a fourth vendor was tried.'],
 ['16:51','Made Vercel-ready: password gate, deployment notes.','Right order. Security before features.'],
 ['17:01','"Accept OPENAI_API_KEY1" committed.','This was a deployment setting typed wrong. The fix went into the code instead of the setting, and stayed. Workarounds that get committed become permanent.'],
 ['17:19','Vendor history added, reviews saved in the browser.','This is the minute the sharing decision was needed: whose reviews count, where do they live, who can see them. It was not asked.'],
 ['17:41','Last commit, direct to main. No branch, no pull request, no second pair of eyes.','One named reviewer at 16:37 and the sign-off boxes on every trail would be filled tonight.'],
];
let audit=null; // {S, i, t, log:[], drones:[{x,y,tx,ty}], verdicts:{}, speak}
const auditEl=()=>mon;
function startAudit(){closeShow();closeDisc();playing=false;setPlay();if(k<C.length){k=C.length;p=1;}
  audit={S:auditScript(),i:0,t:0,log:[],drones:[{x:-40,y:120,tx:200,ty:TOP-120},{x:1000,y:140,tx:760,ty:TOP-120}],verdicts:{},speak:false,done:false};
  glow=new Set();sel=null;renderAuditLog();document.getElementById('auditBtn').classList.add('on');
}
function stopAudit(){if(audit&&audit.speak)try{speechSynthesis.cancel();}catch{} audit=null;document.getElementById('auditBtn').classList.remove('on');showReport();}
function speak(t){if(!audit||!audit.speak)return;try{const u=new SpeechSynthesisUtterance(t);u.rate=1.05;speechSynthesis.speak(u);}catch{}}
function updateAudit(dt){if(!audit||audit.done)return;audit.t+=dt*speed;const st=audit.S[audit.i];if(!st)return;
  if(audit.t===dt*speed||audit.t-dt*speed<=0){/* first frame of step */}
  if(!st.started){st.started=true;
    if(st.kind==='scan'){const d=audit.drones[nodes.indexOf(st.n)%2];d.tx=st.n.x+st.n.w/2;d.ty=st.n.y-34;audit.cur=st;}
    if(st.kind==='say'){audit.log.push({t:st.t,kind:'say'});speak(st.t);renderAuditLog();}
    if(st.kind==='phase'){audit.log.push({t:st.t,kind:'phase'});renderAuditLog();}
    if(st.kind==='report'){audit.done=true;renderAuditReport();return;}
  }
  if(st.kind==='scan'&&audit.t>st.d*0.5&&!audit.verdicts[st.n.path]){audit.verdicts[st.n.path]=st.v;if(st.v!=='pass'){audit.log.push({t:st.n.path,kind:st.v,note:st.note});renderAuditLog();}}
  if(audit.t>=st.d){audit.t=0;audit.i++;audit.cur=null;}
  audit.drones.forEach(d=>{d.x+=(d.tx-d.x)*Math.min(1,dt*2.5);d.y+=(d.ty-d.y)*Math.min(1,dt*2.5);});
}
const DRONE=['..P.....P..','..PPPPPPP..','...PVVVP...','..PPPPPPP..','..P.....P..'];
const DRONEPAL={P:'#c98cff',V:'#ece8dc'};
function drawAudit(){if(!audit)return;const now=performance.now();
  // verdict badges
  nodes.forEach(n=>{const v=audit.verdicts[n.path];if(!v||brickState(n)!=='built')return;const c=v==='pass'?'#5ad45a':v==='warn'?'#ffb429':'#ff5a6a';R(n.x+n.w-7,n.y-3,8,8,'#0c0b13');R(n.x+n.w-6,n.y-2,6,6,c);});
  // scan beam
  const st=audit.cur;if(st){const d=audit.drones[nodes.indexOf(st.n)%2];ctx.fillStyle='rgba(201,140,255,.22)';ctx.beginPath();ctx.moveTo(d.x,d.y+8);ctx.lineTo(st.n.x-4,st.n.y+st.n.h+2);ctx.lineTo(st.n.x+st.n.w+4,st.n.y+st.n.h+2);ctx.closePath();ctx.fill();
    const sy=st.n.y+((now/6)%(st.n.h+4))-2;R(st.n.x-4,sy,st.n.w+8,2,'rgba(236,232,220,.8)');}
  // drones
  audit.drones.forEach((d,i)=>{const f=Math.floor(now/60)%2;sprite(DRONE,DRONEPAL,d.x-11,d.y-5,2);if(f){R(d.x-11,d.y-5,6,2,'#fff');R(d.x+5,d.y-5,6,2,'#fff');}R(d.x-1,d.y+5,2,2,'#5ad45a');
    R(d.x-34,d.y-22,68,12,'#1a1200');text('AUDIT '+(i+1),d.x,d.y-19,6,'#c98cff','center');});
  R(0,0,960,22,'rgba(12,11,19,.6)');text('AUDIT IN PROGRESS · SECOND OPINION · COMMIT FAC615D',10,7,7,'#c98cff');
}
function renderAuditLog(){if(!audit)return;const m=auditEl();
  m.innerHTML=`<h2>Audit · live</h2><p class="big">Drones are flying the site.</p>
  <p><label style="display:flex;align-items:center;gap:8px;font-size:14px"><input type="checkbox" id="speakBox" ${audit.speak?'checked':''}> Read the narration aloud</label></p>
  <div class="alog" id="alog">${audit.log.map(l=>l.kind==='phase'?`<div class="aph">${esc(l.t)}</div>`:l.kind==='say'?`<div class="asay">${esc(l.t)}</div>`:`<div class="afind ${l.kind}"><span class="pill ${l.kind==='fail'?'red':'amber'}">${l.kind==='fail'?'Defect':'Note'}</span> <span class="lnk" data-p="${l.t}" style="display:inline">${l.t}</span><div class="en">${esc(l.note)}</div></div>`).join('')}</div>
  <p class="note">V1 audit: scripted from static checks run on 17 Oct 2026 by the same vendor that built the site, so this preview is a second pass, not a second opinion. The production feature runs a model from a different vendor against the live repository.</p>
  <button class="back" id="stopAudit">■ Stop audit</button>`;
  wireLinks();m.querySelector('#stopAudit').onclick=stopAudit;const sb=m.querySelector('#speakBox');sb.onchange=()=>{audit.speak=sb.checked;if(!sb.checked)try{speechSynthesis.cancel();}catch{}};
  const lg=m.querySelector('#alog');if(lg)lg.scrollTop=lg.scrollHeight;
}
function renderAuditReport(){const m=auditEl();const vs=Object.values(audit.verdicts);const nf=vs.filter(v=>v==='fail').length,nw=vs.filter(v=>v==='warn').length,np=vs.filter(v=>v==='pass').length;
  const totalAgent='8–13 h';const totalReview='~5 h + two committee decisions';
  m.innerHTML=`<h2>Audit report · commit fac615d</h2><p class="big">Building stands. Unsigned. Alteration needed in five places.</p>
  <div class="stat"><div><b style="color:var(--red)">${nf}</b><small>defects</small></div><div><b>${nw}</b><small>notes</small></div><div><b style="color:var(--green)">${np}</b><small>clean bricks</small></div><div><b style="color:var(--red)">0 / 34</b><small>sign-offs on file</small></div></div>
  <h2 style="margin-top:16px">Sign-offs</h2><p>None exist, so none can be confirmed or rejected. Every trail on every screen shows "Unsigned". Discovery recorded eight decisions; all eight are built; the two open items are still open.</p>
  <h2 style="margin-top:16px">Alterations &amp; estimates</h2><div class="links">${ALTER.map(a=>`<div class="dep"><div style="font-family:var(--sans);font-size:14px;color:var(--fg)">${esc(a[0])}</div><div class="en">${esc(a[1])} · ${esc(a[2])} · ${esc(a[3])}</div></div>`).join('')}</div>
  <p><span class="pill amber">Agent time ${totalAgent}</span><span class="pill cyan">Human time ${totalReview}</span><span class="pill green">Fits one sprint</span></p>
  <h2 style="margin-top:16px">Time machine · what could have gone better</h2><div class="links">${TIMEMACHINE.map(t=>`<div class="dep"><div style="font-size:14px"><span style="font-family:var(--mono);color:var(--amber)">${t[0]}</span> &nbsp;${esc(t[1])}</div><div class="en">${esc(t[2])}</div></div>`).join('')}</div>
  <h2 style="margin-top:16px">Who did what</h2><p>Six commits, two builders, one afternoon, no pull request. Every brick carries the lift that laid it and the hand that reworked it; nothing here can be attributed to "the agent" without a timestamp and a name beside it.</p>
  <p class="note">Independence: this preview audit was prepared by Claude, the same vendor as the builder of record, from static checks and the formula trails. Treat it as a rehearsal of the format. The production audit runs a model from a different vendor, re-runs the checks against the live repository, and signs its own report.</p>
  <p><button class="primary" id="auditGlow">Light the defects</button> <button class="back" id="stopAudit">◀ Trust report</button></p>`;
  m.querySelector('#stopAudit').onclick=stopAudit;m.querySelector('#auditGlow').onclick=()=>{glow=new Set(Object.entries(audit.verdicts).filter(([,v])=>v==='fail').map(([p])=>p));};
}
document.getElementById('auditBtn').onclick=()=>{if(audit)stopAudit();else startAudit();};
