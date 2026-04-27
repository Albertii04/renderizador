# Development

## Fast iteration loop

**Don't rebuild the PyInstaller binary every change.** Use dev mode:

1. Set the env var `AUTOCAD_IMPORTER_DEV=1` before launching SketchUp. This makes `parser_bridge.rb` call your local `python3 parse_dxf.py` directly instead of the bundled binary.

   - **macOS**: `AUTOCAD_IMPORTER_DEV=1 open -a SketchUp`
   - **Windows**: `set AUTOCAD_IMPORTER_DEV=1 && start sketchup.exe`

2. Install Python deps in a venv:
   ```
   cd python_parser
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. Symlink `ruby_extension/autocad_importer.rb` and `ruby_extension/autocad_importer/` into SketchUp's Plugins folder:
   - **macOS**: `~/Library/Application Support/SketchUp <version>/SketchUp/Plugins/`
   - **Windows**: `%AppData%\SketchUp\SketchUp <version>\SketchUp\Plugins\`

4. In SketchUp, open **Window → Ruby Console** to see `puts` output.

5. Edit Ruby files → reload in SketchUp via `load 'autocad_importer/main.rb'` in the Ruby Console.

## Testing the parser standalone

```bash
cd python_parser
python3 parse_dxf.py path/to/sample.dxf | jq .
```

`jq` helps you eyeball the structure. Pipe into a file and commit a few golden outputs as regression fixtures.

## First end-to-end smoke test

Before touching a real studio file:

1. Make a trivial DXF in AutoCAD or LibreCAD with:
   - One closed polyline on a `WALL_INT` layer.
   - One closed polyline on a `FLOOR_MAIN` layer.
   - One block insert on a `FURN_CHAIR` layer.
2. Run `python3 parse_dxf.py trivial.dxf` — check walls, floors, blocks each have one entry.
3. In SketchUp, run the importer. You should see a group containing a floor face, an extruded wall rectangle, and either a placed component (if the block definition exists in the model) or a console warning (if it doesn't).

## Handling block geometry

The current `GeometryBuilder` expects component definitions to already exist in the SketchUp model. The planned flow for the studio:

1. **Once per project**, File → Import the DXF via SketchUp's native importer into a hidden/throwaway group. This pulls in all the 3D block geometry as component definitions.
2. Delete the imported group (definitions stay in `model.definitions`).
3. Run our importer — it places instances at the correct positions/rotations using those definitions.

We should probably automate step 1–2 inside `Importer#run` to spare the user a manual step. That's a good second-pass improvement once the basic flow works.

## Packaging for the studio

```bash
cd python_parser && ./build.sh
cp dist/parse_dxf ../ruby_extension/autocad_importer/bin/
cd ../ruby_extension
zip -r ../autocad_importer.rbz autocad_importer.rb autocad_importer/
```

Then in SketchUp: Window → Extension Manager → Install Extension → pick the `.rbz`.

## Known gaps (by design, for v0.1)

- Openings don't get cut into walls yet — emitted but ignored by the builder.
- Wall thickness is a single default; no double-line wall centerline inference.
- No handling of arcs or curves in wall paths (lines only).
- No layer-specific materials beyond interior/exterior gray.

These are fine for the first working version. Get a real DXF in, see what breaks, then prioritize.
