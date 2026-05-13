import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WorkerSearchSelect } from "@/components/WorkerSearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import {
  Send, Loader2, Settings2, Plus, Trash2, Save, Mail, Star, Banknote, MessageCircle, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import OperativaHistoryPanel from "./OperativaHistoryPanel";
import CopyEmailsDialog from "./CopyEmailsDialog";

export default function OperativaAnticiposTab() {
  const [workerId, setWorkerId] = useState("");
  const [workerInfo, setWorkerInfo] = useState<{ name: string; number: string } | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [sending, setSending] = useState(false);
  const [extractingWa, setExtractingWa] = useState(false);
  const [solicitante, setSolicitante] = useState("");
  const [waScreenshots, setWaScreenshots] = useState<{ base64: string; fileType: string }[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [allWorkers, setAllWorkers] = useState<{
    id: string;
    name: string;
    worker_number: string;
    worker_code: string | null;
  }[]>([]);
  const waInputRef = useRef<HTMLInputElement>(null);

  // Config state
  const [configEmails, setConfigEmails] = useState<string[]>([]);
  const [primaryEmail, setPrimaryEmail] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  const getSessionToken = () =>
    localStorage.getItem("manager_session_token") || sessionStorage.getItem("manager_session_token");

  // Fetch config
  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getOperativaAnticiposConfig", sessionToken: getSessionToken() },
      });
      if (data?.success) {
        setConfigEmails(data.emails || []);
        setPrimaryEmail(data.primary_email || null);
      }
    } catch (e) {
      console.error("Error loading anticipos config:", e);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  // Fetch all workers for matching
  const fetchWorkers = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: { action: "searchAllWorkers", sessionToken: getSessionToken(), data: {} },
      });
      if (data?.success && data.workers) {
        setAllWorkers(data.workers.map((w: any) => ({ id: w.id, name: w.name, worker_number: w.worker_number, worker_code: w.worker_code ?? null })));
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchWorkers();
  }, [fetchConfig, fetchWorkers]);


  // Fetch worker info when selected
  useEffect(() => {
    if (!workerId) { setWorkerInfo(null); return; }
    const w = allWorkers.find((w) => w.id === workerId);
    if (w) setWorkerInfo({ name: w.name, number: w.worker_number });
  }, [workerId, allWorkers]);

  // File to base64
  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  // Process WhatsApp screenshot (from file or paste)
  const processWhatsappFile = useCallback(async (f: File) => {
    setExtractingWa(true);
    try {
      const base64 = await fileToBase64(f);
      setWaScreenshots((prev) => [...prev, { base64, fileType: f.type }]);
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "extractFromWhatsappScreenshot",
          sessionToken: getSessionToken(),
          data: { fileBase64: base64, fileType: f.type, context: "anticipo" },
        },
      });
      if (data?.extracted) {
        const ex = data.extracted;
        let fieldsFound = 0;

        const normalize = (s: string) =>
          s
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        const tokenize = (s: string) => normalize(s).split(" ").filter((t) => t.length >= 3);

        const levenshtein = (a: string, b: string) => {
          const m = a.length;
          const n = b.length;
          if (!m) return n;
          if (!n) return m;
          const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
          for (let i = 0; i <= m; i++) dp[i][0] = i;
          for (let j = 0; j <= n; j++) dp[0][j] = j;
          for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
              const cost = a[i - 1] === b[j - 1] ? 0 : 1;
              dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
              );
            }
          }
          return dp[m][n];
        };

        const tokenSimilarity = (a: string, b: string) => {
          if (a === b) return 1;
          if (a.includes(b) || b.includes(a)) return 0.9;
          const dist = levenshtein(a, b);
          return 1 - dist / Math.max(a.length, b.length);
        };

        const findBestWorkerByName = (name: string) => {
          const searchTokens = tokenize(name);
          // Evita autoselecciones peligrosas con un solo token ambiguo (ej: "José")
          if (searchTokens.length < 2) return null;

          let best: (typeof allWorkers)[0] | null = null;
          let bestScore = 0;

          for (const w of allWorkers) {
            const dbTokens = tokenize(`${w.name} ${w.worker_code ?? ""}`);
            if (!dbTokens.length) continue;

            let total = 0;
            for (const sToken of searchTokens) {
              let tokenBest = 0;
              for (const dToken of dbTokens) {
                const sim = tokenSimilarity(sToken, dToken);
                if (sim > tokenBest) tokenBest = sim;
              }
              total += tokenBest;
            }

            const score = total / searchTokens.length;
            if (score > bestScore) {
              bestScore = score;
              best = w;
            }
          }

          return bestScore >= 0.72 ? best : null;
        };

        // 1) workerName del contenido del mensaje
        // 2) workerNumber exacto
        let workerMatched = false;

        if (ex.workerName) {
          const match = findBestWorkerByName(ex.workerName);
          if (match) {
            setWorkerId(match.id);
            setWorkerInfo({ name: match.name, number: match.worker_number });
            fieldsFound++;
            workerMatched = true;
            toast({ title: "Trabajador detectado", description: match.name });
          }
        }

        if (!workerMatched && ex.workerNumber) {
          const normalizedWorkerNumber = String(ex.workerNumber).trim();
          const match = allWorkers.find((w) => w.worker_number === normalizedWorkerNumber);
          if (match) {
            setWorkerId(match.id);
            setWorkerInfo({ name: match.name, number: match.worker_number });
            fieldsFound++;
            workerMatched = true;
            toast({ title: "Trabajador detectado", description: match.name });
          }
        }

        if (ex.cantidad) {
          const cleaned = String(ex.cantidad).replace(/[^0-9.,]/g, "").replace(",", ".");
          if (!isNaN(parseFloat(cleaned))) {
            setCantidad(cleaned);
            fieldsFound++;
            toast({ title: "Cantidad detectada", description: `${cleaned} €` });
          }
        }

        if (ex.solicitante) {
          setSolicitante(ex.solicitante);
          fieldsFound++;
        }

        if (!workerMatched && ex.workerName) {
          toast({
            title: "Trabajador no detectado automáticamente",
            description: `Detectado en mensaje: ${ex.workerName}`,
            variant: "destructive",
          });
        }

        if (fieldsFound === 0) {
          toast({ title: "No se pudieron extraer datos", description: "Intenta con otra captura", variant: "destructive" });
        }
      } else {
        const isParseError = data?.errorCode === 'parse_error' || data?.errorCode === 'gemini_error';
        toast({
          title: isParseError ? "Error técnico al analizar" : "No se pudieron extraer datos",
          description: isParseError ? "Reintenta o usa otra captura más clara" : "Intenta con otra captura",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("WhatsApp extraction error:", err);
      toast({ title: "Error al procesar imagen", variant: "destructive" });
    } finally {
      setExtractingWa(false);
    }
  }, [allWorkers]);

  const handleWhatsappImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (waInputRef.current) waInputRef.current.value = "";
    processWhatsappFile(f);
  }, [processWhatsappFile]);

  // Global paste listener for Ctrl+V screenshots
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processWhatsappFile(file);
          }
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [processWhatsappFile]);

  // Send anticipo
  const handleSend = async () => {
    if (!workerId || !workerInfo) {
      toast({ title: "Selecciona un trabajador", variant: "destructive" });
      return;
    }
    const amount = parseFloat(cantidad.replace(",", "."));
    if (!cantidad || isNaN(amount) || amount <= 0) {
      toast({ title: "Introduce una cantidad válida", variant: "destructive" });
      return;
    }
    if (configEmails.length === 0) {
      toast({ title: "Sin destinatarios", description: "Configura al menos un email.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "sendOperativaAnticipo",
          sessionToken: getSessionToken(),
          data: {
            workerId,
            workerName: workerInfo.name,
            workerNumber: workerInfo.number,
            cantidad: amount,
            solicitante: solicitante.trim() || null,
            capturas: waScreenshots.length > 0 ? waScreenshots : null,
          },
        },
      });

      if (error || !data?.success) throw new Error(data?.error || "Error al enviar");

      toast({ title: "Anticipo enviado ✓", description: `Notificación enviada a ${configEmails.length} destinatario(s).` });
      setHistoryKey((k) => k + 1);

      setWorkerId("");
      setWorkerInfo(null);
      setCantidad("");
      setSolicitante("");
      setWaScreenshots([]);
    } catch (err: any) {
      toast({ title: "Error al enviar", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // Config actions
  const addEmail = () => {
    const em = newEmail.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      toast({ title: "Email no válido", variant: "destructive" });
      return;
    }
    if (configEmails.includes(em)) {
      toast({ title: "Email ya existe", variant: "destructive" });
      return;
    }
    setConfigEmails([...configEmails, em]);
    setNewEmail("");
  };

  const removeEmail = (em: string) => {
    setConfigEmails(configEmails.filter((e) => e !== em));
    if (primaryEmail === em) setPrimaryEmail(null);
  };

  const saveConfig = async (overridePrimary?: string | null) => {
    const pendingEmail = newEmail.trim().toLowerCase();
    const nextEmails = [...configEmails];
    if (pendingEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pendingEmail)) {
        toast({ title: "Email no válido", variant: "destructive" });
        return;
      }
      if (!nextEmails.includes(pendingEmail)) nextEmails.push(pendingEmail);
    }

    const finalPrimary = overridePrimary !== undefined ? overridePrimary : primaryEmail;

    setSavingConfig(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "updateOperativaAnticiposConfig",
          sessionToken: getSessionToken(),
          data: { emails: nextEmails, primary_email: finalPrimary },
        },
      });
      if (error || !data?.success) throw new Error(data?.error || "Error");
      setConfigEmails(data?.emails || nextEmails);
      setPrimaryEmail(data?.primary_email || null);
      setNewEmail("");
      toast({ title: "Configuración guardada ✓" });
    } catch (err: any) {
      toast({ title: "Error al guardar", description: err.message, variant: "destructive" });
    } finally {
      setSavingConfig(false);
    }
  };

  const togglePrimaryEmail = (email: string) => {
    const newPrimary = primaryEmail === email ? null : email;
    setPrimaryEmail(newPrimary);
    saveConfig(newPrimary);
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      {/* Main form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" />
              Solicitar Anticipo
            </span>
            <Button variant="ghost" size="sm" onClick={() => setShowConfig(!showConfig)} className="h-8 w-8 p-0" title="Configuración">
              <Settings2 className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* WhatsApp import — multiple screenshots */}
          <div>
            <input
              ref={waInputRef}
              type="file"
              accept="image/*"
              onChange={handleWhatsappImport}
              className="hidden"
            />
            {waScreenshots.length > 0 && (
              <div className="space-y-2 mb-2">
                <div className="grid grid-cols-3 gap-2">
                  {waScreenshots.map((ws, i) => (
                    <div key={i} className="relative rounded-lg border border-primary/20 overflow-hidden aspect-[9/16]">
                      <img
                        src={`data:${ws.fileType};base64,${ws.base64}`}
                        alt={`Captura ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setWaScreenshots((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 bg-background/80 backdrop-blur-sm rounded-full p-1 shadow-sm border border-border hover:bg-destructive hover:text-destructive-foreground transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-primary text-center font-medium">
                  ✓ {waScreenshots.length} captura{waScreenshots.length > 1 ? "s" : ""} guardada{waScreenshots.length > 1 ? "s" : ""}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => waInputRef.current?.click()}
              disabled={extractingWa}
              className={cn(
                "w-full flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-primary/30",
                "py-2.5 px-4 transition-colors hover:bg-primary/5 active:scale-[0.99] text-sm font-medium text-primary",
                "focus:outline-none focus:ring-2 focus:ring-primary/30",
                extractingWa && "opacity-60 pointer-events-none"
              )}
            >
              {extractingWa ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analizando captura...
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    {waScreenshots.length > 0 ? "Añadir otra captura" : "Importar desde captura de WhatsApp"}
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    Haz clic para subir o pega con Ctrl+V
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Persona solicitante */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Persona solicitante
            </label>
            <Input
              value={solicitante}
              onChange={(e) => setSolicitante(e.target.value)}
              placeholder="Nombre del contacto que solicita (opcional)"
              className="h-9 text-sm"
            />
          </div>

          {/* Worker search */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Trabajador *
            </label>
            <WorkerSearchSelect
              value={workerId}
              onChange={setWorkerId}
              placeholder="Buscar por nombre o número..."
            />
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Cantidad (€) *
            </label>
            <div className="relative">
              <Input
                type="text"
                inputMode="decimal"
                value={cantidad}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.,]/g, "");
                  setCantidad(v);
                }}
                placeholder="0,00"
                className="h-11 pl-8 text-lg font-semibold"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">€</span>
            </div>
          </div>

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={!workerId || !cantidad || sending}
            className="w-full h-12 text-base font-semibold rounded-xl"
            size="lg"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar Anticipo
              </>
            )}
          </Button>

          {!loadingConfig && configEmails.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
              ⚠️ No hay emails configurados.{" "}
              <button type="button" onClick={() => setShowConfig(true)} className="underline">
                Configurar
              </button>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Config panel */}
      {showConfig && (
        <Card className="animate-fade-in">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Emails destinatarios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingConfig ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {configEmails.length > 0 ? (
                  <div className="space-y-1.5">
                    {configEmails.map((email) => {
                      const isPrimary = primaryEmail === email;
                      return (
                        <div
                          key={email}
                          className={cn(
                            "flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm",
                            isPrimary ? "bg-primary/10 border border-primary/20" : "bg-muted/50"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={() => togglePrimaryEmail(email)}
                              className={cn(
                                "flex-shrink-0 transition-colors",
                                isPrimary ? "text-primary" : "text-muted-foreground/40 hover:text-primary/60"
                              )}
                              title={isPrimary ? "Email principal (TO)" : "Marcar como principal"}
                            >
                              <Star className={cn("h-3.5 w-3.5", isPrimary && "fill-current")} />
                            </button>
                            <span className="truncate">{email}</span>
                            {isPrimary && (
                              <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded flex-shrink-0">
                                TO
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeEmail(email)}
                            className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No hay emails configurados
                  </p>
                )}

                <div className="flex gap-2">
                  <Input
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="nuevo@email.com"
                    className="h-9 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && addEmail()}
                  />
                  <Button variant="outline" size="sm" onClick={addEmail} className="h-9 px-3">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <Button onClick={() => saveConfig()} disabled={savingConfig} size="sm" className="w-full">
                  {savingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  <span className="ml-1.5">Guardar configuración</span>
                </Button>
                {configEmails.length > 0 && (
                  <CopyEmailsDialog
                    sourceTab="anticipos"
                    emails={configEmails}
                    primaryEmail={primaryEmail}
                    getSessionToken={getSessionToken}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* History */}
      <OperativaHistoryPanel tipo="anticipo" refreshKey={historyKey} />
    </div>
  );
}
