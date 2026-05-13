import { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { getManagerSessionToken } from "@/lib/sessionHelpers";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { MapPin, Download, FileText, AlertTriangle, Star, Briefcase, GraduationCap, Languages, ExternalLink } from "lucide-react";
import { VehicleIcon, VEHICLE_LABELS } from "./VehicleIcon";

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
  job_positions?: { title: string } | null;
};

type Props = {
  application: Application | null;
  isAdmin: boolean;
  onClose: () => void;
  onUpdated: () => void;
};

export function CandidaturaDetailDrawer({ application: app, isAdmin, onClose, onUpdated }: Props) {
  const { t } = useLanguage();
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [cvLoading, setCvLoading] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);

  useEffect(() => {
    if (app) {
      setNotes(app.admin_notes || "");
      setStatus(app.admin_status);
    }
  }, [app]);

  // Load signed CV URL when opening
  useEffect(() => {
    setCvUrl(null);
    if (!app?.cv_file_url) return;
    let cancelled = false;
    setCvLoading(true);
    supabase.functions.invoke("admin-operations", {
      body: {
        action: "get_cv_signed_url",
        sessionToken: getManagerSessionToken(),
        data: { path: app.cv_file_url },
      },
    }).then(({ data }) => {
      if (cancelled) return;
      if ((data as any)?.signedUrl) setCvUrl((data as any).signedUrl);
    }).finally(() => { if (!cancelled) setCvLoading(false); });
    return () => { cancelled = true; };
  }, [app?.id, app?.cv_file_url]);

  // Init map
  useEffect(() => {
    if (!app?.current_lat || !app?.current_lng || !mapRef.current) return;

    const initMap = async () => {
      const L = await import("leaflet");
      
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      if (leafletMapRef.current) leafletMapRef.current.remove();

      const map = L.map(mapRef.current!, { zoomControl: false }).setView([app.current_lat!, app.current_lng!], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OSM" }).addTo(map);
      L.marker([app.current_lat!, app.current_lng!]).addTo(map);
      leafletMapRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    };

    initMap();
    return () => { if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; } };
  }, [app?.id, app?.current_lat, app?.current_lng]);

  const handleSave = async () => {
    if (!app || !isAdmin) return;
    setSaving(true);
    await supabase.functions.invoke("admin-operations", {
      body: {
        action: "update_application",
        sessionToken: getManagerSessionToken(),
        data: { id: app.id, admin_status: status, admin_notes: notes },
      },
    });
    setSaving(false);
    toast({ title: "Guardado" });
    onUpdated();
  };

  const openCV = () => {
    if (cvUrl) window.open(cvUrl, "_blank");
  };

  const reprocessAI = async () => {
    if (!app) return;
    toast({ title: "Reprocesando..." });
    await supabase.functions.invoke("process-application", { body: { application_id: app.id } });
    onUpdated();
  };

  const getScoreBg = (score: number | null) => {
    if (score === null) return "bg-muted";
    if (score >= 70) return "bg-green-500";
    if (score >= 40) return "bg-amber-500";
    return "bg-red-500";
  };

  if (!app) return null;

  return (
    <Sheet open={!!app} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            {/* Score circle */}
            <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${getScoreBg(app.ai_score)}`}>
              {app.ai_score ?? "?"}
            </div>
            <div>
              <div className="text-lg">{app.first_name} {app.last_name}</div>
              <p className="text-xs text-muted-foreground font-normal">{app.origin_country} · {new Date(app.created_at).toLocaleDateString("es")}</p>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* AI Summary */}
          {app.ai_summary && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
              <h4 className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                <Star className="h-3.5 w-3.5" />
                {t("cand_ai_summary")}
              </h4>
              <p className="text-sm">{app.ai_summary}</p>
            </div>
          )}

          {/* Rejection reasons */}
          {app.ai_rejection_reasons && app.ai_rejection_reasons.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {app.ai_rejection_reasons.map((r, i) => (
                <Badge key={i} variant="destructive" className="text-[10px]">
                  <AlertTriangle className="h-3 w-3 me-1" />
                  {r}
                </Badge>
              ))}
            </div>
          )}

          {/* AI Extracted data */}
          {app.ai_extracted && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">{t("cand_extracted")}</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {app.ai_extracted.years_experience !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                    {app.ai_extracted.years_experience} {t("cand_years")} exp.
                  </div>
                )}
                {app.ai_extracted.education && (
                  <div className="flex items-center gap-1.5">
                    <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{app.ai_extracted.education}</span>
                  </div>
                )}
              </div>
              {app.ai_extracted.previous_roles?.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">{t("cand_roles")}:</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {app.ai_extracted.previous_roles.map((r: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{r}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {app.ai_extracted.languages?.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Languages className="h-3 w-3" />
                    {t("cand_languages")}:
                  </span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {app.ai_extracted.languages.map((l: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{l.lang} ({l.level})</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Personal data */}
          <div className="space-y-1.5 text-sm">
            <Row label={t("apply_gender")} value={app.gender === "male" ? t("apply_male") : t("apply_female")} />
            <div className="flex justify-between gap-4 items-center">
              <span className="text-muted-foreground shrink-0">{t("apply_step_vehicle")}</span>
              <span className="font-medium text-end inline-flex items-center gap-1.5">
                <VehicleIcon vehicle={app.vehicle} size={16} />
                {VEHICLE_LABELS[app.vehicle] || app.vehicle}
              </span>
            </div>
            <Row label={t("cand_spanish_level")} value={`${app.spanish_level}/5`} />
            <Row label={t("cand_distance")} value={app.distance_km ? `${app.distance_km} km` : "—"} />
            <Row label={t("apply_step_address")} value={app.current_address} />
          </div>

          {/* Mini map */}
          {app.current_lat && app.current_lng && (
            <div ref={mapRef} className="h-36 rounded-lg overflow-hidden border" />
          )}

          {/* CV embed */}
          {app.cv_file_url && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  CV
                </h4>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={openCV} disabled={!cvUrl} className="h-7 px-2 gap-1 text-xs">
                    <ExternalLink className="h-3 w-3" />
                    Abrir
                  </Button>
                  <Button variant="outline" size="sm" disabled={!cvUrl} asChild={!!cvUrl} className="h-7 px-2 gap-1 text-xs">
                    {cvUrl ? (
                      <a href={cvUrl} download target="_blank" rel="noreferrer">
                        <Download className="h-3 w-3" />
                        Descargar
                      </a>
                    ) : (
                      <span><Download className="h-3 w-3" /> Descargar</span>
                    )}
                  </Button>
                </div>
              </div>
              <div className="rounded-lg overflow-hidden border bg-muted/30 h-[480px] flex items-center justify-center">
                {cvLoading && !cvUrl ? (
                  <p className="text-xs text-muted-foreground">Cargando CV…</p>
                ) : !cvUrl ? (
                  <p className="text-xs text-muted-foreground">No se pudo cargar el CV</p>
                ) : app.cv_file_type?.startsWith("image/") ? (
                  <img src={cvUrl} alt="CV" className="w-full h-full object-contain" />
                ) : (
                  <iframe
                    src={`${cvUrl}#toolbar=0&navpanes=0`}
                    title="CV"
                    className="w-full h-full"
                  />
                )}
              </div>
            </div>
          )}

          {/* Admin actions */}
          {isAdmin && (
            <div className="border-t pt-4 space-y-3">
              <div>
                <label className="text-xs font-medium">{t("cand_status")}</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["new", "reviewing", "shortlisted", "discarded", "hired"].map((s) => (
                      <SelectItem key={s} value={s}>{t(`cand_status_${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium">{t("cand_notes")}</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={3} />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  {saving ? "..." : "Guardar"}
                </Button>
                {app.ai_status === "error" && (
                  <Button variant="outline" onClick={reprocessAI}>
                    Reprocesar IA
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-end">{value}</span>
    </div>
  );
}
