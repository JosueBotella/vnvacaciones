import React, { useState, useEffect, useCallback } from "react";
import { Loader2, Mail, Plus, Trash2, Bot, Sparkles, ChevronDown, Brain, Star, Building2, Globe, FileCog } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AdminAiMemoryPanel } from "./AdminAiMemoryPanel";
import { AdminTrainingDocsPanel } from "./AdminTrainingDocsPanel";
import { DepartmentRulesSection, DeptRule, DEFAULT_DEPT_RULE } from "./DepartmentRulesSection";
import { GlobalRulesSection } from "./GlobalRulesSection";
import { AdminAiPromptsPanel } from "./AdminAiPromptsPanel";

interface EmailConfig {
  id: string;
  email: string;
  activo: boolean;
  created_at: string;
  is_primary?: boolean;
}

type SectionId = "email" | "ai" | "aidocs" | "aiprompts" | "global" | "dept";

const SectionTrigger = React.forwardRef<
  HTMLButtonElement,
  {
    icon: React.ElementType;
    title: string;
    badge?: React.ReactNode;
    isOpen: boolean;
    accentClass?: string;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ icon: Icon, title, badge, isOpen, accentClass, ...props }, ref) => {
  return (
    <button
      ref={ref}
      {...props}
      className={cn(
        "w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border transition-all text-left cursor-pointer",
        isOpen
          ? "bg-card border-primary/30 shadow-sm"
          : "bg-card border-border/40 hover:border-border/60 hover:bg-muted/30"
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center shrink-0", accentClass || "bg-primary/10")}>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        {badge}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
      </div>
    </button>
  );
});
SectionTrigger.displayName = "SectionTrigger";

export function AdminAjustesTab() {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; gravedad: string; department_id: string | null }>>([]);
  const [rulesMap, setRulesMap] = useState<Record<string, DeptRule>>({});
  const [loading, setLoading] = useState(true);

  const [openSections, setOpenSections] = useState<Set<SectionId>>(new Set());

  // Email config
  const [emails, setEmails] = useState<EmailConfig[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  // AI config
  const [aiInstrucciones, setAiInstrucciones] = useState("");
  const [aiTono, setAiTono] = useState("formal");
  const [aiIncluirArticulos, setAiIncluirArticulos] = useState(true);
  const [aiMemoria, setAiMemoria] = useState("");
  const [aiSaving, setAiSaving] = useState(false);


  const toggleSection = (id: SectionId) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const load = useCallback(async () => {
    try {
      const [rulesRes, emailRes, aiRes, catRes] = await Promise.all([
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "listAllDepartmentRules", sessionToken },
        }),
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "getEmailConfig", sessionToken },
        }),
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "getAiConfig", sessionToken },
        }),
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "listCategories", sessionToken },
        }),
      ]);

      const rulesData = rulesRes.data;
      setCategories((catRes.data?.categories || []).map((c: any) => ({ id: c.id, name: c.name, gravedad: c.gravedad, department_id: c.department_id })));
      setDepartments(rulesData?.departments || []);
      const map: Record<string, DeptRule> = {};
      for (const r of (rulesData?.rules || [])) {
        map[r.department_id] = r;
      }
      for (const d of (rulesData?.departments || [])) {
        if (!map[d.id]) {
          map[d.id] = { department_id: d.id, ...DEFAULT_DEPT_RULE };
        }
      }
      setRulesMap(map);
      setEmails(emailRes.data?.emails || []);
      const aiConf = aiRes.data?.config;
      if (aiConf) {
        setAiInstrucciones(aiConf.instrucciones_custom || '');
        setAiTono(aiConf.tono || 'formal');
        setAiIncluirArticulos(aiConf.incluir_articulos !== false);
        setAiMemoria(aiConf.memoria_empresa || '');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  const handleAddEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      toast.error("Introduce un email válido");
      return;
    }
    setEmailLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "addEmailConfig", sessionToken, email: newEmail.trim() },
      });
      if (data?.success) {
        setEmails(prev => [...prev, data.email]);
        setNewEmail("");
        toast.success("Email añadido");
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error al añadir"); }
    finally { setEmailLoading(false); }
  };

  const handleRemoveEmail = async (emailId: string) => {
    setEmailLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "removeEmailConfig", sessionToken, emailId },
      });
      if (data?.success) {
        setEmails(prev => prev.filter(e => e.id !== emailId));
        toast.success("Email eliminado");
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error al eliminar"); }
    finally { setEmailLoading(false); }
  };

  const handleSetPrimary = async (emailId: string) => {
    setEmailLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "setPrimaryEmail", sessionToken, emailId },
      });
      if (data?.success) {
        setEmails(prev => prev.map(e => ({ ...e, is_primary: e.id === emailId })));
        toast.success("Email principal actualizado");
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error al actualizar"); }
    finally { setEmailLoading(false); }
  };



  const tonoLabel = aiTono === 'formal' ? 'Cercano' : aiTono === 'muy_formal' ? 'Formal' : 'Directo';
  const configuredDeptCount = departments.filter(d => rulesMap[d.id]?.activar_automatico || rulesMap[d.id]?.activar_escalado_cadenas).length;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-2">

      {/* ─── Row 1: Email + AI Config side by side ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* Email RRHH */}
        <Collapsible open={openSections.has("email")} onOpenChange={() => toggleSection("email")}>
          <CollapsibleTrigger asChild>
            <SectionTrigger
              icon={Mail}
              title="Destinatarios email RRHH"
              isOpen={openSections.has("email")}
              badge={<Badge variant="secondary" className="text-[10px] px-2 py-0">{emails.length} emails</Badge>}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 py-4 space-y-3">
              {emails.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay emails configurados. Añade al menos uno.</p>
              ) : (
                <div className="space-y-1.5">
                  {emails.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Button
                          size="sm" variant="ghost"
                          className={cn("h-7 w-7 shrink-0 rounded-full p-0", e.is_primary ? "text-primary" : "text-muted-foreground")}
                          onClick={() => handleSetPrimary(e.id)}
                          disabled={emailLoading}
                          title={e.is_primary ? "Destinatario principal (TO)" : "Marcar como principal (TO)"}
                        >
                          <Star className={cn("h-3.5 w-3.5", e.is_primary && "fill-current")} />
                        </Button>
                        <span className="truncate text-sm">{e.email}</span>
                        <Badge variant={e.is_primary ? "default" : "secondary"} className="text-[10px] px-2 py-0">
                          {e.is_primary ? "TO" : "CC"}
                        </Badge>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={() => handleRemoveEmail(e.id)} disabled={emailLoading}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  className="h-9 rounded-xl flex-1" placeholder="email@ejemplo.com"
                  onKeyDown={e => e.key === 'Enter' && handleAddEmail()}
                />
                <Button size="sm" className="h-9 rounded-xl gap-1" onClick={handleAddEmail} disabled={emailLoading}>
                  <Plus className="h-3 w-3" /> Añadir
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                El email marcado con ★ se usa como destinatario principal (TO). El resto se añade en copia (CC).
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Configuración IA */}
        <Collapsible open={openSections.has("ai")} onOpenChange={() => toggleSection("ai")}>
          <CollapsibleTrigger asChild>
            <SectionTrigger
              icon={Bot}
              title="Configuración IA"
              isOpen={openSections.has("ai")}
              accentClass="bg-violet-500/10"
              badge={<Badge variant="secondary" className="text-[10px] px-2 py-0">Tono: {tonoLabel}</Badge>}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 py-4 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tono del email</label>
                <Select value={aiTono} onValueChange={setAiTono}>
                  <SelectTrigger className="h-9 rounded-xl w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formal">Cercano / Informal</SelectItem>
                    <SelectItem value="muy_formal">Formal</SelectItem>
                    <SelectItem value="directo">Directo / Breve</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Instrucciones adicionales</label>
                <Textarea
                  value={aiInstrucciones} onChange={e => setAiInstrucciones(e.target.value)}
                  className="rounded-xl min-h-[80px] text-sm"
                  placeholder="Ej: Siempre menciona que es la primera vez que ocurre si es así..."
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={aiIncluirArticulos} onCheckedChange={setAiIncluirArticulos} />
                <span className="text-xs text-muted-foreground">Incluir artículos del convenio en el análisis</span>
              </div>
              <Button
                size="sm" className="h-8 rounded-xl gap-1"
                onClick={async () => {
                  setAiSaving(true);
                  try {
                    const { data } = await supabase.functions.invoke("incidencias-operations", {
                      body: {
                        action: "saveAiConfig", sessionToken,
                        instrucciones_custom: aiInstrucciones, tono: aiTono,
                        incluir_articulos: aiIncluirArticulos, memoria_empresa: aiMemoria,
                      },
                    });
                    if (data?.success) toast.success("Configuración IA guardada");
                    else toast.error(data?.error || "Error");
                  } catch { toast.error("Error al guardar"); }
                  finally { setAiSaving(false); }
                }}
                disabled={aiSaving}
              >
                {aiSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Guardar configuración IA
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* ─── 3. IA Documentos y Memoria ─── */}
      <Collapsible open={openSections.has("aidocs")} onOpenChange={() => toggleSection("aidocs")}>
        <CollapsibleTrigger asChild>
          <SectionTrigger
            icon={Brain}
            title="IA: Documentos y Memoria"
            isOpen={openSections.has("aidocs")}
            accentClass="bg-amber-500/10"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1 space-y-4 px-1">
            <AdminTrainingDocsPanel sessionToken={sessionToken} />
            <AdminAiMemoryPanel sessionToken={sessionToken} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ─── 4. Editor de prompts de IA ─── */}
      <Collapsible open={openSections.has("aiprompts")} onOpenChange={() => toggleSection("aiprompts")}>
        <CollapsibleTrigger asChild>
          <SectionTrigger
            icon={FileCog}
            title="IA: Editor de prompts"
            isOpen={openSections.has("aiprompts")}
            accentClass="bg-rose-500/10"
            badge={<Badge variant="secondary" className="text-[10px] px-2 py-0">Histórico + override</Badge>}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1 px-1">
            <AdminAiPromptsPanel sessionToken={sessionToken} />
          </div>
        </CollapsibleContent>
      </Collapsible>


      <GlobalRulesSection sessionToken={sessionToken} categories={categories} />

      {/* ─── 5. Reglas por departamento ─── */}
      <DepartmentRulesSection
        departments={departments}
        rulesMap={rulesMap}
        setRulesMap={setRulesMap}
        sessionToken={sessionToken}
        categories={categories}
      />
    </div>
  );
}

