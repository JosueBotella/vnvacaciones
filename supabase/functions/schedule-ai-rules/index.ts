import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const dayNames: Record<string, string> = {
  "0": "Domingo", "1": "Lunes", "2": "Martes", "3": "Miércoles",
  "4": "Jueves", "5": "Viernes", "6": "Sábado",
};

function getSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function buildTeamMap(teams: { id: string; name: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const t of teams) map[t.id] = t.name;
  return map;
}

function buildCurrentScheduleText(
  currentSchedule: Record<string, Record<string, any>> | null,
  teamMap: Record<string, string>,
  shifts: any[],
  currentWeek: number,
  currentYear: number
): string {
  if (!currentSchedule || typeof currentSchedule !== "object") return "";

  const shiftNameMap: Record<string, string> = {};
  for (const s of (shifts || [])) shiftNameMap[s.shift_key] = s.name;
  shiftNameMap["rest"] = "Descanso";
  shiftNameMap["vacation"] = "Vacaciones";

  const lines: string[] = [];
  for (const dayKey of ["0", "1", "2", "3", "4", "5", "6"]) {
    const dayData = currentSchedule[dayKey];
    if (!dayData) continue;
    const assignments = Object.entries(dayData)
      .map(([teamId, val]: [string, any]) => {
        const teamName = teamMap[teamId] || teamId;
        const shiftKey = val?.type || "?";
        const shiftLabel = shiftNameMap[shiftKey] || shiftKey;
        const timeStr = val?.start && val?.end ? ` (${val.start}-${val.end})` : "";
        return `${teamName}=${shiftLabel}${timeStr}`;
      })
      .join(", ");
    lines.push(`  ${dayNames[dayKey]}: ${assignments}`);
  }

  if (lines.length === 0) return "";

  return `
HORARIO BASE ACTUAL (semana ${currentWeek}/${currentYear}):
${lines.join("\n")}

IMPORTANTE: Usa este horario como PUNTO DE PARTIDA para la semana ${currentWeek}. A partir de aquí, aplica las rotaciones que pide el usuario para las semanas siguientes.
`;
}

async function loadLearnedRules(departmentId: string): Promise<string[]> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("schedule_ai_memory")
      .select("learned_rule")
      .eq("department_id", departmentId)
      .order("created_at", { ascending: false })
      .limit(20);
    return (data || []).map((r: any) => r.learned_rule).filter(Boolean);
  } catch (e) {
    console.error("Error loading learned rules:", e);
    return [];
  }
}

async function saveLearnedRule(departmentId: string, instructions: string, corrections: string, learnedRule: string) {
  try {
    const sb = getSupabase();
    await sb.from("schedule_ai_memory").insert({
      department_id: departmentId,
      instructions,
      corrections,
      learned_rule: learnedRule,
    });
  } catch (e) {
    console.error("Error saving learned rule:", e);
  }
}

// --- Conversation CRUD ---
async function loadConversation(departmentId: string) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("schedule_ai_conversations")
    .select("*")
    .eq("department_id", departmentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function deleteMessage(messageId: string) {
  const sb = getSupabase();
  const { error } = await sb
    .from("schedule_ai_conversations")
    .delete()
    .eq("id", messageId);
  if (error) throw error;
}

async function clearConversation(departmentId: string) {
  const sb = getSupabase();
  const { error } = await sb
    .from("schedule_ai_conversations")
    .delete()
    .eq("department_id", departmentId);
  if (error) throw error;
}

async function saveMessage(departmentId: string, role: string, content: string, metadata: any = {}) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("schedule_ai_conversations")
    .insert({ department_id: departmentId, role, content, metadata })
    .select()
    .single();
  if (error) throw error;
  return data;
}

