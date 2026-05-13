import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Import specialized question components
import { DominoQuestion } from "@/components/psico/DominoQuestion";
import { SpeedChallenge } from "@/components/psico/SpeedChallenge";
import { GeometricQuestion } from "@/components/psico/GeometricQuestion";
import { InteractiveQuestion } from "@/components/psico/InteractiveQuestion";
import { MatrixQuestion } from "@/components/psico/MatrixQuestion";
import { SequenceQuestion } from "@/components/psico/SequenceQuestion";
import { VisualComparisonQuestion } from "@/components/psico/VisualComparisonQuestion";
import { NumberSeriesQuestion } from "@/components/psico/NumberSeriesQuestion";
import { FractionComparisonQuestion } from "@/components/psico/FractionComparisonQuestion";
import { DragDropQuestion } from "@/components/psico/DragDropQuestion";
import { RotationQuestion } from "@/components/psico/RotationQuestion";
import { PaperFoldQuestion } from "@/components/psico/PaperFoldQuestion";

// Import new UI components
import { ProgressHeader } from "@/components/psico/ProgressHeader";
import { CategoryBadge } from "@/components/psico/CategoryBadge";
import { ConfirmButton } from "@/components/psico/ConfirmButton";
import { QuestionOption } from "@/components/psico/QuestionOption";

// Types for question data
interface QuestionOptionType {
  id: string;
  text?: string;
  image?: string;
  value?: string | number | number[];
  display?: string;
  type?: string;
  symbol?: string;
}

interface QuestionData {
  options: QuestionOptionType[];
  image?: string;
  memoryPattern?: string[];
  memoryShowTime?: number;
  series?: [number, number][] | (number | string)[];
  type?: string;
  statement?: string;
  flashItems?: string[];
  flashDuration?: number;
  question?: string;
  mainImage?: string;
  description?: string;
  layers?: string[];
  items?: string[];
  targetOrder?: string[];
  pairs?: { left: string; right: string }[];
  grid?: string[][];
  sequence?: string[];
  figures?: { id: string; content: string; lines?: number }[];
}

interface Question {
  id: string;
  category: string;
  question_type: string;
  question_text: string;
  question_data: QuestionData;
  correct_answer: string;
  time_limit_seconds: number;
  points: number;
  order_index: number;
}

interface SessionData {
  id: string;
  candidate_name: string;
  position_applied: string;
  test_id: string;
  status: string;
  current_question_index: number;
}

// Animation variants
const questionVariants = {
  enter: { opacity: 0, x: 40, scale: 0.99 },
  center: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -40, scale: 0.99 }
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const }
  }
};

