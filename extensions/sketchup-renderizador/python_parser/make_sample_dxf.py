"""
Generate a minimal sample DXF for smoke-testing the parser.

Creates a small rectangular room with:
  - Interior walls on WALL_INT layer (open polyline)
  - A floor boundary on FLOOR_MAIN layer (closed polyline)
  - A door block insert on DOOR_SWING layer
  - A furniture block insert on FURN_SOFA layer

Run: python3 make_sample_dxf.py sample.dxf
Then: python3 parse_dxf.py sample.dxf | python3 -m json.tool
"""
from __future__ import annotations

import sys
from pathlib import Path

import ezdxf


def build(output: Path) -> None:
    doc = ezdxf.new(dxfversion="R2010", setup=True)
    doc.units = ezdxf.units.MM
    msp = doc.modelspace()

    for layer_name in ["WALL_INT", "FLOOR_MAIN", "DOOR_SWING", "FURN_SOFA", "FIX_LAMP"]:
        if layer_name not in doc.layers:
            doc.layers.add(name=layer_name)

    # Interior walls: 5m x 3m rectangle, open polyline so we see per-segment walls.
    msp.add_lwpolyline(
        [(0, 0), (5000, 0), (5000, 3000), (0, 3000), (0, 0)],
        dxfattribs={"layer": "WALL_INT"},
    )

    # Floor boundary: closed rectangle.
    msp.add_lwpolyline(
        [(0, 0), (5000, 0), (5000, 3000), (0, 3000)],
        close=True,
        dxfattribs={"layer": "FLOOR_MAIN"},
    )

    # Define and place a door block at the midpoint of the bottom wall.
    door_block = doc.blocks.new(name="DOOR_900")
    door_block.add_line((0, 0), (900, 0))
    door_block.add_arc(center=(0, 0), radius=900, start_angle=0, end_angle=90)
    msp.add_blockref("DOOR_900", (2500, 0), dxfattribs={"layer": "DOOR_SWING"})

    # Define and place a sofa block (2D footprint, good enough for smoke test).
    sofa_block = doc.blocks.new(name="SOFA_3SEAT_A")
    sofa_block.add_lwpolyline(
        [(-1000, -400), (1000, -400), (1000, 400), (-1000, 400)],
        close=True,
    )
    msp.add_blockref(
        "SOFA_3SEAT_A",
        (2500, 1200),
        dxfattribs={"layer": "FURN_SOFA", "rotation": 0},
    )

    # A ceiling fixture block.
    lamp_block = doc.blocks.new(name="LAMP_PENDANT")
    lamp_block.add_circle(center=(0, 0), radius=150)
    msp.add_blockref("LAMP_PENDANT", (2500, 1500), dxfattribs={"layer": "FIX_LAMP"})

    doc.saveas(str(output))
    print(f"Wrote {output}")


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "sample.dxf")
    build(out)
