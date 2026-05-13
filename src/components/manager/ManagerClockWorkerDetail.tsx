import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
  Clock,
  History,
  ChevronDown,
} from "lucide-react";
import { format, addDays, startOfWeek, isToday, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Worker = { id: string; name: string; worker_number: string; worker_code?: string };
type Entry = { id: string; entry_type: string; punched_at: string };
type EditLog = {
  id: string;
  action: string;
  old_value: any;
  new_value: any;
  reason: string | null;
  manager_name: string;
  created_at: string;
};

const ENTRY_LABELS: Record<string, string> = {
  clock_in: "Entrada",
  clock_out: "Salida",
  break_start: "Ini. Descanso",
  break_end: "Fin Descanso",
};

const ENTRY_ICONS: Record<string, string> = {
  clock_in: "→",
  clock_out: "←",
  break_start: "⏸",
  break_end: "▶",
};

function properCase(s: string) {
  return s.toLowerCase().split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function getMonday(d: Date) {
  return startOfWeek(d, { weekStartsOn: 1 });
}

function calcDayHours(dayEntries: Entry[]): number {
  let total = 0;
  const sorted = [...dayEntries].sort((a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime());
  let lastIn: Date | null = null;

  for (const e of sorted) {
    if (e.entry_type === "clock_in" || e.entry_type === "break_end") {
      lastIn = new Date(e.punched_at);
    } else if ((e.entry_type === "clock_out" || e.entry_type === "break_start") && lastIn) {
      total += new Date(e.punched_at).getTime() - lastIn.getTime();
      lastIn = null;
    }
  }
  return total / (1000 * 60 * 60);
}

function formatHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins.toString().padStart(2, "0")}m`;
}

interface Props {
  worker: Worker;
  onBack: () => void;
}

export const ManagerClockWorkerDetail = ({ worker, onBack }: Props) => {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editHistory, setEditHistory] = useState<EditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Dialog states
  const [addDialog, setAddDialog] = useState<{ open: boolean; date: Date | null }>({ open: false, date: null });
  const [editDialog, setEditDialog] = useState<{ open: boolean; entry: Entry | null }>({ open: false, entry: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; entry: Entry | null }>({ open: false, entry: null });
  const [dialogReason, setDialogReason] = useState("");
  const [dialogTime, setDialogTime] = useState("");
  const [dialogEntryType, setDialogEntryType] = useState("clock_in");
  const [saving, setSaving] = useState(false);

  const sessionToken = localStorage.getItem("manager_session_token") || "";

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("clock-operations", {
        body: {
          action: "getWorkerWeekEntries",
          sessionToken,
          workerId: worker.id,
          weekStart: format(weekStart, "yyyy-MM-dd"),
        },
      });
      if (data?.success) setEntries(data.entries || []);
    } catch {}
    setLoading(false);
  }, [sessionToken, worker.id, weekStart]);

  const fetchHistory = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke("clock-operations", {
        body: { action: "getClockEditHistory", sessionToken, workerId: worker.id },
      });
      if (data?.success) setEditHistory(data.edits || []);
    } catch {}
  }, [sessionToken, worker.id]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => { if (historyOpen) fetchHistory(); }, [historyOpen, fetchHistory]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getDayEntries = (day: Date) => {
    const dayStr = format(day, "yyyy-MM-dd");
    return entries
      .filter(e => e.punched_at.startsWith(dayStr))
      .sort((a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime());
  };

  const weekTotal = days.reduce((sum, day) => sum + calcDayHours(getDayEntries(day)), 0);

  const handleAdd = async () => {
    if (!addDialog.date || !dialogTime) return;
    setSaving(true);
    const punchedAt = `${format(addDialog.date, "yyyy-MM-dd")}T${dialogTime}:00`;
    try {
      const { data } = await supabase.functions.invoke("clock-operations", {
        body: {
          action: "addClockEntry",
          sessionToken,
          workerId: worker.id,
          entryType: dialogEntryType,
          punchedAt,
          reason: dialogReason,
        },
      });
      if (data?.success) {
        toast.success("Fichada añadida");
        fetchEntries();
        setAddDialog({ open: false, date: null });
        resetDialog();
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error de conexión"); }
    setSaving(false);
  };

  const handleEdit = async () => {
    if (!editDialog.entry || !dialogTime) return;
    setSaving(true);
    const oldDate = editDialog.entry.punched_at.slice(0, 10);
    const newPunchedAt = `${oldDate}T${dialogTime}:00`;
    try {
      const { data } = await supabase.functions.invoke("clock-operations", {
        body: {
          action: "editClockEntry",
          sessionToken,
          entryId: editDialog.entry.id,
          newPunchedAt,
          reason: dialogReason,
        },
      });
      if (data?.success) {
        toast.success("Fichada editada");
        fetchEntries();
        setEditDialog({ open: false, entry: null });
        resetDialog();
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error de conexión"); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteDialog.entry) return;
    setSaving(true);
    try {
      const { data } = await supabase.functions.invoke("clock-operations", {
        body: {
          action: "deleteClockEntry",
          sessionToken,
          entryId: deleteDialog.entry.id,
          reason: dialogReason,
        },
      });
      if (data?.success) {
        toast.success("Fichada eliminada");
        fetchEntries();
        setDeleteDialog({ open: false, entry: null });
        resetDialog();
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error de conexión"); }
    setSaving(false);
  };

  const resetDialog = () => {
    setDialogReason("");
    setDialogTime("");
    setDialogEntryType("clock_in");
  };

  const salixUrl = `https://salix.verdnatura.es/#!/worker/${worker.worker_number}/summary`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{properCase(worker.name)}</h2>
            <p className="text-sm text-muted-foreground">
              #{worker.worker_number}
              {worker.worker_code ? ` · ${worker.worker_code}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={salixUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="h-3.5 w-3.5" />
              Salix
            </Button>
          </a>
          <Card className="bg-primary/10 border-primary/20">
            <CardContent className="px-4 py-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-primary">{formatHours(weekTotal)}</span>
              <span className="text-xs text-muted-foreground">/ semana</span>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Week navigator */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setWeekStart(prev => addDays(prev, -7))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium text-foreground">
          Semana del {format(weekStart, "dd/MM", { locale: es })} al{" "}
          {format(addDays(weekStart, 6), "dd/MM", { locale: es })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setWeekStart(prev => addDays(prev, 7))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Weekly grid */}
      {loading ? (
        <Card className="bg-card/50 border-border/30">
          <CardContent className="py-12 text-center text-muted-foreground">Cargando...</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
          {days.map(day => {
            const dayEntries = getDayEntries(day);
            const dayHours = calcDayHours(dayEntries);
            const today = isToday(day);

            return (
              <Card
                key={day.toISOString()}
                className={cn(
                  "bg-card/50 border-border/30 overflow-hidden",
                  today && "ring-1 ring-primary/50 bg-primary/5"
                )}
              >
                {/* Day header */}
                <div className={cn(
                  "px-3 py-2 border-b border-border/20 flex items-center justify-between",
                  today && "bg-primary/10"
                )}>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase">
                      {format(day, "EEE", { locale: es })}
                    </span>
                    <span className="ml-1.5 text-sm font-semibold text-foreground">
                      {format(day, "dd")}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setAddDialog({ open: true, date: day });
                      setDialogEntryType("clock_in");
                      setDialogTime("");
                      setDialogReason("");
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Entries */}
                <CardContent className="p-2 space-y-1 min-h-[80px]">
                  {dayEntries.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Sin fichadas</p>
                  ) : (
                    dayEntries.map(e => (
                      <div
                        key={e.id}
                        className="flex items-center justify-between group rounded-md px-2 py-1 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground w-4">
                            {ENTRY_ICONS[e.entry_type] || "·"}
                          </span>
                          <span className="text-sm font-mono text-foreground">
                            {format(new Date(e.punched_at), "HH:mm")}
                          </span>
                        </div>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => {
                              setEditDialog({ open: true, entry: e });
                              setDialogTime(format(new Date(e.punched_at), "HH:mm"));
                              setDialogReason("");
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-destructive"
                            onClick={() => {
                              setDeleteDialog({ open: true, entry: e });
                              setDialogReason("");
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>

                {/* Day total */}
                {dayEntries.length > 0 && (
                  <div className="px-3 py-1.5 border-t border-border/20 bg-muted/20">
                    <span className="text-xs font-medium text-muted-foreground">
                      {formatHours(dayHours)}
                    </span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Entry type legend */}
      <div className="flex flex-wrap gap-3 px-1">
        {Object.entries(ENTRY_LABELS).map(([k, v]) => (
          <span key={k} className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="font-mono">{ENTRY_ICONS[k]}</span> {v}
          </span>
        ))}
      </div>

      {/* Edit history */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full gap-2 justify-between">
            <span className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Historial de modificaciones
            </span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", historyOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <Card className="bg-card/50 border-border/30">
            <CardContent className="p-0">
              {editHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No hay modificaciones registradas
                </p>
              ) : (
                <div className="divide-y divide-border/20 max-h-[300px] overflow-y-auto">
                  {editHistory.map(log => (
                    <div key={log.id} className="px-4 py-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              log.action === "add" && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                              log.action === "edit" && "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
                              log.action === "delete" && "bg-red-500/10 text-red-400 border-red-500/20"
                            )}
                          >
                            {log.action === "add" ? "Añadida" : log.action === "edit" ? "Editada" : "Eliminada"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">por {log.manager_name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), "dd/MM/yy HH:mm")}
                        </span>
                      </div>
                      {log.old_value && (
                        <p className="text-xs text-muted-foreground">
                          Anterior: {ENTRY_LABELS[log.old_value.entry_type] || log.old_value.entry_type}{" "}
                          {log.old_value.punched_at ? format(new Date(log.old_value.punched_at), "dd/MM HH:mm") : ""}
                        </p>
                      )}
                      {log.new_value && (
                        <p className="text-xs text-foreground">
                          Nuevo: {ENTRY_LABELS[log.new_value.entry_type] || log.new_value.entry_type}{" "}
                          {log.new_value.punched_at ? format(new Date(log.new_value.punched_at), "dd/MM HH:mm") : ""}
                        </p>
                      )}
                      {log.reason && (
                        <p className="text-xs text-muted-foreground italic">Motivo: {log.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Add dialog */}
      <Dialog open={addDialog.open} onOpenChange={(open) => { if (!open) { setAddDialog({ open: false, date: null }); resetDialog(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir fichada — {addDialog.date ? format(addDialog.date, "EEEE dd/MM", { locale: es }) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Tipo</label>
              <Select value={dialogEntryType} onValueChange={setDialogEntryType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ENTRY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Hora</label>
              <Input type="time" value={dialogTime} onChange={e => setDialogTime(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Motivo (opcional)</label>
              <Textarea
                placeholder="Motivo de la modificación..."
                value={dialogReason}
                onChange={e => setDialogReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialog({ open: false, date: null }); resetDialog(); }}>
              Cancelar
            </Button>
            <Button onClick={handleAdd} disabled={saving || !dialogTime}>
              {saving ? "Guardando..." : "Añadir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => { if (!open) { setEditDialog({ open: false, entry: null }); resetDialog(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Editar fichada — {editDialog.entry ? ENTRY_LABELS[editDialog.entry.entry_type] : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nueva hora</label>
              <Input type="time" value={dialogTime} onChange={e => setDialogTime(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Motivo (opcional)</label>
              <Textarea
                placeholder="Motivo del cambio..."
                value={dialogReason}
                onChange={e => setDialogReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialog({ open: false, entry: null }); resetDialog(); }}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={saving || !dialogTime}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => { if (!open) { setDeleteDialog({ open: false, entry: null }); resetDialog(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar fichada</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Seguro que quieres eliminar esta fichada?
            {deleteDialog.entry && (
              <span className="block mt-1 font-medium text-foreground">
                {ENTRY_LABELS[deleteDialog.entry.entry_type]} — {format(new Date(deleteDialog.entry.punched_at), "dd/MM/yyyy HH:mm")}
              </span>
            )}
          </p>
          <div>
            <label className="text-sm font-medium text-foreground">Motivo (opcional)</label>
            <Textarea
              placeholder="Motivo de la eliminación..."
              value={dialogReason}
              onChange={e => setDialogReason(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialog({ open: false, entry: null }); resetDialog(); }}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
