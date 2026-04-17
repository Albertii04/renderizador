-- Raise file size cap for desktop installers. NSIS/DMG artifacts are
-- typically 80-200 MB; default 50 MB bucket limit rejects them.

update storage.buckets
  set file_size_limit = 524288000  -- 500 MB
where id = 'desktop-releases';
