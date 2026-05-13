import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { 
  ArrowLeftRight, 
  Plus, 
  Send, 
  Check, 
  X, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Mail,
  Trash2,
  Search,
  ExternalLink,
  PenLine,
  FileDown
} from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

const SALIX_BASE = 'https://salix.verdnatura.es/#!/worker/';

interface Worker {
  id: string;
  name: string;
  worker_number: string;
  email: string | null;
  work_group_id: string | null;
  worker_team_id: string | null;
  department_id: string;
}

interface WorkGroup {
  id: string;
  name: string;
  color: string;
  department_id: string;
}

interface WorkGroupTeam {
  work_group_id: string;
  worker_team_id: string;
}

interface GroupExchange {
  id: string;
  employee_a_id: string;
  employee_b_id: string;
  department_id: string;
  original_group_a_id: string | null;
  original_group_b_id: string | null;
  temporary_group_a_id: string | null;
  temporary_group_b_id: string | null;
  year: number;
  status: string;
  accepted_by_a: boolean;
  accepted_by_a_at: string | null;
  accepted_by_b: boolean;
  accepted_by_b_at: string | null;
  approved_by_admin: boolean;
  approved_by: string | null;
  approved_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  created_by: string | null;
  signature_a: string | null;
  signature_b: string | null;
}

interface Department {
  id: string;
  name: string;
}

interface GroupExchangesPanelProps {
  sessionToken: string;
  onSessionExpired?: () => void;
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function GroupExchangesPanel({ sessionToken, onSessionExpired }: GroupExchangesPanelProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [exchanges, setExchanges] = useState<GroupExchange[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [workGroupTeams, setWorkGroupTeams] = useState<WorkGroupTeam[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('__all__');
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Email edit
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailWorker, setEmailWorker] = useState<Worker | null>(null);
  const [emailValue, setEmailValue] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // Create form
  const [createDeptId, setCreateDeptId] = useState('');
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [employeeAId, setEmployeeAId] = useState('');
  const [employeeBId, setEmployeeBId] = useState('');
  const [exchangeYear, setExchangeYear] = useState(new Date().getFullYear());

  // Signature preview
  const [signaturePreview, setSignaturePreview] = useState<{
    title: string;
    dataUrl: string;
    fileName: string;
    signedAt: string | null;
  } | null>(null);

  const openEmailEditor = (worker: Worker) => {
    setEmailWorker(worker);
    setEmailValue(worker.email || '');
    setEmailDialogOpen(true);
  };

  const applyWorkerEmailUpdate = (workerId: string, email: string) => {
    const updateEmail = (worker: Worker) =>
      worker.id === workerId ? { ...worker, email } : worker;

    setWorkers(prev => prev.map(updateEmail));
    setCreateDialogWorkers(prev => prev.map(updateEmail));
    setEmailWorker(prev => (prev?.id === workerId ? { ...prev, email } : prev));
  };

  const normalizePngDataUrl = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('data:image/')) return trimmed;
    if (trimmed.startsWith('data:')) return trimmed;
    return `data:image/png;base64,${trimmed}`;
  };

  const openSignaturePreview = (opts: { title: string; signature: string; fileName: string; signedAt?: string | null }) => {
    setSignaturePreview({
      title: opts.title,
      dataUrl: normalizePngDataUrl(opts.signature),
      fileName: opts.fileName,
      signedAt: opts.signedAt || null,
    });
  };

  const downloadSignature = (dataUrl: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownloadExchangePdf = async (exchangeId: string) => {
    try {
      toast.info('Generando documento...');
      const { data: response, error } = await supabase.functions.invoke('admin-operations', {
        body: { action: 'generateExchangeDocument', sessionToken, data: { exchangeId } }
      });
      if (error) throw error;
      if (!response?.success || !response?.html) {
        toast.error(response?.error || 'Error al generar documento');
        return;
      }
      // Open in new window for printing/PDF
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(response.html);
        w.document.close();
        setTimeout(() => w.print(), 600);
      } else {
        toast.error('No se pudo abrir la ventana. Permite las ventanas emergentes.');
      }
    } catch (err) {
      console.error('Error generating exchange PDF:', err);
      toast.error('Error al generar el documento');
    }
  };

