# Plan de Refactor — vnvacaciones / VerdNatura HRMS
> **Versión:** 3.1 (Fase 0 completada, M-AUTH.1 auditado) | **Última actualización:** 2026-05-18
> **Metodología:** Micro-compromisos atómicos — un commit por tarea, confirmación antes de cualquier cambio

---

## Contexto real del sistema

Esto no es una app de vacaciones. Es un **HRMS completo** con:
- **149.484 líneas** de frontend (React + Vite + TypeScript)
- **51.800 líneas** de Edge Functions (Deno)
- **13 módulos de negocio** activos
- **28 Edge Functions** desplegadas (2 mega-ficheros: admin-operations 17k, incidencias-operations 13k)
- **0 tests** automatizados

---

## Reglas inamovibles

1. **Auth custom es sagrada.** `manager-auth` y `worker-auth` con BcryptJS no se tocan salvo task explícita.
2. **Nunca `auth.users` de Supabase.** Rompe el sistema.
3. **Confirmación antes de cualquier cambio.** Solo lectura/análisis hasta que se apruebe explícitamente.
4. **Un commit por micro-tarea.** Nunca mezclar módulos en un mismo commit.
5. **Verificación funcional antes de mergear.** Cada módulo se prueba manualmente en local antes de pasar al siguiente.
6. **Extender el patrón existente.** `src/modules/control-incidencias/` ya existe con estructura correcta. Es el estándar a replicar.
7. **Frontend y backend en paralelo.** Cuando se toca un módulo de frontend, se hace el split de su Edge Function correspondiente en el mismo sprint.

---

## Nota: TypeScript viniendo de C#

La transición es de las más suaves que existen. Equivalencias directas:

| C# | TypeScript |
|---|---|
| `interface IWorker { }` | `interface Worker { }` |
| `class WorkerService` | `workerService` (objeto o clase, pero se usa más objeto) |
| `Task<T>` / `async Task` | `Promise<T>` / `async function` |
| `IEnumerable<T>` | `T[]` o `readonly T[]` |
| `Dictionary<K,V>` | `Record<K, V>` o `Map<K, V>` |
| `null` / `Nullable<T>` | `T \| null` o `T \| undefined` |
| `enum Status { ... }` | `type Status = 'pending' \| 'approved' \| 'rejected'` (unión de literales) |
| `Result<T, E>` (LanguageExt) | `{ data: T; error: null } \| { data: null; error: E }` |
| Genéricos `<T>` | Genéricos `<T>` (sintaxis idéntica) |

**Diferencia clave:** TS es estructural, C# es nominal. Si un objeto tiene las propiedades de un interface, TypeScript lo acepta sin que declares explícitamente que lo implementa.

---

## Arquitectura objetivo

```
src/
├── modules/                          ← PATRÓN A REPLICAR (ya existe en control-incidencias)
│   ├── auth/
│   │   ├── context/AuthContext.tsx
│   │   ├── hooks/useAuth.ts
│   │   └── services/auth.service.ts
│   ├── vacaciones/
│   ├── labor/
│   ├── incidencias/                  ← YA EXISTE (extender)
│   ├── candidaturas/
│   ├── operativa/
│   ├── invoice/
│   ├── consulta/
│   ├── psico/
│   ├── justificantes/
│   ├── admin/
│   ├── balance/
│   └── workers/
├── shared/
│   ├── components/                   ← DataTable, StatusBadge, ConfirmDialog, PageLayout
│   ├── hooks/                        ← useToast, usePagination, useFilters
│   └── utils/                        ← fecha, formato, validación
├── lib/
│   ├── supabase.ts                   ← Singleton cliente (único punto de entrada)
│   ├── database.types.ts             ← Auto-generado por Supabase CLI
│   ├── routes.ts                     ← Constantes de rutas tipadas
│   └── i18n/                         ← Extraído de useLanguage.tsx (2.067 líneas → JSON)
├── pages/                            ← Solo orquestación, sin lógica de negocio
├── integrations/supabase/            ← Mantener tal cual (auto-generado)
└── components/ui/                    ← shadcn, tocar lo mínimo

supabase/functions/
├── _shared/                          ← NUEVO: código común entre functions
│   ├── cors.ts
│   ├── auth.ts
│   └── response.ts
├── manager-auth/                     ← SAGRADA, no tocar
├── worker-auth/                      ← SAGRADA, no tocar
├── admin-workers/                    ← NUEVO (split de admin-operations)
├── admin-managers/                   ← NUEVO (split de admin-operations)
├── admin-departments/                ← NUEVO (split de admin-operations)
├── admin-schedules/                  ← NUEVO (split de admin-operations)
├── admin-calendars/                  ← NUEVO (split de admin-operations)
├── admin-teams/                      ← NUEVO (split de admin-operations)
├── admin-vacations/                  ← NUEVO (split de admin-operations)
├── admin-labor/                      ← NUEVO (split de admin-operations)
├── admin-operativa/                  ← NUEVO (split de admin-operations)
├── admin-jobs/                       ← NUEVO (split de admin-operations)
├── admin-system/                     ← NUEVO (split de admin-operations)
└── [resto de functions sin cambios]
```

