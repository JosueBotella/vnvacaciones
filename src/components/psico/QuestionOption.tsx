import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuestionOptionProps {
  id: string;
  text?: string;
  image?: string;
  isSelected: boolean;
  isDisabled: boolean;
  onClick: () => void;
  index: number;
}

export function QuestionOption({
  id,
  text,
  image,
  isSelected,
  isDisabled,
  onClick,
  index
}: QuestionOptionProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={isDisabled}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        delay: index * 0.08,
        type: "spring",
        stiffness: 300,
        damping: 24
      }}
      whileHover={{ 
        scale: isDisabled ? 1 : 1.02,
        transition: { duration: 0.2 }
      }}
      whileTap={{ scale: isDisabled ? 1 : 0.98 }}
      className={cn(
        "w-full p-4 md:p-5 rounded-2xl border-2 text-left transition-all duration-300",
        "relative overflow-hidden group",
        isSelected
          ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
          : "border-border bg-card hover:border-primary/40 hover:bg-primary/5",
        isDisabled && "opacity-60 cursor-not-allowed"
      )}
    >
      {/* Selection glow effect */}
      {isSelected && (
        <motion.div
          layoutId="option-glow"
          className="absolute inset-0 bg-gradient-to-r from-primary/10 to-primary/5 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      )}

      <div className="flex items-center gap-4 relative z-10">
        {/* Option badge */}
        <motion.div 
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            "text-sm font-bold transition-all duration-300",
            "shrink-0",
            isSelected
              ? "bg-primary text-primary-foreground shadow-md"
              : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
          )}
          animate={isSelected ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.3 }}
        >
          {isSelected ? (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
            >
              <Check className="h-5 w-5" />
            </motion.div>
          ) : (
            id
          )}
        </motion.div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {image ? (
            <motion.img 
              src={image} 
              alt="" 
              className="h-14 rounded-lg object-contain"
              whileHover={{ scale: 1.05 }}
            />
          ) : (
            <span className={cn(
              "text-base md:text-lg transition-colors duration-300",
              isSelected ? "text-foreground font-medium" : "text-foreground"
            )}>
              {text}
            </span>
          )}
        </div>

        {/* Selection indicator arrow */}
        {isSelected && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-primary"
          >
            <Check className="h-5 w-5" />
          </motion.div>
        )}
      </div>
    </motion.button>
  );
}
