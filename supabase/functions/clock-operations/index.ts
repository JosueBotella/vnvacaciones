import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifySession(supabase: any, sessionToken: string) {
  if (!sessionToken) return null;
  const { data } = await supabase
    .from("manager_sessions")
    .select("manager_id, expires_at")
    .eq("token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .single();
  if (!data) return null;
  // Get manager name
  const { data: mgr } = await supabase
    .from("managers")
    .select("name")
    .eq("id", data.manager_id)
    .single();
  return { managerId: data.manager_id, managerName: mgr?.name || "Manager" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { action, ...params } = await req.json();

    /* ── lookupWorker ── */
    if (action === "lookupWorker") {
      const { workerNumber } = params;
      if (!workerNumber) return json({ success: false, error: "Missing workerNumber" }, 400);

      const { data: workers, error } = await supabase
        .from("workers")
        .select("id, name, worker_number, worker_code, department_id, departments!inner(name)")
        .eq("worker_number", workerNumber.trim());

      if (error) return json({ success: false, error: error.message }, 500);

      const vnh = workers?.find((w: any) =>
        w.departments?.name?.toUpperCase().includes("HOLLAND") ||
        w.departments?.name?.toUpperCase().includes("VNH")
      );

      if (!vnh) return json({ success: false, error: "Worker not found" }, 404);

      const { data: lastEntry } = await supabase
        .from("clock_entries")
        .select("entry_type, punched_at")
        .eq("worker_id", vnh.id)
        .order("punched_at", { ascending: false })
        .limit(1);

      const currentStatus = lastEntry?.[0]?.entry_type || null;

      return json({
        success: true,
        worker: {
          id: vnh.id,
          name: vnh.name,
          worker_number: vnh.worker_number,
          worker_code: vnh.worker_code,
          department_name: (vnh as any).departments?.name,
        },
        currentStatus,
      });
    }

    /* ── punch ── */
    if (action === "punch") {
      const { workerId, entryType } = params;
      if (!workerId || !entryType) return json({ success: false, error: "Missing params" }, 400);
      if (!["clock_in", "clock_out", "break_start", "break_end"].includes(entryType))
        return json({ success: false, error: "Invalid entryType" }, 400);

      const { data, error } = await supabase
        .from("clock_entries")
        .insert({ worker_id: workerId, entry_type: entryType })
        .select()
        .single();

      if (error) return json({ success: false, error: error.message }, 500);
      return json({ success: true, entry: data });
    }

    /* ── getWeekEntries ── */
    if (action === "getWeekEntries") {
      const { workerId } = params;
      if (!workerId) return json({ success: false, error: "Missing workerId" }, 400);

      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const { data: entries, error } = await supabase
        .from("clock_entries")
        .select("id, entry_type, punched_at")
        .eq("worker_id", workerId)
        .gte("punched_at", sevenDaysAgo.toISOString())
        .order("punched_at", { ascending: true });

      if (error) return json({ success: false, error: error.message }, 500);
      return json({ success: true, entries: entries || [] });
    }

    /* ── getManagerClockEntries ── */
    if (action === "getManagerClockEntries") {
      const { sessionToken, departmentId, date } = params;
      if (!sessionToken) return json({ success: false, error: "Unauthorized" }, 401);

      const session = await verifySession(supabase, sessionToken);
      if (!session) return json({ success: false, error: "Invalid session" }, 401);

      let query = supabase
        .from("workers")
        .select("id, name, worker_number, worker_code, department_id")
        .order("name");

      if (departmentId) {
        query = query.eq("department_id", departmentId);
      }

      const { data: workers, error: wErr } = await query;
      if (wErr) return json({ success: false, error: wErr.message }, 500);

      const workerIds = (workers || []).map((w: any) => w.id);
      if (workerIds.length === 0) return json({ success: true, workers: [], entries: [] });

      const targetDate = date ? new Date(date) : new Date();
      const dayStart = new Date(targetDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(targetDate);
      dayEnd.setHours(23, 59, 59, 999);

      const { data: entries, error: eErr } = await supabase
        .from("clock_entries")
        .select("id, worker_id, entry_type, punched_at")
        .in("worker_id", workerIds)
        .gte("punched_at", dayStart.toISOString())
        .lte("punched_at", dayEnd.toISOString())
        .order("punched_at", { ascending: true });

      if (eErr) return json({ success: false, error: eErr.message }, 500);
      return json({ success: true, workers: workers || [], entries: entries || [] });
    }

    /* ── getWorkerWeekEntries ── */
    if (action === "getWorkerWeekEntries") {
      const { sessionToken, workerId, weekStart } = params;
      const session = await verifySession(supabase, sessionToken);
      if (!session) return json({ success: false, error: "Invalid session" }, 401);
      if (!workerId || !weekStart) return json({ success: false, error: "Missing params" }, 400);

      const start = new Date(weekStart);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      const { data: entries, error } = await supabase
        .from("clock_entries")
        .select("id, entry_type, punched_at")
        .eq("worker_id", workerId)
        .gte("punched_at", start.toISOString())
        .lte("punched_at", end.toISOString())
        .order("punched_at", { ascending: true });

      if (error) return json({ success: false, error: error.message }, 500);
      return json({ success: true, entries: entries || [] });
    }

    /* ── addClockEntry ── */
    if (action === "addClockEntry") {
      const { sessionToken, workerId, entryType, punchedAt, reason } = params;
      const session = await verifySession(supabase, sessionToken);
      if (!session) return json({ success: false, error: "Invalid session" }, 401);
      if (!workerId || !entryType || !punchedAt) return json({ success: false, error: "Missing params" }, 400);

      const { data: entry, error } = await supabase
        .from("clock_entries")
        .insert({ worker_id: workerId, entry_type: entryType, punched_at: punchedAt })
        .select()
        .single();

      if (error) return json({ success: false, error: error.message }, 500);

      await supabase.from("clock_entry_edits").insert({
        clock_entry_id: entry.id,
        worker_id: workerId,
        manager_id: session.managerId,
        manager_name: session.managerName,
        action: "add",
        new_value: { entry_type: entryType, punched_at: punchedAt },
        reason: reason || null,
      });

      return json({ success: true, entry });
    }

    /* ── editClockEntry ── */
    if (action === "editClockEntry") {
      const { sessionToken, entryId, newPunchedAt, reason } = params;
      const session = await verifySession(supabase, sessionToken);
      if (!session) return json({ success: false, error: "Invalid session" }, 401);
      if (!entryId || !newPunchedAt) return json({ success: false, error: "Missing params" }, 400);

      // Get old value
      const { data: old } = await supabase
        .from("clock_entries")
        .select("worker_id, entry_type, punched_at")
        .eq("id", entryId)
        .single();

      if (!old) return json({ success: false, error: "Entry not found" }, 404);

      const { error } = await supabase
        .from("clock_entries")
        .update({ punched_at: newPunchedAt })
        .eq("id", entryId);

      if (error) return json({ success: false, error: error.message }, 500);

      await supabase.from("clock_entry_edits").insert({
        clock_entry_id: entryId,
        worker_id: old.worker_id,
        manager_id: session.managerId,
        manager_name: session.managerName,
        action: "edit",
        old_value: { entry_type: old.entry_type, punched_at: old.punched_at },
        new_value: { entry_type: old.entry_type, punched_at: newPunchedAt },
        reason: reason || null,
      });

      return json({ success: true });
    }

    /* ── deleteClockEntry ── */
    if (action === "deleteClockEntry") {
      const { sessionToken, entryId, reason } = params;
      const session = await verifySession(supabase, sessionToken);
      if (!session) return json({ success: false, error: "Invalid session" }, 401);
      if (!entryId) return json({ success: false, error: "Missing entryId" }, 400);

      const { data: old } = await supabase
        .from("clock_entries")
        .select("worker_id, entry_type, punched_at")
        .eq("id", entryId)
        .single();

      if (!old) return json({ success: false, error: "Entry not found" }, 404);

      const { error } = await supabase
        .from("clock_entries")
        .delete()
        .eq("id", entryId);

      if (error) return json({ success: false, error: error.message }, 500);

      await supabase.from("clock_entry_edits").insert({
        clock_entry_id: entryId,
        worker_id: old.worker_id,
        manager_id: session.managerId,
        manager_name: session.managerName,
        action: "delete",
        old_value: { entry_type: old.entry_type, punched_at: old.punched_at },
        reason: reason || null,
      });

      return json({ success: true });
    }

    /* ── getClockEditHistory ── */
    if (action === "getClockEditHistory") {
      const { sessionToken, workerId } = params;
      const session = await verifySession(supabase, sessionToken);
      if (!session) return json({ success: false, error: "Invalid session" }, 401);
      if (!workerId) return json({ success: false, error: "Missing workerId" }, 400);

      const { data: edits, error } = await supabase
        .from("clock_entry_edits")
        .select("*")
        .eq("worker_id", workerId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) return json({ success: false, error: error.message }, 500);
      return json({ success: true, edits: edits || [] });
    }

    return json({ success: false, error: "Unknown action" }, 400);
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
});
