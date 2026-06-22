// ============================================================================
// System 6 — Ship: angular spacecraft from primitives, lerped steering with
// banking, hover bob, pulsing engine glow. The ship stays at Z=0; the world
// moves toward it.
// ============================================================================

import * as THREE from 'three';
import { SHIP, COLORS } from '../core/config.js';

export class Ship {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.set(...SHIP.startPos);
    scene.add(this.group);

    this.x = 0;
    this.targetX = 0;
    this.glows = [];
    this.flash = 0; // beat-accent glow boost, decays over 150ms

    this._build();
  }

  _build() {
    // fuselage — cone pointing forward (-Z)
    const fuse = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 2.5, 4),
      new THREE.MeshPhongMaterial({ color: 0x151530, emissive: 0x0a0a20, specular: 0x4444ff, shininess: 120 }),
    );
    fuse.rotation.x = -Math.PI / 2;
    this.group.add(fuse);

    // wings — extruded flat delta shape
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.6);
    shape.lineTo(1.3, 0.7);
    shape.lineTo(0.9, 0.9);
    shape.lineTo(0, -0.2);
    shape.lineTo(-0.9, 0.9);
    shape.lineTo(-1.3, 0.7);
    shape.lineTo(0, -0.6);
    const wingGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
    const wings = new THREE.Mesh(
      wingGeo,
      new THREE.MeshPhongMaterial({ color: 0x1a1a3a, emissive: 0x080828, specular: 0x2222ff, shininess: 80 }),
    );
    wings.rotation.x = Math.PI / 2;
    wings.position.set(0, 0, 0.2);
    this.group.add(wings);

    // wing neon edges (V shape)
    const edgeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.3, 0, 0.9), new THREE.Vector3(0, 0, -0.2),
      new THREE.Vector3(0, 0, -0.2), new THREE.Vector3(1.3, 0, 0.9),
    ]);
    this.group.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.8 })));

    // engines + glow
    for (const sx of [-0.7, 0.7]) {
      const eng = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.15, 0.4, 8),
        new THREE.MeshBasicMaterial({ color: COLORS.cyan }),
      );
      eng.rotation.x = Math.PI / 2;
      eng.position.set(sx, 0, 0.9);
      this.group.add(eng);

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 8),
        new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.6 }),
      );
      glow.position.set(sx, 0, 1.1);
      this.group.add(glow);
      this.glows.push(glow);
    }
  }

  // steerDir: -1 left, +1 right, 0 none
  update(delta, steerDir, time) {
    this.targetX += steerDir * SHIP.steerSpeed * delta;
    this.targetX = Math.max(-SHIP.clampX, Math.min(SHIP.clampX, this.targetX));
    this.x += (this.targetX - this.x) * SHIP.lerp * delta;
    this.x = Math.max(-SHIP.clampX, Math.min(SHIP.clampX, this.x));

    this.group.position.x = this.x;
    this.group.position.y = SHIP.startPos[1] + Math.sin(time * SHIP.bobFreq) * SHIP.bobAmp;
    this.group.rotation.z = -(this.targetX - this.x) * SHIP.bankFactor;

    this.flash = Math.max(0, this.flash - delta / 0.15);
    const scale = 0.7 + Math.sin(time * 8) * 0.3;
    for (const g of this.glows) {
      g.scale.setScalar(scale);
      g.material.opacity = Math.min(1, 0.4 + (scale - 0.7) * 0.43 + this.flash * 0.6);
    }
  }

  // beat accent — flash engine glow (System 10A)
  pulseGlow() {
    this.flash = 1;
  }

  get position() { return this.group.position; }

  hitbox() {
    return {
      x: this.group.position.x, y: this.group.position.y, z: 0,
      hx: SHIP.half[0], hy: SHIP.half[1], hz: SHIP.half[2],
    };
  }

  setVisible(v) { this.group.visible = v; }

  reset() {
    this.x = 0;
    this.targetX = 0;
    this.group.position.set(...SHIP.startPos);
    this.group.rotation.z = 0;
    this.group.visible = true;
  }
}
