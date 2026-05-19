import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  FileText, CheckCircle, XCircle, Clock, LogOut, Loader2, 
  Calendar as CalendarIcon, Search, Filter, Eye, History,
  ArrowLeft, Users, Settings, Plus, Trash2, Edit, Mail,
  AlertTriangle, Link2, Copy, ExternalLink, Check, RotateCcw, MessageSquarePlus, Home,
  Bell, UserCheck, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import { useManagerAuth } from "@/modules/auth/hooks/useManagerAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import LoadingPanel from "@/components/LoadingPanel";
import LoadingScreen from "@/components/LoadingScreen";
import { JustificanteViewerDialog } from "@/components/JustificanteViewerDialog";
import { JustificanteThumbnail } from "@/components/JustificanteThumbnail";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JustificanteHistoricoPanel } from "@/components/JustificanteHistoricoPanel";
import { JustificantesStatsPanel } from "@/components/JustificantesStatsPanel";
import { JustificanteHistorialChat } from "@/components/JustificanteHistorialChat";

type DocumentoHistorial = {
  id: string;
  tipo_mensaje: "solicitud_docs" | "respuesta_docs";
  mensaje: string | null;
  archivo_url: string | null;
  archivo_nombre: string | null;
  archivo_tipo: string | null;
  actor_nombre: string;
  actor_rol: string;
  created_at: string;
};

type Justificante = {
  id: string;
  worker_id: string;
  worker_number: string;
  worker_name: string;
  department_id: string;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  comentario_empleado: string | null;
  archivo_url: string;
  archivo_nombre: string;
  archivo_tipo: string;
  estado: string;
  created_at: string;
  updated_at: string;
  time_entry_id: string | null;
  archivos_adicionales?: Array<{ url: string; nombre: string; tipo: string }> | null;
  last_viewed_at?: string | null;
  departments?: { name: string };
  has_vacation_account?: boolean;
  last_gestion_comment?: string | null;
  pending_docs_request?: boolean;
  documentos?: DocumentoHistorial[];
};

type Department = {
  id: string;
  name: string;
};

type HistoryEntry = {
  id: string;
  gestionado_por_nombre: string;
  accion: string;
  comentario_gestor: string | null;
  created_at: string;
};

type RrhhUser = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
};

type Absence = {
  id: string;
  entry_date: string;
  observation: string | null;
};

