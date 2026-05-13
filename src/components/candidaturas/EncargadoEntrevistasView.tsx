import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getManagerSessionToken } from "@/lib/sessionHelpers";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  MapPin,
  Building2,
  CheckCircle2,
  CalendarDays,
  Search,
  Star,
  Clock,
  Users,
  TrendingUp,
  AlertCircle,
  CalendarRange,
  LayoutGrid,
  List as ListIcon,
  Download,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  format,
  parseISO,
  isToday,
  isTomorrow,
  isThisWeek,
  isPast,
  differenceInMinutes,
  startOfDay,
  isSameDay,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { InterviewDetailDialog } from "./InterviewDetailDialog";
import { ManagerAvatar } from "./ManagerAvatar";
import { toast } from "sonner";


type ViewMode = "calendar" | "kanban" | "list";
type KanbanColumn = "pending" | "doubt" | "pass" | "reject";

const KANBAN_LABELS: Record<KanbanColumn, string> = {
  pending: "Por evaluar",
  doubt: "En duda",
  pass: "Pasa de fase",
  reject: "Descartado",
};

const KANBAN_STYLES: Record<KanbanColumn, { dot: string; ring: string; bg: string; text: string }> = {
  pending: {
    dot: "bg-slate-400",
    ring: "ring-slate-300/40",
    bg: "bg-slate-500/5",
    text: "text-slate-600 dark:text-slate-300",
  },
  doubt: {
    dot: "bg-amber-500",
    ring: "ring-amber-400/40",
    bg: "bg-amber-500/5",
    text: "text-amber-700 dark:text-amber-400",
  },
  pass: {
    dot: "bg-green-500",
    ring: "ring-green-400/40",
    bg: "bg-green-500/5",
    text: "text-green-700 dark:text-green-400",
  },
  reject: {
    dot: "bg-red-500",
    ring: "ring-red-400/40",
    bg: "bg-red-500/5",
    text: "text-red-700 dark:text-red-400",
  },
};

function getKanbanColumn(itv: any): KanbanColumn {
  const decision = itv.own_evaluation?.decision;
  if (decision === "pass") return "pass";
  if (decision === "doubt") return "doubt";
  if (decision === "reject") return "reject";
  return "pending";
}

function StarRating({ value, size = "sm" }: { value: number | null | undefined; size?: "sm" | "xs" }) {
  if (!value) return null;
  const cls = size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(cls, n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20")}
        />
      ))}
    </div>
  );
}

