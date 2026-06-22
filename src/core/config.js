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
  ambientColor: 0x222244,
  ambientIntensity: 0.6,
  dirColor: 0x4444ff,
  dirIntensity: 0.4,
  dirPos: [0, 20, -10],
  pointColor: 0x00ffff,
  pointIntensity: 1.2,
  pointDistance: 20,
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
  lerp: 6,
  clampX: 7,
  bankFactor: 1.8,
  bobFreq: 2,
  bobAmp: 0.03,
  half: [0.6, 0.5, 0.75], // collision half-extents
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

// External links (configurable)
export const LINKS = {
  album: 'https://neonmeridian.bandcamp.com',
  shareUrl: 'https://entrainment.game',
  songTitle: 'TYRELL CORPORATION',
};

export const HIGH_SCORE_KEY = 'entrainment_high_score';
