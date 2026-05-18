import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Save, Check, RotateCcw, History, ChevronDown, ChevronUp, Loader2, GripVertical, Plus, Trash2, UserCheck,
  FileText, Eye, EyeOff, Upload, X, Undo2, MessageSquare, StickyNote, Download, HardDrive, RotateCw
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type WorkerTeam = { id: string; department_id: string; name: string; sort_order: number };
type Worker = {
  id: string; department_id: string; worker_team_id: string | null;
  work_group_id: string | null; worker_number: string; name: string;
  email: string | null; is_on_leave: boolean; is_on_vacation: boolean;
  is_responsable?: boolean;
  user_id: string | null; vacation_days_adjustment: number; pending_vacation_days: number;
};
type WorkGroup = { id: string; department_id: string; name: string; color: string };
type WorkGroupTeam = { id: string; work_group_id: string; worker_team_id: string };

// Snapshot types
type SnapshotTeam = { id: string; name: string; display_name?: string; sort_order: number };
type SnapshotWorkGroup = { id: string; name: string; color: string };
type SnapshotWorkGroupTeam = { work_group_id: string; worker_team_id: string };
type SnapshotWorkerAssignment = { worker_id: string; worker_team_id: string | null; work_group_id: string | null };
type SnapshotTeamResponsable = { team_id: string; responsable_worker_id: string | null };
type Snapshot = {
  teams: SnapshotTeam[];
  work_groups: SnapshotWorkGroup[];
  work_group_teams: SnapshotWorkGroupTeam[];
  worker_assignments: SnapshotWorkerAssignment[];
  team_responsables: SnapshotTeamResponsable[];
  team_notes?: Record<string, string>;
  general_notes?: string;
};

type ChangeLogEntry = {
  timestamp: string;
  type: string;
  description: string;
};

type DraftRecord = {
  id: string; department_id: string; snapshot: Snapshot;
  is_applied: boolean; applied_at: string | null; applied_by: string | null;
  created_at: string; created_by: string | null; label: string | null;
  change_log: ChangeLogEntry[] | null;
};

interface TeamConfiguratorTabProps {
  departmentId: string;
  departmentName?: string;
  workerTeams: WorkerTeam[];
  workers: Worker[];
  workGroups: WorkGroup[];
  workGroupTeams: WorkGroupTeam[];
  getSessionToken: () => string | null;
  onApplied?: () => void;
}

function buildSnapshotFromCurrent(
  workerTeams: WorkerTeam[], workGroups: WorkGroup[],
  workGroupTeams: WorkGroupTeam[], workers: Worker[],
  teamResponsables?: { team_id: string; responsable_worker_id: string | null }[],
  departmentId?: string
): Snapshot {
  // Filter workers to only include those belonging to the target department
  const deptWorkers = departmentId ? workers.filter(w => w.department_id === departmentId) : workers;
  return {
    teams: workerTeams.map(t => ({ id: t.id, name: t.name, display_name: (t as any).display_name || undefined, sort_order: t.sort_order })),
    work_groups: workGroups.map(g => ({ id: g.id, name: g.name, color: g.color })),
    work_group_teams: workGroupTeams.map(wgt => ({ work_group_id: wgt.work_group_id, worker_team_id: wgt.worker_team_id })),
    worker_assignments: deptWorkers.map(w => ({ worker_id: w.id, worker_team_id: w.worker_team_id, work_group_id: w.work_group_id })),
    team_responsables: teamResponsables || workerTeams.map(t => ({ team_id: t.id, responsable_worker_id: (t as any).responsable_worker_id || null })),
  };
}