### Patrón de módulo frontend estándar
```
modules/<nombre>/
├── components/      ← UI específica del módulo
├── hooks/           ← useXxxList, useXxxActions, useXxxForm
├── services/        ← xxx.service.ts (queries Supabase, sin React)
├── types/           ← tipos del dominio
└── index.ts         ← exports públicos del módulo
```

### Patrón de Edge Function dividida
```
supabase/functions/admin-<dominio>/
└── index.ts         ← Solo los handlers de ese dominio + import de _shared
```

---

## FASE 0 — Fundación (prerequisito de todo lo demás)

> Sin esta fase, el resto construye sobre arena. La más corta pero la más crítica.

### ✅ F0.1 — Eliminar artefactos Lovable
- [x] Eliminado plugin `lovable-tagger` de `vite.config.ts` y `package.json`
- [x] Corregido bug silencioso en array de plugins (`mode === "development"` residual)
- [x] Eliminado comentario autogenerado de `client.ts`

### ✅ F0.2 — Singleton cliente Supabase
- [x] Singleton ya existía en `src/integrations/supabase/client.ts` — correcto, sin duplicados
- [x] Corregida inconsistencia: `.env` usaba `VITE_SUPABASE_ANON_KEY`, `client.ts` leía `VITE_SUPABASE_PUBLISHABLE_KEY`
- [x] Unificado a `VITE_SUPABASE_PUBLISHABLE_KEY` en ambos ficheros

### ✅ F0.3 — Tipos generados actualizados
- [x] `src/integrations/supabase/types.ts` (7.221 líneas) verificado — generado con CLI reciente
- [x] Añadido script `"types:gen"` en `package.json`
- [x] Añadido script `"lint:fix"` en `package.json`

### ✅ F0.4 — Configuración de linting
- [x] Activada regla `no-unused-vars` (estaba en `"off"`) → modo `warn` con patrón `^_`
- [x] Añadida regla `no-explicit-any` explícita en modo `warn`
- [x] Auditado: 1.939 problemas iniciales → 87 errores reales + ~2.300 warnings progresivos
- [x] Ejecutado `lint:fix` → 54 casos `prefer-const` corregidos automáticamente

### ✅ F0.5 — Instalar Vitest
- [x] Instalado: `vitest@4.1.6`, `@testing-library/react@16.3.2`, `@testing-library/user-event@14.6.1`, `jsdom`, `@testing-library/jest-dom`
- [x] Creado `vitest.config.ts` con entorno `jsdom` y alias `@/`
- [x] Creado `src/test/setup.ts`
- [x] Verificado: `npm run test:run` → exit code 0 ✓

### ✅ F0.6 — Scaffolding de `_shared` para Edge Functions
- [x] Creado `supabase/functions/_shared/cors.ts`
- [x] Creado `supabase/functions/_shared/response.ts` (ok, error, unauthorized, notFound, serverError)
- [x] Creado `supabase/functions/_shared/auth.ts` (getAuthenticatedClient, getServiceClient)
> _Equivalente C#: una clase estática `ApiResponse` + middleware de auth. Aquí son módulos Deno importados._

