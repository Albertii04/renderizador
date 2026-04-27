"""
Emitter: turns classified entities into the intermediate JSON document
defined in docs/intermediate_schema.md.

Intentionally dumb — no geometry math beyond computing bounds. Complex
operations (wall thickness inference, opening-to-wall attachment) live
in dedicated modules to be added as needed.
"""
from __future__ import annotations

from typing import Any

from .classifier import Classified, Rules
from .openings import attach_openings_to_walls
from .wall_polygons import detect_wall_polygons


SCHEMA_VERSION = "1.0"


def _close_enough(a: tuple[float, float], b: tuple[float, float], tol_mm: float) -> bool:
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 <= tol_mm ** 2


def _walls_bbox(
    wall_polygons_raw: list[dict],
    classified: list[Classified],
) -> tuple[float, float, float, float] | None:
    """Return (min_x, min_y, max_x, max_y) covering all wall geometry, or None."""
    xs: list[float] = []
    ys: list[float] = []
    for poly in wall_polygons_raw:
        for p in poly["boundary"]:
            xs.append(p[0]); ys.append(p[1])
    for c in classified:
        if c.type == "wall":
            for p in c.entity.points:
                xs.append(p[0]); ys.append(p[1])
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


def _point_inside_bbox(
    x: float,
    y: float,
    bbox: tuple[float, float, float, float],
    margin: float = 0.0,
) -> bool:
    min_x, min_y, max_x, max_y = bbox
    return (min_x - margin) <= x <= (max_x + margin) and \
           (min_y - margin) <= y <= (max_y + margin)


def _marker_footprint(path: list[list[float]]):
    """Return (centroid_xy, W, D, angle_deg) for a 2D marker path.

    Uses Shapely's minimum-rotated-rectangle so rectangular furniture
    outlines drawn at any angle map back to a clean (W, D, orientation).
    Falls back to axis-aligned bbox if Shapely isn't useful.
    """
    import math as _math
    # Explicit handling for 2-point diagonal lines: Shapely's
    # minimum_rotated_rectangle degenerates to a zero-width result for
    # a straight LineString. Studio DWGs draw maniquíes as a single
    # diagonal line whose length = W and orientation = angle.
    if len(path) == 2:
        (x0, y0), (x1, y1) = path[0], path[1]
        dx = x1 - x0; dy = y1 - y0
        length = _math.hypot(dx, dy)
        angle = _math.degrees(_math.atan2(dy, dx))
        cx = (x0 + x1) / 2.0; cy = (y0 + y1) / 2.0
        return (cx, cy), length, 0.0, angle
    try:
        from shapely.geometry import Polygon, LineString  # noqa: WPS433
        pts = [(p[0], p[1]) for p in path]
        if len(pts) >= 3:
            poly = Polygon(pts).minimum_rotated_rectangle
        else:
            poly = LineString(pts).minimum_rotated_rectangle
        coords = list(poly.exterior.coords)[:-1]
        if len(coords) >= 4:
            # Two sides: 0→1 and 1→2. Take the longer as "width" axis.
            side1 = _math.hypot(coords[1][0] - coords[0][0], coords[1][1] - coords[0][1])
            side2 = _math.hypot(coords[2][0] - coords[1][0], coords[2][1] - coords[1][1])
            if side1 >= side2:
                w, d = side1, side2
                angle = _math.degrees(_math.atan2(
                    coords[1][1] - coords[0][1], coords[1][0] - coords[0][0]
                ))
            else:
                w, d = side2, side1
                angle = _math.degrees(_math.atan2(
                    coords[2][1] - coords[1][1], coords[2][0] - coords[1][0]
                ))
            cx = sum(c[0] for c in coords) / len(coords)
            cy = sum(c[1] for c in coords) / len(coords)
            return (cx, cy), w, d, angle
    except Exception:
        pass
    xs = [p[0] for p in path]; ys = [p[1] for p in path]
    w = max(xs) - min(xs); d = max(ys) - min(ys)
    cx = (max(xs) + min(xs)) / 2; cy = (max(ys) + min(ys)) / 2
    return (cx, cy), w, d, 0.0


