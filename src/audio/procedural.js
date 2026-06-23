// ============================================================================
// Procedural placeholder song generator.
// Synthesizes 6 in-sync stems as AudioBuffers AND a matching event-map
// (events / curves / beats / sections) so the full music-reactive game runs
// with no real assets. Drop real WAV stems + a built event-map.json into
// /assets to replace all of this (see audio/engine.js + data/loader.js).
// ============================================================================

import { PLACEHOLDER, STEM_NAMES } from '../core/config.js';
import { FPS, rmsCurve, centroidCurve, onsetFromRms, mulberry32 } from './dsp.js';
import { defaultSections, generateEvents } from './eventgen.js';

const midiToFreq = (n) => 440 * Math.pow(2, (n - 69) / 12);
const saw = (freq, t) => 2 * (freq * t - Math.floor(0.5 + freq * t));

// Render an enveloped tone additively into a mono Float32 buffer.
function renderTone(buf, sr, t0, dur, freq, amp, opts = {}) {
  const { attack = 0.005, decay = 0.4, type = 'saw', detune = 0, release = 0.05 } = opts;
  const start = Math.max(0, Math.floor(t0 * sr));
  const end = Math.min(buf.length, Math.floor((t0 + dur) * sr));
  const f2 = freq * Math.pow(2, detune / 1200);
  for (let i = start; i < end; i++) {
    const tt = (i - start) / sr;
    const rem = (end - i) / sr;
    let env;
    if (tt < attack) env = tt / attack;
    else env = Math.exp(-(tt - attack) / (decay));
    if (rem < release) env *= rem / release;
    let s;
    if (type === 'sine') s = Math.sin(2 * Math.PI * freq * tt);
    else if (type === 'square') s = Math.sign(Math.sin(2 * Math.PI * freq * tt));
    else s = 0.5 * (saw(freq, tt) + saw(f2, tt)); // detuned saw
    buf[i] += s * env * amp;
  }
}

function renderKick(buf, sr, t0, amp = 0.9) {
  const start = Math.floor(t0 * sr);
  const dur = 0.18;
  const end = Math.min(buf.length, Math.floor((t0 + dur) * sr));
  for (let i = start; i < end && i >= 0; i++) {
    const tt = (i - start) / sr;
    const f = 120 * Math.exp(-tt * 30) + 42; // pitch drop
    const env = Math.exp(-tt / 0.06);
    buf[i] += Math.sin(2 * Math.PI * f * tt) * env * amp;
  }
}

function renderHat(buf, sr, t0, rng, amp = 0.25) {
  const start = Math.floor(t0 * sr);
  const dur = 0.035;
  const end = Math.min(buf.length, Math.floor((t0 + dur) * sr));
  let prev = 0;
  for (let i = start; i < end && i >= 0; i++) {
    const tt = (i - start) / sr;
    const env = Math.exp(-tt / 0.012);
    const n = (rng() * 2 - 1);
    const hp = n - prev; prev = n; // crude high-pass
    buf[i] += hp * env * amp;
  }
}

// Minor-key synthwave progression: i - VI - III - VII (A minor).
// Each entry is the root MIDI note of the chord (one chord per bar).
const PROGRESSION = [45, 41, 48, 43]; // A2, F2, C3, G2
const TRIAD = [0, 3, 7]; // minor triad intervals (root, m3, p5)

