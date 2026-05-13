import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { FlipHorizontal, FlipVertical, RotateCcw, ZoomIn, Check, X, Move } from "lucide-react";

/**
 * Editor of an evidence image's CROP/POSITION inside its frame.
 *
 * It does NOT modify the image file. It only computes two CSS values
 * that are stored as inline `style` on the original `<img>`:
 *   - object-position: "X% Y%"
 *   - transform:       "scale(sx, sy)"
 *
 * The preview here uses object-fit: cover at the SAME aspect ratio as the
 * frame in the document, so what the user sees here is what will be shown
 * in the document and exported PDF.
 */

export interface ImageEditorTarget {
  id: string;
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  frameWidth: number;
  frameHeight: number;
  currentObjectPosition?: string;
  currentTransform?: string;
}

export interface ImageEditorResult {
  id: string;
  objectPosition: string; // e.g. "42.30% 60.10%"
  transform: string;      // e.g. "scale(1.500, -1.500)"
}

interface Props {
  open: boolean;
  target: ImageEditorTarget | null;
  onCancel: () => void;
  onConfirm: (result: ImageEditorResult) => void;
  /** Live preview callback: called as user changes values, before confirm. */
  onPreview?: (result: ImageEditorResult) => void;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function parsePosition(raw?: string): { x: number; y: number } {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return { x: 50, y: 50 };
  const parts = value.split(/\s+/).filter(Boolean);
  const tok = (t: string, axis: "x" | "y") => {
    if (t === "left" || t === "top") return 0;
    if (t === "center") return 50;
    if (t === "right" || t === "bottom") return 100;
    const m = /^(-?\d+(?:\.\d+)?)%$/.exec(t);
    if (m) return parseFloat(m[1]);
    return axis === "x" ? 50 : 50;
  };
  if (parts.length === 1) {
    if (parts[0] === "top" || parts[0] === "bottom") return { x: 50, y: tok(parts[0], "y") };
    return { x: tok(parts[0], "x"), y: 50 };
  }
  return { x: tok(parts[0], "x"), y: tok(parts[1], "y") };
}

function parseTransform(raw?: string): { scale: number; fx: 1 | -1; fy: 1 | -1 } {
  const t = String(raw || "");
  let sx = 1;
  let sy = 1;
  const m = /scale\(\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*(-?\d+(?:\.\d+)?)\s*)?\)/.exec(t);
  if (m) {
    sx = parseFloat(m[1]);
    sy = m[2] ? parseFloat(m[2]) : sx;
  }
  return {
    scale: clamp(Math.max(Math.abs(sx) || 1, Math.abs(sy) || 1), 1, 4),
    fx: sx < 0 ? -1 : 1,
    fy: sy < 0 ? -1 : 1,
  };
}

const SCALE_MIN = 1;
const SCALE_MAX = 4;
const SCALE_STEP = 0.01;

