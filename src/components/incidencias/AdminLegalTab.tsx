import { useState } from "react";
import { Scale, Search, AlertTriangle, BookOpen, FileText, ChevronDown, ChevronRight, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LIMITES_SANCION, PRESCRIPCION_DIAS, REINCIDENCIA, GRAVEDAD_LABELS, SANCION_LABELS, CONVENIO_INFO } from "@/modules/control-incidencias/core/constants";
import { ARTICULOS_DISCIPLINARIOS } from "@/modules/control-incidencias/legal/convenioData";
import { AdminTrainingDocsPanel } from "./AdminTrainingDocsPanel";
import type { FaltaGravedad } from "@/modules/control-incidencias/core/types";

const GRAVEDAD_COLORS: Record<string, string> = {
  leve: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  grave: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
  muy_grave: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
};

const LEGAL_GRAVEDADES: FaltaGravedad[] = ["leve", "grave", "muy_grave"];

function SectionToggle({ title, icon: Icon, defaultOpen, badge, children }: { title: string; icon: typeof Scale; defaultOpen?: boolean; badge?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full">
        <Card className="rounded-2xl border-border/50 hover:border-primary/30 transition-colors cursor-pointer">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                {title}
              </span>
              <span className="flex items-center gap-2">
                {badge && <Badge variant="secondary" className="text-[10px] px-2 py-0">{badge}</Badge>}
                {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AdminLegalTab() {
  const [artSearch, setArtSearch] = useState("");
  const [artGravedad, setArtGravedad] = useState<string>("todas");
  const sessionToken = localStorage.getItem("manager_session_token") || "";

  // Filter articles
  const filteredArticles = ARTICULOS_DISCIPLINARIOS.filter(art => {
    if (artGravedad !== "todas" && art.gravedad !== artGravedad) return false;
    if (artSearch) {
      const q = artSearch.toLowerCase();
      return art.titulo.toLowerCase().includes(q) || art.contenido.toLowerCase().includes(q) || art.numero.includes(q);
    }
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          Panel Legal — Régimen Disciplinario
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {CONVENIO_INFO.nombre} ({CONVENIO_INFO.boe})
        </p>
      </div>

      {/* Section A: Sanctions Table */}
      <SectionToggle title="Tabla de Sanciones del Convenio (Art. 51)" icon={Scale} defaultOpen>
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Gravedad</TableHead>
                    <TableHead className="text-xs">Sanciones permitidas</TableHead>
                    <TableHead className="text-xs text-center">Suspensión</TableHead>
                    <TableHead className="text-xs text-center">Despido</TableHead>
                    <TableHead className="text-xs text-center">Traslado</TableHead>
                    <TableHead className="text-xs text-center">Cancelación</TableHead>
                    <TableHead className="text-xs text-center">Prescripción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {LEGAL_GRAVEDADES.map(g => {
                    const lim = LIMITES_SANCION[g];
                    return (
                      <TableRow key={g}>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${GRAVEDAD_COLORS[g]}`}>
                            {GRAVEDAD_LABELS[g]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="space-y-0.5">
                            {lim.sanciones_permitidas.map(s => (
                              <div key={s} className="text-muted-foreground">{SANCION_LABELS[s]}</div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-xs font-mono">
                          {lim.suspension_min_dias === 0 && lim.suspension_max_dias === 0
                            ? "—"
                            : lim.suspension_min_dias === 0
                              ? `hasta ${lim.suspension_max_dias}d`
                              : `${lim.suspension_min_dias}–${lim.suspension_max_dias}d`}
                        </TableCell>
                        <TableCell className="text-center">
                          {lim.permite_despido ? <span className="text-red-500 font-bold text-xs">Sí</span> : <span className="text-muted-foreground text-xs">No</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {lim.permite_traslado ? <span className="text-orange-500 font-bold text-xs">Sí</span> : <span className="text-muted-foreground text-xs">No</span>}
                        </TableCell>
                        <TableCell className="text-center text-xs font-mono">
                          {lim.cancelacion_meses} meses
                        </TableCell>
                        <TableCell className="text-center text-xs font-mono">
                          {PRESCRIPCION_DIAS[g]} días
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="mt-3 p-2.5 rounded-xl bg-muted/30 border border-border/30">
              <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                <div>
                  <strong>Nota:</strong> La gravedad «Moderada» del sistema interno se trata legalmente igual que «Leve» a efectos del convenio colectivo.
                  Los plazos de prescripción se cuentan desde que la empresa tuvo conocimiento de la falta (Art. 60.2 ET). Prescripción absoluta: 6 meses desde la comisión.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </SectionToggle>

      {/* Section B: Articles */}
      <SectionToggle title="Artículos del Régimen Disciplinario (Art. 49-51)" icon={BookOpen} badge={`${filteredArticles.length} artículos`}>
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={artSearch}
                  onChange={e => setArtSearch(e.target.value)}
                  placeholder="Buscar por texto, título o número..."
                  className="pl-8 h-9 rounded-xl text-sm"
                />
              </div>
              <div className="flex gap-1">
                {["todas", "leve", "grave", "muy_grave"].map(g => (
                  <button
                    key={g}
                    onClick={() => setArtGravedad(g)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                      artGravedad === g
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {g === "todas" ? "Todas" : g === "muy_grave" ? "Muy grave" : g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {filteredArticles.map(art => (
                <div key={art.numero} className="p-3 rounded-xl border border-border/30 bg-muted/10 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold text-primary">Art. {art.numero}</span>
                    <span className="text-xs font-medium text-foreground">{art.titulo}</span>
                    {art.gravedad && (
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ml-auto ${GRAVEDAD_COLORS[art.gravedad]}`}>
                        {art.gravedad === "muy_grave" ? "Muy grave" : art.gravedad.charAt(0).toUpperCase() + art.gravedad.slice(1)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-line">{art.contenido}</p>
                </div>
              ))}
              {filteredArticles.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No se encontraron artículos con esos criterios.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </SectionToggle>

      {/* Section C: Recidivism */}
      <SectionToggle title="Reglas de Reincidencia (Art. 50)" icon={AlertTriangle}>
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-orange-500/20 bg-orange-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={GRAVEDAD_COLORS.leve + " text-[10px]"}>Leve → Grave</Badge>
                  <span className="text-[10px] text-muted-foreground">Art. 50.2.o</span>
                </div>
                <p className="text-xs text-foreground">
                  <strong>{REINCIDENCIA.leves_para_grave}</strong> faltas leves <strong>sancionadas</strong> (no solo amonestación verbal) en un trimestre ({REINCIDENCIA.leves_periodo_meses} meses) → se consideran falta <strong>grave</strong>.
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Solo cuentan sanciones formales, no registros internos ni amonestaciones verbales.
                </p>
              </div>

              <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={GRAVEDAD_COLORS.grave + " text-[10px]"}>Grave → Muy grave</Badge>
                  <span className="text-[10px] text-muted-foreground">Art. 50.3.m</span>
                </div>
                <p className="text-xs text-foreground">
                  <strong>{REINCIDENCIA.graves_para_muy_grave}+</strong> sanciones por faltas graves en un año ({REINCIDENCIA.graves_periodo_meses} meses) → se consideran falta <strong>muy grave</strong>.
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Deben ser sanciones formales previas, de distinta o igual naturaleza.
                </p>
              </div>
            </div>

            <div className="mt-3 p-2.5 rounded-xl bg-muted/30 border border-border/30">
              <p className="text-[11px] text-muted-foreground">
                <strong>⚠️ Importante:</strong> La reincidencia requiere sanciones formales ejecutadas, no simples registros o amonestaciones verbales.
                La IA del sistema aplica estos umbrales automáticamente al analizar propuestas.
              </p>
            </div>
          </CardContent>
        </Card>
      </SectionToggle>

      {/* Section D: Training Docs */}
      <SectionToggle title="Plantillas de Referencia para la IA" icon={FileText}>
        <AdminTrainingDocsPanel sessionToken={sessionToken} />
      </SectionToggle>
    </div>
  );
}