export function generateProceduralSong(audioContext) {
  const sr = audioContext.sampleRate;
  const duration = PLACEHOLDER.duration;
  const tempo = PLACEHOLDER.tempo;
  const beatDur = 60 / tempo;
  const barDur = beatDur * 4;
  const length = Math.ceil(duration * sr);
  const rng = mulberry32(1337);

  // 6 mono buffers (Float32 working arrays)
  const data = STEM_NAMES.map(() => new Float32Array(length));
  const [piano, synth, guitar, perc, reward1, reward2] = data;

  // --- beats ---
  const beats = [];
  for (let t = 0; t < duration; t += beatDur) beats.push(+t.toFixed(4));

  // --- synthesize bar by bar ---
  const numBars = Math.floor(duration / barDur);
  for (let bar = 0; bar < numBars; bar++) {
    const t0 = bar * barDur;
    const root = PROGRESSION[bar % PROGRESSION.length];
    const chord = TRIAD.map((iv) => root + iv);

    // synth pad: sustained chord across the whole bar (drives fog)
    chord.forEach((n, idx) => {
      renderTone(synth, sr, t0, barDur, midiToFreq(n + 12), 0.06, {
        attack: 0.25, decay: 2.0, release: 0.4, type: 'saw', detune: idx === 1 ? 8 : -6,
      });
    });

    for (let b = 0; b < 4; b++) {
      const tb = t0 + b * beatDur;

      // percussion: kick on every beat, hat on off-beats
      renderKick(perc, sr, tb, 0.85);
      renderHat(perc, sr, tb + beatDur * 0.5, rng, 0.22);

      // piano: arpeggiate the chord, one note per beat (core melody)
      const pn = chord[b % chord.length] + 24;
      renderTone(piano, sr, tb, beatDur * 0.9, midiToFreq(pn), 0.16, {
        attack: 0.008, decay: 0.22, type: 'sine',
      });

      // guitar: plucked stabs on the off-beats
      const gn = chord[(b + 1) % chord.length] + 12;
      renderTone(guitar, sr, tb + beatDur * 0.5, beatDur * 0.45, midiToFreq(gn), 0.09, {
        attack: 0.004, decay: 0.12, type: 'saw',
      });

      // reward1: bright double-time arp (silent until earned)
      for (let e = 0; e < 2; e++) {
        const rn = chord[(b * 2 + e) % chord.length] + 36;
        renderTone(reward1, sr, tb + e * beatDur * 0.5, beatDur * 0.4, midiToFreq(rn), 0.10, {
          attack: 0.004, decay: 0.1, type: 'square',
        });
      }
    }

    // reward2: a held lead note per bar (silent until earned)
    const leadN = chord[2] + 24;
    renderTone(reward2, sr, t0 + beatDur, barDur - beatDur, midiToFreq(leadN), 0.12, {
      attack: 0.05, decay: 1.2, release: 0.3, type: 'saw', detune: 6,
    });
  }

  // soft-clip everything to avoid harsh peaks
  for (const arr of data) {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.tanh(arr[i] * 1.2);
  }

  // --- wrap as AudioBuffers ---
  const buffers = data.map((arr) => {
    const buf = audioContext.createBuffer(1, length, sr);
    buf.copyToChannel(arr, 0);
    return buf;
  });

  // --- analysis curves (60 Hz) -------------------------------------------
  const map = buildEventMap({ data, sr, duration, beats, tempo, barDur, beatDur });

  return { buffers, map };
}

// Compute RMS / centroid / onset curves + game events from the synthesized PCM,
// reusing the shared DSP + event generator (so procedural and the real-song
// analyzer stay in lockstep).
function buildEventMap({ data, sr, duration, beats, tempo }) {
  const hop = sr / FPS;
  const frames = Math.ceil(duration * FPS);
  const [piano, synth, guitar, perc] = data;

  const master = new Float32Array(piano.length);
  for (let i = 0; i < master.length; i++) master[i] = piano[i] + synth[i] + guitar[i] + perc[i];

  const piano_rms = rmsCurve(piano, hop, frames);
  const synth_rms = rmsCurve(synth, hop, frames);
  const master_rms = rmsCurve(master, hop, frames);

  const curves = {
    piano_rms: Array.from(piano_rms),
    piano_centroid: Array.from(centroidCurve(piano, hop, frames)),
    piano_onset: Array.from(onsetFromRms(piano_rms, frames)),
    synth_rms: Array.from(synth_rms),
    synth_centroid: Array.from(centroidCurve(synth, hop, frames)),
    master_rms: Array.from(master_rms),
    master_centroid: Array.from(centroidCurve(master, hop, frames)),
  };

  const sections = defaultSections(duration);
  const events = generateEvents(beats, sections, mulberry32(7));

  return {
    song: 'tyrell_corporation_placeholder',
    duration,
    tempo,
    events,
    curves,
    beats,
    sections,
    _placeholder: true,
  };
}
