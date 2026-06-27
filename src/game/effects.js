// ============================================================================
// System 10 — Visual effects driven by the music data.
//   10A beat pulse · 10B grid brightness · 10C colour temperature
//   10D lighting intensity · 10E fog density · 10F screen shake
// Continuous effects read the 60 Hz curves; discrete ones fire on events.
// ============================================================================

import * as THREE from 'three';
import { sampleCurve } from '../data/loader.js';
import { COLORS, BLOOM, LIGHT } from '../core/config.js';

export class Effects {
  constructor({ scene, grid, ship, lights, post }) {
    this.scene = scene;
    this.grid = grid;
    this.ship = ship;
    this.lights = lights;
    this.post = post;

    this.cCyan = new THREE.Color(COLORS.cyan);
    this.cMagenta = new THREE.Color(COLORS.magenta);
    this._temp = new THREE.Color();
    this._temp2 = new THREE.Color();

    this.beatIdx = 0;
    this.timeSinceBeat = 1;
    this.shakeAmp = 0;
    this.bloom = 0;
    // Phase A — "play by the light you make": the orchestrator feeds these.
    this.grazeLevel = 0; // current graze closeness (0..1)
    this.fireLevel = 0;  // decays after each shot
  }

  setMap(map) {
    this.map = map;
    this.grid.tempo = map.tempo || 110;
  }

  // discrete effect events from the event map
  trigger(ev) {
    switch (ev.effect) {
      case 'screen_shake':
        this.shakeAmp = Math.max(this.shakeAmp, ev.intensity * 0.3);
        break;
      case 'bloom':
      case 'beat_pulse_accent':
        this.bloom = Math.max(this.bloom, ev.intensity);
        break;
      // color_shift / fog_change / speed_change are already driven continuously
      // by the analysis curves; nothing to do here for the MVP.
      default:
        break;
    }
  }

  update(delta, songTime) {
    const c = this.map.curves;

    // --- 10A beat pulse ---
    const beats = this.map.beats;
    while (this.beatIdx < beats.length && beats[this.beatIdx] <= songTime) {
      this.timeSinceBeat = 0;
      this.ship.pulseGlow();
      this.beatIdx++;
    }
    this.timeSinceBeat += delta;
    let pulse = 1.0;
    if (this.timeSinceBeat < 0.2) pulse = 1.0 + 0.025 * Math.sin((this.timeSinceBeat / 0.2) * Math.PI);
    this.grid.setPulse(pulse);

    // --- 10C colour temperature (magenta dark → cyan bright) ---
    const centroid = sampleCurve(c.master_centroid, songTime);
    const temp = this._temp.copy(this.cMagenta).lerp(this.cCyan, centroid);

    // --- 10B grid brightness (master rms) + bloom kick ---
    const masterRms = sampleCurve(c.master_rms, songTime);
    const kick = this.bloom;                              // current accent punch
    this.bloom = Math.max(0, this.bloom - delta * BLOOM.kickDecay);
    const rms = Math.min(1, masterRms + kick * 0.5);
    this.grid.setBrightness(0.2 + rms * 0.6, this._temp2.copy(temp).multiplyScalar(0.45 + rms * 0.55));
    this.grid.setColor(this._temp2.copy(temp).multiplyScalar(0.6));

    // drive UnrealBloom with the music: the scene breathes light with energy,
    // and `bloom` effect events (section boundaries / accents) punch it up.
    if (this.post) this.post.setStrength(BLOOM.strength + masterRms * BLOOM.energyBoost + kick * BLOOM.kick);

    // --- 10D lighting — Phase A "play by the light you make" ---
    // Ambient is a dim moonlit floor; the player's beat-glow, firing, and
    // grazing are the dominant dynamic light (the point light on the water).
    const piano = sampleCurve(c.piano_rms, songTime);
    this.lights.ambient.intensity = LIGHT.ambientBase + piano * LIGHT.ambientMusic;
    this.fireLevel = Math.max(0, this.fireLevel - delta * LIGHT.fireDecay);
    const player = LIGHT.playerBase
      + this.ship.flash * LIGHT.flashGain
      + this.grazeLevel * LIGHT.grazeGain
      + this.fireLevel * LIGHT.fireGain;
    this.lights.point.intensity = Math.min(LIGHT.maxPlayer, player);
    this.lights.point.color.copy(temp);

    // --- 10E fog density (synth rms) ---
    const synth = sampleCurve(c.synth_rms, songTime);
    this.scene.fog.near = 20 + synth * 40;
    this.scene.fog.far = 50 + synth * 50;

    // --- 10F screen-shake decay ---
    if (this.shakeAmp > 0.001) this.shakeAmp *= 0.85; else this.shakeAmp = 0;
  }

  // applied to the camera AFTER the camera has been positioned for the frame
  applyShake(camera) {
    if (this.shakeAmp <= 0) return;
    camera.position.x += (Math.random() * 2 - 1) * this.shakeAmp;
    camera.position.y += (Math.random() * 2 - 1) * this.shakeAmp;
  }

  reset() {
    this.beatIdx = 0;
    this.timeSinceBeat = 1;
    this.shakeAmp = 0;
    this.bloom = 0;
    this.grazeLevel = 0;
    this.fireLevel = 0;
    this.scene.fog.near = 40;
    this.scene.fog.far = 90;
  }
}
