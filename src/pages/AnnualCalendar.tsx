import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Save, 
  Download, 
  ArrowLeft, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight,
  Users,
  Trash2,
  Settings,
  Info,
  RefreshCw,
  Tag,
  Palette,
  Pencil,
  Copy,
  MoreVertical,
  ExternalLink,
  Lock,
  Unlock,
  AlertTriangle,
  History,
  CheckCircle2,
  Circle
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format, startOfYear, endOfYear, eachDayOfInterval, getMonth, getDay, startOfMonth, endOfMonth, isSameDay, addYears } from "date-fns";
import { es } from "date-fns/locale";
import { useManagerAuth } from "@/modules/auth/hooks/useManagerAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import LoadingScreen from "@/components/LoadingScreen";
import LoadingPanel from "@/components/LoadingPanel";
import BlockingHistoryPanel from "@/components/BlockingHistoryPanel";
import { DepartmentSearchSelect } from "@/components/DepartmentSearchSelect";


type Department = {
  id: string;
  name: string;
};

type WorkGroup = {
  id: string;
  department_id: string;
  name: string;
  color: string;
  sort_order: number;
  max_concurrent_workers?: number | null;
  free_days_deduction?: number | null;
};

type CustomDayType = {
  id: string;
  department_id: string;
  name: string;
  color: string;
  sort_order: number;
  system_type?: string | null;
};

type WorkerTeam = {
  id: string;
  department_id: string;
  name: string;
  sort_order: number;
};

type WorkGroupTeam = {
  id: string;
  work_group_id: string;
  worker_team_id: string;
};

// Default system types with their default colors
const DEFAULT_SYSTEM_TYPES = [
  { system_type: 'festivo', name: 'Festivo', color: '#dc2626' },
  { system_type: 'vacaciones_generales', name: 'Vacaciones Generales', color: '#06b6d4' },
];

type AnnualCalendar = {
  id: string;
  department_id: string;
  year: number;
  description: string | null;
  auto_rotate_groups: boolean;
  info_text: string | null;
  is_reviewed: boolean;
  reviewed_at: string | null;
};