def _dedupe_markers(markers: list[dict]) -> list[dict]:
    """Drop 2-point line markers whose endpoints both fall inside a
    closed rectangle marker's axis-aligned bbox. These are diagonal
    direction-indicators drawn on top of furniture outlines."""
    closed_rects: list[tuple[float, float, float, float]] = []
    for m in markers:
        path = m.get("path") or []
        if m.get("closed") and len(path) >= 3:
            xs = [p[0] for p in path]; ys = [p[1] for p in path]
            closed_rects.append((min(xs), min(ys), max(xs), max(ys)))

    def _inside(x, y, box, margin=1.0):
        x0, y0, x1, y1 = box
        return (x0 - margin) <= x <= (x1 + margin) and (y0 - margin) <= y <= (y1 + margin)

    kept: list[dict] = []
    for m in markers:
        path = m.get("path") or []
        if len(path) == 2 and not m.get("closed"):
            (x0, y0), (x1, y1) = path[0], path[1]
            if any(_inside(x0, y0, b) and _inside(x1, y1, b) for b in closed_rects):
                continue
        kept.append(m)
    return kept


def _match_markers_to_palette(
    markers: list[dict],
    palette: list[dict],
    block_id_start: int,
    tol_mm: float = 80.0,
) -> tuple[list[dict], list[dict], list[str]]:
    """For each marker, pick the palette item whose W×D matches closest.

    Returns (new_block_entries, remaining_markers, warnings). Emits one
    block entry per matched marker with insert_point=marker centroid,
    rotation from marker orientation, scale from palette item.
    """
    usable = [p for p in palette if p.get("effective_wd")]
    warnings_out: list[str] = []
    new_blocks: list[dict] = []
    remaining: list[dict] = []
    bid = block_id_start

    if not usable:
        return [], markers, []

    for m in markers:
        path = m.get("path")
        # 2-point lines are legit markers (diagonals showing mannequin
        # orientation). Shapely's minimum_rotated_rectangle on a LineString
        # produces a degenerate zero-width rect, so promote to a thin
        # rectangle via midpoint + half-length extrusion.
        if not path or len(path) < 2:
            remaining.append(m); continue
        (cx, cy), mw, md, m_angle = _marker_footprint(path)
        if mw < 50 and md < 50:
            remaining.append(m); continue
        # For 2-point lines md may be 0; give them a nominal depth so
        # palette matching treats them as a W × nominal-D footprint.
        if md < 50:
            md = 50.0

        best = None  # (err, palette_item, orientation_flip)
        for p in usable:
            pw, pd = p["effective_wd"]
            for flip, (cw, cd) in enumerate(((pw, pd), (pd, pw))):
                err = abs(mw - cw) + abs(md - cd)
                if err < tol_mm * 2 and (best is None or err < best[0]):
                    best = (err, p, flip)
        if best is None:
            remaining.append(m); continue

        _, p, flip = best
        bid += 1
        # Normalize marker axis angle to [0, 180) — rotation by θ vs θ+180
        # is geometrically equivalent for a centered placement, but some
        # pieces are asymmetric along the long axis (visios have shelves
        # on one face only). Picking the canonical [0,180) reduces
        # arbitrary 180° flips coming from Shapely's vertex ordering.
        while m_angle < 0:
            m_angle += 180.0
        while m_angle >= 180.0:
            m_angle -= 180.0
        rot = m_angle + (90.0 if flip else 0.0)
        # Compute where to translate so the block's bbox centroid lands on
        # the marker centroid. In block-local coords the bbox centroid is
        # at (min_x + W/2, min_y + D/2). After scale then rotate, that
        # point must equal (cx, cy).
        pw, pd = p["effective_wd"]
        bmin = p.get("bbox_min_mm") or [0.0, 0.0]
        sx, sy, _ = p["scale"]
        # Use scale=1 for marker-matched placement — we rely on the block
        # definition's natural mm size, not the palette's unit-hack scale
        # (visios carry scale 3.516 as a Z-only workaround, applying it on
        # X/Y would stretch the piece 3.5×).
        local_cx = bmin[0] + pw / 2.0
        local_cy = bmin[1] + pd / 2.0
        import math as _math
        rad = _math.radians(rot)
        cos_r = _math.cos(rad); sin_r = _math.sin(rad)
        # Account for flip (swapping W↔D via extra 90° is already in rot).
        # After rotation: centroid_world = origin_world + R * (local_cx, local_cy)
        # So origin_world = (cx, cy) - R * (local_cx, local_cy)
        off_x = cos_r * local_cx - sin_r * local_cy
        off_y = sin_r * local_cx + cos_r * local_cy
        insert_x = cx - off_x
        insert_y = cy - off_y
        # Z offset: lift by -block_z_min so block sits on floor (Z=0) instead
        # of straddling it. Studio visios have geometry centered on Z=0
        # (-1500..+1500) within the block def; leaving insert_z=0 buries
        # half the mueble below the slab.
        z_min = p.get("bbox_min_z_mm") or 0.0
        insert_z = -z_min
        new_blocks.append({
            "id": f"block_{bid:04d}",
            "layer": m.get("layer", ""),
            "block_name": p["block_name"],
            "insert_point": [insert_x, insert_y, insert_z],
            "rotation_deg": rot,
            # Use scale=1 but preserve sign on Z — some studio blocks are
            # defined "upside down" with negative Z-scale compensating. If we
            # flatten to +1 the mueble renders inverted into the floor.
            "scale": [
                1.0 if sx > 0 else -1.0,
                1.0 if sy > 0 else -1.0,
                1.0 if p["scale"][2] > 0 else -1.0,
            ],
            "kind": m.get("kind", "furniture"),
            "from_marker": True,
        })

    if new_blocks:
        warnings_out.append(
            f"Matched {len(new_blocks)} 2D marker(s) to palette 3D block(s) by footprint."
        )
    return new_blocks, remaining, warnings_out


