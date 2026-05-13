import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  UserCheck,
  Users,
} from "lucide-react";
import {
  addDays,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfWeek,
  subWeeks,
  addWeeks,
} from "date-fns";
import { es } from "date-fns/locale";

type Department = { id: string; name: string; slug?: string | null };
type Worker = {
  id: string;
  name: string;
  worker_number: string;
  worker_team_id: string | null;
  work_group_id: string | null;
  department_id: string;
  is_responsable?: boolean;
  is_on_leave?: boolean;
};
type WorkGroup = { id: string; name: string; color: string; department_id: string; sort_order: number };
type WorkerTeam = {
  id: string;
  name: string;
  department_id: string;
  display_name?: string | null;
  work_group_name?: string | null;
  work_group_color?: string | null;
  responsable_worker_id?: string | null;
};

type DepartmentShift = {
  id: string;
  name: string;
  shift_key: string;
  color: string;
  start_time: string | null;
  end_time: string | null;
  is_rest: boolean;
  sort_order: number;
};

type ScheduleCell = {
  type: string;
  start?: string | null;
  end?: string | null;
  partial_count?: number | null;
  partial_shift?: string | null;
  partial_start?: string | null;
  partial_end?: string | null;
};

type WeeklySchedule = {
  id: string;
  year: number;
  week_number: number;
  configuration: Record<string, Record<string, ScheduleCell>>;
};

type DisplayGroup = {
  key: string;
  displayName: string;
  teams: WorkerTeam[];
  color: string;
  members: Worker[];
  responsibles: Worker[];
  memberCount: number;
  sortOrder: number;
  visibleCount: number;
  badgeLabel?: string;
  isPartial?: boolean;
};

interface Props {
  departments: Department[];
  selectedDepartment: string;
  workers: Worker[];
  workGroups: WorkGroup[];
  workerTeams: WorkerTeam[];
}

const DAY_COLUMNS = [
  { key: "0", shortLabel: "Dom", fullLabel: "domingo" },
  { key: "1", shortLabel: "Lun", fullLabel: "lunes" },
  { key: "2", shortLabel: "Mar", fullLabel: "martes" },
  { key: "3", shortLabel: "Mié", fullLabel: "miércoles" },
  { key: "4", shortLabel: "Jue", fullLabel: "jueves" },
  { key: "5", shortLabel: "Vie", fullLabel: "viernes" },
  { key: "6", shortLabel: "Sáb", fullLabel: "sábado" },
] as const;

const FALLBACK_TEAM_COLORS = [
  "hsl(190 50% 52%)",
  "hsl(49 85% 53%)",
  "hsl(223 82% 55%)",
  "hsl(28 71% 32%)",
  "hsl(28 74% 48%)",
  "hsl(0 70% 55%)",
  "hsl(271 65% 54%)",
  "hsl(82 58% 44%)",
];

function getSalixUrl(workerNumber: string) {
  return `https://salix.verdnatura.es/#/worker/${workerNumber}/time-control`;
}

function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  return time.slice(0, 5);
}

function getDerivedDisplayName(team: WorkerTeam): string {
  const explicit = team.display_name?.trim() || team.work_group_name?.trim();
  if (explicit) return explicit;

  return team.name
    .replace(/\s*[-–]\s*\d+$/u, "")
    .replace(/\s+\d+$/u, "")
    .trim();
}

function getTeamLabel(team: WorkerTeam): string {
  return team.name.trim();
}

function getParentGroup(teamName: string): string {
  const match = teamName.match(/^([\p{L}]+)/u);
  return (match ? match[1] : teamName).trim().toUpperCase();
}

function normalizeGroupKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sortWorkersByName(a: Worker, b: Worker) {
  return a.name.localeCompare(b.name, "es");
}

