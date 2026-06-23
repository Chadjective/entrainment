# FJORDNACHT — Thematic Direction

## Theme Statement

FJORDNACHT lives at the edge where the cold natural sublime — the black fjord, the low moon, still water, the slow aurora, the long polar night — is threaded through by a synthetic neon grid, and every motif is a mechanic: the mirror floor you read, the aurora sky that reacts, the dusk-to-dawn ramp that paces you, the echo and resonance of your shots, and the held beat of stillness and breath.

## Cohesion Context

"The list does NOT yet hang together as one vision — it reads as twelve mood boards (one per lens) that independently rediscovered the same five physical primitives: a mirror floor, an aurora sky shader, a dusk-to-dawn color ramp, echo/resonance bullets, and a stillness/breath beat. Black Mirror Water = Glass Fjord = Fjord Mirror = Reflector Fjord = Reflective Floor = Stillwater; that's ONE feature with six names. This is actually GOOD news: it means the true game is small and focused — maybe 4-5 core systems — and most 'concepts' are skins on them. The danger is shipping all twelve lenses literally and getting incoherent visual noise that violates the photosensitivity/perf/mobile constraints. The unifying spine that's IMPLICIT but never stated: a single moral-visual axis of LIVING organic light (fjord, aurora, bioluminescence, the warmth/thaw meter) vs DEAD synthetic neon (the grid, the Tyrell Drill, the machine) — the 'natural-world-bioluminescence' and Tyrell-Drill framing is the only lens that gives the player a STAKE rather than a palette, and it should be promoted to the organizing principle everything else feeds. Recommend: pick the Reflector floor + Stillness/Breath + Light-you-make as the three load-bearing systems, treat aurora/palette/dusk as the reactive skin over them, and route every idea through the living-vs-dead-light axis so the seven sections become a single dusk-to-dawn story rather than seven difficulty tiers."

## Signature Mechanics

The defining, theme-driven systems for ENTRAINMENT — a dark fjord at night where light is scarce, earned, and read in the water. Both judge and critic converge on one thesis: a single living-vs-dead-light axis, with the **mirror floor**, **stillness/breath**, and **light-you-make** as the three load-bearing systems. The rest are reactive skin over them.

| # | Mechanic | Effort |
|---|----------|--------|
| 1 | Black Mirror Water + Reflected Telegraph | M–L |
| 2 | Play By The Light You Make | S |
| 3 | Stillness Is Cover (Held Breath) | S |
| 4 | Tide Inversion (section world-swap) | M |
| 5 | Echo Phantoms | M |
| 6 | Resonance Charge (sustained-note beam) | S |
| 7 | Tyrell Drill (narrative spine) | S |

---

### 1. Black Mirror Water + Reflected Telegraph

**What it is.** A reflective fjord floor (Three.js `Reflector` / mirrored render) replaces or underlays the scrolling grid. Incoming attacks and lanes appear in the reflection a beat *before* they resolve in real space — so the water is load-bearing UI, not decor. You read threats by looking down.

**Why novel.** Almost no rail shooter makes the mirror functional. It fuses the band's two motifs — reflection + the natural sublime — into one inseparable rule, and the "tell" lives in the reflected second playfield.

**How it plays.** During a drone's `charging` state the lane/beam is shown only (or first) in the water; the real beam resolves on the next beat. You scan the mirror to pre-dodge, then confirm in real space.

**Hooks.**
- `src/game/grid.js` — `_buildHorizontal`/`_buildVertical` floor is the swap target; gate a `Reflector` plane by device tier (static fake-reflection on weak devices).
- `src/game/entities.js` — `_updateDrone` already runs a `idle→charging→firing` state machine (`f.state`, `LASER.fireWindow`); drive the reflected tell off `charging`.
- `src/core/config.js` — `LASER.rangeFar/rangeNear`, beat-synced fire window.

**Effort.** M–L. One extra render target is the only new GPU cost; gate it.