function buildSystemPrompt(
  departmentName: string,
  teams: { id: string; name: string }[],
  shifts: any[],
  weekCount: number,
  startWeek: number,
  startYear: number,
  currentScheduleText: string,
  learnedRulesText: string
): string {
  const teamsInfo = teams.map(t => `- "${t.name}" (ID: ${t.id})`).join("\n");
  const teamNamesList = teams.map(t => t.name).join(", ");
  const shiftsInfo = shifts
    ?.map((s: any) =>
      `- key="${s.shift_key}", nombre="${s.name}", horario=${s.is_rest ? "DESCANSO" : `${s.start_time || "?"}-${s.end_time || "?"}`}`
    )
    .join("\n") || "No hay turnos configurados, usa los estándar: morning, afternoon, night, rest";

  return `Eres un asistente experto en planificación de horarios laborales rotativos. Eres conversacional: puedes hacer preguntas al usuario si algo no está claro.

DEPARTAMENTO: "${departmentName}"

EQUIPOS disponibles (usa estos IDs exactos en el output):
${teamsInfo}

ORDEN SECUENCIAL de equipos (para rotaciones cíclicas):
${teamNamesList}

TURNOS DISPONIBLES:
${shiftsInfo}
${currentScheduleText}
DÍAS DE LA SEMANA (la semana empieza en domingo):
0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado
${learnedRulesText}
INSTRUCCIONES PARA ROTACIONES CÍCLICAS:

Cuando el usuario mencione "guardia", "rotación", "turnos rotativos" o similar, sigue estos pasos OBLIGATORIOS:

PASO 1 — IDENTIFICAR qué rota:
- ¿Qué equipos tienen un rol especial esta semana? (ej: guardia, tarde, noche)
- ¿Rotan de forma individual (1 equipo) o en pares/grupos (2+ equipos)?

PASO 2 — CONSTRUIR LA TABLA DE ROTACIÓN antes de generar el JSON:
- Escribe mentalmente la secuencia completa de rotación.
- Ejemplo con rotación por PARES y 12 equipos (A1,A2,A3,A4,B1,B2,B3,B4,C1,C2,C3,C4):
  Semana base: guardia = A1+A2
  Semana +1:   guardia = A3+A4
  Semana +2:   guardia = B1+B2
  Semana +3:   guardia = B3+B4
  Semana +4:   guardia = C1+C2
  Semana +5:   guardia = C3+C4
  Semana +6:   guardia = A1+A2 (vuelve al inicio, cíclico)

- Ejemplo con rotación INDIVIDUAL:
  Semana base: tarde = B2
  Semana +1:   tarde = B3
  Semana +2:   tarde = B4
  Semana +3:   tarde = C1
  Semana +4:   tarde = C2
  ...y así cíclicamente.

PASO 3 — GENERAR EL JSON:
- Aplica la tabla de rotación calculada en el paso 2 para CADA semana.
- Los equipos que NO tienen el rol rotativo mantienen su horario estándar del HORARIO BASE.
- NUNCA repitas el mismo grupo de guardia/rotación en semanas consecutivas (a menos que haya tantas semanas que el ciclo se complete).

REGLAS DE RESPUESTA:
- Si las instrucciones del usuario son CLARAS y tienes toda la información, responde DIRECTAMENTE con el JSON del horario.
- Si algo es AMBIGUO o necesitas aclaración, responde en TEXTO PLANO con tus preguntas. NO generes JSON hasta tener toda la info.
- Cuando generes el horario, responde SOLO con el JSON, sin texto adicional.

REGLAS GENERALES PARA EL JSON:
1. Genera EXACTAMENTE ${weekCount} semanas, empezando en semana ${startWeek}/${startYear}.
2. CADA equipo DEBE tener asignación en CADA día (0 a 6). NO dejes ningún equipo sin asignar.
3. Para "type" usa EXACTAMENTE los shift_key configurados. Para descanso usa "rest".
4. Para "start"/"end": copia los horarios del turno. Para rest pon null.
5. Debes generar datos para TODOS los equipos y TODOS los días. El schedule NO puede estar vacío.

FORMATO JSON (cuando generes horario):
{
  "weeks": [
    {
      "weekNumber": <número>,
      "year": <año>,
      "schedule": {
        "0": { "<teamId>": { "type": "<shift_key>", "start": "<HH:MM>" o null, "end": "<HH:MM>" o null }, ... },
        "1": { ... }, "2": { ... }, "3": { ... }, "4": { ... }, "5": { ... }, "6": { ... }
      }
    }
  ]
}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // CRUD actions
    if (action === "loadConversation") {
      const messages = await loadConversation(body.departmentId);
      return new Response(JSON.stringify({ success: true, messages }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "deleteMessage") {
      await deleteMessage(body.messageId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "clearConversation") {
      await clearConversation(body.departmentId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle memory save request
    if (body.saveMemory && body.departmentId && body.corrections) {
      await saveLearnedRule(body.departmentId, body.userInstructions || "", body.corrections, body.corrections);
      return new Response(JSON.stringify({ success: true, memorySaved: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Main generation / conversation flow ---
    const {
      departmentName, departmentId, teams, shifts,
      conversationMessages, weekCount = 4,
      startWeek, startYear, currentSchedule,
      currentWeek, currentYear, userMessage,
    } = body;

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY is not configured");

    if (!userMessage && !conversationMessages?.length) {
      return new Response(
        JSON.stringify({ error: "Se requiere un mensaje" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!teams?.length) {
      return new Response(
        JSON.stringify({ error: "No hay equipos configurados" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const teamMap = buildTeamMap(teams);
    const learnedRules = departmentId ? await loadLearnedRules(departmentId) : [];
    const learnedRulesText = learnedRules.length > 0
      ? `\nREGLAS APRENDIDAS DE CORRECCIONES PREVIAS (aplica estas reglas, tienen prioridad):\n${learnedRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n`
      : "";

    const currentScheduleText = buildCurrentScheduleText(
      currentSchedule, teamMap, shifts || [], currentWeek || 0, currentYear || 0
    );

    const systemPrompt = buildSystemPrompt(
      departmentName, teams, shifts || [], weekCount, startWeek, startYear,
      currentScheduleText, learnedRulesText
    );

    console.log(`[schedule-ai-rules] Dept: ${departmentName}, Teams: ${teams.length}, Learned: ${learnedRules.length}`);

    // Save user message to conversation
    const savedUserMsg = await saveMessage(departmentId, "user", userMessage || conversationMessages?.[conversationMessages.length - 1]?.content || "");

    // Build messages for AI from conversation history
    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    if (conversationMessages?.length) {
      for (const msg of conversationMessages) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add the new user message
    if (userMessage) {
      messages.push({ role: "user", content: userMessage });
    }

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GOOGLE_AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-pro",
        messages,
        // No response_format to allow text questions + JSON
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Límite de peticiones excedido. Inténtalo en unos segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errText = await response.text();
      console.error("Google AI error:", response.status, errText);
      return new Response(JSON.stringify({ error: "Error al conectar con la IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: "La IA no devolvió contenido." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Detect if response is JSON (schedule) or text (question)
    const trimmed = content.trim();
    let isJson = false;
    let parsed: any = null;

    // Try to extract JSON from the response (may be wrapped in ```json blocks)
    let jsonStr = trimmed;
    const jsonBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      jsonStr = jsonBlockMatch[1].trim();
    }

    try {
      parsed = JSON.parse(jsonStr);
      if (parsed.weeks && Array.isArray(parsed.weeks) && parsed.weeks.length > 0) {
        isJson = true;
      }
    } catch {
      // Not JSON — it's a question/text response
    }

    if (isJson && parsed) {
      // Validate
      const firstWeek = parsed.weeks[0];
      if (!firstWeek.schedule || Object.keys(firstWeek.schedule).length === 0) {
        const savedMsg = await saveMessage(departmentId, "assistant", "He generado un horario pero parece estar vacío. ¿Puedes darme más detalles sobre la rotación que necesitas?", { isQuestion: true });
        return new Response(JSON.stringify({
          success: true, type: "question",
          message: "He generado un horario pero parece estar vacío. ¿Puedes darme más detalles?",
          savedMessage: savedMsg,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Save as assistant message with schedule data in metadata
      const savedMsg = await saveMessage(departmentId, "assistant",
        `Horario generado: ${parsed.weeks.length} semanas (S${parsed.weeks[0].weekNumber}-S${parsed.weeks[parsed.weeks.length - 1].weekNumber})`,
        { hasSchedule: true, weeks: parsed.weeks }
      );

      console.log(`[schedule-ai-rules] Schedule generated: ${parsed.weeks.length} weeks`);

      return new Response(JSON.stringify({
        success: true, type: "schedule", data: parsed,
        savedMessage: savedMsg,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      // Text response (question or clarification)
      const savedMsg = await saveMessage(departmentId, "assistant", trimmed, { isQuestion: true });

      return new Response(JSON.stringify({
        success: true, type: "question", message: trimmed,
        savedMessage: savedMsg,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    console.error("schedule-ai-rules error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