const JustificantesAdmin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isAdmin, logout, getSessionToken } = useManagerAuth();
  
  const [loading, setLoading] = useState(true);
  const [justificantes, setJustificantes] = useState<Justificante[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [activeTab, setActiveTab] = useState("justificantes");
  
  // Filters
  const [filterEstado, setFilterEstado] = useState<string>("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterFechaDesde, setFilterFechaDesde] = useState<Date | undefined>();
  const [filterFechaHasta, setFilterFechaHasta] = useState<Date | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Action dialog
  const [actionDialog, setActionDialog] = useState<{ open: boolean; justificante: Justificante | null; action: "gestionado" | "rechazado" | null }>({ open: false, justificante: null, action: null });
  const [actionComment, setActionComment] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  
  // Request documentation dialog
  const [requestDocsDialog, setRequestDocsDialog] = useState<{ open: boolean; justificante: Justificante | null }>({ open: false, justificante: null });
  const [requestDocsMessage, setRequestDocsMessage] = useState("");
  const [requestDocsLoading, setRequestDocsLoading] = useState(false);
  
  // History dialog (legacy)
  const [historyDialog, setHistoryDialog] = useState<{ open: boolean; justificante: Justificante | null; history: HistoryEntry[] }>({ open: false, justificante: null, history: [] });
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // Historial Chat dialog (new - full conversation view)
  const [historialChatDialog, setHistorialChatDialog] = useState<{ open: boolean; justificante: Justificante | null }>({ open: false, justificante: null });
  
  // Absences dialog
  const [absencesDialog, setAbsencesDialog] = useState<{ open: boolean; justificante: Justificante | null; absences: Absence[] }>({ open: false, justificante: null, absences: [] });
  const [absencesLoading, setAbsencesLoading] = useState(false);
  
  // File viewer dialog
  const [viewerDialog, setViewerDialog] = useState<{
    open: boolean;
    justificante: Justificante | null;
    relatedFiles: { id: string; archivo_url: string; archivo_nombre: string; archivo_tipo: string }[];
  }>({ open: false, justificante: null, relatedFiles: [] });

  // RRHH Users
  const [rrhhUsers, setRrhhUsers] = useState<RrhhUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userDialog, setUserDialog] = useState<{ open: boolean; user: RrhhUser | null; mode: "create" | "edit" }>({ open: false, user: null, mode: "create" });
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role: "rrhh", isActive: true });
  const [resettingPassword, setResettingPassword] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  // Settings
  const [notificationEmails, setNotificationEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Department notification settings (per department)
  const [departmentNotifications, setDepartmentNotifications] = useState<{ 
    department_id: string; 
    department_name: string; 
    enabled: boolean; 
    email: string; 
    manager_emails?: string[]; // Existing emails from department table
  }[]>([]);
  const [newDeptEmails, setNewDeptEmails] = useState<{ [key: string]: string }>({}); // For adding new emails per department
  
  // Manager notification settings (legacy - now per department)
  const [managerNotificationsEnabled, setManagerNotificationsEnabled] = useState(false);
  const [managerNotificationEmails, setManagerNotificationEmails] = useState<{ manager_id: string; manager_name: string; email: string; enabled: boolean }[]>([]);
  const [availableManagers, setAvailableManagers] = useState<{ id: string; name: string; department_id: string | null }[]>([]);
  const [newManagerEmail, setNewManagerEmail] = useState("");
  const [selectedManagerId, setSelectedManagerId] = useState("");
  
  // RRHH preview mode - now stores the selected user ID to impersonate
  const [previewAsRrhhUserId, setPreviewAsRrhhUserId] = useState<string | null>(null);
  const previewAsRrhh = !!previewAsRrhhUserId;

  // Form link copied state
  const [formLinkCopied, setFormLinkCopied] = useState(false);
  const formUrl = "https://vnprod.app/justificantes";

  // Sorting state - default to descending (most recent first)
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Auto-refresh settings
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number | null>(null);

  // RRHH session check
  const [rrhhSession, setRrhhSession] = useState<{ userId: string; name: string; role: string; sessionToken: string } | null>(null);

  useEffect(() => {
    // First check for RRHH session
    const storedRrhhSession = localStorage.getItem("rrhh_session");
    if (storedRrhhSession) {
      try {
        const session = JSON.parse(storedRrhhSession);
        setRrhhSession(session);
        fetchDepartments();
        fetchJustificantes(session.sessionToken);
        
        const highlightId = searchParams.get("id");
        if (highlightId) {
          setFilterEstado("all");
        }
        return;
      } catch (e) {
        localStorage.removeItem("rrhh_session");
      }
    }

    // Fall back to manager auth
    if (!isAuthenticated) {
      navigate("/justificantes/login");
      return;
    }
    if (!isAdmin) {
      navigate("/admin");
      return;
    }
    fetchDepartments();
    fetchJustificantes();
    // Fetch RRHH users for the "Ver como" dropdown
    fetchRrhhUsers();
    // Check if we should highlight a specific justificante
    const highlightId = searchParams.get("id");
    if (highlightId) {
      setFilterEstado("all");
    }
  }, [isAuthenticated, isAdmin, navigate, searchParams]);

  // Helper to get session token
  const getActiveSessionToken = () => {
    if (rrhhSession) return rrhhSession.sessionToken;
    return getSessionToken();
  };

  const copyFormLink = () => {
    navigator.clipboard.writeText(formUrl);
    setFormLinkCopied(true);
    toast.success("Enlace copiado");
    setTimeout(() => setFormLinkCopied(false), 2000);
  };


  const fetchDepartments = async () => {
    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: { action: "getDepartments", data: {} }
      });
      if (data?.success) {
        setDepartments(data.departments || []);
      }
    } catch (error) {
      console.error("Error fetching departments:", error);
    }
  };

  const fetchJustificantes = async (sessionTokenOverride?: string) => {
    setLoading(true);
    try {
      const sessionToken = sessionTokenOverride || getActiveSessionToken();
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "getAllJustificantes",
          data: {
            sessionToken,
            filters: {
              estado: filterEstado,
              departmentId: filterDepartment,
              fechaDesde: filterFechaDesde ? format(filterFechaDesde, "yyyy-MM-dd") : undefined,
              fechaHasta: filterFechaHasta ? format(filterFechaHasta, "yyyy-MM-dd") : undefined,
            }
          }
        }
      });
      if (data?.success) {
        setJustificantes(data.justificantes || []);
      } else {
        toast.error("Error al cargar justificantes");
      }
    } catch (error) {
      console.error("Error fetching justificantes:", error);
      toast.error("Error al cargar justificantes");
    } finally {
      setLoading(false);
    }
  };

  const fetchRrhhUsers = async () => {
    setLoadingUsers(true);
    try {
      const sessionToken = getActiveSessionToken();
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: { action: "getRrhhUsers", data: { sessionToken } }
      });
      if (data?.success) {
        setRrhhUsers(data.users || []);
      }
    } catch (error) {
      console.error("Error fetching RRHH users:", error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const sessionToken = getActiveSessionToken();
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: { action: "getSettings", data: { sessionToken } }
      });
      if (data?.success && data.settings) {
        setNotificationEmails(data.settings.notification_emails || []);
        setManagerNotificationsEnabled(data.settings.manager_notifications_enabled || false);
        setManagerNotificationEmails(data.settings.manager_notification_emails || []);
        // Load department notifications if available
        if (data.settings.department_notifications) {
          setDepartmentNotifications(data.settings.department_notifications);
        }
      }
      
      // Also fetch available managers
      const { data: managersData } = await supabase.functions.invoke("justificantes-operations", {
        body: { action: "getManagers", data: { sessionToken } }
      });
      if (managersData?.success) {
        setAvailableManagers(managersData.managers || []);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  useEffect(() => {
    if ((isAuthenticated && isAdmin) || rrhhSession) {
      fetchJustificantes();
    }
  }, [filterEstado, filterDepartment, filterFechaDesde, filterFechaHasta, rrhhSession]);

  useEffect(() => {
    const hasAccess = (isAuthenticated && isAdmin) || rrhhSession;
    if (activeTab === "usuarios" && hasAccess) {
      fetchRrhhUsers();
    }
    if (activeTab === "ajustes" && hasAccess) {
      fetchSettings();
    }
  }, [activeTab, isAuthenticated, isAdmin, rrhhSession]);

  const handleAction = async () => {
    if (!actionDialog.justificante || !actionDialog.action) return;
    
    setActionLoading(true);
    try {
      const sessionToken = getActiveSessionToken();
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "updateJustificanteStatus",
          data: {
            sessionToken,
            justificanteId: actionDialog.justificante.id,
            estado: actionDialog.action,
            comentarioGestor: actionComment || undefined,
          }
        }
      });
      
      if (data?.success) {
        toast.success(`Justificante ${actionDialog.action === "gestionado" ? "gestionado" : "rechazado"}`);
        setActionDialog({ open: false, justificante: null, action: null });
        setActionComment("");
        fetchJustificantes();
      } else {
        toast.error("Error al actualizar justificante");
      }
    } catch (error) {
      console.error("Error updating justificante:", error);
      toast.error("Error al actualizar justificante");
    } finally {
      setActionLoading(false);
    }
  };

  const openHistory = async (justificante: Justificante) => {
    setHistoryDialog({ open: true, justificante, history: [] });
    setHistoryLoading(true);
    
    try {
      const sessionToken = getActiveSessionToken();
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "getJustificanteHistory",
          data: { sessionToken, justificanteId: justificante.id }
        }
      });
      
      if (data?.success) {
        setHistoryDialog(prev => ({ ...prev, history: data.history || [] }));
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openAbsences = async (justificante: Justificante) => {
    setAbsencesDialog({ open: true, justificante, absences: [] });
    setAbsencesLoading(true);
    
    try {
      const sessionToken = getActiveSessionToken();
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "getMatchingAbsences",
          data: { 
            sessionToken, 
            workerId: justificante.worker_id,
            fechaInicio: justificante.fecha_inicio,
            fechaFin: justificante.fecha_fin
          }
        }
      });
      
      if (data?.success) {
        setAbsencesDialog(prev => ({ ...prev, absences: data.absences || [] }));
      }
    } catch (error) {
      console.error("Error fetching absences:", error);
    } finally {
      setAbsencesLoading(false);
    }
  };

  const openFile = (justificante: Justificante) => {
    // Build files list: primary file + additional files from this justificante
    const files: { id: string; archivo_url: string; archivo_nombre: string; archivo_tipo: string }[] = [
      {
        id: justificante.id,
        archivo_url: justificante.archivo_url,
        archivo_nombre: justificante.archivo_nombre,
        archivo_tipo: justificante.archivo_tipo,
      },
    ];

    // Add additional files stored in archivos_adicionales
    if (justificante.archivos_adicionales && Array.isArray(justificante.archivos_adicionales)) {
      justificante.archivos_adicionales.forEach((f, i) => {
        files.push({
          id: `${justificante.id}_extra_${i}`,
          archivo_url: f.url,
          archivo_nombre: f.nombre,
          archivo_tipo: f.tipo,
        });
      });
    }

    // Also include related justificantes from the same worker with the same date range
    const relatedJustificantes = justificantes.filter(
      j => j.id !== justificante.id &&
           j.worker_id === justificante.worker_id &&
           j.fecha_inicio === justificante.fecha_inicio &&
           j.fecha_fin === justificante.fecha_fin
    );
    
    relatedJustificantes.forEach(j => {
      files.push({
        id: j.id,
        archivo_url: j.archivo_url,
        archivo_nombre: j.archivo_nombre,
        archivo_tipo: j.archivo_tipo,
      });
    });
    
    setViewerDialog({
      open: true,
      justificante,
      relatedFiles: files,
    });
  };

  const handleSaveUser = async () => {
    if (!userForm.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    // Password is optional on create - users set it on first login

    setSavingUser(true);
    try {
      const sessionToken = getActiveSessionToken();
      
      if (userDialog.mode === "create") {
        const { data } = await supabase.functions.invoke("justificantes-operations", {
          body: {
            action: "createRrhhUser",
            data: { 
              sessionToken,
              name: userForm.name,
              email: userForm.email || null,
              password: userForm.password,
              role: userForm.role,
            }
          }
        });
        if (data?.success) {
          toast.success("Usuario creado");
          setUserDialog({ open: false, user: null, mode: "create" });
          fetchRrhhUsers();
        } else {
          toast.error(data?.error || "Error al crear usuario");
        }
      } else {
        const { data } = await supabase.functions.invoke("justificantes-operations", {
          body: {
            action: "updateRrhhUser",
            data: { 
              sessionToken,
              userId: userDialog.user?.id,
              name: userForm.name,
              email: userForm.email || null,
              password: userForm.password || undefined,
              isActive: userForm.isActive,
              role: userForm.role,
            }
          }
        });
        if (data?.success) {
          toast.success("Usuario actualizado");
          setUserDialog({ open: false, user: null, mode: "create" });
          fetchRrhhUsers();
        } else {
          toast.error(data?.error || "Error al actualizar usuario");
        }
      }
    } catch (error) {
      console.error("Error saving user:", error);
      toast.error("Error al guardar usuario");
    } finally {
      setSavingUser(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!confirm("¿Resetear la contraseña de este usuario? Deberá crear una nueva en el próximo inicio de sesión.")) return;
    
    setResettingPassword(true);
    try {
      const sessionToken = getActiveSessionToken();
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: { action: "resetRrhhPassword", data: { sessionToken, userId } }
      });
      if (data?.success) {
        toast.success("Contraseña reseteada. El usuario deberá crear una nueva al iniciar sesión.");
        fetchRrhhUsers();
      } else {
        toast.error(data?.error || "Error al resetear contraseña");
      }
    } catch (error) {
      console.error("Error resetting password:", error);
      toast.error("Error al resetear contraseña");
    } finally {
      setResettingPassword(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("¿Eliminar este usuario?")) return;
    
    try {
      const sessionToken = getActiveSessionToken();
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: { action: "deleteRrhhUser", data: { sessionToken, userId } }
      });
      if (data?.success) {
        toast.success("Usuario eliminado");
        fetchRrhhUsers();
      } else {
        toast.error("Error al eliminar usuario");
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Error al eliminar usuario");
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const sessionToken = getActiveSessionToken();
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "updateSettings",
          data: { 
            sessionToken, 
            notificationEmails,
            managerNotificationsEnabled,
            managerNotificationEmails,
            departmentNotifications: departmentNotifications.filter(d => d.enabled && d.email)
          }
        }
      });
      if (data?.success) {
        toast.success("Ajustes guardados");
      } else {
        toast.error("Error al guardar ajustes");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Error al guardar ajustes");
    } finally {
      setSavingSettings(false);
    }
  };

  const addManagerNotification = () => {
    if (!selectedManagerId || !newManagerEmail.trim()) {
      toast.error("Selecciona un encargado e introduce un email");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newManagerEmail)) {
      toast.error("Email no válido");
      return;
    }
    const manager = availableManagers.find(m => m.id === selectedManagerId);
    if (!manager) return;
    
    if (managerNotificationEmails.some(m => m.manager_id === selectedManagerId)) {
      toast.error("Este encargado ya está configurado");
      return;
    }
    
    setManagerNotificationEmails([
      ...managerNotificationEmails,
      { manager_id: manager.id, manager_name: manager.name, email: newManagerEmail, enabled: true }
    ]);
    setSelectedManagerId("");
    setNewManagerEmail("");
  };

  const removeManagerNotification = (managerId: string) => {
    setManagerNotificationEmails(managerNotificationEmails.filter(m => m.manager_id !== managerId));
  };

  const toggleManagerNotification = (managerId: string) => {
    setManagerNotificationEmails(managerNotificationEmails.map(m =>
      m.manager_id === managerId ? { ...m, enabled: !m.enabled } : m
    ));
  };

  const addEmail = () => {
    if (!newEmail.trim()) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      toast.error("Email no válido");
      return;
    }
    if (notificationEmails.includes(newEmail)) {
      toast.error("Email ya añadido");
      return;
    }
    setNotificationEmails([...notificationEmails, newEmail]);
    setNewEmail("");
  };

  const removeEmail = (email: string) => {
    setNotificationEmails(notificationEmails.filter(e => e !== email));
  };

  const getStatusBadge = (estado: string, gestionComment?: string | null) => {
    switch (estado) {
      case "pendiente":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
      case "pendiente_docs":
        return (
          <Popover>
            <PopoverTrigger asChild>
              <span
                className="inline-flex"
                onClick={(e) => {
                  // Avoid triggering row-level click handlers while keeping the Popover trigger behavior
                  e.stopPropagation();
                }}
              >
                <Badge
                  variant="outline"
                  className="bg-orange-500/10 text-orange-600 border-orange-500/30 cursor-pointer hover:bg-orange-500/20 transition-colors"
                >
                  <MessageSquarePlus className="w-3 h-3 mr-1" />Doc. solicitada
                </Badge>
              </span>
            </PopoverTrigger>
            <PopoverContent className="max-w-xs z-50" side="top" align="start">
              <p className="text-sm font-medium mb-2">Documentación solicitada:</p>
              <p className="text-sm text-muted-foreground">{gestionComment || "Sin mensaje"}</p>
            </PopoverContent>
          </Popover>
        );
      case "gestionado":
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30"><CheckCircle className="w-3 h-3 mr-1" />Gestionado</Badge>;
      case "rechazado":
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Rechazado</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  // Helper to check if current user is admin (not RRHH)
  // Admin if using manager auth (isAdmin) or if RRHH session is admin_principal or admin (for manager sessions)
  const isAdminUser = rrhhSession 
    ? (rrhhSession.role === "admin_principal" || rrhhSession.role === "admin") 
    : isAdmin;
  
  // For UI display - show limited view when previewing as RRHH
  const showAsRrhh = previewAsRrhh && isAdminUser;

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefreshInterval === null) return;
    
    const intervalId = setInterval(() => {
      fetchJustificantes();
    }, autoRefreshInterval * 60 * 1000);
    
    return () => clearInterval(intervalId);
  }, [autoRefreshInterval, rrhhSession]);

  const handleRequestDocs = async () => {
    if (!requestDocsDialog.justificante || !requestDocsMessage.trim()) {
      toast.error("El mensaje es obligatorio");
      return;
    }
    
    setRequestDocsLoading(true);
    try {
      const sessionToken = getActiveSessionToken();
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "requestDocumentation",
          data: {
            sessionToken,
            justificanteId: requestDocsDialog.justificante.id,
            mensaje: requestDocsMessage,
          }
        }
      });
      
      if (data?.success) {
        toast.success("Solicitud enviada al trabajador");
        setRequestDocsDialog({ open: false, justificante: null });
        setRequestDocsMessage("");
        fetchJustificantes();
      } else {
        toast.error(data?.error || "Error al enviar solicitud");
      }
    } catch (error) {
      console.error("Error requesting documentation:", error);
      toast.error("Error al enviar solicitud");
    } finally {
      setRequestDocsLoading(false);
    }
  };

  const handleDeleteJustificante = async (justificante: Justificante) => {
    if (!confirm(`¿Estás seguro de eliminar el justificante de ${justificante.worker_name}? Esta acción no se puede deshacer.`)) {
      return;
    }
    
    try {
      const sessionToken = getActiveSessionToken();
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "deleteJustificante",
          data: {
            sessionToken,
            justificanteId: justificante.id,
          }
        }
      });
      
      if (data?.success) {
        toast.success("Justificante eliminado");
        fetchJustificantes();
      } else {
        toast.error(data?.error || "Error al eliminar justificante");
      }
    } catch (error) {
      console.error("Error deleting justificante:", error);
      toast.error("Error al eliminar justificante");
    }
  };

  const getTipoBadge = (tipo: string) => {
    const colors: Record<string, string> = {
      medico: "bg-blue-500/10 text-blue-600 border-blue-500/30",
      personal: "bg-purple-500/10 text-purple-600 border-purple-500/30",
      otro: "bg-gray-500/10 text-gray-600 border-gray-500/30",
    };
    const labels: Record<string, string> = {
      medico: "médico",
      personal: "personal",
      otro: "otro",
    };
    return <Badge variant="outline" className={colors[tipo] || colors.otro}>{labels[tipo] || tipo}</Badge>;
  };

  // Filter justificantes by search query, status and then sort
  const highlightId = searchParams.get("id");
  const filteredJustificantes = justificantes
    .filter(j => {
      // Status filter (from stats cards click)
      if (filterEstado === "all") return true;
      if (filterEstado === "pendiente") return j.estado === "pendiente" || j.estado === "pendiente_docs";
      if (filterEstado === "gestionado") return j.estado === "gestionado";
      if (filterEstado === "rechazado") return j.estado === "rechazado";
      return j.estado === filterEstado;
    })
    .filter(j => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        j.worker_name.toLowerCase().includes(query) ||
        j.worker_number.toLowerCase().includes(query) ||
        j.departments?.name?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      // First, prioritize items with new documentation (respuesta_docs) at the top
      const aHasNewDocs = a.documentos?.some(d => d.tipo_mensaje === "respuesta_docs") && a.estado === "pendiente";
      const bHasNewDocs = b.documentos?.some(d => d.tipo_mensaje === "respuesta_docs") && b.estado === "pendiente";
      
      if (aHasNewDocs && !bHasNewDocs) return -1;
      if (!aHasNewDocs && bHasNewDocs) return 1;
      
      // Then sort by updated_at (or created_at fallback) to show recently updated first
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === "desc" ? "asc" : "desc");
  };

  const handleLogout = () => {
    localStorage.removeItem("rrhh_session");
    logout();
    navigate("/justificantes/login");
  };

  const openCreateUser = () => {
    setUserForm({ name: "", email: "", password: "", role: "rrhh", isActive: true });
    setUserDialog({ open: true, user: null, mode: "create" });
  };

  const openEditUser = (user: RrhhUser) => {
    setUserForm({ name: user.name, email: user.email || "", password: "", role: user.role, isActive: user.is_active });
    setUserDialog({ open: true, user, mode: "edit" });
  };

  if (loading && justificantes.length === 0) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-header">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <LogoLink to="/admin" className="h-10 w-10" />
              <div>
                <h1 className="font-semibold text-xl">Gestión de Justificantes</h1>
                <p className="text-xs text-muted-foreground">
                  {rrhhSession 
                    ? `Sesión: ${rrhhSession.name}` 
                    : previewAsRrhhUserId 
                      ? `Viendo como: ${rrhhUsers.find(u => u.id === previewAsRrhhUserId)?.name || 'RRHH'}`
                      : 'Panel de administración'
                  }
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto-refresh integrated in header */}
            <div className="hidden md:flex items-center gap-1.5 mr-2">
              <Select 
                value={autoRefreshInterval?.toString() || "off"} 
                onValueChange={(v) => setAutoRefreshInterval(v === "off" ? null : parseInt(v))}
              >
                <SelectTrigger className="w-24 h-8 text-xs">
                  <RefreshCw className={cn("h-3 w-3 mr-1", autoRefreshInterval && "animate-spin text-primary")} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="1">1 min</SelectItem>
                  <SelectItem value="5">5 min</SelectItem>
                  <SelectItem value="10">10 min</SelectItem>
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fetchJustificantes()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refrescar ahora</TooltipContent>
              </Tooltip>
            </div>
            
            {/* Preview as RRHH user selector - only for admins */}
            {isAdminUser && (
              <div className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                <Select 
                  value={previewAsRrhhUserId || "admin"} 
                  onValueChange={(v) => setPreviewAsRrhhUserId(v === "admin" ? null : v)}
                >
                  <SelectTrigger className={cn(
                    "w-[140px] h-8 text-xs",
                    previewAsRrhh && "border-primary bg-primary/10"
                  )}>
                    <SelectValue placeholder="Ver como..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin (yo)</SelectItem>
                    {rrhhUsers.filter(u => u.is_active && u.role === "rrhh").map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} title="Volver al Panel">
              <Home className="h-5 w-5" />
            </Button>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="justificantes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Justificantes
            </TabsTrigger>
            {/* Histórico - visible para todos (admin y RRHH) */}
            <TabsTrigger value="historico" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
            {/* Usuarios y Ajustes - solo para admin */}
            {!showAsRrhh && isAdminUser && (
              <>
                <TabsTrigger value="usuarios" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Usuarios RRHH
                </TabsTrigger>
                <TabsTrigger value="ajustes" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Ajustes
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* JUSTIFICANTES TAB */}
          <TabsContent value="justificantes" className="space-y-6">
            {/* Form Link Card - Only for admins, not in preview mode */}
            {isAdminUser && !showAsRrhh && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Link2 className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium">Enlace del formulario para trabajadores</p>
                        <p className="text-xs text-muted-foreground">{formUrl}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={copyFormLink}>
                        {formLinkCopied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                        <span className="ml-2 hidden sm:inline">{formLinkCopied ? "Copiado" : "Copiar"}</span>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => window.open(formUrl, "_blank")}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Mobile auto-refresh - only show on mobile since desktop has it in header */}
            <div className="flex md:hidden items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className={cn("h-4 w-4", autoRefreshInterval && "animate-spin text-primary")} />
                <Select 
                  value={autoRefreshInterval?.toString() || "off"} 
                  onValueChange={(v) => setAutoRefreshInterval(v === "off" ? null : parseInt(v))}
                >
                  <SelectTrigger className="w-24 h-8 text-xs">
                    <SelectValue placeholder="Auto-ref" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Off</SelectItem>
                    <SelectItem value="1">1 min</SelectItem>
                    <SelectItem value="5">5 min</SelectItem>
                    <SelectItem value="10">10 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="sm" onClick={() => fetchJustificantes()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refrescar
              </Button>
            </div>

            {/* Stats Panel with Charts */}
            <JustificantesStatsPanel 
              justificantes={justificantes} 
              selectedStatus={filterEstado}
              onStatusChange={setFilterEstado}
            />

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filtros
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="md:col-span-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nombre, número o departamento..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <Select value={filterEstado} onValueChange={setFilterEstado}>
                    <SelectTrigger>
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="pendiente_docs">Doc. Solicitada</SelectItem>
                      <SelectItem value="gestionado">Gestionado</SelectItem>
                      <SelectItem value="rechazado">Rechazado</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                    <SelectTrigger>
                      <SelectValue placeholder="Departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los departamentos</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("justify-start text-left font-normal", !filterFechaDesde && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filterFechaDesde ? format(filterFechaDesde, "dd/MM/yyyy") : "Desde"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={filterFechaDesde} onSelect={setFilterFechaDesde} locale={es} />
                    </PopoverContent>
                  </Popover>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardContent className="pt-6">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredJustificantes.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay justificantes</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14"></TableHead>
                          <TableHead>Empleado</TableHead>
                          <TableHead>Departamento</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Fechas</TableHead>
                          <TableHead 
                            className="cursor-pointer select-none hover:text-foreground transition-colors"
                            onClick={toggleSortOrder}
                          >
                            <div className="flex items-center gap-1">
                              Subido
                              <span className="text-xs">
                                {sortOrder === "desc" ? "↓" : "↑"}
                              </span>
                            </div>
                          </TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead className="text-center">Historial</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredJustificantes.map((j, index) => (
                          <TableRow key={j.id} className={highlightId === j.id ? "bg-primary/10" : ""}>
                            <TableCell className="p-2">
                              <JustificanteThumbnail
                                archivoUrl={j.archivo_url}
                                archivoTipo={j.archivo_tipo}
                                archivoNombre={j.archivo_nombre}
                                onClick={() => openFile(j)}
                                loadPriority={index}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <a 
                                  href={`https://salix.verdnatura.es/#/worker/${j.worker_number}/calendar`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-primary hover:underline"
                                >
                                  {j.worker_name}
                                </a>
                                <div className="flex items-center gap-1.5">
                                  <a 
                                    href={`https://salix.verdnatura.es/#/worker/${j.worker_number}/calendar`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-muted-foreground hover:text-primary hover:underline"
                                  >
                                    #{j.worker_number}
                                  </a>
                                  {j.has_vacation_account && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-primary/10 text-primary">
                                          <CalendarIcon className="h-2.5 w-2.5" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>Cuenta vacaciones sincronizada</TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{j.departments?.name || "-"}</TableCell>
                            <TableCell>{getTipoBadge(j.tipo)}</TableCell>
                            <TableCell>
                              <p className="text-sm">
                                {format(new Date(j.fecha_inicio), "dd/MM/yyyy")}
                                {j.fecha_inicio !== j.fecha_fin && (
                                  <> - {format(new Date(j.fecha_fin), "dd/MM/yyyy")}</>
                                )}
                              </p>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm">{format(new Date(j.created_at), "dd/MM/yyyy HH:mm")}</p>
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(j.estado, j.last_gestion_comment)}
                            </TableCell>
                            <TableCell className="text-center">
                              {(() => {
                                // Count only respuesta_docs that were created AFTER last_viewed_at
                                const unreadDocs = j.documentos?.filter(d => {
                                  if (d.tipo_mensaje !== "respuesta_docs") return false;
                                  if (!j.last_viewed_at) return true; // Never viewed = all are unread
                                  return new Date(d.created_at) > new Date(j.last_viewed_at);
                                }).length || 0;
                                
                                return (
                                  <Button 
                                    variant="outline"
                                    size="sm" 
                                    className="relative gap-1.5"
                                    onClick={() => setHistorialChatDialog({ open: true, justificante: j })}
                                  >
                                    <MessageSquarePlus className="h-4 w-4" />
                                    <span className="hidden sm:inline">Ver</span>
                                    {unreadDocs > 0 && (
                                      <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold ring-2 ring-background">
                                        {unreadDocs}
                                      </span>
                                    )}
                                  </Button>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                {(j.estado === "pendiente" || j.estado === "pendiente_docs") && (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="text-primary hover:text-primary hover:bg-primary/10"
                                          onClick={() => setActionDialog({ open: true, justificante: j, action: "gestionado" })}
                                        >
                                          <CheckCircle className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Aprobar justificante</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button 
                                          variant="ghost" 
                                          size="icon"
                                          className="text-red-600 hover:text-red-600 hover:bg-red-600/10"
                                          onClick={() => setActionDialog({ open: true, justificante: j, action: "rechazado" })}
                                        >
                                          <XCircle className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Rechazar justificante</TooltipContent>
                                    </Tooltip>
                                  </>
                                )}
                                {isAdminUser && !showAsRrhh && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="icon"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => handleDeleteJustificante(j)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Eliminar justificante</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* HISTORICO TAB */}
          <TabsContent value="historico">
            <JustificanteHistoricoPanel sessionToken={getActiveSessionToken() || ""} isAdmin={isAdminUser && !showAsRrhh} />
          </TabsContent>

          {/* USUARIOS RRHH TAB */}
          <TabsContent value="usuarios" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Usuarios RRHH</CardTitle>
                  <CardDescription>Gestiona los usuarios que pueden acceder al panel de justificantes</CardDescription>
                </div>
                <Button onClick={openCreateUser}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Usuario
                </Button>
              </CardHeader>
              <CardContent>
                {loadingUsers ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : rrhhUsers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay usuarios RRHH</p>
                    <p className="text-sm">Crea el primer usuario para gestionar justificantes</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Creado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rrhhUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.name}</TableCell>
                          <TableCell>{user.email || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={user.role === "admin_principal" ? "default" : "secondary"}>
                              {user.role === "admin_principal" ? "Admin Principal" : "RRHH"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.is_active ? "outline" : "secondary"} className={user.is_active ? "bg-primary/10 text-primary" : ""}>
                              {user.is_active ? "Activo" : "Inactivo"}
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(user.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditUser(user)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDeleteUser(user.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AJUSTES TAB */}
          <TabsContent value="ajustes" className="space-y-6">

            {/* Department Notifications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notificaciones por Departamento
                </CardTitle>
                <CardDescription>
                  Configura un email de notificación para cada departamento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {departments.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground border rounded-lg border-dashed">
                      <UserCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Cargando departamentos...</p>
                    </div>
                  ) : (
                    departments.map((dept) => {
                      const config = departmentNotifications.find(d => d.department_id === dept.id);
                      const isEnabled = config?.enabled ?? false;
                      const email = config?.email ?? "";
                      const managerEmails = config?.manager_emails || [];
                      const newEmailValue = newDeptEmails[dept.id] || "";
                      
                      return (
                        <div 
                          key={dept.id} 
                          className={cn(
                            "p-3 rounded-lg border transition-colors",
                            isEnabled ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-transparent"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setDepartmentNotifications(prev => [
                                    ...prev.filter(d => d.department_id !== dept.id),
                                    { department_id: dept.id, department_name: dept.name, enabled: true, email: email, manager_emails: managerEmails }
                                  ]);
                                } else {
                                  setDepartmentNotifications(prev =>
                                    prev.map(d => d.department_id === dept.id ? { ...d, enabled: false } : d)
                                  );
                                }
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{dept.name}</p>
                            </div>
                          </div>
                          
                          {isEnabled && (
                            <div className="mt-3 ml-12 space-y-2">
                              {/* Show existing manager emails */}
                              {managerEmails.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {managerEmails.map((emailItem, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs flex items-center gap-1 py-1">
                                      <Mail className="h-3 w-3" />
                                      {emailItem}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              
                              {/* Input to add new email */}
                              <div className="flex items-center gap-2">
                                <Input
                                  type="email"
                                  placeholder="Añadir correo..."
                                  value={newEmailValue}
                                  onChange={(e) => setNewDeptEmails(prev => ({ ...prev, [dept.id]: e.target.value }))}
                                  className="max-w-[250px] h-8 text-sm"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && newEmailValue.includes("@")) {
                                      e.preventDefault();
                                      // Add email to manager_emails
                                      const updatedEmails = [...managerEmails, newEmailValue.trim()];
                                      setDepartmentNotifications(prev =>
                                        prev.map(d => d.department_id === dept.id 
                                          ? { ...d, manager_emails: updatedEmails, email: newEmailValue.trim() } 
                                          : d
                                        )
                                      );
                                      setNewDeptEmails(prev => ({ ...prev, [dept.id]: "" }));
                                    }
                                  }}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!newEmailValue.includes("@")}
                                  onClick={() => {
                                    if (newEmailValue.includes("@")) {
                                      const updatedEmails = [...managerEmails, newEmailValue.trim()];
                                      setDepartmentNotifications(prev =>
                                        prev.map(d => d.department_id === dept.id 
                                          ? { ...d, manager_emails: updatedEmails, email: newEmailValue.trim() } 
                                          : d
                                        )
                                      );
                                      setNewDeptEmails(prev => ({ ...prev, [dept.id]: "" }));
                                    }
                                  }}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                              
                              {managerEmails.length === 0 && !newEmailValue && (
                                <p className="text-xs text-muted-foreground">No hay correos configurados. Añade uno para recibir notificaciones.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Legacy Manager Notifications - Hidden, keeping for backwards compatibility */}
            {managerNotificationEmails.length > 0 && (
              <Card className="border-dashed opacity-60">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Bell className="h-4 w-4" />
                        Notificaciones a Encargados (Legacy)
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Configuración anterior - se recomienda usar notificaciones por departamento
                      </CardDescription>
                    </div>
                    <Switch
                      checked={managerNotificationsEnabled}
                      onCheckedChange={setManagerNotificationsEnabled}
                    />
                  </div>
                </CardHeader>
                {managerNotificationsEnabled && (
                  <CardContent className="space-y-2">
                    {managerNotificationEmails.map((m) => (
                      <div key={m.manager_id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={m.enabled}
                            onCheckedChange={() => toggleManagerNotification(m.manager_id)}
                          />
                          <span>{m.manager_name}</span>
                          <span className="text-muted-foreground">({m.email})</span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeManagerNotification(m.manager_id)} 
                          className="text-red-600 h-6 w-6"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            )}

            <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-full">
              {savingSettings && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar Ajustes
            </Button>
          </TabsContent>
        </Tabs>
      </main>

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => !open && setActionDialog({ open: false, justificante: null, action: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === "gestionado" ? "Marcar como Gestionado" : "Rechazar Justificante"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.justificante && (
                <>
                  Justificante de <strong>{actionDialog.justificante.worker_name}</strong> ({actionDialog.justificante.tipo})
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Comentario (opcional)</Label>
              <Textarea
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                placeholder="Añade un comentario interno..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ open: false, justificante: null, action: null })}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAction} 
              disabled={actionLoading}
              variant={actionDialog.action === "rechazado" ? "destructive" : "default"}
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {actionDialog.action === "gestionado" ? "Marcar Gestionado" : "Rechazar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Documentation Dialog */}
      <Dialog open={requestDocsDialog.open} onOpenChange={(open) => !open && setRequestDocsDialog({ open: false, justificante: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5 text-orange-500" />
              Solicitar Documentación Adicional
            </DialogTitle>
            <DialogDescription>
              {requestDocsDialog.justificante && (
                <>Se enviará un email a <strong>{requestDocsDialog.justificante.worker_name}</strong> con un enlace para subir la documentación.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mensaje para el trabajador *</Label>
              <Textarea
                placeholder="Ej: Necesitamos el parte médico completo con el sello del centro de salud..."
                value={requestDocsMessage}
                onChange={(e) => setRequestDocsMessage(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestDocsDialog({ open: false, justificante: null })}>
              Cancelar
            </Button>
            <Button onClick={handleRequestDocs} disabled={requestDocsLoading || !requestDocsMessage.trim()}>
              {requestDocsLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enviar Solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyDialog.open} onOpenChange={(open) => !open && setHistoryDialog({ open: false, justificante: null, history: [] })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Historial de Gestión</DialogTitle>
            <DialogDescription>
              {historyDialog.justificante && (
                <>Justificante de <strong>{historyDialog.justificante.worker_name}</strong></>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {historyLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : historyDialog.history.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Sin historial de gestión</p>
            ) : (
              historyDialog.history.map((h) => (
                <div key={h.id} className="p-3 bg-muted/30 rounded-lg border">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant={h.accion === "gestionado" ? "default" : "destructive"}>
                      {h.accion}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(h.created_at), "dd/MM/yyyy HH:mm")}
                    </span>
                  </div>
                  <p className="text-sm">Por: {h.gestionado_por_nombre}</p>
                  {h.comentario_gestor && (
                    <p className="text-xs text-muted-foreground mt-1">{h.comentario_gestor}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Absences Dialog */}
      <Dialog open={absencesDialog.open} onOpenChange={(open) => !open && setAbsencesDialog({ open: false, justificante: null, absences: [] })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Ausencias Relacionadas
            </DialogTitle>
            <DialogDescription>
              {absencesDialog.justificante && (
                <>
                  Ausencias detectadas para <strong>{absencesDialog.justificante.worker_name}</strong> entre{" "}
                  {format(new Date(absencesDialog.justificante.fecha_inicio), "dd/MM/yyyy")} y{" "}
                  {format(new Date(absencesDialog.justificante.fecha_fin), "dd/MM/yyyy")}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {absencesLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : absencesDialog.absences.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No se encontraron ausencias</p>
                <p className="text-xs">No hay registros de ausencia en el módulo laboral para estas fechas</p>
              </div>
            ) : (
              absencesDialog.absences.map((a) => (
                <div key={a.id} className="p-3 bg-muted/30 rounded-lg border flex items-center justify-between">
                  <div>
                    <p className="font-medium">{format(new Date(a.entry_date), "EEEE dd/MM/yyyy", { locale: es })}</p>
                    {a.observation && <p className="text-xs text-muted-foreground">{a.observation}</p>}
                  </div>
                  <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
                    Ausencia
                  </Badge>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* User Dialog */}
      <Dialog open={userDialog.open} onOpenChange={(open) => !open && setUserDialog({ open: false, user: null, mode: "create" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{userDialog.mode === "create" ? "Nuevo Usuario RRHH" : "Editar Usuario"}</DialogTitle>
            <DialogDescription>
              {userDialog.mode === "create" 
                ? "Crea un nuevo usuario para gestionar justificantes" 
                : `Editando: ${userDialog.user?.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={userForm.name}
                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                placeholder="Nombre del usuario"
              />
            </div>
            <div className="space-y-2">
              <Label>Email (opcional)</Label>
              <Input
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                placeholder="email@ejemplo.com"
              />
            </div>
            {userDialog.mode === "edit" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Contraseña</Label>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => userDialog.user && handleResetPassword(userDialog.user.id)}
                    disabled={resettingPassword}
                  >
                    {resettingPassword ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-1" />
                    )}
                    Resetear contraseña
                  </Button>
                </div>
                <Input
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder="Nueva contraseña (dejar vacío para mantener)"
                />
              </div>
            )}
            {userDialog.mode === "create" && (
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                El usuario creará su propia contraseña en el primer inicio de sesión.
              </p>
            )}
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rrhh">RRHH</SelectItem>
                  <SelectItem value="admin_principal">Admin Principal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {userDialog.mode === "edit" && (
              <div className="flex items-center justify-between">
                <Label>Usuario activo</Label>
                <Switch
                  checked={userForm.isActive}
                  onCheckedChange={(checked) => setUserForm({ ...userForm, isActive: checked })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialog({ open: false, user: null, mode: "create" })}>
              Cancelar
            </Button>
            <Button onClick={handleSaveUser} disabled={savingUser}>
              {savingUser && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {userDialog.mode === "create" ? "Crear Usuario" : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Justificante Viewer Dialog */}
      {viewerDialog.justificante && (
        <JustificanteViewerDialog
          open={viewerDialog.open}
          onOpenChange={(open) => !open && setViewerDialog({ open: false, justificante: null, relatedFiles: [] })}
          workerName={viewerDialog.justificante.worker_name}
          workerNumber={viewerDialog.justificante.worker_number}
          fechaInicio={viewerDialog.justificante.fecha_inicio}
          fechaFin={viewerDialog.justificante.fecha_fin}
          tipo={viewerDialog.justificante.tipo}
          comentario={viewerDialog.justificante.comentario_empleado}
          files={viewerDialog.relatedFiles}
        />
      )}

      {/* Historial Chat Dialog */}
      <JustificanteHistorialChat
        open={historialChatDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setHistorialChatDialog({ open: false, justificante: null });
            // Refresh list to update last_viewed_at
            fetchJustificantes();
          }
        }}
        justificante={historialChatDialog.justificante}
        sessionToken={getActiveSessionToken() || ""}
        userName={rrhhSession?.name || "Admin"}
        userRole={isAdminUser ? "admin" : "rrhh"}
        onStatusChange={() => fetchJustificantes()}
      />
    </div>
  );
};

export default JustificantesAdmin;
