import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  BarChart3, TrendingUp, TrendingDown, Users, Search, X, CalendarIcon,
  ArrowUpRight, ArrowDownRight, Minus, ChevronDown, GitCompareArrows,
  Filter, Sparkles, AlertTriangle, ShieldAlert, Lightbulb, Building2
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import type { IncidenciasUserContext } from "@/modules/control-incidencias/core/types";
import type { PatternAnalysis } from "@/modules/control-incidencias/ia";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Types ──
interface AnalyticsData {
  totalIncidencias: number;
  mediaDiaria: number;
  gravedad: { leve: number; grave: number; muy_grave: number };
  gravedadDominante: string;
  timeSeries: { date: string; count: number }[];
  ranking: { worker_id: string; worker_name: string; count: number }[];
  dayDistribution: number[];
  topCategories: { id: string; name: string; count: number; pct: number }[];
}

interface Props {
  userContext: IncidenciasUserContext;
  refreshKey?: number;
}

type PresetKey = "today" | "this_week" | "last_week" | "this_month" | "last_month" | "last_90" | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "this_week", label: "Esta semana" },
  { key: "last_week", label: "Semana pasada" },
  { key: "this_month", label: "Este mes" },
  { key: "last_month", label: "Mes pasado" },
  { key: "last_90", label: "Últimos 90d" },
];

const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

function getPresetDates(key: PresetKey): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "today": return { start: today, end: today };
    case "this_week": return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
    case "last_week": { const s = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }); return { start: s, end: endOfWeek(s, { weekStartsOn: 1 }) }; }
    case "this_month": return { start: startOfMonth(today), end: endOfMonth(today) };
    case "last_month": { const s = startOfMonth(subMonths(today, 1)); return { start: s, end: endOfMonth(s) }; }
    case "last_90": return { start: subDays(today, 89), end: today };
    default: return { start: today, end: today };
  }
}

function getPresetLabel(key: PresetKey): string {
  if (key === "custom") return "Personalizado";
  return PRESETS.find(p => p.key === key)?.label || key;
}

const SEVERITY_COLORS = { leve: "#93d600", grave: "#eab308", muy_grave: "#ef4444" };

// ── Skeleton ──
function AnalyticsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
        <Skeleton className="h-4 w-28 mb-3" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
      <div className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
        <Skeleton className="h-4 w-36 mb-3" />
        <div className="flex items-center justify-center gap-4">
          <Skeleton className="h-32 w-32 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
        <Skeleton className="h-4 w-40 mb-3" />
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 mb-2">
            <Skeleton className="h-7 w-7 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Alert level badge ──
