import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getManagerSessionToken } from "@/lib/sessionHelpers";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Pencil, Trash2, MapPin, Building2, Star, CheckCircle2, Loader2,
  CalendarDays, List, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, isWithinInterval,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { InterviewDialog } from "./InterviewDialog";
import { InterviewDetailDialog } from "./InterviewDetailDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Interview = any;
type Department = { id: string; name: string };

type Props = { canManage: boolean };

export function EntrevistasTab({ canManage }: Props) {
  const [loading, setLoading] = useState(true);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [filterDept, setFilterDept] = useState<string>("all");
  const [view, setView] = useState<"day" | "month">("day");
  const [monthCursor, setMonthCursor] = useState<Date>(startOfMonth(new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailInterview, setDetailInterview] = useState<Interview | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadInterviews = useCallback(async () => {
    setLoading(true);
    try {
      const sessionToken = getManagerSessionToken();
      const { data } = await supabase.functions.invoke("interviews-operations", {
        body: { action: "list", sessionToken },
      });
      if (data?.success) setInterviews(data.interviews || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInterviews();
    (async () => {
      const { data } = await supabase.rpc("get_public_departments");
      const list = ((data as any) || [])
        .map((d: any) => ({ id: d.id, name: d.name }))
        .sort((a: Department, b: Department) => a.name.localeCompare(b.name, "es"));
      setDepartments(list);
    })();
  }, [loadInterviews]);

  const filtered = useMemo(() => {
    if (filterDept === "all") return interviews;
    return interviews.filter((i) => i.department_id === filterDept);
  }, [interviews, filterDept]);

  const interviewsByDate = useMemo(() => {
    const map: Record<string, Interview[]> = {};
    filtered.forEach((i) => {
      const key = format(parseISO(i.scheduled_at), "yyyy-MM-dd");
      if (!map[key]) map[key] = [];
      map[key].push(i);
    });
    return map;
  }, [filtered]);

  const dayInterviews = selectedDate
    ? interviewsByDate[format(selectedDate, "yyyy-MM-dd")] || []
    : [];

  const datesWithInterviews = Object.keys(interviewsByDate).map((d) => parseISO(d));

  // Entrevistas del mes seleccionado (vista mensual), agrupadas por día
  const monthEntries = useMemo(() => {
    const start = startOfMonth(monthCursor);
    const end = endOfMonth(monthCursor);
    const list = filtered
      .filter((i) => {
        const d = parseISO(i.scheduled_at);
        return isWithinInterval(d, { start, end });
      })
      .sort(
        (a, b) =>
          parseISO(a.scheduled_at).getTime() - parseISO(b.scheduled_at).getTime(),
      );
    const groups: { dateKey: string; date: Date; items: Interview[] }[] = [];
    list.forEach((itv) => {
      const d = parseISO(itv.scheduled_at);
      const key = format(d, "yyyy-MM-dd");
      const last = groups[groups.length - 1];
      if (last && last.dateKey === key) last.items.push(itv);
      else groups.push({ dateKey: key, date: d, items: [itv] });
    });
    return { list, groups };
  }, [filtered, monthCursor]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const sessionToken = getManagerSessionToken();
    const { data } = await supabase.functions.invoke("interviews-operations", {
      body: { action: "delete", sessionToken, id: deleteId },
    });
    if (data?.success) {
      toast.success("Entrevista eliminada");
      loadInterviews();
    } else {
      toast.error(data?.error || "Error");
    }
    setDeleteId(null);
  };

  const deptLabel =
    filterDept === "all"
      ? "Todos los departamentos"
      : departments.find((d) => d.id === filterDept)?.name || "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Calendario de entrevistas</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle de vista */}
          <div className="inline-flex h-9 rounded-lg bg-muted/40 p-1 border border-border/30">
            <button
              type="button"
              onClick={() => setView("day")}
              className={cn(
                "px-3 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                view === "day"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Día
            </button>
            <button
              type="button"
              onClick={() => setView("month")}
              className={cn(
                "px-3 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                view === "month"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" /> Mes
            </button>
          </div>

          <Select value={filterDept} onValueChange={setFilterDept}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los departamentos</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManage && (
            <Button size="sm" onClick={() => { setEditingInterview(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1.5" /> Nueva entrevista
            </Button>
          )}
        </div>
      </div>

      {view === "day" ? (
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
          <div className="rounded-2xl border border-border/40 p-2 bg-card/50 backdrop-blur w-fit">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              locale={es}
              className="pointer-events-auto"
              modifiers={{ hasInterview: datesWithInterviews }}
              modifiersClassNames={{
                hasInterview: "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-primary",
              }}
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {selectedDate ? format(selectedDate, "EEEE d 'de' MMMM", { locale: es }) : "Selecciona un día"}
            </h3>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : dayInterviews.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
                No hay entrevistas este día
              </div>
            ) : (
              <div className="space-y-2">
                {dayInterviews.map((itv) => (
                  <InterviewCard
                    key={itv.id}
                    interview={itv}
                    canManage={canManage}
                    onClick={() => { setDetailInterview(itv); setDetailOpen(true); }}
                    onEdit={() => { setEditingInterview(itv); setDialogOpen(true); }}
                    onDelete={() => setDeleteId(itv.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Cabecera del mes con navegación */}
          <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-card/50 backdrop-blur px-3 py-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMonthCursor((d) => subMonths(d, 1))}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex flex-col items-center">
              <span className="text-sm font-semibold tracking-tight capitalize">
                {format(monthCursor, "LLLL yyyy", { locale: es })}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {monthEntries.list.length} entrevista{monthEntries.list.length === 1 ? "" : "s"} · {deptLabel}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setMonthCursor(startOfMonth(new Date()))}
              >
                Hoy
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMonthCursor((d) => addMonths(d, 1))}
                aria-label="Mes siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : monthEntries.list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/40 p-10 text-center text-sm text-muted-foreground">
              No hay entrevistas este mes{filterDept !== "all" ? ` en ${deptLabel}` : ""}
            </div>
          ) : (
            <div className="space-y-5">
              {monthEntries.groups.map((g) => (
                <div key={g.dateKey} className="space-y-2 animate-fade-in">
                  <div className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-background/80 backdrop-blur">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <span className="capitalize">
                        {format(g.date, "EEEE d 'de' MMMM", { locale: es })}
                      </span>
                      <span className="h-px flex-1 bg-border/40" />
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {g.items.length}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {g.items.map((itv) => (
                      <InterviewCard
                        key={itv.id}
                        interview={itv}
                        canManage={canManage}
                        onClick={() => { setDetailInterview(itv); setDetailOpen(true); }}
                        onEdit={() => { setEditingInterview(itv); setDialogOpen(true); }}
                        onDelete={() => setDeleteId(itv.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <InterviewDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        interview={editingInterview}
        departments={departments}
        onSaved={loadInterviews}
      />

      <InterviewDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        interview={detailInterview}
        canSeeAllEvaluations={canManage}
        onChanged={loadInterviews}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar entrevista?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la entrevista junto con su CV y todas las evaluaciones registradas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InterviewCard({
  interview, canManage, onClick, onEdit, onDelete,
}: {
  interview: Interview; canManage: boolean;
  onClick: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const dt = parseISO(interview.scheduled_at);
  return (
    <div
      onClick={onClick}
      className="group rounded-2xl border border-border/40 bg-card/40 backdrop-blur-xl hover:bg-card/70 transition-all p-3.5 cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <div className="text-center min-w-[52px]">
          <div className="text-xl font-semibold tracking-tight tabular-nums">{format(dt, "HH:mm")}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium truncate">{interview.candidate_name}</h4>
            <div className="flex items-center gap-1.5 shrink-0">
              {interview.evaluations_count > 0 && (
                <Badge variant="secondary" className="text-[10px] gap-1 px-1.5">
                  <Star className="h-2.5 w-2.5" />{interview.evaluations_count}
                </Badge>
              )}
              {canManage && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
            {interview.room && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{interview.room}</span>
            )}
            {(interview.departments?.name || interview.custom_department) && (
              <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{interview.departments?.name || interview.custom_department}</span>
            )}
            {interview.own_evaluation?.attended && (
              <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3 w-3" />Evaluado</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