type CalendarDay = {
  id: string;
  calendar_id: string;
  date: string;
  day_type: 'laboral' | 'festivo' | 'vacaciones_generales' | 'vacaciones_grupo';
  legend: string | null;
  group_id: string | null;
  group_id_2: string | null;
  custom_day_type_id: string | null;
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const DAY_TYPES = {
  laboral: { label: "Laboral", color: "bg-background", textColor: "text-foreground" },
  festivo: { label: "Festivo", color: "bg-red-500", textColor: "text-white" },
  vacaciones_generales: { label: "Vacaciones Generales", color: "bg-primary", textColor: "text-primary-foreground" },
  vacaciones_grupo: { label: "Vacaciones de Grupo", color: "bg-blue-500", textColor: "text-white" },
};

type DayOverride = {
  id: string;
  department_id: string;
  date: string;
  is_unblocked: boolean;
  created_by: string | null;
};

const AnnualCalendar = () => {
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated, getSessionToken, manager, isLoading: authLoading } = useManagerAuth();
  
  const [loading, setLoading] = useState(true);
  const [loadingCalendars, setLoadingCalendars] = useState(true);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [workerTeams, setWorkerTeams] = useState<WorkerTeam[]>([]);
  const [workGroupTeams, setWorkGroupTeams] = useState<WorkGroupTeam[]>([]);
  const [customDayTypes, setCustomDayTypes] = useState<CustomDayType[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [calendar, setCalendar] = useState<AnnualCalendar | null>(null);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [description, setDescription] = useState("");
  const [infoText, setInfoText] = useState("");
  const [autoRotate, setAutoRotate] = useState(false);
  
  // List view state
  const [showListView, setShowListView] = useState(true);
  const [allCalendars, setAllCalendars] = useState<(AnnualCalendar & { departments?: { name: string } })[]>([]);
  
  // Selection state
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectionStart, setSelectionStart] = useState<string | null>(null);
  
  // Dialogs
  const [showDayTypeDialog, setShowDayTypeDialog] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [showCreateCustomTypeDialog, setShowCreateCustomTypeDialog] = useState(false);
  const [showEditCustomTypeDialog, setShowEditCustomTypeDialog] = useState(false);
  const [editingCustomType, setEditingCustomType] = useState<CustomDayType | null>(null);
  const [editingSystemType, setEditingSystemType] = useState<{ system_type: string; name: string; color: string } | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#3b82f6");
  const [showEditGroupDialog, setShowEditGroupDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<WorkGroup | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [groupMaxConcurrentWorkers, setGroupMaxConcurrentWorkers] = useState<number | null>(null);
  const [groupFreeDaysDeduction, setGroupFreeDaysDeduction] = useState<number | null>(null);
  const [newCustomTypeName, setNewCustomTypeName] = useState("");
  const [newCustomTypeColor, setNewCustomTypeColor] = useState("#f97316");
  const [selectedDayType, setSelectedDayType] = useState<'laboral' | 'festivo' | 'vacaciones_generales' | 'vacaciones_grupo'>('laboral');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupId2, setSelectedGroupId2] = useState<string | null>(null);
  const [selectedCustomDayTypeId, setSelectedCustomDayTypeId] = useState<string | null>(null);
  const [legendText, setLegendText] = useState("");
  
  // Manager assigned departments
  const [assignedDepartments, setAssignedDepartments] = useState<string[]>([]);
  
  // PDF export mode - light mode default for managers
  const [pdfLightMode, setPdfLightMode] = useState(!isAdmin);
  
  // Hidden system types (Festivo, Vacaciones Generales can be hidden per session)
  const [hiddenSystemTypes, setHiddenSystemTypes] = useState<string[]>([]);
  
  // Duplicate calendar dialog
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicatingCalendarId, setDuplicatingCalendarId] = useState<string | null>(null);
  const [duplicateTargetDepartmentId, setDuplicateTargetDepartmentId] = useState<string>("");

  // Edit description dialog
  const [showEditDescriptionDialog, setShowEditDescriptionDialog] = useState(false);
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState("");

  // Blocked days by concurrency
  const [blockedDaysByConcurrency, setBlockedDaysByConcurrency] = useState<string[]>([]);
  const [dayOverrides, setDayOverrides] = useState<DayOverride[]>([]);
  const [showBlockedDaysPanel, setShowBlockedDaysPanel] = useState(true);
  const [showBlockingHistory, setShowBlockingHistory] = useState(false);

  // Filter for list view
  const [filterDepartmentId, setFilterDepartmentId] = useState<string>("all");

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 2 + i);

  

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    fetchData();
    fetchAllCalendars();
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (selectedDepartmentId && selectedYear) {
      fetchCalendar();
      fetchBlockedDaysByConcurrency();
    }
  }, [selectedDepartmentId, selectedYear]);

  const fetchBlockedDaysByConcurrency = async () => {
    if (!selectedDepartmentId || !selectedYear) return;
    
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'getBlockedDaysByConcurrency',
          sessionToken,
          departmentId: selectedDepartmentId,
          year: selectedYear
        }
      });

      if (data?.success) {
        setBlockedDaysByConcurrency(data.blockedDays || []);
        setDayOverrides(data.overrides || []);
      }
    } catch (error) {
      console.error('Error fetching blocked days:', error);
    }
  };

  const handleToggleDayOverride = async (date: string, unblock: boolean) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    setSaving(true);
    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'toggleDayOverride',
          sessionToken,
          departmentId: selectedDepartmentId,
          date,
          unblock
        }
      });

      if (data?.success) {
        toast.success(unblock ? "Día desbloqueado manualmente" : "Override eliminado");
        fetchBlockedDaysByConcurrency();
      } else {
        toast.error(data?.error || "Error al gestionar override");
      }
    } catch (error) {
      console.error('Error toggling override:', error);
      toast.error("Error al gestionar override");
    }
    setSaving(false);
  };

  const isDayBlockedByConcurrency = (dateStr: string): boolean => {
    // Check if day is blocked by concurrency AND not overridden
    const isBlocked = blockedDaysByConcurrency.includes(dateStr);
    const isOverridden = dayOverrides.some(o => o.date === dateStr && o.is_unblocked);
    return isBlocked && !isOverridden;
  };

  const isDayOverridden = (dateStr: string): boolean => {
    return dayOverrides.some(o => o.date === dateStr && o.is_unblocked);
  };

  const fetchAllCalendars = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    setLoadingCalendars(true);
    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: { action: 'getCalendars', sessionToken }
      });

      if (data?.success) {
        const calendars = data.calendars || [];
        setAllCalendars(calendars);
        
        // For managers, extract departments from their calendars
        if (!isAdmin && calendars.length > 0) {
          const deptMap = new Map<string, Department>();
          calendars.forEach((cal: any) => {
            if (cal.department_id && cal.departments?.name) {
              deptMap.set(cal.department_id, { id: cal.department_id, name: cal.departments.name });
            }
          });
          setDepartments(Array.from(deptMap.values()));
        }
      }
    } catch (error) {
      console.error('Error fetching calendars:', error);
    } finally {
      setLoadingCalendars(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      navigate("/login");
      return;
    }

    try {
      // Only admins can access admin-operations for departments
      if (isAdmin) {
        const { data: deptData } = await supabase.functions.invoke('admin-operations', {
          body: { action: 'getDepartments', sessionToken }
        });

        if (deptData?.success && deptData?.departments) {
          setDepartments(deptData.departments);
        }
      }
      // For managers, departments will be extracted from their calendars in fetchAllCalendars
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error("Error al cargar datos");
    }
    
    setLoading(false);
  };

  const fetchCalendar = async () => {
    if (!selectedDepartmentId || !selectedYear) return;
    
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    setLoadingCalendar(true);
    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: { 
          action: 'getCalendar', 
          sessionToken,
          departmentId: selectedDepartmentId,
          year: selectedYear
        }
      });

      if (data?.success) {
        setCalendar(data.calendar || null);
        setCalendarDays(data.days || []);
        setWorkGroups(data.groups || []);
        setWorkerTeams(data.workerTeams || []);
        setWorkGroupTeams(data.workGroupTeams || []);
        setCustomDayTypes(data.customDayTypes || []);
        setDescription(data.calendar?.description || "");
        setInfoText(data.calendar?.info_text || "");
        setAutoRotate(data.calendar?.auto_rotate_groups || false);
      }
    } catch (error) {
      console.error('Error fetching calendar:', error);
    }
    setLoadingCalendar(false);
  };

  const handleCreateCalendar = async () => {
    if (!selectedDepartmentId || !selectedYear) return;
    
    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'createCalendar',
          sessionToken,
          departmentId: selectedDepartmentId,
          year: selectedYear,
          description: "",
          autoRotateGroups: false
        }
      });

      if (data?.success) {
        toast.success("Calendario creado correctamente");
        fetchCalendar();
      } else {
        toast.error(data?.error || "Error al crear calendario");
      }
    } catch (error) {
      console.error('Error creating calendar:', error);
      toast.error("Error al crear calendario");
    }
    
    setSaving(false);
  };

  const handleSaveSettings = async () => {
    if (!calendar) return;
    
    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'updateCalendar',
          sessionToken,
          calendarId: calendar.id,
          description,
          infoText,
          autoRotateGroups: autoRotate
        }
      });

      if (data?.success) {
        toast.success("Configuración guardada");
        setCalendar(prev => prev ? { 
          ...prev, 
          description, 
          info_text: infoText, 
          auto_rotate_groups: autoRotate 
        } : null);
      } else {
        toast.error(data?.error || "Error al guardar");
      }
    } catch (error) {
      console.error('Error saving:', error);
      toast.error("Error al guardar");
    }
    
    setSaving(false);
  };

  const handleDayClick = (dateStr: string, event: React.MouseEvent) => {
    if (!isAdmin || !calendar) return;
    
    if (event.shiftKey && selectionStart) {
      // Range selection
      const allDates = getAllDatesInYear();
      const startIdx = allDates.indexOf(selectionStart);
      const endIdx = allDates.indexOf(dateStr);
      const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      const range = allDates.slice(from, to + 1);
      setSelectedDates(range);
    } else {
      // Single click or start new selection
      if (selectedDates.includes(dateStr)) {
        setSelectedDates(selectedDates.filter(d => d !== dateStr));
      } else {
        setSelectedDates([...selectedDates, dateStr]);
      }
      setSelectionStart(dateStr);
    }
  };

  const getAllDatesInYear = (): string[] => {
    const start = startOfYear(new Date(selectedYear, 0, 1));
    const end = endOfYear(new Date(selectedYear, 0, 1));
    return eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));
  };

  const handleApplyDayType = async () => {
    if (!calendar || selectedDates.length === 0) return;
    
    if (selectedDayType === 'vacaciones_grupo' && !selectedGroupId) {
      toast.error("Debes seleccionar un grupo");
      return;
    }

    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'updateDays',
          sessionToken,
          calendarId: calendar.id,
          dates: selectedDates,
          dayType: selectedDayType,
          legend: legendText || null,
          groupId: selectedDayType === 'vacaciones_grupo' ? selectedGroupId : null,
          groupId2: selectedDayType === 'vacaciones_grupo' ? selectedGroupId2 : null,
          customDayTypeId: selectedDayType === 'festivo' && selectedCustomDayTypeId ? selectedCustomDayTypeId : null,
          autoSync: true
        }
      });

      if (data?.success) {
        toast.success(`${selectedDates.length} días actualizados`);
        fetchCalendar();
        setSelectedDates([]);
        setShowDayTypeDialog(false);
        setLegendText("");
        setSelectedCustomDayTypeId(null);
        setSelectedGroupId2(null);
      } else {
        toast.error(data?.error || "Error al actualizar días");
      }
    } catch (error) {
      console.error('Error updating days:', error);
      toast.error("Error al actualizar días");
    }
    
    setSaving(false);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !selectedDepartmentId) return;
    
    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'createGroup',
          sessionToken,
          departmentId: selectedDepartmentId,
          name: newGroupName.trim(),
          color: newGroupColor
        }
      });

      if (data?.success) {
        toast.success("Grupo creado");
        setWorkGroups([...workGroups, data.group]);
        setNewGroupName("");
        setShowCreateGroupDialog(false);
      } else {
        toast.error(data?.error || "Error al crear grupo");
      }
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error("Error al crear grupo");
    }
    
    setSaving(false);
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("¿Eliminar este grupo?")) return;
    
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'deleteGroup',
          sessionToken,
          groupId
        }
      });

      if (data?.success) {
        toast.success("Grupo eliminado");
        setWorkGroups(workGroups.filter(g => g.id !== groupId));
        fetchCalendar();
      } else {
        toast.error(data?.error || "Error al eliminar grupo");
      }
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error("Error al eliminar grupo");
    }
  };

  const openEditGroupDialog = (group: WorkGroup) => {
    setEditingGroup(group);
    setNewGroupName(group.name);
    setNewGroupColor(group.color);
    setGroupMaxConcurrentWorkers(group.max_concurrent_workers ?? null);
    setGroupFreeDaysDeduction(group.free_days_deduction ?? null);
    // Get current team assignments for this group
    const currentTeams = workGroupTeams
      .filter(wgt => wgt.work_group_id === group.id)
      .map(wgt => wgt.worker_team_id);
    setSelectedTeamIds(currentTeams);
    setShowEditGroupDialog(true);
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup || !newGroupName.trim()) return;
    
    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'updateGroup',
          sessionToken,
          groupId: editingGroup.id,
          name: newGroupName.trim(),
          color: newGroupColor,
          teamIds: selectedTeamIds,
          maxConcurrentWorkers: groupMaxConcurrentWorkers,
          freeDaysDeduction: groupFreeDaysDeduction
        }
      });

      if (data?.success) {
        toast.success("Grupo actualizado");
        setWorkGroups(workGroups.map(g => g.id === editingGroup.id ? data.group : g));
        // Update local workGroupTeams state
        const newWorkGroupTeams = workGroupTeams.filter(wgt => wgt.work_group_id !== editingGroup.id);
        selectedTeamIds.forEach(teamId => {
          newWorkGroupTeams.push({
            id: crypto.randomUUID(),
            work_group_id: editingGroup.id,
            worker_team_id: teamId
          });
        });
        setWorkGroupTeams(newWorkGroupTeams);
        setShowEditGroupDialog(false);
        setEditingGroup(null);
        setNewGroupName("");
        setSelectedTeamIds([]);
        setGroupMaxConcurrentWorkers(null);
        setGroupFreeDaysDeduction(null);
      } else {
        toast.error(data?.error || "Error al actualizar grupo");
      }
    } catch (error) {
      console.error('Error updating group:', error);
      toast.error("Error al actualizar grupo");
    }
    
    setSaving(false);
  };

  const getTeamsForGroup = (groupId: string): WorkerTeam[] => {
    const teamIds = workGroupTeams
      .filter(wgt => wgt.work_group_id === groupId)
      .map(wgt => wgt.worker_team_id);
    return workerTeams.filter(t => teamIds.includes(t.id));
  };

  const toggleTeamSelection = (teamId: string) => {
    if (selectedTeamIds.includes(teamId)) {
      setSelectedTeamIds(selectedTeamIds.filter(id => id !== teamId));
    } else {
      setSelectedTeamIds([...selectedTeamIds, teamId]);
    }
  };

  const handleCreateCustomDayType = async () => {
    if (!newCustomTypeName.trim() || !selectedDepartmentId) return;
    
    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'createCustomDayType',
          sessionToken,
          departmentId: selectedDepartmentId,
          name: newCustomTypeName.trim(),
          color: newCustomTypeColor
        }
      });

      if (data?.success) {
        toast.success("Categoría creada");
        setCustomDayTypes([...customDayTypes, data.customDayType]);
        setNewCustomTypeName("");
        setNewCustomTypeColor("#f97316");
        setShowCreateCustomTypeDialog(false);
      } else {
        toast.error(data?.error || "Error al crear categoría");
      }
    } catch (error) {
      console.error('Error creating custom day type:', error);
      toast.error("Error al crear categoría");
    }
    
    setSaving(false);
  };

  const handleUpdateCustomDayType = async () => {
    // Handle system type update (create or update override)
    if (editingSystemType) {
      if (!newCustomTypeName.trim()) return;
      
      setSaving(true);
      const sessionToken = getSessionToken();
      
      // Check if there's an existing override for this system type
      const existingOverride = customDayTypes.find(t => t.system_type === editingSystemType.system_type);
      
      try {
        if (existingOverride) {
          // Update existing override
          const { data } = await supabase.functions.invoke('annual-calendar-operations', {
            body: {
              action: 'updateCustomDayType',
              sessionToken,
              customDayTypeId: existingOverride.id,
              name: newCustomTypeName.trim(),
              color: newCustomTypeColor
            }
          });
          
          if (data?.success) {
            toast.success("Categoría actualizada");
            setCustomDayTypes(customDayTypes.map(t => 
              t.id === existingOverride.id 
                ? { ...t, name: newCustomTypeName.trim(), color: newCustomTypeColor }
                : t
            ));
          } else {
            toast.error(data?.error || "Error al actualizar categoría");
          }
        } else {
          // Create new override for system type
          const { data } = await supabase.functions.invoke('annual-calendar-operations', {
            body: {
              action: 'createCustomDayType',
              sessionToken,
              departmentId: selectedDepartmentId,
              name: newCustomTypeName.trim(),
              color: newCustomTypeColor,
              systemType: editingSystemType.system_type
            }
          });
          
          if (data?.success) {
            toast.success("Categoría actualizada");
            setCustomDayTypes([...customDayTypes, data.customDayType]);
          } else {
            toast.error(data?.error || "Error al actualizar categoría");
          }
        }
        
        setShowEditCustomTypeDialog(false);
        setEditingSystemType(null);
        setEditingCustomType(null);
        setNewCustomTypeName("");
        setNewCustomTypeColor("#f97316");
      } catch (error) {
        console.error('Error updating system type:', error);
        toast.error("Error al actualizar categoría");
      }
      
      setSaving(false);
      return;
    }
    
    // Handle regular custom type update
    if (!editingCustomType || !newCustomTypeName.trim()) return;
    
    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'updateCustomDayType',
          sessionToken,
          customDayTypeId: editingCustomType.id,
          name: newCustomTypeName.trim(),
          color: newCustomTypeColor
        }
      });

      if (data?.success) {
        toast.success("Categoría actualizada");
        setCustomDayTypes(customDayTypes.map(t => 
          t.id === editingCustomType.id 
            ? { ...t, name: newCustomTypeName.trim(), color: newCustomTypeColor }
            : t
        ));
        setShowEditCustomTypeDialog(false);
        setEditingCustomType(null);
        setEditingSystemType(null);
        setNewCustomTypeName("");
        setNewCustomTypeColor("#f97316");
      } else {
        toast.error(data?.error || "Error al actualizar categoría");
      }
    } catch (error) {
      console.error('Error updating custom day type:', error);
      toast.error("Error al actualizar categoría");
    }
    
    setSaving(false);
  };

  const handleDeleteCustomDayType = async (customDayTypeId: string) => {
    if (!confirm("¿Eliminar esta categoría?")) return;
    
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'deleteCustomDayType',
          sessionToken,
          customDayTypeId
        }
      });

      if (data?.success) {
        toast.success("Categoría eliminada");
        setCustomDayTypes(customDayTypes.filter(t => t.id !== customDayTypeId));
        fetchCalendar();
      } else {
        toast.error(data?.error || "Error al eliminar categoría");
      }
    } catch (error) {
      console.error('Error deleting custom day type:', error);
      toast.error("Error al eliminar categoría");
    }
  };

  const openEditCustomTypeDialog = (type: CustomDayType) => {
    setEditingCustomType(type);
    setEditingSystemType(null);
    setNewCustomTypeName(type.name);
    setNewCustomTypeColor(type.color);
    setShowEditCustomTypeDialog(true);
  };

  const handleGenerateNextYear = async () => {
    if (!calendar) return;
    
    if (!confirm(`¿Generar calendario para ${selectedYear + 1}? ${autoRotate ? 'Los grupos se rotarán automáticamente.' : ''}`)) return;
    
    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'generateNextYear',
          sessionToken,
          calendarId: calendar.id
        }
      });

      if (data?.success) {
        toast.success(`Calendario ${selectedYear + 1} generado correctamente`);
        setSelectedYear(selectedYear + 1);
      } else {
        toast.error(data?.error || "Error al generar calendario");
      }
    } catch (error) {
      console.error('Error generating next year:', error);
      toast.error("Error al generar calendario");
    }
    
    setSaving(false);
  };


  const handleDownloadPDF = async (lightMode?: boolean) => {
    setSaving(true);
    const sessionToken = getSessionToken();
    
    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'generatePDF',
          sessionToken,
          calendarId: calendar?.id,
          departmentId: selectedDepartmentId,
          year: selectedYear,
          lightMode: lightMode ?? pdfLightMode
        }
      });

      if (data?.success && data?.html) {
        const htmlContent = data.html;
        
        // Check if mobile/touch device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                         ('ontouchstart' in window);
        
        if (!isMobile) {
          // Desktop: Try window.open
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
              printWindow.print();
            }, 500);
            toast.success("Calendario listo para imprimir/guardar como PDF");
          }
        } else {
          // Mobile: Use hidden iframe approach
          // Remove any existing print iframe
          const existingIframe = document.getElementById('print-iframe');
          if (existingIframe) {
            existingIframe.remove();
          }
          
          // Create iframe
          const iframe = document.createElement('iframe');
          iframe.id = 'print-iframe';
          iframe.style.position = 'fixed';
          iframe.style.top = '0';
          iframe.style.left = '0';
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.zIndex = '9999';
          iframe.style.backgroundColor = 'white';
          iframe.style.border = 'none';
          
          document.body.appendChild(iframe);
          
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            // Add close button and print instructions to the HTML
            const modifiedHtml = htmlContent.replace(
              '</body>',
              `<div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:10px;z-index:10000;">
                <button onclick="window.print()" style="background:#93d600;color:black;padding:12px 24px;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">
                  Guardar PDF
                </button>
                <button onclick="parent.document.getElementById('print-iframe').remove()" style="background:#333;color:white;padding:12px 24px;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">
                  Cerrar
                </button>
              </div>
              </body>`
            );
            
            iframeDoc.open();
            iframeDoc.write(modifiedHtml);
            iframeDoc.close();
            
            toast.success("Pulsa 'Imprimir / Guardar PDF' para descargar");
          }
        }
      } else {
        toast.error(data?.error || "Error al generar PDF");
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error("Error al generar PDF");
    }
    setSaving(false);
  };


  const getDayInfo = (dateStr: string): CalendarDay | undefined => {
    return calendarDays.find(d => d.date === dateStr);
  };

  const getGroupColor = (groupId: string | null): string => {
    if (!groupId) return "#3b82f6";
    const group = workGroups.find(g => g.id === groupId);
    return group?.color || "#3b82f6";
  };

  const getGroupName = (groupId: string | null): string => {
    if (!groupId) return "";
    const group = workGroups.find(g => g.id === groupId);
    return group?.name || "";
  };

  const getGroupNameWithTeams = (groupId: string | null): string => {
    if (!groupId) return "";
    const group = workGroups.find(g => g.id === groupId);
    if (!group) return "";
    
    const teamIds = workGroupTeams
      .filter(wgt => wgt.work_group_id === groupId)
      .map(wgt => wgt.worker_team_id);
    const teamNames = workerTeams
      .filter(t => teamIds.includes(t.id))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(t => t.name);
    
    if (teamNames.length > 0) {
      return `${group.name}: ${teamNames.join(', ')}`;
    }
    return group.name;
  };

  const getCustomDayTypeColor = (customDayTypeId: string | null): string => {
    if (!customDayTypeId) return getSystemTypeColor('festivo');
    const customType = customDayTypes.find(t => t.id === customDayTypeId);
    return customType?.color || getSystemTypeColor('festivo');
  };

  const getCustomDayTypeName = (customDayTypeId: string | null): string => {
    if (!customDayTypeId) return getSystemTypeName('festivo');
    const customType = customDayTypes.find(t => t.id === customDayTypeId);
    return customType?.name || getSystemTypeName('festivo');
  };

  // Get color for system types (festivo, vacaciones_generales)
  const getSystemTypeColor = (systemType: string): string => {
    const override = customDayTypes.find(t => t.system_type === systemType);
    if (override) return override.color;
    const defaultType = DEFAULT_SYSTEM_TYPES.find(t => t.system_type === systemType);
    return defaultType?.color || '#dc2626';
  };

  const getSystemTypeName = (systemType: string): string => {
    const override = customDayTypes.find(t => t.system_type === systemType);
    if (override) return override.name;
    const defaultType = DEFAULT_SYSTEM_TYPES.find(t => t.system_type === systemType);
    return defaultType?.name || 'Festivo';
  };

  // Filter departments for managers
  const availableDepartments = isAdmin 
    ? departments 
    : departments.filter(d => assignedDepartments.includes(d.id));

  const renderMonth = (monthIndex: number) => {
    const firstDay = startOfMonth(new Date(selectedYear, monthIndex, 1));
    const lastDay = endOfMonth(new Date(selectedYear, monthIndex, 1));
    const days = eachDayOfInterval({ start: firstDay, end: lastDay });
    
    // Get day of week for first day (0 = Sunday, 1 = Monday, etc.)
    // Adjust for Monday start
    let startDayOfWeek = getDay(firstDay);
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    
    const emptyDays = Array(startDayOfWeek).fill(null);

    return (
      <div key={monthIndex} className="bg-card rounded-lg border border-border p-2">
        <h4 className="text-sm font-semibold text-center mb-2 text-foreground">
          {MONTH_NAMES[monthIndex]}
        </h4>
        <div className="grid grid-cols-7 gap-0.5 text-[10px]">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day, i) => (
            <div key={i} className="text-center text-muted-foreground font-medium py-0.5">
              {day}
            </div>
          ))}
          {emptyDays.map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayInfo = getDayInfo(dateStr);
            const isSelected = selectedDates.includes(dateStr);
            const dayOfWeek = getDay(day);
            const isWeekend = dayOfWeek === 6 || dayOfWeek === 0; // Sábado y domingo
            const isBlockedByConcurrency = isDayBlockedByConcurrency(dateStr);
            const isOverridden = isDayOverridden(dateStr);
            
            let bgColor = "";
            let textColor = "text-foreground";
            let borderColor = "";
            
            // Find "Periodo Vacacional" or similar custom type for unmarked days
            const periodoVacacionalType = customDayTypes.find(t => 
              t.name.toLowerCase().includes('periodo') && !t.name.toLowerCase().includes('no')
            );
            const periodoNoVacacionalType = customDayTypes.find(t => 
              t.name.toLowerCase().includes('periodo') && t.name.toLowerCase().includes('no')
            );
            
            // "laboral" type means empty/unmarked - treat same as no dayInfo
            const isLaboral = dayInfo?.day_type === 'laboral';
            
            if (dayInfo && !isLaboral) {
              switch (dayInfo.day_type) {
                case 'festivo':
                  bgColor = "";
                  textColor = "text-white";
                  break;
                case 'vacaciones_generales':
                  bgColor = "";
                  textColor = "text-white";
                  break;
                case 'vacaciones_grupo':
                  bgColor = "";
                  textColor = "text-white";
                  break;
              }
            } else if (isBlockedByConcurrency) {
              // Blocked by concurrency - show in red
              bgColor = "bg-destructive/20";
              textColor = "text-destructive";
              borderColor = "ring-1 ring-destructive/50";
            } else if (isOverridden) {
              // Overridden (was blocked but manually unblocked)
              bgColor = "bg-amber-500/20";
              textColor = "text-amber-600 dark:text-amber-400";
              borderColor = "ring-1 ring-amber-500/50";
            } else if (isWeekend) {
              bgColor = "bg-muted/50";
              textColor = "text-muted-foreground";
            }
            // Days without marker or marked as "laboral" = empty, no background
            
            if (isSelected) {
              borderColor = "ring-2 ring-primary ring-offset-1";
            }

            const style: React.CSSProperties = {};
            const hasTwoGroups = dayInfo?.day_type === 'vacaciones_grupo' && dayInfo.group_id && dayInfo.group_id_2;
            
            if (dayInfo?.day_type === 'vacaciones_grupo' && dayInfo.group_id) {
              if (hasTwoGroups) {
                // Create split circle gradient
                const color1 = getGroupColor(dayInfo.group_id);
                const color2 = getGroupColor(dayInfo.group_id_2);
                style.background = `linear-gradient(90deg, ${color1} 50%, ${color2} 50%)`;
              } else {
                style.backgroundColor = getGroupColor(dayInfo.group_id);
              }
            } else if (dayInfo?.day_type === 'festivo') {
              // Use custom type color if specified, otherwise use system festivo color
              style.backgroundColor = dayInfo.custom_day_type_id 
                ? getCustomDayTypeColor(dayInfo.custom_day_type_id)
                : getSystemTypeColor('festivo');
            } else if (dayInfo?.day_type === 'vacaciones_generales') {
              style.backgroundColor = getSystemTypeColor('vacaciones_generales');
            }
            // No background for laboral or unmarked weekdays

            return (
              <TooltipProvider key={dateStr}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => handleDayClick(dateStr, e)}
                      disabled={!isAdmin || !calendar}
                      className={`
                        aspect-square flex items-center justify-center rounded-full text-[10px] font-medium
                        transition-all duration-100 relative
                        ${bgColor} ${textColor} ${borderColor}
                        ${isAdmin && calendar ? 'hover:ring-2 hover:ring-primary/50 cursor-pointer' : 'cursor-default'}
                      `}
                      style={style}
                    >
                      {format(day, 'd')}
                      {isBlockedByConcurrency && (
                        <Lock className="absolute -top-0.5 -right-0.5 h-2 w-2 text-destructive" />
                      )}
                      {isOverridden && (
                        <Unlock className="absolute -top-0.5 -right-0.5 h-2 w-2 text-amber-500" />
                      )}
                    </button>
                  </TooltipTrigger>
                  {(dayInfo && (dayInfo.legend || dayInfo.day_type !== 'laboral')) || isBlockedByConcurrency || isOverridden ? (
                    <TooltipContent>
                      {isBlockedByConcurrency && (
                        <p className="font-medium text-destructive flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Bloqueado por concurrencia
                        </p>
                      )}
                      {isOverridden && (
                        <p className="font-medium text-amber-500 flex items-center gap-1">
                          <Unlock className="h-3 w-3" /> Desbloqueado manualmente
                        </p>
                      )}
                      {dayInfo && dayInfo.day_type !== 'laboral' && (
                        <p className="font-medium">
                          {dayInfo.day_type === 'festivo' && dayInfo.custom_day_type_id 
                            ? getCustomDayTypeName(dayInfo.custom_day_type_id)
                            : DAY_TYPES[dayInfo.day_type].label
                          }
                        </p>
                      )}
                      {dayInfo?.day_type === 'vacaciones_grupo' && dayInfo.group_id && (
                        <div className="text-xs">
                          <p>{getGroupNameWithTeams(dayInfo.group_id)}</p>
                          {dayInfo.group_id_2 && (
                            <p>+ {getGroupNameWithTeams(dayInfo.group_id_2)}</p>
                          )}
                        </div>
                      )}
                      {dayInfo?.legend && <p className="text-xs text-muted-foreground">{dayInfo.legend}</p>}
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </div>
    );
  };

  const handleOpenCalendar = (cal: AnnualCalendar & { departments?: { name: string } }) => {
    // Clear all state before loading new calendar to prevent any stale data
    setCalendar(null);
    setCalendarDays([]);
    setWorkGroups([]);
    setWorkerTeams([]);
    setWorkGroupTeams([]);
    setCustomDayTypes([]);
    setDescription("");
    setInfoText("");
    setAutoRotate(false);
    setSelectedDates([]);
    setSelectionStart(null);
    setBlockedDaysByConcurrency([]);
    setDayOverrides([]);
    
    // Now set the new calendar's department and year
    setSelectedDepartmentId(cal.department_id);
    setSelectedYear(cal.year);
    setShowListView(false);
  };

  const handleBackToList = () => {
    setShowListView(true);
    setCalendar(null);
    setCalendarDays([]);
    setWorkGroups([]);
    setWorkerTeams([]);
    setWorkGroupTeams([]);
    setCustomDayTypes([]);
    setDescription("");
    setInfoText("");
    setAutoRotate(false);
    setSelectedDates([]);
    setSelectionStart(null);
    setBlockedDaysByConcurrency([]);
    setDayOverrides([]);
    setSelectedDepartmentId("");
  };

  const handleDeleteCalendar = async (calendarId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar este calendario? Esta acción no se puede deshacer.")) return;
    
    const sessionToken = getSessionToken();
    
    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: { action: 'deleteCalendar', sessionToken, calendarId }
      });

      if (data?.success) {
        toast.success("Calendario eliminado");
        setAllCalendars(allCalendars.filter(c => c.id !== calendarId));
      } else {
        toast.error(data?.error || "Error al eliminar calendario");
      }
    } catch (error) {
      console.error('Error deleting calendar:', error);
      toast.error("Error al eliminar calendario");
    }
  };

  const openDuplicateDialog = (calendarId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDuplicatingCalendarId(calendarId);
    setDuplicateTargetDepartmentId("");
    setShowDuplicateDialog(true);
  };

  const handleDuplicateCalendar = async () => {
    if (!duplicatingCalendarId || !duplicateTargetDepartmentId) {
      toast.error("Selecciona un departamento destino");
      return;
    }
    
    const sessionToken = getSessionToken();
    setShowDuplicateDialog(false);
    
    try {
      toast.loading("Duplicando calendario...");
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: { 
          action: 'duplicateCalendar', 
          sessionToken, 
          calendarId: duplicatingCalendarId,
          targetDepartmentId: duplicateTargetDepartmentId
        }
      });

      toast.dismiss();
      if (data?.success) {
        toast.success("Calendario duplicado");
        fetchAllCalendars();
      } else {
        toast.error(data?.error || "Error al duplicar calendario");
      }
    } catch (error) {
      console.error('Error duplicating calendar:', error);
      toast.dismiss();
      toast.error("Error al duplicar calendario");
    }
  };

  const handleToggleReviewed = async (calendarId: string, currentValue: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const sessionToken = getSessionToken();
    
    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: { 
          action: 'toggleCalendarReviewed', 
          sessionToken, 
          calendarId,
          isReviewed: !currentValue
        }
      });

      if (data?.success) {
        toast.success(!currentValue ? "Marcado como revisado" : "Desmarcado");
        setAllCalendars(allCalendars.map(c => 
          c.id === calendarId 
            ? { ...c, is_reviewed: !currentValue, reviewed_at: !currentValue ? new Date().toISOString() : null }
            : c
        ));
      } else {
        toast.error(data?.error || "Error al actualizar estado");
      }
    } catch (error) {
      console.error('Error toggling reviewed:', error);
      toast.error("Error al actualizar estado");
    }
  };

  const openEditDescriptionDialog = (calendarId: string, currentDescription: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCalendarId(calendarId);
    setEditingDescription(currentDescription || "");
    setShowEditDescriptionDialog(true);
  };

  const handleUpdateDescription = async () => {
    if (!editingCalendarId) return;
    
    const sessionToken = getSessionToken();
    
    try {
      const { data } = await supabase.functions.invoke('annual-calendar-operations', {
        body: { 
          action: 'updateCalendar', 
          sessionToken, 
          calendarId: editingCalendarId,
          description: editingDescription
        }
      });

      if (data?.success) {
        toast.success("Descripción actualizada");
        setAllCalendars(allCalendars.map(c => 
          c.id === editingCalendarId 
            ? { ...c, description: editingDescription || null }
            : c
        ));
        setShowEditDescriptionDialog(false);
      } else {
        toast.error(data?.error || "Error al actualizar descripción");
      }
    } catch (error) {
      console.error('Error updating description:', error);
      toast.error("Error al actualizar descripción");
    }
  };

  // Group calendars by department
  const calendarsByDept = allCalendars.reduce((acc, cal) => {
    const deptName = cal.departments?.name || "Sin departamento";
    if (!acc[deptName]) acc[deptName] = [];
    acc[deptName].push(cal);
    return acc;
  }, {} as Record<string, typeof allCalendars>);

  if (loading) {
    return <LoadingScreen />;
  }

  // LIST VIEW - Show all calendars
  if (showListView) {
    return (
      <div className="min-h-screen bg-background">
        <header className="glass-header">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(isAdmin ? "/admin" : "/manager")} className="h-8 w-8 rounded-full">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg font-semibold tracking-tight truncate">Calendarios Anuales</h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-light truncate">
                  {isAdmin ? "Gestión de calendarios de vacaciones" : "Visualización de calendarios"}
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
          {loadingCalendars ? (
            <LoadingPanel title="Cargando calendarios..." description="Obteniendo datos del servidor" />
          ) : Object.keys(calendarsByDept).length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center">
                <CalendarIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No hay calendarios creados</h3>
                <p className="text-muted-foreground mb-4">
                  {isAdmin 
                    ? "Crea tu primer calendario anual seleccionando un departamento" 
                    : "El administrador aún no ha creado calendarios"}
                </p>
                {isAdmin && (
                  <Button onClick={() => setShowListView(false)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Crear Calendario
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <DepartmentSearchSelect
                  departments={departments}
                  value={filterDepartmentId}
                  onChange={setFilterDepartmentId}
                  includeAll={true}
                  placeholder="Buscar departamento..."
                  className="w-full sm:w-64"
                />
                {isAdmin && (
                  <Button onClick={() => setShowListView(false)} className="w-full sm:w-auto">
                    <Plus className="h-4 w-4 mr-2" />
                    Nuevo Calendario
                  </Button>
                )}
              </div>
              
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Object.values(calendarsByDept).flat()
                  .filter(cal => filterDepartmentId === "all" || cal.department_id === filterDepartmentId)
                  .sort((a, b) => {
                  // Sort by department name first, then by year descending
                  const deptA = departments.find(d => d.id === a.department_id)?.name || '';
                  const deptB = departments.find(d => d.id === b.department_id)?.name || '';
                  if (deptA !== deptB) return deptA.localeCompare(deptB);
                  return b.year - a.year;
                }).map(cal => {
                  const deptName = departments.find(d => d.id === cal.department_id)?.name || 'Desconocido';
                  return (
                    <Card 
                      key={cal.id} 
                      className={`cursor-pointer hover:border-primary/50 transition-colors group ${cal.is_reviewed ? 'border-cyan-400/60 bg-cyan-400/10 ring-1 ring-cyan-400/30' : ''}`}
                      onClick={() => handleOpenCalendar(cal)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${cal.is_reviewed ? 'bg-cyan-400/20' : 'bg-primary/10'}`}>
                              {cal.is_reviewed ? (
                                <CheckCircle2 className="h-5 w-5 text-cyan-400" />
                              ) : (
                                <CalendarIcon className="h-5 w-5 text-primary" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-base text-primary truncate">{deptName}</p>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{cal.year}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {cal.auto_rotate_groups ? "· Rotación activa" : ""}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isAdmin && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className={`h-7 w-7 ${cal.is_reviewed ? 'text-cyan-400 opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                                    onClick={(e) => handleToggleReviewed(cal.id, cal.is_reviewed, e)}
                                  >
                                    {cal.is_reviewed ? (
                                      <CheckCircle2 className="h-4 w-4" />
                                    ) : (
                                      <Circle className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {cal.is_reviewed ? "Desmarcar como revisado" : "Marcar como revisado"}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {isAdmin && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={(e) => handleToggleReviewed(cal.id, cal.is_reviewed, e as any)}>
                                    {cal.is_reviewed ? (
                                      <>
                                        <Circle className="h-4 w-4 mr-2" />
                                        Desmarcar revisado
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        Marcar como revisado
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => openEditDescriptionDialog(cal.id, cal.description, e as any)}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Editar nota privada
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => openDuplicateDialog(cal.id, e as any)}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Duplicar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => handleDeleteCalendar(cal.id, e as any)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Eliminar
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                        {cal.description && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{cal.description}</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </main>

        {/* Edit Description Dialog */}
        <Dialog open={showEditDescriptionDialog} onOpenChange={setShowEditDescriptionDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar nota privada</DialogTitle>
              <DialogDescription>
                Esta nota es solo visible para administradores. No aparece en el calendario público ni en el PDF.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Textarea
                value={editingDescription}
                onChange={(e) => setEditingDescription(e.target.value)}
                placeholder="Nota privada para este calendario..."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDescriptionDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateDescription}>
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-header">
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="icon" onClick={handleBackToList} className="h-8 w-8 sm:h-9 sm:w-9">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-lg font-semibold tracking-tight truncate">
                  {departments.find(d => d.id === selectedDepartmentId)?.name || "Calendario Anual"}
                </h1>
                <Badge variant="secondary" className="text-xs font-medium">
                  {selectedYear}
                </Badge>
              </div>
              <p className="text-[10px] sm:text-sm text-muted-foreground truncate">
                {isAdmin ? "Gestión de calendario" : "Visualización de calendario"}
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Controls */}
        <Card>
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 sm:items-end">
              <div className="grid grid-cols-2 sm:flex gap-3 sm:gap-4">
                <div className="space-y-1 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">Año</Label>
                  <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                    <SelectTrigger className="w-full sm:w-[120px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map(year => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">Departamento</Label>
                  {isAdmin ? (
                    <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                      <SelectTrigger className="w-full sm:w-[200px] h-9">
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableDepartments.map(dept => (
                          <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="px-3 py-2 h-9 rounded-md border border-input bg-muted text-foreground font-medium flex items-center text-sm truncate">
                      {departments.find(d => d.id === selectedDepartmentId)?.name || "—"}
                    </div>
                  )}
                </div>
              </div>

              {!loadingCalendar && !calendar && isAdmin && selectedDepartmentId && (
                <Button onClick={handleCreateCalendar} disabled={saving} size="sm" className="h-9 w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Calendario
                </Button>
              )}

              {!loadingCalendar && calendar && (
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-start">
                  {/* Public calendar link */}
                  {departments.find(d => d.id === selectedDepartmentId) && (
                    <a 
                      href={`/calendario/${departments.find(d => d.id === selectedDepartmentId)?.name?.toLowerCase().replace(/\s+/g, '-')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm" className="h-9 gap-2">
                        <ExternalLink className="h-4 w-4" />
                        <span className="hidden sm:inline">Ver Calendario</span>
                      </Button>
                    </a>
                  )}
                  <div className="flex items-center gap-2">
                    <Label htmlFor="pdf-mode" className="text-[10px] sm:text-xs whitespace-nowrap">Modo claro</Label>
                    <Switch
                      id="pdf-mode"
                      checked={pdfLightMode}
                      onCheckedChange={setPdfLightMode}
                    />
                  </div>
                  <Button variant="outline" onClick={() => handleDownloadPDF()} disabled={saving} size="sm" className="h-9">
                    <Download className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Descargar PDF</span>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {loadingCalendar && (
          <Card className="border-dashed">
            <CardContent className="py-0">
              <LoadingPanel 
                title="Cargando calendario…" 
                description="Estamos cargando los datos del calendario anual."
              />
            </CardContent>
          </Card>
        )}

        {!loadingCalendar && calendar && (
          <>
            {/* Admin Controls */}
            {isAdmin && (
              <>
              <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {/* Settings Card */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Configuración
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-primary" />
                        Texto informativo
                      </Label>
                      <Textarea
                        value={infoText}
                        onChange={(e) => setInfoText(e.target.value)}
                        placeholder="Mensaje que verán los trabajadores..."
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground">
                        Este texto se traducirá automáticamente a árabe y francés según el idioma del trabajador
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Rotación automática anual</Label>
                        <p className="text-xs text-muted-foreground">
                          Al generar el siguiente año, los grupos rotarán
                        </p>
                      </div>
                      <Switch checked={autoRotate} onCheckedChange={setAutoRotate} />
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Button onClick={handleSaveSettings} disabled={saving} className="flex-1">
                          <Save className="h-4 w-4 mr-2" />
                          Guardar
                        </Button>
                        <Button variant="outline" onClick={handleGenerateNextYear} disabled={saving}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Generar {selectedYear + 1}
                        </Button>
                      </div>
                      
                    </div>
                  </CardContent>
                </Card>

                {/* Custom Day Types Card */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Categorías de Leyenda
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Edita colores o añade nuevas categorías
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {/* System types (Festivo, Vacaciones Generales) - show with override colors if available */}
                      {DEFAULT_SYSTEM_TYPES
                        .filter(sysType => !hiddenSystemTypes.includes(sysType.system_type))
                        .map(sysType => {
                        // Check if there's a custom override for this system type
                        const override = customDayTypes.find(t => t.system_type === sysType.system_type);
                        const displayColor = override?.color || sysType.color;
                        const displayName = override?.name || sysType.name;
                        
                        return (
                          <div 
                            key={sysType.system_type}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm text-white"
                            style={{ backgroundColor: displayColor }}
                          >
                            <span>{displayName}</span>
                            <button 
                              onClick={() => {
                                setEditingSystemType(override ? { ...override, system_type: sysType.system_type } : sysType);
                                setNewCustomTypeName(displayName);
                                setNewCustomTypeColor(displayColor);
                                setShowEditCustomTypeDialog(true);
                              }}
                              className="hover:bg-white/20 rounded-full p-0.5"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button 
                              onClick={async () => {
                                if (override) {
                                  // Delete the override
                                  await handleDeleteCustomDayType(override.id);
                                }
                                // Hide this system type
                                setHiddenSystemTypes(prev => [...prev, sysType.system_type]);
                                toast.success(`Categoría "${displayName}" eliminada`);
                              }}
                              className="hover:bg-white/20 rounded-full p-0.5"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                      
                      {/* Custom types (non-system) */}
                      {customDayTypes.filter(t => !t.system_type).map(type => (
                        <div 
                          key={type.id} 
                          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm text-white"
                          style={{ backgroundColor: type.color }}
                        >
                          <span>{type.name}</span>
                          <button 
                            onClick={() => openEditCustomTypeDialog(type)}
                            className="hover:bg-white/20 rounded-full p-0.5"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button 
                            onClick={() => handleDeleteCustomDayType(type.id)}
                            className="hover:bg-white/20 rounded-full p-0.5"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowCreateCustomTypeDialog(true)}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Nueva Categoría
                    </Button>
                  </CardContent>
                </Card>

                {/* Groups Card */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Grupos Vacacionales
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Grupos para vacaciones rotativas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {workGroups.map(group => {
                        const assignedTeams = getTeamsForGroup(group.id);
                        const teamNames = assignedTeams.map(t => t.name).join(', ');
                        const displayText = teamNames ? `${group.name}: ${teamNames}` : group.name;
                        return (
                          <div 
                            key={group.id} 
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm text-white"
                            style={{ backgroundColor: group.color }}
                          >
                            <span>
                              {displayText}
                            </span>
                            <button 
                              onClick={() => openEditGroupDialog(group)}
                              className="hover:bg-white/20 rounded-full p-0.5"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button 
                              onClick={() => handleDeleteGroup(group.id)}
                              className="hover:bg-white/20 rounded-full p-0.5"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowCreateGroupDialog(true)}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Nuevo Grupo
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Simplified Group Days Summary */}
              {workGroups.length > 0 && (
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/50">
                  <span className="font-medium">Días de vacaciones:</span>
                  {workGroups.map(group => {
                    const assignedTeams = getTeamsForGroup(group.id);
                    const teamNames = assignedTeams.map(t => t.name).join(', ');
                    const displayText = teamNames ? `${group.name}: ${teamNames}` : group.name;
                    const vacGenCount = calendarDays.filter(d => d.day_type === 'vacaciones_generales').length;
                    const groupCount = calendarDays.filter(d => 
                      d.day_type === 'vacaciones_grupo' && (d.group_id === group.id || d.group_id_2 === group.id)
                    ).length;
                    const totalCount = groupCount + vacGenCount;
                    return (
                      <div key={group.id} className="flex items-center gap-1.5">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                        <span>{displayText}: <strong className="text-foreground">{totalCount}</strong></span>
                      </div>
                    );
                  })}
                </div>
              )}
              </>
            )}

            {/* Selection Actions */}
            {isAdmin && selectedDates.length > 0 && (
              <Card className="border-primary/50 bg-primary/5">
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="text-sm font-medium">
                      {selectedDates.length} día{selectedDates.length !== 1 ? 's' : ''} seleccionado{selectedDates.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setShowDayTypeDialog(true)}>
                        Cambiar tipo de día
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedDates([])}>
                        Limpiar selección
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Blocked Days by Concurrency Panel */}
            {isAdmin && (blockedDaysByConcurrency.length > 0 || dayOverrides.length > 0) && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Días Bloqueados por Concurrencia
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Días que han alcanzado el límite de trabajadores. Haz clic para desbloquear manualmente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  <div className="flex flex-wrap gap-2">
                    {blockedDaysByConcurrency.map(dateStr => {
                      const isOverridden = dayOverrides.some(o => o.date === dateStr && o.is_unblocked);
                      const [year, month, day] = dateStr.split('-');
                      const displayDate = `${parseInt(day)}/${parseInt(month)}`;
                      
                      return (
                        <button
                          key={dateStr}
                          onClick={() => handleToggleDayOverride(dateStr, !isOverridden)}
                          disabled={saving}
                          className={`
                            px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5
                            ${isOverridden 
                              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/30' 
                              : 'bg-destructive/20 text-destructive border border-destructive/30 hover:bg-destructive/30'
                            }
                          `}
                        >
                          {isOverridden ? (
                            <Unlock className="h-3 w-3" />
                          ) : (
                            <Lock className="h-3 w-3" />
                          )}
                          {displayDate}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Lock className="h-3 w-3 text-destructive" />
                      <span>Bloqueado</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Unlock className="h-3 w-3 text-amber-500" />
                      <span>Desbloqueado manualmente</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-destructive/20">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setShowBlockingHistory(!showBlockingHistory)}
                      className="text-xs"
                    >
                      <History className="h-3 w-3 mr-1" />
                      {showBlockingHistory ? 'Ocultar historial' : 'Ver historial de bloqueos'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Blocking History Panel */}
            {isAdmin && showBlockingHistory && (
              <BlockingHistoryPanel 
                sessionToken={getSessionToken() || ''} 
                departmentId={selectedDepartmentId}
              />
            )}

            {/* Description Display */}
            {description && !isAdmin && (
              <Card className="bg-muted/30">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Work groups with custom titles and teams */}
            {workGroups.length > 0 && (
              <Card>
                <CardHeader className="py-2 sm:py-3">
                  <CardTitle className="text-xs sm:text-sm flex items-center gap-2">
                    <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                    Grupos Vacacionales
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 pb-3 sm:pb-4">
                  <div className="flex flex-wrap gap-3 sm:gap-4 text-[10px] sm:text-xs">
                    {workGroups.map(group => {
                      const assignedTeams = getTeamsForGroup(group.id);
                      const teamNames = assignedTeams.map(t => t.name).join(', ');
                      const displayText = teamNames ? `${group.name}: ${teamNames}` : group.name;
                      return (
                        <div key={group.id} className="flex items-center gap-2">
                          <div className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                          <span>{displayText}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Friday = Sunday notice */}
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="py-3">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    <strong>Importante:</strong> Cualquier día marcado en viernes equivale al domingo de esa semana.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Calendar Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
              {Array.from({ length: 12 }, (_, i) => renderMonth(i))}
            </div>

            {isAdmin && (
              <p className="text-xs text-muted-foreground text-center">
                Haz clic en un día para seleccionarlo. Mantén Shift para seleccionar un rango.
              </p>
            )}
          </>
        )}

        {!calendar && selectedDepartmentId && (
          <Card className="py-12">
            <CardContent className="text-center">
              <CalendarIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No hay calendario para {selectedYear}</h3>
              <p className="text-muted-foreground mb-4">
                {isAdmin 
                  ? "Crea un calendario para este departamento y año" 
                  : "El administrador aún no ha creado un calendario para este período"}
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Day Type Dialog */}
      <Dialog open={showDayTypeDialog} onOpenChange={setShowDayTypeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar tipo de día</DialogTitle>
            <DialogDescription>
              Selecciona el tipo de día para los {selectedDates.length} días seleccionados
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tipo de día</Label>
              <Select value={selectedDayType} onValueChange={(v) => {
                setSelectedDayType(v as any);
                setSelectedCustomDayTypeId(null);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DAY_TYPES).map(([key, value]) => (
                    <SelectItem key={key} value={key}>{value.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDayType === 'vacaciones_grupo' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Grupo principal</Label>
                  <Select value={selectedGroupId || ""} onValueChange={setSelectedGroupId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar grupo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {workGroups.map(group => (
                        <SelectItem key={group.id} value={group.id}>
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded" style={{ backgroundColor: group.color }} />
                            {group.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Segundo grupo (opcional)</Label>
                  <Select value={selectedGroupId2 || "none"} onValueChange={(v) => setSelectedGroupId2(v === "none" ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin segundo grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin segundo grupo</SelectItem>
                      {workGroups.filter(g => g.id !== selectedGroupId).map(group => (
                        <SelectItem key={group.id} value={group.id}>
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded" style={{ backgroundColor: group.color }} />
                            {group.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Selecciona un segundo grupo para mostrar un día compartido (círculo dividido)
                  </p>
                </div>
              </div>
            )}

            {selectedDayType === 'festivo' && (
              <>
                {customDayTypes.length > 0 && (
                  <div className="space-y-2">
                    <Label>Categoría (opcional)</Label>
                    <Select value={selectedCustomDayTypeId || "none"} onValueChange={(v) => setSelectedCustomDayTypeId(v === "none" ? null : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Festivo estándar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded bg-red-500" />
                            Festivo estándar (rojo)
                          </div>
                        </SelectItem>
                        {customDayTypes.map(type => (
                          <SelectItem key={type.id} value={type.id}>
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded" style={{ backgroundColor: type.color }} />
                              {type.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Leyenda (opcional)</Label>
                  <Input
                    value={legendText}
                    onChange={(e) => setLegendText(e.target.value)}
                    placeholder="Ej: Navidad, Fiesta local..."
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDayTypeDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleApplyDayType} disabled={saving}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Group Dialog */}
      <Dialog open={showCreateGroupDialog} onOpenChange={setShowCreateGroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Grupo de Trabajo</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre del grupo</Label>
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Ej: Grupo 1, Turno A..."
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={newGroupColor} 
                  onChange={(e) => setNewGroupColor(e.target.value)}
                  className="h-10 w-20 rounded cursor-pointer"
                />
                <div 
                  className="h-10 flex-1 rounded flex items-center justify-center text-white font-medium"
                  style={{ backgroundColor: newGroupColor }}
                >
                  Vista previa
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateGroupDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateGroup} disabled={saving || !newGroupName.trim()}>
              Crear Grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Work Group Dialog */}
      <Dialog open={showEditGroupDialog} onOpenChange={(open) => {
        setShowEditGroupDialog(open);
        if (!open) {
          setEditingGroup(null);
          setNewGroupName("");
          setSelectedTeamIds([]);
          setGroupMaxConcurrentWorkers(null);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Grupo de Trabajo</DialogTitle>
            <DialogDescription>
              Modifica el nombre, color y equipos asignados al grupo
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre del grupo</Label>
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Ej: Grupo 1, Turno A..."
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={newGroupColor} 
                  onChange={(e) => setNewGroupColor(e.target.value)}
                  className="h-10 w-20 rounded cursor-pointer"
                />
                <div 
                  className="h-10 flex-1 rounded flex items-center justify-center text-white font-medium"
                  style={{ backgroundColor: newGroupColor }}
                >
                  Vista previa
                </div>
              </div>
            </div>

            {/* Manual concurrency limit for this group */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
              <div className="space-y-1">
                <Label htmlFor="groupMaxConcurrent" className="text-sm font-medium text-amber-600">
                  Límite manual de ausencias simultáneas (opcional)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Si se configura, este valor sustituye al cálculo automático para este grupo. Bloquea el día cuando X trabajadores de este grupo ya lo han solicitado.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  id="groupMaxConcurrent"
                  type="number"
                  min="1"
                  max="100"
                  placeholder="Ej: 3"
                  value={groupMaxConcurrentWorkers ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGroupMaxConcurrentWorkers(val === "" ? null : parseInt(val, 10));
                  }}
                  className="rounded-xl w-32"
                />
                <span className="text-sm text-muted-foreground">personas máximo por día</span>
                {groupMaxConcurrentWorkers !== null && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setGroupMaxConcurrentWorkers(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Borrar
                  </Button>
                )}
              </div>
            </div>

            {/* Info about automatic concurrency calculation */}
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-sm text-blue-400">
              <p className="font-medium mb-1">Cálculo automático (si no hay límite manual)</p>
              <p className="text-xs opacity-80">
                Número de trabajadores × días libres disponibles ÷ días del periodo vacacional, redondeado al alza.
              </p>
            </div>

            {/* Free Days Deduction */}
            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl space-y-2">
              <div className="space-y-1">
                <Label htmlFor="groupFreeDaysDeduction" className="text-sm font-medium text-orange-600">
                  Restar días de libre configuración (opcional)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Reduce los días que los trabajadores de este grupo pueden elegir libremente. Por ejemplo: si tienen 6,5 días calculados y restas 3, solo podrán elegir 3,5.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  id="groupFreeDaysDeduction"
                  type="number"
                  min="0"
                  max="30"
                  step="0.5"
                  placeholder="Ej: 3"
                  value={groupFreeDaysDeduction ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGroupFreeDaysDeduction(val === "" ? null : parseFloat(val));
                  }}
                  className="rounded-xl w-32"
                />
                <span className="text-sm text-muted-foreground">días a restar</span>
                {groupFreeDaysDeduction !== null && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setGroupFreeDaysDeduction(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Borrar
                  </Button>
                )}
              </div>
            </div>

            {/* Worker Teams Assignment */}
            <div className="space-y-2">
              <Label>Equipos de trabajo asignados</Label>
              <p className="text-xs text-muted-foreground">
                Selecciona los equipos que pertenecen a este grupo vacacional
              </p>
              {workerTeams.length === 0 ? (
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                  No hay equipos de trabajo creados. Crea equipos en la pestaña "Grupos" del menú de administración.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {workerTeams.map(team => {
                    const isSelected = selectedTeamIds.includes(team.id);
                    // Check if this team is assigned to another group
                    const otherGroupAssignment = workGroupTeams.find(
                      wgt => wgt.worker_team_id === team.id && wgt.work_group_id !== editingGroup?.id
                    );
                    const otherGroup = otherGroupAssignment 
                      ? workGroups.find(g => g.id === otherGroupAssignment.work_group_id)
                      : null;

                    return (
                      <button
                        key={team.id}
                        onClick={() => toggleTeamSelection(team.id)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border-2 ${
                          isSelected 
                            ? 'text-white border-transparent' 
                            : 'bg-muted/50 text-foreground border-transparent hover:border-primary/50'
                        }`}
                        style={isSelected ? { backgroundColor: newGroupColor } : {}}
                      >
                        {team.name}
                        {otherGroup && !isSelected && (
                          <span 
                            className="ml-1 w-2 h-2 rounded-full inline-block" 
                            style={{ backgroundColor: otherGroup.color }}
                            title={`Asignado a: ${otherGroup.name}`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedTeamIds.length > 0 && (
                <div className="text-xs text-muted-foreground mt-2">
                  {selectedTeamIds.length} equipo{selectedTeamIds.length !== 1 ? 's' : ''} seleccionado{selectedTeamIds.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditGroupDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateGroup} disabled={saving || !newGroupName.trim()}>
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Custom Day Type Dialog */}
      <Dialog open={showCreateCustomTypeDialog} onOpenChange={setShowCreateCustomTypeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Categoría de Leyenda</DialogTitle>
            <DialogDescription>
              Crea una nueva categoría para marcar días especiales
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre de la categoría</Label>
              <Input
                value={newCustomTypeName}
                onChange={(e) => setNewCustomTypeName(e.target.value)}
                placeholder="Ej: Festivo Local, Puente, Cierre..."
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={newCustomTypeColor} 
                  onChange={(e) => setNewCustomTypeColor(e.target.value)}
                  className="h-10 w-20 rounded cursor-pointer"
                />
                <div 
                  className="h-10 flex-1 rounded flex items-center justify-center text-white font-medium"
                  style={{ backgroundColor: newCustomTypeColor }}
                >
                  Vista previa
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateCustomTypeDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateCustomDayType} disabled={saving || !newCustomTypeName.trim()}>
              Crear Categoría
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Custom Day Type Dialog */}
      <Dialog open={showEditCustomTypeDialog} onOpenChange={setShowEditCustomTypeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Categoría</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre de la categoría</Label>
              <Input
                value={newCustomTypeName}
                onChange={(e) => setNewCustomTypeName(e.target.value)}
                placeholder="Ej: Festivo Local, Puente, Cierre..."
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={newCustomTypeColor} 
                  onChange={(e) => setNewCustomTypeColor(e.target.value)}
                  className="h-10 w-20 rounded cursor-pointer"
                />
                <div 
                  className="h-10 flex-1 rounded flex items-center justify-center text-white font-medium"
                  style={{ backgroundColor: newCustomTypeColor }}
                >
                  Vista previa
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditCustomTypeDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateCustomDayType} disabled={saving || !newCustomTypeName.trim()}>
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Calendar Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicar Calendario</DialogTitle>
            <DialogDescription>
              Selecciona el departamento destino para la copia
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Departamento destino</Label>
              <Select value={duplicateTargetDepartmentId} onValueChange={setDuplicateTargetDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar departamento" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map(dept => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleDuplicateCalendar} disabled={!duplicateTargetDepartmentId}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loading overlay */}
      {saving && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Procesando...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnualCalendar;
