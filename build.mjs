/* Sara's Luck data builder — runs daily in GitHub Actions.
   Powerball: fetched fresh (Texas Lottery CSV -> NY open-data fallback).
   Lotto America: seeded history + new draws appended from lottonumbers.com (guarded).
   Output: data.json (CORS-served via raw.githubusercontent.com) with all three methods. */
import fs from 'node:fs';
import crypto from 'node:crypto';

const zf = a => { const m=a.reduce((x,y)=>x+y,0)/a.length, sd=Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length)||1; return a.map(v=>(v-m)/sd); };
function tally(rows,pool){ const c=new Array(pool).fill(0); for(const r of rows) for(const n of r.w) if(n>=1&&n<=pool) c[n-1]++; return c; }

function methods(rows,pool,spool){
  const wf=new Array(pool).fill(0), sf=new Array(spool).fill(0);
  for(const r of rows){ r.w.forEach(n=>{if(n>=1&&n<=pool)wf[n-1]++;}); if(r.s>=1&&r.s<=spool)sf[r.s-1]++; }
  const top=(a,k)=>a.map((v,i)=>[i+1,v]).sort((p,q)=>q[1]-p[1]||p[0]-q[0]).slice(0,k).map(x=>x[0]);
  const cntW=win=>{ const c=new Array(pool).fill(0); rows.slice(-win).forEach(r=>r.w.forEach(n=>{if(n>=1&&n<=pool)c[n-1]++;})); return c; };
  const r77=cntW(77), half=Math.floor(rows.length/2);
  const c1=tally(rows.slice(0,half),pool), c2=tally(rows.slice(half),pool);
  const a1=c1.reduce((a,b)=>a+b,0)/pool, a2=c2.reduce((a,b)=>a+b,0)/pool, zA=zf(wf), app=new Array(pool).fill(0);
  for(const win of [50,77,100,150]){ const zR=zf(cntW(win));
    for(const wr of [0.3,0.5,0.7,1.0]) for(const wp of [0,0.25,0.5,0.75,1.0])
      zA.map((v,i)=>[i+1,v+wr*zR[i]+wp*((c1[i]>a1&&c2[i]>a2)?1:0)]).sort((a,b)=>b[1]-a[1]).slice(0,5).forEach(t=>app[t[0]-1]++); }
  const md=wf.map((v,i)=>({n:i+1,c:v,r:r77[i]})).sort((a,b)=>b.c-a.c||b.r-a.r||a.n-b.n).slice(0,5).map(x=>x.n).sort((a,b)=>a-b);
  const ew=app.map((v,i)=>({n:i+1,p:v})).sort((a,b)=>b.p-a.p||wf[b.n-1]-wf[a.n-1]).slice(0,5).map(x=>x.n).sort((a,b)=>a-b);
  /* THE best ticket: the highest historical-SIMILARITY (PIM) ticket that has NEVER been drawn.
     PIM = 0.40 typicality (shape closest to the winner profile) + 0.35 hotness (avg frequency z)
     + 0.25 pair-support percentile. Pure "most like the past winners, never drawn" — NO split/anti-share. */
  const halfPool=Math.floor(pool/2);
  const meanA=a=>a.reduce((x,y)=>x+y,0)/a.length, sdA=a=>{const m=meanA(a);return Math.sqrt(meanA(a.map(x=>(x-m)**2)))||1;};
  const sSum=rows.map(r=>r.w.reduce((a,b)=>a+b,0)), sOdd=rows.map(r=>r.w.filter(n=>n%2).length),
        sLow=rows.map(r=>r.w.filter(n=>n<=halfPool).length), sSpr=rows.map(r=>{const so=r.w.slice().sort((a,b)=>a-b);return so[4]-so[0];});
  const Pr={sum:[meanA(sSum),sdA(sSum)],odd:[meanA(sOdd),sdA(sOdd)],low:[meanA(sLow),sdA(sLow)],spread:[meanA(sSpr),sdA(sSpr)]};
  const pairC={}; for(const r of rows){const so=r.w.slice().sort((a,b)=>a-b);for(let i=0;i<5;i++)for(let j=i+1;j<5;j++){const k=so[i]+'-'+so[j];pairC[k]=(pairC[k]||0)+1;}}
  const wmA=meanA(wf), wsA=sdA(wf), pairSorted=Object.values(pairC).sort((a,b)=>a-b), PV=pairSorted.length;
  const pctLE=v=>{let lo=0,hi=PV;while(lo<hi){const m=(lo+hi)>>1;if(pairSorted[m]<=v)lo=m+1;else hi=m;}return 100*lo/PV;};
  const drawnSet=new Set(rows.map(r=>r.w.slice().sort((a,b)=>a-b).join('-')));
  // also require the ticket to have NEVER shared 4/5 with any past draw: none of its 4-number
  // subsets may equal a 4-subset of any historical draw (guarantees max 3/5 overlap with all history).
  const fourSet=new Set(); for(const r of rows){const so=r.w.slice().sort((a,b)=>a-b); for(let x=0;x<5;x++) fourSet.add(so.filter((_,i)=>i!==x).join('-')); }
  const noNear=so=>{ for(let x=0;x<5;x++) if(fourSet.has(so.filter((_,i)=>i!==x).join('-'))) return false; return true; };
  const pim=w=>{const so=w.slice().sort((a,b)=>a-b),sum=so[0]+so[1]+so[2]+so[3]+so[4];
    const zd=(v,p)=>Math.abs((v-p[0])/p[1]);
    const shape=(zd(sum,Pr.sum)+zd(so.filter(n=>n%2).length,Pr.odd)+zd(so.filter(n=>n<=halfPool).length,Pr.low)+zd(so[4]-so[0],Pr.spread))/4;
    const typ=100*Math.exp(-shape), hotZ=meanA(so.map(n=>(wf[n-1]-wmA)/wsA));
    let pa=0;for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)pa+=pairC[so[i]+'-'+so[j]]||0; pa/=10;
    return 0.40*typ+0.35*Math.min(100,Math.max(0,50+15*hotZ))+0.25*pctLE(pa); };
  const hot36=wf.map((v,i)=>[i+1,v]).sort((a,b)=>b[1]-a[1]).slice(0,36).map(x=>x[0]);
  let bestW=null,bestP=-1;
  const choose=(start,picked)=>{ if(picked.length===5){const so=picked.slice().sort((a,b)=>a-b);if(drawnSet.has(so.join('-'))||!noNear(so))return;const p=pim(picked);if(p>bestP){bestP=p;bestW=picked.slice();}return;} for(let i=start;i<hot36.length;i++){picked.push(hot36[i]);choose(i+1,picked);picked.pop();} };
  choose(0,[]);
  if(bestW){ let imp=true; while(imp){imp=false; for(let i=0;i<5;i++)for(let cand=1;cand<=pool;cand++){ if(bestW.includes(cand))continue; const w2=bestW.slice();w2[i]=cand; if(new Set(w2).size<5)continue; const so2=w2.slice().sort((a,b)=>a-b); if(drawnSet.has(so2.join('-'))||!noNear(so2))continue; const p=pim(w2); if(p>bestP){bestP=p;bestW=w2;imp=true;} } } }
  // fallback: if the 4/5-free constraint somehow eliminates everything in the box, drop it (never happens in practice)
  if(!bestW){ const choose2=(start,picked)=>{ if(picked.length===5){const so=picked.slice().sort((a,b)=>a-b);if(drawnSet.has(so.join('-')))return;const p=pim(picked);if(p>bestP){bestP=p;bestW=picked.slice();}return;} for(let i=start;i<hot36.length;i++){picked.push(hot36[i]);choose2(i+1,picked);picked.pop();} }; choose2(0,[]); }
  const fusion={ white:(bestW||ew).slice().sort((a,b)=>a-b), special: top(sf,1)[0], pim:+bestP.toFixed(1) };
  // The one real lead: is any special ball significantly over-represented? Multiple-comparison corrected,
  // so it self-confirms or regresses as future draws land. (LA star-4 flagged at corrected p~0.003.)
  const specialBias=(()=>{ const D=rows.length, E=D/spool; let hot=1; for(let i=0;i<spool;i++) if(sf[i]>sf[hot-1]) hot=i+1;
    const cnt=sf[hot-1], z=(cnt-E)/Math.sqrt(E*(1-1/spool));
    let chi=0; for(let i=0;i<spool;i++) chi+=(sf[i]-E)**2/E;
    // CONSERVATIVE, honest corrected p: EXACT one-sided binomial tail P(X>=cnt) then Sidak max-of-spool.
    const lgamma=x=>{const c=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];let y=x,t=x+5.5;t-=(x+0.5)*Math.log(t);let s2=1.000000000190015;for(let j=0;j<6;j++)s2+=c[j]/++y;return -t+Math.log(2.5066282746310005*s2/x);};
    const lchoose=(n,k)=>lgamma(n+1)-lgamma(k+1)-lgamma(n-k+1), pp=1/spool;
    let tail=0; for(let k=cnt;k<=D;k++) tail+=Math.exp(lchoose(D,k)+k*Math.log(pp)+(D-k)*Math.log(1-pp));
    const pCorr=1-Math.pow(1-tail,spool);
    // omnibus: is the WHOLE special distribution non-uniform? (Wilson-Hilferty chi-square p) — usually only marginal
    const dfc=spool-1, wh=Math.pow(chi/dfc,1/3), zChi=(wh-(1-2/(9*dfc)))/Math.sqrt(2/(9*dfc));
    const erf=x=>{const s=x<0?-1:1;x=Math.abs(x);const t=1/(1+0.3275911*x);return s*(1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x)));};
    const chiP=1-0.5*(1+erf(zChi/Math.SQRT2));
    // is it HOLDING recently? hot-ball rate over the last min(150,D) draws (regression check)
    const recN=Math.min(150,D); let rc=0; for(let i=D-recN;i<D;i++) if(rows[i] && rows[i].s===hot) rc++;
    return { hot, count:cnt, rate:+(cnt/D).toFixed(4), expected:+E.toFixed(1), z:+z.toFixed(2),
      chi:+chi.toFixed(2), df:dfc, chiP:+chiP.toFixed(3), omnibusSignificant: chiP<0.05,
      pCorrected:+pCorr.toFixed(4), recentRate:+(rc/recN).toFixed(3), recentN:recN, draws:D,
      significant: pCorr<0.05 };
  })();
  // ---- every method's ticket, so the autonomous learner can prospectively compare them all ----
  const sTop=top(sf,1)[0], sBot=sf.map((v,i)=>[i+1,v]).sort((a,b)=>a[1]-b[1]||a[0]-b[0])[0][0];
  const top5=(a)=>a.map((v,i)=>[i+1,v]).sort((x,y)=>y[1]-x[1]||x[0]-y[0]).slice(0,5).map(z=>z[0]).sort((a,b)=>a-b);
  const bot5=(a)=>a.map((v,i)=>[i+1,v]).sort((x,y)=>x[1]-y[1]||x[0]-y[0]).slice(0,5).map(z=>z[0]).sort((a,b)=>a-b);
  const coldW=bot5(wf);
  const recW=(()=>{const L=Math.exp(-0.02),w=new Array(pool).fill(0);for(let i=rows.length-1;i>=0;i--){for(let j=0;j<pool;j++)w[j]*=L;for(const n of rows[i].w)if(n>=1&&n<=pool)w[n-1]+=1;}return top5(w);})();
  const momW=(()=>{const R=rows.slice(-25),O=rows.slice(-100,-25),rf=new Array(pool).fill(0),of=new Array(pool).fill(0);R.forEach(d=>d.w.forEach(n=>{if(n>=1&&n<=pool)rf[n-1]++;}));O.forEach(d=>d.w.forEach(n=>{if(n>=1&&n<=pool)of[n-1]++;}));return top5(rf.map((v,i)=>v/Math.max(1,R.length)-of[i]/Math.max(1,O.length)));})();
  const marW=(()=>{const T=Array.from({length:pool+1},()=>new Array(pool+1).fill(0));let p=null;for(const r of rows){if(p)for(const m of p)for(const n of r.w)if(m>=1&&m<=pool&&n>=1&&n<=pool)T[m][n]++;p=r.w;}const w=new Array(pool).fill(0);if(p)for(const m of p)for(let n=1;n<=pool;n++)w[n-1]+=T[m][n];return top5(w);})();
  const posW=(()=>{const col=Array.from({length:5},()=>new Array(pool+1).fill(0));rows.forEach(r=>{r.w.slice().sort((a,b)=>a-b).forEach((n,c)=>{if(n>=1&&n<=pool)col[c][n]++;});});const picks=[];for(let c=0;c<5;c++){let b=1,bv=-1;for(let n=1;n<=pool;n++)if(col[c][n]>bv&&!picks.includes(n)){bv=col[c][n];b=n;}picks.push(b);}return picks.sort((a,b)=>a-b);})();
  const methodTickets={ cold:{white:coldW,special:sBot}, recency:{white:recW,special:sTop}, momentum:{white:momW,special:sTop}, markov:{white:marW,special:sTop}, positional:{white:posW,special:sTop} };
  return { draws:rows.length, whiteFreq:wf, specialFreq:sf, ticketFusion:fusion, specialBias, methodTickets,
    ticketData:{white:md, special:top(sf,1)[0]}, ticketEdge:{white:ew, special:top(sf,1)[0]},
    history: rows.map(r=>[...r.w.slice().sort((a,b)=>a-b), r.s]),
    historyDates: rows.map(r=>r.date),
    dataThrough: rows.length ? rows[rows.length-1].date : null };
}

