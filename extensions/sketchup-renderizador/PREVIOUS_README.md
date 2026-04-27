# AutoCAD to SketchUp Importer

A SketchUp extension that imports AutoCAD DXF/DWG files and auto-generates a 3D model of an interior space (walls + pre-modeled furniture/fixtures) ready to push to D5 Render.

## Architecture

Hybrid design — Ruby extension for the SketchUp UI, local Python service for heavy parsing.

```
┌─────────────────────────────────────────────────────────────┐
│  SketchUp (Ruby Extension)                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  UI: File picker, wall-height dialog, progress bar   │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │ JSON over stdio / local HTTP            │
│  ┌────────────────▼─────────────────────────────────────┐   │
│  │  Python Parser (bundled binary via PyInstaller)      │   │
│  │  - ezdxf: parse DXF                                  │   │
│  │  - interpret layer names → walls, fixtures, etc.     │   │
│  │  - output intermediate JSON (geometry + block refs)  │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │ intermediate JSON                       │
│  ┌────────────────▼─────────────────────────────────────┐   │
│  │  Ruby geometry builder: creates SketchUp faces,      │   │
│  │  extrudes walls to user-specified heights, places    │   │
│  │  furniture blocks as components.                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Why this split:**
- Ruby's DWG/DXF parsing story is weak; Python's `ezdxf` is mature and maintained.
- SketchUp's Ruby API is the only sane way to build SketchUp geometry natively.
- Everything runs locally — no cloud calls, no tokens, no external dependencies at runtime.
- Distributed as a single `.rbz` with the Python binary bundled inside.

## Layer naming convention (assumed, configurable)

Since the studio already standardizes their AutoCAD layers, we interpret them like this:

| Layer pattern     | Treated as                                     |
|-------------------|------------------------------------------------|
| `WALL_*`          | Wall — 2D polyline extruded to wall height     |
| `WALL_EXT_*`      | Exterior wall (different default height)       |
| `FURN_*`          | Furniture — expects a 3D block reference       |
| `FIX_*`           | Fixture (lighting, sanitary) — 3D block ref    |
| `DOOR_*`          | Door opening — cut into wall                   |
| `WIN_*`           | Window opening — cut into wall                 |
| `FLOOR_*`         | Floor boundary — creates floor face            |
| `_IGNORE`         | Skipped entirely                               |

The mapping lives in `python_parser/layer_rules.yaml` so the studio can tune it without touching code.

## Project layout

```
ruby_extension/
  autocad_importer.rb          ← SketchUp loader stub
  autocad_importer/
    main.rb                    ← menu + toolbar registration
    importer.rb                ← orchestrates parser call + model build
    parser_bridge.rb           ← spawns Python binary, reads JSON
    geometry_builder.rb        ← builds walls/floors/components in SU
    ui/
      import_dialog.rb         ← HtmlDialog for import options
python_parser/
  parse_dxf.py                 ← CLI entry point
  layer_rules.yaml             ← layer-name → element-type mapping
  parser/
    __init__.py
    dxf_reader.py              ← ezdxf wrapper
    classifier.py              ← layer rules → element types
    emitter.py                 ← writes intermediate JSON schema
  requirements.txt
  build.sh                     ← PyInstaller packaging
docs/
  intermediate_schema.md       ← JSON contract between Python and Ruby
  development.md               ← how to run + debug without building
```

## Development loop

1. Run `python_parser/parse_dxf.py sample.dxf > out.json` directly to iterate on parsing.
2. Point the Ruby extension to `python3 parse_dxf.py` (dev mode) instead of the bundled binary.
3. Once parsing is stable, run `build.sh` to produce a single-file binary.
4. Package everything as `.rbz` (just a renamed `.zip` of `ruby_extension/`).

## Status

Skeleton only. Next steps:
1. Get a sample DXF from the studio.
2. Fill in `dxf_reader.py` using the real layer names.
3. Build minimal Ruby side that creates one wall from hardcoded coordinates to prove the SketchUp API path works.
4. Wire them together.
