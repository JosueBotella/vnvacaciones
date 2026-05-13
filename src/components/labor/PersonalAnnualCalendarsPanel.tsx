 import { useState, useEffect, useMemo } from "react";
 import { supabase } from "@/integrations/supabase/client";
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { Badge } from "@/components/ui/badge";
 import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
 import { toast } from "sonner";
 import { 
   Plus, 
   Calendar, 
   Download, 
   Trash2, 
   Users, 
   Palette,
   ChevronRight,
   X,
   Search,
   Save,
   Loader2,
   FileText,
   Building2,
   Edit2
 } from "lucide-react";
import { DepartmentSearchSelect } from "@/components/DepartmentSearchSelect";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmbeddedPersonalAnnualCalendar } from "./EmbeddedPersonalAnnualCalendar";
 
 type Department = {
   id: string;
   name: string;
 };
 
 type WorkGroup = {
   id: string;
   name: string;
   color: string;
 };
 
 type Worker = {
   id: string;
   name: string;
   worker_number: string;
   department_id: string;
   department_name: string | null;
 };
 
 type PersonalAnnualCalendar = {
   id: string;
   department_id: string;
   name: string;
   year: number;
   source_calendar_id: string | null;
   created_at: string;
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
 
 type Props = {
   isOpen: boolean;
   onClose: () => void;
   departments: { id: string; name: string }[];
 };
 
 const PRESET_COLORS = [
   "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#16a34a",
   "#059669", "#0d9488", "#0891b2", "#0284c7", "#2563eb", "#4f46e5",
   "#7c3aed", "#9333ea", "#c026d3", "#db2777", "#93d600", "#ec4899"
 ];
 
 export const PersonalAnnualCalendarsPanel = ({ isOpen, onClose, departments }: Props) => {
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [calendars, setCalendars] = useState<PersonalAnnualCalendar[]>([]);
   const [selectedCalendar, setSelectedCalendar] = useState<PersonalAnnualCalendar | null>(null);
   const [workers, setWorkers] = useState<PersonalCalendarWorker[]>([]);
   const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
   const [allWorkers, setAllWorkers] = useState<Worker[]>([]);
   const [workerSearch, setWorkerSearch] = useState("");

    // Remote search for Add Worker dialog (more reliable than client-side filtering)
    const [remoteSearchWorkers, setRemoteSearchWorkers] = useState<Worker[]>([]);
    const [remoteSearchLoading, setRemoteSearchLoading] = useState(false);
 
   // Create dialog
   const [showCreateDialog, setShowCreateDialog] = useState(false);
   const [createDepartmentId, setCreateDepartmentId] = useState("");
   const [createName, setCreateName] = useState("");
   const [createYear, setCreateYear] = useState(new Date().getFullYear());
 
   // Add worker dialog
   const [showAddWorkerDialog, setShowAddWorkerDialog] = useState(false);
   const [addWorkerSearch, setAddWorkerSearch] = useState("");
   const [selectedAddWorker, setSelectedAddWorker] = useState<Worker | null>(null);
   const [addWorkerColor, setAddWorkerColor] = useState("#3b82f6");
   const [addWorkerGroupId, setAddWorkerGroupId] = useState<string>("");
 
   // Edit worker color
   const [editingWorker, setEditingWorker] = useState<PersonalCalendarWorker | null>(null);
   const [editColor, setEditColor] = useState("");
   const [editGroupId, setEditGroupId] = useState<string>("");
 
  // Filter by department
  const [filterDepartmentId, setFilterDepartmentId] = useState<string>("");
  
  // Selected worker for editing calendar
  const [selectedEditWorkerId, setSelectedEditWorkerId] = useState<string | null>(null);

  // Edit calendar name
  const [editingCalendarName, setEditingCalendarName] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState("");

  const currentYear = new Date().getFullYear();
   const years = Array.from({ length: 5 }, (_, i) => currentYear - 1 + i);
 
   useEffect(() => {
     if (isOpen) {
       fetchCalendars();
       fetchAllWorkers();
     }
   }, [isOpen]);
 
   useEffect(() => {
     if (selectedCalendar) {
       fetchCalendarDetails(selectedCalendar.id);
     }
   }, [selectedCalendar?.id]);

    // Debounced remote search so workers like "Carmen Santiago Romero" always show up
    useEffect(() => {
      if (!showAddWorkerDialog) return;

      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) return;

      const q = addWorkerSearch.trim();
      if (!q) {
        setRemoteSearchWorkers([]);
        return;
      }

      const timeout = window.setTimeout(async () => {
        setRemoteSearchLoading(true);
        try {
          const { data } = await supabase.functions.invoke("admin-operations", {
            body: {
              action: "searchWorkers",
              sessionToken,
              data: {
                query: q,
                limit: 50,
              },
            },
          });

          if (data?.success) {
            // The remote search endpoint may return a minimal worker shape.
            // Enrich it with department info from the full worker list (searchAllWorkers).
            const incoming: Worker[] = data.workers || [];
            const byId = new Map(allWorkers.map(w => [w.id, w] as const));
            const enriched = incoming.map(w => byId.get(w.id) || w);
            setRemoteSearchWorkers(enriched);
          } else {
            setRemoteSearchWorkers([]);
          }
        } catch (e) {
          console.error("Error searching workers (remote):", e);
          setRemoteSearchWorkers([]);
        } finally {
          setRemoteSearchLoading(false);
        }
      }, 200);

      return () => window.clearTimeout(timeout);
    }, [addWorkerSearch, showAddWorkerDialog]);
 
   const fetchCalendars = async () => {
     setLoading(true);
     const sessionToken = localStorage.getItem("manager_session_token");
     if (!sessionToken) {
       setLoading(false);
       return;
     }
 
     try {
       const { data } = await supabase.functions.invoke("admin-operations", {
         body: { action: "getPersonalAnnualCalendars", sessionToken }
       });
 
       if (data?.success) {
         setCalendars(data.calendars || []);
       }
     } catch (error) {
       console.error("Error fetching personal annual calendars:", error);
       toast.error("Error al cargar calendarios personalizados");
     }
     setLoading(false);
   };
 
   const fetchAllWorkers = async () => {
     const sessionToken = localStorage.getItem("manager_session_token");
     if (!sessionToken) return;
 
     try {
       const { data } = await supabase.functions.invoke("admin-operations", {
         body: { action: "searchAllWorkers", sessionToken }
       });
 
       if (data?.success) {
         setAllWorkers(data.workers || []);
       }
     } catch (error) {
       console.error("Error fetching workers:", error);
     }
   };
 
   const fetchCalendarDetails = async (calendarId: string) => {
     const sessionToken = localStorage.getItem("manager_session_token");
     if (!sessionToken) return;
 
     try {
       const { data } = await supabase.functions.invoke("admin-operations", {
         body: { 
           action: "getPersonalAnnualCalendarDetails", 
           sessionToken,
           data: { calendarId }
         }
       });
 
       if (data?.success) {
         setWorkers(data.workers || []);
         setWorkGroups(data.workGroups || []);
       }
     } catch (error) {
       console.error("Error fetching calendar details:", error);
     }
   };
 
   const handleCreate = async () => {
     if (!createDepartmentId || !createName.trim()) {
       toast.error("Nombre y departamento requeridos");
       return;
     }
 
     setSaving(true);
     const sessionToken = localStorage.getItem("manager_session_token");
 
     try {
       const { data } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "createPersonalAnnualCalendar",
           sessionToken,
           data: {
             departmentId: createDepartmentId,
             name: createName.trim(),
             year: createYear
           }
         }
       });
 
       if (data?.success) {
         toast.success("Calendario personal creado");
         setShowCreateDialog(false);
         setCreateName("");
         setCreateDepartmentId("");
         fetchCalendars();
         setSelectedCalendar(data.calendar);
       } else {
         toast.error(data?.error || "Error al crear calendario");
       }
     } catch (error) {
       console.error("Error creating calendar:", error);
       toast.error("Error al crear calendario");
     }
     setSaving(false);
   };
 
   const handleDelete = async (cal: PersonalAnnualCalendar) => {
     if (!confirm(`¿Eliminar el calendario "${cal.name}"?`)) return;
 
     const sessionToken = localStorage.getItem("manager_session_token");
     if (!sessionToken) return;
 
     try {
       const { data } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "deletePersonalAnnualCalendar",
           sessionToken,
           data: { calendarId: cal.id }
         }
       });
 
       if (data?.success) {
         toast.success("Calendario eliminado");
         if (selectedCalendar?.id === cal.id) {
           setSelectedCalendar(null);
           setWorkers([]);
         }
         fetchCalendars();
       } else {
         toast.error(data?.error || "Error al eliminar");
       }
     } catch (error) {
       toast.error("Error al eliminar calendario");
     }
   };
 
   const handleAddWorker = async () => {
     if (!selectedCalendar || !selectedAddWorker) {
       toast.error("Selecciona un trabajador");
       return;
     }
     if (!addWorkerGroupId) {
       toast.error("Selecciona un grupo del calendario base");
       return;
     }
 
     setSaving(true);
     const sessionToken = localStorage.getItem("manager_session_token");
 
     try {
       const { data } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "addPersonalAnnualCalendarWorker",
           sessionToken,
           data: {
             calendarId: selectedCalendar.id,
             workerId: selectedAddWorker.id,
             workerName: selectedAddWorker.name,
             workerNumber: selectedAddWorker.worker_number,
             sourceGroupId: addWorkerGroupId,
             color: addWorkerColor
           }
         }
       });
 
       if (data?.success) {
         toast.success("Trabajador añadido");
         setShowAddWorkerDialog(false);
         setSelectedAddWorker(null);
         setAddWorkerSearch("");
         setAddWorkerColor("#3b82f6");
         setAddWorkerGroupId("");
         fetchCalendarDetails(selectedCalendar.id);
       } else {
         toast.error(data?.error || "Error al añadir trabajador");
       }
     } catch (error) {
       toast.error("Error al añadir trabajador");
     }
     setSaving(false);
   };
 
   const handleRemoveWorker = async (worker: PersonalCalendarWorker) => {
     if (!selectedCalendar) return;
     if (!confirm(`¿Eliminar a ${worker.worker_name} del calendario?`)) return;
 
     const sessionToken = localStorage.getItem("manager_session_token");
     if (!sessionToken) return;
 
     try {
       const { data } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "removePersonalAnnualCalendarWorker",
           sessionToken,
           data: { workerId: worker.id }
         }
       });
 
       if (data?.success) {
         toast.success("Trabajador eliminado");
         fetchCalendarDetails(selectedCalendar.id);
       } else {
         toast.error(data?.error || "Error al eliminar");
       }
     } catch (error) {
       toast.error("Error al eliminar trabajador");
     }
   };
 
   const handleUpdateWorker = async () => {
     if (!editingWorker || !selectedCalendar) return;
 
     setSaving(true);
     const sessionToken = localStorage.getItem("manager_session_token");
 
     try {
       const { data } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "updatePersonalAnnualCalendarWorker",
           sessionToken,
           data: {
             workerId: editingWorker.id,
             color: editColor,
             sourceGroupId: editGroupId || null
           }
         }
       });
 
       if (data?.success) {
         toast.success("Trabajador actualizado");
         setEditingWorker(null);
         fetchCalendarDetails(selectedCalendar.id);
       } else {
         toast.error(data?.error || "Error al actualizar");
       }
     } catch (error) {
       toast.error("Error al actualizar trabajador");
     }
    setSaving(false);
  };

  const handleRenameCalendar = async () => {
    if (!selectedCalendar || !newCalendarName.trim()) {
      toast.error("El nombre no puede estar vacío");
      return;
    }

    setSaving(true);
    const sessionToken = localStorage.getItem("manager_session_token");

    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "renamePersonalAnnualCalendar",
          sessionToken,
          data: {
            calendarId: selectedCalendar.id,
            name: newCalendarName.trim()
          }
        }
      });

      if (data?.success) {
        toast.success("Nombre actualizado");
        setEditingCalendarName(false);
        // Update local state
        setSelectedCalendar({ ...selectedCalendar, name: newCalendarName.trim() });
        setCalendars(prev => prev.map(c => 
          c.id === selectedCalendar.id ? { ...c, name: newCalendarName.trim() } : c
        ));
      } else {
        toast.error(data?.error || "Error al renombrar");
      }
    } catch (error) {
      toast.error("Error al renombrar calendario");
    }
    setSaving(false);
   };
 
   const handleExportPDF = async () => {
     if (!selectedCalendar || workers.length === 0) {
       toast.error("Añade trabajadores al calendario primero");
       return;
     }
 
     setSaving(true);
     const sessionToken = localStorage.getItem("manager_session_token");
 
     try {
       const { data } = await supabase.functions.invoke("admin-operations", {
         body: {
           action: "generatePersonalAnnualCalendarPDF",
           sessionToken,
           data: { calendarId: selectedCalendar.id }
         }
       });
 
       if (data?.success && data?.html) {
         const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
         
         if (!isMobile) {
           const printWindow = window.open("", "_blank");
           if (printWindow) {
             printWindow.document.write(data.html);
             printWindow.document.close();
             printWindow.focus();
             setTimeout(() => printWindow.print(), 500);
             toast.success("PDF listo para imprimir");
           }
         } else {
           const existingIframe = document.getElementById("print-iframe");
           if (existingIframe) existingIframe.remove();
           
           const iframe = document.createElement("iframe");
           iframe.id = "print-iframe";
           iframe.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:white;border:none;";
           document.body.appendChild(iframe);
           
           const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
           if (iframeDoc) {
             const modifiedHtml = data.html.replace(
               "</body>",
               `<div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:10px;z-index:10000;">
                 <button onclick="window.print()" style="background:#93d600;color:black;padding:12px 24px;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">Guardar PDF</button>
                 <button onclick="parent.document.getElementById('print-iframe').remove()" style="background:#333;color:white;padding:12px 24px;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">Cerrar</button>
               </div></body>`
             );
             iframeDoc.open();
             iframeDoc.write(modifiedHtml);
             iframeDoc.close();
             toast.success("Pulsa 'Guardar PDF' para descargar");
           }
         }
       } else {
         toast.error(data?.error || "Error al generar PDF");
       }
     } catch (error) {
       console.error("Error generating PDF:", error);
       toast.error("Error al generar PDF");
     }
     setSaving(false);
   };
 
   const filteredCalendars = useMemo(() => {
     if (!filterDepartmentId) return calendars;
     return calendars.filter(c => c.department_id === filterDepartmentId);
   }, [calendars, filterDepartmentId]);
 
  // Normalize text for accent-insensitive search
  const normalizeForSearch = (text: string): string => {
    return (text || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };

   const filteredSearchWorkers = useMemo(() => {
     if (!addWorkerSearch.trim()) return [];
     const existingIds = new Set(workers.map(w => w.worker_id));

     // Prefer remote search results (more accurate) and fall back to local list
     const base = remoteSearchWorkers.length > 0 ? remoteSearchWorkers : allWorkers;
     const normalizedSearch = normalizeForSearch(addWorkerSearch);

     return base
       .filter(w =>
         !existingIds.has(w.id) &&
         (normalizeForSearch(w.name).includes(normalizedSearch) ||
           w.worker_number.includes(addWorkerSearch.trim()))
       )
       .slice(0, 50);
   }, [addWorkerSearch, allWorkers, workers, remoteSearchWorkers]);
 
   const getDepartmentName = (deptId: string) => {
     return departments.find(d => d.id === deptId)?.name || "Desconocido";
   };
 
   const getGroupName = (groupId: string | null) => {
     if (!groupId) return "Sin grupo";
     return workGroups.find(g => g.id === groupId)?.name || "Grupo";
   };
 
   if (!isOpen) return null;
 
   return (
     <Dialog open={isOpen} onOpenChange={onClose}>
       <DialogContent className="max-w-6xl h-[95vh] overflow-hidden flex flex-col p-4">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <Calendar className="h-5 w-5 text-primary" />
             Calendarios Anuales Personalizados
           </DialogTitle>
           <DialogDescription>
             Asigna un calendario anual a trabajadores específicos con colores personalizados
           </DialogDescription>
         </DialogHeader>
 
         <div className="flex-1 overflow-hidden flex gap-4">
           {/* Left: Calendar list */}
           <div className="w-72 flex flex-col gap-3 border-r pr-4">
             <div className="flex items-center justify-between">
               <span className="text-sm font-medium">Calendarios</span>
               <Button size="sm" variant="outline" onClick={() => setShowCreateDialog(true)}>
                 <Plus className="h-3.5 w-3.5 mr-1" />
                 Nuevo
               </Button>
             </div>
 
             <div className="w-full">
               <DepartmentSearchSelect
                 departments={departments}
                 value={filterDepartmentId}
                 onChange={setFilterDepartmentId}
                 placeholder="Filtrar departamento"
                 includeAll={true}
               />
             </div>
 
             <ScrollArea className="flex-1">
               <div className="space-y-2 pr-2">
                 {loading ? (
                   <div className="text-center py-8 text-muted-foreground text-sm">
                     <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                     Cargando...
                   </div>
                 ) : filteredCalendars.length === 0 ? (
                   <div className="text-center py-8 text-muted-foreground text-sm">
                     No hay calendarios personalizados
                   </div>
                 ) : (
                   filteredCalendars.map(cal => (
                     <Card 
                       key={cal.id}
                       className={`cursor-pointer transition-all hover:border-primary/50 ${selectedCalendar?.id === cal.id ? "border-primary bg-primary/5" : ""}`}
                       onClick={() => setSelectedCalendar(cal)}
                     >
                       <CardContent className="p-3">
                         <div className="flex items-start justify-between gap-2">
                           <div className="flex-1 min-w-0">
                             <p className="font-medium text-sm truncate">{cal.name}</p>
                             <p className="text-xs text-muted-foreground truncate">
                               {getDepartmentName(cal.department_id)}
                             </p>
                             <Badge variant="secondary" className="mt-1 text-xs">
                               {cal.year}
                             </Badge>
                           </div>
                           <Button
                             size="icon"
                             variant="ghost"
                             className="h-7 w-7 text-destructive hover:text-destructive"
                             onClick={(e) => { e.stopPropagation(); handleDelete(cal); }}
                           >
                             <Trash2 className="h-3.5 w-3.5" />
                           </Button>
                         </div>
                       </CardContent>
                     </Card>
                   ))
                 )}
               </div>
             </ScrollArea>
           </div>
 
           {/* Right: Calendar details */}
           <div className="flex-1 flex flex-col overflow-hidden">
             {!selectedCalendar ? (
               <div className="flex-1 flex items-center justify-center text-muted-foreground">
                 <div className="text-center">
                   <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                   <p>Selecciona un calendario para ver los detalles</p>
                   <p className="text-sm mt-1">o crea uno nuevo</p>
                 </div>
               </div>
             ) : (
               <>
                <div className="flex items-center justify-between mb-4">
                    <div>
                      {editingCalendarName ? (
                        <div className="flex items-center gap-2 bg-background/50 backdrop-blur-sm rounded-lg p-1.5">
                          <Input
                            value={newCalendarName}
                            onChange={(e) => setNewCalendarName(e.target.value)}
                            className="h-9 min-w-[280px] max-w-md text-base font-semibold border-primary/30 focus:border-primary"
                            autoFocus
                            placeholder="Nombre del calendario"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameCalendar();
                              if (e.key === "Escape") setEditingCalendarName(false);
                            }}
                          />
                          <Button 
                            size="icon" 
                            variant="default"
                            className="h-9 w-9 shrink-0"
                            onClick={handleRenameCalendar} 
                            disabled={saving}
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-9 w-9 shrink-0"
                            onClick={() => setEditingCalendarName(false)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{selectedCalendar.name}</h3>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              setNewCalendarName(selectedCalendar.name);
                              setEditingCalendarName(true);
                            }}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {getDepartmentName(selectedCalendar.department_id)} • {selectedCalendar.year}
                      </p>
                    </div>
                   <div className="flex gap-2">
                     <Button size="sm" variant="outline" onClick={() => setShowAddWorkerDialog(true)}>
                       <Plus className="h-3.5 w-3.5 mr-1" />
                       Añadir Trabajador
                     </Button>
                     <Button 
                       size="sm" 
                       onClick={handleExportPDF}
                       disabled={saving || workers.length === 0}
                     >
                       {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                       Exportar PDF
                     </Button>
                   </div>
                 </div>
 
                 <div className="mb-3">
                   <p className="text-sm text-muted-foreground">
                     <Users className="h-4 w-4 inline mr-1" />
                     {workers.length} trabajador{workers.length !== 1 ? "es" : ""} asignado{workers.length !== 1 ? "s" : ""}
                   </p>
                 </div>
 
                 <ScrollArea className="flex-1 min-h-0">
                    {workers.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                        <p>No hay trabajadores asignados</p>
                        <p className="text-sm mt-1">Añade trabajadores para generar el calendario personalizado</p>
                      </div>
                    ) : (
                      <div className="space-y-4 pr-2">
                        {/* Embedded calendar with editable days */}
                        <EmbeddedPersonalAnnualCalendar
                          calendarId={selectedCalendar.id}
                          departmentId={selectedCalendar.department_id}
                          year={selectedCalendar.year}
                          workers={workers}
                          workGroups={workGroups}
                          selectedWorkerId={selectedEditWorkerId}
                          onSelectWorker={setSelectedEditWorkerId}
                        />
                        
                        {/* Worker list */}
                        <div className="border-t pt-4 mt-4">
                          <p className="text-sm font-medium mb-2">Trabajadores asignados:</p>
                          <div className="flex flex-wrap gap-2">
                            {workers.map((worker) => (
                              <div 
                                key={worker.id}
                                className="flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1"
                              >
                                <div 
                                  className="w-4 h-4 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: worker.color }}
                                />
                                <span className="text-sm">{worker.worker_name}</span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5"
                                  onClick={() => {
                                    setEditingWorker(worker);
                                    setEditColor(worker.color);
                                    setEditGroupId(worker.source_group_id || "");
                                  }}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5 text-destructive hover:text-destructive"
                                  onClick={() => handleRemoveWorker(worker)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </ScrollArea>
               </>
             )}
           </div>
         </div>
 
         {/* Create calendar dialog */}
         <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
           <DialogContent>
             <DialogHeader>
               <DialogTitle>Nuevo Calendario Anual Personalizado</DialogTitle>
               <DialogDescription>
                 Crea un calendario para asignar a trabajadores específicos
               </DialogDescription>
             </DialogHeader>
 
             <div className="space-y-4 py-2">
               <div className="space-y-2">
                 <Label>Nombre del calendario *</Label>
                 <Input
                   value={createName}
                   onChange={(e) => setCreateName(e.target.value)}
                   placeholder="Ej: Calendario Producción Especial"
                 />
               </div>
 
               <div className="space-y-2">
                 <Label>Departamento base *</Label>
                 <DepartmentSearchSelect
                   departments={departments}
                   value={createDepartmentId}
                   onChange={setCreateDepartmentId}
                   placeholder="Selecciona departamento"
                 />
                 <p className="text-xs text-muted-foreground">
                   Se usará el calendario anual de este departamento como base
                 </p>
               </div>
 
               <div className="space-y-2">
                 <Label>Año</Label>
                 <Select value={String(createYear)} onValueChange={(v) => setCreateYear(Number(v))}>
                   <SelectTrigger>
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     {years.map(y => (
                       <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
             </div>
 
             <DialogFooter>
               <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                 Cancelar
               </Button>
               <Button onClick={handleCreate} disabled={saving}>
                 {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                 Crear Calendario
               </Button>
             </DialogFooter>
           </DialogContent>
         </Dialog>
 
         {/* Add worker dialog */}
         <Dialog open={showAddWorkerDialog} onOpenChange={setShowAddWorkerDialog}>
           <DialogContent>
             <DialogHeader>
               <DialogTitle>Añadir Trabajador al Calendario</DialogTitle>
               <DialogDescription>
                 Busca un trabajador y asígnale un color y grupo
               </DialogDescription>
             </DialogHeader>
 
             <div className="space-y-4 py-2">
               <div className="space-y-2">
                 <Label>Buscar trabajador</Label>
                 <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input
                     value={addWorkerSearch}
                     onChange={(e) => setAddWorkerSearch(e.target.value)}
                     placeholder="Nombre o número..."
                     className="pl-9"
                   />
                 </div>
                  {remoteSearchLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Buscando...
                    </div>
                  )}
                 {filteredSearchWorkers.length > 0 && (
                   <ScrollArea className="max-h-40 border rounded-md">
                     <div className="p-1">
                       {filteredSearchWorkers.map(w => (
                         <div
                           key={w.id}
                           className={`p-2 rounded cursor-pointer hover:bg-muted ${selectedAddWorker?.id === w.id ? "bg-primary/10" : ""}`}
                           onClick={() => setSelectedAddWorker(w)}
                         >
                           <p className="text-sm font-medium">{w.name}</p>
                           <p className="text-xs text-muted-foreground">Nº {w.worker_number} • {w.department_name || "Sin depto"}</p>
                         </div>
                       ))}
                     </div>
                   </ScrollArea>
                 )}
                 {selectedAddWorker && (
                   <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-md">
                     <Users className="h-4 w-4 text-primary" />
                     <span className="text-sm font-medium">{selectedAddWorker.name}</span>
                     <span className="text-xs text-muted-foreground">Nº {selectedAddWorker.worker_number}</span>
                     <Button size="icon" variant="ghost" className="h-5 w-5 ml-auto" onClick={() => setSelectedAddWorker(null)}>
                       <X className="h-3 w-3" />
                     </Button>
                   </div>
                 )}
               </div>
 
               <div className="space-y-2">
                 <Label>Grupo del calendario base *</Label>
                 <Select value={addWorkerGroupId} onValueChange={setAddWorkerGroupId}>
                   <SelectTrigger>
                     <SelectValue placeholder="Selecciona un grupo" />
                   </SelectTrigger>
                   <SelectContent>
                     {workGroups.map(g => (
                       <SelectItem key={g.id} value={g.id}>
                         <div className="flex items-center gap-2">
                           <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }} />
                           {g.name}
                         </div>
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
                 <p className="text-xs text-muted-foreground">
                   Este trabajador heredará las vacaciones del grupo seleccionado
                 </p>
               </div>
 
               <div className="space-y-2">
                 <Label>Color en el PDF</Label>
                 <div className="flex flex-wrap gap-2">
                   {PRESET_COLORS.map(color => (
                     <button
                       key={color}
                       type="button"
                       className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${addWorkerColor === color ? "ring-2 ring-offset-2 ring-primary" : ""}`}
                       style={{ backgroundColor: color }}
                       onClick={() => setAddWorkerColor(color)}
                     />
                   ))}
                 </div>
               </div>
             </div>
 
             <DialogFooter>
               <Button variant="outline" onClick={() => setShowAddWorkerDialog(false)}>
                 Cancelar
               </Button>
               <Button onClick={handleAddWorker} disabled={saving || !selectedAddWorker || !addWorkerGroupId}>
                 {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                 Añadir Trabajador
               </Button>
             </DialogFooter>
           </DialogContent>
         </Dialog>
 
         {/* Edit worker dialog */}
         <Dialog open={!!editingWorker} onOpenChange={() => setEditingWorker(null)}>
           <DialogContent>
             <DialogHeader>
               <DialogTitle>Editar {editingWorker?.worker_name}</DialogTitle>
             </DialogHeader>
 
             <div className="space-y-4 py-2">
               <div className="space-y-2">
                 <Label>Grupo del calendario</Label>
                 <Select value={editGroupId} onValueChange={setEditGroupId}>
                   <SelectTrigger>
                     <SelectValue placeholder="Selecciona un grupo" />
                   </SelectTrigger>
                   <SelectContent>
                     {workGroups.map(g => (
                       <SelectItem key={g.id} value={g.id}>
                         <div className="flex items-center gap-2">
                           <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }} />
                           {g.name}
                         </div>
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
 
               <div className="space-y-2">
                 <Label>Color</Label>
                 <div className="flex flex-wrap gap-2">
                   {PRESET_COLORS.map(color => (
                     <button
                       key={color}
                       type="button"
                       className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${editColor === color ? "ring-2 ring-offset-2 ring-primary" : ""}`}
                       style={{ backgroundColor: color }}
                       onClick={() => setEditColor(color)}
                     />
                   ))}
                 </div>
               </div>
             </div>
 
             <DialogFooter>
               <Button variant="outline" onClick={() => setEditingWorker(null)}>
                 Cancelar
               </Button>
               <Button onClick={handleUpdateWorker} disabled={saving}>
                 {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                 Guardar Cambios
               </Button>
             </DialogFooter>
           </DialogContent>
         </Dialog>
       </DialogContent>
     </Dialog>
   );
 };