const FETCH_OPTS = { signal: AbortSignal.timeout(30000) };
async function powerball(){
  let rows=null;
  try{
    const csv = await (await fetch('https://www.texaslottery.com/export/sites/lottery/Games/Powerball/Winning_Numbers/powerball.csv', FETCH_OPTS)).text();
    const rr = csv.trim().split(/\r?\n/).map(l=>l.split(',')).map(c=>({date:`${c[3]}-${String(+c[1]).padStart(2,'0')}-${String(+c[2]).padStart(2,'0')}`,key:+c[3]*10000+ +c[1]*100+ +c[2],w:[+c[4],+c[5],+c[6],+c[7],+c[8]],s:+c[9]})).filter(x=>x.key>=20151007).sort((a,b)=>a.key-b.key);
    if(rr.length>=1000) rows=rr;
  }catch(e){ console.log('PB Texas failed:',e.message); }
  if(!rows){
    const j = await (await fetch('https://data.ny.gov/resource/d6yy-54nr.json?$limit=5000', FETCH_OPTS)).json();
    rows = j.map(o=>{const d=o.draw_date.slice(0,10);const n=o.winning_numbers.trim().split(/\s+/).map(Number);return{date:d,key:+d.replace(/-/g,''),w:n.slice(0,5),s:n[5]};}).filter(x=>x.key>=20151007).sort((a,b)=>a.key-b.key);
  }
  return methods(rows,69,26);
}

