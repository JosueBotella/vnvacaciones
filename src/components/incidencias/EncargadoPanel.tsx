import { useState, useEffect, useCallback, useRef } from "react";
import { Clock, UsersRound, BarChart3, Bell, X, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { IncidenciasUserContext } from "@/modules/control-incidencias/core/types";
import { IncidenciasHeader } from "./IncidenciasHeader";
import { EncargadoKPICards } from "./EncargadoDashboard";
import { EncargadoNuevaIncidencia, type IncidenciaPrefill } from "./EncargadoNuevaIncidencia";
import { EncargadoHistorial } from "./EncargadoHistorial";

import { EncargadoAnalytics } from "./EncargadoAnalytics";
import { EncargadoSalidaVoluntaria } from "./EncargadoSalidaVoluntaria";
import { LaborWorkforceTab } from "@/components/labor/LaborWorkforceTab";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useHaptic } from "@/hooks/useHaptic";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

type Tab = "dashboard" | "historial" | "nueva" | "plantilla" | "salida";

const tabs: { id: Tab; label: string; icon: typeof Clock }[] = [
  { id: "dashboard", label: "Inicio", icon: BarChart3 },
  { id: "historial", label: "Historial", icon: Clock },
  { id: "plantilla", label: "Plantilla", icon: UsersRound },
  { id: "salida", label: "Salida", icon: LogOut },
];

