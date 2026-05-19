import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useManagerAuth } from "@/modules/auth/hooks/useManagerAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import LoadingScreen from "@/components/LoadingScreen";
import { LogoLink } from "@/components/LogoLink";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Sector } from "recharts";
import { 
  ArrowLeft, 
  Shield, 
  ChevronRight,
  ChevronLeft,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Target,
  Zap,
  Lock,
  FileCheck,
  Users,
  Lightbulb,
  ArrowRight,
  LogOut,
  User,
  Keyboard,
  ExternalLink,
  FileText,
  Calendar,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  PieChart,
  BarChart3,
  Briefcase,
  GraduationCap,
  Wrench,
  MessageSquare,
  Euro,
  BookOpen,
  Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Section definitions - 10 sections for complete budget analysis
const sections = [
  { id: "portada", label: "Portada", number: 1 },
  { id: "resumen", label: "Resumen Ejecutivo", number: 2 },
  { id: "desglose", label: "Desglose Presupuesto 3081", number: 3 },
  { id: "conectores", label: "Conectores 3082", number: 4 },
  { id: "fundae", label: "Fundae", number: 5 },
  { id: "consumo", label: "Análisis de Consumo", number: 6 },
  { id: "riesgos", label: "Riesgos", number: 7 },
  { id: "positivo", label: "Qué Está Bien", number: 8 },
  { id: "corregir", label: "Qué Corregir", number: 9 },
  { id: "horas", label: "Horas Restantes", number: 10 },
  { id: "futuro", label: "Próximos Módulos", number: 11 },
  { id: "conclusion", label: "Conclusión", number: 12 },
];

// === BUDGET DATA FROM EXCEL (Updated 30-12-2025) ===

// Presupuesto Inicial - 3081
const presupuesto3081 = {
  total: 52360,
  used: 46747.20, // Actualizado: 45947.20 + 800 (diferencia en parametrización)
  remaining: 5612.80, // 6400 - 787.20 sobreconsumo
  lastUpdate: "30-12-2025",
  items: [
    { 
      name: "Preparación entorno + repositorios", 
      description: "Instalación de Odoo 18.0 y configuración de repositorios con actualización automática",
      budget: 1800, 
      used: 1800, 
      remaining: 0,
      icon: Settings
    },
    { 
      name: "Parametrización procesos", 
      description: "Instalación y parametrización de los procesos de Odoo estándar, OCA y módulos propios de Studio73",
      budget: 19200, 
      used: 19987.20, 
      remaining: -787.20,
      overBudget: true,
      icon: Settings
    },
    { 
      name: "Dirección de proyecto", 
      description: "Dirección y gestión del proyecto de implantación",
      budget: 2560, 
      used: 2560, 
      remaining: 0,
      icon: Briefcase
    },
    { 
      name: "Reuniones y consultoría", 
      description: "Sesiones de consultoría y reuniones de seguimiento",
      budget: 9600, 
      used: 9600, 
      remaining: 0,
      icon: MessageSquare
    },
    { 
      name: "Formación y asistencia", 
      description: "Formación al equipo y asistencia en uso del sistema",
      budget: 6400, 
      used: 6400, 
      remaining: 0,
      icon: GraduationCap
    },
    { 
      name: "Asistencia arranque", 
      description: "Soporte durante el período de puesta en marcha",
      budget: 12800, 
      used: 6400, 
      remaining: 6400,
      note: "Quedan 80 horas",
      icon: Wrench
    },
  ]
};

// Presupuesto Conectores - 3082
const presupuesto3082 = {
  total: 17520,
  used: 17520,
  remaining: 0,
  lastUpdate: "30-12-2025",
  items: [
    { 
      name: "Conector con Salix/Lilium", 
      description: "Integración completa con el sistema Salix/Lilium",
      budget: 14320, 
      used: 14320, 
      remaining: 0,
      icon: Wrench
    },
    { 
      name: "Ampliación ficha de cliente", 
      description: "Personalización y ampliación de la ficha de cliente",
      budget: 3200, 
      used: 3200, 
      remaining: 0,
      icon: FileText
    },
  ]
};

// Fundae
const fundaeData = {
  concedido: 18850,
  used: 320,
  remaining: 18530,
  asientoDiciembre: 3540,
  lastUpdate: "30-12-2025",
  items: [
    {
      name: "CRM y WhatsApp",
      description: "Visualización de tiempo transcurrido desde el último WhatsApp del cliente en Kanban y Formulario del CRM",
      concedido: 18850,
      used: 320,
      remaining: 18530
    }
  ],
  pendingAmount: 14990 // Fondo disponible para próximas formaciones
};

// Presupuestos cerrados - Diciembre
const presupuestosCerrados = {
  mes: "Diciembre",
  total: 3540,
  lastUpdate: "30-12-2025",
  items: [
    { ref: "SO4922", description: "Campo de Conversaciones abiertas en header", amount: 320, fundae: true },
    { ref: "SO4922", description: "Mensajes de ausencias fijas y personalizadas", amount: 820, fundae: true },
    { ref: "SO4852", description: "WhatsApp: Vincular conversaciones entrantes a oportunidades", amount: 480, fundae: true },
    { ref: "SO4852", description: "WhatsApp: Selección de número de teléfono en wizard", amount: 560, fundae: true },
    { ref: "SO4852", description: "WhatsApp: Modificar display_name para contactos Salix", amount: 640, fundae: true },
    { ref: "SO4852", description: "WhatsApp: Vincular conversaciones de cliente a oportunidades", amount: 400, fundae: true },
    { ref: "SO4757", description: "Contactos: nombre comercial para conversaciones WhatsApp", amount: 320, fundae: true },
  ]
};

// Totals calculation - Incluye: 3081 + 3082 + Fundae + Cerrados = 92.270€
const totalGeneral = presupuesto3081.total + presupuesto3082.total + fundaeData.concedido + presupuestosCerrados.total;
const totalUsed = presupuesto3081.used + presupuesto3082.used + fundaeData.used + presupuestosCerrados.total;
const totalRemaining = presupuesto3081.remaining + fundaeData.remaining;
const consumptionPercentage = ((totalUsed / totalGeneral) * 100).toFixed(1);

const risks = [
  { 
    title: "Alcance abierto", 
    description: "Sin definición clara de entregables finales en futuras fases",
    level: "high",
    impact: "Alto riesgo de sobrecoste",
    action: "Exigir SOW cerrado antes de cada fase"
  },
  { 
    title: "Sobreconsumo en reuniones", 
    description: "Consultoría consume recursos sin resultados tangibles documentados",
    level: "high",
    impact: "Horas quemadas sin avance",
    action: "Limitar a 2h/semana con acta obligatoria"
  },
  { 
    title: "Dependencia del integrador", 
    description: "Conocimiento técnico no transferido al equipo interno",
    level: "medium",
    impact: "Sin autonomía operativa",
    action: "Documentación obligatoria antes de cierre"
  },
  { 
    title: "Horas limitadas", 
    description: "Solo 80 horas restantes para completar todas las tareas pendientes",
    level: "medium",
    impact: "Riesgo de proyecto incompleto",
    action: "Priorización estricta de tareas"
  },
  { 
    title: "Falta de métricas de éxito", 
    description: "No hay KPIs definidos para medir el éxito de la implantación",
    level: "medium",
    impact: "Imposible evaluar ROI",
    action: "Definir métricas antes de cerrar"
  },
];

const positives = [
  { 
    title: "Conectores cerrados", 
    description: "Presupuesto 3082 completado al 100% y funcional",
    value: "17.520€ invertidos",
    icon: CheckCircle2
  },
  { 
    title: "Base técnica instalada", 
    description: "Infraestructura Odoo 18.0 operativa y configurada",
    value: "Producción activa",
    icon: Settings
  },
  { 
    title: "Integración Salix/Lilium", 
    description: "Conexión completada con el sistema heredado",
    value: "Operativo",
    icon: Wrench
  },
  { 
    title: "Fundae disponible", 
    description: "Crédito para formación pendiente de aprovechar",
    value: "18.530€ disponibles",
    icon: GraduationCap
  },
  { 
    title: "WhatsApp operativo", 
    description: "Integración WhatsApp/CRM funcionando en producción",
    value: "7 mejoras implementadas",
    icon: MessageSquare
  },
];

const corrections = [
  { 
    title: "Exigir entregables cerrados", 
    description: "Definir exactamente qué se entrega antes de cada fase",
    priority: "Crítico",
    deadline: "Antes de nueva bolsa"
  },
  { 
    title: "Limitar reuniones", 
    description: "Máximo 2h semanales con acta obligatoria de compromisos",
    priority: "Alto",
    deadline: "Inmediato"
  },
  { 
    title: "Control de cambios formal", 
    description: "Todo cambio de alcance requiere aprobación escrita y valoración",
    priority: "Alto",
    deadline: "Próxima reunión"
  },
  { 
    title: "Transferencia de conocimiento", 
    description: "Documentación técnica obligatoria antes de cerrar cualquier módulo",
    priority: "Alto",
    deadline: "Antes de cierre"
  },
  { 
    title: "Métricas de control", 
    description: "Establecer KPIs para medir avance real vs. horas consumidas",
    priority: "Medio",
    deadline: "Esta semana"
  },
];

// Próximos módulos a considerar
const proximosModulos = [
  {
    name: "RRHH / Nóminas",
    status: "Por evaluar",
    priority: "Bajo",
    notes: "Analizar necesidades reales antes de comprometer presupuesto",
    recommendation: "Solicitar demo y caso de uso específico"
  },
  {
    name: "Contabilidad",
    status: "Por evaluar", 
    priority: "Bajo",
    notes: "Evaluar integración con sistema actual",
    recommendation: "Comparar coste vs beneficio real"
  },
  {
    name: "Gestión de Producción",
    status: "Desarrollo interno",
    priority: "Alto",
    notes: "Sistema propio de vacaciones, justificantes y módulo laboral para control del personal",
    recommendation: "Continuar desarrollo interno sin dependencia del integrador"
  },
];

// Format currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-ES', { 
    style: 'currency', 
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -30 }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

