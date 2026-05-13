import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ComparisonData {
  figures: { id: string; content: string; lines?: number }[];
  type: "find_different" | "find_matching" | "count";
}

interface VisualComparisonQuestionProps {
  data: ComparisonData;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  disabled?: boolean;
}

// Simple figure renderer
function RenderFigure({ content, lines = 3 }: { content: string; lines?: number }) {
  // For "lines" type figures
  if (content.startsWith("lines_")) {
    const count = parseInt(content.split("_")[1]) || lines;
    return (
      <div className="w-full h-full flex items-center justify-center gap-1">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="w-1 h-8 bg-foreground/80 rounded-full" />
        ))}
      </div>
    );
  }

  // For shape-based figures
  const shapeMap: Record<string, JSX.Element> = {
    circle: <div className="w-8 h-8 rounded-full border-2 border-foreground" />,
    square: <div className="w-8 h-8 border-2 border-foreground" />,
    triangle: (
      <div 
        className="w-0 h-0 border-l-[16px] border-r-[16px] border-b-[28px] border-l-transparent border-r-transparent border-b-foreground"
      />
    ),
    diamond: (
      <div 
        className="w-6 h-6 border-2 border-foreground transform rotate-45"
      />
    ),
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      {shapeMap[content] || <span className="text-2xl">{content}</span>}
    </div>
  );
}

export function VisualComparisonQuestion({ 
  data, 
  selectedAnswer, 
  onSelect, 
  disabled 
}: VisualComparisonQuestionProps) {
  const gridCols = data.figures.length <= 4 ? 2 : 3;

  return (
    <div className="space-y-6">
      <div 
        className={cn(
          "grid gap-3 md:gap-4 max-w-md mx-auto",
          gridCols === 2 ? "grid-cols-2" : "grid-cols-3"
        )}
      >
        {data.figures.map((figure, idx) => {
          const isSelected = selectedAnswer === figure.id;
          
          return (
            <motion.button
              key={figure.id}
              onClick={() => !disabled && onSelect(figure.id)}
              disabled={disabled}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.06, type: "spring", stiffness: 400 }}
              whileHover={{ scale: disabled ? 1 : 1.03 }}
              whileTap={{ scale: disabled ? 1 : 0.97 }}
              className={cn(
                "relative aspect-square rounded-xl transition-all duration-200",
                "border-2 flex flex-col items-center justify-center p-4",
                isSelected 
                  ? "border-primary bg-primary/5 shadow-md shadow-primary/15" 
                  : "border-border/50 hover:border-primary/40 bg-card",
                disabled && "opacity-60 cursor-not-allowed"
              )}
            >
              {/* Label badge */}
              <span className={cn(
                "absolute top-2 left-2 text-xs font-medium px-2 py-0.5 rounded-full",
                isSelected 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-muted-foreground"
              )}>
                {figure.id}
              </span>
              
              <RenderFigure content={figure.content} lines={figure.lines} />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
