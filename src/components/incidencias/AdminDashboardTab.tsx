import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Building2, RefreshCw, Clock, Trophy, Tag, ShieldAlert, FileCheck, BarChart3, TrendingUp, Users, Zap, Brain, Loader2, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, RadialBarChart, RadialBar, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { analizarPatrones, type PatternAnalysis } from "@/modules/control-incidencias/ia";
import { toast } from "sonner";

interface DashboardData {
  totalCount: number;
  todayCount: number;
  weekCount: number;
  activeDepartments: number;
  reincidentesCount: number;
  topCategory: string;
  byGravedad: { leve: number; grave: number; muy_grave: number };
  lastRecords: any[];
  propuestasPendientes: number;
  aiProcessedCount: number;
  propuestasStats: { pendientes: number; aprobadas: number; enviadas: number; rechazadas: number };
  topReincidentes: Array<{ worker_name: string; worker_id: string; worker_number?: string | null; count: number; riesgo: number }>;
  weeklyTrend: Array<{ week: string; count: number }>;
  dayDistribution: number[];
  diaPico: number;
  tendencia: string;
  deptStats: Array<Record<string, unknown>>;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-xl text-xs px-3 py-2 shadow-lg">
      {label && <p className="font-medium mb-0.5">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-muted-foreground">
          {p.name}: <span className="font-semibold text-popover-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-xl text-xs px-3 py-2 shadow-lg">
      <p className="font-medium">{d.name}</p>
      <p className="text-muted-foreground">{d.value} incidencias</p>
    </div>
  );
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

interface AdminDashboardTabProps {
  onNavigate?: (tab: string, filter?: string) => void;
}

export function AdminDashboardTab({ onNavigate }: AdminDashboardTabProps = {}) {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [patternAnalysis, setPatternAnalysis] = useState<PatternAnalysis | null>(null);
  const [analyzingPatterns, setAnalyzingPatterns] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: res } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getDashboardStats", sessionToken },
      });
      if (res?.success) {
        setData({
          totalCount: res.totalCount || 0,
          todayCount: res.todayCount || 0,
          weekCount: res.weekCount || 0,
          activeDepartments: res.activeDepartments || 0,
          reincidentesCount: res.reincidentesCount || 0,
          topCategory: res.topCategory || "—",
          byGravedad: res.byGravedad || { leve: 0, grave: 0, muy_grave: 0 },
          lastRecords: res.lastRecords || [],
          propuestasPendientes: res.propuestasPendientes || 0,
          aiProcessedCount: res.aiProcessedCount || 0,
          propuestasStats: res.propuestasStats || { pendientes: 0, aprobadas: 0, enviadas: 0, rechazadas: 0 },
          topReincidentes: res.topReincidentes || [],
          weeklyTrend: res.weeklyTrend || [],
          dayDistribution: res.dayDistribution || [0,0,0,0,0,0,0],
          diaPico: res.diaPico ?? 0,
          tendencia: res.tendencia || 'estable',
          deptStats: res.deptStats || [],
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-dashboard-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias_records' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias_propuestas_rrhh' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const handleAnalyzePatterns = async () => {
    if (!data) return;
    setAnalyzingPatterns(true);
    try {
      const result = await analizarPatrones({
        department_name: 'Global',
        stats: { total: data.totalCount, byGravedad: data.byGravedad, reincidentes: data.reincidentesCount },
        day_distribution: data.dayDistribution,
        tendencia: data.tendencia,
        top_workers: data.topReincidentes,
      });
      setPatternAnalysis(result);
    } catch (e: any) {
      toast.error("Error analizando patrones: " + e.message);
    } finally {
      setAnalyzingPatterns(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  const totalGravedad = (data?.byGravedad.leve || 0) + (data?.byGravedad.grave || 0) + (data?.byGravedad.muy_grave || 0);
  const ps = data?.propuestasStats;
  const totalPropuestas = ps ? ps.pendientes + ps.aprobadas + ps.enviadas + ps.rechazadas : 0;

  const kpis = [
    { label: "Total", value: data?.totalCount ?? 0, icon: AlertTriangle, color: "text-primary", bgColor: "bg-primary/10", nav: { tab: "historico", filter: "todas" } },
    { label: "Hoy", value: data?.todayCount ?? 0, icon: Clock, color: "text-amber-500", bgColor: "bg-amber-500/10", nav: { tab: "historico", filter: "hoy" } },
    { label: "Semana", value: data?.weekCount ?? 0, icon: TrendingUp, color: "text-blue-500", bgColor: "bg-blue-500/10", nav: { tab: "historico", filter: "semana" } },
    { label: "Dptos activos", value: data?.activeDepartments ?? 0, icon: Building2, color: "text-violet-500", bgColor: "bg-violet-500/10" },
    { label: "Reincidentes", value: data?.reincidentesCount ?? 0, icon: RefreshCw, color: "text-red-500", bgColor: "bg-red-500/10", nav: { tab: "trabajadores" } },
    { label: "Propuestas", value: data?.propuestasPendientes ?? 0, icon: Trophy, color: "text-yellow-500", bgColor: "bg-yellow-500/10", nav: { tab: "propuestas" } },
    { label: "IA procesadas", value: data?.aiProcessedCount ?? 0, icon: Zap, color: "text-emerald-500", bgColor: "bg-emerald-500/10", nav: { tab: "historico", filter: "todas" } },
    { label: "Categoría top", value: data?.topCategory ?? "—", icon: Tag, color: "text-primary", bgColor: "bg-primary/10", isText: true },
  ];

  const pieData = [
    { name: "Leves", value: data?.byGravedad.leve || 0, color: "#93d600" },
    { name: "Graves", value: data?.byGravedad.grave || 0, color: "#f59e0b" },
    { name: "Muy graves", value: data?.byGravedad.muy_grave || 0, color: "#ef4444" },
  ].filter(d => d.value > 0);

  const propuestasData = ps ? [
    { name: "Pendientes", value: ps.pendientes, fill: "#f59e0b" },
    { name: "Aprobadas", value: ps.aprobadas, fill: "#3b82f6" },
    { name: "Enviadas", value: ps.enviadas, fill: "#93d600" },
    { name: "Rechazadas", value: ps.rechazadas, fill: "#ef4444" },
  ].filter(d => d.value > 0) : [];

  const hasData = totalGravedad > 0 || totalPropuestas > 0 || (data?.weeklyTrend?.some(w => w.count > 0));

  return (
    <motion.div
      className="max-w-7xl mx-auto px-4 py-6 space-y-6"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* KPI Grid — responsive 2/4 columns */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const isClickable = !!(kpi as any).nav && onNavigate;
          return (
            <Card
              key={kpi.label}
              className={`rounded-2xl border-border/40 hover:shadow-md transition-shadow ${isClickable ? 'cursor-pointer hover:ring-1 hover:ring-primary/30 active:scale-[0.98]' : ''}`}
              onClick={() => {
                if (isClickable && (kpi as any).nav) {
                  const { tab, filter } = (kpi as any).nav;
                  onNavigate!(tab, filter);
                }
              }}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`${kpi.bgColor} rounded-xl p-2 shrink-0`}>
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <div className="min-w-0">
                  <p className={`${(kpi as any).isText ? 'text-sm font-semibold truncate' : 'text-2xl font-bold'} text-foreground leading-tight`}>
                    {kpi.value}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </motion.div>

      {/* Charts row 1: Gravedad pie + Propuestas donut + Weekly trend */}
      {hasData && (
        <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Gravedad Pie */}
          {pieData.length > 0 ? (
            <Card className="rounded-2xl border-border/40">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <ShieldAlert className="h-3.5 w-3.5" /> Distribución por gravedad
                </CardTitle>
              </CardHeader>
              <CardContent className="h-56 flex items-center justify-center px-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      height={28}
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string) => (
                        <span className="text-[11px] text-muted-foreground">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl border-border/40">
              <CardContent className="h-56 flex items-center justify-center">
                <div className="text-center">
                  <ShieldAlert className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Sin datos de gravedad</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Propuestas Donut */}
          {propuestasData.length > 0 ? (
            <Card className="rounded-2xl border-border/40">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <FileCheck className="h-3.5 w-3.5" /> Estado de propuestas
                </CardTitle>
              </CardHeader>
              <CardContent className="h-56 flex items-center justify-center px-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={propuestasData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {propuestasData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      height={28}
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string) => (
                        <span className="text-[11px] text-muted-foreground">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl border-border/40">
              <CardContent className="h-56 flex items-center justify-center">
                <div className="text-center">
                  <FileCheck className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Sin propuestas</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Weekly Trend Area Chart */}
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5" /> Tendencia semanal
              </CardTitle>
            </CardHeader>
            <CardContent className="h-56 px-2">
              {data?.weeklyTrend && data.weeklyTrend.some(w => w.count > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.weeklyTrend}>
                    <defs>
                      <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#93d600" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#93d600" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} width={30} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#93d600"
                      strokeWidth={2}
                      fill="url(#trendGradient)"
                      name="Incidencias"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <TrendingUp className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Sin datos de tendencia</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Row 2: Top reincidentes + Recent records */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top reincidentes */}
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-3.5 w-3.5" /> Top reincidentes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {data?.topReincidentes && data.topReincidentes.length > 0 ? (
              <div className="space-y-2.5">
                {data.topReincidentes.map((w, i) => {
                  const riskColor = w.riesgo >= 75 ? 'bg-red-500' : w.riesgo >= 50 ? 'bg-amber-500' : w.riesgo >= 25 ? 'bg-yellow-400' : 'bg-emerald-500';
                  return (
                    <div key={w.worker_id} className="flex items-center gap-3 group">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                      </div>
                      {w.worker_number ? (
                        <a
                          href={`https://salix.verdnatura.es/#!/worker/${w.worker_number}/summary`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm flex-1 truncate hover:text-primary hover:underline transition-colors cursor-pointer"
                        >
                          {w.worker_name}
                        </a>
                      ) : (
                        <span className="text-sm flex-1 truncate">{w.worker_name}</span>
                      )}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
                        {w.count}
                      </Badge>
                      <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${riskColor}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${w.riesgo}%` }}
                          transition={{ duration: 0.8, delay: i * 0.1 }}
                        />
                      </div>
                      <span className="text-[10px] font-semibold tabular-nums w-8 text-right">{w.riesgo}%</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Sin reincidentes registrados</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Last records */}
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" /> Últimas incidencias
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {data?.lastRecords && data.lastRecords.length > 0 ? (
              <div className="space-y-2">
                {data.lastRecords.map((rec: any) => (
                  <div key={rec.id} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {(rec.workers || []).map((w: any, wi: number) => {
                          const name = w.worker_name;
                          if (w.worker_number) {
                            return (
                              <span key={wi}>
                                {wi > 0 && ', '}
                                <a
                                  href={`https://salix.verdnatura.es/#!/worker/${w.worker_number}/summary`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-primary hover:underline transition-colors"
                                >
                                  {name}
                                </a>
                              </span>
                            );
                          }
                          return <span key={wi}>{wi > 0 && ', '}{name}</span>;
                        })}
                        {(!rec.workers || rec.workers.length === 0) && "—"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {rec.incidencias_categories && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                            style={{
                              backgroundColor: rec.incidencias_categories.color + '20',
                              color: rec.incidencias_categories.color,
                            }}
                          >
                            {rec.incidencias_categories.name}{rec.custom_category_name && ` — ${rec.custom_category_name}`}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(rec.fecha), { addSuffix: true, locale: es })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Sin incidencias registradas</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Row 3: Weekly patterns + AI insights */}
      {hasData && (
        <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Day of week bar chart */}
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" /> Patrones semanales
                {data?.tendencia && (
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {data.tendencia === 'subiendo' ? '📈 Subiendo' : data.tendencia === 'bajando' ? '📉 Bajando' : '➡️ Estable'}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="h-56 px-2">
              {data?.dayDistribution && data.dayDistribution.some(v => v > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((name, i) => ({
                    name,
                    incidencias: data.dayDistribution[i],
                    isPeak: i === data.diaPico,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} width={25} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="incidencias" name="Incidencias" radius={[4, 4, 0, 0]}>
                      {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((_, i) => (
                        <Cell key={i} fill={i === data.diaPico ? '#ef4444' : '#93d600'} fillOpacity={i === data.diaPico ? 1 : 0.7} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Sin datos de distribución semanal</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Pattern Analysis */}
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Brain className="h-3.5 w-3.5" /> Análisis IA predictivo
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-6 text-[10px] px-2"
                  onClick={handleAnalyzePatterns}
                  disabled={analyzingPatterns}
                >
                  {analyzingPatterns ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Brain className="h-3 w-3 mr-1" />}
                  {analyzingPatterns ? 'Analizando...' : 'Analizar patrones'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {patternAnalysis ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={
                      patternAnalysis.nivel_alerta === 'critico' ? 'destructive' :
                      patternAnalysis.nivel_alerta === 'alto' ? 'destructive' :
                      patternAnalysis.nivel_alerta === 'medio' ? 'secondary' : 'default'
                    } className="text-[10px]">
                      {patternAnalysis.nivel_alerta === 'critico' ? '🔴' : patternAnalysis.nivel_alerta === 'alto' ? '🟠' : patternAnalysis.nivel_alerta === 'medio' ? '🟡' : '🟢'} {patternAnalysis.nivel_alerta}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      Pico: {patternAnalysis.dia_pico}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {patternAnalysis.tendencia === 'subiendo' ? '📈' : patternAnalysis.tendencia === 'bajando' ? '📉' : '➡️'} {patternAnalysis.tendencia}
                    </Badge>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed">{patternAnalysis.resumen}</p>
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">📌 Predicción próxima semana:</p>
                    <p>{patternAnalysis.prediccion_proxima_semana}</p>
                  </div>
                  {patternAnalysis.alertas_proactivas.length > 0 && (
                    <div className="text-xs">
                      <p className="font-medium text-foreground mb-1">⚠️ Alertas proactivas:</p>
                      <ul className="space-y-1">
                        {patternAnalysis.alertas_proactivas.map((a, i) => (
                          <li key={i} className="text-muted-foreground flex gap-1.5">
                            <span className="shrink-0">•</span> {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {patternAnalysis.acciones_preventivas.length > 0 && (
                    <div className="text-xs">
                      <p className="font-medium text-foreground mb-1">✅ Acciones preventivas:</p>
                      <ul className="space-y-1">
                        {patternAnalysis.acciones_preventivas.map((a, i) => (
                          <li key={i} className="text-muted-foreground flex gap-1.5">
                            <span className="shrink-0">•</span> {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <Brain className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Pulsa "Analizar patrones" para obtener</p>
                  <p className="text-xs text-muted-foreground">predicciones y alertas proactivas de IA</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Empty state */}
      {!hasData && (
        <motion.div variants={fadeUp}>
          <Card className="rounded-2xl border-border/40 border-dashed">
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Registra incidencias para ver gráficos y análisis detallados</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Los datos aparecerán aquí automáticamente</p>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
