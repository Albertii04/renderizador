# frozen_string_literal: true

require "json"
require_relative "importer"
require_relative "parser_bridge"
require_relative "geometry_builder"
require_relative "block_harvester"
require_relative "library_index"
require_relative "ui/import_dialog"

module AutocadImporter
  module Main
    MENU_TITLE = "Importar AutoCAD…"

    # Single-purpose extension: import a DXF/DWG and build the 3D interior.
    # Library lives bundled inside the .rbz; no config or generation UI.
    def self.register
      return if @registered

      menu = ::UI.menu("Plugins")
      menu.add_item(MENU_TITLE) { run_import }

      toolbar = ::UI::Toolbar.new("AutoCAD Importer")
      cmd = ::UI::Command.new(MENU_TITLE) { run_import }
      cmd.tooltip = "Importar AutoCAD DXF/DWG y generar interior 3D"
      cmd.status_bar_text = "Construye paredes, suelos y mobiliario desde un DXF/DWG"
      icon_dir = File.join(__dir__, "assets", "icons")
      small = File.join(icon_dir, "logo_24.png")
      large = File.join(icon_dir, "logo_32.png")
      if File.exist?(small) && File.exist?(large)
        cmd.small_icon = small
        cmd.large_icon = large
      end
      toolbar.add_item(cmd)
      toolbar.restore

      @registered = true
      puts "[AutocadImporter] menu + toolbar registered (v#{AutocadImporter::VERSION})"
    rescue StandardError => e
      puts "[AutocadImporter] registration failed: #{e.class}: #{e.message}"
      puts e.backtrace.first(5).join("\n")
      raise
    end

    def self.run_import
      dxf_path = ::UI.openpanel(
        "Elige un archivo DXF o DWG", nil,
        "AutoCAD Files|*.dxf;*.DXF;*.dwg;*.DWG||"
      )
      return unless dxf_path

      AutocadImporter::UI::ImportDialog.show(dxf_path: dxf_path) do |options|
        Importer.new(dxf_path: dxf_path, options: options).run
      end
    end
  end
end

AutocadImporter::Main.register
