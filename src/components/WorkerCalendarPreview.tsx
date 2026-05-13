import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

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
  date: string;
  day_type: string;
  legend: string | null;
  group_id: string | null;
  group_id_2: string | null;
  custom_day_type_id: string | null;
};

type PersonalDay = {
  date: string;
  day_type: string;
  half_day: boolean;
};

const MONTH_NAMES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

interface WorkerCalendarPreviewProps {
  workerId: string;
  sessionToken: string;
  onSessionExpired?: () => void;
}

export function WorkerCalendarPreview({ workerId, sessionToken, onSessionExpired }: WorkerCalendarPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [worker, setWorker] = useState<{ name: string; worker_number: string; work_group_id: string | null } | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [customDayTypes, setCustomDayTypes] = useState<CustomDayType[]>([]);
  const [personalDays, setPersonalDays] = useState<PersonalDay[]>([]);

  useEffect(() => {
    if (workerId && sessionToken) {
      fetchData();
    }
  }, [workerId, sessionToken]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('[WorkerCalendarPreview] Fetching via admin-operations for workerId:', workerId);

      const { data, error: fnError } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getWorkerCalendarPreview',
          sessionToken,
          data: { workerId }
        }
      });

      console.log('[WorkerCalendarPreview] Response:', data, fnError);

      if (fnError) {
        throw new Error(fnError.message || 'Error al cargar datos');
      }

      if (!data?.success) {
        const errMsg = data?.error || 'Error desconocido';
        if (errMsg.includes('Invalid session') || errMsg.includes('Session expired')) {
          onSessionExpired?.();
          throw new Error('Sesión expirada');
        }
        throw new Error(errMsg);
      }

      const payload = data.payload;
      if (!payload?.worker) {
        throw new Error('Trabajador no encontrado');
      }

      setWorker(payload.worker);
      setYear(payload.year || new Date().getFullYear());
      setCalendarDays(payload.calendarDays || []);
      setWorkGroups(payload.workGroups || []);
      setCustomDayTypes(payload.customDayTypes || []);
      setPersonalDays(payload.personalDays || []);

    } catch (err: any) {
      console.error('[WorkerCalendarPreview] Error:', err);
      setError(err.message || 'Error al cargar el calendario');
    } finally {
      setLoading(false);
    }
  };

  const getGroupColor = (groupId: string | null): string => {
    if (!groupId) return '#6b7280';
    const group = workGroups.find(g => g.id === groupId);
    return group?.color || '#6b7280';
  };

  const getCustomDayTypeColor = (typeId: string | null): string => {
    if (!typeId) return '#6b7280';
    const dayType = customDayTypes.find(t => t.id === typeId);
    return dayType?.color || '#6b7280';
  };

  const renderMonth = (monthIndex: number) => {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, monthIndex, 1).getDay();
    const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    const days = [];
    for (let i = 0; i < adjustedFirstDay; i++) {
      days.push(<div key={`empty-${i}`} className="w-5 h-5" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const calendarDay = calendarDays.find(d => d.date === dateStr);
      const personalDay = personalDays.find(d => d.date === dateStr);
      const dayOfWeek = new Date(year, monthIndex, day).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      let bgColor = 'transparent';
      let textColor = 'inherit';
      let halfDayIndicator = false;

      // Personal days (libre configuración) - Corporate green
      if (personalDay) {
        bgColor = '#93d600';
        textColor = 'white';
        halfDayIndicator = personalDay.half_day;
      }
      // Calendar day assignments
      else if (calendarDay) {
        if (calendarDay.day_type === 'holiday') {
          bgColor = '#dc2626';
          textColor = 'white';
        } else if (calendarDay.day_type === 'vacation' && calendarDay.group_id) {
          // Check if this worker belongs to this vacation group
          if (worker?.work_group_id === calendarDay.group_id || worker?.work_group_id === calendarDay.group_id_2) {
            bgColor = getGroupColor(calendarDay.group_id);
            textColor = 'white';
          }
        } else if (calendarDay.custom_day_type_id) {
          bgColor = getCustomDayTypeColor(calendarDay.custom_day_type_id);
          textColor = 'white';
        }
      }
      // Weekend styling
      else if (isWeekend) {
        textColor = 'hsl(var(--muted-foreground))';
      }

      days.push(
        <div
          key={day}
          className="w-5 h-5 flex items-center justify-center text-[10px] rounded-sm relative"
          style={{ backgroundColor: bgColor, color: textColor }}
          title={dateStr}
        >
          {day}
          {halfDayIndicator && (
            <span className="absolute -top-0.5 -right-0.5 text-[6px] font-bold">½</span>
          )}
        </div>
      );
    }

    return (
      <div className="mb-3">
        <h4 className="text-xs font-medium mb-1 text-muted-foreground">{MONTH_NAMES[monthIndex]}</h4>
        <div className="grid grid-cols-7 gap-0.5">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
            <div key={i} className="w-5 h-4 text-[8px] text-center text-muted-foreground font-medium">
              {d}
            </div>
          ))}
          {days}
        </div>
      </div>
    );
  };

  const stats = useMemo(() => {
    const groupVacationDays = calendarDays.filter(d =>
      d.day_type === 'vacation' &&
      (d.group_id === worker?.work_group_id || d.group_id_2 === worker?.work_group_id)
    ).length;

    const holidays = calendarDays.filter(d => d.day_type === 'holiday').length;

    const personalLibreDays = personalDays.reduce((acc, d) => acc + (d.half_day ? 0.5 : 1), 0);

    return { groupVacationDays, holidays, personalLibreDays };
  }, [calendarDays, personalDays, worker]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No se encontró el trabajador</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats summary */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="text-xs">
          Vacaciones grupo: {stats.groupVacationDays}
        </Badge>
        <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">
          Festivos: {stats.holidays}
        </Badge>
        <Badge 
          variant="outline" 
          className="text-xs"
          style={{ borderColor: '#93d600', color: '#93d600' }}
        >
          Libre config: {stats.personalLibreDays}
        </Badge>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i}>{renderMonth(i)}</div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs pt-2 border-t">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#dc2626' }}></div>
          <span>Festivo</span>
        </div>
        {workGroups.slice(0, 4).map(group => (
          <div key={group.id} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: group.color }}></div>
            <span>{group.name}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#93d600' }}></div>
          <span>Libre config.</span>
        </div>
      </div>
    </div>
  );
}
