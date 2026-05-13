---
name: Legal document in-document block editor (v2 — live sliders)
description: In-document block editor with click-to-select, drag reorder, figure trash, and a floating popover with sliders (margin, padding, scale) that update the iframe live via postMessage without re-rendering
type: feature
---

## Live editing flow (v2)
- Mutations to the working `Document` no longer trigger `setViewDoc({html_content})` (which would re-paginate and reload the iframe).
- The popover sends `postMessage({type:'legal-doc-block-apply-style', id, patch})` to the iframe; the iframe applies the change to inline styles on `[data-block-id]` and re-emits the rect so the popover stays anchored.
- Working doc is mutated silently via `setBlockInlineStyle()` so save/undo serialize the right HTML.
- `applyBlockDocChange(mutate, { reload: true })` is used only for reorder / figure remove / block remove (mutations the iframe can't apply itself).
- Save serializes the working doc once and persists via `incidencias-operations.updateLegalDocument`.

## Popover controls
`LegalDocumentInDocBlockControls` exposes shadcn sliders:
- **Margen superior / inferior**: −16 → 64 px
- **Padding vertical / horizontal**: 0 → 40 px
- **Escala del bloque**: 0.60× → 1.20× (applied as `font-size: NN%` inline → cascades to all child gaps/sizes that use em)
Per-field "Auto" reset button + global Restablecer + Eliminar bloque.

Persistence: inline styles on the block element (`margin-top`, `margin-bottom`, `padding-*`, `font-size`). `sanitizeHtml` already allows `style`. Old `data-block-margin-*` / `data-block-size` attribute system is kept for backwards compatibility.

## Key files
- `src/lib/legalDocumentBlocks.ts` — `setBlockInlineStyle()`, `BlockInlineStyle`, `readInlineStyle()`, `resetBlock()` clears inline + attrs
- `src/components/incidencias/legalDocumentPreview.ts` — handles `legal-doc-block-apply-style` and `legal-doc-block-clear-styles`
- `src/components/incidencias/LegalDocumentInDocBlockControls.tsx` — slider popover
- `src/components/incidencias/LegalDocumentInlineButton.tsx` — `handleBlockChangeStyle` (silent mutate + postMessage)
