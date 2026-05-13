import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, Minus, BarChart3, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

type HistoryEntry = {
  id: string;
  lines_hour: number;
  recorded_at: string;
  import_source: string;
  created_at: string;
};

type Props = {
  workerId: string;
  sessionToken: string;
  compact?: boolean;
};

export const WorkerPerformanceHistory = ({ workerId, sessionToken, compact = false }: Props) => {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentValue, setCurrentValue] = useState<number | null>(null);
  const [threshold, setThreshold] = useState<{ green_min: number; yellow_min: number } | null>(null);

  useEffect(() => {
    fetchHistory();
  }, [workerId]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getWorkerPerformanceHistory", sessionToken, data: { workerId } },
      });
      if (data?.success) {
        setHistory(data.history || []);
        setCurrentValue(data.worker?.lines_hour ?? null);
        setThreshold(data.threshold || null);
      }
    } catch (err) {
      console.error("Error fetching performance history:", err);
    } finally {
      setLoading(false);
    }
  };

  const getColorClass = (value: number) => {
    if (!threshold) return "text-foreground";
    if (value >= threshold.green_min) return "text-emerald-600 dark:text-emerald-400";
    if (value >= threshold.yellow_min) return "text-amber-600 dark:text-amber-400";
    return "text-destructive";
  };

  const getBadgeVariant = (value: number) => {
    if (!threshold) return "secondary" as const;
    if (value >= threshold.green_min) return "default" as const;
    if (value >= threshold.yellow_min) return "secondary" as const;
    return "destructive" as const;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (history.length === 0 && currentValue === null) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No hay datos de rendimiento disponibles. Importa un CSV con la columna "líneas/hora" para empezar a registrar.
      </div>
    );
  }

  // Stats
  const values = history.map(h => Number(h.lines_hour));
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const best = values.length > 0 ? Math.max(...values) : 0;
  const worst = values.length > 0 ? Math.min(...values) : 0;
  const trend = values.length >= 2 ? values[0] - values[values.length - 1] : 0;

  // Chart data (chronological)
  const chartData = [...history].reverse().map(h => ({
    date: format(parseISO(h.recorded_at), "dd/MM", { locale: es }),
    fullDate: format(parseISO(h.recorded_at), "dd MMM yyyy", { locale: es }),
    value: Number(h.lines_hour),
  }));

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {/* Current value + stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Actual</p>
            <p className={cn("text-2xl font-bold tabular-nums", currentValue != null ? getColorClass(currentValue) : "text-muted-foreground")}>
              {currentValue != null ? currentValue.toFixed(2) : "—"}
            </p>
            {currentValue != null && threshold && (
              <Badge variant={getBadgeVariant(currentValue)} className="mt-1 text-[10px]">
                {currentValue >= threshold.green_min ? "Óptimo" : currentValue >= threshold.yellow_min ? "Medio" : "Bajo"}
              </Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Media</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">{avg.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{values.length} registros</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Mejor</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{best.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Tendencia</p>
            <div className="flex items-center justify-center gap-1">
              {trend > 0 ? (
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              ) : trend < 0 ? (
                <TrendingDown className="h-5 w-5 text-destructive" />
              ) : (
                <Minus className="h-5 w-5 text-muted-foreground" />
              )}
              <span className={cn("text-lg font-bold", trend > 0 ? "text-emerald-500" : trend < 0 ? "text-destructive" : "text-muted-foreground")}>
                {trend > 0 ? "+" : ""}{trend.toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length >= 2 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Evolución del rendimiento
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                    formatter={(value: number) => [value.toFixed(2), 'Líneas/h']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate || label}
                  />
                  {threshold && (
                    <>
                      <ReferenceLine y={threshold.green_min} stroke="hsl(var(--chart-2))" strokeDasharray="5 5" label={{ value: "Óptimo", fontSize: 10 }} />
                      <ReferenceLine y={threshold.yellow_min} stroke="hsl(var(--chart-4))" strokeDasharray="5 5" label={{ value: "Mínimo", fontSize: 10 }} />
                    </>
                  )}
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "hsl(var(--primary))" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History table */}
      {!compact && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Histórico de importaciones</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-auto max-h-64">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Líneas/h</TableHead>
                    <TableHead>Variación</TableHead>
                    <TableHead>Origen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry, i) => {
                    const prev = history[i + 1];
                    const diff = prev ? Number(entry.lines_hour) - Number(prev.lines_hour) : 0;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="text-sm">
                          {format(parseISO(entry.recorded_at), "dd MMM yyyy", { locale: es })}
                        </TableCell>
                        <TableCell className={cn("font-mono font-medium tabular-nums", getColorClass(Number(entry.lines_hour)))}>
                          {Number(entry.lines_hour).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {prev ? (
                            <span className={cn("text-sm flex items-center gap-1", diff > 0 ? "text-emerald-500" : diff < 0 ? "text-destructive" : "text-muted-foreground")}>
                              {diff > 0 ? <TrendingUp className="h-3 w-3" /> : diff < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                              {diff > 0 ? "+" : ""}{diff.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {entry.import_source || "csv"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compact: last 5 entries */}
      {compact && history.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium px-1">Últimos registros</p>
          {history.slice(0, 5).map((entry, i) => {
            const prev = history[i + 1];
            const diff = prev ? Number(entry.lines_hour) - Number(prev.lines_hour) : 0;
            return (
              <div key={entry.id} className="flex items-center justify-between px-3 py-1.5 bg-muted/30 rounded text-sm">
                <span className="text-muted-foreground">{format(parseISO(entry.recorded_at), "dd/MM/yy")}</span>
                <span className={cn("font-mono tabular-nums font-medium", getColorClass(Number(entry.lines_hour)))}>
                  {Number(entry.lines_hour).toFixed(2)}
                </span>
                {prev && (
                  <span className={cn("text-xs", diff > 0 ? "text-emerald-500" : diff < 0 ? "text-destructive" : "text-muted-foreground")}>
                    {diff > 0 ? "+" : ""}{diff.toFixed(2)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
