#!/usr/bin/env python3
"""System 3C — Event map builder.

Merges the MIDI parser output and the stem analyzer output into the single
`event-map.json` the game loads from /assets/data/.

Usage:
    python build-map.py --events events.json --analysis analysis.json \
        --out ../assets/data/event-map.json --song tyrell_corporation
"""
import argparse
import json

# default speed per named section (overridable via section events that carry one)
SECTION_SPEED = {
    "emergence": 1.0, "awakening": 1.15, "engagement": 1.25,
    "breath": 1.0, "escalation": 1.35, "apex": 1.5, "departure": 1.1,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", required=True)
    ap.add_argument("--analysis", required=True)
    ap.add_argument("--out", default="event-map.json")
    ap.add_argument("--song", default="tyrell_corporation")
    args = ap.parse_args()

    with open(args.events) as f:
        events = json.load(f)["events"]
    with open(args.analysis) as f:
        analysis = json.load(f)

    stems = analysis.get("stems", {})

    def curve(stem, key):
        return stems.get(stem, {}).get(key, [])

    curves = {
        "piano_rms": curve("piano", "rms"),
        "piano_centroid": curve("piano", "spectral_centroid"),
        "piano_onset": curve("piano", "onset_strength"),
        "synth_rms": curve("synth_pad", "rms"),
        "synth_centroid": curve("synth_pad", "spectral_centroid"),
        "master_rms": analysis["master"]["rms"],
        "master_centroid": analysis["master"]["spectral_centroid"],
    }

    # sections derived from section events (fall back to a single emergence)
    sections = []
    for e in events:
        if e["type"] == "section":
            name = e["section"]
            sections.append({"time": e["time"], "name": name, "speed": SECTION_SPEED.get(name, 1.0)})
    if not sections:
        sections = [{"time": 0, "name": "emergence", "speed": 1.0}]

    out = {
        "song": args.song,
        "duration": analysis["duration"],
        "tempo": analysis.get("tempo", 110),
        "events": events,
        "curves": curves,
        "beats": analysis["master"]["beats"],
        "sections": sections,
    }

    with open(args.out, "w") as f:
        json.dump(out, f)
    print(f"wrote event-map ({len(events)} events, {len(sections)} sections) -> {args.out}")


if __name__ == "__main__":
    main()
