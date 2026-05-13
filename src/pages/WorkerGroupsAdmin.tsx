import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DepartmentSearchSelect } from "@/components/DepartmentSearchSelect";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Users,
  UserPlus,
  UserCog,
  Pencil,
  ExternalLink,
  UsersRound,
  User,
  AlertCircle,
  Search,
  MessageSquare,
  Check,
  History,
  Send,
  Filter,
  Umbrella,
  X,
  Download,
  Upload,
  KeyRound,
  UserCheck,
  Loader2,
  ArrowUpDown,
  CalendarDays,
  Palette,
  Info,
  RefreshCw,
  Link2,
   Clock,
   Settings2,
   Shield,
} from "lucide-react";
import { CSVImportPanel } from "@/components/CSVImportPanel";
import DeletedWorkersHistoryPanel from "@/components/DeletedWorkersHistoryPanel";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import LoadingScreen from "@/components/LoadingScreen";
import TeamConfiguratorTab from "@/components/admin/TeamConfiguratorTab";
import LoadingPanel from "@/components/LoadingPanel";
import { SkeletonWorkerList } from "@/components/SkeletonLoaders";
import { LogoLink } from "@/components/LogoLink";

type Department = {
  id: string;
  name: string;
  slug?: string;
};

type WorkerTeam = {
  id: string;
  department_id: string;
  name: string;
  sort_order: number;
  display_name?: string;
  responsable_worker_id?: string | null;
};

type Worker = {
  id: string;
  department_id: string;
  worker_team_id: string | null;
  work_group_id: string | null;
  worker_number: string;
  worker_code?: string | null;
  name: string;
  email: string | null;
  is_on_leave: boolean;
  is_on_vacation: boolean;
  user_id: string | null;
  vacation_days_adjustment: number;
  pending_vacation_days: number;
};

type WorkerComment = {
  id: string;
  worker_id: string;
  comment: string;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
};

type WorkGroup = {
  id: string;
  department_id: string;
  name: string;
  color: string;
};

type WorkGroupTeam = {
  id: string;
  work_group_id: string;
  worker_team_id: string;
};

