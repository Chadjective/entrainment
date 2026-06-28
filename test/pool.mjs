// Verifies object pooling (System 14): spawns recycle meshes instead of
// allocating, pillars scale correctly, debris recycles, reset returns all to
// pools. Imports three (no WebGL needed for geometry/material objects).
//   run:  node test/pool.mjs
import * as THREE from 'three';
import { EntityManager } from '../src/game/entities.js';
import { BulletManager } from '../src/game/bullets.js';
import { BEHAVIOURS } from '../src/game/behaviours.js';
import { Ship } from '../src/game/ship.js';
import { SPEED, SHIP, ROLL } from '../src/core/config.js';

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
ok('dodged beam misses', d2.laserHit === false);

const d3 = droneInRange();
d3.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 1 });
d3.update(0.016, SPEED.base, 0, 0, { onBeat: true, shipInvuln: 1 });
ok('beam ignored during i-frames', d3.laserHit === false);

const d4 = droneInRange();
d4.update(0.016, SPEED.base, 0, 0, { onBeat: false, shipInvuln: 0 }); // no beat -> no charge
ok('no fire without a beat', d4.entities[0].fire.state === 'idle');

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
