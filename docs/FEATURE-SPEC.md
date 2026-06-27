# ENTRAINMENT — Movement, Gates & Notation-Enemy Spec

## Overview

This spec set adds five player-facing systems to ENTRAINMENT's fixed-song-clock rail shooter: a **barrel roll** (Q/E) that is a real mechanic — deflect i-frames plus an x↔y-transposed hitbox for threading tall-narrow vertical gaps; an **accelerate/brake** control that modulates only world-scroll feel and the travel speed of already-spawned entities, never the song clock or event spawns; **fly-through gates** that grant points and a decaying boost with a chaining sequence multiplier; a **data-driven entity system** that turns enemy/obstacle/gate authoring from bespoke classes into config; and a **roster of notation enemies** where each glyph maps to a shape, a movement behaviour, and a mechanical role. Throughout, the non-negotiables hold: the fixed song clock (`songTime` drives spawns, never modulated speed), object pooling and zero-GC long runs, photosensitivity restraint (single-ramp flares, no new strobes), and graceful mobile degradation.

## How it fits together

These features have a real build dependency, so the order is not arbitrary. The **data-driven entity system (50)** — a `DEFINITIONS` registry, a single generic pooled `_make(def)` factory, and a named, indexed movement `BEHAVIOURS` library — is the substrate that both the **gates (40)** and the **notation roster (60)** plug into as pure configuration rather than new classes, new pools, and new `update()` branches. Gates become one non-damaging entity def (an `approach`/`spin` ring) plus two feature-specific seams: a dedicated pass-through disc test and chain scoring. Notation enemies become a table of `{glyph → geometry, behaviour, params, role}` rows that add **zero** manager edits. **So build 50 first**: shipping the registry up front means 40 and 60 are authored once, not twice (bespoke then migrated). The **barrel roll (20)** and **accelerate/brake (30)** are largely orthogonal — they live on `Ship` and at the single `gameSpeed` computation site — but they converge on shared channels: the roll reuses the existing `invuln`/i-frame field, and accel/brake plus gate boosts feed **one** `speedAmount` pipeline with one speedometer and one decay curve. Recommended order: 50 (keystone) → roll → accel/brake → gates → roster.

## Design principle: form + meaning

