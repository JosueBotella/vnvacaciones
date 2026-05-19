import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useManagerAuth } from "@/modules/auth/hooks/useManagerAuth";
import LoadingScreen from "@/components/LoadingScreen";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Maximize, Minimize, LogOut,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Target,
  BarChart3, PieChart as PieChartIcon, Package, Layers,
  ArrowUpRight, ArrowDownRight, Minus, Home, Zap, ArrowRight,
  CircleDot, Shield, Eye, Crosshair, FileSearch, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

// ── Spanish number formatting ──
function fmtNum(n: number): string {
  return n.toLocaleString("es-ES");
}
function fmtPct(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtDec(n: number, decimals = 1): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Colors ──
const VERDE = "hsl(84,100%,42%)";
const VERDE_GLOW = "hsl(84,80%,55%)";
const ROSE = "hsl(350,80%,60%)";
const ROSE_GLOW = "hsl(350,70%,70%)";
const AMBER = "hsl(38,92%,55%)";
const AMBER_GLOW = "hsl(38,80%,65%)";
const BLUE = "hsl(217,91%,65%)";
const BLUE_GLOW = "hsl(217,80%,75%)";
const PURPLE = "hsl(270,70%,65%)";
const PURPLE_GLOW = "hsl(270,60%,75%)";
const TEAL = "hsl(172,66%,50%)";
const SLATE = "hsl(215,20%,55%)";

type PieDatum = {
  name: string;
  value: number;
  count: number;
  color: string;
};

// ── Data ──
const consecuenciasData = [
  { name: "Incompleto/Faltas", value: 74.6, count: 6232, color: ROSE },
  { name: "Error Identidad", value: 17.5, count: 1460, color: AMBER },
  { name: "Duplicación", value: 3.5, count: 291, color: BLUE },
  { name: "Otros", value: 4.4, count: 368, color: SLATE },
];

const desgloseData = [
  { name: "No dev./No especif.", pct: 68.2, count: 4250, color: ROSE },
  { name: "Tour", pct: 26.7, count: 1666, color: AMBER },
  { name: "Francia", pct: 3.4, count: 209, color: BLUE },
  { name: "Reparto", pct: 0.9, count: 58, color: TEAL },
];

const tipoData = [
  { name: "Tipo H", value: 46.3, count: 3869, color: VERDE },
  { name: "Tipo V", value: 8.9, count: 743, color: BLUE },
  { name: "Tipo C", value: 37.3, count: 3112, color: AMBER },
  { name: "Tipo A", value: 6.0, count: 497, color: PURPLE },
];

const otrosErrores = [
  { name: "Error color", pct: 2.8, count: 230, icon: "🎨", color: PURPLE },
  { name: "Error medida", pct: 1.1, count: 91, icon: "📏", color: BLUE },
  { name: "Error packing", pct: 0.2, count: 17, icon: "📦", color: AMBER },
  { name: "No entregado", pct: 0.2, count: 17, icon: "🚫", color: ROSE },
];

// CORRECTED: 2025=30, 2026=31.2 (daily reclamaciones are INCREASING)
const dailyCompareReclam = [
  { label: "2025", value: 30, color: SLATE },
  { label: "2026", value: 31.2, color: ROSE },
];

const dailyCompareLoss = [
  { label: "2025", value: 803, color: SLATE },
  { label: "2026", value: 810, color: ROSE },
];

// ── Animated counter ──
function useAnimatedCounter(end: number, duration = 2000, active = true, decimals = 0) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) { setCount(0); return; }
    const startTime = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const raw = end * eased;
      setCount(decimals > 0 ? parseFloat(raw.toFixed(decimals)) : Math.round(raw));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [end, duration, active, decimals]);
  return count;
}

// ── Easing ──
const EASE = [0.22, 1, 0.36, 1] as const;

// ── Apple-style flat cards (no blur, no glow) ──
const CARD_STYLE = {
  background: 'hsl(var(--muted) / 0.5)',
  border: '1px solid hsl(var(--border) / 0.06)',
  boxShadow: '0 1px 3px hsl(var(--foreground) / 0.04)',
};

const ITEM_STYLE = {
  background: 'hsl(var(--muted) / 0.4)',
  border: 'none',
  boxShadow: 'none',
  transition: 'background 0.3s',
};

// ── Flat card ──
function GlassCard({ children, className = "", delay = 0, active = true }: {
  children: React.ReactNode; className?: string; delay?: number; active?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={active ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ delay, duration: 0.6, ease: EASE }}
      whileHover={{
        scale: 1.01,
        transition: { duration: 0.25, ease: "easeOut" },
      }}
      className={`relative rounded-3xl overflow-hidden cursor-default ${className}`}
      style={CARD_STYLE}
    >
      {children}
    </motion.div>
  );
}

// ── Slide wrapper ──
const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 100 : -100, opacity: 0, scale: 0.97, filter: "blur(4px)" }),
  center: { x: 0, opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: (dir: number) => ({ x: dir > 0 ? -100 : 100, opacity: 0, scale: 0.97, filter: "blur(4px)" }),
};

function SlideWrap({ children, direction, slideKey }: { children: React.ReactNode; direction: number; slideKey: number }) {
  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={slideKey}
        custom={direction}
        variants={slideVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.45, ease: EASE }}
        className="absolute inset-0 flex items-center justify-center p-6 md:p-10 lg:p-16 overflow-y-auto"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ── Stat card (Apple flat) ──
