"""Build a central 3D furniture library from a folder of real DWGs/DXFs.

Strategy: copy each source DWG that contains 3D blocks into a flat output
folder, preserving the original bytes (SketchUp's native importer is picky
about ezdxf-regenerated DWG/DXF streams — specifically 3DSOLID payloads
round-tripped through ezdxf get rejected). The accompanying
`library_index.json` still records which block names live in the library.
Ruby harvests every DWG in the folder on first import.

For every DWG/DXF in the input folder, scans block definitions. Any block
whose definition (or any nested descendant) carries 3DSOLID / MESH / BODY /
SURFACE / 3DFACE / POLYFACE is considered a real 3D mueble. Those blocks
are copied into a single output DWG (`biblioteca.dwg`) and their names are
indexed to `library_index.json`.

On the next DWG import, the parser sees this index and classifies any
INSERT whose block_name is in the index as `furniture` — even if the
INSERT sits on a layer that would otherwise be ignored. The Ruby side
auto-harvests `biblioteca.dwg` once per SketchUp session so those block
names resolve to real 3D ComponentDefinitions.

Usage:
  python build_library.py <input_folder> [--out biblioteca.dwg]

Example:
  python build_library.py ../Training
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import ezdxf
from ezdxf.addons import odafc

from parser.dxf_reader import _ensure_oda_discovered, _3D_TYPES


def _blocks_with_3d_local(doc) -> set[str]:
    """Local copy of dxf_reader._blocks_with_3d to avoid cycle import."""
    direct: dict[str, bool] = {}
    refs: dict[str, set[str]] = {}
    for blk in doc.blocks:
        n = blk.name
        if n.startswith("*Model_Space") or n.startswith("*Paper_Space"):
            continue
        has_3d = False
        children: set[str] = set()
        for e in blk:
            t = e.dxftype()
            if t in _3D_TYPES:
                has_3d = True
            elif t == "INSERT":
                children.add(e.dxf.name)
        direct[n] = has_3d
        refs[n] = children
    out = {n for n, v in direct.items() if v}
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


def _block_bbox(doc, name, seen=None):
    seen = seen or set()
    if name in seen or name not in doc.blocks:
        return None
    seen.add(name)
    blk = doc.blocks[name]
    xs, ys, zs = [], [], []
    for e in blk:
        t = e.dxftype()
        try:
            if t == "LINE":
                xs += [e.dxf.start.x, e.dxf.end.x]
                ys += [e.dxf.start.y, e.dxf.end.y]
                zs += [e.dxf.start.z, e.dxf.end.z]
            elif t == "LWPOLYLINE":
                for p in e.get_points():
                    xs.append(p[0]); ys.append(p[1]); zs.append(0.0)
            elif t == "POLYLINE":
                for v in e.vertices:
                    p = v.dxf.location
                    xs.append(p.x); ys.append(p.y); zs.append(p.z)
            elif t == "INSERT":
                sub = _block_bbox(doc, e.dxf.name, seen)
                if sub:
                    sx = e.dxf.xscale; sy = e.dxf.yscale
                    ix = e.dxf.insert.x; iy = e.dxf.insert.y
                    xs += [ix + sub[0] * sx, ix + sub[3] * sx]
                    ys += [iy + sub[1] * sy, iy + sub[4] * sy]
        except Exception:
            pass
    if not xs:
        return None
    return (min(xs), min(ys), 0.0, max(xs), max(ys), 0.0)


def load_any(path: Path):
    _ensure_oda_discovered(ezdxf, odafc)
    if path.suffix.lower() == ".dwg":
        return odafc.readfile(str(path))
    return ezdxf.readfile(str(path))


def save_library(doc, out_path: Path):
    """Prefer DXF (SketchUp ingests natively). DWG via ODA is flaky across
    SketchUp versions — keep it off the critical path."""
    if out_path.suffix.lower() == ".dxf":
        if out_path.exists():
            out_path.unlink()
        doc.saveas(str(out_path))
    else:
        try:
            if out_path.exists():
                out_path.unlink()
            odafc.export_dwg(doc, str(out_path), version="R2018")
        except Exception as exc:
            fallback = out_path.with_suffix(".dxf")
            print(f"[build_library] DWG export failed ({exc}) — writing DXF: {fallback}")
            if fallback.exists():
                fallback.unlink()
            doc.saveas(str(fallback))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input_folder", type=Path, help="folder of training DWG/DXFs")
    ap.add_argument("--out_dir", type=Path, default=Path("library"),
                    help="output folder (copies of source DWGs that carry 3D blocks)")
    ap.add_argument("--index", type=Path, default=Path("library_index.json"),
                    help="output JSON index of block names → source file")
    ap.add_argument("--max-source-mb", type=float, default=5.0,
                    help="skip source DWGs above this size cap. Large whole-"
                         "project DWGs (10+ MB) typically contribute few "
                         "blocks relative to their weight — keep them out of "
                         "the shipped library unless you raise this.")
    args = ap.parse_args()

    if not args.input_folder.is_dir():
        print(f"error: not a folder: {args.input_folder}", file=sys.stderr)
        return 2

    out_dir = args.out_dir
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    index: dict[str, dict] = {}
    projects_scanned = 0
    sources_copied: set[str] = set()

    max_bytes = int(args.max_source_mb * 1024 * 1024)
    for src in sorted(args.input_folder.rglob("*")):
        if src.suffix.lower() not in (".dwg", ".dxf"):
            continue
        if src.stat().st_size > max_bytes:
            print(f"[build_library] skip (> {args.max_source_mb} MB): {src.name}")
            continue
        try:
            doc = load_any(src)
        except Exception as exc:
            print(f"[build_library] skip {src.name}: {exc}")
            continue
        projects_scanned += 1

        blocks_3d = _blocks_with_3d_local(doc)
        if not blocks_3d:
            continue

        # Copy the source file verbatim (SketchUp digests original DWG bytes).
        dest = out_dir / src.name
        # Disambiguate if two sources share filename.
        counter = 1
        while dest.exists():
            dest = out_dir / f"{src.stem}__{counter}{src.suffix}"
            counter += 1
        shutil.copy2(src, dest)
        sources_copied.add(dest.name)

        for name in blocks_3d:
            if name in index:
                continue  # first-wins; later project variants are ignored
            bb = _block_bbox(doc, name)
            w = (bb[3] - bb[0]) if bb else 0
            d = (bb[4] - bb[1]) if bb else 0
            index[name] = {
                "W_mm": round(w, 1),
                "D_mm": round(d, 1),
                "source": dest.name,
            }

    args.index.write_text(json.dumps(index, indent=2, ensure_ascii=False))
    total_bytes = sum(f.stat().st_size for f in out_dir.iterdir())
    print(
        f"[build_library] scanned {projects_scanned} projects, "
        f"{len(sources_copied)} DWGs with 3D copied to {out_dir} "
        f"({total_bytes / 1e6:.1f} MB), "
        f"indexed {len(index)} unique blocks → {args.index}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
