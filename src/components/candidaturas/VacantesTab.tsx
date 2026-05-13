import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { getManagerSessionToken } from "@/lib/sessionHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeptPills } from "@/components/DeptPills";
import { toast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Copy, ExternalLink, Link2, Star,
  Car, Bike, Footprints, User, MapPin, Languages, FileText, Accessibility,
  Globe, Brain, Tag, MessageSquare, Sparkles, X,
} from "lucide-react";

type JobPosition = {
  id: string;
  title: string;
  description: string;
  is_active: boolean;
  is_default?: boolean;
  criteria: any;
  created_at: string;
  department_id?: string | null;
  applications?: { count: number }[];
};

type Department = { id: string; name: string };

const DEFAULT_CRITERIA = {
  max_distance_km_car: 40,
  max_distance_km_bike: 15,
  max_distance_km_skate: 8,
  max_distance_km_none: 5,
  min_spanish_level: 2,
  required_keywords: [] as string[],
  preferred_keywords: [] as string[],
  min_age: 18,
  max_age: null as number | null,
  custom_prompt: "",
  preferred_gender: null as string | null,
  prefer_disability: false,
  form_fields: {
    gender: true,
    origin_country: true,
    address: true,
    vehicle: true,
    spanish_level: true,
    cv: true,
    disability: false,
  },
};

interface VacantesTabProps {
  isAdmin?: boolean;
}

