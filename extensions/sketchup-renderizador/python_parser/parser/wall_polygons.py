"""
Detect closed wall regions from raw wall line segments.

Studio DWGs draw walls as two parallel lines (double-line walls) without
explicit endcaps or hatch fills that would close them. Strategy:

  1. For each pair of near-parallel wall segments within wall-thickness
     range (20–400mm), emit a rectangle polygon spanning their common
     overlap — this IS the wall slab.
  2. For wall entities that arrive already closed (LWPOLYLINEs with
     closed=True — columns, thick block elements), emit the polygon as-is.
  3. Any unpaired leftover segments fall through — no polygon, but at least
     no false walls either. Ruby will draw them as edges-only for reference.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from .classifier import Classified
from .dxf_reader import Entity


# Pair-matching thresholds (tuned against studio DWGs in Training/).
PAIR_MIN_GAP_MM = 15.0        # below this the pair is effectively the same line
PAIR_MAX_GAP_MM = 800.0       # exterior walls can run up to ~600mm thick
PAIR_ANGULAR_TOL = math.radians(5.0)
PAIR_MIN_OVERLAP_FRACTION = 0.15   # accept short overlaps (short wall stubs
                                   # paired with long partners)

# Single-line walls: if a segment is longer than this and unpaired, synthesise
# a partner by offsetting 100mm perpendicular toward the wall-network centroid.
# Covers studio DWGs that draw exterior walls as a single outline without an
# interior companion.
SINGLE_LINE_MIN_LENGTH_MM = 1000.0
SINGLE_LINE_DEFAULT_THICKNESS_MM = 100.0
ENDPOINT_CONNECTIVITY_TOL_MM = 150.0   # how close another wall endpoint must be
                                       # to consider this segment "connected"

# Coordinate snap grid (mm) to smooth 0.x-mm authoring jitter.
SNAP_TOLERANCE_MM = 1.0


@dataclass
class _Seg:
    a: tuple[float, float]
    b: tuple[float, float]
    ux: float  # unit direction x
    uy: float
    length: float


def detect_wall_polygons(classified: list[Classified]) -> tuple[list[dict], list[Classified]]:
    """Return (polygons, leftover_classified).

    Polygons: list of dicts with `boundary` (outer ring mm), `holes`, `layer`,
    `kind`. Leftover_classified: the non-wall items plus any wall entities
    whose segments weren't consumed.
    """
    wall_items = [c for c in classified if c.type == "wall"]
    non_wall = [c for c in classified if c.type != "wall"]
    if not wall_items:
        return [], classified

    default_layer = wall_items[0].entity.layer
    default_kind = wall_items[0].kind or "interior"

    polygons: list[dict] = []

    # 1) Already-closed wall entities (columns / pre-closed wall outlines).
    remaining_wall_items: list[Classified] = []
    for c in wall_items:
        pts = _snap_pts(c.entity.points)
        if c.entity.closed and len(pts) >= 3:
            polygons.append({
                "boundary": [[x, y] for x, y in pts],
                "holes": [],
                "layer": c.entity.layer,
                "kind": c.kind or "interior",
            })
        else:
            remaining_wall_items.append(c)

    # 2) For paired double-line walls, emit a rectangle.
    segments = _flatten_to_segments(remaining_wall_items)
    pair_rects, paired_flags = _pair_rectangles(segments)
    for rect in pair_rects:
        polygons.append({
            "boundary": [list(p) for p in rect],
            "holes": [],
            "layer": default_layer,
            "kind": default_kind,
        })

    # 3) For long unpaired segments, synthesise a single-line wall by
    #    offsetting perpendicular toward the wall-network centroid.
    #    Only accept a segment if both of its endpoints have at least one
    #    other wall-segment endpoint nearby — rejects stray axis lines,
    #    construction baselines, and isolated annotations that happen to
    #    sit on the wall layer.
    centroid = _wall_centroid(segments)
    endpoints = []
    for s in segments:
        endpoints.extend([s.a, s.b])

    def _has_neighbour(p, skip_seg_idx):
        for k, s in enumerate(segments):
            if k == skip_seg_idx:
                continue
            for q in (s.a, s.b):
                if abs(p[0] - q[0]) < ENDPOINT_CONNECTIVITY_TOL_MM and \
                   abs(p[1] - q[1]) < ENDPOINT_CONNECTIVITY_TOL_MM:
                    return True
        return False

    for i, seg in enumerate(segments):
        if paired_flags[i] or seg.length < SINGLE_LINE_MIN_LENGTH_MM:
            continue
        if not (_has_neighbour(seg.a, i) and _has_neighbour(seg.b, i)):
            continue
        rect = _single_line_rectangle(seg, centroid, SINGLE_LINE_DEFAULT_THICKNESS_MM)
        if rect is None:
            continue
        polygons.append({
            "boundary": [list(p) for p in rect],
            "holes": [],
            "layer": default_layer,
            "kind": default_kind,
        })

    # Non-wall items pass through untouched.
    return polygons, non_wall


def _wall_centroid(segments: list[_Seg]) -> tuple[float, float]:
    """Centroid of segment midpoints (unweighted)."""
    if not segments:
        return (0.0, 0.0)
    sx = sum((s.a[0] + s.b[0]) / 2 for s in segments)
    sy = sum((s.a[1] + s.b[1]) / 2 for s in segments)
    n = len(segments)
    return (sx / n, sy / n)


def _single_line_rectangle(seg: _Seg, centroid: tuple[float, float], thickness: float):
    """Rectangle wall slab from a single line offset toward the centroid."""
    # Perpendicular unit vector (left of direction).
    nx, ny = -seg.uy, seg.ux
    mid = ((seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2)
    to_c = (centroid[0] - mid[0], centroid[1] - mid[1])
    dot = to_c[0] * nx + to_c[1] * ny
    if dot == 0:
        return None
    sign = 1.0 if dot > 0 else -1.0
    off_x, off_y = nx * sign * thickness, ny * sign * thickness
    p1 = seg.a
    p2 = seg.b
    p3 = (seg.b[0] + off_x, seg.b[1] + off_y)
    p4 = (seg.a[0] + off_x, seg.a[1] + off_y)
    return (p1, p2, p3, p4)


def _snap_pts(points):
    return [
        (round(x / SNAP_TOLERANCE_MM) * SNAP_TOLERANCE_MM,
         round(y / SNAP_TOLERANCE_MM) * SNAP_TOLERANCE_MM)
        for x, y in points
    ]


def _flatten_to_segments(items: list[Classified]) -> list[_Seg]:
    out: list[_Seg] = []
    for c in items:
        pts = _snap_pts(c.entity.points)
        edges = list(zip(pts, pts[1:]))
        if c.entity.closed and len(pts) > 2:
            edges.append((pts[-1], pts[0]))
        for a, b in edges:
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy)
            if L == 0:
                continue
            out.append(_Seg(a=a, b=b, ux=dx / L, uy=dy / L, length=L))
    return out


def _pair_rectangles(segments: list[_Seg]) -> tuple[list[tuple], list[bool]]:
    """Greedy pair-match + emit rectangle polygon for each pair.

    Returns (rectangles, paired_flags) where paired_flags[i] is True if
    segments[i] participated in a pair.
    """
    n = len(segments)
    paired = [False] * n
    rects: list[tuple] = []

    for i in range(n):
        if paired[i]:
            continue
        si = segments[i]

        best = None  # (gap, j, overlap_lo, overlap_hi)
        for j in range(i + 1, n):
            if paired[j]:
                continue
            sj = segments[j]

            # Parallelism
            sin_theta = abs(si.ux * sj.uy - si.uy * sj.ux)
            if sin_theta > math.sin(PAIR_ANGULAR_TOL):
                continue

            # Perpendicular distance from sj.mid to si
            midx = (sj.a[0] + sj.b[0]) / 2
            midy = (sj.a[1] + sj.b[1]) / 2
            nx, ny = -si.uy, si.ux
            gap = abs((midx - si.a[0]) * nx + (midy - si.a[1]) * ny)
            if gap < PAIR_MIN_GAP_MM or gap > PAIR_MAX_GAP_MM:
                continue

            # Project sj's endpoints onto si's axis
            pa = (sj.a[0] - si.a[0]) * si.ux + (sj.a[1] - si.a[1]) * si.uy
            pb = (sj.b[0] - si.a[0]) * si.ux + (sj.b[1] - si.a[1]) * si.uy
            lo_j, hi_j = sorted((pa, pb))

            overlap_lo = max(0.0, lo_j)
            overlap_hi = min(si.length, hi_j)
            overlap = max(0.0, overlap_hi - overlap_lo)
            shorter = min(si.length, sj.length)
            if shorter == 0 or overlap / shorter < PAIR_MIN_OVERLAP_FRACTION:
                continue

            if best is None or gap < best[0]:
                best = (gap, j, overlap_lo, overlap_hi, pa, pb)

        if best is None:
            continue

        _, j, olo, ohi, pa, pb = best
        sj = segments[j]

        # Points on si at overlap bounds.
        pi_start = (si.a[0] + si.ux * olo, si.a[1] + si.uy * olo)
        pi_end = (si.a[0] + si.ux * ohi, si.a[1] + si.uy * ohi)

        # Map overlap bounds onto sj's axis. sj's parameter-along-si is (pa, pb).
        if pa <= pb:
            j_start_p, j_end_p = pa, pb
            j_start_pt, j_end_pt = sj.a, sj.b
        else:
            j_start_p, j_end_p = pb, pa
            j_start_pt, j_end_pt = sj.b, sj.a
        span = j_end_p - j_start_p
        if span == 0:
            continue
        t_lo = (olo - j_start_p) / span
        t_hi = (ohi - j_start_p) / span
        pj_start = (
            j_start_pt[0] + (j_end_pt[0] - j_start_pt[0]) * t_lo,
            j_start_pt[1] + (j_end_pt[1] - j_start_pt[1]) * t_lo,
        )
        pj_end = (
            j_start_pt[0] + (j_end_pt[0] - j_start_pt[0]) * t_hi,
            j_start_pt[1] + (j_end_pt[1] - j_start_pt[1]) * t_hi,
        )

        # CCW rectangle: pi_start -> pi_end -> pj_end -> pj_start -> close.
        rects.append((pi_start, pi_end, pj_end, pj_start))
        paired[i] = True
        paired[j] = True

    return rects, paired
