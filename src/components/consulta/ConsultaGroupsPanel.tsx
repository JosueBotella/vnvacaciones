import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

type Department = { id: string; name: string };
type WorkerTeam = {
  id: string;
  name: string;
  department_id: string;
  work_group_name: string | null;
  work_group_color: string | null;
  display_name?: string;
};
type Worker = {
  id: string;
  name: string;
  worker_number: string;
  worker_team_id: string | null;
  department_id: string;
  is_on_leave?: boolean;
};

interface Props {
  departments: Department[];
  selectedDepartment: string;
  workerTeams: WorkerTeam[];
  workers: Worker[];
}

export function ConsultaGroupsPanel({ departments, selectedDepartment, workerTeams, workers }: Props) {
  const deptTeams = workerTeams.filter(t => t.department_id === selectedDepartment);
  const deptWorkers = workers.filter(w => w.department_id === selectedDepartment);
  const workersOnLeave = deptWorkers.filter(w => w.is_on_leave).length;
  const unassignedWorkers = deptWorkers.filter(w => !w.worker_team_id);

  // Group teams by display_name (matches admin view)
  const groupedTeams: Record<string, typeof deptTeams> = {};
  deptTeams.forEach(team => {
    const groupKey = team.display_name || team.work_group_name || `Grupo ${team.name.charAt(0).toUpperCase()}`;
    if (!groupedTeams[groupKey]) groupedTeams[groupKey] = [];
    groupedTeams[groupKey].push(team);
  });
  const sortedPrefixes = Object.keys(groupedTeams).sort();

  const deptName = departments.find(d => d.id === selectedDepartment)?.name;

  return (
    <Card className="shadow-md">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-lg md:text-xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5" />
            Equipos de Trabajo
          </CardTitle>
          <Badge variant="secondary">{deptWorkers.length} trabajadores</Badge>
          {workersOnLeave > 0 && (
            <Badge variant="destructive">{workersOnLeave} de baja</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {deptName || "Selecciona un departamento"}
        </p>
      </CardHeader>
      <CardContent>
        {!selectedDepartment ? (
          <div className="text-center py-8 text-muted-foreground">
            Selecciona un departamento
          </div>
        ) : deptTeams.length === 0 && unassignedWorkers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay equipos en este departamento
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedPrefixes.map((prefix) => {
                const teamsInGroup = groupedTeams[prefix].sort((a, b) =>
                  a.name.localeCompare(b.name, undefined, { numeric: true })
                );
                const totalWorkersInGroup = teamsInGroup.reduce((acc, team) =>
                  acc + workers.filter(w => w.worker_team_id === team.id).length, 0
                );

                return (
                  <div key={prefix} className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-primary">{prefix}</span>
                      <Badge variant="outline" className="text-[10px] ml-auto">{totalWorkersInGroup}</Badge>
                    </div>
                    {teamsInGroup.map((team, index) => {
                      const teamWorkers = workers.filter(w => w.worker_team_id === team.id).sort((a, b) => a.name.localeCompare(b.name));
                      return (
                        <Card
                          key={team.id}
                          className="border-border/30 animate-fade-in-up"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2 mb-1.5">
                              {team.work_group_color && (
                                <div
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: team.work_group_color }}
                                />
                              )}
                              <h4 className="font-medium text-xs">{team.name}</h4>
                              <span className="text-[10px] text-muted-foreground ml-auto">{teamWorkers.length}</span>
                            </div>
                            {teamWorkers.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {teamWorkers.map((worker) => (
                                  <a
                                    key={worker.id}
                                    href={`https://salix.verdnatura.es/#/worker/${worker.worker_number}/calendar`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 transition-colors"
                                    title={`${worker.name} (${worker.worker_number})`}
                                  >
                                    {worker.name}
                                    <span className="ml-1 text-[9px] opacity-60">({worker.worker_number})</span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {/* Sin equipo — full width at bottom */}
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
                      {unassignedWorkers.sort((a, b) => a.name.localeCompare(b.name)).map((worker) => (
                        <a
                          key={worker.id}
                          href={`https://salix.verdnatura.es/#/worker/${worker.worker_number}/calendar`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 transition-colors"
                        >
                          {worker.name}
                          <span className="ml-1 text-[9px] opacity-60">({worker.worker_number})</span>
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
