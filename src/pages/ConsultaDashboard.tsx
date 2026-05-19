import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Calendar, LogOut, Users, ClipboardList, Clock, Scale, FileSearch } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import { useManagerAuth } from "@/modules/auth/hooks/useManagerAuth";
import LoadingScreen from "@/components/LoadingScreen";
import { ConsultaCalendarsPanel } from "@/components/consulta/ConsultaCalendarsPanel";
import { ConsultaGroupsPanel } from "@/components/consulta/ConsultaGroupsPanel";
import { ConsultaSchedulesPanel } from "@/components/consulta/ConsultaSchedulesPanel";
import { ConsultaBalanceTab } from "@/components/balance/ConsultaBalanceTab";
import { ConsultaTrialPeriodsTab } from "@/components/labor/ConsultaTrialPeriodsTab";
import { CandidaturasPanel } from "@/components/candidaturas/CandidaturasPanel";
import { DepartmentSearchSelect } from "@/components/DepartmentSearchSelect";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type Department = {
  id: string;
  name: string;
  slug: string | null;
  public_token?: string;
};

type WorkerTeam = {
  id: string;
  name: string;
  department_id: string;
  department_name: string;
  work_group_name: string | null;
  work_group_color: string | null;
  display_name?: string | null;
  responsable_worker_id?: string | null;
};

type Worker = {
  id: string;
  name: string;
  worker_number: string;
  worker_team_id: string | null;
  work_group_id: string | null;
  department_id: string;
  is_on_leave?: boolean;
  is_responsable?: boolean;
};

type WorkGroup = {
  id: string;
  name: string;
  color: string;
  department_id: string;
  sort_order: number;
};

type Tab = "calendars" | "groups" | "schedules" | "balance" | "trial" | "candidaturas";

const tabs: { id: Tab; label: string; shortLabel: string; icon: typeof Calendar }[] = [
  { id: "calendars", label: "Calendarios", shortLabel: "Calen.", icon: Calendar },
  { id: "groups", label: "Equipos", shortLabel: "Equipos", icon: Users },
  { id: "schedules", label: "Horarios", shortLabel: "Horar.", icon: ClipboardList },
  { id: "balance", label: "Horas", shortLabel: "Horas", icon: Scale },
  { id: "trial", label: "Periodo Prueba", shortLabel: "Prueba", icon: Clock },
  { id: "candidaturas", label: "Candidaturas", shortLabel: "Cand.", icon: FileSearch },
];

const ConsultaDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const previewManagerId = searchParams.get("preview");
  const { manager, isAdmin, isAuthenticated, isLoading: authLoading, logout } = useManagerAuth();
  const isPreviewMode = !!previewManagerId && isAdmin;

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewManagerName, setPreviewManagerName] = useState<string>("");
  const [workerTeams, setWorkerTeams] = useState<WorkerTeam[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");

  const [activeTab, setActiveTab] = useState<Tab>("calendars");
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(new Set(["calendars"]));

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate("/login"); return; }
    if (!isPreviewMode && manager?.role !== "consulta") {
      if (manager?.role === "admin") navigate("/admin");
      else navigate("/manager");
      return;
    }
    if (isPreviewMode) fetchPreviewManagerName(previewManagerId!);
    fetchData();
  }, [authLoading, isAuthenticated, isPreviewMode, manager?.role, navigate]);

  const fetchPreviewManagerName = async (managerId: string) => {
    try {
      const { data } = await supabase.rpc("get_public_managers");
      const m = data?.find((x: any) => x.id === managerId);
      if (m) setPreviewManagerName(m.name);
    } catch {}
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: depts, error: deptError } = await supabase.rpc('get_public_departments');
      if (deptError) {
        console.error("Error fetching departments:", deptError);
        toast.error("Error al cargar departamentos");
        setLoading(false);
        return;
      }

      const departmentList = (depts || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        slug: d.slug,
        public_token: d.public_token,
      }));
      departmentList.sort((a: Department, b: Department) => a.name.localeCompare(b.name));
      setDepartments(departmentList);

      if (departmentList.length > 0) {
        setSelectedDepartment(departmentList[0].id);
      }

      await fetchWorkerGroups();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al cargar datos");
    }
    setLoading(false);
  };

  const fetchWorkerGroups = async () => {
    const sessionToken = localStorage.getItem("manager_session_token");
    if (!sessionToken) return;
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getAllWorkerGroups", sessionToken, data: {} }
      });
      if (!error && response?.success) {
        setWorkerTeams(response.workerTeams || []);
        setWorkers(response.workers || []);
        setWorkGroups(response.workGroups || []);
      }
    } catch (err) {
      console.error("Error fetching worker groups:", err);
    }
  };

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setVisitedTabs(prev => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  if (authLoading) return <LoadingScreen />;

  const headerName = isPreviewMode ? previewManagerName : manager?.name;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Glassmorphism header */}
      <header className="glass-header">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <LogoLink to="/consulta" />
              <div>
                <h1 className="text-sm sm:text-lg md:text-xl font-semibold text-foreground tracking-tight">
                  Panel de Consulta
                </h1>
                <p className="text-[10px] sm:text-xs md:text-sm text-muted-foreground font-light tracking-tight">
                  {headerName ? `${headerName} · ` : ""}Solo lectura
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
              <ThemeToggle />
              {!isPreviewMode && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="rounded-xl h-8 sm:h-9 px-2 sm:px-3"
                >
                  <LogOut className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Salir</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-24 md:pb-4">
        {/* Unified department selector — hidden in candidaturas (global, no dept filter) */}
        {activeTab !== "candidaturas" && (
          <div className="max-w-7xl mx-auto px-4 pt-4">
            <DepartmentSearchSelect
              departments={departments}
              value={selectedDepartment}
              onChange={setSelectedDepartment}
              includeAll={false}
              placeholder="Seleccionar departamento..."
              className="sm:max-w-xs"
            />
          </div>
        )}

        {/* Desktop pill tab bar */}
        <div className="hidden md:block max-w-7xl mx-auto px-4 mt-4">
          <div className="inline-flex items-center gap-1 rounded-xl bg-muted p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content — visited-tabs pattern */}
        <div className="max-w-7xl mx-auto px-4 mt-4">
          {visitedTabs.has("calendars") && (
            <div className={activeTab !== "calendars" ? "hidden" : "animate-fade-in"}>
              <ConsultaCalendarsPanel
                departments={departments}
                selectedDepartment={selectedDepartment}
                loading={loading}
              />
            </div>
          )}
          {visitedTabs.has("groups") && (
            <div className={activeTab !== "groups" ? "hidden" : "animate-fade-in"}>
              <ConsultaGroupsPanel
                departments={departments}
                selectedDepartment={selectedDepartment}
                workerTeams={workerTeams}
                workers={workers}
              />
            </div>
          )}
          {visitedTabs.has("schedules") && (
            <div className={activeTab !== "schedules" ? "hidden" : "animate-fade-in"}>
              <ConsultaSchedulesPanel
                departments={departments}
                selectedDepartment={selectedDepartment}
                workers={workers}
                workGroups={workGroups}
                workerTeams={workerTeams}
              />
            </div>
          )}
          {visitedTabs.has("balance") && (
            <div className={activeTab !== "balance" ? "hidden" : "animate-fade-in"}>
              <ConsultaBalanceTab
                departmentIds={departments.map(d => d.id)}
                departments={departments.map(d => ({ id: d.id, name: d.name }))}
                selectedDepartment={selectedDepartment}
                onDepartmentChange={setSelectedDepartment}
              />
            </div>
          )}
          {visitedTabs.has("trial") && (
            <div className={activeTab !== "trial" ? "hidden" : "animate-fade-in"}>
              <ConsultaTrialPeriodsTab
                departments={departments.map(d => ({ id: d.id, name: d.name }))}
                selectedDepartment={selectedDepartment}
                onDepartmentChange={setSelectedDepartment}
              />
            </div>
          )}
          {visitedTabs.has("candidaturas") && (
            <div className={activeTab !== "candidaturas" ? "hidden" : "animate-fade-in"}>
              <CandidaturasPanel embedded isAdmin={false} isConsulta={true} />
            </div>
          )}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="mx-3 mb-2 rounded-2xl border bg-card/95 border-border/40 shadow-[0_2px_12px_hsl(var(--foreground)/0.04)] dark:bg-card/90 dark:border-border/20 dark:shadow-[0_2px_12px_hsl(0_0%_0%/0.3)]">
          <div className="flex items-center justify-around h-14 px-2">
            {tabs.map((tab) => {
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
                  {isActive && (
                    <motion.div
                      layoutId="consulta-nav-dot"
                      className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 400, damping: 28 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
};

export default ConsultaDashboard;
