# frozen_string_literal: true

require "json"
require "open3"

module AutocadImporter
  # Spawns the Python parser and collects its JSON output.
  #
  # In production, we call the PyInstaller-built binary shipped alongside the
  # extension under ./bin/. In development, set the env var
  # AUTOCAD_IMPORTER_DEV=1 to run the .py source directly via python3.
  class ParserBridge
    class ParserError < StandardError; end
    class DWGConversionError < ParserError; end

    # Exit codes from parse_dxf.py (see its module docstring).
    EXIT_DWG_NEEDS_ODA = 5

    def parse(dxf_path)
      cmd = build_command(dxf_path)
      stdout, stderr, status = Open3.capture3(*cmd)

      unless status.success?
        msg = stderr.strip
        raise DWGConversionError, msg if status.exitstatus == EXIT_DWG_NEEDS_ODA
        raise ParserError, "Parser exited #{status.exitstatus}: #{msg}"
      end

      JSON.parse(stdout)
    rescue JSON::ParserError => e
      raise ParserError, "Parser output was not valid JSON: #{e.message}"
    end

    private

    def build_command(dxf_path)
      if ENV["AUTOCAD_IMPORTER_DEV"] == "1"
        py_script = File.expand_path("../../python_parser/parse_dxf.py", __dir__)
        return [python_executable, py_script, dxf_path]
      end

      ext = Sketchup.platform == :platform_win ? ".exe" : ""
      bin = File.join(__dir__, "bin", "parse_dxf#{ext}")
      return [bin, dxf_path] if File.exist?(bin)

      # Fallback: run bundled Python source if user has Python + deps
      # installed. Saves Windows users from needing to compile a binary.
      py_script = File.join(__dir__, "python_parser", "parse_dxf.py")
      if File.exist?(py_script)
        return [python_executable, py_script, dxf_path]
      end

      raise ParserError,
            "No parser available. Expected binary at #{bin} or Python source at #{py_script}. " \
            "On Windows install Python + run: pip install ezdxf pyyaml shapely"
    end

    def python_executable
      # Try python3 then python — Windows usually has `python`, mac/linux `python3`.
      if Sketchup.platform == :platform_win
        "python"
      else
        "python3"
      end
    end
  end
end
