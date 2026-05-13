import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Download, Loader2, Calendar as CalendarIcon, Users, Tag, Info, Hand, UsersRound, Lock, AlertCircle, Phone } from "lucide-react";
import { format, eachDayOfInterval, getDay, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { ThemeToggle } from "@/components/ThemeToggle";
import LoadingScreen from "@/components/LoadingScreen";
import { Link } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useManagerAuth } from "@/hooks/useManagerAuth";

type WorkGroup = {
  id: string;
  name: string;
  color: string;
};

type WorkerTeam = {
  id: string;
  name: string;
  department_id: string;
};

type WorkGroupTeam = {
  id: string;
  work_group_id: string;
  worker_team_id: string;
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

type DayOverride = {
  id: string;
  date: string;
  is_unblocked: boolean;
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const DAY_TYPES = {
  laboral: { label: "Día laboral", color: "bg-background" },
  festivo: { label: "Festivo", color: "bg-red-500" },
  vacaciones_generales: { label: "Vacaciones Generales", color: "bg-primary" },
  vacaciones_grupo: { label: "Vacaciones de Grupo", color: "bg-blue-500" },
};

// Normalize slug by removing accents, special characters, and dashes
const normalizeSlug = (slug: string): string => {
  return slug
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, ''); // Remove all non-alphanumeric (including dashes)
};

const PublicCalendarPdf = () => {
  const { departmentSlug: rawDepartmentSlug } = useParams<{ departmentSlug: string }>();
  const navigate = useNavigate();
  const departmentSlug = rawDepartmentSlug ? normalizeSlug(rawDepartmentSlug) : '';
  const { t } = useLanguage();
  const { isAuthenticated: isManagerAuthenticated, isLoading: isManagerLoading } = useManagerAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Access control
  const [authResolved, setAuthResolved] = useState(false);
  const [canViewDepartmentCalendar, setCanViewDepartmentCalendar] = useState(false);

  // Calendar data
  const [departmentName, setDepartmentName] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [workerTeams, setWorkerTeams] = useState<WorkerTeam[]>([]);
  const [workGroupTeams, setWorkGroupTeams] = useState<WorkGroupTeam[]>([]);
  const [customDayTypes, setCustomDayTypes] = useState<CustomDayType[]>([]);
  const [infoText, setInfoText] = useState<string | null>(null);

  // Blocked days by concurrency
  const [blockedDaysByConcurrency, setBlockedDaysByConcurrency] = useState<string[]>([]);
  const [dayOverrides, setDayOverrides] = useState<DayOverride[]>([]);

  // Mobile day info sheet
  const [selectedDayInfo, setSelectedDayInfo] = useState<{
    date: Date;
    dayInfo: CalendarDay | undefined;
    isWeekend: boolean;
  } | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  // Access logic:
  // - If a worker is logged in -> redirect to personal calendar
  // - Else if a manager is logged in -> allow department calendar
  // - Else -> redirect to calendar login
  useEffect(() => {
    if (isManagerLoading) return;

    const checkAccess = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const workerId = session?.user?.user_metadata?.worker_id;

        if (workerId) {
          navigate('/mi-calendario', { replace: true });
          return;
        }

        if (isManagerAuthenticated) {
          setCanViewDepartmentCalendar(true);
          setAuthResolved(true);
          return;
        }

        // Redirect to dedicated calendar login
        navigate('/calendario-login', { replace: true });
      } catch (err) {
        console.error('Auth check error:', err);
        navigate('/calendario-login', { replace: true });
      }
    };

    checkAccess();
  }, [isManagerLoading, isManagerAuthenticated, navigate]);

  useEffect(() => {
    if (!authResolved || !canViewDepartmentCalendar) return;
    if (departmentSlug) {
      fetchCalendarData();
    }
  }, [authResolved, canViewDepartmentCalendar, departmentSlug]);

  // Real-time updates: Listen for changes in calendar data
  useEffect(() => {
    if (!departmentId) return;

    // Subscribe to changes in annual_calendar_days
    const daysChannel = supabase
      .channel('public-calendar-days')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'annual_calendar_days'
        },
        () => {
          // Refetch all data when calendar days change
          fetchCalendarData();
        }
      )
      .subscribe();

    // Subscribe to changes in work_groups
    const groupsChannel = supabase
      .channel('public-calendar-groups')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'work_groups',
          filter: `department_id=eq.${departmentId}`
        },
        () => {
          fetchCalendarData();
        }
      )
      .subscribe();

    // Subscribe to changes in custom_day_types
    const typesChannel = supabase
      .channel('public-calendar-types')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'custom_day_types',
          filter: `department_id=eq.${departmentId}`
        },
        () => {
          fetchCalendarData();
        }
      )
      .subscribe();

    // Subscribe to changes in work_group_teams
    const teamsChannel = supabase
      .channel('public-calendar-team-assignments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'work_group_teams'
        },
        () => {
          fetchCalendarData();
        }
      )
      .subscribe();

    // Subscribe to changes in annual_calendars (for info_text updates)
    const calendarsChannel = supabase
      .channel('public-calendar-settings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'annual_calendars',
          filter: `department_id=eq.${departmentId}`
        },
        () => {
          fetchCalendarData();
        }
      )
      .subscribe();

    // Subscribe to changes in department_day_overrides
    const overridesChannel = supabase
      .channel('public-calendar-overrides')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'department_day_overrides',
          filter: `department_id=eq.${departmentId}`
        },
        () => {
          fetchBlockedDaysByConcurrency(departmentId);
        }
      )
      .subscribe();

    // Subscribe to vacation requests changes (to update blocked days in real-time)
    const vacationRequestsChannel = supabase
      .channel('public-calendar-vacation-requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vacation_requests',
          filter: `department_id=eq.${departmentId}`
        },
        () => {
          fetchBlockedDaysByConcurrency(departmentId);
        }
      )
      .subscribe();

    // Subscribe to vacation request dates changes
    const vacationDatesChannel = supabase
      .channel('public-calendar-vacation-dates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vacation_request_dates'
        },
        () => {
          fetchBlockedDaysByConcurrency(departmentId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(daysChannel);
      supabase.removeChannel(groupsChannel);
      supabase.removeChannel(typesChannel);
      supabase.removeChannel(teamsChannel);
      supabase.removeChannel(calendarsChannel);
      supabase.removeChannel(overridesChannel);
      supabase.removeChannel(vacationRequestsChannel);
      supabase.removeChannel(vacationDatesChannel);
    };
  }, [departmentId]);

  // Fetch blocked days by concurrency
  const fetchBlockedDaysByConcurrency = async (deptId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('submit-vacation-request', {
        body: { 
          action: 'get-blocked-days-by-concurrency',
          departmentId: deptId,
          year
        }
      });

      if (!error && data) {
        setBlockedDaysByConcurrency(data.blockedDays || []);
        setDayOverrides(data.overrides || []);
      }
    } catch (err) {
      console.error('Error fetching blocked days:', err);
    }
  };

  // Fetch blocked days when department changes
  useEffect(() => {
    if (departmentId && year) {
      fetchBlockedDaysByConcurrency(departmentId);
    }
  }, [departmentId, year]);

  const fetchCalendarData = async () => {
    try {
      // First, find the department by slug (comparing normalized slugs)
      const { data: allDepts, error: deptError } = await supabase
        .from('departments_public')
        .select('id, name, slug');

      if (deptError || !allDepts) {
        console.error('Department fetch error:', deptError);
        setError("Departamento no encontrado");
        setLoading(false);
        return;
      }

      // Find department by comparing normalized slugs
      const deptData = allDepts.find(dept => 
        dept.slug && normalizeSlug(dept.slug) === departmentSlug
      );

      if (!deptData) {
        console.error('Department not found for slug:', departmentSlug);
        setError("Departamento no encontrado");
        setLoading(false);
        return;
      }

      setDepartmentName(deptData.name || "");
      setDepartmentId(deptData.id);

      // Get manager session token
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) {
        setError("Sesión no válida");
        setLoading(false);
        return;
      }

      // Fetch all calendar data via edge function (secure)
      const currentYear = new Date().getFullYear();
      const { data: calendarResponse, error: calError } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'getPublicCalendarData',
          sessionToken,
          departmentId: deptData.id,
          year: currentYear,
        }
      });

      if (calError || !calendarResponse?.success) {
        // Try to get latest year if current year not found
        const { data: latestResponse } = await supabase.functions.invoke('annual-calendar-operations', {
          body: {
            action: 'getPublicCalendarData',
            sessionToken,
            departmentId: deptData.id,
          }
        });

        if (!latestResponse?.success || !latestResponse?.calendar) {
          setError("No hay calendario disponible para este departamento");
          setLoading(false);
          return;
        }

        setYear(latestResponse.calendar.year);
        setInfoText(latestResponse.calendar.info_text || null);
        setCalendarDays(latestResponse.days || []);
        setWorkGroups(latestResponse.groups || []);
        setWorkerTeams(latestResponse.workerTeams || []);
        setWorkGroupTeams(latestResponse.workGroupTeams || []);
        setCustomDayTypes(latestResponse.customDayTypes || []);
      } else {
        if (!calendarResponse.calendar) {
          setError("No hay calendario disponible para este departamento");
          setLoading(false);
          return;
        }

        setYear(calendarResponse.calendar.year);
        setInfoText(calendarResponse.calendar.info_text || null);
        setCalendarDays(calendarResponse.days || []);
        setWorkGroups(calendarResponse.groups || []);
        setWorkerTeams(calendarResponse.workerTeams || []);
        setWorkGroupTeams(calendarResponse.workGroupTeams || []);
        setCustomDayTypes(calendarResponse.customDayTypes || []);
      }

      // Also fetch blocked days
      fetchBlockedDaysByConcurrency(deptData.id);

      setLoading(false);
    } catch (err) {
      console.error('Error fetching calendar:', err);
      setError("Error al cargar el calendario");
      setLoading(false);
    }
  };

  const getDayInfo = (dateStr: string): CalendarDay | undefined => {
    return calendarDays.find(d => d.date === dateStr);
  };

  const getGroupColor = (groupId: string | null): string => {
    if (!groupId) return '#3b82f6';
    const group = workGroups.find(g => g.id === groupId);
    return group?.color || '#3b82f6';
  };

  const getGroupName = (groupId: string | null): string => {
    if (!groupId) return '';
    const group = workGroups.find(g => g.id === groupId);
    return group?.name || '';
  };

  const getTeamsForGroup = (groupId: string): WorkerTeam[] => {
    const teamAssignments = workGroupTeams.filter(wgt => wgt.work_group_id === groupId);
    return teamAssignments
      .map(wgt => workerTeams.find(t => t.id === wgt.worker_team_id))
      .filter((t): t is WorkerTeam => t !== undefined);
  };

  const getGroupDisplayName = (group: WorkGroup): string => {
    const teams = getTeamsForGroup(group.id);
    if (teams.length > 0) {
      return `${group.name}: ${teams.map(t => t.name).join(', ')}`;
    }
    return group.name;
  };

  const getGroupNameWithTeams = (groupId: string | null): string => {
    if (!groupId) return '';
    const group = workGroups.find(g => g.id === groupId);
    if (!group) return '';
    
    const teams = getTeamsForGroup(groupId);
    if (teams.length > 0) {
      return `${group.name}: ${teams.map(t => t.name).join(', ')}`;
    }
    return group.name;
  };

  const getCustomDayTypeColor = (typeId: string | null): string => {
    if (!typeId) return '#dc2626';
    const type = customDayTypes.find(t => t.id === typeId);
    return type?.color || '#dc2626';
  };

  const getCustomDayTypeName = (typeId: string | null): string => {
    if (!typeId) return 'Festivo';
    const type = customDayTypes.find(t => t.id === typeId);
    return type?.name || 'Festivo';
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

  // Calculate day statistics per group (including vacaciones_generales which apply to all groups)
  const getGroupDayStats = () => {
    const vacGenCount = calendarDays.filter(d => d.day_type === 'vacaciones_generales').length;
    
    return workGroups.reduce((stats, group) => {
      const displayName = getGroupDisplayName(group);
      
      const groupCount = calendarDays.filter(d => 
        d.day_type === 'vacaciones_grupo' && (d.group_id === group.id || d.group_id_2 === group.id)
      ).length;
      
      stats[displayName] = groupCount + vacGenCount;
      return stats;
    }, {} as Record<string, number>);
  };

  const handleDownloadPdf = () => {
    setGenerating(true);
    setTimeout(() => {
      const printContent = printRef.current;
      if (!printContent) {
        setGenerating(false);
        return;
      }

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setGenerating(false);
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Calendario ${year} - ${departmentName}</title>
          <style>
            @page { size: A3 portrait; margin: 0; }
            @media print {
              body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
            body { margin: 0; padding: 10mm; background: #0a0a0a; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif; }
            * { box-sizing: border-box; }
          </style>
          <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
        </html>
      `);
      printWindow.document.close();
      
      setTimeout(() => {
        printWindow.print();
        setGenerating(false);
      }, 500);
    }, 100);
  };

  const renderMonth = (monthIndex: number) => {
    const firstDay = startOfMonth(new Date(year, monthIndex, 1));
    const lastDay = endOfMonth(new Date(year, monthIndex, 1));
    const days = eachDayOfInterval({ start: firstDay, end: lastDay });
    
    let startDayOfWeek = getDay(firstDay);
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    
    const emptyDays = Array(startDayOfWeek).fill(null);

    return (
      <div key={monthIndex} className="bg-card rounded-lg border border-border p-2">
        <h4 className="text-xs sm:text-sm font-semibold text-center mb-2 text-primary">
          {MONTH_NAMES[monthIndex]}
        </h4>
        <div className="grid grid-cols-7 gap-0.5">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day, i) => (
            <div key={i} className="text-center text-muted-foreground font-medium text-[8px] sm:text-[10px] py-0.5">
              {day}
            </div>
          ))}
          {emptyDays.map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayInfo = getDayInfo(dateStr);
            const dayOfWeek = getDay(day);
            const isWeekend = dayOfWeek === 6 || dayOfWeek === 0;
            
            // Check if day is blocked by concurrency
            const isBlockedByConcurrency = blockedDaysByConcurrency.includes(dateStr);
            const override = dayOverrides.find(o => o.date === dateStr);
            const isManuallyUnblocked = override?.is_unblocked === true;
            
            let bgClass = "";
            let textClass = "text-foreground";
            
            // "laboral" type or no dayInfo on weekdays = "Periodo Vacacional" (available for vacation requests)
            const isLaboral = dayInfo?.day_type === 'laboral';
            const isPeriodoVacacional = (!dayInfo || isLaboral) && !isWeekend;
            
            if (isWeekend && !dayInfo) {
              bgClass = "bg-muted/50";
              textClass = "text-muted-foreground";
            }

            const style: React.CSSProperties = {};
            const hasTwoGroups = dayInfo?.day_type === 'vacaciones_grupo' && dayInfo.group_id && dayInfo.group_id_2;
            
            // Priority: blocked by concurrency (unless manually unblocked) > day type styling
            if (isBlockedByConcurrency && !isManuallyUnblocked && isPeriodoVacacional) {
              bgClass = "bg-destructive/30 ring-1 ring-destructive/50";
              textClass = "text-destructive";
            } else if (dayInfo?.day_type === 'vacaciones_grupo' && dayInfo.group_id) {
              textClass = "text-white";
              if (hasTwoGroups) {
                const color1 = getGroupColor(dayInfo.group_id);
                const color2 = getGroupColor(dayInfo.group_id_2);
                style.background = `linear-gradient(90deg, ${color1} 50%, ${color2} 50%)`;
              } else {
                style.backgroundColor = getGroupColor(dayInfo.group_id);
              }
            } else if (dayInfo?.day_type === 'festivo') {
              textClass = "text-white";
              style.backgroundColor = dayInfo.custom_day_type_id 
                ? getCustomDayTypeColor(dayInfo.custom_day_type_id)
                : getSystemTypeColor('festivo');
            } else if (dayInfo?.day_type === 'vacaciones_generales') {
              textClass = "text-white";
              style.backgroundColor = getSystemTypeColor('vacaciones_generales');
            } else if (isWeekend) {
              bgClass = "bg-muted/60";
              textClass = "text-muted-foreground";
            }
            // Days without marker (Periodo Vacacional) = empty, no background - same as Annual Calendar

            const getTooltipContent = () => {
              // Show blocked status
              if (isBlockedByConcurrency && !isManuallyUnblocked && isPeriodoVacacional) {
                return (
                  <div className="space-y-1">
                    <p className="font-semibold text-destructive">No disponible</p>
                    <p className="text-xs opacity-80">Límite de personas alcanzado</p>
                  </div>
                );
              }
              if (dayInfo && dayInfo.day_type !== 'laboral') {
                return (
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {dayInfo.day_type === 'festivo' && dayInfo.custom_day_type_id 
                        ? getCustomDayTypeName(dayInfo.custom_day_type_id)
                        : DAY_TYPES[dayInfo.day_type].label
                      }
                    </p>
                    {dayInfo.day_type === 'vacaciones_grupo' && dayInfo.group_id && (
                      <div className="text-xs opacity-90">
                        <p>{getGroupNameWithTeams(dayInfo.group_id)}</p>
                        {dayInfo.group_id_2 && (
                          <p>+ {getGroupNameWithTeams(dayInfo.group_id_2)}</p>
                        )}
                      </div>
                    )}
                    {dayInfo.legend && <p className="text-xs opacity-80">{dayInfo.legend}</p>}
                  </div>
                );
              }
              if (isWeekend) {
                return <p className="text-sm">Fin de semana</p>;
              }
              // Periodo Vacacional for unmarked weekdays or laboral
              if (isPeriodoVacacional) {
                return <p className="text-sm">Periodo Vacacional</p>;
              }
              return null;
            };

            const tooltipContent = getTooltipContent();

            const handleDayClick = () => {
              setSelectedDayInfo({
                date: day,
                dayInfo,
                isWeekend
              });
            };

            return (
              <TooltipProvider key={dateStr} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      onClick={handleDayClick}
                      className={`
                        aspect-square flex items-center justify-center rounded-full text-[9px] sm:text-[10px] font-medium
                        transition-all duration-150 cursor-pointer select-none relative
                        ${bgClass} ${textClass}
                        hover:scale-110 hover:shadow-lg hover:z-10
                        active:scale-95
                      `}
                      style={style}
                    >
                      {isBlockedByConcurrency && !isManuallyUnblocked && isPeriodoVacacional && (
                        <Lock className="absolute h-2 w-2 top-0 right-0 text-destructive" />
                      )}
                      {format(day, 'd')}
                    </div>
                  </TooltipTrigger>
                  {tooltipContent && (
                    <TooltipContent side="top" className="max-w-[200px] hidden sm:block">
                      {tooltipContent}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </div>
    );
  };

  if (!authResolved) {
    return <LoadingScreen />;
  }

  if (!canViewDepartmentCalendar) {
    return <LoadingScreen />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CalendarIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-foreground mb-2">Calendario no encontrado</h1>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const groupDayStats = getGroupDayStats();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-header">
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <img 
              src="/images/verdnatura-logo-green.png" 
              alt="Verdnatura" 
              className="h-6 sm:h-8"
            />
            <div className="hidden sm:block h-6 w-px bg-border" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-semibold text-foreground truncate">
                Calendario {year}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">{departmentName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/mi-grupo`}>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground h-8 sm:h-9">
                <UsersRound className="h-4 w-4" />
                <span className="hidden sm:inline text-sm">Ver mi grupo</span>
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Legend Cards - Stacked on mobile */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {/* Legend Categories */}
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm flex items-center gap-2">
                <Tag className="h-3 w-3 sm:h-4 sm:w-4" />
                Leyenda
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {/* Festivo - always show */}
                {(() => {
                  const festivoType = customDayTypes.find(t => t.system_type === 'festivo');
                  return (
                    <div 
                      className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-white text-[10px] sm:text-xs"
                      style={{ backgroundColor: festivoType?.color || '#dc2626' }}
                    >
                      {festivoType?.name || 'Festivo'}
                    </div>
                  );
                })()}
                {/* Vacaciones Generales - always show */}
                {(() => {
                  const vacGenType = customDayTypes.find(t => t.system_type === 'vacaciones_generales');
                  return (
                    <div 
                      className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-white text-[10px] sm:text-xs"
                      style={{ backgroundColor: vacGenType?.color || '#06b6d4' }}
                    >
                      {vacGenType?.name || 'Vacaciones Generales'}
                    </div>
                  );
                })()}
                {/* Custom day types (non-system) */}
                {customDayTypes.filter(t => !t.system_type).map(type => (
                  <div 
                    key={type.id}
                    className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-white text-[10px] sm:text-xs"
                    style={{ backgroundColor: type.color }}
                  >
                    {type.name}
                  </div>
                ))}
                {/* Blocked by concurrency - show only if there are blocked days */}
                {blockedDaysByConcurrency.length > 0 && (
                  <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-destructive/30 text-destructive text-[10px] sm:text-xs ring-1 ring-destructive/50">
                    <Lock className="h-3 w-3" />
                    No disponible
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Work Groups with day counts */}
          {workGroups.length > 0 && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-xs sm:text-sm flex items-center gap-2">
                  <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                  Grupos de Trabajo
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {workGroups.map(group => {
                    const displayName = getGroupDisplayName(group);
                    const count = groupDayStats[displayName] || 0;
                    return (
                      <div 
                        key={group.id}
                        className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-white text-[10px] sm:text-xs"
                        style={{ backgroundColor: group.color }}
                      >
                        {displayName}
                        <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold ml-1">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Interaction hint - improved design */}
          <Card className="border-primary/20 bg-primary/5 sm:col-span-2 lg:col-span-1">
            <CardContent className="py-4 sm:py-5">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex-shrink-0 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Hand className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-medium text-foreground">
                    Toca cualquier día
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                    para ver información detallada
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Text Box - Responsive */}
        {infoText && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-3 sm:py-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Info className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-foreground mb-1">
                    Información
                  </p>
                  <p className="text-[11px] sm:text-sm text-muted-foreground whitespace-pre-wrap break-words">
                    {infoText}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Calendar Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {Array.from({ length: 12 }, (_, i) => renderMonth(i))}
        </div>

        {/* Footer */}
        <div className="text-center text-muted-foreground text-xs sm:text-sm py-4">
          © {new Date().getFullYear()} Verdnatura
        </div>
      </main>

      {/* Hidden PDF content for print */}
      <div className="hidden">
        <div 
          ref={printRef}
          style={{
            background: '#0a0a0a',
            padding: '20px',
            minWidth: '800px'
          }}
        >
          {/* PDF Header */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '20px',
            borderBottom: '2px solid #93d600',
            paddingBottom: '15px'
          }}>
            <img 
              src="https://vnprod.app/images/verdnatura-logo-green.png" 
              alt="Verdnatura" 
              style={{ height: '40px' }}
            />
            <div style={{ textAlign: 'right' }}>
              <div style={{ 
                color: '#ffffff', 
                fontSize: '32px', 
                fontWeight: 300,
                letterSpacing: '-1px'
              }}>
                {year}
              </div>
              <div style={{ 
                color: '#888', 
                fontSize: '14px',
                fontWeight: 400
              }}>
                {departmentName}
              </div>
            </div>
          </div>

          {/* Months Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '15px'
          }}>
            {Array.from({ length: 12 }).map((_, monthIndex) => {
              const firstDay = startOfMonth(new Date(year, monthIndex, 1));
              const lastDay = endOfMonth(new Date(year, monthIndex, 1));
              const days = eachDayOfInterval({ start: firstDay, end: lastDay });
              
              let startDayOfWeek = getDay(firstDay);
              startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
              
              return (
                <div key={monthIndex} style={{ padding: '4px' }}>
                  <div style={{ 
                    color: '#93d600', 
                    fontSize: '11px', 
                    fontWeight: 600, 
                    marginBottom: '4px',
                    textAlign: 'center'
                  }}>
                    {MONTH_NAMES[monthIndex]}
                  </div>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(7, 1fr)', 
                    gap: '2px' 
                  }}>
                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
                      <div key={i} style={{ 
                        fontSize: '8px', 
                        color: '#666', 
                        textAlign: 'center',
                        fontWeight: 500
                      }}>
                        {d}
                      </div>
                    ))}
                    
                    {Array.from({ length: startDayOfWeek }).map((_, i) => (
                      <div key={`pad-${i}`} />
                    ))}
                    
                    {days.map(day => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const dow = getDay(day);
                      const isWeekend = dow === 0 || dow === 6;
                      const dayInfo = getDayInfo(dateStr);
                      const hasTwoGroups = dayInfo?.group_id_2 && dayInfo.day_type === 'vacaciones_grupo';
                      
                      const isLaboral = dayInfo?.day_type === 'laboral';
                      
                      let bgColor = 'transparent'; // Default: no background for unmarked/laboral days
                      let textColor = '#ffffff';
                      
                      if (isWeekend && !dayInfo) {
                        bgColor = '#374151';
                        textColor = '#9ca3af';
                      } else if (dayInfo?.day_type === 'vacaciones_grupo' && dayInfo.group_id) {
                        bgColor = getGroupColor(dayInfo.group_id);
                      } else if (dayInfo?.day_type === 'festivo') {
                        bgColor = dayInfo.custom_day_type_id 
                          ? getCustomDayTypeColor(dayInfo.custom_day_type_id)
                          : getSystemTypeColor('festivo');
                      } else if (dayInfo?.day_type === 'vacaciones_generales') {
                        bgColor = getSystemTypeColor('vacaciones_generales');
                      } else if (isWeekend) {
                        bgColor = '#374151';
                        textColor = '#9ca3af';
                      } else if (!dayInfo || isLaboral) {
                        // Unmarked or laboral = no background (Periodo Vacacional)
                        textColor = '#aaaaaa';
                      }
                      
                      const secondGroupColor = hasTwoGroups ? getGroupColor(dayInfo?.group_id_2) : null;
                      
                      return (
                        <div
                          key={dateStr}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '8px',
                            fontWeight: 500,
                            color: textColor,
                            background: hasTwoGroups 
                              ? `linear-gradient(90deg, ${bgColor} 50%, ${secondGroupColor} 50%)`
                              : bgColor,
                            margin: '0 auto'
                          }}
                        >
                          {format(day, 'd')}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend in PDF */}
          <div style={{
            marginTop: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '15px',
            justifyContent: 'center'
          }}>
            {/* Festivo - always show */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: customDayTypes.find(t => t.system_type === 'festivo')?.color || '#dc2626' }} />
              <span style={{ color: '#888', fontSize: '10px' }}>{customDayTypes.find(t => t.system_type === 'festivo')?.name || 'Festivo'}</span>
            </div>
            {/* Vacaciones Generales - always show */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: customDayTypes.find(t => t.system_type === 'vacaciones_generales')?.color || '#06b6d4' }} />
              <span style={{ color: '#888', fontSize: '10px' }}>{customDayTypes.find(t => t.system_type === 'vacaciones_generales')?.name || 'Vacaciones Generales'}</span>
            </div>
            {/* Custom day types (non-system) */}
            {customDayTypes.filter(t => !t.system_type).map(type => (
              <div key={type.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: type.color }} />
                <span style={{ color: '#888', fontSize: '10px' }}>{type.name}</span>
              </div>
            ))}
            {workGroups.map(group => (
              <div key={group.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: group.color }} />
                <span style={{ color: '#888', fontSize: '10px' }}>{getGroupDisplayName(group)}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            marginTop: '20px',
            textAlign: 'center',
            color: '#666',
            fontSize: '10px'
          }}>
            © {new Date().getFullYear()} Verdnatura
          </div>
        </div>
      </div>

      {/* Day Info Sheet for mobile */}
      <Sheet open={!!selectedDayInfo} onOpenChange={(open) => !open && setSelectedDayInfo(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[50vh]">
          {selectedDayInfo && (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle className="text-lg flex items-center gap-3">
                  <CalendarIcon className="h-5 w-5 text-primary" />
                  {format(selectedDayInfo.date, "EEEE d 'de' MMMM", { locale: es })}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4">
                {/* Day type indicator */}
                {(() => {
                  const { dayInfo, isWeekend, date } = selectedDayInfo;
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const isLaboral = dayInfo?.day_type === 'laboral';
                  const isPeriodoVacacional = (!dayInfo || isLaboral) && !isWeekend;
                  
                  // Check if blocked by concurrency
                  const isBlockedByConcurrency = blockedDaysByConcurrency.includes(dateStr);
                  const override = dayOverrides.find(o => o.date === dateStr);
                  const isManuallyUnblocked = override?.is_unblocked === true;
                  const isBlocked = isBlockedByConcurrency && !isManuallyUnblocked && isPeriodoVacacional;
                  
                  let typeName = "Periodo Vacacional";
                  let typeColor = "transparent";
                  let description = "Día disponible para solicitar vacaciones";
                  
                  // Override with blocked status
                  if (isBlocked) {
                    typeName = "No disponible";
                    typeColor = "hsl(var(--destructive))";
                    description = "Límite de personas alcanzado para este día";
                  } else if (isWeekend) {
                    typeName = "Fin de semana";
                    typeColor = "#374151";
                    description = "Día no laborable";
                  } else if (dayInfo?.day_type === 'festivo') {
                    typeName = dayInfo.custom_day_type_id 
                      ? getCustomDayTypeName(dayInfo.custom_day_type_id)
                      : 'Festivo';
                    typeColor = dayInfo.custom_day_type_id 
                      ? getCustomDayTypeColor(dayInfo.custom_day_type_id)
                      : getSystemTypeColor('festivo');
                    description = "Día festivo, no laborable";
                  } else if (dayInfo?.day_type === 'vacaciones_generales') {
                    const vacGenType = customDayTypes.find(t => t.system_type === 'vacaciones_generales');
                    typeName = vacGenType?.name || 'Vacaciones Generales';
                    typeColor = getSystemTypeColor('vacaciones_generales');
                    description = "Vacaciones para todos los grupos";
                  } else if (dayInfo?.day_type === 'vacaciones_grupo' && dayInfo.group_id) {
                    const group = workGroups.find(g => g.id === dayInfo.group_id);
                    const group2 = dayInfo.group_id_2 ? workGroups.find(g => g.id === dayInfo.group_id_2) : null;
                    
                    typeName = "Vacaciones de Grupo";
                    typeColor = group?.color || '#3b82f6';
                    description = group2 
                      ? `${getGroupDisplayName(group!)} y ${getGroupDisplayName(group2)}`
                      : getGroupDisplayName(group!);
                  }
                  
                  return (
                    <>
                      <div className={`flex items-center gap-4 p-4 rounded-xl border ${isBlocked ? 'bg-destructive/10 border-destructive/30' : 'bg-muted/30 border-border'}`}>
                        <div 
                          className={`h-12 w-12 rounded-full flex-shrink-0 flex items-center justify-center ${isBlocked ? 'bg-destructive/20' : ''}`}
                          style={{ 
                            backgroundColor: isBlocked ? undefined : typeColor,
                            ...(dayInfo?.group_id_2 && dayInfo.day_type === 'vacaciones_grupo' ? {
                              background: `linear-gradient(90deg, ${typeColor} 50%, ${getGroupColor(dayInfo.group_id_2)} 50%)`
                            } : {})
                          }}
                        >
                          {isBlocked && <Lock className="h-6 w-6 text-destructive" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold ${isBlocked ? 'text-destructive' : 'text-foreground'}`}>{typeName}</p>
                          <p className="text-sm text-muted-foreground">{description}</p>
                          {dayInfo?.legend && (
                            <p className="text-xs text-muted-foreground mt-1 italic">"{dayInfo.legend}"</p>
                          )}
                        </div>
                      </div>
                      
                      {/* Urgent message for blocked days */}
                      {isBlocked && (
                        <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                              <Phone className="h-5 w-5 text-amber-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-amber-600 text-sm">{t("urgentRequestTitle")}</p>
                              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                {t("urgentRequestMessage")}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default PublicCalendarPdf;