---

### 2. Play By The Light You Make

**What it is.** Baseline darkness. Ambient + bloom sit LOW at rest; the player's firing, grazing streak, and shield state become the dominant light source. You cannot see hazards unless you generate light — and your light also reveals you to the Tyrell machine.

**Why novel.** Inverts the existing curve→light pipeline: light stops being decoration and becomes the core risk economy. "Manage your light" exists (Amnesia, Alan Wake) but the signature here is coupling it to the cold-moonlight palette and the music.

**How it plays.** Go quiet and you go blind but unseen; fire and graze and you light the lane but draw fire. Continuous tension between seeing and hiding.

**Hooks.**
- `src/game/effects.js` — retune `update()`: `lights.point.intensity`, `lights.ambient.intensity`, and `post.setStrength(...)` are already driven from `piano`/`masterRms`; pull baselines down and add `ship.flash`/`grazeStreak` as the dominant term. Zero new objects.
- `src/game/scene.js` — lower `SCENE.ambientIntensity` / `pointIntensity` defaults.
- `src/core/config.js` — `BLOOM` (clamp at `BLOOM.max` for photosensitivity), `GRAZE.maxStreak`, `SHIELD`.

**Effort.** S. Pure retune of the existing pipeline.

---

### 3. Stillness Is Cover (Held Breath)

**What it is.** During low-energy `breath` passages, holding still / not firing is safe or rewarded — regen, scoring, becoming unseen. A stillness meter turns the song's calm into rules, not mood.

**Why novel.** Inverts the genre's twitch grammar and is the literal embodiment of *entrainment*: the player physically syncs to the song's quiet. It is the opposite pole the loud sections need to feel loud.

**How it plays.** The `breath` section becomes a real lull: go dark, hold still, regen a shield charge, read the water, then brace for the next surge. Gives the run a tide / dusk-to-dawn shape without a separate palette system.

**Hooks.**
- `src/audio/eventgen.js` — `SECTION_DEFS` already contains `['breath', 1.0]`; section boundaries emit `type: 'section'` events.
- `src/core/config.js` — `SHIELD.regenSec` (28s) is the natural reward economy; `GRAZE` for the alternate scoring path.
- `src/input/input.js` — read fire-held / idle for the stillness meter.

**Effort.** S. Almost no new tech — a meter off input + the existing breath section.

---

### 4. Tide Inversion (Section World-Swap)

**What it is.** At an authored section boundary, the world flips — the reflection becomes the real plane (and vice versa). The mirror tech's most cinematic payoff, timed to a named section.

**Why novel.** Turns the existing section data into authored dramatic beats rather than speed tiers; maps onto the dusk-to-dawn arc. The kind of moment players screenshot.

**How it plays.** A clean swap at `apex` or `breath`: up becomes down, the water you were reading becomes the floor you fly on. Controls stay legible; no hard flash.

**Hooks.**
- `src/audio/eventgen.js` — `defaultSections()` already carries `{time, name, speed}`; trigger the swap on a `section` event.
- `src/game/grid.js` — reuses the `Reflector` plane from #1.
- `src/game/effects.js` — `trigger()` for the boundary cue (keep inside `BLOOM.max`, no flash).

**Effort.** M. A swap, not a rewrite — but must respect photosensitivity and control legibility.

---

### 5. Echo Phantoms

**What it is.** Enemies/hazards that are time-delayed echoes of an earlier phrase or of the player's own recent path, replayed via a ring buffer of past positions/events fed into the pooled spawner.

**Why novel.** Recurs across four lenses (echo, light, sound, memory) — a true pillar. Resonates with the song's call-and-response and adds the memory/longing layer cheaply.

**How it plays.** A phrase you survived returns as a ghost wave; your own path haunts you. Reinforces the title *Entrainment*. Use sparingly so it reads as design, not gimmick.

