import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Clock, GripVertical, Sun, Moon, Coffee, Loader2, Star, Zap, Flame } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface ShiftConfig {
  id: string;
  department_id: string;
  year?: number;
  week?: number;
  name: string;
  shift_key: string;
  start_time: string | null;
  end_time: string | null;
  color: string;
  sort_order: number;
  is_rest: boolean;
  icon_key?: string | null;
}

interface ShiftConfigPanelProps {
  departmentId: string;
  year: number;
  week: number;
  onShiftsChange?: (shifts: ShiftConfig[]) => void;
}

const DEFAULT_SHIFTS: Omit<ShiftConfig, "id" | "department_id">[] = [
  { name: "Mañana", shift_key: "morning", start_time: "08:00", end_time: null, color: "#93d600", sort_order: 0, is_rest: false },
  { name: "Tarde", shift_key: "afternoon", start_time: "14:00", end_time: "22:00", color: "#f59e0b", sort_order: 1, is_rest: false },
  { name: "Noche", shift_key: "night", start_time: "22:00", end_time: "06:00", color: "#8b5cf6", sort_order: 2, is_rest: false },
  { name: "Descanso", shift_key: "rest", start_time: null, end_time: null, color: "#6b7280", sort_order: 3, is_rest: true },
];

// Icon options for custom shifts
const ICON_OPTIONS = [
  { key: "morning", label: "Sol", icon: <Sun className="h-4 w-4" /> },
  { key: "afternoon", label: "Café", icon: <Coffee className="h-4 w-4" /> },
  { key: "night", label: "Luna", icon: <Moon className="h-4 w-4" /> },
  { key: "rest", label: "Reloj", icon: <Clock className="h-4 w-4" /> },
  { key: "star", label: "Estrella", icon: <Star className="h-4 w-4" /> },
  { key: "zap", label: "Rayo", icon: <Zap className="h-4 w-4" /> },
  { key: "flame", label: "Fuego", icon: <Flame className="h-4 w-4" /> },
];

const getShiftIcon = (shiftKey: string, iconKey?: string | null) => {
  // Use iconKey if provided, otherwise fall back to shiftKey
  const key = iconKey || shiftKey;
  const found = ICON_OPTIONS.find(o => o.key === key);
  if (found) return found.icon;
  // Fallback for unknown keys
  return <Star className="h-4 w-4 opacity-70" />;
};

