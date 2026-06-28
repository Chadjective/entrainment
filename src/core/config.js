// ============================================================================
// ENTRAINMENT — central configuration.
// Every magic number from the technical spec lives here so the whole game can
// be tuned in one place. Sections reference the spec system numbers.
// ============================================================================

export const COLORS = {
  bg: 0x080818,
  gridDim: 0x003344,
  gridBright: 0x00aaaa,
  cyan: 0x00ffff,
  magenta: 0xff00ff,
  wall: 0x00ffff,
  pillar: 0xff2244,
  cube: 0xff00ff,
  drone: 0xff6600,
  droneFill: 0xff4400,
  star: 0xffffff,
};

// System 4 — scene / camera / lighting
export const SCENE = {
  fogNear: 40,
  fogFar: 90,
  camFov: 70,
  camNear: 0.1,
  camFar: 200,
  camPos: [0, 3.5, 7],
  // Fjordnacht Phase A — moonlit baseline: cold, dim ambient + a silver "moon"
  // directional key high and behind. The player's light does most of the work.
  ambientColor: 0x18223a,
  ambientIntensity: 0.18,
  dirColor: 0xbfd0ff,     // cold moon silver
  dirIntensity: 0.55,
  dirPos: [0, 40, -30],   // high and behind the player
  pointColor: 0x66e0ff,   // warm-cyan player light
  pointIntensity: 0.4,    // base; Effects drives it up with player activity
  pointDistance: 26,
};

// Fjordnacht Phase A — "Play By The Light You Make". Ambient is a dim moonlit
// floor; the player's beat-glow, firing, grazing, and shield are the dominant
// dynamic light source (the point light pooling on the water).
export const LIGHT = {
  ambientBase: 0.16,   // moonlit ambient floor
  ambientMusic: 0.14,  // + piano_rms (a soft breath on top)
  playerBase: 0.45,    // point-light floor
  flashGain: 1.3,      // + ship beat/shot flash
  grazeGain: 1.2,      // + graze closeness
  fireGain: 0.9,       // + recent fire
  fireDecay: 6,        // per-second decay of the fire light
  maxPlayer: 2.4,      // clamp
};

// Fjordnacht Phase A — reflective fjord floor (the "black mirror water").
export const WATER = {
  reflect: true,         // Three.js Reflector; auto-disabled on small viewports
  minWidthForReflect: 820,
  // Reflector tints (multiplies) the reflection — a dark tint hides it. This is
  // bright enough to read as a real mirror while keeping a cold water cast.
  color: 0x88a6c4,
  fallbackColor: 0x14283c,
  size: [240, 420],      // plane W x D
  y: -0.04,              // just below the grid lines so they sit on the surface
  textureCap: 1024,      // reflection render-target size cap (perf)
  gridOverlayOpacity: 0.14, // vertical grid lines kept faint over the water
};

// System 5 — grid floor
export const GRID = {
  hLineCount: 60,
  hSpacing: 2,
  hStart: 0,
  hEnd: -120,
  vMinX: -24,
  vMaxX: 24,
  vSpacing: 2,
  vStartZ: 15,
  vEndZ: -120,
  resetZ: 12,
  wallX: 8,
  starCount: 600,
};

// System 6 — ship
export const SHIP = {
  startPos: [0, 1.5, 0],
  steerSpeed: 12, // units / second of target movement
  vertSpeed: 8,   // vertical (up/down) movement speed
  minY: 0.6,      // floor clearance
  maxY: 4.5,      // ceiling — high enough to clear tall pillars
  pitchFactor: 0.45, // nose tilt while climbing/diving
  lerp: 6,
  clampX: 7,
  bankFactor: 1.8,
  bobFreq: 2,
  bobAmp: 0.03,
  // collision half-extents — wider than tall so the roll's transpose (hx<->hy)
  // meaningfully narrows the profile to thread tight lateral gaps.
  half: [0.7, 0.45, 0.75],
};

// Gameplay — accelerate / brake (Shift / Z). Modulates ONLY the world-scroll
// speed (gameSpeed); the song clock + spawn cursor stay on songTime (R1). The
// result is clamped to [clampLo, clampHi]; gate boost (Phase 3) adds into it.
export const ACCEL = {
  accelGain: 0.3,        // Shift -> up to +30% world speed
  brakeGain: 0.3,        // Z -> down to -30%
  smoothIn: 7,           // approach the throttle target
  decay: 4,              // ease back to neutral when released
  clampLo: 0.7,
  clampHi: 1.3,
  scoreBonusAtMax: 0.5,  // +50% kill/graze score at full accel (risk reward)
};

