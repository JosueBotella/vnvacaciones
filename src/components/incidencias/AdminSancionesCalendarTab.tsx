import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, Loader2, Eye, ExternalLink, AlertTriangle, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isSameDay, isWithinInterval,
  addDays, isToday as isDateToday, differenceInCalendarDays
} from "date-fns";
import { es } from "date-fns/locale";

/* ─── Types ─── */
interface Sanction {
  id: string;
  worker_name: string;
  worker_number: string | null;
  gravedad_final: string;
  dias_suspension: number;
  fecha_inicio_suspension: string;
  tipo: string;
  descripcion_hechos: string;
  sancion_aplicada: string | null;
  department_name?: string;
  firmado: boolean;
  created_at: string;
  html_content?: string;
}

interface AdminSancionesCalendarTabProps {
  departmentIds?: string[];
}

/* ─── Desaturated color config with depth ─── */
const gravedadConfig: Record<string, {
  label: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  shadow: string;
  gradient: string;
}> = {
  leve: {
    label: "Leve",
    bg: "bg-[hsl(142,40%,45%,0.08)]",
    border: "border-[hsl(142,40%,45%,0.2)]",
    text: "text-[hsl(142,40%,70%)]",
    dot: "bg-[hsl(142,40%,55%)]",
    pillBg: "bg-[hsl(142,40%,45%,0.2)]",
    pillBorder: "border-[hsl(142,40%,45%,0.35)]",
    pillText: "text-[hsl(142,40%,75%)]",
    shadow: "0 1px 6px hsl(142,40%,45%,0.2), inset 0 1px 0 hsl(142,40%,80%,0.12)",
    gradient: "linear-gradient(180deg, hsl(142,40%,55%,0.08) 0%, transparent 100%)",
  },
  grave: {
    label: "Grave",
    bg: "bg-[hsl(30,60%,50%,0.08)]",
    border: "border-[hsl(30,60%,50%,0.2)]",
    text: "text-[hsl(30,60%,75%)]",
    dot: "bg-[hsl(30,60%,55%)]",
    pillBg: "bg-[hsl(30,60%,50%,0.2)]",
    pillBorder: "border-[hsl(30,60%,50%,0.35)]",
    pillText: "text-[hsl(30,60%,80%)]",
    shadow: "0 1px 6px hsl(30,60%,50%,0.2), inset 0 1px 0 hsl(30,60%,80%,0.12)",
    gradient: "linear-gradient(180deg, hsl(30,60%,60%,0.08) 0%, transparent 100%)",
  },
  muy_grave: {
    label: "Muy grave",
    bg: "bg-[hsl(0,50%,50%,0.08)]",
    border: "border-[hsl(0,50%,50%,0.2)]",
    text: "text-[hsl(0,50%,75%)]",
    dot: "bg-[hsl(0,50%,55%)]",
    pillBg: "bg-[hsl(0,50%,50%,0.2)]",
    pillBorder: "border-[hsl(0,50%,50%,0.35)]",
    pillText: "text-[hsl(0,50%,80%)]",
    shadow: "0 1px 6px hsl(0,50%,50%,0.2), inset 0 1px 0 hsl(0,50%,80%,0.12)",
    gradient: "linear-gradient(180deg, hsl(0,50%,60%,0.08) 0%, transparent 100%)",
  },
};

const SLOT_COUNT = 3;
const PILL_H = 24;
const SLOT_GAP = 6;

/* ─── Lane assignment algorithm ─── */
function assignLanes(sanctions: Sanction[], hidden: Set<string>): Map<string, number> {
  const visible = sanctions.filter(
    (s) => !hidden.has(s.id) && s.fecha_inicio_suspension && s.dias_suspension > 0
  );
  const sorted = [...visible].sort(
    (a, b) => new Date(a.fecha_inicio_suspension).getTime() - new Date(b.fecha_inicio_suspension).getTime()
  );

  // For each lane, track occupied date ranges
  const laneOccupancy: Array<Array<{ start: number; end: number }>> = Array.from(
    { length: SLOT_COUNT },
    () => []
  );
  const result = new Map<string, number>();

  for (const s of sorted) {
    const startTs = new Date(s.fecha_inicio_suspension).getTime();
    const endTs = addDays(new Date(s.fecha_inicio_suspension), s.dias_suspension - 1).getTime();

    // Find first lane where no existing range overlaps
    let assigned = -1;
    for (let lane = 0; lane < SLOT_COUNT; lane++) {
      const conflict = laneOccupancy[lane].some(
        (r) => startTs <= r.end && endTs >= r.start
      );
      if (!conflict) {
        assigned = lane;
        break;
      }
    }
    if (assigned === -1) assigned = 0; // fallback
    laneOccupancy[assigned].push({ start: startTs, end: endTs });
    result.set(s.id, assigned);
  }
  return result;
}

