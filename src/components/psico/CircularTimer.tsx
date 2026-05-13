import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CircularTimerProps {
  timeLeft: number;
  totalTime: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function CircularTimer({ 
  timeLeft, 
  totalTime, 
  size = 56, 
  strokeWidth = 4,
  className 
}: CircularTimerProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = timeLeft / totalTime;
  const strokeDashoffset = circumference * (1 - progress);
  
  const isLow = timeLeft <= 10;
  const isCritical = timeLeft <= 5;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Color based on time remaining
  const getColor = () => {
    if (isCritical) return "stroke-red-500";
    if (isLow) return "stroke-amber-500";
    return "stroke-primary";
  };

  return (
    <motion.div 
      className={cn("relative inline-flex items-center justify-center", className)}
      animate={isCritical ? { scale: [1, 1.05, 1] } : {}}
      transition={isCritical ? { duration: 0.5, repeat: Infinity } : {}}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-muted/30"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          className={cn("transition-colors duration-300", getColor())}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: 0 }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.3, ease: "linear" }}
        />
      </svg>
      {/* Time text */}
      <div className={cn(
        "absolute inset-0 flex items-center justify-center",
        "font-mono text-sm font-bold transition-colors duration-300",
        isCritical ? "text-red-500" : isLow ? "text-amber-500" : "text-foreground"
      )}>
        {formatTime(timeLeft)}
      </div>
    </motion.div>
  );
}
