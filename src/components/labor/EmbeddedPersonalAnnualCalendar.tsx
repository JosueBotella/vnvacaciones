import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, eachDayOfInterval, getDay, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { es } from "date-fns/locale";

type WorkGroup = {
  id: string;
  name: string;
  color: string;
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

type CustomDayType = {
  id: string;
  name: string;
  color: string;
  system_type?: string | null;
};

type PersonalCalendarWorker = {
  id: string;
  personal_calendar_id: string;
  worker_id: string | null;
  worker_name: string;
  worker_number: string;
  source_group_id: string | null;
  color: string;
  sort_order: number;
};

type PersonalCalendarDay = {
  id: string;
  personal_calendar_id: string;
  personal_calendar_worker_id: string;
  date: string;
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

interface EmbeddedPersonalAnnualCalendarProps {
  calendarId: string;
  departmentId: string;
  year: number;
  workers: PersonalCalendarWorker[];
  workGroups: WorkGroup[];
  selectedWorkerId: string | null;
  onSelectWorker: (workerId: string | null) => void;
}

export const EmbeddedPersonalAnnualCalendar = ({
  calendarId,
  departmentId,
  year,
  workers,
  workGroups,
  selectedWorkerId,
  onSelectWorker
}: EmbeddedPersonalAnnualCalendarProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [customDayTypes, setCustomDayTypes] = useState<CustomDayType[]>([]);
  const [personalDays, setPersonalDays] = useState<PersonalCalendarDay[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const sessionToken = localStorage.getItem("manager_session_token");
    if (!sessionToken) {
      setLoading(false);
      return;
    }

    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getPersonalAnnualCalendarFullData",
          sessionToken,
          data: { calendarId, departmentId }
        }
      });

      if (data?.success) {
        setCalendarDays(data.calendarDays || []);
        setCustomDayTypes(data.customDayTypes || []);
        setPersonalDays(data.personalDays || []);
      }
    } catch (error) {
      console.error("Error fetching calendar data:", error);
    }
    setLoading(false);
  }, [calendarId, departmentId]);

  // Create a key based on workers to trigger refetch when workers change
  const workersKey = workers.map(w => w.id).join(',');

  useEffect(() => {
    if (calendarId) {
      fetchData();
    }
  }, [calendarId, fetchData, workersKey]);

  const getDayInfo = (dateStr: string): CalendarDay | undefined => {
    return calendarDays.find(d => d.date === dateStr);
  };

  const getGroupColor = (groupId: string | null): string => {
    if (!groupId) return "#3b82f6";
    return workGroups.find(g => g.id === groupId)?.color || "#3b82f6";
  };

  const getCustomTypeColor = (typeId: string | null): string => {
    if (!typeId) return "#dc2626";
    return customDayTypes.find(t => t.id === typeId)?.color || "#dc2626";
  };

  // Check which workers have vacation on this day
  const getWorkersWithVacation = (dateStr: string): PersonalCalendarWorker[] => {
    const dayWorkerIds = personalDays
      .filter(pd => pd.date === dateStr)
      .map(pd => pd.personal_calendar_worker_id);
    return workers.filter(w => dayWorkerIds.includes(w.id));
  };

  // Toggle vacation for selected worker on a date
  const handleDayClick = async (dateStr: string) => {
    if (!selectedWorkerId) {
      toast.info("Selecciona un trabajador para marcar sus vacaciones");
      return;
    }

    setSaving(true);
    const sessionToken = localStorage.getItem("manager_session_token");

    const existing = personalDays.find(
      pd => pd.personal_calendar_worker_id === selectedWorkerId && pd.date === dateStr
    );

    try {
      if (existing) {
        // Remove vacation
        const { data } = await supabase.functions.invoke("admin-operations", {
          body: {
            action: "removePersonalCalendarDay",
            sessionToken,
            data: { dayId: existing.id }
          }
        });

        if (data?.success) {
          setPersonalDays(prev => prev.filter(pd => pd.id !== existing.id));
        }
      } else {
        // Add vacation
        const { data } = await supabase.functions.invoke("admin-operations", {
          body: {
            action: "addPersonalCalendarDay",
            sessionToken,
            data: {
              calendarId,
              workerId: selectedWorkerId,
              date: dateStr
            }
          }
        });

        if (data?.success && data.day) {
          setPersonalDays(prev => [...prev, data.day]);
        }
      }
    } catch (error) {
      toast.error("Error al actualizar");
    }
    setSaving(false);
  };

  const renderMonth = (monthIndex: number) => {
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = endOfMonth(firstDay);
    const days = eachDayOfInterval({ start: firstDay, end: lastDay });
    const startDayOfWeek = getDay(firstDay);
    const adjustedStart = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const emptyDays = Array.from({ length: adjustedStart }, (_, i) => (
      <div key={`empty-${i}`} className="aspect-square" />
    ));

    const selectedWorker = workers.find(w => w.id === selectedWorkerId);

    return (
      <div key={monthIndex} className="bg-card border rounded-xl overflow-hidden">
        <div className="bg-muted/50 text-primary text-center py-2 font-medium text-xs">
          {MONTH_NAMES[monthIndex]}
        </div>
        <div className="p-2">
          <div className="grid grid-cols-7 gap-0.5 text-[10px] text-muted-foreground mb-1">
            {["L", "M", "X", "J", "V", "S", "D"].map(d => (
              <div key={d} className="text-center font-medium py-0.5">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {emptyDays}
            {days.map(day => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayInfo = getDayInfo(dateStr);
              const dayOfWeek = getDay(day);
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const workersWithVacation = getWorkersWithVacation(dateStr);
              const hasPersonalVacation = workersWithVacation.length > 0;
              
              // Check if this day is vacation for the selected worker
              const isSelectedWorkerVacation = selectedWorkerId && workersWithVacation.some(w => w.id === selectedWorkerId);

              let bgColor = "";
              let textColor = "text-foreground";
              let style: React.CSSProperties = {};

              // Priority: Festivo > Personal vacation > Weekend
              if (dayInfo?.day_type === 'festivo') {
                style.backgroundColor = dayInfo.custom_day_type_id 
                  ? getCustomTypeColor(dayInfo.custom_day_type_id)
                  : "#dc2626";
                textColor = "text-white";
              } else if (dayInfo?.day_type === 'vacaciones_generales') {
                style.backgroundColor = "#93d600";
                textColor = "text-black";
              } else if (hasPersonalVacation) {
                // Show personal vacations with worker colors
                if (workersWithVacation.length === 1) {
                  style.backgroundColor = workersWithVacation[0].color;
                  textColor = "text-white";
                } else if (workersWithVacation.length === 2) {
                  style.background = `linear-gradient(90deg, ${workersWithVacation[0].color} 50%, ${workersWithVacation[1].color} 50%)`;
                  textColor = "text-white";
                } else {
                  // Multiple workers - show gradient of first 2 + indicator
                  style.background = `linear-gradient(90deg, ${workersWithVacation[0].color} 50%, ${workersWithVacation[1].color} 50%)`;
                  textColor = "text-white";
                }
              } else if (isWeekend) {
                bgColor = "bg-muted/30";
                textColor = "text-muted-foreground";
              }

              const isClickable = selectedWorkerId && !dayInfo?.day_type?.startsWith('festivo') && dayInfo?.day_type !== 'vacaciones_generales';

              return (
                <TooltipProvider key={dateStr}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => isClickable && handleDayClick(dateStr)}
                        disabled={saving || !isClickable}
                        className={`
                          aspect-square flex items-center justify-center rounded-full text-[9px] font-medium
                          transition-all duration-100 relative
                          ${bgColor} ${textColor}
                          ${isClickable ? 'hover:ring-2 hover:ring-primary/50 cursor-pointer' : 'cursor-default'}
                          ${isSelectedWorkerVacation ? 'ring-2 ring-offset-1 ring-white' : ''}
                        `}
                        style={style}
                      >
                        {format(day, 'd')}
                        {workersWithVacation.length > 2 && (
                          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary text-[6px] text-primary-foreground flex items-center justify-center font-bold">
                            {workersWithVacation.length}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    {(dayInfo || hasPersonalVacation) && (
                      <TooltipContent>
                        {dayInfo?.day_type === 'festivo' && (
                          <p className="font-medium text-red-500">{dayInfo.legend || "Festivo"}</p>
                        )}
                        {dayInfo?.day_type === 'vacaciones_generales' && (
                          <p className="font-medium text-primary">Vacaciones Generales</p>
                        )}
                        {hasPersonalVacation && (
                          <div className="space-y-0.5">
                            <p className="font-medium text-xs">Vacaciones:</p>
                            {workersWithVacation.map(w => (
                              <div key={w.id} className="flex items-center gap-1.5 text-xs">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: w.color }} />
                                {w.worker_name}
                              </div>
                            ))}
                          </div>
                        )}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Count vacation days per worker
  const getWorkerVacationCount = (workerId: string) => {
    return personalDays.filter(pd => pd.personal_calendar_worker_id === workerId).length;
  };

  return (
    <div className="space-y-4">
      {/* Worker selector / legend */}
      <div className="flex flex-wrap gap-2 items-center py-1">
        <span className="text-xs text-muted-foreground font-medium mr-1">Trabajadores:</span>
        {workers.map(worker => {
          const vacDays = getWorkerVacationCount(worker.id);
          const isSelected = selectedWorkerId === worker.id;
          return (
            <button
              key={worker.id}
              onClick={() => onSelectWorker(isSelected ? null : worker.id)}
              className={`
                inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all
                ${isSelected 
                  ? 'ring-2 ring-offset-2 ring-primary shadow-sm scale-105' 
                  : 'hover:scale-[1.02] opacity-85 hover:opacity-100'
                }
              `}
              style={{ 
                backgroundColor: worker.color,
                color: '#fff'
              }}
            >
              <span className="truncate max-w-[80px]">{worker.worker_name}</span>
              <span className="bg-white/25 rounded-full px-1.5 min-w-[18px] text-center text-[10px] font-semibold">
                {vacDays}
              </span>
            </button>
          );
        })}
      </div>

      {/* Instruction */}
      {selectedWorkerId && (
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          Haz clic en los días para marcar/desmarcar vacaciones para{" "}
          <strong>{workers.find(w => w.id === selectedWorkerId)?.worker_name}</strong>
        </div>
      )}

      {/* Fixed legend for base calendar elements */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <span>Festivo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-primary" />
          <span>Vac. Generales</span>
        </div>
      </div>

      {/* Calendar grid - 3 cols x 4 rows */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 12 }, (_, i) => renderMonth(i))}
      </div>
    </div>
  );
};