---

## FASE 1 — Módulo AUTH

**Archivos afectados:** Estado de sesión disperso por páginas, EF `manager-auth` (1.130) y `worker-auth` (569)
**EF implicadas:** Ninguna nueva — las auth EF se auditan pero NO se refactorizan salvo bug explícito.

### ✅ M-AUTH.1 — Auditoría del flujo actual
**Hallazgo: el sistema tiene 3 mecanismos de auth distintos, no 2.**

**1. Auth de Manager** → `src/hooks/useManagerAuth.tsx`
- ✅ Ya implementado con Context + Provider + Hook — arquitectura correcta
- ✅ Usa `supabase.functions.invoke('manager-auth')`, nunca `auth.signIn()`
- ✅ Sesión en localStorage/sessionStorage con token propio
- ✅ Validación periódica cada 5 min + timeout de inactividad 2h
- Acción: mover a `modules/auth/` sin reescribir

**2. Auth de Worker** → dispersa en múltiples páginas de login
- ❌ Sin hook centralizado — lógica inline en cada página
- ⚠️ `WorkerCalendarLogin.tsx` usa `supabase.auth.getSession()` — mezcla auth nativa
- Páginas afectadas: `WorkerCalendarLogin`, `WorkerScheduleLogin`, `JustificantesForm`, `WorkerEntry`
- Pendiente aclarar: ¿`WorkerCalendarLogin` usa Supabase nativo intencionalmente?

**3. Auth de Admin** → `src/pages/AdminLogin.tsx`
- Usa `supabase.from('user_roles')` — tercer sistema independiente
- Pendiente aclarar: ¿es acceso técnico interno o lo usan usuarios de negocio?

### M-AUTH.2 — Mover useManagerAuth a módulo
- [ ] Mover `src/hooks/useManagerAuth.tsx` → `src/modules/auth/hooks/useManagerAuth.tsx`
- [ ] Actualizar todos los imports (búsqueda global) → confirmar antes de ejecutar
- [ ] **⚠️ Pendiente respuesta sobre AdminLogin y WorkerCalendarLogin antes de continuar**

### M-AUTH.3 — Centralizar auth de Worker
- [ ] ⏸️ Bloqueado hasta aclarar si `WorkerCalendarLogin` usa Supabase nativo intencionalmente
- [ ] Crear hook `useWorkerAuth` centralizado una vez aclarado el flujo

### M-AUTH.4 — PrivateRoute por rol
- [ ] Proponer `PrivateRoute` que lee de `useManagerAuth()` / `useWorkerAuth()`
- [ ] Verificar: login manager ✓ | login worker ✓ | logout ✓ | refresh ✓

---

## FASE 2 — Infraestructura transversal

### M-I18N — Desmantelar `useLanguage.tsx` (2.067 líneas)
> Un hook con 2k líneas de traducciones hardcodeadas. Equivalente C#: tener todas las `resx` concatenadas en un `static class`.

- [ ] **I18N.1** Auditar estructura interna: ¿objeto gigante? ¿switch? ¿funciones por clave?
- [ ] **I18N.2** Proponer extracción a `src/lib/i18n/es.json` (+ `en.json` si hay multiidioma)
- [ ] **I18N.3** Proponer hook `useTranslation()` ligero → **confirmar antes de escribir**
- [ ] **I18N.4** Sustituir importaciones de `useLanguage` → `useTranslation` (búsqueda global, confirmar antes)

### M-SHARED — Componentes compartidos
- [ ] **SH.1** Proponer `DataTable` genérica tipada → confirmar diseño
- [ ] **SH.2** Proponer `StatusBadge` para estados → confirmar
- [ ] **SH.3** Proponer `ConfirmDialog` reutilizable → confirmar
- [ ] **SH.4** Proponer `PageLayout` por rol → confirmar

### M-ROUTES — Rutas tipadas
- [ ] Auditar `App.tsx` o equivalente: mapear todas las rutas existentes
- [ ] Proponer `src/lib/routes.ts` con constantes `ROUTES.*` → confirmar antes de crear

---

## FASE 3 — Módulos de negocio + split de Edge Functions en paralelo

