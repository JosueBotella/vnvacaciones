---
name: Reglas de citación de artículos del convenio (Comercio Flores y Plantas)
description: Numeración exacta del XVIII Convenio (BOE-A-2025-21424). Faltas tipificadas SIEMPRE en Art. 50 con letra; Art. 49 solo principios sin letra; sanciones en Art. 51. Normalizador automático de citas en backend.
type: feature
---

# Reglas de citación — XVIII Convenio Comercio Flores y Plantas

Aplicables a TODA generación/edición de documentos legales (control-incidencias-ai + incidencias-operations).

## Mapa de artículos
- **Art. 49 — Principios de ordenación**: solo apartados 1-5. NUNCA llevan letra. Citar como "Art. 49" o "Art. 49.N" donde N ∈ {1..5}.
- **Art. 50 — Clasificación de faltas**: TODA falta tipificada va aquí, SIEMPRE con letra:
  - Leves → `Art. 50.1.<letra>` (a..g)
  - Graves → `Art. 50.2.<letra>` (a..o)
  - Muy graves → `Art. 50.3.<letra>` (a..n)
- **Art. 51 — Sanciones**: `51.a` (leve), `51.b` (grave), `51.c` (muy grave).

## Errores prohibidos
- ❌ `Art. 49.X.<letra>` — NO EXISTE.
- ❌ `Art. 48.X.<letra>` — el régimen disciplinario empieza en Art. 49.
- Cualquier cita con letra debe empezar por **50**, nunca por 49 ni 48.

## Barreras técnicas (no solo prompts)
1. **Prompt hardening** en `supabase/functions/control-incidencias-ai/index.ts` (CONVENIO_CONTEXT) con autocontrol antes de responder.
2. **Normalizador `normalizeConvenioCitations`** en `supabase/functions/incidencias-operations/index.ts` que convierte `Art. 49.X.letra` y `Art. 48.X.letra` → `Art. 50.X.letra` tanto en el JSON de la IA como en el HTML final.
3. **Bug eliminado**: la función `enforceLegalDocumentHtmlConsistency` ya NO degrada `Art. 50` a `Art. 49`/`Art. 48` cuando el admin baja la gravedad. Bajar la gravedad cambia el subapartado (50.3 → 50.2 → 50.1), no el número del artículo.

## Convenio aplicable (única fuente)
XVIII Convenio Colectivo Estatal para las Empresas del Comercio de Flores y Plantas — BOE-A-2025-21424. Cualquier ejemplo de entrenamiento que cite numeraciones antiguas debe ignorarse.

## Casos de referencia
- Maarouf Fouad y Axel (mayo 2026): la IA citaba "Art. 49.2 f)" para desobediencia — debía ser "Art. 50.2 f)". Tras este fix general, regenerar el documento con "Regenerar documento" para obtener la cita correcta.
