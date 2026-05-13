import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumberSeriesData {
  series: (number | string)[]; // Numbers in the series, last might be "?"
  options: { id: string; value: string | number }[];
}

interface NumberSeriesQuestionProps {
  data: NumberSeriesData;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  disabled?: boolean;
}

export function NumberSeriesQuestion({ 
  data, 
  selectedAnswer, 
  onSelect, 
  disabled 
}: NumberSeriesQuestionProps) {
  return (
    <div className="space-y-8">
      {/* Series display */}
      <motion.div 
        className="flex flex-wrap items-center justify-center gap-2 md:gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {data.series.map((num, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: idx * 0.08, type: "spring", stiffness: 400 }}
            className="flex items-center gap-2 md:gap-3"
          >
            <div className={cn(
              "min-w-12 h-12 md:min-w-14 md:h-14 px-3 rounded-lg flex items-center justify-center",
              "border-2 text-lg md:text-xl font-semibold",
              num === "?" 
                ? "border-primary/50 bg-primary/5 text-primary" 
                : "border-border bg-card text-foreground"
            )}>
              {num === "?" ? (
                <motion.span
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  ?
                </motion.span>
              ) : num}
            </div>
            
            {idx < data.series.length - 1 && (
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
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
              transition={{ delay: 0.35 + idx * 0.05 }}
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
              
              <span className="text-xl font-semibold text-foreground">
                {option.value}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
