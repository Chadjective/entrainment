// Verifies object pooling (System 14): spawns recycle meshes instead of
// allocating, pillars scale correctly, debris recycles, reset returns all to
// pools. Imports three (no WebGL needed for geometry/material objects).
//   run:  node test/pool.mjs
import * as THREE from 'three';
import { EntityManager } from '../src/game/entities.js';
import { BulletManager } from '../src/game/bullets.js';
import { SPEED } from '../src/core/config.js';

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
ok('cube pool built 5', em.cubePool.created === 5, `created=${em.cubePool.created}`);

// despawn them all
em.entities.forEach(despawn);
em.update(0.016, SPEED.base, 0, 0);
ok('all cubes recycled', em.entities.length === 0 && em.cubePool._free.length === 5, `free=${em.cubePool._free.length}`);

// wave 2: spawn 5 more -> must REUSE, not allocate
for (let i = 0; i < 5; i++) em.spawn({ type: 'enemy', subtype: 'cube', x: 0 });
ok('wave 2 reuses (no new allocation)', em.cubePool.created === 5, `created=${em.cubePool.created}`);

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
const builtBefore = em.cubePool.created;
em.reset();
ok('reset clears active', em.entities.length === 0 && em.debris.length === 0);
em.spawn({ type: 'enemy', subtype: 'cube', x: 0 });
ok('post-reset reuses pool (no realloc)', em.cubePool.created === builtBefore, `created=${em.cubePool.created} vs ${builtBefore}`);

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
