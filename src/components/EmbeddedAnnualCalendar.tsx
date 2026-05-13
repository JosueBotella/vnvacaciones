import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Users, Tag, Hand, Lock, Loader2, Calendar } from "lucide-react";
import { format, eachDayOfInterval, getDay, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

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

interface EmbeddedAnnualCalendarProps {
  departmentId: string;
  departmentSlug?: string;
}

export const EmbeddedAnnualCalendar = ({ departmentId, departmentSlug }: EmbeddedAnnualCalendarProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [departmentName, setDepartmentName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [workerTeams, setWorkerTeams] = useState<WorkerTeam[]>([]);
  const [workGroupTeams, setWorkGroupTeams] = useState<WorkGroupTeam[]>([]);
  const [customDayTypes, setCustomDayTypes] = useState<CustomDayType[]>([]);
  const [infoText, setInfoText] = useState<string | null>(null);
  
  const [blockedDaysByConcurrency, setBlockedDaysByConcurrency] = useState<string[]>([]);
  const [dayOverrides, setDayOverrides] = useState<DayOverride[]>([]);
  
  const [selectedDayInfo, setSelectedDayInfo] = useState<{
    date: Date;
    dayInfo: CalendarDay | undefined;
    isWeekend: boolean;
  } | null>(null);

  useEffect(() => {
    if (departmentId) {
      fetchCalendarData();
    }
  }, [departmentId]);

  // Real-time updates
  useEffect(() => {
    if (!departmentId) return;

    const daysChannel = supabase
      .channel(`embedded-calendar-days-${departmentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'annual_calendar_days' }, () => fetchCalendarData())
      .subscribe();

    const groupsChannel = supabase
      .channel(`embedded-calendar-groups-${departmentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_groups', filter: `department_id=eq.${departmentId}` }, () => fetchCalendarData())
      .subscribe();

    const typesChannel = supabase
      .channel(`embedded-calendar-types-${departmentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_day_types', filter: `department_id=eq.${departmentId}` }, () => fetchCalendarData())
      .subscribe();

    const teamsChannel = supabase
      .channel(`embedded-calendar-team-assignments-${departmentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_group_teams' }, () => fetchCalendarData())
      .subscribe();

    return () => {
      supabase.removeChannel(daysChannel);
      supabase.removeChannel(groupsChannel);
      supabase.removeChannel(typesChannel);
      supabase.removeChannel(teamsChannel);
    };
  }, [departmentId]);

  const fetchBlockedDaysByConcurrency = async (deptId: string, calYear: number) => {
    try {
      const { data, error } = await supabase.functions.invoke('submit-vacation-request', {
        body: { 
          action: 'get-blocked-days-by-concurrency',
          departmentId: deptId,
          year: calYear
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

  const fetchCalendarData = async () => {
    try {
      setLoading(true);
      
      // Fetch department info
      const { data: deptData } = await supabase
        .from('departments_public')
        .select('id, name, slug')
        .eq('id', departmentId)
        .single();

      if (deptData) {
        setDepartmentName(deptData.name || "");
      }

      // Get manager session token for authenticated access
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) {
        setError("Sesión no válida");
        setLoading(false);
        return;
      }

      // Fetch calendar data — try current year, then previous year, then without year
      const currentYear = new Date().getFullYear();
      const yearsToTry = [currentYear, currentYear - 1];
      let calendarFound = false;

      for (const tryYear of yearsToTry) {
        const { data: calendarResponse, error: calError } = await supabase.functions.invoke('annual-calendar-operations', {
          body: {
            action: 'getPublicCalendarData',
            sessionToken,
            departmentId,
            year: tryYear,
          }
        });

        if (!calError && calendarResponse?.success && calendarResponse?.calendar) {
          setYear(calendarResponse.calendar.year);
          setInfoText(calendarResponse.calendar.info_text || null);
          setCalendarDays(calendarResponse.days || []);
          setWorkGroups(calendarResponse.groups || []);
          setWorkerTeams(calendarResponse.workerTeams || []);
          setWorkGroupTeams(calendarResponse.workGroupTeams || []);
          setCustomDayTypes(calendarResponse.customDayTypes || []);
          calendarFound = true;
          break;
        }
      }

      if (!calendarFound) {
        // Last attempt without specific year
        const { data: latestResponse } = await supabase.functions.invoke('annual-calendar-operations', {
          body: {
            action: 'getPublicCalendarData',
            sessionToken,
            departmentId,
          }
        });

        if (!latestResponse?.success || !latestResponse?.calendar) {
          setError("no_calendar");
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
      }

      fetchBlockedDaysByConcurrency(departmentId, year);

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

  const renderMonth = (monthIndex: number) => {
    const firstDay = startOfMonth(new Date(year, monthIndex, 1));
    const lastDay = endOfMonth(new Date(year, monthIndex, 1));
    const days = eachDayOfInterval({ start: firstDay, end: lastDay });
    
    let startDayOfWeek = getDay(firstDay);
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    
    const emptyDays = Array(startDayOfWeek).fill(null);

    return (
      <div key={monthIndex} className="bg-card rounded-lg border border-border p-2">
        <h4 className="text-xs font-semibold text-center mb-2 text-primary">
          {MONTH_NAMES[monthIndex]}
        </h4>
        <div className="grid grid-cols-7 gap-0.5">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day, i) => (
            <div key={i} className="text-center text-muted-foreground font-medium text-[8px] py-0.5">
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
            
            const isBlockedByConcurrency = blockedDaysByConcurrency.includes(dateStr);
            const override = dayOverrides.find(o => o.date === dateStr);
            const isManuallyUnblocked = override?.is_unblocked === true;
            
            let bgClass = "";
            let textClass = "text-foreground";
            
            const isLaboral = dayInfo?.day_type === 'laboral';
            const isPeriodoVacacional = (!dayInfo || isLaboral) && !isWeekend;
            
            if (isWeekend && !dayInfo) {
              bgClass = "bg-muted/50";
              textClass = "text-muted-foreground";
            }

            const style: React.CSSProperties = {};
            const hasTwoGroups = dayInfo?.day_type === 'vacaciones_grupo' && dayInfo.group_id && dayInfo.group_id_2;
            
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

            const getTooltipContent = () => {
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
              if (isPeriodoVacacional) {
                return <p className="text-sm">Periodo Vacacional</p>;
              }
              return null;
            };

            const tooltipContent = getTooltipContent();

            const handleDayClick = () => {
              setSelectedDayInfo({ date: day, dayInfo, isWeekend });
            };

            return (
              <TooltipProvider key={dateStr} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      onClick={handleDayClick}
                      className={`
                        aspect-square flex items-center justify-center rounded-full text-[8px] font-medium
                        transition-all duration-150 cursor-pointer select-none relative
                        ${bgClass} ${textClass}
                        hover:scale-110 hover:shadow-lg hover:z-10
                        active:scale-95
                      `}
                      style={style}
                    >
                      {isBlockedByConcurrency && !isManuallyUnblocked && isPeriodoVacacional && (
                        <Lock className="absolute h-1.5 w-1.5 top-0 right-0 text-destructive" />
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <Calendar className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {error === "no_calendar"
              ? "Este departamento no tiene calendario anual configurado"
              : error}
          </p>
          {error === "no_calendar" && (
            <p className="text-xs text-muted-foreground/70 mt-1">
              Selecciona otro departamento para ver su calendario
            </p>
          )}
        </div>
      </div>
    );
  }

  const groupDayStats = getGroupDayStats();

  return (
    <div className="space-y-4">
      {/* Legend Cards */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {/* Legend Categories */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <Tag className="h-3 w-3" />
              Leyenda
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-1.5">
              {/* Festivo */}
              {(() => {
                const festivoType = customDayTypes.find(t => t.system_type === 'festivo');
                return (
                  <div 
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full text-white text-[10px]"
                    style={{ backgroundColor: festivoType?.color || '#dc2626' }}
                  >
                    {festivoType?.name || 'Festivo'}
                  </div>
                );
              })()}
              {/* Vacaciones Generales */}
              {(() => {
                const vacGenType = customDayTypes.find(t => t.system_type === 'vacaciones_generales');
                return (
                  <div 
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full text-white text-[10px]"
                    style={{ backgroundColor: vacGenType?.color || '#93d600' }}
                  >
                    {vacGenType?.name || 'Vacaciones Generales'}
                  </div>
                );
              })()}
              {/* Custom day types */}
              {customDayTypes.filter(t => !t.system_type).map(type => (
                <div 
                  key={type.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full text-white text-[10px]"
                  style={{ backgroundColor: type.color }}
                >
                  {type.name}
                </div>
              ))}
              {blockedDaysByConcurrency.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive/30 text-destructive text-[10px] ring-1 ring-destructive/50">
                  <Lock className="h-2.5 w-2.5" />
                  No disponible
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Work Groups */}
        {workGroups.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs flex items-center gap-2">
                <Users className="h-3 w-3" />
                Grupos de Trabajo
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {workGroups.map(group => {
                  const displayName = getGroupDisplayName(group);
                  const count = groupDayStats[displayName] || 0;
                  return (
                    <div 
                      key={group.id}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-full text-white text-[10px]"
                      style={{ backgroundColor: group.color }}
                    >
                      {displayName}
                      <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ml-1">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Interaction hint */}
        <Card className="border-primary/20 bg-primary/5 sm:col-span-2 lg:col-span-1">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Hand className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">
                  Toca cualquier día
                </p>
                <p className="text-[10px] text-muted-foreground">
                  para ver más información
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Text */}
      {infoText && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{infoText}</p>
          </CardContent>
        </Card>
      )}

      {/* Calendar Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {Array.from({ length: 12 }, (_, i) => renderMonth(i))}
      </div>

      {/* Day info sheet for mobile */}
      <Sheet open={!!selectedDayInfo} onOpenChange={() => setSelectedDayInfo(null)}>
        <SheetContent side="bottom" className="h-auto max-h-[50vh]">
          {selectedDayInfo && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">
                  {format(selectedDayInfo.date, "EEEE d 'de' MMMM", { locale: es })}
                </SheetTitle>
              </SheetHeader>
              <div className="py-4 space-y-3">
                {(() => {
                  const { dayInfo, isWeekend } = selectedDayInfo;
                  const dateStr = format(selectedDayInfo.date, 'yyyy-MM-dd');
                  const isBlockedByConcurrency = blockedDaysByConcurrency.includes(dateStr);
                  const override = dayOverrides.find(o => o.date === dateStr);
                  const isManuallyUnblocked = override?.is_unblocked === true;
                  const isLaboral = dayInfo?.day_type === 'laboral';
                  const isPeriodoVacacional = (!dayInfo || isLaboral) && !isWeekend;

                  if (isBlockedByConcurrency && !isManuallyUnblocked && isPeriodoVacacional) {
                    return (
                      <div className="bg-destructive/10 text-destructive rounded-lg p-4">
                        <p className="font-semibold">No disponible</p>
                        <p className="text-sm mt-1">Límite de personas alcanzado</p>
                      </div>
                    );
                  }

                  if (dayInfo && dayInfo.day_type !== 'laboral') {
                    return (
                      <div className="space-y-2">
                        <Badge 
                          className="text-white"
                          style={{ 
                            backgroundColor: dayInfo.day_type === 'vacaciones_grupo' 
                              ? getGroupColor(dayInfo.group_id)
                              : dayInfo.day_type === 'festivo' && dayInfo.custom_day_type_id
                                ? getCustomDayTypeColor(dayInfo.custom_day_type_id)
                                : getSystemTypeColor(dayInfo.day_type)
                          }}
                        >
                          {dayInfo.day_type === 'festivo' && dayInfo.custom_day_type_id 
                            ? getCustomDayTypeName(dayInfo.custom_day_type_id)
                            : DAY_TYPES[dayInfo.day_type].label
                          }
                        </Badge>
                        {dayInfo.day_type === 'vacaciones_grupo' && dayInfo.group_id && (
                          <div className="text-sm text-muted-foreground">
                            <p>{getGroupNameWithTeams(dayInfo.group_id)}</p>
                            {dayInfo.group_id_2 && (
                              <p>+ {getGroupNameWithTeams(dayInfo.group_id_2)}</p>
                            )}
                          </div>
                        )}
                        {dayInfo.legend && (
                          <p className="text-sm text-muted-foreground">{dayInfo.legend}</p>
                        )}
                      </div>
                    );
                  }

                  if (isWeekend) {
                    return (
                      <div className="bg-muted/50 rounded-lg p-4">
                        <p className="text-muted-foreground">Fin de semana</p>
                      </div>
                    );
                  }

                  return (
                    <div className="bg-primary/5 rounded-lg p-4">
                      <p className="text-foreground">Periodo Vacacional</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Día disponible para solicitar vacaciones
                      </p>
                    </div>
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
