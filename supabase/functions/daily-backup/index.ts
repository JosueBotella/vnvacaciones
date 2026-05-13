import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TABLES_TO_BACKUP = [
  "annual_calendar_days","annual_calendars","custom_day_types","day_exception_requests",
  "department_availabilities","department_day_overrides","vacation_group_exchanges",
  "vacation_request_dates","vacation_requests","calendar_review_alerts",
  "worker_calendar_modifications","worker_day_exceptions",
  "departments","department_correction_requests","department_role_aliases",
  "department_schedule_rules","department_shifts","work_groups","work_group_teams",
  "worker_teams","group_join_requests","schedule_group_colors",
  "workers","worker_comments",
  "managers","manager_department_assignments","manager_sessions","login_attempts",
  "team_schedules","weekly_schedules","weekly_schedule_versions","weekly_shift_configs",
  "personal_calendars","personal_calendar_availabilities","personal_annual_calendars",
  "personal_annual_calendar_days","personal_annual_calendar_workers",
  "personal_schedule_rotation_groups","personal_schedule_worker_assignments",
  "personal_work_schedules","worker_personal_calendar_days",
  "justificantes","justificante_audit_logs","justificante_documentos",
  "justificante_gestiones","justificantes_settings",
  "hour_balances","hour_balance_imports","hour_balance_settings",
  "time_entries","time_entry_summaries","labor_import_history",
  "labor_incident_alerts","labor_module_settings",
  "incidencias_records","incidencias_record_workers","incidencias_categories",
  "incidencias_workers","incidencias_worker_stats","incidencias_departments",
  "incidencias_department_managers","incidencias_department_stats",
  "incidencias_daily_metrics","incidencias_propuestas_rrhh",
  "incidencias_reglas_departamento","incidencias_tasks","incidencias_audit_logs",
  "incidencias_notifications","incidencias_ai_config","incidencias_ai_memory_entries",
  "incidencias_email_config","incidencias_push_tokens","incidencias_firma_tasks",
  "incidencias_legal_documents","incidencias_training_documents",
  "psico_tests","psico_test_areas","psico_sessions","psico_questions",
  "psico_answers","psico_results","psico_test_questions",
  "app_settings","audit_logs","backup_history","rrhh_users",
  "security_events","system_user_roles","user_roles",
];

const STORAGE_BUCKETS_TO_BACKUP = ["assets", "justificantes", "incidencias-pruebas", "incidencias-training-docs"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// --- Schema export ---
async function exportSchema(supabase: ReturnType<typeof createClient>) {
  const schema: Record<string, unknown> = {};
  const queries: Record<string, string> = {
    tables: `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    columns: `SELECT table_name, column_name, ordinal_position, column_default, is_nullable, data_type, udt_name, character_maximum_length FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
    indexes: `SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname`,
    enums: `SELECT t.typname as enum_name, e.enumlabel as enum_value, e.enumsortorder FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' ORDER BY t.typname, e.enumsortorder`,
    rls_policies: `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`,
    functions: `SELECT p.proname as function_name, pg_get_functiondef(p.oid) as function_definition FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' ORDER BY p.proname`,
    triggers: `SELECT trigger_name, event_manipulation, event_object_table, action_statement, action_timing FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY event_object_table, trigger_name`,
  };

  for (const [key, query] of Object.entries(queries)) {
    try {
      const { data } = await supabase.rpc("execute_readonly_query", { query_text: query });
      schema[key] = data || [];
    } catch (err) {
      schema[key] = { error: String(err) };
    }
  }
  return schema;
}

// --- Storage: get all files from DB directly ---
async function getAllStorageFiles(supabase: ReturnType<typeof createClient>, bucket: string): Promise<Array<{ name: string; size: number; content_type: string }>> {
  const { data } = await supabase.rpc("execute_readonly_query", {
    query_text: `SELECT name, (metadata->>'size')::int as size, (metadata->>'mimetype') as content_type FROM storage.objects WHERE bucket_id = '${bucket.replace(/'/g, "''")}' AND name NOT LIKE '.emptyFolderPlaceholder%' ORDER BY name`
  });
  if (!data || !Array.isArray(data)) return [];
  return data.map((f: { name: string; size: number; content_type: string }) => ({
    name: f.name, size: f.size || 0, content_type: f.content_type || "application/octet-stream"
  }));
}

// --- Storage: copy files to backups bucket ---
async function copyStorageFiles(supabase: ReturnType<typeof createClient>, backupFolder: string) {
  const metadata: Record<string, unknown[]> = {};
  const copied: Array<{ bucket: string; path: string; backup_path: string; size: number }> = [];
  const skipped: Array<{ bucket: string; path: string; reason: string }> = [];
  const startTime = Date.now();

  for (const bucket of STORAGE_BUCKETS_TO_BACKUP) {
    if (Date.now() - startTime > 35_000) { skipped.push({ bucket, path: "*", reason: "timeout" }); continue; }
    try {
      const allFiles = await getAllStorageFiles(supabase, bucket);
      metadata[bucket] = allFiles.map(f => ({ name: f.name, size: f.size, content_type: f.content_type }));
      console.log(`[BACKUP] Found ${bucket}: ${allFiles.length} files`);

      for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i];
        console.log(`[BACKUP] Processing file ${i+1}/${allFiles.length}: ${bucket}/${file.name}`);
        if (Date.now() - startTime > 35_000) { skipped.push({ bucket, path: file.name, reason: "timeout" }); continue; }
        try {
          // Use signed URL + fetch instead of .download() which hangs
          const { data: urlData, error: urlErr } = await supabase.storage.from(bucket).createSignedUrl(file.name, 60);
          if (urlErr || !urlData?.signedUrl) {
            console.log(`[BACKUP] URL-FAIL ${bucket}/${file.name}: ${urlErr?.message || "no_url"}`);
            skipped.push({ bucket, path: file.name, reason: urlErr?.message || "no_url" }); continue;
          }

          const res = await fetch(urlData.signedUrl);
          if (!res.ok) {
            console.log(`[BACKUP] FETCH-FAIL ${bucket}/${file.name}: ${res.status}`);
            skipped.push({ bucket, path: file.name, reason: `fetch_${res.status}` }); continue;
          }

          const arrayBuffer = await res.arrayBuffer();
          if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
            skipped.push({ bucket, path: file.name, reason: `too_large_${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB` });
            continue;
          }

          const destPath = `${backupFolder}/storage/${bucket}/${file.name}`;
          const contentType = file.content_type || res.headers.get("content-type") || "application/octet-stream";
          const { error: upErr } = await supabase.storage.from("backups").upload(destPath, new Uint8Array(arrayBuffer), {
            contentType, upsert: true,
          });

          if (upErr) { console.log(`[BACKUP] UP-FAIL ${bucket}/${file.name}: ${upErr.message}`); skipped.push({ bucket, path: file.name, reason: upErr.message }); continue; }

          copied.push({ bucket, path: file.name, backup_path: destPath, size: arrayBuffer.byteLength });
          console.log(`[BACKUP] Copied ${bucket}/${file.name} (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB)`);
        } catch (dlErr) {
          console.log(`[BACKUP] CATCH-ERR ${bucket}/${file.name}: ${String(dlErr)}`);
          skipped.push({ bucket, path: file.name, reason: String(dlErr) });
        }
      }
    } catch (bucketErr) {
      skipped.push({ bucket, path: "*", reason: String(bucketErr) });
    }
  }
  return { metadata, copied, skipped };
}