Every notation enemy is designed through a **dual lens**: its behaviour derives from BOTH what the symbol *means* (its musical function) AND what it *looks like* (its silhouette). The roster favours mappings where the two agree, so the motion *reads* as the glyph on sight. A treble clef sets the high register (meaning → patrols the upper lanes) and is a swept spiral (form → spirals inward on entry). A fermata means "hold" (meaning → damps the scroll, a tempo-killer) and is a watching eye-dome (form → hovers and tracks the ship's gaze). A staccato dot is short and detached (meaning → blinks in, stabs, vanishes) and tiny and spiky (form → quick darting hops). Rests mean silence (meaning → dormant until their own beat) and are rigid blocky bars (form → snap stiff, then jab straight). This is the discipline that turns a glyph table into a coherent enemy roster: the symbol's idea and the symbol's shape point at the *same* movement, and the data-driven system makes each one a config row, not a class.


## Barrel Roll (Q/E)

A Star Fox–style 90° sideways roll bound to **Q (left)** and **E (right)**. The roll
spins the ship around its forward (-Z) axis to ±90° with an ease-out snap and a
spring-back recover. It is **not** purely cosmetic: while the roll is active the
ship gains a short **deflect window (i-frames)** *and* its **collision hitbox swaps
x↔y half-extents**, letting a banked ship squeeze through a tall-narrow vertical
gap. This pairs directly with the new Y (up/down) movement — you climb into a slot,
roll to make the ship "thin" horizontally and "tall" vertically, and slip through.

Roll is a **deliberate, cooldown-gated burst**, not a held pose. Tap = one full
roll-and-recover. Holding the key does not re-trigger until the cooldown clears.

### Design decision: mechanic, not just visual

| Option | Verdict |
| --- | --- |
| A. Visual-only (rotate `group.rotation.z`) | Rejected — wastes the input; nothing to master. |
| B. Brief deflect / i-frames (Star Fox) | **Adopted (part 1).** ~0.25s of `invuln` reusing the existing i-frame field. |
| C. Rotated hitbox (swap hx↔hy) | **Adopted (part 2).** Makes the roll *spatially* meaningful with the new Y axis: a 0.6×0.5 footprint becomes 0.5×0.6, threading tall gaps. |

Adopting **B + C together** is the differentiator: the deflect is the "get out of
jail" feel; the rotated hitbox is the skill expression (thread the needle). Both are
gated on the roll being *active*, so they cost a cooldown and can't be spammed.

### Roll state machine (lives on `Ship`)

Add to `src/game/ship.js` constructor (near the `this.invuln` block, lines 21–29):

```js
this.roll = 0;          // current roll angle (radians), lerped toward rollTarget
this.rollTarget = 0;    // 0 or ±SHIP.rollAngle
this.rollDir = 0;       // -1 / 0 / +1, the active roll direction this cycle
this.rollTimer = 0;     // seconds elapsed in the current roll cycle
this.rollCooldown = 0;  // remaining lockout before another roll can start
```

Lifecycle (driven in `Ship.update`, see hook below):

| Phase | Duration | rollTarget | Effect |
| --- | --- | --- | --- |
| **Idle** | — | 0 | hitbox axis-aligned, no i-frames |
| **Spin out** | `0 → SHIP.rollActive` (~0.30s) | ±`rollAngle` | hitbox swapped, `invuln` topped up to `SHIP.rollIframes` |
| **Recover** | `rollActive → rollDuration` (~0.45s) | 0 (spring back) | hitbox swapped only while `|roll| > rollAngle*0.5`; i-frames already decaying |
| **Cooldown** | `rollDuration → +SHIP.rollCooldown` | 0 | input ignored, HUD arc refills |

The **"roll is active"** predicate that both the hitbox swap and i-frame grant key
off is simply `this.rollTimer > 0 && this.rollTimer < SHIP.rollActive` (the fast
spin-out), or more forgivingly `Math.abs(this.roll) > SHIP.rollAngle * 0.5`. Use the
angle test so the swapped hitbox tracks the *visual* — the ship is only "thin" while
it actually looks rolled.

### Input

`src/input/input.js` — add a `getRoll()` reader and an **edge-triggered** helper so a
held key fires exactly one roll. Mirror the existing `getSteer()` style (lines 39–44):

```js
getRoll() {                                  // -1 left (Q), +1 right (E), 0 none
  let r = 0;
  if (this.keys['q'] || this.keys['Q']) r -= 1;
  if (this.keys['e'] || this.keys['E']) r += 1;
  return r;
}
```

Edge-triggering can live either here (track `_rollLatch` and clear on keyup) or in
`Ship` via the `rollCooldown` gate. **Recommend the cooldown gate** — it's already
needed, and it means a player mashing Q can't out-pace the recover. No keydown
handler change is required; `Escape`/space `preventDefault` logic at
`input.js:14–18` is untouched. Optional: add `e.preventDefault()` for `q`/`e` is
unnecessary (no browser default).

**Mobile:** no two-thumb roll on touch. Add a small **double-tap-on-a-side** gesture
later (double-tap the left third → roll left) via `this.touchDir` history in `zone()`
— flagged as an open question, not required for v1.

### Ship animation + recovery

`src/game/ship.js` — change the signature to thread the roll input and run the state
machine. Current `update(delta, steerDir, vertDir, time)` (line 97) becomes:

```js
update(delta, steerDir, vertDir, rollDir, time) {
  // ...existing X/Y lerp (lines 98–106) unchanged...

  // ---- barrel roll ----
  this.rollCooldown = Math.max(0, this.rollCooldown - delta);
  if (this.rollDir === 0 && rollDir !== 0 && this.rollCooldown <= 0) {
    this.rollDir = rollDir;                 // latch a new roll
    this.rollTimer = 0;
    this.rollTarget = rollDir * SHIP.rollAngle;
    this.startInvuln(SHIP.rollIframes);     // reuse existing i-frame field
  }
  if (this.rollDir !== 0) {
    this.rollTimer += delta;
    if (this.rollTimer >= SHIP.rollActive) this.rollTarget = 0;   // begin spring-back
    if (this.rollTimer >= SHIP.rollDuration) {                    // cycle done
      this.rollDir = 0;
      this.rollCooldown = SHIP.rollCooldown;
    }
  }
  this.roll += (this.rollTarget - this.roll) * SHIP.rollLerp * delta;

  this.group.position.x = this.x;
  this.group.position.y = this.y + Math.sin(time * SHIP.bobFreq) * SHIP.bobAmp;
  // bank from steering PLUS the roll spin — additive so a roll mid-turn still reads
  this.group.rotation.z = -(this.targetX - this.x) * SHIP.bankFactor + this.roll;
  // ...pitch (line 112), i-frame blink, glow, shield all unchanged...
}
```

Notes:
- **`group.rotation.z` is shared** with the steering bank (line 110). Add the roll on
  top so the spin composes naturally with a turn. The steering bank is small
  (`bankFactor 1.8` × a fraction); ±π/2 from the roll dominates, as intended.
- The lerp toward `rollTarget` gives a free ease-in/ease-out. `rollLerp ~14` makes the
  spin-out crisp (~0.30s to 90°) and the spring-back snappy.
- **`reset()` (lines 159–170)** must zero the new fields:
  `this.roll = this.rollTarget = this.rollDir = this.rollTimer = this.rollCooldown = 0;`
  (the existing `this.group.rotation.set(0,0,0)` already clears the visual).

### Hitbox swap (the mechanic)

`src/game/ship.js hitbox()` (lines 149–155) reports half-extents from `SHIP.half`
(`[0.6, 0.5, 0.75]`). When rolled, swap x↔y so the box matches the spun mesh:

```js
hitbox() {
  const rolled = Math.abs(this.roll) > SHIP.rollAngle * 0.5;
  const [hx, hy, hz] = SHIP.half;
  return {
    x: this.x, y: this.y, z: 0,
    hx: rolled ? hy : hx,   // 0.5 wide when rolled (was 0.6)
    hy: rolled ? hx : hy,   // 0.6 tall when rolled (was 0.5)
    hz,
  };
}
```

This is the only collision-side change — `src/game/collision.js` stays generic
(`intersects`/`grazeCloseness` already consume `hx/hy/hz`, lines 9–13, 22–35). Because
the ship footprint is nearly square (0.6 vs 0.5), the swap is a **subtle** 0.1-unit
edge, *intentionally* tuned so it's a precision reward, not a free pass. If
playtesting wants a bigger payoff, widen `SHIP.half` x/y asymmetry (e.g. `[0.7,0.4,…]`)
rather than scaling the box during roll — keep the swap a pure transpose.

> **Caveat — graze during roll:** while rolled, the ship is also `invuln` (i-frames),
> and `index.js:258` already gates grazing on `this.ship.invuln <= 0`, so the player
> earns no graze multiplier mid-roll. That's the correct trade: you can't farm graze
> by rolling next to a wall. The swapped hitbox still matters for the *hit/death* test
> at `index.js:262–271`, which does NOT skip during i-frames for the geometry — but
> i-frames mean a hit won't kill anyway. So in practice the swapped box buys you the
> threading window during the brief moment i-frames lapse on the *recover* tail if you
> set `rollIframes < rollActive`. **Recommend `rollIframes` slightly shorter than the
> active window** so threading a gap on the recover frame is a real, hitbox-dependent
> skill rather than pure invuln. (See open questions.)

### Game-loop hook

`src/index.js updatePlaying` line 235 — pass the roll input:

```js
this.ship.update(delta, this.input.getSteer(), this.input.getVertical(),
                 this.input.getRoll(), this.time);
```

No other loop change is required: the swapped hitbox flows through the existing
`checkShip(this.ship.hitbox(), …)` call at line 256, and the i-frame grant flows
through the existing `this.ship.invuln` checks (lines 258, 262). The roll is fully
self-contained in `Ship` + one extra argument.

### Config keys

`src/core/config.js` — extend the `SHIP` block (lines 86–99):

```js
export const SHIP = {
  // ...existing...
  // --- barrel roll ---
  rollAngle: Math.PI / 2,  // 90° spin
  rollActive: 0.30,        // seconds of fast spin-out (hitbox swapped here)
  rollDuration: 0.45,      // total spin+recover before cooldown starts
  rollLerp: 14,            // ease rate toward rollTarget (crisper than move lerp 6)
  rollIframes: 0.25,       // deflect window (reuses SHIELD i-frame field; < rollActive)
  rollCooldown: 0.55,      // lockout after a cycle before Q/E re-arms
};
```

All roll tuning is one block — `rollIframes`, `rollActive`, `rollCooldown` are the
three knobs that define the feel (deflect generosity, threading window, spam-rate).

### HUD / feedback

`src/ui/ui.js` + `index.html` — a compact **roll-ready arc** bottom-right, mirroring
the `setGraze`/`setShield` patterns (ui.js lines 93–101).

- **DOM:** add `<div id="hud-roll"></div>` near `#hud-shield` (index.html ~line 169).
  Style as a small ring/arc (CSS conic-gradient or two stacked SVG arcs) sitting
  bottom-right, cyan when ready, dimmed while on cooldown.
- **UI method:** `setRoll(ready01)` where `ready01 = 1 - (ship.rollCooldown / SHIP.rollCooldown)`
  (1 = armed, fills as cooldown drains). Call it from the throttled HUD block at
  `index.js:300–303` alongside `updateHud`.
- **Control hint:** update `index.html:156` controls-hint to add `Q/E ROLL`.
- **Juice (no new system):** the existing `pulseGlow()` (ship.js:138) can fire on
  roll start for an engine-flare; reuse `this.flash`. A faint `effects.shakeAmp`
  bump on roll start is optional — keep it tiny (≤0.1) to respect photosensitivity.
  No strobe: the roll's own spin is the visual, and i-frame blink already exists.

### Constraints honored

- **Fixed song clock:** roll touches nothing on `songTime`/spawns — purely ship-local
  and per-frame `delta`. ✓
- **Perf / pooling:** zero allocations per frame; reuses `invuln`, `rotation.z`,
  `SHIP.half`. No new pools. ✓
- **Photosensitivity:** no added strobe; the only flashes are the pre-existing i-frame
  blink (`SHIELD.blinkHz`) and optional tiny glow flare. ✓
- **Mobile:** keyboard-only for v1; touch double-tap deferred (open question). ✓

### Open design questions

1. **Deflect vs hard parry?** Currently i-frames make the roll a *forgiving* dodge.
   Alternative: no i-frames, hitbox-swap-only — a pure skill thread with real death
   risk. Recommend shipping i-frames first (approachable), expose `rollIframes: 0` as
   a "hardcore" toggle.
2. **`rollIframes` vs `rollActive` ratio.** If i-frames cover the whole active spin,
   the swapped hitbox never decides a hit (you're invuln throughout). Setting
   `rollIframes` < `rollActive` makes the *recover-frame thread* hitbox-dependent —
   but is that legible to players, or just confusing? Playtest.
3. **Cooldown length.** `0.55s` stops mash-rolling through a wall field. Too long and
   it feels sluggish next to the responsive steer. Tune against gate-heavy sections
   (feature 3) where chaining rolls between rings may be desired.
4. **Roll vs steering authority.** During a roll, should left/right steer still apply,
   or lock briefly (committed-roll feel)? Current design keeps steer live (additive
   `rotation.z`). A brief steer-damp during `rollActive` could read better — flagged.
5. **Mobile gesture.** Double-tap-side vs a dedicated on-screen roll button vs
   accelerometer tilt. Out of scope for v1.
6. **Interaction with gates (feature 3).** Does rolling through a gate count as a
   clean pass, and should a roll *boost* the gate chain (style points)? Coordinate
   with the gates spec.


## Accelerate / Brake

Player-controlled **world-scroll modulation**. The player can lean into the track (accelerate → less reaction time, more graze/intensity, score bonus) or pull back (brake → more reaction time, safer, but a soft score penalty/decay). This is **NOT** a music speed control — the song clock (`songTime`) and all event spawns stay locked. We only scale the rate at which *already-spawned* entities and the grid travel toward the ship, and the visual/feel layer (camera, bloom, shake, FOV optional).

This is the same "boost" currency that **gates** (feature 31) pump into. Accel and gate-boosts both push one shared `speedAmount`; there is one speedometer, one decay curve, one set of bounds.

---

### 1. The core constraint (read first)

`src/index.js:232`:

```js
const gameSpeed = SPEED.base * sect.speed;
```

`gameSpeed` is the **single scroll multiplier** consumed by three readers, all per-frame and all `* 60 * delta` framerate-normalised:

| Reader | File / line | Uses |
|---|---|---|
| Entities (pillar/cube) | `src/game/entities.js:165-167` | `(speed + SPEED.pillarBonus) * 60 * delta` |
| Entities (drone) | `src/game/entities.js:184-185` | `aggSpeed = speed + 0.15 + agg*0.2` |
| Grid floor | `src/game/grid.js:185` | `(speed + SPEED.gridBonus) * 60 * delta` |

**The trick:** spawning is driven by `songTime` and the event `time` field (`src/index.js:240`), *completely independent of `gameSpeed`*. So changing `gameSpeed` changes how fast entities **travel** once on screen, but NOT **when** they appear (that is the music's job). An entity spawns at `SPEED.spawnZ = -90` exactly on its beat regardless of player speed; accel just makes it cover the -90→0 distance faster (less dodge time), brake makes it slower (more dodge time).

**Desync risk + the guard.** Because travel speed now varies but spawn time does not, the *spatial spacing* between consecutive hazards changes with speed. Two hazards spawned 1.0s apart at `spawnZ` will arrive closer together when accelerating (they each move faster but the lead one has a head start that compresses) — this is the intended risk, not a bug. The real failure mode is **starvation/pile-up at the despawn line**: if the player brakes hard for a long stretch, slow entities accumulate near `spawnZ` while new ones keep spawning on-beat, packing the far field. Guard with a **floor on brake** (`accelMin`, never below ~0.7×) so the world always drains faster than it fills, plus the existing `despawnZ` cull. Do **not** let `speedAmount` touch the spawn `while` loop or `cursor` — those stay on `songTime` forever.

---

### 2. Key bindings (recommendation)

Current map (`src/input/input.js`): A/D + ←/→ steer, W/S + ↑/↓ vertical, SPACE fire, ESC pause. Q/E reserved for roll (feature 29). Free, ergonomic, non-conflicting:

| Action | Key | Rationale |
|---|---|---|
| Accelerate | **Shift** (Left Shift) | Held "lean forward"; pinky rests on it while the hand steers WASD. Natural "boost" idiom. |
| Brake | **Ctrl** (Left Ctrl) | Held "pull back"; sits under Shift. Mirror of accelerate. |

Avoid Tab (focus theft) and Alt (browser/OS menu). Shift+Ctrl held together → **cancel to neutral** (treat as no input). Mobile: a future two-finger vertical drag or an on-screen throttle slider; ship a no-op for now (touch keeps baseline speed). Add a hint line to `index.html:156`: `SHIFT BOOST · CTRL BRAKE`.

`preventDefault` is **not** needed for Shift/Ctrl (unlike SPACE at `input.js:16`); they don't scroll the page. But guard against the browser's Shift+Ctrl combos by reading state, never trapping keydown.

---

### 3. Speed model

One signed scalar, `speedAmount ∈ [-1, +1]`, lives on `Game`. Input pushes a **target**; the live value chases it (smoothing in, decay-to-neutral out).

```
rawInput = getAccelerate()        // +1 Shift, -1 Ctrl, 0 none/both
target   = boostActive ? max(rawInput, gateBoost) : rawInput   // gates can only ADD accel, never brake
speedAmount += (target - speedAmount) * SPEED.accelSmooth * delta        // chase target
if (rawInput === 0 && gateBoost === 0)
    speedAmount += (0 - speedAmount) * SPEED.accelRecovery * delta        // decay to neutral when released
```

Then the multiplier (applied at `index.js:232`):

```js
let gameSpeed = SPEED.base * sect.speed;
const speedScale = 1 + speedAmount * (speedAmount >= 0 ? SPEED.accelGain : SPEED.brakeGain);
gameSpeed *= speedScale;   // speedScale ∈ [accelMin .. accelMax]
```

Two gains (accel vs brake) so the curve can be asymmetric — accelerate harder than you can brake, keeping brake from being a free pause. Clamp the *result* to `[SPEED.accelMin, SPEED.accelMax]` as a hard safety rail.

**Config (`src/core/config.js`, add to `SPEED`):**

| Key | Value | Meaning |
|---|---|---|
| `accelGain` | `0.30` | + scale at `speedAmount = +1` → 1.30× |
| `brakeGain` | `0.30` | − scale at `speedAmount = -1` → 0.70× |
| `accelMin` | `0.70` | hard clamp floor (pile-up guard) |
| `accelMax` | `1.30` | hard clamp ceiling |
| `accelSmooth` | `4.0` | chase rate toward held target (≈0.25s to reach) |
| `accelRecovery` | `2.0` | decay rate back to neutral on release (≈0.5s) |
| `gateBoostAmount` | `0.6` | how far a gate pass pushes `speedAmount` (see §6) |
| `gateBoostHold` | `1.2` | seconds a gate boost stays pinned before it starts decaying |

All smoothing is `* delta` framerate-independent, matching the codebase's lerp idiom (`SHIP.lerp` at `config.js:94`, camera follow at `index.js:288`).

---

### 4. Risk / reward

| State | `speedAmount` | World feel | Reward | Cost |
|---|---|---|---|---|
| **Accelerate** | `+0.1 .. +1.0` | hazards arrive ~30% faster; less reaction time; camera dips forward, bloom/FOV widen, mild shake | **Intensity score bonus** (see below); more graze opportunities per second; faster gate chaining | tighter dodges; a hit is more likely and the streak reset (`absorbHit`, `index.js:355`) costs more |
| **Neutral** | `0` | baseline | — | — |
| **Brake** | `-0.1 .. -1.0` | hazards arrive slower; generous reaction time | survivability; lets you set up a clean gate run | **score bleed** while braking (you're "coasting"); the streak grows slower because graze pts/sec scale with closeness *and* you cross fewer hazards |

**Accelerate score bonus** — piggyback on the existing streak/graze loop rather than a new ledger. Two cheap options:

- **(A) Graze amplifier (preferred):** scale the continuous graze gain by speed. At `index.js:340-341` (`onGraze`) multiply `pointsPerSec`/`streakPerSec` by `(1 + max(0, speedAmount) * GRAZE.speedBonus)` so accelerating *while grazing* is the high-skill score engine. Brake gives `speedAmount < 0`, no amplifier → safety has an opportunity cost, no explicit penalty needed (the "penalty" is foregone graze points).
- **(B) Survival rate nudge:** scale `MIX.survivalGainPerSec` so the reward-mix stem climbs faster under accel — ties the *audio intensity* to player aggression (very on-theme). Optional, additive to (A).

Recommend **(A)** as the mechanic and **(B)** as flavour. Avoid a flat per-second "speed score" — it rewards holding Shift mindlessly; tying it to graze keeps it skillful.

---

### 5. Where it multiplies (exact hooks)

All in `src/index.js → updatePlaying(delta)`:

1. **Read input + update `speedAmount`** — top of the function, right after `const songTime = ...` (line 223) and before `gameSpeed` is computed. New helper `this._updateSpeed(delta)` mutates `this.speedAmount` from `input.getAccelerate()` and the decaying gate boost.
2. **Apply to scroll** — `index.js:232`, replace the single line with the `speedScale` block from §3. This is the **only** place the number enters the world; entities (`:252`) and grid (`:296`) already receive the resulting `gameSpeed` unchanged, so they need **zero** edits. ✅
3. **Leave spawning untouched** — the `while (this.cursor < ev.length && ev[this.cursor].time <= songTime)` loop at `:240` keeps comparing against `songTime` only. Confirm no `speedAmount` leaks here.
4. **Graze amplifier** — `onGraze` (`index.js:338-344`): fold `speedAmount` into the gain (§4A).
5. **Effects cue** — when `speedAmount` crosses a threshold or a gate fires, set `this.effects.shakeAmp = 0.12` (small, photosensitive-safe) and optionally feed an `effects.speedLevel` for bloom/FOV. `shakeAmp` already exists (`effects.js:27`, consumed via `applyShake`, `index.js:293`).
6. **HUD** — inside the throttled block (`index.js:299-303`) call `this.ui.setSpeed(this.speedAmount)`.

**`despawnZ` note:** the brief says "faster scroll = closer despawn culling." In practice the existing `if (m.position.z > SPEED.despawnZ)` (`entities.js:175`) already culls correctly at any speed — entities just reach it sooner when accelerating. No dynamic `despawnZ` needed unless profiling shows far-field pile-up under sustained brake; if so, scale the **spawnZ-side** budget, not despawn. Flag as open question.

---

### 6. Unifying with gate boosts (one boost system)

Gates (feature 31) reward a pass-through with a speed boost. Instead of a separate gate-velocity field, **a gate pass writes into the same `speedAmount` pipeline**:

```js
// called from onGatePass(gate) — feature 31's scoring hook
onGateBoost() {
  this.gateBoost = SPEED.gateBoostAmount;     // e.g. +0.6 toward accel
  this.gateBoostHold = SPEED.gateBoostHold;   // pinned for 1.2s
}
```

In `_updateSpeed(delta)`:

```js
if (this.gateBoostHold > 0) this.gateBoostHold -= delta;
else this.gateBoost += (0 - this.gateBoost) * SPEED.accelRecovery * delta; // decays into the same neutral pull
const target = Math.max(this.input.getAccelerate(), this.gateBoost); // gate boost is accel-only
```

Result: one speedometer reflects manual accel AND gate boosts; chaining gates stacks/refreshes the boost (re-arm `gateBoostHold`), and the player can *add* manual Shift on top up to `accelMax`. Braking still works during a boost (manual Ctrl can pull `speedAmount` down even while `gateBoost` is positive — because `target` is the max of the two *toward accel*, but the chase line lets brake input win when `rawInput < 0` and gateBoost has decayed). Keep gate boost **accel-only** (never negative) so a gate never brakes you.

---

### 7. HUD — speedometer

A compact horizontal bar, bottom-right (mirrors the brief's placement and avoids the top-center score cluster). Center = neutral; fills **right/warm** under accel, **left/cool** under brake.

**`index.html`** (near `:178`, inside `#hud`):

```html
<div id="hud-speed"><div id="hud-speed-fill"></div><div id="hud-speed-center"></div></div>
```

**`src/ui/ui.js`** — new method mirroring `setGraze` (`ui.js:100`):

```js
setSpeed(amount) {                       // amount ∈ [-1, +1]
  const fill = $('hud-speed-fill');
  const pct = Math.abs(amount) * 50;     // half-width
  if (amount >= 0) { fill.style.left = '50%'; fill.style.width = pct + '%'; fill.style.background = 'var(--accel)'; }
  else             { fill.style.right = '50%'; fill.style.left = 'auto'; fill.style.width = pct + '%'; fill.style.background = 'var(--brake)'; }
}
```

Accent colors: accel = warm cyan→amber (`COLORS.drone` family), brake = cold blue. Keep the bar subtle (low opacity at neutral) so it doesn't compete with the streak readout. Called from the throttled HUD block; no per-frame DOM churn.

---

### 8. Audio cue (optional, on-theme)

The brief asks for "pitch up on accel." Since we must **not** retime the song, do NOT touch playback rate. Instead, gate accel onto the **reward-mix intensity** already in place: route `max(0, speedAmount)` into `MIX.survivalGainPerSec` scaling (`updateRewardMix`, `index.js:309-317`) or add a dedicated `audio.setSpeedGain()` that nudges a wet/filter send — a subtle filter-open as you accelerate, close as you brake. This keeps the *song timing* sacrosanct while making speed audible. Flag exact stem/send as an open question for the audio owner.

---

### 9. Effort

**M.** Mostly additive: one scalar + one helper on `Game`, one multiply at `index.js:232`, one input method, one UI method + a DOM node, ~8 config keys. No refactor; entities/grid consume `gameSpeed` unchanged. The fiddly parts are tuning the asymmetric gains and verifying the gate-boost unification doesn't fight manual brake.

---

### 10. Open design questions

1. **Brake penalty shape** — is "foregone graze points" enough of a cost, or does brake need an explicit small score bleed / streak decay to stop players from turtling the whole song at 0.7×?
2. **Far-field pile-up** under sustained brake — does `accelMin = 0.7` + static `despawnZ` suffice, or do we need a soft cap on max on-screen entities? Needs a profiling pass with the densest section.
3. **Mobile throttle** — ship neutral-only for now, or add an on-screen slider / two-finger drag? (Touch currently only steers + fires.)
4. **FOV kick** — widen camera FOV slightly under accel for a speed-rush feel? Photosensitivity + motion-sickness review needed before enabling; default OFF.
5. **Audio send** — which stem/filter responds to speed, and how subtly, without implying the song sped up?
6. **Roll interaction** — should an active barrel roll (feature 29) lock speed to neutral, or are accel + roll combinable? (Recommend combinable; flag for playtest.)


# Fly-Through Gates + Sequence Multiplier

Star Fox-style rings you steer *through* (not into) for points, a brief speed
boost, and a **sequence multiplier** that climbs while you chain consecutive
gates and collapses the instant you miss one or take a hit. Gates are the first
*non-damaging* hazard in the game, so they need a separate pass-through test
that lives alongside the existing AABB collision rather than inside it.

This spec assumes the data-driven entity system (`40-` siblings) but is written
so it can also land *before* that refactor — the "Pre-refactor fallback" notes
show the minimal bespoke path through today's `entities.js`.

---

## 1. Design summary

| Aspect | Decision |
|---|---|
| Shape | Neon **torus** (ring) MVP; octagon (extruded N-gon) as a visual variant via a def param. Hole faces the player (+Z). |
| Damage | **None.** A gate is never a `hit` and never a graze hazard. Clipping the rim does nothing harmful — worst case you just *miss the centre*. |
| Reward on pass | Points (`GATES.rewardBase` × chain multiplier) + a short **scroll speed boost** + sets `effects.gateLevel = 1` for a light flare. Optional: every Nth chained gate refunds a shield charge. |
| Pass detection | Ship's Z-center crosses the gate's Z-plane **while inside the inner radius** (a 2-D X/Y disc test), evaluated once per gate as it sweeps past Z=0. |
| Chain | `stats.gateChain` increments per clean pass. Multiplier = `1 + gateChain × GATES.chainStep`, capped at `GATES.chainMax`. |
| Chain reset | Resets to 0 on: (a) any **absorbed/lethal hit**, (b) a gate that sweeps past **un-passed** (a miss). Grazing does NOT reset it. |
| Speed boost | Feeds the **same** `Game.speedAmount` channel the accel/brake feature (`50-accel-brake`) owns, so "gate boost" and "player throttle" are one unified system — no second speed path. |
| HUD | Bottom-centre chain pip strip + `×N.N` gate multiplier, distinct colour from the gold graze streak (use cyan to read as "flow", not "combat"). |

**Why a torus, not an AABB volume:** a ring's reward zone is a *disc*, and the
fun is threading the hole. An AABB can't express "inside the hole but missing
the rim is fine" — it would either block the rim (turning the gate into an
obstacle) or have no rim at all. So gates get a bespoke geometric test, not the
shared `intersects()`.

---

## 2. Gate as a data-driven entity

### 2.1 With the entity-def system (target)

Add one def. No new factory, no new pool — the generic `_makeEntity(def)` and
on-demand `_poolFor('gate')` cover it. Cite: `src/game/entityDefs.js` (new, per
the data-driven spec), `src/core/pool.js` `Pool`.

```js
// entityDefs.js
gate: {
  kind: 'gate',                 // tells collision/scoring this is a pass-through, not a hazard
  geometry: 'ring',             // ring|octagon -> built in _makeEntity from a torus / extruded N-gon
  radius: 2.6,                  // inner clear radius (the hole the ship threads)
  tube: 0.28,                   // rim thickness
  material: { color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.6, opacity: 0.9 },
  shootable: false,
  hitbox: null,                 // gates are NOT in the AABB hit loop
  behavior: 'static',           // reuses the pillar/static scroll behavior (Z-march only)
  params: { approachGlow: true, spinZ: 0.2 }, // slow self-rotation for life
}
```

Spawn carries only what varies: `{ time, type:'gate', defKey:'gate', x, y,
sequenceId, rewardBase, boostFactor }`. The generic spawn path positions it at
`(x, y, SPEED.spawnZ)`, marks `e.passed = false`, `e.missed = false`, stamps
`e.sequenceId`, pushes to `this.entities`. The `static` behavior already
scrolls it toward Z=0 (`m.position.z += (speed + bonus) * 60 * delta`).

### 2.2 Pre-refactor fallback (today's `entities.js`)

If gates land before the def refactor, mirror the existing pattern:

- `_buildSharedResources()` (line 35): add `this.geoGate =
  new THREE.TorusGeometry(GATES.radius, GATES.tube, 8, 24)` + a shared
  `this.matGate` (emissive cyan, additive blend, `depthWrite:false`).
- New `_makeGate()` factory (beside `_makeDrone`, line 78) returning
  `{ type:'gate', mesh, radius:GATES.radius, passed:false, missed:false,
  sequenceId:0, shootable:false, laser:null, spin:null }`.
- `this.gatePool = new Pool(() => this._makeGate())` in the constructor (line 28
  cluster); add `gate` branch to `_poolFor()` (line 106).
- `spawn(ev)` (line 111): add `if (ev.type === 'gate') return
  this._spawnGate(ev);`.
- `update()` loop (line 160): gates ride the **pillar branch** for Z movement
  (`m.position.z += (speed + SPEED.pillarBonus) * 60 * delta`) plus a tiny
  `m.rotation.z += GATES.spinZ * step` and an **approach-glow** ramp:
  `e.mesh.material.emissiveIntensity = 0.4 + 0.6 * clamp01((m.position.z + 40) / 40)`
  so it brightens as it nears.

Either way the ring **must self-rotate slowly + glow on approach** — a static
ring at the spawn fog edge is invisible until too late.

---

## 3. Pass-through detection (the core mechanic)

Gates are skipped by the existing AABB hit loop and tested by a **dedicated**
function so the disc geometry stays out of `checkShip`.

### 3.1 `collision.js` — skip gates, add `checkGates`

In `checkShip` (line 47) the loop must ignore gates so a rim brush is never a
death and never a graze:

```js
for (const e of entities) {
  if (e.type === 'gate') continue;     // gates are pass-through, handled separately
  ...
}
```

New export, sitting next to `checkShip`:

```js
// Detect gates the ship's Z-center swept past THIS frame, and whether it
// threaded the hole. prevZ/curZ are the ship-relative crossing test: the gate
// moves +Z each frame; we catch the frame its center crosses the ship plane (0).
export function checkGates(ship, gates, prevSpeedStep) {
  const passed = [];   // gates threaded through the centre this frame
  const missed = [];   // gates that swept past without a clean pass
  for (const g of gates) {
    if (g.passed || g.missed) continue;
    const z = g.mesh.position.z;
    // the gate crossed the ship's Z this frame if it was ahead last frame and is now at/behind
    if (z >= ship.z) {                          // gate plane reached the ship
      const dx = ship.x - g.mesh.position.x;
      const dy = ship.y - g.mesh.position.y;
      const inside = (dx * dx + dy * dy) <= (g.radius * g.radius);
      if (inside) { g.passed = true; passed.push(g); }
      else        { g.missed = true; missed.push(g); }
    }
  }
  return { passed, missed };
}
```

Notes:
- **`ship.z` is 0** (ship sits at the origin plane), so this is effectively
  `z >= 0`. Passing `ship.z` keeps it honest if the ship ever gets Z motion.
- The disc test uses the ship's **logical** x/y (`ship.x`, `ship.y`) — same
  no-bob values `hitbox()` already returns — so it doesn't jitter with the
  hover bob.
- Because entities scroll at up to ~`0.33 * 60 * delta ≈ 1.1u` per 60fps frame
  (more under boost), a thin Z-plane test could be tunnelled at very low frame
  rates. Use `z >= ship.z` (a half-space, not a `Math.abs(z) < eps` band) so the
  crossing is caught on the **first** frame the gate is at/behind the ship —
  never skipped. The `g.passed || g.missed` guard makes it fire exactly once.
- Ship Y matters now (the ship flies up/down), so the disc is a true 2-D test —
  flying high to clear a low ring is a real miss. Good: gates reward using the Y
  axis the game already added.

### 3.2 Index hook

In `updatePlaying` after `checkShip` (around line 256), partition gates from the
entity list once and run the gate test. A cheap filter each frame is fine
(entity count is small), or keep a parallel `this.entities.gates` array
populated in `spawn`/`release` to avoid the filter.

```js
const gates = this.entities.entities.filter((e) => e.type === 'gate');
const { passed, missed } = checkGates(this.ship.hitbox(), gates);
for (const g of passed) this.onGatePass(g);
for (const g of missed) this.onGateMiss(g);
```

`checkShip` already returns the non-gate `hit`; that flow is unchanged.

---

## 4. Scoring + sequence multiplier

### 4.1 Stats (`index.js` `_resetStats`, line 60)

Add `gateChain: 0, bestGateChain: 0, gatesPassed: 0` to the `this.stats` object.
(`bestGateChain` and `gatesPassed` feed the reward screen.)

### 4.2 Reward path (`index.js`, beside `onKill`/`onGraze`)

```js
onGatePass(g) {
  this.stats.gatesPassed++;
  this.stats.gateChain++;
  this.stats.bestGateChain = Math.max(this.stats.bestGateChain, this.stats.gateChain);
  const mult = Math.min(GATES.chainMax, 1 + this.stats.gateChain * GATES.chainStep);
  this.stats.score += Math.round(GATES.rewardBase * mult);

  // unified speed channel (see 50-accel-brake): a gate grants a decaying boost
  this.speedAmount = Math.min(SPEED.accelMax ?? 1, this.speedAmount + GATES.boost);

  // FX
  this.effects.gateLevel = 1;          // light flare (see §6)
  this.effects.shakeAmp = Math.max(this.effects.shakeAmp, 0.12);
  this.entities.gateBurst(g.mesh.position); // cyan ring-pop debris (see §6)
  this.ui.flashGateChain();            // pulse the HUD chain element

  // optional: chained-gate shield refund
  if (GATES.shieldEveryN && this.stats.gateChain % GATES.shieldEveryN === 0
      && this.shieldCharges < SHIELD.max) {
    this.shieldCharges++; this.ship.setShield(this.shieldCharges);
    this.ui.setShield(this.shieldCharges, SHIELD.max);
  }
}

onGateMiss(g) {
  if (this.stats.gateChain > 0) {
    this.stats.gateChain = 0;
    this.ui.setGateChain(0);
  }
}
```

### 4.3 Chain reset on damage

In `absorbHit` (line 347) and on death `die` (line 116) the gate chain breaks
exactly like the graze streak does (`this.stats.streak = 1.0`). Add one line to
`absorbHit`:

```js
this.stats.streak = 1.0;
this.stats.gateChain = 0;   // a hit also collapses the gate chain
```

So the two combos share the same "don't get hit" pressure but are otherwise
independent — you can be mid graze-streak with a fresh gate chain and vice
versa. **Grazing a real hazard does not touch the gate chain** (different reward
loop), which keeps the gate chain about *flow/threading*, not combat.

### 4.4 Reward screen

`ui.showReward` (line 120) line gains `BEST GATE CHAIN: ×N.N` /
`{gatesPassed} GATES THREADED` — append to the `#reward-stats` innerHTML
(line 128). Pass `bestGateChain` / `gatesPassed` through the `{ ...this.stats }`
spread already in `gotoReward` (line 137).

### 4.5 Multiplier maths (defaults)

| gateChain | mult = 1 + chain×0.15 (cap 3.0) | points @ rewardBase 150 |
|---|---|---|
| 1 | ×1.15 | 173 |
| 3 | ×1.45 | 218 |
| 6 | ×1.90 | 285 |
| 10 | ×2.50 | 375 |
| 14+ | ×3.00 (capped) | 450 |

Tune `chainStep`/`chainMax` so a *perfect* gate corridor (a section laid as a
ring run) is a meaningful but not run-defining score swing vs. kills.

---

## 5. Event-map spawning

`eventgen.js` `generateEvents` (line 23). Gates are **sparse and deliberate**,
not per-beat. Two spawn modes:

**(a) Cadence gates** — a gate every `GATES.spawnSpacing` qualifying beats in
denser sections, replacing the obstacle/enemy roll on that beat:

```js
// inside the per-beat loop, before the obstacle/enemy roll (line 38)
const gateBeat = (bi % GATES.spawnSpacing === 0) && dense > GATES.densityMin;
if (gateBeat) {
  events.push({
    time, type: 'gate', defKey: 'gate',
    x, y: +(1.4 + Math.sin(bi * 0.5) * 1.0).toFixed(2),  // vary height -> use the Y axis
    sequenceId: Math.floor(bi / GATES.spawnSpacing),
    rewardBase: GATES.rewardBase, boostFactor: GATES.boost,
  });
  continue;  // this beat is a gate, not an obstacle/enemy
}
```

**(b) Ring runs** — at a section boundary, optionally lay a short **corridor**
of 3–6 gates on consecutive eligible beats forming a readable path (e.g. a
gentle sine in X/Y) so chaining is achievable and feels choreographed:

```js
// in the sections.forEach block (line 57), for chosen "flow" sections:
for (let k = 0; k < runLen; k++) {
  const t = s.time + k * beatDur;          // beatDur ~ 60/tempo
  events.push({ time:+t.toFixed(2), type:'gate', defKey:'gate',
    x:+(Math.sin(k*0.8)*3).toFixed(2), y:+(1.5+Math.cos(k*0.8)).toFixed(2),
    sequenceId: 1000 + i, rewardBase: GATES.rewardBase, boostFactor: GATES.boost });
}
```

`sequenceId` lets the HUD/scoring know which gates belong to one run (future:
"perfect run" bonus when every gate of a `sequenceId` is passed). The spawn
dispatch in `index.js` (line 242) needs `e.type === 'gate'` added to the route:

```js
if (e.type === 'obstacle' || e.type === 'enemy' || e.type === 'gate') this.entities.spawn(e);
```

(With the def system, dispatch is just `if (e.defKey) this.entities.spawn(e)` —
gates need no special case.)

---

## 6. Visuals + FX

| Element | Behaviour | Hook |
|---|---|---|
| Ring approach glow | `emissiveIntensity` ramps 0.4→1.0 as Z goes −40→0; bloom (`threshold 0.2`) makes it flare. | `entities.update` gate branch; `BLOOM` already in place. |
| Self-rotation | Slow `rotation.z` spin so the ring reads as 3-D and alive. | gate branch, `GATES.spinZ`. |
| Pass pop | `entities.gateBurst(pos)` — reuse `_spawnDebris(this.particlePool, pos, COLORS.cyan, …)` in a **ring** (spawn 12 particles on a circle in the X/Y plane, velocity radial-outward) instead of a sphere. New small method mirroring `deathBurst` (line 258). | `entities.js`. |
| Light flare | `effects.gateLevel` decays like `fireLevel`; add to the point-light sum in `Effects.update` (line 93) and nudge bloom. Cyan, brief. | `effects.js`. |
| Missed-gate cue | Ring flashes red + dims for its last metre, no debris. Optional; cheap negative feedback. | gate branch on `e.missed`. |
| HUD pulse | `ui.flashGateChain()` scales/brightens the chain element for ~150ms. | `ui.js`. |

### `effects.js` `gateLevel` seam

```js
// constructor (line 30 cluster)
this.gateLevel = 0;
// update(), beside fireLevel decay (line 92)
this.gateLevel = Math.max(0, this.gateLevel - delta * 4);   // ~0.25s flare
// fold into the player light (line 93)
const player = LIGHT.playerBase
  + this.ship.flash * LIGHT.flashGain
  + this.grazeLevel * LIGHT.grazeGain
  + this.fireLevel * LIGHT.fireGain
  + this.gateLevel * (LIGHT.gateGain ?? 1.0);
// reset() (line 116): this.gateLevel = 0;
```

**Photosensitivity:** the pass flare is a *single* short ramp-down (no strobe),
the missed-gate red is a one-shot dim (not a flash loop), and the gate glow is a
smooth approach ramp. No new flashing patterns — consistent with the existing
i-frame blink being the only periodic flash, which is hull-only.

---

## 7. HUD chain indicator

`index.html` HUD block (line 166) gains a bottom-centre element, distinct from
the gold streak (top) — cyan to signal "flow":

```html
<div id="hud-gate-chain" class="hud-gate-chain"></div>
```

`ui.js` methods (beside `setGraze`, line 100):

```js
setGateChain(count) {
  const el = $('hud-gate-chain');
  if (count <= 0) { el.style.opacity = '0'; return; }
  const mult = Math.min(3.0, 1 + count * 0.15);   // mirror GATES.chainStep/chainMax
  el.style.opacity = '1';
  el.innerHTML = `<span class="gate-pips">${'◇'.repeat(Math.min(count, 8))}</span>`
               + `<span class="gate-mult">×${mult.toFixed(2)}</span>`;
}
flashGateChain() {
  const el = $('hud-gate-chain');
  el.style.transition = 'none'; el.style.transform = 'scale(1.25)';
  requestAnimationFrame(() => { el.style.transition = 'transform .15s ease'; el.style.transform = 'scale(1)'; });
}
```

Called from the throttled HUD block in `updatePlaying` (line 300):
`this.ui.setGateChain(this.stats.gateChain);`. On reset/miss it's set to 0
immediately (outside the throttle) so the collapse feels instant.

Control hint (`index.html` line 156): no new key — gates are steered through
with existing movement; add `· FLY THROUGH GATES` to the hint copy.

---

## 8. Config (`config.js`)

```js
// Gameplay #4 — fly-through gates + sequence multiplier
export const GATES = {
  radius: 2.6,         // inner clear radius (the threadable hole)
  tube: 0.28,          // rim thickness
  spinZ: 0.6,          // ring self-rotation (rad/sec-ish, ×step in update)
  rewardBase: 150,     // base points per clean pass (before chain mult)
  chainStep: 0.15,     // multiplier growth per chained gate
  chainMax: 3.0,       // multiplier cap
  boost: 0.18,         // speedAmount added per pass (decays via accel/brake regen)
  shieldEveryN: 0,     // 0 = off; else refund a shield charge every Nth chained gate
  spawnSpacing: 12,    // beats between cadence gates
  densityMin: 0.12,    // only spawn cadence gates above this section density
  color: 0x00ffff,
};
```

`boost` deliberately reuses the accel/brake `SPEED.accelMax` clamp + regen so
there is exactly **one** world-speed channel (`Game.speedAmount`). If the
accel/brake feature isn't built yet, gate boost falls back to a local decaying
`this.gateBoost` multiplied into `gameSpeed` (line 232):
`const gameSpeed = SPEED.base * sect.speed * (1 + this.gateBoost);` with
`this.gateBoost = Math.max(0, this.gateBoost - delta * GATES.boostDecay)`.

---

## 9. Pooling + lifecycle

- One pool (`gatePool`, or generic `_poolFor('gate')`). Gates carry
  `{ type:'gate', mesh, radius, passed, missed, sequenceId }` and recycle like
  any other entity through `_releaseEntity` (line 238) when they pass
  `SPEED.despawnZ`.
- **Crucial reset of per-spawn flags:** `_spawnGate` must set
  `r.passed=false; r.missed=false;` (the analogue of `r.nearMissed=false`) — a
  recycled gate that kept `passed=true` would never score. Same trap the
  existing factories avoid by resetting `nearMissed` per spawn.
- `reset()` (line 281) already releases all entities by `_poolFor(e.type)`; add
  `gate` to that map. No disposal — gates recycle across runs like everything
  else, honouring the zero-GC-churn invariant.
- If keeping a `this.entities.gates` mirror array (to skip the per-frame
  filter), push in `_spawnGate` and splice in `_releaseEntity` when
  `e.type === 'gate'`.

---

## 10. Concrete hook list (file · line · change)

| File | Anchor | Change |
|---|---|---|
| `src/core/config.js` | after `LASER` (line 150) | add `GATES` block (§8); add `LIGHT.gateGain` |
| `src/game/entityDefs.js` *(new)* | — | `gate` def (§2.1); pre-refactor: `_makeGate`/`_spawnGate` in `entities.js` |
| `src/game/entities.js` | `_buildSharedResources` 35; ctor 28; `spawn` 111; `update` 160; `_poolFor` 106; `reset` 281 | torus geo+mat, gate pool, spawn route, scroll+glow+spin branch, gate pool map; add `gateBurst()` beside `deathBurst` (258) |
| `src/core/pool.js` | `Pool` | unchanged (generic) |
| `src/audio/eventgen.js` | per-beat loop 38; `sections.forEach` 57 | cadence gates + optional ring runs (§5) |
| `src/game/collision.js` | `checkShip` loop 47; new export | `if (e.type==='gate') continue`; add `checkGates()` (§3.1) |
| `src/index.js` | `_resetStats` 60; spawn route 242; after `checkShip` 256; `absorbHit` 347; HUD block 300; new methods | gate stats, spawn route, `checkGates` call, chain reset, `setGateChain`, `onGatePass`/`onGateMiss` (§4) |
| `src/game/effects.js` | ctor 30; `update` 92; player light 93; `reset` 116 | `gateLevel` flare (§6) |
| `src/game/ship.js` | — | none (uses existing `hitbox()` x/y/z) |
| `src/ui/ui.js` | beside `setGraze` 100; `showReward` 128 | `setGateChain`/`flashGateChain`; reward stat line |
| `index.html` | HUD 166; controls hint 156 | `#hud-gate-chain` element; hint copy |

---

## 11. Open design questions

1. **Miss-on-overtake vs miss-on-despawn.** Spec marks a miss the frame the ring
   crosses the ship plane. Alternative: only count a miss when the gate
   *despawns* un-passed, giving the player the whole approach. Crossing-frame is
   tighter and more honest (you know instantly); pick based on playtest feel.
2. **Should grazing a *gate rim* award anything?** Currently no (gates are out of
   the graze loop entirely). A tiny "rim graze" bonus for *just* clipping the
   edge could reward precision — but risks confusing the "threading is the
   reward" model. Recommend: no, keep gates pure.
3. **Gate vs hazard overlap.** Can a gate and a drone occupy the same beat/lane?
   The cadence spawn `continue`s so a gate replaces other spawns on its beat, but
   ring runs could overlap a separately-spawned obstacle. Decide whether
   eventgen should reserve gate lanes (clear a corridor) or allow hazards inside
   rings (threading-under-fire as a skill expression).
4. **Boost magnitude when chained.** Each pass adds `GATES.boost`; a long chain
   could pin you at `accelMax`, raising difficulty as reward. Is escalating speed
   a *feature* (flow state) or should boost-per-pass taper with chain length?
5. **Octagon variant trigger.** Torus is MVP. When does the octagon appear — per
   section, per `sequenceId`, or never (drop it)? Purely cosmetic; low priority.
6. **Mobile readability.** The bottom-centre chain HUD must not collide with the
   touch fire zone. Confirm placement against `input.js` `zone()` mapping.
7. **Perfect-run bonus.** `sequenceId` is plumbed but unused for scoring. Worth a
   lump bonus when all gates of a run are passed? Adds a satisfying payoff but
   needs per-`sequenceId` tracking of expected-vs-passed counts.


## Data-Driven Entity System — Definitions & Behaviours

Today every kind in `entities.js` is bespoke: `_makePillar/_makeCube/_makeDrone` each build a `THREE.Group`, push a hand-coded record, own a private `Pool`, and `update()` branches per `e.type`. Adding an enemy means editing four methods. The goal: a single **registry of entity definitions** + a **shared behaviour library**, so new enemies/obstacles/gates are config, not classes. `spawn()` becomes "look up def by `ev.subtype`, acquire from that def's pool, apply def fields". `update()`'s per-type branch collapses to `BEHAVIOURS[e.def.move.name](e, dt, ctx)`.

### (1) Entity Definition Schema

One def builds one shared geometry + materials (once, per `_buildSharedResources`) and one `Pool(() => buildFromDef(def))` keyed by `def.key`. The acquired record carries `def`, `hx/hy/hz`, `hp`, `shootable`, `nearMissed`, and a per-entity `state{}` scratch bag the behaviour owns. Hitbox + collision are unchanged: `collision.js entityBox()` reads `e.mesh.position + e.hx/hy/hz`; `shootable` gates bullet hits; non-`shootable` are dodge-only.

```js
// EntityDef — geometry/material built ONCE & shared; meshes recycle via pool.js Pool.
const PILLAR = {
  key: 'pillar',
  spawnType: 'obstacle',          // matches eventgen.js ev.type/subtype routing
  shape: { kind: 'box', size: [1, 1, 0.8], scaleFromEvent: ['size','height',1] }, // unit box, per-spawn scale
  color: COLORS.pillar, emissive: 0xff1133, wire: true,
  hp: Infinity, shootable: false, // dodge-only, indestructible
  hitbox: 'fromMesh',             // hx=size/2, hy=height/2, hz=0.4 derived at spawn
  move: { name: 'approach', params: { bonus: SPEED.pillarBonus } },
  death: null,                    // never dies
  points: 0,
};

const DRONE = {
  key: 'drone',
  spawnType: 'enemy', subtype: 'drone',
  shape: { kind: 'cone', r: 0.4, h: 1.2, seg: 4, faceZ: true }, wire: true,
  color: COLORS.droneFill, emissive: 0xff2200,
  hp: 1, shootable: true,
  hitbox: [0.4, 0.4, 0.6],
  move: { name: 'track', params: { gain: 0.5, wobble: 0.03, speedBias: 0.15 } },
  attack: 'beam',                 // opt-in: drives the LASER state machine (config.LASER)
  death: { fx: 'particles', n: 8, color: COLORS.drone, speed: 0.4 },
  points: SCORE.kill,
};

const BRACE_GATE = {                // a spanning barrier — hold a lane/plane for a duration
  key: 'gate',
  spawnType: 'obstacle', subtype: 'gate',
  shape: { kind: 'box', size: [1,1,0.6], scaleFromEvent: ['span','height',1] },
  color: COLORS.wall, emissive: 0x004466, wire: true,
  hp: Infinity, shootable: false,
  hitbox: 'fromMesh',             // hx = span/2  (wide → denies a band of X)
  move: { name: 'barrier', params: { holdZ: -6, hold: 1.5, bonus: SPEED.pillarBonus } },
  death: null, points: 0,
};
```

`death.fx` maps to existing emitters (`_spawnDebris` via `miniPool`/`particlePool`): `'minicubes'` = cube scatter (n=4), `'particles'` = drone burst (n=8). `destroy()` reads `def.death` instead of branching on `e.type`; `points` flows to `onKill` in `index.js`.

### (2) Movement Behaviour Library

Signature `(e, dt, ctx) -> void`, mutating `e.mesh.position` (and `e.mesh.rotation` / `e.state`). `step = dt*60` for frame-rate-independent feel (as in current `update()`). **ctx** = `{ playerX, playerY, onBeat, gameSpeed, time, shipInvuln }`. All Z-approach uses `gameSpeed` so entities stay locked to the song clock; despawn at `SPEED.despawnZ` is unchanged.

| name | params | one-line behaviour |
|---|---|---|
| `approach` | `bonus` | Z toward ship at `(gameSpeed+bonus)*60*dt`; no lateral. (pillar today) |
| `track` | `gain`, `wobble`, `speedBias` | Approach + steer X toward `playerX` by `gain*dt`, plus `sin` wobble. (drone idle today) |
| `seek` / `home` | `gainX`, `gainY`, `lockZ` | Approach while steering BOTH X and Y toward player; stop steering past `lockZ`. **Coda** homing. |
| `spiral` | `radius`, `omega` | Approach while X/Y trace a shrinking circle (`radius` decays with Z). Tightening corkscrew. |
| `tumble` | `axis`, `rate` | Approach + rotate end-over-end about `axis` (`rotation.x += rate*step`). Floating debris note. |
| `spin` | `rate`, `axis` | Approach + spin in place about `axis` for read/threat, no lateral. (rest-symbol disc) |
| `weave` | `amp`, `freq` | Approach + `x += sin(time*freq+offset)*amp*step`. Lateral S-curve. (cube today) |
| `orbit` | `cx`, `radius`, `omega` | Approach while circling a moving anchor `cx` (e.g. a sibling/lead enemy). |
| `hover` | `holdZ`, `wobble` | Approach to `holdZ`, then hold Z and idle-wobble — a stationary threat camped ahead. |
| `driftDown` | `vy`, `bounce` | Approach + sink in Y (`vy<0`); optional floor bounce at `SHIP.minY`. Falling note-head. |
| `barrier` | `holdZ`, `hold`, `bonus` | Approach to `holdZ`, freeze there for `hold` s denying its X-band (wide `hx`), then resume. **Brace** lane-denial. |

Notes that hook the existing systems:
- `track`/`seek` reuse the idle-tracking math already in `_updateDrone` (`(playerX - x) * gain * dt`); `seek` adds the Y axis the rail shooter exposes (`SHIP.minY..maxY`).
- `barrier` + `hover` deliberately **stop** Z-approach mid-screen — `checkShip` (`collision.js`) and grazing keep working since they read live mesh position; the player must route around the held lane/plane.
- `attack:'beam'` is orthogonal to `move`: the `LASER` state machine (charging→firing, `onBeat`, `laneHalf`, `this.laserHit`) runs as an attached component after the behaviour, so any def can opt into beat-synced fire.
- Each `def` still owns exactly one `Pool` (`pool.js`), so recycling/`created` diagnostics and zero-GC long runs are preserved.


## Data-Driven Entity System — Manager, Spawning & Migration

Goal: replace the bespoke `_makePillar`/`_makeCube`/`_makeDrone` + per-type `update()` branch + `_updateDrone` in `src/game/entities.js` with one registry of **definitions**. A new enemy is a config object, not a new method/pool/branch. Pooling, collision (`src/game/collision.js`), and grazing (`e.nearMissed`) are untouched.

### DEFINITIONS registry — `src/game/defs.js` (new)

`key -> def`. One def fully describes a kind: how to build it, how it moves, what it's worth, how it dies.

| field | type | meaning |
|---|---|---|
| `key` | string | registry id, referenced by `ev.def` |
| `geo()` | ()=>Geometry | built ONCE by manager, cached on def |
| `edges` | bool | add `EdgesGeometry` wireframe (built once) |
| `mat` / `wire` | Material spec | shared material (constant color/opacity — safe to share, per file header) |
| `half` | {hx,hy,hz} | base half-extents (collision) |
| `shootable` | bool | bullet-killable |
| `init(e,ev)` | fn | per-spawn state: position, scale, rng offsets, half-extent overrides |
| `behaviour(e,dt,ctx)` | fn | per-frame movement/FX; returns nothing, mutates `e.mesh` |
| `points` | number | score on kill |
| `death` | {pool,count,color,opacity,life,speed} | debris recipe read by `destroy()` |
| `extras` | fn | optional per-instance sub-meshes (e.g. drone laser `THREE.Line` with own material) attached in the pool factory |

`ctx` passed to every behaviour: `{ speed, time, step, playerX, onBeat, shipInvuln, mgr }` — the exact args `update()`/`_updateDrone` already thread through. `mgr.laserHit` stays a manager flag a behaviour sets.

### EntityManager rewiring — `src/game/entities.js`

- **Build once.** Constructor loops `for (const def of DEFINITIONS)`: call `def.geo()`, build `def.edges` + shared `def.mat`/`def.wire` (replacing `_buildSharedResources`), and create `this.pools[def.key] = new Pool(() => this._make(def))`. `miniPool`/`particlePool` stay as-is (debris owns per-instance material).
- **Generic factory** `_make(def)` replaces the three `_make*`: build `THREE.Group` with mesh (+ wire if `def.edges` + `def.extras(g)`), `g.visible=false`, push to `this.group`, return record `{ def, mesh:g, hx,hy,hz: ...def.half, nearMissed:false, shootable:def.shootable, state:{} }`. `e.state` holds what was bespoke (spin vec, fire fsm, offset).
- **`spawn(ev)`** → `const def = DEFINITIONS[ev.def]; const e = this.pools[def.key].acquire(); def.init(e, ev); e.mesh.visible=true; e.nearMissed=false; this.entities.push(e);` — one path, no `if(type===…)`.
- **`update(delta,speed,time,playerX,opts)`** keeps the loop + `this.laserHit=false` + despawn check, but the per-type `if/else` collapses to `e.def.behaviour(e, delta, ctx)`. `_updateDrone` becomes the drone def's behaviour verbatim (same fsm, same `LASER` consts, same `this.laserHit=true`).
- **`_releaseEntity` / `reset`** use `this.pools[e.def.key]` instead of `_poolFor(type)`; drop `_poolFor`.
- **`destroy(entity)`** reads `entity.def.death`: `for i<count spawnDebris(pools..., def.death.*)`, then `_releaseEntity`. `deathBurst`/`_spawnDebris`/`_updateDebris`/`drift` unchanged.

Collision needs no change: `entityBox` in `collision.js` already reads `e.mesh.position` + `e.hx/hy/hz`, which `_make`/`init` still set.

### Eventgen + event-map — `src/audio/eventgen.js`

Event objects gain a `def` key; type stays for the index.js spawn cursor but spawn dispatches on `def`:

```js
{ time, type:'entity', def:'treble_clef', x, y, params:{ aggression, size } }
```

`generateEvents` picks a def per beat by **section/energy** instead of the literal `obstacle`/`cube`/`drone` rolls: a per-section `pools[]` of def keys (e.g. `apex -> ['eighth_note','accent','trill']`), weighted by `dense`. `procedural.js` and `analyze.js` call `generateEvents` unchanged — only the chosen `def` strings differ. Legacy `subtype:'drone_fast'` becomes `def:'drone_fast'` (its own registry entry, or `params.fast`).

### Migration path — existing three as defs (no loss of pooling/perf/collision/grazing)

| def key | geo | init | behaviour | shootable | death |
|---|---|---|---|---|---|
| `pillar` | unit `Box(1,1,0.8)` | `scale(size,height,1)`, `pos(x,height/2,spawnZ)`, `hx=size/2 hy=height/2 hz=0.4` | `z += (speed+pillarBonus)*60*dt` | no | none |
| `cube` | `Box(.9,.9,.9)` | `pos(x,1.2+rand*.8,spawnZ)`, `state.offset/spin` rng | approach + `x+=sin(time+off)*.02*step` + `rot.x/y+=spin*step` | yes | mini ×4 |
| `drone` | `Cone(.4,1.2,4)` | `pos(x,1.5,spawnZ)`, `extras`→laser line, `state.fire` fsm reset, `aggression` | the full `_updateDrone` body (track+wobble idle, beat charge→fire, beam visuals, sets `ctx.mgr.laserHit`) | yes | particle ×8 |

- **Pooling preserved**: still one `Pool` per def key, acquire/hide/recycle. Pillar's unit-box-scaled-per-spawn trick lives in `pillar.init`, so variable sizes still recycle.
- **Perf preserved**: `geo()`/`mat`/`edges` built once per def in the constructor; only debris keeps per-instance material.
- **Collision/grazing preserved**: same `hx/hy/hz` + `nearMissed` contract; `checkShip` untouched.
- **Laser preserved**: drone's beam is just a `behaviour` + an `extras` per-instance `THREE.Line`; `LASER` config, beat sync, and `mgr.laserHit` are identical.

New roster enemies (notation-shaped: movement derived from a glyph's *meaning* + *shape*) are then pure additions to `DEFINITIONS` — no manager edits.


## Notation Enemy Roster (1 of 2)

Dual-lens principle: each enemy's motion comes from BOTH what the glyph MEANS (musical function) and what it LOOKS like (silhouette). Rows below favour mappings where the two agree, so the motion *reads* as the symbol on sight.

| Name | Glyph | Shape (three.js) | Meaning->behaviour | Form->behaviour | Behaviour (library) | HP / dodge-only | Role |
|---|---|---|---|---|---|---|---|
| Jelly (Sustain Release) | Ped&nbsp;* | Domed bell + trailing tendril cylinders | Pedal lifts: sound decays -> sinks/fades as it drifts in | Jellyfish bell -> slow pulsing bob, tendrils sway | `drift` + `pulseBob` + `fadeOut` | 2 HP | Soft floater, late-fade threat |
| The Rests | 𝄻 𝄼 𝄽 𝄾 | Stacked bars (whole/half) + quarter/eighth flags | Silence -> dormant, inert until its own beat lands | Blocky bar -> snaps rigid then jabs straight | `dormantUntilBeat` -> `lungeForward` | 1 HP (3 HP whole) | Ambush; punishes the gap |
| Fermata | 𝄐 | Half-dome + central iris sphere (eye) | "Hold" -> freezes/slows world scroll while present | Watching eye/dome -> hovers, gaze tracks ship | `hover` + `scrollDamp` + `lookAt` | 4 HP | Tempo-killer / mini-boss beat |
| Treble Clef | 𝄞 | Swept spiral tube (TubeGeometry on helix) | Sets HIGH register -> patrols UPPER lanes only | Spiral curl -> spirals inward on entry | `spiralIn` + `patrolHigh` | 3 HP | Upper-lane zoner |
| Trill | tr / 𝄿𝄿 | Twin tight beads + zigzag ribbon | Rapid alternation -> buzzing fast back-and-forth | Wavy line -> vibrating sine weave across X | `fastWeave` (high-freq sine) | 2 HP | Speed harasser |
| Coda | 𝄌 | Torus ring + crosshair bars through centre | Navigation "go-to" target -> seeks/homes the ship | Crosshair -> locks aim, relentless slow approach | `homeSeek` (slow, capped turn) | 5 HP, shootable | Hunter; rewards killing it |
| Brace | { | Tall curly-bracket extrusion (ExtrudeGeometry) | Joins staves -> spans lanes as a long wall | Bracket curve -> sweeps a vertical barrier arc | `laneBarrier` (slow lateral sweep) | Dodge-only | Lane-denial; fly through the gap |
| Staccato | &middot; | Small spiky dodecahedron, gap-spaced | Short detached notes -> blinks in/out, no sustain | Dot -> tiny, darts in quick stabs | `blinkDash` (telegraph -> stab -> vanish) | 1 HP | Twitchy chip-damage swarmer |


## Notation Enemy Roster (2 of 2)

Same dual-lens rule as part 1: each enemy's movement reads BOTH from what the symbol *means* and what it *looks like*. Behaviours map to the data-driven library (`movement`/`hp`/`dodge`/`role` config on the spawn record), not bespoke classes.

| Name | Glyph | Shape | Meaning->behaviour | Form->behaviour | Behaviour | HP/dodge | Role |
|---|---|---|---|---|---|---|---|
| Sharp | ♯ | tight grid of crossbars | "raise a semitone" -> nudges UP one lane on entry | spiky lattice -> jabby, edgy steering | enters low, snaps up one lane, holds | 2 / low | pressure |
| Flat | ♭ | round-bellied b | "lower a semitone" -> sinks DOWN one lane | soft belly -> slow, heavy drift | enters high, eases down a lane, lingers | 2 / low | pressure |
| Natural | ♮ | open box, two stems | "cancel" -> negates your last graze multiplier on hit | neutral frame -> straight, no flinch | bores straight at ship, unbothered | 3 / none | denial |
| Doublesharp | 𝄪 | bold X | "raise two" -> jumps UP two lanes at once | X cross -> diagonal dart | hard diagonal leap across two lanes | 2 / med | feint |
| Staccato Swarm | · · · | tiny dots | "short/detached" -> brief darting hops, gaps between | dot cluster -> many small bodies | 4-5 tiny units doing quick uncoordinated hops | 1 each / high | swarm |
| Slur Pair | ⌢ | arc tethering two | "smooth/linked" -> the pair moves as ONE smooth unit | tether arc -> bound, mirrored | two enemies on a tether, glide in sync; kill one, other speeds up | 2+2 / med | tether |
| Accent | > | single wedge point | "emphasis" -> one sharp committed jab | arrow point -> forward stab | telegraphs, then one fast straight jab at ship | 2 / low | jab |
| Sforzando | sfz | fat wedge + tail | "sudden hard accent" -> lunges ON the beat, recoils | heavy head -> punch-and-retreat | beat-synced lunge toward ship, backs off, repeats | 3 / med | rhythm |
| Crescendo | < | opening wedge | "get louder" -> grows + speeds up as it nears | widening mouth -> spreads to block lanes | starts small/slow in one lane, swells to cover 2-3 lanes by the time it arrives | 4 / none | zone |
| Decrescendo | > | closing wedge | "get softer" -> shrinks + slows, recedes | narrowing tail -> peels away | enters big/threatening, contracts to a sliver and drifts off-lane | 2 / low | fakeout |
| Glissando | ⟋ | diagonal slide line | "slide" -> sweeps smoothly across all lanes | rake stroke -> continuous sweep | crosses the full lane width in one smooth pass, no stops | 2 / high | sweep |
| Caesura | ‖ | two slashes | "stop/grand pause" -> halts its lane briefly | railroad bars -> a wall, then go | scrolls in, freezes mid-lane for a beat (timing trap), resumes | 3 / none | trap |
| Ottava | 8va | 8 + dotted line | "up an octave" -> jumps a whole lane/octave | dotted leap -> hop with a gap | advances, then teleport-hops a full lane up, dotted-line tell | 2 / med | reposition |
| Dal Segno | 𝄋 | S with slash + dots | "go back to sign" -> loops: retreats then returns | spiral S -> in-and-out curl | rushes in, retreats to spawn, loops back a second time | 3 / med | loop |
| Breath Mark | ' | small comma | "brief breath" -> a short pause/gap in its lane | tiny comma -> light, fleeting | drifts in, pauses a half-beat (opening), slips through | 1 / high | gap |

### Behaviour coverage
The full roster (parts 1+2) exercises every library behaviour: lane-step (`sharp`/`flat`/`ottava`), straight-bore (`natural`/`accent`), diagonal/leap (`doublesharp`), swarm (`staccato`), tethered-pair (`slur`), beat-synced lunge (`sforzando`), grow/shrink scaling (`crescendo`/`decrescendo`), cross-lane sweep (`glissando`), freeze/timing-trap (`caesura`), and retreat-return loop (`dalSegno`/`breathMark` gaps).
Movement primitives reused: `step`, `bore`, `dart`, `hop`, `lunge`, `sweep`, `freeze`, `scale`, `loop` — all config-driven, no per-enemy class.
HP/dodge and `role` tags (pressure/denial/swarm/zone/trap/loop) let `eventgen.js` pick enemies by section intensity rather than hardcoding spawns.


# 90 — Risks, Decisions & Build Order

Adversarial review of the five features (Barrel Roll `20`, Accel/Brake `30`, Gates `40`, Data-Driven Entity System `50`, Notation Roster `60`) against the real code. Every call is grounded in a cited seam.

## Risks & Decisions

### R1 — Accel/brake vs the fixed song clock (correctness, HIGH)
The game is honest because two `index.js` lines are decoupled: the **move/scroll** path `gameSpeed = SPEED.base * sect.speed` (`:232`) and the **spawn** path `while (cursor < ev.length && ev[cursor].time <= songTime)` (`:240`). Accel/brake (`30`) modulates the first; spawns must stay on `songTime`. The intended edit — multiply *only* `gameSpeed` at `:232` — is correct precisely because spawn timing never sees `speedAmount`. The lurking failure is a later refactor deriving a "world clock" from the modulated speed and feeding it back into spawn/cull/beat math. Note the desync `30` itself flags: travel speed varies but spawn time doesn't, so spatial spacing between consecutive hazards compresses under accel — intended, not a bug — but sustained brake packs the far field (see R4).
- **Call:** Make it a hard code invariant, not just prose. `speedAmount` is private to the scroll path; the `gameSpeed *= speedScale` block at `:232` is the ONLY write site. Add a comment at `:240` (`// songTime ONLY — accel/brake must never desync spawns`). Forbid `speedAmount` from reaching `audio.songTime`, the beat cursor, or `effects.update(delta, songTime)`. The asymmetric clamp `[accelMin 0.7 .. accelMax 1.3]` is the safety rail; keep it on the *result*, not the input.

### R2 — Roll hitbox-swap vs collision & grazing (design, MEDIUM)
The roll (`20`) reuses `startInvuln()` AND swaps `hx↔hy` in `ship.js hitbox()`. But the death test is gated by `if (ship.invuln <= 0)` (`index.js:262`), so while i-frames are live the swapped box is never consulted — if `rollIframes >= rollActive` the "thread a tall gap with a rotated box" mechanic is **dead code** and the roll is just a panic button. Two further interactions: (a) graze is gated on `ship.invuln <= 0` (`index.js:258`), so you correctly cannot farm graze mid-roll — keep that; (b) `SHIP.half = [0.6, 0.5, 0.75]` is nearly square, so even when the swap is active it barely changes clearance and may feel inert.
- **Call:** Ship `rollIframes < rollActive` (e.g. `rollActive 0.30–0.35`, `rollIframes 0.18–0.25`) so a *recover* window exists where the swapped box, not invuln, decides the hit — that window is where the skill lives. Separately, widen `SHIP.half` asymmetry (e.g. `[0.7, 0.45, 0.75]`) so the transpose meaningfully changes clearance; keep the swap a pure transpose, never a scale. If playtest finds it fiddly/illegible, fall back to deflect-only with `rollIframes:0` exposed as a hardcore toggle.

### R3 — Roll, steer-bank, and roll-spin all write `group.rotation.z` (correctness, MEDIUM)
Steering sets `group.rotation.z = -(targetX - x) * bankFactor` (`ship.js:110`) unconditionally every frame. The roll must COMPOSE (`rotation.z = bank + roll`), not assign, or one clobbers the other. With `bankFactor 1.8` a hard turn already banks a lot; adding ±π/2 on top can momentarily read as >120° and look glitchy.
- **Call:** Exactly one assignment site: `group.rotation.z = bank + this.roll`. During an active roll, damp the steer-bank term (×~0.4 while `|roll| > rollAngle*0.5`) so they don't stack into an ugly over-rotation. Keep steer INPUT live (ship still moves on X) but subordinate the bank visually — this also resolves `20`'s open question on steering authority during a roll.

### R4 — Brake far-field pile-up vs fixed clock + per-entity cost (perf/correctness, MEDIUM)
`despawnZ` culls only the NEAR side (`m.position.z > SPEED.despawnZ`, `entities.js:175`); spawns enter at `spawnZ -90` on `songTime`. Under sustained brake (`accelMin 0.7`) entities travel slower but keep spawning on-beat, so the −90→0 corridor holds more simultaneous live entities than the densest section was tuned for. Each runs full `update` logic and an O(n) `checkShip` test, and the roster (`60`) makes each entity heavier — the cost multiplies.
- **Call:** `accelMin 0.7` is the right primary guard but not sufficient alone. Add a soft on-screen cap measured on the densest section (`apex`, speed 1.5). If exceeded, do NOT spawn-drop (that visibly desyncs the event map) — instead nudge the effective floor up so the field drains faster than it fills. This is the one item needing a real profiling pass, not a guess; capture an `entities.length` baseline during the entity refactor and re-check at 0.7× through `apex`.

### R5 — Gate pass-through vs body-hit & graze (correctness, HIGH)
`checkShip` (`collision.js:47`) treats every entity as a lethal AABB and `break`s on first `intersects`. A gate is a torus you fly INTO the centre of; if it reaches that loop, flying through it is instant death — gates become walls. `40` correctly routes gates out of `checkShip` and adds a dedicated disc test `checkGates()`.
- **Call:** `if (e.type === 'gate') continue;` must be the FIRST statement in the `checkShip` loop so a gate never reaches `intersects` OR `grazeCloseness` (no free graze for aiming at a ring). The pass test is a **latched half-space crossing** (`z >= ship.z` once, guarded by `passed || missed`), NOT a thin `Math.abs(z) < eps` band — at 1.3× boost / low FPS a thin band tunnels (same class as the R1 spacing concern). Per-spawn reset of `passed`/`missed` in the pool-recycle path (`_spawnGate`) is mandatory; a recycled gate that kept `passed=true` silently stops scoring (the same trap the existing factories avoid by resetting `nearMissed`). Because the ship now flies in Y, the disc is a true 2-D test — flying high to clear a low ring is a real miss; good, gates reward the Y axis.

### R6 — Gate chain vs combat streak: independent reset systems (design, LOW)
The game already has a combat streak (`stats.streak`, grown by graze/kill, reset to 1.0 on death and decremented in `absorbHit`). The gate chain is a SEPARATE counter (resets on a missed ring OR any absorbed/lethal hit). Coupling them — a graze breaking the chain, or a gate miss nuking the combat streak — would feel arbitrary. Note both reset on a hit, so they share the "don't get hit" pressure but are otherwise orthogonal.
- **Call:** Keep them fully independent state. Gate chain resets on: ring sweeps past un-passed, OR `absorbHit`/`die`. Combat streak is untouched by gate events; grazing does not touch the gate chain. Two HUD elements, two colours — gold combat streak (exists) vs cyan gate chain — so the player reads "flow" apart from "combat".

### R7 — One speed channel, but build order decides whether the fallback is needed (dependency, MEDIUM)
Both `30` and `40` write `Game.speedAmount`. If gates ship first, the channel doesn't exist and `40` falls back to a local decaying `gateBoost` multiplied into `gameSpeed`. Gate boost is accel-only with hold+decay, so a player actively braking has their brake partially fought by an incoming boost.
- **Call:** Build `30` BEFORE `40` so gates write the real channel and the fallback is never used. Gate boost stays accel-only and ADDITIVE into the same `[0.7, 1.3]` clamp — no second clamp, no second decay curve. A braking player who threads a gate gets the brake partially cancelled; accept that, it rewards threading even while cautious.

### R8 — Data-driven entity refactor changes the dispatch THREE features branch on (architecture, HIGH)
Today `type` is switched everywhere: `entities.update` per-type branch, `_poolFor`, `_releaseEntity`, `destroy`, `spawn` route, plus `checkShip`'s gate-skip and `eventgen`'s `type/subtype` emit. `50` replaces bespoke `_makeX`/`_updateX` with one def-keyed factory + a named `BEHAVIOURS[def.move.name]` dispatch. Every other feature touches this surface: roll touches none of it (good), accel/brake reads only `gameSpeed` (zero entity edits — correct), gates ADD a type, the roster ADDS ~15 defs.
- **Call:** `50` MUST land first or `40` and `60` get written twice (bespoke, then migrated). The refactor delivers: (1) a `DEFINITIONS` map keyed by string, each `{ geo, mat, edges, half, shootable, hp, behaviour, params, death, points }`; (2) `pool.js` stays generic — one `Pool` per def key; (3) `update` dispatches on `def.behaviour` with the generalized `_updateDrone` signature `(e, dt, ctx)`; (4) `eventgen` emits `{ type:'entity', def, x, params }`. Keep `obstacle/enemy/effect/section` as event CATEGORIES for eventgen density logic, but entity identity becomes `def`. Migrate pillar/cube/drone with bit-identical behaviour as the regression gate.

### R9 — Perf of many pooled notation enemies (perf, MEDIUM)
`_buildSharedResources` builds geo+material ONCE and shares it; only debris owns per-instance material. The ~15-glyph roster (`60a/60b`) threatens this: each glyph wants bespoke geometry, and `spiral`/`orbit`/`weave`/`homeSeek`/tethered `slur` cost more per frame than a pillar's single `z +=`. Heavier still: tethered pairs and swarms multiply the entity count, and `attack:'beam'` defs run the LASER fsm on top.
- **Call:** Enforce the shared-resource rule per def: geometry+material built ONCE at registration, shared across all instances (the pool already guarantees instance reuse). Build glyphs from cheap primitives or a single extruded `THREE.Shape` per glyph (as the ship wing does) — never per-spawn SVG/font meshes. Behaviours allocate NOTHING per frame — reuse scratch objects like `_updateDrone` does; ban `new Vector3()` in the hot path. Cap distinct active def-types per section in `eventgen` so the densest section doesn't run 15 heavy behaviours at once. Re-run the R4 profiling with the roster enabled.

### R10 — Photosensitivity: four new flare sources (safety, MEDIUM — non-negotiable)
The game keeps a moonlit baseline and ramps light from player action. New flares: roll engine-flare, accel speed-rush / optional FOV, gate cyan burst (`effects.gateLevel`), gate-chain HUD pulse. Each is a potential strobe.
- **Call:** All new flares are single-ramp, decay-only, no oscillation (mirror `fireLevel`/`gateLevel` decay). NO FOV kick on accel in v1 (motion-sickness risk too) — defer behind a settings toggle, default OFF. Route the gate burst THROUGH the existing `LIGHT.maxPlayer` clamp rather than adding an uncapped light. Missed-gate red is a one-shot dim, not a flash loop. HUD pulses use CSS opacity/transform transitions, not `Math.sin`-driven opacity strobes. Roll shake stays ≤0.1. This is a gate on each phase, not a final pass.

### R11 — Mobile: every new mechanic is keyboard-only (platform, MEDIUM)
`input.js` touch is three thirds (`zone()`): centre fires, sides steer. There is no touch path for vertical, roll (Q/E), or accel/brake (Shift/Z). The gate-chain HUD proposed bottom-centre collides with the centre-fire touch zone.
- **Call:** v1 ships all new mechanics keyboard-only and DEGRADES GRACEFULLY — the game is fully playable steering + firing + passively passing gates without roll/accel. Do NOT cram roll/accel onto the 3-zone model; defer a real mobile scheme (on-screen buttons or gestures) to a dedicated pass. HARD CONSTRAINT NOW: move the gate-chain HUD OFF bottom-centre (bottom-left or top-centre) so it never overlaps the `zone()` centre-fire region — a one-line CSS decision, make it now.

### R12 — Key bindings: Shift/Ctrl have browser/OS baggage (UX, LOW)
Q/E roll is clean (free keys, no browser default). For accel/brake, `30` proposes Shift=accel / Ctrl=brake, but Ctrl is risky: Ctrl+W closes tabs, Ctrl+arrow is OS workspace switching, and many Ctrl combos hit browser shortcuts. Shift is safe; Ctrl is not.
- **Call:** Accel = `Shift` (hold). Brake = a dedicated letter, recommend `Z` (left hand, near steer, no browser combo) instead of `Ctrl`. Avoid Ctrl entirely. `preventDefault` the chosen keys in the keydown handler as already done for Space. Confirm binding with the user (open question below).

## Open Questions for the user

Genuine choices the code can't decide:

1. **Roll identity (R2):** Deflect-only panic dodge (forgiving, simple), or the skill version where a rotated hitbox threads tall-narrow gaps (needs widened `SHIP.half` asymmetry + `rollIframes < rollActive`)? Recommend the skill version with a `rollIframes:0` hardcore toggle — but how punishing the game should feel is your call.

2. **Accel/brake brake key (R12):** Confirm `Shift` = accelerate, `Z` = brake (avoiding Ctrl). Or a preferred binding?

3. **Brake cost (R1/R4):** Is "foregone graze points" enough to stop a player turtling at 0.7× the whole song, or do you want an explicit score/streak bleed while braking? Recommend foregone-graze-only first; add bleed only if playtests show turtling.

4. **Gate boost taper (R7):** A long gate chain can pin speed at the 1.3× ceiling. Is rising speed a desirable flow-state reward, or should boost-per-pass taper as the chain grows so it plateaus below max?

5. **Gates under fire (R5/R6):** Should `eventgen` reserve a clear corridor around gates, or deliberately put drones/obstacles inside rings as a "thread-under-fire" skill test? Affects how the roster and gates co-spawn.

6. **Roster scope (R8/R9):** All ~15 notation glyphs, or a curated first wave (e.g. treble-clef spiral, fermata hold, rest hover, staccato swarm, trill weave) to validate the def system before committing art/perf budget? Recommend a 4–5 glyph first wave.

## Recommended Build Order

Strict dependency order. The entity refactor is the keystone — everything heavy depends on it.

### Phase 0 — Data-Driven Entity System (`50`) — effort **L**, BLOCKING
Land first or `40` and `60` get written twice (R8). Deliverables:
- `DEFINITIONS` map keyed by def-string, each `{ geo, mat, edges, half, shootable, hp, behaviour, params, death, points }`.
- Named movement behaviours as pure `(e, dt, ctx)` functions sharing the `_updateDrone` signature: `approach`, `track`, `seek/home`, `spiral`, `tumble`, `spin`, `weave`, `orbit`, `hover`, `driftDown`, `barrier`.
- `pool.js` stays generic; one lazily-built `Pool` per def key, shared geo/mat per def (R9).
- `spawn`/`update`/`_releaseEntity`/`destroy` dispatch on `def`, not `type` string; `_poolFor` dropped.
- `eventgen` emits `{ type:'entity', def, x, params }`; migrate pillar/cube/drone with IDENTICAL behaviour (regression-safe). `attack:'beam'` stays an orthogonal attached component running the LASER fsm.
- **Exit:** existing game plays bit-identically through a full song; pool churn unchanged; `entities.length` baseline captured on `apex` (feeds R4).

### Phase 1 — Roll (`20`) — effort **M**, independent
Self-contained on `Ship` + one `update()` arg; touches no entity code. Good early win.
- `input.getRoll()` (Q/E); roll state machine composing `group.rotation.z = bank + roll` (R3, damp bank during roll); `hitbox()` swap gated to the recover window (R2); HUD roll-ready arc; `SHIP` config block.
- **Exit:** rolling deflects in the i-frame window AND threads a deliberately-placed tall-narrow gap in the recover window (proves R2 isn't dead code).

### Phase 2 — Accelerate/Brake (`30`) — effort **M**, BEFORE gates
Build before gates so the `speedAmount` channel exists and gate boost needs no fallback (R7).
- `speedAmount ∈ [-1, +1]`, Shift=accel / Z=brake (R12), smoothing in + decay to neutral; asymmetric gains.
- SINGLE write at `index.js:232` (`gameSpeed *= 1 + speedAmount*gain`), clamp `[0.7, 1.3]`; spawn loop untouched (R1); graze amplifier folded into `onGraze`; HUD speedometer.
- **Exit:** R4 pile-up profiled on `apex` at 0.7×; on-screen entity count stays within the Phase-0 baseline + margin, or the soft floor-nudge guard is in.

### Phase 3 — Gates (`40`) — effort **L**, depends on Phases 0 + 2
Now a clean entity def (R8) writing the real speed channel (R7).
- Gate def + `behaviour:'static'/'approach'` + slow self-spin + approach glow; `checkShip` gate-skip as the first loop statement + graze exclusion (R5); latched half-space `checkGates()` disc test; per-spawn `passed/missed` reset (R5); independent cyan chain HUD off bottom-centre (R11); `effects.gateLevel` single-ramp through the `LIGHT.maxPlayer` clamp (R10); `eventgen` cadence gates + ring runs.
- **Exit:** no tunnelling at 1.3× boost / 30fps; recycled gates score correctly; chain resets independently of the combat streak (R6).

### Phase 4 — Notation Roster (`60`) — effort **L**, depends on Phase 0
Pure config on the def system if Phase 0 is right — new enemies are data, not classes.
- Start with a 4–5 glyph first wave (OQ6): treble-clef → `spiral`, fermata → `hover`+scroll-damp, rest → `dormantUntilBeat`/idle, staccato → `blinkDash` swarm, trill → `weave`. Each = one extruded `THREE.Shape` glyph + a named behaviour + `role` tag.
- Shared geo/mat per def (R9); behaviours allocate nothing per frame; `eventgen` picks defs by section intensity via `role` tags and caps distinct active def-types per section.
- **Exit:** re-run R4/R9 profiling with the roster enabled on the densest section; full roster only after the first wave validates perf + feel.

### Cross-cutting, every phase
- Photosensitivity review (R10) gates each phase's flares — not a final pass.
- Mobile graceful-degradation check (R11) per phase: game stays playable keyboard-less.
- Hold the R1 invariant: never let `speedAmount` reach the spawn / song / beat cursors.


