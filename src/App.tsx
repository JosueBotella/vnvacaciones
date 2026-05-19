import { useEffect } from "react"; 
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ManagerAuthProvider } from "@/modules/auth/hooks/useManagerAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { AppSettingsProvider } from "@/hooks/useAppSettings";
import { AppLockScreen } from "@/components/AppLockScreen";
import { bootstrapNonPersistentSession } from "@/lib/workerSessionPersistence";
import Index from "./pages/Index";
import ManagerLogin from "./pages/ManagerLogin";
import AdminControlPanel from "./pages/AdminControlPanel";
import ManagerDashboard from "./pages/ManagerDashboard";
import ManagersAdmin from "./pages/ManagersAdmin";
import DepartmentsList from "./pages/DepartmentsList";
import DepartmentCalendar from "./pages/DepartmentCalendar";
import PersonalCalendarEdit from "./pages/PersonalCalendarEdit";
import PublicVacationForm from "./pages/PublicVacationForm";
import WorkerEntry from "./pages/WorkerEntry";
import AnnualCalendar from "./pages/AnnualCalendar";
import WorkerGroupsAdmin from "./pages/WorkerGroupsAdmin";
import PublicCalendarPdf from "./pages/PublicCalendarPdf";
import PublicGroups from "./pages/PublicGroups";
import ResetPassword from "./pages/ResetPassword";
import ExchangeConfirmation from "./pages/ExchangeConfirmation";
import AdminVacationRequest from "./pages/AdminVacationRequest";
import NotFound from "./pages/NotFound";
import WorkerProfile from "./pages/WorkerProfile";
import LaborModule from "./pages/LaborModule";
import WorkerPersonalCalendar from "./pages/WorkerPersonalCalendar";
import WorkerPersonalSchedule from "./pages/WorkerPersonalSchedule";
import WorkerCalendarLogin from "./pages/WorkerCalendarLogin";
import WorkerScheduleLogin from "./pages/WorkerScheduleLogin";
import JustificantesDisabled from "./pages/JustificantesDisabled";
// DISABLED: Justificantes module - routes redirect to disabled page
// import JustificantesForm from "./pages/JustificantesForm";
// import JustificantesAdmin from "./pages/JustificantesAdmin";
// import JustificantesLogin from "./pages/JustificantesLogin";
// import JustificantesAdicional from "./pages/JustificantesAdicional";
import AnalisisInterno from "./pages/AnalisisInterno";
import AnalisisInternoLogin from "./pages/AnalisisInternoLogin";
import WorkerCalendarModification from "./pages/WorkerCalendarModification";
import WorkerCalendarSignature from "./pages/WorkerCalendarSignature";
import PublicLegalDocument from "./pages/PublicLegalDocument";
import PublicLegalDocumentPdf from "./pages/PublicLegalDocumentPdf";
import ConsultaDashboard from "./pages/ConsultaDashboard";
import ConsultaCalendarView from "./pages/ConsultaCalendarView";
import MyGroupPage from "./pages/MyGroupPage";
import BalanceHorasLogin from "./pages/BalanceHorasLogin";
import BalanceHoras from "./pages/BalanceHoras";
import PsicoTestLogin from "./pages/PsicoTestLogin";
import PsicoTest from "./pages/PsicoTest";
import PsicoTestComplete from "./pages/PsicoTestComplete";
import PsicoTestAdmin from "./pages/PsicoTestAdmin";
import PsicoTestAdminLogin from "./pages/PsicoTestAdminLogin";
import ControlIncidencias from "./pages/ControlIncidencias";
import IncidenciasLogin from "./pages/IncidenciasLogin";
import SetupPassword from "./pages/SetupPassword";

