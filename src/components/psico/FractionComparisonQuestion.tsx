import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FractionOption {
  id: string;
  display: string; // e.g., "2/3", "0.75", "3/4"
  type: "fraction" | "decimal";
}

interface FractionComparisonData {
  question: string;
  options: FractionOption[];
}

interface FractionComparisonQuestionProps {
  data: FractionComparisonData;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  disabled?: boolean;
}

// Fraction renderer
function RenderFraction({ display, type }: { display: string; type: "fraction" | "decimal" }) {
  if (type === "decimal") {
    return (
      <span className="text-2xl font-semibold text-foreground">
        {display}
      </span>
    );
  }

  // For fractions like "2/3"
  const parts = display.split("/");
  if (parts.length === 2) {
    return (
      <div className="flex flex-col items-center">
        <span className="text-xl font-semibold text-foreground border-b-2 border-foreground px-2">
          {parts[0]}
        </span>
        <span className="text-xl font-semibold text-foreground px-2">
          {parts[1]}
        </span>
      </div>
    );
  }

  return (
    <span className="text-2xl font-semibold text-foreground">
      {display}
    </span>
  );
}

export function FractionComparisonQuestion({ 
  data, 
  selectedAnswer, 
  onSelect, 
  disabled 
}: FractionComparisonQuestionProps) {
  return (
    <div className="space-y-6">
      {/* Options */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto">
        {data.options.map((option, idx) => {
          const isSelected = selectedAnswer === option.id;
          
          return (
            <motion.button
              key={option.id}
              onClick={() => !disabled && onSelect(option.id)}
              disabled={disabled}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08, type: "spring", stiffness: 400 }}
              whileHover={{ scale: disabled ? 1 : 1.05 }}
              whileTap={{ scale: disabled ? 1 : 0.95 }}
              className={cn(
                "relative p-5 rounded-xl transition-all duration-200",
                "border-2 flex flex-col items-center gap-3 min-h-[100px]",
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
              
              <RenderFraction display={option.display} type={option.type} />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
