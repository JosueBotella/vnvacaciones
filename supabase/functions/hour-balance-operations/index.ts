import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImportRecord {
  id: string;
  worker: string;
  total: number;
  totalNoNegative?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, sessionToken, ...params } = await req.json();
    console.log(`[hour-balance-operations] Action: ${action}`);

    // Validate session for all actions
    if (!sessionToken) {
      console.log("[hour-balance-operations] No session token provided");
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify session and get manager
    const { data: session, error: sessionError } = await supabase
      .from("manager_sessions")
      .select("manager_id, expires_at")
      .eq("token", sessionToken)
      .single();

    if (sessionError || !session) {
      console.log("[hour-balance-operations] Invalid session:", sessionError?.message);
      return new Response(
        JSON.stringify({ error: "Sesión inválida" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(session.expires_at) < new Date()) {
      console.log("[hour-balance-operations] Session expired");
      return new Response(
        JSON.stringify({ error: "Sesión expirada" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get manager details and verify admin role
    const { data: manager, error: managerError } = await supabase
      .from("managers")
      .select("id, name, role")
      .eq("id", session.manager_id)
      .single();

    if (managerError || !manager) {
      console.log("[hour-balance-operations] Manager not found:", managerError?.message);
      return new Response(
        JSON.stringify({ error: "Usuario no encontrado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check role for access (admin for full access, manager/consulta/responsable for read-only of their departments)
    const isAdmin = manager.role === "admin";
    const isManager = manager.role === "manager";
    const isConsulta = manager.role === "consulta";
    const isResponsable = manager.role === "responsable";

    // Only admin, manager, consulta, or responsable roles can access
    if (!isAdmin && !isManager && !isConsulta && !isResponsable) {
      console.log("[hour-balance-operations] Access denied for role:", manager.role);
      return new Response(
        JSON.stringify({ error: "Acceso denegado." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[hour-balance-operations] Authorized manager: ${manager.name} (${manager.role})`);

    // For non-admin actions, check if admin-only
    const adminOnlyActions = ["importCSV", "getImportHistory", "getSettings", "updateSettings"];
    if (!isAdmin && adminOnlyActions.includes(action)) {
      console.log("[hour-balance-operations] Admin-only action attempted by manager");
      return new Response(
        JSON.stringify({ error: "Acción solo disponible para administradores." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle actions
    switch (action) {
      case "getBalances": {
        // Get all workers with their balances
        const { data: workers, error: workersError } = await supabase
          .from("workers")
          .select(`
            id,
            worker_number,
            worker_code,
            name,
            department_id,
            worker_team_id,
            work_group_id,
            is_on_leave,
            is_on_vacation,
            deleted_at
          `)
          .is("deleted_at", null)
          .order("name");

        if (workersError) {
          console.log("[hour-balance-operations] Error fetching workers:", workersError.message);
          throw workersError;
        }

        // Get departments
        const { data: departments } = await supabase
          .from("departments")
          .select("id, name");

        // Get teams
        const { data: teams } = await supabase
          .from("worker_teams")
          .select("id, name, department_id");

        // Get work groups with color
        const { data: groups } = await supabase
          .from("work_groups")
          .select("id, name, department_id, color");

        // Get team to group mappings
        const { data: teamGroupMappings } = await supabase
          .from("work_group_teams")
          .select("worker_team_id, work_group_id");

        // Get balances
        const { data: balances } = await supabase
          .from("hour_balances")
          .select("worker_id, balance_hours, updated_at");

        // Create lookup maps
        const deptMap = new Map(departments?.map(d => [d.id, d.name]) || []);
        const teamMap = new Map(teams?.map(t => [t.id, t.name]) || []);
        const groupMap = new Map(groups?.map(g => [g.id, { name: g.name, color: g.color }]) || []);
        const teamToGroupMap = new Map(teamGroupMappings?.map(m => [m.worker_team_id, m.work_group_id]) || []);
        const balanceMap = new Map(balances?.map(b => [b.worker_id, { balance: b.balance_hours, updated: b.updated_at }]) || []);

        // Combine data with resolved group (direct or inherited from team)
        const result = workers?.map(w => {
          // Resolve group: direct assignment first, then via team
          const resolvedGroupId = w.work_group_id || (w.worker_team_id ? teamToGroupMap.get(w.worker_team_id) : null);
          const groupInfo = resolvedGroupId ? groupMap.get(resolvedGroupId) : null;

          return {
            id: w.id,
            worker_number: w.worker_number,
            worker_code: w.worker_code || null,
            name: w.name,
            department_id: w.department_id,
            department_name: deptMap.get(w.department_id) || "Sin departamento",
            team_id: w.worker_team_id,
            team_name: teamMap.get(w.worker_team_id) || null,
            group_id: resolvedGroupId || null,
            group_name: groupInfo?.name || null,
            group_color: groupInfo?.color || null,
            balance_hours: balanceMap.get(w.id)?.balance ?? null,
            balance_updated: balanceMap.get(w.id)?.updated ?? null,
            is_on_leave: w.is_on_leave,
            is_on_vacation: w.is_on_vacation,
          };
        }) || [];

        console.log(`[hour-balance-operations] Returning ${result.length} workers with balances`);

        return new Response(
          JSON.stringify({ success: true, data: result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "getManagerBalances": {
        // For managers - get balances only for their assigned departments
        // For responsables - optionally filter by workerTeamIds
        const { departmentIds, workerTeamIds } = params as { departmentIds: string[]; workerTeamIds?: string[] };

        console.log(`[hour-balance-operations] getManagerBalances called by ${manager.name} with departmentIds:`, departmentIds, 'workerTeamIds:', workerTeamIds);

        if ((!departmentIds || !Array.isArray(departmentIds) || departmentIds.length === 0) && (!workerTeamIds || workerTeamIds.length === 0)) {
          console.log("[hour-balance-operations] No departmentIds or workerTeamIds provided");
          return new Response(
            JSON.stringify({ error: "No se especificaron departamentos" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get workers - filter by workerTeamIds if provided (responsable), else by departments
        let workersQuery = supabase
          .from("workers")
          .select(`
            id,
            worker_number,
            name,
            department_id,
            worker_team_id,
            work_group_id
          `)
          .is("deleted_at", null)
          .order("name");

        if (workerTeamIds && workerTeamIds.length > 0) {
          workersQuery = workersQuery.in("worker_team_id", workerTeamIds);
        } else {
          workersQuery = workersQuery.in("department_id", departmentIds);
        }

        const { data: workers, error: workersError } = await workersQuery;

        if (workersError) {
          console.log("[hour-balance-operations] Error fetching workers:", workersError.message);
          throw workersError;
        }

        // Get departments
        const { data: departments } = await supabase
          .from("departments")
          .select("id, name")
          .in("id", departmentIds);

        // Get teams
        const { data: teams } = await supabase
          .from("worker_teams")
          .select("id, name, department_id")
          .in("department_id", departmentIds);

        // Get work groups with color
        const { data: groups } = await supabase
          .from("work_groups")
          .select("id, name, department_id, color")
          .in("department_id", departmentIds);

        // Get team to group mappings
        const { data: teamGroupMappings } = await supabase
          .from("work_group_teams")
          .select("worker_team_id, work_group_id");

        // Get balances for these workers - batch to avoid IN query limits
        const workerIds = workers?.map(w => w.id) || [];
        console.log(`[hour-balance-operations] Found ${workerIds.length} workers, fetching balances...`);
        
        // Supabase has a limit on IN query size, so we batch requests
        const BATCH_SIZE = 100;
        let allBalances: Array<{ worker_id: string; balance_hours: number }> = [];
        
        if (workerIds.length > 0) {
          for (let i = 0; i < workerIds.length; i += BATCH_SIZE) {
            const batch = workerIds.slice(i, i + BATCH_SIZE);
            const { data: batchBalances, error: batchError } = await supabase
              .from("hour_balances")
              .select("worker_id, balance_hours")
              .in("worker_id", batch);
            
            if (batchError) {
              console.log(`[hour-balance-operations] Error fetching balances batch ${i / BATCH_SIZE}:`, batchError.message);
            } else if (batchBalances) {
              allBalances = allBalances.concat(batchBalances);
            }
          }
        }
        
        console.log(`[hour-balance-operations] Found ${allBalances.length} balances from ${Math.ceil(workerIds.length / BATCH_SIZE)} batches`);


        // Create lookup maps
        const deptMap = new Map(departments?.map(d => [d.id, d.name]) || []);
        const teamMap = new Map(teams?.map(t => [t.id, t.name]) || []);
        const groupMap = new Map(groups?.map(g => [g.id, { name: g.name, color: g.color }]) || []);
        const teamToGroupMap = new Map(teamGroupMappings?.map(m => [m.worker_team_id, m.work_group_id]) || []);
        const balanceMap = new Map(allBalances.map(b => [b.worker_id, b.balance_hours]));

        // Combine data with resolved group
        const result = workers?.map(w => {
          // Resolve group: direct assignment first, then via team
          const resolvedGroupId = w.work_group_id || (w.worker_team_id ? teamToGroupMap.get(w.worker_team_id) : null);
          const groupInfo = resolvedGroupId ? groupMap.get(resolvedGroupId) : null;

          return {
            id: w.id,
            worker_number: w.worker_number,
            name: w.name,
            department_id: w.department_id,
            department_name: deptMap.get(w.department_id) || "Sin departamento",
            team_name: teamMap.get(w.worker_team_id) || null,
            group_name: groupInfo?.name || null,
            group_color: groupInfo?.color || null,
            balance_hours: balanceMap.get(w.id) ?? null,
          };
        }) || [];

        console.log(`[hour-balance-operations] Manager balances: ${result.length} workers`);

        // Get last import date (most recent successful import)
        const { data: lastImport } = await supabase
          .from("hour_balance_imports")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return new Response(
          JSON.stringify({ success: true, data: result, lastImportAt: lastImport?.created_at || null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "importCSV": {
        const { records, notes } = params as { records: ImportRecord[]; notes?: string };

        if (!records || !Array.isArray(records)) {
          return new Response(
            JSON.stringify({ error: "Datos de CSV inválidos" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[hour-balance-operations] Processing ${records.length} CSV records`);

        // Get all workers to match by worker_number
        const { data: workers } = await supabase
          .from("workers")
          .select("id, worker_number")
          .is("deleted_at", null);

        const workerMap = new Map(workers?.map(w => [w.worker_number, w.id]) || []);

        // Process records
        const toImport: { worker_id: string; balance_hours: number }[] = [];
        let ignored = 0;

        for (const record of records) {
          const workerId = workerMap.get(String(record.id));
          if (workerId) {
            toImport.push({
              worker_id: workerId,
              balance_hours: record.total,
            });
          } else {
            ignored++;
          }
        }

        console.log(`[hour-balance-operations] Matched: ${toImport.length}, Ignored: ${ignored}`);

        // Create import record
        const { data: importRecord, error: importError } = await supabase
          .from("hour_balance_imports")
          .insert({
            admin_id: manager.id,
            admin_name: manager.name,
            total_csv_records: records.length,
            total_imported: toImport.length,
            total_ignored: ignored,
            notes: notes || null,
          })
          .select()
          .single();

        if (importError) {
          console.log("[hour-balance-operations] Error creating import record:", importError.message);
          throw importError;
        }

        // Upsert balances
        if (toImport.length > 0) {
          const balancesToUpsert = toImport.map(b => ({
            ...b,
            import_id: importRecord.id,
            updated_at: new Date().toISOString(),
          }));

          const { error: upsertError } = await supabase
            .from("hour_balances")
            .upsert(balancesToUpsert, { onConflict: "worker_id" });

          if (upsertError) {
            console.log("[hour-balance-operations] Error upserting balances:", upsertError.message);
            throw upsertError;
          }
        }

        console.log(`[hour-balance-operations] Import completed successfully`);

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              import_id: importRecord.id,
              total_csv: records.length,
              imported: toImport.length,
              ignored: ignored,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "getImportHistory": {
        const { data: history, error } = await supabase
          .from("hour_balance_imports")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, data: history }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "getSettings": {
        const { data: settings, error } = await supabase
          .from("hour_balance_settings")
          .select("*")
          .single();

        if (error && error.code !== "PGRST116") throw error;

        return new Response(
          JSON.stringify({ success: true, data: settings }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "updateSettings": {
        const { hours_format, rounding, alert_threshold } = params;

        const { data: existing } = await supabase
          .from("hour_balance_settings")
          .select("id")
          .single();

        let result;
        if (existing) {
          const { data, error } = await supabase
            .from("hour_balance_settings")
            .update({
              hours_format,
              rounding,
              alert_threshold,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .select()
            .single();
          if (error) throw error;
          result = data;
        } else {
          const { data, error } = await supabase
            .from("hour_balance_settings")
            .insert({ hours_format, rounding, alert_threshold })
            .select()
            .single();
          if (error) throw error;
          result = data;
        }

        return new Response(
          JSON.stringify({ success: true, data: result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Acción no válida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    console.error("[hour-balance-operations] Error:", error);
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
