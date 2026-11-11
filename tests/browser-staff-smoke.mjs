import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const staffPath=resolve(root,'index.html');
const staffNames=['Parthy','Uday','Prashanthy','Suku','Donna','Moon','Himmo','Rishi','Pragash'];
const isoLocal=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const mondayOfLocal=date=>{const d=new Date(date);const day=d.getDay();d.setDate(d.getDate()+(day===0?-6:1-day));d.setHours(12,0,0,0);return d;};
const currentMonday=mondayOfLocal(new Date());
const currentSunday=new Date(currentMonday);currentSunday.setDate(currentSunday.getDate()+6);
const currentMondayKey=isoLocal(currentMonday);
const currentSundayKey=isoLocal(currentSunday);
const blankWeek=()=>Array.from({length:7},()=>({off:true,total:0}));
const v2Pattern=Object.fromEntries(staffNames.map(name=>[name,blankWeek()]));

const firebaseAppStub=`export const initializeApp=()=>({});`;
const firebaseFirestoreStub=`
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const dataByPath={
  'staff_pins/all':{Parthy:'1234'},
  'rota/staff_list':{names:${JSON.stringify(staffNames)}},
  'rota/pattern_versions':{versions:[{effectiveFrom:'${currentMondayKey}',json:${JSON.stringify(JSON.stringify(v2Pattern))},publishedAt:'2026-11-11T12:00:00.000Z'}]},
  'rota/sunday_rotation':{versions:[{
    effectiveSunday:'${currentSundayKey}',
    effectiveFrom:'${currentMondayKey}',
    anchorSunday:'${currentSundayKey}',
    order:['Parthy','Uday','Prashanthy','Suku','Donna'],
    startPerson:'Parthy',
    shiftStart:'14:00',
    shiftEnd:'21:45',
    publishedAt:'2026-11-11T12:00:00.000Z'
  }]}
};
globalThis.__staffStore=dataByPath;
globalThis.__staffWrites=[];
const makeSnap=(ref)=>{
  const data=dataByPath[ref?.path];
  return {exists:()=>data!==undefined,data:()=>clone(data)||{},id:String(ref?.path||'').split('/').pop()||''};
};
export const getFirestore=()=>({});
export const doc=(db,...parts)=>({path:parts.join('/')});
export const collection=(db,...parts)=>({path:parts.join('/')});
export const where=(...args)=>({type:'where',args});
export const query=(base,...parts)=>({path:base?.path||'',parts});
export const getDoc=async(ref)=>makeSnap(ref);
export const getDocs=async()=>({forEach:()=>{},docs:[],empty:true,size:0});
export const setDoc=async(ref,data)=>{dataByPath[ref.path]=clone(data);globalThis.__staffWrites.push({type:'set',path:ref.path,data:clone(data)});};
export const updateDoc=async(ref,data)=>{dataByPath[ref.path]={...(dataByPath[ref.path]||{}),...clone(data)};globalThis.__staffWrites.push({type:'update',path:ref.path,data:clone(data)});};
export const onSnapshot=()=>()=>{};
`;

let staff=readFileSync(staffPath,'utf8');
staff=staff
  .replace('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js','/tests/firebase-app-stub.mjs')
  .replace('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js','/tests/firebase-firestore-stub.mjs')
  .replace("if ('serviceWorker' in navigator){","if (false && 'serviceWorker' in navigator){");

