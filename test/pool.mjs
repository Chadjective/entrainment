// Verifies object pooling (System 14): spawns recycle meshes instead of
// allocating, pillars scale correctly, debris recycles, reset returns all to
// pools. Imports three (no WebGL needed for geometry/material objects).
//   run:  node test/pool.mjs
import * as THREE from 'three';
import { EntityManager } from '../src/game/entities.js';
import { BulletManager } from '../src/game/bullets.js';
import { BEHAVIOURS } from '../src/game/behaviours.js';
import { Ship } from '../src/game/ship.js';
import { checkShip } from '../src/game/collision.js';
import { SPEED, SHIP, ROLL, CEILING, LASER, WATER } from '../src/core/config.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};
const fakeScene = { add() {} };
const despawn = (e) => { e.mesh.position.z = SPEED.despawnZ + 5; };

console.log('\n# entity pooling');
const em = new EntityManager(fakeScene);

// wave 1: spawn 5 cubes
for (let i = 0; i < 5; i++) em.spawn({ type: 'enemy', subtype: 'cube', x: 0 });
ok('5 cubes active', em.entities.length === 5);
ok('cube pool built 5', em.pools.cube.created === 5, `created=${em.pools.cube.created}`);

// despawn them all
em.entities.forEach(despawn);
em.update(0.016, SPEED.base, 0, 0);
ok('all cubes recycled', em.entities.length === 0 && em.pools.cube._free.length === 5, `free=${em.pools.cube._free.length}`);

// wave 2: spawn 5 more -> must REUSE, not allocate
for (let i = 0; i < 5; i++) em.spawn({ type: 'enemy', subtype: 'cube', x: 0 });
ok('wave 2 reuses (no new allocation)', em.pools.cube.created === 5, `created=${em.pools.cube.created}`);

// pillars: unit box scaled + hitbox from event
em.spawn({ type: 'obstacle', x: 1.5, size: 2.0, height: 3.0 });
const pil = em.entities[em.entities.length - 1];
ok('pillar scaled to size×height', pil.mesh.scale.x === 2.0 && pil.mesh.scale.y === 3.0 && pil.mesh.scale.z === 1);
ok('pillar hitbox from event', pil.hx === 1.0 && pil.hy === 1.5 && pil.hz === 0.4);
ok('pillar not shootable', pil.shootable === false);

// drones + debris
em.spawn({ type: 'enemy', subtype: 'drone', x: 0, aggression: 0.7 });
const drone = em.entities[em.entities.length - 1];
ok('drone shootable + laser', drone.shootable === true && drone.laser != null);
em.destroy(drone);
ok('drone destruction spawns 8 particles', em.debris.length === 8, `debris=${em.debris.length}`);

// debris recycles after life expires
for (let i = 0; i < 60; i++) em.update(0.05, SPEED.base, 0, 0);
ok('debris recycled after fade', em.debris.length === 0 && em.particlePool._free.length >= 8, `free=${em.particlePool._free.length}`);

// reset returns everything, pools persist
const builtBefore = em.pools.cube.created;
em.reset();
ok('reset clears active', em.entities.length === 0 && em.debris.length === 0);
em.spawn({ type: 'enemy', subtype: 'cube', x: 0 });
ok('post-reset reuses pool (no realloc)', em.pools.cube.created === builtBefore, `created=${em.pools.cube.created} vs ${builtBefore}`);

console.log('\n# drone beam (Gameplay #3)');
function droneInRange() {
  const m = new EntityManager(fakeScene);
  m.spawn({ type: 'enemy', subtype: 'drone', x: 0, aggression: 0.5 });
  m.entities[0].mesh.position.set(0, 1.5, -30); // within fire range
  return m;
}
const d1 = droneInRange();
d1.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 0 });
ok('beat 1 -> drone charges (telegraph)', d1.entities[0].fire.state === 'charging', `state=${d1.entities[0].fire.state}`);
d1.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 0 });
ok('beat 2 -> drone fires', d1.entities[0].fire.state === 'firing');
ok('beam hits ship in lane', d1.laserHit === true);