// Gameplay — barrel roll (Q/E). Skill version: a deflect i-frame window on
// entry, then a recover window where the transposed hitbox (not invuln) decides
// the hit. iframes < active guarantees that recover window exists. Set
// iframes:0 for a hardcore, deflect-less "pure threading" roll.
export const ROLL = {
  active: 0.34,    // total roll duration (level -> sideways -> level)
  iframes: 0.2,    // deflect invulnerability from roll start
  cooldown: 0.22,  // before another roll can start
  transposeAngle: Math.PI / 4, // |roll| past this -> swap the hitbox profile
};

// System 7 — entities. Base game speed; section multipliers scale it.
export const SPEED = {
  base: 0.18, // baseline gameSpeed (section speed 1.0)
  gridBonus: 0.1,
  pillarBonus: 0.15,
  spawnZ: -90,
  despawnZ: 12,
};

// System 8 — bullets
export const BULLET = {
  speed: 90,
  fireIntervalMs: 180,
  killZ: -100,
  spawnZOffset: -1.5,
};

// System 9 — collision / scoring
export const SCORE = {
  nearMiss: 50,
  kill: 100,
  nearMissPad: [0.5, 0.5, 0.5],
};

// Gameplay #1 — forgiveness shield. Absorbs hits before death; grants i-frames.
export const SHIELD = {
  max: 2,            // charges absorbed before a hit is lethal
  iframes: 1.2,      // seconds of invulnerability after an absorb
  regenSec: 28,      // survive this long without a hit to regen one charge
  blinkHz: 14,       // ship blink rate during i-frames
};

// Gameplay #2 — grazing. Flying close to (but not into) hazards builds the
// multiplier and trickles score; the closer/longer, the faster it climbs.
export const GRAZE = {
  pointsPerSec: 90,  // bonus points/sec at max closeness × streak
  streakPerSec: 0.7, // multiplier growth/sec at max closeness
  maxStreak: 8,
};

// Gameplay #3 — drone beam attack. In range, a drone locks its lane on a beat
// (telegraph) and fires on the NEXT beat. Freezes lateral tracking while
// charging so the lane is honest — dodge it or shoot the drone first.
export const LASER = {
  rangeFar: -50,     // can begin charging from this far out
  rangeNear: -2,     // ...until this close (still ahead of the ship)
  fireWindow: 0.14,  // seconds the beam is live
  cooldown: 1.0,     // seconds idle after firing before it can charge again
  laneHalf: 0.9,     // |shipX - droneX| within this = caught in the beam
};

// System 15 — performance-reactive mix
export const MIX = {
  survivalGainPerSec: 0.016,
  killGainPerKill: 0.1,
  rewardRampUp: 2.0,
  rewardRampDown: 2.0,
};

// System 2 — audio
export const AUDIO = {
  rewardRamp: 2.0,
  deathCoreFade: 5.0,
  deathCoreGain: 0.3,
  deathReverbWet: 0.6,
  reverbSeconds: 3.0,
  endThreshold: 0.1,
};

// Post-processing — UnrealBloom (neon glow). Strength is modulated by music.
export const BLOOM = {
  strength: 0.5,      // base bloom (lowered for the dark moonlit baseline)
  radius: 0.5,
  threshold: 0.2,     // only bright neon (> this luminance) blooms; dark bg doesn't
  energyBoost: 0.7,   // added at full master_rms (the scene breathes with energy)
  kick: 0.6,          // extra punch from a `bloom` effect event
  kickDecay: 1.5,     // per-second decay of the kick
  max: 2.2,           // safety clamp
};

// Stem indices (see spec System 2 architecture)
export const STEMS = {
  piano: 0,
  synth: 1,
  guitar: 2,
  percussion: 3,
  reward1: 4,
  reward2: 5,
};
export const STEM_NAMES = ['piano', 'synth', 'guitar', 'percussion', 'reward1', 'reward2'];
export const CORE_STEMS = [0, 1, 2, 3];

// Procedural placeholder song length (seconds). Real assets override this.
export const PLACEHOLDER = {
  duration: 120,
  tempo: 110,
};

// Real song (single mixdown). If present, it's decoded + analyzed in-browser
// into the event map and played as one master track. Set url to null to force
// the procedural placeholder.
export const SONG = {
  url: 'assets/audio/tyrell.mp3',
  title: 'TYRELL CORPORATION',
};

// External links (configurable). The reward-screen CTA + share text.
export const LINKS = {
  album: 'https://www.instagram.com/fjordnacht/', // CTA target ("for now")
  albumLabel: 'FOLLOW FJORDNACHT',                // button text (matches target)
  shareUrl: 'https://chadjective.github.io/entrainment/', // live game page
  songTitle: 'TYRELL CORPORATION',
};

export const HIGH_SCORE_KEY = 'entrainment_high_score';
