import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Search, Loader2, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Department = { id: string; name: string };
type WorkerTeam = { id: string; name: string; department_id: string; department_name: string; work_group_name: string | null; work_group_color: string | null; display_name?: string };
type Worker = { id: string; name: string; worker_number: string; worker_code: string | null; worker_team_id: string | null; work_group_id: string | null; department_id: string; is_on_leave?: boolean };
type WorkGroup = { id: string; name: string; color: string; department_id: string; sort_order: number };

export function AdminTrabajadoresTab() {
  const navigate = useNavigate();
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [departments, setDepartments] = useState<Department[]>([]);
  const [workerTeams, setWorkerTeams] = useState<WorkerTeam[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState("all");
  const [search, setSearch] = useState("");
  const salixOpenedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [deptRes, groupsRes] = await Promise.all([
        supabase.functions.invoke("admin-operations", {
          body: { action: "getManagerDepartments", sessionToken },
        }),
        supabase.functions.invoke("admin-operations", {
          body: { action: "getManagerWorkerGroups", sessionToken },
        }),
      ]);
      if (deptRes.data?.success) setDepartments(deptRes.data.departments || []);
      if (groupsRes.data?.success) {
        setWorkerTeams(groupsRes.data.workerTeams || []);
        setWorkers(groupsRes.data.workers || []);
        setWorkGroups(groupsRes.data.workGroups || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  const normalizeStr = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filteredWorkers = search
    ? workers.filter(w => normalizeStr(w.name).includes(normalizeStr(search)) || (w.worker_number || "").includes(search) || (w.worker_code && normalizeStr(w.worker_code).includes(normalizeStr(search))))
    : workers;

  const activeDeptId = selectedDept !== "all" ? selectedDept : null;
  const filteredDepts = activeDeptId ? departments.filter(d => d.id === activeDeptId) : departments;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  

  const renderWorkerChip = (worker: Worker) => {
    const wgColor = worker.work_group_id
      ? workGroups.find(g => g.id === worker.work_group_id)?.color
      : null;

    const chip = (
      <button
        key={worker.id}
        onMouseDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && worker.worker_number) {
            e.preventDefault();
            e.stopPropagation();
            salixOpenedRef.current = true;
            window.open(`https://salix.verdnatura.es/#!/worker/${worker.worker_number}/summary`, '_blank');
          } else {
            salixOpenedRef.current = false;
          }
        }}
        onClick={(e) => {
          if (salixOpenedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            salixOpenedRef.current = false;
            return;
          }
          navigate('/admin/worker/' + worker.id);
        }}
        className={cn(
          "text-[10px] px-1.5 py-0.5 rounded transition-colors cursor-pointer hover:opacity-80",
          worker.is_on_leave ? "bg-destructive/20 text-destructive line-through"
            : !wgColor ? "bg-muted text-foreground hover:bg-muted/80"
            : ""
        )}
        style={!worker.is_on_leave && wgColor ? {
          backgroundColor: wgColor + '30',
          color: wgColor
        } : undefined}
       >
         {worker.name}
         {worker.worker_code && (
           <span className="ml-1 text-[9px] opacity-60 font-mono">[{worker.worker_code}]</span>
         )}
         {worker.worker_number && (
           <span
             className="ml-1 text-[9px] opacity-70 hover:opacity-100 hover:underline"
             onMouseDown={(e) => {
               e.stopPropagation();
               salixOpenedRef.current = true;
               window.open(`https://salix.verdnatura.es/#!/worker/${worker.worker_number}/summary`, '_blank');
             }}
             onClick={(e) => { e.stopPropagation(); }}
           >
             ({worker.worker_number})
             <ExternalLink className="inline h-2 w-2 ml-0.5" />
           </span>
         )}
      </button>
    );

    if (!worker.worker_number) return chip;

    return (
      <Tooltip key={worker.id}>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        <TooltipContent side="top" className="text-[10px]">
          ⌘/Ctrl + Click → Salix
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderDeptTeams = (dept: Department) => {
    const deptTeams = workerTeams.filter(t => t.department_id === dept.id);
    const deptWorkers = filteredWorkers.filter(w => w.department_id === dept.id);
    const unassignedWorkers = deptWorkers.filter(w => !w.worker_team_id);
    if (deptTeams.length === 0 && unassignedWorkers.length === 0) return null;

    const groupedTeams: { [key: string]: typeof deptTeams } = {};
    deptTeams.forEach(team => {
      const p = team.display_name || `Grupo ${team.name.charAt(0).toUpperCase()}`;
      if (!groupedTeams[p]) groupedTeams[p] = [];
      groupedTeams[p].push(team);
    });

    return (
      <div key={dept.id} className="space-y-4">
        <div className="flex items-center gap-3 border-b border-border/30 pb-2">
          <h3 className="font-semibold text-sm text-foreground">{dept.name}</h3>
          <Badge variant="secondary" className="text-[10px]">{deptWorkers.length} trab.</Badge>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Object.keys(groupedTeams).sort().map(prefix => {
            const teams = groupedTeams[prefix].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            return (
              <div key={prefix} className="space-y-2">
                <span className="text-xs font-medium text-primary">{prefix}</span>
                {teams.map(team => {
                  const tw = filteredWorkers.filter(w => w.worker_team_id === team.id);
                  return (
                    <Card key={team.id} className="border-border/30">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          {team.work_group_color && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: team.work_group_color }} />}
                          <h4 className="font-medium text-xs">{team.name}</h4>
                          <span className="text-[10px] text-muted-foreground ml-auto">{tw.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {tw.map(renderWorkerChip)}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })}
          {unassignedWorkers.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-destructive">Sin equipo</span>
              <Card className="border-destructive/40 bg-destructive/5">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-destructive/50" />
                    <h4 className="font-medium text-xs text-destructive">Sin asignar</h4>
                    <span className="text-[10px] text-destructive/70 ml-auto">{unassignedWorkers.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {unassignedWorkers.map(renderWorkerChip)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={400}>
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar trabajador..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 rounded-xl h-11"
        />
      </div>

      {/* Department pills */}
      {departments.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setSelectedDept("all")}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              selectedDept === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            Todas ({workers.length})
          </button>
          {departments.map(dept => (
            <button
              key={dept.id}
              onClick={() => setSelectedDept(dept.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                selectedDept === dept.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {dept.name}
            </button>
          ))}
        </div>
      )}

      {/* Teams grouped by department */}
      {filteredDepts.length === 0 ? (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No se encontraron trabajadores</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {filteredDepts.map(d => renderDeptTeams(d))}
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}