const d2 = droneInRange();
d2.update(0.016, SPEED.base, 0, 3, { onBeat: true, shipInvuln: 0 }); // charge
d2.update(0.016, SPEED.base, 0, 3, { onBeat: true, shipInvuln: 0 }); // fire; ship dodged to x=3
ok('dodged beam misses (lateral)', d2.laserHit === false);

// beam is a 2-D threat: a vertical climb dodges it too (drone locks at the
// player's altitude on charge, then a climb takes the ship out of the beam).
const d2v = droneInRange();
d2v.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 0, playerY: 1.5 }); // charge (locks ~y1.5)
d2v.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 0, playerY: 4.2 }); // fire; ship climbed away
ok('vertical climb dodges the beam', d2v.laserHit === false, `droneY=${d2v.entities[0].mesh.position.y.toFixed(2)}`);

// an idle drone chases the player's altitude (so high-camping isn't free)
const dyk = droneInRange();
const dr = dyk.entities[0];
for (let i = 0; i < 60; i++) { dr.mesh.position.z = -30; dyk.update(0.05, SPEED.base, 0, 0, { onBeat: false, shipInvuln: 0, playerY: 4.0 }); }
ok('idle drone climbs toward a high player (vertical threat)', dr.mesh.position.y > 2.4, `y=${dr.mesh.position.y.toFixed(2)}`);

const d3 = droneInRange();
d3.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 1 });
d3.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 1 });
ok('beam ignored during i-frames', d3.laserHit === false);

const d4 = droneInRange();
d4.update(0.016, SPEED.base, 0, 0, { onBeat: false, shipInvuln: 0 }); // no beat -> no charge
ok('no fire without a beat', d4.entities[0].fire.state === 'idle');

console.log('\n# B1 reflected telegraph (read it in the water)');
const WY = -0.5; // custom water height proves opts.waterY threads through to the tell
const tgm = droneInRange();
const tgd = tgm.entities[0];
tgm.update(0.016, SPEED.base, 0.1, 0, { onBeat: true, shipInvuln: 0, waterY: WY }); // -> charging
ok('charging: real beam dark, water tell on', tgd.fire.state === 'charging' && tgd.laser.visible === false && tgd.telegraph.visible === true && tgd.telegraphing === true, `state=${tgd.fire.state} laser=${tgd.laser.visible} tg=${tgd.telegraph.visible}`);
ok('tell lies flat on the water at the drone lane', Math.abs(tgd.telegraph.position.y - (WY + LASER.telegraphLift)) < 1e-6 && tgd.telegraph.position.x === tgd.mesh.position.x && tgd.telegraph.scale.x === LASER.laneHalf * 2, `y=${tgd.telegraph.position.y} x=${tgd.telegraph.position.x} sx=${tgd.telegraph.scale.x}`);
// the strip's z-EXTENT (scale.y) is the load-bearing dimension: it must span
// from the drone to the front, reaching toward the player (property, not formula)
ok('tell spans the lane from the drone to the front (z-extent)',
  Math.abs(tgd.telegraph.scale.y - Math.max(0.5, LASER.telegraphFront - tgd.mesh.position.z)) < 1e-6
  && Math.abs((tgd.telegraph.position.z - tgd.telegraph.scale.y / 2) - tgd.mesh.position.z) < 1e-6
  && Math.abs((tgd.telegraph.position.z + tgd.telegraph.scale.y / 2) - LASER.telegraphFront) < 1e-6,
  `sy=${tgd.telegraph.scale.y.toFixed(2)} z=${tgd.telegraph.position.z.toFixed(2)}`);
// opacity stays clamped (photosensitivity): bounded ABOVE by peak AND below by a
// nonzero floor (0.2×peak) — a calm shimmer that never strobes to black
let tgMax = 0, tgMin = 1;
for (let i = 0; i < 40; i++) { tgm.update(0.016, SPEED.base, i * 0.05, 0, { onBeat: false, shipInvuln: 0, waterY: WY }); if (tgd.fire.state === 'charging') { tgMax = Math.max(tgMax, tgd.telegraph.material.opacity); tgMin = Math.min(tgMin, tgd.telegraph.material.opacity); } }
ok('tell opacity clamped both ends — no strobe', tgMax <= LASER.telegraphOpacity + 1e-9 && tgMin >= LASER.telegraphOpacity * 0.2 - 1e-9, `min=${tgMin.toFixed(3)} max=${tgMax.toFixed(3)} peak=${LASER.telegraphOpacity}`);