// --- Main ---
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let backupId: string | null = null;
  const today = new Date().toISOString().split("T")[0];
  const ts = Date.now();
  const backupFolder = `backup_${today}_${ts}`;
  const fileName = `${backupFolder}/data.json`;

  try {
    const body = await req.json().catch(() => ({}));
    const triggeredBy = body.triggered_by || "manual";
    const notificationEmail = body.notification_email;

    console.log(`[BACKUP] Starting v2.0 - triggered by: ${triggeredBy}`);

    // --- Revert expired group exchanges (year < current) ---
    try {
      const currentYear = new Date().getFullYear();
      const { data: expiredExchanges } = await supabase
        .from('vacation_group_exchanges')
        .select('*')
        .eq('status', 'approved')
        .lt('year', currentYear);

      if (expiredExchanges?.length) {
        console.log(`[BACKUP] Found ${expiredExchanges.length} expired group exchanges to revert`);
        for (const ex of expiredExchanges) {
          await Promise.all([
            supabase.from('workers').update({ work_group_id: ex.original_group_a_id }).eq('id', ex.employee_a_id),
            supabase.from('workers').update({ work_group_id: ex.original_group_b_id }).eq('id', ex.employee_b_id),
          ]);
          await supabase.from('vacation_group_exchanges').update({ status: 'expired' }).eq('id', ex.id);
          console.log(`[BACKUP] Reverted exchange ${ex.id} (year ${ex.year})`);

          // Audit log
          await supabase.from('audit_logs').insert({
            action_type: 'expire_group_exchange',
            entity_type: 'vacation_group_exchange',
            entity_id: ex.id,
            entity_data: ex,
            actor_name: 'Sistema',
            actor_role: 'system',
            details: `Intercambio de grupo del año ${ex.year} expirado automáticamente. Grupos restaurados a originales.`,
          });
        }
      }
    } catch (revertErr) {
      console.error('[BACKUP] Failed to revert expired exchanges:', revertErr);
    }

    const { data: backupRecord, error: insertError } = await supabase
      .from("backup_history")
      .insert({ backup_date: today, file_name: fileName, status: "in_progress", triggered_by: triggeredBy })
      .select().single();
    if (insertError) throw new Error("Failed to create backup record");
    backupId = backupRecord.id;

    // 1. Table data
    const backupData: Record<string, unknown> = {};
    let totalRecords = 0, tablesExported = 0;
    for (const t of TABLES_TO_BACKUP) {
      try {
        const { data, error } = await supabase.from(t).select("*");
        if (error) { backupData[t] = { error: error.message }; } 
        else { backupData[t] = data || []; totalRecords += (data || []).length; tablesExported++; }
      } catch (e) { backupData[t] = { error: String(e) }; }
    }
    console.log(`[BACKUP] Exported ${tablesExported} tables, ${totalRecords} records`);

    // 2. Schema
    let schemaData: Record<string, unknown> = {};
    try { schemaData = await exportSchema(supabase); console.log(`[BACKUP] Schema exported`); }
    catch (e) { schemaData = { error: String(e) }; }

    // 3. Storage files (copy to backups bucket)
    let storageResult = { metadata: {} as Record<string, unknown[]>, copied: [] as Array<unknown>, skipped: [] as Array<unknown> };
    try {
      storageResult = await copyStorageFiles(supabase, backupFolder);
      console.log(`[BACKUP] Storage: ${storageResult.copied.length} copied, ${storageResult.skipped.length} skipped`);
    } catch (e) { console.error("[BACKUP] Storage copy failed:", e); }

    // 4. Build JSON (data + schema + storage references, no base64)
    const payload = {
      _metadata: {
        created_at: new Date().toISOString(), backup_date: today,
        tables_count: tablesExported, total_records: totalRecords,
        storage_files_copied: storageResult.copied.length,
        storage_files_skipped: storageResult.skipped.length,
        schema_included: true, storage_files_included: true,
        backup_folder: backupFolder, triggered_by: triggeredBy, version: "2.0",
      },
      tables: backupData,
      schema: schemaData,
      storage: { metadata: storageResult.metadata, copied_files: storageResult.copied, skipped_files: storageResult.skipped },
    };

    const jsonContent = JSON.stringify(payload, null, 2);
    const fileSizeBytes = new Blob([jsonContent]).size;

    const { error: uploadError } = await supabase.storage
      .from("backups").upload(fileName, jsonContent, { contentType: "application/json", upsert: true });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: signedUrlData } = await supabase.storage.from("backups").createSignedUrl(fileName, 86400);
    const downloadUrl = signedUrlData?.signedUrl || null;
    const expiresAt = downloadUrl ? new Date(Date.now() + 86400 * 1000).toISOString() : null;

    await supabase.from("backup_history").update({
      status: "completed", file_size_bytes: fileSizeBytes,
      tables_count: tablesExported, total_records: totalRecords,
      storage_files_count: storageResult.copied.length,
      download_url: downloadUrl, expires_at: expiresAt,
    }).eq("id", backupId);

    console.log(`[BACKUP] v2.0 completed! Records: ${totalRecords}, Files: ${storageResult.copied.length}, JSON: ${(fileSizeBytes / 1024).toFixed(0)} KB`);

    // Email
    if (resendApiKey && notificationEmail) {
      try {
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: "VNProd Backups <onboarding@resend.dev>", to: [notificationEmail],
          subject: `✅ Backup v2.0 - ${today}`,
          html: `<h2>Backup v2.0</h2><p>Tablas: ${tablesExported} | Registros: ${totalRecords}</p><p>Archivos storage: ${storageResult.copied.length} copiados, ${storageResult.skipped.length} omitidos</p><p>Esquema BD: ✅</p><p>JSON: ${(fileSizeBytes / 1024).toFixed(0)} KB</p>${downloadUrl ? `<p><a href="${downloadUrl}">📥 Descargar (24h)</a></p>` : ""}`,
        });
      } catch (e) { console.error("[BACKUP] Email failed:", e); }
    }

    // Cleanup >30 days
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const { data: oldBackups } = await supabase.from("backup_history").select("file_name").lt("backup_date", cutoffStr);
    if (oldBackups?.length) {
      for (const old of oldBackups) {
        // Remove the folder and all its contents
        const folder = old.file_name.replace("/data.json", "");
        const { data: folderFiles } = await supabase.storage.from("backups").list(folder, { limit: 10000 });
        if (folderFiles?.length) {
          const paths = folderFiles.map((f: { name: string }) => `${folder}/${f.name}`);
          await supabase.storage.from("backups").remove(paths);
        }
        // Also try removing legacy single-file backups
        await supabase.storage.from("backups").remove([old.file_name]);
      }
      await supabase.from("backup_history").delete().lt("backup_date", cutoffStr);
    }

    return new Response(JSON.stringify({
      success: true, backup_id: backupId, backup_folder: backupFolder,
      tables_count: tablesExported, total_records: totalRecords,
      storage_copied: storageResult.copied.length, storage_skipped: storageResult.skipped.length,
      schema_included: true, json_size_kb: (fileSizeBytes / 1024).toFixed(0),
      download_url: downloadUrl,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[BACKUP] Failed:", error);
    if (backupId) await supabase.from("backup_history").update({ status: "failed", error_message: String(error) }).eq("id", backupId);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
