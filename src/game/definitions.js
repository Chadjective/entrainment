// ============================================================================
// Entity DEFINITIONS registry (data-driven entity system — FEATURE-SPEC Phase 0).
// Each definition is config: a movement behaviour name, optional attack, flags,
// a build(M) that constructs the pooled mesh from the manager's shared geometry
// /materials, and an init(record, ev, M) for per-spawn state. New enemies/
// obstacles/gates are added here, not as bespoke classes.
//
// pillar / cube / drone are migrated 1:1 from the original bespoke factories.
// ============================================================================

import * as THREE from 'three';
import { SPEED, COLORS, GATE } from '../core/config.js';

export const DEFINITIONS = {
  // Fly-through gate — pass-through (not lethal, not shootable); rewards points
  // + a speed boost + a sequence multiplier. Per-instance material so each ring
  // can glow on approach / flash on pass / redden on miss independently.
  gate: {
    move: 'gate',
    shootable: false,
    death: 'none',
    gate: true,
    build(M) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: GATE.color, transparent: true, opacity: 0.7 });
      const ring = new THREE.Mesh(M.geoGateRing, mat);
      g.add(ring);
      g.visible = false;
      M.group.add(g);
      return { type: 'gate', mesh: g, ring, hx: 0, hy: 0, hz: 0.3, nearMissed: false, shootable: false, radius: GATE.radius, passed: false, missed: false };
    },
    init(r, ev) {
      r.mesh.position.set(ev.x ?? 0, ev.y ?? 1.5, SPEED.spawnZ);
      r.mesh.rotation.set(0, 0, 0);
      r.radius = ev.radius ?? GATE.radius;
      r.passed = false; r.missed = false;
      r.ring.material.color.set(GATE.color);
      r.ring.material.opacity = 0.7;
    },
  },

  // Grid pillar — dodge-only, indestructible, unit box scaled per spawn.
  pillar: {
    move: 'approach',
    shootable: false,
    death: 'none',
    build(M) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(M.geoUnitBox, M.matPillar));
      g.add(new THREE.LineSegments(M.edgesUnitBox, M.matPillarWire));
      g.visible = false;
      M.group.add(g);
      return { type: 'pillar', mesh: g, hx: 0, hy: 0, hz: 0.4, nearMissed: false, shootable: false, laser: null, spin: null };
    },
    init(r, ev) {
      const size = ev.size ?? 1.2;
      const height = ev.height ?? 2.5;
      r.mesh.scale.set(size, height, 1); // unit box -> size × height × 0.8
      r.mesh.position.set(ev.x, height / 2, SPEED.spawnZ);
      r.hx = size / 2; r.hy = height / 2; r.hz = 0.4; r.nearMissed = false;
    },
  },

  // Data cube — shootable, weaves + tumbles, scatters into mini-cubes.
  cube: {
    move: 'weave',
    shootable: true,
    death: 'mini',
    build(M) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(M.geoCube, M.matCube));
      g.add(new THREE.LineSegments(M.edgesCube, M.matCubeWire));
      g.visible = false;
      M.group.add(g);
      return { type: 'cube', mesh: g, hx: 0.45, hy: 0.45, hz: 0.45, nearMissed: false, shootable: true, laser: null, spin: new THREE.Vector3(), offset: 0 };
    },
    init(r, ev) {
      r.mesh.position.set(ev.x, 1.2 + Math.random() * 0.8, SPEED.spawnZ);
      r.mesh.rotation.set(0, 0, 0);
      r.nearMissed = false;
      r.offset = Math.random() * Math.PI * 2;
      r.spin.set((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04, 0);
    },
  },

  // Sentinel drone — shootable, tracks the player, beat-synced beam attack.
  drone: {
    move: 'track',
    attack: 'beam',
    shootable: true,
    death: 'explode',
    build(M) {
      const g = new THREE.Group();
      const fill = new THREE.Mesh(M.geoDrone, M.matDrone);
      const wire = new THREE.LineSegments(M.edgesDrone, M.matDroneWire);
      fill.rotation.x = Math.PI / 2; // point toward +Z (the player)
      wire.rotation.x = Math.PI / 2;
      // per-drone laser material so the telegraph/fire can flare independently
      const laser = new THREE.Line(M.geoLaser, new THREE.LineBasicMaterial({ color: COLORS.droneFill, transparent: true, opacity: 0 }));
      laser.visible = false;
      g.add(fill, wire, laser);
      g.visible = false;
      M.group.add(g);
      return {
        type: 'drone', mesh: g, laser, hx: 0.4, hy: 0.4, hz: 0.6, nearMissed: false, shootable: true,
        aggression: 0.5, fast: false, offset: 0, spin: null,
        fire: { state: 'idle', t: 0, hitDone: false, cooldown: 0 },
      };
    },
    init(r, ev) {
      r.mesh.position.set(ev.x, 1.5, SPEED.spawnZ);
      r.laser.visible = false;
      r.laser.material.opacity = 0;
      r.nearMissed = false;
      r.aggression = ev.aggression ?? 0.5;
      r.fast = ev.subtype === 'drone_fast';
      r.offset = Math.random() * Math.PI * 2;
      r.fire.state = 'idle'; r.fire.t = 0; r.fire.hitDone = false; r.fire.cooldown = 0;
    },
  },

  // ---- Notation roster (Phase 4 first wave) — each is config + a behaviour
  // name; motion reads from both the symbol's meaning and its form. ----

  // Treble clef — form is a spiral, sets the HIGH register: spirals in, patrols
  // the upper lanes. Tanky (3 hp).
  treble_clef: {
    move: 'spiral', shootable: true, hp: 3, death: 'explode',
    spiralSpeed: 3, spiralRadius: 1.3,
    build(M) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(M.geoTreble, M.matGlyph));
      g.scale.setScalar(1.35);
      g.visible = false; M.group.add(g);
      return { type: 'treble_clef', mesh: g, hx: 0.6, hy: 1.1, hz: 0.5, nearMissed: false, shootable: true, hp: 3, baseX: 0, baseY: 3, angle: 0 };
    },
    init(r, ev) { r.mesh.position.set(ev.x, 3.0, SPEED.spawnZ); r.baseX = ev.x; r.baseY = 3.0; r.angle = 0; r.hp = 3; r.nearMissed = false; },
  },

  // Fermata — means "hold", looks like an eye/dome: hovers and watches.
  fermata: {
    move: 'hover', shootable: true, hp: 4, death: 'explode', hoverScroll: 0.25,
    build(M) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(M.geoFermataDome, M.matGlyph));
      const eye = new THREE.Mesh(M.geoFermataEye, M.matGlyph); eye.position.y = -0.02; g.add(eye);
      g.scale.setScalar(1.5);
      g.visible = false; M.group.add(g);
      return { type: 'fermata', mesh: g, hx: 0.75, hy: 0.6, hz: 0.75, nearMissed: false, shootable: true, hp: 4, baseY: 2.0, offset: 0 };
    },
    init(r, ev) { const y = ev.y ?? 2.0; r.mesh.position.set(ev.x, y, SPEED.spawnZ); r.baseY = y; r.offset = Math.random() * Math.PI * 2; r.hp = 4; r.nearMissed = false; },
  },

  // Rest — means silence: dormant until its beat, then strikes.
  rest: {
    move: 'dormantUntilBeat', shootable: true, hp: 1, death: 'mini',
    build(M) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(M.geoRest, M.matGlyph));
      g.scale.setScalar(1.7);
      g.visible = false; M.group.add(g);
      return { type: 'rest', mesh: g, hx: 0.45, hy: 0.72, hz: 0.28, nearMissed: false, shootable: true, hp: 1, armed: false, offset: 0 };
    },
    init(r, ev) { r.mesh.position.set(ev.x, ev.y ?? 1.5, SPEED.spawnZ); r.mesh.rotation.set(0, 0, 0); r.armed = false; r.offset = Math.random() * Math.PI * 2; r.hp = 1; r.nearMissed = false; },
  },

  // Staccato — short/detached: stuttering dash, twitchy chip threat.
  staccato: {
    move: 'blinkDash', shootable: true, hp: 1, death: 'mini',
    build(M) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(M.geoStaccato, M.matGlyph));
      g.scale.setScalar(1.7);
      g.visible = false; M.group.add(g);
      return { type: 'staccato', mesh: g, hx: 0.42, hy: 0.42, hz: 0.42, nearMissed: false, shootable: true, hp: 1, blinkT: 0 };
    },
    init(r, ev) { r.mesh.position.set(ev.x, ev.y ?? 1.5, SPEED.spawnZ); r.mesh.rotation.set(0, 0, 0); r.blinkT = 0; r.hp = 1; r.nearMissed = false; },
  },

  // Trill — rapid oscillation: a tight, fast weave.
  trill: {
    move: 'weave', shootable: true, hp: 2, death: 'mini', weaveFreq: 4, weaveAmp: 0.05,
    build(M) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(M.geoTrill, M.matGlyph));
      g.scale.setScalar(1.6);
      g.visible = false; M.group.add(g);
      return { type: 'trill', mesh: g, hx: 0.7, hy: 0.32, hz: 0.3, nearMissed: false, shootable: true, hp: 2, offset: 0, spin: null };
    },
    init(r, ev) { r.mesh.position.set(ev.x, ev.y ?? 1.5, SPEED.spawnZ); r.offset = Math.random() * Math.PI * 2; r.hp = 2; r.nearMissed = false; },
  },
};

// Map legacy event-map events (obstacle/enemy + subtype) to a definition key.
export function legacyDefKey(ev) {
  if (ev.type === 'obstacle') return 'pillar';
  if (ev.type === 'enemy') return ev.subtype === 'cube' ? 'cube' : 'drone';
  return null;
}