function sortShiftsByOrder(shifts: DepartmentShift[]) {
  return [...shifts].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function hexToHslString(hex: string): string {
  const normalized = hex.replace("#", "").trim();
  const safeHex = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;

  const r = parseInt(safeHex.slice(0, 2), 16) / 255;
  const g = parseInt(safeHex.slice(2, 4), 16) / 255;
  const b = parseInt(safeHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }

    h /= 6;
  }

  return `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

function resolveColor(color: string | null | undefined, fallback: string): string {
  if (!color) return fallback;
  if (color.startsWith("hsl(")) return color;
  if (color.startsWith("#")) return hexToHslString(color);
  return fallback;
}

export function ConsultaSchedulesPanel({
  departments,
  selectedDepartment,
  workers,
  workGroups,
  workerTeams,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [publishedShifts, setPublishedShifts] = useState<DepartmentShift[]>([]);
  const [fallbackShifts, setFallbackShifts] = useState<DepartmentShift[]>([]);
  const [groupColors, setGroupColors] = useState<Record<string, string>>({});
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedGroup, setSelectedGroup] = useState<DisplayGroup | null>(null);

  const isoWeek = useMemo(() => getISOWeek(weekStart), [weekStart]);
  const isoYear = useMemo(() => getISOWeekYear(weekStart), [weekStart]);
  const weekEnd = useMemo(() => addDays(weekStart, 5), [weekStart]);
  const departmentName = departments.find((department) => department.id === selectedDepartment)?.name;

  const deptTeams = useMemo(
    () => workerTeams.filter((team) => team.department_id === selectedDepartment),
    [workerTeams, selectedDepartment],
  );

  const teamById = useMemo(
    () => new Map(deptTeams.map((team) => [team.id, team])),
    [deptTeams],
  );

  const teamOrderIndex = useMemo(
    () => new Map(deptTeams.map((team, index) => [team.id, index])),
    [deptTeams],
  );

  const displayGroupKeyByTeamId = useMemo(() => {
    const next = new Map<string, string>();

    for (const team of deptTeams) {
      next.set(team.id, normalizeGroupKey(getDerivedDisplayName(team)));
    }

    return next;
  }, [deptTeams]);

  const teamsByDisplayGroup = useMemo(() => {
    const next = new Map<string, WorkerTeam[]>();

    for (const team of deptTeams) {
      const groupKey = normalizeGroupKey(getDerivedDisplayName(team));
      const current = next.get(groupKey) ?? [];
      current.push(team);
      next.set(groupKey, current);
    }

    for (const [groupKey, teams] of next.entries()) {
      next.set(
        groupKey,
        [...teams].sort(
          (a, b) => (teamOrderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (teamOrderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        ),
      );
    }

    return next;
  }, [deptTeams, teamOrderIndex]);

  const effectiveShifts = useMemo(
    () => (publishedShifts.length > 0 ? publishedShifts : fallbackShifts),
    [fallbackShifts, publishedShifts],
  );

  const shiftByKey = useMemo(
    () => new Map(effectiveShifts.map((shift) => [shift.shift_key, shift])),
    [effectiveShifts],
  );

  // Fetch responsable workers that aren't in the loaded workers list (they may belong to a different team/dept)
  const [extraResponsables, setExtraResponsables] = useState<Worker[]>([]);
  
  useEffect(() => {
    const missingIds = deptTeams
      .map(t => t.responsable_worker_id)
      .filter((id): id is string => !!id && !workers.some(w => w.id === id));
    
    const uniqueMissing = [...new Set(missingIds)];
    if (uniqueMissing.length === 0) { setExtraResponsables([]); return; }
    
    (async () => {
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) return;
      try {
        const { data } = await supabase.functions.invoke("admin-operations", {
          body: { action: "getWorkersByIds", sessionToken, data: { workerIds: uniqueMissing } }
        });
        if (data?.success && data.workers) {
          setExtraResponsables(data.workers.map((w: any) => ({
            id: w.id,
            name: w.name,
            worker_number: w.worker_number,
            worker_team_id: w.worker_team_id,
            work_group_id: w.work_group_id,
            department_id: w.department_id,
            is_responsable: true,
          })));
        }
      } catch (err) {
        console.error("Error fetching responsable workers:", err);
      }
    })();
  }, [deptTeams, workers]);

  const allWorkersById = useMemo(
    () => {
      const map = new Map(workers.map((worker) => [worker.id, worker]));
      for (const w of extraResponsables) {
        if (!map.has(w.id)) map.set(w.id, w);
      }
      return map;
    },
    [workers, extraResponsables],
  );

  const allWorkersByTeamId = useMemo(() => {
    const next = new Map<string, Worker[]>();

    for (const worker of workers) {
      if (!worker.worker_team_id) continue;
      const current = next.get(worker.worker_team_id) ?? [];
      current.push(worker);
      next.set(worker.worker_team_id, current);
    }

    for (const [teamId, teamWorkers] of next.entries()) {
      next.set(teamId, [...teamWorkers].sort(sortWorkersByName));
    }

    return next;
  }, [workers]);

  const activeWorkerCountByTeamId = useMemo(() => {
    const next: Record<string, number> = {};

    for (const team of deptTeams) {
      next[team.id] = (allWorkersByTeamId.get(team.id) ?? []).filter(
        (worker) => !worker.is_responsable && !worker.is_on_leave,
      ).length;
    }

    return next;
  }, [allWorkersByTeamId, deptTeams]);

  const normalizedGroupColors = useMemo(() => {
    const next: Record<string, string> = {};

    for (const [key, value] of Object.entries(groupColors)) {
      next[key.trim().toUpperCase()] = value;
    }

    return next;
  }, [groupColors]);

  const teamColorMap = useMemo(() => {
    const next: Record<string, string> = {};

    deptTeams.forEach((team, index) => {
      // Priority: schedule group colors only — never fall back to vacation work_group colors
      const scheduleColor = normalizedGroupColors[getParentGroup(team.name)];
      const teamExplicitColor = team.work_group_color;

      next[team.id] = resolveColor(
        scheduleColor || teamExplicitColor,
        FALLBACK_TEAM_COLORS[index % FALLBACK_TEAM_COLORS.length],
      );
    });

    return next;
  }, [deptTeams, normalizedGroupColors]);

  const getResponsiblesForTeams = useCallback(
    (teams: WorkerTeam[]) => {
      const responsibleMap = new Map<string, Worker>();

      for (const team of teams) {
        if (team.responsable_worker_id) {
          const explicitResponsible = allWorkersById.get(team.responsable_worker_id);
          if (explicitResponsible) {
            responsibleMap.set(explicitResponsible.id, explicitResponsible);
          }
        }

        for (const worker of allWorkersByTeamId.get(team.id) ?? []) {
          if (worker.is_responsable) {
            responsibleMap.set(worker.id, worker);
          }
        }
      }

      return Array.from(responsibleMap.values()).sort(sortWorkersByName);
    },
    [allWorkersById, allWorkersByTeamId],
  );

  const buildGroupDetails = useCallback(
    (
      teams: WorkerTeam[],
      options?: {
        visibleCount?: number;
        badgeLabel?: string;
        isPartial?: boolean;
        displayName?: string;
        key?: string;
      },
    ) => {
      const uniqueTeams = Array.from(new Map(teams.map((team) => [team.id, team])).values());
      const firstTeam = uniqueTeams[0];
      const displayName = options?.displayName ?? (firstTeam ? getDerivedDisplayName(firstTeam) : "Grupo");
      const key = options?.key ?? normalizeGroupKey(displayName);
      const responsibles = getResponsiblesForTeams(uniqueTeams);
      const responsibleIds = new Set(responsibles.map((worker) => worker.id));
      const members = uniqueTeams
        .flatMap((team) => allWorkersByTeamId.get(team.id) ?? [])
        .filter((worker) => !worker.is_responsable && !responsibleIds.has(worker.id))
        .sort(sortWorkersByName);
      const sortOrder = Math.min(...uniqueTeams.map((team) => teamOrderIndex.get(team.id) ?? Number.MAX_SAFE_INTEGER));
      const baseVisibleCount = uniqueTeams.reduce((sum, team) => sum + (activeWorkerCountByTeamId[team.id] ?? 0), 0);

      return {
        key,
        displayName,
        teams: uniqueTeams,
        color: firstTeam ? teamColorMap[firstTeam.id] || "hsl(var(--primary))" : "hsl(var(--primary))",
        members,
        responsibles,
        memberCount: members.length + responsibles.length,
        sortOrder,
        visibleCount: options?.visibleCount ?? baseVisibleCount,
        badgeLabel: options?.badgeLabel,
        isPartial: options?.isPartial,
      } satisfies DisplayGroup;
    },
    [activeWorkerCountByTeamId, allWorkersByTeamId, getResponsiblesForTeams, teamColorMap, teamOrderIndex],
  );

  useEffect(() => {
    setSelectedGroup(null);
  }, [selectedDepartment, isoWeek, isoYear]);

  useEffect(() => {
    if (!selectedDepartment) return;
    const sessionToken = localStorage.getItem("manager_session_token");
    if (!sessionToken) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [publishedShiftsResponse, departmentShiftsResponse, scheduleResponse, groupColorsResponse] = await Promise.all([
          supabase.functions.invoke("admin-operations", {
            body: {
              action: "getWeeklyShifts",
              sessionToken,
              data: { departmentId: selectedDepartment, year: isoYear, week: isoWeek },
            },
          }),
          supabase.functions.invoke("admin-operations", {
            body: {
              action: "getDepartmentShifts",
              sessionToken,
              data: { departmentId: selectedDepartment },
            },
          }),
          supabase.functions.invoke("admin-operations", {
            body: {
              action: "getWeeklySchedule",
              sessionToken,
              data: { departmentId: selectedDepartment, year: isoYear, weekNumber: isoWeek },
            },
          }),
          supabase.functions.invoke("admin-operations", {
            body: {
              action: "getScheduleGroupColors",
              sessionToken,
              data: { departmentId: selectedDepartment },
            },
          }),
        ]);

        if (cancelled) return;

        if (publishedShiftsResponse.data?.success) {
          setPublishedShifts(sortShiftsByOrder((publishedShiftsResponse.data.shifts || []) as DepartmentShift[]));
        } else {
          setPublishedShifts([]);
        }

        if (departmentShiftsResponse.data?.success) {
          setFallbackShifts(sortShiftsByOrder((departmentShiftsResponse.data.shifts || []) as DepartmentShift[]));
        } else {
          setFallbackShifts([]);
        }

        const response = scheduleResponse.data;
        if (!scheduleResponse.error && response?.success && response.schedule) {
          setSchedule({
            ...response.schedule,
            configuration: response.schedule.configuration as WeeklySchedule["configuration"],
          });
        } else {
          setSchedule(null);
        }

        if (!groupColorsResponse.error && groupColorsResponse.data?.success && groupColorsResponse.data.colors) {
          const colorMap: Record<string, string> = {};
          for (const colorEntry of groupColorsResponse.data.colors as Array<{ group_letter: string; color: string }>) {
            colorMap[colorEntry.group_letter] = colorEntry.color;
          }
          setGroupColors(colorMap);
        } else {
          setGroupColors({});
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error fetching consulta schedule:", error);
          setSchedule(null);
          setPublishedShifts([]);
          setFallbackShifts([]);
          setGroupColors({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isoWeek, isoYear, selectedDepartment]);

  const shiftMatrix = useMemo(() => {
    const matrix = new Map<string, Map<string, string[]>>();

    const ensureShiftRow = (shiftKey: string) => {
      if (matrix.has(shiftKey)) return;
      const row = new Map<string, string[]>();
      for (const column of DAY_COLUMNS) {
        row.set(column.key, []);
      }
      matrix.set(shiftKey, row);
    };

    for (const shift of effectiveShifts) {
      ensureShiftRow(shift.shift_key);
    }

    if (!schedule?.configuration) return matrix;

    for (const column of DAY_COLUMNS) {
      const dayConfig = schedule.configuration[column.key] || {};
      for (const team of deptTeams) {
        const cell = dayConfig[team.id];
        if (!cell?.type) continue;
        ensureShiftRow(cell.type);
        matrix.get(cell.type)?.get(column.key)?.push(team.id);
        if (cell.partial_shift) {
          ensureShiftRow(cell.partial_shift);
        }
      }
    }

    return matrix;
  }, [deptTeams, effectiveShifts, schedule]);

  const partialDeductions = useMemo(() => {
    const next: Record<string, number> = {};

    if (!schedule?.configuration) return next;

    for (const column of DAY_COLUMNS) {
      const dayConfig = schedule.configuration[column.key] || {};

      for (const team of deptTeams) {
        const cell = dayConfig[team.id];
        if (!cell?.partial_shift || !cell.partial_count || cell.partial_count <= 0) continue;

        const displayKey = displayGroupKeyByTeamId.get(team.id) ?? normalizeGroupKey(getDerivedDisplayName(team));
        const teamKey = normalizeGroupKey(getTeamLabel(team));
        const primaryGroupKey = `${displayKey}|${column.key}|${cell.type}`;
        const primaryTeamKey = `${teamKey}|${column.key}|${cell.type}`;

        next[primaryGroupKey] = (next[primaryGroupKey] || 0) + cell.partial_count;
        next[primaryTeamKey] = (next[primaryTeamKey] || 0) + cell.partial_count;
      }
    }

    return next;
  }, [deptTeams, displayGroupKeyByTeamId, schedule]);

  const partialMatrix = useMemo(() => {
    const matrix = new Map<string, Map<string, DisplayGroup[]>>();

    const ensureDayMap = (shiftKey: string) => {
      if (matrix.has(shiftKey)) return matrix.get(shiftKey)!;
      const dayMap = new Map<string, DisplayGroup[]>();
      for (const column of DAY_COLUMNS) {
        dayMap.set(column.key, []);
      }
      matrix.set(shiftKey, dayMap);
      return dayMap;
    };

    if (!schedule?.configuration) return matrix;

    for (const column of DAY_COLUMNS) {
      const dayConfig = schedule.configuration[column.key] || {};
      const grouped = new Map<string, { displayGroupKey: string; teams: WorkerTeam[]; counts: number[]; shiftKey: string }>();

      for (const team of deptTeams) {
        const cell = dayConfig[team.id];
        if (!cell?.partial_shift || !cell.partial_count || cell.partial_count <= 0) continue;

        const displayGroupKey = displayGroupKeyByTeamId.get(team.id) ?? normalizeGroupKey(getDerivedDisplayName(team));
        const key = `${cell.partial_shift}|${displayGroupKey}`;
        const current = grouped.get(key);

        if (current) {
          current.teams.push(team);
          current.counts.push(cell.partial_count);
        } else {
          grouped.set(key, {
            displayGroupKey,
            teams: [team],
            counts: [cell.partial_count],
            shiftKey: cell.partial_shift,
          });
        }
      }

      for (const item of grouped.values()) {
        const allTeamsInGroup = teamsByDisplayGroup.get(item.displayGroupKey) ?? item.teams;
        const isWholeGroup = allTeamsInGroup.length > 0 && item.teams.length === allTeamsInGroup.length;

        if (isWholeGroup) {
          const firstCount = item.counts[0] ?? 0;
          const effectiveCount = item.counts.every((count) => count === firstCount)
            ? firstCount
            : item.counts.reduce((sum, count) => sum + count, 0);
          const baseGroup = buildGroupDetails(allTeamsInGroup, {
            visibleCount: effectiveCount,
            badgeLabel: `${effectiveCount} de ${getDerivedDisplayName(allTeamsInGroup[0])}`,
            isPartial: true,
          });

          ensureDayMap(item.shiftKey).set(column.key, [
            ...(ensureDayMap(item.shiftKey).get(column.key) ?? []),
            baseGroup,
          ]);
          continue;
        }

        for (const team of [...item.teams].sort(
          (a, b) => (teamOrderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (teamOrderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        )) {
          const count = dayConfig[team.id]?.partial_count ?? 0;
          if (count <= 0) continue;

          const teamLabel = getTeamLabel(team);
          const partialEntry = buildGroupDetails([team], {
            displayName: teamLabel,
            key: normalizeGroupKey(teamLabel),
            visibleCount: count,
            badgeLabel: `${count} de ${teamLabel}`,
            isPartial: true,
          });

          ensureDayMap(item.shiftKey).set(column.key, [
            ...(ensureDayMap(item.shiftKey).get(column.key) ?? []),
            partialEntry,
          ]);
        }
      }
    }

    for (const [shiftKey, dayMap] of matrix.entries()) {
      for (const column of DAY_COLUMNS) {
        const groups = dayMap.get(column.key) ?? [];
        dayMap.set(
          column.key,
          [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName, "es")),
        );
      }
      matrix.set(shiftKey, dayMap);
    }

    return matrix;
  }, [buildGroupDetails, deptTeams, displayGroupKeyByTeamId, schedule, teamOrderIndex, teamsByDisplayGroup]);

  const buildDisplayGroups = useCallback(
    (teamIds: string[], dayKey: string, shiftKey: string): DisplayGroup[] => {
      const grouped = new Map<string, WorkerTeam[]>();

      for (const teamId of teamIds) {
        const team = teamById.get(teamId);
        if (!team) continue;

        const key = displayGroupKeyByTeamId.get(team.id) ?? normalizeGroupKey(getDerivedDisplayName(team));
        const current = grouped.get(key) ?? [];
        current.push(team);
        grouped.set(key, current);
      }

      return Array.from(grouped.entries())
        .flatMap(([key, teams]) => {
          const allTeamsInGroup = teamsByDisplayGroup.get(key) ?? teams;
          const isWholeGroup = allTeamsInGroup.length > 0 && teams.length === allTeamsInGroup.length;
          const baseEntries = isWholeGroup
            ? [buildGroupDetails(allTeamsInGroup)]
            : [...teams]
                .sort(
                  (a, b) =>
                    (teamOrderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (teamOrderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER),
                )
                .map((team) => {
                  const teamLabel = getTeamLabel(team);
                  return buildGroupDetails([team], {
                    displayName: teamLabel,
                    key: normalizeGroupKey(teamLabel),
                  });
                });

          return baseEntries
            .map((entry) => {
              const deduction = partialDeductions[`${entry.key}|${dayKey}|${shiftKey}`] || 0;

              return {
                ...entry,
                visibleCount: Math.max(0, entry.visibleCount - deduction),
              } satisfies DisplayGroup;
            })
            .filter((entry) => entry.visibleCount > 0);
        })
        .sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName, "es"));
    },
    [buildGroupDetails, displayGroupKeyByTeamId, partialDeductions, teamById, teamOrderIndex, teamsByDisplayGroup],
  );

  const getSpecialWindows = useCallback(
    (shiftKey: string, dayKey: string) => {
      if (!schedule?.configuration) return [] as string[];

      const shift = shiftByKey.get(shiftKey);
      if (!shift || shift.is_rest || shift.shift_key === "rest") return [] as string[];

      const dayConfig = schedule.configuration[dayKey] || {};
      const windows = new Set<string>();

      for (const team of deptTeams) {
        const cell = dayConfig[team.id];
        if (!cell) continue;

        if (cell.type === shiftKey) {
          const start = formatTime(cell.start) || formatTime(shift.start_time);
          const end = formatTime(cell.end) || formatTime(shift.end_time);
          const defaultStart = formatTime(shift.start_time);
          const defaultEnd = formatTime(shift.end_time);

          if ((start && start !== defaultStart) || (end && end !== defaultEnd)) {
            windows.add(`${start || "--:--"}–${end || "--:--"}`);
          }
        }

        if (cell.partial_shift === shiftKey) {
          const start = formatTime(cell.partial_start) || formatTime(shift.start_time);
          const end = formatTime(cell.partial_end) || formatTime(shift.end_time);
          const defaultStart = formatTime(shift.start_time);
          const defaultEnd = formatTime(shift.end_time);

          if ((start && start !== defaultStart) || (end && end !== defaultEnd)) {
            windows.add(`${start || "--:--"}–${end || "--:--"}`);
          }
        }
      }

      return Array.from(windows.values()).sort();
    },
    [deptTeams, schedule, shiftByKey],
  );

  const getDayDate = useCallback(
    (dayKey: string) => {
      const index = Number(dayKey);
      return index === 0 ? addDays(weekStart, -1) : addDays(weekStart, index - 1);
    },
    [weekStart],
  );

  const hasShiftContent = useCallback(
    (shiftKey: string) =>
      DAY_COLUMNS.some((column) => {
        const fullCount = (shiftMatrix.get(shiftKey)?.get(column.key) ?? []).length;
        const partialCount = (partialMatrix.get(shiftKey)?.get(column.key) ?? []).length;
        return fullCount > 0 || partialCount > 0;
      }),
    [partialMatrix, shiftMatrix],
  );

  const activeShifts = useMemo(() => {
    const matrixShiftKeys = Array.from(shiftMatrix.keys());
    const partialShiftKeys = Array.from(partialMatrix.keys());
    const knownShiftKeys = new Set(effectiveShifts.map((shift) => shift.shift_key));
    const baseSortOrder = effectiveShifts.length > 0 ? effectiveShifts[effectiveShifts.length - 1].sort_order ?? 0 : 100;

    const dynamicShifts: DepartmentShift[] = Array.from(new Set([...matrixShiftKeys, ...partialShiftKeys]))
      .filter((shiftKey) => !knownShiftKeys.has(shiftKey))
      .map((shiftKey, index) => ({
        id: shiftKey,
        name: shiftKey,
        shift_key: shiftKey,
        color: "hsl(var(--muted-foreground))",
        start_time: null,
        end_time: null,
        is_rest: shiftKey === "rest",
        sort_order: baseSortOrder + index + 1,
      }));

    return [...effectiveShifts, ...dynamicShifts]
      .filter((shift) => !shift.is_rest && shift.shift_key !== "rest" && hasShiftContent(shift.shift_key))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [effectiveShifts, hasShiftContent, partialMatrix, shiftMatrix]);

  if (!selectedDepartment) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Selecciona un departamento</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!schedule ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          No hay horario publicado para esta semana.
        </div>
      ) : activeShifts.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          No hay turnos asignados esta semana.
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-border bg-card hidden md:block">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
            <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">{departmentName}</h3>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={() => setWeekStart(subWeeks(weekStart, 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>

              <button
                type="button"
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                  className="rounded-lg border border-border px-2.5 py-1 text-right transition-colors hover:bg-muted/50"
              >
                <div className="text-xs font-medium text-muted-foreground">S{isoWeek}</div>
                  <div className="text-xs font-medium text-foreground">
                  {format(getDayDate("0"), "dd MMM", { locale: es })} – {format(weekEnd, "dd MMM", { locale: es })}
                </div>
              </button>

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={() => setWeekStart(addWeeks(weekStart, 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Day headers row */}
          <div className="grid grid-cols-[minmax(100px,auto)_0.5fr_repeat(5,1fr)_0.5fr] divide-x divide-border border-b border-border">
            <div className="px-2 py-1.5" />
            {DAY_COLUMNS.map((column) => {
              const dayDate = getDayDate(column.key);
              return (
                <div key={column.key} className="px-1 py-1.5 text-center">
                  <div className="text-[10px] text-muted-foreground">
                    {format(dayDate, "dd/MM", { locale: es })}
                  </div>
                  <div className="text-[11px] font-medium capitalize text-foreground">
                    {column.shortLabel}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="divide-y divide-border">
            {activeShifts.map((shift) => {
              const dayMap = shiftMatrix.get(shift.shift_key);
              const shiftWindow = `${formatTime(shift.start_time) || "--:--"} – ${formatTime(shift.end_time) || "--:--"}`;

              return (
                <div key={shift.shift_key} className="grid grid-cols-[minmax(100px,auto)_0.5fr_repeat(5,1fr)_0.5fr] divide-x divide-border">
                  {/* Shift label column */}
                  <div className="flex flex-col justify-center bg-muted/20 px-3 py-1.5">
                    <span className="text-xs font-semibold tracking-tight text-foreground">{shift.name}</span>
                    {shift.start_time || shift.end_time ? (
                      <span className="text-[10px] text-muted-foreground">{shiftWindow}</span>
                    ) : null}
                  </div>

                  {/* Day columns */}
                  {DAY_COLUMNS.map((column) => {
                    const teamIds = dayMap?.get(column.key) ?? [];
                    const groups = buildDisplayGroups(teamIds, column.key, shift.shift_key);
                    const partialGroups = partialMatrix.get(shift.shift_key)?.get(column.key) ?? [];
                    const entries = [...groups, ...partialGroups].sort(
                      (a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName, "es"),
                    );
                    const specialWindows = getSpecialWindows(shift.shift_key, column.key);
                    const hasSpecialWindow = specialWindows.length > 0;
                    return (
                      <div
                        key={`${shift.shift_key}-${column.key}`}
                        className="min-h-[58px] px-1 py-1.5"
                        style={
                          hasSpecialWindow
                            ? { backgroundColor: "hsl(var(--calendar-half-day) / 0.08)" }
                            : undefined
                        }
                      >
                        {entries.length === 0 ? (
                          <div className="pt-1 text-center text-xs text-muted-foreground/50">—</div>
                        ) : (
                          <div className="space-y-1">
                            {entries.map((group) => (
                              <button
                                key={`${group.key}-${group.badgeLabel || group.displayName}-${group.isPartial ? "partial" : "full"}`}
                                type="button"
                                onClick={() => setSelectedGroup(group)}
                                className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/40"
                              >
                                 <span
                                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: group.color }}
                                />
                                <span
                                  className="min-w-0 truncate text-xs font-medium leading-tight"
                                  style={{ color: group.color, opacity: group.isPartial ? 0.82 : 1 }}
                                >
                                  {group.badgeLabel || group.displayName}
                                </span>
                              </button>
                            ))}

                            {specialWindows.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {specialWindows.map((window) => (
                                  <span
                                     key={window}
                                     className="inline-flex items-baseline gap-1 rounded-full border px-2 py-0.5 text-[10px] leading-none whitespace-nowrap"
                                     style={{
                                       color: "hsl(var(--calendar-half-day-foreground))",
                                       backgroundColor: "hsl(var(--calendar-half-day) / 0.12)",
                                       borderColor: "hsl(var(--calendar-half-day) / 0.45)",
                                     }}
                                  >
                                    <span className="font-semibold">Horario especial:</span>
                                    <span className="font-light">{window}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Mobile layout - vertical cards per shift */}
      {schedule && activeShifts.length > 0 && (
        <div className="md:hidden space-y-3">
          {/* Week navigation */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <button
              type="button"
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="rounded-lg border border-border px-3 py-1.5 transition-colors hover:bg-muted/50 text-center"
            >
              <div className="text-xs font-medium text-muted-foreground">S{isoWeek}</div>
              <div className="text-xs font-medium text-foreground">
                {format(getDayDate("0"), "dd MMM", { locale: es })} – {format(weekEnd, "dd MMM", { locale: es })}
              </div>
            </button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Shift cards */}
          {activeShifts.map((shift) => {
            const dayMap = shiftMatrix.get(shift.shift_key);
            const shiftWindow = `${formatTime(shift.start_time) || "--:--"} – ${formatTime(shift.end_time) || "--:--"}`;

            return (
              <div key={shift.shift_key} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Shift header */}
                <div className="flex items-center gap-2 bg-muted/20 px-3 py-2 border-b border-border/50">
                  <span className="text-xs font-semibold tracking-tight text-foreground">{shift.name}</span>
                  {(shift.start_time || shift.end_time) && (
                    <span className="text-[10px] text-muted-foreground">{shiftWindow}</span>
                  )}
                </div>

                {/* Days list */}
                <div className="divide-y divide-border/40">
                  {DAY_COLUMNS.map((column) => {
                    const teamIds = dayMap?.get(column.key) ?? [];
                    const groups = buildDisplayGroups(teamIds, column.key, shift.shift_key);
                    const partialGroups = partialMatrix.get(shift.shift_key)?.get(column.key) ?? [];
                    const entries = [...groups, ...partialGroups].sort(
                      (a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName, "es"),
                    );
                    const specialWindows = getSpecialWindows(shift.shift_key, column.key);
                    const dayDate = getDayDate(column.key);
                    const isWeekend = column.key === "0" || column.key === "6";

                    if (entries.length === 0) return null;

                    return (
                      <div
                        key={`${shift.shift_key}-${column.key}`}
                        className={`px-3 py-2 ${isWeekend ? "bg-muted/10" : ""}`}
                        style={
                          specialWindows.length > 0
                            ? { backgroundColor: "hsl(var(--calendar-half-day) / 0.08)" }
                            : undefined
                        }
                      >
                        <div className="flex items-start gap-3">
                          {/* Day label */}
                          <div className="w-12 shrink-0 pt-0.5">
                            <div className="text-[10px] text-muted-foreground leading-tight">
                              {format(dayDate, "dd/MM")}
                            </div>
                            <div className="text-xs font-medium capitalize text-foreground leading-tight">
                              {column.shortLabel}
                            </div>
                          </div>

                          {/* Groups */}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap gap-1">
                              {entries.map((group) => (
                                <button
                                  key={`${group.key}-${group.badgeLabel || group.displayName}-${group.isPartial ? "p" : "f"}`}
                                  type="button"
                                  onClick={() => setSelectedGroup(group)}
                                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted/40"
                                >
                                  <span
                                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: group.color }}
                                  />
                                  <span
                                    className="text-xs font-medium leading-tight"
                                    style={{ color: group.color, opacity: group.isPartial ? 0.82 : 1 }}
                                  >
                                    {group.badgeLabel || group.displayName}
                                  </span>
                                </button>
                              ))}
                            </div>
                            {specialWindows.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {specialWindows.map((window) => (
                                  <span
                                    key={window}
                                    className="inline-flex items-baseline gap-1 rounded-full border px-2 py-0.5 text-[9px] leading-none whitespace-nowrap"
                                    style={{
                                      color: "hsl(var(--calendar-half-day-foreground))",
                                      backgroundColor: "hsl(var(--calendar-half-day) / 0.12)",
                                      borderColor: "hsl(var(--calendar-half-day) / 0.45)",
                                    }}
                                  >
                                    <span className="font-semibold">Especial:</span>
                                    <span className="font-light">{window}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(selectedGroup)} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent className="max-w-2xl overflow-hidden p-0 max-h-[90vh]">
          <div className="border-b border-border px-6 py-5">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="flex items-center gap-3 text-xl font-semibold tracking-tight">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: selectedGroup?.color }}
                />
                {selectedGroup?.displayName}
              </DialogTitle>
              <DialogDescription>
                {selectedGroup && selectedGroup.teams.length > 1
                  ? `Incluye: ${selectedGroup.teams.map((team) => team.name).join(", ")}`
                  : selectedGroup?.teams[0]?.name}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 py-5">
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <UserCheck className="h-4 w-4 text-primary" />
                Responsables
              </div>

              {selectedGroup?.responsibles.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {selectedGroup.responsibles.map((responsible) => {
                    const responsibleTeams = selectedGroup.teams
                      .filter((team) => team.responsable_worker_id === responsible.id)
                      .map((team) => team.name);

                    return (
                      <div key={responsible.id} className="rounded-2xl border border-border bg-accent/40 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">{responsible.name}</p>
                            {responsibleTeams.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Responsable de {responsibleTeams.join(", ")}
                              </p>
                            )}
                          </div>
                          <a
                            href={getSalixUrl(responsible.worker_number)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-background"
                          >
                            {responsible.worker_number}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
                  No hay responsable asignado en este grupo.
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  Miembros
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedGroup?.members.length ?? 0} trabajadores
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border">
                {selectedGroup?.members.length ? (
                  <div className="max-h-[360px] divide-y divide-border overflow-y-auto">
                    {selectedGroup.members.map((member) => {
                      const memberTeam = member.worker_team_id ? teamById.get(member.worker_team_id) : null;

                      return (
                        <div key={member.id} className="flex items-center justify-between gap-4 px-4 py-3">
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                            {selectedGroup.teams.length > 1 && memberTeam && (
                              <p className="text-xs text-muted-foreground">{memberTeam.name}</p>
                            )}
                          </div>

                          <a
                            href={getSalixUrl(member.worker_number)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted/30"
                          >
                            {member.worker_number}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-sm text-muted-foreground">No hay miembros asignados en este grupo.</div>
                )}
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