> Cada módulo = rama git separada. El split de EF va en la **misma rama** que el módulo frontend.
> Patrón base: `src/modules/control-incidencias/` (ya existe).

---

### MOD-01 — VACACIONES
**Frontend:** `pages/AnnualCalendar.tsx` (2.656), `pages/DepartmentCalendar.tsx` (906)
**EF a crear (split de admin-operations):**
- `admin-vacations` → getVacationRequests, deleteVacationRequest, updateVacationRequestDates, updateVacationRequestStatus, updateWorkerVacationDays, updateWorkerVacationAdjustment, removeVacationFromCalendar, getWorkersOnVacation, sendVacationEmail, getGlobalFreeDaysSettings, updateGlobalFreeDaysSettings, getGlobalFreeDaysImpactPreview, updateRequestStatus
- `admin-calendars` → todos los handlers de calendarios personales, modificaciones, firmas y excepciones de días
**EF propias ya existentes:** `submit-vacation-request` (2.272), `annual-calendar-operations` (1.740), `send-vacation-notification` (1.037)

- [ ] **VAC.1** Auditar flujo completo: estados, quién aprueba, reglas de negocio
- [ ] **VAC.2** Proponer `modules/vacaciones/services/vacaciones.service.ts` → confirmar
- [ ] **VAC.3** Proponer hooks: `useVacationRequests()`, `useVacationActions()`, `useAnnualCalendar()`
- [ ] **VAC.4** Dividir `AnnualCalendar.tsx` (2.656) → componentes < 200 líneas
- [ ] **VAC.5-EF** Extraer handlers de vacaciones de `admin-operations` → nueva `admin-vacations/`
- [ ] **VAC.6-EF** Extraer handlers de calendarios → nueva `admin-calendars/`
- [ ] **VAC.7-EF** Refactor `submit-vacation-request`: extraer validaciones a funciones nombradas
- [ ] Verificar: ver calendario ✓ | solicitar ✓ | aprobar/rechazar ✓ | notificación ✓

---

### MOD-02 — ADMIN / WORKERS
**Frontend:** `pages/WorkerGroupsAdmin.tsx` (4.586), `pages/ManagersAdmin.tsx` (1.326), `pages/AdminDashboard.tsx` (1.066), `admin/TeamConfiguratorTab.tsx` (1.963)
**EF a crear (split de admin-operations):**
- `admin-workers` → ~28 actions de CRUD workers, búsqueda, importación, comentarios, perfil, historial
- `admin-managers` → createManager, deleteManager, blockManager, getManagers, updateManagerDepartment, updateManagerDepartments, updateManagerCandidaturasOnly, getAllResponsables
- `admin-departments` → ~22 actions de CRUD departamentos, turnos, alias de roles, correcciones
- `admin-teams` → ~38 actions de equipos, labels, grupos de intercambio, configuración de equipos, backups

- [ ] **ADM.1** Auditar `WorkerGroupsAdmin.tsx` (4.586): identificar secciones distintas
- [ ] **ADM.2** Proponer `modules/admin/services/workers.service.ts` → confirmar
- [ ] **ADM.3** Proponer `modules/admin/services/managers.service.ts` → confirmar
- [ ] **ADM.4** Crear hook `useWorkers()` con filtros y paginación
- [ ] **ADM.5** Dividir `WorkerGroupsAdmin.tsx` → componentes por sección (grupos, intercambios, config)
- [ ] **ADM.6** Dividir `TeamConfiguratorTab.tsx` (1.963)
- [ ] **ADM.7-EF** Extraer handlers workers → nueva `admin-workers/`
- [ ] **ADM.8-EF** Extraer handlers managers → nueva `admin-managers/`
- [ ] **ADM.9-EF** Extraer handlers departamentos → nueva `admin-departments/`
- [ ] **ADM.10-EF** Extraer handlers equipos/grupos → nueva `admin-teams/`
- [ ] Verificar: CRUD workers ✓ | CRUD managers ✓ | departamentos ✓ | equipos ✓ | intercambios ✓

---

