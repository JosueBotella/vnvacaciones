import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import { supabase } from "@/integrations/supabase/client";
import { useIncidenciasAuth } from "@/modules/control-incidencias/core/useIncidenciasAuth";
import LoadingScreen from "@/components/LoadingScreen";
import {
  SidebarProvider,
  SidebarTrigger,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import { Button } from "@/components/ui/button";
import {
  Calendar, Users, Scale, AlertTriangle, LogOut, Home,
  CalendarDays, Building2, UserCog, Eye, ClipboardList, FileSearch,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import AdminDashboard from "./AdminDashboard";
import LaborModule from "./LaborModule";
import BalanceHoras from "./BalanceHoras";
import { AdminPanel } from "@/components/incidencias/AdminPanel";
import OperativaDiariaPanel from "@/components/operativa/OperativaDiariaPanel";
import { CandidaturasPanel } from "@/components/candidaturas/CandidaturasPanel";

type Module = "vacaciones" | "personal" | "balance" | "incidencias" | "operativa" | "candidaturas";

const modules: { id: Module; label: string; icon: typeof Calendar }[] = [
  { id: "vacaciones", label: "Vacaciones", icon: Calendar },
  { id: "personal", label: "Personal", icon: Users },
  { id: "balance", label: "Balance", icon: Scale },
  { id: "incidencias", label: "Incidencias", icon: AlertTriangle },
  { id: "operativa", label: "Operativa", icon: ClipboardList },
  { id: "candidaturas", label: "Candidaturas", icon: FileSearch },
];

const adminTools: { label: string; icon: typeof Calendar; path: string }[] = [
  { label: "Calendario Anual", icon: CalendarDays, path: "/admin/annual-calendar" },
  { label: "Departamentos", icon: Building2, path: "/admin/departments" },
  { label: "Encargados", icon: UserCog, path: "/admin/managers" },
];

function ControlSidebar({
  activeModule,
  onModuleChange,
  visibleModules,
  showAdminTools,
}: {
  activeModule: Module;
  onModuleChange: (m: Module) => void;
  visibleModules?: Module[];
  showAdminTools?: boolean;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();

  const filteredModules = visibleModules
    ? modules.filter((m) => visibleModules.includes(m.id))
    : modules;

  return (
    <Sidebar collapsible="icon" className="border-r border-border/30">
      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupLabel className={cn(collapsed && "sr-only")}>
            Módulos
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredModules.map((mod) => {
                const Icon = mod.icon;
                const isActive = activeModule === mod.id;
                return (
                  <SidebarMenuItem key={mod.id}>
                    <SidebarMenuButton
                      onClick={() => onModuleChange(mod.id)}
                      isActive={isActive}
                      tooltip={mod.label}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{mod.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showAdminTools !== false && (
          <SidebarGroup>
            <SidebarGroupLabel className={cn(collapsed && "sr-only")}>
              Administración
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminTools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <SidebarMenuItem key={tool.path}>
                      <SidebarMenuButton
                        onClick={() => navigate(tool.path)}
                        tooltip={tool.label}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{tool.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}

export default function AdminControlPanel() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { manager, isAdmin, isConsulta, isAuthenticated, isLoading, logout } = useManagerAuth();
  const { userContext } = useIncidenciasAuth();

  const defaultModule: Module = isAdmin ? "vacaciones" : "candidaturas";
  const activeModule = (searchParams.get("module") as Module) || defaultModule;
  const childTab = searchParams.get("tab") || undefined;

  const [visitedModules, setVisitedModules] = useState<Set<Module>>(
    () => new Set([activeModule])
  );
  const [allManagers, setAllManagers] = useState<Array<{ id: string; name: string; role: string; department_ids: string[]; candidaturas_only?: boolean }>>([]);
  const [responsablesByDept, setResponsablesByDept] = useState<Record<string, Array<{ id: string; name: string; worker_team_name: string | null; hasAccount: boolean }>>>({});
  const [expandedManagerIds, setExpandedManagerIds] = useState<Set<string>>(new Set());

  const fetchAllManagers = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_public_managers");
      if (!error && data) {
        // Fetch department assignments for managers
        const sessionToken = localStorage.getItem("manager_session_token") || sessionStorage.getItem("manager_session_token");
        const deptAssignments: Record<string, string[]> = {};
        
        if (sessionToken) {
          // Get assignments
          const assignResp = await supabase.functions.invoke('admin-operations', {
            body: { action: 'getManagers', sessionToken }
          });
          if (assignResp.data?.success && assignResp.data.managers) {
            for (const m of assignResp.data.managers) {
              if (m.manager_department_assignments?.length > 0) {
                deptAssignments[m.id] = m.manager_department_assignments.map((a: any) => a.department_id);
              } else if (m.department_id) {
                deptAssignments[m.id] = [m.department_id];
              }
            }
          }
          
          // Fetch responsable workers with department info
          const resp = await supabase.functions.invoke('admin-operations', {
            body: { action: 'getResponsableWorkers', sessionToken }
          });
          if (resp.data?.success && resp.data.workers) {
            const byDept: Record<string, Array<{ id: string; name: string; worker_team_name: string | null; hasAccount: boolean }>> = {};
            for (const w of resp.data.workers) {
              if (w.department_id) {
                if (!byDept[w.department_id]) byDept[w.department_id] = [];
                byDept[w.department_id].push({
                  id: w.manager_account?.id || w.id,
                  name: w.name,
                  worker_team_name: w.worker_team_name,
                  hasAccount: !!w.manager_account,
                });
              }
            }
            setResponsablesByDept(byDept);
          }
        }
        
        setAllManagers(
          data
            .filter((m: any) => m.role !== 'admin' && m.role !== 'responsable')
            .map((m: any) => ({ ...m, department_ids: deptAssignments[m.id] || [], candidaturas_only: !!m.candidaturas_only }))
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (isAuthenticated && isAdmin) fetchAllManagers();
  }, [isAuthenticated, isAdmin, fetchAllManagers]);

  const setActiveModule = useCallback((mod: Module) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("module", mod);
      next.delete("tab"); // reset child tab when switching modules
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || (!isAdmin && !isConsulta))) {
      // Restricted "candidaturas only" managers go to their dedicated panel
      if (isAuthenticated && manager?.candidaturas_only) {
        navigate("/candidaturas", { replace: true });
        return;
      }
      navigate("/login");
    }
  }, [isLoading, isAuthenticated, isAdmin, isConsulta, manager, navigate]);

  // Force candidaturas_only managers out of /admin even if they have admin/consulta role somehow
  useEffect(() => {
    if (!isLoading && manager?.candidaturas_only) {
      navigate("/candidaturas", { replace: true });
    }
  }, [isLoading, manager, navigate]);

  // For consulta role, force candidaturas module
  useEffect(() => {
    if (!isLoading && isAuthenticated && !isAdmin && isConsulta && activeModule !== "candidaturas") {
      setActiveModule("candidaturas");
    }
  }, [isLoading, isAuthenticated, isAdmin, isConsulta, activeModule, setActiveModule]);

  const handleModuleChange = (mod: Module) => {
    setActiveModule(mod);
    setVisitedModules((prev) => {
      if (prev.has(mod)) return prev;
      return new Set(prev).add(mod);
    });
  };

  const handleChildTabChange = useCallback((tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab) {
        next.set("tab", tab);
      } else {
        next.delete("tab");
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated || (!isAdmin && !isConsulta)) return null;

  const moduleLabels: Record<Module, string> = {
    vacaciones: "Vacaciones",
    personal: "Personal",
    balance: "Balance de Horas",
    incidencias: "Incidencias",
    operativa: "Operativa Diaria",
    candidaturas: "Candidaturas",
  };

  const visibleModules: Module[] = isAdmin
    ? ["vacaciones", "personal", "balance", "incidencias", "operativa", "candidaturas"]
    : ["candidaturas"];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <ControlSidebar
          activeModule={activeModule}
          onModuleChange={handleModuleChange}
          visibleModules={visibleModules}
          showAdminTools={isAdmin}
        />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="glass-header">
            <div className="flex items-center justify-between px-4 py-1.5">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="-ml-1" />
                <LogoLink to="/admin" />
                <div className="min-w-0">
                  <h1 className="text-sm font-semibold text-foreground tracking-tight truncate">
                    {moduleLabels[activeModule]}
                  </h1>
                  <p className="text-[10px] text-muted-foreground font-light">
                    {manager?.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full"
                      title="Ver como encargado"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto w-60">
                    {allManagers.length === 0 && (
                      <DropdownMenuItem disabled>Cargando…</DropdownMenuItem>
                    )}
                    {allManagers.map((m) => {
                      const mgrResponsables = m.department_ids.flatMap(
                        (dId: string) => responsablesByDept[dId] || []
                      );
                      const isExpanded = expandedManagerIds.has(m.id);
                      
                      if (mgrResponsables.length > 0) {
                        return (
                          <div key={m.id}>
                            <div className="flex items-center">
                              <DropdownMenuItem
                                className="flex-1"
                                onClick={() => navigate(m.candidaturas_only ? `/candidaturas?preview=${m.id}` : `/manager?preview=${m.id}`)}
                              >
                                {m.name}
                              </DropdownMenuItem>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setExpandedManagerIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(m.id)) next.delete(m.id);
                                    else next.add(m.id);
                                    return next;
                                  });
                                }}
                                className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                              >
                                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                              </button>
                            </div>
                            {isExpanded && (
                              <div className="pl-3 border-l-2 border-border/30 ml-3 mb-1 space-y-0.5">
                                <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal py-1">
                                  Responsables de equipo
                                </DropdownMenuLabel>
                                {mgrResponsables.map((r) => (
                                  <DropdownMenuItem
                                    key={r.id}
                                    onClick={() => r.hasAccount && navigate(`/manager?preview=${r.id}`)}
                                    disabled={!r.hasAccount}
                                    className="py-1.5"
                                  >
                                    {r.name}
                                    {r.worker_team_name && (
                                      <span className="ml-auto text-[10px] text-muted-foreground">Eq. {r.worker_team_name}</span>
                                    )}
                                    {!r.hasAccount && (
                                      <span className="ml-1 text-[9px] text-muted-foreground">(sin cuenta)</span>
                                    )}
                                  </DropdownMenuItem>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }
                      
                      return (
                        <DropdownMenuItem
                          key={m.id}
                          onClick={() => navigate(m.candidaturas_only ? `/candidaturas?preview=${m.id}` : `/manager?preview=${m.id}`)}
                        >
                          {m.name}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                )}
                <ThemeToggle />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/")}
                  className="h-8 w-8 p-0 rounded-full"
                  title="Panel de herramientas"
                >
                  <Home className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="h-8 w-8 p-0 rounded-full"
                  title="Cerrar sesión"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          {/* Module content — visitedTabs pattern */}
          <main className="flex-1">
            {visitedModules.has("vacaciones") && (
              <div className={activeModule !== "vacaciones" ? "hidden" : undefined}>
                <AdminDashboard embedded activeTab={activeModule === "vacaciones" ? childTab : undefined} onTabChange={handleChildTabChange} />
              </div>
            )}

            {visitedModules.has("personal") && (
              <div className={activeModule !== "personal" ? "hidden" : undefined}>
                <LaborModule embedded activeTab={activeModule === "personal" ? childTab : undefined} onTabChange={handleChildTabChange} />
              </div>
            )}

            {visitedModules.has("balance") && (
              <div className={activeModule !== "balance" ? "hidden" : undefined}>
                <BalanceHoras embedded activeTab={activeModule === "balance" ? childTab : undefined} onTabChange={handleChildTabChange} />
              </div>
            )}

            {visitedModules.has("incidencias") && userContext && (
              <div className={activeModule !== "incidencias" ? "hidden" : undefined}>
                <AdminPanel userContext={userContext} embedded activeTab={activeModule === "incidencias" ? childTab : undefined} onTabChange={handleChildTabChange} />
              </div>
            )}

            {visitedModules.has("operativa") && (
              <div className={activeModule !== "operativa" ? "hidden" : undefined}>
                <OperativaDiariaPanel embedded />
              </div>
            )}

            {visitedModules.has("candidaturas") && (
              <div className={activeModule !== "candidaturas" ? "hidden" : undefined}>
                <CandidaturasPanel embedded isAdmin={isAdmin} isConsulta={isConsulta} activeTab={activeModule === "candidaturas" ? childTab : undefined} onTabChange={handleChildTabChange} />
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
