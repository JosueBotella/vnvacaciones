import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Clock, CheckCircle, XCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

type Justificante = {
  id: string;
  tipo: string;
  estado: string;
  created_at: string;
};

interface JustificantesStatsPanelProps {
  justificantes: Justificante[];
  selectedStatus: string;
  onStatusChange: (status: string) => void;
}

export const JustificantesStatsPanel = ({ 
  justificantes, 
  selectedStatus, 
  onStatusChange 
}: JustificantesStatsPanelProps) => {
  // Calculate stats
  const stats = useMemo(() => {
    const total = justificantes.length;
    const pendientes = justificantes.filter(j => j.estado === "pendiente" || j.estado === "pendiente_docs").length;
    const gestionados = justificantes.filter(j => j.estado === "gestionado").length;
    const rechazados = justificantes.filter(j => j.estado === "rechazado").length;
    
    return { total, pendientes, gestionados, rechazados };
  }, [justificantes]);

  const pieData = useMemo(() => [
    { name: "Pendientes", value: stats.pendientes, color: "hsl(45, 93%, 47%)" },
    { name: "Gestionados", value: stats.gestionados, color: "hsl(75, 100%, 42%)" },
    { name: "Rechazados", value: stats.rechazados, color: "hsl(0, 84%, 60%)" },
  ], [stats]);

  const getPercentage = (value: number) => {
    if (stats.total === 0) return 0;
    return Math.round((value / stats.total) * 100);
  };

  const getTrend = (value: number) => {
    if (value === 0) return { icon: Minus, label: "Sin cambios", color: "text-muted-foreground" };
    if (value > 2) return { icon: TrendingUp, label: `${value} activos`, color: "text-primary" };
    return { icon: TrendingDown, label: "Bajo", color: "text-muted-foreground" };
  };

  const cards = [
    {
      key: "all",
      title: "Total",
      value: stats.total,
      icon: FileText,
      color: "text-foreground",
      bgColor: "bg-muted/30",
      borderColor: "border-border",
      showChart: true,
    },
    {
      key: "pendiente",
      title: "Pendientes",
      value: stats.pendientes,
      icon: Clock,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/30",
      percentage: getPercentage(stats.pendientes),
    },
    {
      key: "gestionado",
      title: "Gestionados",
      value: stats.gestionados,
      icon: CheckCircle,
      color: "text-primary",
      bgColor: "bg-primary/10",
      borderColor: "border-primary/30",
      percentage: getPercentage(stats.gestionados),
    },
    {
      key: "rechazado",
      title: "Rechazados",
      value: stats.rechazados,
      icon: XCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      borderColor: "border-destructive/30",
      percentage: getPercentage(stats.rechazados),
    },
  ];

  return (
    <div className="grid gap-3 sm:gap-4 md:gap-6 grid-cols-2 md:grid-cols-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        const isSelected = selectedStatus === card.key;
        const trend = getTrend(card.value);
        const TrendIcon = trend.icon;

        return (
          <Card
            key={card.key}
            onClick={() => onStatusChange(card.key)}
            className={cn(
              "shadow-sm opacity-0 animate-fade-in transition-all duration-300 cursor-pointer group",
              "hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
              isSelected && `ring-2 ring-offset-2 ring-offset-background ${card.key === "all" ? "ring-primary" : card.borderColor.replace("border-", "ring-")}`
            )}
            style={{ animationDelay: `${(index + 1) * 100}ms`, animationFillMode: "forwards" }}
          >
            <CardContent className="p-3 sm:p-4 md:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className={cn("p-1.5 rounded-lg", card.bgColor)}>
                      <Icon className={cn("h-3 w-3 sm:h-4 sm:w-4", card.color)} />
                    </div>
                    <span className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">
                      {card.title}
                    </span>
                  </div>
                  
                  <div className="flex items-end gap-2">
                    <span className={cn(
                      "text-2xl sm:text-3xl md:text-4xl font-bold transition-colors",
                      card.color
                    )}>
                      {card.value}
                    </span>
                    
                    {card.percentage !== undefined && (
                      <span className="text-[10px] sm:text-xs text-muted-foreground mb-1">
                        {card.percentage}%
                      </span>
                    )}
                  </div>
                  
                  {/* Mini progress bar for non-total cards */}
                  {card.percentage !== undefined && (
                    <div className="mt-2 h-1 bg-muted/50 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full transition-all duration-500", card.bgColor.replace("/10", "").replace("/30", ""))}
                        style={{ width: `${card.percentage}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Mini pie chart for total card */}
                {card.showChart && stats.total > 0 && (
                  <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius="50%"
                          outerRadius="95%"
                          paddingAngle={2}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {pieData.map((entry, i) => (
                            <Cell key={`cell-${i}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Click indicator */}
              <div className={cn(
                "mt-2 pt-2 border-t border-border/30 flex items-center justify-between",
                "text-[9px] sm:text-[10px] text-muted-foreground"
              )}>
                <span className="flex items-center gap-1">
                  <TrendIcon className="h-3 w-3" />
                  {trend.label}
                </span>
                <span className={cn(
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  isSelected && "opacity-100 text-primary font-medium"
                )}>
                  {isSelected ? "Filtro activo" : "Clic para filtrar"}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