### MOD-03 — LABOR (horarios y control de presencia)
**Frontend:** `labor/LaborSchedulesTab.tsx` (6.121 🔴), `labor/ScheduleRulesPanel.tsx` (2.131), `labor/LaborDashboardTab.tsx` (1.463), `labor/PersonalSchedulesPanel.tsx` (1.466), `labor/ClockControlPanel.tsx` (897), `labor/SalixClockPanel.tsx` (733)
**EF a crear (split de admin-operations):**
- `admin-schedules` → ~26 actions de horarios semanales, reglas, colores, rotaciones, horarios personales
- `admin-labor` → getLaborDashboardData, getWorkforceForDay, getSalixClockEntries, getSalixAvailableDates, importSalixClock, getPerformanceDashboard, getPerformanceThresholds, upsertPerformanceThreshold, getWorkerPerformanceHistory, importPerformanceCSV
**EF propias ya existentes:** `schedule-ai-rules` (424), `clock-operations` (312), `send-labor-alert` (303)

- [ ] **LAB.1** Auditar `LaborSchedulesTab.tsx` (6.121): identificar responsabilidades distintas (¿tabs? ¿secciones?)
- [ ] **LAB.2** Proponer `modules/labor/services/schedules.service.ts` → confirmar
- [ ] **LAB.3** Proponer `modules/labor/services/rules.service.ts` → confirmar
- [ ] **LAB.4** Proponer `modules/labor/services/clock.service.ts` → confirmar
- [ ] **LAB.5** Crear hooks: `useSchedules()`, `useClockControl()`, `useLaborRules()`
- [ ] **LAB.6** Dividir `LaborSchedulesTab.tsx` → mínimo 6 componentes
- [ ] **LAB.7** Dividir `ScheduleRulesPanel.tsx` (2.131)
- [ ] **LAB.8-EF** Extraer handlers de horarios → nueva `admin-schedules/`
- [ ] **LAB.9-EF** Extraer handlers de labor/Salix/performance → nueva `admin-labor/`
- [ ] Verificar: ver horarios ✓ | editar reglas ✓ | fichaje ✓ | Salix ✓ | performance ✓

---

### MOD-04 — INCIDENCIAS (ya parcialmente modularizado)
**Frontend:** `components/incidencias/` (varios ficheros 700-3.389 líneas), `modules/control-incidencias/` (ya existe ✅)
**EF:** `incidencias-operations` (13.591 🔴) → auditar y dividir en paralelo
**EF propias ya existentes:** `control-incidencias-ai` (2.843), `incidencias-bulk-scan-split` (482), `incidencias-automation-cron` (461), `incidencias-analytics-cron` (307), `incidencias-push-notify` (226), `incidencias-ai-prompts` (232)

- [ ] **INC.1** Auditar qué hay en `modules/control-incidencias/` vs qué sigue en `components/incidencias/`
- [ ] **INC.2** Migrar componentes de `components/incidencias/` al módulo existente
- [ ] **INC.3** Dividir `AdminTareasTab.tsx` (3.389) y `AdminPropuestasTab.tsx` (2.979)
- [ ] **INC.4** Verificar integración con módulo IA (`modules/control-incidencias/ia/`)
- [ ] **INC.5-EF** Auditar `incidencias-operations/index.ts` (13k): mapear todas las actions
- [ ] **INC.6-EF** Proponer split por subdominio (disciplina, legal, analytics, notificaciones) → confirmar
- [ ] **INC.7-EF** Ejecutar split una vez confirmado
- [ ] Verificar: crear incidencia ✓ | gestionar ✓ | analytics ✓ | notificaciones ✓ | IA ✓

---

### MOD-05 — WORKER (vista empleado)
**Frontend:** `pages/WorkerEntry.tsx` (1.957), `pages/WorkerProfile.tsx` (886), `pages/WorkerPersonalCalendar.tsx` (827), `pages/WorkerPersonalSchedule.tsx` (740), `pages/WorkerCalendarModification.tsx` (1.698)
**EF propia ya existente:** `worker-personal` (1.032) — revisar pero no es crítico dividir

