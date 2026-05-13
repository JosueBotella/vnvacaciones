import { useState, useEffect, useCallback } from "react";
import { LayoutDashboard, Clock, Scale, Users, MoreHorizontal, Building2, Tag, Settings, Download, Shield, ScrollText, ListTodo, BarChart3, Plus, FileUp, Receipt, Layers, LogOut, Gavel, FileBarChart, Archive } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { IncidenciasUserContext } from "@/modules/control-incidencias/core/types";
import { IncidenciasHeader } from "./IncidenciasHeader";
import { AdminDashboardTab } from "./AdminDashboardTab";
import { AdminHistoricoTab } from "./AdminHistoricoTab";
import { AdminPropuestasTab } from "./AdminPropuestasTab";
import { AdminArchivadasTab } from "./AdminArchivadasTab";
import { AdminTrabajadoresTab } from "./AdminTrabajadoresTab";
import { AdminDepartamentosTab } from "./AdminDepartamentosTab";
import { AdminCategoriasTab } from "./AdminCategoriasTab";
import { AdminAjustesTab } from "./AdminAjustesTab";
import { AdminLogsTab } from "./AdminLogsTab";
import { AdminExportPanel } from "./AdminExportPanel";
import { AdminIntegridadTab } from "./AdminIntegridadTab";
import { AdminTareasTab } from "./AdminTareasTab";
import { AdminAnalyticsTab } from "./AdminAnalyticsTab";
import { AdminCSVImportTab } from "./AdminCSVImportTab";
import { AdminReclamacionesTab } from "./AdminReclamacionesTab";
import { AdminGravedadesTab } from "./AdminGravedadesTab";
import { AdminLegalTab } from "./AdminLegalTab";
import { AdminSalidasVoluntariasTab } from "./AdminSalidasVoluntariasTab";
import { AdminReportesTab } from "./AdminReportesTab";
import { EncargadoNuevaIncidencia } from "./EncargadoNuevaIncidencia";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Tab = "dashboard" | "historico" | "propuestas" | "archivadas" | "trabajadores" | "nueva" | "analitica" | "reclamaciones" | "tareas" | "departamentos" | "categorias" | "gravedades" | "ajustes" | "exportar" | "integridad" | "logs" | "importar" | "salidas" | "legal" | "reportes";

const HISTORICO_LAST_SEEN_KEY = "incidencias_historico_last_seen";

const primaryTabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Inicio", icon: LayoutDashboard },
  { id: "historico", label: "Historial", icon: Clock },
  { id: "propuestas", label: "Propuestas", icon: Scale },
  { id: "tareas", label: "Tareas", icon: ListTodo },
];

const secondaryTabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "trabajadores", label: "Trabajadores", icon: Users },
  { id: "analitica", label: "Analítica", icon: BarChart3 },
  { id: "reportes", label: "Reportes", icon: FileBarChart },
  { id: "reclamaciones", label: "Reclamaciones", icon: Receipt },
  { id: "salidas", label: "Salidas", icon: LogOut },
  { id: "archivadas", label: "Archivadas", icon: Archive },
  
  { id: "legal", label: "Legal", icon: Gavel },
  { id: "categorias", label: "Categorías", icon: Tag },
  { id: "gravedades", label: "Gravedades", icon: Layers },
  { id: "ajustes", label: "Ajustes", icon: Settings },
  { id: "exportar", label: "Exportar", icon: Download },
  { id: "integridad", label: "Integridad", icon: Shield },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "importar", label: "Importar CSV", icon: FileUp },
];

