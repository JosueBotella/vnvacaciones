import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { format, startOfWeek, addDays, addWeeks, subWeeks, getWeek, getYear } from "date-fns";
import { es } from "date-fns/locale";
import { useManagerAuth } from "@/modules/auth/hooks/useManagerAuth";

type ScheduleCell = {
  type: string;
  startTime?: string;
  endTime?: string;
  // Legacy keys from database
  start?: string;
  end?: string;
};

type WeeklySchedule = {
  id: string;
  week_number: number;
  year: number;
  configuration: Record<string, Record<string, ScheduleCell>>;
};

type DepartmentShift = {
  id: string;
  name: string;
  shift_key: string;
  color: string;
  start_time: string | null;
  end_time: string | null;
  is_rest: boolean;
};

type WorkerTeam = {
  id: string;
  name: string;
};

interface EmbeddedWorkerScheduleProps {
  workerId: string;
  workerTeamId: string | null;
  departmentId: string;
}

// Sunday first
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const LEGACY_DAY_NAMES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

export const EmbeddedWorkerSchedule = ({
  workerId,
  workerTeamId,
  departmentId,
}: EmbeddedWorkerScheduleProps) => {
  const { getSessionToken } = useManagerAuth();
  const [loading, setLoading] = useState(true);
  const [scheduleConfigured, setScheduleConfigured] = useState(false);
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [shifts, setShifts] = useState<DepartmentShift[]>([]);
  const [workerTeam, setWorkerTeam] = useState<WorkerTeam | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [weekReviewed, setWeekReviewed] = useState(false);
  const [canViewNextWeek, setCanViewNextWeek] = useState(false);

  useEffect(() => {
    fetchSchedule();
  }, [currentWeekStart, workerId, workerTeamId, departmentId]);

  const fetchSchedule = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    setLoading(true);
    try {
      const weekNumber = getWeek(currentWeekStart, { weekStartsOn: 1 });
      const year = getYear(currentWeekStart);

      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getWorkerSchedule",
          sessionToken,
          data: {
            workerId,
            workerTeamId,
            departmentId,
            weekNumber,
            year,
          },
        },
      });

      if (error || !data?.success) {
        console.error("Schedule fetch error:", data?.error || error);
        setScheduleConfigured(false);
        setLoading(false);
        return;
      }

      setScheduleConfigured(data.scheduleConfigured ?? false);
      setShifts(data.shifts || []);
      setWorkerTeam(data.workerTeam || null);
      setWeekReviewed(data.weekReviewed ?? false);
      setCanViewNextWeek(data.canViewNextWeek ?? false);
      setSchedule(
        data.schedule
          ? {
              ...data.schedule,
              configuration: data.schedule.configuration as Record<string, Record<string, ScheduleCell>>,
            }
          : null
      );
    } catch (err) {
      console.error("Error fetching schedule:", err);
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const goToNextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  const goToCurrentWeek = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // dayIndex now: 0 = Sunday (key "0"), 1 = Monday (key "1"), ..., 6 = Saturday (key "6")
  const getShiftForDay = (dayIndex: number): ScheduleCell | null => {
    if (!schedule || !workerTeam) return null;

    const config = schedule.configuration;
    const dayKey = String(dayIndex);

    // Current format: { dayKey: { teamId: cell } }
    const dayConfig = config[dayKey];
    if (dayConfig && dayConfig[workerTeam.id]) {
      return dayConfig[workerTeam.id];
    }

    // Legacy fallback
    const legacyDayName = LEGACY_DAY_NAMES[dayIndex];
    if (config[workerTeam.id]?.[legacyDayName]) {
      return config[workerTeam.id][legacyDayName];
    }
    if (config[workerTeam.name]?.[legacyDayName]) {
      return config[workerTeam.name][legacyDayName];
    }

    return null;
  };

  const getShiftDisplay = (cell: ScheduleCell | null) => {
    if (!cell) {
      return { label: "-", bgColor: undefined, textClass: "text-muted-foreground", times: "", isRest: false };
    }

    const shift = shifts.find((s) => s.shift_key === cell.type);

    if (shift) {
      // Support both startTime/endTime and start/end from database
      const start = cell.startTime ?? cell.start ?? shift.start_time ?? undefined;
      const end = cell.endTime ?? cell.end ?? shift.end_time ?? undefined;
      const times = shift.is_rest ? "" : start || end ? `${start ?? "08:00"} - ${end ?? "..."}` : "";

      return {
        label: shift.name,
        bgColor: shift.color || undefined,
        textClass: shift.color ? "text-white" : "text-foreground",
        times,
        isRest: shift.is_rest,
      };
    }

    // Fallback for legacy
    const fallbackStart = cell.startTime ?? cell.start;
    const fallbackEnd = cell.endTime ?? cell.end;
    const fallbackTimes = fallbackStart || fallbackEnd ? `${fallbackStart ?? "—"} - ${fallbackEnd ?? "..."}` : "";

    switch (cell.type) {
      case "morning":
        return { label: "Mañana", bgColor: undefined, textClass: "text-foreground", times: fallbackTimes || "06:00 - 14:00", isRest: false };
      case "afternoon":
        return { label: "Tarde", bgColor: undefined, textClass: "text-foreground", times: fallbackTimes || "14:00 - 22:00", isRest: false };
      case "night":
        return { label: "Noche", bgColor: undefined, textClass: "text-foreground", times: fallbackTimes || "22:00 - 06:00", isRest: false };
      case "rest":
        return { label: "Descanso", bgColor: undefined, textClass: "text-muted-foreground", times: "", isRest: true };
      default:
        return { label: cell.type, bgColor: undefined, textClass: "text-foreground", times: fallbackTimes, isRest: false };
    }
  };

  const weekNumber = getWeek(currentWeekStart, { weekStartsOn: 1 });
  const weekYear = getYear(currentWeekStart);
  const weekEnd = addDays(currentWeekStart, 6);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!scheduleConfigured) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">
          El horario no está configurado para este departamento
        </p>
      </div>
    );
  }

  if (!workerTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
        <AlertCircle className="h-8 w-8 text-orange-400" />
        <p className="text-muted-foreground">
          El trabajador no tiene equipo asignado
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Team Badge */}
      <div className="flex items-center gap-2">
        <Badge variant="outline">{workerTeam.name}</Badge>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={goToPreviousWeek}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={goToCurrentWeek} className="text-sm font-medium">
            Semana {weekNumber}, {weekYear}
          </Button>
          <p className="text-xs text-muted-foreground">
            {format(currentWeekStart, "d MMM", { locale: es })} - {format(weekEnd, "d MMM yyyy", { locale: es })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={goToNextWeek}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Schedule Grid */}
      {schedule ? (
        <div className="grid grid-cols-7 gap-2">
          {DAY_NAMES.map((day, i) => {
            // i=0 is Sunday (day before currentWeekStart which is Monday)
            const date = i === 0 ? addDays(currentWeekStart, -1) : addDays(currentWeekStart, i - 1);
            const cell = getShiftForDay(i);
            const display = getShiftDisplay(cell);

            return (
              <div key={i} className="text-center space-y-1">
                <div className="text-xs text-muted-foreground font-medium">{day}</div>
                <div className="text-xs text-muted-foreground">{format(date, "d/M")}</div>
                <div
                  className={`p-2 rounded-lg min-h-[60px] flex flex-col items-center justify-center ${
                    display.isRest ? "bg-muted/50" : "bg-muted/30"
                  }`}
                  style={display.bgColor ? { backgroundColor: display.bgColor } : undefined}
                >
                  <span className={`text-sm font-medium ${display.textClass}`}>
                    {display.label}
                  </span>
                  {display.times && (
                    <span className={`text-xs ${display.textClass} opacity-80`}>
                      {display.times}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          {!weekReviewed ? (
            <div className="flex flex-col items-center gap-2">
              <AlertCircle className="h-6 w-6 text-amber-500" />
              <p>El horario de esta semana aún no ha sido publicado</p>
              <p className="text-xs">Consulta con tu supervisor</p>
            </div>
          ) : (
            "No hay horario configurado para esta semana"
          )}
        </div>
      )}
    </div>
  );
};