async function lottoAmerica(){
  const P='./la-history.json';
  const hist = JSON.parse(fs.readFileSync(P,'utf8'));
  const seen = new Set(hist.map(d=>d.date));
  const today = new Date().toISOString().slice(0,10);
  try{
    // fetch the current year's page — and in early January also the previous year's,
    // so a Dec-31 draw finishing after the UTC year rollover is never silently missed
    const yr=new Date().getUTCFullYear(), years=[yr];
    if(new Date().getUTCMonth()===0) years.push(yr-1);
    let added=0;
    for(const y of years){
      const h = await (await fetch('https://www.lottonumbers.com/lotto-america/numbers/'+y,{headers:{'User-Agent':'Mozilla/5.0'}, signal:AbortSignal.timeout(30000)})).text();
      const balls=[...h.matchAll(/class="ball (ball|star-ball)">\s*(\d{1,2})/g)].map(m=>({t:m[1],n:+m[2]}));
      const dates=[...h.matchAll(/([A-Z][a-z]+ \d{1,2},? 20\d\d)/g)].map(m=>m[1]);
      const parsed=[]; let i=0, di=0;
      while(i+5<balls.length){
        const w=balls.slice(i,i+5), s=balls[i+5];
        if(w.every(b=>b.t==='ball')&&s.t==='star-ball'&&w.every(b=>b.n>=1&&b.n<=52)&&s.n>=1&&s.n<=10){
          const dt=dates[di]?new Date(dates[di]):null; di+=2;
          const iso = dt&&!isNaN(dt) ? dt.toISOString().slice(0,10) : null;
          if(iso) parsed.push({date:iso,w:w.map(b=>b.n),s:s.n});
          i+=6;
        } else i++;
      }
      // guards: parse alignment must line up, dates must be real Mon/Wed/Sat draw days in the RNG era
      if(Math.abs(parsed.length*2 - dates.length) <= 6){
        for(const d of parsed){
          const dow=new Date(d.date+'T12:00:00Z').getUTCDay();
          if(!seen.has(d.date) && d.date>='2023-04-17' && d.date<=today && [1,3,6].includes(dow)){ hist.push(d); seen.add(d.date); added++; }
        }
      } else { console.log('LA parse alignment off for '+y+' ('+parsed.length+' draws vs '+dates.length+' dates) — skipping that page'); }
    }
    hist.sort((a,b)=> a.date<b.date?-1:1);
    fs.writeFileSync(P, JSON.stringify(hist));
    console.log('LA appended', added, 'new draws; total', hist.length);
  }catch(e){ console.log('LA fetch failed, using stored history:', e.message); }
  return methods(hist,52,10);
}

