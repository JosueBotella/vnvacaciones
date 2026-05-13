import { useState, useMemo, useCallback, useEffect } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Save, RotateCcw, ArrowRight, Lock, Unlock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isSameDay, addDays,
  isBefore
} from "date-fns";
import { es } from "date-fns/locale";

const LIMITES: Record<string, { min: number; max: number; label: string }> = {
  leve: { min: 0, max: 2, label: "0–2 días" },
  grave: { min: 3, max: 14, label: "3–14 días" },
  muy_grave: { min: 14, max: 30, label: "14–30 días" },
};

interface Props {
  propuestaId: string;
  gravedad: string;
  currentDias: number;
  currentFechaInicio: string | null;
  currentFechas: string[] | null;
  currentSinSuspensionExplicita?: boolean;
  propuestaEstado?: string | null;
  onUpdated: () => void;
}

export function SuspensionCalendarPicker({
  propuestaId, gravedad, currentDias, currentFechaInicio, currentFechas, currentSinSuspensionExplicita = false, propuestaEstado, onUpdated
}: Props) {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const limite = LIMITES[gravedad] || LIMITES.leve;
  const fechaBase = currentFechaInicio ? new Date(currentFechaInicio) : new Date();

  // Whether the admin has unlocked the start-date constraint
  const [unlocked, setUnlocked] = useState(false);

  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => {
    if (currentFechas && currentFechas.length > 0) {
      return new Set(currentFechas);
    }
    if (currentFechaInicio && currentDias > 0) {
      const dates = new Set<string>();
      let d = new Date(currentFechaInicio);
      for (let i = 0; i < currentDias; i++) {
        dates.add(format(d, 'yyyy-MM-dd'));
        d = addDays(d, 1);
      }
      return dates;
    }
    if (currentFechaInicio) {
      const startKey = format(new Date(currentFechaInicio), 'yyyy-MM-dd');
      return new Set([startKey]);
    }
    return new Set();
  });

  const [currentMonth, setCurrentMonth] = useState(() => fechaBase);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sinSuspensionExplicita, setSinSuspensionExplicita] = useState(currentSinSuspensionExplicita);

  useEffect(() => {
    setSinSuspensionExplicita(currentSinSuspensionExplicita);
  }, [currentSinSuspensionExplicita]);

  const sortedDates = useMemo(() => Array.from(selectedDates).sort(), [selectedDates]);
  const totalDays = selectedDates.size;
  const effectiveTotalDays = sinSuspensionExplicita ? 0 : totalDays;
  const isWithinLimits = sinSuspensionExplicita || (totalDays >= limite.min && totalDays <= limite.max);
  const hasChanges = useMemo(() => {
    const oldSet = new Set(currentFechas || []);
    if (oldSet.size !== selectedDates.size) return true;
    for (const d of selectedDates) if (!oldSet.has(d)) return true;
    if (sinSuspensionExplicita !== currentSinSuspensionExplicita) return true;
    return false;
  }, [selectedDates, currentFechas, sinSuspensionExplicita, currentSinSuspensionExplicita]);

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  // Return date = day after last suspension day
  const returnDate = useMemo(() => {
    if (sinSuspensionExplicita || sortedDates.length === 0) return null;
    const lastDate = new Date(sortedDates[sortedDates.length - 1]);
    return addDays(lastDate, 1);
  }, [sortedDates, sinSuspensionExplicita]);

  const persistSuspension = useCallback(async (nextSinSuspensionExplicita = sinSuspensionExplicita) => {
    const fechasArray = nextSinSuspensionExplicita ? [] : sortedDates;
    const totalSelectedDays = fechasArray.length;
    const nextIsWithinLimits = nextSinSuspensionExplicita || (totalSelectedDays >= limite.min && totalSelectedDays <= limite.max);

    if (!nextSinSuspensionExplicita && !nextIsWithinLimits && totalSelectedDays > 0) {
      toast.error(`Los días deben estar entre ${limite.min} y ${limite.max}`);
      return false;
    }

    setSaving(true);
    try {
      const fechaInicioNew = nextSinSuspensionExplicita ? null : (fechasArray.length > 0 ? fechasArray[0] : null);
      const suspensionDias = nextSinSuspensionExplicita ? 0 : totalSelectedDays;
      // Single backend call: updatePropuestaSuspension now re-runs IA analysis
      // AND regenerates the legal document in one go. No need for a second
      // explicit generateLegalDocument call from the client.
      const { data, error: invokeErr } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "updatePropuestaSuspension",
          sessionToken,
          propuestaId,
          suspension_dias: suspensionDias,
          suspension_fechas: fechasArray,
          fecha_inicio: fechaInicioNew,
          sin_suspension_explicita: nextSinSuspensionExplicita,
        },
      });

      if (invokeErr || !data?.success) {
        toast.error(data?.error || invokeErr?.message || "Error al guardar");
        return false;
      }

      const docOk = data?.document_generated !== false;
      const analysisOk = data?.analysis_regenerated !== false;

      if (!docOk) {
        toast.warning(
          data?.document_generation_error
            ? `Suspensión guardada, pero no se pudo regenerar el documento: ${data.document_generation_error}`
            : "Suspensión guardada, pero el documento legal no pudo regenerarse"
        );
      } else {
        toast.success(
          nextSinSuspensionExplicita
            ? `Sanción sin suspensión guardada · ${analysisOk ? "IA y " : ""}documento regenerados`
            : `Suspensión actualizada: ${totalSelectedDays} días naturales · ${analysisOk ? "IA y " : ""}documento regenerados`
        );
      }
      onUpdated();
      // Broadcast so any open legal-document viewer hard-refreshes immediately.
      try {
        window.dispatchEvent(new CustomEvent('legal-document-regenerated', { detail: { propuestaId } }));
      } catch { /* SSR-safe no-op */ }
      return true;
    } catch {
      toast.error("Error al guardar suspensión");
      return false;
    } finally {
      setSaving(false);
    }
  }, [sinSuspensionExplicita, sortedDates, limite.min, limite.max, sessionToken, propuestaId, onUpdated]);

  const handleSinSuspensionChange = useCallback(async (checked: boolean) => {
    setSinSuspensionExplicita(checked);
    if (checked) {
      setSelectedDates(new Set());
    }
  }, []);

  const toggleDate = useCallback((day: Date) => {
    if (sinSuspensionExplicita) return;
    // When locked, prevent selecting dates before the manager's start date
    if (!unlocked && currentFechaInicio && isBefore(day, new Date(currentFechaInicio))) return;

    const key = format(day, 'yyyy-MM-dd');
    
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= limite.max) {
          toast.error(`Máximo ${limite.max} días para falta ${gravedad === 'muy_grave' ? 'muy grave' : gravedad}`);
          return prev;
        }
        next.add(key);
      }
      return next;
    });
  }, [limite.max, gravedad, currentFechaInicio, unlocked, sinSuspensionExplicita]);

  const handleSave = async () => {
    await persistSuspension();
  };

  const handleReset = () => {
    setSelectedDates(new Set());
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 text-[10px] text-destructive/80 hover:text-destructive transition-colors"
      >
        <CalendarDays className="h-3 w-3" />
          {effectiveTotalDays > 0
            ? `${effectiveTotalDays}d suspensión (naturales) · Editar fechas`
          : 'Configurar suspensión'}
      </button>
    );
  }

  const startKey = currentFechaInicio ? format(new Date(currentFechaInicio), 'yyyy-MM-dd') : null;

  return (
    <div className="rounded-2xl border border-destructive/15 bg-destructive/[0.03] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-full bg-destructive/10 flex items-center justify-center">
            <CalendarDays className="h-3 w-3 text-destructive" />
          </div>
          <span className="text-[11px] font-semibold tracking-[-0.02em]">Suspensión de empleo y sueldo</span>
          <span className="text-[9px] text-muted-foreground/50">(días naturales)</span>
        </div>
        <button onClick={() => setExpanded(false)} className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors">
          Cerrar
        </button>
      </div>

      {/* Unlock toggle for start date */}
      {currentFechaInicio && !unlocked && (
        <button
          onClick={() => { setUnlocked(true); toast.info("Fechas desbloqueadas — puedes cambiar cualquier día"); }}
          className="flex items-center gap-1.5 text-[10px] text-amber-500/80 hover:text-amber-400 transition-colors"
        >
          <Lock className="h-3 w-3" />
          Desbloquear para cambiar fecha de inicio
        </button>
      )}
      {unlocked && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-500/70">
          <Unlock className="h-3 w-3" />
          Fechas desbloqueadas — selecciona libremente
        </div>
      )}

      {/* Manual-save status banner */}
      {hasChanges && !saving && isWithinLimits && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-3.5 w-3.5" />
          <span><strong>Cambios sin guardar</strong> — pulsa “Guardar ahora” para regenerar el documento legal.</span>
        </div>
      )}
      {hasChanges && !saving && !isWithinLimits && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          <span><strong>No se puede guardar:</strong> selecciona entre {limite.min} y {limite.max} días para esta gravedad.</span>
        </div>
      )}
      {saving && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[11px] text-blue-600 dark:text-blue-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span><strong>Guardando…</strong> regenerando documento legal con los nuevos días.</span>
        </div>
      )}

      <div className="flex items-center gap-3 text-[10px]">
        <span className={cn(
          "px-2 py-0.5 rounded-full border font-medium",
          isWithinLimits || totalDays === 0
            ? "border-destructive/20 text-destructive/70 bg-destructive/5"
            : "border-destructive/40 text-destructive bg-destructive/10"
        )}>
          {limite.label}
        </span>
        <span className={cn(
          "font-semibold",
          totalDays > 0 && !isWithinLimits ? "text-destructive" : "text-foreground/80"
        )}>
          {effectiveTotalDays} día{effectiveTotalDays !== 1 ? 's' : ''} nat.
        </span>
        {returnDate && (
          <span className="text-muted-foreground/50 flex items-center gap-1">
            <ArrowRight className="h-2.5 w-2.5" />
            Vuelta: <strong className="text-foreground/70">{format(returnDate, "d MMM yyyy", { locale: es })}</strong>
          </span>
        )}
      </div>

      <div className="rounded-xl border border-border/20 bg-background/40 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Label htmlFor={`sin-suspension-${propuestaId}`} className="text-[11px] font-medium text-foreground/90">
              Sanción sin suspensión
            </Label>
            <p className="text-[10px] text-muted-foreground/70">
              Marca esta opción si quieres mantener la sanción, pero sin aplicar suspensión de empleo y sueldo.
            </p>
          </div>
          <Switch
            id={`sin-suspension-${propuestaId}`}
            checked={sinSuspensionExplicita}
            onCheckedChange={handleSinSuspensionChange}
            disabled={saving}
          />
        </div>
        {sinSuspensionExplicita && (
          <p className="mt-2 text-[10px] text-muted-foreground/70">
            El documento legal se regenerará indicando expresamente que la empresa mantiene la sanción, pero no aplica suspensión.
          </p>
        )}
        {saving && sinSuspensionExplicita && (
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-500/80 font-medium">
            <Loader2 className="h-3 w-3 animate-spin" />
            Regenerando documento legal…
          </p>
        )}
      </div>

      {/* Calendar */}
      <div className="rounded-xl overflow-hidden bg-background/60 border border-border/10">
        {/* Month nav */}
        <div className="flex items-center justify-between px-3 py-2">
          <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="text-[11px] font-medium capitalize tracking-[-0.01em]">
            {format(currentMonth, "MMMM yyyy", { locale: es })}
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 px-1">
          {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
            <div key={d + i} className={cn(
              "py-1 text-center text-[9px] font-medium tracking-wider",
              i >= 5 ? "text-muted-foreground/40" : "text-muted-foreground/30"
            )}>
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="px-1 pb-2">
          {weeks.map((weekDays, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-y-0.5">
              {weekDays.map((day) => {
                const inMonth = isSameMonth(day, currentMonth);
                const key = format(day, 'yyyy-MM-dd');
                const isSelected = selectedDates.has(key);
                const isBeforeStart = !unlocked && currentFechaInicio && isBefore(day, new Date(currentFechaInicio));
                const isReturn = returnDate && isSameDay(day, returnDate);
                const isManagerStart = startKey && key === startKey;
                const isWeekendDay = day.getDay() === 0 || day.getDay() === 6;
                const disabled = !inMonth || !!isBeforeStart || sinSuspensionExplicita;

                return (
                  <div key={key} className="flex items-center justify-center py-0.5">
                    <button
                      disabled={disabled}
                      onClick={() => toggleDate(day)}
                      className={cn(
                        "h-7 w-7 rounded-full text-[10px] font-medium transition-all relative flex items-center justify-center",
                        disabled && "opacity-15 cursor-default",
                        !disabled && !isSelected && !isReturn && "hover:bg-destructive/10 cursor-pointer text-foreground/50",
                        !disabled && !isSelected && isWeekendDay && "text-muted-foreground/35",
                        isSelected && "bg-destructive text-white font-semibold shadow-[0_2px_8px_hsl(0,60%,40%,0.3)]",
                        isSelected && isManagerStart && !unlocked && "ring-2 ring-destructive/30 ring-offset-1 ring-offset-background",
                        isReturn && !isSelected && "bg-emerald-500/10 text-emerald-500 font-semibold ring-1 ring-emerald-500/20"
                      )}
                    >
                      {format(day, "d")}
                      {isReturn && !isSelected && (
                        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[5px] text-emerald-500">↩</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Selected dates chips */}
      {!sinSuspensionExplicita && sortedDates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sortedDates.map(d => (
            <span key={d} className="text-[9px] bg-destructive/10 text-destructive/80 px-2 py-0.5 rounded-full font-medium">
              {format(new Date(d), "d MMM", { locale: es })}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          className="h-7 rounded-full text-[10px] gap-1.5 bg-destructive hover:bg-destructive/90 text-white"
          onClick={handleSave}
          disabled={saving || !hasChanges || !isWithinLimits}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Guardar ahora
        </Button>
        {!sinSuspensionExplicita && totalDays > 0 && (
          <Button size="sm" variant="ghost" className="h-7 rounded-full text-[10px] gap-1 text-muted-foreground/50" onClick={handleReset}>
            <RotateCcw className="h-3 w-3" />
            Limpiar
          </Button>
        )}
        {!hasChanges && !saving && (
          <span className="text-[9px] text-muted-foreground/60 italic">
            Edita las fechas y pulsa Guardar ahora para actualizar el documento
          </span>
        )}
        {!sinSuspensionExplicita && !isWithinLimits && totalDays > 0 && (
          <span className="text-[9px] text-destructive/70 font-medium">
            ⚠ Fuera de límites ({limite.min}–{limite.max})
          </span>
        )}
      </div>
    </div>
  );
}
