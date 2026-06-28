// ============================================================================
// Movement behaviour library (data-driven entity system — FEATURE-SPEC Phase 0).
// Each behaviour is a pure function (entity, dt, ctx) that mutates the entity's
// mesh. ctx = { speed, time, playerX, playerY, step, onBeat, shipInvuln, manager }.
// Entity definitions (definitions.js) reference a behaviour BY NAME, so new
// enemies are config, not bespoke update branches.
//
// approach / weave / track migrate the original pillar / cube / drone exactly.
// The rest are library groundwork the notation roster (Phase 4) will use.
// ============================================================================

import { SPEED, LASER, COLORS, SHIP } from '../core/config.js';

const zBonus = (e) => e.def.zBonus ?? SPEED.pillarBonus;

export const BEHAVIOURS = {
  // straight scroll toward the player (grid pillars)
  approach(e, dt, ctx) {
    e.mesh.position.z += (ctx.speed + zBonus(e)) * 60 * dt;
  },

  // scroll + x weave + tumble spin. Params weaveFreq/weaveAmp default to the
  // cube's values (so the cube is unchanged); the trill sets a tighter, faster
  // weave.
  weave(e, dt, ctx) {
    e.mesh.position.z += (ctx.speed + zBonus(e)) * 60 * dt;
    e.mesh.position.x += Math.sin(ctx.time * (e.def.weaveFreq ?? 1) + e.offset) * (e.def.weaveAmp ?? 0.02) * ctx.step;
    if (e.spin) {
      e.mesh.rotation.x += e.spin.x * ctx.step;
      e.mesh.rotation.y += e.spin.y * ctx.step;
    }
  },

  // the REST: silence — creeps almost stationary until a beat arms it in range,
  // then lunges forward fast (ambush that punishes the gap).
  dormantUntilBeat(e, dt, ctx) {
    if (!e.armed) {
      e.mesh.position.z += ctx.speed * 60 * dt * 0.15; // barely moves
      e.mesh.rotation.z = Math.sin(ctx.time * 2 + e.offset) * 0.1;
      if (ctx.onBeat && e.mesh.position.z > -45) e.armed = true;
    } else {
      e.mesh.position.z += (ctx.speed + 0.45) * 60 * dt; // strike
    }
  },

  // STACCATO: short/detached — stuttering dash (move-pause-move) that hops
  // toward the player while dashing.
  blinkDash(e, dt, ctx) {
    e.blinkT = (e.blinkT ?? 0) + dt;
    const dashing = (e.blinkT % 0.4) / 0.4 < 0.5;
    e.mesh.position.z += (ctx.speed + (dashing ? 0.5 : 0)) * 60 * dt;
    if (dashing) e.mesh.position.x += (ctx.playerX - e.mesh.position.x) * 0.05;
    e.mesh.rotation.x += (dashing ? 0.18 : 0.02) * ctx.step;
  },

  // fast scroll + lateral AND vertical player-tracking + wobble; tracking
  // freezes while the beam charges/fires so the telegraphed lane stays honest.
  // Chasing the player's altitude makes climbing no longer a free escape — the
  // drone rises to meet a high flier, then locks (sentinel drones).
  track(e, dt, ctx) {
    const aggSpeed = ctx.speed + 0.15 + e.aggression * 0.2;
    e.mesh.position.z += aggSpeed * (e.fast ? 1.5 : 1) * 60 * dt;
    if (!e.fire || e.fire.state === 'idle') {
      e.mesh.position.x += (ctx.playerX - e.mesh.position.x) * e.aggression * 0.5 * dt;
      e.mesh.position.x += Math.sin(ctx.time * 3 + e.offset) * 0.03 * ctx.step;
      e.mesh.position.y += ((ctx.playerY ?? 1.5) - e.mesh.position.y) * e.aggression * LASER.trackY * dt;
      e.mesh.position.y = Math.max(SHIP.minY, Math.min(SHIP.maxY, e.mesh.position.y));
      if (e.fire && e.fire.cooldown > 0) e.fire.cooldown -= dt;
    }
  },

  // fly-through gate: scroll toward the player, slow self-spin, brighten on
  // approach (telegraphs the pass window). Per-instance material (e.ring).
  gate(e, dt, ctx) {
    e.mesh.position.z += (ctx.speed + zBonus(e)) * 60 * dt;
    e.mesh.rotation.z += 0.4 * dt;
    if (!e.passed && !e.missed) {
      const near = Math.max(0, Math.min(1, (e.mesh.position.z + 35) / 35));
      e.ring.material.opacity = 0.55 + near * 0.45;
    }
  },

  // ---- library groundwork (used by the notation roster, Phase 4) ----------
  // scroll + spin in place (e.g. time-signature, sharp)
  spin(e, dt, ctx) {
    e.mesh.position.z += (ctx.speed + zBonus(e)) * 60 * dt;
    e.mesh.rotation.z += (e.def.spinRate ?? 0.05) * ctx.step;
  },

  // scroll + end-over-end tumble (drifting glyphs)
  tumble(e, dt, ctx) {
    e.mesh.position.z += (ctx.speed + zBonus(e)) * 60 * dt;
    e.mesh.rotation.x += (e.def.tumbleRate ?? 0.03) * ctx.step;
  },

  // scroll while orbiting a point — the treble-clef "spiral in"
  spiral(e, dt, ctx) {
    e.mesh.position.z += (ctx.speed + zBonus(e)) * 60 * dt;
    e.angle = (e.angle ?? 0) + (e.def.spiralSpeed ?? 3) * dt;
    const r = e.def.spiralRadius ?? 1.4;
    e.mesh.position.x = (e.baseX ?? 0) + Math.cos(e.angle) * r;
    e.mesh.position.y = (e.baseY ?? 1.5) + Math.sin(e.angle) * r;
  },

  // near-stationary hover with a slow bob (the fermata "hold")
  hover(e, dt, ctx) {
    e.mesh.position.z += (ctx.speed + zBonus(e)) * 60 * dt * (e.def.hoverScroll ?? 0.25);
    e.mesh.position.y = (e.baseY ?? 1.5) + Math.sin(ctx.time * 1.5 + e.offset) * 0.25;
  },

  // home in on the player in X and Y while approaching (the Coda)
  seek(e, dt, ctx) {
    e.mesh.position.z += (ctx.speed + zBonus(e)) * 60 * dt;
    const rate = (e.def.seekRate ?? 0.6) * dt;
    e.mesh.position.x += (ctx.playerX - e.mesh.position.x) * rate;
    e.mesh.position.y += ((ctx.playerY ?? 1.5) - e.mesh.position.y) * rate;
  },

  // scroll while sinking (the flat "lower a semitone")
  driftDown(e, dt, ctx) {
    e.mesh.position.z += (ctx.speed + zBonus(e)) * 60 * dt;
    e.mesh.position.y = Math.max(e.def.minY ?? 0.7, e.mesh.position.y - (e.def.sinkRate ?? 0.4) * dt);
  },

  // a long structure that sweeps a band of the field (the Brace lane-denial)
  barrier(e, dt, ctx) {
    e.mesh.position.z += (ctx.speed + zBonus(e)) * 60 * dt;
    e.mesh.position.x = (e.baseX ?? 0) + Math.sin(ctx.time * (e.def.sweepSpeed ?? 0.5) + e.offset) * (e.def.sweepAmp ?? 4);
  },
};

