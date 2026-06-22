// ============================================================================
// System 8 — Bullets. Cyan projectiles, rate-limited, travel forward (-Z),
// destroy shootable enemies on contact, pass through pillars.
// ============================================================================

import * as THREE from 'three';
import { BULLET, COLORS } from '../core/config.js';
import { intersects } from './collision.js';

export class BulletManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.bullets = [];
    this.lastFire = -1;
    this.geo = new THREE.BoxGeometry(0.08, 0.08, 0.6);
    this.mat = new THREE.MeshBasicMaterial({ color: COLORS.cyan });
  }

  // time in seconds (rate-limited to BULLET.fireIntervalMs)
  fire(time, shipPos) {
    if (time - this.lastFire < BULLET.fireIntervalMs / 1000) return false;
    this.lastFire = time;
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.position.set(shipPos.x, 1.5, shipPos.z + BULLET.spawnZOffset);
    this.group.add(mesh);
    this.bullets.push(mesh);
    return true;
  }

  // moves bullets, resolves bullet↔enemy hits. onKill(entity) handles scoring.
  update(delta, entityManager, onKill) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.position.z -= BULLET.speed * delta;

      let consumed = false;
      const box = { x: b.position.x, y: b.position.y, z: b.position.z, hx: 0.05, hy: 0.05, hz: 0.3 };
      for (const e of entityManager.entities) {
        if (!e.shootable) continue; // pillars pass through
        const ebox = { x: e.mesh.position.x, y: e.mesh.position.y, z: e.mesh.position.z, hx: e.hx, hy: e.hy, hz: e.hz };
        if (intersects(box, ebox)) {
          entityManager.destroy(e);
          onKill(e);
          consumed = true;
          break;
        }
      }

      if (consumed || b.position.z < BULLET.killZ) {
        this.group.remove(b);
        this.bullets.splice(i, 1);
      }
    }
  }

  reset() {
    for (const b of this.bullets) this.group.remove(b);
    this.bullets = [];
    this.lastFire = -1;
  }
}