export function VacantesTab({ isAdmin = true }: VacantesTabProps) {
  const { t } = useLanguage();
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPosition, setEditingPosition] = useState<JobPosition | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState("all");

  const sessionToken = getManagerSessionToken();

  const callAdmin = useCallback(async (action: string, data?: any) => {
    const { data: res, error } = await supabase.functions.invoke("admin-operations", {
      body: { action, sessionToken, data },
    });
    if (error) throw error;
    if (!res?.success) throw new Error(res?.error || "Error");
    return res;
  }, [sessionToken]);

  useEffect(() => {
    async function loadDepts() {
      try {
        const res = await callAdmin("getManagerDepartments");
        setDepartments(res.departments || []);
        if (res.departments?.length === 1) setSelectedDept(res.departments[0].id);
      } catch (e) { console.error("Failed to load departments", e); }
    }
    loadDepts();
  }, [callAdmin]);

  const fetchPositions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callAdmin("list_job_positions");
      setPositions(res.positions || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [callAdmin]);

  useEffect(() => { fetchPositions(); }, [fetchPositions]);

  const toggleActive = async (pos: JobPosition) => {
    try {
      await callAdmin("toggle_job_position", { id: pos.id, is_active: pos.is_active });
      fetchPositions();
    } catch { toast({ title: "Error", variant: "destructive" }); }
  };

  const deletePosition = async (id: string) => {
    if (!confirm("¿Eliminar esta vacante?")) return;
    try {
      await callAdmin("delete_job_position", { id });
      fetchPositions();
    } catch { toast({ title: "Error", variant: "destructive" }); }
  };

  const duplicatePosition = async (pos: JobPosition) => {
    try {
      await callAdmin("create_job_position", {
        title: pos.title + " (copia)",
        description: pos.description,
        criteria: pos.criteria,
        department_id: pos.department_id,
      });
      fetchPositions();
    } catch { toast({ title: "Error", variant: "destructive" }); }
  };

  const setDefaultPosition = async (pos: JobPosition) => {
    if (pos.is_default) return;
    try {
      await callAdmin("set_default_job_position", { id: pos.id });
      toast({ title: "Vacante predeterminada actualizada" });
      fetchPositions();
    } catch { toast({ title: "Error", variant: "destructive" }); }
  };

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/candidatura?pos=${id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Enlace copiado" });
  };

  const appCount = (pos: JobPosition) => pos.applications?.[0]?.count || 0;

  const filteredPositions = selectedDept === "all"
    ? positions
    : positions.filter(p => p.department_id === selectedDept);

  const deptNameMap = Object.fromEntries(departments.map(d => [d.id, d.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{t("cand_vacantes")}</h3>
        <Button size="sm" onClick={() => { setEditingPosition(null); setIsDialogOpen(true); }}>
          <Plus className="h-4 w-4 me-1" />
          {t("cand_new_position")}
        </Button>
      </div>

      {departments.length > 1 && (
        <DeptPills
          departments={departments}
          selected={selectedDept}
          onChange={setSelectedDept}
          includeAll={isAdmin}
          counts={Object.fromEntries(
            departments.map(d => [d.id, positions.filter(p => p.department_id === d.id).length])
          )}
          totalCount={positions.length}
        />
      )}

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Cargando...</div>
      ) : filteredPositions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No hay vacantes creadas. Crea la primera para empezar a recibir candidaturas.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPositions.map((pos) => (
            <Card key={pos.id} className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm">{pos.title}</h4>
                      <Badge variant={pos.is_active ? "default" : "secondary"} className="text-[10px]">
                        {pos.is_active ? t("cand_active") : t("cand_inactive")}
                      </Badge>
                      {pos.is_default && (
                        <Badge className="text-[10px] gap-1 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/15">
                          <Star className="h-2.5 w-2.5 fill-primary" />
                          Predeterminada
                        </Badge>
                      )}
                      {pos.department_id && deptNameMap[pos.department_id] && (
                        <Badge variant="outline" className="text-[10px]">
                          {deptNameMap[pos.department_id]}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {appCount(pos)} candidaturas
                      </span>
                    </div>
                    {pos.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pos.description}</p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => copyLink(pos.id)}>
                        <Link2 className="h-3 w-3" /> Copiar enlace
                      </Button>
                      <Button
                        variant="outline" size="sm" className="h-7 text-xs gap-1"
                        onClick={() => window.open(`/candidatura?pos=${pos.id}`, "_blank")}
                      >
                        <ExternalLink className="h-3 w-3" /> Ver formulario
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={pos.is_active} onCheckedChange={() => toggleActive(pos)} />
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      title={pos.is_default ? "Vacante predeterminada" : "Marcar como predeterminada"}
                      onClick={() => setDefaultPosition(pos)}
                      disabled={!pos.is_active}
                    >
                      <Star className={`h-3.5 w-3.5 ${pos.is_default ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingPosition(pos); setIsDialogOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicatePosition(pos)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deletePosition(pos.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PositionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        position={editingPosition}
        onSaved={fetchPositions}
        callAdmin={callAdmin}
        departments={departments}
        defaultDepartmentId={selectedDept !== "all" ? selectedDept : departments[0]?.id}
      />
    </div>
  );
}

// ===== SECTION (clean card-style group) =====
function Section({
  title, description, icon: Icon, children,
}: {
  title: string;
  description?: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-start gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
          {description && (
            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{description}</p>
          )}
        </div>
      </header>
      <div className="ps-10 space-y-3">{children}</div>
    </section>
  );
}

const SPANISH_LEVELS = [
  { value: 1, label: "1 — No habla nada" },
  { value: 2, label: "2 — Lo entiende un poco" },
  { value: 3, label: "3 — Habla básico" },
  { value: 4, label: "4 — Habla bien" },
  { value: 5, label: "5 — Nativo / fluido" },
];

// ===== DIALOG =====
function PositionDialog({ open, onOpenChange, position, onSaved, callAdmin, departments, defaultDepartmentId }: {
  open: boolean; onOpenChange: (v: boolean) => void; position: JobPosition | null;
  onSaved: () => void; callAdmin: (action: string, data?: any) => Promise<any>;
  departments: Department[]; defaultDepartmentId?: string;
}) {
  const { t } = useLanguage();
  const isEdit = !!position;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [criteria, setCriteria] = useState({ ...DEFAULT_CRITERIA });
  const [kwInput, setKwInput] = useState({ required: "", preferred: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (position) {
      setTitle(position.title);
      setDescription(position.description);
      setDepartmentId(position.department_id || defaultDepartmentId || "");
      const c = position.criteria || {};
      setCriteria({
        ...DEFAULT_CRITERIA,
        ...c,
        form_fields: { ...DEFAULT_CRITERIA.form_fields, ...(c.form_fields || {}) },
      });
    } else {
      setTitle(""); setDescription(""); setCriteria({ ...DEFAULT_CRITERIA });
      setDepartmentId(defaultDepartmentId || "");
    }
  }, [position, open, defaultDepartmentId]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = { title: title.trim(), description: description.trim(), criteria, department_id: departmentId || null };
      if (isEdit) {
        await callAdmin("update_job_position", { id: position!.id, ...payload });
      } else {
        await callAdmin("create_job_position", payload);
      }
      onSaved(); onOpenChange(false);
      toast({ title: isEdit ? "Vacante actualizada" : "Vacante creada" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const addKw = (type: "required" | "preferred") => {
    const val = kwInput[type].trim();
    if (!val) return;
    const key = type === "required" ? "required_keywords" : "preferred_keywords";
    setCriteria(p => ({ ...p, [key]: [...(p[key] || []), val] }));
    setKwInput(p => ({ ...p, [type]: "" }));
  };

  const removeKw = (type: "required" | "preferred", idx: number) => {
    const key = type === "required" ? "required_keywords" : "preferred_keywords";
    setCriteria(p => ({ ...p, [key]: p[key].filter((_, i) => i !== idx) }));
  };

  const toggleField = (field: string) => {
    setCriteria(p => ({
      ...p,
      form_fields: { ...p.form_fields, [field]: !p.form_fields[field as keyof typeof p.form_fields] },
    }));
  };

  const FORM_FIELDS = [
    { key: "gender", label: "Género", icon: User },
    { key: "origin_country", label: "País de origen", icon: Globe },
    { key: "address", label: "Dirección", icon: MapPin },
    { key: "vehicle", label: "Vehículo", icon: Car },
    { key: "spanish_level", label: "Nivel de español", icon: Languages },
    { key: "cv", label: "Currículum (CV)", icon: FileText },
    { key: "disability", label: "Discapacidad", icon: Accessibility },
  ];

  const DISTANCE_ROWS = [
    { key: "max_distance_km_car", label: "Coche", icon: Car },
    { key: "max_distance_km_bike", label: "Bicicleta", icon: Bike },
    { key: "max_distance_km_skate", label: "Patinete", icon: Footprints },
    { key: "max_distance_km_none", label: "A pie", icon: Footprints },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            {isEdit ? "Editar vacante" : "Nueva vacante"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configura el puesto, qué pedirás a los candidatos y los criterios de filtrado por IA.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {/* 1. Basic */}
          <Section
            title="Información del puesto"
            description="Título y breve descripción que verá el candidato."
            icon={FileText}
          >
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Título del puesto</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ej. Mozo/a de almacén"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Descripción <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder="Resumen breve del puesto, horarios, condiciones…"
                className="resize-none"
              />
            </div>
            {departments.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Departamento</Label>
                <Select value={departmentId || "none"} onValueChange={(v) => setDepartmentId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecciona un departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin departamento</SelectItem>
                    {departments.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </Section>

          <div className="h-px bg-border" />

          {/* 2. Form fields */}
          <Section
            title="¿Qué pedir al candidato?"
            description="Activa solo los campos relevantes. Cuanto menos pidas, más candidatos terminarán el formulario."
            icon={Sparkles}
          >
            <div className="grid grid-cols-2 gap-2">
              {FORM_FIELDS.map(f => {
                const active = criteria.form_fields[f.key as keyof typeof criteria.form_fields] ?? true;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleField(f.key)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all ${
                      active
                        ? "bg-primary/5 border-primary/40"
                        : "bg-muted/20 border-border hover:bg-muted/40"
                    }`}
                  >
                    <f.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-xs font-medium flex-1 leading-tight">{f.label}</span>
                    <Switch checked={active} className="scale-75 pointer-events-none" />
                  </button>
                );
              })}
            </div>
          </Section>

          <div className="h-px bg-border" />

          {/* 3. AI criteria */}
          <Section
            title="Criterios de filtrado IA"
            description="La IA usará estos límites para descartar candidatos automáticamente."
            icon={Brain}
          >
            <div className="space-y-2">
              <Label className="text-xs font-medium">Distancia máxima al trabajo según vehículo</Label>
              <div className="grid grid-cols-2 gap-2">
                {DISTANCE_ROWS.map(d => (
                  <div key={d.key} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border">
                    <d.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs flex-1">{d.label}</span>
                    <Input
                      type="number"
                      value={criteria[d.key as keyof typeof criteria] as number}
                      onChange={e => setCriteria(p => ({ ...p, [d.key]: parseInt(e.target.value) || 0 }))}
                      className="h-7 w-14 text-xs text-center px-1"
                      min={0} max={200}
                    />
                    <span className="text-[10px] text-muted-foreground">km</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3 space-y-1.5">
                <Label className="text-xs font-medium">Nivel mínimo de español</Label>
                <Select
                  value={String(criteria.min_spanish_level)}
                  onValueChange={(v) => setCriteria(p => ({ ...p, min_spanish_level: parseInt(v) }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPANISH_LEVELS.map(l => (
                      <SelectItem key={l.value} value={String(l.value)}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Edad mínima</Label>
                <Input
                  type="number" min={16} max={70}
                  value={criteria.min_age}
                  onChange={e => setCriteria(p => ({ ...p, min_age: parseInt(e.target.value) || 18 }))}
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Edad máxima</Label>
                <Input
                  type="number" min={16} max={70}
                  value={criteria.max_age ?? ""}
                  onChange={e => setCriteria(p => ({ ...p, max_age: e.target.value ? parseInt(e.target.value) : null }))}
                  className="h-10 text-sm"
                  placeholder="Sin límite"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-transparent select-none">.</Label>
                <div className="h-10 flex items-center text-[10px] text-muted-foreground px-1 leading-tight">
                  Deja en blanco para no aplicar límite superior.
                </div>
              </div>
            </div>
          </Section>

          <div className="h-px bg-border" />

          {/* 4. Priorities */}
          <Section
            title="Prioridades"
            description="No descartan candidatos, solo los ordenan mejor en el ranking."
            icon={User}
          >
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Preferencia de género</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: null, label: "Sin preferencia" },
                  { value: "male", label: "Hombres" },
                  { value: "female", label: "Mujeres" },
                ].map(opt => (
                  <Button
                    key={String(opt.value)}
                    variant={criteria.preferred_gender === opt.value ? "default" : "outline"}
                    size="sm" className="h-9 text-xs"
                    onClick={() => setCriteria(p => ({ ...p, preferred_gender: opt.value }))}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border bg-muted/20 cursor-pointer">
              <div className="flex items-center gap-2.5 min-w-0">
                <Accessibility className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-tight">Priorizar candidatos con discapacidad</p>
                  <p className="text-[10px] text-muted-foreground">Suben en el ranking, no se descarta a nadie.</p>
                </div>
              </div>
              <Switch
                checked={criteria.prefer_disability}
                onCheckedChange={v => setCriteria(p => ({ ...p, prefer_disability: v }))}
              />
            </label>
          </Section>

          <div className="h-px bg-border" />

          {/* 5. Keywords */}
          <Section
            title="Palabras clave"
            description="Pulsa Enter para añadir. Las obligatorias son imprescindibles; las preferidas suman puntos."
            icon={Tag}
          >
            {(["required", "preferred"] as const).map(type => {
              const key = `${type}_keywords` as "required_keywords" | "preferred_keywords";
              return (
                <div key={type} className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {type === "required" ? "Obligatorias" : "Preferidas"}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={kwInput[type]}
                      onChange={e => setKwInput(p => ({ ...p, [type]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addKw(type))}
                      className="h-9 text-sm"
                      placeholder={type === "required" ? "Ej. carnet de carretillero" : "Ej. experiencia en almacén"}
                    />
                    <Button size="sm" variant="outline" className="h-9 px-3" onClick={() => addKw(type)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {(criteria[key] || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(criteria[key] || []).map((kw: string, i: number) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-[11px] gap-1 cursor-pointer hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removeKw(type, i)}
                        >
                          {kw}
                          <X className="h-3 w-3" />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Section>

          <div className="h-px bg-border" />

          {/* 6. Custom prompt */}
          <Section
            title="Instrucciones extra a la IA"
            description="Opcional. Indica matices o reglas específicas para esta vacante."
            icon={MessageSquare}
          >
            <Textarea
              value={criteria.custom_prompt}
              onChange={e => setCriteria(p => ({ ...p, custom_prompt: e.target.value }))}
              className="text-sm resize-none"
              rows={4}
              placeholder="Ej. Priorizar candidatos disponibles para turnos de noche y con experiencia en frío."
            />
          </Section>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t px-6 py-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()} className="min-w-[140px]">
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear vacante"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
