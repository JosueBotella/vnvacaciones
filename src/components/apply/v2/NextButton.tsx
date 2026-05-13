import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  variant?: "circle" | "full" | "primary";
};

export function NextButton({ onClick, disabled, loading, label = "OK", variant = "full" }: Props) {
  if (variant === "circle") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        aria-label={label}
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center shrink-0",
          "transition-all duration-200 active:scale-[0.94]",
          disabled
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-foreground text-background hover:bg-foreground/90 shadow-lg",
        )}
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
      </button>
    );
  }
  if (variant === "primary") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className={cn(
          "w-full h-16 rounded-2xl font-semibold tracking-tight text-base",
          "flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98]",
          disabled
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {loading && <Loader2 className="h-5 w-5 animate-spin" />}
        <span>{label}</span>
        {!loading && <ArrowRight className="h-5 w-5" />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "w-full h-14 rounded-2xl font-semibold tracking-tight text-base",
        "flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98]",
        disabled
          ? "bg-muted text-muted-foreground cursor-not-allowed"
          : "bg-foreground text-background hover:bg-foreground/90 shadow-lg",
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
      {!loading && <ArrowRight className="h-4 w-4" />}
    </button>
  );
}
