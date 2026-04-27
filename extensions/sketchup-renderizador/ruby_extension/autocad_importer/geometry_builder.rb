# frozen_string_literal: true

require "json"

module AutocadImporter
  # Turns the intermediate JSON into SketchUp geometry.
  #
  # The design here is deliberately simple for the first pass:
  #   - Each wall = polyline extruded straight up.
  #   - Each floor = horizontal face at elevation_mm.
  #   - Each block = an instance of the component with the matching name
  #     (expects the component to already exist in the model, imported
  #     separately via SketchUp's native DXF importer in a previous step).
  #
  # Openings (doors/windows) are left as TODO — they need wall-matching logic
  # we haven't built yet.
  class GeometryBuilder
    MM_TO_INCH = 1.0 / 25.4

    def initialize(model:, document:, options:)
      @model    = model
      @document = document
      @options  = options
      @root     = model.active_entities
      @group    = @root.add_group
      @group.name = "Imported: #{document['source_file']}"
      @entities = @group.entities
      # Map wall_id → array of [segment_group, start_point, direction_vector, length]
      # so the opening cutter can find walls by id and position along them.
      @wall_index = {}

    end

    def build
      @stats = { walls_in: 0, segments_built: 0, pushpull_failed: 0,
                 floors_built: 0, blocks_placed: 0, blocks_missing: 0,
                 markers_drawn: 0 }

      build_floors
      build_walls
      cut_openings if @options && @options[:cut_openings]
      place_blocks
      place_from_library
      build_markers

      puts "[AutocadImporter] build stats: #{@stats.inspect}"
      bb = @group.bounds
      puts "[AutocadImporter] walls group bbox " \
           "min=#{[bb.min.x.to_mm.round, bb.min.y.to_mm.round, bb.min.z.to_mm.round]}mm " \
           "max=#{[bb.max.x.to_mm.round, bb.max.y.to_mm.round, bb.max.z.to_mm.round]}mm"
      jb = @document["bounds"]
      puts "[AutocadImporter] parser bounds " \
           "min=#{jb['min'].map { |v| v.round }}mm " \
           "max=#{jb['max'].map { |v| v.round }}mm"
      lu = @model.options["UnitsOptions"]["LengthUnit"] rescue "?"
      puts "[AutocadImporter] model LengthUnit code: #{lu} (0=in 1=ft 2=mm 3=cm 4=m)"
    end

    private

    def mm_to_length(mm)
      (mm * MM_TO_INCH).inch
    end

    def point_mm_to_inch(x_mm, y_mm, z_mm = 0)
      Geom::Point3d.new(mm_to_length(x_mm), mm_to_length(y_mm), mm_to_length(z_mm))
    end

    def build_floors
      @document["floors"].each do |floor|
        pts = floor["boundary"].map { |xy| point_mm_to_inch(xy[0], xy[1], floor["elevation_mm"]) }
        face = @entities.add_face(pts)
        next unless face
        face.reverse! if face.normal.z < 0
        face.material = ensure_material("Concrete", [200, 200, 195])
        @stats[:floors_built] += 1
      end
    end

    # SketchUp 2026 ships without the "Concrete" default material that
    # earlier versions had, so `face.material = "Concrete"` raises
    # ArgumentError. Look it up; if absent, add it with a concrete-ish RGB
    # fallback. Works across versions.
    def ensure_material(name, rgb)
      mat = @model.materials[name]
      return mat if mat
      mat = @model.materials.add(name)
      mat.color = Sketchup::Color.new(*rgb)
      mat
    rescue StandardError
      rgb
    end

    def build_walls
      height_override = @options && @options[:wall_height_override_mm]
      @stats[:walls_in] = @document["walls"].size

      @document["walls"].each do |wall|
        boundary = wall["boundary"]
        next unless boundary && boundary.size >= 3

        pts = boundary.map { |xy| point_mm_to_inch(xy[0], xy[1], 0) }
        face = @entities.add_face(pts)
        next unless face

        # Cut any interior holes (wall polygon with internal cut-outs).
        (wall["holes"] || []).each do |hole|
          hole_pts = hole.map { |xy| point_mm_to_inch(xy[0], xy[1], 0) }
          hole_face = @entities.add_face(hole_pts)
          hole_face&.erase!
        end

        face.material = wall["kind"] == "exterior" ? [210, 210, 210] : [235, 235, 235]

        height = mm_to_length(height_override || wall["default_height_mm"])
        distance = face.normal.z < 0 ? -height : height
        begin
          face.pushpull(distance)
          @stats[:segments_built] += 1
        rescue StandardError => e
          @stats[:pushpull_failed] += 1
          puts "[AutocadImporter] pushpull failed on wall polygon: #{e.message}"
        end
      end
    end

    def add_wall_segment(a, b, thickness, height, kind)
      direction = b - a
      length = direction.length
      return nil if length == 0

      normal = Geom::Vector3d.new(-direction.y, direction.x, 0)
      normal.normalize!
      half = thickness / 2.0

      p1 = a.offset(normal, half)
      p2 = b.offset(normal, half)
      p3 = b.offset(normal.reverse, half)
      p4 = a.offset(normal.reverse, half)

      face = @entities.add_face(p1, p2, p3, p4)
      unless face
        @stats[:pushpull_failed] += 1
        return nil
      end

      # Apply material BEFORE pushpull — pushpull can consume/invalidate the
      # base face, raising "reference to deleted DrawingElement" on any
      # subsequent access.
      face.material = kind == "exterior" ? [210, 210, 210] : [235, 235, 235]

      # SketchUp pushpull extrudes along face.normal. Vertex ordering (which
      # flips with segment direction) can yield a +Z or -Z normal, making
      # half the walls extrude downward. Force upward extrusion.
      distance = face.normal.z < 0 ? -height : height

      begin
        face.pushpull(distance)
      rescue StandardError => e
        @stats[:pushpull_failed] += 1
        puts "[AutocadImporter] pushpull failed: #{e.message}"
        return nil
      end
      @stats[:segments_built] += 1

      {
        start: a,
        direction: direction.tap(&:normalize!),
        length: length,
        thickness: thickness,
        height: height,
        base_face: face,
      }
    end

    def cut_openings
      @document["openings"].each do |opening|
        wall_id = opening["wall_id"]
        next unless wall_id

        wall = @wall_index[wall_id]
        next unless wall

        position_mm = opening["position_along_wall_mm"]
        segment = find_segment_at_position(wall[:segments], position_mm)
        next unless segment

        local_position = mm_to_length(position_mm - segment[:start_mm])
        width = mm_to_length(opening["width_mm"])
        height = mm_to_length(opening["height_mm"])
        sill = mm_to_length(opening["sill_mm"])

        cut_rectangle_through_wall(
          segment: segment,
          position_along: local_position,
          width: width,
          height: height,
          sill: sill,
        )
      end
    end

    def find_segment_at_position(segments, position_mm)
      segments.reverse.find { |s| s[:start_mm] <= position_mm }
    end

    def cut_rectangle_through_wall(segment:, position_along:, width:, height:, sill:)
      dir = segment[:direction]
      normal = Geom::Vector3d.new(-dir.y, dir.x, 0).normalize
      half_thickness = segment[:thickness] / 2.0

      center = segment[:start].offset(dir, position_along)
      left = center.offset(dir.reverse, width / 2.0)
      right = center.offset(dir, width / 2.0)

      # Build the opening face on the front side of the wall, then push-pull through.
      p1 = left.offset(normal, half_thickness + 1.mm).offset(Z_AXIS, sill)
      p2 = right.offset(normal, half_thickness + 1.mm).offset(Z_AXIS, sill)
      p3 = right.offset(normal, half_thickness + 1.mm).offset(Z_AXIS, sill + height)
      p4 = left.offset(normal, half_thickness + 1.mm).offset(Z_AXIS, sill + height)

      opening_face = @entities.add_face(p1, p2, p3, p4)
      return unless opening_face

      # Push through both wall faces (thickness + safety margin on each side).
      opening_face.pushpull(-(segment[:thickness] + 2.mm))
    end

    # 2D outlines of hand-drawn furniture on `_Co MUEBLE*` layers.
    # Emitted by Python as `markers` — we draw them as edges on the floor
    # plane so the user sees planned furniture footprints without
    # auto-extruding anything they didn't ask for.
    def build_markers
      (@document["markers"] || []).each do |marker|
        next if marker["_consumed"]  # library_index matched and instanced
        pts = marker["path"].map { |xy| point_mm_to_inch(xy[0], xy[1], 0) }
        next if pts.size < 2

        pts.each_cons(2) { |a, b| @entities.add_line(a, b) }
        if marker["closed"] && pts.size > 2
          @entities.add_line(pts.last, pts.first)
        end
        @stats[:markers_drawn] += 1
      end
    end

    # Second pass over remaining markers: try to match each to a .skp
    # component from the studio's 3D library (path stored in the
    # "library_path" preference). Matches by footprint W×D only — the
    # user refines by hand afterwards.
    def place_from_library
      path = LibraryIndex.configured_path
      index = nil
      if path && Dir.exist?(path)
        index = LibraryIndex.new(model: @model, path: path).build
      end

      @stats[:library_matches] = 0
      @stats[:library_fallbacks] = 0
      @stats[:library_loose] = 0
      markers = @document["markers"] || []
      markers.each do |m|
        path_pts = m["path"]
        next unless path_pts && path_pts.size >= 3

        cx, cy, w_mm, d_mm, angle_deg = marker_footprint(path_pts)
        next if w_mm < 100 || d_mm < 100

        match = nil
        if index && !index.empty?
          lib = LibraryIndex.new(model: @model, path: path)
          lib.instance_variable_set(:@components, index)
          match = lib.match_by_footprint(w_mm, d_mm, family_hint: m["layer"])
          match = lib.ensure_loaded(match) if match
        end

        if match && match[:definition] && !match[:loose]
          place_library_match(match, cx, cy, angle_deg)
          @stats[:library_matches] += 1
          m["_consumed"] = true
        elsif match && match[:loose]
          # Loose library match: dims differ too much to trust — skip.
          @stats[:library_loose] += 1
        end
        # Unconsumed markers fall through to build_markers (edges only).
      end
      puts "[AutocadImporter] library matches: #{@stats[:library_matches]} / #{markers.size} " \
           "(loose substitutes: #{@stats[:library_loose] || 0}, fallback boxes: #{@stats[:library_fallbacks]})"
    end

    def place_library_match(match, cx, cy, angle_deg)
      definition = match[:definition]
      rot_deg = angle_deg + (match[:flip] ? 90.0 : 0.0)
      rot_rad = rot_deg * Math::PI / 180.0
      cos_r = Math.cos(rot_rad); sin_r = Math.sin(rot_rad)

      ox, oy, oz = match[:origin_mm]
      local_cx = ox + match[:w_mm] / 2.0
      local_cy = oy + match[:d_mm] / 2.0
      off_x = cos_r * local_cx - sin_r * local_cy
      off_y = sin_r * local_cx + cos_r * local_cy
      insert_x = cx - off_x
      insert_y = cy - off_y
      insert_z = -(oz || 0.0)

      origin = point_mm_to_inch(insert_x, insert_y, insert_z)
      transform = Geom::Transformation.new(origin) *
                  Geom::Transformation.rotation(ORIGIN, Z_AXIS, rot_deg.degrees)
      inst = @entities.add_instance(definition, transform)
      if match[:loose] && inst
        inst.name = "[SUBS] #{match[:name]} err=#{match[:err].to_i}mm"
      end
      inst
    end

    # Placeholder for a direct block whose definition wasn't harvested.
    # Uses Python's block_bbox_mm × scale to size a cuboid at insert_point.
    # Returns true if placed, false if insufficient bbox info.
    def place_block_placeholder(block, name)
      bbox = block["bbox_mm"]
      return false unless bbox && bbox[0] && bbox[1]
      bmin = block["bbox_min_mm"] || [0.0, 0.0]
      sx_raw, sy_raw, sz_raw = block["scale"]
      # Effective dims in world mm: raw bbox * |scale|. Scale ≥100 is the
      # meters-to-mm unit hack (collapse to sign-only).
      fx = sx_raw.abs >= 100 ? 1.0 : sx_raw.abs
      fy = sy_raw.abs >= 100 ? 1.0 : sy_raw.abs
      fz = sz_raw.abs >= 100 ? 1.0 : sz_raw.abs
      w_mm = bbox[0].abs * (sx_raw.abs >= 100 ? sx_raw.abs : 1.0) * fx
      d_mm = bbox[1].abs * (sy_raw.abs >= 100 ? sy_raw.abs : 1.0) * fy
      # Simpler: final size = raw_bbox_mm (already in mm if scale was 1)
      # OR raw_bbox_mm * scale (if scale!=1 and raw is in meters).
      # Studio blocks with scale=1000 have raw bbox in meters: eff = raw*1000.
      eff_w = bbox[0].abs * (sx_raw.abs >= 100 ? sx_raw.abs : 1.0)
      eff_d = bbox[1].abs * (sy_raw.abs >= 100 ? sy_raw.abs : 1.0)
      eff_h = bbox[2] ? bbox[2].abs * (sz_raw.abs >= 100 ? sz_raw.abs : 1.0) : 800.0
      eff_h = 800.0 if eff_h < 50
      return false if eff_w < 50 || eff_d < 50

      ip = block["insert_point"]
      # block-local min (offset of geometry from insertion origin)
      bmin_x = bmin[0] * (sx_raw.abs >= 100 ? sx_raw.abs : 1.0)
      bmin_y = bmin[1] * (sy_raw.abs >= 100 ? sy_raw.abs : 1.0)
      # Local rectangle corners (pre-rotation, relative to insert_point).
      corners_local = [
        [bmin_x,          bmin_y],
        [bmin_x + eff_w,  bmin_y],
        [bmin_x + eff_w,  bmin_y + eff_d],
        [bmin_x,          bmin_y + eff_d],
      ]
      rad = block["rotation_deg"] * Math::PI / 180.0
      cos_r = Math.cos(rad); sin_r = Math.sin(rad)
      sx_sign = (sx_raw <=> 0).to_f
      sy_sign = (sy_raw <=> 0).to_f
      pts = corners_local.map do |lx, ly|
        # Apply mirror sign in local X (rare but handled).
        lx *= sx_sign == 0 ? 1.0 : (sx_raw.abs >= 100 ? sx_sign : 1.0)
        ly *= sy_sign == 0 ? 1.0 : (sy_raw.abs >= 100 ? sy_sign : 1.0)
        wx = ip[0] + cos_r * lx - sin_r * ly
        wy = ip[1] + sin_r * lx + cos_r * ly
        point_mm_to_inch(wx, wy, 0)
      end
      group = @entities.add_group
      group.name = "[BBOX] #{name}"
      face = group.entities.add_face(pts)
      return false unless face
      face.reverse! if face.normal.z < 0
      face.material = ensure_material("BboxPlaceholder", [200, 180, 170])
      face.pushpull(mm_to_length(eff_h))
      true
    end

    # Placeholder 3D volume for markers with no library match. Draws a
    # low-saturation grey cuboid sized to the marker footprint so the
    # user sees WHERE furniture was planned even when we don't know WHAT.
    def place_fallback_box(cx, cy, w_mm, d_mm, angle_deg, layer)
      h_mm = 800.0  # generic waist-high default; user resizes after import
      hw = w_mm / 2.0
      hd = d_mm / 2.0
      rad = angle_deg * Math::PI / 180.0
      cos_r = Math.cos(rad); sin_r = Math.sin(rad)
      corners_local = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
      pts = corners_local.map do |lx, ly|
        wx = cx + cos_r * lx - sin_r * ly
        wy = cy + sin_r * lx + cos_r * ly
        point_mm_to_inch(wx, wy, 0)
      end
      group = @entities.add_group
      group.name = "marker: #{layer}"
      face = group.entities.add_face(pts)
      return unless face
      face.reverse! if face.normal.z < 0
      face.material = ensure_material("MarkerPlaceholder", [190, 190, 200])
      face.pushpull(mm_to_length(h_mm))
    end

    # Approximate minimum-area bounding rectangle via axis-aligned bbox +
    # principal axis. Good enough for rectangular furniture outlines; the
    # Python side uses Shapely for the exact version on palette markers.
    def marker_footprint(path_pts)
      xs = path_pts.map { |p| p[0] }
      ys = path_pts.map { |p| p[1] }
      w_mm = xs.max - xs.min
      d_mm = ys.max - ys.min
      cx = (xs.max + xs.min) / 2.0
      cy = (ys.max + ys.min) / 2.0
      # Dominant axis: if W >= D use 0°, else 90°.
      angle = w_mm >= d_mm ? 0.0 : 90.0
      w_mm, d_mm = [w_mm, d_mm].minmax.reverse
      [cx, cy, w_mm, d_mm, angle]
    end

    # aliases.json maps every DWG block_name (across all training projects)
    # to the canonical .skp stub generated by build_library_stubs.py. Loaded
    # once per build; used to resolve broken or missing harvest definitions.
    def aliases_index
      return @aliases_index if defined?(@aliases_index)
      path = File.join(__dir__, "assets", "aliases.json")
      @aliases_index =
        if File.exist?(path)
          begin
            JSON.parse(File.read(path))
          rescue StandardError => e
            puts "[AutocadImporter] aliases.json parse failed: #{e.message}"
            {}
          end
        else
          {}
        end
    end

    # Resolve `name` to a ComponentDefinition. Priority:
    #   1. alias → modeled .skp (3D library piece). Preferred over harvested
    #      definitions because the DWG's own block is usually a 2D planta with
    #      no height — the modeled .skp has the real 3D geometry.
    #   2. existing definition harvested from the project DWG
    #   3. case-insensitive match in same definitions table
    def resolve_definition(name, definitions, def_index)
      relative = aliases_index[name.to_s] ||
                 aliases_index[name.to_s.downcase] ||
                 aliases_index.find { |k, _| k.downcase == name.to_s.downcase }&.last
      lib_path = LibraryIndex.configured_path
      if relative && lib_path && Dir.exist?(lib_path)
        skp_full = File.join(lib_path, relative)
        if File.exist?(skp_full)
          begin
            loaded = @model.definitions.load(skp_full)
            if loaded && loaded.entities.size > 0
              puts "[AutocadImporter] alias '#{name}' → #{relative}"
              return [loaded, true]
            else
              @model.definitions.remove(loaded) if loaded rescue nil
            end
          rescue StandardError => e
            puts "[AutocadImporter] alias load skipped for '#{name}' → #{relative}: #{e.message}"
          end
        end
      end

      d = definitions[name] || def_index[name.to_s.downcase]
      [d, false]
    end

    def place_blocks
      definitions = @model.definitions
      def_index = build_def_index(definitions)

      puts "[AutocadImporter] definitions available: #{definitions.count} " \
           "(showing first 10): #{definitions.first(10).map(&:name).inspect}"
      puts "[AutocadImporter] aliases loaded: #{aliases_index.size}"

      @document["blocks"].each do |block|
        name = block["block_name"]
        definition, via_alias = resolve_definition(name, definitions, def_index)
        # Alias-loaded .skp: replace DWG mirror with 180° rotation + the
        # empirical (+598, +1053 mm in local rack frame) offset that user
        # measured against cad3 reference rack. This places mirrored racks
        # against their wall, oriented correctly for the studio's plan
        # convention.
        if via_alias
          sx_raw, sy_raw, sz_raw = block["scale"]
          sx_n = sx_raw.abs >= 100 ? 1.0 : sx_raw.abs
          sy_n = sy_raw.abs >= 100 ? 1.0 : sy_raw.abs
          sz_n = sz_raw.abs >= 100 ? (sz_raw <=> 0).to_f : sz_raw
          mirrored = sx_raw < 0 || sy_raw < 0
          extra_rot = mirrored ? 180.0 : 0.0
          new_ip = block["insert_point"]
          if mirrored
            # Empirical model-frame offset derived from user's manual placement
            # of mirrored Visio rack at DWG insert (15060, 7666) rot=270°.
            # Iteration 2: prior (-27, -153) was 152.7,1053.4 short in world.
            # Combined model-frame offset = R(-270°)*(prev_world + correction).
            tx = 1026.4
            ty = -305.7
            rad = block["rotation_deg"] * Math::PI / 180.0
            cos_r = Math.cos(rad); sin_r = Math.sin(rad)
            dx = cos_r * tx - sin_r * ty
            dy = sin_r * tx + cos_r * ty
            new_ip = [block["insert_point"][0] + dx,
                      block["insert_point"][1] + dy,
                      block["insert_point"][2] || 0]
            puts "[AutocadImporter] mirror→180°+offset '#{name}' " \
                 "orig_ip=[#{block['insert_point'][0].round},#{block['insert_point'][1].round}] " \
                 "rot=#{block['rotation_deg'].round}° " \
                 "delta=[#{dx.round},#{dy.round}] " \
                 "→ new_ip=[#{new_ip[0].round},#{new_ip[1].round}] rot=#{(block['rotation_deg']+extra_rot).round}°"
          end
          block = block.merge(
            "scale" => [sx_n, sy_n, sz_n],
            "rotation_deg" => block["rotation_deg"] + extra_rot,
            "insert_point" => new_ip,
          )
        end

        unless definition
          @stats[:blocks_missing] += 1
          puts "[AutocadImporter] Missing component definition '#{name}' — skipping."
          next
        end
        @stats[:blocks_placed] += 1

        ip = block["insert_point"]
        origin = point_mm_to_inch(ip[0], ip[1], ip[2] || 0)

        # Scale normalisation. SketchUp's DWG importer rescales block
        # geometry to mm during harvest, so DXF's raw 1000× insert scale
        # (meters-as-units convention) would inflate the component 1000×.
        # Preserve sign (mirror) but collapse magnitude to 1.0 whenever
        # |s| >= 100. Side effect: blocks whose definition is meters-native
        # and SketchUp imported literally (rare, e.g. vh41-a) will render
        # ~1000× smaller than intended — place those manually after import.
        sx_raw, sy_raw, sz_raw = block["scale"]
        sx = sx_raw.abs >= 100 ? (sx_raw <=> 0).to_f : sx_raw
        sy = sy_raw.abs >= 100 ? (sy_raw <=> 0).to_f : sy_raw
        sz = sz_raw.abs >= 100 ? (sz_raw <=> 0).to_f : sz_raw
        sx = 1.0 if sx == 0; sy = 1.0 if sy == 0; sz = 1.0 if sz == 0
        transform = Geom::Transformation.new(origin) *
                    Geom::Transformation.rotation(
                      ORIGIN, Z_AXIS, block["rotation_deg"].degrees
                    ) *
                    Geom::Transformation.scaling(sx, sy, sz)

        inst = @entities.add_instance(definition, transform)
        if inst.nil?
          puts "[AutocadImporter] add_instance returned nil for '#{name}'"
        elsif block["from_marker"]
          bb = inst.bounds
          puts "[AutocadImporter] placed '#{name}' from_marker " \
               "at ip=[#{ip[0].round},#{ip[1].round}]mm " \
               "rot=#{block['rotation_deg'].round}° " \
               "bbox X[#{bb.min.x.to_mm.round}..#{bb.max.x.to_mm.round}] " \
               "Y[#{bb.min.y.to_mm.round}..#{bb.max.y.to_mm.round}] " \
               "Z[#{bb.min.z.to_mm.round}..#{bb.max.z.to_mm.round}]"
        end
      end
    end

    # Build a case-insensitive definition lookup. SketchUp's DWG importer
    # sometimes mangles block names (prefixes, underscores, casing), so a
    # direct `definitions[name]` lookup misses blocks that do exist.
    def build_def_index(definitions)
      idx = {}
      definitions.each do |d|
        idx[d.name.to_s.downcase] = d
      end
      idx
    end
  end
end
