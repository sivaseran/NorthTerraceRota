import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const manager=readFileSync(resolve(here,'../manage/index.html'),'utf8');
const staff=readFileSync(resolve(here,'../index.html'),'utf8');
const staffSw=readFileSync(resolve(here,'../sw.js'),'utf8');
const managerSw=readFileSync(resolve(here,'../manage/sw.js'),'utf8');

function moduleBody(html){
  const m=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(m,'module script should exist');
  return m[1];
}
function stripImports(js){
  return js.replace(/^\s*import\s+[^;]+;\s*$/gm,'');
}
function functionBody(js,name){
  const start=js.indexOf(`function ${name}(`);
  const asyncStart=js.indexOf(`async function ${name}(`);
  const pos=start>=0?start:asyncStart;
  assert.ok(pos>=0,`${name} should exist`);
  const brace=js.indexOf('{',pos);
  let depth=0;
  for(let i=brace;i<js.length;i++){
    if(js[i]==='{')depth++;
    else if(js[i]==='}'){
      depth--;
      if(depth===0)return js.slice(brace+1,i);
    }
  }
  throw new Error(`Could not isolate ${name}`);
}

test('manager and staff module scripts are syntactically valid',()=>{
  assert.doesNotThrow(()=>new Function(stripImports(moduleBody(manager))));
  assert.doesNotThrow(()=>new Function(stripImports(moduleBody(staff))));
});

test('manager and staff both use the shared effective-dated rota helpers',()=>{
  assert.match(manager,/import \{[^}]*effectiveVersion[^}]*rotationVersion[^}]*rotationAssignment[^}]*isRotationShift[^}]*\} from "\.\.\/rota-version-core\.mjs";/);
  assert.match(staff,/import \{[^}]*effectiveVersion[^}]*rotationVersion[^}]*rotationAssignment[^}]*isRotationShift[^}]*\} from "\.\/rota-version-core\.mjs";/);
});

