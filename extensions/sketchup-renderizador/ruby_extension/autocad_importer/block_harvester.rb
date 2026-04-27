# frozen_string_literal: true

require "set"

module AutocadImporter
  # Handles the "import DXF once to get component definitions" dance.
  #
  # SketchUp has no API to read a DXF directly into ComponentDefinitions.
  # The workaround: use Sketchup.active_model.import to pull the DXF into a
  # throwaway group, then delete the group. The ComponentDefinitions stay
  # in model.definitions and can be instantiated by name.
  #
  # We only do this on the first import of a given file (tracked via a
  # model attribute), so re-running the importer is cheap.
  class BlockHarvester
    ATTR_DICT = "AutocadImporter"
    ATTR_KEY  = "harvested_files"

    def initialize(model:, dxf_path:)
      @model    = model
      @dxf_path = dxf_path
    end

    # Imports the DXF once into the model (inside a throwaway group which
    # we then erase). Component definitions survive the erase and become
    # available by name in model.definitions.
    #
    # Returns true if we actually imported, false if we skipped (already done).
    def harvest
      return false if already_harvested?

      # Count definitions before/after so we know which ones came from this import.
      pre_count = @model.definitions.count

      # Snapshot existing top-level entities so we can erase anything the
      # native importer adds. The importer often produces multiple top-level
      # items (one group plus extra edges/groups), not a single one.
      pre_entities = Set.new(@model.entities.to_a.map(&:entityID))

      # Force mm interpretation so the harvested geometry lands at the same
      # world coordinates the Python parser emits (mm throughout the JSON
      # contract). Leaving this on "model" lets SketchUp guess from the
      # DXF $INSUNITS header, which is often unset — resulting in a 1000×
      # scale mismatch against the walls / blocks we build from JSON.
      options = {
        "units"                     => "millimeters",
        "merge_coplanar_faces"      => false,
        "preserve_drawing_origin"   => true,
        "orient_faces"              => false,
        "show_summary"              => false,
      }

      success = @model.import(@dxf_path, options)
      unless success
        raise "SketchUp's native DXF importer rejected the file. " \
              "Check that the file is valid DXF (not DWG) and opens in AutoCAD."
      end

      # Erase every top-level entity the importer added. Component
      # definitions live in model.definitions and survive this erase, so
      # GeometryBuilder can still place instances by name.
      new_entities = @model.entities.reject { |e| pre_entities.include?(e.entityID) }
      @model.entities.erase_entities(new_entities) unless new_entities.empty?

      mark_harvested(
        pre_count: pre_count,
        post_count: @model.definitions.count,
        erased: new_entities.size,
      )
      true
    end

    private

    def already_harvested?
      dict = @model.attribute_dictionary(ATTR_DICT, false)
      return false unless dict
      list = dict[ATTR_KEY]
      return false unless list.is_a?(Array)
      list.include?(@dxf_path)
    end

    def mark_harvested(pre_count:, post_count:, erased:)
      dict = @model.attribute_dictionary(ATTR_DICT, true)
      list = dict[ATTR_KEY]
      list = [] unless list.is_a?(Array)
      list << @dxf_path
      dict[ATTR_KEY] = list
      puts "[AutocadImporter] Harvested #{post_count - pre_count} component " \
           "definitions from #{File.basename(@dxf_path)} " \
           "(erased #{erased} top-level entities the importer left behind)."
    end
  end
end
