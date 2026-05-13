import { useState, useEffect, useCallback } from "react";
import { Tag, Shield, AlertTriangle, ShieldAlert, Loader2, Plus, Trash2, Pencil, Check, X, Zap, FileSpreadsheet, Euro, GripVertical, ChevronDown, Layers, Globe, Search, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useGravedades } from "@/hooks/useGravedades";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ImporteRango {
  min: number;
  max: number | null;
  gravedad: string;
}

interface Category {
  id: string;
  name: string;
  gravedad: string;
  color: string;
  active: boolean;
  sort_order: number;
  department_id: string | null;
  department_ids: string[];
  puntos: number;
  es_critico: boolean;
  consecuencia_critico: string;
  csv_aliases: string[];
  importe_rangos: ImporteRango[] | null;
  tags: CategoryTag[];
}

interface CategoryTag {
  id: string;
  field_name: string;
  field_value: string;
}

interface Department {
  id: string;
  name: string;
}

// Icon lookup for dynamic gravedades
const ICON_MAP: Record<string, typeof Tag> = { Shield, Tag, AlertTriangle, ShieldAlert };

function GravedadSelector({ current, onSelect, configMap }: { current: string; onSelect: (g: string) => void; configMap: Record<string, any> }) {
  const [open, setOpen] = useState(false);
  const config = configMap[current];
  const badgeClass = getBadgeClass(config?.color || "#93d600");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer transition-all hover:scale-105 hover:shadow-md ${badgeClass}`}>
          {config?.label || current}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-36 p-1.5" align="end" sideOffset={4}>
        <p className="text-[10px] text-muted-foreground px-2 py-1 font-medium">Cambiar gravedad</p>
        {Object.entries(configMap).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => { onSelect(key); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${key === current ? "bg-muted font-semibold" : "hover:bg-muted/60"}`}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
            {cfg.label}
            {key === current && <Check className="h-3 w-3 ml-auto text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function getBadgeClass(color: string): string {
  // Generate a generic badge class based on color
  return "border-border/30 bg-muted/40";
}

function TagValueAdder({ fieldName, categoryId, sessionToken, onUpdated }: { fieldName: string; categoryId: string; sessionToken: string; onUpdated: () => void }) {
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Nuevo valor..."
        className="h-6 text-[10px] flex-1"
        onKeyDown={async e => {
          if (e.key === "Enter" && value.trim()) {
            setAdding(true);
            try {
              const { data } = await supabase.functions.invoke("incidencias-operations", {
                body: { action: "addCategoryTag", sessionToken, categoryId, fieldName, fieldValue: value.trim() },
              });
              if (data?.success !== false) { setValue(""); onUpdated(); }
              else toast.error(data?.error || "Error");
            } catch { toast.error("Error"); }
            finally { setAdding(false); }
          }
        }}
      />
      <Button
        size="sm"
        className="h-6 w-6 p-0 text-xs"
        disabled={!value.trim() || adding}
        onClick={async () => {
          setAdding(true);
          try {
            const { data } = await supabase.functions.invoke("incidencias-operations", {
              body: { action: "addCategoryTag", sessionToken, categoryId, fieldName, fieldValue: value.trim() },
            });
            if (data?.success !== false) { setValue(""); onUpdated(); }
            else toast.error(data?.error || "Error");
          } catch { toast.error("Error"); }
          finally { setAdding(false); }
        }}
      >
        {adding ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Plus className="h-2.5 w-2.5" />}
      </Button>
    </div>
  );
}

