---
name: NSPP & suspension aviso flow
description: NSPP termination flow + suspension aviso email behavior (button always present, PDF download via window.print())
type: feature
---

# NSPP flow
- Contract termination flow (NSPP = "No Supera Período de Prueba"). Amber badge.
- Skips recidivism metrics.
- NSPP email is a separate flow (`sendNsppDirectEmail`), independent from the suspension aviso below.

# Suspension aviso email (sanction with `suspension_dias > 0`)
- Sent ONLY when `tipo === 'sancion'` AND `suspension_dias > 0`. Targets `purpose = 'suspension_aviso'` recipients (RRHH).
- **The email NEVER goes out without the legal document link.** RRHH does not have panel access; an email without the button is useless.
- `sendSuspensionAvisoEmail` polls `incidencias_legal_documents.html_content` for up to **75s** (15 × 5s). After the 2nd failed poll it triggers `generateLegalDocumentBackground` once.
- If the document still isn't ready after 75s: **does NOT send the email**. Schedules a deferred retry via `EdgeRuntime.waitUntil` (60s wait → recursive call with `sourceLabel = 'retryDeferred-N'`). Up to **3 deferred retries** (≈4 min total). After that, gives up and logs error — admin can use the "Reenviar aviso" button in the Tareas Kanban as a safety net.
- The email body has a single amber CTA button **"Ver documento de la sanción"** pointing to the public landing (`public-actions ?attachmentToken=…&mode=page`) plus a small text link **"o descargar directamente en PDF"** pointing to `mode=pdf`.
- Email intro text MUST NOT mention "el panel" nor "Reenviar aviso desde Tareas" — RRHH has no panel access.
- The link is permanent and stable across regenerations: `ensureLegalDocumentOnlineLink` upserts the same `documentos-online/{proposalId}/{docId}.html` path and reuses the same token in `incidencias_attachment_links`.

# Resend button
- Action `resendSuspensionAviso` in `incidencias-operations`: clears `suspension_aviso_enviado_at` and re-runs `sendSuspensionAvisoEmail`. Used by "Reenviar aviso" button in `AdminTareasTab.tsx` (visible on Kanban + List for sanctions with `suspension_dias > 0`, statuses Pendiente / Imprimido / Pte. Firma).

# Public landing for the legal document (`public-actions` `attachmentToken`)
- `mode=page` → branded landing with iframe preview and two buttons:
  - Primary: **"Descargar PDF"** → `mode=pdf`
  - Secondary: **"Abrir en nueva pestaña"** → `mode=raw`
- `mode=pdf` (HTML legal documents only): returns an HTML page that embeds the document and triggers `window.print()` automatically with `@page { size:A4; margin:16mm }`. Result is a PDF identical to the printed sanction. For non-HTML files, falls back to `mode=download`.
- `mode=download` keeps current behavior (force `attachment` disposition).
- `mode=raw` serves the file inline.
