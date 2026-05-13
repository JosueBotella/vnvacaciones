import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Calendar as CalendarIcon, Clock, LogOut, Info, Send, ChevronLeft, ChevronRight, AlertCircle, Eye, ArrowLeft } from "lucide-react";
import { format, eachDayOfInterval, getDay, startOfMonth, endOfMonth } from "date-fns";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useLanguage } from "@/hooks/useLanguage";
import LoadingScreen from "@/components/LoadingScreen";
import { LogoLink } from "@/components/LogoLink";
import { toast } from "sonner";

type WorkGroup = {
  id: string;
  name: string;
  color: string;
};

type CustomDayType = {
  id: string;
  name: string;
  color: string;
  system_type?: string | null;
};

type CalendarDay = {
  id: string;
  date: string;
  day_type: 'laboral' | 'festivo' | 'vacaciones_generales' | 'vacaciones_grupo';
  legend: string | null;
  group_id: string | null;
  group_id_2: string | null;
  custom_day_type_id: string | null;
};

type WorkerData = {
  id: string;
  name: string;
  worker_number: string;
  department_id: string;
  work_group_id: string | null;
};

type VacationSummary = {
  groupVacationDays: number;
  generalVacationDays: number;
  approvedRequestDays: number;
  totalVacationDays: number;
  totalFreeAssignment: number;
  freeAssignmentUsed: number;
  freeAssignmentRemaining: number;
};

const MONTH_KEYS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LONG_KEYS = ["mondayLong", "tuesdayLong", "wednesdayLong", "thursdayLong", "fridayLong", "saturdayLong", "sundayLong"];

