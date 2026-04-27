#!/usr/bin/env python3
"""
AutoCAD DXF → intermediate JSON.

Called by the SketchUp Ruby extension. Reads a DXF file, classifies layers
per `layer_rules.yaml`, and emits the schema documented in
`docs/intermediate_schema.md` on stdout.

Usage:
    parse_dxf.py <path-to-dxf> [--rules path/to/layer_rules.yaml]

Exit codes:
    0 = success (JSON on stdout)
    2 = file not found / unreadable
    3 = DXF parse error
    4 = rules file invalid
    5 = DWG input but ODA File Converter not installed / failed
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from parser.dxf_reader import DWGConversionError, read_dxf
from parser.classifier import load_rules, classify_entities
from parser.emitter import build_document


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dxf_path", type=Path)
    ap.add_argument(
        "--rules",
        type=Path,
        default=Path(__file__).parent / "layer_rules.yaml",
    )
    args = ap.parse_args()

    if not args.dxf_path.exists():
        print(f"DXF not found: {args.dxf_path}", file=sys.stderr)
        return 2


    try:
        rules = load_rules(args.rules)
    except Exception as e:  # noqa: BLE001 — surface to Ruby as exit 4
        print(f"Rules invalid: {e}", file=sys.stderr)
        return 4

    try:
        entities = read_dxf(args.dxf_path)
    except DWGConversionError as e:
        print(str(e), file=sys.stderr)
        return 5
    except Exception as e:  # noqa: BLE001
        print(f"DXF parse error: {e}", file=sys.stderr)
        return 3

    classified, warnings = classify_entities(entities, rules)
    document = build_document(
        source_file=args.dxf_path.name,
        classified=classified,
        warnings=warnings,
        rules=rules,
    )

    json.dump(document, sys.stdout, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
