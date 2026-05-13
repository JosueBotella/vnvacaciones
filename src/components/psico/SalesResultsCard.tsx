import { motion } from "framer-motion";
import { 
  Phone, 
  Users, 
  Target, 
  Brain, 
  CheckCircle2, 
  AlertTriangle,
  TrendingUp,
  MessageSquare,
  ClipboardCheck,
  Search
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SalesMetrics {
  atencionCliente: number;
  organizacion: number;
  precision: number;
  logicaPractica: number;
  consistencia: number;
}

interface SalesResultsCardProps {
  candidateName: string;
  totalScore: number;
  metrics: SalesMetrics;
  recommendation: "muy_recomendable" | "recomendable" | "no_recomendable";
  strengths?: string[];
  weaknesses?: string[];
}

const metricConfig = [
  {
    key: "atencionCliente",
    label: "Atención al Cliente",
    icon: MessageSquare,
    weight: "30%",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500",
  },
  {
    key: "precision",
    label: "Precisión",
    icon: Search,
    weight: "25%",
    color: "text-blue-500",
    bgColor: "bg-blue-500",
  },
  {
    key: "logicaPractica",
    label: "Lógica Práctica",
    icon: Brain,
    weight: "20%",
    color: "text-purple-500",
    bgColor: "bg-purple-500",
  },
  {
    key: "organizacion",
    label: "Organización",
    icon: ClipboardCheck,
    weight: "20%",
    color: "text-amber-500",
    bgColor: "bg-amber-500",
  },
  {
    key: "consistencia",
    label: "Consistencia",
    icon: Target,
    weight: "5%",
    color: "text-slate-500",
    bgColor: "bg-slate-500",
  },
];

const recommendationConfig = {
  muy_recomendable: {
    label: "Muy Recomendable",
    emoji: "🟢",
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    borderColor: "border-green-500",
  },
  recomendable: {
    label: "Recomendable",
    emoji: "🟡",
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    borderColor: "border-amber-500",
  },
  no_recomendable: {
    label: "No Recomendable",
    emoji: "🔴",
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    borderColor: "border-red-500",
  },
};

export default function SalesResultsCard({
  candidateName,
  totalScore,
  metrics,
  recommendation,
  strengths = [],
  weaknesses = [],
}: SalesResultsCardProps) {
  const recConfig = recommendationConfig[recommendation];

  const getScoreLevel = (score: number): "excelente" | "bueno" | "regular" | "bajo" => {
    if (score >= 80) return "excelente";
    if (score >= 60) return "bueno";
    if (score >= 40) return "regular";
    return "bajo";
  };

  const getScoreColor = (score: number): string => {
    const level = getScoreLevel(score);
    switch (level) {
      case "excelente": return "text-green-500";
      case "bueno": return "text-blue-500";
      case "regular": return "text-amber-500";
      default: return "text-red-500";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header with recommendation */}
      <Card className={cn(
        "p-6 border-2",
        recConfig.bgColor,
        recConfig.borderColor
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
              <Phone className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-foreground">{candidateName}</h3>
              <p className="text-sm text-muted-foreground">Candidato Ventas</p>
            </div>
          </div>
          <div className="text-right">
            <div className={cn("text-3xl font-bold", getScoreColor(totalScore))}>
              {totalScore.toFixed(1)}%
            </div>
            <Badge className={cn(recConfig.bgColor, recConfig.color, "border-0")}>
              {recConfig.emoji} {recConfig.label}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Metrics breakdown */}
      <Card className="p-6">
        <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Métricas Específicas de Ventas
        </h4>
        
        <div className="space-y-4">
          {metricConfig.map((config, index) => {
            const score = metrics[config.key as keyof SalesMetrics] || 0;
            const Icon = config.icon;
            
            return (
              <motion.div
                key={config.key}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", config.color)} />
                    <span className="text-sm font-medium text-foreground">
                      {config.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({config.weight})
                    </span>
                  </div>
                  <span className={cn("font-bold", getScoreColor(score))}>
                    {score.toFixed(0)}%
                  </span>
                </div>
                <Progress 
                  value={score} 
                  className="h-2"
                />
              </motion.div>
            );
          })}
        </div>
      </Card>

      {/* Strengths and Weaknesses */}
      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {strengths.length > 0 && (
            <Card className="p-4">
              <h5 className="font-medium text-green-600 mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Fortalezas
              </h5>
              <ul className="space-y-2">
                {strengths.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-green-500 mt-1">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {weaknesses.length > 0 && (
            <Card className="p-4">
              <h5 className="font-medium text-amber-600 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Áreas de Mejora
              </h5>
              <ul className="space-y-2">
                {weaknesses.map((w, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-amber-500 mt-1">⚠</span>
                    {w}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </motion.div>
  );
}
