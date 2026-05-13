import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmButtonProps {
  show: boolean;
  isSubmitting: boolean;
  isLastQuestion: boolean;
  onClick: () => void;
  className?: string;
}

export function ConfirmButton({ 
  show, 
  isSubmitting, 
  isLastQuestion, 
  onClick,
  className 
}: ConfirmButtonProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 30,
            duration: 0.2 
          }}
          className={cn("flex justify-center", className)}
        >
          <motion.div
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            <Button
              onClick={onClick}
              disabled={isSubmitting}
              variant="default"
              className={cn(
                "gap-2 px-5 py-2.5 h-auto text-sm font-medium",
                "bg-primary hover:bg-primary/90",
                "border border-primary/20",
                "shadow-sm",
                "transition-colors duration-200"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : isLastQuestion ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span>Finalizar</span>
                </>
              ) : (
                <>
                  <span>Confirmar</span>
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
