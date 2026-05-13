import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

type Props = {
  icon?: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  selected?: boolean;
  onClick: () => void;
  className?: string;
};

export function OptionCard({ icon, label, description, selected, onClick, className }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative w-full min-h-[64px] rounded-2xl border text-start px-5 py-4",
        "flex items-center gap-4 transition-all duration-200",
        "active:scale-[0.97]",
        selected
          ? "border-primary/60 bg-primary/10 shadow-[0_0_0_4px_hsl(var(--primary)/0.08)]"
          : "border-border bg-card/60 backdrop-blur-sm hover:border-foreground/30",
        className,
      )}
    >
      {icon && (
        <div className={cn(
          "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
          selected ? "bg-primary/20 text-primary" : "bg-muted text-foreground/70",
        )}>
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold tracking-tight text-foreground">{label}</div>
        {description && (
          <div className="text-xs font-light text-muted-foreground tracking-tight mt-0.5">{description}</div>
        )}
      </div>
      {selected && (
        <Check className="h-5 w-5 text-primary shrink-0" strokeWidth={2.5} />
      )}
    </button>
  );
}
