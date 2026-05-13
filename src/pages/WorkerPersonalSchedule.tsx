import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarIcon, LogOut, Clock, ChevronLeft, ChevronRight, Send, Eye, ArrowLeft, Loader2, AlertTriangle, Info, Users, ExternalLink } from "lucide-react";
import { format, startOfWeek, addDays, addWeeks, subWeeks, getWeek, getYear, getDay, isBefore, isAfter } from "date-fns";
import { es } from "date-fns/locale";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useLanguage } from "@/hooks/useLanguage";
import LoadingScreen from "@/components/LoadingScreen";
import { LogoLink } from "@/components/LogoLink";
import { toast } from "sonner";

type WorkerData = {
  id: string;
  name: string;
  worker_number: string;
  department_id: string;
  work_group_id: string | null;
  worker_team_id: string | null;
};

type WorkGroup = {
  id: string;
  name: string;
  color: string;
};

type WorkerTeam = {
  id: string;
  name: string;
};

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

// Sunday first ordering
const LEGACY_DAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

// Day keys map to translation keys - Sunday first
const DAY_TRANSLATION_KEYS = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"] as const;

const MONTH_TRANSLATION_KEYS = [
  "monthJan", "monthFeb", "monthMar", "monthApr", "monthMay", "monthJun",
  "monthJul", "monthAug", "monthSep", "monthOct", "monthNov", "monthDec"
] as const;

// dayKey now maps directly: "0" = Sunday, "1" = Monday, ..., "6" = Saturday
// weekMondayStart is the ISO week start (Monday)
const dateFromDayKey = (weekMondayStart: Date, dayKey: string) => {
  const key = Number(dayKey);
  // Sunday (key 0) is the day before Monday, so -1 days
  // Monday (key 1) is 0 days from Monday, Tuesday (key 2) is 1 day, etc.
  return key === 0 ? addDays(weekMondayStart, -1) : addDays(weekMondayStart, key - 1);
};