- [ ] **WRK.1** Auditar `WorkerEntry.tsx` (1.957): identificar secciones
- [ ] **WRK.2** Proponer `modules/workers/hooks/useWorkerProfile()` → confirmar
- [ ] **WRK.3** Proponer `modules/workers/hooks/usePersonalCalendar()` → confirmar
- [ ] **WRK.4** Dividir `WorkerEntry.tsx` → componentes por tab/sección
- [ ] **WRK.5** Dividir `WorkerCalendarModification.tsx` (1.698)
- [ ] Verificar: perfil ✓ | calendario personal ✓ | modificar calendarios ✓

---

### MOD-06 — JUSTIFICANTES
**Frontend:** `pages/JustificantesAdmin.tsx` (1.845), `pages/JustificantesForm.tsx` (1.008), `components/operativa/OperativaJustificantesTab.tsx` (667)
**EF propia ya existente:** `justificantes-operations` (2.496)
**EF a crear (split de admin-operations):**
- `admin-operativa` → sendOperativaAlta/Anticipo/Despido/Justificante/Nspp, getOperativaHistory, configs de operativa

- [ ] **JUS.1** Proponer `modules/justificantes/services/justificantes.service.ts` → confirmar
- [ ] **JUS.2** Crear hooks: `useJustificantes()`, `useJustificanteForm()`
- [ ] **JUS.3** Dividir `JustificantesAdmin.tsx` y `JustificantesForm.tsx`
- [ ] **JUS.4-EF** Extraer handlers de operativa → nueva `admin-operativa/`
- [ ] Verificar: crear ✓ | admin ✓ | historial ✓ | envío operativa ✓

---

### MOD-07 — CANDIDATURAS
**Frontend:** `components/candidaturas/EncargadoEntrevistasView.tsx` (718), `components/candidaturas/VacantesTab.tsx` (669)
**EF propias ya existentes:** `interviews-operations` (345), `process-application` (309), `submit-application` (124)
**EF a crear (split de admin-operations):**
- `admin-jobs` → create/delete/list/toggle/update job positions, list/update applications, get_cv_signed_url, extractAltaDataFromDocument, extractFromWhatsappScreenshot, identifyWorkerFromDocument

- [ ] **CAN.1** Proponer `modules/candidaturas/services/` → confirmar
- [ ] **CAN.2** Crear hooks: `useVacantes()`, `useEntrevistas()`, `useCandidatos()`
- [ ] **CAN.3** Refactorizar componentes
- [ ] **CAN.4-EF** Extraer handlers de jobs/aplicaciones → nueva `admin-jobs/`
- [ ] Verificar: vacantes ✓ | entrevistas ✓ | candidatos ✓ | CV ✓

---

### MOD-08 — PSICO TEST
**Frontend:** `pages/PsicoTestAdmin.tsx` (1.602), `pages/PsicoTest.tsx` (705)
**EF propia ya existente:** `psico-test-operations` (1.563)

- [ ] **PSI.1** Proponer `modules/psico/services/psico.service.ts` → confirmar
- [ ] **PSI.2** Crear hooks: `usePsicoTest()`, `usePsicoAdmin()`
- [ ] **PSI.3** Dividir `PsicoTestAdmin.tsx` (1.602)
- [ ] Verificar: test ✓ | resultados ✓ | admin ✓

---

### MOD-09 — ANÁLISIS INTERNO / RECLAMACIONES
**Frontend:** `pages/AnalisisInterno.tsx` (1.946), `pages/AnalisisReclamaciones.tsx` (1.232)
**EF:** Sin EF propia identificada — probablemente llama a `admin-operations` directamente

- [ ] **ANA.1** Auditar qué EF usa: ¿admin-operations? ¿otra?
- [ ] **ANA.2** Proponer `modules/analisis/services/` → confirmar
- [ ] **ANA.3** Crear hooks con React Query
- [ ] **ANA.4** Dividir páginas de análisis

---

### MOD-10 — INVOICE MATCHING
**Frontend:** `components/invoice/InvoiceMatchingPanel.tsx` (1.043)
**EF propia ya existente:** `invoice-matching` (819)

- [ ] **INV.1** Proponer `modules/invoice/services/invoice.service.ts` → confirmar
- [ ] **INV.2** Crear hook `useInvoiceMatching()`
- [ ] **INV.3** Dividir `InvoiceMatchingPanel.tsx`
- [ ] Verificar: matching ✓ | histórico ✓