function CategoryRow({
  cat,
  sessionToken,
  onUpdated,
  onDelete,
  configMap,
  departments,
  allCategories,
}: {
  cat: Category;
  sessionToken: string;
  onUpdated: () => void;
  onDelete: (cat: Category) => void;
  configMap: Record<string, any>;
  departments: Department[];
  allCategories: Category[];
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(cat.name);
  const [editPuntos, setEditPuntos] = useState(cat.puntos);
  const [saving, setSaving] = useState(false);
  const [showRangos, setShowRangos] = useState(false);
  const [rangos, setRangos] = useState<ImporteRango[]>(cat.importe_rangos || []);
  const [showAliases, setShowAliases] = useState(false);
  const [aliasInput, setAliasInput] = useState("");
  const [showTags, setShowTags] = useState(false);
  const [tagFieldName, setTagFieldName] = useState("Devolución");
  const [tagFieldValue, setTagFieldValue] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  const handleGravedadChange = async (newGravedad: string) => {
    try {
      const cfg = configMap[newGravedad];
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "updateCategory", sessionToken, categoryId: cat.id, gravedad: newGravedad, color: cfg?.color || cat.color },
      });
      if (data?.success !== false) {
        toast.success("Gravedad actualizada");
        onUpdated();
      } else {
        toast.error(data?.error || "Error al actualizar");
      }
    } catch {
      toast.error("Error al actualizar gravedad");
    }
  };

  const handleNameSave = async () => {
    if (!editName.trim() || editName.trim() === cat.name) { setEditing(false); return; }
    setSaving(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "updateCategory", sessionToken, categoryId: cat.id, name: editName.trim() },
      });
      if (data?.success !== false) {
        toast.success("Nombre actualizado");
        setEditing(false);
        onUpdated();
      } else {
        toast.error(data?.error || "Error");
      }
    } catch {
      toast.error("Error al actualizar nombre");
    } finally {
      setSaving(false);
    }
  };

  const handlePuntosChange = async (newPuntos: number) => {
    setSaving(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "updateCategory", sessionToken, categoryId: cat.id, puntos: newPuntos },
      });
      if (data?.success !== false) {
        setEditPuntos(newPuntos);
        onUpdated();
      }
    } catch {} finally { setSaving(false); }
  };

  const handleSaveAliases = async (aliases: string[]) => {
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "updateCategory", sessionToken, categoryId: cat.id, csv_aliases: aliases },
      });
      if (data?.success !== false) {
        toast.success("Aliases CSV actualizados");
        onUpdated();
      }
    } catch { toast.error("Error al guardar aliases"); }
  };

  const handleCriticoToggle = async (checked: boolean) => {
    try {
      await supabase.functions.invoke("incidencias-operations", {
        body: { action: "updateCategory", sessionToken, categoryId: cat.id, es_critico: checked },
      });
      onUpdated();
    } catch { toast.error("Error"); }
  };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/30 border border-border/20 group/row"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="h-7 w-7 rounded-md flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />

      {editing ? (
        <div className="flex items-center gap-1.5 flex-1">
          <Input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="h-7 text-sm flex-1"
            autoFocus
            onKeyDown={e => { if (e.key === "Enter") handleNameSave(); if (e.key === "Escape") setEditing(false); }}
          />
          <button onClick={handleNameSave} disabled={saving} className="h-6 w-6 rounded flex items-center justify-center hover:bg-primary/10 text-primary">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => { setEditing(false); setEditName(cat.name); }} className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <span
          className="text-sm font-medium flex-1 cursor-pointer hover:text-primary transition-colors"
          onDoubleClick={() => { setEditing(true); setEditName(cat.name); }}
          title="Doble clic para editar nombre"
        >
          {cat.name}
        </span>
      )}

      {cat.department_ids.length === 0 && (
        <Badge variant="outline" className="text-[9px] text-muted-foreground border-border/30">Global</Badge>
      )}
      {cat.department_ids.length > 0 && cat.department_ids.map(did => {
        const dName = departments.find(d => d.id === did)?.name;
        return dName ? (
          <Badge key={did} variant="outline" className="text-[9px] text-muted-foreground border-primary/20 bg-primary/5 text-primary/80">{dName}</Badge>
        ) : null;
      })}


      {/* Tags CSV badge */}
      <Popover open={showTags} onOpenChange={setShowTags}>
        <PopoverTrigger asChild>
          <button
            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer transition-all ${
              cat.tags?.length ? "border-violet-500/30 bg-violet-500/5 text-violet-600" : "border-border/30 bg-muted/40 text-muted-foreground"
            }`}
            title="Etiquetas CSV (ej: Devolución)"
          >
            <Tag className="h-2.5 w-2.5" />
            {cat.tags?.length ? `${cat.tags.length} etiq.` : "Etiq."}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="end" sideOffset={4}>
          <p className="text-[10px] text-muted-foreground mb-1 font-medium">Etiquetas CSV</p>
          <p className="text-[9px] text-muted-foreground mb-3">Define columnas del CSV y sus valores posibles para matching automático.</p>

          {/* Group tags by field_name */}
          {(() => {
            const grouped: Record<string, CategoryTag[]> = {};
            (cat.tags || []).forEach(t => {
              if (!grouped[t.field_name]) grouped[t.field_name] = [];
              grouped[t.field_name].push(t);
            });
            const fieldNames = Object.keys(grouped);
            return fieldNames.length > 0 ? (
              <div className="space-y-3 mb-3">
                {fieldNames.map(fn => (
                  <div key={fn} className="rounded-lg border border-border/30 bg-muted/20 p-2">
                    <p className="text-[10px] font-semibold text-violet-500 mb-1.5 flex items-center gap-1">
                      <FileSpreadsheet className="h-3 w-3" />
                      Columna: {fn}
                    </p>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {grouped[fn].map(tag => (
                        <span key={tag.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-violet-500/10 text-violet-600 border border-violet-500/20">
                          {tag.field_value}
                          <button
                            onClick={async () => {
                              await supabase.functions.invoke("incidencias-operations", {
                                body: { action: "removeCategoryTag", sessionToken, tagId: tag.id },
                              });
                              onUpdated();
                            }}
                            className="hover:text-destructive transition-colors"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                    {/* Add value to this field */}
                    <TagValueAdder
                      fieldName={fn}
                      categoryId={cat.id}
                      sessionToken={sessionToken}
                      onUpdated={onUpdated}
                    />
                  </div>
                ))}
              </div>
            ) : null;
          })()}

          {/* Add new field */}
          <div className="border-t border-border/20 pt-2">
            <p className="text-[9px] text-muted-foreground mb-1.5">Añadir nueva columna CSV</p>
            <div className="flex items-center gap-1.5">
              <Input
                value={tagFieldName}
                onChange={e => setTagFieldName(e.target.value)}
                placeholder="Nombre columna (ej: Devolución)"
                className="h-7 text-xs flex-1"
              />
              <Input
                value={tagFieldValue}
                onChange={e => setTagFieldValue(e.target.value)}
                placeholder="Primer valor"
                className="h-7 text-xs flex-1"
              />
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={!tagFieldName.trim() || !tagFieldValue.trim() || addingTag}
                onClick={async () => {
                  setAddingTag(true);
                  try {
                    const { data } = await supabase.functions.invoke("incidencias-operations", {
                      body: { action: "addCategoryTag", sessionToken, categoryId: cat.id, fieldName: tagFieldName.trim(), fieldValue: tagFieldValue.trim() },
                    });
                    if (data?.success !== false) {
                      setTagFieldValue("");
                      onUpdated();
                    } else {
                      toast.error(data?.error || "Error");
                    }
                  } catch { toast.error("Error al añadir etiqueta"); }
                  finally { setAddingTag(false); }
                }}
              >
                {addingTag ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Importe rangos badge */}
      <Popover open={showRangos} onOpenChange={(o) => { setShowRangos(o); if (o) setRangos(cat.importe_rangos || []); }}>
        <PopoverTrigger asChild>
          <button
            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer transition-all ${
              cat.importe_rangos?.length ? "border-amber-500/30 bg-amber-500/5 text-amber-600" : "border-border/30 bg-muted/40 text-muted-foreground"
            }`}
            title="Gravedad por importe"
          >
            <Euro className="h-2.5 w-2.5" />
            {cat.importe_rangos?.length ? `${cat.importe_rangos.length} rangos` : "Importe"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="end" sideOffset={4}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground font-medium">Gravedad por importe</p>
              <Switch
                checked={rangos.length > 0}
                onCheckedChange={checked => {
                  if (checked) {
                    setRangos([{ min: 0, max: 50, gravedad: "leve" }, { min: 50, max: null, gravedad: "grave" }]);
                  } else {
                    setRangos([]);
                  }
                }}
              />
            </div>
            <p className="text-[9px] text-muted-foreground">
              Si se activa, la gravedad de esta categoria dependera del importe economico de la incidencia.
            </p>

            {rangos.length > 0 && (
              <div className="space-y-2">
                {rangos.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      type="number" min={0} step={0.01}
                      value={r.min}
                      onChange={e => {
                        const next = [...rangos];
                        next[i] = { ...next[i], min: parseFloat(e.target.value) || 0 };
                        setRangos(next);
                      }}
                      className="h-7 w-16 text-center text-xs"
                      placeholder="Min"
                    />
                    <span className="text-[10px] text-muted-foreground">-</span>
                    <Input
                      type="number" min={0} step={0.01}
                      value={r.max ?? ""}
                      onChange={e => {
                        const next = [...rangos];
                        next[i] = { ...next[i], max: e.target.value === "" ? null : parseFloat(e.target.value) };
                        setRangos(next);
                      }}
                      className="h-7 w-16 text-center text-xs"
                      placeholder="Sin lim."
                    />
                    <Select value={r.gravedad} onValueChange={v => {
                      const next = [...rangos];
                      next[i] = { ...next[i], gravedad: v };
                      setRangos(next);
                    }}>
                      <SelectTrigger className="h-7 text-[10px] flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(configMap).map(([key, cfg]) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: (cfg as any).color }} />
                            {(cfg as any).label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => setRangos(rangos.filter((_, j) => j !== i))}
                      className="h-6 w-6 rounded flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-6 text-[10px] gap-1"
                  onClick={() => setRangos([...rangos, { min: 0, max: null, gravedad: "leve" }])}
                >
                  <Plus className="h-2.5 w-2.5" /> Añadir rango
                </Button>

                {/* Copy from another category */}
                {(() => {
                  const withRangos = allCategories.filter(c => c.id !== cat.id && c.importe_rangos?.length);
                  if (!withRangos.length) return null;
                  return (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full h-6 text-[10px] gap-1 text-muted-foreground">
                          <Copy className="h-2.5 w-2.5" /> Copiar rangos de otra categoría
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="center">
                        <p className="text-[9px] text-muted-foreground mb-1.5">Copiar rangos de:</p>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {withRangos.map(c => (
                            <button
                              key={c.id}
                              className="w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
                              onClick={() => setRangos(JSON.parse(JSON.stringify(c.importe_rangos!)))}
                            >
                              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: c.color }} />
                              {c.name}
                              <span className="text-muted-foreground ml-1">({c.importe_rangos!.length})</span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })()}
              </div>
            )}

            <Button
              size="sm"
              className="w-full h-7 text-xs"
              onClick={async () => {
                try {
                  const { data } = await supabase.functions.invoke("incidencias-operations", {
                    body: {
                      action: "updateCategory", sessionToken, categoryId: cat.id,
                      importe_rangos: rangos.length > 0 ? rangos : null,
                    },
                  });
                  if (data?.success !== false) {
                    toast.success("Rangos de importe guardados");
                    onUpdated();
                    setShowRangos(false);
                  }
                } catch { toast.error("Error al guardar rangos"); }
              }}
            >
              Guardar
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Puntos badge */}
      <Popover>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold border border-border/30 bg-muted/40 hover:bg-muted/60 cursor-pointer transition-all tabular-nums" title="Puntos de esta categoría">
            {cat.puntos} pts
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-32 p-2" align="end" sideOffset={4}>
          <p className="text-[10px] text-muted-foreground mb-1">Puntos</p>
          <Input
            type="number" min={1} max={999}
            defaultValue={cat.puntos}
            className="h-8 text-center text-sm"
            onBlur={e => {
              const v = parseInt(e.target.value) || 1;
              if (v !== cat.puntos) handlePuntosChange(v);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const v = parseInt((e.target as HTMLInputElement).value) || 1;
                if (v !== cat.puntos) handlePuntosChange(v);
              }
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Critico badge */}
      {cat.es_critico && (
        <Badge className="text-[9px] px-1.5 py-0 bg-red-600/15 text-red-600 border-0 gap-0.5">
          <Zap className="h-2.5 w-2.5" /> Crítico
        </Badge>
      )}

      <GravedadSelector current={cat.gravedad} onSelect={handleGravedadChange} configMap={configMap} />

      <div className="flex items-center gap-0.5">
        <button
          onClick={() => { setEditing(true); setEditName(cat.name); }}
          className="h-7 w-7 rounded-md flex items-center justify-center opacity-0 group-hover/row:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
          title="Editar nombre"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(cat)}
          className="h-7 w-7 rounded-md flex items-center justify-center opacity-0 group-hover/row:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
          title="Eliminar categoría"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function DroppableGroup({ groupKey, label, color, icon: Icon, itemCount, children }: {
  groupKey: string;
  label: string;
  color: string;
  icon: typeof Tag;
  itemCount: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group-${groupKey}` });
  return (
    <Card
      ref={setNodeRef}
      className={`rounded-2xl border-border/40 transition-all ${isOver ? "ring-2 ring-primary/40 bg-primary/5" : ""}`}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-medium flex items-center gap-2" style={{ color }}>
          <Icon className="h-3.5 w-3.5" />
          {label}
          <Badge variant="outline" className="text-[10px] ml-1">{itemCount}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 min-h-[40px]">
        {children}
      </CardContent>
    </Card>
  );
}

// ══ Positive Categories Section ══
function PositiveCategoriesSection({ sessionToken }: { sessionToken: string }) {
  const [cats, setCats] = useState<Array<{ id: string; name: string; color: string; active: boolean; sort_order: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#22c55e");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", { body: { action: "listPositiveCategories", sessionToken } });
      setCats(data?.categories || []);
    } catch {} finally { setLoading(false); }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", { body: { action: "createPositiveCategory", sessionToken, name: newName.trim(), color: newColor } });
      if (data?.category) { toast.success("Categoría positiva creada"); setNewName(""); load(); }
      else toast.error(data?.error || "Error");
    } catch { toast.error("Error"); } finally { setAdding(false); }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.functions.invoke("incidencias-operations", { body: { action: "updatePositiveCategory", sessionToken, categoryId: id, active } });
    load();
  };

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center gap-2">
        <Tag className="h-5 w-5 text-green-500" />
        <h2 className="text-lg font-semibold text-foreground">Categorías positivas (reconocimientos)</h2>
        <Badge variant="secondary" className="text-[10px]">{cats.filter(c => c.active).length} activas</Badge>
      </div>
      <div className="flex gap-2 items-end">
        <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre categoría positiva..." className="h-9 rounded-xl flex-1" onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="h-9 w-9 rounded-lg border cursor-pointer" />
        <Button size="sm" className="rounded-xl gap-1" onClick={handleAdd} disabled={!newName.trim() || adding}>
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Añadir
        </Button>
      </div>
      {loading ? <Skeleton className="h-20 rounded-2xl" /> : cats.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No hay categorías positivas configuradas</p>
      ) : (
        <div className="grid gap-2">
          {cats.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/30 border border-border/20">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <span className={cn("text-sm font-medium flex-1", !cat.active && "line-through text-muted-foreground")}>{cat.name}</span>
              <Switch checked={cat.active} onCheckedChange={checked => toggleActive(cat.id, checked)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminCategoriasTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>(["__all__"]);
  const [loading, setLoading] = useState(true);
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const { gravedades, configMap } = useGravedades();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGravedad, setNewGravedad] = useState<string>("leve");
  const [newEsCritico, setNewEsCritico] = useState(false);
  const [adding, setAdding] = useState(false);

  const [deleteCat, setDeleteCat] = useState<Category | null>(null);
  const [deletingCat, setDeletingCat] = useState(false);
  const [deptSearch, setDeptSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "getMyDepartments", sessionToken },
        });
        const depts: Department[] = data?.departments || [];
        setDepartments(depts);
      } catch (e) {
        console.error("Failed to load departments:", e);
      }
    })();
  }, [sessionToken]);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      // If "all" is selected, fetch everything; otherwise fetch for each selected filter
      if (selectedDeptIds.includes("__all__")) {
        const { data } = await supabase.functions.invoke("incidencias-operations", { body: { action: "listCategories", sessionToken } });
        if (data?.success !== false) setCategories(data?.categories || []);
      } else {
        // Fetch for each selected dept id (including __global__)
        const allCats: Category[] = [];
        const seenIds = new Set<string>();
        for (const deptId of selectedDeptIds) {
          const body: any = { action: "listCategories", sessionToken, departmentId: deptId };
          const { data } = await supabase.functions.invoke("incidencias-operations", { body });
          if (data?.categories) {
            for (const c of data.categories) {
              if (!seenIds.has(c.id)) { seenIds.add(c.id); allCats.push(c); }
            }
          }
        }
        setCategories(allCats);
      }
    } catch (e) {
      console.error("Failed to load categories:", e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, selectedDeptIds]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const cfg = configMap[newGravedad];
      const realDeptIds = selectedDeptIds.filter(id => id !== "__all__" && id !== "__global__");
      const body: any = {
        action: "createCategory",
        sessionToken,
        name: newName.trim(),
        gravedad: newGravedad,
        color: cfg?.color || "#93d600",
        puntos: cfg?.puntos || 1,
        es_critico: newEsCritico,
        departmentIds: realDeptIds.length > 0 ? realDeptIds : [],
      };
      const { data } = await supabase.functions.invoke("incidencias-operations", { body });
      if (data?.category) {
        toast.success("Categoría creada");
        setShowAdd(false);
        setNewName("");
        setNewGravedad("leve");
        setNewEsCritico(false);
        loadCategories();
      } else {
        toast.error(data?.error || "Error al crear");
      }
    } catch {
      toast.error("Error al crear categoría");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCat) return;
    setDeletingCat(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "deleteCategory", sessionToken, categoryId: deleteCat.id },
      });
      if (data?.success) {
        toast.success("Categoría desactivada");
        setDeleteCat(null);
        loadCategories();
      } else {
        toast.error(data?.error || "Error");
      }
    } catch {
      toast.error("Error al eliminar categoría");
    } finally {
      setDeletingCat(false);
    }
  };

  const deptLabel = selectedDeptIds.includes("__all__") ? "Todos" : selectedDeptIds.includes("__global__") ? "Global" : selectedDeptIds.map(id => departments.find(d => d.id === id)?.name).filter(Boolean).join(", ") || "";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Find which group a category belongs to
  const findGroupForCat = (catId: string): string | null => {
    for (const g of gravedades.filter(g => g.active)) {
      if (categories.find(c => c.id === catId && c.gravedad === g.key)) return g.key;
    }
    return null;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const catId = active.id as string;
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;

    // The over target could be a category id or a droppable group id (prefixed with "group-")
    let targetGroup: string | null = null;
    const overId = over.id as string;

    if (overId.startsWith("group-")) {
      targetGroup = overId.replace("group-", "");
    } else {
      // Dropped on another category — find its group
      targetGroup = findGroupForCat(overId);
    }

    if (!targetGroup || targetGroup === cat.gravedad) return;

    // Update the category's gravedad to the target group
    const cfg = configMap[targetGroup];
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "updateCategory", sessionToken, categoryId: catId, gravedad: targetGroup, color: cfg?.color || cat.color },
      });
      if (data?.success !== false) {
        toast.success(`Movida a ${cfg?.label || targetGroup}`);
        loadCategories();
      } else {
        toast.error(data?.error || "Error al mover");
      }
    } catch {
      toast.error("Error al mover categoría");
    }
  };

  if (loading && departments.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
    );
  }

  const grouped = gravedades.filter(g => g.active).map((g) => ({
    key: g.key,
    label: g.label_plural,
    singular: g.label,
    color: g.color,
    icon: ICON_MAP[g.icon_name] || Tag,
    items: categories.filter(c => c.gravedad === g.key).sort((a, b) => a.sort_order - b.sort_order),
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Categorías disciplinarias</h2>
          <Badge variant="secondary" className="text-[10px]">{categories.length} tipos</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Selected badges */}
            {!selectedDeptIds.includes("__all__") && selectedDeptIds.map(id => {
              const label = id === "__global__" ? "Global" : departments.find(d => d.id === id)?.name || id;
              return (
                <Badge key={id} variant="secondary" className="text-[10px] gap-1 pl-2 pr-1 py-0.5 rounded-full bg-primary/10 text-primary border-primary/20">
                  {label}
                  <button
                    type="button"
                    onClick={() => {
                      const next = selectedDeptIds.filter(x => x !== id);
                      setSelectedDeptIds(next.length ? next : ["__all__"]);
                    }}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              );
            })}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 text-xs rounded-xl justify-between font-normal gap-2 min-w-[180px]">
                  <div className="flex items-center gap-1.5 truncate">
                    <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate">
                      {selectedDeptIds.includes("__all__")
                        ? "Todos los departamentos"
                        : `${selectedDeptIds.length} seleccionados`}
                    </span>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-1.5 max-h-[360px] overflow-hidden flex flex-col" align="end">
                {/* Search */}
                <div className="relative mb-1.5">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={deptSearch}
                    onChange={(e) => setDeptSearch(e.target.value)}
                    placeholder="Buscar departamento..."
                    className="h-8 text-xs pl-8 rounded-lg"
                  />
                </div>
                <div className="overflow-y-auto flex-1">
                {/* All */}
                {(!deptSearch || "todos los departamentos".includes(deptSearch.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) && (
                <button
                  type="button"
                  onClick={() => setSelectedDeptIds(["__all__"])}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/60 cursor-pointer text-xs transition-colors"
                >
                  <span className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                    selectedDeptIds.includes("__all__") ? "border-primary bg-primary" : "border-muted-foreground/30"
                  )}>
                    {selectedDeptIds.includes("__all__") && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="font-medium">Todos los departamentos</span>
                </button>
                )}
                {/* Global */}
                {(!deptSearch || "global sin departamento".includes(deptSearch.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDeptIds.includes("__global__")) {
                      const next = selectedDeptIds.filter(id => id !== "__global__");
                      setSelectedDeptIds(next.length ? next : ["__all__"]);
                    } else {
                      setSelectedDeptIds(prev => [...prev.filter(id => id !== "__all__"), "__global__"]);
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/60 cursor-pointer text-xs transition-colors"
                >
                  <span className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                    selectedDeptIds.includes("__global__") ? "border-primary bg-primary" : "border-muted-foreground/30"
                  )}>
                    {selectedDeptIds.includes("__global__") && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Global (sin departamento)</span>
                </button>
                )}
                <div className="h-px bg-border/40 my-1" />
                {departments
                  .filter(d => {
                    if (!deptSearch) return true;
                    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    return norm(d.name).includes(norm(deptSearch));
                  })
                  .map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      if (selectedDeptIds.includes(d.id)) {
                        const next = selectedDeptIds.filter(id => id !== d.id);
                        setSelectedDeptIds(next.length ? next : ["__all__"]);
                      } else {
                        setSelectedDeptIds(prev => [...prev.filter(id => id !== "__all__"), d.id]);
                      }
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/60 cursor-pointer text-xs transition-colors"
                  >
                    <span className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                      selectedDeptIds.includes(d.id) ? "border-primary bg-primary" : "border-muted-foreground/30"
                    )}>
                      {selectedDeptIds.includes(d.id) && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <span>{d.name}</span>
                  </button>
                ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Añadir
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : categories.length === 0 ? (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <Tag className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No hay categorías configuradas para {deptLabel || "este filtro"}</p>
          </CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {grouped.map((group) => (
            <DroppableGroup key={group.key} groupKey={group.key} label={group.label} color={group.color} icon={group.icon} itemCount={group.items.length}>
              <SortableContext items={group.items.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {group.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">Arrastra categorías aquí</p>
                ) : (
                  <div className="grid gap-2">
                    {group.items.map((cat) => {
                      return (
                        <CategoryRow
                          key={cat.id}
                          cat={cat}
                          sessionToken={sessionToken}
                          onUpdated={loadCategories}
                          onDelete={setDeleteCat}
                          configMap={configMap}
                          departments={departments}
                          allCategories={categories}
                        />
                      );
                    })}
                  </div>
                )}
              </SortableContext>
            </DroppableGroup>
          ))}
        </DndContext>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Las categorías se configuran según el XVIII Convenio Colectivo · Doble clic en el nombre para editar
      </p>

      {/* ══ POSITIVE CATEGORIES SECTION ══ */}
      <PositiveCategoriesSection sessionToken={sessionToken} />

      {/* Add Category Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva categoría — {deptLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nombre</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Impuntualidad" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Gravedad</label>
              <Select value={newGravedad} onValueChange={setNewGravedad}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {gravedades.filter(g => g.active).map(g => (
                    <SelectItem key={g.key} value={g.key}>{g.label} ({g.puntos} pts)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border/40 p-3">
              <Switch checked={newEsCritico} onCheckedChange={setNewEsCritico} />
              <div>
                <p className="text-sm font-medium flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-red-500" /> Categoría crítica</p>
                <p className="text-[10px] text-muted-foreground">Fuerza directamente una sanción al registrar esta categoría</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={!newName.trim() || adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear categoría
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Category Dialog */}
      <Dialog open={!!deleteCat} onOpenChange={() => setDeleteCat(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Desactivar categoría?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            La categoría <strong>"{deleteCat?.name}"</strong> se desactivará.
            {deleteCat?.department_ids?.length === 0 && !deleteCat?.department_id && (
              <span className="block mt-1 text-amber-500 font-medium">⚠ Esta es una categoría global — el cambio afectará a todos los departamentos.</span>
            )}
            {" "}Las incidencias existentes con esta categoría no se verán afectadas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCat(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingCat}>
              {deletingCat ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Desactivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