const WorkerPersonalScheduleContent = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [worker, setWorker] = useState<WorkerData | null>(null);
  const [workGroup, setWorkGroup] = useState<WorkGroup | null>(null);
  const [workerTeam, setWorkerTeam] = useState<WorkerTeam | null>(null);
  const [departmentName, setDepartmentName] = useState("");
  const [scheduleConfigured, setScheduleConfigured] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [shifts, setShifts] = useState<DepartmentShift[]>([]);
  const [weekReviewed, setWeekReviewed] = useState(true); // Assume reviewed if not returned
  const [loadingWeek, setLoadingWeek] = useState(false); // Loading state for week change
  
  // Admin impersonation mode
  const viewAsWorkerNumber = searchParams.get("viewAs");
  const [isAdminViewAs, setIsAdminViewAs] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (worker) {
      fetchSchedule();
    }
  }, [currentWeekStart, worker]);

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast.error(t("invalidSession") || "Sesión no válida. Por favor, inicia sesión.");
        navigate("/horario-login", { replace: true });
        return;
      }

      // Load initial schedule payload (current week) via backend function
      const weekNumber = getWeek(currentWeekStart, { weekStartsOn: 1 });
      const year = getYear(currentWeekStart);

      // Build request body - include viewAsWorkerNumber if present (admin impersonation)
      const requestBody: { action: string; weekNumber: number; year: number; viewAsWorkerNumber?: string } = { 
        action: "getSchedule", 
        weekNumber, 
        year 
      };
      if (viewAsWorkerNumber) {
        requestBody.viewAsWorkerNumber = viewAsWorkerNumber;
      }

      const { data, error } = await supabase.functions.invoke("worker-personal", {
        body: requestBody,
      });

      if (error || data?.error || !data?.success) {
        const msg = data?.error || error?.message || t("workerLoadError") || "Error al cargar datos del trabajador";
        toast.error(msg);
        if ((msg || "").toLowerCase().includes("session")) {
          navigate("/horario-login", { replace: true });
        }
        setLoading(false);
        return;
      }

      // Check if we're in admin view-as mode
      if (viewAsWorkerNumber && data.worker) {
        setIsAdminViewAs(true);
      }

      setWorker(data.worker);
      setDepartmentName(data.departmentName || "");
      setScheduleConfigured(data.scheduleConfigured ?? false);
      setWorkGroup(data.workGroup || null);
      setWorkerTeam(data.workerTeam || null);
      setShifts(data.shifts || []);
      setWeekReviewed(data.weekReviewed ?? true);
      setSchedule(data.schedule ? {
        ...data.schedule,
        configuration: data.schedule.configuration as unknown as Record<string, Record<string, ScheduleCell>>,
      } as WeeklySchedule : null);

      setLoading(false);
    } catch (err) {
      console.error("Session check error:", err);
      setLoading(false);
      navigate("/horario-login", { replace: true });
    }
  };

  const fetchScheduleForWorker = async (_workerData: WorkerData) => {
    setLoadingWeek(true);
    const weekNumber = getWeek(currentWeekStart, { weekStartsOn: 1 });
    const year = getYear(currentWeekStart);

    const { data, error } = await supabase.functions.invoke("worker-personal", {
      body: { action: "getSchedule", weekNumber, year },
    });

    if (error || data?.error || !data?.success) {
      setSchedule(null);
      setLoading(false);
      setLoadingWeek(false);
      return;
    }

    setShifts(data.shifts || []);
    setWeekReviewed(data.weekReviewed ?? true);
    setSchedule(data.schedule ? {
      ...data.schedule,
      configuration: data.schedule.configuration as unknown as Record<string, Record<string, ScheduleCell>>,
    } as WeeklySchedule : null);

    setLoading(false);
    setLoadingWeek(false);
  };

  const fetchSchedule = async () => {
    if (!worker) return;
    await fetchScheduleForWorker(worker);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/vacaciones");
  };

  const handleCloseAdminView = () => {
    window.close();
  };

  // Check if next week is accessible (only from Friday onwards)
  const canAccessNextWeek = () => {
    const today = new Date();
    const dayOfWeek = getDay(today); // 0 = Sunday, 5 = Friday
    return dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0; // Friday, Saturday, Sunday
  };

  // Get maximum accessible week start
  const getMaxAccessibleWeekStart = () => {
    const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    if (canAccessNextWeek()) {
      return addWeeks(thisWeekStart, 1);
    }
    return thisWeekStart;
  };

  const goToPreviousWeek = () => {
    const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const prevWeek = subWeeks(currentWeekStart, 1);
    // Allow going back to current week minimum
    if (!isBefore(prevWeek, thisWeekStart)) {
      setCurrentWeekStart(prevWeek);
    }
  };

  const goToNextWeek = () => {
    const maxWeek = getMaxAccessibleWeekStart();
    const nextWeek = addWeeks(currentWeekStart, 1);
    if (!isAfter(nextWeek, maxWeek)) {
      setCurrentWeekStart(nextWeek);
    }
  };

  const goToCurrentWeek = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  };

  // Check if navigation buttons should be disabled
  const isPrevDisabled = () => {
    const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    return isBefore(subWeeks(currentWeekStart, 1), thisWeekStart) || 
           currentWeekStart.getTime() === thisWeekStart.getTime();
  };

  const isNextDisabled = () => {
    const maxWeek = getMaxAccessibleWeekStart();
    return isAfter(addWeeks(currentWeekStart, 1), maxWeek) ||
           currentWeekStart.getTime() === maxWeek.getTime();
  };

  const getShiftForTeam = (dayKey: string): ScheduleCell | null => {
    if (!schedule || !workerTeam) return null;

    const config = schedule.configuration as Record<string, Record<string, ScheduleCell>>;

    // Current configuration structure (Labor Schedules): { dayKey: { teamId: cell } }
    // dayKey: "1".."6" (Mon..Sat), "0" (Sun)
    const dayConfig = config[String(dayKey)];

    if (dayConfig && dayConfig[workerTeam.id]) {
      return dayConfig[workerTeam.id];
    }

    // Fallback: try legacy formats
    // dayKey now directly maps to LEGACY_DAY_NAMES index: "0" = Sunday, "1" = Monday, etc.
    const legacyDayName = LEGACY_DAY_NAMES[Number(dayKey)];

    if (config[workerTeam.id] && config[workerTeam.id][legacyDayName]) {
      return config[workerTeam.id][legacyDayName];
    }

    if (config[workerTeam.name] && config[workerTeam.name][legacyDayName]) {
      return config[workerTeam.name][legacyDayName];
    }

    return null;
  };

  const getShiftDisplay = (cell: ScheduleCell | null) => {
    if (!cell) {
      return { label: "-", bgColor: undefined as string | undefined, textClass: "text-muted-foreground", times: "", isRest: false };
    }

    const shift = shifts.find((s) => s.shift_key === cell.type);

    if (shift) {
      // Support both startTime/endTime and start/end from database
      const start = cell.startTime ?? cell.start ?? shift.start_time ?? undefined;
      const end = cell.endTime ?? cell.end ?? shift.end_time ?? undefined;
      const hasTimes = !!(start || end);

      const times = shift.is_rest
        ? ""
        : hasTimes
          ? `${start ?? "08:00"} - ${end ?? t("endTime")}`
          : `08:00 - ${t("endTime")}`;

      return {
        label: shift.name,
        bgColor: shift.color || undefined,
        textClass: shift.color ? "text-white" : "text-foreground",
        times,
        isRest: !!shift.is_rest,
      };
    }

    // Fallback for legacy shift types
    const fallbackStart = cell.startTime ?? cell.start;
    const fallbackEnd = cell.endTime ?? cell.end;
    const fallbackTimes = fallbackStart || fallbackEnd ? `${fallbackStart ?? "—"} - ${fallbackEnd ?? t("endTime")}` : "";

    switch (cell.type) {
      case "morning":
        return { label: t("shiftMorning"), bgColor: undefined, textClass: "text-foreground", times: fallbackTimes || "06:00 - 14:00", isRest: false };
      case "afternoon":
        return { label: t("shiftAfternoon"), bgColor: undefined, textClass: "text-foreground", times: fallbackTimes || "14:00 - 22:00", isRest: false };
      case "night":
        return { label: t("shiftNight"), bgColor: undefined, textClass: "text-foreground", times: fallbackTimes || "22:00 - 06:00", isRest: false };
      case "rest":
        return { label: t("shiftRest"), bgColor: undefined, textClass: "text-muted-foreground", times: "", isRest: true };
      default:
        return { label: cell.type, bgColor: undefined, textClass: "text-foreground", times: fallbackTimes, isRest: false };
    }
  };

  // Helper to format date with translated month
  const formatDateWithMonth = (date: Date) => {
    const day = format(date, 'd');
    const monthIndex = date.getMonth();
    const monthKey = MONTH_TRANSLATION_KEYS[monthIndex];
    return `${day} ${t(monthKey)}`;
  };

  const formatDateWithMonthAndYear = (date: Date) => {
    const day = format(date, 'd');
    const monthIndex = date.getMonth();
    const monthKey = MONTH_TRANSLATION_KEYS[monthIndex];
    const year = format(date, 'yyyy');
    return `${day} ${t(monthKey)} ${year}`;
  };

  // Generate display days array with translations
  const displayDays = [0, 1, 2, 3, 4, 5, 6].map((dayKey) => ({
    key: String(dayKey),
    short: t(DAY_TRANSLATION_KEYS[dayKey]),
  }));

  const weekNumber = getWeek(currentWeekStart, { weekStartsOn: 1 });
  const weekYear = getYear(currentWeekStart);
  const weekEnd = addDays(currentWeekStart, 6);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Admin View-As Banner */}
      {isAdminViewAs && worker && (
        <div className="max-w-4xl mx-auto mb-4">
          <div className="flex items-center justify-between p-3 bg-violet-500/10 rounded-lg border border-violet-500/30">
            <div className="flex items-center gap-3">
              <Eye className="h-5 w-5 text-violet-500 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm text-violet-600">
                  Viendo como: {worker.name} #{worker.worker_number}
                </p>
                <p className="text-xs text-muted-foreground">
                  Estás visualizando el horario de este trabajador
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCloseAdminView}
              className="gap-1.5 border-violet-500/30 hover:bg-violet-500/10 text-violet-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Cerrar
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="max-w-4xl mx-auto mb-6 space-y-3 md:space-y-6">
        {/* Top row: Logo + Title + Logout */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <LogoLink to="/mi-horario" className="h-8 w-auto" />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate">{t("mySchedule")}</h1>
              <p className="text-xs text-muted-foreground truncate">
                {worker?.name} • {departmentName}
              </p>
            </div>
          </div>
          {!isAdminViewAs && (
            <Button variant="ghost" size="sm" className="h-8 px-2 flex-shrink-0 md:hidden" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        {/* Actions - Mobile: stacked layout */}
        {!isAdminViewAs && (
          <div className="grid gap-2 md:hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <LanguageSelector />
              <ThemeToggle />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="default"
                size="sm"
                className="h-9 px-3 text-xs w-full"
                onClick={() => navigate("/vacaciones")}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {t("goToVacationForm")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-xs w-full"
                onClick={() => {
                  if (worker?.worker_number) {
                    window.open(`https://salix.verdnatura.es/#/worker/${worker.worker_number}/calendar`, '_blank');
                  }
                }}
              >
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                {t("myCalendar")}
              </Button>
            </div>
          </div>
        )}

        {/* Actions - Desktop: all in one row, right aligned */}
        {!isAdminViewAs && (
          <div className="hidden md:flex md:items-center md:justify-end md:gap-3">
            <Button
              variant="default"
              size="sm"
              className="h-9 px-4 text-xs"
              onClick={() => navigate("/vacaciones")}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {t("goToVacationForm")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-4 text-xs"
              onClick={() => {
                if (worker?.worker_number) {
                  window.open(`https://salix.verdnatura.es/#/worker/${worker.worker_number}/calendar`, '_blank');
                }
              }}
            >
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              {t("myCalendar")}
            </Button>
            <LanguageSelector />
            <ThemeToggle />
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Team Info */}
      {(workGroup || workerTeam) && (
        <div className="max-w-4xl mx-auto mb-4">
          <Card className="bg-card/50">
            <CardContent className="py-2.5 px-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {workGroup && (
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: workGroup.color }}
                  />
                  <span className="font-medium">{t("vacationGroup")}: {workGroup.name}</span>
                </div>
              )}
              {workerTeam && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>|</span>
                  <span>{t("team")}: {workerTeam.name}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Info and Warning Row - 2 columns */}
      <div className="max-w-4xl mx-auto mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Funcionamiento Box */}
          <div className="flex items-start gap-2.5 p-3 bg-blue-500/8 dark:bg-blue-500/10 border border-border rounded-lg">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="font-semibold text-xs text-foreground">
                {t("howGroupsWork")}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("howGroupsWorkExplanation")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 w-full sm:w-auto"
                onClick={() => navigate("/mi-grupo")}
              >
                <Users className="h-3 w-3" />
                {t("viewMyGroup")}
              </Button>
            </div>
          </div>
          {/* Vacation Warning Box */}
          <div className="flex items-start gap-2.5 p-3 bg-amber-500/8 dark:bg-amber-500/10 border border-border rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="font-semibold text-xs text-foreground">
                {t("vacationWarningTitle")}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("vacationWarningMessage")}
              </p>
              <a
                href={`https://salix.verdnatura.es/#/worker/${worker?.worker_number || ''}/calendar`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 h-7 px-3 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors w-full sm:w-auto"
              >
                <ExternalLink className="h-3 w-3" />
                {t("viewSalixCalendar")}
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="max-w-4xl mx-auto mb-4">
        <div className="flex items-center justify-between">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={goToPreviousWeek}
            disabled={isPrevDisabled()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="text-center">
            <div className="font-semibold">
              {t("week")} {weekNumber} - {weekYear}
            </div>
            <div className="text-sm text-muted-foreground">
              {formatDateWithMonth(currentWeekStart)} - {formatDateWithMonthAndYear(weekEnd)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToCurrentWeek}>
              {t("today")}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={goToNextWeek}
              disabled={isNextDisabled()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Schedule Display */}
      <div className="max-w-4xl mx-auto">
        <div className="text-sm text-muted-foreground flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4" />
          {t("weeklySchedule")}
        </div>
        
        {loadingWeek ? (
          <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">{t("loadingSchedule") || "Cargando horario..."}</p>
          </div>
        ) : !scheduleConfigured ? (
          <div className="text-center py-12 text-muted-foreground animate-fade-in">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium mb-2">{t("scheduleComingSoon")}</p>
            <p className="text-sm">{t("scheduleComingSoonDesc")}</p>
          </div>
        ) : !workerTeam ? (
          <div className="text-center py-8 text-muted-foreground animate-fade-in">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{t("noTeamAssigned")}</p>
          </div>
        ) : !schedule && !weekReviewed ? (
          <div className="text-center py-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/10 mb-3">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <p className="text-base font-semibold text-foreground mb-1">
              {t("schedulePendingReview") || "El horario está siendo preparado"}
            </p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {t("schedulePendingReviewDesc") || "El horario de esta semana estará disponible próximamente. Por favor, consulta más tarde."}
            </p>
          </div>
        ) : !schedule ? (
          <div className="text-center py-8 text-muted-foreground animate-fade-in">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{t("noScheduleForWeek")}</p>
          </div>
        ) : (
          <div className="animate-fade-in">
            {/* Desktop View - Minimal grid */}
            <div className="hidden md:grid md:grid-cols-7 gap-1 border border-border/50 rounded-lg overflow-hidden">
              {displayDays.map(({ key: dayKey, short }, idx) => {
                const date = dateFromDayKey(currentWeekStart, dayKey);
                const cell = getShiftForTeam(dayKey);
                const display = getShiftDisplay(cell);
                const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                const isWeekend = dayKey === '6'; // Saturday is the weekly rest day

                return (
                  <div
                    key={dayKey}
                    className={`p-3 text-center border-r border-border/30 last:border-r-0 ${isWeekend ? 'bg-muted/30' : 'bg-card/50'} ${isToday ? 'bg-primary/5' : ''}`}
                  >
                    <div className={`text-[10px] uppercase tracking-wider mb-1 ${isToday ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                      {short}
                    </div>
                    <div className={`text-base font-medium mb-2 ${isToday ? 'text-primary' : ''}`}>
                      {format(date, 'd')}
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="flex items-center gap-1.5">
                        {display.bgColor && (
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: display.bgColor }}
                          />
                        )}
                        <span className={`text-sm font-medium ${display.isRest ? 'text-muted-foreground' : ''}`}>
                          {display.label}
                        </span>
                      </div>
                      {!display.isRest && display.times && (
                        <span className="text-[10px] text-muted-foreground">{display.times}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile View - Minimal list */}
            <div className="md:hidden border border-border/50 rounded-lg overflow-hidden divide-y divide-border/30">
              {displayDays.map(({ key: dayKey, short }) => {
                const date = dateFromDayKey(currentWeekStart, dayKey);
                const cell = getShiftForTeam(dayKey);
                const display = getShiftDisplay(cell);
                const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                const isWeekend = dayKey === '6';

                return (
                  <div
                    key={dayKey}
                    className={`flex items-center justify-between px-4 py-2.5 ${isWeekend ? 'bg-muted/30' : 'bg-card/50'} ${isToday ? 'bg-primary/5' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 ${isToday ? 'text-primary' : ''}`}>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{short}</div>
                        <div className="text-sm font-medium">{format(date, 'd')}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {display.bgColor && (
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: display.bgColor }}
                          />
                        )}
                        <span className={`text-sm font-medium ${display.isRest ? 'text-muted-foreground' : ''}`}>
                          {display.label}
                        </span>
                      </div>
                    </div>
                    {!display.isRest && display.times && (
                      <span className="text-xs text-muted-foreground">{display.times}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Copyright Footer */}
      <footer className="max-w-4xl mx-auto mt-8 py-4 text-center text-sm text-muted-foreground border-t border-border">
        © {new Date().getFullYear()} Verdnatura. {t("allRightsReserved")}
      </footer>
    </div>
  );
};

const WorkerPersonalSchedule = () => {
  return <WorkerPersonalScheduleContent />;
};

export default WorkerPersonalSchedule;
