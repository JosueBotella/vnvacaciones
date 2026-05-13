import { useState } from "react";
import { Save, Loader2, Building2, ChevronDown, Search, ShieldAlert, Scale, Zap, Brain, AlertTriangle, Info, Gauge } from "lucide-react";
import { EscaladoRulesEditor, type EscaladoRule } from "./EscaladoRulesEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DeptRule {
  department_id: string;
  umbral_leves: number;
  umbral_graves: number;
  umbral_muy_graves: number;
  periodo_dias_evaluacion: number;
  activar_automatico: boolean;
  activar_escalado_cadenas: boolean;
  umbral_amonestaciones: number;
  periodo_dias_amonestaciones: number;
  umbral_graves_despido: number;
  umbral_muy_graves_despido: number;
  periodo_dias_despido: number;
  alerta_despido_activa: boolean;
  // New fields
  valor_leve_equivalente: number;
  valor_grave_equivalente: number;
  valor_muy_grave_equivalente: number;
  umbral_combinado_activo: boolean;
  umbral_combinado_minimo: number;
  auto_escalar_tipo: boolean;
  notificar_encargado_popup: boolean;
  notificar_encargado_umbral_pct: number;
  ia_analisis_automatico: boolean;
  ia_considerar_convenio: boolean;
  escalado_reglas: EscaladoRule[];
}

export const DEFAULT_DEPT_RULE: Omit<DeptRule, 'department_id'> = {
  umbral_leves: 3,
  umbral_graves: 2,
  umbral_muy_graves: 1,
  periodo_dias_evaluacion: 90,
  activar_automatico: false,
  activar_escalado_cadenas: false,
  umbral_amonestaciones: 3,
  periodo_dias_amonestaciones: 90,
  umbral_graves_despido: 3,
  umbral_muy_graves_despido: 1,
  periodo_dias_despido: 365,
  alerta_despido_activa: true,
  valor_leve_equivalente: 1,
  valor_grave_equivalente: 3,
  valor_muy_grave_equivalente: 5,
  umbral_combinado_activo: false,
  umbral_combinado_minimo: 10,
  auto_escalar_tipo: true,
  notificar_encargado_popup: true,
  notificar_encargado_umbral_pct: 80,
  ia_analisis_automatico: true,
  ia_considerar_convenio: true,
  escalado_reglas: [],
};

