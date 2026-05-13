import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle, XCircle, Link2, ChevronDown, Trash2, Brain, BookOpen, Sparkles, DollarSign, MessageCircle, Send, Bot, User, Search, History, Clock, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Product = {
  nombre: string;
  cantidad_total_stems: number;
  unidad_original: string;
  cantidad_original: number;
  stems_por_unidad: number;
  referencia?: string | null;
  precio_unitario?: number | null;
  precio_unidad?: string | null;
  altura?: number | null;
  // backward compat
  cantidad?: number;
  unidad?: string;
};

type MatchResult = {
  internalProduct: Product;
  supplierProduct: Product;
  matchType: "mapping" | "fuzzy" | "ai";
  quantityMatch: boolean;
  heightMatch?: boolean | null;
  confidence?: string;
  internalPricePerStem?: number | null;
  supplierPricePerStem?: number | null;
  priceMatch?: boolean | null;
};

type ComparisonResult = {
  matched: MatchResult[];
  onlyInternal: Product[];
  onlySupplier: Product[];
};

const getStems = (p: Product): number => p.cantidad_total_stems ?? p.cantidad ?? 0;

const getHeightMatchLocal = (ip: Product, sp: Product): boolean | null => {
  if (ip.altura == null && sp.altura == null) return null;
  if (ip.altura == null || sp.altura == null) return false;
  return ip.altura === sp.altura;
};

const formatQty = (p: Product): string => {
  const stems = getStems(p);
  const unit = p.unidad_original || p.unidad || "uds";
  const orig = p.cantidad_original ?? p.cantidad;
  if (p.stems_por_unidad && p.stems_por_unidad > 1) {
    return `${stems} stems (${orig} ${unit})`;
  }
  return `${stems} ${unit}`;
};

const formatPrice = (pricePerStem: number | null | undefined): string => {
  if (pricePerStem == null) return "—";
  return `${pricePerStem.toFixed(4)} €/stem`;
};

const formatOriginalPrice = (p: Product): string => {
  if (p.precio_unitario == null) return "";
  const unitLabel: Record<string, string> = {
    per_stem: "/stem",
    per_bunch: "/bunch",
    per_box: "/caja",
    per_kg: "/kg",
    per_unit: "/ud",
    unknown: "",
  };
  return `(${p.precio_unitario.toFixed(2)}€${unitLabel[p.precio_unidad || "unknown"] || ""})`;
};

type SavedMapping = {
  id: string;
  supplier_name: string;
  supplier_product_name: string;
  internal_product_name: string;
  created_at: string;
};

type SupplierSummary = {
  id: string;
  name: string;
  total_comparisons: number;
  last_comparison_at: string | null;
};

type SupplierCard = {
  id: string;
  name: string;
  aliases: string[];
  notes: string;
  ai_learnings: { date: string; lesson: string }[];
  product_catalog: string[];
  total_comparisons: number;
  last_comparison_at: string | null;
};
type ChatMessage = {
  id: string;
  supplier_name: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type ErrorLogEntry = {
  id: string;
  timestamp: string;
  action: string;
  error: string;
  details?: string;
};

const ERROR_LOG_KEY = "invoice-matching-error-log";

const loadErrorLog = (): ErrorLogEntry[] => {
  try {
    return JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || "[]");
  } catch { return []; }
};

const saveErrorLog = (entries: ErrorLogEntry[]) => {
  localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(entries.slice(0, 100)));
};

