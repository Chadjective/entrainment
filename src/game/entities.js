// ============================================================================
// System 7 — Obstacles & enemies + spawn manager.
//   - Grid pillars: dodge-only, indestructible.
//   - Data cubes: shootable, scatter into mini-cubes.
//   - Sentinel drones: shootable, track the player, laser preview.
// Debris (mini-cubes) and explosion particles are collision-free.
// ============================================================================

import * as THREE from 'three';
import { SPEED, COLORS } from '../core/config.js';

let _id = 0;

export class EntityManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.entities = []; // active hazards (collide)
    this.debris = [];   // mini-cubes + explosion particles (no collision)
  }

  // ---- spawning ----------------------------------------------------------
  spawn(ev) {
    if (ev.type === 'obstacle') return this._spawnPillar(ev);
    if (ev.type === 'enemy') return this._spawnEnemy(ev);
  }

  _spawnPillar(ev) {
    const size = ev.size ?? 1.2;
    const height = ev.height ?? 2.5;
    const g = new THREE.Group();
    const box = new THREE.BoxGeometry(size, height, 0.8);
    const fill = new THREE.Mesh(box, new THREE.MeshPhongMaterial({
      color: COLORS.pillar, emissive: 0xff1133, emissiveIntensity: 0.4, transparent: true, opacity: 0.85,
    }));
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: COLORS.pillar, transparent: true, opacity: 0.9 }));
    g.add(fill, wire);
    g.position.set(ev.x, height / 2, SPEED.spawnZ);
    this.group.add(g);
    this.entities.push({ id: _id++, type: 'pillar', mesh: g, hx: size / 2, hy: height / 2, hz: 0.4, nearMissed: false });
  }

  _spawnEnemy(ev) {
    if (ev.subtype === 'cube') return this._spawnCube(ev);
    return this._spawnDrone(ev);
  }

  _spawnCube(ev) {
    const box = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const g = new THREE.Group();
    const fill = new THREE.Mesh(box, new THREE.MeshPhongMaterial({
      color: COLORS.cube, emissive: COLORS.cube, emissiveIntensity: 0.35, transparent: true, opacity: 0.85,
    }));
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: COLORS.cube, transparent: true, opacity: 0.9 }));
    g.add(fill, wire);
    g.position.set(ev.x, 1.2 + Math.random() * 0.8, SPEED.spawnZ);
    this.group.add(g);
    this.entities.push({
      id: _id++, type: 'cube', mesh: g, hx: 0.45, hy: 0.45, hz: 0.45, nearMissed: false,
      baseX: ev.x, offset: Math.random() * Math.PI * 2,
      spin: new THREE.Vector3((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04, 0),
      shootable: true,
    });
  }

  _spawnDrone(ev) {
    const fast = ev.subtype === 'drone_fast';
    const cone = new THREE.ConeGeometry(0.4, 1.2, 4);
    const g = new THREE.Group();
    const fill = new THREE.Mesh(cone, new THREE.MeshPhongMaterial({
      color: COLORS.droneFill, emissive: 0xff2200, emissiveIntensity: 0.5, transparent: true, opacity: 0.9,
    }));
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(cone),
      new THREE.LineBasicMaterial({ color: COLORS.drone, transparent: true, opacity: 0.9 }));
    fill.rotation.x = Math.PI / 2; // point toward +Z (the player)
    wire.rotation.x = Math.PI / 2;
    g.add(fill, wire);
    g.position.set(ev.x, 1.5, SPEED.spawnZ);

    // laser preview line (shown when close)
    const laser = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1.5, 12)]),
      new THREE.LineBasicMaterial({ color: COLORS.droneFill, transparent: true, opacity: 0.3 }),
    );
    laser.visible = false;
    g.add(laser);

    this.group.add(g);
    this.entities.push({
      id: _id++, type: 'drone', mesh: g, laser, hx: 0.4, hy: 0.4, hz: 0.6, nearMissed: false,
      aggression: ev.aggression ?? 0.5, fast, offset: Math.random() * Math.PI * 2, shootable: true,
    });
  }

  // ---- per-frame ---------------------------------------------------------
  update(delta, speed, time, playerX) {
    const step = delta * 60;
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
      } else if (e.type === 'drone') {
        const aggSpeed = speed + 0.15 + e.aggression * 0.2;
        m.position.z += aggSpeed * (e.fast ? 1.5 : 1) * 60 * delta;
        m.position.x += (playerX - m.position.x) * e.aggression * 0.5 * delta;
        m.position.x += Math.sin(time * 3 + e.offset) * 0.03 * step;
        // laser preview within 40 units of camera (~z > -33)
        const close = m.position.z > -33;
        e.laser.visible = close;
      }

      if (m.position.z > SPEED.despawnZ) {
        this._dispose(m);
        this.entities.splice(i, 1);
      }
    }

    this._updateDebris(delta);
  }

  _updateDebris(delta) {
    const step = delta * 60;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.mesh.position.addScaledVector(d.vel, step);
      d.life -= delta;
      d.mesh.material.opacity = Math.max(0, d.life / d.maxLife) * d.baseOpacity;
      if (d.life <= 0) {
        this._dispose(d.mesh);
        this.debris.splice(i, 1);
      }
    }
  }

  // System 11 — cyan explosion at the ship on death
  deathBurst(pos) {
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 6),
        new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 1 }),
      );
      mesh.position.copy(pos);
      this.group.add(mesh);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const mag = 0.2 + Math.random() * 0.3;
      this.debris.push({ mesh, baseOpacity: 1, life: 1.0, maxLife: 1.0, vel: dir.multiplyScalar(mag) });
    }
  }

  // ---- destruction (by bullet) ------------------------------------------
  destroy(entity) {
    const pos = entity.mesh.position;
    if (entity.type === 'cube') this._scatterMiniCubes(pos);
    else if (entity.type === 'drone') this._explode(pos);
    this._remove(entity);
  }

  _scatterMiniCubes(pos) {
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshBasicMaterial({ color: COLORS.cube, transparent: true, opacity: 0.9 }),
      );
      mesh.position.copy(pos);
      this.group.add(mesh);
      this.debris.push({
        mesh, baseOpacity: 0.9, life: 0.8, maxLife: 0.8,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3),
      });
    }
  }

  _explode(pos) {
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 6),
        new THREE.MeshBasicMaterial({ color: COLORS.drone, transparent: true, opacity: 1 }),
      );
      mesh.position.copy(pos);
      this.group.add(mesh);
      this.debris.push({
        mesh, baseOpacity: 1, life: 0.6, maxLife: 0.6,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4),
      });
    }
  }

  _remove(entity) {
    const i = this.entities.indexOf(entity);
    if (i >= 0) { this._dispose(entity.mesh); this.entities.splice(i, 1); }
  }

  _dispose(group) {
    this.group.remove(group);
    group.traverse?.((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    if (group.geometry) group.geometry.dispose();
    if (group.material) group.material.dispose();
  }

  // slow ambient drift used during the death state
  drift(delta, speed) {
    for (const e of this.entities) e.mesh.position.z += speed * 60 * delta;
    this._updateDebris(delta);
  }

  reset() {
    for (const e of this.entities) this._dispose(e.mesh);
    for (const d of this.debris) this._dispose(d.mesh);
    this.entities = [];
    this.debris = [];
  }
}