interface Props {
  departments: Array<{ id: string; name: string }>;
  rulesMap: Record<string, DeptRule>;
  setRulesMap: React.Dispatch<React.SetStateAction<Record<string, DeptRule>>>;
  sessionToken: string;
  categories?: Array<{ id: string; name: string; gravedad: string; department_id: string | null }>;
}

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function GravityCard({ label, value, onChange, color, badgeColor }: {
  label: string; value: number; onChange: (v: number) => void;
  color: string; badgeColor: string;
}) {
  return (
    <div className={cn("rounded-xl border p-3 space-y-2", color)}>
      <div className="flex items-center justify-between">
        <Badge className={cn("text-[10px] px-2 py-0 border-0", badgeColor)}>{label}</Badge>
        <span className="text-[10px] text-muted-foreground">puntos</span>
      </div>
      <Input
        type="number"
        min={1}
        max={20}
        value={value}
        onChange={e => onChange(parseInt(e.target.value) || 1)}
        className="h-9 rounded-lg text-center font-bold text-lg"
      />
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description }: {
  icon: React.ElementType; title: string; description?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</p>
        {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

function DepartmentRulePanel({ dept, rule, updateRule, onUpdateEscalado, saveRule, saving, categories = [] }: {
  dept: { id: string; name: string };
  rule: DeptRule;
  updateRule: (field: string, value: number | boolean) => void;
  onUpdateEscalado: (rules: EscaladoRule[]) => void;
  saveRule: () => void;
  saving: boolean;
  categories?: Array<{ id: string; name: string; gravedad: string; department_id: string | null }>;
}) {
  return (
    <div className="px-4 py-5 mt-1 rounded-xl bg-muted/20 border border-border/30 space-y-5">

      {/* ─── A: Partes Automáticos ─── */}
      <div className="space-y-3">
        <SectionHeader
          icon={Zap}
          title="Partes automáticos"
          description="Genera alertas y sugerencias de acción cuando un trabajador alcanza los umbrales definidos."
        />
        <div className="flex items-center gap-3 pl-6">
          <Switch checked={rule.activar_automatico} onCheckedChange={v => updateRule('activar_automatico', v)} />
          <Label className="text-sm">Activar sistema automático</Label>
        </div>
        {rule.activar_automatico && (
          <div className="pl-6 space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Periodo de evaluación</Label>
              <Input
                type="number"
                min={7}
                max={730}
                value={rule.periodo_dias_evaluacion}
                onChange={e => updateRule('periodo_dias_evaluacion', parseInt(e.target.value) || 90)}
                className="h-8 rounded-lg w-20 text-center"
              />
              <span className="text-xs text-muted-foreground">días</span>
              <InfoTip text="Se contarán las incidencias registradas en los últimos X días para evaluar umbrales." />
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              Se evaluarán las incidencias de los últimos <span className="font-semibold text-foreground">{rule.periodo_dias_evaluacion}</span> días.
            </p>
          </div>
        )}
      </div>

      {rule.activar_automatico && (
        <>
          <Separator />

          {/* ─── B: Equivalencias de gravedad (Umbral combinado) ─── */}
          <div className="space-y-3">
            <SectionHeader
              icon={Scale}
              title="Equivalencias de gravedad"
              description="Define cuántos 'puntos' vale cada nivel de gravedad para calcular un umbral combinado."
            />
            <div className="grid grid-cols-3 gap-2 pl-6">
              <GravityCard
                label="Leve" value={rule.valor_leve_equivalente}
                onChange={v => updateRule('valor_leve_equivalente', v)}
                color="border-emerald-500/20 bg-emerald-500/5"
                badgeColor="bg-emerald-500/15 text-emerald-600"
              />
              <GravityCard
                label="Grave" value={rule.valor_grave_equivalente}
                onChange={v => updateRule('valor_grave_equivalente', v)}
                color="border-orange-500/20 bg-orange-500/5"
                badgeColor="bg-orange-500/15 text-orange-600"
              />
              <GravityCard
                label="Muy grave" value={rule.valor_muy_grave_equivalente}
                onChange={v => updateRule('valor_muy_grave_equivalente', v)}
                color="border-red-500/20 bg-red-500/5"
                badgeColor="bg-red-500/15 text-red-600"
              />
            </div>

            <div className={cn(
              "ml-6 rounded-xl border-2 p-4 space-y-3 transition-colors",
              rule.umbral_combinado_activo
                ? "border-primary/30 bg-primary/5"
                : "border-border/30 bg-muted/10"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={rule.umbral_combinado_activo} onCheckedChange={v => updateRule('umbral_combinado_activo', v)} />
                  <Label className="text-sm font-semibold">Umbral combinado</Label>
                  <InfoTip text="Cuando la suma ponderada (leves×1 + graves×3 + ...) alcance el mínimo, se activará la alerta automática." />
                </div>
                {rule.umbral_combinado_activo && (
                  <Badge className="text-[10px] px-2 py-0 bg-primary/10 text-primary border-0">Activo</Badge>
                )}
              </div>
              {rule.umbral_combinado_activo && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Mínimo de puntos</Label>
                  <Input
                    type="number"
                    min={1}
                    value={rule.umbral_combinado_minimo}
                    onChange={e => updateRule('umbral_combinado_minimo', parseInt(e.target.value) || 10)}
                    className="h-8 rounded-lg w-20 text-center font-bold"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Ej: {rule.valor_leve_equivalente}×3 leves + {rule.valor_grave_equivalente}×1 grave = {rule.valor_leve_equivalente * 3 + rule.valor_grave_equivalente} pts
                  </p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* ─── C: Umbrales individuales por gravedad ─── */}
          <div className="space-y-3">
            <SectionHeader
              icon={Gauge}
              title="Umbrales individuales"
              description="Número máximo de incidencias por gravedad antes de activar alerta."
            />
            <div className="grid grid-cols-3 gap-3 pl-6">
              <div>
                <Label className="text-xs text-muted-foreground">Leves</Label>
                <Input type="number" min={0} value={rule.umbral_leves} onChange={e => updateRule('umbral_leves', parseInt(e.target.value) || 0)} className="h-9 rounded-lg mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Graves</Label>
                <Input type="number" min={0} value={rule.umbral_graves} onChange={e => updateRule('umbral_graves', parseInt(e.target.value) || 0)} className="h-9 rounded-lg mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Muy graves</Label>
                <Input type="number" min={0} value={rule.umbral_muy_graves} onChange={e => updateRule('umbral_muy_graves', parseInt(e.target.value) || 0)} className="h-9 rounded-lg mt-1" />
              </div>
            </div>
          </div>

          <Separator />

          {/* ─── D: Escalado automático con IA ─── */}
          <div className="space-y-3">
            <SectionHeader
              icon={Brain}
              title="Escalado inteligente con IA"
              description="La IA analiza automáticamente cada incidencia y sugiere escalar de registro a amonestación o sanción según el convenio colectivo."
            />
            <div className="space-y-3 pl-6">
              <div className="flex items-center gap-3">
                <Switch checked={rule.auto_escalar_tipo} onCheckedChange={v => updateRule('auto_escalar_tipo', v)} />
                <div>
                  <Label className="text-sm">Escalar tipo automáticamente</Label>
                  <p className="text-[10px] text-muted-foreground">La IA sugerirá cambiar de registro → amonestación → sanción según historial</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={rule.notificar_encargado_popup} onCheckedChange={v => updateRule('notificar_encargado_popup', v)} />
                <div>
                  <Label className="text-sm">Popup proactivo al encargado</Label>
                  <p className="text-[10px] text-muted-foreground">Mostrar alerta tras registrar una incidencia si se alcanza el umbral</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={rule.ia_analisis_automatico} onCheckedChange={v => updateRule('ia_analisis_automatico', v)} />
                <div>
                  <Label className="text-sm">Análisis automático de la IA</Label>
                  <p className="text-[10px] text-muted-foreground">Evalúa gravedad y recomienda acción en cada nueva incidencia</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={rule.ia_considerar_convenio} onCheckedChange={v => updateRule('ia_considerar_convenio', v)} />
                <div>
                  <Label className="text-sm">Fundamentar en convenio colectivo</Label>
                  <p className="text-[10px] text-muted-foreground">La IA citará artículos relevantes del convenio en sus recomendaciones</p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Aviso preventivo al</Label>
                  <span className="text-sm font-bold text-primary tabular-nums w-10 text-center">{rule.notificar_encargado_umbral_pct}%</span>
                  <Label className="text-xs text-muted-foreground">del umbral</Label>
                  <InfoTip text="Si el umbral es 10 y el porcentaje 80%, se avisará al encargado cuando llegue a 8 incidencias." />
                </div>
                <Slider
                  value={[rule.notificar_encargado_umbral_pct]}
                  onValueChange={([v]) => updateRule('notificar_encargado_umbral_pct', v)}
                  min={50}
                  max={100}
                  step={5}
                  className="w-full max-w-xs"
                />
                <p className="text-[10px] text-muted-foreground italic">
                  Se mostrará un aviso preventivo cuando el trabajador alcance el {rule.notificar_encargado_umbral_pct}% de cualquier umbral configurado.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* ─── E: Alertas de amonestaciones ─── */}
          <div className="space-y-3">
            <SectionHeader
              icon={AlertTriangle}
              title="Escalado por amonestaciones"
              description="Si un trabajador acumula X amonestaciones en Y días, se sugerirá formalizar una sanción."
            />
            <div className="grid grid-cols-2 gap-3 pl-6">
              <div>
                <Label className="text-xs text-muted-foreground">Nº amonestaciones</Label>
                <Input type="number" min={1} value={rule.umbral_amonestaciones} onChange={e => updateRule('umbral_amonestaciones', parseInt(e.target.value) || 3)} className="h-9 rounded-lg mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Periodo (días)</Label>
                <Input type="number" min={7} value={rule.periodo_dias_amonestaciones} onChange={e => updateRule('periodo_dias_amonestaciones', parseInt(e.target.value) || 90)} className="h-9 rounded-lg mt-1" />
              </div>
            </div>
          </div>

          <Separator />

          {/* ─── F: Alertas de despido ─── */}
          <div className="space-y-3">
            <SectionHeader
              icon={ShieldAlert}
              title="🚨 Alertas de despido"
              description="Alerta crítica cuando un trabajador acumula sanciones graves/muy graves suficientes para considerar despido."
            />
            <div className="pl-6 space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={rule.alerta_despido_activa} onCheckedChange={v => updateRule('alerta_despido_activa', v)} />
                <Label className="text-sm">Alertas de despido activas</Label>
              </div>
              {rule.alerta_despido_activa && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Graves para despido</Label>
                    <Input type="number" min={1} value={rule.umbral_graves_despido} onChange={e => updateRule('umbral_graves_despido', parseInt(e.target.value) || 3)} className="h-9 rounded-lg mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Muy graves para despido</Label>
                    <Input type="number" min={1} value={rule.umbral_muy_graves_despido} onChange={e => updateRule('umbral_muy_graves_despido', parseInt(e.target.value) || 1)} className="h-9 rounded-lg mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Periodo (días)</Label>
                    <Input type="number" min={30} value={rule.periodo_dias_despido} onChange={e => updateRule('periodo_dias_despido', parseInt(e.target.value) || 365)} className="h-9 rounded-lg mt-1" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── Cadenas de escalado (independiente) ─── */}
      <div className="space-y-3 rounded-xl border border-border/40 p-4">
        <div className="flex items-center gap-3">
          <Switch checked={rule.activar_escalado_cadenas} onCheckedChange={v => updateRule('activar_escalado_cadenas', v)} />
          <Label className="text-sm font-semibold">Activar cadenas de escalado automático</Label>
        </div>
        {rule.activar_escalado_cadenas && (
          <div className="pt-1">
            <EscaladoRulesEditor
              rules={rule.escalado_reglas || []}
              onChange={onUpdateEscalado}
              categories={categories.filter(c => !c.department_id || c.department_id === dept.id)}
            />
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="pt-2">
        <Button size="sm" className="h-9 rounded-xl gap-1.5" onClick={saveRule} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar reglas
        </Button>
      </div>
    </div>
  );
}

export function DepartmentRulesSection({ departments, rulesMap, setRulesMap, sessionToken, categories = [] }: Props) {
  const [openDepts, setOpenDepts] = useState<Set<string>>(new Set());
  const [deptSearch, setDeptSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const toggleDept = (deptId: string) => {
    setOpenDepts(prev => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  };

  const updateRule = (deptId: string, field: string, value: number | boolean) => {
    setRulesMap(prev => ({
      ...prev,
      [deptId]: { ...prev[deptId], [field]: value },
    }));
  };

  const saveRule = async (deptId: string) => {
    setSaving(deptId);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "saveDepartmentRules",
          sessionToken,
          departmentId: deptId,
          rules: rulesMap[deptId],
        },
      });
      if (data?.success) toast.success("Reglas guardadas");
      else toast.error(data?.error || "Error");
    } catch { toast.error("Error al guardar"); }
    finally { setSaving(null); }
  };

  const filteredDepts = departments.filter(d =>
    d.name.toLowerCase().includes(deptSearch.toLowerCase())
  );
  const configuredCount = departments.filter(d => rulesMap[d.id]?.activar_automatico || rulesMap[d.id]?.activar_escalado_cadenas).length;

  return (
    <Card className="rounded-2xl border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Reglas automáticas por departamento
          </span>
          <Badge variant="secondary" className="text-[10px] px-2 py-0">{departments.length} dptos · {configuredCount} auto</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {departments.length === 0 ? (
          <div className="py-8 flex flex-col items-center text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No hay departamentos configurados</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={deptSearch}
                onChange={e => setDeptSearch(e.target.value)}
                placeholder="Buscar departamento..."
                className="pl-9 h-9 rounded-xl"
              />
            </div>

            {filteredDepts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No se encontraron departamentos</p>
            ) : (
              <div className="space-y-1">
                {filteredDepts.map(dept => {
                  const rule = rulesMap[dept.id];
                  if (!rule) return null;
                  const isOpen = openDepts.has(dept.id);
                  return (
                    <Collapsible key={dept.id} open={isOpen} onOpenChange={() => toggleDept(dept.id)}>
                      <CollapsibleTrigger asChild>
                        <button className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-muted/30 border border-border/30 hover:bg-muted/50 transition-colors text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Building2 className="h-4 w-4 text-primary shrink-0" />
                            <span className="text-sm font-medium">{dept.name}</span>
                            {rule.activar_automatico && (
                              <Badge className="text-[10px] px-2 py-0 bg-emerald-500/10 text-emerald-600 border-0">Auto</Badge>
                            )}
                            {rule.activar_escalado_cadenas && (
                              <Badge className="text-[10px] px-2 py-0 bg-violet-500/10 text-violet-600 border-0">Cadenas</Badge>
                            )}
                            {rule.umbral_combinado_activo && (
                              <Badge className="text-[10px] px-2 py-0 bg-primary/10 text-primary border-0">Combinado</Badge>
                            )}
                            {rule.auto_escalar_tipo && (
                              <Badge className="text-[10px] px-2 py-0 bg-violet-500/10 text-violet-600 border-0">IA</Badge>
                            )}
                          </div>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <DepartmentRulePanel
                          dept={dept}
                          rule={rule}
                          updateRule={(field, value) => updateRule(dept.id, field, value)}
                          onUpdateEscalado={(escaladoRules) => setRulesMap(prev => ({
                            ...prev,
                            [dept.id]: { ...prev[dept.id], escalado_reglas: escaladoRules },
                          }))}
                          saveRule={() => saveRule(dept.id)}
                          saving={saving === dept.id}
                          categories={categories}
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
