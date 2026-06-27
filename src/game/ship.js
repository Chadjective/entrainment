// ============================================================================
// System 6 — Ship: angular spacecraft from primitives, lerped steering with
// banking, hover bob, pulsing engine glow. The ship stays at Z=0; the world
// moves toward it.
// Gameplay #1: a shield bubble + invulnerability blink. Ship parts live in a
// `body` subgroup so i-frames can blink the hull without hiding the shield.
// ============================================================================

import * as THREE from 'three';
import { SHIP, SHIELD, COLORS } from '../core/config.js';

export class Ship {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.set(...SHIP.startPos);
    scene.add(this.group);

    this.body = new THREE.Group();
    this.group.add(this.body);

    this.x = 0;
    this.targetX = 0;
    this.y = SHIP.startPos[1];       // current vertical position
    this.targetY = SHIP.startPos[1]; // commanded vertical position
    this.glows = [];
    this.flash = 0;        // beat-accent glow boost, decays over 150ms
    this.invuln = 0;       // remaining i-frame seconds
    this.shieldCharges = 0;
    this.shieldFlash = 0;  // brief shield-bubble flare on absorb

    this._build();
  }

  _build() {
    // fuselage — cone pointing forward (-Z)
    const fuse = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 2.5, 4),
      new THREE.MeshPhongMaterial({ color: 0x151530, emissive: 0x0a0a20, specular: 0x4444ff, shininess: 120 }),
    );
    fuse.rotation.x = -Math.PI / 2;
    this.body.add(fuse);

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
    this.body.add(wings);

    // wing neon edges (V shape)
    const edgeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.3, 0, 0.9), new THREE.Vector3(0, 0, -0.2),
      new THREE.Vector3(0, 0, -0.2), new THREE.Vector3(1.3, 0, 0.9),
    ]);
    this.body.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.8 })));

    // engines + glow
    for (const sx of [-0.7, 0.7]) {
      const eng = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.15, 0.4, 8),
        new THREE.MeshBasicMaterial({ color: COLORS.cyan }),
      );
      eng.rotation.x = Math.PI / 2;
      eng.position.set(sx, 0, 0.9);
      this.body.add(eng);

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 8),
        new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.6 }),
      );
      glow.position.set(sx, 0, 1.1);
      this.body.add(glow);
      this.glows.push(glow);
    }

    // shield bubble (sits outside `body` so it doesn't blink with i-frames)
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 16, 12),
      new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.shieldMesh.scale.set(1, 0.8, 1.1);
    this.group.add(this.shieldMesh);
  }

  // steerDir: -1 left/+1 right; vertDir: -1 down/+1 up
  update(delta, steerDir, vertDir, time) {
    this.targetX += steerDir * SHIP.steerSpeed * delta;
    this.targetX = Math.max(-SHIP.clampX, Math.min(SHIP.clampX, this.targetX));
    this.x += (this.targetX - this.x) * SHIP.lerp * delta;
    this.x = Math.max(-SHIP.clampX, Math.min(SHIP.clampX, this.x));

    this.targetY += (vertDir || 0) * SHIP.vertSpeed * delta;
    this.targetY = Math.max(SHIP.minY, Math.min(SHIP.maxY, this.targetY));
    this.y += (this.targetY - this.y) * SHIP.lerp * delta;
    this.y = Math.max(SHIP.minY, Math.min(SHIP.maxY, this.y));

    this.group.position.x = this.x;
    this.group.position.y = this.y + Math.sin(time * SHIP.bobFreq) * SHIP.bobAmp;
    this.group.rotation.z = -(this.targetX - this.x) * SHIP.bankFactor;
    // pitch: nose up while climbing, down while diving
    this.group.rotation.x = Math.max(-0.5, Math.min(0.5, (this.targetY - this.y) * SHIP.pitchFactor));

    // i-frame blink (hull only)
    if (this.invuln > 0) {
      this.invuln = Math.max(0, this.invuln - delta);
      this.body.visible = Math.sin(time * SHIELD.blinkHz * Math.PI * 2) > 0;
    } else {
      this.body.visible = true;
    }

    this.flash = Math.max(0, this.flash - delta / 0.15);
    const scale = 0.7 + Math.sin(time * 8) * 0.3;
    for (const g of this.glows) {
      g.scale.setScalar(scale);
      g.material.opacity = Math.min(1, 0.4 + (scale - 0.7) * 0.43 + this.flash * 0.6);
    }

    // shield bubble
    this.shieldFlash = Math.max(0, this.shieldFlash - delta * 2.5);
    this.shieldMesh.rotation.y += delta * 0.6;
    const base = this.shieldCharges > 0 ? 0.05 + 0.06 * (this.shieldCharges / SHIELD.max) : 0;
    this.shieldMesh.material.opacity = base + this.shieldFlash;
    this.shieldMesh.visible = this.shieldMesh.material.opacity > 0.001;
  }

  // beat accent — flash engine glow (System 10A)
  pulseGlow() {
    this.flash = 1;
  }

  // ---- shield (Gameplay #1) ----
  setShield(charges) { this.shieldCharges = charges; }
  flashShield() { this.shieldFlash = 0.5; }
  startInvuln(t = SHIELD.iframes) { this.invuln = t; }

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
    this.y = SHIP.startPos[1];
    this.targetY = SHIP.startPos[1];
    this.group.position.set(...SHIP.startPos);
    this.group.rotation.set(0, 0, 0);
    this.group.visible = true;
    this.body.visible = true;
    this.invuln = 0;
    this.shieldFlash = 0;
  }
}
