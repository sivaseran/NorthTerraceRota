import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const managerPath=resolve(root,'manage/index.html');

const firebaseAppStub=`export const initializeApp=()=>({});`;
const firebaseAuthStub=`
export const getAuth=()=>({currentUser:{email:'test@example.com'}});
export const signInWithEmailAndPassword=async()=>({});
export const signOut=async()=>{};
export const onAuthStateChanged=(auth,cb)=>{setTimeout(()=>cb({email:'test@example.com'}),0);return()=>{};};
`;
const firebaseFirestoreStub=`
const snap=(ref)=>({exists:()=>false,data:()=>({}),id:String(ref?.path||'').split('/').pop()||''});
export const getFirestore=()=>({});
export const doc=(db,...parts)=>({path:parts.join('/')});
export const collection=(db,...parts)=>({path:parts.join('/')});
export const where=(...args)=>({type:'where',args});
export const query=(base,...parts)=>({path:base?.path||'',parts});
export const getDoc=async(ref)=>snap(ref);
export const getDocs=async()=>({forEach:()=>{},docs:[],empty:true,size:0});
export const setDoc=async()=>{};
export const updateDoc=async()=>{};
export const writeBatch=()=>{const api={set:()=>api,update:()=>api,delete:()=>api,commit:async()=>{}};return api;};
`;

let manager=readFileSync(managerPath,'utf8');
manager=manager
  .replace('<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>','<script>window.ExcelJS={};</script>')
  .replace('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js','/tests/firebase-app-stub.mjs')
  .replace('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js','/tests/firebase-auth-stub.mjs')
  .replace('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js','/tests/firebase-firestore-stub.mjs')
  .replace("if ('serviceWorker' in navigator){","if (false && 'serviceWorker' in navigator){");

const probe=`
<script>
(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const waitFor=async(sel,timeout=5000)=>{
    const started=Date.now();
    while(Date.now()-started<timeout){
      const el=document.querySelector(sel);
      if(el)return el;
      await sleep(25);
    }
    throw new Error('Timed out waiting for '+sel);
  };
  const result=document.createElement('pre');
  result.id='browser-smoke-result';
  document.body.appendChild(result);
  try{
    await waitFor('#plannerManageRotation');
    const editor=document.querySelector('#editorArea');
    const started=Date.now();
    while(editor.classList.contains('hidden')&&Date.now()-started<5000)await sleep(25);
    if(editor.classList.contains('hidden'))throw new Error('Manager did not authenticate in stub mode');

    document.querySelector('#plannerManageRotation').click();
    await waitFor('#rotationEffectiveSunday');
    const initialRows=[...document.querySelectorAll('.rotation-member-row')];
    const previewRows=[...document.querySelectorAll('#rotationPreview .rotation-preview-row')];
    if(initialRows.length!==4)throw new Error('Expected 4 legacy rotation members, got '+initialRows.length);
    if(previewRows.length!==12)throw new Error('Expected 12 preview Sundays, got '+previewRows.length);
    if(document.querySelector('#rotationStartTime').value!=='13:30')throw new Error('Wrong default start time');
    if(document.querySelector('#rotationEndTime').value!=='22:00')throw new Error('Wrong default end time');

    const add=document.querySelector('#rotationAddPerson');
    if(!add || !add.value)throw new Error('No available fifth staff member to add');
    document.querySelector('#rotationAddBtn').click();
    if(document.querySelectorAll('.rotation-member-row').length!==5)throw new Error('Adding a rotation member failed');

    const start=document.querySelector('#rotationStartTime');
    start.value='14:00';
    start.dispatchEvent(new Event('change',{bubbles:true}));
    await sleep(25);
    if(!document.querySelector('#rotationPreview').textContent.includes('14:00'))throw new Error('Preview did not react to edited shift time');

    document.querySelector('.sunday-rotation-card [data-act="cancel"]').click();
    document.querySelector('#plannerVersionHistory').click();
    await waitFor('.cover-review-title');
    if(!document.body.textContent.includes('Version history / restore draft'))throw new Error('Version history dialog did not open');

    result.textContent='PASS '+JSON.stringify({initialMembers:4,afterAdd:5,previewRows:12,editedStart:'14:00',versionHistory:true});
    document.body.dataset.browserSmoke='pass';
  }catch(e){
    result.textContent='FAIL '+(e&&e.stack?e.stack:e);
    document.body.dataset.browserSmoke='fail';
  }
})();
</script>
`;
manager=manager.replace('</body>',probe+'</body>');

const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/manage/__browser_smoke.html'){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(manager);return;
  }
  if(url.pathname==='/tests/firebase-app-stub.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(firebaseAppStub);return;}
  if(url.pathname==='/tests/firebase-auth-stub.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(firebaseAuthStub);return;}
  if(url.pathname==='/tests/firebase-firestore-stub.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(firebaseFirestoreStub);return;}
  const file=resolve(root,'.'+url.pathname);
  if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('not found');return;}
  try{const body=readFileSync(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);}
  catch{res.writeHead(404);res.end('not found');}
});

await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;

const candidates=[
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);
const chrome=candidates.find(existsSync);
if(!chrome){server.close();throw new Error('Chrome/Chromium not found. Set CHROME_BIN.');}

const args=[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--disable-background-networking','--disable-default-apps','--no-first-run',
  '--virtual-time-budget=8000','--dump-dom',
  `http://127.0.0.1:${port}/manage/__browser_smoke.html`
];
const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';
child.stdout.on('data',d=>stdout+=d);
child.stderr.on('data',d=>stderr+=d);
const code=await new Promise(resolve=>child.on('close',resolve));
server.close();

const match=stdout.match(/<pre id="browser-smoke-result">([\s\S]*?)<\/pre>/);
const text=match?match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'):'';
if(code!==0||!stdout.includes('data-browser-smoke="pass"')||!text.startsWith('PASS')){
  console.error('Browser smoke failed.');
  console.error(text||stderr||stdout.slice(-5000));
  process.exit(1);
}
console.log(text);
