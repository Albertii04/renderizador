"""Render the CAD walls + parser output side-by-side as PNG.

Usage: python debug/visualize.py <dwg-or-dxf-path> [output_prefix]

Produces:
  <prefix>_raw.png    — every classified `wall` line segment
  <prefix>_polys.png  — the polygons the parser detected (what Ruby builds)
  <prefix>_overlay.png — both, walls as grey fill, raw lines as red
"""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPolygon
from matplotlib.collections import PatchCollection, LineCollection

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from parser.classifier import classify_entities, load_rules
from parser.dxf_reader import read_dxf
from parser.wall_polygons import detect_wall_polygons


def main():
    src = Path(sys.argv[1])
    prefix = sys.argv[2] if len(sys.argv) > 2 else "out"

    rules = load_rules(HERE.parent / "layer_rules.yaml")
    entities = read_dxf(src)
    classified, _ = classify_entities(entities, rules)

    wall_items = [c for c in classified if c.type == "wall"]
    print(f"wall entities: {len(wall_items)}")

    # Raw line segments
    raw_segments = []
    for c in wall_items:
        pts = c.entity.points
        for i in range(len(pts) - 1):
            raw_segments.append([pts[i], pts[i + 1]])
        if c.entity.closed and len(pts) > 2:
            raw_segments.append([pts[-1], pts[0]])
    print(f"raw segments: {len(raw_segments)}")

    # Detected polygons
    polys, _ = detect_wall_polygons(classified)
    print(f"detected wall polygons: {len(polys)}")

    # Raw figure
    fig, ax = plt.subplots(figsize=(20, 20))
    lc = LineCollection(raw_segments, colors="red", linewidths=0.7)
    ax.add_collection(lc)
    ax.set_aspect("equal"); ax.autoscale()
    ax.set_title(f"Raw wall lines  ({len(raw_segments)})")
    fig.savefig(f"{prefix}_raw.png", dpi=120, bbox_inches="tight")
    plt.close(fig)

    # Polygons figure
    fig, ax = plt.subplots(figsize=(20, 20))
    patches = [MplPolygon(p["boundary"], closed=True) for p in polys]
    ax.add_collection(PatchCollection(patches, facecolor="#888", edgecolor="black", linewidths=0.5))
    ax.set_aspect("equal"); ax.autoscale()
    ax.set_title(f"Detected wall polygons  ({len(polys)})")
    fig.savefig(f"{prefix}_polys.png", dpi=120, bbox_inches="tight")
    plt.close(fig)

    # Overlay
    fig, ax = plt.subplots(figsize=(20, 20))
    ax.add_collection(PatchCollection(patches, facecolor="#666", edgecolor="#222", linewidths=0.5, alpha=0.7))
    ax.add_collection(LineCollection(raw_segments, colors="red", linewidths=0.7, alpha=0.9))
    ax.set_aspect("equal"); ax.autoscale()
    ax.set_title(f"Overlay — raw (red) vs detected polygons (grey)")
    fig.savefig(f"{prefix}_overlay.png", dpi=120, bbox_inches="tight")
    plt.close(fig)

    print(f"wrote {prefix}_raw.png, {prefix}_polys.png, {prefix}_overlay.png")


if __name__ == "__main__":
    main()
