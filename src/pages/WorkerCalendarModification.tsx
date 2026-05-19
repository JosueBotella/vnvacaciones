import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { 
  ArrowLeft, Send, Save, Loader2, AlertCircle, Clock, FileSignature, Mail, Check, 
  Trash2, Plus, Minus, Info, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Search, Edit2, RefreshCw
} from "lucide-react";
import { useManagerAuth } from "@/modules/auth/hooks/useManagerAuth";
import LoadingScreen from "@/components/LoadingScreen";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { safeFormatBackendDate } from "@/lib/dates";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { LogoLink } from "@/components/LogoLink";

type Worker = {
  id: string;
  name: string;
  worker_number: string;
  email: string | null;
  department_id: string;
  work_group_id: string | null;
};

type Department = {
  id: string;
  name: string;
};

type WorkGroup = {
  id: string;
  name: string;
  color: string;
  department_id: string;
  max_free_days?: number | null;
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
  group_id: string | null;
  group_id_2: string | null;
  legend: string | null;
  custom_day_type_id: string | null;
};

type Modification = {
  id: string;
  worker_id: string;
  modification_type: string;
  removed_group_days: string[];
  added_personal_days: { date: string; half_day: boolean }[];
  original_group_id: string | null;
  new_group_id: string | null;
  admin_reason: string;
  admin_name: string;
  status: string;
  signature: string | null;
  signed_at: string | null;
  email_sent_at: string | null;
  created_at: string;
  year: number;
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const DAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const WorkerCalendarModification = () => {
  const navigate = useNavigate();
  const { workerId } = useParams<{ workerId: string }>();
  const [searchParams] = useSearchParams();
  const modificationId = searchParams.get("modificationId");
  const isEmbedded = searchParams.get("embedded") === "true";
  const returnTo = searchParams.get("returnTo") || "/admin";
  const returnTab = searchParams.get("returnTab") || "modifications";
  const { isAdmin, isAuthenticated, getSessionToken, manager, isLoading: authLoading } = useManagerAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [inlineEmail, setInlineEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [worker, setWorker] = useState<Worker | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [customDayTypes, setCustomDayTypes] = useState<CustomDayType[]>([]);
  const [existingModifications, setExistingModifications] = useState<Modification[]>([]);
  const [existingPersonalDays, setExistingPersonalDays] = useState<{ date: string; day_type: string }[]>([]);
  
  // Drafts for this worker (to show in a selector)
  const [workerDrafts, setWorkerDrafts] = useState<Modification[]>([]);
  
  // Worker's approved and pending vacation days (from vacation_requests)
  const [approvedDays, setApprovedDays] = useState<Set<string>>(new Set());
  const [pendingDays, setPendingDays] = useState<Set<string>>(new Set());

  // Form state
  const [year, setYear] = useState(new Date().getFullYear());
  const [removedDays, setRemovedDays] = useState<{ date: string; originalType: string }[]>([]);
  const [addedPersonalDays, setAddedPersonalDays] = useState<{ date: string; halfDay: boolean; assignmentType: 'libre_configuracion' | 'admin_assigned' }[]>([]);
  const [newGroupId, setNewGroupId] = useState<string>("");
  const [adminReason, setAdminReason] = useState("");

  // Edit mode
  const [editingModification, setEditingModification] = useState<Modification | null>(null);
  const [showConfirmSendEmail, setShowConfirmSendEmail] = useState(false);

  // Mode selection for calendar interaction
  const [editMode, setEditMode] = useState<'remove' | 'add_libre' | 'add_admin'>('remove');
  
  // Computed: removed group days for backward compatibility (only group vacation days)
  const removedGroupDays = useMemo(() => 
    removedDays.filter(d => d.originalType === 'vacaciones_grupo' || d.originalType === 'vacaciones').map(d => d.date),
    [removedDays]
  );

  // Mobile month navigation
  const [mobileMonth, setMobileMonth] = useState(new Date().getMonth());
  
  // Mobile day info sheet
  const [selectedDayInfo, setSelectedDayInfo] = useState<{
    date: Date;
    dateStr: string;
  } | null>(null);
  
  // Worker search
  const [workerSearchQuery, setWorkerSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{id: string; name: string; worker_number: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Editable available days
  const [availableDays, setAvailableDays] = useState<number | null>(null);
  const [isEditingDays, setIsEditingDays] = useState(false);
  const [editingDaysValue, setEditingDaysValue] = useState<string>("");
  
  // General vacation days count for display
  const [generalVacationDays, setGeneralVacationDays] = useState<number>(0);
  
  // Days when OTHER groups are on vacation (to mark as "Periodo No Vacacional")
  const [otherGroupVacationDays, setOtherGroupVacationDays] = useState<Set<string>>(new Set());
  
  // Days already unlocked by signed modifications (CRITICAL: must exclude from group vacations)
  const [unlockedDates, setUnlockedDates] = useState<Set<string>>(new Set());
  
  // Days already assigned by admin (from signed modifications)
  const [effectiveAdminAssignedDates, setEffectiveAdminAssignedDates] = useState<Set<string>>(new Set());
  
  // Days already assigned as free_assignment (from approved libre configuración requests)
  const [effectiveFreeAssignmentDates, setEffectiveFreeAssignmentDates] = useState<Set<string>>(new Set());

  // Worker's group vacation days (EXCLUDES unlocked dates)
  const workerGroupDays = useMemo(() => {
    if (!worker?.work_group_id || !calendarDays.length) return new Set<string>();
    
    const days = calendarDays.filter(day => {
      // Skip if this day has been unlocked by a signed modification
      if (unlockedDates.has(day.date)) return false;
      
      const isGroupVacation = (day.day_type === 'vacaciones_grupo' || day.day_type === 'vacaciones') && 
        (day.group_id === worker.work_group_id || day.group_id_2 === worker.work_group_id);
      return isGroupVacation;
    }).map(day => day.date);
    
    return new Set(days);
  }, [worker, calendarDays, unlockedDates]);

  // Pending modifications that haven't been signed yet (show with opacity)
  const pendingModificationDays = useMemo(() => {
    const removed = new Set<string>();
    const added = new Set<string>();
    
    existingModifications.forEach(mod => {
      if (mod.status === 'pending_signature' || mod.status === 'pending') {
        (mod.removed_group_days || []).forEach(d => removed.add(d));
        (mod.added_personal_days || []).forEach(d => added.add(d.date));
      }
    });
    
    return { removed, added };
  }, [existingModifications]);

  useEffect(() => {
    // Wait for auth to finish loading before checking
    if (authLoading) {
      return;
    }
    
    if (!isAuthenticated) {
      // Redirect to admin login with return path
      const currentPath = `/admin/worker-calendar/${workerId}${window.location.search}`;
      navigate(`/admin/login?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }
    if (!isAdmin) {
      toast.error("Acceso denegado");
      navigate("/admin");
      return;
    }
    if (workerId) {
      fetchData();
    }
  }, [authLoading, isAuthenticated, isAdmin, workerId]);

  const fetchData = async () => {
    setLoading(true);
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      const currentPath = `/admin/worker-calendar/${workerId}${window.location.search}`;
      navigate(`/admin/login?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getWorkerCalendarModificationData',
          sessionToken,
          data: { workerId, year, modificationId }
        }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || 'Error al cargar datos');
      }

      const workerData = data.worker;
      setWorker(workerData);
      setInlineEmail(workerData?.email || "");
      setDepartment(workerData?.departments || { id: workerData?.department_id, name: 'Departamento' });
      setWorkGroups(data.workGroups || []);
      setCalendarDays(data.calendarDays || []);
      setCustomDayTypes(data.customDayTypes || []);
      setExistingModifications(data.existingModifications || []);
      setExistingPersonalDays(data.personalDays || []);
      
      // Filter drafts and pending signature modifications for this worker (for the selector)
      const drafts = (data.existingModifications || []).filter(
        (m: Modification) => m.status === 'draft' || m.status === 'pending_signature'
      );
      setWorkerDrafts(drafts);
      
      // Extract date strings from the approved/pending date objects
      const approvedDateStrings = (data.approvedDates || []).map((d: { date: string }) => d.date);
      const pendingDateStrings = (data.pendingDates || []).map((d: { date: string }) => d.date);
      setApprovedDays(new Set(approvedDateStrings));
      setPendingDays(new Set(pendingDateStrings));
      
      // Set available days (exact same as worker sees in the form)
      setAvailableDays(data.availableDays ?? 0);
      
      // Set general vacation days count for display
      setGeneralVacationDays(data.generalVacationDays ?? 0);
      
      // Set other group vacation days (to mark as "Periodo No Vacacional")
      setOtherGroupVacationDays(new Set(data.otherGroupVacationDays || []));
      
      // CRITICAL: Set unlocked dates (days already removed by signed modifications)
      setUnlockedDates(new Set(data.unlockedDates || []));
      
      // Set effective admin-assigned dates from worker_personal_calendar_days
      const adminDates = (data.personalDays || [])
        .filter((d: { day_type: string }) => d.day_type === 'admin_assigned')
        .map((d: { date: string }) => d.date);
      setEffectiveAdminAssignedDates(new Set(adminDates));
      
      // Set effective free_assignment dates (approved libre configuración)
      const freeAssignmentDates = (data.personalDays || [])
        .filter((d: { day_type: string }) => d.day_type === 'free_assignment')
        .map((d: { date: string }) => d.date);
      setEffectiveFreeAssignmentDates(new Set(freeAssignmentDates));

      // If editing existing modification (from API or selected from existing list)
      const selectedModification = modificationId
        ? (data.modification || (data.existingModifications || []).find((m: Modification) => m.id === modificationId))
        : null;

      if (selectedModification) {
        const mod = selectedModification as Modification;
        setEditingModification(mod);

        const normalizedRemovedDays = (mod.removed_group_days || [])
          .map((entry: any) => {
            if (typeof entry === "string") {
              return { date: entry, originalType: "vacaciones_grupo" };
            }
            if (entry?.date) {
              return {
                date: entry.date,
                originalType: entry.originalType || "vacaciones_grupo",
              };
            }
            return null;
          })
          .filter(Boolean) as { date: string; originalType: string }[];

        const normalizedAddedDays = (mod.added_personal_days || [])
          .map((entry: any) => {
            const date = typeof entry === "string" ? entry : entry?.date;
            if (!date) return null;

            const sourceType =
              entry?.assignmentType ||
              entry?.assignment_type ||
              entry?.day_type;

            const assignmentType =
              sourceType === "libre_configuracion" || sourceType === "free_assignment"
                ? ("libre_configuracion" as const)
                : ("admin_assigned" as const);

            return {
              date,
              halfDay: Boolean(entry?.half_day ?? entry?.halfDay),
              assignmentType,
            };
          })
          .filter(Boolean) as { date: string; halfDay: boolean; assignmentType: "libre_configuracion" | "admin_assigned" }[];

        setRemovedDays(normalizedRemovedDays);
        setAddedPersonalDays(normalizedAddedDays);
        setNewGroupId(mod.new_group_id || "");
        setAdminReason(mod.admin_reason || "");
        setYear(mod.year || new Date().getFullYear());
      } else if (modificationId) {
        // Invalid / stale modificationId in URL => reset to new modification state
        setEditingModification(null);
        setRemovedDays([]);
        setAddedPersonalDays([]);
        setNewGroupId("");
        setAdminReason("");
      }
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || 'Error al cargar datos');
      navigate(`${returnTo}?tab=${returnTab}`);
    } finally {
      setLoading(false);
      setLastFetchedAt(new Date());
    }
  };

  const handleSave = async (sendEmail = false) => {
    if (!worker || !adminReason.trim()) {
      toast.error("Debes indicar el motivo de la modificación");
      return;
    }

    if (removedDays.length === 0 && addedPersonalDays.length === 0 && !newGroupId) {
      toast.error("Debes realizar al menos un cambio");
      return;
    }

    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const modificationType = 
        newGroupId ? 'change_group' :
        (removedDays.length > 0 && addedPersonalDays.length > 0) ? 'mixed' :
        removedDays.length > 0 ? 'remove_group_days' : 'add_personal_days';

      const { data, error } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'saveWorkerCalendarModification',
          sessionToken,
          data: {
            modificationId: editingModification?.id,
            workerId: worker.id,
            year,
            modificationType,
            removedDays: removedDays.map(rd => ({ date: rd.date, originalType: rd.originalType })),
            removedGroupDays, // Keep for backward compatibility
            addedPersonalDays: addedPersonalDays.map(d => ({ 
              date: d.date, 
              halfDay: d.halfDay,
              assignmentType: d.assignmentType
            })),
            originalGroupId: worker.work_group_id,
            newGroupId: newGroupId || null,
            adminReason: adminReason.trim(),
            sendEmail
          }
        }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || 'Error al guardar');
      }

      // Check if there was an email warning (email failed but modification was saved)
      if (data?.warning) {
        toast.warning(data.warning, { duration: 8000 });
      } else {
        toast.success(sendEmail ? 'Modificación guardada y email enviado' : 'Modificación guardada como borrador');
      }
      
      navigate(`${returnTo}?tab=${returnTab}`);
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Search workers by name or number
  const handleSearchWorkers = async (query: string) => {
    setWorkerSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    const sessionToken = getSessionToken();
    
    try {
      const { data, error } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'searchWorkers',
          sessionToken,
          data: { query }
        }
      });
      
      if (!error && data?.workers) {
        setSearchResults(data.workers.filter((w: any) => w.id !== workerId));
      }
    } catch (err) {
      console.error('Error searching workers:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveAvailableDays = async () => {
    if (!worker) return;
    
    const newValue = parseInt(editingDaysValue, 10);
    if (isNaN(newValue) || newValue < 0) {
      toast.error("Valor inválido");
      return;
    }
    
    const sessionToken = getSessionToken();
    
    try {
      const { data, error } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'updateWorkerVacationAdjustment',
          sessionToken,
          data: { 
            workerId: worker.id,
            adjustment: newValue - (availableDays || 0)
          }
        }
      });
      
      if (error || !data?.success) {
        throw new Error(data?.error || 'Error al actualizar');
      }
      
      setAvailableDays(newValue);
      setIsEditingDays(false);
      toast.success("Días disponibles actualizados");
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    }
  };

  const handleResendPendingSignatureEmail = async () => {
    if (!editingModification) return;

    setSendingEmail(true);
    const sessionToken = getSessionToken();

    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "resendCalendarModificationEmail",
          sessionToken,
          data: { modificationId: editingModification.id },
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Error al reenviar correo");
      }

      toast.success("Correo reenviado correctamente");
      fetchData();
    } catch (err: any) {
      toast.error("Error al reenviar correo: " + (err.message || "Error desconocido"));
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSendEmailOnly = async () => {
    if (!editingModification) return;
    
    setSendingEmail(true);
    const sessionToken = getSessionToken();

    try {
      const { data, error } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'sendCalendarModificationEmail',
          sessionToken,
          data: { modificationId: editingModification.id }
        }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || 'Error al enviar email');
      }

      toast.success('Email enviado correctamente');
      setShowConfirmSendEmail(false);
      fetchData();
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || 'Error al enviar email');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleApplyDirectly = async () => {
    if (!worker || !adminReason.trim()) {
      toast.error("Debes indicar el motivo de la modificación");
      return;
    }

    if (removedDays.length === 0 && addedPersonalDays.length === 0 && !newGroupId) {
      toast.error("Debes realizar al menos un cambio");
      return;
    }

    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const modificationType = 
        newGroupId ? 'change_group' :
        (removedDays.length > 0 && addedPersonalDays.length > 0) ? 'mixed' :
        removedDays.length > 0 ? 'remove_group_days' : 'add_personal_days';

      const { data, error } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'applyCalendarModificationDirectly',
          sessionToken,
          data: {
            modificationId: editingModification?.id,
            workerId: worker.id,
            year,
            modificationType,
            removedDays: removedDays.map(rd => ({ date: rd.date, originalType: rd.originalType })),
            removedGroupDays,
            addedPersonalDays: addedPersonalDays.map(d => ({ 
              date: d.date, 
              halfDay: d.halfDay,
              assignmentType: d.assignmentType
            })),
            originalGroupId: worker.work_group_id,
            newGroupId: newGroupId || null,
            adminReason: adminReason.trim(),
          }
        }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || 'Error al aplicar');
      }

      toast.success('Modificación aplicada directamente');
      navigate(`${returnTo}?tab=${returnTab}`);
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || 'Error al aplicar');
    } finally {
      setSaving(false);
    }
  };

  const handleDayClick = (dateStr: string) => {
    const dayInfo = calendarDays.find(d => d.date === dateStr);
    const d = parseISO(dateStr);
    const dow = getDay(d);
    const isWeekendDay = dow === 0 || dow === 6;

    // Don't allow clicking on weekends
    if (isWeekendDay) return;

    if (editMode === 'remove') {
      // Allow removing any day that has something on it (except weekends)
      const hasContent = dayInfo || workerGroupDays.has(dateStr) || approvedDays.has(dateStr);
      if (!hasContent) return;
      
      const existingRemoved = removedDays.find(rd => rd.date === dateStr);
      if (existingRemoved) {
        setRemovedDays(prev => prev.filter(rd => rd.date !== dateStr));
      } else {
        const originalType = dayInfo?.day_type || (workerGroupDays.has(dateStr) ? 'vacaciones_grupo' : 'otro');
        setRemovedDays(prev => [...prev, { date: dateStr, originalType }]);
      }
    } else {
      // Add mode (libre_configuracion or admin_assigned)
      const assignmentType = editMode === 'add_libre' ? 'libre_configuracion' : 'admin_assigned';
      
      const existing = addedPersonalDays.find(dp => dp.date === dateStr);
      if (existing) {
        // If clicking again and it's libre_configuracion, toggle half day
        if (assignmentType === 'libre_configuracion' && existing.assignmentType === 'libre_configuracion') {
          if (!existing.halfDay) {
            // First click was full day, second click makes it half day
            setAddedPersonalDays(prev => prev.map(dp => 
              dp.date === dateStr ? { ...dp, halfDay: true } : dp
            ));
          } else {
            // Third click removes it
            setAddedPersonalDays(prev => prev.filter(dp => dp.date !== dateStr));
          }
        } else {
          // For admin_assigned or different types, just remove
          setAddedPersonalDays(prev => prev.filter(dp => dp.date !== dateStr));
        }
      } else {
        setAddedPersonalDays(prev => [...prev, { date: dateStr, halfDay: false, assignmentType }]);
      }
    }
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
    if (!typeId) return "Festivo";
    const type = customDayTypes.find(t => t.id === typeId);
    if (!type) return "Festivo";
    const normalizedName = (type.name || "").trim().toLowerCase();
    if (type.system_type === "laboral" || normalizedName === "periodo no vacacional") {
      return "Periodo No Vacacional";
    }
    return type.name;
  };

  const isNonVacationPeriod = (dayInfo: CalendarDay | undefined): boolean => {
    if (!dayInfo) return false;
    
    // Check if it's explicitly marked as laboral
    if (dayInfo.day_type === 'laboral') return true;
    
    // Check if it has a custom day type that's laboral or named "Periodo No Vacacional"
    if (dayInfo.custom_day_type_id) {
      const customType = customDayTypes.find(t => t.id === dayInfo.custom_day_type_id);
      if (customType) {
        const normalizedName = (customType.name || "").trim().toLowerCase();
        if (customType.system_type === "laboral" || normalizedName === "periodo no vacacional") {
          return true;
        }
      }
    }
    
    return false;
  };

  const isDayRelevantToWorker = (dayInfo: CalendarDay | undefined): boolean => {
    if (!dayInfo) return false;
    
    // Non-vacation period is relevant (to show in grey)
    if (isNonVacationPeriod(dayInfo)) return true;
    
    if (dayInfo.day_type === 'festivo' || dayInfo.day_type === 'vacaciones_generales') {
      return true;
    }
    if ((dayInfo.day_type === 'vacaciones_grupo' || dayInfo.day_type === 'vacaciones') && worker?.work_group_id) {
      return dayInfo.group_id === worker.work_group_id || dayInfo.group_id_2 === worker.work_group_id;
    }
    return false;
  };

  const workerGroup = workGroups.find(g => g.id === worker?.work_group_id);

  const renderMonth = (monthIndex: number, hideTitleOnMobile = false) => {
    const firstDay = startOfMonth(new Date(year, monthIndex, 1));
    const lastDay = endOfMonth(firstDay);
    const days = eachDayOfInterval({ start: firstDay, end: lastDay });
    const startDayOfWeek = getDay(firstDay);
    const adjustedStartDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    return (
      <div key={monthIndex} className="mb-6">
        <h3 className={`text-sm font-semibold mb-3 text-center ${hideTitleOnMobile ? 'hidden' : ''}`}>
          {MONTH_NAMES[monthIndex]}
        </h3>
        <div className="grid grid-cols-7 gap-1 text-xs">
          {DAY_HEADERS.map((day, i) => (
            <div key={i} className="text-center text-muted-foreground font-medium py-1 h-8 flex items-center justify-center">
              {day}
            </div>
          ))}
          
          {Array.from({ length: adjustedStartDay }).map((_, i) => (
            <div key={`empty-${i}`} className="h-8" />
          ))}
          
          {days.map((date) => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayInfo = calendarDays.find(d => d.date === dateStr);
            const dayOfWeek = getDay(date);
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            
            // CRITICAL: Check if this day was unlocked by a signed modification
            const isUnlockedByAdmin = unlockedDates.has(dateStr);
            
            // If unlocked, don't treat as group vacation
            const isRelevant = isUnlockedByAdmin ? false : isDayRelevantToWorker(dayInfo);
            const isApprovedDay = approvedDays.has(dateStr);
            const isPendingDay = pendingDays.has(dateStr);
            const isWorkerGroupDay = workerGroupDays.has(dateStr); // Already excludes unlocked in useMemo
            
            // Current session changes
            const isRemovedDay = removedDays.some(rd => rd.date === dateStr);
            const addedDayInfo = addedPersonalDays.find(d => d.date === dateStr);
            const isAddedDay = !!addedDayInfo;
            
            // Pending modifications (not yet signed) - show with opacity
            const isPendingRemoved = pendingModificationDays.removed.has(dateStr);
            const isPendingAdded = pendingModificationDays.added.has(dateStr);
            
            let bgColor = '';
            let textColor = 'text-foreground';
            let title = '';
            let customBgStyle: React.CSSProperties = {};
            let extraClasses = '';
            let icon: React.ReactNode = null;

            // Determine if clickable based on mode
            const hasContent = dayInfo || isWorkerGroupDay || isApprovedDay;
            const isClickable = editMode === 'remove' 
              ? hasContent && !isWeekend 
              : !isWeekend; // In add mode, can click any non-weekend day
            
            // Priority rendering: Session changes > Approved > Pending > Calendar > Weekend
            
            // 1. Current session - marked for removal (red ring, opacity)
            if (isRemovedDay) {
              const removedInfo = removedDays.find(rd => rd.date === dateStr);
              // Try to find original color
              let originalColor = '#6b7280'; // gray default
              if (removedInfo?.originalType === 'vacaciones_grupo' || removedInfo?.originalType === 'vacaciones') {
                originalColor = workerGroup?.color || '#3b82f6';
              } else if (removedInfo?.originalType === 'festivo') {
                originalColor = dayInfo?.custom_day_type_id ? getCustomDayTypeColor(dayInfo.custom_day_type_id) : '#dc2626';
              }
              customBgStyle = { backgroundColor: originalColor, opacity: 0.4 };
              textColor = 'text-white';
              extraClasses = 'ring-2 ring-destructive ring-offset-1';
              title = `MARCADO PARA QUITAR`;
              icon = <Minus className="absolute -top-0.5 -right-0.5 h-3 w-3 text-destructive bg-background rounded-full" />;
            }
            // 2. Current session - added personal day (differentiate by type)
            else if (isAddedDay && addedDayInfo) {
              const isLibreConfig = addedDayInfo.assignmentType === 'libre_configuracion';
              const isHalfDay = addedDayInfo.halfDay;
              customBgStyle = { backgroundColor: isLibreConfig ? '#93d600' : '#8b5cf6' }; // primary / violet-500
              textColor = isLibreConfig ? 'text-primary-foreground' : 'text-white';
              extraClasses = isLibreConfig ? 'ring-2 ring-primary ring-offset-1' : 'ring-2 ring-violet-500 ring-offset-1';
              title = isLibreConfig 
                ? `Libre configuración AÑADIDO${isHalfDay ? ' (½ día)' : ''}` 
                : "Asignación admin AÑADIDO";
              icon = isHalfDay 
                ? <span className="absolute -top-1 -right-1 text-[8px] font-bold bg-background text-primary rounded-full px-0.5">½</span>
                : <Plus className={`absolute -top-0.5 -right-0.5 h-3 w-3 ${isLibreConfig ? 'text-primary' : 'text-violet-500'} bg-background rounded-full`} />;
            }
            // 3. Pending modification removed (waiting signature) - dashed border
            else if (isPendingRemoved) {
              customBgStyle = { backgroundColor: workerGroup?.color || '#3b82f6', opacity: 0.3 };
              textColor = 'text-white';
              extraClasses = 'border-2 border-dashed border-amber-500';
              title = `Pendiente de confirmación - QUITADO`;
            }
            // 4. Pending modification added (waiting signature) - dashed border
            else if (isPendingAdded) {
              customBgStyle = { backgroundColor: '#93d600', opacity: 0.5 }; // primary
              textColor = 'text-primary-foreground';
              extraClasses = 'border-2 border-dashed border-amber-500';
              title = `Pendiente de confirmación - AÑADIDO`;
            }
            // 4.5. Effective free_assignment dates (approved libre configuración in database)
            else if (effectiveFreeAssignmentDates.has(dateStr)) {
              customBgStyle = { backgroundColor: '#93d600' }; // corporate green
              textColor = 'text-foreground';
              title = 'Libre configuración (aprobado)';
            }
            // 4.6. Effective admin-assigned dates (already in database from signed modifications)
            else if (effectiveAdminAssignedDates.has(dateStr)) {
              customBgStyle = { backgroundColor: '#8b5cf6' }; // violet-500
              textColor = 'text-white';
              title = 'Vacaciones asignadas por admin';
            }
            // 5. Worker's approved vacation days
            else if (isApprovedDay) {
              customBgStyle = { backgroundColor: '#3b82f6' };
              textColor = 'text-white';
              title = "Mis vacaciones aprobadas";
            }
            // 6. Worker's pending vacation request days
            else if (isPendingDay) {
              bgColor = 'bg-muted';
              textColor = 'text-muted-foreground';
              title = "Pendiente de aprobación";
            }
            // 7. Weekend
            else if (isWeekend) {
              textColor = 'text-muted-foreground/50';
            }
            // 8. OTHER groups on vacation (mark as "Periodo No Vacacional")
            else if (otherGroupVacationDays.has(dateStr)) {
              bgColor = 'bg-muted-foreground/30';
              textColor = 'text-foreground';
              title = "Periodo No Vacacional";
            }
            // 9. Calendar day types (holidays, general vacations, group vacations, non-vacation period)
            else if (isRelevant && dayInfo) {
              // First check if it's a non-vacation period (Periodo No Vacacional)
              if (isNonVacationPeriod(dayInfo)) {
                bgColor = 'bg-muted-foreground/30';
                textColor = 'text-foreground';
                title = "Periodo No Vacacional";
                if (dayInfo.legend) title += `: ${dayInfo.legend}`;
              }
              // Real holidays (festivo without laboral system_type)
              else if (dayInfo.day_type === 'festivo') {
                const color = dayInfo.custom_day_type_id 
                  ? getCustomDayTypeColor(dayInfo.custom_day_type_id)
                  : getSystemTypeColor('festivo');
                customBgStyle = { backgroundColor: color };
                textColor = 'text-white';
                title = dayInfo.custom_day_type_id
                  ? getCustomDayTypeName(dayInfo.custom_day_type_id)
                  : "Festivo";
                if (dayInfo.legend) title += `: ${dayInfo.legend}`;
              } 
              // General vacations
              else if (dayInfo.day_type === 'vacaciones_generales') {
                customBgStyle = { backgroundColor: getSystemTypeColor('vacaciones_generales') };
                textColor = 'text-foreground';
                title = "Vacaciones Generales";
                if (dayInfo.legend) title += `: ${dayInfo.legend}`;
              } 
              // Group vacations - use the worker's group color
              else if ((dayInfo.day_type === 'vacaciones_grupo' || dayInfo.day_type === 'vacaciones') && workerGroup) {
                customBgStyle = { backgroundColor: workerGroup.color };
                textColor = 'text-white';
                title = `Vacaciones ${workerGroup.name}`;
                if (dayInfo.legend) title += `: ${dayInfo.legend}`;
              }
            }

            // Hover effect for clickable days
            const hoverClass = isClickable 
              ? editMode === 'remove' 
                ? 'hover:ring-2 hover:ring-destructive/50 cursor-pointer'
                : editMode === 'add_libre'
                  ? 'hover:ring-2 hover:ring-primary/50 cursor-pointer'
                  : 'hover:ring-2 hover:ring-violet-500/50 cursor-pointer'
              : '';

            return (
              <Tooltip key={dateStr}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleDayClick(dateStr)}
                    className={`h-8 w-8 flex items-center justify-center rounded-full text-xs relative mx-auto transition-all ${bgColor} ${textColor} ${extraClasses} ${hoverClass}`}
                    style={customBgStyle}
                    disabled={!isClickable}
                  >
                    {date.getDate()}
                    {icon}
                  </button>
                </TooltipTrigger>
                {title && <TooltipContent>{title}</TooltipContent>}
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  };

  // Show loading while auth is checking OR data is loading
  if (authLoading || loading) {
    return <LoadingScreen />;
  }

  if (!worker) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Trabajador no encontrado</p>
      </div>
    );
  }

  const handleSaveEmail = async () => {
    if (!worker || !inlineEmail.includes('@')) return;
    setSavingEmail(true);
    try {
      const sessionToken = getSessionToken();
      const { error } = await supabase.functions.invoke('admin-operations', {
        body: { action: 'updateWorkerEmail', sessionToken, data: { workerId: worker.id, email: inlineEmail } }
      });
      if (error) throw error;
      setWorker({ ...worker, email: inlineEmail });
      toast.success("Email guardado en la ficha del trabajador");
    } catch (e) {
      console.error('Error saving email:', e);
      toast.error("Error al guardar el email");
    }
    setSavingEmail(false);
  };

  const canSendEmail = worker.email && worker.email.includes('@');
  const isSigned = editingModification?.status === 'signed';

  return (
    <TooltipProvider>
      <div className={cn("min-h-screen bg-background", isEmbedded && "p-2")}>
        {/* Header - like worker's personal calendar - hidden in embedded mode */}
        {!isEmbedded && (
        <div className="bg-card border-b sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex items-center gap-2 justify-between">
              {/* Left: back + logo + title */}
              <div className="flex items-center gap-2 min-w-0">
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(`${returnTo}?tab=${returnTab}`)}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <LogoLink to="/admin" className="h-7 w-auto shrink-0 hidden sm:block" />
                <div className="min-w-0">
                  <h1 className="text-base font-semibold truncate">Modificación de Calendario</h1>
                  <p className="text-xs text-muted-foreground truncate">
                    {worker.name} ({worker.worker_number}) • {department?.name}
                  </p>
                </div>
              </div>
              
              {/* Right: selector + status + actions - single row */}
              <div className="flex items-center gap-1.5 shrink-0">
                {workerDrafts.length > 0 && (
                  <Select
                    value={editingModification?.id || "new"}
                    onValueChange={(value) => {
                      if (value === "new") {
                        setEditingModification(null);
                        setRemovedDays([]);
                        setAddedPersonalDays([]);
                        setNewGroupId("");
                        setAdminReason("");
                        navigate(`/admin/worker-calendar/${workerId}`, { replace: true });
                      } else {
                        navigate(`/admin/worker-calendar/${workerId}?modificationId=${value}`, { replace: true });
                        window.location.reload();
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs gap-1 w-auto max-w-[220px]">
                      <SelectValue placeholder="+ Nueva modificación" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">
                        <div className="flex items-center gap-1.5">
                          <Plus className="h-3 w-3" />
                          Nueva modificación
                        </div>
                      </SelectItem>
                      {workerDrafts.map((draft) => (
                        <SelectItem key={draft.id} value={draft.id}>
                          <div className="flex items-center gap-1.5">
                            {draft.status === 'pending_signature' ? (
                              <Clock className="h-3 w-3 text-yellow-500 shrink-0" />
                            ) : (
                              <FileSignature className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                            <span className="whitespace-nowrap">
                              {safeFormatBackendDate(draft.created_at, "dd/MM/yy HH:mm")}
                            </span>
                            <span className="text-muted-foreground whitespace-nowrap">
                              ({draft.status === 'pending_signature' ? 'Pend. firma' : 'Borrador'})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                
                {editingModification && (
                  <Badge variant={
                    editingModification.status === 'signed' ? 'default' :
                    editingModification.status === 'pending_signature' ? 'secondary' :
                    editingModification.status === 'rejected' ? 'destructive' : 'outline'
                  } className="gap-1 whitespace-nowrap text-xs shrink-0">
                    {editingModification.status === 'signed' && <Check className="h-3 w-3" />}
                    {editingModification.status === 'pending_signature' && <Clock className="h-3 w-3" />}
                    {editingModification.status === 'draft' && <FileSignature className="h-3 w-3" />}
                    {editingModification.status === 'signed' ? 'Firmado' :
                     editingModification.status === 'pending_signature' ? 'Pendiente firma' :
                     editingModification.status === 'rejected' ? 'Rechazado' : 'Borrador'}
                  </Badge>
                )}
                
                {editingModification?.status === 'pending_signature' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 shrink-0 h-8 text-xs"
                    disabled={sendingEmail}
                    onClick={handleResendPendingSignatureEmail}
                  >
                    {sendingEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                    <span className="hidden sm:inline">Reenviar correo</span>
                    <span className="sm:hidden">Reenviar</span>
                  </Button>
                )}
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="shrink-0 h-8 w-8"
                  onClick={fetchData}
                  title="Actualizar datos"
                  disabled={loading}
                >
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                </Button>
              </div>
            </div>
          </div>
        </div>
        )}

        <div className={cn("max-w-6xl mx-auto px-4 py-6 space-y-6", isEmbedded && "py-2 px-2")}>
          {/* Worker info + search bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          {/* Left: Worker group info + available days - same height/styling */}
            <div className="flex flex-wrap items-center gap-3">
              {workerGroup && (
                <div className="flex items-center gap-2 bg-card border rounded-full px-4 py-2.5 h-10">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: workerGroup.color }}
                  />
                  <span className="text-sm">
                    <span className="font-medium">Grupo: {workerGroup.name}</span>
                    <span className="text-muted-foreground ml-1">({workerGroupDays.size} días grupo</span>
                    {generalVacationDays > 0 && (
                      <span className="text-muted-foreground"> + {generalVacationDays} generales</span>
                    )}
                    <span className="text-muted-foreground">)</span>
                  </span>
                </div>
              )}
              
              {/* Available days with inline edit - same height as group badge */}
              <div className="flex items-center gap-2 bg-card border rounded-full px-4 py-2.5 h-10">
                <span className="text-sm">Días disponibles:</span>
                {isEditingDays ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={editingDaysValue}
                      onChange={(e) => setEditingDaysValue(e.target.value)}
                      className="w-14 h-6 text-center text-sm p-1"
                      min={0}
                      step="0.5"
                    />
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleSaveAvailableDays}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setIsEditingDays(false)}>
                      <ArrowLeft className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-primary">
                      {availableDays !== null 
                        ? Math.max(0, availableDays - addedPersonalDays.filter(d => d.assignmentType === 'libre_configuracion').reduce((acc, d) => acc + (d.halfDay ? 0.5 : 1), 0)).toFixed(1).replace(/\.0$/, '') 
                        : '-'}
                    </span>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-6 w-6 p-0" 
                      onClick={() => {
                        setEditingDaysValue(String(availableDays || 0));
                        setIsEditingDays(true);
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Right: Worker search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar otro trabajador..."
                value={workerSearchQuery}
                onChange={(e) => handleSearchWorkers(e.target.value)}
                className="pl-9 rounded-full"
              />
              {/* Search results dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-popover border rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
                  {searchResults.map((w) => (
                    <button
                      key={w.id}
                      className="w-full text-left px-4 py-2 hover:bg-muted transition-colors text-sm"
                      onClick={() => {
                        setSearchResults([]);
                        setWorkerSearchQuery("");
                        navigate(`/admin/worker-calendar/${w.id}`);
                      }}
                    >
                      <span className="font-medium">{w.name}</span>
                      <span className="text-muted-foreground ml-2">({w.worker_number})</span>
                    </button>
                  ))}
                </div>
              )}
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          {/* Mode selector - Three buttons in a row */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setEditMode('remove')}
              className={`py-3 px-4 rounded-full font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                editMode === 'remove'
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive'
              }`}
            >
              <Minus className="h-4 w-4" />
              <span className="hidden sm:inline">Quitar días</span>
              <span className="sm:hidden">Quitar</span>
              {removedDays.length > 0 && (
                <Badge variant={editMode === 'remove' ? 'secondary' : 'destructive'} className="ml-1 h-5 min-w-5 flex items-center justify-center text-xs">
                  {removedDays.length}
                </Badge>
              )}
            </button>
            
            <button
              onClick={() => setEditMode('add_libre')}
              className={`py-3 px-4 rounded-full font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                editMode === 'add_libre'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-primary/20 text-muted-foreground hover:text-primary'
              }`}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Libre config.</span>
              <span className="sm:hidden">Libre</span>
              {addedPersonalDays.filter(d => d.assignmentType === 'libre_configuracion').length > 0 && (
                <Badge variant="secondary" className={`ml-1 h-5 min-w-5 flex items-center justify-center text-xs ${editMode === 'add_libre' ? 'bg-white/20 text-white' : 'bg-primary text-primary-foreground'}`}>
                  {addedPersonalDays.filter(d => d.assignmentType === 'libre_configuracion').reduce((acc, d) => acc + (d.halfDay ? 0.5 : 1), 0)}
                </Badge>
              )}
            </button>
            
            <button
              onClick={() => setEditMode('add_admin')}
              className={`py-3 px-4 rounded-full font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                editMode === 'add_admin'
                  ? 'bg-violet-500 text-white'
                  : 'bg-muted hover:bg-violet-500/20 text-muted-foreground hover:text-violet-500'
              }`}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Admin</span>
              <span className="sm:hidden">Admin</span>
              {addedPersonalDays.filter(d => d.assignmentType === 'admin_assigned').length > 0 && (
                <Badge variant="secondary" className={`ml-1 h-5 min-w-5 flex items-center justify-center text-xs ${editMode === 'add_admin' ? 'bg-white/20 text-white' : 'bg-violet-500 text-white'}`}>
                  {addedPersonalDays.filter(d => d.assignmentType === 'admin_assigned').length}
                </Badge>
              )}
            </button>
          </div>

          {/* Calendar Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Calendario {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Legend - dots for standard types, badges only for Libre config. and Admin */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-6 text-sm">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/50" />
                  <span className="text-muted-foreground">Pendiente</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getSystemTypeColor('vacaciones_generales') }} />
                  <span>Vac. Generales</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getSystemTypeColor('festivo') }} />
                  <span>Festivo</span>
                </div>
                {workerGroup && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: workerGroup.color }} />
                    <span>Grupo ({workerGroup.name})</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/40" />
                  <span>No Vacacional</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span>Pend. confirm.</span>
                </div>
                {/* Only these get badge styling */}
                {effectiveFreeAssignmentDates.size > 0 && (
                  <Badge className="gap-1.5" style={{ backgroundColor: '#93d600', color: '#000' }}>
                    Libre config. ({effectiveFreeAssignmentDates.size})
                  </Badge>
                )}
                <Badge className="gap-1.5 bg-violet-500 text-white hover:bg-violet-500">
                  Admin
                </Badge>
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
                  
                  if (Math.abs(diff) > 50) {
                    if (diff > 0 && mobileMonth < 11) {
                      setMobileMonth(m => m + 1);
                    } else if (diff < 0 && mobileMonth > 0) {
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
                  <span className="font-semibold">{MONTH_NAMES[mobileMonth]}</span>
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
                {MONTH_NAMES.map((_, idx) => renderMonth(idx))}
              </div>
            </CardContent>
          </Card>

          {/* Summary and actions */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Changes summary */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Resumen de cambios</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Removed days */}
                {removedDays.length > 0 && (
                  <div>
                    <Label className="text-sm text-destructive flex items-center gap-2 mb-2">
                      <Minus className="h-4 w-4" />
                      Días a quitar ({removedDays.length})
                    </Label>
                    <div className="flex flex-wrap gap-1">
                      {removedDays.sort((a, b) => a.date.localeCompare(b.date)).map(rd => (
                        <Badge 
                          key={rd.date} 
                          variant="outline" 
                          className="text-destructive border-destructive/50 cursor-pointer hover:bg-destructive/10"
                          onClick={() => setRemovedDays(prev => prev.filter(x => x.date !== rd.date))}
                        >
                          {safeFormatBackendDate(rd.date, 'd MMM')}
                          <Trash2 className="h-3 w-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Added libre configuración days */}
                {addedPersonalDays.filter(d => d.assignmentType === 'libre_configuracion').length > 0 && (
                  <div>
                    <Label className="text-sm text-blue-500 flex items-center gap-2 mb-2">
                      <Plus className="h-4 w-4" />
                      Libre configuración ({addedPersonalDays.filter(d => d.assignmentType === 'libre_configuracion').length})
                    </Label>
                    <div className="flex flex-wrap gap-1">
                      {addedPersonalDays.filter(d => d.assignmentType === 'libre_configuracion').sort((a, b) => a.date.localeCompare(b.date)).map(d => (
                        <Badge 
                          key={d.date} 
                          variant="outline" 
                          className="text-blue-500 border-blue-500/50 cursor-pointer hover:bg-blue-500/10"
                          onClick={() => setAddedPersonalDays(prev => prev.filter(x => x.date !== d.date))}
                        >
                          {safeFormatBackendDate(d.date, 'd MMM')}
                          <Trash2 className="h-3 w-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Added admin assigned days */}
                {addedPersonalDays.filter(d => d.assignmentType === 'admin_assigned').length > 0 && (
                  <div>
                    <Label className="text-sm text-primary flex items-center gap-2 mb-2">
                      <Plus className="h-4 w-4" />
                      Asignación admin ({addedPersonalDays.filter(d => d.assignmentType === 'admin_assigned').length})
                    </Label>
                    <div className="flex flex-wrap gap-1">
                      {addedPersonalDays.filter(d => d.assignmentType === 'admin_assigned').sort((a, b) => a.date.localeCompare(b.date)).map(d => (
                        <Badge 
                          key={d.date} 
                          variant="outline" 
                          className="text-primary border-primary/50 cursor-pointer hover:bg-primary/10"
                          onClick={() => setAddedPersonalDays(prev => prev.filter(x => x.date !== d.date))}
                        >
                          {safeFormatBackendDate(d.date, 'd MMM')}
                          <Trash2 className="h-3 w-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {removedDays.length === 0 && addedPersonalDays.length === 0 && unlockedDates.size === 0 && effectiveAdminAssignedDates.size === 0 && (
                  <div className="text-center py-4">
                    <Info className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {editMode === 'remove' 
                        ? "Haz clic en cualquier día marcado (vacaciones, festivo, periodo no vacacional) para quitarlo."
                        : editMode === 'add_libre'
                          ? "Haz clic en cualquier día para añadirlo como día de libre configuración (restará del pool del trabajador)."
                          : "Haz clic en cualquier día para asignarlo como vacación admin (no resta del pool)."
                      }
                    </p>
                  </div>
                )}

                {/* Already applied changes - Days unlocked by signed modifications */}
                {unlockedDates.size > 0 && (
                  <div className="border-t pt-4">
                    <Label className="text-sm text-primary flex items-center gap-2 mb-2">
                      <Check className="h-4 w-4" />
                      Días ya desbloqueados ({unlockedDates.size}) - Aplicados
                    </Label>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(unlockedDates).sort().map(dateStr => (
                        <Badge 
                          key={dateStr} 
                          variant="outline" 
                          className="text-primary border-primary bg-transparent"
                        >
                          {safeFormatBackendDate(dateStr, 'd MMM')}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Estos días fueron quitados del calendario mediante modificaciones firmadas.
                    </p>
                  </div>
                )}

                {/* Already applied changes - Admin assigned days */}
                {effectiveAdminAssignedDates.size > 0 && (
                  <div className="border-t pt-4">
                    <Label className="text-sm text-violet-500 flex items-center gap-2 mb-2">
                      <Check className="h-4 w-4" />
                      Días asignados por admin ({effectiveAdminAssignedDates.size}) - Aplicados
                    </Label>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(effectiveAdminAssignedDates).sort().map(dateStr => (
                        <Badge 
                          key={dateStr} 
                          variant="outline" 
                          className="text-violet-500 border-violet-500 bg-transparent"
                        >
                          {safeFormatBackendDate(dateStr, 'd MMM')}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Estos días fueron asignados como vacaciones mediante modificaciones firmadas.
                    </p>
                  </div>
                )}

                {/* Show signed modifications history for this year */}
                {existingModifications.filter(m => m.status === 'signed' && m.year === year).length > 0 && (
                  <div className="border-t pt-4">
                    <Label className="text-sm text-muted-foreground flex items-center gap-2 mb-3">
                      <Clock className="h-4 w-4" />
                      Historial de modificaciones firmadas ({year})
                    </Label>
                    <div className="space-y-2">
                      {existingModifications
                        .filter(m => m.status === 'signed' && m.year === year)
                        .sort((a, b) => new Date(b.signed_at || b.created_at).getTime() - new Date(a.signed_at || a.created_at).getTime())
                        .map(mod => (
                          <div key={mod.id} className="text-xs bg-muted/30 rounded-md p-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-primary font-medium">
                                {mod.modification_type === 'remove_group_days' ? 'Días quitados' : 
                                 mod.modification_type === 'add_personal_days' ? 'Días añadidos' :
                                 mod.modification_type === 'change_group' ? 'Cambio de grupo' : 'Mixta'}
                              </span>
                              <Badge variant="outline" className="text-primary border-primary bg-transparent text-[10px]">
                                Firmada
                              </Badge>
                            </div>
                            {mod.signed_at && (
                              <p className="text-muted-foreground">
                                Firmado: {safeFormatBackendDate(mod.signed_at, "d MMM yyyy 'a las' HH:mm", { locale: es })}
                              </p>
                            )}
                            <p className="text-muted-foreground">
                              Por: {mod.admin_name}
                            </p>
                            {mod.admin_reason && (
                              <p className="text-muted-foreground italic truncate" title={mod.admin_reason}>
                                "{mod.admin_reason}"
                              </p>
                            )}
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Form section */}
            <div className="space-y-4">
              {/* Change group (optional) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Cambiar grupo (opcional)</CardTitle>
                  <CardDescription className="text-xs">
                    Mover al trabajador a otro grupo vacacional
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Select 
                    value={newGroupId || "__keep_current__"} 
                    onValueChange={(val) => setNewGroupId(val === "__keep_current__" ? "" : val)} 
                    disabled={isSigned}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Mantener grupo actual" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__keep_current__">Mantener grupo actual</SelectItem>
                      {workGroups.filter(g => g.id !== worker.work_group_id).map(group => (
                        <SelectItem key={group.id} value={group.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: group.color }}
                            />
                            {group.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Reason */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Motivo de la modificación *</CardTitle>
                  <CardDescription className="text-xs">
                    Este texto aparecerá en el email y documento de firma
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={adminReason}
                    onChange={(e) => setAdminReason(e.target.value)}
                    placeholder="Ej: Por necesidades operativas del departamento..."
                    className="min-h-[100px] resize-none"
                    disabled={isSigned}
                  />
                </CardContent>
              </Card>

              {/* Email field - inline edit */}
              <Card className={cn(
                "border",
                canSendEmail ? "border-border/50" : "border-destructive/50 bg-destructive/5"
              )}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Label className="text-sm font-medium">Email del trabajador</Label>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="ejemplo@correo.com"
                      value={inlineEmail}
                      onChange={(e) => setInlineEmail(e.target.value)}
                      disabled={isSigned || savingEmail}
                      className="text-sm"
                    />
                    <Button
                      size="sm"
                      variant={inlineEmail !== (worker?.email || '') ? "default" : "outline"}
                      disabled={isSigned || savingEmail || inlineEmail === (worker?.email || '') || !inlineEmail.includes('@')}
                      onClick={handleSaveEmail}
                    >
                      {savingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  {!canSendEmail && (
                    <p className="text-xs text-destructive">
                      Sin email no se podrá enviar notificación.
                    </p>
                  )}
                </CardContent>
              </Card>

                {/* Actions */}
                <div className="space-y-2">
                  {/* Primary action - filled green */}
                  <Button
                    onClick={() => handleSave(true)}
                    disabled={saving || isSigned || !adminReason.trim() || !canSendEmail}
                    className="w-full"
                  >
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Guardar y enviar para firma
                  </Button>

                  {/* Secondary actions - outline style */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => handleSave(false)}
                      disabled={saving || isSigned || !adminReason.trim()}
                      variant="outline"
                      className="w-full"
                    >
                      {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Borrador
                    </Button>

                    <Button
                      onClick={() => handleApplyDirectly()}
                      disabled={saving || isSigned || !adminReason.trim()}
                      variant="outline"
                      className="w-full"
                    >
                      {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                      Aplicar
                    </Button>
                  </div>

                  {editingModification && (editingModification.status === 'draft' || editingModification.status === 'pending_signature') && canSendEmail && (
                    <Button
                      onClick={() => {
                        if (editingModification.status === 'pending_signature') {
                          handleResendPendingSignatureEmail();
                        } else {
                          setShowConfirmSendEmail(true);
                        }
                      }}
                      disabled={sendingEmail}
                      variant="ghost"
                      className="w-full text-muted-foreground"
                    >
                      {sendingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                      {editingModification.status === 'pending_signature' ? 'Reenviar correo de firma' : 'Reenviar email'}
                    </Button>
                  )}
                </div>
            </div>
          </div>
        </div>

        {/* Confirm send email dialog */}
        <Dialog open={showConfirmSendEmail} onOpenChange={setShowConfirmSendEmail}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enviar email de firma</DialogTitle>
              <DialogDescription>
                Se enviará un email a {worker.email} con un enlace para revisar y firmar los cambios propuestos.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmSendEmail(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSendEmailOnly} disabled={sendingEmail}>
                {sendingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default WorkerCalendarModification;
