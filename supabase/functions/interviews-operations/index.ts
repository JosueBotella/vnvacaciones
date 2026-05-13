import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CV_BUCKET = "cvs";

interface ManagerCtx {
  id: string;
  name: string;
  role: string;
  department_ids: string[];
}

async function resolveManager(sb: any, sessionToken: string): Promise<ManagerCtx | null> {
  const { data: session } = await sb
    .from("manager_sessions")
    .select("manager_id, expires_at")
    .eq("token", sessionToken)
    .maybeSingle();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;

  const { data: m } = await sb
    .from("managers")
    .select("id, name, role, department_id")
    .eq("id", session.manager_id)
    .maybeSingle();
  if (!m) return null;

  const { data: assigns } = await sb
    .from("manager_department_assignments")
    .select("department_id")
    .eq("manager_id", m.id);

  const dept_ids = new Set<string>();
  if (m.department_id) dept_ids.add(m.department_id);
  (assigns || []).forEach((a: any) => a.department_id && dept_ids.add(a.department_id));

  return { id: m.id, name: m.name, role: m.role, department_ids: Array.from(dept_ids) };
}

const isAdminOrConsulta = (mgr: ManagerCtx) => mgr.role === "admin" || mgr.role === "consulta";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();
    const { action, sessionToken } = body;
    if (!sessionToken) return jsonResponse({ success: false, error: "Missing session token" }, 401);

    const mgr = await resolveManager(sb, sessionToken);
    if (!mgr) return jsonResponse({ success: false, error: "Invalid session" }, 401);

    // Admin preview mode (read-only scope override)
    let effectiveMgr = mgr;
    if (mgr.role === "admin" && body.previewManagerId) {
      const preview = await sb
        .from("managers")
        .select("id, name, role, department_id")
        .eq("id", body.previewManagerId)
        .maybeSingle();
      if (preview.data) {
        const { data: assigns } = await sb
          .from("manager_department_assignments")
          .select("department_id")
          .eq("manager_id", preview.data.id);
        const dept_ids = new Set<string>();
        if (preview.data.department_id) dept_ids.add(preview.data.department_id);
        (assigns || []).forEach((a: any) => a.department_id && dept_ids.add(a.department_id));
        effectiveMgr = {
          id: preview.data.id,
          name: preview.data.name,
          role: preview.data.role,
          department_ids: Array.from(dept_ids),
        };
      }
    }

    switch (action) {
      case "list": {
        let query = sb
          .from("interviews")
          .select(
            "*, departments:department_id(id,name), job_positions:job_position_id(id,title), assigned_manager:assigned_manager_id(id,name,avatar_url)",
          )
          .order("scheduled_at", { ascending: true });

        if (!isAdminOrConsulta(effectiveMgr)) {
          if (effectiveMgr.department_ids.length === 0) return jsonResponse({ success: true, interviews: [] });
          query = query.in("department_id", effectiveMgr.department_ids);
        }
        const { data, error } = await query;
        if (error) throw error;

        const ids = (data || []).map((i: any) => i.id);
        const ownEvals: Record<string, any> = {};
        const evalCounts: Record<string, number> = {};
        if (ids.length) {
          const { data: ev } = await sb
            .from("interview_evaluations")
            .select("interview_id, manager_id, attended, decision, rating, notes, psicotecnico")
            .in("interview_id", ids);
          (ev || []).forEach((e: any) => {
            evalCounts[e.interview_id] = (evalCounts[e.interview_id] || 0) + 1;
            if (e.manager_id === effectiveMgr.id) ownEvals[e.interview_id] = e;
          });
        }
        const interviews = (data || []).map((i: any) => ({
          ...i,
          own_evaluation: ownEvals[i.id] || null,
          evaluations_count: evalCounts[i.id] || 0,
        }));
        return jsonResponse({ success: true, interviews });
      }

      case "create": {
        if (!isAdminOrConsulta(mgr)) return jsonResponse({ success: false, error: "Forbidden" }, 403);
        const { interview, cvBase64, cvFileName, cvMimeType } = body;
        if (!interview?.scheduled_at || !interview?.candidate_name) {
          return jsonResponse({ success: false, error: "Missing required fields" }, 400);
        }
        let cv_file_url: string | null = null;
        let cv_file_type: string | null = null;
        if (cvBase64 && cvFileName) {
          const bytes = decodeBase64(cvBase64);
          const ext = cvFileName.split(".").pop() || "pdf";
          const path = `interviews/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await sb.storage.from(CV_BUCKET).upload(path, bytes, {
            contentType: cvMimeType || "application/pdf",
            upsert: false,
          });
          if (upErr) throw upErr;
          cv_file_url = path;
          cv_file_type = cvMimeType || null;
        }
        const { data, error } = await sb
          .from("interviews")
          .insert({
            ...interview,
            cv_file_url,
            cv_file_type,
            created_by_manager_id: mgr.id,
          })
          .select()
          .single();
        if (error) throw error;
        return jsonResponse({ success: true, interview: data });
      }

      case "update": {
        if (!isAdminOrConsulta(mgr)) return jsonResponse({ success: false, error: "Forbidden" }, 403);
        const { id, patch, cvBase64, cvFileName, cvMimeType } = body;
        if (!id) return jsonResponse({ success: false, error: "Missing id" }, 400);

        const updates: Record<string, any> = { ...(patch || {}) };
        if (cvBase64 && cvFileName) {
          const { data: old } = await sb.from("interviews").select("cv_file_url").eq("id", id).maybeSingle();
          if (old?.cv_file_url) {
            await sb.storage.from(CV_BUCKET).remove([old.cv_file_url]);
          }
          const bytes = decodeBase64(cvBase64);
          const ext = cvFileName.split(".").pop() || "pdf";
          const path = `interviews/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await sb.storage.from(CV_BUCKET).upload(path, bytes, {
            contentType: cvMimeType || "application/pdf",
            upsert: false,
          });
          if (upErr) throw upErr;
          updates.cv_file_url = path;
          updates.cv_file_type = cvMimeType || null;
        }
        const { data, error } = await sb.from("interviews").update(updates).eq("id", id).select().single();
        if (error) throw error;
        return jsonResponse({ success: true, interview: data });
      }

      case "delete": {
        if (!isAdminOrConsulta(mgr)) return jsonResponse({ success: false, error: "Forbidden" }, 403);
        const { id } = body;
        if (!id) return jsonResponse({ success: false, error: "Missing id" }, 400);
        const { data: old } = await sb.from("interviews").select("cv_file_url").eq("id", id).maybeSingle();
        if (old?.cv_file_url) {
          await sb.storage.from(CV_BUCKET).remove([old.cv_file_url]);
        }
        const { error } = await sb.from("interviews").delete().eq("id", id);
        if (error) throw error;
        return jsonResponse({ success: true });
      }

      case "getCvSignedUrl": {
        const { id } = body;
        if (!id) return jsonResponse({ success: false, error: "Missing id" }, 400);
        const { data: itv } = await sb
          .from("interviews")
          .select("cv_file_url, department_id")
          .eq("id", id)
          .maybeSingle();
        if (!itv?.cv_file_url) return jsonResponse({ success: false, error: "No CV" }, 404);
        if (!isAdminOrConsulta(mgr) && (!itv.department_id || !mgr.department_ids.includes(itv.department_id))) {
          return jsonResponse({ success: false, error: "Forbidden" }, 403);
        }
        const { data, error } = await sb.storage.from(CV_BUCKET).createSignedUrl(itv.cv_file_url, 3600);
        if (error) throw error;
        return jsonResponse({ success: true, url: data.signedUrl });
      }

      case "upsertEvaluation": {
        const { interview_id, evaluation } = body;
        if (!interview_id || !evaluation) {
          return jsonResponse({ success: false, error: "Missing fields" }, 400);
        }
        const { data: itv } = await sb
          .from("interviews")
          .select("department_id")
          .eq("id", interview_id)
          .maybeSingle();
        if (!itv) return jsonResponse({ success: false, error: "Interview not found" }, 404);
        if (!isAdminOrConsulta(mgr) && (!itv.department_id || !mgr.department_ids.includes(itv.department_id))) {
          return jsonResponse({ success: false, error: "Forbidden" }, 403);
        }
        const payload: any = {
          interview_id,
          manager_id: mgr.id,
          manager_name: mgr.name,
          manager_role: mgr.role,
          notes: evaluation.notes ?? null,
          rating: evaluation.rating ?? null,
          decision: evaluation.decision ?? null,
          attended: !!evaluation.attended,
          psicotecnico: evaluation.psicotecnico ?? null,
        };
        const { data, error } = await sb
          .from("interview_evaluations")
          .upsert(payload, { onConflict: "interview_id,manager_id" })
          .select()
          .single();
        if (error) throw error;
        return jsonResponse({ success: true, evaluation: data });
      }

      case "listEvaluations": {
        if (!isAdminOrConsulta(mgr)) return jsonResponse({ success: false, error: "Forbidden" }, 403);
        const { interview_id } = body;
        if (!interview_id) return jsonResponse({ success: false, error: "Missing interview_id" }, 400);
        const { data, error } = await sb
          .from("interview_evaluations")
          .select("*")
          .eq("interview_id", interview_id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return jsonResponse({ success: true, evaluations: data || [] });
      }

      case "assignInterview": {
        const { interview_id, manager_id } = body; // manager_id can be null to unassign
        if (!interview_id) return jsonResponse({ success: false, error: "Missing interview_id" }, 400);

        // Permissions: admin/consulta or any manager of the interview's department
        const { data: itv } = await sb
          .from("interviews")
          .select("department_id")
          .eq("id", interview_id)
          .maybeSingle();
        if (!itv) return jsonResponse({ success: false, error: "Interview not found" }, 404);
        const allowed =
          isAdminOrConsulta(mgr) ||
          (itv.department_id && mgr.department_ids.includes(itv.department_id));
        if (!allowed) return jsonResponse({ success: false, error: "Forbidden" }, 403);

        // If manager_id provided, validate the target manager belongs to that department (unless admin/consulta)
        if (manager_id) {
          const { data: target } = await sb
            .from("managers")
            .select("id, department_id, role")
            .eq("id", manager_id)
            .maybeSingle();
          if (!target) return jsonResponse({ success: false, error: "Manager not found" }, 404);
        }

        const { data, error } = await sb
          .from("interviews")
          .update({ assigned_manager_id: manager_id || null })
          .eq("id", interview_id)
          .select("*, assigned_manager:assigned_manager_id(id,name,avatar_url)")
          .single();
        if (error) throw error;
        return jsonResponse({ success: true, interview: data });
      }

      case "listDepartmentManagers": {
        // Returns managers assignable to interviews in the given department.
        const { department_id } = body;
        if (!department_id) return jsonResponse({ success: false, error: "Missing department_id" }, 400);

        // Pull legacy department_id matches AND manager_department_assignments matches
        const { data: byPrimary } = await sb
          .from("managers")
          .select("id, name, avatar_url, role, candidaturas_only")
          .eq("department_id", department_id)
          .in("role", ["manager", "admin", "consulta"]);

        const { data: assigns } = await sb
          .from("manager_department_assignments")
          .select("manager_id, managers:manager_id(id, name, avatar_url, role, candidaturas_only)")
          .eq("department_id", department_id);

        const map = new Map<string, any>();
        (byPrimary || []).forEach((m: any) => map.set(m.id, m));
        (assigns || []).forEach((a: any) => {
          if (a.managers) map.set(a.managers.id, a.managers);
        });
        const managers = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
        return jsonResponse({ success: true, managers });
      }

      default:
        return jsonResponse({ success: false, error: "Unknown action" }, 400);
    }
  } catch (err: any) {
    console.error("interviews-operations error:", err);
    return jsonResponse({ success: false, error: err?.message || "Internal error" }, 500);
  }
});
