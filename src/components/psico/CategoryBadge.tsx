import { motion } from "framer-motion";
import { Zap, Brain, Eye, MessageSquare, Timer, Grid3X3, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const categoryConfig: Record<string, { 
  label: string; 
  gradient: string; 
  icon: typeof Brain;
}> = {
  logica_numerica: { 
    label: "Lógica Numérica", 
    gradient: "from-blue-500 to-blue-600",
    icon: Brain
  },
  razonamiento_visual: { 
    label: "Razonamiento Visual", 
    gradient: "from-purple-500 to-purple-600",
    icon: Eye
  },
  atencion_percepcion: { 
    label: "Atención y Percepción", 
    gradient: "from-primary to-primary/80",
    icon: Eye
  },
  logica_verbal: { 
    label: "Lógica Verbal", 
    gradient: "from-amber-500 to-amber-600",
    icon: MessageSquare
  },
  velocidad: { 
    label: "Velocidad", 
    gradient: "from-red-500 to-red-600",
    icon: Zap
  },
  memoria_visual: { 
    label: "Memoria Visual", 
    gradient: "from-cyan-500 to-cyan-600",
    icon: Grid3X3
  },
  consistencia: { 
    label: "Consistencia", 
    gradient: "from-gray-500 to-gray-600",
    icon: RefreshCw
  },
};

interface CategoryBadgeProps {
  category: string;
  isMemoryShow?: boolean;
  isSpeedQuestion?: boolean;
}

export function CategoryBadge({ category, isMemoryShow, isSpeedQuestion }: CategoryBadgeProps) {
  const config = categoryConfig[category] || { 
    label: category, 
    gradient: "from-gray-500 to-gray-600",
    icon: Brain
  };
  const Icon = config.icon;

  return (
    <motion.div 
      className="flex items-center gap-2 flex-wrap"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      {/* Main category badge */}
      <motion.div 
        className={cn(
          "inline-flex items-center gap-2 px-4 py-1.5 rounded-full",
          "text-xs font-semibold text-white",
          "bg-gradient-to-r shadow-lg",
          config.gradient
        )}
        whileHover={{ scale: 1.05 }}
      >
        <Icon className="h-3.5 w-3.5" />
        {config.label}
      </motion.div>

      {/* Memory indicator */}
      {isMemoryShow && (
        <motion.div 
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-600 border border-cyan-500/30"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Grid3X3 className="h-3.5 w-3.5" />
          Memoriza el patrón
        </motion.div>
      )}

      {/* Speed indicator */}
      {isSpeedQuestion && (
        <motion.div 
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-500 border border-red-500/30"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Zap className="h-3.5 w-3.5 animate-pulse" />
          Velocidad
        </motion.div>
      )}
    </motion.div>
  );
}
