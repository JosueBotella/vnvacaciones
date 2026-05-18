import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { 
  Settings2, 
  RefreshCcw, 
  Users, 
  Sun, 
  Moon, 
  Calendar, 
  ArrowRightLeft,
  Info,
  Eye,
  Sparkles,
  ChevronRight,
  GripVertical,
  Save,
  CalendarDays,
  Target
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Types
export interface ScheduleRuleConfig {
  // Rotación de grupos padre (A→B→C)
  groupRotation?: {
    enabled: boolean;
    groups: string[]; // ["A", "B", "C"]
    cycleDays?: string[]; // Days affected, e.g., ["4", "5"] for Thu/Fri
  };
  // Rotación interna de subgrupos con patrón de guardia (para Sacado H)
  subgroupRotation?: {
    enabled: boolean;
    // Patrón de guardia: un subgrupo trabaja un día, los demás otro día
    guardPattern: {
      singleGuardDay: string;       // Día donde va UN subgrupo (ej: "4" = Jueves)
      multiGuardDay: string;        // Día donde van los DEMÁS subgrupos (ej: "5" = Viernes)
      subgroupOrder: number[];      // Orden de rotación interna [4, 1, 2, 3] para A4->A1->A2->A3
    };
    // Semana base para calcular el ciclo (ej: semana 3 = inicio del ciclo)
    baseWeek: number;
    baseYear: number;
  };
  // Alternancia de turnos
  shiftAlternation?: {
    enabled: boolean;
    pattern: "weekly" | "daily"; // Weekly: group A morning week 1, afternoon week 2
    groups: { group: string; startShift: "morning" | "afternoon" }[];
  };
  // Días de descanso fijos
  restDays?: {
    enabled: boolean;
    days: string[]; // ["5", "6"] for Friday/Saturday
  };
  // Guardias especiales (deprecated - use subgroupRotation.guardPattern instead)
  guardDuty?: {
    enabled: boolean;
    day: string;
    subgroups: string[];
    shift: "morning" | "afternoon";
    rotates: boolean;
  };
  // === NUEVO: Guardia flexible (para Encajado H) ===
  // Permite configurar cuántos equipos van de guardia simultáneamente
  flexibleGuard?: {
    enabled: boolean;
    teamsPerGuard: number;        // Cuántos equipos van de guardia (ej: 2 = A1+A2)
    restDay: string;              // Día de descanso para equipos de guardia (ej: "4" = Jueves)
    guardDay: string;             // Día de guardia (ej: "5" = Viernes)
    teamOrder: string[];          // Orden completo de rotación ["A1", "A2", "A3", "A4", "B1"...]
    baseWeek: number;
    baseYear: number;
  };
  // === NUEVO: Turno de tarde rotativo ===
  // Para rotar qué equipos trabajan en turno de tarde
  afternoonRotation?: {
    enabled: boolean;
    teamsPerAfternoon: number;    // Cuántos equipos van de tarde (ej: 1)
    applicableDays: string[];     // Días donde aplica (ej: ["1","2","3","4"] = L-M-X-J)
    teamOrder: string[];          // Orden de rotación para tarde
    baseWeek: number;
    baseYear: number;
  };
}

export interface ScheduleRule {
  id: string;
  department_id: string;
  rule_type: string;
  rule_config: ScheduleRuleConfig;
  is_active: boolean;
  sort_order: number;
}

type ScheduleType = "morning" | "afternoon" | "night" | "rest";
type PreviewSchedule = Record<string, Record<string, { type: ScheduleType; start: string | null; end: string | null }>>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  departmentName: string;
  parentGroups: string[];
  teams: { id: string; name: string }[];
  onRulesSaved: () => void;
  onApplyGenerated?: (weekNumber: number, year: number, schedule: PreviewSchedule) => void;
  // The currently selected week/year in LaborSchedulesTab, used to anchor the preview
  selectedWeek?: number;
  selectedYear?: number;
}

// Helper to extract parent group from team name (e.g., "A1" -> "A")
const getParentGroup = (teamName: string): string => {
  const match = teamName.match(/^([A-Za-z]+)/);
  return match ? match[1].toUpperCase() : teamName;
};

// Helper to extract subgroup number from team name (e.g., "A1" -> 1, "A4" -> 4)
const getSubgroupNumber = (teamName: string): number => {
  const match = teamName.match(/(\d+)$/);
  return match ? parseInt(match[1]) : 0;
};

const DAYS = [
  { key: "1", short: "L", full: "Lunes" },
  { key: "2", short: "M", full: "Martes" },
  { key: "3", short: "X", full: "Miércoles" },
  { key: "4", short: "J", full: "Jueves" },
  { key: "5", short: "V", full: "Viernes" },
  { key: "6", short: "S", full: "Sábado" },
  { key: "0", short: "D", full: "Domingo" },
] as const;

const DAYS_MAP: Record<string, string> = {
  "0": "Domingo",
  "1": "Lunes",
  "2": "Martes",
  "3": "Miércoles",
  "4": "Jueves",
  "5": "Viernes",
  "6": "Sábado",
};

const DEFAULT_TIMES: Record<ScheduleType, { start: string | null; end: string | null }> = {
  morning: { start: "08:00", end: null },
  afternoon: { start: "14:00", end: "22:00" },
  night: { start: "22:00", end: "06:00" },
  rest: { start: null, end: null },
};

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ISO week start (Monday) for a given ISO week-year + week number.
// This avoids assuming 52 weeks/year (some years have 53) and fixes cross-year offsets.
function isoWeekStart(isoYear: number, isoWeek: number): Date {
  // ISO week 1 is the week with Jan 4th in it.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1..7 (Mon..Sun)
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + (isoWeek - 1) * 7);
  return monday;
}

function weeksBetweenIsoWeeks(
  base: { year: number; week: number },
  target: { year: number; week: number }
): number {
  const baseStart = isoWeekStart(base.year, base.week).getTime();
  const targetStart = isoWeekStart(target.year, target.week).getTime();
  return Math.round((targetStart - baseStart) / (7 * 24 * 60 * 60 * 1000));
}

