// Public edge function used by the candidate apply form.
// Inserts the application using the service role to bypass any RLS edge cases
// and then triggers async AI processing via process-application.
// IMPORTANT: This function MUST stay public (verify_jwt = false in config.toml).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SubmitPayload {
  application: Record<string, unknown>;
  honeypot?: string;
}

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as SubmitPayload;
    if (body.honeypot) {
      // Silent success for bots
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const a = body.application || {};

    // Defensive whitelist + sanitisation. Anything outside this is dropped.
    const row: Record<string, unknown> = {
      job_position_id: typeof a.job_position_id === "string" && a.job_position_id ? a.job_position_id : null,
      custom_position: clampStr(a.custom_position, 200),
      first_name: clampStr(a.first_name, 100) ?? "",
      last_name: clampStr(a.last_name, 100) ?? "",
      email: clampStr(a.email, 200),
      phone: clampStr(a.phone, 50),
      gender: a.gender === "female" ? "female" : "male",
      origin_country: clampStr(a.origin_country, 100) ?? "—",
      current_address: clampStr(a.current_address, 500) ?? "—",
      current_lat: typeof a.current_lat === "number" ? a.current_lat : null,
      current_lng: typeof a.current_lng === "number" ? a.current_lng : null,
      vehicle: ["none", "skate", "bike", "car"].includes(a.vehicle as string) ? a.vehicle : "none",
      spanish_level: typeof a.spanish_level === "number"
        ? Math.min(5, Math.max(1, Math.floor(a.spanish_level)))
        : 1,
      cv_file_url: clampStr(a.cv_file_url, 500),
      cv_file_type: a.cv_file_type === "pdf" || a.cv_file_type === "image" ? a.cv_file_type : null,
      form_language: clampStr(a.form_language, 8) ?? "es",
      has_disability: !!a.has_disability,
      languages: Array.isArray(a.languages) ? a.languages : [],
      years_experience: clampStr(a.years_experience, 50),
      availability: clampStr(a.availability, 100),
      shifts: Array.isArray(a.shifts) ? a.shifts.filter((s) => typeof s === "string").slice(0, 10) : [],
    };

    if (!row.first_name || !row.last_name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: inserted, error: insErr } = await supabase
      .from("applications")
      .insert(row)
      .select("id")
      .single();

    if (insErr) {
      console.error("[submit-application] insert error:", insErr);
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fire-and-forget AI processing (don't block the candidate)
    if (inserted?.id) {
      // @ts-ignore - EdgeRuntime is a Supabase Deno global
      const wait = (globalThis as any).EdgeRuntime?.waitUntil;
      const task = supabase.functions
        .invoke("process-application", { body: { application_id: inserted.id } })
        .catch((e) => console.error("[submit-application] process-application error:", e));
      if (typeof wait === "function") wait(task);
    }

    return new Response(JSON.stringify({ ok: true, id: inserted?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[submit-application] unexpected error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
