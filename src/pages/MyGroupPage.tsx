import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Users, Calendar, Clock, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import LoadingScreen from "@/components/LoadingScreen";
import { LogoLink } from "@/components/LogoLink";

type GroupMember = {
  id: string;
  name: string;
  worker_number: string;
};

type Subgroup = {
  teamId: string | null;
  teamName: string;
  isCurrentWorkerTeam: boolean;
  members: GroupMember[];
};

type WorkGroup = {
  id: string;
  name: string;
  color: string;
};

type WorkerTeam = {
  id: string;
  name: string;
  display_name?: string | null;
} | null;

const MyGroupPage = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subgroups, setSubgroups] = useState<Subgroup[]>([]);
  const [workGroup, setWorkGroup] = useState<WorkGroup | null>(null);
  const [workerTeam, setWorkerTeam] = useState<WorkerTeam>(null);
  const [workerNumber, setWorkerNumber] = useState<string>("");
  const [workerName, setWorkerName] = useState("");
  const [responsable, setResponsable] = useState<{ name: string } | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);

  const hasRedirectedRef = useRef(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveSession = useCallback(async () => {
    const retryDelaysMs = [0, 300, 900, 1600];
    let refreshAttempted = false;

    for (const delayMs of retryDelaysMs) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        return session;
      }

      if (!refreshAttempted) {
        refreshAttempted = true;
        await supabase.auth.refreshSession().catch(() => null);
      }
    }

    return null;
  }, []);

  const fetchGroupData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) {
        setError(null);
      }

      const session = await resolveSession();

      if (!session) {
        if (!silent && !hasRedirectedRef.current) {
          hasRedirectedRef.current = true;
          navigate('/horario-login?redirect=/mi-grupo', { replace: true });
        }
        return;
      }

      const { data, error: fetchError } = await supabase.functions.invoke('worker-personal', {
        body: { action: 'getMyGroup' },
      });

      if (fetchError || !data?.success) {
        console.error('Error fetching group:', data?.error || fetchError);
        if (!silent) {
          setError(data?.error || 'Error al cargar el grupo');
        }
        return;
      }

      setWorkerName(data.workerName || '');
      setWorkGroup(data.workGroup || null);
      setWorkerTeam(data.workerTeam || null);
      setSubgroups(data.subgroups || []);
      setResponsable(data.responsable || null);
      setWorkerNumber(data.workerNumber || session.user?.user_metadata?.worker_number || '');
      setDepartmentId(data.departmentId || null);
    } catch (err) {
      console.error('Error:', err);
      if (!silent) {
        setError('Error al cargar los datos');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [navigate, resolveSession]);

  // Initial fetch + scroll to top
  useEffect(() => {
    window.scrollTo(0, 0);
    void fetchGroupData();
  }, [fetchGroupData]);

  // Real-time updates for relevant team/group changes only
  useEffect(() => {
    if (!departmentId || !workerTeam?.id) return;

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        void fetchGroupData({ silent: true });
      }, 150);
    };

    const workersChannel = supabase
      .channel(`my-group-workers-${workerTeam.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'workers',
        filter: `worker_team_id=eq.${workerTeam.id}`
      }, scheduleRefresh)
      .subscribe();

    const teamChannel = supabase
      .channel(`my-group-team-${workerTeam.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'worker_teams',
        filter: `id=eq.${workerTeam.id}`
      }, scheduleRefresh)
      .subscribe();

    const mappingsChannel = supabase
      .channel(`my-group-mappings-${workerTeam.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'work_group_teams',
        filter: `worker_team_id=eq.${workerTeam.id}`
      }, scheduleRefresh)
      .subscribe();

    const groupsChannel = supabase
      .channel(`my-group-groups-${departmentId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'work_groups',
        filter: `department_id=eq.${departmentId}`
      }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      supabase.removeChannel(workersChannel);
      supabase.removeChannel(teamChannel);
      supabase.removeChannel(mappingsChannel);
      supabase.removeChannel(groupsChannel);
    };
  }, [departmentId, workerTeam?.id, fetchGroupData]);

  // Get all members from current worker's subgroup (team)
  const mySubgroup = subgroups.find((sg) => sg.isCurrentWorkerTeam);
  const myMembers = mySubgroup?.members || [];
  // Fallback: if no subgroup matched, show all members from all subgroups
  const displayMembers = myMembers.length > 0 ? myMembers : subgroups.flatMap((sg) => sg.members);

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Users className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            Volver
          </Button>
        </div>
      </div>
    );
  }

  if (!workGroup && !workerTeam) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Users className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No tienes un grupo asignado</p>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              const wn = workerNumber;
              if (wn) {
                window.open(`https://salix.verdnatura.es/#/worker/${wn}/calendar`, '_blank');
              }
            }}
          >
            Ver mi calendario
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-header">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoLink to="/mi-grupo" className="h-8 w-8 object-contain" />
            <div>
              <h1 className="text-sm sm:text-base font-semibold text-foreground">Mi Grupo</h1>
              <p className="text-xs text-muted-foreground">{workerName}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-lg">
        {/* Group Header */}
        <div className="mb-6 space-y-3">
          {/* Vacation color */}
          {workGroup && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Color Vacacional:</span>
              <span 
                className="font-bold"
                style={{ color: workGroup.color }}
              >
                {workGroup.name}
              </span>
              <span 
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: workGroup.color }}
              />
            </div>
          )}
          
          {/* Work group / Team */}
          {workerTeam && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Grupo de trabajo:</span>
              <span className="text-xl font-bold text-foreground">{workerTeam.display_name || workerTeam.name}</span>
            </div>
          )}
          
          <p className="text-sm text-muted-foreground">
            {displayMembers.length} {displayMembers.length === 1 ? 'compañero' : 'compañeros'}
          </p>
        </div>

        {/* Members List - Only names, no worker numbers */}
        <div className="bg-card rounded-lg border p-4">
          <div className="space-y-2">
            {responsable && (
              <div className="flex items-center gap-2 py-1.5 mb-1 pb-3 border-b border-border">
                <UserCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">{responsable.name}</span>
                <Badge variant="secondary" className="text-[10px]">
                  Responsable
                </Badge>
              </div>
            )}
            {displayMembers.map((member) => (
              <div 
                key={member.id}
                className="py-1.5"
              >
                <span className="text-sm text-foreground">
                  {member.name}
                </span>
              </div>
            ))}

            {displayMembers.length === 0 && !responsable && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No hay compañeros en tu equipo
              </div>
            )}
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button 
            variant="outline" 
            className="h-12 gap-2"
            onClick={() => {
              if (workerNumber) {
                window.open(`https://salix.verdnatura.es/#/worker/${workerNumber}/calendar`, '_blank');
              }
            }}
          >
            <Calendar className="h-5 w-5" />
            <span>Mi Calendario</span>
          </Button>
          <Button variant="outline" asChild className="h-12">
            <Link to="/mi-horario" className="gap-2">
              <Clock className="h-5 w-5" />
              <span>Mi Horario</span>
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
};

export default MyGroupPage;
