import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { LegalDocumentInlineButton } from "./LegalDocumentInlineButton";
import { SuspensionCalendarPicker } from "./SuspensionCalendarPicker";
import { Scale, Loader2, Check, X, Send, ChevronDown, ChevronRight, ShieldAlert, FileText, CheckCircle, Sparkles, Save, Trash2, MoreHorizontal, Brain, Mail, Gavel, ImagePlus, Images, AlertCircle, Eye, EyeOff, Clock, RefreshCw, MessageSquare, Bot, User, Copy, Paperclip, Video, File, ArrowRight, GitBranch, RotateCcw, Crop as CropIcon, History, GitMerge, Pencil, ThumbsUp, ThumbsDown, Archive } from "lucide-react";
import { EvidenceCropDialog } from "./EvidenceCropDialog";
import DuplicateProposalDialog from "./DuplicateProposalDialog";
import { EvidenceCollageBuilder, type CollageLayout } from "./EvidenceCollageBuilder";
import { LayoutGrid } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
// Separator removed - using spacing and bg-muted blocks instead
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { paginateLegalDocument } from "./legalDocumentPagination";
import { buildLegalPreviewSrcDoc } from "./legalDocumentPreview";
import { generateLegalPdfBase64FromSrcDoc } from "./legalDocumentPdf";
import { enqueueLegalDocJob } from "@/lib/legalDocumentQueue";
import { filterVideoPaths, preprocessProposalVideos } from "@/lib/videoFrameExtractor";
import { compressEvidenceFile, EVIDENCE_MAX_BYTES, formatBytes, type CompressionProgress } from "@/lib/evidenceCompressor";

const estadoColors: Record<string, string> = {
  pendiente: '#f59e0b',
  aprobada: '#3b82f6',
  enviada: '#93d600',
  rechazada: '#ef4444',
};
const estadoLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  enviada: 'Enviada',
  rechazada: 'Rechazada',
};
const gravedadColors: Record<string, string> = {
  leve: '#93d600',
  grave: '#f59e0b',
  muy_grave: '#ef4444',
};

