# Build a single-file Windows binary of the DXF parser.
#
# Outputs:
#   dist\parse_dxf.exe
#
# Prereqs: Python 3.x with pip on PATH (or `py` launcher).

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$py = if (Get-Command py -ErrorAction SilentlyContinue) { "py" }
      elseif (Get-Command python -ErrorAction SilentlyContinue) { "python" }
      else { throw "No Python interpreter found. Install Python 3.x and ensure 'py' or 'python' is on PATH." }

& $py -m pip install --upgrade pip
& $py -m pip install -r requirements.txt pyinstaller

& $py -m PyInstaller `
    --onefile `
    --name parse_dxf `
    --collect-data ezdxf `
    --hidden-import=ezdxf.addons.odafc `
    --add-data "layer_rules.yaml;." `
    parse_dxf.py

Write-Host ""
Write-Host "Built: dist\parse_dxf.exe"
Write-Host "Copy this binary into ruby_extension\autocad_importer\bin\ before packaging the .rbz."
