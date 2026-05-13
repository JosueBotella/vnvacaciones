import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileText, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";

interface ImportRecord {
  id: string;
  worker: string;
  total: number;
  totalNoNegative?: number;
  matched?: boolean;
}

interface Props {
  onImportComplete: () => void;
}

export function BalanceImportTab({ onImportComplete }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "complete">("upload");
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [notes, setNotes] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<{
    total_csv: number;
    imported: number;
    ignored: number;
  } | null>(null);

  const parseCSV = (content: string): ImportRecord[] => {
    const lines = content.trim().split("\n");
    if (lines.length < 2) return [];

    // Find the first data line (starts with a number as ID)
    let dataStartIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Check if line starts with a numeric ID (possibly quoted)
      const firstValue = line.split(",")[0].replace(/"/g, "").trim();
      if (/^\d+$/.test(firstValue)) {
        dataStartIndex = i;
        break;
      }
    }

    if (dataStartIndex === 0) {
      throw new Error("No se encontraron datos válidos en el CSV");
    }

    const records: ImportRecord[] = [];
    for (let i = dataStartIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Parse CSV line handling quoted values
      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      // Expected format: id, worker, formatted_hours, total, totalNoNegative
      // We need: id (index 0), worker (index 1), total (index 3)
      const id = values[0]?.replace(/"/g, "");
      const worker = values[1]?.replace(/"/g, "") || "";
      const totalStr = values[3]?.replace(/"/g, ""); // Column "total" is at index 3

      if (id && totalStr) {
        const totalRaw = parseFloat(totalStr.replace(",", "."));
        if (!isNaN(totalRaw)) {
          // Round up (ceiling) - for negatives this means towards zero, for positives away from zero
          const total = totalRaw < 0 ? Math.floor(totalRaw) : Math.ceil(totalRaw);
          records.push({ id, worker, total });
        }
      }
    }

    return records;
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const content = await file.text();
      const parsed = parseCSV(content);

      if (parsed.length === 0) {
        throw new Error("No se encontraron registros válidos en el CSV");
      }

      // Check which workers exist
      const sessionToken = localStorage.getItem("manager_session_token") || localStorage.getItem("managerSessionToken");
      const { data, error } = await supabase.functions.invoke("hour-balance-operations", {
        body: { action: "getBalances", sessionToken },
      });

      if (error) throw error;

      const existingNumbers = new Set(data.data?.map((w: any) => w.worker_number) || []);

      // Mark matched records
      const markedRecords = parsed.map((r) => ({
        ...r,
        matched: existingNumbers.has(r.id),
      }));

      setRecords(markedRecords);
      setStep("preview");
    } catch (error: any) {
      toast({
        title: "Error al procesar CSV",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [toast]);

  const handleImport = async () => {
    setStep("importing");
    try {
      const sessionToken = localStorage.getItem("manager_session_token") || localStorage.getItem("managerSessionToken");
      const recordsToImport = records.map(({ id, worker, total }) => ({ id, worker, total }));

      const { data, error } = await supabase.functions.invoke("hour-balance-operations", {
        body: {
          action: "importCSV",
          sessionToken,
          records: recordsToImport,
          notes: notes || null,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setImportResult(data.data);
      setStep("complete");
      toast({
        title: "Importación completada",
        description: `${data.data.imported} registros importados`,
      });
    } catch (error: any) {
      toast({
        title: "Error al importar",
        description: error.message,
        variant: "destructive",
      });
      setStep("preview");
    }
  };

  const resetImport = () => {
    setStep("upload");
    setRecords([]);
    setNotes("");
    setImportResult(null);
  };

  const matchedCount = records.filter((r) => r.matched).length;
  const ignoredCount = records.filter((r) => !r.matched).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Importar Balance de Horas
        </CardTitle>
        <CardDescription>
          Sube un archivo CSV con los balances de horas de los trabajadores
        </CardDescription>
      </CardHeader>

      <CardContent>
        {step === "upload" && (
          <div className="space-y-6">
            <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">Arrastra un archivo CSV aquí</p>
              <p className="text-sm text-muted-foreground mb-4">
                o haz clic para seleccionar
              </p>
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="max-w-xs mx-auto"
              />
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium">Formato esperado del CSV:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Columna <code className="bg-muted px-1 rounded">id</code>: ID/número del trabajador</li>
                <li>• Columna <code className="bg-muted px-1 rounded">total</code>: Balance de horas (positivo o negativo)</li>
                <li>• Columna <code className="bg-muted px-1 rounded">worker</code> (opcional): Nombre del trabajador</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Solo se importarán los trabajadores que existan en el sistema.
              </p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="flex flex-wrap gap-4">
              <Badge variant="outline" className="text-base px-4 py-2">
                <FileText className="h-4 w-4 mr-2" />
                Total en CSV: {records.length}
              </Badge>
              <Badge className="bg-primary/20 text-primary text-base px-4 py-2">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                A importar: {matchedCount}
              </Badge>
              {ignoredCount > 0 && (
                <Badge variant="secondary" className="text-base px-4 py-2">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Se ignorarán: {ignoredCount}
                </Badge>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Nota de importación (opcional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Añade una nota para identificar esta importación..."
                rows={2}
              />
            </div>

            {/* Preview table */}
            <div className="max-h-80 overflow-y-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.slice(0, 100).map((record, idx) => (
                    <TableRow key={idx} className={!record.matched ? "opacity-50" : ""}>
                      <TableCell>
                        {record.matched ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono">{record.id}</TableCell>
                      <TableCell>{record.worker || "-"}</TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={record.total < 0 ? "text-destructive" : "text-primary"}>
                          {record.total >= 0 ? "+" : ""}{record.total.toFixed(1)}h
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {records.length > 100 && (
                <p className="text-center text-sm text-muted-foreground py-2">
                  Mostrando 100 de {records.length} registros
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <Button variant="outline" onClick={resetImport}>
                Cancelar
              </Button>
              <Button onClick={handleImport} disabled={matchedCount === 0}>
                Importar {matchedCount} registros
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="text-center py-12">
            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-lg font-medium">Importando balances...</p>
            <p className="text-sm text-muted-foreground">Por favor, espera</p>
          </div>
        )}

        {step === "complete" && importResult && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-primary" />
              <h3 className="text-2xl font-bold mb-2">Importación completada</h3>
              <p className="text-muted-foreground">
                Los balances han sido actualizados correctamente
              </p>
            </div>

            <div className="flex justify-center gap-4">
              <Badge variant="outline" className="text-base px-4 py-2">
                Total CSV: {importResult.total_csv}
              </Badge>
              <Badge className="bg-primary/20 text-primary text-base px-4 py-2">
                Importados: {importResult.imported}
              </Badge>
              {importResult.ignored > 0 && (
                <Badge variant="secondary" className="text-base px-4 py-2">
                  Ignorados: {importResult.ignored}
                </Badge>
              )}
            </div>

            <div className="flex justify-center gap-4">
              <Button variant="outline" onClick={resetImport}>
                Importar otro archivo
              </Button>
              <Button onClick={onImportComplete}>
                Ver balances
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