// default branch: omit waterY -> falls back to WATER.y (the value index.js feeds
// from grid.water.position.y, which is set to WATER.y); covers the ?? default.
const tgDef = droneInRange();
const tgDefD = tgDef.entities[0];
tgDef.update(0.016, SPEED.base, 0.1, 0, { onBeat: true, shipInvuln: 0 });
ok('tell uses WATER.y when waterY omitted (default branch)', tgDefD.telegraph.visible === true && Math.abs(tgDefD.telegraph.position.y - (WATER.y + LASER.telegraphLift)) < 1e-6, `y=${tgDefD.telegraph.position.y}`);

// honest lane: once a charging drone scrolls PAST the front, no tell is drawn
const tgPast = droneInRange();
const tgPastD = tgPast.entities[0];
tgPast.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 0, waterY: WY }); // -> charging (in range)
tgPastD.mesh.position.z = LASER.telegraphFront + 2;                                  // scrolled past the player
tgPast.update(0.016, SPEED.base, 0, 0, { onBeat: false, shipInvuln: 0, waterY: WY }); // still charging, now past front
ok('no tell once a charging drone passes the front', tgPastD.fire.state === 'charging' && tgPastD.telegraph.visible === false && tgPastD.telegraphing === false, `state=${tgPastD.fire.state} z=${tgPastD.mesh.position.z.toFixed(1)}`);

const tgf = droneInRange();
const tgfd = tgf.entities[0];
tgf.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 0, waterY: WY }); // charge
tgf.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 0, waterY: WY }); // fire
ok('firing: real beam on, water tell off', tgfd.fire.state === 'firing' && tgfd.laser.visible === true && tgfd.telegraph.visible === false && tgfd.telegraphing === false);
for (let i = 0; i < 20; i++) tgf.update(0.05, SPEED.base, 1 + i, 0, { onBeat: false, shipInvuln: 0, waterY: WY }); // let firing expire
ok('idle: real beam + tell both cleared', tgfd.fire.state === 'idle' && tgfd.laser.visible === false && tgfd.telegraph.visible === false && tgfd.telegraph.material.opacity === 0);

// death leak: dying mid-charge runs drift() (not update()) — the tell must still clear
const tgDeath = droneInRange();
const tgDeathD = tgDeath.entities[0];
tgDeath.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 0, waterY: WY }); // charging, tell up
ok('precondition: tell visible before death', tgDeathD.telegraph.visible === true);
tgDeath.drift(0.016, 0.03); // the death sequence path
ok('death drift clears the lane-tell (no frozen glow)', tgDeathD.telegraph.visible === false && tgDeathD.telegraph.material.opacity === 0 && tgDeathD.telegraphing === false);

// reset() mid-charge clears the tell and returns the drone to its pool
const tgReset = droneInRange();
const tgResetD = tgReset.entities[0];
tgReset.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 0, waterY: WY }); // charging, tell up
tgReset.reset();
ok('reset() mid-charge clears the tell + pools the drone', tgReset.entities.length === 0 && tgResetD.telegraph.visible === false && tgResetD.telegraph.material.opacity === 0);

// recycle hygiene: a drone SHOT mid-charge (destroy -> _releaseEntity) must not leave a glow
const tgr = droneInRange();
const tgrd = tgr.entities[0];
tgr.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 0, waterY: WY }); // charging, tell up
ok('precondition: tell visible before kill', tgrd.telegraph.visible === true);
tgr.destroy(tgrd); // shot mid-charge
ok('killed mid-charge clears the stray tell', tgr.entities.length === 0 && tgrd.telegraph.visible === false && tgrd.telegraph.material.opacity === 0);
const tgCreated = tgr.pools.drone.created;
tgr.spawn({ type: 'enemy', subtype: 'drone', x: 0, aggression: 0.5 });
ok('recycled drone: pooled tell reused (no realloc) + clean', tgr.pools.drone.created === tgCreated && tgr.entities[0].telegraph.visible === false && tgr.entities[0].telegraph.material.opacity === 0);

