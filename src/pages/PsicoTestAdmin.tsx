import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import LoadingScreen from "@/components/LoadingScreen";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  ArrowLeft,
  Users,
  Clock,
  Target,
  TrendingUp,
  Plus,
  Search,
  Download,
  Eye,
  Trash2,
  Copy,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart3,
  RefreshCw,
  Loader2,
  ExternalLink,
  Link2,
  Phone,
  Package,
  Code,
  ClipboardList,
  ToggleLeft,
  ToggleRight,
  Trophy,
  Zap,
  Activity,
  Calendar,
  Award,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LogoLink } from "@/components/LogoLink";
import {
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";

// Types
interface CandidateSession {
  id: string;
  candidate_name: string;
  candidate_email: string | null;
  candidate_phone: string | null;
  position_applied: string;
  access_code: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  total_time_seconds: number | null;
  created_at: string;
  area_id: string | null;
  area_name: string | null;
  result?: {
    accuracy_percentage: number;
    cognitive_profile: string;
    recommendation: string;
    speed_index: number;
    consistency_index: number;
    category_scores: Record<string, number>;
  };
}

interface AreaStats {
  id: string;
  name: string;
  is_active: boolean;
  totalCandidates: number;
  completedTests: number;
  inProgress: number;
  averageScore: number;
  avgConsistency: number;
}

interface DashboardStats {
  totalCandidates: number;
  completedTests: number;
  averageScore: number;
  averageTime: number;
  profileDistribution: { name: string; value: number; color: string }[];
  recommendationDistribution: { name: string; value: number; color: string }[];
  temporalData: { date: string; tests: number; avgScore: number }[];
  categoryPerformance: { category: string; avgScore: number; color: string }[];
  completionRate: number;
  avgTimePerQuestion: number;
  hardestQuestions: { text: string; successRate: number }[];
  // New enhanced stats
  testsToday: number;
  abandonRate: number;
  avgConsistencyIndex: number;
  candidatesInProgress: number;
  bestArea: { name: string; score: number } | null;
  areaStats: AreaStats[];
  topCandidates: { name: string; score: number; area: string; recommendation: string }[];
  candidatesByArea: { name: string; value: number; color: string }[];
}

const profileLabels: Record<string, string> = {
  rapido_preciso: "Rápido y Preciso",
  rapido_impulsivo: "Rápido e Impulsivo",
  lento_preciso: "Lento pero Preciso",
  desorganizado: "Desorganizado",
  equilibrado: "Equilibrado",
};

const profileColors: Record<string, string> = {
  rapido_preciso: "#22c55e",
  rapido_impulsivo: "#f59e0b",
  lento_preciso: "#3b82f6",
  desorganizado: "#ef4444",
  equilibrado: "#8b5cf6",
};

const recommendationLabels: Record<string, { text: string; color: string; icon: typeof CheckCircle2 }> = {
  muy_recomendable: { text: "Muy Recomendable", color: "text-green-500", icon: CheckCircle2 },
  recomendable_reservas: { text: "Con Reservas", color: "text-amber-500", icon: AlertCircle },
  no_recomendable: { text: "No Recomendable", color: "text-red-500", icon: XCircle },
};

const categoryLabels: Record<string, string> = {
  logica_numerica: "Lógica Numérica",
  razonamiento_visual: "Razonamiento Visual",
  atencion_percepcion: "Atención",
  logica_verbal: "Lógica Verbal",
  velocidad: "Velocidad",
  memoria_visual: "Memoria",
  consistencia: "Consistencia",
};

const POSITIONS = [
  "Comercial",
  "Técnico",
  "Gestión",
  "Producción",
  "Logística",
  "Administración",
  "Otro"
];

export default function PsicoTestAdmin() {
  const navigate = useNavigate();
  const { manager } = useManagerAuth();

  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<CandidateSession[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [areas, setAreas] = useState<{ id: string; name: string; description: string; icon: string; is_active: boolean; display_order: number }[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPosition, setFilterPosition] = useState<string>("all");
  const [filterRecommendation, setFilterRecommendation] = useState<string>("all");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateSession | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCandidate, setNewCandidate] = useState({
    name: "",
    email: "",
    phone: "",
    position: "",
  });


  // Auth check
  useEffect(() => {
    if (manager === null) {
      navigate("/login");
    }
  }, [manager, navigate]);

  // Load data
  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("psico-test-operations", {
        body: { action: "getAdminData" }
      });

      if (error) {
        throw error;
      }

      setCandidates(data.candidates || []);
      setStats(data.stats || null);
    } catch (err) {
      console.error("Error loading data:", err);
      toast.error("Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  // Load areas
  const loadAreas = async () => {
    setAreasLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("psico-test-operations", {
        body: { action: "getAllAreas" }
      });

      if (error) throw error;
      setAreas(data.areas || []);
    } catch (err) {
      console.error("Error loading areas:", err);
    } finally {
      setAreasLoading(false);
    }
  };

  // Toggle area active status
  const toggleAreaStatus = async (areaId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase.functions.invoke("psico-test-operations", {
        body: { action: "updateArea", areaId, is_active: !currentStatus }
      });

      if (error) throw error;
      toast.success(!currentStatus ? "Área activada" : "Área desactivada");
      loadAreas();
    } catch (err) {
      console.error("Error toggling area:", err);
      toast.error("Error al actualizar el área");
    }
  };

  useEffect(() => {
    if (manager?.role === "admin") {
      loadData();
      loadAreas();
    }
  }, [manager]);

  // Filtered and sorted candidates
  const filteredCandidates = useMemo(() => {
    let result = [...candidates];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.candidate_name.toLowerCase().includes(query) ||
          c.candidate_email?.toLowerCase().includes(query) ||
          c.position_applied.toLowerCase().includes(query) ||
          c.access_code.toLowerCase().includes(query) ||
          c.area_name?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (filterStatus !== "all") {
      result = result.filter((c) => c.status === filterStatus);
    }

    // Position filter
    if (filterPosition !== "all") {
      result = result.filter((c) => c.position_applied === filterPosition);
    }

    // Area filter
    if (filterArea !== "all") {
      result = result.filter((c) => c.area_id === filterArea);
    }

    // Recommendation filter
    if (filterRecommendation !== "all") {
      result = result.filter((c) => c.result?.recommendation === filterRecommendation);
    }

    // Sort
    result.sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortField) {
        case "accuracy":
          aVal = a.result?.accuracy_percentage || 0;
          bVal = b.result?.accuracy_percentage || 0;
          break;
        case "time":
          aVal = a.total_time_seconds || 0;
          bVal = b.total_time_seconds || 0;
          break;
        case "name":
          aVal = a.candidate_name;
          bVal = b.candidate_name;
          break;
        default:
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

    return result;
  }, [candidates, searchQuery, filterStatus, filterPosition, filterArea, filterRecommendation, sortField, sortOrder]);

  // Filtered stats based on area
  const filteredStats = useMemo(() => {
    if (!stats) return null;
    if (filterArea === "all") return stats;

    // Filter candidates for this area
    const areaCandidates = candidates.filter(c => c.area_id === filterArea);
    const completed = areaCandidates.filter(c => c.status === "completed" && c.result);
    
    const totalScore = completed.reduce((sum, c) => sum + (c.result?.accuracy_percentage || 0), 0);
    const totalTime = completed.reduce((sum, c) => sum + (c.total_time_seconds || 0), 0);
    
    return {
      ...stats,
      totalCandidates: areaCandidates.length,
      completedTests: completed.length,
      averageScore: completed.length > 0 ? totalScore / completed.length : 0,
      averageTime: completed.length > 0 ? totalTime / completed.length : 0,
      candidatesInProgress: areaCandidates.filter(c => c.status === "in_progress").length,
    };
  }, [stats, candidates, filterArea]);

  // Create new candidate session
  const handleCreateSession = async () => {
    if (!newCandidate.name || !newCandidate.position) {
      toast.error("Nombre y puesto son obligatorios");
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("psico-test-operations", {
        body: {
          action: "createSession",
          candidateName: newCandidate.name,
          candidateEmail: newCandidate.email || null,
          candidatePhone: newCandidate.phone || null,
          position: newCandidate.position,
        }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Error al crear sesión");
      }

      toast.success(`Código de acceso: ${data.accessCode}`, {
        description: "Copiado al portapapeles",
        duration: 10000,
      });

      // Copy to clipboard
      navigator.clipboard.writeText(data.accessCode);

      setShowCreateDialog(false);
      setNewCandidate({ name: "", email: "", phone: "", position: "" });
      loadData();
    } catch (err: any) {
      console.error("Error creating session:", err);
      toast.error(err.message || "Error al crear sesión");
    } finally {
      setCreating(false);
    }
  };

  // Copy access code
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado al portapapeles");
  };

  // Delete session
  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm("¿Estás seguro de eliminar esta sesión?")) return;

    try {
      const { error } = await supabase.functions.invoke("psico-test-operations", {
        body: { action: "deleteSession", sessionId }
      });

      if (error) throw error;

      toast.success("Sesión eliminada");
      loadData();
    } catch (err) {
      console.error("Error deleting session:", err);
      toast.error("Error al eliminar sesión");
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      "Nombre",
      "Email",
      "Teléfono",
      "Puesto",
      "Estado",
      "Fecha",
      "Puntuación",
      "Perfil",
      "Recomendación",
      "Tiempo (s)",
    ];

    const rows = filteredCandidates.map((c) => [
      c.candidate_name,
      c.candidate_email || "",
      c.candidate_phone || "",
      c.position_applied,
      c.status,
      new Date(c.created_at).toLocaleDateString("es-ES"),
      c.result?.accuracy_percentage || "",
      profileLabels[c.result?.cognitive_profile || ""] || "",
      recommendationLabels[c.result?.recommendation || ""]?.text || "",
      c.total_time_seconds || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `psico-test-export-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const formatTime = (seconds: number | null) => {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (!manager || manager.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-header">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/admin")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-3">
                <LogoLink to="/admin/psico-test" className="h-10 w-auto" />
                <div>
                  <h1 className="font-semibold text-foreground">Test Psicotécnico</h1>
                  <p className="text-xs text-muted-foreground">Panel de Administración</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open("/psico-test", "_blank")}
                className="hidden sm:flex gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Login Candidatos
              </Button>
              <Button variant="ghost" size="icon" onClick={loadData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-5">
            <TabsTrigger value="dashboard" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="candidates" className="gap-2">
              <Users className="h-4 w-4" />
              Candidatos
            </TabsTrigger>
            <TabsTrigger value="areas" className="gap-2">
              <Package className="h-4 w-4" />
              Áreas
            </TabsTrigger>
            <TabsTrigger value="analysis" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Análisis
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Brain className="h-4 w-4" />
              Test
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Area Filter */}
            {areas.length > 0 && (
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Filtrar por área:</span>
                </div>
                <Select value={filterArea} onValueChange={setFilterArea}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Todas las áreas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las áreas</SelectItem>
                    {areas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filterArea !== "all" && (
                  <Badge variant="secondary" className="gap-1">
                    {areas.find(a => a.id === filterArea)?.name}
                    <button onClick={() => setFilterArea("all")} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
              </div>
            )}

            {/* Stats cards - Row 1: 5 Main KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <Card className="p-4 hover:bg-accent/5 transition-all duration-200 hover:shadow-md group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold group-hover:text-primary transition-colors">{filteredStats?.totalCandidates || 0}</p>
                    <p className="text-xs text-muted-foreground">Total Candidatos</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 hover:bg-accent/5 transition-all duration-200 hover:shadow-md group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold group-hover:text-primary transition-colors">{filteredStats?.completedTests || 0}</p>
                    <p className="text-xs text-muted-foreground">Completados</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 hover:bg-accent/5 transition-all duration-200 hover:shadow-md group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Target className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold group-hover:text-primary transition-colors">{filteredStats?.averageScore?.toFixed(1) || 0}%</p>
                    <p className="text-xs text-muted-foreground">Puntuación Media</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 hover:bg-accent/5 transition-all duration-200 hover:shadow-md group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold group-hover:text-primary transition-colors">{formatTime(filteredStats?.averageTime || 0)}</p>
                    <p className="text-xs text-muted-foreground">Tiempo Medio</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 hover:bg-accent/5 transition-all duration-200 hover:shadow-md group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-cyan-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold group-hover:text-primary transition-colors">{filteredStats?.completionRate?.toFixed(0) || 0}%</p>
                    <p className="text-xs text-muted-foreground">Tasa Completación</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Stats cards - Row 2: 5 Secondary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <Card className="p-4 hover:bg-accent/5 transition-all duration-200 hover:shadow-md group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold group-hover:text-primary transition-colors">{stats?.testsToday || 0}</p>
                    <p className="text-xs text-muted-foreground">Tests Hoy</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 hover:bg-accent/5 transition-all duration-200 hover:shadow-md group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold group-hover:text-primary transition-colors">{filteredStats?.candidatesInProgress || 0}</p>
                    <p className="text-xs text-muted-foreground">En Progreso</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 hover:bg-accent/5 transition-all duration-200 hover:shadow-md group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <XCircle className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold group-hover:text-primary transition-colors">{stats?.abandonRate?.toFixed(0) || 0}%</p>
                    <p className="text-xs text-muted-foreground">Tasa Abandono</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 hover:bg-accent/5 transition-all duration-200 hover:shadow-md group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                    <Award className="h-5 w-5 text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold group-hover:text-primary transition-colors">{stats?.avgConsistencyIndex?.toFixed(0) || 0}%</p>
                    <p className="text-xs text-muted-foreground">Consistencia</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 hover:bg-accent/5 transition-all duration-200 hover:shadow-md group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-rose-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold group-hover:text-primary transition-colors">{filteredStats?.avgTimePerQuestion?.toFixed(1) || 0}s</p>
                    <p className="text-xs text-muted-foreground">Seg/Pregunta</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Charts - Row 1: Two equal columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Profile distribution */}
              <Card className="p-6 hover:shadow-md transition-all duration-200">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold">Perfiles Cognitivos</h3>
                </div>
                {stats?.profileDistribution && stats.profileDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <RechartsPieChart>
                      <Pie
                        data={stats.profileDistribution}
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {stats.profileDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                    Sin datos suficientes
                  </div>
                )}
              </Card>

              {/* Recommendation distribution */}
              <Card className="p-6 hover:shadow-md transition-all duration-200">
                <div className="flex items-center gap-2 mb-4">
                  <ClipboardList className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold">Recomendaciones</h3>
                </div>
                {stats?.recommendationDistribution && stats.recommendationDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stats.recommendationDistribution}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {stats.recommendationDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                    Sin datos suficientes
                  </div>
                )}
              </Card>
            </div>

            {/* Charts - Row 2: Area Performance & Top Candidates */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Area Performance */}
              {stats?.areaStats && stats.areaStats.length > 0 && stats.areaStats.some(a => a.completedTests > 0) && (
                <Card className="p-6 hover:shadow-md transition-all duration-200">
                  <div className="flex items-center gap-2 mb-4">
                    <Trophy className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold">Rendimiento por Área</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart 
                      data={stats.areaStats.filter(a => a.completedTests > 0)} 
                      layout="vertical"
                      margin={{ left: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} className="opacity-30" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 10 }} />
                      <Tooltip 
                        formatter={(value: number) => [`${value.toFixed(1)}%`, 'Promedio']}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                      />
                      <Bar dataKey="averageScore" radius={[0, 4, 4, 0]}>
                        {stats.areaStats.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.averageScore >= 70 ? "#22c55e" : entry.averageScore >= 50 ? "#f59e0b" : "#ef4444"} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Top 5 Candidates */}
              {stats?.topCandidates && stats.topCandidates.length > 0 && (
                <Card className="p-6 hover:shadow-md transition-all duration-200">
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold">Top Candidatos</h3>
                  </div>
                  <div className="space-y-2">
                    {stats.topCandidates.map((c, idx) => (
                      <motion.div 
                        key={idx} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs",
                            idx === 0 ? "bg-yellow-500/20 text-yellow-600" :
                            idx === 1 ? "bg-gray-300/30 text-gray-600" :
                            idx === 2 ? "bg-amber-600/20 text-amber-700" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {idx + 1}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-foreground">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.area}</p>
                          </div>
                        </div>
                        <Badge variant={
                          c.recommendation === "muy_recomendable" ? "default" :
                          c.recommendation === "recomendable_reservas" ? "secondary" : "destructive"
                        } className={cn(
                          "text-xs",
                          c.recommendation === "muy_recomendable" && "bg-green-500"
                        )}>
                          {c.score.toFixed(1)}%
                        </Badge>
                      </motion.div>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Charts - Row 3: Category Performance & Hardest Questions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Category Performance Chart */}
              {stats?.categoryPerformance && stats.categoryPerformance.length > 0 && (
                <Card className="p-6 hover:shadow-md transition-all duration-200">
                  <div className="flex items-center gap-2 mb-4">
                    <Brain className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold">Categorías Cognitivas</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart 
                      data={stats.categoryPerformance} 
                      layout="vertical"
                      margin={{ left: 70 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} className="opacity-30" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="category" width={70} tick={{ fontSize: 10 }} />
                      <Tooltip 
                        formatter={(value: number) => [`${value.toFixed(1)}%`, 'Promedio']}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                      />
                      <Bar dataKey="avgScore" radius={[0, 4, 4, 0]}>
                        {stats.categoryPerformance.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Hardest Questions Card */}
              {stats?.hardestQuestions && stats.hardestQuestions.length > 0 && (
                <Card className="p-6 hover:shadow-md transition-all duration-200">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertCircle className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold">Preguntas Más Difíciles</h3>
                  </div>
                  <div className="space-y-2">
                    {stats.hardestQuestions.map((q, idx) => (
                      <motion.div 
                        key={idx} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm text-foreground truncate max-w-[65%]">{q.text}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-gradient-to-r from-red-500 to-amber-500"
                              style={{ width: `${q.successRate}%` }}
                            />
                          </div>
                          <span className={cn(
                            "text-xs font-medium w-8 text-right",
                            q.successRate < 30 ? "text-red-500" :
                            q.successRate < 50 ? "text-amber-500" : "text-green-500"
                          )}>
                            {q.successRate.toFixed(0)}%
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Temporal Evolution Chart - Full width */}
            <Card className="p-6 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold">Evolución Temporal</h3>
                  <span className="text-xs text-muted-foreground">(últimos 14 días)</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="text-muted-foreground">Tests</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <span className="text-muted-foreground">Puntuación</span>
                  </div>
                </div>
              </div>
              {stats?.temporalData && stats.temporalData.some(d => d.tests > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={stats.temporalData}>
                    <defs>
                      <linearGradient id="colorTests" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Area 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="tests" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorTests)" 
                      name="Tests"
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="avgScore" 
                      stroke="#22c55e" 
                      strokeWidth={2}
                      dot={{ fill: '#22c55e', strokeWidth: 2 }}
                      name="Puntuación %"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Sin datos de evolución temporal
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Candidates Tab */}
          <TabsContent value="candidates" className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, email o código..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="in_progress">En progreso</SelectItem>
                    <SelectItem value="completed">Completado</SelectItem>
                    <SelectItem value="expired">Expirado</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterPosition} onValueChange={setFilterPosition}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Puesto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {POSITIONS.map((pos) => (
                      <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {areas.length > 0 && (
                  <Select value={filterArea} onValueChange={setFilterArea}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Área" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas Áreas</SelectItem>
                      {areas.map((area) => (
                        <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" onClick={handleExportCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                  <DialogTrigger asChild>
                    <Button className="bg-gradient-to-r from-amber-500 to-orange-600">
                      <Plus className="h-4 w-4 mr-2" />
                      Nuevo
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nuevo Candidato</DialogTitle>
                      <DialogDescription>
                        Crea un código de acceso para un nuevo candidato
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Nombre completo *</Label>
                        <Input
                          id="name"
                          value={newCandidate.name}
                          onChange={(e) => setNewCandidate({ ...newCandidate, name: e.target.value })}
                          placeholder="Ej: Juan García López"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newCandidate.email}
                          onChange={(e) => setNewCandidate({ ...newCandidate, email: e.target.value })}
                          placeholder="Ej: juan@email.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Teléfono</Label>
                        <Input
                          id="phone"
                          value={newCandidate.phone}
                          onChange={(e) => setNewCandidate({ ...newCandidate, phone: e.target.value })}
                          placeholder="Ej: 612345678"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="position">Puesto *</Label>
                        <Select
                          value={newCandidate.position}
                          onValueChange={(val) => setNewCandidate({ ...newCandidate, position: val })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar puesto" />
                          </SelectTrigger>
                          <SelectContent>
                            {POSITIONS.map((pos) => (
                              <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleCreateSession}
                        disabled={creating || !newCandidate.name || !newCandidate.position}
                        className="bg-gradient-to-r from-amber-500 to-orange-600"
                      >
                        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Table */}
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidato</TableHead>
                    <TableHead>Puesto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Puntuación</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Recomendación</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCandidates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No hay candidatos que coincidan con los filtros
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCandidates.map((candidate) => {
                      const rec = recommendationLabels[candidate.result?.recommendation || ""];
                      const RecIcon = rec?.icon || AlertCircle;
                      
                      return (
                        <TableRow key={candidate.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{candidate.candidate_name}</p>
                              {candidate.candidate_email && (
                                <p className="text-xs text-muted-foreground">{candidate.candidate_email}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{candidate.position_applied}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                candidate.status === "completed"
                                  ? "default"
                                  : candidate.status === "in_progress"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {candidate.status === "completed"
                                ? "Completado"
                                : candidate.status === "in_progress"
                                ? "En progreso"
                                : candidate.status === "expired"
                                ? "Expirado"
                                : "Pendiente"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {candidate.result?.accuracy_percentage !== undefined ? (
                              <span className={cn(
                                "font-medium",
                                candidate.result.accuracy_percentage >= 75
                                  ? "text-green-500"
                                  : candidate.result.accuracy_percentage >= 50
                                  ? "text-amber-500"
                                  : "text-red-500"
                              )}>
                                {candidate.result.accuracy_percentage.toFixed(1)}%
                              </span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {candidate.result?.cognitive_profile ? (
                              <Badge
                                style={{ backgroundColor: profileColors[candidate.result.cognitive_profile] + "20", color: profileColors[candidate.result.cognitive_profile] }}
                              >
                                {profileLabels[candidate.result.cognitive_profile]}
                              </Badge>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {rec ? (
                              <div className={cn("flex items-center gap-1", rec.color)}>
                                <RecIcon className="h-4 w-4" />
                                <span className="text-sm">{rec.text}</span>
                              </div>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {candidate.status === "completed" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedCandidate(candidate)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCopyCode(candidate.access_code)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteSession(candidate.id)}
                                className="text-red-500 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Analysis Tab */}
          <TabsContent value="analysis" className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Análisis Detallado por Categoría</h3>
              </div>
              
              {stats?.categoryPerformance && stats.categoryPerformance.length > 0 ? (
                <div className="space-y-4">
                  {stats.categoryPerformance.map((cat, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-muted/30 border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-foreground">{cat.category}</span>
                        <span className={cn(
                          "text-lg font-bold",
                          cat.avgScore >= 75 ? "text-green-500" :
                          cat.avgScore >= 50 ? "text-amber-500" : "text-red-500"
                        )}>
                          {cat.avgScore.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${cat.avgScore}%` }}
                          transition={{ duration: 0.8, delay: idx * 0.1 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>
                          {cat.avgScore >= 80 ? "🟢 Excelente" :
                           cat.avgScore >= 60 ? "🟡 Bueno" :
                           cat.avgScore >= 40 ? "🟠 Regular" : "🔴 Mejorable"}
                        </span>
                        <span>Promedio global de candidatos</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No hay datos suficientes para el análisis
                </div>
              )}
            </Card>

            {/* Recommendations Summary */}
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Resumen de Recomendaciones de Contratación</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="font-medium text-green-700 dark:text-green-400">Muy Recomendable</span>
                  </div>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {candidates.filter(c => c.result?.recommendation === "muy_recomendable").length}
                  </p>
                  <p className="text-xs text-muted-foreground">candidatos</p>
                </div>
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    <span className="font-medium text-amber-700 dark:text-amber-400">Con Reservas</span>
                  </div>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {candidates.filter(c => c.result?.recommendation === "recomendable_reservas").length}
                  </p>
                  <p className="text-xs text-muted-foreground">candidatos</p>
                </div>
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span className="font-medium text-red-700 dark:text-red-400">No Recomendable</span>
                  </div>
                  <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                    {candidates.filter(c => c.result?.recommendation === "no_recomendable").length}
                  </p>
                  <p className="text-xs text-muted-foreground">candidatos</p>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Configuración del Test</h3>
              <p className="text-muted-foreground text-sm">
                El test actual contiene 30+ preguntas distribuidas en 7 categorías con un tiempo límite de 20 minutos.
                Incluye preguntas de: Lógica Numérica, Razonamiento Visual, Atención, Lógica Verbal, Velocidad, Memoria y Consistencia.
              </p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold text-primary">30+</p>
                  <p className="text-xs text-muted-foreground">Preguntas</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold text-primary">7</p>
                  <p className="text-xs text-muted-foreground">Categorías</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold text-primary">20</p>
                  <p className="text-xs text-muted-foreground">Minutos</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold text-primary">5</p>
                  <p className="text-xs text-muted-foreground">Perfiles</p>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Areas Tab */}
          <TabsContent value="areas" className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold">Áreas de Test</h3>
                  <p className="text-sm text-muted-foreground">
                    Configura qué áreas están disponibles para los candidatos
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={loadAreas} disabled={areasLoading}>
                  <RefreshCw className={cn("h-4 w-4 mr-2", areasLoading && "animate-spin")} />
                  Actualizar
                </Button>
              </div>

              {areasLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  {areas.map((area) => {
                    const iconMap: Record<string, React.ReactNode> = {
                      Phone: <Phone className="h-6 w-6" />,
                      Code: <Code className="h-6 w-6" />,
                      Package: <Package className="h-6 w-6" />,
                      ClipboardList: <ClipboardList className="h-6 w-6" />,
                    };
                    const gradientMap: Record<string, string> = {
                      Phone: "from-emerald-500 to-green-600",
                      Code: "from-blue-500 to-indigo-600",
                      Package: "from-orange-500 to-amber-600",
                      ClipboardList: "from-purple-500 to-violet-600",
                    };

                    return (
                      <div
                        key={area.id}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-xl border",
                          area.is_active ? "bg-card border-primary/30" : "bg-muted/30 border-muted"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center text-white",
                            "bg-gradient-to-br",
                            gradientMap[area.icon] || "from-gray-500 to-gray-600",
                            !area.is_active && "opacity-50"
                          )}>
                            {iconMap[area.icon] || <ClipboardList className="h-6 w-6" />}
                          </div>
                          <div>
                            <h4 className={cn("font-medium", !area.is_active && "text-muted-foreground")}>
                              {area.name}
                            </h4>
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {area.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={area.is_active ? "default" : "secondary"}>
                            {area.is_active ? "Activo" : "Inactivo"}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleAreaStatus(area.id, area.is_active)}
                          >
                            {area.is_active ? (
                              <ToggleRight className="h-5 w-5 text-primary" />
                            ) : (
                              <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                  {areas.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No hay áreas configuradas
                    </p>
                  )}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        {/* Candidate detail dialog */}
        <Dialog open={!!selectedCandidate} onOpenChange={() => setSelectedCandidate(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedCandidate?.candidate_name}</DialogTitle>
              <DialogDescription>
                {selectedCandidate?.position_applied} - {selectedCandidate?.created_at && formatDate(selectedCandidate.created_at)}
              </DialogDescription>
            </DialogHeader>
            {selectedCandidate?.result && (
              <div className="space-y-6 py-4">
                {/* Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-xl bg-muted/50">
                    <p className="text-2xl font-bold text-foreground">
                      {selectedCandidate.result.accuracy_percentage?.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground">Precisión</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-muted/50">
                    <p className="text-2xl font-bold text-foreground">
                      {formatTime(selectedCandidate.total_time_seconds)}
                    </p>
                    <p className="text-xs text-muted-foreground">Tiempo</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-muted/50">
                    <p className="text-2xl font-bold text-foreground">
                      {selectedCandidate.result.speed_index?.toFixed(0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Velocidad</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-muted/50">
                    <p className="text-2xl font-bold text-foreground">
                      {selectedCandidate.result.consistency_index?.toFixed(0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Consistencia</p>
                  </div>
                </div>

                {/* Radar chart */}
                {selectedCandidate.result.category_scores && (
                  <div>
                    <h4 className="font-medium mb-2">Puntuación por Categoría</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <RadarChart
                        data={Object.entries(selectedCandidate.result.category_scores).map(([key, value]) => ({
                          category: categoryLabels[key] || key,
                          score: value,
                        }))}
                      >
                        <PolarGrid />
                        <PolarAngleAxis dataKey="category" tick={{ fontSize: 11 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} />
                        <Radar
                          name="Puntuación"
                          dataKey="score"
                          stroke="#f59e0b"
                          fill="#f59e0b"
                          fillOpacity={0.5}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Profile and recommendation */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-muted/50">
                    <p className="text-sm text-muted-foreground mb-1">Perfil Cognitivo</p>
                    <Badge
                      className="text-base"
                      style={{
                        backgroundColor: profileColors[selectedCandidate.result.cognitive_profile || ""] + "20",
                        color: profileColors[selectedCandidate.result.cognitive_profile || ""]
                      }}
                    >
                      {profileLabels[selectedCandidate.result.cognitive_profile || ""]}
                    </Badge>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/50">
                    <p className="text-sm text-muted-foreground mb-1">Recomendación</p>
                    {recommendationLabels[selectedCandidate.result.recommendation || ""] && (
                      <div className={cn(
                        "flex items-center gap-2 text-lg font-medium",
                        recommendationLabels[selectedCandidate.result.recommendation || ""].color
                      )}>
                        {(() => {
                          const Icon = recommendationLabels[selectedCandidate.result.recommendation || ""].icon;
                          return <Icon className="h-5 w-5" />;
                        })()}
                        {recommendationLabels[selectedCandidate.result.recommendation || ""].text}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
