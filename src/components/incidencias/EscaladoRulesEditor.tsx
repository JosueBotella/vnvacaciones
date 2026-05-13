import { useState } from "react";
import { Plus, Trash2, ArrowRight, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface EscaladoRule {
  id: string;
  categoria_id: string | null;
  gravedad_origen: "cualquiera" | "leve" | "moderada" | "grave" | "muy_grave";
  tipo_origen: "incidencia" | "amonestacion";
  umbral_cantidad: number;
  periodo_dias: number;
  accion_resultado: "amonestacion" | "sancion_leve" | "sancion_grave" | "sancion_muy_grave";
  dias_suspension: number | null;
  requiere_misma_razon: boolean;
  requiere_previa: string | null;
  activa: boolean;
}

export const DEFAULT_ESCALADO_RULE: Omit<EscaladoRule, "id"> = {
  categoria_id: null,
  gravedad_origen: "cualquiera",
  tipo_origen: "incidencia",
  umbral_cantidad: 5,
  periodo_dias: 90,
  accion_resultado: "amonestacion",
  dias_suspension: null,
  requiere_misma_razon: false,
  requiere_previa: null,
  activa: true,
};

interface Props {
  rules: EscaladoRule[];
  onChange: (rules: EscaladoRule[]) => void;
  categories?: Array<{ id: string; name: string; gravedad?: string; department_id?: string | null }>;
}

const TIPO_ORIGEN_LABELS: Record<string, string> = {
  incidencia: "Incidencias",
  amonestacion: "Amonestaciones",
};

const ACCION_LABELS: Record<string, { label: string; color: string }> = {
  amonestacion: { label: "Amonestación", color: "bg-amber-500/10 text-amber-600" },
  sancion_leve: { label: "Sanción leve", color: "bg-orange-500/10 text-orange-600" },
  sancion_grave: { label: "Sanción grave", color: "bg-red-500/10 text-red-600" },
  sancion_muy_grave: { label: "Sanción muy grave", color: "bg-red-700/10 text-red-700" },
};

export function EscaladoRulesEditor({ rules, onChange, categories = [] }: Props) {
  const addRule = () => {
    onChange([
      ...rules,
      { ...DEFAULT_ESCALADO_RULE, id: crypto.randomUUID() },
    ]);
  };

  const updateRule = (id: string, field: string, value: unknown) => {
    onChange(
      rules.map((r) =>
        r.id === id ? { ...r, [field]: value } : r
      )
    );
  };

  const removeRule = (id: string) => {
    onChange(rules.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            Cadenas de escalado automático
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Define reglas para crear automáticamente amonestaciones o sanciones cuando se alcancen umbrales.
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-7 rounded-lg gap-1 text-xs" onClick={addRule}>
          <Plus className="h-3 w-3" /> Añadir regla
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="py-6 text-center border border-dashed border-border/50 rounded-xl">
          <p className="text-xs text-muted-foreground">No hay reglas de escalado configuradas</p>
          <Button size="sm" variant="ghost" className="mt-2 text-xs gap-1" onClick={addRule}>
            <Plus className="h-3 w-3" /> Crear primera regla
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, idx) => (
            <Card key={rule.id} className={cn("rounded-xl border transition-colors", rule.activa ? "border-border/50" : "border-border/20 opacity-60")}>
              <CardContent className="p-3 space-y-3">
                {/* Header row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] px-2 py-0">#{idx + 1}</Badge>
                    <Switch
                      checked={rule.activa}
                      onCheckedChange={(v) => updateRule(rule.id, "activa", v)}
                    />
                    <span className="text-[10px] text-muted-foreground">{rule.activa ? "Activa" : "Inactiva"}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => removeRule(rule.id)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>

                {/* Rule description row */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Si acumula</span>
                  <Input
                    type="number"
                    min={1}
                    value={rule.umbral_cantidad}
                    onChange={(e) => updateRule(rule.id, "umbral_cantidad", parseInt(e.target.value) || 1)}
                    className="h-7 w-16 rounded-lg text-center text-xs"
                  />
                  <Select
                    value={rule.tipo_origen}
                    onValueChange={(v) => updateRule(rule.id, "tipo_origen", v)}
                  >
                    <SelectTrigger className="h-7 w-[140px] rounded-lg text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="incidencia">incidencias</SelectItem>
                      <SelectItem value="amonestacion">amonestaciones</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">en</span>
                  <Input
                    type="number"
                    min={1}
                    value={rule.periodo_dias}
                    onChange={(e) => updateRule(rule.id, "periodo_dias", parseInt(e.target.value) || 30)}
                    className="h-7 w-16 rounded-lg text-center text-xs"
                  />
                  <span className="text-muted-foreground">días</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <Select
                    value={rule.accion_resultado}
                    onValueChange={(v) => updateRule(rule.id, "accion_resultado", v)}
                  >
                    <SelectTrigger className="h-7 w-[160px] rounded-lg text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amonestacion">Amonestación</SelectItem>
                      <SelectItem value="sancion_leve">Sanción leve</SelectItem>
                      <SelectItem value="sancion_grave">Sanción grave</SelectItem>
                      <SelectItem value="sancion_muy_grave">Sanción muy grave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Suspension days (if sancion) */}
                {rule.accion_resultado !== "amonestacion" && (
                  <div className="flex items-center gap-2 text-xs pl-2">
                    <span className="text-muted-foreground">Días de suspensión:</span>
                    <Input
                      type="number"
                      min={0}
                      value={rule.dias_suspension ?? 0}
                      onChange={(e) => updateRule(rule.id, "dias_suspension", parseInt(e.target.value) || 0)}
                      className="h-7 w-16 rounded-lg text-center text-xs"
                    />
                  </div>
                )}

                {/* Category filter */}
                <div className="flex flex-wrap items-center gap-2 text-xs pl-2">
                  <span className="text-muted-foreground">Categoría:</span>
                  <Select
                    value={rule.categoria_id || "__any__"}
                    onValueChange={(v) => updateRule(rule.id, "categoria_id", v === "__any__" ? null : v)}
                  >
                    <SelectTrigger className="h-7 w-[200px] rounded-lg text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Cualquier categoría</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.gravedad ? ` (${c.gravedad === 'muy_grave' ? 'Muy grave' : c.gravedad === 'grave' ? 'Grave' : c.gravedad === 'moderada' ? 'Moderada' : 'Leve'})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <span className="text-muted-foreground ml-2">Gravedad:</span>
                  <Select
                    value={rule.gravedad_origen || "cualquiera"}
                    onValueChange={(v) => updateRule(rule.id, "gravedad_origen", v)}
                  >
                    <SelectTrigger className="h-7 w-[150px] rounded-lg text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cualquiera">Cualquiera</SelectItem>
                      <SelectItem value="leve">Leve</SelectItem>
                      <SelectItem value="moderada">Moderada</SelectItem>
                      <SelectItem value="grave">Grave</SelectItem>
                      <SelectItem value="muy_grave">Muy grave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Options row */}
                <div className="flex flex-wrap items-center gap-4 text-xs pl-2">
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={rule.requiere_misma_razon}
                      onCheckedChange={(v) => updateRule(rule.id, "requiere_misma_razon", v)}
                    />
                    <Label className="text-xs text-muted-foreground">Misma categoría</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={rule.requiere_previa || "__none__"}
                      onValueChange={(v) => updateRule(rule.id, "requiere_previa", v === "__none__" ? null : v)}
                    >
                      <SelectTrigger className="h-7 w-[180px] rounded-lg text-xs">
                        <SelectValue placeholder="Sin requisito previo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin requisito previo</SelectItem>
                        <SelectItem value="amonestacion">Requiere amonestación previa</SelectItem>
                        <SelectItem value="sancion_leve">Requiere sanción leve previa</SelectItem>
                        <SelectItem value="sancion_grave">Requiere sanción grave previa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Summary badge */}
                <div className="pt-1">
                  <Badge className={cn("text-[10px] px-2 py-0.5 border-0", ACCION_LABELS[rule.accion_resultado]?.color)}>
                    {rule.umbral_cantidad} {TIPO_ORIGEN_LABELS[rule.tipo_origen]} 
                    {rule.gravedad_origen && rule.gravedad_origen !== "cualquiera" ? ` (${rule.gravedad_origen === 'muy_grave' ? 'muy graves' : rule.gravedad_origen + 's'})` : ''}
                    {' '}en {rule.periodo_dias}d → {ACCION_LABELS[rule.accion_resultado]?.label}
                    {rule.dias_suspension && rule.accion_resultado !== "amonestacion" ? ` (${rule.dias_suspension}d)` : ""}
                    {rule.requiere_misma_razon ? " · misma razón" : ""}
                    {rule.requiere_previa ? ` · req. ${rule.requiere_previa}` : ""}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
