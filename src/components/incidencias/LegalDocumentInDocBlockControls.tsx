import { useEffect, useRef } from "react";
import { Trash2, RotateCcw, X, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { BlockMeta, BlockInlineStylePatch } from "@/lib/legalDocumentBlocks";

interface Props {
  block: BlockMeta;
  anchor: { top: number; left: number; right: number; bottom: number; width: number };
  onChangeStyle: (patch: BlockInlineStylePatch) => void;
  onResetBlock: () => void;
  onRemoveBlock: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onClose: () => void;
}

const M_MIN = -16;
const M_MAX = 64;
const P_MIN = 0;
const P_MAX = 40;
const S_MIN = 0.6;
const S_MAX = 1.2;

export function LegalDocumentInDocBlockControls({
  block,
  anchor,
  onChangeStyle,
  onResetBlock,
  onRemoveBlock,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  const POPOVER_HEIGHT_GUESS = 320;
  const placeBelow = anchor.bottom + POPOVER_HEIGHT_GUESS + 16 < window.innerHeight;
  const top = placeBelow ? anchor.bottom + 8 : Math.max(12, anchor.top - POPOVER_HEIGHT_GUESS - 8);
  const left = Math.max(12, Math.min(window.innerWidth - 340, anchor.left));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mt = block.inline.marginTop;
  const mb = block.inline.marginBottom;
  const py = block.inline.paddingY;
  const px = block.inline.paddingX;
  const scale = block.inline.scale;

  return (
    <div
      ref={ref}
      className={cn(
        "fixed z-[60] w-[320px] rounded-2xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-2xl",
        "p-3 space-y-2.5 text-popover-foreground",
      )}
      style={{ top, left }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-tight truncate">{block.label}</p>
          <p className="text-[9px] text-muted-foreground truncate">Edita en tiempo real</p>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={onClose} aria-label="Cerrar">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <SliderField
        label="Margen superior"
        value={mt ?? 0}
        active={mt != null}
        min={M_MIN}
        max={M_MAX}
        step={1}
        unit="px"
        onChange={(v) => onChangeStyle({ marginTop: v })}
        onReset={() => onChangeStyle({ marginTop: null })}
      />
      <SliderField
        label="Margen inferior"
        value={mb ?? 0}
        active={mb != null}
        min={M_MIN}
        max={M_MAX}
        step={1}
        unit="px"
        onChange={(v) => onChangeStyle({ marginBottom: v })}
        onReset={() => onChangeStyle({ marginBottom: null })}
      />
      <SliderField
        label="Padding vertical"
        value={py ?? 0}
        active={py != null}
        min={P_MIN}
        max={P_MAX}
        step={1}
        unit="px"
        onChange={(v) => onChangeStyle({ paddingY: v })}
        onReset={() => onChangeStyle({ paddingY: null })}
      />
      <SliderField
        label="Padding horizontal"
        value={px ?? 0}
        active={px != null}
        min={P_MIN}
        max={P_MAX}
        step={1}
        unit="px"
        onChange={(v) => onChangeStyle({ paddingX: v })}
        onReset={() => onChangeStyle({ paddingX: null })}
      />
      <SliderField
        label="Escala del bloque"
        value={scale ?? 1}
        active={scale != null}
        min={S_MIN}
        max={S_MAX}
        step={0.01}
        unit="×"
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(v) => onChangeStyle({ scale: v })}
        onReset={() => onChangeStyle({ scale: null })}
      />

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-7 text-[10px] gap-1"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          title="Subir bloque (mover hacia arriba)"
        >
          <ArrowUp className="h-3 w-3" />
          Subir
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-7 text-[10px] gap-1"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          title="Bajar bloque (mover hacia abajo)"
        >
          <ArrowDown className="h-3 w-3" />
          Bajar
        </Button>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-7 text-[10px] gap-1"
          onClick={onResetBlock}
        >
          <RotateCcw className="h-3 w-3" />
          Restablecer
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-7 text-[10px] gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 border-rose-500/30"
          onClick={onRemoveBlock}
        >
          <Trash2 className="h-3 w-3" />
          Eliminar bloque
        </Button>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  active,
  min,
  max,
  step,
  unit,
  format,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  active: boolean;
  min: number;
  max: number;
  step: number;
  unit: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
        <div className="flex items-center gap-1.5">
          <span className={cn("text-[10px] tabular-nums", active ? "text-foreground" : "text-muted-foreground/60")}>
            {active ? (format ? format(value) : `${value}${unit}`) : "auto"}
          </span>
          <button
            type="button"
            className="h-4 w-4 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent/40 transition"
            onClick={onReset}
            aria-label={`Restablecer ${label}`}
            title="Restablecer"
          >
            <RotateCcw className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        className="h-3"
      />
    </div>
  );
}
