// ============================================================================
// System 5 — Grid floor: a reflective "black mirror water" surface (Fjordnacht
// Phase A) with scrolling horizontal lines, fixed vertical lines, translucent
// track walls, starfield, a wireframe sun, and a pyramid monument.
// ============================================================================

import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { GRID, SPEED, COLORS, SCENE, WATER } from '../core/config.js';

export class Grid {
  constructor(scene) {
    this.group = new THREE.Group();
    this.floorGroup = new THREE.Group(); // the part that beat-pulses
    this.group.add(this.floorGroup);
    scene.add(this.group);

    this.tempo = 110;

    // shared materials so effects can recolor / dim the whole grid at once.
    // Grid lines are faint over the water — the water is the dominant surface.
    this.hMaterial = new THREE.LineBasicMaterial({ color: COLORS.gridDim, transparent: true, opacity: 0.5 });
    this.vMaterial = new THREE.LineBasicMaterial({ color: COLORS.gridDim, transparent: true, opacity: WATER.gridOverlayOpacity });
    this.wallMaterial = new THREE.MeshBasicMaterial({ color: COLORS.wall, transparent: true, opacity: 0.15 });
    this.wallEdgeMaterial = new THREE.LineBasicMaterial({ color: COLORS.wall, transparent: true, opacity: 0.6 });

    this._buildWater();
    this._buildHorizontal();
    this._buildVertical();
    this._buildWalls();
    this._buildStars();
    this._buildPyramid();
    this._buildSun();
  }

  // Fjordnacht Phase A — the reflective fjord surface. A Three.js Reflector
  // mirrors the moon, sun, pyramid, stars, hazards, and ship; the scrolling
  // grid lines ride on top (grid-on-water). Auto-falls back to a flat dark
  // plane on small viewports to spare the extra render pass.
  _buildWater() {
    const geo = new THREE.PlaneGeometry(WATER.size[0], WATER.size[1]);
    const useReflector = WATER.reflect && window.innerWidth >= WATER.minWidthForReflect;
    this.waterReflective = false;
    if (useReflector) {
      try {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.water = new Reflector(geo, {
          clipBias: 0.003,
          color: WATER.color,
          textureWidth: Math.min(WATER.textureCap, Math.floor(window.innerWidth * dpr)),
          textureHeight: Math.min(WATER.textureCap, Math.floor(window.innerHeight * dpr)),
        });
        this.waterReflective = true;
      } catch (e) { this.water = null; } // fall through to the flat plane below
    }
    if (!this.water) {
      this.water = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: WATER.fallbackColor }));
    }
    this.water.rotation.x = -Math.PI / 2;       // lie flat, normal up
    this.water.position.set(0, WATER.y, -50);   // just below the grid lines
    this.group.add(this.water);
  }

  _buildHorizontal() {
    this.hLines = [];
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(GRID.vMinX, 0, 0),
      new THREE.Vector3(GRID.vMaxX, 0, 0),
    ]);
    for (let i = 0; i < GRID.hLineCount; i++) {
      const line = new THREE.Line(geo, this.hMaterial);
      line.position.z = GRID.hStart - i * GRID.hSpacing;
      this.hLines.push(line);
      this.floorGroup.add(line);
    }
  }

  _buildVertical() {
    for (let x = GRID.vMinX; x <= GRID.vMaxX; x += GRID.vSpacing) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0, GRID.vStartZ),
        new THREE.Vector3(x, 0, GRID.vEndZ),
      ]);
      this.floorGroup.add(new THREE.Line(geo, this.vMaterial));
    }
  }

  _buildWalls() {
    this.walls = [];
    for (const sign of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 200), this.wallMaterial);
      wall.position.set(sign * GRID.wallX, 0.75, -42);
      this.group.add(wall);
      this.walls.push(wall);

      for (const y of [0.05, 1.45]) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(sign * GRID.wallX, y, GRID.vStartZ),
          new THREE.Vector3(sign * GRID.wallX, y, -120),
        ]);
        this.group.add(new THREE.Line(geo, this.wallEdgeMaterial));
      }
    }
  }

  _buildStars() {
    const positions = new Float32Array(GRID.starCount * 3);
    for (let i = 0; i < GRID.starCount; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * 75;
      positions[i * 3 + 1] = 5 + Math.random() * 60;
      positions[i * 3 + 2] = -90 + Math.random() * 150;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: COLORS.star, size: 0.15, transparent: true, opacity: 0.8 });
    this.group.add(new THREE.Points(geo, mat));
  }

  // Big wireframe pyramid monument on the horizon (synthwave backdrop).
  // fog:false so it reads clearly behind the dynamic fog + the sun.
  _buildPyramid() {
    const H = 34, R = 24;
    const group = new THREE.Group();
    group.position.set(0, 0, -130); // base on the floor, far back
    group.rotation.y = Math.PI / 4; // flat face toward the camera

    const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.magenta, transparent: true, opacity: 0.32, fog: false });
    const bandMat = new THREE.LineBasicMaterial({ color: COLORS.magenta, transparent: true, opacity: 0.14, fog: false });

    // 4 slant edges apex→base + the base square
    const apex = new THREE.Vector3(0, H, 0);
    const corner = (r) => [
      new THREE.Vector3(r, 0, 0), new THREE.Vector3(0, 0, r),
      new THREE.Vector3(-r, 0, 0), new THREE.Vector3(0, 0, -r),
    ];
    const base = corner(R);
    base.forEach((c) => group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([apex, c]), edgeMat)));
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(base), edgeMat));

    // faint horizontal cross-section bands for the classic banded look
    for (let k = 1; k <= 4; k++) {
      const t = k / 5;
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corner(R * (1 - t))), bandMat);
      ring.position.y = H * t;
      group.add(ring);
    }

    this.pyramid = group;
    this.group.add(group);
  }

  _buildSun() {
    const wire = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(8, 1));
    this.sun = new THREE.LineSegments(wire, new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.35, fog: false }));
    this.sun.position.set(0, 8, -100);
    this.group.add(this.sun);
  }

  // --- effects hooks ------------------------------------------------------
  setBrightness(opacity, color) {
    this.hMaterial.opacity = opacity;
    if (color) this.hMaterial.color.copy(color);
  }

  setColor(color) {
    this.vMaterial.color.copy(color);
    this.wallMaterial.color.copy(color);
    this.wallEdgeMaterial.color.copy(color);
  }

  setPulse(scale) {
    this.floorGroup.scale.set(scale, 1, scale);
  }

  // --- per-frame ----------------------------------------------------------
  update(delta, speed) {
    const dz = (speed + SPEED.gridBonus) * 60 * delta;
    for (const line of this.hLines) {
      line.position.z += dz;
      if (line.position.z > GRID.resetZ) line.position.z -= GRID.hLineCount * GRID.hSpacing;
    }
    this.sun.rotation.y += 0.001 * (this.tempo / 80) * delta * 60;
  }

  reset() {
    for (let i = 0; i < this.hLines.length; i++) {
      this.hLines[i].position.z = GRID.hStart - i * GRID.hSpacing;
    }
    this.floorGroup.scale.set(1, 1, 1);
  }
}
