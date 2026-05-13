import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
    const d60 = new Date(now.getTime() - 60 * 86400000).toISOString();
    const d90 = new Date(now.getTime() - 90 * 86400000).toISOString();

    // ── 1) Fetch all data ──
    const [recordsRes, rwRes, workersRes, deptsRes, propuestasRes, prevWorkerStatsRes] = await Promise.all([
      supabase.from('incidencias_records').select('id, fecha, department_id, category_id, estado, created_at, updated_at, deleted_at, incidencias_categories(gravedad)').is('deleted_at', null),
      supabase.from('incidencias_record_workers').select('record_id, worker_id'),
      supabase.from('incidencias_workers').select('id, department_id, activo, nombre, apellidos'),
      supabase.from('incidencias_departments').select('id, name').eq('active', true),
      supabase.from('incidencias_propuestas_rrhh').select('id, department_id, estado, created_at'),
      supabase.from('incidencias_worker_stats').select('worker_id, riesgo_score'),
    ]);

    const records = recordsRes.data;
    const recordWorkers = rwRes.data;
    const workers = workersRes.data;
    const departments = deptsRes.data;
    const propuestas = propuestasRes.data;
    const prevWorkerStats = prevWorkerStatsRes.data;

    if (!records || !recordWorkers || !workers || !departments) {
      return new Response(JSON.stringify({ success: false, error: 'Failed to fetch data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build previous risk lookup
    const prevRiskMap = new Map<string, number>();
    for (const ps of prevWorkerStats || []) {
      prevRiskMap.set(ps.worker_id, ps.riesgo_score);
    }

    // Build worker name lookup
    const workerNameMap = new Map<string, string>();
    for (const w of workers) {
      workerNameMap.set(w.id, `${w.nombre}${w.apellidos ? ' ' + w.apellidos : ''}`);
    }

    // Build dept name lookup
    const deptNameMap = new Map<string, string>();
    for (const d of departments) {
      deptNameMap.set(d.id, d.name);
    }

    // Build lookup maps
    const rwByRecord = new Map<string, string[]>();
    for (const rw of recordWorkers) {
      const arr = rwByRecord.get(rw.record_id) || [];
      arr.push(rw.worker_id);
      rwByRecord.set(rw.record_id, arr);
    }

    const rwByWorker = new Map<string, typeof records>();
    for (const rec of records) {
      const wIds = rwByRecord.get(rec.id) || [];
      for (const wId of wIds) {
        const arr = rwByWorker.get(wId) || [];
        arr.push(rec);
        rwByWorker.set(wId, arr);
      }
    }

    // ── 2) Worker stats ──
    const workerStats: Array<Record<string, unknown>> = [];
    const notifications: Array<Record<string, unknown>> = [];

    for (const worker of workers) {
      const workerRecords = rwByWorker.get(worker.id) || [];
      if (workerRecords.length === 0 && !worker.activo) continue;

      const getGravedad = (rec: any): string => rec.incidencias_categories?.gravedad || 'leve';

      let leves = 0, graves = 0, muy_graves = 0;
      let u30 = 0, u60 = 0, u90 = 0;

      for (const rec of workerRecords) {
        const g = getGravedad(rec);
        if (g === 'leve') leves++;
        else if (g === 'grave') graves++;
        else if (g === 'muy_grave') muy_graves++;

        const fecha = rec.fecha || rec.created_at;
        if (fecha >= d30) u30++;
        if (fecha >= d60) u60++;
        if (fecha >= d90) u90++;
      }

      const reincidencias = workerRecords.length > 1 ? Math.max(0, workerRecords.length - 1) : 0;
      const riesgo_score = Math.min(100, leves * 5 + graves * 20 + muy_graves * 40 + u30 * 3 + reincidencias * 10);

      workerStats.push({
        worker_id: worker.id,
        department_id: worker.department_id,
        total_count: workerRecords.length,
        leves, graves, muy_graves,
        ultimos_30: u30, ultimos_60: u60, ultimos_90: u90,
        reincidencias, riesgo_score,
        updated_at: now.toISOString(),
      });

      // ── Proactive alerts ──
      const prevRisk = prevRiskMap.get(worker.id) || 0;
      const workerName = workerNameMap.get(worker.id) || 'Trabajador';

      if (riesgo_score >= 70 && prevRisk < 70) {
        // Escalation alert
        notifications.push({
          user_id: worker.department_id,
          role: 'admin',
          type: 'risk_escalation',
          title: `⚠️ Escalamiento de riesgo: ${workerName}`,
          message: `El riesgo de ${workerName} ha subido de ${prevRisk} a ${riesgo_score}. Requiere atención inmediata.`,
          link: '/control-incidencias',
        });
      } else if (riesgo_score >= 70) {
        // Only notify once per day for sustained high risk
        notifications.push({
          user_id: worker.department_id,
          role: 'admin',
          type: 'high_risk',
          title: `🔴 Riesgo alto sostenido: ${workerName}`,
          message: `${workerName} mantiene un riesgo de ${riesgo_score}/100 con ${workerRecords.length} incidencias.`,
          link: '/control-incidencias',
        });
      }
    }

    // Upsert worker stats
    if (workerStats.length > 0) {
      for (let i = 0; i < workerStats.length; i += 100) {
        await supabase.from('incidencias_worker_stats').upsert(workerStats.slice(i, i + 100), { onConflict: 'worker_id' });
      }
    }

    // ── 3) Department stats with day-of-week distribution ──
    const deptStats: Array<Record<string, unknown>> = [];

    for (const dept of departments) {
      const deptRecords = records.filter(r => r.department_id === dept.id);
      const deptWorkers = workers.filter(w => w.department_id === dept.id && w.activo);
      const deptWorkerStats = workerStats.filter(ws => ws.department_id === dept.id);

      const getGravedad = (rec: any): string => rec.incidencias_categories?.gravedad || 'leve';

      let leves = 0, graves = 0, muy_graves = 0;
      // Day of week distribution: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
      const dayDist = [0, 0, 0, 0, 0, 0, 0];

      for (const rec of deptRecords) {
        const g = getGravedad(rec);
        if (g === 'leve') leves++;
        else if (g === 'grave') graves++;
        else if (g === 'muy_grave') muy_graves++;

        // Calculate day of week
        const fecha = new Date(rec.fecha || rec.created_at);
        const dow = fecha.getDay(); // 0=Sun, 1=Mon...
        const idx = dow === 0 ? 6 : dow - 1; // Convert to Mon=0, Sun=6
        dayDist[idx]++;
      }

      // Peak day
      let diaPico = 0;
      let maxDay = 0;
      for (let i = 0; i < 7; i++) {
        if (dayDist[i] > maxDay) { maxDay = dayDist[i]; diaPico = i; }
      }

      const activeWorkerCount = Math.max(1, deptWorkers.length);
      const media = deptRecords.length / activeWorkerCount;
      const reincidentes = deptWorkerStats.filter(ws => (ws.riesgo_score as number) >= 40).length;

      // Resolution time
      const closedRecords = deptRecords.filter(r => r.estado === 'cerrada' || r.estado === 'sancionada');
      let tiempoMedio = 0;
      if (closedRecords.length > 0) {
        const totalDays = closedRecords.reduce((sum, r) => {
          return sum + (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 86400000;
        }, 0);
        tiempoMedio = Math.round((totalDays / closedRecords.length) * 10) / 10;
      }

      // Global risk
      const riesgoGlobal = deptWorkerStats.length > 0
        ? Math.round(deptWorkerStats.reduce((s, w) => s + (w.riesgo_score as number), 0) / deptWorkerStats.length)
        : 0;

      // Trend: compare last 30 days vs previous 30 days
      const last30 = deptRecords.filter(r => (r.fecha || r.created_at) >= d30).length;
      const prev30 = deptRecords.filter(r => {
        const f = r.fecha || r.created_at;
        return f >= d60 && f < d30;
      }).length;
      const tendencia = last30 > prev30 * 1.2 ? 'subiendo' : last30 < prev30 * 0.8 ? 'bajando' : 'estable';

      deptStats.push({
        department_id: dept.id,
        total: deptRecords.length,
        leves, graves, muy_graves,
        media_por_trabajador: Math.round(media * 100) / 100,
        reincidentes,
        tiempo_medio_resolucion: tiempoMedio,
        riesgo_global: riesgoGlobal,
        day_distribution: dayDist,
        dia_pico: diaPico,
        tendencia,
        updated_at: now.toISOString(),
      });

      // Department risk alert
      if (riesgoGlobal > 60) {
        notifications.push({
          user_id: dept.id,
          role: 'admin',
          type: 'department_risk',
          title: `🏢 Departamento en riesgo: ${dept.name}`,
          message: `${dept.name} tiene un riesgo global de ${riesgoGlobal}/100 con ${reincidentes} trabajadores reincidentes. Tendencia: ${tendencia}.`,
          link: '/control-incidencias',
        });
      }
    }

    if (deptStats.length > 0) {
      await supabase.from('incidencias_department_stats').upsert(deptStats, { onConflict: 'department_id' });
    }

    // ── 4) Daily metrics ──
    const dailyMetrics: Array<Record<string, unknown>> = [];
    for (const dept of departments) {
      const todayRecords = records.filter(r => r.department_id === dept.id && (r.fecha || r.created_at).startsWith(today));
      const todayPropuestas = (propuestas || []).filter(p => p.department_id === dept.id && p.created_at.startsWith(today));
      const todaySanciones = todayPropuestas.filter(p => p.estado === 'aprobada');
      const deptWS = workerStats.filter(ws => ws.department_id === dept.id);
      const todayReincidentes = deptWS.filter(ws => (ws.riesgo_score as number) >= 40).length;

      dailyMetrics.push({
        date: today,
        department_id: dept.id,
        total: todayRecords.length,
        propuestas: todayPropuestas.length,
        sanciones: todaySanciones.length,
        reincidentes: todayReincidentes,
      });
    }

    if (dailyMetrics.length > 0) {
      await supabase.from('incidencias_daily_metrics').upsert(dailyMetrics, { onConflict: 'date,department_id' });
    }

    // ── 5) Insert proactive notifications (deduplicated by today) ──
    if (notifications.length > 0) {
      // Check existing notifications from today to avoid duplicates
      const { data: existingNotifs } = await supabase
        .from('incidencias_notifications')
        .select('title, user_id')
        .gte('created_at', today + 'T00:00:00Z');

      const existingKeys = new Set((existingNotifs || []).map(n => `${n.user_id}:${n.title}`));

      const newNotifs = notifications.filter(n => !existingKeys.has(`${n.user_id}:${n.title}`));

      if (newNotifs.length > 0) {
        await supabase.from('incidencias_notifications').insert(newNotifs);
      }
    }

    console.log(`Analytics cron completed: ${workerStats.length} workers, ${deptStats.length} depts, ${dailyMetrics.length} daily, ${notifications.length} alerts`);

    return new Response(JSON.stringify({
      success: true,
      workers_updated: workerStats.length,
      departments_updated: deptStats.length,
      daily_metrics: dailyMetrics.length,
      alerts_generated: notifications.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Analytics cron error:', err);
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
