#!/usr/bin/env python3
"""System 3B — Stem analyzer.

Analyzes each WAV stem into 60-values-per-second curves (RMS, spectral
centroid, onset strength) plus master beat positions, per the spec.

Usage:
    python stem-analyzer.py --stems-dir ./stems --out analysis.json

Reads piano.wav, synth_pad.wav, guitar.wav, percussion.wav (others optional).
"""
import argparse
import json
import os

try:
    import numpy as np
    import librosa
except ImportError:
    raise SystemExit("This tool needs `librosa` + `numpy`:  pip install librosa numpy")

HOP = 735        # ~60 fps at 44.1 kHz
FRAME = 2048
SR = 44100


def norm(x):
    peak = float(np.max(x)) if x.size else 0.0
    return (x / peak) if peak > 1e-9 else x


def analyze(path):
    y, sr = librosa.load(path, sr=SR, mono=True)
    rms = librosa.feature.rms(y=y, frame_length=FRAME, hop_length=HOP)[0]
    cen = librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=FRAME, hop_length=HOP)[0]
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    # normalize: rms/onset to peak; centroid mapped 200Hz..8000Hz -> 0..1
    rms = norm(rms)
    onset = norm(onset)
    cen = np.clip((cen - 200.0) / (8000.0 - 200.0), 0.0, 1.0)
    return {
        "rms": [round(float(v), 4) for v in rms],
        "spectral_centroid": [round(float(v), 4) for v in cen],
        "onset_strength": [round(float(v), 4) for v in onset],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stems-dir", required=True)
    ap.add_argument("--out", default="analysis.json")
    args = ap.parse_args()

    stem_files = {
        "piano": "piano.wav",
        "synth_pad": "synth_pad.wav",
        "guitar": "guitar.wav",
        "percussion": "percussion.wav",
    }
    stems = {}
    mixes = []
    duration = 0.0
    for name, fname in stem_files.items():
        path = os.path.join(args.stems_dir, fname)
        if not os.path.exists(path):
            print(f"  skip {fname} (not found)")
            continue
        stems[name] = analyze(path)
        y, sr = librosa.load(path, sr=SR, mono=True)
        mixes.append(y)
        duration = max(duration, len(y) / sr)
        print(f"  analyzed {fname}")

    # master = sum of stems
    n = max((len(m) for m in mixes), default=0)
    master_y = np.zeros(n, dtype=np.float32)
    for m in mixes:
        master_y[: len(m)] += m
    tempo, beat_frames = librosa.beat.beat_track(y=master_y, sr=SR, hop_length=HOP)
    beats = librosa.frames_to_time(beat_frames, sr=SR, hop_length=HOP)

    master_rms = norm(librosa.feature.rms(y=master_y, frame_length=FRAME, hop_length=HOP)[0])
    master_cen = np.clip(
        (librosa.feature.spectral_centroid(y=master_y, sr=SR, n_fft=FRAME, hop_length=HOP)[0] - 200.0) / 7800.0,
        0.0, 1.0,
    )

    out = {
        "sample_rate": 60,
        "duration": round(duration, 3),
        "tempo": round(float(tempo), 2),
        "stems": stems,
        "master": {
            "rms": [round(float(v), 4) for v in master_rms],
            "spectral_centroid": [round(float(v), 4) for v in master_cen],
            "beats": [round(float(b), 4) for b in beats],
        },
    }
    with open(args.out, "w") as f:
        json.dump(out, f)
    print(f"wrote analysis ({duration:.1f}s, {len(beats)} beats) -> {args.out}")


if __name__ == "__main__":
    main()
