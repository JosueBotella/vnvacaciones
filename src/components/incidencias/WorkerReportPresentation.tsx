import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Building2,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Gavel,
  Loader2,
  Maximize,
  Minimize,
  Moon,
  Scale,
  ShieldAlert,
  Sparkles,
  Star,
  Sun,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ── Constants ── */
const SLIDE_W = 1920;
const SLIDE_H = 1080;
const EASE = [0.22, 1, 0.36, 1] as const;

const TONE_INC = "hsl(215,14%,52%)";
const TONE_AMO = "hsl(36,20%,50%)";
const TONE_SAN = "hsl(3,18%,44%)";
const TONE_POS = "hsl(96,22%,42%)";
const VERDE = "hsl(84,100%,42%)";

/* ── Types ── */
type WorkerLike = {
  id: string; nombre: string; apellidos: string | null;
  worker_number: string | null; external_url_salix: string | null;
  department_name?: string | null;
};
type RecordLike = {
  fecha?: string | null; fecha_evento?: string | null; created_at?: string | null;
  descripcion?: string | null; gravedad?: string | null; suspension_dias?: number | null;
  custom_category_name?: string | null;
  incidencias_categories?: { name?: string | null; gravedad?: string | null } | null;
  incidencias_positive_categories?: { name?: string | null } | null;
};
type StatsLike = {
  worker?: {
    nombre?: string | null; apellidos?: string | null; worker_number?: string | null;
    external_url_salix?: string | null; department_name?: string | null;
    incidencias_departments?: { name?: string | null } | null;
  } | null;
  negativas?: RecordLike[] | null; positivas?: RecordLike[] | null;
  amonestaciones?: RecordLike[] | null; sanciones?: RecordLike[] | null;
};
type EvolutionMode = "disciplinario" | "positivas" | "balance";

interface Props {
  open: boolean; worker: WorkerLike | null; stats: StatsLike | null;
  fechaDesde: string; fechaHasta: string; incluirPositivas: boolean;
  onClose: () => void; onDownloadPdf?: () => void; pdfLoading?: boolean;
}

/* ── Helpers ── */
function safe<T>(v: T[] | null | undefined): T[] { return Array.isArray(v) ? v : []; }
function recDate(r: RecordLike) { return r.fecha_evento || r.fecha || r.created_at || null; }
function catLabel(r: RecordLike, fb: string) { return r.incidencias_categories?.name || r.incidencias_positive_categories?.name || r.custom_category_name || fb; }
function sevLabel(r: RecordLike) { return r.gravedad || r.incidencias_categories?.gravedad || "leve"; }
function fmtMonth(k: string) { try { return format(parseISO(`${k}-01T00:00:00`), "LLL", { locale: es }); } catch { return k; } }
function fmtDate(v: string | null | undefined) { if (!v) return "—"; try { return format(parseISO(v), "dd MMM yyyy", { locale: es }); } catch { return v.slice(0, 10); } }
function tc(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ── Apple-flat card ── */
const CARD: React.CSSProperties = {
  background: "hsl(var(--muted) / 0.5)",
  border: "1px solid hsl(var(--border) / 0.08)",
  boxShadow: "0 1px 3px hsl(var(--foreground) / 0.04)",
};

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl overflow-hidden", className)} style={CARD}>{children}</div>;
}

/* ── Slide variants ── */
const slideV = {
  enter: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0, scale: 0.97, filter: "blur(3px)" }),
  center: { x: 0, opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0, scale: 0.97, filter: "blur(3px)" }),
};

