-- ============================================
-- 1. Tabla catálogo de prompts editables
-- ============================================
CREATE TABLE public.incidencias_ai_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  default_content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  current_version_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================
-- 2. Tabla histórico de versiones
-- ============================================
CREATE TABLE public.incidencias_ai_prompt_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_id UUID NOT NULL REFERENCES public.incidencias_ai_prompts(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  author_manager_id UUID,
  author_name TEXT,
  change_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (prompt_id, version_number)
);

-- FK opcional ahora que existe la tabla de versiones
ALTER TABLE public.incidencias_ai_prompts
  ADD CONSTRAINT incidencias_ai_prompts_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES public.incidencias_ai_prompt_versions(id)
  ON DELETE SET NULL;

-- Índices
CREATE INDEX idx_incidencias_ai_prompt_versions_prompt
  ON public.incidencias_ai_prompt_versions(prompt_id, version_number DESC);

-- ============================================
-- 3. RLS - solo admins (autenticación por sessionToken se valida en edge functions)
-- ============================================
ALTER TABLE public.incidencias_ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidencias_ai_prompt_versions ENABLE ROW LEVEL SECURITY;

-- Bloqueo total a clientes anónimos/autenticados directos.
-- Todo el acceso pasa por edge functions con service role + validación de sessionToken admin.
CREATE POLICY "Deny all client access to ai prompts"
  ON public.incidencias_ai_prompts
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny all client access to ai prompt versions"
  ON public.incidencias_ai_prompt_versions
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ============================================
-- 4. Trigger updated_at
-- ============================================
CREATE TRIGGER update_incidencias_ai_prompts_updated_at
  BEFORE UPDATE ON public.incidencias_ai_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 5. Catálogo inicial de prompts del módulo de incidencias
--    (default_content placeholder; se rellena con el real desde la edge function la primera vez que se lee)
-- ============================================
INSERT INTO public.incidencias_ai_prompts (prompt_key, name, description, category, default_content, is_active) VALUES
  ('clasificar',
   'Clasificación de gravedad',
   'Analiza la descripción de una incidencia y propone gravedad y artículo del convenio aplicable.',
   'analisis',
   '__PENDING_SYNC_FROM_CODE__',
   false),
  ('analizar_propuesta',
   'Análisis IA de propuesta',
   'Análisis completo de la propuesta disciplinaria: contexto, agravantes, atenuantes, recomendación de medida.',
   'analisis',
   '__PENDING_SYNC_FROM_CODE__',
   false),
  ('generar_documento_legal',
   'Generación del documento legal',
   'Construye el informe disciplinario completo en HTML con secciones, semibold, leyendas semanales, etc.',
   'documento',
   '__PENDING_SYNC_FROM_CODE__',
   false),
  ('generar_borrador_sancion',
   'Borrador de sanción',
   'Genera un borrador de carta de sanción / amonestación según gravedad y hechos.',
   'documento',
   '__PENDING_SYNC_FROM_CODE__',
   false),
  ('resumen_trabajador',
   'Resumen del trabajador',
   'Resumen ejecutivo del histórico disciplinario de un trabajador.',
   'analisis',
   '__PENDING_SYNC_FROM_CODE__',
   false),
  ('consultar_convenio',
   'Consulta al convenio',
   'Responde preguntas libres sobre el convenio colectivo aplicable.',
   'consulta',
   '__PENDING_SYNC_FROM_CODE__',
   false),
  ('analyze_patterns',
   'Análisis de patrones',
   'Detecta tendencias, picos y predicciones del módulo de analítica de incidencias.',
   'analitica',
   '__PENDING_SYNC_FROM_CODE__',
   false),
  ('limpiar_transcripcion',
   'Limpieza de transcripción',
   'Limpia y normaliza el texto crudo de las transcripciones de voz.',
   'utilidad',
   '__PENDING_SYNC_FROM_CODE__',
   false);