function AlertBadge({ level }: { level: string }) {
  const config: Record<string, { color: string; label: string }> = {
    bajo: { color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", label: "Bajo" },
    medio: { color: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30", label: "Medio" },
    alto: { color: "bg-orange-500/15 text-orange-600 border-orange-500/30", label: "Alto" },
    critico: { color: "bg-red-500/15 text-red-600 border-red-500/30", label: "Crítico" },
  };
  const c = config[level] || config.bajo;
  return <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold border", c.color)}>{c.label}</span>;
}

export function EncargadoAnalytics({ userContext, refreshKey }: Props) {
  const sessionToken = localStorage.getItem("manager_session_token") || "";

  // ── Filter state ──
  const [preset, setPreset] = useState<PresetKey>("this_month");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [periodOpen, setPeriodOpen] = useState(false);
  const [showCustomInPeriod, setShowCustomInPeriod] = useState(false);

  const [compareMode, setCompareMode] = useState(false);
  const [comparePreset, setComparePreset] = useState<PresetKey>("last_week");
  const [compareCustom, setCompareCustom] = useState<{ from?: Date; to?: Date }>({});
  const [compareOpen, setCompareOpen] = useState(false);
  const [showCustomInCompare, setShowCustomInCompare] = useState(false);

  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [workerSearch, setWorkerSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [compareData, setCompareData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<{ id: string; name: string; worker_code?: string | null }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  // ── AI state ──
  const [aiAnalysis, setAiAnalysis] = useState<PatternAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // ── Computed dates ──
  const { startDate, endDate } = useMemo(() => {
    if (preset === "custom" && customRange.from && customRange.to) {
      return { startDate: customRange.from, endDate: customRange.to };
    }
    const d = getPresetDates(preset);
    return { startDate: d.start, endDate: d.end };
  }, [preset, customRange]);

  const { compareStartDate, compareEndDate } = useMemo(() => {
    if (!compareMode) return { compareStartDate: null, compareEndDate: null };
    if (comparePreset === "custom" && compareCustom.from && compareCustom.to) {
      return { compareStartDate: compareCustom.from, compareEndDate: compareCustom.to };
    }
    const d = getPresetDates(comparePreset);
    return { compareStartDate: d.start, compareEndDate: d.end };
  }, [compareMode, comparePreset, compareCustom]);

  // ── Period label ──
  const periodLabel = useMemo(() => {
    if (preset === "custom" && customRange.from && customRange.to) {
      return `${format(customRange.from, "dd/MM", { locale: es })} — ${format(customRange.to, "dd/MM", { locale: es })}`;
    }
    return getPresetLabel(preset);
  }, [preset, customRange]);

  const compareLabel = useMemo(() => {
    if (comparePreset === "custom" && compareCustom.from && compareCustom.to) {
      return `${format(compareCustom.from, "dd/MM", { locale: es })} — ${format(compareCustom.to, "dd/MM", { locale: es })}`;
    }
    return getPresetLabel(comparePreset);
  }, [comparePreset, compareCustom]);

  // ── Load workers + departments ──
  useEffect(() => {
    if (!sessionToken || userContext.departmentIds.length === 0) return;
    const fetch = async () => {
      const allWorkers: { id: string; name: string }[] = [];
      const allDepts: { id: string; name: string }[] = [];
      for (const deptId of userContext.departmentIds) {
        // Workers
        const { data: res } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "listIncidenciasWorkers", sessionToken, departmentId: deptId },
        });
        if (res?.success && res.workers) {
          for (const w of res.workers) {
            allWorkers.push({ id: w.id, name: `${w.nombre} ${w.apellidos || ""}`.trim() });
          }
        }
        // Departments
        const { data: dRes } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "getAccessibleDepartments", sessionToken },
        });
        if (dRes?.success && dRes.departments) {
          for (const d of dRes.departments) {
            if (!allDepts.find(x => x.id === d.id)) {
              allDepts.push({ id: d.id, name: d.name });
            }
          }
        }
      }
      setWorkers(allWorkers);
      setDepartments(allDepts);
    };
    fetch();
  }, [sessionToken, userContext.departmentIds]);

  // ── Fetch analytics ──
  const fetchData = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const payload: any = {
        action: "getAnalyticsData",
        sessionToken,
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
        departmentIds: selectedDepartments.length > 0 ? selectedDepartments : userContext.departmentIds,
        ...(userContext.workerTeamIds ? { workerTeamIds: userContext.workerTeamIds } : {}),
      };
      if (selectedWorkers.length > 0) payload.workerIds = selectedWorkers;
      if (compareStartDate && compareEndDate) {
        payload.compareStartDate = format(compareStartDate, "yyyy-MM-dd");
        payload.compareEndDate = format(compareEndDate, "yyyy-MM-dd");
      }
      const { data: res } = await supabase.functions.invoke("incidencias-operations", { body: payload });
      if (res?.success) {
        setData(res.current);
        setCompareData(res.comparison || null);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [sessionToken, startDate, endDate, compareStartDate, compareEndDate, selectedWorkers, selectedDepartments, userContext.departmentIds]);

  useEffect(() => { fetchData(); }, [fetchData]);
  // Re-fetch when parent triggers pull-to-refresh
  useEffect(() => { if (refreshKey && refreshKey > 0) fetchData(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription — re-fetch analytics when records change
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchData(), 2000);
    };
    const channel = supabase
      .channel('encargado-analytics-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias_records' }, debouncedFetch)
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // ── AI Analysis ──
  const runAiAnalysis = useCallback(async () => {
    if (!data || aiLoading) return;
    setAiLoading(true);
    try {
      const deptName = departments.length > 0
        ? (selectedDepartments.length > 0
          ? departments.filter(d => selectedDepartments.includes(d.id)).map(d => d.name).join(", ")
          : departments.map(d => d.name).join(", "))
        : "General";
      const { data: res } = await supabase.functions.invoke("control-incidencias-ai", {
        body: {
          action: "analyze_patterns",
          department_name: deptName,
          stats: {
            total: data.totalIncidencias,
            leves: data.gravedad.leve,
            graves: data.gravedad.grave,
            muy_graves: data.gravedad.muy_grave,
            media_diaria: data.mediaDiaria,
          },
          day_distribution: data.dayDistribution,
          tendencia: data.timeSeries.length > 1
            ? (data.timeSeries[data.timeSeries.length - 1].count > data.timeSeries[0].count ? "subiendo" : "bajando")
            : "estable",
          top_workers: data.ranking.slice(0, 5).map(w => ({ nombre: w.worker_name, total: w.count })),
        },
      });
      if (res) setAiAnalysis(res as PatternAnalysis);
    } catch (e) {
      console.error("AI analysis error:", e);
    }
    setAiLoading(false);
  }, [data, aiLoading, departments, selectedDepartments]);

  // ── Helpers ──
  const filteredWorkers = useMemo(() => {
    const q = workerSearch.toLowerCase();
    return workers.filter(w => w.name.toLowerCase().includes(q) || (w.worker_code && w.worker_code.toLowerCase().includes(q)));
  }, [workers, workerSearch]);

  const toggleWorker = (id: string) => {
    setSelectedWorkers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleDepartment = (id: string) => {
    setSelectedDepartments(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const delta = useMemo(() => {
    if (!data || !compareData) return null;
    const diff = data.totalIncidencias - compareData.totalIncidencias;
    const pct = compareData.totalIncidencias > 0 ? Math.round((diff / compareData.totalIncidencias) * 100) : null;
    return { diff, pct };
  }, [data, compareData]);

  const activeFilterCount = selectedWorkers.length + selectedDepartments.length;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl bg-popover text-popover-foreground border border-border/50 px-3 py-2 shadow-lg text-xs">
        <p className="font-medium mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>
        ))}
      </div>
    );
  };

  const maxRanking = data?.ranking?.[0]?.count || 1;

  return (
    <div className="space-y-4 pb-4">
      {/* ═══ COMPACT FILTERS ═══ */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Period dropdown */}
        <Popover open={periodOpen} onOpenChange={(o) => { setPeriodOpen(o); if (!o) setShowCustomInPeriod(false); }}>
          <PopoverTrigger asChild>
            <button className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
              "bg-primary text-primary-foreground border-primary shadow-sm"
            )}>
              <CalendarIcon className="h-3 w-3" />
              {periodLabel}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
          </PopoverTrigger>
           <PopoverContent className="w-[calc(100vw-2rem)] sm:w-auto p-2 bg-popover" align="start" side="bottom" sideOffset={6} collisionPadding={16}>
            <div className="space-y-1 min-w-[180px]">
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => { setPreset(p.key); setShowCustomInPeriod(false); setPeriodOpen(false); }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                    preset === p.key && preset !== "custom" ? "bg-primary/15 text-primary" : "hover:bg-muted/60 text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => { setPreset("custom"); setShowCustomInPeriod(true); }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                  preset === "custom" ? "bg-primary/15 text-primary" : "hover:bg-muted/60 text-foreground"
                )}
              >
                Personalizado…
              </button>
            </div>
            {showCustomInPeriod && (
              <div className="mt-2 border-t border-border/30 pt-2">
                <Calendar
                  mode="range"
                  selected={customRange as any}
                  onSelect={(range: any) => {
                    setCustomRange(range || {});
                    if (range?.from && range?.to) { setPeriodOpen(false); setShowCustomInPeriod(false); }
                  }}
                  locale={es}
                  numberOfMonths={1}
                  className="pointer-events-auto"
                />
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Compare dropdown */}
        {compareMode ? (
          <Popover open={compareOpen} onOpenChange={(o) => { setCompareOpen(o); if (!o) setShowCustomInCompare(false); }}>
            <PopoverTrigger asChild>
              <button className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                "bg-accent/20 text-accent-foreground border-accent/40"
              )}>
                <GitCompareArrows className="h-3 w-3" />
                vs {compareLabel}
                <button
                  onClick={(e) => { e.stopPropagation(); setCompareMode(false); setCompareData(null); }}
                  className="ml-0.5 hover:bg-accent/30 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] sm:w-auto p-2 bg-popover" align="start" side="bottom" sideOffset={6} collisionPadding={16}>
              <div className="space-y-1 min-w-[180px]">
                {PRESETS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => { setComparePreset(p.key); setShowCustomInCompare(false); setCompareOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                      comparePreset === p.key && comparePreset !== "custom" ? "bg-accent/20 text-accent-foreground" : "hover:bg-muted/60 text-foreground"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => { setComparePreset("custom"); setShowCustomInCompare(true); }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                    comparePreset === "custom" ? "bg-accent/20 text-accent-foreground" : "hover:bg-muted/60 text-foreground"
                  )}
                >
                  Personalizado…
                </button>
              </div>
              {showCustomInCompare && (
                <div className="mt-2 border-t border-border/30 pt-2">
                  <Calendar
                    mode="range"
                    selected={compareCustom as any}
                    onSelect={(range: any) => {
                      setCompareCustom(range || {});
                      if (range?.from && range?.to) { setCompareOpen(false); setShowCustomInCompare(false); }
                    }}
                    locale={es}
                    numberOfMonths={1}
                    className="pointer-events-auto"
                  />
                </div>
              )}
            </PopoverContent>
          </Popover>
        ) : (
          <button
            onClick={() => setCompareMode(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-all border border-transparent"
          >
            <GitCompareArrows className="h-3 w-3" />
            Comparar
          </button>
        )}

        {/* Filter dropdown (departments + workers) */}
        {/* Filter toggle button */}
        <button
          onClick={() => setFilterOpen(prev => !prev)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
            activeFilterCount > 0
              ? "bg-primary/10 text-primary border-primary/30"
              : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
          )}
        >
          <Filter className="h-3 w-3" />
          Filtrar
          {activeFilterCount > 0 && (
            <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={cn("h-3 w-3 opacity-70 transition-transform", filterOpen && "rotate-180")} />
        </button>
      </div>

      {/* Inline filter panel */}
      {filterOpen && (
        <div className="rounded-2xl border border-border/40 bg-popover p-3 animate-fade-in">
          {departments.length > 1 && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Departamentos
              </p>
              <div className="flex flex-wrap gap-1.5">
                {departments.map(d => (
                  <button
                    key={d.id}
                    onClick={() => toggleDepartment(d.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium transition-all border",
                      selectedDepartments.includes(d.id)
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                    )}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <Users className="h-3 w-3" /> Trabajadores
            </p>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={workerSearch}
                onChange={e => setWorkerSearch(e.target.value)}
                onFocus={e => {
                  // Prevent iOS auto-scroll jump by manually scrolling the element into view
                  setTimeout(() => {
                    e.target.scrollIntoView({ behavior: "smooth", block: "center" });
                  }, 300);
                }}
                className="pl-7 h-8 text-base sm:text-xs"
              />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {filteredWorkers.map(w => (
                <button
                  key={w.id}
                  onClick={() => toggleWorker(w.id)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between",
                    selectedWorkers.includes(w.id)
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted/60"
                  )}
                >
                  <span className="truncate">{w.name}</span>
                  {selectedWorkers.includes(w.id) && <X className="h-3 w-3 shrink-0" />}
                </button>
              ))}
              {filteredWorkers.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Sin resultados</p>
              )}
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="border-t border-border/30 mt-2 pt-2">
              <button
                onClick={() => { setSelectedWorkers([]); setSelectedDepartments([]); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active filter summary chips */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {selectedDepartments.map(dId => {
            const d = departments.find(x => x.id === dId);
            return (
              <button
                key={dId}
                onClick={() => toggleDepartment(dId)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium"
              >
                <Building2 className="h-2.5 w-2.5" />
                {d?.name || "…"} <X className="h-2.5 w-2.5" />
              </button>
            );
          })}
          {selectedWorkers.map(wId => {
            const w = workers.find(x => x.id === wId);
            return (
              <button
                key={wId}
                onClick={() => toggleWorker(wId)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium"
              >
                {w?.name || "…"} <X className="h-2.5 w-2.5" />
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ DATA ═══ */}
      {loading && !data ? (
        <AnalyticsSkeleton />
      ) : data ? (
        <div className="space-y-4 animate-fade-in">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total</p>
              <p className="text-2xl font-bold mt-1">{data.totalIncidencias}</p>
              {delta && (
                <span className={cn("text-xs flex items-center gap-0.5 mt-1", delta.diff > 0 ? "text-destructive" : delta.diff < 0 ? "text-primary" : "text-muted-foreground")}>
                  {delta.diff > 0 ? <ArrowUpRight className="h-3 w-3" /> : delta.diff < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                  {delta.pct !== null ? `${Math.abs(delta.pct)}%` : `${Math.abs(delta.diff)}`}
                </span>
              )}
            </div>
            <div className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Media diaria</p>
              <p className="text-2xl font-bold mt-1">{data.mediaDiaria}</p>
            </div>
            <div className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Gravedad dominante</p>
              {data.totalIncidencias === 0 ? (
                <p className="text-lg font-semibold mt-1 text-muted-foreground">—</p>
              ) : (
                <p className="text-lg font-semibold mt-1 capitalize" style={{ color: SEVERITY_COLORS[data.gravedadDominante as keyof typeof SEVERITY_COLORS] || SEVERITY_COLORS.leve }}>
                  {data.gravedadDominante === "muy_grave" ? "Muy grave" : data.gravedadDominante === "grave" ? "Grave" : "Leve"}
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Trabajadores</p>
              <p className="text-2xl font-bold mt-1">{data.ranking.length}</p>
            </div>
          </div>

          {/* Trend chart */}
          <div className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold mb-3">Tendencia temporal</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.timeSeries}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#93d600" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#93d600" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="date" tickFormatter={v => { try { return format(new Date(v), "dd/MM"); } catch { return v; } }} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" allowDecimals={false} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="count" name="Incidencias" stroke="#93d600" fill="url(#colorCount)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {compareMode && compareData && (
              <div className="h-48 mt-2">
                <p className="text-[10px] text-muted-foreground mb-1">Periodo de comparación</p>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={compareData.timeSeries}>
                    <defs>
                      <linearGradient id="colorCompare" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                    <XAxis dataKey="date" tickFormatter={v => { try { return format(new Date(v), "dd/MM"); } catch { return v; } }} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" allowDecimals={false} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="count" name="Comparación" stroke="#818cf8" fill="url(#colorCompare)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Gravity donut */}
          <div className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold mb-3">Desglose por gravedad</p>
            <div className="flex items-center justify-center">
              <div className="h-40 w-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Leves", value: data.gravedad.leve },
                        { name: "Graves", value: data.gravedad.grave },
                        { name: "Muy graves", value: data.gravedad.muy_grave },
                      ]}
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={0}
                      dataKey="value"
                      stroke="none"
                    >
                      <Cell fill={SEVERITY_COLORS.leve} />
                      <Cell fill={SEVERITY_COLORS.grave} />
                      <Cell fill={SEVERITY_COLORS.muy_grave} />
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 ml-4">
                {[
                  { label: "Leves", val: data.gravedad.leve, color: SEVERITY_COLORS.leve },
                  { label: "Graves", val: data.gravedad.grave, color: SEVERITY_COLORS.grave },
                  { label: "Muy graves", val: data.gravedad.muy_grave, color: SEVERITY_COLORS.muy_grave },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2 text-xs">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-semibold">{s.val}</span>
                    <span className="text-muted-foreground">
                      ({data.totalIncidencias > 0 ? Math.round((s.val / data.totalIncidencias) * 100) : 0}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Worker ranking */}
          {data.ranking.length > 0 && (
            <div className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
              <p className="text-xs font-semibold mb-3">Ranking de trabajadores</p>
              <div className="space-y-2">
                {data.ranking.map((w) => {
                  const compareWorker = compareData?.ranking.find(cw => cw.worker_id === w.worker_id);
                  const workerDelta = compareWorker ? w.count - compareWorker.count : null;
                  return (
                    <button
                      key={w.worker_id}
                      onClick={() => toggleWorker(w.worker_id)}
                      className="w-full flex items-center gap-3 group"
                    >
                      <div className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {w.worker_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium truncate">{w.worker_name}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold">{w.count}</span>
                            {workerDelta !== null && workerDelta !== 0 && (
                              <span className={cn("text-[10px] flex items-center", workerDelta > 0 ? "text-destructive" : "text-primary")}>
                                {workerDelta > 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                                {Math.abs(workerDelta)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${(w.count / maxRanking) * 100}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Day distribution */}
          <div className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold mb-3">Distribución por día</p>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={DAY_LABELS.map((d, i) => ({ day: d, count: data.dayDistribution[i] || 0 }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" allowDecimals={false} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Incidencias" fill="#93d600" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top categories */}
          {data.topCategories.length > 0 && (
            <div className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
              <p className="text-xs font-semibold mb-3">Top categorías</p>
              <div className="space-y-2.5">
                {data.topCategories.map(cat => (
                  <div key={cat.id}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs truncate">{cat.name}</span>
                      <span className="text-xs text-muted-foreground">{cat.count} ({cat.pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${cat.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ AI ANALYSIS ═══ */}
          <div className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Análisis IA
              </p>
              <button
                onClick={runAiAnalysis}
                disabled={aiLoading}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                  aiLoading
                    ? "bg-muted text-muted-foreground cursor-wait"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                )}
              >
                <Sparkles className="h-3 w-3" />
                {aiLoading ? "Analizando…" : aiAnalysis ? "Regenerar" : "Analizar"}
              </button>
            </div>

            {aiLoading && (
              <div className="space-y-3 animate-pulse">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            )}

            {!aiLoading && aiAnalysis && (
              <div className="space-y-4 animate-fade-in">
                {/* Summary + alert level */}
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertBadge level={aiAnalysis.nivel_alerta} />
                      <span className="text-[10px] text-muted-foreground capitalize">Tendencia: {aiAnalysis.tendencia}</span>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">{aiAnalysis.resumen}</p>
                  </div>
                </div>

                {/* Proactive alerts */}
                {aiAnalysis.alertas_proactivas?.length > 0 && (
                  <div className="rounded-xl bg-orange-500/5 border border-orange-500/15 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 mb-2 flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" /> Alertas proactivas
                    </p>
                    <ul className="space-y-1.5">
                      {aiAnalysis.alertas_proactivas.map((a, i) => (
                        <li key={i} className="text-xs text-foreground flex items-start gap-2">
                          <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0 mt-0.5" />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Preventive actions */}
                {aiAnalysis.acciones_preventivas?.length > 0 && (
                  <div className="rounded-xl bg-primary/5 border border-primary/15 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-2 flex items-center gap-1">
                      <Lightbulb className="h-3 w-3" /> Acciones preventivas
                    </p>
                    <ul className="space-y-1.5">
                      {aiAnalysis.acciones_preventivas.map((a, i) => (
                        <li key={i} className="text-xs text-foreground flex items-start gap-2">
                          <span className="text-primary shrink-0 mt-0.5">→</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {!aiLoading && !aiAnalysis && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Pulsa "Analizar" para obtener un resumen inteligente del periodo actual
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Sin datos para este periodo
        </div>
      )}
    </div>
  );
}