def build_document(
    source_file: str,
    classified: list[Classified],
    warnings: list[str],
    rules: Rules,
) -> dict[str, Any]:
    walls: list[dict] = []
    floors: list[dict] = []
    openings: list[dict] = []
    blocks: list[dict] = []
    markers: list[dict] = []

    defaults = rules.defaults
    wall_id = opening_id = floor_id = block_id = marker_id = 0

    all_points: list[tuple[float, float]] = []

    # Palette candidates: block definitions inserted at far-away "swatch"
    # points that the studio later drags onto 2D markers. Collected during
    # the classify pass, matched to markers after the main pass.
    palette: list[dict] = []

    # Reduce the wall line segments to closed polygons via Shapely's
    # polygonize — each polygon is one physical wall slab, ready to push-pull.
    # Replaces the earlier "pair parallel lines" heuristic and avoids relying
    # on SketchUp's edge → face auto-detection (which doesn't trigger for
    # add_line inside a sub-group).
    wall_polygons_raw, classified = detect_wall_polygons(classified)

    # Compute walls bbox up-front so we can reject palette/catalog block
    # inserts (studio habit: drop all 3D muebles at a single point far
    # outside the building, like a swatch palette, to drag into position
    # later). Anything inserted outside the walls envelope is almost
    # certainly a palette item, not a real placement.
    walls_bbox = _walls_bbox(wall_polygons_raw, classified)

    for c in classified:
        e = c.entity

        if c.type == "wall":
            wall_id += 1
            height = (
                defaults.get("exterior_wall_height_mm", 3000)
                if c.kind == "exterior"
                else defaults.get("interior_wall_height_mm", 2700)
            )
            measured_thickness = getattr(c, "thickness_mm", None)
            walls.append({
                "id": f"wall_{wall_id:04d}",
                "layer": e.layer,
                "path": [[p[0], p[1]] for p in e.points],
                "closed": e.closed,
                "default_height_mm": height,
                "thickness_mm": measured_thickness
                    if measured_thickness is not None
                    else defaults.get("wall_thickness_mm", 100),
                "kind": c.kind or "interior",
            })
            all_points.extend(e.points)

        elif c.type == "floor":
            if not e.closed:
                # Tolerate small gaps: if first and last points are within
                # ~50mm we treat it as closed. Studio pavimento outlines are
                # sometimes drawn as near-closed polylines.
                if len(e.points) >= 3 and _close_enough(e.points[0], e.points[-1], 50.0):
                    pass
                else:
                    warnings.append(
                        f"Floor on layer '{e.layer}' is not a closed polyline — skipped."
                    )
                    continue
            floor_id += 1
            floors.append({
                "id": f"floor_{floor_id:04d}",
                "layer": e.layer,
                "boundary": [[p[0], p[1]] for p in e.points],
                "elevation_mm": 0,
            })
            all_points.extend(e.points)

        elif c.type == "opening":
            # Openings in DXF are often blocks or 2D symbols. Without
            # wall-matching logic yet, emit them un-attached and let the
            # Ruby side (or a later pass here) associate them.
            opening_id += 1
            # Use insert point for block-based doors, or centroid of points otherwise.
            if e.kind == "insert" and e.insert_point:
                ref = [e.insert_point[0], e.insert_point[1]]
            elif e.points:
                xs = [p[0] for p in e.points]
                ys = [p[1] for p in e.points]
                ref = [sum(xs) / len(xs), sum(ys) / len(ys)]
            else:
                continue

            openings.append({
                "id": f"{c.kind or 'opening'}_{opening_id:04d}",
                "layer": e.layer,
                "kind": c.kind or "door",
                "wall_id": None,  # to be resolved by a later matching pass
                "reference_point": ref,
                "width_mm": 900,   # studio default; override once we parse block attributes
                "height_mm": 2100,
                "sill_mm": 0 if c.kind == "door" else 900,
            })

        elif c.type == "block":
            if e.kind == "insert" and e.insert_point and walls_bbox is not None:
                ip = e.insert_point
                if not _point_inside_bbox(ip[0], ip[1], walls_bbox, margin=5000):
                    # Palette/catalog item: register as a candidate for
                    # marker matching. We don't emit the palette instance
                    # directly (wrong position) but its block_name + bbox
                    # let us map 2D markers onto the real 3D definition.
                    # Use the block-definition's raw bbox (mm) for matching
                    # — NOT bbox × insert_scale. Studio visios have bbox
                    # ~1000×400 (true mm size) and insert scale 3.516 as a
                    # unit workaround; markers are drawn at the true mm
                    # size, so raw bbox matches directly.
                    palette.append({
                        "block_name": e.block_name,
                        "bbox_mm": list(e.block_bbox_mm) if e.block_bbox_mm else None,
                        "bbox_min_mm": (
                            list(e.block_bbox_min_mm) if e.block_bbox_min_mm else [0.0, 0.0]
                        ),
                        "bbox_min_z_mm": (
                            e.block_bbox_min_z_mm if e.block_bbox_min_z_mm is not None else 0.0
                        ),
                        "scale": list(e.scale),
                        "rotation_deg": e.rotation_deg,
                        "effective_wd": (
                            abs(e.block_bbox_mm[0]),
                            abs(e.block_bbox_mm[1]),
                        ) if e.block_bbox_mm else None,
                    })
                    continue
            if e.kind != "insert" or not e.insert_point:
                # Hand-drawn 2D furniture outlines on block layers are common
                # (MUEBLE CONCEP etc.). No 3D definition to place — emit as a
                # 2D marker polyline so the user still sees where furniture
                # was planned in the DWG.
                if e.points and len(e.points) >= 2:
                    marker_id += 1
                    markers.append({
                        "id": f"marker_{marker_id:04d}",
                        "layer": e.layer,
                        "path": [[p[0], p[1]] for p in e.points],
                        "closed": e.closed,
                        "kind": c.kind or "furniture",
                    })
                continue
            block_id += 1
            blocks.append({
                "id": f"block_{block_id:04d}",
                "layer": e.layer,
                "block_name": e.block_name,
                "insert_point": list(e.insert_point),
                "rotation_deg": e.rotation_deg,
                "scale": list(e.scale),
                "kind": c.kind or "furniture",
                # Ship bbox so Ruby can build a placeholder box when
                # SketchUp's DWG importer fails to harvest the block
                # (anonymous *U... blocks are silently filtered).
                "bbox_mm": list(e.block_bbox_mm) if e.block_bbox_mm else None,
                "bbox_min_mm": list(e.block_bbox_min_mm) if e.block_bbox_min_mm else None,
                "bbox_min_z_mm": e.block_bbox_min_z_mm,
            })
            all_points.append((e.insert_point[0], e.insert_point[1]))

    # Filter out fantasma wall polygons: Shapely.polygonize spans stray
    # lines into giant polygons covering most of the drawing. Reject any
    # polygon whose bbox exceeds 3× the real walls bbox extent.
    if walls_bbox is not None:
        bb_x = walls_bbox[2] - walls_bbox[0]
        bb_y = walls_bbox[3] - walls_bbox[1]
        max_dim = max(bb_x, bb_y) * 3.0 if (bb_x > 0 and bb_y > 0) else None
        if max_dim:
            filtered = []
            for poly in wall_polygons_raw:
                xs = [p[0] for p in poly["boundary"]]
                ys = [p[1] for p in poly["boundary"]]
                if (max(xs) - min(xs)) <= max_dim and (max(ys) - min(ys)) <= max_dim:
                    filtered.append(poly)
            wall_polygons_raw = filtered

    # Materialise the polygons detected by Shapely as wall records.
    default_h = defaults.get("interior_wall_height_mm", 2700)
    for poly in wall_polygons_raw:
        wall_id += 1
        walls.append({
            "id": f"wall_{wall_id:04d}",
            "layer": poly["layer"],
            "boundary": poly["boundary"],
            "holes": poly["holes"],
            # `path` kept as alias so opening-attachment (which iterates
            # path segments) still works on polygon walls.
            "path": poly["boundary"] + [poly["boundary"][0]],
            "closed": True,
            "default_height_mm": default_h,
            "thickness_mm": 0,  # thickness is implicit in the polygon shape
            "kind": poly.get("kind") or "interior",
        })
        all_points.extend(poly["boundary"])

    # Dedupe: studio draws furniture as a closed rectangle PLUS a diagonal
    # line inside it (direction indicator). Suppress the line marker when
    # its endpoints both fall inside a closed rectangle marker's bbox —
    # the rectangle already captures the footprint.
    markers = _dedupe_markers(markers)

    # Reject markers whose centroid falls outside the walls envelope +
    # margin. Shields against stray CIRCLE/ARC entities placed far from
    # the plan (schedule tags, north arrows, title blocks).
    if walls_bbox is not None:
        mx0, my0, mx1, my1 = walls_bbox
        margin = 2000.0
        kept: list[dict] = []
        for m in markers:
            path = m.get("path") or []
            if not path:
                continue
            xs = [p[0] for p in path]; ys = [p[1] for p in path]
            cx = (min(xs) + max(xs)) / 2; cy = (min(ys) + max(ys)) / 2
            if mx0 - margin <= cx <= mx1 + margin and my0 - margin <= cy <= my1 + margin:
                kept.append(m)
        markers = kept

    # Palette matching DISABLED: emits too many false positives because
    # studio block-defs often have geometry in world-space (sending placements
    # km away) or with weird unit scale. Markers without a directly-named
    # block fall through to the Ruby library_index path (footprint-strict
    # match against user's modeled .skp library) instead.
    matched_blocks: list[dict] = []
    remaining_markers = markers
    match_warnings: list[str] = []
    _ = _match_markers_to_palette  # keep import, silence linter
    # Sanity filter: drop placements that landed wildly outside the building.
    # Studio block-defs occasionally store geometry in world-space coords
    # (instead of block-local), making the offset math send the placement
    # tens or hundreds of km away. Keep only inside walls_bbox + 5 m margin.
    if walls_bbox is not None and matched_blocks:
        wx0, wy0, wx1, wy1 = walls_bbox
        margin = 5000.0
        kept_blocks = []
        rejected = 0
        for b in matched_blocks:
            ip = b.get("insert_point") or [0, 0, 0]
            if (wx0 - margin) <= ip[0] <= (wx1 + margin) and \
               (wy0 - margin) <= ip[1] <= (wy1 + margin):
                kept_blocks.append(b)
            else:
                rejected += 1
        if rejected:
            match_warnings.append(
                f"Dropped {rejected} marker→palette match(es) that resolved "
                f"outside the building bounds (palette block-def geometry was "
                f"in world-space, not block-local)."
            )
        matched_blocks = kept_blocks
    blocks.extend(matched_blocks)
    markers = remaining_markers
    warnings.extend(match_warnings)

    # Attach openings to their nearest wall segment.
    warnings.extend(attach_openings_to_walls(walls, openings))

    # Compute bounding box in the XY plane.
    if all_points:
        xs = [p[0] for p in all_points]
        ys = [p[1] for p in all_points]
        bounds = {"min": [min(xs), min(ys)], "max": [max(xs), max(ys)]}
    else:
        bounds = {"min": [0, 0], "max": [0, 0]}

    return {
        "version": SCHEMA_VERSION,
        "source_file": source_file,
        "bounds": bounds,
        "walls": walls,
        "floors": floors,
        "openings": openings,
        "blocks": blocks,
        "markers": markers,
        "warnings": warnings,
    }
