import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { getManagerSessionToken } from "@/lib/sessionHelpers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Download, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { CandidaturaDetailDrawer } from "./CandidaturaDetailDrawer";
import { VehicleIcon } from "./VehicleIcon";
import { cn } from "@/lib/utils";

type Application = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string;
  origin_country: string;
  current_address: string;
  current_lat: number | null;
  current_lng: number | null;
  distance_km: number | null;
  vehicle: string;
  spanish_level: number;
  cv_file_url: string | null;
  cv_file_type: string | null;
  form_language: string;
  ai_score: number | null;
  ai_extracted: any;
  ai_summary: string | null;
  ai_status: string;
  ai_rejection_reasons: string[] | null;
  ai_processed_at: string | null;
  admin_status: string;
  admin_notes: string | null;
  created_at: string;
  job_position_id: string | null;
  job_positions?: { title: string } | null;
};

type Props = {
  isAdmin: boolean;
};


const STATUS_STYLES: Record<string, string> = {
  new: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  reviewing: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  shortlisted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  discarded: "border-border bg-muted/40 text-muted-foreground",
  hired: "border-primary/30 bg-primary/10 text-primary",
};

const AI_STATUS_STYLES: Record<string, string> = {
  pending: "border-border bg-muted/40 text-muted-foreground",
  processing: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  passed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function CandidaturasTab({ isAdmin }: Props) {
  const { t } = useLanguage();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showRejected, setShowRejected] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [aiStatusFilter, setAiStatusFilter] = useState<string>("all");
  type SortKey = "created_at" | "ai_score" | "distance_km" | "spanish_level" | "first_name" | "admin_status" | "ai_status";
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir(key === "first_name" ? "asc" : "desc"); }
  };

  const SortHeader = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => {
    const active = sortBy === k;
    const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground transition-colors",
            active ? "text-foreground font-medium" : "text-muted-foreground"
          )}
        >
          {children}
          <Icon className="h-3 w-3 opacity-70" />
        </button>
      </TableHead>
    );
  };

  const fetchApps = useCallback(async () => {
    setLoading(true);
    const sessionToken = getManagerSessionToken();
    const { data, error } = await supabase.functions.invoke("admin-operations", {
      body: {
        action: "list_applications",
        sessionToken,
        data: {
          page,
          pageSize: PAGE_SIZE,
          showRejected,
          showErrors,
          statusFilter,
          search,
        },
      },
    });
    if (error || !(data as any)?.success) {
      console.error("list_applications error", error, data);
      setApps([]);
    } else {
      setApps(((data as any).applications as any[]) || []);
    }
    setLoading(false);
  }, [page, showRejected, showErrors, statusFilter, search]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const viewApps = (() => {
    let out = apps.slice();
    if (aiStatusFilter !== "all") out = out.filter((a) => a.ai_status === aiStatusFilter);
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: any, b: any) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    };
    out.sort(cmp);
    return out;
  })();

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 70) return "text-green-600";
    if (score >= 40) return "text-amber-600";
    return "text-red-600";
  };

  const exportCSV = () => {
    if (apps.length === 0) return;
    const headers = ["Nombre", "Apellido", "País", "Dirección", "Distancia", "Vehículo", "Español", "Score IA", "Estado IA", "Estado Admin", "Fecha"];
    const rows = apps.map((a) => [
      a.first_name, a.last_name, a.origin_country, a.current_address,
      a.distance_km?.toString() || "", a.vehicle, a.spanish_level.toString(),
      a.ai_score?.toString() || "", a.ai_status, a.admin_status,
      new Date(a.created_at).toLocaleDateString("es"),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `candidaturas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={t("cand_search")}
            className="ps-8 h-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Estado admin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Estado admin: Todos</SelectItem>
            <SelectItem value="new">{t("cand_status_new")}</SelectItem>
            <SelectItem value="reviewing">{t("cand_status_reviewing")}</SelectItem>
            <SelectItem value="shortlisted">{t("cand_status_shortlisted")}</SelectItem>
            <SelectItem value="discarded">{t("cand_status_discarded")}</SelectItem>
            <SelectItem value="hired">{t("cand_status_hired")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={aiStatusFilter} onValueChange={(v) => setAiStatusFilter(v)}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Estado IA" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Estado IA: Todos</SelectItem>
            <SelectItem value="pending">{t("cand_ai_pending")}</SelectItem>
            <SelectItem value="processing">{t("cand_ai_processing")}</SelectItem>
            <SelectItem value="passed">{t("cand_ai_passed")}</SelectItem>
            <SelectItem value="rejected">{t("cand_ai_rejected")}</SelectItem>
            <SelectItem value="error">{t("cand_ai_error")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Switch checked={showRejected} onCheckedChange={(v) => { setShowRejected(v); setPage(0); }} id="show-rejected" />
          <Label htmlFor="show-rejected" className="text-xs cursor-pointer">{t("cand_show_rejected")}</Label>
        </div>

        <div className="flex items-center gap-1.5">
          <Switch checked={showErrors} onCheckedChange={(v) => { setShowErrors(v); setPage(0); }} id="show-errors" />
          <Label htmlFor="show-errors" className="text-xs cursor-pointer">{t("cand_show_errors")}</Label>
        </div>

        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-3.5 w-3.5 me-1" />
          CSV
        </Button>
      </div>

      {/* Quick filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground me-1">Atajos:</span>
        {([
          { label: "Todas", admin: "all", ai: "all" },
          { label: "Nuevas", admin: "new", ai: "all" },
          { label: "En revisión", admin: "reviewing", ai: "all" },
          { label: "Preseleccionadas", admin: "shortlisted", ai: "all" },
          { label: "Aprobadas IA", admin: "all", ai: "passed" },
          { label: "Errores IA", admin: "all", ai: "error" },
          { label: "Pendientes IA", admin: "all", ai: "pending" },
        ] as const).map((c) => {
          const active = statusFilter === c.admin && aiStatusFilter === c.ai;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => { setStatusFilter(c.admin); setAiStatusFilter(c.ai); setPage(0); }}
              className={cn(
                "h-7 px-2.5 rounded-full border text-[11px] font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted/60 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : viewApps.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">{t("cand_no_results")}</p>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader k="ai_score" className="w-16">{t("cand_score")}</SortHeader>
                <SortHeader k="first_name">{t("apply_first_name")}</SortHeader>
                <TableHead className="hidden md:table-cell">{t("apply_step_position")}</TableHead>
                <SortHeader k="distance_km" className="w-20">{t("cand_distance")}</SortHeader>
                <TableHead className="w-16 hidden sm:table-cell">{t("cand_vehicle")}</TableHead>
                <SortHeader k="spanish_level" className="w-16">{t("cand_spanish_level")}</SortHeader>
                <SortHeader k="admin_status" className="w-24">{t("cand_status")}</SortHeader>
                <SortHeader k="created_at" className="w-20">{t("cand_date")}</SortHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viewApps.map((app) => (
                <TableRow
                  key={app.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedApp(app)}
                >
                  <TableCell>
                    <span className={`font-bold text-sm ${getScoreColor(app.ai_score)}`}>
                      {app.ai_score ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium text-sm">{app.first_name} {app.last_name}</span>
                      <p className="text-[10px] text-muted-foreground">{app.origin_country}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {(app as any).job_positions?.title || "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {app.distance_km ? `${app.distance_km} km` : "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <VehicleIcon vehicle={app.vehicle} size={18} />
                  </TableCell>
                  <TableCell className="text-xs font-medium">{app.spanish_level}/5</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-tight ${AI_STATUS_STYLES[app.ai_status] || "border-border bg-muted/40 text-muted-foreground"}`}>
                        <span className="me-1 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                        {t(`cand_ai_${app.ai_status}`)}
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-tight ${STATUS_STYLES[app.admin_status] || "border-border bg-muted/40 text-muted-foreground"}`}>
                        {t(`cand_status_${app.admin_status}`)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground">
                    {new Date(app.created_at).toLocaleDateString("es")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground">Pág. {page + 1}</span>
        <Button variant="outline" size="sm" disabled={apps.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Detail drawer */}
      <CandidaturaDetailDrawer
        application={selectedApp}
        isAdmin={isAdmin}
        onClose={() => setSelectedApp(null)}
        onUpdated={fetchApps}
      />
    </div>
  );
}
