import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, UsersRound, Calendar, Palette } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import LoadingScreen from "@/components/LoadingScreen";
import { useManagerAuth } from "@/hooks/useManagerAuth";


type WorkGroup = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
};

type WorkerTeam = {
  id: string;
  department_id: string;
  name: string;
  sort_order: number;
  display_name?: string;
};

type WorkGroupTeam = {
  id: string;
  work_group_id: string;
  worker_team_id: string;
};

type Worker = {
  id: string;
  name: string;
  worker_team_id: string | null;
  work_group_id: string | null;
};
// Normalize slug by removing accents, special characters, and dashes
const normalizeSlug = (slug: string): string => {
  return slug
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, ''); // Remove all non-alphanumeric (including dashes)
};

const PublicGroups = () => {
  const { departmentSlug: rawDepartmentSlug } = useParams<{ departmentSlug: string }>();
  const navigate = useNavigate();
  const departmentSlug = rawDepartmentSlug ? normalizeSlug(rawDepartmentSlug) : '';
  const { isAuthenticated: isManagerAuthenticated, isLoading: isManagerLoading } = useManagerAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Access control
  const [authResolved, setAuthResolved] = useState(false);
  const [canViewGroups, setCanViewGroups] = useState(false);
  
  const [departmentName, setDepartmentName] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [workerTeams, setWorkerTeams] = useState<WorkerTeam[]>([]);
  const [workGroupTeams, setWorkGroupTeams] = useState<WorkGroupTeam[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  
  // Modal state
  const [selectedTeam, setSelectedTeam] = useState<WorkerTeam | null>(null);
  
  // Sorting mode for Cámara department
  const [sortMode, setSortMode] = useState<"team" | "color">("team");

  // Access logic:
  // - If a worker is logged in -> redirect to personal calendar
  // - Else if a manager is logged in -> allow groups view
  // - Else -> redirect to schedule login
  useEffect(() => {
    if (isManagerLoading) return;

    const checkAccess = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const workerId = session?.user?.user_metadata?.worker_id;

        if (workerId) {
          navigate('/mi-horario', { replace: true });
          return;
        }

        if (isManagerAuthenticated) {
          setCanViewGroups(true);
          setAuthResolved(true);
          return;
        }

        // Redirect to dedicated schedule login
        navigate('/horario-login', { replace: true });
      } catch (err) {
        console.error('Auth check error:', err);
        navigate('/horario-login', { replace: true });
      }
    };

    checkAccess();
  }, [isManagerLoading, isManagerAuthenticated, navigate]);

  useEffect(() => {
    if (!authResolved || !canViewGroups) return;
    if (departmentSlug) {
      fetchData();
    }
  }, [authResolved, canViewGroups, departmentSlug]);

  useEffect(() => {
    if (!departmentId) return;

    const workersChannel = supabase
      .channel('public-groups-workers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workers' }, () => fetchData())
      .subscribe();

    const teamsChannel = supabase
      .channel('public-groups-teams')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'worker_teams' }, () => fetchData())
      .subscribe();

    const groupsChannel = supabase
      .channel('public-groups-work-groups')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_groups' }, () => fetchData())
      .subscribe();

    const assignmentsChannel = supabase
      .channel('public-groups-assignments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_group_teams' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(workersChannel);
      supabase.removeChannel(teamsChannel);
      supabase.removeChannel(groupsChannel);
      supabase.removeChannel(assignmentsChannel);
    };
  }, [departmentId]);

  const fetchData = async () => {
    try {
      // Fetch all departments and find by normalized slug
      const { data: allDepts, error: deptError } = await supabase
        .from('departments_public')
        .select('id, name, slug');

      if (deptError || !allDepts) {
        setError("Departamento no encontrado");
        setLoading(false);
        return;
      }

      // Find department by comparing normalized slugs
      const deptData = allDepts.find(dept => 
        dept.slug && normalizeSlug(dept.slug) === departmentSlug
      );

      if (!deptData) {
        setError("Departamento no encontrado");
        setLoading(false);
        return;
      }

      setDepartmentName(deptData.name || "");
      setDepartmentId(deptData.id);

      // Get manager session token
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) {
        setError("Sesión no válida");
        setLoading(false);
        return;
      }

      // Fetch calendar data via edge function (includes groups, teams, assignments)
      const { data: calendarResponse, error: calError } = await supabase.functions.invoke('annual-calendar-operations', {
        body: {
          action: 'getPublicCalendarData',
          sessionToken,
          departmentId: deptData.id,
        }
      });

      if (calError || !calendarResponse?.success) {
        console.error('Error fetching calendar data:', calError || calendarResponse?.error);
        // Fall back to empty arrays - page can still work with just workers
      } else {
        setWorkGroups(calendarResponse.groups || []);
        setWorkerTeams(calendarResponse.workerTeams || []);
        setWorkGroupTeams(calendarResponse.workGroupTeams || []);
      }

      // Use security definer function to get workers (names only, no PII)
      const { data: workersData } = await supabase
        .rpc('get_public_workers_by_department', { p_department_id: deptData.id });

      setWorkers(workersData || []);

    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const getWorkersForTeam = (teamId: string) => {
    return workers.filter(w => w.worker_team_id === teamId);
  };

  const groupTeamsByPrefix = (teams: WorkerTeam[]) => {
    const grouped: Record<string, WorkerTeam[]> = {};
    teams.forEach(team => {
      const prefix = team.display_name || `Grupo ${team.name.charAt(0).toUpperCase()}`;
      if (!grouped[prefix]) grouped[prefix] = [];
      grouped[prefix].push(team);
    });
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => a.name.localeCompare(b.name));
    });
    return grouped;
  };

  const getGroupColorForTeam = (teamId: string) => {
    for (const group of workGroups) {
      const groupTeamIds = workGroupTeams
        .filter(wgt => wgt.work_group_id === group.id)
        .map(wgt => wgt.worker_team_id);
      if (groupTeamIds.includes(teamId)) {
        return group.color;
      }
    }
    return '#71717a';
  };

  // Get worker's individual vacation group color
  const getWorkerVacationColor = (workerId: string) => {
    const worker = workers.find(w => w.id === workerId);
    if (worker?.work_group_id) {
      const group = workGroups.find(g => g.id === worker.work_group_id);
      if (group) return group.color;
    }
    return null;
  };

  // Check if this is the Cámara department
  const isCamaraDepartment = departmentName.toLowerCase() === "cámara";

  // Get workers grouped by their vacation color (for Cámara department)
  const getWorkersGroupedByVacationColor = () => {
    const grouped: { [groupId: string]: { group: WorkGroup; workers: Worker[] } } = {};
    const noGroup: Worker[] = [];
    
    workers.forEach(worker => {
      if (worker.work_group_id) {
        const group = workGroups.find(g => g.id === worker.work_group_id);
        if (group) {
          if (!grouped[group.id]) {
            grouped[group.id] = { group, workers: [] };
          }
          grouped[group.id].workers.push(worker);
        } else {
          noGroup.push(worker);
        }
      } else {
        noGroup.push(worker);
      }
    });
    
    return { grouped, noGroup };
  };

  // For Cámara in color mode, only count workers with assigned vacation groups
  const totalWorkers = isCamaraDepartment && sortMode === "color" 
    ? workers.filter(w => w.work_group_id && workGroups.some(g => g.id === w.work_group_id)).length
    : workers.length;

  if (!authResolved) return <LoadingScreen />;
  if (!canViewGroups) return <LoadingScreen />;
  if (loading) return <LoadingScreen />;

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md text-center">
          <UsersRound className="h-14 w-14 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Error</h2>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const groupedTeams = groupTeamsByPrefix(workerTeams);
  const sortedPrefixes = Object.keys(groupedTeams).sort();
  
  // Calculate if we should use horizontal layout (like in admin)
  // If average teams per group is <= 2 and we have 3+ groups, use horizontal multi-column layout
  const avgTeamsPerGroup = workerTeams.length / Math.max(sortedPrefixes.length, 1);
  const useHorizontalLayout = avgTeamsPerGroup <= 2 && sortedPrefixes.length >= 3;

  return (
    <div className="min-h-screen bg-background">
      {/* Header - matching PublicCalendarPdf style */}
      <header className="glass-header">
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <img 
              src="/images/verdnatura-logo-green.png" 
              alt="Verdnatura" 
              className="h-6 sm:h-8"
            />
            <div className="hidden sm:block h-6 w-px bg-border" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-semibold text-foreground truncate">
                Grupos de Trabajo
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">{departmentName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Sorting toggle - only for Cámara */}
            {isCamaraDepartment && (
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                <Button
                  size="sm"
                  variant={sortMode === "team" ? "default" : "ghost"}
                  onClick={() => setSortMode("team")}
                  className="h-7 text-xs gap-1"
                >
                  <UsersRound className="h-3 w-3" />
                  <span className="hidden sm:inline">Equipo</span>
                </Button>
                <Button
                  size="sm"
                  variant={sortMode === "color" ? "default" : "ghost"}
                  onClick={() => setSortMode("color")}
                  className="h-7 text-xs gap-1"
                >
                  <Palette className="h-3 w-3" />
                  <span className="hidden sm:inline">Color</span>
                </Button>
              </div>
            )}
            <Link to={`/calendario/${departmentSlug}`}>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground h-8 sm:h-9">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline text-sm">Ver Calendario</span>
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Stats */}
        <div className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full w-fit">
          <Users className="h-4 w-4" />
          <span className="text-sm font-medium">{totalWorkers} trabajadores</span>
        </div>

        {/* Cámara department with color mode */}
        {isCamaraDepartment && sortMode === "color" ? (
          (() => {
            const { grouped, noGroup } = getWorkersGroupedByVacationColor();
            const sortedGroups = Object.values(grouped).sort((a, b) => 
              a.group.name.localeCompare(b.group.name, undefined, { numeric: true })
            );
            
            return (
              <div className="space-y-6">
                {sortedGroups.map(({ group, workers: groupWorkers }, groupIndex) => {
                  const sortedWorkers = groupWorkers.sort((a, b) => {
                    const teamA = workerTeams.find(t => t.id === a.worker_team_id)?.name || "zzz";
                    const teamB = workerTeams.find(t => t.id === b.worker_team_id)?.name || "zzz";
                    if (teamA !== teamB) return teamA.localeCompare(teamB, undefined, { numeric: true });
                    return a.name.localeCompare(b.name);
                  });
                  
                  return (
                    <section 
                      key={group.id}
                      className="opacity-0 animate-fade-in"
                      style={{ animationDelay: `${groupIndex * 100}ms`, animationFillMode: 'forwards' }}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div 
                          className="w-4 h-4 rounded-full shadow-sm"
                          style={{ backgroundColor: group.color }}
                        />
                        <h2 className="text-lg font-semibold" style={{ color: group.color }}>{group.name}</h2>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {sortedWorkers.length} trabajador{sortedWorkers.length !== 1 ? 'es' : ''}
                        </span>
                      </div>
                      
                      <div className="bg-card border border-border/60 rounded-xl p-4 sm:p-5">
                        <div className="flex flex-wrap gap-2">
                          {sortedWorkers.map((worker, i) => {
                            const team = workerTeams.find(t => t.id === worker.worker_team_id);
                            return (
                              <span 
                                key={worker.id}
                                className="text-xs sm:text-sm px-3 py-1.5 rounded-lg opacity-0 animate-fade-in"
                                style={{ 
                                  color: group.color,
                                  backgroundColor: `${group.color}15`,
                                  animationDelay: `${groupIndex * 100 + i * 20}ms`,
                                  animationFillMode: 'forwards'
                                }}
                              >
                                {worker.name}{team ? ` (${team.name})` : ''}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </section>
                  );
                })}
                
                {/* Workers without vacation group are not shown in color mode */}
              </div>
            );
          })()
        ) : useHorizontalLayout ? (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {sortedPrefixes.map((prefix, groupIndex) => {
              const teams = groupedTeams[prefix];
              const groupTotalWorkers = teams.reduce((acc, team) => acc + getWorkersForTeam(team.id).length, 0);
              
              return (
                <section 
                  key={prefix}
                  className="opacity-0 animate-fade-in space-y-3"
                  style={{ animationDelay: `${groupIndex * 100}ms`, animationFillMode: 'forwards' }}
                >
                  {/* Group header */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-semibold">{prefix}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {groupTotalWorkers} trabajadores
                    </span>
                  </div>
                  
                  {/* Teams stacked vertically */}
                  <div className="space-y-3">
                    {teams.map((team, teamIndex) => {
                      const teamWorkers = getWorkersForTeam(team.id);
                      const teamColor = getGroupColorForTeam(team.id);
                      
                      return (
                        <button
                          key={team.id}
                          onClick={() => setSelectedTeam(team)}
                          className="w-full text-left bg-card border border-border/60 rounded-xl p-4
                                     hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 
                                     hover:scale-[1.01] active:scale-[0.99]
                                     transition-all duration-200 ease-out cursor-pointer
                                     opacity-0 animate-fade-in"
                          style={{ 
                            animationDelay: `${groupIndex * 100 + teamIndex * 50}ms`,
                            animationFillMode: 'forwards'
                          }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-sm">{team.name}</span>
                            {/* Only show color dot for non-Cámara departments */}
                            {!isCamaraDepartment && (
                              <span 
                                className="w-3 h-3 rounded-full shadow-sm" 
                                style={{ backgroundColor: teamColor }} 
                              />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-3">
                            {teamWorkers.length} trabajador{teamWorkers.length !== 1 ? 'es' : ''}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {teamWorkers.map(worker => {
                              const workerColor = isCamaraDepartment ? getWorkerVacationColor(worker.id) : null;
                              return (
                                <span 
                                  key={worker.id} 
                                  className="text-xs px-2 py-1 rounded-md"
                                  style={workerColor ? { 
                                    color: workerColor,
                                    backgroundColor: `${workerColor}15`
                                  } : {}}
                                >
                                  {worker.name}
                                </span>
                              );
                            })}
                            {teamWorkers.length === 0 && (
                              <span className="text-xs text-muted-foreground italic">Sin asignar</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          /* Original vertical layout */
          <>
            {sortedPrefixes.map((prefix, groupIndex) => {
              const teams = groupedTeams[prefix];
              const groupColor = getGroupColorForTeam(teams[0]?.id);
              const groupTotalWorkers = teams.reduce((acc, team) => acc + getWorkersForTeam(team.id).length, 0);
              
              // Determine layout based on number of teams
              // If few teams (1-2), use wider cards in horizontal layout
              const fewTeams = teams.length <= 2;
              
              return (
                <section 
                  key={prefix} 
                  className="opacity-0 animate-fade-in"
                  style={{ animationDelay: `${groupIndex * 100}ms`, animationFillMode: 'forwards' }}
                >
                  <div className="flex items-center gap-3 mb-5 sm:mb-6">
                    <h2 className="text-lg sm:text-xl font-semibold">{prefix}</h2>
                    <span className="text-xs sm:text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">
                      {groupTotalWorkers} trabajadores
                    </span>
                  </div>
                  
                  {/* Adaptive grid: horizontal layout for few teams, regular grid for many */}
                  <div className={fewTeams 
                    ? "flex flex-wrap gap-4 sm:gap-5" 
                    : "grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  }>
                    {teams.map((team, teamIndex) => {
                      const teamWorkers = getWorkersForTeam(team.id);
                      const teamColor = getGroupColorForTeam(team.id);
                      
                      return (
                        <button
                          key={team.id}
                          onClick={() => setSelectedTeam(team)}
                          className={`text-left bg-card border border-border/60 rounded-2xl p-5 sm:p-6 
                                     hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 
                                     hover:scale-[1.02] active:scale-[0.98]
                                     transition-all duration-200 ease-out cursor-pointer
                                     opacity-0 animate-fade-in
                                     ${fewTeams ? "flex-1 min-w-[280px] max-w-none" : ""}`}
                          style={{ 
                            animationDelay: `${groupIndex * 100 + teamIndex * 50}ms`,
                            animationFillMode: 'forwards'
                          }}
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <span className="font-semibold text-base sm:text-lg">{team.name}</span>
                            {/* Only show color dot for non-Cámara departments */}
                            {!isCamaraDepartment && (
                              <span 
                                className="w-4 h-4 rounded-full shadow-md" 
                                style={{ backgroundColor: teamColor }} 
                              />
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground mb-4">
                            {teamWorkers.length} trabajador{teamWorkers.length !== 1 ? 'es' : ''}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {teamWorkers.map(worker => {
                              const workerColor = isCamaraDepartment ? getWorkerVacationColor(worker.id) : null;
                              return (
                                <span 
                                  key={worker.id} 
                                  className={`text-xs sm:text-sm px-3 py-1.5 rounded-lg transition-colors ${!workerColor ? 'bg-muted/80 text-foreground/90 hover:bg-primary/10 hover:text-primary' : ''}`}
                                  style={workerColor ? { 
                                    color: workerColor,
                                    backgroundColor: `${workerColor}15`
                                  } : {}}
                                >
                                  {worker.name}
                                </span>
                              );
                            })}
                            {teamWorkers.length === 0 && (
                              <span className="text-xs sm:text-sm text-muted-foreground italic">Sin asignar</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </>
        )}

        {workerTeams.length === 0 && (
          <div className="bg-card border border-border rounded-2xl py-16 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Sin equipos configurados</h3>
            <p className="text-sm text-muted-foreground">
              Este departamento no tiene equipos de trabajo configurados.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-8 mt-8">
        <div className="h-[1px] bg-border/60 mx-4 sm:mx-6 mb-6" />
        <p className="text-center text-xs sm:text-sm text-muted-foreground">
          Generado el {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} | Verdnatura
        </p>
      </footer>

      {/* Team Detail Modal */}
      <Dialog open={!!selectedTeam} onOpenChange={(open) => !open && setSelectedTeam(null)}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          {selectedTeam && (
            <>
              <DialogHeader className="pb-4">
                <DialogTitle className="flex items-center gap-3 text-xl">
                  {/* Only show color dot for non-Cámara departments */}
                  {!isCamaraDepartment && (
                    <span 
                      className="w-4 h-4 rounded-full shadow-sm" 
                      style={{ backgroundColor: getGroupColorForTeam(selectedTeam.id) }} 
                    />
                  )}
                  Equipo {selectedTeam.name}
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="text-sm">
                    {getWorkersForTeam(selectedTeam.id).length} trabajador
                    {getWorkersForTeam(selectedTeam.id).length !== 1 ? 'es' : ''}
                  </span>
                </div>
                
                <div className="grid gap-2">
                  {getWorkersForTeam(selectedTeam.id).map((worker, index) => {
                    const workerColor = isCamaraDepartment ? getWorkerVacationColor(worker.id) : null;
                    return (
                      <div 
                        key={worker.id}
                        className="flex items-center gap-3 p-3 rounded-xl opacity-0 animate-fade-in"
                        style={{ 
                          animationDelay: `${index * 30}ms`,
                          animationFillMode: 'forwards',
                          backgroundColor: workerColor ? `${workerColor}10` : undefined
                        }}
                      >
                        {workerColor ? (
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: workerColor }} 
                          />
                        ) : !isCamaraDepartment ? (
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: getGroupColorForTeam(selectedTeam.id) }} 
                          />
                        ) : null}
                        <span 
                          className="text-sm font-medium"
                          style={workerColor ? { color: workerColor } : {}}
                        >
                          {worker.name}
                        </span>
                      </div>
                    );
                  })}
                  {getWorkersForTeam(selectedTeam.id).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No hay trabajadores asignados a este equipo
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicGroups;