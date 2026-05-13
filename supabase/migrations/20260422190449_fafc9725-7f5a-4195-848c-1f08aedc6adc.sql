-- 1) Limpiar duplicados existentes en incidencias_legal_documents.
--    Para cada (propuesta_id, worker_id) con anulado=false, conservamos el
--    documento MÁS RECIENTE y eliminamos el resto. Las firma_tasks y versiones
--    asociadas a los documentos eliminados se borran también para mantener
--    integridad (no han sido firmados todavía: están duplicados en pendiente).
WITH ranked AS (
  SELECT id,
         propuesta_id,
         worker_id,
         created_at,
         ROW_NUMBER() OVER (
           PARTITION BY propuesta_id, worker_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.incidencias_legal_documents
  WHERE anulado = false
    AND propuesta_id IS NOT NULL
    AND worker_id IS NOT NULL
),
to_delete AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM public.incidencias_legal_document_versions
WHERE document_id IN (SELECT id FROM to_delete);

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY propuesta_id, worker_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.incidencias_legal_documents
  WHERE anulado = false
    AND propuesta_id IS NOT NULL
    AND worker_id IS NOT NULL
)
DELETE FROM public.incidencias_firma_tasks
WHERE legal_document_id IN (SELECT id FROM ranked WHERE rn > 1);

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY propuesta_id, worker_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.incidencias_legal_documents
  WHERE anulado = false
    AND propuesta_id IS NOT NULL
    AND worker_id IS NOT NULL
)
DELETE FROM public.incidencias_legal_documents
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) Limpiar duplicados de firma_tasks por (legal_document_id) — solo
--    deberían existir 1 por documento. Conservamos el más reciente.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY legal_document_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.incidencias_firma_tasks
  WHERE legal_document_id IS NOT NULL
)
DELETE FROM public.incidencias_firma_tasks
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3) Crear índice ÚNICO parcial: un solo documento legal NO anulado por
--    (propuesta_id, worker_id). Esto evita duplicados a nivel de BD aunque
--    haya una race condition entre la generación en background y la manual.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_legal_doc_per_proposal_worker
  ON public.incidencias_legal_documents (propuesta_id, worker_id)
  WHERE anulado = false
    AND propuesta_id IS NOT NULL
    AND worker_id IS NOT NULL;

-- 4) Crear índice ÚNICO en firma_tasks: 1 tarea de firma por documento legal.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_firma_task_per_legal_doc
  ON public.incidencias_firma_tasks (legal_document_id)
  WHERE legal_document_id IS NOT NULL;