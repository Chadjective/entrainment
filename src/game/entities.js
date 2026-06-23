// ============================================================================
// System 7 — Obstacles & enemies + spawn manager (pooled — System 14).
//   - Grid pillars: dodge-only, indestructible (unit-box geometry scaled per
//     spawn so even variable-size pillars recycle).
//   - Data cubes: shootable, scatter into mini-cubes.
//   - Sentinel drones: shootable, track the player, laser preview.
// Geometry + entity materials are built ONCE and shared. Meshes are recycled
// through pools (acquire/hide) instead of allocate/dispose, so a full run adds
// no per-spawn GC pressure. Only per-particle debris owns its own material
// (because its opacity fades independently); those recycle too.
// ============================================================================

import * as THREE from 'three';
import { SPEED, COLORS, LASER } from '../core/config.js';
import { Pool } from '../core/pool.js';

export class EntityManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.entities = []; // active hazards (collide)
    this.debris = [];   // mini-cubes + explosion particles (no collision)
    this.laserHit = false; // set when a drone beam catches the player this frame

    this._buildSharedResources();

    this.pillarPool = new Pool(() => this._makePillar());
    this.cubePool = new Pool(() => this._makeCube());
    this.dronePool = new Pool(() => this._makeDrone());
    this.miniPool = new Pool(() => this._makeDebris(this.geoMini, COLORS.cube));
    this.particlePool = new Pool(() => this._makeDebris(this.geoParticle, 0xffffff));
  }

  _buildSharedResources() {
    // geometries (unit box for pillars: scaled per spawn)
    this.geoUnitBox = new THREE.BoxGeometry(1, 1, 0.8);
    this.geoCube = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    this.geoDrone = new THREE.ConeGeometry(0.4, 1.2, 4);
    this.geoMini = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    this.geoParticle = new THREE.SphereGeometry(0.08, 6, 6);
    this.edgesUnitBox = new THREE.EdgesGeometry(this.geoUnitBox);
    this.edgesCube = new THREE.EdgesGeometry(this.geoCube);
    this.edgesDrone = new THREE.EdgesGeometry(this.geoDrone);
    this.geoLaser = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1.5, 12),
    ]);

    // shared entity materials (constant color/opacity — safe to share)
    this.matPillar = new THREE.MeshPhongMaterial({ color: COLORS.pillar, emissive: 0xff1133, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
    this.matPillarWire = new THREE.LineBasicMaterial({ color: COLORS.pillar, transparent: true, opacity: 0.9 });
    this.matCube = new THREE.MeshPhongMaterial({ color: COLORS.cube, emissive: COLORS.cube, emissiveIntensity: 0.35, transparent: true, opacity: 0.85 });
    this.matCubeWire = new THREE.LineBasicMaterial({ color: COLORS.cube, transparent: true, opacity: 0.9 });
    this.matDrone = new THREE.MeshPhongMaterial({ color: COLORS.droneFill, emissive: 0xff2200, emissiveIntensity: 0.5, transparent: true, opacity: 0.9 });
    this.matDroneWire = new THREE.LineBasicMaterial({ color: COLORS.drone, transparent: true, opacity: 0.9 });
    this.matLaser = new THREE.LineBasicMaterial({ color: COLORS.droneFill, transparent: true, opacity: 0.3 });
  }

  // ---- pool factories ----------------------------------------------------
  _makePillar() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.geoUnitBox, this.matPillar));
    g.add(new THREE.LineSegments(this.edgesUnitBox, this.matPillarWire));
    g.visible = false;
    this.group.add(g);
    return { type: 'pillar', mesh: g, hx: 0, hy: 0, hz: 0.4, nearMissed: false, shootable: false, laser: null, spin: null };
  }

  _makeCube() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.geoCube, this.matCube));
    g.add(new THREE.LineSegments(this.edgesCube, this.matCubeWire));
    g.visible = false;
    this.group.add(g);
    return { type: 'cube', mesh: g, hx: 0.45, hy: 0.45, hz: 0.45, nearMissed: false, shootable: true, laser: null, spin: new THREE.Vector3(), offset: 0 };
  }

  _makeDrone() {
    const g = new THREE.Group();
    const fill = new THREE.Mesh(this.geoDrone, this.matDrone);
    const wire = new THREE.LineSegments(this.edgesDrone, this.matDroneWire);
    fill.rotation.x = Math.PI / 2; // point toward +Z (the player)
    wire.rotation.x = Math.PI / 2;
    // per-drone laser material so the telegraph/fire can flare independently
    const laser = new THREE.Line(this.geoLaser, new THREE.LineBasicMaterial({ color: COLORS.droneFill, transparent: true, opacity: 0 }));
    laser.visible = false;
    g.add(fill, wire, laser);
    g.visible = false;
    this.group.add(g);
    return {
      type: 'drone', mesh: g, laser, hx: 0.4, hy: 0.4, hz: 0.6, nearMissed: false, shootable: true,
      aggression: 0.5, fast: false, offset: 0, spin: null,
      fire: { state: 'idle', t: 0, hitDone: false, cooldown: 0 },
    };
  }

  // debris owns its own material (opacity fades per-instance)
  _makeDebris(geo, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    this.group.add(mesh);
    return { mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1, baseOpacity: 1 };
  }

  _poolFor(type) {
    return type === 'pillar' ? this.pillarPool : type === 'cube' ? this.cubePool : this.dronePool;
  }

  // ---- spawning ----------------------------------------------------------
  spawn(ev) {
    if (ev.type === 'obstacle') return this._spawnPillar(ev);
    if (ev.type === 'enemy') return ev.subtype === 'cube' ? this._spawnCube(ev) : this._spawnDrone(ev);
  }

  _spawnPillar(ev) {
    const size = ev.size ?? 1.2;
    const height = ev.height ?? 2.5;
    const r = this.pillarPool.acquire();
    r.mesh.scale.set(size, height, 1); // unit box -> size × height × 0.8
    r.mesh.position.set(ev.x, height / 2, SPEED.spawnZ);
    r.mesh.visible = true;
    r.hx = size / 2; r.hy = height / 2; r.hz = 0.4; r.nearMissed = false;
    this.entities.push(r);
  }

  _spawnCube(ev) {
    const r = this.cubePool.acquire();
    r.mesh.position.set(ev.x, 1.2 + Math.random() * 0.8, SPEED.spawnZ);
    r.mesh.rotation.set(0, 0, 0);
    r.mesh.visible = true;
    r.nearMissed = false;
    r.offset = Math.random() * Math.PI * 2;
    r.spin.set((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04, 0);
    this.entities.push(r);
  }

  _spawnDrone(ev) {
    const r = this.dronePool.acquire();
    r.mesh.position.set(ev.x, 1.5, SPEED.spawnZ);
    r.mesh.visible = true;
    r.laser.visible = false;
    r.laser.material.opacity = 0;
    r.nearMissed = false;
    r.aggression = ev.aggression ?? 0.5;
    r.fast = ev.subtype === 'drone_fast';
    r.offset = Math.random() * Math.PI * 2;
    r.fire.state = 'idle'; r.fire.t = 0; r.fire.hitDone = false; r.fire.cooldown = 0;
    this.entities.push(r);
  }

  // ---- per-frame ---------------------------------------------------------
  // opts: { onBeat:boolean, shipInvuln:number } — drives beat-synced drone fire
  update(delta, speed, time, playerX, opts = {}) {
    const step = delta * 60;
    const onBeat = !!opts.onBeat;
    const shipInvuln = opts.shipInvuln || 0;
    this.laserHit = false;

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      const m = e.mesh;

      if (e.type === 'pillar') {
        m.position.z += (speed + SPEED.pillarBonus) * 60 * delta;
      } else if (e.type === 'cube') {
        m.position.z += (speed + SPEED.pillarBonus) * 60 * delta;
        m.position.x += Math.sin(time + e.offset) * 0.02 * step;
        m.rotation.x += e.spin.x * step;
        m.rotation.y += e.spin.y * step;
      } else {
        this._updateDrone(e, m, delta, step, speed, time, playerX, onBeat, shipInvuln);
      }

      if (m.position.z > SPEED.despawnZ) this._releaseEntity(i);
    }

    this._updateDebris(delta);
  }

  // Gameplay #3 — drone movement + beat-synced beam attack.
  _updateDrone(e, m, delta, step, speed, time, playerX, onBeat, shipInvuln) {
    const f = e.fire;
    const aggSpeed = speed + 0.15 + e.aggression * 0.2;
    m.position.z += aggSpeed * (e.fast ? 1.5 : 1) * 60 * delta;

    // track + wobble only while idle (lane is frozen during charge/fire)
    if (f.state === 'idle') {
      m.position.x += (playerX - m.position.x) * e.aggression * 0.5 * delta;
      m.position.x += Math.sin(time * 3 + e.offset) * 0.03 * step;
      if (f.cooldown > 0) f.cooldown -= delta;
    }

    const inRange = m.position.z > LASER.rangeFar && m.position.z < LASER.rangeNear;
    if (onBeat) {
      if (f.state === 'idle' && f.cooldown <= 0 && inRange) f.state = 'charging'; // lock + telegraph
      else if (f.state === 'charging') { f.state = 'firing'; f.t = LASER.fireWindow; f.hitDone = false; }
    }

    if (f.state === 'firing') {
      f.t -= delta;
      if (!f.hitDone && shipInvuln <= 0 && Math.abs(playerX - m.position.x) < LASER.laneHalf) {
        this.laserHit = true; f.hitDone = true;
      }
      if (f.t <= 0) { f.state = 'idle'; f.cooldown = LASER.cooldown; }
    }

    // beam visuals: dim pulsing telegraph -> bright white fire -> off
    if (f.state === 'charging') {
      e.laser.visible = true;
      e.laser.material.color.set(COLORS.drone);
      e.laser.material.opacity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 18));
    } else if (f.state === 'firing') {
      e.laser.visible = true;
      e.laser.material.color.set(0xffffff);
      e.laser.material.opacity = 1;
    } else {
      e.laser.visible = false;
      e.laser.material.opacity = 0;
    }
  }

  _updateDebris(delta) {
    const step = delta * 60;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.mesh.position.addScaledVector(d.vel, step);
      d.life -= delta;
      d.mesh.material.opacity = Math.max(0, d.life / d.maxLife) * d.baseOpacity;
      if (d.life <= 0) {
        d.mesh.visible = false;
        d._pool.release(d);
        this.debris.splice(i, 1);
      }
    }
  }

  _releaseEntity(index) {
    const e = this.entities[index];
    e.mesh.visible = false;
    this._poolFor(e.type).release(e);
    this.entities.splice(index, 1);
  }

  // ---- destruction (by bullet) ------------------------------------------
  destroy(entity) {
    const pos = entity.mesh.position;
    if (entity.type === 'cube') {
      for (let i = 0; i < 4; i++) this._spawnDebris(this.miniPool, pos, COLORS.cube, 0.9, 0.8, 0.3);
    } else if (entity.type === 'drone') {
      for (let i = 0; i < 8; i++) this._spawnDebris(this.particlePool, pos, COLORS.drone, 1, 0.6, 0.4);
    }
    const idx = this.entities.indexOf(entity);
    if (idx >= 0) this._releaseEntity(idx);
  }

  // System 11 — cyan explosion at the ship on death
  deathBurst(pos) {
    for (let i = 0; i < 10; i++) this._spawnDebris(this.particlePool, pos, COLORS.cyan, 1, 1.0, 0.5);
  }

  _spawnDebris(pool, pos, color, baseOpacity, life, speed) {
    const d = pool.acquire();
    d._pool = pool;
    d.mesh.position.copy(pos);
    d.mesh.material.color.set(color);
    d.mesh.material.opacity = baseOpacity;
    d.mesh.visible = true;
    d.baseOpacity = baseOpacity;
    d.life = life; d.maxLife = life;
    d.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((0.5 + Math.random() * 0.5) * speed);
    this.debris.push(d);
  }

  // slow ambient drift used during the death state
  drift(delta, speed) {
    for (const e of this.entities) e.mesh.position.z += speed * 60 * delta;
    this._updateDebris(delta);
  }

  reset() {
    // return everything to its pool (recycled across runs — no disposal)
    for (const e of this.entities) { e.mesh.visible = false; this._poolFor(e.type).release(e); }
    for (const d of this.debris) { d.mesh.visible = false; d._pool.release(d); }
    this.entities.length = 0;
    this.debris.length = 0;
  }
}
