// ============================================================================
// Fjordnacht B2 — "Stillness Is Cover (Held Breath)". A pure, renderer-free
// meter (no three/DOM imports — testable like collision.js). In a calm section,
// holding still & dark fills the meter; past a LATCHED threshold (with
// hysteresis so it never chatters) the player is UNSEEN and drones can't lock.
// A per-cover BUDGET drains while unseen and refills only OUTSIDE calm sections,
// so a single calm passage can't be farmed; coverScale (budget fraction) tapers
// the regen + score payouts toward zero as the budget runs out.
// ============================================================================

import { STILLNESS } from '../core/config.js';

// Pure predicate for "still & dark" — the per-frame condition that fills the
// meter. Lives here (not inline in updatePlaying) so it is headless-testable as
// a truth table. `s` carries the current input + light readings; the caller is
// responsible for passing them (graze/gate light are read one frame stale, which
// is fine for a slow meter). Accel (throttle > 0) is the "loud" verb so it
// breaks stillness; brake/coast (throttle <= 0) is allowed.
export function isStill(calm, s) {
  return calm
    && !s.firing
    && s.steer === 0 && s.vertical === 0 && s.roll === 0
    && s.throttle <= 0
    && s.invuln <= 0
    && s.grazeLevel <= 0 && s.fireLevel < STILLNESS.darkFireMax && s.gateLevel <= 0;
}

export class Stillness {
  constructor() { this.reset(); }

  reset() {
    this.meter = 0;
    this.unseen = false;
    this.budget = STILLNESS.budgetSec;
    this.coverScale = 1;
  }

  // calm: in a low-energy section; still: inputs neutral AND gone dark.
  // Returns { meter, unseen, coverScale }.
  step(calm, still, delta) {
    if (calm && still) this.meter = Math.min(1, this.meter + delta / STILLNESS.fillSec);
    else this.meter = Math.max(0, this.meter - delta / STILLNESS.drainSec);

    // latched threshold with hysteresis: enter at hideThreshold, exit only once
    // the meter falls a full hideHysteresis below it (no edge flicker).
    if (!this.unseen && this.meter >= STILLNESS.hideThreshold) this.unseen = true;
    else if (this.unseen && this.meter < STILLNESS.hideThreshold - STILLNESS.hideHysteresis) this.unseen = false;
    if (!calm) this.unseen = false; // cover never carries into a loud section

    // budget drains while unseen; refills only outside calm (you must survive
    // the loud half to recharge cover). coverScale tapers the payouts.
    if (this.unseen) this.budget = Math.max(0, this.budget - delta);
    else if (!calm) this.budget = Math.min(STILLNESS.budgetSec, this.budget + STILLNESS.budgetRefill * delta);
    this.coverScale = STILLNESS.budgetSec > 0 ? this.budget / STILLNESS.budgetSec : 0;

    return { meter: this.meter, unseen: this.unseen, coverScale: this.coverScale };
  }

  // Reward rates (pure, budget-tapered) — applied by the orchestrator.
  // Shield-regen accumulation multiplier (1 when seen; up to regenMult unseen).
  regenRate() { return this.unseen ? 1 + (STILLNESS.regenMult - 1) * this.coverScale : 1; }
  // Flat calm score/sec while unseen (0 when seen or budget spent).
  scoreRate() { return this.unseen ? STILLNESS.pointsPerSec * this.coverScale : 0; }
}
