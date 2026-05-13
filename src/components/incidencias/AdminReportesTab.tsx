import { useState, useCallback, useRef, useEffect } from "react";
import { Search, FileText, Presentation, Loader2, Download, Calendar, BarChart3, TrendingUp, TrendingDown, Star, AlertTriangle, X, ExternalLink, Gavel, ShieldAlert, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { WorkerReportPresentation } from "@/components/incidencias/WorkerReportPresentation";

interface Worker {
  id: string;
  nombre: string;
  apellidos: string | null;
  worker_number: string | null;
  external_url_salix: string | null;
  department_name: string | null;
}

export function AdminReportesTab() {
  const sessionToken = localStorage.getItem("manager_session_token") || "";

  const [workerSearch, setWorkerSearch] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setWorkers([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date();
    return format(new Date(d.getFullYear(), 0, 1), 'yyyy-MM-dd');
  });
  const [fechaHasta, setFechaHasta] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [incluirPositivas, setIncluirPositivas] = useState(true);
  const [desdeOpen, setDesdeOpen] = useState(false);
  const [hastaOpen, setHastaOpen] = useState(false);

  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [reportType, setReportType] = useState<"pdf" | "presentacion" | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [presentationPdfHtml, setPresentationPdfHtml] = useState<string | null>(null);
  const [presentationPdfLoading, setPresentationPdfLoading] = useState(false);

  // Search workers with debounce
  const searchWorkers = useCallback((q: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.length < 2) { setWorkers([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "searchWorkersGlobal", sessionToken, query: q },
        });
        setWorkers(data?.workers || []);
      } catch { setWorkers([]); }
      finally { setSearchLoading(false); }
    }, 300);
  }, [sessionToken]);

  // Load stats
  const loadStats = useCallback(async () => {
    if (!selectedWorker) return;
    setStatsLoading(true);
    setReportHtml(null);
    setPresentationOpen(false);
    setPresentationPdfHtml(null);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getWorkerFullStats", sessionToken, workerId: selectedWorker.id, fechaDesde, fechaHasta, incluirPositivas },
      });
      setStats(data);
    } catch { toast.error("Error cargando estadísticas"); }
    finally { setStatsLoading(false); }
  }, [selectedWorker, fechaDesde, fechaHasta, incluirPositivas, sessionToken]);

  // Generate report
  const generateReport = async (formato: "pdf" | "presentacion") => {
    if (!selectedWorker) return;

    if (formato === "presentacion") {
      setPresentationOpen(true);
      setReportHtml(null);
      setReportType("presentacion");
      setReportLoading(true);
      setPresentationPdfLoading(true);

      try {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "generateWorkerReport", sessionToken, workerId: selectedWorker.id, fechaDesde, fechaHasta, incluirPositivas, formato },
        });

        if (data?.html) {
          setPresentationPdfHtml(data.html);
        }

        toast.success("Presentación interactiva lista ✓");
      } catch {
        toast.success("Presentación interactiva lista ✓");
      } finally {
        setReportLoading(false);
        setPresentationPdfLoading(false);
      }

      return;
    }

    setReportLoading(true);
    setReportType(formato);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "generateWorkerReport", sessionToken, workerId: selectedWorker.id, fechaDesde, fechaHasta, incluirPositivas, formato },
      });
      if (data?.html) {
        setReportHtml(data.html);
        toast.success(formato === "pdf" ? "Informe generado ✓" : "Presentación generada ✓");
      } else {
        toast.error(data?.error || "Error generando informe");
      }
    } catch { toast.error("Error generando informe"); }
    finally { setReportLoading(false); }
  };

  // Download as PDF via print dialog
  const printHtml = useCallback((html: string | null) => {
    if (!html) return;
    const w = window.open('', '_blank');
    if (!w) { toast.error("Permite ventanas emergentes para descargar"); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.print(); }, 600);
  }, []);

  const printPdf = useCallback(() => {
    printHtml(reportHtml);
  }, [printHtml, reportHtml]);

  const printPresentationPdf = useCallback(() => {
    if (!presentationPdfHtml) {
      toast.error("El PDF de la presentación aún se está preparando");
      return;
    }
    printHtml(presentationPdfHtml);
  }, [presentationPdfHtml, printHtml]);

  const workerName = selectedWorker ? [selectedWorker.nombre, selectedWorker.apellidos].filter(Boolean).join(" ") : "";

  const renderSalixLink = (workerNum: string | null, salixUrl: string | null, className?: string) => {
    if (!workerNum) return null;

    const resolvedSalixUrl = salixUrl || `https://salix.verdnatura.es/#!/worker/${encodeURIComponent(workerNum)}/summary`;

    const badgeClasses = cn(
      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium shrink-0 transition-colors",
      resolvedSalixUrl
        ? "bg-primary/10 text-primary hover:bg-primary/15 hover:underline cursor-pointer"
        : "bg-muted text-muted-foreground",
      className
    );

    if (resolvedSalixUrl) {
      return (
        <a
          href={resolvedSalixUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={`Abrir ficha de ${workerNum} en Sálix`}
          className={badgeClasses}
        >
          Nº {workerNum} <ExternalLink className="h-3 w-3" />
        </a>
      );
    }

    return <span className={badgeClasses}>Nº {workerNum}</span>;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Reportes por trabajador</h2>
      </div>

      {/* Worker search + date range */}
      <Card className="rounded-2xl border-border/40">
        <CardContent className="p-5 space-y-4">
          {/* Worker search */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Buscar trabajador</label>
            {selectedWorker ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{workerName}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {renderSalixLink(selectedWorker.worker_number, selectedWorker.external_url_salix, "text-xs")}
                    {selectedWorker.department_name && (
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {selectedWorker.department_name}
                      </span>
                    )}
                  </div>
                </div>
                 <Button variant="ghost" size="sm" onClick={() => { setSelectedWorker(null); setStats(null); setReportHtml(null); setPresentationOpen(false); setPresentationPdfHtml(null); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="relative" ref={searchContainerRef}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Nombre o número de trabajador..."
                  value={workerSearch}
                  onChange={e => { setWorkerSearch(e.target.value); searchWorkers(e.target.value); }}
                  className="pl-9 pr-10 h-11 rounded-xl"
                />
                {searchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {workers.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg max-h-72 overflow-y-auto">
                    {workers.map(w => (
                      <div
                        key={w.id}
                        className="flex items-center gap-3 px-4 py-3 text-sm transition-colors border-b border-border/20 last:border-0 hover:bg-muted/50"
                      >
                        <button
                          type="button"
                          onClick={() => { setSelectedWorker(w); setWorkers([]); setWorkerSearch(""); }}
                          className="flex-1 min-w-0 text-left"
                        >
                          <span className="font-medium">{w.nombre} {w.apellidos || ""}</span>
                          {w.department_name && (
                            <span className="text-xs text-muted-foreground ml-2 inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3 inline" />
                              {w.department_name}
                            </span>
                          )}
                        </button>
                        {renderSalixLink(w.worker_number, w.external_url_salix)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Date range + toggle */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Desde</label>
              <Popover open={desdeOpen} onOpenChange={setDesdeOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center justify-between w-full h-10 px-3 rounded-xl border border-border/40 bg-muted/30 text-sm hover:border-border transition-colors">
                    <span>{fechaDesde ? format(parse(fechaDesde, 'yyyy-MM-dd', new Date()), 'dd/MM/yy') : 'Desde'}</span>
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                  <CalendarPicker mode="single" selected={fechaDesde ? parse(fechaDesde, 'yyyy-MM-dd', new Date()) : undefined} onSelect={d => { if (d) { setFechaDesde(format(d, 'yyyy-MM-dd')); setDesdeOpen(false); } }} locale={es} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Hasta</label>
              <Popover open={hastaOpen} onOpenChange={setHastaOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center justify-between w-full h-10 px-3 rounded-xl border border-border/40 bg-muted/30 text-sm hover:border-border transition-colors">
                    <span>{fechaHasta ? format(parse(fechaHasta, 'yyyy-MM-dd', new Date()), 'dd/MM/yy') : 'Hasta'}</span>
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                  <CalendarPicker mode="single" selected={fechaHasta ? parse(fechaHasta, 'yyyy-MM-dd', new Date()) : undefined} onSelect={d => { if (d) { setFechaHasta(format(d, 'yyyy-MM-dd')); setHastaOpen(false); } }} locale={es} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-end gap-2 col-span-2">
              <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-border/40 bg-muted/30 flex-1">
                <Star className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs">Incluir positivas</span>
                <Switch checked={incluirPositivas} onCheckedChange={setIncluirPositivas} className="ml-auto" />
              </div>
              <Button onClick={loadStats} disabled={!selectedWorker || statsLoading} className="rounded-xl h-10">
                {statsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Consultar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats cards */}
      {stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Incidencias (solo registro) */}
            <Card className="rounded-xl border-border/30">
              <CardContent className="p-4 text-center">
                <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-amber-500" />
                <p className="text-2xl font-bold">{stats.negativas?.length || 0}</p>
                <p className="text-[10px] text-muted-foreground">Incidencias</p>
              </CardContent>
            </Card>
            {/* Amonestaciones */}
            <Card className="rounded-xl border-border/30">
              <CardContent className="p-4 text-center">
                <Gavel className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                <p className="text-2xl font-bold">{stats.amonestaciones?.length || 0}</p>
                <p className="text-[10px] text-muted-foreground">Amonestaciones</p>
              </CardContent>
            </Card>
            {/* Sanciones */}
            <Card className="rounded-xl border-border/30">
              <CardContent className="p-4 text-center">
                <ShieldAlert className="h-5 w-5 mx-auto mb-1 text-destructive" />
                <p className="text-2xl font-bold">{stats.sanciones?.length || 0}</p>
                <p className="text-[10px] text-muted-foreground">Sanciones</p>
              </CardContent>
            </Card>
            {/* Reconocimientos */}
            {incluirPositivas && (
              <Card className="rounded-xl border-border/30">
                <CardContent className="p-4 text-center">
                  <Star className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <p className="text-2xl font-bold">{stats.positivas?.length || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Reconocimientos</p>
                </CardContent>
              </Card>
            )}
            {/* Ratio */}
            <Card className="rounded-xl border-border/30">
              <CardContent className="p-4 text-center">
                {((stats.negativas?.length || 0) + (stats.amonestaciones?.length || 0) + (stats.sanciones?.length || 0)) > (stats.positivas?.length || 0)
                  ? <TrendingDown className="h-5 w-5 mx-auto mb-1 text-destructive" />
                  : <TrendingUp className="h-5 w-5 mx-auto mb-1 text-primary" />
                }
                <p className="text-2xl font-bold">
                  {(stats.positivas?.length || 0) > 0
                    ? ((stats.positivas?.length || 0) / Math.max(1, (stats.negativas?.length || 0) + (stats.amonestaciones?.length || 0) + (stats.sanciones?.length || 0) + (stats.positivas?.length || 0)) * 100).toFixed(0) + '%'
                    : '—'}
                </p>
                <p className="text-[10px] text-muted-foreground">Ratio positivo</p>
              </CardContent>
            </Card>
          </div>

          {/* Timeline summary */}
          <Card className="rounded-2xl border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Historial del periodo</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-1.5 max-h-72 overflow-y-auto">
              {[
                ...(stats.negativas || []).map((r: any) => ({ ...r, _type: 'neg', _date: r.fecha, _label: r.incidencias_categories?.name || 'Incidencia' })),
                ...(stats.positivas || []).map((r: any) => ({ ...r, _type: 'pos', _date: r.fecha, _label: r.incidencias_positive_categories?.name || 'Reconocimiento' })),
                ...(stats.amonestaciones || []).map((r: any) => ({ ...r, _type: 'amon', _date: r.fecha_evento?.split('T')[0] || r.fecha?.split('T')[0] || r.created_at?.split('T')[0] || '', _label: `Amonestación (${r.gravedad || '—'}) — ${r.incidencias_categories?.name || r.custom_category_name || ''}` })),
                ...(stats.sanciones || []).map((r: any) => ({ ...r, _type: 'sanc', _date: r.fecha_evento?.split('T')[0] || r.fecha?.split('T')[0] || r.created_at?.split('T')[0] || '', _label: `Sanción (${r.gravedad || '—'}) — ${r.suspension_dias || 0} días — ${r.incidencias_categories?.name || r.custom_category_name || ''}` })),
              ]
                .sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime())
                .slice(0, 50)
                .map((item: any, i: number) => {
                  const colorMap: Record<string, string> = {
                    pos: 'bg-primary/5',
                    neg: 'bg-amber-500/5',
                    amon: 'bg-orange-500/5',
                    sanc: 'bg-destructive/10',
                  };
                  const dotMap: Record<string, string> = {
                    pos: 'bg-primary',
                    neg: 'bg-amber-500',
                    amon: 'bg-orange-500',
                    sanc: 'bg-destructive',
                  };
                  return (
                    <div key={i} className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-xs", colorMap[item._type] || 'bg-muted/5')}>
                      <div className={cn("w-2 h-2 rounded-full shrink-0", dotMap[item._type] || 'bg-muted')} />
                      <span className="text-muted-foreground shrink-0 tabular-nums">{item._date ? format(new Date(item._date), 'dd/MM/yyyy') : '—'}</span>
                      <Badge variant="outline" className={cn("text-[10px] shrink-0", item._type === 'sanc' && 'border-destructive/30 text-destructive', item._type === 'amon' && 'border-orange-500/30 text-orange-600')}>
                        {item._type === 'pos' ? 'Positiva' : item._type === 'amon' ? 'Amonest.' : item._type === 'sanc' ? 'Sanción' : 'Incidencia'}
                      </Badge>
                      <span className="font-medium truncate flex-1">{item._label}</span>
                      <span className="text-muted-foreground truncate max-w-[200px]">{item.descripcion?.slice(0, 60) || ''}</span>
                    </div>
                  );
                })}
              {(stats.negativas?.length || 0) + (stats.positivas?.length || 0) + (stats.amonestaciones?.length || 0) + (stats.sanciones?.length || 0) === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Sin registros en este periodo</p>
              )}
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              onClick={() => generateReport("pdf")}
              disabled={reportLoading}
              className="rounded-xl gap-2 flex-1"
              variant="default"
            >
              {reportLoading && reportType === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Generar informe
            </Button>
            <Button
              onClick={() => generateReport("presentacion")}
              disabled={reportLoading}
              className="rounded-xl gap-2 flex-1"
              variant="outline"
            >
              {reportLoading && reportType === "presentacion" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Presentation className="h-4 w-4" />}
              Generar presentación
            </Button>
          </div>
        </div>
      )}

      {/* Report preview */}
      {reportHtml && reportType === "pdf" && (
        <Card className="rounded-2xl border-border/40 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">{reportType === "pdf" ? "Informe disciplinario" : "Presentación"}</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={printPdf}>
                <Download className="h-3.5 w-3.5" /> Descargar PDF
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReportHtml(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <iframe
              srcDoc={reportHtml}
              className="w-full border-0"
              style={{ minHeight: '600px', height: '80vh' }}
              title="Report"
            />
          </CardContent>
        </Card>
      )}

      <WorkerReportPresentation
        open={presentationOpen}
        worker={selectedWorker}
        stats={stats}
        fechaDesde={fechaDesde}
        fechaHasta={fechaHasta}
        incluirPositivas={incluirPositivas}
        onClose={() => setPresentationOpen(false)}
        onDownloadPdf={printPresentationPdf}
        pdfLoading={presentationPdfLoading}
      />
    </div>
  );
}
