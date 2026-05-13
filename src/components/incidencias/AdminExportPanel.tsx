import { useState, useEffect, useCallback } from "react";
import { Download, FileText, Building2, Scale, Database, Loader2, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── CSV helper ───────────────────────────────────────────
function downloadCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) { toast.error("No hay datos para exportar"); return; }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(';'),
    ...rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(';'))
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── PDF helpers ──────────────────────────────────────────
const CORP_STYLES = `
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; max-width: 900px; margin: 0 auto; padding: 24px; }
  h1 { color: #1a1a1a; border-bottom: 3px solid #93d600; padding-bottom: 8px; font-size: 22px; }
  h2 { color: #333; font-size: 16px; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  th { background: #f5f5f5; text-align: left; padding: 8px; border: 1px solid #ddd; font-weight: 600; }
  td { padding: 8px; border: 1px solid #ddd; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge-leve { background: #93d60020; color: #93d600; }
  .badge-grave { background: #f59e0b20; color: #f59e0b; }
  .badge-muy_grave { background: #ef444420; color: #ef4444; }
  .kpi { display: inline-block; text-align: center; padding: 12px 20px; margin: 4px; border: 1px solid #ddd; border-radius: 12px; min-width: 100px; }
  .kpi-value { font-size: 28px; font-weight: 700; color: #93d600; }
  .kpi-label { font-size: 11px; color: #666; margin-top: 2px; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #999; }
  .section { background: #f9f9f9; padding: 12px; border-radius: 8px; margin: 8px 0; }
  @media print { body { padding: 0; } .no-print { display: none; } }
`;

