# Memory: index.md
Updated: now

# Project Memory

## Core
- NSPP emails: no orange/amber vertical left border on any info box; use subtle full border or no border.
- Apple-like minimal UI, Poppins font, pill badges. Glassmorphism blur 24-28px. Colors: Green #93d600, Amber #d97706, Red #dc2626.
- Sync navigation with URL parameters `?module=` and `?tab=`.
- AI: Google Gemini direct API SIEMPRE como principal (flash→pro). Lovable AI Gateway solo como fallback de último recurso. Use `EdgeRuntime.waitUntil` + polling. Sanitize AI text.
- AI must use generic terms (no specific product names), never use 'sanción' in 'AMONESTACIÓN'.
- Strict RLS. Admin-only bucket inserts. Supabase free tier global lock if row limit reached.
- Suspension days are NATURAL days (weekends included, Art. 5 Código Civil). Legal expiration: Leve 10d, Grave 20d, MG 60d.
- Cascade delete incidents (removes history, attachments, chat).
- Analysis-first gating: all legal fields locked until ai_analysis exists. Reset button clears everything for fresh cycle.
- Toda medida disciplinaria (amonestación o sanción) DEBE estar vinculada a un apartado del Art. 50 del convenio. Bloqueo de aprobación si falta artículo. NSPP (Art. 14.2 ET) excluido.
- Faltas muy graves requieren audiencia previa de 5 días hábiles antes de la sanción definitiva (pliego de cargos + bloqueo de aprobación).
- Documento legal al trabajador NUNCA menciona propuestas internas previas, comparaciones, deliberaciones, encargados, IA ni procesos internos. Solo hechos + Art. 50 + Art. 51.
- Inasistencia injustificada: 1 día/mes = LEVE (50.1.b), 2-4 = GRAVE (50.2.b), 3 CONSECUTIVOS o 5 ALTERNOS = MUY GRAVE (50.3.b). NUNCA "3 alternos".
- Convenio aplicable: XVIII Convenio Comercio Flores y Plantas (BOE-A-2025-21424). Faltas SIEMPRE en Art. 50 con letra (50.1/2/3.x); Art. 49 solo principios sin letra; Art. 51 sanciones. Backend normaliza Art. 49.X.letra → Art. 50.X.letra.
- Convenio Flores y Plantas: faltas tipificadas SIEMPRE Art. 50 (50.1/50.2/50.3 + letra). Art. 49 = solo principios 1-5 sin letra. Sanciones Art. 51.a/b/c. PROHIBIDO "Art. 49.X.letra".

