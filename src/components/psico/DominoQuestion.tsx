import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { DominoSVG } from "./DominoSVG";
import { cn } from "@/lib/utils";

interface DominoData {
  series: [number, number][];
  options: [number, number][];
}

interface DominoQuestionProps {
  data: DominoData;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  disabled?: boolean;
}

export function DominoQuestion({ data, selectedAnswer, onSelect, disabled }: DominoQuestionProps) {
  return (
    <div className="space-y-8">
      {/* Series display */}
      <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
        {data.series.map((domino, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08, type: "spring", stiffness: 400 }}
            className="flex items-center gap-2 md:gap-3"
          >
            <DominoSVG top={domino[0]} bottom={domino[1]} size="md" />
            {idx < data.series.length - 1 && (
              <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
            )}
          </motion.div>
        ))}
        
        {/* Arrow to unknown */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: data.series.length * 0.08, type: "spring" }}
          className="flex items-center gap-2 md:gap-3"
        >
          <ArrowRight className="h-4 w-4 text-primary hidden sm:block" />
          
          {/* Unknown domino placeholder */}
          <motion.div
            animate={{ 
              boxShadow: ["0 0 0 0 hsl(var(--primary) / 0)", "0 0 0 6px hsl(var(--primary) / 0.1)", "0 0 0 0 hsl(var(--primary) / 0)"]
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="relative rounded-lg"
          >
            <DominoSVG top={0} bottom={0} isUnknown isHighlighted size="md" />
          </motion.div>
        </motion.div>
      </div>

      {/* Answer options */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 max-w-lg mx-auto">
        {data.options.map((option, idx) => {
          const optionId = String.fromCharCode(65 + idx); // A, B, C, D
          const isSelected = selectedAnswer === optionId;
          
          return (
            <motion.button
              key={idx}
              onClick={() => !disabled && onSelect(optionId)}
              disabled={disabled}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + idx * 0.06, type: "spring", stiffness: 400 }}
              whileHover={{ scale: disabled ? 1 : 1.03, y: disabled ? 0 : -2 }}
              whileTap={{ scale: disabled ? 1 : 0.97 }}
              className={cn(
                "relative p-3 md:p-4 rounded-xl transition-all duration-200",
                "border-2 flex flex-col items-center gap-2",
                isSelected 
                  ? "border-primary bg-primary/5 shadow-md shadow-primary/15" 
                  : "border-border/50 hover:border-primary/40 bg-card hover:bg-muted/30",
                disabled && "opacity-60 cursor-not-allowed"
              )}
            >
              {/* Option label */}
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                isSelected 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-muted-foreground"
              )}>
                {optionId}
              </span>
              
              <DominoSVG 
                top={option[0]} 
                bottom={option[1]} 
                isHighlighted={isSelected}
                size="sm"
              />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
