import { useState, useCallback, useRef } from "react";
import { Upload, FileText, CheckCircle2, XCircle, Loader2, ArrowRight, RotateCcw, AlertTriangle, Settings2, Trash2, Users, TrendingUp, Eye, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ParsedRow {
  raw: Record<string, string>;
  worker_name?: string;
  worker_number?: string;
  resolved_worker_name?: string;
  department_name?: string;
  category_name?: string;
  description?: string;
  date?: string;
  tipo?: string;
  importe?: string;
  ticket_id?: string;
  claim_id?: string;
  motivo?: string;
  consecuencia?: string;
  devolucion?: string;
  mapped_worker_id?: string;
  mapped_department_id?: string;
  mapped_category_id?: string;
  status: "pending" | "mapped" | "partial" | "error";
  error?: string;
}

interface ImportResult {
  created: number;
  errors: number;
  skipped: number;
  details: string[];
}

interface SimulationWorkerRow {
  index: number;
  categoryName: string;
  gravedad: string;
  puntos: number;
  description: string;
  date: string;
  importe: number;
  esCritico: boolean;
}

interface SimulationWorker {
  worker_id: string;
  worker_name: string;
  worker_number: string;
  incidencias_count: number;
  puntos_actuales: number;
  puntos_nuevos: number;
  umbral: number;
  genera_propuesta: boolean;
  tipo_propuesta: string | null;
  regla_descripcion: string;
  importe_total: number;
  rows: SimulationWorkerRow[];
}

interface SimulationResult {
  workers: SimulationWorker[];
  unresolved: { index: number; workerName: string; workerNumber: string; error: string }[];
  summary: {
    total_workers: number;
    total_incidencias: number;
    total_propuestas: number;
    total_unresolved: number;
  };
}

type Step = "upload" | "mapping" | "preview" | "simulation" | "result";

const COLUMN_TARGETS = [
  { key: "worker_name", label: "Nombre trabajador" },
  { key: "worker_number", label: "Nº trabajador" },
  { key: "department_name", label: "Departamento" },
  { key: "category_name", label: "Categoría" },
  { key: "description", label: "Descripción" },
  { key: "date", label: "Fecha" },
  { key: "tipo", label: "Tipo (incidencia/amonestación/sanción)" },
  { key: "importe", label: "Importe (pérdida €)" },
  { key: "ticket_id", label: "Ticket (Salix)" },
  { key: "claim_id", label: "Reclamación ID (Salix)" },
  { key: "motivo", label: "Motivo" },
  { key: "consecuencia", label: "Consecuencia" },
  { key: "devolucion", label: "Devolución" },
  { key: "__skip__", label: "— Ignorar —" },
];

const SALIX_HEADER_MAP: Record<string, string> = {
  "Importe": "importe",
  "Importe sens.": "__skip__",
  "Id": "claim_id",
  "Ticket": "ticket_id",
  "Responsable": "__skip__",
  "Motivo": "motivo",
  "Consecuencia": "category_name",
  "Creación": "date",
  "IdTrabajador": "worker_number",
  "workerFk": "worker_number",
  "Trabajador": "__skip__",
  "itemPackingTypeFk": "__skip__",
  "UPPER(LitemPackingT": "__skip__",
  "code": "__skip__",
  "pickup": "__skip__",
  "Agencia": "__skip__",
  "Zona": "__skip__",
  "Estado": "__skip__",
  "Observaciones": "__skip__",
  "Cliente": "__skip__",
  "Devolución": "devolucion",
  "Equipo": "__skip__",
  "userFk": "__skip__",
  "Cre. del Ticket": "__skip__",
  "attendedBy": "__skip__",
  "resolvedBy": "__skip__",
};

function isSalixFormat(headers: string[]): boolean {
  const coreHeaders = ["Importe", "Ticket", "Motivo", "Consecuencia"];
  const hasWorkerField = headers.includes("IdTrabajador") || headers.includes("workerFk");
  return coreHeaders.every(h => headers.includes(h)) && hasWorkerField;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headerLine = lines[0];
  const sep = headerLine.includes("\t") ? "\t" : headerLine.includes(";") ? ";" : ",";

  function splitRow(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === sep) { result.push(current.trim()); current = ""; }
        else { current += ch; }
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = splitRow(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
    rows.push(row);
  }
  return { headers, rows };
}

export function AdminCSVImportTab() {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
  const [fileName, setFileName] = useState("");
  const [isSalix, setIsSalix] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [workerMap, setWorkerMap] = useState<Record<string, { found: boolean; name: string }>>({});

  const fetchWorkerValidation = useCallback(async (rows: Record<string, string>[], mapping: Record<string, string>) => {
    const wnCol = Object.entries(mapping).find(([, t]) => t === "worker_number")?.[0];
    if (!wnCol) return;
    const numbers = [...new Set(rows.map(r => r[wnCol]).filter(Boolean))];
    if (numbers.length === 0) return;
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "validateCSVWorkers", sessionToken, workerNumbers: numbers },
      });
      if (data?.success && data.workers) setWorkerMap(data.workers);
    } catch { console.error("Error validating workers"); }
  }, [sessionToken]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (headers.length === 0 || rows.length === 0) { toast.error("CSV vacío o formato no válido"); return; }
      setCsvHeaders(headers);
      setCsvRows(rows);
      const salixDetected = isSalixFormat(headers);
      setIsSalix(salixDetected);
      if (salixDetected) {
        const fixedMap: Record<string, string> = {};
        headers.forEach((h) => { fixedMap[h] = SALIX_HEADER_MAP[h] || "__skip__"; });
        setColumnMapping(fixedMap);
        setShowMapping(false);
        await fetchWorkerValidation(rows, fixedMap);
        setStep("preview");
        toast.success("Formato Salix detectado — mapeo automático aplicado");
      } else {
        const autoMap: Record<string, string> = {};
        const mappings: [string[], string][] = [
          [["nombre", "worker", "empleado", "name"], "worker_name"],
          [["idtrabajador", "numero", "nº", "num", "number", "id_trabajador"], "worker_number"],
          [["departamento", "department", "dept", "seccion", "sección"], "department_name"],
          [["categoria", "categoría", "category", "tipo_incidencia"], "category_name"],
          [["descripcion", "descripción", "description", "detalle"], "description"],
          [["fecha", "date", "dia", "día", "creación", "creacion"], "date"],
          [["importe", "amount", "pérdida", "perdida", "coste"], "importe"],
          [["ticket"], "ticket_id"],
          [["motivo", "reason"], "motivo"],
          [["consecuencia", "consequence"], "consecuencia"],
          [["devolución", "devolucion", "return"], "devolucion"],
        ];
        headers.forEach((header) => {
          const lower = header.toLowerCase();
          for (const [keywords, target] of mappings) {
            if (keywords.some((k) => lower.includes(k)) && !Object.values(autoMap).includes(target)) {
              autoMap[header] = target;
              return;
            }
          }
          autoMap[header] = "__skip__";
        });
        setColumnMapping(autoMap);
        setShowMapping(true);
        setStep("mapping");
      }
    };
    reader.readAsText(file);
  }, [fetchWorkerValidation]);

  const buildParsedRows = useCallback((): ParsedRow[] => {
    return csvRows.map((raw) => {
      const row: ParsedRow = { raw, status: "pending" };
      for (const [csvCol, target] of Object.entries(columnMapping)) {
        if (target === "__skip__") continue;
        (row as any)[target] = raw[csvCol] || "";
      }
      if (!row.description && (row.motivo || row.consecuencia)) {
        row.description = [row.motivo, row.consecuencia].filter(Boolean).join(": ");
      }
      if (row.worker_number && workerMap[row.worker_number]) {
        const wm = workerMap[row.worker_number];
        if (wm.found) row.resolved_worker_name = wm.name;
      }
      if (!row.worker_name && !row.worker_number) { row.status = "error"; row.error = "Sin nombre ni número de trabajador"; }
      else if (!row.description) { row.status = "partial"; row.error = "Sin descripción"; }
      else { row.status = "mapped"; }
      return row;
    });
  }, [csvRows, columnMapping, workerMap]);

  const buildRowPayload = (rows: ParsedRow[]) =>
    rows.filter((r) => r.status !== "error").map((r) => {
      const isWorkerFound = r.worker_number ? workerMap[r.worker_number]?.found !== false : true;
      return {
        worker_name: r.worker_name || "",
        worker_number: r.worker_number || "",
        department_name: r.department_name || "",
        category_name: r.category_name || "",
        description: r.description || "",
        date: r.date || "",
        tipo: r.tipo || "incidencia",
        importe: r.importe || "",
        ticket_id: r.ticket_id || "",
        claim_id: r.claim_id || "",
        motivo: r.motivo || "",
        consecuencia: r.consecuencia || "",
        devolucion: r.devolucion || "",
        worker_pending: !isWorkerFound,
      };
    });

  const handleSimulate = async () => {
    const rows = buildParsedRows();
    const payload = buildRowPayload(rows);
    if (payload.length === 0) { toast.error("No hay filas válidas para simular"); return; }
    setSimulating(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "simulateCSVImport", sessionToken, rows: payload },
      });
      if (data?.success) {
        setSimulationResult(data as SimulationResult);
        setRemovedIndices(new Set());
        setExpandedWorker(null);
        setStep("simulation");
        toast.success("Simulación completada");
      } else {
        toast.error(data?.error || "Error en la simulación");
      }
    } catch { toast.error("Error al simular"); }
    finally { setSimulating(false); }
  };

  const handleImport = async () => {
    const rows = buildParsedRows();
    setParsedRows(rows);
    setImporting(true);
    try {
      // If coming from simulation, filter out removed indices
      let payload = buildRowPayload(rows);
      if (removedIndices.size > 0) {
        payload = payload.filter((_, i) => !removedIndices.has(i));
      }
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "importCSV", sessionToken, rows: payload },
      });
      if (data?.success) {
        setResult({ created: data.created || 0, errors: data.errors || 0, skipped: data.skipped || 0, details: data.details || [] });
        setStep("result");
        toast.success(`Importados ${data.created} registros`);
      } else { toast.error(data?.error || "Error en la importación"); }
    } catch { toast.error("Error al importar"); }
    finally { setImporting(false); }
  };

  const handleRemoveSimRow = (workerIdx: string, rowIndex: number) => {
    setRemovedIndices(prev => new Set(prev).add(rowIndex));
    // Also update simulation result locally
    if (simulationResult) {
      const updated = { ...simulationResult };
      updated.workers = updated.workers.map(w => {
        if (w.worker_id !== workerIdx) return w;
        const newRows = w.rows.filter(r => r.index !== rowIndex);
        const newPuntos = w.puntos_actuales + newRows.reduce((s, r) => s + r.puntos, 0);
        return {
          ...w,
          rows: newRows,
          incidencias_count: newRows.length,
          puntos_nuevos: newPuntos,
          genera_propuesta: newRows.some(r => r.esCritico) || newPuntos >= w.umbral,
          tipo_propuesta: newRows.some(r => r.esCritico) ? 'sancion' : (newPuntos >= w.umbral ? 'amonestacion' : null),
        };
      }).filter(w => w.rows.length > 0);
      updated.summary = {
        total_workers: updated.workers.length,
        total_incidencias: updated.workers.reduce((s, w) => s + w.incidencias_count, 0),
        total_propuestas: updated.workers.filter(w => w.genera_propuesta).length,
        total_unresolved: updated.unresolved.length,
      };
      setSimulationResult(updated);
    }
  };

  const reset = () => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMapping({});
    setParsedRows([]);
    setResult(null);
    setSimulationResult(null);
    setRemovedIndices(new Set());
    setExpandedWorker(null);
    setFileName("");
    setIsSalix(false);
    setShowMapping(false);
    setWorkerMap({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const allParsedRows = buildParsedRows();
  const sortedRows = [...allParsedRows].sort((a, b) => {
    if (a.status === "error" && b.status !== "error") return 1;
    if (a.status !== "error" && b.status === "error") return -1;
    return 0;
  });
  const previewRows = sortedRows;
  const errorCount = allParsedRows.filter((r) => r.status === "error").length;
  const pendingWorkerCount = allParsedRows.filter((r) => r.worker_number && workerMap[r.worker_number]?.found === false).length;
  const mappedCount = allParsedRows.filter((r) => r.status === "mapped" || r.status === "partial").length;

  const renderMappingPanel = () => (
    <Card className="rounded-2xl border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Mapeo de columnas — {fileName}
          </span>
          <Badge variant="secondary" className="text-[10px]">{csvRows.length} filas</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">Asigna cada columna del CSV al campo correspondiente.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {csvHeaders.map((header) => (
            <div key={header} className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] px-2 shrink-0 max-w-[120px] truncate">{header}</Badge>
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              <Select value={columnMapping[header] || "__skip__"} onValueChange={(v) => setColumnMapping((prev) => ({ ...prev, [header]: v }))}>
                <SelectTrigger className="h-8 rounded-lg text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLUMN_TARGETS.map((t) => (<SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        {step === "mapping" && (
          <Button size="sm" className="rounded-xl gap-1" onClick={() => setStep("preview")}>
            <ArrowRight className="h-3.5 w-3.5" /> Continuar a previsualización
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* Step indicators */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        <Badge className={cn("px-2 py-0.5", step === "upload" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>1. Subir CSV</Badge>
        <ArrowRight className="h-3 w-3" />
        <Badge className={cn("px-2 py-0.5", (step === "mapping" || step === "preview") ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>2. Previsualizar</Badge>
        <ArrowRight className="h-3 w-3" />
        <Badge className={cn("px-2 py-0.5", step === "simulation" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>3. Simulación</Badge>
        <ArrowRight className="h-3 w-3" />
        <Badge className={cn("px-2 py-0.5", step === "result" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>4. Resultados</Badge>
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />
              Importar CSV de incidencias
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Sube un archivo CSV con las incidencias. El formato Salix se detecta automáticamente y se mapea sin intervención.
            </p>
            <div
              className="border-2 border-dashed border-border/50 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium">Haz clic o arrastra un archivo CSV</p>
              <p className="text-xs text-muted-foreground mt-1">Soporta separadores , y ; con codificación UTF-8</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileSelect} />
          </CardContent>
        </Card>
      )}

      {/* Step: Manual mapping (non-Salix CSVs) */}
      {step === "mapping" && renderMappingPanel()}

      {/* Step 2: Preview */}
      {(step === "preview") && (
        <>
          {isSalix && showMapping && renderMappingPanel()}
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Previsualización — {fileName}
                  {isSalix && <Badge className="text-[9px] bg-primary/10 text-primary border-0 ml-1">Salix auto</Badge>}
                </span>
                <div className="flex items-center gap-2">
                  <Badge className="text-[10px] bg-primary/10 text-primary border-0">{mappedCount} OK</Badge>
                  {pendingWorkerCount > 0 && <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-0">{pendingWorkerCount} sin trabajador (ocultos)</Badge>}
                  {errorCount > 0 && <Badge className="text-[10px] bg-destructive/10 text-destructive border-0">{errorCount} errores</Badge>}
                  {isSalix && !showMapping && (
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 px-2" onClick={() => setShowMapping(true)}>
                      <Settings2 className="h-3 w-3" /> Editar mapeo
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-380px)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Estado</TableHead>
                      <TableHead className="text-[10px]">Nº Trab.</TableHead>
                      <TableHead className="text-[10px]">Trabajador</TableHead>
                      <TableHead className="text-[10px]">Categoría</TableHead>
                      <TableHead className="text-[10px]">Fecha</TableHead>
                      <TableHead className="text-[10px]">Importe</TableHead>
                      <TableHead className="text-[10px]">Ticket</TableHead>
                      <TableHead className="text-[10px]">Reclamación</TableHead>
                      <TableHead className="text-[10px]">Motivo</TableHead>
                      <TableHead className="text-[10px]">Devolución</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, i) => (
                      <TableRow key={i} className={cn(row.status === "error" && "bg-destructive/5")}>
                        <TableCell>
                          {row.status === "mapped" && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                          {row.status === "partial" && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                          {row.status === "error" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.worker_number ? (
                            <a href={`https://salix.verdnatura.es/#/worker/${row.worker_number}/summary`} target="_blank" rel="noopener noreferrer" className="text-primary underline">{row.worker_number}</a>
                          ) : row.worker_name || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.resolved_worker_name || row.worker_name || (row.worker_number && workerMap[row.worker_number]?.found === false ? <span className="text-amber-500 text-[10px]">No encontrado (se importará oculto)</span> : "—")}
                        </TableCell>
                        <TableCell className="text-xs">{row.category_name || row.consecuencia || "—"}</TableCell>
                        <TableCell className="text-xs">{row.date || "—"}</TableCell>
                        <TableCell className="text-xs font-medium text-destructive">{row.importe ? `€${row.importe}` : "—"}</TableCell>
                        <TableCell className="text-xs">
                          {row.ticket_id ? (<a href={`https://salix.verdnatura.es/#/ticket/${row.ticket_id}/summary`} target="_blank" rel="noopener noreferrer" className="text-primary underline">{row.ticket_id}</a>) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.claim_id ? (<a href={`https://salix.verdnatura.es/#/claim/${row.claim_id}/summary`} target="_blank" rel="noopener noreferrer" className="text-primary underline">{row.claim_id}</a>) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{row.motivo || "—"}</TableCell>
                        <TableCell className="text-xs">{row.devolucion || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="flex gap-2 sticky bottom-0 py-3 bg-background z-10">
            <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={handleSimulate} disabled={simulating || mappedCount === 0}>
              {simulating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Simular impacto
            </Button>
            <Button size="sm" className="rounded-xl gap-1" onClick={handleImport} disabled={importing || mappedCount === 0}>
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Importar directamente {mappedCount} registros
              {errorCount > 0 && <span className="text-[10px] opacity-70">({errorCount} excluidos)</span>}
            </Button>
          </div>
        </>
      )}

      {/* Step 3: Simulation */}
      {step === "simulation" && simulationResult && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="rounded-2xl border-border/50">
              <CardContent className="p-4 text-center">
                <Users className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-2xl font-bold text-primary">{simulationResult.summary.total_workers}</p>
                <p className="text-[10px] text-muted-foreground">Trabajadores afectados</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border/50">
              <CardContent className="p-4 text-center">
                <FileText className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
                <p className="text-2xl font-bold">{simulationResult.summary.total_incidencias}</p>
                <p className="text-[10px] text-muted-foreground">Incidencias a crear</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border/50">
              <CardContent className="p-4 text-center">
                <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-amber-600">{simulationResult.summary.total_propuestas}</p>
                <p className="text-[10px] text-muted-foreground">Propuestas generadas</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border/50">
              <CardContent className="p-4 text-center">
                <XCircle className="h-5 w-5 text-destructive mx-auto mb-1" />
                <p className="text-2xl font-bold text-destructive">{simulationResult.summary.total_unresolved}</p>
                <p className="text-[10px] text-muted-foreground">No resueltos</p>
              </CardContent>
            </Card>
          </div>

          {/* Workers table */}
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Impacto por trabajador
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-480px)]">
                <div className="space-y-2">
                  {simulationResult.workers.map((w) => (
                    <div key={w.worker_id} className="rounded-xl border border-border/50 overflow-hidden">
                      {/* Worker header */}
                      <div
                        className={cn(
                          "flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors",
                          w.genera_propuesta && "bg-amber-500/5"
                        )}
                        onClick={() => setExpandedWorker(expandedWorker === w.worker_id ? null : w.worker_id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{w.worker_name}</span>
                            <Badge variant="outline" className="text-[9px] px-1.5">{w.worker_number}</Badge>
                            <Badge variant="secondary" className="text-[9px]">{w.incidencias_count} inc.</Badge>
                            {w.genera_propuesta && (
                              <Badge className={cn("text-[9px]", w.tipo_propuesta === 'sancion' ? "bg-destructive/10 text-destructive border-0" : "bg-amber-500/10 text-amber-600 border-0")}>
                                → {w.tipo_propuesta === 'sancion' ? 'Sanción' : 'Amonestación'}
                              </Badge>
                            )}
                          </div>
                          {w.regla_descripcion && <p className="text-[10px] text-muted-foreground mt-0.5">{w.regla_descripcion}</p>}
                        </div>

                        {/* Points bar */}
                        <div className="w-40 shrink-0">
                          <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
                            <span>{w.puntos_actuales} → {w.puntos_nuevos} pts</span>
                            <span>/{w.umbral}</span>
                          </div>
                          <div className="relative">
                            <Progress value={Math.min((w.puntos_nuevos / w.umbral) * 100, 100)} className="h-2" />
                            {w.puntos_actuales > 0 && (
                              <div
                                className="absolute top-0 h-2 bg-muted-foreground/30 rounded-full"
                                style={{ width: `${Math.min((w.puntos_actuales / w.umbral) * 100, 100)}%` }}
                              />
                            )}
                          </div>
                        </div>

                        {w.importe_total > 0 && (
                          <Badge variant="outline" className="text-[10px] text-destructive shrink-0">€{w.importe_total.toFixed(2)}</Badge>
                        )}
                      </div>

                      {/* Expanded rows */}
                      {expandedWorker === w.worker_id && (
                        <div className="border-t border-border/50 bg-muted/10">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-[9px] py-1">Categoría</TableHead>
                                <TableHead className="text-[9px] py-1">Gravedad</TableHead>
                                <TableHead className="text-[9px] py-1">Puntos</TableHead>
                                <TableHead className="text-[9px] py-1">Fecha</TableHead>
                                <TableHead className="text-[9px] py-1">Importe</TableHead>
                                <TableHead className="text-[9px] py-1">Descripción</TableHead>
                                <TableHead className="text-[9px] py-1 w-8"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {w.rows.map((r) => (
                                <TableRow key={r.index} className="text-[11px]">
                                  <TableCell className="py-1">
                                    {r.categoryName || "—"}
                                    {r.esCritico && <Badge className="text-[8px] bg-destructive/10 text-destructive border-0 ml-1">Crítico</Badge>}
                                  </TableCell>
                                  <TableCell className="py-1">{r.gravedad}</TableCell>
                                  <TableCell className="py-1 font-medium">{r.puntos}</TableCell>
                                  <TableCell className="py-1">{r.date || "—"}</TableCell>
                                  <TableCell className="py-1 text-destructive">{r.importe > 0 ? `€${r.importe.toFixed(2)}` : "—"}</TableCell>
                                  <TableCell className="py-1 max-w-[200px] truncate">{r.description || "—"}</TableCell>
                                  <TableCell className="py-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-destructive/60 hover:text-destructive"
                                      onClick={(e) => { e.stopPropagation(); handleRemoveSimRow(w.worker_id, r.index); }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Unresolved rows */}
                  {simulationResult.unresolved.length > 0 && (
                    <div className="rounded-xl border border-destructive/20 p-3">
                      <p className="text-xs font-medium text-destructive mb-2">
                        {simulationResult.unresolved.length} filas sin resolver
                      </p>
                      <div className="space-y-1">
                        {simulationResult.unresolved.slice(0, 10).map((u, i) => (
                          <p key={i} className="text-[10px] text-muted-foreground">
                            Fila {u.index + 1}: {u.workerNumber || u.workerName || '—'} — {u.error}
                          </p>
                        ))}
                        {simulationResult.unresolved.length > 10 && (
                          <p className="text-[10px] text-muted-foreground">...y {simulationResult.unresolved.length - 10} más</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="flex gap-2 sticky bottom-0 py-3 bg-background z-10">
            <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={() => setStep("preview")}>
              <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Volver al preview
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button size="sm" className="rounded-xl gap-1" onClick={handleImport} disabled={importing || simulationResult.summary.total_incidencias === 0}>
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Aplicar todo — {simulationResult.summary.total_incidencias} registros
              {simulationResult.summary.total_propuestas > 0 && (
                <span className="text-[10px] opacity-70">({simulationResult.summary.total_propuestas} propuestas)</span>
              )}
            </Button>
          </div>
        </>
      )}

      {/* Step 4: Results */}
      {step === "result" && result && (
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Importación completada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-primary/10 p-4 text-center">
                <p className="text-2xl font-bold text-primary">{result.created}</p>
                <p className="text-xs text-muted-foreground">Creados</p>
              </div>
              <div className="rounded-xl bg-amber-500/10 p-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">Omitidos</p>
              </div>
              <div className="rounded-xl bg-destructive/10 p-4 text-center">
                <p className="text-2xl font-bold text-destructive">{result.errors}</p>
                <p className="text-xs text-muted-foreground">Errores</p>
              </div>
            </div>
            {result.details.length > 0 && (
              <ScrollArea className="h-[200px] rounded-xl border border-border/50 p-3">
                <div className="space-y-1">
                  {result.details.map((d, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground">{d}</p>
                  ))}
                </div>
              </ScrollArea>
            )}
            <Button size="sm" className="rounded-xl gap-1" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" /> Nueva importación
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
