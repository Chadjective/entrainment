// Headless logic verification against the spec's testable criteria.
// Covers the renderer-independent systems: procedural song + event map
// (System 3), collision/near-miss (System 9), curve/section sampling.
//   run:  node test/verify.mjs
import { generateProceduralSong } from '../src/audio/procedural.js';
import { intersects, checkShip, grazeCloseness } from '../src/game/collision.js';
import { sampleCurve, sectionAt } from '../src/data/loader.js';
import { analyzeSong } from '../src/audio/analyze.js';
import { Stillness, isStill } from '../src/game/stillness.js';
import { SHIP, SCORE, STILLNESS, GRAZE } from '../src/core/config.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};

// ---- stub just enough of AudioContext for procedural generation ----
const SR = 44100;
const stubCtx = {
  sampleRate: SR,
  createBuffer(_ch, len) {
    const chan = new Float32Array(len);
    return { length: len, copyToChannel: (src) => chan.set(src.subarray(0, len)), getChannelData: () => chan };
  },
};

console.log('\n# System 3 — procedural song + event map');
const { buffers, map } = generateProceduralSong(stubCtx);
ok('6 stems generated', buffers.length === 6);
ok('duration 120s', map.duration === 120);
ok('curves length = duration*60 (7200)', Object.values(map.curves).every((c) => c.length === 7200),
  Object.fromEntries(Object.entries(map.curves).map(([k, v]) => [k, v.length])));
const allRms = [...map.curves.master_rms, ...map.curves.piano_rms, ...map.curves.synth_rms];
ok('all RMS in [0,1]', allRms.every((v) => v >= 0 && v <= 1));
ok('all centroid in [0,1]', map.curves.master_centroid.every((v) => v >= 0 && v <= 1));
ok('events present', map.events.length > 0, `n=${map.events.length}`);
ok('events sorted by time', map.events.every((e, i, a) => i === 0 || a[i - 1].time <= e.time));
const hazards = map.events.filter((e) => e.type === 'obstacle' || e.type === 'enemy');
ok('hazard x within track [-7,7]', hazards.every((e) => e.x >= -7 && e.x <= 7));
const pillars = map.events.filter((e) => e.type === 'obstacle');
ok('pillar size in [0.5,2.5]', pillars.every((e) => e.size >= 0.5 && e.size <= 2.5));
ok('pillar height in [1,4]', pillars.every((e) => e.height >= 1 && e.height <= 4.0001));
const ceilings = map.events.filter((e) => e.def === 'pillar_ceiling');
ok('overhead pillars present (top lane contested)', ceilings.length > 0, `n=${ceilings.length}`);
ok('overhead pillar height in [1,4.5]', ceilings.every((e) => e.height >= 1 && e.height <= 4.5001));
ok('beats present & ascending', map.beats.length > 0 && map.beats.every((b, i, a) => i === 0 || a[i - 1] < b));
ok('7 sections', map.sections.length === 7);
ok('subtypes valid', map.events.filter((e) => e.type === 'enemy').every((e) => ['cube', 'drone', 'drone_fast'].includes(e.subtype)));

console.log('\n# System 9 — collision / near-miss');
const ship = { x: 0, y: 1.5, z: 0, hx: SHIP.half[0], hy: SHIP.half[1], hz: SHIP.half[2] };
const mkEnt = (x, z) => ({ mesh: { position: { x, y: 1.5, z } }, hx: 0.45, hy: 0.45, hz: 0.45, nearMissed: false });
ok('overlap => hit', checkShip(ship, [mkEnt(0, 0)]).hit !== null);
ok('1.5u away => no hit', checkShip(ship, [mkEnt(1.5, 0)]).hit === null);
const nm = checkShip(ship, [mkEnt(1.3, 0)]); // within padded box, outside core
ok('0.3u gap => near miss, no hit', nm.hit === null && nm.nearMiss === 1, JSON.stringify(nm));
const ent = mkEnt(1.3, 0);
checkShip(ship, [ent]); const second = checkShip(ship, [ent]);
ok('near miss fires only once', second.nearMiss === 0);
ok('intersects symmetric', intersects(ship, { x: 0, y: 1.5, z: 0, hx: 0.4, hy: 0.4, hz: 0.4 }) === true);

