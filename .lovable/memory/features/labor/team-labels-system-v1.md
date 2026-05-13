---
name: Team labels (lugar/función rotable)
description: Sistema de etiquetas asignables y rotables a equipos del horario semanal, visibles en el PDF
type: feature
---

## Modelo
- Tabla `worker_team_labels` (catálogo por departamento): `id, department_id, name, color, icon, sort_order`. Único `(department_id, lower(name))`. RLS: select abierto autenticado, manage solo admin.
- Columna `worker_teams.label_id` (FK a `worker_team_labels`, ON DELETE SET NULL). Una etiqueta por equipo.

## Edge actions (`admin-operations`)
- `listTeamLabels { departmentId }`
- `createTeamLabel { departmentId, name, color }`
- `updateTeamLabel { labelId, name?, color?, icon?, sortOrder? }`
- `deleteTeamLabel { labelId }`
- `assignTeamLabel { teamId, labelId|null }`
- `bulkAssignTeamLabels { assignments: [{ teamId, labelId|null }] }`
- `getAllWorkerTeams` y `getDeptWorkerTeams` ya devuelven `label_id`.

## UI Admin (`LaborSchedulesTab.tsx`)
- Botón Tag junto al selector de departamento → modal `LabelManagerBody` (crear/editar/borrar, paleta sobria de 8 colores).
- Botón RefreshCw "Rotar etiquetas" (solo si hay ≥1 etiqueta y ≥2 grupos): rota label_id un paso entre `parentGroups` (la del último pasa al primero).
- Cada fila de equipo (single-team) y cada cabecera de grupo multi-team tienen un chip pequeño `renderLabelChip({ teamId | parentGroup })` que abre popover con catálogo + "Sin etiqueta" + acceso al gestor.
- Multi-team aplica la asignación a todos los equipos del grupo via `bulkAssignTeamLabels`.
- Optimistic updates con revert vía `loadTeamLabels()`.

## PDF (`generatePdf` en mismo archivo)
- En `renderTeamsWithColor` cada pill se envuelve en un div vertical: pill + `<div>` con la etiqueta debajo.
- Etiqueta: 6.5px, uppercase, letter-spacing 0.08em, weight 600, punto 3px del color de la etiqueta a la izquierda. Sin fondo ni borde.
- Resolución: si todo el grupo comparte la misma label → se usa para `parentGroup` y para "X de Group" partial labels; si son equipos individuales se busca por `teamName`.
- Leyenda inferior añade fila "Lugares / Funciones" con las etiquetas usadas esa semana (mini-pills 7.5px uppercase).

## Filosofía
- Una sola etiqueta por equipo (rotación = cambiar `label_id`, no crear nuevas).
- Apilado vertical en PDF para no romper compactness con muchos equipos por celda.
