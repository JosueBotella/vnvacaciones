import { useEffect, useState, useRef, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Calendar, CheckCircle, XCircle, Clock, LogOut, Users, Trash2, UserCog,
  Edit, MessageSquare, Eye, Search, X, AlertTriangle, ArrowLeftRight,
  UserPlus, Home, FileEdit, HardDrive, CalendarDays,
  ExternalLink, FileText, MoreHorizontal, ScrollText, Database,
  Settings, TrendingUp, Building2, ChevronRight
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { es } from "date-fns/locale";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { WorkerHistoryPanel } from "@/components/WorkerHistoryPanel";
import { GroupJoinRequestsPanel } from "@/components/GroupJoinRequestsPanel";
import { DepartmentCorrectionRequestsPanel } from "@/components/DepartmentCorrectionRequestsPanel";
import { DayExceptionRequestsPanel } from "@/components/DayExceptionRequestsPanel";
import AuditLogsPanel from "@/components/AuditLogsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLimitsPanel } from "@/components/AppLimitsPanel";
import { GroupExchangesPanel } from "@/components/GroupExchangesPanel";
import { CalendarModificationsPanel } from "@/components/CalendarModificationsPanel";
import { BackupPanel } from "@/components/BackupPanel";
import { EmbeddedWorkerCalendar } from "@/components/EmbeddedWorkerCalendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ManagerSearchSelect } from "@/components/ManagerSearchSelect";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, PieChart, Pie, Tooltip as RechartsTooltip } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";


type AdminTab = "dashboard" | "requests" | "exceptions" | "groups" | "modifications" | "history" | "audit" | "limits" | "exchanges" | "backups";

type VacationRequest = {
  id: string;
  employee_name: string;
  employee_email: string;
  worker_number: string;
  notes: string | null;
  status: string;
  manager_status: string | null;
  manager_rejection_reason: string | null;
  manager_action_by: string | null;
  admin_rejection_reason: string | null;
  created_at: string;
  department_id: string;
  edit_request_reason: string | null;
  edit_request_status: string | null;
  edit_request_by: string | null;
  edit_request_at: string | null;
  is_admin_request?: boolean;
  requested_by_admin_name?: string | null;
  departments: { name: string; manager_email: string | null; public_token: string; manager_name?: string | null };
  vacation_request_dates: Array<{ id: string; date: string }>;
  worker_team?: { id: string; name: string } | null;
  work_group?: { id: string; name: string; color: string } | null;
};

type DepartmentManager = { department_id: string; manager_name: string };

/* ── Navigation config ── */
const primaryTabs: { id: AdminTab; label: string; shortLabel: string; icon: typeof FileText }[] = [
  { id: "dashboard", label: "Inicio", shortLabel: "Inicio", icon: Home },
  { id: "requests", label: "Solicitudes", shortLabel: "Solic.", icon: FileText },
  { id: "modifications", label: "Modificaciones", shortLabel: "Modif.", icon: FileEdit },
  { id: "exceptions", label: "Excepciones", shortLabel: "Excep.", icon: AlertTriangle },
];

const secondaryTabs: { id: AdminTab; label: string; icon: typeof AlertTriangle }[] = [
  { id: "groups", label: "Grupos", icon: UserPlus },
  { id: "exchanges", label: "Intercambios", icon: ArrowLeftRight },
  { id: "history", label: "Histórico", icon: Clock },
  { id: "audit", label: "Auditoría", icon: ScrollText },
  { id: "limits", label: "Límites", icon: Database },
  { id: "backups", label: "Backups", icon: HardDrive },
];

const AdminDashboard = ({ embedded = false, activeTab: externalTab, onTabChange: externalOnTabChange }: { embedded?: boolean; activeTab?: string; onTabChange?: (tab: string) => void }) => {
  const navigate = useNavigate();
  const { manager, isAdmin, isAuthenticated, logout } = useManagerAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [departmentManagers, setDepartmentManagers] = useState<DepartmentManager[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("PENDING");
  const [selectedManagerStatus, setSelectedManagerStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"approve" | "reject" | "delete" | "bulkDelete">("approve");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");

  const [viewAsManagerId, setViewAsManagerId] = useState<string | null>(null);
  const [allManagers, setAllManagers] = useState<Array<{ id: string; name: string; role: string }>>([]);

  const [pendingGroupRequests, setPendingGroupRequests] = useState(0);
  const [pendingExceptionRequests, setPendingExceptionRequests] = useState(0);
  const [pendingCalendarAlerts, setPendingCalendarAlerts] = useState(0);
  const [pendingModifications, setPendingModifications] = useState(0);
  const [recentSignedModifications, setRecentSignedModifications] = useState(0);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<VacationRequest | null>(null);
  const [editSelectedDates, setEditSelectedDates] = useState<Date[]>([]);
  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [editEmployeeName, setEditEmployeeName] = useState("");
  const [editEmployeeEmail, setEditEmployeeEmail] = useState("");
  const [editWorkerNumber, setEditWorkerNumber] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editManagerStatus, setEditManagerStatus] = useState("PENDING");
  const [editManagerRejectionReason, setEditManagerRejectionReason] = useState("");
  const [editStatus, setEditStatus] = useState("PENDING");
  const [editAdminRejectionReason, setEditAdminRejectionReason] = useState("");

  const [calendarPreviewOpen, setCalendarPreviewOpen] = useState(false);
  const [calendarPreviewWorkerId, setCalendarPreviewWorkerId] = useState<string | null>(null);
  const [calendarPreviewWorkerName, setCalendarPreviewWorkerName] = useState("");
  const [calendarPreviewWorkerNumber, setCalendarPreviewWorkerNumber] = useState("");
  const [calendarPreviewLoading, setCalendarPreviewLoading] = useState(false);

  // Active tab + visited tabs cache
  const resolvedTab = (embedded && externalTab ? externalTab : undefined) as AdminTab | undefined;
  const [localTab, setLocalTab] = useState<AdminTab>("dashboard");
  const activeTab: AdminTab = resolvedTab ?? localTab;
  const [visitedTabs, setVisitedTabs] = useState<Set<AdminTab>>(new Set(["dashboard"]));

  const handleTabChange = (tab: AdminTab) => {
    if (embedded && externalOnTabChange) {
      externalOnTabChange(tab);
    } else {
      setLocalTab(tab);
    }
    setVisitedTabs(prev => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  };

  const sessionToken = localStorage.getItem("manager_session_token") || "";

  /* ── Data fetching (unchanged logic) ── */
  const openCalendarPreview = async (workerNumber: string, workerName: string) => {
    setCalendarPreviewLoading(true);
    setCalendarPreviewWorkerName(workerName);
    setCalendarPreviewWorkerNumber(workerNumber);
    setCalendarPreviewOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getWorkerByNumberForCalendar", sessionToken, data: { workerNumber } },
      });
      if (error || data?.error) { toast.error("No se pudo encontrar el trabajador"); setCalendarPreviewOpen(false); return; }
      setCalendarPreviewWorkerId(data.worker?.id || null);
    } catch { toast.error("Error al cargar calendario"); setCalendarPreviewOpen(false); }
    finally { setCalendarPreviewLoading(false); }
  };

  const fetchPendingGroupRequests = async () => {
    try {
      const { data: response } = await supabase.functions.invoke("admin-operations", { body: { action: "getGroupJoinRequests", sessionToken, data: {} } });
      if (response?.success && response?.requests) setPendingGroupRequests(response.requests.filter((r: any) => r.status === "PENDING").length);
    } catch {}
  };

  const fetchPendingExceptionRequests = async () => {
    try {
      const { data: response } = await supabase.functions.invoke("admin-operations", { body: { action: "getDayExceptionRequests", sessionToken, data: {} } });
      if (response?.success && response?.requests) setPendingExceptionRequests(response.requests.filter((r: any) => r.status === "PENDING_ADMIN").length);
    } catch {}
  };

  const fetchPendingCalendarAlerts = async () => {
    try {
      const { data: response } = await supabase.functions.invoke("admin-operations", { body: { action: "getCalendarReviewAlerts", sessionToken, data: {} } });
      if (response?.success && response?.alerts) setPendingCalendarAlerts(response.alerts.filter((a: any) => !a.is_resolved).length);
    } catch {}
  };

  const fetchPendingModifications = async () => {
    try {
      const { data: response } = await supabase.functions.invoke("admin-operations", { body: { action: "getCalendarModificationsCount", sessionToken, data: {} } });
      if (response?.success) { setPendingModifications(response.pendingCount || 0); setRecentSignedModifications(response.recentSignedCount || 0); }
    } catch {}
  };

  useEffect(() => {
    if (!embedded) {
      if (!isAuthenticated) { navigate("/login"); return; }
      if (!isAdmin) { navigate("/manager"); return; }
    }
    fetchDepartments();
    fetchDepartmentManagers();
    fetchRequests();
    fetchPendingGroupRequests();
    fetchPendingExceptionRequests();
    fetchPendingCalendarAlerts();
    fetchPendingModifications();
    fetchAllManagers();
  }, [isAuthenticated, isAdmin, navigate, embedded]);

  const fetchAllManagers = async () => {
    try {
      const { data, error } = await supabase.rpc("get_public_managers");
      if (!error && data) setAllManagers(data.filter((m: any) => m.role !== 'admin'));
    } catch {}
  };

  const fetchDepartments = async () => {
    const { data, error } = await supabase.rpc('get_public_departments');
    if (error) { toast.error("Error al cargar departamentos"); return; }
    const depts = (data || []).map((d: any) => ({ id: d.id, name: d.name }));
    depts.sort((a: any, b: any) => a.name.localeCompare(b.name));
    setDepartments(depts);
  };

  const fetchDepartmentManagers = async () => {
    try {
      const { data: resp, error } = await supabase.functions.invoke("admin-operations", { body: { action: "getAssignments", sessionToken, data: {} } });
      if (error || !resp?.success) { setDepartmentManagers([]); return; }
      const assignments = resp.assignments || [];
      const map = new Map<string, string>();
      assignments.forEach((a: any) => {
        if (a.department_id && a?.managers?.role === "manager" && a?.managers?.name && !map.has(a.department_id)) map.set(a.department_id, a.managers.name);
      });
      setDepartmentManagers(Array.from(map.entries()).map(([department_id, manager_name]) => ({ department_id, manager_name })));
    } catch { setDepartmentManagers([]); }
  };

  const getManagerForDepartment = (departmentId: string): string => {
    return departmentManagers.find(dm => dm.department_id === departmentId)?.manager_name || "Sin asignar";
  };

  const fetchRequests = async () => {
    if (!sessionToken || !isAuthenticated || !isAdmin) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getVacationRequests", sessionToken, data: { departmentId: selectedDepartment, status: "all", managerStatus: "all" } }
      });
      if (error || !response?.success) { if (response?.error !== "Invalid session") toast.error("Error al cargar solicitudes"); setLoading(false); return; }
      setRequests(response.requests || []);
    } catch { toast.error("Error al cargar solicitudes"); }
    setLoading(false);
  };

  useEffect(() => { if (isAuthenticated && isAdmin) fetchRequests(); }, [selectedDepartment, isAuthenticated, isAdmin]);

  const updateRequestStatus = async (id: string, status: string, adminComment?: string) => {
    const request = requests.find(r => r.id === id);
    if (!request) return;
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "updateVacationRequestStatus", sessionToken, data: { requestId: id, updates: { status, admin_rejection_reason: status === "REJECTED" ? adminComment : null } } }
      });
      if (error || !response?.success) { toast.error("Error al actualizar solicitud"); return; }
      try {
        await supabase.functions.invoke("admin-operations", {
          body: { action: "sendVacationEmail", sessionToken, data: { to: request.employee_email, type: "admin_response", emailData: { employeeName: request.employee_name, workerNumber: request.worker_number, departmentName: request.departments.name, dates: request.vacation_request_dates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(d => format(new Date(d.date), "d 'de' MMMM 'de' yyyy", { locale: es })), status, rejectionReason: adminComment, editLink: `${window.location.origin}/d/${request.departments.public_token}` } } }
        });
      } catch {}
      toast.success(`Solicitud ${status === "APPROVED" ? "aprobada" : "rechazada"}`);
      fetchRequests();
    } catch { toast.error("Error al actualizar solicitud"); }
  };

  const handleApprove = (id: string) => { setSelectedRequestId(id); setDialogType("approve"); setComment(""); setDialogOpen(true); };
  const handleReject = (id: string) => { setSelectedRequestId(id); setDialogType("reject"); setComment(""); setDialogOpen(true); };
  const handleDeleteRequest = (id: string) => { setSelectedRequestId(id); setDialogType("delete"); setDialogOpen(true); };
  const toggleSelectRequest = (id: string) => { setSelectedRequestIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const handleBulkDelete = () => { if (selectedRequestIds.size === 0) return; setDialogType("bulkDelete"); setDialogOpen(true); };

  const deleteRequest = async (id: string) => {
    try {
      setDeletingIds(prev => new Set(prev).add(id));
      const { data: response, error } = await supabase.functions.invoke("admin-operations", { body: { action: "deleteVacationRequest", sessionToken, data: { requestId: id } } });
      if (error || !response?.success) { toast.error("Error al eliminar solicitud"); setDeletingIds(prev => { const n = new Set(prev); n.delete(id); return n; }); return; }
      setRequests(prev => prev.filter(r => r.id !== id));
      setDeletingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      toast.success("Solicitud eliminada");
    } catch { toast.error("Error al eliminar solicitud"); setDeletingIds(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  const bulkDeleteRequests = async () => {
    const ids = Array.from(selectedRequestIds);
    setDeletingIds(new Set(ids));
    let c = 0;
    for (const id of ids) {
      try {
        const { data: response, error } = await supabase.functions.invoke("admin-operations", { body: { action: "deleteVacationRequest", sessionToken, data: { requestId: id } } });
        if (!error && response?.success) { c++; setRequests(prev => prev.filter(r => r.id !== id)); }
      } catch {}
    }
    setDeletingIds(new Set()); setSelectedRequestIds(new Set());
    toast.success(`${c} solicitud(es) eliminada(s)`);
  };

  const handleDialogConfirm = () => {
    if (dialogType === "delete") { deleteRequest(selectedRequestId); setDialogOpen(false); return; }
    if (dialogType === "bulkDelete") { bulkDeleteRequests(); setDialogOpen(false); return; }
    if (dialogType === "reject" && !comment.trim()) { toast.error("Debes proporcionar un motivo del rechazo"); return; }
    updateRequestStatus(selectedRequestId, dialogType === "approve" ? "APPROVED" : "REJECTED", comment || undefined);
    setDialogOpen(false); setComment("");
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  const handleEditRequest = async (request: VacationRequest) => {
    setEditingRequest(request);
    setEditSelectedDates(request.vacation_request_dates.map(d => new Date(d.date)));
    setEditEmployeeName(request.employee_name);
    setEditEmployeeEmail(request.employee_email);
    setEditWorkerNumber(request.worker_number);
    setEditNotes(request.notes || "");
    setEditManagerStatus(request.manager_status || "PENDING");
    setEditManagerRejectionReason(request.manager_rejection_reason || "");
    setEditStatus(request.status);
    setEditAdminRejectionReason(request.admin_rejection_reason || "");
    try {
      const { data: availResponse, error: availError } = await supabase.functions.invoke("admin-operations", {
        body: { action: 'getDepartmentAvailabilities', sessionToken, data: { departmentId: request.department_id } }
      });
      if (!availError && availResponse?.success && availResponse?.availabilities) setAvailableDates(availResponse.availabilities.map((d: { date: string }) => new Date(d.date)));
    } catch {}
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingRequest) return;
    try {
      const { data: datesResponse, error: datesError } = await supabase.functions.invoke("admin-operations", {
        body: { action: "updateVacationRequestDates", sessionToken, data: { requestId: editingRequest.id, dates: editSelectedDates.map(date => format(date, "yyyy-MM-dd")) } }
      });
      if (datesError || !datesResponse?.success) throw new Error("Failed to update dates");
      const { data: statusResponse, error: statusError } = await supabase.functions.invoke("admin-operations", {
        body: { action: "updateVacationRequestStatus", sessionToken, data: { requestId: editingRequest.id, updates: { employee_name: editEmployeeName, employee_email: editEmployeeEmail, worker_number: editWorkerNumber, notes: editNotes || null, manager_status: editManagerStatus, manager_rejection_reason: editManagerStatus === "REJECTED" ? editManagerRejectionReason : null, status: editStatus, admin_rejection_reason: editStatus === "REJECTED" ? editAdminRejectionReason : null, edit_request_status: editingRequest.edit_request_status === "PENDING" ? "COMPLETED" : editingRequest.edit_request_status } } }
      });
      if (statusError || !statusResponse?.success) throw new Error("Failed to update request fields");
      const datesChanged = editSelectedDates.length !== editingRequest.vacation_request_dates.length || !editSelectedDates.every(d => editingRequest.vacation_request_dates.some(rd => new Date(rd.date).toDateString() === d.toDateString()));
      if (datesChanged) {
        try {
          await supabase.functions.invoke("admin-operations", {
            body: { action: "sendVacationEmail", sessionToken, data: { to: editEmployeeEmail, type: "request_modified", emailData: { employeeName: editEmployeeName, workerNumber: editWorkerNumber, departmentName: editingRequest.departments.name, dates: editSelectedDates.sort((a, b) => a.getTime() - b.getTime()).map(d => format(d, "d 'de' MMMM 'de' yyyy", { locale: es })) } } }
          });
        } catch {}
      }
      toast.success("Solicitud modificada correctamente");
      setEditDialogOpen(false); setEditingRequest(null); fetchRequests();
    } catch { toast.error("Error al modificar la solicitud"); }
  };

  const isDateAvailable = (date: Date) => availableDates.some(d => d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate());

  const getStatusBadge = (status: string) => {
    const cfg = { PENDING: { label: "Pendiente", variant: "secondary" as const, icon: Clock }, APPROVED: { label: "Enviado", variant: "default" as const, icon: CheckCircle }, REJECTED: { label: "Denegada", variant: "destructive" as const, icon: XCircle } };
    const c = cfg[status as keyof typeof cfg];
    const Icon = c.icon;
    return <Badge variant={c.variant} className="gap-1"><Icon className="h-3 w-3" />{c.label}</Badge>;
  };

  const fuzzyMatch = (text: string, query: string): boolean => {
    if (!query.trim()) return true;
    const tl = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const ql = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (tl.includes(ql)) return true;
    return ql.split(/\s+/).every(w => tl.includes(w));
  };

  const filteredRequests = requests.filter(r => {
    if (searchQuery.trim() && !fuzzyMatch(r.employee_name, searchQuery) && !r.worker_number.includes(searchQuery.trim())) return false;
    if (selectedStatus !== "all" && r.status !== selectedStatus) return false;
    if (selectedManagerStatus !== "all" && (r.manager_status || "PENDING") !== selectedManagerStatus) return false;
    return true;
  });

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === "PENDING").length,
    approved: requests.filter(r => r.status === "APPROVED").length,
    rejected: requests.filter(r => r.status === "REJECTED").length,
  };

  const isSecondaryTab = secondaryTabs.some(t => t.id === activeTab);

  const hasBadge = (tabId: AdminTab) => {
    if (tabId === "requests" && stats.pending > 0) return stats.pending;
    if (tabId === "exceptions" && pendingExceptionRequests > 0) return pendingExceptionRequests;
    if (tabId === "groups" && pendingGroupRequests > 0) return pendingGroupRequests;
    if (tabId === "modifications" && pendingModifications > 0) return pendingModifications;
    
    return 0;
  };

  const totalPending = stats.pending + pendingExceptionRequests + pendingGroupRequests + pendingModifications;

  const chartData = [
    { name: "Pendientes", value: stats.pending, color: "hsl(45 93% 47%)" },
    { name: "Enviadas", value: stats.approved, color: "hsl(var(--primary))" },
    { name: "Denegadas", value: stats.rejected, color: "hsl(var(--destructive))" },
  ];

  const pieData = [
    { name: "Excepciones", value: pendingExceptionRequests || 0, color: "hsl(var(--destructive))" },
    { name: "Grupos", value: pendingGroupRequests || 0, color: "hsl(var(--primary))" },
    { name: "Modificaciones", value: pendingModifications || 0, color: "hsl(var(--muted-foreground))" },
  ].filter(d => d.value > 0);

  // Skeleton helpers
  const SkeletonKPI = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-card border border-border/30 p-5 space-y-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-12" />
        </div>
      ))}
    </div>
  );

  // Department breakdown for dashboard
  const deptBreakdown = departments.map(d => {
    const deptRequests = requests.filter(r => r.department_id === d.id);
    return {
      name: d.name,
      id: d.id,
      total: deptRequests.length,
      pending: deptRequests.filter(r => r.status === "PENDING").length,
      approved: deptRequests.filter(r => r.status === "APPROVED").length,
      rejected: deptRequests.filter(r => r.status === "REJECTED").length,
      manager: getManagerForDepartment(d.id),
    };
  }).filter(d => d.total > 0).sort((a, b) => b.pending - a.pending || b.total - a.total);

  // Recent requests (last 5)
  const recentRequests = [...requests]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const renderDashboard = () => (
    <div className="space-y-8">
      {/* KPI strip */}
      {loading ? <SkeletonKPI /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Total solicitudes", value: stats.total, sub: `${departments.length} departamentos`, onClick: () => { setSelectedStatus("all"); handleTabChange("requests"); } },
            { label: "Pendientes", value: stats.pending, sub: "Esperando aprobación", onClick: () => { setSelectedStatus("PENDING"); handleTabChange("requests"); }, accent: stats.pending > 0 },
            { label: "Enviadas", value: stats.approved, sub: "Aprobadas por admin", onClick: () => { setSelectedStatus("APPROVED"); handleTabChange("requests"); } },
            { label: "Denegadas", value: stats.rejected, sub: "Rechazadas", onClick: () => { setSelectedStatus("REJECTED"); handleTabChange("requests"); } },
            { label: "Modificaciones", value: pendingModifications, sub: `${pendingModifications} pendientes`, onClick: () => handleTabChange("modifications"), accent: pendingModifications > 0 },
          ].map((kpi, i) => (
            <button key={i} onClick={kpi.onClick}
              className={cn(
                "relative rounded-2xl bg-card border p-5 text-left transition-all duration-200 hover:shadow-lg hover:scale-[1.01] group",
                kpi.accent ? "border-primary/40 shadow-sm" : "border-border/30 hover:border-border/60"
              )}>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">{kpi.label}</p>
              <p className={cn("text-3xl font-semibold tracking-tight", kpi.accent ? "text-primary" : "text-foreground")}>{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">{kpi.sub}</p>
              {kpi.accent && <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary animate-pulse" />}
            </button>
          ))}
        </div>
      )}

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Charts + table */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vacation chart */}
          <Card className="border-border/30 rounded-2xl shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Distribución de vacaciones</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{stats.total} solicitudes en total</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedStatus("all"); handleTabChange("requests"); }} className="text-xs text-muted-foreground hover:text-primary h-7">
                  Ver todas <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
              {stats.total > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={76} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-popover text-popover-foreground border border-border rounded-xl text-xs px-3 py-2 shadow-lg">
                            <p className="font-medium mb-0.5">{d.name}</p>
                            <p className="text-muted-foreground">{d.value} solicitudes</p>
                          </div>
                        );
                      }}
                      cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24}>
                      {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[160px] text-muted-foreground text-sm">Sin solicitudes</div>
              )}
            </CardContent>
          </Card>

          {/* Department table */}
          {deptBreakdown.length > 0 && (
            <Card className="border-border/30 rounded-2xl shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Por departamento</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{deptBreakdown.length} departamentos con solicitudes</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/admin/departments")} className="text-xs text-muted-foreground hover:text-primary h-7">
                    Gestionar <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
                <div className="overflow-hidden rounded-xl border border-border/30">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2.5 uppercase tracking-wider">Departamento</th>
                        <th className="text-center text-[11px] font-medium text-muted-foreground px-3 py-2.5 uppercase tracking-wider hidden sm:table-cell">Pend.</th>
                        <th className="text-center text-[11px] font-medium text-muted-foreground px-3 py-2.5 uppercase tracking-wider hidden sm:table-cell">Env.</th>
                        <th className="text-center text-[11px] font-medium text-muted-foreground px-3 py-2.5 uppercase tracking-wider hidden sm:table-cell">Den.</th>
                        <th className="text-center text-[11px] font-medium text-muted-foreground px-3 py-2.5 uppercase tracking-wider">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptBreakdown.slice(0, 8).map((d, i) => (
                        <tr key={d.id}
                          className={cn("transition-colors hover:bg-muted/20 cursor-pointer", i !== 0 && "border-t border-border/20")}
                          onClick={() => { setSelectedDepartment(d.id); setSelectedStatus("all"); handleTabChange("requests"); }}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-foreground text-xs">{d.name}</p>
                            <p className="text-[10px] text-muted-foreground">{d.manager}</p>
                          </td>
                          <td className="text-center px-3 py-2.5 hidden sm:table-cell">
                            {d.pending > 0 ? <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold px-1.5">{d.pending}</span> : <span className="text-muted-foreground/40 text-xs">—</span>}
                          </td>
                          <td className="text-center px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{d.approved || "—"}</td>
                          <td className="text-center px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{d.rejected || "—"}</td>
                          <td className="text-center px-3 py-2.5 text-xs font-medium text-foreground">{d.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {deptBreakdown.length > 8 && (
                    <div className="px-4 py-2 text-center border-t border-border/20">
                      <button onClick={() => navigate("/admin/departments")} className="text-xs text-primary hover:underline">
                        Ver los {deptBreakdown.length} departamentos
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Pending summary */}
          <Card className="border-border/30 rounded-2xl shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">Pendiente de revisión</h3>
              <div className="space-y-3">
                {[
                  { label: "Solicitudes vacaciones", value: stats.pending, icon: FileText, onClick: () => { setSelectedStatus("PENDING"); handleTabChange("requests"); }, color: "text-primary" },
                  { label: "Modificaciones calendario", value: pendingModifications, icon: FileEdit, onClick: () => handleTabChange("modifications"), color: "text-foreground" },
                  { label: "Excepciones de día", value: pendingExceptionRequests, icon: AlertTriangle, onClick: () => handleTabChange("exceptions"), color: "text-destructive" },
                  { label: "Solicitudes de grupo", value: pendingGroupRequests, icon: UserPlus, onClick: () => handleTabChange("groups"), color: "text-foreground" },
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <button key={i} onClick={item.onClick}
                      className="w-full flex items-center gap-3 py-2 transition-colors hover:bg-muted/30 rounded-lg px-2 -mx-2 group">
                      <Icon className={cn("h-4 w-4 flex-shrink-0", item.value > 0 ? item.color : "text-muted-foreground/40")} />
                      <span className={cn("text-sm flex-1 text-left", item.value > 0 ? "text-foreground" : "text-muted-foreground/60")}>{item.label}</span>
                      <span className={cn("text-sm font-semibold tabular-nums", item.value > 0 ? item.color : "text-muted-foreground/40")}>{item.value}</span>
                    </button>
                  );
                })}
              </div>
              {totalPending === 0 && (
                <div className="mt-4 pt-3 border-t border-border/20 text-center">
                  <p className="text-xs text-muted-foreground">✓ Todo al día</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent activity */}
          {recentRequests.length > 0 && (
            <Card className="border-border/30 rounded-2xl shadow-sm">
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4">Actividad reciente</h3>
                <div className="space-y-3">
                  {recentRequests.map((r) => (
                    <div key={r.id} className="flex items-start gap-3">
                      <div className={cn(
                        "h-2 w-2 rounded-full mt-1.5 flex-shrink-0",
                        r.status === "PENDING" ? "bg-primary" : r.status === "APPROVED" ? "bg-primary/40" : "bg-destructive/40"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{r.employee_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {r.vacation_request_dates.length} días · {r.departments.name}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 tabular-nums">
                        {format(new Date(r.created_at), "d MMM", { locale: es })}
                      </span>
                    </div>
                  ))}
                </div>
                <button onClick={() => { setSelectedStatus("all"); handleTabChange("requests"); }}
                  className="mt-4 pt-3 border-t border-border/20 w-full text-center text-xs text-primary hover:underline">
                  Ver todas las solicitudes
                </button>
              </CardContent>
            </Card>
          )}

          {/* Quick links */}
          <Card className="border-border/30 rounded-2xl shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Accesos rápidos</h3>
              <div className="space-y-1">
                {[
                  { label: "Departamentos", icon: Building2, onClick: () => navigate("/admin/departments") },
                  { label: "Calendario anual", icon: Calendar, onClick: () => navigate("/admin/annual-calendar") },
                  { label: "Encargados", icon: UserCog, onClick: () => navigate("/admin/managers") },
                ].map((link, i) => {
                  const Icon = link.icon;
                  return (
                    <button key={i} onClick={link.onClick}
                      className="w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/30 transition-colors text-left group">
                      <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="text-sm text-foreground">{link.label}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 ml-auto group-hover:text-muted-foreground transition-colors" />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  /* ── RENDER ── */
  return (
    <div className={cn("bg-background flex flex-col", !embedded && "min-h-screen")}>
      {!embedded && (
      <header className="glass-header">
...
      </header>
      )}

      {/* Desktop navigation - pill tabs */}
      <div className="hidden md:block border-b border-border/20">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-1">
          {primaryTabs.map(tab => {
            const Icon = tab.icon;
            const badge = hasBadge(tab.id);
            return (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all relative",
                  activeTab === tab.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}>
                <Icon className="h-4 w-4" />{tab.label}
                {badge > 0 && activeTab !== tab.id && (
                  <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full px-1 ml-1">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                isSecondaryTab ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}>
                <MoreHorizontal className="h-4 w-4" />
                {isSecondaryTab ? secondaryTabs.find(t => t.id === activeTab)?.label : "Más"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-popover border border-border/60 shadow-xl min-w-[200px] p-1.5">
              {secondaryTabs.map(tab => {
                const Icon = tab.icon;
                const badge = hasBadge(tab.id);
                return (
                  <DropdownMenuItem key={tab.id} onClick={() => handleTabChange(tab.id)} className={cn("cursor-pointer gap-2 rounded-lg px-3 py-2.5 text-sm", activeTab === tab.id ? "bg-primary/15 text-primary font-medium" : "hover:bg-muted")}>
                    <Icon className="h-4 w-4" />{tab.label}
                    {badge > 0 && (
                      <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full px-1 ml-auto">
                        {badge}
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content — cached tabs: once visited, kept mounted but hidden */}
      <main className="flex-1 pb-24 md:pb-6">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">

          {/* Dashboard — always mounted */}
          <div className={activeTab !== "dashboard" ? "hidden" : undefined}>
            {renderDashboard()}
          </div>




          {/* Solicitudes — always mounted once visited */}
          {visitedTabs.has("requests") && (
            <div className={activeTab !== "requests" ? "hidden" : undefined}>
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar nombre o nº fichar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 pr-9 rounded-2xl h-9 text-sm border-border/30" />
                    {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                      <SelectTrigger className="w-[150px] rounded-2xl h-8 text-xs border-border/30"><SelectValue placeholder="Departamento" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                      <SelectTrigger className="w-[130px] rounded-2xl h-8 text-xs border-border/30"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="PENDING">Pendiente</SelectItem>
                        <SelectItem value="APPROVED">Enviada</SelectItem>
                        <SelectItem value="REJECTED">Denegada</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={selectedManagerStatus} onValueChange={setSelectedManagerStatus}>
                      <SelectTrigger className="w-[150px] rounded-2xl h-8 text-xs border-border/30"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Encargado: Todos</SelectItem>
                        <SelectItem value="PENDING">Pendiente</SelectItem>
                        <SelectItem value="APPROVED">Aprobado</SelectItem>
                        <SelectItem value="REJECTED">Rechazado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {selectedRequestIds.size > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm">
                    <span className="font-medium">{selectedRequestIds.size} seleccionada(s)</span>
                    <Button size="sm" variant="destructive" onClick={handleBulkDelete} className="gap-1 h-7 text-xs rounded-lg"><Trash2 className="h-3 w-3" />Eliminar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedRequestIds(new Set())} className="text-xs h-7">Deseleccionar</Button>
                  </div>
                )}

                {loading ? (
                  <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}</div>
                ) : filteredRequests.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
                    <CheckCircle className="h-10 w-10 text-primary/30" />
                    <span className="text-sm">{searchQuery ? `Sin resultados para "${searchQuery}"` : "No hay solicitudes"}</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredRequests.map(request => (
                      <Card key={request.id} className={cn("border-border/30 rounded-2xl transition-all", deletingIds.has(request.id) && "opacity-50 scale-95 pointer-events-none", selectedRequestIds.has(request.id) && "ring-2 ring-primary/50")}>
                        <CardContent className="p-4">
                          <div className="flex gap-3">
                            <Checkbox checked={selectedRequestIds.has(request.id)} onCheckedChange={() => toggleSelectRequest(request.id)} className="mt-1 flex-shrink-0" />
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-semibold text-sm text-foreground truncate">{request.employee_name}</h3>
                                    {request.is_admin_request && (
                                      <Badge variant="outline" className="text-[10px] bg-accent text-accent-foreground border-border/50"><UserPlus className="h-2.5 w-2.5 mr-0.5" />{request.requested_by_admin_name || 'Admin'}</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                    <a href={`https://salix.verdnatura.es/#/worker/${request.worker_number}/calendar`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Nº {request.worker_number}</a>
                                    <span>·</span>
                                    <button onClick={() => setSelectedDepartment(request.department_id)} className="text-primary hover:underline">{request.departments.name}</button>
                                    {request.work_group && (
                                      <>
                                        <span>·</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: request.work_group.color }} />{request.work_group.name}</span>
                                      </>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">Encargado: {getManagerForDepartment(request.department_id)}</p>
                                </div>
                                <div className="flex flex-col gap-1 items-end flex-shrink-0">
                                  {getStatusBadge(request.status)}
                                  <Badge variant={request.manager_status === "APPROVED" ? "default" : request.manager_status === "REJECTED" ? "destructive" : "secondary"} className="text-[10px]">
                                    Enc: {request.manager_status === "APPROVED" ? "✓" : request.manager_status === "REJECTED" ? "✗" : "⏳"}
                                    {request.manager_status && request.manager_status !== "PENDING" && request.manager_action_by && <span className="ml-1 opacity-70">{request.manager_action_by}</span>}
                                  </Badge>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-1">
                                {request.vacation_request_dates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((d, i) => (
                                  <Badge key={i} variant="outline" className="text-[10px] px-1.5">{format(new Date(d.date), "d MMM", { locale: es })}</Badge>
                                ))}
                              </div>

                              {request.edit_request_status === "PENDING" && request.edit_request_reason && (
                                <div className="flex items-start gap-2 p-2 bg-accent rounded-lg border border-border/30 text-xs">
                                  <MessageSquare className="h-3.5 w-3.5 text-accent-foreground flex-shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-medium text-accent-foreground">Edición solicitada ({request.edit_request_by}): </span>
                                    <span className="text-muted-foreground">{request.edit_request_reason}</span>
                                  </div>
                                </div>
                              )}
                              {request.notes && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Obs:</span> {request.notes}</p>}
                              {request.manager_rejection_reason && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Motivo enc.:</span> {request.manager_rejection_reason}</p>}
                              {request.admin_rejection_reason && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Motivo admin:</span> {request.admin_rejection_reason}</p>}
                              <p className="text-[10px] text-muted-foreground">{format(new Date(request.created_at), "d MMM yyyy, HH:mm", { locale: es })}</p>

                              <div className="flex items-center gap-1.5 pt-1 border-t border-border/20">
                                {request.status === "PENDING" && (
                                  <>
                                    <Button size="sm" onClick={() => handleApprove(request.id)} className="h-7 rounded-lg text-xs gap-1"><CheckCircle className="h-3 w-3" />Enviar</Button>
                                    <Button size="sm" variant="destructive" onClick={() => handleReject(request.id)} className="h-7 rounded-lg text-xs gap-1"><XCircle className="h-3 w-3" />Denegar</Button>
                                  </>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => openCalendarPreview(request.worker_number, request.employee_name)} className="h-7 w-7 p-0 rounded-full text-primary"><CalendarDays className="h-3.5 w-3.5" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => handleEditRequest(request)} className="h-7 rounded-lg text-xs gap-1 text-muted-foreground"><Edit className="h-3 w-3" />Editar</Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDeleteRequest(request.id)} className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Excepciones — cached */}
          {visitedTabs.has("exceptions") && (
            <div className={activeTab !== "exceptions" ? "hidden" : undefined}>
              <DayExceptionRequestsPanel onUpdate={fetchPendingExceptionRequests} />
            </div>
          )}

          {/* Grupos — cached */}
          {visitedTabs.has("groups") && (
            <div className={activeTab !== "groups" ? "hidden" : undefined}>
              <Tabs defaultValue="group-requests">
                <TabsList className="mb-4"><TabsTrigger value="group-requests">Solicitudes de grupo</TabsTrigger><TabsTrigger value="dept-corrections">Correcciones dept.</TabsTrigger></TabsList>
                <TabsContent value="group-requests"><GroupJoinRequestsPanel onUpdate={fetchPendingGroupRequests} /></TabsContent>
                <TabsContent value="dept-corrections"><DepartmentCorrectionRequestsPanel onUpdate={fetchPendingGroupRequests} /></TabsContent>
              </Tabs>
            </div>
          )}

          {/* Modificaciones — cached */}
          {visitedTabs.has("modifications") && (
            <div className={activeTab !== "modifications" ? "hidden" : undefined}>
              <CalendarModificationsPanel sessionToken={sessionToken} onSessionExpired={logout} />
            </div>
          )}

          {/* Histórico — cached */}
          {visitedTabs.has("history") && (
            <div className={activeTab !== "history" ? "hidden" : undefined}>
              <WorkerHistoryPanel />
            </div>
          )}

          {/* Auditoría — cached */}
          {visitedTabs.has("audit") && (
            <div className={activeTab !== "audit" ? "hidden" : undefined}>
              <AuditLogsPanel sessionToken={sessionToken} />
            </div>
          )}

          {/* Límites — cached */}
          {visitedTabs.has("limits") && (
            <div className={activeTab !== "limits" ? "hidden" : undefined}>
              <AppLimitsPanel sessionToken={sessionToken} />
            </div>
          )}

          {/* Intercambios — cached */}
          {visitedTabs.has("exchanges") && (
            <div className={activeTab !== "exchanges" ? "hidden" : undefined}>
              <GroupExchangesPanel sessionToken={sessionToken} />
            </div>
          )}

          {/* Backups — cached */}
          {visitedTabs.has("backups") && (
            <div className={activeTab !== "backups" ? "hidden" : undefined}>
              <BackupPanel sessionToken={sessionToken} />
            </div>
          )}

        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border/30 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center justify-around h-16 px-1">
          {primaryTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badge = hasBadge(tab.id);
            return (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)} className={cn("relative flex flex-col items-center gap-0.5 py-2 px-3 transition-colors", isActive ? "text-primary" : "text-muted-foreground")}>
                <Icon className="h-5 w-5" />
                <span className="text-[9px] font-medium">{tab.shortLabel}</span>
                {badge > 0 && !isActive && (
                  <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold bg-destructive text-destructive-foreground rounded-full px-0.5">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn("relative flex flex-col items-center gap-0.5 py-2 px-3 transition-colors", isSecondaryTab ? "text-primary" : "text-muted-foreground")}>
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-[9px] font-medium">Más</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="bg-popover border border-border/60 shadow-xl min-w-[200px] mb-2 p-1.5">
              {secondaryTabs.map(tab => {
                const Icon = tab.icon;
                return <DropdownMenuItem key={tab.id} onClick={() => handleTabChange(tab.id)} className={cn("cursor-pointer gap-2 rounded-lg px-3 py-2.5 text-sm", activeTab === tab.id ? "bg-primary/15 text-primary font-medium" : "hover:bg-muted")}><Icon className="h-4 w-4" />{tab.label}</DropdownMenuItem>;
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      {/* Confirm Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogType === "approve" ? "Enviar confirmación" : dialogType === "reject" ? "Denegar solicitud" : dialogType === "bulkDelete" ? `Eliminar ${selectedRequestIds.size} solicitud(es)` : "Eliminar Solicitud"}</DialogTitle>
            <DialogDescription>{dialogType === "approve" ? "Se enviará el email de confirmación al trabajador." : dialogType === "reject" ? "Indica el motivo de la denegación." : dialogType === "bulkDelete" ? `¿Eliminar ${selectedRequestIds.size} solicitud(es)? No se puede deshacer.` : "¿Eliminar esta solicitud? No se puede deshacer."}</DialogDescription>
          </DialogHeader>
          {dialogType !== "delete" && dialogType !== "bulkDelete" && (
            <div className="space-y-2">
              <Label htmlFor="comment">{dialogType === "approve" ? "Comentario (opcional)" : "Motivo del rechazo *"}</Label>
              <Textarea id="comment" placeholder={dialogType === "approve" ? "Ej: Disfruta tus vacaciones." : "Ej: No hay disponibilidad."} value={comment} onChange={e => setComment(e.target.value)} rows={3} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleDialogConfirm} variant={dialogType === "approve" ? "default" : "destructive"}>{dialogType === "approve" ? "Aprobar" : dialogType === "reject" ? "Rechazar" : dialogType === "bulkDelete" ? `Eliminar ${selectedRequestIds.size}` : "Eliminar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Solicitud</DialogTitle>
            <DialogDescription>Modifica los campos de la solicitud</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nombre</Label><Input value={editEmployeeName} onChange={e => setEditEmployeeName(e.target.value)} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={editEmployeeEmail} onChange={e => setEditEmployeeEmail(e.target.value)} /></div>
              <div className="space-y-2"><Label>Nº Fichar</Label><Input value={editWorkerNumber} onChange={e => setEditWorkerNumber(e.target.value)} /></div>
              <div className="space-y-2"><Label>Departamento</Label><Input value={editingRequest?.departments.name || ""} disabled className="bg-muted" /></div>
            </div>
            <div className="space-y-2"><Label>Observaciones</Label><Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-xl border">
              <div className="space-y-2"><Label>Estado Encargado</Label><Select value={editManagerStatus} onValueChange={setEditManagerStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PENDING">Pendiente</SelectItem><SelectItem value="APPROVED">Aprobado</SelectItem><SelectItem value="REJECTED">Rechazado</SelectItem></SelectContent></Select></div>
              {editManagerStatus === "REJECTED" && <div className="space-y-2"><Label>Motivo</Label><Input value={editManagerRejectionReason} onChange={e => setEditManagerRejectionReason(e.target.value)} /></div>}
              <div className="space-y-2"><Label>Estado Admin</Label><Select value={editStatus} onValueChange={setEditStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PENDING">Pendiente</SelectItem><SelectItem value="APPROVED">Enviado</SelectItem><SelectItem value="REJECTED">Denegada</SelectItem></SelectContent></Select></div>
              {editStatus === "REJECTED" && <div className="space-y-2"><Label>Motivo</Label><Input value={editAdminRejectionReason} onChange={e => setEditAdminRejectionReason(e.target.value)} /></div>}
            </div>
            <div className="space-y-3">
              <Label>Fechas de vacaciones</Label>
              <div className="flex justify-center"><CalendarComponent mode="multiple" selected={editSelectedDates} onSelect={dates => setEditSelectedDates(dates || [])} disabled={date => date < new Date(new Date().getFullYear(), 0, 1)} locale={es} className="rounded-md border" numberOfMonths={2} /></div>
              <div className="mt-2">
                <p className="text-sm text-muted-foreground"><strong>{editSelectedDates.length}</strong> día(s)</p>
                {editSelectedDates.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{editSelectedDates.sort((a, b) => a.getTime() - b.getTime()).map((d, i) => <Badge key={i} variant="outline" className="text-[10px]">{format(d, "d MMM yyyy", { locale: es })}</Badge>)}</div>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={editSelectedDates.length === 0 || !editEmployeeName.trim() || !editEmployeeEmail.trim() || !editWorkerNumber.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Calendar Preview Dialog */}
      <Dialog open={calendarPreviewOpen} onOpenChange={setCalendarPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/30 pr-12">
            <DialogTitle>{calendarPreviewWorkerName}</DialogTitle>
            <DialogDescription className="flex items-center justify-between gap-4 flex-wrap">
              <span>Nº Fichar: {calendarPreviewWorkerNumber}</span>
              {calendarPreviewWorkerId && (
                <Button variant="default" size="sm" onClick={() => window.open(`/admin/worker-calendar/${calendarPreviewWorkerId}`, '_blank')} className="gap-2"><ExternalLink className="h-4 w-4" />Editar calendario</Button>
              )}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-120px)]">
            <div className="px-6 pb-6">
              {calendarPreviewLoading ? (
                <div className="flex items-center justify-center py-20"><Clock className="h-5 w-5 animate-spin text-muted-foreground" /><span className="ml-2 text-muted-foreground">Cargando...</span></div>
              ) : calendarPreviewWorkerId ? (
                <EmbeddedWorkerCalendar workerId={calendarPreviewWorkerId} sessionToken={sessionToken} onSessionExpired={logout} />
              ) : (
                <div className="text-center py-12 text-muted-foreground">No se encontró el trabajador</div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