/* ── Tooltip ── */
function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3.5 py-2.5 text-sm" style={{ background: "hsl(var(--card) / 0.92)", border: "1px solid hsl(var(--border) / 0.15)", boxShadow: "0 6px 20px hsl(var(--foreground) / 0.08)" }}>
      {label && <p className="mb-1.5 text-[11px] font-medium tracking-[0.06em] text-muted-foreground">{label}</p>}
      {payload.map((e: any) => (
        <div key={e.dataKey} className="flex items-center justify-between gap-4 text-sm">
          <span className="font-medium" style={{ color: e.color }}>{e.name || e.dataKey}</span>
          <span className="font-semibold text-foreground">{e.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════ */
export function WorkerReportPresentation({ open, worker, stats, fechaDesde, fechaHasta, incluirPositivas, onClose, onDownloadPdf: _legacyPdfDownload, pdfLoading: _legacyPdfLoading = false }: Props) {
  const vpRef = useRef<HTMLDivElement>(null);
  const fsRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const touchX = useRef(0);
  const [scale, setScale] = useState(1);
  const [slide, setSlide] = useState(0);
  const [dir, setDir] = useState(1);
  const [fs, setFs] = useState(false);
  const [dark, setDark] = useState(false);
  const [evoMode, setEvoMode] = useState<EvolutionMode>("disciplinario");
  const [pdfDownloading, setPdfDownloading] = useState(false);

  /* ── Data model ── */
  const m = useMemo(() => {
    if (!stats) return null;
    const w = {
      nombre: stats.worker?.nombre || worker?.nombre || "Trabajador",
      apellidos: stats.worker?.apellidos || worker?.apellidos || null,
      worker_number: stats.worker?.worker_number || worker?.worker_number || null,
      external_url_salix: stats.worker?.external_url_salix || worker?.external_url_salix || null,
      department_name: stats.worker?.department_name || stats.worker?.incidencias_departments?.name || worker?.department_name || "Sin departamento",
    };
    const neg = safe(stats.negativas), pos = incluirPositivas ? safe(stats.positivas) : [];
    const amo = safe(stats.amonestaciones), san = safe(stats.sanciones);
    const susDays = san.reduce((a, i) => a + Number(i.suspension_dias || 0), 0);
    const totalDisc = neg.length + amo.length + san.length;
    const totalAll = totalDisc + pos.length;
    const rPos = totalAll > 0 ? Math.round((pos.length / totalAll) * 100) : 0;
    const rSan = totalDisc > 0 ? Math.round((san.length / totalDisc) * 100) : 0;

    const mm = new Map<string, { inc: number; amo: number; san: number; rec: number }>();
    const ens = (d: string | null) => { if (!d) return null; const k = d.slice(0, 7); if (!mm.has(k)) mm.set(k, { inc: 0, amo: 0, san: 0, rec: 0 }); return k; };
    neg.forEach(i => { const k = ens(recDate(i)); if (k) mm.get(k)!.inc++; });
    amo.forEach(i => { const k = ens(recDate(i)); if (k) mm.get(k)!.amo++; });
    san.forEach(i => { const k = ens(recDate(i)); if (k) mm.get(k)!.san++; });
    pos.forEach(i => { const k = ens(recDate(i)); if (k) mm.get(k)!.rec++; });

    const monthly = Array.from(mm.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({
      month: tc(fmtMonth(k)), incidencias: v.inc, amonestaciones: v.amo, sanciones: v.san,
      reconocimientos: v.rec, disciplinario: v.inc + v.amo + v.san, balance: v.rec - (v.inc + v.amo + v.san),
    }));

    const bd = [
      { name: "Incidencias", value: neg.length, color: TONE_INC },
      { name: "Amonestaciones", value: amo.length, color: TONE_AMO },
      { name: "Sanciones", value: san.length, color: TONE_SAN },
      ...(incluirPositivas ? [{ name: "Reconocimientos", value: pos.length, color: TONE_POS }] : []),
    ].filter(i => i.value > 0);

    const catMap = new Map<string, number>();
    [...neg, ...amo, ...san].forEach(i => { const k = catLabel(i, "Sin categoría"); catMap.set(k, (catMap.get(k) || 0) + 1); });
    const topCats = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, v]) => ({ name: n, value: v }));

    const sevMap = new Map<string, number>();
    [...neg, ...amo, ...san].forEach(i => { const k = sevLabel(i).replace(/_/g, " "); sevMap.set(k, (sevMap.get(k) || 0) + 1); });
    const sevOrd = ["leve", "grave", "muy grave", "sancion"];
    const sevDist = Array.from(sevMap.entries()).sort((a, b) => sevOrd.indexOf(a[0].toLowerCase()) - sevOrd.indexOf(b[0].toLowerCase())).map(([n, v]) => ({ name: tc(n), value: v }));

    const tl = [
      ...neg.map(i => ({ date: recDate(i), label: catLabel(i, "Incidencia"), desc: i.descripcion || "", type: "Incidencia", color: TONE_INC })),
      ...amo.map(i => ({ date: recDate(i), label: catLabel(i, "Amonestación"), desc: i.descripcion || "", type: "Amonestación", color: TONE_AMO })),
      ...san.map(i => ({ date: recDate(i), label: `${catLabel(i, "Sanción")}${i.suspension_dias ? ` · ${i.suspension_dias}d` : ""}`, desc: i.descripcion || "", type: "Sanción", color: TONE_SAN })),
      ...pos.map(i => ({ date: recDate(i), label: catLabel(i, "Reconocimiento"), desc: i.descripcion || "", type: "Reconocimiento", color: TONE_POS })),
    ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 10);

    const topCat = topCats[0]?.name || "Sin patrón dominante";
    const insights = [
      totalDisc === 0 ? "No se registran eventos disciplinarios en el periodo." : `El bloque disciplinario concentra ${totalDisc} registros, con foco principal en "${topCat}".`,
      san.length > 0 ? `Las sanciones representan ${rSan}% del total disciplinario y acumulan ${susDays} días de suspensión.` : "No se registran sanciones en el periodo.",
      incluirPositivas ? `Ratio positivo: ${rPos}%, útil para contextualizar desempeño frente a medidas correctivas.` : "Lectura centrada en el comportamiento disciplinario.",
    ];

    return {
      name: [w.nombre, w.apellidos].filter(Boolean).join(" "),
      num: w.worker_number, dept: w.department_name,
      salix: w.worker_number ? w.external_url_salix || `https://salix.verdnatura.es/#!/worker/${encodeURIComponent(w.worker_number)}/summary` : null,
      from: fmtDate(fechaDesde), to: fmtDate(fechaHasta),
      met: { inc: neg.length, amo: amo.length, san: san.length, rec: pos.length, totalDisc, totalAll, susDays, rPos, rSan },
      bd, monthly, topCats, sevDist, tl, insights,
      defs: [
        { title: "Incidencia", sub: "Registro interno", body: "Documenta un hecho observado por responsables. Sirve para dejar constancia y valorar recurrencia, pero no constituye medida disciplinaria formal.", color: TONE_INC },
        { title: "Amonestación", sub: "Advertencia formal", body: "Respuesta formal cuando el hecho supera el registro interno. Se apoya en el convenio y deja constancia expresa de incumplimiento.", color: TONE_AMO },
        { title: "Sanción", sub: "Medida de mayor intensidad", body: "Se aplica cuando la gravedad o reiteración exige una respuesta superior, incluida suspensión de empleo y sueldo cuando procede.", color: TONE_SAN },
      ],
    };
  }, [stats, worker, incluirPositivas, fechaDesde, fechaHasta]);

  const TOTAL = 7;

  /* ── Dark mode: toggle class on the wrapper AND propagate CSS vars ── */
  const toggleDark = useCallback(() => setDark(v => !v), []);

  useEffect(() => { if (open) { setSlide(0); setDir(1); setEvoMode("disciplinario"); setDark(document.documentElement.classList.contains("dark") || window.matchMedia("(prefers-color-scheme: dark)").matches); } }, [open]);
  useEffect(() => { if (!open) return; const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, [open]);
  useEffect(() => {
    if (!open || !vpRef.current) return;
    const upd = () => { if (!vpRef.current) return; const { clientWidth: cw, clientHeight: ch } = vpRef.current; setScale(Math.min(cw / SLIDE_W, ch / SLIDE_H)); };
    upd(); const ob = new ResizeObserver(upd); ob.observe(vpRef.current); return () => ob.disconnect();
  }, [open]);
  useEffect(() => { if (!open) return; const h = () => setFs(!!document.fullscreenElement); document.addEventListener("fullscreenchange", h); return () => document.removeEventListener("fullscreenchange", h); }, [open]);

  const goTo = useCallback((n: number) => { if (n < 0 || n >= TOTAL) return; setDir(n > slide ? 1 : -1); setSlide(n); }, [slide]);
  const next = useCallback(() => goTo(slide + 1), [slide, goTo]);
  const prev = useCallback(() => goTo(slide - 1), [slide, goTo]);
  const toggleFs = useCallback(async () => {
    if (!fsRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await fsRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // fallback silently
    }
  }, []);

  /* ── PDF download: capture each slide as image ── */
  const downloadPresentationPdf = useCallback(async () => {
    if (!slideRef.current || !m) return;
    setPdfDownloading(true);
    toast.info("Generando PDF de la presentación…");

    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [297, 210] });
      const currentSlide = slide;

      for (let i = 0; i < TOTAL; i++) {
        // Navigate to slide
        setDir(1);
        setSlide(i);
        // Wait for render + animation
        await new Promise(r => setTimeout(r, 600));

        const el = slideRef.current;
        if (!el) continue;

        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: null,
          width: SLIDE_W,
          height: SLIDE_H,
        });

        const imgData = canvas.toDataURL("image/png");
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, 0, 297, 210);
      }

      // Restore original slide
      setSlide(currentSlide);

      const workerName = m.name.replace(/\s+/g, "_");
      pdf.save(`Presentacion_${workerName}.pdf`);
      toast.success("PDF de presentación descargado ✓");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("Error generando el PDF");
    } finally {
      setPdfDownloading(false);
    }
  }, [m, slide]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      if (e.key.toLowerCase() === "f") { e.preventDefault(); void toggleFs(); }
      if (e.key === "Escape") {
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, next, prev, onClose, toggleFs]);

  if (!open || !m) return null;

  /* ── Typography helpers ── */
  const secLabel = "text-[13px] font-light tracking-[-0.01em] text-muted-foreground/50";
  const secTitle = "text-[28px] font-semibold tracking-[-0.03em] text-foreground leading-tight";
  const kpiNum = "text-[48px] font-semibold tracking-[-0.04em] tabular-nums text-foreground";
  const kpiHint = "text-[14px] font-normal text-muted-foreground/60 mt-1";

  /* ── Slides ── */
  const slides = [
    /* 0 — Cover */
    (
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-8">
          <div className="max-w-[1050px]">
            <p className={secLabel}>Informe disciplinario</p>
            <h1 className="mt-5 text-[80px] font-semibold leading-[0.94] tracking-[-0.05em] text-foreground">
              Lectura visual<br />del periodo
            </h1>
            <p className="mt-6 max-w-[720px] text-[20px] font-normal leading-[1.5] text-muted-foreground/70">
              Formato dinámico para exponer la situación del trabajador, navegar por periodos y presentar el contexto disciplinario con una lectura clara.
            </p>
          </div>
          <Card className="w-[380px] p-7">
            <p className={secLabel}>Periodo</p>
            <p className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-foreground">{m.from}</p>
            <p className="text-[26px] font-semibold tracking-[-0.03em] text-foreground">{m.to}</p>
            <div className="my-5 h-px bg-border/20" />
            <p className={secLabel}>Trabajador</p>
            <p className="mt-1.5 text-[30px] font-semibold tracking-[-0.04em] text-foreground">{m.name}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { icon: <Building2 className="h-3.5 w-3.5" />, text: m.dept },
                ...(m.num ? [{ icon: <FileText className="h-3.5 w-3.5" />, text: `Nº ${m.num}` }] : []),
              ].map(b => (
                <span key={b.text} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-normal text-muted-foreground" style={{ background: "hsl(var(--muted) / 0.6)" }}>
                  {b.icon}{b.text}
                </span>
              ))}
            </div>
            {m.salix && (
              <a href={m.salix} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-primary hover:opacity-80">
                Abrir ficha Sálix <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </Card>
        </div>
        <div className="grid grid-cols-3 gap-5">
          <Card className="p-6">
            <p className={secLabel}>Total disciplinario</p>
            <p className={cn(kpiNum, "mt-3")}>{m.met.totalDisc}</p>
            <p className={kpiHint}>Incidencias, amonestaciones y sanciones</p>
          </Card>
          <Card className="p-6">
            <p className={secLabel}>Reconocimientos</p>
            <p className={cn(kpiNum, "mt-3")} style={{ color: TONE_POS }}>{m.met.rec}</p>
            <p className={kpiHint}>Contexto positivo del periodo</p>
          </Card>
          <Card className="p-6">
            <p className={secLabel}>Días de suspensión</p>
            <p className={cn(kpiNum, "mt-3")} style={{ color: TONE_SAN }}>{m.met.susDays}</p>
            <p className={kpiHint}>Vinculados a sanciones registradas</p>
          </Card>
        </div>
      </div>
    ),

    /* 1 — Resumen ejecutivo */
    (
      <div className="flex h-full flex-col gap-6">
        <div>
          <p className={secLabel}>Resumen ejecutivo</p>
          <h2 className="mt-3 text-[56px] font-semibold tracking-[-0.04em] text-foreground">Panorama del periodo</h2>
          <p className="mt-2 text-[18px] font-normal text-muted-foreground/60">Equilibrio entre registros internos, medidas formales y reconocimientos.</p>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[
            { icon: <AlertTriangle className="h-5 w-5" />, label: "Incidencias", val: m.met.inc, hint: "Registros internos", tone: TONE_INC },
            { icon: <Gavel className="h-5 w-5" />, label: "Amonestaciones", val: m.met.amo, hint: "Advertencias formales", tone: TONE_AMO },
            { icon: <ShieldAlert className="h-5 w-5" />, label: "Sanciones", val: m.met.san, hint: "Medidas de intensidad", tone: TONE_SAN },
            { icon: <Star className="h-5 w-5" />, label: "Reconocimientos", val: m.met.rec, hint: "Contexto positivo", tone: TONE_POS },
          ].map(k => (
            <Card key={k.label} className="p-6 flex flex-col justify-between gap-5">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "hsl(var(--muted) / 0.6)", color: k.tone }}>{k.icon}</div>
                <span className="rounded-full px-3 py-1 text-[12px] font-normal text-muted-foreground" style={{ background: "hsl(var(--muted) / 0.6)" }}>{k.label}</span>
              </div>
              <div>
                <p className="text-[42px] font-semibold tracking-[-0.04em] text-foreground">{k.val}</p>
                <p className={kpiHint}>{k.hint}</p>
              </div>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-[1.1fr_0.9fr] gap-5 flex-1 min-h-0">
          <Card className="p-7 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className={secLabel}>Hallazgos</p>
                <p className={cn(secTitle, "mt-1")}>Mensajes clave</p>
              </div>
              <Sparkles className="h-4.5 w-4.5 text-muted-foreground/30" />
            </div>
            <div className="space-y-3 flex-1">
              {m.insights.map((t, i) => (
                <div key={t} className="rounded-xl p-5" style={{ background: "hsl(var(--muted) / 0.4)" }}>
                  <p className="text-[12px] font-light tracking-[-0.01em] text-muted-foreground/40 mb-1.5">0{i + 1}</p>
                  <p className="text-[17px] font-medium leading-[1.5] tracking-[-0.01em] text-foreground">{t}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-7 flex flex-col justify-between">
            <div>
              <p className={secLabel}>Ratios</p>
              <p className={cn(secTitle, "mt-1")}>Contexto global</p>
            </div>
            <div className="space-y-4">
              {[
                { label: "Ratio positivo", pct: m.met.rPos, color: TONE_POS },
                { label: "Peso de sanciones", pct: m.met.rSan, color: TONE_SAN },
              ].map(r => (
                <div key={r.label} className="rounded-xl p-5" style={{ background: "hsl(var(--muted) / 0.4)" }}>
                  <div className="flex items-center justify-between text-[15px] font-medium mb-2.5">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="text-foreground font-semibold">{r.pct}%</span>
                  </div>
                  <div className="h-2.5 rounded-full" style={{ background: "hsl(var(--muted) / 0.5)" }}>
                    <div className="h-2.5 rounded-full transition-all" style={{ width: `${Math.max(r.pct, 2)}%`, background: r.color }} />
                  </div>
                </div>
              ))}
              <div className="rounded-xl p-5" style={{ background: "hsl(var(--muted) / 0.4)" }}>
                <p className="text-[15px] font-medium text-muted-foreground">Eventos totales</p>
                <p className="mt-1 text-[42px] font-semibold tracking-[-0.04em] text-foreground">{m.met.totalAll}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    ),

    /* 2 — Distribución */
    (
      <div className="grid h-full grid-cols-[0.9fr_1.1fr] gap-5">
        <Card className="p-7 flex flex-col">
          <div className="mb-4">
            <p className={secLabel}>Distribución</p>
            <p className={cn(secTitle, "mt-1")}>Composición del periodo</p>
          </div>
          <div className="flex-1 flex items-center justify-center min-h-0">
            <PieChart width={300} height={300}>
              <Pie data={m.bd} dataKey="value" nameKey="name" cx={150} cy={150} innerRadius={85} outerRadius={130} paddingAngle={3} stroke="none" strokeWidth={0}>
                {m.bd.map(i => <Cell key={i.name} fill={i.color} />)}
              </Pie>
              <Tooltip content={<Tip />} />
            </PieChart>
          </div>
          <div className="text-center -mt-2 mb-4">
            <span className="text-[12px] font-light tracking-[-0.01em] text-muted-foreground/40">Total</span>
            <p className="text-[38px] font-semibold tracking-[-0.04em] text-foreground">{m.met.totalAll}</p>
          </div>
          <div className="space-y-2.5">
            {m.bd.map(i => (
              <div key={i.name} className="flex items-center gap-3 text-[15px]">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: i.color }} />
                <span className="flex-1 font-medium text-foreground">{i.name}</span>
                <span className="font-semibold text-muted-foreground">{i.value}</span>
              </div>
            ))}
          </div>
        </Card>
        <div className="grid grid-rows-[auto_1fr] gap-5">
          <Card className="p-7">
            <div className="flex items-center justify-between mb-5">
              <div><p className={secLabel}>Lectura por bloque</p><p className={cn(secTitle, "mt-1")}>Peso relativo de cada tipo</p></div>
              <ArrowLeftRight className="h-4.5 w-4.5 text-muted-foreground/30" />
            </div>
            <div className="space-y-4">
              {m.bd.map(i => {
                const pct = m.met.totalAll > 0 ? Math.round((i.value / m.met.totalAll) * 100) : 0;
                return (
                  <div key={i.name}>
                    <div className="flex items-center justify-between text-[15px] font-medium mb-2">
                      <span className="text-foreground">{i.name}</span>
                      <span className="text-muted-foreground">{i.value} · {pct}%</span>
                    </div>
                    <div className="h-2.5 rounded-full" style={{ background: "hsl(var(--muted) / 0.5)" }}>
                      <div className="h-2.5 rounded-full" style={{ width: `${Math.max(pct, 2)}%`, background: i.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card className="p-7 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <div><p className={secLabel}>Gravedad</p><p className={cn(secTitle, "mt-1")}>Distribución disciplinaria</p></div>
              <Scale className="h-4.5 w-4.5 text-muted-foreground/30" />
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={m.sevDist} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid horizontal={false} stroke="hsl(var(--border) / 0.08)" />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--foreground))", fontSize: 14, fontWeight: 500 }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip content={<Tip />} cursor={{ fill: "hsl(var(--muted) / 0.2)" }} />
                  <Bar dataKey="value" name="Registros" radius={[6, 6, 6, 6]} fill="hsl(var(--foreground) / 0.2)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    ),

    /* 3 — Evolución */
    (
      <div className="flex h-full flex-col gap-5">
        <div className="flex items-end justify-between gap-6 shrink-0">
          <div>
            <p className={secLabel}>Evolución</p>
            <h2 className="mt-3 text-[56px] font-semibold tracking-[-0.04em] text-foreground">Ritmo mensual</h2>
            <p className="mt-2 text-[18px] font-normal text-muted-foreground/60">La gráfica cambia de lectura según el modo activo.</p>
          </div>
          <div className="flex items-center gap-1 rounded-full p-1 shrink-0" style={{ background: "hsl(var(--muted) / 0.5)" }}>
            {(["disciplinario", "positivas", "balance"] as const).map(k => (
              <button key={k} type="button" onClick={() => setEvoMode(k)}
                className={cn("rounded-full px-5 py-2 text-[14px] font-medium transition-all", evoMode === k ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {tc(k)}
              </button>
            ))}
          </div>
        </div>
        <Card className="flex-1 min-h-0 p-7">
          <ResponsiveContainer width="100%" height="100%">
            {evoMode === "disciplinario" ? (
              <BarChart data={m.monthly} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="hsl(var(--border) / 0.08)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13 }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tip />} cursor={{ fill: "hsl(var(--muted) / 0.2)" }} />
                <Bar dataKey="incidencias" stackId="d" fill={TONE_INC} radius={[4, 4, 0, 0]} name="Incidencias" />
                <Bar dataKey="amonestaciones" stackId="d" fill={TONE_AMO} radius={[4, 4, 0, 0]} name="Amonestaciones" />
                <Bar dataKey="sanciones" stackId="d" fill={TONE_SAN} radius={[4, 4, 0, 0]} name="Sanciones" />
              </BarChart>
            ) : evoMode === "positivas" ? (
              <AreaChart data={m.monthly} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <defs><linearGradient id="gPos" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TONE_POS} stopOpacity={0.3} /><stop offset="100%" stopColor={TONE_POS} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid stroke="hsl(var(--border) / 0.08)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13 }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="reconocimientos" name="Reconocimientos" stroke={TONE_POS} strokeWidth={2} fill="url(#gPos)" />
              </AreaChart>
            ) : (
              <AreaChart data={m.monthly} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <defs><linearGradient id="gBal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TONE_SAN} stopOpacity={0.2} /><stop offset="100%" stopColor={TONE_SAN} stopOpacity={0.01} /></linearGradient></defs>
                <CartesianGrid stroke="hsl(var(--border) / 0.08)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13 }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="disciplinario" name="Disciplinario" stroke={TONE_SAN} strokeWidth={2} fill="url(#gBal)" />
                <Area type="monotone" dataKey="reconocimientos" name="Reconocimientos" stroke={TONE_POS} strokeWidth={2} fillOpacity={0} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </Card>
      </div>
    ),

    /* 4 — Categorías */
    (
      <div className="grid h-full grid-cols-[1fr_1fr] gap-5">
        <Card className="p-7 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div><p className={secLabel}>Categorías</p><p className={cn(secTitle, "mt-1")}>Top causas del periodo</p></div>
            <BarChart3 className="h-4.5 w-4.5 text-muted-foreground/30" />
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.topCats} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 8 }}>
                <CartesianGrid horizontal={false} stroke="hsl(var(--border) / 0.08)" />
                <XAxis type="number" allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fill: "hsl(var(--foreground))", fontSize: 14, fontWeight: 500 }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tip />} cursor={{ fill: "hsl(var(--muted) / 0.2)" }} />
                <Bar dataKey="value" name="Registros" fill="hsl(var(--foreground) / 0.2)" radius={[6, 6, 6, 6]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <div className="grid grid-rows-[auto_auto_1fr] gap-4">
          <Card className="p-6">
            <p className={secLabel}>Observación principal</p>
            <p className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-foreground">{m.topCats[0]?.name || "Sin categoría"}</p>
            <p className="mt-2 text-[15px] font-normal leading-[1.5] text-muted-foreground">Categoría más repetida del periodo y primer foco narrativo al presentar el caso.</p>
          </Card>
          <Card className="p-6">
            <p className={secLabel}>Marco de lectura</p>
            <p className="mt-2 text-[15px] font-normal leading-[1.55] text-muted-foreground">La categoría ayuda a explicar el patrón, pero la decisión disciplinaria se interpreta junto con gravedad, reiteración y medidas previas.</p>
          </Card>
          <Card className="p-6 flex flex-col">
            <div className="mb-4">
              <p className={secLabel}>Severidad</p>
              <p className={cn(secTitle, "mt-1")}>Escala de impacto</p>
            </div>
            <div className="space-y-4 flex-1">
              {m.sevDist.map(i => {
                const pct = m.met.totalDisc > 0 ? Math.round((i.value / m.met.totalDisc) * 100) : 0;
                return (
                  <div key={i.name}>
                    <div className="flex items-center justify-between text-[15px] font-medium mb-2">
                      <span className="text-foreground">{i.name}</span>
                      <span className="text-muted-foreground">{i.value} · {pct}%</span>
                    </div>
                    <div className="h-2.5 rounded-full" style={{ background: "hsl(var(--muted) / 0.5)" }}>
                      <div className="h-2.5 rounded-full" style={{ width: `${Math.max(pct, 2)}%`, background: "hsl(var(--foreground) / 0.2)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    ),

    /* 5 — Marco conceptual */
    (
      <div className="grid h-full grid-cols-[0.92fr_1.08fr] gap-5">
        <Card className="p-7 flex flex-col">
          <div className="mb-5"><p className={secLabel}>Marco conceptual</p><p className={cn(secTitle, "mt-1")}>Cómo se interpreta cada bloque</p></div>
          <div className="space-y-4 flex-1">
            {m.defs.map(d => (
              <div key={d.title} className="rounded-xl p-5" style={{ background: "hsl(var(--muted) / 0.4)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: d.color }} />
                  <p className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">{d.title}</p>
                </div>
                <p className="text-[14px] font-medium text-primary/60 mb-2">{d.sub}</p>
                <p className="text-[16px] font-normal leading-[1.55] text-muted-foreground">{d.body}</p>
              </div>
            ))}
          </div>
        </Card>
        <div className="grid grid-rows-[auto_1fr] gap-5">
          <Card className="p-6">
            <p className={secLabel}>Clasificación interna Verdnatura</p>
            <div className="mt-4 space-y-3">
              {[
                { l: "Incidencia", d: "Documenta, contextualiza y deja trazabilidad.", c: TONE_INC },
                { l: "Amonestación", d: "Formaliza el apercibimiento y deja constancia disciplinaria.", c: TONE_AMO },
                { l: "Sanción", d: "Activa medida correctiva de mayor intensidad, incluida suspensión.", c: TONE_SAN },
              ].map(i => (
                <div key={i.l} className="flex items-start gap-3 rounded-xl p-4" style={{ background: "hsl(var(--muted) / 0.4)" }}>
                  <span className="mt-1.5 h-3 w-3 rounded-full shrink-0" style={{ background: i.c }} />
                  <div>
                    <p className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">{i.l}</p>
                    <p className="mt-0.5 text-[14px] font-normal text-muted-foreground">{i.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <p className={secLabel}>Uso recomendado</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                "Separar claramente registro interno y medida formal.",
                "Explicar gravedad y reiteración antes de la conclusión.",
                "Usar la cronología para ver escalado disciplinario.",
                "Contextualizar reconocimientos sin diluir el caso.",
              ].map(t => (
                <div key={t} className="rounded-xl p-4 text-[15px] font-normal leading-[1.5] text-foreground" style={{ background: "hsl(var(--muted) / 0.4)" }}>
                  {t}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    ),

    /* 6 — Cronología + Conclusión */
    (
      <div className="grid h-full grid-cols-[1fr_1fr] gap-5">
        <Card className="p-7 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div><p className={secLabel}>Cronología</p><p className={cn(secTitle, "mt-1")}>Secuencia de hechos</p></div>
            <CalendarRange className="h-4.5 w-4.5 text-muted-foreground/30" />
          </div>
          <div className="space-y-3 overflow-y-auto pr-1.5 flex-1 min-h-0">
            {m.tl.map(i => (
              <div key={`${i.type}-${i.date}-${i.label}`} className="rounded-xl p-4" style={{ background: "hsl(var(--muted) / 0.4)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="mt-1.5 h-3 w-3 rounded-full shrink-0" style={{ background: i.color }} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-light tracking-[-0.01em] text-muted-foreground/40">{i.type}</p>
                      <p className="mt-0.5 text-[17px] font-semibold tracking-[-0.02em] text-foreground truncate">{i.label}</p>
                      {i.desc && <p className="mt-1 text-[14px] font-normal leading-[1.5] text-muted-foreground line-clamp-2">{i.desc}</p>}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium text-muted-foreground" style={{ background: "hsl(var(--muted) / 0.5)" }}>
                    {fmtDate(i.date)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <div className="grid grid-rows-[1fr_auto] gap-5">
          <Card className="p-7 flex flex-col">
            <p className={secLabel}>Conclusión del periodo</p>
            <p className="mt-2 text-[32px] font-semibold tracking-[-0.03em] text-foreground">Valoración global de {m.name}</p>
            <div className="mt-5 space-y-4 flex-1">
              <div className="rounded-xl p-5" style={{ background: "hsl(var(--muted) / 0.4)" }}>
                <p className="text-[16px] font-normal leading-[1.55] text-muted-foreground">
                  En el periodo {m.from} — {m.to}, se han registrado un total de <strong className="text-foreground">{m.met.totalDisc} eventos disciplinarios</strong>
                  {m.met.rec > 0 && <> y <strong className="text-foreground">{m.met.rec} reconocimientos positivos</strong></>}.
                </p>
              </div>
              {m.met.san > 0 && (
                <div className="rounded-xl p-5" style={{ background: "hsl(var(--muted) / 0.4)" }}>
                  <p className="text-[16px] font-normal leading-[1.55] text-muted-foreground">
                    Se acumulan <strong className="text-foreground">{m.met.san} sanciones</strong> con un total de <strong className="text-foreground">{m.met.susDays} días de suspensión</strong> de empleo y sueldo.
                  </p>
                </div>
              )}
              <div className="rounded-xl p-5" style={{ background: "hsl(var(--muted) / 0.4)" }}>
                <p className="text-[16px] font-normal leading-[1.55] text-muted-foreground">
                  {m.topCats[0] ? <>La causa principal es <strong className="text-foreground">{m.topCats[0].name}</strong> ({m.topCats[0].value} registros).</> : "No se identifican patrones dominantes."}
                  {" "}El ratio positivo se sitúa en el <strong className="text-foreground">{m.met.rPos}%</strong>.
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground/40" />
                  <span className="text-[14px] font-medium text-muted-foreground">{m.dept}</span>
                </div>
                {m.num && (
                  <span className="text-[14px] font-medium text-muted-foreground">Nº {m.num}</span>
                )}
              </div>
              <span className="text-[13px] font-light text-muted-foreground/40">Informe generado automáticamente · Verdnatura</span>
            </div>
          </Card>
        </div>
      </div>
    ),
  ];

  /* ── Presentation content (shared between fullscreen and popup) ── */
  const presentationContent = (
    <div ref={fsRef} className={cn("relative flex h-full flex-col overflow-hidden", dark ? "dark bg-[hsl(240,10%,6%)]" : "bg-background")}
      style={dark ? { colorScheme: "dark", "--background": "240 10% 6%", "--foreground": "0 0% 95%", "--muted": "240 6% 14%", "--muted-foreground": "240 5% 55%", "--border": "240 6% 20%", "--card": "240 10% 8%", "--primary": "84 100% 42%", "--primary-foreground": "0 0% 0%" } as any : undefined}
    >
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between border-b px-5 py-3" style={{ borderColor: dark ? "hsl(240,6%,15%)" : "hsl(var(--border) / 0.1)", background: dark ? "hsl(240,10%,6%)" : "hsl(var(--background))" }}>
        <div className="flex items-center gap-3">
          <img src="/images/verdnatura-logo-green.png" alt="Verdnatura" className={cn("h-6", dark && "hidden")} />
          <img src="/images/verdnatura-logo-white.png" alt="Verdnatura" className={cn("hidden h-6", dark && "block")} />
          <div className="h-6 w-px" style={{ background: dark ? "hsl(240,6%,20%)" : "hsl(var(--border) / 0.15)" }} />
          <div>
            <p className="text-[11px] font-light tracking-[-0.01em]" style={{ color: dark ? "hsl(240,5%,45%)" : "hsl(var(--muted-foreground) / 0.5)" }}>Presentación interactiva</p>
            <p className="text-[15px] font-semibold tracking-[-0.02em]" style={{ color: dark ? "hsl(0,0%,95%)" : "hsl(var(--foreground))" }}>{m.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mr-2 text-[13px] font-semibold tabular-nums" style={{ color: dark ? "hsl(240,5%,55%)" : "hsl(var(--muted-foreground))" }}>{String(slide + 1).padStart(2, "0")} / {TOTAL}</span>
          <Button variant="outline" size="sm" className="rounded-full gap-1.5 h-8 text-xs" onClick={downloadPresentationPdf} disabled={pdfDownloading}>
            {pdfDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Descargar PDF
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={toggleDark}>
            {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => void toggleFs()}>
            {fs ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Progress */}
      <div className="relative z-10 h-[2px]" style={{ background: dark ? "hsl(240,6%,12%)" : "hsl(var(--border) / 0.06)" }}>
        <motion.div className="h-full" style={{ background: VERDE }} animate={{ width: `${((slide + 1) / TOTAL) * 100}%` }} transition={{ duration: 0.4, ease: EASE }} />
      </div>

      {/* Viewport */}
      <div ref={vpRef} className="relative flex-1 overflow-hidden" style={{ background: dark ? "hsl(240,10%,6%)" : "hsl(var(--background))" }}>
        <div className="absolute left-1/2 top-1/2" style={{ width: SLIDE_W, height: SLIDE_H, marginLeft: -SLIDE_W / 2, marginTop: -SLIDE_H / 2, transform: `scale(${scale})`, transformOrigin: "center center" }}>
          <div ref={slideRef} className="absolute inset-0" style={{ background: dark ? "hsl(240,10%,6%)" : "hsl(var(--background))", color: dark ? "hsl(0,0%,95%)" : "hsl(var(--foreground))" }}>
            <div className="absolute inset-0 overflow-hidden p-14">
              <AnimatePresence mode="wait" custom={dir}>
                <motion.div key={slide} custom={dir} variants={slideV} initial="enter" animate="center" exit="exit" transition={{ duration: 0.4, ease: EASE }} className="absolute inset-14">
                  {slides[slide]}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 flex items-center justify-between border-t px-5 py-3" style={{ borderColor: dark ? "hsl(240,6%,15%)" : "hsl(var(--border) / 0.1)", background: dark ? "hsl(240,10%,6%)" : "hsl(var(--background))" }}>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" className="rounded-full gap-1.5 h-8 text-xs" onClick={prev} disabled={slide === 0}>
            <ChevronLeft className="h-3.5 w-3.5" /> Anterior
          </Button>
          <Button variant="ghost" className="rounded-full gap-1.5 h-8 text-xs" onClick={next} disabled={slide === TOTAL - 1}>
            Siguiente <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <button key={i} type="button" onClick={() => goTo(i)} className="rounded-full transition-all"
              style={{ width: slide === i ? 20 : 8, height: 8, background: slide === i ? VERDE : dark ? "hsl(240,6%,20%)" : "hsl(var(--border) / 0.2)" }}
              aria-label={`Diapositiva ${i + 1}`} />
          ))}
        </div>
        <p className="text-[11px] font-light" style={{ color: dark ? "hsl(240,5%,35%)" : "hsl(var(--muted-foreground) / 0.4)" }}>← → navegar · F pantalla completa</p>
      </div>
    </div>
  );

  /* ── Render: fullscreen = fixed inset-0, windowed = centered popup with backdrop ── */
  return (
    <AnimatePresence>
      {fs ? (
        /* Fullscreen: covers entire screen */
        <motion.div key="fs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90]">
          {presentationContent}
        </motion.div>
      ) : (
        /* Windowed: popup with backdrop, click outside to close */
        <motion.div key="popup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center p-8"
          style={{ background: "hsl(0 0% 0% / 0.6)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={e => { const d = touchX.current - e.changedTouches[0].clientX; if (Math.abs(d) < 60) return; d > 0 ? next() : prev(); }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="w-full h-full max-w-[1400px] max-h-[900px] rounded-2xl overflow-hidden shadow-2xl"
            style={{ border: dark ? "1px solid hsl(240,6%,18%)" : "1px solid hsl(var(--border) / 0.15)" }}
          >
            {presentationContent}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
