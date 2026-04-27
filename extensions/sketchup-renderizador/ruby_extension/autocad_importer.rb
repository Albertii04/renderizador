# frozen_string_literal: true
#
# SketchUp extension loader. SketchUp looks for this file at the top level
# of the .rbz and registers the extension with SketchUp's Extension Manager.
#
# All real code lives under autocad_importer/.

require "sketchup.rb"
require "extensions.rb"

module AutocadImporter
  PLUGIN_ID   = "autocad_importer"
  PLUGIN_NAME = "Concep Importer"
  VERSION     = "0.1.0"

  unless defined?(@extension_loaded)
    ext = SketchupExtension.new(PLUGIN_NAME, File.join(__dir__, PLUGIN_ID, "main"))
    ext.description = "Imports AutoCAD DXF files and builds a 3D interior model " \
                      "ready for D5 Render."
    ext.version     = VERSION
    ext.creator     = "Studio internal tool"
    ext.copyright   = "© #{Time.now.year}"
    icon_base = File.join(__dir__, PLUGIN_ID, "assets", "icons", "logo")
    if File.exist?("#{icon_base}_64.png")
      ext.instance_variable_set(:@icon, "#{icon_base}_64.png") rescue nil
    end
    Sketchup.register_extension(ext, true)
    @extension_loaded = true
  end
end
