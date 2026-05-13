import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Calendar, CheckCircle, XCircle, Clock, LogOut, Copy, Share2,
  ChevronDown, Pencil, Users, ShieldCheck, AlertTriangle, Plus,
  CalendarDays, Timer, Briefcase, MoreHorizontal, FileText, Inbox,
  Fingerprint, FileSearch
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import LoadingPanel from "@/components/LoadingPanel";
import { SkeletonRequestList } from "@/components/SkeletonLoaders";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

import { EmbeddedAnnualCalendar } from "@/components/EmbeddedAnnualCalendar";
import { ManagerBalanceTab } from "@/components/balance/ManagerBalanceTab";
import { ManagerTrialPeriodsTab } from "@/components/labor/ManagerTrialPeriodsTab";
import { ManagerScheduleTab } from "@/components/manager/ManagerScheduleTab";
import { ConsultaSchedulesPanel } from "@/components/consulta/ConsultaSchedulesPanel";
import { LaborWorkforceTab } from "@/components/labor/LaborWorkforceTab";
import { ManagerHomeDashboard, type WorkforceData, type BalanceEntry, type IncStats } from "@/components/manager/ManagerHomeDashboard";
import { ManagerClockEntriesTab } from "@/components/manager/ManagerClockEntriesTab";
import { EncargadoEntrevistasView } from "@/components/candidaturas/EncargadoEntrevistasView";
import { CandidaturasPanel } from "@/components/candidaturas/CandidaturasPanel";

// Incidencias integration
import { EncargadoHistorial } from "@/components/incidencias/EncargadoHistorial";
import { EncargadoNuevaIncidencia } from "@/components/incidencias/EncargadoNuevaIncidencia";
import { EncargadoEquipo } from "@/components/incidencias/EncargadoEquipo";
import { EncargadoAnalytics } from "@/components/incidencias/EncargadoAnalytics";
import { EncargadoSalidaVoluntaria } from "@/components/incidencias/EncargadoSalidaVoluntaria";
import { getPermissions } from "@/modules/control-incidencias/core/permissions";
import type { IncidenciasUserContext, IncidenciasRole } from "@/modules/control-incidencias/core/types";

type ManagerTab = "home" | "incidencias" | "fichadas" | "vacaciones" | "calendars" | "groups" | "schedules" | "plantilla" | "balance" | "trial-periods" | "entrevistas" | "candidaturas";

// Types
type VacationRequest = {
  id: string;
  employee_name: string;
  employee_email: string;
  worker_number: string;
  notes: string | null;
  status: string;
  manager_status: string | null;
  manager_rejection_reason: string | null;
  created_at: string;
  department_id: string;
  is_admin_request?: boolean;
  requested_by_admin_name?: string | null;
  departments: { name: string };
  vacation_request_dates: Array<{ date: string }>;
  worker_team?: { id: string; name: string } | null;
  work_group?: { id: string; name: string; color: string } | null;
};

type Department = { id: string; name: string; public_token: string; slug?: string };
type AnnualCalendar = { id: string; year: number; description: string | null; department_id: string; department_name: string; department_slug: string | null };
type WorkerTeam = { id: string; name: string; department_id: string; department_name: string; work_group_name: string | null; work_group_color: string | null; display_name?: string | null; responsable_worker_id?: string | null };
type Worker = { id: string; name: string; worker_number: string; worker_team_id: string | null; work_group_id: string | null; department_id: string; is_on_leave?: boolean; is_responsable?: boolean; display_name?: string };
type WorkGroup = { id: string; name: string; color: string; department_id: string; sort_order: number };

/* ─── Navigation config ─── */
const primaryTabs: { id: ManagerTab; label: string; shortLabel: string; icon: typeof AlertTriangle }[] = [
  { id: "home", label: "Inicio", shortLabel: "Inicio", icon: Inbox },
  { id: "incidencias", label: "Incidencias", shortLabel: "Incid.", icon: AlertTriangle },
  { id: "fichadas", label: "Fichadas", shortLabel: "Fichad.", icon: Fingerprint },
  { id: "vacaciones", label: "Vacaciones", shortLabel: "Vacac.", icon: FileText },
  { id: "calendars", label: "Calendarios", shortLabel: "Calen.", icon: CalendarDays },
];

const secondaryTabs: { id: ManagerTab; label: string; icon: typeof Users }[] = [
  { id: "groups", label: "Equipos", icon: Users },
  { id: "schedules", label: "Horarios", icon: Clock },
  { id: "plantilla", label: "Plantilla", icon: Briefcase },
  { id: "balance", label: "Horas", icon: Timer },
  { id: "trial-periods", label: "Periodo Prueba", icon: Calendar },
];

// Responsable-specific navigation: Incidencias > Equipo > Horas > Horarios
const responsablePrimaryTabs: { id: ManagerTab; label: string; shortLabel: string; icon: typeof AlertTriangle }[] = [
  { id: "home", label: "Inicio", shortLabel: "Inicio", icon: Inbox },
  { id: "incidencias", label: "Incidencias", shortLabel: "Incid.", icon: AlertTriangle },
  { id: "groups", label: "Equipo", shortLabel: "Equipo", icon: Users },
  { id: "balance", label: "Horas", shortLabel: "Horas", icon: Timer },
];

const responsableSecondaryTabs: { id: ManagerTab; label: string; icon: typeof Users }[] = [
  { id: "schedules", label: "Horarios", icon: Clock },
  { id: "calendars", label: "Calendarios", icon: CalendarDays },
  { id: "trial-periods", label: "Periodo Prueba", icon: Calendar },
];

// Consulta-specific navigation: read-only, all departments
const consultaPrimaryTabs: { id: ManagerTab; label: string; shortLabel: string; icon: typeof AlertTriangle }[] = [
  { id: "groups", label: "Equipos", shortLabel: "Equipos", icon: Users },
  { id: "schedules", label: "Horarios", shortLabel: "Horar.", icon: Clock },
  { id: "balance", label: "Horas", shortLabel: "Horas", icon: Timer },
  { id: "trial-periods", label: "Periodo Prueba", shortLabel: "Prueba", icon: Calendar },
  { id: "candidaturas", label: "Candidaturas", shortLabel: "Cand.", icon: FileSearch },
];

import { DeptPills } from "@/components/DeptPills";
import { DepartmentSearchSelect } from "@/components/DepartmentSearchSelect";

const DEPT_STORAGE_KEY = "manager_selected_department";

const ManagerDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { manager, isAuthenticated, isAdmin, logout } = useManagerAuth();
  const [previewManagerRole, setPreviewManagerRole] = useState<string | null>(null);
  const [previewManagerWorkerTeamId, setPreviewManagerWorkerTeamId] = useState<string | null>(null);
  const [responsableTeamIdsFromBackend, setResponsableTeamIdsFromBackend] = useState<string[] | undefined>(undefined);
  const [scopeReady, setScopeReady] = useState(false);
  const prevEffectiveManagerIdRef = useRef<string | null>(null);

  const previewManagerId = searchParams.get("preview");
  const isPreviewMode = !!previewManagerId && isAdmin;
  const highlightRequestId = searchParams.get("request");
  const highlightedRequestRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [annualCalendars, setAnnualCalendars] = useState<AnnualCalendar[]>([]);
  const [workerTeams, setWorkerTeams] = useState<WorkerTeam[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [previewManagerName, setPreviewManagerName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"approve" | "reject">("approve");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [comment, setComment] = useState("");
  const [editRequestDialogOpen, setEditRequestDialogOpen] = useState(false);
  const [editRequestReason, setEditRequestReason] = useState("");
  const [editRequestId, setEditRequestId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("PENDING");

  // ─── Unified department selector with persistence ───
  const [selectedDept, setSelectedDeptRaw] = useState<string>(() => {
    return localStorage.getItem(DEPT_STORAGE_KEY) || "all";
  });

  const setSelectedDept = useCallback((val: string) => {
    setSelectedDeptRaw(val);
    localStorage.setItem(DEPT_STORAGE_KEY, val);
  }, []);

  // Validate persisted dept exists in the manager's departments
  useEffect(() => {
    if (departments.length > 0 && selectedDept !== "all") {
      const exists = departments.some(d => d.id === selectedDept);
      if (!exists) {
        setSelectedDept("all");
      }
    }
  }, [departments, selectedDept, setSelectedDept]);

  // Unified tab state with URL sync
  const [activeTab, setActiveTab] = useState<ManagerTab>(() => {
    return (searchParams.get("tab") as ManagerTab) || "home";
  });
  const [visitedTabs, setVisitedTabs] = useState<Set<ManagerTab>>(new Set([
    (searchParams.get("tab") as ManagerTab) || "home"
  ]));
  const [showMoreTabs, setShowMoreTabs] = useState(false);
  const defaultTabAppliedRef = useRef(false);
  const consultaDefaultAppliedRef = useRef(false);

  // Incidencias
  const [incidenciasContext, setIncidenciasContext] = useState<IncidenciasUserContext | null>(null);
  const [incidenciasSubTab, setIncidenciasSubTab] = useState<"dashboard" | "historial" | "nueva" | "equipo" | "salida">("dashboard");

  // Dashboard stats from incidencias
  const [incTodayCount, setIncTodayCount] = useState(0);
  const [incWeekCount, setIncWeekCount] = useState(0);

  // Dashboard cache
  const [cachedWorkforce, setCachedWorkforce] = useState<WorkforceData | null>(null);
  const [cachedBalances, setCachedBalances] = useState<BalanceEntry[] | null>(null);
  const [cachedIncStats, setCachedIncStats] = useState<IncStats | null>(null);

  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const effectiveManagerId = isPreviewMode ? previewManagerId : manager?.id;
  const effectiveManagerName = isPreviewMode ? (previewManagerName || manager?.name || "") : (manager?.name || "");
  const effectiveRole = isPreviewMode ? previewManagerRole : manager?.role ?? null;
  const isResponsable = effectiveRole === "responsable";
  const isConsulta = effectiveRole === "consulta";
  // Reset ALL state when the effective manager changes (preview switch)
  useEffect(() => {
    if (!effectiveManagerId) return;
    if (prevEffectiveManagerIdRef.current && prevEffectiveManagerIdRef.current !== effectiveManagerId) {
      // Full state reset
      setResponsableTeamIdsFromBackend(undefined);
      setScopeReady(false);
      setCachedWorkforce(null);
      setCachedBalances(null);
      setCachedIncStats(null);
      setIncidenciasContext(null);
      setVisitedTabs(new Set([(searchParams.get("tab") as ManagerTab) || "home"]));
      setIncidenciasSubTab("dashboard");
      setWorkerTeams([]);
      setWorkers([]);
      setWorkGroups([]);
      setDepartments([]);
      setRequests([]);
      setAnnualCalendars([]);
      defaultTabAppliedRef.current = false;
      consultaDefaultAppliedRef.current = false;
    }
    prevEffectiveManagerIdRef.current = effectiveManagerId;
  }, [effectiveManagerId]);

  const effectiveWorkerTeamIds = useMemo(() => {
    if (!isResponsable) return undefined;

    // ONLY use backend-resolved team IDs — no premature fallback
    if (responsableTeamIdsFromBackend && responsableTeamIdsFromBackend.length > 0) {
      return responsableTeamIdsFromBackend;
    }

    // Only use fallback AFTER scope is ready (backend responded with no led teams)
    if (scopeReady) {
      const directTeamId = isPreviewMode ? previewManagerWorkerTeamId : manager?.worker_team_id;
      if (directTeamId) return [directTeamId];
    }

    return undefined;
  }, [isResponsable, isPreviewMode, previewManagerWorkerTeamId, manager?.worker_team_id, responsableTeamIdsFromBackend, scopeReady]);
  const shouldDefaultToNuevaIncidencia =
    !!incidenciasContext &&
    departments.length > 0 &&
    departments.every((department) =>
      ["Sacado V", "Encajado V", "Revisión V", "Revision V"].includes(department.name)
    );

  // Scroll to highlighted request
  useEffect(() => {
    if (highlightRequestId && !loading && requests.length > 0) {
      const targetRequest = requests.find(r => r.id === highlightRequestId);
      if (targetRequest) {
        setSelectedDept("all");
        setSelectedStatus("all");
        setActiveTab("vacaciones");
      }
      setTimeout(() => {
        highlightedRequestRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [highlightRequestId, loading, requests]);

  // Fetch incidencias departments — wait for scope to be ready for responsables
  useEffect(() => {
    const fetchIncidenciasDepts = async () => {
      if (!sessionToken || !manager || !effectiveManagerId) return;
      // For responsable, wait until scope is resolved
      if (isResponsable && !scopeReady) return;
      try {
        const { data } = await supabase.functions.invoke('incidencias-operations', {
          body: { action: 'getMyDepartments', sessionToken, targetManagerId: isPreviewMode ? effectiveManagerId : undefined }
        });
        if (data?.success) {
          const deptIds = (data.departments || []).map((d: any) => d.id);
          const role: IncidenciasRole = isPreviewMode
            ? 'encargado'
            : (data.role === 'admin' || effectiveRole === 'admin') ? 'admin' : 'encargado';
          // Capture responsableTeamIds from backend
          if (data.responsableTeamIds) {
            setResponsableTeamIdsFromBackend(data.responsableTeamIds);
          }
          if (role === 'admin' || deptIds.length > 0) {
            setIncidenciasContext({
              managerId: effectiveManagerId,
              managerName: effectiveManagerName,
              role,
              departmentIds: deptIds,
              workerTeamIds: data.responsableTeamIds || effectiveWorkerTeamIds,
              permissions: getPermissions(role),
            });
          }
        }
      } catch {}
    };
    if (isAuthenticated && manager) fetchIncidenciasDepts();
  }, [effectiveManagerId, effectiveManagerName, effectiveRole, isAuthenticated, isPreviewMode, manager, sessionToken, scopeReady, isResponsable]);

  useEffect(() => {
    if (!shouldDefaultToNuevaIncidencia) return;
    if (defaultTabAppliedRef.current) return;
    defaultTabAppliedRef.current = true;
    setActiveTab("incidencias");
    setIncidenciasSubTab("nueva");
    setVisitedTabs((prev) => {
      if (prev.has("incidencias")) return prev;
      const next = new Set(prev);
      next.add("incidencias");
      return next;
    });
  }, [shouldDefaultToNuevaIncidencia]);

  // Default to "groups" tab for consulta role
  useEffect(() => {
    if (!isConsulta || consultaDefaultAppliedRef.current || departments.length === 0) return;
    consultaDefaultAppliedRef.current = true;
    setActiveTab("groups");
    setVisitedTabs(prev => { const next = new Set(prev); next.add("groups"); return next; });
    if (selectedDept === "all" || !selectedDept) {
      setSelectedDept(departments[0].id);
    }
  }, [departments, isConsulta, selectedDept, setSelectedDept]);

  // Fetch incidencias stats for home dashboard
  useEffect(() => {
    const fetchIncStats = async () => {
      if (!sessionToken) return;
      try {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: {
            action: "getDashboardStats",
            sessionToken,
            departmentIds: incidenciasContext?.departmentIds,
            ...(effectiveWorkerTeamIds ? { workerTeamIds: effectiveWorkerTeamIds } : {}),
          },
        });
        if (data?.success) {
          setIncTodayCount(data.todayCount || 0);
          setIncWeekCount(data.weekCount || 0);
        }
      } catch {}
    };
    if (incidenciasContext) fetchIncStats();
  }, [effectiveWorkerTeamIds, incidenciasContext, sessionToken]);

  useEffect(() => {
    if (!isAuthenticated) { navigate("/login"); return; }
    // Restricted "candidaturas only" managers: send to dedicated panel
    if (manager?.candidaturas_only && !isPreviewMode) { navigate("/candidaturas", { replace: true }); return; }
    if (isAdmin && !isPreviewMode) { navigate("/admin"); return; }
    // Responsables go directly to their dashboard (no admin redirect)
    const targetManagerId = isPreviewMode ? previewManagerId : manager?.id;
    if (targetManagerId) {
      fetchDepartments(targetManagerId);
      if (isPreviewMode) fetchPreviewManagerName(previewManagerId!);
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, isAdmin, manager, navigate, isPreviewMode, previewManagerId]);

  const fetchPreviewManagerName = async (managerId: string) => {
    try {
      const { data } = await supabase.rpc("get_public_managers");
      const m = data?.find((m: any) => m.id === managerId);
      if (m) {
        // If the previewed manager is restricted to Candidaturas, redirect to that panel in preview mode
        if ((m as any).candidaturas_only) {
          navigate(`/candidaturas?preview=${managerId}`, { replace: true });
          return;
        }
        setPreviewManagerName(m.name);
        setPreviewManagerRole(m.role);
        setPreviewManagerWorkerTeamId(m.worker_team_id || null);
      }
    } catch (err) { console.error("Error fetching manager name:", err); }
  };

  const fetchDepartments = async (targetManagerId?: string) => {
    const managerId = targetManagerId || (isPreviewMode ? previewManagerId : manager?.id);
    if (!managerId) return;
    if (!sessionToken) { setLoading(false); return; }
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getManagerDepartments", sessionToken, data: { managerId: isPreviewMode ? previewManagerId : undefined } }
      });
      if (error || !response?.success) { setLoading(false); return; }
      const depts = response.departments || [];
      console.log('[ManagerDashboard][v4] fetchDepartments result:', { managerId, isPreviewMode, previewManagerId, effectiveId: isPreviewMode ? previewManagerId : managerId, isMiguelCheck: (isPreviewMode ? previewManagerId : managerId) === '04c8276a-c04a-4e8d-a5b7-8f1e949e6d58', depts: depts.map((d: any) => d.name) });
      if (depts.length === 0) { setLoading(false); return; }
      setDepartments(depts.map((d: any) => ({ id: d.id, name: d.name, public_token: d.public_token, slug: d.slug })));
      const departmentIds = depts.map((d: any) => d.id);
      await Promise.all([fetchRequests(departmentIds), fetchAnnualCalendars(), fetchWorkerGroups()]);
    } catch (err) { console.error("Error fetching departments:", err); setLoading(false); }
  };

  const fetchAnnualCalendars = async () => {
    if (!sessionToken) return;
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getManagerAnnualCalendars", sessionToken, data: { managerId: isPreviewMode ? previewManagerId : undefined } }
      });
      if (!error && response?.success) setAnnualCalendars(response.calendars || []);
    } catch (err) { console.error("Error fetching annual calendars:", err); }
  };

  const fetchWorkerGroups = async () => {
    if (!sessionToken) return;
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getManagerWorkerGroups", sessionToken, data: { managerId: isPreviewMode ? previewManagerId : undefined } }
      });
      if (!error && response?.success) {
        setWorkerTeams(response.workerTeams || []);
        setWorkers(response.workers || []);
        setWorkGroups(response.workGroups || []);
        if (response.responsableTeamIds) {
          setResponsableTeamIdsFromBackend(response.responsableTeamIds);
        }
        // Mark scope as resolved — backend has responded
        setScopeReady(true);
      }
    } catch (err) { console.error("Error fetching worker groups:", err); }
  };

  const fetchRequests = async (departmentIds: string[]) => {
    if (departmentIds.length === 0 || !sessionToken || !isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getVacationRequests", sessionToken, data: { departmentIds } }
      });
      if (error || !response?.success) {
        if (response?.error !== "Invalid session") toast.error("Error al cargar solicitudes");
        setLoading(false); return;
      }
      setRequests(response.requests || []);
    } catch (err) { console.error("Error fetching requests:", err); toast.error("Error al cargar solicitudes"); }
    setLoading(false);
  };

  const updateManagerStatus = async (id: string, status: "APPROVED" | "REJECTED", reason?: string) => {
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "updateVacationRequestStatus", sessionToken, data: { requestId: id, updates: { manager_status: status, manager_rejection_reason: status === "REJECTED" ? reason : null, manager_approved_at: status === "APPROVED" ? new Date().toISOString() : null } } }
      });
      if (error || !response?.success) { toast.error("Error al actualizar solicitud"); return; }
      toast.success(status === "APPROVED" ? "Solicitud aprobada. Pasará a revisión de administración." : "Solicitud rechazada");
      fetchRequests(departments.map(d => d.id));
    } catch (err) { console.error("Error updating request:", err); toast.error("Error al actualizar solicitud"); }
  };

  const handleApprove = (id: string) => { setSelectedRequestId(id); setDialogType("approve"); setComment(""); setDialogOpen(true); };
  const handleReject = (id: string) => { setSelectedRequestId(id); setDialogType("reject"); setComment(""); setDialogOpen(true); };
  const handleDialogConfirm = () => {
    if (dialogType === "reject" && !comment.trim()) { toast.error("Debes proporcionar un motivo del rechazo"); return; }
    updateManagerStatus(selectedRequestId, dialogType === "approve" ? "APPROVED" : "REJECTED", comment || undefined);
    setDialogOpen(false); setComment("");
  };
  const handleLogout = () => { logout(); navigate("/login"); };
  const handleRequestEdit = (requestId: string) => { setEditRequestId(requestId); setEditRequestReason(""); setEditRequestDialogOpen(true); };
  const submitEditRequest = async () => {
    if (!editRequestReason.trim()) { toast.error("Debes indicar qué cambios necesitas"); return; }
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "updateVacationRequestStatus", sessionToken, data: { requestId: editRequestId, updates: { edit_request_reason: editRequestReason, edit_request_status: "PENDING", edit_request_by: manager?.name || "Encargado", edit_request_at: new Date().toISOString() } } }
      });
      if (error || !response?.success) { toast.error("Error al enviar la petición"); return; }
      toast.success("Petición de edición enviada a administración");
      setEditRequestDialogOpen(false); setEditRequestReason("");
      fetchRequests(departments.map(d => d.id));
    } catch (err) { console.error("Error submitting edit request:", err); toast.error("Error al enviar la petición"); }
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return null;
    const statusConfig = {
      PENDING: { label: "Pendiente", variant: "secondary" as const, icon: Clock },
      APPROVED: { label: "Aprobada", variant: "default" as const, icon: CheckCircle },
      REJECTED: { label: "Rechazada", variant: "destructive" as const, icon: XCircle },
    };
    const config = statusConfig[status as keyof typeof statusConfig];
    if (!config) return null;
    const Icon = config.icon;
    return <Badge variant={config.variant} className="gap-1"><Icon className="h-3 w-3" />{config.label}</Badge>;
  };

  const stats = {
    total: requests.length,
    pending: requests.filter(r => !r.manager_status || r.manager_status === "PENDING").length,
    approved: requests.filter(r => r.manager_status === "APPROVED").length,
    rejected: requests.filter(r => r.manager_status === "REJECTED").length,
  };

  const filteredRequests = requests.filter(request => {
    if (selectedDept !== "all" && request.department_id !== selectedDept) return false;
    if (selectedStatus !== "all") {
      const managerStatus = request.manager_status || "PENDING";
      if (managerStatus !== selectedStatus) return false;
    }
    return true;
  });

  /* ─── Handle tab with "más" submenu ─── */
  // Fichadas tab: ONLY for Miguel (VNH manager)
  const MIGUEL_MANAGER_ID = '04c8276a-c04a-4e8d-a5b7-8f1e949e6d58';
  const isMiguel = effectiveManagerId === MIGUEL_MANAGER_ID;
  const hasVNHDepartment = isMiguel;
  const vnhDepartmentId = isMiguel ? departments.find(d => d.name.toUpperCase().trim() === "VERDNATURA HOLLAND")?.id : undefined;

  // Use role-specific navigation config
  const basePrimaryTabs = isConsulta ? consultaPrimaryTabs : isResponsable ? responsablePrimaryTabs : primaryTabs;
  const baseSecondaryTabs = isConsulta ? [] as typeof secondaryTabs : isResponsable ? responsableSecondaryTabs : secondaryTabs;

  const filteredSecondaryTabs = baseSecondaryTabs.filter(tab => {
    if (isResponsable && (tab.id === 'plantilla')) return false;
    return true;
  });
  const filteredPrimaryTabs = basePrimaryTabs.filter(tab => {
    if (tab.id === 'fichadas' && !isMiguel) return false;
    return true;
  });
  const isSecondaryTab = filteredSecondaryTabs.some(t => t.id === activeTab);
  const allowedTabIds = [
    ...filteredPrimaryTabs
      .filter(tab => tab.id !== "incidencias" || !!incidenciasContext)
      .map(tab => tab.id),
    ...filteredSecondaryTabs.map(tab => tab.id),
  ] as ManagerTab[];

  useEffect(() => {
    if (isPreviewMode && previewManagerRole === null) return;
    if (allowedTabIds.includes(activeTab)) return;

    const fallbackTab: ManagerTab = isConsulta || isResponsable ? "groups" : "home";
    if (!allowedTabIds.includes(fallbackTab)) return;

    const next = new URLSearchParams(searchParams);
    if (fallbackTab === "home") next.delete("tab");
    else next.set("tab", fallbackTab);

    window.history.replaceState(null, "", `?${next.toString()}`);
    setActiveTab(fallbackTab);
    setVisitedTabs(prev => {
      if (prev.has(fallbackTab)) return prev;
      const nextVisited = new Set(prev);
      nextVisited.add(fallbackTab);
      return nextVisited;
    });
  }, [activeTab, allowedTabIds, isConsulta, isPreviewMode, isResponsable, previewManagerRole, searchParams]);

  if (departments.length === 0 && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Sin departamento asignado</h2>
            <p className="text-muted-foreground mb-4">No tienes ningún departamento asignado. Contacta con administración.</p>
            <Button onClick={handleLogout} variant="outline"><LogOut className="h-4 w-4 mr-2" />Cerrar sesión</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  const handleTabChange = (tab: ManagerTab) => {
    setActiveTab(tab);
    // Sync to URL
    const next = new URLSearchParams(searchParams);
    if (tab === "home") next.delete("tab");
    else next.set("tab", tab);
    // preserve preview param
    window.history.replaceState(null, "", `?${next.toString()}`);
    setVisitedTabs(prev => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
    setShowMoreTabs(false);
  };

  /* ─── Helper: get the active department for filtering (returns dept id or null for "all") ─── */
  const getActiveDeptId = (): string | null => selectedDept === "all" ? null : selectedDept;

  /* ─── Render helpers ─── */
  const renderHome = () => (
    <ManagerHomeDashboard
      stats={stats}
      requests={requests}
      workers={workers}
      departments={departments.map(d => ({ id: d.id, name: d.name }))}
      incidenciasContext={incidenciasContext}
      incTodayCount={incTodayCount}
      incWeekCount={incWeekCount}
      sessionToken={sessionToken}
      onNavigate={(tab) => handleTabChange(tab as ManagerTab)}
      onNewIncidencia={() => { setActiveTab("incidencias"); setIncidenciasSubTab("nueva"); }}
      cachedWorkforce={cachedWorkforce}
      cachedBalances={cachedBalances}
      cachedIncStats={cachedIncStats}
      onWorkforceLoaded={setCachedWorkforce}
      onBalancesLoaded={setCachedBalances}
      onIncStatsLoaded={setCachedIncStats}
      parentLoading={loading}
      isResponsable={isResponsable}
      workerTeamIds={effectiveWorkerTeamIds}
    />
  );

  const renderVacaciones = () => (
    <div className="space-y-4">
      {/* Compact filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <DeptPills
          departments={departments}
          selected={selectedDept}
          onChange={setSelectedDept}
          totalCount={requests.length}
        />
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-[140px] rounded-full h-8 text-xs">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="PENDING">Pendientes</SelectItem>
            <SelectItem value="APPROVED">Aprobadas</SelectItem>
            <SelectItem value="REJECTED">Rechazadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Request list */}
      {loading ? (
        <SkeletonRequestList count={3} />
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
          <CheckCircle className="h-10 w-10 text-primary/30" />
          <span className="text-sm">
            {selectedStatus === "PENDING" ? "No hay solicitudes pendientes" : "No hay solicitudes que mostrar"}
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((request) => {
            const isHighlighted = request.id === highlightRequestId;
            return (
              <Card
                key={request.id}
                ref={isHighlighted ? highlightedRequestRef : undefined}
                className={cn("border-border/40 transition-all", isHighlighted && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-3 justify-between">
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm text-foreground truncate">{request.employee_name}</h3>
                          <p className="text-xs text-muted-foreground">
                            Nº{" "}
                            <a href={`https://salix.verdnatura.es/#/worker/${request.worker_number}/calendar`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{request.worker_number}</a>
                          </p>
                          {request.work_group && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: request.work_group.color }} />
                              <span className="text-[10px] text-muted-foreground">{request.work_group.name}{request.worker_team && ` · ${request.worker_team.name}`}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 items-end flex-shrink-0">
                          {request.is_admin_request && (
                            <Badge variant="outline" className="text-[10px] bg-accent text-accent-foreground border-border/50"><ShieldCheck className="h-2.5 w-2.5 mr-0.5" />Admin</Badge>
                          )}
                          {getStatusBadge(request.manager_status)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {request.vacation_request_dates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((dateObj, idx) => (
                          <Badge key={idx} variant="outline" className="text-[10px] px-1.5">{format(new Date(dateObj.date), "d MMM", { locale: es })}</Badge>
                        ))}
                      </div>

                      {request.notes && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Obs:</span> {request.notes}</p>}
                      {request.manager_rejection_reason && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Comentario:</span> {request.manager_rejection_reason}</p>}
                      <p className="text-[10px] text-muted-foreground">{format(new Date(request.created_at), "d MMM yyyy, HH:mm", { locale: es })}</p>
                    </div>

                    <div className="flex gap-2 sm:flex-col sm:justify-start pt-2 sm:pt-0 border-t sm:border-t-0 sm:border-l border-border/30 sm:pl-3">
                      {(!request.manager_status || request.manager_status === "PENDING") && (
                        <>
                          <Button size="sm" onClick={() => handleApprove(request.id)} className="flex-1 sm:flex-none rounded-xl h-8 text-xs">
                            <CheckCircle className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Aprobar</span>
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleReject(request.id)} className="flex-1 sm:flex-none rounded-xl h-8 text-xs">
                            <XCircle className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Rechazar</span>
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleRequestEdit(request.id)} className="flex-1 sm:flex-none rounded-xl h-8 text-xs">
                        <Pencil className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Editar</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderIncidencias = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(["dashboard", "historial", "equipo", "salida"] as const).map(sub => (
          <button
            key={sub}
            onClick={() => setIncidenciasSubTab(sub)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-medium transition-all border whitespace-nowrap", incidenciasSubTab === sub ? "bg-foreground text-background border-foreground" : "bg-transparent text-muted-foreground border-border/50 hover:text-foreground hover:border-border")}
          >
            {sub === "dashboard" ? "Dashboard" : sub === "historial" ? "Historial" : sub === "equipo" ? "Equipo" : "Salida"}
          </button>
        ))}
        <button
          onClick={() => setIncidenciasSubTab("nueva")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary text-primary-foreground active:scale-95 transition-all shadow-sm whitespace-nowrap ml-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva
        </button>
      </div>
      {incidenciasContext && (
        <>
          <div className={incidenciasSubTab !== "dashboard" ? "hidden" : "animate-fade-in"}>
            <EncargadoAnalytics userContext={incidenciasContext} />
          </div>
          <div className={incidenciasSubTab !== "historial" ? "hidden" : "animate-fade-in"}>
            <EncargadoHistorial userContext={incidenciasContext} filterWorkerId={null} />
          </div>
          {incidenciasSubTab === "nueva" && (
            <div className="animate-fade-in">
              <EncargadoNuevaIncidencia userContext={incidenciasContext} onComplete={() => setIncidenciasSubTab("historial")} />
            </div>
          )}
          <div className={incidenciasSubTab !== "equipo" ? "hidden" : "animate-fade-in"}>
            <EncargadoEquipo userContext={incidenciasContext} onViewHistory={() => setIncidenciasSubTab("historial")} />
          </div>
          <div className={incidenciasSubTab !== "salida" ? "hidden" : "animate-fade-in"}>
            <EncargadoSalidaVoluntaria userContext={incidenciasContext} />
          </div>
        </>
      )}
    </div>
  );

  const renderCalendars = () => {
    // Filter by unified dept selector
    const activeDeptId = getActiveDeptId();
    const filteredDepts = activeDeptId ? departments.filter(d => d.id === activeDeptId) : departments;

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <DeptPills departments={departments} selected={selectedDept} onChange={setSelectedDept} />
          {filteredDepts.length === 1 && filteredDepts[0]?.slug && (
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/calendario/${filteredDepts[0].slug}`); toast.success("Enlace copiado"); }} className="rounded-xl gap-2 self-start">
              <Copy className="h-4 w-4" /><span className="hidden sm:inline">Copiar enlace</span>
            </Button>
          )}
        </div>
        {filteredDepts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No hay calendarios disponibles</div>
        ) : (
          filteredDepts.map(dept => (
            <div key={dept.id}>
              {filteredDepts.length > 1 && (
                <h3 className="text-sm font-semibold text-foreground mb-3 border-b border-border/30 pb-2">{dept.name}</h3>
              )}
              <EmbeddedAnnualCalendar departmentId={dept.id} departmentSlug={dept.slug} />
            </div>
          ))
        )}
      </div>
    );
  };

  const renderGroups = () => {
    if (workerTeams.length === 0) return <div className="text-center py-8 text-muted-foreground text-sm">No hay equipos configurados</div>;

    const activeDeptId = getActiveDeptId();
    const filteredDepts = activeDeptId ? departments.filter(d => d.id === activeDeptId) : departments;

    const renderDeptTeams = (dept: Department) => {
      const deptTeams = workerTeams.filter(t => t.department_id === dept.id);
      const deptWorkers = workers.filter(w => w.department_id === dept.id);
      const unassignedWorkers = deptWorkers.filter(w => !w.worker_team_id);
      if (deptTeams.length === 0 && unassignedWorkers.length === 0) return null;

      // Group by display_name (matches admin view)
      const groupedTeams: { [key: string]: typeof deptTeams } = {};
      deptTeams.forEach(team => {
        const prefix = team.display_name || team.work_group_name || `Grupo ${team.name.charAt(0).toUpperCase()}`;
        if (!groupedTeams[prefix]) groupedTeams[prefix] = [];
        groupedTeams[prefix].push(team);
      });
      const sortedPrefixes = Object.keys(groupedTeams).sort();

      const renderWorkerChip = (worker: Worker) => {
        const wgColor = worker.work_group_id 
          ? workGroups.find(g => g.id === worker.work_group_id)?.color 
          : null;
        return (
          <a key={worker.id} href={`https://salix.verdnatura.es/#/worker/${worker.worker_number}/calendar`} target="_blank" rel="noopener noreferrer"
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded transition-colors",
              worker.is_on_leave ? "bg-destructive/20 text-destructive line-through" 
                : !wgColor ? "bg-muted text-foreground hover:bg-muted/80" 
                : ""
            )}
            style={!worker.is_on_leave && wgColor ? { 
              backgroundColor: wgColor + '30', 
              color: wgColor 
            } : undefined}
          >
            {worker.name}
            {worker.worker_number && (
              <span className="ml-1 text-[9px] opacity-60">({worker.worker_number})</span>
            )}
          </a>
        );
      };

      return (
        <div key={dept.id} className="space-y-4">
          <div className="flex items-center gap-3 border-b border-border/30 pb-2">
            <h3 className="font-semibold text-sm text-foreground">{dept.name}</h3>
            <Badge variant="secondary" className="text-[10px]">{deptWorkers.length} trab.</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedPrefixes.map(prefix => {
              const teams = groupedTeams[prefix].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
              const totalGroupWorkers = teams.reduce((acc, team) =>
                acc + workers.filter(w => w.worker_team_id === team.id).length, 0
              );
              // Find group color from first team
              const firstTeamColor = teams[0]?.work_group_color;
              return (
                <div key={prefix} className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-primary">{prefix}</span>
                    <Badge variant="outline" className="text-[10px] ml-auto">
                      {totalGroupWorkers}
                    </Badge>
                  </div>
                  {teams.map(team => {
                    const tw = workers.filter(w => w.worker_team_id === team.id).sort((a, b) => a.name.localeCompare(b.name));
                    const workGroupColor = team.work_group_color;
                    return (
                      <Card key={team.id} className="border-border/30">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            {workGroupColor && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: workGroupColor }} />}
                            <h4 className="font-medium text-xs">{team.name}</h4>
                            <span className="text-[10px] text-muted-foreground ml-auto">{tw.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {tw.map(renderWorkerChip)}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {/* Sin equipo — full width at bottom */}
          {unassignedWorkers.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-destructive">Sin equipo</span>
              <Card className="border-destructive/40 bg-destructive/5">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-destructive/50" />
                    <h4 className="font-medium text-xs text-destructive">Sin asignar</h4>
                    <span className="text-[10px] text-destructive/70 ml-auto">{unassignedWorkers.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {unassignedWorkers.sort((a, b) => a.name.localeCompare(b.name)).map(renderWorkerChip)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-4">
        {!isConsulta && (
          departments.length > 5 ? (
            <DepartmentSearchSelect
              departments={departments}
              value={selectedDept === "all" ? "" : selectedDept}
              onChange={(val) => setSelectedDept(val || "all")}
              includeAll={false}
              placeholder="Seleccionar departamento..."
              className="sm:max-w-xs"
            />
          ) : (
            <DeptPills
              departments={departments}
              selected={selectedDept}
              onChange={setSelectedDept}
              totalCount={workers.length}
            />
          )
        )}
        <div className="space-y-6">
          {filteredDepts.map(d => renderDeptTeams(d))}
        </div>
      </div>
    );
  };

  /* ─── MAIN RENDER ─── */
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Minimal header */}
      <header className="glass-header">
        <div className="max-w-6xl mx-auto px-4 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoLink to="/manager" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-foreground tracking-tight truncate">{effectiveManagerName}</h1>
              <p className="text-[10px] text-muted-foreground">{isConsulta ? 'Solo lectura' : isResponsable ? 'Responsable de equipo' : 'Panel de gestión'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {departments.length === 1 ? (
              <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/d/${departments[0].public_token}`); toast.success("Enlace copiado"); }} className="h-8 w-8 p-0 rounded-full">
                <Share2 className="h-4 w-4" />
              </Button>
            ) : departments.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full"><Share2 className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover rounded-xl p-1.5 shadow-lg border border-border/50">
                  {departments.map(dept => (
                    <DropdownMenuItem key={dept.id} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/d/${dept.public_token}`); toast.success(`Enlace de ${dept.name} copiado`); }} className="rounded-lg py-2.5 px-3 cursor-pointer">
                      <Copy className="h-4 w-4 mr-2" />{dept.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="h-8 w-8 p-0 rounded-full">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Preview mode banner */}
      {isPreviewMode && (
        <div className="bg-accent border-b border-border/30 px-4 py-2">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <p className="text-xs text-accent-foreground">Vista previa: {effectiveManagerName || "encargado"}</p>
            <Button size="sm" variant="outline" onClick={() => navigate("/admin")} className="h-6 text-[10px] rounded-lg">Volver</Button>
          </div>
        </div>
      )}

      {/* Desktop pill navigation */}
      <div className="hidden md:block border-b border-border/20 bg-card/50">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-1">
          {filteredPrimaryTabs.map(tab => {
            if (tab.id === "incidencias" && !incidenciasContext) return null;
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.id === "vacaciones" && stats.pending > 0 && (
                  <span className="min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">{stats.pending > 99 ? '99+' : stats.pending}</span>
                )}
                {tab.id === "incidencias" && incTodayCount > 0 && (
                  <span className="min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">{incTodayCount}</span>
                )}
              </button>
            );
          })}

          {/* More dropdown — hidden when no secondary tabs */}
          {filteredSecondaryTabs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                isSecondaryTab ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}>
                <MoreHorizontal className="h-4 w-4" />
                {isSecondaryTab ? filteredSecondaryTabs.find(t => t.id === activeTab)?.label : "Más"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-popover rounded-xl p-1.5 shadow-lg border border-border/50 min-w-[200px]">
              {filteredSecondaryTabs.map((tab, idx) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <div key={tab.id}>
                    <DropdownMenuItem
                      onClick={() => handleTabChange(tab.id)}
                      className={cn(
                        "cursor-pointer gap-3 rounded-lg py-2.5 px-3 font-medium",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </DropdownMenuItem>
                    {idx < filteredSecondaryTabs.length - 1 && (
                      <DropdownMenuSeparator className="my-0.5 bg-border/30" />
                    )}
                  </div>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Quick new incidencia button */}
          {incidenciasContext && !isConsulta && (
            <button
              onClick={() => { handleTabChange("incidencias"); setIncidenciasSubTab("nueva"); }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium border border-primary/50 text-primary hover:bg-primary/10 active:scale-95 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva incidencia
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 pb-24 md:pb-6">
        <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6">
          {/* Unified department selector for consulta users */}
          {isConsulta && departments.length > 0 && activeTab !== "candidaturas" && activeTab !== "entrevistas" && (
            <div className="mb-4">
              <DepartmentSearchSelect
                departments={departments}
                value={selectedDept === "all" ? (departments[0]?.id || "") : selectedDept}
                onChange={(val) => setSelectedDept(val || departments[0]?.id || "")}
                includeAll={false}
                placeholder="Seleccionar departamento..."
                className="sm:max-w-xs"
              />
            </div>
          )}
          {/* Home — always mounted */}
          <div className={activeTab !== "home" ? "hidden" : "animate-fade-in"}>
            {/* Mobile-only quick new incidencia button — hidden while loading */}
            {incidenciasContext && !loading && (
              <button
                onClick={() => { handleTabChange("incidencias"); setIncidenciasSubTab("nueva"); }}
                className="md:hidden flex items-center gap-2 w-full mb-4 px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground active:scale-[0.98] transition-colors shadow-sm animate-fade-in"
              >
                <Plus className="h-4 w-4" />
                Nueva incidencia
              </button>
            )}
            {renderHome()}
          </div>

          {/* Incidencias — cached */}
          {visitedTabs.has("incidencias") && (
            <div className={activeTab !== "incidencias" ? "hidden" : "animate-fade-in"}>
              {renderIncidencias()}
            </div>
          )}

          {/* Fichadas — cached (VNH only) */}
          {hasVNHDepartment && vnhDepartmentId && visitedTabs.has("fichadas") && (
            <div className={activeTab !== "fichadas" ? "hidden" : "animate-fade-in"}>
              <ManagerClockEntriesTab departmentId={vnhDepartmentId} />
            </div>
          )}

          {/* Vacaciones — cached (hidden for responsable) */}
          {!isResponsable && visitedTabs.has("vacaciones") && (
            <div className={activeTab !== "vacaciones" ? "hidden" : "animate-fade-in"}>
              {renderVacaciones()}
            </div>
          )}

          {/* Calendarios — cached */}
          {visitedTabs.has("calendars") && (
            <div className={activeTab !== "calendars" ? "hidden" : "animate-fade-in"}>
              {renderCalendars()}
            </div>
          )}

          {/* Equipos — cached */}
          {visitedTabs.has("groups") && (
            <div className={activeTab !== "groups" ? "hidden" : "animate-fade-in"}>
              {renderGroups()}
            </div>
          )}

          {/* Horarios — cached */}
          {visitedTabs.has("schedules") && (
            <div className={activeTab !== "schedules" ? "hidden" : "animate-fade-in space-y-4"}>
              {!isConsulta && departments.length > 1 && (
                departments.length > 5 ? (
                  <DepartmentSearchSelect
                    departments={departments}
                    value={selectedDept === "all" ? "" : selectedDept}
                    onChange={(val) => setSelectedDept(val || "all")}
                    includeAll={false}
                    placeholder="Seleccionar departamento..."
                    className="sm:max-w-xs"
                  />
                ) : (
                  <DeptPills
                    departments={departments}
                    selected={selectedDept}
                    onChange={setSelectedDept}
                    includeAll={false}
                  />
                )
              )}
              <ConsultaSchedulesPanel
                departments={departments}
                selectedDepartment={selectedDept === "all" ? (departments[0]?.id || "") : selectedDept}
                workers={workers}
                workGroups={workGroups}
                workerTeams={workerTeams.map((team) => ({
                  id: team.id,
                  name: team.name,
                  department_id: team.department_id,
                  display_name: team.display_name,
                  work_group_name: team.work_group_name,
                  work_group_color: team.work_group_color,
                  responsable_worker_id: team.responsable_worker_id,
                }))}
              />
            </div>
          )}

          {/* Plantilla — cached (hidden for responsable) */}
          {!isResponsable && visitedTabs.has("plantilla") && (
            <div className={activeTab !== "plantilla" ? "hidden" : "animate-fade-in"}>
              <LaborWorkforceTab managerDepartmentIds={departments.map(d => d.id)} />
            </div>
          )}

          {/* Balance — cached */}
          {visitedTabs.has("balance") && (
            <div className={activeTab !== "balance" ? "hidden" : "animate-fade-in"}>
              <ManagerBalanceTab
                departmentIds={departments.map(d => d.id)}
                departments={departments.map(d => ({ id: d.id, name: d.name }))}
                externalSelectedDepartment={isConsulta ? (selectedDept === "all" ? departments[0]?.id : selectedDept) : undefined}
                workerTeamIds={effectiveWorkerTeamIds}
              />
            </div>
          )}

          {/* Trial Periods — cached */}
          {visitedTabs.has("trial-periods") && (
            <div className={activeTab !== "trial-periods" ? "hidden" : "animate-fade-in"}>
              <ManagerTrialPeriodsTab
                workers={workers.map(w => ({ id: w.id, name: w.name, worker_number: w.worker_number, department_id: w.department_id, department_name: departments.find(d => d.id === w.department_id)?.name, worker_team_name: workerTeams.find(t => t.id === w.worker_team_id)?.name, work_group_name: workGroups.find(g => g.id === w.work_group_id)?.name, start_contract_date: (w as any).start_contract_date || null }))}
                departments={departments.map(d => ({ id: d.id, name: d.name }))}
                loading={loading}
                externalSelectedDepartment={isConsulta ? (selectedDept === "all" ? departments[0]?.id : selectedDept) : undefined}
              />
            </div>
          )}

          {/* Entrevistas */}
          {visitedTabs.has("entrevistas") && (
            <div className={activeTab !== "entrevistas" ? "hidden" : "animate-fade-in"}>
              <EncargadoEntrevistasView />
            </div>
          )}

          {/* Candidaturas (consulta full management) */}
          {visitedTabs.has("candidaturas") && (
            <div className={activeTab !== "candidaturas" ? "hidden" : "animate-fade-in"}>
              <CandidaturasPanel embedded isAdmin={false} isConsulta={isConsulta} />
            </div>
          )}
        </div>
      </main>

      {/* Mobile Bottom Nav — glassmorphism pill style */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="mx-3 mb-2 rounded-2xl border bg-card/95 border-border/40 shadow-[0_2px_12px_hsl(var(--foreground)/0.04)] dark:bg-card/90 dark:border-border/20 dark:shadow-[0_2px_12px_hsl(0_0%_0%/0.3)]">
          <div className="flex items-center justify-around h-14 px-2">
            {filteredPrimaryTabs.map(tab => {
              if (tab.id === "incidencias" && !incidenciasContext) return null;
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[9px] font-medium">{tab.shortLabel}</span>
                  {/* Animated green dot indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="mobile-nav-dot"
                      className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 400, damping: 28 }}
                    />
                  )}
                  {tab.id === "vacaciones" && stats.pending > 0 && (
                    <span className="absolute -top-0.5 left-1/2 ml-2 min-w-[14px] h-[14px] rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center px-0.5">{stats.pending > 9 ? '9+' : stats.pending}</span>
                  )}
                  {tab.id === "incidencias" && incTodayCount > 0 && (
                    <span className="absolute -top-0.5 left-1/2 ml-2 min-w-[14px] h-[14px] rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center px-0.5">{incTodayCount > 9 ? '9+' : incTodayCount}</span>
                  )}
                </button>
              );
            })}

            {/* More button — hidden when no secondary tabs */}
            {filteredSecondaryTabs.length > 0 && (
            <button onClick={() => setShowMoreTabs(!showMoreTabs)} className={cn("relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 transition-colors", isSecondaryTab ? "text-primary" : "text-muted-foreground")}>
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[9px] font-medium">Más</span>
              {isSecondaryTab && (
                <motion.div
                  layoutId="mobile-nav-dot"
                  className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                />
              )}
            </button>
            )}
          </div>
        </div>

        {/* More tabs overlay — glassmorphism panel */}
        <AnimatePresence>
          {showMoreTabs && (
            <>
              {/* Backdrop to close */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[-1]"
                onClick={() => setShowMoreTabs(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute bottom-full left-3 right-3 mb-2 rounded-2xl border border-border/30 p-4 shadow-lg bg-card/98 dark:bg-card/95 dark:border-border/20"
              >
                <div className="grid grid-cols-3 gap-2.5 max-w-sm mx-auto">
                  {filteredSecondaryTabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all",
                          isActive
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-[10px] font-medium">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </nav>

      {/* Confirm Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogType === "approve" ? "Aprobar solicitud" : "Rechazar solicitud"}</DialogTitle>
            <DialogDescription>{dialogType === "approve" ? "La solicitud pasará a revisión de administración." : "Indica el motivo del rechazo."}</DialogDescription>
          </DialogHeader>
          {dialogType === "reject" && (
            <div className="space-y-2">
              <Label htmlFor="comment">Motivo del rechazo *</Label>
              <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Explica el motivo del rechazo..." rows={3} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleDialogConfirm} variant={dialogType === "reject" ? "destructive" : "default"}>{dialogType === "approve" ? "Aprobar" : "Rechazar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Request Dialog */}
      <Dialog open={editRequestDialogOpen} onOpenChange={setEditRequestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar edición</DialogTitle>
            <DialogDescription>Indica qué cambios necesitas en esta solicitud.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="editReason">¿Qué cambios necesitas? *</Label>
            <Textarea id="editReason" value={editRequestReason} onChange={(e) => setEditRequestReason(e.target.value)} placeholder="Ej: Cambiar el día 15 por el día 18..." rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRequestDialogOpen(false)}>Cancelar</Button>
            <Button onClick={submitEditRequest}>Enviar petición</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManagerDashboard;