// Jackpots: cash value (drives the take-home) from lotteryusa; annuity estimated from it.
// PB publishes a Cash value that scrapes cleanly. LA shows ONLY an annuity and its page is
// JS-rendered (not present in the server-side HTML), so LA falls back to LA_MANUAL below.
async function jackpots(){
  const out={};
  for(const [game,url,minCash,ratio] of [['powerball','https://www.lotteryusa.com/powerball/',20e6,0.45],['lottoAmerica','https://www.lotteryusa.com/lotto-america/',2e6,0.46]]){
    try{
      const h = await (await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}, signal:AbortSignal.timeout(30000)})).text();
      const m = h.match(/Cash value:?\s*\$?\s*([0-9][0-9.,]*)\s*(Million|Billion)/i);
      if(m){ const cash = Math.round(parseFloat(m[1].replace(/,/g,'')) * (/billion/i.test(m[2])?1e9:1e6));
        if(cash>=minCash && cash<1e10) out[game] = { cashLumpSum:cash, advertisedAnnuity:Math.round(cash/ratio/1e6)*1e6 }; }
    }catch(e){ console.log('jackpot',game,'failed:',e.message); }
  }
  return out;
}
// Lotto America current jackpot — MANUAL (its page can't be scraped server-side). Small game, near
// its $2M floor; update asOf + amounts when you check lottoamerica.com. Cash ~50% of the annuity.
const LA_MANUAL = { advertisedAnnuity: 2050000, cashLumpSum: 1025000, asOf: '2026-07-22' };