import ClockIn from "./pages/ClockIn";
import InvoiceMatching from "./pages/InvoiceMatching";
import AnalisisReclamaciones from "./pages/AnalisisReclamaciones";
import AnalisisReclamacionesLogin from "./pages/AnalisisReclamacionesLogin";
import ApplicationForm from "./pages/ApplicationForm";
import CandidaturasLogin from "./pages/CandidaturasLogin";
import CandidaturasEncargado from "./pages/CandidaturasEncargado";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    bootstrapNonPersistentSession();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ManagerAuthProvider>
          <AppSettingsProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <AppLockScreen />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/login" element={<ManagerLogin />} />
                  <Route path="/admin/login" element={<ManagerLogin />} />
                  <Route path="/admin" element={<AdminControlPanel />} />
                  <Route path="/admin/managers" element={<ManagersAdmin />} />
                  <Route path="/admin/departments" element={<DepartmentsList />} />
                  <Route path="/admin/departments/:id" element={<DepartmentCalendar />} />
                  <Route path="/admin/personal-calendars/:id" element={<PersonalCalendarEdit />} />
                  <Route path="/admin/annual-calendar" element={<AnnualCalendar />} />
                  <Route path="/admin/groups" element={<WorkerGroupsAdmin />} />
                  <Route path="/admin/worker/:workerId" element={<WorkerProfile />} />
                  <Route path="/admin/worker-groups" element={<WorkerGroupsAdmin />} />
                  {/* Labor Module */}
                  <Route path="/laboral" element={<LaborModule />} />
                  {/* Justificantes Module - DISABLED */}
                  <Route path="/justificantes" element={<JustificantesDisabled />} />
                  <Route path="/justificantes/login" element={<JustificantesDisabled />} />
                  <Route path="/justificantes/adicional" element={<JustificantesDisabled />} />
                  <Route path="/admin/justificantes" element={<JustificantesDisabled />} />
                  <Route path="/admin/vacation-request" element={<AdminVacationRequest />} />
                  {/* Análisis Interno - Admin only */}
                  <Route path="/analisis-interno/login" element={<AnalisisInternoLogin />} />
                  <Route path="/analisis-interno" element={<AnalisisInterno />} />
                  <Route path="/manager" element={<ManagerDashboard />} />
                  <Route path="/manager/annual-calendar" element={<AnnualCalendar />} />
                  <Route path="/manager/groups" element={<WorkerGroupsAdmin />} />
                  {/* Consulta (read-only) routes */}
                  <Route path="/consulta" element={<ConsultaDashboard />} />
                  <Route path="/consulta/calendar/:departmentId/:year" element={<ConsultaCalendarView />} />
                  {/* Manager-only calendar view - by department slug */}
                  <Route path="/calendario/:departmentSlug" element={<PublicCalendarPdf />} />
                  {/* Manager-only groups view - by department slug */}
                  <Route path="/grupos/:departmentSlug" element={<PublicGroups />} />
                  {/* Worker entry point - unified access for all workers */}
                  <Route path="/vacaciones" element={<WorkerEntry />} />
                  {/* Worker personal pages - require worker auth */}
                  <Route path="/mi-calendario" element={<WorkerPersonalCalendar />} />
                  <Route path="/mi-horario" element={<WorkerPersonalSchedule />} />
                  <Route path="/mi-grupo" element={<MyGroupPage />} />
                  <Route path="/mi-grupo.html" element={<Navigate to="/mi-grupo" replace />} />
                  {/* Worker login pages - dedicated for calendar and schedule */}
                  <Route path="/calendario-login" element={<WorkerCalendarLogin />} />
                  <Route path="/horario-login" element={<WorkerScheduleLogin />} />
                  {/* Password reset page */}
                  <Route path="/reset-password" element={<ResetPassword />} />
                  {/* Setup password page (from welcome email) */}
                  <Route path="/setup-password" element={<SetupPassword />} />
                  {/* Exchange confirmation - public page for employees */}
                  <Route path="/confirmar-intercambio" element={<ExchangeConfirmation />} />
                  {/* Worker calendar modification - admin only */}
                  <Route path="/admin/worker-calendar/:workerId" element={<WorkerCalendarModification />} />
                  {/* Worker calendar signature - public page for workers */}
                  <Route path="/firmar-calendario/:token" element={<WorkerCalendarSignature />} />
                  {/* Public legal document viewer (sanción / amonestación) - emailed to RRHH */}
                  <Route path="/doc/:token" element={<PublicLegalDocument />} />
                  {/* Direct PDF download landing — fires native print dialog immediately */}
                  <Route path="/doc/:token/pdf" element={<PublicLegalDocumentPdf />} />
                  {/* Balance de Horas module - admin only */}
                  <Route path="/balance-horas/login" element={<BalanceHorasLogin />} />
                  <Route path="/balance-horas" element={<BalanceHoras />} />
                  {/* Test Psicotécnico module */}
                  <Route path="/psico-test" element={<PsicoTestLogin />} />
                  <Route path="/psico-test/active" element={<PsicoTest />} />
                  <Route path="/psico-test/complete" element={<PsicoTestComplete />} />
                  <Route path="/admin/psico-test/login" element={<PsicoTestAdminLogin />} />
                  <Route path="/admin/psico-test" element={<PsicoTestAdmin />} />
                  {/* Control de Incidencias */}
                  <Route path="/control-incidencias/login" element={<IncidenciasLogin />} />
                  <Route path="/control-incidencias" element={<ControlIncidencias />} />
                  {/* Cuadre de Facturas */}
                  <Route path="/cuadre-facturas" element={<InvoiceMatching />} />
                  {/* Análisis de Reclamaciones - Admin only */}
                  <Route path="/admin/analisis-reclamaciones/login" element={<AnalisisReclamacionesLogin />} />
                  <Route path="/admin/analisis-reclamaciones" element={<AnalisisReclamaciones />} />
                  {/* Clock-in kiosk for VNH */}
                  <Route path="/clock-in" element={<ClockIn />} />
                  {/* Public application form */}
                  <Route path="/candidatura" element={<ApplicationForm />} />
                  {/* Candidaturas admin login */}
                  <Route path="/admin/candidaturas/login" element={<CandidaturasLogin />} />
                  {/* Candidaturas restricted manager panel (interviews-only) */}
                  <Route path="/candidaturas" element={<CandidaturasEncargado />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </AppSettingsProvider>
        </ManagerAuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
};

export default App;