export function InvoiceMatchingPanel() {
  const { toast } = useToast();
  const [supplierName, setSupplierName] = useState("");
  const [internalFile, setInternalFile] = useState<File | null>(null);
  const [supplierFile, setSupplierFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [detectingSupplier, setDetectingSupplier] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);

  const [selectedInternal, setSelectedInternal] = useState<number | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<number | null>(null);
  const [internalSearch, setInternalSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");

  const [savedMappings, setSavedMappings] = useState<SavedMapping[]>([]);
  const [mappingsOpen, setMappingsOpen] = useState(false);

  const [knownSuppliers, setKnownSuppliers] = useState<SupplierSummary[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [supplierCard, setSupplierCard] = useState<SupplierCard | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");

  const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>(loadErrorLog);
  const [errorLogOpen, setErrorLogOpen] = useState(false);

  const logError = useCallback((action: string, error: any, details?: string) => {
    const entry: ErrorLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      error: error instanceof Error ? error.message : String(error),
      details: details || (error instanceof Error ? error.stack?.split("\n").slice(0, 3).join("\n") : undefined),
    };
    setErrorLog(prev => {
      const updated = [entry, ...prev].slice(0, 100);
      saveErrorLog(updated);
      return updated;
    });
  }, []);

  const clearErrorLog = useCallback(() => {
    setErrorLog([]);
    saveErrorLog([]);
  }, []);

  useEffect(() => {
    supabase.functions.invoke("invoice-matching", { body: { action: "getSuppliers" } })
      .then(({ data }) => setKnownSuppliers(data?.suppliers || []));
  }, []);

  const uploadPdfToStorage = async (file: File, prefix: string): Promise<string> => {
    const path = `temp/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
    const { error } = await supabase.storage.from("invoice-pdfs").upload(path, file, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (error) throw new Error(`Error subiendo PDF: ${error.message}`);
    return path;
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleInternalFile = useCallback(async (file: File | null) => {
    setInternalFile(file);
    if (!file) return;
    setDetectingSupplier(true);
    try {
      const storagePath = await uploadPdfToStorage(file, "supplier_detect");
      const { data, error } = await supabase.functions.invoke("invoice-matching", {
        body: { action: "extractSupplierInfo", storagePath },
      });
      if (!error && data?.supplierName) {
        setSupplierName(data.supplierName);
        toast({ title: "Proveedor detectado", description: data.supplierName });
      }
      // Clean up temp file
      supabase.storage.from("invoice-pdfs").remove([storagePath]).catch(() => {});
    } catch (err: any) {
      logError("Detección automática de proveedor", err, "Al analizar el PDF para extraer el nombre del proveedor");
    } finally {
      setDetectingSupplier(false);
    }
  }, [toast, logError]);

  useEffect(() => {
    if (!supplierName.trim()) { setSupplierCard(null); return; }
    const timeout = setTimeout(async () => {
      const { data } = await supabase.functions.invoke("invoice-matching", {
        body: { action: "getSupplierCard", supplierName: supplierName.trim() },
      });
      if (data?.supplier) {
        setSupplierCard(data.supplier);
        setNotesValue(data.supplier.notes || "");
      } else {
        setSupplierCard(null);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [supplierName]);

  const handleCompare = useCallback(async () => {
    if (!internalFile || !supplierFile || !supplierName.trim()) {
      toast({ title: "Faltan datos", description: "Sube ambos PDFs e indica el nombre del proveedor.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      setLoadingStep("Subiendo PDFs…");
      const [internalPath, supplierPath] = await Promise.all([
        uploadPdfToStorage(internalFile, "internal"),
        uploadPdfToStorage(supplierFile!, "supplier"),
      ]);

      setLoadingStep("Analizando entradas internas…");
      const { data: d1, error: e1 } = await supabase.functions.invoke("invoice-matching", {
        body: { action: "extractProducts", storagePath: internalPath, docType: "internal" },
      });
      if (e1 || d1?.error) throw new Error(d1?.error || e1?.message);
      const internalProducts: Product[] = d1.products;

      setLoadingStep("Analizando factura del proveedor…");
      const { data: d2, error: e2 } = await supabase.functions.invoke("invoice-matching", {
        body: { action: "extractProducts", storagePath: supplierPath, docType: "supplier" },
      });
      if (e2 || d2?.error) throw new Error(d2?.error || e2?.message);
      const supplierProducts: Product[] = d2.products;

      // Clean up temp files
      supabase.storage.from("invoice-pdfs").remove([internalPath, supplierPath]).catch(() => {});

      setLoadingStep("Comparando productos con IA…");
      const { data: d3, error: e3 } = await supabase.functions.invoke("invoice-matching", {
        body: { action: "matchProducts", internalProducts, supplierProducts, supplierName: supplierName.trim() },
      });
      if (e3 || d3?.error) throw new Error(d3?.error || e3?.message);

      setResult(d3 as ComparisonResult);

      const priceIssues = (d3.matched || []).filter((m: any) => m.priceMatch === false).length;
      toast({
        title: "Comparación completada",
        description: `${d3.matched.length} coincidencias, ${d3.onlyInternal.length + d3.onlySupplier.length} sin emparejar${priceIssues > 0 ? `, ${priceIssues} discrepancias de precio` : ""}.`,
      });

      const { data: sData } = await supabase.functions.invoke("invoice-matching", { body: { action: "getSuppliers" } });
      setKnownSuppliers(sData?.suppliers || []);
    } catch (err: any) {
      logError("Comparación de facturas", err, `Proveedor: ${supplierName}, Paso: ${loadingStep}`);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }, [internalFile, supplierFile, supplierName, toast, logError]);

  const handleManualMap = useCallback(async () => {
    if (selectedInternal === null || selectedSupplier === null || !result) return;
    const ip = result.onlyInternal[selectedInternal];
    const sp = result.onlySupplier[selectedSupplier];

    try {
      await supabase.functions.invoke("invoice-matching", {
        body: { action: "saveMapping", supplierName: supplierName.trim(), supplierProductName: sp.nombre, internalProductName: ip.nombre },
      });

      const newMatched = [...result.matched, {
        internalProduct: ip,
        supplierProduct: sp,
        matchType: "mapping" as const,
        quantityMatch: getStems(ip) === getStems(sp),
        heightMatch: getHeightMatchLocal(ip, sp),
      }];
      setResult({
        matched: newMatched,
        onlyInternal: result.onlyInternal.filter((_, i) => i !== selectedInternal),
        onlySupplier: result.onlySupplier.filter((_, i) => i !== selectedSupplier),
      });
      setSelectedInternal(null);
      setSelectedSupplier(null);
      toast({ title: "Mapeo guardado + lección aprendida", description: `"${sp.nombre}" → "${ip.nombre}"` });

      const { data } = await supabase.functions.invoke("invoice-matching", {
        body: { action: "getSupplierCard", supplierName: supplierName.trim() },
      });
      if (data?.supplier) setSupplierCard(data.supplier);
    } catch (err: any) {
      logError("Mapeo manual de productos", err, `Proveedor: ${supplierName}`);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [selectedInternal, selectedSupplier, result, supplierName, toast, logError]);

  const loadMappings = useCallback(async () => {
    if (!supplierName.trim()) return;
    const { data } = await supabase.functions.invoke("invoice-matching", {
      body: { action: "getMappings", supplierName: supplierName.trim() },
    });
    setSavedMappings(data?.mappings || []);
  }, [supplierName]);

  const deleteMapping = useCallback(async (id: string) => {
    await supabase.functions.invoke("invoice-matching", { body: { action: "deleteMapping", id } });
    setSavedMappings(prev => prev.filter(m => m.id !== id));
    toast({ title: "Mapeo eliminado" });
  }, [toast]);

  const saveNotes = useCallback(async () => {
    await supabase.functions.invoke("invoice-matching", {
      body: { action: "updateSupplierNotes", supplierName: supplierName.trim(), notes: notesValue },
    });
    setEditingNotes(false);
    toast({ title: "Notas guardadas" });
  }, [supplierName, notesValue, toast]);

  const deleteLearning = useCallback(async (index: number) => {
    await supabase.functions.invoke("invoice-matching", {
      body: { action: "deleteAiLearning", supplierName: supplierName.trim(), learningIndex: index },
    });
    setSupplierCard(prev => prev ? {
      ...prev,
      ai_learnings: prev.ai_learnings.filter((_, i) => i !== index),
    } : null);
    toast({ title: "Lección eliminada" });
  }, [supplierName, toast]);

  const filteredSuggestions = knownSuppliers.filter(s =>
    s.name.toLowerCase().includes(supplierName.toLowerCase())
  );

  const priceDiscrepancies = result?.matched.filter(m => m.priceMatch === false).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Cuadre de Facturas</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Sube el PDF de entradas internas y la factura del proveedor para comparar automáticamente.
        </p>
      </div>

      {/* PDF Upload zones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UploadZone
          label="Entradas internas"
          file={internalFile}
          onFile={handleInternalFile}
          accent="primary"
          extraInfo={detectingSupplier ? "Detectando proveedor…" : undefined}
        />
        <UploadZone
          label="Factura del proveedor"
          file={supplierFile}
          onFile={setSupplierFile}
          accent="secondary"
        />
      </div>

      {/* Supplier name with autocomplete */}
      <div className="max-w-sm relative">
        <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-2">
          Proveedor
          {detectingSupplier && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {supplierName && !detectingSupplier && <Sparkles className="h-3.5 w-3.5 text-primary" />}
        </label>
        <Input
          placeholder="Se detecta automáticamente del PDF…"
          value={supplierName}
          onChange={e => { setSupplierName(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        />
        {showSuggestions && filteredSuggestions.length > 0 && supplierName.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-auto">
            {filteredSuggestions.map(s => (
              <button
                key={s.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between"
                onMouseDown={() => { setSupplierName(s.name); setShowSuggestions(false); }}
              >
                <span className="font-medium text-foreground">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.total_comparisons} comparaciones</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Supplier card */}
      {supplierCard && (
        <Collapsible open={cardOpen} onOpenChange={setCardOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between text-sm">
              <span className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                Ficha de "{supplierCard.name}" — {supplierCard.ai_learnings.length} lecciones, {supplierCard.product_catalog.length} productos conocidos
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${cardOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <Card className="p-4 space-y-4">
              <div>
                <h4 className="text-sm font-medium text-foreground flex items-center gap-1.5 mb-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Lecciones aprendidas ({supplierCard.ai_learnings.length})
                </h4>
                {supplierCard.ai_learnings.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Aún no hay lecciones. Se crearán automáticamente al comparar y mapear productos.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-auto">
                    {supplierCard.ai_learnings.map((l, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs bg-muted/50 rounded-lg px-3 py-2">
                        <span className="text-muted-foreground shrink-0">{l.date}</span>
                        <span className="text-foreground flex-1">{l.lesson}</span>
                        <button onClick={() => deleteLearning(i)} className="shrink-0 text-destructive hover:text-destructive/80">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Notas</h4>
                {editingNotes ? (
                  <div className="space-y-2">
                    <Textarea value={notesValue} onChange={e => setNotesValue(e.target.value)} rows={3} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveNotes}>Guardar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <p
                    className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => setEditingNotes(true)}
                  >
                    {supplierCard.notes || "Sin notas. Haz clic para añadir."}
                  </p>
                )}
              </div>

              {/* Chat IA */}
              <SupplierChat supplierName={supplierCard.name} />

              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{supplierCard.total_comparisons} comparaciones</span>
                <span>{supplierCard.product_catalog.length} productos en catálogo</span>
                {supplierCard.last_comparison_at && (
                  <span>Última: {new Date(supplierCard.last_comparison_at).toLocaleDateString("es-ES")}</span>
                )}
              </div>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Compare button */}
      <Button
        size="lg"
        onClick={handleCompare}
        disabled={loading || !internalFile || !supplierFile || !supplierName.trim()}
        className="w-full md:w-auto"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {loadingStep}
          </>
        ) : (
          "Comparar con IA"
        )}
      </Button>

      {/* Error Log Panel */}
      {errorLog.length > 0 && (
        <Collapsible open={errorLogOpen} onOpenChange={setErrorLogOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between text-sm border-destructive/30 hover:bg-destructive/5">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4 text-destructive" />
                Historial de errores ({errorLog.length})
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${errorLogOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <Card className="p-0 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-destructive/5 flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Errores recientes
                </h3>
                <Button variant="ghost" size="sm" onClick={clearErrorLog} className="text-xs h-7 text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Limpiar
                </Button>
              </div>
              <ScrollArea className="max-h-72">
                <div className="divide-y divide-border">
                  {errorLog.map(entry => (
                    <div key={entry.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              {entry.action}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(entry.timestamp).toLocaleString("es-ES", {
                                day: "2-digit", month: "2-digit", year: "2-digit",
                                hour: "2-digit", minute: "2-digit", second: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-foreground font-medium">{entry.error}</p>
                          {entry.details && (
                            <p className="text-xs text-muted-foreground mt-1 font-mono whitespace-pre-wrap break-all">{entry.details}</p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setErrorLog(prev => {
                              const updated = prev.filter(e => e.id !== entry.id);
                              saveErrorLog(updated);
                              return updated;
                            });
                          }}
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <Badge variant="default" className="text-sm py-1 px-3">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              {result.matched.length} coincidencias
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              {result.matched.filter(m => !m.quantityMatch).length} discrepancias cantidad
            </Badge>
            {result.matched.filter(m => m.heightMatch === false).length > 0 && (
              <Badge variant="secondary" className="text-sm py-1 px-3">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                {result.matched.filter(m => m.heightMatch === false).length} discrepancias altura
              </Badge>
            )}
            {priceDiscrepancies > 0 && (
              <Badge variant="secondary" className="text-sm py-1 px-3">
                <DollarSign className="h-3.5 w-3.5 mr-1" />
                {priceDiscrepancies} discrepancias precio
              </Badge>
            )}
            <Badge variant="destructive" className="text-sm py-1 px-3">
              <XCircle className="h-3.5 w-3.5 mr-1" />
              {result.onlyInternal.length + result.onlySupplier.length} sin emparejar
            </Badge>
          </div>

          {/* Matched table */}
          {result.matched.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <h3 className="font-medium text-foreground">Coincidencias</h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto interno</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Altura</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead>Producto factura</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Altura</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-center">Tipo</TableHead>
                      <TableHead className="text-center">Cant.</TableHead>
                      <TableHead className="text-center">Altura</TableHead>
                      <TableHead className="text-center">Precio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.matched.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-sm">{m.internalProduct.nombre}</TableCell>
                        <TableCell className="text-right text-sm">{formatQty(m.internalProduct)}</TableCell>
                        <TableCell className="text-right text-sm">{m.internalProduct.altura != null ? `${m.internalProduct.altura} cm` : "—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          <span>{formatPrice(m.internalPricePerStem)}</span>
                          {m.internalProduct.precio_unitario != null && (
                            <span className="block text-xs text-muted-foreground">{formatOriginalPrice(m.internalProduct)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{m.supplierProduct.nombre}</TableCell>
                        <TableCell className="text-right text-sm">{formatQty(m.supplierProduct)}</TableCell>
                        <TableCell className="text-right text-sm">{m.supplierProduct.altura != null ? `${m.supplierProduct.altura} cm` : "—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          <span>{formatPrice(m.supplierPricePerStem)}</span>
                          {m.supplierProduct.precio_unitario != null && (
                            <span className="block text-xs text-muted-foreground">{formatOriginalPrice(m.supplierProduct)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-xs">
                            {m.matchType === "mapping" ? "Mapeo" : m.matchType === "ai" ? "IA" : "Nombre"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {m.quantityMatch ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {m.heightMatch === null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : m.heightMatch ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {m.priceMatch === null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : m.priceMatch ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-red-500 mx-auto" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Unmatched — manual mapping */}
          {(result.onlyInternal.length > 0 || result.onlySupplier.length > 0) && (
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                <h3 className="font-medium text-foreground">Sin emparejar — Mapeo manual</h3>
                {selectedInternal !== null && selectedSupplier !== null && (
                  <Button size="sm" onClick={handleManualMap}>
                    <Link2 className="h-4 w-4 mr-1" /> Vincular seleccionados
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Solo en entradas internas</p>
                  {result.onlyInternal.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Ninguno</p>
                  ) : (
                    <>
                      <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Buscar interno..."
                          value={internalSearch}
                          onChange={e => { setInternalSearch(e.target.value); setSelectedInternal(null); }}
                          className="h-8 pl-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {result.onlyInternal
                          .map((p, i) => ({ p, i }))
                          .filter(({ p }) => !internalSearch || p.nombre.toLowerCase().includes(internalSearch.toLowerCase()))
                          .map(({ p, i }) => (
                          <button
                            key={i}
                            onClick={() => setSelectedInternal(selectedInternal === i ? null : i)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                              selectedInternal === i
                                ? "bg-primary/10 border border-primary/30 text-foreground"
                                : "bg-muted/50 hover:bg-muted text-foreground"
                            }`}
                          >
                            <span className="font-medium">{p.nombre}</span>
                            <span className="text-muted-foreground ml-2">{formatQty(p)}</span>
                            {p.precio_unitario != null && (
                              <span className="text-muted-foreground ml-2 text-xs">{formatOriginalPrice(p)}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Solo en factura proveedor</p>
                  {result.onlySupplier.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Ninguno</p>
                  ) : (
                    <>
                      <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Buscar proveedor..."
                          value={supplierSearch}
                          onChange={e => { setSupplierSearch(e.target.value); setSelectedSupplier(null); }}
                          className="h-8 pl-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {result.onlySupplier
                          .map((p, i) => ({ p, i }))
                          .filter(({ p }) => !supplierSearch || p.nombre.toLowerCase().includes(supplierSearch.toLowerCase()))
                          .map(({ p, i }) => (
                          <button
                            key={i}
                            onClick={() => setSelectedSupplier(selectedSupplier === i ? null : i)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                              selectedSupplier === i
                                ? "bg-primary/10 border border-primary/30 text-foreground"
                                : "bg-muted/50 hover:bg-muted text-foreground"
                            }`}
                          >
                            <span className="font-medium">{p.nombre}</span>
                            <span className="text-muted-foreground ml-2">{formatQty(p)}</span>
                            {p.precio_unitario != null && (
                              <span className="text-muted-foreground ml-2 text-xs">{formatOriginalPrice(p)}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Saved mappings */}
          <Collapsible open={mappingsOpen} onOpenChange={o => { setMappingsOpen(o); if (o) loadMappings(); }}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between text-muted-foreground">
                Mapeos guardados para "{supplierName}"
                <ChevronDown className={`h-4 w-4 transition-transform ${mappingsOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {savedMappings.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 py-3">No hay mapeos guardados para este proveedor.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre proveedor</TableHead>
                      <TableHead>Nombre interno</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {savedMappings.map(m => (
                      <TableRow key={m.id}>
                        <TableCell>{m.supplier_product_name}</TableCell>
                        <TableCell>{m.internal_product_name}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => deleteMapping(m.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}

// ── Upload Zone Component ──
function UploadZone({ label, file, onFile, accent, extraInfo }: {
  label: string;
  file: File | null;
  onFile: (f: File | null) => void;
  accent: "primary" | "secondary";
  extraInfo?: string;
}) {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.type === "application/pdf") onFile(f);
  };

  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      className={`relative rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
        file
          ? "border-primary/40 bg-primary/5"
          : "border-border hover:border-primary/30 hover:bg-muted/30"
      }`}
    >
      {file ? (
        <div className="space-y-2">
          <FileText className="h-8 w-8 mx-auto text-primary" />
          <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
          {extraInfo && (
            <p className="text-xs text-primary flex items-center justify-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> {extraInfo}
            </p>
          )}
          <Button variant="ghost" size="sm" onClick={() => onFile(null)}>Cambiar</Button>
        </div>
      ) : (
        <label className="cursor-pointer block space-y-2">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">Arrastra un PDF o haz clic para seleccionar</p>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
          />
        </label>
      )}
    </div>
  );
}

// ── Supplier Chat Component ──
function SupplierChat({ supplierName }: { supplierName: string }) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    supabase.functions.invoke("invoice-matching", {
      body: { action: "getChatMessages", supplierName },
    }).then(({ data }) => {
      setMessages(data?.messages || []);
      setLoading(false);
    });
  }, [supplierName]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);

    // Optimistic user message
    const tempMsg: ChatMessage = {
      id: "temp-" + Date.now(),
      supplier_name: supplierName,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const { data, error } = await supabase.functions.invoke("invoice-matching", {
        body: { action: "sendChatMessage", supplierName, message: text },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);

      // Reload messages to get real IDs
      const { data: refreshed } = await supabase.functions.invoke("invoice-matching", {
        body: { action: "getChatMessages", supplierName },
      });
      setMessages(refreshed?.messages || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
    } finally {
      setSending(false);
    }
  }, [input, sending, supplierName, toast]);

  const handleDelete = useCallback(async (id: string) => {
    await supabase.functions.invoke("invoice-matching", {
      body: { action: "deleteChatMessage", id },
    });
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  return (
    <div>
      <h4 className="text-sm font-medium text-foreground flex items-center gap-1.5 mb-2">
        <MessageCircle className="h-4 w-4 text-primary" />
        Chat IA — Reglas y correcciones
      </h4>
      <Card className="flex flex-col h-[320px]">
        <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center">
              <p className="text-xs text-muted-foreground">
                Escribe reglas para este proveedor. Ej: "Siempre factura por bunch de 10 stems"
              </p>
            </div>
          ) : (
            messages.map(m => (
              <div
                key={m.id}
                className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className={`group relative max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <span className="block text-[10px] mt-1 opacity-60">
                    {new Date(m.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="absolute -top-2 -right-2 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-destructive-foreground"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                {m.role === "user" && (
                  <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
              </div>
            ))
          )}
          {sending && (
            <div className="flex gap-2 justify-start">
              <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-muted rounded-xl px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-border p-2 flex gap-2">
          <Input
            placeholder="Escribe una regla o pregunta…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={sending}
            className="text-sm"
          />
          <Button size="icon" onClick={handleSend} disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
