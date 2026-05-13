import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WorkerSearchSelect } from "@/components/WorkerSearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import {
  Camera, Upload, Send, Loader2, X, FileText, Settings2,
  Plus, Trash2, Save, Mail, Sparkles, Search, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import OperativaHistoryPanel from "./OperativaHistoryPanel";
import CopyEmailsDialog from "./CopyEmailsDialog";

export default function OperativaJustificantesTab() {
  const [workerId, setWorkerId] = useState("");
  const [workerInfo, setWorkerInfo] = useState<{ name: string; number: string } | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualNumber, setManualNumber] = useState("");
  const [files, setFiles] = useState<Array<{ file: File; preview: string | null }>>([]);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  // AI identification
  const [identifying, setIdentifying] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{
    workerId: string;
    workerName: string;
    workerNumber: string;
    confidence: number;
    matchedName: string;
  } | null>(null);

  // Config state
  const [configEmails, setConfigEmails] = useState<string[]>([]);
  const [primaryEmail, setPrimaryEmail] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getSessionToken = () =>
    localStorage.getItem("manager_session_token") || sessionStorage.getItem("manager_session_token");

  // Fetch config
  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getOperativaJustificanteConfig", sessionToken: getSessionToken() },
      });
      if (data?.success) {
        setConfigEmails(data.emails || []);
        setPrimaryEmail(data.primary_email || null);
      }
    } catch (e) {
      console.error("Error loading config:", e);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Fetch worker info when selected
  useEffect(() => {
    if (!workerId) {
      setWorkerInfo(null);
      return;
    }
    const fetchWorker = async () => {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "searchAllWorkers",
          sessionToken: getSessionToken(),
          data: {},
        },
      });
      if (data?.success && data.workers) {
        const w = data.workers.find((w: any) => w.id === workerId);
        if (w) setWorkerInfo({ name: w.name, number: w.worker_number });
      }
    };
    fetchWorker();
  }, [workerId]);

  // AI identification
  const identifyWorker = useCallback(async (fileObj: File) => {
    setIdentifying(true);
    setAiSuggestion(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(fileObj);
      });

      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "identifyWorkerFromDocument",
          sessionToken: getSessionToken(),
          data: {
            fileBase64: base64,
            fileType: fileObj.type,
          },
        },
      });

      if (data?.success && data.match) {
        setAiSuggestion(data.match);
        // Auto-select the worker
        setWorkerId(data.match.workerId);
        setWorkerInfo({
          name: data.match.workerName,
          number: data.match.workerNumber,
        });
      }
    } catch (e) {
      console.error("AI identification error:", e);
    } finally {
      setIdentifying(false);
    }
  }, []);

  // File handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;
    setAiSuggestion(null);

    const newItems: Array<{ file: File; preview: string | null }> = [];
    Array.from(selectedFiles).forEach((f) => {
      if (f.size > 10 * 1024 * 1024) {
        toast({ title: `${f.name}: máximo 10MB`, variant: "destructive" });
        return;
      }
      const item: { file: File; preview: string | null } = { file: f, preview: null };
      newItems.push(item);
      if (f.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setFiles(prev => prev.map(p => p.file === f ? { ...p, preview: ev.target?.result as string } : p));
        };
        reader.readAsDataURL(f);
      }
    });

    setFiles(prev => [...prev, ...newItems]);

    // Trigger AI identification with first file if no worker selected yet
    if (!workerId && newItems.length > 0) {
      identifyWorker(newItems[0].file);
    }

    e.target.value = "";
  };

  const clearFiles = () => {
    setFiles([]);
    setAiSuggestion(null);
    setIdentifying(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const dismissAiSuggestion = () => {
    setAiSuggestion(null);
    setWorkerId("");
    setWorkerInfo(null);
  };

  // Send justificante
  const handleSend = async () => {
    const effectiveWorkerInfo = manualMode
      ? (manualName.trim() ? { name: manualName.trim(), number: manualNumber.trim() } : null)
      : workerInfo;
    const effectiveWorkerId = manualMode ? (manualName.trim() ? `manual-${Date.now()}` : "") : workerId;

    if (!effectiveWorkerId || !effectiveWorkerInfo || files.length === 0) {
      toast({ title: "Completa todos los campos", description: manualMode ? "Escribe el nombre del trabajador y sube un archivo." : "Selecciona un trabajador y sube un archivo.", variant: "destructive" });
      return;
    }
    if (configEmails.length === 0) {
      toast({ title: "Sin destinatarios", description: "Configura al menos un email destinatario.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      // Convert all files to base64
      const filesData = await Promise.all(
        files.map(async (item) => {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(item.file);
          });
          return {
            fileName: item.file.name,
            fileType: item.file.type,
            fileBase64: base64,
          };
        })
      );

      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "sendOperativaJustificante",
          sessionToken: getSessionToken(),
          data: {
            workerId: effectiveWorkerId,
            workerName: effectiveWorkerInfo.name,
            workerNumber: effectiveWorkerInfo.number,
            fileName: filesData[0].fileName,
            fileType: filesData[0].fileType,
            fileBase64: filesData[0].fileBase64,
            additionalFiles: filesData.slice(1),
            comment: comment.trim() || undefined,
          },
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Error al enviar");
      }


      toast({ title: "Justificante enviado ✓", description: `${files.length} archivo(s) enviado(s) a ${configEmails.length} destinatario(s).` });
      setHistoryKey((k) => k + 1);

      setWorkerId("");
      setWorkerInfo(null);
      setAiSuggestion(null);
      setManualName("");
      setManualNumber("");
      setComment("");
      clearFiles();
    } catch (err: any) {
      toast({ title: "Error al enviar", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // Config actions
  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Email no válido", variant: "destructive" });
      return;
    }
    if (configEmails.includes(email)) {
      toast({ title: "Email ya existe", variant: "destructive" });
      return;
    }
    setConfigEmails([...configEmails, email]);
    setNewEmail("");
  };

  const removeEmail = (email: string) => {
    setConfigEmails(configEmails.filter((e) => e !== email));
    if (primaryEmail === email) setPrimaryEmail(null);
  };

  const saveConfig = async (overridePrimary?: string | null) => {
    const pendingEmail = newEmail.trim().toLowerCase();
    const nextEmails = [...configEmails];

    if (pendingEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pendingEmail)) {
        toast({ title: "Email no válido", variant: "destructive" });
        return;
      }
      if (!nextEmails.includes(pendingEmail)) {
        nextEmails.push(pendingEmail);
      }
    }

    const finalPrimary = overridePrimary !== undefined ? overridePrimary : primaryEmail;

    setSavingConfig(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "updateOperativaJustificanteConfig",
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
              <FileText className="h-4 w-4 text-primary" />
              Enviar Justificante
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfig(!showConfig)}
              className="h-8 w-8 p-0"
              title="Configuración"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File upload — FIRST so AI can identify worker */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Justificante
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              className="hidden"
              multiple
            />

            {files.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border",
                  "py-8 px-4 transition-colors hover:border-primary/50 hover:bg-muted/30 active:scale-[0.99]"
                )}
              >
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Camera className="h-5 w-5" />
                  <span className="text-sm font-medium">Hacer foto</span>
                  <span className="text-xs text-muted-foreground/60">o</span>
                  <Upload className="h-5 w-5" />
                  <span className="text-sm font-medium">Subir archivos</span>
                </div>
                <p className="text-[11px] text-muted-foreground/60">
                  Imágenes o PDF — la IA identificará al trabajador
                </p>
              </button>
            ) : (
              <div className="space-y-2">
                {files.map((item, index) => (
                  <div key={index} className="relative rounded-xl border border-border overflow-hidden">
                    {item.preview ? (
                      <img
                        src={item.preview}
                        alt={`Preview ${index + 1}`}
                        className="w-full max-h-32 object-contain bg-muted/20"
                      />
                    ) : (
                      <div className="flex items-center gap-2 p-3 bg-muted/20">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm truncate">{item.file.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="absolute top-2 right-2 h-6 w-6 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary/50 hover:bg-muted/30 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Añadir más archivos
                </button>
              </div>
            )}

            {/* AI identification status */}
            {identifying && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                <Search className="h-3.5 w-3.5" />
                Identificando trabajador...
              </div>
            )}
          </div>

          {/* Worker search */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Trabajador
              </label>
              <button
                type="button"
                onClick={() => {
                  setManualMode(!manualMode);
                  if (!manualMode) {
                    setWorkerId("");
                    setWorkerInfo(null);
                    setAiSuggestion(null);
                  } else {
                    setManualName("");
                    setManualNumber("");
                  }
                }}
                className="text-[11px] text-primary hover:underline"
              >
                {manualMode ? "Buscar en lista" : "Escribir manualmente"}
              </button>
            </div>

            {/* AI suggestion badge */}
            {!manualMode && aiSuggestion && workerId === aiSuggestion.workerId && (
              <div className="mb-2 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2 text-xs text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="font-medium">
                    Identificado por IA ({aiSuggestion.confidence}%)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={dismissAiSuggestion}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Cambiar
                </button>
              </div>
            )}

            {manualMode ? (
              <div className="space-y-2">
                <Input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Nombre del trabajador"
                  className="rounded-xl h-11"
                />
                <Input
                  value={manualNumber}
                  onChange={(e) => setManualNumber(e.target.value)}
                  placeholder="Número de trabajador (opcional)"
                  className="rounded-xl h-11"
                />
              </div>
            ) : (
              <WorkerSearchSelect
                value={workerId}
                onChange={(v) => {
                  setWorkerId(v);
                  if (v !== aiSuggestion?.workerId) {
                    setAiSuggestion(null);
                  }
                }}
                placeholder="Buscar trabajador..."
              />
            )}
          </div>
          {/* Optional comment */}
          <div>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Comentario (opcional)"
              rows={2}
              className="w-full rounded-xl border border-border/40 bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={(!manualMode ? !workerId : !manualName.trim()) || files.length === 0 || sending || identifying}
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
                Enviar Justificante
              </>
            )}
          </Button>

          {!loadingConfig && configEmails.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
              ⚠️ No hay emails configurados.{" "}
              <button
                type="button"
                onClick={() => setShowConfig(true)}
                className="underline"
              >
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
                    {!primaryEmail && configEmails.length > 0 && (
                      <p className="text-[11px] text-muted-foreground/60 px-1">
                        ★ Pulsa la estrella para marcar el email principal (TO). El resto irá en CC.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No hay emails configurados
                  </p>
                )}

                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@ejemplo.com"
                    className="h-9 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && addEmail()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addEmail}
                    className="h-9 px-3"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <Button
                  onClick={() => saveConfig()}
                  disabled={savingConfig}
                  size="sm"
                  className="w-full"
                >
                  {savingConfig ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Guardar
                </Button>

                {configEmails.length > 0 && (
                  <CopyEmailsDialog
                    sourceTab="justificantes"
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
      <OperativaHistoryPanel tipo="justificante" refreshKey={historyKey} />
    </div>
  );
}