function RiskBar({ value }: { value: number }) {
  const color = value >= 75 ? 'bg-red-500' : value >= 50 ? 'bg-amber-500' : value >= 25 ? 'bg-yellow-400' : 'bg-primary';
  const label = value >= 75 ? 'Crítico' : value >= 50 ? 'Alto' : value >= 25 ? 'Medio' : 'Bajo';
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-help">
            <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
            </div>
            <span className="text-xs font-medium tabular-nums">{value}%</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Riesgo de reincidencia (IA): <strong>{label} ({value}%)</strong></p>
          <p className="text-[10px] text-muted-foreground">Calculado en base al historial del trabajador</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Evidence Gallery Component ─────────────────────────────────────────────
function EvidenceGallery({ propuestaId, recordPruebas, adminPruebas, disabledManagerPruebas, collageLayout, onAdminPruebasChange, onDisabledManagerChange, onCollageLayoutChange, isSelected }: {
  propuestaId: string;
  recordPruebas: string[];
  adminPruebas: string[];
  disabledManagerPruebas: string[];
  collageLayout: any | null;
  onAdminPruebasChange: (urls: string[]) => void;
  onDisabledManagerChange: (paths: string[]) => void;
  onCollageLayoutChange: (layout: any | null) => void;
  isSelected: boolean;
}) {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [togglingDisable, setTogglingDisable] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<{ url: string; name: string } | null>(null);
  const [cropTarget, setCropTarget] = useState<{ url: string; replaceAdminPath?: string; replaceManagerPath?: string } | null>(null);
  const [collageOpen, setCollageOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const allPaths = [...recordPruebas, ...adminPruebas];
  const galleryRef = useRef<HTMLDivElement>(null);

  function isImagePath(p: string) {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(p);
  }
  function isVideoPath(p: string) {
    return /\.(mp4|mov|avi|webm|mkv)$/i.test(p);
  }
  function getFileName(p: string) {
    return p.split('/').pop() || 'Archivo';
  }

  // Load signed URLs for all images
  useEffect(() => {
    const toFetch = allPaths.filter(p => !signedUrls[p]);
    if (toFetch.length === 0) return;

    Promise.all(toFetch.map(async (path) => {
      try {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "getProposalImageUrl", sessionToken, filePath: path },
        });
        return { path, url: data?.success ? data.url || null : null };
      } catch {
        return { path, url: null };
      }
    })).then(results => {
      setSignedUrls(prev => {
        const next = { ...prev };
        results.forEach(r => { if (r.url) next[r.path] = r.url; });
        return next;
      });
    });
  }, [allPaths.join(',')]);

  const handleUpload = async (files: FileList | File[] | null) => {
    if (!files || (files instanceof FileList && files.length === 0) || (Array.isArray(files) && files.length === 0)) return;
    setUploading(true);
    try {
      const list = Array.from(files);
      for (let i = 0; i < list.length; i++) {
        const rawFile = list[i];
        const label = `(${i + 1}/${list.length}) ${rawFile.name}`;

        // Solo optimizamos imágenes (rápido). Vídeos se suben tal cual para no
        // hacer esperar al admin con ffmpeg.wasm — el backend acepta hasta 500 MB.
        const onProg = (p: CompressionProgress) => {
          if (p.message) setUploadStatus(`${label} · ${p.message}`);
        };
        setUploadStatus(`${label} · Preparando…`);
        let file = rawFile;
        if (rawFile.type.startsWith("image/")) {
          try { file = await compressEvidenceFile(rawFile, onProg); } catch { file = rawFile; }
        }

        if (file.size > EVIDENCE_MAX_BYTES) {
          toast.error(`${file.name} sigue siendo demasiado grande (${formatBytes(file.size)}). Recórtalo o sube otro.`);
          continue;
        }

        setUploadStatus(`${label} · Subiendo (${formatBytes(file.size)})…`);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('propuestaId', propuestaId);
        formData.append('sessionToken', sessionToken);
        formData.append('action', 'addAdminProposalImage');

        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/incidencias-operations`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: formData,
        });
        const result = await res.json();
        if (result?.success && result.admin_pruebas_urls) {
          onAdminPruebasChange(result.admin_pruebas_urls);
          toast.success(`${file.name} añadido`);
        } else {
          toast.error(result?.error || `Error al subir ${file.name}`);
        }
      }
    } catch { toast.error("Error al subir archivo"); }
    finally {
      setUploading(false);
      setUploadStatus("");
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Ctrl+V paste support — only the SELECTED proposal receives the paste
  useEffect(() => {
    if (!isSelected) return;
    const handlePaste = (e: ClipboardEvent) => {
      // Don't intercept paste when typing in inputs/textareas/contenteditable
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handleUpload(files);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [propuestaId, sessionToken, isSelected]);

  const handleRemoveAdmin = async (filePath: string) => {
    setRemoving(filePath);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "removeAdminProposalImage", sessionToken, propuestaId, filePath },
      });
      if (data?.success) {
        onAdminPruebasChange(data.admin_pruebas_urls);
        toast.success("Archivo eliminado");
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error"); }
    finally { setRemoving(null); }
  };

  const handleToggleManagerDisabled = async (filePath: string, disabled: boolean) => {
    setTogglingDisable(filePath);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "toggleManagerEvidence", sessionToken, propuestaId, filePath, disabled },
      });
      if (data?.success) {
        onDisabledManagerChange(Array.isArray(data.disabled_manager_pruebas) ? data.disabled_manager_pruebas : []);
        toast.success(disabled ? "Imagen del encargado desactivada" : "Imagen del encargado reactivada");
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error"); }
    finally { setTogglingDisable(null); }
  };

  const isManagerDisabled = (p: string) => disabledManagerPruebas.includes(p);
  const activeManagerPaths = recordPruebas.filter((p) => !isManagerDisabled(p));
  const totalImages = activeManagerPaths.filter(isImagePath).length + adminPruebas.filter(isImagePath).length;
  const totalVideos = activeManagerPaths.filter(isVideoPath).length + adminPruebas.filter(isVideoPath).length;
  const totalFiles = activeManagerPaths.length + adminPruebas.length;
  const totalDocs = totalFiles - totalImages - totalVideos;

  // Re-fetch a single signed URL when an <img> fails (token may have expired or
  // the network glitched). Marks failed once retried so we don't loop forever.
  const refetchSignedUrl = useCallback(async (path: string) => {
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getProposalImageUrl", sessionToken, filePath: path },
      });
      if (data?.success && data.url) {
        setSignedUrls(prev => ({ ...prev, [path]: data.url }));
        setFailedUrls(prev => { const n = new Set(prev); n.delete(path); return n; });
        return data.url as string;
      }
    } catch { /* ignore */ }
    setFailedUrls(prev => new Set(prev).add(path));
    return null;
  }, [sessionToken]);

  // Inline thumbnail with auto-retry on load error.
  const EvidenceThumb = ({ path, label, borderClass, masonry = false }: { path: string; label: string; borderClass: string; masonry?: boolean }) => {
    const url = signedUrls[path];
    const failed = failedUrls.has(path);
    const [retrying, setRetrying] = useState(false);
    const triedRef = useRef(false);

    const baseCls = masonry
      ? `relative w-full mb-1.5 rounded-md overflow-hidden bg-muted/50 border ${borderClass} hover:ring-2 ring-primary/50 transition-all break-inside-avoid block`
      : `relative w-16 h-16 rounded-lg overflow-hidden bg-muted/50 border ${borderClass} flex items-center justify-center hover:ring-2 ring-primary/50 transition-all`;

    return (
      <button onClick={() => url && !failed && setLightbox(url)} className={baseCls}>
        {url && !failed ? (
          <img
            src={url}
            alt={label}
            className={masonry ? "w-full h-auto block" : "w-full h-full object-cover"}
            onError={async () => {
              if (triedRef.current) {
                setFailedUrls(prev => new Set(prev).add(path));
                return;
              }
              triedRef.current = true;
              setRetrying(true);
              await refetchSignedUrl(path);
              setRetrying(false);
            }}
          />
        ) : failed ? (
          <div
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              triedRef.current = false;
              refetchSignedUrl(path);
            }}
            className={`flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors ${masonry ? 'aspect-square w-full' : ''}`}
            title="Reintentar carga"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="text-[8px]">Reintentar</span>
          </div>
        ) : (
          <div className={masonry ? 'aspect-square w-full flex items-center justify-center' : 'flex items-center justify-center'}>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {retrying && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </button>
    );
  };

  return (
    <div ref={galleryRef} className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Images className="h-3.5 w-3.5" />
        <span className="font-medium">Pruebas / Evidencias</span>
        {totalFiles > 0 && (
          <span className="ml-auto text-[10px] bg-muted/60 px-2 py-0.5 rounded-full">
            {totalImages > 0 && `${totalImages} img`}{totalVideos > 0 && `${totalImages > 0 ? ' · ' : ''}${totalVideos} vid`}{totalDocs > 0 && `${(totalImages > 0 || totalVideos > 0) ? ' · ' : ''}${totalDocs} arch.`}
          </span>
        )}
        {totalImages > 0 && (
          <Button
            type="button"
            variant={collageLayout?.frames?.length ? "default" : "outline"}
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={() => setCollageOpen(true)}
            title="Maquetar manualmente el collage de evidencias del documento legal"
          >
            <LayoutGrid className="h-3 w-3" />
            {collageLayout?.frames?.length ? `Collage manual (${collageLayout.frames.length})` : "Maquetar collage"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Left: Manager's original evidence (read-only) */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Del encargado</p>
          {recordPruebas.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">Sin pruebas adjuntas</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {recordPruebas.map((path, i) => {
                const disabled = isManagerDisabled(path);
                return isImagePath(path) ? (
                  <div key={i} className={`relative group ${disabled ? 'opacity-40 grayscale' : ''}`}>
                    <EvidenceThumb path={path} label={`Prueba ${i+1}${disabled ? ' (desactivada)' : ''}`} borderClass={disabled ? "border-dashed border-border/40" : "border-border/50"} />
                    {disabled && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <EyeOff className="h-4 w-4 text-foreground/80 drop-shadow" />
                      </div>
                    )}
                    {signedUrls[path] && !failedUrls.has(path) && (
                      <>
                        {!disabled && (
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center pointer-events-none">
                            <Eye className="h-3.5 w-3.5 text-white" />
                          </div>
                        )}
                        {!disabled && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCropTarget({ url: signedUrls[path], replaceManagerPath: path });
                            }}
                            title="Recortar (la original del encargado quedará desactivada)"
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary text-primary-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10 shadow"
                          >
                            <CropIcon className="h-2.5 w-2.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={togglingDisable === path}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleManagerDisabled(path, !disabled);
                          }}
                          title={disabled ? "Reactivar imagen" : "Desactivar (la IA la ignorará)"}
                          className={`absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full transition-opacity flex items-center justify-center z-10 shadow ${
                            disabled
                              ? 'bg-emerald-500 text-white opacity-100'
                              : 'bg-muted-foreground/80 text-background opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          {togglingDisable === path ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : disabled ? (
                            <Eye className="h-2.5 w-2.5" />
                          ) : (
                            <EyeOff className="h-2.5 w-2.5" />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <button key={i}
                    onClick={() => {
                      const url = signedUrls[path];
                      if (url) {
                        setFilePreview({ url, name: `Archivo ${i+1}` });
                      } else {
                        toast.info("Cargando archivo...");
                      }
                    }}
                    className="flex items-center gap-1.5 text-[11px] bg-muted/50 border border-border/50 rounded-lg px-2.5 py-1.5 hover:bg-muted transition-colors cursor-pointer">
                    {signedUrls[path] ? (
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                    <span className="text-muted-foreground">Archivo {i+1}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Admin additional images (upload zone) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Añadidas por admin</p>
            {adminPruebas.length > 0 && (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
              >
                <ImagePlus className="h-3 w-3" />
                Añadir más
              </button>
            )}
          </div>

          {adminPruebas.length === 0 ? (
            /* Empty state: big drop zone */
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-xl border-2 border-dashed border-border/60 hover:border-primary/60 bg-muted/20 hover:bg-primary/5 transition-all p-4 flex flex-col items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Paperclip className="h-5 w-5 text-muted-foreground" />
                  <p className="text-[11px] font-medium text-muted-foreground">Añadir archivos</p>
                  <p className="text-[10px] text-muted-foreground/70">Imágenes, vídeos, PDF, Office… los vídeos se comprimen automáticamente · Ctrl+V para pegar</p>
                </>
              )}
            </button>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {adminPruebas.map((path, i) => {
                const isImg = isImagePath(path);
                const isVid = isVideoPath(path);
                return (
                  <div key={i} className="relative group">
                    {isImg ? (
                      <EvidenceThumb path={path} label={`Admin ${i+1}`} borderClass="border-primary/30" />
                    ) : isVid ? (
                      <button
                        onClick={() => {
                          const url = signedUrls[path];
                          if (url) setFilePreview({ url, name: getFileName(path) });
                        }}
                        className="w-16 h-16 rounded-lg bg-muted/50 border border-primary/30 flex flex-col items-center justify-center gap-0.5 hover:ring-2 ring-primary/50 transition-all"
                      >
                        <Video className="h-4 w-4 text-primary" />
                        <span className="text-[8px] text-muted-foreground truncate max-w-[56px]">{getFileName(path).substring(0, 10)}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const url = signedUrls[path];
                          if (url) setFilePreview({ url, name: getFileName(path) });
                        }}
                        className="w-16 h-16 rounded-lg bg-muted/50 border border-primary/30 flex flex-col items-center justify-center gap-0.5 hover:ring-2 ring-primary/50 transition-all"
                      >
                        <File className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[8px] text-muted-foreground truncate max-w-[56px]">{getFileName(path).substring(0, 10)}</span>
                      </button>
                    )}
                    {removing !== path ? (
                      <button
                        onClick={() => handleRemoveAdmin(path)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    ) : (
                      <div className="absolute inset-0 bg-background/70 rounded-lg flex items-center justify-center">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </div>
                    )}
                    {isImg && signedUrls[path] && !failedUrls.has(path) && removing !== path && (
                      <>
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center pointer-events-none">
                          <Eye className="h-3.5 w-3.5 text-white" />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCropTarget({ url: signedUrls[path], replaceAdminPath: path });
                          }}
                          title="Recortar y reemplazar"
                          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-primary text-primary-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10 shadow"
                        >
                          <CropIcon className="h-2.5 w-2.5" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
              {/* Upload more tile */}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-16 h-16 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/50 bg-muted/20 hover:bg-muted/40 flex flex-col items-center justify-center gap-0.5 transition-all disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    <span className="text-[9px] text-muted-foreground">Añadir</span>
                  </>
                )}
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
        </div>
      </div>

      {uploading && uploadStatus && (
        <div className="flex items-center gap-2 text-[11px] text-primary px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          <span className="truncate">{uploadStatus}</span>
        </div>
      )}
      {/* AI context hint */}
      {totalFiles > 0 && (
        <p className="text-[10px] text-primary/70 flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          {totalFiles} archivo{totalFiles !== 1 ? 's' : ''} disponible{totalFiles !== 1 ? 's' : ''} para análisis IA al generar borrador o documento legal
        </p>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightbox(null)}>
            <X className="h-6 w-6" />
          </button>
          <img src={lightbox} alt="Prueba" className="max-w-full max-h-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* File preview dialog */}
      <Dialog open={!!filePreview} onOpenChange={(open) => !open && setFilePreview(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {filePreview?.name || 'Archivo'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border bg-white">
            {filePreview?.url && (
              <iframe
                src={filePreview.url}
                className="w-full h-[70vh]"
                title={filePreview.name}
              />
            )}
          </div>
          <DialogFooter className="flex-row gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (filePreview?.url) {
                  const a = document.createElement('a');
                  a.href = filePreview.url;
                  a.download = filePreview.name || 'archivo';
                  a.target = '_blank';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }
              }}
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Descargar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFilePreview(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Crop dialog */}
      {cropTarget && (
        <EvidenceCropDialog
          open={!!cropTarget}
          onOpenChange={(o) => { if (!o) setCropTarget(null); }}
          imageUrl={cropTarget.url}
          propuestaId={propuestaId}
          replaceAdminPath={cropTarget.replaceAdminPath}
          replaceManagerPath={cropTarget.replaceManagerPath}
          onUploaded={(urls, disabledManager) => {
            onAdminPruebasChange(urls);
            if (Array.isArray(disabledManager)) onDisabledManagerChange(disabledManager);
            setCropTarget(null);
          }}
        />
      )}

      {/* Manual collage builder */}
      <EvidenceCollageBuilder
        open={collageOpen}
        onOpenChange={setCollageOpen}
        propuestaId={propuestaId}
        imagePaths={[
          ...recordPruebas.filter((p) => isImagePath(p) && !isManagerDisabled(p)),
          ...adminPruebas.filter(isImagePath),
        ]}
        initialLayout={collageLayout as CollageLayout | null}
        onSaved={(layout) => onCollageLayoutChange(layout)}
      />
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export function AdminPropuestasTab() {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [propuestas, setPropuestas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState<string>("pendiente");
  const [expandedDrafts, setExpandedDrafts] = useState<Set<string>>(new Set());
  const [reviewedMap, setReviewedMap] = useState<Record<string, { reviewer: string; timestamp: string }>>({});

  // AI questions: answers map per propuesta { [propId]: { [questionIdx]: text } }
  const [aiAnswers, setAiAnswers] = useState<Record<string, Record<number, string>>>({});
  const [submittingAnswers, setSubmittingAnswers] = useState<string | null>(null);

  // Audit trail dialog
  const [auditTrailOpen, setAuditTrailOpen] = useState<string | null>(null);
  const [auditTrailLogs, setAuditTrailLogs] = useState<any[]>([]);
  const [auditTrailLoading, setAuditTrailLoading] = useState(false);

  // Merge selection state
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set());
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeContext, setMergeContext] = useState("");
  const [mergeTipo, setMergeTipo] = useState<'auto' | 'amonestacion' | 'sancion'>('auto');
  const [mergeSubmitting, setMergeSubmitting] = useState(false);

  // Persistencia de respuestas en sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('incidencias_ai_answers');
      if (raw) setAiAnswers(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem('incidencias_ai_answers', JSON.stringify(aiAnswers)); } catch {}
  }, [aiAnswers]);

  const handleAnswerAiQuestions = async (propuestaId: string, preguntas: any[]) => {
    const answersMap = aiAnswers[propuestaId] || {};
    // Bloquear si falta alguna pregunta requerida
    const requiredIdxs = preguntas
      .map((q: any, idx: number) => ({ idx, opcional: q?.opcional === true }))
      .filter(x => !x.opcional)
      .map(x => x.idx);
    const missing = requiredIdxs.filter(idx => !((answersMap[idx] || '').trim()));
    if (missing.length > 0) {
      toast.error(`Faltan ${missing.length} respuesta(s) requerida(s)`);
      return;
    }
    const respuestas = preguntas
      .map((q: any, idx: number) => ({ pregunta: q.pregunta, respuesta: (answersMap[idx] || '').trim() }))
      .filter(r => r.respuesta.length > 0);
    if (respuestas.length === 0) {
      toast.error("Responde al menos una pregunta");
      return;
    }
    setSubmittingAnswers(propuestaId);
    try {
      const { data, error } = await supabase.functions.invoke('incidencias-operations', {
        body: { action: 'answerAiQuestions', sessionToken, propuestaId, respuestas },
      });
      if (error) throw error;
      toast.success("Respuestas enviadas", { description: "La IA está reanalizando con la nueva información." });
      setAiAnswers(prev => { const n = { ...prev }; delete n[propuestaId]; return n; });
      if (data?.analysis) {
        setPropuestas(prev => prev.map(p => p.id === propuestaId
          ? { ...p, ai_analysis: data.analysis, necesita_aclaracion: false, preguntas_admin: null }
          : p));
      }
    } catch (e: any) {
      toast.error(e?.message || "No se pudo reanalizar");
    } finally {
      setSubmittingAnswers(null);
    }
  };

  // Helper: extraer worker_id robustamente (admite ambos formatos)
  const getPropWorkerId = (p: any): string | null => {
    if (!p) return null;
    if (Array.isArray(p.workers) && p.workers.length > 0) return p.workers[0].worker_id || null;
    const rw = p?.record?.incidencias_record_workers;
    if (Array.isArray(rw) && rw.length > 0) return rw[0].worker_id || null;
    return null;
  };

  const toggleMergeSelection = (propuesta: any) => {
    if (propuesta.estado !== 'pendiente' || propuesta.tipo === 'nspp') return;
    const workerId = getPropWorkerId(propuesta);
    setMergeSelection(prev => {
      const next = new Set(prev);
      if (next.has(propuesta.id)) {
        next.delete(propuesta.id);
        return next;
      }
      if (next.size > 0) {
        const firstId = [...next][0];
        const firstProp = propuestas.find(p => p.id === firstId);
        const firstWorker = getPropWorkerId(firstProp);
        if (firstWorker && workerId && firstWorker !== workerId) {
          toast.error("Solo se pueden fusionar propuestas del mismo trabajador");
          return prev;
        }
        // Nota: se permite mezclar tipos (amonestación + sanción) y departamentos.
        // La IA recalificará el conjunto en el merge según la complejidad global.
      }
      next.add(propuesta.id);
      return next;
    });
  };

  type MergeValidation = { ok: true } | { ok: false; reason: string };
  const validateMergeSelection = (): MergeValidation => {
    if (mergeSelection.size < 2) return { ok: false, reason: 'Selecciona al menos 2 propuestas' };
    const props = [...mergeSelection].map(id => propuestas.find(p => p.id === id)).filter(Boolean) as any[];
    if (props.length !== mergeSelection.size) return { ok: false, reason: 'Alguna propuesta ya no está disponible' };
    const w0 = getPropWorkerId(props[0]);
    if (!w0 || !props.every(p => getPropWorkerId(p) === w0)) return { ok: false, reason: 'Las propuestas son de trabajadores distintos' };
    // Se permite mezclar tipos y departamentos: la IA recalificará el conjunto.
    return { ok: true };
  };

  const openMergeModal = () => {
    const v = validateMergeSelection();
    if (v.ok === false) { toast.error(v.reason); return; }
    setMergeModalOpen(true);
  };

  const handleMergeProposals = async () => {
    const v = validateMergeSelection();
    if (v.ok === false) { toast.error(v.reason); return; }
    setMergeSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('incidencias-operations', {
        body: {
          action: 'mergeProposals',
          sessionToken,
          propuestaIds: [...mergeSelection],
          instrucciones_admin: mergeContext.trim() || null,
          tipo_esperado: mergeTipo,
        },
      });
      if (error) throw error;
      toast.success("Propuestas fusionadas", { description: "La IA está analizando el caso conjunto." });
      setMergeSelection(new Set());
      setMergeModalOpen(false);
      setMergeContext("");
      setMergeTipo('auto');
      window.location.reload();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo fusionar");
    } finally {
      setMergeSubmitting(false);
    }
  };

  const handleOpenAuditTrail = async (propuestaId: string) => {
    setAuditTrailOpen(propuestaId);
    setAuditTrailLogs([]);
    setAuditTrailLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('incidencias-operations', {
        body: { action: 'getPropuestaAuditTrail', sessionToken, propuestaId },
      });
      if (error) throw error;
      setAuditTrailLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar el historial");
    } finally {
      setAuditTrailLoading(false);
    }
  };

  // Editable email fields per propuesta
  const [emailSubjects, setEmailSubjects] = useState<Record<string, string>>({});
  const [emailBodies, setEmailBodies] = useState<Record<string, string>>({});

  // Editable gravedad per propuesta
  const [editableGravedad, setEditableGravedad] = useState<Record<string, string>>({});
  const [updatingGravedad, setUpdatingGravedad] = useState<string | null>(null);

  // Editable tipo per propuesta
  const [editableTipo, setEditableTipo] = useState<Record<string, string>>({});
  const [updatingTipo, setUpdatingTipo] = useState<string | null>(null);
  const [applyingReclass, setApplyingReclass] = useState<string | null>(null);

  // Admin pruebas per propuesta (local state for optimistic updates)
  const [adminPruebasMap, setAdminPruebasMap] = useState<Record<string, string[]>>({});
  const [disabledManagerPruebasMap, setDisabledManagerPruebasMap] = useState<Record<string, string[]>>({});
  const [collageLayoutMap, setCollageLayoutMap] = useState<Record<string, any | null>>({});
  const [selectedPropuestaId, setSelectedPropuestaId] = useState<string | null>(null);

  // Dialogs
  const [approveDialog, setApproveDialog] = useState<any>(null); // legacy state — kept harmless until full cleanup

  const [rejectDialog, setRejectDialog] = useState<any>(null);
  const [rejectMotivo, setRejectMotivo] = useState("");
   const [actionLoading, setActionLoading] = useState(false);
  const [resetConfirmId, setResetConfirmId] = useState<string | null>(null);
  const [dossierLoading, setDossierLoading] = useState<string | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState<string | null>(null);
  const [analyzingAI, setAnalyzingAI] = useState<string | null>(null);
  const [sendingNspp, setSendingNspp] = useState<string | null>(null);

  // AI Chat popup state
  const [aiChatOpen, setAiChatOpen] = useState<string | null>(null);
  const [aiChatMessages, setAiChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [reasoningLogOpen, setReasoningLogOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "listPropuestas",
          sessionToken,
          estado: filterEstado === 'all' ? undefined : filterEstado,
        },
      });
      const rawProps = data?.propuestas || [];
      // Trust the backend values for tipo/gravedad/suspension — they are the admin's
      // authoritative decision (manual edit overrides any AI recommendation).
      // Only fill missing fecha_inicio from the linked record as a UI convenience.
      const props = rawProps
        .filter((p: any) => p.estado !== 'fusionada')
        .map((p: any) => {
          const record = p.record || null;
          const effectiveFechaInicio = p.fecha_inicio || record?.propuesta_fecha_inicio || null;
          return effectiveFechaInicio === p.fecha_inicio ? p : { ...p, fecha_inicio: effectiveFechaInicio };
        });
      setPropuestas(props);
      const subjects: Record<string, string> = {};
      const bodies: Record<string, string> = {};
      const gravedades: Record<string, string> = {};
      const tipos: Record<string, string> = {};
      const adminPruebas: Record<string, string[]> = {};
      const disabledManager: Record<string, string[]> = {};
      for (const p of props) {
        if (p.email_subject) subjects[p.id] = p.email_subject;
        if (p.email_body) bodies[p.id] = p.email_body;
        gravedades[p.id] = p.gravedad;
        tipos[p.id] = p.tipo;
        adminPruebas[p.id] = Array.isArray(p.admin_pruebas_urls) ? p.admin_pruebas_urls : [];
        disabledManager[p.id] = Array.isArray(p.disabled_manager_pruebas) ? p.disabled_manager_pruebas : [];
      }
      setEmailSubjects(prev => ({ ...prev, ...subjects }));
      setEmailBodies(prev => ({ ...prev, ...bodies }));
      setEditableGravedad(prev => ({ ...prev, ...gravedades }));
      setEditableTipo(prev => ({ ...prev, ...tipos }));
      setAdminPruebasMap(prev => ({ ...prev, ...adminPruebas }));
      setDisabledManagerPruebasMap(prev => ({ ...prev, ...disabledManager }));
      // Auto-expand drafts that already have content
      const draftsWithContent = props.filter((p: any) => p.email_subject || p.email_body).map((p: any) => p.id);
      if (draftsWithContent.length > 0) {
        setExpandedDrafts(prev => {
          const next = new Set(prev);
          draftsWithContent.forEach((id: string) => next.add(id));
          return next;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, filterEstado]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-propuestas-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias_propuestas_rrhh' }, (payload: any) => {
        // Purga inmediata de propuestas marcadas como fusionada sin esperar al load()
        const newRow = (payload?.new || {}) as any;
        if (newRow && (newRow.estado === 'fusionada' || newRow.merged_into_id)) {
          setPropuestas(prev => prev.filter((p: any) => p.id !== newRow.id));
          setMergeSelection(prev => {
            if (!prev.has(newRow.id)) return prev;
            const next = new Set(prev); next.delete(newRow.id); return next;
          });
        }
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // Lista visible (defensa en profundidad: filtra fusionadas por si entran por realtime)
  const visiblePropuestas = useMemo(
    () => (propuestas || []).filter((p: any) => p?.estado !== 'fusionada' && !p?.merged_into_id),
    [propuestas]
  );

  // Reconciliar mergeSelection con visiblePropuestas
  useEffect(() => {
    setMergeSelection(prev => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(visiblePropuestas.map((p: any) => p.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visiblePropuestas]);

  const toggleDraft = (id: string) => {
    setExpandedDrafts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Auto-regenerate legal document whenever tipo/gravedad change, as long as
  // a document already exists for this propuesta. The new tipo/gravedad must
  // be reflected in the legal text — otherwise the document goes out of sync
  // with the admin's manual decision.
  const autoRegenerateLegalDoc = async (propuestaId: string) => {
    try {
      const { data: existingDocs } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getLegalDocuments", sessionToken, propuestaId },
      });
      if (existingDocs?.success && existingDocs.documents?.length > 0) {
        // Push the regeneration through the global FIFO queue so multiple
        // tipo/gravedad changes done in quick succession (or across several
        // proposals) don't trigger parallel backend calls. They run one
        // after the other automatically.
        toast.info("Regeneración encolada — se procesará automáticamente");
        enqueueLegalDocJob({
          key: propuestaId,
          label: "Regenerar tras cambio de tipo/gravedad",
          run: async () => {
            const { data: ev } = await supabase.functions.invoke("incidencias-operations", {
              body: { action: "getProposalEvidencePaths", sessionToken, propuestaId },
            });
            const videoPaths = filterVideoPaths(Array.isArray(ev?.videoPaths) ? ev.videoPaths : []);
            if (videoPaths.length > 0) {
              const preResult = await preprocessProposalVideos(propuestaId, videoPaths, String(ev?.descripcion || ""));
              if (preResult.totalFrames === 0) {
                throw new Error("No se pudieron extraer fotogramas reales del vídeo");
              }
            }
            const { data: regen } = await supabase.functions.invoke("incidencias-operations", {
              body: { action: "generateLegalDocument", sessionToken, propuestaId, force_regenerate: true },
            });
            if (regen?.success) {
              toast.success("Documento actualizado automáticamente");
            } else {
              toast.error("No se pudo regenerar el documento. Pulsa 'Regenerar' manualmente.");
              throw new Error(regen?.error || "regen_failed");
            }
          },
        });
      }
    } catch { /* silent — document will be out of sync but user can manually regenerate */ }
  };

  const handleChangeGravedad = async (propuestaId: string, newGravedad: string) => {
    const proposal = propuestas.find((p: any) => p.id === propuestaId);

    setEditableGravedad(prev => ({ ...prev, [propuestaId]: newGravedad }));
    setUpdatingGravedad(propuestaId);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "updatePropuestaGravedad", sessionToken, propuestaId, gravedad: newGravedad },
      });
      if (data?.success) {
        toast.success(`Gravedad actualizada a ${newGravedad === 'muy_grave' ? 'Muy grave' : newGravedad === 'grave' ? 'Grave' : 'Leve'}`);
        await autoRegenerateLegalDoc(propuestaId);
        load();
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error al cambiar gravedad"); }
    finally { setUpdatingGravedad(null); }
  };

  const handleApplyCategoryReclassification = async (propuestaId: string) => {
    setApplyingReclass(propuestaId);
    try {
      const { data, error } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "applyAiCategoryReclassification", sessionToken, propuestaId },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "Error al aplicar la reclasificación");
        return;
      }
      if (data.alreadyApplied) {
        toast.info("La categoría ya estaba aplicada");
      } else {
        toast.success(`Categoría aplicada: ${data.newCategory}${data.docsUpdated ? ` · Documento actualizado` : ''}`);
      }
      load();
    } catch {
      toast.error("Error al aplicar la reclasificación");
    } finally {
      setApplyingReclass(null);
    }
  };

  const handleChangeTipo = async (propuestaId: string, newTipo: string, gravedadOverride?: string, applyFullRecommendation?: boolean) => {
    const proposal = propuestas.find((p: any) => p.id === propuestaId);

    setEditableTipo(prev => ({ ...prev, [propuestaId]: newTipo }));
    setUpdatingTipo(propuestaId);
    try {
      if (applyFullRecommendation) {
        // Full apply: tipo + gravedad + suspension days/dates + auto-regenerate legal doc
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "applyAiRecommendationFull", sessionToken, propuestaId },
        });
        if (data?.success) {
          const applied = data.applied;
          const tipoLabel = applied.tipo === 'amonestacion' ? 'Amonestación' : `Sanción (${applied.gravedad === 'muy_grave' ? 'muy grave' : applied.gravedad})`;
          const susLabel = applied.suspension_dias ? ` · ${applied.suspension_dias}d suspensión` : '';
          const docLabel = data.document_generated ? ' · Documento regenerado' : '';
          toast.success(`Recomendación aplicada: ${tipoLabel}${susLabel}${docLabel}`);
          load();
        } else {
          toast.error(data?.error || "Error");
        }
      } else {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "updatePropuestaTipo", sessionToken, propuestaId, tipo: newTipo, gravedad: gravedadOverride || (newTipo === 'sancion' ? 'grave' : undefined) },
        });
        if (data?.success) {
          toast.success(`Tipo cambiado a ${newTipo === 'amonestacion' ? 'Amonestación' : 'Sanción'}`);
          await autoRegenerateLegalDoc(propuestaId);
          load();
        } else {
          toast.error(data?.error || "Error");
        }
      }
    } catch { toast.error("Error al cambiar tipo"); }
    finally { setUpdatingTipo(null); }
  };

  const handleApprove = async (propuestaArg?: any) => {
    const propuesta = propuestaArg || approveDialog;
    if (!propuesta) return;
    const isAmonestacion = propuesta.tipo === 'amonestacion';
    const isNspp = propuesta.tipo === 'nspp';
    // Tipicidad: toda medida disciplinaria (amonestación o sanción) debe estar
    // vinculada a un apartado del Art. 50 del convenio. NSPP queda excluido
    // (se rige por Art. 14.2 ET).
    if (!isNspp) {
      const arts1: any[] = Array.isArray(propuesta?.ai_analysis?.articulos_aplicables) ? propuesta.ai_analysis.articulos_aplicables : [];
      const arts2: any[] = Array.isArray(propuesta?.record?.ai_articulos_relevantes) ? propuesta.record.ai_articulos_relevantes : [];
      const hasArticulo =
        arts1.some((a) => typeof a === 'string' && a.trim().length > 0) ||
        arts2.some((a) => typeof a === 'string' && a.trim().length > 0) ||
        (typeof propuesta?.ai_analysis?.fundamentacion_legal === 'string' && propuesta.ai_analysis.fundamentacion_legal.trim().length > 0);
      if (!hasArticulo) {
        console.warn('[handleApprove] Missing legal reference', {
          id: propuesta?.id,
          hasAnalysis: !!propuesta?.ai_analysis,
          analysisKeys: propuesta?.ai_analysis ? Object.keys(propuesta.ai_analysis) : null,
          arts1, arts2,
        });
        toast.error('No se puede aprobar: falta la referencia legal (artículo del convenio). Ejecuta o revisa el análisis IA antes de aprobar.');
        return;
      }
    }
    // Audiencia previa: cuando la propuesta exige el trámite previo, no se
    // puede dictar la sanción definitiva hasta que se haya completado.
    // Solo aplica si la gravedad final sigue siendo "muy grave" — si el admin
    // la ha bajado a leve/grave, ya no es exigible legalmente.
    if (propuesta?.requiere_audiencia_previa && propuesta?.gravedad === 'muy_grave' && !propuesta?.audiencia_previa_completada_at) {
      toast.error('Falta el trámite de audiencia previa (5 días hábiles). Genera el pliego de cargos y márcalo como completado antes de aprobar.');
      return;
    }
    // Use values already saved on the propuesta — no extra dialog needed
    const finalGravedad = isAmonestacion ? null : (propuesta.gravedad || undefined);
    const finalDias = isAmonestacion
      ? null
      : (propuesta.sin_suspension_explicita === true ? 0 : (propuesta.suspension_dias ?? 0));
    setActionLoading(true);
    try {
      // Si va a haber aviso de suspensión por email, intentamos PRIMERO generar
      // el PDF borrador en el navegador y subirlo al storage para adjuntarlo.
      // Si la generación falla por cualquier motivo, NO bloqueamos la aprobación:
      // el backend asegurará un enlace online permanente al documento legal y
      // lo incluirá en el email como alternativa funcional.
      const willSendAviso = !isAmonestacion && !isNspp && (finalDias ?? 0) > 0;
      if (willSendAviso) {
        try {
          const { data: legalDocsResp } = await supabase.functions.invoke('incidencias-operations', {
            body: { action: 'getLegalDocuments', sessionToken, propuestaId: propuesta.id },
          });
          const activeLegalDoc = legalDocsResp?.success
            ? (legalDocsResp.documents || []).find((doc: any) => !doc.anulado) || legalDocsResp.documents?.[0]
            : null;
          const docHtml = activeLegalDoc?.html_content;
          if (!docHtml) {
            toast.warning('Sin documento legal generado: el email se enviará con enlace cuando esté disponible.');
          } else {
            toast.info('Preparando PDF para adjuntar al email…');
            try {
              const paginated = await paginateLegalDocument(docHtml, {});
              if (paginated.pages.length === 0) {
                throw new Error('Pagination produced 0 pages');
              }
              const slugName = (propuesta.worker_name || 'trabajador')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
              const fileName = `sancion-${slugName || 'trabajador'}-borrador.pdf`;
              const srcDoc = buildLegalPreviewSrcDoc(paginated, fileName, {
                fontDelta: Number(activeLegalDoc.font_delta || 0) || 0,
              });
              const { base64 } = await generateLegalPdfBase64FromSrcDoc(srcDoc, fileName);
              const { data: uploadData, error: uploadError } = await supabase.functions.invoke('incidencias-operations', {
                body: {
                  action: 'uploadDraftPdf',
                  sessionToken,
                  propuestaId: propuesta.id,
                  documentId: activeLegalDoc.id,
                  pdfBase64: base64,
                },
              });
              if (uploadError || !uploadData?.success) {
                throw new Error(uploadData?.error || uploadError?.message || 'upload failed');
              }
              toast.success('PDF preparado para el email.');
            } catch (pdfErr) {
              console.warn('PDF borrador no disponible, se enviará enlace online:', pdfErr);
              toast.info('No se pudo crear el PDF adjunto: el email incluirá un enlace permanente al documento online.');
            }
          }
        } catch (probeErr) {
          console.warn('No se pudo comprobar el documento legal antes de aprobar:', probeErr);
        }
      }

      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "approvePropuesta",
          sessionToken,
          propuestaId: propuesta.id,
          gravedad: finalGravedad,
          suspension_dias: finalDias,
        },
      });
      if (data?.success) {
        toast.success("Propuesta aprobada — pasa a Tareas pendiente de imprimir");
        setApproveDialog(null);
        // Remove from local list immediately (it moved to Tareas)
        setPropuestas(prev => prev.filter((p: any) => p.id !== propuesta.id));
        // Also refresh in background for draft regeneration
        setTimeout(() => load(), 4000);
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error"); }
    finally { setActionLoading(false); }
  };

  const handleGeneratePliego = async (propuestaId: string) => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('incidencias-operations', {
        body: { action: 'generatePliegoCargos', sessionToken, propuestaId },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || 'Error generando pliego');
        return;
      }
      toast.success(`Pliego de cargos generado · plazo de alegaciones hasta ${data.fecha_limite}`);
      const w = window.open('', '_blank');
      if (w && data.html) {
        w.document.write(data.html);
        w.document.close();
      }
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Error generando pliego');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkAudienciaCompleted = async (propuestaId: string) => {
    const notas = window.prompt('Notas sobre la audiencia previa (opcional):\n\n¿Presentó alegaciones el trabajador? ¿Resumen breve?');
    if (notas === null) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('incidencias-operations', {
        body: { action: 'markAudienciaPreviaCompleted', sessionToken, propuestaId, notas: notas.trim() || null },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || 'Error');
        return;
      }
      toast.success('Audiencia previa marcada como completada · ya puedes aprobar la sanción');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectDialog) return;
    setActionLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "rejectPropuesta",
          sessionToken,
          propuestaId: rejectDialog.id,
          motivo: rejectMotivo,
        },
      });
      if (data?.success) {
        toast.success("Propuesta rechazada");
        setRejectDialog(null);
        setRejectMotivo("");
        load();
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error"); }
    finally { setActionLoading(false); }
  };

  const handleSendEmail = async (propuestaId: string) => {
    // Save current edits first
    await handleSaveDraft(propuestaId, true);
    setActionLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "sendPropuestaEmail", sessionToken, propuestaId },
      });
      if (data?.success) {
        toast.success("Email enviado a RRHH");
        load();
      } else {
        toast.error(data?.error || "Error al enviar");
      }
    } catch { toast.error("Error al enviar email"); }
    finally { setActionLoading(false); }
  };

  const handleSendNsppDirect = async (p: any) => {
    setSendingNspp(p.id);
    try {
      const { data, error } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "sendNsppDirectEmail",
          sessionToken,
          propuestaId: p.id,
        },
      });
      if (error || !data?.success) throw new Error(data?.error || "Error al enviar");
      toast.success("Email NSPP enviado a RRHH ✓");
      load();
    } catch (err: any) {
      toast.error(err.message || "Error al enviar email NSPP");
    } finally {
      setSendingNspp(null);
    }
  };

  const handleResendEmail = async (propuestaId: string) => {
    setActionLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "resendPropuestaEmail", sessionToken, propuestaId },
      });
      if (data?.success) toast.success("Email reenviado a RRHH");
      else toast.error(data?.error || "Error al reenviar");
    } catch { toast.error("Error al reenviar email"); }
    finally { setActionLoading(false); }
  };

  const handleGenerateDraftV2 = async (propuestaId: string) => {
    const proposal = propuestas.find((p: any) => p.id === propuestaId);

    setGeneratingDraft(propuestaId);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "generateEmailDraftV2", sessionToken, propuestaId },
      });
      if (data?.success) {
        setEmailSubjects(prev => ({ ...prev, [propuestaId]: data.subject }));
        setEmailBodies(prev => ({ ...prev, [propuestaId]: data.body }));
        toast.success("Borrador generado por IA");
        // Auto-expand
        setExpandedDrafts(prev => new Set(prev).add(propuestaId));
      } else {
        toast.error(data?.error || "Error al generar borrador");
      }
    } catch { toast.error("Error"); }
    finally { setGeneratingDraft(null); }
  };

  const handleSaveDraft = async (propuestaId: string, silent = false) => {
    const proposal = propuestas.find((p: any) => p.id === propuestaId);

    setSavingDraft(propuestaId);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "updatePropuestaEmail",
          sessionToken,
          propuestaId,
          email_subject: emailSubjects[propuestaId] || '',
          email_body: emailBodies[propuestaId] || '',
        },
      });
      if (data?.success && !silent) {
        toast.success("Borrador guardado");
      } else if (!data?.success) {
        toast.error(data?.error || "Error");
      }
    } catch { if (!silent) toast.error("Error al guardar"); }
    finally { setSavingDraft(null); }
  };

  const handleGenerateDossier = async (propuestaId: string) => {
    setDossierLoading(propuestaId);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "exportProposalDossier", sessionToken, propuestaId },
      });
      if (!data?.success) { toast.error(data?.error || "Error"); return; }

      const p = data.propuesta;
      const r = data.record;
      const workers = (data.workers || []).map((w: any) => w.worker_name).join(', ');
      const gravedadLabels: Record<string, string> = { leve: 'Leve', grave: 'Grave', muy_grave: 'Muy grave' };

      const historyRows = (data.workerHistory || []).map((h: any) => `<tr>
        <td>${new Date(h.fecha).toLocaleDateString('es-ES')}</td>
        <td>${(h.incidencias_categories as any)?.name || '—'}</td>
        <td>${(h.incidencias_categories as any)?.gravedad || '—'}</td>
        <td>${(h.descripcion || '').substring(0, 100)}</td>
      </tr>`).join('');

      const pruebasHtml = (data.signedPruebas || []).map((sp: any, i: number) => {
        const isImage = sp.signed.match(/\.(jpg|jpeg|png|gif|webp)/i);
        return isImage
          ? `<div style="display:inline-block;margin:4px;"><img src="${sp.signed}" style="max-width:200px;max-height:150px;border-radius:8px;border:1px solid #ddd;" /></div>`
          : `<a href="${sp.signed}" target="_blank">📎 Archivo ${i + 1}</a><br>`;
      }).join('');

      const articulos = r?.ai_articulos_relevantes;
      const articulosHtml = Array.isArray(articulos) && articulos.length > 0
        ? `<div style="margin:12px 0;padding:12px;background:#f0f9e8;border-radius:8px;border-left:4px solid #93d600;"><strong>📜 Artículos convenio:</strong> ${articulos.join(', ')}</div>` : '';

      const corpStyles = `body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;max-width:900px;margin:0 auto;padding:24px}h1{border-bottom:3px solid #93d600;padding-bottom:8px;font-size:22px}h2{font-size:16px;margin-top:24px}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}th{background:#f5f5f5;text-align:left;padding:8px;border:1px solid #ddd}td{padding:8px;border:1px solid #ddd}.section{background:#f9f9f9;padding:12px;border-radius:8px;margin:8px 0}.footer{margin-top:32px;padding-top:12px;border-top:1px solid #ddd;font-size:11px;color:#999}@media print{body{padding:0}}`;

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dossier</title><style>${corpStyles}</style></head><body>
        <h1>📑 Dossier de Propuesta Disciplinaria</h1>
        <p style="color:#666">Generado: ${new Date().toLocaleString('es-ES')} · Confidencial</p>
        <table><tr><th>Trabajador(es)</th><td>${workers}</td></tr>
        <tr><th>Departamento</th><td>${data.department?.name || '—'}</td></tr>
        <tr><th>Tipo</th><td>${p?.tipo === 'amonestacion' ? 'Amonestación' : 'Sanción'}</td></tr>
        <tr><th>Gravedad</th><td>${gravedadLabels[p?.gravedad] || p?.gravedad}</td></tr>
        ${p?.suspension_dias ? `<tr><th>Días suspensión</th><td>${p.suspension_dias}</td></tr>` : ''}
        <tr><th>Fecha hechos</th><td>${r ? new Date(r.fecha).toLocaleDateString('es-ES') : '—'}</td></tr></table>
        <h2>Descripción</h2><div class="section">${r?.descripcion || '—'}</div>
        ${r?.ai_motivo_legal ? `<h2>Análisis IA</h2><div class="section" style="border-left:4px solid #93d600">${r.ai_motivo_legal}</div>` : ''}
        ${articulosHtml}
        ${pruebasHtml ? `<h2>Pruebas</h2><div>${pruebasHtml}</div>` : ''}
        ${historyRows ? `<h2>Historial previo</h2><table><thead><tr><th>Fecha</th><th>Categoría</th><th>Gravedad</th><th>Descripción</th></tr></thead><tbody>${historyRows}</tbody></table>` : ''}
        <div class="footer">Panel Producción · ${new Date().toLocaleDateString('es-ES')}</div>
      </body></html>`;

      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
      else { toast.error("No se pudo abrir ventana"); }
    } catch { toast.error("Error al generar dossier"); }
    finally { setDossierLoading(null); }
  };

  const handleMarkReviewed = async (propuestaId: string) => {
    setActionLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "markProposalReviewed", sessionToken, propuestaId },
      });
      if (data?.success) {
        toast.success("Marcado como revisado");
        setReviewedMap(prev => ({ ...prev, [propuestaId]: { reviewer: data.reviewer, timestamp: data.timestamp } }));
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error"); }
    finally { setActionLoading(false); }
  };

  const handleDeletePropuesta = async (propuestaId: string) => {
    if (!confirm("¿Eliminar esta propuesta? Esta acción no se puede deshacer.")) return;
    setActionLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "deletePropuesta", sessionToken, propuestaId },
      });
      if (data?.success) {
        toast.success("Propuesta eliminada");
        load();
      } else {
        toast.error(data?.error || "Error al eliminar");
      }
    } catch { toast.error("Error al eliminar"); }
    finally { setActionLoading(false); }
  };

  const [archiveDialog, setArchiveDialog] = useState<{ propuestaId: string } | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<any | null>(null);
  const [archiveMotivo, setArchiveMotivo] = useState("");
  const [archiveLoading, setArchiveLoading] = useState(false);

  const handleArchivePropuesta = async () => {
    if (!archiveDialog) return;
    setArchiveLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "archivePropuesta", sessionToken, propuestaId: archiveDialog.propuestaId, motivo: archiveMotivo.trim() || null },
      });
      if (data?.success) {
        toast.success("Propuesta archivada");
        setArchiveDialog(null);
        setArchiveMotivo("");
        load();
      } else {
        toast.error(data?.error || "Error al archivar");
      }
    } catch { toast.error("Error al archivar"); }
    finally { setArchiveLoading(false); }
  };

  const [resetSteps, setResetSteps] = useState<{ propuestaId: string; currentStep: number; steps: string[]; done: boolean } | null>(null);

  const handleResetPropuesta = async (propuestaId: string) => {
    setResetConfirmId(null);
    const steps = [
      "Eliminando documento legal…",
      "Limpiando tareas de firma…",
      "Restableciendo análisis IA…",
      "Limpiando tipo y gravedad…",
      "Limpiando días de suspensión…",
      "Finalizando restablecimiento…",
    ];
    setResetSteps({ propuestaId, currentStep: 0, steps, done: false });

    // Animate steps while the backend processes
    const stepInterval = setInterval(() => {
      setResetSteps(prev => {
        if (!prev || prev.done) { clearInterval(stepInterval); return prev; }
        const next = prev.currentStep + 1;
        if (next >= prev.steps.length) return prev; // wait for backend
        return { ...prev, currentStep: next };
      });
    }, 600);

    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "resetPropuesta", sessionToken, propuestaId },
      });
      clearInterval(stepInterval);
      if (data?.success) {
        // Show all steps as done
        setResetSteps(prev => prev ? { ...prev, currentStep: steps.length - 1, done: true } : null);
        await new Promise(r => setTimeout(r, 800));
        setResetSteps(null);
        toast.success("Propuesta restablecida — lanza un nuevo análisis IA");
        load();
      } else {
        setResetSteps(null);
        toast.error(data?.error || "Error al restablecer");
      }
    } catch (error: any) {
      clearInterval(stepInterval);
      setResetSteps(null);
      toast.error(error?.message || "Error al restablecer");
    }
  };

  const handleAnalyzeWithAI = async (propuestaId: string, customInstructions?: string, useLiteModel?: boolean) => {
    setAnalyzingAI(propuestaId);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "analyzeProposal", sessionToken, propuestaId, instrucciones_usuario: customInstructions || undefined, use_lite_model: useLiteModel || false },
      });

      if (data?.success && data.analysis) {
        setPropuestas(prev => prev.map(p => p.id === propuestaId ? { ...p, ai_analysis: data.analysis } : p));
        toast.success("Análisis IA completado");
        await load();
        setTimeout(() => { void load(); }, 3500);
      } else if (data?.success && data.queued) {
        toast.info(data.message || "La IA está ocupada. Reintentando automáticamente...");
        void (async () => {
          for (const waitMs of [10000, 20000, 35000]) {
            await new Promise(resolve => setTimeout(resolve, waitMs));
            try {
              const { data: refreshed } = await supabase
                .from('incidencias_propuestas_rrhh')
                .select('ai_analysis, email_subject, email_body, email_html, ai_borrador_generado, suspension_dias')
                .eq('id', propuestaId)
                .single();

              if (refreshed?.ai_analysis) {
                setPropuestas(prev => prev.map(p => p.id === propuestaId ? { ...p, ...refreshed } : p));
                toast.success("Análisis IA completado");
                await load();
                setTimeout(() => { void load(); }, 3500);
                return;
              }
            } catch {
              // seguimos intentando en segundo plano
            }
          }
        })();
      } else {
        toast.error(data?.error || "Error en análisis IA");
      }
    } catch {
      toast.error("Error al analizar con IA");
    } finally {
      setAnalyzingAI(null);
    }
  };

  const handleOpenAiChat = async (propuestaId: string) => {
    setAiChatOpen(propuestaId);
    setAiChatMessages([]);
    setAiChatInput('');
    // Load persisted chat history
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "loadChatHistory", sessionToken, propuestaId },
      });
      if (data?.success && Array.isArray(data.messages) && data.messages.length > 0) {
        setAiChatMessages(data.messages);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
      }
    } catch { /* non-critical, start fresh */ }
  };

  const handleSendChatMessage = async () => {
    if (!aiChatOpen || !aiChatInput.trim() || aiChatLoading) return;
    const userMsg = aiChatInput.trim();
    const newMessages = [...aiChatMessages, { role: 'user' as const, content: userMsg }];
    setAiChatMessages(newMessages);
    setAiChatInput('');
    setAiChatLoading(true);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "chatProposal", sessionToken, propuestaId: aiChatOpen, messages: [{ role: 'user', content: userMsg }] },
      });
      if (data?.success && data.reply) {
        setAiChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

        // If AI changed its opinion, auto-trigger re-analysis
        if (data.cambio_opinion) {
          toast.info("La IA ha cambiado de opinión. Re-analizando...");
          const propId = aiChatOpen;
          // Build full conversation for re-analysis
          const allMsgs = [...newMessages, { role: 'assistant' as const, content: data.reply }];
          const fullConversation = allMsgs.map(m => `[${m.role === 'user' ? 'Usuario' : 'IA'}]: ${m.content}`).join('\n\n');
          setAiChatOpen(null);
          await handleAnalyzeWithAI(propId, fullConversation, true);
        }
      } else {
        toast.error(data?.error || "Error en respuesta IA");
      }
    } catch { toast.error("Error al comunicar con la IA"); }
    finally { setAiChatLoading(false); }
  };

  const handleApplyReanalysis = async () => {
    if (!aiChatOpen || aiChatMessages.length === 0) return;
    const fullConversation = aiChatMessages.map(m => `[${m.role === 'user' ? 'Usuario' : 'IA'}]: ${m.content}`).join('\n\n');
    const propId = aiChatOpen;
    setAiChatOpen(null);
    await handleAnalyzeWithAI(propId, fullConversation, true);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">Propuestas de sanción y amonestación</p>
        <Select value={filterEstado} onValueChange={v => { setFilterEstado(v); setLoading(true); }}>
          <SelectTrigger className="w-[160px] h-9 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendiente">Pendientes</SelectItem>
            <SelectItem value="aprobada">Aprobadas</SelectItem>
            <SelectItem value="enviada">Enviadas</SelectItem>
            <SelectItem value="rechazada">Rechazadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visiblePropuestas.length === 0 ? (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-12 flex flex-col items-center justify-center text-center">
            <Scale className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No hay propuestas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visiblePropuestas.map((p: any) => {
            const isNspp = p.tipo === 'nspp';
            const hasAiAnalysisBase = !!p.ai_analysis;
            const currentTipo = editableTipo[p.id] || p.tipo;
            const currentGravedad = editableGravedad[p.id] || p.gravedad;
            const gColor = isNspp ? '#f59e0b' : (gravedadColors[currentGravedad] || '#93d600');
            const eColor = estadoColors[p.estado] || '#999';
            // For NSPP: use nspp_worker_name directly
            const workersList: { name: string; number: string | null }[] = isNspp
              ? [{ name: p.nspp_worker_name || '—', number: p.nspp_worker_number || null }]
              : (p.workers || []).map((w: any) => ({ name: w.worker_name, number: w.worker_number }));
            const workers = workersList.map(w => w.name).join(', ') || '—';
            const record = isNspp ? {} : (p.record || {});
            const hasAiAnalysis = hasAiAnalysisBase || !!record.ai_motivo_legal || !!record.ai_tipo_razonamiento;
            const riesgo = record.ai_riesgo_reincidencia;
            const isDraftExpanded = expandedDrafts.has(p.id);
            const hasEmailDraft = !!(emailSubjects[p.id] || emailBodies[p.id]);
            const aiTipoRecomendado = p.ai_analysis?.tipo_recomendado || record.ai_tipo_recomendado;
            const aiTipoRazonamiento = p.ai_analysis?.justificacion_cambio || record.ai_tipo_razonamiento;
            const aiGravedadRecomendada = p.ai_analysis?.gravedad_recomendada || record.ai_gravedad_recomendada;
            const aiDiasRecomendados = p.ai_analysis?.dias_suspension_recomendados ?? record.ai_dias_suspension_sugeridos ?? null;
            // Mismatch detection: solo marcamos divergencia REAL de tipo/gravedad
            // entre la IA y la decisión administrativa. Los días de suspensión NO
            // se consideran mismatch — el admin puede legítimamente reducirlos a 0
            // (atenuación empresarial / facultad de moderación, Art. 58 ET).
            const tipoMismatch = !isNspp && !!aiTipoRecomendado && (
              aiTipoRecomendado !== currentTipo ||
              (aiTipoRecomendado === 'sancion' && !!aiGravedadRecomendada && aiGravedadRecomendada !== currentGravedad)
            );
            return (
              <Card
                key={p.id}
                onClick={() => setSelectedPropuestaId(p.id)}
                className={cn(
                  "rounded-2xl border-border/50 transition-all cursor-default",
                  isNspp && "border-amber-500/30 bg-amber-500/5",
                  selectedPropuestaId === p.id && "ring-1 ring-primary/40 ring-offset-0"
                )}
              >
                <CardContent className="p-5 space-y-3">
                  {/* === HEADER === */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* NSPP badge */}
                      {isNspp && (
                        <Badge className="text-[10px] px-2.5 py-0.5 mb-2 gap-1 font-semibold" style={{ backgroundColor: '#f59e0b20', color: '#c45a00', borderColor: '#f59e0b50' }}>
                          <Clock className="h-3 w-3" />
                          No Supera Periodo de Prueba
                        </Badge>
                      )}
                      <p className="text-sm font-semibold truncate">
                        {workersList.length > 0 ? workersList.map((w, i) => (
                          <span key={i}>
                            {i > 0 && ', '}
                            {w.number ? (
                              <a href={`https://salix.verdnatura.es/#/worker/${w.number}/time-control`} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">{w.name}</a>
                            ) : w.name}
                          </span>
                        )) : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.department_name}
                        {!isNspp && record.incidencias_categories && <> · {record.incidencias_categories.name}{record.custom_category_name && ` — ${record.custom_category_name}`}</>}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {isNspp
                          ? <>Encargado: {p.nspp_encargado_name || '—'} · {p.created_at ? formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: es }) : '—'}</>
                          : <>Por: {record.created_by_name || '—'} · {p.created_at ? formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: es }) : '—'}</>
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isNspp && p.estado === 'pendiente' && (() => {
                        const firstSelectedId = mergeSelection.size > 0 ? [...mergeSelection][0] : null;
                        const firstSelected = firstSelectedId ? propuestas.find(pp => pp.id === firstSelectedId) : null;
                        const isSelected = mergeSelection.has(p.id);
                        let incompatReason: string | null = null;
                        if (!isSelected && firstSelected && firstSelected.id !== p.id) {
                          if (getPropWorkerId(firstSelected) !== getPropWorkerId(p)) incompatReason = 'Trabajador distinto';
                        }
                        const disabled = !!incompatReason;
                        const checkbox = (
                          <div onClick={(e) => e.stopPropagation()} className={cn("flex items-center", disabled && "opacity-40")}>
                            <Checkbox
                              checked={isSelected}
                              disabled={disabled}
                              onCheckedChange={() => toggleMergeSelection(p)}
                              aria-label="Seleccionar para fusionar"
                            />
                          </div>
                        );
                        return incompatReason ? (
                          <TooltipProvider><Tooltip><TooltipTrigger asChild>{checkbox}</TooltipTrigger><TooltipContent side="left" className="text-xs">No se puede fusionar: {incompatReason}</TooltipContent></Tooltip></TooltipProvider>
                        ) : checkbox;
                      })()}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={(e) => { e.stopPropagation(); handleOpenAuditTrail(p.id); }}
                              aria-label="Historial de decisiones"
                            >
                              <History className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">Historial de decisiones</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Badge className="text-[10px] px-2 py-0" style={{ backgroundColor: eColor + '20', color: eColor }}>
                        {estadoLabels[p.estado] || p.estado}
                      </Badge>
                    </div>
                  </div>

                  {/* === Panel preguntas IA (necesita aclaración) === */}
                  {p.necesita_aclaracion && Array.isArray(p.preguntas_admin) && p.preguntas_admin.length > 0 && (() => {
                    const preguntas = p.preguntas_admin as any[];
                    const requiredIdxs = preguntas.map((q, i) => ({ q, i })).filter(x => x.q?.opcional !== true).map(x => x.i);
                    const totalReq = requiredIdxs.length;
                    const answeredReq = requiredIdxs.filter(i => ((aiAnswers[p.id]?.[i] || '').trim().length > 0)).length;
                    const allRequiredAnswered = answeredReq >= totalReq;
                    const isSubmitting = submittingAnswers === p.id;
                    return (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "relative rounded-xl border border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-800/40 p-4 space-y-3 transition-opacity",
                          isSubmitting && "pointer-events-none opacity-60"
                        )}
                      >
                        {isSubmitting && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-amber-50/70 dark:bg-amber-950/40 backdrop-blur-sm">
                            <div className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-200">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              La IA está reanalizando con tus respuestas…
                            </div>
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                              La IA necesita aclaraciones antes de calificar definitivamente
                            </p>
                            <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                              Responde para que pueda emitir una recomendación rigurosa (especialmente en muy graves).
                            </p>
                          </div>
                        </div>
                        <div className="space-y-2.5">
                          {preguntas.map((q: any, idx: number) => {
                            const isRequired = q?.opcional !== true;
                            const isAnswered = (aiAnswers[p.id]?.[idx] || '').trim().length > 0;
                            return (
                              <div key={idx} className="space-y-1">
                                <Label className="text-xs font-medium flex items-start gap-1.5">
                                  <span className="flex-1">
                                    {q.pregunta}
                                    {isRequired && <span className="text-amber-700 dark:text-amber-400 ml-0.5">*</span>}
                                    {q.motivo && (
                                      <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
                                        {q.motivo}
                                      </span>
                                    )}
                                  </span>
                                  {isAnswered && <Check className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />}
                                </Label>
                                <Textarea
                                  value={aiAnswers[p.id]?.[idx] || ''}
                                  onChange={(e) =>
                                    setAiAnswers(prev => ({
                                      ...prev,
                                      [p.id]: { ...(prev[p.id] || {}), [idx]: e.target.value },
                                    }))
                                  }
                                  placeholder="Tu respuesta…"
                                  className="min-h-[60px] text-xs"
                                  disabled={isSubmitting}
                                />
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            {answeredReq} de {totalReq} respondida{totalReq === 1 ? '' : 's'}
                            {!allRequiredAnswered && <span className="text-amber-700 dark:text-amber-400"> · faltan {totalReq - answeredReq}</span>}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => handleAnswerAiQuestions(p.id, preguntas)}
                            disabled={isSubmitting || !allRequiredAnswered}
                            className="h-8 text-xs"
                          >
                            {isSubmitting ? (
                              <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Reanalizando…</>
                            ) : (
                              <><Sparkles className="h-3 w-3 mr-1.5" /> Enviar respuestas y reanalizar</>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* NSPP info block */}
                  {isNspp && (
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 p-3 space-y-2">
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {p.nspp_start_contract_date && (
                          <span>📅 Contrato desde: <strong>{new Date(p.nspp_start_contract_date).toLocaleDateString('es-ES')}</strong></span>
                        )}
                        {p.nspp_days_remaining != null && (
                          <span>⏱️ Días restantes P.P.: <strong className="text-amber-600 dark:text-amber-400">{p.nspp_days_remaining}</strong></span>
                        )}
                      </div>
                      {p.nspp_justificacion && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Justificación del encargado</p>
                          <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{p.nspp_justificacion}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tipo + Gravedad row — hide for NSPP */}
                  {!isNspp && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select value={currentTipo} onValueChange={v => handleChangeTipo(p.id, v)} disabled={!hasAiAnalysis || updatingTipo === p.id}>
                        <SelectTrigger className="h-6 w-auto min-w-[120px] rounded-lg text-[10px] px-2 py-0 border-0" style={{ backgroundColor: currentTipo === 'sancion' ? '#ef444420' : '#3b82f620', color: currentTipo === 'sancion' ? '#ef4444' : '#3b82f6' }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="amonestacion">Amonestación</SelectItem>
                          <SelectItem value="sancion">Sanción</SelectItem>
                        </SelectContent>
                      </Select>
                      {currentTipo !== 'amonestacion' && (
                        <Select value={currentGravedad} onValueChange={v => handleChangeGravedad(p.id, v)} disabled={!hasAiAnalysis || updatingGravedad === p.id}>
                          <SelectTrigger className="h-6 w-auto min-w-[100px] rounded-lg text-[10px] px-2 py-0 border-0" style={{ backgroundColor: gColor + '20', color: gColor }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="leve">Leve</SelectItem>
                            <SelectItem value="grave">Grave</SelectItem>
                            <SelectItem value="muy_grave">Muy grave</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}

                  {!isNspp && currentTipo === 'sancion' && (
                    hasAiAnalysis ? (
                      <SuspensionCalendarPicker
                        propuestaId={p.id}
                        gravedad={currentGravedad}
                        currentDias={p.suspension_dias || 0}
                        currentFechaInicio={p.fecha_inicio || record.propuesta_fecha_inicio || null}
                        currentFechas={Array.isArray(p.suspension_fechas) ? p.suspension_fechas : null}
                        currentSinSuspensionExplicita={p.sin_suspension_explicita === true}
                        propuestaEstado={p.estado}
                        onUpdated={load}
                      />
                    ) : (
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80">
                        <AlertCircle className="h-3 w-3" />
                        Los días de suspensión se desbloquean tras el análisis IA.
                      </div>
                    )
                  )}

                  {/* Incident details: description, date, time */}
                  {!isNspp && (record.descripcion || record.fecha) && (
                    <div className="rounded-xl bg-muted/50 border border-border/40 p-3 space-y-1.5">
                      {record.fecha && (() => {
                        const d = new Date(record.fecha);
                        const isValid = !isNaN(d.getTime());
                        return isValid ? (
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span>📅 {d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                          </div>
                        ) : null;
                      })()}
                      {record.descripcion && (
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{record.descripcion}</p>
                      )}
                      {record.accion_propuesta && record.accion_propuesta !== 'sin_accion' && (
                        <p className="text-[10px] text-muted-foreground">
                          Acción propuesta por encargado: <strong>{{
                            amonestacion: 'Amonestación',
                            amonestacion_escrita: 'Amonestación escrita',
                            sancion: 'Sanción',
                            despido: 'Despido',
                          }[record.accion_propuesta as string] || record.accion_propuesta}</strong>
                          {record.accion_propuesta === 'sancion' && (record.propuesta_suspension
                            ? <> · <strong className="text-amber-600 dark:text-amber-400">Con suspensión de empleo y sueldo</strong></>
                            : <> · <strong className="text-muted-foreground">Sin suspensión de empleo y sueldo</strong></>
                          )}
                          {record.propuesta_fecha_inicio && <> · Inicio propuesto: <strong>{new Date(record.propuesta_fecha_inicio).toLocaleDateString('es-ES')}</strong></>}
                          {p.suspension_dias != null && p.suspension_dias > 0 && <> · <strong>{p.suspension_dias} días (IA)</strong></>}
                        </p>
                      )}
                    </div>
                  )}

                  {/* AI Type Recommendation Banner */}
                  {tipoMismatch && p.estado === 'pendiente' && (
                    <div className={`text-xs rounded-xl p-3 space-y-2 border ${aiTipoRecomendado === 'sancion' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
                      <div className="flex items-start gap-2">
                        <Sparkles className={`h-4 w-4 mt-0.5 shrink-0 ${aiTipoRecomendado === 'sancion' ? 'text-amber-500' : 'text-blue-500'}`} />
                        <div className="space-y-1 flex-1">
                          <p className="font-medium">
                            {aiTipoRecomendado === 'sancion'
                              ? `La IA recomienda sanción${aiGravedadRecomendada ? ` (${aiGravedadRecomendada === 'muy_grave' ? 'muy grave' : aiGravedadRecomendada})` : ''}`
                              : 'La IA considera que una amonestación sería suficiente'}
                          </p>
                          {aiTipoRazonamiento && <p className="text-muted-foreground">{aiTipoRazonamiento}</p>}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="h-6 rounded-lg text-[10px] gap-1"
                        onClick={() => handleChangeTipo(p.id, aiTipoRecomendado, aiGravedadRecomendada || undefined, true)}
                        disabled={updatingTipo === p.id}
                      >
                        {updatingTipo === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        {aiTipoRecomendado === 'sancion'
                          ? `Cambiar a sanción${aiGravedadRecomendada ? ` ${aiGravedadRecomendada === 'muy_grave' ? 'muy grave' : aiGravedadRecomendada}` : ''}`
                          : 'Cambiar a amonestación'}
                      </Button>
                    </div>
                  )}

                  {/* Risk bar */}
                  {typeof riesgo === 'number' && riesgo > 0 && (
                    <div className="mt-1">
                      <RiskBar value={riesgo} />
                    </div>
                  )}

                  {/* === DETAIL SECTIONS === */}
                  {isNspp ? (
                    /* NSPP: Direct send email section — no AI analysis, no draft editor */
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                        <Send className="h-4 w-4" />
                        Enviar solicitud NSPP a RRHH
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Se enviará un email con el formato estándar de NSPP incluyendo los datos del trabajador, la justificación del encargado y la referencia al Art. 14.2 ET.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-8 rounded-xl gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                          onClick={() => handleSendNsppDirect(p)}
                          disabled={sendingNspp === p.id || p.estado === 'enviada'}
                        >
                          {sendingNspp === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          {sendingNspp === p.id ? 'Enviando...' : p.estado === 'enviada' ? 'Enviado ✓' : 'Enviar a RRHH'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {/* 1. Análisis IA — always visible */}
                    <div className="text-xs rounded-xl p-3 space-y-3 bg-muted/10 border border-border/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Brain className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="font-medium">Análisis IA</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 rounded-lg text-[10px] gap-1"
                            onClick={() => handleOpenAiChat(p.id)}
                            disabled={analyzingAI === p.id}
                          >
                            <MessageSquare className="h-3 w-3" />
                            Consultar IA
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 rounded-lg text-[10px] gap-1"
                            onClick={() => handleAnalyzeWithAI(p.id)}
                            disabled={analyzingAI === p.id}
                          >
                            {analyzingAI === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            Re-analizar
                          </Button>
                        </div>
                      </div>

                      {p.ai_analysis ? (
                        <div className="space-y-3">
                          {/* Executive summary */}
                          <p className="font-medium text-foreground leading-relaxed">{p.ai_analysis.resumen_ejecutivo}</p>

                          {/* Recommendation badges */}
                          <div className="flex flex-wrap gap-2">
                            {p.ai_analysis.tipo_recomendado && (
                              <div className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold ${
                                p.ai_analysis.tipo_recomendado === 'sancion'
                                  ? 'bg-destructive/15 text-destructive border border-destructive/30'
                                  : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                              }`}>
                                <Scale className="h-3.5 w-3.5" />
                                {p.ai_analysis.tipo_recomendado === 'sancion'
                                  ? `Sanción${p.ai_analysis.gravedad_recomendada ? ` (${p.ai_analysis.gravedad_recomendada === 'muy_grave' ? 'muy grave' : p.ai_analysis.gravedad_recomendada})` : ''}`
                                  : 'Amonestación'}
                              </div>
                            )}
                            {p.ai_analysis.dias_suspension_recomendados > 0 && (
                              <Badge variant="outline" className="text-[10px]">{p.ai_analysis.dias_suspension_recomendados}d suspensión</Badge>
                            )}
                            <div className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${
                              p.ai_analysis.riesgo_empresa === 'critico' ? 'bg-red-500/15 text-red-600 border border-red-500/30'
                              : p.ai_analysis.riesgo_empresa === 'alto' ? 'bg-amber-500/15 text-amber-600 border border-amber-500/30'
                              : p.ai_analysis.riesgo_empresa === 'medio' ? 'bg-yellow-500/15 text-yellow-600 border border-yellow-500/30'
                              : 'bg-primary/10 text-primary border border-primary/30'
                            }`}>
                              <ShieldAlert className="h-3 w-3" />
                              Riesgo: {p.ai_analysis.riesgo_empresa}
                            </div>
                          </div>

                          {/* Audiencia previa workflow (faltas muy graves) */}
                          {p.requiere_audiencia_previa && currentGravedad === 'muy_grave' && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-2">
                              <div className="flex items-center gap-2">
                                <Gavel className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                  Audiencia previa requerida (5 días hábiles)
                                </span>
                                {p.audiencia_previa_completada_at && (
                                  <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">
                                    <Check className="h-2.5 w-2.5 mr-0.5" />Completada
                                  </Badge>
                                )}
                              </div>
                              {p.ai_analysis?.cita_advertencia_previa && (
                                <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                                  «{p.ai_analysis.cita_advertencia_previa}»
                                </p>
                              )}
                              {p.estado === 'pendiente' && (
                                <div className="flex flex-wrap gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 rounded-lg text-[10px] gap-1 border-amber-500/40"
                                    onClick={() => handleGeneratePliego(p.id)}
                                    disabled={actionLoading}
                                  >
                                    <FileText className="h-3 w-3" />
                                    {p.pliego_cargos_generado_at ? 'Regenerar pliego de cargos' : 'Generar pliego de cargos'}
                                  </Button>
                                  {!p.audiencia_previa_completada_at && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 rounded-lg text-[10px] gap-1"
                                      onClick={() => handleMarkAudienciaCompleted(p.id)}
                                      disabled={actionLoading || !p.pliego_cargos_generado_at}
                                    >
                                      <Check className="h-3 w-3" />
                                      Marcar audiencia completada
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Reclasificación a muy grave por advertencia previa (Vía B) */}
                          {p.ai_analysis?.via_escalado_aplicada === 'B' && p.ai_analysis?.gravedad_recomendada === 'muy_grave' && currentGravedad !== 'muy_grave' && p.estado === 'pendiente' && (
                            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                                <span className="text-[11px] font-semibold text-destructive">
                                  Reclasificable a MUY GRAVE — Art. 50.3.a (advertencia previa)
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground leading-relaxed">
                                La IA ha detectado una amonestación previa documentada por hechos análogos. Aceptando la reclasificación se activará el trámite de audiencia previa.
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 rounded-lg text-[10px] gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                                onClick={() => handleChangeTipo(p.id, 'sancion', 'muy_grave', true)}
                                disabled={updatingTipo === p.id}
                              >
                                {updatingTipo === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Aceptar reclasificación a muy grave
                              </Button>
                            </div>
                          )}

                          {/* Apply recommendation button if different from current */}
                          {(p.ai_analysis.tipo_recomendado !== currentTipo || (p.ai_analysis.gravedad_recomendada && p.ai_analysis.gravedad_recomendada !== currentGravedad)) && p.estado === 'pendiente' && !(p.ai_analysis?.via_escalado_aplicada === 'B' && p.ai_analysis?.gravedad_recomendada === 'muy_grave') && (
                            <Button size="sm" variant="outline" className="h-6 rounded-lg text-[10px] gap-1"
                              onClick={() => handleChangeTipo(p.id, p.ai_analysis.tipo_recomendado, p.ai_analysis.gravedad_recomendada || undefined, true)}
                              disabled={updatingTipo === p.id}
                            >
                              {updatingTipo === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              Aplicar recomendación IA
                            </Button>
                          )}


                          {/* Detailed sections */}
                          <Collapsible>
                            <CollapsibleTrigger asChild>
                              <button className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors">
                                <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
                                Ver análisis completo
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="mt-2 space-y-2.5 text-muted-foreground leading-relaxed">
                                <div>
                                  <p className="font-medium text-foreground text-[11px] mb-0.5">Valoración de los hechos</p>
                                  <p>{p.ai_analysis.valoracion_hechos}</p>
                                </div>
                                <div>
                                  <p className="font-medium text-foreground text-[11px] mb-0.5">Fundamentación legal</p>
                                  <p>{p.ai_analysis.fundamentacion_legal}</p>
                                </div>
                                {p.ai_analysis.articulos_aplicables?.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {p.ai_analysis.articulos_aplicables.map((art: string, i: number) => (
                                      <Badge key={i} variant="outline" className="text-[10px] px-2 py-0.5 font-normal">Art. {art}</Badge>
                                    ))}
                                  </div>
                                )}
                                <div>
                                  <p className="font-medium text-foreground text-[11px] mb-0.5">Justificación tipo/gravedad</p>
                                  <p>{p.ai_analysis.justificacion_cambio}</p>
                                </div>
                                {p.ai_analysis.justificacion_dias_suspension && (
                                  <div>
                                    <p className="font-medium text-foreground text-[11px] mb-0.5">Justificación días de suspensión</p>
                                    <p>{p.ai_analysis.justificacion_dias_suspension}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="font-medium text-foreground text-[11px] mb-0.5">Evaluación de reincidencia</p>
                                  <p>{p.ai_analysis.evaluacion_reincidencia}</p>
                                </div>
                                {p.ai_analysis.analisis_pruebas && (
                                  <div>
                                    <p className="font-medium text-foreground text-[11px] mb-0.5">Análisis de pruebas</p>
                                    <p>{p.ai_analysis.analisis_pruebas}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="font-medium text-foreground text-[11px] mb-0.5">Riesgo para la empresa</p>
                                  <p>{p.ai_analysis.riesgo_detalle}</p>
                                </div>
                                {p.ai_analysis.acciones_recomendadas?.length > 0 && (
                                  <div>
                                    <p className="font-medium text-foreground text-[11px] mb-0.5">Acciones recomendadas</p>
                                    <ul className="list-disc list-inside space-y-0.5">
                                      {p.ai_analysis.acciones_recomendadas.map((a: string, i: number) => (
                                        <li key={i}>{a}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>

                          {/* AI Reasoning Log button */}
                          {Array.isArray(p.ai_reasoning_log) && p.ai_reasoning_log.length > 0 && (
                            <button
                              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                              onClick={() => setReasoningLogOpen(p.id)}
                            >
                              <GitBranch className="h-3 w-3" />
                              Trazabilidad IA ({p.ai_reasoning_log.length})
                            </button>
                          )}

                          {/* Category reclassification badge */}
                          {p.ai_analysis.categoria_sugerida && p.ai_analysis.categoria_sugerida !== (record?.incidencias_categories?.name || '') && (
                            <div className="inline-flex items-center gap-1.5">
                              <div className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                                <ArrowRight className="h-3 w-3" />
                                Categoría reclasificada: {p.ai_analysis.categoria_sugerida}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 rounded-lg text-[10px] gap-1"
                                disabled={applyingReclass === p.id}
                                onClick={() => handleApplyCategoryReclassification(p.id)}
                              >
                                {applyingReclass === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Aplicar
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : record.ai_motivo_legal ? (
                        /* Fallback to old basic analysis */
                        <div className="space-y-2">
                          <p className="text-muted-foreground leading-relaxed">
                            {[record.ai_motivo_legal, record.ai_tipo_razonamiento].filter(Boolean).join('. ')}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {aiTipoRecomendado && (
                              <div className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold ${
                                aiTipoRecomendado === 'sancion'
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                  : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                              }`}>
                                <Scale className="h-3.5 w-3.5" />
                                {aiTipoRecomendado === 'sancion'
                                  ? `Sanción${aiGravedadRecomendada ? ` (${aiGravedadRecomendada === 'muy_grave' ? 'muy grave' : aiGravedadRecomendada})` : ''}`
                                  : 'Amonestación'}
                              </div>
                            )}
                            {aiDiasRecomendados != null && aiDiasRecomendados > 0 && (
                              <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-normal">{aiDiasRecomendados}d suspensión</Badge>
                            )}
                            {record.ai_articulos_relevantes && Array.isArray(record.ai_articulos_relevantes) && record.ai_articulos_relevantes.map((art: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px] px-2 py-0.5 font-normal">Art. {art}</Badge>
                            ))}
                            {tipoMismatch && p.estado === 'pendiente' && aiTipoRecomendado && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 rounded-lg text-[10px] gap-1"
                                onClick={() => handleChangeTipo(p.id, aiTipoRecomendado, aiGravedadRecomendada || undefined, true)}
                                disabled={updatingTipo === p.id}
                              >
                                {updatingTipo === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Aplicar recomendación IA
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : analyzingAI === p.id ? (
                        <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Analizando con IA…</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground/70">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span className="text-xs">Análisis no generado todavía</span>
                        </div>
                      )}
                    </div>

                    {/* 2. Documento legal — prominent position */}
                    <div className="rounded-xl bg-muted/10 border border-border/30 p-3">
                      <LegalDocumentInlineButton key={`${p.id}-${Array.isArray(p.ai_reasoning_log) ? p.ai_reasoning_log.length : 0}-${p.tipo}-${p.gravedad || 'none'}-${p.suspension_dias || 0}-${p.sin_suspension_explicita === true ? 'sin-suspension' : 'con-suspension'}`} propuestaId={p.id} propuestaEstado={p.estado} isNspp={isNspp} workerName={workers} autoRefresh={analyzingAI === p.id || !!p.ai_analysis} hasAiAnalysis={!!p.ai_analysis} />
                    </div>

                    {/* 3. Borrador email — secondary collapsible */}
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 w-full text-left text-[11px] text-muted-foreground/70 py-1.5 px-3 rounded-lg hover:bg-muted/40 transition-colors group">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span>Opciones adicionales</span>
                          <ChevronRight className="h-3 w-3 ml-auto transition-transform group-data-[state=open]:rotate-90" />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-1.5 space-y-3 border border-border/30 rounded-xl p-3 bg-muted/10">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                            <Mail className="h-3.5 w-3.5" />
                            <span className="font-medium">Borrador email</span>
                            {hasEmailDraft && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Listo</Badge>}
                          </div>
                          {!hasAiAnalysis && (
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80">
                              <AlertCircle className="h-3 w-3" />
                              El borrador se desbloquea tras el análisis IA.
                            </div>
                          )}
                          <div>
                            <Label className="text-xs">Asunto</Label>
                            <Input value={emailSubjects[p.id] || ''} onChange={e => setEmailSubjects(prev => ({ ...prev, [p.id]: e.target.value }))}
                              className="h-9 rounded-xl mt-1 text-sm" placeholder="Amonestación / Sanción - Nombre (Ficha)" disabled={!hasAiAnalysis} />
                          </div>
                          <div>
                            <Label className="text-xs">Cuerpo del email</Label>
                            <Textarea value={emailBodies[p.id] || ''} onChange={e => setEmailBodies(prev => ({ ...prev, [p.id]: e.target.value }))}
                              className="rounded-xl mt-1 min-h-[200px] text-sm" placeholder="Escribe el contenido del email o genera uno con IA..." disabled={!hasAiAnalysis} />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" className="h-7 rounded-xl gap-1 text-xs"
                              onClick={() => handleGenerateDraftV2(p.id)} disabled={!hasAiAnalysis || generatingDraft === p.id}
                            >
                              {generatingDraft === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                              {hasEmailDraft ? 'Regenerar' : 'Generar IA'}
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 rounded-xl gap-1 text-xs"
                              onClick={() => handleSaveDraft(p.id)} disabled={!hasAiAnalysis || savingDraft === p.id}
                            >
                              {savingDraft === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              Guardar borrador
                            </Button>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                  )}

                  {/* 4. Evidence Gallery — manager photos + admin upload */}
                  <div className="rounded-xl bg-muted/40 border border-border/30 p-3">
                    <EvidenceGallery
                      propuestaId={p.id}
                      recordPruebas={Array.isArray(record.pruebas_urls) ? record.pruebas_urls : []}
                      adminPruebas={adminPruebasMap[p.id] || []}
                      disabledManagerPruebas={disabledManagerPruebasMap[p.id] || []}
                      collageLayout={collageLayoutMap[p.id] ?? p.collage_layout ?? null}
                      onAdminPruebasChange={(urls) => setAdminPruebasMap(prev => ({ ...prev, [p.id]: urls }))}
                      onDisabledManagerChange={(paths) => setDisabledManagerPruebasMap(prev => ({ ...prev, [p.id]: paths }))}
                      onCollageLayoutChange={(layout) => setCollageLayoutMap(prev => ({ ...prev, [p.id]: layout }))}
                      isSelected={selectedPropuestaId === p.id}
                    />
                  </div>

                  {/* === ACTIONS (right-aligned, compact) === */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    {p.estado === 'pendiente' && !isNspp && !p.aprobada_por && (
                      <>
                        <Button size="sm" className="h-7 rounded-xl gap-1 text-xs" disabled={actionLoading} onClick={() => handleApprove(p)}>
                          <Check className="h-3 w-3" /> Aprobar
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 rounded-xl gap-1 text-xs" onClick={() => setRejectDialog(p)}>
                          <X className="h-3 w-3" /> Rechazar
                        </Button>
                      </>
                    )}
                    {isNspp && p.estado === 'pendiente' && (
                      <Button size="sm" variant="outline" className="h-7 rounded-xl gap-1 text-xs" onClick={() => setRejectDialog(p)}>
                        <X className="h-3 w-3" /> Rechazar
                      </Button>
                    )}
                    {!isNspp && p.estado === 'pendiente' && p.aprobada_por && (
                      <Button size="sm" className="h-7 rounded-xl gap-1 text-xs bg-primary hover:bg-primary-hover text-primary-foreground" onClick={() => handleSendEmail(p.id)} disabled={actionLoading || !emailSubjects[p.id] || !emailBodies[p.id]}>
                        <Send className="h-3 w-3" /> Enviar a RRHH
                      </Button>
                    )}
                    {p.estado === 'enviada' && (
                      <Button size="sm" variant="outline" className="h-7 rounded-xl gap-1 text-xs" onClick={() => handleResendEmail(p.id)} disabled={actionLoading}>
                        <RefreshCw className="h-3 w-3" /> Reenviar
                      </Button>
                    )}
                    {reviewedMap[p.id] && (
                      <span className="text-[10px] text-primary flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Revisado por {reviewedMap[p.id].reviewer}
                      </span>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 w-7 rounded-xl p-0 shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {['aprobada', 'enviada'].includes(p.estado) && !reviewedMap[p.id] && (
                          <DropdownMenuItem onClick={() => handleMarkReviewed(p.id)}>
                            <CheckCircle className="h-3.5 w-3.5 mr-2" /> Marcar revisado
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleGenerateDossier(p.id)} disabled={dossierLoading === p.id}>
                          <FileText className="h-3.5 w-3.5 mr-2" /> Generar dossier
                        </DropdownMenuItem>
                        {p.estado === 'pendiente' && p.tipo !== 'nspp' && (
                          <DropdownMenuItem onClick={() => setResetConfirmId(p.id)} disabled={!!resetSteps}>
                            <RotateCcw className="h-3.5 w-3.5 mr-2" /> Restablecer
                          </DropdownMenuItem>
                        )}
                        {p.estado === 'pendiente' && p.tipo !== 'nspp' && (
                          <DropdownMenuItem onClick={() => setDuplicateTarget(p)}>
                            <Copy className="h-3.5 w-3.5 mr-2" /> Duplicar con otro trabajador
                          </DropdownMenuItem>
                        )}
                        {(p.estado === 'pendiente' || p.estado === 'rechazada') && (
                          <DropdownMenuItem onClick={() => { setArchiveMotivo(""); setArchiveDialog({ propuestaId: p.id }); }}>
                            <Archive className="h-3.5 w-3.5 mr-2" /> Archivar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleDeletePropuesta(p.id)} className="text-destructive focus:text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Approve dialog removed — approval uses values already saved on the propuesta */}

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={open => !open && setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar propuesta</DialogTitle>
          </DialogHeader>
          <Textarea placeholder="Motivo del rechazo..." value={rejectMotivo} onChange={e => setRejectMotivo(e.target.value)} className="rounded-xl" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Rechazar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Chat Dialog */}
      <Dialog open={!!aiChatOpen} onOpenChange={open => { if (!open) setAiChatOpen(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0 rounded-2xl">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4 text-primary" />
              Consulta IA
              {aiChatOpen && (() => {
                const chatProp = propuestas.find(p => p.id === aiChatOpen);
                const chatWorkers = chatProp?.tipo === 'nspp'
                  ? chatProp?.nspp_worker_name
                  : (chatProp?.workers || []).map((w: any) => w.worker_name).join(', ');
                return chatWorkers ? <span className="text-muted-foreground font-normal">— {chatWorkers}</span> : null;
              })()}
            </DialogTitle>
          </DialogHeader>

          {/* Messages area */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
            {aiChatMessages.length === 0 && !aiChatLoading && (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                <Bot className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">Escribe tu pregunta o comentario sobre esta propuesta.</p>
                <p className="text-[10px] text-muted-foreground/70">La IA considerará el contexto completo de la propuesta, el convenio colectivo y el historial del trabajador.</p>
              </div>
            )}

            {aiChatMessages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'assistant' && (
                  <div className="shrink-0 mt-1 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className={cn(
                  "rounded-2xl px-3.5 py-2.5 max-w-[85%] text-xs leading-relaxed group relative",
                  msg.role === 'user'
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted/70 text-foreground rounded-bl-md"
                )}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <button
                    onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copiado"); }}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-background/20"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                {msg.role === 'user' && (
                  <div className="shrink-0 mt-1 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {aiChatLoading && (
              <div className="flex gap-2 justify-start">
                <div className="shrink-0 mt-1 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="rounded-2xl rounded-bl-md bg-muted/70 px-4 py-3 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Analizando…</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-border/40 p-3 space-y-2">
            <div className="flex gap-2">
              <Textarea
                placeholder="Escribe tu mensaje…"
                className="text-xs min-h-[44px] max-h-[100px] rounded-xl resize-none flex-1 bg-muted/30 border-border/40"
                value={aiChatInput}
                onChange={e => setAiChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChatMessage(); } }}
              />
              <Button size="icon" className="h-11 w-11 rounded-xl shrink-0" onClick={handleSendChatMessage} disabled={aiChatLoading || !aiChatInput.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            {aiChatMessages.length >= 2 && (
              <Button size="sm" variant="outline" className="w-full h-8 rounded-xl text-[11px] gap-1.5"
                onClick={handleApplyReanalysis}
                disabled={analyzingAI === aiChatOpen}
              >
                {analyzingAI === aiChatOpen ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Aplicar re-análisis con esta conversación
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Reasoning Log Dialog */}
      <Dialog open={!!reasoningLogOpen} onOpenChange={() => setReasoningLogOpen(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <GitBranch className="h-4 w-4 text-primary" />
              Trazabilidad IA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {(() => {
              const logProp = propuestas.find(p => p.id === reasoningLogOpen);
              const log = Array.isArray(logProp?.ai_reasoning_log) ? logProp.ai_reasoning_log : [];
              if (log.length === 0) return <p className="text-xs text-muted-foreground">Sin entradas de trazabilidad.</p>;
              return log.map((entry: any, idx: number) => (
                <div key={idx} className="rounded-xl border border-border/40 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Brain className="h-3.5 w-3.5 text-primary" />
                      Análisis #{idx + 1}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  {entry.resumen && <p className="text-muted-foreground leading-relaxed">{entry.resumen}</p>}
                  {Array.isArray(entry.cambios) && entry.cambios.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="font-medium text-foreground text-[11px]">Modificaciones automáticas:</p>
                      {entry.cambios.map((c: any, ci: number) => (
                        <div key={ci} className="flex items-start gap-2 rounded-lg bg-muted/30 p-2">
                          <ArrowRight className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium capitalize">{c.campo}</span>
                            {c.de && <span className="text-muted-foreground"> de <span className="line-through">{c.de}</span></span>}
                            <span className="text-primary"> → {c.a}</span>
                            {c.razon && <p className="text-muted-foreground mt-0.5">{c.razon}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {Array.isArray(entry.cambios) && entry.cambios.length === 0 && (
                    <p className="text-muted-foreground italic">Sin modificaciones — la clasificación del encargado era correcta.</p>
                  )}
                </div>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation + progress dialog */}
      <Dialog open={!!resetConfirmId && !resetSteps} onOpenChange={(open) => { if (!open) setResetConfirmId(null); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">¿Restablecer propuesta?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se eliminarán el análisis IA, documento legal, tipo, gravedad y días de suspensión. Podrás relanzar el análisis desde cero.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setResetConfirmId(null)}>Cancelar</Button>
            <Button size="sm" className="rounded-xl gap-1.5" onClick={() => { if (resetConfirmId) handleResetPropuesta(resetConfirmId); }}>
              <RotateCcw className="h-3.5 w-3.5" /> Restablecer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetSteps} onOpenChange={() => {}}>
        <DialogContent className="max-w-xs rounded-2xl" hideCloseButton>
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Restableciendo…
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {resetSteps?.steps.map((step, i) => {
              const isActive = i === resetSteps.currentStep && !resetSteps.done;
              const isDone = i < resetSteps.currentStep || resetSteps.done;
              return (
                <div key={i} className={cn(
                  "flex items-center gap-2.5 text-xs transition-all duration-300",
                  isDone ? "text-foreground" : isActive ? "text-foreground" : "text-muted-foreground/40"
                )}>
                  {isDone ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : isActive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/20 shrink-0" />
                  )}
                  {step}
                </div>
              );
            })}
          </div>
          {resetSteps?.done && (
            <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" /> Completado
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* === Barra flotante de fusión === */}
      {mergeSelection.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="flex items-center gap-3 rounded-full bg-background/95 backdrop-blur-xl border border-border/60 shadow-lg px-4 py-2.5">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                {mergeSelection.size} propuesta{mergeSelection.size === 1 ? '' : 's'} seleccionada{mergeSelection.size === 1 ? '' : 's'}
              </span>
            </div>
            <div className="h-5 w-px bg-border" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMergeSelection(new Set())}
              className="h-8 text-xs"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
            <Button
              size="sm"
              onClick={openMergeModal}
              disabled={mergeSelection.size < 2}
              className="h-8 text-xs"
            >
              <GitBranch className="h-3.5 w-3.5 mr-1" /> Fusionar en una sola
            </Button>
          </div>
        </div>
      )}

      {/* === Modal fusión === */}
      <Dialog open={mergeModalOpen} onOpenChange={setMergeModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" /> Fusionar {mergeSelection.size} propuestas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl bg-muted/40 border border-border/40 p-3 text-xs text-muted-foreground space-y-1">
              <p>Se creará <strong>una única incidencia consolidada</strong> con todas las pruebas, descripciones y fechas. La IA analizará el caso conjunto y emitirá una recomendación unificada.</p>
              <p>Las propuestas originales quedarán marcadas como <code className="px-1 py-0.5 rounded bg-background">fusionada</code>.</p>
            </div>

            {/* Mini-tabla resumen de propuestas seleccionadas */}
            <div className="space-y-1.5">
              <Label className="text-xs">Propuestas a fusionar ({mergeSelection.size})</Label>
              <div className="rounded-xl border border-border/40 divide-y divide-border/40 max-h-40 overflow-y-auto">
                {[...mergeSelection].map(id => {
                  const sp = propuestas.find(pp => pp.id === id);
                  if (!sp) return null;
                  const fecha = sp.fecha_inicio || sp.record?.fecha;
                  const desc = sp.record?.descripcion || '(sin descripción)';
                  const tipoLabel = sp.tipo === 'amonestacion' ? 'Amonestación' : sp.tipo === 'sancion' ? `Sanción${sp.gravedad ? ' ' + sp.gravedad : ''}` : sp.tipo;
                  return (
                    <div key={id} className="px-3 py-2 text-[11px] flex items-center gap-2">
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {fecha ? new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '—'}
                      </span>
                      <span className="flex-1 truncate">{desc}</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">{tipoLabel}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tipo esperado por el admin (opcional)</Label>
              <Select value={mergeTipo} onValueChange={(v: any) => setMergeTipo(v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Que decida la IA</SelectItem>
                  <SelectItem value="amonestacion">Amonestación escrita</SelectItem>
                  <SelectItem value="sancion">Sanción</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Instrucciones / contexto adicional para la IA</Label>
              <Textarea
                value={mergeContext}
                onChange={(e) => setMergeContext(e.target.value)}
                placeholder="Ej: Estas 3 incidencias forman parte de un mismo patrón de retrasos en el último mes. Considéralas en conjunto."
                className="min-h-[100px] text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMergeModalOpen(false)} disabled={mergeSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleMergeProposals} disabled={mergeSubmitting || mergeSelection.size < 2}>
              {mergeSubmitting ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Fusionando…</>
              ) : (
                <><GitBranch className="h-3.5 w-3.5 mr-1.5" /> Fusionar y reanalizar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Dialog Historial de decisiones (audit trail admin) === */}
      <Dialog open={!!auditTrailOpen} onOpenChange={(open) => { if (!open) { setAuditTrailOpen(null); setAuditTrailLogs([]); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <History className="h-4 w-4 text-primary" /> Historial de decisiones
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {auditTrailLoading && (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando historial…
              </div>
            )}
            {!auditTrailLoading && auditTrailLogs.length === 0 && (
              <p className="text-xs text-muted-foreground py-6 text-center">Sin entradas de historial todavía.</p>
            )}
            {!auditTrailLoading && auditTrailLogs.map((log: any) => {
              const at = log.created_at ? new Date(log.created_at) : null;
              const fmt = at ? at.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
              const cj = log.cambios_json || {};
              type IconKind = 'merge' | 'merged_into' | 'questions' | 'reset' | 'gravedad' | 'tipo' | 'approve' | 'reject' | 'audiencia' | 'pliego' | 'default';
              const iconMap: Record<IconKind, JSX.Element> = {
                merge: <GitMerge className="h-3.5 w-3.5 text-blue-600" />,
                merged_into: <GitBranch className="h-3.5 w-3.5 text-blue-500" />,
                questions: <MessageSquare className="h-3.5 w-3.5 text-amber-600" />,
                reset: <RotateCcw className="h-3.5 w-3.5 text-orange-600" />,
                gravedad: <Pencil className="h-3.5 w-3.5 text-purple-600" />,
                tipo: <Pencil className="h-3.5 w-3.5 text-purple-600" />,
                approve: <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />,
                reject: <ThumbsDown className="h-3.5 w-3.5 text-red-600" />,
                audiencia: <Gavel className="h-3.5 w-3.5 text-indigo-600" />,
                pliego: <FileText className="h-3.5 w-3.5 text-indigo-500" />,
                default: <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />,
              };
              const titleMap: Record<string, string> = {
                ai_questions_answered: 'Preguntas IA respondidas',
                proposals_merged: 'Propuestas fusionadas',
                proposal_merged_into: 'Esta propuesta fue fusionada',
                reset_propuesta: 'Propuesta restablecida',
                manual_gravedad_change: 'Gravedad modificada manualmente',
                manual_tipo_change: 'Tipo modificado manualmente',
                approve_propuesta: 'Propuesta aprobada',
                reject_propuesta: 'Propuesta rechazada',
                audiencia_previa_completada: 'Audiencia previa completada',
                pliego_cargos_generado: 'Pliego de cargos generado',
              };
              const kindMap: Record<string, IconKind> = {
                proposals_merged: 'merge',
                proposal_merged_into: 'merged_into',
                ai_questions_answered: 'questions',
                reset_propuesta: 'reset',
                manual_gravedad_change: 'gravedad',
                manual_tipo_change: 'tipo',
                approve_propuesta: 'approve',
                reject_propuesta: 'reject',
                audiencia_previa_completada: 'audiencia',
                pliego_cargos_generado: 'pliego',
              };
              const kind: IconKind = kindMap[log.action_type] || 'default';
              return (
                <div key={log.id} className="rounded-xl border border-border/40 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {iconMap[kind]}
                      <span className="text-xs font-semibold truncate">{titleMap[log.action_type] || log.action_type}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{fmt}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Por <span className="font-medium text-foreground">{log.actor_name}</span> · {log.actor_role}
                  </p>
                  {log.details && <p className="text-xs">{log.details}</p>}

                  {/* Render detalles según tipo */}
                  {log.action_type === 'ai_questions_answered' && Array.isArray(cj.respuestas) && cj.respuestas.length > 0 && (
                    <div className="space-y-1.5 mt-1">
                      {cj.respuestas.map((r: any, i: number) => (
                        <div key={i} className="rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/40 p-2 text-[11px]">
                          <p className="font-medium text-amber-900 dark:text-amber-200">P: {r.pregunta}</p>
                          <p className="text-foreground/90 mt-0.5">R: {r.respuesta}</p>
                        </div>
                      ))}
                      {(cj.tipo_previo || cj.gravedad_previa) && (
                        <p className="text-[10px] text-muted-foreground">
                          Estado previo: {cj.tipo_previo || '—'}{cj.gravedad_previa ? ` · ${cj.gravedad_previa}` : ''}
                        </p>
                      )}
                    </div>
                  )}

                  {log.action_type === 'proposals_merged' && (
                    <div className="rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/40 p-2 text-[11px] space-y-0.5">
                      {cj.worker_name && <p>Trabajador: <span className="font-medium">{cj.worker_name}</span></p>}
                      {Array.isArray(cj.source_ids) && <p>Origen: {cj.source_ids.length} propuestas</p>}
                      {cj.tipo_esperado && <p>Tipo esperado: <code>{cj.tipo_esperado}</code></p>}
                      {cj.instrucciones_admin && (
                        <p className="text-muted-foreground italic">"{cj.instrucciones_admin}"</p>
                      )}
                    </div>
                  )}

                  {(log.action_type === 'manual_gravedad_change' || log.action_type === 'manual_tipo_change') && (cj.de || cj.a) && (
                    <p className="text-[11px] flex items-center gap-1.5">
                      <span className="line-through text-muted-foreground">{cj.de || '—'}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span className="font-medium">{cj.a || '—'}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <DuplicateProposalDialog
        propuesta={duplicateTarget}
        open={!!duplicateTarget}
        onOpenChange={(o) => { if (!o) setDuplicateTarget(null); }}
        onDuplicated={() => { load(); }}
      />

      <Dialog open={!!archiveDialog} onOpenChange={(o) => { if (!o) { setArchiveDialog(null); setArchiveMotivo(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Archive className="h-4 w-4" /> Archivar propuesta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              La propuesta y la incidencia asociada se moverán a <strong>Archivadas</strong>. No se elimina nada y podrás restaurarla en cualquier momento.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo (opcional)</Label>
              <Textarea
                value={archiveMotivo}
                onChange={(e) => setArchiveMotivo(e.target.value)}
                placeholder="Ej.: el trabajador ya no está en la empresa"
                rows={3}
                className="rounded-xl text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => { setArchiveDialog(null); setArchiveMotivo(""); }} disabled={archiveLoading}>
              Cancelar
            </Button>
            <Button className="rounded-xl gap-1.5" onClick={handleArchivePropuesta} disabled={archiveLoading}>
              {archiveLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
              Archivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
