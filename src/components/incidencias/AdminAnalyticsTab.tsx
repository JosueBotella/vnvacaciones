import { useState, useEffect, useCallback } from "react";
import { BarChart3, AlertTriangle, ShieldAlert, Clock, TrendingUp, Sparkles, Loader2, Users, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";

interface DeptStat {
  department_id: string;
  total: number;
  leves: number;
  graves: number;
  muy_graves: number;
  media_por_trabajador: number;
  reincidentes: number;
  tiempo_medio_resolucion: number;
  riesgo_global: number;
  incidencias_departments?: { name: string };
}

interface WorkerStat {
  worker_id: string;
  department_id: string;
  total_count: number;
  riesgo_score: number;
  incidencias_workers?: { nombre: string; apellidos: string | null; worker_number: string | null };
}

interface DailyMetric {
  date: string;
  total: number;
  propuestas: number;
  sanciones: number;
  reincidentes: number;
}

export function AdminAnalyticsTab() {
  const [deptStats, setDeptStats] = useState<DeptStat[]>([]);
  const [topWorkers, setTopWorkers] = useState<WorkerStat[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const sessionToken = localStorage.getItem("manager_session_token") || "";

  const loadData = useCallback(async () => {
    try {
      const d90 = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];

      const [deptRes, topRes, metricsRes] = await Promise.all([
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "getDepartmentStats", sessionToken },
        }),
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "getTopReincidentes", sessionToken, limit: 10 },
        }),
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "getDailyMetrics", sessionToken, startDate: d90 },
        }),
      ]);

      if (deptRes.data?.success) setDeptStats(deptRes.data.stats || []);
      if (topRes.data?.success) setTopWorkers(topRes.data.workers || []);
      if (metricsRes.data?.success) setDailyMetrics(metricsRes.data.metrics || []);
    } catch (e) {
      console.error("Failed to load analytics:", e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('analytics-dept-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias_department_stats' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const handleGenerateSummary = async () => {
    setAiLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getAIAdminSummary", sessionToken },
      });
      if (data?.success) {
        const text = data.summary?.respuesta || data.summary?.resumen || JSON.stringify(data.summary);
        setAiSummary(text);
      }
    } catch (e) {
      console.error("AI summary failed:", e);
    } finally {
      setAiLoading(false);
    }
  };

  // Computed KPIs
  const totalIncidencias = deptStats.reduce((s, d) => s + d.total, 0);
  const totalReincidentes = deptStats.reduce((s, d) => s + d.reincidentes, 0);
  const tasaReincidencia = totalIncidencias > 0 ? Math.round((totalReincidentes / totalIncidencias) * 100) : 0;
  const deptsEnRiesgo = deptStats.filter(d => d.riesgo_global > 50).length;
  const tiempoMedioGlobal = deptStats.length > 0
    ? Math.round(deptStats.reduce((s, d) => s + d.tiempo_medio_resolucion, 0) / deptStats.length * 10) / 10
    : 0;

  // Chart data: aggregate daily metrics across departments
  const dailyAgg = dailyMetrics.reduce<Record<string, DailyMetric>>((acc, m) => {
    if (!acc[m.date]) acc[m.date] = { date: m.date, total: 0, propuestas: 0, sanciones: 0, reincidentes: 0 };
    acc[m.date].total += m.total;
    acc[m.date].propuestas += m.propuestas;
    acc[m.date].sanciones += m.sanciones;
    acc[m.date].reincidentes += m.reincidentes;
    return acc;
  }, {});
  const timeSeriesData = Object.values(dailyAgg).sort((a, b) => a.date.localeCompare(b.date));

  // Severity bar chart data
  const severityData = deptStats.map(d => ({
    name: d.incidencias_departments?.name || 'Dept',
    Leves: d.leves,
    Graves: d.graves,
    "Muy graves": d.muy_graves,
  }));

  const riskColor = (score: number) => score >= 70 ? 'text-red-500' : score >= 40 ? 'text-yellow-500' : 'text-green-500';
  const riskBg = (score: number) => score >= 70 ? 'bg-red-500/10' : score >= 40 ? 'bg-yellow-500/10' : 'bg-green-500/10';

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="rounded-2xl border-border/30">
          <CardContent className="p-4 flex flex-col gap-1">
            <BarChart3 className="h-5 w-5 text-primary" />
            <p className="text-3xl font-bold">{totalIncidencias}</p>
            <p className="text-xs text-muted-foreground">Total incidencias</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/30">
          <CardContent className="p-4 flex flex-col gap-1">
            <TrendingUp className="h-5 w-5 text-orange-500" />
            <p className="text-3xl font-bold">{tasaReincidencia}%</p>
            <p className="text-xs text-muted-foreground">Tasa reincidencia</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/30">
          <CardContent className="p-4 flex flex-col gap-1">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            <p className="text-3xl font-bold">{deptsEnRiesgo}</p>
            <p className="text-xs text-muted-foreground">Depts. en riesgo</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/30">
          <CardContent className="p-4 flex flex-col gap-1">
            <Users className="h-5 w-5 text-yellow-500" />
            <p className="text-3xl font-bold">{totalReincidentes}</p>
            <p className="text-xs text-muted-foreground">Reincidentes</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/30">
          <CardContent className="p-4 flex flex-col gap-1">
            <Clock className="h-5 w-5 text-primary" />
            <p className="text-3xl font-bold">{tiempoMedioGlobal}d</p>
            <p className="text-xs text-muted-foreground">T. medio resolución</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Severity by department */}
        {severityData.length > 0 && (
          <Card className="rounded-2xl border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Gravedad por departamento</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                   <Tooltip content={({ active, payload, label }) => {
                     if (!active || !payload?.length) return null;
                     return (
                       <div className="bg-popover text-popover-foreground border border-border rounded-xl text-xs px-3 py-2 shadow-lg">
                         {label && <p className="font-medium mb-0.5">{label}</p>}
                         {payload.map((p: any, i: number) => (
                           <p key={i} className="text-muted-foreground">{p.name}: <span className="font-semibold text-popover-foreground">{p.value}</span></p>
                         ))}
                       </div>
                     );
                   }} />
                   <Legend />
                   <Bar dataKey="Leves" stackId="a" fill="#93d600" radius={[0, 0, 0, 0]} />
                   <Bar dataKey="Graves" stackId="a" fill="#f59e0b" />
                   <Bar dataKey="Muy graves" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Time series */}
        {timeSeriesData.length > 0 && (
          <Card className="rounded-2xl border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Tendencia 90 días</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                   <Tooltip content={({ active, payload, label }) => {
                     if (!active || !payload?.length) return null;
                     return (
                       <div className="bg-popover text-popover-foreground border border-border rounded-xl text-xs px-3 py-2 shadow-lg">
                         {label && <p className="font-medium mb-0.5">{label}</p>}
                         {payload.map((p: any, i: number) => (
                           <p key={i} className="text-muted-foreground">{p.name}: <span className="font-semibold text-popover-foreground">{p.value}</span></p>
                         ))}
                       </div>
                     );
                   }} />
                   <Legend />
                   <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Incidencias" />
                   <Line type="monotone" dataKey="propuestas" stroke="#f59e0b" strokeWidth={2} dot={false} name="Propuestas" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Department ranking table */}
      {deptStats.length > 0 && (
        <Card className="rounded-2xl border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Ranking departamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Departamento</TableHead>
                  <TableHead className="text-center">Riesgo</TableHead>
                  <TableHead className="text-center">Inc/Empleado</TableHead>
                  <TableHead className="text-center">Reincidentes</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deptStats.map(d => (
                  <TableRow key={d.department_id}>
                    <TableCell className="font-medium">{d.incidencias_departments?.name || '—'}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={`${riskBg(d.riesgo_global)} ${riskColor(d.riesgo_global)} border-0`}>
                        {d.riesgo_global}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{d.media_por_trabajador}</TableCell>
                    <TableCell className="text-center">{d.reincidentes}</TableCell>
                    <TableCell className="text-center">
                      <div className={`h-3 w-3 rounded-full mx-auto ${d.riesgo_global >= 70 ? 'bg-red-500' : d.riesgo_global >= 40 ? 'bg-yellow-500' : 'bg-green-500'}`} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Top reincidentes */}
      {topWorkers.length > 0 && (
        <Card className="rounded-2xl border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Top trabajadores con riesgo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topWorkers.slice(0, 10).map((w) => {
              const name = `${w.incidencias_workers?.nombre || ''} ${w.incidencias_workers?.apellidos || ''}`.trim();
              return (
                <div key={w.worker_id} className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${riskBg(w.riesgo_score)} ${riskColor(w.riesgo_score)}`}>
                    {name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Progress value={w.riesgo_score} className="h-1.5 flex-1" />
                      <span className={`text-xs font-bold ${riskColor(w.riesgo_score)}`}>{w.riesgo_score}</span>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{w.total_count} inc.</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* AI Summary */}
      <Card className="rounded-2xl border-border/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Insights IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          {aiSummary ? (
            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{aiSummary}</div>
          ) : (
            <Button onClick={handleGenerateSummary} disabled={aiLoading} variant="outline" className="w-full">
              {aiLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generando resumen...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Generar resumen IA del periodo</>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
