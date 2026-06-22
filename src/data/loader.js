// ============================================================================
// System 3 — event-map helpers. The AudioEngine already loads (or generates)
// the map; these utilities sample its 60 Hz curves and resolve the active
// section for a given song time.
// ============================================================================

// Sample a 60-values-per-second curve at an arbitrary song time (linear interp).
export function sampleCurve(curve, songTime) {
  if (!curve || curve.length === 0) return 0;
  const idx = songTime * 60;
  const i0 = Math.floor(idx);
  if (i0 < 0) return curve[0];
  if (i0 >= curve.length - 1) return curve[curve.length - 1];
  const frac = idx - i0;
  return curve[i0] * (1 - frac) + curve[i0 + 1] * frac;
}

// Resolve the active section (and its speed) at a given song time.
export function sectionAt(sections, songTime) {
  if (!sections || !sections.length) return { name: 'emergence', speed: 1.0, time: 0 };
  let cur = sections[0];
  for (const s of sections) {
    if (s.time <= songTime) cur = s; else break;
  }
  return cur;
}
