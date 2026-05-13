/**
 * Evidence Collage Builder — free-canvas layout for legal-document evidence.
 *
 * Admin opens this from `AdminPropuestasTab`. They drag/resize image frames on
 * an A4-ratio canvas, add captions, optionally crop each one, and save a
 * fraction-based `collage_layout` JSON to the proposal.
 *
 * The same JSON is later replayed verbatim into the legal document (replacing
 * the AI-generated collage) so what the admin sees here is *exactly* what
 * appears in the PDF.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  LayoutGrid,
  RotateCcw,
  Save,
  X,
  Plus,
  Trash2,
  FlipHorizontal,
  FlipVertical,
  Crop as CropIcon,
  Loader2,
  Images,
  ZoomIn,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getManagerSessionToken } from "@/lib/sessionHelpers";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface CollageFrame {
  id: string;
  /** Storage path inside `incidencias-pruebas` bucket */
  path: string;
  /** Position/size as fractions [0..1] of the inner card area */
  x: number;
  y: number;
  w: number;
  h: number;
  caption: string;
  /** Internal image transform (pan + zoom inside frame) */
  objectPositionX: number; // 0..1
  objectPositionY: number; // 0..1
  scale: number; // 1..3
  flipH: boolean;
  flipV: boolean;
}

export interface CollageLayout {
  version: 1;
  layout: "manual" | "auto";
  frames: CollageFrame[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propuestaId: string;
  /** All evidence paths the admin can put on the canvas (active = not disabled) */
  imagePaths: string[];
  /** Existing saved layout (if any) */
  initialLayout: CollageLayout | null;
  onSaved: (layout: CollageLayout | null) => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const CARD_ASPECT = 794 / 1000; // A4-ish content area used in legal PDF
const MIN_FRAME = 0.08;

function uid() {
  return `frm-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function autoLayoutFrames(frames: CollageFrame[]): CollageFrame[] {
  const n = frames.length;
  if (n === 0) return frames;
  let cols = 1;
  let rows = 1;
  if (n === 1) { cols = 1; rows = 1; }
  else if (n === 2) { cols = 2; rows = 1; }
  else if (n <= 4) { cols = 2; rows = 2; }
  else if (n <= 6) { cols = 3; rows = 2; }
  else if (n <= 9) { cols = 3; rows = 3; }
  else { cols = 4; rows = Math.ceil(n / 4); }

  const gap = 0.02;
  const captionH = 0.05;
  const totalGapX = gap * (cols + 1);
  const totalGapY = gap * (rows + 1);
  const cellW = (1 - totalGapX) / cols;
  const cellH = (1 - totalGapY) / rows;
  const imgH = Math.max(MIN_FRAME, cellH - captionH);

  return frames.map((f, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    return {
      ...f,
      x: gap + c * (cellW + gap),
      y: gap + r * (cellH + gap),
      w: cellW,
      h: imgH + captionH,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function EvidenceCollageBuilder({
  open,
  onOpenChange,
  propuestaId,
  imagePaths,
  initialLayout,
  onSaved,
}: Props) {
  const [frames, setFrames] = useState<CollageFrame[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [snap, setSnap] = useState(true);
  const [dirty, setDirty] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (!open) return;
    if (initialLayout && Array.isArray(initialLayout.frames)) {
      setFrames(initialLayout.frames.map((f) => ({ ...f })));
    } else {
      setFrames([]);
    }
    setSelectedId(null);
    setDirty(false);
  }, [open, initialLayout]);

  // Sign URLs for image previews (via edge function — bucket es admin-only y
  // no permite createSignedUrl desde el cliente).
  useEffect(() => {
    if (!open) return;
    const all = Array.from(new Set([...imagePaths, ...frames.map((f) => f.path)]));
    const toFetch = all.filter((p) => !signedUrls[p]);
    if (toFetch.length === 0) return;
    let cancelled = false;
    const sessionToken = getManagerSessionToken();
    (async () => {
      const results = await Promise.all(
        toFetch.map(async (path) => {
          try {
            const { data } = await supabase.functions.invoke(
              "incidencias-operations",
              { body: { action: "getProposalImageUrl", sessionToken, filePath: path } },
            );
            return { path, url: data?.success ? data.url || null : null };
          } catch {
            return { path, url: null };
          }
        }),
      );
      if (cancelled) return;
      setSignedUrls((prev) => {
        const next = { ...prev };
        results.forEach((r) => { if (r.url) next[r.path] = r.url; });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, imagePaths, frames, signedUrls]);

  const usedPaths = useMemo(() => new Set(frames.map((f) => f.path)), [frames]);
  const trayPaths = useMemo(
    () => imagePaths.filter((p) => !usedPaths.has(p)),
    [imagePaths, usedPaths],
  );

  /* ----- Mutations ------------------------------------------------- */

  const markDirty = () => setDirty(true);

  const addFrame = useCallback((path: string) => {
    const idx = frames.length;
    const nf: CollageFrame = {
      id: uid(),
      path,
      x: 0.05 + (idx % 3) * 0.05,
      y: 0.05 + Math.floor(idx / 3) * 0.05,
      w: 0.4,
      h: 0.32,
      caption: "",
      objectPositionX: 0.5,
      objectPositionY: 0.5,
      scale: 1,
      flipH: false,
      flipV: false,
    };
    setFrames((f) => [...f, nf]);
    setSelectedId(nf.id);
    markDirty();
  }, [frames.length]);

  const updateFrame = useCallback((id: string, patch: Partial<CollageFrame>) => {
    setFrames((arr) => arr.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    markDirty();
  }, []);

  const removeFrame = useCallback((id: string) => {
    setFrames((arr) => arr.filter((f) => f.id !== id));
    setSelectedId((s) => (s === id ? null : s));
    markDirty();
  }, []);

  const handleAutoAlign = useCallback(() => {
    setFrames((arr) => autoLayoutFrames(arr));
    markDirty();
  }, []);

  const handleReset = useCallback(() => {
    setFrames([]);
    setSelectedId(null);
    markDirty();
  }, []);

  /* ----- Drag / resize -------------------------------------------- */

  const beginDrag = useCallback(
    (id: string, e: React.PointerEvent, mode: "move" | "resize") => {
      e.preventDefault();
      e.stopPropagation();
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const start = frames.find((f) => f.id === id);
      if (!start) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startFrame = { ...start };
      setSelectedId(id);
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture?.(e.pointerId);

      const SNAP = snap ? 0.01 : 0;

      const onMove = (ev: PointerEvent) => {
        const dx = (ev.clientX - startX) / rect.width;
        const dy = (ev.clientY - startY) / rect.height;
        if (mode === "move") {
          let nx = clamp(startFrame.x + dx, 0, 1 - startFrame.w);
          let ny = clamp(startFrame.y + dy, 0, 1 - startFrame.h);
          if (SNAP) {
            nx = Math.round(nx / SNAP) * SNAP;
            ny = Math.round(ny / SNAP) * SNAP;
          }
          setFrames((arr) =>
            arr.map((f) => (f.id === id ? { ...f, x: nx, y: ny } : f)),
          );
        } else {
          let nw = clamp(startFrame.w + dx, MIN_FRAME, 1 - startFrame.x);
          let nh = clamp(startFrame.h + dy, MIN_FRAME, 1 - startFrame.y);
          if (SNAP) {
            nw = Math.round(nw / SNAP) * SNAP;
            nh = Math.round(nh / SNAP) * SNAP;
          }
          setFrames((arr) =>
            arr.map((f) => (f.id === id ? { ...f, w: nw, h: nh } : f)),
          );
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        markDirty();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [frames, snap],
  );

  /* ----- Save ----------------------------------------------------- */

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const layout: CollageLayout | null = frames.length === 0
        ? null
        : { version: 1, layout: "manual", frames };
      const sessionToken = getManagerSessionToken();
      const { data, error } = await supabase.functions.invoke(
        "incidencias-operations",
        {
          body: {
            action: "saveCollageLayout",
            sessionToken,
            propuestaId,
            layout,
          },
        },
      );
      if (error) throw new Error(error.message || "Error al guardar");
      if (!data?.saved) throw new Error(data?.error || "Error al guardar");
      onSaved(layout);
      setDirty(false);
      toast.success(layout ? "Maquetación guardada" : "Maquetación borrada");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar el collage");
    } finally {
      setSaving(false);
    }
  }, [frames, propuestaId, onSaved, onOpenChange]);

  /* ----- Selected frame inspector --------------------------------- */

  const selected = frames.find((f) => f.id === selectedId) || null;

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent
        hideCloseButton
        className="max-w-[97vw] w-[97vw] h-[95vh] flex flex-col p-0 gap-0 overflow-hidden bg-neutral-100 dark:bg-neutral-900"
      >
        <DialogHeader className="px-4 py-2.5 shrink-0 border-b bg-background">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <LayoutGrid className="h-4 w-4" />
            Maquetar collage de evidencias
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1">
              {frames.length} imagen{frames.length === 1 ? "" : "es"}
            </Badge>
            {dirty && (
              <Badge
                variant="secondary"
                className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-700 border-amber-500/20"
              >
                Sin guardar
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={snap}
                  onChange={(e) => setSnap(e.target.checked)}
                  className="h-3 w-3"
                />
                Snap
              </label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1"
                onClick={handleAutoAlign}
                disabled={frames.length === 0}
                title="Distribuir uniformemente y alinear con márgenes idénticos"
              >
                <Sparkles className="h-3 w-3" />
                Auto-alinear
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] gap-1"
                onClick={handleReset}
                disabled={frames.length === 0}
              >
                <RotateCcw className="h-3 w-3" />
                Vaciar
              </Button>
              <Button
                size="sm"
                className="h-7 text-[11px] gap-1"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Guardar maquetación
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-[220px_1fr_300px] overflow-hidden">
          {/* Tray ------------------------------------------------- */}
          <aside className="border-r bg-background overflow-y-auto p-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              <Images className="h-3 w-3" />
              Imágenes disponibles
            </div>
            {trayPaths.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                Todas las imágenes están en el collage.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {trayPaths.map((path) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => addFrame(path)}
                    className="group relative aspect-square rounded-md overflow-hidden border border-border hover:border-primary/60 hover:ring-2 hover:ring-primary/30 transition-all"
                    title="Añadir al collage"
                  >
                    {signedUrls[path] ? (
                      <img
                        src={signedUrls[path]}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted/40">
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
                      <Plus className="h-4 w-4 text-white drop-shadow opacity-0 group-hover:opacity-100" />
                    </div>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/80 leading-snug pt-2 border-t">
              Click sobre una imagen para añadirla al collage. Una vez en la
              card, arrástrala y redimensiona desde la esquina inferior derecha.
            </p>
          </aside>

          {/* Canvas ----------------------------------------------- */}
          <main className="overflow-auto bg-neutral-200 dark:bg-neutral-800 p-6 flex items-start justify-center">
            <Card
              className="relative bg-white shadow-lg"
              style={{
                width: "min(820px, 100%)",
                aspectRatio: `${CARD_ASPECT}`,
              }}
            >
              <div
                ref={cardRef}
                className="absolute inset-0 p-[3%]"
                onClick={() => setSelectedId(null)}
              >
                {/* Soft grid */}
                <div
                  aria-hidden
                  className="absolute inset-[3%] pointer-events-none opacity-[0.06]"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                    backgroundSize: "8% 8%",
                  }}
                />
                {/* Header preview */}
                <div className="absolute left-[3%] right-[3%] top-[3%] text-[9px] uppercase tracking-[0.08em] text-neutral-400 font-semibold">
                  Evidencias gráficas
                </div>

                <div className="absolute inset-[3%] mt-[5%]">
                  {frames.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-xs italic">
                      Añade imágenes desde el panel de la izquierda.
                    </div>
                  )}

                  {frames.map((f) => {
                    const url = signedUrls[f.path];
                    const isSel = f.id === selectedId;
                    const captionH = 22; // px reserved for caption
                    return (
                      <div
                        key={f.id}
                        onPointerDown={(e) => beginDrag(f.id, e, "move")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(f.id);
                        }}
                        className={cn(
                          "absolute select-none touch-none cursor-move group",
                          "rounded-md overflow-hidden",
                          isSel
                            ? "ring-2 ring-primary shadow-lg z-10"
                            : "ring-1 ring-neutral-200 hover:ring-primary/40",
                        )}
                        style={{
                          left: `${f.x * 100}%`,
                          top: `${f.y * 100}%`,
                          width: `${f.w * 100}%`,
                          height: `${f.h * 100}%`,
                          background: "#fff",
                        }}
                      >
                        {/* Image area (everything above caption) */}
                        <div
                          className="absolute left-0 right-0 top-0 overflow-hidden bg-neutral-100"
                          style={{ bottom: captionH }}
                        >
                          {url ? (
                            <img
                              src={url}
                              alt=""
                              draggable={false}
                              className="w-full h-full object-cover pointer-events-none"
                              style={{
                                objectPosition: `${f.objectPositionX * 100}% ${f.objectPositionY * 100}%`,
                                transform: `scale(${f.scale}) scaleX(${f.flipH ? -1 : 1}) scaleY(${f.flipV ? -1 : 1})`,
                                transformOrigin: "center center",
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        {/* Caption */}
                        <div
                          className="absolute left-0 right-0 bottom-0 px-1.5 flex items-center bg-white border-t border-neutral-100"
                          style={{ height: captionH }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={f.caption}
                            placeholder="Leyenda…"
                            onChange={(e) =>
                              updateFrame(f.id, { caption: e.target.value })
                            }
                            className="w-full h-full bg-transparent text-[10px] text-neutral-700 placeholder:text-neutral-400 outline-none"
                          />
                        </div>

                        {/* Resize handle */}
                        <button
                          type="button"
                          aria-label="Redimensionar"
                          onPointerDown={(e) => beginDrag(f.id, e, "resize")}
                          className="absolute right-0 bottom-0 w-3 h-3 cursor-nwse-resize bg-primary/80 opacity-0 group-hover:opacity-100"
                          style={{ borderTopLeftRadius: 4 }}
                        />
                        {/* Remove */}
                        <button
                          type="button"
                          aria-label="Quitar"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFrame(f.id);
                          }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow z-10"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </main>

          {/* Inspector ------------------------------------------- */}
          <aside className="border-l bg-background overflow-y-auto p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              Inspector
            </p>
            {!selected ? (
              <p className="text-[11px] text-muted-foreground italic">
                Selecciona una imagen del collage para editarla.
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Leyenda
                  </label>
                  <Input
                    value={selected.caption}
                    onChange={(e) =>
                      updateFrame(selected.id, { caption: e.target.value })
                    }
                    placeholder="Describe brevemente la evidencia"
                    className="h-8 text-[11px] mt-1"
                  />
                </div>

                <FieldGroup label="Zoom interno" icon={<ZoomIn className="h-3 w-3" />}>
                  <Slider
                    value={[selected.scale]}
                    min={1}
                    max={3}
                    step={0.05}
                    onValueChange={(v) =>
                      updateFrame(selected.id, { scale: v[0] })
                    }
                  />
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {selected.scale.toFixed(2)}×
                  </span>
                </FieldGroup>

                <FieldGroup label="Encuadre horizontal">
                  <Slider
                    value={[selected.objectPositionX]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={(v) =>
                      updateFrame(selected.id, { objectPositionX: v[0] })
                    }
                  />
                </FieldGroup>

                <FieldGroup label="Encuadre vertical">
                  <Slider
                    value={[selected.objectPositionY]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={(v) =>
                      updateFrame(selected.id, { objectPositionY: v[0] })
                    }
                  />
                </FieldGroup>

                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    variant={selected.flipH ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-[10px] gap-1"
                    onClick={() =>
                      updateFrame(selected.id, { flipH: !selected.flipH })
                    }
                  >
                    <FlipHorizontal className="h-3 w-3" />
                    Voltear H
                  </Button>
                  <Button
                    variant={selected.flipV ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-[10px] gap-1"
                    onClick={() =>
                      updateFrame(selected.id, { flipV: !selected.flipV })
                    }
                  >
                    <FlipVertical className="h-3 w-3" />
                    Voltear V
                  </Button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-[10px] gap-1"
                  onClick={() =>
                    updateFrame(selected.id, {
                      objectPositionX: 0.5,
                      objectPositionY: 0.5,
                      scale: 1,
                      flipH: false,
                      flipV: false,
                    })
                  }
                >
                  <RotateCcw className="h-3 w-3" />
                  Restablecer encuadre
                </Button>

                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full h-7 text-[10px] gap-1"
                  onClick={() => removeFrame(selected.id)}
                >
                  <Trash2 className="h-3 w-3" />
                  Quitar del collage
                </Button>
              </div>
            )}

            <div className="border-t pt-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                Atajos
              </p>
              <ul className="text-[10px] text-muted-foreground space-y-0.5">
                <li>· Click sobre miniatura → añade al collage</li>
                <li>· Arrastra el frame → mover</li>
                <li>· Esquina ↘ → redimensionar</li>
                <li>· Auto-alinear → grid uniforme</li>
              </ul>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function FieldGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1">
        {icon}
        {label}
      </label>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Server-side / shared rendering                                      */
/* ------------------------------------------------------------------ */

/**
 * Render a saved collage layout to inline HTML compatible with the legal
 * document styling. Used both for live preview and for replacing the AI
 * collage section after the legal doc is generated.
 */
export function renderCollageLayoutToHtml(
  layout: CollageLayout,
  signedUrlByPath: Record<string, string>,
): string {
  if (!layout.frames || layout.frames.length === 0) return "";
  const frames = layout.frames
    .map((f) => {
      const url = signedUrlByPath[f.path] || "";
      const transform = `scale(${f.scale}) scaleX(${f.flipH ? -1 : 1}) scaleY(${f.flipV ? -1 : 1})`;
      const objectPos = `${(f.objectPositionX * 100).toFixed(1)}% ${(f.objectPositionY * 100).toFixed(1)}%`;
      const caption = (f.caption || "").trim();
      return `<figure data-frame-id="${f.id}" style="position:absolute;left:${(f.x * 100).toFixed(2)}%;top:${(f.y * 100).toFixed(2)}%;width:${(f.w * 100).toFixed(2)}%;height:${(f.h * 100).toFixed(2)}%;margin:0;background:#fff;border:1px solid #ececec;border-radius:6px;overflow:hidden;display:flex;flex-direction:column">
<div style="position:absolute;left:0;right:0;top:0;bottom:22px;overflow:hidden;background:#f4f4f5">
<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:${objectPos};transform:${transform};transform-origin:center center;display:block" />
</div>
<figcaption style="position:absolute;left:0;right:0;bottom:0;height:22px;padding:0 8px;display:flex;align-items:center;font-size:10px;color:#555;font-weight:300;background:#fff;border-top:1px solid #f0f0f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(caption)}</figcaption>
</figure>`;
    })
    .join("\n");
  return `<section class="evidencias-graficas custom-collage" data-collage="manual" style="margin:18px 0;page-break-inside:auto">
<h2 style="font-size:13px;font-weight:600;margin:0 0 10px 0;letter-spacing:-0.01em">Evidencias gráficas</h2>
<div class="collage-canvas" style="position:relative;width:100%;aspect-ratio:${CARD_ASPECT.toFixed(4)};background:#fff;border:1px solid #ececec;border-radius:8px;padding:0">
${frames}
</div>
</section>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
