import { useState, useEffect, useCallback } from "react";
import { format, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Users,
  UserCheck,
  UserX,
  Palmtree,
  Moon,
  CheckSquare,
  XSquare,
} from "lucide-react";

interface LaborWorkforceTabProps {
  managerDepartmentIds?: string[];
}

interface WorkerInfo {
  id: string;
  name: string;
  worker_number: string;
  status: "working" | "leave" | "vacation" | "rest";
  reason: string;
  shift: string;
}

interface TeamInfo {
  id: string;
  name: string;
  workers: WorkerInfo[];
  workingCount: number;
  totalCount: number;
}

interface DepartmentResult {
  id: string;
  name: string;
  teams: TeamInfo[];
  totalWorking: number;
  totalWorkers: number;
}

export function LaborWorkforceTab({ managerDepartmentIds }: LaborWorkforceTabProps = {}) {
  const isManagerMode = !!managerDepartmentIds && managerDepartmentIds.length > 0;
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<DepartmentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDepts, setLoadingDepts] = useState(true);

  // Fetch departments (admin mode) or use provided IDs (manager mode)
  useEffect(() => {
    if (isManagerMode) {
      // In manager mode, we set IDs directly and get names from results
      setSelectedDeptIds(new Set(managerDepartmentIds));
      setLoadingDepts(false);
      return;
    }

    const fetchDepts = async () => {
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) return;

      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getDepartments", sessionToken },
      });

      if (error || !data?.success) {
        console.error("Error fetching departments:", error || data?.error);
        const { data: rpcData } = await supabase.rpc("get_public_departments");
        if (rpcData) {
          const sorted = [...rpcData].sort((a: any, b: any) => a.name.localeCompare(b.name));
          setDepartments(sorted.map((d: any) => ({ id: d.id, name: d.name })));
          setSelectedDeptIds(new Set(sorted.map((d: any) => d.id)));
        }
      } else {
        const sorted = [...(data.departments || [])].sort((a: any, b: any) => a.name.localeCompare(b.name));
        setDepartments(sorted.map((d: any) => ({ id: d.id, name: d.name })));
        setSelectedDeptIds(new Set(sorted.map((d: any) => d.id)));
      }
      setLoadingDepts(false);
    };
    fetchDepts();
  }, [isManagerMode, managerDepartmentIds]);

  // Fetch workforce data
  const fetchWorkforce = useCallback(async () => {
    if (selectedDeptIds.size === 0) {
      setResults([]);
      return;
    }

    const sessionToken = localStorage.getItem("manager_session_token");
    if (!sessionToken) return;

    setLoading(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getWorkforceForDay",
          sessionToken,
          data: {
            date: dateStr,
            departmentIds: Array.from(selectedDeptIds),
          },
        },
      });

      if (error || !data?.success) {
        toast.error("Error al cargar plantilla");
        console.error(error || data?.error);
      } else {
        setResults(data.departments || []);
        // In manager mode, populate department names from results
        if (isManagerMode && data.departments?.length) {
          setDepartments(data.departments.map((d: any) => ({ id: d.id, name: d.name })));
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedDeptIds]);

  useEffect(() => {
    if (!loadingDepts && selectedDeptIds.size > 0) {
      fetchWorkforce();
    }
  }, [fetchWorkforce, loadingDepts]);

  const toggleDept = (id: string) => {
    setSelectedDeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedDeptIds(new Set(departments.map((d) => d.id)));
  const selectNone = () => setSelectedDeptIds(new Set());

  const totalWorking = results.reduce((s, d) => s + d.totalWorking, 0);
  const totalWorkers = results.reduce((s, d) => s + d.totalWorkers, 0);

  const statusIcon = (status: string) => {
    switch (status) {
      case "working":
        return <UserCheck className="h-3.5 w-3.5 text-primary" />;
      case "leave":
        return <UserX className="h-3.5 w-3.5 text-destructive" />;
      case "vacation":
        return <Palmtree className="h-3.5 w-3.5 text-accent-foreground" />;
      case "rest":
        return <Moon className="h-3.5 w-3.5 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const dateLabel = format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es });

  return (
    <div className="space-y-4">
      {/* Date Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate((d) => subDays(d, 1))}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 text-center">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span className="font-medium capitalize text-sm sm:text-base">{dateLabel}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate((d) => addDays(d, 1))}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex justify-center mt-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setSelectedDate(new Date())}
            >
              Hoy
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Department Filter - hide in manager mode with single department */}
      {(!isManagerMode || departments.length > 1) && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Departamentos</CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={selectAll}>
                  <CheckSquare className="h-3 w-3" /> Todos
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={selectNone}>
                  <XSquare className="h-3 w-3" /> Ninguno
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loadingDepts ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                {departments.map((d) => (
                  <label
                    key={d.id}
                    className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors text-sm"
                  >
                    <Checkbox
                      checked={selectedDeptIds.has(d.id)}
                      onCheckedChange={() => toggleDept(d.id)}
                    />
                    <span className="truncate">{d.name}</span>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <span className="font-semibold text-lg">Total trabajando</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <span className="text-2xl font-bold text-primary">
                {totalWorking}
                <span className="text-base font-normal text-muted-foreground"> / {totalWorkers}</span>
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Department Details */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : results.length === 0 && selectedDeptIds.size > 0 ? (
        <p className="text-center text-muted-foreground py-8">Sin datos para esta fecha</p>
      ) : (
        results.map((dept) => (
          <Card key={dept.id}>
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">{dept.name}</CardTitle>
                <Badge variant="secondary" className="text-xs font-medium">
                  {dept.totalWorking} / {dept.totalWorkers}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {dept.teams.map((team) => (
                <div key={team.id} className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className="text-xs">{team.name}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">
                      {team.workingCount}/{team.totalCount}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {team.workers.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center gap-2 py-0.5 text-sm"
                      >
                        {statusIcon(w.status)}
                        {w.worker_number ? (
                          <a
                            href={`https://salix.verdnatura.es/#/worker/${w.worker_number}/time-control`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`hover:underline ${w.status !== "working" ? "text-muted-foreground" : "text-primary font-medium"}`}
                          >
                            {w.name}
                          </a>
                        ) : (
                          <span className={w.status !== "working" ? "text-muted-foreground" : ""}>
                            {w.name}
                          </span>
                        )}
                        {w.worker_number && (
                          <span className="text-xs text-muted-foreground">#{w.worker_number}</span>
                        )}
                        {w.status === "working" && w.shift && (
                          <span className="text-xs text-primary/70 ml-auto">{w.shift}</span>
                        )}
                        {w.status !== "working" && w.reason && (
                          <span className="text-xs text-muted-foreground ml-auto">{w.reason}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
