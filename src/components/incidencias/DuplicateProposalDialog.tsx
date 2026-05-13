import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Loader2, Search } from "lucide-react";
import { getManagerSessionToken } from "@/lib/sessionHelpers";

type Worker = { id: string; name: string };

type Propuesta = {
  id: string;
  tipo: string;
  gravedad: string;
  suspension_dias?: number | null;
  record?: any;
};

interface Props {
  propuesta: Propuesta | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDuplicated?: () => void;
}

export default function DuplicateProposalDialog({ propuesta, open, onOpenChange, onDuplicated }: Props) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const departmentId: string | null = propuesta?.record?.department_id || (propuesta as any)?.department_id || null;
  const currentWorkerId: string | null = useMemo(() => {
    if (!propuesta) return null;
    const rw = propuesta.record?.incidencias_record_workers;
    if (Array.isArray(rw) && rw.length > 0) return rw[0].worker_id || null;
    return (propuesta as any).target_worker_id || null;
  }, [propuesta]);
  const currentWorkerName: string = useMemo(() => {
    const rw = propuesta?.record?.incidencias_record_workers;
    if (Array.isArray(rw) && rw.length > 0) return rw[0].worker_name || "—";
    return "—";
  }, [propuesta]);

  useEffect(() => {
    if (!open || !departmentId) return;
    setSelected(null);
    setSearch("");
    setLoadingWorkers(true);
    supabase
      .rpc("get_public_workers_by_department", { p_department_id: departmentId })
      .then(({ data, error }) => {
        if (error) {
          toast.error("Error cargando trabajadores");
          setWorkers([]);
        } else {
          const list = (data || [])
            .filter((w: any) => w.id !== currentWorkerId)
            .map((w: any) => ({ id: w.id, name: w.name }))
            .sort((a: Worker, b: Worker) => a.name.localeCompare(b.name));
          setWorkers(list);
        }
      })
      .then(() => setLoadingWorkers(false));
  }, [open, departmentId, currentWorkerId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(w => w.name.toLowerCase().includes(q));
  }, [workers, search]);

  const handleDuplicate = async () => {
    if (!propuesta || !selected) return;
    const sessionToken = getManagerSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "duplicateProposalToWorker",
          sessionToken,
          propuestaId: propuesta.id,
          newWorkerId: selected,
        },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "Error duplicando propuesta");
        return;
      }
      toast.success("Propuesta duplicada. La IA está analizando…");
      onOpenChange(false);
      onDuplicated?.();
    } catch (e: any) {
      toast.error(e?.message || "Error duplicando propuesta");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" /> Duplicar propuesta
          </DialogTitle>
          <DialogDescription>
            Se creará una incidencia y propuesta independientes con las mismas pruebas, fecha,
            descripción, categoría y configuración. La IA y el documento legal se generarán
            automáticamente.
          </DialogDescription>
        </DialogHeader>

        {propuesta && (
          <div className="text-xs text-muted-foreground rounded-md border p-2 space-y-0.5">
            <div><span className="font-medium text-foreground">Original:</span> {currentWorkerName}</div>
            <div className="capitalize">{propuesta.tipo} · {propuesta.gravedad}{propuesta.suspension_dias ? ` · ${propuesta.suspension_dias}d` : ''}</div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs">Nuevo trabajador (mismo departamento)</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar trabajador…"
              className="pl-7 h-8 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
            {loadingWorkers ? (
              <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Sin resultados</div>
            ) : (
              filtered.map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelected(w.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${selected === w.id ? 'bg-accent' : ''}`}
                >
                  {w.name}
                </button>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleDuplicate} disabled={!selected || submitting}>
            {submitting ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Duplicando…</> : <><Copy className="h-3.5 w-3.5 mr-2" /> Duplicar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