**Hooks.**
- `src/game/entities.js` — feed the ring buffer into `spawn()` / the existing `Pool`s (`dronePool`, `cubePool`); no new allocation.
- `src/core/pool.js` — pooled acquire/release already in place.
- `src/audio/eventgen.js` — schedule echoes off the beat grid / phrase structure.

**Effort.** M. A position/event ring buffer into the existing spawner.

---

### 6. Resonance Charge (Sustained-Note Beam)

**What it is.** Holding fire through a sustained note (readable from `master_rms` / `master_centroid` staying high) charges a stronger shot. The weapon entrains to the track.

**Why novel.** Ties the weapon rhythm to the music instead of being rhythm-agnostic, reinforcing the game's own name. More conventional than the top tier, but a crisp single rule (beam-as-tuning-fork) keeps it distinct.

**How it plays.** Spray on staccato; hold and release on a held note for a heavy shot. Playing *with* the song is rewarded.

**Hooks.**
- `src/game/bullets.js` — fire/charge logic; `BULLET.speed`, `BULLET.fireIntervalMs`.
- `src/game/effects.js` / `src/data/loader.js` — `sampleCurve(c.master_rms / c.master_centroid, songTime)` already sampled per frame.

**Effort.** S. Builds on `bullets.js` + the existing curve sampler.

---

### 7. Tyrell Drill (Narrative Spine)