function getRelativeLabel(date: Date): { label: string; className: string } | null {
  if (isToday(date)) return { label: "Hoy", className: "bg-primary/10 text-primary border-primary/30" };
  if (isTomorrow(date)) return { label: "Mañana", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" };
  if (isThisWeek(date, { weekStartsOn: 1 })) return { label: "Esta semana", className: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30" };
  return null;
}

export function EncargadoEntrevistasView({ previewManagerId }: { previewManagerId?: string | null } = {}) {
  const [loading, setLoading] = useState(true);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [view, setView] = useState<ViewMode>("calendar");
  const [search, setSearch] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<KanbanColumn | null>(null);
  const [savingDecision, setSavingDecision] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessionToken = getManagerSessionToken();
      const { data } = await supabase.functions.invoke("interviews-operations", {
        body: { action: "list", sessionToken, ...(previewManagerId ? { previewManagerId } : {}) },
      });
      if (data?.success) setInterviews(data.interviews || []);
    } finally {
      setLoading(false);
    }
  }, [previewManagerId]);

  useEffect(() => {
    load();
  }, [load]);

  // Filtered by search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return interviews;
    return interviews.filter(
      (i) =>
        i.candidate_name?.toLowerCase().includes(q) ||
        i.candidate_email?.toLowerCase().includes(q) ||
        i.room?.toLowerCase().includes(q) ||
        i.job_positions?.title?.toLowerCase().includes(q),
    );
  }, [interviews, search]);

  // Stats
  const stats = useMemo(() => {
    const total = interviews.length;
    const pending = interviews.filter((i) => !i.own_evaluation && !isPast(parseISO(i.scheduled_at))).length;
    const evaluated = interviews.filter((i) => i.own_evaluation).length;
    const today = interviews.filter((i) => isToday(parseISO(i.scheduled_at))).length;
    const upcoming = interviews
      .filter((i) => !isPast(parseISO(i.scheduled_at)))
      .sort((a, b) => parseISO(a.scheduled_at).getTime() - parseISO(b.scheduled_at).getTime())[0];
    const ratings = interviews.map((i) => i.own_evaluation?.rating).filter(Boolean) as number[];
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    return { total, pending, evaluated, today, upcoming, avgRating };
  }, [interviews]);

  // Group by date for calendar
  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    filtered.forEach((i) => {
      const k = format(parseISO(i.scheduled_at), "yyyy-MM-dd");
      (map[k] ||= []).push(i);
    });
    return map;
  }, [filtered]);

  const dates = Object.keys(byDate).map((d) => parseISO(d));
  const dayList = selectedDate ? byDate[format(selectedDate, "yyyy-MM-dd")] || [] : [];

  // Kanban groups
  const kanban = useMemo(() => {
    const groups: Record<KanbanColumn, any[]> = { pending: [], doubt: [], pass: [], reject: [] };
    filtered.forEach((i) => groups[getKanbanColumn(i)].push(i));
    // sort each by date
    (Object.keys(groups) as KanbanColumn[]).forEach((k) => {
      groups[k].sort((a, b) => parseISO(a.scheduled_at).getTime() - parseISO(b.scheduled_at).getTime());
    });
    return groups;
  }, [filtered]);

  // List view: upcoming first
  const listSorted = useMemo(() => {
    const upcoming = filtered
      .filter((i) => !isPast(parseISO(i.scheduled_at)))
      .sort((a, b) => parseISO(a.scheduled_at).getTime() - parseISO(b.scheduled_at).getTime());
    const past = filtered
      .filter((i) => isPast(parseISO(i.scheduled_at)))
      .sort((a, b) => parseISO(b.scheduled_at).getTime() - parseISO(a.scheduled_at).getTime());
    return [...upcoming, ...past];
  }, [filtered]);

  const openDetail = (itv: any) => {
    setDetail(itv);
    setDetailOpen(true);
  };

  // Drag & drop in kanban
  const handleDrop = async (col: KanbanColumn) => {
    const id = draggingId;
    setDraggingId(null);
    setDragOver(null);
    if (!id) return;
    const itv = interviews.find((i) => i.id === id);
    if (!itv) return;
    const currentCol = getKanbanColumn(itv);
    if (currentCol === col) return;

    const newDecision = col === "pending" ? null : col;
    const previous = itv.own_evaluation;

    // Optimistic update
    setInterviews((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              own_evaluation: {
                ...(i.own_evaluation || { attended: false }),
                decision: newDecision,
              },
            }
          : i,
      ),
    );

    setSavingDecision(true);
    try {
      const sessionToken = getManagerSessionToken();
      const payload = {
        attended: previous?.attended ?? true,
        rating: previous?.rating ?? null,
        notes: previous?.notes ?? null,
        decision: newDecision,
      };
      const { data } = await supabase.functions.invoke("interviews-operations", {
        body: {
          action: "upsertEvaluation",
          sessionToken,
          interview_id: id,
          evaluation: payload,
        },
      });
      if (!data?.success) {
        toast.error(data?.error || "No se pudo actualizar");
        load();
      } else {
        toast.success(`Movido a "${KANBAN_LABELS[col]}"`);
      }
    } catch (e) {
      toast.error("Error al actualizar");
      load();
    } finally {
      setSavingDecision(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (interviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-muted/50 p-5 mb-4">
          <CalendarDays className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-base font-medium">Aún no hay entrevistas asignadas</p>
        <p className="text-sm text-muted-foreground mt-1">
          Cuando se programen entrevistas en tu departamento aparecerán aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={CalendarDays}
          label="Hoy"
          value={stats.today}
          accent="text-blue-600 dark:text-blue-400"
          bg="bg-blue-500/10"
        />
        <StatCard
          icon={AlertCircle}
          label="Por evaluar"
          value={stats.pending}
          accent="text-amber-600 dark:text-amber-400"
          bg="bg-amber-500/10"
        />
        <StatCard
          icon={CheckCircle2}
          label="Evaluadas"
          value={stats.evaluated}
          accent="text-green-600 dark:text-green-400"
          bg="bg-green-500/10"
        />
        <StatCard
          icon={Sparkles}
          label="Media estrellas"
          value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"}
          accent="text-violet-600 dark:text-violet-400"
          bg="bg-violet-500/10"
          suffix={stats.avgRating ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> : null}
        />
      </div>

      {/* Next interview banner */}
      {stats.upcoming && (
        <button
          onClick={() => openDetail(stats.upcoming)}
          className="w-full text-left rounded-3xl border border-border/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 hover:border-primary/40 transition-all group"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="rounded-2xl bg-primary/15 p-3 shrink-0">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                  Próxima entrevista
                </p>
                <p className="text-base font-semibold tracking-tight truncate mt-0.5">
                  {stats.upcoming.candidate_name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(parseISO(stats.upcoming.scheduled_at), "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es })}
                  {stats.upcoming.room && ` · Sala ${stats.upcoming.room}`}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
          </div>
        </button>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar candidato, email, sala…"
            className="pl-9 h-9 rounded-full bg-muted/40 border-border/40 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-muted/40 p-1 border border-border/30 self-start sm:self-auto">
            <ViewBtn active={view === "calendar"} onClick={() => setView("calendar")} icon={CalendarRange} label="Calendario" />
            <ViewBtn active={view === "kanban"} onClick={() => setView("kanban")} icon={LayoutGrid} label="Kanban" />
            <ViewBtn active={view === "list"} onClick={() => setView("list")} icon={ListIcon} label="Lista" />
          </div>
        </div>
      </div>

      {/* Views */}
      {view === "calendar" && (
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
          <div className="rounded-3xl border border-border/30 bg-card/50 backdrop-blur-xl p-2 w-fit shadow-sm self-start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              locale={es}
              className="pointer-events-auto"
              modifiers={{ hasInterview: dates }}
              modifiersClassNames={{
                hasInterview:
                  "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-primary",
              }}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium text-muted-foreground tracking-tight">
                {selectedDate ? format(selectedDate, "EEEE d 'de' MMMM", { locale: es }) : ""}
              </h3>
              {dayList.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {dayList.length} {dayList.length === 1 ? "entrevista" : "entrevistas"}
                </span>
              )}
            </div>

            {dayList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/30 p-10 text-center text-sm text-muted-foreground">
                No hay entrevistas este día
              </div>
            ) : (
              <div className="space-y-2">
                {dayList
                  .sort((a, b) => parseISO(a.scheduled_at).getTime() - parseISO(b.scheduled_at).getTime())
                  .map((itv) => (
                    <InterviewCard key={itv.id} itv={itv} onClick={() => openDetail(itv)} variant="calendar" />
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {view === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {(Object.keys(KANBAN_LABELS) as KanbanColumn[]).map((col) => {
            const styles = KANBAN_STYLES[col];
            const items = kanban[col];
            return (
              <div
                key={col}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(col);
                }}
                onDragLeave={() => setDragOver((c) => (c === col ? null : c))}
                onDrop={() => handleDrop(col)}
                className={cn(
                  "rounded-3xl border border-border/30 p-3 min-h-[300px] transition-all",
                  styles.bg,
                  dragOver === col && "ring-2 ring-offset-2 ring-offset-background scale-[1.01]",
                  dragOver === col && styles.ring,
                )}
              >
                <div className="flex items-center justify-between gap-2 px-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", styles.dot)} />
                    <span className={cn("text-xs font-semibold tracking-tight uppercase", styles.text)}>
                      {KANBAN_LABELS[col]}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/30 p-6 text-center text-[11px] text-muted-foreground">
                      Arrastra aquí
                    </div>
                  ) : (
                    items.map((itv) => (
                      <div
                        key={itv.id}
                        draggable
                        onDragStart={() => setDraggingId(itv.id)}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOver(null);
                        }}
                        className={cn(
                          "transition-opacity",
                          draggingId === itv.id && "opacity-40",
                        )}
                      >
                        <InterviewCard itv={itv} onClick={() => openDetail(itv)} variant="kanban" />
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
          {savingDecision && (
            <div className="fixed bottom-4 right-4 z-50 rounded-full bg-background/90 backdrop-blur border border-border/40 px-3 py-1.5 text-xs flex items-center gap-2 shadow-md">
              <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
            </div>
          )}
        </div>
      )}

      {view === "list" && (
        <div className="space-y-2">
          {listSorted.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/30 p-10 text-center text-sm text-muted-foreground">
              Sin resultados
            </div>
          ) : (
            listSorted.map((itv) => (
              <InterviewCard key={itv.id} itv={itv} onClick={() => openDetail(itv)} variant="list" />
            ))
          )}
        </div>
      )}

      <InterviewDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        interview={detail}
        canSeeAllEvaluations={false}
        onChanged={load}
      />
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  bg,
  suffix,
}: {
  icon: any;
  label: string;
  value: number | string;
  accent: string;
  bg: string;
  suffix?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/30 bg-card/40 backdrop-blur-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("rounded-lg p-1.5", bg)}>
          <Icon className={cn("h-3.5 w-3.5", accent)} />
        </div>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
        {suffix}
      </div>
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
        active ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function InterviewCard({
  itv,
  onClick,
  variant,
}: {
  itv: any;
  onClick: () => void;
  variant: "calendar" | "kanban" | "list";
}) {
  const dt = parseISO(itv.scheduled_at);
  const past = isPast(dt);
  const rel = getRelativeLabel(dt);
  const evaluated = !!itv.own_evaluation;
  const decision = itv.own_evaluation?.decision;
  const decisionStyle = decision ? KANBAN_STYLES[decision as KanbanColumn] : null;

  if (variant === "kanban") {
    return (
      <button
        onClick={onClick}
        className="w-full text-left rounded-2xl border border-border/40 bg-card/80 backdrop-blur-xl hover:bg-card hover:border-border/60 hover:shadow-sm transition-all p-3 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium truncate flex-1">{itv.candidate_name}</h4>
          <div className="flex items-center gap-1 shrink-0">
            <ManagerAvatar
              name={itv.assigned_manager?.name}
              avatarUrl={itv.assigned_manager?.avatar_url}
              size="xs"
            />
            {itv.cv_file_url && <Download className="h-3 w-3 text-muted-foreground" />}
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          <span className="tabular-nums">{format(dt, "d MMM HH:mm", { locale: es })}</span>
        </div>
        {itv.room && (
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {itv.room}
          </div>
        )}
        <div className="flex items-center justify-between mt-2 gap-2">
          {itv.own_evaluation?.rating ? (
            <StarRating value={itv.own_evaluation.rating} size="xs" />
          ) : (
            <span />
          )}
          {rel && (
            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4", rel.className)}>
              {rel.label}
            </Badge>
          )}
        </div>
      </button>
    );
  }

  // calendar + list share rich layout
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-2xl border border-border/30 bg-card/40 backdrop-blur-xl hover:bg-card/70 hover:border-border/50 transition-all p-4",
        past && !evaluated && "opacity-70",
      )}
    >
      <div className="flex items-start gap-4">
        <div className="text-center min-w-[64px]">
          {variant === "list" && (
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              {format(dt, "MMM", { locale: es })}
            </div>
          )}
          {variant === "list" ? (
            <div className="text-2xl font-semibold tracking-tight tabular-nums leading-none">
              {format(dt, "d")}
            </div>
          ) : (
            <div className="text-2xl font-semibold tracking-tight tabular-nums">{format(dt, "HH:mm")}</div>
          )}
          {variant === "list" && (
            <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{format(dt, "HH:mm")}</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-medium truncate">{itv.candidate_name}</h4>
            <div className="flex items-center gap-1.5 shrink-0">
              <ManagerAvatar
                name={itv.assigned_manager?.name}
                avatarUrl={itv.assigned_manager?.avatar_url}
                size="sm"
              />
              {rel && (
                <Badge variant="outline" className={cn("text-[10px]", rel.className)}>
                  {rel.label}
                </Badge>
              )}
              {decisionStyle && (
                <Badge variant="outline" className={cn("text-[10px] gap-1", decisionStyle.bg, decisionStyle.text, "border-current/20")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", decisionStyle.dot)} />
                  {KANBAN_LABELS[decision as KanbanColumn]}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
            {itv.room && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {itv.room}
              </span>
            )}
            {(itv.departments?.name || itv.custom_department) && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {itv.departments?.name || itv.custom_department}
              </span>
            )}
            {itv.job_positions?.title && (
              <span className="flex items-center gap-1 truncate">
                · {itv.job_positions.title}
              </span>
            )}
          </div>
          {(itv.own_evaluation?.rating || itv.own_evaluation?.notes) && (
            <div className="flex items-center gap-3 mt-2">
              {itv.own_evaluation?.rating && <StarRating value={itv.own_evaluation.rating} />}
              {itv.own_evaluation?.notes && (
                <span className="text-[11px] text-muted-foreground italic truncate max-w-xs">
                  "{itv.own_evaluation.notes}"
                </span>
              )}
            </div>
          )}
        </div>

        {evaluated ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        ) : !past ? (
          <div className="h-2 w-2 rounded-full bg-amber-400 shrink-0 mt-2" title="Pendiente de evaluar" />
        ) : null}
      </div>
    </button>
  );
}
