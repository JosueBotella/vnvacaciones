---
name: AI prompts editor
description: Admin editor for AI prompts with versioning and active/inactive override. Overrides are appended (never replace) to base prompts in control-incidencias-ai.
type: feature
---
Sistema de edición de prompts de IA del módulo Control de Incidencias desde la webapp (sección "IA: Editor de prompts" en Ajustes, solo admin).

## Tablas
- `incidencias_ai_prompts` — catálogo (prompt_key UNIQUE, name, description, category, default_content, is_active, current_version_id). RLS deny-all (acceso solo vía edge function con service role).
- `incidencias_ai_prompt_versions` — histórico inmutable (prompt_id, version_number, content, author_manager_id, author_name, change_notes). UNIQUE(prompt_id, version_number).

## Edge function `incidencias-ai-prompts`
Acciones: `list`, `get`, `saveVersion` (crea nueva versión y opcionalmente activa), `toggleActive`, `restoreVersion` (crea nueva versión copiando una antigua), `syncDefaults`. Valida sessionToken + role='admin'.

## Integración con `control-incidencias-ai`
**CRÍTICO**: el override NO reemplaza el prompt original. Se concatena como bloque adicional al final de `empresaContext` (que ya se inyecta a todos los handlers) con el encabezado:
"=== INSTRUCCIONES ADICIONALES DEL ADMINISTRADOR (nombre) === ... === FIN ==="
Solo se aplica si `is_active=true` Y existe `current_version_id`. Mapeo `action → prompt_key` en `ACTION_TO_KEY` (8 claves: clasificar, generar_borrador_sancion, resumen_trabajador, consultar_convenio, analyze_patterns, generar_documento_legal, analizar_propuesta, limpiar_transcripcion).

## UI: `AdminAiPromptsPanel`
- Agrupado por categoría con badges de color.
- Toggle activar/desactivar por prompt + Editar.
- Dialog 5xl con: editor (textarea mono), botón "Ver original" (read-only), "Resetear al original", input notas, switch "Activar al guardar".
- Columna lateral con histórico completo, "Restaurar" en versiones antiguas.
- Badges: Original / Editado·inactivo / Activo.

## Filosofía
Los prompts hardcodeados en código son siempre la base. Los overrides son matices/correcciones del admin que se aplican con prioridad. Esto evita romper el comportamiento de la IA (que ya funciona bien) y permite ajustes sin tocar código.
