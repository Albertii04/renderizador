#!/usr/bin/env bash
# Build a single-file binary of the DXF parser for bundling with the SketchUp extension.
#
# Outputs:
#   dist/parse_dxf                (macOS / Linux)
#   dist/parse_dxf.exe            (Windows, when run under mingw/cmd)
#
# Prereqs: python3, pip, pyinstaller in the active venv.

set -euo pipefail
cd "$(dirname "$0")"

python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt pyinstaller

# --collect-data ezdxf makes sure ezdxf's font and resource files are bundled.
python3 -m PyInstaller \
    --onefile \
    --name parse_dxf \
    --collect-data ezdxf \
    --hidden-import=ezdxf.addons.odafc \
    --add-data "layer_rules.yaml:." \
    parse_dxf.py

echo
echo "Built: dist/parse_dxf"
echo "Copy this binary into ruby_extension/autocad_importer/bin/ before packaging the .rbz."