console.log('\n# Gameplay #2 — grazing closeness');
const pad = [0.5, 0.5, 0.5];
const box = (x) => ({ x, y: 1.5, z: 0, hx: 0.45, hy: 0.45, hz: 0.45 });
ok('colliding => null (not a graze)', grazeCloseness(ship, pad, box(0)) === null);
ok('far outside pad => null', grazeCloseness(ship, pad, box(3)) === null);
const near = grazeCloseness(ship, pad, box(1.25)); // just outside the core box (ship hx 0.7 + ent 0.45 = 1.15)
const farG = grazeCloseness(ship, pad, box(1.55));
ok('grazing returns 0..1', near != null && near > 0 && near <= 1, `near=${near}`);
ok('closer graze scores higher', near > farG, `near=${near} far=${farG}`);
ok('checkShip reports graze fields', (() => { const r = checkShip(ship, [mkEnt(1.2, 0)]); return r.grazeCount === 1 && r.grazeClose > 0 && r.hit === null; })());
ok('checkShip skips gates (fly-through, never lethal/graze)', (() => {
  const g = { def: { gate: true }, mesh: { position: { x: 0, y: 1.5, z: 0 } }, hx: 2, hy: 2, hz: 0.3, nearMissed: false };
  const r = checkShip(ship, [g]);
  return r.hit === null && r.grazeCount === 0;
})());

console.log('\n# curve + section sampling');
ok('sampleCurve clamps low', sampleCurve(map.curves.master_rms, -5) === map.curves.master_rms[0]);
ok('sampleCurve clamps high', sampleCurve(map.curves.master_rms, 9999) === map.curves.master_rms.at(-1));
ok('sampleCurve interpolates', (() => { const v = sampleCurve([0, 1], 0.5 / 60); return Math.abs(v - 0.5) < 1e-6; })());
ok('sectionAt t=0 emergence', sectionAt(map.sections, 0).name === 'emergence');
ok('sectionAt end = departure', sectionAt(map.sections, 119).name === 'departure');
ok('section speed increases mid-song', sectionAt(map.sections, 90).speed > 1.0);

console.log('\n# real-song analysis (in-browser pipeline)');
function fakeBuffer({ sr, durSec, bpm }) {
  const length = Math.floor(sr * durSec);
  const data = new Float32Array(length);
  const period = Math.round((sr * 60) / bpm);     // samples per beat
  for (let i = 0; i < length; i += period) {
    for (let j = 0; j < 220 && i + j < length; j++) data[i + j] = Math.exp(-j / 45) * (j % 2 ? 1 : -1);
  }
  return { sampleRate: sr, duration: durSec, length, numberOfChannels: 1, getChannelData: () => data };
}
const songMap = analyzeSong(fakeBuffer({ sr: 44100, durSec: 12, bpm: 120 }), { title: 'TEST' });
ok('single-track flag set', songMap.singleTrack === true);
ok('curves length = duration*60', Object.values(songMap.curves).every((c) => c.length === 720), JSON.stringify(Object.fromEntries(Object.entries(songMap.curves).map(([k, v]) => [k, v.length]))));
ok('tempo detected ≈ 120', Math.abs(songMap.tempo - 120) <= 8, `tempo=${songMap.tempo}`);
ok('beats ascending & in-range', songMap.beats.length > 4 && songMap.beats.every((b, i, a) => (i === 0 || a[i - 1] < b) && b < 12));
ok('events generated & sorted', songMap.events.length > 0 && songMap.events.every((e, i, a) => i === 0 || a[i - 1].time <= e.time));
ok('7 sections + RMS in range', songMap.sections.length === 7 && songMap.curves.master_rms.every((v) => v >= 0 && v <= 1));

