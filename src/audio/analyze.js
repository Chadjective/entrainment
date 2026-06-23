// ============================================================================
// Real-song analyzer (System 3, client-side). Decodes a single mixdown into
// the same event-map shape the game consumes — curves, beats, sections, and
// beat-aligned events — entirely in the browser (no Python/librosa, no backend).
// Used for single-track songs where separate stems aren't available.
// ============================================================================

import { FPS, mixToMono, rmsCurve, centroidCurve, onsetFromRms, detectBeats, mulberry32 } from './dsp.js';
import { defaultSections, generateEvents } from './eventgen.js';

export function analyzeSong(audioBuffer, opts = {}) {
  const sr = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const hop = sr / FPS;
  const frames = Math.ceil(duration * FPS);
  const mono = mixToMono(audioBuffer);

  const master_rms = rmsCurve(mono, hop, frames);
  const master_centroid = centroidCurve(mono, hop, frames);
  const onset = onsetFromRms(master_rms, frames);
  const { tempo, beats } = detectBeats(onset, FPS);

  // single mixdown: every stem curve derives from the master (no isolated stems)
  const m = Array.from(master_rms);
  const c = Array.from(master_centroid);
  const curves = {
    piano_rms: m, piano_centroid: c, piano_onset: Array.from(onset),
    synth_rms: m, synth_centroid: c,
    master_rms: m, master_centroid: c,
  };

  const sections = defaultSections(duration);
  const energyAt = (t) => master_rms[Math.min(frames - 1, Math.max(0, Math.floor(t * FPS)))] || 0;
  const events = generateEvents(beats, sections, mulberry32(7), { energyAt });

  return {
    song: opts.song || 'tyrell_corporation',
    title: opts.title || 'TYRELL CORPORATION',
    duration,
    tempo,
    events,
    curves,
    beats,
    sections,
    audio: opts.url,
    singleTrack: true,
  };
}
