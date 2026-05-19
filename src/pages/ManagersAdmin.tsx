import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, UserCog, Key, Edit, Building2, Loader2, ShieldBan, ShieldCheck, Mail, AlertTriangle, ChevronDown, ChevronRight, Users, Send, ImagePlus, Search, MoreHorizontal, Briefcase } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ManagerProfileDrawer } from "@/components/candidaturas/ManagerProfileDrawer";
import { ManagerAvatar } from "@/components/candidaturas/ManagerAvatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import { useManagerAuth } from "@/modules/auth/hooks/useManagerAuth";
import LoadingPanel from "@/components/LoadingPanel";
import { SkeletonWorkerList } from "@/components/SkeletonLoaders";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type Manager = {
  id: string;
  name: string;
  role: string;
  department_id: string | null;
  password_hash: string | null;
  is_blocked?: boolean;
  email?: string | null;
  avatar_url?: string | null;
  worker_id?: string | null;
  worker_team_id?: string | null;
  parent_manager_id?: string | null;
  candidaturas_only?: boolean;
  departments?: { name: string } | null;
  manager_department_assignments?: { department_id: string; departments: { id: string; name: string } }[];
};

type Department = {
  id: string;
  name: string;
};

const ManagersAdmin = () => {
  const navigate = useNavigate();
  const { manager: currentManager, isAdmin, isAuthenticated, getSessionToken, isLoading: authLoading } = useManagerAuth();
  const [managers, setManagers] = useState<Manager[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedManager, setSelectedManager] = useState<Manager | null>(null);
  
  // Department edit state
  const [editDeptDialogOpen, setEditDeptDialogOpen] = useState(false);
  const [editingManager, setEditingManager] = useState<Manager | null>(null);
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
  const [savingDepts, setSavingDepts] = useState(false);
  
  // Email edit state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailEditManager, setEmailEditManager] = useState<Manager | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // Invitation email state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteManager, setInviteManager] = useState<Manager | null>(null);
  const [useTestEmail, setUseTestEmail] = useState(false);
  const [testEmailValue, setTestEmailValue] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  // Profile editor state
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileManager, setProfileManager] = useState<Manager | null>(null);

  // Form state
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "manager" | "consulta" | "responsable">("manager");
  const [newDepartmentId, setNewDepartmentId] = useState<string>("");
  const [newManagerEmail, setNewManagerEmail] = useState("");
  const [newCandidaturasOnly, setNewCandidaturasOnly] = useState(false);

  // Responsable-specific state
  const [responsableWorkers, setResponsableWorkers] = useState<Array<{
    id: string; name: string; worker_number: string;
    worker_team_id: string | null; worker_team_name: string | null;
    responsable_team_names?: string[];
    responsable_group_names?: string[];
    responsable_team_ids?: string[];
    department_id: string | null;
    manager_account: { id: string; email: string | null; password_hash: string | null; is_blocked: boolean } | null;
  }>>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("");
  const [expandedManagers, setExpandedManagers] = useState<Set<string>>(new Set());
  const [creatingAccountFor, setCreatingAccountFor] = useState<string | null>(null);

  // Search + filter
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "manager" | "consulta">("all");

  const fetchResponsableWorkers = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;
    try {
      // Get workers marked as is_responsable with their team info
      const { data: response } = await supabase.functions.invoke('admin-operations', {
        body: { action: 'getResponsableWorkers', sessionToken }
      });
      if (response?.success) {
        setResponsableWorkers(response.workers || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !isAdmin) {
      navigate("/login");
      return;
    }
    fetchManagers();
    fetchDepartments();
    fetchResponsableWorkers();
  }, [authLoading, isAuthenticated, isAdmin, navigate]);

  const fetchManagers = async () => {
    setLoading(true);
    const sessionToken = getSessionToken();
    
    if (!sessionToken) {
      toast.error("Sesión no válida");
      setLoading(false);
      return;
    }

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getManagers',
          sessionToken
        }
      });

      if (response.error || !response.data?.success) {
        console.error('Error fetching managers:', response.data?.error);
        toast.error("Error al cargar encargados");
        setLoading(false);
        return;
      }

      setManagers(response.data.managers || []);
    } catch (error) {
      console.error('Fetch managers error:', error);
      toast.error("Error al cargar encargados");
    }
    setLoading(false);
  };

  // Helper to get ALL assigned departments for a manager
  const getAssignedDepartments = (mgr: Manager) => {
    // First check assignments table
    if (mgr.manager_department_assignments && mgr.manager_department_assignments.length > 0) {
      return mgr.manager_department_assignments.map(a => a.departments);
    }
    // Fallback to legacy department_id
    if (mgr.departments) {
      return [{ id: mgr.department_id || "", name: mgr.departments.name }];
    }
    return [];
  };

  // Get all current department IDs for a manager
  const getAssignedDepartmentIds = (mgr: Manager) => {
    if (mgr.manager_department_assignments && mgr.manager_department_assignments.length > 0) {
      return mgr.manager_department_assignments.map(a => a.department_id);
    }
    return mgr.department_id ? [mgr.department_id] : [];
  };

  const fetchDepartments = async () => {
    const sessionToken = getSessionToken();
    
    if (!sessionToken) {
      return;
    }

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getDepartments',
          sessionToken
        }
      });

      if (response.error || !response.data?.success) {
        console.error('Error fetching departments:', response.data?.error);
        toast.error("Error al cargar departamentos");
        return;
      }

      setDepartments(response.data.departments || []);
    } catch (error) {
      console.error('Fetch departments error:', error);
      toast.error("Error al cargar departamentos");
    }
  };

  const handleAddManager = async () => {
    if (!newName.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    if (!newManagerEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newManagerEmail.trim())) {
      toast.error("Introduce un email válido");
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    try {
      const createData: any = {
        name: newName.trim(),
        role: newRole,
        email: newManagerEmail.trim(),
        candidaturas_only: newRole === 'manager' ? newCandidaturasOnly : false,
        department_id: newRole === 'manager' && newDepartmentId ? newDepartmentId : null,
      };

      // For responsable, add worker reference
      if (newRole === 'responsable' && selectedWorkerId) {
        const worker = responsableWorkers.find(w => w.id === selectedWorkerId);
        if (worker) {
          createData.worker_id = worker.id;
          createData.worker_team_id = worker.worker_team_id;
        }
      }

      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'createManager',
          sessionToken,
          data: createData
        }
      });

      if (response.error || !response.data?.success) {
        toast.error(response.data?.error || "Error al crear encargado");
        return;
      }

      toast.success("Encargado creado. Se le ha enviado un correo para configurar su contraseña.");
      setDialogOpen(false);
      setNewName("");
      setNewRole("manager");
      setNewDepartmentId("");
      setNewManagerEmail("");
      setNewCandidaturasOnly(false);
      fetchManagers();
    } catch (error) {
      console.error('Create manager error:', error);
      toast.error("Error al crear encargado");
    }
  };

  const handleUpdateDepartments = async (managerId: string, departmentIds: string[]) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    setSavingDepts(true);
    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'updateManagerDepartments',
          sessionToken,
          data: {
            managerId,
            departmentIds
          }
        }
      });

      if (response.error || !response.data?.success) {
        toast.error(response.data?.error || "Error al actualizar departamentos");
        return;
      }

      toast.success("Departamentos actualizados");
      setEditDeptDialogOpen(false);
      setEditingManager(null);
      fetchManagers();
    } catch (error) {
      console.error('Update departments error:', error);
      toast.error("Error al actualizar departamentos");
    } finally {
      setSavingDepts(false);
    }
  };

  const handleToggleCandidaturasOnly = async (mgr: Manager) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) { toast.error("Sesión no válida"); return; }
    const newValue = !mgr.candidaturas_only;
    const confirmMsg = newValue
      ? `¿Restringir a ${mgr.name} solo al panel de Candidaturas? Se cerrará su sesión actual.`
      : `¿Devolver acceso completo a ${mgr.name}? Se cerrará su sesión actual.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const { data, error } = await supabase.functions.invoke('admin-operations', {
        body: { action: 'updateManagerCandidaturasOnly', sessionToken, data: { managerId: mgr.id, value: newValue } }
      });
      if (error || !data?.success) {
        toast.error(data?.error || "Error al actualizar acceso");
        return;
      }
      toast.success(newValue ? "Acceso restringido a Candidaturas" : "Acceso completo restaurado");
      fetchManagers();
    } catch (err) {
      console.error(err);
      toast.error("Error al actualizar acceso");
    }
  };

  const openEditDepartments = (mgr: Manager) => {
    setEditingManager(mgr);
    setSelectedDeptIds(getAssignedDepartmentIds(mgr));
    setEditDeptDialogOpen(true);
  };

  const openEmailDialog = (mgr: Manager) => {
    setEmailEditManager(mgr);
    setNewEmail(mgr.email || "");
    setEmailDialogOpen(true);
  };

  const handleSaveEmail = async () => {
    if (!emailEditManager || !newEmail.trim()) {
      toast.error("Introduce un email válido");
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    setSavingEmail(true);
    try {
      const response = await supabase.functions.invoke('manager-auth', {
        body: {
          action: 'updateManagerEmail',
          managerId: emailEditManager.id,
          email: newEmail.trim(),
          sessionToken
        }
      });

      if (response.error) {
        toast.error("Error al actualizar email");
        return;
      }

      const data = response.data;
      if (!data.success) {
        toast.error(data.error || "Error al actualizar email");
        return;
      }

      toast.success("Email actualizado correctamente");
      setEmailDialogOpen(false);
      setEmailEditManager(null);
      setNewEmail("");
      fetchManagers();
      fetchResponsableWorkers();
    } catch (error) {
      console.error('Update email error:', error);
      toast.error("Error al actualizar email");
    } finally {
      setSavingEmail(false);
    }
  };

  const toggleDepartmentSelection = (deptId: string) => {
    setSelectedDeptIds(prev => 
      prev.includes(deptId) 
        ? prev.filter(id => id !== deptId)
        : [...prev, deptId]
    );
  };

  const openInviteDialog = (mgr: Manager) => {
    setInviteManager(mgr);
    setUseTestEmail(false);
    const myEmail = managers.find(m => m.id === currentManager?.id)?.email || "";
    setTestEmailValue(myEmail);
    setInviteDialogOpen(true);
  };

  const handleSendInvitation = async () => {
    if (!inviteManager) return;
    if (!inviteManager.email) {
      toast.error("El encargado no tiene email configurado");
      return;
    }
    if (useTestEmail && (!testEmailValue.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailValue.trim()))) {
      toast.error("Introduce un email de prueba válido");
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    setSendingInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke('manager-auth', {
        body: {
          action: 'sendInvitationEmail',
          managerId: inviteManager.id,
          sessionToken,
          testEmail: useTestEmail ? testEmailValue.trim() : null,
          origin: window.location.origin,
        },
      });

      if (error || !data?.success) {
        toast.error(data?.error || "Error al enviar la invitación");
        return;
      }

      toast.success(
        data.isTest
          ? `Email de prueba enviado a ${data.sentTo}`
          : `Invitación enviada a ${data.sentTo}`
      );
      setInviteDialogOpen(false);
      setInviteManager(null);
      fetchManagers();
    } catch (err) {
      console.error('Send invitation error:', err);
      toast.error("Error al enviar la invitación");
    } finally {
      setSendingInvite(false);
    }
  };

  const handleResetPassword = async (managerId: string) => {
    // Reset password via authenticated edge function
    const sessionToken = getSessionToken();
    
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    try {
      const response = await supabase.functions.invoke('manager-auth', {
        body: {
          action: 'resetPassword',
          managerId,
          newPassword: null, // Set to null to allow setting new password
          sessionToken
        }
      });

      if (response.error || !response.data?.success) {
        toast.error(response.data?.error || "Error al resetear contraseña");
        return;
      }

      toast.success("Contraseña reseteada. El encargado podrá establecer una nueva.");
      fetchManagers();
    } catch (error) {
      console.error('Reset password error:', error);
      toast.error("Error al resetear contraseña");
    }
  };

  const handleBlockManager = async (managerId: string, block: boolean) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'blockManager',
          sessionToken,
          data: { managerId, blocked: block }
        }
      });

      if (response.error || !response.data?.success) {
        toast.error(response.data?.error || "Error al actualizar estado");
        return;
      }

      toast.success(block ? "Encargado bloqueado y sesión cerrada" : "Encargado desbloqueado");
      fetchManagers();
      fetchResponsableWorkers();
    } catch (error) {
      console.error('Block manager error:', error);
      toast.error("Error al actualizar estado");
    }
  };

  const handleDeleteManager = async () => {
    if (!selectedManager) return;

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'deleteManager',
          sessionToken,
          data: {
            managerId: selectedManager.id
          }
        }
      });

      if (response.error || !response.data?.success) {
        toast.error(response.data?.error || "Error al eliminar encargado");
        return;
      }

      toast.success("Encargado eliminado");
      setDeleteDialogOpen(false);
      setSelectedManager(null);
      fetchManagers();
      fetchResponsableWorkers();
    } catch (error) {
      console.error('Delete manager error:', error);
      toast.error("Error al eliminar encargado");
    }
  };

  const handleCreateResponsableAccount = async (worker: typeof responsableWorkers[0], parentManagerId?: string) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) { toast.error("Sesión no válida"); return; }
    
    setCreatingAccountFor(worker.id);
    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'createManager',
          sessionToken,
          data: {
            name: worker.name,
            role: 'responsable',
            worker_id: worker.id,
            worker_team_id: worker.worker_team_id,
            parent_manager_id: parentManagerId || null,
          }
        }
      });
      if (response.error || !response.data?.success) {
        toast.error(response.data?.error || "Error al crear cuenta");
        return;
      }
      toast.success(`Cuenta creada para ${worker.name}. Configura su email para que pueda acceder.`);
      fetchManagers();
      fetchResponsableWorkers();
    } catch {
      toast.error("Error al crear cuenta");
    } finally {
      setCreatingAccountFor(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="glass-header">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <LogoLink to="/admin" />
            <div>
              <h1 className="text-sm sm:text-lg font-semibold text-foreground tracking-tight">Encargados</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-light">Añadir o eliminar usuarios</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="h-8 w-8 p-0 rounded-full" title="Volver">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8 max-w-6xl">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Encargados</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {managers.filter(m => m.role !== 'responsable').length} usuarios con acceso al sistema
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl w-full sm:w-auto h-9">
                <Plus className="h-4 w-4 mr-2" />
                Añadir encargado
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo encargado</DialogTitle>
                <DialogDescription>
                  Añade un nuevo encargado. Se le enviará un correo para configurar su contraseña.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre <span className="text-destructive">*</span></Label>
                  <Input
                    id="name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nombre del encargado"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-mgr-email">Email <span className="text-destructive">*</span></Label>
                  <Input
                    id="new-mgr-email"
                    type="email"
                    value={newManagerEmail}
                    onChange={(e) => setNewManagerEmail(e.target.value)}
                    placeholder="usuario@verdnatura.es"
                  />
                  <p className="text-xs text-muted-foreground">Se le enviará un correo para configurar su contraseña</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Rol</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as "admin" | "manager" | "consulta" | "responsable")}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador (acceso total)</SelectItem>
                      <SelectItem value="manager">Encargado (solo su departamento)</SelectItem>
                      <SelectItem value="responsable">Responsable de equipo</SelectItem>
                      <SelectItem value="consulta">Consulta (solo ver calendarios)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newRole === "responsable" && (
                  <div className="space-y-2">
                    <Label>Trabajador responsable</Label>
                    <Select value={selectedWorkerId} onValueChange={(v) => {
                      setSelectedWorkerId(v);
                      const worker = responsableWorkers.find(w => w.id === v);
                      if (worker) setNewName(worker.name);
                    }}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Seleccionar trabajador..." />
                      </SelectTrigger>
                      <SelectContent>
                        {responsableWorkers.filter(w => !managers.some(m => m.worker_id === w.id)).map(w => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name} {w.responsable_group_names?.length ? `(${w.responsable_group_names.join(", ")})` : w.worker_team_name ? `(${w.worker_team_name})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {newRole === "manager" && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-muted/30 p-3">
                      <Checkbox
                        id="cand-only"
                        checked={newCandidaturasOnly}
                        onCheckedChange={(v) => setNewCandidaturasOnly(!!v)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <Label htmlFor="cand-only" className="text-sm font-medium cursor-pointer">
                          Solo Candidaturas (acceso restringido)
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Solo podrá entrar al panel de Entrevistas. Sin acceso a vacaciones, calendarios ni otros módulos.
                        </p>
                      </div>
                    </div>
                    <Label htmlFor="department">
                      Departamento {newCandidaturasOnly && <span className="text-muted-foreground font-normal">(verá solo entrevistas de este dpto.)</span>}
                    </Label>
                    <Select value={newDepartmentId} onValueChange={setNewDepartmentId}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Seleccionar departamento..." />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map(dept => (
                          <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAddManager} disabled={!newName.trim() || !newManagerEmail.trim()}>
                  Crear encargado
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, email o departamento..."
              className="pl-9 h-10 rounded-xl bg-muted/40 border-border/40"
            />
          </div>
          <div className="flex gap-1 p-1 rounded-xl bg-muted/40 border border-border/40">
            {([
              { v: "all", label: "Todos" },
              { v: "admin", label: "Admin" },
              { v: "manager", label: "Encargados" },
              { v: "consulta", label: "Consulta" },
            ] as const).map(opt => (
              <button
                key={opt.v}
                onClick={() => setRoleFilter(opt.v)}
                className={`px-3 h-8 rounded-lg text-xs font-medium transition-colors ${
                  roleFilter === opt.v
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <SkeletonWorkerList count={4} />
        ) : (() => {
          const normalize = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const q = normalize(searchQuery.trim());
          const visible = managers
            .filter(m => m.role !== 'responsable')
            .filter(m => roleFilter === 'all' ? true : m.role === roleFilter)
            .filter(m => {
              if (!q) return true;
              const deptNames = getAssignedDepartments(m).map(d => d.name).join(" ");
              const haystack = normalize(`${m.name} ${m.email || ''} ${deptNames}`);
              return haystack.includes(q);
            });

          if (visible.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-border/50 bg-muted/20">
                <Search className="h-8 w-8 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-foreground">Sin resultados</p>
                <p className="text-xs text-muted-foreground mt-1">Prueba con otro nombre o filtro</p>
              </div>
            );
          }

          return (
          <div className="grid gap-2 content-loaded">
            {visible.map((mgr, index) => {
              const assignedDepts = getAssignedDepartments(mgr);
              const assignedDeptIds = getAssignedDepartmentIds(mgr);
              const isExpanded = expandedManagers.has(mgr.id);
              const toggleExpanded = () => setExpandedManagers(prev => {
                const next = new Set(prev);
                if (next.has(mgr.id)) next.delete(mgr.id); else next.add(mgr.id);
                return next;
              });
              const isSelf = mgr.id === currentManager?.id;
              const roleLabel = mgr.role === "admin" ? "Administrador" : mgr.role === "consulta" ? "Consulta" : "Encargado";
              const roleColor = mgr.role === "admin" ? "text-primary" : mgr.role === "consulta" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground";
              return (
              <Card
                key={mgr.id}
                className={`group shadow-none border border-border/40 rounded-2xl content-loaded-item overflow-hidden transition-colors hover:border-border ${!mgr.email ? 'border-destructive/40 bg-destructive/[0.03]' : ''}`}
                style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4">
                  {/* Left: Avatar + identity */}
                  <button
                    type="button"
                    onClick={() => { setProfileManager(mgr); setProfileOpen(true); }}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-xl -m-1 p-1 hover:bg-muted/40 transition-colors"
                    title="Editar perfil"
                  >
                    <ManagerAvatar
                      name={mgr.name}
                      avatarUrl={mgr.avatar_url}
                      size="lg"
                      showTooltip={false}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground text-base leading-tight truncate">
                          {mgr.name}
                        </h3>
                        {isSelf && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/40 text-primary">
                            Tú
                          </Badge>
                        )}
                        {mgr.is_blocked && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                            Bloqueado
                          </Badge>
                        )}
                        {mgr.candidaturas_only && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-blue-500/40 text-blue-600 dark:text-blue-400">
                            Solo Candidaturas
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <span className={`font-medium ${roleColor}`}>{roleLabel}</span>
                        {mgr.role === "manager" && assignedDepts.length > 0 && (
                          <>
                            <span className="text-border">•</span>
                            <Briefcase className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[260px]">
                              {assignedDepts.length === 1
                                ? assignedDepts[0].name
                                : `${assignedDepts.length} departamentos`}
                            </span>
                          </>
                        )}
                        {mgr.email ? (
                          <>
                            <span className="text-border">•</span>
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[200px]">{mgr.email}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-border">•</span>
                            <span className="text-destructive font-medium inline-flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Sin email
                            </span>
                          </>
                        )}
                        {!mgr.password_hash && mgr.email && (
                          <>
                            <span className="text-border">•</span>
                            <span className="text-amber-600 dark:text-amber-400">Sin contraseña</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Right: Primary action + menu */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!mgr.email ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openEmailDialog(mgr)}
                        className="rounded-xl gap-1.5 h-9"
                      >
                        <Mail className="h-4 w-4" />
                        Configurar email
                      </Button>
                    ) : !mgr.password_hash ? (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openInviteDialog(mgr)}
                        className="rounded-xl gap-1.5 h-9"
                      >
                        <Send className="h-4 w-4" />
                        Enviar invitación
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setProfileManager(mgr); setProfileOpen(true); }}
                        className="rounded-xl gap-1.5 h-9"
                      >
                        <Edit className="h-4 w-4" />
                        Editar perfil
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-xl h-9 w-9 p-0"
                          title="Más acciones"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>{mgr.name}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => { setProfileManager(mgr); setProfileOpen(true); }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar perfil
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEmailDialog(mgr)}>
                          <Mail className="h-4 w-4 mr-2" />
                          {mgr.email ? "Cambiar email" : "Configurar email"}
                        </DropdownMenuItem>
                        {mgr.email && (
                          <DropdownMenuItem onClick={() => openInviteDialog(mgr)}>
                            <Send className="h-4 w-4 mr-2" />
                            Enviar invitación
                          </DropdownMenuItem>
                        )}
                        {mgr.role === "manager" && !mgr.candidaturas_only && (
                          <DropdownMenuItem onClick={() => openEditDepartments(mgr)}>
                            <Building2 className="h-4 w-4 mr-2" />
                            Asignar departamentos
                            {assignedDepts.length > 0 && (
                              <span className="ml-auto text-xs text-muted-foreground">{assignedDepts.length}</span>
                            )}
                          </DropdownMenuItem>
                        )}
                        {mgr.role === "manager" && (
                          <DropdownMenuItem onClick={() => handleToggleCandidaturasOnly(mgr)}>
                            <UserCog className="h-4 w-4 mr-2" />
                            {mgr.candidaturas_only ? "Devolver acceso completo" : "Restringir a Candidaturas"}
                          </DropdownMenuItem>
                        )}
                        {mgr.password_hash && (
                          <DropdownMenuItem onClick={() => handleResetPassword(mgr.id)}>
                            <Key className="h-4 w-4 mr-2" />
                            Resetear contraseña
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {!isSelf && (
                          <DropdownMenuItem onClick={() => handleBlockManager(mgr.id, !mgr.is_blocked)}>
                            {mgr.is_blocked ? (
                              <>
                                <ShieldCheck className="h-4 w-4 mr-2 text-green-600" />
                                Desbloquear acceso
                              </>
                            ) : (
                              <>
                                <ShieldBan className="h-4 w-4 mr-2 text-destructive" />
                                Bloquear acceso
                              </>
                            )}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => { setSelectedManager(mgr); setDeleteDialogOpen(true); }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

              {/* Responsables under this manager */}
                {mgr.role === 'manager' && (() => {
                  const myResponsables = responsableWorkers.filter(rw => {
                    const respManager = managers.find(m => m.role === 'responsable' && m.worker_id === rw.id);
                    if (respManager) {
                      return respManager.parent_manager_id === mgr.id;
                    }
                    if (!rw.department_id || !assignedDeptIds.includes(rw.department_id)) return false;
                    const competingManagers = managers
                      .filter(otherMgr => otherMgr.role === 'manager' && getAssignedDepartmentIds(otherMgr).includes(rw.department_id!))
                      .sort((a, b) => getAssignedDepartmentIds(b).length - getAssignedDepartmentIds(a).length);
                    return competingManagers.length > 0 && competingManagers[0].id === mgr.id;
                  });
                  if (myResponsables.length === 0) return null;
                  return (
                    <Collapsible open={isExpanded} onOpenChange={toggleExpanded}>
                      <CollapsibleTrigger asChild>
                        <button className="w-full flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground border-t border-border/30 transition-colors">
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          <Users className="h-3 w-3" />
                          <span>{myResponsables.length} responsable{myResponsables.length > 1 ? 's' : ''} de equipo</span>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 pb-3 space-y-2">
                          {myResponsables.map(resp => {
                            const acct = resp.manager_account;
                            const responsableTeamLabel = resp.responsable_group_names?.length
                              ? resp.responsable_group_names.join(", ")
                              : resp.worker_team_name;
                            return (
                            <div key={resp.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/30 gap-2">
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center">
                                  <Users className="h-3.5 w-3.5 text-accent-foreground" />
                                </div>
                                <div>
                                  <span className="text-sm font-medium">{resp.name}</span>
                                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                                    <Badge variant="outline" className="text-[10px] px-1 py-0">Responsable</Badge>
                                    {responsableTeamLabel && <span>· {responsableTeamLabel}</span>}
                                    {acct?.email && <span>· {acct.email}</span>}
                                    {acct && !acct.password_hash && <span className="text-amber-600">· Sin contraseña</span>}
                                    {acct?.is_blocked && (
                                      <Badge variant="destructive" className="text-[10px] px-1 py-0">Bloqueado</Badge>
                                    )}
                                    {!acct && <span className="text-amber-600">· Sin cuenta de acceso</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-1 flex-wrap">
                                {acct ? (
                                  <>
                                    <Button variant={acct.email ? "ghost" : "destructive"} size="sm" onClick={() => openEmailDialog({ id: acct.id, name: resp.name, email: acct.email } as any)} className="h-7 px-2 rounded-lg gap-1 text-xs">
                                      <Mail className="h-3.5 w-3.5" />
                                      <span className="hidden sm:inline">{acct.email ? 'Email' : 'Configurar email'}</span>
                                    </Button>
                                    {acct.password_hash && (
                                      <Button variant="ghost" size="sm" onClick={() => handleResetPassword(acct.id)} className="h-7 px-2 rounded-lg gap-1 text-xs">
                                        <Key className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">Resetear</span>
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleBlockManager(acct.id, !acct.is_blocked)}
                                      className="h-7 px-2 rounded-lg gap-1 text-xs"
                                    >
                                      {acct.is_blocked ? (
                                        <><ShieldCheck className="h-3.5 w-3.5 text-green-600" /><span className="hidden sm:inline">Desbloquear</span></>
                                      ) : (
                                        <><ShieldBan className="h-3.5 w-3.5 text-destructive" /><span className="hidden sm:inline">Bloquear</span></>
                                      )}
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedManager({ id: acct.id, name: resp.name } as any); setDeleteDialogOpen(true); }} className="h-7 w-7 p-0 rounded-full text-destructive">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCreateResponsableAccount(resp, mgr.id)}
                                    disabled={creatingAccountFor === resp.id}
                                    className="h-7 px-3 rounded-lg gap-1 text-xs"
                                  >
                                    {creatingAccountFor === resp.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Plus className="h-3.5 w-3.5" />
                                    )}
                                    Crear cuenta de acceso
                                  </Button>
                                )}
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })()}
              </Card>
              );
            })}
          </div>
          );
        })()}
      </main>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar encargado</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que quieres eliminar a <strong>{selectedManager?.name}</strong>? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteManager}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Departments Dialog */}
      <Dialog open={editDeptDialogOpen} onOpenChange={setEditDeptDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar departamentos</DialogTitle>
            <DialogDescription>
              Selecciona los departamentos para <strong>{editingManager?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[300px] pr-4">
            <div className="space-y-3">
              {departments.map(dept => (
                <div
                  key={dept.id}
                  className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => toggleDepartmentSelection(dept.id)}
                >
                  <Checkbox
                    id={`dept-${dept.id}`}
                    checked={selectedDeptIds.includes(dept.id)}
                    onCheckedChange={() => toggleDepartmentSelection(dept.id)}
                  />
                  <Label
                    htmlFor={`dept-${dept.id}`}
                    className="flex-1 cursor-pointer font-normal"
                  >
                    {dept.name}
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>
          
          {selectedDeptIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t">
              {selectedDeptIds.map(id => {
                const dept = departments.find(d => d.id === id);
                return (
                  <Badge key={id} variant="secondary" className="text-xs">
                    {dept?.name}
                  </Badge>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDeptDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => editingManager && handleUpdateDepartments(editingManager.id, selectedDeptIds)}
              disabled={savingDepts}
            >
              {savingDepts ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Config Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Configurar email</DialogTitle>
            <DialogDescription>
              Email de inicio de sesión para <strong>{emailEditManager?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="manager-email">Email</Label>
            <Input
              id="manager-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="usuario@email.com"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEmail} disabled={savingEmail || !newEmail.trim()}>
              {savingEmail ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Invitation Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-500" />
              Enviar invitación
            </DialogTitle>
            <DialogDescription>
              Se enviará un email a <strong>{inviteManager?.name}</strong> con un enlace
              para configurar su contraseña y acceder al panel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Destinatario real</p>
              <p className="text-sm font-medium">{inviteManager?.email || "—"}</p>
              {inviteManager?.candidaturas_only && (
                <Badge variant="outline" className="text-[10px] mt-1 border-blue-500/40 text-blue-600 dark:text-blue-400">
                  Tras configurar la contraseña → Panel de Candidaturas
                </Badge>
              )}
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <Checkbox
                id="use-test-email"
                checked={useTestEmail}
                onCheckedChange={(c) => setUseTestEmail(!!c)}
              />
              <Label htmlFor="use-test-email" className="text-sm font-normal cursor-pointer">
                Enviar a otro email (modo prueba)
              </Label>
            </div>

            {useTestEmail && (
              <div className="space-y-2 animate-fade-in">
                <Label htmlFor="test-email">Email de prueba</Label>
                <Input
                  id="test-email"
                  type="email"
                  value={testEmailValue}
                  onChange={(e) => setTestEmailValue(e.target.value)}
                  placeholder="tu@email.com"
                />
                <p className="text-xs text-muted-foreground">
                  El email se enviará a esta dirección con el contenido de la invitación de{" "}
                  <strong>{inviteManager?.name}</strong>. El enlace configurará la contraseña
                  de su cuenta real.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)} disabled={sendingInvite}>
              Cancelar
            </Button>
            <Button onClick={handleSendInvitation} disabled={sendingInvite}>
              {sendingInvite ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" />{useTestEmail ? "Enviar prueba" : "Enviar invitación"}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManagerProfileDrawer
        open={profileOpen}
        onOpenChange={setProfileOpen}
        manager={
          profileManager
            ? {
                id: profileManager.id,
                name: profileManager.name,
                email: profileManager.email,
                avatar_url: profileManager.avatar_url,
              }
            : null
        }
        adminMode={true}
        allowPasswordChange={true}
        onSaved={() => fetchManagers()}
      />
    </div>
  );
};

export default ManagersAdmin;
