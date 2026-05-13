import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Scissors, Eye, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaperFoldData {
  foldSteps: string[];
  punchPosition?: string;
  instruction?: string;
  options: { id: string; pattern: string }[];
}

interface PaperFoldQuestionProps {
  data: PaperFoldData;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  disabled?: boolean;
}

// Simple hole pattern representations
const holePatterns: Record<string, React.ReactNode> = {
  single_center: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <rect x="5" y="5" width="50" height="50" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="30" cy="30" r="4" fill="currentColor" />
    </svg>
  ),
  four_corners: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <rect x="5" y="5" width="50" height="50" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="15" cy="15" r="3" fill="currentColor" />
      <circle cx="45" cy="15" r="3" fill="currentColor" />
      <circle cx="15" cy="45" r="3" fill="currentColor" />
      <circle cx="45" cy="45" r="3" fill="currentColor" />
    </svg>
  ),
  two_horizontal: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <rect x="5" y="5" width="50" height="50" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="20" cy="30" r="3" fill="currentColor" />
      <circle cx="40" cy="30" r="3" fill="currentColor" />
    </svg>
  ),
  two_vertical: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <rect x="5" y="5" width="50" height="50" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="30" cy="20" r="3" fill="currentColor" />
      <circle cx="30" cy="40" r="3" fill="currentColor" />
    </svg>
  ),
  diagonal_line: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <rect x="5" y="5" width="50" height="50" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="15" cy="15" r="3" fill="currentColor" />
      <circle cx="30" cy="30" r="3" fill="currentColor" />
      <circle cx="45" cy="45" r="3" fill="currentColor" />
    </svg>
  ),
  cross_pattern: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <rect x="5" y="5" width="50" height="50" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="30" cy="15" r="3" fill="currentColor" />
      <circle cx="15" cy="30" r="3" fill="currentColor" />
      <circle cx="30" cy="30" r="3" fill="currentColor" />
      <circle cx="45" cy="30" r="3" fill="currentColor" />
      <circle cx="30" cy="45" r="3" fill="currentColor" />
    </svg>
  ),
  eight_symmetric: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <rect x="5" y="5" width="50" height="50" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="15" cy="15" r="2" fill="currentColor" />
      <circle cx="45" cy="15" r="2" fill="currentColor" />
      <circle cx="15" cy="45" r="2" fill="currentColor" />
      <circle cx="45" cy="45" r="2" fill="currentColor" />
      <circle cx="30" cy="15" r="2" fill="currentColor" />
      <circle cx="30" cy="45" r="2" fill="currentColor" />
      <circle cx="15" cy="30" r="2" fill="currentColor" />
      <circle cx="45" cy="30" r="2" fill="currentColor" />
    </svg>
  ),
  asymmetric: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <rect x="5" y="5" width="50" height="50" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="15" cy="20" r="3" fill="currentColor" />
      <circle cx="40" cy="35" r="3" fill="currentColor" />
    </svg>
  ),
};

export function PaperFoldQuestion({ data, selectedAnswer, onSelect, disabled }: PaperFoldQuestionProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showingAnimation, setShowingAnimation] = useState(true);

  // Animate through fold steps
  useEffect(() => {
    if (!showingAnimation) return;

    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= data.foldSteps.length) {
          setShowingAnimation(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1200);

    return () => clearInterval(timer);
  }, [data.foldSteps.length, showingAnimation]);

  const resetAnimation = () => {
    setCurrentStep(0);
    setShowingAnimation(true);
  };

  const renderPattern = (patternKey: string) => {
    const pattern = holePatterns[patternKey];
    if (pattern) {
      return <div className="text-foreground">{pattern}</div>;
    }
    return <span className="text-2xl">{patternKey}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Instruction */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          {data.instruction || "Se pliega el papel y se hace un agujero. ¿Cómo queda al desplegarlo?"}
        </p>
      </div>

      {/* Fold animation area */}
      <div className="flex items-center justify-center gap-4">
        <motion.div
          className="relative w-40 h-40 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-950/20 border-2 border-blue-200 dark:border-blue-800 flex items-center justify-center overflow-hidden"
          animate={{
            scaleX: currentStep >= 1 ? 0.5 : 1,
            scaleY: currentStep >= 2 ? 0.5 : 1,
          }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          {/* Paper texture lines */}
          <div className="absolute inset-0 opacity-20">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="absolute w-full h-px bg-blue-300 dark:bg-blue-600"
                style={{ top: `${(i + 1) * 20}%` }}
              />
            ))}
          </div>

          {/* Punch hole indicator */}
          <AnimatePresence>
            {currentStep >= data.foldSteps.length && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute"
              >
                <Scissors className="h-8 w-8 text-red-500" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Fold steps indicator */}
        <div className="space-y-2">
          {data.foldSteps.map((step, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0.3 }}
              animate={{ opacity: currentStep > idx ? 1 : 0.3 }}
              className={cn(
                "text-xs px-3 py-1 rounded-full",
                currentStep > idx
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {step}
            </motion.div>
          ))}
          <motion.div
            initial={{ opacity: 0.3 }}
            animate={{ opacity: currentStep >= data.foldSteps.length ? 1 : 0.3 }}
            className={cn(
              "text-xs px-3 py-1 rounded-full flex items-center gap-1",
              currentStep >= data.foldSteps.length
                ? "bg-red-500/20 text-red-500"
                : "bg-muted text-muted-foreground"
            )}
          >
            <Scissors className="h-3 w-3" />
            Perforar
          </motion.div>
        </div>
      </div>

      {/* Replay button */}
      <div className="flex justify-center">
        <button
          onClick={resetAnimation}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Ver animación de nuevo
        </button>
      </div>

      {/* Separator */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-border" />
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">¿Cómo queda al desplegar?</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Options grid */}
      <div className={cn(
        "grid gap-4",
        data.options.length <= 2 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"
      )}>
        {data.options.map((option, idx) => {
          const isSelected = selectedAnswer === option.id;

          return (
            <motion.button
              key={option.id}
              onClick={() => !disabled && onSelect(option.id)}
              disabled={disabled}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + idx * 0.1 }}
              whileHover={{ scale: disabled ? 1 : 1.05 }}
              whileTap={{ scale: disabled ? 1 : 0.95 }}
              className={cn(
                "aspect-square p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2",
                isSelected
                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                  : "border-border hover:border-primary/50 bg-card",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {/* Option label */}
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}>
                {option.id}
              </div>

              {/* Pattern */}
              <div className="w-16 h-16 flex items-center justify-center">
                {renderPattern(option.pattern)}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
