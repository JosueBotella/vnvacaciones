import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// VerdNatura logistics center coordinates (Valencia)
const VERDNATURA_LAT = 39.4561;
const VERDNATURA_LNG = -0.3545;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { application_id } = await req.json();
    if (!application_id) {
      return new Response(JSON.stringify({ error: "application_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch application
    const { data: app, error: appErr } = await supabase
      .from("applications")
      .select("*, job_positions(criteria)")
      .eq("id", application_id)
      .single();

    if (appErr || !app) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as processing
    await supabase
      .from("applications")
      .update({ ai_status: "processing" })
      .eq("id", application_id);

    // Calculate distance
    let distance_km: number | null = null;
    if (app.current_lat && app.current_lng) {
      distance_km = Math.round(haversineKm(app.current_lat, app.current_lng, VERDNATURA_LAT, VERDNATURA_LNG) * 10) / 10;
      await supabase.from("applications").update({ distance_km }).eq("id", application_id);
    }

    // Get criteria
    const criteria = app.job_positions?.criteria || {};

    // Pre-check: distance vs vehicle limit
    if (distance_km !== null) {
      const vehicleKey = `max_distance_km_${app.vehicle}`;
      const maxDist = criteria[vehicleKey];
      if (maxDist && distance_km > maxDist) {
        await supabase
          .from("applications")
          .update({
            ai_status: "rejected",
            ai_score: 0,
            ai_rejection_reasons: ["distance_exceeded"],
            ai_summary: `Distancia (${distance_km} km) supera el límite para vehículo ${app.vehicle} (${maxDist} km)`,
            ai_processed_at: new Date().toISOString(),
          })
          .eq("id", application_id);

        return new Response(JSON.stringify({ success: true, status: "rejected", reason: "distance_exceeded" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Pre-check: Spanish level
    if (criteria.min_spanish_level && app.spanish_level < criteria.min_spanish_level) {
      await supabase
        .from("applications")
        .update({
          ai_status: "rejected",
          ai_score: 0,
          ai_rejection_reasons: ["spanish_too_low"],
          ai_summary: `Nivel de español (${app.spanish_level}) inferior al mínimo requerido (${criteria.min_spanish_level})`,
          ai_processed_at: new Date().toISOString(),
        })
        .eq("id", application_id);

      return new Response(JSON.stringify({ success: true, status: "rejected", reason: "spanish_too_low" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download CV from storage
    let cvContent: string | null = null;
    let cvBase64: string | null = null;
    let cvMimeType: string | null = null;

    if (app.cv_file_url) {
      const storagePath = app.cv_file_url.replace(/^.*\/storage\/v1\/object\/.*?\//, "");
      const { data: fileData, error: fileErr } = await supabase.storage
        .from("cvs")
        .download(storagePath);

      if (!fileErr && fileData) {
        if (app.cv_file_type === "pdf") {
          cvContent = await fileData.text();
          if (cvContent.startsWith("%PDF")) {
            // Binary PDF - send as base64
            const arrayBuffer = await fileData.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = "";
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            cvBase64 = btoa(binary);
            cvMimeType = "application/pdf";
            cvContent = null;
          }
        } else {
          // Image - convert to base64
          const arrayBuffer = await fileData.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          cvBase64 = btoa(binary);
          cvMimeType = "image/jpeg";
        }
      }
    }

    // Build Gemini prompt
    const systemPrompt = `Eres un experto en recursos humanos analizando CVs para VerdNatura, empresa de logística de flores y plantas en Valencia, España.
Analiza el CV del candidato y devuelve ESTRICTAMENTE un JSON con este formato:
{
  "score": number (0-100),
  "extracted": {
    "years_experience": number,
    "languages": [{"lang": string, "level": "basic"|"intermediate"|"advanced"|"native"}],
    "estimated_age": number|null,
    "previous_roles": [string],
    "education": string
  },
  "summary": "2-3 líneas en español resumiendo al candidato",
  "rejection_reasons": [string],
  "passed": boolean
}`;

    const langsTxt = Array.isArray(app.languages) && app.languages.length
      ? app.languages.map((l: any) => `${l.lang} (nivel ${l.level}/4)`).join(", ")
      : "no declarados";
    const shiftsTxt = Array.isArray(app.shifts) && app.shifts.length ? app.shifts.join(", ") : "no declarado";

    const candidateInfo = `DATOS DEL CANDIDATO:
- Nombre: ${app.first_name} ${app.last_name}
- Género: ${app.gender}
- País de origen: ${app.origin_country}
- Dirección: ${app.current_address}
- Distancia al centro de trabajo: ${distance_km ?? "desconocida"} km
- Vehículo: ${app.vehicle}
- Nivel de español declarado: ${app.spanish_level}/5
- Idiomas hablados: ${langsTxt}
- Años de experiencia (logística/almacén): ${app.years_experience ?? "no declarado"}
- Disponibilidad para empezar: ${app.availability ?? "no declarada"}
- Turnos disponibles: ${shiftsTxt}
- Idioma del formulario: ${app.form_language}
- Discapacidad reconocida: ${app.has_disability ? "Sí" : "No"}

CRITERIOS DE LA VACANTE:
${JSON.stringify(criteria, null, 2)}

${criteria.custom_prompt ? `INSTRUCCIONES ADICIONALES DEL ADMINISTRADOR:\n${criteria.custom_prompt}` : ""}

Evalúa al candidato considerando:
1. Experiencia relevante en logística, almacén, agricultura o similar
2. Keywords requeridas: ${(criteria.required_keywords || []).join(", ") || "ninguna"}
3. Keywords preferidas: ${(criteria.preferred_keywords || []).join(", ") || "ninguna"}
4. Distancia y vehículo
5. Idiomas y nivel de español
6. Si no hay CV adjunto, evalúa solo con los datos del formulario
${criteria.prefer_disability && app.has_disability ? "7. BONUS: El candidato tiene discapacidad reconocida y la empresa prioriza estos perfiles. Añade +10 puntos al score." : ""}
${criteria.preferred_gender && app.gender === criteria.preferred_gender ? "8. BONUS: El género del candidato coincide con la preferencia de la vacante. Considera esto positivamente." : ""}

Sé justo pero exigente. Score >70 = buen candidato, 40-70 = aceptable, <40 = no apto.`;

    // Call Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    // Build user message with optional image/pdf
    if (cvBase64 && cvMimeType) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: candidateInfo + "\n\nCV adjunto (analiza el documento):" },
          { type: "image_url", image_url: { url: `data:${cvMimeType};base64,${cvBase64}` } },
        ],
      });
    } else if (cvContent) {
      messages.push({
        role: "user",
        content: candidateInfo + "\n\nCONTENIDO DEL CV:\n" + cvContent,
      });
    } else {
      messages.push({
        role: "user",
        content: candidateInfo + "\n\nNOTA: No hay CV adjunto. Evalúa solo con los datos del formulario.",
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_cv",
              description: "Return structured CV analysis",
              parameters: {
                type: "object",
                properties: {
                  score: { type: "number", description: "Score 0-100" },
                  extracted: {
                    type: "object",
                    properties: {
                      years_experience: { type: "number" },
                      languages: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            lang: { type: "string" },
                            level: { type: "string", enum: ["basic", "intermediate", "advanced", "native"] },
                          },
                          required: ["lang", "level"],
                        },
                      },
                      estimated_age: { type: "number" },
                      previous_roles: { type: "array", items: { type: "string" } },
                      education: { type: "string" },
                    },
                    required: ["years_experience", "languages", "previous_roles", "education"],
                  },
                  summary: { type: "string" },
                  rejection_reasons: { type: "array", items: { type: "string" } },
                  passed: { type: "boolean" },
                },
                required: ["score", "extracted", "summary", "rejection_reasons", "passed"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_cv" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No structured response from AI");
    }

    const result = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    // Update application with AI results
    await supabase
      .from("applications")
      .update({
        ai_score: Math.max(0, Math.min(100, Math.round(result.score))),
        ai_extracted: result.extracted,
        ai_summary: result.summary,
        ai_status: result.passed ? "passed" : "rejected",
        ai_rejection_reasons: result.rejection_reasons?.length > 0 ? result.rejection_reasons : null,
        ai_processed_at: new Date().toISOString(),
      })
      .eq("id", application_id);

    return new Response(
      JSON.stringify({ success: true, status: result.passed ? "passed" : "rejected", score: result.score }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("process-application error:", error);

    // Try to mark as error
    try {
      const { application_id } = await req.clone().json().catch(() => ({}));
      if (application_id) {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await supabase
          .from("applications")
          .update({ ai_status: "error", ai_processed_at: new Date().toISOString() })
          .eq("id", application_id);
      }
    } catch {}

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
