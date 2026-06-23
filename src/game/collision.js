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

// How close a non-colliding hazard is inside the graze zone: 1 ≈ about to hit,
// 0 = at the outer edge of the pad. null = colliding or outside the pad.
export function grazeCloseness(s, pad, b) {
  const dx = Math.abs(s.x - b.x), dy = Math.abs(s.y - b.y), dz = Math.abs(s.z - b.z);
  const px = s.hx + pad[0] + b.hx, py = s.hy + pad[1] + b.hy, pz = s.hz + pad[2] + b.hz;
  if (dx >= px || dy >= py || dz >= pz) return null;            // outside pad
  const cx = s.hx + b.hx, cy = s.hy + b.hy, cz = s.hz + b.hz;
  if (dx < cx && dy < cy && dz < cz) return null;               // colliding (a hit)
  // the "blocking" axis (largest gap to the core box) decides closeness
  let gap = -Infinity, span = 1;
  if (dx - cx > gap) { gap = dx - cx; span = px - cx; }
  if (dy - cy > gap) { gap = dy - cy; span = py - cy; }
  if (dz - cz > gap) { gap = dz - cz; span = pz - cz; }
  if (gap <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - gap / span));
}

// Returns { hit, nearMiss, grazeCount, grazeClose } for the ship vs all hazards.
//   hit        -> entity the ship overlapped (death / shield absorb)
//   nearMiss   -> count of NEW first-time grazes this frame (discrete +50 pop)
//   grazeCount -> hazards currently in the graze zone
//   grazeClose -> closeness (0..1) of the tightest current graze
export function checkShip(shipBox, entities) {
  let hit = null;
  let nearMiss = 0;
  let grazeCount = 0;
  let grazeClose = 0;
  for (const e of entities) {
    const box = entityBox(e);
    if (intersects(shipBox, box)) { hit = e; break; }
    const c = grazeCloseness(shipBox, SCORE.nearMissPad, box);
    if (c != null) {
      grazeCount++;
      if (c > grazeClose) grazeClose = c;
      if (!e.nearMissed) { e.nearMissed = true; nearMiss++; }
    }
  }
  return { hit, nearMiss, grazeCount, grazeClose };
}
