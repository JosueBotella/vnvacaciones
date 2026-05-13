import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, subDays, differenceInMinutes, isToday } from "date-fns";
import { enUS } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ArrowLeft, Coffee, LogOut as LogOutIcon, LogIn } from "lucide-react";

/* ─── Types ─── */
type Worker = { id: string; name: string; worker_number: string; worker_code?: string; department_name?: string };
type ClockEntry = { id: string; entry_type: string; punched_at: string };

/* ─── Helpers ─── */
function properCase(s: string) {
  return s
    .toLowerCase()
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatTime(iso: string) {
  return format(new Date(iso), "HH:mm");
}

function groupByDay(entries: ClockEntry[], days: Date[]) {
  const map: Record<string, ClockEntry[]> = {};
  days.forEach(d => { map[format(d, "yyyy-MM-dd")] = []; });
  entries.forEach(e => {
    const key = format(new Date(e.punched_at), "yyyy-MM-dd");
    if (map[key]) map[key].push(e);
  });
  return map;
}

function calcDayHours(entries: ClockEntry[]): number {
  let total = 0;
  let lastIn: Date | null = null;
  let breakStart: Date | null = null;
  let breakMins = 0;
  const sorted = [...entries].sort((a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime());
  for (const e of sorted) {
    const t = new Date(e.punched_at);
    if (e.entry_type === "clock_in") lastIn = t;
    if (e.entry_type === "break_start") breakStart = t;
    if (e.entry_type === "break_end" && breakStart) { breakMins += differenceInMinutes(t, breakStart); breakStart = null; }
    if (e.entry_type === "clock_out" && lastIn) {
      total += differenceInMinutes(t, lastIn) - breakMins;
      lastIn = null; breakMins = 0;
    }
  }
  // If still clocked in (no clock_out yet), calculate up to now
  if (lastIn) {
    total += differenceInMinutes(new Date(), lastIn) - breakMins;
  }
  return total;
}

function minsToHHMM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/* ─── Component ─── */
const ClockIn = () => {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [worker, setWorker] = useState<Worker | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [entries, setEntries] = useState<ClockEntry[]>([]);
  const [punching, setPunching] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const autoCloseRef = useRef<ReturnType<typeof setTimeout>>();

  // Build 7-day range (today going back 6 days)
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));

  const lookup = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.functions.invoke("clock-operations", {
        body: { action: "lookupWorker", workerNumber: input.trim() },
      });
      if (!data?.success) { setError("Worker not found"); setLoading(false); return; }
      setWorker(data.worker);
      setCurrentStatus(data.currentStatus);
      // Fetch week entries
      const { data: weekData } = await supabase.functions.invoke("clock-operations", {
        body: { action: "getWeekEntries", workerId: data.worker.id },
      });
      setEntries(weekData?.entries || []);
    } catch {
      setError("Connection error");
    }
    setLoading(false);
  }, [input]);

  const punch = async (type: string) => {
    if (!worker || punching) return;
    setPunching(true);
    setSuccessMsg("");
    try {
      const { data } = await supabase.functions.invoke("clock-operations", {
        body: { action: "punch", workerId: worker.id, entryType: type },
      });
      if (data?.success) {
        setCurrentStatus(type);
        const { data: weekData } = await supabase.functions.invoke("clock-operations", {
          body: { action: "getWeekEntries", workerId: worker.id },
        });
        setEntries(weekData?.entries || []);
        const labels: Record<string, string> = { clock_in: "Entrada registrada", clock_out: "Salida registrada", break_start: "Pausa iniciada", break_end: "Pausa finalizada" };
        setSuccessMsg(labels[type] || "Done");
        setTimeout(() => setSuccessMsg(""), 4000);
      }
    } catch {}
    setPunching(false);
  };

  const close = () => {
    setWorker(null);
    setInput("");
    setEntries([]);
    setError("");
    setSuccessMsg("");
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
  };

  // Auto-close after 30s of inactivity on worker screen
  useEffect(() => {
    if (!worker) return;
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    autoCloseRef.current = setTimeout(close, 10000);
    return () => { if (autoCloseRef.current) clearTimeout(autoCloseRef.current); };
  }, [worker, entries, currentStatus]);

  const handleNumpad = (val: string) => {
    if (val === "X") { setInput(""); setError(""); }
    else if (val === "OK") lookup();
    else setInput(p => p + val);
  };

  const grouped = groupByDay(entries, days);
  const totalMins = Object.values(grouped).reduce((acc, dayEntries) => acc + calcDayHours(dayEntries), 0);

  // Determine available actions based on current status
  const getActions = () => {
    if (!currentStatus || currentStatus === "clock_out") {
      return [{ type: "clock_in", label: "Entrada", icon: LogIn }];
    }
    if (currentStatus === "clock_in" || currentStatus === "break_end") {
      return [
        { type: "break_start", label: "Iniciar pausa", icon: Coffee },
        { type: "clock_out", label: "Salida", icon: LogOutIcon },
      ];
    }
    if (currentStatus === "break_start") {
      return [
        { type: "break_end", label: "Fin pausa", icon: Coffee },
        { type: "clock_out", label: "Salida", icon: LogOutIcon },
      ];
    }
    return [];
  };

  /* ─── NUMPAD SCREEN ─── */
  if (!worker) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] flex flex-col items-center justify-center p-6 select-none font-['Poppins',sans-serif] font-light">
        {/* Logo */}
        <div className="mb-10">
          <img src="/images/verdnatura-logo-green.png" alt="Verdnatura" className="h-14" />
        </div>

        {/* Input display */}
        <div className="w-80 mb-8">
          <div className="bg-muted/50 rounded-full px-6 py-4 text-center border border-border/30">
            <span className="text-3xl font-semibold text-foreground tracking-[0.3em]">
              {input || <span className="text-muted-foreground font-light">••••</span>}
            </span>
          </div>
          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-destructive text-xs text-center mt-2">
              {error}
            </motion.p>
          )}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3.5 w-80">
          {["1","2","3","4","5","6","7","8","9","X","0","OK"].map(key => {
            const isX = key === "X";
            const isOK = key === "OK";
            return (
              <button
                key={key}
                onClick={() => handleNumpad(key)}
                disabled={loading}
                className={`
                  w-22 h-22 rounded-full text-xl font-light transition-all active:scale-95
                  flex items-center justify-center
                  ${isX ? "bg-destructive/20 text-destructive hover:bg-destructive/30" :
                    isOK ? "bg-primary/20 text-primary hover:bg-primary/30" :
                    "bg-muted/60 text-foreground hover:bg-muted border border-border/20"}
                `}
                style={{ width: "5.5rem", height: "5.5rem" }}
              >
                {isX ? <X className="h-6 w-6" /> : isOK ? "✓" : key}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="mt-6">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}
      </div>
    );
  }

  /* ─── WORKER SCREEN ─── */
  const actions = getActions();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="min-h-screen bg-[hsl(var(--background))] flex flex-col p-8 select-none font-['Poppins',sans-serif] font-light"
    >
      <div className="max-w-4xl mx-auto w-full flex flex-col flex-1">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{properCase(worker.name)}</h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm text-muted-foreground">#{worker.worker_number}</p>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="text-sm font-semibold text-primary">{minsToHHMM(totalMins)} h semana</span>
            </div>
          </div>
          <button onClick={close} className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-all active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </motion.div>

        {/* Success message */}
        <AnimatePresence mode="wait">
          {successMsg && (
            <motion.div
              key={successMsg}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="mb-6 px-5 py-3 rounded-2xl bg-primary/15 border border-primary/20 text-primary text-sm font-semibold text-center backdrop-blur-sm"
            >
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 500, damping: 20 }}
                className="inline-block mr-1.5"
              >✓</motion.span>
              {successMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Punches table */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex-1 overflow-auto mb-8"
        >
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-muted-foreground font-light px-4 py-3 w-24"></th>
                  {days.map(d => {
                    const isT = isToday(d);
                    return (
                      <th key={d.toISOString()} className={`text-center font-light px-2 py-3 ${isT ? "text-primary" : "text-muted-foreground"}`}>
                        <div className="text-xs">{format(d, "EEE", { locale: enUS })}</div>
                        <div className={`text-sm mt-1 ${isT ? "bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center mx-auto font-semibold" : ""}`}>
                          {format(d, "d")}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Entrada row */}
                <tr className="border-b border-border/50">
                  <td className="px-4 py-3 text-muted-foreground text-xs flex items-center gap-1.5"><ArrowRight className="h-3 w-3 text-muted-foreground" /> Entrada</td>
                  {days.map(d => {
                    const key = format(d, "yyyy-MM-dd");
                    const clockIns = grouped[key]?.filter(e => e.entry_type === "clock_in") || [];
                    return (
                      <td key={key} className={`text-center text-sm px-1 py-3 ${isToday(d) ? "bg-primary/5" : ""}`}>
                        {clockIns.map((e, i) => (
                          <div key={i} className="text-foreground font-medium">{formatTime(e.punched_at)}</div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
                {/* Salida row */}
                <tr className="border-b border-border/50">
                  <td className="px-4 py-3 text-muted-foreground text-xs flex items-center gap-1.5"><ArrowLeft className="h-3 w-3 text-muted-foreground" /> Salida</td>
                  {days.map(d => {
                    const key = format(d, "yyyy-MM-dd");
                    const clockOuts = grouped[key]?.filter(e => e.entry_type === "clock_out") || [];
                    return (
                      <td key={key} className={`text-center text-sm px-1 py-3 ${isToday(d) ? "bg-primary/5" : ""}`}>
                        {clockOuts.map((e, i) => (
                          <div key={i} className="text-foreground font-medium">{formatTime(e.punched_at)}</div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
                {/* Pausa row */}
                <tr className="border-b border-border/50">
                  <td className="px-4 py-3 text-muted-foreground text-xs flex items-center gap-1.5"><Coffee className="h-3 w-3 text-muted-foreground" /> Pausa</td>
                  {days.map(d => {
                    const key = format(d, "yyyy-MM-dd");
                    const breaks = grouped[key]?.filter(e => e.entry_type === "break_start" || e.entry_type === "break_end") || [];
                    return (
                      <td key={key} className={`text-center text-sm px-1 py-3 ${isToday(d) ? "bg-primary/5" : ""}`}>
                        {breaks.map((e, i) => (
                          <div key={i} className="text-muted-foreground">{formatTime(e.punched_at)}</div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
                {/* Horas row */}
                <tr>
                  <td className="px-4 py-3 text-muted-foreground text-xs font-semibold">Horas</td>
                  {days.map(d => {
                    const key = format(d, "yyyy-MM-dd");
                    const dayEntries = grouped[key] || [];
                    const mins = calcDayHours(dayEntries);
                    return (
                      <td key={key} className={`text-center text-sm px-1 py-3 font-semibold ${isToday(d) ? "bg-primary/5 text-primary" : "text-foreground"}`}>
                        {mins > 0 ? minsToHHMM(mins) : "—"}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="flex gap-3 justify-center"
        >
          {actions.map((a, idx) => {
            const Icon = a.icon;
            const isPrimary = idx === 0 && (a.type === "clock_in" || a.type === "break_end");
            return (
              <motion.button
                key={a.type}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 28, delay: 0.18 + idx * 0.06 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => punch(a.type)}
                disabled={punching}
                className={`flex items-center gap-3 px-8 py-4 rounded-full text-base font-semibold transition-colors disabled:opacity-50 ${
                  isPrimary
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "bg-muted text-foreground border border-border hover:bg-muted/80"
                }`}
              >
                <Icon className="h-5 w-5" />
                {a.label}
              </motion.button>
            );
          })}
        </motion.div>
      </div>
    </motion.div>
  );
};

export default ClockIn;
