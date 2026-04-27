# Intermediate JSON schema

The contract between the Python parser and the Ruby geometry builder. Keep this stable — everything else depends on it.

## Units

All coordinates in **millimeters**, matching AutoCAD's typical architectural unit. Ruby side converts to inches on the SketchUp boundary.

## Top-level shape

```json
{
  "version": "1.0",
  "source_file": "project-xyz-floor2.dxf",
  "bounds": { "min": [0, 0], "max": [15000, 8000] },
  "walls": [ ... ],
  "floors": [ ... ],
  "openings": [ ... ],
  "blocks": [ ... ],
  "markers": [ ... ],
  "warnings": [ "Layer WALL_FOO had unclosed polyline, skipped" ]
}
```

`markers` are 2D polyline annotations — typically hand-drawn furniture
outlines the DWG author placed on block layers without a 3D block
definition. Ruby draws them as edges on the floor plane so the user can
see planned footprints.

```json
{
  "id": "marker_0001",
  "layer": "_Co MUEBLE CONCEP",
  "path": [[x1, y1], [x2, y2], ...],
  "closed": true,
  "kind": "furniture"
}
```

## Walls

A wall is a 2D polyline (start/end or polyline of segments) that will be extruded to a height.

```json
{
  "id": "wall_0001",
  "layer": "WALL_INT",
  "path": [[0, 0], [5000, 0], [5000, 3000]],
  "closed": false,
  "default_height_mm": 2700,
  "thickness_mm": 100,
  "kind": "interior"
}
```

- `kind`: `"interior"` | `"exterior"` — drives default height and material.
- `thickness_mm`: optional; if AutoCAD gives us a double-line wall we collapse it to a centerline + thickness. If not present, Ruby side uses a studio default.
- `closed`: `true` means the path is a closed loop — the last vertex connects back to the first. The path itself never duplicates the first vertex at the end; that normalization is done by the parser regardless of how the DXF author encoded it. Downstream code can iterate segments as `path[i] → path[i+1]` and, if `closed`, add a final `path[-1] → path[0]` segment.

## Floors

```json
{
  "id": "floor_0001",
  "layer": "FLOOR_MAIN",
  "boundary": [[0, 0], [5000, 0], [5000, 3000], [0, 3000]],
  "elevation_mm": 0
}
```

Closed polyline only. Ruby builds a horizontal face at `elevation_mm`.

## Openings

Doors and windows. These get cut into walls during the Ruby build step.

```json
{
  "id": "door_0001",
  "layer": "DOOR_SWING",
  "kind": "door",
  "wall_id": "wall_0001",
  "position_along_wall_mm": 1200,
  "width_mm": 900,
  "height_mm": 2100,
  "sill_mm": 0
}
```

For windows, `kind: "window"` and `sill_mm` > 0.

If we can't confidently attach the opening to a specific wall, emit it with `wall_id: null` and let the Ruby side do proximity matching (or warn the user).

## Blocks (furniture, fixtures, 3D models)

These reference 3D geometry that already lives in the DXF file as blocks. We pass through the insert point, rotation, scale, and the block name — the Ruby side imports or references the block as a SketchUp component.

```json
{
  "id": "block_0001",
  "layer": "FURN_SOFA",
  "block_name": "SOFA_3SEAT_A",
  "insert_point": [3200, 1500, 0],
  "rotation_deg": 90,
  "scale": [1.0, 1.0, 1.0],
  "kind": "furniture"
}
```

**Open question:** does SketchUp's native DXF importer pull in the block geometry correctly, and can we then reference those components by name? If yes, the Ruby side does a one-time silent DXF import to a hidden group, harvests the component definitions, and then places instances based on `insert_point` + `rotation_deg`. If no, we need a separate path to convert 3D solids to SketchUp geometry (harder).

Recommendation: test the native importer first with a sample file before building anything custom.

## Warnings

Non-fatal issues the parser wants to surface to the user. Strings, keep them short and actionable.

```json
"warnings": [
  "WALL_INT layer contained 2 open polylines — extruded as open wall segments, verify intent.",
  "Block 'CHAIR_X' referenced on layer FURN_CHAIR but block definition not found in file."
]
```