// Attack components — orthogonal to movement, run after the behaviour.
export const ATTACKS = {
  // beat-synced beam: lock lane on a beat (telegraph) → fire on the next beat
  beam(e, dt, ctx) {
    const f = e.fire;
    const m = e.mesh;
    const inRange = m.position.z > LASER.rangeFar && m.position.z < LASER.rangeNear;
    if (ctx.onBeat) {
      if (f.state === 'idle' && f.cooldown <= 0 && inRange) f.state = 'charging';
      else if (f.state === 'charging') { f.state = 'firing'; f.t = LASER.fireWindow; f.hitDone = false; }
    }
    if (f.state === 'firing') {
      f.t -= dt;
      if (!f.hitDone && ctx.shipInvuln <= 0
        && Math.abs(ctx.playerX - m.position.x) < LASER.laneHalf
        && Math.abs((ctx.playerY ?? 1.5) - m.position.y) < LASER.laneHalfY) {
        ctx.manager.laserHit = true; f.hitDone = true;
      }
      if (f.t <= 0) { f.state = 'idle'; f.cooldown = LASER.cooldown; }
    }
    if (f.state === 'charging') {
      e.laser.visible = true;
      e.laser.material.color.set(COLORS.drone);
      e.laser.material.opacity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(ctx.time * 18));
    } else if (f.state === 'firing') {
      e.laser.visible = true;
      e.laser.material.color.set(0xffffff);
      e.laser.material.opacity = 1;
    } else {
      e.laser.visible = false;
      e.laser.material.opacity = 0;
    }
  },
};
