import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Upload, CheckCircle2, XCircle, Loader2, FileSpreadsheet, AlertTriangle, Info } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const BENCHMARK_LINES_HOUR = 80;

type ParsedEntry = {
  workerNumber: string;
  workerName: string;
  linesHour: number;
  percentage: number;
  department: string;
  email: string;
};

type ImportResult = {
  matched: number;
  notFound: number;
  notFoundList: string[];
  total: number;
  date: string;
};

function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function getColorClass(pct: number): string {
  if (pct >= 100) return "text-primary";
  if (pct >= 75) return "text-amber-500";
  if (pct >= 50) return "text-orange-500";
  return "text-destructive";
}

function getBarColor(pct: number): string {
  if (pct >= 100) return "bg-primary";
  if (pct >= 75) return "bg-amber-500";
  if (pct >= 50) return "bg-orange-500";
  return "bg-destructive";
}

export function PerformanceImportPanel() {
  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Solo se permiten archivos CSV");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const lines = content.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast.error("CSV vacío"); return; }

      // Detect separator
      const firstLine = lines[0];
      let sep = ",";
      let inQ = false, sc = 0, cc = 0;
      for (const c of firstLine) {
        if (c === '"') inQ = !inQ;
        else if (!inQ) { if (c === ';') sc++; else if (c === ',') cc++; }
      }
      if (sc > 0 && sc >= cc) sep = ";";

      const headers = parseCSVLine(lines[0], sep).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
      
      // Find column indices
      const workerFkIdx = headers.findIndex(h => h === "workerfk");
      const workerIdx = headers.findIndex(h => h === "worker");
      const linesHourIdx = headers.findIndex(h => h === "lineshour");
      const nameIdx = headers.findIndex(h => h === "name");
      const emailIdx = headers.findIndex(h => h === "email");

      if (workerFkIdx === -1 || linesHourIdx === -1) {
        toast.error("CSV no tiene columnas 'workerFk' y 'linesHour'");
        return;
      }

      const parsed: ParsedEntry[] = [];
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i], sep);
        const deptName = nameIdx !== -1 ? row[nameIdx]?.replace(/^"|"$/g, '').trim() : "";
        
        // Only process SACADO H* departments
        if (!deptName.toUpperCase().startsWith("SACADO H")) continue;

        // Clean workerFk: remove thousands separator dots (39.808 → 39808)
        const rawWorkerFk = row[workerFkIdx]?.replace(/^"|"$/g, '').trim() || "";
        const workerNumber = rawWorkerFk.replace(/\./g, "");

        // Convert European decimal comma (107,24 → 107.24)
        const rawLinesHour = row[linesHourIdx]?.replace(/^"|"$/g, '').trim() || "0";
        const linesHour = parseFloat(rawLinesHour.replace(",", "."));
        if (isNaN(linesHour)) continue;

        const workerName = workerIdx !== -1 ? row[workerIdx]?.replace(/^"|"$/g, '').trim() : "";
        const email = emailIdx !== -1 ? row[emailIdx]?.replace(/^"|"$/g, '').trim() : "";
        const percentage = (linesHour / BENCHMARK_LINES_HOUR) * 100;

        parsed.push({ workerNumber, workerName, linesHour, percentage, department: deptName, email });
      }

      if (parsed.length === 0) {
        toast.error("No se encontraron registros de SACADO H en el CSV");
        return;
      }

      // Sort by linesHour desc
      parsed.sort((a, b) => b.linesHour - a.linesHour);
      setEntries(parsed);
      setStep("preview");
      toast.success(`${parsed.length} registros de Sacado H encontrados`);
    };
    reader.readAsText(file, "UTF-8");
  }, []);

  const handleImport = async () => {
    const sessionToken = localStorage.getItem("manager_session_token");
    if (!sessionToken) { toast.error("Sesión no válida"); return; }
    
    setImporting(true);
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "importPerformanceCSV",
          sessionToken,
          data: {
            entries: entries.map(e => ({
              workerNumber: e.workerNumber,
              linesHour: e.linesHour,
              workerName: e.workerName,
            })),
            date: new Date().toISOString().split("T")[0],
          }
        }
      });

      if (error) throw error;
      if (!response?.success) throw new Error(response?.error || "Error desconocido");

      setResult(response);
      setStep("result");
      toast.success(`Importación completada: ${response.matched} actualizados`);
    } catch (err: any) {
      toast.error(err.message || "Error al importar");
    } finally {
      setImporting(false);
    }
  };

  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const avg = entries.reduce((s, e) => s + e.linesHour, 0) / entries.length;
    const avgPct = (avg / BENCHMARK_LINES_HOUR) * 100;
    const green = entries.filter(e => e.percentage >= 100).length;
    const yellow = entries.filter(e => e.percentage >= 75 && e.percentage < 100).length;
    const orange = entries.filter(e => e.percentage >= 50 && e.percentage < 75).length;
    const red = entries.filter(e => e.percentage < 50).length;
    return { avg, avgPct, green, yellow, orange, red };
  }, [entries]);

  const reset = () => { setEntries([]); setStep("upload"); setResult(null); };

  if (step === "result" && result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Importación Completada
          </CardTitle>
          <CardDescription>Rendimiento Sacado H — {result.date}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-primary/10 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-primary">{result.matched}</p>
              <p className="text-sm text-muted-foreground">Actualizados</p>
            </div>
            <div className={cn("rounded-lg p-4 text-center", result.notFound > 0 ? "bg-destructive/10" : "bg-muted")}>
              <p className={cn("text-3xl font-bold", result.notFound > 0 ? "text-destructive" : "text-muted-foreground")}>{result.notFound}</p>
              <p className="text-sm text-muted-foreground">No encontrados</p>
            </div>
          </div>

          {result.notFoundList.length > 0 && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
              <p className="text-sm font-medium text-destructive mb-2 flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                Trabajadores no encontrados en la base de datos:
              </p>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {result.notFoundList.map((item, i) => <p key={i}>• {item}</p>)}
              </div>
            </div>
          )}

          <Button onClick={reset} variant="outline" className="w-full">Nueva importación</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          Importar Rendimiento — Sacado H
        </CardTitle>
        <CardDescription>
          Sube el CSV de rendimiento de Salix. Se procesarán solo los departamentos que empiecen por "SACADO H".
          Encajado H desactivado por el momento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === "upload" && (
          <div className="space-y-4">
            <div className="bg-muted/50 border-2 border-dashed rounded-xl p-8 text-center">
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Arrastra un CSV o haz clic para seleccionar
              </p>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                id="perf-csv-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" onClick={() => document.getElementById("perf-csv-input")?.click()}>
                Seleccionar archivo CSV
              </Button>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Referencia:</strong> 80 líneas/hora = 100%</p>
                <p>🟢 ≥100% | 🟡 75-99% | 🟠 50-74% | 🔴 &lt;50%</p>
                <p>El CSV se cruza por <code>workerFk</code> (número de fichar) con los trabajadores existentes.</p>
              </div>
            </div>
          </div>
        )}

        {step === "preview" && entries.length > 0 && stats && (
          <div className="space-y-4">
            {/* Stats summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{entries.length}</p>
                <p className="text-[10px] uppercase text-muted-foreground">Total</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-primary/10">
                <p className="text-2xl font-bold text-primary">{stats.green}</p>
                <p className="text-[10px] uppercase text-muted-foreground">≥100%</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-amber-500/10">
                <p className="text-2xl font-bold text-amber-500">{stats.yellow}</p>
                <p className="text-[10px] uppercase text-muted-foreground">75-99%</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-orange-500/10">
                <p className="text-2xl font-bold text-orange-500">{stats.orange}</p>
                <p className="text-[10px] uppercase text-muted-foreground">50-74%</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-destructive/10">
                <p className="text-2xl font-bold text-destructive">{stats.red}</p>
                <p className="text-[10px] uppercase text-muted-foreground">&lt;50%</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
              <span className="text-sm">Media: <strong className={getColorClass(stats.avgPct)}>{stats.avg.toFixed(2)} l/h</strong> ({stats.avgPct.toFixed(0)}%)</span>
            </div>

            {/* Preview table */}
            <ScrollArea className="h-[400px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-xs">#</TableHead>
                    <TableHead className="text-xs">Nº Fichar</TableHead>
                    <TableHead className="text-xs">Nombre</TableHead>
                    <TableHead className="text-xs">Departamento</TableHead>
                    <TableHead className="text-xs w-[200px]">Rendimiento</TableHead>
                    <TableHead className="text-xs text-right">L/H</TableHead>
                    <TableHead className="text-xs text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono text-muted-foreground py-2">{i + 1}</TableCell>
                      <TableCell className="text-xs font-mono py-2">
                        <a
                          href={`https://salix.verdnatura.es/#!/worker/${entry.workerNumber}/summary`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary transition-colors"
                        >
                          {entry.workerNumber}
                        </a>
                      </TableCell>
                      <TableCell className="text-xs py-2 font-medium">{entry.workerName}</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{entry.department}</TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", getBarColor(entry.percentage))}
                              style={{ width: `${Math.min(entry.percentage, 150)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className={cn("text-xs py-2 text-right font-mono font-bold tabular-nums", getColorClass(entry.percentage))}>
                        {entry.linesHour.toFixed(2)}
                      </TableCell>
                      <TableCell className={cn("text-xs py-2 text-right font-mono font-bold tabular-nums", getColorClass(entry.percentage))}>
                        {entry.percentage.toFixed(0)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex gap-3">
              <Button variant="outline" onClick={reset} className="flex-1">Cancelar</Button>
              <Button onClick={handleImport} disabled={importing} className="flex-1">
                {importing ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importando...</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" />Importar {entries.length} registros</>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