function StatCard({ label, value, prefix = "", suffix = "", active, color, delay = 0, decimals = 0, icon }: {
  label: string; value: number; prefix?: string; suffix?: string; active: boolean; color: string; delay?: number; decimals?: number; icon?: React.ReactNode;
}) {
  const count = useAnimatedCounter(value, 2000, active, decimals);
  const displayValue = decimals > 0 ? fmtDec(count, decimals) : fmtNum(count);
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={active ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ delay: delay * 0.12, duration: 0.6, ease: EASE }}
      whileHover={{
        scale: 1.03,
        transition: { duration: 0.25, ease: "easeOut" },
      }}
      className="relative rounded-3xl overflow-hidden p-8 md:p-10 text-center cursor-default"
      style={CARD_STYLE}
    >
      {icon && <div className="flex justify-center mb-4 opacity-40">{icon}</div>}
      <p className="text-xs uppercase tracking-[0.2em] font-medium mb-4" style={{ color: `${color}90` }}>{label}</p>
      <p className="text-4xl md:text-6xl font-bold tracking-tight tabular-nums" style={{ color }}>
        {prefix}{displayValue}{suffix}
      </p>
    </motion.div>
  );
}

// ── Trend badge ──
function TrendBadge({ value, inverted = false }: { value: number; inverted?: boolean }) {
  const isNeutral = Math.abs(value) < 0.5;
  const goesUp = value > 0;
  // inverted: up is bad (red), down is good (green) — e.g. losses increasing
  const isGood = inverted ? !goesUp : goesUp;
  const Icon = isNeutral ? Minus : goesUp ? ArrowUpRight : ArrowDownRight;
  const bgColor = isNeutral ? "hsl(var(--muted))" : isGood ? "hsla(145,60%,45%,0.12)" : "hsla(350,80%,55%,0.12)";
  const textColor = isNeutral ? "hsl(var(--muted-foreground))" : isGood ? "hsl(145,60%,50%)" : "hsl(350,80%,60%)";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-sm"
      style={{ background: bgColor, color: textColor }}
    >
      <Icon className="h-3.5 w-3.5" />{fmtDec(Math.abs(value))}%
    </span>
  );
}

// ── Legend item (Apple flat) ──
function LegendItem({ color, name, count, pct, delay = 0, active = true }: {
  color: string; name: string; count: number; pct: number; delay?: number; active?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={active ? { opacity: 1, x: 0 } : {}}
      transition={{ delay, duration: 0.45, ease: EASE }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className="group flex items-center gap-4 p-5 rounded-2xl cursor-default"
      style={ITEM_STYLE}
    >
      <div
        className="w-3.5 h-3.5 rounded-full shrink-0 transition-transform duration-300 group-hover:scale-125"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">{fmtNum(count)} casos</p>
      </div>
      <span className="text-2xl font-black tabular-nums" style={{ color }}>{fmtPct(pct)}%</span>
    </motion.div>
  );
}

// ── Custom Pie Tooltip ──
function PieTooltipContent({ active: tooltipActive, payload }: any) {
  if (!tooltipActive || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="backdrop-blur-2xl rounded-2xl px-4 py-3 text-sm" style={{
      background: 'hsl(var(--card) / 0.85)',
      border: '1px solid hsl(var(--border) / 0.15)',
      boxShadow: '0 8px 24px hsl(var(--foreground) / 0.1)',
    }}>
      <p className="font-bold text-foreground">{d.name}</p>
      <p className="text-muted-foreground">{fmtPct(d.value)}% · {fmtNum(d.payload.count)} casos</p>
    </div>
  );
}

function PieVisualCard({
  data,
  active,
  delay = 0.15,
  donut = false,
  centerValue,
  centerLabel,
}: {
  data: PieDatum[];
  active: boolean;
  delay?: number;
  donut?: boolean;
  centerValue?: number;
  centerLabel?: string;
}) {
  return (
    <GlassCard className="p-6 min-h-[340px] flex items-center justify-center" delay={delay} active={active}>
      <div className="relative flex h-[320px] w-[320px] items-center justify-center">
        <PieChart width={320} height={320}>
          <Pie
            data={data}
            cx={160}
            cy={160}
            innerRadius={donut ? 84 : 0}
            outerRadius={120}
            dataKey="value"
            paddingAngle={donut ? 4 : 2}
            stroke="hsl(var(--background))"
            strokeWidth={2}
            isAnimationActive={active}
            animationBegin={250}
            animationDuration={900}
          >
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip content={<PieTooltipContent />} />
        </PieChart>

        {donut && centerValue !== undefined ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground/45">{centerLabel}</span>
            <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">{fmtNum(centerValue)}</span>
            <span className="text-xs text-muted-foreground/45">casos</span>
          </div>
        ) : null}
      </div>
    </GlassCard>
  );
}

// ═══════════════════════════════════════
//  SLIDES
// ═══════════════════════════════════════