const WorkerPersonalCalendarContent = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [worker, setWorker] = useState<WorkerData | null>(null);
  const [workGroup, setWorkGroup] = useState<WorkGroup | null>(null);
  const [departmentName, setDepartmentName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [customDayTypes, setCustomDayTypes] = useState<CustomDayType[]>([]);
  const [myApprovedDays, setMyApprovedDays] = useState<Set<string>>(new Set());
  const [myPendingDays, setMyPendingDays] = useState<Set<string>>(new Set());
  const [otherGroupVacationDays, setOtherGroupVacationDays] = useState<Set<string>>(new Set());
  const [unlockedDates, setUnlockedDates] = useState<Set<string>>(new Set());
  const [adminAssignedDates, setAdminAssignedDates] = useState<Set<string>>(new Set());
  const [freeAssignmentDates, setFreeAssignmentDates] = useState<Set<string>>(new Set());
  const [vacationSummary, setVacationSummary] = useState<VacationSummary | null>(null);
  
  // Admin impersonation mode
  const viewAsWorkerNumber = searchParams.get("viewAs");
  const [isAdminViewAs, setIsAdminViewAs] = useState(false);
  
  // Mobile month navigation
  const [mobileMonth, setMobileMonth] = useState(new Date().getMonth());
  
  // Mobile day info sheet
  const [selectedDayInfo, setSelectedDayInfo] = useState<{
    date: Date;
    dayInfo: CalendarDay | undefined;
    isWeekend: boolean;
  } | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast.error(t("invalidSession") || "Sesión no válida. Por favor, inicia sesión.");
        navigate("/calendario-login", { replace: true });
        return;
      }

      // If NOT admin view-as mode, redirect worker to Salix calendar
      if (!viewAsWorkerNumber) {
        // Get worker number from session metadata
        const workerNumber = session.user?.user_metadata?.worker_number;
        if (workerNumber) {
          // Redirect to Salix and then to schedule page
          window.open(`https://salix.verdnatura.es/#/worker/${workerNumber}/calendar`, '_blank');
          navigate("/mi-horario", { replace: true });
          return;
        }
      }

      // Build request body - include viewAsWorkerNumber if present (admin impersonation)
      const requestBody: { action: string; viewAsWorkerNumber?: string } = { action: "getCalendar" };
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
          navigate("/calendario-login", { replace: true });
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
      setWorkGroup(data.workGroup || null);

      const cal = data.calendar;
      if (cal) {
        setYear(cal.year);
      }

      setCalendarDays(data.calendarDays || []);
      setCustomDayTypes(data.customDayTypes || []);
      setMyApprovedDays(new Set<string>(data.approvedDates || []));
      setMyPendingDays(new Set<string>(data.pendingDates || []));
      setOtherGroupVacationDays(new Set<string>(data.otherGroupVacationDays || []));
      setUnlockedDates(new Set<string>(data.unlockedDates || []));
      setAdminAssignedDates(new Set<string>(data.adminAssignedDates || []));
      setFreeAssignmentDates(new Set<string>(data.freeAssignmentDates || []));
      setVacationSummary(data.vacationSummary || null);

      setLoading(false);
    } catch (err) {
      console.error("Session check error:", err);
      setLoading(false);
      navigate("/calendario-login", { replace: true });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/vacaciones");
  };

  const handleCloseAdminView = () => {
    window.close();
  };

  const getDayInfo = (dateStr: string): CalendarDay | undefined => {
    return calendarDays.find(d => d.date === dateStr);
  };

  const translateLegend = (legend: string | null): string | null => {
    if (!legend) return null;
    const normalized = legend.trim().toLowerCase();

    // Known system legends that should be localized
    if (normalized === "periodo vacacional") return t("vacationPeriod");

    return legend;
  };

  const getSystemTypeColor = (systemType: string): string => {
    const type = customDayTypes.find(t => t.system_type === systemType);
    if (type) return type.color;
    
    switch (systemType) {
      case 'festivo': return '#dc2626';
      case 'vacaciones_generales': return '#06b6d4';
      default: return '#3b82f6';
    }
  };

  const getCustomDayTypeColor = (typeId: string | null): string => {
    if (!typeId) return '#dc2626';
    const type = customDayTypes.find(t => t.id === typeId);
    return type?.color || '#dc2626';
  };

  const getCustomDayTypeName = (typeId: string | null): string => {
    if (!typeId) return t("holiday");
    const type = customDayTypes.find(t => t.id === typeId);
    if (!type) return t("holiday");

    // Allow a custom/system type to represent the "non-vacation" period and localize it
    const normalizedName = (type.name || "").trim().toLowerCase();
    if (type.system_type === "laboral" || normalizedName === "periodo no vacacional") {
      return t("nonVacationPeriod");
    }

    return type.name;
  };

  const isDayRelevantToWorker = (dayInfo: CalendarDay | undefined): boolean => {
    if (!dayInfo) return false;
    
    if (dayInfo.day_type === 'festivo' || dayInfo.day_type === 'vacaciones_generales') {
      return true;
    }
    
    if (dayInfo.day_type === 'vacaciones_grupo' && workGroup) {
      return dayInfo.group_id === workGroup.id || dayInfo.group_id_2 === workGroup.id;
    }
    
    return false;
  };

  const renderMonth = (monthIndex: number, hideTitleOnMobile = false) => {
    const firstDay = startOfMonth(new Date(year, monthIndex, 1));
    const lastDay = endOfMonth(firstDay);
    const days = eachDayOfInterval({ start: firstDay, end: lastDay });
    const startDayOfWeek = getDay(firstDay);
    const adjustedStartDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    return (
      <div key={monthIndex} className="mb-6">
        <h3 className={`text-sm font-semibold mb-3 text-center ${hideTitleOnMobile ? 'hidden' : ''}`}>{t(MONTH_KEYS[monthIndex])}</h3>
        <div className="grid grid-cols-7 gap-1 text-xs">
          {DAY_KEYS.map((dayKey, i) => (
            <div key={i} className="text-center text-muted-foreground font-medium py-1 h-8 flex items-center justify-center">
              {t(dayKey)}
            </div>
          ))}
          
          {Array.from({ length: adjustedStartDay }).map((_, i) => (
            <div key={`empty-${i}`} className="h-8" />
          ))}
          
          {days.map((date) => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayInfo = getDayInfo(dateStr);
            const dayOfWeek = getDay(date);
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isUnlocked = unlockedDates.has(dateStr);
            const isAdminAssigned = adminAssignedDates.has(dateStr);
            const isFreeAssignment = freeAssignmentDates.has(dateStr);
            // If the day is unlocked (removed by admin modification), don't treat as group vacation
            const isRelevant = !isUnlocked && isDayRelevantToWorker(dayInfo);
            const isMyApprovedDay = myApprovedDays.has(dateStr);
            const isMyPendingDay = myPendingDays.has(dateStr);
            
            let bgColor = '';
            let textColor = 'text-foreground';
            let title = '';
            let customBgStyle: React.CSSProperties | undefined;
            
            // Priority: Approved > Free Assignment > Admin Assigned > Pending > Calendar > Weekend
            if (isMyApprovedDay) {
              customBgStyle = { backgroundColor: '#3b82f6' }; // Electric blue
              textColor = 'text-white';
              title = t("myApprovedVacations");
            } else if (isFreeAssignment) {
              customBgStyle = { backgroundColor: '#93d600' }; // Corporate green for free assignment days
              textColor = 'text-foreground';
              title = t("freeConfigDays") || "Libre configuración";
            } else if (isAdminAssigned) {
              customBgStyle = { backgroundColor: '#8b5cf6' }; // Violet for admin assigned
              textColor = 'text-white';
              title = t("adminAssigned") || "Asignado por admin";
            } else if (isMyPendingDay) {
              bgColor = 'bg-muted';
              textColor = 'text-muted-foreground';
              title = t("pendingApproval");
            } else if (isWeekend) {
              textColor = 'text-muted-foreground/50';
            } else if (otherGroupVacationDays.has(dateStr)) {
              // Other groups on vacation = Periodo No Vacacional for this worker
              bgColor = 'bg-muted-foreground/30';
              textColor = 'text-foreground';
              title = t("nonVacationPeriod");
            } else if (isRelevant && dayInfo) {
              if (dayInfo.day_type === 'festivo') {
                const color = dayInfo.custom_day_type_id 
                  ? getCustomDayTypeColor(dayInfo.custom_day_type_id)
                  : getSystemTypeColor('festivo');
                title = dayInfo.custom_day_type_id
                  ? getCustomDayTypeName(dayInfo.custom_day_type_id)
                  : t("holiday");
                if (dayInfo.legend) title += `: ${translateLegend(dayInfo.legend)}`;
                return (
                  <Tooltip key={dateStr}>
                    <TooltipTrigger asChild>
                      <div
                        className="h-8 w-8 flex items-center justify-center rounded-full text-white text-xs cursor-pointer mx-auto hover:ring-2 hover:ring-primary/50"
                        style={{ backgroundColor: color }}
                        onClick={() => setSelectedDayInfo({ date, dayInfo, isWeekend })}
                      >
                        {date.getDate()}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{title}</TooltipContent>
                  </Tooltip>
                );
              } else if (dayInfo.day_type === 'vacaciones_generales') {
                const color = getSystemTypeColor('vacaciones_generales');
                title = t("generalVacations");
                if (dayInfo.legend) title += `: ${translateLegend(dayInfo.legend)}`;
                return (
                  <Tooltip key={dateStr}>
                    <TooltipTrigger asChild>
                      <div
                        className="h-8 w-8 flex items-center justify-center rounded-full text-foreground text-xs cursor-pointer mx-auto hover:ring-2 hover:ring-primary/50"
                        style={{ backgroundColor: color }}
                        onClick={() => setSelectedDayInfo({ date, dayInfo, isWeekend })}
                      >
                        {date.getDate()}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{title}</TooltipContent>
                  </Tooltip>
                );
              } else if (dayInfo.day_type === 'vacaciones_grupo' && workGroup) {
                title = `${t("groupVacations")} ${workGroup.name}`;
                if (dayInfo.legend) title += `: ${translateLegend(dayInfo.legend)}`;
                return (
                  <Tooltip key={dateStr}>
                    <TooltipTrigger asChild>
                      <div
                        className="h-8 w-8 flex items-center justify-center rounded-full text-white text-xs cursor-pointer mx-auto hover:ring-2 hover:ring-primary/50"
                        style={{ backgroundColor: workGroup.color }}
                        onClick={() => setSelectedDayInfo({ date, dayInfo, isWeekend })}
                      >
                        {date.getDate()}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{title}</TooltipContent>
                  </Tooltip>
                );
              }
            }
            
            return (
              <Tooltip key={dateStr}>
                <TooltipTrigger asChild>
                  <div
                    className={`h-8 w-8 flex items-center justify-center rounded-full text-xs cursor-pointer mx-auto hover:ring-2 hover:ring-primary/50 ${bgColor} ${textColor}`}
                    style={customBgStyle}
                    onClick={() => setSelectedDayInfo({ date, dayInfo, isWeekend })}
                  >
                    {date.getDate()}
                  </div>
                </TooltipTrigger>
                {title && <TooltipContent>{title}</TooltipContent>}
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background p-4">
        {/* Admin View-As Banner */}
        {isAdminViewAs && worker && (
          <div className="max-w-6xl mx-auto mb-4">
            <div className="flex items-center justify-between p-3 bg-violet-500/10 rounded-lg border border-violet-500/30">
              <div className="flex items-center gap-3">
                <Eye className="h-5 w-5 text-violet-500 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-violet-600">
                    Viendo como: {worker.name} #{worker.worker_number}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Estás visualizando el calendario personal de este trabajador
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
        <div className="max-w-6xl mx-auto mb-6 space-y-3 md:space-y-6">
          {/* Top row: Logo + Title + Logout */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <LogoLink to="/mi-calendario" className="h-8 w-auto" />
              <div className="min-w-0">
                <h1 className="text-lg font-semibold truncate">{t("myCalendar")}</h1>
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
                  onClick={() => navigate("/mi-horario")}
                >
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  {t("mySchedule")}
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
                onClick={() => navigate("/mi-horario")}
              >
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                {t("mySchedule")}
              </Button>
              <LanguageSelector />
              <ThemeToggle />
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Worker Info Card */}
        {workGroup && (
          <div className="max-w-6xl mx-auto mb-4">
            <Card>
              <CardContent className="py-3 flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: workGroup.color }}
                />
                <span className="font-medium">{t("vacationGroup")}: {workGroup.name}</span>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Info + Summary (side-by-side on desktop) */}
        {(() => {
          const showInfo = true; // Always show the info section
          
          return (
            <div className="max-w-6xl mx-auto mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-muted/50">
                <CardContent className="py-3 flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm text-muted-foreground" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                    {t("vacationPeriodInfo")}
                  </p>
                </CardContent>
              </Card>

            {vacationSummary && (
              <Card className="bg-primary/10 border-primary/20">
                <CardContent className="py-4 space-y-3">
                  {/* Total Vacation Days */}
                  <div className="flex items-center justify-center gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">{vacationSummary.totalVacationDays}</div>
                      <div className="text-muted-foreground text-xs">{t("totalVacationDays")}</div>
                    </div>
                    <div className="h-10 w-px bg-border" />
                    <div className="flex gap-3 text-center">
                      <div>
                        <div className="font-semibold">{vacationSummary.generalVacationDays}</div>
                        <div className="text-xs text-muted-foreground">{t("general")}</div>
                      </div>
                      <div>
                        <div className="font-semibold">{vacationSummary.groupVacationDays}</div>
                        <div className="text-xs text-muted-foreground">{t("group")}</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Free Assignment Days - Clean two-column layout */}
                  <div className="border-t border-primary/20 pt-3">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2 text-center">{t("freeAssignmentDays")}</div>
                    <div className="flex justify-center gap-6">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">{vacationSummary.freeAssignmentUsed}</div>
                        <div className="text-xs text-muted-foreground">{t("freeAssignmentUsed")}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{vacationSummary.totalFreeAssignment}</div>
                        <div className="text-xs text-muted-foreground">{t("freeAssignmentAvailable")}</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Warning with formal icon */}
                  <div className="flex items-start gap-2 pt-2 border-t border-primary/10" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      {t("freeAssignmentWarning")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            </div>
          );
        })()}

        {/* Calendar Grid */}
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                {t("calendar")} {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Legend */}
              <div className="flex flex-wrap gap-3 mb-6 text-xs sm:text-sm">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                  <span>{t("myVacations")}</span>
                </div>
                {freeAssignmentDates.size > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#93d600' }} />
                    <span>{t("freeConfigDays") || "Libre config."}</span>
                  </div>
                )}
                {adminAssignedDates.size > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#8b5cf6' }} />
                    <span>{t("adminAssigned") || "Admin"}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-muted" />
                  <span>{t("pending")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: getSystemTypeColor('vacaciones_generales') }}
                  />
                  <span>{t("generalVacations")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: getSystemTypeColor('festivo') }}
                  />
                  <span>{t("holiday")}</span>
                </div>
                {workGroup && (
                  <div className="flex items-center gap-1.5">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: workGroup.color }}
                    />
                    <span>{t("groupVacations")}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
                  <span>{t("nonVacationPeriod")}</span>
                </div>
              </div>

              {/* Mobile: Single month with swipe navigation */}
              <div 
                className="md:hidden"
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  (e.currentTarget as HTMLElement).dataset.touchStartX = String(touch.clientX);
                }}
                onTouchEnd={(e) => {
                  const startX = Number((e.currentTarget as HTMLElement).dataset.touchStartX || 0);
                  const endX = e.changedTouches[0].clientX;
                  const diff = startX - endX;
                  
                  // Swipe threshold of 50px
                  if (Math.abs(diff) > 50) {
                    if (diff > 0 && mobileMonth < 11) {
                      // Swipe left -> next month
                      setMobileMonth(m => m + 1);
                    } else if (diff < 0 && mobileMonth > 0) {
                      // Swipe right -> previous month
                      setMobileMonth(m => m - 1);
                    }
                  }
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMobileMonth(m => Math.max(0, m - 1))}
                    disabled={mobileMonth === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-semibold">{t(MONTH_KEYS[mobileMonth])}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMobileMonth(m => Math.min(11, m + 1))}
                    disabled={mobileMonth === 11}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="max-w-xs mx-auto">
                  {renderMonth(mobileMonth, true)}
                </div>
              </div>

              {/* Desktop: Full year grid */}
              <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-4 gap-6">
                {MONTH_KEYS.map((_, idx) => renderMonth(idx))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Mobile Day Info Sheet */}
        <Sheet open={!!selectedDayInfo} onOpenChange={() => setSelectedDayInfo(null)}>
          <SheetContent side="bottom" className="h-auto">
            <SheetHeader>
              <SheetTitle>
                {selectedDayInfo && (() => {
                  const d = selectedDayInfo.date;
                  const dayOfWeek = d.getDay();
                  // Convert JS day (0=Sunday) to our key array (0=Monday)
                  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                  const dayName = t(DAY_LONG_KEYS[dayIndex]);
                  const dayNum = d.getDate();
                  const monthName = t(MONTH_KEYS[d.getMonth()]);
                  
                  if (language === 'ar') {
                    return `${dayName}، ${dayNum} ${monthName}`;
                  } else if (language === 'fr') {
                    return `${dayName}, ${dayNum} ${monthName}`;
                  }
                  return `${dayName}, ${dayNum} de ${monthName}`;
                })()}
              </SheetTitle>
            </SheetHeader>
            <div className="py-4">
              {selectedDayInfo && (() => {
                const { dayInfo, isWeekend, date } = selectedDayInfo;
                const dateStr = format(date, 'yyyy-MM-dd');
                const isMyApprovedDay = myApprovedDays.has(dateStr);
                const isMyPendingDay = myPendingDays.has(dateStr);
                const isFreeAssignment = freeAssignmentDates.has(dateStr);
                const isRelevant = isDayRelevantToWorker(dayInfo);
                
                if (isMyApprovedDay) {
                  return (
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                      <span>{t("myApprovedVacations")}</span>
                    </div>
                  );
                }
                
                if (isFreeAssignment) {
                  return (
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full" style={{ backgroundColor: '#93d600' }} />
                      <span>{t("freeConfigDays") || "Libre configuración"}</span>
                    </div>
                  );
                }
                
                if (isMyPendingDay) {
                  return (
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-muted" />
                      <span className="text-muted-foreground">{t("pendingApproval")}</span>
                    </div>
                  );
                }
                
                if (isWeekend) {
                  return <p className="text-muted-foreground">{t("weekend")}</p>;
                }
                
                // If day has "laboral" type marked explicitly -> "Periodo No Vacacional"
                // If day has no marking at all -> "Periodo Vacacional" (available for vacations)
                if (dayInfo && dayInfo.day_type === 'laboral') {
                  return <p className="text-muted-foreground">{t("nonVacationPeriod")}</p>;
                }
                
                if (!dayInfo) {
                  return <p className="text-muted-foreground">{t("vacationPeriod")}</p>;
                }
                
                if (!isRelevant) {
                  return <p className="text-muted-foreground">{t("vacationPeriod")}</p>;
                }
                
                let label = '';
                let color = '';
                
                if (dayInfo.day_type === 'festivo') {
                  label = dayInfo.custom_day_type_id 
                    ? getCustomDayTypeName(dayInfo.custom_day_type_id)
                    : t("holiday");
                  color = dayInfo.custom_day_type_id 
                    ? getCustomDayTypeColor(dayInfo.custom_day_type_id)
                    : getSystemTypeColor('festivo');
                } else if (dayInfo.day_type === 'vacaciones_generales') {
                  label = t("generalVacations");
                  color = getSystemTypeColor('vacaciones_generales');
                } else if (dayInfo.day_type === 'vacaciones_grupo' && workGroup) {
                  label = `${t("groupVacations")} ${workGroup.name}`;
                  color = workGroup.color;
                }
                
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="font-medium">{label}</span>
                    </div>
                    {dayInfo.legend && (
                      <p className="text-sm text-muted-foreground ml-8">{translateLegend(dayInfo.legend)}</p>
                    )}
                  </div>
                );
              })()}
            </div>
          </SheetContent>
        </Sheet>

        {/* Copyright Footer */}
        <footer className="max-w-6xl mx-auto mt-8 py-4 text-center text-sm text-muted-foreground border-t border-border">
          © {new Date().getFullYear()} Verdnatura. {t("allRightsReserved")}
        </footer>
      </div>
    </TooltipProvider>
  );
};

const WorkerPersonalCalendar = () => {
  return <WorkerPersonalCalendarContent />;
};

export default WorkerPersonalCalendar;
