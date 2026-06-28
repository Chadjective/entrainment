// ============================================================================
// Shared game-event generation (System 3). Given a beat grid + sections (+ an
// optional real-energy function), lay obstacles / enemies / effects along the
// beats. Used by both the procedural song and the real-song analyzer so the
// gameplay shape is consistent.
// ============================================================================

const SECTION_DEFS = [
  ['emergence', 1.0], ['awakening', 1.15], ['engagement', 1.25],
  ['breath', 1.0], ['escalation', 1.35], ['apex', 1.5], ['departure', 1.1],
];

export function defaultSections(duration) {
  return SECTION_DEFS.map((s, i) => ({
    time: +(i * (duration / SECTION_DEFS.length)).toFixed(2),
    name: s[0],
    speed: s[1],
  }));
}

// beats: seconds[]; sections: {time,name,speed}[]; rng: ()=>0..1
// opts.energyAt(time)->0..1 blends real loudness into spawn density (optional)
export function generateEvents(beats, sections, rng, opts = {}) {
  const events = [];
  const introBeats = opts.introBeats ?? 8;
  const energyAt = opts.energyAt;

  for (let bi = introBeats; bi < beats.length; bi++) {
    const time = beats[bi];
    const sect = sections.filter((s) => s.time <= time).pop() || sections[0];
    const intensity = sect.speed - 1.0;                  // 0 .. 0.5
    const dense = energyAt ? Math.max(intensity, energyAt(time) * 0.5) : intensity;
    const everyN = dense > 0.3 ? 2 : dense > 0.1 ? 3 : 4;
    if (bi % everyN !== 0) continue;

    const x = +(Math.sin(bi * 0.7) * 6).toFixed(2);
    const roll = rng();
    if (roll < 0.5) {
      events.push({
        time, type: 'obstacle', x,
        size: +(0.8 + rng() * 1.4).toFixed(2),
        height: +(1.5 + rng() * 2.0).toFixed(2),
        persistence: 8,
      });
    } else if (roll < 0.78) {
      events.push({ time, type: 'enemy', subtype: 'cube', x, aggression: 0.3 });
    } else {
      const fast = dense > 0.3 && rng() < 0.4;
      events.push({ time, type: 'enemy', subtype: fast ? 'drone_fast' : 'drone', x, aggression: +(0.4 + intensity).toFixed(2) });
    }

    if (bi % 16 === 0 && dense > 0.1) {
      events.push({ time, type: 'effect', effect: 'screen_shake', intensity: +(0.3 + dense).toFixed(2) });
    }
  }

  sections.forEach((s, i) => {
    if (i === 0) return;
    events.push({ time: s.time, type: 'effect', effect: 'bloom', intensity: 0.6 });
    events.push({ time: s.time, type: 'section', section: s.name });
  });

  // Gate runs (Star Fox rings) — a chain of fly-through gates on a weaving path
  // every ~24 beats. Hazards keep spawning around them (thread-under-fire).
  for (let bi = (opts.introBeats ?? 8) + 12; bi < beats.length - 6; bi += 24) {
    for (let k = 0; k < 4; k++) {
      const b = bi + k * 2;
      if (b >= beats.length) break;
      events.push({
        time: beats[b], type: 'entity', def: 'gate',
        x: +(Math.sin((bi + k) * 0.9) * 5).toFixed(2),
        y: +(1.5 + Math.sin((bi + k) * 1.3) * 1.2).toFixed(2),
      });
    }
  }

  events.sort((a, b) => a.time - b.time);
  return events;
}