function Slide0({ active }: { active: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center text-center max-w-3xl mx-auto">
      <motion.div
        className="relative mb-12"
        initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
        animate={active ? { opacity: 1, scale: 1, rotate: 0 } : {}}
        transition={{ duration: 0.8, ease: EASE }}
      >
        <div className="absolute inset-0 -m-4 rounded-full blur-2xl animate-pulse" style={{ background: `${VERDE}15` }} />
        <img src="/images/verdnatura-logo-green.png" alt="Verdnatura" className="h-16 md:h-24 dark:hidden mx-auto relative z-10" />
        <img src="/images/verdnatura-logo-white.png" alt="Verdnatura" className="h-16 md:h-24 hidden dark:block mx-auto relative z-10" />
      </motion.div>

      <motion.h1
        className="text-4xl md:text-6xl lg:text-7xl font-black text-foreground tracking-tight leading-[0.95]"
        initial={{ opacity: 0, y: 40 }}
        animate={active ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.15, duration: 0.7, ease: EASE }}
      >
        Análisis de
        <br />
        <span className="relative inline-block">
          <span style={{ color: VERDE }}>Reclamaciones</span>
          <motion.div
            className="absolute -bottom-2 left-0 h-1 rounded-full"
            style={{ background: `linear-gradient(90deg, ${VERDE}, ${VERDE_GLOW})` }}
            initial={{ width: 0 }}
            animate={active ? { width: "100%" } : { width: 0 }}
            transition={{ delay: 0.6, duration: 0.8, ease: EASE }}
          />
        </span>
      </motion.h1>

      <motion.p
        className="text-lg md:text-xl text-muted-foreground/70 font-light mt-6"
        initial={{ opacity: 0 }}
        animate={active ? { opacity: 1 } : {}}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        Departamento Revisado
      </motion.p>

      <motion.div
        className="mt-8 flex items-center gap-3"
        initial={{ opacity: 0 }}
        animate={active ? { opacity: 1 } : {}}
        transition={{ delay: 0.6 }}
      >
        <span className="px-3 py-1 rounded-full text-[11px] font-medium uppercase tracking-widest backdrop-blur-sm" style={{ background: 'hsl(var(--muted) / 0.5)', color: 'hsl(var(--muted-foreground))' }}>
          Marzo 2026
        </span>
        <span className="px-3 py-1 rounded-full text-[11px] font-medium uppercase tracking-widest backdrop-blur-sm" style={{ background: `${VERDE}15`, color: VERDE }}>
          Informe 2025–2026
        </span>
      </motion.div>

      <motion.div
        className="mt-16 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }}
        animate={active ? { opacity: 0.4 } : {}}
        transition={{ delay: 1.2 }}
      >
        <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50">Desliza o pulsa →</span>
        <motion.div animate={{ x: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
          <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
        </motion.div>
      </motion.div>
    </div>
  );
}

function Slide1({ active }: { active: boolean }) {
  const items = [
    { icon: <BarChart3 className="h-5 w-5" />, text: "Cifras clave del período", num: "01", color: VERDE },
    { icon: <TrendingUp className="h-5 w-5" />, text: "Comparativa diaria 2025 vs 2026", num: "02", color: BLUE },
    { icon: <PieChartIcon className="h-5 w-5" />, text: "Análisis de consecuencias", num: "03", color: ROSE },
    { icon: <Package className="h-5 w-5" />, text: "Distribución por tipo de producto", num: "04", color: AMBER },
    { icon: <AlertTriangle className="h-5 w-5" />, text: "Otros errores detectados", num: "05", color: PURPLE },
    { icon: <Users className="h-5 w-5" />, text: "Errores sacadores — último mes", num: "06", color: TEAL },
    { icon: <Target className="h-5 w-5" />, text: "Hallazgos y recomendaciones", num: "07", color: VERDE },
  ];
  return (
    <div className="max-w-2xl w-full mx-auto">
      <motion.p className="text-xs uppercase tracking-[0.25em] font-medium mb-3" style={{ color: `${VERDE}90` }}
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}}>
        Contenido
      </motion.p>
      <motion.h2 className="text-4xl md:text-6xl font-black text-foreground tracking-tight mb-10"
        initial={{ opacity: 0, y: 24 }} animate={active ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }}>
        Agenda
      </motion.h2>
      <div className="space-y-2.5">
        {items.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -30 }}
            animate={active ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.12 + i * 0.07, duration: 0.45, ease: EASE }}
            whileHover={{ scale: 1.02, x: 4, transition: { duration: 0.2 } }}
            className="group flex items-center gap-4 p-5 rounded-2xl cursor-pointer"
            style={ITEM_STYLE}
          >
            <span className="text-[10px] font-mono tabular-nums w-5" style={{ color: `${item.color}70` }}>{item.num}</span>
            <div
              className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0 transition-all duration-300 group-hover:scale-110"
              style={{ background: `${item.color}15`, color: item.color }}
            >
              {item.icon}
            </div>
            <span className="text-base font-semibold text-foreground/90 tracking-tight">{item.text}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground/20 ml-auto group-hover:text-muted-foreground/60 transition-all duration-300 group-hover:translate-x-1" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Slide2({ active }: { active: boolean }) {
  // Projection: 60,621€ in 90 days (Q1) → 674€/day → 674 * 268 = 180,632€ projected
  return (
    <div className="max-w-3xl w-full mx-auto">
      <motion.p className="text-xs uppercase tracking-[0.25em] font-medium mb-3" style={{ color: `${BLUE}90` }}
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}}>
        Primer trimestre
      </motion.p>
      <motion.h2 className="text-4xl md:text-6xl font-black text-foreground tracking-tight mb-2"
        initial={{ opacity: 0, y: 24 }} animate={active ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }}>
        2026 — 90 días
      </motion.h2>
      <motion.p className="text-muted-foreground/60 mb-8 font-light"
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}} transition={{ delay: 0.1 }}>
        Datos acumulados enero – marzo
      </motion.p>
      <div className="grid grid-cols-2 gap-4 md:gap-5">
        <StatCard label="Reclamaciones" value={2251} active={active} color="hsl(var(--foreground))" delay={1} icon={<Eye className="h-4 w-4" />} />
        <StatCard label="Pérdidas" value={60621} suffix="€" active={active} color={ROSE} delay={2} icon={<TrendingDown className="h-4 w-4" />} />
        <StatCard label="€ / Reclamación" value={26.93} active={active} color={AMBER} delay={3} decimals={2} suffix="€" icon={<CircleDot className="h-4 w-4" />} />
        <StatCard label="Recl. / día" value={25.0} active={active} color={ROSE} delay={4} decimals={1} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      {/* Projection alert */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={active ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="mt-6 flex items-start gap-3 p-4 rounded-2xl"
        style={{ background: `${ROSE}08`, border: `1px solid ${ROSE}18` }}
      >
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: ROSE }} />
        <div>
          <p className="text-xs font-semibold" style={{ color: ROSE }}>
            Proyección anual: ~{fmtNum(180632)}€
          </p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            A {fmtNum(674)}€/día, superaríamos los {fmtNum(215288)}€ de 2025. Solo llevamos 3 meses y ya acumulamos {fmtNum(60621)}€ en pérdidas.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function Slide3({ active }: { active: boolean }) {
  return (
    <div className="max-w-3xl w-full mx-auto">
      <motion.p className="text-xs uppercase tracking-[0.25em] font-medium mb-3" style={{ color: `${AMBER}90` }}
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}}>
        268 días laborables
      </motion.p>
      <motion.h2 className="text-4xl md:text-6xl font-black text-foreground tracking-tight mb-2"
        initial={{ opacity: 0, y: 24 }} animate={active ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }}>
        2025 — Año completo
      </motion.h2>
      <motion.p className="text-muted-foreground/60 mb-10 font-light"
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}} transition={{ delay: 0.1 }}>
        Referencia anual completa
      </motion.p>
      <div className="grid grid-cols-2 gap-4 md:gap-5">
        <StatCard label="Reclamaciones" value={8351} active={active} color="hsl(var(--foreground))" delay={1} icon={<Eye className="h-4 w-4" />} />
        <StatCard label="Pérdidas" value={215288} suffix="€" active={active} color={ROSE} delay={2} icon={<TrendingDown className="h-4 w-4" />} />
        <StatCard label="€ / Reclamación" value={25.78} active={active} color={AMBER} delay={3} decimals={2} suffix="€" icon={<CircleDot className="h-4 w-4" />} />
        <StatCard label="Recl. / día" value={30} active={active} color={SLATE} delay={4} decimals={0} icon={<BarChart3 className="h-4 w-4" />} />
      </div>
    </div>
  );
}