const scaleIn = {
  initial: { scale: 0.9, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.9, opacity: 0 }
};

// Animated Progress Bar Component
const AnimatedProgress = ({ value, delay = 0, className = "", showValue = false }: { value: number; delay?: number; className?: string; showValue?: boolean }) => {
  const [currentValue, setCurrentValue] = useState(0);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentValue(value);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  const getColor = () => {
    if (value > 100) return "bg-red-500";
    if (value >= 95) return "bg-amber-500";
    if (value >= 80) return "bg-amber-400";
    return "bg-primary";
  };

  return (
    <div className="relative">
      <div className={cn("h-3 bg-muted/30 rounded-full overflow-hidden", className)}>
        <motion.div
          className={cn("h-full rounded-full", getColor())}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(currentValue, 100)}%` }}
          transition={{ duration: 1.2, ease: "easeOut", delay: delay / 1000 }}
        />
      </div>
      {showValue && (
        <motion.span 
          className="absolute right-0 -top-6 text-sm font-medium"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay / 1000 + 0.5 }}
        >
          {Math.round(currentValue)}%
        </motion.span>
      )}
    </div>
  );
};

// Animated Counter Component
const AnimatedCounter = ({ value, prefix = "", suffix = "", delay = 0, decimals = 0 }: { value: number; prefix?: string; suffix?: string; delay?: number; decimals?: number }) => {
  const [currentValue, setCurrentValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const duration = 1500;
      const steps = 60;
      const increment = value / steps;
      let current = 0;
      
      const interval = setInterval(() => {
        current += increment;
        if (current >= value) {
          setCurrentValue(value);
          clearInterval(interval);
        } else {
          setCurrentValue(current);
        }
      }, duration / steps);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return <span>{prefix}{currentValue.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
};

// Risk Indicator Component - Fixed centering
const RiskIndicator = ({ level }: { level: "low" | "medium" | "high" }) => {
  const colors = {
    low: "bg-primary",
    medium: "bg-amber-500",
    high: "bg-red-500"
  };

  const glowColors = {
    low: "shadow-[0_0_12px_rgba(147,214,0,0.6)]",
    medium: "shadow-[0_0_12px_rgba(245,158,11,0.6)]",
    high: "shadow-[0_0_12px_rgba(239,68,68,0.6)]"
  };

  return (
    <div className="flex items-center justify-center w-6 h-6 flex-shrink-0">
      <motion.div
        className={cn("w-3 h-3 rounded-full", colors[level], glowColors[level])}
        animate={{ 
          scale: [1, 1.3, 1],
          opacity: [1, 0.8, 1]
        }}
        transition={{ 
          duration: 2, 
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
    </div>
  );
};

// Interactive Card Component with Actions
const InteractiveCard = ({ 
  children, 
  className = "", 
  delay = 0,
  onClick,
  expandable = false,
  expanded = false,
  onToggle
}: { 
  children: React.ReactNode; 
  className?: string; 
  delay?: number;
  onClick?: () => void;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) => (
  <motion.div
    variants={fadeInUp}
    initial="initial"
    animate="animate"
    transition={{ duration: 0.5, delay: delay / 1000 }}
    whileHover={{ scale: 1.01, transition: { duration: 0.2 } }}
    whileTap={onClick ? { scale: 0.99 } : undefined}
    onClick={onClick}
    className={cn(
      "relative rounded-2xl bg-card/60 backdrop-blur-sm p-6",
      "border border-border/20",
      "shadow-[0_4px_24px_-8px_rgba(0,0,0,0.3)]",
      "hover:shadow-[0_8px_32px_-8px_rgba(147,214,0,0.12)]",
      "hover:border-primary/20",
      "transition-all duration-300",
      onClick && "cursor-pointer",
      className
    )}
  >
    {children}
    {expandable && (
      <button 
        onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
        className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted/50 transition-colors z-10"
      >
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
    )}
  </motion.div>
);

// Section Header Component
const SectionHeader = ({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) => (
  <motion.div 
    className="mb-12 text-center"
    variants={fadeInUp}
    initial="initial"
    animate="animate"
  >
    {badge && (
      <Badge variant="outline" className="mb-4 bg-muted/30 text-muted-foreground border-border/30">
        {badge}
      </Badge>
    )}
    <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">{title}</h2>
    {subtitle && <p className="text-muted-foreground text-lg font-light">{subtitle}</p>}
  </motion.div>
);

// Stat Card Component
const StatCard = ({ 
  label, 
  value, 
  icon: Icon, 
  variant = "default",
  subtitle,
  delay = 0,
  onClick
}: { 
  label: string; 
  value: string | React.ReactNode; 
  icon: React.ElementType; 
  variant?: "default" | "success" | "warning" | "danger";
  subtitle?: string;
  delay?: number;
  onClick?: () => void;
}) => {
  const variants = {
    default: { text: "text-foreground", bg: "bg-muted/30", icon: "text-muted-foreground" },
    success: { text: "text-primary", bg: "bg-primary/5", icon: "text-primary" },
    warning: { text: "text-amber-500", bg: "bg-amber-500/5", icon: "text-amber-500" },
    danger: { text: "text-red-500", bg: "bg-red-500/5", icon: "text-red-500" }
  };

  const v = variants[variant];

  return (
    <motion.div
      variants={scaleIn}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.4, delay: delay / 1000 }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      onClick={onClick}
      className={cn(
        "text-center p-6 rounded-2xl transition-all duration-300",
        v.bg,
        "hover:shadow-lg",
        onClick && "cursor-pointer"
      )}
    >
      <div className={cn("inline-flex p-3 rounded-xl mb-3", v.bg)}>
        <Icon className={cn("h-5 w-5", v.icon)} />
      </div>
      <p className={cn("text-2xl md:text-3xl font-bold mb-1", v.text)}>{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {subtitle && <p className="text-xs text-muted-foreground/70 mt-1">{subtitle}</p>}
    </motion.div>
  );
};

// Budget Item Row Component
const BudgetItemRow = ({ item, index, showDetails }: { item: any; index: number; showDetails?: boolean }) => {
  const [expanded, setExpanded] = useState(false);
  const percentage = (item.used / item.budget) * 100;
  const Icon = item.icon || FileText;

  return (
    <InteractiveCard 
      delay={index * 80} 
      className="p-4"
      expandable={!!item.description}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-4">
        <div className="p-2 rounded-xl bg-muted/30 flex-shrink-0">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0 pr-8">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium truncate pr-4">{item.name}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(
                  "text-sm font-semibold px-3 py-1 rounded-full flex-shrink-0",
                  percentage > 100 ? "bg-red-500/20 text-red-500" :
                  percentage >= 95 ? "bg-amber-500/20 text-amber-500" :
                  percentage === 100 ? "bg-muted/50 text-muted-foreground" :
                  "bg-primary/20 text-primary"
                )}>
                  {percentage.toFixed(0)}%
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {formatCurrency(item.used)} de {formatCurrency(item.budget)}
              </TooltipContent>
            </Tooltip>
          </div>
          <AnimatedProgress value={percentage} delay={index * 80 + 200} className="h-2" />
          <div className="flex justify-between mt-2 text-xs">
            <span className="text-muted-foreground">Usado: {formatCurrency(item.used)}</span>
            <span className={cn(
              item.remaining < 0 ? "text-red-500 font-semibold" : "text-muted-foreground"
            )}>
              {item.remaining < 0 ? `Exceso: ${formatCurrency(Math.abs(item.remaining))}` : `Restante: ${formatCurrency(item.remaining)}`}
            </span>
          </div>
          {item.note && (
            <div className="mt-2 text-xs text-primary font-medium">
              ✓ {item.note}
            </div>
          )}
        </div>
      </div>
      
      <AnimatePresence>
        {expanded && item.description && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-border/20 text-sm text-muted-foreground">
              {item.description}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </InteractiveCard>
  );
};

// ===== SECTION COMPONENTS =====

const PortadaSection = () => (
  <motion.div 
    className="flex flex-col items-center justify-center min-h-[75vh] text-center"
    variants={staggerContainer}
    initial="initial"
    animate="animate"
  >
    <motion.div variants={fadeInUp} className="mb-8">
      <Badge 
        variant="outline" 
        className="bg-muted/30 text-muted-foreground border-border/30 text-sm px-4 py-2"
      >
        <Shield className="h-4 w-4 mr-2" />
        Documento de Uso Interno
      </Badge>
    </motion.div>
    
    <motion.h1 
      variants={fadeInUp}
      className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-4"
    >
      Análisis del Presupuesto
    </motion.h1>
    
    <motion.h2 
      variants={fadeInUp}
      className="text-2xl md:text-3xl text-primary font-semibold mb-6"
    >
      Implantación Odoo – Studio73
    </motion.h2>
    
    <motion.p 
      variants={fadeInUp}
      className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-light mb-8"
    >
      Control económico, análisis de gestión, riesgos detectados y hoja de ruta para próximos pasos
    </motion.p>

    <motion.div 
      variants={fadeInUp}
      className="flex items-center gap-4 text-sm text-muted-foreground mb-16"
    >
      <Calendar className="h-4 w-4" />
      <span>Última actualización: 30 Diciembre 2025</span>
      <span className="w-1 h-1 rounded-full bg-muted-foreground" />
      <span>Verdnatura</span>
    </motion.div>

    <motion.div 
      variants={fadeInUp}
      className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 pt-8 border-t border-border/20 max-w-3xl w-full"
    >
      <div className="text-center p-4">
        <p className="text-2xl md:text-3xl font-bold text-foreground mb-1">
          <AnimatedCounter value={totalGeneral} suffix="€" />
        </p>
        <p className="text-xs text-muted-foreground">Presupuesto Total</p>
      </div>
      <div className="text-center p-4">
        <p className="text-2xl md:text-3xl font-bold text-amber-500 mb-1">
          <AnimatedCounter value={parseFloat(consumptionPercentage)} suffix="%" delay={200} decimals={1} />
        </p>
        <p className="text-xs text-muted-foreground">Consumido</p>
      </div>
      <div className="text-center p-4">
        <p className="text-2xl md:text-3xl font-bold text-primary mb-1">
          <AnimatedCounter value={totalRemaining} suffix="€" delay={400} />
        </p>
        <p className="text-xs text-muted-foreground">Disponible</p>
      </div>
      <div className="text-center p-4">
        <p className="text-2xl md:text-3xl font-bold text-primary mb-1">
          <AnimatedCounter value={80} suffix="h" delay={600} />
        </p>
        <p className="text-xs text-muted-foreground">Horas Restantes</p>
      </div>
    </motion.div>

    <motion.div 
      variants={fadeInUp}
      className="mt-16 flex items-center gap-2 text-sm text-muted-foreground/50"
    >
      <Keyboard className="h-4 w-4" />
      <span>Usa las flechas del teclado para navegar</span>
    </motion.div>
  </motion.div>
);

const ResumenSection = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [chartReady, setChartReady] = useState(false);
  
  // Datos para el gráfico donut
  const chartData = [
    { 
      name: "Implantación 3081", 
      value: presupuesto3081.total, 
      used: presupuesto3081.used,
      fill: "hsl(var(--primary))",
      percentage: (presupuesto3081.total / totalGeneral * 100).toFixed(1)
    },
    { 
      name: "Conectores 3082", 
      value: presupuesto3082.total, 
      used: presupuesto3082.used,
      fill: "hsl(217, 91%, 60%)",
      percentage: (presupuesto3082.total / totalGeneral * 100).toFixed(1)
    },
    { 
      name: "Fundae", 
      value: fundaeData.concedido, 
      used: fundaeData.used,
      fill: "hsl(142, 76%, 36%)",
      percentage: (fundaeData.concedido / totalGeneral * 100).toFixed(1)
    },
    { 
      name: "Desarrollos Dic.", 
      value: presupuestosCerrados.total, 
      used: presupuestosCerrados.total,
      fill: "hsl(263, 70%, 50%)",
      percentage: (presupuestosCerrados.total / totalGeneral * 100).toFixed(1)
    },
  ];

  // Colores para las tarjetas de leyenda
  const legendColors = [
    "bg-primary",
    "bg-blue-500", 
    "bg-green-600",
    "bg-violet-500"
  ];

  const glowColors = [
    "#93d600",
    "#3b82f6",
    "#16a34a",
    "#8b5cf6"
  ];

  // Activar el centro después de la animación del chart
  useEffect(() => {
    const timer = setTimeout(() => {
      setChartReady(true);
    }, 1200);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <SectionHeader 
        title="Resumen Ejecutivo" 
        subtitle="Estado financiero global del proyecto"
        badge="OVERVIEW"
      />

      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <StatCard 
          label="Presupuesto Total" 
          value={formatCurrency(totalGeneral)}
          icon={Euro}
          subtitle="Todos los conceptos"
          delay={0}
        />
        <StatCard 
          label="Utilizado" 
          value={formatCurrency(totalUsed)}
          icon={TrendingUp}
          variant="warning"
          subtitle={`${consumptionPercentage}% consumido`}
          delay={100}
        />
        <StatCard 
          label="Disponible" 
          value={formatCurrency(totalRemaining)}
          icon={TrendingDown}
          variant="success"
          subtitle="Arranque + Fundae"
          delay={200}
        />
        <StatCard 
          label="Fundae Disponible" 
          value={formatCurrency(fundaeData.remaining)}
          icon={GraduationCap}
          variant="success"
          subtitle="Crédito formación"
          delay={300}
        />
      </div>

      {/* Gráfico Donut con animación premium */}
      <InteractiveCard delay={350} className="mb-6">
        <div className="flex flex-col lg:flex-row items-center gap-8">
          {/* Donut Chart con Recharts - Más grande */}
          <motion.div 
            className="w-full lg:w-1/2 h-[360px] relative flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <defs>
                  <filter id="donut-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={85}
                  outerRadius={activeIndex !== null ? 130 : 125}
                  paddingAngle={2}
                  dataKey="value"
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  animationBegin={300}
                  animationDuration={1000}
                  animationEasing="ease-out"
                >
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.fill}
                      stroke="transparent"
                      style={{ 
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        filter: activeIndex === index ? 'url(#donut-glow)' : 'none',
                        transform: activeIndex === index ? 'scale(1.05)' : 'scale(1)',
                        transformOrigin: 'center'
                      }}
                    />
                  ))}
                </Pie>
              </RechartsPieChart>
            </ResponsiveContainer>
            
            {/* Centro del donut - Más espacioso */}
            <motion.div 
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: chartReady ? 1 : 0, scale: chartReady ? 1 : 0.5 }}
              transition={{ 
                duration: 0.5,
                delay: 0.2,
                ease: [0.34, 1.56, 0.64, 1]
              }}
            >
              <AnimatePresence mode="wait">
                {activeIndex === null ? (
                  <motion.div
                    key="total"
                    className="text-center px-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <span className="text-3xl font-bold block mb-1">{formatCurrency(totalGeneral)}</span>
                    <span className="text-sm text-muted-foreground">Presupuesto Total</span>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`sector-${activeIndex}`}
                    className="text-center px-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <span className="text-sm font-medium text-muted-foreground block mb-1">{chartData[activeIndex].name}</span>
                    <span className="text-2xl font-bold block">{formatCurrency(chartData[activeIndex].value)}</span>
                    <span className="text-sm text-muted-foreground">{chartData[activeIndex].percentage}%</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>

          {/* Leyenda interactiva */}
          <div className="w-full lg:w-1/2 space-y-3">
            <motion.p 
              className="text-sm font-semibold mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Distribución por Conceptos
            </motion.p>
            {chartData.map((item, index) => {
              const itemPercentage = (item.used / item.value * 100);
              
              return (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ 
                    duration: 0.4,
                    delay: 0.6 + index * 0.1,
                    ease: "easeOut"
                  }}
                  className={cn(
                    "p-3 rounded-xl border transition-all duration-300 cursor-pointer",
                    activeIndex === index 
                      ? "bg-muted/40 border-primary/40 shadow-lg shadow-primary/10 scale-[1.02]" 
                      : "bg-muted/20 border-border/10 hover:bg-muted/30 hover:border-border/20"
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div 
                        className={cn("w-4 h-4 rounded-full", legendColors[index])}
                        animate={{
                          scale: activeIndex === index ? 1.3 : 1,
                          boxShadow: activeIndex === index ? `0 0 12px ${glowColors[index]}` : 'none'
                        }}
                        transition={{ duration: 0.2 }}
                      />
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.percentage}% del total</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(item.value)}</p>
                      <span className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        itemPercentage >= 100 ? "bg-muted/50 text-muted-foreground" :
                        itemPercentage >= 80 ? "bg-amber-500/20 text-amber-500" :
                        "bg-primary/20 text-primary"
                      )}>
                        {itemPercentage.toFixed(0)}% usado
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </InteractiveCard>

      <InteractiveCard delay={500}>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Consumo global del proyecto</span>
            <span className="text-2xl font-bold text-amber-500">{consumptionPercentage}%</span>
          </div>
          <AnimatedProgress value={parseFloat(consumptionPercentage)} delay={700} className="h-4" />
          
          <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-border/20">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/20">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm mb-1">Conectores completados</p>
                <p className="text-xs text-muted-foreground">
                  3082 al 100%. Salix/Lilium integrado y operativo.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm mb-1">Control de horas crítico</p>
                <p className="text-xs text-muted-foreground">
                  Solo 80h restantes en 3081. Fundae disponible: {formatCurrency(fundaeData.remaining)}.
                </p>
              </div>
            </div>
          </div>
        </div>
      </InteractiveCard>
    </div>
  );
};

const DesgloseSection = () => (
  <div className="max-w-4xl mx-auto">
    <SectionHeader 
      title="Presupuesto 3081" 
      subtitle="Implantación Odoo - Desglose por partidas"
      badge={`Total: ${formatCurrency(presupuesto3081.total)}`}
    />

    <motion.div 
      className="space-y-3"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {presupuesto3081.items.map((item, index) => (
        <BudgetItemRow key={item.name} item={item} index={index} showDetails />
      ))}
    </motion.div>

    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      transition={{ delay: 0.8 }}
      className="mt-8 p-6 rounded-2xl bg-amber-500/5 border border-amber-500/20"
    >
      <div className="flex items-center gap-4">
        <Clock className="h-8 w-8 text-amber-500" />
        <div>
          <p className="font-semibold mb-1">80 horas disponibles = {formatCurrency(6400)}</p>
          <p className="text-sm text-muted-foreground">
            Único margen restante. Cada hora debe estar justificada con entregables concretos.
          </p>
        </div>
      </div>
    </motion.div>
  </div>
);

const ConectoresSection = () => (
  <div className="max-w-4xl mx-auto">
    <SectionHeader 
      title="Presupuesto 3082" 
      subtitle="Conectores e integraciones"
      badge={`Completado: ${formatCurrency(presupuesto3082.total)}`}
    />

    <motion.div 
      className="space-y-3 mb-8"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {presupuesto3082.items.map((item, index) => (
        <BudgetItemRow key={item.name} item={item} index={index} />
      ))}
    </motion.div>

    <InteractiveCard delay={400}>
      <div className="flex items-center gap-4">
        <div className="p-4 rounded-2xl bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-primary mb-1">Presupuesto completado ✓</p>
          <p className="text-sm text-muted-foreground">
            Los conectores están operativos. Integración Salix/Lilium funcionando en producción.
            Este presupuesto se considera cerrado y exitoso.
          </p>
        </div>
      </div>
    </InteractiveCard>
  </div>
);

const FundaeSection = () => (
  <div className="max-w-4xl mx-auto">
    <SectionHeader 
      title="Fundae" 
      subtitle="Crédito formación bonificada"
      badge={`Disponible: ${formatCurrency(fundaeData.remaining)}`}
    />

    <div className="grid md:grid-cols-3 gap-4 mb-8">
      <StatCard 
        label="Concedido" 
        value={formatCurrency(fundaeData.concedido)}
        icon={GraduationCap}
        delay={0}
      />
      <StatCard 
        label="Utilizado" 
        value={formatCurrency(fundaeData.used)}
        icon={TrendingUp}
        variant="warning"
        delay={100}
      />
      <StatCard 
        label="Disponible" 
        value={formatCurrency(fundaeData.remaining)}
        icon={TrendingDown}
        variant="success"
        delay={200}
      />
    </div>

    <InteractiveCard delay={300} className="mb-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        Trabajos facturados contra Fundae (Diciembre)
      </h3>
      <div className="space-y-2">
        {presupuestosCerrados.items.map((item, index) => (
          <motion.div
            key={index}
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.4 + index * 0.05 }}
            className="flex items-center justify-between p-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs font-mono bg-muted/30">
                {item.ref}
              </Badge>
              <span className="text-sm">{item.description}</span>
            </div>
            <span className="font-medium text-sm">{formatCurrency(item.amount)}</span>
          </motion.div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-border/20 flex justify-between items-center">
        <span className="font-medium">Total Diciembre</span>
        <span className="font-bold text-lg">{formatCurrency(presupuestosCerrados.total)}</span>
      </div>
    </InteractiveCard>

    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      transition={{ delay: 0.8 }}
      className="p-6 rounded-2xl bg-primary/5 border border-primary/20"
    >
      <div className="flex items-start gap-4">
        <Lightbulb className="h-6 w-6 text-primary flex-shrink-0" />
        <div>
          <p className="font-semibold mb-1">Oportunidad de formación</p>
          <p className="text-sm text-muted-foreground">
            Quedan <strong className="text-primary">{formatCurrency(fundaeData.remaining)}</strong> disponibles para formación bonificada. 
            Considerar formación estructurada para el equipo antes de que expire el crédito.
          </p>
        </div>
      </div>
    </motion.div>
  </div>
);

const ConsumoSection = () => (
  <div className="max-w-4xl mx-auto">
    <SectionHeader 
      title="Análisis de Consumo" 
      subtitle="¿Dónde se ha invertido el presupuesto?"
      badge="ANÁLISIS"
    />

    <div className="grid md:grid-cols-2 gap-6 mb-8">
      <InteractiveCard delay={0}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-primary/10">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>
          <h3 className="font-semibold">Ejecución Técnica</h3>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Las partidas técnicas se han completado según lo planificado.
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5">
            <span className="text-sm">Conectores (3082)</span>
            <span className="font-medium text-primary">100% ✓</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5">
            <span className="text-sm">Infraestructura Odoo</span>
            <span className="font-medium text-primary">Operativo</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5">
            <span className="text-sm">Integración WhatsApp</span>
            <span className="font-medium text-primary">7 mejoras</span>
          </div>
        </div>
      </InteractiveCard>

      <InteractiveCard delay={200}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-amber-500/10">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
          <h3 className="font-semibold">Puntos de Atención</h3>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Áreas que requieren control en próximas fases.
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5">
            <span className="text-sm">Reuniones/Consultoría</span>
            <span className="font-medium text-amber-500">Monitorizar</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5">
            <span className="text-sm">Documentación</span>
            <span className="font-medium text-amber-500">Pendiente</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5">
            <span className="text-sm">Transferencia conocimiento</span>
            <span className="font-medium text-amber-500">Crítico</span>
          </div>
        </div>
      </InteractiveCard>
    </div>

    <InteractiveCard delay={400}>
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-muted/30">
          <BarChart3 className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h4 className="font-semibold mb-2">Conclusión del análisis</h4>
          <p className="text-muted-foreground text-sm">
            La base técnica está instalada y los conectores son funcionales. El reto principal
            está en <strong>maximizar el valor de las 80 horas restantes</strong> y asegurar
            la <strong>transferencia de conocimiento</strong> antes de cerrar esta fase.
          </p>
        </div>
      </div>
    </InteractiveCard>
  </div>
);

const RiesgosSection = () => {
  const [selectedRisk, setSelectedRisk] = useState<number | null>(null);

  return (
    <div className="max-w-4xl mx-auto">
      <SectionHeader 
        title="Riesgos Detectados" 
        subtitle="Puntos críticos que requieren atención"
        badge={`${risks.length} RIESGOS IDENTIFICADOS`}
      />

      <motion.div 
        className="grid md:grid-cols-2 gap-4"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {risks.map((risk, index) => (
          <motion.div
            key={risk.title}
            variants={fadeInUp}
            transition={{ delay: index * 0.1 }}
          >
            <InteractiveCard 
              className={cn(
                "h-full",
                selectedRisk === index && "ring-2 ring-primary/50"
              )}
              onClick={() => setSelectedRisk(selectedRisk === index ? null : index)}
            >
              <div className="flex items-start gap-3">
                <RiskIndicator level={risk.level as "low" | "medium" | "high"} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="font-semibold">{risk.title}</h3>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs",
                        risk.level === "high" ? "border-red-500/30 text-red-500 bg-red-500/10" :
                        risk.level === "medium" ? "border-amber-500/30 text-amber-500 bg-amber-500/10" :
                        "border-primary/30 text-primary bg-primary/10"
                      )}
                    >
                      {risk.level === "high" ? "Alto" : risk.level === "medium" ? "Medio" : "Bajo"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{risk.description}</p>
                  
                  <AnimatePresence>
                    {selectedRisk === index && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-3 border-t border-border/20 space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            <span className="text-muted-foreground">Impacto:</span>
                            <span className="font-medium">{risk.impact}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Zap className="h-4 w-4 text-primary" />
                            <span className="text-muted-foreground">Acción:</span>
                            <span className="font-medium text-primary">{risk.action}</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </InteractiveCard>
          </motion.div>
        ))}
      </motion.div>

      <motion.p
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.6 }}
        className="text-center text-sm text-muted-foreground/60 mt-6"
      >
        Haz clic en cada riesgo para ver detalles y acciones recomendadas
      </motion.p>
    </div>
  );
};

const PositivoSection = () => (
  <div className="max-w-4xl mx-auto">
    <SectionHeader 
      title="Qué Está Bien" 
      subtitle="Aspectos positivos del proyecto"
      badge="LOGROS"
    />

    <motion.div 
      className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {positives.map((item, index) => {
        const Icon = item.icon;
        return (
          <motion.div
            key={item.title}
            variants={fadeInUp}
            transition={{ delay: index * 0.1 }}
          >
            <InteractiveCard className="h-full">
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">{item.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground flex-1 mb-3">{item.description}</p>
                <div className="pt-3 border-t border-border/20">
                  <span className="text-sm font-medium text-primary">{item.value}</span>
                </div>
              </div>
            </InteractiveCard>
          </motion.div>
        );
      })}
    </motion.div>
  </div>
);

const CorregirSection = () => (
  <div className="max-w-4xl mx-auto">
    <SectionHeader 
      title="Qué Corregir Ahora" 
      subtitle="Acciones inmediatas para próximas fases"
      badge="ACCIONES"
    />

    <motion.div 
      className="space-y-3"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {corrections.map((item, index) => (
        <motion.div
          key={item.title}
          variants={fadeInUp}
          transition={{ delay: index * 0.1 }}
        >
          <InteractiveCard className="p-4">
            <div className="flex items-start gap-4">
              <div className={cn(
                "flex items-center justify-center w-10 h-10 rounded-xl font-bold text-sm flex-shrink-0",
                item.priority === "Crítico" ? "bg-red-500/10 text-red-500" :
                item.priority === "Alto" ? "bg-amber-500/10 text-amber-500" :
                "bg-muted/50 text-muted-foreground"
              )}>
                {index + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-semibold">{item.title}</h3>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      item.priority === "Crítico" ? "border-red-500/30 text-red-500" :
                      item.priority === "Alto" ? "border-amber-500/30 text-amber-500" :
                      "border-muted-foreground/30"
                    )}
                  >
                    {item.priority}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{item.deadline}</span>
                </div>
              </div>
            </div>
          </InteractiveCard>
        </motion.div>
      ))}
    </motion.div>
  </div>
);

const HorasSection = () => (
  <div className="max-w-4xl mx-auto">
    <SectionHeader 
      title="Uso Estratégico de Horas" 
      subtitle="Cómo invertir las 80 horas restantes"
      badge="80 HORAS = 6.400€"
    />

    <div className="grid md:grid-cols-2 gap-8">
      <div>
        <motion.h3 
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          className="flex items-center gap-2 text-lg font-semibold mb-6 text-red-500"
        >
          <XCircle className="h-5 w-5" />
          NO usar para
        </motion.h3>
        <motion.div 
          className="space-y-3"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {[
            "Más reuniones de seguimiento sin acta",
            "Cambios de alcance no planificados",
            "Nuevas funcionalidades no prioritarias",
            "Resolución de problemas sin documentar",
            "Consultoría sin entregable definido"
          ].map((item, index) => (
            <motion.div
              key={item}
              variants={fadeInUp}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-colors"
            >
              <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <span className="text-sm">{item}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div>
        <motion.h3 
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.2 }}
          className="flex items-center gap-2 text-lg font-semibold mb-6 text-primary"
        >
          <CheckCircle2 className="h-5 w-5" />
          SÍ priorizar
        </motion.h3>
        <motion.div 
          className="space-y-3"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {[
            "Formación estructurada con Fundae",
            "Documentación técnica completa",
            "Pruebas de integración críticas",
            "Cierre formal con entregables",
            "Transferencia de conocimiento"
          ].map((item, index) => (
            <motion.div
              key={item}
              variants={fadeInUp}
              transition={{ delay: 0.2 + index * 0.1 }}
              className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-sm">{item}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>

    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      transition={{ delay: 0.6 }}
      className="mt-12"
    >
      <InteractiveCard>
        <div className="flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-amber-500/10">
            <Clock className="h-8 w-8 text-amber-500" />
          </div>
          <div>
            <p className="text-3xl font-bold text-amber-500 mb-1">80 horas = {formatCurrency(6400)}</p>
            <p className="text-sm text-muted-foreground">
              Recurso limitado y finito. Cada hora mal invertida es irrecuperable.
              Exigir entregable concreto por cada hora consumida.
            </p>
          </div>
        </div>
      </InteractiveCard>
    </motion.div>
  </div>
);

const FuturoSection = () => (
  <div className="max-w-4xl mx-auto">
    <SectionHeader 
      title="Próximos Módulos" 
      subtitle="Consideraciones para futuras ampliaciones"
      badge="HOJA DE RUTA"
    />

    <motion.div 
      className="space-y-4 mb-8"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {proximosModulos.map((modulo, index) => (
        <motion.div
          key={modulo.name}
          variants={fadeInUp}
          transition={{ delay: index * 0.15 }}
        >
          <InteractiveCard className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold">{modulo.name}</h3>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      modulo.priority === "Bajo" ? "border-muted-foreground/30" :
                      modulo.priority === "Medio" ? "border-amber-500/30 text-amber-500" :
                      "border-red-500/30 text-red-500"
                    )}
                  >
                    Prioridad {modulo.priority}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{modulo.notes}</p>
                <div className="flex items-center gap-2 text-sm text-primary">
                  <Lightbulb className="h-4 w-4" />
                  <span>{modulo.recommendation}</span>
                </div>
              </div>
              <Badge variant="secondary" className="bg-muted/30 text-muted-foreground">
                {modulo.status}
              </Badge>
            </div>
          </InteractiveCard>
        </motion.div>
      ))}
    </motion.div>

    <InteractiveCard delay={500}>
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-amber-500/10">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
        </div>
        <div>
          <h4 className="font-semibold mb-2">Antes de ampliar módulos</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-primary" />
              Cerrar completamente la fase actual con entregables documentados
            </li>
            <li className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-primary" />
              Exigir SOW (Statement of Work) cerrado con alcance, precio y plazos
            </li>
            <li className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-primary" />
              Negociar nueva bolsa de horas con control de cambios incluido
            </li>
            <li className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3 text-primary" />
              Revisar métricas de éxito de la fase anterior antes de comprometer
            </li>
          </ul>
        </div>
      </div>
    </InteractiveCard>
  </div>
);

const ConclusionSection = () => (
  <div className="max-w-4xl mx-auto">
    <SectionHeader 
      title="Conclusión Ejecutiva" 
      subtitle="Resumen y próximos pasos"
      badge="DECISIONES"
    />

    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      <InteractiveCard delay={0}>
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold mb-2">Estado actual</h3>
            <p className="text-muted-foreground text-sm">
              El proyecto ha consumido el <strong className="text-foreground">{consumptionPercentage}% del presupuesto</strong> con 
              la base técnica instalada. Los conectores están operativos y el sistema está en producción.
              Quedan <strong className="text-primary">80 horas ({formatCurrency(6400)})</strong> para cierre.
            </p>
          </div>
        </div>
      </InteractiveCard>

      <InteractiveCard delay={200}>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          Decisiones recomendadas
        </h3>
        <div className="space-y-3">
          {[
            "Establecer control estricto de cambios y reuniones",
            "Exigir documentación antes de cada entregable",
            "Priorizar formación usando crédito Fundae disponible",
            "Definir criterios claros de cierre del proyecto",
            "Preparar negociación de nueva bolsa con condiciones claras"
          ].map((decision, index) => (
            <motion.div
              key={decision}
              variants={fadeInUp}
              transition={{ delay: 0.3 + index * 0.1 }}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/20 transition-colors"
            >
              <ArrowRight className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-sm">{decision}</span>
            </motion.div>
          ))}
        </div>
      </InteractiveCard>

      <motion.div
        variants={fadeInUp}
        transition={{ delay: 0.6 }}
        className="relative overflow-hidden p-8 rounded-2xl text-center"
        style={{
          background: "linear-gradient(135deg, rgba(147, 214, 0, 0.08) 0%, rgba(147, 214, 0, 0.02) 50%, transparent 100%)"
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        <div className="relative z-10">
          <div className="inline-flex p-4 rounded-2xl bg-primary/10 mb-4">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-3">Próximo paso inmediato</h3>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Convocar reunión con Studio73 para establecer 
            <strong className="text-foreground"> entregables cerrados</strong>, 
            <strong className="text-foreground"> criterios de cierre</strong> y 
            <strong className="text-foreground"> condiciones para nueva bolsa de horas</strong>.
          </p>
        </div>
      </motion.div>
    </motion.div>
  </div>
);

// ===== MAIN COMPONENT =====

const AnalisisInterno = () => {
  const navigate = useNavigate();
  const { manager, isLoading, logout } = useManagerAuth();
  const [activeSection, setActiveSection] = useState("portada");

  const currentIndex = sections.findIndex(s => s.id === activeSection);
  const canGoNext = currentIndex < sections.length - 1;
  const canGoPrev = currentIndex > 0;

  const goNext = useCallback(() => {
    if (canGoNext) setActiveSection(sections[currentIndex + 1].id);
  }, [canGoNext, currentIndex]);

  const goPrev = useCallback(() => {
    if (canGoPrev) setActiveSection(sections[currentIndex - 1].id);
  }, [canGoPrev, currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  // Auth check
  useEffect(() => {
    if (!isLoading && (!manager || manager.role !== "admin")) {
      navigate("/analisis-interno/login");
    }
  }, [manager, isLoading, navigate]);

  if (isLoading) return <LoadingScreen />;
  if (!manager || manager.role !== "admin") return null;

  const renderSection = () => {
    switch (activeSection) {
      case "portada": return <PortadaSection />;
      case "resumen": return <ResumenSection />;
      case "desglose": return <DesgloseSection />;
      case "conectores": return <ConectoresSection />;
      case "fundae": return <FundaeSection />;
      case "consumo": return <ConsumoSection />;
      case "riesgos": return <RiesgosSection />;
      case "positivo": return <PositivoSection />;
      case "corregir": return <CorregirSection />;
      case "horas": return <HorasSection />;
      case "futuro": return <FuturoSection />;
      case "conclusion": return <ConclusionSection />;
      default: return <PortadaSection />;
    }
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Top Navigation Bar */}
        <header className="glass-header fixed top-0 left-0 right-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Left: Logo & Back */}
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Panel
                </Button>
                <div className="hidden md:flex items-center gap-2">
                  <LogoLink to="/analisis-interno" className="h-6 w-6" />
                  <span className="text-sm font-medium text-muted-foreground">Análisis Interno</span>
                </div>
              </div>

              {/* Center: Progress */}
              <div className="flex items-center gap-6">
                {/* Progress dots */}
                <div className="hidden md:flex items-center gap-1.5">
                  {sections.map((section, index) => (
                    <Tooltip key={section.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setActiveSection(section.id)}
                          className={cn(
                            "h-2 rounded-full transition-all duration-300",
                            index === currentIndex 
                              ? "w-6 bg-primary" 
                              : index < currentIndex 
                                ? "w-2 bg-primary/50" 
                                : "w-2 bg-muted-foreground/20 hover:bg-muted-foreground/40"
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{section.label}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>

                {/* Navigation buttons */}
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={goPrev} 
                    disabled={!canGoPrev}
                    className="h-8 w-8"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground min-w-[4rem] text-center font-medium">
                    {currentIndex + 1} / {sections.length}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={goNext} 
                    disabled={!canGoNext}
                    className="h-8 w-8"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Right: User & Actions */}
              <div className="flex items-center gap-3">
                <Badge 
                  variant="outline" 
                  className="hidden sm:flex bg-muted/20 text-muted-foreground border-border/30"
                >
                  <Shield className="h-3 w-3 mr-1" />
                  Interno
                </Badge>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">{manager?.name}</span>
                </div>
                <ThemeToggle />
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={async () => {
                    await logout();
                    navigate("/analisis-interno/login");
                  }}
                  className="text-muted-foreground hover:text-red-500"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="pt-24 pb-20 px-6 min-h-screen">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              {renderSection()}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Bottom Navigation Hint */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 text-xs text-muted-foreground/40">
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 rounded bg-muted/30 border border-border/20 font-mono">←</kbd>
            <span>Anterior</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 rounded bg-muted/30 border border-border/20 font-mono">→</kbd>
            <span>Siguiente</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default AnalisisInterno;