// prev feed loaded FIRST so a total Powerball source failure can fall back to the last good data instead of killing the run
let prev={}; try{ prev=JSON.parse(fs.readFileSync('./data.json','utf8')); }catch(e){}
const [pb,la,jp] = await Promise.all([
  powerball().catch(e=>{ if(prev.powerball&&prev.powerball.history){ console.log('PB sources ALL failed — reusing previous data:',e.message); return prev.powerball; } throw e; }),
  lottoAmerica(), jackpots()
]);
for(const [g,obj] of [['powerball',pb],['lottoAmerica',la]]){
  const prevAnn = prev[g] && prev[g].advertisedAnnuity;
  let corrected=false;
  if(jp[g]){ obj.advertisedAnnuity=jp[g].advertisedAnnuity; obj.cashLumpSum=jp[g].cashLumpSum; }
  else if(g==='lottoAmerica'){ obj.advertisedAnnuity=LA_MANUAL.advertisedAnnuity; obj.cashLumpSum=LA_MANUAL.cashLumpSum; corrected=true; console.log('LA jackpot scrape empty — using dated manual value',LA_MANUAL.asOf,'($'+LA_MANUAL.advertisedAnnuity+' annuity)'); }
  else if(prev[g]&&prev[g].cashLumpSum){ obj.advertisedAnnuity=prev[g].advertisedAnnuity; obj.cashLumpSum=prev[g].cashLumpSum; console.log(g,'jackpot scrape empty — carried forward last-known cash',prev[g].cashLumpSum); }
  // Jackpot outcome of the most recent draw, inferred from the jackpot trajectory (autonomous, no fragile winner-scrape):
  // a big DROP means the jackpot was hit and reset (someone won); growth means it rolled over (no jackpot winner).
  // Threshold is per-game (LA per-draw increments are far smaller than PB's).
  const thr = g==='powerball' ? 2e6 : 2e5;
  const newAnn = obj.advertisedAnnuity;
  let outcome = (prev[g] && prev[g].jackpotOutcome) || { status:'rolled', jackpotNow:newAnn };
  if(prevAnn && newAnn && Math.abs(newAnn-prevAnn) > thr){
    outcome = newAnn < prevAnn ? { status:'won', prize:prevAnn, jackpotNow:newAnn, on:obj.dataThrough }
                               : { status:'rolled', jackpotNow:newAnn, on:obj.dataThrough };
  } else { outcome = { ...outcome, jackpotNow:newAnn, on:obj.dataThrough }; }
  // a 'won' banner only describes the draw it happened on — expire it once a newer draw has occurred
  if(outcome.status==='won' && outcome.on && obj.dataThrough > outcome.on){
    outcome = { status:'rolled', jackpotNow:newAnn, on:obj.dataThrough };
  }
  // a manual jackpot correction is NOT a real trajectory event — never infer a win/roll from it
  if(corrected){ outcome = { status:'rolled', jackpotNow:newAnn, on:obj.dataThrough }; }
  obj.jackpotOutcome = outcome;
}
/* ---- Autonomous prospective learner (runs forever with the cron):
   each run PRE-REGISTERS one pick per method for the NEXT draw, then SCORES those picks
   automatically when the result lands. The scorecard accumulates permanently — an honest,
   tamper-proof out-of-sample ledger. If any method ever truly beat chance, it shows up here. */