function Slide4({ active }: { active: boolean }) {
  return (
    <div className="max-w-3xl w-full mx-auto">
      <motion.p className="text-xs uppercase tracking-[0.25em] font-medium mb-3" style={{ color: `${ROSE}90` }}
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}}>Comparativa</motion.p>
      <motion.h2 className="text-4xl md:text-6xl font-black text-foreground tracking-tight mb-2"
        initial={{ opacity: 0, y: 24 }} animate={active ? { opacity: 1, y: 0 } : {}}>
        Reclamaciones / Día
      </motion.h2>
      <motion.div className="flex items-center gap-3 mb-8"
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}} transition={{ delay: 0.1 }}>
        <span className="text-muted-foreground/50 font-light text-sm">Variación interanual</span>
        <TrendBadge value={4.0} inverted />
      </motion.div>
      <GlassCard className="p-5 md:p-8" delay={0.2} active={active}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dailyCompareReclam} barSize={56}>
            <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" strokeOpacity={0.15} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 13, fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 40]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, opacity: 0.5 }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v: number) => [fmtDec(v), "Reclamaciones/día"]}
              contentStyle={{ background: 'hsl(var(--card))', color: 'hsl(var(--card-foreground))', border: '1px solid hsl(var(--border) / 0.2)', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
              labelStyle={{ color: 'hsl(var(--card-foreground))', fontWeight: 600 }}
              itemStyle={{ color: 'hsl(var(--muted-foreground))' }}
              cursor={{ fill: 'hsl(var(--muted) / 0.2)', radius: 8 }}
            />
            <Bar dataKey="value" radius={[14, 14, 6, 6]}>
              {dailyCompareReclam.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </GlassCard>
      <motion.div className="flex justify-center gap-16 mt-8"
        initial={{ opacity: 0, y: 10 }} animate={active ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.5 }}>
        <div className="text-center">
          <p className="text-3xl font-bold text-muted-foreground/50 tabular-nums">30,0</p>
          <p className="text-[11px] text-muted-foreground/35 mt-1 uppercase tracking-[0.2em] font-medium">2025</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums" style={{ color: ROSE }}>31,2</p>
          <p className="text-[11px] text-muted-foreground/35 mt-1 uppercase tracking-[0.2em] font-medium">2026</p>
        </div>
      </motion.div>
      <motion.p
        className="text-center text-xs text-muted-foreground/40 mt-4"
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}} transition={{ delay: 0.7 }}>
        Las reclamaciones diarias aumentan un 4% respecto a 2025
      </motion.p>
    </div>
  );
}

