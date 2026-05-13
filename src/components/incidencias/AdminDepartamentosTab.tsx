import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Building2, Users, UserCheck, Plus, Upload, Download, Pencil,
  Trash2, ExternalLink, Loader2
} from "lucide-react";

// ── Types ──────────────────────────────────────────
interface IncDepartment {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  created_by: string | null;
}

interface IncWorker {
  id: string;
  department_id: string;
  nombre: string;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
  worker_number: string | null;
  external_url_salix: string | null;
  activo: boolean;
  created_at: string;
}

interface ManagerAssignment {
  id: string;
  manager_id: string;
  department_id: string;
  manager_name: string;
  created_at: string;
}

interface AvailableManager {
  id: string;
  name: string;
  role: string;
}

// ── Helper: stable API caller (no hook deps) ──────
async function callApi(action: string, extra: Record<string, unknown> = {}) {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  if (!sessionToken) throw new Error("No session");
  const { data, error } = await supabase.functions.invoke("incidencias-operations", {
    body: { action, sessionToken, ...extra },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || "Unknown error");
  return data;
}

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════
export function AdminDepartamentosTab() {
  // ── Departments state ───────────────────────────
  const [departments, setDepartments] = useState<IncDepartment[]>([]);
  const [deptsLoading, setDeptsLoading] = useState(false);
  const [showCreateDept, setShowCreateDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [editingDept, setEditingDept] = useState<IncDepartment | null>(null);
  const [editDeptName, setEditDeptName] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Workers state ───────────────────────────────
  const [selectedDeptWorkers, setSelectedDeptWorkers] = useState<string>("");
  const [workers, setWorkers] = useState<IncWorker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [showCreateWorker, setShowCreateWorker] = useState(false);
  const [editingWorker, setEditingWorker] = useState<IncWorker | null>(null);
  const [workerForm, setWorkerForm] = useState({ nombre: "", apellidos: "", email: "", telefono: "", worker_number: "", external_url_salix: "" });
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);

  // ── Managers state ──────────────────────────────
  const [selectedDeptManagers, setSelectedDeptManagers] = useState<string>("");
  const [assignments, setAssignments] = useState<ManagerAssignment[]>([]);
  const [availableManagers, setAvailableManagers] = useState<AvailableManager[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [selectedManagerToAssign, setSelectedManagerToAssign] = useState<string>("");
  const [erpDepartments, setErpDepartments] = useState<Array<{ id: string; name: string }>>([]);

  // ── Load departments (stable, no deps) ──────────
  const loadedRef = useRef(false);

  const loadDepartments = useCallback(async () => {
    setDeptsLoading(true);
    try {
      const res = await callApi("listIncidenciasDepartments");
      setDepartments(res.departments || []);
    } catch (e: any) {
      toast.error("Error cargando departamentos: " + e.message);
    } finally {
      setDeptsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadDepartments();
    // Load all ERP departments for the managers tab via edge function
    (async () => {
      try {
        const token = localStorage.getItem("manager_session_token") || "";
        const { data } = await supabase.functions.invoke("admin-operations", {
          body: { action: "getDepartments", sessionToken: token },
        });
        if (data?.success && data.departments) {
          const sorted = (data.departments as Array<{ id: string; name: string }>)
            .sort((a, b) => a.name.localeCompare(b.name));
          setErpDepartments(sorted);
        }
      } catch (_) { /* non-critical */ }
    })();
  }, [loadDepartments]);

  // ── Create department ───────────────────────────
  const handleCreateDept = async () => {
    if (!newDeptName.trim()) return;
    setSaving(true);
    try {
      await callApi("createIncidenciasDepartment", { name: newDeptName.trim() });
      toast.success("Departamento creado");
      setNewDeptName("");
      setShowCreateDept(false);
      loadDepartments();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Update department ───────────────────────────
  const handleUpdateDept = async () => {
    if (!editingDept || !editDeptName.trim()) return;
    setSaving(true);
    try {
      await callApi("updateIncidenciasDepartment", {
        departmentId: editingDept.id,
        updates: { name: editDeptName.trim() },
      });
      toast.success("Departamento actualizado");
      setEditingDept(null);
      loadDepartments();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDeptActive = async (dept: IncDepartment) => {
    try {
      await callApi("updateIncidenciasDepartment", {
        departmentId: dept.id,
        updates: { active: !dept.active },
      });
      toast.success(dept.active ? "Departamento desactivado" : "Departamento activado");
      loadDepartments();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── Load workers ────────────────────────────────
  const loadWorkers = useCallback(async (deptId: string) => {
    if (!deptId) return;
    setWorkersLoading(true);
    try {
      const res = await callApi("listIncidenciasWorkers", { departmentId: deptId });
      setWorkers(res.workers || []);
    } catch (e: any) {
      toast.error("Error cargando trabajadores: " + e.message);
    } finally {
      setWorkersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDeptWorkers) loadWorkers(selectedDeptWorkers);
    else setWorkers([]);
  }, [selectedDeptWorkers, loadWorkers]);

  // ── Create/Edit worker ──────────────────────────
  const resetWorkerForm = () => setWorkerForm({ nombre: "", apellidos: "", email: "", telefono: "", worker_number: "", external_url_salix: "" });

  const handleSaveWorker = async () => {
    if (!workerForm.nombre.trim()) { toast.error("Nombre obligatorio"); return; }
    setSaving(true);
    try {
      if (editingWorker) {
        await callApi("updateIncidenciasWorker", { workerId: editingWorker.id, updates: workerForm });
        toast.success("Trabajador actualizado");
      } else {
        await callApi("createIncidenciasWorker", {
          worker: { ...workerForm, department_id: selectedDeptWorkers },
        });
        toast.success("Trabajador creado");
      }
      setShowCreateWorker(false);
      setEditingWorker(null);
      resetWorkerForm();
      loadWorkers(selectedDeptWorkers);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleWorkerActive = async (w: IncWorker) => {
    try {
      await callApi("updateIncidenciasWorker", { workerId: w.id, updates: { activo: !w.activo } });
      toast.success(w.activo ? "Trabajador desactivado" : "Trabajador activado");
      loadWorkers(selectedDeptWorkers);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── CSV Import ──────────────────────────────────
  const parseCSV = (text: string) => {
    const lines = text.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(/[;,]/).map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(/[;,]/).map(v => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ""; });
      return row;
    }).filter(r => r.nombre);
  };

  const handleCSVChange = (text: string) => {
    setCsvText(text);
    setCsvPreview(parseCSV(text));
  };

  const handleImportCSV = async () => {
    if (csvPreview.length === 0) { toast.error("No hay datos válidos"); return; }
    setSaving(true);
    try {
      const res = await callApi("importIncidenciasWorkers", {
        departmentId: selectedDeptWorkers,
        workers: csvPreview,
      });
      toast.success(`${res.imported} trabajadores importados`);
      setShowImport(false);
      setCsvText("");
      setCsvPreview([]);
      loadWorkers(selectedDeptWorkers);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── CSV Export ──────────────────────────────────
  const handleExport = async () => {
    try {
      const res = await callApi("exportIncidenciasWorkers", { departmentId: selectedDeptWorkers });
      const rows = res.workers || [];
      if (rows.length === 0) { toast.info("No hay trabajadores para exportar"); return; }
      const headers = ["worker_number", "nombre", "apellidos", "email", "telefono", "external_url_salix", "activo"];
      const csv = [headers.join(";"), ...rows.map((r: Record<string, unknown>) => headers.map(h => r[h] ?? "").join(";"))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trabajadores-incidencias-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── Load assignments ────────────────────────────
  const loadAssignments = useCallback(async (deptId: string) => {
    if (!deptId) return;
    setAssignmentsLoading(true);
    try {
      const [aRes, mRes] = await Promise.all([
        callApi("listIncidenciasDepartmentManagers", { departmentId: deptId }),
        callApi("listAvailableManagers"),
      ]);
      setAssignments(aRes.assignments || []);
      setAvailableManagers(mRes.managers || []);
    } catch (e: any) {
      toast.error("Error: " + e.message);
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDeptManagers) loadAssignments(selectedDeptManagers);
    else { setAssignments([]); setAvailableManagers([]); }
  }, [selectedDeptManagers, loadAssignments]);

  const handleAssignManager = async () => {
    if (!selectedManagerToAssign || !selectedDeptManagers) return;
    try {
      await callApi("assignManagerToDepartment", {
        managerId: selectedManagerToAssign,
        departmentId: selectedDeptManagers,
      });
      toast.success("Encargado asignado");
      setSelectedManagerToAssign("");
      loadAssignments(selectedDeptManagers);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      await callApi("removeManagerFromDepartment", { assignmentId });
      toast.success("Asignación eliminada");
      loadAssignments(selectedDeptManagers);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── Derived: unassigned managers ────────────────
  const assignedIds = new Set(assignments.map(a => a.manager_id));
  const unassignedManagers = availableManagers.filter(m => !assignedIds.has(m.id));

  // ── Dept selector helper ────────────────────────
  const DeptSelector = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full md:w-72">
        <SelectValue placeholder="Seleccionar departamento" />
      </SelectTrigger>
      <SelectContent>
        {departments.filter(d => d.active).map(d => (
          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <Tabs defaultValue="departments">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="departments" className="gap-1.5">
            <Building2 className="h-4 w-4" /> Departamentos
          </TabsTrigger>
          <TabsTrigger value="workers" className="gap-1.5">
            <Users className="h-4 w-4" /> Trabajadores
          </TabsTrigger>
          <TabsTrigger value="managers" className="gap-1.5">
            <UserCheck className="h-4 w-4" /> Encargados
          </TabsTrigger>
        </TabsList>

        {/* ════════════════ DEPARTAMENTOS ════════════════ */}
        <TabsContent value="departments" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Departamentos</h2>
            <Button onClick={() => setShowCreateDept(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Crear
            </Button>
          </div>

          {deptsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : departments.length === 0 ? (
            <Card className="rounded-2xl"><CardContent className="p-8 text-center text-muted-foreground">No hay departamentos creados</CardContent></Card>
          ) : (
            <Card className="rounded-2xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Creado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>
                        <Badge variant={d.active ? "default" : "secondary"}>
                          {d.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(d.created_at).toLocaleDateString("es-ES")}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditingDept(d); setEditDeptName(d.name); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleToggleDeptActive(d)}>
                          <Switch checked={d.active} className="pointer-events-none" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Create dialog */}
          <Dialog open={showCreateDept} onOpenChange={setShowCreateDept}>
            <DialogContent>
              <DialogHeader><DialogTitle>Crear departamento</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Label>Nombre</Label>
                <Input value={newDeptName} onChange={e => setNewDeptName(e.target.value)} placeholder="Ej: Almacén" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDept(false)}>Cancelar</Button>
                <Button onClick={handleCreateDept} disabled={saving || !newDeptName.trim()}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Crear
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit dialog */}
          <Dialog open={!!editingDept} onOpenChange={() => setEditingDept(null)}>
            <DialogContent>
              <DialogHeader><DialogTitle>Editar departamento</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Label>Nombre</Label>
                <Input value={editDeptName} onChange={e => setEditDeptName(e.target.value)} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingDept(null)}>Cancelar</Button>
                <Button onClick={handleUpdateDept} disabled={saving || !editDeptName.trim()}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ════════════════ TRABAJADORES ════════════════ */}
        <TabsContent value="workers" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <DeptSelector value={selectedDeptWorkers} onChange={setSelectedDeptWorkers} />
            {selectedDeptWorkers && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
                  <Upload className="h-4 w-4 mr-1" /> Importar CSV
                </Button>
                <Button size="sm" variant="outline" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-1" /> Exportar
                </Button>
                <Button size="sm" onClick={() => { resetWorkerForm(); setEditingWorker(null); setShowCreateWorker(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Nuevo
                </Button>
              </div>
            )}
          </div>

          {!selectedDeptWorkers ? (
            <Card className="rounded-2xl"><CardContent className="p-8 text-center text-muted-foreground">Selecciona un departamento</CardContent></Card>
          ) : workersLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : workers.length === 0 ? (
            <Card className="rounded-2xl"><CardContent className="p-8 text-center text-muted-foreground">Sin trabajadores en este departamento</CardContent></Card>
          ) : (
            <Card className="rounded-2xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workers.map(w => (
                    <TableRow key={w.id}>
                      <TableCell className="text-muted-foreground text-sm">{w.worker_number || "—"}</TableCell>
                      <TableCell className="font-medium">
                        {w.nombre} {w.apellidos || ""}
                        {w.external_url_salix && (
                          <a href={w.external_url_salix} target="_blank" rel="noopener noreferrer" className="ml-1 inline-block">
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary inline" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{w.email || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={w.activo ? "default" : "secondary"} className="text-[10px]">
                          {w.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditingWorker(w);
                          setWorkerForm({
                            nombre: w.nombre, apellidos: w.apellidos || "",
                            email: w.email || "", telefono: w.telefono || "",
                            worker_number: w.worker_number || "", external_url_salix: w.external_url_salix || "",
                          });
                          setShowCreateWorker(true);
                        }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleToggleWorkerActive(w)}>
                          <Switch checked={w.activo} className="pointer-events-none" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Worker create/edit dialog */}
          <Dialog open={showCreateWorker} onOpenChange={(open) => { if (!open) { setShowCreateWorker(false); setEditingWorker(null); } }}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>{editingWorker ? "Editar trabajador" : "Nuevo trabajador"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nombre *</Label><Input value={workerForm.nombre} onChange={e => setWorkerForm(p => ({ ...p, nombre: e.target.value }))} /></div>
                <div><Label>Apellidos</Label><Input value={workerForm.apellidos} onChange={e => setWorkerForm(p => ({ ...p, apellidos: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Nº empleado</Label><Input value={workerForm.worker_number} onChange={e => setWorkerForm(p => ({ ...p, worker_number: e.target.value }))} /></div>
                  <div><Label>Teléfono</Label><Input value={workerForm.telefono} onChange={e => setWorkerForm(p => ({ ...p, telefono: e.target.value }))} /></div>
                </div>
                <div><Label>Email</Label><Input type="email" value={workerForm.email} onChange={e => setWorkerForm(p => ({ ...p, email: e.target.value }))} /></div>
                <div><Label>URL Salix</Label><Input value={workerForm.external_url_salix} onChange={e => setWorkerForm(p => ({ ...p, external_url_salix: e.target.value }))} placeholder="https://salix.verdnatura.es/..." /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowCreateWorker(false); setEditingWorker(null); }}>Cancelar</Button>
                <Button onClick={handleSaveWorker} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} {editingWorker ? "Guardar" : "Crear"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* CSV Import dialog */}
          <Dialog open={showImport} onOpenChange={setShowImport}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Importar trabajadores (CSV)</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Formato: <code>nombre;apellidos;email;telefono;worker_number;external_url_salix</code>
                </p>
                <textarea
                  className="w-full h-32 border rounded-lg p-2 text-sm font-mono bg-muted/30"
                  value={csvText}
                  onChange={e => handleCSVChange(e.target.value)}
                  placeholder="nombre;apellidos;email;telefono;worker_number&#10;Juan;García;juan@email.com;600123456;EMP001"
                />
                {csvPreview.length > 0 && (
                  <p className="text-xs text-emerald-600 font-medium">{csvPreview.length} registros válidos detectados</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowImport(false)}>Cancelar</Button>
                <Button onClick={handleImportCSV} disabled={saving || csvPreview.length === 0}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Importar {csvPreview.length}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ════════════════ ENCARGADOS ════════════════ */}
        <TabsContent value="managers" className="space-y-4">
          {/* Use ERP departments for manager assignments */}
          <Select value={selectedDeptManagers} onValueChange={setSelectedDeptManagers}>
            <SelectTrigger className="w-full md:w-72">
              <SelectValue placeholder="Seleccionar departamento" />
            </SelectTrigger>
            <SelectContent>
              {erpDepartments.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!selectedDeptManagers ? (
            <Card className="rounded-2xl"><CardContent className="p-8 text-center text-muted-foreground">Selecciona un departamento</CardContent></Card>
          ) : assignmentsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4">
              {/* Assign new */}
              {unassignedManagers.length > 0 && (
                <Card className="rounded-2xl">
                  <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
                    <Select value={selectedManagerToAssign} onValueChange={setSelectedManagerToAssign}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Seleccionar encargado..." />
                      </SelectTrigger>
                      <SelectContent>
                        {unassignedManagers.map(m => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} <span className="text-muted-foreground">({m.role})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAssignManager} disabled={!selectedManagerToAssign}>
                      <Plus className="h-4 w-4 mr-1" /> Asignar
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Current assignments */}
              {assignments.length === 0 ? (
                <Card className="rounded-2xl"><CardContent className="p-8 text-center text-muted-foreground">Sin encargados asignados</CardContent></Card>
              ) : (
                <Card className="rounded-2xl overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Encargado</TableHead>
                        <TableHead>Asignado</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignments.map(a => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.manager_name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(a.created_at).toLocaleDateString("es-ES")}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveAssignment(a.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
