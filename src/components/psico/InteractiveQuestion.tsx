import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InteractiveData {
  type: "order" | "sequence" | "pairs";
  items?: string[];
  targetOrder?: string[];
  pairs?: { left: string; right: string }[];
  options?: { id: string; text: string }[];
}

interface InteractiveQuestionProps {
  data: InteractiveData;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  disabled?: boolean;
}

export function InteractiveQuestion({ data, selectedAnswer, onSelect, disabled }: InteractiveQuestionProps) {
  const [orderedItems, setOrderedItems] = useState<string[]>(data.items || []);

  useEffect(() => {
    if (data.items) {
      setOrderedItems([...data.items]);
    }
  }, [data.items]);

  const moveItem = (index: number, direction: "up" | "down") => {
    if (disabled) return;
    
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= orderedItems.length) return;
    
    const newOrder = [...orderedItems];
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    setOrderedItems(newOrder);
    
    // Submit the order as answer
    onSelect(newOrder.join(","));
  };

  if (data.type === "order") {
    return (
      <div className="space-y-4">
        <p className="text-center text-muted-foreground mb-4">
          Ordena los elementos de menor a mayor usando las flechas
        </p>
        
        <div className="max-w-md mx-auto space-y-2">
          {orderedItems.map((item, idx) => (
            <motion.div
              key={item}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={cn(
                "flex items-center gap-3 p-4 rounded-xl border-2 transition-all",
                "border-border bg-card hover:border-primary/50"
              )}
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
              
              <span className="flex-1 text-lg font-medium text-foreground">
                {item}
              </span>
              
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => moveItem(idx, "up")}
                  disabled={disabled || idx === 0}
                  className="h-8 w-8"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => moveItem(idx, "down")}
                  disabled={disabled || idx === orderedItems.length - 1}
                  className="h-8 w-8"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
        
        {selectedAnswer && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-sm text-primary mt-4"
          >
            ✓ Orden guardado
          </motion.p>
        )}
      </div>
    );
  }

  if (data.type === "sequence") {
    return (
      <div className="space-y-6">
        {/* Display partial sequence */}
        <div className="flex justify-center items-center gap-3 flex-wrap">
          {data.items?.map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.15 }}
              className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30 flex items-center justify-center text-xl font-bold text-foreground"
            >
              {item}
            </motion.div>
          ))}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: (data.items?.length || 0) * 0.15 }}
            className="w-14 h-14 rounded-xl border-2 border-dashed border-primary flex items-center justify-center text-xl font-bold text-primary"
          >
            ?
          </motion.div>
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto">
          {data.options?.map((option, idx) => (
            <Button
              key={option.id}
              onClick={() => !disabled && onSelect(option.id)}
              disabled={disabled}
              variant="outline"
              className={cn(
                "h-14 text-lg font-bold transition-all",
                selectedAnswer === option.id 
                  ? "border-primary bg-primary/10 scale-105" 
                  : "hover:border-primary/50"
              )}
            >
              {option.text}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (data.type === "pairs") {
    return (
      <div className="space-y-6">
        <p className="text-center text-muted-foreground">
          Selecciona la opción que mejor corresponde
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
          {data.options?.map((option, idx) => (
            <motion.button
              key={option.id}
              onClick={() => !disabled && onSelect(option.id)}
              disabled={disabled}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              whileHover={{ scale: disabled ? 1 : 1.02 }}
              className={cn(
                "p-4 rounded-xl border-2 transition-all text-left",
                selectedAnswer === option.id 
                  ? "border-primary bg-primary/10" 
                  : "border-border hover:border-primary/50 bg-card"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                  selectedAnswer === option.id 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted text-muted-foreground"
                )}>
                  {option.id}
                </div>
                <span className="text-foreground">{option.text}</span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
