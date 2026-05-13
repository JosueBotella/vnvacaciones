import { motion } from "framer-motion";
import { CheckCircle, Home, Brain, Target, Zap, Eye, MessageSquare, Clock, Grid3X3, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LogoLink } from "@/components/LogoLink";

interface CategorySummary {
  category: string;
  label: string;
  total: number;
  correct: number;
  level: "excelente" | "bueno" | "regular" | "mejorable";
}

interface TestSummary {
  candidateName: string;
  position: string;
  totalQuestions: number;
  answeredQuestions: number;
  categorySummary: CategorySummary[];
  completedAt: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  logica_numerica: <Target className="h-5 w-5" />,
  razonamiento_visual: <Eye className="h-5 w-5" />,
  atencion_percepcion: <Grid3X3 className="h-5 w-5" />,
  logica_verbal: <MessageSquare className="h-5 w-5" />,
  velocidad: <Zap className="h-5 w-5" />,
  memoria_visual: <Brain className="h-5 w-5" />,
  consistencia: <Shuffle className="h-5 w-5" />
};

const levelConfig = {
  excelente: {
    label: "Excelente",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    bar: "bg-gradient-to-r from-emerald-500 to-emerald-400",
    width: "100%"
  },
  bueno: {
    label: "Bueno",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
    bar: "bg-gradient-to-r from-primary to-primary/80",
    width: "75%"
  },
  regular: {
    label: "Regular",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    bar: "bg-gradient-to-r from-amber-500 to-amber-400",
    width: "50%"
  },
  mejorable: {
    label: "Mejorable",
    color: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-muted-foreground/20",
    bar: "bg-gradient-to-r from-muted-foreground/60 to-muted-foreground/40",
    width: "25%"
  }
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.3
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 }
  }
};

export default function PsicoTestComplete() {
  const navigate = useNavigate();
  const location = useLocation();
  const summary = location.state?.summary as TestSummary | undefined;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 flex flex-col">
      {/* Header */}
      <header className="p-4 flex justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <LogoLink to="/" className="h-10 w-10" />
        </motion.div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          {/* Success card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5, type: "spring" }}
          >
            <Card className="p-6 md:p-8 border-2 border-primary/20 shadow-xl shadow-primary/5">
              {/* Success icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="text-center mb-6"
              >
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/25">
                  <CheckCircle className="h-10 w-10" />
                </div>
              </motion.div>

              {/* Title */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-center mb-8"
              >
                <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                  ¡Test Completado!
                </h1>
                {summary?.candidateName && (
                  <p className="text-muted-foreground">
                    Gracias, <span className="font-medium text-foreground">{summary.candidateName}</span>
                  </p>
                )}
              </motion.div>

              {/* Category results */}
              {summary?.categorySummary && summary.categorySummary.length > 0 && (
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="mb-8"
                >
                  <motion.h2 
                    variants={itemVariants}
                    className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2"
                  >
                    <Brain className="h-4 w-4" />
                    Resumen por Categoría
                  </motion.h2>
                  
                  <div className="space-y-3">
                    {summary.categorySummary.map((cat) => {
                      const config = levelConfig[cat.level];
                      const icon = categoryIcons[cat.category];
                      
                      return (
                        <motion.div
                          key={cat.category}
                          variants={itemVariants}
                          className={cn(
                            "p-4 rounded-xl border-2 transition-colors",
                            config.bg,
                            config.border
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className={cn("p-2 rounded-lg", config.bg, config.color)}>
                                {icon}
                              </div>
                              <span className="font-medium text-foreground">
                                {cat.label}
                              </span>
                            </div>
                            <span className={cn("text-sm font-semibold", config.color)}>
                              {config.label}
                            </span>
                          </div>
                          
                          {/* Progress bar */}
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <motion.div
                              className={cn("h-full rounded-full", config.bar)}
                              initial={{ width: 0 }}
                              animate={{ width: config.width }}
                              transition={{ delay: 0.6, duration: 0.8, ease: "easeOut" }}
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Stats */}
              {summary && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                  className="grid grid-cols-2 gap-4 mb-8"
                >
                  <div className="p-4 rounded-xl bg-muted/50 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Respondidas</span>
                    </div>
                    <span className="text-2xl font-bold text-foreground">
                      {summary.answeredQuestions}/{summary.totalQuestions}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/50 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Puesto</span>
                    </div>
                    <span className="text-lg font-bold text-foreground truncate block">
                      {summary.position}
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Info box */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
                className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6"
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Brain className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <span className="font-medium text-foreground">¿Qué sigue?</span>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Tus resultados han sido registrados y serán evaluados por nuestro 
                  equipo de Recursos Humanos. Nos pondremos en contacto contigo 
                  próximamente.
                </p>
              </motion.div>

              {/* Note */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                className="text-xs text-muted-foreground text-center mb-6"
              >
                Por razones de confidencialidad, las puntuaciones exactas 
                no se muestran a los candidatos.
              </motion.p>

              {/* Home button */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.4 }}
                className="text-center"
              >
                <Button
                  onClick={() => navigate("/")}
                  variant="outline"
                  size="lg"
                  className="gap-2"
                >
                  <Home className="h-4 w-4" />
                  Volver al inicio
                </Button>
              </motion.div>
            </Card>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-muted-foreground">
        Verdnatura © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