const WorkerGroupsAdmin = ({ embedded = false }: { embedded?: boolean }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin, isAuthenticated, getSessionToken, manager } = useManagerAuth();

  // URL params for pre-filling from group join request
  const urlWorkerNumber = searchParams.get("workerNumber");
  const urlDepartmentId = searchParams.get("departmentId");
  const urlRequestId = searchParams.get("requestId");

  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "on_leave" | "vacation" | "no_team" | "comments" | "recently_added" | "recently_updated" | "registered">("all");
  const [activeTab, setActiveTab] = useState("workers");
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(["workers"]));
  
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setVisitedTabs(prev => new Set(prev).add(tab));
  };
  
  // Workers without vacation group (for mapping tab)
  const [savingGroupAssignment, setSavingGroupAssignment] = useState<string | null>(null);
  const [savingTeamGroupMapping, setSavingTeamGroupMapping] = useState<string | null>(null);
  const [isRefreshingMappingData, setIsRefreshingMappingData] = useState(false);
  const [isRunningIntegrityCheck, setIsRunningIntegrityCheck] = useState(false);
  const [integrityConflicts, setIntegrityConflicts] = useState<{ workerId: string; workerName: string; workerNumber: string; deptName: string; directGroupName: string; teamGroupName: string; teamName: string }[]>([]);
  const [showIntegrityResults, setShowIntegrityResults] = useState(false);
  
  // Recently imported workers tracking with timestamps
  const [recentlyAddedWorkers, setRecentlyAddedWorkers] = useState<Map<string, number>>(new Map()); // worker_number -> timestamp
  const [recentlyUpdatedWorkers, setRecentlyUpdatedWorkers] = useState<Map<string, number>>(new Map()); // worker_number -> timestamp
  const [recentFilterHours, setRecentFilterHours] = useState(24); // hours to show recently imported

  // Cache for worker data to avoid refetching
  const workerDataCacheRef = useRef<Map<string, {
    workers: Worker[];
    workerTeams: WorkerTeam[];
    workGroups: WorkGroup[];
    workGroupTeams: WorkGroupTeam[];
    fetchedAt: number;
  }>>(new Map());
  const WORKER_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes cache (reduced for fresher data)

  // Sequence guard to avoid stale fetches keeping the UI in loading state
  const workersFetchSeqRef = useRef(0);

  // Worker teams (A1, A2, B1, B2, etc.)
  const [workerTeams, setWorkerTeams] = useState<WorkerTeam[]>([]);
  const [allWorkerTeams, setAllWorkerTeams] = useState<WorkerTeam[]>([]); // All teams from all departments for edit dialog
  const [workers, setWorkers] = useState<Worker[]>([]);

  // Work groups (vacation color groups)
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [workGroupTeams, setWorkGroupTeams] = useState<WorkGroupTeam[]>([]);

  // Global search
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<(Worker & { departmentName: string })[]>([]);
  const [searchingGlobal, setSearchingGlobal] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [workerTextFilter, setWorkerTextFilter] = useState("");

  // Teams tab worker search & highlight
  const [teamsSearchQuery, setTeamsSearchQuery] = useState("");
  const highlightedWorkerIds = useMemo(() => {
    if (!teamsSearchQuery.trim()) return new Set<string>();
    const q = teamsSearchQuery.toLowerCase().trim();
    const terms = q.split(/[,;]+/).map(t => t.trim()).filter(Boolean);
    if (terms.length === 0) return new Set<string>();
    return new Set(
      workers.filter(w => 
        terms.some(term =>
          w.name.toLowerCase().includes(term) ||
          w.worker_number.includes(term) ||
          (w.worker_code && w.worker_code.toLowerCase().includes(term))
        )
      ).map(w => w.id)
    );
  }, [teamsSearchQuery, workers]);

  // Dialogs
  const [showCreateTeamDialog, setShowCreateTeamDialog] = useState(false);
  const [showEditTeamDialog, setShowEditTeamDialog] = useState(false);
  const [showCreateWorkerDialog, setShowCreateWorkerDialog] = useState(false);
  const [showEditWorkerDialog, setShowEditWorkerDialog] = useState(false);

  const [editingTeam, setEditingTeam] = useState<WorkerTeam | null>(null);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);

  const [newTeamName, setNewTeamName] = useState("");
  const [createTeamDepartmentId, setCreateTeamDepartmentId] = useState<string>("");
  const [newWorkerName, setNewWorkerName] = useState("");
  const [newWorkerNumber, setNewWorkerNumber] = useState("");
  const [newWorkerCode, setNewWorkerCode] = useState("");
  const [newWorkerTeamId, setNewWorkerTeamId] = useState<string>("");
  const [newWorkerWorkGroupId, setNewWorkerWorkGroupId] = useState<string>("");
  const [newWorkerEmail, setNewWorkerEmail] = useState("");
  const [newWorkerOnLeave, setNewWorkerOnLeave] = useState(false);
  const [newWorkerOnVacation, setNewWorkerOnVacation] = useState(false);
  const [newWorkerIsResponsable, setNewWorkerIsResponsable] = useState(false);
  const [newWorkerDepartmentId, setNewWorkerDepartmentId] = useState<string>("");
  const [newWorkerVacationAdjustment, setNewWorkerVacationAdjustment] = useState<string>("0");
  const [createWorkerDepartmentId, setCreateWorkerDepartmentId] = useState<string>("");

  // For tracking if we're adding from a request
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  // Worker comments
  const [workerComments, setWorkerComments] = useState<WorkerComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [showResolvedComments, setShowResolvedComments] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [workersWithActiveComments, setWorkersWithActiveComments] = useState<string[]>([]);
  const [latestWorkerComments, setLatestWorkerComments] = useState<{ [workerId: string]: string }>({});
  const [showCommentPreviewDialog, setShowCommentPreviewDialog] = useState(false);
  const [commentPreviewWorkerName, setCommentPreviewWorkerName] = useState<string>("");
  const [commentPreviewText, setCommentPreviewText] = useState<string>("");
  const [workersOnVacation, setWorkersOnVacation] = useState<string[]>([]);
  const [resettingCredentials, setResettingCredentials] = useState(false);
  
  // Sorting for workers list
  const [workersSortBy, setWorkersSortBy] = useState<"name" | "vacation_days" | "work_group">("name");
  const [workersSortOrder, setWorkersSortOrder] = useState<"asc" | "desc">("asc");
  // Multi-select for bulk actions
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<string>>(new Set());
  const [showBulkAssignDialog, setShowBulkAssignDialog] = useState(false);
  const [bulkAssignTeamId, setBulkAssignTeamId] = useState<string>("");

  // PDF generation
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfLightMode, setPdfLightMode] = useState(false);
  const pdfContentRef = useRef<HTMLDivElement>(null);
  
  // Teams sorting mode (for CAMARA department specifically)
  const [teamsSortMode, setTeamsSortMode] = useState<"team" | "color">("team");

  // All responsables (across departments) for display
  const [allResponsables, setAllResponsables] = useState<{ id: string; name: string; department_name?: string }[]>([]);

  // Comments caching (instant reopen + avoids stuck loader)
  const commentsCacheRef = useRef(new Map<string, { comments: WorkerComment[]; fetchedAt: number }>());
  const commentFetchSeqRef = useRef(0);
  const salixOpenedRef = useRef(false);
  const CACHE_TTL_MS = 60_000;

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    fetchDepartments();
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (selectedDepartmentId && departments.length > 0) {
      fetchData();
    }
  }, [selectedDepartmentId, departments]);

  // Fetch all responsables across departments
  useEffect(() => {
    const fetchAllResponsables = async () => {
      const token = getSessionToken();
      if (!token) return;
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
    if (isAuthenticated) fetchAllResponsables();
  }, [isAuthenticated]);
  
  // Handle URL params from group join request
  useEffect(() => {
    if (urlWorkerNumber && urlDepartmentId && departments.length > 0) {
      // Set the department from URL
      setSelectedDepartmentId(urlDepartmentId);
      
      // Pre-fill worker number and open dialog
      setNewWorkerNumber(urlWorkerNumber);
      setPendingRequestId(urlRequestId);
      
      // Small delay to ensure department data is loaded
      setTimeout(() => {
        setShowCreateWorkerDialog(true);
      }, 500);
    }
  }, [urlWorkerNumber, urlDepartmentId, departments]);

  const fetchDepartments = async () => {
    setLoadingDepartments(true);
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      navigate("/login");
      return;
    }

    try {
      if (isAdmin) {
        const { data } = await supabase.functions.invoke('admin-operations', {
          body: { action: 'getDepartments', sessionToken }
        });
        if (data?.success && data?.departments) {
          setDepartments(data.departments);
          // If we have URL params, set that department, otherwise keep "all"
          if (urlDepartmentId) {
            setSelectedDepartmentId(urlDepartmentId);
          }
        }
      } else {
        // Managers can only view their assigned departments
        // NOTE: assignments are now protected (no public access). Use backend function.
        const { data: deptResp } = await supabase.functions.invoke('admin-operations', {
          body: { action: 'getManagerDepartments', sessionToken },
        });

        if (deptResp?.success && deptResp?.departments) {
          setDepartments(deptResp.departments);
          if (urlDepartmentId) {
            setSelectedDepartmentId(urlDepartmentId);
          } else if (deptResp.departments.length === 1) {
            setSelectedDepartmentId(deptResp.departments[0].id);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    } finally {
      setLoadingDepartments(false);
    }
  };

  const fetchData = async (forceRefresh = false) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      setLoadingWorkers(false);
      return;
    }

    // Sequence guard: if the user changes department mid-fetch, ignore stale updates
    const seq = ++workersFetchSeqRef.current;
    const isLatest = () => seq === workersFetchSeqRef.current;

    const now = Date.now();

    // Helper to check if cache is valid for a department
    const isCacheValid = (deptId: string) => {
      const cached = workerDataCacheRef.current.get(deptId);
      return cached && now - cached.fetchedAt < WORKER_CACHE_TTL_MS;
    };

    // Helper to get data from cache only (synchronous)
    const getFromCache = (deptId: string, deptName: string) => {
      const cached = workerDataCacheRef.current.get(deptId);
      if (cached) {
        return {
          workers: cached.workers.map((w) => ({ ...w, departmentName: deptName })),
          workerTeams: cached.workerTeams,
          workGroups: cached.workGroups,
          workGroupTeams: cached.workGroupTeams,
        };
      }
      return null;
    };

    // Helper to fetch single department data with caching
    const fetchDepartmentData = async (deptId: string, deptName: string) => {
      // Check cache first (unless forcing refresh)
      if (!forceRefresh && isCacheValid(deptId)) {
        return { ...getFromCache(deptId, deptName)!, fromCache: true };
      }

      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getWorkerGroupsData",
          sessionToken,
          data: { departmentId: deptId },
        },
      });

      if (data?.success) {
        // Update cache
        workerDataCacheRef.current.set(deptId, {
          workers: data.workers || [],
          workerTeams: data.workerTeams || [],
          workGroups: data.workGroups || [],
          workGroupTeams: data.workGroupTeams || [],
          fetchedAt: now,
        });

        return {
          workers: (data.workers || []).map((w: Worker) => ({ ...w, departmentName: deptName })),
          workerTeams: data.workerTeams || [],
          workGroups: data.workGroups || [],
          workGroupTeams: data.workGroupTeams || [],
          fromCache: false,
        };
      }

      return null;
    };

    // Check if ALL required data is in cache (for instant display)
    const allDataCached =
      selectedDepartmentId === "all"
        ? departments.every((dept) => !forceRefresh && isCacheValid(dept.id))
        : !forceRefresh && isCacheValid(selectedDepartmentId);

    // If all data is cached, update state IMMEDIATELY (synchronous)
    if (allDataCached) {
      // Avoid being stuck showing skeletons from a previous in-flight request
      if (isLatest()) setLoadingWorkers(false);

      if (selectedDepartmentId === "all") {
        const allWorkers: Worker[] = [];
        const allTeams: WorkerTeam[] = [];
        const allWorkGroups: WorkGroup[] = [];
        const allWorkGroupTeams: WorkGroupTeam[] = [];

        for (const dept of departments) {
          const cached = getFromCache(dept.id, dept.name);
          if (cached) {
            allWorkers.push(...cached.workers);
            allTeams.push(...cached.workerTeams);
            allWorkGroups.push(...cached.workGroups);
            allWorkGroupTeams.push(...cached.workGroupTeams);
          }
        }

        allWorkers.sort((a, b) => {
          const deptCompare = ((a as any).departmentName || "").localeCompare(
            ((b as any).departmentName || "")
          );
          if (deptCompare !== 0) return deptCompare;
          return a.name.localeCompare(b.name);
        });

        if (isLatest()) {
          setWorkers(allWorkers);
          setWorkerTeams(allTeams);
          setAllWorkerTeams(allTeams);
          setWorkGroups(allWorkGroups);
          setWorkGroupTeams(allWorkGroupTeams);
        }
      } else {
        const cached = getFromCache(
          selectedDepartmentId,
          departments.find((d) => d.id === selectedDepartmentId)?.name || ""
        );

        if (cached && isLatest()) {
          setWorkerTeams(cached.workerTeams);
          setWorkers(cached.workers);
          setWorkGroups(cached.workGroups);
          setWorkGroupTeams(cached.workGroupTeams);

          // Collect all teams from cache
          const allTeamsData: WorkerTeam[] = [...cached.workerTeams];
          for (const dept of departments) {
            if (dept.id !== selectedDepartmentId) {
              const deptCache = workerDataCacheRef.current.get(dept.id);
              if (deptCache) {
                allTeamsData.push(...deptCache.workerTeams);
              }
            }
          }
          setAllWorkerTeams(allTeamsData);
        }
      }

      // Clear global search when department changes
      if (isLatest()) {
        setGlobalSearchQuery("");
        setGlobalSearchResults([]);
      }

      // Refresh comments/vacation status in background (never block workers UI)
      Promise.allSettled([fetchWorkersWithActiveComments(), fetchWorkersOnVacation()]);
      return;
    }

    // Not all cached - show loading and fetch
    setLoadingWorkers(true);

    try {
      if (selectedDepartmentId === "all") {
        // Fetch ALL departments in PARALLEL (major optimization!)
        const results = await Promise.all(departments.map((dept) => fetchDepartmentData(dept.id, dept.name)));

        const allWorkers: Worker[] = [];
        const allTeams: WorkerTeam[] = [];
        const allWorkGroups: WorkGroup[] = [];
        const allWorkGroupTeams: WorkGroupTeam[] = [];

        for (const result of results) {
          if (result) {
            allWorkers.push(...result.workers);
            allTeams.push(...result.workerTeams);
            allWorkGroups.push(...result.workGroups);
            allWorkGroupTeams.push(...result.workGroupTeams);
          }
        }

        // Sort workers by department name, then by name
        allWorkers.sort((a, b) => {
          const deptCompare = ((a as any).departmentName || "").localeCompare(
            ((b as any).departmentName || "")
          );
          if (deptCompare !== 0) return deptCompare;
          return a.name.localeCompare(b.name);
        });

        if (isLatest()) {
          setWorkers(allWorkers);
          setWorkerTeams(allTeams);
          setAllWorkerTeams(allTeams);
          setWorkGroups(allWorkGroups);
          setWorkGroupTeams(allWorkGroupTeams);
        }
      } else {
        const result = await fetchDepartmentData(
          selectedDepartmentId,
          departments.find((d) => d.id === selectedDepartmentId)?.name || ""
        );

        if (result && isLatest()) {
          setWorkerTeams(result.workerTeams);
          setWorkers(result.workers);
          setWorkGroups(result.workGroups);
          setWorkGroupTeams(result.workGroupTeams);

          // Collect all teams from cache (much faster than fetching again)
          const allTeamsData: WorkerTeam[] = [...result.workerTeams];
          for (const dept of departments) {
            if (dept.id !== selectedDepartmentId) {
              const cached = workerDataCacheRef.current.get(dept.id);
              if (cached) {
                allTeamsData.push(...cached.workerTeams);
              }
            }
          }
          setAllWorkerTeams(allTeamsData);
        }
      }

      // Clear global search when department changes
      if (isLatest()) {
        setGlobalSearchQuery("");
        setGlobalSearchResults([]);
      }

      // Stop showing skeletons as soon as workers are ready
      if (isLatest()) setLoadingWorkers(false);

      // Refresh comments/vacation status in background (never block workers UI)
      Promise.allSettled([fetchWorkersWithActiveComments(), fetchWorkersOnVacation()]);
    } catch (error) {
      console.error("Error fetching data:", error);
      if (isLatest()) setLoadingWorkers(false);
    }
  };
  // Function to invalidate cache for a specific department
  const invalidateCache = (departmentId?: string) => {
    if (departmentId) {
      workerDataCacheRef.current.delete(departmentId);
    } else {
      workerDataCacheRef.current.clear();
    }
  };
  
  const fetchWorkersWithActiveComments = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;
    
    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: { action: 'getWorkersWithActiveComments', sessionToken }
      });
      
      if (data?.success) {
        setWorkersWithActiveComments(data.workerIds || []);
        setLatestWorkerComments(data.latestComments || {});
      }
    } catch (error) {
      console.error('Error fetching workers with active comments:', error);
    }
  };
  
  const fetchWorkersOnVacation = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;
    
    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: { action: 'getWorkersOnVacation', sessionToken }
      });
      
      if (data?.success) {
        setWorkersOnVacation(data.workerIds || []);
      }
    } catch (error) {
      console.error('Error fetching workers on vacation:', error);
    }
  };
  
  const fetchWorkerComments = async (workerId: string, options?: { useCache?: boolean }) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    const requestedWorkerId = workerId;
    const useCache = options?.useCache ?? true;

    // Sequence guard to ignore stale responses
    const seq = ++commentFetchSeqRef.current;

    // 1) Show cached instantly if present + fresh
    const cached = commentsCacheRef.current.get(requestedWorkerId);
    const now = Date.now();
    if (useCache && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      setWorkerComments(cached.comments);
      setLoadingComments(false);
      // still refresh in background below
    } else {
      setWorkerComments([]);
      setLoadingComments(true);
    }

    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getWorkerComments",
          sessionToken,
          data: { workerId: requestedWorkerId },
        },
      });

      // Ignore if another request started after this one, or if dialog is on another worker
      if (seq !== commentFetchSeqRef.current) return;
      if (editingWorker?.id !== requestedWorkerId) return;

      const nextComments: WorkerComment[] = data?.success ? (data.comments || []) : [];
      commentsCacheRef.current.set(requestedWorkerId, { comments: nextComments, fetchedAt: Date.now() });
      setWorkerComments(nextComments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      // keep whatever is currently shown (cached or empty)
    } finally {
      if (seq === commentFetchSeqRef.current && editingWorker?.id === requestedWorkerId) {
        setLoadingComments(false);
      }
    }
  };

  const handleAddComment = async () => {
    if (!editingWorker || !newComment.trim()) return;

    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'addWorkerComment',
          sessionToken,
          data: {
            workerId: editingWorker.id,
            comment: newComment.trim(),
          },
        },
      });

      if (data?.success) {
        toast.success('Comentario añadido');
        setWorkerComments((prev) => {
          const next = [data.comment, ...prev];
          commentsCacheRef.current.set(editingWorker.id, { comments: next, fetchedAt: Date.now() });
          return next;
        });
        setLatestWorkerComments((prev) => ({ ...prev, [editingWorker.id]: data.comment.comment }));
        setNewComment('');

        // Update the active comments list
        if (!workersWithActiveComments.includes(editingWorker.id)) {
          setWorkersWithActiveComments([...workersWithActiveComments, editingWorker.id]);
        }
      } else {
        toast.error(data?.error || 'Error al añadir comentario');
      }
    } catch (error) {
      toast.error('Error al añadir comentario');
    }
    setSaving(false);
  };
  
  const handleResolveComment = async (commentId: string) => {
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'resolveWorkerComment',
          sessionToken,
          data: { commentId },
        },
      });

      if (data?.success) {
        toast.success("Comentario marcado como resuelto");

        setWorkerComments((prev) => {
          const next = prev.map((c) =>
            c.id === commentId ? { ...c, is_resolved: true, resolved_at: new Date().toISOString() } : c
          );
          if (editingWorker) commentsCacheRef.current.set(editingWorker.id, { comments: next, fetchedAt: Date.now() });
          return next;
        });

        // Update list indicators + inline latest comment
        if (editingWorker) {
          const stillActive = workerComments.filter((c) => c.id !== commentId && !c.is_resolved);
          if (stillActive.length === 0) {
            setWorkersWithActiveComments(workersWithActiveComments.filter((id) => id !== editingWorker.id));
            setLatestWorkerComments((prev) => {
              const copy = { ...prev };
              delete copy[editingWorker.id];
              return copy;
            });
          } else {
            const latest = stillActive[0];
            setLatestWorkerComments((prev) => ({ ...prev, [editingWorker.id]: latest.comment }));
          }
        }
      } else {
        toast.error(data?.error || "Error al resolver comentario");
      }
    } catch (error) {
      toast.error("Error al resolver comentario");
    }
  };
  
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("¿Eliminar este comentario?")) return;

    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'deleteWorkerComment',
          sessionToken,
          data: { commentId },
        },
      });

      if (data?.success) {
        toast.success("Comentario eliminado");

        setWorkerComments((prev) => {
          const deleted = prev.find((c) => c.id === commentId);
          const next = prev.filter((c) => c.id !== commentId);

          if (editingWorker) {
            commentsCacheRef.current.set(editingWorker.id, { comments: next, fetchedAt: Date.now() });

            // If it was an active comment, refresh inline latest/indicator
            if (deleted && !deleted.is_resolved) {
              const stillActive = next.filter((c) => !c.is_resolved);
              if (stillActive.length === 0) {
                setWorkersWithActiveComments(workersWithActiveComments.filter((id) => id !== editingWorker.id));
                setLatestWorkerComments((prevMap) => {
                  const copy = { ...prevMap };
                  delete copy[editingWorker.id];
                  return copy;
                });
              } else {
                setLatestWorkerComments((prevMap) => ({ ...prevMap, [editingWorker.id]: stillActive[0].comment }));
              }
            }
          }

          return next;
        });
      } else {
        toast.error(data?.error || "Error al eliminar comentario");
      }
    } catch (error) {
      toast.error("Error al eliminar comentario");
    }
  };

  // Worker Team CRUD
  const handleCreateTeam = async () => {
    // Use createTeamDepartmentId if set, otherwise use selectedDepartmentId (but not "all")
    const targetDepartmentId = createTeamDepartmentId || (selectedDepartmentId !== "all" ? selectedDepartmentId : "");
    
    if (!newTeamName.trim() || !targetDepartmentId) return;
    
    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'createWorkerTeam',
          sessionToken,
          data: {
            departmentId: targetDepartmentId,
            name: newTeamName.trim()
          }
        }
      });

      if (data?.success) {
        toast.success("Equipo creado");
        setWorkerTeams([...workerTeams, data.team]);
        setNewTeamName("");
        setCreateTeamDepartmentId("");
        setShowCreateTeamDialog(false);
      } else {
        toast.error(data?.error || "Error al crear equipo");
      }
    } catch (error) {
      toast.error("Error al crear equipo");
    }
    setSaving(false);
  };

  const handleUpdateTeam = async () => {
    if (!editingTeam || !newTeamName.trim()) return;
    
    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'updateWorkerTeam',
          sessionToken,
          data: {
            teamId: editingTeam.id,
            name: newTeamName.trim()
          }
        }
      });

      if (data?.success) {
        toast.success("Equipo actualizado");
        setWorkerTeams(workerTeams.map(t => t.id === editingTeam.id ? data.team : t));
        setShowEditTeamDialog(false);
        setEditingTeam(null);
        setNewTeamName("");
      } else {
        toast.error(data?.error || "Error al actualizar equipo");
      }
    } catch (error) {
      toast.error("Error al actualizar equipo");
    }
    setSaving(false);
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!confirm("¿Eliminar este equipo? Los trabajadores quedarán sin asignar.")) return;
    
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'deleteWorkerTeam',
          sessionToken,
          data: { teamId }
        }
      });

      if (data?.success) {
        toast.success("Equipo eliminado");
        setWorkerTeams(workerTeams.filter(t => t.id !== teamId));
        // Update workers that had this team
        setWorkers(workers.map(w => w.worker_team_id === teamId ? { ...w, worker_team_id: null } : w));
      } else {
        toast.error(data?.error || "Error al eliminar equipo");
      }
    } catch (error) {
      toast.error("Error al eliminar equipo");
    }
  };

  // Worker CRUD
  const handleCreateWorker = async () => {
    // Use createWorkerDepartmentId if set, otherwise use selectedDepartmentId (but not "all")
    const targetDepartmentId = createWorkerDepartmentId || (selectedDepartmentId !== "all" ? selectedDepartmentId : "");
    
    if (!newWorkerName.trim() || !newWorkerNumber.trim() || !targetDepartmentId) return;
    
    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'createWorker',
          sessionToken,
          data: {
            departmentId: targetDepartmentId,
            name: newWorkerName.trim(),
            workerNumber: newWorkerNumber.trim(),
            workerTeamId: newWorkerTeamId || null
          }
        }
      });

      if (data?.success) {
        toast.success("Trabajador añadido");
        invalidateCache(targetDepartmentId); // Invalidate cache for this department
        setWorkers([...workers, data.worker]);
        
        // If this came from a group join request, mark it as processed
        if (pendingRequestId) {
          await markRequestAsProcessed(pendingRequestId);
          setPendingRequestId(null);
          // Clear URL params
          navigate("/admin/worker-groups", { replace: true });
        }
        
        setNewWorkerName("");
        setNewWorkerNumber("");
        setNewWorkerTeamId("");
        setCreateWorkerDepartmentId("");
        setShowCreateWorkerDialog(false);
      } else {
        toast.error(data?.error || "Error al añadir trabajador");
      }
    } catch (error) {
      toast.error("Error al añadir trabajador");
    }
    setSaving(false);
  };
  
  const markRequestAsProcessed = async (requestId: string) => {
    const sessionToken = getSessionToken();
    try {
      await supabase.functions.invoke("admin-operations", {
        body: {
          action: "processGroupJoinRequest",
          sessionToken,
          data: {
            requestId,
            status: "PROCESSED",
            teamId: newWorkerTeamId || null,
            workGroupId: null
          }
        }
      });
    } catch (err) {
      console.error("Error marking request as processed:", err);
    }
  };

  const handleUpdateWorker = async () => {
    if (!editingWorker || !newWorkerName.trim() || !newWorkerNumber.trim()) return;
    
    setSaving(true);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'updateWorker',
          sessionToken,
          data: {
            workerId: editingWorker.id,
            name: newWorkerName.trim(),
            workerNumber: newWorkerNumber.trim(),
            workerCode: newWorkerCode.trim() || null,
            workerTeamId: newWorkerTeamId || null,
            workGroupId: newWorkerWorkGroupId || null,
            email: newWorkerEmail.trim() || null,
            isOnLeave: newWorkerOnLeave,
            isOnVacation: newWorkerOnVacation,
            isResponsable: newWorkerIsResponsable,
            departmentId: newWorkerDepartmentId !== editingWorker.department_id ? newWorkerDepartmentId : undefined,
            vacationDaysAdjustment: parseFloat(newWorkerVacationAdjustment) || 0
          }
        }
      });

      if (data?.success) {
        const teamChanged = editingWorker.worker_team_id !== (newWorkerTeamId || null);
        const deptChanged = newWorkerDepartmentId !== editingWorker.department_id;
        
        // Invalidate cache for affected departments
        invalidateCache(editingWorker.department_id);
        if (deptChanged) {
          invalidateCache(newWorkerDepartmentId);
        }
        
        if (teamChanged && newWorkerEmail.trim()) {
          toast.success("Trabajador actualizado y notificación enviada");
        } else if (deptChanged) {
          toast.success("Trabajador movido de departamento");
        } else {
          toast.success("Trabajador actualizado");
        }
        // If department changed, remove from current view
        if (deptChanged) {
          setWorkers(workers.filter(w => w.id !== editingWorker.id));
        } else {
          setWorkers(workers.map(w => w.id === editingWorker.id ? data.worker : w));
        }
        setShowEditWorkerDialog(false);
        setEditingWorker(null);
        setNewWorkerName("");
        setNewWorkerNumber("");
        setNewWorkerCode("");
        setNewWorkerTeamId("");
        setNewWorkerWorkGroupId("");
        setNewWorkerEmail("");
        setNewWorkerOnLeave(false);
        setNewWorkerOnVacation(false);
        setNewWorkerIsResponsable(false);
        setNewWorkerDepartmentId("");
        setNewWorkerVacationAdjustment("0");
      } else {
        toast.error(data?.error || "Error al actualizar trabajador");
      }
    } catch (error) {
      toast.error("Error al actualizar trabajador");
    }
    setSaving(false);
  };

  const handleBulkAssignTeam = async () => {
    if (selectedWorkerIds.size === 0) return;
    
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    setSaving(true);
    try {
      const teamId = bulkAssignTeamId === "none" ? null : bulkAssignTeamId || null;
      let successCount = 0;
      let errorCount = 0;

      for (const workerId of selectedWorkerIds) {
        const worker = workers.find(w => w.id === workerId);
        if (!worker) continue;

        const { data } = await supabase.functions.invoke('admin-operations', {
          body: {
            action: 'updateWorker',
            sessionToken,
            workerId,
            name: worker.name,
            workerNumber: worker.worker_number,
            teamId,
            email: worker.email,
            isOnLeave: worker.is_on_leave,
            isOnVacation: worker.is_on_vacation,
            departmentId: worker.department_id,
            vacationDaysAdjustment: worker.vacation_days_adjustment
          }
        });

        if (data?.success) {
          successCount++;
        } else {
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} trabajadores actualizados`);
        // Update local state
        setWorkers(workers.map(w => {
          if (selectedWorkerIds.has(w.id)) {
            return { ...w, worker_team_id: teamId };
          }
          return w;
        }));
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} trabajadores no pudieron actualizarse`);
      }

      setShowBulkAssignDialog(false);
      setSelectedWorkerIds(new Set());
      setBulkAssignTeamId("");
    } catch (error) {
      toast.error("Error al asignar equipos");
    }
    setSaving(false);
  };

  const handleDeleteWorker = async (workerId: string) => {
    if (!confirm("¿Eliminar este trabajador?")) return;
    
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'deleteWorker',
          sessionToken,
          data: { workerId }
        }
      });

      if (data?.success) {
        toast.success("Trabajador eliminado");
        const deletedWorker = workers.find(w => w.id === workerId);
        if (deletedWorker) {
          invalidateCache(deletedWorker.department_id);
        }
        setWorkers(workers.filter(w => w.id !== workerId));
      } else {
        toast.error(data?.error || "Error al eliminar trabajador");
      }
    } catch (error) {
      toast.error("Error al eliminar trabajador");
    }
  };

  const handleResetWorkerCredentials = async () => {
    if (!editingWorker) return;
    
    if (!confirm("¿Estás seguro de que quieres resetear las credenciales de este trabajador? Deberá registrarse de nuevo con un email y contraseña.")) {
      return;
    }
    
    setResettingCredentials(true);
    const sessionToken = getSessionToken();
    
    try {
      const { data, error } = await supabase.functions.invoke('worker-auth', {
        body: {
          action: 'adminResetCredentials',
          workerId: editingWorker.id,
          adminSessionToken: sessionToken
        }
      });
      
      if (error || data?.error) {
        toast.error(data?.error || "Error al resetear credenciales");
        return;
      }
      
      toast.success("Credenciales reseteadas. El trabajador deberá registrarse de nuevo.");
    } catch (err) {
      console.error("Error resetting credentials:", err);
      toast.error("Error al resetear credenciales");
    } finally {
      setResettingCredentials(false);
    }
  };

  const openEditTeamDialog = (team: WorkerTeam) => {
    setEditingTeam(team);
    setNewTeamName(team.name);
    setShowEditTeamDialog(true);
  };

  const openEditWorkerDialog = (worker: Worker) => {
    // Reset per-open UI state
    setNewComment("");
    setShowResolvedComments(false);

    // Ensure we have a usable department/team even if the worker list was enriched or missing fields
    const fallbackDepartmentId = (worker as any).department_id || (worker as any).departmentId || "";
    const fallbackTeamId = (worker as any).worker_team_id || (worker as any).workerTeamId || "";

    // Set worker first (so guards in fetchWorkerComments work)
    setEditingWorker(worker);
    setNewWorkerName(worker.name);
    setNewWorkerNumber(worker.worker_number);
    setNewWorkerCode(worker.worker_code || "");
    setNewWorkerTeamId(fallbackTeamId);
    setNewWorkerWorkGroupId(worker.work_group_id || "");
    setNewWorkerEmail(worker.email || "");
    setNewWorkerOnLeave(worker.is_on_leave || false);
    setNewWorkerOnVacation(worker.is_on_vacation || false);
    setNewWorkerIsResponsable((worker as any).is_responsable || false);
    setNewWorkerDepartmentId(fallbackDepartmentId);
    setNewWorkerVacationAdjustment(String(worker.vacation_days_adjustment || 0));

    setShowEditWorkerDialog(true);

    // Instant cached render + background refresh; run next tick so editingWorker is committed
    setTimeout(() => {
      fetchWorkerComments(worker.id, { useCache: true });
    }, 0);
  };

  const getTeamName = (teamId: string | null): string => {
    if (!teamId) return "Sin asignar";
    return workerTeams.find(t => t.id === teamId)?.name || "Sin asignar";
  };

  const getWorkGroupForTeam = (teamId: string): WorkGroup | null => {
    const assignment = workGroupTeams.find(wgt => wgt.worker_team_id === teamId);
    if (!assignment) return null;
    return workGroups.find(wg => wg.id === assignment.work_group_id) || null;
  };

  // Fuzzy search helper - calculates similarity between two strings
  const fuzzyMatch = (text: string, query: string): number => {
    const textLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const queryLower = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Exact match
    if (textLower.includes(queryLower)) return 1;
    
    // Check if all query words are in text
    const queryWords = queryLower.split(/\s+/);
    const textWords = textLower.split(/\s+/);
    let matchedWords = 0;
    for (const qWord of queryWords) {
      if (textWords.some(tWord => tWord.includes(qWord) || qWord.includes(tWord))) {
        matchedWords++;
      }
    }
    if (matchedWords === queryWords.length) return 0.9;
    
    // Levenshtein distance for fuzzy matching
    const levenshtein = (a: string, b: string): number => {
      const matrix: number[][] = [];
      for (let i = 0; i <= b.length; i++) matrix[i] = [i];
      for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
            ? matrix[i - 1][j - 1]
            : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
      }
      return matrix[b.length][a.length];
    };
    
    const distance = levenshtein(textLower, queryLower);
    const maxLen = Math.max(textLower.length, queryLower.length);
    const similarity = 1 - distance / maxLen;
    
    return similarity > 0.5 ? similarity * 0.7 : 0;
  };

  // Global search across all departments - real-time with fuzzy matching
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (!globalSearchQuery.trim()) {
        setGlobalSearchResults([]);
        setShowSearchDropdown(false);
        return;
      }
      
      setSearchingGlobal(true);
      const sessionToken = getSessionToken();

      try {
        const { data } = await supabase.functions.invoke('admin-operations', {
          body: {
            action: 'searchWorkerByNumber',
            sessionToken,
            data: { query: globalSearchQuery.trim() }
          }
        });

        if (data?.success) {
          const allWorkers = data.workers || [];
          const query = globalSearchQuery.trim();
          
          // Score and sort results by relevance
          const scoredResults = allWorkers.map((worker: any) => {
            const nameScore = fuzzyMatch(worker.name, query);
            const numberScore = worker.worker_number.includes(query) ? 1 : 0;
            const codeScore = worker.worker_code && worker.worker_code.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
            const score = Math.max(nameScore, numberScore, codeScore);
            return { ...worker, score };
          }).filter((w: any) => w.score > 0)
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, 10);
          
          setGlobalSearchResults(scoredResults);
          setShowSearchDropdown(scoredResults.length > 0);
        } else {
          setGlobalSearchResults([]);
          setShowSearchDropdown(false);
        }
      } catch (error) {
        console.error('Error searching:', error);
        setGlobalSearchResults([]);
        setShowSearchDropdown(false);
      }
      setSearchingGlobal(false);
    }, 300); // Debounce 300ms

    return () => clearTimeout(searchTimeout);
  }, [globalSearchQuery]);

  // PDF generation function - mirrors the public groups page design in A2 format
  const handleDownloadTeamsPdf = () => {
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

      const deptName = selectedDepartmentId !== "all" 
        ? departments.find(d => d.id === selectedDepartmentId)?.name || "Todos"
        : "Todos los departamentos";

      const bgColor = pdfLightMode ? '#ffffff' : '#0a0a0a';
      const textColor = pdfLightMode ? '#1a1a1a' : '#ffffff';

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Grupos ${new Date().getFullYear()} - ${deptName}</title>
          <style>
            /* Force consistent printable margins in all browsers by using body padding.
               @page margin is inconsistently honored in some print-to-PDF flows. */
            @page { size: A3 landscape; margin: 0; }
            @media print {
              html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              background: ${bgColor} !important;
              background-color: ${bgColor} !important;
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

  // Get grouped teams for PDF
  const getGroupedTeamsForPdf = () => {
    const grouped: { [key: string]: typeof workerTeams } = {};
    workerTeams.forEach(team => {
      const prefix = team.display_name || `Grupo ${team.name.charAt(0).toUpperCase()}`;
      if (!grouped[prefix]) grouped[prefix] = [];
      grouped[prefix].push(team);
    });
    return grouped;
  };

  // Helper to check if current department is CAMARA
  const isCamaraDepartment = () => {
    const currentDept = departments.find(d => d.id === selectedDepartmentId);
    return currentDept?.name?.toLowerCase() === "cámara";
  };

  // Get workers grouped by their individual vacation group color
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

  // Get workers without resolvable vacation group (no direct work_group_id and no team mapping)
  const getWorkersWithoutVacationGroup = useMemo(() => {
    const result: (Worker & { departmentName: string; teamName: string | null; inheritedGroupId: string | null })[] = [];
    
    workers.forEach(worker => {
      const dept = departments.find(d => d.id === worker.department_id);
      const team = workerTeams.find(t => t.id === worker.worker_team_id);
      
      // Check if worker has direct work_group_id
      if (worker.work_group_id) {
        // Has direct group - check if it belongs to the worker's department
        const group = workGroups.find(g => g.id === worker.work_group_id);
        if (group && group.department_id === worker.department_id) {
          return; // Worker has valid group
        }
      }
      
      // Check if worker can inherit group from team
      if (worker.worker_team_id) {
        const teamGroupMapping = workGroupTeams.find(wgt => wgt.worker_team_id === worker.worker_team_id);
        if (teamGroupMapping) {
          const inheritedGroup = workGroups.find(g => g.id === teamGroupMapping.work_group_id);
          if (inheritedGroup && inheritedGroup.department_id === worker.department_id) {
            return; // Worker inherits valid group from team
          }
        }
      }
      
      // Worker has no resolvable vacation group
      result.push({
        ...worker,
        departmentName: dept?.name || 'Desconocido',
        teamName: team?.name || null,
        inheritedGroupId: null
      });
    });
    
    // Sort by department name, then by worker name
    result.sort((a, b) => {
      const deptCompare = a.departmentName.localeCompare(b.departmentName);
      if (deptCompare !== 0) return deptCompare;
      return a.name.localeCompare(b.name);
    });
    
    return result;
  }, [workers, departments, workerTeams, workGroups, workGroupTeams]);

  // Assign vacation group to a worker
  const handleAssignVacationGroup = async (workerId: string, groupId: string) => {
    setSavingGroupAssignment(workerId);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'updateWorker',
          sessionToken,
          data: {
            workerId,
            workGroupId: groupId || null
          }
        }
      });

      if (data?.success) {
        toast.success("Grupo vacacional asignado");
        // Update local state
        setWorkers(prev => prev.map(w => 
          w.id === workerId ? { ...w, work_group_id: groupId || null } : w
        ));
        // Invalidate cache
        const worker = workers.find(w => w.id === workerId);
        if (worker) {
          invalidateCache(worker.department_id);
        }
      } else {
        toast.error(data?.error || "Error al asignar grupo");
      }
    } catch (error) {
      console.error("Error assigning vacation group:", error);
      toast.error("Error al asignar grupo");
    } finally {
      setSavingGroupAssignment(null);
    }
  };

  // Assign a team to a vacation group
  const handleAssignTeamToVacationGroup = async (teamId: string, workGroupId: string, departmentId: string) => {
    setSavingTeamGroupMapping(teamId);
    const sessionToken = getSessionToken();

    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'assignTeamToVacationGroup',
          sessionToken,
          data: {
            teamId,
            workGroupId: workGroupId || null
          }
        }
      });

      if (data?.success) {
        toast.success("Equipo asignado a grupo vacacional");
        // Update local workGroupTeams state
        if (workGroupId) {
          // Add or update the mapping
          const existingIndex = workGroupTeams.findIndex(wgt => wgt.worker_team_id === teamId);
          if (existingIndex >= 0) {
            setWorkGroupTeams(prev => prev.map(wgt => 
              wgt.worker_team_id === teamId ? { ...wgt, work_group_id: workGroupId } : wgt
            ));
          } else {
            setWorkGroupTeams(prev => [...prev, { 
              id: `temp-${Date.now()}`, 
              worker_team_id: teamId, 
              work_group_id: workGroupId 
            }]);
          }
        } else {
          // Remove the mapping
          setWorkGroupTeams(prev => prev.filter(wgt => wgt.worker_team_id !== teamId));
        }
        // Invalidate cache for this department
        invalidateCache(departmentId);
      } else {
        toast.error(data?.error || "Error al asignar equipo");
      }
    } catch (error) {
      console.error("Error assigning team to vacation group:", error);
      toast.error("Error al asignar equipo");
    } finally {
      setSavingTeamGroupMapping(null);
    }
  };

  // Refresh mapping tab data
  const handleRefreshMappingData = async () => {
    setIsRefreshingMappingData(true);
    invalidateCache(); // Clear all cache
    await fetchData(true); // Force refresh
    setIsRefreshingMappingData(false);
    toast.success("Datos actualizados");
  };

  // Run integrity check to find workers with conflicting work_group_id (direct assignment vs team mapping)
  const handleIntegrityCheck = async () => {
    setIsRunningIntegrityCheck(true);
    setIntegrityConflicts([]);
    
    try {
      const conflicts: typeof integrityConflicts = [];
      
      workers.forEach(worker => {
        // Skip workers without team
        if (!worker.worker_team_id) return;
        
        // Skip workers without direct work_group_id
        if (!worker.work_group_id) return;
        
        // Check if department is Cámara (allowed to have direct assignment)
        const dept = departments.find(d => d.id === worker.department_id);
        if (dept?.name?.toLowerCase() === 'cámara') return;
        
        // Check if team has a mapping
        const teamMapping = workGroupTeams.find(wgt => wgt.worker_team_id === worker.worker_team_id);
        if (!teamMapping) return; // Team has no mapping, direct assignment is fine
        
        // Team has mapping - check if worker's direct assignment conflicts
        const teamGroup = workGroups.find(g => g.id === teamMapping.work_group_id);
        const directGroup = workGroups.find(g => g.id === worker.work_group_id);
        const team = workerTeams.find(t => t.id === worker.worker_team_id);
        
        if (worker.work_group_id !== teamMapping.work_group_id) {
          // Conflict: direct assignment differs from team mapping
          conflicts.push({
            workerId: worker.id,
            workerName: worker.name,
            workerNumber: worker.worker_number,
            deptName: dept?.name || 'Desconocido',
            directGroupName: directGroup?.name || 'Desconocido',
            teamGroupName: teamGroup?.name || 'Desconocido',
            teamName: team?.name || 'Desconocido'
          });
        }
      });
      
      setIntegrityConflicts(conflicts);
      setShowIntegrityResults(true);
      
      if (conflicts.length === 0) {
        toast.success("✓ Sin conflictos detectados");
      } else {
        toast.warning(`${conflicts.length} conflicto${conflicts.length !== 1 ? 's' : ''} detectado${conflicts.length !== 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error("Error running integrity check:", error);
      toast.error("Error al verificar integridad");
    } finally {
      setIsRunningIntegrityCheck(false);
    }
  };

  // Fix all integrity conflicts by clearing direct work_group_id
  const handleFixAllConflicts = async () => {
    if (integrityConflicts.length === 0) return;
    
    const sessionToken = getSessionToken();
    if (!sessionToken) return;
    
    setIsRunningIntegrityCheck(true);
    
    try {
      let fixed = 0;
      for (const conflict of integrityConflicts) {
        const { data } = await supabase.functions.invoke('admin-operations', {
          body: {
            action: 'updateWorkerVacationGroup',
            sessionToken,
            data: {
              workerId: conflict.workerId,
              workGroupId: null // Clear direct assignment
            }
          }
        });
        
        if (data?.success) {
          fixed++;
          // Update local state
          setWorkers(prev => prev.map(w => 
            w.id === conflict.workerId ? { ...w, work_group_id: null } : w
          ));
        }
      }
      
      if (fixed > 0) {
        toast.success(`${fixed} conflicto${fixed !== 1 ? 's' : ''} corregido${fixed !== 1 ? 's' : ''}`);
        setIntegrityConflicts([]);
        setShowIntegrityResults(false);
        invalidateCache();
      } else {
        toast.error("No se pudieron corregir los conflictos");
      }
    } catch (error) {
      console.error("Error fixing conflicts:", error);
      toast.error("Error al corregir conflictos");
    } finally {
      setIsRunningIntegrityCheck(false);
    }
  };

  if (loadingDepartments) {
    if (embedded) return <SkeletonWorkerList count={6} />;
    return <LoadingScreen />;
  }

  return (
    <div className={embedded ? undefined : "min-h-screen bg-background"}>
      {!embedded && (
        <header className="glass-header">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(isAdmin ? "/admin" : "/manager")} className="rounded-full h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <LogoLink to={isAdmin ? "/admin" : "/manager"} />
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg font-semibold text-foreground tracking-tight">Trabajadores</h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-light">Gestión de equipos y trabajadores</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </header>
      )}

      <div className={embedded ? "" : "container mx-auto px-3 sm:px-4 py-4 md:py-6 max-w-6xl"}>
        {/* Global Search - Hidden on import tab */}
        {activeTab !== "import" && (
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar trabajador por nombre o número..."
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                onFocus={() => globalSearchResults.length > 0 && setShowSearchDropdown(true)}
                onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && globalSearchQuery.trim()) {
                    e.preventDefault();
                    setShowSearchDropdown(false);
                    setWorkerTextFilter(globalSearchQuery.trim());
                    setSelectedDepartmentId("all");
                  }
                }}
                className="bg-muted/50 rounded-2xl border-0 h-12 pl-11 text-sm"
              />
              {searchingGlobal && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              
              {/* Real-time search dropdown */}
              {showSearchDropdown && globalSearchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border/50 rounded-2xl shadow-xl z-50 max-h-80 overflow-y-auto">
                  {globalSearchResults.map(worker => (
                    <button
                      key={worker.id}
                      type="button"
                      className="w-full flex items-center justify-between p-3 hover:bg-muted/40 transition-all text-left border-b border-border/30 last:border-0 first:rounded-t-2xl last:rounded-b-2xl"
                      onMouseDown={async (e) => {
                        e.preventDefault();
                        setSelectedDepartmentId(worker.department_id);
                        setGlobalSearchQuery("");
                        setGlobalSearchResults([]);
                        setShowSearchDropdown(false);
                        openEditWorkerDialog(worker as any);
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <a
                          href={`https://salix.verdnatura.es/#/worker/${worker.worker_number}/calendar`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-sm font-medium text-primary hover:underline flex items-center gap-1 shrink-0"
                        >
                          {worker.worker_number}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <span className="text-foreground font-medium whitespace-nowrap">{worker.name}</span>
                      </div>
                      <Badge variant="secondary" className="shrink-0 ml-2">{worker.departmentName}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {globalSearchQuery && globalSearchResults.length === 0 && !searchingGlobal && (
              <p className="mt-3 text-sm text-muted-foreground">No se encontraron trabajadores.</p>
            )}
          </div>
        )}

        {/* Department Selector - Hidden on import tab */}
        {activeTab !== "import" && (
          <div className="mb-6">
            <DepartmentSearchSelect
              departments={departments}
              value={selectedDepartmentId}
              onChange={setSelectedDepartmentId}
              disabled={!isAdmin && departments.length <= 1}
              includeAll={true}
              placeholder="Departamento..."
              className="rounded-2xl"
            />
          </div>
        )}

        {/* Pill Navigation */}
        <div className="flex items-center gap-1.5 flex-wrap mb-6">
          <button
            onClick={() => handleTabChange("workers")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
              activeTab === "workers"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Trabajadores</span>
            <span className="sm:hidden">Trab.</span>
          </button>
          <button
            onClick={() => handleTabChange("teams")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
              activeTab === "teams"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <UsersRound className="h-4 w-4" />
            <span className="hidden sm:inline">Equipos</span>
            <span className="sm:hidden">Eq.</span>
          </button>
          {isAdmin && selectedDepartmentId !== "all" && (
            <button
              onClick={() => handleTabChange("configurator")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                activeTab === "configurator"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Configurador</span>
              <span className="sm:hidden">Conf.</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => handleTabChange("mapping")}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                activeTab === "mapping"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Mapeo</span>
              <span className="sm:hidden">Map.</span>
              {getWorkersWithoutVacationGroup.length > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 h-4 min-w-4 text-[10px] px-1 flex items-center justify-center"
                >
                  {getWorkersWithoutVacationGroup.length}
                </Badge>
              )}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => handleTabChange("import")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                activeTab === "import"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Importar</span>
              <span className="sm:hidden">CSV</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => handleTabChange("history")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                activeTab === "history"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Historial</span>
              <span className="sm:hidden">Hist.</span>
            </button>
          )}
        </div>

        {/* Workers Tab */}
        {visitedTabs.has("workers") && (
          <div className={activeTab !== "workers" ? "hidden" : "animate-fade-in"}>
            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                    Trabajadores
                    <Badge variant="secondary" className="ml-2">{workers.length} total</Badge>
                    {workers.filter(w => w.is_on_leave).length > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        {workers.filter(w => w.is_on_leave).length} de baja
                      </Badge>
                    )}
                    {workers.filter(w => (workersOnVacation.includes(w.id) || w.is_on_vacation) && !w.is_on_leave).length > 0 && (
                      <Badge className="gap-1 bg-cyan-500/20 text-cyan-400 border-0 hover:bg-cyan-500/30 hover:text-cyan-300">
                        {workers.filter(w => (workersOnVacation.includes(w.id) || w.is_on_vacation) && !w.is_on_leave).length} vacaciones
                      </Badge>
                    )}
                    {workers.filter(w => !w.worker_team_id).length > 0 && (
                      <Badge className="gap-1 bg-orange-500/20 text-orange-400 border-0 hover:bg-orange-500/30 hover:text-orange-300">
                        {workers.filter(w => !w.worker_team_id).length} sin equipo
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {selectedDepartmentId === "all" 
                      ? "Todos los trabajadores ordenados por departamento" 
                      : "Lista de trabajadores del departamento con su número de fichar"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && selectedWorkerIds.size > 0 && (
                    <Button 
                      variant="outline" 
                      onClick={() => setShowBulkAssignDialog(true)} 
                      className="gap-2 border-orange-500/50 text-orange-500 hover:bg-orange-500/10"
                    >
                      <UsersRound className="h-4 w-4" />
                      Asignar equipo ({selectedWorkerIds.size})
                    </Button>
                  )}
                  {isAdmin && selectedWorkerIds.size > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setSelectedWorkerIds(new Set())}
                      className="text-muted-foreground"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Limpiar
                    </Button>
                  )}
                  {isAdmin && selectedDepartmentId !== "all" && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setShowCreateWorkerDialog(true)} 
                      className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <UserPlus className="h-3 w-3" />
                      <span className="hidden sm:inline">Añadir</span>
                    </Button>
                  )}
                </div>
              </CardHeader>
              
              {/* Filters and Sorting */}
              <div className="px-6 pb-4 space-y-3">
                {/* Row 1: Status filters */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {[
                    { key: "all" as const, label: "Todos", icon: null },
                    { key: "on_leave" as const, label: "De baja", icon: <AlertCircle className="h-3 w-3" /> },
                    { key: "vacation" as const, label: "Vacaciones", icon: <Umbrella className="h-3 w-3" /> },
                    { key: "no_team" as const, label: "Sin equipo", icon: <AlertCircle className="h-3 w-3" /> },
                    { key: "comments" as const, label: "Comentarios", icon: <MessageSquare className="h-3 w-3" /> },
                    { key: "recently_added" as const, label: "Recién añadidos", icon: <UserPlus className="h-3 w-3" /> },
                    { key: "recently_updated" as const, label: "Recién actualizados", icon: <UserCog className="h-3 w-3" /> },
                    { key: "registered" as const, label: "Registrados", icon: <UserCheck className="h-3 w-3" /> },
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setStatusFilter(f.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium transition-all",
                        statusFilter === f.key
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {f.icon}
                      {f.label}
                    </button>
                  ))}
                  
                  {/* Time filter for recently added/updated */}
                  {(statusFilter === "recently_added" || statusFilter === "recently_updated") && (
                    <Select value={String(recentFilterHours)} onValueChange={(val) => setRecentFilterHours(Number(val))}>
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1h</SelectItem>
                        <SelectItem value="6">6h</SelectItem>
                        <SelectItem value="12">12h</SelectItem>
                        <SelectItem value="24">24h</SelectItem>
                        <SelectItem value="48">48h</SelectItem>
                        <SelectItem value="168">7 días</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                
                {/* Row 2: Search indicator and sorting */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    {/* Active text filter indicator */}
                    {workerTextFilter && (
                      <Badge 
                        variant="secondary" 
                        className="gap-1 cursor-pointer hover:bg-muted"
                        onClick={() => {
                          setWorkerTextFilter("");
                          setGlobalSearchQuery("");
                        }}
                      >
                        Filtro: "{workerTextFilter}"
                        <X className="h-3 w-3" />
                      </Badge>
                    )}
                  </div>
                  
                  {/* Sorting */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground hidden sm:inline">Ordenar:</span>
                    {[
                      { key: "name" as const, label: "Nombre" },
                      { key: "vacation_days" as const, label: "Días" },
                      { key: "work_group" as const, label: "Grupo" },
                    ].map(s => (
                      <button
                        key={s.key}
                        onClick={() => {
                          if (workersSortBy === s.key) {
                            setWorkersSortOrder(prev => prev === "asc" ? "desc" : "asc");
                          } else {
                            setWorkersSortBy(s.key);
                            setWorkersSortOrder(s.key === "vacation_days" ? "desc" : "asc");
                          }
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium transition-all",
                          workersSortBy === s.key
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {s.label}
                        {workersSortBy === s.key && (
                          <ArrowUpDown className={`h-3 w-3 ${workersSortOrder === "desc" ? "rotate-180" : ""}`} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <CardContent>
              {(() => {
                  // Show loading first
                  if (loadingWorkers) {
                    return <SkeletonWorkerList count={6} />;
                  }
                  
                  // Apply text filter first (from global search Enter)
                  let baseWorkers = workers;
                  if (workerTextFilter) {
                    const lowerFilter = workerTextFilter.toLowerCase();
                    baseWorkers = workers.filter(w => 
                      w.name.toLowerCase().includes(lowerFilter) ||
                      w.worker_number.toLowerCase().includes(lowerFilter) ||
                      (w.worker_code && w.worker_code.toLowerCase().includes(lowerFilter))
                    );
                  }
                  
                  // Helper to check if worker is within time window
                  const isRecentlyAdded = (workerNumber: string) => {
                    const timestamp = recentlyAddedWorkers.get(workerNumber);
                    if (!timestamp) return false;
                    return Date.now() - timestamp < recentFilterHours * 60 * 60 * 1000;
                  };
                  const isRecentlyUpdated = (workerNumber: string) => {
                    const timestamp = recentlyUpdatedWorkers.get(workerNumber);
                    if (!timestamp) return false;
                    return Date.now() - timestamp < recentFilterHours * 60 * 60 * 1000;
                  };
                  
                  // Apply status filter
                  const filteredWorkers = baseWorkers.filter(w => {
                    if (statusFilter === "all") return true;
                    if (statusFilter === "on_leave") return w.is_on_leave;
                    if (statusFilter === "vacation") return (workersOnVacation.includes(w.id) || w.is_on_vacation) && !w.is_on_leave;
                    if (statusFilter === "no_team") return !w.worker_team_id;
                    if (statusFilter === "comments") return workersWithActiveComments.includes(w.id);
                    if (statusFilter === "recently_added") return isRecentlyAdded(w.worker_number);
                    if (statusFilter === "recently_updated") return isRecentlyUpdated(w.worker_number);
                    if (statusFilter === "registered") return !!w.user_id;
                    return true;
                  });
                  
                  // Apply sorting
                  const sortedWorkers = [...filteredWorkers].sort((a, b) => {
                    if (workersSortBy === "name") {
                      const cmp = a.name.localeCompare(b.name);
                      return workersSortOrder === "asc" ? cmp : -cmp;
                    } else if (workersSortBy === "vacation_days") {
                      const aVal = a.pending_vacation_days || 0;
                      const bVal = b.pending_vacation_days || 0;
                      const cmp = aVal - bVal;
                      return workersSortOrder === "asc" ? cmp : -cmp;
                    } else if (workersSortBy === "work_group") {
                      // Sort by work group name, workers without group go last
                      const aGroup = workGroups.find(g => g.id === a.work_group_id);
                      const bGroup = workGroups.find(g => g.id === b.work_group_id);
                      const aName = aGroup?.name || "zzz"; // Put workers without group at end
                      const bName = bGroup?.name || "zzz";
                      const cmp = aName.localeCompare(bName);
                      return workersSortOrder === "asc" ? cmp : -cmp;
                    }
                    return 0;
                  });
                  
                  if (sortedWorkers.length === 0) {
                    return (
                      <div className="text-center py-8 text-muted-foreground">
                        {statusFilter === "all" 
                          ? (selectedDepartmentId === "all" 
                            ? "No hay trabajadores registrados" 
                            : "No hay trabajadores registrados en este departamento")
                          : `No hay trabajadores ${statusFilter === "on_leave" ? "de baja" : statusFilter === "vacation" ? "de vacaciones" : statusFilter === "no_team" ? "sin equipo" : statusFilter === "comments" ? "con comentarios" : statusFilter === "recently_added" ? "recién añadidos" : statusFilter === "recently_updated" ? "recién actualizados" : "registrados"}`
                        }
                      </div>
                    );
                  }
                  
                  if (selectedDepartmentId === "all") {
                    // Group workers by department when "all" is selected
                    return (
                      <div className="space-y-6 content-loaded">
                        {departments.map(dept => {
                          const deptWorkers = sortedWorkers.filter(w => w.department_id === dept.id);
                          if (deptWorkers.length === 0) return null;
                      
                      return (
                        <div key={dept.id}>
                          <div className="flex items-center gap-2 mb-3">
                            <h4 className="font-semibold text-foreground">{dept.name}</h4>
                            <Badge variant="secondary">{deptWorkers.length} trabajadores</Badge>
                            {deptWorkers.filter(w => w.is_on_leave).length > 0 && (
                              <Badge variant="destructive" className="gap-1 text-xs">
                                {deptWorkers.filter(w => w.is_on_leave).length} de baja
                              </Badge>
                            )}
                            {deptWorkers.filter(w => (workersOnVacation.includes(w.id) || w.is_on_vacation) && !w.is_on_leave).length > 0 && (
                              <Badge className="gap-1 text-xs bg-cyan-500/20 text-cyan-400 border-0 hover:bg-cyan-500/30 hover:text-cyan-300">
                                {deptWorkers.filter(w => (workersOnVacation.includes(w.id) || w.is_on_vacation) && !w.is_on_leave).length} vacaciones
                              </Badge>
                            )}
                            {deptWorkers.filter(w => !w.worker_team_id).length > 0 && (
                              <Badge className="gap-1 text-xs bg-orange-500/20 text-orange-400 border-0 hover:bg-orange-500/30 hover:text-orange-300">
                                {deptWorkers.filter(w => !w.worker_team_id).length} sin equipo
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-2">
                            {deptWorkers.map(worker => {
                              const team = workerTeams.find(t => t.id === worker.worker_team_id);
                              const workGroup = worker.worker_team_id ? getWorkGroupForTeam(worker.worker_team_id) : null;
                              const isOnVacation = (workersOnVacation.includes(worker.id) || worker.is_on_vacation) && !worker.is_on_leave;
                              const hasActiveComment = workersWithActiveComments.includes(worker.id);
                              const hasNoTeam = !worker.worker_team_id;
                              
                              // Determine row background based on status (no special highlighting - just normal status colors)
                              let rowClass = 'bg-card border-border/30 hover:bg-muted/40 hover:shadow-sm hover:scale-[1.01]';
                              if (worker.is_on_leave) {
                                rowClass = 'bg-destructive/5 border-destructive/20 hover:bg-destructive/10 hover:shadow-sm hover:scale-[1.01]';
                              } else if (isOnVacation) {
                                rowClass = 'bg-cyan-500/5 border-cyan-500/20 hover:bg-cyan-500/10 hover:shadow-sm hover:scale-[1.01]';
                              } else if (hasNoTeam) {
                                rowClass = 'bg-orange-500/5 border-orange-500/20 hover:bg-orange-500/10 hover:shadow-sm hover:scale-[1.01]';
                              } else if (hasActiveComment) {
                                rowClass = 'bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10 hover:shadow-sm hover:scale-[1.01]';
                              }
                              
                              return (
                                <div 
                                  key={worker.id} 
                                  className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ${rowClass} ${selectedWorkerIds.has(worker.id) ? 'ring-2 ring-primary/50' : ''}`}
                                >
                                  <div className="flex items-center gap-3 flex-wrap">
                                    {isAdmin && (
                                      <Checkbox
                                        checked={selectedWorkerIds.has(worker.id)}
                                        onCheckedChange={(checked) => {
                                          const newSet = new Set(selectedWorkerIds);
                                          if (checked) {
                                            newSet.add(worker.id);
                                          } else {
                                            newSet.delete(worker.id);
                                          }
                                          setSelectedWorkerIds(newSet);
                                        }}
                                        className="h-4 w-4"
                                      />
                                    )}
                                    <a
                                      href={`https://salix.verdnatura.es/#/worker/${worker.worker_number}/calendar`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    className={`font-mono text-sm font-medium hover:underline flex items-center gap-1 ${
                                      worker.is_on_leave ? 'text-destructive' : isOnVacation ? 'text-cyan-400' : hasNoTeam ? 'text-orange-400' : hasActiveComment ? 'text-yellow-400' : 'text-primary'
                                    }`}
                                  >
                                    {worker.worker_number}
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                  <button 
                                    onClick={() => navigate(`/admin/worker/${worker.id}`)}
                                    className={`font-medium hover:underline cursor-pointer ${
                                    worker.is_on_leave ? 'text-destructive' : isOnVacation ? 'text-cyan-400' : hasNoTeam ? 'text-orange-400' : hasActiveComment ? 'text-yellow-400' : 'text-foreground'
                                  }`}>{worker.name}</button>
                                    {worker.is_on_leave && (
                                      <Badge variant="destructive" className="gap-1 text-xs">
                                        <AlertCircle className="h-3 w-3" />
                                        De baja
                                      </Badge>
                                    )}
                                    {isOnVacation && (
                                      <Badge className="gap-1 text-xs bg-cyan-500/20 text-cyan-400 border-0 hover:bg-cyan-500/30">
                                        <Umbrella className="h-3 w-3" />
                                        Vacaciones
                                      </Badge>
                                    )}
                                    {hasActiveComment && (
                                      <Badge
                                        className="gap-1 text-xs bg-yellow-500/20 text-yellow-400 border-0 hover:bg-yellow-500/30 cursor-pointer"
                                        onClick={() => {
                                          setCommentPreviewWorkerName(worker.name);
                                          setCommentPreviewText(latestWorkerComments[worker.id] || "Tiene comentarios");
                                          setShowCommentPreviewDialog(true);
                                        }}
                                      >
                                        <MessageSquare className="h-3 w-3" />
                                      </Badge>
                                    )}
                                    {team ? (
                                      <Badge variant="outline" className="gap-1">
                                        <UsersRound className="h-3 w-3" />
                                        {team.name}
                                      </Badge>
                                    ) : (
                                      <Badge className="gap-1 text-xs bg-orange-500/20 text-orange-400 border-0 hover:bg-orange-500/30">
                                        <AlertCircle className="h-3 w-3" />
                                        Sin equipo
                                      </Badge>
                                    )}
                                    {workGroup && (
                                      <Badge 
                                        className="gap-1"
                                        style={{ 
                                          backgroundColor: workGroup.color,
                                          color: '#fff'
                                        }}
                                      >
                                        {workGroup.name}
                                      </Badge>
                                    )}
                                    {/* Vacation days pending - aligned right */}
                                    <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">
                                      {worker.pending_vacation_days || 0} días
                                    </span>
                                  </div>
                                  {isAdmin && (
                                    <div className="flex items-center gap-1">
                                      <Button variant="ghost" size="icon" onClick={() => openEditWorkerDialog(worker)} className="h-8 w-8">
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" onClick={() => handleDeleteWorker(worker.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
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
                  
                  // Single department view
                  return (
                    <div className="space-y-2">
                      {sortedWorkers.map(worker => {
                        const team = workerTeams.find(t => t.id === worker.worker_team_id);
                        const workGroup = worker.worker_team_id ? getWorkGroupForTeam(worker.worker_team_id) : null;
                        const isOnVacation = (workersOnVacation.includes(worker.id) || worker.is_on_vacation) && !worker.is_on_leave;
                        const hasActiveComment = workersWithActiveComments.includes(worker.id);
                        const hasNoTeam = !worker.worker_team_id;
                        
                        // Determine row background based on status (no special highlighting)
                        let rowClass = 'bg-card border-border/30 hover:bg-muted/40 hover:shadow-sm hover:scale-[1.01]';
                        if (worker.is_on_leave) {
                          rowClass = 'bg-destructive/5 border-destructive/20 hover:bg-destructive/10 hover:shadow-sm hover:scale-[1.01]';
                        } else if (isOnVacation) {
                          rowClass = 'bg-cyan-500/5 border-cyan-500/20 hover:bg-cyan-500/10 hover:shadow-sm hover:scale-[1.01]';
                        } else if (hasNoTeam) {
                          rowClass = 'bg-orange-500/5 border-orange-500/20 hover:bg-orange-500/10 hover:shadow-sm hover:scale-[1.01]';
                        } else if (hasActiveComment) {
                          rowClass = 'bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10 hover:shadow-sm hover:scale-[1.01]';
                        }
                        
                        return (
                          <div 
                            key={worker.id} 
                            className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ${rowClass} ${selectedWorkerIds.has(worker.id) ? 'ring-2 ring-primary/50' : ''}`}
                          >
                            <div className="flex items-center gap-3 flex-wrap">
                              {isAdmin && (
                                <Checkbox
                                  checked={selectedWorkerIds.has(worker.id)}
                                  onCheckedChange={(checked) => {
                                    const newSet = new Set(selectedWorkerIds);
                                    if (checked) {
                                      newSet.add(worker.id);
                                    } else {
                                      newSet.delete(worker.id);
                                    }
                                    setSelectedWorkerIds(newSet);
                                  }}
                                  className="h-4 w-4"
                                />
                              )}
                              <a
                                href={`https://salix.verdnatura.es/#/worker/${worker.worker_number}/calendar`}
                                target="_blank"
                                rel="noopener noreferrer"
                              className={`font-mono text-sm font-medium hover:underline flex items-center gap-1 ${
                                worker.is_on_leave ? 'text-destructive' : isOnVacation ? 'text-cyan-400' : hasNoTeam ? 'text-orange-400' : hasActiveComment ? 'text-yellow-400' : 'text-primary'
                              }`}
                            >
                              {worker.worker_number}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <button 
                              onClick={() => navigate(`/admin/worker/${worker.id}`)}
                              className={`font-medium hover:underline cursor-pointer ${
                              worker.is_on_leave ? 'text-destructive' : isOnVacation ? 'text-cyan-400' : hasNoTeam ? 'text-orange-400' : hasActiveComment ? 'text-yellow-400' : 'text-foreground'
                            }`}>{worker.name}</button>
                              {worker.is_on_leave && (
                                <Badge variant="destructive" className="gap-1 text-xs">
                                  <AlertCircle className="h-3 w-3" />
                                  De baja
                                </Badge>
                              )}
                              {isOnVacation && (
                                <Badge className="gap-1 text-xs bg-cyan-500/20 text-cyan-400 border-0 hover:bg-cyan-500/30">
                                  <Umbrella className="h-3 w-3" />
                                  Vacaciones
                                </Badge>
                              )}
                              {hasActiveComment && (
                                <Badge
                                  className="gap-1 text-xs bg-yellow-500/20 text-yellow-400 border-0 hover:bg-yellow-500/30 cursor-pointer"
                                  onClick={() => {
                                    setCommentPreviewWorkerName(worker.name);
                                    setCommentPreviewText(latestWorkerComments[worker.id] || "Tiene comentarios");
                                    setShowCommentPreviewDialog(true);
                                  }}
                                >
                                  <MessageSquare className="h-3 w-3" />
                                </Badge>
                              )}
                              {team ? (
                                <Badge variant="outline" className="gap-1">
                                  <UsersRound className="h-3 w-3" />
                                  {team.name}
                                </Badge>
                              ) : (
                                <Badge className="gap-1 text-xs bg-orange-500/20 text-orange-400 border-0 hover:bg-orange-500/30">
                                  <AlertCircle className="h-3 w-3" />
                                  Sin equipo
                                </Badge>
                              )}
                              {workGroup && (
                                <Badge 
                                  className="gap-1"
                                  style={{ 
                                    backgroundColor: workGroup.color,
                                    color: '#fff'
                                  }}
                                >
                                  {workGroup.name}
                                </Badge>
                              )}
                              {/* Vacation days pending - aligned right */}
                              <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">
                                {worker.pending_vacation_days || 0} días
                              </span>
                            </div>
                            {isAdmin && (
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditWorkerDialog(worker)} className="h-8 w-8">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteWorker(worker.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Teams Tab */}
        {visitedTabs.has("teams") && (
          <div className={activeTab !== "teams" ? "hidden" : "animate-fade-in"}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="text-lg">Equipos de Trabajo</CardTitle>
                  <CardDescription>Grupos internos como A1, A2, B1, B2, etc. para organizar los turnos</CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedDepartmentId !== "all" && (
                    <>
                      {/* Sorting toggle for CAMARA department */}
                      {departments.find(d => d.id === selectedDepartmentId)?.name?.toLowerCase() === "cámara" && (
                        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                          <Button
                            size="sm"
                            variant={teamsSortMode === "team" ? "default" : "ghost"}
                            onClick={() => setTeamsSortMode("team")}
                            className="h-7 text-xs gap-1"
                          >
                            <UsersRound className="h-3 w-3" />
                            Equipo
                          </Button>
                          <Button
                            size="sm"
                            variant={teamsSortMode === "color" ? "default" : "ghost"}
                            onClick={() => setTeamsSortMode("color")}
                            className="h-7 text-xs gap-1"
                          >
                            <Palette className="h-3 w-3" />
                            Color
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Label htmlFor="pdf-mode-teams" className="text-[10px] sm:text-xs whitespace-nowrap">Modo claro</Label>
                        <Switch
                          id="pdf-mode-teams"
                          checked={pdfLightMode}
                          onCheckedChange={setPdfLightMode}
                        />
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-2"
                        onClick={handleDownloadTeamsPdf}
                        disabled={generatingPdf}
                      >
                        <Download className="h-4 w-4" />
                        <span className="hidden sm:inline">{generatingPdf ? "Generando..." : "PDF"}</span>
                      </Button>
                    </>
                  )}
                  {isAdmin && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowCreateTeamDialog(true)} 
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">Nuevo Equipo</span>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {/* Worker search in teams */}
                <div className="mb-5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Buscar trabajadores para resaltar (nombre, número o siglas)..."
                      value={teamsSearchQuery}
                      onChange={(e) => setTeamsSearchQuery(e.target.value)}
                      className="pl-10 pr-10 h-10 text-sm"
                    />
                    {teamsSearchQuery && (
                      <button
                        onClick={() => setTeamsSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center transition-colors"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  {teamsSearchQuery && (
                    <div className="flex items-center gap-2 mt-2 pl-1">
                      <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">
                        {highlightedWorkerIds.size} encontrado{highlightedWorkerIds.size !== 1 ? 's' : ''}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        Separa con comas para buscar varios
                      </span>
                    </div>
                  )}
                </div>
                {workerTeams.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay equipos creados. Crea equipos para organizar a los trabajadores.
                  </div>
                ) : isCamaraDepartment() && teamsSortMode === "color" ? (
                  // CAMARA department: Group by vacation color
                  (() => {
                    const { grouped, noGroup } = getWorkersGroupedByVacationColor();
                    const sortedGroups = Object.values(grouped).sort((a, b) => 
                      a.group.name.localeCompare(b.group.name, undefined, { numeric: true })
                    );
                    
                    return (
                      <div className="space-y-6">
                        {sortedGroups.map(({ group, workers: groupWorkers }) => {
                          // Sort workers by team name first, then by worker number
                          const sortedWorkers = groupWorkers.sort((a, b) => {
                            const teamA = workerTeams.find(t => t.id === a.worker_team_id)?.name || "zzz";
                            const teamB = workerTeams.find(t => t.id === b.worker_team_id)?.name || "zzz";
                            if (teamA !== teamB) return teamA.localeCompare(teamB, undefined, { numeric: true });
                            return a.worker_number.localeCompare(b.worker_number, undefined, { numeric: true });
                          });
                          const workersOnLeave = sortedWorkers.filter(w => w.is_on_leave).length;
                          
                          return (
                            <div key={group.id}>
                              {/* Group header with color */}
                              <div className="flex items-center gap-3 mb-3">
                                <div 
                                  className="w-5 h-5 rounded-full border-2 border-background shadow-sm"
                                  style={{ backgroundColor: group.color }}
                                />
                                <span className="text-lg font-semibold" style={{ color: group.color }}>{group.name}</span>
                                <Badge variant="secondary">{sortedWorkers.length} trabajador{sortedWorkers.length !== 1 ? 'es' : ''}</Badge>
                                {workersOnLeave > 0 && (
                                  <Badge variant="destructive">{workersOnLeave} de baja</Badge>
                                )}
                                <div className="flex-1 h-px bg-border" />
                              </div>
                              
                              {/* Workers grid */}
                              <div className="flex flex-wrap gap-2">
                                {sortedWorkers.map(w => {
                                  const team = workerTeams.find(t => t.id === w.worker_team_id);
                                  const hasActiveComment = workersWithActiveComments.includes(w.id);
                                  const isOnVacation = workersOnVacation.includes(w.id) || w.is_on_vacation;
                                  
                                  let badgeClassName = "text-xs cursor-pointer transition-colors border ";
                                  let customStyle: React.CSSProperties = { 
                                    backgroundColor: `${group.color}30`, 
                                    color: group.color,
                                    borderColor: `${group.color}50`
                                  };
                                  
                                  if (w.is_on_leave) {
                                    customStyle = {};
                                    badgeClassName += "bg-destructive text-destructive-foreground hover:bg-destructive/80 border-destructive";
                                  } else if (isOnVacation) {
                                    customStyle = {};
                                    badgeClassName += "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 hover:text-white border-cyan-500/30";
                                  } else if (hasActiveComment) {
                                    customStyle = {};
                                    badgeClassName += "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 hover:text-white border-yellow-500/30";
                                  } else {
                                    badgeClassName += "hover:opacity-80";
                                  }
                                  
                                  return (
                                    <a
                                      key={w.id}
                                      href={`https://salix.verdnatura.es/#/worker/${w.worker_number}/calendar`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <Badge 
                                        className={badgeClassName}
                                        style={w.is_on_leave || isOnVacation || hasActiveComment ? {} : customStyle}
                                      >
                                        {w.worker_number}
                                        {team && <span className="ml-1 opacity-70">({team.name})</span>}
                                        {isOnVacation && !w.is_on_leave && <Umbrella className="h-2.5 w-2.5 ml-1" />}
                                        {hasActiveComment && !isOnVacation && !w.is_on_leave && <MessageSquare className="h-2.5 w-2.5 ml-1" />}
                                      </Badge>
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        
                        {/* Workers without group */}
                        {noGroup.length > 0 && (
                          <div>
                            <div className="flex items-center gap-3 mb-3">
                              <span className="text-lg font-semibold text-muted-foreground">Sin asignar</span>
                              <Badge variant="secondary">{noGroup.length} trabajador{noGroup.length !== 1 ? 'es' : ''}</Badge>
                              <div className="flex-1 h-px bg-border" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {noGroup.sort((a, b) => a.worker_number.localeCompare(b.worker_number, undefined, { numeric: true })).map(w => {
                                const team = workerTeams.find(t => t.id === w.worker_team_id);
                                return (
                                  <a
                                    key={w.id}
                                    href={`https://salix.verdnatura.es/#/worker/${w.worker_number}/calendar`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground">
                                      {w.worker_number}
                                      {team && <span className="ml-1 opacity-70">({team.name})</span>}
                                    </Badge>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  (() => {
                    // Default: Group teams by prefix — manager-style chip layout
                    const groupedTeams: { [key: string]: typeof workerTeams } = {};
                    workerTeams.forEach(team => {
                      const prefix = team.display_name || `Grupo ${team.name.charAt(0).toUpperCase()}`;
                      if (!groupedTeams[prefix]) groupedTeams[prefix] = [];
                      groupedTeams[prefix].push(team);
                    });
                    const sortedPrefixes = Object.keys(groupedTeams).sort();
                    // Collect all responsable worker IDs to exclude them from team member lists
                    const allResponsableWorkerIds = new Set<string>();
                    workerTeams.forEach(t => {
                      if (t.responsable_worker_id) allResponsableWorkerIds.add(t.responsable_worker_id);
                    });
                    const unassignedWorkers = workers.filter(w => !w.worker_team_id && !allResponsableWorkerIds.has(w.id));

                    const renderAdminWorkerChip = (w: Worker) => {
                      const wGroup = w.work_group_id ? workGroups.find(g => g.id === w.work_group_id) : null;
                      const teamMapping = w.worker_team_id ? workGroupTeams.find(wgt => wgt.worker_team_id === w.worker_team_id) : null;
                      const teamGroup = teamMapping ? workGroups.find(g => g.id === teamMapping.work_group_id) : null;
                      const wgColor = wGroup?.color || teamGroup?.color || null;
                      const isOnVacation = !w.is_on_leave && (workersOnVacation.includes(w.id) || w.is_on_vacation);
                      const showColor = isCamaraDepartment() && wgColor;
                      const isHighlighted = highlightedWorkerIds.has(w.id);

                      return (
                        <button
                          key={w.id}
                          onClick={(e) => {
                            if ((e.metaKey || e.ctrlKey) && w.worker_number) {
                              e.preventDefault();
                              e.stopPropagation();
                              window.open(`https://salix.verdnatura.es/#!/worker/${w.worker_number}/summary`, '_blank');
                              return;
                            }
                            openEditWorkerDialog(w);
                          }}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded transition-colors cursor-pointer",
                            isHighlighted
                              ? "ring-2 ring-[hsl(var(--primary))] bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] font-semibold shadow-[0_0_8px_hsl(var(--primary)/0.3)]"
                              : w.is_on_leave ? "bg-destructive/20 text-destructive line-through"
                              : isOnVacation ? "bg-cyan-500/20 text-cyan-400 italic"
                              : "bg-muted text-foreground hover:bg-muted/80"
                          )}
                          style={!isHighlighted && !w.is_on_leave && !isOnVacation && showColor ? {
                            backgroundColor: wgColor + '30',
                            color: wgColor
                          } : undefined}
                          title={w.worker_number ? "⌘/Ctrl+Click → Salix" : undefined}
                        >
                          {w.name}
                          {w.worker_number && (
                            <span className="ml-1 text-[9px] opacity-60">({w.worker_number})</span>
                          )}
                        </button>
                      );
                    };

                    return (
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {sortedPrefixes.map(prefix => {
                            const teamsInGroup = groupedTeams[prefix].sort((a, b) =>
                              a.name.localeCompare(b.name, undefined, { numeric: true })
                            );
                            // Find group-level responsable (first team with a responsable)
                            const responsableTeam = teamsInGroup.find(t => t.responsable_worker_id);
                            const responsableWorkerId = responsableTeam?.responsable_worker_id;
                            // Look up from allResponsables (cross-department) first, then workers
                            const responsableWorker = responsableWorkerId
                              ? (allResponsables.find(r => r.id === responsableWorkerId) 
                                || workers.find(w => w.id === responsableWorkerId))
                              : null;
                            // Total workers across all teams in this group
                            const totalGroupWorkers = teamsInGroup.reduce((acc, team) =>
                              acc + workers.filter(w => w.worker_team_id === team.id && !allResponsableWorkerIds.has(w.id)).length, 0
                            );
                            return (
                              <div key={prefix} className="space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-medium text-primary">{prefix}</span>
                                  {responsableWorker && (
                                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30">
                                      <UserCheck className="h-2.5 w-2.5 text-amber-500 flex-shrink-0" />
                                      <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400 truncate max-w-[140px]">
                                        {responsableWorker.name}
                                      </span>
                                      {'department_name' in responsableWorker && (responsableWorker as any).department_name && (
                                        <span className="text-[8px] text-amber-500/70">
                                          ({(responsableWorker as any).department_name})
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <Badge variant="outline" className="text-[10px] ml-auto">
                                    {totalGroupWorkers}{responsableWorker ? ' +1' : ''}
                                  </Badge>
                                </div>
                                {teamsInGroup.map(team => {
                                  const teamWorkers = workers
                                    .filter(w => w.worker_team_id === team.id && !allResponsableWorkerIds.has(w.id))
                                    .sort((a, b) => a.name.localeCompare(b.name));
                                  const workGroup = getWorkGroupForTeam(team.id);
                                  return (
                                    <Card key={team.id} className="border-border/30">
                                      <CardContent className="p-3">
                                        <div className="flex items-center gap-2 mb-1.5">
                                          {workGroup && (
                                            <div
                                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                              style={{ backgroundColor: workGroup.color }}
                                            />
                                          )}
                                          <h4 className="font-medium text-xs">{team.name}</h4>
                                          <span className="text-[10px] text-muted-foreground ml-auto">{teamWorkers.length}</span>
                                          {isAdmin && (
                                            <div className="flex items-center gap-0">
                                              <Button variant="ghost" size="icon" onClick={() => openEditTeamDialog(team)} className="h-5 w-5">
                                                <Pencil className="h-2.5 w-2.5" />
                                              </Button>
                                              <Button variant="ghost" size="icon" onClick={() => handleDeleteTeam(team.id)} className="h-5 w-5 text-destructive hover:text-destructive">
                                                <Trash2 className="h-2.5 w-2.5" />
                                              </Button>
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                          {teamWorkers.map(renderAdminWorkerChip)}
                                        </div>
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
                                  {unassignedWorkers.sort((a, b) => a.name.localeCompare(b.name)).map(renderAdminWorkerChip)}
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}

                {/* Info about assigning teams to vacation groups */}
                <div className="mt-6 p-4 bg-muted/50 rounded-xl border border-border/50">
                  <p className="text-sm text-muted-foreground flex items-start gap-2">
                    <Users className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                    <span>
                      Para asignar estos equipos a los <strong>grupos vacacionales con colores</strong>, 
                      ve al <strong>Calendario Anual</strong> del departamento. Allí podrás seleccionar 
                      qué equipos pertenecen a cada grupo de color para la rotación de vacaciones.
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Import CSV Tab - Admin only */}
        {isAdmin && visitedTabs.has("import") && (
          <div className={activeTab !== "import" ? "hidden" : "animate-fade-in"}>
              <CSVImportPanel
                departments={departments}
                teams={allWorkerTeams}
                getSessionToken={getSessionToken}
                onImportComplete={({ createdWorkers, updatedWorkers }) => {
                  invalidateCache(); // Clear cache after import
                  fetchData(true); // Force refresh
                  // Track imported workers for filtering
                  const now = Date.now();
                  if (createdWorkers.length > 0) {
                    setRecentlyAddedWorkers(prev => {
                      const newMap = new Map(prev);
                      createdWorkers.forEach(num => newMap.set(num, now));
                      return newMap;
                    });
                  }
                  if (updatedWorkers.length > 0) {
                    setRecentlyUpdatedWorkers(prev => {
                      const newMap = new Map(prev);
                      updatedWorkers.forEach(num => newMap.set(num, now));
                      return newMap;
                    });
                  }
                }}
                onWorkerClick={(workerNumber) => {
                  // Find the worker by number and open edit dialog
                  const worker = workers.find(w => w.worker_number === workerNumber);
                  if (worker) {
                    openEditWorkerDialog(worker);
                  }
                }}
              />
          </div>
        )}

        {/* Vacation Group Mapping Tab - Admin only */}
        {isAdmin && visitedTabs.has("mapping") && (
          <div className={activeTab !== "mapping" ? "hidden" : "animate-fade-in"}>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Palette className="h-5 w-5 text-primary" />
                        Mapeo de Grupos Vacacionales
                        {getWorkersWithoutVacationGroup.length > 0 && (
                          <Badge variant="destructive">
                            {getWorkersWithoutVacationGroup.length} sin asignar
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        Asigna grupos vacacionales a equipos o trabajadores individuales.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleIntegrityCheck}
                        disabled={isRunningIntegrityCheck || loadingWorkers}
                        className="flex items-center gap-2"
                      >
                        {isRunningIntegrityCheck ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <AlertCircle className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">Verificar integridad</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefreshMappingData}
                        disabled={isRefreshingMappingData}
                        className="flex items-center gap-2"
                      >
                        <RefreshCw className={`h-4 w-4 ${isRefreshingMappingData ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Actualizar</span>
                      </Button>
                    </div>
                  </div>
                  
                  {/* Integrity check results */}
                  {showIntegrityResults && integrityConflicts.length > 0 && (
                    <div className="mt-4 p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-destructive flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          {integrityConflicts.length} conflicto{integrityConflicts.length !== 1 ? 's' : ''} detectado{integrityConflicts.length !== 1 ? 's' : ''}
                        </h4>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowIntegrityResults(false)}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Cerrar
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleFixAllConflicts}
                            disabled={isRunningIntegrityCheck}
                          >
                            {isRunningIntegrityCheck ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3 mr-1" />
                            )}
                            Corregir todos
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Estos trabajadores tienen una asignación directa de grupo que contradice el mapeo de su equipo. 
                        Al corregir, se eliminará la asignación directa y heredarán el grupo de su equipo.
                      </p>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {integrityConflicts.map(conflict => (
                          <div 
                            key={conflict.workerId}
                            className="flex items-center justify-between gap-4 p-3 rounded-lg bg-background border border-border/50"
                          >
                            <div>
                              <p className="font-medium text-sm">{conflict.workerName} ({conflict.workerNumber})</p>
                              <p className="text-xs text-muted-foreground">{conflict.deptName} · Equipo {conflict.teamName}</p>
                            </div>
                            <div className="text-right text-xs">
                              <p className="text-destructive">Directo: {conflict.directGroupName}</p>
                              <p className="text-green-600">Equipo: {conflict.teamGroupName}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {loadingWorkers || isRefreshingMappingData ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {/* Teams without vacation group mapping section */}
                      {(() => {
                        // Find teams that have workers but no vacation group mapping
                        const teamsWithoutGroupMapping: { team: WorkerTeam; deptName: string; deptId: string; workerCount: number }[] = [];
                        
                        workerTeams.forEach(team => {
                          // Skip Cámara department - uses direct worker assignment, not team mapping
                          const dept = departments.find(d => d.id === team.department_id);
                          if (dept?.name?.toLowerCase() === 'cámara') return;
                          
                          const hasMapping = workGroupTeams.some(wgt => wgt.worker_team_id === team.id);
                          if (!hasMapping) {
                            const teamWorkerCount = workers.filter(w => w.worker_team_id === team.id).length;
                            if (teamWorkerCount > 0) {
                              teamsWithoutGroupMapping.push({
                                team,
                                deptName: dept?.name || 'Desconocido',
                                deptId: team.department_id,
                                workerCount: teamWorkerCount
                              });
                            }
                          }
                        });
                        
                        // Group by department
                        const byDept: { [deptName: string]: typeof teamsWithoutGroupMapping } = {};
                        teamsWithoutGroupMapping.forEach(t => {
                          if (!byDept[t.deptName]) byDept[t.deptName] = [];
                          byDept[t.deptName].push(t);
                        });
                        const sortedDepts = Object.keys(byDept).sort();
                        
                        if (teamsWithoutGroupMapping.length === 0) return null;
                        
                        return (
                          <div>
                            <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                              <Link2 className="h-4 w-4 text-orange-500" />
                              Equipos sin grupo vacacional
                              <Badge variant="outline" className="text-orange-500 border-orange-500/50">
                                {teamsWithoutGroupMapping.length}
                              </Badge>
                            </h3>
                            <p className="text-sm text-muted-foreground mb-4">
                              Asigna un grupo vacacional a estos equipos para que todos sus trabajadores hereden el grupo automáticamente.
                            </p>
                            
                            <div className="space-y-4">
                              {sortedDepts.map(deptName => {
                                const deptTeams = byDept[deptName];
                                const deptId = deptTeams[0]?.deptId;
                                const deptGroups = workGroups.filter(g => g.department_id === deptId);
                                
                                return (
                                  <div key={deptName} className="border border-orange-500/30 rounded-xl p-4 bg-orange-500/5">
                                    <div className="flex items-center gap-3 mb-3">
                                      <h4 className="font-medium text-foreground">{deptName}</h4>
                                      <Badge variant="secondary">{deptTeams.length} equipo{deptTeams.length !== 1 ? 's' : ''}</Badge>
                                    </div>
                                    
                                    {deptGroups.length > 0 && (
                                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                                        <span className="text-xs text-muted-foreground">Grupos disponibles:</span>
                                        {deptGroups.map(g => (
                                          <Badge 
                                            key={g.id} 
                                            className="text-white text-xs"
                                            style={{ backgroundColor: g.color }}
                                          >
                                            {g.name}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                    
                                    <div className="space-y-2">
                                      {deptTeams.map(({ team, workerCount }) => (
                                        <div 
                                          key={team.id}
                                          className="flex items-center justify-between gap-4 p-3 rounded-lg bg-background border border-border/50"
                                        >
                                          <div className="flex items-center gap-3">
                                            <UsersRound className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                              <p className="font-medium text-foreground">{team.name}</p>
                                              <p className="text-xs text-muted-foreground">
                                                {workerCount} trabajador{workerCount !== 1 ? 'es' : ''}
                                              </p>
                                            </div>
                                          </div>
                                          
                                          <div className="flex items-center gap-2">
                                            {deptGroups.length > 0 ? (
                                              <Select
                                                value=""
                                                onValueChange={(value) => handleAssignTeamToVacationGroup(team.id, value, deptId)}
                                                disabled={savingTeamGroupMapping === team.id}
                                              >
                                                <SelectTrigger className="w-40 h-8">
                                                  {savingTeamGroupMapping === team.id ? (
                                                    <div className="flex items-center gap-2">
                                                      <Loader2 className="h-3 w-3 animate-spin" />
                                                      <span className="text-xs">Guardando...</span>
                                                    </div>
                                                  ) : (
                                                    <SelectValue placeholder="Asignar grupo" />
                                                  )}
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {deptGroups.map(g => (
                                                    <SelectItem key={g.id} value={g.id}>
                                                      <div className="flex items-center gap-2">
                                                        <div 
                                                          className="w-3 h-3 rounded-full" 
                                                          style={{ backgroundColor: g.color }}
                                                        />
                                                        {g.name}
                                                      </div>
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            ) : (
                                              <span className="text-xs text-muted-foreground italic">
                                                Sin grupos configurados
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* All teams mapping overview */}
                      {(() => {
                        // Show all teams with their current mappings
                        const teamsWithMapping: { team: WorkerTeam; deptName: string; deptId: string; groupId: string | null; workerCount: number }[] = [];
                        
                        workerTeams.forEach(team => {
                          const mapping = workGroupTeams.find(wgt => wgt.worker_team_id === team.id);
                          const dept = departments.find(d => d.id === team.department_id);
                          const teamWorkerCount = workers.filter(w => w.worker_team_id === team.id).length;
                          if (mapping && teamWorkerCount > 0) {
                            teamsWithMapping.push({
                              team,
                              deptName: dept?.name || 'Desconocido',
                              deptId: team.department_id,
                              groupId: mapping.work_group_id,
                              workerCount: teamWorkerCount
                            });
                          }
                        });
                        
                        // Group by department
                        const byDept: { [deptName: string]: typeof teamsWithMapping } = {};
                        teamsWithMapping.forEach(t => {
                          if (!byDept[t.deptName]) byDept[t.deptName] = [];
                          byDept[t.deptName].push(t);
                        });
                        const sortedDepts = Object.keys(byDept).sort();
                        
                        if (teamsWithMapping.length === 0) return null;
                        
                        return (
                          <div>
                            <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                              <Check className="h-4 w-4 text-green-500" />
                              Equipos con grupo asignado
                              <Badge variant="secondary">
                                {teamsWithMapping.length}
                              </Badge>
                            </h3>
                            
                            <div className="space-y-4">
                              {sortedDepts.map(deptName => {
                                const deptTeams = byDept[deptName];
                                const deptId = deptTeams[0]?.deptId;
                                const deptGroups = workGroups.filter(g => g.department_id === deptId);
                                
                                return (
                                  <div key={deptName} className="border border-border rounded-xl p-4 bg-muted/20">
                                    <div className="flex items-center gap-3 mb-3">
                                      <h4 className="font-medium text-foreground">{deptName}</h4>
                                      <Badge variant="secondary">{deptTeams.length} equipo{deptTeams.length !== 1 ? 's' : ''}</Badge>
                                    </div>
                                    
                                    <div className="space-y-2">
                                      {deptTeams.map(({ team, groupId, workerCount }) => {
                                        const currentGroup = workGroups.find(g => g.id === groupId);
                                        return (
                                          <div 
                                            key={team.id}
                                            className="flex items-center justify-between gap-4 p-3 rounded-lg bg-background border border-border/50"
                                          >
                                            <div className="flex items-center gap-3">
                                              <UsersRound className="h-4 w-4 text-muted-foreground" />
                                              <div>
                                                <p className="font-medium text-foreground">{team.name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                  {workerCount} trabajador{workerCount !== 1 ? 'es' : ''}
                                                </p>
                                              </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-2">
                                              <Select
                                                value={groupId || ""}
                                                onValueChange={(value) => handleAssignTeamToVacationGroup(team.id, value, deptId)}
                                                disabled={savingTeamGroupMapping === team.id}
                                              >
                                                <SelectTrigger className="w-40 h-8">
                                                  {savingTeamGroupMapping === team.id ? (
                                                    <div className="flex items-center gap-2">
                                                      <Loader2 className="h-3 w-3 animate-spin" />
                                                      <span className="text-xs">Guardando...</span>
                                                    </div>
                                                  ) : currentGroup ? (
                                                    <div className="flex items-center gap-2">
                                                      <div 
                                                        className="w-3 h-3 rounded-full" 
                                                        style={{ backgroundColor: currentGroup.color }}
                                                      />
                                                      <span className="truncate">{currentGroup.name}</span>
                                                    </div>
                                                  ) : (
                                                    <SelectValue placeholder="Seleccionar" />
                                                  )}
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {deptGroups.map(g => (
                                                    <SelectItem key={g.id} value={g.id}>
                                                      <div className="flex items-center gap-2">
                                                        <div 
                                                          className="w-3 h-3 rounded-full" 
                                                          style={{ backgroundColor: g.color }}
                                                        />
                                                        {g.name}
                                                      </div>
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      
                      {/* Workers without vacation group section */}
                      {getWorkersWithoutVacationGroup.length > 0 && (
                        <div>
                          <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                            <User className="h-4 w-4 text-destructive" />
                            Trabajadores sin grupo vacacional
                            <Badge variant="destructive">
                              {getWorkersWithoutVacationGroup.length}
                            </Badge>
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Estos trabajadores no tienen grupo asignado directamente ni heredado por su equipo.
                          </p>
                          
                          {/* Group workers by department */}
                          <div className="space-y-4">
                            {(() => {
                              const byDept: { [deptName: string]: typeof getWorkersWithoutVacationGroup } = {};
                              getWorkersWithoutVacationGroup.forEach(w => {
                                if (!byDept[w.departmentName]) byDept[w.departmentName] = [];
                                byDept[w.departmentName].push(w);
                              });
                              const sortedDepts = Object.keys(byDept).sort();
                              
                              return sortedDepts.map(deptName => {
                                const deptWorkers = byDept[deptName];
                                const firstWorker = deptWorkers[0];
                                const deptGroups = workGroups.filter(g => g.department_id === firstWorker?.department_id);
                                
                                return (
                                  <div key={deptName} className="border border-destructive/30 rounded-xl p-4 bg-destructive/5">
                                    <div className="flex items-center gap-3 mb-4">
                                      <h4 className="font-medium text-foreground">{deptName}</h4>
                                      <Badge variant="secondary">{deptWorkers.length} trabajador{deptWorkers.length !== 1 ? 'es' : ''}</Badge>
                                      {deptGroups.length === 0 && (
                                        <Badge variant="outline" className="text-orange-500 border-orange-500/50">
                                          Sin grupos vacacionales configurados
                                        </Badge>
                                      )}
                                    </div>
                                    
                                    {deptGroups.length > 0 && (
                                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                                        <span className="text-xs text-muted-foreground">Grupos disponibles:</span>
                                        {deptGroups.map(g => (
                                          <Badge 
                                            key={g.id} 
                                            className="text-white text-xs"
                                            style={{ backgroundColor: g.color }}
                                          >
                                            {g.name}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                    
                                    <div className="space-y-2">
                                      {deptWorkers.map(worker => (
                                        <div 
                                          key={worker.id}
                                          className="flex items-center justify-between gap-4 p-3 rounded-lg bg-background border border-border/50"
                                        >
                                          <div className="flex items-center gap-3 min-w-0">
                                            <div className="flex-shrink-0">
                                              <Badge variant="outline" className="font-mono text-xs">
                                                {worker.worker_number}
                                              </Badge>
                                            </div>
                                            <div className="min-w-0">
                                              <p className="font-medium text-foreground truncate">{worker.name}</p>
                                              {worker.teamName && (
                                                <p className="text-xs text-muted-foreground">
                                                  Equipo: {worker.teamName}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                          
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            {deptGroups.length > 0 ? (
                                              <Select
                                                value={worker.work_group_id || ""}
                                                onValueChange={(value) => handleAssignVacationGroup(worker.id, value)}
                                                disabled={savingGroupAssignment === worker.id}
                                              >
                                                <SelectTrigger className="w-36 h-8">
                                                  {savingGroupAssignment === worker.id ? (
                                                    <div className="flex items-center gap-2">
                                                      <Loader2 className="h-3 w-3 animate-spin" />
                                                      <span className="text-xs">Guardando...</span>
                                                    </div>
                                                  ) : (
                                                    <SelectValue placeholder="Asignar grupo" />
                                                  )}
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {deptGroups.map(g => (
                                                    <SelectItem key={g.id} value={g.id}>
                                                      <div className="flex items-center gap-2">
                                                        <div 
                                                          className="w-3 h-3 rounded-full" 
                                                          style={{ backgroundColor: g.color }}
                                                        />
                                                        {g.name}
                                                      </div>
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            ) : (
                                              <span className="text-xs text-muted-foreground italic">
                                                Configura grupos en el Calendario Anual
                                              </span>
                                            )}
                                            
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8"
                                              onClick={() => {
                                                const w = workers.find(wr => wr.id === worker.id);
                                                if (w) openEditWorkerDialog(w);
                                              }}
                                            >
                                              <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}
                      
                      {/* All good message when nothing needs assignment */}
                      {getWorkersWithoutVacationGroup.length === 0 && (() => {
                        const teamsWithoutMapping = workerTeams.filter(team => {
                          // Exclude Cámara - uses direct worker assignment
                          const dept = departments.find(d => d.id === team.department_id);
                          if (dept?.name?.toLowerCase() === 'cámara') return false;
                          
                          const hasMapping = workGroupTeams.some(wgt => wgt.worker_team_id === team.id);
                          const hasWorkers = workers.some(w => w.worker_team_id === team.id);
                          return !hasMapping && hasWorkers;
                        });
                        return teamsWithoutMapping.length === 0;
                      })() && (
                        <div className="text-center py-12">
                          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-4">
                            <Check className="h-8 w-8 text-green-500" />
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">¡Todo en orden!</h3>
                          <p className="text-muted-foreground">
                            Todos los equipos y trabajadores tienen un grupo vacacional asignado.
                          </p>
                        </div>
                      )}
                      
                      <div className="p-4 bg-muted/50 rounded-xl border border-border/50">
                        <p className="text-sm text-muted-foreground flex items-start gap-2">
                          <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                          <span>
                            <strong>Recomendación:</strong> Asigna grupos vacacionales a nivel de equipo. 
                            Todos los trabajadores del equipo heredarán automáticamente el grupo. 
                            Solo usa asignación individual cuando un trabajador necesita un grupo diferente a su equipo.
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
          </div>
        )}

        {/* Team Configurator Tab - Admin only */}
        {isAdmin && selectedDepartmentId !== "all" && visitedTabs.has("configurator") && (
          <div className={activeTab !== "configurator" ? "hidden" : "animate-fade-in"}>
            <TeamConfiguratorTab
              departmentId={selectedDepartmentId}
              departmentName={departments.find(d => d.id === selectedDepartmentId)?.name}
              workerTeams={workerTeams}
              workers={workers}
              workGroups={workGroups}
              workGroupTeams={workGroupTeams}
              getSessionToken={getSessionToken}
              onApplied={() => {
                invalidateCache();
                fetchData(true);
              }}
            />
          </div>
        )}

        {/* Deleted Workers History Tab - Admin only */}
        {isAdmin && visitedTabs.has("history") && (
          <div className={activeTab !== "history" ? "hidden" : "animate-fade-in"}>
            <DeletedWorkersHistoryPanel
              departments={departments}
              getSessionToken={getSessionToken}
              onWorkerRestored={() => {
                invalidateCache();
                fetchData(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Create Team Dialog */}
      <Dialog open={showCreateTeamDialog} onOpenChange={(open) => {
        setShowCreateTeamDialog(open);
        if (!open) {
          setNewTeamName("");
          setCreateTeamDepartmentId("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Equipo de Trabajo</DialogTitle>
            <DialogDescription>
              Crea un equipo para agrupar trabajadores (ej: A1, A2, B1, B2)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Department selector - shown when "all" departments is selected */}
            {selectedDepartmentId === "all" && (
              <div className="space-y-2">
                <Label>Departamento</Label>
                <Select value={createTeamDepartmentId} onValueChange={setCreateTeamDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Nombre del equipo</Label>
              <Input
                placeholder="Ej: A1, Turno Mañana, etc."
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTeamDialog(false)}>Cancelar</Button>
            <Button 
              onClick={handleCreateTeam} 
              disabled={saving || !newTeamName.trim() || (selectedDepartmentId === "all" && !createTeamDepartmentId)}
            >
              {saving ? "Creando..." : "Crear Equipo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Team Dialog */}
      <Dialog open={showEditTeamDialog} onOpenChange={setShowEditTeamDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Equipo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre del equipo</Label>
              <Input
                placeholder="Nombre del equipo"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditTeamDialog(false)}>Cancelar</Button>
            <Button onClick={handleUpdateTeam} disabled={saving || !newTeamName.trim()}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Worker Dialog */}
      <Dialog open={showCreateWorkerDialog} onOpenChange={(open) => {
        setShowCreateWorkerDialog(open);
        if (!open) {
          setPendingRequestId(null);
          setNewWorkerNumber("");
          setNewWorkerName("");
          setNewWorkerTeamId("");
          setCreateWorkerDepartmentId("");
          // Clear URL params if dialog is closed
          if (urlRequestId) {
            navigate("/admin/worker-groups", { replace: true });
          }
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir Trabajador</DialogTitle>
            <DialogDescription>
              Añade un trabajador con su número de fichar y nombre
            </DialogDescription>
          </DialogHeader>
          
          {/* Notice if coming from group join request */}
          {pendingRequestId && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-600">Solicitud de incorporación</p>
                <p className="text-muted-foreground">Al guardar este trabajador, la solicitud se marcará como revisada.</p>
              </div>
            </div>
          )}
          
          <div className="space-y-4 py-4">
            {/* Department selector - shown when "all" departments is selected */}
            {selectedDepartmentId === "all" && (
              <div className="space-y-2">
                <Label>Departamento</Label>
                <Select value={createWorkerDepartmentId} onValueChange={(val) => {
                  setCreateWorkerDepartmentId(val);
                  setNewWorkerTeamId(""); // Reset team when department changes
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label className="flex items-center justify-between">
                <span>Número de fichar</span>
                {newWorkerNumber && (
                  <a
                    href={`https://salix.verdnatura.es/#/worker/${newWorkerNumber}/calendar`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    Ver en Salix
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </Label>
              <Input
                placeholder="Ej: 12345"
                value={newWorkerNumber}
                onChange={(e) => setNewWorkerNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input
                placeholder="Nombre del trabajador"
                value={newWorkerName}
                onChange={(e) => setNewWorkerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Equipo de trabajo (opcional)</Label>
              <Select 
                value={newWorkerTeamId || "none"} 
                onValueChange={(val) => setNewWorkerTeamId(val === "none" ? "" : val)}
                disabled={selectedDepartmentId === "all" && !createWorkerDepartmentId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {(selectedDepartmentId === "all" 
                    ? workerTeams.filter(t => t.department_id === createWorkerDepartmentId)
                    : workerTeams
                  ).map(team => (
                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDepartmentId === "all" && !createWorkerDepartmentId && (
                <p className="text-xs text-muted-foreground">Selecciona primero un departamento</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateWorkerDialog(false)}>Cancelar</Button>
            <Button 
              onClick={handleCreateWorker} 
              disabled={saving || !newWorkerName.trim() || !newWorkerNumber.trim() || (selectedDepartmentId === "all" && !createWorkerDepartmentId)}
            >
              {saving ? "Añadiendo..." : "Añadir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Worker Dialog */}
      <Dialog
        open={showEditWorkerDialog}
        onOpenChange={(open) => {
          setShowEditWorkerDialog(open);
          if (!open) {
            // cancel in-flight requests + prevent stuck loader
            commentFetchSeqRef.current++;
            setLoadingComments(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Editar Trabajador
              {workersWithActiveComments.includes(editingWorker?.id || "") && (
                <Badge variant="secondary" className="gap-1 bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
                  <MessageSquare className="h-3 w-3" />
                  Comentarios activos
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número de fichar</Label>
                <Input
                  placeholder="Número de fichar"
                  value={newWorkerNumber}
                  onChange={(e) => setNewWorkerNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Nombre completo</Label>
                <Input
                  placeholder="Nombre del trabajador"
                  value={newWorkerName}
                  onChange={(e) => setNewWorkerName(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Siglas</Label>
                <Input
                  placeholder="Ej: PAM"
                  value={newWorkerCode}
                  onChange={(e) => setNewWorkerCode(e.target.value.toUpperCase())}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email (para notificaciones)</Label>
                <Input
                  type="email"
                  placeholder="trabajador@email.com"
                  value={newWorkerEmail}
                  onChange={(e) => setNewWorkerEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Departamento</Label>
                <Select value={newWorkerDepartmentId} onValueChange={(val) => {
                  setNewWorkerDepartmentId(val);
                  // Reset team if department changes
                  if (val !== editingWorker?.department_id) {
                    setNewWorkerTeamId("");
                  }
                }}>
                  <SelectTrigger>
                    {/* Force rendering of the selected department label */}
                    <SelectValue placeholder="Seleccionar departamento">
                      {departments.find(d => d.id === newWorkerDepartmentId)?.name || "Seleccionar departamento"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Equipo de trabajo</Label>
              <Select
                value={newWorkerTeamId || "none"}
                onValueChange={(val) => setNewWorkerTeamId(val === "none" ? "" : val)}
              >
                <SelectTrigger>
                  {/* Force rendering of the selected team label */}
                  <SelectValue placeholder="Sin asignar">
                    {(() => {
                      if (!newWorkerTeamId) return "Sin asignar";
                      const team = allWorkerTeams.find(t => t.id === newWorkerTeamId);
                      return team?.name || "Sin asignar";
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {allWorkerTeams
                    .filter(team => team.department_id === newWorkerDepartmentId)
                    .map(team => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {newWorkerDepartmentId !== editingWorker?.department_id && (
                <p className="text-xs text-muted-foreground">
                  Los equipos disponibles corresponden al nuevo departamento seleccionado
                </p>
              )}
            </div>
            
            {/* Vacation Work Group Selector */}
            {(() => {
              // Check if the department is Cámara (uses direct assignment)
              const currentDept = departments.find(d => d.id === newWorkerDepartmentId);
              const isCamara = currentDept?.name?.toLowerCase() === 'cámara';
              
              // Check if the selected team has a group mapping
              const teamGroupMapping = newWorkerTeamId 
                ? workGroupTeams.find(wgt => wgt.worker_team_id === newWorkerTeamId)
                : null;
              const inheritedGroup = teamGroupMapping 
                ? workGroups.find(g => g.id === teamGroupMapping.work_group_id)
                : null;
              
              // Should disable direct assignment if team has mapping AND not Cámara
              const shouldInheritFromTeam = !isCamara && teamGroupMapping && inheritedGroup;
              
              return (
                <div className={`p-3 rounded-lg border ${shouldInheritFromTeam ? 'bg-green-500/10 border-green-500/30' : 'bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20'}`}>
                  <div className="space-y-2">
                    <Label className="text-base flex items-center gap-2">
                      <Palette className="h-4 w-4 text-primary" />
                      Equipo vacacional
                    </Label>
                    
                    {shouldInheritFromTeam ? (
                      // Show inherited group info (no manual selection allowed)
                      <>
                        <p className="text-xs text-green-600 flex items-center gap-1.5">
                          <Check className="h-3.5 w-3.5" />
                          Este trabajador hereda el grupo vacacional de su equipo
                        </p>
                        <div className="flex items-center gap-3 p-2 bg-background/60 rounded-lg border border-border/50">
                          <div 
                            className="w-5 h-5 rounded-full border-2 border-white shadow-sm" 
                            style={{ backgroundColor: inheritedGroup.color }}
                          />
                          <div>
                            <p className="font-medium text-sm">{inheritedGroup.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Heredado del equipo {workerTeams.find(t => t.id === newWorkerTeamId)?.name}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Para cambiar el grupo, modifica el mapeo del equipo en la pestaña "Mapeo"
                        </p>
                      </>
                    ) : (
                      // Allow direct selection (Cámara or no team mapping)
                      <>
                        <p className="text-xs text-muted-foreground">
                          {isCamara 
                            ? "En Cámara, el grupo se asigna individualmente por trabajador" 
                            : "Color de vacaciones asignado según el calendario anual del departamento"}
                        </p>
                        <Select
                          value={newWorkerWorkGroupId || "none"}
                          onValueChange={(val) => setNewWorkerWorkGroupId(val === "none" ? "" : val)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sin asignar">
                              {(() => {
                                if (!newWorkerWorkGroupId) return "Sin asignar";
                                const group = workGroups.find(g => g.id === newWorkerWorkGroupId);
                                if (!group) return "Sin asignar";
                                return (
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="w-4 h-4 rounded-full border border-border/50" 
                                      style={{ backgroundColor: group.color }}
                                    />
                                    <span>{group.name}</span>
                                  </div>
                                );
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin asignar</SelectItem>
                            {workGroups
                              .filter(group => group.department_id === newWorkerDepartmentId)
                              .map(group => (
                                <SelectItem key={group.id} value={group.id}>
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="w-4 h-4 rounded-full border border-border/50" 
                                      style={{ backgroundColor: group.color }}
                                    />
                                    <span>{group.name}</span>
                                  </div>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        {workGroups.filter(g => g.department_id === newWorkerDepartmentId).length === 0 && (
                          <p className="text-xs text-amber-600">
                            No hay grupos vacacionales configurados en este departamento
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
            
            {/* Vacation Days Adjustment */}
            <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
              <div className="space-y-2">
                <Label className="text-base flex items-center gap-2">
                  <Umbrella className="h-4 w-4" />
                  Ajuste manual de días de vacaciones
                </Label>
                <p className="text-xs text-muted-foreground">
                  Valores negativos descuentan días (ej: -3 = 3 días menos disponibles). 
                  Valores positivos añaden días extra.
                </p>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="0"
                  value={newWorkerVacationAdjustment}
                  onChange={(e) => setNewWorkerVacationAdjustment(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/50">
              <div className="space-y-0.5">
                <Label className="text-base">De baja</Label>
                <p className="text-xs text-muted-foreground">
                  Marca si el trabajador está de baja laboral
                </p>
              </div>
              <Switch
                checked={newWorkerOnLeave}
                onCheckedChange={setNewWorkerOnLeave}
              />
            </div>
            
            <div className="flex items-center justify-between p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
              <div className="space-y-0.5">
                <Label className="text-base flex items-center gap-2">
                  <Umbrella className="h-4 w-4 text-cyan-500" />
                  De vacaciones
                </Label>
                <p className="text-xs text-muted-foreground">
                  Marca si el trabajador está actualmente de vacaciones
                </p>
              </div>
              <Switch
                checked={newWorkerOnVacation}
                onCheckedChange={setNewWorkerOnVacation}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
              <div className="space-y-0.5">
                <Label className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-500" />
                  Es Responsable
                </Label>
                <p className="text-xs text-muted-foreground">
                  Puede ser asignado como responsable de equipo
                </p>
              </div>
              <Switch
                checked={newWorkerIsResponsable}
                onCheckedChange={setNewWorkerIsResponsable}
              />
            </div>
            
            {/* Reset Credentials Button */}
            <div className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg border border-destructive/20">
              <div className="space-y-0.5">
                <Label className="text-base flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Credenciales de acceso
                </Label>
                <p className="text-xs text-muted-foreground">
                  Resetear email y contraseña del trabajador
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetWorkerCredentials}
                disabled={resettingCredentials}
                className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                {resettingCredentials ? "Reseteando..." : "Resetear"}
              </Button>
            </div>
            
            {/* Personal Calendar Modification Button */}
            <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
              <div className="space-y-0.5">
                <Label className="text-base flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Modificar calendario personal
                </Label>
                <p className="text-xs text-muted-foreground">
                  Cambiar grupo, añadir o quitar días de vacaciones
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowEditWorkerDialog(false);
                  navigate(`/admin/worker-calendar/${editingWorker?.id}`);
                }}
                className="gap-1 border-primary/30 hover:bg-primary/10"
              >
                <Pencil className="h-3 w-3" />
                Modificar
              </Button>
            </div>
            
            {/* View as Worker Section */}
            <div className="p-3 bg-violet-500/10 rounded-lg border border-violet-500/30">
              <div className="space-y-2">
                <Label className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-violet-500" />
                  Ver como este trabajador
                </Label>
                <p className="text-xs text-muted-foreground">
                  Acceder a las herramientas personales del trabajador
                </p>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      window.open(`/mi-calendario?viewAs=${editingWorker?.worker_number}`, '_blank');
                    }}
                    className="gap-1.5 border-violet-500/30 hover:bg-violet-500/10 text-violet-600 hover:text-violet-700"
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    Ver Calendario
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      window.open(`/mi-horario?viewAs=${editingWorker?.worker_number}`, '_blank');
                    }}
                    className="gap-1.5 border-violet-500/30 hover:bg-violet-500/10 text-violet-600 hover:text-violet-700"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Ver Horario
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Comments Section */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Comentarios
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowResolvedComments(!showResolvedComments)}
                  className="gap-1 text-xs"
                >
                  <History className="h-3 w-3" />
                  {showResolvedComments ? "Ocultar resueltos" : "Ver historial"}
                </Button>
              </div>
              
              {/* Add comment */}
              <div className="flex gap-2 mb-4">
                <Textarea
                  placeholder="Escribe un comentario..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="min-h-[60px] resize-none"
                />
                <Button 
                  onClick={handleAddComment} 
                  disabled={saving || !newComment.trim()}
                  size="icon"
                  className="shrink-0 h-[60px] w-10"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Comments list */}
              {loadingComments ? (
                <div className="flex flex-col items-center justify-center py-4 text-muted-foreground text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>Cargando comentarios...</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={() => editingWorker?.id && fetchWorkerComments(editingWorker.id, { useCache: false })}
                  >
                    Reintentar
                  </Button>
                </div>
              ) : (
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-2">
                    {workerComments
                      .filter(c => showResolvedComments || !c.is_resolved)
                      .map(comment => (
                        <div 
                          key={comment.id}
                          className={`p-3 rounded-lg border text-sm ${
                            comment.is_resolved 
                              ? 'bg-muted/30 border-border/30 opacity-60' 
                              : 'bg-yellow-500/10 border-yellow-500/30'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className={`flex-1 ${comment.is_resolved ? 'line-through' : ''}`}>
                              {comment.comment}
                            </p>
                            <div className="flex items-center gap-1 shrink-0">
                              {!comment.is_resolved && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleResolveComment(comment.id)}
                                  className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                                  title="Marcar como resuelto"
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteComment(comment.id)}
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                title="Eliminar"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{format(new Date(comment.created_at), "d MMM yyyy, HH:mm", { locale: es })}</span>
                            {comment.is_resolved && comment.resolved_at && (
                              <span className="text-green-600">
                                • Resuelto el {format(new Date(comment.resolved_at), "d MMM yyyy", { locale: es })}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    {workerComments.filter(c => showResolvedComments || !c.is_resolved).length === 0 && (
                      <p className="text-center text-muted-foreground text-sm py-4">
                        {showResolvedComments ? "No hay comentarios" : "No hay comentarios activos"}
                      </p>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
            
            {/* Delete Worker Button */}
            <div className="flex items-center justify-between p-3 bg-destructive/10 rounded-lg border border-destructive/30">
              <div className="space-y-0.5">
                <Label className="text-base flex items-center gap-2 text-destructive">
                  <Trash2 className="h-4 w-4" />
                  Eliminar trabajador
                </Label>
                <p className="text-xs text-muted-foreground">
                  Eliminar permanentemente este trabajador del sistema
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (editingWorker) {
                    setShowEditWorkerDialog(false);
                    handleDeleteWorker(editingWorker.id);
                  }
                }}
                className="gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditWorkerDialog(false)}>Cancelar</Button>
            <Button onClick={handleUpdateWorker} disabled={saving || !newWorkerName.trim() || !newWorkerNumber.trim()}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comment Preview Dialog */}
      <Dialog open={showCommentPreviewDialog} onOpenChange={setShowCommentPreviewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-yellow-500" />
              Comentario
            </DialogTitle>
            <DialogDescription>
              {commentPreviewWorkerName ? `Trabajador: ${commentPreviewWorkerName}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm whitespace-pre-wrap break-words">{commentPreviewText}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCommentPreviewDialog(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Team Dialog */}
      <Dialog open={showBulkAssignDialog} onOpenChange={setShowBulkAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-orange-500" />
              Asignar equipo a {selectedWorkerIds.size} trabajadores
            </DialogTitle>
            <DialogDescription>
              Selecciona el equipo que quieres asignar a los trabajadores seleccionados
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Equipo de trabajo</Label>
              <Select value={bulkAssignTeamId} onValueChange={setBulkAssignTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar equipo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin equipo</SelectItem>
                  {allWorkerTeams.map(team => {
                    const dept = departments.find(d => d.id === team.department_id);
                    return (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name} {dept ? `(${dept.name})` : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Se actualizarán {selectedWorkerIds.size} trabajadores con el equipo seleccionado.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkAssignDialog(false)}>Cancelar</Button>
            <Button onClick={handleBulkAssignTeam} disabled={saving}>
              {saving ? "Asignando..." : "Asignar equipo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden PDF Content - Mirrors PublicGroups design */}
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
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '24px',
            paddingBottom: '16px',
            borderBottom: '1px solid #93d600'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <img 
                src="/images/verdnatura-logo-green.png" 
                alt="Verdnatura" 
                style={{ height: '40px' }}
              />
              <div style={{ height: '32px', width: '1px', background: pdfLightMode ? '#ddd' : '#333' }} />
              <div>
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Grupos de Trabajo</h1>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: pdfLightMode ? '#666' : '#888' }}>
                  {selectedDepartmentId !== "all" 
                    ? departments.find(d => d.id === selectedDepartmentId)?.name 
                    : "Todos los departamentos"}
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '8px', 
            background: pdfLightMode ? 'rgba(147, 214, 0, 0.15)' : 'rgba(147, 214, 0, 0.1)', 
            color: '#93d600',
            padding: '6px 14px',
            borderRadius: '9999px',
            marginBottom: '28px',
            fontSize: '12px',
            fontWeight: 500
          }}>
            <span>{isCamaraDepartment() && teamsSortMode === "color" 
              ? workers.filter(w => w.work_group_id).length 
              : workers.length} trabajadores</span>
          </div>

          {/* Work Groups */}
          {(() => {
            // Check if CAMARA department and color sort mode
            if (isCamaraDepartment() && teamsSortMode === "color") {
              const { grouped, noGroup } = getWorkersGroupedByVacationColor();
              const sortedGroups = Object.values(grouped).sort((a, b) => 
                a.group.name.localeCompare(b.group.name, undefined, { numeric: true })
              );
              
              return (
                <div>
                  {sortedGroups.map(({ group, workers: groupWorkers }) => {
                    const sortedWorkers = groupWorkers.sort((a, b) => {
                      const teamA = workerTeams.find(t => t.id === a.worker_team_id)?.name || "zzz";
                      const teamB = workerTeams.find(t => t.id === b.worker_team_id)?.name || "zzz";
                      if (teamA !== teamB) return teamA.localeCompare(teamB, undefined, { numeric: true });
                      return a.worker_number.localeCompare(b.worker_number, undefined, { numeric: true });
                    });
                    
                    return (
                      <div key={group.id} style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                          <span 
                            style={{ 
                              width: '16px', 
                              height: '16px', 
                              borderRadius: '50%',
                              backgroundColor: group.color
                            }}
                          />
                          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: group.color }}>{group.name}</h2>
                          <span style={{ 
                            fontSize: '11px', 
                            color: pdfLightMode ? '#666' : '#888', 
                            background: pdfLightMode ? '#f0f0f0' : '#222',
                            padding: '4px 10px',
                            borderRadius: '9999px'
                          }}>
                            {sortedWorkers.length} trabajadores
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {sortedWorkers.map(worker => {
                            const team = workerTeams.find(t => t.id === worker.worker_team_id);
                            return (
                              <span 
                                key={worker.id}
                                style={{
                                  fontSize: '10px',
                                  background: `${group.color}25`,
                                  color: group.color,
                                  border: `1px solid ${group.color}40`,
                                  padding: '6px 10px',
                                  borderRadius: '6px'
                                }}
                              >
                                {worker.name}{team ? ` (${team.name})` : ''}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Sin asignar section excluded from PDF */}
                </div>
              );
            }
            
            // Default: Group by team prefix
            const groupedTeams = getGroupedTeamsForPdf();
            const sortedPrefixes = Object.keys(groupedTeams).sort();
            
            // Calculate if we should use horizontal layout (groups as columns)
            const totalTeams = Object.values(groupedTeams).reduce((acc, teams) => acc + teams.length, 0);
            const avgTeamsPerGroup = totalTeams / Math.max(sortedPrefixes.length, 1);
            const useHorizontalLayout = avgTeamsPerGroup <= 2 && sortedPrefixes.length >= 3;
            
            if (useHorizontalLayout) {
              // Horizontal layout: all groups in a grid as columns
              return (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: `repeat(${Math.min(sortedPrefixes.length, 4)}, 1fr)`, 
                  gap: '20px' 
                }}>
                  {sortedPrefixes.map((prefix) => {
                    const teamsInGroup = groupedTeams[prefix].sort((a, b) => 
                      a.name.localeCompare(b.name, undefined, { numeric: true })
                    );
                    const groupTotalWorkers = teamsInGroup.reduce((acc, team) => 
                      acc + workers.filter(w => w.worker_team_id === team.id).length, 0
                    );

                    return (
                      <div key={prefix}>
                        {/* Group header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{prefix}</h2>
                          <span style={{ 
                            fontSize: '10px', 
                            color: pdfLightMode ? '#666' : '#888', 
                            background: pdfLightMode ? '#f0f0f0' : '#222',
                            padding: '3px 8px',
                            borderRadius: '9999px'
                          }}>
                            {groupTotalWorkers} trabajadores
                          </span>
                        </div>

                        {/* Teams stacked vertically */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {teamsInGroup.map(team => {
                            const teamWorkers = workers.filter(w => w.worker_team_id === team.id)
                              .sort((a, b) => a.name.localeCompare(b.name));
                            const workGroup = getWorkGroupForTeam(team.id);
                            
                            return (
                              <div 
                                key={team.id}
                                style={{
                                  background: pdfLightMode ? '#f8f8f8' : '#1a1a1a',
                                  border: `1px solid ${pdfLightMode ? '#e0e0e0' : '#333'}`,
                                  borderRadius: '10px',
                                  padding: '12px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                  <span style={{ fontWeight: 600, fontSize: '12px' }}>{team.name}</span>
                                  {workGroup && (
                                    <span 
                                      style={{ 
                                        width: '10px', 
                                        height: '10px', 
                                        borderRadius: '50%',
                                        backgroundColor: workGroup.color
                                      }}
                                    />
                                  )}
                                </div>
                                <p style={{ fontSize: '9px', color: pdfLightMode ? '#666' : '#888', marginBottom: '10px' }}>
                                  {teamWorkers.length} trabajador{teamWorkers.length !== 1 ? 'es' : ''}
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {teamWorkers.map(worker => (
                                    <span 
                                      key={worker.id}
                                      style={{
                                        fontSize: '9px',
                                        background: pdfLightMode ? '#e8e8e8' : '#2a2a2a',
                                        color: pdfLightMode ? '#333' : '#ddd',
                                        padding: '4px 8px',
                                        borderRadius: '5px'
                                      }}
                                    >
                                      {worker.name}
                                    </span>
                                  ))}
                                  {teamWorkers.length === 0 && (
                                    <span style={{ fontSize: '9px', color: pdfLightMode ? '#999' : '#666', fontStyle: 'italic' }}>
                                      Sin asignar
                                    </span>
                                  )}
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
            
            // Original vertical layout
            return sortedPrefixes.map((prefix) => {
              const teamsInGroup = groupedTeams[prefix].sort((a, b) => 
                a.name.localeCompare(b.name, undefined, { numeric: true })
              );
              const groupTotalWorkers = teamsInGroup.reduce((acc, team) => 
                acc + workers.filter(w => w.worker_team_id === team.id).length, 0
              );

              return (
                <div key={prefix} style={{ marginBottom: '24px' }}>
                  {/* Group header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{prefix}</h2>
                    <span style={{ 
                      fontSize: '11px', 
                      color: pdfLightMode ? '#666' : '#888', 
                      background: pdfLightMode ? '#f0f0f0' : '#222',
                      padding: '4px 10px',
                      borderRadius: '9999px'
                    }}>
                      {groupTotalWorkers} trabajadores
                    </span>
                  </div>

                  {/* Teams grid */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(4, 1fr)', 
                    gap: '14px' 
                  }}>
                    {teamsInGroup.map(team => {
                      const teamWorkers = workers.filter(w => w.worker_team_id === team.id)
                        .sort((a, b) => a.name.localeCompare(b.name));
                      const workGroup = getWorkGroupForTeam(team.id);
                      
                      return (
                        <div 
                          key={team.id}
                          style={{
                            background: pdfLightMode ? '#f8f8f8' : '#1a1a1a',
                            border: `1px solid ${pdfLightMode ? '#e0e0e0' : '#333'}`,
                            borderRadius: '12px',
                            padding: '16px 14px 18px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 600, fontSize: '14px' }}>{team.name}</span>
                            {workGroup && (
                              <span 
                                style={{ 
                                  width: '12px', 
                                  height: '12px', 
                                  borderRadius: '50%',
                                  backgroundColor: workGroup.color
                                }}
                              />
                            )}
                          </div>
                          <p style={{ fontSize: '10px', color: pdfLightMode ? '#666' : '#888', marginBottom: '12px' }}>
                            {teamWorkers.length} trabajador{teamWorkers.length !== 1 ? 'es' : ''}
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {teamWorkers.map(worker => (
                              <span 
                                key={worker.id}
                                style={{
                                  fontSize: '10px',
                                  background: pdfLightMode ? '#e8e8e8' : '#2a2a2a',
                                  color: pdfLightMode ? '#333' : '#ddd',
                                  padding: '6px 10px',
                                  borderRadius: '6px'
                                }}
                              >
                                {worker.name}
                              </span>
                            ))}
                            {teamWorkers.length === 0 && (
                              <span style={{ fontSize: '10px', color: pdfLightMode ? '#999' : '#666', fontStyle: 'italic' }}>
                                Sin asignar
                              </span>
                            )}
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
            marginTop: '28px', 
            paddingTop: '14px', 
            borderTop: `1px solid ${pdfLightMode ? '#ddd' : '#333'}`,
            textAlign: 'center',
            color: pdfLightMode ? '#999' : '#666',
            fontSize: '11px'
          }}>
            Generado el {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} | Verdnatura
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkerGroupsAdmin;