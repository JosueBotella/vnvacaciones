import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getManagerSessionToken } from "@/lib/sessionHelpers";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Star, Download, Loader2, MapPin, Calendar as CalIcon, Mail, Phone, Building2, FileText, CalendarPlus, UserCog, Check } from "lucide-react";
import { buildGoogleCalendarUrl } from "@/lib/googleCalendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ManagerAvatar } from "./ManagerAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Interview = any;
type Eval = {
  id?: string;
  notes?: string | null;
  rating?: number | null;
  decision?: "pass" | "doubt" | "reject" | null;
  attended?: boolean;
  psicotecnico?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  interview: Interview | null;
  canSeeAllEvaluations?: boolean;
  onChanged?: () => void;
};

const decisionLabels: Record<string, string> = {
  pass: "Pasa de fase",
  doubt: "En duda",
  reject: "No pasa",
};

const decisionColors: Record<string, string> = {
  pass: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30",
  doubt: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  reject: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
};

export function InterviewDetailDialog({ open, onOpenChange, interview, canSeeAllEvaluations, onChanged }: Props) {
  const [myEval, setMyEval] = useState<Eval>({ attended: false });
  const [allEvals, setAllEvals] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingCv, setLoadingCv] = useState(false);
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [cvLoadError, setCvLoadError] = useState(false);
  const [deptManagers, setDeptManagers] = useState<Array<{ id: string; name: string; avatar_url: string | null }>>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const cvMime: string = interview?.cv_file_type || "";
  const cvUrlLower = (cvUrl || interview?.cv_file_url || "").toLowerCase().split("?")[0];
  const cvIsImage =
    cvMime.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(cvUrlLower);
  // Default to PDF preview when type is unknown — most CVs are PDFs.
  const cvIsPdf =
    !cvIsImage &&
    (cvMime.includes("pdf") ||
      cvUrlLower.endsWith(".pdf") ||
      (!cvMime && !/\.(png|jpe?g|webp|gif|heic|heif|docx?|odt)$/i.test(cvUrlLower)));

  useEffect(() => {
    if (!open || !interview) return;
    setMyEval({
      attended: interview.own_evaluation?.attended ?? false,
      rating: interview.own_evaluation?.rating ?? null,
      decision: interview.own_evaluation?.decision ?? null,
      notes: interview.own_evaluation?.notes ?? "",
      psicotecnico: interview.own_evaluation?.psicotecnico ?? "",
    });
    setAllEvals([]);
    setCvUrl(null);
    setCvLoadError(false);
    if (canSeeAllEvaluations) loadAllEvals();
    if (interview.cv_file_url) loadCvUrl();
    if (interview.department_id) loadDeptManagers(interview.department_id);
  }, [open, interview, canSeeAllEvaluations]);

  const loadDeptManagers = async (departmentId: string) => {
    try {
      const sessionToken = getManagerSessionToken();
      const { data } = await supabase.functions.invoke("interviews-operations", {
        body: { action: "listDepartmentManagers", sessionToken, department_id: departmentId },
      });
      if (data?.success) setDeptManagers(data.managers || []);
    } catch { /* ignore */ }
  };

  const handleAssign = async (managerId: string | null) => {
    if (!interview?.id) return;
    setAssigning(true);
    try {
      const sessionToken = getManagerSessionToken();
      const { data } = await supabase.functions.invoke("interviews-operations", {
        body: {
          action: "assignInterview",
          sessionToken,
          interview_id: interview.id,
          manager_id: managerId,
        },
      });
      if (data?.success) {
        toast.success(managerId ? "Entrevista asignada" : "Asignación eliminada");
        setAssignOpen(false);
        onChanged?.();
      } else {
        toast.error(data?.error || "No se pudo asignar");
      }
    } catch (e: any) {
      toast.error(e?.message || "Error al asignar");
    } finally {
      setAssigning(false);
    }
  };

  const loadAllEvals = async () => {
    if (!interview?.id) return;
    const sessionToken = getManagerSessionToken();
    const { data } = await supabase.functions.invoke("interviews-operations", {
      body: { action: "listEvaluations", sessionToken, interview_id: interview.id },
    });
    if (data?.success) setAllEvals(data.evaluations || []);
  };

  const loadCvUrl = async () => {
    if (!interview?.id) return;
    try {
      const sessionToken = getManagerSessionToken();
      const { data } = await supabase.functions.invoke("interviews-operations", {
        body: { action: "getCvSignedUrl", sessionToken, id: interview.id },
      });
      if (data?.success && data.url) setCvUrl(data.url);
      else setCvLoadError(true);
    } catch {
      setCvLoadError(true);
    }
  };

  const handleDownloadCv = async () => {
    if (!interview?.id) return;
    if (cvUrl) {
      window.open(cvUrl, "_blank");
      return;
    }
    setLoadingCv(true);
    try {
      const sessionToken = getManagerSessionToken();
      const { data } = await supabase.functions.invoke("interviews-operations", {
        body: { action: "getCvSignedUrl", sessionToken, id: interview.id },
      });
      if (data?.success && data.url) {
        setCvUrl(data.url);
        window.open(data.url, "_blank");
      } else {
        toast.error(data?.error || "No se pudo obtener el CV");
      }
    } finally {
      setLoadingCv(false);
    }
  };

  const handleSaveEval = async () => {
    if (!interview?.id) return;
    setSaving(true);
    try {
      const sessionToken = getManagerSessionToken();
      const { data } = await supabase.functions.invoke("interviews-operations", {
        body: {
          action: "upsertEvaluation",
          sessionToken,
          interview_id: interview.id,
          evaluation: myEval,
        },
      });
      if (data?.success) {
        toast.success("Evaluación guardada");
        onChanged?.();
        if (canSeeAllEvaluations) loadAllEvals();
      } else {
        toast.error(data?.error || "Error al guardar");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!interview) return null;
  const dt = new Date(interview.scheduled_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pe-8">
            <DialogTitle className="text-base font-semibold tracking-tight">
              {interview.candidate_name}
            </DialogTitle>
            <Popover open={assignOpen} onOpenChange={setAssignOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full bg-muted/40 hover:bg-muted/70 transition-colors px-2 py-1 border border-border/30"
                  title={interview.assigned_manager?.name ? `Asignada a ${interview.assigned_manager.name}` : "Sin asignar"}
                >
                  <ManagerAvatar
                    name={interview.assigned_manager?.name}
                    avatarUrl={interview.assigned_manager?.avatar_url}
                    size="sm"
                    showTooltip={false}
                  />
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {interview.assigned_manager?.name || "Sin asignar"}
                  </span>
                  <UserCog className="h-3 w-3 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-1">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 pt-1.5 pb-1">
                  Asignar a
                </div>
                <button
                  type="button"
                  disabled={assigning}
                  onClick={() => handleAssign(null)}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/70 transition-colors text-left",
                    !interview.assigned_manager_id && "bg-muted/40",
                  )}
                >
                  <ManagerAvatar name={null} avatarUrl={null} size="sm" showTooltip={false} />
                  <span className="text-muted-foreground flex-1">Sin asignar</span>
                  {!interview.assigned_manager_id && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
                {deptManagers.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    Sin encargados en este departamento
                  </div>
                ) : (
                  deptManagers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={assigning}
                      onClick={() => handleAssign(m.id)}
                      className={cn(
                        "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/70 transition-colors text-left",
                        interview.assigned_manager_id === m.id && "bg-muted/40",
                      )}
                    >
                      <ManagerAvatar name={m.name} avatarUrl={m.avatar_url} size="sm" showTooltip={false} />
                      <span className="flex-1 truncate">{m.name}</span>
                      {interview.assigned_manager_id === m.id && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  ))
                )}
              </PopoverContent>
            </Popover>
          </div>
        </DialogHeader>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="info">Información</TabsTrigger>
            <TabsTrigger value="eval">Mi evaluación</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 mt-4">
            <div className="rounded-2xl bg-muted/30 backdrop-blur p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-sm">
                <CalIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{format(dt, "EEEE d 'de' MMMM, HH:mm", { locale: es })}</span>
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-auto">
                  {interview.duration_minutes ?? 30} min
                </Badge>
              </div>
              {interview.room && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  Sala {interview.room}
                </div>
              )}
              {(interview.departments?.name || interview.custom_department) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  {interview.departments?.name || interview.custom_department}
                </div>
              )}
              {interview.job_positions?.title && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  {interview.job_positions.title}
                </div>
              )}
            </div>

            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-full gap-2"
            >
              <a
                href={buildGoogleCalendarUrl(interview)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Añadir a Google Calendar
              </a>
            </Button>

            {(interview.candidate_email || interview.candidate_phone) && (
              <div className="space-y-2">
                {interview.candidate_email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={`mailto:${interview.candidate_email}`} className="text-primary hover:underline">
                      {interview.candidate_email}
                    </a>
                  </div>
                )}
                {interview.candidate_phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {interview.candidate_phone}
                  </div>
                )}
              </div>
            )}

            {interview.additional_info && (
              <div className="rounded-xl border border-border/40 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
                {interview.additional_info}
              </div>
            )}

            {interview.cv_file_url && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3 w-3" />
                    Currículum
                  </Label>
                  <Button
                    onClick={handleDownloadCv}
                    disabled={loadingCv}
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs gap-1.5"
                  >
                    {loadingCv ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    {cvUrl ? "Abrir en pestaña nueva" : "Descargar"}
                  </Button>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
                  {!cvUrl && !cvLoadError && (
                    <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Cargando previsualización…
                    </div>
                  )}
                  {cvLoadError && (
                    <div className="flex flex-col items-center justify-center h-64 text-xs text-muted-foreground gap-2 px-4 text-center">
                      <FileText className="h-6 w-6 opacity-40" />
                      No se pudo previsualizar el CV. Usa el botón "Descargar" arriba.
                    </div>
                  )}
                  {cvUrl && cvIsPdf && (
                    <object
                      data={`${cvUrl}#toolbar=0&navpanes=0&view=FitH`}
                      type="application/pdf"
                      className="w-full h-[70vh] bg-background"
                    >
                      <iframe
                        src={`https://docs.google.com/viewer?url=${encodeURIComponent(cvUrl)}&embedded=true`}
                        title="Previsualización CV"
                        className="w-full h-[70vh] bg-background"
                      />
                    </object>
                  )}
                  {cvUrl && cvIsImage && (
                    <img
                      src={cvUrl}
                      alt="CV del candidato"
                      className="w-full max-h-[70vh] object-contain bg-background"
                    />
                  )}
                  {cvUrl && !cvIsPdf && !cvIsImage && (
                    <div className="flex flex-col items-center justify-center h-48 text-xs text-muted-foreground gap-2 px-4 text-center">
                      <FileText className="h-6 w-6 opacity-40" />
                      Este formato no se puede previsualizar. Pulsa "Descargar" para verlo.
                    </div>
                  )}
                </div>
              </div>
            )}

            {canSeeAllEvaluations && allEvals.length > 0 && (
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Evaluaciones recibidas ({allEvals.length})
                </h4>
                {allEvals.map((ev) => (
                  <div key={ev.id} className="rounded-xl border border-border/40 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{ev.manager_name}</span>
                      {ev.decision && (
                        <Badge variant="outline" className={cn("text-[10px]", decisionColors[ev.decision])}>
                          {decisionLabels[ev.decision]}
                        </Badge>
                      )}
                    </div>
                    {ev.rating && (
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={cn("h-3 w-3", n <= ev.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
                          />
                        ))}
                      </div>
                    )}
                    {ev.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{ev.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="eval" className="space-y-5 mt-4">
            <div className="flex items-center justify-between rounded-xl bg-muted/30 p-3">
              <Label className="text-sm font-medium">Entrevistado</Label>
              <Switch checked={!!myEval.attended} onCheckedChange={(v) => setMyEval({ ...myEval, attended: v })} />
            </div>

            {myEval.attended && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Psicotécnico
                </Label>
                <input
                  type="text"
                  value={myEval.psicotecnico || ""}
                  onChange={(e) => setMyEval({ ...myEval, psicotecnico: e.target.value })}
                  placeholder="Ej: 12/24"
                  className="w-full rounded-xl border border-border/40 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Puntuación</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMyEval({ ...myEval, rating: n })}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={cn(
                        "h-7 w-7",
                        (myEval.rating || 0) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30",
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Decisión</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["pass", "doubt", "reject"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setMyEval({ ...myEval, decision: d })}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-xs font-medium transition-all",
                      myEval.decision === d ? decisionColors[d] : "border-border/40 hover:bg-muted/50",
                    )}
                  >
                    {decisionLabels[d]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notas</Label>
              <Textarea
                value={myEval.notes || ""}
                onChange={(e) => setMyEval({ ...myEval, notes: e.target.value })}
                rows={4}
                placeholder="Tus impresiones sobre el candidato…"
              />
            </div>

            <Button onClick={handleSaveEval} disabled={saving} className="w-full">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar evaluación
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
