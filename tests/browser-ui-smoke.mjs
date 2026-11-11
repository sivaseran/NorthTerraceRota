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
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const store=new Map();
const writes=[];
globalThis.__firestoreStore=store;
globalThis.__firestoreWrites=writes;
const makeSnap=(ref)=>{
  const data=store.get(ref?.path);
  return {exists:()=>data!==undefined,data:()=>clone(data)||{},id:String(ref?.path||'').split('/').pop()||''};
};
const applySet=(ref,data)=>{store.set(ref.path,clone(data));writes.push({type:'set',path:ref.path,data:clone(data)});};
const applyUpdate=(ref,data)=>{store.set(ref.path,{...(store.get(ref.path)||{}),...clone(data)});writes.push({type:'update',path:ref.path,data:clone(data)});};
export const getFirestore=()=>({});
export const doc=(db,...parts)=>({path:parts.join('/')});
export const collection=(db,...parts)=>({path:parts.join('/')});
export const where=(...args)=>({type:'where',args});
export const query=(base,...parts)=>({path:base?.path||'',parts});
export const getDoc=async(ref)=>makeSnap(ref);
export const getDocs=async(q)=>{
  const prefix=(q?.path||'')+'/';
  const docs=[];
  for(const [path,data] of store.entries()){
    if(!path.startsWith(prefix))continue;
    const rest=path.slice(prefix.length);
    if(rest.includes('/'))continue;
    docs.push({id:rest,data:()=>clone(data)});
  }
  return {forEach:cb=>docs.forEach(cb),docs,empty:docs.length===0,size:docs.length};
};
export const setDoc=async(ref,data)=>applySet(ref,data);
export const updateDoc=async(ref,data)=>applyUpdate(ref,data);
export const writeBatch=()=>{
  const ops=[];
  const api={
    set:(ref,data)=>{ops.push(()=>applySet(ref,data));return api;},
    update:(ref,data)=>{ops.push(()=>applyUpdate(ref,data));return api;},
    delete:(ref)=>{ops.push(()=>{store.delete(ref.path);writes.push({type:'delete',path:ref.path});});return api;},
    commit:async()=>{ops.forEach(fn=>fn());}
  };
  return api;
};
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

    const effectiveSunday=document.querySelector('#rotationEffectiveSunday').value;
    document.querySelector('.sunday-rotation-card [data-act="save"]').click();
    const closeStarted=Date.now();
    while(document.querySelector('.sunday-rotation-card')&&Date.now()-closeStarted<3000)await sleep(25);
    if(document.querySelector('.sunday-rotation-card'))throw new Error('Rotation draft dialog did not close');

    document.querySelector('#plannerConfirmFuture').click();
    const reviewStarted=Date.now();
    let reviewCard=null;
    while(Date.now()-reviewStarted<5000){
      reviewCard=[...document.querySelectorAll('.cover-review-card')].find(c=>c.textContent.includes('Review next 12 weeks'));
      if(reviewCard)break;
      await sleep(25);
    }
    if(!reviewCard)throw new Error('12-week future review did not open');
    const publish=reviewCard.querySelector('[data-act="publish"]');
    if(!publish)throw new Error('Future review publish button missing');
    publish.click();

    const publishStarted=Date.now();
    const status=document.querySelector('#plannerStatus');
    while(!status.textContent.includes('Published — Sunday rotation')&&Date.now()-publishStarted<5000)await sleep(25);
    if(!status.textContent.includes('Published — Sunday rotation'))throw new Error('Future rotation publish did not complete; status='+status.textContent);

    const store=globalThis.__firestoreStore;
    const rotationDoc=store.get('rota/sunday_rotation');
    const patternDoc=store.get('rota/pattern_versions');
    const weekPath=[...store.keys()].find(k=>k.startsWith('rota/week_'));
    if(!rotationDoc?.versions?.length)throw new Error('Sunday rotation version was not written');
    const savedRotation=rotationDoc.versions.at(-1);
    if(savedRotation.order.length!==5)throw new Error('Published rotation did not keep five members');
    if(savedRotation.shiftStart!=='14:00')throw new Error('Published rotation did not keep edited start time');
    if(savedRotation.effectiveSunday!==effectiveSunday)throw new Error('Published rotation effective Sunday changed unexpectedly');
    if(!patternDoc?.versions?.length)throw new Error('Pattern version was not written');
    if(!weekPath)throw new Error('Selected week document was not written');

    document.querySelector('#plannerVersionHistory').click();
    const historyStarted=Date.now();
    let historyCard=null;
    while(Date.now()-historyStarted<5000){
      historyCard=[...document.querySelectorAll('.cover-review-card')].find(c=>c.textContent.includes('Version history / restore draft'));
      if(historyCard)break;
      await sleep(25);
    }
    if(!historyCard)throw new Error('Version history dialog did not open after publish');
    if(!historyCard.querySelector('[data-pattern]'))throw new Error('Published pattern missing from version history');
    const rotationRestore=historyCard.querySelector('[data-rotation]');
    if(!rotationRestore)throw new Error('Published rotation missing from version history');
    rotationRestore.click();
    await sleep(25);
    if(!status.textContent.includes('Historical rotation from'))throw new Error('Historical rotation did not load as a draft');

    result.textContent='PASS '+JSON.stringify({initialMembers:4,afterAdd:5,previewRows:12,editedStart:'14:00',published:true,weekPath,versionHistory:true,restoreDraft:true});
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
  '--virtual-time-budget=16000','--dump-dom',
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
