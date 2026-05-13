import { UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<Size, { ring: string; text: string; px: number }> = {
  xs: { ring: "h-5 w-5", text: "text-[9px]", px: 20 },
  sm: { ring: "h-6 w-6", text: "text-[10px]", px: 24 },
  md: { ring: "h-8 w-8", text: "text-[11px]", px: 32 },
  lg: { ring: "h-12 w-12", text: "text-sm", px: 48 },
  xl: { ring: "h-20 w-20", text: "text-xl", px: 80 },
};

export function getInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/** Stable HSL hue from name (0-360) */
export function hashHue(name?: string | null): number {
  if (!name) return 220;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

type ManagerAvatarProps = {
  name?: string | null;
  avatarUrl?: string | null;
  size?: Size;
  showTooltip?: boolean;
  unassignedLabel?: string;
  className?: string;
  ringClassName?: string;
};

/**
 * Circular avatar for managers. Falls back to initials over a stable color
 * generated from the name. If name+avatar are both null, shows a discrete
 * "unassigned" icon.
 */
export function ManagerAvatar({
  name,
  avatarUrl,
  size = "sm",
  showTooltip = true,
  unassignedLabel = "Sin asignar",
  className,
  ringClassName,
}: ManagerAvatarProps) {
  const s = SIZE_CLASSES[size];
  const hasName = !!name?.trim();
  const tooltipText = hasName ? name! : unassignedLabel;

  const inner = !hasName ? (
    <div
      className={cn(
        "rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center border border-dashed border-border/60",
        s.ring,
        ringClassName,
      )}
      aria-label={unassignedLabel}
    >
      <UserPlus className="h-3 w-3" />
    </div>
  ) : avatarUrl ? (
    <img
      src={avatarUrl}
      alt={name!}
      width={s.px}
      height={s.px}
      className={cn(
        "rounded-full object-cover ring-2 ring-background shadow-sm",
        s.ring,
        ringClassName,
      )}
      onError={(e) => {
        // hide broken image, fallback rendered separately would need state; simplest = inline SVG fallback
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  ) : (
    <div
      style={{ background: `hsl(${hashHue(name)} 65% 55%)` }}
      className={cn(
        "rounded-full text-white font-semibold flex items-center justify-center ring-2 ring-background shadow-sm select-none",
        s.ring,
        s.text,
        ringClassName,
      )}
      aria-label={name!}
    >
      {getInitials(name)}
    </div>
  );

  if (!showTooltip) return <span className={className}>{inner}</span>;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex", className)}>{inner}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
