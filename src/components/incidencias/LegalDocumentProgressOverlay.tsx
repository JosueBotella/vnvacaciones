/**
 * Inline progress indicator for the "generating / regenerating legal document"
 * pipeline. Renders as a slim, minimal, non-blocking bar that the admin can
 * place inside the proposal card. The same component is reused across both
 * manual generation, manual regeneration, and the auto-trigger flow so the UX
 * is consistent — and crucially it never blocks the rest of the UI.
 */
import { Sparkles } from "lucide-react";

export type LegalDocPhase =
  | "preparing"
  | "extracting-frames"
  | "generating-document"
  | "finalizing";

export interface LegalDocProgressState {
  open: boolean;
  phase: LegalDocPhase;
  /** Coarse progress 0-100 — combines all phases. */
  percent: number;
  /** Headline shown in bold. */
  title: string;
  /** Smaller secondary hint about the current step. */
  hint?: string;
}

const PHASE_LABEL: Record<LegalDocPhase, string> = {
  preparing: "Preparando",
  "extracting-frames": "Extrayendo evidencias del vídeo",
  "generating-document": "Redactando con la IA",
  finalizing: "Finalizando",
};

/**
 * Inline (non-modal) progress bar. Designed to live inside a proposal card
 * next to the "Ver documento" / "Regenerar" controls. It is purely
 * presentational: the parent owns the state and decides when to mount it.
 *
 * Visual: a slim 1px-tall determinate bar sitting under a single line of
 * text — minimalist, calm, and out of the way.
 */
export function LegalDocumentProgressOverlay({ state }: { state: LegalDocProgressState }) {
  if (!state.open) return null;

  const phaseLabel = PHASE_LABEL[state.phase];
  const pct = Math.max(0, Math.min(100, Math.round(state.percent || 0)));

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2 space-y-1.5"
    >
      <div className="flex items-center gap-2 text-[11px] tracking-tight">
        <Sparkles className="h-3 w-3 text-primary shrink-0 animate-pulse" />
        <span className="font-medium text-foreground truncate">{state.title || phaseLabel}</span>
        <span className="ml-auto tabular-nums text-muted-foreground text-[10px] font-light shrink-0">
          {pct}%
        </span>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-[10px] font-light text-muted-foreground tracking-tight truncate">
        {state.hint || phaseLabel}
      </p>
    </div>
  );
}
