# frozen_string_literal: true

module AutocadImporter
  # Loads .skp files from a library folder and exposes a footprint-based
  # lookup: given a marker's W × D, find the closest matching component
  # definition. Used to promote hand-drawn 2D furniture outlines (on
  # MOBILIARI / MUEBLE layers) into real 3D instances.
  #
  # The folder is a flat-ish tree of .skp files, each containing one or
  # more ComponentDefinitions. We walk every loaded .skp, extract every
  # user-defined definition's name + natural bbox, and index them.
  #
  # Cached per session (the first import is slow; subsequent ones reuse
  # the in-memory index).
  class LibraryIndex
    MM_TO_INCH = 1.0 / 25.4

    attr_reader :components

    # Bundled .skp library shipped inside the .rbz — single source of truth.
    # No user-facing config: the extension is one-button, library is fixed.
    def self.bundled_path
      File.join(__dir__, "assets", "library")
    end

    def self.configured_path
      Dir.exist?(bundled_path) ? bundled_path : nil
    end

    def initialize(model:, path:)
      @model      = model
      @path       = path
      @components = []   # {name, definition, w_mm, d_mm, h_mm, origin_mm}
    end

    # Filename naming convention:
    #   <descriptive>_<W>x<D>x<H>mm.skp    e.g. oficina_500x550x900mm.skp
    #   <W>x<D>x<H>mm.skp                   e.g. 500x500x750mm.skp
    #   <W>x<D>x<H>.skp                     e.g. 500x500x750.skp
    # Subfolder name = family hint (Sillas/, Mesas/, Peanas/, Butaquetas/...).
    # Matching prefers filename-encoded dims over loading the .skp (fast
    # index: we don't open files we don't need).
    FILENAME_DIM_RE = /(\d{2,5})\s*x\s*(\d{2,5})\s*x\s*(\d{2,5})\s*(?:mm)?\b/i

    def build
      return @components unless Dir.exist?(@path)

      files = Dir.glob(File.join(@path, "**/*.skp"))
      puts "[AutocadImporter] indexing library: #{files.size} .skp files in #{@path}"

      files.each do |skp|
        stem = File.basename(skp, ".skp")
        family = File.basename(File.dirname(skp))
        m = stem.match(FILENAME_DIM_RE)
        if m
          # Fast path: dimensions in filename → no need to load the .skp now.
          @components << {
            name: stem,
            family: family,
            skp_path: skp,
            w_mm: m[1].to_f,
            d_mm: m[2].to_f,
            h_mm: m[3].to_f,
            origin_mm: [0.0, 0.0, 0.0],
            loaded: false,
          }
        else
          # Slow path: load now to get bounds.
          begin
            root = @model.definitions.load(skp)
            walk(root, family)
          rescue StandardError => e
            puts "[AutocadImporter] skip #{File.basename(skp)}: #{e.message}"
          end
        end
      end

      # Deduplicate by name — same component may appear across .skp files.
      seen = {}
      @components.each { |c| seen[c[:name].to_s.downcase] = c }
      @components = seen.values
      puts "[AutocadImporter] library index: #{@components.size} unique components " \
           "(fast-indexed by filename where possible)."
      @components
    end

    # Ensure the .skp is loaded and the ComponentDefinition is attached to
    # this component record. Called just-in-time from match_by_footprint.
    # Returns nil if the .skp is empty / unmodeled (template stub).
    def ensure_loaded(component)
      return component if component[:loaded] && component[:definition]
      path = component[:skp_path]
      return nil unless path && File.exist?(path)
      begin
        root = @model.definitions.load(path)
      rescue StandardError => e
        puts "[AutocadImporter] skip #{File.basename(path)}: #{e.message}"
        return nil
      end
      if root.nil? || root.entities.size == 0
        @model.definitions.remove(root) if root rescue nil
        return nil
      end
      component[:definition] = root
      bb = root.bounds
      component[:origin_mm] = [bb.min.x * 25.4, bb.min.y * 25.4, bb.min.z * 25.4]
      component[:loaded] = true
      component
    end

    # Returns best-matching component hash or nil. `family_hint` (optional)
    # boosts matches within the same subfolder — e.g., a MOBILIARI marker
    # prefers `Butaquetas/*.skp` over `Mesas/*.skp` at equal footprint err.
    # tol_mm is advisory — used only to tag matches as "tight" vs
    # "loose" in the logs. We always return the closest component when
    # the library is non-empty, so markers always get a 3D substitute
    # instead of a gray fallback box.
    # tol_mm: anything beyond this (in either dim) marks the match as "loose"
    # → skipped by place_from_library. Tightened to 100mm so a half-modeled
    # library doesn't smear one .skp across every marker with rough size.
    def match_by_footprint(w_mm, d_mm, tol_mm: 100.0, family_hint: nil)
      best = nil
      hint_tokens = family_hint.to_s.downcase.scan(/[a-záéíóúñ]{4,}/)
      @components.each do |c|
        cw = c[:w_mm]; cd = c[:d_mm]
        next if cw < 50 || cd < 50
        [[cw, cd], [cd, cw]].each do |pw, pd|
          err = (w_mm - pw).abs + (d_mm - pd).abs
          effective = err
          fam = c[:family].to_s.downcase
          if !fam.empty? && hint_tokens.any? { |t| fam.include?(t) || t.include?(fam[0, 4]) }
            effective -= 30
          end
          if best.nil? || effective < best[:effective]
            best = c.merge(err: err, effective: effective, flip: pw == cd,
                           loose: err > tol_mm * 2)
          end
        end
      end
      best
    end

    private

    def walk(definition, family = nil, depth = 0)
      return if depth > 4  # cap recursion on deeply nested libraries

      bb = definition.bounds
      w_in = (bb.max.x - bb.min.x).to_f
      d_in = (bb.max.y - bb.min.y).to_f
      h_in = (bb.max.z - bb.min.z).to_f
      w_mm = w_in * 25.4
      d_mm = d_in * 25.4
      h_mm = h_in * 25.4

      if w_mm > 50 && d_mm > 50 && h_mm > 50
        @components << {
          name: definition.name,
          family: family,
          definition: definition,
          skp_path: nil,
          w_mm: w_mm,
          d_mm: d_mm,
          h_mm: h_mm,
          origin_mm: [bb.min.x * 25.4, bb.min.y * 25.4, bb.min.z * 25.4],
          loaded: true,
        }
      end

      definition.entities.grep(Sketchup::ComponentInstance).each do |inst|
        next if inst.definition == definition
        walk(inst.definition, family, depth + 1)
      end
    end
  end
end
