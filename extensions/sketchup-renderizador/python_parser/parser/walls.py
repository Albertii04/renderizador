"""
Double-line wall detection.

Studio DWGs draw walls as two parallel polylines delimiting the true wall
thickness (not a centerline + fixed thickness). This module looks for
near-parallel line pairs on wall layers, collapses each pair into a single
wall with:

  - a centerline path (midpoint of the two lines)
  - a thickness equal to the perpendicular distance between the lines

Lines that don't find a partner are kept as-is (single-line walls with the
studio default thickness from layer_rules.yaml).

Runs on the *raw line segments* before emitter.build_document composes walls.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable

from .classifier import Classified
from .dxf_reader import Entity


# Min perpendicular distance between two parallel lines to treat as a pair.
# Below this they're effectively the same line (duplicate from the DWG or
# hatch boundary drawn on top of a wall edge).
MIN_PAIR_GAP_MM = 20.0

# Max perpendicular distance between two parallel lines to consider them a pair.
# Studio walls are typically 80–200mm thick; cap well above the normal range
# to cope with fat walls without accidentally merging adjacent parallel rooms.
MAX_PAIR_GAP_MM = 400.0

# Angular tolerance: two lines are "parallel" if the angle between their
# direction vectors is below this (in radians).
ANGULAR_TOL_RAD = math.radians(2.0)

# Overlap tolerance: two parallel lines must share at least this much of their
# projection along their direction to be considered a pair candidate.
MIN_OVERLAP_FRACTION = 0.5


@dataclass
class _Line:
    classified: Classified
    a: tuple[float, float]
    b: tuple[float, float]
    dx: float
    dy: float
    length: float
    paired: bool = False


def collapse_double_line_walls(classified: list[Classified]) -> list[Classified]:
    """Return a new classified list where wall line pairs are collapsed into
    single synthetic wall entities carrying a computed thickness_mm.

    Non-wall items and unpaired wall lines are passed through unchanged.
    """
    wall_lines = [c for c in classified if c.type == "wall" and _is_simple_segment(c.entity)]
    others = [c for c in classified if not (c.type == "wall" and _is_simple_segment(c.entity))]

    lines = [_to_line(c) for c in wall_lines]
    pairs = _find_pairs(lines)

    new_walls: list[Classified] = []
    for line_a, line_b, thickness in pairs:
        new_walls.append(_build_paired_wall(line_a, line_b, thickness))
        line_a.paired = True
        line_b.paired = True

    # Unpaired lines fall through as singletons with default thickness.
    singletons = [line.classified for line in lines if not line.paired]

    return others + new_walls + singletons


def _is_simple_segment(e: Entity) -> bool:
    # Only pair 2-point lines (LINE or a LWPOLYLINE that happens to be 2 points).
    # Longer polylines are already proper wall paths — leave them alone.
    return len(e.points) == 2


def _to_line(c: Classified) -> _Line:
    a = c.entity.points[0]
    b = c.entity.points[1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    return _Line(classified=c, a=a, b=b, dx=dx, dy=dy, length=length)


def _find_pairs(lines: list[_Line]) -> list[tuple[_Line, _Line, float]]:
    """Greedy pair-matching: for each unpaired line, find the best parallel
    neighbour within the gap/overlap tolerances. Each line is paired at most
    once. Returns (line_a, line_b, thickness_mm) triples.
    """
    pairs: list[tuple[_Line, _Line, float]] = []

    for i, line in enumerate(lines):
        if line.paired or line.length == 0:
            continue

        best: tuple[float, _Line] | None = None
        for other in lines[i + 1:]:
            if other.paired or other.length == 0:
                continue

            gap = _parallel_gap(line, other)
            if gap is None or gap < MIN_PAIR_GAP_MM or gap > MAX_PAIR_GAP_MM:
                continue

            overlap = _overlap_fraction(line, other)
            if overlap < MIN_OVERLAP_FRACTION:
                continue

            # Prefer the closest parallel neighbour.
            if best is None or gap < best[0]:
                best = (gap, other)

        if best is not None:
            gap, partner = best
            line.paired = True
            partner.paired = True
            pairs.append((line, partner, gap))

    return pairs


def _parallel_gap(la: _Line, lb: _Line) -> float | None:
    """Perpendicular distance between two lines if they're parallel, else None."""
    # Angular check via cross-product magnitude.
    cross = la.dx * lb.dy - la.dy * lb.dx
    sin_theta = abs(cross) / (la.length * lb.length)
    if sin_theta > math.sin(ANGULAR_TOL_RAD):
        return None

    # Perpendicular distance from line_b's midpoint to line_a.
    mid_b = ((lb.a[0] + lb.b[0]) / 2.0, (lb.a[1] + lb.b[1]) / 2.0)
    # Normal of line_a.
    nx, ny = -la.dy / la.length, la.dx / la.length
    return abs((mid_b[0] - la.a[0]) * nx + (mid_b[1] - la.a[1]) * ny)


def _overlap_fraction(la: _Line, lb: _Line) -> float:
    """Project lb's endpoints onto la and compute the overlap fraction wrt the
    shorter of the two lines."""
    ux, uy = la.dx / la.length, la.dy / la.length

    def proj(p):
        return (p[0] - la.a[0]) * ux + (p[1] - la.a[1]) * uy

    pa0 = 0.0
    pa1 = la.length
    pb0 = proj(lb.a)
    pb1 = proj(lb.b)
    lo_b, hi_b = sorted((pb0, pb1))

    overlap = max(0.0, min(pa1, hi_b) - max(pa0, lo_b))
    shorter = min(la.length, lb.length)
    return overlap / shorter if shorter > 0 else 0.0


def _build_paired_wall(la: _Line, lb: _Line, thickness_mm: float) -> Classified:
    """Synthesize a single Classified wall whose path is the centerline of the
    two paired lines, carrying the measured thickness in a custom attribute
    that the emitter will pick up."""
    # Pair line_b endpoints to line_a endpoints by nearest-distance so the
    # centerline is drawn end-to-end rather than crossing itself.
    b_ordered = _order_partner_endpoints(la, lb)

    mid_start = ((la.a[0] + b_ordered[0][0]) / 2.0, (la.a[1] + b_ordered[0][1]) / 2.0)
    mid_end = ((la.b[0] + b_ordered[1][0]) / 2.0, (la.b[1] + b_ordered[1][1]) / 2.0)

    synthetic = Entity(
        kind="lwpolyline",
        layer=la.classified.entity.layer,
        points=[mid_start, mid_end],
        closed=False,
        handle=f"pair:{la.classified.entity.handle}+{lb.classified.entity.handle}",
    )
    # Attach thickness via attribute on the Classified object so emitter can
    # prefer it over the layer-default.
    out = Classified(entity=synthetic, type="wall", kind=la.classified.kind)
    out.thickness_mm = thickness_mm  # type: ignore[attr-defined]
    return out


def _order_partner_endpoints(la: _Line, lb: _Line) -> tuple[tuple[float, float], tuple[float, float]]:
    d_aa = _dist2(la.a, lb.a)
    d_ab = _dist2(la.a, lb.b)
    return (lb.a, lb.b) if d_aa <= d_ab else (lb.b, lb.a)


def _dist2(p: tuple[float, float], q: tuple[float, float]) -> float:
    return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2
