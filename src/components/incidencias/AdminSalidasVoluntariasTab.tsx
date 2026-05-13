import { useState, useEffect, useCallback } from "react";
import { Search, Download, Loader2, Calendar as CalendarIcon, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SalidaVoluntaria {
  id: string;
  worker_name: string;
  worker_number: string | null;
  department_name: string | null;
  department_id: string | null;
  manager_name: string;
  fecha: string;
  hora: string;
  firma_base64: string;
  created_at: string;
}

interface Department {
  id: string;
  name: string;
}

export function AdminSalidasVoluntariasTab() {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [salidas, setSalidas] = useState<SalidaVoluntaria[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [previewSalida, setPreviewSalida] = useState<SalidaVoluntaria | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [salidasRes, deptsRes] = await Promise.all([
        supabase.functions.invoke("incidencias-operations", {
          body: {
            action: "listSalidasVoluntarias",
            sessionToken,
            departmentId: deptFilter !== "all" ? deptFilter : undefined,
            search: search || undefined,
            dateFrom: dateFrom ? format(dateFrom, "yyyy-MM-dd") : undefined,
            dateTo: dateTo ? format(dateTo, "yyyy-MM-dd") : undefined,
          },
        }),
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "getMyDepartments", sessionToken },
        }),
      ]);
      setSalidas(salidasRes.data?.salidas || []);
      setDepartments(deptsRes.data?.departments || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [sessionToken, deptFilter, search, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id: string) => {
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "deleteSalidaVoluntaria", sessionToken, salidaId: id },
      });
      if (data?.deleted) {
        setSalidas((prev) => prev.filter((s) => s.id !== id));
        if (previewSalida?.id === id) setPreviewSalida(null);
        toast.success("Salida eliminada");
      } else {
        toast.error("Error al eliminar");
      }
    } catch {
      toast.error("Error de conexión");
    }
  };

  const generatePDF = (s: SalidaVoluntaria) => {
    const fechaFormatted = format(new Date(s.fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es });
    const horaFormatted = s.hora.substring(0, 5);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Salida Voluntaria - ${s.worker_name}</title>
<style>
  @media print { @page { size: portrait; margin: 2cm; } body { -webkit-print-color-adjust: exact; } }
  body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; line-height: 1.6; }
  .header { text-align: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .header p { font-size: 12px; color: #6b7280; margin: 0; }
  .section { margin-bottom: 24px; }
  .section h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; margin-bottom: 12px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .info-item { background: #f9fafb; border-radius: 8px; padding: 12px; }
  .info-item .label { font-size: 11px; color: #6b7280; margin-bottom: 2px; }
  .info-item .value { font-size: 14px; font-weight: 600; }
  .legal-text { background: #f9fafb; border-left: 3px solid #6b7280; padding: 16px 20px; border-radius: 0 8px 8px 0; font-size: 14px; margin: 24px 0; }
  .signature-section { margin-top: 40px; text-align: center; }
  .signature-section img { max-width: 300px; max-height: 120px; margin: 12px auto; display: block; }
  .signature-label { font-size: 11px; color: #6b7280; border-top: 1px solid #d1d5db; padding-top: 8px; display: inline-block; min-width: 200px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
</style></head><body>
  <div class="header">
    <h1>Documento de salida voluntaria</h1>
    <p>Registro interno de abandono anticipado de puesto de trabajo</p>
  </div>
  <div class="section">
    <h2>Datos del trabajador</h2>
    <div class="info-grid">
      <div class="info-item"><div class="label">Nombre completo</div><div class="value">${s.worker_name}</div></div>
      <div class="info-item"><div class="label">N.º trabajador</div><div class="value">${s.worker_number || "—"}</div></div>
      <div class="info-item"><div class="label">Departamento</div><div class="value">${s.department_name || "—"}</div></div>
      <div class="info-item"><div class="label">Fecha y hora de salida</div><div class="value">${fechaFormatted} a las ${horaFormatted}h</div></div>
    </div>
  </div>
  <div class="section">
    <h2>Declaración</h2>
    <div class="legal-text">
      Yo, <strong>${s.worker_name}</strong>, con fecha <strong>${fechaFormatted}</strong> a las <strong>${horaFormatted}</strong> horas,
      declaro voluntariamente mi decisión de abandonar mi puesto de trabajo antes de completar la jornada laboral de 8 horas,
      siendo plenamente consciente de que las horas no trabajadas no serán computadas a efectos retributivos.<br><br>
      Firmo el presente documento en conformidad y sin que medie coacción alguna.
    </div>
  </div>
  <div class="signature-section">
    <h2 style="font-size:13px;font-weight:600;text-transform:uppercase;color:#6b7280;letter-spacing:0.5px;margin-bottom:8px;">Firma del trabajador</h2>
    <img src="${s.firma_base64}" alt="Firma" />
    <div class="signature-label">${s.worker_name}</div>
  </div>
  <div class="footer">
    Registrado por: ${s.manager_name} · Generado el ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}
  </div>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 400);
    }
  };

  const renderPreviewContent = (s: SalidaVoluntaria) => {
    const fechaFormatted = format(new Date(s.fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es });
    const horaFormatted = s.hora.substring(0, 5);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-[11px] text-muted-foreground">Nombre completo</p>
            <p className="text-sm font-semibold">{s.worker_name}</p>
          </div>
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-[11px] text-muted-foreground">N.º trabajador</p>
            <p className="text-sm font-semibold">
              {s.worker_number ? (
                <a href={`https://salix.verdnatura.es/#!/worker/${s.worker_number}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {s.worker_number}
                </a>
              ) : "—"}
            </p>
          </div>
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-[11px] text-muted-foreground">Departamento</p>
            <p className="text-sm font-semibold">{s.department_name || "—"}</p>
          </div>
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-[11px] text-muted-foreground">Fecha y hora</p>
            <p className="text-sm font-semibold">{fechaFormatted} a las {horaFormatted}h</p>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Declaración</h3>
          <p className="text-sm leading-relaxed">
            Yo, <strong>{s.worker_name}</strong>, con fecha <strong>{fechaFormatted}</strong> a las <strong>{horaFormatted}</strong> horas,
            declaro voluntariamente mi decisión de abandonar mi puesto de trabajo antes de completar la jornada laboral de 8 horas,
            siendo plenamente consciente de que las horas no trabajadas no serán computadas a efectos retributivos.
          </p>
          <p className="text-sm leading-relaxed">
            Firmo el presente documento en conformidad y sin que medie coacción alguna.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Firma del trabajador</h3>
          <div className="rounded-lg border bg-white p-4 flex justify-center">
            <img src={s.firma_base64} alt="Firma" className="max-h-28 object-contain" />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          Registrado por: {s.manager_name} · {format(new Date(s.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
        </p>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => generatePDF(s)}>
            <Download className="h-4 w-4 mr-1.5" />
            Descargar PDF
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar salida voluntaria</AlertDialogTitle>
                <AlertDialogDescription>
                  Se eliminará permanentemente el registro de {s.worker_name}. Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDelete(s.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <h2 className="text-lg font-semibold">Salidas voluntarias</h2>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar trabajador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Departamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los departamentos</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("text-xs", dateFrom && "text-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5 mr-1" />
              {dateFrom ? format(dateFrom, "dd/MM/yy") : "Desde"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("text-xs", dateTo && "text-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5 mr-1" />
              {dateTo ? format(dateTo, "dd/MM/yy") : "Hasta"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
            Limpiar fechas
          </Button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : salidas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No se encontraron salidas voluntarias.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trabajador</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Encargado</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salidas.map((s) => (
              <TableRow key={s.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setPreviewSalida(s)}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{s.worker_name}</p>
                    {s.worker_number && (
                      <a
                        href={`https://salix.verdnatura.es/#!/worker/${s.worker_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        #{s.worker_number}
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{s.department_name || "—"}</TableCell>
                <TableCell className="text-sm">{format(new Date(s.fecha + "T00:00:00"), "dd/MM/yyyy")}</TableCell>
                <TableCell className="text-sm">{s.hora.substring(0, 5)}</TableCell>
                <TableCell className="text-sm">{s.manager_name}</TableCell>
                <TableCell>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => generatePDF(s)} title="Descargar PDF">
                      <Download className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" title="Eliminar" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminar salida voluntaria</AlertDialogTitle>
                          <AlertDialogDescription>
                            Se eliminará permanentemente el registro de {s.worker_name}. Esta acción no se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(s.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewSalida} onOpenChange={(open) => !open && setPreviewSalida(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Salida voluntaria</DialogTitle>
          </DialogHeader>
          {previewSalida && renderPreviewContent(previewSalida)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
