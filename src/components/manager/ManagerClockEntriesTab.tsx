import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { Clock, Search, Users, ArrowLeft, Coffee, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ManagerClockWorkerDetail } from "./ManagerClockWorkerDetail";

type Worker = { id: string; name: string; worker_number: string; worker_code?: string };
type Entry = { id: string; worker_id: string; entry_type: string; punched_at: string };

function properCase(s: string) {
  return s.toLowerCase().split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function formatTime(iso: string) {
  return format(new Date(iso), "HH:mm");
}

interface Props {
  departmentId: string;
}

export const ManagerClockEntriesTab = ({ departmentId }: Props) => {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const sessionToken = localStorage.getItem("manager_session_token") || "";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("clock-operations", {
        body: { action: "getManagerClockEntries", sessionToken, departmentId, date },
      });
      if (data?.success) {
        setWorkers(data.workers || []);
        setEntries(data.entries || []);
      }
    } catch {}
    setLoading(false);
  }, [sessionToken, departmentId, date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel("clock-entries-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clock_entries" }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // If a worker is selected, show detail view
  if (selectedWorker) {
    return (
      <ManagerClockWorkerDetail
        worker={selectedWorker}
        onBack={() => setSelectedWorker(null)}
      />
    );
  }

  const filtered = workers.filter(w => {
    const q = search.toLowerCase();
    if (!q) return true;
    return w.name.toLowerCase().includes(q) ||
      w.worker_number.includes(q) ||
      (w.worker_code || "").toLowerCase().includes(q);
  });

  const getWorkerEntries = (workerId: string) =>
    entries.filter(e => e.worker_id === workerId).sort((a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime());

  const getWorkerStatus = (workerId: string): string => {
    const wEntries = getWorkerEntries(workerId);
    if (wEntries.length === 0) return "absent";
    const last = wEntries[wEntries.length - 1];
    if (last.entry_type === "clock_in" || last.entry_type === "break_end") return "working";
    if (last.entry_type === "break_start") return "break";
    if (last.entry_type === "clock_out") return "finished";
    return "absent";
  };

  const statusLabel: Record<string, { text: string; className: string }> = {
    working: { text: "Working", className: "bg-primary/10 text-primary border-primary/20" },
    break: { text: "On break", className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
    finished: { text: "Finished", className: "bg-muted text-muted-foreground border-border" },
    absent: { text: "Absent", className: "bg-red-500/10 text-red-400 border-red-500/20" },
  };

  const workingCount = filtered.filter(w => getWorkerStatus(w.id) === "working").length;
  const breakCount = filtered.filter(w => getWorkerStatus(w.id) === "break").length;
  const finishedCount = filtered.filter(w => getWorkerStatus(w.id) === "finished").length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-muted"><Users className="h-4 w-4 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{filtered.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10"><Clock className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{workingCount}</p>
              <p className="text-xs text-muted-foreground">Working</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-yellow-500/10"><Coffee className="h-4 w-4 text-yellow-500" /></div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{breakCount}</p>
              <p className="text-xs text-muted-foreground">On break</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-muted"><ArrowLeft className="h-4 w-4 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{finishedCount}</p>
              <p className="text-xs text-muted-foreground">Finished</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, número o siglas..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-40 justify-start text-left font-normal gap-2")}
            >
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              {format(parse(date, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={parse(date, "yyyy-MM-dd", new Date())}
              onSelect={(d) => d && setDate(format(d, "yyyy-MM-dd"))}
              locale={es}
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Workers table */}
      <Card className="bg-card/50 border-border/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Trabajador</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Estado</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Entrada</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Descanso</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Salida</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No hay trabajadores</td></tr>
              ) : (
                filtered.map(w => {
                  const wEntries = getWorkerEntries(w.id);
                  const status = getWorkerStatus(w.id);
                  const sl = statusLabel[status];
                  const clockIn = wEntries.find(e => e.entry_type === "clock_in");
                  const clockOut = wEntries.find(e => e.entry_type === "clock_out");
                  const breakStart = wEntries.find(e => e.entry_type === "break_start");
                  const breakEnd = wEntries.find(e => e.entry_type === "break_end");

                  return (
                    <tr
                      key={w.id}
                      className="border-b border-border/20 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedWorker(w)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{properCase(w.name)}</div>
                        <div className="text-xs text-muted-foreground">#{w.worker_number} {w.worker_code ? `· ${w.worker_code}` : ""}</div>
                      </td>
                      <td className="text-center px-3 py-3">
                        <Badge variant="outline" className={sl.className}>{sl.text}</Badge>
                      </td>
                      <td className="text-center px-3 py-3 text-foreground">
                        {clockIn ? formatTime(clockIn.punched_at) : "—"}
                      </td>
                      <td className="text-center px-3 py-3 text-foreground">
                        {breakStart ? formatTime(breakStart.punched_at) : "—"}
                        {breakEnd ? ` → ${formatTime(breakEnd.punched_at)}` : ""}
                      </td>
                      <td className="text-center px-3 py-3 text-foreground">
                        {clockOut ? formatTime(clockOut.punched_at) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
