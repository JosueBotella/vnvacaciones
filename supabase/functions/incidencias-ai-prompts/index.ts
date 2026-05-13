import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { action, sessionToken } = body as { action?: string; sessionToken?: string };

    if (!action) return json({ error: "action is required" }, 400);
    if (!sessionToken) return json({ error: "sessionToken is required" }, 401);

    // ── Validate admin session ──
    const { data: session } = await supabase
      .from("manager_sessions")
      .select("manager_id, expires_at, managers!inner(id, name, role)")
      .eq("token", sessionToken)
      .single();

    if (!session) return json({ error: "Invalid session" }, 401);
    if (new Date(session.expires_at) < new Date())
      return json({ error: "Session expired" }, 401);

    const manager = (session.managers as any);
    if (!manager || manager.role !== "admin")
      return json({ error: "Admin access required" }, 403);

    const managerId = manager.id as string;
    const managerName = manager.name as string;

    // ───────────── Actions ─────────────
    switch (action) {
      case "list": {
        const { data: prompts, error } = await supabase
          .from("incidencias_ai_prompts")
          .select("id, prompt_key, name, description, category, default_content, is_active, current_version_id, created_at, updated_at")
          .order("category", { ascending: true })
          .order("name", { ascending: true });
        if (error) return json({ error: error.message }, 500);

        // Attach current version content for each
        const ids = (prompts || []).map((p: any) => p.current_version_id).filter(Boolean);
        let versionsMap: Record<string, any> = {};
        if (ids.length) {
          const { data: vers } = await supabase
            .from("incidencias_ai_prompt_versions")
            .select("id, prompt_id, version_number, content, author_name, change_notes, created_at")
            .in("id", ids);
          for (const v of vers || []) versionsMap[(v as any).id] = v;
        }

        const result = (prompts || []).map((p: any) => ({
          ...p,
          current_version: p.current_version_id ? versionsMap[p.current_version_id] : null,
        }));
        return json({ prompts: result });
      }

      case "get": {
        const { promptId } = body as { promptId: string };
        if (!promptId) return json({ error: "promptId is required" }, 400);
        const [{ data: prompt }, { data: versions }] = await Promise.all([
          supabase.from("incidencias_ai_prompts").select("*").eq("id", promptId).single(),
          supabase
            .from("incidencias_ai_prompt_versions")
            .select("id, version_number, content, author_name, change_notes, created_at")
            .eq("prompt_id", promptId)
            .order("version_number", { ascending: false }),
        ]);
        if (!prompt) return json({ error: "Prompt not found" }, 404);
        return json({ prompt, versions: versions || [] });
      }

      case "saveVersion": {
        const { promptId, content, changeNotes, activate } = body as {
          promptId: string;
          content: string;
          changeNotes?: string;
          activate?: boolean;
        };
        if (!promptId || typeof content !== "string")
          return json({ error: "promptId and content required" }, 400);

        // Next version number
        const { data: lastVer } = await supabase
          .from("incidencias_ai_prompt_versions")
          .select("version_number")
          .eq("prompt_id", promptId)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextNumber = ((lastVer?.version_number as number) || 0) + 1;

        const { data: newVersion, error: vErr } = await supabase
          .from("incidencias_ai_prompt_versions")
          .insert({
            prompt_id: promptId,
            version_number: nextNumber,
            content,
            author_manager_id: managerId,
            author_name: managerName,
            change_notes: changeNotes || null,
          })
          .select()
          .single();
        if (vErr) return json({ error: vErr.message }, 500);

        const updates: Record<string, unknown> = { current_version_id: (newVersion as any).id };
        if (typeof activate === "boolean") updates.is_active = activate;

        const { error: pErr } = await supabase
          .from("incidencias_ai_prompts")
          .update(updates)
          .eq("id", promptId);
        if (pErr) return json({ error: pErr.message }, 500);

        return json({ success: true, version: newVersion });
      }

      case "toggleActive": {
        const { promptId, isActive } = body as { promptId: string; isActive: boolean };
        if (!promptId || typeof isActive !== "boolean")
          return json({ error: "promptId and isActive required" }, 400);

        // Cannot activate if no version exists yet
        if (isActive) {
          const { data: p } = await supabase
            .from("incidencias_ai_prompts")
            .select("current_version_id")
            .eq("id", promptId)
            .single();
          if (!p?.current_version_id)
            return json({ error: "No hay ninguna versión guardada todavía. Guarda una versión antes de activar." }, 400);
        }

        const { error } = await supabase
          .from("incidencias_ai_prompts")
          .update({ is_active: isActive })
          .eq("id", promptId);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      case "restoreVersion": {
        const { promptId, versionId } = body as { promptId: string; versionId: string };
        if (!promptId || !versionId)
          return json({ error: "promptId and versionId required" }, 400);

        // Verify version belongs to prompt
        const { data: ver } = await supabase
          .from("incidencias_ai_prompt_versions")
          .select("id, content, version_number")
          .eq("id", versionId)
          .eq("prompt_id", promptId)
          .single();
        if (!ver) return json({ error: "Versión no encontrada" }, 404);

        // Create a new version that copies the restored content (preserves history)
        const { data: lastVer } = await supabase
          .from("incidencias_ai_prompt_versions")
          .select("version_number")
          .eq("prompt_id", promptId)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextNumber = ((lastVer?.version_number as number) || 0) + 1;

        const { data: newVer, error: vErr } = await supabase
          .from("incidencias_ai_prompt_versions")
          .insert({
            prompt_id: promptId,
            version_number: nextNumber,
            content: (ver as any).content,
            author_manager_id: managerId,
            author_name: managerName,
            change_notes: `Restaurado desde la versión ${(ver as any).version_number}`,
          })
          .select()
          .single();
        if (vErr) return json({ error: vErr.message }, 500);

        await supabase
          .from("incidencias_ai_prompts")
          .update({ current_version_id: (newVer as any).id })
          .eq("id", promptId);

        return json({ success: true, version: newVer });
      }

      case "syncDefaults": {
        // Allows the editor UI to push the actual hardcoded text as the
        // default_content for prompts that still have the placeholder.
        // Body: { defaults: [{ prompt_key, default_content }] }
        const { defaults } = body as { defaults: Array<{ prompt_key: string; default_content: string }> };
        if (!Array.isArray(defaults)) return json({ error: "defaults array required" }, 400);
        for (const d of defaults) {
          if (!d.prompt_key || typeof d.default_content !== "string") continue;
          await supabase
            .from("incidencias_ai_prompts")
            .update({ default_content: d.default_content })
            .eq("prompt_key", d.prompt_key)
            .eq("default_content", "__PENDING_SYNC_FROM_CODE__");
        }
        return json({ success: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("incidencias-ai-prompts error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
