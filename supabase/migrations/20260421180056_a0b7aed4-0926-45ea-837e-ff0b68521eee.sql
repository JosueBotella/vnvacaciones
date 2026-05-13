
ALTER TABLE public.incidencias_video_frames
  ADD COLUMN IF NOT EXISTS capture_source text,
  ADD COLUMN IF NOT EXISTS source_video_name text,
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone;

-- Purge old, non-verified cache (any rows without v2 trace)
DELETE FROM public.incidencias_video_frames
  WHERE capture_source IS NULL OR capture_source <> 'browser_canvas';

-- Drop persistent attachment links pointing to legacy video-frames/ folder.
-- These were used to render fake/recycled images in legal documents.
DELETE FROM public.incidencias_attachment_links
  WHERE storage_path LIKE 'video-frames/%';