console.log('\n# data-driven entity system (Phase 0)');
const em2 = new EntityManager(fakeScene);
// explicit {type:'entity', def} form spawns the right kind
em2.spawn({ type: 'entity', def: 'cube', x: 0 });
ok('explicit {type:entity,def} spawns', em2.entities.length === 1 && em2.entities[0].defKey === 'cube');
// the whole point: a BRAND-NEW enemy is pure config — no engine change
em2.defs.testdrifter = {
  move: 'driftDown', shootable: true, death: 'mini',
  build(M) { const g = new THREE.Group(); g.add(new THREE.Mesh(M.geoCube, M.matCube)); g.visible = false; M.group.add(g); return { type: 'testdrifter', mesh: g, hx: 0.4, hy: 0.4, hz: 0.4, nearMissed: false, shootable: true, laser: null, spin: null }; },
  init(r, ev) { r.mesh.position.set(ev.x, 3, SPEED.spawnZ); },
};
em2.spawn({ type: 'entity', def: 'testdrifter', x: 0 });
const blob = em2.entities[em2.entities.length - 1];
const y0 = blob.mesh.position.y;
em2.update(0.1, SPEED.base, 0, 0);
ok('new def: pooled + moves via library behaviour', blob.defKey === 'testdrifter' && !!em2.pools.testdrifter && blob.mesh.position.y < y0 && blob.mesh.position.z > SPEED.spawnZ);
ok('behaviour library present', ['approach', 'weave', 'track', 'spiral', 'seek', 'barrier', 'hover', 'tumble', 'spin', 'driftDown'].every((b) => typeof BEHAVIOURS[b] === 'function'));

console.log('\n# ship barrel roll (Phase 1)');
const ship = new Ship(fakeScene);
ship.reset();
ship.update(1 / 60, 0, 0, 1, 0); // press E -> roll right
ok('roll starts + deflect i-frames', ship.rollState === 'active' && ship.invuln > 0);
ok('not rollReady during roll', ship.rollReady === false);
let maxRoll = 0;
for (let i = 0; i < 10; i++) { ship.update(1 / 60, 0, 0, 0, i / 60); maxRoll = Math.max(maxRoll, Math.abs(ship.roll)); }
ok('reaches ~90° sideways', maxRoll > 1.3, `maxRoll=${maxRoll.toFixed(2)}`);
ship.roll = Math.PI / 2; // rolled: hitbox transposes (pure swap, no scale)
const hbR = ship.hitbox();
ok('rolled hitbox transposes', hbR.hx === SHIP.half[1] && hbR.hy === SHIP.half[0] && hbR.hz === SHIP.half[2]);
ship.roll = 0;
const hbL = ship.hitbox();
ok('level hitbox normal', hbL.hx === SHIP.half[0] && hbL.hy === SHIP.half[1]);
for (let i = 0; i < 60; i++) ship.update(1 / 60, 0, 0, 0, i / 60); // finish + cooldown
ok('roll completes -> ready again', ship.rollState === 'idle' && ship.roll === 0 && ship.rollReady === true);
ok('iframes < active (recover window exists)', ROLL.iframes < ROLL.active);

console.log('\n# fly-through gates (Phase 3)');
const gm = new EntityManager(fakeScene);
gm.spawn({ type: 'entity', def: 'gate', x: 0, y: 1.5 });
const gate = gm.entities[0];
ok('gate spawns (pass-through, gate flag)', gate.defKey === 'gate' && gate.shootable === false && gate.def.gate === true);
ok('no resolve before crossing the ship plane', gm.checkGates(0, 1.5).passed === 0 && gate.passed === false);
gate.mesh.position.z = 0.5; // crossed the ship plane, ship aligned in X+Y
ok('aligned cross -> pass', gm.checkGates(0, 1.5).passed === 1 && gate.passed === true);
ok('pass is latched (resolves once)', gm.checkGates(0, 1.5).passed === 0);
gm.spawn({ type: 'entity', def: 'gate', x: 0, y: 1.5 });
const gate2 = gm.entities[gm.entities.length - 1];
gate2.mesh.position.set(0, 1.5, 0.5);
ok('flew over the ring (Y) -> miss', gm.checkGates(0, 4.0).missed === 1 && gate2.missed === true);
gm.entities.forEach((e) => { e.mesh.position.z = 0; }); // overlap the ship
ok('gates never lethal (checkShip skips them)', checkShip({ x: 0, y: 1.5, z: 0, hx: 0.7, hy: 0.45, hz: 0.75 }, gm.entities).hit === null);

