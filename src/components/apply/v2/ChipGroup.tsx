import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Chip = { value: string; label: ReactNode };

type Props = {
  options: Chip[];
  value: string | string[];
  onChange: (v: string) => void;
  multi?: boolean;
};

export function ChipGroup({ options, value, onChange, multi }: Props) {
  const isSelected = (v: string) =>
    multi ? Array.isArray(value) && value.includes(v) : value === v;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const sel = isSelected(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-4 h-11 rounded-full border text-sm font-semibold tracking-tight",
              "transition-all duration-200 active:scale-[0.96]",
              sel
                ? "border-primary/60 bg-primary/15 text-foreground"
                : "border-border bg-card/60 text-foreground/80 hover:border-foreground/30",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
