import { AlertTriangle, Scale, FileWarning, UserX, ShieldAlert, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export interface SanctionSuggestion {
  workerId: string;
  workerName: string;
  counts: {
    leve: number;
    grave: number;
    muy_grave: number;
    amonestaciones?: number;
    sanciones_leves?: number;
    sanciones_graves?: number;
    sanciones_muy_graves?: number;
  };
  thresholds: {
    leves: number;
    graves: number;
    muy_graves: number;
    amonestaciones?: number;
    periodo_amonestaciones?: number;
    graves_despido?: number;
    muy_graves_despido?: number;
  };
  periodDays: number;
  urgency: 'warning' | 'critical' | 'dismissal';
  recommendedAction: 'amonestacion' | 'sancion';
  ruleDescription?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: SanctionSuggestion[];
  onCreateAmonestacion: (suggestion: SanctionSuggestion) => void;
  onCreateSancion: (suggestion: SanctionSuggestion) => void;
  onDismiss: () => void;
}

function HistoryRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/30">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-bold tabular-nums", color)}>{count}</span>
    </div>
  );
}

function ThresholdBar({ label, count, threshold, color }: { label: string; count: number; threshold: number; color: string }) {
  if (threshold <= 0) return null;
  const pct = Math.min((count / threshold) * 100, 100);
  const exceeded = count >= threshold;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground capitalize">{label}</span>
        <span className={cn("font-semibold tabular-nums", exceeded ? "text-destructive" : "text-foreground")}>
          {count}/{threshold}
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={cn("h-full rounded-full", color)}
        />
      </div>
    </div>
  );
}

function DismissalCard({ s, onCreateSancion, onDismiss }: { s: SanctionSuggestion; onCreateSancion: (s: SanctionSuggestion) => void; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-2xl border-2 border-red-600/40 bg-gradient-to-b from-red-950/80 via-red-950/50 to-background p-5 space-y-4"
    >
      <div className="flex flex-col items-center text-center space-y-3">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
        >
          <div className="h-16 w-16 rounded-2xl bg-red-600/20 flex items-center justify-center">
            <UserX className="h-9 w-9 text-red-500" />
          </div>
        </motion.div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-400">Considerar despido</p>
          <h3 className="text-base font-bold text-foreground mt-1">{s.workerName}</h3>
        </div>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        En los últimos <span className="font-semibold text-foreground">{s.periodDays} días</span>, este trabajador ha acumulado:
      </p>

      <div className="space-y-1">
        <HistoryRow label="Amonestaciones" count={s.counts.amonestaciones ?? 0} color="text-blue-500" />
        <HistoryRow label="Sanciones leves" count={s.counts.sanciones_leves ?? 0} color="text-amber-500" />
        <HistoryRow label="Sanciones graves" count={s.counts.sanciones_graves ?? 0} color="text-orange-500" />
        <HistoryRow label="Sanciones muy graves" count={s.counts.sanciones_muy_graves ?? 0} color="text-red-500" />
      </div>

      <div className="space-y-2 pt-2">
        <Button
          className="w-full h-11 rounded-xl gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold"
          onClick={() => onCreateSancion(s)}
        >
          <Scale className="h-4 w-4" />
          Proponer sanción
        </Button>
        <Button
          variant="outline"
          className="w-full h-11 rounded-xl text-sm"
          onClick={onDismiss}
        >
          Entendido, revisar después
        </Button>
      </div>
    </motion.div>
  );
}