console.log('\n# notation roster (Phase 4)');
const rm = new EntityManager(fakeScene);
const glyphs = ['treble_clef', 'fermata', 'rest', 'staccato', 'trill'];
for (const def of glyphs) rm.spawn({ type: 'entity', def, x: 0, y: 1.5 });
ok('all 5 glyphs spawn with own pools', rm.entities.length === 5 && glyphs.every((d) => !!rm.pools[d] && rm.entities.some((e) => e.defKey === d)));
ok('treble_clef is 3 hp', rm.entities.find((e) => e.defKey === 'treble_clef').hp === 3);
const rest = rm.entities.find((e) => e.defKey === 'rest');
rest.mesh.position.z = -30; // in range so a beat can arm it
rm.update(0.1, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 0, playerY: 1.5 });
ok('roster updates ok + rest arms on a beat in range', rm.entities.length === 5 && rest.armed === true);
const treble = rm.entities.find((e) => e.defKey === 'treble_clef');
ok('treble spirals in the upper lanes', treble.mesh.position.y > 2.0);
rm.reset();

console.log('\n# overhead hazards (vertical tradeoff)');
const om = new EntityManager(fakeScene);
om.spawn({ type: 'entity', def: 'pillar_ceiling', x: 0, size: 1.2, height: 3.0 });
const ceilP = om.entities[0];
ok('ceiling pillar pooled as its own def', ceilP.defKey === 'pillar_ceiling' && !!om.pools.pillar_ceiling);
ok('ceiling pillar hangs from above (top at the ceiling)', Math.abs((ceilP.mesh.position.y + ceilP.hy) - CEILING.y) < 1e-6, `topY=${(ceilP.mesh.position.y + ceilP.hy).toFixed(2)}`);
ok('ceiling pillar reaches below maxY (contests the top lane)', ceilP.mesh.position.y - ceilP.hy < SHIP.maxY, `bottomY=${(ceilP.mesh.position.y - ceilP.hy).toFixed(2)}`);
ok('ceiling pillar is dodge-only (not shootable)', ceilP.shootable === false);
// a ship parked at the ceiling is no longer safe — it collides with the
// overhead pillar in its column (top lane is contested, not free).
ceilP.mesh.position.z = 0;
const highShip = { x: 0, y: SHIP.maxY, z: 0, hx: SHIP.half[0], hy: SHIP.half[1], hz: SHIP.half[2] };
ok('high-flying ship hits overhead pillar', checkShip(highShip, om.entities).hit !== null);
// ...but the overhead pillar leaves the low lane clear (a real tradeoff)
const lowShip = { x: 0, y: SHIP.minY, z: 0, hx: SHIP.half[0], hy: SHIP.half[1], hz: SHIP.half[2] };
ok('low lane is clear under the overhead pillar', checkShip(lowShip, om.entities).hit === null);
om.reset();

console.log('\n# accel lunge (Phase 2)');
ship.reset();
ship.targetZ = -2;
for (let i = 0; i < 30; i++) ship.update(1 / 60, 0, 0, 0, i / 60);
ok('accel lunges craft forward (−Z); hitbox follows', ship.z < -1.2 && Math.abs(ship.hitbox().z - ship.z) < 1e-6);
ship.reset();
ok('reset zeroes the lunge', ship.z === 0 && ship.targetZ === 0);

console.log('\n# bullet pooling');
const bm = new BulletManager(fakeScene);
ok('fire spawns bullet', bm.fire(1.0, { x: 0, z: 0 }) === true && bm.bullets.length === 1);
ok('rate limit blocks rapid fire', bm.fire(1.05, { x: 0, z: 0 }) === false);
bm.bullets[0].position.z = -200; // past kill plane
bm.update(0.016, { entities: [] }, () => {});
ok('bullet recycled past kill plane', bm.bullets.length === 0 && bm.pool._free.length === 1);
bm.fire(2.0, { x: 0, z: 0 });
ok('bullet reuses pool', bm.pool.created === 1, `created=${bm.pool.created}`);

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