function openPrintWindow(title: string, bodyHtml: string) {
  const w = window.open("", "_blank");
  if (!w) { toast.error("No se pudo abrir ventana"); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${CORP_STYLES}</style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

function gravedadBadge(g: string) {
  const labels: Record<string, string> = { leve: 'Leve', grave: 'Grave', muy_grave: 'Muy grave' };
  return `<span class="badge badge-${g}">${labels[g] || g}</span>`;
}

// ── Component ────────────────────────────────────────────
export function AdminExportPanel() {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [departments, setDepartments] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [propuestas, setPropuestas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Worker report
  const [wrDeptId, setWrDeptId] = useState("");
  const [wrWorkerId, setWrWorkerId] = useState("");
  const [wrFrom, setWrFrom] = useState("");
  const [wrTo, setWrTo] = useState("");

  // Department report
  const [drDeptId, setDrDeptId] = useState("");
  const [drFrom, setDrFrom] = useState("");
  const [drTo, setDrTo] = useState("");

  // Dossier
  const [dossierId, setDossierId] = useState("");

  // Global CSV
  const [csvFrom, setCsvFrom] = useState("");
  const [csvTo, setCsvTo] = useState("");
  const [csvDeptId, setCsvDeptId] = useState("");
  const [csvGravedad, setCsvGravedad] = useState("");
  const [csvEstado, setCsvEstado] = useState("");
  const [csvFormat, setCsvFormat] = useState("incidencias");

  // Load departments
  useEffect(() => {
    (async () => {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "listIncidenciasDepartments", sessionToken },
      });
      setDepartments(data?.departments || []);
    })();
  }, [sessionToken]);

  // Load workers when dept selected
  useEffect(() => {
    if (!wrDeptId) { setWorkers([]); return; }
    (async () => {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "listIncidenciasWorkers", sessionToken, departmentId: wrDeptId },
      });
      setWorkers(data?.workers || []);
    })();
  }, [wrDeptId, sessionToken]);

  // Load propuestas
  useEffect(() => {
    (async () => {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "listPropuestas", sessionToken },
      });
      setPropuestas(data?.propuestas || []);
    })();
  }, [sessionToken]);

  // ── Worker Report ──────────────────────────────────────
  const generateWorkerReport = async (mode: 'pdf' | 'csv') => {
    if (!wrWorkerId) { toast.error("Selecciona un trabajador"); return; }
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "exportWorkerReport", sessionToken, workerId: wrWorkerId, dateFrom: wrFrom || undefined, dateTo: wrTo || undefined },
      });
      if (!data?.success) { toast.error(data?.error || "Error"); return; }

      if (mode === 'csv') {
        const rows = (data.records || []).map((r: any) => ({
          Fecha: new Date(r.fecha).toLocaleDateString('es-ES'),
          Categoría: r.incidencias_categories?.name || '',
          Gravedad: r.incidencias_categories?.gravedad || '',
          Descripción: r.descripcion || '',
          Estado: r.estado,
          'IA Gravedad': r.ai_gravedad_sugerida || '',
          'IA Riesgo': r.ai_riesgo_reincidencia || '',
        }));
        downloadCSV(rows, `informe-trabajador-${data.worker?.nombre || 'export'}.csv`);
        return;
      }

      // PDF
      const w = data.worker;
      const records = data.records || [];
      const sc = data.severityCounts || {};
      const rank = data.ranking || {};
      const workerName = [w?.nombre, w?.apellidos].filter(Boolean).join(' ');

      let recordsHtml = records.map((r: any) => `<tr>
        <td>${new Date(r.fecha).toLocaleDateString('es-ES')}</td>
        <td>${r.incidencias_categories?.name || '—'}</td>
        <td>${gravedadBadge(r.incidencias_categories?.gravedad || 'leve')}</td>
        <td>${(r.descripcion || '').substring(0, 120)}</td>
        <td>${r.estado}</td>
      </tr>`).join('');

      const proposalsHtml = (data.proposals || []).map((p: any) => `<tr>
        <td>${new Date(p.created_at).toLocaleDateString('es-ES')}</td>
        <td>${p.tipo}</td>
        <td>${gravedadBadge(p.gravedad)}</td>
        <td>${p.estado}</td>
        <td>${p.suspension_dias || '—'}</td>
      </tr>`).join('');

      const html = `
        <h1>📋 Informe de Trabajador</h1>
        <p style="color:#666;">Generado: ${new Date().toLocaleString('es-ES')} · Panel Producción</p>
        <h2>Datos del trabajador</h2>
        <table><tr><th>Nombre</th><td>${workerName}</td><th>Nº</th><td>${w?.worker_number || '—'}</td></tr>
        <tr><th>Departamento</th><td>${data.department?.name || '—'}</td><th>Email</th><td>${w?.email || '—'}</td></tr></table>
        <div style="margin:16px 0;">
          <div class="kpi"><div class="kpi-value">${records.length}</div><div class="kpi-label">Total incidencias</div></div>
          <div class="kpi"><div class="kpi-value" style="color:#93d600">${sc.leve || 0}</div><div class="kpi-label">Leves</div></div>
          <div class="kpi"><div class="kpi-value" style="color:#f59e0b">${sc.grave || 0}</div><div class="kpi-label">Graves</div></div>
          <div class="kpi"><div class="kpi-value" style="color:#ef4444">${sc.muy_grave || 0}</div><div class="kpi-label">Muy graves</div></div>
          <div class="kpi"><div class="kpi-value">#${rank.position || '—'}</div><div class="kpi-label">Ranking (de ${rank.total || '—'})</div></div>
        </div>
        <h2>Incidencias</h2>
        <table><thead><tr><th>Fecha</th><th>Categoría</th><th>Gravedad</th><th>Descripción</th><th>Estado</th></tr></thead>
        <tbody>${recordsHtml || '<tr><td colspan="5" style="text-align:center">Sin incidencias</td></tr>'}</tbody></table>
        ${(data.proposals || []).length > 0 ? `<h2>Propuestas disciplinarias</h2>
        <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Gravedad</th><th>Estado</th><th>Días susp.</th></tr></thead>
        <tbody>${proposalsHtml}</tbody></table>` : ''}
        <div class="footer">Informe generado automáticamente por Panel Producción · ${new Date().toLocaleDateString('es-ES')}</div>
      `;
      openPrintWindow(`Informe ${workerName}`, html);
    } catch { toast.error("Error al generar informe"); }
    finally { setLoading(false); }
  };

  // ── Department Report ──────────────────────────────────
  const generateDeptReport = async (mode: 'pdf' | 'csv') => {
    if (!drDeptId) { toast.error("Selecciona un departamento"); return; }
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "exportDepartmentReport", sessionToken, departmentId: drDeptId, dateFrom: drFrom || undefined, dateTo: drTo || undefined },
      });
      if (!data?.success) { toast.error(data?.error || "Error"); return; }

      if (mode === 'csv') {
        const rows = (data.workerRanking || []).map((w: any) => ({
          Trabajador: w.worker_name,
          'Nº incidencias': w.count,
        }));
        if (rows.length === 0) rows.push({ Trabajador: 'Sin datos', 'Nº incidencias': 0 });
        downloadCSV(rows, `informe-departamento-${data.department?.name || 'export'}.csv`);
        return;
      }

      const sc = data.severityCounts || {};
      const rankingRows = (data.workerRanking || []).map((w: any, i: number) => `<tr><td>${i + 1}</td><td>${w.worker_name}</td><td>${w.count}</td></tr>`).join('');
      const catRows = (data.topCategories || []).map((c: any) => `<tr><td>${c.name}</td><td>${c.count}</td></tr>`).join('');

      const html = `
        <h1>📊 Informe de Departamento</h1>
        <p style="color:#666;">Departamento: <strong>${data.department?.name || '—'}</strong> · Generado: ${new Date().toLocaleString('es-ES')}</p>
        ${drFrom || drTo ? `<p style="color:#666;">Periodo: ${drFrom || '—'} a ${drTo || '—'}</p>` : ''}
        <div style="margin:16px 0;">
          <div class="kpi"><div class="kpi-value">${data.totalIncidencias || 0}</div><div class="kpi-label">Total incidencias</div></div>
          <div class="kpi"><div class="kpi-value" style="color:#93d600">${sc.leve || 0}</div><div class="kpi-label">Leves</div></div>
          <div class="kpi"><div class="kpi-value" style="color:#f59e0b">${sc.grave || 0}</div><div class="kpi-label">Graves</div></div>
          <div class="kpi"><div class="kpi-value" style="color:#ef4444">${sc.muy_grave || 0}</div><div class="kpi-label">Muy graves</div></div>
          <div class="kpi"><div class="kpi-value">${data.reincidentes || 0}</div><div class="kpi-label">Reincidentes (≥3)</div></div>
          <div class="kpi"><div class="kpi-value">${data.avgResolutionHours || 0}h</div><div class="kpi-label">Tiempo medio resolución</div></div>
        </div>
        <h2>Ranking trabajadores</h2>
        <table><thead><tr><th>#</th><th>Trabajador</th><th>Incidencias</th></tr></thead>
        <tbody>${rankingRows || '<tr><td colspan="3" style="text-align:center">Sin datos</td></tr>'}</tbody></table>
        <h2>Categorías más frecuentes</h2>
        <table><thead><tr><th>Categoría</th><th>Nº incidencias</th></tr></thead>
        <tbody>${catRows || '<tr><td colspan="2" style="text-align:center">Sin datos</td></tr>'}</tbody></table>
        <div class="footer">Panel Producción · ${new Date().toLocaleDateString('es-ES')}</div>
      `;
      openPrintWindow(`Informe ${data.department?.name}`, html);
    } catch { toast.error("Error al generar informe"); }
    finally { setLoading(false); }
  };

  // ── Dossier ────────────────────────────────────────────
  const generateDossier = async () => {
    if (!dossierId) { toast.error("Selecciona una propuesta"); return; }
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "exportProposalDossier", sessionToken, propuestaId: dossierId },
      });
      if (!data?.success) { toast.error(data?.error || "Error"); return; }

      const p = data.propuesta;
      const r = data.record;
      const workers = (data.workers || []).map((w: any) => w.worker_name).join(', ');
      const gravedadLabels: Record<string, string> = { leve: 'Leve', grave: 'Grave', muy_grave: 'Muy grave' };

      const historyRows = (data.workerHistory || []).map((h: any) => `<tr>
        <td>${new Date(h.fecha).toLocaleDateString('es-ES')}</td>
        <td>${(h.incidencias_categories as any)?.name || '—'}</td>
        <td>${gravedadBadge((h.incidencias_categories as any)?.gravedad || 'leve')}</td>
        <td>${(h.descripcion || '').substring(0, 100)}</td>
      </tr>`).join('');

      const pruebasHtml = (data.signedPruebas || []).map((sp: any, i: number) => {
        const isImage = sp.signed.match(/\.(jpg|jpeg|png|gif|webp)/i);
        return isImage
          ? `<div style="display:inline-block;margin:4px;"><img src="${sp.signed}" style="max-width:200px;max-height:150px;border-radius:8px;border:1px solid #ddd;" /><br><small>Prueba ${i + 1}</small></div>`
          : `<a href="${sp.signed}" target="_blank" style="color:#2563eb;">📎 Archivo adjunto ${i + 1}</a><br>`;
      }).join('');

      const logsRows = (data.auditLogs || []).slice(0, 20).map((l: any) => `<tr>
        <td style="font-size:11px">${new Date(l.created_at).toLocaleString('es-ES')}</td>
        <td style="font-size:11px">${l.action_type}</td>
        <td style="font-size:11px">${l.actor_name}</td>
        <td style="font-size:11px">${(l.details || '').substring(0, 80)}</td>
      </tr>`).join('');

      const articulos = r?.ai_articulos_relevantes;
      const articulosHtml = Array.isArray(articulos) && articulos.length > 0
        ? `<div class="section"><strong>📜 Artículos del convenio aplicables:</strong><br>${articulos.join(', ')}</div>` : '';

      const html = `
        <h1>📑 Dossier de Propuesta Disciplinaria</h1>
        <p style="color:#666;">Generado: ${new Date().toLocaleString('es-ES')} · Confidencial — Control de Incidencias VNProd</p>

        <h2>Resumen ejecutivo</h2>
        <table>
          <tr><th>Trabajador(es)</th><td>${workers}</td></tr>
          <tr><th>Departamento</th><td>${data.department?.name || '—'}</td></tr>
          <tr><th>Tipo</th><td>${p?.tipo === 'amonestacion' ? 'Amonestación' : 'Sanción'}</td></tr>
          <tr><th>Gravedad</th><td>${gravedadBadge(p?.gravedad || 'leve')} ${gravedadLabels[p?.gravedad] || ''}</td></tr>
          ${p?.suspension_dias ? `<tr><th>Días de suspensión</th><td>${p.suspension_dias}</td></tr>` : ''}
          <tr><th>Estado</th><td>${p?.estado}</td></tr>
          <tr><th>Fecha de los hechos</th><td>${r ? new Date(r.fecha).toLocaleDateString('es-ES') : '—'}</td></tr>
          <tr><th>Categoría</th><td>${r?.incidencias_categories?.name || '—'}</td></tr>
        </table>

        <h2>Descripción de los hechos</h2>
        <div class="section">${r?.descripcion || 'Sin descripción'}</div>

        ${r?.ai_motivo_legal ? `<h2>Análisis IA</h2><div class="section" style="border-left:4px solid #93d600;">${r.ai_motivo_legal}</div>` : ''}
        ${articulosHtml}

        ${pruebasHtml ? `<h2>Pruebas adjuntas</h2><div>${pruebasHtml}</div>` : ''}

        ${(data.workerHistory || []).length > 0 ? `<h2>Historial previo del trabajador</h2>
        <table><thead><tr><th>Fecha</th><th>Categoría</th><th>Gravedad</th><th>Descripción</th></tr></thead>
        <tbody>${historyRows}</tbody></table>` : ''}

        ${logsRows ? `<h2>Trazabilidad (audit log)</h2>
        <table><thead><tr><th>Fecha</th><th>Acción</th><th>Actor</th><th>Detalles</th></tr></thead>
        <tbody>${logsRows}</tbody></table>` : ''}

        <div class="footer">
          ${p?.aprobada_por ? `Aprobado por: ${p.aprobada_por} · ${p.aprobada_at ? new Date(p.aprobada_at).toLocaleDateString('es-ES') : ''}<br>` : ''}
          Documento generado automáticamente · Control de Incidencias · VNProd
        </div>
      `;
      openPrintWindow('Dossier Propuesta', html);
    } catch { toast.error("Error al generar dossier"); }
    finally { setLoading(false); }
  };

  // ── Global CSV ─────────────────────────────────────────
  const exportGlobalCSV = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "exportIncidenciasCSV", sessionToken,
          dateFrom: csvFrom || undefined, dateTo: csvTo || undefined,
          departmentId: csvDeptId || undefined, gravedad: csvGravedad || undefined,
          estado: csvEstado || undefined, format: csvFormat,
        },
      });
      if (!data?.success) { toast.error(data?.error || "Error"); return; }
      downloadCSV(data.rows || [], `export-${csvFormat}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { toast.error("Error"); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <p className="text-sm text-muted-foreground">Exportaciones oficiales, informes RRHH y trazabilidad legal</p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Worker Report */}
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Informe por trabajador</CardTitle>
            <CardDescription className="text-xs">Genera un informe completo de un trabajador con ranking, incidencias y propuestas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={wrDeptId} onValueChange={v => { setWrDeptId(v); setWrWorkerId(""); }}>
              <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue placeholder="Departamento" /></SelectTrigger>
              <SelectContent>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={wrWorkerId} onValueChange={setWrWorkerId} disabled={!wrDeptId}>
              <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue placeholder="Trabajador" /></SelectTrigger>
              <SelectContent>
                {workers.filter(w => w.activo).map(w => (
                  <SelectItem key={w.id} value={w.id}>{[w.nombre, w.apellidos].filter(Boolean).join(' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[10px] text-muted-foreground">Desde</label><Input type="date" value={wrFrom} onChange={e => setWrFrom(e.target.value)} className="rounded-xl h-9 text-sm" /></div>
              <div><label className="text-[10px] text-muted-foreground">Hasta</label><Input type="date" value={wrTo} onChange={e => setWrTo(e.target.value)} className="rounded-xl h-9 text-sm" /></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-8 rounded-xl gap-1" onClick={() => generateWorkerReport('pdf')} disabled={loading}>
                <FileText className="h-3 w-3" /> PDF
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-8 rounded-xl gap-1" onClick={() => generateWorkerReport('csv')} disabled={loading}>
                <Download className="h-3 w-3" /> CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Department Report */}
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Informe por departamento</CardTitle>
            <CardDescription className="text-xs">KPIs, ranking, categorías y tiempos de resolución</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={drDeptId} onValueChange={setDrDeptId}>
              <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue placeholder="Departamento" /></SelectTrigger>
              <SelectContent>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[10px] text-muted-foreground">Desde</label><Input type="date" value={drFrom} onChange={e => setDrFrom(e.target.value)} className="rounded-xl h-9 text-sm" /></div>
              <div><label className="text-[10px] text-muted-foreground">Hasta</label><Input type="date" value={drTo} onChange={e => setDrTo(e.target.value)} className="rounded-xl h-9 text-sm" /></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-8 rounded-xl gap-1" onClick={() => generateDeptReport('pdf')} disabled={loading}>
                <FileText className="h-3 w-3" /> PDF
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-8 rounded-xl gap-1" onClick={() => generateDeptReport('csv')} disabled={loading}>
                <Download className="h-3 w-3" /> CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Dossier */}
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Scale className="h-4 w-4 text-primary" /> Dossier propuesta sanción</CardTitle>
            <CardDescription className="text-xs">PDF formal con hechos, pruebas, análisis IA, artículos y trazabilidad</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={dossierId} onValueChange={setDossierId}>
              <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue placeholder="Seleccionar propuesta" /></SelectTrigger>
              <SelectContent>
                {propuestas.map(p => {
                  const wNames = (p.workers || []).map((w: any) => w.worker_name).join(', ');
                  return <SelectItem key={p.id} value={p.id}>{wNames || 'Sin nombre'} — {p.estado}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            <Button size="sm" className="w-full h-8 rounded-xl gap-1" onClick={generateDossier} disabled={loading || !dossierId}>
              <FileText className="h-3 w-3" /> Generar dossier PDF
            </Button>
          </CardContent>
        </Card>

        {/* Global CSV */}
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Exportación global</CardTitle>
            <CardDescription className="text-xs">Descarga CSV de incidencias, propuestas o logs de auditoría</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={csvFormat} onValueChange={setCsvFormat}>
              <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="incidencias">Incidencias</SelectItem>
                <SelectItem value="propuestas">Propuestas</SelectItem>
                <SelectItem value="logs">Logs auditoría</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[10px] text-muted-foreground">Desde</label><Input type="date" value={csvFrom} onChange={e => setCsvFrom(e.target.value)} className="rounded-xl h-9 text-sm" /></div>
              <div><label className="text-[10px] text-muted-foreground">Hasta</label><Input type="date" value={csvTo} onChange={e => setCsvTo(e.target.value)} className="rounded-xl h-9 text-sm" /></div>
            </div>
            <Select value={csvDeptId} onValueChange={setCsvDeptId}>
              <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue placeholder="Todos los departamentos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {csvFormat === 'incidencias' && (
              <Select value={csvGravedad} onValueChange={setCsvGravedad}>
                <SelectTrigger className="rounded-xl h-9 text-sm"><SelectValue placeholder="Todas las gravedades" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="leve">Leve</SelectItem>
                  <SelectItem value="grave">Grave</SelectItem>
                  <SelectItem value="muy_grave">Muy grave</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button size="sm" className="w-full h-8 rounded-xl gap-1" onClick={exportGlobalCSV} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Descargar CSV
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
