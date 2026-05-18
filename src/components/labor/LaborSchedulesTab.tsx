import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getManagerSessionToken } from "@/lib/sessionHelpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ColorPicker } from "@/components/ColorPicker";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Calendar, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, Download, Save, Settings2, History, RotateCcw, Sun, Moon, ExternalLink, CheckCircle2, AlertCircle, Palmtree, Lock, Unlock, Copy, Users, MessageSquare, Bot, GripVertical, Megaphone, Tag, Plus, Trash2, RefreshCw, Check, X, EyeOff } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScheduleRulesPanel, ScheduleRuleConfig } from "./ScheduleRulesPanel";
import { ScheduleAIChatPanel } from "./ScheduleAIChatPanel";
import { DepartmentSearchSelect } from "@/components/DepartmentSearchSelect";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShiftConfigPanel, ShiftConfig } from "./ShiftConfigPanel";
 import { PersonalSchedulesPanel } from "./PersonalSchedulesPanel";
 import { User, CalendarDays as CalendarIcon2 } from "lucide-react";
 import { PersonalAnnualCalendarsPanel } from "./PersonalAnnualCalendarsPanel";


const DAYS = [
  { key: "0", short: "D", full: "Domingo" },
  { key: "1", short: "L", full: "Lunes" },
  { key: "2", short: "M", full: "Martes" },
  { key: "3", short: "X", full: "Miércoles" },
  { key: "4", short: "J", full: "Jueves" },
  { key: "5", short: "V", full: "Viernes" },
  { key: "6", short: "S", full: "Sábado" },
] as const;

type ScheduleType = "morning" | "afternoon" | "night" | "rest" | "vacation";

const TYPE_LABEL: Record<string, string> = {
  morning: "Mañana",
  afternoon: "Tarde",
  night: "Noche",
  rest: "Descanso",
  vacation: "Vacaciones",
};

const TYPE_BADGE: Record<string, string> = {
  morning: "bg-muted text-foreground",
  afternoon: "bg-muted text-foreground",
  night: "bg-muted text-foreground",
  rest: "bg-muted text-muted-foreground",
  vacation: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300",
};

const DEFAULT_TIMES: Record<string, { start: string | null; end: string | null }> = {
  morning: { start: "08:00", end: null },
  afternoon: { start: "14:00", end: "22:00" },
  night: { start: "22:00", end: "06:00" },
  rest: { start: null, end: null },
  vacation: { start: null, end: null },
};