function Slide5({ active }: { active: boolean }) {
  return (
    <div className="max-w-3xl w-full mx-auto">
      <motion.p className="text-xs uppercase tracking-[0.25em] font-medium mb-3" style={{ color: `${ROSE}90` }}
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}}>Comparativa</motion.p>
      <motion.h2 className="text-4xl md:text-6xl font-black text-foreground tracking-tight mb-2"
        initial={{ opacity: 0, y: 24 }} animate={active ? { opacity: 1, y: 0 } : {}}>
        Pérdidas / Día
      </motion.h2>
      <motion.div className="flex items-center gap-3 mb-8"
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}} transition={{ delay: 0.1 }}>
        <span className="text-muted-foreground/50 font-light text-sm">Variación interanual</span>
        <TrendBadge value={0.9} inverted />
      </motion.div>
      <GlassCard className="p-5 md:p-8" delay={0.2} active={active}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dailyCompareLoss} barSize={56}>
            <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" strokeOpacity={0.15} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 13, fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 1000]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, opacity: 0.5 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}€`} />
            <Tooltip
              formatter={(v: number) => [`${fmtNum(v)}€`, "Pérdidas/día"]}
              contentStyle={{ background: 'hsl(var(--card))', color: 'hsl(var(--card-foreground))', border: '1px solid hsl(var(--border) / 0.2)', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
              labelStyle={{ color: 'hsl(var(--card-foreground))', fontWeight: 600 }}
              itemStyle={{ color: 'hsl(var(--muted-foreground))' }}
              cursor={{ fill: 'hsl(var(--muted) / 0.2)', radius: 8 }}
            />
            <Bar dataKey="value" radius={[14, 14, 6, 6]}>
              {dailyCompareLoss.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </GlassCard>
      <motion.div className="flex justify-center gap-16 mt-8"
        initial={{ opacity: 0, y: 10 }} animate={active ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.5 }}>
        <div className="text-center">
          <p className="text-3xl font-bold text-muted-foreground/50 tabular-nums">803€</p>
          <p className="text-[11px] text-muted-foreground/35 mt-1 uppercase tracking-[0.2em] font-medium">2025</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums" style={{ color: ROSE }}>810€</p>
          <p className="text-[11px] text-muted-foreground/35 mt-1 uppercase tracking-[0.2em] font-medium">2026</p>
        </div>
      </motion.div>
      <motion.p
        className="text-center text-xs text-muted-foreground/40 mt-4"
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}} transition={{ delay: 0.7 }}>
        Proyección anual al ritmo actual: ~{fmtNum(217080)}€ (supera los {fmtNum(215288)}€ de 2025)
      </motion.p>
    </div>
  );
}

