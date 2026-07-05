/* Sara's Luck data builder — runs daily in GitHub Actions.
   Powerball: fetched fresh (Texas Lottery CSV -> NY open-data fallback).
   Lotto America: seeded history + new draws appended from lottonumbers.com (guarded).
   Output: data.json (CORS-served via raw.githubusercontent.com) with all three methods. */
import fs from 'node:fs';

const zf = a => { const m=a.reduce((x,y)=>x+y,0)/a.length, sd=Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length)||1; return a.map(v=>(v-m)/sd); };
function tally(rows,pool){ const c=new Array(pool).fill(0); for(const r of rows) for(const n of r.w) if(n>=1&&n<=pool) c[n-1]++; return c; }

function methods(rows,pool,spool){
  const wf=new Array(pool).fill(0), sf=new Array(spool).fill(0);
  for(const r of rows){ r.w.forEach(n=>{if(n>=1&&n<=pool)wf[n-1]++;}); if(r.s>=1&&r.s<=spool)sf[r.s-1]++; }
  const top=(a,k)=>a.map((v,i)=>[i+1,v]).sort((p,q)=>q[1]-p[1]).slice(0,k).map(x=>x[0]);
  const cntW=win=>{ const c=new Array(pool).fill(0); rows.slice(-win).forEach(r=>r.w.forEach(n=>{if(n>=1&&n<=pool)c[n-1]++;})); return c; };
  const r77=cntW(77), half=Math.floor(rows.length/2);
  const c1=tally(rows.slice(0,half),pool), c2=tally(rows.slice(half),pool);
  const a1=c1.reduce((a,b)=>a+b,0)/pool, a2=c2.reduce((a,b)=>a+b,0)/pool, zA=zf(wf), app=new Array(pool).fill(0);
  for(const win of [50,77,100,150]){ const zR=zf(cntW(win));
    for(const wr of [0.3,0.5,0.7,1.0]) for(const wp of [0,0.25,0.5,0.75,1.0])
      zA.map((v,i)=>[i+1,v+wr*zR[i]+wp*((c1[i]>a1&&c2[i]>a2)?1:0)]).sort((a,b)=>b[1]-a[1]).slice(0,5).forEach(t=>app[t[0]-1]++); }
  const md=wf.map((v,i)=>({n:i+1,c:v,r:r77[i]})).sort((a,b)=>b.c-a.c||b.r-a.r||a.n-b.n).slice(0,5).map(x=>x.n).sort((a,b)=>a-b);
  const ew=app.map((v,i)=>({n:i+1,p:v})).sort((a,b)=>b.p-a.p||wf[b.n-1]-wf[a.n-1]).slice(0,5).map(x=>x.n).sort((a,b)=>a-b);
  return { draws:rows.length, whiteFreq:wf, specialFreq:sf,
    ticketData:{white:md, special:top(sf,1)[0]}, ticketEdge:{white:ew, special:top(sf,1)[0]},
    history: rows.map(r=>[...r.w.slice().sort((a,b)=>a-b), r.s]),
    dataThrough: rows.length ? rows[rows.length-1].date : null };
}

async function powerball(){
  let rows=null;
  try{
    const csv = await (await fetch('https://www.texaslottery.com/export/sites/lottery/Games/Powerball/Winning_Numbers/powerball.csv')).text();
    const rr = csv.trim().split(/\r?\n/).map(l=>l.split(',')).map(c=>({date:`${c[3]}-${String(+c[1]).padStart(2,'0')}-${String(+c[2]).padStart(2,'0')}`,key:+c[3]*10000+ +c[1]*100+ +c[2],w:[+c[4],+c[5],+c[6],+c[7],+c[8]],s:+c[9]})).filter(x=>x.key>=20151007).sort((a,b)=>a.key-b.key);
    if(rr.length>=1000) rows=rr;
  }catch(e){ console.log('PB Texas failed:',e.message); }
  if(!rows){
    const j = await (await fetch('https://data.ny.gov/resource/d6yy-54nr.json?$limit=5000')).json();
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
    const h = await (await fetch('https://www.lottonumbers.com/lotto-america/numbers/'+new Date().getUTCFullYear(),{headers:{'User-Agent':'Mozilla/5.0'}})).text();
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
    // guard: trust the parse only if ball/date counts line up, then append valid new RNG-era draws
    if(Math.abs(parsed.length*2 - dates.length) <= 6){
      let added=0;
      for(const d of parsed){ if(!seen.has(d.date) && d.date>='2023-04-17' && d.date<=today){ hist.push(d); seen.add(d.date); added++; } }
      hist.sort((a,b)=> a.date<b.date?-1:1);
      fs.writeFileSync(P, JSON.stringify(hist));
      console.log('LA appended', added, 'new draws; total', hist.length);
    } else { console.log('LA parse alignment off ('+parsed.length+' draws vs '+dates.length+' dates) — keeping stored history'); }
  }catch(e){ console.log('LA fetch failed, using stored history:', e.message); }
  return methods(hist,52,10);
}

// Jackpots: cash value (drives the take-home) from lotteryusa; annuity estimated from it.
async function jackpots(){
  const out={};
  for(const [game,url,minCash,ratio] of [['powerball','https://www.lotteryusa.com/powerball/',20e6,0.47],['lottoAmerica','https://www.lotteryusa.com/lotto-america/',2e6,0.46]]){
    try{
      const h = await (await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}})).text();
      const m = h.match(/Cash value:?\s*\$?\s*([0-9][0-9.,]*)\s*(Million|Billion)/i);
      if(m){ const cash = Math.round(parseFloat(m[1].replace(/,/g,'')) * (/billion/i.test(m[2])?1e9:1e6));
        if(cash>=minCash && cash<1e10) out[game] = { cashLumpSum:cash, advertisedAnnuity:Math.round(cash/ratio/1e6)*1e6 }; }
    }catch(e){ console.log('jackpot',game,'failed:',e.message); }
  }
  return out;
}

const [pb,la,jp] = await Promise.all([powerball(), lottoAmerica(), jackpots()]);
if(jp.powerball){ pb.advertisedAnnuity=jp.powerball.advertisedAnnuity; pb.cashLumpSum=jp.powerball.cashLumpSum; }
if(jp.lottoAmerica){ la.advertisedAnnuity=jp.lottoAmerica.advertisedAnnuity; la.cashLumpSum=jp.lottoAmerica.cashLumpSum; }
fs.writeFileSync('./data.json', JSON.stringify({ updated:new Date().toISOString(), powerball:pb, lottoAmerica:la }));
console.log('data.json OK — PB', pb.draws, 'edge', pb.ticketEdge.white.join(''), 'cash', pb.cashLumpSum, '| LA', la.draws, 'edge', la.ticketEdge.white.join(''), 'cash', la.cashLumpSum);
