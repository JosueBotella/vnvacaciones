import { cn } from "@/lib/utils";

interface DominoSVGProps {
  top: number;
  bottom: number;
  className?: string;
  isHighlighted?: boolean;
  isUnknown?: boolean;
  size?: "sm" | "md" | "lg";
}

// Dot positions for domino faces (0-6) - base coordinates in 100x100 cell
const DOT_POSITIONS: Record<number, [number, number][]> = {
  0: [],
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[30, 30], [50, 50], [70, 70]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
  6: [[30, 30], [70, 30], [30, 50], [70, 50], [30, 70], [70, 70]],
};

const SIZES = {
  sm: { scale: 0.5, dotR: 8 },
  md: { scale: 0.7, dotR: 9 },
  lg: { scale: 0.9, dotR: 10 },
};

export function DominoSVG({ 
  top, 
  bottom, 
  className, 
  isHighlighted = false, 
  isUnknown = false,
  size = "md" 
}: DominoSVGProps) {
  const { scale, dotR } = SIZES[size];
  const width = 100 * scale;
  const height = 200 * scale;

  const renderDots = (value: number, yOffset: number) => {
    if (isUnknown) {
      return (
        <text
          x="50"
          y={yOffset + 50}
          textAnchor="middle"
          dominantBaseline="middle"
          className={cn(
            "font-bold",
            isHighlighted ? "fill-primary" : "fill-muted-foreground"
          )}
          style={{ fontSize: 32 }}
        >
          ?
        </text>
      );
    }

    return DOT_POSITIONS[value]?.map((pos, idx) => (
      <circle
        key={idx}
        cx={pos[0]}
        cy={yOffset + pos[1]}
        r={dotR}
        className={cn(
          "transition-colors",
          isHighlighted ? "fill-primary" : "fill-foreground"
        )}
      />
    ));
  };

  return (
    <svg
      viewBox="0 0 100 200"
      width={width}
      height={height}
      className={cn(
        "transition-all duration-200",
        isHighlighted && "scale-105",
        className
      )}
    >
      {/* Domino background */}
      <rect
        x="4"
        y="4"
        width="92"
        height="192"
        rx="10"
        className={cn(
          "transition-colors",
          isHighlighted 
            ? "fill-primary/10 stroke-primary stroke-2" 
            : "fill-card stroke-border stroke-[1.5]"
        )}
      />
      
      {/* Top half */}
      <g>{renderDots(top, 0)}</g>
      
      {/* Divider line */}
      <line
        x1="15"
        y1="100"
        x2="85"
        y2="100"
        strokeWidth="1.5"
        className={cn(
          "transition-colors",
          isHighlighted ? "stroke-primary/50" : "stroke-border"
        )}
      />
      
      {/* Bottom half */}
      <g>{renderDots(bottom, 100)}</g>
    </svg>
  );
}
