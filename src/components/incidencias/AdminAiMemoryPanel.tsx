import { useState, useEffect, useCallback } from "react";
import { Sparkles, Plus, Trash2, Pencil, Check, X, Loader2, Brain, Lightbulb, Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface MemoryEntry {
  id: string;
  titulo: string;
  contenido: string;
  categoria: string;
  suggested_by_ai: boolean;
  created_at: string;
  updated_at: string;
}

interface Suggestion {
  titulo: string;
  contenido: string;
  categoria: string;
}

const CATEGORIAS = [
  { value: 'departamentos', label: 'Departamentos', color: 'bg-blue-500/10 text-blue-600' },
  { value: 'zonas', label: 'Zonas', color: 'bg-green-500/10 text-green-600' },
  { value: 'roles', label: 'Roles', color: 'bg-purple-500/10 text-purple-600' },
  { value: 'turnos', label: 'Turnos', color: 'bg-amber-500/10 text-amber-600' },
  { value: 'procesos', label: 'Procesos', color: 'bg-cyan-500/10 text-cyan-600' },
  { value: 'terminologia', label: 'Terminología', color: 'bg-pink-500/10 text-pink-600' },
  { value: 'general', label: 'General', color: 'bg-muted text-muted-foreground' },
];

function getCategoryBadge(cat: string) {
  const c = CATEGORIAS.find(c => c.value === cat) || CATEGORIAS[CATEGORIAS.length - 1];
  return <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${c.color}`}>{c.label}</Badge>;
}

export function AdminAiMemoryPanel({ sessionToken }: { sessionToken: string }) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCat, setEditCat] = useState("general");

  // New entry form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCat, setNewCat] = useState("general");
  const [saving, setSaving] = useState(false);

  // AI suggestions
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "listMemoryEntries", sessionToken },
      });
      setEntries(data?.entries || []);
    } catch { /* */ }
    finally { setLoading(false); }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error("Título y contenido son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "addMemoryEntry", sessionToken, titulo: newTitle, contenido: newContent, categoria: newCat },
      });
      if (data?.entry) {
        setEntries(prev => [...prev, data.entry]);
        setNewTitle(""); setNewContent(""); setNewCat("general"); setShowNewForm(false);
        toast.success("Entrada añadida a la memoria");
      } else toast.error(data?.error || "Error");
    } catch { toast.error("Error al añadir"); }
    finally { setSaving(false); }
  };

  const handleAddSuggestion = async (s: Suggestion) => {
    setSaving(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "addMemoryEntry", sessionToken, titulo: s.titulo, contenido: s.contenido, categoria: s.categoria, suggested_by_ai: true },
      });
      if (data?.entry) {
        setEntries(prev => [...prev, data.entry]);
        setSuggestions(prev => prev.filter(x => x.titulo !== s.titulo));
        toast.success("Sugerencia añadida");
      }
    } catch { toast.error("Error"); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "updateMemoryEntry", sessionToken, entryId: id, titulo: editTitle, contenido: editContent, categoria: editCat },
      });
      if (data?.entry) {
        setEntries(prev => prev.map(e => e.id === id ? data.entry : e));
        setEditingId(null);
        toast.success("Entrada actualizada");
      }
    } catch { toast.error("Error al actualizar"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "deleteMemoryEntry", sessionToken, entryId: id },
      });
      if (data?.success) {
        setEntries(prev => prev.filter(e => e.id !== id));
        toast.success("Entrada eliminada");
      }
    } catch { toast.error("Error al eliminar"); }
  };

  const handleSuggest = async () => {
    setSuggestLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "suggestMemoryEntries", sessionToken },
      });
      setSuggestions(data?.suggestions || []);
      if (!data?.suggestions?.length) toast.info("No hay más sugerencias por ahora");
    } catch { toast.error("Error al obtener sugerencias"); }
    finally { setSuggestLoading(false); }
  };

  const startEdit = (e: MemoryEntry) => {
    setEditingId(e.id);
    setEditTitle(e.titulo);
    setEditContent(e.contenido);
    setEditCat(e.categoria);
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Memoria de la IA
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Entradas de contexto que la IA usa en dictado, emails, análisis y predicciones. Cuantas más, mejor entiende tu empresa.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 rounded-xl gap-1" onClick={handleSuggest} disabled={suggestLoading}>
            {suggestLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lightbulb className="h-3 w-3" />}
            Sugerencias IA
          </Button>
          <Button size="sm" className="h-8 rounded-xl gap-1" onClick={() => setShowNewForm(true)} disabled={showNewForm}>
            <Plus className="h-3 w-3" /> Añadir
          </Button>
        </div>
      </div>

      {/* AI Suggestions */}
      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
            <p className="text-xs font-medium text-primary flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> La IA sugiere que añadas este contexto:
            </p>
            {suggestions.map((s, i) => (
              <Card key={i} className="rounded-xl border-primary/20 bg-primary/5">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getCategoryBadge(s.categoria)}
                        <span className="text-sm font-medium">{s.titulo}</span>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{s.contenido}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleAddSuggestion(s)} disabled={saving}>
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSuggestions(prev => prev.filter((_, j) => j !== i))}>
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* New entry form */}
      <AnimatePresence>
        {showNewForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Card className="rounded-xl border-border/50">
              <CardContent className="p-3 space-y-3">
                <div className="flex gap-2">
                  <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Título (ej: Zona Cámara)" className="h-8 rounded-lg flex-1 text-sm" />
                  <Select value={newCat} onValueChange={setNewCat}>
                    <SelectTrigger className="h-8 rounded-lg w-[140px] text-xs">
                      <Tag className="h-3 w-3 mr-1" /><SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Describe qué es, para qué sirve, qué hace el personal allí..." className="rounded-lg min-h-[80px] text-sm" />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs" onClick={() => { setShowNewForm(false); setNewTitle(''); setNewContent(''); }}>Cancelar</Button>
                  <Button size="sm" className="h-7 rounded-lg text-xs gap-1" onClick={handleAdd} disabled={saving}>
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Guardar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Existing entries */}
      {entries.length === 0 && !showNewForm ? (
        <Card className="rounded-xl border-border/50">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <Brain className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">La memoria está vacía. Añade entradas o pide sugerencias a la IA.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map(e => (
            <Card key={e.id} className="rounded-xl border-border/50">
              <CardContent className="p-3">
                {editingId === e.id ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input value={editTitle} onChange={ev => setEditTitle(ev.target.value)} className="h-8 rounded-lg flex-1 text-sm" />
                      <Select value={editCat} onValueChange={setEditCat}>
                        <SelectTrigger className="h-8 rounded-lg w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Textarea value={editContent} onChange={ev => setEditContent(ev.target.value)} className="rounded-lg min-h-[60px] text-sm" />
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleUpdate(e.id)} disabled={saving}>
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getCategoryBadge(e.categoria)}
                        {e.suggested_by_ai && <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5"><Sparkles className="h-2.5 w-2.5" />IA</Badge>}
                        <span className="text-sm font-medium truncate">{e.titulo}</span>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{e.contenido}</p>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(e)}>
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDelete(e.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Cada entrada que añadas mejora el dicatado por voz, la redacción de emails a RRHH, la clasificación de incidencias y el análisis predictivo. Usa "Sugerencias IA" para que la propia IA te diga qué contexto necesita.
      </p>
    </div>
  );
}
