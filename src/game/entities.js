// ============================================================================
// System 7 — Obstacles & enemies + spawn manager (data-driven — FEATURE-SPEC
// Phase 0). Entity kinds are DEFINITIONS (definitions.js); movement is a named
// BEHAVIOUR (behaviours.js). The manager is generic: it builds shared geometry
// /materials once, pools one recycler per definition key, and dispatches
// spawn / update / destroy through the definition — no per-type branches.
// Adding an enemy/obstacle/gate is a definition entry, not new engine code.
//
// Geometry + entity materials are built ONCE and shared; meshes recycle through
// pools (acquire/hide), so a full run adds no per-spawn GC pressure. Only
// per-particle debris owns its own (fading) material; those recycle too.
// ============================================================================

import * as THREE from 'three';
import { SPEED, COLORS, GATE } from '../core/config.js';
import { Pool } from '../core/pool.js';
import { BEHAVIOURS, ATTACKS } from './behaviours.js';
import { DEFINITIONS, legacyDefKey } from './definitions.js';

export class EntityManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.entities = []; // active hazards (collide)
    this.debris = [];   // mini-cubes + explosion particles (no collision)
    this.laserHit = false; // set when a drone beam catches the player this frame

    this.defs = DEFINITIONS;
    this.pools = {}; // def key -> Pool (lazily built)

    this._buildSharedResources();

    // debris pools (shared geometry; per-instance fading material)
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
    // beam fires straight forward (+Z) from the drone; the drone now aligns to
    // the player in BOTH X and Y before firing, so a straight beam aims true.
    this.geoLaser = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 12),
    ]);
    this.geoGateRing = new THREE.TorusGeometry(GATE.ringRadius, GATE.tube, 8, 10); // octagonal ring

    // notation roster glyphs (built ONCE, shared across instances — R9)
    const clefPts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * Math.PI * 4, r = 0.5 * (1 - t * 0.55); clefPts.push(new THREE.Vector3(Math.cos(a) * r, t * 1.6 - 0.8, Math.sin(a) * 0.05)); }
    this.geoTreble = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(clefPts), 40, 0.07, 6, false);
    this.geoFermataDome = new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    this.geoFermataEye = new THREE.SphereGeometry(0.14, 8, 8);
    const restShape = new THREE.Shape();
    restShape.moveTo(-0.18, 0.42); restShape.lineTo(0.16, 0.16); restShape.lineTo(-0.1, 0.05);
    restShape.lineTo(0.16, -0.28); restShape.lineTo(0.04, -0.42); restShape.lineTo(-0.06, -0.42);
    restShape.lineTo(0.06, -0.22); restShape.lineTo(-0.2, 0.0); restShape.lineTo(0.06, 0.12); restShape.lineTo(-0.22, 0.42);
    this.geoRest = new THREE.ExtrudeGeometry(restShape, { depth: 0.08, bevelEnabled: false });
    this.geoStaccato = new THREE.OctahedronGeometry(0.22, 0);
    const trillPts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; trillPts.push(new THREE.Vector3(t * 0.8 - 0.4, Math.sin(t * Math.PI * 4) * 0.12, 0)); }
    this.geoTrill = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trillPts), 24, 0.05, 5, false);
    // warm amber "ink/parchment" family so the notation enemies read as a set
    this.matGlyph = new THREE.MeshPhongMaterial({ color: 0xffd87a, emissive: 0xffa520, emissiveIntensity: 0.9, transparent: true, opacity: 1 });

    // shared entity materials (constant color/opacity — safe to share)
    this.matPillar = new THREE.MeshPhongMaterial({ color: COLORS.pillar, emissive: 0xff1133, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
    this.matPillarWire = new THREE.LineBasicMaterial({ color: COLORS.pillar, transparent: true, opacity: 0.9 });
    // overhead "icicle" pillars — cold blue so they read as hanging from above
    this.matIcicle = new THREE.MeshPhongMaterial({ color: 0x66ccff, emissive: 0x1a5588, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
    this.matIcicleWire = new THREE.LineBasicMaterial({ color: 0xaadfff, transparent: true, opacity: 0.9 });
    this.matCube = new THREE.MeshPhongMaterial({ color: COLORS.cube, emissive: COLORS.cube, emissiveIntensity: 0.35, transparent: true, opacity: 0.85 });
    this.matCubeWire = new THREE.LineBasicMaterial({ color: COLORS.cube, transparent: true, opacity: 0.9 });
    this.matDrone = new THREE.MeshPhongMaterial({ color: COLORS.droneFill, emissive: 0xff2200, emissiveIntensity: 0.5, transparent: true, opacity: 0.9 });
    this.matDroneWire = new THREE.LineBasicMaterial({ color: COLORS.drone, transparent: true, opacity: 0.9 });
  }

  // one pool per definition key, built lazily; the factory attaches def + key
  _pool(key) {
    let p = this.pools[key];
    if (!p) {
      const def = this.defs[key];
      p = this.pools[key] = new Pool(() => {
        const r = def.build(this);
        r.def = def;
        r.defKey = key;
        return r;
      });
    }
    return p;
  }

  // debris owns its own material (opacity fades per-instance)
  _makeDebris(geo, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    this.group.add(mesh);
    return { mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1, baseOpacity: 1 };
  }

  // ---- spawning ----------------------------------------------------------
  // Accepts either the explicit form {type:'entity', def:'cube', ...} or the
  // legacy event-map form {type:'obstacle'|'enemy', subtype, ...}.
  spawn(ev) {
    const key = ev.def || legacyDefKey(ev);
    const def = key && this.defs[key];
    if (!def) return;
    const r = this._pool(key).acquire();
    def.init(r, ev, this);
    r.mesh.visible = true;
    this.entities.push(r);
  }

  // ---- per-frame ---------------------------------------------------------
  // opts: { onBeat:boolean, shipInvuln:number, playerY:number }
  update(delta, speed, time, playerX, opts = {}) {
    const ctx = {
      speed, time, playerX, step: delta * 60,
      playerY: opts.playerY ?? 1.5,
      onBeat: !!opts.onBeat, shipInvuln: opts.shipInvuln || 0,
      manager: this,
    };
    this.laserHit = false;

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      BEHAVIOURS[e.def.move](e, delta, ctx);
      if (e.def.attack) ATTACKS[e.def.attack](e, delta, ctx);
      if (e.mesh.position.z > SPEED.despawnZ) this._releaseEntity(i);
    }

    this._updateDebris(delta);
  }

  // Phase 3 — gate pass-through. A LATCHED half-space test (resolve once when
  // the ring crosses the ship plane), not a thin z-band — tunnel-proof at high
  // boost / low FPS. True 2-D window so flying over a low ring is a real miss.
  // Returns { passed, missed } this frame.
  checkGates(shipX, shipY, shipZ = 0) {
    let passed = 0, missed = 0;
    for (const e of this.entities) {
      if (!e.def.gate || e.passed || e.missed) continue;
      if (e.mesh.position.z >= shipZ) {
        const within = Math.abs(shipX - e.mesh.position.x) < e.radius
          && Math.abs(shipY - e.mesh.position.y) < e.radius;
        if (within) { e.passed = true; passed++; e.ring.material.opacity = 1; }
        else { e.missed = true; missed++; e.ring.material.color.set(GATE.missColor); }
      }
    }
    return { passed, missed };
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
    this._pool(e.defKey).release(e);
    this.entities.splice(index, 1);
  }

  // ---- destruction (by bullet) ------------------------------------------
  destroy(entity) {
    const pos = entity.mesh.position;
    const death = entity.def.death;
    if (death === 'mini') {
      for (let i = 0; i < 4; i++) this._spawnDebris(this.miniPool, pos, COLORS.cube, 0.9, 0.8, 0.3);
    } else if (death === 'explode') {
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
    for (const e of this.entities) { e.mesh.visible = false; this._pool(e.defKey).release(e); }
    for (const d of this.debris) { d.mesh.visible = false; d._pool.release(d); }
    this.entities.length = 0;
    this.debris.length = 0;
  }
}
