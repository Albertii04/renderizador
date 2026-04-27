"""
Opening → wall attachment.

Doors and windows come out of AutoCAD on their own layers but aren't
explicitly linked to the walls they belong to. This module finds the
nearest wall segment for each opening within a tolerance and records
the attachment in the emitted JSON.

Runs as a post-classification pass. Called from emitter.build_document
once walls and openings are both known.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


SNAP_TOLERANCE_MM = 1200  # openings further than this from any wall are left unattached.
# Studio DXFs often place door symbols ~600mm off the wall centerline (swing arc
# baseline, not hinge point). 500mm was too tight; 1200mm covers observed gaps.


@dataclass
class _Segment:
    wall_id: str
    a: tuple[float, float]
    b: tuple[float, float]


def attach_openings_to_walls(walls: list[dict], openings: list[dict]) -> list[str]:
    """Mutate `openings` in place to set wall_id and position_along_wall_mm.

    Returns a list of warning strings for openings that couldn't be matched.
    """
    segments = _collect_wall_segments(walls)
    warnings: list[str] = []

    for opening in openings:
        if opening.get("wall_id"):
            continue

        ref = opening.get("reference_point")
        if not ref:
            continue

        best = _nearest_segment(ref, segments)
        if best is None:
            warnings.append(
                f"Opening {opening['id']} on layer '{opening['layer']}' "
                f"couldn't be matched to any wall — left unattached."
            )
            continue

        segment, distance, position = best
        if distance > SNAP_TOLERANCE_MM:
            warnings.append(
                f"Opening {opening['id']} is {distance:.0f}mm from the nearest wall "
                f"(tolerance {SNAP_TOLERANCE_MM}mm) — left unattached."
            )
            continue

        opening["wall_id"] = segment.wall_id
        opening["position_along_wall_mm"] = position

    return warnings


def _collect_wall_segments(walls: list[dict]) -> list[_Segment]:
    segments: list[_Segment] = []
    for wall in walls:
        path = wall["path"]
        wall_id = wall["id"]
        for i in range(len(path) - 1):
            segments.append(_Segment(wall_id, tuple(path[i]), tuple(path[i + 1])))
        if wall.get("closed") and len(path) > 2:
            segments.append(_Segment(wall_id, tuple(path[-1]), tuple(path[0])))
    return segments


def _nearest_segment(
    point: list[float],
    segments: list[_Segment],
) -> tuple[_Segment, float, float] | None:
    """Return (segment, distance_mm, position_along_segment_mm) for the nearest."""
    px, py = point
    best: tuple[_Segment, float, float] | None = None

    for seg in segments:
        ax, ay = seg.a
        bx, by = seg.b
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        if length_sq == 0:
            continue

        # Project point onto segment, clamped to [0, 1] along the segment.
        t = ((px - ax) * dx + (py - ay) * dy) / length_sq
        t_clamped = max(0.0, min(1.0, t))

        proj_x = ax + t_clamped * dx
        proj_y = ay + t_clamped * dy

        distance = math.hypot(px - proj_x, py - proj_y)
        position = t_clamped * math.sqrt(length_sq)

        if best is None or distance < best[1]:
            best = (seg, distance, position)

    return best