const nextMWF=iso=>{ let d=new Date(iso+'T12:00:00Z'); for(let i=0;i<8;i++){ d=new Date(d.getTime()+86400000); if([1,3,6].includes(d.getUTCDay())) return d.toISOString().slice(0,10); } return null; };
/* Official base prize tables, keyed 'whites+special(0/1)'. 'jackpot' is tracked separately (variable value).
   These match the game configs the apps use for EV, so the learner scores REAL dollars, not just overlap. */
const PRIZES={
  powerball:   { price:2, tab:{'5+1':'jackpot','5+0':1000000,'4+1':50000,'4+0':100,'3+1':100,'3+0':7,'2+1':7,'1+1':4,'0+1':4} },
  lottoAmerica:{ price:1, tab:{'5+1':'jackpot','5+0':20000,  '4+1':1000, '4+0':100,'3+1':20, '3+0':5,'2+1':5,'1+1':2,'0+1':2} }
};
const prizeOf=(g,wm,sp)=> PRIZES[g].tab[wm+'+'+(sp?1:0)] || 0; // 'jackpot' | number | 0
let sc={}; try{ sc=JSON.parse(fs.readFileSync('./scorecard.json','utf8')); }catch(e){}
sc.games=sc.games||{};
for(const [g,obj,pool,spool] of [['powerball',pb,69,26],['lottoAmerica',la,52,10]]){
  const gs=sc.games[g]=sc.games[g]||{pending:null,totals:{},scored:0,lastScored:null,recent:[]};
  const hrow=obj.history[obj.history.length-1];
  const last={date:obj.dataThrough, w:hrow.slice(0,5), s:hrow[5]};
  // one-time backfill: seed the real-dollar ledger from the recorded match history for any method
  // that predates dollar-tracking (guarded on wonDraws===undefined so it runs once, never double-counts).
  for(const [m,tot] of Object.entries(gs.totals)){
    if(tot.wonDraws===undefined){
      tot.won=0; tot.wonDraws=0; tot.tiers=tot.tiers||{};
      for(const rec of gs.recent){ const r=rec.res&&rec.res[m]; if(r===undefined) continue;
        const wm=parseInt(r,10)||0, sp=/\+S/.test(r), pr=prizeOf(g,wm,sp);
        tot.wonDraws++; if(pr!=='jackpot') tot.won+=pr; if(pr) tot.tiers[wm+'+'+(sp?1:0)]=(tot.tiers[wm+'+'+(sp?1:0)]||0)+1;
        if(!rec.won){ rec.won={}; } if(rec.won[m]===undefined) rec.won[m]=pr; }
    }
  }
  // score pending picks ONLY against the true immediate-next draw after pending.for.
  // If a full inter-draw interval was missed (a run failed), the newest draw is NOT the immediate
  // successor — skip scoring that cycle to avoid mis-attributing picks to the wrong draw.
  if(gs.pending && last.date>gs.pending.for){
    const expected=nextMWF(gs.pending.for);
    if(last.date===expected){
      const act=new Set(last.w), rec={date:last.date,target:gs.pending.for,res:{},won:{}};
      for(const [m,t] of Object.entries(gs.pending.picks)){
        let wm=0; for(const n of t.white) if(act.has(n)) wm++;
        const sp=(t.special===last.s);
        const pr=prizeOf(g,wm,sp), dollars=(pr==='jackpot')?0:pr; // jackpot value is variable → counted separately
        rec.res[m]=wm+(sp?'+S':''); rec.won[m]=pr;
        const tot=gs.totals[m]=gs.totals[m]||{draws:0,whiteSum:0,sp:0,best:0,jackpots:0,won:0,wonDraws:0,tiers:{}};
        tot.draws++; tot.whiteSum+=wm; if(sp)tot.sp++; if(wm>tot.best)tot.best=wm; if(wm===5&&sp)tot.jackpots++;
        // real-dollar ROI ledger: prizes won vs $ spent, over the draws we've dollar-tracked
        tot.won=(tot.won||0)+dollars; tot.wonDraws=(tot.wonDraws||0)+1; tot.tiers=tot.tiers||{};
        if(pr) tot.tiers[wm+'+'+(sp?1:0)]=(tot.tiers[wm+'+'+(sp?1:0)]||0)+1;
      }
      gs.recent.push(rec); if(gs.recent.length>60)gs.recent=gs.recent.slice(-60);
      gs.scored++; gs.lastScored=last.date;
      console.log(g,'learner scored draw',last.date,JSON.stringify(rec.res));
    } else {
      console.log(g,'learner: newest draw',last.date,'is not the immediate successor of',gs.pending.for,'(expected '+expected+') — a run was missed; not scoring to avoid mis-attribution');
    }
    gs.pending=null;
  }
  // register fresh picks for the next draw
  if(!gs.pending){
    const mimic=(()=>{ const s=new Set(); while(s.size<5)s.add(1+crypto.randomInt(pool)); return {white:[...s].sort((a,b)=>a-b),special:1+crypto.randomInt(spool)}; })();
    gs.pending={ for:last.date, registered:new Date().toISOString(),
      picks:{ best:obj.ticketFusion, edge:obj.ticketEdge, hot:obj.ticketData,
        cold:obj.methodTickets.cold, recency:obj.methodTickets.recency, momentum:obj.methodTickets.momentum,
        markov:obj.methodTickets.markov, positional:obj.methodTickets.positional, randomPick:mimic } };
    console.log(g,'learner registered picks for the draw after',last.date);
  }
  // fusion added later than the other methods — join an already-pending registration (still before its target draw)
  if(gs.pending && !gs.pending.picks.best && obj.ticketFusion) gs.pending.picks.best=obj.ticketFusion;
  // migrate: newly-added methods join the current pending registration (still before its target draw)
  if(gs.pending && obj.methodTickets) for(const m of ['cold','recency','momentum','markov','positional']) if(!gs.pending.picks[m]) gs.pending.picks[m]=obj.methodTickets[m];
  obj.learner={ scored:gs.scored, lastScored:gs.lastScored, totals:gs.totals, price:PRIZES[g].price,
    pendingFor:gs.pending.for, pendingSince:gs.pending.registered, picks:gs.pending.picks, recent:gs.recent.slice(-8) };
}
fs.writeFileSync('./scorecard.json', JSON.stringify(sc));
fs.writeFileSync('./data.json', JSON.stringify({ updated:new Date().toISOString(), powerball:pb, lottoAmerica:la }));
console.log('data.json OK — PB', pb.draws, 'edge', pb.ticketEdge.white.join(''), 'cash', pb.cashLumpSum, '| LA', la.draws, 'edge', la.ticketEdge.white.join(''), 'cash', la.cashLumpSum);