---

### MOD-11 — BALANCE DE HORAS
**Frontend:** `components/balance/` (pendiente auditar)
**EF propia ya existente:** `hour-balance-operations` (500)

- [ ] **BAL.1** Auditar archivos en `components/balance/`
- [ ] **BAL.2** Proponer `modules/balance/services/balance.service.ts` → confirmar
- [ ] **BAL.3** Crear hook `useHourBalance(workerId, period)`

---

### MOD-12 — OPERATIVA (altas administrativas)
**Frontend:** `components/operativa/OperativaAltasTab.tsx` (1.010)
**EF:** Cubierta por `admin-operativa` en MOD-06

- [ ] **OPE.1** Auditar módulo completo
- [ ] **OPE.2** Proponer services y hooks → confirmar
- [ ] **OPE.3** Refactorizar componentes

---

### MOD-13 — CONSULTA / CSV / PÚBLICO
**Frontend:** `components/consulta/ConsultaSchedulesPanel.tsx` (1.253), `components/CSVImportPanel.tsx` (2.438), `pages/PublicCalendarPdf.tsx` (1.233), `pages/PublicVacationForm.tsx` (1.411), `pages/PublicGroups.tsx` (699)
**EF propias ya existentes:** `public-actions` (834)
**EF a crear (split de admin-operations):**
- `admin-system` → getAuditLogs, getBackupHistory, regenerateBackupUrl, updateAppSettings, calculateRowCount, syncEmailsToIncidencias, getAssignments

- [ ] **CON.1** Dividir `CSVImportPanel.tsx` (2.438) → parser separado de UI
- [ ] **CON.2** Refactorizar vistas públicas
- [ ] **CON.3** Auditar y dividir `ConsultaSchedulesPanel.tsx`
- [ ] **CON.4-EF** Extraer handlers de sistema → nueva `admin-system/`

---

## FASE 4 — Calidad y producción

### QA.1 — Error handling global
- [ ] Proponer `ErrorBoundary` en raíz → confirmar
- [ ] Estandarizar tipo `Result<T, AppError>` en todos los services
- [ ] Asegurar uso consistente de `sonner` para toasts
> _Equivalente C#: `Result<T, Error>` de LanguageExt o `FluentResults`. Mismo concepto._

### QA.2 — Tests
- [ ] Tests unitarios de services (sin React, lógica pura — equivalente a unit tests en xUnit)
- [ ] Tests de hooks con `@testing-library/react`
- [ ] Al menos 1 test de integración por módulo crítico (auth, vacaciones, labor)

### QA.3 — Limpieza de dependencias
- [ ] Confirmar eliminación de `lovable-tagger` (ya hecho en F0.1)
- [ ] Evaluar `@ffmpeg/ffmpeg` (30MB+): ¿lazy-load o mover a EF?
- [ ] Evaluar `next-themes` (no es Next.js)
- [ ] Ejecutar `npx depcheck` y limpiar no usadas → confirmar antes de eliminar

### PROD.1 — Build de producción
- [ ] Ejecutar `npm run build` → documentar errores TypeScript
- [ ] Auditar bundle: `npx vite-bundle-visualizer`
- [ ] Configurar lazy loading por módulo en el router

### PROD.2 — Variables de entorno
- [ ] Crear `.env.production` apuntando al servidor Linux
- [ ] Verificar que no hay claves hardcodeadas
- [ ] Crear `DEPLOYMENT.md` con todas las variables requeridas

### PROD.3 — Nginx / Docker
- [ ] Crear `nginx.conf`: serve estáticos + proxy a Supabase Kong
- [ ] Crear `Dockerfile` multi-stage (build + nginx)
- [ ] Verificar CORS en Edge Functions para dominio de producción

---

## Tabla de progreso