function weekRange(year: number, week: number): { start: Date; end: Date } {
  const startDate = isoWeekStart(year, week);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  return { start: new Date(startDate), end: new Date(endDate) };
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export const ScheduleRulesPanel = ({ 
  open, 
  onOpenChange, 
  departmentId, 
  departmentName,
  parentGroups,
  teams,
  onRulesSaved,
  onApplyGenerated,
  selectedWeek: propSelectedWeek,
  selectedYear: propSelectedYear,
}: Props) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"rules" | "preview">("rules");
  
  const currentWeek = getWeekNumber(new Date());
  const currentYear = new Date().getFullYear();
  
  // Use prop values for initialization if provided
  const initialBaseWeek = propSelectedWeek ?? currentWeek;
  const initialBaseYear = propSelectedYear ?? currentYear;
  
  // Rule configuration state
  const [config, setConfig] = useState<ScheduleRuleConfig>({
    groupRotation: {
      enabled: false,
      groups: [],
      cycleDays: ["4", "5"],
    },
    subgroupRotation: {
      enabled: false,
      guardPattern: {
        singleGuardDay: "4", // Jueves
        multiGuardDay: "5",  // Viernes
        subgroupOrder: [4, 1, 2, 3], // Default rotation order
      },
      baseWeek: initialBaseWeek,
      baseYear: initialBaseYear,
    },
    shiftAlternation: {
      enabled: false,
      pattern: "weekly",
      groups: [],
    },
    restDays: {
      enabled: true,
      days: ["5", "6"],
    },
    guardDuty: {
      enabled: false,
      day: "4",
      subgroups: [],
      shift: "afternoon",
      rotates: true,
    },
    // Nueva configuración para guardia flexible (Encajado H)
    flexibleGuard: {
      enabled: false,
      teamsPerGuard: 2,
      restDay: "4",   // Jueves descanso
      guardDay: "5",  // Viernes guardia
      teamOrder: [],
      baseWeek: initialBaseWeek,
      baseYear: initialBaseYear,
    },
    // Nueva configuración para turno de tarde rotativo
    afternoonRotation: {
      enabled: false,
      teamsPerAfternoon: 1,
      applicableDays: ["1", "2", "3", "4"], // L-M-X-J
      teamOrder: [],
      baseWeek: initialBaseWeek,
      baseYear: initialBaseYear,
    },
  });

  // Group teams by parent
  const groupedTeams = useMemo(() => {
    return teams.reduce((acc, team) => {
      const parent = getParentGroup(team.name);
      if (!acc[parent]) acc[parent] = [];
      acc[parent].push(team);
      return acc;
    }, {} as Record<string, typeof teams>);
  }, [teams]);

  // Get all unique subgroup numbers across all teams
  const allSubgroupNumbers = useMemo(() => {
    const numbers = new Set<number>();
    teams.forEach(t => {
      const num = getSubgroupNumber(t.name);
      if (num > 0) numbers.add(num);
    });
    return Array.from(numbers).sort((a, b) => a - b);
  }, [teams]);
  
  // Use prop values or fall back to current
  const anchorWeek = propSelectedWeek ?? currentWeek;
  const anchorYear = propSelectedYear ?? currentYear;

  // Generate preview weeks starting from the selected week (4 consecutive weeks)
  const previewWeeks = useMemo(() => {
    const weeks: { week: number; year: number; range: { start: Date; end: Date } }[] = [];
    
    // Start from the selected/anchor week and generate 4 consecutive weeks
    const startDate = isoWeekStart(anchorYear, anchorWeek);
    
    for (let i = 0; i < 4; i++) {
      const weekDate = new Date(startDate);
      weekDate.setDate(weekDate.getDate() + i * 7);
      
      const weekNum = getWeekNumber(weekDate);
      // Get the ISO year for this week (handles year transitions)
      const yearNum = weekDate.getFullYear();
      
      weeks.push({ 
        week: weekNum, 
        year: yearNum, 
        range: weekRange(yearNum, weekNum) 
      });
    }
    
    return weeks;
  }, [anchorWeek, anchorYear]);

  // Generate schedule based on rules - ENHANCED ALGORITHM
  const generateSchedule = (weekNum: number, year: number): PreviewSchedule => {
    const schedule: PreviewSchedule = {};
    
    // Initialize with defaults
    for (const day of DAYS) {
      schedule[day.key] = {};
      for (const team of teams) {
        // Apply rest days rule
        const isRestDay = config.restDays?.enabled && config.restDays.days.includes(day.key);
        const defaultType: ScheduleType = isRestDay ? "rest" : "morning";
        
        schedule[day.key][team.id] = {
          type: defaultType,
          start: DEFAULT_TIMES[defaultType].start,
          end: DEFAULT_TIMES[defaultType].end,
        };
      }
    }
    
    // Apply shift alternation (for normal days)
    if (config.shiftAlternation?.enabled) {
      const isEvenWeek = weekNum % 2 === 0;
      
      for (const day of DAYS) {
        if (config.restDays?.enabled && config.restDays.days.includes(day.key)) continue;
        
        for (const team of teams) {
          const parentGroup = getParentGroup(team.name);
          const groupConfig = config.shiftAlternation.groups.find(g => g.group === parentGroup);
          
          if (groupConfig) {
            let shift: ScheduleType;
            
            if (config.shiftAlternation.pattern === "weekly") {
              const baseIsMorning = groupConfig.startShift === "morning";
              shift = (baseIsMorning ? !isEvenWeek : isEvenWeek) ? "morning" : "afternoon";
            } else {
              const dayIndex = parseInt(day.key);
              const baseIsMorning = groupConfig.startShift === "morning";
              shift = ((dayIndex % 2 === 0) === baseIsMorning) ? "morning" : "afternoon";
            }
            
            schedule[day.key][team.id] = {
              type: shift,
              start: DEFAULT_TIMES[shift].start,
              end: DEFAULT_TIMES[shift].end,
            };
          }
        }
      }
    }
    
    // ADVANCED: Apply group + subgroup rotation with guard pattern
    if (config.groupRotation?.enabled && config.subgroupRotation?.enabled && 
        config.groupRotation.groups.length > 0) {
      
      const parentGroupsList = config.groupRotation.groups; // ["A", "B", "C"]
      const parentCycle = parentGroupsList.length; // 3 semanas para un ciclo completo de grupos
      
      const guardPattern = config.subgroupRotation.guardPattern;
      const subgroupOrder = guardPattern.subgroupOrder; // [4, 1, 2, 3]
      const singleGuardDay = guardPattern.singleGuardDay; // "4" (Jueves)
      const multiGuardDay = guardPattern.multiGuardDay;   // "5" (Viernes)
      
      // Calculate week offset from base week (ISO-week aware, supports 52/53 week years)
      const baseWeek = config.subgroupRotation.baseWeek || 1;
      const baseYear = config.subgroupRotation.baseYear || year;

      let weekOffset = weeksBetweenIsoWeeks(
        { year: baseYear, week: baseWeek },
        { year, week: weekNum }
      );

      // Ensure non-negative offset
      if (weekOffset < 0) weekOffset = 0;
      
      // Calculate which parent group is active this week (A, B, C rotation)
      const parentIndex = weekOffset % parentCycle;
      const activeParentGroup = parentGroupsList[parentIndex];
      
      // Calculate which subgroup has single guard duty this week
      // The subgroup rotates every complete parent cycle (every 3 weeks)
      const subgroupCycle = Math.floor(weekOffset / parentCycle) % subgroupOrder.length;
      const singleGuardSubgroupNum = subgroupOrder[subgroupCycle];
      
      // Apply the guard pattern to the schedule
      // NEW LOGIC:
      // - Single Guard Day (Thursday): Active group's single subgroup works, rest of active group rests, OTHER groups ALL work
      // - Multi Guard Day (Friday): Active group's multi subgroups work, single subgroup rests, OTHER groups ALL rest
      
      for (const team of teams) {
        const teamParentGroup = getParentGroup(team.name);
        const teamSubgroupNum = getSubgroupNumber(team.name);
        
        if (teamParentGroup === activeParentGroup) {
          // This is the ACTIVE GUARD GROUP
          if (teamSubgroupNum === singleGuardSubgroupNum) {
            // This is the single guard subgroup (e.g., B4)
            // Works Thursday (single guard day), Rests Friday (multi guard day)
            schedule[singleGuardDay][team.id] = {
              type: "morning",
              start: DEFAULT_TIMES.morning.start,
              end: DEFAULT_TIMES.morning.end,
            };
            schedule[multiGuardDay][team.id] = {
              type: "rest",
              start: null,
              end: null,
            };
          } else {
            // Other subgroups of active group (e.g., B1, B2, B3)
            // Rest Thursday, Work Friday
            schedule[singleGuardDay][team.id] = {
              type: "rest",
              start: null,
              end: null,
            };
            schedule[multiGuardDay][team.id] = {
              type: "morning",
              start: DEFAULT_TIMES.morning.start,
              end: DEFAULT_TIMES.morning.end,
            };
          }
        } else {
          // This is NOT the active guard group (e.g., A or C when B has guard)
          // ALL work Thursday, ALL rest Friday
          schedule[singleGuardDay][team.id] = {
            type: "morning",
            start: DEFAULT_TIMES.morning.start,
            end: DEFAULT_TIMES.morning.end,
          };
          schedule[multiGuardDay][team.id] = {
            type: "rest",
            start: null,
            end: null,
          };
        }
      }
    } else if (config.groupRotation?.enabled && config.groupRotation.groups.length > 0) {
      // Simple group rotation without subgroup rotation (legacy behavior)
      const rotationIndex = (weekNum - 1) % config.groupRotation.groups.length;
      const activeGroup = config.groupRotation.groups[rotationIndex];
      
      for (const dayKey of config.groupRotation.cycleDays || []) {
        for (const team of teams) {
          const parentGroup = getParentGroup(team.name);
          
          if (parentGroup !== activeGroup) {
            schedule[dayKey][team.id] = {
              type: "rest",
              start: null,
              end: null,
            };
          }
        }
      }
    }
    
    // Apply legacy guard duty (if subgroupRotation is not enabled)
    if (config.guardDuty?.enabled && !config.subgroupRotation?.enabled && !config.flexibleGuard?.enabled) {
      const guardDay = config.guardDuty.day;
      const subgroupsWithGuard = config.guardDuty.rotates 
        ? [config.guardDuty.subgroups[(weekNum - 1) % config.guardDuty.subgroups.length]]
        : config.guardDuty.subgroups;
      
      for (const team of teams) {
        if (subgroupsWithGuard.includes(team.name)) {
          schedule[guardDay][team.id] = {
            type: config.guardDuty.shift === "morning" ? "morning" : "afternoon",
            start: DEFAULT_TIMES[config.guardDuty.shift].start,
            end: DEFAULT_TIMES[config.guardDuty.shift].end,
          };
        }
      }
    }
    
    // === NUEVO: Guardia Flexible (para Encajado H) ===
    // Varios equipos van de guardia simultáneamente con rotación por grupos de N
    if (config.flexibleGuard?.enabled && config.flexibleGuard.teamOrder.length > 0) {
      const { teamsPerGuard, restDay, guardDay, teamOrder, baseWeek, baseYear } = config.flexibleGuard;
      
      let weekOffset = weeksBetweenIsoWeeks(
        { year: baseYear || year, week: baseWeek || 1 },
        { year, week: weekNum }
      );
      if (weekOffset < 0) weekOffset = 0;
      
      // Calcular qué "grupo" de equipos está de guardia esta semana
      // Si teamsPerGuard=2 y orden=[A1,A2,A3,A4,B1,B2...], semana 0: A1+A2, semana 1: A3+A4, etc.
      const totalTeamGroups = Math.ceil(teamOrder.length / teamsPerGuard);
      const currentGroupIndex = weekOffset % totalTeamGroups;
      const startIndex = currentGroupIndex * teamsPerGuard;
      const guardTeamsThisWeek = teamOrder.slice(startIndex, startIndex + teamsPerGuard);
      
      // Aplicar el patrón: equipos de guardia descansan el restDay, trabajan el guardDay
      // Resto de equipos: trabajan el restDay, descansan el guardDay
      for (const team of teams) {
        const isGuardTeam = guardTeamsThisWeek.includes(team.name);
        
        if (isGuardTeam) {
          // Equipo de guardia: descansa restDay, trabaja guardDay
          schedule[restDay][team.id] = {
            type: "rest",
            start: null,
            end: null,
          };
          schedule[guardDay][team.id] = {
            type: "morning",
            start: DEFAULT_TIMES.morning.start,
            end: DEFAULT_TIMES.morning.end,
          };
        } else {
          // Resto de equipos: trabajan restDay, descansan guardDay
          schedule[restDay][team.id] = {
            type: "morning",
            start: DEFAULT_TIMES.morning.start,
            end: DEFAULT_TIMES.morning.end,
          };
          schedule[guardDay][team.id] = {
            type: "rest",
            start: null,
            end: null,
          };
        }
      }
    }
    
    // === NUEVO: Turno de Tarde Rotativo ===
    // Rotar qué equipos trabajan en turno de tarde
    if (config.afternoonRotation?.enabled && config.afternoonRotation.teamOrder.length > 0) {
      const { teamsPerAfternoon, applicableDays, teamOrder, baseWeek, baseYear } = config.afternoonRotation;
      
      let weekOffset = weeksBetweenIsoWeeks(
        { year: baseYear || year, week: baseWeek || 1 },
        { year, week: weekNum }
      );
      if (weekOffset < 0) weekOffset = 0;
      
      // Calcular qué equipo(s) está(n) de tarde esta semana
      const totalTeamGroups = Math.ceil(teamOrder.length / teamsPerAfternoon);
      const currentGroupIndex = weekOffset % totalTeamGroups;
      const startIndex = currentGroupIndex * teamsPerAfternoon;
      const afternoonTeamsThisWeek = teamOrder.slice(startIndex, startIndex + teamsPerAfternoon);
      
      // Aplicar turno de tarde solo en los días configurados
      for (const dayKey of applicableDays) {
        for (const team of teams) {
          const isAfternoonTeam = afternoonTeamsThisWeek.includes(team.name);
          
          if (isAfternoonTeam) {
            // Si no es día de descanso, poner turno de tarde
            const currentSchedule = schedule[dayKey]?.[team.id];
            if (currentSchedule?.type !== "rest") {
              schedule[dayKey][team.id] = {
                type: "afternoon",
                start: DEFAULT_TIMES.afternoon.start,
                end: DEFAULT_TIMES.afternoon.end,
              };
            }
          }
        }
      }
    }
    
    return schedule;
  };

  // Generate previews for all weeks
  const previewSchedules = useMemo(() => {
    return previewWeeks.map(pw => ({
      ...pw,
      schedule: generateSchedule(pw.week, pw.year),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewWeeks, config, teams]);

  // Calculate preview info for each week
  const getPreviewInfo = (weekNum: number, year: number) => {
    // Para sistema de guardia flexible (Encajado H)
    if (config.flexibleGuard?.enabled && config.flexibleGuard.teamOrder.length > 0) {
      const { teamsPerGuard, restDay, guardDay, teamOrder, baseWeek, baseYear } = config.flexibleGuard;
      
      let weekOffset = weeksBetweenIsoWeeks(
        { year: baseYear || year, week: baseWeek || 1 },
        { year, week: weekNum }
      );
      if (weekOffset < 0) weekOffset = 0;
      
      const totalTeamGroups = Math.ceil(teamOrder.length / teamsPerGuard);
      const currentGroupIndex = weekOffset % totalTeamGroups;
      const startIndex = currentGroupIndex * teamsPerGuard;
      const guardTeamsThisWeek = teamOrder.slice(startIndex, startIndex + teamsPerGuard);
      
      // Info de tarde rotativa
      let afternoonTeamsThisWeek: string[] = [];
      if (config.afternoonRotation?.enabled && config.afternoonRotation.teamOrder.length > 0) {
        const { teamsPerAfternoon, teamOrder: afternoonOrder, baseWeek: afBaseWeek, baseYear: afBaseYear } = config.afternoonRotation;
        
        let afWeekOffset = weeksBetweenIsoWeeks(
          { year: afBaseYear || year, week: afBaseWeek || 1 },
          { year, week: weekNum }
        );
        if (afWeekOffset < 0) afWeekOffset = 0;
        
        const afTotalGroups = Math.ceil(afternoonOrder.length / teamsPerAfternoon);
        const afGroupIndex = afWeekOffset % afTotalGroups;
        const afStartIndex = afGroupIndex * teamsPerAfternoon;
        afternoonTeamsThisWeek = afternoonOrder.slice(afStartIndex, afStartIndex + teamsPerAfternoon);
      }
      
      return {
        type: "flexible" as const,
        guardTeams: guardTeamsThisWeek,
        afternoonTeams: afternoonTeamsThisWeek,
        restDay: DAYS_MAP[restDay],
        guardDay: DAYS_MAP[guardDay],
        isBaseWeek: weekNum === (baseWeek || 1) && year === (baseYear || year),
      };
    }
    
    // Para sistema clásico de subgroupRotation (Sacado H)
    if (!config.groupRotation?.enabled || !config.subgroupRotation?.enabled) {
      return null;
    }
    
    const parentGroupsList = config.groupRotation.groups;
    const parentCycle = parentGroupsList.length;
    const subgroupOrder = config.subgroupRotation.guardPattern.subgroupOrder;
    
    const baseWeek = config.subgroupRotation.baseWeek || 1;
    const baseYear = config.subgroupRotation.baseYear || year;

    let weekOffset = weeksBetweenIsoWeeks(
      { year: baseYear, week: baseWeek },
      { year, week: weekNum }
    );
    if (weekOffset < 0) weekOffset = 0;
    
    const parentIndex = weekOffset % parentCycle;
    const activeParentGroup = parentGroupsList[parentIndex];
    const subgroupCycle = Math.floor(weekOffset / parentCycle) % subgroupOrder.length;
    const singleGuardSubgroupNum = subgroupOrder[subgroupCycle];
    
    // Build summary strings for who works each day
    const otherGroups = parentGroupsList.filter(g => g !== activeParentGroup);
    const otherGroupsStr = otherGroups.length > 0 ? otherGroups.join(" + ") + " completo" : "";
    const multiSubgroups = subgroupOrder.filter(n => n !== singleGuardSubgroupNum).sort((a, b) => a - b);
    const multiSubgroupsStr = multiSubgroups.length > 0 ? `${activeParentGroup}${multiSubgroups.join(`, ${activeParentGroup}`)}` : "";
    
    // Single guard day: The single guard subgroup + all other groups
    const singleDaySummary = `${activeParentGroup}${singleGuardSubgroupNum}${otherGroupsStr ? ` + ${otherGroupsStr}` : ""}`;
    // Multi guard day: The other subgroups of the active group
    const multiDaySummary = multiSubgroupsStr || "Ninguno";
    
    return {
      type: "classic" as const,
      activeParentGroup,
      singleGuardSubgroupNum,
      singleGuardDay: DAYS_MAP[config.subgroupRotation.guardPattern.singleGuardDay],
      multiGuardDay: DAYS_MAP[config.subgroupRotation.guardPattern.multiGuardDay],
      singleDaySummary,
      multiDaySummary,
      isBaseWeek: weekNum === baseWeek && year === baseYear,
    };
  };

  // Set a week as the new base week
  const setBaseWeek = (weekNum: number, yearNum: number) => {
    setConfig(prev => ({
      ...prev,
      subgroupRotation: {
        ...prev.subgroupRotation!,
        baseWeek: weekNum,
        baseYear: yearNum,
      },
    }));
    toast.success(`Semana ${weekNum} establecida como semana base`);
  };

  // Load existing rules
  useEffect(() => {
    if (!open || !departmentId) return;
    
    const loadRules = async () => {
      setLoading(true);
      try {
        const sessionToken = localStorage.getItem("manager_session_token");
        if (!sessionToken) return;

        const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
          body: {
            action: "getScheduleRules",
            sessionToken,
            data: { departmentId },
          },
        });

        if (error || !resp?.success) {
          console.error("Error loading rules:", resp?.error || error);
          return;
        }

        const rules = resp.rules || [];
        if (rules.length > 0) {
          const combinedRule = rules.find((r: ScheduleRule) => r.rule_type === "combined");
          if (combinedRule?.rule_config) {
            setConfig(prev => {
              const savedSubgroupRotation = combinedRule.rule_config.subgroupRotation || {};
              const savedGuardPattern = savedSubgroupRotation.guardPattern || {};
              
              return {
                ...prev,
                ...combinedRule.rule_config,
                // Ensure subgroupRotation has all required fields
                subgroupRotation: {
                  ...prev.subgroupRotation,
                  ...savedSubgroupRotation,
                  // Use saved baseWeek/baseYear if they exist, otherwise keep initial values
                  baseWeek: savedSubgroupRotation.baseWeek ?? prev.subgroupRotation?.baseWeek ?? initialBaseWeek,
                  baseYear: savedSubgroupRotation.baseYear ?? prev.subgroupRotation?.baseYear ?? initialBaseYear,
                  guardPattern: {
                    ...prev.subgroupRotation?.guardPattern,
                    ...savedGuardPattern,
                  },
                },
              };
            });
          }
        }
      } catch (e) {
        console.error("Error loading rules:", e);
      }
      setLoading(false);
    };

    loadRules();
  }, [open, departmentId, initialBaseWeek, initialBaseYear]);

  // Initialize groups from parentGroups
  useEffect(() => {
    if (parentGroups.length > 0) {
      setConfig(prev => ({
        ...prev,
        groupRotation: {
          ...prev.groupRotation!,
          groups: prev.groupRotation?.groups?.length ? prev.groupRotation.groups : [...parentGroups],
        },
        shiftAlternation: {
          ...prev.shiftAlternation!,
          groups: prev.shiftAlternation?.groups?.length 
            ? prev.shiftAlternation.groups 
            : parentGroups.map((g, i) => ({ 
                group: g, 
                startShift: i % 2 === 0 ? "morning" : "afternoon" as "morning" | "afternoon"
              })),
        },
      }));
    }
  }, [parentGroups]);

  // Initialize subgroup order when subgroup numbers change
  useEffect(() => {
    if (allSubgroupNumbers.length > 0) {
      setConfig(prev => {
        const existingOrder = prev.subgroupRotation?.guardPattern?.subgroupOrder || [];
        if (existingOrder.length === 0) {
          // Default order: start with the highest number, then 1, 2, 3...
          const maxNum = Math.max(...allSubgroupNumbers);
          const newOrder = [maxNum, ...allSubgroupNumbers.filter(n => n !== maxNum)];
          return {
            ...prev,
            subgroupRotation: {
              ...prev.subgroupRotation!,
              guardPattern: {
                singleGuardDay: prev.subgroupRotation?.guardPattern?.singleGuardDay || "4",
                multiGuardDay: prev.subgroupRotation?.guardPattern?.multiGuardDay || "5",
                subgroupOrder: newOrder,
              },
            },
          };
        }
        return prev;
      });
    }
  }, [allSubgroupNumbers]);

  // Initialize flexibleGuard and afternoonRotation teamOrder from teams
  useEffect(() => {
    if (teams.length > 0) {
      setConfig(prev => {
        const teamNames = teams.map(t => t.name).sort();
        const needsFlexibleGuardInit = !prev.flexibleGuard?.teamOrder?.length;
        const needsAfternoonInit = !prev.afternoonRotation?.teamOrder?.length;
        
        if (!needsFlexibleGuardInit && !needsAfternoonInit) return prev;
        
        return {
          ...prev,
          flexibleGuard: {
            ...prev.flexibleGuard!,
            teamOrder: needsFlexibleGuardInit ? teamNames : prev.flexibleGuard!.teamOrder,
          },
          afternoonRotation: {
            ...prev.afternoonRotation!,
            teamOrder: needsAfternoonInit ? teamNames : prev.afternoonRotation!.teamOrder,
          },
        };
      });
    }
  }, [teams]);

  const updateConfig = <K extends keyof ScheduleRuleConfig>(
    key: K,
    value: Partial<ScheduleRuleConfig[K]>
  ) => {
    setConfig(prev => ({
      ...prev,
      [key]: { ...prev[key], ...value },
    }));
  };

  const updateGuardPattern = (updates: Partial<{ singleGuardDay: string; multiGuardDay: string; subgroupOrder: number[] }>) => {
    setConfig(prev => ({
      ...prev,
      subgroupRotation: {
        ...prev.subgroupRotation!,
        guardPattern: {
          singleGuardDay: updates.singleGuardDay ?? prev.subgroupRotation!.guardPattern.singleGuardDay,
          multiGuardDay: updates.multiGuardDay ?? prev.subgroupRotation!.guardPattern.multiGuardDay,
          subgroupOrder: updates.subgroupOrder ?? prev.subgroupRotation!.guardPattern.subgroupOrder,
        },
      },
    }));
  };

  const saveRules = async () => {
    if (!departmentId) return;
    
    setSaving(true);
    try {
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) {
        toast.error("Sesión requerida");
        return;
      }

      const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "saveScheduleRules",
          sessionToken,
          data: {
            departmentId,
            config,
          },
        },
      });

      if (error || !resp?.success) {
        throw new Error(resp?.error || error?.message || "Error al guardar reglas");
      }

      toast.success("Reglas guardadas correctamente");
      onRulesSaved();
      onOpenChange(false);
    } catch (e) {
      console.error("Error saving rules:", e);
      toast.error("Error al guardar reglas");
    }
    setSaving(false);
  };

  const handleApplyWeek = (weekData: typeof previewSchedules[0]) => {
    if (onApplyGenerated) {
      onApplyGenerated(weekData.week, weekData.year, weekData.schedule);
      toast.success(`Horario de Semana ${weekData.week} aplicado`);
      onOpenChange(false);
    }
  };

  const [bulkSaving, setBulkSaving] = useState(false);

  const handleBulkSaveMonth = async () => {
    if (!departmentId || previewSchedules.length === 0) return;
    
    setBulkSaving(true);
    try {
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) {
        toast.error("Sesión requerida");
        return;
      }

      const schedulesToSave = previewSchedules.map(pw => ({
        year: pw.year,
        weekNumber: pw.week,
        configuration: pw.schedule,
        notes: null,
      }));

      const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "bulkSaveWeeklySchedules",
          sessionToken,
          data: { departmentId, schedules: schedulesToSave },
        },
      });

      if (error || !resp?.success) throw new Error(resp?.error || "Error al guardar");

      toast.success(`${resp.successCount} semanas guardadas correctamente`);
      onRulesSaved();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Error al guardar horarios del mes");
    }
    setBulkSaving(false);
  };

  const getCellDisplay = (type: ScheduleType) => {
    switch (type) {
      case "morning": return { label: "M", bg: "bg-primary/20", text: "text-primary" };
      case "afternoon": return { label: "T", bg: "bg-blue-500/20", text: "text-blue-500" };
      case "night": return { label: "N", bg: "bg-purple-500/20", text: "text-purple-500" };
      case "rest": return { label: "D", bg: "bg-muted", text: "text-muted-foreground" };
    }
  };

  const activeRulesCount = useMemo(() => {
    let count = 0;
    if (config.restDays?.enabled) count++;
    if (config.groupRotation?.enabled) count++;
    if (config.subgroupRotation?.enabled) count++;
    if (config.shiftAlternation?.enabled) count++;
    if (config.guardDuty?.enabled && !config.subgroupRotation?.enabled && !config.flexibleGuard?.enabled) count++;
    if (config.flexibleGuard?.enabled) count++;
    if (config.afternoonRotation?.enabled) count++;
    return count;
  }, [config]);

  const moveSubgroupOrder = (fromIndex: number, direction: "up" | "down") => {
    const order = [...(config.subgroupRotation?.guardPattern?.subgroupOrder || [])];
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= order.length) return;
    
    [order[fromIndex], order[toIndex]] = [order[toIndex], order[fromIndex]];
    updateGuardPattern({ subgroupOrder: order });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Reglas de Generación
          </DialogTitle>
          <DialogDescription>
            Configura las reglas para generar horarios automáticamente en {departmentName}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "rules" | "preview")} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="rules" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Reglas
              {activeRulesCount > 0 && (
                <Badge variant="secondary" className="ml-1">{activeRulesCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-2">
              <Eye className="h-4 w-4" />
              Vista Previa ({previewSchedules.length} semanas)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="flex-1 overflow-hidden mt-4">
            <ScrollArea className="h-[450px] pr-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                <div className="space-y-4 pb-4">
                  {/* Info Banner */}
                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="py-3 px-4 flex gap-3">
                      <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-muted-foreground">
                        <p>Los horarios se generarán automáticamente cada semana aplicando estas reglas.</p>
                        <p className="mt-1 text-xs">Puedes modificar manualmente cualquier horario generado.</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Accordion type="multiple" defaultValue={["rest", "rotation", "subgroup"]} className="space-y-2">
                    {/* Rest Days */}
                    <AccordionItem value="rest" className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-muted">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-sm">Días de Descanso Fijos</p>
                            <p className="text-xs text-muted-foreground">
                              {config.restDays?.enabled 
                                ? `${config.restDays.days.map(d => DAYS_MAP[d]).join(", ")}`
                                : "Desactivado"}
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Label>Activar días de descanso fijos</Label>
                            <Switch
                              checked={config.restDays?.enabled}
                              onCheckedChange={(checked) => 
                                updateConfig("restDays", { enabled: checked })
                              }
                            />
                          </div>
                          
                          {config.restDays?.enabled && (
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">Seleccionar días</Label>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(DAYS_MAP).map(([key, name]) => (
                                  <Button
                                    key={key}
                                    size="sm"
                                    variant={config.restDays?.days.includes(key) ? "default" : "outline"}
                                    className="h-8"
                                    onClick={() => {
                                      const days = config.restDays?.days || [];
                                      const newDays = days.includes(key)
                                        ? days.filter(d => d !== key)
                                        : [...days, key];
                                      updateConfig("restDays", { days: newDays });
                                    }}
                                  >
                                    {name.slice(0, 3)}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Group Rotation (A→B→C) */}
                    <AccordionItem value="rotation" className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-muted">
                            <RefreshCcw className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-sm">Rotación de Grupos</p>
                            <p className="text-xs text-muted-foreground">
                              {config.groupRotation?.enabled 
                                ? `${config.groupRotation.groups.join("→")} en ciclo`
                                : "Desactivado"}
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Label>Activar rotación de grupos</Label>
                            <Switch
                              checked={config.groupRotation?.enabled}
                              onCheckedChange={(checked) => 
                                updateConfig("groupRotation", { enabled: checked })
                              }
                            />
                          </div>
                          
                          {config.groupRotation?.enabled && (
                            <>
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Orden de rotación</Label>
                                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                                  {config.groupRotation.groups.map((group, idx) => (
                                    <div key={group} className="flex items-center gap-2">
                                      <Badge variant="secondary" className="text-sm font-medium">
                                        Grupo {group}
                                      </Badge>
                                      {idx < config.groupRotation!.groups.length - 1 && (
                                        <span className="text-muted-foreground">→</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Ejemplo: Semana 1 le toca al Grupo A, Semana 2 al B, Semana 3 al C...
                                </p>
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Días afectados por la rotación</Label>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(DAYS_MAP).map(([key, name]) => (
                                    <Button
                                      key={key}
                                      size="sm"
                                      variant={config.groupRotation?.cycleDays?.includes(key) ? "default" : "outline"}
                                      className="h-8"
                                      onClick={() => {
                                        const days = config.groupRotation?.cycleDays || [];
                                        const newDays = days.includes(key)
                                          ? days.filter(d => d !== key)
                                          : [...days, key];
                                        updateConfig("groupRotation", { cycleDays: newDays });
                                      }}
                                    >
                                      {name.slice(0, 3)}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Subgroup Rotation with Guard Pattern */}
                    <AccordionItem value="subgroup" className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-muted">
                            <Users className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-sm">Rotación de Subgrupos (Guardias)</p>
                            <p className="text-xs text-muted-foreground">
                              {config.subgroupRotation?.enabled 
                                ? `Orden: ${config.subgroupRotation.guardPattern.subgroupOrder.join("→")}`
                                : "Desactivado"}
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Label>Activar rotación de subgrupos con guardias</Label>
                            <Switch
                              checked={config.subgroupRotation?.enabled}
                              onCheckedChange={(checked) => 
                                updateConfig("subgroupRotation", { enabled: checked })
                              }
                            />
                          </div>
                          
                          {config.subgroupRotation?.enabled && (
                            <>
                              {/* Guard days configuration */}
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Día de guardia único (1 subgrupo)</Label>
                                  <Select
                                    value={config.subgroupRotation.guardPattern.singleGuardDay}
                                    onValueChange={(val) => updateGuardPattern({ singleGuardDay: val })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(DAYS_MAP).map(([k, v]) => (
                                        <SelectItem key={k} value={k}>{v}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Día de guardia múltiple (resto)</Label>
                                  <Select
                                    value={config.subgroupRotation.guardPattern.multiGuardDay}
                                    onValueChange={(val) => updateGuardPattern({ multiGuardDay: val })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(DAYS_MAP).map(([k, v]) => (
                                        <SelectItem key={k} value={k}>{v}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              {/* Explanation */}
                              <Card className="bg-muted/50 border-dashed">
                                <CardContent className="py-3 px-4 text-xs text-muted-foreground">
                                  <p><strong>Ejemplo:</strong> Si el grupo A tiene guardia y el orden es [4, 1, 2, 3]:</p>
                                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                                    <li>Semana 1: <strong>A4</strong> trabaja {DAYS_MAP[config.subgroupRotation.guardPattern.singleGuardDay]}, A1-A2-A3 trabajan {DAYS_MAP[config.subgroupRotation.guardPattern.multiGuardDay]}</li>
                                    <li>Semana 4: <strong>A1</strong> trabaja {DAYS_MAP[config.subgroupRotation.guardPattern.singleGuardDay]}, A2-A3-A4 trabajan {DAYS_MAP[config.subgroupRotation.guardPattern.multiGuardDay]}</li>
                                    <li>Semana 7: <strong>A2</strong> trabaja {DAYS_MAP[config.subgroupRotation.guardPattern.singleGuardDay]}, A3-A4-A1 trabajan {DAYS_MAP[config.subgroupRotation.guardPattern.multiGuardDay]}</li>
                                  </ul>
                                </CardContent>
                              </Card>

                              {/* Subgroup order */}
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Orden de rotación de subgrupos</Label>
                                <div className="space-y-1">
                                  {config.subgroupRotation.guardPattern.subgroupOrder.map((num, idx) => (
                                    <div 
                                      key={num} 
                                      className="flex items-center gap-2 p-2 bg-muted rounded-lg"
                                    >
                                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                                      <Badge variant="secondary" className="w-10 justify-center">
                                        {num}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground flex-1">
                                        {idx === 0 ? "Primero (semanas 1-3)" : 
                                         idx === 1 ? "Segundo (semanas 4-6)" :
                                         idx === 2 ? "Tercero (semanas 7-9)" :
                                         `Posición ${idx + 1}`}
                                      </span>
                                      <div className="flex gap-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 w-6 p-0"
                                          onClick={() => moveSubgroupOrder(idx, "up")}
                                          disabled={idx === 0}
                                        >
                                          ↑
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 w-6 p-0"
                                          onClick={() => moveSubgroupOrder(idx, "down")}
                                          disabled={idx === config.subgroupRotation!.guardPattern.subgroupOrder.length - 1}
                                        >
                                          ↓
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Base week configuration */}
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Semana base (inicio del ciclo)</Label>
                                  <Select
                                    value={String(config.subgroupRotation.baseWeek || currentWeek)}
                                    onValueChange={(val) => 
                                      updateConfig("subgroupRotation", { baseWeek: parseInt(val) })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Array.from({ length: 52 }, (_, i) => i + 1).map(w => (
                                        <SelectItem key={w} value={String(w)}>
                                          Semana {w}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Año base</Label>
                                  <Select
                                    value={String(config.subgroupRotation.baseYear || currentYear)}
                                    onValueChange={(val) => 
                                      updateConfig("subgroupRotation", { baseYear: parseInt(val) })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                                        <SelectItem key={y} value={String(y)}>
                                          {y}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                En la semana base, el Grupo {config.groupRotation?.groups[0] || "A"} tiene guardia con el subgrupo {config.subgroupRotation.guardPattern.subgroupOrder[0]}.
                              </p>
                            </>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Shift Alternation - Sistema antiguo por grupos padre (NO recomendado para Encajado H) */}
                    <AccordionItem value="shifts" className="border rounded-lg px-4 opacity-60">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-muted">
                            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-sm">Alternancia por Grupos Padre</p>
                            <p className="text-xs text-muted-foreground">
                              {config.shiftAlternation?.enabled 
                                ? `Grupos A↔B↔C alternan mañana/tarde`
                                : "Desactivado (usa Turno de Tarde Rotativo)"}
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="space-y-4">
                          <Card className="bg-amber-500/10 border-amber-500/30">
                            <CardContent className="py-3 px-4 text-xs text-amber-600 dark:text-amber-400">
                              <p><strong>⚠️ Sistema antiguo:</strong> Este sistema alterna grupos padre completos (A, B, C) entre mañana y tarde.</p>
                              <p className="mt-1">Para rotar equipos individuales (B1→B2→B3...), usa <strong>"Turno de Tarde Rotativo"</strong> más abajo.</p>
                            </CardContent>
                          </Card>
                          
                          <div className="flex items-center justify-between">
                            <Label>Activar alternancia por grupos padre</Label>
                            <Switch
                              checked={config.shiftAlternation?.enabled}
                              onCheckedChange={(checked) => {
                                updateConfig("shiftAlternation", { enabled: checked });
                                // Si se activa, desactivar afternoonRotation para evitar conflictos
                                if (checked && config.afternoonRotation?.enabled) {
                                  updateConfig("afternoonRotation", { enabled: false });
                                }
                              }}
                            />
                          </div>
                          
                          {config.shiftAlternation?.enabled && (
                            <>
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Patrón de alternancia</Label>
                                <Select
                                  value={config.shiftAlternation.pattern}
                                  onValueChange={(val: "weekly" | "daily") => 
                                    updateConfig("shiftAlternation", { pattern: val })
                                  }
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="weekly">Semanal (alterna cada semana)</SelectItem>
                                    <SelectItem value="daily">Diario (alterna cada día)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Turno inicial por grupo</Label>
                                <div className="space-y-2">
                                  {config.shiftAlternation.groups.map((g, idx) => (
                                    <div key={g.group} className="flex items-center gap-3 p-2 bg-muted rounded-lg">
                                      <Badge variant="secondary">Grupo {g.group}</Badge>
                                      <div className="flex items-center gap-2 ml-auto">
                                        <Button
                                          size="sm"
                                          variant={g.startShift === "morning" ? "default" : "outline"}
                                          className="h-7 gap-1"
                                          onClick={() => {
                                            const newGroups = [...config.shiftAlternation!.groups];
                                            newGroups[idx] = { ...g, startShift: "morning" };
                                            updateConfig("shiftAlternation", { groups: newGroups });
                                          }}
                                        >
                                          <Sun className="h-3 w-3" />
                                          Mañana
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant={g.startShift === "afternoon" ? "default" : "outline"}
                                          className="h-7 gap-1"
                                          onClick={() => {
                                            const newGroups = [...config.shiftAlternation!.groups];
                                            newGroups[idx] = { ...g, startShift: "afternoon" };
                                            updateConfig("shiftAlternation", { groups: newGroups });
                                          }}
                                        >
                                          <Moon className="h-3 w-3" />
                                          Tarde
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Define qué turno tiene cada grupo en la semana 1. Las siguientes semanas alternarán.
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* === NUEVO: Guardia Flexible (Encajado H) === */}
                    <AccordionItem value="flexibleGuard" className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-orange-500/10">
                            <Users className="h-4 w-4 text-orange-500" />
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-sm">Guardia Flexible</p>
                            <p className="text-xs text-muted-foreground">
                              {config.flexibleGuard?.enabled 
                                ? `${config.flexibleGuard.teamsPerGuard} equipos de guardia | ${DAYS_MAP[config.flexibleGuard.restDay]} descanso, ${DAYS_MAP[config.flexibleGuard.guardDay]} guardia`
                                : "Desactivado"}
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Activar guardia flexible</Label>
                              <p className="text-xs text-muted-foreground">Para departamentos como Encajado H</p>
                            </div>
                            <Switch
                              checked={config.flexibleGuard?.enabled}
                              onCheckedChange={(checked) => {
                                updateConfig("flexibleGuard", { enabled: checked });
                                // Desactivar subgroupRotation si se activa flexibleGuard
                                if (checked && config.subgroupRotation?.enabled) {
                                  updateConfig("subgroupRotation", { enabled: false });
                                }
                              }}
                            />
                          </div>
                          
                          {config.flexibleGuard?.enabled && (
                            <>
                              {/* Cantidad de equipos por guardia */}
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Equipos por guardia (simultáneos)</Label>
                                <Select
                                  value={String(config.flexibleGuard.teamsPerGuard || 2)}
                                  onValueChange={(val) => 
                                    updateConfig("flexibleGuard", { teamsPerGuard: parseInt(val) })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[1, 2, 3, 4, 5, 6].map(n => (
                                      <SelectItem key={n} value={String(n)}>
                                        {n} equipo{n > 1 ? "s" : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Días de descanso y guardia */}
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Día de descanso (equipos guardia)</Label>
                                  <Select
                                    value={config.flexibleGuard.restDay}
                                    onValueChange={(val) => updateConfig("flexibleGuard", { restDay: val })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(DAYS_MAP).map(([k, v]) => (
                                        <SelectItem key={k} value={k}>{v}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Día de guardia (equipos guardia)</Label>
                                  <Select
                                    value={config.flexibleGuard.guardDay}
                                    onValueChange={(val) => updateConfig("flexibleGuard", { guardDay: val })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(DAYS_MAP).map(([k, v]) => (
                                        <SelectItem key={k} value={k}>{v}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              {/* Explicación del patrón */}
                              <Card className="bg-orange-500/5 border-orange-500/20">
                                <CardContent className="py-3 px-4 text-xs text-muted-foreground">
                                  <p><strong>Patrón:</strong> Los equipos de guardia descansan el {DAYS_MAP[config.flexibleGuard.restDay]} y trabajan el {DAYS_MAP[config.flexibleGuard.guardDay]}.</p>
                                  <p className="mt-1">El resto de equipos trabajan el {DAYS_MAP[config.flexibleGuard.restDay]} y descansan el {DAYS_MAP[config.flexibleGuard.guardDay]}.</p>
                                </CardContent>
                              </Card>

                              {/* Orden de rotación de equipos */}
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Orden de rotación de equipos</Label>
                                <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
                                  {config.flexibleGuard.teamOrder.map((teamName, idx) => {
                                    const groupIndex = Math.floor(idx / config.flexibleGuard!.teamsPerGuard);
                                    const isFirstInGroup = idx % config.flexibleGuard!.teamsPerGuard === 0;
                                    
                                    return (
                                      <div 
                                        key={teamName} 
                                        className={`flex items-center gap-2 p-2 rounded-lg ${isFirstInGroup ? 'bg-muted' : 'bg-muted/50'}`}
                                      >
                                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                                        <Badge variant="secondary" className="w-12 justify-center">
                                          {teamName}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground flex-1">
                                          {isFirstInGroup && `Grupo ${groupIndex + 1}`}
                                        </span>
                                        <div className="flex gap-1">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0"
                                            onClick={() => {
                                              if (idx === 0) return;
                                              const newOrder = [...config.flexibleGuard!.teamOrder];
                                              [newOrder[idx], newOrder[idx - 1]] = [newOrder[idx - 1], newOrder[idx]];
                                              updateConfig("flexibleGuard", { teamOrder: newOrder });
                                            }}
                                            disabled={idx === 0}
                                          >
                                            ↑
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0"
                                            onClick={() => {
                                              if (idx === config.flexibleGuard!.teamOrder.length - 1) return;
                                              const newOrder = [...config.flexibleGuard!.teamOrder];
                                              [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
                                              updateConfig("flexibleGuard", { teamOrder: newOrder });
                                            }}
                                            disabled={idx === config.flexibleGuard!.teamOrder.length - 1}
                                          >
                                            ↓
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Arrastra para reorganizar. Cada {config.flexibleGuard.teamsPerGuard} equipos consecutivos forman un grupo de guardia.
                                </p>
                              </div>

                              {/* Semana base */}
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Semana base</Label>
                                  <Select
                                    value={String(config.flexibleGuard.baseWeek || currentWeek)}
                                    onValueChange={(val) => 
                                      updateConfig("flexibleGuard", { baseWeek: parseInt(val) })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Array.from({ length: 53 }, (_, i) => i + 1).map(w => (
                                        <SelectItem key={w} value={String(w)}>
                                          Semana {w}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Año base</Label>
                                  <Select
                                    value={String(config.flexibleGuard.baseYear || currentYear)}
                                    onValueChange={(val) => 
                                      updateConfig("flexibleGuard", { baseYear: parseInt(val) })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                                        <SelectItem key={y} value={String(y)}>
                                          {y}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* === TURNO DE TARDE ROTATIVO (Recomendado para Encajado H) === */}
                    <AccordionItem value="afternoonRotation" className="border rounded-lg px-4 border-blue-500/30 bg-blue-500/5">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-500/20">
                            <Moon className="h-4 w-4 text-blue-500" />
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-sm">Turno de Tarde Rotativo</p>
                            <p className="text-xs text-muted-foreground">
                              {config.afternoonRotation?.enabled 
                                ? `${config.afternoonRotation.teamsPerAfternoon} equipo(s) de tarde rotan semanalmente`
                                : "Desactivado"}
                            </p>
                          </div>
                          {config.afternoonRotation?.enabled && (
                            <Badge className="ml-auto bg-blue-500">Activo</Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="space-y-4">
                          <Card className="bg-blue-500/10 border-blue-500/30">
                            <CardContent className="py-3 px-4 text-xs text-blue-600 dark:text-blue-400">
                              <p><strong>✓ Sistema recomendado:</strong> Cada semana rotan los equipos de tarde.</p>
                              <p className="mt-1">Ejemplo: Si pones 1 equipo → B1 esta semana, B2 la siguiente, B3 después...</p>
                              <p className="mt-1">Si pones 2 equipos → B1+B2 esta semana, B3+B4 la siguiente...</p>
                            </CardContent>
                          </Card>
                          
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Activar turno de tarde rotativo</Label>
                              <p className="text-xs text-muted-foreground">Los equipos rotan de tarde semanalmente</p>
                            </div>
                            <Switch
                              checked={config.afternoonRotation?.enabled}
                              onCheckedChange={(checked) => {
                                updateConfig("afternoonRotation", { enabled: checked });
                                // Si se activa, desactivar shiftAlternation para evitar conflictos
                                if (checked && config.shiftAlternation?.enabled) {
                                  updateConfig("shiftAlternation", { enabled: false });
                                }
                              }}
                            />
                          </div>
                          
                          {config.afternoonRotation?.enabled && (
                            <>
                              {/* Cantidad de equipos de tarde */}
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Equipos de tarde por semana</Label>
                                <Select
                                  value={String(config.afternoonRotation.teamsPerAfternoon || 1)}
                                  onValueChange={(val) => 
                                    updateConfig("afternoonRotation", { teamsPerAfternoon: parseInt(val) })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[1, 2, 3, 4].map(n => (
                                      <SelectItem key={n} value={String(n)}>
                                        {n} equipo{n > 1 ? "s" : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Días donde aplica */}
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Días donde aplica turno de tarde</Label>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(DAYS_MAP).map(([key, name]) => (
                                    <Button
                                      key={key}
                                      size="sm"
                                      variant={config.afternoonRotation?.applicableDays.includes(key) ? "default" : "outline"}
                                      className="h-8"
                                      onClick={() => {
                                        const days = config.afternoonRotation?.applicableDays || [];
                                        const newDays = days.includes(key)
                                          ? days.filter(d => d !== key)
                                          : [...days, key];
                                        updateConfig("afternoonRotation", { applicableDays: newDays });
                                      }}
                                    >
                                      {name.slice(0, 3)}
                                    </Button>
                                  ))}
                                </div>
                              </div>

                              {/* Orden de rotación */}
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Orden de rotación para tarde</Label>
                                <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
                                  {config.afternoonRotation.teamOrder.map((teamName, idx) => {
                                    const groupIndex = Math.floor(idx / config.afternoonRotation!.teamsPerAfternoon);
                                    const isFirstInGroup = idx % config.afternoonRotation!.teamsPerAfternoon === 0;
                                    
                                    return (
                                      <div 
                                        key={teamName} 
                                        className={`flex items-center gap-2 p-2 rounded-lg ${isFirstInGroup ? 'bg-blue-500/10' : 'bg-blue-500/5'}`}
                                      >
                                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                                        <Badge variant="secondary" className="w-12 justify-center">
                                          {teamName}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground flex-1">
                                          {isFirstInGroup && `Semana ${groupIndex + 1}`}
                                        </span>
                                        <div className="flex gap-1">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0"
                                            onClick={() => {
                                              if (idx === 0) return;
                                              const newOrder = [...config.afternoonRotation!.teamOrder];
                                              [newOrder[idx], newOrder[idx - 1]] = [newOrder[idx - 1], newOrder[idx]];
                                              updateConfig("afternoonRotation", { teamOrder: newOrder });
                                            }}
                                            disabled={idx === 0}
                                          >
                                            ↑
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0"
                                            onClick={() => {
                                              if (idx === config.afternoonRotation!.teamOrder.length - 1) return;
                                              const newOrder = [...config.afternoonRotation!.teamOrder];
                                              [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
                                              updateConfig("afternoonRotation", { teamOrder: newOrder });
                                            }}
                                            disabled={idx === config.afternoonRotation!.teamOrder.length - 1}
                                          >
                                            ↓
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Semana base */}
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Semana base</Label>
                                  <Select
                                    value={String(config.afternoonRotation.baseWeek || currentWeek)}
                                    onValueChange={(val) => 
                                      updateConfig("afternoonRotation", { baseWeek: parseInt(val) })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Array.from({ length: 53 }, (_, i) => i + 1).map(w => (
                                        <SelectItem key={w} value={String(w)}>
                                          Semana {w}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Año base</Label>
                                  <Select
                                    value={String(config.afternoonRotation.baseYear || currentYear)}
                                    onValueChange={(val) => 
                                      updateConfig("afternoonRotation", { baseYear: parseInt(val) })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                                        <SelectItem key={y} value={String(y)}>
                                          {y}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="preview" className="flex-1 overflow-hidden mt-4">
            {loading ? (
              <div className="flex items-center justify-center h-[450px]">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  <span className="text-sm text-muted-foreground">Cargando reglas...</span>
                </div>
              </div>
            ) : (
            <ScrollArea className="h-[450px] pr-4">
              <div className="space-y-6">
                {/* Bulk save button */}
                {activeRulesCount > 0 && (
                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CalendarDays className="h-5 w-5 text-primary flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Guardar horarios del mes</p>
                          <p className="text-xs text-muted-foreground">
                            Guarda los {previewSchedules.length} horarios generados de una vez
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={handleBulkSaveMonth}
                        disabled={bulkSaving}
                        className="gap-2"
                      >
                        <Save className="h-4 w-4" />
                        {bulkSaving ? "Guardando..." : "Guardar Mes"}
                      </Button>
                    </CardContent>
                  </Card>
                )}
                
                {activeRulesCount === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-8 text-center">
                      <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground">
                        Activa algunas reglas en la pestaña "Reglas" para ver la vista previa de los horarios generados.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  previewSchedules.map((pw) => {
                    const previewInfo = getPreviewInfo(pw.week, pw.year);
                    
                    return (
                      <Card key={`${pw.year}-${pw.week}`} className={`overflow-hidden transition-all ${previewInfo?.isBaseWeek ? 'ring-2 ring-primary' : ''}`}>
                        <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b">
                          <div className="flex items-center gap-3">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">
                                  Semana {pw.week}
                                </p>
                                {previewInfo?.isBaseWeek && (
                                  <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                                    Base
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {formatDateShort(pw.range.start)} - {formatDateShort(pw.range.end)}
                              </p>
                            </div>
                            {previewInfo && previewInfo.type === "classic" && (
                              <Badge variant="outline" className="text-xs">
                                Grupo {previewInfo.activeParentGroup} | {previewInfo.activeParentGroup}{previewInfo.singleGuardSubgroupNum} → {previewInfo.singleGuardDay}
                              </Badge>
                            )}
                            {previewInfo && previewInfo.type === "flexible" && (
                              <Badge variant="outline" className="text-xs bg-orange-500/10">
                                Guardia: {previewInfo.guardTeams.join(" + ")}
                                {previewInfo.afternoonTeams.length > 0 && ` | Tarde: ${previewInfo.afternoonTeams.join(" + ")}`}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {!previewInfo?.isBaseWeek && (config.subgroupRotation?.enabled || config.flexibleGuard?.enabled) && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0"
                                      onClick={() => {
                                        if (config.flexibleGuard?.enabled) {
                                          updateConfig("flexibleGuard", { baseWeek: pw.week, baseYear: pw.year });
                                          toast.success(`Semana ${pw.week} establecida como base`);
                                        } else {
                                          setBaseWeek(pw.week, pw.year);
                                        }
                                      }}
                                    >
                                      <Target className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Establecer como semana base</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => handleApplyWeek(pw)}
                            >
                              <Sparkles className="h-3 w-3" />
                              Aplicar
                              <ChevronRight className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Summary text for classic system */}
                        {previewInfo && previewInfo.type === "classic" && (
                          <div className="px-4 py-2 bg-primary/5 border-b text-xs space-y-1">
                            <p className="text-muted-foreground">
                              <span className="font-medium text-foreground">{previewInfo.singleGuardDay}:</span> {previewInfo.singleDaySummary}
                            </p>
                            <p className="text-muted-foreground">
                              <span className="font-medium text-foreground">{previewInfo.multiGuardDay}:</span> {previewInfo.multiDaySummary}
                            </p>
                          </div>
                        )}
                        
                        {/* Summary text for flexible system */}
                        {previewInfo && previewInfo.type === "flexible" && (
                          <div className="px-4 py-2 bg-orange-500/5 border-b text-xs space-y-1">
                            <p className="text-muted-foreground">
                              <span className="font-medium text-foreground">{previewInfo.restDay}:</span> {previewInfo.guardTeams.join(" + ")} descansan, resto trabaja
                            </p>
                            <p className="text-muted-foreground">
                              <span className="font-medium text-foreground">{previewInfo.guardDay}:</span> {previewInfo.guardTeams.join(" + ")} trabajan (guardia), resto descansa
                            </p>
                            {previewInfo.afternoonTeams.length > 0 && (
                              <p className="text-blue-500">
                                <span className="font-medium">Tarde:</span> {previewInfo.afternoonTeams.join(" + ")}
                              </p>
                            )}
                          </div>
                        )}
                        
                        <div className="p-4">
                          {/* Header row */}
                          <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: `80px repeat(7, 1fr)` }}>
                            <div className="text-xs text-muted-foreground font-medium">Equipo</div>
                            {DAYS.map(d => (
                              <div key={d.key} className="text-center text-xs text-muted-foreground font-medium">
                                {d.short}
                              </div>
                            ))}
                          </div>
                          
                          {/* Team rows - show individual subgroups */}
                          {parentGroups.map(parentGroup => (
                            <div key={parentGroup} className="mb-3">
                              {/* Parent group label */}
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="secondary" className="text-xs">
                                  Grupo {parentGroup}
                                </Badge>
                                {previewInfo?.activeParentGroup === parentGroup && (
                                  <Badge variant="default" className="text-xs bg-primary">
                                    Guardia
                                  </Badge>
                                )}
                              </div>
                              
                              {/* Individual subgroup rows */}
                              {groupedTeams[parentGroup]?.map(team => {
                                const subgroupNum = getSubgroupNumber(team.name);
                                const isSingleGuard = previewInfo?.activeParentGroup === parentGroup && 
                                                      previewInfo?.singleGuardSubgroupNum === subgroupNum;
                                
                                return (
                                  <div 
                                    key={team.id} 
                                    className={`grid gap-1 mb-1 ${isSingleGuard ? 'bg-primary/5 rounded-lg p-1' : ''}`}
                                    style={{ gridTemplateColumns: `80px repeat(7, 1fr)` }}
                                  >
                                    <div className="flex items-center">
                                      <span className={`text-xs ${isSingleGuard ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
                                        {team.name}
                                        {isSingleGuard && ' ★'}
                                      </span>
                                    </div>
                                    {DAYS.map(d => {
                                      const cell = pw.schedule[d.key]?.[team.id];
                                      const display = getCellDisplay(cell?.type || "rest");
                                      return (
                                        <div
                                          key={d.key}
                                          className={`flex items-center justify-center h-6 rounded text-xs font-medium ${display.bg} ${display.text}`}
                                        >
                                          {display.label}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                          
                          {/* Legend */}
                          <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t">
                            <span className="text-xs text-muted-foreground">Leyenda:</span>
                            <div className="flex items-center gap-1">
                              <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">M</div>
                              <span className="text-xs text-muted-foreground">Mañana</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center text-xs text-blue-500 font-medium">T</div>
                              <span className="text-xs text-muted-foreground">Tarde</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center text-xs text-purple-500 font-medium">N</div>
                              <span className="text-xs text-muted-foreground">Noche</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-5 h-5 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground font-medium">D</div>
                              <span className="text-xs text-muted-foreground">Descanso</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold text-primary">★</span>
                              <span className="text-xs text-muted-foreground">Guardia única</span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </ScrollArea>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-4 border-t mt-4">
          <div className="flex w-full gap-3">
            <Button 
              variant="outline" 
              className="flex-1" 
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button 
              className="flex-1" 
              onClick={saveRules}
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar Reglas"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
