 import { useState, useEffect, useMemo } from "react";
 import { supabase } from "@/integrations/supabase/client";
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { Switch } from "@/components/ui/switch";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
 import { toast } from "sonner";
import { Plus, Users, Clock, RotateCcw, Trash2, Edit2, ChevronDown, ChevronUp, RefreshCw, Save, AlertCircle, User, CalendarDays, Download, Sun, Moon, FileText } from "lucide-react";
 import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getWeek, startOfWeek, addDays } from "date-fns";
import { setISOWeek, getISOWeekYear } from "date-fns";
import { WorkerSearchSelect } from "@/components/WorkerSearchSelect";
 
 // Helper to auto-format time input on blur (e.g., "6" -> "06:00", "14" -> "14:00")
 const formatTimeOnBlur = (value: string): string | null => {
   if (!value || value.trim() === "") return null;
   
   // Remove non-digit and colon chars
   let cleaned = value.replace(/[^\d:]/g, "");
   
   // If already in HH:MM format, just pad if needed
   if (cleaned.includes(":")) {
     const [h, m] = cleaned.split(":");
     const hours = h.padStart(2, "0").slice(0, 2);
     const mins = (m || "00").padStart(2, "0").slice(0, 2);
     return `${hours}:${mins}`;
   }
   
   // Just digits - interpret as hours
   const num = parseInt(cleaned, 10);
   if (isNaN(num)) return null;
   
   // Clamp to 0-23
   const clamped = Math.max(0, Math.min(23, num));
   return `${String(clamped).padStart(2, "0")}:00`;
 };
 
 const DAYS = [
   { key: "0", short: "D", full: "Domingo" },
   { key: "1", short: "L", full: "Lunes" },
   { key: "2", short: "M", full: "Martes" },
   { key: "3", short: "X", full: "Miércoles" },
   { key: "4", short: "J", full: "Jueves" },
   { key: "5", short: "V", full: "Viernes" },
   { key: "6", short: "S", full: "Sábado" },
 ] as const;
 
 interface ShiftConfig {
   id: string;
   name: string;
   shift_key: string;
   start_time: string | null;
   end_time: string | null;
   color: string;
   is_rest: boolean;
 }
 
 interface ScheduleEntry {
   type: string;
   start: string | null;
   end: string | null;
  start2?: string | null;
  end2?: string | null;
 }
 
 type ScheduleTemplate = Record<string, ScheduleEntry>;
 
 interface RotationGroup {
   id: string;
   name: string;
   department_id: string;
   rotation_enabled: boolean;
   base_week: number;
   base_year: number;
 }
 
 interface PersonalSchedule {
   id: string;
   worker_id: string;
   rotation_group_id: string | null;
   rotation_position: number;
   schedule_template: ScheduleTemplate;
   is_active: boolean;
   notes: string | null;
   worker?: {
     id: string;
     name: string;
     worker_number: string;
   };
 }
 
 interface Worker {
   id: string;
   name: string;
   worker_number: string;
 }
 
 interface PersonalSchedulesPanelProps {
   departmentId: string;
   departmentName: string;
   shifts: ShiftConfig[];
   onClose?: () => void;
 }
 
 export const PersonalSchedulesPanel = ({
   departmentId,
   departmentName,
   shifts,
   onClose,
 }: PersonalSchedulesPanelProps) => {
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [rotationGroups, setRotationGroups] = useState<RotationGroup[]>([]);
   const [personalSchedules, setPersonalSchedules] = useState<PersonalSchedule[]>([]);
   const [workers, setWorkers] = useState<Worker[]>([]);
   
   // Dialogs
   const [createGroupOpen, setCreateGroupOpen] = useState(false);
   const [addWorkerOpen, setAddWorkerOpen] = useState(false);
   const [editScheduleOpen, setEditScheduleOpen] = useState(false);
   
   const [newGroupName, setNewGroupName] = useState("");
   const [selectedWorker, setSelectedWorker] = useState<string>("");
   const [selectedGroupForWorker, setSelectedGroupForWorker] = useState<string>("");
   const [currentSchedule, setCurrentSchedule] = useState<PersonalSchedule | null>(null);
   const [editingTemplate, setEditingTemplate] = useState<ScheduleTemplate>({});
   
   // Expanded groups state
   const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [pdfModeDialogOpen, setPdfModeDialogOpen] = useState(false);
  const [pdfCustomTitle, setPdfCustomTitle] = useState("");
  const [pdfCustomNotes, setPdfCustomNotes] = useState("");

  // Week info for PDF
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const currentWeekNumber = getWeek(new Date(), { weekStartsOn: 1 });
  const currentYear = new Date().getFullYear();
  const [pdfStartWeek, setPdfStartWeek] = useState<number>(currentWeekNumber);
 
   const fetchData = async () => {
     const sessionToken = localStorage.getItem("manager_session_token");
     if (!sessionToken) return;
 
     setLoading(true);
     try {
       const { data, error } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "getPersonalSchedules",
           sessionToken,
           data: { departmentId },
         },
       });
 
       if (error || !data?.success) {
         console.error("Error fetching personal schedules:", data?.error || error);
         toast.error("Error al cargar horarios personalizados");
         return;
       }
 
       setRotationGroups(data.rotationGroups || []);
       setPersonalSchedules(data.personalSchedules || []);
      // Workers are now fetched by the WorkerSearchSelect component
      setWorkers(data.personalSchedules?.map((ps: PersonalSchedule) => ps.worker).filter(Boolean) || []);
     } catch (err) {
       console.error("Error:", err);
       toast.error("Error de conexión");
     } finally {
       setLoading(false);
     }
   };
 
   useEffect(() => {
     fetchData();
   }, [departmentId]);
 
   const workersWithSchedule = useMemo(() => {
     return new Set(personalSchedules.map(ps => ps.worker_id));
   }, [personalSchedules]);
 
   const availableWorkers = useMemo(() => {
     return workers.filter(w => !workersWithSchedule.has(w.id));
   }, [workers, workersWithSchedule]);
 
   const getSchedulesForGroup = (groupId: string | null) => {
     return personalSchedules.filter(ps => ps.rotation_group_id === groupId)
       .sort((a, b) => a.rotation_position - b.rotation_position);
   };
 
   const schedulesWithoutGroup = useMemo(() => getSchedulesForGroup(null), [personalSchedules]);
 
   const handleCreateGroup = async () => {
     if (!newGroupName.trim()) {
       toast.error("Introduce un nombre para el grupo");
       return;
     }
 
     const sessionToken = localStorage.getItem("manager_session_token");
     if (!sessionToken) return;
 
     setSaving(true);
     try {
       const { data, error } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "createPersonalScheduleRotationGroup",
           sessionToken,
           data: {
             departmentId,
             name: newGroupName.trim(),
           },
         },
       });
 
       if (error || !data?.success) {
         toast.error(data?.error || "Error al crear grupo");
         return;
       }
 
       toast.success("Grupo de rotación creado");
       setNewGroupName("");
       setCreateGroupOpen(false);
       fetchData();
     } finally {
       setSaving(false);
     }
   };
 
   const handleAddWorkerSchedule = async () => {
     if (!selectedWorker) {
       toast.error("Selecciona un trabajador");
       return;
     }
 
     const sessionToken = localStorage.getItem("manager_session_token");
     if (!sessionToken) return;
 
     setSaving(true);
     try {
       const { data, error } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "createPersonalWorkSchedule",
           sessionToken,
           data: {
             workerId: selectedWorker,
             rotationGroupId: selectedGroupForWorker || null,
           },
         },
       });
 
       if (error || !data?.success) {
         toast.error(data?.error || "Error al añadir trabajador");
         return;
       }
 
       toast.success("Horario personalizado creado");
       setSelectedWorker("");
       setSelectedGroupForWorker("");
       setAddWorkerOpen(false);
       fetchData();
     } finally {
       setSaving(false);
     }
   };
 
   const openEditSchedule = (schedule: PersonalSchedule) => {
     setCurrentSchedule(schedule);
     setEditingTemplate(schedule.schedule_template || {});
     setEditScheduleOpen(true);
   };
 
   const handleSaveScheduleTemplate = async () => {
     if (!currentSchedule) return;
 
     const sessionToken = localStorage.getItem("manager_session_token");
     if (!sessionToken) return;
 
     setSaving(true);
     try {
       const { data, error } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "updatePersonalWorkSchedule",
           sessionToken,
           data: {
             scheduleId: currentSchedule.id,
             scheduleTemplate: editingTemplate,
           },
         },
       });
 
       if (error || !data?.success) {
         toast.error(data?.error || "Error al guardar");
         return;
       }
 
       toast.success("Horario guardado");
       setEditScheduleOpen(false);
       fetchData();
     } finally {
       setSaving(false);
     }
   };
 
   const handleDeleteSchedule = async (scheduleId: string) => {
     if (!confirm("¿Eliminar este horario personalizado?")) return;
 
     const sessionToken = localStorage.getItem("manager_session_token");
     if (!sessionToken) return;
 
     try {
       const { data, error } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "deletePersonalWorkSchedule",
           sessionToken,
           data: { scheduleId },
         },
       });
 
       if (error || !data?.success) {
         toast.error(data?.error || "Error al eliminar");
         return;
       }
 
       toast.success("Horario eliminado");
       fetchData();
     } catch (err) {
       toast.error("Error de conexión");
     }
   };
 
   const handleDeleteGroup = async (groupId: string) => {
     if (!confirm("¿Eliminar este grupo de rotación? Los horarios se desasociarán pero no se eliminarán.")) return;
 
     const sessionToken = localStorage.getItem("manager_session_token");
     if (!sessionToken) return;
 
     try {
       const { data, error } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "deletePersonalScheduleRotationGroup",
           sessionToken,
           data: { groupId },
         },
       });
 
       if (error || !data?.success) {
         toast.error(data?.error || "Error al eliminar");
         return;
       }
 
       toast.success("Grupo eliminado");
       fetchData();
     } catch (err) {
       toast.error("Error de conexión");
     }
   };
 
   const handleToggleRotation = async (groupId: string, enabled: boolean) => {
     const sessionToken = localStorage.getItem("manager_session_token");
     if (!sessionToken) return;
 
     try {
       const { data, error } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "updatePersonalScheduleRotationGroup",
           sessionToken,
           data: { groupId, rotationEnabled: enabled },
         },
       });
 
       if (error || !data?.success) {
         toast.error(data?.error || "Error al actualizar");
         return;
       }
 
       toast.success(enabled ? "Rotación activada" : "Rotación desactivada");
       fetchData();
     } catch (err) {
       toast.error("Error de conexión");
     }
   };
 
   const handleMoveWorkerToGroup = async (scheduleId: string, newGroupId: string | null) => {
     const sessionToken = localStorage.getItem("manager_session_token");
     if (!sessionToken) return;
 
     try {
       const { data, error } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "updatePersonalWorkSchedule",
           sessionToken,
           data: {
             scheduleId,
             rotationGroupId: newGroupId,
           },
         },
       });
 
       if (error || !data?.success) {
         toast.error(data?.error || "Error al mover");
         return;
       }
 
       toast.success("Trabajador movido");
       fetchData();
     } catch (err) {
       toast.error("Error de conexión");
     }
   };
 
   const toggleGroupExpanded = (groupId: string) => {
     setExpandedGroups(prev => {
       const next = new Set(prev);
       if (next.has(groupId)) {
         next.delete(groupId);
       } else {
         next.add(groupId);
       }
       return next;
     });
   };
 
  const generatePdf = (isDark: boolean) => {
    if (personalSchedules.length === 0) {
      toast.error("No hay horarios personalizados para exportar");
      return;
    }

    // Calculate week start based on selected pdfStartWeek
    const selectedWeekStart = startOfWeek(setISOWeek(new Date(currentYear, 0, 4), pdfStartWeek), { weekStartsOn: 1 });
    const selectedWeekNumber = pdfStartWeek;
    const selectedYear = getISOWeekYear(selectedWeekStart);

    const weekRange = {
      start: addDays(selectedWeekStart, -1), // Sunday of this week
      end: addDays(selectedWeekStart, 5), // Saturday
    };

    const formatDateShort = (date: Date): string => {
      return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
    };

    // Calculate which template each worker uses this week (with rotation)
    const getWorkerScheduleForWeek = (schedule: PersonalSchedule): ScheduleTemplate => {
      const rotationGroup = rotationGroups.find(g => g.id === schedule.rotation_group_id);
      
      if (!rotationGroup || !rotationGroup.rotation_enabled) {
        return schedule.schedule_template;
      }

      const groupSchedules = personalSchedules
        .filter(ps => ps.rotation_group_id === schedule.rotation_group_id)
        .sort((a, b) => a.rotation_position - b.rotation_position);

      if (groupSchedules.length <= 1) {
        return schedule.schedule_template;
      }

      // Use the user-selected pdfStartWeek for rotation calculation
      const baseWeek = pdfStartWeek;
      const baseYear = selectedYear;
      const weeksSinceBase = (selectedYear - baseYear) * 52 + (selectedWeekNumber - baseWeek);
      const rotationOffset = ((weeksSinceBase % groupSchedules.length) + groupSchedules.length) % groupSchedules.length;

      const workerPosition = groupSchedules.findIndex(s => s.id === schedule.id);
      if (workerPosition < 0) return schedule.schedule_template;

      const templateIndex = (workerPosition - rotationOffset + groupSchedules.length) % groupSchedules.length;
      return groupSchedules[templateIndex]?.schedule_template || schedule.schedule_template;
    };

    // Check if any rotation is active
    const hasActiveRotation = rotationGroups.some(g => {
      const groupSchedules = personalSchedules.filter(ps => ps.rotation_group_id === g.id);
      return g.rotation_enabled && groupSchedules.length >= 2;
    });

    // Build rows data
    const rows = personalSchedules.map(schedule => {
      const worker = schedule.worker || workers.find(w => w.id === schedule.worker_id);
      const template = getWorkerScheduleForWeek(schedule);
      const group = rotationGroups.find(g => g.id === schedule.rotation_group_id);
      
      return {
        name: worker?.name || "Trabajador",
        number: worker?.worker_number || "—",
        groupName: group?.name || null,
        rotationEnabled: group?.rotation_enabled || false,
        template,
      };
    });

    // Sort by group, then by name
    rows.sort((a, b) => {
      if (a.groupName && !b.groupName) return -1;
      if (!a.groupName && b.groupName) return 1;
      if (a.groupName && b.groupName && a.groupName !== b.groupName) {
        return a.groupName.localeCompare(b.groupName);
      }
      return a.name.localeCompare(b.name);
    });

    const dayNames = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
    const getDayDate = (dayIdx: number) => {
      // dayIdx 0 = Sunday (one day before Monday start)
      if (dayIdx === 0) return addDays(selectedWeekStart, -1);
      return addDays(selectedWeekStart, dayIdx - 1);
    };

    const getShiftInfo = (shiftKey: string) => {
      const shift = shifts.find(s => s.shift_key === shiftKey);
      return shift || { name: shiftKey, color: "#93d600", is_rest: false, start_time: null, end_time: null };
    };

    // Theme colors matching group schedule PDF
    const bgColor = isDark ? "#000000" : "#ffffff";
    const textColor = isDark ? "#ffffff" : "#171717";
    const mutedColor = isDark ? "#a3a3a3" : "#737373";
    const borderColor = isDark ? "#262626" : "#e5e5e5";
    const rowBg = isDark ? "#0a0a0a" : "#ffffff";
    const primaryGreen = "#93d600";
    const headerBg = isDark ? "#0a0a0a" : "#fafafa";

    // Use custom title or fallback to department name
    const pdfTitle = pdfCustomTitle.trim() || departmentName;
    const pdfFileName = `Horario ${pdfTitle} - Semana ${selectedWeekNumber}`;

    // Auto info text based on rotation status
    const autoInfoText = hasActiveRotation
      ? "Los trabajadores con rotación activa intercambian sus horarios automáticamente cada semana. Ten en cuenta que cada semana le tocará a una persona diferente según el orden de rotación establecido."
      : "";

    const printContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="author" content="VerdNatura">
  <meta name="description" content="${pdfFileName}">
  <title>${pdfFileName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { 
      size: landscape; 
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      font-family: 'Poppins', system-ui, -apple-system, sans-serif;
      background: ${bgColor} !important;
      color: ${textColor};
      font-size: 11px;
      letter-spacing: -0.01em;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .page-container {
      padding: 40px 50px;
      min-height: 100vh;
      background: ${bgColor} !important;
    }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 28px;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .logo {
      height: 40px;
      width: auto;
    }
    .title-block {
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .title {
      font-size: 20px;
      font-weight: 600;
      color: ${textColor};
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-size: 12px;
      color: ${primaryGreen};
      font-weight: 300;
      margin-top: -2px;
    }
    .week-info {
      text-align: right;
    }
    .week-number {
      font-size: 22px;
      font-weight: 600;
      color: ${primaryGreen};
      letter-spacing: -0.02em;
      line-height: 1;
    }
    .week-dates {
      font-size: 11px;
      color: ${mutedColor};
      font-weight: 400;
      margin-top: 4px;
    }
    
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin-top: 8px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid ${borderColor};
    }
    th, td {
      padding: 14px 12px;
      text-align: center;
      vertical-align: middle;
      border-bottom: 1px solid ${borderColor};
      border-right: 1px solid ${borderColor};
    }
    th:last-child, td:last-child {
      border-right: none;
    }
    tr:last-child td {
      border-bottom: none;
    }
    thead th {
      background: ${primaryGreen};
      color: #0a0a0a;
      font-weight: 600;
      font-size: 11px;
      padding: 16px 14px;
    }
    thead th.corner {
      background: ${primaryGreen};
      color: #0a0a0a;
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      padding-left: 24px;
      min-width: 200px;
    }
    thead th .date-num {
      font-size: 11px;
      font-weight: 400;
      opacity: 0.8;
      margin-bottom: 3px;
    }
    thead th .day-name {
      font-size: 12px;
      font-weight: 600;
      text-transform: lowercase;
    }
    
    .worker-cell {
      text-align: left;
      padding-left: 24px;
      font-size: 12px;
      background: ${rowBg};
      color: ${textColor};
    }
    .worker-name {
      font-weight: 600;
      color: ${primaryGreen};
    }
    .worker-number {
      font-size: 10px;
      color: ${mutedColor};
      margin-left: 6px;
    }
    .worker-group {
      font-size: 9px;
      padding: 3px 10px;
      border-radius: 9999px;
      background: ${isDark ? '#1a1a1a' : '#f0f0f0'};
      color: ${mutedColor};
      margin-left: 10px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .worker-group.has-rotation {
      border: 1px solid ${primaryGreen}40;
    }
    .rotation-icon {
      width: 10px;
      height: 10px;
      opacity: 0.7;
    }
    
    .shift-cell {
      background: ${rowBg};
      vertical-align: middle;
      min-width: 90px;
    }
    .shift-times {
      font-size: 11px;
      color: ${textColor};
      font-weight: 500;
      line-height: 1.6;
    }
    .shift-times-secondary {
      font-size: 10px;
      color: ${mutedColor};
      margin-top: 2px;
    }
    .rest-text {
      color: ${mutedColor};
      font-size: 11px;
      font-weight: 300;
      font-style: italic;
    }
    
    .footer-section {
      display: flex;
      gap: 20px;
      margin-top: 28px;
    }
    .footer-col {
      flex: 1;
      padding: 18px 22px;
      background: ${headerBg};
      border-radius: 12px;
      border: 1px solid ${borderColor};
    }
    .footer-col-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .footer-col-icon {
      width: 16px;
      height: 16px;
      color: ${primaryGreen};
    }
    .footer-col-title {
      font-size: 11px;
      font-weight: 600;
      color: ${textColor};
    }
    .footer-col-text {
      font-size: 10px;
      color: ${mutedColor};
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="header">
      <div class="header-left">
        <img src="/images/verdnatura-logo-green.png" alt="Verdnatura" class="logo">
        <div class="title-block">
          <div class="title">${pdfTitle}</div>
          <div class="subtitle">Horarios Personalizados</div>
        </div>
      </div>
      <div class="week-info">
        <div class="week-number">Semana ${selectedWeekNumber}</div>
        <div class="week-dates">${formatDateShort(weekRange.start)} - ${formatDateShort(weekRange.end)} ${selectedYear}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="corner">Trabajador</th>
          ${DAYS.map((d) => {
            const date = getDayDate(Number(d.key));
            return `<th>
              <div class="date-num">${date.getDate()}</div>
              <div class="day-name">${dayNames[Number(d.key)]}</div>
            </th>`;
          }).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => {
          return `<tr>
            <td class="worker-cell">
              <span class="worker-name">${row.name}</span>
              <span class="worker-number">#${row.number}</span>
              ${row.groupName ? `<span class="worker-group ${row.rotationEnabled ? 'has-rotation' : ''}">
                ${row.rotationEnabled ? `<svg class="rotation-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>` : ''}
                ${row.groupName}
              </span>` : ""}
            </td>
            ${DAYS.map(d => {
              const entry = row.template[d.key] || { type: "rest", start: null, end: null, start2: null, end2: null };
              const isRest = !entry.start && !entry.end;
              
              if (isRest) {
                return `<td class="shift-cell"><span class="rest-text">Descanso</span></td>`;
              }

              const startTime = entry.start || "";
              const endTime = entry.end || "";
              const start2 = (entry as any).start2 || "";
              const end2 = (entry as any).end2 || "";
              
              const primaryTime = (startTime || endTime) ? `${startTime || "—"} - ${endTime || "—"}` : "";
              const secondaryTime = (start2 || end2) ? `${start2 || "—"} - ${end2 || "—"}` : "";

              return `<td class="shift-cell">
                <div class="shift-times">${primaryTime}</div>
                ${secondaryTime ? `<div class="shift-times-secondary">${secondaryTime}</div>` : ""}
              </td>`;
            }).join("")}
          </tr>`;
        }).join("")}
      </tbody>
    </table>

    <div class="footer-section">
      ${autoInfoText || pdfCustomNotes.trim() ? `<div class="footer-col">
        <div class="footer-col-header">
          <svg class="footer-col-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
          <span class="footer-col-title">Rotación Semanal</span>
        </div>
        <p class="footer-col-text">${autoInfoText}</p>
      </div>` : ''}
      ${pdfCustomNotes.trim() ? `
      <div class="footer-col">
        <div class="footer-col-header">
          <svg class="footer-col-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <line x1="10" y1="9" x2="8" y2="9"/>
          </svg>
          <span class="footer-col-title">Notas</span>
        </div>
        <p class="footer-col-text">${pdfCustomNotes.trim().replace(/\n/g, '<br>')}</p>
      </div>
      ` : ''}
    </div>
  </div>
</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("No se pudo abrir la ventana de impresión");
      return;
    }

    printWindow.document.write(printContent);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);

    setPdfModeDialogOpen(false);
  };

   const getShiftLabel = (shiftKey: string) => {
     const shift = shifts.find(s => s.shift_key === shiftKey);
     return shift?.name || shiftKey;
   };
 
   const getShiftColor = (shiftKey: string) => {
     const shift = shifts.find(s => s.shift_key === shiftKey);
     return shift?.color || "#93d600";
   };
 
   const updateDaySchedule = (dayKey: string, field: keyof ScheduleEntry, value: string | null) => {
     setEditingTemplate(prev => ({
       ...prev,
       [dayKey]: {
         ...(prev[dayKey] || { type: "rest", start: null, end: null }),
         [field]: value,
       },
     }));
   };
 
   const renderSchedulePreview = (template: ScheduleTemplate) => {
     return (
       <div className="flex gap-1 flex-wrap">
         {DAYS.map(day => {
           const entry = template[day.key];
           const shiftKey = entry?.type || "rest";
           const shift = shifts.find(s => s.shift_key === shiftKey);
           const isRest = shift?.is_rest || shiftKey === "rest";
           
           return (
             <div
               key={day.key}
               className={`text-xs px-1.5 py-0.5 rounded ${isRest ? "bg-muted text-muted-foreground" : ""}`}
               style={!isRest ? { backgroundColor: `${getShiftColor(shiftKey)}20`, color: getShiftColor(shiftKey), border: `1px solid ${getShiftColor(shiftKey)}` } : undefined}
               title={`${day.full}: ${getShiftLabel(shiftKey)}${entry?.start ? ` ${entry.start}` : ""}${entry?.end ? `-${entry.end}` : ""}`}
             >
               {day.short}
             </div>
           );
         })}
       </div>
     );
   };
 
   const renderWorkerCard = (schedule: PersonalSchedule) => {
     const worker = schedule.worker || workers.find(w => w.id === schedule.worker_id);
     
     return (
       <div 
         key={schedule.id} 
         className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border gap-3"
       >
         <div className="flex-1 min-w-0">
           <div className="flex items-center gap-2">
             <User className="h-4 w-4 text-muted-foreground shrink-0" />
             <span className="font-medium truncate">{worker?.name || "Trabajador"}</span>
             <Badge variant="outline" className="text-xs shrink-0">#{worker?.worker_number}</Badge>
           </div>
           <div className="mt-2">
             {renderSchedulePreview(schedule.schedule_template)}
           </div>
         </div>
         
         <div className="flex items-center gap-1 shrink-0">
           <Popover>
             <PopoverTrigger asChild>
               <Button variant="ghost" size="icon" className="h-8 w-8">
                 <Users className="h-4 w-4" />
               </Button>
             </PopoverTrigger>
             <PopoverContent align="end" className="w-48">
               <div className="space-y-2">
                 <Label className="text-xs">Mover a grupo:</Label>
                 <Select
                   value={schedule.rotation_group_id || "none"}
                   onValueChange={(val) => handleMoveWorkerToGroup(schedule.id, val === "none" ? null : val)}
                 >
                   <SelectTrigger>
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="none">Sin grupo</SelectItem>
                     {rotationGroups.map(g => (
                       <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
             </PopoverContent>
           </Popover>
           
           <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditSchedule(schedule)}>
             <Edit2 className="h-4 w-4" />
           </Button>
           
           <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteSchedule(schedule.id)}>
             <Trash2 className="h-4 w-4" />
           </Button>
         </div>
       </div>
     );
   };
 
   if (loading) {
     return (
       <div className="flex items-center justify-center py-12">
         <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
       </div>
     );
   }
 
   return (
     <div className="space-y-6">
       {/* Header */}
       <div className="flex items-center justify-between">
         <div>
           <h3 className="text-lg font-semibold flex items-center gap-2">
             <CalendarDays className="h-5 w-5" />
             Horarios Personalizados
           </h3>
           <p className="text-sm text-muted-foreground">
             {departmentName} • Configura horarios individuales con rotación automática
           </p>
         </div>
         <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPdfModeDialogOpen(true)}
              disabled={personalSchedules.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
           <Button variant="outline" size="sm" onClick={() => setCreateGroupOpen(true)}>
             <Users className="h-4 w-4 mr-2" />
             Crear Grupo
           </Button>
            <Button size="sm" onClick={() => setAddWorkerOpen(true)}>
             <Plus className="h-4 w-4 mr-2" />
             Añadir Trabajador
           </Button>
         </div>
       </div>
 
       {/* Info banner */}
       <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900">
         <CardContent className="py-3">
           <div className="flex gap-3 items-start">
             <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
             <div className="text-sm text-blue-800 dark:text-blue-300">
               <p className="font-medium">¿Cómo funciona la rotación?</p>
               <p className="mt-1">
                 Cuando añades 2+ trabajadores a un grupo con rotación activada, sus horarios se intercambian automáticamente cada semana.
                 Por ejemplo: si A tiene horario de mañana y B tiene horario de tarde, la siguiente semana A tendrá tarde y B tendrá mañana.
               </p>
             </div>
           </div>
         </CardContent>
       </Card>
 
       {/* Rotation Groups */}
       {rotationGroups.map(group => {
         const groupSchedules = getSchedulesForGroup(group.id);
         const isExpanded = expandedGroups.has(group.id);
         
         return (
           <Card key={group.id}>
             <Collapsible open={isExpanded} onOpenChange={() => toggleGroupExpanded(group.id)}>
               <CardHeader className="py-3">
                 <div className="flex items-center justify-between">
                   <CollapsibleTrigger asChild>
                     <Button variant="ghost" className="p-0 h-auto hover:bg-transparent justify-start gap-2">
                       {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                       <CardTitle className="text-base flex items-center gap-2">
                         <Users className="h-4 w-4" />
                         {group.name}
                         <Badge variant="secondary" className="ml-2">{groupSchedules.length} trabajadores</Badge>
                       </CardTitle>
                     </Button>
                   </CollapsibleTrigger>
                   
                   <div className="flex items-center gap-3">
                     <div className="flex items-center gap-2">
                       <RotateCcw className={`h-4 w-4 ${group.rotation_enabled ? "text-primary" : "text-muted-foreground"}`} />
                       <span className="text-sm">Rotación</span>
                       <Switch
                         checked={group.rotation_enabled}
                         onCheckedChange={(checked) => handleToggleRotation(group.id, checked)}
                       />
                     </div>
                     <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteGroup(group.id)}>
                       <Trash2 className="h-4 w-4" />
                     </Button>
                   </div>
                 </div>
                 {group.rotation_enabled && groupSchedules.length >= 2 && (
                   <CardDescription className="mt-1 flex items-center gap-1">
                     <RefreshCw className="h-3 w-3" />
                     Los horarios rotan automáticamente cada semana
                   </CardDescription>
                 )}
               </CardHeader>
               
               <CollapsibleContent>
                 <CardContent className="pt-0 space-y-2">
                   {groupSchedules.length === 0 ? (
                     <p className="text-sm text-muted-foreground py-4 text-center">
                       Sin trabajadores en este grupo. Añade trabajadores para configurar la rotación.
                     </p>
                   ) : (
                     groupSchedules.map(renderWorkerCard)
                   )}
                 </CardContent>
               </CollapsibleContent>
             </Collapsible>
           </Card>
         );
       })}
 
       {/* Schedules without group */}
       {schedulesWithoutGroup.length > 0 && (
         <Card>
           <CardHeader className="py-3">
             <CardTitle className="text-base flex items-center gap-2">
               <User className="h-4 w-4" />
               Horarios Individuales (Sin Grupo)
               <Badge variant="outline">{schedulesWithoutGroup.length}</Badge>
             </CardTitle>
             <CardDescription>
               Trabajadores con horario personalizado que no rotan con otros
             </CardDescription>
           </CardHeader>
           <CardContent className="space-y-2">
             {schedulesWithoutGroup.map(renderWorkerCard)}
           </CardContent>
         </Card>
       )}
 
       {personalSchedules.length === 0 && (
         <Card>
           <CardContent className="py-12 text-center">
             <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
             <h3 className="font-medium mb-2">Sin horarios personalizados</h3>
             <p className="text-sm text-muted-foreground mb-4">
               Añade trabajadores para configurar sus horarios individuales
             </p>
              <Button onClick={() => setAddWorkerOpen(true)}>
               <Plus className="h-4 w-4 mr-2" />
               Añadir Primer Trabajador
             </Button>
           </CardContent>
         </Card>
       )}
 
       {/* Create Group Dialog */}
       <Dialog open={createGroupOpen} onOpenChange={setCreateGroupOpen}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Crear Grupo de Rotación</DialogTitle>
             <DialogDescription>
               Los trabajadores en el mismo grupo rotarán sus horarios automáticamente cada semana.
             </DialogDescription>
           </DialogHeader>
           <div className="space-y-4 py-4">
             <div className="space-y-2">
               <Label htmlFor="group-name">Nombre del grupo</Label>
               <Input
                 id="group-name"
                 placeholder="Ej: Rotación Mañana-Tarde"
                 value={newGroupName}
                 onChange={(e) => setNewGroupName(e.target.value)}
               />
             </div>
           </div>
           <DialogFooter>
             <Button variant="outline" onClick={() => setCreateGroupOpen(false)}>Cancelar</Button>
             <Button onClick={handleCreateGroup} disabled={saving || !newGroupName.trim()}>
               {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
               Crear
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
 
       {/* Add Worker Dialog */}
       <Dialog open={addWorkerOpen} onOpenChange={setAddWorkerOpen}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Añadir Horario Personalizado</DialogTitle>
             <DialogDescription>
              Busca un trabajador por nombre o número de fichar para configurar su horario individual.
             </DialogDescription>
           </DialogHeader>
           <div className="space-y-4 py-4">
             <div className="space-y-2">
               <Label>Trabajador</Label>
              <WorkerSearchSelect
                value={selectedWorker}
                onChange={setSelectedWorker}
                excludeWorkerIds={workersWithSchedule}
                placeholder="Buscar por nombre o número..."
              />
             </div>
             <div className="space-y-2">
               <Label>Grupo de rotación (opcional)</Label>
               <Select value={selectedGroupForWorker || "none"} onValueChange={(v) => setSelectedGroupForWorker(v === "none" ? "" : v)}>
                 <SelectTrigger>
                   <SelectValue placeholder="Sin grupo (horario fijo)" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="none">Sin grupo (horario fijo)</SelectItem>
                   {rotationGroups.map(g => (
                     <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
           </div>
           <DialogFooter>
             <Button variant="outline" onClick={() => setAddWorkerOpen(false)}>Cancelar</Button>
             <Button onClick={handleAddWorkerSchedule} disabled={saving || !selectedWorker}>
               {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
               Añadir
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
 
       {/* Edit Schedule Dialog */}
       <Dialog open={editScheduleOpen} onOpenChange={setEditScheduleOpen}>
        <DialogContent className="max-w-4xl">
           <DialogHeader>
             <DialogTitle>Editar Horario</DialogTitle>
             <DialogDescription>
               Configura el horario semanal para {currentSchedule?.worker?.name || "este trabajador"}
             </DialogDescription>
           </DialogHeader>
           <div className="space-y-4 py-4">
              <div className="grid grid-cols-7 gap-3">
               {DAYS.map(day => {
                  const entry = editingTemplate[day.key] || { type: "rest", start: null, end: null, start2: null, end2: null };
                  const isRest = !entry.start && !entry.end && !entry.start2 && !entry.end2;
                  const hasSplitShift = !!(entry.start2 || entry.end2);
                 
                 return (
                    <div key={day.key} className="space-y-2 min-w-0">
                      <Label className="text-xs font-medium text-left block">{day.full}</Label>
                     <div className="space-y-1.5">
                       <div>
                          <span className="text-[10px] text-muted-foreground block mb-0.5">Entrada 1</span>
                        <Input
                           type="text"
                           inputMode="numeric"
                            className="h-8 text-xs font-mono"
                          value={entry.start || ""}
                          onChange={(e) => {
                             let val = e.target.value.replace(/[^\d:]/g, "");
                             if (val.length === 2 && !val.includes(":")) {
                               val = val + ":";
                             }
                             if (val.length > 5) val = val.slice(0, 5);
                             const newStart = val || null;
                            updateDaySchedule(day.key, "start", newStart);
                            if (newStart && entry.type === "rest") {
                              updateDaySchedule(day.key, "type", "work");
                            }
                          }}
                           onBlur={(e) => {
                             const formatted = formatTimeOnBlur(e.target.value);
                             updateDaySchedule(day.key, "start", formatted);
                             if (formatted && entry.type === "rest") {
                               updateDaySchedule(day.key, "type", "work");
                             }
                           }}
                           placeholder="08:00"
                           maxLength={5}
                        />
                      </div>
                       <div>
                          <span className="text-[10px] text-muted-foreground block mb-0.5">Salida 1</span>
                        <Input
                           type="text"
                           inputMode="numeric"
                            className="h-8 text-xs font-mono"
                          value={entry.end || ""}
                          onChange={(e) => {
                             let val = e.target.value.replace(/[^\d:]/g, "");
                             if (val.length === 2 && !val.includes(":")) {
                               val = val + ":";
                             }
                             if (val.length > 5) val = val.slice(0, 5);
                             const newEnd = val || null;
                            updateDaySchedule(day.key, "end", newEnd);
                            if (newEnd && entry.type === "rest") {
                              updateDaySchedule(day.key, "type", "work");
                            }
                          }}
                           onBlur={(e) => {
                             const formatted = formatTimeOnBlur(e.target.value);
                             updateDaySchedule(day.key, "end", formatted);
                           }}
                           placeholder="16:00"
                           maxLength={5}
                        />
                      </div>
                       
                       {/* Second shift block (split shift) */}
                       <div className={`border-t border-dashed pt-1.5 mt-1.5 ${!hasSplitShift ? "opacity-50" : ""}`}>
                         <div>
                           <span className="text-[10px] text-muted-foreground block mb-0.5">Entrada 2</span>
                           <Input
                             type="text"
                             inputMode="numeric"
                             className="h-8 text-xs font-mono"
                             value={entry.start2 || ""}
                             onChange={(e) => {
                               let val = e.target.value.replace(/[^\d:]/g, "");
                               if (val.length === 2 && !val.includes(":")) {
                                 val = val + ":";
                               }
                               if (val.length > 5) val = val.slice(0, 5);
                               updateDaySchedule(day.key, "start2", val || null);
                             }}
                              onBlur={(e) => {
                                const formatted = formatTimeOnBlur(e.target.value);
                                updateDaySchedule(day.key, "start2", formatted);
                              }}
                             placeholder="15:00"
                             maxLength={5}
                           />
                         </div>
                         <div className="mt-1.5">
                           <span className="text-[10px] text-muted-foreground block mb-0.5">Salida 2</span>
                           <Input
                             type="text"
                             inputMode="numeric"
                             className="h-8 text-xs font-mono"
                             value={entry.end2 || ""}
                             onChange={(e) => {
                               let val = e.target.value.replace(/[^\d:]/g, "");
                               if (val.length === 2 && !val.includes(":")) {
                                 val = val + ":";
                               }
                               if (val.length > 5) val = val.slice(0, 5);
                               updateDaySchedule(day.key, "end2", val || null);
                             }}
                              onBlur={(e) => {
                                const formatted = formatTimeOnBlur(e.target.value);
                                updateDaySchedule(day.key, "end2", formatted);
                              }}
                             placeholder="18:00"
                             maxLength={5}
                           />
                         </div>
                       </div>
                       
                      <Button
                        type="button"
                        variant={isRest ? "default" : "outline"}
                        size="sm"
                         className="w-full h-6 text-[10px] mt-1"
                        onClick={() => {
                          if (isRest) {
                            // Set default work hours
                            updateDaySchedule(day.key, "type", "work");
                            updateDaySchedule(day.key, "start", "08:00");
                            updateDaySchedule(day.key, "end", "16:00");
                             updateDaySchedule(day.key, "start2", null);
                             updateDaySchedule(day.key, "end2", null);
                          } else {
                            // Clear to rest
                            updateDaySchedule(day.key, "type", "rest");
                            updateDaySchedule(day.key, "start", null);
                            updateDaySchedule(day.key, "end", null);
                             updateDaySchedule(day.key, "start2", null);
                             updateDaySchedule(day.key, "end2", null);
                          }
                        }}
                      >
                         Descanso
                      </Button>
                    </div>
                   </div>
                 );
               })}
             </div>
            <p className="text-xs text-muted-foreground text-center">
               Deja vacío o pulsa "Descanso" para marcar un día como libre. Usa Entrada 2 / Salida 2 para horarios partidos.
            </p>
           </div>
           <DialogFooter>
             <Button variant="outline" onClick={() => setEditScheduleOpen(false)}>Cancelar</Button>
             <Button onClick={handleSaveScheduleTemplate} disabled={saving}>
               {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
               Guardar
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

        {/* PDF Mode Selection Dialog */}
        <Dialog open={pdfModeDialogOpen} onOpenChange={setPdfModeDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Exportar PDF
              </DialogTitle>
              <DialogDescription>
                Configura el título y notas del PDF
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="pdf-week" className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  Semana a exportar
                </Label>
                <Select
                  value={String(pdfStartWeek)}
                  onValueChange={(val) => setPdfStartWeek(Number(val))}
                >
                  <SelectTrigger id="pdf-week">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 52 }, (_, i) => i + 1).map(week => (
                      <SelectItem key={week} value={String(week)}>
                        Semana {week} {week === currentWeekNumber ? "(actual)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pdf-title">Título del horario</Label>
                <Input
                  id="pdf-title"
                  placeholder={departmentName}
                  value={pdfCustomTitle}
                  onChange={(e) => setPdfCustomTitle(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Deja vacío para usar "{departmentName}"
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pdf-notes" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Notas personalizadas (opcional)
                </Label>
                <Textarea
                  id="pdf-notes"
                  placeholder="Añade información adicional que aparecerá en el PDF..."
                  value={pdfCustomNotes}
                  onChange={(e) => setPdfCustomNotes(e.target.value)}
                  className="min-h-[80px] resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label>Modo de color</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-16 flex flex-col items-center justify-center gap-1.5 border-2 hover:border-primary"
                    onClick={() => generatePdf(false)}
                  >
                    <Sun className="h-5 w-5 text-amber-500" />
                    <span className="text-xs font-medium">Claro</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-16 flex flex-col items-center justify-center gap-1.5 border-2 hover:border-primary"
                    onClick={() => generatePdf(true)}
                  >
                    <Moon className="h-5 w-5 text-indigo-500" />
                    <span className="text-xs font-medium">Oscuro</span>
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
     </div>
   );
 };