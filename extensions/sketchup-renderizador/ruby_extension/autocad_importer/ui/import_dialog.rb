# frozen_string_literal: true

module AutocadImporter
  module UI
    # Minimal import-options dialog. Currently exposes a single wall-height
    # override. Expand as needed (per-layer heights, material presets, etc.).
    module ImportDialog
      module_function

      def show(dxf_path:, &on_submit)
        dialog = ::UI::HtmlDialog.new(
          dialog_title:    "Import options",
          preferences_key: "AutocadImporter.ImportDialog",
          scrollable:      false,
          resizable:       false,
          width:           380,
          height:          240,
          style:           ::UI::HtmlDialog::STYLE_DIALOG
        )

        dialog.set_html(html_for(dxf_path))

        dialog.add_action_callback("submit") do |_ctx, payload|
          opts = JSON.parse(payload, symbolize_names: true)
          dialog.close
          on_submit.call(opts)
        end
        dialog.add_action_callback("cancel") { dialog.close }

        dialog.show
      end

      def html_for(dxf_path)
        file = File.basename(dxf_path)
        <<~HTML
          <html><head><style>
            body { font-family: -apple-system, "Segoe UI", sans-serif; padding: 16px; font-size: 13px; }
            label { display: block; margin: 8px 0 4px; }
            input[type=number] { width: 100px; padding: 4px; }
            .file { color: #666; font-size: 12px; margin-bottom: 12px; word-break: break-all; }
            .actions { margin-top: 18px; text-align: right; }
            button { padding: 6px 14px; margin-left: 6px; }
          </style></head>
          <body>
            <div class="file">File: #{file}</div>

            <label for="h">Wall height override (mm, blank = use layer defaults):</label>
            <input id="h" type="number" min="0" step="50" placeholder="2700" />

            <label><input id="openings" type="checkbox" /> Cut door/window openings (experimental)</label>

            <div class="actions">
              <button onclick="sketchup.cancel()">Cancel</button>
              <button onclick="submit()">Import</button>
            </div>

            <script>
              function submit() {
                const h = document.getElementById('h').value;
                const payload = {
                  wall_height_override_mm: h === '' ? null : parseFloat(h),
                  cut_openings: document.getElementById('openings').checked
                };
                sketchup.submit(JSON.stringify(payload));
              }
            </script>
          </body></html>
        HTML
      end
    end
  end
end
