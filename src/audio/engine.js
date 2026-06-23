// ============================================================================
// System 2 — Audio engine. Web Audio API: stem playback, master clock,
// per-stem gain control, performance-reactive mix, death reverb, pause/resume.
// Tries real assets first (/assets/audio/stems + /assets/data/event-map.json);
// falls back to the procedural placeholder song.
// ============================================================================

import { AUDIO, STEM_NAMES, CORE_STEMS, STEMS, MIX, SONG } from '../core/config.js';
import { generateProceduralSong } from './procedural.js';
import { analyzeSong } from './analyze.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = [];
    this.gains = [];
    this.sources = [];
    this.masterGain = null;
    this.reverbSend = null;
    this.convolver = null;
    this.map = null;
    this.duration = 0;

    this.audioStartTime = 0;
    this.playing = false;
    this._endFired = false;
    this._pausedAtSongTime = 0;
    this.singleTrack = false; // one mixdown instead of 6 stems
  }

  // ---- loading -----------------------------------------------------------
  async load(onProgress) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    // priority: prebuilt stems+map → single real song → procedural placeholder
    let loaded = null;
    try { loaded = await this._loadStems(onProgress); } catch (e) { loaded = null; }
    if (!loaded) { try { loaded = await this._loadSong(onProgress); } catch (e) { loaded = null; } }

    if (!loaded) {
      onProgress?.(0.15);
      const gen = generateProceduralSong(this.ctx);
      this.buffers = gen.buffers;
      this.map = gen.map;
      this.singleTrack = false;
      onProgress?.(1);
    } else {
      this.buffers = loaded.buffers;
      this.map = loaded.map;
      this.singleTrack = !!loaded.singleTrack;
    }

    this.duration = this.map.duration;
    this._buildGraph();
    return this.map;
  }

  // single mixdown (e.g. tyrell.mp3): decode + analyze in-browser → event map
  async _loadSong(onProgress) {
    if (!SONG || !SONG.url) return null;
    const r = await fetch(SONG.url, { cache: 'force-cache' });
    if (!r.ok) return null;
    onProgress?.(0.25);
    const arr = await r.arrayBuffer();
    onProgress?.(0.5);
    const buffer = await this.ctx.decodeAudioData(arr);
    onProgress?.(0.7);
    const map = analyzeSong(buffer, { title: SONG.title, url: SONG.url });
    onProgress?.(1);
    return { buffers: [buffer], map, singleTrack: true };
  }

  async _loadStems(onProgress) {
    const res = await fetch('assets/data/event-map.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const map = await res.json();
    const buffers = [];
    for (let i = 0; i < STEM_NAMES.length; i++) {
      const name = STEM_NAMES[i];
      const r = await fetch(`assets/audio/stems/${name}.wav`, { cache: 'no-cache' });
      if (!r.ok) {
        // optional stems (reward layers) may be absent → silent buffer
        if (i >= 4) { buffers[i] = this._silentBuffer(map.duration); continue; }
        return null;
      }
      const arr = await r.arrayBuffer();
      buffers[i] = await this.ctx.decodeAudioData(arr);
      onProgress?.((i + 1) / STEM_NAMES.length);
    }
    return { buffers, map };
  }

  _silentBuffer(seconds) {
    return this.ctx.createBuffer(1, Math.ceil(seconds * this.ctx.sampleRate), this.ctx.sampleRate);
  }

  // ---- audio graph -------------------------------------------------------
  _buildGraph() {
    const ctx = this.ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.9;
    this.masterGain.connect(ctx.destination);

    // death reverb send → convolver → master
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this._makeImpulse(AUDIO.reverbSeconds);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0;
    this.reverbSend.connect(this.convolver);
    this.convolver.connect(this.masterGain);

    // one persistent gain per buffer (dry → master, wet → reverb send).
    // single track: 1 gain at full. 6 stems: core full, reward layers silent.
    this.gains = this.buffers.map((_, i) => {
      const g = ctx.createGain();
      g.gain.value = (this.singleTrack || i < 4) ? 1.0 : 0.0;
      g.connect(this.masterGain);
      g.connect(this.reverbSend);
      return g;
    });
  }

  // procedural large-hall impulse: decaying stereo noise
  _makeImpulse(seconds) {
    const ctx = this.ctx;
    const len = Math.ceil(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      }
    }
    return buf;
  }

  // resume the context inside a user gesture (LAUNCH click) so playback can
  // legally begin later at the "GO" frame.
  async unlock() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (e) { /* ignore */ }
    }
  }

  // ---- playback ----------------------------------------------------------
  start() {
    // resume is fire-and-forget; the gesture happened at LAUNCH. Awaiting here
    // could hang if the browser hasn't granted audio yet.
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this._spawnSources(0);
    this.audioStartTime = this.ctx.currentTime;
    this.playing = true;
    this._endFired = false;
  }

  _spawnSources(offset) {
    this.sources.forEach((s) => { try { s.stop(); } catch (e) {} });
    this.sources = this.buffers.map((buf, i) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.gains[i]);
      src.start(0, offset);
      return src;
    });
  }

  get songTime() {
    if (!this.playing) return this._pausedAtSongTime;
    return this.ctx.currentTime - this.audioStartTime;
  }

  isEnded() {
    if (this._endFired) return true;
    if (this.playing && this.songTime >= this.duration - AUDIO.endThreshold) {
      this._endFired = true;
      return true;
    }
    return false;
  }

  // ---- gain control ------------------------------------------------------
  setStemGain(index, value, ramp = 0.05) {
    const g = this.gains[index];
    if (!g) return;
    const now = this.ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(value, now + ramp);
  }

  // System 15 — reward mix (no-op for a single mixdown: no isolated stems)
  setSurvivalGain(value) {
    if (this.singleTrack) return;
    this.setStemGain(STEMS.reward1, Math.max(0, Math.min(1, value)), MIX.rewardRampUp);
  }
  setKillGain(value) {
    if (this.singleTrack) return;
    this.setStemGain(STEMS.reward2, Math.max(0, Math.min(1, value)), MIX.rewardRampUp);
  }

  // System 2/11 — death audio transition
  triggerDeath() {
    const now = this.ctx.currentTime;
    this.reverbSend.gain.cancelScheduledValues(now);
    this.reverbSend.gain.setValueAtTime(this.reverbSend.gain.value, now);
    this.reverbSend.gain.linearRampToValueAtTime(AUDIO.deathReverbWet, now + AUDIO.deathCoreFade);

    if (this.singleTrack) {
      // can't isolate piano — duck the whole mix and let reverb swell
      this.setStemGain(0, 0.5, AUDIO.deathCoreFade);
      return;
    }
    // reward stems fade out over 2s
    [STEMS.reward1, STEMS.reward2].forEach((i) => this.setStemGain(i, 0, MIX.rewardRampDown));
    // core stems (except piano) reduce to 0.3 over 5s
    CORE_STEMS.forEach((i) => {
      if (i === STEMS.piano) return;
      this.setStemGain(i, AUDIO.deathCoreGain, AUDIO.deathCoreFade);
    });
    // piano stays at 1.0
    this.setStemGain(STEMS.piano, 1.0, 0.1);
  }

  // ---- pause / resume ----------------------------------------------------
  async pause() {
    if (!this.playing) return;
    this._pausedAtSongTime = this.songTime;
    this.playing = false;
    if (this.ctx.state === 'running') await this.ctx.suspend();
  }
  async resume() {
    if (this.playing) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    // realign clock so songTime continues from the pause point
    this.audioStartTime = this.ctx.currentTime - this._pausedAtSongTime;
    this.playing = true;
  }

  // ---- reset -------------------------------------------------------------
  async reset() {
    this.sources.forEach((s) => { try { s.stop(); } catch (e) {} });
    this.sources = [];
    this.playing = false;
    this._endFired = false;
    this._pausedAtSongTime = 0;
    const now = this.ctx.currentTime;
    this.gains.forEach((g, i) => {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime((this.singleTrack || i < 4) ? 1.0 : 0.0, now);
    });
    this.reverbSend.gain.cancelScheduledValues(now);
    this.reverbSend.gain.setValueAtTime(0, now);
  }
}
