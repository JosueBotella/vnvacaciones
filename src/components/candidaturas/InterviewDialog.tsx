import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getManagerSessionToken } from "@/lib/sessionHelpers";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  CalendarIcon,
  Loader2,
  FileText,
  Check,
  ChevronsUpDown,
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  Briefcase,
  Clock,
  Upload,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Department = { id: string; name: string };
type JobPosition = { id: string; title: string; department_id: string | null };
type AssignableManager = { id: string; name: string; avatar_url: string | null };

type Interview = {
  id?: string;
  scheduled_at?: string;
  duration_minutes?: number | null;
  room?: string | null;
  additional_info?: string | null;
  candidate_name?: string;
  candidate_email?: string | null;
  candidate_phone?: string | null;
  department_id?: string | null;
  custom_department?: string | null;
  job_position_id?: string | null;
  cv_file_url?: string | null;
  assigned_manager_id?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  interview?: Interview | null;
  departments: Department[];
  onSaved: () => void;
};

const OTHER_DEPT = "__other";

export function InterviewDialog({ open, onOpenChange, interview, departments, onSaved }: Props) {
  const isEdit = !!interview?.id;
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState<number>(30);
  const [room, setRoom] = useState("");
  const [info, setInfo] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [deptId, setDeptId] = useState<string>("");
  const [customDept, setCustomDept] = useState<string>("");
  const [jobId, setJobId] = useState<string>("__none");
  const [assignedId, setAssignedId] = useState<string>("__none");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [jobs, setJobs] = useState<JobPosition[]>([]);
  const [, setDeptManagers] = useState<AssignableManager[]>([]);
  const [saving, setSaving] = useState(false);
  const [deptOpen, setDeptOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCvFile(null);
    if (interview) {
      const dt = interview.scheduled_at ? new Date(interview.scheduled_at) : undefined;
      setDate(dt);
      setTime(dt ? format(dt, "HH:mm") : "10:00");
      setDuration(interview.duration_minutes ?? 30);
      setRoom(interview.room || "");
      setInfo(interview.additional_info || "");
      setName(interview.candidate_name || "");
      setEmail(interview.candidate_email || "");
      setPhone(interview.candidate_phone || "");
      if (interview.department_id) {
        setDeptId(interview.department_id);
        setCustomDept("");
      } else if (interview.custom_department) {
        setDeptId(OTHER_DEPT);
        setCustomDept(interview.custom_department);
      } else {
        setDeptId("");
        setCustomDept("");
      }
      setJobId(interview.job_position_id || "__none");
      setAssignedId(interview.assigned_manager_id || "__none");
    } else {
      setDate(undefined);
      setTime("10:00");
      setDuration(30);
      setRoom("");
      setInfo("");
      setName("");
      setEmail("");
      setPhone("");
      setDeptId("");
      setCustomDept("");
      setJobId("__none");
      setAssignedId("__none");
    }
  }, [open, interview]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("job_positions")
        .select("id, title, department_id")
        .eq("is_active", true)
        .order("title");
      setJobs((data as any) || []);
    })();
  }, [open]);

  useEffect(() => {
    if (!open || !deptId || deptId === OTHER_DEPT) {
      setDeptManagers([]);
      return;
    }
    (async () => {
      try {
        const sessionToken = getManagerSessionToken();
        const { data } = await supabase.functions.invoke("interviews-operations", {
          body: { action: "listDepartmentManagers", sessionToken, department_id: deptId },
        });
        if (data?.success) setDeptManagers(data.managers || []);
      } catch {
        /* ignore */
      }
    })();
  }, [open, deptId]);

  const filteredJobs =
    deptId && deptId !== OTHER_DEPT ? jobs.filter((j) => !j.department_id || j.department_id === deptId) : jobs;

  const fileToBase64 = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(f);
    });

  const selectedDeptLabel =
    deptId === OTHER_DEPT
      ? "Otro departamento"
      : deptId
        ? departments.find((d) => d.id === deptId)?.name || "Selecciona"
        : "Selecciona";

  const handleSave = async () => {
    if (!date || !name.trim()) {
      toast.error("Fecha y nombre del candidato son obligatorios");
      return;
    }
    if (deptId === OTHER_DEPT && !customDept.trim()) {
      toast.error("Escribe el nombre del departamento");
      return;
    }
    setSaving(true);
    try {
      const [hh, mm] = time.split(":");
      const scheduled = new Date(date);
      scheduled.setHours(parseInt(hh) || 10, parseInt(mm) || 0, 0, 0);

      const payload: any = {
        scheduled_at: scheduled.toISOString(),
        duration_minutes: duration,
        room: room.trim() || null,
        additional_info: info.trim() || null,
        candidate_name: name.trim(),
        candidate_email: email.trim() || null,
        candidate_phone: phone.trim() || null,
        department_id: deptId && deptId !== OTHER_DEPT ? deptId : null,
        custom_department: deptId === OTHER_DEPT ? customDept.trim() : null,
        job_position_id: jobId !== "__none" ? jobId : null,
        assigned_manager_id: assignedId !== "__none" ? assignedId : null,
      };

      let cvBase64: string | undefined;
      let cvFileName: string | undefined;
      let cvMimeType: string | undefined;
      if (cvFile) {
        cvBase64 = await fileToBase64(cvFile);
        cvFileName = cvFile.name;
        cvMimeType = cvFile.type;
      }

      const sessionToken = getManagerSessionToken();
      const action = isEdit ? "update" : "create";
      const body: any = { action, sessionToken };
      if (isEdit) {
        body.id = interview!.id;
        body.patch = payload;
      } else {
        body.interview = payload;
      }
      if (cvBase64) {
        body.cvBase64 = cvBase64;
        body.cvFileName = cvFileName;
        body.cvMimeType = cvMimeType;
      }

      const { data, error } = await supabase.functions.invoke("interviews-operations", { body });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Error");
      toast.success(isEdit ? "Entrevista actualizada" : "Entrevista creada");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            {isEdit ? "Editar entrevista" : "Nueva entrevista"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {isEdit ? "Actualiza los datos de la entrevista" : "Programa una nueva entrevista con un candidato"}
          </p>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {/* SECCIÓN: Fecha y hora */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Cita
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1 h-4">
                  <CalendarIcon className="h-3 w-3" /> Fecha
                </Label>
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-10 rounded-xl",
                        !date && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 opacity-60" />
                      {date ? format(date, "d MMM yyyy", { locale: es }) : "Selecciona"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(d) => {
                        setDate(d);
                        setDateOpen(false);
                      }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1 h-4">
                  <Clock className="h-3 w-3" /> Hora
                </Label>
                <TimePicker value={time} onChange={setTime} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Duración</Label>
              <div className="inline-flex w-full rounded-xl bg-muted/50 p-1 border border-border/30">
                {[30, 45, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDuration(m)}
                    className={cn(
                      "flex-1 px-4 py-1.5 text-xs font-medium rounded-lg transition-all",
                      duration === m
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m === 60 ? "1 hora" : `${m} min`}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* SECCIÓN: Ubicación y puesto */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3 w-3" /> Contexto
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1 h-4">
                  <MapPin className="h-3 w-3" /> Sala
                </Label>
                <Input
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="Ej. Sala A"
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1 h-4">
                  <Building2 className="h-3 w-3" /> Departamento
                </Label>
                <Popover open={deptOpen} onOpenChange={setDeptOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={deptOpen}
                      className={cn(
                        "w-full justify-between h-10 rounded-xl font-normal",
                        !deptId && "text-muted-foreground",
                      )}
                    >
                      <span className="truncate">{selectedDeptLabel}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>Sin resultados</CommandEmpty>
                        <CommandGroup>
                          {departments.map((d) => (
                            <CommandItem
                              key={d.id}
                              value={d.name}
                              onSelect={() => {
                                setDeptId(d.id);
                                setCustomDept("");
                                setDeptOpen(false);
                              }}
                            >
                              <Check
                                className={cn("mr-2 h-4 w-4", deptId === d.id ? "opacity-100" : "opacity-0")}
                              />
                              {d.name}
                            </CommandItem>
                          ))}
                          <CommandItem
                            value="__other_otro_personalizado"
                            onSelect={() => {
                              setDeptId(OTHER_DEPT);
                              setDeptOpen(false);
                            }}
                            className="border-t border-border/40 mt-1 pt-2"
                          >
                            <Pencil className="mr-2 h-4 w-4 opacity-60" />
                            <span className="font-medium">Otro (escribir)…</span>
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {deptId === OTHER_DEPT && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <Label className="text-xs text-muted-foreground">Nombre del departamento</Label>
                <Input
                  value={customDept}
                  onChange={(e) => setCustomDept(e.target.value)}
                  placeholder="Escribe el departamento (no aparece en la lista)"
                  className="h-10 rounded-xl"
                  autoFocus
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> Vacante (opcional)
              </Label>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Sin vacante asociada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Sin vacante —</SelectItem>
                  {filteredJobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* SECCIÓN: Candidato */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <User className="h-3 w-3" /> Candidato
            </h3>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Nombre completo <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. María García"
                className="h-10 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                </Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="opcional"
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Teléfono
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="opcional"
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="h-3 w-3" /> CV (PDF/DOC)
              </Label>
              <label className="flex items-center gap-3 px-3 h-10 rounded-xl border border-dashed border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
                <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate flex-1">
                  {cvFile
                    ? cvFile.name
                    : interview?.cv_file_url
                      ? "CV existente — sube uno para reemplazar"
                      : "Selecciona un archivo"}
                </span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf"
                  onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Información adicional</Label>
              <Textarea
                value={info}
                onChange={(e) => setInfo(e.target.value)}
                rows={3}
                placeholder="Notas, requisitos, contexto…"
                className="rounded-xl resize-none"
              />
            </div>
          </section>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/40 bg-muted/20">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-xl">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Guardar cambios" : "Crear entrevista"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============= TimePicker =============
// Selector de hora custom (07:00 → 21:45 en pasos de 15 min) integrado al diseño,
// evita el picker nativo del navegador que rompe la estética dark/minimal.
function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);

  const slots: string[] = [];
  for (let h = 7; h <= 21; h++) {
    for (const m of [0, 15, 30, 45]) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start text-left font-normal h-10 rounded-xl"
        >
          <Clock className="mr-2 h-4 w-4 opacity-60" />
          <span className="tabular-nums">{value || "—"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0 rounded-xl overflow-hidden"
        align="start"
      >
        <div className="max-h-64 overflow-y-auto py-1">
          {slots.map((s) => {
            const active = s === value;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className={cn(
                  "w-full px-3 py-2 text-sm text-left tabular-nums transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted/60 text-foreground",
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