  // Fetch departments
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const { data, error } = await supabase.rpc('get_public_departments');
        if (error) throw error;
        const depts = (data || []).map((d: any) => ({ id: d.id, name: d.name }));
        depts.sort((a: any, b: any) => a.name.localeCompare(b.name));
        setDepartments(depts);
      } catch (err) {
        console.error('Error fetching departments:', err);
      }
    };
    fetchDepartments();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const bodyData: any = {};
      if (selectedDepartmentId !== '__all__') {
        bodyData.departmentId = selectedDepartmentId;
      }

      const { data: response, error } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getGroupExchanges',
          sessionToken,
          data: bodyData
        }
      });

      if (error) throw error;
      
      if (response?.success === false && (response?.error?.includes('Session') || response?.error?.includes('session'))) {
        toast.error('Sesión expirada');
        onSessionExpired?.();
        return;
      }
      
      if (response?.success) {
        setExchanges(response.exchanges || []);
        setWorkers(response.workers || []);
        setWorkGroups(response.workGroups || []);
        setWorkGroupTeams(response.workGroupTeams || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Error al cargar intercambios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDepartmentId]);

  const getWorkerGroup = (workerId: string): WorkGroup | null => {
    const worker = getWorkerById(workerId);
    if (!worker) return null;

    if (worker.work_group_id) {
      const directGroup = workGroups.find(wg => wg.id === worker.work_group_id);
      if (directGroup) return directGroup;
    }

    if (!worker.worker_team_id) return null;
    const teamGroup = workGroupTeams.find(wgt => wgt.worker_team_id === worker.worker_team_id);
    if (!teamGroup) return null;
    return workGroups.find(wg => wg.id === teamGroup.work_group_id) || null;
  };

  const getActiveExchange = (workerId: string): GroupExchange | null => {
    const currentYear = new Date().getFullYear();
    return exchanges.find(e => 
      e.status === 'approved' && 
      e.year === currentYear && 
      (e.employee_a_id === workerId || e.employee_b_id === workerId)
    ) || null;
  };

  // Fetch workers for the selected create-dialog department on demand
  const [createDialogWorkers, setCreateDialogWorkers] = useState<Worker[]>([]);
  const [loadingCreateWorkers, setLoadingCreateWorkers] = useState(false);

  useEffect(() => {
    if (!createDeptId) {
      setCreateDialogWorkers([]);
      return;
    }

    const existing = workers.filter(w => w.department_id === createDeptId);
    if (existing.length > 0) {
      setCreateDialogWorkers(existing);
    }

    const hasDepartmentGroups = workGroups.some(group => group.department_id === createDeptId);

    const fetchCreateWorkers = async () => {
      setLoadingCreateWorkers(true);
      try {
        const [workersResponse, groupsResponse] = await Promise.all([
          existing.length === 0
            ? supabase.functions.invoke('admin-operations', {
                body: {
                  action: 'searchAllWorkers',
                  sessionToken,
                  data: { departmentId: createDeptId }
                }
              })
            : Promise.resolve({ data: null }),
          hasDepartmentGroups
            ? Promise.resolve({ data: null })
            : supabase.functions.invoke('admin-operations', {
                body: {
                  action: 'getWorkerGroupsData',
                  sessionToken,
                  data: { departmentId: createDeptId }
                }
              })
        ]);

        if (workersResponse?.data?.success && workersResponse.data.workers) {
          setCreateDialogWorkers(workersResponse.data.workers.filter((w: Worker) => w.department_id === createDeptId));
        }

        if (groupsResponse?.data?.success) {
          if (groupsResponse.data.workers) {
            setCreateDialogWorkers(prev => {
              const byId = new Map<string, Worker>();
              prev.forEach(worker => byId.set(worker.id, worker));
              groupsResponse.data.workers.forEach((worker: Worker) => {
                if (worker.department_id === createDeptId) {
                  const existingWorker = byId.get(worker.id);
                  byId.set(worker.id, existingWorker ? { ...existingWorker, ...worker } : worker);
                }
              });
              return Array.from(byId.values());
            });
          }

          if (groupsResponse.data.workGroups) {
            setWorkGroups(prev => {
              const byId = new Map(prev.map(group => [group.id, group]));
              groupsResponse.data.workGroups.forEach((group: WorkGroup) => byId.set(group.id, group));
              return Array.from(byId.values());
            });
          }

          if (groupsResponse.data.workGroupTeams) {
            setWorkGroupTeams(prev => {
              const byKey = new Map(prev.map(item => [`${item.work_group_id}:${item.worker_team_id}`, item]));
              groupsResponse.data.workGroupTeams.forEach((item: WorkGroupTeam) => {
                byKey.set(`${item.work_group_id}:${item.worker_team_id}`, item);
              });
              return Array.from(byKey.values());
            });
          }
        }
      } catch (err) {
        console.error('Error fetching create dialog workers:', err);
      } finally {
        setLoadingCreateWorkers(false);
      }
    };

    if (existing.length === 0 || !hasDepartmentGroups) {
      fetchCreateWorkers();
    }
  }, [createDeptId, workers, workGroups, sessionToken]);

  const createWorkers = createDialogWorkers;

  const combinedWorkers = useMemo(() => {
    const byId = new Map<string, Worker>();
    workers.forEach(worker => byId.set(worker.id, worker));
    createDialogWorkers.forEach(worker => {
      const existing = byId.get(worker.id);
      byId.set(worker.id, existing ? { ...existing, ...worker } : worker);
    });
    return Array.from(byId.values());
  }, [workers, createDialogWorkers]);

  const getWorkerById = (workerId: string) => combinedWorkers.find(w => w.id === workerId) || null;

  const filteredWorkersA = useMemo(() => {
    if (!searchA.trim()) return [];
    const query = searchA.toLowerCase();
    return createWorkers
      .filter(w => w.id !== employeeBId && (w.name.toLowerCase().includes(query) || w.worker_number.toLowerCase().includes(query)))
      .slice(0, 15);
  }, [searchA, createWorkers, employeeBId]);

  const filteredWorkersB = useMemo(() => {
    if (!searchB.trim()) return [];
    const query = searchB.toLowerCase();
    return createWorkers
      .filter(w => w.id !== employeeAId && (w.name.toLowerCase().includes(query) || w.worker_number.toLowerCase().includes(query)))
      .slice(0, 15);
  }, [searchB, createWorkers, employeeAId]);

  const selectedWorkerA = employeeAId ? getWorkerById(employeeAId) : null;
  const selectedWorkerB = employeeBId ? getWorkerById(employeeBId) : null;

  const handleSelectWorkerA = (worker: Worker) => {
    setEmployeeAId(worker.id);
    setSearchA(`${worker.name} (${worker.worker_number})`);
  };

  const handleSelectWorkerB = (worker: Worker) => {
    setEmployeeBId(worker.id);
    setSearchB(`${worker.name} (${worker.worker_number})`);
  };

  const clearWorkerA = () => { setEmployeeAId(''); setSearchA(''); };
  const clearWorkerB = () => { setEmployeeBId(''); setSearchB(''); };

  const handleCreate = async () => {
    if (!employeeAId || !employeeBId || !createDeptId) {
      toast.error('Selecciona departamento y ambos empleados');
      return;
    }

    const workerA = getWorkerById(employeeAId);
    const workerB = getWorkerById(employeeBId);
    
    if (!workerA?.email || !workerB?.email) {
      toast.error('Ambos empleados deben tener email configurado');
      return;
    }

    const groupA = getWorkerGroup(employeeAId);
    const groupB = getWorkerGroup(employeeBId);

    if (!groupA || !groupB) {
      toast.error('Ambos empleados deben tener un grupo asignado');
      return;
    }

    if (groupA.id === groupB.id) {
      toast.error('Los empleados deben pertenecer a grupos diferentes');
      return;
    }

    setCreating(true);
    try {
      const { data: response, error } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'createGroupExchange',
          sessionToken,
          data: {
            departmentId: createDeptId,
            employeeAId,
            employeeBId,
            originalGroupAId: groupA.id,
            originalGroupBId: groupB.id,
            temporaryGroupAId: groupB.id,
            temporaryGroupBId: groupA.id,
            year: exchangeYear
          }
        }
      });

      if (error) throw error;
      if (response?.success) {
        toast.success('Intercambio creado');
        setShowCreateDialog(false);
        resetCreateForm();
        fetchData();
      } else {
        toast.error(response?.error || 'Error al crear');
      }
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al crear intercambio');
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setEmployeeAId('');
    setEmployeeBId('');
    setSearchA('');
    setSearchB('');
    setCreateDeptId('');
  };

  const handleSendEmails = async (exchangeId: string) => {
    try {
      const { data: response, error } = await supabase.functions.invoke('admin-operations', {
        body: { action: 'sendExchangeEmails', sessionToken, data: { exchangeId, baseUrl: 'https://vnprod.app' } }
      });
      if (error) throw error;
      if (response?.success) { toast.success('Emails enviados'); fetchData(); }
      else toast.error(response?.error || 'Error al enviar');
    } catch (err) { console.error(err); toast.error('Error al enviar emails'); }
  };

  const handleApprove = async (exchangeId: string) => {
    try {
      const { data: response, error } = await supabase.functions.invoke('admin-operations', {
        body: { action: 'approveGroupExchange', sessionToken, data: { exchangeId } }
      });
      if (error) throw error;
      if (response?.success) { toast.success('Intercambio aprobado'); fetchData(); }
      else toast.error(response?.error || 'Error');
    } catch (err) { console.error(err); toast.error('Error al aprobar'); }
  };

  const handleCancel = async (exchangeId: string, reason = 'Cancelado por administrador') => {
    try {
      const { data: response, error } = await supabase.functions.invoke('admin-operations', {
        body: { action: 'cancelGroupExchange', sessionToken, data: { exchangeId, reason } }
      });
      if (error) throw error;
      if (response?.success) { toast.success('Intercambio cancelado'); fetchData(); }
      else toast.error(response?.error || 'Error');
    } catch (err) { console.error(err); toast.error('Error al cancelar'); }
  };

  const handleDelete = async (exchangeId: string) => {
    if (!confirm('¿Eliminar este intercambio cancelado? No se puede deshacer.')) return;
    try {
      const { data: response, error } = await supabase.functions.invoke('admin-operations', {
        body: { action: 'deleteGroupExchange', sessionToken, data: { exchangeId } }
      });
      if (error) throw error;
      if (response?.success) { toast.success('Eliminado'); fetchData(); }
      else toast.error(response?.error || 'Error');
    } catch (err) { console.error(err); toast.error('Error al eliminar'); }
  };

  const getWorkerName = (id: string) => getWorkerById(id)?.name || '—';
  const getWorkerNumber = (id: string) => getWorkerById(id)?.worker_number || '';
  const getGroupName = (id: string | null) => id ? workGroups.find(g => g.id === id)?.name || '-' : '-';
  const getGroupColor = (id: string | null) => id ? workGroups.find(g => g.id === id)?.color || '#888' : '#888';
  const getDeptName = (id: string) => departments.find(d => d.id === id)?.name || '';

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  const renderWorkerItem = (worker: Worker, onSelect: (w: Worker) => void) => {
    const group = getWorkerGroup(worker.id);
    const hasEmail = !!worker.email;

    return (
      <div
        key={worker.id}
        className={cn(
          "w-full px-3 py-2 rounded-md flex items-center justify-between gap-2",
          hasEmail ? "hover:bg-muted cursor-pointer" : "bg-muted/30"
        )}
      >
        <button
          type="button"
          onClick={() => (hasEmail ? onSelect(worker) : openEmailEditor(worker))}
          className="flex-1 text-left flex items-center gap-2 min-w-0 focus:outline-none"
        >
          <span className="font-medium truncate">{worker.name}</span>
          <span className="text-muted-foreground text-xs shrink-0">{worker.worker_number}</span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {!hasEmail && (
            <Button type="button" size="sm" variant="outline" onClick={() => openEmailEditor(worker)} className="h-7 px-2 text-xs">
              + Email
            </Button>
          )}
          {group && (
            <Badge variant="outline" className="text-xs" style={{ borderColor: group.color, color: group.color }}>
              {group.name}
            </Badge>
          )}
        </div>
      </div>
    );
  };

  // ── Employee card within an exchange ──
  const EmployeeCard = ({ exchange, side }: { exchange: GroupExchange; side: 'a' | 'b' }) => {
    const empId = side === 'a' ? exchange.employee_a_id : exchange.employee_b_id;
    const originalGroupId = side === 'a' ? exchange.original_group_a_id : exchange.original_group_b_id;
    const tempGroupId = side === 'a' ? exchange.temporary_group_a_id : exchange.temporary_group_b_id;
    const accepted = side === 'a' ? exchange.accepted_by_a : exchange.accepted_by_b;
    const acceptedAt = side === 'a' ? exchange.accepted_by_a_at : exchange.accepted_by_b_at;
    const signature = side === 'a' ? exchange.signature_a : exchange.signature_b;
    const workerNumber = getWorkerNumber(empId);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{getWorkerName(empId)}</span>
          {workerNumber && (
            <a
              href={`${SALIX_BASE}${workerNumber}/summary`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
            >
              {workerNumber}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-16">Original</span>
            <Badge variant="outline" className="text-[10px] h-5" style={{ borderColor: getGroupColor(originalGroupId), color: getGroupColor(originalGroupId) }}>
              {getGroupName(originalGroupId)}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-16">Temporal</span>
            <Badge className="text-[10px] h-5" style={{ backgroundColor: getGroupColor(tempGroupId) }}>
              {getGroupName(tempGroupId)}
            </Badge>
          </div>
        </div>

        <div className="pt-1">
          {accepted ? (
            <div className="flex items-center gap-2">
              {signature ? (
                <button
                  onClick={() => openSignaturePreview({
                    title: `Firma — ${getWorkerName(empId)}`,
                    signature: signature,
                    fileName: `firma_${exchange.id}_${side.toUpperCase()}.png`,
                    signedAt: acceptedAt,
                  })}
                  className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                >
                  <PenLine className="h-3 w-3" />
                  Firmado
                </button>
              ) : (
                <span className="text-[11px] text-primary inline-flex items-center gap-1">
                  <Check className="h-3 w-3" /> Aceptado
                </span>
              )}
              {acceptedAt && (
                <span className="text-[10px] text-muted-foreground">
                  {new Date(acceptedAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> Pendiente firma
            </span>
          )}
        </div>
      </div>
    );
  };

  // ── Status helpers ──
  const statusConfig: Record<string, { label: string; class: string }> = {
    draft: { label: 'Borrador', class: 'text-muted-foreground border-border' },
    pending_employee_acceptance: { label: 'Pendiente firma', class: 'text-amber-500 border-amber-500/30' },
    accepted_by_employees: { label: 'Firmado — Pendiente admin', class: 'text-blue-400 border-blue-400/30' },
    approved: { label: 'Activo', class: 'text-primary border-primary/30' },
    cancelled: { label: 'Cancelado', class: 'text-destructive border-destructive/30' },
  };

  return (
    <div className="space-y-6">
      {/* Signature preview dialog */}
      <Dialog open={!!signaturePreview} onOpenChange={(open) => { if (!open) setSignaturePreview(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{signaturePreview?.title}</DialogTitle>
          </DialogHeader>
          {signaturePreview && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-white p-4">
                <img src={signaturePreview.dataUrl} alt={signaturePreview.title} loading="lazy" className="max-h-[40vh] w-auto mx-auto" />
              </div>
              {signaturePreview.signedAt && (
                <div className="text-center text-sm text-muted-foreground">
                  <Clock className="inline h-3.5 w-3.5 mr-1" />
                  Firmado el {new Date(signaturePreview.signedAt).toLocaleString('es-ES', {
                    day: '2-digit', month: 'long', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => downloadSignature(signaturePreview.dataUrl, signaturePreview.fileName)}>
                  Descargar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Email dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Email del empleado</DialogTitle>
            <DialogDescription>{emailWorker ? `${emailWorker.name} (${emailWorker.worker_number})` : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={emailValue} onChange={(e) => setEmailValue(e.target.value)} placeholder="nombre@empresa.com" inputMode="email" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)} disabled={savingEmail}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!emailWorker) return;
                const nextEmail = emailValue.trim();
                if (!nextEmail) { toast.error('Introduce un email'); return; }
                setSavingEmail(true);
                try {
                  const { data: res, error: fnErr } = await supabase.functions.invoke('admin-operations', {
                    body: { action: 'updateWorker', sessionToken, data: { workerId: emailWorker.id, name: emailWorker.name, workerNumber: emailWorker.worker_number, email: nextEmail } }
                  });
                  if (fnErr) throw fnErr;
                  if (res && !res.success) throw new Error(res.error || 'Error al actualizar');
                  applyWorkerEmailUpdate(emailWorker.id, nextEmail);
                  toast.success('Email actualizado');
                  setEmailDialogOpen(false);
                } catch (e: any) { console.error(e); toast.error(e.message || 'Error al guardar email'); }
                finally { setSavingEmail(false); }
              }}
              disabled={savingEmail}
            >
              {savingEmail ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold">Intercambios de Grupo</h2>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={async () => {
              try {
                toast.info('Creando intercambio de prueba...');
                const { data: response, error } = await supabase.functions.invoke('admin-operations', {
                  body: {
                    action: 'createTestExchange',
                    sessionToken,
                    data: { testEmail: 'alvaromt@verdnatura.es', baseUrl: 'https://vnprod.app' }
                  }
                });
                if (error) throw error;
                if (response?.success) {
                  toast.success(`Intercambio de prueba creado. Emails enviados a ${response.emailSentTo}`, { duration: 8000 });
                  console.log('Test exchange links:', response.linkA, response.linkB);
                  fetchData();
                } else {
                  toast.error(response?.error || 'Error');
                }
              } catch (err) { console.error(err); toast.error('Error al crear intercambio de prueba'); }
            }}
          >
            🧪 Test
          </Button>
          <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {departments.map(dept => (
                <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) resetCreateForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nuevo Intercambio</DialogTitle>
                <DialogDescription>Intercambia temporalmente los grupos de dos empleados</DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Departamento</Label>
                    <Select value={createDeptId} onValueChange={(v) => { setCreateDeptId(v); clearWorkerA(); clearWorkerB(); }}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map(dept => (
                          <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Año</Label>
                    <Select value={exchangeYear.toString()} onValueChange={(v) => setExchangeYear(parseInt(v))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {createDeptId && (
                  <>
                    <Separator />
                    {/* Employee A */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Empleado A</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Buscar..."
                          value={searchA}
                          onChange={(e) => { setSearchA(e.target.value); if (employeeAId) setEmployeeAId(''); }}
                          className="pl-9 pr-9 h-9"
                        />
                        {(searchA || employeeAId) && (
                          <button onClick={clearWorkerA} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {!employeeAId && filteredWorkersA.length > 0 && (
                        <div className="border rounded-md p-1 max-h-40 overflow-y-auto space-y-0.5">
                          {filteredWorkersA.map(w => renderWorkerItem(w, handleSelectWorkerA))}
                        </div>
                      )}
                      {employeeAId && selectedWorkerA && (
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          Grupo: <span className="font-medium" style={{ color: getGroupColor(getWorkerGroup(employeeAId)?.id || null) }}>
                            {getWorkerGroup(employeeAId)?.name || 'Sin grupo'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-center">
                      <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                    </div>

                    {/* Employee B */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Empleado B</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Buscar..."
                          value={searchB}
                          onChange={(e) => { setSearchB(e.target.value); if (employeeBId) setEmployeeBId(''); }}
                          className="pl-9 pr-9 h-9"
                        />
                        {(searchB || employeeBId) && (
                          <button onClick={clearWorkerB} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {!employeeBId && filteredWorkersB.length > 0 && (
                        <div className="border rounded-md p-1 max-h-40 overflow-y-auto space-y-0.5">
                          {filteredWorkersB.map(w => renderWorkerItem(w, handleSelectWorkerB))}
                        </div>
                      )}
                      {employeeBId && selectedWorkerB && (
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          Grupo: <span className="font-medium" style={{ color: getGroupColor(getWorkerGroup(employeeBId)?.id || null) }}>
                            {getWorkerGroup(employeeBId)?.name || 'Sin grupo'}
                          </span>
                        </div>
                      )}
                    </div>

                    {employeeAId && employeeBId && (
                      <Alert>
                        <ArrowLeftRight className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          <strong>{getWorkerName(employeeAId)}</strong> → grupo{' '}
                          <span style={{ color: getGroupColor(getWorkerGroup(employeeBId)?.id || null) }}>{getWorkerGroup(employeeBId)?.name}</span>
                          {' · '}
                          <strong>{getWorkerName(employeeBId)}</strong> → grupo{' '}
                          <span style={{ color: getGroupColor(getWorkerGroup(employeeAId)?.id || null) }}>{getWorkerGroup(employeeAId)?.name}</span>
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={creating || !employeeAId || !employeeBId}>
                  {creating && <RefreshCw className="h-4 w-4 animate-spin mr-2" />}
                  Crear
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : exchanges.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <ArrowLeftRight className="h-10 w-10 mx-auto mb-3 opacity-15" />
          <p className="text-sm">Sin intercambios</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exchanges.map(exchange => {
            const isActive = exchange.status === 'approved' && exchange.year >= currentYear;
            const status = statusConfig[exchange.status] || { label: exchange.status, class: '' };

            return (
              <div
                key={exchange.id}
                className={cn(
                  "rounded-xl border p-4 space-y-3 transition-all",
                  exchange.status === 'cancelled' && 'opacity-50',
                  isActive && 'border-primary/30'
                )}
              >
                {/* Top row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{exchange.year}</span>
                    <Badge variant="outline" className={cn("text-[10px] h-5", status.class)}>
                      {status.label}
                    </Badge>
                    {selectedDepartmentId === '__all__' && (
                      <span className="text-[10px] text-muted-foreground">{getDeptName(exchange.department_id)}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(exchange.created_at).toLocaleDateString('es-ES')}
                  </span>
                </div>

                {/* Employee cards */}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <EmployeeCard exchange={exchange} side="a" />
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <EmployeeCard exchange={exchange} side="b" />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  {exchange.status === 'draft' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleSendEmails(exchange.id)} className="h-7 gap-1.5 text-xs">
                        <Send className="h-3 w-3" /> Enviar emails
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleCancel(exchange.id)} className="h-7 text-xs text-destructive hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}

                  {exchange.status === 'pending_employee_acceptance' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleSendEmails(exchange.id)} className="h-7 gap-1.5 text-xs">
                        <Mail className="h-3 w-3" /> Reenviar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleCancel(exchange.id)} className="h-7 text-xs text-destructive hover:text-destructive">
                        <X className="h-3 w-3 mr-1" /> Cancelar
                      </Button>
                    </>
                  )}

                  {exchange.status === 'accepted_by_employees' && (
                    <>
                      <Button size="sm" onClick={() => handleApprove(exchange.id)} className="h-7 gap-1.5 text-xs">
                        <CheckCircle2 className="h-3 w-3" /> Aprobar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleCancel(exchange.id)} className="h-7 text-xs text-destructive hover:text-destructive">
                        <X className="h-3 w-3 mr-1" /> Rechazar
                      </Button>
                    </>
                  )}

                  {exchange.status === 'approved' && (
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                          Aprobado{exchange.approved_by ? ` por ${exchange.approved_by}` : ''}
                          {exchange.approved_at ? ` · ${new Date(exchange.approved_at).toLocaleDateString('es-ES')}` : ''}
                        </span>
                        <Button size="sm" variant="outline" onClick={() => handleDownloadExchangePdf(exchange.id)} className="h-7 gap-1.5 text-xs">
                          <FileDown className="h-3 w-3" /> PDF
                        </Button>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleCancel(exchange.id)} className="h-7 text-xs text-destructive hover:text-destructive">
                        Cancelar
                      </Button>
                    </div>
                  )}

                  {exchange.status === 'cancelled' && (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] text-muted-foreground">
                        {exchange.cancellation_reason || 'Cancelado'}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(exchange.id)} className="h-7 text-xs text-destructive hover:text-destructive">
                        <Trash2 className="h-3 w-3 mr-1" /> Eliminar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
