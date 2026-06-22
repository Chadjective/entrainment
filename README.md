# ENTRAINMENT — Level 01

A music-reactive Three.js rail shooter. Fly a ship down a neon corridor that
breathes with the music: the grid pulses on the beat, brightens with energy,
shifts cyan↔magenta with timbre, and the fog opens and closes with the synths.
Survive and rack up kills to unlock extra layers of the track.

> **Tyrell Corporation × Neon Meridian MVP.** Built to the ENTRAINMENT
> technical spec (15 systems). Vanilla JS + Three.js + Vite, static, no backend.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # -> dist/ (deploy to Netlify/Vercel)
```

Click **LAUNCH**, then steer with **← →** (or **A/D**), shoot with **Space**,
pause with **Esc**. On mobile: tap left/right thirds to steer, center to fire.

## Audio: it runs today, real assets are a drop-in

With no assets present, the game **generates a synthetic in-sync song and a
matching event map at load time**, so every system (beat pulse, reactive
visuals, reward mix, death reverb) is live immediately.

To use the real song, produce the assets and drop them in — **no code changes**:

```
assets/audio/stems/{piano,synth_pad,guitar,percussion,reward1,reward2}.wav
assets/data/event-map.json
```

The engine detects these and skips the placeholder. Build the map from your
Ableton exports with the pipeline in `tools/`:

```bash
pip install -r tools/requirements.txt
python tools/midi-parser.py    --midi-dir ./midi      --out events.json
python tools/stem-analyzer.py  --stems-dir ./stems    --out analysis.json
python tools/build-map.py --events events.json --analysis analysis.json \
       --out assets/data/event-map.json
```

## Layout

```
src/
  core/config.js     all tunable constants (every spec number)
  audio/engine.js    System 2  Web Audio: clock, gains, reward mix, death reverb
  audio/procedural.js          synthetic stems + matching event map (fallback)
  data/loader.js     System 3  curve / section sampling helpers
  game/scene.js      System 4  renderer, camera, fog, lights
  game/grid.js       System 5  scrolling grid, walls, stars, sun
  game/ship.js       System 6  ship, steering, banking, glow
  game/entities.js   System 7  pillars / cubes / drones + spawn manager
  game/bullets.js    System 8  projectiles
  game/collision.js  System 9  AABB, near-miss
  game/effects.js    System 10 music-reactive visuals
  ui/ui.js           System 12 screens + high score
  input/input.js     System 13 keyboard + touch
  index.js           Systems 11/14/15 orchestrator: states, death, reward mix
tools/               System 3  MIDI parser, stem analyzer, map builder
assets/              real stems + event map go here
```

## Tuning

Almost everything lives in `src/core/config.js` — speeds, spawn distances,
fire rate, ramp times, colors, the placeholder song's length/tempo, and the
external album/share links (`LINKS`).
