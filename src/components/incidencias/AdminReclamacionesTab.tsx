import { useState, useEffect, useCallback } from "react";
import { DollarSign, Search, Loader2, ExternalLink, FileSpreadsheet, TrendingDown, Users, Receipt, CalendarIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const SALIX_TICKET = "https://salix.verdnatura.es/#/ticket/";
const SALIX_CLAIM = "https://salix.verdnatura.es/#/claim/";
const SALIX_WORKER = "https://salix.verdnatura.es/#/worker/";

function SalixLink({ id, type }: { id: string; type: "ticket" | "claim" }) {
  const base = type === "ticket" ? SALIX_TICKET : SALIX_CLAIM;
  return (
    <a
      href={`${base}${id}/summary`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline inline-flex items-center gap-0.5 text-xs"
      onClick={e => e.stopPropagation()}
    >
      #{id}
      <ExternalLink className="h-2.5 w-2.5 opacity-50" />
    </a>
  );
}

function formatEuro(val: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(val);
}

export function AdminReclamacionesTab() {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [losses, setLosses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "getLosses",
          sessionToken,
          dateFrom: dateFrom ? format(dateFrom, "yyyy-MM-dd") : undefined,
          dateTo: dateTo ? format(dateTo, "yyyy-MM-dd") : undefined,
        },
      });
      setLosses(data?.losses || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // Filter by search
  const filtered = losses.filter(l => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (l.worker_name || "").toLowerCase().includes(q)
      || (l.motivo || "").toLowerCase().includes(q)
      || (l.consecuencia || "").toLowerCase().includes(q)
      || (l.ticket_id || "").includes(q)
      || (l.claim_id || "").includes(q);
  });

  // KPIs
  const totalLoss = filtered.reduce((s, l) => s + (Number(l.importe) || 0), 0);
  const totalCount = filtered.length;
  const avgLoss = totalCount > 0 ? totalLoss / totalCount : 0;

  // Top worker
  const workerTotals: Record<string, { name: string; number: string; total: number }> = {};
  filtered.forEach(l => {
    const key = l.worker_name || "—";
    if (!workerTotals[key]) workerTotals[key] = { name: key, number: l.worker_number || "", total: 0 };
    workerTotals[key].total += Number(l.importe) || 0;
  });
  const topWorkers = Object.values(workerTotals).sort((a, b) => b.total - a.total);
  const topWorker = topWorkers[0];

  // Chart data: top 10 workers
  const barData = topWorkers.slice(0, 10).map(w => ({
    name: w.name.length > 12 ? w.name.slice(0, 12) + "…" : w.name,
    total: Math.round(w.total * 100) / 100,
  }));

  // Chart data: losses by date
  const dateTotals: Record<string, number> = {};
  filtered.forEach(l => {
    const d = l.fecha?.split("T")[0] || "";
    if (d) dateTotals[d] = (dateTotals[d] || 0) + (Number(l.importe) || 0);
  });
  const lineData = Object.entries(dateTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total: Math.round(total * 100) / 100 }));

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar trabajador, motivo, ticket..."
            className="pl-9 rounded-xl h-11"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-xl h-11 gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, "dd/MM/yy") : "Desde"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={es} />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-xl h-11 gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateTo ? format(dateTo, "dd/MM/yy") : "Hasta"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={es} />
          </PopoverContent>
        </Popover>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" className="rounded-xl h-11 text-xs" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
            Limpiar
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-4 text-center">
            <TrendingDown className="h-5 w-5 text-destructive mx-auto mb-1" />
            <p className="text-xl font-bold text-destructive">{formatEuro(totalLoss)}</p>
            <p className="text-[10px] text-muted-foreground">Pérdida total</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-4 text-center">
            <Receipt className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold">{totalCount}</p>
            <p className="text-[10px] text-muted-foreground">Reclamaciones</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-4 text-center">
            <DollarSign className="h-5 w-5 text-amber-500 mx-auto mb-1" />
            <p className="text-xl font-bold">{formatEuro(avgLoss)}</p>
            <p className="text-[10px] text-muted-foreground">Media / incidencia</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 text-orange-500 mx-auto mb-1" />
            <p className="text-sm font-bold truncate">{topWorker?.name || "—"}</p>
            <p className="text-[10px] text-muted-foreground">{topWorker ? formatEuro(topWorker.total) : "—"}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Charts */}
          {filtered.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Bar chart: top workers */}
              <Card className="rounded-2xl border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold">Top 10 trabajadores por pérdidas</CardTitle>
                </CardHeader>
                <CardContent className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ left: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={55} />
                      <Tooltip formatter={(v: number) => formatEuro(v)} />
                      <Bar dataKey="total" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Line chart: evolution */}
              <Card className="rounded-2xl border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold">Evolución de pérdidas</CardTitle>
                </CardHeader>
                <CardContent className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lineData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => formatEuro(v)} />
                      <Line type="monotone" dataKey="total" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Table */}
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold flex items-center justify-between">
                <span>Detalle de reclamaciones</span>
                <Badge variant="secondary" className="text-[10px]">{filtered.length} registros</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Fecha</TableHead>
                      <TableHead className="text-[10px]">Trabajador</TableHead>
                      <TableHead className="text-[10px]">Ticket</TableHead>
                      <TableHead className="text-[10px]">Reclamación</TableHead>
                      <TableHead className="text-[10px]">Importe</TableHead>
                      <TableHead className="text-[10px]">Motivo</TableHead>
                      <TableHead className="text-[10px]">Consecuencia</TableHead>
                      <TableHead className="text-[10px]">Origen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                          Sin reclamaciones encontradas
                        </TableCell>
                      </TableRow>
                    ) : filtered.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs whitespace-nowrap">{l.fecha ? format(new Date(l.fecha), "dd/MM/yy") : "—"}</TableCell>
                        <TableCell>
                          {l.worker_number ? (
                            <a
                              href={`${SALIX_WORKER}${l.worker_number}/time-control`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5"
                            >
                              {l.worker_name || "—"}
                              <span className="text-[9px] text-muted-foreground">#{l.worker_number}</span>
                              <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                            </a>
                          ) : (
                            <span className="text-xs">{l.worker_name || "—"}</span>
                          )}
                        </TableCell>
                        <TableCell>{l.ticket_id ? <SalixLink id={l.ticket_id} type="ticket" /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                        <TableCell>{l.claim_id ? <SalixLink id={l.claim_id} type="claim" /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-xs font-semibold text-destructive whitespace-nowrap">{formatEuro(Number(l.importe) || 0)}</TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate">{l.motivo || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate">{l.consecuencia || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", l.origen === "csv_import" ? "border-blue-500/30 text-blue-600 bg-blue-500/5" : "border-purple-500/30 text-purple-600 bg-purple-500/5")}>
                            {l.origen === "csv_import" ? (
                              <><FileSpreadsheet className="h-2.5 w-2.5 mr-0.5" />CSV</>
                            ) : "Manual"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
