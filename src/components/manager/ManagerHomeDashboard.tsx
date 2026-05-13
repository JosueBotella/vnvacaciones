import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { calculateTrialPeriod } from "@/lib/trialPeriod";
import {
  Users, FileText, AlertTriangle, Timer, Calendar,
  ChevronRight, Clock, Briefcase, TrendingDown, TrendingUp,
  UserCheck, Palmtree, Moon, Plus
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  ResponsiveContainer, Tooltip, CartesianGrid
} from "recharts";


interface WorkerBasic {
  id: string;
  name: string;
  worker_number: string;
  department_id: string;
  is_on_leave?: boolean;
  start_contract_date?: string | null;
  worker_team_id?: string | null;
  work_group_id?: string | null;
}

interface DepartmentBasic {
  id: string;
  name: string;
}

interface VacationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

interface IncidenciasUserContext {
  managerId: string;
  managerName: string;
  role: string;
  departmentIds: string[];
  permissions: any;
}

interface Props {
  stats: VacationStats;
  requests: any[];
  workers: WorkerBasic[];
  departments: DepartmentBasic[];
  incidenciasContext: IncidenciasUserContext | null;
  incTodayCount: number;
  incWeekCount: number;
  sessionToken: string;
  onNavigate: (tab: string) => void;
  onNewIncidencia?: () => void;
  cachedWorkforce?: WorkforceData | null;
  cachedBalances?: BalanceEntry[] | null;
  cachedIncStats?: IncStats | null;
  onWorkforceLoaded?: (data: WorkforceData) => void;
  onBalancesLoaded?: (data: BalanceEntry[]) => void;
  onIncStatsLoaded?: (data: IncStats) => void;
  parentLoading?: boolean;
  isResponsable?: boolean;
  workerTeamIds?: string[];
}

export interface WorkforceData {
  working: number;
  total: number;
  onLeave: number;
  onVacation: number;
  resting: number;
}

export interface BalanceEntry {
  worker_name: string;
  balance_hours: number;
}

export interface IncStats {
  todayCount: number;
  weekCount: number;
  byGravedad: { leve: number; grave: number; muy_grave: number };
  topReincidentes: Array<{ worker_name: string; worker_number?: string | null; count: number }>;
  byCategoria?: Array<{ name: string; color: string; count: number }>;
}

const COLORS = {
  leve: "hsl(82, 100%, 42%)",
  grave: "hsl(38, 92%, 50%)",
  muy_grave: "hsl(0, 84%, 60%)",
  pending: "hsl(var(--muted-foreground))",
  approved: "hsl(82, 100%, 42%)",
  rejected: "hsl(0, 84%, 60%)",
  positive: "hsl(82, 100%, 42%)",
  negative: "hsl(0, 84%, 60%)",
};

// Simple number display — no animation to avoid jank
function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  return <>{value}{suffix}</>;
}

function SectionSkeleton({ h = "h-48" }: { h?: string }) {
  return <Skeleton className={`w-full ${h} rounded-2xl`} />;
}

function HomeDashboardSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Nueva incidencia button skeleton (mobile) */}
      <Skeleton className="h-11 w-full rounded-xl md:hidden" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="border-border/30 rounded-2xl">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-3.5 w-3.5 rounded" />
              </div>
              <Skeleton className="h-9 w-16" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16 mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Charts row skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border/30 rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-7 w-12" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-2 h-2 rounded-full" />
                  <Skeleton className="h-3 w-20 flex-1" />
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-1.5 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/30 rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-7 w-12" />
            </div>
            <Skeleton className="h-32 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
      {/* Balance skeleton */}
      <Card className="border-border/30 rounded-2xl">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-7 w-12" />
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </CardContent>
      </Card>
      {/* Quick actions skeleton */}
      <Card className="border-border/30 rounded-2xl">
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ManagerHomeDashboard({
  stats, requests, workers, departments,
  incidenciasContext, incTodayCount, incWeekCount,
  sessionToken, onNavigate, onNewIncidencia,
  cachedWorkforce, cachedBalances, cachedIncStats,
  onWorkforceLoaded, onBalancesLoaded, onIncStatsLoaded,
  parentLoading, isResponsable, workerTeamIds,
}: Props) {
  const [workforce, setWorkforce] = useState<WorkforceData | null>(cachedWorkforce || null);
  const [balances, setBalances] = useState<BalanceEntry[] | null>(cachedBalances || null);
  const [incStats, setIncStats] = useState<IncStats | null>(cachedIncStats || null);
  const [loadingWorkforce, setLoadingWorkforce] = useState(!cachedWorkforce);
  const [loadingBalances, setLoadingBalances] = useState(!cachedBalances);
  const [loadingIncStats, setLoadingIncStats] = useState(!cachedIncStats);

  // Invalidate caches when workerTeamIds change (responsable scope resolved)
  const workerTeamKey = workerTeamIds?.join(",") ?? "";
  useEffect(() => {
    // If workerTeamIds changed and we have stale cached data, refetch
    if (cachedWorkforce) { setWorkforce(null); setLoadingWorkforce(true); }
    if (cachedBalances) { setBalances(null); setLoadingBalances(true); }
    if (cachedIncStats) { setIncStats(null); setLoadingIncStats(!!incidenciasContext); }
    onWorkforceLoaded?.(null as any);
    onBalancesLoaded?.(null as any);
    onIncStatsLoaded?.(null as any);
  }, [workerTeamKey]);

  useEffect(() => {
    if (!incidenciasContext) {
      setLoadingIncStats(false);
      return;
    }

    if (!incStats) {
      setLoadingIncStats(true);
    }
  }, [incidenciasContext, incStats]);

  // Fetch workforce
  useEffect(() => {
    if (workforce) return; // already loaded for current scope
    const deptIds = departments.map(d => d.id);
    if (deptIds.length === 0) { setLoadingWorkforce(false); return; }
    // For responsable, don't fetch until workerTeamIds are resolved
    if (isResponsable && !workerTeamIds) { return; }
    const fetch = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const { data } = await supabase.functions.invoke("admin-operations", {
          body: { action: "getWorkforceForDay", sessionToken, data: { date: today, departmentIds: deptIds, ...(workerTeamIds ? { workerTeamIds } : {}) } },
        });
        if (data?.success) {
          const wf: WorkforceData = {
            working: data.working ?? 0,
            total: data.total ?? workers.length,
            onLeave: data.onLeave ?? 0,
            onVacation: data.onVacation ?? 0,
            resting: data.resting ?? 0,
          };
          setWorkforce(wf);
          onWorkforceLoaded?.(wf);
        }
      } catch {} finally { setLoadingWorkforce(false); }
    };
    fetch();
  }, [sessionToken, departments, workerTeamIds, workforce, isResponsable]);

  // Fetch balances
  useEffect(() => {
    if (balances) return; // already loaded for current scope
    const deptIds = departments.map(d => d.id);
    if (deptIds.length === 0) { setLoadingBalances(false); return; }
    if (isResponsable && !workerTeamIds) { return; }
    const fetch = async () => {
      try {
        const { data } = await supabase.functions.invoke("hour-balance-operations", {
          body: { action: "getManagerBalances", sessionToken, departmentIds: deptIds, ...(workerTeamIds ? { workerTeamIds } : {}) },
        });
        const balancesList = data?.success ? (data.balances || data.data) : null;
        if (balancesList && Array.isArray(balancesList)) {
          const b: BalanceEntry[] = balancesList.map((b: any) => ({
            worker_name: b.worker_name || b.name || "?",
            balance_hours: b.balance_hours ?? 0,
          }));
          setBalances(b);
          onBalancesLoaded?.(b);
        }
      } catch {} finally { setLoadingBalances(false); }
    };
    fetch();
  }, [sessionToken, departments, workerTeamIds, balances, isResponsable]);

  // Fetch inc stats
  useEffect(() => {
    if (incStats || !incidenciasContext) return;
    if (isResponsable && !workerTeamIds) { return; }
    const fetch = async () => {
      try {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: {
            action: "getDashboardStats",
            sessionToken,
            departmentIds: incidenciasContext.departmentIds,
            ...(workerTeamIds ? { workerTeamIds } : {}),
          },
        });
        if (data?.success) {
          const s: IncStats = {
            todayCount: data.todayCount || 0,
            weekCount: data.weekCount || 0,
            byGravedad: data.byGravedad || { leve: 0, grave: 0, muy_grave: 0 },
            topReincidentes: data.topReincidentes || [],
            byCategoria: data.byCategoria || [],
          };
          setIncStats(s);
          onIncStatsLoaded?.(s);
        }
      } catch {} finally { setLoadingIncStats(false); }
    };
    fetch();
  }, [sessionToken, incidenciasContext, workerTeamIds, incStats, isResponsable]);

  // Trial periods
  const trialWorkers = workers
    .filter(w => w.start_contract_date)
    .map(w => {
      const trial = calculateTrialPeriod(w.start_contract_date!);
      return { ...w, trial };
    })
    .filter(w => w.trial && w.trial.isInTrialPeriod)
    .sort((a, b) => (a.trial?.daysRemaining ?? 99) - (b.trial?.daysRemaining ?? 99))
    .slice(0, 5);

  // Top balances for chart
  const topBalances = balances
    ? [...balances]
        .filter(b => b.balance_hours !== 0)
        .sort((a, b) => a.balance_hours - b.balance_hours)
        .slice(0, 3)
        .concat(
          [...balances]
            .filter(b => b.balance_hours > 0)
            .sort((a, b) => b.balance_hours - a.balance_hours)
            .slice(0, 3)
        )
        .filter((v, i, arr) => arr.findIndex(x => x.worker_name === v.worker_name) === i)
        .sort((a, b) => a.balance_hours - b.balance_hours)
    : [];

  // Vacation chart data
  const vacChartData = [
    { name: "Pendientes", value: stats.pending, color: COLORS.pending },
    { name: "Aprobadas", value: stats.approved, color: COLORS.approved },
    { name: "Rechazadas", value: stats.rejected, color: COLORS.rejected },
  ].filter(d => d.value > 0);

  // Incidencias pie data
  const incPieData = incStats ? [
    { name: "Leve", value: incStats.byGravedad.leve, color: COLORS.leve },
    { name: "Grave", value: incStats.byGravedad.grave, color: COLORS.grave },
    { name: "Muy grave", value: incStats.byGravedad.muy_grave, color: COLORS.muy_grave },
  ].filter(d => d.value > 0) : [];

  const totalInc = incPieData.reduce((a, d) => a + d.value, 0);
  const shouldShowIncidenciasSkeleton = Boolean(
    incidenciasContext && (loadingIncStats || !incStats)
  );

  // Show full skeleton while parent data is loading
  if (parentLoading) {
    return <HomeDashboardSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* ── KPI Row ── */}
      <div className={`grid gap-3 animate-fade-in-up opacity-0 ${isResponsable ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'}`} style={{ animationDelay: '50ms', animationFillMode: 'forwards' }}>
        {/* Incidencias — first for responsable */}
        {isResponsable && incidenciasContext && (
          <div>
          <button onClick={() => onNavigate("incidencias")} className="w-full text-left">
            <Card className="border-border/30 hover:border-border/60 transition-colors rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold tracking-tight text-foreground"><AnimatedNumber value={incTodayCount} /></p>
                <p className="text-xs text-muted-foreground mt-1">Incidencias hoy</p>
                <p className="text-[10px] text-muted-foreground mt-1">{incWeekCount} esta semana</p>
              </CardContent>
            </Card>
          </button>
          </div>
        )}

        {/* Workers / Equipo */}
        <div>
        <button onClick={() => onNavigate("groups")} className="w-full text-left">
          <Card className="border-border/30 hover:border-border/60 transition-colors rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Users className="h-4 w-4 text-primary" />
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold tracking-tight text-foreground"><AnimatedNumber value={workers.length} /></p>
              <p className="text-xs text-muted-foreground mt-1">{isResponsable ? 'Mi equipo' : 'Trabajadores'}</p>
              {!isResponsable && <p className="text-[10px] text-muted-foreground mt-1">{departments.length} departamento{departments.length !== 1 ? "s" : ""}</p>}
            </CardContent>
          </Card>
        </button>
        </div>

        {/* Workforce */}
        <div>
        <button onClick={() => onNavigate(isResponsable ? "groups" : "plantilla")} className="w-full text-left">
          <Card className="border-border/30 hover:border-border/60 transition-colors rounded-2xl">
            <CardContent className="p-4">
              {loadingWorkforce ? <Skeleton className="h-16 w-full" /> : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-3xl font-bold tracking-tight text-foreground">
                    <AnimatedNumber value={workforce?.working ?? 0} /><span className="text-lg text-muted-foreground font-normal">/{workforce?.total ?? workers.length}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Trabajan hoy</p>
                  <div className="flex gap-2 mt-2">
                    {(workforce?.onVacation ?? 0) > 0 && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Palmtree className="h-3 w-3" /> {workforce!.onVacation} vacac.
                      </span>
                    )}
                    {(workforce?.resting ?? 0) > 0 && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Moon className="h-3 w-3" /> {workforce!.resting} desc.
                      </span>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </button>
        </div>

        {/* Vacations — only for non-responsable */}
        {!isResponsable && (
          <div>
          <button onClick={() => onNavigate("vacaciones")} className="w-full text-left">
            <Card className="border-border/30 hover:border-border/60 transition-colors rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold tracking-tight text-foreground"><AnimatedNumber value={stats.pending} /></p>
                <p className="text-xs text-muted-foreground mt-1">Solicitudes pendientes</p>
                <p className="text-[10px] text-muted-foreground mt-1">{stats.total} total · {stats.approved} aprobadas</p>
              </CardContent>
            </Card>
          </button>
          </div>
        )}

        {/* Incidencias — for non-responsable */}
        {!isResponsable && incidenciasContext && (
          <div>
          <button onClick={() => onNavigate("incidencias")} className="w-full text-left">
            <Card className="border-border/30 hover:border-border/60 transition-colors rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold tracking-tight text-foreground"><AnimatedNumber value={incTodayCount} /></p>
                <p className="text-xs text-muted-foreground mt-1">Incidencias hoy</p>
                <p className="text-[10px] text-muted-foreground mt-1">{incWeekCount} esta semana</p>
              </CardContent>
            </Card>
          </button>
          </div>
        )}
      </div>

      {/* ── Charts Row ── */}
      {shouldShowIncidenciasSkeleton ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in-up opacity-0" style={{ animationDelay: '150ms', animationFillMode: 'forwards' }}>
          {[1, 2, 3].map(i => (
            <Card key={i} className="border-border/30 rounded-2xl">
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : incidenciasContext && (incStats?.topReincidentes?.length || 0) > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in-up opacity-0" style={{ animationDelay: '150ms', animationFillMode: 'forwards' }}>
          {/* Top reincidentes */}
          <div>
            <Card className="border-border/30 rounded-2xl h-full">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Top reincidentes</h3>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => onNavigate("incidencias")}>Ver →</Button>
                </div>
                <div className="space-y-2">
                  {(() => {
                    const ranking = incStats!.topReincidentes.slice(0, 7);
                    const maxCount = ranking[0]?.count || 1;
                    return ranking.map((w, i) => {
                      const salixUrl = w.worker_number ? `https://salix.verdnatura.es/#/worker/${w.worker_number}/summary` : null;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-muted-foreground w-4 text-center shrink-0">{i + 1}</span>
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-primary">{w.worker_name.charAt(0)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            {salixUrl ? (
                              <a href={salixUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium truncate block text-primary hover:underline">{w.worker_name}</a>
                            ) : (
                              <p className="text-[11px] font-medium truncate">{w.worker_name}</p>
                            )}
                            <Progress value={(w.count / maxCount) * 100} className="h-1 mt-0.5" />
                          </div>
                          <Badge variant="secondary" className="text-[10px] shrink-0 px-1.5 py-0">{w.count}</Badge>
                        </div>
                      );
                    });
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gravedad donut */}
          <div>
            <Card className="border-border/30 rounded-2xl h-full">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Por gravedad</h3>
                {loadingIncStats ? <Skeleton className="h-40 w-full" /> : totalInc === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Sin datos</p>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-32 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={incPieData} dataKey="value" cx="50%" cy="50%" innerRadius={28} outerRadius={55} strokeWidth={0} paddingAngle={2}>
                            {incPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip
                            contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: "12px", padding: "8px 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
                            labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600, marginBottom: 2 }}
                            itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full space-y-1.5">
                      {incPieData.map(d => (
                        <div key={d.name} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="text-xs text-muted-foreground flex-1">{d.name}</span>
                          <span className="text-xs font-semibold text-foreground tabular-nums">{d.value}</span>
                        </div>
                      ))}
                      <div className="pt-1 border-t border-border/30">
                        <span className="text-[11px] text-muted-foreground">Total: <span className="font-semibold text-foreground">{totalInc}</span></span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Categorías donut */}
          <div>
            <Card className="border-border/30 rounded-2xl h-full">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Por categoría</h3>
                {loadingIncStats || !incStats?.byCategoria || incStats.byCategoria.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Sin datos</p>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-32 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={incStats.byCategoria.slice(0, 6)}
                            dataKey="count"
                            nameKey="name"
                            cx="50%" cy="50%"
                            innerRadius={28} outerRadius={55}
                            strokeWidth={0}
                            paddingAngle={2}
                          >
                            {incStats.byCategoria.slice(0, 6).map((cat, i) => (
                              <Cell key={i} fill={cat.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0].payload;
                              return (
                                <div className="bg-popover border border-border rounded-lg px-2.5 py-1.5 text-xs shadow-lg">
                                  <p className="font-medium">{d.name}</p>
                                  <p className="text-muted-foreground">{d.count}</p>
                                </div>
                              );
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full space-y-1.5">
                      {incStats.byCategoria.slice(0, 6).map((cat, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="text-xs text-muted-foreground flex-1 truncate">{cat.name}</span>
                          <span className="text-xs font-semibold text-foreground tabular-nums">{cat.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : !isResponsable ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up opacity-0" style={{ animationDelay: '150ms', animationFillMode: 'forwards' }}>
          <div>
            <Card className="border-border/30 rounded-2xl">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground">Solicitudes de vacaciones</h3>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => onNavigate("vacaciones")}>Ver →</Button>
                </div>
                {stats.total === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin solicitudes</p>
                ) : (
                  <div className="space-y-3">
                    {vacChartData.map(d => (
                      <div key={d.name} className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-xs text-muted-foreground flex-1">{d.name}</span>
                        <span className="text-sm font-semibold text-foreground tabular-nums">{d.value}</span>
                        <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${(d.value / stats.total) * 100}%`, backgroundColor: d.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          {incidenciasContext && (
            <div>
              <Card className="border-border/30 rounded-2xl">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-foreground">Incidencias por gravedad</h3>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => onNavigate("incidencias")}>Ver →</Button>
                  </div>
                  {loadingIncStats ? <Skeleton className="h-40 w-full" /> : totalInc === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Sin incidencias registradas</p>
                  ) : (
                    <div className="flex items-center gap-6">
                      <div className="w-32 h-32 flex-shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={incPieData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={55} strokeWidth={0} paddingAngle={2}>
                              {incPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2 flex-1">
                        {incPieData.map(d => (
                          <div key={d.name} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                            <span className="text-xs text-muted-foreground flex-1">{d.name}</span>
                            <span className="text-sm font-semibold text-foreground tabular-nums">{d.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Balance Chart ── */}
      <div className="animate-fade-in-up opacity-0" style={{ animationDelay: '250ms', animationFillMode: 'forwards' }}>
        <Card className="border-border/30 rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Balance de horas</h3>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => onNavigate("balance")}>Ver →</Button>
            </div>
            {loadingBalances ? <Skeleton className="h-48 w-full" /> : topBalances.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos de balance</p>
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topBalances} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis
                      type="category" dataKey="worker_name" width={100} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 14) + "…" : v}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: "12px", padding: "8px 12px" }}
                      labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600, marginBottom: 2 }}
                      itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                      formatter={(v: number) => [`${v > 0 ? "+" : ""}${v}h`, "Balance"]}
                      labelFormatter={(label: string) => label}
                    />
                    <Bar dataKey="balance_hours" radius={[0, 4, 4, 0]}>
                      {topBalances.map((entry, i) => (
                        <Cell key={i} fill={entry.balance_hours >= 0 ? COLORS.positive : COLORS.negative} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Trial Periods — always show ── */}
      <div className="animate-fade-in-up opacity-0" style={{ animationDelay: '350ms', animationFillMode: 'forwards' }}>
        <Card className="border-border/30 rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" />
                Periodos de prueba
              </h3>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => onNavigate("trial-periods")}>Ver →</Button>
            </div>
            {trialWorkers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin trabajadores en periodo de prueba</p>
            ) : (
              <div className="space-y-3">
                {trialWorkers.map(w => {
                  const pct = w.trial ? ((30 - w.trial.daysRemaining) / 30) * 100 : 0;
                  const isCritical = w.trial?.isCritical;
                  return (
                    <div key={w.id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">{w.name}</span>
                        <span className={`text-[10px] font-semibold tabular-nums ${isCritical ? "text-destructive" : "text-muted-foreground"}`}>
                          {w.trial?.daysRemaining}d restantes
                        </span>
                      </div>
                      <Progress value={pct} className={`h-1.5 ${isCritical ? "[&>div]:bg-destructive" : ""}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