interface Props {
  userContext: IncidenciasUserContext;
  embedded?: boolean;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function AdminPanel({ userContext, embedded = false, activeTab: externalTab, onTabChange: externalOnTabChange }: Props) {
  const resolvedTab = (embedded && externalTab) ? externalTab as Tab : undefined;
  const [localTab, setLocalTab] = useState<Tab>("dashboard");
  const activeTab: Tab = resolvedTab ?? localTab;
  
  const setActiveTab = (tab: Tab) => {
    if (embedded && externalOnTabChange) {
      externalOnTabChange(tab);
    } else {
      setLocalTab(tab);
    }
  };
  const [historicoFilter, setHistoricoFilter] = useState<string | undefined>(undefined);
  const [pendingCount, setPendingCount] = useState(0);
  const [historicoNewCount, setHistoricoNewCount] = useState(0);
  const [salidasNewCount, setSalidasNewCount] = useState(0);
  const [tareasCount, setTareasCount] = useState(0);
  const [nuevaKey, setNuevaKey] = useState(0);

  const handleDashboardNavigate = (tab: string, filter?: string) => {
    if (tab === "historico") {
      setHistoricoFilter(filter);
    }
    setActiveTab(tab as Tab);
  };

  // Reset filter when manually switching tabs
  const handleTabChange = (tab: Tab) => {
    if (tab !== "historico") setHistoricoFilter(undefined);
    // Mark historico as seen when entering the tab
    if (tab === "historico") {
      localStorage.setItem(HISTORICO_LAST_SEEN_KEY, new Date().toISOString());
      setHistoricoNewCount(0);
    }
    setActiveTab(tab);
  };

  // Fetch unseen historico records count
  const fetchHistoricoNewCount = useCallback(async () => {
    try {
      const lastSeen = localStorage.getItem(HISTORICO_LAST_SEEN_KEY);
      const sessionToken = localStorage.getItem("manager_session_token") || "";
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "listIncidencias", sessionToken },
      });
      const records = data?.records || [];
      if (!lastSeen) {
        // First time: mark all as seen
        localStorage.setItem(HISTORICO_LAST_SEEN_KEY, new Date().toISOString());
        setHistoricoNewCount(0);
      } else {
        const lastSeenDate = new Date(lastSeen);
        const newCount = records.filter((r: any) => new Date(r.created_at) > lastSeenDate).length;
        setHistoricoNewCount(newCount);
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch pending propuestas count + salidas count
  useEffect(() => {
    const sessionToken = localStorage.getItem("manager_session_token") || "";
    const fetchCount = async () => {
      try {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "listPropuestas", sessionToken, estado: "pendiente" },
        });
        setPendingCount((data?.propuestas || []).length);
      } catch { /* ignore */ }
    };
    const fetchSalidasCount = async () => {
      try {
        const lastSeen = localStorage.getItem("incidencias_salidas_last_seen");
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "listSalidasVoluntarias", sessionToken },
        });
        const salidas = data?.salidas || [];
        if (!lastSeen) {
          localStorage.setItem("incidencias_salidas_last_seen", new Date().toISOString());
          setSalidasNewCount(0);
        } else {
          const lastSeenDate = new Date(lastSeen);
          const newCount = salidas.filter((s: any) => new Date(s.created_at) > lastSeenDate).length;
          setSalidasNewCount(newCount);
        }
      } catch { /* ignore */ }
    };
    const fetchTareasCount = async () => {
      try {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "listTasks", sessionToken },
        });
        const pendingTasks = Number(data?.stats?.pending || 0) + Number(data?.stats?.printed || 0) + Number(data?.stats?.awaiting_signature || 0);
        setTareasCount(pendingTasks);
      } catch { /* ignore */ }
    };
    fetchCount();
    fetchHistoricoNewCount();
    fetchSalidasCount();
    fetchTareasCount();

    // Poll every 30s as fallback (realtime may not fire due to RLS)
    const pollInterval = setInterval(() => {
      fetchCount();
      fetchTareasCount();
      fetchSalidasCount();
    }, 30000);

    // Realtime updates
    const channel = supabase
      .channel('admin-panel-badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias_propuestas_rrhh' }, () => {
        fetchCount();
        fetchTareasCount();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incidencias_records' }, () => {
        fetchHistoricoNewCount();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'salidas_voluntarias' }, () => {
        fetchSalidasCount();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias_firma_tasks' }, () => {
        fetchTareasCount();
      })
      .subscribe();
    return () => { clearInterval(pollInterval); supabase.removeChannel(channel); };
  }, [fetchHistoricoNewCount]);

  // When entering historico tab, mark as seen
  useEffect(() => {
    if (activeTab === "historico") {
      localStorage.setItem(HISTORICO_LAST_SEEN_KEY, new Date().toISOString());
      setHistoricoNewCount(0);
    }
    if (activeTab === "salidas") {
      localStorage.setItem("incidencias_salidas_last_seen", new Date().toISOString());
      setSalidasNewCount(0);
    }
  }, [activeTab]);

  const isSecondary = secondaryTabs.some(t => t.id === activeTab);
  const activeSecondary = secondaryTabs.find(t => t.id === activeTab);

  const getBadgeCount = (tabId: Tab) => {
    if (tabId === "propuestas") return pendingCount;
    if (tabId === "historico") return 0;
    if (tabId === "salidas") return salidasNewCount;
    if (tabId === "tareas") return tareasCount;
    return 0;
  };

  return (
    <div className={cn("bg-background flex flex-col", !embedded && "min-h-screen")}>
      {!embedded && <IncidenciasHeader userContext={userContext} />}

      {/* Compact pill navigation */}
      <div
        className={cn(
          embedded
            ? "mt-3"
            : "sticky z-30 bg-background/95 backdrop-blur-lg border-b border-border/30 top-12 md:top-16"
        )}
      >
        <div className={cn(
          "flex items-center gap-1 overflow-x-auto scrollbar-hide",
          embedded ? "max-w-7xl mx-auto px-4 sm:px-6 py-1.5" : "max-w-7xl mx-auto px-4 py-2"
        )}>
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badgeCount = getBadgeCount(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 shadow-lg animate-in zoom-in-50 duration-200">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* Nueva incidencia button */}
          <button
            onClick={() => {
              setNuevaKey(k => k + 1);
              handleTabChange("nueva");
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0",
              activeTab === "nueva"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva
          </button>

          {/* "Más" dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0",
                  isSecondary
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                {isSecondary ? activeSecondary?.label : "Más"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {secondaryTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <DropdownMenuItem
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(activeTab === tab.id && "bg-accent")}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {tab.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "dashboard" && <AdminDashboardTab onNavigate={handleDashboardNavigate} />}
            {activeTab === "nueva" && (
              <EncargadoNuevaIncidencia
                key={nuevaKey}
                userContext={userContext}
                onComplete={() => {
                  setActiveTab("historico");
                }}
              />
            )}
            {activeTab === "tareas" && <AdminTareasTab />}
            {activeTab === "analitica" && <AdminAnalyticsTab />}
            {activeTab === "historico" && <AdminHistoricoTab key={historicoFilter || 'default'} initialFiltro={historicoFilter as any} />}
            {activeTab === "propuestas" && <AdminPropuestasTab />}
            {activeTab === "archivadas" && <AdminArchivadasTab />}
            {activeTab === "trabajadores" && <AdminTrabajadoresTab />}
            
            {activeTab === "categorias" && <AdminCategoriasTab />}
            {activeTab === "gravedades" && <AdminGravedadesTab />}
            {activeTab === "ajustes" && <AdminAjustesTab />}
            {activeTab === "exportar" && <AdminExportPanel />}
            {activeTab === "integridad" && <AdminIntegridadTab />}
            {activeTab === "logs" && <AdminLogsTab />}
            {activeTab === "reclamaciones" && <AdminReclamacionesTab />}
            {activeTab === "importar" && <AdminCSVImportTab />}
            {activeTab === "salidas" && <AdminSalidasVoluntariasTab />}
            {activeTab === "legal" && <AdminLegalTab />}
            {activeTab === "reportes" && <AdminReportesTab />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