test('manager exposes the flexible Sunday rotation workflow',()=>{
  assert.match(manager,/id="plannerManageRotation"/);
  assert.match(manager,/id="rotationEffectiveSunday"/);
  assert.match(manager,/id="rotationStartTime"/);
  assert.match(manager,/id="rotationEndTime"/);
  assert.match(manager,/Next 12 Sundays preview/);
  assert.match(manager,/id="rotationAddBtn"/);
  assert.match(manager,/data-act="remove"/);
  assert.match(manager,/data-act="up"/);
  assert.match(manager,/data-act="down"/);
  assert.doesNotMatch(manager,/Each of the four people must appear/);
  assert.doesNotMatch(manager,/\$\{\[0,1,2,3\]\.map/);
});

test('rotation editing is draft-only until all-future publish',()=>{
  const js=moduleBody(manager);
  const draft=functionBody(js,'manageSundayRotationDraft');
  assert.doesNotMatch(draft,/\bsetDoc\s*\(/);
  assert.match(draft,/pendingSundayRotationConfig\s*=\s*cfg/);
  assert.match(draft,/plannerMarkDirty\s*\(/);
  const week=functionBody(js,'publishPlannerWeek');
  assert.match(week,/if\s*\(pendingSundayRotationConfig\)/);
  assert.match(week,/Confirm all future weeks/);
});

test('future publish includes 12-week review before Firebase writes',()=>{
  const js=moduleBody(manager);
  const fn=functionBody(js,'publishPlannerFuture');
  const review=fn.indexOf('futurePatternReviewDialog');
  const firstWrite=fn.indexOf('setDoc(');
  assert.ok(review>=0,'future review should be called');
  assert.ok(firstWrite>review,'review must happen before Firebase writes');
  assert.match(manager,/Review next 12 weeks/);
  assert.match(manager,/Existing custom week overrides/);
});

test('version history restore is draft-only and preserves historical versions',()=>{
  const js=moduleBody(manager);
  const fn=functionBody(js,'openRotaVersionHistory');
  assert.doesNotMatch(fn,/\bsetDoc\s*\(/);
  assert.match(fn,/Use as draft/);
  assert.match(fn,/never deletes or overwrites an old version/i);
  assert.match(fn,/rebaseRotationConfig/);
  assert.match(fn,/Confirm all future weeks/);
});

test('future weekly patterns and rotations support superseding without deletion',()=>{
  const js=moduleBody(manager);
  const publish=functionBody(js,'publishPlannerFuture');
  const saveRotation=functionBody(js,'saveSundayRotationVersion');
  assert.match(publish,/supersededFrom/);
  assert.match(saveRotation,/supersededFrom/);
  assert.match(staff,/effectiveVersion\(snap\.data\(\)\.versions,key\)/);
});

test('manager reports and staff phones resolve weeks with the same precedence',()=>{
  const managerJs=moduleBody(manager);
  const managerResolve=functionBody(managerJs,'resolveWeekDataForReport');
  const staffJs=moduleBody(staff);
  const staffResolve=functionBody(staffJs,'resolveWeekDataFor');

  assert.ok(managerResolve.indexOf("week_\${weekKey(mondayDate)}") < managerResolve.indexOf('basePatternForWeek(mondayDate)'));
  assert.match(managerResolve,/basePatternForWeek\(mondayDate\)/);
  assert.match(managerResolve,/applySundayRotation\(baseForWeek, mondayDate\)/);

  assert.ok(staffResolve.indexOf("week_\${weekKey(mondayDate)}") < staffResolve.indexOf('resolveBasePatternForWeek(mondayDate)'));
  assert.match(staffResolve,/resolveBasePatternForWeek\(mondayDate\)/);
  assert.match(staffResolve,/applySundayRotation\(base,mondayDate\)/);

  const reportGrid=functionBody(managerJs,'buildWeeklyGrid');
  assert.match(reportGrid,/resolveWeekDataForReport\(mondayDate\)/);
});
test('active staff creation is atomic across roster PIN and base rota',()=>{
  const js=moduleBody(manager);
  const fn=functionBody(js,'addStaffMemberInline');
  assert.match(fn,/const batch=writeBatch\(db\)/);
  assert.match(fn,/batch\.set\(doc\(db,'rota','staff_list'\)/);
  assert.match(fn,/batch\.set\(doc\(db,'staff_pins','all'\)/);
  assert.match(fn,/batch\.set\(doc\(db,'rota','shifts'\)/);
  assert.match(fn,/await batch\.commit\(\)/);
  assert.ok(fn.indexOf('await batch.commit()') < fn.indexOf('STAFF=nextStaff'),'local state must change only after the batch succeeds');
});
test('staff removal is history-safe and preserves future week metadata',()=>{
  const js=moduleBody(manager);
  const fn=functionBody(js,'removeStaffMemberAdmin');
  assert.match(fn,/appendEffectiveVersion/);
  assert.match(fn,/appendRotationVersion/);
  assert.match(fn,/writeBatch\(db\)/);
  assert.match(fn,/\{\.\.\.s\.data\(\),json:JSON\.stringify\(d\)\}/);
  assert.doesNotMatch(fn,/versions\s*=\s*versions\.map\(v=>\{try\{const d=JSON\.parse\(v\.json\);delete d\[name\]/);
  assert.match(fn,/Historical rota versions, timesheets and reports were preserved/i);
});
test('V2 service workers trigger update detection and remain network-first',()=>{
  assert.match(staffSw,/shift-north-terrace-v4-flexible-rota/);
  assert.match(managerSw,/manage-north-terrace-v4-flexible-rota/);
  assert.match(staffSw,/event\.respondWith\(fetch\(event\.request\)\)/);
  assert.match(managerSw,/event\.respondWith\(fetch\(event\.request\)\)/);
  assert.match(staff,/navigator\.serviceWorker\.register\('sw\.js'\)/);
  assert.match(manager,/navigator\.serviceWorker\.register\('sw\.js',\{scope:'\.\/'\}\)/);
});
test('staff and manager identify Sunday rotation using an explicit marker',()=>{
  assert.match(manager,/rotationId:"north-terrace-sunday"/);
  assert.match(staff,/rotationId:"north-terrace-sunday"/);
});
