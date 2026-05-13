import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { CircularTimer } from "./CircularTimer";
import verdnaturaLogo from "@/assets/verdnatura-logo.png";

interface ProgressHeaderProps {
  currentIndex: number;
  totalQuestions: number;
  timeLeft: number;
  initialTimeLimit: number;
  globalTimeLeft: number;
}

export function ProgressHeader({
  currentIndex,
  totalQuestions,
  timeLeft,
  initialTimeLimit,
  globalTimeLeft
}: ProgressHeaderProps) {
  const progress = ((currentIndex + 1) / totalQuestions) * 100;
  const isLowGlobalTime = globalTimeLeft <= 60;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <header className="glass-header">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Logo and progress */}
          <div className="flex items-center gap-4">
            <motion.img 
              src={verdnaturaLogo} 
              alt="Verdnatura" 
              className="h-10 w-10"
              initial={{ rotate: -10 }}
              animate={{ rotate: 0 }}
              transition={{ type: "spring", stiffness: 200 }}
            />
            
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-foreground mb-1.5">
                Pregunta {currentIndex + 1} de {totalQuestions}
              </p>
              
              {/* Animated progress bar */}
              <div className="w-40 h-2.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>

          {/* Mobile progress indicator */}
          <div className="sm:hidden text-sm font-medium text-foreground">
            {currentIndex + 1}/{totalQuestions}
          </div>

          {/* Timers */}
          <div className="flex items-center gap-3">
            {/* Question timer - Circular */}
            <CircularTimer
              timeLeft={timeLeft}
              totalTime={initialTimeLimit}
              size={52}
              strokeWidth={3}
            />

            {/* Global timer */}
            <motion.div 
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300",
                isLowGlobalTime 
                  ? "bg-red-500/15 text-red-500 border border-red-500/30" 
                  : "bg-muted/50 text-muted-foreground"
              )}
              animate={isLowGlobalTime ? { scale: [1, 1.02, 1] } : {}}
              transition={isLowGlobalTime ? { duration: 1, repeat: Infinity } : {}}
            >
              <Clock className="h-4 w-4" />
              <span className="font-mono font-semibold text-sm">
                {formatTime(globalTimeLeft)}
              </span>
            </motion.div>
          </div>
        </div>
      </div>
    </header>
  );
}
