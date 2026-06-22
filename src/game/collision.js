// ============================================================================
// System 9 — Collision detection. Axis-aligned bounding-box (AABB) tests for
// ship↔hazard (death + near-miss) and bullet↔enemy.
// Boxes are { x, y, z, hx, hy, hz } (center + half-extents).
// ============================================================================

import { SCORE } from '../core/config.js';

export function intersects(a, b) {
  return Math.abs(a.x - b.x) < a.hx + b.hx
    && Math.abs(a.y - b.y) < a.hy + b.hy
    && Math.abs(a.z - b.z) < a.hz + b.hz;
}

// Box centered on an entity's mesh position using its half-extents.
function entityBox(e) {
  return { x: e.mesh.position.x, y: e.mesh.position.y, z: e.mesh.position.z, hx: e.hx, hy: e.hy, hz: e.hz };
}

// Returns { hit, nearMiss } for the ship against all hazards.
// hit  -> an entity the ship collided with (death)
// nearMiss -> number of new near-miss events this frame
export function checkShip(shipBox, entities) {
  let hit = null;
  let nearMiss = 0;
  const padded = {
    x: shipBox.x, y: shipBox.y, z: shipBox.z,
    hx: shipBox.hx + SCORE.nearMissPad[0],
    hy: shipBox.hy + SCORE.nearMissPad[1],
    hz: shipBox.hz + SCORE.nearMissPad[2],
  };
  for (const e of entities) {
    const box = entityBox(e);
    if (intersects(shipBox, box)) { hit = e; break; }
    if (!e.nearMissed && intersects(padded, box)) {
      e.nearMissed = true;
      nearMiss++;
    }
  }
  return { hit, nearMiss };
}
