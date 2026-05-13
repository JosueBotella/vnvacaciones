import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SpeedData {
  type: "binary" | "count" | "calculation" | "comparison" | "flash" | "classification";
  statement?: string;
  image?: string;
  flashItems?: string[];
  flashDuration?: number;
  question?: string;
  options?: { id: string; text: string }[];
}

interface SpeedChallengeProps {
  data: SpeedData;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  disabled?: boolean;
  timeLeft: number;
  totalTime: number;
}

export function SpeedChallenge({ 
  data, 
  selectedAnswer, 
  onSelect, 
  disabled,
  timeLeft,
  totalTime 
}: SpeedChallengeProps) {
  const [showFlash, setShowFlash] = useState(data.type === "flash");
  const [inputValue, setInputValue] = useState("");
  const progress = (timeLeft / totalTime) * 100;
  const isUrgent = timeLeft <= 3;

  // Flash sequence logic
  useEffect(() => {
    if (data.type === "flash" && data.flashItems) {
      const duration = data.flashDuration || 3000;
      const timer = setTimeout(() => setShowFlash(false), duration);
      return () => clearTimeout(timer);
    }
  }, [data.type, data.flashItems, data.flashDuration]);

  const handleInputSubmit = () => {
    if (inputValue.trim()) {
      onSelect(inputValue.trim());
    }
  };

  return (
    <div className="space-y-6">
      {/* Speed indicator */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <Zap className={cn(
          "h-5 w-5 transition-colors",
          isUrgent ? "text-red-500 animate-pulse" : "text-amber-500"
        )} />
        <span className="text-sm font-medium text-muted-foreground">
          Respuesta rápida requerida
        </span>
      </div>

      {/* Animated progress bar */}
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-colors",
            isUrgent ? "bg-red-500" : "bg-gradient-to-r from-primary to-amber-500"
          )}
          initial={{ width: "100%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Content based on type */}
      <AnimatePresence mode="wait">
        {data.type === "binary" && (
          <motion.div
            key="binary"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-center py-8"
          >
            <p className="text-2xl font-bold text-foreground mb-8">
              {data.statement}
            </p>
            <div className="flex justify-center gap-4">
              <Button
                onClick={() => onSelect("true")}
                disabled={disabled}
                size="lg"
                className={cn(
                  "min-w-32 h-16 text-lg font-bold transition-all",
                  selectedAnswer === "true" 
                    ? "bg-primary hover:bg-primary/90 scale-105" 
                    : "bg-muted hover:bg-primary/20 text-foreground"
                )}
              >
                <Check className="mr-2 h-6 w-6" />
                Verdadero
              </Button>
              <Button
                onClick={() => onSelect("false")}
                disabled={disabled}
                size="lg"
                className={cn(
                  "min-w-32 h-16 text-lg font-bold transition-all",
                  selectedAnswer === "false" 
                    ? "bg-destructive hover:bg-destructive/90 scale-105" 
                    : "bg-muted hover:bg-destructive/20 text-foreground"
                )}
              >
                <X className="mr-2 h-6 w-6" />
                Falso
              </Button>
            </div>
          </motion.div>
        )}

        {data.type === "calculation" && (
          <motion.div
            key="calculation"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center py-8"
          >
            <p className="text-4xl font-bold text-foreground mb-8 font-mono">
              {data.statement}
            </p>
            <div className="flex justify-center gap-2 max-w-xs mx-auto">
              <Input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInputSubmit()}
                placeholder="Tu respuesta"
                className="h-14 text-2xl text-center font-mono"
                disabled={disabled}
                autoFocus
              />
              <Button
                onClick={handleInputSubmit}
                disabled={disabled || !inputValue.trim()}
                size="lg"
                className="h-14 px-8 bg-gradient-to-r from-primary to-amber-500"
              >
                OK
              </Button>
            </div>
          </motion.div>
        )}

        {data.type === "flash" && (
          <motion.div
            key="flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8"
          >
            {showFlash ? (
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="flex justify-center gap-4 flex-wrap"
              >
                {data.flashItems?.map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.15 }}
                    className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center text-2xl font-bold text-white shadow-lg"
                  >
                    {item}
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="space-y-4">
                <p className="text-lg text-foreground mb-4">{data.question}</p>
                <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                  {data.options?.map((option) => (
                    <Button
                      key={option.id}
                      onClick={() => onSelect(option.id)}
                      disabled={disabled}
                      variant="outline"
                      className={cn(
                        "h-14 text-lg transition-all",
                        selectedAnswer === option.id 
                          ? "border-primary bg-primary/10" 
                          : "hover:border-primary/50"
                      )}
                    >
                      {option.text}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {data.type === "count" && (
          <motion.div
            key="count"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-6"
          >
            {data.image && (
              <div className="mb-6">
                <img 
                  src={data.image} 
                  alt="Cuenta los elementos" 
                  className="max-h-40 mx-auto rounded-lg"
                />
              </div>
            )}
            <p className="text-lg text-foreground mb-4">{data.statement}</p>
            <div className="grid grid-cols-4 gap-3 max-w-md mx-auto">
              {data.options?.map((option) => (
                <Button
                  key={option.id}
                  onClick={() => onSelect(option.id)}
                  disabled={disabled}
                  variant="outline"
                  className={cn(
                    "h-12 text-lg font-bold transition-all",
                    selectedAnswer === option.id 
                      ? "border-primary bg-primary/10" 
                      : "hover:border-primary/50"
                  )}
                >
                  {option.text}
                </Button>
              ))}
            </div>
          </motion.div>
        )}

        {(data.type === "comparison" || data.type === "classification") && (
          <motion.div
            key="classification"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-8"
          >
            <p className="text-2xl font-bold text-foreground mb-6">
              {data.statement}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {data.options?.map((option) => (
                <Button
                  key={option.id}
                  onClick={() => onSelect(option.id)}
                  disabled={disabled}
                  variant="outline"
                  size="lg"
                  className={cn(
                    "min-w-28 h-12 transition-all",
                    selectedAnswer === option.id 
                      ? "border-primary bg-primary/10 scale-105" 
                      : "hover:border-primary/50"
                  )}
                >
                  {option.text}
                </Button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
