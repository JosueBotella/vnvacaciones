import { motion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface RotationData {
  type: "2d" | "3d" | "mirror";
  mainFigure: string;
  rotationAngle?: number;
  instruction?: string;
  options: { id: string; figure: string; isRotated?: boolean }[];
}

interface RotationQuestionProps {
  data: RotationData;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  disabled?: boolean;
}

// SVG shapes for rotation challenges
const shapes: Record<string, React.ReactNode> = {
  L_shape: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <path d="M10 10 L10 50 L30 50 L30 30 L20 30 L20 10 Z" fill="currentColor" />
    </svg>
  ),
  L_rotated_90: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <path d="M10 10 L50 10 L50 20 L30 20 L30 40 L10 40 Z" fill="currentColor" />
    </svg>
  ),
  L_rotated_180: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <path d="M30 10 L40 10 L40 50 L10 50 L10 40 L30 40 Z" fill="currentColor" />
    </svg>
  ),
  L_rotated_270: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <path d="M10 40 L10 50 L50 50 L50 20 L40 20 L40 40 Z" fill="currentColor" />
    </svg>
  ),
  L_mirrored: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <path d="M40 10 L40 50 L30 50 L30 30 L50 30 L50 10 Z" fill="currentColor" />
    </svg>
  ),
  T_shape: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <path d="M10 10 L50 10 L50 20 L35 20 L35 50 L25 50 L25 20 L10 20 Z" fill="currentColor" />
    </svg>
  ),
  T_rotated_90: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <path d="M40 10 L50 10 L50 50 L40 50 L40 35 L10 35 L10 25 L40 25 Z" fill="currentColor" />
    </svg>
  ),
  arrow_up: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <path d="M30 5 L50 25 L38 25 L38 55 L22 55 L22 25 L10 25 Z" fill="currentColor" />
    </svg>
  ),
  arrow_right: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <path d="M55 30 L35 50 L35 38 L5 38 L5 22 L35 22 L35 10 Z" fill="currentColor" />
    </svg>
  ),
  arrow_down: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <path d="M30 55 L10 35 L22 35 L22 5 L38 5 L38 35 L50 35 Z" fill="currentColor" />
    </svg>
  ),
  arrow_left: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <path d="M5 30 L25 10 L25 22 L55 22 L55 38 L25 38 L25 50 Z" fill="currentColor" />
    </svg>
  ),
  cube_3d: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <polygon points="30,5 55,20 55,45 30,55 5,45 5,20" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="30" y1="5" x2="30" y2="30" stroke="currentColor" strokeWidth="2" />
      <line x1="5" y1="20" x2="30" y2="30" stroke="currentColor" strokeWidth="2" />
      <line x1="55" y1="20" x2="30" y2="30" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  cube_rotated: (
    <svg viewBox="0 0 60 60" className="w-full h-full">
      <polygon points="15,10 45,10 55,25 45,55 15,55 5,25" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="15" y1="10" x2="15" y2="35" stroke="currentColor" strokeWidth="2" />
      <line x1="45" y1="10" x2="45" y2="35" stroke="currentColor" strokeWidth="2" />
      <line x1="15" y1="35" x2="45" y2="35" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
};

export function RotationQuestion({ data, selectedAnswer, onSelect, disabled }: RotationQuestionProps) {
  const renderFigure = (figureKey: string, className?: string) => {
    const shape = shapes[figureKey];
    if (shape) {
      return <div className={cn("text-foreground", className)}>{shape}</div>;
    }
    // Fallback to emoji/text
    return <span className="text-3xl">{figureKey}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Main figure display */}
      <div className="flex flex-col items-center gap-4">
        {data.instruction && (
          <p className="text-sm text-muted-foreground text-center">
            {data.instruction}
          </p>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.9, rotateY: -30 }}
          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary/30 flex items-center justify-center p-4 shadow-lg">
            {renderFigure(data.mainFigure, "w-20 h-20")}
          </div>
          
          {/* Rotation indicator */}
          {data.rotationAngle && (
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white shadow-lg"
            >
              <RotateCw className="h-5 w-5" />
            </motion.div>
          )}
        </motion.div>

        {data.rotationAngle && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-lg font-medium text-primary"
          >
            Rotación: {data.rotationAngle}°
          </motion.p>
        )}
      </div>

      {/* Separator */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-sm text-muted-foreground">¿Cuál es el resultado?</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Options grid */}
      <div className={cn(
        "grid gap-4",
        data.options.length <= 2 ? "grid-cols-2" :
        data.options.length === 3 ? "grid-cols-3" :
        "grid-cols-2 md:grid-cols-4"
      )}>
        {data.options.map((option, idx) => {
          const isSelected = selectedAnswer === option.id;

          return (
            <motion.button
              key={option.id}
              onClick={() => !disabled && onSelect(option.id)}
              disabled={disabled}
              initial={{ opacity: 0, y: 20, rotateX: -20 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: 0.2 + idx * 0.1, duration: 0.4 }}
              whileHover={{ scale: disabled ? 1 : 1.05, rotateY: 5 }}
              whileTap={{ scale: disabled ? 1 : 0.95 }}
              className={cn(
                "aspect-square p-4 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2",
                isSelected
                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                  : "border-border hover:border-primary/50 bg-card",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {/* Option label */}
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}>
                {option.id}
              </div>

              {/* Figure */}
              <div className="w-16 h-16 flex items-center justify-center">
                {renderFigure(option.figure, "w-12 h-12")}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
