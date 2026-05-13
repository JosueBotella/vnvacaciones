import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Pencil, History, RotateCcw, Power, FileText, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PromptVersion {
  id: string;
  version_number: number;
  content: string;
  author_name: string | null;
  change_notes: string | null;
  created_at: string;
}

interface AiPrompt {
  id: string;
  prompt_key: string;
  name: string;
  description: string | null;
  category: string;
  default_content: string;
  is_active: boolean;
  current_version_id: string | null;
  current_version: PromptVersion | null;
  updated_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  analisis: "Análisis",
  documento: "Documentos legales",
  consulta: "Consultas",
  analitica: "Analítica",
  utilidad: "Utilidades",
  general: "General",
};

const CATEGORY_COLORS: Record<string, string> = {
  analisis: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  documento: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  consulta: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  analitica: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  utilidad: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  general: "bg-muted text-muted-foreground",
};

export function AdminAiPromptsPanel({ sessionToken }: { sessionToken: string }) {
  const [loading, setLoading] = useState(true);
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [editing, setEditing] = useState<AiPrompt | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorNotes, setEditorNotes] = useState("");
  const [activateOnSave, setActivateOnSave] = useState(true);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("incidencias-ai-prompts", {
        body: { action: "list", sessionToken },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Error cargando prompts");
        return;
      }
      setPrompts(data?.prompts || []);
    } catch (e: any) {
      toast.error(e?.message || "Error cargando prompts");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Filter out the technical placeholder so users never see it
  const isPlaceholder = (txt: string | null | undefined) =>
    !txt || txt.trim() === "" || txt.includes("__PENDING_SYNC_FROM_CODE__");

  const openEditor = useCallback(async (p: AiPrompt) => {
    setEditing(p);
    setEditorNotes("");
    setActivateOnSave(true);
    const current = p.current_version?.content;
    setEditorContent(isPlaceholder(current) ? "" : (current || ""));
    try {
      const { data } = await supabase.functions.invoke("incidencias-ai-prompts", {
        body: { action: "get", sessionToken, promptId: p.id },
      });
      const cleanVersions = (data?.versions || []).filter(
        (v: PromptVersion) => !isPlaceholder(v.content)
      );
      setVersions(cleanVersions);
    } catch {
      setVersions([]);
    }
  }, [sessionToken]);

  const closeEditor = () => {
    setEditing(null);
    setVersions([]);
    setEditorContent("");
    setEditorNotes("");
  };

  const handleToggle = async (p: AiPrompt, isActive: boolean) => {
    if (isActive && !p.current_version_id) {
      toast.error("Primero guarda una versión antes de activar el override.");
      return;
    }
    setPrompts((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: isActive } : x)));
    try {
      const { data } = await supabase.functions.invoke("incidencias-ai-prompts", {
        body: { action: "toggleActive", sessionToken, promptId: p.id, isActive },
      });
      if (data?.error) {
        toast.error(data.error);
        setPrompts((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: !isActive } : x)));
      } else {
        toast.success(isActive ? "Override activado" : "Override desactivado (vuelve al original)");
      }
    } catch (e: any) {
      toast.error(e?.message || "Error");
      setPrompts((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: !isActive } : x)));
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editorContent.trim()) {
      toast.error("El contenido no puede estar vacío");
      return;
    }
    setSavingEdit(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-ai-prompts", {
        body: {
          action: "saveVersion",
          sessionToken,
          promptId: editing.id,
          content: editorContent,
          changeNotes: editorNotes.trim() || null,
          activate: activateOnSave,
        },
      });
      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success("Nueva versión guardada");
        await load();
        // Reabrir con la nueva versión
        const refreshed = (await supabase.functions.invoke("incidencias-ai-prompts", {
          body: { action: "get", sessionToken, promptId: editing.id },
        })).data;
        if (refreshed?.prompt) {
          setEditing({ ...editing, ...refreshed.prompt, current_version: refreshed.versions?.[0] });
          setVersions(refreshed.versions || []);
          setEditorNotes("");
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "Error guardando");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRestore = async (versionId: string, versionNumber: number) => {
    if (!editing) return;
    if (!confirm(`¿Restaurar la versión ${versionNumber}? Se creará una nueva versión copiando ese contenido.`)) return;
    setSavingEdit(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-ai-prompts", {
        body: { action: "restoreVersion", sessionToken, promptId: editing.id, versionId },
      });
      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(`Versión ${versionNumber} restaurada`);
        await openEditor(editing);
        await load();
      }
    } catch (e: any) {
      toast.error(e?.message || "Error");
    } finally {
      setSavingEdit(false);
    }
  };

  // (handleResetToOriginal removed — el panel ya no expone el "texto original")


  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group by category
  const grouped: Record<string, AiPrompt[]> = {};
  for (const p of prompts) {
    (grouped[p.category] ||= []).push(p);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-border/40 bg-card px-4 py-3">
        <Sparkles className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          Edita los <strong className="text-foreground">prompts adicionales</strong> que se inyectan a la IA. Las instrucciones que guardes aquí se concatenan al prompt original con prioridad máxima cuando el override está <strong className="text-foreground">activo</strong>. Si lo desactivas, la IA vuelve a su comportamiento por defecto sin perder el histórico.
        </div>
      </div>

      {Object.entries(grouped).map(([cat, list]) => (
        <div key={cat} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Badge variant="secondary" className={cn("text-[10px] px-2 py-0 font-medium", CATEGORY_COLORS[cat])}>
              {CATEGORY_LABELS[cat] || cat}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{list.length} prompt{list.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-1.5">
            {list.map((p) => {
              const hasCustomVersion = !!p.current_version_id;
              const isModified = hasCustomVersion && p.current_version?.content !== p.default_content;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 transition-all",
                    p.is_active ? "border-primary/40 shadow-sm" : "border-border/40 hover:border-border/60"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", p.is_active ? "bg-primary/10" : "bg-muted/50")}>
                      <FileText className={cn("h-4 w-4", p.is_active ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate">{p.name}</span>
                        {p.is_active && isModified && (
                          <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4">Activo</Badge>
                        )}
                        {!p.is_active && hasCustomVersion && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">Editado · inactivo</Badge>
                        )}
                        {!hasCustomVersion && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">Original</Badge>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{p.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={p.is_active}
                      onCheckedChange={(v) => handleToggle(p, v)}
                      aria-label="Activar override"
                    />
                    <Button size="sm" variant="ghost" className="h-8 rounded-xl gap-1.5" onClick={() => openEditor(p)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Editor dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              {editing?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editing?.description || "Edita las instrucciones adicionales que se inyectan a la IA."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_280px] gap-0 min-h-0 border-t">
            {/* Editor column */}
            <div className="flex flex-col min-h-0 p-6 space-y-3">
              <div className="flex items-start gap-2 rounded-xl bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                <Sparkles className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Escribe en lenguaje natural <strong className="text-foreground">qué quieres que la IA haga distinto</strong> en este apartado. Estas instrucciones se añaden con prioridad máxima al comportamiento por defecto. Déjalo vacío y desactiva el toggle para volver al original.
                </p>
              </div>
              <Textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                className="flex-1 text-sm min-h-[360px] rounded-xl resize-none leading-relaxed"
                placeholder={`Ejemplo:\n\n- En la sección "Medida disciplinaria" pon en negrita la frase final.\n- Si hay más de 3 retrasos, menciona el total de minutos acumulados.\n- Usa siempre tono formal y evita abreviaturas.`}
              />
              <Input
                value={editorNotes}
                onChange={(e) => setEditorNotes(e.target.value)}
                placeholder="Notas opcionales del cambio (ej: 'Más semibold en medida disciplinaria')"
                className="h-9 rounded-xl text-xs"
              />
            </div>

            {/* Versions column */}
            <div className="border-t md:border-t-0 md:border-l bg-muted/20 flex flex-col min-h-0">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">Histórico ({versions.length})</span>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  {versions.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground px-1">Sin versiones guardadas todavía.</p>
                  ) : (
                    versions.map((v, idx) => (
                      <div
                        key={v.id}
                        className={cn(
                          "rounded-xl border bg-card p-2.5 text-[11px] space-y-1",
                          idx === 0 ? "border-primary/40" : "border-border/40"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Badge variant={idx === 0 ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 h-4">
                              v{v.version_number}
                            </Badge>
                            {idx === 0 && <span className="text-[9px] text-muted-foreground">(actual)</span>}
                          </div>
                          {idx !== 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[10px] gap-1"
                              onClick={() => handleRestore(v.id, v.version_number)}
                              disabled={savingEdit}
                            >
                              <RotateCcw className="h-3 w-3" /> Restaurar
                            </Button>
                          )}
                        </div>
                        <div className="text-muted-foreground">
                          {v.author_name || "Anónimo"} · {new Date(v.created_at).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </div>
                        {v.change_notes && (
                          <div className="text-[10px] italic text-muted-foreground/80 pt-1 border-t border-border/30">
                            "{v.change_notes}"
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex-row items-center justify-between gap-2 sm:justify-between">
            <div className="flex items-center gap-2 text-xs">
              <Switch checked={activateOnSave} onCheckedChange={setActivateOnSave} />
              <span className="text-muted-foreground">Activar al guardar</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={closeEditor} className="rounded-xl">
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={savingEdit} className="rounded-xl gap-1.5">
                {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Guardar nueva versión
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
