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

    const results = {
      reincidentes: 0,
      propuestasPendientes: 0,
      prescripciones: 0,
      recordatorios: 0,
      escaladoAuto: 0,
    };

    // ── Helper: create task with deduplication ──
    async function createTask(
      deptId: string, type: string, refId: string | null,
      title: string, description: string | null, dueAt: string | null
    ) {
      // Check for duplicate in last 24h
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const dupQuery = supabase
        .from('incidencias_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('department_id', deptId)
        .eq('type', type)
        .eq('status', 'pending')
        .gte('created_at', dayAgo);

      if (refId) dupQuery.eq('ref_id', refId);

      const { count } = await dupQuery;
      if ((count || 0) > 0) return null;

      const { data } = await supabase.from('incidencias_tasks').insert({
        department_id: deptId,
        type,
        ref_id: refId,
        title,
        description,
        due_at: dueAt,
      }).select('id').single();
      return data?.id || null;
    }

    // ── Helper: create notification with deduplication ──
    async function createNotification(
      userId: string, role: string, type: string,
      title: string, message: string, link: string | null
    ) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('incidencias_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', type)
        .eq('title', title)
        .gte('created_at', dayAgo);

      if ((count || 0) > 0) return;

      await supabase.from('incidencias_notifications').insert({
        user_id: userId, role, type, title, message, link,
      });
    }

    // ── Helper: get all admin manager IDs ──
    const { data: admins } = await supabase
      .from('managers')
      .select('id')
      .eq('role', 'admin');
    const adminIds = (admins || []).map(a => a.id);

    // ══════════════════════════════════════════════
    // A) DETECCIÓN DE REINCIDENTES
    // ══════════════════════════════════════════════
    const { data: rules } = await supabase
      .from('incidencias_reglas_departamento')
      .select('*')
      .eq('activar_automatico', true);

    for (const rule of (rules || [])) {
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - rule.periodo_dias_evaluacion);

      // Get all records in this dept within period
      const { data: deptRecords } = await supabase
        .from('incidencias_records')
        .select('id, incidencias_categories(gravedad)')
        .eq('department_id', rule.department_id)
        .gte('fecha', periodStart.toISOString())
        .is('deleted_at', null);

      if (!deptRecords || deptRecords.length === 0) continue;

      const recIds = deptRecords.map(r => r.id);
      const { data: rw } = await supabase
        .from('incidencias_record_workers')
        .select('worker_id, worker_name, record_id')
        .in('record_id', recIds);

      // Group by worker
      const workerRecords: Record<string, { name: string; recordIds: string[] }> = {};
      for (const w of (rw || [])) {
        if (!workerRecords[w.worker_id]) workerRecords[w.worker_id] = { name: w.worker_name, recordIds: [] };
        workerRecords[w.worker_id].recordIds.push(w.record_id);
      }

      // Check thresholds per worker
      for (const [workerId, wData] of Object.entries(workerRecords)) {
        const counts = { leve: 0, grave: 0, muy_grave: 0 };
        for (const recId of wData.recordIds) {
          const rec = deptRecords.find(r => r.id === recId);
          const g = (rec?.incidencias_categories as any)?.gravedad || 'leve';
          counts[g as keyof typeof counts]++;
        }

        const exceeds =
          counts.leve >= rule.umbral_leves ||
          counts.grave >= rule.umbral_graves ||
          counts.muy_grave >= rule.umbral_muy_graves;

        if (exceeds) {
          const taskId = await createTask(
            rule.department_id, 'evaluar_reincidencia', workerId,
            `Reincidente: ${wData.name}`,
            `${counts.leve} leves, ${counts.grave} graves, ${counts.muy_grave} muy graves en ${rule.periodo_dias_evaluacion} días`,
            null
          );
          if (taskId) {
            results.reincidentes++;
            // Notify admins
            for (const adminId of adminIds) {
              await createNotification(adminId, 'admin', 'reincidencia',
                `Reincidente detectado: ${wData.name}`,
                `Supera umbrales en el periodo de evaluación`,
                '/incidencias'
              );
            }
            // Notify department managers
            const { data: deptManagers } = await supabase
              .from('incidencias_department_managers')
              .select('manager_id')
              .eq('department_id', rule.department_id);
            for (const dm of (deptManagers || [])) {
              await createNotification(dm.manager_id, 'encargado', 'reincidencia',
                `Reincidente: ${wData.name}`,
                `Supera umbrales de incidencias`,
                '/incidencias'
              );
            }
          }
        }
      }
    }

    // ══════════════════════════════════════════════
    // B) PROPUESTAS SIN REVISAR > 24H
    // ══════════════════════════════════════════════
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: pendingProps } = await supabase
      .from('incidencias_propuestas_rrhh')
      .select('id, department_id, record_id, created_at')
      .eq('estado', 'pendiente')
      .lt('created_at', dayAgo);

    for (const prop of (pendingProps || [])) {
      const taskId = await createTask(
        prop.department_id, 'revisar_propuesta', prop.id,
        'Propuesta pendiente > 24h',
        `Propuesta creada el ${new Date(prop.created_at).toLocaleDateString('es-ES')} sin revisar`,
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      );
      if (taskId) {
        results.propuestasPendientes++;
        for (const adminId of adminIds) {
          await createNotification(adminId, 'admin', 'propuesta',
            'Propuesta pendiente de revisión',
            `Lleva más de 24h sin revisar`,
            '/incidencias'
          );
        }
      }
    }

    // ══════════════════════════════════════════════
    // C) PRESCRIPCIONES PRÓXIMAS (48H)
    // ══════════════════════════════════════════════
    const prescriptionDays: Record<string, number> = { leve: 10, grave: 20, muy_grave: 60 };

    const { data: openRecords } = await supabase
      .from('incidencias_records')
      .select('id, fecha, department_id, incidencias_categories(gravedad)')
      .eq('estado', 'abierta')
      .is('deleted_at', null);

    for (const rec of (openRecords || [])) {
      const gravedad = (rec.incidencias_categories as any)?.gravedad || 'leve';
      const days = prescriptionDays[gravedad] || 10;
      const prescriptionDate = new Date(rec.fecha);
      prescriptionDate.setDate(prescriptionDate.getDate() + days);

      const now = new Date();
      const hoursUntil = (prescriptionDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntil > 0 && hoursUntil <= 48) {
        const taskId = await createTask(
          rec.department_id, 'prescripcion', rec.id,
          `Prescripción en ${Math.round(hoursUntil)}h`,
          `Incidencia ${gravedad} prescribe el ${prescriptionDate.toLocaleDateString('es-ES')}`,
          prescriptionDate.toISOString()
        );
        if (taskId) {
          results.prescripciones++;
          for (const adminId of adminIds) {
            await createNotification(adminId, 'admin', 'prescripcion',
              `⏰ Prescripción cercana`,
              `Una incidencia ${gravedad} prescribe en ${Math.round(hoursUntil)}h`,
              '/incidencias'
            );
          }
        }
      }
    }

    // ══════════════════════════════════════════════
    // D) PROPUESTAS APROBADAS SIN EMAIL
    // ══════════════════════════════════════════════
    const { data: approvedProps } = await supabase
      .from('incidencias_propuestas_rrhh')
      .select('id, department_id, aprobada_at')
      .eq('estado', 'aprobada');

    for (const prop of (approvedProps || [])) {
      // Check if email was sent via audit logs
      const { count: emailCount } = await supabase
        .from('incidencias_audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('propuesta_id', prop.id)
        .eq('action_type', 'enviar_email_propuesta');

      if ((emailCount || 0) === 0) {
        const taskId = await createTask(
          prop.department_id, 'recordatorio_rrhh', prop.id,
          'Propuesta aprobada sin enviar a RRHH',
          `Aprobada el ${new Date(prop.aprobada_at!).toLocaleDateString('es-ES')} pero no se ha enviado el email`,
          null
        );
        if (taskId) {
          results.recordatorios++;
          for (const adminId of adminIds) {
            await createNotification(adminId, 'admin', 'recordatorio',
              'Propuesta sin enviar a RRHH',
              'Hay una propuesta aprobada pendiente de envío',
              '/incidencias'
            );
          }
        }
      }
    }

    // ══════════════════════════════════════════════
    // E) ESCALADO AUTOMÁTICO (cadenas de reglas)
    // ══════════════════════════════════════════════
    // Load global rules + department rules with escalado_reglas
    const [{ data: globalRuleRow }, { data: deptRulesAll }] = await Promise.all([
      supabase.from('incidencias_reglas_globales').select('*').limit(1).maybeSingle(),
      supabase.from('incidencias_reglas_departamento').select('department_id, escalado_reglas').not('escalado_reglas', 'eq', '[]'),
    ]);

    const globalEscalado = (globalRuleRow?.escalado_reglas || []) as any[];
    const deptEscaladoMap: Record<string, any[]> = {};
    for (const dr of (deptRulesAll || [])) {
      if (Array.isArray(dr.escalado_reglas) && dr.escalado_reglas.length > 0) {
        deptEscaladoMap[dr.department_id] = dr.escalado_reglas;
      }
    }

    // Only process if there are any escalado rules
    if (globalEscalado.length > 0 || Object.keys(deptEscaladoMap).length > 0) {
      // Get recent records (last 365 days max)
      const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentRecords } = await supabase
        .from('incidencias_records')
        .select('id, department_id, fecha, tipo, category_id')
        .gte('fecha', yearAgo)
        .is('deleted_at', null);

      const { data: recentWorkerLinks } = await supabase
        .from('incidencias_record_workers')
        .select('worker_id, worker_name, record_id')
        .in('record_id', (recentRecords || []).map(r => r.id));

      // Group records by worker
      const workerData: Record<string, {
        name: string;
        records: Array<{ id: string; dept_id: string; fecha: string; tipo: string; category_id: string | null }>;
      }> = {};

      for (const link of (recentWorkerLinks || [])) {
        const rec = (recentRecords || []).find(r => r.id === link.record_id);
        if (!rec) continue;
        if (!workerData[link.worker_id]) workerData[link.worker_id] = { name: link.worker_name, records: [] };
        workerData[link.worker_id].records.push({
          id: rec.id, dept_id: rec.department_id, fecha: rec.fecha, tipo: rec.tipo, category_id: rec.category_id,
        });
      }

      // Evaluate escalado rules for each worker
      for (const [workerId, wData] of Object.entries(workerData)) {
        // Determine which departments this worker has records in
        const workerDepts = [...new Set(wData.records.map(r => r.dept_id))];

        for (const deptId of workerDepts) {
          // Use dept-specific rules if available, otherwise global
          const escaladoRules = deptEscaladoMap[deptId] || globalEscalado;

          for (const rule of escaladoRules) {
            if (!rule.activa) continue;

            const periodStart = new Date(Date.now() - (rule.periodo_dias || 90) * 24 * 60 * 60 * 1000);
            
            // Filter records by period and optionally by category
            const matchingRecords = wData.records.filter(r => {
              if (new Date(r.fecha) < periodStart) return false;
              if (r.dept_id !== deptId) return false;
              if (rule.tipo_origen === 'incidencia' && r.tipo !== 'incidencia') return false;
              if (rule.tipo_origen === 'amonestacion' && r.tipo !== 'amonestacion') return false;
              if (rule.requiere_misma_razon && rule.categoria_id && r.category_id !== rule.categoria_id) return false;
              if (!rule.requiere_misma_razon && rule.categoria_id && r.category_id !== rule.categoria_id) return false;
              return true;
            });

            if (matchingRecords.length >= (rule.umbral_cantidad || 5)) {
              // Check requiere_previa
              if (rule.requiere_previa) {
                const hasPrevious = wData.records.some(r =>
                  r.tipo === rule.requiere_previa &&
                  new Date(r.fecha) >= periodStart
                );
                if (!hasPrevious) continue;
              }

              // Create automatic proposal
              const proposalType = rule.accion_resultado === 'amonestacion' ? 'amonestacion' : 'sancion';
              const proposalGravedad = rule.accion_resultado === 'sancion_leve' ? 'leve'
                : rule.accion_resultado === 'sancion_grave' ? 'grave'
                : rule.accion_resultado === 'sancion_muy_grave' ? 'muy_grave'
                : 'leve';

              // Use the most recent matching record as reference
              const refRecord = matchingRecords.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];

              const taskId = await createTask(
                deptId, 'escalado_auto', `${workerId}_${rule.accion_resultado}`,
                `Escalado auto: ${wData.name} → ${rule.accion_resultado}`,
                `${matchingRecords.length} ${rule.tipo_origen}s en ${rule.periodo_dias}d. Acción: ${rule.accion_resultado}${rule.dias_suspension ? ` (${rule.dias_suspension}d)` : ''}`,
                null
              );

              if (taskId) {
                results.escaladoAuto++;
                for (const adminId of adminIds) {
                  await createNotification(adminId, 'admin', 'escalado_auto',
                    `⚡ Escalado automático: ${wData.name}`,
                    `${matchingRecords.length} ${rule.tipo_origen}s → ${rule.accion_resultado}`,
                    '/incidencias'
                  );
                }
              }
            }
          }
        }
      }
    }

    // ══════════════════════════════════════════════
    // F) FIRMA TASKS PRÓXIMAS A PRESCRIBIR
    // ══════════════════════════════════════════════
    const prescriptionDaysFirma: Record<string, number> = { leve: 10, moderada: 10, grave: 20, muy_grave: 60 };

    const { data: pendingFirmaTasks } = await supabase
      .from('incidencias_firma_tasks')
      .select('id, legal_document_id, worker_name, status, created_at')
      .in('status', ['pending', 'awaiting_signature']);

    if (pendingFirmaTasks && pendingFirmaTasks.length > 0) {
      const firmaDocIds = pendingFirmaTasks.map((t: any) => t.legal_document_id).filter(Boolean);
      const { data: firmaDocs } = await supabase
        .from('incidencias_legal_documents')
        .select('id, gravedad_final, created_at, propuesta_id')
        .in('id', firmaDocIds);

      const firmaDocsMap: Record<string, any> = {};
      for (const d of (firmaDocs || [])) firmaDocsMap[d.id] = d;

      // Get dept from propuestas
      const firmaPropIds = [...new Set((firmaDocs || []).map((d: any) => d.propuesta_id).filter(Boolean))];
      const { data: firmaProps } = firmaPropIds.length > 0
        ? await supabase.from('incidencias_propuestas_rrhh').select('id, department_id').in('id', firmaPropIds)
        : { data: [] };
      const firmaPropMap: Record<string, string> = {};
      for (const p of (firmaProps || [])) firmaPropMap[p.id] = p.department_id;

      for (const ft of pendingFirmaTasks) {
        const doc = firmaDocsMap[ft.legal_document_id];
        if (!doc?.gravedad_final) continue;
        const totalDays = prescriptionDaysFirma[doc.gravedad_final] || 10;
        const created = new Date(doc.created_at);
        const deadline = new Date(created.getTime() + totalDays * 24 * 60 * 60 * 1000);
        const now = new Date();
        const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (hoursLeft > 0 && hoursLeft <= 72) {
          const deptId = firmaPropMap[doc.propuesta_id] || 'unknown';
          const daysLeft = Math.ceil(hoursLeft / 24);
          const taskId = await createTask(
            deptId, 'prescripcion', ft.id,
            `⏰ Firma prescribe en ${daysLeft}d: ${ft.worker_name}`,
            `Documento ${doc.gravedad_final} creado el ${created.toLocaleDateString('es-ES')}. Prescribe el ${deadline.toLocaleDateString('es-ES')}`,
            deadline.toISOString()
          );
          if (taskId) {
            results.prescripciones++;
            for (const adminId of adminIds) {
              await createNotification(adminId, 'admin', 'prescripcion',
                `⏰ Firma pendiente prescribe en ${daysLeft}d`,
                `${ft.worker_name} — documento ${doc.gravedad_final}`,
                '/incidencias'
              );
            }
          }
        }
      }
    }

    console.log('Automation cron results:', results);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Automation cron error:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
