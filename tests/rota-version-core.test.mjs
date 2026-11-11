import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dateUTC, mondayOfISO, sundayOfISO, effectiveVersion,
  rotationVersion, rotationAssignment, isRotationShift
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
test('rotation shift is identified by tag rather than matching unrelated hours', () => {
  assert.equal(isRotationShift({start:'13:30',end:'22:00'}),false);
  assert.equal(isRotationShift({tag:'Sunday rotation',start:'14:00',end:'22:00'}),true);
});