console.log('\n# Fjordnacht B2 — stillness cover meter');
const stp = (s, calm, still, dt, n) => { for (let i = 0; i < n; i++) s.step(calm, still, dt); };
const sB = new Stillness();
stp(sB, true, true, 1 / 60, 110);                  // ~1.8s of held breath in a calm section
ok('held breath fills to UNSEEN', sB.meter === 1 && sB.unseen === true, `meter=${sB.meter}`);
sB.step(true, true, 1); ok('meter clamps at 1', sB.meter === 1);
stp(sB, true, false, 1 / 60, 40);                  // break stillness
ok('breaking stillness drops cover', sB.meter <= 0.70 && sB.unseen === false, `meter=${sB.meter}`);
// hysteresis: at meter 0.80 the latch depends on the prior state (delta 0 = meter held)
const hUp = new Stillness(); hUp.meter = 0.80; hUp.unseen = true; hUp.step(true, true, 0);
const hDn = new Stillness(); hDn.meter = 0.80; hDn.unseen = false; hDn.step(true, true, 0);
ok('hysteresis: stays unseen at 0.80', hUp.unseen === true);
ok('hysteresis: stays seen at 0.80 (needs 0.85 to enter)', hDn.unseen === false);
const sG = new Stillness(); stp(sG, false, true, 1 / 60, 200);
ok('no cover outside a calm section', sG.meter === 0 && sG.unseen === false);
const sR = new Stillness(); stp(sR, true, true, 1 / 60, 110); sR.reset();
ok('reset clears meter + unseen + budget', sR.meter === 0 && sR.unseen === false && sR.coverScale === 1);
// reward rates are pure functions of (unseen, coverScale)
const rr = new Stillness();
ok('seen -> no reward (regen 1x, score 0)', rr.regenRate() === 1 && rr.scoreRate() === 0);
rr.unseen = true; rr.coverScale = 1;
ok('unseen + full budget -> peak rewards', Math.abs(rr.regenRate() - STILLNESS.regenMult) < 1e-9 && Math.abs(rr.scoreRate() - STILLNESS.pointsPerSec) < 1e-9);
rr.coverScale = 0;
ok('unseen + spent budget -> rewards taper to baseline', rr.regenRate() === 1 && rr.scoreRate() === 0);
// anti-camp: holding unseen drains the budget to zero
const sD = new Stillness(); stp(sD, true, true, 1 / 60, 110); stp(sD, true, true, 1 / 60, 60 * 12);
ok('budget drains while unseen (anti-camp)', sD.unseen === true && sD.budget === 0 && sD.coverScale === 0, `budget=${sD.budget}`);
// budget refills only OUTSIDE calm sections
const sF = new Stillness(); sF.budget = 0; sF.coverScale = 0; stp(sF, false, false, 1 / 60, 60 * 4);
ok('budget refills outside calm', sF.budget > 1.5, `budget=${sF.budget.toFixed(2)}`);
ok('calm score ceiling below loud (graze)', STILLNESS.pointsPerSec < GRAZE.pointsPerSec);
// cover drops the INSTANT a section turns loud (pins the `if (!calm) unseen=false` guard:
// unseen must flip false even though the meter is still well above the exit threshold)
const sCarry = new Stillness(); stp(sCarry, true, true, 1 / 60, 110);
sCarry.step(false, true, 1 / 60);
ok('unseen drops immediately when the section turns loud', sCarry.unseen === false && sCarry.meter > STILLNESS.hideThreshold, `meter=${sCarry.meter.toFixed(2)}`);

// the `still` PREDICATE — the real per-frame gameplay condition (truth table)
const base = { firing: false, steer: 0, vertical: 0, roll: 0, throttle: 0, invuln: 0, grazeLevel: 0, fireLevel: 0, gateLevel: 0 };
ok('isStill: all-neutral in a calm section => still', isStill(true, base) === true);
ok('isStill: not calm => never still', isStill(false, base) === false);
ok('isStill: firing breaks it', isStill(true, { ...base, firing: true }) === false);
ok('isStill: accel (throttle>0) breaks it, brake (throttle<0) is allowed',
  isStill(true, { ...base, throttle: 1 }) === false && isStill(true, { ...base, throttle: -1 }) === true);
ok('isStill: steer / vertical / roll each break it',
  isStill(true, { ...base, steer: 1 }) === false && isStill(true, { ...base, vertical: -1 }) === false && isStill(true, { ...base, roll: 1 }) === false);
ok('isStill: i-frame blink breaks it', isStill(true, { ...base, invuln: 0.5 }) === false);
ok('isStill: grazing / gate light break it',
  isStill(true, { ...base, grazeLevel: 0.2 }) === false && isStill(true, { ...base, gateLevel: 0.2 }) === false);
ok('isStill: fire-light must decay below darkFireMax',
  isStill(true, { ...base, fireLevel: STILLNESS.darkFireMax - 0.001 }) === true && isStill(true, { ...base, fireLevel: STILLNESS.darkFireMax + 0.01 }) === false);

// reward APPLICATION math (the index.js call-site accrual, simulated headlessly)
const sAcc = new Stillness(); stp(sAcc, true, true, 1 / 60, 110); // unseen
const dt = 1 / 60, frames = 30, cs = sAcc.coverScale;
let scoreAcc = 0, regenAcc = 0;
for (let i = 0; i < frames; i++) { if (sAcc.unseen) scoreAcc += sAcc.scoreRate() * dt; regenAcc += dt * sAcc.regenRate(); }
ok('unseen accrues calm score = pointsPerSec×coverScale×t', Math.abs(scoreAcc - STILLNESS.pointsPerSec * cs * dt * frames) < 1e-9);
ok('unseen accelerates regen accrual (×regenMult×coverScale)', Math.abs(regenAcc - dt * frames * (1 + (STILLNESS.regenMult - 1) * cs)) < 1e-9);
ok('vignette ceiling is a clamped opacity', STILLNESS.vignetteMax > 0 && STILLNESS.vignetteMax <= 1);

console.log(`\n# scoring sanity`);
ok('near-miss award = 50', SCORE.nearMiss === 50);

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