export default function PsicoTest() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [initialTimeLimit, setInitialTimeLimit] = useState(45);
  const [globalTimeLeft, setGlobalTimeLeft] = useState(20 * 60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [showMemoryPattern, setShowMemoryPattern] = useState(false);
  const [memoryPhase, setMemoryPhase] = useState<"show" | "answer">("answer");

  // Refs for timer management
  const questionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionKeyRef = useRef<string>("");

  // Load session and questions
  useEffect(() => {
    if (!sessionId) {
      navigate("/psico-test");
      return;
    }

    const loadTest = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("psico-test-operations", {
          body: { action: "getTestData", sessionId }
        });

        if (error || !data?.success) {
          toast.error(data?.error || "Error al cargar el test");
          navigate("/psico-test");
          return;
        }

        setSession(data.session);
        setQuestions(data.questions);
        setCurrentIndex(data.session.current_question_index || 0);
        setGlobalTimeLeft(data.remainingTime || 20 * 60);
        
        if (data.questions.length > 0) {
          const currentQ = data.questions[data.session.current_question_index || 0];
          const timeLimit = currentQ?.time_limit_seconds || 45;
          setTimeLeft(timeLimit);
          setInitialTimeLimit(timeLimit);
          setStartTime(Date.now());
          
          if (currentQ?.question_type === "memory") {
            setMemoryPhase("show");
            setShowMemoryPattern(true);
          } else {
            setMemoryPhase("answer");
            setShowMemoryPattern(false);
          }
        }
        
        setLoading(false);
      } catch (err) {
        console.error("Error loading test:", err);
        toast.error("Error al cargar el test");
        navigate("/psico-test");
      }
    };

    loadTest();
  }, [sessionId, navigate]);

  // Global timer
  useEffect(() => {
    if (loading || !session) return;

    const timer = setInterval(() => {
      setGlobalTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleCompleteTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [loading, session]);

  // Question timer - Fixed with proper key management
  useEffect(() => {
    if (loading || !session) return;
    if (memoryPhase === "show") return;

    const currentQuestion = questions[currentIndex];
    const newKey = `${currentIndex}-${currentQuestion?.id}`;
    
    // Only reset if this is a new question
    if (questionKeyRef.current !== newKey) {
      questionKeyRef.current = newKey;
      
      // Clear existing timer
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current);
      }

      // Start new timer
      questionTimerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (questionTimerRef.current) {
              clearInterval(questionTimerRef.current);
            }
            setTimeout(() => handleNextQuestion(true), 0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current);
      }
    };
  }, [loading, session, currentIndex, memoryPhase, questions]);

  // Memory question show phase
  useEffect(() => {
    if (!showMemoryPattern || memoryPhase !== "show") return;

    const currentQ = questions[currentIndex];
    const showTime = currentQ?.question_data?.memoryShowTime || 4000;

    const timer = setTimeout(() => {
      setShowMemoryPattern(false);
      setMemoryPhase("answer");
      const timeLimit = currentQ?.time_limit_seconds || 20;
      setTimeLeft(timeLimit);
      setInitialTimeLimit(timeLimit);
      setStartTime(Date.now());
      questionKeyRef.current = "";
    }, showTime);

    return () => clearTimeout(timer);
  }, [showMemoryPattern, memoryPhase, currentIndex, questions]);

  const handleNextQuestion = useCallback(async (timeout = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    // Clear current timer
    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current);
      questionTimerRef.current = null;
    }

    const currentQuestion = questions[currentIndex];
    const timeTaken = Math.round((Date.now() - startTime) / 1000);

    try {
      await supabase.functions.invoke("psico-test-operations", {
        body: {
          action: "submitAnswer",
          sessionId: session?.id,
          questionId: currentQuestion.id,
          answer: selectedAnswer,
          timeTaken,
          timeout
        }
      });

      if (currentIndex >= questions.length - 1) {
        await handleCompleteTest();
        return;
      }

      const nextIndex = currentIndex + 1;
      const nextQuestion = questions[nextIndex];
      const nextTimeLimit = nextQuestion?.time_limit_seconds || 45;
      
      questionKeyRef.current = "";
      
      setCurrentIndex(nextIndex);
      setSelectedAnswer(null);
      setTimeLeft(nextTimeLimit);
      setInitialTimeLimit(nextTimeLimit);
      setStartTime(Date.now());
      
      if (nextQuestion?.question_type === "memory") {
        setMemoryPhase("show");
        setShowMemoryPattern(true);
      } else {
        setMemoryPhase("answer");
        setShowMemoryPattern(false);
      }

      await supabase.functions.invoke("psico-test-operations", {
        body: {
          action: "updateProgress",
          sessionId: session?.id,
          currentIndex: nextIndex
        }
      });
    } catch (err) {
      console.error("Error submitting answer:", err);
      toast.error("Error al guardar la respuesta");
    } finally {
      setIsSubmitting(false);
    }
  }, [currentIndex, questions, selectedAnswer, session, startTime, isSubmitting]);

  const handleCompleteTest = async () => {
    try {
      const { data } = await supabase.functions.invoke("psico-test-operations", {
        body: {
          action: "completeTest",
          sessionId: session?.id
        }
      });

      navigate("/psico-test/complete", { 
        state: { summary: data?.summary } 
      });
    } catch (err) {
      console.error("Error completing test:", err);
      navigate("/psico-test/complete");
    }
  };

  // Helper to parse domino series from text
  const parseDominoPair = (raw?: string | null): [number, number] | null => {
    if (!raw) return null;
    const cleaned = raw.trim();
    const m = cleaned.match(/^(\d)\s*[\|\/,\s]\s*(\d)$/);
    if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
    return null;
  };

  // Render specialized question component based on type
  const renderQuestionContent = () => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return null;

    const { question_type, question_data } = currentQuestion;

    // Number series questions
    if (question_type === "number_series") {
      const series = question_data.series as (number | string)[];
      return (
        <NumberSeriesQuestion
          data={{
            series: series || [],
            options: question_data.options?.map(opt => ({
              id: opt.id,
              value: Array.isArray(opt.value) ? String(opt.value) : (opt.value ?? opt.text ?? "")
            })) || []
          }}
          selectedAnswer={selectedAnswer}
          onSelect={setSelectedAnswer}
          disabled={isSubmitting}
        />
      );
    }

    // Fraction comparison questions
    if (question_type === "fraction_comparison") {
      return (
        <FractionComparisonQuestion
          data={{
            question: currentQuestion.question_text,
            options: question_data.options?.map(opt => ({
              id: opt.id,
              display: opt.display || opt.text || "",
              type: (opt.type as "fraction" | "decimal") || "fraction"
            })) || []
          }}
          selectedAnswer={selectedAnswer}
          onSelect={setSelectedAnswer}
          disabled={isSubmitting}
        />
      );
    }

    // Matrix questions (Raven-type)
    if (question_type === "matrix" && question_data.grid) {
      return (
        <MatrixQuestion
          data={{
            grid: question_data.grid,
            options: question_data.options?.map(opt => ({
              id: opt.id,
              symbol: opt.symbol || opt.text || "",
              image: opt.image
            })) || []
          }}
          selectedAnswer={selectedAnswer}
          onSelect={setSelectedAnswer}
          disabled={isSubmitting}
        />
      );
    }

    // Sequence questions (arrows, symbols)
    if (question_type === "sequence" && question_data.sequence) {
      return (
        <SequenceQuestion
          data={{
            sequence: question_data.sequence,
            options: question_data.options?.map(opt => ({
              id: opt.id,
              value: String(opt.value || opt.text || "")
            })) || []
          }}
          selectedAnswer={selectedAnswer}
          onSelect={setSelectedAnswer}
          disabled={isSubmitting}
        />
      );
    }

    // Visual comparison questions
    if (question_type === "visual_comparison" && question_data.figures) {
      return (
        <VisualComparisonQuestion
          data={{
            type: (question_data.type as "find_different" | "find_matching" | "count") || "find_different",
            figures: question_data.figures
          }}
          selectedAnswer={selectedAnswer}
          onSelect={setSelectedAnswer}
          disabled={isSubmitting}
        />
      );
    }

    // Domino series questions
    if (question_type === "domino_series" || question_type?.includes("domino")) {
      const series = (question_data.series as [number, number][]) || [];
      
      // Parse options - handle both array format [3,4] and string format "3|4"
      const options = (question_data.options || []).map((opt): [number, number] | null => {
        // If value is already an array [n, m]
        const val = opt.value;
        if (Array.isArray(val) && val.length >= 2) {
          return [Number(val[0]), Number(val[1])] as [number, number];
        }
        // Try parsing from text/id as fallback
        return parseDominoPair(String(val ?? opt.text ?? opt.id));
      }).filter((x): x is [number, number] => x !== null);

      return (
        <DominoQuestion
          data={{ series, options }}
          selectedAnswer={selectedAnswer}
          onSelect={setSelectedAnswer}
          disabled={isSubmitting}
        />
      );
    }

    // Speed challenges
    if (question_type === "speed_challenge" || question_type === "speed_binary" || 
        question_type === "speed_calculation" || question_type === "speed_flash") {
      return (
        <SpeedChallenge
          data={{
            type: (question_data.type as "binary" | "count" | "calculation" | "comparison" | "flash" | "classification") || "binary",
            statement: question_data.statement,
            flashItems: question_data.flashItems,
            flashDuration: question_data.flashDuration,
            question: question_data.question,
            options: question_data.options?.map(opt => ({ id: opt.id, text: opt.text || "" }))
          }}
          selectedAnswer={selectedAnswer}
          onSelect={setSelectedAnswer}
          disabled={isSubmitting}
          timeLeft={timeLeft}
          totalTime={initialTimeLimit}
        />
      );
    }

    // Geometric questions
    if (question_type === "geometric_fold" || question_type === "geometric_cube" || 
        question_type === "geometric_layers" || question_type === "geometric_transform") {
      return (
        <GeometricQuestion
          data={{
            type: question_type.replace("geometric_", "") as "fold" | "cube" | "layers" | "transform",
            mainImage: question_data.mainImage || question_data.image,
            description: question_data.description,
            layers: question_data.layers,
            options: question_data.options || []
          }}
          selectedAnswer={selectedAnswer}
          onSelect={setSelectedAnswer}
          disabled={isSubmitting}
        />
      );
    }

    // Interactive questions
    if (question_type === "interactive_order" || question_type === "interactive_sequence" || 
        question_type === "interactive_pairs") {
      return (
        <InteractiveQuestion
          data={{
            type: question_type.replace("interactive_", "") as "order" | "sequence" | "pairs",
            items: question_data.items,
            targetOrder: question_data.targetOrder,
            pairs: question_data.pairs,
            options: question_data.options?.map(opt => ({ id: opt.id, text: opt.text || "" }))
          }}
          selectedAnswer={selectedAnswer}
          onSelect={setSelectedAnswer}
          disabled={isSubmitting}
        />
      );
    }

    // Default: Standard multiple choice with animated options
    return (
      <>
        {question_data.image && (
          <motion.div 
            className="mb-6 flex justify-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
          >
            <img 
              src={question_data.image} 
              alt="Imagen de la pregunta"
              className="max-h-44 rounded-xl shadow-lg"
            />
          </motion.div>
        )}

        <div className="space-y-2.5">
          {question_data.options?.map((option, index) => (
            <QuestionOption
              key={option.id}
              id={option.id}
              text={option.text}
              image={option.image}
              isSelected={selectedAnswer === option.id}
              isDisabled={isSubmitting}
              onClick={() => setSelectedAnswer(option.id)}
              index={index}
            />
          ))}
        </div>
      </>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center">
        <motion.div 
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="relative">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <motion.div
              className="absolute inset-0 h-10 w-10 rounded-full border-2 border-primary/30"
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>
          <p className="text-muted-foreground font-medium">Cargando test...</p>
        </motion.div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const isSpeedQuestion = currentQuestion?.question_type?.startsWith("speed_");
  const isLastQuestion = currentIndex >= questions.length - 1;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Animated Header */}
      <ProgressHeader
        currentIndex={currentIndex}
        totalQuestions={questions.length}
        timeLeft={timeLeft}
        initialTimeLimit={initialTimeLimit}
        globalTimeLeft={globalTimeLeft}
      />

      {/* Main content */}
      <main className="container mx-auto px-4 py-6 md:py-8 max-w-3xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            variants={questionVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ 
              type: "spring",
              stiffness: 350,
              damping: 32,
              duration: 0.35
            }}
          >
            {/* Category badge */}
            <div className="mb-5">
              <CategoryBadge
                category={currentQuestion?.category}
                isMemoryShow={currentQuestion?.question_type === "memory" && memoryPhase === "show"}
                isSpeedQuestion={isSpeedQuestion}
              />
            </div>

            {/* Question card */}
            <motion.div
              variants={cardVariants}
              initial="hidden"
              animate="visible"
            >
              <Card className={cn(
                "p-5 md:p-7 mb-5",
                "border border-border/50",
                "shadow-lg shadow-black/[0.03]",
                "bg-card"
              )}>
                {/* Memory pattern display */}
                {currentQuestion?.question_type === "memory" && memoryPhase === "show" ? (
                  <div className="text-center py-6">
                    <motion.p 
                      className="text-base text-muted-foreground mb-5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      Memoriza el siguiente patrón:
                    </motion.p>
                    <div className="flex justify-center gap-3 flex-wrap">
                      {currentQuestion.question_data.memoryPattern?.map((item, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, scale: 0, rotateY: 180 }}
                          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                          transition={{ 
                            delay: idx * 0.12,
                            type: "spring",
                            stiffness: 300
                          }}
                          className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-xl font-bold text-primary-foreground shadow-md shadow-primary/20"
                        >
                          {item}
                        </motion.div>
                      ))}
                    </div>
                    <motion.p 
                      className="text-sm text-muted-foreground mt-5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                    >
                      El patrón desaparecerá en unos segundos...
                    </motion.p>
                  </div>
                ) : (
                  <>
                    {/* Question text */}
                    {currentQuestion?.question_text && !isSpeedQuestion && (
                      <motion.h2 
                        className="text-lg md:text-xl font-medium text-foreground mb-5 leading-relaxed"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08 }}
                      >
                        {currentQuestion.question_text}
                      </motion.h2>
                    )}

                    {/* Render appropriate question component */}
                    {renderQuestionContent()}
                  </>
                )}
              </Card>
            </motion.div>

            {/* Confirmation button - appears when answer selected */}
            {memoryPhase !== "show" && (
              <ConfirmButton
                show={!!selectedAnswer}
                isSubmitting={isSubmitting}
                isLastQuestion={isLastQuestion}
                onClick={() => handleNextQuestion(false)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
