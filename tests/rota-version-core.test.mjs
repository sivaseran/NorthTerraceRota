import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dateUTC, mondayOfISO, sundayOfISO, effectiveVersion,
  rotationVersion, rotationAssignment, appendEffectiveVersion, appendRotationVersion, rebaseRotationConfig, isRotationShift
} from '../rota-version-core.mjs';

const legacy = {
  effectiveFrom: '2026-09-07',
  anchorSunday: '2026-09-06',
  order: ['Pragash','Prashanthy','Suku','Parthy'],
  startPerson: 'Pragash'
};
test('date parsing rejects impossible dates', () => {
  assert.throws(() => dateUTC('2026-02-30'));
});
test('week boundaries work across month', () => {
  assert.equal(mondayOfISO('2026-11-01'), '2026-10-26');
  assert.equal(sundayOfISO('2026-11-02'), '2026-11-08');
});
test('weekly pattern selects latest effective version', () => {
  const versions=[{effectiveFrom:'2026-11-16',id:2},{effectiveFrom:'2026-11-02',id:1}];
  assert.equal(effectiveVersion(versions,'2026-11-15').id,1);
  assert.equal(effectiveVersion(versions,'2026-11-16').id,2);
});
test('superseded future weekly patterns are ignored from the superseding date', () => {
  const versions=[
    {effectiveFrom:'2026-11-02',id:'old'},
    {effectiveFrom:'2026-11-16',id:'new'},
    {effectiveFrom:'2026-11-30',id:'scheduled',supersededFrom:'2026-11-16'}
  ];
  assert.equal(effectiveVersion(versions,'2026-11-09').id,'old');
  assert.equal(effectiveVersion(versions,'2026-12-07').id,'new');
});
test('legacy Monday effective date resolves to its Sunday', () => {
  assert.equal(rotationVersion([legacy], '2026-09-06'), null);
  assert.equal(rotationVersion([legacy], '2026-09-13'), legacy);
});
test('new Sunday version supersedes earlier rotation', () => {
  const newer={...legacy,effectiveSunday:'2026-11-15',anchorSunday:'2026-11-15',order:['Suku','Parthy','Pragash','Prashanthy'],startPerson:'Suku'};
  assert.equal(rotationVersion([newer,legacy], '2026-11-08'),legacy);
  assert.equal(rotationVersion([newer,legacy], '2026-11-15'),newer);
});
test('superseded future Sunday rotation is ignored after a newer all-future rule', () => {
  const current={...legacy,effectiveSunday:'2026-11-15',anchorSunday:'2026-11-15',startPerson:'Pragash'};
  const scheduled={...legacy,effectiveSunday:'2026-11-29',anchorSunday:'2026-11-29',startPerson:'Suku',supersededFrom:'2026-11-15'};
  assert.equal(rotationVersion([current,scheduled],'2026-12-06'),current);
});
test('four-person legacy rotation advances correctly', () => {
  assert.equal(rotationAssignment(legacy,'2026-09-06').owner,'Pragash');
  assert.equal(rotationAssignment(legacy,'2026-09-13').owner,'Prashanthy');
});
test('flexible five-person rotation cycles and uses edited times', () => {
  const cfg={anchorSunday:'2026-11-15',order:['A','B','C','D','E'],startPerson:'C',shiftStart:'14:00',shiftEnd:'21:45'};
  assert.deepEqual(rotationAssignment(cfg,'2026-11-15'),{owner:'C',start:'14:00',end:'21:45',sunday:'2026-11-15'});
  assert.equal(rotationAssignment(cfg,'2026-11-29').owner,'E');
  assert.equal(rotationAssignment(cfg,'2026-12-06').owner,'A');
});
test('rotation rejects duplicate members and invalid shift times', () => {
  assert.throws(()=>rotationAssignment({anchorSunday:'2026-11-15',order:['A','A'],startPerson:'A'},'2026-11-15'));
  assert.throws(()=>rotationAssignment({anchorSunday:'2026-11-15',order:['A'],startPerson:'A',shiftStart:'22:00',shiftEnd:'13:30'},'2026-11-15'));
});
test('same-date weekly republish preserves history and activates the newest version', () => {
  const old={effectiveFrom:'2026-11-16',id:'old',publishedAt:'2026-11-16T08:00:00.000Z'};
  const next=appendEffectiveVersion([old],{effectiveFrom:'2026-11-16',id:'new'},'effectiveFrom','2026-11-16T09:00:00.000Z');
  assert.equal(next.length,2);
  assert.equal(next[0].id,'old');
  assert.equal(next[0].supersededFrom,'2026-11-16');
  assert.equal(effectiveVersion(next,'2026-11-16').id,'new');
});
test('same-date Sunday rotation republish preserves history and activates the newest version', () => {
  const old={effectiveSunday:'2026-11-15',anchorSunday:'2026-11-15',order:['A','B'],startPerson:'A',publishedAt:'2026-11-15T08:00:00.000Z'};
  const newer={effectiveSunday:'2026-11-15',anchorSunday:'2026-11-15',order:['A','B'],startPerson:'B'};
  const next=appendRotationVersion([old],newer,'2026-11-15T09:00:00.000Z');
  assert.equal(next.length,2);
  assert.equal(next[0].supersededFrom,'2026-11-15');
  assert.equal(rotationVersion(next,'2026-11-15').startPerson,'B');
});
test('rotation rollback rebase preserves the active sequence and drops inactive staff', () => {
  const cfg={
    anchorSunday:'2026-11-01',
    order:['A','B','C','D'],
    startPerson:'A',
    shiftStart:'14:00',
    shiftEnd:'21:45'
  };
  const rebased=rebaseRotationConfig(cfg,'2026-11-15',['A','C','D']);
  assert.deepEqual(rebased,{
    effectiveSunday:'2026-11-15',
    effectiveFrom:'2026-11-09',
    anchorSunday:'2026-11-15',
    order:['A','C','D'],
    startPerson:'C',
    shiftStart:'14:00',
    shiftEnd:'21:45'
  });
  assert.equal(rotationAssignment(rebased,'2026-11-22').owner,'D');
});
test('rotation shift is identified by tag rather than matching unrelated hours', () => {
  assert.equal(isRotationShift({start:'13:30',end:'22:00'}),false);
  assert.equal(isRotationShift({tag:'Sunday rotation',start:'14:00',end:'22:00'}),true);
});
