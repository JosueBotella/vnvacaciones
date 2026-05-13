---
name: Legal document evidence collage + manager-evidence soft disable
description: Compact image collage rules in legal docs, manual cropping, and soft-disable of manager evidence (kept for audit, ignored by AI)
type: feature
---

# Evidence handling for legal docs

## Collage / collage rules in `buildImagesHtml` (incidencias-operations)
- 2+ images → forced compact collage (no large-row layout) so docs stay 1–2 pages.
- `object-fit: cover` + `transform: scale(1.18)` + `transform-origin: top center` to "zoom into" screenshots.
- Dynamic thumb heights: 1→210px, 2→250px, 3–4→190px, 5–9→150px, 10+→125px.
- Grid layout (not CSS columns) so images align in rows.

## Manual cropping (admin)
- `EvidenceCropDialog` (react-easy-crop) lets admin frame any image before generating doc.
- Two flows from `AdminPropuestasTab.tsx`:
  - **Manager evidence (encargado)**: cropping uploads a NEW admin-evidence file AND soft-disables the original manager path in the same multipart request (`disableManagerPath` field). Original file is preserved.
  - **Admin evidence**: cropping replaces (uploads new + deletes old via `removeAdminProposalImage`).

## Soft-disable manager evidence
- Column: `incidencias_propuestas_rrhh.disabled_manager_pruebas jsonb default '[]'`.
- Action `toggleManagerEvidence` (JSON, admin-only) flips a path on/off the disabled list.
- Filtering applied at every legal/AI image-collection site:
  - `extractEvidencePaths` action (line ~7010)
  - `generateLegalDocument` flow (legalProp branch, line ~7452)
  - `generateLegalDocumentBackground` (line ~12147)
- Disabled manager images:
  - Render dimmed + grayscaled with `EyeOff` overlay in the gallery.
  - Have a green eye button to reactivate; visible non-disabled images expose a small disable button on hover.
- AI never sees disabled manager evidence; original file remains in storage for audit.