const probe=`
<script>
(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const waitFor=async(sel,timeout=7000)=>{
    const started=Date.now();
    while(Date.now()-started<timeout){
      const el=document.querySelector(sel);
      if(el)return el;
      await sleep(25);
    }
    throw new Error('Timed out waiting for '+sel);
  };
  const result=document.createElement('pre');
  result.id='staff-browser-smoke-result';
  document.body.appendChild(result);
  try{
    const firstKey=await waitFor('.key-btn[data-key="1"]');
    const handlerStarted=Date.now();
    while(typeof firstKey.onclick!=='function'&&Date.now()-handlerStarted<7000)await sleep(25);
    if(typeof firstKey.onclick!=='function')throw new Error('PIN keypad handlers were not initialised');
    for(const digit of ['1','2','3','4']){
      document.querySelector('.key-btn[data-key="'+digit+'"]').click();
      await sleep(20);
    }
    const home=await waitFor('#homeScreen');
    const started=Date.now();
    while(home.classList.contains('hidden')&&Date.now()-started<7000)await sleep(25);
    if(home.classList.contains('hidden'))throw new Error('Staff home did not open after valid PIN');
    if(document.querySelector('#hiNameSpan').textContent.trim()!=='Parthy')throw new Error('Logged-in staff name was not shown');

    const shifts=await waitFor('#myShiftsList');
    const month=await waitFor('#monthGrid');
    const loadStarted=Date.now();
    while((shifts.textContent.includes('Loading')||month.textContent.includes('Loading'))&&Date.now()-loadStarted<7000)await sleep(25);
    if(shifts.textContent.includes('Loading'))throw new Error('Weekly shifts did not finish loading');
    if(month.textContent.includes('Loading'))throw new Error('Month view did not finish loading');

    const sundayCards=[...shifts.querySelectorAll('.shift-day-card')];
    const sundayCard=sundayCards[6];
    if(!sundayCard)throw new Error('Sunday shift card missing');
    if(!sundayCard.textContent.includes('14:00 – 21:45'))throw new Error('Staff did not resolve edited V2 rotation hours: '+sundayCard.textContent);
    const swapBtn=sundayCard.querySelector('.swap-btn');
    if(!swapBtn)throw new Error('Swap button missing for flexible-hour Sunday rotation');
    swapBtn.click();
    await sleep(25);
    const swapPanel=sundayCard.querySelector('.add-shift-panel:not(.hidden)');
    if(!swapPanel)throw new Error('Swap panel did not open');
    const swapSelect=swapPanel.querySelector('.swap-person-select');
    swapSelect.value='Uday';
    swapPanel.querySelector('.swap-save-btn').click();
    const swapStarted=Date.now();
    while(!swapPanel.textContent.includes('Swapped.')&&Date.now()-swapStarted<5000)await sleep(25);
    if(!swapPanel.textContent.includes('Swapped.'))throw new Error('Flexible-hour Sunday swap did not save');

    const weekPath=Object.keys(globalThis.__staffStore).find(k=>k.startsWith('rota/week_'));
    if(!weekPath)throw new Error('Swap did not create a week override');
    const saved=globalThis.__staffStore[weekPath];
    const weekData=JSON.parse(saved.json);
    const targetRotation=(weekData.Uday?.[6]?.shifts||[]).find(s=>s.rotationId==='north-terrace-sunday');
    if(!targetRotation)throw new Error('Covering staff did not receive tagged Sunday rotation');
    if(targetRotation.start!=='14:00'||targetRotation.end!=='21:45')throw new Error('Swap changed flexible rotation hours');
    if(targetRotation.coveringFor!=='Parthy')throw new Error('Swap coveringFor metadata missing');
    const oldRotation=(weekData.Parthy?.[6]?.shifts||[]).find(s=>s.rotationId==='north-terrace-sunday'||s.tag==='Sunday rotation');
    if(oldRotation)throw new Error('Original staff still has the Sunday rotation after swap');

    const monthTab=document.querySelector('.home-tab-btn[data-hometab="month"]');
    if(!monthTab)throw new Error('Month tab missing');
    monthTab.click();
    await sleep(20);
    if(document.querySelector('#homeTabMonth').classList.contains('hidden'))throw new Error('Month tab did not open');

    result.textContent='PASS '+JSON.stringify({login:'Parthy',weeklyLoaded:true,monthLoaded:true,v2Hours:'14:00–21:45',swap:true,weekPath,monthTab:true});
    document.body.dataset.staffBrowserSmoke='pass';
  }catch(e){
    result.textContent='FAIL '+(e&&e.stack?e.stack:e);
    document.body.dataset.staffBrowserSmoke='fail';
  }
})();
</script>
`;
staff=staff.replace('</body>',probe+'</body>');

const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/__staff_browser_smoke.html'){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(staff);return;
  }
  if(url.pathname==='/tests/firebase-app-stub.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(firebaseAppStub);return;}
  if(url.pathname==='/tests/firebase-firestore-stub.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(firebaseFirestoreStub);return;}
  const file=resolve(root,'.'+url.pathname);
  if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('not found');return;}
  try{const body=readFileSync(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);}
  catch{res.writeHead(404);res.end('not found');}
});

await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const candidates=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
const chrome=candidates.find(existsSync);
if(!chrome){server.close();throw new Error('Chrome/Chromium not found. Set CHROME_BIN.');}

const child=spawn(chrome,[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--disable-background-networking','--disable-default-apps','--no-first-run',
  '--virtual-time-budget=10000','--dump-dom',
  `http://127.0.0.1:${port}/__staff_browser_smoke.html`
],{stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';
child.stdout.on('data',d=>stdout+=d);
child.stderr.on('data',d=>stderr+=d);
const code=await new Promise(resolve=>child.on('close',resolve));
server.close();

const match=stdout.match(/<pre id="staff-browser-smoke-result">([\s\S]*?)<\/pre>/);
const text=match?match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'):'';
if(code!==0||!stdout.includes('data-staff-browser-smoke="pass"')||!text.startsWith('PASS')){
  console.error('Staff browser smoke failed.');
  console.error(text||stderr||stdout.slice(-5000));
  process.exit(1);
}
console.log(text);
