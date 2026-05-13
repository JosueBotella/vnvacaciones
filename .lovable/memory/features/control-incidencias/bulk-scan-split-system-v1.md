---
name: bulk-scan-split-system-v1
description: Reparto automático de PDFs firmados (sin rotar) con regla estricta "Página 1 de N = N páginas seguidas", visor que enseña sub-PDFs reales por trabajador y chat de corrección
type: feature
---

# Reparto automático de PDFs firmados (Bulk scan)

Pantalla: pestaña **Tareas** (admin), botón "Subir PDF firmado masivo".

## NO se rota ni se reconstruye el PDF

El archivo del escáner se respeta tal cual: la división final copia páginas con `copyPages` sin rotar. Decisión expresa del usuario.

## Regla principal de split (DETERMINISTA y ESTRICTA, sin truncado)

Cada documento individual SIEMPRE empieza en una página cuyo PIE contiene a la vez:

1. Nombre del trabajador (mapeo).
2. Marcador `Página 1 de N` (también `Pág. 1 de N`, `1 / N`, `1 de N`).

Reglas exactas:

- `Página 1 de N` → ese `pageStart` y `pageEnd = pageStart + N - 1`, sin importar lo que la IA lea en las páginas intermedias.
- NO se trunca por "aparece otro Página 1 de M dentro del rango": eso provocaba documentos cortados cuando la IA leía mal una hoja intermedia (caso real: Kaita con `1 de 3` reportado como 2 páginas).
- Si `pageEnd > totalPages` se marca aviso de "Faltan páginas".
- Las páginas intermedias solo se usan como chequeo blando (warning ámbar), nunca cambian el rango.

## Lectura de la IA (página a página)

`incidencias-bulk-scan-split` pide a Gemini 2.5 Flash una fila por página: `pdf_page`, `worker_name`, `footer_worker_name` (PRIMARIO), `marker_current`, `marker_total`, `marker_literal`, `raw_footer_text`, `confidence`. La IA NO decide rangos ni emparejamientos.

## Mapeo por nombre

`findBestTask` con Jaccard sobre tokens normalizados; honoríficos eliminados, `Mª → maria`, sin acentos. Score = `intersección / min(|A|, |B|)`. Umbral 0.4. Tipo (sanción/amonestación) suma 0.05; el nombre manda.

## UI (paso `review`)

- **Izquierda (42%)**: lista de propuestas con páginas (+/−), trabajador, tipo+gravedad, pill de confianza, nombre que la IA leyó, marcador `Página 1 de N`, aviso ámbar si páginas asignadas ≠ N esperado, selector para reasignar, botón ✕. Borde rojo si solapa. Toggle "Lectura página a página".
- **Derecha (visor)**:
  - Cuando hay un trabajador seleccionado: muestra un **sub-PDF real generado en el navegador con `pdf-lib`** (solo las páginas asignadas a ese trabajador). NO usa salto `#page=` sobre el PDF completo.
  - Cuando no hay seleccionado / botón "Ver PDF completo": muestra el PDF original tal cual.
  - Badge violeta "PDF separado · pág. X–Y del original" cuando se ve un sub-PDF; badge neutro "PDF original completo" cuando se ve el original.
- Los sub-PDFs se cachean por `${pageStart}-${pageEnd}` y se regeneran cuando cambia un rango. Se revocan al cerrar el diálogo.
- **Chat (38% inferior derecho)**: corrige reparto. Al recalcular se conservan los sub-PDFs cuyo rango no haya cambiado.

## Confirmación y split final

`splitAndAttachScannedPdf` en `incidencias-operations`:

- Recibe el base64 original + `assignments`.
- Rechaza si hay solapes o si `pageStart < 1` / `pageEnd > totalPages` / `pageStart > pageEnd`.
- Por cada asignación: `sub.copyPages(sourcePdf, [pageStart-1..pageEnd-1])` y `sub.addPage(...)` — NO rota, NO reconstruye.
- Sube a `incidencias-pruebas/scanned-signed/{taskId}/...pdf` y dispara `finalizeSignedTask`.

## Aprendizaje persistente

Tabla `incidencias_bulk_scan_corrections` (initial_assignments, final_assignments, correction_chat, lessons, created_by). Las últimas 20 lecciones se inyectan como few-shot en el prompt.

## Notas

- Provider IA: Gemini 2.5 Flash directo (con fallback Lovable AI Gateway).
- Botón **Continuar** deshabilitado mientras haya solape; el backend rechaza solapes con error explícito.
- Frontend usa `pdf-lib` (dependencia añadida) para generar las previsualizaciones de los sub-PDFs.