function Slide6({ active }: { active: boolean }) {
  return (
    <div className="max-w-4xl w-full mx-auto">
      <motion.p className="text-xs uppercase tracking-[0.25em] font-medium mb-3" style={{ color: `${ROSE}90` }}
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}}>Consecuencias</motion.p>
      <motion.h2 className="text-4xl md:text-6xl font-black text-foreground tracking-tight mb-10"
        initial={{ opacity: 0, y: 24 }} animate={active ? { opacity: 1, y: 0 } : {}}>
        Principales Consecuencias
      </motion.h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <PieVisualCard
          data={consecuenciasData}
          active={active}
          delay={0.15}
          donut
          centerValue={8351}
          centerLabel="Total"
        />
        <div className="space-y-3">
          {consecuenciasData.map((item, i) => (
            <LegendItem key={item.name} color={item.color} name={item.name} count={item.count} pct={item.value} delay={0.3 + i * 0.08} active={active} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Slide7({ active }: { active: boolean }) {
  return (
    <div className="max-w-3xl w-full mx-auto">
      <motion.p className="text-xs uppercase tracking-[0.25em] font-medium mb-3" style={{ color: `${ROSE}90` }}
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}}>Desglose</motion.p>
      <motion.h2 className="text-4xl md:text-6xl font-black text-foreground tracking-tight mb-2"
        initial={{ opacity: 0, y: 24 }} animate={active ? { opacity: 1, y: 0 } : {}}>
        Incompleto / Faltas
      </motion.h2>
      <motion.p className="text-muted-foreground/60 mb-10 font-light"
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}} transition={{ delay: 0.1 }}>
        74,6% del total — {fmtNum(6232)} casos
      </motion.p>
      <div className="space-y-3.5">
        {desgloseData.map((item, i) => (
          <motion.div
            key={item.name}
            initial={{ opacity: 0, x: -30 }}
            animate={active ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.45, ease: EASE }}
            whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
            className="group rounded-2xl p-6 cursor-default"
            style={ITEM_STYLE}
          >
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm font-bold text-foreground/90">{item.name}</span>
              </div>
              <span className="text-sm font-black tabular-nums" style={{ color: item.color }}>
                {fmtPct(item.pct)}%
                <span className="text-muted-foreground/40 font-normal text-xs ml-1.5">({fmtNum(item.count)})</span>
              </span>
            </div>
            <div className="w-full rounded-full h-3 overflow-hidden" style={{ background: 'hsl(var(--muted) / 0.25)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: item.color }}
                initial={{ width: 0 }}
                animate={active ? { width: `${item.pct}%` } : { width: 0 }}
                transition={{ delay: 0.4 + i * 0.1, duration: 1, ease: EASE }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Slide8({ active }: { active: boolean }) {
  return (
    <div className="max-w-4xl w-full mx-auto">
      <motion.p className="text-xs uppercase tracking-[0.25em] font-medium mb-3" style={{ color: `${VERDE}90` }}
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}}>Productos · 2025</motion.p>
      <motion.h2 className="text-4xl md:text-6xl font-black text-foreground tracking-tight mb-10"
        initial={{ opacity: 0, y: 24 }} animate={active ? { opacity: 1, y: 0 } : {}}>
        Distribución por Tipo
      </motion.h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <PieVisualCard
          data={tipoData}
          active={active}
          delay={0.15}
        />
        <div className="space-y-3">
          {tipoData.map((item, i) => (
            <LegendItem
              key={item.name}
              color={item.color}
              name={item.name}
              count={item.count}
              pct={item.value}
              delay={0.3 + i * 0.08}
              active={active}
            />
          ))}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={active ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.7, duration: 0.45 }}
            className="flex items-center gap-3 p-4 rounded-2xl"
            style={{ background: `${AMBER}08`, border: `1px solid ${AMBER}15` }}
          >
            <Zap className="h-4 w-4 shrink-0" style={{ color: AMBER }} />
            <p className="text-xs font-semibold" style={{ color: AMBER }}>
              Tipo H + C concentran el 83,6% de todos los casos
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function Slide9({ active }: { active: boolean }) {
  return (
    <div className="max-w-3xl w-full mx-auto">
      <motion.p className="text-xs uppercase tracking-[0.25em] font-medium mb-3" style={{ color: `${PURPLE}90` }}
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}}>Detalle</motion.p>
      <motion.h2 className="text-4xl md:text-6xl font-black text-foreground tracking-tight mb-2"
        initial={{ opacity: 0, y: 24 }} animate={active ? { opacity: 1, y: 0 } : {}}>
        Otros Errores
      </motion.h2>
      <motion.p className="text-muted-foreground/60 mb-10 font-light"
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}} transition={{ delay: 0.1 }}>
        Representan el 4,3% del total de reclamaciones
      </motion.p>
      <div className="grid grid-cols-2 gap-4">
        {otrosErrores.map((err, i) => (
          <GlassCard key={err.name} className="p-6 md:p-8 text-center" delay={0.15 + i * 0.08} active={active}>
            <span className="text-4xl md:text-5xl mb-4 block drop-shadow-lg">{err.icon}</span>
            <p className="text-sm font-bold text-foreground/90 mb-1">{err.name}</p>
            <p className="text-3xl font-black tabular-nums" style={{ color: err.color }}>{fmtPct(err.pct)}%</p>
            <p className="text-xs text-muted-foreground/50 mt-1">{fmtNum(err.count)} casos</p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

// ── Errores Sacadores data ──
const erroresSacadoresData = [
  { name: "Nivel Incorrecto", count: 2250, pct: 39.6, color: ROSE },
  { name: "Cantidad incorrecta", count: 1985, pct: 34.9, color: AMBER },
  { name: "Se ha saltado la línea", count: 713, pct: 12.6, color: BLUE },
  { name: "Producto equivocado", count: 408, pct: 7.18, color: PURPLE },
  { name: "Desordenado", count: 181, pct: 3.19, color: TEAL },
  { name: "Maltratado", count: 81, pct: 1.43, color: SLATE },
  { name: "Mal etiquetado", count: 48, pct: 0.84, color: VERDE },
];

const erroresSacadoresPie = erroresSacadoresData.map(d => ({
  name: d.name,
  value: d.pct,
  count: d.count,
  color: d.color,
}));

function SlideSacadores({ active }: { active: boolean }) {
  return (
    <div className="max-w-5xl w-full mx-auto">
      <motion.p className="text-xs uppercase tracking-[0.25em] font-medium mb-2" style={{ color: `${TEAL}90` }}
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}}>Último mes</motion.p>
      <motion.h2 className="text-3xl md:text-5xl font-black text-foreground tracking-tight mb-1"
        initial={{ opacity: 0, y: 24 }} animate={active ? { opacity: 1, y: 0 } : {}}>
        Errores Sacadores
      </motion.h2>
      <motion.p className="text-muted-foreground/60 mb-5 text-sm font-light"
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}} transition={{ delay: 0.1 }}>
        {fmtNum(5681)} errores registrados en el último mes
      </motion.p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Left: Bar chart + insight banner */}
        <div className="space-y-3">
          <GlassCard className="p-4" delay={0.1} active={active}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={erroresSacadoresData}
                layout="vertical"
                margin={{ left: 10, right: 30, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.1)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active: ta, payload }) => {
                    if (!ta || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="backdrop-blur-2xl rounded-2xl px-4 py-3 text-sm" style={{
                        background: 'hsl(var(--card) / 0.85)',
                        border: '1px solid hsl(var(--border) / 0.15)',
                        boxShadow: '0 8px 24px hsl(var(--foreground) / 0.1)',
                      }}>
                        <p className="font-bold text-foreground">{d.name}</p>
                        <p className="text-muted-foreground">{fmtNum(d.count)} errores · {fmtPct(d.pct)}%</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} isAnimationActive={active} animationDuration={900}>
                  {erroresSacadoresData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={active ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.7, duration: 0.45 }}
            className="flex items-center gap-3 p-3 rounded-2xl"
            style={{ background: `${ROSE}08`, border: `1px solid ${ROSE}15` }}
          >
            <Zap className="h-4 w-4 shrink-0" style={{ color: ROSE }} />
            <p className="text-xs font-semibold" style={{ color: ROSE }}>
              Nivel Incorrecto + Cantidad incorrecta = 74,5% de todos los errores
            </p>
          </motion.div>
        </div>

        {/* Right: Donut + all categories list */}
        <div className="space-y-3">
          <GlassCard className="p-3 flex items-center justify-center" delay={0.2} active={active}>
            <div className="relative flex h-[160px] w-[160px] items-center justify-center">
              <PieChart width={160} height={160}>
                <Pie
                  data={erroresSacadoresPie}
                  cx={80}
                  cy={80}
                  innerRadius={44}
                  outerRadius={68}
                  dataKey="value"
                  paddingAngle={3}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  isAnimationActive={active}
                  animationBegin={300}
                  animationDuration={900}
                >
                  {erroresSacadoresPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip content={<PieTooltipContent />} />
              </PieChart>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[8px] uppercase tracking-[0.2em] text-muted-foreground/45">Total</span>
                <span className="text-xl font-bold tracking-tight tabular-nums text-foreground">{fmtNum(5681)}</span>
              </div>
            </div>
          </GlassCard>

          {/* All categories compact */}
          {erroresSacadoresData.map((item, i) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, x: 24 }}
              animate={active ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.3 + i * 0.06, duration: 0.4, ease: EASE }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={ITEM_STYLE}
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <p className="text-xs font-medium text-foreground flex-1 min-w-0 truncate">{item.name}</p>
              <span className="text-xs text-muted-foreground tabular-nums">{fmtNum(item.count)}</span>
              <span className="text-sm font-black tabular-nums" style={{ color: item.color }}>{fmtPct(item.pct)}%</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Slide 10: Hallazgos (4 items)
function Slide10({ active }: { active: boolean }) {
  const findings = [
    { icon: <AlertTriangle className="h-4 w-4" />, text: "Volumen alto: 8.351 reclamaciones en 2025, 2.251 en Q1 2026", iconColor: AMBER, borderColor: AMBER },
    { icon: <TrendingUp className="h-4 w-4" />, text: "Reclamaciones diarias suben un 4% (30,0 → 31,2) — tendencia negativa", iconColor: ROSE, borderColor: ROSE },
    { icon: <Target className="h-4 w-4" />, text: "3 de cada 4 errores son Incompleto/Faltas — principal área de mejora", iconColor: ROSE, borderColor: ROSE },
    { icon: <Layers className="h-4 w-4" />, text: "Tipo H y C concentran el 83,6% de los casos", iconColor: BLUE, borderColor: BLUE },
  ];
  return (
    <div className="max-w-2xl w-full mx-auto">
      <motion.p className="text-xs uppercase tracking-[0.25em] font-medium mb-3" style={{ color: `${TEAL}90` }}
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}}>Conclusiones · 1/2</motion.p>
      <motion.h2 className="text-4xl md:text-6xl font-black text-foreground tracking-tight mb-10"
        initial={{ opacity: 0, y: 24 }} animate={active ? { opacity: 1, y: 0 } : {}}>
        Hallazgos
      </motion.h2>
      <div className="space-y-3">
        {findings.map((pt, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -20 }}
            animate={active ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.1 + i * 0.08, duration: 0.4, ease: EASE }}
            whileHover={{ scale: 1.02, x: 4, transition: { duration: 0.2 } }}
            className="group flex items-center gap-4 p-6 rounded-2xl cursor-default"
            style={{
              ...ITEM_STYLE,
              borderLeft: `3px solid ${pt.borderColor}50`,
            }}
          >
            <div className="shrink-0 p-2.5 rounded-xl" style={{ background: `${pt.iconColor}12`, color: pt.iconColor }}>
              {pt.icon}
            </div>
            <p className="text-base text-foreground/80 leading-relaxed">{pt.text}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// Slide 11: Recomendaciones (4 items)
function Slide11({ active }: { active: boolean }) {
  const recommendations = [
    { icon: <TrendingDown className="h-4 w-4" />, text: "Pérdida diaria sube: 803€ → 810€ (+0,9%). Proyección anual: ~217.080€, superando 2025", iconColor: ROSE, borderColor: ROSE },
    { icon: <Shield className="h-4 w-4" />, text: "Priorizar reducción de Incompleto/Faltas = mayor impacto en pérdidas", iconColor: VERDE, borderColor: VERDE },
    { icon: <Crosshair className="h-4 w-4" />, text: "Enfocar controles en Tipo H (46,3%) y C (37,3%)", iconColor: BLUE, borderColor: BLUE },
    { icon: <FileSearch className="h-4 w-4" />, text: "Revisar proceso No dev./No especif. (68,2% de faltas)", iconColor: AMBER, borderColor: AMBER },
  ];
  return (
    <div className="max-w-2xl w-full mx-auto">
      <motion.p className="text-xs uppercase tracking-[0.25em] font-medium mb-3" style={{ color: `${VERDE}90` }}
        initial={{ opacity: 0 }} animate={active ? { opacity: 1 } : {}}>Conclusiones · 2/2</motion.p>
      <motion.h2 className="text-4xl md:text-6xl font-black text-foreground tracking-tight mb-10"
        initial={{ opacity: 0, y: 24 }} animate={active ? { opacity: 1, y: 0 } : {}}>
        Recomendaciones
      </motion.h2>
      <div className="space-y-3">
        {recommendations.map((pt, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -20 }}
            animate={active ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.1 + i * 0.08, duration: 0.4, ease: EASE }}
            whileHover={{ scale: 1.02, x: 4, transition: { duration: 0.2 } }}
            className="group flex items-center gap-4 p-6 rounded-2xl cursor-default"
            style={{
              ...ITEM_STYLE,
              borderLeft: `3px solid ${pt.borderColor}50`,
            }}
          >
            <div className="shrink-0 p-2.5 rounded-xl" style={{ background: `${pt.iconColor}12`, color: pt.iconColor }}>
              {pt.icon}
            </div>
            <p className="text-base text-foreground/80 leading-relaxed">{pt.text}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// Slide 12: ¿Preguntas?
function Slide12({ active, onRestart }: { active: boolean; onRestart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto">
      <motion.div
        className="relative mb-12"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={active ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.7, ease: EASE }}
      >
        <div className="absolute inset-0 -m-6 rounded-full blur-3xl animate-pulse" style={{ background: `${VERDE}12` }} />
        <img src="/images/verdnatura-logo-green.png" alt="Verdnatura" className="h-16 md:h-24 dark:hidden mx-auto relative z-10" />
        <img src="/images/verdnatura-logo-white.png" alt="Verdnatura" className="h-16 md:h-24 hidden dark:block mx-auto relative z-10" />
      </motion.div>
      <motion.h2
        className="text-4xl md:text-6xl font-black text-foreground tracking-tight mb-3"
        initial={{ opacity: 0, y: 24 }}
        animate={active ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.2 }}
      >
        ¿Preguntas?
      </motion.h2>
      <motion.p
        className="text-sm text-muted-foreground/40 font-light tracking-wide"
        initial={{ opacity: 0 }}
        animate={active ? { opacity: 1 } : {}}
        transition={{ delay: 0.35 }}
      >
        Análisis Reclamaciones · Marzo 2026
      </motion.p>
      <motion.div
        className="mt-12"
        initial={{ opacity: 0, y: 10 }}
        animate={active ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.5 }}
      >
        <Button
          onClick={onRestart}
          className="rounded-2xl gap-2.5 px-8 h-12 text-sm font-semibold backdrop-blur-xl transition-all duration-300 hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${VERDE}, ${VERDE_GLOW})`,
            color: 'hsl(var(--background))',
            boxShadow: `0 8px 24px ${VERDE}30`,
          }}
        >
          <Home className="h-4 w-4" /> Volver al inicio
        </Button>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════

const TOTAL_SLIDES = 14;

export default function AnalisisReclamaciones() {
  const navigate = useNavigate();
  const { manager, isLoading: authLoading } = useManagerAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);

  useEffect(() => {
    if (!authLoading) {
      if (!manager || manager.role !== "admin") {
        navigate("/admin/analisis-reclamaciones/login", { replace: true });
        return;
      }
      setIsLoading(false);
    }
  }, [manager, authLoading, navigate]);

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= TOTAL_SLIDES) return;
    setDirection(idx > currentSlide ? 1 : -1);
    setCurrentSlide(idx);
  }, [currentSlide]);

  const next = useCallback(() => goTo(currentSlide + 1), [currentSlide, goTo]);
  const prev = useCallback(() => goTo(currentSlide - 1), [currentSlide, goTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      if (e.key === "Escape" && isFullscreen) toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, isFullscreen]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? next() : prev(); }
  };

  if (isLoading || authLoading) return <LoadingScreen />;

  const slides = [
    <Slide0 active={currentSlide === 0} />,
    <Slide1 active={currentSlide === 1} />,
    <Slide2 active={currentSlide === 2} />,
    <Slide3 active={currentSlide === 3} />,
    <Slide4 active={currentSlide === 4} />,
    <Slide5 active={currentSlide === 5} />,
    <Slide6 active={currentSlide === 6} />,
    <Slide7 active={currentSlide === 7} />,
    <Slide8 active={currentSlide === 8} />,
    <Slide9 active={currentSlide === 9} />,
    <SlideSacadores active={currentSlide === 10} />,
    <Slide10 active={currentSlide === 11} />,
    <Slide11 active={currentSlide === 12} />,
    <Slide12 active={currentSlide === 13} onRestart={() => goTo(0)} />,
  ];

  const slideColors = [VERDE, VERDE, BLUE, AMBER, ROSE, ROSE, ROSE, ROSE, VERDE, PURPLE, TEAL, TEAL, VERDE, VERDE];
  const currentGlow = slideColors[currentSlide] || VERDE;

  return (
    <div
      ref={containerRef}
      className="h-screen bg-background flex flex-col select-none overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Subtle noise texture only — no glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundSize: '128px' }} />
      </div>

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-5 py-3 shrink-0"
        style={{
          background: 'hsl(var(--background) / 0.9)',
          borderBottom: '1px solid hsl(var(--border) / 0.15)',
        }}>
        <div className="flex items-center gap-3">
          <img src="/images/verdnatura-logo-green.png" alt="VN" className="h-5 dark:hidden" />
          <img src="/images/verdnatura-logo-white.png" alt="VN" className="h-5 hidden dark:block" />
          <div className="hidden sm:block w-px h-4 bg-border/40 ml-1" />
          <span className="text-xs font-medium text-muted-foreground/80 hidden sm:inline tracking-wider uppercase">Análisis Reclamaciones</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground/60 font-mono tabular-nums mr-3">
            {String(currentSlide + 1).padStart(2, '0')}<span className="text-muted-foreground/20"> / </span>{TOTAL_SLIDES}
          </span>
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="h-8 w-8 rounded-xl text-muted-foreground/40 hover:text-foreground hover:bg-card/50">
            {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="h-8 w-8 rounded-xl text-muted-foreground/40 hover:text-foreground hover:bg-card/50">
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Green separator line + Progress bar */}
      <div className="relative z-20 h-[3px] shrink-0" style={{ background: 'hsl(var(--border) / 0.08)' }}>
        <motion.div
          className="h-full rounded-r-full"
          style={{ background: `linear-gradient(90deg, ${VERDE}80, ${VERDE})` }}
          animate={{ width: `${((currentSlide + 1) / TOTAL_SLIDES) * 100}%` }}
          transition={{ duration: 0.5, ease: EASE }}
        />
      </div>

      {/* Slide area */}
      <div className="flex-1 relative overflow-hidden z-10">
        <SlideWrap direction={direction} slideKey={currentSlide}>
          {slides[currentSlide]}
        </SlideWrap>
      </div>

      {/* Bottom nav */}
      <div className="relative z-20 flex items-center justify-between px-5 py-3 shrink-0"
        style={{
          background: 'hsl(var(--background) / 0.9)',
          borderTop: '1px solid hsl(var(--border) / 0.15)',
        }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={prev}
          disabled={currentSlide === 0}
          className="gap-1.5 rounded-xl text-muted-foreground/50 hover:text-foreground disabled:opacity-15 transition-all duration-200 hover:bg-card/40"
        >
          <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Anterior</span>
        </Button>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="relative rounded-full transition-all duration-400 ease-out hover:opacity-80"
              style={{
                width: i === currentSlide ? 24 : 6,
                height: 6,
                background: i === currentSlide ? 'transparent' : 'hsl(var(--muted-foreground) / 0.15)',
              }}
            >
              {i === currentSlide && (
                <motion.div
                  layoutId="active-dot"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: currentGlow,
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={next}
          disabled={currentSlide === TOTAL_SLIDES - 1}
          className="gap-1.5 rounded-xl text-muted-foreground/50 hover:text-foreground disabled:opacity-15 transition-all duration-200 hover:bg-card/40"
        >
          <span className="hidden sm:inline">Siguiente</span> <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
