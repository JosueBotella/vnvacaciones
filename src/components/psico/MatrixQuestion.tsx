import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface MatrixData {
  grid: string[][]; // 3x3 grid where last cell might be "?"
  options: { id: string; symbol: string; image?: string }[];
}

interface MatrixQuestionProps {
  data: MatrixData;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  disabled?: boolean;
}

// Symbol renderer
function RenderSymbol({ symbol, size = "md" }: { symbol: string; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "w-8 h-8 text-lg" : "w-12 h-12 text-2xl";
  
  if (symbol === "?") {
    return (
      <motion.div 
        className={cn(sizeClass, "flex items-center justify-center text-primary font-bold")}
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        ?
      </motion.div>
    );
  }

  // Map symbol names to actual symbols/emojis
  const symbolMap: Record<string, string> = {
    "circle": "○",
    "circle_filled": "●",
    "square": "□",
    "square_filled": "■",
    "triangle": "△",
    "triangle_filled": "▲",
    "diamond": "◇",
    "diamond_filled": "◆",
    "star": "☆",
    "star_filled": "★",
    "arrow_up": "↑",
    "arrow_down": "↓",
    "arrow_left": "←",
    "arrow_right": "→",
    "plus": "+",
    "minus": "−",
    "cross": "×",
    "dot": "•",
  };

  const displaySymbol = symbolMap[symbol] || symbol;

  return (
    <div className={cn(sizeClass, "flex items-center justify-center text-foreground font-medium")}>
      {displaySymbol}
    </div>
  );
}

export function MatrixQuestion({ data, selectedAnswer, onSelect, disabled }: MatrixQuestionProps) {
  return (
    <div className="space-y-8">
      {/* Matrix grid */}
      <motion.div 
        className="flex justify-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        <div className="inline-grid grid-cols-3 gap-1 p-3 bg-muted/50 rounded-xl border border-border/50">
          {data.grid.flat().map((symbol, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.04, type: "spring" }}
              className={cn(
                "w-14 h-14 md:w-16 md:h-16 flex items-center justify-center",
                "bg-card rounded-lg border",
                symbol === "?" 
                  ? "border-primary/50 bg-primary/5" 
                  : "border-border/30"
              )}
            >
              <RenderSymbol symbol={symbol} size="md" />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Options */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-md mx-auto">
        {data.options.map((option, idx) => {
          const isSelected = selectedAnswer === option.id;
          
          return (
            <motion.button
              key={option.id}
              onClick={() => !disabled && onSelect(option.id)}
              disabled={disabled}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + idx * 0.05 }}
              whileHover={{ scale: disabled ? 1 : 1.05 }}
              whileTap={{ scale: disabled ? 1 : 0.95 }}
              className={cn(
                "relative p-4 rounded-xl transition-all duration-200",
                "border-2 flex flex-col items-center gap-2",
                isSelected 
                  ? "border-primary bg-primary/5 shadow-md shadow-primary/15" 
                  : "border-border/50 hover:border-primary/40 bg-card",
                disabled && "opacity-60 cursor-not-allowed"
              )}
            >
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                isSelected 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-muted-foreground"
              )}>
                {option.id}
              </span>
              
              {option.image ? (
                <img src={option.image} alt={option.id} className="w-10 h-10 object-contain" />
              ) : (
                <RenderSymbol symbol={option.symbol} size="md" />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