export default function TeamConfiguratorTab({
  departmentId, departmentName, workerTeams, workers, workGroups, workGroupTeams, getSessionToken, onApplied
}: TeamConfiguratorTabProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [originalSnapshot, setOriginalSnapshot] = useState<Snapshot | null>(null);
  // dbSnapshot always holds the real DB state — used to determine if "Aplicar cambios" should be enabled
  const [dbSnapshot, setDbSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [allResponsables, setAllResponsables] = useState<{ id: string; name: string; department_name?: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<DraftRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [dragOverTeamId, setDragOverTeamId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<{ type: string; id: string } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const frozenGroupingRef = useRef<{ grouped: Record<string, SnapshotTeam[]>; sorted: string[] } | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  // Changelog state
  const [changeLog, setChangeLog] = useState<ChangeLogEntry[]>([]);
  const [showChanges, setShowChanges] = useState(false);

  // Undo stack
  const undoStackRef = useRef<{ snapshot: Snapshot; changeLog: ChangeLogEntry[] }[]>([]);
  const MAX_UNDO = 50;

  const pushUndo = () => {
    if (!snapshot) return;
    undoStackRef.current = [
      ...undoStackRef.current.slice(-(MAX_UNDO - 1)),
      { snapshot: JSON.parse(JSON.stringify(snapshot)), changeLog: [...changeLog] },
    ];
  };

  const undo = () => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    setSnapshot(prev.snapshot);
    setChangeLog(prev.changeLog);
    toast.info("Acción deshecha");
  };

  // Save dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");

  // Blank draft dialog
  const [showBlankDraftDialog, setShowBlankDraftDialog] = useState(false);

  // Note dialogs
  const [editingTeamNoteId, setEditingTeamNoteId] = useState<string | null>(null);
  const [teamNoteText, setTeamNoteText] = useState("");
  const [showGeneralNotes, setShowGeneralNotes] = useState(false);
  const [generalNoteText, setGeneralNoteText] = useState("");
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);

  // Config backups state
  const [showBackups, setShowBackups] = useState(false);
  const [configBackups, setConfigBackups] = useState<{ id: string; label: string; created_at: string; created_by: string | null; snapshot: any }[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [savingBackup, setSavingBackup] = useState(false);
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);
  const [showRestoreDialog, setShowRestoreDialog] = useState<string | null>(null);
  const [deletingBackupId, setDeletingBackupId] = useState<string | null>(null);
  const [backupLabel, setBackupLabel] = useState("");
  const [showSaveBackupDialog, setShowSaveBackupDialog] = useState(false);

  // PDF generation
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfLightMode, setPdfLightMode] = useState(false);
  const pdfContentRef = useRef<HTMLDivElement>(null);

  // Helper to add a changelog entry
  const addLog = (type: string, description: string) => {
    setChangeLog(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type,
      description,
    }]);
  };

  // Helper to resolve team name from snapshot
  const getTeamName = (teamId: string | null) => {
    if (!teamId || !snapshot) return "Sin asignar";
    return snapshot.teams.find(t => t.id === teamId)?.name || "Equipo desconocido";
  };

  const getWorkerName = (workerId: string) => {
    return workers.find(w => w.id === workerId)?.name
      || allResponsables.find(r => r.id === workerId)?.name
      || "Trabajador";
  };

  // Load all responsable workers across all departments
  useEffect(() => {
    const fetchAllResponsables = async () => {
      const token = getSessionToken();
      try {
        const { data } = await supabase.functions.invoke("admin-operations", {
          body: { action: "getAllResponsables", sessionToken: token },
        });
        if (data?.success) {
          setAllResponsables(data.responsables || []);
        }
      } catch (e) {
        console.error("Error fetching responsables:", e);
      }
    };
    fetchAllResponsables();
  }, []);

  // Always start from current DB state
  useEffect(() => {
    initFromCurrentState();
  }, [departmentId]);

  const initFromCurrentState = () => {
    setLoading(true);
    const snap = buildSnapshotFromCurrent(workerTeams, workGroups, workGroupTeams, workers, undefined, departmentId);
    setSnapshot(snap);
    setOriginalSnapshot(snap);
    setDbSnapshot(snap);
    setDraftId(null);
    setChangeLog([]);
    setDraftLabel("");
    setLoading(false);
  };

  // Load a specific draft into the configurator (called from History panel)
  const loadDraftIntoConfigurator = (draft: DraftRecord) => {
    const rawSnap = draft.snapshot as any;
    const snap: Snapshot = {
      teams: (rawSnap.teams || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        display_name: t.display_name || undefined,
        sort_order: t.sort_order ?? 0,
      })),
      work_groups: rawSnap.work_groups || [],
      work_group_teams: rawSnap.work_group_teams || [],
      worker_assignments: rawSnap.worker_assignments || [],
      team_responsables: rawSnap.team_responsables || rawSnap.teams?.map((t: any) => ({ team_id: t.id, responsable_worker_id: null })) || [],
      team_notes: rawSnap.team_notes,
      general_notes: rawSnap.general_notes,
    };

    // Reconcile: merge new department workers, remove gone workers
    const deptWorkers = workers.filter(w => w.department_id === departmentId);
    const assignedWorkerIds = new Set(snap.worker_assignments.map(wa => wa.worker_id));
    const newWorkers = deptWorkers.filter(w => !assignedWorkerIds.has(w.id));
    if (newWorkers.length > 0) {
      snap.worker_assignments = [
        ...snap.worker_assignments,
        ...newWorkers.map(w => ({ worker_id: w.id, worker_team_id: w.worker_team_id, work_group_id: w.work_group_id })),
      ];
    }
    const deptWorkerIds = new Set(deptWorkers.map(w => w.id));
    snap.worker_assignments = snap.worker_assignments.filter(wa => deptWorkerIds.has(wa.worker_id));

    setSnapshot(snap);
    const dbSnap = buildSnapshotFromCurrent(workerTeams, workGroups, workGroupTeams, workers, undefined, departmentId);
    setOriginalSnapshot(dbSnap);
    setDbSnapshot(dbSnap);
    setDraftId(draft.id);
    setDraftLabel((draft as any).label || "");
    const savedLog = (draft as any).change_log;
    if (savedLog && Array.isArray(savedLog)) {
      setChangeLog(savedLog as ChangeLogEntry[]);
    } else {
      setChangeLog([]);
    }
    toast.success(`Borrador "${(draft as any).label || 'Sin nombre'}" cargado`);
  };

  const isDirty = snapshot && originalSnapshot && JSON.stringify(snapshot) !== JSON.stringify(originalSnapshot);
  // hasPendingDbChanges: true when current snapshot differs from what's actually in the DB
  const hasPendingDbChanges = snapshot && dbSnapshot && JSON.stringify(snapshot) !== JSON.stringify(dbSnapshot);

  const changeCount = (() => {
    if (!snapshot || !originalSnapshot) return 0;
    let count = 0;
    snapshot.teams.forEach(t => {
      const orig = originalSnapshot.teams.find(ot => ot.id === t.id);
      if (!orig || orig.name !== t.name) count++;
    });
    count += snapshot.teams.filter(t => !originalSnapshot.teams.find(ot => ot.id === t.id)).length;
    count += originalSnapshot.teams.filter(t => !snapshot.teams.find(ot => ot.id === t.id)).length;
    snapshot.work_groups.forEach(g => {
      const orig = originalSnapshot.work_groups.find(og => og.id === g.id);
      if (orig && (orig.name !== g.name || orig.color !== g.color)) count++;
    });
    snapshot.worker_assignments.forEach(wa => {
      const orig = originalSnapshot.worker_assignments.find(o => o.worker_id === wa.worker_id);
      if (orig && (orig.worker_team_id !== wa.worker_team_id || orig.work_group_id !== wa.work_group_id)) count++;
    });
    return count;
  })();

  // Snapshot mutation helpers — with changelog
  const updateTeamName = (teamId: string, name: string) => {
    if (!snapshot) return;
    setSnapshot({
      ...snapshot,
      teams: snapshot.teams.map(t => t.id === teamId ? { ...t, name } : t),
    });
  };

  const updateTeamDisplayName = (teamId: string, display_name: string) => {
    if (!snapshot) return;
    setSnapshot({
      ...snapshot,
      teams: snapshot.teams.map(t => t.id === teamId ? { ...t, display_name: display_name || undefined } : t),
    });
  };

  const updateMultipleTeamsDisplayName = (teamIds: string[], display_name: string) => {
    if (!snapshot) return;
    const idSet = new Set(teamIds);
    setSnapshot({
      ...snapshot,
      teams: snapshot.teams.map(t => idSet.has(t.id) ? { ...t, display_name: display_name || undefined } : t),
    });
  };

  const commitTeamNameChange = (teamId: string) => {
    if (!snapshot || !originalSnapshot) return;
    const current = snapshot.teams.find(t => t.id === teamId);
    const original = originalSnapshot.teams.find(t => t.id === teamId);
    if (current && original && current.name !== original.name) {
      addLog("team_renamed", `Código equipo '${original.name}' cambiado a '${current.name}'`);
    }
  };

  const commitTeamDisplayNameChange = (teamId: string) => {
    if (!snapshot || !originalSnapshot) return;
    const current = snapshot.teams.find(t => t.id === teamId);
    const original = originalSnapshot.teams.find(t => t.id === teamId);
    const oldDN = original?.display_name || "";
    const newDN = current?.display_name || "";
    if (oldDN !== newDN) {
      addLog("team_renamed", `Nombre grupo '${oldDN || '(sin nombre)'}' cambiado a '${newDN || '(sin nombre)'}'`);
    }
  };

  const updateWorkGroupName = (groupId: string, name: string) => {
    if (!snapshot) return;
    setSnapshot({
      ...snapshot,
      work_groups: snapshot.work_groups.map(g => g.id === groupId ? { ...g, name } : g),
    });
  };

  const commitWorkGroupNameChange = (groupId: string) => {
    if (!snapshot || !originalSnapshot) return;
    const current = snapshot.work_groups.find(g => g.id === groupId);
    const original = originalSnapshot.work_groups.find(g => g.id === groupId);
    if (current && original && current.name !== original.name) {
      addLog("workgroup_renamed", `Subgrupo '${original.name}' renombrado a '${current.name}'`);
    }
  };

  const updateWorkGroupColor = (groupId: string, color: string) => {
    if (!snapshot) return;
    const oldGroup = snapshot.work_groups.find(g => g.id === groupId);
    if (oldGroup && oldGroup.color !== color) {
      pushUndo();
    }
    setSnapshot({
      ...snapshot,
      work_groups: snapshot.work_groups.map(g => g.id === groupId ? { ...g, color } : g),
    });
    if (oldGroup && oldGroup.color !== color) {
      addLog("workgroup_color_changed", `Subgrupo '${oldGroup.name}' cambió de color ${oldGroup.color} a ${color}`);
    }
  };

  const assignTeamToWorkGroup = (teamId: string, workGroupId: string) => {
    if (!snapshot) return;
    pushUndo();
    // Remove any existing mapping for this team
    const newMappings = snapshot.work_group_teams.filter(wgt => wgt.worker_team_id !== teamId);
    newMappings.push({ work_group_id: workGroupId, worker_team_id: teamId });
    // Also update worker assignments for workers in this team
    const newAssignments = snapshot.worker_assignments.map(wa =>
      wa.worker_team_id === teamId ? { ...wa, work_group_id: workGroupId } : wa
    );
    setSnapshot({
      ...snapshot,
      work_group_teams: newMappings,
      worker_assignments: newAssignments,
    });
    const groupName = snapshot.work_groups.find(g => g.id === workGroupId)?.name || workGroupId;
    const teamName = snapshot.teams.find(t => t.id === teamId)?.name || teamId;
    addLog("workgroup_color_changed", `Equipo '${teamName}' asignado al grupo vacacional '${groupName}'`);
  };

  const moveWorkerToTeam = (workerId: string, targetTeamId: string | null) => {
    if (!snapshot) return;
    const wa = snapshot.worker_assignments.find(a => a.worker_id === workerId);
    const fromTeam = getTeamName(wa?.worker_team_id || null);
    const toTeam = getTeamName(targetTeamId);
    const workerName = getWorkerName(workerId);

    if (fromTeam !== toTeam) {
      pushUndo();
    }

    const targetMapping = targetTeamId ? snapshot.work_group_teams.find(wgt => wgt.worker_team_id === targetTeamId) : null;
    const targetGroupId = targetMapping?.work_group_id || null;

    setSnapshot({
      ...snapshot,
      worker_assignments: snapshot.worker_assignments.map(a =>
        a.worker_id === workerId
          ? { ...a, worker_team_id: targetTeamId, work_group_id: targetGroupId }
          : a
      ),
    });

    if (fromTeam !== toTeam) {
      addLog("worker_moved", `${workerName} movido de '${fromTeam}' a '${toTeam}'`);
    }
  };

  const updateTeamResponsable = (teamId: string, responsableWorkerId: string | null) => {
    if (!snapshot) return;
    pushUndo();
    const teamName = getTeamName(teamId);
    const workerName = responsableWorkerId ? getWorkerName(responsableWorkerId) : "ninguno";

    const existing = snapshot.team_responsables.find(tr => tr.team_id === teamId);
    if (existing) {
      setSnapshot({
        ...snapshot,
        team_responsables: snapshot.team_responsables.map(tr =>
          tr.team_id === teamId ? { ...tr, responsable_worker_id: responsableWorkerId } : tr
        ),
      });
    } else {
      setSnapshot({
        ...snapshot,
        team_responsables: [...snapshot.team_responsables, { team_id: teamId, responsable_worker_id: responsableWorkerId }],
      });
    }
    addLog("responsable_changed", `Responsable de '${teamName}' cambiado a ${workerName}`);
  };

  // Update responsable for ALL teams in a group at once
  const updateGroupResponsable = (teamIds: string[], groupName: string, responsableWorkerId: string | null) => {
    if (!snapshot) return;
    pushUndo();
    const workerName = responsableWorkerId ? getWorkerName(responsableWorkerId) : "ninguno";
    const teamIdSet = new Set(teamIds);
    
    const newResponsables = snapshot.team_responsables.map(tr =>
      teamIdSet.has(tr.team_id) ? { ...tr, responsable_worker_id: responsableWorkerId } : tr
    );
    // Add entries for teams not yet in the list
    for (const tid of teamIds) {
      if (!newResponsables.find(tr => tr.team_id === tid)) {
        newResponsables.push({ team_id: tid, responsable_worker_id: responsableWorkerId });
      }
    }
    setSnapshot({ ...snapshot, team_responsables: newResponsables });
    addLog("responsable_changed", `Responsable de grupo '${groupName}' cambiado a ${workerName}`);
  };

  // Use all responsables from all departments; filter out already assigned ones
  const assignedResponsableIds = new Set(
    (snapshot?.team_responsables || [])
      .filter(tr => tr.responsable_worker_id)
      .map(tr => tr.responsable_worker_id!)
  );
  const responsableWorkers = allResponsables;

  const addNewTeam = (groupDisplayName?: string, groupWorkGroupId?: string) => {
    if (!snapshot) return;
    pushUndo();
    const newId = crypto.randomUUID();
    const maxOrder = snapshot.teams.reduce((max, t) => Math.max(max, t.sort_order), 0);
    const newTeam: SnapshotTeam = {
      id: newId,
      name: `Nuevo`,
      display_name: groupDisplayName || undefined,
      sort_order: maxOrder + 1,
    };
    const newWorkGroupTeams = groupWorkGroupId
      ? [...snapshot.work_group_teams, { work_group_id: groupWorkGroupId, worker_team_id: newId }]
      : snapshot.work_group_teams;
    
    // Inherit group responsable if adding to an existing group
    const newResponsables = [...snapshot.team_responsables];
    if (groupDisplayName) {
      const siblingTeam = snapshot.teams.find(t => t.display_name === groupDisplayName);
      if (siblingTeam) {
        const siblingResp = snapshot.team_responsables.find(tr => tr.team_id === siblingTeam.id)?.responsable_worker_id || null;
        newResponsables.push({ team_id: newId, responsable_worker_id: siblingResp });
      }
    }
    
    setSnapshot({
      ...snapshot,
      teams: [...snapshot.teams, newTeam],
      work_group_teams: newWorkGroupTeams,
      team_responsables: newResponsables,
    });
    const label = groupDisplayName ? `'Nuevo' en grupo '${groupDisplayName}'` : `'Nuevo'`;
    addLog("team_added", `Nuevo equipo ${label} creado`);
    setTimeout(() => setEditingField({ type: "team", id: newId }), 100);
  };

  // Blank draft: unassign all non-responsable workers
  const blankDraftWorkerCount = (() => {
    if (!snapshot) return 0;
    const responsableIds = new Set(
      snapshot.team_responsables
        .filter(tr => tr.responsable_worker_id)
        .map(tr => tr.responsable_worker_id!)
    );
    return snapshot.worker_assignments.filter(wa =>
      wa.worker_team_id && !responsableIds.has(wa.worker_id)
    ).length;
  })();

  const createBlankDraft = () => {
    if (!snapshot) return;
    pushUndo();
    const responsableIds = new Set(
      snapshot.team_responsables
        .filter(tr => tr.responsable_worker_id)
        .map(tr => tr.responsable_worker_id!)
    );
    const newAssignments = snapshot.worker_assignments.map(wa => {
      if (wa.worker_team_id && !responsableIds.has(wa.worker_id)) {
        return { ...wa, worker_team_id: null, work_group_id: null };
      }
      return wa;
    });
    const unassignedCount = snapshot.worker_assignments.filter(wa =>
      wa.worker_team_id && !responsableIds.has(wa.worker_id)
    ).length;

    setSnapshot({ ...snapshot, worker_assignments: newAssignments });
    // Don't update dbSnapshot — blank draft is a planning tool, not a DB change
    setDraftId(null);
    setDraftLabel("");
    setChangeLog([{
      timestamp: new Date().toISOString(),
      type: "blank_draft",
      description: `Borrador limpio creado: ${unassignedCount} trabajador${unassignedCount !== 1 ? 'es' : ''} desasignado${unassignedCount !== 1 ? 's' : ''}`,
    }]);
    undoStackRef.current = [];
    setShowBlankDraftDialog(false);
    toast.success(`Borrador limpio creado — ${unassignedCount} trabajadores en "Sin equipo"`);
  };

  const removeTeam = (teamId: string) => {
    if (!snapshot) return;
    pushUndo();
    const team = snapshot.teams.find(t => t.id === teamId);
    const workersInTeam = snapshot.worker_assignments.filter(wa => wa.worker_team_id === teamId).length;
    setSnapshot({
      ...snapshot,
      teams: snapshot.teams.filter(t => t.id !== teamId),
      work_group_teams: snapshot.work_group_teams.filter(wgt => wgt.worker_team_id !== teamId),
      worker_assignments: snapshot.worker_assignments.map(wa =>
        wa.worker_team_id === teamId ? { ...wa, worker_team_id: null, work_group_id: null } : wa
      ),
    });
    addLog("team_removed", `Equipo '${team?.name || teamId}' eliminado (${workersInTeam} trabajador${workersInTeam !== 1 ? 'es' : ''} movido${workersInTeam !== 1 ? 's' : ''} a Sin asignar)`);
  };

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, workerId: string) => {
    e.dataTransfer.setData("worker_id", workerId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetTeamId: string | null) => {
    e.preventDefault();
    const workerId = e.dataTransfer.getData("worker_id");
    if (workerId) moveWorkerToTeam(workerId, targetTeamId);
    setDragOverTeamId(null);
  };

  // Save draft — opens dialog for naming
  const openSaveDialog = () => {
    setShowSaveDialog(true);
  };

  const confirmSaveDraft = async () => {
    if (!snapshot) return;
    if (!draftLabel.trim()) {
      toast.error("Introduce un nombre para el borrador");
      return;
    }
    setSaving(true);
    setShowSaveDialog(false);
    try {
      const token = getSessionToken();
      const res = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "saveTeamDraft",
          sessionToken: token,
          data: { departmentId, snapshot, draftId, label: draftLabel.trim(), changeLog }
        },
      });
      if (res.data?.success) {
        setDraftId(res.data.draftId);
        setOriginalSnapshot(JSON.parse(JSON.stringify(snapshot)));
        // Don't update dbSnapshot — draft saved != applied to DB
        toast.success("Borrador guardado: " + draftLabel.trim());
      } else {
        toast.error(res.data?.error || "Error guardando borrador");
      }
    } catch {
      toast.error("Error guardando borrador");
    }
    setSaving(false);
  };

  // Download current config backup as JSON
  const downloadConfigBackup = () => {
    if (!originalSnapshot) return;
    const deptName = departmentName || departmentId;
    const backupData = {
      exported_at: new Date().toISOString(),
      department_id: departmentId,
      department_name: deptName,
      snapshot: originalSnapshot,
      workers: workers.filter(w => w.department_id === departmentId).map(w => ({
        id: w.id, name: w.name, worker_number: w.worker_number,
        worker_team_id: w.worker_team_id, work_group_id: w.work_group_id,
      })),
    };
    const json = JSON.stringify(backupData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-equipos-${deptName.replace(/\s+/g, "-").toLowerCase()}-${format(new Date(), "yyyy-MM-dd-HHmm")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Backup descargado");
  };

  // Config backup functions (backend)
  const loadConfigBackups = async () => {
    setLoadingBackups(true);
    try {
      const token = getSessionToken();
      const res = await supabase.functions.invoke("admin-operations", {
        body: { action: "listTeamConfigBackups", sessionToken: token, data: { departmentId } },
      });
      if (res.data?.success) {
        setConfigBackups(res.data.backups || []);
      }
    } catch (e) {
      console.error("Error loading config backups:", e);
    }
    setLoadingBackups(false);
  };

  const toggleBackups = () => {
    if (!showBackups) loadConfigBackups();
    setShowBackups(!showBackups);
  };

  const saveConfigBackup = async () => {
    if (!backupLabel.trim()) {
      toast.error("Introduce un nombre para el backup");
      return;
    }
    setSavingBackup(true);
    setShowSaveBackupDialog(false);
    try {
      const token = getSessionToken();
      const res = await supabase.functions.invoke("admin-operations", {
        body: { action: "saveTeamConfigBackup", sessionToken: token, data: { departmentId, label: backupLabel.trim() } },
      });
      if (res.data?.success) {
        toast.success("Backup guardado correctamente");
        setBackupLabel("");
        loadConfigBackups();
      } else {
        toast.error(res.data?.error || "Error guardando backup");
      }
    } catch {
      toast.error("Error guardando backup");
    }
    setSavingBackup(false);
  };

  const restoreConfigBackup = async (backupId: string) => {
    setRestoringBackupId(backupId);
    setShowRestoreDialog(null);
    try {
      const token = getSessionToken();
      const res = await supabase.functions.invoke("admin-operations", {
        body: { action: "restoreTeamConfigBackup", sessionToken: token, data: { departmentId, backupId } },
      });
      if (res.data?.success) {
        toast.success("Configuración restaurada correctamente. Recargando...");
        loadConfigBackups();
        onApplied?.();
        // Reload the draft/snapshot from current state
        setTimeout(() => initFromCurrentState(), 500);
      } else {
        toast.error(res.data?.error || "Error restaurando backup");
      }
    } catch {
      toast.error("Error restaurando backup");
    }
    setRestoringBackupId(null);
  };

  const deleteConfigBackup = async (backupId: string) => {
    try {
      const token = getSessionToken();
      const res = await supabase.functions.invoke("admin-operations", {
        body: { action: "deleteTeamConfigBackup", sessionToken: token, data: { backupId } },
      });
      if (res.data?.success) {
        setConfigBackups(prev => prev.filter(b => b.id !== backupId));
        toast.success("Backup eliminado");
      } else {
        toast.error(res.data?.error || "Error eliminando backup");
      }
    } catch {
      toast.error("Error eliminando backup");
    }
    setDeletingBackupId(null);
  };

  // Apply changes
  const applyChanges = async () => {
    if (!snapshot) return;
    setApplying(true);
    setShowApplyDialog(false);
    try {
      const token = getSessionToken();
      const res = await supabase.functions.invoke("admin-operations", {
        body: { action: "applyTeamConfig", sessionToken: token, data: { departmentId, snapshot, draftId, changeLog } },
      });
      if (res.data?.success) {
        setOriginalSnapshot(snapshot);
        setDbSnapshot(JSON.parse(JSON.stringify(snapshot)));
        setDraftId(null);
        setChangeLog([]);
        setDraftLabel("");
        toast.success("Cambios aplicados correctamente");
        onApplied?.();
      } else {
        toast.error(res.data?.error || "Error aplicando cambios");
      }
    } catch {
      toast.error("Error aplicando cambios");
    }
    setApplying(false);
  };

  // Discard changes
  const discard = () => {
    const snap = buildSnapshotFromCurrent(workerTeams, workGroups, workGroupTeams, workers, undefined, departmentId);
    setSnapshot(snap);
    setOriginalSnapshot(snap);
    setDbSnapshot(snap);
    setDraftId(null);
    setChangeLog([]);
    setDraftLabel("");
    toast.info("Cambios descartados");
  };

  // Load history
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const token = getSessionToken();
      const res = await supabase.functions.invoke("admin-operations", {
        body: { action: "listTeamDrafts", sessionToken: token, data: { departmentId } },
      });
      if (res.data?.success) {
        setHistory((res.data.drafts || []) as unknown as DraftRecord[]);
      } else {
        console.error("Error loading drafts:", res.data?.error);
        setHistory([]);
      }
    } catch (e) {
      console.error("Error loading drafts:", e);
      setHistory([]);
    }
    setLoadingHistory(false);
  };

  const toggleHistory = () => {
    if (!showHistory) loadHistory();
    setShowHistory(!showHistory);
  };

  const restoreFromHistory = (draft: DraftRecord) => {
    loadDraftIntoConfigurator(draft);
  };

  const deleteDraft = async (id: string) => {
    try {
      const token = getSessionToken();
      const res = await supabase.functions.invoke("admin-operations", {
        body: { action: "deleteTeamDraft", sessionToken: token, data: { draftId: id } },
      });
      if (res.data?.success) {
        setHistory(prev => prev.filter(h => h.id !== id));
        if (draftId === id) {
          setDraftId(null);
          setChangeLog([]);
          setDraftLabel("");
          const snap = buildSnapshotFromCurrent(workerTeams, workGroups, workGroupTeams, workers, undefined, departmentId);
          setSnapshot(snap);
          setOriginalSnapshot(snap);
          setDbSnapshot(snap);
        }
        toast.success("Borrador eliminado");
      } else {
        toast.error(res.data?.error || "Error eliminando borrador");
      }
    } catch {
      toast.error("Error eliminando borrador");
    }
    setDeletingDraftId(null);
  };

  // Focus input when editing starts
  useEffect(() => {
    if (editingField && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingField]);

  if (loading || !snapshot) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group teams by display_name or prefix fallback
  // Freeze grouping while editing a display_name to prevent re-sorting mid-edit
  const isEditingDisplayName = editingField?.type === "display_name";
  let groupedTeams: Record<string, SnapshotTeam[]>;
  let sortedPrefixes: string[];

  if (isEditingDisplayName && frozenGroupingRef.current) {
    // Use frozen keys but refresh team data from current snapshot
    sortedPrefixes = frozenGroupingRef.current.sorted;
    groupedTeams = {};
    for (const key of sortedPrefixes) {
      const frozenIds = frozenGroupingRef.current.grouped[key]?.map(t => t.id) || [];
      groupedTeams[key] = frozenIds
        .map(id => snapshot.teams.find(t => t.id === id))
        .filter((t): t is SnapshotTeam => !!t);
    }
  } else {
    groupedTeams = {};
    snapshot.teams.forEach(team => {
      const groupKey = team.display_name || `Grupo ${team.name.charAt(0).toUpperCase()}`;
      if (!groupedTeams[groupKey]) groupedTeams[groupKey] = [];
      groupedTeams[groupKey].push(team);
    });
    sortedPrefixes = Object.keys(groupedTeams).sort();
    frozenGroupingRef.current = null;
    if (sortedPrefixes.some(p => p.startsWith('Grupo '))) {
      console.log('[TeamConfigurator] Grouping fallback detected. Teams:', snapshot.teams.map(t => ({ name: t.name, display_name: t.display_name, keys: Object.keys(t) })));
    }
  }

  // Set of all worker IDs that are assigned as responsables to any team
  const allResponsableWorkerIds = new Set(
    (snapshot.team_responsables || [])
      .map(tr => tr.responsable_worker_id)
      .filter((id): id is string => !!id)
  );

  const getTeamWorkers = (teamId: string) =>
    snapshot.worker_assignments
      .filter(wa => wa.worker_team_id === teamId)
      .map(wa => workers.find(w => w.id === wa.worker_id))
      .filter(Boolean)
      .filter(w => !allResponsableWorkerIds.has(w.id)) as Worker[];

  const unassignedWorkers = snapshot.worker_assignments
    .filter(wa => !wa.worker_team_id)
    .map(wa => workers.find(w => w.id === wa.worker_id))
    .filter(Boolean)
    .filter(w => !allResponsableWorkerIds.has(w.id)) as Worker[];

  const getWorkGroupForTeam = (teamId: string) => {
    const mapping = snapshot.work_group_teams.find(wgt => wgt.worker_team_id === teamId);
    return mapping ? snapshot.work_groups.find(g => g.id === mapping.work_group_id) || null : null;
  };

  const renderWorkerChip = (w: Worker) => (
    <span
      key={w.id}
      draggable
      onDragStart={e => {
        if (e.metaKey || e.ctrlKey) { e.preventDefault(); return; }
        handleDragStart(e, w.id);
      }}
      onMouseDown={e => {
        if ((e.metaKey || e.ctrlKey) && w.worker_number) {
          e.preventDefault();
          e.stopPropagation();
          window.open(`https://salix.verdnatura.es/#!/worker/${w.worker_number}/summary`, '_blank');
        }
      }}
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded cursor-grab active:cursor-grabbing select-none inline-flex items-center gap-1 transition-colors",
        w.is_on_leave ? "bg-destructive/20 text-destructive line-through"
          : w.is_on_vacation ? "bg-cyan-500/20 text-cyan-400 italic"
          : "bg-muted text-foreground hover:bg-muted/80"
      )}
      title={w.worker_number ? "Cmd/Ctrl+Click para abrir en Sálix" : undefined}
    >
      <GripVertical className="h-2.5 w-2.5 opacity-40" />
      {w.name}
    </span>
  );

  const renderChangeLogEntries = (entries: ChangeLogEntry[]) => (
    <div className="space-y-1 max-h-60 overflow-y-auto">
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Sin cambios registrados.</p>
      ) : (
        entries.map((entry, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px] py-1 px-2 rounded bg-muted/30">
            <span className="text-muted-foreground whitespace-nowrap shrink-0">
              {format(new Date(entry.timestamp), "HH:mm:ss")}
            </span>
            <span className={cn(
              "shrink-0 px-1 rounded text-[9px] font-medium",
              entry.type === "worker_moved" && "bg-blue-500/20 text-blue-400",
              entry.type === "team_renamed" && "bg-amber-500/20 text-amber-500",
              entry.type === "team_added" && "bg-green-500/20 text-green-500",
              entry.type === "team_removed" && "bg-destructive/20 text-destructive",
              entry.type === "workgroup_color_changed" && "bg-purple-500/20 text-purple-400",
              entry.type === "workgroup_renamed" && "bg-amber-500/20 text-amber-500",
              entry.type === "responsable_changed" && "bg-cyan-500/20 text-cyan-400",
              entry.type === "blank_draft" && "bg-orange-500/20 text-orange-500",
            )}>
              {entry.type === "worker_moved" ? "Movimiento" :
               entry.type === "team_renamed" ? "Renombrado" :
               entry.type === "team_added" ? "Nuevo equipo" :
               entry.type === "team_removed" ? "Eliminado" :
               entry.type === "workgroup_color_changed" ? "Color" :
               entry.type === "workgroup_renamed" ? "Subgrupo" :
               entry.type === "responsable_changed" ? "Responsable" :
               entry.type === "blank_draft" ? "Borrador limpio" : entry.type}
            </span>
            <span className="text-foreground">{entry.description}</span>
          </div>
        ))
      )}
    </div>
  );

  // PDF generation function
  const handleDownloadPdf = () => {
    setGeneratingPdf(true);
    setTimeout(() => {
      const printContent = pdfContentRef.current;
      if (!printContent) {
        setGeneratingPdf(false);
        toast.error("Error al generar el PDF");
        return;
      }
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setGeneratingPdf(false);
        toast.error("No se pudo abrir la ventana de impresión");
        return;
      }
      const bgColor = pdfLightMode ? '#ffffff' : '#0a0a0a';
      const textColor = pdfLightMode ? '#1a1a1a' : '#ffffff';
      const title = `Configurador ${departmentName || ''} ${draftLabel ? `- ${draftLabel}` : ''}`.trim();
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${title}</title>
          <style>
            @page { size: A3 landscape; margin: 0; }
            @media print {
              html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
            html, body {
              margin: 0; padding: 0; width: 100%; height: 100%;
              background: ${bgColor} !important; background-color: ${bgColor} !important;
              font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
              color: ${textColor};
            }
            body { padding: 15mm 20mm 25mm 20mm; }
            * { box-sizing: border-box; }
          </style>
          <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">
        </head>
        <body style="background: ${bgColor} !important; background-color: ${bgColor} !important;">
          ${printContent.innerHTML}
        </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
        setGeneratingPdf(false);
      }, 500);
    }, 100);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Configurador de Equipos</h3>
            {isDirty && (
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-500 border-0">
                {changeCount} cambio{changeCount !== 1 ? "s" : ""} pendiente{changeCount !== 1 ? "s" : ""}
              </Badge>
            )}
            {draftLabel && (
              <Badge variant="outline" className="text-[10px]">{draftLabel}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => {
              setGeneralNoteText(snapshot.general_notes || "");
              setShowGeneralNotes(true);
            }} className="gap-1 relative">
              <StickyNote className="h-3 w-3" /> Notas
              {snapshot.general_notes && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowBlankDraftDialog(true)} className="gap-1">
              <FileText className="h-3 w-3" /> Borrador limpio
            </Button>
            <Button variant="outline" size="sm" onClick={() => addNewTeam()} className="gap-1">
              <Plus className="h-3 w-3" /> Equipo
            </Button>
            <Button variant="outline" size="sm" onClick={toggleHistory} className="gap-1">
              <History className="h-3 w-3" />
              <span className="hidden sm:inline">Historial</span>
              {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            <Button variant="outline" size="sm" onClick={toggleBackups} className="gap-1">
              <HardDrive className="h-3 w-3" />
              <span className="hidden sm:inline">Backups</span>
              {showBackups ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            <div className="flex items-center gap-2 border-l border-border/30 pl-2 ml-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="pdf-mode-config" className="text-[10px] whitespace-nowrap">Modo claro</Label>
                <Switch
                  id="pdf-mode-config"
                  checked={pdfLightMode}
                  onCheckedChange={setPdfLightMode}
                  className="scale-75"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={handleDownloadPdf}
                disabled={generatingPdf}
              >
                <Download className="h-3 w-3" />
                <span className="hidden sm:inline">{generatingPdf ? "Generando..." : "PDF"}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* History panel — improved */}
        {showHistory && (
          <Card className="border-dashed">
            <CardContent className="p-3 space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <History className="h-4 w-4" />
                Borradores guardados
              </h4>
              {loadingHistory ? (
                <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                </div>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No hay borradores guardados.</p>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {history.map(h => (
                    <AccordionItem key={h.id} value={h.id} className="border-b-0">
                      <AccordionTrigger className="py-2 px-2 rounded hover:bg-muted/50 hover:no-underline">
                        <div className="flex items-center gap-2 text-xs min-w-0 flex-1">
                          <span className="text-muted-foreground whitespace-nowrap">
                            {format(new Date(h.created_at), "dd MMM yyyy HH:mm", { locale: es })}
                          </span>
                          {h.label ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">{h.label}</Badge>
                          ) : (
                            <span className="text-muted-foreground/60 italic text-[10px]">sin nombre</span>
                          )}
                          {h.is_applied && <Badge className="bg-green-500/20 text-green-500 border-0 text-[10px] px-1 py-0">Aplicado</Badge>}
                          {draftId === h.id && <Badge className="bg-primary/20 text-primary border-0 text-[10px] px-1 py-0">Actual</Badge>}
                          {h.created_by && <span className="text-muted-foreground/60 truncate text-[10px]">por {h.created_by}</span>}
                          {h.change_log && Array.isArray(h.change_log) && h.change_log.length > 0 && (
                            <span className="text-muted-foreground/60 text-[10px]">({h.change_log.length} cambios)</span>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-2 pb-2">
                        {/* Changelog */}
                        {h.change_log && Array.isArray(h.change_log) && h.change_log.length > 0 ? (
                          renderChangeLogEntries(h.change_log)
                        ) : (
                          <p className="text-xs text-muted-foreground py-1">Sin historial de cambios detallado.</p>
                        )}
                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                          <Button
                            variant="outline" size="sm" className="h-7 text-xs gap-1"
                            onClick={() => restoreFromHistory(h)}
                          >
                            <Upload className="h-3 w-3" /> Cargar
                          </Button>
                          {!h.is_applied && (
                            <Button
                              variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                              onClick={() => setDeletingDraftId(h.id)}
                            >
                              <Trash2 className="h-3 w-3" /> Eliminar
                            </Button>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        )}

        {/* Config Backups panel */}
        {showBackups && (
          <Card className="border-dashed">
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Backups de configuración
                </h4>
                <Button
                  size="sm"
                  onClick={() => { setBackupLabel(""); setShowSaveBackupDialog(true); }}
                  disabled={savingBackup}
                  className="gap-1"
                >
                  {savingBackup ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Guardar configuración actual
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Guarda un punto de restauración de la configuración real de equipos. Si algo falla, podrás restaurar exactamente el estado anterior.
              </p>
              {loadingBackups ? (
                <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                </div>
              ) : configBackups.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No hay backups guardados. Crea uno antes de aplicar cambios.</p>
              ) : (
                <div className="space-y-2">
                  {configBackups.map(b => {
                    const snap = b.snapshot as any;
                    const teamsCount = snap?.teams?.length || 0;
                    const workersCount = snap?.worker_assignments?.length || 0;
                    return (
                      <div key={b.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{b.label}</span>
                            {b.label.startsWith("Auto-backup") && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">Auto</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                            <span>{format(new Date(b.created_at), "dd MMM yyyy HH:mm", { locale: es })}</span>
                            <span>{teamsCount} equipos</span>
                            <span>{workersCount} asignaciones</span>
                            {b.created_by && <span>por {b.created_by}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <Button
                            variant="outline" size="sm" className="h-7 text-xs gap-1"
                            onClick={() => setShowRestoreDialog(b.id)}
                            disabled={restoringBackupId === b.id}
                          >
                            {restoringBackupId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                            Restaurar
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                            onClick={() => setDeletingBackupId(b.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Teams grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedPrefixes.map(prefix => {
            const teamsInGroup = groupedTeams[prefix].sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { numeric: true })
            );
            const totalGroupWorkers = teamsInGroup.reduce((sum, t) => sum + getTeamWorkers(t.id).length, 0);
            // Group-level responsable: check first team's responsable (all teams share the same one)
            const groupResponsableId = snapshot.team_responsables.find(tr => teamsInGroup.some(t => t.id === tr.team_id) && tr.responsable_worker_id)?.responsable_worker_id || null;
            const hasResp = !!groupResponsableId;
            return (
              <div key={prefix} className="space-y-2">
                <div className="flex items-center gap-2">
                  {editingField?.type === "display_name" && editingField.id === prefix ? (
                    <Input
                      ref={editInputRef}
                      value={teamsInGroup[0]?.display_name ?? prefix}
                      onChange={e => {
                        const val = e.target.value;
                        updateMultipleTeamsDisplayName(teamsInGroup.map(t => t.id), val);
                      }}
                      onBlur={() => { teamsInGroup.forEach(t => commitTeamDisplayNameChange(t.id)); frozenGroupingRef.current = null; setEditingField(null); }}
                      onKeyDown={e => { if (e.key === "Enter") { teamsInGroup.forEach(t => commitTeamDisplayNameChange(t.id)); frozenGroupingRef.current = null; setEditingField(null); } }}
                      className="h-7 text-sm px-2 py-0 w-48"
                      placeholder="Nombre del grupo"
                    />
                  ) : (
                    <span
                      className="text-xs font-medium text-primary cursor-pointer hover:underline"
                      onClick={() => { pushUndo(); frozenGroupingRef.current = { grouped: groupedTeams, sorted: sortedPrefixes }; setEditingField({ type: "display_name", id: prefix }); }}
                      title="Clic para editar nombre del grupo"
                    >
                      {prefix}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{totalGroupWorkers} persona{totalGroupWorkers !== 1 ? 's' : ''}{hasResp ? ' +1 resp.' : ''}</span>
                  <button
                    onClick={() => {
                      const firstTeamWg = snapshot.work_group_teams.find(wgt => teamsInGroup.some(t => t.id === wgt.worker_team_id));
                      addNewTeam(teamsInGroup[0]?.display_name || prefix, firstTeamWg?.work_group_id);
                    }}
                    className="ml-1 text-muted-foreground hover:text-primary transition-colors"
                    title={`Añadir equipo en ${prefix}`}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                {/* Group-level responsable selector */}
                {responsableWorkers.length > 0 && (
                  <div className="mb-1">
                    <Select
                      value={groupResponsableId || "none"}
                      onValueChange={(val) => updateGroupResponsable(teamsInGroup.map(t => t.id), prefix, val === "none" ? null : val)}
                    >
                      <SelectTrigger className="h-6 text-[10px] px-2 overflow-hidden">
                        <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                          <UserCheck className="h-2.5 w-2.5 text-amber-500 flex-shrink-0" />
                          <span className="truncate"><SelectValue placeholder="Sin responsable" /></span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin responsable</SelectItem>
                        {responsableWorkers
                          .filter(rw => !assignedResponsableIds.has(rw.id) || rw.id === groupResponsableId)
                          .map(rw => (
                          <SelectItem key={rw.id} value={rw.id}>
                            {rw.name}{rw.department_name ? ` (${rw.department_name})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {teamsInGroup.map(team => {
                  const teamWorkers = getTeamWorkers(team.id).sort((a, b) => a.name.localeCompare(b.name));
                  const workGroup = getWorkGroupForTeam(team.id);
                  const isOver = dragOverTeamId === team.id;

                  return (
                    <Card
                      key={team.id}
                      className={cn(
                        "border-border/30 transition-all",
                        isOver && "ring-2 ring-primary border-primary"
                      )}
                      onDragOver={e => { handleDragOver(e); setDragOverTeamId(team.id); }}
                      onDragLeave={() => setDragOverTeamId(null)}
                      onDrop={e => handleDrop(e, team.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          {/* Color dot — editable */}
                          {workGroup ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  className="w-3 h-3 rounded-full flex-shrink-0 hover:ring-2 hover:ring-primary/50 cursor-pointer transition-shadow"
                                  style={{ backgroundColor: workGroup.color }}
                                />
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-2" side="bottom" align="start">
                                <div className="flex flex-wrap gap-1.5">
                                  {[...new Set(snapshot.work_groups.map(g => g.color))].map(c => (
                                    <button
                                      key={c}
                                      onClick={() => updateWorkGroupColor(workGroup.id, c)}
                                      className={cn(
                                        "w-5 h-5 rounded-full transition-all hover:scale-110",
                                        workGroup.color === c && "ring-2 ring-primary ring-offset-1"
                                      )}
                                      style={{ backgroundColor: c }}
                                    />
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  className="w-3 h-3 rounded-full flex-shrink-0 bg-muted hover:ring-2 hover:ring-primary/50 cursor-pointer transition-shadow"
                                  title="Asignar grupo vacacional"
                                />
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-2" side="bottom" align="start">
                                <p className="text-[10px] text-muted-foreground mb-1.5">Asignar grupo vacacional:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {snapshot.work_groups.map(g => (
                                    <button
                                      key={g.id}
                                      onClick={() => assignTeamToWorkGroup(team.id, g.id)}
                                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] hover:opacity-80 transition-opacity"
                                      style={{ backgroundColor: g.color + '30', color: g.color }}
                                    >
                                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }} />
                                      {g.name}
                                    </button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}

                          {/* Team code — editable */}
                          {editingField?.type === "team" && editingField.id === team.id ? (
                            <Input
                              ref={editInputRef}
                              value={team.name}
                              onChange={e => updateTeamName(team.id, e.target.value)}
                              onBlur={() => { commitTeamNameChange(team.id); setEditingField(null); }}
                              onKeyDown={e => { if (e.key === "Enter") { commitTeamNameChange(team.id); setEditingField(null); } }}
                              className="h-6 text-xs px-1.5 py-0 w-24"
                              placeholder="Código"
                            />
                          ) : (
                            <h4
                              className="font-medium text-xs cursor-pointer hover:text-primary transition-colors"
                              onClick={() => { pushUndo(); setEditingField({ type: "team", id: team.id }); }}
                              title="Código del equipo (usado en CSV)"
                            >
                              {team.name}
                            </h4>
                          )}

                          {/* Work group name — editable */}
                          {workGroup && (
                            editingField?.type === "workgroup" && editingField.id === workGroup.id ? (
                              <Input
                                ref={editInputRef}
                                value={workGroup.name}
                                onChange={e => updateWorkGroupName(workGroup.id, e.target.value)}
                                onBlur={() => { commitWorkGroupNameChange(workGroup.id); setEditingField(null); }}
                                onKeyDown={e => { if (e.key === "Enter") { commitWorkGroupNameChange(workGroup.id); setEditingField(null); } }}
                                className="h-5 text-[10px] px-1 py-0 w-16"
                              />
                            ) : (
                              <span
                                className="text-[10px] text-muted-foreground cursor-pointer hover:text-primary transition-colors"
                                onClick={() => { pushUndo(); setEditingField({ type: "workgroup", id: workGroup.id }); }}
                              >
                                {workGroup.name}
                              </span>
                            )
                          )}

                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {(() => {
                              const hasResp = !!snapshot.team_responsables.find(tr => tr.team_id === team.id)?.responsable_worker_id;
                              return hasResp ? `${teamWorkers.length} +1` : `${teamWorkers.length}`;
                            })()}
                          </span>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => {
                              setTeamNoteText(snapshot.team_notes?.[team.id] || "");
                              setEditingTeamNoteId(team.id);
                            }}
                            className={cn("h-5 w-5 relative", snapshot.team_notes?.[team.id] ? "text-primary" : "text-muted-foreground")}
                            title="Nota del equipo"
                          >
                            <MessageSquare className="h-2.5 w-2.5" />
                            {snapshot.team_notes?.[team.id] && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />}
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => removeTeam(team.id)}
                            className="h-5 w-5 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1 min-h-[24px]">
                          {teamWorkers.map(renderWorkerChip)}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })}

        </div>

        {/* Unassigned workers drop zone — full width */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-destructive">Sin equipo</span>
          <Card
            className={cn(
              "border-destructive/40 bg-destructive/5 transition-all",
              dragOverTeamId === "__unassigned__" && "ring-2 ring-destructive border-destructive"
            )}
            onDragOver={e => { handleDragOver(e); setDragOverTeamId("__unassigned__"); }}
            onDragLeave={() => setDragOverTeamId(null)}
            onDrop={e => handleDrop(e, null)}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-destructive/50" />
                <h4 className="font-medium text-xs text-destructive">Sin asignar</h4>
                <span className="text-[10px] text-destructive/70 ml-auto">{unassignedWorkers.length}</span>
              </div>
              <div className="flex flex-wrap gap-1 min-h-[24px]">
                {unassignedWorkers.sort((a, b) => a.name.localeCompare(b.name)).map(renderWorkerChip)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sticky action bar — pill style */}
        <div className="sticky bottom-0 pt-3 pb-1">
          <div className="bg-muted/80 backdrop-blur-xl border border-border/50 rounded-xl px-4 py-3 shadow-lg space-y-2">
            {/* Current changes collapsible */}
            {changeLog.length > 0 && (
              <Collapsible open={showChanges} onOpenChange={setShowChanges}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full">
                    {showChanges ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    <FileText className="h-3 w-3" />
                    <span>{changeLog.length} acción{changeLog.length !== 1 ? 'es' : ''} registrada{changeLog.length !== 1 ? 's' : ''}</span>
                    {showChanges ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  {renderChangeLogEntries(changeLog)}
                </CollapsibleContent>
              </Collapsible>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground">
                {hasPendingDbChanges ? (
                  <span className="text-amber-500 font-medium">
                    {changeCount} cambio{changeCount !== 1 ? "s" : ""} sin aplicar
                  </span>
                ) : (
                  "Sin cambios pendientes"
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={undo} disabled={undoStackRef.current.length === 0} title="Deshacer última acción (Ctrl+Z)">
                  <Undo2 className="h-3 w-3 mr-1" /> Deshacer
                </Button>
                <Button variant="outline" size="sm" onClick={discard} disabled={!hasPendingDbChanges && !draftId}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Descartar
                </Button>
                <Button variant="secondary" size="sm" onClick={openSaveDialog} disabled={saving || !isDirty}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                  Guardar borrador
                </Button>
                <Button size="sm" onClick={() => setShowApplyDialog(true)} disabled={applying || !hasPendingDbChanges}>
                  {applying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                  Aplicar cambios
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Save draft dialog — ask for name */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Guardar borrador</DialogTitle>
            <DialogDescription>
              Pon un nombre al borrador para identificarlo después.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="draft-name">Nombre del borrador</Label>
              <Input
                id="draft-name"
                value={draftLabel}
                onChange={e => setDraftLabel(e.target.value)}
                placeholder="Ej: Reorg marzo, Propuesta Juan..."
                onKeyDown={e => e.key === "Enter" && confirmSaveDraft()}
                autoFocus
              />
            </div>
            {changeLog.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Se guardarán {changeLog.length} acción{changeLog.length !== 1 ? 'es' : ''} en el historial del borrador.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>Cancelar</Button>
            <Button onClick={confirmSaveDraft} disabled={!draftLabel.trim()}>
              <Save className="h-3 w-3 mr-1" /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply confirmation dialog */}
      <AlertDialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aplicar cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Se aplicarán {changeCount} cambio{changeCount !== 1 ? "s" : ""} a la configuración real de equipos.
              Se guardará automáticamente un backup del estado actual en el servidor antes de aplicar.
              Podrás restaurar desde la sección "Backups" si algo falla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={applyChanges}>Aplicar cambios</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save backup dialog */}
      <Dialog open={showSaveBackupDialog} onOpenChange={setShowSaveBackupDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Guardar backup de configuración</DialogTitle>
            <DialogDescription>
              Se guardará una copia exacta de la configuración real actual de equipos en el servidor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="backup-name">Nombre del backup</Label>
              <Input
                id="backup-name"
                value={backupLabel}
                onChange={e => setBackupLabel(e.target.value)}
                placeholder="Ej: Antes de reorganización marzo..."
                onKeyDown={e => e.key === "Enter" && saveConfigBackup()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveBackupDialog(false)}>Cancelar</Button>
            <Button onClick={saveConfigBackup} disabled={!backupLabel.trim() || savingBackup}>
              {savingBackup ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore backup confirmation */}
      <AlertDialog open={!!showRestoreDialog} onOpenChange={(open) => !open && setShowRestoreDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restaurar configuración?</AlertDialogTitle>
            <AlertDialogDescription>
              Se aplicará la configuración guardada en este backup directamente a la base de datos.
              Antes de restaurar, se guardará automáticamente un backup del estado actual por seguridad.
              Esta acción sobrescribirá la configuración de equipos actual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => showRestoreDialog && restoreConfigBackup(showRestoreDialog)}>
              <RotateCw className="h-3 w-3 mr-1" /> Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete backup confirmation */}
      <AlertDialog open={!!deletingBackupId} onOpenChange={(open) => !open && setDeletingBackupId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Este backup se eliminará permanentemente. No podrás restaurar desde él.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingBackupId && deleteConfigBackup(deletingBackupId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete draft confirmation dialog */}
      <AlertDialog open={!!deletingDraftId} onOpenChange={(open) => !open && setDeletingDraftId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar borrador?</AlertDialogTitle>
            <AlertDialogDescription>
              Este borrador se eliminará permanentemente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingDraftId && deleteDraft(deletingDraftId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Blank draft confirmation dialog */}
      <AlertDialog open={showBlankDraftDialog} onOpenChange={setShowBlankDraftDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Crear borrador limpio?</AlertDialogTitle>
            <AlertDialogDescription>
              Se desasignarán <strong>{blankDraftWorkerCount}</strong> trabajador{blankDraftWorkerCount !== 1 ? "es" : ""} de sus equipos y se moverán a "Sin equipo" para redistribuirlos.
              Los responsables de equipo permanecerán asignados. La estructura de equipos y grupos de vacaciones se mantiene intacta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={createBlankDraft}>
              <FileText className="h-3 w-3 mr-1" /> Crear borrador limpio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Team note dialog */}
      <Dialog open={!!editingTeamNoteId} onOpenChange={(open) => {
        if (!open && editingTeamNoteId && snapshot) {
          const newNotes = { ...(snapshot.team_notes || {}) };
          if (teamNoteText.trim()) {
            newNotes[editingTeamNoteId] = teamNoteText.trim();
          } else {
            delete newNotes[editingTeamNoteId];
          }
          setSnapshot({ ...snapshot, team_notes: newNotes });
          setEditingTeamNoteId(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Nota — {editingTeamNoteId ? snapshot.teams.find(t => t.id === editingTeamNoteId)?.name || "Equipo" : ""}
            </DialogTitle>
            <DialogDescription>Nota interna asociada a este equipo en el borrador.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={teamNoteText}
            onChange={e => setTeamNoteText(e.target.value)}
            placeholder="Escribe una nota para este equipo..."
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              if (editingTeamNoteId && snapshot) {
                const newNotes = { ...(snapshot.team_notes || {}) };
                if (teamNoteText.trim()) {
                  newNotes[editingTeamNoteId] = teamNoteText.trim();
                } else {
                  delete newNotes[editingTeamNoteId];
                }
                setSnapshot({ ...snapshot, team_notes: newNotes });
              }
              setEditingTeamNoteId(null);
            }}>
              Guardar y cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* General notes dialog */}
      <Dialog open={showGeneralNotes} onOpenChange={(open) => {
        if (!open && snapshot) {
          setSnapshot({ ...snapshot, general_notes: generalNoteText.trim() || undefined });
          setShowGeneralNotes(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-4 w-4" />
              Notas generales del borrador
            </DialogTitle>
            <DialogDescription>Nota global asociada a este borrador.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={generalNoteText}
            onChange={e => setGeneralNoteText(e.target.value)}
            placeholder="Escribe notas generales para este borrador..."
            className="min-h-[120px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              if (snapshot) {
                setSnapshot({ ...snapshot, general_notes: generalNoteText.trim() || undefined });
              }
              setShowGeneralNotes(false);
            }}>
              Guardar y cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden PDF Content */}
      <div className="hidden">
        <div
          ref={pdfContentRef}
          style={{
            background: pdfLightMode ? '#ffffff' : '#0a0a0a',
            padding: '0px',
            fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
            color: pdfLightMode ? '#1a1a1a' : '#ffffff',
            width: '100%',
            maxWidth: '100%',
            margin: '0 auto',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #93d600'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <img src="/images/verdnatura-logo-green.png" alt="Verdnatura" style={{ height: '40px' }} />
              <div style={{ height: '32px', width: '1px', background: pdfLightMode ? '#ddd' : '#333' }} />
              <div>
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Configurador de Equipos</h1>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: pdfLightMode ? '#666' : '#888' }}>
                  {departmentName || 'Departamento'}
                  {draftLabel && <span style={{ marginLeft: '8px', fontSize: '11px', opacity: 0.7 }}>— {draftLabel}</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: pdfLightMode ? 'rgba(147, 214, 0, 0.15)' : 'rgba(147, 214, 0, 0.1)',
            color: '#93d600', padding: '6px 14px', borderRadius: '9999px',
            marginBottom: '28px', fontSize: '12px', fontWeight: 500
          }}>
            <span>{snapshot.worker_assignments.filter(wa => wa.worker_team_id).length} trabajadores asignados</span>
          </div>

          {/* Groups */}
          {(() => {
            const grouped: Record<string, SnapshotTeam[]> = {};
            snapshot.teams.forEach(team => {
              const groupKey = team.display_name || `Grupo ${team.name.charAt(0).toUpperCase()}`;
              if (!grouped[groupKey]) grouped[groupKey] = [];
              grouped[groupKey].push(team);
            });
            const sorted = Object.keys(grouped).sort();

            const totalTeams = snapshot.teams.length;
            const avgTeamsPerGroup = totalTeams / Math.max(sorted.length, 1);
            const useHorizontalLayout = avgTeamsPerGroup <= 2 && sorted.length >= 3;

            if (useHorizontalLayout) {
              return (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(sorted.length, 4)}, 1fr)`, gap: '20px' }}>
                  {sorted.map(prefix => {
                    const teamsInGroup = grouped[prefix].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
                    const groupWorkerCount = teamsInGroup.reduce((acc, t) => {
                      return acc + snapshot.worker_assignments.filter(wa => wa.worker_team_id === t.id && !allResponsableWorkerIds.has(wa.worker_id)).length;
                    }, 0);

                    return (
                      <div key={prefix}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{prefix}</h2>
                          <span style={{ fontSize: '10px', color: pdfLightMode ? '#666' : '#888', background: pdfLightMode ? '#f0f0f0' : '#222', padding: '3px 8px', borderRadius: '9999px' }}>
                            {groupWorkerCount}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {teamsInGroup.map(team => {
                            const teamWorkerIds = snapshot.worker_assignments
                              .filter(wa => wa.worker_team_id === team.id && !allResponsableWorkerIds.has(wa.worker_id))
                              .map(wa => wa.worker_id);
                            const teamWorkers = teamWorkerIds.map(id => workers.find(w => w.id === id)).filter(Boolean) as Worker[];
                            teamWorkers.sort((a, b) => a.name.localeCompare(b.name));
                            const workGroup = (() => {
                              const mapping = snapshot.work_group_teams.find(wgt => wgt.worker_team_id === team.id);
                              return mapping ? snapshot.work_groups.find(g => g.id === mapping.work_group_id) || null : null;
                            })();
                            const resp = snapshot.team_responsables?.find(tr => tr.team_id === team.id);
                            const respName = resp?.responsable_worker_id ? getWorkerName(resp.responsable_worker_id) : null;

                            return (
                              <div key={team.id} style={{ background: pdfLightMode ? '#f8f8f8' : '#1a1a1a', border: `1px solid ${pdfLightMode ? '#e0e0e0' : '#333'}`, borderRadius: '10px', padding: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                  <span style={{ fontWeight: 600, fontSize: '12px' }}>{team.name}</span>
                                  {workGroup && <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: workGroup.color }} />}
                                </div>
                                {respName && <p style={{ fontSize: '9px', color: '#93d600', marginBottom: '6px' }}>Resp: {respName}</p>}
                                <p style={{ fontSize: '9px', color: pdfLightMode ? '#666' : '#888', marginBottom: '10px' }}>
                                  {teamWorkers.length} trabajador{teamWorkers.length !== 1 ? 'es' : ''}
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {teamWorkers.map(w => (
                                    <span key={w.id} style={{ fontSize: '9px', background: pdfLightMode ? '#e8e8e8' : '#2a2a2a', color: pdfLightMode ? '#333' : '#ddd', padding: '4px 8px', borderRadius: '5px' }}>
                                      {w.name}
                                    </span>
                                  ))}
                                  {teamWorkers.length === 0 && <span style={{ fontSize: '9px', color: pdfLightMode ? '#999' : '#666', fontStyle: 'italic' }}>Sin asignar</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            // Default vertical layout
            return sorted.map(prefix => {
              const teamsInGroup = grouped[prefix].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
              const groupWorkerCount = teamsInGroup.reduce((acc, t) => {
                return acc + snapshot.worker_assignments.filter(wa => wa.worker_team_id === t.id && !allResponsableWorkerIds.has(wa.worker_id)).length;
              }, 0);

              return (
                <div key={prefix} style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{prefix}</h2>
                    <span style={{ fontSize: '11px', color: pdfLightMode ? '#666' : '#888', background: pdfLightMode ? '#f0f0f0' : '#222', padding: '4px 10px', borderRadius: '9999px' }}>
                      {groupWorkerCount} trabajadores
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                    {teamsInGroup.map(team => {
                      const teamWorkerIds = snapshot.worker_assignments
                        .filter(wa => wa.worker_team_id === team.id && !allResponsableWorkerIds.has(wa.worker_id))
                        .map(wa => wa.worker_id);
                      const teamWorkers = teamWorkerIds.map(id => workers.find(w => w.id === id)).filter(Boolean) as Worker[];
                      teamWorkers.sort((a, b) => a.name.localeCompare(b.name));
                      const workGroup = (() => {
                        const mapping = snapshot.work_group_teams.find(wgt => wgt.worker_team_id === team.id);
                        return mapping ? snapshot.work_groups.find(g => g.id === mapping.work_group_id) || null : null;
                      })();
                      const resp = snapshot.team_responsables?.find(tr => tr.team_id === team.id);
                      const respName = resp?.responsable_worker_id ? getWorkerName(resp.responsable_worker_id) : null;

                      return (
                        <div key={team.id} style={{ background: pdfLightMode ? '#f8f8f8' : '#1a1a1a', border: `1px solid ${pdfLightMode ? '#e0e0e0' : '#333'}`, borderRadius: '12px', padding: '16px 14px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 600, fontSize: '14px' }}>{team.name}</span>
                            {workGroup && <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: workGroup.color }} />}
                          </div>
                          {respName && <p style={{ fontSize: '10px', color: '#93d600', marginBottom: '6px' }}>Resp: {respName}</p>}
                          <p style={{ fontSize: '10px', color: pdfLightMode ? '#666' : '#888', marginBottom: '12px' }}>
                            {teamWorkers.length} trabajador{teamWorkers.length !== 1 ? 'es' : ''}
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {teamWorkers.map(w => (
                              <span key={w.id} style={{ fontSize: '10px', background: pdfLightMode ? '#e8e8e8' : '#2a2a2a', color: pdfLightMode ? '#333' : '#ddd', padding: '6px 10px', borderRadius: '6px' }}>
                                {w.name}
                              </span>
                            ))}
                            {teamWorkers.length === 0 && <span style={{ fontSize: '10px', color: pdfLightMode ? '#999' : '#666', fontStyle: 'italic' }}>Sin asignar</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}

          {/* Footer */}
          <div style={{
            marginTop: '28px', paddingTop: '14px',
            borderTop: `1px solid ${pdfLightMode ? '#ddd' : '#333'}`,
            textAlign: 'center', color: pdfLightMode ? '#999' : '#666', fontSize: '11px'
          }}>
            Generado el {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} | Verdnatura
          </div>
        </div>
      </div>

    </Card>
  );
}