// Schedule rule is now managed via ScheduleRulesPanel and ScheduleRuleConfig

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function weekRange(year: number, week: number): { start: Date; end: Date } {
  const jan1 = new Date(year, 0, 1);
  const days = (week - 1) * 7;
  const dayOfWeek = jan1.getDay() || 7;
  const startDate = new Date(year, 0, 1 + days - dayOfWeek + 1);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  return { start: startDate, end: endDate };
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

type ScheduleState = Record<string, Record<string, { type: ScheduleType; start: string | null; end: string | null; partial_count?: number | null; partial_shift?: string | null; partial_start?: string | null; partial_end?: string | null }>>;



type TeamLabelRow = { id: string; department_id: string; name: string; color: string | null; icon: string | null; sort_order: number; inherit_team_color?: boolean; excluded_shift_keys?: string[] | null };

const PRESET_PALETTE = [
  "#6b7280", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#14b8a6", "#ec4899",
  "#0f766e", "#7c3aed", "#dc2626", "#0891b2",
];

const LabelEditorRow = ({
  label,
  shifts,
  onUpdate,
  onDelete,
  saving,
}: {
  label: TeamLabelRow;
  shifts: { shift_key: string; name: string; color: string; is_rest?: boolean }[];
  onUpdate: (id: string, patch: { name?: string; color?: string | null; inheritTeamColor?: boolean; excludedShiftKeys?: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  saving: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(label.name);
  const inherit = !!label.inherit_team_color;
  const excluded = Array.isArray(label.excluded_shift_keys) ? label.excluded_shift_keys : [];
  const c = inherit ? "#6b7280" : (label.color || "#6b7280");
  const toggleExcluded = (shiftKey: string, on: boolean) => {
    const set = new Set(excluded);
    if (on) set.add(shiftKey); else set.delete(shiftKey);
    onUpdate(label.id, { excludedShiftKeys: Array.from(set) });
  };

  return (
    <div className="group flex items-center gap-2 p-2 rounded-lg border border-border/60 hover:border-border hover:bg-muted/30 transition-all">
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="relative h-7 w-7 rounded-full border shrink-0 transition-transform hover:scale-110"
            style={{
              background: inherit
                ? `repeating-linear-gradient(45deg, ${c}55, ${c}55 3px, transparent 3px, transparent 6px), ${c}1a`
                : c,
              borderColor: `${c}66`,
            }}
            title={inherit ? "Color heredado del grupo · click para cambiar" : "Cambiar color"}
            type="button"
          />
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Color personalizado</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={label.color || "#6b7280"}
                  onChange={(e) => onUpdate(label.id, { color: e.target.value, inheritTeamColor: false })}
                  className="h-8 w-12 rounded cursor-pointer border border-border bg-transparent"
                />
                <Input
                  value={label.color || ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (/^#[0-9a-fA-F]{6}$/.test(v) || v === "") onUpdate(label.id, { color: v || null, inheritTeamColor: false });
                  }}
                  placeholder="#6b7280"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_PALETTE.map((pc) => (
                <button
                  key={pc}
                  onClick={() => onUpdate(label.id, { color: pc, inheritTeamColor: false })}
                  className={`h-5 w-5 rounded-full border-2 transition-all ${!inherit && label.color === pc ? "scale-110 border-foreground" : "border-transparent hover:scale-105"}`}
                  style={{ backgroundColor: pc }}
                  type="button"
                />
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">Heredar color del grupo</div>
                <div className="text-[10px] text-muted-foreground leading-tight">Usar el color del grupo donde esté la etiqueta</div>
              </div>
              <Switch
                checked={inherit}
                onCheckedChange={(checked) => onUpdate(label.id, { inheritTeamColor: checked })}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {editing ? (
        <div className="flex-1 flex items-center gap-1">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="h-7 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (editName.trim() && editName.trim() !== label.name) onUpdate(label.id, { name: editName.trim() });
                setEditing(false);
              } else if (e.key === "Escape") {
                setEditName(label.name);
                setEditing(false);
              }
            }}
            onBlur={() => {
              if (editName.trim() && editName.trim() !== label.name) onUpdate(label.id, { name: editName.trim() });
              setEditing(false);
            }}
          />
        </div>
      ) : (
        <button
          className="flex-1 text-left text-sm font-medium truncate hover:text-primary transition-colors"
          onClick={() => {
            setEditName(label.name);
            setEditing(true);
          }}
          style={{ color: inherit ? undefined : c }}
        >
          {label.name}
          {inherit && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-muted-foreground font-normal">· auto</span>}
        </button>
      )}

      {shifts.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className={`h-7 w-7 transition-opacity ${excluded.length > 0 ? "text-amber-600 opacity-100" : "text-muted-foreground opacity-50 group-hover:opacity-100"}`}
              title={excluded.length > 0 ? `Oculta en ${excluded.length} turno(s)` : "Excluir en turnos"}
              type="button"
            >
              <EyeOff className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-3" align="end">
            <div className="space-y-2">
              <div>
                <div className="text-xs font-medium">Ocultar en turnos</div>
                <div className="text-[10px] text-muted-foreground leading-tight">La etiqueta no aparecerá en el PDF para los turnos seleccionados.</div>
              </div>
              <div className="space-y-1.5 pt-1 border-t border-border/60">
                {shifts.map((s) => {
                  const on = excluded.includes(s.shift_key);
                  return (
                    <label key={s.shift_key} className="flex items-center justify-between gap-2 py-1 cursor-pointer hover:bg-muted/40 rounded px-1.5 -mx-1.5">
                      <span className="flex items-center gap-2 text-xs min-w-0 flex-1">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="truncate">{s.name}</span>
                      </span>
                      <Switch checked={on} onCheckedChange={(checked) => toggleExcluded(s.shift_key, checked)} />
                    </label>
                  );
                })}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100 transition-opacity"
        onClick={() => onDelete(label.id)}
        title="Eliminar etiqueta"
        disabled={saving}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

const LabelManagerBody = ({
  labels,
  shifts,
  onCreate,
  onUpdate,
  onDelete,
  saving,
}: {
  labels: TeamLabelRow[];
  shifts: { shift_key: string; name: string; color: string; is_rest?: boolean }[];
  onCreate: (name: string, color: string | null, inheritTeamColor: boolean) => Promise<void>;
  onUpdate: (id: string, patch: { name?: string; color?: string | null; inheritTeamColor?: boolean; excludedShiftKeys?: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  saving: boolean;
}) => {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(PRESET_PALETTE[2]);
  const [newInherit, setNewInherit] = useState(false);

  return (
    <div className="space-y-4">
      {/* Create new */}
      <div className="rounded-lg border border-border/60 p-3 bg-muted/20 space-y-3">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Nueva etiqueta</Label>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Ej: Sacado H, Altillo, Cámara…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-9 text-sm"
            disabled={saving}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && newName.trim()) {
                await onCreate(newName.trim(), newInherit ? null : newColor, newInherit);
                setNewName("");
              }
            }}
          />
          <Button
            size="sm"
            onClick={async () => {
              if (!newName.trim()) return;
              await onCreate(newName.trim(), newInherit ? null : newColor, newInherit);
              setNewName("");
            }}
            disabled={saving || !newName.trim()}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Añadir
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            disabled={newInherit}
            className="h-8 w-10 rounded cursor-pointer border border-border bg-transparent disabled:opacity-40 disabled:cursor-not-allowed"
            title="Color personalizado"
          />
          <div className="flex flex-wrap gap-1 flex-1">
            {PRESET_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => { setNewColor(c); setNewInherit(false); }}
                className={`h-5 w-5 rounded-full border-2 transition-all ${!newInherit && newColor === c ? "scale-110 border-foreground" : "border-transparent hover:scale-105"} ${newInherit ? "opacity-40" : ""}`}
                style={{ backgroundColor: c }}
                title={c}
                type="button"
                disabled={newInherit}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium">Heredar color del grupo</div>
            <div className="text-[10px] text-muted-foreground leading-tight">La etiqueta tomará el color del grupo donde esté</div>
          </div>
          <Switch checked={newInherit} onCheckedChange={setNewInherit} />
        </div>
      </div>

      {/* Existing labels list */}
      <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
        {labels.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground italic">
            No hay etiquetas todavía.
          </div>
        ) : (
          labels.map((l) => (
            <LabelEditorRow key={l.id} label={l} shifts={shifts} onUpdate={onUpdate} onDelete={onDelete} saving={saving} />
          ))
        )}
      </div>
    </div>
  );
};

export const LaborSchedulesTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weekLoading, setWeekLoading] = useState(false);

  const [departments, setDepartments] = useState<{ id: string; name: string; slug: string | null; schedule_configured: boolean; schedule_locked_for_managers: boolean; schedule_auto_rotate_teams: boolean }[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string; department_id: string; sort_order: number; is_schedule_locked?: boolean; display_name?: string | null; label_id?: string | null }[]>([]);
  const [teamLabels, setTeamLabels] = useState<TeamLabelRow[]>([]);
  const [labelsManagerOpen, setLabelsManagerOpen] = useState(false);
  const [savingLabel, setSavingLabel] = useState(false);
  const [ruleConfig, setRuleConfig] = useState<ScheduleRuleConfig | null>(null);
  const [togglingLock, setTogglingLock] = useState(false);

  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [week, setWeek] = useState<number>(getWeekNumber(new Date()));

  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleState>({});
  const [notes, setNotes] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  
  // Week review status
  const [isWeekReviewed, setIsWeekReviewed] = useState(false);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [reviewedBy, setReviewedBy] = useState<string | null>(null);
  
  // Auto-save state
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSaveRef = useRef<number>(0);
  const previousShiftTimesRef = useRef<Record<string, { start: string | null; end: string | null }>>({});

  const [rulesOpen, setRulesOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);

  const [confirmNavOpen, setConfirmNavOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{ type: 'week' | 'department'; value: number | string } | null>(null);

  // History state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [scheduleVersions, setScheduleVersions] = useState<Array<{
    id: string;
    configuration: ScheduleState;
    notes: string | null;
    created_at: string;
    created_by: string;
  }>>([]);
  const [historyOnlyManagers, setHistoryOnlyManagers] = useState(false);

  // Group colors state (configurable per department)
  const [groupColors, setGroupColors] = useState<Record<string, string>>({});
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null);
  const [customHexInput, setCustomHexInput] = useState<string>("");
  
  // Propagate changes to future weeks
  const [propagateToFuture, setPropagateToFuture] = useState(true);
  
  // Campaign mode: shows campaign alert in downloaded PDF
  const [campaignMode, setCampaignMode] = useState(false);

  // Per-day announcements: replaces all teams in that day with a generic message
  // Stored inside `configuration.__announcements` in the DB JSONB
  const [dayAnnouncements, setDayAnnouncements] = useState<Record<string, string>>({});
  const [announcementDialogDay, setAnnouncementDialogDay] = useState<string | null>(null);
  const [announcementDraft, setAnnouncementDraft] = useState<string>("");
  
  // Configured shifts for the department
  const [departmentShifts, setDepartmentShifts] = useState<ShiftConfig[]>([]);
  
  // Vacation data from annual calendar
  // vacationMap: { dayKey: Set<teamId> } - teams on vacation per day
  const [vacationMap, setVacationMap] = useState<Record<string, Set<string>>>({});
  // Bidirectional sync: track pending vacation removal to sync with annual calendar
  const [pendingSyncDialog, setPendingSyncDialog] = useState<{
    dayKey: string;
    teamId: string | null;
    parentGroup: string | null;
    newType: ScheduleType;
    dateStr: string;
    affectedGroups: string[];
  } | null>(null);
  // workGroups from annual calendar
  const [workGroups, setWorkGroups] = useState<{ id: string; name: string }[]>([]);
 
   // Personal Schedules panel
   const [personalSchedulesOpen, setPersonalSchedulesOpen] = useState(false);
   
   // Personal Annual Calendars panel
   const [personalAnnualCalendarsOpen, setPersonalAnnualCalendarsOpen] = useState(false);
   
   // Copy week dialog state
   const [copyWeekDialogOpen, setCopyWeekDialogOpen] = useState(false);
   const [copyTargetWeek, setCopyTargetWeek] = useState<number>(week + 1);
   const [copyTargetYear, setCopyTargetYear] = useState<number>(year);
   const [isCopying, setIsCopying] = useState(false);
   const [rotationConfirmOpen, setRotationConfirmOpen] = useState(false);
   
   // Workers per team for summary
   const [workersPerTeam, setWorkersPerTeam] = useState<Record<string, number>>({});
   // Active workers per team (excluding on_leave / on_vacation)
   const [activeWorkersPerTeam, setActiveWorkersPerTeam] = useState<Record<string, number>>({});
   const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
   const [generatedSummary, setGeneratedSummary] = useState<string>("");

  // Preset colors for color picker
  const PRESET_COLORS = [
    "#dc2626", // red
    "#ea580c", // orange
    "#d97706", // amber
    "#ca8a04", // yellow
    "#65a30d", // lime
    "#16a34a", // green
    "#059669", // emerald
    "#0d9488", // teal
    "#0891b2", // cyan
    "#0284c7", // sky
    "#2563eb", // blue
    "#4f46e5", // indigo
    "#7c3aed", // violet
    "#9333ea", // purple
    "#c026d3", // fuchsia
    "#db2777", // pink
    "#93d600", // brand green
  ];
  
  // Validate hex color (with or without #)
  const isValidHex = (hex: string): boolean => {
    const normalized = hex.startsWith("#") ? hex : `#${hex}`;
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(normalized);
  };

  const normalizeHex = (hex: string): string => {
    return hex.startsWith("#") ? hex : `#${hex}`;
  };

  // Default fallback colors if not configured — each group gets a unique, distinguishable color
  const DEFAULT_GROUP_COLORS: Record<string, string> = {
    A: "#dc2626", // Red
    B: "#2563eb", // Blue
    C: "#16a34a", // Green
    D: "#9333ea", // Purple
    E: "#ea580c", // Orange
    F: "#0891b2", // Cyan
    G: "#c026d3", // Fuchsia
    H: "#ca8a04", // Yellow
    I: "#4f46e5", // Indigo
    J: "#059669", // Emerald
    K: "#e11d48", // Rose
    L: "#0d9488", // Teal
    M: "#7c3aed", // Violet
    N: "#d97706", // Amber
    O: "#0284c7", // Sky
    P: "#65a30d", // Lime
  };

  const FALLBACK_COLOR_LIST = [
    "#dc2626", "#2563eb", "#16a34a", "#9333ea", "#ea580c",
    "#0891b2", "#c026d3", "#ca8a04", "#4f46e5", "#059669",
    "#e11d48", "#0d9488", "#7c3aed", "#d97706", "#0284c7", "#65a30d",
  ];

  const getGroupColor = (groupLetter: string): string => {
    // 1. DB-configured color
    if (groupColors[groupLetter]) return groupColors[groupLetter];
    // 2. Letter-based default (A, B, C...)
    if (DEFAULT_GROUP_COLORS[groupLetter]) return DEFAULT_GROUP_COLORS[groupLetter];
    // 3. Index-based distinct color for any group key
    const idx = parentGroups.indexOf(groupLetter);
    return FALLBACK_COLOR_LIST[idx >= 0 ? idx % FALLBACK_COLOR_LIST.length : 0];
  };

  // Get display name for a parent group (priority: display_name -> team name -> key)
  const getGroupDisplayName = (parentGroup: string): string => {
    const teamsInGroup = groupedTeams[parentGroup] || [];
    const customDisplayName = teamsInGroup
      .map((t: any) => (t.display_name ?? t.displayName ?? "") as string)
      .find((name) => name.trim())
      ?.trim();
    if (customDisplayName) return customDisplayName;
    if (teamsInGroup.length === 1 && teamsInGroup[0]?.name) return teamsInGroup[0].name;
    return parentGroup;
  };

  const captureRef = useRef<HTMLDivElement>(null);

  const clearManagerSession = (opts?: { silent?: boolean }) => {
    localStorage.removeItem("manager_session_token");
    // Keep key consistent with ManagerAuthProvider
    localStorage.removeItem("manager_session");
    if (!opts?.silent) {
      toast.error("Sesión caducada. Inicia sesión de nuevo.");
    }
  };

  const isExplicitSessionInvalid = (resp: any): boolean => {
    const err = resp?.error;
    return (
      err === "Invalid session" ||
      err === "Invalid session token" ||
      err === "Session expired" ||
      err === "Manager not found"
    );
  };
  const deptTeams = useMemo(() => {
    return teams
      .filter((t) => t.department_id === selectedDepartment)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [teams, selectedDepartment]);

  // Extract parent group from team name (e.g., "A1" -> "A", "Cúpula" -> "Cúpula")
  const getParentGroup = (teamName: string): string => {
    const match = teamName.match(/^([\p{L}]+)/u);
    return match ? match[1].toUpperCase() : teamName;
  };

  // Group teams by their parent group
  const groupedTeams = useMemo(() => {
    const groups: Record<string, typeof deptTeams> = {};
    for (const team of deptTeams) {
      const parentGroup = getParentGroup(team.name);
      if (!groups[parentGroup]) {
        groups[parentGroup] = [];
      }
      groups[parentGroup].push(team);
    }
    return groups;
  }, [deptTeams]);

  const parentGroups = useMemo(() => {
    // Sort by minimum sort_order of teams in each group instead of alphabetically
    return Object.keys(groupedTeams).sort((a, b) => {
      const minA = Math.min(...(groupedTeams[a] || []).map(t => t.sort_order ?? 0));
      const minB = Math.min(...(groupedTeams[b] || []).map(t => t.sort_order ?? 0));
      return minA - minB;
    });
  }, [groupedTeams]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // Drag-to-reorder teams state
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

  const handleTeamDragStart = (e: React.DragEvent, parentGroup: string) => {
    setDraggedGroup(parentGroup);
    e.dataTransfer.setData("reorderGroup", parentGroup);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleTeamDragOver = (e: React.DragEvent, parentGroup: string) => {
    e.preventDefault();
    if (draggedGroup && draggedGroup !== parentGroup) {
      setDragOverGroup(parentGroup);
    }
  };

  const handleTeamDragLeave = () => {
    setDragOverGroup(null);
  };

  const handleTeamDrop = async (e: React.DragEvent, targetGroup: string) => {
    e.preventDefault();
    setDragOverGroup(null);
    const sourceGroup = e.dataTransfer.getData("reorderGroup");
    setDraggedGroup(null);
    
    if (!sourceGroup || sourceGroup === targetGroup) return;
    
    // Reorder parentGroups
    const currentOrder = [...parentGroups];
    const srcIdx = currentOrder.indexOf(sourceGroup);
    const tgtIdx = currentOrder.indexOf(targetGroup);
    if (srcIdx === -1 || tgtIdx === -1) return;
    
    // Move source to target position
    currentOrder.splice(srcIdx, 1);
    currentOrder.splice(tgtIdx, 0, sourceGroup);
    
    // Assign new sort_order values to all teams based on new group order
    const teamOrders: Array<{ teamId: string; sortOrder: number }> = [];
    let order = 0;
    for (const group of currentOrder) {
      const teamsInGroup = groupedTeams[group] || [];
      for (const team of teamsInGroup) {
        teamOrders.push({ teamId: team.id, sortOrder: order });
        order++;
      }
    }
    
    // Update local state immediately
    setTeams(prev => {
      const updated = [...prev];
      for (const item of teamOrders) {
        const idx = updated.findIndex(t => t.id === item.teamId);
        if (idx !== -1) {
          updated[idx] = { ...updated[idx], sort_order: item.sortOrder };
        }
      }
      return updated;
    });
    
    // Persist to backend
    const sessionToken = getManagerSessionToken();
    if (!sessionToken) return;
    
    try {
      const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "reorderTeams",
          sessionToken,
          data: { teamOrders },
        },
      });
      
      if (error || !resp?.success) {
        console.error("Error reordering teams:", error || resp?.error);
        toast.error("Error al reordenar equipos");
      } else {
        toast.success("Orden de equipos actualizado");
      }
    } catch (err) {
      console.error("Error reordering teams:", err);
      toast.error("Error al reordenar equipos");
    }
  };

  const handleTeamDragEnd = () => {
    setDraggedGroup(null);
    setDragOverGroup(null);
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  // Count active rules from ruleConfig
  const activeRulesCount = useMemo(() => {
    if (!ruleConfig) return 0;
    let count = 0;
    if (ruleConfig.restDays?.enabled) count++;
    if (ruleConfig.groupRotation?.enabled) count++;
    if (ruleConfig.subgroupRotation?.enabled) count++;
    if (ruleConfig.shiftAlternation?.enabled) count++;
    if (ruleConfig.guardDuty?.enabled) count++;
    return count;
  }, [ruleConfig]);

  // Helper functions to get shift info from configured shifts
  const getShiftLabel = (shiftKey: string): string => {
    const configuredShift = departmentShifts.find(s => s.shift_key === shiftKey);
    if (configuredShift) return configuredShift.name;
    return TYPE_LABEL[shiftKey] || shiftKey;
  };

  const getShiftTimes = (shiftKey: string): { start: string | null; end: string | null } => {
    const configuredShift = departmentShifts.find(s => s.shift_key === shiftKey);
    if (configuredShift) {
      return { start: configuredShift.start_time, end: configuredShift.end_time };
    }
    return DEFAULT_TIMES[shiftKey] || { start: null, end: null };
  };

  // Helper to get badge style for a shift type (handles custom shifts)
  const getShiftBadgeStyle = (shiftKey: string): string => {
    // Check if it's a known type first
    if (TYPE_BADGE[shiftKey]) {
      return TYPE_BADGE[shiftKey];
    }
    // For custom shifts, check if it's a rest shift
    const configuredShift = departmentShifts.find(s => s.shift_key === shiftKey);
    if (configuredShift) {
      return configuredShift.is_rest ? TYPE_BADGE.rest : "bg-muted text-foreground";
    }
    // Unknown shift, default to foreground style
    return "bg-muted text-foreground";
  };

  const getAvailableShifts = (): Array<{ key: string; label: string; isRest: boolean; isVacation?: boolean }> => {
    const shifts: Array<{ key: string; label: string; isRest: boolean; isVacation?: boolean }> = [];
    const addedKeys = new Set<string>();
    
    if (departmentShifts.length > 0) {
      for (const s of departmentShifts) {
        shifts.push({
          key: s.shift_key,
          label: s.name,
          isRest: s.is_rest
        });
        addedKeys.add(s.shift_key);
      }
    } else {
      // Fallback to default shifts
      for (const key of (Object.keys(TYPE_LABEL) as ScheduleType[])) {
        if (key !== 'vacation') { // vacation is added below
          shifts.push({
            key,
            label: TYPE_LABEL[key],
            isRest: key === 'rest'
          });
          addedKeys.add(key);
        }
      }
    }
    
    // Scan current schedule for any shift types not in the list (e.g., deleted custom shifts)
    // This ensures the Select always has a valid option for the current value
    if (schedule) {
      for (const dayKey of Object.keys(schedule)) {
        const dayData = schedule[dayKey];
        if (dayData) {
          for (const teamId of Object.keys(dayData)) {
            const cellType = dayData[teamId]?.type;
            if (cellType && !addedKeys.has(cellType) && cellType !== 'vacation') {
              // It's a custom shift that's not in departmentShifts anymore
              shifts.push({
                key: cellType,
                label: cellType.startsWith('custom_') ? 'Turno eliminado' : cellType,
                isRest: false
              });
              addedKeys.add(cellType);
            }
          }
        }
      }
    }
    
    // Always add vacation option
    shifts.push({
      key: 'vacation',
      label: 'Vacaciones',
      isRest: false,
      isVacation: true
    });
    
    return shifts;
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const sessionToken = getManagerSessionToken();
        let deptList: { id: string; name: string; slug: string | null }[] = [];
        let configuredMap: Record<string, boolean> = {};
        let locksMap: Record<string, boolean> = {};
        let autoRotateMap: Record<string, boolean> = {};

        // Try to fetch departments via edge function first (most reliable with session auth)
        if (sessionToken) {
          const [deptResp, configResp] = await Promise.all([
            supabase.functions.invoke("admin-operations", {
              body: { action: "getDepartments", sessionToken },
            }),
            supabase.functions.invoke("admin-operations", {
              body: { action: "getDepartmentConfigs", sessionToken },
            }),
          ]);

          if (deptResp.data?.success && deptResp.data.departments) {
            deptList = deptResp.data.departments.map((d: any) => ({
              id: d.id, name: d.name, slug: d.slug || null,
            }));
          }

          if (configResp.data?.success) {
            configuredMap = configResp.data.configs || {};
            locksMap = configResp.data.locks || {};
            autoRotateMap = configResp.data.autoRotate || {};
          }
        }

        // Fallback to RPC if edge function didn't return departments
        if (deptList.length === 0) {
          const { data: rpcData } = await supabase.rpc("get_public_departments");
          if (rpcData && rpcData.length > 0) {
            deptList = rpcData.map((d: any) => ({
              id: d.id, name: d.name, slug: d.slug || null,
            }));
          }
        }

        const depts = deptList.map((d) => ({
          id: d.id,
          name: d.name,
          slug: d.slug,
          schedule_configured: configuredMap[d.id] ?? false,
          schedule_locked_for_managers: locksMap[d.id] ?? false,
          schedule_auto_rotate_teams: autoRotateMap[d.id] ?? false,
        }));
        depts.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        setDepartments(depts);

        // Fetch worker teams via edge function (security: RLS is now admin-only)
        if (sessionToken) {
          const { data: teamsResp, error: teamsError } = await supabase.functions.invoke("admin-operations", {
            body: {
              action: "getAllWorkerTeams",
              sessionToken,
            },
          });
          if (!teamsError && teamsResp?.success) {
            const normalizedTeams = (teamsResp.teams || []).map((t: any) => ({
              ...t,
              display_name: t.display_name ?? t.displayName ?? null,
              label_id: t.label_id ?? null,
            }));
            setTeams(normalizedTeams);
          }
        }

        if (depts.length) setSelectedDepartment(depts[0].id);
      } catch (e) {
        console.error(e);
        toast.error("Error al cargar datos");
      }
      setLoading(false);
    })();
  }, []);

  // Load group colors when department changes
  useEffect(() => {
    if (!selectedDepartment) return;
    
    const sessionToken = getManagerSessionToken();
    if (!sessionToken) return;
    
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("admin-operations", {
          body: {
            action: "getScheduleGroupColors",
            sessionToken,
            data: { departmentId: selectedDepartment },
          },
        });
        
        if (!error && data?.success && data.colors) {
          const colorMap: Record<string, string> = {};
          for (const c of data.colors) {
            colorMap[c.group_letter] = c.color;
          }
          setGroupColors(colorMap);
        }
      } catch (e) {
        console.error("Error loading group colors:", e);
      }
    })();
  }, [selectedDepartment]);

  // Load team labels (lugares/funciones rotables) when department changes
  const loadTeamLabels = async () => {
    if (!selectedDepartment) return;
    const sessionToken = getManagerSessionToken();
    if (!sessionToken) return;
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "listTeamLabels", sessionToken, data: { departmentId: selectedDepartment } },
      });
      if (!error && data?.success) setTeamLabels(data.labels || []);
    } catch (e) {
      console.error("Error loading team labels:", e);
    }
  };
  useEffect(() => {
    setTeamLabels([]);
    loadTeamLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDepartment]);

  const labelById = useMemo(() => {
    const map: Record<string, TeamLabelRow> = {};
    for (const l of teamLabels) map[l.id] = l;
    return map;
  }, [teamLabels]);

  const getTeamLabel = (teamId: string) => {
    const t = teams.find((tt) => tt.id === teamId);
    if (!t?.label_id) return null;
    return labelById[t.label_id] || null;
  };

  // CRUD for labels
  const handleCreateLabel = async (name: string, color: string | null, inheritTeamColor: boolean = false) => {
    if (!selectedDepartment || !name.trim()) return;
    setSavingLabel(true);
    const sessionToken = getManagerSessionToken();
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "createTeamLabel", sessionToken, data: { departmentId: selectedDepartment, name: name.trim(), color, inheritTeamColor } },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Error");
      setTeamLabels((prev) => [...prev, data.label]);
      toast.success("Etiqueta creada");
    } catch (e: any) {
      toast.error(e?.message || "Error al crear etiqueta");
    } finally {
      setSavingLabel(false);
    }
  };
  const handleUpdateLabel = async (labelId: string, patch: { name?: string; color?: string | null; inheritTeamColor?: boolean; excludedShiftKeys?: string[] }) => {
    setSavingLabel(true);
    const sessionToken = getManagerSessionToken();
    // Optimistic update for snappy UI
    setTeamLabels((prev) => prev.map((l) => {
      if (l.id !== labelId) return l;
      const next = { ...l };
      if (patch.name !== undefined) next.name = patch.name;
      if (patch.color !== undefined) next.color = patch.color;
      if (patch.inheritTeamColor !== undefined) next.inherit_team_color = patch.inheritTeamColor;
      if (patch.excludedShiftKeys !== undefined) next.excluded_shift_keys = patch.excludedShiftKeys;
      return next;
    }));
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "updateTeamLabel", sessionToken, data: { labelId, ...patch } },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Error");
      setTeamLabels((prev) => prev.map((l) => (l.id === labelId ? { ...l, ...data.label } : l)));
    } catch (e: any) {
      toast.error(e?.message || "Error al actualizar etiqueta");
      loadTeamLabels();
    } finally {
      setSavingLabel(false);
    }
  };
  const handleDeleteLabel = async (labelId: string) => {
    if (!confirm("¿Eliminar esta etiqueta? Se quitará de los equipos que la tengan.")) return;
    const sessionToken = getManagerSessionToken();
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "deleteTeamLabel", sessionToken, data: { labelId } },
      });
      if (error || !data?.success) throw new Error(data?.error || "Error");
      setTeamLabels((prev) => prev.filter((l) => l.id !== labelId));
      setTeams((prev) => prev.map((t) => (t.label_id === labelId ? { ...t, label_id: null } : t)));
      toast.success("Etiqueta eliminada");
    } catch (e: any) {
      toast.error(e?.message || "Error al eliminar etiqueta");
    }
  };
  const handleAssignLabel = async (teamId: string, labelId: string | null) => {
    // Optimistic
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, label_id: labelId } : t)));
    const sessionToken = getManagerSessionToken();
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "assignTeamLabel", sessionToken, data: { teamId, labelId } },
      });
      if (error || !data?.success) throw new Error(data?.error || "Error");
    } catch (e: any) {
      toast.error(e?.message || "Error al asignar etiqueta");
      // Revert by reloading
      loadTeamLabels();
    }
  };
  const handleRotateLabels = async () => {
    // Rotate label_id between groups in current parentGroups order
    const sessionToken = getManagerSessionToken();
    if (parentGroups.length < 2) {
      toast.info("No hay suficientes grupos para rotar etiquetas");
      return;
    }
    // For each parent group, take the label of the FIRST team in the group, rotate forward
    const groupRepresentatives = parentGroups.map((pg) => (groupedTeams[pg] || [])[0]).filter(Boolean);
    if (groupRepresentatives.length < 2) return;
    const labelsRing = groupRepresentatives.map((t) => t.label_id || null);
    // Shift right: lastLabel goes to first
    const rotated = [labelsRing[labelsRing.length - 1], ...labelsRing.slice(0, -1)];
    // Apply: for every team in groupedTeams[pg], set the rotated label
    const assignments: { teamId: string; labelId: string | null }[] = [];
    parentGroups.forEach((pg, idx) => {
      const newLabel = rotated[idx];
      for (const t of groupedTeams[pg] || []) {
        assignments.push({ teamId: t.id, labelId: newLabel });
      }
    });
    // Optimistic
    setTeams((prev) =>
      prev.map((t) => {
        const found = assignments.find((a) => a.teamId === t.id);
        return found ? { ...t, label_id: found.labelId } : t;
      })
    );
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "bulkAssignTeamLabels", sessionToken, data: { assignments } },
      });
      if (error || !data?.success) throw new Error(data?.error || "Error");
      toast.success("Etiquetas rotadas");
    } catch (e: any) {
      toast.error(e?.message || "Error al rotar etiquetas");
      loadTeamLabels();
    }
  };

  // Load worker counts per team when department changes
  useEffect(() => {
    if (!selectedDepartment) {
      setWorkersPerTeam({});
      return;
    }
    
    const sessionToken = getManagerSessionToken();
    if (!sessionToken) return;
    
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("admin-operations", {
          body: {
            action: "getWorkers",
            sessionToken,
            data: { departmentId: selectedDepartment },
          },
        });
        
        if (!error && data?.success && data.workers) {
          // Count workers per team (all) and active (not on leave/vacation)
          const counts: Record<string, number> = {};
          const activeCounts: Record<string, number> = {};
          for (const worker of data.workers) {
            const teamId = worker.worker_team_id;
            // Skip test worker 0000
            if (teamId && worker.worker_number !== '0000') {
              counts[teamId] = (counts[teamId] || 0) + 1;
              if (!worker.is_on_leave && !worker.is_on_vacation) {
                activeCounts[teamId] = (activeCounts[teamId] || 0) + 1;
              }
            }
          }
          setWorkersPerTeam(counts);
          setActiveWorkersPerTeam(activeCounts);
        }
      } catch (e) {
        console.error("Error loading workers:", e);
      }
    })();
  }, [selectedDepartment]);

  // Auto-update only cells that still follow the configured default shift times.
  // This preserves custom per-day overrides like a special Monday schedule.
  useEffect(() => {
    if (!departmentShifts.length) return;

    const nextShiftTimes = departmentShifts.reduce<Record<string, { start: string | null; end: string | null; isRest: boolean }>>((acc, shift) => {
      acc[shift.shift_key] = {
        start: shift.start_time || null,
        end: shift.end_time || null,
        isRest: !!shift.is_rest,
      };
      return acc;
    }, {});

    const normalizedNextShiftTimes = Object.fromEntries(
      Object.entries(nextShiftTimes).map(([key, value]) => [key, { start: value.start, end: value.end }])
    );

    if (weekLoading || !Object.keys(schedule).length || !Object.keys(previousShiftTimesRef.current).length) {
      previousShiftTimesRef.current = normalizedNextShiftTimes;
      return;
    }

    const previousShiftTimes = previousShiftTimesRef.current;

    setSchedule((prev) => {
      let changed = false;
      const newSchedule = { ...prev };

      for (const dayKey in newSchedule) {
        const dayData = { ...newSchedule[dayKey] };
        let dayChanged = false;

        for (const teamId in dayData) {
          const cell = dayData[teamId];
          const shiftMeta = nextShiftTimes[cell.type];

          if (!shiftMeta || shiftMeta.isRest || cell.type === "vacation") continue;

          const previousDefaults = previousShiftTimes[cell.type];
          const isUsingPreviousDefaults =
            cell.start === (previousDefaults?.start ?? null) &&
            cell.end === (previousDefaults?.end ?? null);

          if (!isUsingPreviousDefaults) continue;

          if (cell.start !== shiftMeta.start || cell.end !== shiftMeta.end) {
            dayData[teamId] = {
              ...cell,
              start: shiftMeta.start,
              end: shiftMeta.end,
            };
            dayChanged = true;
            changed = true;
          }
        }

        if (dayChanged) {
          newSchedule[dayKey] = dayData;
        }
      }

      if (changed) {
        setDirty(true);
      }

      return changed ? newSchedule : prev;
    });

    previousShiftTimesRef.current = normalizedNextShiftTimes;
  }, [departmentShifts, schedule, weekLoading]);

  useEffect(() => {
    if (!selectedDepartment) return;
    
    const sessionToken = getManagerSessionToken();
    if (!sessionToken) {
      // No session, use empty schedule without calling edge function
      setScheduleId(null);
      setSchedule(makeEmptySchedule());
      setNotes("");
      setDayAnnouncements({});
      setDirty(false);
      return;
    }
    
    (async () => {
      setWeekLoading(true);
      try {
        // Load shifts, schedule and fresh team metadata in parallel for the department
        const [shiftsResp, scheduleResp, deptTeamsResp] = await Promise.all([
          supabase.functions.invoke("admin-operations", {
            body: {
              action: "getWeeklyShifts",
              sessionToken,
              data: { departmentId: selectedDepartment, year, week },
            },
          }),
          supabase.functions.invoke("admin-operations", {
            body: {
              action: "getWeeklySchedule",
              sessionToken,
              data: {
                departmentId: selectedDepartment,
                year,
                weekNumber: week,
              },
            },
          }),
          supabase.functions.invoke("admin-operations", {
            body: {
              action: "getWorkerGroupsData",
              sessionToken,
              data: { departmentId: selectedDepartment },
            },
          }),
        ]);

        // Process shifts first so they're available for rendering
        if (shiftsResp.data?.success && shiftsResp.data.shifts) {
          setDepartmentShifts(shiftsResp.data.shifts);
        }

        const { data: resp, error } = scheduleResp;

        if (error || !resp?.success) {
          // IMPORTANT: only clear local session on explicit backend invalidation.
          // A 401/network/cold-start error must NOT log the user out.
          if (isExplicitSessionInvalid(resp)) {
            clearManagerSession({ silent: false });
            setScheduleId(null);
            setSchedule(makeEmptySchedule());
            setNotes("");
            setDayAnnouncements({});
            setDirty(false);
            setWeekLoading(false);
            return;
          }

          throw new Error(resp?.error || error?.message || "Error al cargar horario");
        }

        const row = resp.schedule;
        
        // Process vacation data from annual calendar
        const newVacationMap: Record<string, Set<string>> = {};
        const vacationDays = resp.vacationDays || [];
        const groupTeamMap = resp.groupTeamMap || [];
        
        // Build a map: work_group_id → team_ids[]
        const groupToTeams: Record<string, string[]> = {};
        for (const mapping of groupTeamMap) {
          if (!groupToTeams[mapping.work_group_id]) {
            groupToTeams[mapping.work_group_id] = [];
          }
          groupToTeams[mapping.work_group_id].push(mapping.worker_team_id);
        }
        
        // Refresh selected department teams with latest display_name metadata
        const refreshedDeptTeams = deptTeamsResp.data?.success
          ? (deptTeamsResp.data.workerTeams || []).map((t: any) => ({
              ...t,
              display_name: t.display_name ?? t.displayName ?? null,
              label_id: t.label_id ?? null,
            }))
          : null;

        if (refreshedDeptTeams) {
          setTeams((prev) => {
            const prevDeptTeams = prev
              .filter((t) => t.department_id === selectedDepartment)
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

            const nextDeptTeams = [...refreshedDeptTeams]
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

            const sameDeptTeams =
              prevDeptTeams.length === nextDeptTeams.length &&
              prevDeptTeams.every((t, i) => {
                const n = nextDeptTeams[i];
                return (
                  t.id === n.id &&
                  t.name === n.name &&
                  (t.display_name ?? null) === (n.display_name ?? null) &&
                  (t.sort_order ?? 0) === (n.sort_order ?? 0)
                );
              });

            if (sameDeptTeams) return prev;

            const otherDepartments = prev.filter((t) => t.department_id !== selectedDepartment);
            return [...otherDepartments, ...refreshedDeptTeams];
          });
        }

        // Store work groups for reference
        const workGroupsList = resp.workGroups || [];
        setWorkGroups(workGroupsList);

        // Get department teams - use freshly fetched department teams when available
        const currentDeptTeams = (refreshedDeptTeams || deptTeams || [])
          .filter(t => t.department_id === selectedDepartment)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        
        console.log(`Processing vacation days: ${vacationDays.length} days, ${groupTeamMap.length} mappings, ${currentDeptTeams.length} teams`);
        
        // Map vacation days to dayKeys and teamIds
        for (const vd of vacationDays) {
          const vDate = new Date(vd.date + 'T12:00:00'); // Use noon to avoid timezone issues
          const dayKey = String(vDate.getDay()); // 0=Sun, 1=Mon, etc.
          
          if (!newVacationMap[dayKey]) {
            newVacationMap[dayKey] = new Set();
          }
          
          console.log(`Vacation day: ${vd.date} (dayKey: ${dayKey}), type: ${vd.day_type}, group_id: ${vd.group_id}`);
          
          // For vacaciones_generales, all teams are on vacation
          if (vd.day_type === 'vacaciones_generales') {
            for (const t of currentDeptTeams) {
              newVacationMap[dayKey].add(t.id);
            }
          } else {
            // Group-specific vacation
            if (vd.group_id && groupToTeams[vd.group_id]) {
              console.log(`Group ${vd.group_id} has teams: ${groupToTeams[vd.group_id].join(', ')}`);
              for (const teamId of groupToTeams[vd.group_id]) {
                newVacationMap[dayKey].add(teamId);
              }
            }
            if (vd.group_id_2 && vd.group_id_2 !== vd.group_id && groupToTeams[vd.group_id_2]) {
              for (const teamId of groupToTeams[vd.group_id_2]) {
                newVacationMap[dayKey].add(teamId);
              }
            }
          }
        }
        
        console.log('VacationMap:', Object.fromEntries(
          Object.entries(newVacationMap).map(([k, v]) => [k, Array.from(v)])
        ));
        
        setVacationMap(newVacationMap);
        
        if (row) {
          setScheduleId(row.id);
          // Merge vacation data into loaded schedule
          const rawConfig: any = (row.configuration as any) || {};
          // Extract per-day announcements (stored under reserved key)
          const loadedAnnouncements: Record<string, string> =
            (rawConfig && typeof rawConfig.__announcements === 'object' && rawConfig.__announcements) || {};
          setDayAnnouncements(loadedAnnouncements);
          const loadedSchedule = (rawConfig as ScheduleState) || {};
          // For cells where team is on vacation from calendar, OVERRIDE with vacation
          // unless the saved value is explicitly NOT vacation (user override)
          const mergedSchedule: ScheduleState = {};
          for (const d of DAYS) {
            mergedSchedule[d.key] = {};
            for (const t of currentDeptTeams) {
              const savedCell = loadedSchedule[d.key]?.[t.id];
              const isOnVacation = newVacationMap[d.key]?.has(t.id);
              
              // If on vacation from calendar AND no saved value or saved value is not an explicit override
              // Auto-fill with vacation
              if (isOnVacation) {
                // Check if user has explicitly saved a different value (not vacation and not the default morning)
                const hasExplicitOverride = savedCell && 
                  savedCell.type !== 'vacation' && 
                  savedCell.type !== 'morning'; // Treat morning as "not yet configured"
                
                if (hasExplicitOverride) {
                  // User explicitly changed it to something else
                  mergedSchedule[d.key][t.id] = savedCell;
                } else {
                  // Auto-mark as vacation
                  mergedSchedule[d.key][t.id] = { type: "vacation", start: null, end: null };
                }
              } else if (savedCell) {
                mergedSchedule[d.key][t.id] = savedCell;
              } else {
                // Default empty
                const isWeekend = d.key === "5" || d.key === "6";
                const type: ScheduleType = isWeekend ? "rest" : "morning";
                mergedSchedule[d.key][t.id] = { type, start: DEFAULT_TIMES[type].start, end: DEFAULT_TIMES[type].end };
              }
            }
          }
          setSchedule(mergedSchedule);
          setNotes(row.notes || "");
          // Set review status from the loaded schedule
          setIsWeekReviewed(row.is_reviewed ?? false);
          setReviewedAt(row.reviewed_at || null);
          setReviewedBy(row.reviewed_by || null);
        } else {
          setScheduleId(null);
          // For new schedules, pre-fill with vacation data
          const emptySchedule = makeEmptyScheduleWithVacations(newVacationMap);
          setSchedule(emptySchedule);
          setNotes("");
          setDayAnnouncements({});
          // Reset review status for new schedules
          setIsWeekReviewed(false);
          setReviewedAt(null);
          setReviewedBy(null);
        }

        setDirty(false);
      } catch (e) {
        console.error(e);
        toast.error("Error al cargar horario");
      }
      setWeekLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDepartment, year, week]);

  const makeEmptySchedule = (): ScheduleState => {
    const base: ScheduleState = {};
    for (const d of DAYS) {
      base[d.key] = {};
      for (const t of deptTeams) {
        // Weekend is Friday (5) and Saturday (6), Sunday (0) is a working day
        const isWeekend = d.key === "5" || d.key === "6";
        const type: ScheduleType = isWeekend ? "rest" : "morning";
        base[d.key][t.id] = {
          type,
          start: DEFAULT_TIMES[type].start,
          end: DEFAULT_TIMES[type].end,
        };
      }
    }
    return base;
  };

  // Make empty schedule but pre-fill vacation days from annual calendar
  const makeEmptyScheduleWithVacations = (vacMap: Record<string, Set<string>>): ScheduleState => {
    const base: ScheduleState = {};
    for (const d of DAYS) {
      base[d.key] = {};
      for (const t of deptTeams) {
        const isOnVacation = vacMap[d.key]?.has(t.id);
        
        if (isOnVacation) {
          base[d.key][t.id] = { type: "vacation", start: null, end: null };
        } else {
          // Weekend is Friday (5) and Saturday (6), Sunday (0) is a working day
          const isWeekend = d.key === "5" || d.key === "6";
          const type: ScheduleType = isWeekend ? "rest" : "morning";
          base[d.key][t.id] = {
            type,
            start: DEFAULT_TIMES[type].start,
            end: DEFAULT_TIMES[type].end,
          };
        }
      }
    }
    return base;
  };
  
  // Helper to check if a team is on vacation from the annual calendar
  const isTeamOnVacation = (dayKey: string, teamId: string): boolean => {
    return vacationMap[dayKey]?.has(teamId) ?? false;
  };

  // Helper to check if ALL teams in a group are on vacation
  const isGroupOnVacation = (dayKey: string, parentGroup: string): boolean => {
    const teamsInGroup = groupedTeams[parentGroup] || [];
    if (teamsInGroup.length === 0) return false;
    return teamsInGroup.every(team => isTeamOnVacation(dayKey, team.id));
  };

  // Helper to get the date string for a given dayKey
  // DAYS order: Sunday (0), Monday (1), Tuesday (2), ..., Saturday (6)
  const getDayDateStr = (dayKey: string): string => {
    const r = weekRange(year, week);
    const dayIndex = DAYS.findIndex(d => d.key === dayKey);
    if (dayIndex === -1) return '';
    const d = new Date(r.start);
    // r.start is Monday (ISO week start), so Sunday = -1 days, Mon = 0 days, Tue = 1 day, etc.
    d.setDate(d.getDate() + (dayIndex === 0 ? -1 : dayIndex - 1));
    return d.toISOString().split('T')[0];
  };

  // Get work group name(s) for a team's vacation
  const getVacationGroupNames = (dayKey: string, teamId: string): string[] => {
    // Find which work groups are associated with this team that are on vacation
    const groupNames: string[] = [];
    for (const wg of workGroups) {
      // Check if this team belongs to this work group
      const parentGroup = getParentGroup(deptTeams.find(t => t.id === teamId)?.name || '');
      if (wg.name && wg.name.toLowerCase().includes(parentGroup.toLowerCase())) {
        groupNames.push(wg.name);
      }
    }
    return groupNames.length > 0 ? groupNames : ['Grupo desconocido'];
  };

  const setCellType = (dayKey: string, teamId: string, type: ScheduleType) => {
    const wasOnVacation = isTeamOnVacation(dayKey, teamId);
    const currentType = schedule?.[dayKey]?.[teamId]?.type;
    
    // If changing FROM vacation to something else AND was from calendar, offer sync
    if (wasOnVacation && currentType === 'vacation' && type !== 'vacation') {
      const dateStr = getDayDateStr(dayKey);
      const affectedGroups = getVacationGroupNames(dayKey, teamId);
      setPendingSyncDialog({
        dayKey,
        teamId,
        parentGroup: null,
        newType: type,
        dateStr,
        affectedGroups,
      });
      return;
    }
    
    const times = getShiftTimes(type);
    setSchedule((prev) => ({
      ...prev,
      [dayKey]: {
        ...(prev[dayKey] || {}),
        [teamId]: {
          ...(prev[dayKey]?.[teamId] || {}),
          type,
          start: times.start,
          end: times.end,
        },
      },
    }));
    setDirty(true);
  };

  const setCellTime = (dayKey: string, teamId: string, field: "start" | "end", value: string) => {
    setSchedule((prev) => {
      const defaultTimes = getShiftTimes("morning");
      const currentCell = prev[dayKey]?.[teamId] || { type: "morning" as ScheduleType, start: defaultTimes.start, end: defaultTimes.end };
      return {
        ...prev,
        [dayKey]: {
          ...(prev[dayKey] || {}),
          [teamId]: {
            ...currentCell,
            start: field === "start" ? value : currentCell.start,
            end: field === "end" ? value : currentCell.end,
          },
        },
      };
    });
    setDirty(true);
  };

  // Set partial count for a team on a specific day
  const setCellPartialCount = (dayKey: string, teamId: string, count: number | null) => {
    setSchedule((prev) => {
      const defaultTimes = getShiftTimes("morning");
      const currentCell = prev[dayKey]?.[teamId] || { type: "morning" as ScheduleType, start: defaultTimes.start, end: defaultTimes.end };
      return {
        ...prev,
        [dayKey]: {
          ...(prev[dayKey] || {}),
          [teamId]: {
            ...currentCell,
            partial_count: count && count > 0 ? count : null,
          },
        },
      };
    });
    setDirty(true);
  };

  // Set partial config (count + shift) for a group, propagating to all subteams
  const setGroupPartialConfig = (dayKey: string, parentGroup: string, config: { partial_count: number | null; partial_shift: string | null; partial_start: string | null; partial_end: string | null }) => {
    const teamsInGroup = groupedTeams[parentGroup] || [];
    setSchedule((prev) => {
      const newSchedule = { ...prev };
      if (!newSchedule[dayKey]) newSchedule[dayKey] = {};
      for (const team of teamsInGroup) {
        const currentCell = prev[dayKey]?.[team.id] || { type: "morning" as ScheduleType, start: getShiftTimes("morning").start, end: getShiftTimes("morning").end };
        newSchedule[dayKey] = {
          ...newSchedule[dayKey],
          [team.id]: {
            ...currentCell,
            partial_count: config.partial_count && config.partial_count > 0 ? config.partial_count : null,
            partial_shift: config.partial_shift || null,
            partial_start: config.partial_start || null,
            partial_end: config.partial_end || null,
          },
        };
      }
      return newSchedule;
    });
    setDirty(true);
  };

  // Get aggregated partial info for a group (from first team that has it)
  const getGroupPartialInfo = (dayKey: string, parentGroup: string): { partial_count: number | null; partial_shift: string | null; partial_start: string | null; partial_end: string | null } => {
    const teamsInGroup = groupedTeams[parentGroup] || [];
    for (const team of teamsInGroup) {
      const cell = schedule?.[dayKey]?.[team.id];
      if (cell?.partial_count && cell.partial_count > 0) {
        return {
          partial_count: cell.partial_count,
          partial_shift: cell.partial_shift || null,
          partial_start: cell.partial_start || null,
          partial_end: cell.partial_end || null,
        };
      }
    }
    return { partial_count: null, partial_shift: null, partial_start: null, partial_end: null };
  };


  const setGroupCellType = (dayKey: string, parentGroup: string, type: ScheduleType) => {
    const teamsInGroup = groupedTeams[parentGroup] || [];
    
    // Check if any team in the group was on vacation from calendar
    const wasGroupOnVacation = isGroupOnVacation(dayKey, parentGroup);
    const currentType = getGroupCell(dayKey, parentGroup).type;
    
    // If changing FROM vacation to something else AND was from calendar, offer sync
    if (wasGroupOnVacation && currentType === 'vacation' && type !== 'vacation') {
      const dateStr = getDayDateStr(dayKey);
      // Find which work groups match this parent group
      const affectedGroups = workGroups
        .filter(wg => wg.name?.toLowerCase().includes(parentGroup.toLowerCase()))
        .map(wg => wg.name);
      
      setPendingSyncDialog({
        dayKey,
        teamId: null,
        parentGroup,
        newType: type,
        dateStr,
        affectedGroups: affectedGroups.length > 0 ? affectedGroups : [parentGroup],
      });
      return;
    }
    
    const times = getShiftTimes(type);
    setSchedule((prev) => {
      const newSchedule = { ...prev };
      if (!newSchedule[dayKey]) newSchedule[dayKey] = {};
      for (const team of teamsInGroup) {
        newSchedule[dayKey] = {
          ...newSchedule[dayKey],
          [team.id]: {
            type,
            start: times.start,
            end: times.end,
          },
        };
      }
      return newSchedule;
    });
    setDirty(true);
  };

  // Apply time to all teams in a parent group
  const setGroupCellTime = (dayKey: string, parentGroup: string, field: "start" | "end", value: string) => {
    const teamsInGroup = groupedTeams[parentGroup] || [];
    setSchedule((prev) => {
      const newSchedule = { ...prev };
      if (!newSchedule[dayKey]) newSchedule[dayKey] = {};
      const defaultTimes = getShiftTimes("morning");
      for (const team of teamsInGroup) {
        const currentCell = prev[dayKey]?.[team.id] || { type: "morning" as ScheduleType, start: defaultTimes.start, end: defaultTimes.end };
        newSchedule[dayKey] = {
          ...newSchedule[dayKey],
          [team.id]: {
            ...currentCell,
            start: field === "start" ? value : currentCell.start,
            end: field === "end" ? value : currentCell.end,
          },
        };
      }
      return newSchedule;
    });
    setDirty(true);
  };

  // Get representative cell for a parent group (majority type among subgroups)
  const getGroupCell = (dayKey: string, parentGroup: string) => {
    const teamsInGroup = groupedTeams[parentGroup] || [];
    if (teamsInGroup.length === 0) return { type: "rest" as ScheduleType, start: null, end: null };
    
    // Count each type to determine majority.
    // IMPORTANT: schedule can contain custom shift keys (e.g. "custom_...") so this must be dynamic.
    const typeCounts: Record<string, number> = {};
    let firstMatchingCell = { type: "rest" as string, start: null as string | null, end: null as string | null };
    
    for (const team of teamsInGroup) {
      const cell = schedule?.[dayKey]?.[team.id];
      const cellType = (cell?.type as string) || "rest";
      typeCounts[cellType] = (typeCounts[cellType] ?? 0) + 1;
    }
    
    // Find the majority type
    let majorityType: string = "rest";
    let maxCount = 0;
    for (const [type, count] of Object.entries(typeCounts)) {
      if (count > maxCount) {
        maxCount = count;
        majorityType = type;
      }
    }
    
    // Get start/end from first team with the majority type
    for (const team of teamsInGroup) {
      const cell = schedule?.[dayKey]?.[team.id];
      if ((cell?.type as ScheduleType) === majorityType) {
        firstMatchingCell = {
          type: majorityType,
          start: cell?.start ?? null,
          end: cell?.end ?? null,
        };
        break;
      }
    }
    
    return firstMatchingCell as any;
  };

  // Check if a parent group has mixed shift types for a day
  const getGroupMixedInfo = (dayKey: string, parentGroup: string): { hasMixed: boolean; details: string[] } => {
    const teamsInGroup = groupedTeams[parentGroup] || [];
    if (teamsInGroup.length <= 1) return { hasMixed: false, details: [] };
    
    const details: string[] = [];
    const types = new Set<ScheduleType>();
    
    for (const team of teamsInGroup) {
      const cell = schedule?.[dayKey]?.[team.id];
      const cellType = (cell?.type as ScheduleType) || "rest";
      types.add(cellType);
      details.push(`${team.name}: ${TYPE_LABEL[cellType]}`);
    }
    
    return { hasMixed: types.size > 1, details };
  };

  // Update group color in database
  const updateGroupColor = async (groupLetter: string, newColor: string) => {
    if (!selectedDepartment) return;
    
    try {
      const sessionToken = getManagerSessionToken();
      if (!sessionToken) {
        toast.error("Sesión no válida");
        return;
      }

      // Update local state immediately
      setGroupColors(prev => ({ ...prev, [groupLetter]: newColor }));
      setCustomHexInput("");

      // Persist to database via edge function
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "upsertScheduleGroupColor",
          sessionToken,
          data: {
            departmentId: selectedDepartment,
            groupLetter,
            color: newColor,
          },
        },
      });

      if (error || !data?.success) {
        console.error("Error saving group color:", error || data?.error);
        // Don't show error toast for color saves - they're cosmetic
      }

      toast.success(`Color de ${getGroupDisplayName(groupLetter)} actualizado`);
    } catch (e) {
      console.error("Error updating group color:", e);
      toast.error("Error al guardar color");
    }
  };

  // Toggle team schedule lock
  const toggleTeamScheduleLock = async (teamId: string, currentLocked: boolean) => {
    try {
      const sessionToken = getManagerSessionToken();
      if (!sessionToken) {
        toast.error("Sesión no válida");
        return;
      }

      const newLocked = !currentLocked;
      
      // Update local state immediately for responsiveness
      setTeams(prev => prev.map(t => 
        t.id === teamId ? { ...t, is_schedule_locked: newLocked } : t
      ));

      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "toggleTeamScheduleLock",
          sessionToken,
          data: { teamId, isLocked: newLocked },
        },
      });

      if (error || !data?.success) {
        // Revert on error
        setTeams(prev => prev.map(t => 
          t.id === teamId ? { ...t, is_schedule_locked: currentLocked } : t
        ));
        console.error("Error toggling team lock:", error || data?.error);
        toast.error("Error al cambiar bloqueo");
        return;
      }

      toast.success(newLocked ? "Equipo bloqueado - su horario no cambiará" : "Equipo desbloqueado");
    } catch (e) {
      console.error("Error toggling team lock:", e);
      toast.error("Error al cambiar bloqueo");
    }
  };

  const save = async (opts?: { silent?: boolean }) => {
    if (!selectedDepartment) return;
    const isSilent = opts?.silent ?? false;
    
    if (!isSilent) setSaving(true);
    if (isSilent) setAutoSaveStatus("saving");
    
    try {
      const sessionToken = getManagerSessionToken();
      if (!sessionToken) {
        if (!isSilent) toast.error("Sesión requerida para guardar");
        return;
      }

      // Save current week
      const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "upsertWeeklySchedule",
          sessionToken,
          data: {
            departmentId: selectedDepartment,
            year,
            weekNumber: week,
            configuration: { ...schedule, __announcements: dayAnnouncements },
            notes: notes || null,
          },
        },
      });

      if (isExplicitSessionInvalid(resp)) {
        clearManagerSession({ silent: false });
        return;
      }

      if (error || !resp?.success) {
        throw new Error(resp?.error || error?.message || "Error al guardar horario");
      }

      if (resp.schedule?.id) setScheduleId(resp.schedule.id);

      // If propagateToFuture is enabled, propagate config to next 4 weeks with rotated logic
      if (propagateToFuture && ruleConfig && !isSilent) {
        await propagateFutureWeeks(sessionToken, 4);
      }

      if (!isSilent) toast.success(propagateToFuture ? "Horario guardado y propagado" : "Horario guardado");
      setDirty(false);
      
      if (isSilent) {
        setAutoSaveStatus("saved");
        lastAutoSaveRef.current = Date.now();
        // Reset status after 3 seconds
        setTimeout(() => setAutoSaveStatus("idle"), 3000);
      }
    } catch (e) {
      console.error(e);
      if (!isSilent) toast.error("Error al guardar horario");
      if (isSilent) setAutoSaveStatus("idle");
    }
    if (!isSilent) setSaving(false);
  };

  // Propagate schedule to future weeks following rotation logic
  const propagateFutureWeeks = async (sessionToken: string, numWeeks: number) => {
    if (!ruleConfig || !schedule) return;

    const getIsoWeekStart = (y: number, w: number): Date => {
      const jan4 = new Date(y, 0, 4);
      const dayOfWeek = jan4.getDay() || 7;
      const firstMonday = new Date(jan4);
      firstMonday.setDate(jan4.getDate() - dayOfWeek + 1);
      const result = new Date(firstMonday);
      result.setDate(firstMonday.getDate() + (w - 1) * 7);
      return result;
    };

    const getIsoWeek = (date: Date): number => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    };

    const getIsoWeekYear = (date: Date): number => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      return d.getUTCFullYear();
    };

    // Generate future weeks starting from current week + 1
    const futureWeeks: { week: number; year: number }[] = [];
    const baseDate = getIsoWeekStart(year, week);
    
    for (let i = 1; i <= numWeeks; i++) {
      const nextDate = new Date(baseDate);
      nextDate.setDate(baseDate.getDate() + (i * 7));
      futureWeeks.push({
        week: getIsoWeek(nextDate),
        year: getIsoWeekYear(nextDate),
      });
    }

    // For each future week, apply the same schedule pattern with rotated groups
    for (const fw of futureWeeks) {
      // Create rotated schedule based on the current one
      const rotatedSchedule = applyRotationToSchedule(schedule, fw.week, fw.year);
      
      try {
        await supabase.functions.invoke("admin-operations", {
          body: {
            action: "upsertWeeklySchedule",
            sessionToken,
            data: {
              departmentId: selectedDepartment,
              year: fw.year,
              weekNumber: fw.week,
              configuration: rotatedSchedule,
              notes: null,
            },
          },
        });
      } catch (e) {
        console.error(`Error propagating to week ${fw.week}:`, e);
      }
    }
  };

  // Apply rotation logic to generate schedule for a different week
  const applyRotationToSchedule = (baseSchedule: ScheduleState, targetWeek: number, targetYear: number): ScheduleState => {
    if (!ruleConfig) return baseSchedule;

    // Deep clone the base schedule
    const newSchedule: ScheduleState = JSON.parse(JSON.stringify(baseSchedule));

    // If group rotation is enabled, we need to rotate which group is on guard duty
    if (ruleConfig.groupRotation?.enabled && ruleConfig.subgroupRotation?.enabled && ruleConfig.guardDuty?.enabled) {
      const groups = parentGroups;
      const baseWeek = ruleConfig.subgroupRotation?.baseWeek || week;
      const baseYear = ruleConfig.subgroupRotation?.baseYear || year;

      // Calculate week offset from base
      const baseDate = new Date(baseYear, 0, 1);
      baseDate.setDate(baseDate.getDate() + (baseWeek - 1) * 7);
      const targetDate = new Date(targetYear, 0, 1);
      targetDate.setDate(targetDate.getDate() + (targetWeek - 1) * 7);
      const weekDiff = Math.round((targetDate.getTime() - baseDate.getTime()) / (7 * 24 * 60 * 60 * 1000));

      // Current week offset from base
      const currentDate = new Date(year, 0, 1);
      currentDate.setDate(currentDate.getDate() + (week - 1) * 7);
      const currentWeekDiff = Math.round((currentDate.getTime() - baseDate.getTime()) / (7 * 24 * 60 * 60 * 1000));

      // Calculate rotation offset
      const rotationOffset = weekDiff - currentWeekDiff;

      if (rotationOffset !== 0) {
        // We need to shift which teams get which schedules
        // This is complex - for now, copy the times/types but the rotation logic
        // should be handled by re-generating from rules rather than shifting
        // The key insight is: the current schedule has times configured that should
        // apply to future weeks with the same pattern
        
        // For times and types, keep them the same per team position
        // The rotation is handled by the fact that the user set up this week correctly
        // and future weeks should mirror the same TIME configuration
      }
    }

    return newSchedule;
  };

  // Auto-save effect - save every 30 seconds when dirty
  useEffect(() => {
    if (!dirty || !selectedDepartment) {
      return;
    }
    
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Set new timeout for 30 seconds
    autoSaveTimeoutRef.current = setTimeout(() => {
      const sessionToken = getManagerSessionToken();
      if (sessionToken && dirty) {
        save({ silent: true });
      }
    }, 30000);
    
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [dirty, schedule, notes, selectedDepartment, year, week]);

  // Load schedule history
  const loadHistory = async () => {
    if (!scheduleId) {
      toast.info("Guarda el horario primero para ver el historial");
      return;
    }
    
    setHistoryLoading(true);
    setHistoryOpen(true);
    
    try {
      const sessionToken = getManagerSessionToken();
      if (!sessionToken) {
        toast.error("Sesión requerida para ver el historial");
        return;
      }

      const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getScheduleHistory",
          sessionToken,
          data: { scheduleId },
        },
      });

      if (isExplicitSessionInvalid(resp)) {
        clearManagerSession({ silent: false });
        setHistoryOpen(false);
        return;
      }

      if (error || !resp?.success) {
        throw new Error(resp?.error || error?.message || "Error al cargar historial");
      }

      setScheduleVersions(resp.versions || []);
    } catch (e) {
      console.error(e);
      toast.error("Error al cargar historial");
    }
    setHistoryLoading(false);
  };

  // Restore a previous version
  const restoreVersion = (version: typeof scheduleVersions[0]) => {
    setSchedule(version.configuration);
    setNotes(version.notes || "");
    setDirty(true);
    setHistoryOpen(false);
    toast.success("Versión restaurada (sin guardar)");
  };

  // Copy current week's schedule to a target week
  const copyWeekToTarget = async (skipRotation = false) => {
    if (!selectedDepartment || !schedule) {
      toast.error("No hay horario para copiar");
      return;
    }
    
    if (copyTargetWeek === week && copyTargetYear === year) {
      toast.error("No puedes copiar a la misma semana");
      return;
    }

    const currentDept = departments.find(d => d.id === selectedDepartment);
    
    // If auto-rotate is enabled and not yet confirmed, show confirmation dialog
    if (currentDept?.schedule_auto_rotate_teams && !skipRotation && parentGroups.length > 1) {
      setRotationConfirmOpen(true);
      return;
    }
    
    setIsCopying(true);
    
    try {
      const sessionToken = getManagerSessionToken();
      if (!sessionToken) {
        toast.error("Sesión requerida para copiar");
        return;
      }

      // If auto-rotate is enabled and confirmed, rotate team sort_order first
      if (currentDept?.schedule_auto_rotate_teams && !skipRotation && parentGroups.length > 1) {
        await applyTeamRotation(sessionToken);
      }
      
      const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "upsertWeeklySchedule",
          sessionToken,
          data: {
            departmentId: selectedDepartment,
            year: copyTargetYear,
            weekNumber: copyTargetWeek,
            configuration: schedule,
            notes: `Copiado de semana ${week}/${year}`,
            copyShiftsFrom: { sourceYear: year, sourceWeek: week },
          },
        },
      });
      
      if (isExplicitSessionInvalid(resp)) {
        clearManagerSession({ silent: false });
        return;
      }
      
      if (error || !resp?.success) {
        throw new Error(resp?.error || error?.message || "Error al copiar horario");
      }
      
      toast.success(`Horario copiado a Semana ${copyTargetWeek}/${copyTargetYear}`);
      setCopyWeekDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error al copiar horario");
    }
    
    setIsCopying(false);
  };

  // Apply team rotation: last group goes to first, rest shift down
  const applyTeamRotation = async (sessionToken: string) => {
    if (parentGroups.length < 2) return;
    
    // Rotate: last group goes to position 0, rest shift down
    const rotated = [...parentGroups];
    const lastGroup = rotated.pop()!;
    rotated.unshift(lastGroup);
    
    const teamOrders: { teamId: string; sortOrder: number }[] = [];
    let order = 0;
    for (const group of rotated) {
      const teamsInGroup = groupedTeams[group] || [];
      for (const team of teamsInGroup) {
        teamOrders.push({ teamId: team.id, sortOrder: order });
        order++;
      }
    }
    
    const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
      body: { action: "reorderTeams", sessionToken, data: { teamOrders } },
    });
    
    if (error || !resp?.success) {
      console.error("Error rotating teams:", error);
      toast.error("Error al rotar equipos");
    } else {
      toast.success("Orden de equipos rotado automáticamente");
    }
  };

  // Confirm rotation and proceed with copy
  const confirmRotationAndCopy = async () => {
    setRotationConfirmOpen(false);
    setIsCopying(true);
    try {
      const sessionToken = getManagerSessionToken();
      if (!sessionToken) {
        toast.error("Sesión requerida");
        return;
      }
      await applyTeamRotation(sessionToken);
      await copyWeekToTarget(true);
    } catch (e) {
      console.error(e);
      toast.error("Error al copiar con rotación");
    }
    setIsCopying(false);
  };

  // Get rotated order preview
  const getRotatedGroupsPreview = (): string[] => {
    if (parentGroups.length < 2) return parentGroups;
    const rotated = [...parentGroups];
    const lastGroup = rotated.pop()!;
    rotated.unshift(lastGroup);
    return rotated.map(g => getGroupDisplayName(g));
  };

  // Generate WhatsApp summary of workers per day/time
  const generateWorkerSummary = () => {
    const dept = departments.find(d => d.id === selectedDepartment);
    const deptName = dept?.name || "Departamento";
    const r = weekRange(year, week);
    
    // Map department names to their worker terms
    const getWorkerTerm = (name: string, count: number): string => {
      const normalized = name.toLowerCase().trim();
      const plural = count !== 1;
      
      // Map of department name patterns to worker terms
      const termMappings: Record<string, { singular: string; plural: string }> = {
        'sacado': { singular: 'sacador', plural: 'sacadores' },
        'encajado': { singular: 'encajador', plural: 'encajadores' },
        'picking': { singular: 'picker', plural: 'pickers' },
        'recepción': { singular: 'receptor', plural: 'receptores' },
        'recepcion': { singular: 'receptor', plural: 'receptores' },
        'camara': { singular: 'camarista', plural: 'camaristas' },
        'cámara': { singular: 'camarista', plural: 'camaristas' },
        'almacén': { singular: 'almacenero', plural: 'almaceneros' },
        'almacen': { singular: 'almacenero', plural: 'almaceneros' },
        'logística': { singular: 'logístico', plural: 'logísticos' },
        'logistica': { singular: 'logístico', plural: 'logísticos' },
        'reparto': { singular: 'repartidor', plural: 'repartidores' },
        'transporte': { singular: 'transportista', plural: 'transportistas' },
        'mantenimiento': { singular: 'técnico', plural: 'técnicos' },
        'limpieza': { singular: 'limpiador', plural: 'limpiadores' },
        'administración': { singular: 'administrativo', plural: 'administrativos' },
        'administracion': { singular: 'administrativo', plural: 'administrativos' },
        'calidad': { singular: 'técnico de calidad', plural: 'técnicos de calidad' },
        'compras': { singular: 'comprador', plural: 'compradores' },
        'ventas': { singular: 'vendedor', plural: 'vendedores' },
        'atención al cliente': { singular: 'agente', plural: 'agentes' },
        'atencion al cliente': { singular: 'agente', plural: 'agentes' },
      };
      
      // Find matching term
      for (const [key, terms] of Object.entries(termMappings)) {
        if (normalized.includes(key)) {
          return plural ? terms.plural : terms.singular;
        }
      }
      
      // Default fallback
      return plural ? 'trabajadores' : 'trabajador';
    };
    
    // Days order: Sunday (0), Monday (1), Tuesday (2), ..., Saturday (6)
    const dayNames: Record<string, string> = {
      "0": "Domingo",
      "1": "Lunes",
      "2": "Martes",
      "3": "Miércoles",
      "4": "Jueves",
      "5": "Viernes",
      "6": "Sábado",
    };
    
    // Get date for each day
    const getDayDate = (dayKey: string) => {
      const dayIndex = parseInt(dayKey);
      const d = new Date(r.start);
      // r.start is Monday (ISO week), Sunday = -1 days, Mon = 0, etc.
      d.setDate(d.getDate() + (dayIndex === 0 ? -1 : dayIndex - 1));
      return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    };
    
    let summary = `📅 *RESUMEN HORARIO - Semana ${week}*\n`;
    summary += `📍 *${deptName}*\n`;
    summary += `📆 ${formatDateShort(r.start)} - ${formatDateShort(r.end)}\n\n`;
    
    // Calculate department-only total (only teams in this department)
    const departmentTotal = deptTeams.reduce((sum, team) => sum + (workersPerTeam[team.id] || 0), 0);
    
    // Get the worker term for this department
    const workerTermPlural = getWorkerTerm(deptName, departmentTotal);
    
    // Process each day
    for (const day of DAYS) {
      const daySchedule = schedule[day.key];
      if (!daySchedule) continue;
      
      // Group teams by time slot (start-end)
      const timeSlots: Record<string, { count: number }> = {};
      let restingWorkers = 0;
      let vacationWorkers = 0;
      
      for (const team of deptTeams) {
        const cell = daySchedule[team.id];
        if (!cell) continue;
        
        const workerCount = workersPerTeam[team.id] || 0;
        
        // Check if rest or vacation
        const configuredShift = departmentShifts.find(s => s.shift_key === cell.type);
        const isRest = cell.type === 'rest' || configuredShift?.is_rest;
        const isVacation = cell.type === 'vacation';
        
        if (isRest) {
          restingWorkers += workerCount;
          continue;
        }
        
        if (isVacation) {
          vacationWorkers += workerCount;
          continue;
        }
        
        // Working shift - group by time
        const startTime = cell.start || "08:00";
        const endTime = cell.end || "-";
        const slotKey = `${startTime}|${endTime}`;
        
        if (!timeSlots[slotKey]) {
          timeSlots[slotKey] = { count: 0 };
        }
        timeSlots[slotKey].count += workerCount;
      }
      
      // Format day output
      summary += `*${dayNames[day.key]}* (${getDayDate(day.key)})\n`;
      
      // Sort time slots by start time
      const sortedSlots = Object.entries(timeSlots).sort(([a], [b]) => {
        const timeA = a.split('|')[0];
        const timeB = b.split('|')[0];
        return timeA.localeCompare(timeB);
      });
      
      if (sortedSlots.length === 0 && restingWorkers === 0 && vacationWorkers === 0) {
        summary += "  Sin configurar\n";
      } else {
        for (const [slotKey, data] of sortedSlots) {
          const [start, end] = slotKey.split('|');
          // Format consistently: always "HH:MM a HH:MM" format
          const timeRange = end && end !== '-' ? `${start} a ${end}` : `${start} a fin`;
          const term = getWorkerTerm(deptName, data.count);
          summary += `  ⏰ ${timeRange}: *${data.count}* ${term}\n`;
        }
        if (vacationWorkers > 0) {
          summary += `  🏖️ Vacaciones: *${vacationWorkers}*\n`;
        }
        if (restingWorkers > 0) {
          summary += `  💤 Descanso: *${restingWorkers}*\n`;
        }
      }
      summary += "\n";
    }
    
    // Total summary - only this department
    summary += `━━━━━━━\n`;
    summary += `👥 Total plantilla: *${departmentTotal}* ${workerTermPlural}`;
    
    setGeneratedSummary(summary);
    setSummaryDialogOpen(true);
  };

  const copySummaryToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedSummary);
      toast.success("Resumen copiado al portapapeles");
    } catch (e) {
      toast.error("Error al copiar");
    }
  };

  const moveWeek = (dir: -1 | 1) => {
    let newWeek = week + dir;
    let newYear = year;
    if (newWeek > 52) {
      newWeek = 1;
      newYear += 1;
    }
    if (newWeek < 1) {
      newWeek = 52;
      newYear -= 1;
    }

    if (dirty) {
      setPendingNavigation({ type: 'week', value: dir });
      setConfirmNavOpen(true);
      return;
    }

    setWeek(newWeek);
    setYear(newYear);
  };

  const handleDepartmentChange = (deptId: string) => {
    if (dirty) {
      setPendingNavigation({ type: 'department', value: deptId });
      setConfirmNavOpen(true);
      return;
    }
    setSelectedDepartment(deptId);
  };

  const confirmNavigation = async (saveFirst: boolean) => {
    if (saveFirst) {
      await save();
    }

    if (pendingNavigation?.type === 'week') {
      const dir = pendingNavigation.value as number;
      let newWeek = week + dir;
      let newYear = year;
      if (newWeek > 52) {
        newWeek = 1;
        newYear += 1;
      }
      if (newWeek < 1) {
        newWeek = 52;
        newYear -= 1;
      }
      setWeek(newWeek);
      setYear(newYear);
    } else if (pendingNavigation?.type === 'department') {
      setSelectedDepartment(pendingNavigation.value as string);
    }

    setDirty(false);
    setConfirmNavOpen(false);
    setPendingNavigation(null);
  };

  const cancelNavigation = () => {
    setConfirmNavOpen(false);
    setPendingNavigation(null);
  };

  // PDF uses dynamic group colors from state

  // State for PDF theme selection
  const [pdfTheme, setPdfTheme] = useState<"light" | "dark">("dark");
  const [showPdfThemeDialog, setShowPdfThemeDialog] = useState(false);
  const [showLabelsInPdf, setShowLabelsInPdf] = useState<boolean>(() => {
    const saved = localStorage.getItem("pdf_show_labels");
    return saved === null ? true : saved === "true";
  });
  const [rememberPdfTheme, setRememberPdfTheme] = useState(false);

  const generatePdf = (themeToPrint: "light" | "dark") => {
    if (!captureRef.current) return;
    const isDark = themeToPrint === "dark";
    
    try {
      const deptName = departments.find((d) => d.id === selectedDepartment)?.name || "Departamento";
      const deptSlug = departments.find((d) => d.id === selectedDepartment)?.slug || "";
      const range = weekRange(year, week);

      // DAYS now starts with Sunday: index 0 = Sunday (day before range.start), 1 = Monday, etc.
      const getDayDate = (dayIndex: number) => {
        const d = new Date(range.start);
        // range.start is Monday (ISO week start), so Sunday = -1 days from Monday
        d.setDate(d.getDate() + (dayIndex === 0 ? -1 : dayIndex - 1));
        return d;
      };

      const formatDayDate = (date: Date) => {
        return date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
      };

      const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

      // Build schedule rows with smart grouping logic for ALL configured shifts
      const buildScheduleRows = () => {
        // Create a map for each shift: shift_key → { dayKey → teams[] }
        const shiftTeams: Record<string, Record<string, string[]>> = {};
        // Track partial counts: "teamName|dayKey|shiftKey" → count
        const partialCounts: Record<string, number> = {};
        // Track partial shift info: "teamName|dayKey" → { shift, start, end, count }
        const partialShiftInfo: Record<string, { shift: string; start: string | null; end: string | null; count: number }> = {};
        
        // Initialize with ALL configured shifts (including rest) + vacation
        for (const shift of departmentShifts) {
          shiftTeams[shift.shift_key] = {};
          for (const d of DAYS) {
            shiftTeams[shift.shift_key][d.key] = [];
          }
        }
        
        // Also track vacation separately
        shiftTeams['vacation'] = {};
        for (const d of DAYS) {
          shiftTeams['vacation'][d.key] = [];
        }
        
        // Also initialize 'rest' if not in departmentShifts (fallback)
        if (!shiftTeams['rest']) {
          shiftTeams['rest'] = {};
          for (const d of DAYS) {
            shiftTeams['rest'][d.key] = [];
          }
        }
        
        // Assign teams to each shift by day
        for (const d of DAYS) {
          for (const parentGroup of parentGroups) {
            const teamsInGroup = groupedTeams[parentGroup] || [];
            
            // Count teams per shift type within this group
            const shiftCounts: Record<string, string[]> = {};
            
            for (const team of teamsInGroup) {
              const cell = schedule?.[d.key]?.[team.id] || { type: "rest", start: null, end: null };
              const shiftType = cell.type as string;
              
              if (!shiftCounts[shiftType]) shiftCounts[shiftType] = [];
              shiftCounts[shiftType].push(team.name);

              // Track partial shift info for secondary shift row
              if (cell.partial_count && cell.partial_count > 0 && cell.partial_shift) {
                partialShiftInfo[`${team.name}|${d.key}`] = {
                  shift: cell.partial_shift,
                  start: cell.partial_start || null,
                  end: cell.partial_end || null,
                  count: cell.partial_count,
                };
              }
            }
            
            // Add to the corresponding shift rows
            for (const [shiftKey, teamNames] of Object.entries(shiftCounts)) {
              // Initialize bucket if it doesn't exist (handles unknown/legacy shift types)
              if (!shiftTeams[shiftKey]) {
                shiftTeams[shiftKey] = {};
                for (const dd of DAYS) {
                  shiftTeams[shiftKey][dd.key] = [];
                }
              }
              // If ALL teams in group have this shift, show just the parent group name
              // Always show parent group name even if some have partial — partials go in secondary shift row
              if (teamNames.length === teamsInGroup.length && teamsInGroup.length > 0) {
                shiftTeams[shiftKey][d.key].push(parentGroup);
              } else if (teamNames.length > 0) {
                // Otherwise show individual team names, sorted
                shiftTeams[shiftKey][d.key].push(...teamNames.sort((a, b) => a.localeCompare(b, 'es', { numeric: true })));
              }
            }
          }
        }

        // Add partial-shift teams to their secondary shift rows
        // Group partial info by parentGroup+day+shift to aggregate at group level
        const partialByGroupDay: Record<string, { parentGroup: string; dayKey: string; shift: string; start: string | null; end: string | null; individualCounts: number[]; teamNames: string[] }> = {};
        
        for (const [key, info] of Object.entries(partialShiftInfo)) {
          const [teamName, dayKey] = key.split('|');
          const pg = getParentGroup(teamName);
          const groupDayKey = `${pg}|${dayKey}|${info.shift}`;
          
          if (!partialByGroupDay[groupDayKey]) {
            partialByGroupDay[groupDayKey] = { parentGroup: pg, dayKey, shift: info.shift, start: info.start, end: info.end, individualCounts: [], teamNames: [] };
          }
          partialByGroupDay[groupDayKey].teamNames.push(teamName);
          partialByGroupDay[groupDayKey].individualCounts.push(info.count);
        }
        
        for (const entry of Object.values(partialByGroupDay)) {
          if (!shiftTeams[entry.shift]) {
            shiftTeams[entry.shift] = {};
            for (const dd of DAYS) {
              shiftTeams[entry.shift][dd.key] = [];
            }
          }
          
          const teamsInGroup = groupedTeams[entry.parentGroup] || [];
          const allTeamsInGroup = teamsInGroup.length > 0 && entry.teamNames.length === teamsInGroup.length;
          
          // If all subteams have same partial config (group-level), use one count (not sum)
          if (allTeamsInGroup) {
            const allSameCount = entry.individualCounts.every(c => c === entry.individualCounts[0]);
            // If all identical counts → group-level config, use single count; otherwise sum
            const effectiveCount = allSameCount ? entry.individualCounts[0] : entry.individualCounts.reduce((a, b) => a + b, 0);
            const displayName = getGroupDisplayName(entry.parentGroup);
            const partialLabel = `${effectiveCount} de ${displayName}`;
            if (!shiftTeams[entry.shift][entry.dayKey].includes(partialLabel)) {
              shiftTeams[entry.shift][entry.dayKey].push(partialLabel);
            }
            partialCounts[`${partialLabel}|${entry.dayKey}|${entry.shift}`] = effectiveCount;
          } else {
            // Individual subteam labels
            for (const teamName of entry.teamNames) {
              const info = partialShiftInfo[`${teamName}|${entry.dayKey}`];
              if (info) {
                const partialLabel = `${info.count} de ${teamName}`;
                if (!shiftTeams[entry.shift][entry.dayKey].includes(partialLabel)) {
                  shiftTeams[entry.shift][entry.dayKey].push(partialLabel);
                }
                partialCounts[`${partialLabel}|${entry.dayKey}|${entry.shift}`] = info.count;
              }
            }
          }
        }
        
        // Build deductions map: when partial workers go to a secondary shift,
        // subtract them from the parent group count in the primary shift
        // Key: "parentGroup|dayKey|primaryShiftKey" OR "teamName|dayKey|primaryShiftKey" → total deducted
        const partialDeductions: Record<string, number> = {};
        for (const [key, info] of Object.entries(partialShiftInfo)) {
          const [teamName, dayKey] = key.split('|');
          const pg = getParentGroup(teamName);
          // Find primary shift for this team on this day
          const teamObj = deptTeams.find(t => t.name === teamName);
          if (teamObj) {
            const cell = schedule?.[dayKey]?.[teamObj.id];
            if (cell) {
              const primaryShift = cell.type as string;
              // Store deduction under parent group key (for when whole group is shown)
              const dedKeyGroup = `${pg}|${dayKey}|${primaryShift}`;
              partialDeductions[dedKeyGroup] = (partialDeductions[dedKeyGroup] || 0) + info.count;
              // Also store under individual team name key (for when teams are shown individually)
              const dedKeyTeam = `${teamName}|${dayKey}|${primaryShift}`;
              partialDeductions[dedKeyTeam] = (partialDeductions[dedKeyTeam] || 0) + info.count;
            }
          }
        }

        return { shiftTeams, partialCounts, partialDeductions };
      };
      
      const { shiftTeams, partialCounts, partialDeductions } = buildScheduleRows();

      // Get active shifts (those with at least one team assignment in the week)
      // Exclude rest shifts from PDF — rest is implied by absence
      const knownShiftKeys = new Set(departmentShifts.map(s => s.shift_key));
      const activeShifts = departmentShifts
        .filter(s => !s.is_rest && DAYS.some(d => shiftTeams[s.shift_key]?.[d.key]?.length > 0))
        .sort((a, b) => a.sort_order - b.sort_order);
      
      // Also include any dynamically-discovered shift types not in departmentShifts
      for (const shiftKey of Object.keys(shiftTeams)) {
        if (shiftKey === 'vacation' || knownShiftKeys.has(shiftKey)) continue;
        const hasTeams = DAYS.some(d => shiftTeams[shiftKey]?.[d.key]?.length > 0);
        if (hasTeams) {
          activeShifts.push({
            id: shiftKey,
            department_id: selectedDepartment,
            name: TYPE_LABEL[shiftKey] || shiftKey,
            shift_key: shiftKey,
            start_time: DEFAULT_TIMES[shiftKey]?.start || null,
            end_time: DEFAULT_TIMES[shiftKey]?.end || null,
            color: '#6b7280',
            sort_order: activeShifts.length + 100,
            is_rest: shiftKey === 'rest',
          });
        }
      }
      
      // Check if there are any vacation assignments
      const hasVacations = DAYS.some(d => shiftTeams['vacation']?.[d.key]?.length > 0);

      // Helper to get shift time info — use configured shift times as primary source
      const getShiftTimeInfo = (shift: typeof departmentShifts[0]) => {
        // Use configured shift times first (these are the true defaults)
        if (shift.start_time) {
          return shift.end_time 
            ? `${shift.start_time} - ${shift.end_time}` 
            : `${shift.start_time} - fin`;
        }
        
        // Fallback: find a non-special cell time
        for (const team of deptTeams) {
          for (const d of DAYS) {
            const cell = schedule?.[d.key]?.[team.id];
            if (cell && cell.type === shift.shift_key && cell.start) {
              return cell.end ? `${cell.start} - ${cell.end}` : `${cell.start} - fin`;
            }
          }
        }
        
        return null;
      };

      // Render teams with pill-shaped colored badges (matching Annual Calendar aesthetic)
      // - Full group ("A") uses the strong group color
      // - Partial group ("A1", "A2"...) uses a lighter tint for quick differentiation
      const blendHex = (hex1: string, hex2: string, ratio: number) => {
        const clamp = (n: number) => Math.max(0, Math.min(255, n));
        const norm = (h: string) => h.replace('#', '');
        const h1 = norm(hex1);
        const h2 = norm(hex2);
        const r1 = parseInt(h1.slice(0, 2), 16);
        const g1 = parseInt(h1.slice(2, 4), 16);
        const b1 = parseInt(h1.slice(4, 6), 16);
        const r2 = parseInt(h2.slice(0, 2), 16);
        const g2 = parseInt(h2.slice(2, 4), 16);
        const b2 = parseInt(h2.slice(4, 6), 16);
        const r = clamp(Math.round(r1 + (r2 - r1) * ratio));
        const g = clamp(Math.round(g1 + (g2 - g1) * ratio));
        const b = clamp(Math.round(b1 + (b2 - b1) * ratio));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      };

      // Build team name → active worker count mapping for PDF
      const teamNameToActiveCount: Record<string, number> = {};
      const teamNameToAllCount: Record<string, number> = {};
      for (const team of deptTeams) {
        teamNameToActiveCount[team.name] = activeWorkersPerTeam[team.id] || 0;
        teamNameToAllCount[team.name] = workersPerTeam[team.id] || 0;
      }
      // For parent groups: sum all subteam active counts
      for (const parentGroup of parentGroups) {
        const teamsInGroup = groupedTeams[parentGroup] || [];
        let activeSum = 0;
        for (const t of teamsInGroup) {
          activeSum += activeWorkersPerTeam[t.id] || 0;
        }
        teamNameToActiveCount[parentGroup] = activeSum;
      }

      // Build label maps for the PDF (resolves a label by team name OR by parent group)
      // Group-level label: returned only if ALL teams in the parent group share the same label
      type EtiquetaInfo = { name: string; color: string | null; inherit: boolean; excludedShifts: string[] };
      const labelByTeamName: Record<string, EtiquetaInfo | null> = {};
      const labelByParentGroup: Record<string, EtiquetaInfo | null> = {};
      for (const t of deptTeams) {
        const lbl = t.label_id ? labelById[t.label_id] : null;
        labelByTeamName[t.name] = lbl
          ? { name: lbl.name, color: lbl.color, inherit: !!lbl.inherit_team_color, excludedShifts: Array.isArray((lbl as any).excluded_shift_keys) ? (lbl as any).excluded_shift_keys : [] }
          : null;
      }
      for (const pg of parentGroups) {
        const gTeams = groupedTeams[pg] || [];
        if (gTeams.length === 0) { labelByParentGroup[pg] = null; continue; }
        const firstId = gTeams[0].label_id || null;
        const allEqual = gTeams.every((t) => (t.label_id || null) === firstId);
        if (allEqual && firstId && labelById[firstId]) {
          const l = labelById[firstId];
          labelByParentGroup[pg] = { name: l.name, color: l.color, inherit: !!l.inherit_team_color, excludedShifts: Array.isArray((l as any).excluded_shift_keys) ? (l as any).excluded_shift_keys : [] };
        } else {
          labelByParentGroup[pg] = null;
        }
      }

      const renderTeamsWithColor = (teams: string[], dayKey?: string, shiftKey?: string) => {
        if (teams.length === 0) return `<span style="color: ${isDark ? '#525252' : '#a3a3a3'};">–</span>`;

        // Build reverse map: displayName → parentGroupKey for color resolution
        const displayNameToGroupKey: Record<string, string> = {};
        for (const pg of parentGroups) {
          displayNameToGroupKey[getGroupDisplayName(pg)] = pg;
        }

        let cellTotal = 0;
        const items = teams
          .map((team) => {
            // Handle "X de TeamName" partial labels — extract actual team name for color
            const partialMatch = team.match(/^(\d+)\s+de\s+(.+)$/);
            let resolvedTeam = team;
            let isPartialLabel = false;
            if (partialMatch) {
              isPartialLabel = true;
              const extractedName = partialMatch[2];
              // Check if extracted name is a group display name
              resolvedTeam = displayNameToGroupKey[extractedName] || extractedName;
            }
            
            const parentGroup = getParentGroup(resolvedTeam);
            const groupColor = getGroupColor(parentGroup);
            const isWholeGroup = resolvedTeam === parentGroup && !isPartialLabel;

            const partialTint = blendHex(groupColor, isDark ? "#ffffff" : "#ffffff", 0.55);
            const pillColor = isWholeGroup ? groupColor : partialTint;

            const displayLabel = isPartialLabel ? team : (resolvedTeam === parentGroup ? getGroupDisplayName(parentGroup) : team);

            const partialKey = dayKey && shiftKey ? `${team}|${dayKey}|${shiftKey}` : null;
            const partialCount = partialKey ? partialCounts[partialKey] : undefined;

            const deductionKey = dayKey && shiftKey ? `${resolvedTeam}|${dayKey}|${shiftKey}` : null;
            const deduction = (!isPartialLabel && deductionKey) ? (partialDeductions[deductionKey] || 0) : 0;
            const baseCount = partialCount || (teamNameToActiveCount[team] || 0);
            const count = Math.max(0, baseCount - deduction);
            cellTotal += count;

            const partialLabelText = partialCount
              ? (isPartialLabel ? displayLabel : `${partialCount} de ${displayLabel}`)
              : displayLabel;
            const countHtml = !partialCount && count > 0 ? `<span style="font-size:7px;opacity:0.7;margin-left:2px;">${count}</span>` : '';

            // Resolve etiqueta: prefer team-level, fallback to whole-group level
            let etiqueta: EtiquetaInfo | null = null;
            if (isWholeGroup) {
              etiqueta = labelByParentGroup[parentGroup] || null;
            } else if (!isPartialLabel) {
              etiqueta = labelByTeamName[resolvedTeam] || null;
            } else {
              // Partial labels ("X de Group") → use group's label if all share it
              etiqueta = labelByParentGroup[parentGroup] || null;
            }
            // Hide label if this shift is excluded for the etiqueta
            if (etiqueta && shiftKey && etiqueta.excludedShifts.includes(shiftKey)) {
              etiqueta = null;
            }

            const pillHtml = `<span style="
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 5px;
              min-width: 36px;
              padding: 3px 8px;
              border-radius: 9999px;
              background: ${pillColor}1a;
              border: 1px solid ${pillColor};
              color: ${pillColor};
              font-weight: ${partialCount ? '500' : '400'};
              font-size: 9px;
              letter-spacing: 0.01em;
              line-height: 1;
              white-space: nowrap;
            "><span style="width:5px;height:5px;border-radius:9999px;background:${pillColor};display:inline-block"></span>${partialLabelText}${countHtml}</span>`;

            const labelColor = etiqueta
              ? (etiqueta.inherit ? groupColor : (etiqueta.color || (isDark ? '#9ca3af' : '#6b7280')))
              : (isDark ? '#9ca3af' : '#6b7280');
            const labelHtml = etiqueta
              ? `<div style="display:inline-flex;align-items:center;gap:3.5px;margin-top:3px;padding-left:2px;font-family:'Poppins',sans-serif;font-size:7.5px;font-weight:300;letter-spacing:0.01em;color:${labelColor};line-height:1;opacity:0.92;"><span style="width:2.5px;height:2.5px;border-radius:9999px;background:${labelColor};display:inline-block;opacity:0.85;"></span>${etiqueta.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`
              : '';

            return `<div style="display:inline-flex;flex-direction:column;align-items:flex-start;gap:0;">${pillHtml}${labelHtml}</div>`;
          })
          .join('');

        const totalHtml = cellTotal > 0
          ? `<div style="text-align:right;font-size:8px;color:${isDark ? '#737373' : '#9ca3af'};margin-top:3px;font-weight:500;">${cellTotal}</div>`
          : '';

        return `<div style="display:flex;flex-wrap:wrap;gap:4px 6px;justify-content:flex-start;align-items:flex-start;">${items}</div>${totalHtml}`;
      };

      // Render teams on vacation with amber styling
      const vacationColor = "#d97706"; // Amber
      const renderVacationTeams = (teams: string[]) => {
        if (teams.length === 0) return `<span style="color: ${isDark ? '#525252' : '#a3a3a3'};">–</span>`;

        const badges = teams
          .map((team) => {
            return `<span style="
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 5px;
              min-width: 36px;
              padding: 3px 8px;
              border-radius: 9999px;
              background: ${vacationColor}1a;
              border: 1px solid ${vacationColor};
              color: ${vacationColor};
              font-weight: 400;
              font-size: 9px;
              letter-spacing: 0.01em;
              line-height: 1;
              white-space: nowrap;
            "><span style="width:5px;height:5px;border-radius:9999px;background:${vacationColor};display:inline-block"></span>${team}</span>`;
          })
          .join('');

        return `<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-start;">${badges}</div>`;
      };

      // Theme colors matching Annual Calendar
      const bgColor = isDark ? "#000000" : "#ffffff";
      const textColor = isDark ? "#ffffff" : "#171717";
      const mutedColor = isDark ? "#a3a3a3" : "#737373";
      const borderColor = isDark ? "#262626" : "#e5e5e5";
      const headerBg = isDark ? "#171717" : "#f5f5f5";
      const rowBg = isDark ? "#0a0a0a" : "#ffffff";
      const primaryGreen = "#93d600";

      // My group URL - always use production domain
      const productionOrigin = 'https://vnprod.app';
      const myGroupUrl = `${productionOrigin}/mi-grupo`;

      const pdfFileName = `Horario ${deptName} - Semana ${week}`;
      
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
      font-size: 10px;
      letter-spacing: -0.01em;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .page-container {
      padding: 30px 38px;
      min-height: 100vh;
      background: ${bgColor} !important;
    }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 20px;
    }
     .header-left {
       display: flex;
       align-items: center;
       gap: 10px;
     }
    .logo {
      height: 36px;
      width: auto;
    }
    .title-block {
      display: flex;
      flex-direction: column;
      gap: 0;
    }
     .title {
       font-size: 18px;
       font-weight: 600;
       color: ${textColor};
       letter-spacing: -0.02em;
     }
    .subtitle {
      font-size: 11px;
      color: ${primaryGreen};
      font-weight: 400;
      margin-top: -2px;
    }
    .week-info {
      text-align: right;
    }
     .week-number {
       font-size: 20px;
       font-weight: 600;
       color: ${primaryGreen};
       letter-spacing: -0.02em;
       line-height: 1;
     }
    .week-dates {
      font-size: 10px;
      color: ${mutedColor};
      font-weight: 400;
      margin-top: 4px;
    }
    
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin-top: 6px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid ${borderColor};
    }
    th, td {
      padding: 8px 8px;
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
      font-size: 9px;
      padding: 10px 8px;
    }
    thead th.corner {
      background: ${primaryGreen};
      color: #0a0a0a;
      text-align: left;
      font-weight: 600;
      font-size: 10px;
      padding-left: 16px;
    }
    thead th .date-num {
      font-size: 9px;
      font-weight: 400;
      opacity: 0.8;
      margin-bottom: 2px;
    }
     thead th .day-name {
      font-size: 10px;
      font-weight: 600;
      text-transform: lowercase;
    }
    .schedule-label {
      text-align: left;
      font-weight: 500;
      padding-left: 16px;
      font-size: 10px;
      background: ${rowBg};
      color: ${textColor};
    }
    .team-cell {
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.01em;
      background: ${rowBg};
      line-height: 1.5;
      color: ${mutedColor};
      text-align: left;
      padding-left: 10px;
    }
    
    .footer {
      margin-top: 16px;
      padding-top: 10px;
      border-top: 1px solid ${borderColor};
      font-size: 9px;
      color: ${mutedColor};
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 400;
    }
    
    .legend {
      display: flex;
      gap: 10px;
      margin-top: 18px;
      font-size: 10px;
    }
    .legend-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      font-weight: 400;
      font-size: 9px;
      letter-spacing: 0.01em;
    }
    .legend-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    
    .legend-enhanced {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 18px;
      align-items: center;
    }
    .legend-group-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .legend-parent-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 9px;
      border-radius: 9999px;
      font-weight: 500;
      font-size: 9px;
    }
    .legend-subgroups {
      display: flex;
      gap: 3px;
      align-items: center;
    }
    .legend-sub-badge {
      font-weight: 500;
      font-size: 8px;
      opacity: 0.7;
    }
    .legend-separator {
      color: ${mutedColor};
      font-size: 8px;
      opacity: 0.5;
    }
    .legend-vacation-badge {
      display: flex;
      align-items: center;
    }
    
    .info-row {
      display: flex;
      gap: 12px;
      margin-top: 12px;
    }
    .info-box, .warning-box {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      border-radius: 7px;
      padding: 8px 10px;
      font-size: 8px;
      line-height: 1.4;
      flex: 1;
    }
    .info-box {
      background: ${isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.06)'};
      border: 1px solid ${isDark ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.25)'};
      color: ${mutedColor};
    }
    .warning-box {
      background: ${isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.06)'};
      border: 1px solid ${isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.3)'};
      color: ${isDark ? '#fbbf24' : '#92400e'};
    }
    .info-icon, .warning-icon {
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      margin-top: 1px;
    }
    .info-icon { color: #3b82f6; }
    .warning-icon { color: #f59e0b; }
    .info-content, .warning-content { flex: 1; }
    .info-title, .warning-title {
      font-weight: 600;
      font-size: 9px;
      margin-bottom: 3px;
    }
    .info-title { color: ${isDark ? '#93c5fd' : '#1e40af'}; }
    .warning-title { color: ${isDark ? '#fbbf24' : '#b45309'}; }
    .info-content strong { color: ${textColor}; font-weight: 500; }
    .warning-content strong { color: ${isDark ? '#fde68a' : '#78350f'}; font-weight: 600; }
    .info-example {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};
      border-radius: 4px;
      padding: 1px 5px;
      font-weight: 500;
      font-size: 8px;
      color: ${textColor};
    }
    
    @media print {
      html, body {
        background: ${bgColor} !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body { 
        padding: 0; 
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .header { break-after: avoid; }
      table { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page-container">
  <div class="header">
    <div class="header-left">
      <img src="/images/verdnatura-logo-green.png" alt="Verdnatura" class="logo">
      <div class="title-block">
        <div class="title">${deptName}</div>
        <div class="subtitle">Horario semanal</div>
      </div>
    </div>
      <div class="week-info">
        <div class="week-number">Semana ${week}</div>
        <div class="week-dates">${formatDateShort(getDayDate(0))} - ${formatDateShort(getDayDate(6))} ${year}</div>
      </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="corner" style="width: 150px;">Horario</th>
        ${DAYS.map((d, i) => {
          const date = getDayDate(i);
          return `<th><div class="date-num">${formatDayDate(date)}</div><div class="day-name">${dayNames[date.getDay()]}</div></th>`;
        }).join("")}
      </tr>
    </thead>
    <tbody>
      ${(() => {
        const totalRows = activeShifts.length + (hasVacations ? 1 : 0);
        const escapeHtml = (s: string) => s
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
          .replace(/\n/g, '<br>');
        const announcementCellHtml = (text: string, rowspan: number) => {
          const bg = isDark ? 'rgba(251, 191, 36, 0.14)' : 'rgba(251, 191, 36, 0.18)';
          const border = isDark ? '#b45309' : '#d97706';
          const color = isDark ? '#fde68a' : '#92400e';
          return `<td class="team-cell" rowspan="${rowspan}" style="background:${bg};border-left:1px dashed ${border};border-right:1px dashed ${border};vertical-align:middle;text-align:center;padding:10px 8px;">
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;opacity:0.85;">
                <path d="M3 11l18-5v12L3 14v-3z"/>
                <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
              </svg>
              <div style="font-size:8px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.04em;">Aviso</div>
              <div style="font-size:9px;line-height:1.35;color:${color};font-weight:500;max-width:120px;">${escapeHtml(text)}</div>
            </div>
          </td>`;
        };

        const shiftRows = activeShifts.map((shift, shiftIdx) => {
          const timeInfo = getShiftTimeInfo(shift);
          const labelText = timeInfo ? shift.name + ' (' + timeInfo + ')' : shift.name;

          const dayCells = DAYS.map((d) => {
            const announcement = dayAnnouncements[d.key]?.trim();
            if (announcement) {
              // Only render the announcement cell on the FIRST shift row, with rowspan covering all
              if (shiftIdx === 0) {
                return announcementCellHtml(announcement, totalRows);
              }
              // Skip cell on subsequent rows (covered by rowspan)
              return '';
            }

            const cellTeams = shiftTeams[shift.shift_key]?.[d.key] || [];
            const teamsHtml = renderTeamsWithColor(cellTeams, d.key, shift.shift_key);

            // Detect special hours per cell
            const specialTimesSet = new Set<string>();
            for (const team of deptTeams) {
              const cell = schedule?.[d.key]?.[team.id];
              if (!cell) continue;
              if (cell.type === shift.shift_key) {
                const cellStart = cell.start || null;
                const cellEnd = cell.end || null;
                const defStart = shift.start_time || null;
                const defEnd = shift.end_time || null;
                if ((cellStart && cellStart !== defStart) || (cellEnd && cellEnd !== defEnd)) {
                  specialTimesSet.add((cellStart || defStart || 'inicio') + ' - ' + (cellEnd || defEnd || 'fin'));
                }
              }
              if (cell.partial_shift === shift.shift_key && (cell.partial_start || cell.partial_end)) {
                const pDefStart = shift.start_time || null;
                const pDefEnd = shift.end_time || null;
                const pStart = cell.partial_start || null;
                const pEnd = cell.partial_end || null;
                if ((pStart && pStart !== pDefStart) || (pEnd && pEnd !== pDefEnd)) {
                  specialTimesSet.add((pStart || pDefStart || 'inicio') + ' - ' + (pEnd || pDefEnd || 'fin'));
                }
              }
            }

            const hasSpecial = specialTimesSet.size > 0;
            const specialHtml = hasSpecial
              ? '<div style="margin-top:4px;text-align:center;">' + Array.from(specialTimesSet).map(t =>
                  '<span style="display:inline-flex;align-items:center;font-size:7px;color:#b45309;background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:2px 6px;font-weight:600;line-height:1.2;">Horario especial: ' + t + '</span>'
                ).join('<br>') + '</div>'
              : '';
            const cellBg = hasSpecial ? 'background:rgba(251,191,36,0.08);' : '';

            return '<td class="team-cell" style="' + cellBg + '">' + teamsHtml + specialHtml + '</td>';
          }).join('');

          return '<tr><td class="schedule-label">' + labelText + '</td>' + dayCells + '</tr>';
        }).join('');

        const vacationRow = hasVacations ? `<tr>
          <td class="schedule-label" style="color: #d97706;">Vacaciones</td>
          ${DAYS.map((d) => {
            const announcement = dayAnnouncements[d.key]?.trim();
            if (announcement) {
              // If there are no shift rows, render announcement here with rowspan=1
              if (activeShifts.length === 0) {
                return announcementCellHtml(announcement, 1);
              }
              // Otherwise covered by rowspan from first shift row
              return '';
            }
            const vacTeams = shiftTeams['vacation']?.[d.key] || [];
            return `<td class="team-cell" style="background: ${isDark ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.15)'};">${renderVacationTeams(vacTeams)}</td>`;
          }).join("")}
        </tr>` : '';

        return shiftRows + vacationRow;
      })()}
    </tbody>
  </table>

  ${campaignMode ? `
  <div class="campaign-alert" style="margin: 14px 0 12px; padding: 14px 16px; background: ${isDark ? 'rgba(239, 68, 68, 0.14)' : 'rgba(239, 68, 68, 0.08)'}; border: 1px solid ${isDark ? '#f87171' : '#dc2626'}; border-radius: 7px; display: flex; align-items: flex-start; gap: 12px; font-family: 'Poppins', sans-serif;">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${isDark ? '#f87171' : '#dc2626'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 22px; height: 22px; flex-shrink: 0; margin-top: 1px;">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
      <path d="M12 9v4"/>
      <path d="M12 17h.01"/>
    </svg>
    <div style="flex: 1; min-width: 0;">
      <div style="font-size: 11px; font-weight: 600; color: ${isDark ? '#f87171' : '#b91c1c'}; letter-spacing: -0.01em; margin-bottom: 4px;">Estamos en Campaña</div>
      <div style="font-size: 9px; line-height: 1.5; color: ${isDark ? '#fecaca' : '#7f1d1d'};">
        Durante esta semana se irán comunicando cambios y adaptaciones de turnos a través de los grupos de WhatsApp. Mantente muy atento a las notificaciones de tu responsable y revisa el grupo periódicamente para no perderte ningún ajuste.
      </div>
    </div>
  </div>
  ` : ''}

  ${showLabelsInPdf ? `<div class="legend-enhanced">` : `<div class="legend-enhanced" style="display:none;">`}
    ${parentGroups.map(g => {
      const parentColor = getGroupColor(g);
      const subgroups = groupedTeams[g] || [];
      
      return `
      <div class="legend-group-row">
        <span class="legend-parent-badge" style="background: ${parentColor}20; border: 1px solid ${parentColor}; color: ${parentColor};">
          <span class="legend-dot" style="background: ${parentColor};"></span>
          ${getGroupDisplayName(g)}
        </span>
      </div>`;
    }).join("")}
    ${hasVacations ? `
    <div class="legend-vacation-badge">
      <span class="legend-parent-badge" style="background: ${vacationColor}15; border: 1px solid ${vacationColor}; color: ${vacationColor};">
        <span class="legend-dot" style="background: ${vacationColor};"></span>
        Vacaciones
      </span>
    </div>
    ` : ''}
  </div>

  ${(() => {
    if (!showLabelsInPdf) return '';
    // Etiquetas usadas esta semana (lugares/funciones)
    const usedLabelIds = new Set<string>();
    for (const t of deptTeams) if (t.label_id) usedLabelIds.add(t.label_id);
    const used = teamLabels.filter(l => usedLabelIds.has(l.id));
    if (used.length === 0) return '';
    return `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding-top:6px;border-top:1px dashed ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};">
      <span style="font-size:6.5px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${isDark ? '#737373' : '#9ca3af'};">Lugares · Funciones</span>
      ${used.map(l => {
        const c = l.inherit_team_color ? (isDark ? '#9ca3af' : '#6b7280') : (l.color || (isDark ? '#9ca3af' : '#6b7280'));
        return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:7.5px;font-weight:500;color:${isDark ? '#d4d4d4' : '#374151'};line-height:1;">
          <span style="width:5px;height:5px;border-radius:9999px;background:${c};display:inline-block"></span>${l.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
        </span>`;
      }).join('')}
    </div>`;
  })()}

  <div class="info-row">
    <div class="info-box">
      <svg class="info-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4"/>
        <path d="M12 8h.01"/>
      </svg>
      <div class="info-content">
        <div class="info-title">¿No sabes a qué grupo perteneces?</div>
        Consulta tu grupo de trabajo, compañeros y responsable.
        <div style="margin-top: 6px;">
          <a href="${myGroupUrl}" style="display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; background: ${isDark ? 'rgba(59,130,246,0.1)' : '#eff6ff'}; border: 1px solid ${isDark ? 'rgba(59,130,246,0.4)' : '#bfdbfe'}; border-radius: 5px; text-decoration: none; color: ${isDark ? '#60a5fa' : '#2563eb'}; font-size: 8.5px; font-weight: 600; white-space: nowrap;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 11px; height: 11px;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Ver mi grupo
          </a>
        </div>
      </div>
    </div>
    <div class="info-box" style="border-color: ${isDark ? 'rgba(251,146,60,0.3)' : '#fed7aa'}; background: ${isDark ? 'rgba(251,146,60,0.08)' : '#fff7ed'};">
      <svg class="info-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${isDark ? '#fb923c' : '#ea580c'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <div class="info-content">
        <div class="info-title" style="color: ${isDark ? '#fb923c' : '#ea580c'};">Importante sobre las vacaciones</div>
        Aunque tu grupo tenga vacaciones marcadas, debes acceder a tu calendario de Sálix para confirmar que las tienes asignadas. Los nuevos pueden no tenerlas generadas aún.
        <div style="margin-top: 4px;">
          <a href="https://salix.verdnatura.es" target="_blank" style="color: ${isDark ? '#fb923c' : '#ea580c'}; text-decoration: underline; font-size: 7.5px; font-weight: 600;">Ver Calendario de Sálix →</a>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>Generado el ${new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}</span>
    <span>Verdnatura Levante S.L.</span>
  </div>
  </div>
</body>
</html>`;

      // Use window.open instead of iframe so the document title is used for the PDF filename
      const printWindow = window.open('', '_blank', 'width=1200,height=800');
      if (!printWindow) {
        toast.error("No se pudo abrir la ventana de impresión. Permite las ventanas emergentes.");
        return;
      }

      printWindow.document.open();
      printWindow.document.write(printContent);
      printWindow.document.close();

      // Use a flag to prevent double print
      let hasPrinted = false;
      
      const doPrint = () => {
        if (hasPrinted || printWindow.closed) return;
        hasPrinted = true;
        printWindow.print();
      };

      // Wait for fonts and content to load, then print
      printWindow.onload = () => {
        setTimeout(doPrint, 300);
      };

      // Fallback for browsers that don't fire onload reliably
      setTimeout(doPrint, 1500);

      toast.success("PDF listo - Guarda como PDF desde el diálogo de impresión");
    } catch (e) {
      console.error(e);
      toast.error("Error al generar PDF");
    }
  };

  const download = () => {
    // Always show dialog - user requested to always choose theme
    
    // Auto-detect current theme (dark mode default)
    const htmlElement = document.documentElement;
    const isDarkMode = htmlElement.classList.contains("dark");
    setPdfTheme(isDarkMode ? "dark" : "light");
    
    setShowPdfThemeDialog(true);
  };

  const confirmPdfDownload = (theme: "light" | "dark", remember: boolean = false) => {
    if (remember) {
      localStorage.setItem("pdf_theme_preference", theme);
    }
    setPdfTheme(theme);
    setShowPdfThemeDialog(false);
    generatePdf(theme);
  };
  
  const clearPdfThemePreference = () => {
    localStorage.removeItem("pdf_theme_preference");
    toast.success("Preferencia de tema PDF eliminada");
  };

  const range = weekRange(year, week);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Inline chip + popover to assign a label to a team OR to all teams in a parent group
  const renderLabelChip = (opts: { teamId?: string; parentGroup?: string }) => {
    const { teamId, parentGroup } = opts;
    let currentLabelId: string | null = null;
    if (teamId) {
      currentLabelId = teams.find((t) => t.id === teamId)?.label_id || null;
    } else if (parentGroup) {
      const gTeams = groupedTeams[parentGroup] || [];
      const ids = gTeams.map((t) => t.label_id || null);
      const allEqual = ids.length > 0 && ids.every((x) => x === ids[0]);
      currentLabelId = allEqual ? ids[0] : null;
    }
    const current = currentLabelId ? labelById[currentLabelId] : null;
    // If inheriting, derive color from the parent group of the team/group
    let resolvedParentGroup: string | null = parentGroup || null;
    if (!resolvedParentGroup && teamId) {
      const t = teams.find((tt) => tt.id === teamId);
      if (t) resolvedParentGroup = getParentGroup(t.name);
    }
    const inheritColor = current?.inherit_team_color && resolvedParentGroup ? getGroupColor(resolvedParentGroup) : null;
    const color = inheritColor || current?.color || "#6b7280";

    const apply = async (newLabelId: string | null) => {
      if (teamId) {
        await handleAssignLabel(teamId, newLabelId);
      } else if (parentGroup) {
        const gTeams = groupedTeams[parentGroup] || [];
        setTeams((prev) =>
          prev.map((t) => (gTeams.some((g) => g.id === t.id) ? { ...t, label_id: newLabelId } : t))
        );
        const sessionToken = getManagerSessionToken();
        try {
          const { data, error } = await supabase.functions.invoke("admin-operations", {
            body: {
              action: "bulkAssignTeamLabels",
              sessionToken,
              data: { assignments: gTeams.map((g) => ({ teamId: g.id, labelId: newLabelId })) },
            },
          });
          if (error || !data?.success) throw new Error(data?.error || "Error");
        } catch (e: any) {
          toast.error(e?.message || "Error al asignar etiqueta");
          loadTeamLabels();
        }
      }
    };

    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="h-5 inline-flex items-center gap-1 rounded-full px-2 border text-[9px] font-medium uppercase tracking-wider transition-colors hover:bg-muted/40 whitespace-nowrap max-w-full"
            style={{
              borderColor: current ? `${color}66` : "hsl(var(--border))",
              color: current ? color : "hsl(var(--muted-foreground))",
              backgroundColor: current ? `${color}10` : "transparent",
            }}
            title={current ? `Etiqueta: ${current.name}` : "Asignar etiqueta"}
          >
            {current ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="truncate">{current.name}</span>
              </>
            ) : (
              <>
                <Tag className="h-2.5 w-2.5" />
                <span>Etiqueta</span>
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="space-y-1">
            <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Asignar etiqueta
            </div>
            <button
              onClick={() => apply(null)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted text-left ${
                !currentLabelId ? "bg-muted/60 font-medium" : ""
              }`}
            >
              <X className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Sin etiqueta</span>
            </button>
            {teamLabels.map((l) => {
              const inh = !!l.inherit_team_color;
              const c = inh ? "#6b7280" : (l.color || "#6b7280");
              const selected = currentLabelId === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => apply(l.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted text-left ${
                    selected ? "bg-muted/60 font-medium" : ""
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={inh
                      ? { background: `repeating-linear-gradient(45deg, ${c}, ${c} 2px, transparent 2px, transparent 4px)` }
                      : { backgroundColor: c }}
                  />
                  <span className="flex-1 truncate" style={{ color: inh ? undefined : c }}>
                    {l.name}
                    {inh && <span className="ml-1 text-[9px] uppercase tracking-wider text-muted-foreground">· auto</span>}
                  </span>
                  {selected && <Check className="h-3 w-3 text-primary" />}
                </button>
              );
            })}
            {teamLabels.length === 0 && (
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                No hay etiquetas creadas todavía.
              </div>
            )}
            <div className="border-t mt-1 pt-1">
              <button
                onClick={() => setLabelsManagerOpen(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted text-left text-primary"
              >
                <Settings2 className="h-3 w-3" />
                <span>Gestionar etiquetas…</span>
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4">
            {/* Header row with title and main save action */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Horarios Rotativos
              </CardTitle>

              {/* Primary action: Save */}
              <Button size="sm" onClick={() => save()} disabled={!dirty || saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
            
            {/* Toolbar: grouped actions */}
            <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/30 rounded-lg border border-border/50">
              {/* Configuration group */}
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAiChatOpen(true)}>
                  <Bot className="h-3.5 w-3.5 mr-1.5" />
                  Rotación IA
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setPersonalSchedulesOpen(true)} disabled={!selectedDepartment}>
                  <User className="h-3.5 w-3.5 mr-1.5" />
                  Personal
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setPersonalAnnualCalendarsOpen(true)}>
                  <CalendarIcon2 className="h-3.5 w-3.5 mr-1.5" />
                  Cal. Personal
                </Button>
              </div>
              
              <div className="h-5 w-px bg-border hidden sm:block" />
              
              {/* Actions group */}
              <div className="flex items-center gap-1.5">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={loadHistory} disabled={!scheduleId}>
                        <History className="h-3.5 w-3.5 mr-1.5" />
                        Historial
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">Ver versiones anteriores</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setCopyTargetWeek(week < 52 ? week + 1 : 1);
                          setCopyTargetYear(week < 52 ? year : year + 1);
                          setCopyWeekDialogOpen(true);
                        }}
                        disabled={!scheduleId && Object.keys(schedule).length === 0}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copiar
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">Copiar horario a otra semana</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              <div className="h-5 w-px bg-border hidden sm:block" />
              
              {/* Export group */}
              <div className="flex items-center gap-1.5">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 text-xs"
                        onClick={generateWorkerSummary}
                        disabled={Object.keys(schedule).length === 0 || Object.keys(workersPerTeam).length === 0}
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                        Resumen
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">Resumen para WhatsApp</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 text-xs"
                        onClick={(e) => {
                          if (e.shiftKey) {
                            const htmlElement = document.documentElement;
                            const isDarkMode = htmlElement.classList.contains("dark");
                            setPdfTheme(isDarkMode ? "dark" : "light");
                            setShowPdfThemeDialog(true);
                          } else {
                            download();
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          const htmlElement = document.documentElement;
                          const isDarkMode = htmlElement.classList.contains("dark");
                          setPdfTheme(isDarkMode ? "dark" : "light");
                          setShowPdfThemeDialog(true);
                        }}
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        PDF
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">Descargar PDF (Shift+clic para tema)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              <div className="h-5 w-px bg-border hidden sm:block" />
              
              {/* Propagate toggle */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-background rounded-md border border-border/50">
                      <Switch
                        id="propagate-future"
                        checked={propagateToFuture}
                        onCheckedChange={setPropagateToFuture}
                        className="scale-[0.65]"
                      />
                      <Label htmlFor="propagate-future" className="text-[11px] cursor-pointer whitespace-nowrap text-muted-foreground">
                        Propagar
                      </Label>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs max-w-[200px]">
                      Aplicar cambios a las próximas 4 semanas al guardar
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Campaign toggle */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-background rounded-md border border-border/50">
                      <Megaphone className={`h-3 w-3 ${campaignMode ? 'text-amber-500' : 'text-muted-foreground'}`} />
                      <Switch
                        id="campaign-mode"
                        checked={campaignMode}
                        onCheckedChange={setCampaignMode}
                        className="scale-[0.65]"
                      />
                      <Label htmlFor="campaign-mode" className="text-[11px] cursor-pointer whitespace-nowrap text-muted-foreground">
                        Campaña
                      </Label>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs max-w-[220px]">
                      Mostrar alerta de Campaña en el PDF descargado
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            {/* Shift Configuration Panel */}
            {selectedDepartment && (
              <div className="w-full">
                <ShiftConfigPanel
                  departmentId={selectedDepartment}
                  year={year}
                  week={week}
                  onShiftsChange={setDepartmentShifts}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-[220px]">
                  <DepartmentSearchSelect
                    departments={departments}
                    value={selectedDepartment}
                    onChange={handleDepartmentChange}
                    includeAll={false}
                    placeholder="Departamento"
                    className="w-[220px] justify-between"
                    showConfiguredStatus
                  />
                </div>
                
                {/* Toggle week reviewed checkbox */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className={`flex items-center justify-center h-9 w-9 rounded-lg border transition-colors ${
                        isWeekReviewed
                          ? "bg-primary/20 border-primary text-primary"
                          : "bg-muted border-border text-muted-foreground hover:border-primary/50"
                      }`}
                      title="Marcar semana como revisada"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3 bg-background z-50" align="start">
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Revisión de Semana {week}</p>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="week-reviewed"
                          checked={isWeekReviewed}
                          disabled={!scheduleId}
                          onCheckedChange={async (checked) => {
                            try {
                              const sessionToken = getManagerSessionToken();
                              if (!sessionToken) {
                                toast.error("Sesión requerida");
                                return;
                              }
                              if (!scheduleId) {
                                toast.error("Guarda el horario antes de marcarlo como revisado");
                                return;
                              }
                              const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
                                body: {
                                  action: "toggleWeeklyScheduleReviewed",
                                  sessionToken,
                                  data: { 
                                    departmentId: selectedDepartment, 
                                    year,
                                    weekNumber: week,
                                    isReviewed: !!checked 
                                  },
                                },
                              });
                              if (error || !resp?.success) throw new Error(resp?.error || "Error");
                              setIsWeekReviewed(!!checked);
                              setReviewedAt(resp.schedule?.reviewed_at || null);
                              setReviewedBy(resp.schedule?.reviewed_by || null);
                              toast.success(checked 
                                ? `Semana ${week} marcada como revisada - visible para trabajadores` 
                                : `Semana ${week} desmarcada`
                              );
                            } catch (e) {
                              console.error(e);
                              toast.error(e instanceof Error ? e.message : "Error al actualizar estado");
                            }
                          }}
                        />
                        <Label htmlFor="week-reviewed" className="text-sm cursor-pointer">
                          Semana revisada
                        </Label>
                      </div>
                      {!scheduleId && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Guarda el horario primero para poder marcarlo como revisado.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Los trabajadores solo verán esta semana cuando esté marcada como revisada.
                        Desde el viernes podrán ver la semana siguiente.
                      </p>
                      {reviewedAt && reviewedBy && (
                        <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                          Revisado por <span className="font-medium">{reviewedBy}</span>
                          <br />
                          {new Date(reviewedAt).toLocaleDateString("es-ES", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Etiquetas (lugar/función rotable) */}
                <button
                  onClick={() => setLabelsManagerOpen(true)}
                  className="flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-muted text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                  title="Gestionar etiquetas (lugar / función)"
                >
                  <Tag className="h-4 w-4" />
                </button>

                {/* Rotar etiquetas */}
                {teamLabels.length > 0 && parentGroups.length > 1 && (
                  <button
                    onClick={handleRotateLabels}
                    className="flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-muted text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                    title="Rotar etiquetas entre grupos"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}

                {/* Lock for managers toggle */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className={`flex items-center justify-center h-9 w-9 rounded-lg border transition-colors ${
                        departments.find(d => d.id === selectedDepartment)?.schedule_locked_for_managers
                          ? "bg-destructive/20 border-destructive text-destructive"
                          : "bg-muted border-border text-muted-foreground hover:border-primary/50"
                      }`}
                      title="Bloquear/Desbloquear edición para encargados"
                    >
                      {departments.find(d => d.id === selectedDepartment)?.schedule_locked_for_managers ? (
                        <Lock className="h-4 w-4" />
                      ) : (
                        <Unlock className="h-4 w-4" />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-3 bg-background z-50" align="start">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        {departments.find(d => d.id === selectedDepartment)?.schedule_locked_for_managers ? (
                          <Lock className="h-4 w-4 text-destructive" />
                        ) : (
                          <Unlock className="h-4 w-4 text-muted-foreground" />
                        )}
                        <p className="text-sm font-medium">Bloqueo para Encargados</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch
                          id="schedule-lock"
                          checked={departments.find(d => d.id === selectedDepartment)?.schedule_locked_for_managers ?? false}
                          disabled={togglingLock}
                          onCheckedChange={async (checked) => {
                            try {
                              setTogglingLock(true);
                              const sessionToken = getManagerSessionToken();
                              if (!sessionToken) {
                                toast.error("Sesión requerida");
                                return;
                              }
                              const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
                                body: {
                                  action: "toggleScheduleLockedForManagers",
                                  sessionToken,
                                  data: { 
                                    departmentId: selectedDepartment, 
                                    locked: checked 
                                  },
                                },
                              });
                              if (error || !resp?.success) throw new Error(resp?.error || "Error");
                              
                              // Update local state
                              setDepartments(prev => prev.map(d => 
                                d.id === selectedDepartment 
                                  ? { ...d, schedule_locked_for_managers: checked }
                                  : d
                              ));
                              
                              toast.success(checked 
                                ? "Horario bloqueado - Los encargados no podrán hacer cambios" 
                                : "Horario desbloqueado - Los encargados pueden modificar"
                              );
                            } catch (e) {
                              console.error(e);
                              toast.error(e instanceof Error ? e.message : "Error al actualizar bloqueo");
                            } finally {
                              setTogglingLock(false);
                            }
                          }}
                        />
                        <Label htmlFor="schedule-lock" className="text-sm cursor-pointer">
                          {departments.find(d => d.id === selectedDepartment)?.schedule_locked_for_managers 
                            ? "Bloqueado" 
                            : "Desbloqueado"
                          }
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Cuando está bloqueado, los encargados no podrán arrastrar equipos ni modificar horarios de este departamento.
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Auto-rotate teams toggle */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className={`flex items-center justify-center h-9 w-9 rounded-lg border transition-colors ${
                        departments.find(d => d.id === selectedDepartment)?.schedule_auto_rotate_teams
                          ? "bg-blue-100 border-blue-400 text-blue-600 dark:bg-blue-900/30 dark:border-blue-500 dark:text-blue-400"
                          : "bg-muted border-border text-muted-foreground hover:border-primary/50"
                      }`}
                      title="Auto-rotar equipos al copiar"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-3 bg-background z-50" align="start">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium">Auto-rotar equipos</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch
                          id="schedule-auto-rotate"
                          checked={departments.find(d => d.id === selectedDepartment)?.schedule_auto_rotate_teams ?? false}
                          onCheckedChange={async (checked) => {
                            try {
                              const sessionToken = getManagerSessionToken();
                              if (!sessionToken) {
                                toast.error("Sesión requerida");
                                return;
                              }
                              const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
                                body: {
                                  action: "toggleScheduleAutoRotateTeams",
                                  sessionToken,
                                  data: { departmentId: selectedDepartment, enabled: checked },
                                },
                              });
                              if (error || !resp?.success) throw new Error(resp?.error || "Error");
                              
                              setDepartments(prev => prev.map(d => 
                                d.id === selectedDepartment 
                                  ? { ...d, schedule_auto_rotate_teams: checked }
                                  : d
                              ));
                              
                              toast.success(checked 
                                ? "Auto-rotación activada" 
                                : "Auto-rotación desactivada"
                              );
                            } catch (e) {
                              console.error(e);
                              toast.error(e instanceof Error ? e.message : "Error al actualizar");
                            }
                          }}
                        />
                        <Label htmlFor="schedule-auto-rotate" className="text-sm cursor-pointer">
                          {departments.find(d => d.id === selectedDepartment)?.schedule_auto_rotate_teams 
                            ? "Activado" 
                            : "Desactivado"
                          }
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Al copiar el horario a otra semana, el orden de los grupos rota automáticamente (el último grupo pasa al principio).
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveWeek(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="px-3 py-1 text-sm font-medium min-w-[160px] text-center">
                  Semana {week}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveWeek(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <Badge variant="secondary" className="text-xs">
                {formatDateShort(range.start)} - {formatDateShort(range.end)}
              </Badge>

              {/* Auto-save indicator */}
              {autoSaveStatus === "saving" && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/15 border border-blue-500/30 rounded-lg">
                  <div className="h-3 w-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    Guardando...
                  </span>
                </div>
              )}
              
              {autoSaveStatus === "saved" && !dirty && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/15 border border-green-500/30 rounded-lg">
                  <svg className="h-3 w-3 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    Guardado
                  </span>
                </div>
              )}

              {dirty && autoSaveStatus !== "saving" && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-lg animate-pulse">
                  <div className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Cambios sin guardar
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {weekLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                <span className="text-sm text-muted-foreground">Cargando semana {week}...</span>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto" ref={captureRef}>
                <div className="min-w-[820px] p-4">
                  <div className="mb-4 pb-3 border-b border-border">
                    <h2 className="text-lg font-semibold">Semana {week}</h2>
                    <p className="text-sm text-muted-foreground">
                      {formatDateShort(range.start)} - {formatDateShort(range.end)}
                    </p>
                  </div>

              <div className="border border-border rounded-lg overflow-hidden relative">
                <div className="grid bg-muted" style={{ gridTemplateColumns: "minmax(180px, 1.4fr) repeat(7, 1fr)" }}>
                  <div className="p-3 font-medium text-sm border-r border-border">Equipo</div>
                  {DAYS.map((d) => {
                    const hasAnnouncement = !!dayAnnouncements[d.key]?.trim();
                    return (
                      <div key={d.key} className="p-3 font-medium text-sm text-center border-r border-border last:border-r-0 relative">
                        <div>{d.full}</div>
                        <div className="text-xs text-muted-foreground">{d.short}</div>
                        <button
                          type="button"
                          onClick={() => {
                            setAnnouncementDialogDay(d.key);
                            setAnnouncementDraft(dayAnnouncements[d.key] || "");
                          }}
                          title={hasAnnouncement ? "Editar anuncio del día" : "Añadir anuncio para este día"}
                          className={`absolute top-1 right-1 inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
                            hasAnnouncement
                              ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30"
                              : "text-muted-foreground/40 hover:text-foreground hover:bg-muted"
                          }`}
                        >
                          <Megaphone className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Banner row: announcements that override all teams for a given day */}
                {DAYS.some((d) => !!dayAnnouncements[d.key]?.trim()) && (
                  <div
                    className="grid border-b border-amber-300/60 dark:border-amber-700/50 bg-amber-50/60 dark:bg-amber-950/20"
                    style={{ gridTemplateColumns: "minmax(180px, 1.4fr) repeat(7, 1fr)" }}
                  >
                    <div className="p-3 border-r border-border flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 font-medium">
                      <Megaphone className="h-3.5 w-3.5" />
                      <span>Aviso del día</span>
                    </div>
                    {DAYS.map((d) => {
                      const text = dayAnnouncements[d.key]?.trim();
                      return (
                        <div
                          key={d.key}
                          className="p-3 border-r border-border last:border-r-0 text-center"
                        >
                          {text ? (
                            <p className="text-xs text-amber-800 dark:text-amber-200 leading-tight whitespace-pre-wrap">
                              {text}
                            </p>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/40">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {deptTeams.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No hay equipos de trabajo configurados para este departamento</div>
                ) : (
                  parentGroups.map((parentGroup, groupIdx) => {
                    const teamsInGroup = groupedTeams[parentGroup];
                    const isExpanded = expandedGroups.has(parentGroup);
                    const hasMultipleTeams = teamsInGroup.length > 1;
                    
                    // For single-team groups, render only one row (no parent+child duplication)
                    if (!hasMultipleTeams) {
                      const singleTeam = teamsInGroup[0];
                      return (
                        <div
                          key={parentGroup}
                          draggable
                          onDragStart={(e) => handleTeamDragStart(e, parentGroup)}
                          onDragOver={(e) => handleTeamDragOver(e, parentGroup)}
                          onDragLeave={handleTeamDragLeave}
                          onDrop={(e) => handleTeamDrop(e, parentGroup)}
                          onDragEnd={handleTeamDragEnd}
                        >
                          <div className={`grid bg-muted/30 transition-colors hover:bg-muted/50 ${groupIdx < parentGroups.length - 1 ? "border-b border-border" : ""} ${dragOverGroup === parentGroup ? "ring-2 ring-primary ring-inset" : ""} ${draggedGroup === parentGroup ? "opacity-50" : ""}`} style={{ gridTemplateColumns: "minmax(180px, 1.4fr) repeat(7, 1fr)" }}>
                            <div className="p-3 border-r border-border flex items-center gap-3 min-w-0">
                              <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab active:cursor-grabbing flex-shrink-0" />
                              <Popover
                                open={colorPickerOpen === parentGroup}
                                onOpenChange={(open) => {
                                  setColorPickerOpen(open ? parentGroup : null);
                                  if (open) setCustomHexInput(getGroupColor(parentGroup));
                                }}
                              >
                                <div className="flex flex-col items-start gap-1 min-w-0">
                                  <PopoverTrigger asChild>
                                    <button
                                      className="h-7 inline-flex items-center rounded-full px-2.5 border transition-colors hover:bg-muted/40 whitespace-nowrap max-w-full"
                                      style={{
                                        borderColor: getGroupColor(parentGroup),
                                        backgroundColor: `${getGroupColor(parentGroup)}14`,
                                        color: getGroupColor(parentGroup),
                                      }}
                                      title={getGroupDisplayName(parentGroup)}
                                    >
                                      <span
                                        className="w-2 h-2 rounded-full mr-1.5 shrink-0"
                                        style={{ backgroundColor: getGroupColor(parentGroup) }}
                                      />
                                      <span className="text-xs font-normal tracking-wide truncate">{getGroupDisplayName(parentGroup)}</span>
                                    </button>
                                  </PopoverTrigger>

                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-muted-foreground leading-none">1 equipo</span>
                                    {/* Lock button for single-team group */}
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleTeamScheduleLock(singleTeam.id, singleTeam.is_schedule_locked ?? false);
                                            }}
                                            className={`flex items-center gap-0.5 p-0.5 rounded text-[10px] transition-colors hover:bg-muted/60 ${
                                              singleTeam.is_schedule_locked
                                                ? "text-amber-600 dark:text-amber-400"
                                                : "text-muted-foreground/40 hover:text-muted-foreground"
                                            }`}
                                          >
                                            {singleTeam.is_schedule_locked ? (
                                              <Lock className="h-2.5 w-2.5" />
                                            ) : (
                                              <Unlock className="h-2.5 w-2.5" />
                                            )}
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="right">
                                          <p className="text-xs">
                                            {singleTeam.is_schedule_locked
                                              ? "Horario bloqueado - Click para desbloquear"
                                              : "Click para bloquear horario"}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                  <div className="mt-0.5">{renderLabelChip({ teamId: singleTeam.id })}</div>
                                </div>

                                <PopoverContent className="w-64 p-3" align="start">
                                  <ColorPicker
                                    value={getGroupColor(parentGroup)}
                                    onChange={(c) => updateGroupColor(parentGroup, c)}
                                    label={`Color de ${getGroupDisplayName(parentGroup)}`}
                                    activeColors={Object.values(groupColors).filter((c, i, a) => a.indexOf(c) === i)}
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>

                            {DAYS.map((d) => {
                              if (dayAnnouncements[d.key]?.trim()) {
                                return (
                                  <div key={d.key} className="p-2 border-r border-border last:border-r-0 bg-amber-50/40 dark:bg-amber-950/10 flex items-center justify-center">
                                    <Megaphone className="h-3 w-3 text-amber-500/50" />
                                  </div>
                                );
                              }
                              const cell = schedule?.[d.key]?.[singleTeam.id] || { type: "rest", start: null, end: null };
                              const type = (cell.type as ScheduleType) || "rest";
                              const teamOnVacation = isTeamOnVacation(d.key, singleTeam.id);
                              return (
                                <div key={d.key} className="p-2 border-r border-border last:border-r-0 relative">
                                  <Select value={type} onValueChange={(v) => setCellType(d.key, singleTeam.id, v as ScheduleType)}>
                                    <SelectTrigger className={`h-8 text-xs ${getShiftBadgeStyle(type)}`}>
                                      <SelectValue>
                                        {type === 'vacation' ? (
                                          <span className="flex items-center gap-1">
                                            <Palmtree className="h-3 w-3" />
                                            Vacaciones
                                          </span>
                                        ) : getShiftLabel(type)}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getAvailableShifts().map((shift) => (
                                        <SelectItem key={shift.key} value={shift.key}>
                                          {shift.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  {teamOnVacation && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center cursor-help">
                                            <CalendarDays className="h-2.5 w-2.5 text-white" />
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          <p className="text-xs flex items-center gap-1">
                                            <CalendarDays className="h-3 w-3" />
                                            Vacaciones según calendario anual
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}

                                  {type !== "rest" && type !== "vacation" && (() => {
                                    const shiftDefaults = getShiftTimes(type);
                                    const displayStart = cell.start || shiftDefaults.start || "08:00";
                                    const displayEnd = cell.end || shiftDefaults.end || "fin";
                                    const isSpecial = (cell.start && cell.start !== shiftDefaults.start) || (cell.end && cell.end !== shiftDefaults.end);
                                    return (
                                    <div className="flex items-center gap-1 mt-1">
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className={`text-xs flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer flex-1 justify-center ${
                                            isSpecial ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"
                                          }`}>
                                            <Clock className={`h-3 w-3 ${isSpecial ? "text-amber-500" : ""}`} />
                                            {displayStart} - {displayEnd}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-48 p-3" align="start">
                                          <div className="space-y-3">
                                            <div className="space-y-1">
                                              <Label className="text-xs">Hora inicio</Label>
                                              <Input
                                                type="time"
                                                value={cell.start || ""}
                                                onChange={(e) => setCellTime(d.key, singleTeam.id, "start", e.target.value)}
                                                className="h-8 text-sm"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <Label className="text-xs">Hora fin</Label>
                                              <Input
                                                type="time"
                                                value={cell.end || ""}
                                                onChange={(e) => setCellTime(d.key, singleTeam.id, "end", e.target.value)}
                                                className="h-8 text-sm"
                                              />
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>

                                      {/* Partial count + shift button */}
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className={`p-0.5 rounded transition-colors ${
                                            cell.partial_count ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"
                                          }`}>
                                            <Users className="h-3 w-3" />
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-3" align="end">
                                          <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                              <Users className="h-4 w-4 text-muted-foreground" />
                                              <p className="text-xs font-medium">Asistencia parcial</p>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                              X personas harán un turno diferente
                                            </p>
                                            <div className="flex items-center gap-2">
                                              <Input
                                                type="number"
                                                min={0}
                                                max={99}
                                                placeholder="0"
                                                value={cell.partial_count ?? ""}
                                                onChange={(e) => {
                                                  const val = e.target.value ? parseInt(e.target.value, 10) : null;
                                                  setSchedule((prev) => ({
                                                    ...prev,
                                                    [d.key]: {
                                                      ...(prev[d.key] || {}),
                                                      [singleTeam.id]: {
                                                        ...(prev[d.key]?.[singleTeam.id] || { type: "morning" as ScheduleType, start: null, end: null }),
                                                        partial_count: val && val > 0 ? val : null,
                                                      },
                                                    },
                                                  }));
                                                  setDirty(true);
                                                }}
                                                className="h-8 text-sm w-20"
                                              />
                                              <span className="text-xs text-muted-foreground">personas</span>
                                            </div>
                                            {cell.partial_count && cell.partial_count > 0 && (
                                              <>
                                                <div className="space-y-1">
                                                  <Label className="text-xs">Turno para estas personas</Label>
                                                  <Select
                                                    value={cell.partial_shift || ""}
                                                    onValueChange={(v) => {
                                                      const shiftTimes = getShiftTimes(v);
                                                      setSchedule((prev) => ({
                                                        ...prev,
                                                        [d.key]: {
                                                          ...(prev[d.key] || {}),
                                                          [singleTeam.id]: {
                                                            ...(prev[d.key]?.[singleTeam.id] || { type: "morning" as ScheduleType, start: null, end: null }),
                                                            partial_shift: v,
                                                            partial_start: shiftTimes.start,
                                                            partial_end: shiftTimes.end,
                                                          },
                                                        },
                                                      }));
                                                      setDirty(true);
                                                    }}
                                                  >
                                                    <SelectTrigger className="h-8 text-xs">
                                                      <SelectValue placeholder="Seleccionar turno" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      {getAvailableShifts().filter(s => s.key !== 'vacation').map((shift) => (
                                                        <SelectItem key={shift.key} value={shift.key}>
                                                          {shift.label}
                                                        </SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                                {cell.partial_shift && (
                                                  <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                      <Label className="text-xs">Inicio</Label>
                                                      <Input
                                                        type="time"
                                                        value={cell.partial_start || ""}
                                                        onChange={(e) => {
                                                          setSchedule((prev) => ({
                                                            ...prev,
                                                            [d.key]: {
                                                              ...(prev[d.key] || {}),
                                                              [singleTeam.id]: {
                                                                ...(prev[d.key]?.[singleTeam.id] || { type: "morning" as ScheduleType, start: null, end: null }),
                                                                partial_start: e.target.value,
                                                              },
                                                            },
                                                          }));
                                                          setDirty(true);
                                                        }}
                                                        className="h-8 text-sm"
                                                      />
                                                    </div>
                                                    <div className="space-y-1">
                                                      <Label className="text-xs">Fin</Label>
                                                      <Input
                                                        type="time"
                                                        value={cell.partial_end || ""}
                                                        onChange={(e) => {
                                                          setSchedule((prev) => ({
                                                            ...prev,
                                                            [d.key]: {
                                                              ...(prev[d.key] || {}),
                                                              [singleTeam.id]: {
                                                                ...(prev[d.key]?.[singleTeam.id] || { type: "morning" as ScheduleType, start: null, end: null }),
                                                                partial_end: e.target.value,
                                                              },
                                                            },
                                                          }));
                                                          setDirty(true);
                                                        }}
                                                        className="h-8 text-sm"
                                                      />
                                                    </div>
                                                  </div>
                                                )}
                                              </>
                                            )}
                                            {cell.partial_count && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 text-xs w-full"
                                                onClick={() => {
                                                  setSchedule((prev) => ({
                                                    ...prev,
                                                    [d.key]: {
                                                      ...(prev[d.key] || {}),
                                                      [singleTeam.id]: {
                                                        ...(prev[d.key]?.[singleTeam.id] || { type: "morning" as ScheduleType, start: null, end: null }),
                                                        partial_count: null,
                                                        partial_shift: null,
                                                        partial_start: null,
                                                        partial_end: null,
                                                      },
                                                    },
                                                  }));
                                                  setDirty(true);
                                                }}
                                              >
                                                Quitar parcial
                                              </Button>
                                            )}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                    );
                                  })()}

                                  {/* Partial count indicator */}
                                  {cell.partial_count && cell.partial_count > 0 && (
                                    <div className="mt-0.5 text-center">
                                      <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                                        {cell.partial_count} pers.{cell.partial_shift ? ` → ${getShiftLabel(cell.partial_shift)}` : ''}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={parentGroup}
                        draggable
                        onDragStart={(e) => handleTeamDragStart(e, parentGroup)}
                        onDragOver={(e) => handleTeamDragOver(e, parentGroup)}
                        onDragLeave={handleTeamDragLeave}
                        onDrop={(e) => handleTeamDrop(e, parentGroup)}
                        onDragEnd={handleTeamDragEnd}
                      >
                        {/* Parent Group Row */}
                        <div className={`grid bg-muted/30 transition-colors hover:bg-muted/50 ${groupIdx < parentGroups.length - 1 || isExpanded ? "border-b border-border" : ""} ${dragOverGroup === parentGroup ? "ring-2 ring-primary ring-inset" : ""} ${draggedGroup === parentGroup ? "opacity-50" : ""}`} style={{ gridTemplateColumns: "minmax(180px, 1.4fr) repeat(7, 1fr)" }}>
                          <div className="p-3 border-r border-border flex items-center gap-2 min-w-0">
                            <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab active:cursor-grabbing flex-shrink-0" />
                            <button
                              onClick={() => toggleGroup(parentGroup)}
                              className="p-0.5 rounded hover:bg-muted transition-colors flex-shrink-0"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                            
                            <Popover
                              open={colorPickerOpen === parentGroup}
                              onOpenChange={(open) => {
                                setColorPickerOpen(open ? parentGroup : null);
                                if (open) setCustomHexInput(getGroupColor(parentGroup));
                              }}
                            >
                              <div className="flex flex-col items-start gap-1 min-w-0">
                                <PopoverTrigger asChild>
                                  <button
                                    className="h-7 inline-flex items-center rounded-full px-2.5 border transition-colors hover:bg-muted/40 whitespace-nowrap max-w-full"
                                    style={{
                                      borderColor: getGroupColor(parentGroup),
                                      backgroundColor: `${getGroupColor(parentGroup)}14`,
                                      color: getGroupColor(parentGroup),
                                    }}
                                    title={getGroupDisplayName(parentGroup)}
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full mr-1.5 shrink-0"
                                      style={{ backgroundColor: getGroupColor(parentGroup) }}
                                    />
                                    <span className="text-xs font-normal tracking-wide truncate">{getGroupDisplayName(parentGroup)}</span>
                                  </button>
                                </PopoverTrigger>

                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground leading-none">
                                    {teamsInGroup.length} equipos
                                  </span>
                                
                                  {/* Lock button for the group - inline */}
                                  {(() => {
                                    const lockedTeams = teamsInGroup.filter(t => t.is_schedule_locked);
                                    const allLocked = lockedTeams.length === teamsInGroup.length && teamsInGroup.length > 0;
                                    const someLocked = lockedTeams.length > 0 && !allLocked;
                                    
                                    return (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const shouldLock = !allLocked;
                                                teamsInGroup.forEach(t => {
                                                  if (shouldLock !== (t.is_schedule_locked ?? false)) {
                                                    toggleTeamScheduleLock(t.id, t.is_schedule_locked ?? false);
                                                  }
                                                });
                                              }}
                                              className={`flex items-center gap-0.5 p-0.5 rounded text-[10px] transition-colors hover:bg-muted/60 ${
                                                allLocked 
                                                  ? "text-amber-600 dark:text-amber-400" 
                                                  : someLocked
                                                    ? "text-muted-foreground"
                                                    : "text-muted-foreground/40 hover:text-muted-foreground"
                                              }`}
                                            >
                                              {allLocked || someLocked ? (
                                                <Lock className="h-2.5 w-2.5" />
                                              ) : (
                                                <Unlock className="h-2.5 w-2.5" />
                                              )}
                                              {someLocked && <span>{lockedTeams.length}/{teamsInGroup.length}</span>}
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top">
                                            <p className="text-xs font-medium">
                                              {allLocked 
                                                ? "Click para desbloquear todos" 
                                                : someLocked
                                                  ? `${lockedTeams.length} de ${teamsInGroup.length} bloqueados - Click para bloquear todos`
                                                  : "Click para bloquear grupo"}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              Los equipos bloqueados no rotan ni cambian
                                            </p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    );
                                  })()}
                                </div>
                                <div className="mt-0.5">{renderLabelChip({ parentGroup })}</div>
                              </div>

                              <PopoverContent className="w-64 p-3" align="start">
                                <ColorPicker
                                  value={getGroupColor(parentGroup)}
                                  onChange={(c) => updateGroupColor(parentGroup, c)}
                                  label={`Color de ${getGroupDisplayName(parentGroup)}`}
                                  activeColors={Object.values(groupColors).filter((c, i, a) => a.indexOf(c) === i)}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>

                          {DAYS.map((d) => {
                            if (dayAnnouncements[d.key]?.trim()) {
                              return (
                                <div key={d.key} className="p-2 border-r border-border last:border-r-0 bg-amber-50/40 dark:bg-amber-950/10 flex items-center justify-center">
                                  <Megaphone className="h-3 w-3 text-amber-500/50" />
                                </div>
                              );
                            }
                            const cell = getGroupCell(d.key, parentGroup);
                            const type = (cell.type as ScheduleType) || "rest";
                            const mixedInfo = getGroupMixedInfo(d.key, parentGroup);
                            
                            return (
                              <div key={d.key} className="p-2 border-r border-border last:border-r-0 relative">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="relative">
                                        <Select value={type} onValueChange={(v) => setGroupCellType(d.key, parentGroup, v as ScheduleType)}>
                                          <SelectTrigger className={`h-8 text-xs ${getShiftBadgeStyle(type)}`}>
                                            <SelectValue>
                                              {type === 'vacation' ? (
                                                <span className="flex items-center gap-1">
                                                  <Palmtree className="h-3 w-3" />
                                                  Vacaciones
                                                </span>
                                              ) : getShiftLabel(type)}
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            {getAvailableShifts().map((shift) => (
                                              <SelectItem key={shift.key} value={shift.key}>
                                                {shift.label}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        
                                        {/* Vacation from calendar indicator */}
                                        {isGroupOnVacation(d.key, parentGroup) && (
                                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center" title="Vacaciones según calendario anual">
                                            <CalendarDays className="h-2.5 w-2.5 text-white" />
                                          </div>
                                        )}
                                        
                                        {/* Mixed shift indicator */}
                                        {mixedInfo.hasMixed && !isGroupOnVacation(d.key, parentGroup) && (
                                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                                            <AlertCircle className="h-2.5 w-2.5 text-primary-foreground" />
                                          </div>
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    {(mixedInfo.hasMixed || isGroupOnVacation(d.key, parentGroup)) && (
                                      <TooltipContent side="top" className="max-w-xs">
                                        <div className="text-xs space-y-1">
                                          {isGroupOnVacation(d.key, parentGroup) && (
                                            <p className="font-medium text-amber-600 flex items-center gap-1">
                                              <CalendarDays className="h-3 w-3" />
                                              Vacaciones según calendario anual
                                            </p>
                                          )}
                                          {mixedInfo.hasMixed && (
                                            <>
                                              <p className="font-medium text-primary">Turnos mixtos:</p>
                                              {mixedInfo.details.map((detail, i) => (
                                                <p key={i} className="text-muted-foreground">{detail}</p>
                                              ))}
                                            </>
                                          )}
                                        </div>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>

                                {type !== "rest" && (() => {
                                  const shiftDefaults = getShiftTimes(type);
                                  const displayStart = cell.start || shiftDefaults.start || "08:00";
                                  const displayEnd = cell.end || shiftDefaults.end || "fin";
                                  const isSpecial = (cell.start && cell.start !== shiftDefaults.start) || (cell.end && cell.end !== shiftDefaults.end);
                                  return (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className={`mt-1 text-xs flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer w-full justify-center ${
                                        isSpecial ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"
                                      }`}>
                                        <Clock className={`h-3 w-3 ${isSpecial ? "text-amber-500" : ""}`} />
                                        {displayStart} - {displayEnd}
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-48 p-3" align="start">
                                      <div className="space-y-3">
                                        <p className="text-xs text-muted-foreground">
                                          Aplicar a todos los equipos de {getGroupDisplayName(parentGroup)}
                                        </p>
                                        <div className="space-y-1">
                                          <Label className="text-xs">Hora inicio</Label>
                                          <Input
                                            type="time"
                                            value={cell.start || ""}
                                            onChange={(e) => setGroupCellTime(d.key, parentGroup, "start", e.target.value)}
                                            className="h-8 text-sm"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">Hora fin</Label>
                                          <Input
                                            type="time"
                                            value={cell.end || ""}
                                            onChange={(e) => setGroupCellTime(d.key, parentGroup, "end", e.target.value)}
                                            className="h-8 text-sm"
                                          />
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  );
                                })()}

                                {/* Group-level partial attendance */}
                                {type !== "rest" && type !== "vacation" && (() => {
                                  const groupPartial = getGroupPartialInfo(d.key, parentGroup);
                                  return (
                                    <div className="flex items-center justify-center mt-1">
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className={`p-0.5 rounded transition-colors ${
                                            groupPartial.partial_count ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"
                                          }`}>
                                            <Users className="h-3 w-3" />
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-3" align="end">
                                          <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                              <Users className="h-4 w-4 text-muted-foreground" />
                                              <p className="text-xs font-medium">Asistencia parcial — {getGroupDisplayName(parentGroup)}</p>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                              X personas de todo el grupo harán un turno diferente
                                            </p>
                                            <div className="flex items-center gap-2">
                                              <Input
                                                type="number"
                                                min={0}
                                                max={99}
                                                placeholder="0"
                                                value={groupPartial.partial_count ?? ""}
                                                onChange={(e) => {
                                                  const val = e.target.value ? parseInt(e.target.value, 10) : null;
                                                  setGroupPartialConfig(d.key, parentGroup, {
                                                    partial_count: val,
                                                    partial_shift: groupPartial.partial_shift,
                                                    partial_start: groupPartial.partial_start,
                                                    partial_end: groupPartial.partial_end,
                                                  });
                                                }}
                                                className="h-8 text-sm w-20"
                                              />
                                              <span className="text-xs text-muted-foreground">personas</span>
                                            </div>
                                            {groupPartial.partial_count && groupPartial.partial_count > 0 && (
                                              <>
                                                <div className="space-y-1">
                                                  <Label className="text-xs">Turno para estas personas</Label>
                                                  <Select
                                                    value={groupPartial.partial_shift || ""}
                                                    onValueChange={(v) => {
                                                      const shiftTimes = getShiftTimes(v);
                                                      setGroupPartialConfig(d.key, parentGroup, {
                                                        partial_count: groupPartial.partial_count,
                                                        partial_shift: v,
                                                        partial_start: shiftTimes.start,
                                                        partial_end: shiftTimes.end,
                                                      });
                                                    }}
                                                  >
                                                    <SelectTrigger className="h-8 text-xs">
                                                      <SelectValue placeholder="Seleccionar turno" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      {getAvailableShifts().filter(s => s.key !== 'vacation').map((shift) => (
                                                        <SelectItem key={shift.key} value={shift.key}>
                                                          {shift.label}
                                                        </SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                                {groupPartial.partial_shift && (
                                                  <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                      <Label className="text-xs">Inicio</Label>
                                                      <Input
                                                        type="time"
                                                        value={groupPartial.partial_start || ""}
                                                        onChange={(e) => {
                                                          setGroupPartialConfig(d.key, parentGroup, {
                                                            ...groupPartial,
                                                            partial_start: e.target.value,
                                                          });
                                                        }}
                                                        className="h-8 text-sm"
                                                      />
                                                    </div>
                                                    <div className="space-y-1">
                                                      <Label className="text-xs">Fin</Label>
                                                      <Input
                                                        type="time"
                                                        value={groupPartial.partial_end || ""}
                                                        onChange={(e) => {
                                                          setGroupPartialConfig(d.key, parentGroup, {
                                                            ...groupPartial,
                                                            partial_end: e.target.value,
                                                          });
                                                        }}
                                                        className="h-8 text-sm"
                                                      />
                                                    </div>
                                                  </div>
                                                )}
                                              </>
                                            )}
                                            {groupPartial.partial_count && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 text-xs w-full"
                                                onClick={() => {
                                                  setGroupPartialConfig(d.key, parentGroup, {
                                                    partial_count: null,
                                                    partial_shift: null,
                                                    partial_start: null,
                                                    partial_end: null,
                                                  });
                                                }}
                                              >
                                                Quitar parcial
                                              </Button>
                                            )}
                                          </div>
                                        </PopoverContent>
                                      </Popover>

                                      {/* Partial indicator */}
                                      {groupPartial.partial_count && groupPartial.partial_count > 0 && (
                                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full ml-1">
                                          {groupPartial.partial_count} pers.{groupPartial.partial_shift ? ` → ${getShiftLabel(groupPartial.partial_shift)}` : ''}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>

                        {/* Expanded Individual Teams */}
                        {isExpanded && teamsInGroup.map((t, idx) => (
                          <div key={t.id} className={`grid bg-background ${idx < teamsInGroup.length - 1 || groupIdx < parentGroups.length - 1 ? "border-b border-border" : ""}`} style={{ gridTemplateColumns: "minmax(180px, 1.4fr) repeat(7, 1fr)" }}>
                            <div className="p-3 border-r border-border flex items-center gap-2 pl-8">
                              <span className="text-sm text-muted-foreground">{t.name}</span>
                              
                              {/* Team lock toggle */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => toggleTeamScheduleLock(t.id, t.is_schedule_locked ?? false)}
                                      className={`ml-auto p-1 rounded hover:bg-muted/50 transition-colors ${
                                        t.is_schedule_locked ? "text-amber-500" : "text-muted-foreground/40 hover:text-muted-foreground"
                                      }`}
                                    >
                                      {t.is_schedule_locked ? (
                                        <Lock className="h-3.5 w-3.5" />
                                      ) : (
                                        <Unlock className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="right">
                                    <p className="text-xs">
                                      {t.is_schedule_locked 
                                        ? "Horario bloqueado - Click para desbloquear" 
                                        : "Click para bloquear horario"}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>

                            {DAYS.map((d) => {
                              if (dayAnnouncements[d.key]?.trim()) {
                                return (
                                  <div key={d.key} className="p-2 border-r border-border last:border-r-0 bg-amber-50/40 dark:bg-amber-950/10 flex items-center justify-center">
                                    <Megaphone className="h-3 w-3 text-amber-500/50" />
                                  </div>
                                );
                              }
                              const cell = schedule?.[d.key]?.[t.id] || { type: "rest", start: null, end: null };
                              const type = (cell.type as ScheduleType) || "rest";
                              const teamOnVacation = isTeamOnVacation(d.key, t.id);
                              return (
                                <div key={d.key} className="p-2 border-r border-border last:border-r-0 relative">
                                  <Select value={type} onValueChange={(v) => setCellType(d.key, t.id, v as ScheduleType)}>
                                    <SelectTrigger className={`h-8 text-xs ${getShiftBadgeStyle(type)}`}>
                                      <SelectValue>
                                        {type === 'vacation' ? (
                                          <span className="flex items-center gap-1">
                                            <Palmtree className="h-3 w-3" />
                                            Vacaciones
                                          </span>
                                        ) : getShiftLabel(type)}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getAvailableShifts().map((shift) => (
                                        <SelectItem key={shift.key} value={shift.key}>
                                          {shift.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  
                                  {/* Vacation from calendar indicator */}
                                  {teamOnVacation && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center cursor-help">
                                            <CalendarDays className="h-2.5 w-2.5 text-white" />
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          <p className="text-xs flex items-center gap-1">
                                            <CalendarDays className="h-3 w-3" />
                                            Vacaciones según calendario anual
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}

                                  {type !== "rest" && type !== "vacation" && (() => {
                                    const shiftDefaults = getShiftTimes(type);
                                    const displayStart = cell.start || shiftDefaults.start || "08:00";
                                    const displayEnd = cell.end || shiftDefaults.end || "fin";
                                    const isSpecial = (cell.start && cell.start !== shiftDefaults.start) || (cell.end && cell.end !== shiftDefaults.end);
                                    return (
                                    <div className="flex items-center gap-1 mt-1">
                                      <Popover>
                                        <PopoverTrigger asChild>
                                        <button className={`text-xs flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer flex-1 justify-center ${
                                          isSpecial ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"
                                        }`}>
                                          <Clock className={`h-3 w-3 ${isSpecial ? "text-amber-500" : ""}`} />
                                          {displayStart} - {displayEnd}
                                        </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-48 p-3" align="start">
                                          <div className="space-y-3">
                                            <div className="space-y-1">
                                              <Label className="text-xs">Hora inicio</Label>
                                              <Input
                                                type="time"
                                                value={cell.start || ""}
                                                onChange={(e) => setCellTime(d.key, t.id, "start", e.target.value)}
                                                className="h-8 text-sm"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <Label className="text-xs">Hora fin</Label>
                                              <Input
                                                type="time"
                                                value={cell.end || ""}
                                                onChange={(e) => setCellTime(d.key, t.id, "end", e.target.value)}
                                                className="h-8 text-sm"
                                              />
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>

                                      {/* Partial count + shift button */}
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className={`p-0.5 rounded transition-colors ${
                                            cell.partial_count ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"
                                          }`}>
                                            <Users className="h-3 w-3" />
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-3" align="end">
                                          <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                              <Users className="h-4 w-4 text-muted-foreground" />
                                              <p className="text-xs font-medium">Asistencia parcial</p>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                              X personas harán un turno diferente
                                            </p>
                                            <div className="flex items-center gap-2">
                                              <Input
                                                type="number"
                                                min={0}
                                                max={99}
                                                placeholder="0"
                                                value={cell.partial_count ?? ""}
                                                onChange={(e) => {
                                                  const val = e.target.value ? parseInt(e.target.value, 10) : null;
                                                  setSchedule((prev) => ({
                                                    ...prev,
                                                    [d.key]: {
                                                      ...(prev[d.key] || {}),
                                                      [t.id]: {
                                                        ...(prev[d.key]?.[t.id] || { type: "morning" as ScheduleType, start: null, end: null }),
                                                        partial_count: val && val > 0 ? val : null,
                                                      },
                                                    },
                                                  }));
                                                  setDirty(true);
                                                }}
                                                className="h-8 text-sm w-20"
                                              />
                                              <span className="text-xs text-muted-foreground">personas</span>
                                            </div>
                                            {cell.partial_count && cell.partial_count > 0 && (
                                              <>
                                                <div className="space-y-1">
                                                  <Label className="text-xs">Turno para estas personas</Label>
                                                  <Select
                                                    value={cell.partial_shift || ""}
                                                    onValueChange={(v) => {
                                                      const shiftTimes = getShiftTimes(v);
                                                      setSchedule((prev) => ({
                                                        ...prev,
                                                        [d.key]: {
                                                          ...(prev[d.key] || {}),
                                                          [t.id]: {
                                                            ...(prev[d.key]?.[t.id] || { type: "morning" as ScheduleType, start: null, end: null }),
                                                            partial_shift: v,
                                                            partial_start: shiftTimes.start,
                                                            partial_end: shiftTimes.end,
                                                          },
                                                        },
                                                      }));
                                                      setDirty(true);
                                                    }}
                                                  >
                                                    <SelectTrigger className="h-8 text-xs">
                                                      <SelectValue placeholder="Seleccionar turno" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      {getAvailableShifts().filter(s => s.key !== 'vacation').map((shift) => (
                                                        <SelectItem key={shift.key} value={shift.key}>
                                                          {shift.label}
                                                        </SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                                {cell.partial_shift && (
                                                  <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                      <Label className="text-xs">Inicio</Label>
                                                      <Input
                                                        type="time"
                                                        value={cell.partial_start || ""}
                                                        onChange={(e) => {
                                                          setSchedule((prev) => ({
                                                            ...prev,
                                                            [d.key]: {
                                                              ...(prev[d.key] || {}),
                                                              [t.id]: {
                                                                ...(prev[d.key]?.[t.id] || { type: "morning" as ScheduleType, start: null, end: null }),
                                                                partial_start: e.target.value,
                                                              },
                                                            },
                                                          }));
                                                          setDirty(true);
                                                        }}
                                                        className="h-8 text-sm"
                                                      />
                                                    </div>
                                                    <div className="space-y-1">
                                                      <Label className="text-xs">Fin</Label>
                                                      <Input
                                                        type="time"
                                                        value={cell.partial_end || ""}
                                                        onChange={(e) => {
                                                          setSchedule((prev) => ({
                                                            ...prev,
                                                            [d.key]: {
                                                              ...(prev[d.key] || {}),
                                                              [t.id]: {
                                                                ...(prev[d.key]?.[t.id] || { type: "morning" as ScheduleType, start: null, end: null }),
                                                                partial_end: e.target.value,
                                                              },
                                                            },
                                                          }));
                                                          setDirty(true);
                                                        }}
                                                        className="h-8 text-sm"
                                                      />
                                                    </div>
                                                  </div>
                                                )}
                                              </>
                                            )}
                                            {cell.partial_count && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 text-xs w-full"
                                                onClick={() => {
                                                  setSchedule((prev) => ({
                                                    ...prev,
                                                    [d.key]: {
                                                      ...(prev[d.key] || {}),
                                                      [t.id]: {
                                                        ...(prev[d.key]?.[t.id] || { type: "morning" as ScheduleType, start: null, end: null }),
                                                        partial_count: null,
                                                        partial_shift: null,
                                                        partial_start: null,
                                                        partial_end: null,
                                                      },
                                                    },
                                                  }));
                                                  setDirty(true);
                                                }}
                                              >
                                                Quitar parcial
                                              </Button>
                                            )}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                    );
                                  })()}

                                  {/* Partial count indicator */}
                                  {cell.partial_count && cell.partial_count > 0 && (
                                    <div className="mt-0.5 text-center">
                                      <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                                        {cell.partial_count} pers.{cell.partial_shift ? ` → ${getShiftLabel(cell.partial_shift)}` : ''}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
              </div>
              </div>

              <div className="p-4 border-t border-border">
                <Label className="text-sm font-medium mb-2 block">Notas de la semana</Label>
                <Textarea
                  placeholder="Añadir notas o comentarios..."
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setDirty(true);
                  }}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Schedule Rules Dialog */}
      <ScheduleRulesPanel
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        departmentId={selectedDepartment}
        departmentName={departments.find(d => d.id === selectedDepartment)?.name || ""}
        parentGroups={parentGroups}
        teams={deptTeams.map(t => ({ id: t.id, name: t.name }))}
        selectedWeek={week}
        selectedYear={year}
        onRulesSaved={() => {
          // Reload rule config after saving
          const sessionToken = getManagerSessionToken();
          if (sessionToken && selectedDepartment) {
            supabase.functions.invoke("admin-operations", {
              body: {
                action: "getScheduleRules",
                sessionToken,
                data: { departmentId: selectedDepartment },
              },
            }).then(({ data }) => {
              if (data?.success && data.ruleConfig) {
                setRuleConfig(data.ruleConfig);
              }
            });
          }
        }}
        onApplyGenerated={(weekNumber, yearNum, generatedSchedule) => {
          // Navigate to the target week and apply the generated schedule
          setYear(yearNum);
          setWeek(weekNumber);
          setSchedule(generatedSchedule);
          setDirty(true);
        }}
      />

      {/* AI Chat Panel */}
      <ScheduleAIChatPanel
        open={aiChatOpen}
        onOpenChange={setAiChatOpen}
        departmentId={selectedDepartment}
        departmentName={departments.find(d => d.id === selectedDepartment)?.name || ""}
        teams={deptTeams.map(t => ({ id: t.id, name: t.name }))}
        shifts={departmentShifts}
        selectedWeek={week}
        selectedYear={year}
        currentSchedule={schedule}
        onApplyGenerated={(weekNumber, yearNum, generatedSchedule) => {
          setYear(yearNum);
          setWeek(weekNumber);
          setSchedule(generatedSchedule as ScheduleState);
          setDirty(true);
        }}
        onSaveWeek={async (weekNumber, yearNum, generatedSchedule) => {
          const sessionToken = getManagerSessionToken();
          if (!sessionToken) {
            console.error("AI Apply: No session token found");
            toast.error("Sesión no válida. Inicia sesión de nuevo.");
            return false;
          }
          try {
            const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
              body: {
                action: "upsertWeeklySchedule",
                sessionToken,
                data: {
                  departmentId: selectedDepartment,
                  year: yearNum,
                  weekNumber,
                  configuration: generatedSchedule,
                  notes: null,
                  copyShiftsFrom: { sourceYear: year, sourceWeek: week },
                },
              },
            });
            if (error || !resp?.success) {
              console.error("AI Apply save error:", error, resp);
              return false;
            }
            return true;
          } catch (e) {
            console.error("AI Apply exception:", e);
            return false;
          }
        }}
      />

      {/* Per-day announcement editor */}
      <Dialog
        open={!!announcementDialogDay}
        onOpenChange={(open) => {
          if (!open) {
            setAnnouncementDialogDay(null);
            setAnnouncementDraft("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-amber-500" />
              Aviso del día — {announcementDialogDay ? DAYS.find((d) => d.key === announcementDialogDay)?.full : ""}
            </DialogTitle>
            <DialogDescription>
              Si añades un mensaje, este día <strong>no mostrará ningún equipo</strong>: solo aparecerá tu aviso, tanto en la pantalla como en el PDF descargado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="announcement-text" className="text-sm">Mensaje para mostrar</Label>
            <Textarea
              id="announcement-text"
              placeholder="Ej: Os informaremos próximamente del equipo que trabaja este día."
              value={announcementDraft}
              onChange={(e) => setAnnouncementDraft(e.target.value)}
              rows={4}
              maxLength={280}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">{announcementDraft.length}/280</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {announcementDialogDay && dayAnnouncements[announcementDialogDay] && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (!announcementDialogDay) return;
                  setDayAnnouncements((prev) => {
                    const next = { ...prev };
                    delete next[announcementDialogDay];
                    return next;
                  });
                  setDirty(true);
                  setAnnouncementDialogDay(null);
                  setAnnouncementDraft("");
                  toast.success("Aviso eliminado");
                }}
              >
                Quitar aviso
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setAnnouncementDialogDay(null);
                setAnnouncementDraft("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!announcementDialogDay) return;
                const trimmed = announcementDraft.trim();
                setDayAnnouncements((prev) => {
                  const next = { ...prev };
                  if (trimmed) {
                    next[announcementDialogDay] = trimmed;
                  } else {
                    delete next[announcementDialogDay];
                  }
                  return next;
                });
                setDirty(true);
                setAnnouncementDialogDay(null);
                setAnnouncementDraft("");
                toast.success(trimmed ? "Aviso guardado" : "Aviso eliminado");
              }}
            >
              Guardar aviso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmNavOpen} onOpenChange={setConfirmNavOpen}>
        <DialogContent className="sm:max-w-md bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-5 w-5 text-primary" />
              Cambios sin guardar
            </DialogTitle>
            <DialogDescription>
              Tienes cambios sin guardar en el horario actual. ¿Qué deseas hacer?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex-col sm:flex-row gap-3 pt-4">
            <Button 
              variant="ghost" 
              onClick={cancelNavigation} 
              className="sm:flex-1 border-0"
            >
              Cancelar
            </Button>
            <Button 
              variant="outline" 
              onClick={() => confirmNavigation(false)} 
              className="sm:flex-1 border-muted-foreground/30 hover:bg-muted"
            >
              Descartar cambios
            </Button>
            <Button 
              onClick={() => confirmNavigation(true)} 
              className="sm:flex-1"
            >
              <Save className="h-4 w-4 mr-2" />
              Guardar y continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Historial de versiones
            </DialogTitle>
            <DialogDescription>
              Selecciona una versión anterior para restaurarla. Los cambios no se guardarán hasta que pulses "Guardar".
            </DialogDescription>
          </DialogHeader>

          {/* Filter toggle */}
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Switch
                id="history-only-managers"
                checked={historyOnlyManagers}
                onCheckedChange={setHistoryOnlyManagers}
              />
              <Label htmlFor="history-only-managers" className="text-sm cursor-pointer">
                Solo cambios de encargados
              </Label>
            </div>
            {historyOnlyManagers && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/50">
                Mostrando solo encargados
              </Badge>
            )}
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (() => {
            const filteredVersions = historyOnlyManagers
              ? scheduleVersions.filter(v => v.notes?.startsWith("[Encargado]"))
              : scheduleVersions;
            
            return filteredVersions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {historyOnlyManagers 
                  ? "No hay cambios de encargados en esta semana"
                  : "No hay versiones anteriores guardadas"
                }
              </div>
            ) : (
              <ScrollArea className="max-h-[450px] pr-4">
                <div className="space-y-3">
                  {filteredVersions.map((version, idx) => {
                    const isManagerChange = version.notes?.startsWith("[Encargado]");
                    const cleanNotes = version.notes?.replace("[Encargado] ", "") || null;
                    
                    return (
                      <div
                        key={version.id}
                        className={`p-3 rounded-lg border transition-colors ${
                          isManagerChange 
                            ? "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10" 
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">
                                {new Date(version.created_at).toLocaleDateString("es-ES", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {idx === 0 && !historyOnlyManagers && (
                                <Badge variant="secondary" className="text-xs">
                                  Última
                                </Badge>
                              )}
                              {isManagerChange && (
                                <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/50 bg-amber-500/10">
                                  Encargado
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              por {version.created_by}
                            </span>
                            
                            {/* Show changes details */}
                            {cleanNotes && (
                              <div className="mt-2 p-2 rounded bg-muted/50 border border-border/50">
                                <p className="text-xs text-muted-foreground font-medium mb-1">Cambios:</p>
                                <div className="text-xs text-foreground space-y-0.5">
                                  {cleanNotes.split("; ").map((change, i) => (
                                    <p key={i} className="flex items-start gap-1">
                                      <span className="text-muted-foreground">•</span>
                                      <span>{change}</span>
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => restoreVersion(version)}
                            className="flex-shrink-0"
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Restaurar
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Theme Selection Dialog */}
      <Dialog open={showPdfThemeDialog} onOpenChange={setShowPdfThemeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Descargar horario
            </DialogTitle>
            <DialogDescription>
              Elige el modo de color para el PDF
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <button
              onClick={() => confirmPdfDownload("light", rememberPdfTheme)}
              className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-colors bg-white text-neutral-900 ${pdfTheme === "light" ? "border-primary" : "border-border hover:border-primary"}`}
            >
              <Sun className="h-8 w-8 text-amber-500" />
              <span className="font-medium text-sm">Modo claro</span>
            </button>
            <button
              onClick={() => confirmPdfDownload("dark", rememberPdfTheme)}
              className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-colors bg-neutral-900 text-white ${pdfTheme === "dark" ? "border-primary" : "border-border hover:border-primary"}`}
            >
              <Moon className="h-8 w-8 text-blue-400" />
              <span className="font-medium text-sm">Modo oscuro</span>
            </button>
          </div>
          
          <div className="space-y-3 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <Label htmlFor="show-labels-pdf" className="text-sm font-medium cursor-pointer">
                  Mostrar leyendas inferiores
                </Label>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                  Oculta la leyenda inferior del PDF (grupos y lugares · funciones). Las etiquetas bajo cada equipo siempre se muestran.
                </p>
              </div>
              <Switch
                id="show-labels-pdf"
                checked={showLabelsInPdf}
                onCheckedChange={(checked) => {
                  setShowLabelsInPdf(checked);
                  localStorage.setItem("pdf_show_labels", String(checked));
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-theme"
                  checked={rememberPdfTheme}
                  onCheckedChange={(checked) => setRememberPdfTheme(!!checked)}
                />
                <Label htmlFor="remember-theme" className="text-sm text-muted-foreground cursor-pointer">
                  Recordar mi elección de tema
                </Label>
              </div>
              {localStorage.getItem("pdf_theme_preference") && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs h-7 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    clearPdfThemePreference();
                    setRememberPdfTheme(false);
                  }}
                >
                  Olvidar preferencia
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPdfThemeDialog(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bidirectional Sync Dialog */}
      <Dialog open={!!pendingSyncDialog} onOpenChange={(open) => !open && setPendingSyncDialog(null)}>
        <DialogContent className="sm:max-w-md bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-amber-500" />
              Sincronizar con calendario anual
            </DialogTitle>
            <DialogDescription>
              Este día ({pendingSyncDialog?.dateStr}) tiene vacaciones asignadas en el calendario anual
              {pendingSyncDialog?.affectedGroups && pendingSyncDialog.affectedGroups.length > 0 && (
                <span className="font-medium"> para {pendingSyncDialog.affectedGroups.join(', ')}</span>
              )}.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                ¿Deseas también eliminar las vacaciones del calendario anual para este día?
              </p>
            </div>
            
            <div className="text-xs text-muted-foreground">
              <p>• <strong>Solo horario:</strong> El cambio solo afectará a esta semana</p>
              <p>• <strong>Sincronizar:</strong> Se eliminará también del calendario anual</p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPendingSyncDialog(null)}>
              Cancelar
            </Button>
            <Button 
              variant="secondary"
              onClick={() => {
                if (!pendingSyncDialog) return;
                // Apply only to schedule (no sync)
                const { dayKey, teamId, parentGroup, newType } = pendingSyncDialog;
                const times = getShiftTimes(newType);
                
                if (parentGroup) {
                  // Apply to group
                  const teamsInGroup = groupedTeams[parentGroup] || [];
                  setSchedule((prev) => {
                    const newSchedule = { ...prev };
                    if (!newSchedule[dayKey]) newSchedule[dayKey] = {};
                    for (const team of teamsInGroup) {
                      newSchedule[dayKey] = {
                        ...newSchedule[dayKey],
                        [team.id]: { type: newType, start: times.start, end: times.end },
                      };
                    }
                    return newSchedule;
                  });
                } else if (teamId) {
                  // Apply to single team
                  setSchedule((prev) => ({
                    ...prev,
                    [dayKey]: {
                      ...(prev[dayKey] || {}),
                      [teamId]: { type: newType, start: times.start, end: times.end },
                    },
                  }));
                }
                
                setDirty(true);
                setPendingSyncDialog(null);
                toast.success("Turno actualizado (solo en horario semanal)");
              }}
            >
              Solo horario
            </Button>
            <Button 
              onClick={async () => {
                if (!pendingSyncDialog) return;
                const { dayKey, teamId, parentGroup, newType, dateStr } = pendingSyncDialog;
                
                // Apply to schedule first
                const times = getShiftTimes(newType);
                
                if (parentGroup) {
                  const teamsInGroup = groupedTeams[parentGroup] || [];
                  setSchedule((prev) => {
                    const newSchedule = { ...prev };
                    if (!newSchedule[dayKey]) newSchedule[dayKey] = {};
                    for (const team of teamsInGroup) {
                      newSchedule[dayKey] = {
                        ...newSchedule[dayKey],
                        [team.id]: { type: newType, start: times.start, end: times.end },
                      };
                    }
                    return newSchedule;
                  });
                } else if (teamId) {
                  setSchedule((prev) => ({
                    ...prev,
                    [dayKey]: {
                      ...(prev[dayKey] || {}),
                      [teamId]: { type: newType, start: times.start, end: times.end },
                    },
                  }));
                }
                
                setDirty(true);
                
                // Try to sync with annual calendar
                try {
                  const sessionToken = getManagerSessionToken();
                  if (sessionToken) {
                    const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
                      body: {
                        action: "removeVacationFromCalendar",
                        sessionToken,
                        data: {
                          departmentId: selectedDepartment,
                          date: dateStr,
                          year,
                        },
                      },
                    });
                    
                    if (error || !resp?.success) {
                      console.error("Error syncing with calendar:", resp?.error || error);
                      toast.warning("Turno actualizado, pero no se pudo sincronizar con el calendario anual");
                    } else {
                      // Update local vacation map
                      setVacationMap((prev) => {
                        const newMap = { ...prev };
                        if (newMap[dayKey]) {
                          newMap[dayKey] = new Set();
                        }
                        return newMap;
                      });
                      toast.success("Turno y calendario anual sincronizados");
                    }
                  }
                } catch (e) {
                  console.error("Error syncing:", e);
                  toast.warning("Turno actualizado, pero hubo un error al sincronizar");
                }
                
                setPendingSyncDialog(null);
              }}
            >
              <CalendarDays className="h-4 w-4 mr-2" />
              Sincronizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Personal Schedules Dialog */}
      <Dialog open={personalSchedulesOpen} onOpenChange={setPersonalSchedulesOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Horarios Personalizados
            </DialogTitle>
            <DialogDescription>
              Configura horarios individuales para trabajadores específicos con rotación automática
            </DialogDescription>
          </DialogHeader>
          {selectedDepartment && (
            <PersonalSchedulesPanel
              departmentId={selectedDepartment}
              departmentName={departments.find(d => d.id === selectedDepartment)?.name || ""}
              shifts={departmentShifts}
              onClose={() => setPersonalSchedulesOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
       
       {/* Personal Annual Calendars Panel */}
       <PersonalAnnualCalendarsPanel
         isOpen={personalAnnualCalendarsOpen}
         onClose={() => setPersonalAnnualCalendarsOpen(false)}
         departments={departments}
       />
       
       {/* Copy Week Dialog */}
       <Dialog open={copyWeekDialogOpen} onOpenChange={setCopyWeekDialogOpen}>
         <DialogContent className="max-w-md">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <Copy className="h-5 w-5" />
               Copiar Horario a Otra Semana
             </DialogTitle>
             <DialogDescription>
               Copia el horario de la semana {week} ({year}) a otra semana del mismo departamento
             </DialogDescription>
           </DialogHeader>
           
           <div className="space-y-4 py-4">
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                 <Label htmlFor="target-week">Semana destino</Label>
                 <Select
                   value={String(copyTargetWeek)}
                   onValueChange={(v) => setCopyTargetWeek(Number(v))}
                 >
                   <SelectTrigger id="target-week">
                     <SelectValue placeholder="Semana" />
                   </SelectTrigger>
                   <SelectContent>
                     {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
                       <SelectItem 
                         key={w} 
                         value={String(w)}
                         disabled={w === week && copyTargetYear === year}
                       >
                         Semana {w}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
               
               <div className="space-y-2">
                 <Label htmlFor="target-year">Año</Label>
                 <Select
                   value={String(copyTargetYear)}
                   onValueChange={(v) => setCopyTargetYear(Number(v))}
                 >
                   <SelectTrigger id="target-year">
                     <SelectValue placeholder="Año" />
                   </SelectTrigger>
                   <SelectContent>
                     {[year - 1, year, year + 1].map((y) => (
                       <SelectItem key={y} value={String(y)}>
                         {y}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
             </div>
             
              <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                <p>Se copiará:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Configuración de turnos</li>
                  <li>Horarios de entrada/salida</li>
                </ul>
                {departments.find(d => d.id === selectedDepartment)?.schedule_auto_rotate_teams && parentGroups.length > 1 && (
                  <p className="mt-2 text-blue-600 dark:text-blue-400">
                    🔄 Auto-rotación activa: el orden de los grupos se rotará automáticamente al copiar.
                  </p>
                )}
                <p className="mt-2 text-amber-600 dark:text-amber-400">
                  ⚠️ Si ya existe un horario en la semana destino, será sobrescrito.
                </p>
              </div>
           </div>
           
           <DialogFooter>
             <Button variant="outline" onClick={() => setCopyWeekDialogOpen(false)} disabled={isCopying}>
               Cancelar
             </Button>
             <Button onClick={() => copyWeekToTarget()} disabled={isCopying || (copyTargetWeek === week && copyTargetYear === year)}>
               {isCopying ? (
                 <>
                   <div className="h-4 w-4 mr-2 rounded-full border-2 border-current border-t-transparent animate-spin" />
                   Copiando...
                 </>
               ) : (
                 <>
                   <Copy className="h-4 w-4 mr-2" />
                   Copiar a Semana {copyTargetWeek}
                 </>
               )}
             </Button>
           </DialogFooter>
          </DialogContent>
       </Dialog>
       
       {/* Rotation Confirmation Dialog */}
       <Dialog open={rotationConfirmOpen} onOpenChange={setRotationConfirmOpen}>
         <DialogContent className="max-w-md">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               🔄 Rotación Automática de Equipos
             </DialogTitle>
             <DialogDescription>
               El orden de los grupos cambiará automáticamente al copiar el horario a Semana {copyTargetWeek}/{copyTargetYear}
             </DialogDescription>
           </DialogHeader>
           
           <div className="space-y-3 py-2">
             <p className="text-sm font-medium">Nuevo orden de grupos:</p>
             <div className="space-y-1">
               {getRotatedGroupsPreview().map((name, i) => (
                 <div key={i} className="flex items-center gap-2 text-sm rounded-md bg-muted px-3 py-1.5">
                   <span className="font-bold text-primary">{i + 1}º</span>
                   <span>{name}</span>
                   {i === 0 && <Badge variant="secondary" className="text-xs ml-auto">↑ Sube</Badge>}
                 </div>
               ))}
             </div>
           </div>
           
           <DialogFooter className="gap-2 sm:gap-0">
             <Button variant="outline" onClick={() => { setRotationConfirmOpen(false); }} disabled={isCopying}>
               Cancelar
             </Button>
             <Button variant="outline" onClick={() => { setRotationConfirmOpen(false); copyWeekToTarget(true); }} disabled={isCopying}>
               Copiar sin rotar
             </Button>
             <Button onClick={confirmRotationAndCopy} disabled={isCopying}>
               {isCopying ? "Rotando..." : "Rotar y Copiar"}
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

       {/* Worker Summary Dialog for WhatsApp */}
       <Dialog open={summaryDialogOpen} onOpenChange={setSummaryDialogOpen}>
         <DialogContent className="max-w-lg max-h-[80vh]">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <MessageSquare className="h-5 w-5 text-primary" />
               Resumen para WhatsApp
             </DialogTitle>
             <DialogDescription>
               Copia este resumen y envíalo al encargado para confirmar el horario
             </DialogDescription>
           </DialogHeader>
           
           <ScrollArea className="max-h-[50vh]">
             <pre className="text-sm whitespace-pre-wrap bg-muted/50 p-4 rounded-lg font-sans leading-relaxed">
               {generatedSummary}
             </pre>
           </ScrollArea>
           
           <DialogFooter className="gap-2 sm:gap-0">
             <Button variant="outline" onClick={() => setSummaryDialogOpen(false)}>
               Cerrar
             </Button>
             <Button onClick={copySummaryToClipboard}>
               <Copy className="h-4 w-4 mr-2" />
               Copiar al Portapapeles
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

       {/* Labels manager dialog */}
       <Dialog open={labelsManagerOpen} onOpenChange={setLabelsManagerOpen}>
         <DialogContent className="max-w-lg">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <Tag className="h-4 w-4 text-primary" />
               Etiquetas de equipos
             </DialogTitle>
             <DialogDescription>
               Crea etiquetas (lugar de trabajo, función…) y asígnalas o rótalas entre los equipos. Aparecerán en el PDF semanal.
             </DialogDescription>
           </DialogHeader>
            <LabelManagerBody
              labels={teamLabels}
              shifts={departmentShifts.filter(s => !s.is_rest).map(s => ({ shift_key: s.shift_key, name: s.name, color: s.color, is_rest: s.is_rest }))}
              onCreate={handleCreateLabel}
              onUpdate={handleUpdateLabel}
              onDelete={handleDeleteLabel}
              saving={savingLabel}
            />
           <DialogFooter>
             <Button variant="outline" onClick={() => setLabelsManagerOpen(false)}>Cerrar</Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
    </>
  );
};
