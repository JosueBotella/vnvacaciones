import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, CheckCircle2, Calendar as CalendarIcon, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignaturePad } from "@/components/SignaturePad";
import { supabase } from "@/integrations/supabase/client";
import type { IncidenciasUserContext } from "@/modules/control-incidencias/core/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Department {
  id: string;
  name: string;
}

interface Worker {
  id: string;
  nombre: string;
  apellidos: string | null;
  worker_number: string | null;
  worker_code: string | null;
  department_id: string;
  department_name: string;
}

interface Props {
  userContext: IncidenciasUserContext;
}

export function EncargadoSalidaVoluntaria({ userContext }: Props) {
  const sessionToken = localStorage.getItem("manager_session_token") || "";

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [firma, setFirma] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedHour, setSelectedHour] = useState(() => format(new Date(), "HH"));
  const [selectedMinute, setSelectedMinute] = useState(() => format(new Date(), "mm"));

  const fechaStr = format(selectedDate, "dd/MM/yyyy", { locale: es });
  const horaStr = `${selectedHour}:${selectedMinute}`;

  // Load workers using incidencias worker system (same as EncargadoNuevaIncidencia)
  useEffect(() => {
    async function init() {
      try {
        // Get manager's departments
        const deptRes = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "getMyDepartments", sessionToken, targetManagerId: userContext.managerId },
        });
        let depts: Department[] = deptRes.data?.departments || [];

        // Also try all departments (for responsables)
        const allDeptRes = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "listAllDepartmentsForWorkers", sessionToken },
        });
        const allDepts: Department[] = allDeptRes.data?.departments || [];
        const deptsForWorkers = allDepts.length > 0 ? allDepts : depts;

        if (deptsForWorkers.length > 0) {
          const workerResults = await Promise.all(
            deptsForWorkers.map((d: Department) =>
              supabase.functions.invoke("incidencias-operations", {
                body: { action: "listIncidenciasWorkers", sessionToken, departmentId: d.id },
              })
            )
          );
          const deptMap = new Map(deptsForWorkers.map((d: Department) => [d.id, d.name]));
          const allWorkers: Worker[] = [];
          const seenIds = new Set<string>();
          workerResults.forEach((res, idx) => {
            const dept = deptsForWorkers[idx];
            const rawWorkers = res.data?.workers || [];
            rawWorkers.forEach((w: any) => {
              if (!seenIds.has(w.id)) {
                seenIds.add(w.id);
                allWorkers.push({
                  ...w,
                  department_id: dept.id,
                  department_name: deptMap.get(dept.id) || dept.name,
                });
              }
            });
          });
          allWorkers.sort((a, b) => {
            const nameA = [a.nombre, a.apellidos].filter(Boolean).join(" ").toLowerCase();
            const nameB = [b.nombre, b.apellidos].filter(Boolean).join(" ").toLowerCase();
            return nameA.localeCompare(nameB);
          });
          setWorkers(allWorkers);
        }
      } catch (e) {
        console.error("Error loading workers:", e);
      }
      setLoading(false);
    }
    init();
  }, [sessionToken, userContext.managerId]);

  const normalizeStr = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filtered = workers.filter((w) => {
    if (!search) return true;
    const q = normalizeStr(search);
    return (
      normalizeStr(w.nombre).includes(q) ||
      normalizeStr(w.apellidos || "").includes(q) ||
      normalizeStr(`${w.nombre} ${w.apellidos || ""}`).includes(q) ||
      (w.worker_number || "").toLowerCase().includes(q) ||
      (w.worker_code || "").toLowerCase().includes(q)
    );
  });

  const handleSubmit = useCallback(async () => {
    if (!selectedWorker || !firma) return;
    setSubmitting(true);
    try {
      const fechaISO = format(selectedDate, "yyyy-MM-dd");
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "createSalidaVoluntaria",
          sessionToken,
          workerId: selectedWorker.id,
          workerName: `${selectedWorker.nombre} ${selectedWorker.apellidos || ""}`.trim(),
          workerNumber: selectedWorker.worker_number,
          departmentId: selectedWorker.department_id,
          departmentName: selectedWorker.department_name,
          fecha: fechaISO,
          hora: `${horaStr}:00`,
          firmaBase64: firma,
        },
      });
      if (data?.success) {
        setSuccess(true);
        toast.success("Salida voluntaria registrada correctamente");
      } else {
        toast.error(data?.error || "Error al registrar");
      }
    } catch {
      toast.error("Error de conexión");
    }
    setSubmitting(false);
  }, [selectedWorker, firma, sessionToken, selectedDate, horaStr]);

  if (success) {
    return (
      <div className="max-w-lg mx-auto py-16 flex flex-col items-center gap-4 text-center">
        <div className="h-14 w-14 rounded-full border-2 border-primary flex items-center justify-center">
          <CheckCircle2 className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">Salida registrada</h2>
        <p className="text-sm text-muted-foreground">El documento ha sido enviado al departamento de RRHH.</p>
        <Button variant="outline" onClick={() => {
          setSuccess(false);
          setSelectedWorker(null);
          setFirma(null);
          setSearch("");
          setSelectedDate(new Date());
          setSelectedHour(format(new Date(), "HH"));
          setSelectedMinute(format(new Date(), "mm"));
        }}>
          Registrar otra salida
        </Button>
      </div>
    );
  }

  const workerFullName = selectedWorker
    ? `${selectedWorker.nombre} ${selectedWorker.apellidos || ""}`.trim()
    : "[nombre del trabajador]";

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Salida voluntaria</h2>
        <p className="text-sm text-muted-foreground">Registra la salida anticipada de un trabajador antes de completar su jornada laboral.</p>
      </div>

      {/* Worker search */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Trabajador</label>
        {selectedWorker ? (
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="flex-1">
              <p className="text-sm font-medium">{workerFullName}</p>
              <p className="text-xs text-muted-foreground">
                {selectedWorker.worker_number && (
                  <a
                    href={`https://salix.verdnatura.es/#!/worker/${selectedWorker.worker_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    #{selectedWorker.worker_number}
                  </a>
                )}
                {selectedWorker.worker_number && " · "}
                {selectedWorker.department_name}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedWorker(null)}>Cambiar</Button>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, apellidos o número..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : search.length >= 1 ? (
              <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Sin resultados</p>
                ) : filtered.slice(0, 30).map((w) => {
                  const fullName = [w.nombre, w.apellidos].filter(Boolean).join(" ");
                  return (
                    <button
                      key={w.id}
                      onClick={() => { setSelectedWorker(w); setSearch(""); }}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <p className="text-sm font-medium">{fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {w.worker_number && `Nº ${w.worker_number} · `}{w.department_name}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Escribe para buscar trabajador</p>
            )}
          </div>
        )}
      </div>

      {/* Date/Time */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Fecha</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                {fechaStr}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                locale={es}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Hora</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                {horaStr}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 pointer-events-auto" align="start">
              <div className="flex gap-2 items-center">
                <Select value={selectedHour} onValueChange={setSelectedHour}>
                  <SelectTrigger className="w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-lg font-semibold text-muted-foreground">:</span>
                <Select value={selectedMinute} onValueChange={setSelectedMinute}>
                  <SelectTrigger className="w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Legal text */}
      <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
        <h3 className="text-sm font-semibold">Declaración de salida voluntaria</h3>
        <p className="text-sm leading-relaxed">
          Yo, <strong>{workerFullName}</strong>, con fecha <strong>{fechaStr}</strong> a las <strong>{horaStr}</strong> horas,
          declaro voluntariamente mi decisión de abandonar mi puesto de trabajo antes de completar la jornada laboral de 8 horas,
          siendo plenamente consciente de que las horas no trabajadas no serán computadas a efectos retributivos.
        </p>
        <p className="text-sm leading-relaxed">
          Firmo el presente documento en conformidad y sin que medie coacción alguna.
        </p>
      </div>

      {/* Signature */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Firma del trabajador</label>
        <SignaturePad
          onSignatureChange={setFirma}
          signHereLabel="El trabajador firma aquí"
          autoConfirm
        />
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={!selectedWorker || !firma || submitting}
        className="w-full"
        size="lg"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Registrar salida voluntaria
      </Button>
    </div>
  );
}
