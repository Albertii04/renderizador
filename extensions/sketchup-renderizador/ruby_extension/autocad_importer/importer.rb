# frozen_string_literal: true

require "json"
require "set"
require_relative "block_harvester"

module AutocadImporter
  # Orchestrates the full import:
  #   1. Runs the Python parser on the DXF (structured data extraction).
  #   2. Uses SketchUp's native DXF importer to harvest 3D block geometry
  #      as ComponentDefinitions (once per file).
  #   3. Hands off to GeometryBuilder to build walls/floors + place block instances.
  #
  # Everything happens inside a single model.start_operation block so the
  # user gets one undoable "Import DXF" action, and partial failures don't
  # leave the model in a weird half-built state.
  class Importer
    def initialize(dxf_path:, options:)
      @dxf_path = dxf_path
      @options  = options
    end

    VERSION_TAG = "r12 2026-04-23 no-fallbacks"

    def run
      model = Sketchup.active_model
      puts "[AutocadImporter #{VERSION_TAG}] start"
      model.start_operation("Import AutoCAD DXF", true)

      begin
        document = ParserBridge.new.parse(@dxf_path)
        show_warnings(document["warnings"]) if document["warnings"]&.any?

        BlockHarvester.new(model: model, dxf_path: @dxf_path).harvest
        harvest_library_on_demand(model, document)

        builder = GeometryBuilder.new(model: model, document: document, options: @options)
        builder.build

        model.commit_operation
        ::UI.messagebox(
          "Imported #{document['walls'].size} walls, " \
          "#{document['floors'].size} floors, " \
          "#{document['blocks'].size} furniture/fixture blocks."
        )
      rescue ParserBridge::DWGConversionError => e
        model.abort_operation
        choice = ::UI.messagebox(
          "DWG conversion needs ODA File Converter (free, one-time install).\n\n" \
          "#{e.message}\n\nOpen the download page now?",
          MB_YESNO
        )
        ::UI.openURL("https://www.opendesign.com/guestfiles/oda_file_converter") if choice == IDYES
      rescue => e
        model.abort_operation
        ::UI.messagebox("Import failed: #{e.message}")
        raise
      end
    end

    private

    # Bundled biblioteca.dwg ships inside the .rbz and accumulates every
    # 3D-bearing block extracted from the studio's past projects. We
    # harvest it once per model so any INSERT whose name matches a library
    # entry resolves to a real 3D ComponentDefinition.
    # On-demand library harvest. Loads only the library DWGs that actually
    # contain the block names referenced by THIS project, instead of paying
    # the 30–60 s upfront cost of harvesting every library file on every
    # import.
    #
    # Strategy:
    #   1. Compute set of block names already resolved after harvesting the
    #      user's own DWG (definitions we have in model.definitions).
    #   2. For every block the project needs (document["blocks"][n].block_name),
    #      if it's missing AND library_index.json maps it to a source DWG,
    #      queue that source for harvesting.
    #   3. Harvest each unique queued file once. Per-model cache in
    #      BlockHarvester already prevents double-harvest across re-imports.
    def harvest_library_on_demand(model, document)
      lib_dir = File.join(__dir__, "assets", "library")
      idx_path = File.join(__dir__, "assets", "library_index.json")
      return unless Dir.exist?(lib_dir) && File.exist?(idx_path)

      index = begin
        JSON.parse(File.read(idx_path))
      rescue StandardError
        {}
      end
      return if index.empty?

      existing = Set.new(model.definitions.map { |d| d.name.to_s.downcase })
      needed_sources = Set.new

      (document["blocks"] || []).each do |b|
        name = b["block_name"].to_s
        next if name.empty?
        next if existing.include?(name.downcase)
        entry = index[name] || index.find { |k, _| k.downcase == name.downcase }&.last
        next unless entry
        source = entry["source"] || entry[:source]
        needed_sources << source if source
      end

      return if needed_sources.empty?

      puts "[AutocadImporter] library on-demand: " \
           "#{needed_sources.size} DWG(s) needed for missing blocks"
      needed_sources.each do |fname|
        path = File.join(lib_dir, fname)
        next unless File.exist?(path)
        begin
          BlockHarvester.new(model: model, dxf_path: path).harvest
        rescue StandardError => e
          puts "[AutocadImporter] library skip #{fname} (#{e.message})"
        end
      end
    end

    def show_warnings(warnings)
      # Keep it short — dump full list to the Ruby console for the power user.
      puts "[AutocadImporter] Warnings:"
      warnings.each { |w| puts "  - #{w}" }
      if warnings.size <= 5
        ::UI.messagebox("Warnings:\n\n" + warnings.join("\n"))
      else
        ::UI.messagebox(
          "#{warnings.size} warnings during import. See Ruby Console for the full list."
        )
      end
    end
  end
end
