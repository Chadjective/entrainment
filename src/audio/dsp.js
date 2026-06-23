// ============================================================================
// Shared DSP for the audio analysis pipeline (System 3, client-side).
// Used by both the procedural placeholder and the real-song analyzer so they
// produce identically-shaped 60 Hz curves + a beat grid.
// ============================================================================

export const FRAME = 2048;
export const FPS = 60;

// deterministic RNG (seeded) — shared by song + event generation
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// average all channels of an AudioBuffer into one Float32Array
export function mixToMono(audioBuffer) {
  const ch = audioBuffer.numberOfChannels;
  const n = audioBuffer.length;
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const d = audioBuffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i];
  }
  if (ch > 1) for (let i = 0; i < n; i++) out[i] /= ch;
  return out;
}

// RMS energy per frame, normalized to peak (0..1)
export function rmsCurve(arr, hop, frames) {
  const out = new Float32Array(frames);
  let peak = 1e-6;
  for (let f = 0; f < frames; f++) {
    const s = Math.floor(f * hop);
    let sum = 0, count = 0;
    for (let i = s; i < s + FRAME && i < arr.length; i++) { sum += arr[i] * arr[i]; count++; }
    const v = count ? Math.sqrt(sum / count) : 0;
    out[f] = v; if (v > peak) peak = v;
  }
  for (let f = 0; f < frames; f++) out[f] /= peak;
  return out;
}

// brightness proxy in 0..1: energy of first-difference vs signal energy
export function centroidCurve(arr, hop, frames) {
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const s = Math.floor(f * hop);
    let sig = 0, dif = 0;
    for (let i = s; i < s + FRAME && i < arr.length; i++) {
      sig += arr[i] * arr[i];
      const d = arr[i] - (arr[i - 1] || 0);
      dif += d * d;
    }
    const r = sig > 1e-9 ? Math.sqrt(dif / sig) : 0;
    out[f] = Math.max(0, Math.min(1, r * 0.6));
  }
  return out;
}

// onset strength = positive first-difference of RMS, normalized
export function onsetFromRms(rms, frames) {
  const out = new Float32Array(frames);
  let peak = 1e-6;
  for (let f = 1; f < frames; f++) { const d = Math.max(0, rms[f] - rms[f - 1]); out[f] = d; if (d > peak) peak = d; }
  for (let f = 0; f < frames; f++) out[f] /= peak;
  return out;
}

// Estimate tempo + a steady beat grid from an onset envelope.
// Autocorrelate over plausible tempo lags, then comb-filter for the best phase.
export function detectBeats(onset, fps = FPS) {
  const n = onset.length;
  if (n < 8) return { tempo: 110, beats: [] };
  const minBpm = 70, maxBpm = 180;
  const minLag = Math.max(2, Math.floor((60 * fps) / maxBpm));
  const maxLag = Math.min(n - 1, Math.ceil((60 * fps) / minBpm));

  let bestLag = minLag, bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += onset[i] * onset[i - lag];
    s /= (n - lag);
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }

  // best phase: which offset best aligns a pulse train of period bestLag
  let bestPhase = 0, bestPhaseScore = -Infinity;
  for (let p = 0; p < bestLag; p++) {
    let s = 0;
    for (let i = p; i < n; i += bestLag) s += onset[i];
    if (s > bestPhaseScore) { bestPhaseScore = s; bestPhase = p; }
  }

  const beats = [];
  for (let f = bestPhase; f < n; f += bestLag) beats.push(+(f / fps).toFixed(4));
  return { tempo: Math.round((60 * fps / bestLag) * 10) / 10, beats };
}
