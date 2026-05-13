import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Clock, XCircle, FileText, PenLine, Building2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, eachDayOfInterval, getDay, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Separator } from "@/components/ui/separator";
import { safeFormatBackendDate, extractDateFromDayItem } from "@/lib/dates";

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

type VacationSummary = {
  groupVacationDays: number;
  generalVacationDays: number;
  totalVacationDays: number;
  totalFreeAssignment: number;
  freeAssignmentUsed: number;
  freeAssignmentRemaining: number;
};

// Day item can be a string or an object with a date property
type DayItem = string | { date: string; assignmentType?: string; halfDay?: boolean };

export interface CalendarModification {
  id: string;
  worker_id: string;
  department_id: string;
  year: number;
  modification_type: string;
  status: string;
  admin_name: string;
  admin_reason: string;
  added_personal_days: DayItem[] | null;
  removed_group_days: DayItem[] | null;
  original_group_id: string | null;
  new_group_id: string | null;
  signature: string | null;
  signed_at: string | null;
  signed_ip: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  email_sent_at: string | null;
  created_at: string;
  updated_at: string;
  access_token: string;
  worker?: {
    id: string;
    name: string;
    worker_number: string;
    email: string | null;
  };
  department?: {
    id: string;
    name: string;
  };
  original_group?: {
    id: string;
    name: string;
    color: string;
  };
  new_group?: {
    id: string;
    name: string;
    color: string;
  };
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const DAY_KEYS = ["L", "M", "X", "J", "V", "S", "D"];

interface EmbeddedWorkerCalendarProps {
  workerId: string;
  sessionToken: string;
  onSessionExpired?: () => void;
  modification?: CalendarModification | null;
  onViewSignature?: (modification: CalendarModification) => void;
}

export function EmbeddedWorkerCalendar({ 
  workerId, 
  sessionToken, 
  onSessionExpired,
  modification,
  onViewSignature
}: EmbeddedWorkerCalendarProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [worker, setWorker] = useState<{ name: string; worker_number: string; work_group_id: string | null } | null>(null);
  const [workGroup, setWorkGroup] = useState<WorkGroup | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [customDayTypes, setCustomDayTypes] = useState<CustomDayType[]>([]);
  const [approvedDates, setApprovedDates] = useState<Set<string>>(new Set());
  const [pendingDates, setPendingDates] = useState<Set<string>>(new Set());
  const [otherGroupVacationDays, setOtherGroupVacationDays] = useState<Set<string>>(new Set());
  const [unlockedDates, setUnlockedDates] = useState<Set<string>>(new Set());
  const [libreConfigDates, setLibreConfigDates] = useState<Set<string>>(new Set());
  const [adminAssignedDates, setAdminAssignedDates] = useState<Set<string>>(new Set());
  const [freeAssignmentDates, setFreeAssignmentDates] = useState<Set<string>>(new Set());
  const [suspensionDates, setSuspensionDates] = useState<Set<string>>(new Set());
  const [vacationSummary, setVacationSummary] = useState<VacationSummary | null>(null);

  useEffect(() => {
    if (workerId && sessionToken) {
      fetchData();
    }
  }, [workerId, sessionToken]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fnError } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getWorkerCalendarPreview',
          sessionToken,
          data: { workerId }
        }
      });

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
      setWorkGroup(payload.workGroup || null);
      setYear(payload.year || new Date().getFullYear());
      setCalendarDays(payload.calendarDays || []);
      setWorkGroups(payload.workGroups || []);
      setCustomDayTypes(payload.customDayTypes || []);
      setApprovedDates(new Set(payload.approvedDates || []));
      setPendingDates(new Set(payload.pendingDates || []));
      setOtherGroupVacationDays(new Set(payload.otherGroupVacationDays || []));
      setUnlockedDates(new Set(payload.unlockedDates || []));
      setLibreConfigDates(new Set(payload.libreConfigDates || []));
      setAdminAssignedDates(new Set(payload.adminAssignedDates || []));
      setFreeAssignmentDates(new Set(payload.freeAssignmentDates || []));
      setSuspensionDates(new Set(payload.suspensionDates || []));
      setVacationSummary(payload.vacationSummary || null);
    } catch (err: any) {
      console.error('[EmbeddedWorkerCalendar] Error:', err);
      setError(err.message || 'Error al cargar el calendario');
    } finally {
      setLoading(false);
    }
  };

  // Count real holidays vs non-vacation periods
  const { realHolidayCount, nonVacationalCount } = useMemo(() => {
    let holidays = 0;
    let nonVacational = 0;
    
    calendarDays.forEach(day => {
      if (day.day_type === 'festivo') {
        if (day.custom_day_type_id) {
          const customType = customDayTypes.find(t => t.id === day.custom_day_type_id);
          if (customType?.name?.toLowerCase().includes('no vacacional') || 
              customType?.name?.toLowerCase().includes('periodo no')) {
            nonVacational++;
          } else if (customType?.system_type === 'festivo') {
            holidays++;
          } else {
            holidays++;
          }
        } else {
          holidays++;
        }
      }
    });
    
    return { realHolidayCount: holidays, nonVacationalCount: nonVacational };
  }, [calendarDays, customDayTypes]);

  const getDayInfo = (dateStr: string): CalendarDay | undefined => {
    return calendarDays.find(d => d.date === dateStr);
  };

  const isNonVacationalPeriod = (dayInfo: CalendarDay): boolean => {
    if (dayInfo.day_type !== 'festivo' || !dayInfo.custom_day_type_id) return false;
    const customType = customDayTypes.find(t => t.id === dayInfo.custom_day_type_id);
    return customType?.name?.toLowerCase().includes('no vacacional') || 
           customType?.name?.toLowerCase().includes('periodo no') || false;
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

  const getModificationTypeLabel = (type: string) => {
    switch (type) {
      case "remove_group_days": return "Quitar días";
      case "add_personal_days": return "Añadir días libres";
      case "change_group": return "Cambio de grupo";
      case "mixed": return "Mixto";
      default: return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "signed":
        return <Badge className="bg-primary/20 text-primary border-primary/30 gap-1"><CheckCircle2 className="h-3 w-3" />Firmada</Badge>;
      case "pending_signature":
        return <Badge className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 gap-1"><Clock className="h-3 w-3" />Pendiente</Badge>;
      case "draft":
        return <Badge className="bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30 gap-1"><FileText className="h-3 w-3" />Borrador</Badge>;
      case "rejected":
        return <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30 gap-1"><XCircle className="h-3 w-3" />Rechazada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const renderMonth = (monthIndex: number) => {
    const firstDay = startOfMonth(new Date(year, monthIndex, 1));
    const lastDay = endOfMonth(firstDay);
    const days = eachDayOfInterval({ start: firstDay, end: lastDay });
    const startDayOfWeek = getDay(firstDay);
    const adjustedStartDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    return (
      <div key={monthIndex}>
        <h3 className="text-xs font-medium mb-2 text-center text-muted-foreground uppercase tracking-wide">
          {MONTH_NAMES[monthIndex]}
        </h3>
        <div className="grid grid-cols-7 gap-1">
          {DAY_KEYS.map((dayKey, i) => (
            <div key={i} className="text-center text-muted-foreground/60 text-[10px] h-6 flex items-center justify-center font-medium">
              {dayKey}
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
            const isApproved = approvedDates.has(dateStr);
            const isPending = pendingDates.has(dateStr);
            const isOtherGroupVacation = otherGroupVacationDays.has(dateStr);
            const isUnlocked = unlockedDates.has(dateStr);
            
            const isRelevant = !isUnlocked && isDayRelevantToWorker(dayInfo);
            
            let bgColor = '';
            let textColor = 'text-foreground';
            let title = '';
            let customBgStyle: React.CSSProperties | undefined;
            
            // Check for admin-assigned days (personal overrides)
            const isAdminAssigned = adminAssignedDates.has(dateStr);
            const isLibreConfig = libreConfigDates.has(dateStr);
            const isFreeAssignment = freeAssignmentDates.has(dateStr);
            const isSuspension = suspensionDates.has(dateStr);
            
            if (isSuspension) {
              customBgStyle = { backgroundColor: '#ef4444' }; // red-500
              textColor = 'text-white';
              title = 'Suspensión de empleo y sueldo';
            } else if (isAdminAssigned) {
              customBgStyle = { backgroundColor: '#8b5cf6' }; // violet-500
              textColor = 'text-white';
              title = 'Asignación admin';
            } else if (isLibreConfig || isFreeAssignment) {
              customBgStyle = { backgroundColor: '#93d600' }; // primary
              textColor = 'text-foreground';
              title = 'Libre configuración';
            } else if (isApproved) {
              customBgStyle = { backgroundColor: '#3b82f6' };
              textColor = 'text-white';
              title = 'Vacaciones aprobadas';
            } else if (isPending) {
              bgColor = 'bg-amber-100 dark:bg-amber-900/30';
              textColor = 'text-amber-800 dark:text-amber-200';
              title = 'Pendiente';
            } else if (isOtherGroupVacation) {
              bgColor = 'bg-muted';
              textColor = 'text-muted-foreground';
              title = 'Periodo no vacacional';
            } else if (isRelevant && dayInfo) {
              if (dayInfo.day_type === 'festivo' && isNonVacationalPeriod(dayInfo)) {
                bgColor = 'bg-muted';
                textColor = 'text-muted-foreground';
                title = 'Periodo no vacacional';
              } else if (dayInfo.day_type === 'festivo') {
                customBgStyle = { backgroundColor: '#dc2626' };
                textColor = 'text-white';
                title = dayInfo.legend ? `Festivo: ${dayInfo.legend}` : 'Festivo';
              } else if (dayInfo.day_type === 'vacaciones_generales') {
                customBgStyle = { backgroundColor: '#93d600' };
                textColor = 'text-foreground';
                title = dayInfo.legend ? `Vac. Generales: ${dayInfo.legend}` : 'Vacaciones Generales';
              } else if (dayInfo.day_type === 'vacaciones_grupo' && workGroup) {
                customBgStyle = { backgroundColor: workGroup.color };
                textColor = 'text-white';
                title = dayInfo.legend ? `${workGroup.name}: ${dayInfo.legend}` : workGroup.name;
              }
            } else if (isWeekend) {
              textColor = 'text-muted-foreground/40';
            }
            
            return (
              <Tooltip key={dateStr}>
                <TooltipTrigger asChild>
                  <div
                    className={`h-8 w-8 flex items-center justify-center rounded-full text-xs mx-auto cursor-default font-medium ${bgColor} ${textColor}`}
                    style={customBgStyle}
                  >
                    {date.getDate()}
                  </div>
                </TooltipTrigger>
                {title && <TooltipContent side="top" className="text-xs">{title}</TooltipContent>}
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">Trabajador no encontrado</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary badges */}
        <div className="flex flex-wrap gap-2 justify-center">
          {workGroup && (
            <Badge 
              variant="outline" 
              className="text-xs px-2 py-0.5"
              style={{ borderColor: workGroup.color, color: workGroup.color }}
            >
              {workGroup.name}: {vacationSummary?.groupVacationDays || 0}d
            </Badge>
          )}
          <Badge variant="outline" className="text-xs px-2 py-0.5 border-red-500/50 text-red-500">
            Festivos: {realHolidayCount}
          </Badge>
          {(vacationSummary?.freeAssignmentUsed || 0) > 0 && (
            <Badge 
              variant="outline" 
              className="text-xs px-2 py-0.5"
              style={{ borderColor: '#93d600', color: '#93d600' }}
            >
              Libre: {vacationSummary?.freeAssignmentUsed || 0}d
            </Badge>
          )}
          {approvedDates.size > 0 && (
            <Badge variant="outline" className="text-xs px-2 py-0.5 border-blue-500/50 text-blue-500">
              Aprobados: {approvedDates.size}d
            </Badge>
          )}
          {adminAssignedDates.size > 0 && (
            <Badge variant="outline" className="text-xs px-2 py-0.5 border-violet-500/50 text-violet-500">
              Admin: {adminAssignedDates.size}d
            </Badge>
          )}
          {suspensionDates.size > 0 && (
            <Badge variant="outline" className="text-xs px-2 py-0.5 border-red-500/50 text-red-500">
              Suspensión: {suspensionDates.size}d
            </Badge>
          )}
        </div>

        {/* Calendar grid - 4x3 layout matching worker's calendar */}
        <div className="grid grid-cols-4 gap-6 p-4 bg-muted/30 rounded-xl">
          {Array.from({ length: 12 }).map((_, i) => renderMonth(i))}
        </div>

        {/* Legend - horizontal, matching worker's calendar */}
        <div className="flex flex-wrap gap-3 justify-center text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-muted" />
            <span>Pendiente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#06b6d4' }} />
            <span>Vac. Generales</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#dc2626' }} />
            <span>Festivo</span>
          </div>
          {workGroup && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: workGroup.color }} />
              <span>{workGroup.name}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
            <span>No vacacional</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#8b5cf6' }} />
            <span>Admin</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ef4444' }} />
            <span>Suspensión</span>
          </div>
        </div>

        {/* Modification Details Section */}
        {modification && (
          <>
            <Separator />
            <div className="space-y-4 pt-2">
              {/* Modification header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Modificación
                  </span>
                  <span className="text-sm text-muted-foreground">•</span>
                  <span className="text-sm font-medium">{getModificationTypeLabel(modification.modification_type)}</span>
                  <span className="text-sm text-muted-foreground">•</span>
                  <span className="text-sm text-muted-foreground">{modification.year}</span>
                </div>
                {getStatusBadge(modification.status)}
              </div>

              {/* Days affected */}
              <div className="space-y-3">
                {/* Removed days */}
                {modification.removed_group_days && modification.removed_group_days.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground font-medium">
                      Días eliminados ({modification.removed_group_days.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {modification.removed_group_days.map((day, i) => (
                        <Badge 
                          key={i} 
                          variant="outline" 
                          className="text-xs bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30"
                        >
                          {safeFormatBackendDate(extractDateFromDayItem(day), "d MMM", { locale: es })}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Added days */}
                {modification.added_personal_days && modification.added_personal_days.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground font-medium">
                      Días añadidos ({modification.added_personal_days.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {modification.added_personal_days.map((day, i) => (
                        <Badge 
                          key={i} 
                          variant="outline" 
                          className="text-xs border-primary/30"
                          style={{ backgroundColor: 'rgba(147, 214, 0, 0.1)', color: '#93d600' }}
                        >
                          {safeFormatBackendDate(extractDateFromDayItem(day), "d MMM", { locale: es })}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Group change */}
                {modification.modification_type === "change_group" && (
                  <div>
                    <span className="text-xs text-muted-foreground font-medium">Cambio de grupo</span>
                    <div className="flex items-center gap-2 mt-1.5">
                      {modification.original_group && (
                        <Badge 
                          variant="outline" 
                          className="text-xs"
                          style={{ 
                            backgroundColor: `${modification.original_group.color}20`, 
                            borderColor: modification.original_group.color,
                            color: modification.original_group.color
                          }}
                        >
                          {modification.original_group.name}
                        </Badge>
                      )}
                      <span className="text-muted-foreground text-sm">→</span>
                      {modification.new_group && (
                        <Badge 
                          variant="outline" 
                          className="text-xs"
                          style={{ 
                            backgroundColor: `${modification.new_group.color}20`, 
                            borderColor: modification.new_group.color,
                            color: modification.new_group.color
                          }}
                        >
                          {modification.new_group.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Reason */}
              <div className="bg-muted/50 rounded-lg p-3">
                <span className="text-xs text-muted-foreground font-medium block mb-1">Motivo</span>
                <p className="text-sm">{modification.admin_reason}</p>
              </div>

              {/* Meta info */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Creado por <span className="font-medium text-foreground">{modification.admin_name}</span>
                </span>
                <span>
                  {safeFormatBackendDate(modification.created_at, "d MMM yyyy, HH:mm", { locale: es })}
                </span>
                {modification.department && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {modification.department.name}
                  </span>
                )}
              </div>

              {/* Signature info */}
              {modification.status === "signed" && modification.signed_at && (
                <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-border/50">
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-primary font-medium">
                      Firmado el {safeFormatBackendDate(modification.signed_at, "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}
                    </span>
                    {modification.signed_ip && (
                      <span className="text-muted-foreground">• IP: {modification.signed_ip}</span>
                    )}
                  </div>
                  {modification.signature && onViewSignature && (
                    <button
                      onClick={() => onViewSignature(modification)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <PenLine className="h-3 w-3" />
                      Ver firma
                    </button>
                  )}
                </div>
              )}

              {/* Rejection info */}
              {modification.status === "rejected" && modification.rejected_at && (
                <div className="pt-2 border-t border-border/50 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-red-500">
                    <XCircle className="h-4 w-4" />
                    <span className="font-medium">
                      Rechazada el {safeFormatBackendDate(modification.rejected_at, "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}
                    </span>
                  </div>
                  {modification.rejection_reason && (
                    <p className="text-xs text-muted-foreground pl-6">
                      Motivo: {modification.rejection_reason}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
