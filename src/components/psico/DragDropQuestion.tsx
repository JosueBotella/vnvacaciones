import { useState, useEffect } from "react";
import { motion, Reorder } from "framer-motion";
import { GripVertical, Check, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DragDropData {
  type: "order" | "pairs" | "sequence";
  items: string[];
  instruction?: string;
  pairs?: { left: string; right: string }[];
}

interface DragDropQuestionProps {
  data: DragDropData;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  disabled?: boolean;
}

export function DragDropQuestion({ data, selectedAnswer, onSelect, disabled }: DragDropQuestionProps) {
  const [orderedItems, setOrderedItems] = useState<string[]>(data.items || []);

  useEffect(() => {
    setOrderedItems(data.items || []);
  }, [data.items]);

  const handleReorder = (newOrder: string[]) => {
    if (disabled) return;
    setOrderedItems(newOrder);
    onSelect(newOrder.join(","));
  };

  // Pairs matching logic
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});

  const handlePairSelect = (side: "left" | "right", value: string) => {
    if (disabled) return;

    if (side === "left") {
      setSelectedLeft(value);
    } else if (selectedLeft) {
      const newMatches = { ...matches, [selectedLeft]: value };
      setMatches(newMatches);
      setSelectedLeft(null);
      
      // Submit when all pairs matched
      if (data.pairs && Object.keys(newMatches).length === data.pairs.length) {
        const answerStr = Object.entries(newMatches)
          .map(([l, r]) => `${l}:${r}`)
          .join(",");
        onSelect(answerStr);
      }
    }
  };

  if (data.type === "order") {
    return (
      <div className="space-y-4">
        {data.instruction && (
          <p className="text-sm text-muted-foreground text-center mb-4">
            {data.instruction}
          </p>
        )}

        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-2">
          <ArrowUpDown className="h-4 w-4" />
          <span>Arrastra para ordenar</span>
        </div>

        <Reorder.Group
          axis="y"
          values={orderedItems}
          onReorder={handleReorder}
          className="space-y-2"
        >
          {orderedItems.map((item, index) => (
            <Reorder.Item
              key={item}
              value={item}
              className={cn(
                "p-4 rounded-xl border-2 bg-card cursor-grab active:cursor-grabbing",
                "flex items-center gap-3 transition-all",
                disabled ? "opacity-50 cursor-not-allowed" : "hover:border-primary/50",
                "border-border"
              )}
              whileDrag={{ scale: 1.02, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                {index + 1}
              </div>
              <GripVertical className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium text-foreground flex-1">{item}</span>
            </Reorder.Item>
          ))}
        </Reorder.Group>

        {selectedAnswer && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-2 text-green-500 mt-4"
          >
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">Orden guardado</span>
          </motion.div>
        )}
      </div>
    );
  }

  if (data.type === "pairs" && data.pairs) {
    const leftItems = data.pairs.map(p => p.left);
    const rightItems = data.pairs.map(p => p.right);

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground text-center mb-4">
          Selecciona un elemento de la izquierda y luego su pareja de la derecha
        </p>

        <div className="grid grid-cols-2 gap-4">
          {/* Left column */}
          <div className="space-y-2">
            {leftItems.map((item, idx) => {
              const isMatched = matches[item] !== undefined;
              const isSelected = selectedLeft === item;

              return (
                <motion.button
                  key={`left-${idx}`}
                  onClick={() => !isMatched && handlePairSelect("left", item)}
                  disabled={disabled || isMatched}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={cn(
                    "w-full p-3 rounded-xl border-2 text-left transition-all",
                    isMatched
                      ? "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
                      : isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50 bg-card",
                    (disabled || isMatched) && "cursor-not-allowed opacity-60"
                  )}
                >
                  <span className="font-medium">{item}</span>
                  {isMatched && (
                    <Check className="inline-block ml-2 h-4 w-4" />
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Right column */}
          <div className="space-y-2">
            {rightItems.map((item, idx) => {
              const isMatched = Object.values(matches).includes(item);

              return (
                <motion.button
                  key={`right-${idx}`}
                  onClick={() => !isMatched && selectedLeft && handlePairSelect("right", item)}
                  disabled={disabled || isMatched || !selectedLeft}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={cn(
                    "w-full p-3 rounded-xl border-2 text-left transition-all",
                    isMatched
                      ? "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
                      : selectedLeft && !isMatched
                      ? "border-amber-500/50 hover:border-amber-500 bg-amber-500/5"
                      : "border-border bg-card",
                    (disabled || isMatched || !selectedLeft) && "cursor-not-allowed",
                    !selectedLeft && "opacity-60"
                  )}
                >
                  <span className="font-medium">{item}</span>
                  {isMatched && (
                    <Check className="inline-block ml-2 h-4 w-4" />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {Object.keys(matches).length === data.pairs.length && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center justify-center gap-2 text-green-500 mt-4"
          >
            <Check className="h-5 w-5" />
            <span className="font-medium">¡Todos los pares conectados!</span>
          </motion.div>
        )}
      </div>
    );
  }

  // Sequence fill-in type
  if (data.type === "sequence") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {orderedItems.map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              className={cn(
                "w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold",
                item === "?"
                  ? "border-2 border-dashed border-primary bg-primary/10 text-primary"
                  : "bg-muted text-foreground"
              )}
            >
              {item}
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
