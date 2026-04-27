"""
Classifier: applies layer_rules.yaml to raw entities, producing a tagged stream.

Keeps the rule-matching logic in one place so the emitter can stay dumb.
"""
from __future__ import annotations

import fnmatch
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from .dxf_reader import Entity


def _library_index() -> set[str]:
    """Return lowercase set of block names known to be 3D in the shared library.

    Library index is built by `build_library.py` and shipped alongside the
    parser binary. If absent, returns empty set — behavior unchanged.
    """
    candidates = []
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).resolve().parent / "library_index.json")
    candidates.append(Path(__file__).resolve().parents[1] / "library_index.json")
    candidates.append(Path(os.getcwd()) / "library_index.json")
    for p in candidates:
        if p.is_file():
            try:
                data = json.loads(p.read_text())
                return {n.lower() for n in data.keys()}
            except Exception:
                continue
    return set()


_LIBRARY_NAMES_LOWER = _library_index()


@dataclass
class Rules:
    defaults: dict[str, Any]
    rules: list[dict[str, Any]]


def load_rules(path: Path) -> Rules:
    # Default text encoding on Windows is cp1252, which crashes on any non-ASCII
    # byte in layer_rules.yaml (Catalan/Spanish layer names). Force UTF-8.
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if "rules" not in data or not isinstance(data["rules"], list):
        raise ValueError("layer_rules.yaml: missing or malformed 'rules' list")
    return Rules(defaults=data.get("defaults", {}), rules=data["rules"])


@dataclass
class Classified:
    entity: Entity
    type: str              # "wall" | "opening" | "floor" | "block" | "ignore"
    kind: str | None       # subtype: "interior", "door", "furniture", ...


def _match_rule(layer: str, rules: Rules) -> dict[str, Any] | None:
    # Case-insensitive by default — studio layer names come from multiple
    # projects with inconsistent casing (MURO vs Muro vs muro, PARETS vs
    # Parets, etc.). Patterns in layer_rules.yaml are kept readable without
    # needing a variant per casing.
    layer_low = layer.lower()
    for rule in rules.rules:
        if fnmatch.fnmatchcase(layer_low, rule["pattern"].lower()):
            return rule
    return None


def classify_entities(
    entities: list[Entity],
    rules: Rules,
) -> tuple[list[Classified], list[str]]:
    """Return (classified_entities, warnings)."""
    out: list[Classified] = []
    warnings: list[str] = []
    unmatched_layers: set[str] = set()

    for ent in entities:
        rule = _match_rule(ent.layer, rules)

        # Anonymous dynamic-block wrappers (`*U###`, `*D###`) — never emit as
        # INSERT or marker. Their bbox is unreliable (may be dimension callout,
        # construction guide, or unrelated geometry). Nested children are
        # already extracted by `_expand_nested_inserts` in dxf_reader. Skip.
        if (
            ent.kind == "insert"
            and ent.block_name
            and ent.block_name.startswith("*")
        ):
            continue

        # Override: any INSERT whose block definition carries 3D geometry
        # (3DSOLID / MESH / 3DFACE) is furniture, full stop. Studio sometimes
        # leaves 3D muebles on layer '0' or other catch-all layers where the
        # normal rule would drop them.
        if ent.kind == "insert" and ent.block_has_3d:
            out.append(Classified(entity=ent, type="block", kind="furniture"))
            continue

        # Override: any INSERT with substantial block geometry (bbox >300mm
        # in either dimension) is furniture, regardless of layer. Studio
        # parks complex muebles on SOMBREADOS/Linea Capa/0 catch-all layers
        # — they still need placement. Skip openings (doors/windows) so we
        # don't double-classify a door block as furniture.
        if ent.kind == "insert" and ent.block_bbox_mm:
            sx = abs(ent.scale[0]) if ent.scale else 1.0
            sy = abs(ent.scale[1]) if ent.scale else 1.0
            eff_w = abs(ent.block_bbox_mm[0]) * sx
            eff_h = abs(ent.block_bbox_mm[1]) * sy
            if eff_w > 300 or eff_h > 300:
                # Respect explicit door/window layer rules.
                if rule is None or rule.get("type") not in ("opening",):
                    out.append(Classified(entity=ent, type="block", kind="furniture"))
                    continue

        # Library override: INSERT whose block name is known-3D from the
        # accumulated shared library gets promoted to furniture even when
        # its current DWG only carries the 2D planta symbol. The Ruby side
        # harvests biblioteca.dwg so the name resolves to a real 3D
        # ComponentDefinition at placement time.
        if (
            ent.kind == "insert"
            and ent.block_name
            and ent.block_name.lower() in _LIBRARY_NAMES_LOWER
        ):
            out.append(Classified(entity=ent, type="block", kind="furniture"))
            continue

        if rule is None:
            unmatched_layers.add(ent.layer)
            continue

        rtype = rule["type"]
        if rtype == "ignore":
            if rule.get("warn"):
                unmatched_layers.add(ent.layer)
            continue

        out.append(Classified(entity=ent, type=rtype, kind=rule.get("kind")))

    for layer in sorted(unmatched_layers):
        warnings.append(
            f"Layer '{layer}' did not match any rule — entities on it were skipped."
        )

    return out, warnings