export function LegalDocumentImageEditorDialog({ open, target, onCancel, onConfirm, onPreview }: Props) {
  const [posX, setPosX] = useState(50);
  const [posY, setPosY] = useState(50);
  const [scale, setScale] = useState(1);
  const [fx, setFx] = useState<1 | -1>(1);
  const [fy, setFy] = useState<1 | -1>(1);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    pointerId: number;
  } | null>(null);

  // Initialize from target whenever it changes
  useEffect(() => {
    if (!target) return;
    const pos = parsePosition(target.currentObjectPosition);
    const tr = parseTransform(target.currentTransform);
    setPosX(pos.x);
    setPosY(pos.y);
    setScale(tr.scale);
    setFx(tr.fx);
    setFy(tr.fy);
  }, [target?.id, target?.currentObjectPosition, target?.currentTransform]);

  // Compute preview frame dimensions: keep the same aspect ratio as the
  // real document frame, scaled to fit within a max box.
  const previewBox = useMemo(() => {
    if (!target) return { width: 480, height: 320 };
    const ratio = target.frameWidth / Math.max(1, target.frameHeight);
    const MAX_W = 560;
    const MAX_H = 420;
    let w = MAX_W;
    let h = w / ratio;
    if (h > MAX_H) {
      h = MAX_H;
      w = h * ratio;
    }
    return { width: Math.round(w), height: Math.round(h) };
  }, [target?.frameWidth, target?.frameHeight]);

  // Effective object-position depends on flip: when image is flipped, the
  // user expects "drag right" to move the visible window right regardless.
  // With CSS, scaleX(-1) flips the image AND reverses object-position direction.
  // To keep the saved style consistent with the preview, we always store the
  // raw posX/posY and apply transform separately. The runtime in the iframe
  // applies them identically.
  const objectPositionString = useMemo(
    () => `${posX.toFixed(2)}% ${posY.toFixed(2)}%`,
    [posX, posY]
  );
  const transformString = useMemo(
    () => `scale(${(scale * fx).toFixed(3)}, ${(scale * fy).toFixed(3)})`,
    [scale, fx, fy]
  );

  // Live preview to parent (updates the iframe in real time)
  useEffect(() => {
    if (!open || !target || !onPreview) return;
    onPreview({
      id: target.id,
      objectPosition: objectPositionString,
      transform: transformString,
    });
  }, [open, target?.id, objectPositionString, transformString, onPreview]);

  // Compute the "extra" scrollable area (in px) used to translate pointer
  // movement into a percentage delta of object-position.
  const metrics = useMemo(() => {
    if (!target) return { extraX: 0, extraY: 0 };
    const fw = previewBox.width;
    const fh = previewBox.height;
    const nw = Math.max(1, target.naturalWidth || fw);
    const nh = Math.max(1, target.naturalHeight || fh);
    const baseScale = Math.max(fw / nw, fh / nh); // object-fit: cover
    const dispW = nw * baseScale * scale;
    const dispH = nh * baseScale * scale;
    return {
      extraX: Math.max(0, dispW - fw),
      extraY: Math.max(0, dispH - fh),
    };
  }, [target?.naturalWidth, target?.naturalHeight, previewBox, scale]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!previewRef.current) return;
    e.preventDefault();
    previewRef.current.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: posX,
      startPosY: posY,
      pointerId: e.pointerId,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    // Always use half of the frame dimension as denominator so both axes
    // respond symmetrically regardless of image aspect ratio or overflow.
    // This guarantees horizontal AND vertical panning always work, even when
    // the image's natural aspect ratio matches the frame (extraX/extraY = 0).
    const denomX = Math.max(1, previewBox.width / 2);
    const denomY = Math.max(1, previewBox.height / 2);
    // Allow over-panning beyond 0-100% so the user can frame freely.
    const nextX = clamp(dragRef.current.startPosX - (dx / denomX) * 100 * fx, -100, 200);
    const nextY = clamp(dragRef.current.startPosY - (dy / denomY) * 100 * fy, -100, 200);
    setPosX(nextX);
    setPosY(nextY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    try { previewRef.current?.releasePointerCapture(dragRef.current.pointerId); } catch { /* ignore */ }
    dragRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setScale((s) => clamp(+(s + delta).toFixed(2), SCALE_MIN, SCALE_MAX));
  };

  const handleReset = () => {
    setPosX(50);
    setPosY(50);
    setScale(1);
    setFx(1);
    setFy(1);
  };

  const handleConfirm = () => {
    if (!target) return;
    onConfirm({
      id: target.id,
      objectPosition: objectPositionString,
      transform: transformString,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-2xl w-[95vw] p-0 gap-0 rounded-2xl overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Move className="h-4 w-4" />
            Reposicionar imagen
          </DialogTitle>
        </DialogHeader>

        {target && (
          <div className="px-4 pb-2">
            <p className="text-[11px] text-muted-foreground mb-3">
              Arrastra dentro del marco para elegir qué parte de la imagen se ve.
              Usa la rueda del ratón o el control inferior para hacer zoom.
            </p>

            {/* Preview frame — matches the real document frame's aspect ratio */}
            <div className="flex justify-center">
              <div
                ref={previewRef}
                className="relative bg-neutral-200 dark:bg-neutral-800 rounded-md overflow-hidden select-none"
                style={{
                  width: previewBox.width,
                  height: previewBox.height,
                  cursor: dragRef.current ? "grabbing" : "grab",
                  touchAction: "none",
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
              >
                <img
                  src={target.src}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{
                    objectFit: "cover",
                    objectPosition: objectPositionString,
                    transform: transformString,
                    transformOrigin: "center center",
                    userSelect: "none",
                    WebkitUserDrag: "none",
                  } as React.CSSProperties}
                />
                {/* Subtle frame border overlay */}
                <div className="absolute inset-0 ring-1 ring-inset ring-blue-500/40 pointer-events-none rounded-md" />
              </div>
            </div>

            {/* Controls */}
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <ZoomIn className="h-3.5 w-3.5" /> Zoom
                  </span>
                  <span className="tabular-nums">{scale.toFixed(2)}×</span>
                </div>
                <Slider
                  value={[scale]}
                  min={SCALE_MIN}
                  max={SCALE_MAX}
                  step={SCALE_STEP}
                  onValueChange={([v]) => setScale(v)}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-[11px]"
                    onClick={() => setFx((v) => (v === 1 ? -1 : 1))}
                  >
                    <FlipHorizontal className="h-3.5 w-3.5" />
                    Voltear H {fx === -1 && <span className="text-blue-500">●</span>}
                  </Button>
                  <Button
                    type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-[11px]"
                    onClick={() => setFy((v) => (v === 1 ? -1 : 1))}
                  >
                    <FlipVertical className="h-3.5 w-3.5" />
                    Voltear V {fy === -1 && <span className="text-blue-500">●</span>}
                  </Button>
                  <Button
                    type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-[11px] text-muted-foreground"
                    onClick={handleReset}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restablecer
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="p-4 pt-2 gap-2">
          <Button variant="outline" onClick={onCancel}>
            <X className="h-4 w-4 mr-1.5" />
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>
            <Check className="h-4 w-4 mr-1.5" />
            Aplicar recorte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
