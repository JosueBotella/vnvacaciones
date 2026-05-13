import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GeometricData {
  type: "fold" | "cube" | "layers" | "transform";
  mainImage?: string;
  description?: string;
  layers?: string[];
  options: { id: string; image?: string; text?: string }[];
}

interface GeometricQuestionProps {
  data: GeometricData;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  disabled?: boolean;
}

export function GeometricQuestion({ data, selectedAnswer, onSelect, disabled }: GeometricQuestionProps) {
  return (
    <div className="space-y-6">
      {/* Main visual area */}
      {data.type === "layers" && data.layers ? (
        // Layer superposition visualization
        <div className="flex justify-center items-center gap-4 py-4">
          {data.layers.map((layer, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.2 }}
              className="relative"
            >
              <img 
                src={layer} 
                alt={`Capa ${idx + 1}`} 
                className="w-20 h-20 rounded-lg border border-border"
              />
              {idx < data.layers.length - 1 && (
                <span className="absolute -right-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-primary">
                  +
                </span>
              )}
            </motion.div>
          ))}
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-2xl font-bold text-muted-foreground mx-4"
          >
            =
          </motion.span>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8 }}
            className="w-20 h-20 rounded-lg border-2 border-dashed border-primary flex items-center justify-center text-3xl font-bold text-primary"
          >
            ?
          </motion.div>
        </div>
      ) : data.mainImage ? (
        // Single main image
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex justify-center py-4"
        >
          <img 
            src={data.mainImage} 
            alt="Figura principal" 
            className="max-h-48 rounded-xl border border-border shadow-lg"
          />
        </motion.div>
      ) : null}

      {/* Description if present */}
      {data.description && (
        <p className="text-center text-muted-foreground">
          {data.description}
        </p>
      )}

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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + idx * 0.1 }}
              whileHover={{ scale: disabled ? 1 : 1.03 }}
              whileTap={{ scale: disabled ? 1 : 0.97 }}
              className={cn(
                "p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2",
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
              
              {/* Option content */}
              {option.image ? (
                <img 
                  src={option.image} 
                  alt={`Opción ${option.id}`}
                  className="w-24 h-24 object-contain rounded-lg"
                />
              ) : (
                <span className="text-foreground font-medium text-center">
                  {option.text}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
