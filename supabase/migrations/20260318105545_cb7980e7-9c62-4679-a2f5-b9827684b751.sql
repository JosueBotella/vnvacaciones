
CREATE TABLE public.incidencias_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_id UUID NOT NULL REFERENCES public.incidencias_propuestas_rrhh(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidencias_chat_messages_propuesta ON public.incidencias_chat_messages(propuesta_id, created_at);

ALTER TABLE public.incidencias_chat_messages ENABLE ROW LEVEL SECURITY;
