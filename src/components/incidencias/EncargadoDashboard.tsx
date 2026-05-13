import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Clock, RefreshCw, Inbox, ShieldAlert, TrendingUp, TrendingDown, Trophy, Medal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export interface DashboardStats {
  todayCount: number;
  weekCount: number;
  reincidentesCount: number;
  byGravedad: { leve: number; grave: number; muy_grave: number };
  byTipo: { solo_incidencia: number; amonestacion_escrita: number; sancion: number };
  byCategoria: Array<{ name: string; color: string; count: number }>;
  topReincidentes: Array<{ worker_name: string; worker_id: string; count: number }>;
}

interface Props {
  sessionToken: string;
  departmentIds?: string[];
  workerTeamIds?: string[];
  onStatsLoaded?: (todayCount: number) => void;
  refreshKey?: number;
}

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 26 } },
};
const sectionVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 24, delay: 0.1 } },
};

const TIPO_COLORS = {
  solo_incidencia: "hsl(var(--primary))",
  amonestacion_escrita: "#f59e0b",
  sancion: "#ef4444",
};
const TIPO_LABELS: Record<string, string> = {
  solo_incidencia: "Solo registro",
  amonestacion_escrita: "Amonestación",
  sancion: "Sanción",
};

export function EncargadoKPICards({ sessionToken, departmentIds, workerTeamIds, onStatsLoaded, refreshKey }: Props) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [riesgoMedio, setRiesgoMedio] = useState(0);
  const [tendencia7d, setTendencia7d] = useState<number | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const [dashRes, deptStatsRes] = await Promise.all([
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "getDashboardStats", sessionToken, departmentIds, ...(workerTeamIds ? { workerTeamIds } : {}) },
        }),
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "getDepartmentStats", sessionToken },
        }),
      ]);

      if (dashRes.data?.success) {
        const d = dashRes.data;
        const s: DashboardStats = {
          todayCount: d.todayCount || 0,
          weekCount: d.weekCount || 0,
          reincidentesCount: d.reincidentesCount || 0,
          byGravedad: d.byGravedad || { leve: 0, grave: 0, muy_grave: 0 },
          byTipo: d.byTipo || { solo_incidencia: 0, amonestacion_escrita: 0, sancion: 0 },
          byCategoria: d.byCategoria || [],
          topReincidentes: d.topReincidentes || [],
        };
        setStats(s);
        onStatsLoaded?.(s.todayCount);

        const prev7d = d.prevWeekCount ?? null;
        if (prev7d !== null && prev7d !== undefined) {
          const diff = s.weekCount - prev7d;
          setTendencia7d(prev7d > 0 ? Math.round((diff / prev7d) * 100) : (diff > 0 ? 100 : 0));
        }
      }

      if (deptStatsRes.data?.success) {
        const dStats = deptStatsRes.data.stats || [];
        if (dStats.length > 0) {
          const avg = Math.round(dStats.reduce((s: number, d: any) => s + (d.riesgo_global || 0), 0) / dStats.length);
          setRiesgoMedio(avg);
        }
      }
    } catch (e) {
      console.error("Failed to load dashboard:", e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, onStatsLoaded]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { if (refreshKey && refreshKey > 0) { setLoading(true); loadStats(); } }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime with debounce
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadStats(), 2000);
    };
    const channel = supabase
      .channel('encargado-kpi-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias_records' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias_worker_stats' }, debouncedLoad)
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [loadStats]);

  const riskColor = (score: number) => score >= 70 ? 'text-red-500' : score >= 40 ? 'text-yellow-500' : 'text-green-500';

  if (loading && !stats) {
    return (
      <div className="flex flex-col gap-4">
        {/* KPI skeleton cards — staggered */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm animate-pulse content-loaded-item"
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'forwards' }}
            >
              <div className="h-5 w-5 rounded-lg bg-muted/60 mb-3" />
              <div className="h-8 w-14 rounded-lg bg-muted/60 mb-2" />
              <div className="h-3 w-20 rounded-md bg-muted/40" />
            </div>
          ))}
        </div>
        {/* Charts skeleton — staggered after KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm animate-pulse content-loaded-item"
              style={{ animationDelay: `${500 + i * 120}ms`, animationFillMode: 'forwards' }}
            >
              <div className="h-3 w-24 rounded-md bg-muted/60 mb-4" />
              <div className="h-[120px] w-full rounded-xl bg-muted/30" />
            </div>
          ))}
        </div>
        {/* Ranking skeleton */}
        <div
          className="rounded-2xl border border-border/30 bg-card p-4 shadow-sm animate-pulse content-loaded-item"
          style={{ animationDelay: '750ms', animationFillMode: 'forwards' }}
        >
          <div className="h-3 w-36 rounded-md bg-muted/60 mb-4" />
          {[0, 1, 2, 3].map((j) => (
            <div key={j} className="flex items-center gap-3 mb-3" style={{ opacity: 1 - j * 0.15 }}>
              <div className="h-5 w-5 rounded-full bg-muted/50" />
              <div className="h-7 w-7 rounded-full bg-muted/40" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-28 rounded-md bg-muted/50" />
                <div className="h-1.5 w-full rounded-full bg-muted/30" />
              </div>
              <div className="h-5 w-8 rounded-full bg-muted/40" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const kpiCards = [
    { icon: <AlertTriangle className="h-5 w-5 text-primary" />, value: stats?.todayCount ?? 0, label: "Hoy" },
    { icon: <Clock className="h-5 w-5 text-primary" />, value: stats?.weekCount ?? 0, label: "Esta semana" },
    {
      icon: <Inbox className="h-5 w-5 text-yellow-500" />, value: null, label: "Gravedad",
      custom: (
        <div className="flex gap-1.5 mt-0.5">
          <Badge className="text-[10px] px-1.5 py-0 border-0" style={{ backgroundColor: '#93d60020', color: '#93d600' }}>{stats?.byGravedad.leve || 0}</Badge>
          <Badge className="text-[10px] px-1.5 py-0 border-0" style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}>{stats?.byGravedad.grave || 0}</Badge>
          <Badge className="text-[10px] px-1.5 py-0 border-0" style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>{stats?.byGravedad.muy_grave || 0}</Badge>
        </div>
      ),
    },
    { icon: <RefreshCw className="h-5 w-5 text-orange-500" />, value: stats?.reincidentesCount ?? 0, label: "Reincidentes" },
    { icon: <ShieldAlert className={`h-5 w-5 ${riskColor(riesgoMedio)}`} />, value: riesgoMedio, label: "Riesgo medio", valueClass: riskColor(riesgoMedio) },
    {
      icon: tendencia7d !== null && tendencia7d > 0 ? <TrendingUp className="h-5 w-5 text-red-500" /> : <TrendingDown className="h-5 w-5 text-green-500" />,
      value: null, label: "Tendencia 7d",
      custom: (
        <p className={`text-3xl font-bold ${tendencia7d !== null && tendencia7d > 0 ? 'text-red-500' : 'text-green-500'}`}>
          {tendencia7d !== null ? `${tendencia7d > 0 ? '+' : ''}${tendencia7d}%` : '—'}
        </p>
      ),
    },
  ];

  // Pie data for tipo distribution
  const tipoData = stats?.byTipo
    ? Object.entries(stats.byTipo)
        .filter(([, v]) => v > 0)
        .map(([key, value]) => ({ name: TIPO_LABELS[key] || key, value, fill: TIPO_COLORS[key as keyof typeof TIPO_COLORS] || '#888' }))
    : [];
  const tipoTotal = tipoData.reduce((s, d) => s + d.value, 0);

  // Worker ranking
  const workerRanking = stats?.topReincidentes?.slice(0, 10) || [];
  const maxWorkerCount = workerRanking[0]?.count || 1;

  const medalColors = ['#f59e0b', '#94a3b8', '#cd7f32'];

  return (
    <div className="flex flex-col gap-4">
      {/* KPI cards */}
      <AnimatePresence>
        <motion.div className="grid grid-cols-2 md:grid-cols-3 gap-3" variants={gridVariants} initial="hidden" animate="show">
          {kpiCards.map((card, i) => (
            <motion.div key={i} variants={cardVariants}>
              <Card className="rounded-2xl border-border/30 shadow-sm h-full">
                <CardContent className="p-4 flex flex-col gap-1">
                  {card.icon}
                  {card.custom
                    ? card.custom
                    : <p className={`text-3xl font-bold ${card.valueClass || 'text-foreground'}`}>{card.value}</p>
                  }
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Distribución por tipo — Donut */}
        {tipoTotal > 0 && (
          <motion.div variants={sectionVariants} initial="hidden" animate="show">
            <Card className="rounded-2xl border-border/30">
              <CardContent className="p-4">
                <h3 className="text-xs font-medium text-muted-foreground mb-3">Distribución por tipo</h3>
                <div className="flex items-center gap-4">
                  <div className="w-[120px] h-[120px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={tipoData} dataKey="value" innerRadius={30} outerRadius={55} paddingAngle={3} strokeWidth={0}>
                          {tipoData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0];
                            return (
                              <div className="bg-popover border border-border rounded-lg px-2.5 py-1.5 text-xs shadow-lg">
                                <p className="font-medium">{d.name}</p>
                                <p className="text-muted-foreground">{d.value}</p>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-2">
                    {tipoData.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
                        <span className="text-xs text-muted-foreground">{d.name}</span>
                        <span className="text-xs font-bold ml-auto">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Distribución por categorías — Barras horizontales */}
        {stats?.byCategoria && stats.byCategoria.length > 0 && (
          <motion.div variants={sectionVariants} initial="hidden" animate="show">
            <Card className="rounded-2xl border-border/30">
              <CardContent className="p-4">
                <h3 className="text-xs font-medium text-muted-foreground mb-3">Top categorías</h3>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.byCategoria} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={90}
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-popover border border-border rounded-lg px-2.5 py-1.5 text-xs shadow-lg">
                              <p className="font-medium">{d.name}</p>
                              <p className="text-muted-foreground">{d.count} incidencias</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={14}>
                        {stats.byCategoria.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Ranking de trabajadores */}
      {workerRanking.length > 0 && (
        <motion.div variants={sectionVariants} initial="hidden" animate="show">
          <Card className="rounded-2xl border-border/30">
            <CardContent className="p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" /> Ranking de incidencias por trabajador
              </h3>
              <div className="space-y-2">
                {workerRanking.map((w, i) => (
                  <motion.div
                    key={w.worker_id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 + 0.1, type: "spring", stiffness: 300, damping: 26 }}
                    className="flex items-center gap-3"
                  >
                    {/* Position */}
                    <div className="w-6 text-center shrink-0">
                      {i < 3 ? (
                        <Medal className="h-4 w-4 mx-auto" style={{ color: medalColors[i] }} />
                      ) : (
                        <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                      )}
                    </div>
                    {/* Avatar */}
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-primary">{w.worker_name.charAt(0)}</span>
                    </div>
                    {/* Name + bar */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate mb-0.5">{w.worker_name}</p>
                      <Progress value={(w.count / maxWorkerCount) * 100} className="h-1.5" />
                    </div>
                    {/* Count */}
                    <Badge variant="secondary" className="text-[10px] shrink-0 px-1.5 py-0">{w.count}</Badge>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
