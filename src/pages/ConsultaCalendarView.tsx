import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Info } from "lucide-react";
import { format, eachDayOfInterval, getMonth, getDay, startOfMonth, endOfMonth } from "date-fns";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import LoadingScreen from "@/components/LoadingScreen";

type Department = {
  id: string;
  name: string;
};

type WorkGroup = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
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
  day_type: string;
  group_id: string | null;
  group_id_2: string | null;
  custom_day_type_id: string | null;
  legend: string | null;
};

type AnnualCalendar = {
  id: string;
  year: number;
  description: string | null;
  info_text: string | null;
  is_reviewed: boolean;
};

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const DAY_HEADERS = ["L", "M", "X", "J", "V", "S", "D"];

const ConsultaCalendarView = () => {
  const navigate = useNavigate();
  const { departmentId, year: yearParam } = useParams();
  const [searchParams] = useSearchParams();
  const previewManagerId = searchParams.get("preview");
  
  const { manager, isAdmin, isAuthenticated, isLoading: authLoading } = useManagerAuth();
  
  const [department, setDepartment] = useState<Department | null>(null);
  const [calendar, setCalendar] = useState<AnnualCalendar | null>(null);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [customDayTypes, setCustomDayTypes] = useState<CustomDayType[]>([]);
  const [loading, setLoading] = useState(true);

  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
  const isPreviewMode = !!previewManagerId && isAdmin;

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        navigate("/login");
        return;
      }
      // Allow access if consulta role OR admin in preview mode
      if (!isPreviewMode && manager?.role !== "consulta") {
        if (manager?.role === "admin") {
          navigate("/admin");
        } else {
          navigate("/manager");
        }
        return;
      }
      if (departmentId) {
        fetchCalendarData();
      }
    }
  }, [isAuthenticated, authLoading, manager, departmentId, year, navigate, isPreviewMode]);

  const fetchCalendarData = async () => {
    if (!departmentId) return;
    
    setLoading(true);
    try {
      // Fetch department via public RPC (bypasses RLS)
      const { data: depts, error: deptError } = await supabase.rpc("get_public_departments");

      const dept = (depts || []).find((d: any) => d.id === departmentId);

      if (deptError || !dept) {
        toast.error("Departamento no encontrado");
        navigate(isPreviewMode ? `/consulta?preview=${previewManagerId}` : "/consulta");
        return;
      }

      setDepartment({ id: dept.id, name: dept.name });

      // Get manager session token for authenticated access
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) {
        toast.error("Sesión no válida");
        navigate("/login");
        return;
      }

      // Fetch all calendar data via edge function (secure)
      const { data: calendarResponse, error: calError } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'getPublicCalendarData',
          sessionToken,
          departmentId,
          year,
        }
      });

      if (calError || !calendarResponse?.success || !calendarResponse?.calendar) {
        toast.error("Calendario no encontrado para este año");
        navigate(isPreviewMode ? `/consulta?preview=${previewManagerId}` : "/consulta");
        return;
      }

      setCalendar({
        id: calendarResponse.calendar.id,
        year: calendarResponse.calendar.year,
        description: calendarResponse.calendar.description,
        info_text: calendarResponse.calendar.info_text,
        is_reviewed: calendarResponse.calendar.is_reviewed,
      });
      setCalendarDays(calendarResponse.days || []);
      setWorkGroups(calendarResponse.groups || []);
      setCustomDayTypes(calendarResponse.customDayTypes || []);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al cargar el calendario");
    }
    setLoading(false);
  };

  const getDayData = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return calendarDays.find(d => d.date === dateStr);
  };

  const getDayStyle = (date: Date) => {
    const dayOfWeek = getDay(date);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayData = getDayData(date);

    if (!dayData) {
      return {
        backgroundColor: isWeekend ? 'hsl(var(--muted))' : 'transparent',
        color: isWeekend ? 'hsl(var(--muted-foreground))' : 'inherit',
      };
    }

    // Custom day type (festivo, vacaciones generales, etc.)
    if (dayData.custom_day_type_id) {
      const customType = customDayTypes.find(t => t.id === dayData.custom_day_type_id);
      if (customType) {
        return {
          backgroundColor: customType.color,
          color: '#fff',
        };
      }
    }

    // Group vacation
    if (dayData.day_type === 'group_vacation' && dayData.group_id) {
      const group = workGroups.find(g => g.id === dayData.group_id);
      if (group) {
        // Check if there's a second group
        if (dayData.group_id_2) {
          const group2 = workGroups.find(g => g.id === dayData.group_id_2);
          if (group2) {
            return {
              background: `linear-gradient(135deg, ${group.color} 50%, ${group2.color} 50%)`,
              color: '#fff',
            };
          }
        }
        return {
          backgroundColor: group.color,
          color: '#fff',
        };
      }
    }

    return {
      backgroundColor: isWeekend ? 'hsl(var(--muted))' : 'transparent',
      color: isWeekend ? 'hsl(var(--muted-foreground))' : 'inherit',
    };
  };

  const renderMonth = (monthIndex: number) => {
    const monthStart = startOfMonth(new Date(year, monthIndex, 1));
    const monthEnd = endOfMonth(monthStart);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    // Get the day of week for the first day (0 = Sunday, adjust for Monday start)
    let firstDayOfWeek = getDay(monthStart);
    firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    
    // Create empty cells for days before the first day of month
    const emptyCells = Array(firstDayOfWeek).fill(null);

    return (
      <div key={monthIndex} className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="bg-primary/5 px-3 py-2 border-b border-border">
          <h3 className="font-semibold text-sm text-center">{MONTHS_ES[monthIndex]}</h3>
        </div>
        <div className="p-2">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DAY_HEADERS.map((day, i) => (
              <div 
                key={i} 
                className={`text-center text-[10px] font-medium py-0.5 ${
                  i >= 5 ? 'text-muted-foreground' : 'text-foreground'
                }`}
              >
                {day}
              </div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {emptyCells.map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {days.map((day) => {
              const dayData = getDayData(day);
              const style = getDayStyle(day);
              
              return (
                <div
                  key={day.toISOString()}
                  className="aspect-square flex items-center justify-center text-[10px] sm:text-xs rounded-sm relative"
                  style={style}
                  title={dayData?.legend || undefined}
                >
                  {format(day, "d")}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const handleBack = () => {
    if (isPreviewMode) {
      navigate(`/consulta?preview=${previewManagerId}`);
    } else {
      navigate("/consulta");
    }
  };

  if (authLoading || loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-header">
        <div className="container mx-auto px-3 sm:px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <LogoLink to="/consulta" />
              <div>
                <h1 className="text-sm sm:text-lg md:text-xl font-semibold text-foreground tracking-tight">
                  {department?.name || 'Calendario'}
                </h1>
                <p className="text-[10px] sm:text-xs md:text-sm text-muted-foreground font-light tracking-tight">
                  Calendario anual {year}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
              <ThemeToggle />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleBack}
                className="rounded-xl h-8 sm:h-9 px-2 sm:px-3"
              >
                <ArrowLeft className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Volver</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Info text */}
        {calendar?.info_text && (
          <Card className="mb-4 bg-primary/5 border-primary/20">
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {calendar.info_text}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Legend */}
        <Card className="mb-4">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap gap-3 items-center">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Leyenda:</span>
              {customDayTypes.map(type => (
                <div key={type.id} className="flex items-center gap-1.5">
                  <div 
                    className="w-3 h-3 rounded-sm" 
                    style={{ backgroundColor: type.color }}
                  />
                  <span className="text-xs">{type.name}</span>
                </div>
              ))}
              {workGroups.map(group => (
                <div key={group.id} className="flex items-center gap-1.5">
                  <div 
                    className="w-3 h-3 rounded-sm" 
                    style={{ backgroundColor: group.color }}
                  />
                  <span className="text-xs">Grupo {group.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Calendar Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 12 }, (_, i) => renderMonth(i))}
        </div>

        {/* Status badge */}
        {calendar && (
          <div className="mt-4 flex justify-center">
            <Badge variant={calendar.is_reviewed ? "default" : "secondary"}>
              {calendar.is_reviewed ? "Calendario revisado" : "Pendiente de revisión"}
            </Badge>
          </div>
        )}
      </main>
    </div>
  );
};

export default ConsultaCalendarView;
