import { useState, useEffect, useCallback } from "react";
import { Layers, Plus, Trash2, Loader2, Check, X, Target, Sparkles, GripVertical, Sun, Moon, Pipette } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GravedadConfig } from "@/hooks/useGravedades";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Color helpers ──
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function lightenColor(hex: string, amount = 15): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.min(100, l + amount));
}

function darkenColor(hex: string, amount = 15): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, l - amount));
}

export function AdminGravedadesTab() {
  const [gravedades, setGravedades] = useState<GravedadConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const sessionToken = localStorage.getItem("manager_session_token") || "";

  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newLabelPlural, setNewLabelPlural] = useState("");
  const [newColor, setNewColor] = useState("#93d600");
  const [newPuntos, setNewPuntos] = useState(1);
  const [adding, setAdding] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<GravedadConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [puntosConfig, setPuntosConfig] = useState({
    sistema_puntos_activo: true,
    umbral_amonestacion_puntos: 80,
    umbral_sancion_puntos: 150,
    periodo_puntos_dias: 365,
  });
  const [puntosSaving, setPuntosSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gravRes, rulesRes] = await Promise.all([
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "listGravedades", sessionToken },
        }),
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "getGlobalRules", sessionToken },
        }),
      ]);
      setGravedades(gravRes.data?.gravedades || []);
      const gr = rulesRes.data?.rule;
      if (gr) {
        setPuntosConfig({
          sistema_puntos_activo: gr.sistema_puntos_activo !== false,
          umbral_amonestacion_puntos: gr.umbral_amonestacion_puntos ?? 80,
          umbral_sancion_puntos: gr.umbral_sancion_puntos ?? 150,
          periodo_puntos_dias: gr.periodo_puntos_dias ?? 365,
        });
      }
    } catch {
      toast.error("Error al cargar gravedades");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = gravedades.findIndex(g => g.id === active.id);
    const newIndex = gravedades.findIndex(g => g.id === over.id);
    const reordered = arrayMove(gravedades, oldIndex, newIndex).map((g, i) => ({ ...g, sort_order: i }));
    setGravedades(reordered);
    try {
      await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "reorderGravedades",
          sessionToken,
          items: reordered.map(g => ({ id: g.id, sort_order: g.sort_order })),
        },
      });
    } catch {
      toast.error("Error al reordenar");
      load();
    }
  };

  const handleAdd = async () => {
    if (!newKey.trim() || !newLabel.trim()) return;
    setAdding(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "createGravedad", sessionToken,
          key: newKey.trim().toLowerCase().replace(/\s+/g, "_"),
          label: newLabel.trim(),
          label_plural: newLabelPlural.trim() || newLabel.trim() + "s",
          color: newColor,
          puntos: newPuntos,
        },
      });
      if (data?.success !== false) {
        toast.success("Gravedad creada");
        setShowAdd(false);
        setNewKey(""); setNewLabel(""); setNewLabelPlural(""); setNewColor("#93d600"); setNewPuntos(1);
        load();
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error al crear"); } finally { setAdding(false); }
  };

  const handleUpdate = async (id: string, updates: Partial<GravedadConfig>) => {
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "updateGravedad", sessionToken, gravedadId: id, ...updates },
      });
      if (data?.success !== false) {
        load();
      } else {
        toast.error(data?.error || "Error al actualizar");
      }
    } catch { toast.error("Error al actualizar"); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "deleteGravedad", sessionToken, gravedadId: deleteTarget.id },
      });
      if (data?.success !== false) {
        toast.success("Gravedad eliminada");
        setDeleteTarget(null);
        load();
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error"); } finally { setDeleting(false); }
  };

  const handleSavePuntos = async () => {
    const puntosMap: Record<string, number> = {};
    for (const g of gravedades) {
      puntosMap[`puntos_${g.key}`] = g.puntos;
    }
    setPuntosSaving(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "saveGlobalRules", sessionToken,
          rules: { ...puntosConfig, ...puntosMap },
        },
      });
      if (data?.success) toast.success("Sistema de puntos guardado");
      else toast.error(data?.error || "Error");
    } catch { toast.error("Error al guardar"); }
    finally { setPuntosSaving(false); }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Niveles de gravedad</h2>
          <Badge variant="secondary" className="text-[10px]">{gravedades.filter(g => g.active).length} activos</Badge>
        </div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Añadir
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Arrastra para reordenar. Usa los botones de color para aclarar/oscurecer o copiar de otra gravedad.
      </p>

      {/* Gravedades table */}
      <Card className="rounded-2xl border-border/40">
        <CardContent className="p-4 space-y-2">
          <div className="grid grid-cols-[28px_auto_1fr_80px_120px_60px_40px] gap-2 items-center px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            <span></span>
            <span></span>
            <span>Nombre</span>
            <span className="text-center">Puntos</span>
            <span className="text-center">Color</span>
            <span className="text-center">Activa</span>
            <span></span>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={gravedades.map(g => g.id)} strategy={verticalListSortingStrategy}>
              {gravedades.map((g) => (
                <SortableGravedadRow
                  key={g.id}
                  gravedad={g}
                  allGravedades={gravedades}
                  onUpdate={handleUpdate}
                  onDelete={setDeleteTarget}
                />
              ))}
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>

      {/* Points system config */}
      <Card className="rounded-2xl border-primary/20 bg-card">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0 bg-primary/10">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold">Sistema de puntos</h3>
            <Badge variant="secondary" className="text-[10px] px-2 py-0 ml-auto">
              {puntosConfig.sistema_puntos_activo ? "Activo" : "Inactivo"}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={puntosConfig.sistema_puntos_activo}
              onCheckedChange={v => setPuntosConfig(p => ({ ...p, sistema_puntos_activo: v }))}
            />
            <span className="text-sm font-medium">Activar sistema de puntos</span>
          </div>

          {puntosConfig.sistema_puntos_activo && (
            <>
              <p className="text-[10px] text-muted-foreground">
                Los puntos de cada gravedad se acumulan por trabajador. Al alcanzar el umbral de amonestación, se genera una amonestación. Al alcanzar el de sanción, se genera una sanción directamente.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {gravedades.filter(g => g.active).map(g => (
                  <div
                    key={g.id}
                    className="rounded-xl border p-3 space-y-1"
                    style={{ borderColor: `${g.color}33`, backgroundColor: `${g.color}0d` }}
                  >
                    <span className="text-[10px] text-muted-foreground">{g.label}</span>
                    <div className="text-center font-bold text-lg text-foreground">{g.puntos}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Umbral amonestación (pts)</label>
                  <Input
                    type="number" min={1}
                    value={puntosConfig.umbral_amonestacion_puntos}
                    onChange={e => setPuntosConfig(p => ({ ...p, umbral_amonestacion_puntos: parseInt(e.target.value) || 80 }))}
                    className="h-9 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Umbral sanción (pts)</label>
                  <Input
                    type="number" min={1}
                    value={puntosConfig.umbral_sancion_puntos}
                    onChange={e => setPuntosConfig(p => ({ ...p, umbral_sancion_puntos: parseInt(e.target.value) || 150 }))}
                    className="h-9 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Periodo acumulación (días)</label>
                  <Input
                    type="number" min={30} max={730}
                    value={puntosConfig.periodo_puntos_dias}
                    onChange={e => setPuntosConfig(p => ({ ...p, periodo_puntos_dias: parseInt(e.target.value) || 365 }))}
                    className="h-9 rounded-xl"
                  />
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground italic">
                <span className="font-semibold text-foreground">{puntosConfig.umbral_amonestacion_puntos} pts</span> = amonestación, <span className="font-semibold text-foreground">{puntosConfig.umbral_sancion_puntos} pts</span> = sanción, en los últimos <span className="font-semibold text-foreground">{puntosConfig.periodo_puntos_dias} días</span>.
              </p>
            </>
          )}

          <Button size="sm" className="h-8 rounded-xl gap-1" onClick={handleSavePuntos} disabled={puntosSaving}>
            {puntosSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Guardar sistema de puntos
          </Button>
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva gravedad</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Clave (identificador único)</label>
              <Input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Ej: critica" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nombre</label>
              <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Ej: Crítica" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nombre plural</label>
              <Input value={newLabelPlural} onChange={e => setNewLabelPlural(e.target.value)} placeholder="Ej: Críticas" />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="h-8 w-8 rounded cursor-pointer" />
                  <Input value={newColor} onChange={e => setNewColor(e.target.value)} className="h-8 flex-1 text-xs" />
                </div>
              </div>
              <div className="w-24">
                <label className="text-xs text-muted-foreground mb-1 block">Puntos</label>
                <Input type="number" min={1} value={newPuntos} onChange={e => setNewPuntos(parseInt(e.target.value) || 1)} className="h-8" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={!newKey.trim() || !newLabel.trim() || adding}>
              {adding && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>¿Eliminar gravedad?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se desactivará la gravedad <strong>"{deleteTarget?.label}"</strong>. Las incidencias existentes con esta gravedad no se verán afectadas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sortable row ──
function SortableGravedadRow({
  gravedad: g,
  allGravedades,
  onUpdate,
  onDelete,
}: {
  gravedad: GravedadConfig;
  allGravedades: GravedadConfig[];
  onUpdate: (id: string, updates: Partial<GravedadConfig>) => void;
  onDelete: (g: GravedadConfig) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: g.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const [editLabel, setEditLabel] = useState(g.label);
  const [editing, setEditing] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[28px_auto_1fr_80px_120px_60px_40px] gap-2 items-center px-3 py-2.5 rounded-xl bg-muted/30 border border-border/20 group/row"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="h-7 w-7 rounded-md flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Color dot */}
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }} />

      {/* Name */}
      {editing ? (
        <div className="flex items-center gap-1">
          <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} className="h-7 text-sm flex-1" autoFocus
            onKeyDown={e => { if (e.key === "Enter") { onUpdate(g.id, { label: editLabel }); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
          />
          <button onClick={() => { onUpdate(g.id, { label: editLabel }); setEditing(false); }} className="h-6 w-6 rounded flex items-center justify-center hover:bg-primary/10 text-primary">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setEditing(false)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <span className="text-sm font-medium cursor-pointer hover:text-primary transition-colors" onDoubleClick={() => { setEditing(true); setEditLabel(g.label); }}>
          {g.label}
          <span className="text-[10px] text-muted-foreground ml-1.5">({g.key})</span>
        </span>
      )}

      {/* Points */}
      <Input
        type="number" min={1} max={999}
        defaultValue={g.puntos}
        className="h-7 text-center text-xs"
        onBlur={e => {
          const v = parseInt(e.target.value) || 1;
          if (v !== g.puntos) onUpdate(g.id, { puntos: v });
        }}
        onKeyDown={e => {
          if (e.key === "Enter") {
            const v = parseInt((e.target as HTMLInputElement).value) || 1;
            if (v !== g.puntos) onUpdate(g.id, { puntos: v });
          }
        }}
      />

      {/* Color with tools */}
      <div className="flex items-center justify-center gap-0.5">
        <input
          type="color"
          value={g.color}
          onChange={e => onUpdate(g.id, { color: e.target.value })}
          className="h-7 w-7 rounded cursor-pointer border border-border/30"
        />
        <button
          onClick={() => onUpdate(g.id, { color: lightenColor(g.color) })}
          className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Más claro"
        >
          <Sun className="h-3 w-3" />
        </button>
        <button
          onClick={() => onUpdate(g.id, { color: darkenColor(g.color) })}
          className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Más oscuro"
        >
          <Moon className="h-3 w-3" />
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Copiar color de..."
            >
              <Pipette className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <p className="text-[10px] text-muted-foreground mb-1.5">Copiar color de:</p>
            <div className="flex flex-wrap gap-1">
              {allGravedades.filter(og => og.id !== g.id).map(og => (
                <button
                  key={og.id}
                  onClick={() => onUpdate(g.id, { color: og.color })}
                  className="h-7 w-7 rounded-md border border-border/40 hover:scale-110 transition-transform"
                  style={{ backgroundColor: og.color }}
                  title={og.label}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active toggle */}
      <div className="flex justify-center">
        <Switch checked={g.active} onCheckedChange={checked => onUpdate(g.id, { active: checked })} />
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(g)}
        className="h-7 w-7 rounded-md flex items-center justify-center opacity-0 group-hover/row:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