function StandardCard({ s, onCreateAmonestacion, onCreateSancion }: {
  s: SanctionSuggestion;
  onCreateAmonestacion: (s: SanctionSuggestion) => void;
  onCreateSancion: (s: SanctionSuggestion) => void;
}) {
  const isCritical = s.urgency === 'critical';
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "rounded-2xl border p-4 space-y-3",
        isCritical ? "border-destructive/30 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"
      )}
    >
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm text-foreground">{s.workerName}</h4>
        <span className={cn(
          "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
          isCritical
            ? "bg-destructive/15 text-destructive"
            : "bg-amber-500/15 text-amber-600"
        )}>
          {isCritical ? 'Superado' : 'Próximo'}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Últimos {s.periodDays} días
      </p>

      {/* Escalation rule description */}
      {s.ruleDescription && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            📋 {s.ruleDescription}
          </p>
        </div>
      )}

      {/* History summary */}
      <div className="grid grid-cols-2 gap-1">
        <HistoryRow label="Amonestaciones" count={s.counts.amonestaciones ?? 0} color="text-blue-500" />
        <HistoryRow label="Leves" count={s.counts.sanciones_leves ?? 0} color="text-amber-500" />
        <HistoryRow label="Graves" count={s.counts.sanciones_graves ?? 0} color="text-orange-500" />
        <HistoryRow label="Muy graves" count={s.counts.sanciones_muy_graves ?? 0} color="text-red-500" />
      </div>

      {/* Threshold bars */}
      <div className="space-y-2 pt-1">
        <ThresholdBar label="Leves" count={s.counts.leve} threshold={s.thresholds.leves} color="bg-primary" />
        <ThresholdBar label="Graves" count={s.counts.grave} threshold={s.thresholds.graves} color="bg-amber-500" />
        <ThresholdBar label="Muy graves" count={s.counts.muy_grave} threshold={s.thresholds.muy_graves} color="bg-destructive" />
        {s.counts.amonestaciones != null && s.thresholds.amonestaciones != null && s.thresholds.amonestaciones > 0 && (
          <ThresholdBar label="Amonestaciones" count={s.counts.amonestaciones} threshold={s.thresholds.amonestaciones} color="bg-blue-500" />
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1 gap-1.5 text-xs h-10 rounded-xl"
          onClick={() => onCreateAmonestacion(s)}
        >
          <FileWarning className="h-3.5 w-3.5" />
          Crear amonestación
        </Button>
        {(s.counts.grave > 0 || s.counts.muy_grave > 0) && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5 text-xs h-10 rounded-xl border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
            onClick={() => onCreateSancion(s)}
          >
            <Scale className="h-3.5 w-3.5" />
            Proponer sanción
          </Button>
        )}
      </div>
    </motion.div>
  );
}

export function SanctionSuggestionDialog({ open, onOpenChange, suggestions, onCreateAmonestacion, onCreateSancion, onDismiss }: Props) {
  if (suggestions.length === 0) return null;

  const hasDismissal = suggestions.some(s => s.urgency === 'dismissal');
  const hasCritical = suggestions.some(s => s.urgency === 'critical');

  const dismissalSuggestions = suggestions.filter(s => s.urgency === 'dismissal');
  const otherSuggestions = suggestions.filter(s => s.urgency !== 'dismissal');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "max-w-md mx-auto rounded-2xl max-h-[85vh] overflow-hidden flex flex-col",
        hasDismissal && "border-red-600/30"
      )} hideCloseButton>
        <DialogHeader className="text-center space-y-2 shrink-0">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="mx-auto"
          >
            <div className={cn(
              "h-14 w-14 rounded-2xl flex items-center justify-center",
              hasDismissal ? "bg-red-600/15" : hasCritical ? "bg-destructive/10" : "bg-amber-500/10"
            )}>
              {hasDismissal ? (
                <ShieldAlert className="h-7 w-7 text-red-500" />
              ) : (
                <AlertTriangle className={cn(
                  "h-7 w-7",
                  hasCritical ? "text-destructive" : "text-amber-500"
                )} />
              )}
            </div>
          </motion.div>
          <DialogTitle className="text-lg">
            {hasDismissal ? "⚠️ Alerta de riesgo" : hasCritical ? "⚠️ Umbral superado" : "Aviso de umbral"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {hasDismissal
              ? "Se han alcanzado umbrales críticos de sanciones"
              : "La incidencia se ha registrado correctamente. Según las reglas configuradas, se recomienda formalizar una acción disciplinaria."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2 overflow-y-auto flex-1 min-h-0 px-1">
          {/* Dismissal cards first */}
          {dismissalSuggestions.map((s) => (
            <DismissalCard key={s.workerId} s={s} onCreateSancion={onCreateSancion} onDismiss={onDismiss} />
          ))}

          {/* Standard warning/critical cards */}
          {otherSuggestions.map((s) => (
            <StandardCard key={s.workerId} s={s} onCreateAmonestacion={onCreateAmonestacion} onCreateSancion={onCreateSancion} />
          ))}
        </div>

        <Button
          variant="ghost"
          className="w-full text-muted-foreground text-sm mt-1 h-10 rounded-xl shrink-0"
          onClick={onDismiss}
        >
          Ahora no
        </Button>
      </DialogContent>
    </Dialog>
  );
}
