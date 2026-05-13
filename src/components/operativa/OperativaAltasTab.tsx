import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Camera, Upload, Send, Loader2, X, FileText, Settings2,
  Plus, Trash2, Save, Mail, Sparkles, Star, UserPlus, CalendarIcon, Phone, AtSign, MessageCircle, User,
  ChevronLeft, ChevronRight, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import OperativaHistoryPanel from "./OperativaHistoryPanel";
import CopyEmailsDialog from "./CopyEmailsDialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function OperativaAltasTab() {
  // Form state
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<(string | null)[]>([]);
  const [nombre, setNombre] = useState("");
  const [iban, setIban] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [fechaAlta, setFechaAlta] = useState<Date | undefined>(undefined);
  const [loAntesPosible, setLoAntesPosible] = useState(false);
  const [departamento, setDepartamento] = useState("");
  const [customDepartamento, setCustomDepartamento] = useState("");
  const [grupo, setGrupo] = useState("");
  const [customGrupo, setCustomGrupo] = useState("");
  const [infoAdicional, setInfoAdicional] = useState("");
  const [groups, setGroups] = useState<{ id: string; name: string; department_id: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractingWa, setExtractingWa] = useState(false);
  const [solicitante, setSolicitante] = useState("");
  const [waScreenshots, setWaScreenshots] = useState<{ base64: string; fileType: string }[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Config state
  const [configEmails, setConfigEmails] = useState<string[]>([]);
  const [historyKey, setHistoryKey] = useState(0);
  const [primaryEmail, setPrimaryEmail] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  // Departments
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const waInputRef = useRef<HTMLInputElement>(null);

  const getSessionToken = () =>
    localStorage.getItem("manager_session_token") || sessionStorage.getItem("manager_session_token");

  // Fetch config
  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getOperativaAltasConfig", sessionToken: getSessionToken() },
      });
      if (data?.success) {
        setConfigEmails(data.emails || []);
        setPrimaryEmail(data.primary_email || null);
      }
    } catch (e) {
      console.error("Error loading altas config:", e);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  // Fetch departments
  const fetchDepartments = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getDepartments", sessionToken: getSessionToken() },
      });
      if (data?.success && data.departments) {
        setDepartments(data.departments.map((d: any) => ({ id: d.id, name: d.name })));
      }
    } catch (e) {
      console.error("Error loading departments:", e);
    }
  }, []);

  // Fetch groups for all departments
  const fetchGroups = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("work_groups")
        .select("id, name, department_id")
        .order("sort_order");
      if (data) setGroups(data);
    } catch (e) {
      console.error("Error loading groups:", e);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchDepartments();
    fetchGroups();
  }, [fetchConfig, fetchDepartments, fetchGroups]);

  // File to base64
  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  // Consolidated multi-capture extraction
  const runConsolidatedExtraction = useCallback(async (allScreenshots: { base64: string; fileType: string }[]) => {
    if (allScreenshots.length === 0) return;
    setExtractingWa(true);
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "extractFromWhatsappScreenshot",
          sessionToken: getSessionToken(),
          data: { capturas: allScreenshots, context: "alta" },
        },
      });
      if (data?.extracted) {
        const ex = data.extracted;
        let fieldsFound = 0;
        if (ex.nombre && !nombre) {
          const normalized = ex.nombre.toLowerCase().replace(/(?:^|\s)\S/g, (c: string) => c.toUpperCase());
          setNombre(normalized);
          fieldsFound++;
        }
        if (ex.iban && !iban) { setIban(ex.iban); fieldsFound++; }
        if (ex.telefono && !telefono) { setTelefono(ex.telefono); fieldsFound++; }
        if (ex.email && !email) { setEmail(ex.email); fieldsFound++; }
        if (ex.departamento) {
          const match = departments.find((d) => d.name.toLowerCase().includes(ex.departamento.toLowerCase()));
          if (match) { setDepartamento(match.id); fieldsFound++; }
          else { setDepartamento("__custom__"); setCustomDepartamento(ex.departamento); fieldsFound++; }
        }
        if (ex.fechaAlta) {
          if (ex.fechaAlta === "asap") {
            setLoAntesPosible(true); setFechaAlta(undefined); fieldsFound++;
          } else {
            const parts = ex.fechaAlta.split("/");
            if (parts.length === 3) {
              const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
              if (!isNaN(d.getTime())) { setFechaAlta(d); setLoAntesPosible(false); fieldsFound++; }
            }
          }
        }
        if (ex.solicitante) {
          setSolicitante(ex.solicitante);
          fieldsFound++;
        }
        toast({
          title: fieldsFound > 0
            ? `${fieldsFound} campo(s) detectados desde ${allScreenshots.length} captura${allScreenshots.length > 1 ? "s" : ""}`
            : "No se pudieron extraer datos",
          description: fieldsFound > 0 ? "Revisa los campos auto-rellenados" : "Intenta con otra captura más clara",
          variant: fieldsFound > 0 ? "default" : "destructive",
        });
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
  }, [nombre, iban, telefono, email, departments]);

  // Process WhatsApp screenshot (from file or paste)
  const processWhatsappFile = useCallback(async (f: File) => {
    const base64 = await fileToBase64(f);
    const newScreenshot = { base64, fileType: f.type };
    const updatedScreenshots = [...waScreenshots, newScreenshot];
    setWaScreenshots(updatedScreenshots);
    // Run consolidated extraction with ALL screenshots
    runConsolidatedExtraction(updatedScreenshots);
  }, [waScreenshots, runConsolidatedExtraction]);

  const handleWhatsappImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (waInputRef.current) waInputRef.current.value = "";
    processWhatsappFile(f);
  }, [processWhatsappFile]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          processWhatsappFile(file);
          return;
        }
      }
    }
  }, [processWhatsappFile]);

  // Global paste listener — auto-capture Ctrl+V images without clicking anything
  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  // AI extraction from document
  const extractFromDocument = useCallback(async (f: File) => {
    setExtracting(true);
    try {
      const base64 = await fileToBase64(f);
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "extractAltaDataFromDocument",
          sessionToken: getSessionToken(),
          data: { fileBase64: base64, fileType: f.type },
        },
      });
      if (data?.success && data.extracted) {
        if (data.extracted.nombre && !nombre) {
          const normalized = data.extracted.nombre
            .toLowerCase()
            .replace(/(?:^|\s)\S/g, (c: string) => c.toUpperCase());
          setNombre(normalized);
          toast({ title: "Nombre detectado por IA", description: normalized });
        }
        if (data.extracted.iban && !iban) {
          setIban(data.extracted.iban);
          toast({ title: "IBAN detectado por IA", description: data.extracted.iban });
        }
      }
    } catch (e) {
      console.error("AI extraction error:", e);
    } finally {
      setExtracting(false);
    }
  }, [nombre, iban]);

  // File handling — multi-file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    if (!newFiles.length) return;

    const updatedFiles = [...files, ...newFiles];
    setFiles(updatedFiles);

    // Generate previews for new files
    const newPreviews = newFiles.map((f) => {
      if (f.type.startsWith("image/")) {
        return URL.createObjectURL(f);
      }
      return null;
    });
    setPreviews((prev) => [...prev, ...newPreviews]);

    // Trigger AI extraction for each new file
    newFiles.forEach((f) => extractFromDocument(f));

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      const p = prev[index];
      if (p) URL.revokeObjectURL(p);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Send alta
  const handleSend = async () => {
    if (!nombre.trim()) {
      toast({ title: "Nombre requerido", variant: "destructive" });
      return;
    }
    if (files.length === 0) {
      toast({ title: "Adjunta al menos un archivo", variant: "destructive" });
      return;
    }
    if (configEmails.length === 0) {
      toast({ title: "Sin destinatarios", description: "Configura al menos un email.", variant: "destructive" });
      return;
    }
    if (!loAntesPosible && !fechaAlta) {
      toast({ title: "Selecciona fecha de alta o marca 'Lo antes posible'", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      // Convert all files to base64
      const filesData = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          type: f.type,
          base64: await fileToBase64(f),
        }))
      );

      const deptName = departamento === "__custom__"
        ? customDepartamento
        : departments.find((d) => d.id === departamento)?.name || "";

      const grupoName = grupo === "__custom__"
        ? customGrupo
        : groups.find((g) => g.id === grupo)?.name || "";

      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "sendOperativaAlta",
          sessionToken: getSessionToken(),
          data: {
            nombre: nombre.trim(),
            iban: iban.trim() || null,
            telefono: telefono.trim() || null,
            email: email.trim() || null,
            fechaAlta: loAntesPosible ? "Lo antes posible" : (fechaAlta ? format(fechaAlta, "dd/MM/yyyy") : null),
            departamento: deptName || null,
            grupo: grupoName || null,
            files: filesData,
            solicitante: solicitante.trim() || null,
            infoAdicional: infoAdicional.trim() || null,
            capturas: waScreenshots.length > 0 ? waScreenshots : null,
          },
        },
      });

      if (error || !data?.success) throw new Error(data?.error || "Error al enviar");

      toast({ title: "Alta enviada ✓", description: `Enviada a ${configEmails.length} destinatario(s).` });
      setHistoryKey((k) => k + 1);

      // Reset form
      setNombre("");
      setIban("");
      setTelefono("");
      setEmail("");
      setFechaAlta(undefined);
      setLoAntesPosible(false);
      setDepartamento("");
      setCustomDepartamento("");
      setGrupo("");
      setCustomGrupo("");
      setFiles([]);
      setPreviews([]);
      setSolicitante("");
      setInfoAdicional("");
      setWaScreenshots([]);
    } catch (err: any) {
      toast({ title: "Error al enviar", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // Config actions (same pattern as justificantes)
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
          action: "updateOperativaAltasConfig",
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
              <UserPlus className="h-4 w-4 text-primary" />
              Nueva Alta
            </span>
            <Button variant="ghost" size="sm" onClick={() => setShowConfig(!showConfig)} className="h-8 w-8 p-0" title="Configuración">
              <Settings2 className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* WhatsApp import */}
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
                <div className="grid grid-cols-2 gap-2">
                  {waScreenshots.map((ws, i) => (
                    <div
                      key={i}
                      className="relative rounded-lg border border-primary/20 overflow-hidden bg-muted/30 cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
                      style={{ minHeight: 120 }}
                      onClick={() => setLightboxIndex(i)}
                    >
                      <img
                        src={`data:${ws.fileType};base64,${ws.base64}`}
                        alt={`Captura ${i + 1}`}
                        className="w-full h-auto max-h-48 object-contain mx-auto block"
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setWaScreenshots((prev) => prev.filter((_, idx) => idx !== i)); }}
                        className="absolute top-1 right-1 bg-background/80 backdrop-blur-sm rounded-full p-1 shadow-sm border border-border hover:bg-destructive hover:text-destructive-foreground transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-primary text-center font-medium">
                  ✓ {waScreenshots.length} captura{waScreenshots.length > 1 ? "s" : ""} guardada{waScreenshots.length > 1 ? "s" : ""}
                  <span className="text-muted-foreground font-normal ml-1">· Clic para ampliar</span>
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

          {/* File upload — multi */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Documentos (DNI, SIP, cuenta bancaria...)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />

            {/* File previews grid */}
            {files.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {files.map((f, i) => (
                  <div key={i} className="relative rounded-lg border border-border overflow-hidden aspect-square">
                    {previews[i] ? (
                      <img src={previews[i]!} alt={f.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-muted/20 p-1">
                        <FileText className="h-5 w-5 text-muted-foreground mb-1" />
                        <span className="text-[10px] text-muted-foreground text-center truncate w-full px-1">{f.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border",
                "py-6 px-4 transition-colors hover:border-primary/50 hover:bg-muted/30 active:scale-[0.99]"
              )}
            >
              <div className="flex items-center gap-3 text-muted-foreground">
                <Camera className="h-5 w-5" />
                <span className="text-sm font-medium">Hacer foto</span>
                <span className="text-xs text-muted-foreground/60">o</span>
                <Upload className="h-5 w-5" />
                <span className="text-sm font-medium">Subir</span>
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                La IA extraerá el nombre y la cuenta bancaria automáticamente
              </p>
            </button>

            {extracting && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                <Sparkles className="h-3.5 w-3.5" />
                Extrayendo datos del documento...
              </div>
            )}
          </div>

          {/* Nombre */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Nombre completo *
            </label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Se auto-rellena al subir DNI/SIP"
              className="h-10"
            />
          </div>

          {/* IBAN */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              IBAN / Cuenta bancaria
            </label>
            <Input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="Se auto-rellena si se sube foto de cuenta"
              className="h-10 font-mono text-sm"
            />
          </div>

          {/* Teléfono y Email en grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                <Phone className="h-3 w-3 inline mr-1" />Teléfono
              </label>
              <Input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="600 000 000"
                className="h-10"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                <AtSign className="h-3 w-3 inline mr-1" />Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@ejemplo.com"
                className="h-10"
              />
            </div>
          </div>

          {/* Fecha de alta - moved to end */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Fecha de alta deseada *
            </label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="asap"
                  checked={loAntesPosible}
                  onCheckedChange={(v) => {
                    setLoAntesPosible(!!v);
                    if (v) setFechaAlta(undefined);
                  }}
                />
                <label htmlFor="asap" className="text-sm cursor-pointer">Lo antes posible</label>
              </div>
              {!loAntesPosible && (
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal h-10", !fechaAlta && "text-muted-foreground")}
                    >
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {fechaAlta ? format(fechaAlta, "PPP", { locale: es }) : "Seleccionar fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fechaAlta}
                      onSelect={(d) => { setFechaAlta(d); setDateOpen(false); }}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          {/* Departamento - moved to end */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Departamento
            </label>
            <Select value={departamento} onValueChange={setDepartamento}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Seleccionar departamento" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
                <SelectItem value="__custom__">Otro (escribir)</SelectItem>
              </SelectContent>
            </Select>
            {departamento === "__custom__" && (
              <Input
                value={customDepartamento}
                onChange={(e) => setCustomDepartamento(e.target.value)}
                placeholder="Nombre del departamento"
                className="h-10 mt-2"
              />
            )}
          </div>

          {/* Grupo / Equipo */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Grupo / Equipo
            </label>
            <Select value={grupo} onValueChange={setGrupo}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Seleccionar grupo (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {(departamento && departamento !== "__custom__"
                  ? groups.filter((g) => g.department_id === departamento)
                  : groups
                ).map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
                <SelectItem value="__custom__">Otro (escribir)</SelectItem>
              </SelectContent>
            </Select>
            {grupo === "__custom__" && (
              <Input
                value={customGrupo}
                onChange={(e) => setCustomGrupo(e.target.value)}
                placeholder="Nombre del grupo o equipo"
                className="h-10 mt-2"
              />
            )}
          </div>

          {/* Información adicional */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              <Info className="h-3 w-3 inline mr-1" />Información adicional
            </label>
            <Textarea
              value={infoAdicional}
              onChange={(e) => setInfoAdicional(e.target.value)}
              placeholder="Notas o detalles que RRHH deba tener en cuenta (opcional)"
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={!nombre.trim() || files.length === 0 || sending || extracting}
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
                Enviar Alta a RRHH
              </>
            )}
          </Button>

          {!loadingConfig && configEmails.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
              ⚠️ No hay emails configurados.{" "}
              <button type="button" onClick={() => setShowConfig(true)} className="underline">Configurar</button>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Lightbox for screenshots */}
      <Dialog open={lightboxIndex !== null} onOpenChange={() => setLightboxIndex(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2 sm:p-4 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
          {lightboxIndex !== null && waScreenshots[lightboxIndex] && (
            <>
              <img
                src={`data:${waScreenshots[lightboxIndex].fileType};base64,${waScreenshots[lightboxIndex].base64}`}
                alt={`Captura ${lightboxIndex + 1}`}
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
              {waScreenshots.length > 1 && (
                <div className="flex items-center gap-4 mt-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    disabled={lightboxIndex === 0}
                    onClick={() => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {lightboxIndex + 1} / {waScreenshots.length}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    disabled={lightboxIndex === waScreenshots.length - 1}
                    onClick={() => setLightboxIndex((i) => (i !== null && i < waScreenshots.length - 1 ? i + 1 : i))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Config panel */}
      {showConfig && (
        <Card className="animate-fade-in">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Emails destinatarios (Altas)
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
                    {configEmails.map((em) => {
                      const isPrimary = primaryEmail === em;
                      return (
                        <div
                          key={em}
                          className={cn(
                            "flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm",
                            isPrimary ? "bg-primary/10 border border-primary/20" : "bg-muted/50"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={() => togglePrimaryEmail(em)}
                              className={cn(
                                "flex-shrink-0 transition-colors",
                                isPrimary ? "text-primary" : "text-muted-foreground/40 hover:text-primary/60"
                              )}
                              title={isPrimary ? "Email principal (TO)" : "Marcar como principal"}
                            >
                              <Star className={cn("h-3.5 w-3.5", isPrimary && "fill-current")} />
                            </button>
                            <span className="truncate">{em}</span>
                            {isPrimary && (
                              <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded flex-shrink-0">TO</span>
                            )}
                          </div>
                          <button type="button" onClick={() => removeEmail(em)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
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
                  <p className="text-xs text-muted-foreground text-center py-2">No hay emails configurados</p>
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
                  <Button variant="outline" size="sm" onClick={addEmail} className="h-9 px-3">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <Button onClick={() => saveConfig()} disabled={savingConfig} size="sm" className="w-full">
                  {savingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Guardar
                </Button>
                {configEmails.length > 0 && (
                  <CopyEmailsDialog
                    sourceTab="altas"
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
      <OperativaHistoryPanel
        tipo="alta"
        refreshKey={historyKey}
        onResend={async (entry) => {
          // Try silent resend first (re-uses stored attachments)
          try {
            const { data, error } = await supabase.functions.invoke("admin-operations", {
              body: {
                action: "resendAltaFromHistory",
                sessionToken: getSessionToken(),
                data: { historyId: entry.id },
              },
            });
            if (!error && data?.success) {
              toast({ title: "Alta reenviada", description: "El correo se ha vuelto a enviar con los mismos documentos." });
              setHistoryKey((k) => k + 1);
              return;
            }
            // Old altas without stored attachments — fall back to manual reattach flow
            if (data?.requiresReattach) {
              const d = entry.datos || {};
              setNombre(d.nombre || "");
              setIban(d.iban || "");
              setTelefono(d.telefono || "");
              setEmail(d.email || "");
              setSolicitante(d.solicitante || "");
              setInfoAdicional(d.infoAdicional || "");
              if (d.fechaAlta === "Lo antes posible") {
                setLoAntesPosible(true);
                setFechaAlta(undefined);
              } else if (d.fechaAlta) {
                const parts = String(d.fechaAlta).split("/");
                if (parts.length === 3) {
                  const dt = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                  if (!isNaN(dt.getTime())) {
                    setFechaAlta(dt);
                    setLoAntesPosible(false);
                  }
                }
              }
              if (d.departamento) {
                const match = departments.find((dep) => dep.name === d.departamento);
                if (match) {
                  setDepartamento(match.id);
                  setCustomDepartamento("");
                } else {
                  setDepartamento("__custom__");
                  setCustomDepartamento(d.departamento);
                }
              }
              if (d.grupo) {
                const matchG = groups.find((g) => g.name === d.grupo);
                if (matchG) {
                  setGrupo(matchG.id);
                  setCustomGrupo("");
                } else {
                  setGrupo("__custom__");
                  setCustomGrupo(d.grupo);
                }
              }
              window.scrollTo({ top: 0, behavior: "smooth" });
              toast({
                title: "Datos cargados para reenviar",
                description: "Esta alta antigua no tiene los documentos guardados. Vuelve a adjuntarlos y pulsa 'Enviar Alta'.",
              });
              return;
            }
            toast({ title: "Error al reenviar", description: data?.error || error?.message || "Inténtalo de nuevo", variant: "destructive" });
          } catch (e: any) {
            toast({ title: "Error al reenviar", description: e?.message || "Error inesperado", variant: "destructive" });
          }
        }}
      />
    </div>
  );
}
