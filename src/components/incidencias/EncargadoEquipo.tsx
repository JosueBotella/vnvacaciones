import { useState, useEffect, useCallback } from "react";
import { Users, Search, ExternalLink, Loader2, AlertTriangle, Clock, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { IncidenciasUserContext } from "@/modules/control-incidencias/core/types";

interface Props {
  userContext: IncidenciasUserContext;
  onViewHistory?: (workerId: string) => void;
}

interface WorkerWithCount {
  id: string;
  nombre: string;
  apellidos: string | null;
  worker_number: string | null;
  worker_code?: string | null;
  external_url_salix: string | null;
  department_id: string;
  incidentCount: number;
}

const medalColors = ["#FFD700", "#C0C0C0", "#CD7F32"];

export function EncargadoEquipo({ userContext, onViewHistory }: Props) {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [workers, setWorkers] = useState<WorkerWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const allWorkers: WorkerWithCount[] = [];
      for (const deptId of userContext.departmentIds) {
        const [workersRes, countsRes] = await Promise.all([
          supabase.functions.invoke("incidencias-operations", {
            body: { action: "listIncidenciasWorkers", sessionToken, departmentId: deptId },
          }),
          supabase.functions.invoke("incidencias-operations", {
            body: { action: "getWorkerIncidentCount", sessionToken, departmentId: deptId },
          }),
        ]);
        const counts = countsRes.data?.counts || {};
        for (const w of (workersRes.data?.workers || [])) {
          allWorkers.push({ ...w, incidentCount: counts[w.id] || 0 });
        }
      }

      // If workerTeamIds is defined (responsable), filter to only workers in those teams
      let filtered = allWorkers;
      if (userContext.workerTeamIds && userContext.workerTeamIds.length > 0) {
        try {
          // Fetch workers from ERP that belong to the responsable's teams
          const { data: teamWorkersRes } = await supabase.functions.invoke("incidencias-operations", {
            body: { action: "getWorkersByTeams", sessionToken, teamIds: userContext.workerTeamIds },
          });
          if (teamWorkersRes?.success && teamWorkersRes.workers) {
            const teamWorkerIds = new Set(
              (teamWorkersRes.workers as Array<{ id: string }>).map(w => w.id)
            );
            const teamWorkerNumbers = new Set(
              (teamWorkersRes.workers as Array<{ id: string; worker_number?: string }>)
                .filter(w => w.worker_number)
                .map(w => w.worker_number!)
            );
            filtered = allWorkers.filter(w =>
              teamWorkerIds.has(w.id) || (w.worker_number && teamWorkerNumbers.has(w.worker_number))
            );
          }
        } catch { /* fallback to all workers */ }
      }

      filtered.sort((a, b) => b.incidentCount - a.incidentCount);
      setWorkers(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, userContext.departmentIds, userContext.workerTeamIds]);

  useEffect(() => { load(); }, [load]);

  const filtered = workers.filter(w => {
    if (!search) return true;
    const q = search.toLowerCase();
    return w.nombre.toLowerCase().includes(q) || (w.apellidos || "").toLowerCase().includes(q) || (w.worker_number || "").toLowerCase().includes(q) || (w.worker_code || "").toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Top 3 with incidents for medal display
  const top3 = filtered.filter(w => w.incidentCount > 0).slice(0, 3);
  const rest = filtered.slice(top3.length);

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Mi equipo</h2>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input placeholder="Buscar trabajador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 rounded-xl h-14 text-base" />
      </div>

      {/* Top 3 podium */}
      {top3.length > 0 && (
        <div className="flex gap-3 justify-center">
          {top3.map((w, i) => {
            const fullName = [w.nombre, w.apellidos].filter(Boolean).join(" ");
            return (
              <button
                key={w.id}
                onClick={() => onViewHistory?.(w.id)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-card border border-border/30 shadow-sm hover:shadow-md transition-shadow flex-1 max-w-[120px]"
              >
                <div className="relative">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">{w.nombre.charAt(0)}</span>
                  </div>
                  <div
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ backgroundColor: medalColors[i], color: i === 0 ? '#000' : '#fff' }}
                  >
                    {i + 1}
                  </div>
                </div>
                <span className="text-xs font-medium text-center truncate w-full">{fullName}</span>
                <Badge variant="secondary" className="gap-0.5 text-[10px]">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {w.incidentCount}
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      {/* Rest of workers */}
      {filtered.length === 0 ? (
        <Card className="rounded-2xl border-border/30">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No hay trabajadores</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rest.map(w => {
            const fullName = [w.nombre, w.apellidos].filter(Boolean).join(" ");
            return (
              <Card key={w.id} className="rounded-2xl border-border/30">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-base font-semibold text-primary">{w.nombre.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{fullName}</p>
                    {w.worker_number && <p className="text-xs text-muted-foreground">Nº {w.worker_number}</p>}
                  </div>
                  {w.incidentCount > 0 && (
                    <Badge variant="secondary" className="gap-0.5 text-xs">
                      <AlertTriangle className="h-3 w-3" />
                      {w.incidentCount}
                    </Badge>
                  )}
                  {onViewHistory && (
                    <Button variant="outline" size="sm" className="h-10 px-3 rounded-xl text-xs" onClick={() => onViewHistory(w.id)}>
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      Historial
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
