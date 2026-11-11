import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const staffPath=resolve(root,'index.html');
const staffNames=['Parthy','Uday','Prashanthy','Suku','Donna','Moon','Himmo','Rishi','Pragash'];

const firebaseAppStub=`export const initializeApp=()=>({});`;
const firebaseFirestoreStub=`
const dataByPath={
  'staff_pins/all':{Parthy:'1234'},
  'rota/staff_list':{names:${JSON.stringify(staffNames)}}
};
const makeSnap=(ref)=>{
  const data=dataByPath[ref?.path];
  return {exists:()=>data!==undefined,data:()=>data||{},id:String(ref?.path||'').split('/').pop()||''};
};
export const getFirestore=()=>({});
export const doc=(db,...parts)=>({path:parts.join('/')});
export const collection=(db,...parts)=>({path:parts.join('/')});
export const where=(...args)=>({type:'where',args});
export const query=(base,...parts)=>({path:base?.path||'',parts});
export const getDoc=async(ref)=>makeSnap(ref);
export const getDocs=async()=>({forEach:()=>{},docs:[],empty:true,size:0});
export const setDoc=async()=>{};
export const updateDoc=async()=>{};
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
    await waitFor('.key-btn[data-key="1"]');
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

    const monthTab=document.querySelector('.home-tab-btn[data-hometab="month"]');
    if(!monthTab)throw new Error('Month tab missing');
    monthTab.click();
    await sleep(20);
    if(document.querySelector('#homeTabMonth').classList.contains('hidden'))throw new Error('Month tab did not open');

    result.textContent='PASS '+JSON.stringify({login:'Parthy',weeklyLoaded:true,monthLoaded:true,monthTab:true});
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