// Framer Motion variants — smooth, no double animations
const tabVariants = {
  enter: { opacity: 0, y: 6 },
  center: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

// Pull-to-refresh threshold in px
const PTR_THRESHOLD = 72;

interface Props {
  userContext: IncidenciasUserContext;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function EncargadoPanel({ userContext, activeTab: externalTab, onTabChange: externalOnTabChange }: Props) {
  const resolvedTab = externalTab ? externalTab as Tab : undefined;
  const [localTab, setLocalTab] = useState<Tab>("dashboard");
  const activeTab: Tab = resolvedTab ?? localTab;
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(new Set(["dashboard"]));
  
  const setActiveTab = (tab: Tab) => {
    if (externalOnTabChange) {
      externalOnTabChange(tab);
    } else {
      setLocalTab(tab);
    }
  };
  const [defaultTabApplied, setDefaultTabApplied] = useState(false);
  const [filterWorkerId, setFilterWorkerId] = useState<string | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [erpDepartmentIds, setErpDepartmentIds] = useState<string[]>([]);
  const [nuevaPrefill, setNuevaPrefill] = useState<IncidenciaPrefill | null>(null);
  const [nuevaKey, setNuevaKey] = useState(0);
  const [dashRefreshKey, setDashRefreshKey] = useState(0);
  const [showPushBanner, setShowPushBanner] = useState(false);
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const haptic = useHaptic();
  const { status: pushStatus, subscribe: subscribePush, isSupported: pushSupported } = usePushNotifications(sessionToken);


  // Show push banner once if not subscribed and supported
  useEffect(() => {
    const dismissed = localStorage.getItem("push_banner_dismissed");
    if (pushSupported && pushStatus === "idle" && !dismissed) {
      const timer = setTimeout(() => setShowPushBanner(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [pushSupported, pushStatus]);

  // Pull-to-refresh state
  const [ptrPull, setPtrPull] = useState(0);          // 0–PTR_THRESHOLD px
  const [ptrActive, setPtrActive] = useState(false);  // refreshing spinner visible
  const [ptrReleasing, setPtrReleasing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const thresholdHit = useRef(false);
  const dashScrollRef = useRef<HTMLDivElement>(null);

  // Pull-to-refresh touch handlers (dashboard tab only)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (activeTab !== "dashboard") return;
    const el = dashScrollRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop ?? 0;
    if (scrollTop > 0) return;           // only when scrolled to top
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = true;
    thresholdHit.current = false;
  }, [activeTab]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy <= 0) { setPtrPull(0); return; }
    const clamped = Math.min(dy * 0.45, PTR_THRESHOLD + 16); // rubber-band damping
    setPtrPull(clamped);
    if (clamped >= PTR_THRESHOLD && !thresholdHit.current) {
      thresholdHit.current = true;
      haptic.threshold();
    }
  }, [haptic]);

  const handleTouchEnd = useCallback(() => {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (ptrPull >= PTR_THRESHOLD) {
      haptic.medium();
      setPtrReleasing(true);
      setPtrActive(true);
      setPtrPull(PTR_THRESHOLD); // snap to threshold while loading
      // Trigger reload
      setDashRefreshKey(k => k + 1);
      // Hide spinner after short delay
      setTimeout(() => {
        setPtrActive(false);
        setPtrReleasing(false);
        setPtrPull(0);
      }, 1200);
    } else {
      setPtrPull(0);
    }
    thresholdHit.current = false;
  }, [ptrPull, haptic]);

  // Departments that should default to "nueva incidencia" tab
  const DIRECT_INCIDENCIA_DEPTS = new Set(["Sacado V", "Encajado V", "Revisión V", "Revision V"]);

  // Load ERP department IDs for the workforce tab + check if should default to nueva
  useEffect(() => {
    const fetchErpDepts = async () => {
      if (!sessionToken) return;
      try {
        // Fetch ERP departments
        const { data } = await supabase.functions.invoke("admin-operations", {
          body: { action: "getManagerDepartments", sessionToken },
        });
        if (data?.success && data.departments) {
          setErpDepartmentIds(data.departments.map((d: any) => d.id));
        }

        // Fetch incidencias departments to check if should default to nueva
        if (!defaultTabApplied) {
          const { data: incData } = await supabase.functions.invoke("incidencias-operations", {
            body: { action: "getMyDepartments", sessionToken },
          });
          if (incData?.success && incData.departments && incData.departments.length > 0) {
            const deptNames: string[] = incData.departments.map((d: any) => d.name);
            const allMatchDirectIncidencia = deptNames.every((name: string) => DIRECT_INCIDENCIA_DEPTS.has(name));
            if (allMatchDirectIncidencia) {
              setActiveTab("nueva");
              setVisitedTabs(prev => new Set([...prev, "nueva"]));
            }
          }
          setDefaultTabApplied(true);
        }
      } catch {}
    };
    fetchErpDepts();
  }, [sessionToken, defaultTabApplied]);

  const handleStatsLoaded = useCallback((count: number) => {
    setTodayCount(count);
  }, []);

  const handleViewWorkerHistory = (workerId: string) => {
    setFilterWorkerId(workerId);
    handleTabChange("historial");
  };

  const handleTabChange = (tab: Tab) => {
    if (tab !== "historial") setFilterWorkerId(null);
    setActiveTab(tab);
    setVisitedTabs(prev => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  };

  const handleNuevaComplete = (prefill?: IncidenciaPrefill) => {
    if (prefill) {
      setNuevaPrefill(prefill);
      setNuevaKey(k => k + 1);
      setActiveTab("nueva");
    } else {
      setNuevaPrefill(null);
      handleTabChange("historial");
    }
  };

  // Pull indicator progress (0–1)
  const ptrProgress = Math.min(ptrPull / PTR_THRESHOLD, 1);
  const dashboardTabHeight = ptrPull > 0 ? `${ptrPull}px` : ptrActive ? `${PTR_THRESHOLD}px` : "0px";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <IncidenciasHeader userContext={userContext} />

      {/* Push notifications banner */}
      <AnimatePresence>
        {showPushBanner && pushStatus === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="mx-3 mt-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3"
          >
            <Bell className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Activar notificaciones</p>
              <p className="text-[10px] text-muted-foreground">Recibe alertas al llegar nuevas incidencias</p>
            </div>
            <button
              onClick={async () => {
                const ok = await subscribePush();
                setShowPushBanner(false);
                localStorage.setItem("push_banner_dismissed", "1");
                if (ok) toast.success("Notificaciones activadas ✓");
              }}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium"
            >
              Activar
            </button>
            <button
              onClick={() => { setShowPushBanner(false); localStorage.setItem("push_banner_dismissed", "1"); }}
              className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main
        className="flex-1 pb-24 md:pb-4 overflow-y-auto"
        ref={dashScrollRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        <AnimatePresence>
          {(ptrPull > 0 || ptrActive) && (
            <motion.div
              className="flex items-center justify-center overflow-hidden"
              style={{ height: dashboardTabHeight }}
              animate={{ height: dashboardTabHeight }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <div className="relative h-9 w-9">
                <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
                  <circle
                    cx="18" cy="18" r="15"
                    fill="none"
                    stroke="hsl(var(--primary) / 0.15)"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18" cy="18" r="15"
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 15}`}
                    strokeDashoffset={`${2 * Math.PI * 15 * (1 - (ptrActive ? 1 : ptrProgress))}`}
                    style={{ transition: ptrActive ? "stroke-dashoffset 0.8s linear" : "none" }}
                    className={ptrActive ? "animate-spin origin-center" : ""}
                  />
                </svg>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop pill tab bar */}
        <div className="hidden md:block max-w-7xl mx-auto px-4 pt-4">
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
                  {tab.id === "historial" && todayCount > 0 && (
                    <span className="min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                      {todayCount > 99 ? '99+' : todayCount}
                    </span>
                  )}
                </button>
              );
            })}
            {/* Desktop Nueva button */}
            <button
              onClick={() => handleTabChange("nueva")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === "nueva"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-primary/10 text-primary hover:bg-primary/20"
              )}
            >
              + Nueva
            </button>
          </div>
        </div>

        {/* Tab content — AnimatePresence for smooth transitions */}
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === "dashboard" && (
              <motion.div
                key={`dashboard-${dashRefreshKey}`}
                variants={tabVariants}
                initial="enter"
                animate="center"
                exit="exit"
               >
                <div className="flex flex-col gap-4">
                  <EncargadoKPICards
                    sessionToken={sessionToken}
                    departmentIds={userContext.departmentIds}
                    workerTeamIds={userContext.workerTeamIds}
                    onStatsLoaded={handleStatsLoaded}
                    refreshKey={dashRefreshKey}
                  />
                  <EncargadoAnalytics userContext={userContext} refreshKey={dashRefreshKey} />
                </div>
              </motion.div>
            )}

            {activeTab === "historial" && (
              <motion.div
                key="historial"
                variants={tabVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <EncargadoHistorial userContext={userContext} filterWorkerId={filterWorkerId} />
              </motion.div>
            )}

            {activeTab === "nueva" && (
              <motion.div
                key={`nueva-${nuevaKey}`}
                variants={tabVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <EncargadoNuevaIncidencia
                  key={nuevaKey}
                  userContext={userContext}
                  onComplete={handleNuevaComplete}
                  prefill={nuevaPrefill}
                />
              </motion.div>
            )}

            {activeTab === "plantilla" && (
              <motion.div
                key="plantilla"
                variants={tabVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <LaborWorkforceTab managerDepartmentIds={erpDepartmentIds} />
              </motion.div>
            )}

            {activeTab === "salida" && (
              <motion.div
                key="salida"
                variants={tabVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <EncargadoSalidaVoluntaria userContext={userContext} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile FAB — "+ Nueva Incidencia" floating action button */}
      <AnimatePresence>
        {activeTab !== "nueva" && (
          <motion.button
            key="fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            onClick={() => {
              haptic.medium();
              handleTabChange("nueva");
            }}
            className="fixed z-50 md:hidden h-14 w-14 rounded-full bg-primary flex items-center justify-center shadow-lg"
            style={{
              bottom: `calc(env(safe-area-inset-bottom, 0px) + 4.5rem)`,
              right: "1rem",
              boxShadow: "0 4px 20px hsl(var(--primary) / 0.4), 0 2px 8px hsl(var(--primary) / 0.25)",
            }}
            aria-label="Nueva incidencia"
          >
            <svg className="h-6 w-6 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Nav — glassmorphism pill style */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="mx-3 mb-2 glass-bottom-nav relative">
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
                  <span className="text-[9px] font-medium">{tab.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="enc-nav-dot"
                      className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 400, damping: 28 }}
                    />
                  )}
                  {tab.id === "historial" && todayCount > 0 && (
                    <span className="absolute -top-0.5 left-1/2 ml-2 min-w-[14px] h-[14px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-0.5">
                      {todayCount > 99 ? '99+' : todayCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
