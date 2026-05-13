// incidencias-bulk-scan-split
// Pipeline (NO rotation, NO PDF rebuild — leave the scanned file as-is):
//   1) Pedir a la IA una LECTURA POR PÁGINA del pie del PDF (nombre + "Página X de N").
//   2) Agrupar documentos en código a partir de "Página 1 de N":
//        pageEnd = pageStart + N - 1
//        Si aparece otro "1 de N" antes, truncar.
//   3) Emparejar cada documento con un taskId mediante normalización de nombre.
//
// Devuelve assignments + page_readings. NO devuelve normalized_pdf_base64:
// el visor del frontend muestra el archivo original tal cual lo subió el escáner.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ok = (data: Record<string, unknown>) =>
  new Response(JSON.stringify({ success: true, ...data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const err = (error: string, status = 200) =>
  new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface TaskInput {
  taskId: string;
  worker_name: string;
  worker_number?: string | null;
  documento_tipo: 'amonestacion' | 'sancion' | null;
  gravedad?: string | null;
}

interface ChatMessage { role: 'user' | 'assistant'; content: string }

interface PageReading {
  pdf_page: number;
  worker_name: string | null;
  footer_worker_name?: string | null;
  marker_current: number | null;
  marker_total: number | null;
  marker_literal?: string | null;
  raw_footer_text?: string | null;
  confidence?: 'high' | 'medium' | 'low';
}

// ───────────────────────────────────────────────────────────────────────────
// NAME NORMALIZATION + MATCHING
// ───────────────────────────────────────────────────────────────────────────
function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).toLowerCase();
  // Strip honorifics / titles
  s = s.replace(/\b(don|do[ñn]a|d\.|d[ñn]a\.?|sr\.?|sra\.?|mr\.?|mrs\.?)\b/g, ' ');
  // María abbreviations
  s = s.replace(/mª/g, 'maria').replace(/m\.ª/g, 'maria').replace(/\bma\.\b/g, 'maria');
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function nameTokens(raw: string | null | undefined): Set<string> {
  const n = normalizeName(raw);
  if (!n) return new Set();
  return new Set(n.split(' ').filter(t => t.length >= 2));
}

function nameMatchScore(readName: string | null | undefined, taskName: string): number {
  const a = nameTokens(readName);
  const b = nameTokens(taskName);
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  // Use min set size so partial reads still score high (e.g. "Muhamed Kaita"
  // vs a longer registered name still matches if both tokens appear).
  return common / Math.min(a.size, b.size);
}

function findBestTask(
  readName: string | null,
  readTipo: string | null,
  tasks: TaskInput[],
  alreadyAssigned: Set<string>,
): { taskId: string; score: number } | null {
  if (!readName) return null;
  let best: { taskId: string; score: number } | null = null;
  for (const t of tasks) {
    if (alreadyAssigned.has(t.taskId)) continue;
    let score = nameMatchScore(readName, t.worker_name);
    if (readTipo && t.documento_tipo && readTipo === t.documento_tipo) score += 0.05;
    if (!best || score > best.score) best = { taskId: t.taskId, score };
  }
  if (!best || best.score < 0.4) return null;
  return best;
}

// ───────────────────────────────────────────────────────────────────────────
// DETERMINISTIC GROUPING from per-page readings
// ───────────────────────────────────────────────────────────────────────────
interface GroupedDoc {
  pageStart: number;
  pageEnd: number;
  matched_name: string | null;
  matched_tipo: string | null;
  page_marker: string | null;
  document_total_pages: number | null;
  pages_present: number[];
  warning?: string;
  confidence: 'high' | 'medium' | 'low';
}

function groupDocumentsFromReadings(readings: PageReading[], totalPages: number): GroupedDoc[] {
  const byPage = new Map<number, PageReading>();
  for (const r of readings) {
    if (Number.isFinite(r.pdf_page) && r.pdf_page >= 1 && r.pdf_page <= totalPages) {
      byPage.set(r.pdf_page, r);
    }
  }

  const docs: GroupedDoc[] = [];
  let page = 1;
  while (page <= totalPages) {
    const r = byPage.get(page);
    const isStart = !!(r && r.marker_current === 1 && Number.isFinite(r.marker_total) && (r.marker_total as number) >= 1);
    if (!isStart) {
      page++;
      continue;
    }
    const N = r!.marker_total as number;
    const start = page;
    // STRICT: si el pie dice "Página 1 de N", el documento ocupa N páginas.
    // No se trunca por encontrar otro "Página 1 de M" dentro del rango — la IA
    // puede leer mal una página intermedia y no debemos saltarnos hojas.
    const end = Math.min(start + N - 1, totalPages);

    let warning: string | undefined;
    const pagesPresent: number[] = [];
    for (let p = start; p <= end; p++) if (byPage.has(p)) pagesPresent.push(p);
    const available = end - start + 1;
    if (available < N) {
      warning = `Faltan páginas: el marcador esperaba ${N}, sólo hay ${available} disponibles en el PDF.`;
    } else {
      // Verificación blanda: avisa si una página intermedia dice otro total,
      // pero NO cambia el rango.
      for (let p = start + 1; p <= end; p++) {
        const rp = byPage.get(p);
        if (rp && rp.marker_current === 1 && rp.marker_total && rp.marker_total !== N) {
          warning = `Aviso: la pág. ${p} parece otro inicio "Página 1 de ${rp.marker_total}", pero se respeta el "Página 1 de ${N}" del inicio.`;
          break;
        }
        if (rp && rp.marker_total && rp.marker_total !== N && rp.marker_current !== 1) {
          warning = `Aviso: la pág. ${p} muestra "de ${rp.marker_total}" pero la primera dice "de ${N}".`;
          break;
        }
      }
    }

    docs.push({
      pageStart: start,
      pageEnd: end,
      // Prefer the footer name (it's the ground truth for mapping per the user).
      matched_name: r!.footer_worker_name || r!.worker_name || null,
      matched_tipo: null,
      page_marker: r!.marker_literal || `Página 1 de ${N}`,
      document_total_pages: N,
      pages_present: pagesPresent,
      warning,
      confidence: r!.confidence || 'medium',
    });

    page = end + 1;
  }

  return docs;
}

// ───────────────────────────────────────────────────────────────────────────
// MAIN
// ───────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { sessionToken, pdfBase64, taskIds, chat, currentAssignments } = body as {
      sessionToken?: string;
      pdfBase64?: string;
      taskIds?: string[];
      chat?: ChatMessage[];
      currentAssignments?: Array<{ taskId: string; pageStart: number; pageEnd: number }>;
    };

    if (!sessionToken) return err('Session token required');
    if (!pdfBase64) return err('Missing pdfBase64');
    if (!Array.isArray(taskIds) || taskIds.length === 0) return err('Missing taskIds');

    // ── Validate session ───────────────────────────────────────────
    const { data: session } = await supabase
      .from('manager_sessions')
      .select('expires_at, managers!inner(id, role)')
      .eq('token', sessionToken)
      .single();

    if (!session) return err('Invalid session');
    if (new Date(session.expires_at) < new Date()) return err('Session expired');
    const role = (session as any).managers?.role;
    if (role !== 'admin' && role !== 'manager' && role !== 'responsable') {
      return err('Access denied');
    }

    // ── Load PDF only to know how many pages it has (no rebuild!) ─
    const cleanB64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
    let totalPagesSeen = 0;
    try {
      const bin = atob(cleanB64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      totalPagesSeen = pdf.getPageCount();
    } catch (e) {
      console.error('[bulk-scan-split] failed to read PDF page count', e);
      return err('No se pudo abrir el PDF: ' + (e instanceof Error ? e.message : String(e)));
    }

    // ── Load task metadata ─────────────────────────────────────────
    const { data: rawTasks, error: tasksErr } = await supabase
      .from('incidencias_firma_tasks')
      .select(`
        id,
        status,
        legal_document_id,
        incidencias_legal_documents:legal_document_id (
          id,
          worker_name,
          worker_number,
          propuesta_id,
          incidencias_propuestas_rrhh:propuesta_id ( tipo, gravedad )
        )
      `)
      .in('id', taskIds);

    if (tasksErr) return err('Error loading tasks: ' + tasksErr.message);
    if (!rawTasks || rawTasks.length === 0) return err('No tasks found');

    const tasksForPrompt: TaskInput[] = rawTasks
      .filter((t: any) => t.status === 'awaiting_signature')
      .map((t: any) => {
        const ld = t.incidencias_legal_documents;
        const prop = ld?.incidencias_propuestas_rrhh;
        return {
          taskId: t.id,
          worker_name: ld?.worker_name || 'Desconocido',
          worker_number: ld?.worker_number || null,
          documento_tipo: prop?.tipo || null,
          gravedad: prop?.gravedad || null,
        };
      });

    if (tasksForPrompt.length === 0) {
      return err('Ninguna tarea está en estado "Pte. firma"');
    }

    // ── Build Gemini call: PER-PAGE READING (footer-focused) ──────
    const isRecalc = Array.isArray(chat) && chat.length > 0;

    const systemPrompt = `Eres un OCR experto. Recibes un PDF escaneado con varios documentos legales (amonestaciones y sanciones) concatenados. Tu ÚNICA tarea es leer CADA página y devolver una fila por página con lo que ves, MIRANDO ESPECIALMENTE EL PIE DE PÁGINA (la zona inferior).

EL PIE DE PÁGINA es la fuente de verdad: en él aparecen, casi siempre:
  • el NOMBRE COMPLETO del trabajador del documento,
  • un MARCADOR de paginación: "Página X de N", "Pág. X de N", "X / N", "X de N".

El PDF puede estar escaneado en horizontal/apaisado: igual debes leer el pie aunque el contenido aparezca rotado. NO te fíes de la orientación visual.

Para cada página devuelve:
- pdf_page: número físico de página (1-indexed) en el PDF que recibes.
- worker_name: nombre completo del trabajador que aparece en el cuerpo o cabecera (sin "Don/Doña/D./Dña/Mr./Sr.").
- footer_worker_name: NOMBRE leído en el pie de página (sin "Don/Doña..."). PRIMARIO para el mapeo. Si no aparece, null.
- marker_current: el número X que ves en "Página X de N" (también "Pág. X de N", "X / N", "X de N"). Está en el pie. Sin marcador → null.
- marker_total: el número N. Sin marcador → null.
- marker_literal: el texto literal leído, ej. "Página 1 de 3".
- raw_footer_text: una transcripción muy corta (< 120 caracteres) del pie completo si te ayuda. Opcional.
- confidence: "high", "medium" o "low" según la legibilidad.

REGLAS DURAS:
- Devuelve EXACTAMENTE una fila por página física del PDF. No te saltes ninguna.
- NO agrupes documentos. NO devuelvas rangos. NO emparejes con tareas. Eso lo hace después un programa determinista.
- Si una página está en blanco o ilegible, pon null en lo que no puedas leer y confidence: "low".
- El marcador "Página X de N" es ground truth: si lo ves, regístralo aunque el nombre no esté claro.
- El nombre del PIE manda sobre el del cuerpo cuando ambos existan.`;

    let userPrompt = `Devuélveme la lectura página a página del PDF adjunto. ${totalPagesSeen} páginas en total. Una fila por página, mirando especialmente el PIE de cada página.`;
    if (isRecalc) {
      userPrompt += `\n\nMensajes del usuario sobre lecturas anteriores (úsalos como pista, pero sigue devolviendo lectura por página):\n${(chat || []).map(m => `[${m.role}] ${m.content}`).join('\n')}`;
    }

    const responseSchema = {
      type: 'object',
      properties: {
        page_readings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pdf_page: { type: 'integer' },
              worker_name: { type: 'string' },
              footer_worker_name: { type: 'string' },
              marker_current: { type: 'integer' },
              marker_total: { type: 'integer' },
              marker_literal: { type: 'string' },
              raw_footer_text: { type: 'string' },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
            required: ['pdf_page'],
          },
        },
        assistant_message: { type: 'string' },
      },
      required: ['page_readings'],
    };

    const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');

    let aiPayload: any = null;
    let providerUsed = '';

    if (apiKey) {
      providerUsed = 'gemini-direct';
      const model = 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            role: 'user',
            parts: [
              { text: userPrompt },
              { inlineData: { mimeType: 'application/pdf', data: cleanB64 } },
            ],
          }],
          generationConfig: {
            temperature: 0.0,
            responseMimeType: 'application/json',
            responseSchema,
          },
        }),
      });

      if (!r.ok) {
        const txt = await r.text();
        console.error('[bulk-scan-split] Gemini direct error', r.status, txt);
        if (!lovableKey) return err(`Gemini error ${r.status}: ${txt.substring(0, 300)}`);
      } else {
        const data = await r.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          try { aiPayload = JSON.parse(text); } catch (e) {
            console.error('[bulk-scan-split] JSON parse error', text.substring(0, 500));
          }
        }
      }
    }

    if (!aiPayload && lovableKey) {
      providerUsed = 'lovable-ai';
      const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lovableKey}` },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: userPrompt },
                { type: 'image_url', image_url: { url: `data:application/pdf;base64,${cleanB64}` } },
              ],
            },
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'submit_page_readings',
              description: 'Devuelve lectura por página',
              parameters: responseSchema,
            },
          }],
          tool_choice: { type: 'function', function: { name: 'submit_page_readings' } },
        }),
      });
      if (!r.ok) {
        const txt = await r.text();
        if (r.status === 429) return err('Servicio de IA saturado. Inténtalo en unos segundos.');
        if (r.status === 402) return err('Sin créditos de IA.');
        return err(`AI error ${r.status}: ${txt.substring(0, 300)}`);
      }
      const data = await r.json();
      const argsStr = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (argsStr) {
        try { aiPayload = JSON.parse(argsStr); } catch (e) {
          console.error('[bulk-scan-split] gateway JSON parse error', argsStr.substring(0, 500));
        }
      }
    }

    if (!aiPayload) return err('La IA no devolvió un resultado válido');

    const pageReadings: PageReading[] = Array.isArray(aiPayload.page_readings)
      ? aiPayload.page_readings.filter((r: any) => Number.isFinite(r?.pdf_page))
      : [];

    // ── DETERMINISTIC GROUPING ─────────────────────────────────────
    const grouped = groupDocumentsFromReadings(pageReadings, totalPagesSeen);

    // ── Map each group to a task by name (footer first) ──────────
    const alreadyAssigned = new Set<string>();
    const assignments: any[] = [];
    const unassignedPages: number[] = [];

    for (const g of grouped) {
      const match = findBestTask(g.matched_name, null, tasksForPrompt, alreadyAssigned);
      if (match) {
        alreadyAssigned.add(match.taskId);
        const matchedTask = tasksForPrompt.find(t => t.taskId === match.taskId);
        assignments.push({
          taskId: match.taskId,
          pageStart: g.pageStart,
          pageEnd: g.pageEnd,
          matched_name: g.matched_name,
          matched_tipo: matchedTask?.documento_tipo || null,
          page_marker: g.page_marker,
          document_total_pages: g.document_total_pages,
          confidence: match.score >= 0.8 ? 'high' : match.score >= 0.55 ? 'medium' : 'low',
          reason: g.warning || `Marcador "${g.page_marker}" · empareja con "${matchedTask?.worker_name}" (score ${match.score.toFixed(2)})`,
          warning: g.warning || null,
        });
      } else {
        for (let p = g.pageStart; p <= g.pageEnd; p++) unassignedPages.push(p);
      }
    }

    // Pages that no group covered
    const coveredPages = new Set<number>();
    for (const a of assignments) {
      for (let p = a.pageStart; p <= a.pageEnd; p++) coveredPages.add(p);
    }
    for (let p = 1; p <= totalPagesSeen; p++) {
      if (!coveredPages.has(p) && !unassignedPages.includes(p)) unassignedPages.push(p);
    }
    unassignedPages.sort((a, b) => a - b);

    return ok({
      provider: providerUsed,
      tasks: tasksForPrompt,
      assignments,
      page_readings: pageReadings,
      unassigned_pages: unassignedPages,
      total_pages_seen: totalPagesSeen,
      assistant_message: aiPayload.assistant_message
        || (assignments.length === 0
          ? `He leído las ${totalPagesSeen} páginas pero no he detectado ningún marcador "Página 1 de N" en el pie. Indícame los rangos en el chat o usa los botones −/+.`
          : `He leído las ${totalPagesSeen} páginas y he agrupado ${assignments.length} documento${assignments.length === 1 ? '' : 's'} usando los marcadores "Página 1 de N" del pie.`),
    });
  } catch (e) {
    console.error('[bulk-scan-split] Unexpected error', e);
    return err('Error inesperado: ' + (e instanceof Error ? e.message : String(e)));
  }
});
