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
import { SPEED, COLORS } from '../core/config.js';

export const DEFINITIONS = {
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
};

// Map legacy event-map events (obstacle/enemy + subtype) to a definition key.
export function legacyDefKey(ev) {
  if (ev.type === 'obstacle') return 'pillar';
  if (ev.type === 'enemy') return ev.subtype === 'cube' ? 'cube' : 'drone';
  return null;
}
