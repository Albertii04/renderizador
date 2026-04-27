"""
Thin wrapper around ezdxf.

Walks the modelspace and yields normalized entity dicts. Keeps ezdxf-specific
types out of the rest of the codebase.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

import ezdxf


@dataclass
class Entity:
    """Normalized DXF entity."""
    kind: str                    # "line" | "lwpolyline" | "polyline" | "insert" | "circle" | ...
    layer: str
    points: list[tuple[float, float]] = field(default_factory=list)
    closed: bool = False
    # For INSERT (block reference):
    block_name: str | None = None
    insert_point: tuple[float, float, float] | None = None
    rotation_deg: float = 0.0
    scale: tuple[float, float, float] = (1.0, 1.0, 1.0)
    # True when the referenced block definition contains 3D geometry
    # (3DSOLID / MESH / BODY / SURFACE / 3DFACE / POLYFACE). Used to
    # override layer classification: a 3D-bearing block is always furniture
    # regardless of the layer it sits on (studio sometimes leaves them on '0').
    block_has_3d: bool = False
    # Block definition footprint (W, D, H) in DWG units (mm). Used to match
    # palette / catalog block instances to 2D markers in the floor plan —
    # studio drops 3D muebles at a far-away "palette" point and sketches a
    # 2D outline where each one should land.
    block_bbox_mm: tuple[float, float, float] | None = None
    # Block bbox minimum corner (origin-relative). Needed so we can
    # translate the component so its bbox centroid lands on the marker
    # centroid regardless of where its definition origin sits.
    block_bbox_min_mm: tuple[float, float] | None = None
    # Minimum Z of the block geometry (origin-relative). Studio visios have
    # geometry centered on Z=0 (-1500..+1500). Placing the block with Z=0
    # anchor leaves half the piece underground. Shift insert Z up by -z_min
    # so the block sits on the floor.
    block_bbox_min_z_mm: float | None = None
    # Raw handle for tracing / warnings
    handle: str = ""


class DWGConversionError(RuntimeError):
    """Raised when a DWG file is given and ODA File Converter is unavailable."""


def read_dxf(path: Path) -> list[Entity]:
    """Load a DXF or DWG file and return the list of relevant entities.

    DWG support requires ODA File Converter installed locally. The parser
    invokes it transparently via ezdxf's odafc addon. On conversion failure
    a DWGConversionError is raised with actionable install guidance.
    """
    suffix = path.suffix.lower()
    if suffix == ".dwg":
        doc = _read_dwg_via_oda(path)
    else:
        doc = ezdxf.readfile(str(path))
    blocks_with_3d = _blocks_with_3d(doc)
    block_bbox = _blocks_bbox(doc)
    msp = doc.modelspace()
    entities = list(_iter_entities(msp, blocks_with_3d, block_bbox))
    # Expand nested INSERTs inside dynamic-block wrappers (`*U###`,
    # `*D###`, etc.). Studio DWGs wrap real furniture INSERTs (PM2023…) inside
    # anonymous dynamic-block wrappers; without expansion the parser only sees
    # the wrapper name (which never resolves to a library piece).
    nested = list(_expand_nested_inserts(doc, msp, blocks_with_3d, block_bbox))
    return entities + nested


_3D_TYPES: set[str] = {"3DSOLID", "MESH", "BODY", "SURFACE", "3DFACE", "POLYFACE", "POLYMESH", "REGION"}


def _blocks_with_3d(doc) -> set[str]:
    """Return set of block-definition names that contain 3D geometry.

    Walks nested INSERTs so a block that only references another 3D-bearing
    block is still flagged.
    """
    direct: dict[str, bool] = {}
    refs: dict[str, set[str]] = {}
    for blk in doc.blocks:
        name = blk.name
        if name.startswith("*Model_Space") or name.startswith("*Paper_Space"):
            continue
        has_3d = False
        children: set[str] = set()
        for e in blk:
            t = e.dxftype()
            if t in _3D_TYPES:
                has_3d = True
            elif t == "INSERT":
                children.add(e.dxf.name)
        direct[name] = has_3d
        refs[name] = children

    # Transitive closure.
    out: set[str] = {n for n, v in direct.items() if v}
    changed = True
    while changed:
        changed = False
        for n, kids in refs.items():
            if n in out:
                continue
            if any(k in out for k in kids):
                out.add(n)
                changed = True
    return out


def _read_dwg_via_oda(path: Path):
    import ezdxf  # noqa: WPS433
    from ezdxf.addons import odafc  # lazy: skip PyInstaller bloat when unused

    _ensure_oda_discovered(ezdxf, odafc)

    if not odafc.is_installed():
        raise DWGConversionError(
            "DWG support requires ODA File Converter (free). "
            "Download: https://www.opendesign.com/guestfiles/oda_file_converter — "
            "install it, then retry. No restart needed."
        )
    try:
        return odafc.readfile(str(path))
    except odafc.ODAFCError as e:
        raise DWGConversionError(f"ODA File Converter failed: {e}") from e


# ezdxf's odafc only looks at PATH and its own config. On macOS the ODA
# installer drops a .app bundle under /Applications with the binary nested
# inside — ezdxf never finds it. Windows installs under Program Files.
# Autodetect those canonical locations and inject the path into ezdxf.options
# so odafc picks it up without the user having to configure anything.
_MAC_CANDIDATES = [
    "/Applications/ODAFileConverter.app/Contents/MacOS/ODAFileConverter",
]
_WIN_GLOBS = [
    r"C:\Program Files\ODA\ODAFileConverter*\ODAFileConverter.exe",
    r"C:\Program Files (x86)\ODA\ODAFileConverter*\ODAFileConverter.exe",
]


def _ensure_oda_discovered(ezdxf_mod, odafc) -> None:
    import os
    import platform
    import glob
    import shutil

    if odafc.is_installed():
        return

    system = platform.system()
    found: str | None = None

    if system == "Darwin":
        for cand in _MAC_CANDIDATES:
            if os.path.isfile(cand):
                found = cand
                break
    elif system == "Windows":
        for pattern in _WIN_GLOBS:
            matches = sorted(glob.glob(pattern), reverse=True)  # newest version first
            if matches:
                found = matches[0]
                break
    elif system == "Linux":
        found = shutil.which("ODAFileConverter")

    if found:
        ezdxf_mod.options.set("odafc-addon", "unix_exec_path", found)
        ezdxf_mod.options.set("odafc-addon", "win_exec_path", found)


def _blocks_bbox(doc) -> dict[str, tuple[float, float, float, float, float]]:
    """Return {block_name: (W, D, H)} in the DWG's drawing units.

    Walks polylines, lines, arcs, circles and nested INSERTs. 3DSOLIDs are
    opaque to ezdxf (ACIS), so a block whose only geometry is a 3DSOLID will
    report bbox from whatever 2D wireframe/nested inserts the DXF carries
    alongside it — for studio furniture blocks that's the cartela/base
    polylines, which are representative enough for footprint matching.
    """
    # Returns {name: (W, D, H, min_x, min_y, min_z)}.
    out: dict[str, tuple[float, float, float, float, float, float]] = {}

    def walk(name, seen):
        if name in seen:
            return None
        seen.add(name)
        if name not in doc.blocks:
            return None
        blk = doc.blocks[name]
        xs: list[float] = []
        ys: list[float] = []
        zs: list[float] = []
        for e in blk:
            t = e.dxftype()
            try:
                if t == "LINE":
                    xs += [e.dxf.start.x, e.dxf.end.x]
                    ys += [e.dxf.start.y, e.dxf.end.y]
                    zs += [e.dxf.start.z, e.dxf.end.z]
                elif t == "LWPOLYLINE":
                    for pt in e.get_points():
                        xs.append(pt[0]); ys.append(pt[1]); zs.append(0.0)
                elif t == "POLYLINE":
                    for v in e.vertices:
                        p = v.dxf.location
                        xs.append(p.x); ys.append(p.y); zs.append(p.z)
                elif t in ("CIRCLE", "ARC"):
                    c = e.dxf.center; r = e.dxf.radius
                    xs += [c.x - r, c.x + r]; ys += [c.y - r, c.y + r]; zs.append(c.z)
                elif t == "3DFACE":
                    for i in range(4):
                        p = getattr(e.dxf, f"vtx{i}")
                        xs.append(p.x); ys.append(p.y); zs.append(p.z)
                elif t == "INSERT":
                    sub = walk(e.dxf.name, seen)
                    if sub:
                        sx = e.dxf.xscale; sy = e.dxf.yscale; sz = e.dxf.zscale
                        ix = e.dxf.insert.x; iy = e.dxf.insert.y; iz = e.dxf.insert.z
                        xs += [ix + sub[0] * sx, ix + sub[3] * sx]
                        ys += [iy + sub[1] * sy, iy + sub[4] * sy]
                        zs += [iz + sub[2] * sz, iz + sub[5] * sz]
            except Exception:
                pass
        if not xs:
            return None
        return (min(xs), min(ys), min(zs), max(xs), max(ys), max(zs))

    for blk in doc.blocks:
        n = blk.name
        if n.startswith("*Model_Space") or n.startswith("*Paper_Space"):
            continue
        bb = walk(n, set())
        if bb:
            out[n] = (bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2], bb[0], bb[1], bb[2])
    return out


def _iter_entities(
    msp,
    blocks_with_3d: set[str] | None = None,
    block_bbox: dict[str, tuple[float, float, float, float, float, float]] | None = None,
) -> Iterator[Entity]:
    blocks_with_3d = blocks_with_3d or set()
    block_bbox = block_bbox or {}
    for e in msp:
        dxftype = e.dxftype()
        layer = e.dxf.layer
        handle = e.dxf.handle

        if dxftype == "LINE":
            yield Entity(
                kind="line",
                layer=layer,
                points=[
                    (e.dxf.start.x, e.dxf.start.y),
                    (e.dxf.end.x, e.dxf.end.y),
                ],
                handle=handle,
            )

        elif dxftype == "LWPOLYLINE":
            pts = [(p[0], p[1]) for p in e.get_points()]
            pts, closed = _normalize_polyline(pts, bool(e.closed))
            yield Entity(
                kind="lwpolyline",
                layer=layer,
                points=pts,
                closed=closed,
                handle=handle,
            )

        elif dxftype == "POLYLINE":
            pts = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
            pts, closed = _normalize_polyline(pts, bool(e.is_closed))
            yield Entity(
                kind="polyline",
                layer=layer,
                points=pts,
                closed=closed,
                handle=handle,
            )

        elif dxftype == "CIRCLE":
            c = e.dxf.center; r = float(e.dxf.radius)
            # Approximate circle as a 32-segment polygon. Good enough for
            # footprint matching / marker drawing; SketchUp rebuilds a real
            # circle via inference if the user wants.
            import math as _math
            steps = 32
            pts = [
                (c.x + r * _math.cos(2 * _math.pi * i / steps),
                 c.y + r * _math.sin(2 * _math.pi * i / steps))
                for i in range(steps)
            ]
            yield Entity(kind="circle", layer=layer, points=pts, closed=True, handle=handle)

        elif dxftype == "ARC":
            c = e.dxf.center; r = float(e.dxf.radius)
            import math as _math
            sa = _math.radians(float(e.dxf.start_angle))
            ea = _math.radians(float(e.dxf.end_angle))
            if ea < sa:
                ea += 2 * _math.pi
            steps = max(8, int(abs(ea - sa) / (_math.pi / 16)))
            pts = [
                (c.x + r * _math.cos(sa + (ea - sa) * i / steps),
                 c.y + r * _math.sin(sa + (ea - sa) * i / steps))
                for i in range(steps + 1)
            ]
            yield Entity(kind="arc", layer=layer, points=pts, closed=False, handle=handle)

        elif dxftype == "HATCH":
            # HATCH boundary path(s): extract the outer polyline loop as a
            # marker. Ignores the fill pattern itself (we only want the
            # footprint outline). Studio uses hatches to shade mesas, floor
            # areas — the boundary tells us the footprint.
            try:
                for bp in e.paths:
                    pts: list[tuple[float, float]] = []
                    for edge in getattr(bp, "edges", []) or []:
                        et = getattr(edge, "EDGE_TYPE", "").lower()
                        if et == "linestart" or et == "line":
                            pts.append((edge.start[0], edge.start[1]))
                            pts.append((edge.end[0], edge.end[1]))
                        elif et == "arc":
                            # approximate arc edge
                            import math as _math
                            cx, cy = edge.center[0], edge.center[1]
                            r = float(edge.radius)
                            sa = _math.radians(float(edge.start_angle))
                            ea = _math.radians(float(edge.end_angle))
                            if ea < sa:
                                ea += 2 * _math.pi
                            n = 8
                            for i in range(n + 1):
                                a = sa + (ea - sa) * i / n
                                pts.append((cx + r * _math.cos(a), cy + r * _math.sin(a)))
                    # polyline path (LWPOLYLINE-like boundary)
                    for v in getattr(bp, "vertices", []) or []:
                        pts.append((v[0], v[1]))
                    if len(pts) >= 3:
                        # Dedupe consecutive duplicates
                        dedup = [pts[0]]
                        for p in pts[1:]:
                            if abs(p[0] - dedup[-1][0]) > 1e-6 or abs(p[1] - dedup[-1][1]) > 1e-6:
                                dedup.append(p)
                        dedup, closed = _normalize_polyline(dedup, True)
                        yield Entity(kind="hatch", layer=layer, points=dedup, closed=closed, handle=handle)
                        break  # only outer path
            except Exception:
                pass

        elif dxftype == "INSERT":
            bname = e.dxf.name
            yield Entity(
                kind="insert",
                layer=layer,
                block_name=bname,
                insert_point=(e.dxf.insert.x, e.dxf.insert.y, getattr(e.dxf.insert, "z", 0.0)),
                rotation_deg=float(e.dxf.rotation),
                scale=(float(e.dxf.xscale), float(e.dxf.yscale), float(e.dxf.zscale)),
                block_has_3d=bname in blocks_with_3d,
                block_bbox_mm=(
                    (block_bbox[bname][0], block_bbox[bname][1], block_bbox[bname][2])
                    if bname in block_bbox else None
                ),
                block_bbox_min_mm=(
                    (block_bbox[bname][3], block_bbox[bname][4])
                    if bname in block_bbox else None
                ),
                block_bbox_min_z_mm=(
                    block_bbox[bname][5] if bname in block_bbox else None
                ),
                handle=handle,
            )

        # Future: CIRCLE, ARC, 3DFACE, SOLID, etc. — add as the studio's files need.


def _expand_nested_inserts(doc, msp, blocks_with_3d, block_bbox) -> Iterator[Entity]:
    """Walk into anonymous wrapper INSERTs (`*U###`, `*D###`) in modelspace
    and yield every nested INSERT with world-space transform applied.

    Skips named INSERTs — those are real top-level furniture and already
    yielded by `_iter_entities`. Only descends through anonymous wrappers
    (the `*` prefix) since those are dynamic-block / composite containers.
    Names: only emit the leaf INSERT (no further descent through named
    nested blocks — those are handled as one component by SketchUp on import).
    """
    import math as _math

    def walk(block_name, parent_xform, depth=0):
        if depth > 6 or block_name not in doc.blocks:
            return
        for e in doc.blocks[block_name]:
            if e.dxftype() != "INSERT":
                continue
            child_name = e.dxf.name
            ip = e.dxf.insert
            rot = float(e.dxf.rotation)
            sx = float(e.dxf.xscale); sy = float(e.dxf.yscale); sz = float(e.dxf.zscale)
            world_ip, world_rot, world_sx, world_sy, world_sz = _compose_transform(
                parent_xform, (ip.x, ip.y, getattr(ip, "z", 0.0)), rot, sx, sy, sz
            )
            if child_name.startswith("*"):
                # Recurse through anonymous wrapper; don't emit it as a piece.
                yield from walk(
                    child_name,
                    (world_ip, world_rot, world_sx, world_sy, world_sz),
                    depth + 1,
                )
                continue
            # Named child — emit as world-space INSERT.
            yield Entity(
                kind="insert",
                layer=e.dxf.layer,
                block_name=child_name,
                insert_point=world_ip,
                rotation_deg=world_rot,
                scale=(world_sx, world_sy, world_sz),
                block_has_3d=child_name in blocks_with_3d,
                block_bbox_mm=(
                    (block_bbox[child_name][0], block_bbox[child_name][1], block_bbox[child_name][2])
                    if child_name in block_bbox else None
                ),
                block_bbox_min_mm=(
                    (block_bbox[child_name][3], block_bbox[child_name][4])
                    if child_name in block_bbox else None
                ),
                block_bbox_min_z_mm=(
                    block_bbox[child_name][5] if child_name in block_bbox else None
                ),
                handle=e.dxf.handle,
            )

    # Seed: every anonymous-wrapper INSERT in modelspace.
    for e in msp:
        if e.dxftype() != "INSERT":
            continue
        if not e.dxf.name.startswith("*"):
            continue
        ip = e.dxf.insert
        parent = (
            (ip.x, ip.y, getattr(ip, "z", 0.0)),
            float(e.dxf.rotation),
            float(e.dxf.xscale),
            float(e.dxf.yscale),
            float(e.dxf.zscale),
        )
        yield from walk(e.dxf.name, parent, depth=1)


def _compose_transform(parent, child_ip, child_rot, child_sx, child_sy, child_sz):
    """Compose parent (ip, rot, sx, sy, sz) with child local insert.

    Returns world-space (ip, rot, sx, sy, sz). Translation: world = parent_ip
    + R(parent_rot) * scale(parent_sx, parent_sy) * child_ip. Rotation: sum.
    Scale: product. Z translation simple addition.
    """
    import math as _math
    p_ip, p_rot, p_sx, p_sy, p_sz = parent
    rad = _math.radians(p_rot)
    cos_r = _math.cos(rad); sin_r = _math.sin(rad)
    cx_local = child_ip[0] * p_sx
    cy_local = child_ip[1] * p_sy
    cz_local = child_ip[2] * p_sz
    wx = p_ip[0] + cos_r * cx_local - sin_r * cy_local
    wy = p_ip[1] + sin_r * cx_local + cos_r * cy_local
    wz = p_ip[2] + cz_local
    world_rot = (p_rot + child_rot) % 360.0
    return (
        (wx, wy, wz),
        world_rot,
        p_sx * child_sx,
        p_sy * child_sy,
        p_sz * child_sz,
    )


_CLOSE_TOL_MM = 1e-6


def _normalize_polyline(
    pts: list[tuple[float, float]],
    closed_flag: bool,
) -> tuple[list[tuple[float, float]], bool]:
    """Unify the two DXF closed-polyline conventions.

    Some authoring tools emit a closed-flag polyline with N vertices; others
    emit an open polyline whose first point is duplicated as the last. Downstream
    code (openings attachment, geometry builder) expects the invariant
    ``closed == True`` <=> ``path`` has N distinct vertices (no duplicated endpoint).
    """
    if len(pts) >= 2:
        a, b = pts[0], pts[-1]
        if abs(a[0] - b[0]) <= _CLOSE_TOL_MM and abs(a[1] - b[1]) <= _CLOSE_TOL_MM:
            return pts[:-1], True
    return pts, closed_flag
