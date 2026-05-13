/**
 * VideoEvidenceAuditPanel
 * -----------------------
 * Internal audit view for the admin to inspect EXACTLY which video frames
 * will be inserted in the legal document. Only V2 verified captures
 * (`capture_source = browser_canvas`, stored under `video-frames-v2/`) are
 * accepted by the backend. The panel surfaces:
 *
 *   - A thumbnail preview of every cached frame
 *   - The MM:SS timestamp + factual caption
 *   - A "Verificado" / "No verificado" badge
 *   - Per-frame delete + global "Regenerar todo" / "Vaciar caché" controls
 *
 * It is read-only safe: deleting/regenerating only touches the cache, never
 * the original video evidence.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2, ShieldCheck, ShieldAlert, ImageOff } from "lucide-react";
import { filterVideoPaths, preprocessProposalVideos } from "@/lib/videoFrameExtractor";
import { getManagerSessionToken } from "@/lib/sessionHelpers";

interface FrameRow {
  id: string;
  propuesta_id: string;
  video_path: string;
  video_name: string;
  frame_url: string;
  timestamp_seconds: number;
  timestamp_label: string;
  ai_description: string | null;
  caption: string | null;
  capture_source: string | null;
  storage_path: string | null;
  verified_at: string | null;
  verified: boolean;
  created_at: string;
}

interface Props {
  propuestaId: string;
  /** Show inline (no card chrome) when true. */
  compact?: boolean;
}

export function VideoEvidenceAuditPanel({ propuestaId, compact = false }: Props) {
  const sessionToken = typeof window !== "undefined"
    ? getManagerSessionToken() || ""
    : "";
  const [loading, setLoading] = useState(true);
  const [frames, setFrames] = useState<FrameRow[]>([]);
  const [working, setWorking] = useState<string | null>(null); // frameId being deleted
  const [regenerating, setRegenerating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "listVideoFrames", sessionToken, propuestaId },
      });
      if (error || data?.success === false) {
        toast.error(data?.error || error?.message || "No se pudieron cargar los fotogramas");
        setFrames([]);
        return;
      }
      setFrames(Array.isArray(data?.frames) ? data.frames : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propuestaId]);

  const handleDelete = async (frameId: string) => {
    setWorking(frameId);
    try {
      const { data, error } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "deleteVideoFrame", sessionToken, frameId },
      });
      if (error || data?.success === false) {
        toast.error(data?.error || error?.message || "No se pudo eliminar el fotograma");
        return;
      }
      setFrames((prev) => prev.filter((f) => f.id !== frameId));
      toast.success("Fotograma eliminado");
    } finally {
      setWorking(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("¿Eliminar TODOS los fotogramas cacheados de esta propuesta?")) return;
    setClearing(true);
    try {
      const { data, error } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "clearVideoFramesCache", sessionToken, propuestaId },
      });
      if (error || data?.success === false) {
        toast.error(data?.error || error?.message || "No se pudo vaciar la caché");
        return;
      }
      setFrames([]);
      toast.success("Caché de fotogramas vaciada");
    } finally {
      setClearing(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setProgressLabel("Cargando vídeos asociados…");
    try {
      const { data: ev, error: evErr } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getProposalEvidencePaths", sessionToken, propuestaId },
      });
      if (evErr || ev?.success === false) {
        toast.error(ev?.error || evErr?.message || "No se pudieron leer las pruebas");
        return;
      }
      const videoPaths = filterVideoPaths(Array.isArray(ev?.videoPaths) ? ev.videoPaths : []);
      if (videoPaths.length === 0) {
        toast.info("No hay vídeos asociados a esta propuesta");
        return;
      }
      const ctx = String(ev?.descripcion || "");
      const result = await preprocessProposalVideos(propuestaId, videoPaths, ctx, (p) => {
        const tag = p.totalVideos > 1 ? `Vídeo ${p.videoIndex + 1}/${p.totalVideos} — ` : "";
        const counter = p.step.total ? ` (${p.step.current}/${p.step.total})` : "";
        setProgressLabel(`${tag}${p.step.label}${counter}`);
      });
      if (result.totalFrames === 0) {
        toast.warning("No se pudo extraer ningún fotograma real. Revisa el formato del vídeo.");
      } else {
        toast.success(`${result.totalFrames} fotogramas reales generados`);
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Error al regenerar fotogramas");
    } finally {
      setRegenerating(false);
      setProgressLabel("");
    }
  };

  const grouped = frames.reduce<Record<string, FrameRow[]>>((acc, f) => {
    const k = f.video_name || "Vídeo";
    (acc[k] = acc[k] || []).push(f);
    return acc;
  }, {});

  const verifiedCount = frames.filter((f) => f.verified).length;
  const legacyCount = frames.length - verifiedCount;

  const containerClass = compact
    ? "space-y-3"
    : "rounded-xl border border-border/60 bg-card p-4 space-y-3";

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold tracking-tight">Auditoría de evidencias del vídeo</h3>
          {verifiedCount > 0 && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <ShieldCheck className="h-3 w-3" /> {verifiedCount} verificadas
            </Badge>
          )}
          {legacyCount > 0 && (
            <Badge variant="destructive" className="text-[10px] gap-1">
              <ShieldAlert className="h-3 w-3" /> {legacyCount} no verificadas
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRegenerate}
            disabled={regenerating || clearing}
            className="h-8 text-xs"
          >
            {regenerating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Regenerar fotogramas reales
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClearAll}
            disabled={clearing || regenerating || frames.length === 0}
            className="h-8 text-xs text-destructive hover:text-destructive"
          >
            {clearing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
            Vaciar caché
          </Button>
        </div>
      </div>

      {regenerating && progressLabel && (
        <p className="text-[11px] text-muted-foreground tracking-tight">{progressLabel}</p>
      )}

      {legacyCount > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          Hay {legacyCount} fotograma(s) sin trazabilidad verificada. No se incluirán en el documento legal — pulsa “Regenerar fotogramas reales” para obtener evidencias auténticas del vídeo original.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-xs">Cargando fotogramas…</span>
        </div>
      ) : frames.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
          <ImageOff className="h-6 w-6" />
          <p className="text-xs">Aún no hay fotogramas reales cacheados para esta propuesta.</p>
          <p className="text-[10px]">Usa “Regenerar fotogramas reales” para extraerlos del vídeo original.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([videoName, items]) => (
            <div key={videoName} className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground tracking-tight truncate">
                {videoName}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((frame) => (
                  <div
                    key={frame.id}
                    className="rounded-lg overflow-hidden border border-border/60 bg-background shadow-sm group"
                  >
                    <div className="relative aspect-video bg-muted overflow-hidden">
                      <img
                        src={frame.frame_url}
                        alt={frame.caption || frame.timestamp_label}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                        <Badge variant="secondary" className="text-[10px] tabular-nums backdrop-blur bg-background/80">
                          {frame.timestamp_label}
                        </Badge>
                        {frame.verified ? (
                          <Badge variant="outline" className="text-[10px] gap-0.5">
                            <ShieldCheck className="h-2.5 w-2.5" /> verificado
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] gap-0.5">
                            <ShieldAlert className="h-2.5 w-2.5" /> no válido
                          </Badge>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(frame.id)}
                        disabled={working === frame.id}
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                        title="Eliminar fotograma"
                      >
                        {working === frame.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Trash2 className="h-3 w-3" />}
                      </button>
                    </div>
                    <div className="p-2.5 text-[11px] leading-snug">
                      <p className="text-foreground line-clamp-2">
                        {frame.caption || frame.ai_description || "Fotograma real extraído del vídeo aportado."}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
