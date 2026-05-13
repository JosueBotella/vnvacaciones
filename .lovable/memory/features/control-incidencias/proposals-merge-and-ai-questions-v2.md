---
name: Proposals merge and AI questions v2
description: Merge multiple proposals + AI clarification questions + admin audit trail in AdminPropuestasTab
type: feature
---

## Fusión de propuestas

- Selección múltiple con checkbox por card. Solo `estado=pendiente` y no NSPP.
- Validación cliente + servidor: SOLO mismo `worker_id`. Se permite mezclar tipos (amonestación + sanción) y departamentos; la IA recalifica el conjunto en el merge según la complejidad global. Prompt de merge incluye nota explícita cuando hay mezcla de tipos/departamentos.
- Checkboxes incompatibles → disabled con Tooltip mostrando motivo concreto.
- `validateMergeSelection()` se ejecuta antes de abrir el modal y antes de enviar.
- Modal incluye mini-tabla resumen (fecha · descripción truncada · tipo).
- Backend filtra propuestas con `estado=fusionada` o `merged_into_id IS NOT NULL` en `listPropuestas`.
- Frontend: `visiblePropuestas` (useMemo) excluye fusionadas; reconciliación automática de `mergeSelection ⊆ visiblePropuestas`.
- Realtime: al recibir UPDATE con `estado=fusionada`, purga inmediata sin esperar al reload.
- Logs: `proposals_merged` (target) + `proposal_merged_into` (cada origen).

## Preguntas IA (necesita_aclaracion)

- IA puede marcar `q.opcional=true` para preguntas opcionales; por defecto son requeridas.
- Botón disabled hasta que TODAS las requeridas tengan respuesta no vacía (trim).
- Contador "X de Y respondidas · faltan Z" junto al botón.
- Asterisco `*` en preguntas requeridas; check verde cuando respondidas.
- Overlay full-panel con `Loader2` durante el reanálisis (`pointer-events-none opacity-60`).
- Persistencia en `sessionStorage` (clave `incidencias_ai_answers`) para no perder respuestas.
- Backend valida que todas las requeridas estén respondidas; si no, 400 con mensaje claro.
- Log enriquecido con `tipo_previo`, `gravedad_previa` y `preguntas_originales`.

## Historial de decisiones (audit trail)

- Acción backend: `getPropuestaAuditTrail` (admin only). Incluye logs de la propuesta + sus `merge_source_ids` + `merged_into_id`.
- Filtra `action_type IN (ai_questions_answered, proposals_merged, proposal_merged_into, reset_propuesta, manual_gravedad_change, manual_tipo_change, approve_propuesta, reject_propuesta, audiencia_previa_completada, pliego_cargos_generado)`.
- Botón `History` en el header de cada card (junto al badge de estado).
- Dialog timeline con icono por tipo y render específico:
  - `ai_questions_answered`: muestra preguntas + respuestas + estado previo.
  - `proposals_merged`: trabajador, conteo de origen, tipo esperado, instrucciones admin.
  - `manual_*_change`: "de → a".
- Tabla `incidencias_audit_logs` ya existía; no requiere migración.