## Memories
- [Severity & UI spec](mem://features/control-incidencias/severity-and-ui-spec) — 10 severity levels and manual selection for 'Depende' category
- [Category management](mem://features/control-incidencias/category-management-v7) — Many-to-many categories with departments, CSV filtering tags
- [Schedule AI & rotation](mem://features/labor/schedule-ai-and-rotation-spec) — AI schedule rotation logic and shift cloning rules
- [Team labels (lugar/función)](mem://features/labor/team-labels-system-v1) — Etiquetas asignables/rotables a equipos, render apilado en PDF (6.5px uppercase) y leyenda inferior
- [Invoice matching](mem://features/produccion/cuadre-facturas-spec-v3) — Gemini-1.5-flash invoice matching, stem normalization and provider learning
- [WhatsApp import](mem://features/operativa/whatsapp-import-system-v2) — Gemini 2.0 Flash clipboard import with 0.72 fuzzy matching for names
- [Rules engine & points](mem://features/control-incidencias/rules-engine-and-points-v4) — Auto-escalation and point-based proactive severity suggestion
- [Supabase usage limits](mem://features/supabase-usage-limits-system-v2) — Global read-only lock based on Supabase free tier limits
- [Session token integrity](mem://auth/session-token-integrity-v3) — getManagerSessionToken helper using both local and session storage
- [Physical signature workflow](mem://features/control-incidencias/physical-signature-workflow) — Kanban workflow for physical signatures and JSONB photo uploads
- [Special hours schedule](mem://features/labor/schedule-special-hours-and-pdf-v5) — Amber UI/PDF rules for special hours and state preservation
- [AI reliability & queuing](mem://features/ai/reliability-and-queuing-v2) — Gemini fallback strategy, retries, and background queueing
- [Positive incidents](mem://features/control-incidencias/positive-incidents-system-v1) — 'Reconocimientos' system without severity, using #93d600 and star icons
- [CV filtering system](mem://features/candidaturas/ai-cv-filtering-system-v7) — AI CV filtering with Nominatim geoloc and dynamic form step visibility
- [Interviews system v2](mem://features/candidaturas/interviews-system-v2) — Duration 30/45/60 min (default 30) and Google Calendar / .ics export
- [Manager invitation email](mem://features/managers/invitation-email-system-v1) — Admin sends setup-password invitation to managers via Resend, with test-mode email override
- [NSPP flow spec](mem://features/control-incidencias/nspp-flow-spec-v2) — Contract termination flow (amber badge) that skips recidivism metrics
- [Incident deletion policy](mem://features/control-incidencias/incident-deletion-policy) — Full cascade deletion for incidents, storage, and history
- [Sanction calendar](mem://features/control-incidencias/sanction-editing-and-suspension-calendar-v2) — Natural days suspension, weekends included, red/emerald UI markers
- [Altas form spec](mem://features/operativa/altas-form-spec) — Form with dynamic group filtering and Brevo email error logging
- [Performance presentation](mem://features/reporting/interactive-performance-presentation-v3) — 1920x1080 modal scaling and landscape PDF export via html2canvas
- [Audit trail & changelog](mem://features/control-incidencias/audit-trail-and-changelog-v1) — Audit logging for manual sanction edits by admins
- [CSV import simulation](mem://features/control-incidencias/csv-import-simulation-v2) — CSV dry-run simulation for impact on worker points
- [RLS & access control](mem://security/rls-and-access-control-v5) — Strict RLS policies and admin-only bucket constraints
- [Signature tracking](mem://features/control-incidencias/history-signature-tracking-v2) — 'Firmada' boolean state tracking and auto-signing for 'solo_incidencia'
- [AI training system](mem://features/control-incidencias/ai-training-system-v1) — Few-shot learning from 'incidencias-training-docs' bucket
- [Legal compliance system](mem://features/control-incidencias/legal-compliance-system-v2) — Expiration timeframes, double escalation paths to muy_grave (Vía A formal recidivism / Vía B prior warning), mandatory audiencia previa
- [Audiencia previa flow](mem://features/control-incidencias/audiencia-previa-flow-v1) — 5 business days hearing trámite for muy_grave, pliego de cargos document, approval blocked until completed
- [Responsable role scope](mem://features/control-incidencias/responsable-role-scope-v8) — Manager visibility rules and preview mode state resets
- [Report regeneration](mem://features/control-incidencias/report-regeneration-integrity) — Deletes 'incidencias_firma_tasks' to handle FK conflicts during regeneration
- [Isolated document preview](mem://ui/isolated-document-preview-v1) — A4 PDF preview using iframe srcDoc with 20% scaling
- [Performance & animations](mem://ui/performance-and-animations-v2) — Staggered fade-in-up animations and 24-28px glassmorphism
- [Disciplinary workflow](mem://features/control-incidencias/disciplinary-proposal-workflow-v8) — AI generation polling and interactive legal document review
- [Proposals merge & AI questions](mem://features/control-incidencias/proposals-merge-and-ai-questions-v2) — Merge multi-proposals with same worker/tipo/dept validation, AI clarification questions with required gating, admin audit trail dialog
- [Unified schedules view](mem://features/manager/unified-schedules-view-v4) — Responsive scheduling view with manager search and group colors
- [AI legal doc integrity](mem://features/control-incidencias/legal-document-ai-integrity-and-editing-v3) — AI terminology bans and generic product name constraints
- [Corporate identity](mem://style/corporate-identity-and-design-v8) — Apple minimal style, Poppins font, pill badges, and specific color codes
- [Worker performance reports](mem://features/reporting/worker-performance-reports-v14) — PDF export via window.print() on iframe with precise margins
- [Navigation organization](mem://ui/navigation-and-structural-organization-v7) — Structural syncing via URL parameters and mobile layout rules
- [Approval flow](mem://features/control-incidencias/approval-and-notification-flow) — Approval logic that moves items to 'Tareas' and fires realtime notifications
- [Analysis-first gating](mem://features/control-incidencias/analysis-first-gating-v1) — All legal fields locked until AI analysis exists; reset button clears for fresh cycle
- [AI prompts editor](mem://features/control-incidencias/ai-prompts-editor-v1) — Admin can edit/version/toggle AI prompts from the webapp; overrides are appended (never replace) to base hardcoded prompts
- [Legal doc confidentiality](mem://features/control-incidencias/legal-document-confidentiality-v1) — Documento al trabajador prohíbe mencionar propuestas internas previas o comparaciones administrativas
- [Legal doc image reposition v2](mem://features/control-incidencias/legal-document-image-reposition-v1) — Modo editar imagen (arrastrar + zoom rueda/botones + voltear H/V + reset) usando `style.transform` inline sobre `.evidence-image`
- [Legal doc block editor](mem://features/control-incidencias/legal-document-block-editor-v1) — Manual drag-drop block editor (reorder, margins, size) without AI, persists via data-block-* attributes
- [Convenio article citation](mem://features/control-incidencias/convenio-article-citation-rules) — Faltas tipificadas siempre Art. 50.X.letra; Art. 49 solo principios 1-5 sin letra; sanciones Art. 51.a/b/c
- [Bulk scan split](mem://features/control-incidencias/bulk-scan-split-system-v1) — Reparto IA de PDF firmado masivo: split view con visor embebido, chat correctivo y few-shot persistente desde correcciones previas
