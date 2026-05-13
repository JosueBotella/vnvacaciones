import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SequenceData {
  sequence: string[]; // The sequence shown (last should be "?")
  options: { id: string; value: string }[];
}

interface SequenceQuestionProps {
  data: SequenceData;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  disabled?: boolean;
}

// Symbol/arrow renderer
function RenderSequenceItem({ value, isUnknown }: { value: string; isUnknown?: boolean }) {
  const arrowMap: Record<string, string> = {
    "up": "↑",
    "down": "↓",
    "left": "←",
    "right": "→",
    "up_right": "↗",
    "up_left": "↖",
    "down_right": "↘",
    "down_left": "↙",
  };

  if (isUnknown || value === "?") {
    return (
      <motion.div 
        className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-2xl font-bold text-primary"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        ?
      </motion.div>
    );
  }

  const displayValue = arrowMap[value] || value;

  return (
    <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-2xl text-foreground">
      {displayValue}
    </div>
  );
}

export function SequenceQuestion({ data, selectedAnswer, onSelect, disabled }: SequenceQuestionProps) {
  return (
    <div className="space-y-8">
      {/* Sequence display */}
      <motion.div 
        className="flex flex-wrap items-center justify-center gap-2 md:gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {data.sequence.map((item, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1, type: "spring" }}
            className="flex items-center gap-2"
          >
            <div className={cn(
              "w-12 h-12 md:w-14 md:h-14 rounded-lg flex items-center justify-center",
              "border-2 transition-all",
              item === "?" 
                ? "border-primary/50 bg-primary/5 shadow-md shadow-primary/10" 
                : "border-border bg-card"
            )}>
              <RenderSequenceItem value={item} isUnknown={item === "?"} />
            </div>
            
            {idx < data.sequence.length - 1 && (
              <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
            )}
          </motion.div>
        ))}
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
              transition={{ delay: 0.4 + idx * 0.05 }}
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
              
              <RenderSequenceItem value={option.value} />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
