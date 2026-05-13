# Memory: features/control-incidencias/responsable-role-scope-v5

El rol 'responsable' (encargado de equipo) está restringido a visualizar y gestionar únicamente a los trabajadores de los equipos que lidera. La resolución de equipos se hace mediante `worker_teams.responsable_worker_id = managers.worker_id` (equipos que lidera), NO mediante `managers.worker_team_id` (equipo al que pertenece). Esto se aplica en:

- **admin-operations** `getManagerWorkerGroups`: busca equipos por `responsable_worker_id`
- **incidencias-operations** `getMyDepartments`: resuelve departamentos desde equipos liderados
- **ManagerDashboard.tsx**: `responsableTeamIdsFromBackend` state captura los IDs del backend
- **useIncidenciasAuth.ts**: usa `responsableTeamIds` del response de `getMyDepartments`

Fallback: si no hay equipos vía `responsable_worker_id`, se usa `managers.worker_team_id`.

Los responsables pueden acceder a su historial de evidencias mediante galería con lightbox y URLs firmadas. En la vista de 'Horarios', su equipo se identifica con un icono de corona y enlaces a Sálix. El modo Preview hereda el rol efectivo y equipos del manager visualizado.