export const ShiftConfigPanel = ({ departmentId, year, week, onShiftsChange }: ShiftConfigPanelProps) => {
  const [shifts, setShifts] = useState<ShiftConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Drag and drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (departmentId && year && week) {
      loadShifts();
    }
  }, [departmentId, year, week]);

  const loadShifts = async () => {
    setLoading(true);
    try {
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) {
        // No session, can't load shifts via edge function
        setLoading(false);
        return;
      }

      const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getWeeklyShifts",
          sessionToken,
          data: { departmentId, year, week },
        },
      });

      if (error || !resp?.success) {
        // Handle session expiration - only for explicit backend session errors
        if (
          resp?.error === "Invalid session" ||
          resp?.error === "Invalid session token" ||
          resp?.error === "Session expired" ||
          resp?.error === "Manager not found"
        ) {
          localStorage.removeItem("manager_session_token");
          localStorage.removeItem("manager_session");
          toast.error("Sesión caducada. Inicia sesión de nuevo.");
          setShifts([]);
          setLoading(false);
          return;
        }
        // For other errors, log and continue with empty state
        console.warn("Could not load shifts:", resp?.error || error?.message);
        setShifts([]);
        setLoading(false);
        return;
      }

      if (resp.shifts && resp.shifts.length > 0) {
        setShifts(resp.shifts);
        onShiftsChange?.(resp.shifts);
      } else {
        // Initialize with defaults if no shifts configured
        await initializeDefaultShifts();
      }
    } catch (e) {
      console.error("Error loading shifts:", e);
      setShifts([]);
    }
    setLoading(false);
  };

  const initializeDefaultShifts = async () => {
    try {
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) return;

      const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "initializeWeeklyShifts",
          sessionToken,
          data: {
            departmentId,
            year,
            week,
            defaultShifts: DEFAULT_SHIFTS,
          },
        },
      });

      if (error || !resp?.success) {
        if (
          resp?.error === "Invalid session" ||
          resp?.error === "Invalid session token" ||
          resp?.error === "Session expired" ||
          resp?.error === "Manager not found"
        ) {
          localStorage.removeItem("manager_session_token");
          localStorage.removeItem("manager_session");
          toast.error("Sesión caducada. Inicia sesión de nuevo.");
          return;
        }
        console.warn("Could not initialize shifts:", resp?.error || error?.message);
        return;
      }

      setShifts(resp.shifts || []);
      onShiftsChange?.(resp.shifts || []);
    } catch (e) {
      console.error("Error initializing shifts:", e);
    }
  };

  const updateShift = async (shiftId: string, updates: Partial<ShiftConfig>) => {
    setSaving(true);
    try {
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) {
        toast.error("Sesión requerida");
        setSaving(false);
        return;
      }

      const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "updateWeeklyShift",
          sessionToken,
          data: { shiftId, updates },
        },
      });

      if (error || !resp?.success) {
        if (
          resp?.error === "Invalid session" ||
          resp?.error === "Invalid session token" ||
          resp?.error === "Session expired" ||
          resp?.error === "Manager not found"
        ) {
          localStorage.removeItem("manager_session_token");
          localStorage.removeItem("manager_session");
          toast.error("Sesión caducada. Inicia sesión de nuevo.");
          setSaving(false);
          return;
        }
        throw new Error(resp?.error || error?.message || "Error al actualizar turno");
      }

      setShifts((prev) => {
        const updated = prev.map((s) => (s.id === shiftId ? { ...s, ...updates } : s));
        onShiftsChange?.(updated);
        return updated;
      });

      toast.success("Turno actualizado");
    } catch (e) {
      console.error("Error updating shift:", e);
      toast.error("Error al actualizar turno");
    }
    setSaving(false);
  };

  const addNewShift = async () => {
    setSaving(true);
    try {
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) {
        toast.error("Sesión requerida");
        setSaving(false);
        return;
      }

      const newShiftKey = `custom_${Date.now()}`;
      const maxOrder = Math.max(...shifts.map((s) => s.sort_order), 0);

      const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "addWeeklyShift",
          sessionToken,
          data: {
            departmentId,
            year,
            week,
            shiftData: {
              name: "Nuevo Turno",
              shift_key: newShiftKey,
              start_time: "09:00",
              end_time: "17:00",
              color: "#93d600",
              sort_order: maxOrder + 1,
              is_rest: false,
            },
          },
        },
      });

      if (error || !resp?.success) {
        if (
          resp?.error === "Invalid session" ||
          resp?.error === "Invalid session token" ||
          resp?.error === "Session expired" ||
          resp?.error === "Manager not found"
        ) {
          localStorage.removeItem("manager_session_token");
          localStorage.removeItem("manager_session");
          toast.error("Sesión caducada. Inicia sesión de nuevo.");
          setSaving(false);
          return;
        }
        throw new Error(resp?.error || error?.message || "Error al crear turno");
      }

      setShifts((prev) => {
        const updated = [...prev, resp.shift];
        onShiftsChange?.(updated);
        return updated;
      });
      toast.success("Turno creado");
    } catch (e) {
      console.error("Error creating shift:", e);
      toast.error("Error al crear turno");
    }
    setSaving(false);
  };

  const deleteShift = async (shiftId: string) => {
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;

    setSaving(true);
    try {
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) {
        toast.error("Sesión requerida");
        setSaving(false);
        return;
      }

      const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "deleteWeeklyShift",
          sessionToken,
          data: { shiftId },
        },
      });

      if (error || !resp?.success) {
        if (
          resp?.error === "Invalid session" ||
          resp?.error === "Invalid session token" ||
          resp?.error === "Session expired" ||
          resp?.error === "Manager not found"
        ) {
          localStorage.removeItem("manager_session_token");
          localStorage.removeItem("manager_session");
          toast.error("Sesión caducada. Inicia sesión de nuevo.");
          setSaving(false);
          return;
        }
        throw new Error(resp?.error || error?.message || "Error al eliminar turno");
      }

      setShifts((prev) => {
        const updated = prev.filter((s) => s.id !== shiftId);
        onShiftsChange?.(updated);
        return updated;
      });
      toast.success("Turno eliminado");
    } catch (e) {
      console.error("Error deleting shift:", e);
      toast.error("Error al eliminar turno");
    }
    setSaving(false);
  };

  const handleDragStart = (e: React.DragEvent, shiftId: string) => {
    setDraggedId(shiftId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", shiftId);
  };

  const handleDragOver = (e: React.DragEvent, shiftId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (shiftId !== draggedId) {
      setDragOverId(shiftId);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }

    const oldIndex = shifts.findIndex((s) => s.id === draggedId);
    const newIndex = shifts.findIndex((s) => s.id === targetId);
    if (oldIndex === -1 || newIndex === -1) {
      setDraggedId(null);
      return;
    }

    const reordered = [...shifts];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    // Update sort_order for all
    const updated = reordered.map((s, i) => ({ ...s, sort_order: i }));
    setShifts(updated);
    onShiftsChange?.(updated);
    setDraggedId(null);

    // Persist all sort orders
    try {
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) return;
      
      const updates = updated.map((s) => ({ id: s.id, sort_order: s.sort_order }));
      const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "reorderWeeklyShifts",
          sessionToken,
          data: { shifts: updates },
        },
      });
      
      if (error || !resp?.success) {
        console.warn("Could not persist shift order:", resp?.error);
        toast.error("Error al guardar el orden");
      } else {
        toast.success("Orden actualizado");
      }
    } catch (err) {
      console.error("Error reordering shifts:", err);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between gap-2 hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>Configurar Turnos</span>
            <Badge variant="secondary" className="ml-2 text-xs">
              {shifts.length}
            </Badge>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="pt-3">
        <Card className="border-dashed">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {shifts.map((shift) => {
                const isCore = ["morning", "afternoon", "night", "rest"].includes(shift.shift_key);
                
                return (
                  <div
                    key={shift.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, shift.id)}
                    onDragOver={(e) => handleDragOver(e, shift.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, shift.id)}
                    onDragEnd={handleDragEnd}
                    className={`group rounded-lg border transition-all bg-background hover:bg-muted/30 p-3 ${
                      draggedId === shift.id ? "opacity-40 scale-95" : ""
                    } ${
                      dragOverId === shift.id ? "border-primary ring-1 ring-primary/30" : ""
                    }`}
                  >
                    {/* Fila 1: grip + color dot + icon + name */}
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Grip icon */}
                      <div className="text-muted-foreground/50 shrink-0 cursor-grab active:cursor-grabbing">
                        <GripVertical className="h-4 w-4" />
                      </div>

                      {/* Color indicator dot */}
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: shift.color }}
                      />

                      {/* Icon - clickable selector for custom shifts */}
                      {isCore ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-muted-foreground shrink-0">
                                {getShiftIcon(shift.shift_key, shift.icon_key)}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">Icono fijo para turnos principales</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <Select
                          value={shift.icon_key || "star"}
                          onValueChange={(v) => {
                            setShifts((prev) =>
                              prev.map((s) =>
                                s.id === shift.id ? { ...s, icon_key: v } : s
                              )
                            );
                            updateShift(shift.id, { icon_key: v } as Partial<ShiftConfig>);
                          }}
                        >
                          <SelectTrigger className="h-7 w-10 p-1 border-none bg-transparent hover:bg-muted/50 shrink-0">
                            <SelectValue>
                              {getShiftIcon(shift.shift_key, shift.icon_key)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="min-w-[120px]">
                            {ICON_OPTIONS.map((opt) => (
                              <SelectItem key={opt.key} value={opt.key}>
                                <div className="flex items-center gap-2">
                                  {opt.icon}
                                  <span className="text-xs">{opt.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {/* Name - flex-1 sin min-w para que no fuerce wrap */}
                      <div className="flex-1 min-w-0">
                        <Input
                          value={shift.name}
                          onChange={(e) =>
                            setShifts((prev) =>
                              prev.map((s) =>
                                s.id === shift.id ? { ...s, name: e.target.value } : s
                              )
                            )
                          }
                          onBlur={() => updateShift(shift.id, { name: shift.name })}
                          className="h-8 text-sm font-medium bg-background border border-input hover:border-primary/50 focus:border-primary rounded-md px-2 transition-colors w-full"
                          placeholder="Nombre del turno"
                          title={shift.name}
                        />
                      </div>
                    </div>

                    {/* Fila 2: color picker personalizado + delete */}
                    <div className="flex items-center gap-2 mt-2 pl-6">
                      {/* Color picker visual: cuadrado clickable + input oculto */}
                      <label className="cursor-pointer relative shrink-0 flex items-center gap-1.5" title="Cambiar color">
                        <div
                          className="w-6 h-6 rounded-md border-2 border-border shadow-sm shrink-0 transition-transform hover:scale-110"
                          style={{ backgroundColor: shift.color }}
                        />
                        <span className="text-xs text-muted-foreground">Color</span>
                        <input
                          type="color"
                          value={shift.color}
                          onChange={(e) =>
                            setShifts((prev) =>
                              prev.map((s) =>
                                s.id === shift.id ? { ...s, color: e.target.value } : s
                              )
                            )
                          }
                          onBlur={() => updateShift(shift.id, { color: shift.color })}
                          className="sr-only"
                        />
                      </label>

                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => deleteShift(shift.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>

                      {/* Badge descanso */}
                      {shift.is_rest && (
                        <Badge variant="secondary" className="text-xs ml-1">
                          Sin horario
                        </Badge>
                      )}
                    </div>

                    {/* Fila 3: horarios (solo si no es descanso) */}
                    {!shift.is_rest && (
                      <div className="flex items-center gap-1.5 mt-1.5 pl-6">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <Input
                          type="time"
                          value={shift.start_time || ""}
                          onChange={(e) =>
                            setShifts((prev) =>
                              prev.map((s) =>
                                s.id === shift.id ? { ...s, start_time: e.target.value } : s
                              )
                            )
                          }
                          onBlur={() => updateShift(shift.id, { start_time: shift.start_time })}
                          className="h-7 flex-1 text-xs min-w-0"
                        />
                        <span className="text-muted-foreground text-xs shrink-0">–</span>
                        <Input
                          type="time"
                          value={shift.end_time || ""}
                          onChange={(e) =>
                            setShifts((prev) =>
                              prev.map((s) =>
                                s.id === shift.id ? { ...s, end_time: e.target.value || null } : s
                              )
                            )
                          }
                          onBlur={() => updateShift(shift.id, { end_time: shift.end_time })}
                          className="h-7 flex-1 text-xs min-w-0"
                          placeholder="fin"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add new shift button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={addNewShift}
              disabled={saving}
            >
              <Plus className="h-4 w-4 mr-2" />
              Añadir Turno
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Los turnos configurados aparecerán en el desplegable del calendario
            </p>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
};