**What it is.** The neon grid reframed as an antagonist machine drilling the living fjord and draining its light. Cohesion glue: every choice to make light (#2) is a choice against the drill.

**Why novel.** Gives the game an antagonist and stakes rather than a palette. The song is literally `SONG.title = 'TYRELL CORPORATION'`, so this framing is canon, not decoration — it's the organizing principle the whole living-vs-dead-light axis hangs on.

**How it plays.** The pyramid/sun backdrop reads as the machine; the `apex` section is its climax. Less a discrete mechanic than the story that binds the others into one run.

**Hooks.**
- `src/core/config.js` — `SONG.title` ('TYRELL CORPORATION'), `COLORS` (cold neon vs organic light).
- `src/game/grid.js` — `_buildPyramid` / `_buildSun` become the machine and its apex.
- `src/audio/eventgen.js` — `apex` in `SECTION_DEFS` as the climax beat.

**Effort.** S. Reframing + cues over existing geometry; mostly authored meaning.

---

> **Avoid:** passive beat-flash/shake with no decision (engine already pulses + shakes — more flicker only risks photosensitivity); a standalone dusk-to-dawn palette LUT (centroid temperature in `effects.js` already handles recolour); constellation/connect-the-stars bonus waves; "ghost of the best run" leaderboard overlay (only earns its place folded into Echo Phantoms); literal Norse name-drop bosses (keep myth as resonance, not nameplates); aurora as pure backdrop unless it *tells* a hazard. Implementation order respecting perf/mobile/photosensitivity: (1) light-economy retune, (2) reflector floor gated by tier, (3) reflected telegraph, (4) stillness/breath rewards, (5) echo phantoms. Keep all flashing clamped at `BLOOM.max`.

## The Flagship Level: Fjordnacht (Night Fjord)

You fly the narrow throat of a black mirror-fjord through one full night, dusk to dawn, where the synthetic neon grid is dissolving back into the cold natural sublime and the water answers everything you do with its own reflection. The fjord echoes the song a beat-and-a-half late — reading the mirror is the skill, and the dawn at the far mouth is the night agreeing to let you pass.

| Section | Time of night | Lighting/Sky | Water/Tide | Hazard flavour | Signature moment |
|---|---|---|---|---|---|
| Emergence | Dusk (1.0) | Bruised indigo-violet, wire-sun setting low | Glassy near-mirror, almost still | Drift-ice, barely any | First Answer: a pillar's mirror-twin glows up off the water a beat late — teaches the echo |
| Awakening | Blue hour (1.15) | Color cools to moon-silver, first aurora ribbon ignites | Reflections sharpen, faint swell | Telegraph echoes: reflection rises before the real pillar | Aurora Ignition begins; ship becomes the brightest reflected light |
| Engagement | True night (1.25) | Near-black sky, stars full, moon dominant key light | Dark and most readable | Mirror drones spawn from reflections; cliffs tower | The Cathedral of Stacks: basalt sea-stacks rise through a mirror-drone gap |
| Breath | Stillest night (1.0) | Calm moon high, aurora slow | Dead-flat perfect mirror | Hazards vanish; graze/resonance only | The Glass: flawless reflection of moon, aurora and ship; read coming telegraphs in the mirror |
| Escalation | Storm tide (1.35) | Aurora churns and brightens, fog tightens | Choppy, smeared, broken; tide rises | Inversion gates: real-vs-phantom pillars, hard to read | Tide Turns: the perfect mirror smears in real time as gates start arriving |
| Apex | Deepest night (1.5) | Moon and aurora at full, bloom near clamp | Maximum chop, maximum brightness; moon-road lane | Densest; canon drones fire on beat + offbeat | Canon / Moon Road: dodge the rhythm down the moon's reflected column |
| Departure | Dawn (1.1) | Sky lifts to cold blue then pale dawn, moon sinks | Calms to glass, brightens to open sea | Hazards thin to a glide-out | Dawn Mirror: still reflection of lightening sky — a reverse-echo of the dusk you entered on |

### Level Systems

#### Lighting

Three existing lights in `scene.js` retune into a moonlit fjord; no new light objects. The `DirectionalLight` (currently `0x4444ff @ 0.4`, `[0,20,-10]`) becomes the **MOON** — cold silver (`~0xbfd0ff`), high and behind the player (`[0,40,-30]`), intensity driven by `nightT` in `effects.js` (dim at dusk, full at apex, sinking at dawn). The `AmbientLight` (`0x222244`) becomes **SKY FILL** — cold deep-blue, dropping as night deepens so the moon reads harder; the existing `0.3 + piano_rms*0.5` tie stays as a breath on top of the `nightT` base. The `PointLight` (`0x00ffff`, at ship) becomes the **PLAYER-AS-LIGHT** — warm-cyan, beat-pulsed via `ship.pulseGlow`, streaking a moving highlight across the reflective floor. **AURORA** is a new additive shader quad (`fog:false`, like `_buildSun`/`_buildPyramid`), built in `grid.js`, brightness from `master_centroid` and punched on `Effects.trigger('bloom')`; it casts no real light, so it's free.

#### Water & Reflection

The water **replaces the neon grid floor** in `grid.js`. A `THREE.Reflector` floor plane mirrors moon, aurora, sun, pyramid, stars, hazards, and ship for free, tinted cold and dark (`~0x10243a`) to read as deep night water. The scrolling grid lines survive as a faint overlay (reuse `hMaterial` at low opacity) — grid-on-water is the FJORDNACHT thesis. **Tide = dynamics:** `grid.setTide(master_rms)` feeds Reflector UV/normal distortion — glassy at `BREATH`, choppy at `ESCALATION`/`APEX` — and inversely raises the grid overlay opacity. A scrolling normal map gives baseline swell; beats emit ripple rings under the ship. Reflector is gated behind `WATER.reflect` in `config.js` with a device check; low-end falls back to a static plane + fragment-shader fake mirror.

#### The Echo Mechanic

Reflection-as-play, layered on the pooled hazards in `entities.js` + authored in `eventgen.js`. Core rule: certain hazards spawn as a pair — real object above, reflection below — but the **reflection surfaces first, a beat early**, telegraphing what's coming. Reuses the drone `fire.state` machine (`_updateDrone`), beat-locked to the existing `onBeat` signal. Three escalating forms: **(1) Telegraph echo** (`AWAKENING`+) — reflection rises a beat before the pillar; **(2) Resonant drones** (`ENGAGEMENT`+) — a drone and its mirror-twin fire in canon, offset one beat via the `beats[]` array; **(3) Inversion gates** (`ESCALATION`/`APEX`) — paired pillars where the safe gap is the side whose reflection is broken/dim, made harder by choppy high-rms water. Reward: grazing a hazard and its mirrored-Y reflection in one pass (the `GRAZE` multiplier checked twice) gives an "in resonance" bonus.

#### Signature Moments

- **FIRST RISE** (`AWAKENING`): the first hazard's reflection blooms up out of still black water a beat early, before the real pillar descends.
- **AURORA IGNITION** (`ENGAGEMENT` boundary): the aurora ignites across the sky on the section `bloom` event and unfurls upside-down across the water — one ribbon, doubled.
- **THE STILL** (`BREATH`): `master_rms` bottoms, water freezes to a perfect mirror, hazards vanish — a flawless reflection of moon, aurora, and your ship.
- **TIDE TURNS** (`ESCALATION`): rising loudness churns the mirror in real time as inversion gates start arriving on the now-unreadable surface.
- **CANON** (`APEX`): resonant drone twins fire real-on-beat, reflection-on-offbeat — a lane lethal twice per bar; moon, aurora, and bloom at max.
- **DAWN MIRROR** (`DEPARTURE`): night drains to pale dawn, moon sinks, water calms to glass — a reverse-echo of the dusk you entered on.

## Thematic Motif → Mechanic Map

| Motif | Mechanic/Visual it becomes | Hooks (files) | Innovation 1-5 |
|---|---|---|---|
| Light/darkness | Play By The Light You Make: ambient near-zero, firing/grazing throws moving light cones that reveal pillars; sit passive = fly blind | scene.js (lights), bullets/fire.js, collision.js (graze), effects.js (bloom) | 5 |
| Reflection | Reflected Telegraph: hide drone charge beam in air, show it only on the water surface — player must read the mirror to know the firing lane | grid.js (Reflector floor), entities.js (_updateDrone), effects.js | 5 |
| Echo | Echo Phantoms: record ship X over a 1-bar buffer; spawn dim enemy flying the lane you flew one bar ago, resolving on the beat | ship.js (X buffer), entities.js, index.js (beat clock) | 5 |
| Tide | Tideline: water plane Y driven by master_rms — swells up in loud passages to shrink the safe gap, recedes in breath | grid.js (water plane), effects.js (rms), index.js (sections) | 4 |
| Aurora | Aurora Tells: sky shader is diegetic radar — flushes per-lane color ~2 beats before a cluster spawns; washes out on high centroid | effects.js (shader plane), eventgen (event map), index.js (centroid) | 4 |
| Stillness | Stillness Is Cover: in low-rms sections drones can't see a still dark ship; steer/fire/graze raises visibility and lets them lock | entities.js (drone lock), collision.js, ship.js, index.js (sections) | 5 |
| Cold | Cold Bloom Limiter: sustained bright play accrues "glare" → ice-crystal vignette + slightly slower steering; self-balancing photosafe governor | effects.js (bloom/vignette), ship.js (steerSpeed), collision.js | 4 |
| Longing | Sehnsucht Meter: holding fire + grazing fills "longing"; release spends it as a piercing resonant round that clears a whole lane | fire.js, collision.js (graze), entities.js (cubes), effects.js | 5 |
| Myth | Jormungandr: serpent entity — shootable head (reuses drone lunge FSM) + phase-offset dodge-only body segments you weave on the off-beats | entities.js (segment pool, _updateDrone), eventgen ('serpent'), index.js (beats) | 5 |

## Other Innovative Tie-ins

**Reflection & The Mirror World**

- Underworld — submerged hazards invisible above water but lethal at the lane their reflection implies; dodge what you can only see mirrored.
- Tide Inversion — once per run the camera pivots under the waterline; reflections become solid, controls invert vertically.
- Glassfall — apex set-piece: the mirror floor fractures into drifting shards, splitting hazard telegraphs across the cracks.
- Mirror Lane — a sweeping vertical mirror-plane flips the scene horizontally for bars, inverting steering and the memorized gap.
- Reflected Telegraph — drone charge shows only in the water reflection, forcing your gaze down to read the lethal lane.
- Doppelganger Drone — a mirror-twin drone shares the fire clock; safe lane is the axis x=0 unless you kill a twin first.

**Echo, Resonance & Memory**

- Call & Response Phrases — a ghost pattern previews on a "call," then returns one phrase later as real hazards you must perform.
- Reverb Tail Shockwave — kills spawn expanding rings that beat-quantize chain to nearby enemies like a struck bell's overtones.
- Ghost of the Best Run — your recorded best run replays as a non-colliding pace ghost chasing your score to the song's end.
- Sympathetic Strings — pluck fixed-lane resonator strings by passing/shooting; ringing strings power bullets and discharge on the downbeat.
- Echo-Locked Parry — a drone beam returns as a ghost-beam N beats later; parry the delayed echo to nullify both and counter-kill.
- Section Ghost-Replay — calm sections re-stream the just-passed section as harmless ghosts you can still graze for streak.

**Darkness, Light & The Lantern**

- Play By The Light You Make — baseline light near-zero; firing, grazing, and engine glow are how you see the hazards at all.
- The Long Dark (Blackout Beats) — scripted apex beats kill the light for one beat; fly the lane blind by retinal after-image.
- Lantern Discipline — a Lumen resource raises your reveal radius but refills only by grazing in the dark; spend light to survive walls.
- Stillness Is Cover — in calm sections drones can't see a still, dark ship; steering and firing emit light that lets them lock you.

**Water, Tide & The Living Fjord**

- Tideline — a water plane rises with master_rms, shrinking the vertical gap as a diegetic difficulty meter.
- Submersion — scripted dive: water rises over the camera, inertia and bullets slow, hazards become engine-lit silhouettes.
- Tyrell Drill — a machine hazard drinks the color/bloom toward dead magenta; shoot its nodes to reclaim the light.
- Cetacean Pass — one apex leviathan rises through the floor, bowing the grid and dragging the light-pool as it arcs over.
- Resonance Pools — skim a surface zone on a beat to "ring" it into an expanding damage weapon timed to the next beats.

**Norse Myth & Cold**

- Jormungandr — a beat-locked serpent: shootable head lunges, phase-offset body coils open and close as rhythmic gaps to weave.
- Runecasting — shoot a row of runestones left-to-right on the beat to cast effects (freeze, clear lane, score surge).
- Draugr Wake — killed enemies may resurrect on the next beat as slow phantoms unless you graze the corpse marker in time.
- Cryo-Lance (Frost Shot) — freezing an enemy makes an inert scrolling wall; shoot it again to shatter, so where you freeze matters.
- Frozen Beat — pre-authored beats freeze the world while ship/bullets keep speed, the only window to crack ice-shelled enemies.
- Icicle Portcullis — overhead icicles lengthen over a bar then drop on their beat, a vertical rhythm-gate in the unused Y axis.

**Stillness & The Held Breath**

- The Long Note (Silence Cores) — in silence windows, drift still and silent to absorb cores; firing or steering shatters them.
- Held Breath Meter — banking a "still" state lets you exhale a beat-timed shockwave that clears the lane.
- Sehnsucht Meter — holding fire and grazing builds longing, spent as a one-shot piercing round that clears a whole lane.

## Build Order

One thesis: a dark fjord at night where light is scarce and earned. Build in dependency order — cheap retunes first, then the mechanics they unlock, then the flagship level. Every flashing/bloom change stays clamped under `BLOOM.max` for photosensitivity.

### Phase A — Cheap wins (establish the look)

| # | Concept | Files | Notes |
|---|---------|-------|-------|
| A1 | Moonlight retune (baseline darkness) | `effects.js`, `scene.js`, `post.js` | Pull ambient + bloom DOWN at rest. Cold moonlight key only. Zero new objects. |
| A2 | Play By The Light You Make | `effects.js`, `ship.js`, `config.js` | Invert curve→light pipe: drive light from `ship.flash` / `grazeStreak` / shield state, not the track. Hazards invisible until you make light. |
| A3 | Black Mirror Water (reflective floor) | `grid.js`, `scene.js` | Three.js `Reflector` plane under the scroll lines. Gate to low-res / static fake on weak devices. |
| A4 | Palette = centroid temperature only | `effects.js` | Reuse existing cyan↔magenta centroid temp. NO separate palette engine. |

Phase A alone reads as "fjord at night" and proves the light economy with no new systems beyond one render target.

### Phase B — Signature mechanics

| # | Concept | Files | Notes |
|---|---------|-------|-------|
| B1 | Reflected Telegraph (Read It In The Water) | `entities.js`, `grid.js` | Reuse `_updateDrone` charging→firing state machine. The water shows the lane/attack one beat before it resolves in real space. Makes A3 load-bearing UI. |
| B2 | Stillness Is Cover (Held Breath) | `eventgen.js`, `config.js`, `input.js` | `breath` section in `SECTION_DEFS` (speed 1.0) rewards going dark / not firing: regen, score, unseen. Hooks `SHIELD.regenSec` + graze economy. |
| B3 | Resonance Charge (sustained-note beam) | `bullets.js`, `analyze.js` | Hold fire through a sustained note (`master_rms`/centroid high) → stronger shot. Entrains weapon to track. |
| B4 | Echo Phantoms | `pool.js`, `entities.js` | Ring buffer of past positions/events feeds the pooled spawner; enemies are delayed echoes of an earlier phrase / the player's own path. |

### Phase C — Flagship level + set-piece

| # | Concept | Files | Notes |
|---|---------|-------|-------|
| C1 | Tyrell Drill (antagonist spine) | `config.js` (`SONG.title`), `scene.js`, `entities.js` | Neon grid = machine draining the living light. Every "make light" choice is a choice against the Drill. Apex section = its climax. |
| C2 | Section world-swaps | `eventgen.js`, `scene.js` | Author the seven `SECTION_DEFS` as dramatic beats, not difficulty tiers: dusk→breath→apex→dawn tide shape. |
| C3 | Tide / Moonlight Inversion (set-piece) | `grid.js`, `scene.js` | At a section boundary, flip the playfield so the reflection becomes the real plane. NO hard flash; keep controls legible through the swap. |

## Cliches to Avoid

| Cliche | Why to skip |
|--------|-------------|
| Passive beat flash / extra shake | Pulse + shake already shipped; piling on adds nothing and risks photosensitivity. Tie any flash to a decision. |
| Standalone dusk-to-dawn sky clock | Purely cosmetic time tint unless fused with the light economy. |
| Separate Twilight Palette Engine | Redundant — centroid temp already recolours in `effects.js`. |
| Memory / Constellation Targets | Bolt-on shooting gallery; ignores fjord/reflection/light identity. |
| Ghost of Last/Best Run | Worn racer trope; weak payoff unless folded into Echo Phantoms as a diegetic memory. |
| Literal Norse name-drops (Jormungandr/Bifrost/etc.) | Costume-drama kitsch; fights the cold-minimal tone. Myth as resonance, not nameplates. |
| Aurora as passive backdrop (×9 names) | One sky shader wearing many hats. Only earns place if it *tells* a hazard. |
| Reverb-tail shockwave as the whole "intensity" | Fine as one moment; clichéd if it's the entire loud-section design. |
| "Cold Bloom Limiter" et al. as features | Safety constraints dressed as mechanics — they're guardrails, not ideas. |
| Silence read as a bug | Silence-as-solid hazard must be clearly telegraphed or players think it's broken. |