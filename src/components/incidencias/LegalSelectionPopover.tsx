import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  selectedText: string;
  /** Position relative to the viewport (px). */
  position: { top: number; left: number };
  running: boolean;
  onApply: (instruction: string) => void;
  onClose: () => void;
}

export function LegalSelectionPopover({ selectedText, position, running, onApply, onClose }: Props) {
  const [instruction, setInstruction] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setInstruction("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [selectedText]);

  // Clamp position to viewport
  const POPOVER_WIDTH = 340;
  const POPOVER_MAX_HEIGHT = 280;
  const margin = 12;
  const maxLeft = window.innerWidth - POPOVER_WIDTH - margin;
  const left = Math.max(margin, Math.min(position.left, maxLeft));
  const top = Math.min(position.top, window.innerHeight - POPOVER_MAX_HEIGHT - margin);

  const handleSubmit = () => {
    const text = instruction.trim();
    if (!text || running) return;
    onApply(text);
  };

  return (
    <div
      className="fixed z-[100] w-[340px] rounded-2xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-2xl p-3 space-y-2.5 animate-in fade-in-0 zoom-in-95"
      style={{ top, left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-tight text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Editar selección con IA
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="rounded-lg bg-primary/5 border border-primary/20 px-2.5 py-1.5 text-[11px] text-foreground/90 max-h-20 overflow-auto leading-snug">
        <span className="text-muted-foreground/70 text-[10px] font-medium block mb-0.5">Texto seleccionado</span>
        "{selectedText.length > 220 ? `${selectedText.slice(0, 220)}…` : selectedText}"
      </div>

      <Textarea
        ref={textareaRef}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="¿Qué cambio quieres aquí? (ej: corrige la ortografía, suaviza el tono, añade fecha…)"
        className="min-h-[64px] max-h-[120px] text-xs resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
          if (e.key === "Escape") onClose();
        }}
        disabled={running}
      />

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Modo rápido (texto‑only)</span>
        <Button
          size="sm"
          className="h-7 text-[11px] gap-1"
          onClick={handleSubmit}
          disabled={running || !instruction.trim()}
        >
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {running ? "Aplicando…" : "Aplicar"}
        </Button>
      </div>
    </div>
  );
}
