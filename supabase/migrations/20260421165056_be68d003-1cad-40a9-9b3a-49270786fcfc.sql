CREATE TABLE public.incidencias_video_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_id UUID NOT NULL REFERENCES public.incidencias_propuestas_rrhh(id) ON DELETE CASCADE,
  video_path TEXT NOT NULL,
  frame_url TEXT NOT NULL,
  timestamp_seconds NUMERIC NOT NULL,
  ai_description TEXT,
  relevance_score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (propuesta_id, video_path, timestamp_seconds)
);

CREATE INDEX idx_incidencias_video_frames_propuesta ON public.incidencias_video_frames(propuesta_id);
CREATE INDEX idx_incidencias_video_frames_video_path ON public.incidencias_video_frames(propuesta_id, video_path);

ALTER TABLE public.incidencias_video_frames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view video frames"
ON public.incidencias_video_frames
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert video frames"
ON public.incidencias_video_frames
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete video frames"
ON public.incidencias_video_frames
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));