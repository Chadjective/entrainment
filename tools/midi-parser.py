#!/usr/bin/env python3
"""System 3A — MIDI parser.

Converts the per-track MIDI files exported from Ableton into a flat JSON array
of game events, applying the exact mapping rules from the technical spec.

Usage:
    python midi-parser.py --midi-dir ./midi --out events.json

Expected files in --midi-dir (any missing track is skipped):
    obstacles.mid  enemies.mid  effects.mid  sections.mid
"""
import argparse
import json
import os

try:
    import mido
except ImportError:
    raise SystemExit("This tool needs `mido`:  pip install mido")


def x_position(pitch):
    return max(-7.0, min(7.0, round(((pitch - 36) / 48) * 14 - 7, 3)))


def obstacle_event(pitch, vel, t, dur):
    return {
        "time": round(t, 3),
        "type": "obstacle",
        "x": x_position(pitch),
        "size": round(0.5 + (vel / 127) * 2.0, 3),
        "height": round(1.0 + (vel / 127) * 3.0, 3),
        "persistence": round(max(2.0, min(30.0, dur)), 3),
    }


def enemy_event(pitch, vel, t):
    if pitch <= 60:
        subtype = "cube"
    elif pitch <= 84:
        subtype = "drone"
    else:
        subtype = "drone_fast"
    return {
        "time": round(t, 3),
        "type": "enemy",
        "subtype": subtype,
        "x": x_position(pitch),
        "aggression": round(vel / 127, 3),
    }


EFFECT_BY_PITCH_CLASS = {
    0: "screen_shake",   # C
    2: "bloom",          # D
    4: "color_shift",    # E
    5: "beat_pulse_accent",  # F
    7: "fog_change",     # G
    9: "speed_change",   # A
}


def effect_event(pitch, vel, t):
    name = EFFECT_BY_PITCH_CLASS.get(pitch % 12)
    if not name:
        return None
    ev = {"time": round(t, 3), "type": "effect", "effect": name, "intensity": round(vel / 127, 3)}
    if name == "speed_change":
        ev["target_speed"] = round(0.5 + (vel / 127) * 1.3, 3)
    if name == "fog_change":
        ev["target_density"] = round(vel / 127, 3)
    return ev


SECTION_BY_PITCH = {
    60: "emergence", 62: "awakening", 64: "engagement",
    65: "breath", 67: "escalation", 69: "apex", 71: "departure",
}


def section_event(pitch, t):
    name = SECTION_BY_PITCH.get(pitch)
    if not name:
        return None
    return {"time": round(t, 3), "type": "section", "section": name}


def parse_track(path, kind):
    mid = mido.MidiFile(path)
    t = 0.0
    starts = {}
    events = []
    for msg in mid:
        t += msg.time
        is_on = msg.type == "note_on" and msg.velocity > 0
        is_off = msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0)
        if is_on:
            starts[msg.note] = (t, msg.velocity)
            if kind == "enemy":
                events.append(enemy_event(msg.note, msg.velocity, t))
            elif kind == "effect":
                e = effect_event(msg.note, msg.velocity, t)
                if e:
                    events.append(e)
            elif kind == "section":
                e = section_event(msg.note, t)
                if e:
                    events.append(e)
        elif is_off and msg.note in starts:
            start, vel = starts.pop(msg.note)
            if kind == "obstacle":
                events.append(obstacle_event(msg.note, vel, start, t - start))
    return events


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--midi-dir", required=True)
    ap.add_argument("--out", default="events.json")
    args = ap.parse_args()

    tracks = {
        "obstacles.mid": "obstacle",
        "enemies.mid": "enemy",
        "effects.mid": "effect",
        "sections.mid": "section",
    }
    events = []
    for fname, kind in tracks.items():
        path = os.path.join(args.midi_dir, fname)
        if os.path.exists(path):
            events.extend(parse_track(path, kind))
            print(f"  parsed {fname} ({kind})")
        else:
            print(f"  skip {fname} (not found)")

    events.sort(key=lambda e: e["time"])
    with open(args.out, "w") as f:
        json.dump({"events": events}, f, indent=2)
    print(f"wrote {len(events)} events -> {args.out}")


if __name__ == "__main__":
    main()
