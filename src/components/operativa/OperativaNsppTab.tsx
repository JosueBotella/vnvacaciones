import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WorkerSearchSelect } from "@/components/WorkerSearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import {
  Send, Loader2, Settings2, Plus, Trash2, Save, Mail, Star, UserX, MessageCircle, X, CalendarIcon, Clock, ImagePlus, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import OperativaHistoryPanel from "./OperativaHistoryPanel";
import CopyEmailsDialog from "./CopyEmailsDialog";

export default function OperativaNsppTab() {
  const [workerId, setWorkerId] = useState("");
  const [workerInfo, setWorkerInfo] = useState<{ name: string; number: string } | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualNumber, setManualNumber] = useState("");
  const [contexto, setContexto] = useState("");
  const [fecha, setFecha] = useState<Date | undefined>();
  const [hora, setHora] = useState("");
  const [solicitante, setSolicitante] = useState("");
  const [sending, setSending] = useState(false);
  const [extractingWa, setExtractingWa] = useState(false);
  const [waScreenshots, setWaScreenshots] = useState<{ base64: string; fileType: string }[]>([]);
  const [pruebas, setPruebas] = useState<{ base64: string; fileType: string; preview: string }[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [allWorkers, setAllWorkers] = useState<{
    id: string; name: string; worker_number: string; worker_code: string | null; department_id?: string | null;
  }[]>([]);
  const [managerAssignments, setManagerAssignments] = useState<{ manager_id: string; department_id: string; managers: { name: string; role: string } }[]>([]);
  const waInputRef = useRef<HTMLInputElement>(null);
  const pruebasInputRef = useRef<HTMLInputElement>(null);

  const [configEmails, setConfigEmails] = useState<string[]>([]);
  const [primaryEmail, setPrimaryEmail] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  const getSessionToken = () =>
    localStorage.getItem("manager_session_token") || sessionStorage.getItem("manager_session_token");

  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getOperativaNsppConfig", sessionToken: getSessionToken() },
      });
      if (data?.success) {
        setConfigEmails(data.emails || []);
        setPrimaryEmail(data.primary_email || null);
      }
    } catch (e) {
      console.error("Error loading nspp config:", e);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const fetchWorkers = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: { action: "searchAllWorkers", sessionToken: getSessionToken(), data: {} },
      });
      if (data?.success && data.workers) {
        setAllWorkers(data.workers.map((w: any) => ({ id: w.id, name: w.name, worker_number: w.worker_number, worker_code: w.worker_code ?? null, department_id: w.department_id ?? null })));
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchAssignments = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getAssignments", sessionToken: getSessionToken() },
      });
      if (data?.success && data.assignments) {
        setManagerAssignments(data.assignments);
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchConfig(); fetchWorkers(); fetchAssignments(); }, [fetchConfig, fetchWorkers, fetchAssignments]);

  useEffect(() => {
    if (!workerId) { setWorkerInfo(null); setSolicitante(""); return; }
    const w = allWorkers.find((w) => w.id === workerId);
    if (w) {
      setWorkerInfo({ name: w.name, number: w.worker_number });
      // Auto-fill solicitante with the manager assigned to the worker's department
      if (w.department_id && managerAssignments.length > 0) {
        const assignment = managerAssignments.find((a) => a.department_id === w.department_id);
        if (assignment?.managers?.name) {
          setSolicitante(assignment.managers.name);
        } else {
          setSolicitante("");
        }
      } else {
        setSolicitante("");
      }
    }
  }, [workerId, allWorkers, managerAssignments]);

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const processWhatsappFile = useCallback(async (f: File) => {
    setExtractingWa(true);
    try {
      const base64 = await fileToBase64(f);
      setWaScreenshots((prev) => [...prev, { base64, fileType: f.type }]);
      toast({ title: "Captura añadida ✓" });
    } catch (err) {
      console.error("WhatsApp file error:", err);
      toast({ title: "Error al procesar imagen", variant: "destructive" });
    } finally {
      setExtractingWa(false);
    }
  }, []);

  const handleWhatsappImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (waInputRef.current) waInputRef.current.value = "";
    processWhatsappFile(f);
  }, [processWhatsappFile]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) { e.preventDefault(); processWhatsappFile(file); }
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [processWhatsappFile]);

  const handleSend = async () => {
    const effectiveName = manualMode ? manualName.trim() : workerInfo?.name;
    const effectiveNumber = manualMode ? manualNumber.trim() : workerInfo?.number;
    const effectiveWorkerId = manualMode ? null : workerId;

    if (manualMode) {
      if (!effectiveName || !effectiveNumber) {
        toast({ title: "Introduce nombre y número de fichar", variant: "destructive" }); return;
      }
    } else if (!workerId || !workerInfo) {
      toast({ title: "Selecciona un trabajador", variant: "destructive" }); return;
    }
    if (configEmails.length === 0) {
      toast({ title: "Sin destinatarios", description: "Configura al menos un email.", variant: "destructive" }); return;
    }
    setSending(true);
    try {
      const fechaStr = fecha ? format(fecha, "dd/MM/yyyy") : null;
      const isToday = fecha && format(fecha, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "sendOperativaNspp",
          sessionToken: getSessionToken(),
          data: {
            workerId: effectiveWorkerId,
            workerName: effectiveName,
            workerNumber: effectiveNumber,
            contexto: contexto.trim() || null,
            fecha: fechaStr || null,
            hora: hora || null,
            esHoy: isToday || false,
            capturas: waScreenshots.length > 0 ? waScreenshots : null,
            pruebas: pruebas.length > 0 ? pruebas.map(p => ({ base64: p.base64, fileType: p.fileType })) : null,
            solicitante: solicitante.trim() || null,
          },
        },
      });
      if (error || !data?.success) throw new Error(data?.error || "Error al enviar");
      toast({ title: "Solicitud NSPP enviada ✓", description: `Notificación enviada a ${configEmails.length} destinatario(s).` });
      setHistoryKey((k) => k + 1);
      setWorkerId(""); setWorkerInfo(null); setManualName(""); setManualNumber(""); setContexto(""); setFecha(undefined); setHora(""); setWaScreenshots([]); setPruebas([]); setSolicitante("");
    } catch (err: any) {
      toast({ title: "Error al enviar", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const addEmail = () => {
    const em = newEmail.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { toast({ title: "Email no válido", variant: "destructive" }); return; }
    if (configEmails.includes(em)) { toast({ title: "Email ya existe", variant: "destructive" }); return; }
    setConfigEmails([...configEmails, em]); setNewEmail("");
  };

  const removeEmail = (em: string) => {
    setConfigEmails(configEmails.filter((e) => e !== em));
    if (primaryEmail === em) setPrimaryEmail(null);
  };

  const saveConfig = async (overridePrimary?: string | null) => {
    const pendingEmail = newEmail.trim().toLowerCase();
    const nextEmails = [...configEmails];
    if (pendingEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pendingEmail)) { toast({ title: "Email no válido", variant: "destructive" }); return; }
      if (!nextEmails.includes(pendingEmail)) nextEmails.push(pendingEmail);
    }
    const finalPrimary = overridePrimary !== undefined ? overridePrimary : primaryEmail;
    setSavingConfig(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "updateOperativaNsppConfig", sessionToken: getSessionToken(), data: { emails: nextEmails, primary_email: finalPrimary } },
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <UserX className="h-4 w-4 text-amber-600" />
              NSPP - No Supera Periodo de Prueba
            </span>
            <Button variant="ghost" size="sm" onClick={() => setShowConfig(!showConfig)} className="h-8 w-8 p-0" title="Configuración">
              <Settings2 className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* WhatsApp screenshots */}
          <div>
            <input ref={waInputRef} type="file" accept="image/*" onChange={handleWhatsappImport} className="hidden" />
            {waScreenshots.length > 0 && (
              <div className="space-y-2 mb-2">
                <div className="grid grid-cols-3 gap-2">
                  {waScreenshots.map((ws, i) => (
                    <div key={i} className="relative rounded-lg border border-primary/20 overflow-hidden aspect-[9/16]">
                      <img src={`data:${ws.fileType};base64,${ws.base64}`} alt={`Captura ${i + 1}`} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setWaScreenshots((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 bg-background/80 backdrop-blur-sm rounded-full p-1 shadow-sm border border-border hover:bg-destructive hover:text-destructive-foreground transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-primary text-center font-medium">✓ {waScreenshots.length} captura{waScreenshots.length > 1 ? "s" : ""} guardada{waScreenshots.length > 1 ? "s" : ""}</p>
              </div>
            )}
            <button type="button" onClick={() => waInputRef.current?.click()} disabled={extractingWa}
              className={cn(
                "w-full flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-primary/30",
                "py-2.5 px-4 transition-colors hover:bg-primary/5 active:scale-[0.99] text-sm font-medium text-primary",
                "focus:outline-none focus:ring-2 focus:ring-primary/30",
                extractingWa && "opacity-60 pointer-events-none"
              )}>
              {extractingWa ? (
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Procesando...</span>
              ) : (
                <>
                  <span className="flex items-center gap-2"><MessageCircle className="h-4 w-4" />{waScreenshots.length > 0 ? "Añadir otra captura" : "Importar captura de WhatsApp"}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">Haz clic para subir o pega con Ctrl+V</span>
                </>
              )}
            </button>
          </div>

          {/* Contexto (optional) */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Comentarios / Información adicional (opcional)</label>
            <Textarea
              value={contexto}
              onChange={(e) => setContexto(e.target.value)}
              placeholder="Escribe aquí comentarios o contexto... La IA elaborará el email automáticamente."
              className="min-h-[80px] text-sm"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Si se rellena, la IA generará un email profesional con esta información.</p>
          </div>

          {/* Fecha y Hora (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">¿Para cuándo? (opcional)</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10",
                      !fecha && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fecha ? format(fecha, "dd/MM/yyyy") : "Fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fecha}
                    onSelect={setFecha}
                    locale={es}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {fecha && (
                <button type="button" onClick={() => setFecha(undefined)} className="text-[11px] text-muted-foreground hover:text-foreground mt-1">
                  ✕ Quitar fecha
                </button>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">¿Antes de qué hora? (opcional)</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10",
                      !hora && "text-muted-foreground"
                    )}
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    {hora || "Hora"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-3 pointer-events-auto" align="start" side="bottom">
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Hora</p>
                      <div className="grid grid-cols-6 gap-1">
                        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => {
                          const selected = hora.startsWith(h + ":");
                          return (
                            <button key={h} type="button"
                              onClick={() => { const mins = hora ? hora.split(":")[1] || "00" : "00"; setHora(`${h}:${mins}`); }}
                              className={cn("h-7 rounded text-xs font-medium transition-colors", selected ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground")}>
                              {h}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Minutos</p>
                      <div className="grid grid-cols-6 gap-1">
                        {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map((m) => {
                          const selected = hora.endsWith(":" + m);
                          return (
                            <button key={m} type="button"
                              onClick={() => { const hrs = hora ? hora.split(":")[0] || "12" : "12"; setHora(`${hrs}:${m}`); }}
                              className={cn("h-7 rounded text-xs font-medium transition-colors", selected ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground")}>
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              {hora && (
                <button type="button" onClick={() => setHora("")} className="text-[11px] text-muted-foreground hover:text-foreground mt-1">
                  ✕ Quitar hora
                </button>
              )}
            </div>
          </div>

          {/* Worker select */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-muted-foreground">Trabajador/a</label>
              <button
                type="button"
                onClick={() => {
                  setManualMode((m) => !m);
                  setWorkerId("");
                  setWorkerInfo(null);
                  setManualName("");
                  setManualNumber("");
                }}
                className="text-[11px] text-primary hover:underline flex items-center gap-1"
              >
                <Pencil className="h-3 w-3" />
                {manualMode ? "Buscar en sistema" : "Introducir manualmente"}
              </button>
            </div>
            {manualMode ? (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={manualNumber}
                  onChange={(e) => setManualNumber(e.target.value)}
                  placeholder="Nº fichar"
                  className="h-10 text-sm"
                />
                <Input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Nombre del trabajador/a"
                  className="h-10 text-sm"
                />
              </div>
            ) : (
              <WorkerSearchSelect value={workerId} onChange={setWorkerId} placeholder="Buscar trabajador/a..." />
            )}
          </div>

          {/* Pruebas / Evidencias */}
          <div>
            <input ref={pruebasInputRef} type="file" accept="image/*" multiple onChange={(e) => {
              const files = e.target.files;
              if (!files) return;
              if (pruebasInputRef.current) pruebasInputRef.current.value = "";
              Array.from(files).forEach(async (f) => {
                try {
                  const b64 = await fileToBase64(f);
                  const preview = URL.createObjectURL(f);
                  setPruebas(prev => [...prev, { base64: b64, fileType: f.type, preview }]);
                } catch { toast({ title: "Error al procesar imagen", variant: "destructive" }); }
              });
            }} className="hidden" />
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Pruebas / Evidencias (opcional)</label>
            {pruebas.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {pruebas.map((p, i) => (
                  <div key={i} className="relative rounded-lg border border-amber-600/20 overflow-hidden aspect-square">
                    <img src={p.preview} alt={`Prueba ${i + 1}`} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setPruebas(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 bg-background/80 backdrop-blur-sm rounded-full p-1 shadow-sm border border-border hover:bg-destructive hover:text-destructive-foreground transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => pruebasInputRef.current?.click()}
              className={cn(
                "w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-amber-600/30",
                "py-2 px-4 transition-colors hover:bg-amber-600/5 active:scale-[0.99] text-sm font-medium text-amber-600",
                "focus:outline-none focus:ring-2 focus:ring-amber-600/30"
              )}>
              <ImagePlus className="h-4 w-4" />
              {pruebas.length > 0 ? `Añadir más (${pruebas.length})` : "Subir fotos como prueba"}
            </button>
            <p className="text-[11px] text-muted-foreground mt-1">Las imágenes se incluirán en el email como evidencia adjunta.</p>
          </div>

          {/* Persona solicitante */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Persona solicitante</label>
            <Input
              value={solicitante}
              onChange={(e) => setSolicitante(e.target.value)}
              placeholder="Nombre del encargado que solicita..."
              className="h-10 text-sm"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Se rellena automáticamente con el encargado del departamento. Puedes cambiarlo.</p>
          </div>

          <Button onClick={handleSend} disabled={sending || (!manualMode && !workerId) || (manualMode && (!manualName.trim() || !manualNumber.trim()))} className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Enviando..." : "Solicitar NSPP"}
          </Button>
        </CardContent>
      </Card>

      {/* Email config */}
      {showConfig && (
        <Card className="animate-fade-in">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Mail className="h-4 w-4 text-primary" />Destinatarios email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingConfig ? (
              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                {configEmails.map((em) => (
                  <div key={em} className="flex items-center gap-2 text-sm">
                    <button type="button" onClick={() => togglePrimaryEmail(em)} title={primaryEmail === em ? "Email principal (TO)" : "Marcar como principal (TO)"}>
                      <Star className={cn("h-4 w-4 transition-colors", primaryEmail === em ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400")} />
                    </button>
                    <span className="flex-1 truncate">{em}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">{primaryEmail === em ? "TO" : "CC"}</span>
                    <button type="button" onClick={() => removeEmail(em)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="nuevo@email.com" className="h-9 text-sm"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }} />
                  <Button variant="outline" size="sm" onClick={addEmail} className="h-9 px-3"><Plus className="h-3.5 w-3.5" /></Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => saveConfig()} disabled={savingConfig} className="w-full gap-1.5">
                  {savingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Guardar configuración
                </Button>
                {configEmails.length > 0 && (
                  <CopyEmailsDialog
                    sourceTab="nspp"
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

      <OperativaHistoryPanel tipo="nspp" refreshKey={historyKey} />
    </div>
  );
}