### Fase 0 — Fundación
| Tarea | Estado | Rama | Fecha |
|-------|--------|------|-------|
| F0.1 Eliminar artefactos Lovable | ✅ Completado | refactor/f0-foundation | 2026-05-18 |
| F0.2 Singleton Supabase | ✅ Completado | refactor/f0-foundation | 2026-05-18 |
| F0.3 Tipos generados | ✅ Completado | refactor/f0-foundation | 2026-05-18 |
| F0.4 Linting | ✅ Completado | refactor/f0-foundation | 2026-05-18 |
| F0.5 Vitest | ✅ Completado | refactor/f0-foundation | 2026-05-18 |
| F0.6 EF _shared helpers | ✅ Completado | refactor/f0-foundation | 2026-05-18 |

### Fase 1 — Auth
| Tarea | Estado | Rama | Fecha |
|-------|--------|------|-------|
| M-AUTH.1 Auditoría flujo auth | ✅ Completado | refactor/f1-auth | 2026-05-18 |
| M-AUTH.2 Mover useManagerAuth a módulo | 🔄 En progreso | refactor/f1-auth | — |
| M-AUTH.3 Centralizar auth Worker | ⏸️ Bloqueado | — | — |
| M-AUTH.4 PrivateRoute por rol | ⬜ Pendiente | — | — |

### Fase 2 — Infraestructura transversal
| Tarea | Estado | Rama | Fecha |
|-------|--------|------|-------|
| M-I18N desmantelar useLanguage (2k) | ⬜ Pendiente | — | — |
| M-SHARED componentes comunes | ⬜ Pendiente | — | — |
| M-ROUTES rutas tipadas | ⬜ Pendiente | — | — |

### Fase 3 — Módulos + EF en paralelo
| Módulo | Frontend (líneas) | EF nueva | Estado | Rama | Fecha |
|--------|------------------|----------|--------|------|-------|
| MOD-01 Vacaciones | ~4.000 | admin-vacations, admin-calendars | ⬜ | — | — |
| MOD-02 Admin/Workers | ~8.000 | admin-workers, admin-managers, admin-departments, admin-teams | ⬜ | — | — |
| MOD-03 Labor | ~12.000 | admin-schedules, admin-labor | ⬜ | — | — |
| MOD-04 Incidencias | ~10.000 | split incidencias-operations | ⬜ | — | — |
| MOD-05 Worker empleado | ~5.000 | — | ⬜ | — | — |
| MOD-06 Justificantes | ~3.500 | admin-operativa | ⬜ | — | — |
| MOD-07 Candidaturas | ~2.000 | admin-jobs | ⬜ | — | — |
| MOD-08 PsicoTest | ~2.300 | — | ⬜ | — | — |
| MOD-09 Análisis | ~3.200 | — | ⬜ | — | — |
| MOD-10 Invoice | ~1.800 | — | ⬜ | — | — |
| MOD-11 Balance | ~500 | — | ⬜ | — | — |
| MOD-12 Operativa | ~1.000 | (cubierta por MOD-06) | ⬜ | — | — |
| MOD-13 Consulta/CSV/Público | ~5.000 | admin-system | ⬜ | — | — |

### Fase 4 — Calidad y producción
| Tarea | Estado | Rama | Fecha |
|-------|--------|------|-------|
| QA.1 Error handling global | ⬜ Pendiente | — | — |
| QA.2 Tests (vitest) | ⬜ Pendiente | — | — |
| QA.3 Limpieza dependencias | ⬜ Pendiente | — | — |
| PROD.1 Build producción | ⬜ Pendiente | — | — |
| PROD.2 Variables entorno | ⬜ Pendiente | — | — |
| PROD.3 Nginx / Docker | ⬜ Pendiente | — | — |

---

## Convención de ramas git

```
refactor/f0-foundation
refactor/f1-auth
refactor/f2-i18n
refactor/f2-shared-components
refactor/f2-routes
refactor/mod-01-vacaciones
refactor/mod-02-admin
refactor/mod-03-labor
refactor/mod-04-incidencias
refactor/mod-05-worker
refactor/mod-06-justificantes
refactor/mod-07-candidaturas
refactor/mod-08-psico
refactor/mod-09-analisis
refactor/mod-10-invoice
refactor/mod-11-balance
refactor/mod-12-operativa
refactor/mod-13-consulta
refactor/f4-quality-prod
```
