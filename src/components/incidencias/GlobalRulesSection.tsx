import { useState, useEffect, useCallback } from "react";
import { Save, Loader2, Globe, Zap, Scale, Gauge, Brain, AlertTriangle, ShieldAlert, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EscaladoRulesEditor, type EscaladoRule, DEFAULT_ESCALADO_RULE } from "./EscaladoRulesEditor";
import { ChevronDown } from "lucide-react";

interface GlobalRule {
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

const DEFAULT_GLOBAL: GlobalRule = {
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

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface Props {
  sessionToken: string;
  categories?: Array<{ id: string; name: string; gravedad?: string; department_id?: string | null }>;
}

export function GlobalRulesSection({ sessionToken, categories = [] }: Props) {
  const [rule, setRule] = useState<GlobalRule>(DEFAULT_GLOBAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getGlobalRules", sessionToken },
      });
      if (data?.rule) {
        const r = data.rule;
        setRule({
          ...DEFAULT_GLOBAL,
          ...r,
          escalado_reglas: Array.isArray(r.escalado_reglas) ? r.escalado_reglas : [],
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  const update = (field: string, value: number | boolean) => {
    setRule((prev) => ({ ...prev, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "saveGlobalRules", sessionToken, rules: rule },
      });
      if (data?.success) toast.success("Reglas globales guardadas");
      else toast.error(data?.error || "Error");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="rounded-2xl border-border/50">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-primary/20 bg-primary/[0.02]">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-2xl">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                Reglas globales (todos los departamentos)
              </span>
              <div className="flex items-center gap-2">
                {rule.activar_automatico && (
                  <Badge className="text-[10px] px-2 py-0 bg-emerald-500/10 text-emerald-600 border-0">Auto</Badge>
                )}
                {rule.activar_escalado_cadenas && (
                  <Badge className="text-[10px] px-2 py-0 bg-violet-500/10 text-violet-600 border-0">Cadenas</Badge>
                )}
                <Badge variant="secondary" className="text-[10px] px-2 py-0">
                  {(rule.escalado_reglas || []).length} cadenas
                </Badge>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-5 pt-2">
            <p className="text-[10px] text-muted-foreground">
              Las reglas globales se aplican a todos los departamentos como base. Las reglas por departamento las sobreescriben cuando existen.
            </p>

            {/* ─── Sección 1: Reglas automáticas ─── */}
            <div className="space-y-3 rounded-xl border border-border/40 p-4">
              <div className="flex items-center gap-3">
                <Switch checked={rule.activar_automatico} onCheckedChange={(v) => update("activar_automatico", v)} />
                <Label className="text-sm font-semibold">Activar reglas globales automáticas</Label>
              </div>

              {rule.activar_automatico && (
                <div className="space-y-4 pt-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Periodo de evaluación</Label>
                    <Input type="number" min={7} max={730} value={rule.periodo_dias_evaluacion} onChange={(e) => update("periodo_dias_evaluacion", parseInt(e.target.value) || 90)} className="h-8 rounded-lg w-20 text-center" />
                    <span className="text-xs text-muted-foreground">días</span>
                  </div>

                  <Separator />

                  {/* Umbrales individuales */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold flex items-center gap-2">
                      <Gauge className="h-4 w-4 text-primary" /> Umbrales individuales
                    </p>
                    <div className="grid grid-cols-3 gap-3 pl-6">
                      <div>
                        <Label className="text-xs text-muted-foreground">Leves</Label>
                        <Input type="number" min={0} value={rule.umbral_leves} onChange={(e) => update("umbral_leves", parseInt(e.target.value) || 0)} className="h-9 rounded-lg mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Graves</Label>
                        <Input type="number" min={0} value={rule.umbral_graves} onChange={(e) => update("umbral_graves", parseInt(e.target.value) || 0)} className="h-9 rounded-lg mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Muy graves</Label>
                        <Input type="number" min={0} value={rule.umbral_muy_graves} onChange={(e) => update("umbral_muy_graves", parseInt(e.target.value) || 0)} className="h-9 rounded-lg mt-1" />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Escalado por amonestaciones */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-primary" /> Escalado por amonestaciones
                    </p>
                    <div className="grid grid-cols-2 gap-3 pl-6">
                      <div>
                        <Label className="text-xs text-muted-foreground">Nº amonestaciones</Label>
                        <Input type="number" min={1} value={rule.umbral_amonestaciones} onChange={(e) => update("umbral_amonestaciones", parseInt(e.target.value) || 3)} className="h-9 rounded-lg mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Periodo (días)</Label>
                        <Input type="number" min={7} value={rule.periodo_dias_amonestaciones} onChange={(e) => update("periodo_dias_amonestaciones", parseInt(e.target.value) || 90)} className="h-9 rounded-lg mt-1" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* ─── Sección 2: Cadenas de escalado automático ─── */}
            <div className="space-y-3 rounded-xl border border-border/40 p-4">
              <div className="flex items-center gap-3">
                <Switch checked={rule.activar_escalado_cadenas} onCheckedChange={(v) => update("activar_escalado_cadenas", v)} />
                <Label className="text-sm font-semibold">Activar cadenas de escalado automático</Label>
              </div>

              {rule.activar_escalado_cadenas && (
                <div className="pt-1">
                  <EscaladoRulesEditor
                    rules={rule.escalado_reglas || []}
                    onChange={(newRules) => setRule((prev) => ({ ...prev, escalado_reglas: newRules }))}
                    categories={categories}
                  />
                </div>
              )}
            </div>

            {/* Save */}
            <Button size="sm" className="h-9 rounded-xl gap-1.5" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar reglas globales
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
