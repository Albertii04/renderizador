# Renderizador — AutoCAD → SketchUp Importer (SketchUp Extension)

SketchUp extension for an architecture / interior-design studio. Imports an
AutoCAD DXF into SketchUp and auto-generates a 3D scene (walls extruded, floor
faces, furniture/fixture blocks placed as components) ready to push to D5
Render. Eliminates the manual "rebuild the AutoCAD drawing in SketchUp" step
that currently precedes every render.

## Architecture

Hybrid: Ruby extension for the SketchUp UI + geometry build, local Python
process for DXF parsing (via `ezdxf`). JSON over stdio.

- `ruby_extension/` — SketchUp extension (loader + `autocad_importer/`)
- `python_parser/` — DXF parser + `layer_rules.yaml` (the studio's layer
  convention — data, not code)
- `docs/intermediate_schema.md` — stable JSON contract between the two sides
- `docs/development.md` — dev-mode iteration loop

100 % local. No cloud, no API keys at runtime. Distributed as a single `.rbz`
with a PyInstaller-bundled parser binary inside.

## Workspace status vs. Node monorepo

This directory is **not** a pnpm workspace. Root `pnpm-workspace.yaml` globs
only `apps/*` and `packages/*`, so `pnpm install`, `turbo run`, and the root
`lint` / `typecheck` / `test` tasks all ignore it. Ruby/Python toolchain lives
entirely under this subtree (Bundler + venv).

## Dev quick-start

```bash
# Python parser (no SketchUp needed)
cd python_parser
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python make_sample_dxf.py
python parse_dxf.py sample.dxf | python -m json.tool

# Ruby tooling (tests / rubocop / packaging)
bundle install
bundle exec rake package   # → dist/autocad-importer-<ver>.rbz
```

Full dev loop (symlinking into SketchUp, `AUTOCAD_IMPORTER_DEV=1`, reload in
Ruby Console): see `docs/development.md`.

## Layout

```
extensions/sketchup-renderizador/
  CLAUDE.md             ← architecture summary for future sessions
  README.md             ← you are here
  PREVIOUS_README.md    ← original standalone-project README, kept for reference
  docs/
    intermediate_schema.md
    development.md
  python_parser/
    parse_dxf.py
    layer_rules.yaml
    requirements.txt
    build.sh            ← PyInstaller → dist/parse_dxf
    make_sample_dxf.py
    parser/             ← dxf_reader / classifier / emitter / openings
  ruby_extension/
    autocad_importer.rb       ← SketchUp loader
    autocad_importer/
      main.rb                 ← menu + toolbar
      importer.rb             ← orchestrator (single undo op)
      parser_bridge.rb        ← spawns Python, reads JSON
      block_harvester.rb      ← imports DXF blocks once, caches definitions
      geometry_builder.rb     ← builds walls / floors / places components
      ui/import_dialog.rb     ← HtmlDialog (wall height + options)
      bin/                    ← PyInstaller output ships here (gitignored)
  Gemfile               ← rake / rubocop / minitest (dev-only)
  Rakefile              ← `rake package` → dist/autocad-importer-<ver>.rbz
  .rubocop.yml          ← TargetRubyVersion 2.7 (SketchUp-embedded Ruby)
```