/* ─── Helpers ─── */
function getInitials(name: string) {
  const parts = name.split(" ");
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : name.substring(0, 2).toUpperCase();
}

/* ─── Component ─── */
export function AdminSancionesCalendarTab({ departmentIds }: AdminSancionesCalendarTabProps) {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const isMobile = useIsMobile();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hiddenWorkers, setHiddenWorkers] = useState<Set<string>>(new Set());

  /* ── Fetch ── */
  const fetchSanctions = useCallback(async () => {
    if (!sessionToken) return;
    const { data } = await supabase.functions.invoke("incidencias-operations", {
      body: { action: "listSanctionsCalendar", sessionToken, departmentIds },
    });
    if (data?.success) setSanctions(data.sanctions || []);
    setLoading(false);
  }, [sessionToken, departmentIds]);

  useEffect(() => { fetchSanctions(); }, [fetchSanctions]);

  /* ── Calendar grid ── */
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  /* ── Lane map ── */
  const laneMap = useMemo(() => assignLanes(sanctions, hiddenWorkers), [sanctions, hiddenWorkers]);

  /* ── Workers visible this month ── */
  const activeWorkers = useMemo(() => {
    const map = new Map<string, { name: string; gravedad: string; id: string }>();
    sanctions.forEach((s) => {
      if (!s.fecha_inicio_suspension || !s.dias_suspension) return;
      const start = new Date(s.fecha_inicio_suspension);
      const end = addDays(start, s.dias_suspension - 1);
      if (end >= calStart && start <= calEnd && !map.has(s.id)) {
        map.set(s.id, { name: s.worker_name, gravedad: s.gravedad_final, id: s.id });
      }
    });
    return Array.from(map.values());
  }, [sanctions, calStart, calEnd]);

  /* ── Sanctions for a day ── */
  const getSanctionsForDay = useCallback(
    (day: Date) =>
      sanctions.filter((s) => {
        if (hiddenWorkers.has(s.id)) return false;
        if (!s.fecha_inicio_suspension || !s.dias_suspension) return false;
        const start = new Date(s.fecha_inicio_suspension);
        const end = addDays(start, s.dias_suspension - 1);
        return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
      }),
    [sanctions, hiddenWorkers]
  );

  const isStart = (day: Date, s: Sanction) => isSameDay(day, new Date(s.fecha_inicio_suspension));
  const isEnd = (day: Date, s: Sanction) =>
    isSameDay(day, addDays(new Date(s.fecha_inicio_suspension), s.dias_suspension - 1));

  /* ── Toggle filter ── */
  const toggleWorker = (id: string) => {
    setHiddenWorkers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /* ── View document ── */
  const handleViewDocument = (s: Sanction) => {
    if (s.html_content) {
      const w = window.open("", "_blank");
      if (w) { w.document.write(s.html_content); w.document.close(); }
    }
  };

  const goToToday = () => setCurrentMonth(new Date());
  const isCurrentMonth = isSameMonth(currentMonth, new Date());

  const totalActive = sanctions.length;
  const totalDias = sanctions.reduce((sum, s) => sum + (s.dias_suspension || 0), 0);

  const daySanctions = selectedDay ? getSanctionsForDay(selectedDay) : [];

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  /* ── Day detail content (shared popover / sheet) ── */
  const dayDetailContent = (
    <ScrollArea className="max-h-[60vh]">
      <div className="space-y-2">
        {daySanctions.map((s) => {
          const g = gravedadConfig[s.gravedad_final] || gravedadConfig.leve;
          const startDate = new Date(s.fecha_inicio_suspension);
          const endDate = addDays(startDate, s.dias_suspension - 1);
          const salixUrl = s.worker_number
            ? `https://salix.verdnatura.es/#/worker/${s.worker_number}/time-control`
            : null;
          const isExpanded = expandedId === s.id;

          return (
            <div
              key={s.id}
              className={cn(
                "rounded-xl border border-border/30 overflow-hidden transition-all cursor-pointer",
                "hover:border-border/60 backdrop-blur-sm"
              )}
              onClick={() => setExpandedId(isExpanded ? null : s.id)}
            >
              <div className="p-3.5">
                <div className="flex items-center gap-3 mb-2">
                  <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0", g.pillBg, g.pillText, "border", g.pillBorder)}>
                    {getInitials(s.worker_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{s.worker_name}</p>
                    {s.department_name && (
                      <p className="text-[10px] text-muted-foreground/60 truncate">{s.department_name}</p>
                    )}
                  </div>
                  <span className={cn("text-[9px] px-2.5 py-0.5 rounded-full font-medium shrink-0 border", g.pillBg, g.pillText, g.pillBorder)}>
                    {g.label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
                  <span>{format(startDate, "dd MMM", { locale: es })} → {format(endDate, "dd MMM", { locale: es })} · {s.dias_suspension}d</span>
                  <span className={s.firmado ? "text-[hsl(142,40%,60%)]" : ""}>{s.firmado ? "✓ Firmado" : "Pendiente"}</span>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-border/20 p-3.5 space-y-2 bg-muted/20">
                  {s.descripcion_hechos && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground/60 mb-0.5">Hechos</p>
                      <p className="text-[11px] leading-relaxed text-foreground/80">{s.descripcion_hechos}</p>
                    </div>
                  )}
                  {s.sancion_aplicada && (
                    <div className="flex items-start gap-1.5 text-[11px]">
                      <AlertTriangle className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground/60">{s.sancion_aplicada}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    {s.html_content && (
                      <Button variant="outline" size="sm" className="h-6 text-[10px] rounded-lg gap-1 border-border/30"
                        onClick={(e) => { e.stopPropagation(); handleViewDocument(s); }}>
                        <Eye className="h-3 w-3" /> Documento
                      </Button>
                    )}
                    {salixUrl && (
                      <a href={salixUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-primary/70 hover:text-primary inline-flex items-center gap-0.5 ml-auto transition-colors"
                        onClick={(e) => e.stopPropagation()}>
                        Salix <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );

  /* ─────────────── RENDER ─────────────── */
  return (
    <div className="w-full max-w-[1280px] mx-auto px-8 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground/50 hover:text-foreground"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-medium capitalize tracking-tight select-none min-w-[180px] text-center">
            {format(currentMonth, "MMMM yyyy", { locale: es })}
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground/50 hover:text-foreground"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentMonth && (
            <Button variant="ghost" size="sm" className="h-7 text-[11px] rounded-full px-3 text-muted-foreground/60 hover:text-foreground" onClick={goToToday}>
              Hoy
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground/40 font-light tracking-wide">
            {totalActive} sancion{totalActive !== 1 ? "es" : ""} · {totalDias} días
          </span>
        </div>
      </div>

      {/* ── Worker filter chips ── */}
      {activeWorkers.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {activeWorkers.map((w) => {
            const g = gravedadConfig[w.gravedad] || gravedadConfig.leve;
            const hidden = hiddenWorkers.has(w.id);
            return (
              <button
                key={w.id}
                onClick={() => toggleWorker(w.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-light tracking-wide transition-all border",
                  hidden
                    ? "opacity-30 border-border/10 text-muted-foreground/30"
                    : cn("border-border/20", g.pillText, "hover:border-border/40")
                )}
              >
                <div className={cn("w-1.5 h-1.5 rounded-full shrink-0 transition-colors", hidden ? "bg-muted-foreground/20" : g.dot)} />
                {w.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Calendar grid ── */}
      <div className="rounded-2xl border border-border/10 overflow-hidden bg-[hsl(0,0%,6%,0.3)]">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-border/10">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d, i) => (
            <div key={d + i} className={cn(
              "py-3 text-center text-[10px] font-light text-muted-foreground/25 tracking-[0.15em] uppercase select-none",
              i < 6 && "border-r border-border/[0.06]"
            )}>
              {isMobile ? d[0] : d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((weekDays, weekIdx) => (
          <div key={weekIdx} className={cn(
            "grid grid-cols-7",
            weekIdx > 0 && "border-t border-border/[0.07]"
          )}>
            {weekDays.map((day, dayIdx) => {
              const inMonth = isSameMonth(day, currentMonth);
              const today = isDateToday(day);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const ds = getSanctionsForDay(day);
              const hasSanctions = ds.length > 0;

              // Build slots array: exactly SLOT_COUNT items
              const slots: (Sanction | null)[] = Array(SLOT_COUNT).fill(null);
              ds.forEach((s) => {
                const lane = laneMap.get(s.id);
                if (lane !== undefined && lane < SLOT_COUNT) slots[lane] = s;
              });

              const cellContent = (
                <div
                  className={cn(
                    "relative flex flex-col transition-all",
                    !inMonth && "opacity-15",
                    isSelected && "bg-primary/[0.04]",
                    hasSanctions && inMonth && "cursor-pointer hover:bg-[hsl(0,0%,100%,0.015)]",
                    !hasSanctions && "cursor-default"
                  )}
                  style={{ minHeight: 120 }}
                  onClick={() => {
                    if (hasSanctions && inMonth) {
                      setSelectedDay(day);
                      setExpandedId(null);
                    }
                  }}
                >
                  {/* Day number — top right with subtle column separator */}
                  <div className={cn(
                    "flex justify-end px-2.5 pt-2 pb-0.5",
                    dayIdx < 6 && "border-r border-border/[0.06]"
                  )}>
                    <span className={cn(
                      "text-[13px] font-medium leading-none select-none",
                      today
                        ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-[11px] shadow-[0_0_8px_hsl(var(--primary)/0.4)]"
                        : "text-foreground/40"
                    )}>
                      {format(day, "d")}
                    </span>
                  </div>

                  {/* 3 fixed slots — no vertical borders here */}
                  <div className="flex-1 flex flex-col justify-start pt-1.5 pb-1.5" style={{ gap: SLOT_GAP }}>
                    {slots.map((s, slotIdx) => {
                      if (!s) {
                        return <div key={`empty-${slotIdx}`} style={{ height: PILL_H }} />;
                      }

                      const g = gravedadConfig[s.gravedad_final] || gravedadConfig.leve;
                      const startDay = isStart(day, s);
                      const endDay = isEnd(day, s);

                      // Radius: left on first day, right on last, none in between
                      const radius = startDay && endDay
                        ? "rounded-full"
                        : startDay
                        ? "rounded-l-full"
                        : endDay
                        ? "rounded-r-full"
                        : "";

                      return (
                        <div
                          key={s.id}
                          style={{
                            height: PILL_H,
                            paddingLeft: startDay ? 4 : 0,
                            paddingRight: endDay ? 4 : 0,
                          }}
                        >
                          <div
                            className={cn(
                              "h-full w-full flex items-center overflow-hidden border transition-all",
                              g.pillBg, g.pillBorder, g.pillText,
                              radius,
                              !startDay && !endDay && "border-x-0",
                              startDay && !endDay && "border-r-0",
                              !startDay && endDay && "border-l-0",
                            )}
                            style={{
                              boxShadow: g.shadow,
                              backgroundImage: g.gradient,
                            }}
                          >
                            {startDay && (
                              <span className="text-[9px] font-semibold truncate pl-2.5 pr-1 tracking-tight drop-shadow-sm">
                                {isMobile ? s.worker_name.split(" ")[0][0] : s.worker_name.split(" ")[0]}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );

              // Desktop: Popover on click
              if (!isMobile && hasSanctions && inMonth) {
                return (
                  <Popover
                    key={day.toISOString()}
                    open={isSelected ?? false}
                    onOpenChange={(open) => {
                      if (!open) { setSelectedDay(null); setExpandedId(null); }
                    }}
                  >
                    <PopoverTrigger asChild>{cellContent}</PopoverTrigger>
                    <PopoverContent
                      className="w-[360px] p-4 rounded-2xl border-border/20 bg-popover/95 backdrop-blur-xl shadow-2xl"
                      side="bottom"
                      align="center"
                      collisionPadding={20}
                      sideOffset={8}
                    >
                      <p className="text-sm font-medium mb-3 tracking-tight">
                        {selectedDay && format(selectedDay, "d 'de' MMMM", { locale: es })}
                        <span className="text-muted-foreground/40 font-light ml-2 text-[11px]">
                          {daySanctions.length} sanción{daySanctions.length !== 1 ? "es" : ""}
                        </span>
                      </p>
                      {dayDetailContent}
                    </PopoverContent>
                  </Popover>
                );
              }

              return <div key={day.toISOString()}>{cellContent}</div>;
            })}
          </div>
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-5 pt-1">
        {Object.entries(gravedadConfig).map(([k, v]) => (
          <div key={k} className="inline-flex items-center gap-2 text-[10px] text-muted-foreground/35 font-light tracking-wide">
            <div className={cn("w-2 h-2 rounded-full", v.dot)} />
            {v.label}
          </div>
        ))}
      </div>

      {/* ── Mobile: Sheet ── */}
      {isMobile && (
        <Sheet
          open={!!selectedDay && daySanctions.length > 0}
          onOpenChange={(open) => { if (!open) { setSelectedDay(null); setExpandedId(null); } }}
        >
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] px-5 pt-5 pb-8 bg-background/95 backdrop-blur-xl border-border/20">
            <SheetHeader className="pb-3">
              <SheetTitle className="text-sm font-medium text-left tracking-tight">
                {selectedDay && format(selectedDay, "d 'de' MMMM yyyy", { locale: es })}
                <span className="text-muted-foreground/40 font-light ml-2 text-[11px]">
                  {daySanctions.length} sanción{daySanctions.length !== 1 ? "es" : ""}
                </span>
              </SheetTitle>
            </SheetHeader>
            {dayDetailContent}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
