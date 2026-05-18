// incidencias-operations v2.1 - auto-sync departments
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, degrees } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const errorResponse = (error: string, status = 200) =>
  new Response(JSON.stringify({ success: false, error }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

const LEGAL_DOCUMENT_LOGO_URL = '/images/verdnatura-logo-green.png';
const LEGAL_DOCUMENT_SIGNATURE_URL = '/images/firma_juanvi.png';

const VIDEO_EXT_LEGAL = /\.(mp4|mov|avi|webm|mkv|3gp|m4v)$/i;

function formatTimestampMMSS(seconds: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mm = Math.floor(total / 60).toString().padStart(2, '0');
  const ss = (total % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function videoFileNameFromPath(path: string): string {
  const m = String(path || '').match(/incidencias-pruebas\/([^?]+)/);
  const clean = m ? decodeURIComponent(m[1]) : String(path || '').split('?')[0];
  return clean.split('/').pop() || 'vídeo';
}

function sanitizeFrameDescription(raw: string | undefined | null): string {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  // Drop UUIDs, long internal codes, raw paths
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '');
  s = s.replace(/[a-z0-9_\-./]{40,}/gi, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/[.!?]+$/, '');
  if (s.length > 180) s = s.slice(0, 177).replace(/\s+\S*$/, '') + '…';
  return s;
}

function buildVideoFrameCaption(frame: any): string {
  // Sober factual line — no "Vídeo · MM:SS —" prefix (it added visual noise
  // without giving useful info to the reader of the legal document).
  const stored = String(frame?.caption || '').trim();
  // If a persisted caption exists, strip any legacy "Vídeo · MM:SS — " prefix.
  if (stored) {
    const cleaned = stored.replace(/^\s*(?:<strong>)?\s*V[ií]deo\s*·\s*\d{1,2}:\d{2}\s*(?:<\/strong>)?\s*[—\-:.]\s*/i, '').trim();
    return escapeHtml(cleaned || 'Fotograma extraído del vídeo aportado');
  }
  const factual = sanitizeFrameDescription(frame?.ai_description) || 'Fotograma extraído del vídeo aportado';
  return escapeHtml(factual);
}

/**
 * Whether this frame row is a verified V2 capture, the only kind that may
 * appear in legal documents. Anything else (legacy rows, manual inserts,
 * imports without trace) is rejected on purpose — see plan.
 */
function isVerifiedVideoFrame(frame: any): boolean {
  return !!(
    frame
    && frame.frame_url
    && (frame.capture_source === 'browser_canvas' || frame.capture_source === 'server_ffmpeg')
    && (frame.storage_path || '').startsWith('video-frames-v2/')
  );
}

function hasVideoEvidenceForProposal(prop: any, rec: any): boolean {
  const recPruebas = Array.isArray(rec?.pruebas_urls) ? rec.pruebas_urls : [];
  const adminPruebas = Array.isArray(prop?.admin_pruebas_urls) ? prop.admin_pruebas_urls : [];
  return [...recPruebas, ...adminPruebas].some((p: any) => typeof p === 'string' && VIDEO_EXT_LEGAL.test(p.split('?')[0]));
}

const CONVENIO_LIMITES: Record<string, { min: number; max: number }> = {
  leve: { min: 0, max: 2 },
  grave: { min: 3, max: 14 },
  muy_grave: { min: 14, max: 30 },
};

interface NormalizedLegalData {
  tipo: string;
  gravedad: string;
  suspension_dias: number | null;
  suspension_fechas: string[] | null;
  sin_suspension_explicita?: boolean;
  clamped: boolean;         // true if days were clamped to legal range
  original_dias?: number;   // before clamping
}

/**
 * Normalize tipo, gravedad and suspension_dias to be convenio-compliant.
 * - amonestación → no suspension
 * - sanción leve → 0-2 days
 * - sanción grave → 3-14 days
 * - sanción muy grave → 14-30 days
 * Also recalculates suspension_fechas (natural/calendar days) if days changed.
 */
function normalizeLegalData(params: {
  tipo: string;
  gravedad: string | null;
  suspension_dias: number | null;
  sin_suspension_explicita?: boolean;
  fecha_inicio?: string | null;
  existing_fechas?: string[] | null;
}): NormalizedLegalData {
  let { tipo, gravedad, suspension_dias, sin_suspension_explicita, fecha_inicio, existing_fechas } = params;

  // Map moderada → leve for legal purposes
  if (gravedad === 'moderada') gravedad = 'leve';

  // Amonestación: no suspension at all
  if (tipo === 'amonestacion') {
    return {
      tipo: 'amonestacion',
      gravedad: 'leve',
      suspension_dias: null,
      suspension_fechas: null,
      clamped: !!suspension_dias,
      original_dias: suspension_dias ?? undefined,
    };
  }

  // Ensure tipo is sancion
  tipo = 'sancion';
  if (!gravedad || !['leve', 'grave', 'muy_grave'].includes(gravedad)) {
    gravedad = 'leve';
  }

  const limite = CONVENIO_LIMITES[gravedad] || CONVENIO_LIMITES.leve;
  const originalDias = suspension_dias;

  if (tipo === 'sancion' && sin_suspension_explicita === true) {
    return {
      tipo,
      gravedad,
      suspension_dias: 0,
      suspension_fechas: null,
      sin_suspension_explicita: true,
      clamped: originalDias != null && originalDias !== 0,
      original_dias: originalDias ?? undefined,
    };
  }

  if (suspension_dias == null || suspension_dias < 0) {
    suspension_dias = limite.min;
  }
  if (suspension_dias < limite.min) suspension_dias = limite.min;
  if (suspension_dias > limite.max) suspension_dias = limite.max;

  const clamped = originalDias != null && originalDias !== suspension_dias;

  // Recalculate suspension_fechas if we have days and a start date
  let suspension_fechas: string[] | null = existing_fechas || null;
  if (suspension_dias > 0 && fecha_inicio) {
    suspension_fechas = calculateSuspensionDates(fecha_inicio, suspension_dias);
  } else if (suspension_dias === 0) {
    suspension_fechas = null;
  }

  return { tipo, gravedad, suspension_dias, suspension_fechas, sin_suspension_explicita: false, clamped, original_dias: originalDias ?? undefined };
}

/**
 * Calculate N natural (calendar) days starting from fecha_inicio.
 * Per Art. 5 Código Civil, suspension days are natural days (weekends included).
 */
function calculateSuspensionDates(fechaInicio: string, dias: number): string[] {
  const dates: string[] = [];
  const start = new Date(fechaInicio);
  if (Number.isNaN(start.getTime())) return [];

  const current = new Date(start);
  for (let i = 0; i < dias; i++) {
    dates.push(current.toISOString().slice(0, 10));
    if (i < dias - 1) {
      current.setDate(current.getDate() + 1);
    }
  }
  return dates;
}

// ── Legal document helpers ──────────────────────────────────────────────────
function formatLegalDate(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatLegalTime(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function addDaysToDate(value: string, days: number): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString();
}

function hasMinimumText(text: string | null | undefined, minLen = 160): boolean {
  return String(text || '').replace(/\s+/g, ' ').trim().length >= minLen;
}

function escapeRegExp(value: string): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compacts a "citado" article string into the short form used historically
 * in the printed legal document, e.g.:
 *   "ARTÍCULO 49 — Principios de ordenación del XVIII Convenio Colectivo …"
 *   → "Art. 49 del XVIII Convenio Colectivo Estatal para las Empresas del
 *      Comercio de mercancía"
 * Removes uppercase headings, descriptive sub-titles after a dash, and keeps
 * only what's needed to identify the source.
 */
function compactArticuloCitado(raw: string): string {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';

  // Strip leading bullet/dash markers the AI sometimes injects.
  s = s.replace(/^[•\-\u2013\u2014\u2022·*]\s*/, '');

  // Normalise "ARTÍCULO 50.1.f" / "Articulo 50.1.f" → "Art. 50.1.f"
  s = s.replace(/\bart[íi]culos?\b\s*/gi, 'Art. ');
  // Avoid duplicated "Art. Art."
  s = s.replace(/\bArt\.\s+Art\.\s+/g, 'Art. ');
  // Remove a stray colon right after the number (e.g., "Art. 50.1.f:")
  s = s.replace(/(Art\.\s*[\w.()ºª]+)\s*[:.\-\u2013\u2014]\s+/i, '$1 — ');

  // Drop descriptive title between "Art. XX.x — Título — del Convenio…"
  // Pattern: "Art. <num> — <title> del <source>" → "Art. <num> del <source>"
  s = s.replace(/^(Art\.\s*[\w.()ºª]+)\s*[—\-\u2013]\s*[^—]*?\s+del\s+/i, '$1 del ');

  // If there's still a long descriptive tail before "del" (no dash variant),
  // collapse it: "Art. 49 Principios de ordenación del XVIII Convenio…"
  s = s.replace(/^(Art\.\s*[\w.()ºª]+)\s+[^—]*?\s+del\s+/i, '$1 del ');

  // Drop trailing parenthetical references e.g. "(50.1.f)" duplicated.
  s = s.replace(/\s*\(([^)]{0,40})\)\s*$/i, (match, inner) => {
    return /^\d/.test(inner) ? '' : match;
  });

  // Capitalise only the leading "Art."; keep the rest in natural case.
  s = s.replace(/^art\.?\s*/i, 'Art. ');

  // Final tidy.
  return s.replace(/\s{2,}/g, ' ').trim();
}

// Nombres oficiales completos de las fuentes legales citadas en los documentos
// disciplinarios. Se usan para expandir artículos cortos (ej. "Art. 50.1.f") a su
// forma jurídica completa con la fuente normativa correcta.
const FUENTE_CONVENIO = 'XVIII Convenio Colectivo Estatal para las Empresas del Comercio de Flores y Plantas';
const FUENTE_ESTATUTO = 'Real Decreto Legislativo 2/2015, de 23 de octubre, por el que se aprueba el texto refundido de la Ley del Estatuto de los Trabajadores';

/**
 * Expande un artículo citado en formato corto al formato completo con su fuente
 * normativa. Ejemplos:
 *   "Art. 50.1.f"            → "Art. 50.1.f del XVIII Convenio Colectivo Estatal para las Empresas del Comercio de Flores y Plantas"
 *   "Art. 58 ET"             → "Art. 58 del Real Decreto Legislativo 2/2015, de 23 de octubre, por el que se aprueba el texto refundido de la Ley del Estatuto de los Trabajadores"
 *   "Art. 51.a del Convenio" → "Art. 51.a del XVIII Convenio Colectivo Estatal para las Empresas del Comercio de Flores y Plantas"
 * Si ya viene con una fuente reconocible, se respeta tal cual.
 */
function expandArticuloCitado(input: string): string {
  const compact = compactArticuloCitado(input);
  if (!compact) return '';

  // Detectar el número del artículo
  const match = compact.match(/^Art\.\s*([\w.()ºª]+)\s*(.*)$/i);
  if (!match) return compact;
  const numero = match[1];
  const resto = (match[2] || '').trim();

  const restoLower = resto.toLowerCase();
  const mencionaEstatuto = /\b(et|estatuto|real\s+decreto\s+legislativo|trabajadores)\b/.test(restoLower);
  const mencionaConvenio = /\b(convenio|comercio|flores|plantas|xviii)\b/.test(restoLower);

  // Si ya viene con la fuente completa (ej. menciona "Real Decreto Legislativo"
  // o "XVIII Convenio Colectivo Estatal"), respetarla.
  const yaTieneFuenteCompleta =
    /real\s+decreto\s+legislativo\s+2\/2015/i.test(resto) ||
    /xviii\s+convenio\s+colectivo\s+estatal/i.test(resto);
  if (yaTieneFuenteCompleta) {
    return `Art. ${numero} ${resto}`.replace(/\s+/g, ' ').trim();
  }

  if (mencionaEstatuto) {
    return `Art. ${numero} del ${FUENTE_ESTATUTO}`;
  }
  if (mencionaConvenio) {
    return `Art. ${numero} del ${FUENTE_CONVENIO}`;
  }

  // Sin fuente: deducir por el número del artículo.
  // Estatuto de los Trabajadores: arts. 14, 54, 58, 60.x
  const numeroBase = numero.split('.')[0];
  if (/^(14|54|58|60)$/.test(numeroBase)) {
    return `Art. ${numero} del ${FUENTE_ESTATUTO}`;
  }
  // Convenio: arts. 49, 50, 51 (régimen disciplinario)
  if (/^(49|50|51)$/.test(numeroBase)) {
    return `Art. ${numero} del ${FUENTE_CONVENIO}`;
  }

  // Fallback: devolver tal cual con el resto (sin inventar fuente)
  return resto ? `Art. ${numero} ${resto}` : `Art. ${numero}`;
}

function compactArticulosCitados(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const expanded = expandArticuloCitado(String(raw || ''));
    if (!expanded) continue;
    const key = expanded.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(expanded);
  }
  return out;
}

function normalizeParagraphs(text: string | null | undefined): string[] {
  return String(text || '').replace(/\r/g, '').split(/\n\s*\n+/).map(p => p.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function restoreAllowedInlineHtml(value: string): string {
  let normalized = String(value || '');

  // Allow these inline/block tags inside legal sections so that AI-produced
  // lists or emphasised text don't appear escaped as literal HTML.
  const ALLOWED_TAGS_PATTERN = '(\\/?strong|\\/?em|\\/?ul|\\/?ol|\\/?li)';

  for (let index = 0; index < 2; index += 1) {
    normalized = normalized
      .replace(new RegExp(`&amp;lt;${ALLOWED_TAGS_PATTERN}&amp;gt;`, 'gi'), '&lt;$1&gt;')
      .replace(/&amp;lt;br\s*\/?&amp;gt;/gi, '&lt;br&gt;');
  }

  return normalized
    .replace(new RegExp(`&lt;${ALLOWED_TAGS_PATTERN}&gt;`, 'gi'), '<$1>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>');
}

function convertMarkdownBoldToHtml(text: string): string {
  // Convierte **texto** → <strong>texto</strong> y limpia asteriscos sueltos
  // sobrantes. Se aplica ANTES de escapar para que las etiquetas resultantes
  // sean preservadas por restoreAllowedInlineHtml.
  return String(text || '')
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<strong>$2</strong>')
    .replace(/\*+/g, '');
}

function sanitizeLegalInlineHtml(text: string): string {
  return restoreAllowedInlineHtml(escapeHtml(convertMarkdownBoldToHtml(text)));
}

// ─── Parser determinista de retrasos / impuntualidad ─────────────────────────
// Extrae cada línea del tipo:
//   "20 abril 2026 entrada 8:00 hora de llegada 8:04"
//   "2026-04-20 entrada prevista 08:00 llegada 08:04"
// y devuelve los retrasos con minutos calculados.
const SPANISH_MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

function parseTardinessDateToken(raw: string): Date | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  // ISO yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  // dd/mm/yyyy o dd-mm-yyyy
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const yy = Number(dmy[3]);
    const year = yy < 100 ? 2000 + yy : yy;
    const d = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  // "20 abril 2026" / "20 de abril de 2026"
  const dmyText = s.match(/^(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\s+(?:de\s+)?(\d{4})$/);
  if (dmyText) {
    const month = SPANISH_MONTHS[dmyText[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
    if (month != null) {
      const d = new Date(Number(dmyText[3]), month, Number(dmyText[1]));
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

interface TardinessEntry {
  date: Date;
  scheduledMinutes: number;
  actualMinutes: number;
  delayMinutes: number;
}

function parseTimeToMinutes(raw: string): number | null {
  const m = String(raw || '').match(/(\d{1,2})[:.h](\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function parseTardinessFromDescription(desc: string | null | undefined): TardinessEntry[] {
  const text = String(desc || '');
  if (!text.trim()) return [];
  const out: TardinessEntry[] = [];
  // Patrón flexible: <fecha> ... entrada (prevista)? HH:MM ... (hora de )?llegada HH:MM
  // Aceptamos fechas en 3 formatos.
  const lineRegex = /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+(?:de\s+)?[a-záéíóú]+\s+(?:de\s+)?\d{4})[^\n]*?entrada(?:\s+prevista)?\s*(\d{1,2}[:.h]\d{2})[^\n]*?(?:hora\s+de\s+)?llegada\s*(\d{1,2}[:.h]\d{2})/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(text)) !== null) {
    const date = parseTardinessDateToken(m[1]);
    const sch = parseTimeToMinutes(m[2]);
    const act = parseTimeToMinutes(m[3]);
    if (!date || sch == null || act == null) continue;
    const delay = act - sch;
    if (delay <= 0) continue;
    const key = `${date.toISOString().slice(0, 10)}|${sch}|${act}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date, scheduledMinutes: sch, actualMinutes: act, delayMinutes: delay });
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}

function formatLegalDateLong(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatLegalDateShort(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

interface TardinessWeekGroup {
  weekStart: Date; // lunes
  weekEnd: Date;   // domingo
  entries: TardinessEntry[];
  totalDelayMinutes: number;
}

function groupTardinessByWeek(entries: TardinessEntry[]): TardinessWeekGroup[] {
  const buckets = new Map<string, TardinessWeekGroup>();
  for (const e of entries) {
    const d = new Date(e.date);
    // Lunes como primer día de semana (es-ES)
    const day = d.getDay(); // 0=dom..6=sab
    const offsetToMonday = (day + 6) % 7;
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - offsetToMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const key = weekStart.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.entries.push(e);
      bucket.totalDelayMinutes += e.delayMinutes;
    } else {
      buckets.set(key, { weekStart, weekEnd, entries: [e], totalDelayMinutes: e.delayMinutes });
    }
  }
  return [...buckets.values()].sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
}

function buildWeekCaption(group: TardinessWeekGroup): string {
  const sameMonth = group.weekStart.getMonth() === group.weekEnd.getMonth()
    && group.weekStart.getFullYear() === group.weekEnd.getFullYear();
  const startStr = sameMonth
    ? group.weekStart.toLocaleDateString('es-ES', { day: 'numeric' })
    : formatLegalDateShort(group.weekStart);
  const endStr = formatLegalDateLong(group.weekEnd);
  const title = `Semana del ${startStr} al ${endStr}`;
  const subtitle = `Registro horario aportado como prueba documental · ${group.entries.length} retraso${group.entries.length === 1 ? '' : 's'} detectado${group.entries.length === 1 ? '' : 's'} · ${group.totalDelayMinutes} minuto${group.totalDelayMinutes === 1 ? '' : 's'} acumulado${group.totalDelayMinutes === 1 ? '' : 's'}.`;
  return `<strong>${title}</strong> — ${subtitle}`;
}

// Capitaliza la primera letra del subtítulo después del separador "—" en una
// leyenda con formato "<strong>Titulo</strong> — subtítulo." sin tocar el resto.
function capitalizeCaptionSubtitle(caption: string): string {
  return String(caption || '').replace(
    /(<\/strong>\s*[—\-:.]\s*)([a-záéíóúñ])/u,
    (_m, sep, ch) => `${sep}${ch.toUpperCase()}`,
  );
}

// Sustituye en el texto generado por IA cualquier mención al número de días
// de suspensión por el número REAL fijado por el admin. La IA con frecuencia
// "redondea" al mínimo legal del convenio (p.ej. 14 días para muy grave),
// ignorando el día concreto que el admin eligió manualmente.
const NUM_WORDS_ES_TO_NUM: Record<string, number> = {
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
  quince: 15, dieciseis: 16, dieciséis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, veintidós: 22,
  veintitres: 23, veintitrés: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintiséis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29, treinta: 30,
};
const NUM_TO_WORD_ES: Record<number, string> = {
  1: 'UN', 2: 'DOS', 3: 'TRES', 4: 'CUATRO', 5: 'CINCO', 6: 'SEIS', 7: 'SIETE',
  8: 'OCHO', 9: 'NUEVE', 10: 'DIEZ', 11: 'ONCE', 12: 'DOCE', 13: 'TRECE',
  14: 'CATORCE', 15: 'QUINCE', 16: 'DIECISÉIS', 17: 'DIECISIETE',
  18: 'DIECIOCHO', 19: 'DIECINUEVE', 20: 'VEINTE', 21: 'VEINTIUNO',
  22: 'VEINTIDÓS', 23: 'VEINTITRÉS', 24: 'VEINTICUATRO', 25: 'VEINTICINCO',
  26: 'VEINTISÉIS', 27: 'VEINTISIETE', 28: 'VEINTIOCHO', 29: 'VEINTINUEVE',
  30: 'TREINTA',
};

function enforceSuspensionDaysInText(
  text: string,
  opts: { suspensionDias?: number | null; fechaInicio?: string | null; suspensionFechas?: string[] | null },
): string {
  if (!text || typeof text !== 'string') return text;
  const dias = (typeof opts.suspensionDias === 'number' && opts.suspensionDias >= 0) ? opts.suspensionDias : null;
  if (dias === null || dias <= 0) return text;
  let out = text;

  // 1) "SUSPENSIÓN DE EMPLEO Y SUELDO DE <N> DÍAS"
  out = out.replace(
    /(suspensi[oó]n\s+de\s+empleo\s+y\s+sueldo\s+de\s+)(\d+)(\s+d[ií]as?)/gi,
    (_m, p1, _n, p3) => `${p1}${dias}${p3}`,
  );

  // 2) "<NUMERO_LETRAS> (<N>) DÍAS"
  out = out.replace(
    /\b([A-Za-zÁÉÍÓÚÑáéíóúñ]+)\s*\((\d+)\)\s*(d[ií]as?)\b/gi,
    (m, word, _n, dunit) => {
      const lc = String(word).toLowerCase();
      if (!(lc in NUM_WORDS_ES_TO_NUM)) return m; // evita falsos positivos
      const isUpper = word === word.toUpperCase();
      const replacementWord = isUpper
        ? (NUM_TO_WORD_ES[dias] || String(dias))
        : (NUM_TO_WORD_ES[dias] || String(dias)).toLowerCase();
      return `${replacementWord} (${dias}) ${dunit}`;
    },
  );

  // 3) "<N> días de suspensión" / "<N> días de empleo y sueldo"
  out = out.replace(
    /\b(\d+)(\s+d[ií]as?\s+de\s+(?:suspensi[oó]n|empleo\s+y\s+sueldo))\b/gi,
    (_m, _n, rest) => `${dias}${rest}`,
  );

  // 4) Recalcular fecha de fin
  let fechaInicioStr = '';
  let fechaFinStr = '';
  const fechas = Array.isArray(opts.suspensionFechas)
    ? opts.suspensionFechas.map(d => typeof d === 'string' ? d.split('T')[0] : '').filter(Boolean).sort()
    : [];
  if (fechas.length > 0) {
    fechaInicioStr = formatLegalDate(fechas[0]);
    fechaFinStr = formatLegalDate(fechas[fechas.length - 1]);
  } else if (opts.fechaInicio) {
    fechaInicioStr = formatLegalDate(opts.fechaInicio);
    const fin = addDaysToDate(opts.fechaInicio, Math.max(dias - 1, 0));
    fechaFinStr = fin ? formatLegalDate(fin) : '';
  }
  if (fechaInicioStr && fechaFinStr) {
    out = out.replace(
      /(desde\s+el\s+(?:d[ií]a\s+)?)(<strong>)?[^<.,;]+?(<\/strong>)?(\s+hasta\s+el\s+(?:d[ií]a\s+)?)(<strong>)?[^<.,;]+?(<\/strong>)?/gi,
      (_m, p1, s1, e1, p4, s2, e2) =>
        `${p1}${s1 || ''}${fechaInicioStr}${e1 || ''}${p4}${s2 || ''}${fechaFinStr}${e2 || ''}`,
    );
    out = out.replace(
      /(del\s+(?:d[ií]a\s+)?)(<strong>)?[^<.,;]+?(<\/strong>)?(\s+al\s+(?:d[ií]a\s+)?)(<strong>)?[^<.,;]+?(<\/strong>)?/gi,
      (_m, p1, s1, e1, p4, s2, e2) =>
        `${p1}${s1 || ''}${fechaInicioStr}${e1 || ''}${p4}${s2 || ''}${fechaFinStr}${e2 || ''}`,
    );
  }

  // 5) Lista enumerada: "durante los días 11, 12 y 13 de mayo de 2026" /
  //    "el día 11 de mayo de 2026". Se reconstruye a partir de las fechas
  //    seleccionadas para reflejar el cambio en el calendario.
  if (fechas.length > 0) {
    const parsed = fechas.map((s) => {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    }).filter((d): d is Date => !!d);
    if (parsed.length > 0) {
      const monthName = parsed[parsed.length - 1].toLocaleDateString('es-ES', { month: 'long' });
      const year = parsed[parsed.length - 1].getFullYear();
      const dayList = parsed.map(d => d.getDate());
      let humanList: string;
      if (dayList.length === 1) {
        humanList = `${dayList[0]}`;
      } else {
        humanList = `${dayList.slice(0, -1).join(', ')} y ${dayList[dayList.length - 1]}`;
      }
      const replacement = dayList.length === 1
        ? `el día <strong>${humanList} de ${monthName} de ${year}</strong>`
        : `durante los días <strong>${humanList} de ${monthName} de ${year}</strong>`;

      // "(durante|en) los días X (, Y)* y Z de <mes> de <año>"
      out = out.replace(
        /(durante|en)\s+los\s+d[ií]as\s+(<strong>)?[^<.;]*?(<\/strong>)?\s+de\s+[a-záéíóú]+\s+de\s+\d{4}/gi,
        replacement,
      );
      // "el día X de <mes> de <año>" (single day)
      if (dayList.length === 1) {
        out = out.replace(
          /el\s+d[ií]a\s+(<strong>)?\d{1,2}(<\/strong>)?\s+de\s+[a-záéíóú]+\s+de\s+\d{4}/gi,
          replacement,
        );
      }
    }
  }

  return out;
}

// Refuerza el campo medida_disciplinaria envolviendo en <strong> los elementos
// clave si la IA no lo hizo. Es idempotente: no duplica <strong>.
function reinforceMedidaDisciplinariaSemibold(html: string, opts: {
  tipo: string;
  suspensionDias?: number | null;
  fechaInicio?: string | null;
}): string {
  if (!html || typeof html !== 'string') return html;
  let out = html;

  const wrapIfMissing = (pattern: RegExp) => {
    out = out.replace(pattern, (match) => {
      // Si ya está dentro de <strong>...</strong>, no duplicar.
      const ctxBefore = out.slice(Math.max(0, out.indexOf(match) - 20), out.indexOf(match));
      if (/<strong>\s*$/i.test(ctxBefore)) return match;
      return `<strong>${match}</strong>`;
    });
  };

  // Medidas en mayúsculas
  wrapIfMissing(/\bAMONESTACIÓN(?:\s+(?:VERBAL|POR\s+ESCRITO|ESCRITA))?\b/g);
  wrapIfMissing(/\bSUSPENSIÓN\s+DE\s+EMPLEO\s+Y\s+SUELDO(?:\s+DE\s+\d+\s+D[IÍ]AS?)?\b/g);
  wrapIfMissing(/\bDESPIDO\s+DISCIPLINARIO\b/g);

  // Número de días
  out = out.replace(/(?<!<strong>)(\b\d+\s+d[ií]as?\b)(?![^<]*<\/strong>)/g, '<strong>$1</strong>');

  // Base legal Art. 51.x del Convenio
  out = out.replace(
    /(?<!<strong>)(Art\.\s*51(?:\.[a-z])?(?:\s+del\s+(?:Convenio|XVIII\s+Convenio[^.,;]*))?)(?![^<]*<\/strong>)/gi,
    '<strong>$1</strong>',
  );

  // Expresiones clave de atenuación
  const phrases = [
    /no\s+aplicar\s+la\s+suspensi[oó]n\s+de\s+empleo\s+y\s+sueldo/gi,
    /sin\s+aplicar\s+la\s+suspensi[oó]n\s+de\s+empleo\s+y\s+sueldo/gi,
    /no\s+constituye\s+precedente/gi,
  ];
  for (const re of phrases) {
    out = out.replace(re, (match) => {
      const idx = out.indexOf(match);
      const ctxBefore = out.slice(Math.max(0, idx - 20), idx);
      if (/<strong>\s*$/i.test(ctxBefore)) return match;
      return `<strong>${match}</strong>`;
    });
  }

  return out;
}

// Inyecta una frase resumen al final de calificacion_falta con el total de
// días con retraso y minutos acumulados, si la IA no lo ha incluido ya.
function appendTardinessSummaryToCalificacion(
  html: string,
  entries: TardinessEntry[],
): string {
  if (!entries || entries.length === 0) return html;
  const text = String(html || '');
  // Heurística: si ya menciona "total" + "retraso" + "minutos", asumimos que
  // la IA ya generó el resumen.
  if (/\btotal\b[\s\S]{0,80}\b(retras|llegada|impuntual)/i.test(text)
    && /\d+\s*minuto/i.test(text)) {
    return text;
  }
  const totalDays = new Set(entries.map(e => e.date.toISOString().slice(0, 10))).size;
  const totalMin = entries.reduce((s, e) => s + e.delayMinutes, 0);
  const fechaIni = entries[0].date;
  const fechaFin = entries[entries.length - 1].date;
  const periodo = fechaIni.getTime() === fechaFin.getTime()
    ? `el día <strong>${formatLegalDateLong(fechaIni)}</strong>`
    : `el periodo comprendido entre el <strong>${formatLegalDateLong(fechaIni)}</strong> y el <strong>${formatLegalDateLong(fechaFin)}</strong>`;
  const summary = ` En ${periodo} se han constatado <strong>${totalDays} día${totalDays === 1 ? '' : 's'} con entrada tardía</strong> y un total acumulado de <strong>${totalMin} minuto${totalMin === 1 ? '' : 's'} de retraso</strong>.`;
  return text.trimEnd() + summary;
}


function buildFactsTimestampLead(value: string | null | undefined): string {
  const dateLabel = formatLegalDate(value);
  const timeLabel = formatLegalTime(value);

  if (dateLabel && timeLabel) {
    return `Los hechos objeto de la presente comunicación se sitúan el <strong>${dateLabel}</strong> a las <strong>${timeLabel}</strong>.`;
  }

  if (dateLabel) {
    return `Los hechos objeto de la presente comunicación se sitúan el <strong>${dateLabel}</strong>.`;
  }

  if (timeLabel) {
    return `Los hechos objeto de la presente comunicación se sitúan a las <strong>${timeLabel}</strong>.`;
  }

  return '';
}

function ensureHighlightedFactsTimestamp(text: string | null | undefined, fechaHechos: string | null | undefined): string {
  const baseText = String(text || '').trim();
  const dateLabel = formatLegalDate(fechaHechos);
  const timeLabel = formatLegalTime(fechaHechos);

  if (!baseText) return buildFactsTimestampLead(fechaHechos);

  let result = baseText;

  if (dateLabel) {
    const strongDatePattern = new RegExp(`<strong>\\s*${escapeRegExp(dateLabel)}\\s*<\\/strong>`, 'i');
    if (!strongDatePattern.test(result)) {
      const plainDatePattern = new RegExp(escapeRegExp(dateLabel), 'i');
      if (plainDatePattern.test(result)) {
        result = result.replace(plainDatePattern, `<strong>${dateLabel}</strong>`);
      }
    }
  }

  if (timeLabel) {
    const strongTimePattern = new RegExp(`<strong>\\s*${escapeRegExp(timeLabel)}\\s*<\\/strong>`, 'i');
    if (!strongTimePattern.test(result)) {
      const plainTimePattern = new RegExp(escapeRegExp(timeLabel), 'i');
      if (plainTimePattern.test(result)) {
        result = result.replace(plainTimePattern, `<strong>${timeLabel}</strong>`);
      }
    }
  }

  const containsDate = dateLabel ? new RegExp(escapeRegExp(dateLabel), 'i').test(result) : true;
  const containsTime = timeLabel ? new RegExp(escapeRegExp(timeLabel), 'i').test(result) : true;

  if (!containsDate || !containsTime) {
    const lead = buildFactsTimestampLead(fechaHechos);
    if (lead) {
      result = `${lead} ${result}`.trim();
    }
  }

  return result;
}

function renderParagraphsHtml(primary: string | null | undefined, fallback: string): string {
  const src = String(primary || '').trim() || fallback;
  const paras = normalizeParagraphs(src);
  return (paras.length > 0 ? paras : normalizeParagraphs(fallback)).map(p => `<p>${sanitizeLegalInlineHtml(p)}</p>`).join('');
}

// Determine if a piece of "ai_motivo_legal" / análisis previo contradice
// la decisión final del documento (tipo + gravedad). Si es así, no se debe
// inyectar literalmente en la fundamentación: la decisión final manda.
function aiMotivoLegalConflictsWithFinalState(motivo: string, tipo: string, gravedad: string): boolean {
  const text = String(motivo || '').toLowerCase();
  if (!text.trim()) return false;
  // Frases típicas de "elevar la falta" o de gravedad superior cuando ya
  // se ha decidido leve / amonestación.
  const isAmonestacionOrLeve = tipo === 'amonestacion' || gravedad === 'leve';
  if (isAmonestacionOrLeve) {
    if (/\beleva(?:r|ndo)?\s+la\s+falta\b/.test(text)) return true;
    if (/\bde\s+leve\s+a\s+(grave|muy\s*grave)\b/.test(text)) return true;
    if (/\bfalta\s+(grave|muy\s*grave)\b/.test(text)) return true;
    if (/\briesgo\s+(significativo\s+y\s+)?grave\b/.test(text)) return true;
    if (/\bsuspensi[oó]n\s+de\s+empleo\s+y\s+sueldo\b/.test(text)) return true;
    if (tipo === 'amonestacion' && /\bsanci[oó]n\b/.test(text)) return true;
  }
  if (gravedad === 'grave' && /\bmuy\s*grave\b/.test(text)) return true;
  return false;
}

function buildFallbackLegalContent(p: {
  workerName: string; workerNumber: string; deptName: string;
  gravedad: string; tipo: string; descripcionHechos?: string;
  fechaHechos?: string; categoria?: string; aiMotivoLegal?: string;
  articulosBase?: string[]; suspensionDias?: number; fechaInicio?: string;
  workerFiscalId?: string;
}) {
  const fechaH = formatLegalDate(p.fechaHechos);
  const horaH = formatLegalTime(p.fechaHechos);
  const momentoHechos = fechaH && horaH
    ? `el <strong>${fechaH}</strong> a las <strong>${horaH}</strong>`
    : fechaH
      ? `el <strong>${fechaH}</strong>`
      : horaH
        ? `a las <strong>${horaH}</strong>`
        : 'en la fecha indicada en el expediente';
  const idParts = [
    p.workerNumber ? `ficha ${p.workerNumber}` : '',
    p.workerFiscalId ? `DNI/NIE ${p.workerFiscalId}` : '',
  ].filter(Boolean).join(', ');
  const workerRef = idParts ? `${p.workerName} (${idParts})` : p.workerName;
  const fact = (p.descripcionHechos || 'los hechos descritos en la comunicación interna').replace(/\s+/g, ' ').trim().replace(/([^.!?…:])$/, '$1.');
  const catText = p.categoria ? ` dentro de la tipología «${p.categoria}»` : '';
  const gLabel = p.gravedad === 'muy_grave' ? 'muy grave' : p.gravedad === 'grave' ? 'grave' : 'leve';
  const sanctionLabel = p.tipo === 'amonestacion'
    ? 'una amonestación por escrito'
    : p.suspensionDias && p.suspensionDias > 0
      ? `una suspensión de empleo y sueldo de ${p.suspensionDias} día(s)`
      : 'una sanción disciplinaria formal sin suspensión de empleo y sueldo';
  const fechaInicioText = formatLegalDate(p.fechaInicio);
  const fechaFinText = p.suspensionDias && p.fechaInicio ? formatLegalDate(addDaysToDate(p.fechaInicio, Math.max(p.suspensionDias - 1, 0))) : '';
  const arts = Array.from(new Set([
    ...(Array.isArray(p.articulosBase) ? p.articulosBase.map(a => String(a).trim()).filter(Boolean) : []),
    p.tipo === 'amonestacion' ? `Art. 51.a del ${FUENTE_CONVENIO}` : `Arts. 49 a 51 del ${FUENTE_CONVENIO}`,
    `Art. 58 del ${FUENTE_ESTATUTO}`,
    `Art. 60.2 del ${FUENTE_ESTATUTO}`,
  ]));
  const alegDays = p.gravedad === 'muy_grave' ? 5 : 3;
  const cancelMeses = p.gravedad === 'muy_grave' ? 'ocho' : p.gravedad === 'grave' ? 'cuatro' : 'dos';

  const exposicionHechos = `En relación con los hechos acaecidos ${momentoHechos}, la empresa tuvo conocimiento de una incidencia atribuida al trabajador/a ${workerRef}, adscrito/a a ${p.deptName || 'el departamento correspondiente'}, consistente en que ${fact}\n\nSegún la información incorporada al expediente, la conducta descrita se habría producido durante la jornada laboral y ha sido valorada atendiendo a su contexto, su desarrollo y la afectación generada en la operativa del servicio${catText}. La presente comunicación se emite sobre la base de los hechos trasladados por la cadena de mando y de la documentación obrante en el expediente.`;

  // Solo inyectamos el aiMotivoLegal en la fundamentación si NO contradice
  // la decisión final del panel (evita frases tipo "se eleva de leve a grave"
  // en una amonestación leve).
  const motivoSafe = p.aiMotivoLegal && !aiMotivoLegalConflictsWithFinalState(p.aiMotivoLegal, p.tipo, p.gravedad)
    ? ` ${p.aiMotivoLegal.replace(/([^.!?…:])$/, '$1.')}`
    : '';
  const fundamentacionJuridica = `La potestad disciplinaria de la empresa se ampara en el art. 58 del Estatuto de los Trabajadores y en los arts. 49 a 51 del convenio colectivo aplicable.${motivoSafe} La calificación y la medida adoptada se apoyan en la graduación establecida convencionalmente y en las reglas de prescripción del art. 60.2 ET.`;

  const calificacionFalta = `Atendiendo a la naturaleza de los hechos y a su incidencia en el correcto funcionamiento del servicio, la conducta descrita se califica como falta ${gLabel}, conforme a ${arts.join(', ')}.`;

  const medidaDisciplinaria = p.tipo === 'amonestacion'
    ? `Como consecuencia de lo anterior, la empresa acuerda imponer ${sanctionLabel}, medida que se considera proporcionada a la entidad de la conducta. Se advierte que ulteriores incumplimientos podrán dar lugar a medidas disciplinarias de mayor intensidad.`
    : p.suspensionDias && p.suspensionDias > 0
      ? `Como consecuencia de la calificación efectuada, la empresa acuerda imponer ${sanctionLabel}${fechaInicioText ? `, con efectos desde el ${fechaInicioText}${fechaFinText ? ` hasta el ${fechaFinText}, ambos inclusive` : ''}` : ''}. Durante el período de suspensión el contrato permanecerá en situación de suspensión de empleo y sueldo.`
      : `Como consecuencia de la calificación efectuada, la empresa acuerda imponer ${sanctionLabel}. La empresa ha decidido <strong>no aplicar la suspensión de empleo y sueldo</strong>, dejando constancia formal en el expediente. Esta atenuación <strong>no constituye precedente</strong> respecto de futuras infracciones.`;

  // Normalizamos las citas del fallback: ai_articulos_relevantes proviene
  // del análisis previo y puede traer "Art. 49.X.letra" en bruto. Cualquier
  // texto del convenio referenciado debe usar SIEMPRE el Art. 50.
  const artsNormalized = normalizeConvenioCitationList(arts);
  return {
    exposicionHechos: normalizeConvenioCitations(exposicionHechos),
    fundamentacionJuridica: normalizeConvenioCitations(fundamentacionJuridica),
    calificacionFalta: normalizeConvenioCitations(calificacionFalta),
    medidaDisciplinaria: normalizeConvenioCitations(medidaDisciplinaria),
    articulosCitados: artsNormalized,
  };
}

const okResponse = (data: Record<string, unknown>) =>
  new Response(JSON.stringify({ success: true, ...data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ─── Coherencia jurídica del documento legal ────────────────────────────────
function paragraphContradictsFinalState(text: string, tipo: string, gravedad: string): boolean {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return false;
  if (tipo === 'amonestacion') {
    if (/\bsanci[oó]n(?:es|ar|ado|ada)?\b/.test(t)) return true;
    if (/\bsuspensi[oó]n\s+de\s+empleo\s+y\s+sueldo\b/.test(t)) return true;
    if (/\bd[ií]as?\s+de\s+suspensi[oó]n\b/.test(t)) return true;
  }
  if (gravedad === 'leve') {
    if (/\bfalta\s+(muy\s*)?grave\b/.test(t)) return true;
    if (/\beleva(?:r|ndo)?\s+la\s+falta\b/.test(t)) return true;
    if (/\bde\s+leve\s+a\s+(muy\s*)?grave\b/.test(t)) return true;
  }
  if (gravedad === 'grave' && /\bfalta\s+muy\s*grave\b/.test(t)) return true;
  return false;
}

// Detects suspension-day language that contradicts a "sanción sin suspensión"
// (clemency / atenuación empresarial) decision. We strip those paragraphs so
// the safe fallback text from buildFallbackLegalContent is used instead.
function paragraphContradictsClemency(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return false;
  if (/\bd[ií]as?\s+de\s+suspensi[oó]n\b/.test(t)) return true;
  if (/\bsuspensi[oó]n\s+de\s+empleo\s+y\s+sueldo\s+de\s+\d/.test(t)) return true;
  if (/\b\d+\s+d[ií]as?\s+de\s+empleo\s+y\s+sueldo\b/.test(t)) return true;
  // Spelled-out numbers + (N) DÍAS pattern, e.g. "TRES (3) DÍAS"
  if (/\b(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta)\s*\(\d+\)\s*d[ií]as\b/i.test(text)) return true;
  // "los días 6, 7 y 8 de mayo" style enumerations near suspension language
  if (/\bsuspensi[oó]n\b[^.]{0,120}\blos?\s+d[ií]as?\s+\d/.test(t)) return true;
  if (/\blos?\s+d[ií]as?\s+\d[\s\S]{0,80}\bsuspensi[oó]n\b/.test(t)) return true;
  return false;
}

/**
 * Normaliza citas inválidas del convenio. En el XVIII Convenio Colectivo
 * Estatal del Comercio de Flores y Plantas (BOE-A-2025-21424):
 *   - Art. 49 = "Principios de ordenación" (apartados 1-5, NUNCA con letras)
 *   - Art. 50 = Clasificación de faltas (50.1.x leves, 50.2.x graves, 50.3.x muy graves)
 *   - Art. 51 = Sanciones aplicables
 *
 * Si la IA o cualquier paso intermedio produce "Art. 49.1.x", "Art. 49.2.x"
 * o "Art. 49.3.x", lo reemplazamos por "Art. 50.1/2/3.x" que es el correcto.
 * También migra el patrón "Art. 48.X.x" (residuo de degradaciones erróneas
 * antiguas) al artículo 50 correcto.
 * Se aplica globalmente tanto al JSON de la IA como al HTML final.
 */
function normalizeConvenioCitations(input: string): string {
  if (!input || typeof input !== 'string') return input;
  let out = input;
  // "Artículo 49.1.f" / "art 49.2.f" / "Art. 49.3.c" / "Art 49 1 a"
  // → "Art. 50.X.letra". Aceptamos tanto "." como espacio entre número,
  // subapartado y letra para tolerar variaciones de la IA.
  out = out.replace(
    /\bArt(?:[íi]culo|\.|s?)\s*49[\s.]+([1-3])[\s.]+([a-zñ])\b/gi,
    (_m, num, letra) => `Art. 50.${num}.${String(letra).toLowerCase()}`
  );
  // Mismo patrón pero con "Art. 48.X.letra" (residuo de bugs antiguos).
  out = out.replace(
    /\bArt(?:[íi]culo|\.|s?)\s*48[\s.]+([1-3])[\s.]+([a-zñ])\b/gi,
    (_m, num, letra) => `Art. 50.${num}.${String(letra).toLowerCase()}`
  );
  // "49.1.x" / "48.1.x" sueltos, sin "Art." delante (paréntesis, listas, etc.)
  out = out.replace(
    /(^|[\s(\[\-—–,;:])(?:49|48)\.([1-3])\.([a-zñ])\b/gi,
    (_m, prefix, num, letra) => `${prefix}50.${num}.${String(letra).toLowerCase()}`
  );
  return out;
}

// Normaliza un array de citas (string[]) eliminando además duplicados
// posteriores a la normalización.
function normalizeConvenioCitationList(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const cleaned = arr
    .map((it) => (typeof it === 'string' ? normalizeConvenioCitations(it) : ''))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return Array.from(new Set(cleaned));
}

function enforceLegalDocumentConsistency(aiContent: any, opts: { tipo: string; gravedad: string; suspensionDias?: number; sinSuspensionExplicita?: boolean }): any {
  if (!aiContent || typeof aiContent !== 'object') return aiContent;
  const { tipo, gravedad, sinSuspensionExplicita } = opts;
  const out: any = { ...aiContent };
  const TEXT_SECTIONS = ['fundamentacion_juridica', 'calificacion_falta', 'medida_disciplinaria'];
  for (const key of TEXT_SECTIONS) {
    const value = out[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    let repaired = value;
    if (tipo === 'amonestacion') {
      repaired = repaired.replace(/\bsanciones de mayor intensidad\b/gi, 'medidas disciplinarias de mayor intensidad');
      repaired = repaired.replace(/\bla presente sanci[oó]n\b/gi, 'la presente amonestación');
    }
    out[key] = paragraphContradictsFinalState(repaired, tipo, gravedad) ? '' : repaired;
  }

  // Clemency enforcement: when admin explicitly chose "sanción sin suspensión",
  // any AI-produced suspension wording must be wiped so the safe fallback wins.
  if (sinSuspensionExplicita === true) {
    out.dias_suspension_final = 0;
    for (const key of ['medida_disciplinaria', 'calificacion_falta', 'exposicion_hechos', 'fundamentacion_juridica']) {
      const v = out[key];
      if (typeof v === 'string' && v.trim() && paragraphContradictsClemency(v)) {
        // Empty string triggers the fallback in buildLegalDocumentHtml since
        // hasMinimumText() returns false, and the fallback already renders
        // the proper clemency text when suspensionDias === 0.
        out[key] = '';
      }
    }
  }

  out.tipo_final = tipo;
  out.gravedad_final = gravedad;
  if (sinSuspensionExplicita === true) {
    out.dias_suspension_final = 0;
  } else if (typeof opts.suspensionDias === 'number') {
    out.dias_suspension_final = opts.suspensionDias;
  }
  if (typeof out.exposicion_hechos === 'string' && out.exposicion_hechos.trim()) {
    let exp = out.exposicion_hechos;
    if (tipo === 'amonestacion') {
      exp = exp.replace(/\b(eleva(?:r|ndo)?\s+la\s+falta\s+de\s+leve\s+a\s+(?:muy\s*)?grave[^.]*\.)/gi, '');
      exp = exp.replace(/\b(procede(?:rí)?a?\s+(?:imponer\s+)?(?:una\s+)?sanci[oó]n[^.]*\.)/gi, '');
    }
    if (gravedad === 'leve') {
      exp = exp.replace(/\b(se\s+califica(?:rí)?a?\s+como\s+falta\s+(?:muy\s*)?grave[^.]*\.)/gi, '');
    }
    out.exposicion_hechos = exp.replace(/\s{2,}/g, ' ').trim();
  }

  // ── Normalización GLOBAL de citas del convenio ──
  // Corrige "Art. 49.X.letra" / "48.X.letra" → "Art. 50.X.letra"
  // en todos los campos string y arrays de strings del JSON.
  for (const key of Object.keys(out)) {
    const v = (out as any)[key];
    if (typeof v === 'string') {
      (out as any)[key] = normalizeConvenioCitations(v);
    } else if (Array.isArray(v)) {
      (out as any)[key] = v.map((it: any) => typeof it === 'string' ? normalizeConvenioCitations(it) : it);
    }
  }
  return out;
}

function enforceLegalDocumentHtmlConsistency(html: string, opts: { tipo: string; gravedad: string; suspensionDias?: number | null; sinSuspensionExplicita?: boolean }): string {
  if (!html || typeof html !== 'string') return html;
  const { tipo, gravedad, suspensionDias, sinSuspensionExplicita } = opts;
  let out = html;
  const gravedadLabel = gravedad === 'muy_grave' ? 'MUY GRAVE' : gravedad === 'grave' ? 'GRAVE' : 'LEVE';
  const tipoLabel = tipo === 'amonestacion' ? 'AMONESTACIÓN' : `SANCIÓN ${gravedadLabel}`;
  const hasSuspension = !sinSuspensionExplicita && !!(suspensionDias && suspensionDias > 0);
  const medidaLabel = tipo === 'amonestacion' ? 'AMONESTACIÓN' : (hasSuspension ? 'SUSPENSIÓN' : 'SANCIÓN');
  out = out.replace(/(<span\s+class="badge"[^>]*>)\s*[^<]+\s*(<\/span>)/i, `$1${tipoLabel}$2`);
  out = out.replace(/(<span\s+class="badge-inline"[^>]*>)\s*(LEVE|GRAVE|MUY\s*GRAVE)\s*(<\/span>)/i, `$1${gravedadLabel}$3`);
  out = out.replace(/(<span\s+class="badge-inline"[^>]*>)\s*(AMONESTACIÓN|SUSPENSIÓN|SANCIÓN)\s*(<\/span>)/gi, `$1${medidaLabel}$3`);
  out = out.replace(/data-tipo="[^"]*"/i, `data-tipo="${tipoLabel}"`);
  if (tipo === 'amonestacion') {
    out = out.replace(/\bsanciones de mayor intensidad\b/gi, 'medidas disciplinarias de mayor intensidad');
    out = out.replace(/\bla presente sanci[oó]n\b/gi, 'la presente amonestación');
  }

  // ── Reescritura de gravedad narrativa ──
  // El admin tiene la última palabra. Si el texto narrativo (generado por la
  // IA o por el fallback) sigue refiriéndose a una gravedad distinta a la
  // marcada por el admin, la corregimos in-place. Esto cubre frases como
  // "se trata de una falta muy grave", "calificada como muy grave", etc.
  // IMPORTANTE: solo reescribimos los ADJETIVOS de gravedad ("muy grave",
  // "grave", "leve"). NUNCA tocamos los números de los artículos: en el
  // XVIII Convenio Colectivo Estatal del Comercio de Flores y Plantas
  // (BOE-A-2025-21424), Art. 50 tipifica TODAS las faltas (50.1 leves,
  // 50.2 graves, 50.3 muy graves) — bajar la gravedad NO cambia el
  // artículo, solo el subapartado. Dejamos esa decisión al normalizador
  // de citas y al propio prompt.
  const downgradeMuyGraveToGrave = (s: string): string => {
    let r = s;
    r = r.replace(/\bMUY\s+GRAVE\b/g, 'GRAVE');
    r = r.replace(/\bmuy\s+grave\b/g, 'grave');
    r = r.replace(/\bMuy\s+grave\b/g, 'Grave');
    return r;
  };
  const downgradeGraveToLeve = (s: string): string => {
    let r = s;
    r = r.replace(/\bMUY\s+GRAVE\b/g, 'LEVE');
    r = r.replace(/\bmuy\s+grave\b/g, 'leve');
    r = r.replace(/\bMuy\s+grave\b/g, 'Leve');
    r = r.replace(/(?<!muy\s)\bGRAVE\b/g, 'LEVE');
    r = r.replace(/(?<!muy\s)\bgrave\b/g, 'leve');
    r = r.replace(/(?<!Muy\s)\bGrave\b/g, 'Leve');
    return r;
  };

  // Sólo reescribimos dentro del cuerpo, evitando atributos HTML.
  const rewriteOutsideTags = (input: string, fn: (s: string) => string): string => {
    return input.replace(/>([^<]+)</g, (_m, inner) => `>${fn(inner)}<`);
  };

  if (gravedad === 'grave') {
    out = rewriteOutsideTags(out, downgradeMuyGraveToGrave);
  } else if (gravedad === 'leve' || tipo === 'amonestacion') {
    out = rewriteOutsideTags(out, downgradeGraveToLeve);
  }

  // ── Normalización final de citas inválidas del convenio ──
  // "Art. 49.X.letra" / "48.X.letra" → "Art. 50.X.letra".
  // Se aplica solo al texto fuera de etiquetas para no romper atributos HTML.
  out = rewriteOutsideTags(out, normalizeConvenioCitations);

  return out;
}

function buildPersistentAttachmentUrl(_baseUrl: string, token: string): string {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || _baseUrl;
  return `${supabaseUrl}/functions/v1/public-actions?attachmentToken=${encodeURIComponent(token)}`;
}

function buildPersistentAttachmentPageUrl(_baseUrl: string, token: string): string {
  // Apuntamos a la web app (vnprod.app) en vez de a la edge function porque
  // Supabase aplica `Content-Security-Policy: default-src 'none'; sandbox`
  // a respuestas HTML de edge functions sin JWT, lo que muestra el HTML
  // como texto plano en el navegador. La página /doc/:token de la web app
  // hace fetch del raw y lo embebe en un iframe srcdoc.
  return `https://vnprod.app/doc/${encodeURIComponent(token)}`;
}

function buildPersistentAttachmentDownloadUrl(_baseUrl: string, token: string): string {
  return `${buildPersistentAttachmentUrl(_baseUrl, token)}&mode=download`;
}

function normalizeIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function resolveWorkerReportRecordType(record: any, proposal: any | null): 'incidencia' | 'amonestacion' | 'sancion' {
  if (proposal?.tipo === 'amonestacion') return 'amonestacion';
  if (proposal?.tipo === 'sancion') return 'sancion';
  if (record?.accion_propuesta === 'amonestacion_escrita') return 'amonestacion';
  if (record?.accion_propuesta === 'sancion') return 'sancion';
  return 'incidencia';
}

async function sendEmailBrevo(params: { from: string; to: string | string[]; subject: string; html: string; cc?: string[]; attachments?: Array<{ filename: string; content: string }> }): Promise<Response> {
  const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_KEY) throw new Error('RESEND_API_KEY not configured');
  const toArr = Array.isArray(params.to) ? params.to : [params.to];
  const body: any = {
    from: params.from,
    to: toArr,
    subject: params.subject,
    html: params.html,
  };
  if (params.cc?.length) body.cc = params.cc;
  if (params.attachments?.length) body.attachments = params.attachments;
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function extractIncidenciaStoragePath(rawPath: string | null | undefined): string | null {
  if (!rawPath) return null;
  const normalized = String(rawPath).trim();
  if (!normalized) return null;

  const signedMatch = normalized.match(/\/object\/sign\/incidencias-pruebas\/(.+?)(\?|$)/);
  if (signedMatch) return decodeURIComponent(signedMatch[1]);

  const publicMatch = normalized.match(/\/object\/public\/incidencias-pruebas\/(.+?)(\?|$)/);
  if (publicMatch) return decodeURIComponent(publicMatch[1]);

  if (/^https?:\/\//i.test(normalized)) return null;

  return normalized.replace(/^\/+/, '');
}

/**
 * Reads the first bytes of a PNG/JPEG image from Storage to extract its
 * intrinsic width × height without any external library. Returns aspectRatio
 * (width / height). Returns null if the format is not recognized or any I/O
 * step fails — caller will then default to the safe block layout.
 */
async function getImageAspectRatioFromStorage(
  supabase: ReturnType<typeof createClient>,
  signedOrPublicUrl: string,
): Promise<number | null> {
  try {
    const storagePath = extractIncidenciaStoragePath(signedOrPublicUrl);
    if (!storagePath) return null;
    // Download just enough bytes to inspect headers. Supabase JS download()
    // returns the full Blob; for screenshots this is acceptable (a few MB at
    // most) and runs server-side at generation time only.
    const { data, error } = await supabase.storage.from('incidencias-pruebas').download(storagePath);
    if (error || !data) return null;
    const buf = new Uint8Array(await data.arrayBuffer());
    if (buf.length < 24) return null;

    // PNG: 89 50 4E 47 0D 0A 1A 0A | IHDR @ offset 16: width(4 BE) height(4 BE)
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
      const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
      if (w > 0 && h > 0) return w / h;
      return null;
    }

    // JPEG: FF D8 ... walk markers until SOF0/2 to read dimensions.
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      let offset = 2;
      while (offset < buf.length - 9) {
        if (buf[offset] !== 0xFF) { offset += 1; continue; }
        let marker = buf[offset + 1];
        // Skip fill bytes (FFs)
        while (marker === 0xFF && offset < buf.length - 1) {
          offset += 1;
          marker = buf[offset + 1];
        }
        offset += 2;
        // SOF markers (excluding DHT/DAC/RST/etc.) carry dimensions
        const isSOF = (marker >= 0xC0 && marker <= 0xCF) && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
        if (isSOF) {
          if (offset + 7 > buf.length) return null;
          const h = (buf[offset + 3] << 8) | buf[offset + 4];
          const w = (buf[offset + 5] << 8) | buf[offset + 6];
          if (w > 0 && h > 0) return w / h;
          return null;
        }
        // Standalone markers without payload
        if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) continue;
        // Skip segment by its declared length
        if (offset + 2 > buf.length) return null;
        const segLen = (buf[offset] << 8) | buf[offset + 1];
        if (segLen < 2) return null;
        offset += segLen;
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Enriches each image entry in `imagesBySection` with an `aspectRatio` field
 * (when detectable). Performed in parallel per section. Failures are silent.
 */
async function enrichImagesWithAspectRatio(
  supabase: ReturnType<typeof createClient>,
  imagesBySection: Record<string, Array<{ url: string; descripcion: string; aspectRatio?: number; layout?: string }>>,
): Promise<void> {
  const allImages: Array<{ url: string; descripcion: string; aspectRatio?: number; layout?: string }> = [];
  for (const key of Object.keys(imagesBySection)) {
    for (const img of imagesBySection[key]) allImages.push(img);
  }
  if (allImages.length === 0) return;
  await Promise.all(allImages.map(async (img) => {
    const ratio = await getImageAspectRatioFromStorage(supabase, img.url);
    if (ratio && Number.isFinite(ratio) && ratio > 0) img.aspectRatio = ratio;
  }));
}

async function getPersistentIncidenciaAttachmentUrls(
  supabase: ReturnType<typeof createClient>,
  proposalId: string,
  rawPaths: string[],
  baseUrl: string,
): Promise<string[]> {
  const normalizedPaths = rawPaths.map((original) => ({
    original,
    storagePath: extractIncidenciaStoragePath(original),
  }));

  const storagePaths = [...new Set(
    normalizedPaths
      .map((item) => item.storagePath)
      .filter((path): path is string => Boolean(path))
  )];

  if (storagePaths.length === 0) {
    return normalizedPaths
      .map((item) => item.original)
      .filter((url): url is string => Boolean(url));
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('incidencias_attachment_links')
    .select('storage_path, token')
    .eq('proposal_id', proposalId)
    .in('storage_path', storagePaths);

  if (existingError) throw existingError;

  const tokenByPath = new Map<string, string>((existingRows || []).map((row: any) => [row.storage_path, row.token]));
  const missingPaths = storagePaths.filter((path) => !tokenByPath.has(path));

  if (missingPaths.length > 0) {
    const rowsToInsert = missingPaths.map((storagePath) => ({
      proposal_id: proposalId,
      storage_path: storagePath,
      token: `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`,
      file_name: storagePath.split('/').pop() || null,
    }));

    const { error: insertError } = await supabase
      .from('incidencias_attachment_links')
      .upsert(rowsToInsert, { onConflict: 'proposal_id,storage_path' });

    if (insertError) throw insertError;

    const { data: insertedRows, error: insertedError } = await supabase
      .from('incidencias_attachment_links')
      .select('storage_path, token')
      .eq('proposal_id', proposalId)
      .in('storage_path', missingPaths);

    if (insertedError) throw insertedError;

    for (const row of insertedRows || []) {
      tokenByPath.set((row as any).storage_path, (row as any).token);
    }
  }

  return normalizedPaths
    .map(({ original, storagePath }) => {
      if (!storagePath) return original;
      const token = tokenByPath.get(storagePath);
      return token ? buildPersistentAttachmentUrl(baseUrl, token) : original;
    })
    .filter((url): url is string => Boolean(url));
}

async function getPersistentIncidenciaAttachmentLinks(
  supabase: ReturnType<typeof createClient>,
  proposalId: string,
  rawPath: string,
  baseUrl: string,
  fileName?: string | null,
  mimeType?: string | null,
): Promise<{ url: string; pageUrl: string; downloadUrl: string } | null> {
  const storagePath = extractIncidenciaStoragePath(rawPath);
  if (!storagePath) return null;

  const { data: existingRow, error: existingError } = await supabase
    .from('incidencias_attachment_links')
    .select('token')
    .eq('proposal_id', proposalId)
    .eq('storage_path', storagePath)
    .maybeSingle();

  if (existingError) throw existingError;
  let token = (existingRow as any)?.token as string | undefined;

  if (!token) {
    token = `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
    const { error: insertError } = await supabase
      .from('incidencias_attachment_links')
      .upsert({
        proposal_id: proposalId,
        storage_path: storagePath,
        token,
        file_name: fileName || storagePath.split('/').pop() || null,
        mime_type: mimeType || null,
      }, { onConflict: 'proposal_id,storage_path' });
    if (insertError) throw insertError;
  }

  return {
    url: buildPersistentAttachmentUrl(baseUrl, token),
    pageUrl: buildPersistentAttachmentPageUrl(baseUrl, token),
    downloadUrl: buildPersistentAttachmentDownloadUrl(baseUrl, token),
  };
}

/**
 * Garantiza que exista un enlace persistente al documento legal en formato HTML
 * autocontenido (servido por public-actions). Se usa como fallback infalible
 * cuando la generación del PDF falla en el navegador. Reutiliza el mismo
 * documento HTML que se previsualiza en el panel admin para que RRHH vea
 * exactamente lo mismo y pueda imprimirlo / guardarlo como PDF desde el
 * navegador.
 */
async function ensureLegalDocumentOnlineLink(
  supabase: ReturnType<typeof createClient>,
  proposalId: string,
  documentId: string,
  htmlContent: string,
  fileBaseName: string,
): Promise<{ url: string; pageUrl: string; downloadUrl: string } | null> {
  try {
    if (!htmlContent || htmlContent.trim().length === 0) return null;
    const safeBase = (fileBaseName || `documento-${documentId}`)
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || `documento-${documentId}`;
    const storagePath = `documentos-online/${proposalId}/${documentId}.html`;
    const fullDoc = htmlContent.trim().toLowerCase().startsWith('<!doctype')
      ? htmlContent
      : `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeBase}</title></head><body>${htmlContent}</body></html>`;
    const bytes = new TextEncoder().encode(fullDoc);
    const { error: uploadErr } = await supabase.storage
      .from('incidencias-pruebas')
      .upload(storagePath, bytes, { contentType: 'text/html; charset=utf-8', upsert: true });
    if (uploadErr) {
      console.error('[ensureLegalDocumentOnlineLink] upload failed:', uploadErr.message);
      return null;
    }
    return await getPersistentIncidenciaAttachmentLinks(
      supabase,
      proposalId,
      storagePath,
      'https://vnprod.app',
      `${safeBase}.html`,
      'text/html; charset=utf-8',
    );
  } catch (e: any) {
    console.error('[ensureLegalDocumentOnlineLink] exception:', e?.message || e);
    return null;
  }
}

/**
 * REMOVED: storage-based fallback for video frames.
 *
 * The previous version of this function listed `video-frames/` in the
 * `incidencias-pruebas` bucket and surfaced any matching JPG as evidence.
 * That allowed unverified, recycled or hallucinated images to slip into the
 * legal document. It has been replaced by a strict no-op: if the cache
 * contains no verified V2 frames for a proposal, the legal document is
 * generated WITHOUT video evidences. Frames must be captured by the admin's
 * browser via `src/lib/videoFrameExtractor.ts` and persisted with
 * `capture_source = browser_canvas` and `storage_path` under
 * `video-frames-v2/`.
 */
async function buildStoredVideoFrameEvidenceFallback(
  _supabase: ReturnType<typeof createClient>,
  _proposalId: string,
  _baseUrl: string,
): Promise<Array<{ url: string; descripcion: string }>> {
  return [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle file upload separately (multipart)
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      return await handleFileUpload(req, supabase);
    }

    const body = await req.json();
    const { action, sessionToken } = body;

    if (!sessionToken) {
      return errorResponse('Session token required');
    }

    // ── Validate session + get manager in parallel ──────────────────────────────────
    const { data: session, error: sessionError } = await supabase
      .from('manager_sessions')
      .select('manager_id, expires_at, managers!inner(id, name, role)')
      .eq('token', sessionToken)
      .single();

    if (sessionError || !session) {
      return errorResponse('Invalid session');
    }

    if (new Date(session.expires_at) < new Date()) {
      return errorResponse('Session expired');
    }

    const manager = (session as any).managers;
    if (!manager) {
      return errorResponse('Manager not found');
    }

    if (manager.role === 'consulta' || (manager.role !== 'admin' && manager.role !== 'manager' && manager.role !== 'responsable')) {
      return errorResponse('Access denied: insufficient role');
    }

    const isAdmin = manager.role === 'admin';
    const isResponsable = manager.role === 'responsable';

    // ── Helper: get incidencias department IDs for this manager (parallelized) ──
    let _cachedDeptIds: string[] | null = null;
    async function getManagerIncidenciasDepartments(): Promise<string[]> {
      if (isAdmin) return [];
      if (_cachedDeptIds !== null) return _cachedDeptIds;

      // For responsables, PRIORITIZE departments of teams they lead
      if (isResponsable) {
        const { data: mgrData } = await supabase
          .from('managers')
          .select('worker_id, worker_team_id')
          .eq('id', manager!.id)
          .single();

        if (mgrData?.worker_id) {
          const { data: ledTeams } = await supabase
            .from('worker_teams')
            .select('id, department_id')
            .eq('responsable_worker_id', mgrData.worker_id);

          if (ledTeams && ledTeams.length > 0) {
            _cachedDeptIds = [...new Set(ledTeams.map((team) => team.department_id))];
            return _cachedDeptIds;
          }
        }

        // Fallback to own team only if they lead none
        if (mgrData?.worker_team_id) {
          const { data: teamData } = await supabase.from('worker_teams').select('department_id').eq('id', mgrData.worker_team_id).single();
          if (teamData?.department_id) {
            _cachedDeptIds = [teamData.department_id];
            return _cachedDeptIds;
          }
        }

        _cachedDeptIds = [];
        return _cachedDeptIds;
      }

      const [siloRes, erpRes] = await Promise.all([
        supabase.from('incidencias_department_managers').select('department_id').eq('manager_id', manager!.id),
        supabase.from('manager_department_assignments').select('department_id').eq('manager_id', manager!.id),
      ]);
      _cachedDeptIds = [...new Set([
        ...(siloRes.data || []).map((d) => d.department_id),
        ...(erpRes.data || []).map((d) => d.department_id),
      ])];
      return _cachedDeptIds;
    }

    async function validateIncidenciasDeptAccess(deptId: string): Promise<boolean> {
      if (isAdmin) return true;
      const depts = await getManagerIncidenciasDepartments();
      return depts.includes(deptId);
    }

    async function getAccessibleDeptIds(): Promise<string[] | null> {
      if (isAdmin) return null;
      return await getManagerIncidenciasDepartments();
    }

    async function ensureIncidenciasDepartmentExists(rawDeptId: string): Promise<{ id: string; name: string } | null> {
      if (!rawDeptId) return null;

      const { data: existingDept, error: existingDeptError } = await supabase
        .from('incidencias_departments')
        .select('id, name')
        .eq('id', rawDeptId)
        .maybeSingle();

      if (existingDeptError) throw existingDeptError;
      if (existingDept) return existingDept as { id: string; name: string };

      const { data: erpDept, error: erpDeptError } = await supabase
        .from('departments')
        .select('id, name')
        .eq('id', rawDeptId)
        .maybeSingle();

      if (erpDeptError) throw erpDeptError;
      if (!erpDept) return null;

      const { data: syncedDept, error: syncDeptError } = await supabase
        .from('incidencias_departments')
        .upsert({ id: erpDept.id, name: erpDept.name, active: true }, { onConflict: 'id' })
        .select('id, name')
        .single();

      if (syncDeptError) throw syncDeptError;
      return syncedDept as { id: string; name: string };
    }

    async function resolveIncidenciaWorkers(workerIds: string[]) {
      const uniqueWorkerIds = [...new Set((workerIds || []).filter(Boolean))];
      if (uniqueWorkerIds.length === 0) {
        return { resolvedDepartmentId: null, workerRows: [] };
      }

      const { data: siloWorkers, error: siloWorkersError } = await supabase
        .from('incidencias_workers')
        .select('id, nombre, apellidos, worker_number, department_id')
        .in('id', uniqueWorkerIds);

      if (siloWorkersError) throw siloWorkersError;

      const foundSiloIds = new Set((siloWorkers || []).map((worker: any) => worker.id));
      const missingWorkerIds = uniqueWorkerIds.filter((workerId) => !foundSiloIds.has(workerId));

      let erpWorkers: Array<{ id: string; name: string | null; worker_number: string | null; department_id: string | null }> = [];
      if (missingWorkerIds.length > 0) {
        const { data: erpData, error: erpWorkersError } = await supabase
          .from('workers')
          .select('id, name, worker_number, department_id')
          .in('id', missingWorkerIds);

        if (erpWorkersError) throw erpWorkersError;
        erpWorkers = (erpData || []) as Array<{ id: string; name: string | null; worker_number: string | null; department_id: string | null }>;

        if (erpWorkers.length > 0) {
          const syncRows = erpWorkers
            .filter((worker) => worker.department_id)
            .map((worker) => {
              const parts = (worker.name || '').trim().split(/\s+/).filter(Boolean);
              return {
                id: worker.id,
                nombre: parts[0] || worker.name || '—',
                apellidos: parts.slice(1).join(' ') || null,
                worker_number: worker.worker_number,
                department_id: worker.department_id,
                activo: true,
              };
            });

          if (syncRows.length > 0) {
            const uniqueDeptIds = [...new Set(syncRows.map((row) => row.department_id).filter(Boolean))] as string[];

            for (const deptId of uniqueDeptIds) {
              const syncedDepartment = await ensureIncidenciasDepartmentExists(deptId);
              if (!syncedDepartment) {
                throw new Error(`No se pudo sincronizar el departamento ${deptId} para incidencias`);
              }
            }

            const { error: syncWorkersError } = await supabase
              .from('incidencias_workers')
              .upsert(syncRows, { onConflict: 'id' });

            if (syncWorkersError) throw syncWorkersError;
          }
        }
      }

      const siloMap = new Map((siloWorkers || []).map((worker: any) => [worker.id, worker]));
      const erpMap = new Map(erpWorkers.map((worker) => [worker.id, worker]));
      const workerRows: Array<{ worker_id: string; worker_name: string; worker_number: string | null; department_id: string | null }> = [];

      for (const workerId of uniqueWorkerIds) {
        const siloWorker = siloMap.get(workerId);
        if (siloWorker) {
          workerRows.push({
            worker_id: siloWorker.id,
            worker_name: [siloWorker.nombre, siloWorker.apellidos].filter(Boolean).join(' ') || '—',
            worker_number: siloWorker.worker_number || null,
            department_id: siloWorker.department_id || null,
          });
          continue;
        }

        const erpWorker = erpMap.get(workerId);
        if (erpWorker) {
          workerRows.push({
            worker_id: erpWorker.id,
            worker_name: erpWorker.name || '—',
            worker_number: erpWorker.worker_number || null,
            department_id: erpWorker.department_id || null,
          });
        }
      }

      const missingResolvedWorkers = uniqueWorkerIds.filter((workerId) => !workerRows.some((worker) => worker.worker_id === workerId));
      if (missingResolvedWorkers.length > 0) {
        throw new Error(`Trabajadores no encontrados: ${missingResolvedWorkers.length}`);
      }

      const resolvedDepartmentIds = [...new Set(workerRows.map((worker) => worker.department_id).filter(Boolean))] as string[];
      // Note: we no longer hard-fail on mixed departments. The caller decides
      // whether to split into independent records/proposals (one per worker).
      // We still return the first dept as the "primary" for backwards compatibility.

      return {
        resolvedDepartmentId: resolvedDepartmentIds[0] || null,
        resolvedDepartmentIds,
        workerRows,
      };
    }

    async function getWorkerReportDataset(workerId: string, fechaDesde?: string, fechaHasta?: string, incluirPositivas = true) {
      const negQuery = supabase
        .from('incidencias_records')
        .select('*, incidencias_categories(name, gravedad, color), incidencias_record_workers!inner(worker_id, worker_name)')
        .eq('incidencias_record_workers.worker_id', workerId)
        .is('deleted_at', null);

      if (fechaDesde) negQuery.gte('fecha', fechaDesde);
      if (fechaHasta) negQuery.lte('fecha', `${fechaHasta}T23:59:59`);

      const { data: negRecords, error: negError } = await negQuery.order('fecha', { ascending: false }).limit(500);
      if (negError) throw negError;

      const allNeg = negRecords || [];
      const recordIds = [...new Set(allNeg.map((record: any) => record.id).filter(Boolean))] as string[];

      const latestProposalByRecordId = new Map<string, any>();
      if (recordIds.length > 0) {
        const { data: proposalRows, error: proposalError } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('*')
          .in('record_id', recordIds)
          .neq('estado', 'rechazada')
          .order('created_at', { ascending: false })
          .limit(500);

        if (proposalError) throw proposalError;

        for (const proposal of proposalRows || []) {
          const linkedRecordId = proposal?.record_id;
          if (!linkedRecordId || latestProposalByRecordId.has(linkedRecordId)) continue;
          latestProposalByRecordId.set(linkedRecordId, proposal);
        }
      }

      const incidencias: any[] = [];
      const amonestaciones: any[] = [];
      const sanciones: any[] = [];

      for (const record of allNeg) {
        const linkedProposal = latestProposalByRecordId.get(record.id) || null;
        const resolvedType = resolveWorkerReportRecordType(record, linkedProposal);
        const normalizedRecord = {
          ...record,
          record_id: record.id,
          created_at: normalizeIsoDate(record.fecha) || record.created_at,
          fecha_evento: normalizeIsoDate(record.fecha) || record.created_at,
          proposal_id: linkedProposal?.id || null,
          proposal_created_at: linkedProposal?.created_at || null,
          proposal_estado: linkedProposal?.estado || null,
          tipo_resuelto: linkedProposal?.tipo || resolvedType,
          gravedad: linkedProposal?.gravedad || record.incidencias_categories?.gravedad || null,
          suspension_dias: linkedProposal?.suspension_dias ?? null,
        };

        if (resolvedType === 'amonestacion') {
          amonestaciones.push(normalizedRecord);
        } else if (resolvedType === 'sancion') {
          sanciones.push(normalizedRecord);
        } else {
          incidencias.push(normalizedRecord);
        }
      }

      let posRecords: any[] = [];
      if (incluirPositivas !== false) {
        const posQuery = supabase
          .from('incidencias_positive_records')
          .select('*, incidencias_positive_categories(name, color), incidencias_positive_record_workers!inner(worker_id, worker_name)')
          .eq('incidencias_positive_record_workers.worker_id', workerId);

        if (fechaDesde) posQuery.gte('fecha', fechaDesde);
        if (fechaHasta) posQuery.lte('fecha', `${fechaHasta}T23:59:59`);

        const { data: posData, error: posError } = await posQuery.order('fecha', { ascending: false }).limit(500);
        if (posError) throw posError;
        posRecords = posData || [];
      }

      const { data: workerInfo, error: workerError } = await supabase
        .from('incidencias_workers')
        .select('*, incidencias_departments(name)')
        .eq('id', workerId)
        .maybeSingle();

      if (workerError) throw workerError;

      return {
        worker: workerInfo ? { ...workerInfo, department_name: workerInfo.incidencias_departments?.name || null } : null,
        negativas: incidencias,
        negativas_all: allNeg,
        positivas: posRecords,
        amonestaciones,
        sanciones,
        propuestas: Array.from(latestProposalByRecordId.values()),
      };
    }

    // ── Non-blocking audit helpers (fire-and-forget) ──
    function writeAuditLog(actionType: string, entityType: string, entityId: string | null, details: string | null, entityData?: Record<string, unknown>) {
      supabase.from('audit_logs').insert({
        action_type: actionType,
        actor_name: manager!.name,
        actor_role: isAdmin ? 'admin' : 'encargado',
        entity_type: entityType,
        entity_id: entityId,
        details,
        entity_data: entityData || null,
      }).then(() => {}).catch(() => {});
    }

    function writeIncidenciasLog(
      actionType: string,
      incidenciaId: string | null,
      propuestaId: string | null,
      details: string | null,
      cambios?: Record<string, unknown> | null,
    ) {
      supabase.from('incidencias_audit_logs').insert({
        actor_id: manager!.id,
        actor_name: manager!.name,
        actor_role: isAdmin ? 'admin' : 'encargado',
        action_type: actionType,
        incidencia_id: incidenciaId,
        propuesta_id: propuestaId,
        details,
        cambios_json: cambios || null,
      }).then(() => {}).catch(() => {});
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helper: enviar aviso anticipado a RRHH (sanción con suspensión).
    // Idempotente: si ya está marcado como enviado, omite. Llamado desde
    // approvePropuesta y reopenTask (al volver de Imprimido → Pendiente).
    // ─────────────────────────────────────────────────────────────────────
    async function sendSuspensionAvisoEmail(propuestaId: string, sourceLabel: string): Promise<{ sent: boolean; pending?: boolean; reason?: string }> {
      try {
        const { data: fullProp } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('id, tipo, gravedad, suspension_dias, suspension_fechas, fecha_inicio, record_id, department_id, target_worker_id, suspension_aviso_enviado_at')
          .eq('id', propuestaId)
          .single();

        if (!fullProp) return { sent: false, reason: 'Propuesta no encontrada' };
        if ((fullProp as any).tipo !== 'sancion') return { sent: false, reason: 'La propuesta no es una sanción' };
        if (!(fullProp as any).suspension_dias || Number((fullProp as any).suspension_dias) <= 0) return { sent: false, reason: 'La propuesta no tiene suspensión de empleo y sueldo' };
        if ((fullProp as any).suspension_aviso_enviado_at) {
          console.log(`[${sourceLabel}] Aviso suspensión ya enviado, omitiendo:`, propuestaId);
          return { sent: true, reason: 'already_sent' };
        }

        // 1) Destinatarios — solo lista 'suspension_aviso'
        const { data: avisoEmails } = await supabase
          .from('incidencias_email_config')
          .select('email, is_primary')
          .eq('activo', true)
          .eq('purpose', 'suspension_aviso')
          .order('is_primary', { ascending: false })
          .order('created_at');
        const avisoPrimary = (avisoEmails || []).filter((c: any) => c.is_primary).map((c: any) => c.email);
        const avisoCc = (avisoEmails || []).filter((c: any) => !c.is_primary).map((c: any) => c.email);
        const avisoTo = avisoPrimary.length > 0 ? avisoPrimary : (avisoCc.length > 0 ? [avisoCc[0]] : []);
        const avisoCcFinal = avisoPrimary.length > 0 ? avisoCc : (avisoCc.length > 1 ? avisoCc.slice(1) : undefined);

        if (avisoTo.length === 0) {
          console.log(`[${sourceLabel}] No hay destinatarios suspension_aviso configurados, omitiendo aviso.`);
          return { sent: false, reason: 'No hay destinatarios configurados para el aviso de suspensión' };
        }

        // 2) Datos del trabajador y departamento
        let avisoWorkersQuery = supabase
          .from('incidencias_record_workers')
          .select('worker_id, worker_name, worker_number')
          .eq('record_id', (fullProp as any).record_id);
        if ((fullProp as any).target_worker_id) avisoWorkersQuery = avisoWorkersQuery.eq('worker_id', (fullProp as any).target_worker_id);
        const { data: avisoWorkers } = await avisoWorkersQuery;
        const workerName = avisoWorkers?.[0]?.worker_name || 'Trabajador';
        const workerNumber = avisoWorkers?.[0]?.worker_number || '';

        const { data: avisoDept } = (fullProp as any).department_id
          ? await supabase.from('incidencias_departments').select('name').eq('id', (fullProp as any).department_id).single()
          : { data: null } as any;
        const deptName = (avisoDept as any)?.name || '—';

        // 3) Documento legal — esperar hasta ~75s a que se genere el HTML.
        //    El email no se envía hasta que tengamos el documento listo: RRHH
        //    no tiene acceso al panel y el correo SIN botón al doc. no sirve.
        //    Si tras 75s no hay doc, programamos un reintento diferido (hasta
        //    3 reintentos = ≈4 min totales). El admin siempre puede pulsar
        //    "Reenviar aviso" desde Tareas como red de seguridad.
        let docHtml: string | null = null;
        let docId: string | null = null;
        let triggeredGeneration = false;
        const maxAttempts = 15; // 15 × 5s = 75s
        for (let attempt = 0; attempt < maxAttempts && !docHtml; attempt++) {
          const legalDocsQuery = supabase
            .from('incidencias_legal_documents')
            .select('id, html_content, worker_id')
            .eq('propuesta_id', propuestaId)
            .order('created_at', { ascending: false })
            .limit(10);
          const { data: legalDocs } = await legalDocsQuery;
          if (legalDocs && legalDocs.length > 0) {
            const targetWorkerId = (fullProp as any).target_worker_id ? String((fullProp as any).target_worker_id) : '';
            const selectedDoc = targetWorkerId
              ? ((legalDocs as any[]).find((d: any) => String(d.worker_id || '') === targetWorkerId && d.html_content) || (legalDocs as any[]).find((d: any) => d.html_content))
              : (legalDocs as any[]).find((d: any) => d.html_content);
            docHtml = (selectedDoc as any)?.html_content || null;
            docId = (selectedDoc as any)?.id || null;
            if (docHtml) break;
          }
          // Tras el 2º intento sin doc, lanzamos generación explícita una vez.
          if (attempt === 2 && !docHtml && !triggeredGeneration) {
            triggeredGeneration = true;
            const { data: propForDeferredDoc } = await supabase
              .from('incidencias_propuestas_rrhh')
              .select('admin_pruebas_urls, record_id')
              .eq('id', propuestaId)
              .maybeSingle();
            const { data: recForDeferredDoc } = (propForDeferredDoc as any)?.record_id
              ? await supabase.from('incidencias_records').select('pruebas_urls').eq('id', (propForDeferredDoc as any).record_id).maybeSingle()
              : { data: null } as any;
            if (!hasVideoEvidenceForProposal(propForDeferredDoc, recForDeferredDoc)) {
              console.log(`[${sourceLabel}] Documento legal no encontrado tras 4s — disparando generación.`);
              generateLegalDocumentBackground(supabase, propuestaId, manager.name).catch(e =>
                console.error(`[${sourceLabel}] Error disparando generación legal:`, e)
              );
            } else {
              console.log(`[${sourceLabel}] Documento legal pendiente de fotogramas reales; no se autogenera desde backend.`);
            }
          }
          await new Promise(r => setTimeout(r, 5000));
        }
        if (!docHtml) {
          // Documento aún no listo. Reprogramar reintento diferido en lugar
          // de mandar correo manco. El correo NO sale sin botón al documento.
          const retryAttempt = Number((sourceLabel.match(/retryDeferred-(\d+)/) || [])[1] || '0');
          if (retryAttempt < 3) {
            const next = retryAttempt + 1;
            console.warn(`[${sourceLabel}] Documento legal aún no listo tras ${maxAttempts * 5}s — reintento diferido #${next} en 60s.`);
            try {
              // @ts-ignore EdgeRuntime is available at runtime
              EdgeRuntime.waitUntil((async () => {
                await new Promise(r => setTimeout(r, 60000));
                await sendSuspensionAvisoEmail(propuestaId, `retryDeferred-${next}`).catch((e: any) =>
                  console.error(`[retryDeferred-${next}] error:`, e?.message || e),
                );
              })());
            } catch (e: any) {
              console.error(`[${sourceLabel}] No se pudo programar reintento diferido:`, e?.message || e);
            }
          } else {
            console.error(`[${sourceLabel}] Documento legal NUNCA llegó tras 3 reintentos. Aviso suspensión NO enviado. Usar botón "Reenviar aviso" cuando el doc esté listo.`);
          }
          return { sent: false, pending: true, reason: 'El documento legal aún no está listo; el aviso no se ha enviado todavía' }; // No mandar el correo todavía.
        }

        // 4) Calcular fecha máxima de firma (día laborable previo al inicio de suspensión)
        const fechasArr: string[] = Array.isArray((fullProp as any).suspension_fechas) ? (fullProp as any).suspension_fechas : [];
        const fechaInicioStr: string | null = (fullProp as any).fecha_inicio || (fechasArr.length > 0 ? fechasArr[0] : null);

        const formatEsDate = (iso: string | null): string => {
          if (!iso) return '—';
          const parts = iso.split('-').map(Number);
          if (parts.length !== 3) return iso;
          const d = new Date(parts[0], parts[1] - 1, parts[2]);
          const txt = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          return txt.charAt(0).toUpperCase() + txt.slice(1);
        };

        let deadlineLabel = '—';
        if (fechaInicioStr) {
          const parts = fechaInicioStr.split('-').map(Number);
          if (parts.length === 3) {
            const dl = new Date(parts[0], parts[1] - 1, parts[2]);
            dl.setDate(dl.getDate() - 1);
            while (dl.getDay() === 0 || dl.getDay() === 6) dl.setDate(dl.getDate() - 1);
            const txt = dl.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            deadlineLabel = txt.charAt(0).toUpperCase() + txt.slice(1);
          }
        }

        const fechaInicioLabel = formatEsDate(fechaInicioStr);
        const fechaFinStr = fechasArr.length > 0 ? fechasArr[fechasArr.length - 1] : null;
        const fechaFinLabel = formatEsDate(fechaFinStr);
        const fechasListHtml = fechasArr.length > 0
          ? fechasArr.map(f => `<span style="display:inline-block;background:#fef3c7;color:#92400e;padding:4px 10px;border-radius:8px;font-size:12px;font-weight:600;margin:0 4px 4px 0;">${formatEsDate(f)}</span>`).join('')
          : '<span style="color:#94a3b8;font-style:italic;">No definidas</span>';

        const slug = (workerName || 'trabajador').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        // Construimos un único enlace permanente al documento legal HTML.
        // - NO adjuntamos PDF al email (puede no estar listo y abulta el correo).
        // - El enlace apunta a una landing pública (`public-actions ?mode=page`)
        //   que muestra el documento (idéntico al que firmará el trabajador,
        //   solo a falta de la firma) y ofrece su propio botón "Descargar".
        // - Como cortesía añadimos también un enlace de descarga directa
        //   (mismo token, mode=download).
        // - El enlace es estable: `ensureLegalDocumentOnlineLink` hace upsert
        //   sobre la misma ruta y reutiliza el mismo token entre regeneraciones.
        let legalDocumentLink: string | null = null;
        let legalDocumentPdfLink: string | null = null;
        if (docHtml && docId) {
          try {
            const onlineLinks = await ensureLegalDocumentOnlineLink(
              supabase,
              propuestaId,
              docId,
              docHtml,
              `sancion-${slug || 'trabajador'}-borrador`,
            );
            if (onlineLinks) {
              legalDocumentLink = onlineLinks.pageUrl || onlineLinks.url || null;
              // Enlace de descarga directa: apuntamos a una página pública
              // dedicada (/doc/:token/pdf) que renderiza una pantalla mínima
              // y dispara automáticamente el diálogo nativo de guardado de
              // PDF del navegador, usando el mismo pipeline que "Imprimir"
              // en el panel admin (paginación A4 idéntica).
              const baseForPdf = onlineLinks.pageUrl || null;
              if (baseForPdf) {
                // baseForPdf es del estilo `https://vnprod.app/doc/<token>`.
                // Le añadimos `/pdf` al final, respetando query params si los hubiera.
                const [pathPart, queryPart] = baseForPdf.split('?');
                const pdfPath = pathPart.endsWith('/') ? `${pathPart}pdf` : `${pathPart}/pdf`;
                legalDocumentPdfLink = queryPart ? `${pdfPath}?${queryPart}` : pdfPath;
              }
            }
          } catch (e: any) {
            console.error(`[${sourceLabel}] Error generando enlace permanente del documento:`, e?.message || e);
          }
        }

        // Defensa: a estas alturas docHtml es obligatorio (si no, ya habríamos
        // hecho `return` arriba reprogramando reintento). Pero por seguridad
        // si no hubiese enlace, abortamos el envío.
        if (!legalDocumentLink) {
          console.error(`[${sourceLabel}] Documento generado pero enlace permanente no disponible — aviso NO enviado.`);
          return;
        }

        const logoUrl = 'https://vnprod.app/images/logo-white.png';
        const logoGreenUrl = 'https://vnprod.app/images/verdnatura-logo-green.png';
        const accent = '#d97706';
        const headerGradient = 'linear-gradient(135deg, #b45309, #f59e0b)';
        const subject = `Aviso preparación suspensión empleo y sueldo — ${workerName}${workerNumber ? ` (${workerNumber})` : ''} · ${(fullProp as any).suspension_dias} día${(fullProp as any).suspension_dias === 1 ? '' : 's'}`;
        const salixLink = workerNumber ? `https://salix.verdnatura.es/#/worker/${workerNumber}/time-control` : '';

        const documentAccessHtml = `<div style="margin:22px 0 6px;text-align:center;">
              <a href="${legalDocumentLink}" target="_blank" style="display:inline-block;background:${accent};color:#ffffff;padding:14px 28px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.01em;">Ver documento de la sanción</a>
              ${legalDocumentPdfLink ? `<p style="margin:10px 0 0;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;">o <a href="${legalDocumentPdfLink}" target="_blank" style="color:${accent};text-decoration:underline;font-weight:500;">descargar directamente en PDF</a></p>` : ''}
            </div>`;

        const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Poppins','Segoe UI',Arial,sans-serif;letter-spacing:-0.01em;">
<div style="max-width:620px;margin:0 auto;padding:20px;">
  <div style="background:${headerGradient};border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <img src="${logoUrl}" alt="Verdnatura" width="56" height="56" style="width:56px;height:56px;margin-bottom:12px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;font-family:'Poppins','Segoe UI',sans-serif;">Aviso anticipado · Suspensión empleo y sueldo</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.78);font-size:12px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">Para preparar baja en Seguridad Social y trámites previos</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 16px 16px;">

    <div style="margin-bottom:20px;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;">
      <p style="margin:0;font-size:13px;color:#78350f;line-height:1.6;">
        Hola, se ha aprobado una sanción que incluye <strong>suspensión de empleo y sueldo</strong>.
        Os enviamos esta notificación con antelación para que podáis preparar la baja en Seguridad Social
        y los trámites correspondientes. En el botón inferior podéis abrir el documento definitivo de la sanción <strong>aún sin firmar</strong> (es exactamente el que firmará el trabajador, a falta únicamente de su firma).
      </p>
    </div>

    <div style="margin-bottom:18px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;">Trabajador</p>
      ${salixLink
        ? `<a href="${salixLink}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;color:#0f172a;font-size:15px;font-weight:600;text-decoration:none;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.01em;">${workerName}${workerNumber ? `<span style="color:#94a3b8;font-weight:400;font-size:13px;">·&nbsp;${workerNumber}</span>` : ''}<span style="color:${accent};font-size:12px;font-weight:500;">↗</span></a>`
        : `<span style="display:inline-flex;align-items:center;gap:8px;color:#0f172a;font-size:15px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.01em;">${workerName}${workerNumber ? `<span style="color:#94a3b8;font-weight:400;font-size:13px;">·&nbsp;${workerNumber}</span>` : ''}</span>`}
    </div>

    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      <tr>
        <td style="padding:6px 0;font-size:12px;color:#64748b;width:40%;vertical-align:top;">Departamento</td>
        <td style="padding:6px 0;font-size:13px;color:#1e293b;font-weight:600;">${deptName}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:#64748b;vertical-align:top;">Días de suspensión</td>
        <td style="padding:6px 0;font-size:13px;color:#1e293b;font-weight:600;">${(fullProp as any).suspension_dias} día${(fullProp as any).suspension_dias === 1 ? '' : 's'}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:#64748b;vertical-align:top;">Inicio de la suspensión</td>
        <td style="padding:6px 0;font-size:13px;color:#1e293b;font-weight:600;">${fechaInicioLabel}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:#64748b;vertical-align:top;">Fin de la suspensión</td>
        <td style="padding:6px 0;font-size:13px;color:#1e293b;font-weight:600;">${fechaFinLabel}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:#64748b;vertical-align:top;">Día máximo previsto de firma</td>
        <td style="padding:6px 0;font-size:13px;color:#b45309;font-weight:600;">${deadlineLabel}</td>
      </tr>
    </table>

    <div style="margin-bottom:18px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:${accent};text-transform:uppercase;letter-spacing:0.5px;">Fechas concretas</p>
      <div>${fechasListHtml}</div>
    </div>

    ${documentAccessHtml}

    <p style="margin:18px 0 0;font-size:12px;color:#64748b;line-height:1.6;font-style:italic;">Este correo es informativo y no requiere respuesta.</p>

    <div style="margin-top:24px;line-height:1.4;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">
      <p style="margin:0 0 16px;">Un saludo,</p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-right:16px;vertical-align:middle;"><img src="${logoGreenUrl}" alt="Verdnatura" width="40" height="40" style="width:40px;height:40px;display:block;"></td>
          <td style="padding-right:16px;border-right:2px solid ${accent};vertical-align:middle;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#1a1a1a;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.02em;line-height:1.3;">Álvaro Mas</p>
            <p style="margin:1px 0 0;font-size:12px;font-weight:400;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.3;">VerdNatura Levante S.L.</p>
          </td>
          <td style="padding-left:16px;vertical-align:middle;">
            <p style="margin:0 0 2px;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">+34 661 95 84 33</p>
            <p style="margin:0;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">Carrer Fenollar, 2, 46680 Algemesí</p>
          </td>
        </tr>
      </table>
    </div>

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-left:0;"><span style="font-size:11px;font-weight:600;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;">Enviado desde Control de Incidencias · Verdnatura · Aviso automático</span></td>
        </tr>
      </table>
    </div>
  </div>
</div></body></html>`;

        const avisoRes = await sendEmailBrevo({
          from: 'Control Incidencias <incidencias@vnprod.app>',
          to: avisoTo,
          cc: avisoCcFinal,
          subject,
          html: emailHtml,
        });

        const avisoText = await avisoRes.text();
        if (!avisoRes.ok) {
          console.error(`[${sourceLabel}] Aviso suspensión email failed:`, avisoRes.status, avisoText);
          return { sent: false, reason: `Error del proveedor de email (${avisoRes.status})` };
        }

        await supabase
          .from('incidencias_propuestas_rrhh')
          .update({ suspension_aviso_enviado_at: new Date().toISOString() })
          .eq('id', propuestaId);

        await writeIncidenciasLog(
          'aviso_suspension_enviado',
          null,
          propuestaId,
          `Aviso de suspensión enviado a RRHH (${[...avisoTo, ...(avisoCcFinal || [])].join(', ')}) — ${workerName} · ${(fullProp as any).suspension_dias} días [origen: ${sourceLabel}]`,
          { to: avisoTo, cc: avisoCcFinal || [], dias: (fullProp as any).suspension_dias, has_doc_link: !!docId, source: sourceLabel },
        );
        console.log(`[${sourceLabel}] Aviso suspensión enviado correctamente:`, propuestaId);
        return { sent: true };
      } catch (e) {
        console.error(`[${sourceLabel}] Error enviando aviso suspensión:`, e);
        return { sent: false, reason: (e as any)?.message || 'Error enviando aviso suspensión' };
      }
    }

    // ── Fire-and-forget security log ───────────────────────────────────────
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    supabase.from('security_events').insert({
      event_type: `incidencias.${action}`,
      severity: 'info',
      actor_id: manager.id,
      actor_type: 'manager',
      ip_address: clientIp,
      user_agent: req.headers.get('user-agent') || null,
      details: { action, departmentId: body.departmentId || null },
    }).then(() => {}).catch(() => {});

    // ── Route actions ────────────────────────────────────
    switch (action) {

      case 'savePushToken': {
        const { endpoint, p256dh, auth } = body;
        if (!endpoint || !p256dh || !auth) return errorResponse('endpoint, p256dh, auth required');
        await supabase.from('incidencias_push_tokens').upsert({
          manager_id: manager.id,
          endpoint,
          p256dh,
          auth_key: auth,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'manager_id,endpoint' });
        return okResponse({ saved: true });
      }

      // =============================================
      // LEGACY: getMyDepartments — now uses isolated tables
      // =============================================
      case 'getMyDepartments': {
        // Support targetManagerId for admin preview mode
        const targetManagerId = body.targetManagerId;
        const useTargetManager = isAdmin && targetManagerId && targetManagerId !== manager!.id;
        
        if (isAdmin && !useTargetManager) {
          // Admin viewing their own: fetch ALL ERP departments + any incidencias-only departments
          const [erpRes, siloRes] = await Promise.all([
            supabase.from('departments').select('id, name').order('name'),
            supabase.from('incidencias_departments').select('id, name').eq('active', true).order('name'),
          ]);
          const erpDepts = (erpRes.data || []).map(d => ({ id: d.id, name: d.name, source: 'erp' }));
          const siloDepts = (siloRes.data || []).map(d => ({ id: d.id, name: d.name, source: 'incidencias' }));
          const erpIds = new Set(erpDepts.map(d => d.id));
          const uniqueSilo = siloDepts.filter(d => !erpIds.has(d.id));
          const merged = [...erpDepts, ...uniqueSilo].sort((a, b) => a.name.localeCompare(b.name));
          return okResponse({ departments: merged, role: 'admin' });
        }
        // Encargado, Responsable OR admin previewing as another manager: get only their assigned departments
        const lookupManagerId = useTargetManager ? targetManagerId : manager!.id;
        
        // Check if lookupManager is a responsable - resolve dept from responsable_worker_id
        let deptIds: string[] = [];
        let responsableTeamIds: string[] = [];
        const { data: lookupMgr } = await supabase.from('managers').select('role, worker_team_id, worker_id').eq('id', lookupManagerId).single();
        if (lookupMgr?.role === 'responsable') {
          // Find teams this manager leads via responsable_worker_id
          if (lookupMgr.worker_id) {
            const { data: ledTeams } = await supabase
              .from('worker_teams')
              .select('id, department_id')
              .eq('responsable_worker_id', lookupMgr.worker_id);
            if (ledTeams && ledTeams.length > 0) {
              responsableTeamIds = ledTeams.map(t => t.id);
              deptIds = [...new Set(ledTeams.map(t => t.department_id))];
            }
          }
          // Fallback to worker_team_id
          if (deptIds.length === 0 && lookupMgr.worker_team_id) {
            responsableTeamIds = [lookupMgr.worker_team_id];
            const { data: teamData } = await supabase.from('worker_teams').select('department_id').eq('id', lookupMgr.worker_team_id).single();
            if (teamData?.department_id) deptIds = [teamData.department_id];
          }
        } else {
          const [siloData, erpData] = await Promise.all([
            supabase.from('incidencias_department_managers').select('department_id').eq('manager_id', lookupManagerId),
            supabase.from('manager_department_assignments').select('department_id').eq('manager_id', lookupManagerId),
          ]);
          deptIds = [...new Set([
            ...(siloData.data || []).map((d: any) => d.department_id),
            ...(erpData.data || []).map((d: any) => d.department_id),
          ])];
        }
        if (deptIds.length === 0) {
          return okResponse({ departments: [], role: 'encargado' });
        }
        // Fetch department details from both sources
        const [erpRes, siloRes] = await Promise.all([
          supabase.from('departments').select('id, name').in('id', deptIds),
          supabase.from('incidencias_departments').select('id, name').in('id', deptIds).eq('active', true),
        ]);
        const erpDepts = (erpRes.data || []).map(d => ({ id: d.id, name: d.name, source: 'erp' }));
        const siloDepts = (siloRes.data || []).map(d => ({ id: d.id, name: d.name, source: 'incidencias' }));
        const erpIds = new Set(erpDepts.map(d => d.id));
        const uniqueSilo = siloDepts.filter(d => !erpIds.has(d.id));
        const merged = [...erpDepts, ...uniqueSilo].sort((a, b) => a.name.localeCompare(b.name));
        return okResponse({ departments: merged, role: useTargetManager ? 'encargado' : 'encargado', responsableTeamIds: responsableTeamIds.length > 0 ? responsableTeamIds : undefined });
      }

      case 'validateAccess': {
        const { departmentId } = body;
        if (!departmentId) return errorResponse('departmentId required');
        const hasAccess = await validateIncidenciasDeptAccess(departmentId);
        return okResponse({ hasAccess, role: isAdmin ? 'admin' : 'encargado' });
      }

      // =============================================
      // DEPARTMENTS CRUD
      // =============================================
      case 'listIncidenciasDepartments': {
        if (isAdmin) {
          // Merge ERP + silo departments, marking source
          const [erpRes, siloRes] = await Promise.all([
            supabase.from('departments').select('id, name, created_at').order('name'),
            supabase.from('incidencias_departments').select('*').order('name'),
          ]);
          const erpDepts = (erpRes.data || []).map(d => ({ ...d, active: true, source: 'erp', created_by: null }));
          const siloDepts = (siloRes.data || []).map(d => ({ ...d, source: 'incidencias' }));
          const erpIds = new Set(erpDepts.map(d => d.id));
          const uniqueSilo = siloDepts.filter(d => !erpIds.has(d.id));
          const merged = [...erpDepts, ...uniqueSilo].sort((a, b) => a.name.localeCompare(b.name));
          return okResponse({ departments: merged });
        }
        const deptIds = await getManagerIncidenciasDepartments();
        if (deptIds.length === 0) return okResponse({ departments: [] });
        const [erpRes, siloRes] = await Promise.all([
          supabase.from('departments').select('id, name, created_at').in('id', deptIds),
          supabase.from('incidencias_departments').select('*').in('id', deptIds),
        ]);
        const erpDepts = (erpRes.data || []).map(d => ({ ...d, active: true, source: 'erp', created_by: null }));
        const siloDepts = (siloRes.data || []).map(d => ({ ...d, source: 'incidencias' }));
        const erpIds = new Set(erpDepts.map(d => d.id));
        const uniqueSilo = siloDepts.filter(d => !erpIds.has(d.id));
        const merged = [...erpDepts, ...uniqueSilo].sort((a, b) => a.name.localeCompare(b.name));
        return okResponse({ departments: merged });
      }

      // Returns ALL departments (for worker selection in incident creation - all roles)
      case 'listAllDepartmentsForWorkers': {
        const [erpAllRes, siloAllRes] = await Promise.all([
          supabase.from('departments').select('id, name').order('name'),
          supabase.from('incidencias_departments').select('id, name').eq('active', true).order('name'),
        ]);
        const erpAllDepts = (erpAllRes.data || []).map(d => ({ id: d.id, name: d.name }));
        const siloAllDepts = (siloAllRes.data || []).map(d => ({ id: d.id, name: d.name }));
        const erpAllIds = new Set(erpAllDepts.map(d => d.id));
        const uniqueSiloAll = siloAllDepts.filter(d => !erpAllIds.has(d.id));
        const mergedAll = [...erpAllDepts, ...uniqueSiloAll].sort((a, b) => a.name.localeCompare(b.name));
        return okResponse({ departments: mergedAll });
      }

      case 'createIncidenciasDepartment': {
        if (!isAdmin) return errorResponse('Admin only');
        const { name } = body;
        if (!name?.trim()) return errorResponse('Name required');
        const { data, error } = await supabase
          .from('incidencias_departments')
          .insert({ name: name.trim(), created_by: manager.name })
          .select()
          .single();
        if (error) return errorResponse('Failed to create department: ' + error.message);
        return okResponse({ department: data });
      }

      case 'updateIncidenciasDepartment': {
        if (!isAdmin) return errorResponse('Admin only');
        const { departmentId, updates } = body;
        if (!departmentId) return errorResponse('departmentId required');
        const allowedFields: Record<string, unknown> = {};
        if (updates?.name !== undefined) allowedFields.name = updates.name;
        if (updates?.active !== undefined) allowedFields.active = updates.active;
        if (Object.keys(allowedFields).length === 0) return errorResponse('No valid fields to update');
        const { data, error } = await supabase
          .from('incidencias_departments')
          .update(allowedFields)
          .eq('id', departmentId)
          .select()
          .single();
        if (error) return errorResponse('Failed to update department');
        return okResponse({ department: data });
      }

      // =============================================
      // WORKERS CRUD
      // =============================================
      case 'listIncidenciasWorkers': {
        const { departmentId } = body;
        if (!departmentId) return errorResponse('departmentId required');
        if (!await validateIncidenciasDeptAccess(departmentId)) {
          return errorResponse('Access denied to this department');
        }
        // Fetch from BOTH sources in parallel
        const [siloRes, erpRes] = await Promise.all([
          supabase
            .from('incidencias_workers')
            .select('*')
            .eq('department_id', departmentId)
            .order('apellidos')
            .order('nombre'),
          supabase
            .from('workers')
            .select('id, name, worker_number, worker_code')
            .eq('department_id', departmentId)
            .order('name'),
        ]);
        if (siloRes.error && erpRes.error) return errorResponse('Failed to list workers');

        const siloWorkers = siloRes.data || [];
        const erpWorkers = erpRes.data || [];

        // Build a map of silo workers by worker_number for quick lookup
        const siloByNumber: Record<string, any> = {};
        const siloById: Record<string, any> = {};
        for (const sw of siloWorkers) {
          if (sw.worker_number) siloByNumber[sw.worker_number] = sw;
          siloById[sw.id] = sw;
        }

        // Start with ERP workers as the primary source, enriched with silo data
        const mergedMap: Record<string, any> = {};
        for (const ew of erpWorkers) {
          const silo = ew.worker_number ? siloByNumber[ew.worker_number] : null;
          const parts = (ew.name || '').split(' ');
          const nombre = parts[0] || ew.name;
          const apellidos = parts.slice(1).join(' ') || null;
          const key = ew.worker_number || ew.id;
          mergedMap[key] = {
            id: silo?.id || ew.id,
            nombre: silo?.nombre || nombre,
            apellidos: silo?.apellidos ?? apellidos,
            worker_number: ew.worker_number,
            worker_code: ew.worker_code || null,
            department_id: departmentId,
            activo: silo?.activo ?? true,
            email: silo?.email || null,
            telefono: silo?.telefono || null,
            external_url_salix: silo?.external_url_salix || null,
            created_at: silo?.created_at || null,
          };
          // Mark silo worker as merged
          if (silo) siloById[silo.id] = null;
        }

        // Add silo-only workers (those without ERP match)
        for (const sw of siloWorkers) {
          if (siloById[sw.id] === null) continue; // already merged
          const key = sw.worker_number || sw.id;
          if (!mergedMap[key]) {
            mergedMap[key] = sw;
          }
        }

        const merged = Object.values(mergedMap).sort((a: any, b: any) => {
          const nameA = `${a.apellidos || ''} ${a.nombre}`.trim().toLowerCase();
          const nameB = `${b.apellidos || ''} ${b.nombre}`.trim().toLowerCase();
          return nameA.localeCompare(nameB);
        });
        return okResponse({ workers: merged });
      }

      case 'getWorkersByTeams': {
        const { teamIds } = body;
        if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
          return errorResponse('teamIds required');
        }
        const { data: teamWorkers, error: twErr } = await supabase
          .from('workers')
          .select('id, name, worker_number, worker_team_id')
          .in('worker_team_id', teamIds)
          .order('name');
        if (twErr) return errorResponse('Failed to fetch team workers');
        return okResponse({ workers: teamWorkers || [] });
      }

      case 'createIncidenciasWorker': {
        if (!isAdmin) return errorResponse('Admin only');
        const { worker } = body;
        if (!worker?.nombre?.trim()) return errorResponse('nombre required');
        if (!worker?.department_id) return errorResponse('department_id required');
        const { data, error } = await supabase
          .from('incidencias_workers')
          .insert({
            department_id: worker.department_id,
            nombre: worker.nombre.trim(),
            apellidos: worker.apellidos?.trim() || null,
            email: worker.email?.trim() || null,
            telefono: worker.telefono?.trim() || null,
            worker_number: worker.worker_number?.trim() || null,
            external_url_salix: worker.external_url_salix?.trim() || null,
          })
          .select()
          .single();
        if (error) return errorResponse('Failed to create worker: ' + error.message);
        return okResponse({ worker: data });
      }

      case 'createExternalIncidenciasWorker': {
        if (!isAdmin) return errorResponse('Admin only');
        const { nombre, apellidos, workerNumber, departmentId, customDepartmentName } = body;
        const cleanNombre = typeof nombre === 'string' ? nombre.trim() : '';
        const cleanWorkerNumber = typeof workerNumber === 'string' ? workerNumber.trim() : '';
        const cleanCustomDeptName = typeof customDepartmentName === 'string' ? customDepartmentName.trim() : '';
        if (!cleanNombre) return errorResponse('nombre required');
        if (cleanNombre.length > 120) return errorResponse('nombre too long');
        if (!cleanWorkerNumber) return errorResponse('workerNumber required');
        if (cleanWorkerNumber.length > 30) return errorResponse('workerNumber too long');
        if (!departmentId && !cleanCustomDeptName) return errorResponse('departmentId or customDepartmentName required');
        if (cleanCustomDeptName && cleanCustomDeptName.length > 80) return errorResponse('customDepartmentName too long');

        let syncedDept: { id: string; name: string } | null = null;

        if (departmentId) {
          try {
            syncedDept = await ensureIncidenciasDepartmentExists(departmentId);
          } catch (e) {
            return errorResponse('Failed to validate department');
          }
          if (!syncedDept) return errorResponse('Department not found');
        } else {
          // Buscar por nombre (case-insensitive) en incidencias_departments primero
          const { data: existingByName } = await supabase
            .from('incidencias_departments')
            .select('id, name')
            .ilike('name', cleanCustomDeptName)
            .eq('active', true)
            .maybeSingle();
          if (existingByName) {
            syncedDept = existingByName;
          } else {
            // Buscar también en ERP por nombre
            const { data: erpByName } = await supabase
              .from('departments')
              .select('id, name')
              .ilike('name', cleanCustomDeptName)
              .maybeSingle();
            if (erpByName) {
              try {
                syncedDept = await ensureIncidenciasDepartmentExists(erpByName.id);
              } catch (_) {}
            }
            if (!syncedDept) {
              // Crear nuevo departamento temporal en silo de incidencias
              const { data: newDept, error: newDeptError } = await supabase
                .from('incidencias_departments')
                .insert({ name: cleanCustomDeptName, created_by: manager.name, active: true })
                .select('id, name')
                .single();
              if (newDeptError || !newDept) return errorResponse('Failed to create department: ' + (newDeptError?.message || 'unknown'));
              syncedDept = newDept;
            }
          }
        }

        const { data: created, error: createError } = await supabase
          .from('incidencias_workers')
          .insert({
            department_id: syncedDept.id,
            nombre: cleanNombre,
            apellidos: typeof apellidos === 'string' && apellidos.trim() ? apellidos.trim() : null,
            worker_number: cleanWorkerNumber,
            is_external: true,
            activo: true,
          })
          .select()
          .single();
        if (createError) return errorResponse('Failed to create external worker: ' + createError.message);

        return okResponse({ worker: { ...created, department_name: syncedDept.name } });
      }

      case 'updateIncidenciasWorker': {
        if (!isAdmin) return errorResponse('Admin only');
        const { workerId, updates: wUpdates } = body;
        if (!workerId) return errorResponse('workerId required');
        const allowed: Record<string, unknown> = {};
        for (const f of ['nombre', 'apellidos', 'email', 'telefono', 'worker_number', 'external_url_salix', 'activo', 'department_id']) {
          if (wUpdates?.[f] !== undefined) allowed[f] = wUpdates[f];
        }
        if (Object.keys(allowed).length === 0) return errorResponse('No valid fields');
        const { data, error } = await supabase
          .from('incidencias_workers')
          .update(allowed)
          .eq('id', workerId)
          .select()
          .single();
        if (error) return errorResponse('Failed to update worker');
        return okResponse({ worker: data });
      }

      case 'importIncidenciasWorkers': {
        if (!isAdmin) return errorResponse('Admin only');
        const { departmentId, workers: importRows } = body;
        if (!departmentId) return errorResponse('departmentId required');
        if (!Array.isArray(importRows) || importRows.length === 0) return errorResponse('No workers to import');

        const toInsert = importRows.map((r: Record<string, string>) => ({
          department_id: departmentId,
          nombre: (r.nombre || '').trim(),
          apellidos: (r.apellidos || '').trim() || null,
          email: (r.email || '').trim() || null,
          telefono: (r.telefono || '').trim() || null,
          worker_number: (r.worker_number || '').trim() || null,
          external_url_salix: (r.external_url_salix || '').trim() || null,
        })).filter(w => w.nombre);

        if (toInsert.length === 0) return errorResponse('No valid workers found');

        const { data, error } = await supabase
          .from('incidencias_workers')
          .insert(toInsert)
          .select();
        if (error) return errorResponse('Import failed: ' + error.message);
        return okResponse({ imported: data?.length || 0, workers: data });
      }

      case 'exportIncidenciasWorkers': {
        if (!isAdmin) return errorResponse('Admin only');
        const { departmentId: expDeptId } = body;
        if (!expDeptId) return errorResponse('departmentId required');
        const { data, error } = await supabase
          .from('incidencias_workers')
          .select('worker_number, nombre, apellidos, email, telefono, external_url_salix, activo')
          .eq('department_id', expDeptId)
          .order('apellidos');
        if (error) return errorResponse('Export failed');
        return okResponse({ workers: data });
      }

      // =============================================
      // MANAGER-DEPARTMENT ASSIGNMENTS
      // =============================================
      case 'listIncidenciasDepartmentManagers': {
        if (!isAdmin) return errorResponse('Admin only');
        const { departmentId: dmDeptId } = body;
        if (!dmDeptId) return errorResponse('departmentId required');
        // Read from ERP manager_department_assignments instead of incidencias silo
        const { data, error } = await supabase
          .from('manager_department_assignments')
          .select('id, manager_id, department_id, created_at')
          .eq('department_id', dmDeptId);
        if (error) return errorResponse('Failed to list assignments');

        const managerIds = (data || []).map(d => d.manager_id);
        let managers: Record<string, string> = {};
        if (managerIds.length > 0) {
          const { data: mData } = await supabase
            .from('managers')
            .select('id, name, role')
            .in('id', managerIds);
          if (mData) {
            managers = Object.fromEntries(mData.map(m => [m.id, m.name]));
          }
        }

        const enriched = (data || []).map(a => ({
          ...a,
          manager_name: managers[a.manager_id] || 'Desconocido',
        }));

        return okResponse({ assignments: enriched });
      }

      case 'assignManagerToDepartment': {
        if (!isAdmin) return errorResponse('Admin only');
        const { managerId, departmentId: aDeptId } = body;
        if (!managerId || !aDeptId) return errorResponse('managerId and departmentId required');
        // Write to ERP manager_department_assignments
        const { data, error } = await supabase
          .from('manager_department_assignments')
          .insert({ manager_id: managerId, department_id: aDeptId })
          .select()
          .single();
        if (error) {
          if (error.code === '23505') return errorResponse('Ya asignado a este departamento');
          return errorResponse('Failed to assign: ' + error.message);
        }
        return okResponse({ assignment: data });
      }

      case 'removeManagerFromDepartment': {
        if (!isAdmin) return errorResponse('Admin only');
        const { assignmentId } = body;
        if (!assignmentId) return errorResponse('assignmentId required');
        // Delete from ERP manager_department_assignments
        const { error } = await supabase
          .from('manager_department_assignments')
          .delete()
          .eq('id', assignmentId);
        if (error) return errorResponse('Failed to remove assignment');
        return okResponse({ removed: true });
      }

      case 'listAvailableManagers': {
        if (!isAdmin) return errorResponse('Admin only');
        const { data, error } = await supabase
          .from('managers')
          .select('id, name, role')
          .in('role', ['manager'])
          .order('name');
        if (error) return errorResponse('Failed to list managers');
        return okResponse({ managers: data });
      }

      // =============================================
      // GRAVEDADES
      // =============================================
      case 'listGravedades': {
        const { data, error } = await supabase
          .from('incidencias_gravedades')
          .select('*')
          .order('sort_order');
        if (error) return errorResponse('Failed to list gravedades');
        return okResponse({ gravedades: data });
      }

      case 'createGravedad': {
        if (!isAdmin) return errorResponse('Admin only');
        const { key: gKey, label: gLabel, label_plural: gPlural, color: gColor, puntos: gPuntos, icon_name: gIcon } = body;
        if (!gKey?.trim() || !gLabel?.trim()) return errorResponse('key and label required');
        const { data: maxOrd } = await supabase.from('incidencias_gravedades').select('sort_order').order('sort_order', { ascending: false }).limit(1);
        const nextOrd = ((maxOrd && maxOrd[0]?.sort_order) || 0) + 1;
        const { data, error } = await supabase.from('incidencias_gravedades').insert({
          key: gKey.trim(),
          label: gLabel.trim(),
          label_plural: (gPlural || gLabel + 's').trim(),
          color: gColor || '#93d600',
          puntos: gPuntos ?? 1,
          icon_name: gIcon || 'Shield',
          sort_order: nextOrd,
        }).select().single();
        if (error) return errorResponse('Failed to create gravedad: ' + error.message);
        return okResponse({ gravedad: data });
      }

      case 'updateGravedad': {
        if (!isAdmin) return errorResponse('Admin only');
        const { gravedadId: gId } = body;
        if (!gId) return errorResponse('gravedadId required');
        const gUpdates: any = {};
        if (body.label !== undefined) gUpdates.label = body.label;
        if (body.label_plural !== undefined) gUpdates.label_plural = body.label_plural;
        if (body.color !== undefined) gUpdates.color = body.color;
        if (body.puntos !== undefined) gUpdates.puntos = body.puntos;
        if (body.icon_name !== undefined) gUpdates.icon_name = body.icon_name;
        if (body.sort_order !== undefined) gUpdates.sort_order = body.sort_order;
        if (body.active !== undefined) gUpdates.active = body.active;
        const { error } = await supabase.from('incidencias_gravedades').update(gUpdates).eq('id', gId);
        if (error) return errorResponse('Failed to update gravedad: ' + error.message);
        return okResponse({ success: true });
      }

      case 'deleteGravedad': {
        if (!isAdmin) return errorResponse('Admin only');
        const { gravedadId: gId } = body;
        if (!gId) return errorResponse('gravedadId required');
        const { error } = await supabase.from('incidencias_gravedades').update({ active: false }).eq('id', gId);
        if (error) return errorResponse('Failed to delete gravedad: ' + error.message);
        return okResponse({ success: true });
      }

      case 'reorderGravedades': {
        if (!isAdmin) return errorResponse('Admin only');
        const { items } = body;
        if (!Array.isArray(items)) return errorResponse('items array required');
        for (const item of items) {
          if (!item.id || item.sort_order === undefined) continue;
          await supabase.from('incidencias_gravedades').update({ sort_order: item.sort_order }).eq('id', item.id);
        }
        return okResponse({ success: true });
      }

      // =============================================
      // CATEGORIES
      // =============================================
      case 'listCategories': {
        const { departmentId: listCatDeptId, departmentIds: listCatDeptIds } = body;
        // Fetch all active categories
        const { data: allCats, error: catErr } = await supabase
          .from('incidencias_categories')
          .select('*')
          .eq('active', true)
          .order('sort_order');
        if (catErr) return errorResponse('Failed to list categories');

        // Fetch all department links
        const catIds = (allCats || []).map((c: any) => c.id);
        let links: any[] = [];
        let tagRows: any[] = [];
        if (catIds.length > 0) {
          const [linkRes, tagRes] = await Promise.all([
            supabase.from('incidencias_category_departments').select('category_id, department_id').in('category_id', catIds),
            supabase.from('incidencias_category_tags').select('id, category_id, field_name, field_value').in('category_id', catIds),
          ]);
          links = linkRes.data || [];
          tagRows = tagRes.data || [];
        }

        // Build maps
        const catDeptMap: Record<string, string[]> = {};
        for (const link of links) {
          if (!catDeptMap[link.category_id]) catDeptMap[link.category_id] = [];
          catDeptMap[link.category_id].push(link.department_id);
        }
        const catTagMap: Record<string, any[]> = {};
        for (const tag of tagRows) {
          if (!catTagMap[tag.category_id]) catTagMap[tag.category_id] = [];
          catTagMap[tag.category_id].push({ id: tag.id, field_name: tag.field_name, field_value: tag.field_value });
        }

        // Enrich categories
        let enriched = (allCats || []).map((c: any) => ({
          ...c,
          department_ids: catDeptMap[c.id] || [],
          tags: catTagMap[c.id] || [],
        }));

        // Filter by department if requested
        if (listCatDeptId === '__global__') {
          enriched = enriched.filter((c: any) => c.department_ids.length === 0 && !c.department_id);
        } else if (listCatDeptIds && Array.isArray(listCatDeptIds) && listCatDeptIds.length > 0) {
          enriched = enriched.filter((c: any) =>
            (c.department_ids.length === 0 && !c.department_id) ||
            c.department_ids.some((did: string) => listCatDeptIds.includes(did))
          );
        } else if (listCatDeptId && listCatDeptId !== '__all__') {
          enriched = enriched.filter((c: any) =>
            (c.department_ids.length === 0 && !c.department_id) ||
            c.department_ids.includes(listCatDeptId)
          );
        }

        return okResponse({ categories: enriched });
      }

      case 'createCategory': {
        if (!isAdmin) return errorResponse('Admin only');
        const { name, gravedad, color, departmentIds: createCatDeptIds, departmentId: createCatDeptId, puntos, es_critico, csv_aliases: createCsvAliases } = body;
        if (!name?.trim()) return errorResponse('name required');
        const { data: maxOrder } = await supabase.from('incidencias_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1);
        const nextOrder = ((maxOrder && maxOrder[0]?.sort_order) || 0) + 1;
        const insertData: any = {
          name: name.trim(),
          gravedad: gravedad || 'leve',
          color: color || '#93d600',
          sort_order: nextOrder,
          active: true,
          puntos: puntos ?? 1,
          es_critico: es_critico || false,
        };
        if (createCsvAliases !== undefined) insertData.csv_aliases = createCsvAliases;

        // Create the single category
        const { data, error } = await supabase.from('incidencias_categories').insert(insertData).select().single();
        if (error) return errorResponse('Failed to create category: ' + error.message);

        // Link to departments via junction table
        const deptIdsToLink: string[] = createCatDeptIds || (createCatDeptId && createCatDeptId !== '__global__' && createCatDeptId !== '__all__' ? [createCatDeptId] : []);
        if (deptIdsToLink.length > 0) {
          const linkRows: any[] = [];
          for (const did of deptIdsToLink) {
            const syncedDept = await ensureIncidenciasDepartmentExists(did);
            if (syncedDept) {
              linkRows.push({ category_id: data.id, department_id: syncedDept.id });
            }
          }
          if (linkRows.length > 0) {
            await supabase.from('incidencias_category_departments').insert(linkRows);
          }
        }

        return okResponse({ category: { ...data, department_ids: deptIdsToLink } });
      }

      case 'updateCategory': {
        if (!isAdmin) return errorResponse('Admin only');
        const { categoryId: catId, name, gravedad, color, active, puntos: catPuntos, es_critico: catEsCritico, consecuencia_critico: catConsecuencia, csv_aliases: catCsvAliases } = body;
        if (!catId) return errorResponse('categoryId required');
        const updates: any = {};
        if (name !== undefined) updates.name = name.trim();
        if (gravedad !== undefined) updates.gravedad = gravedad;
        if (color !== undefined) updates.color = color;
        if (active !== undefined) updates.active = active;
        if (catPuntos !== undefined) updates.puntos = catPuntos;
        if (catEsCritico !== undefined) updates.es_critico = catEsCritico;
        if (catConsecuencia !== undefined) updates.consecuencia_critico = catConsecuencia;
        if (catCsvAliases !== undefined) updates.csv_aliases = catCsvAliases;
        if (body.importe_rangos !== undefined) updates.importe_rangos = body.importe_rangos;
        const { error } = await supabase.from('incidencias_categories').update(updates).eq('id', catId);
        if (error) return errorResponse('Failed to update category: ' + error.message);
        return okResponse({ success: true });
      }

      case 'setCategoryDepartments': {
        if (!isAdmin) return errorResponse('Admin only');
        const { categoryId: scCatId, departmentIds: scDeptIds } = body;
        if (!scCatId) return errorResponse('categoryId required');
        if (!Array.isArray(scDeptIds)) return errorResponse('departmentIds must be an array');

        // Delete existing links
        await supabase.from('incidencias_category_departments').delete().eq('category_id', scCatId);

        // Insert new links
        if (scDeptIds.length > 0) {
          const linkRows: any[] = [];
          for (const did of scDeptIds) {
            const syncedDept = await ensureIncidenciasDepartmentExists(did);
            if (syncedDept) {
              linkRows.push({ category_id: scCatId, department_id: syncedDept.id });
            }
          }
          if (linkRows.length > 0) {
            const { error: linkErr } = await supabase.from('incidencias_category_departments').insert(linkRows);
            if (linkErr) return errorResponse('Failed to set departments: ' + linkErr.message);
          }
        }

        // Also clear the legacy department_id field
        await supabase.from('incidencias_categories').update({ department_id: null }).eq('id', scCatId);

        return okResponse({ success: true });
      }

      case 'deleteCategory': {
        if (!isAdmin) return errorResponse('Admin only');
        const { categoryId: catId } = body;
        if (!catId) return errorResponse('categoryId required');
        const { error } = await supabase.from('incidencias_categories').update({ active: false }).eq('id', catId);
        if (error) return errorResponse('Failed to delete category: ' + error.message);
        return okResponse({ success: true });
      }

      case 'addCategoryTag': {
        if (!isAdmin) return errorResponse('Admin only');
        const { categoryId: tagCatId, fieldName, fieldValue } = body;
        if (!tagCatId || !fieldName?.trim() || !fieldValue?.trim()) return errorResponse('categoryId, fieldName, fieldValue required');
        const { data: tagData, error: tagErr } = await supabase
          .from('incidencias_category_tags')
          .insert({ category_id: tagCatId, field_name: fieldName.trim(), field_value: fieldValue.trim() })
          .select()
          .single();
        if (tagErr) return errorResponse('Failed to add tag: ' + tagErr.message);
        return okResponse({ tag: tagData });
      }

      case 'removeCategoryTag': {
        if (!isAdmin) return errorResponse('Admin only');
        const { tagId } = body;
        if (!tagId) return errorResponse('tagId required');
        const { error: rmErr } = await supabase.from('incidencias_category_tags').delete().eq('id', tagId);
        if (rmErr) return errorResponse('Failed to remove tag: ' + rmErr.message);
        return okResponse({ success: true });
      }

      case 'adminUpdateIncidencia': {
        if (!isAdmin) return errorResponse('Admin only');
        const { recordId, categoryId: newCatId, customCategoryName: newCustomCat, descripcion: newDesc, fecha: newFecha, estado: newEstado, accionPropuesta: newAccion, gravedad: newGravedad, conSuspension, suspensionDias, suspensionFechas } = body;
        if (!recordId) return errorResponse('recordId required');

        // Fetch current record for changelog comparison
        const { data: currentRec } = await supabase.from('incidencias_records').select('*').eq('id', recordId).single();
        
        const updates: any = {};
        if (newCatId !== undefined) updates.category_id = newCatId;
        if (newCustomCat !== undefined) updates.custom_category_name = newCustomCat || null;
        if (newDesc !== undefined) updates.descripcion = newDesc;
        if (newFecha !== undefined) updates.fecha = newFecha;
        if (newEstado !== undefined) updates.estado = newEstado;
        if (newAccion !== undefined) updates.accion_propuesta = newAccion;
        if (conSuspension !== undefined) updates.propuesta_suspension = conSuspension;
        // Note: suspension_dias and suspension_fechas live on incidencias_propuestas_rrhh, not records
        updates.updated_at = new Date().toISOString();
        const { error } = await supabase.from('incidencias_records').update(updates).eq('id', recordId);
        if (error) return errorResponse('Failed to update: ' + error.message);

        // Write changelog for tracked fields
        const changelogEntries: Array<{ campo: string; valor_anterior: string | null; valor_nuevo: string | null }> = [];
        if (currentRec) {
          if (newGravedad && newGravedad !== currentRec.gravedad) changelogEntries.push({ campo: 'gravedad', valor_anterior: currentRec.gravedad || null, valor_nuevo: newGravedad });
          if (conSuspension !== undefined && conSuspension !== currentRec.propuesta_suspension) changelogEntries.push({ campo: 'con_suspension', valor_anterior: String(!!currentRec.propuesta_suspension), valor_nuevo: String(conSuspension) });
          if (suspensionDias !== undefined && suspensionDias !== currentRec.suspension_dias) changelogEntries.push({ campo: 'suspension_dias', valor_anterior: String(currentRec.suspension_dias || 0), valor_nuevo: String(suspensionDias) });
          if (suspensionFechas !== undefined) changelogEntries.push({ campo: 'suspension_fechas', valor_anterior: JSON.stringify(currentRec.suspension_fechas || []), valor_nuevo: JSON.stringify(suspensionFechas) });
          if (newAccion && newAccion !== currentRec.accion_propuesta) changelogEntries.push({ campo: 'accion_propuesta', valor_anterior: currentRec.accion_propuesta || null, valor_nuevo: newAccion });
        }

        // Also update the linked propuesta if one exists
        if (currentRec) {
          const { data: linkedProp } = await supabase.from('incidencias_propuestas_rrhh').select('id').eq('record_id', recordId).maybeSingle();
          if (linkedProp) {
            const propUpdates: any = {};
            if (newGravedad) propUpdates.gravedad = newGravedad;
            if (conSuspension !== undefined) propUpdates.suspension_dias = conSuspension ? (suspensionDias || 0) : null;
            if (suspensionFechas !== undefined) propUpdates.suspension_fechas = suspensionFechas;
            if (Object.keys(propUpdates).length > 0) {
              await supabase.from('incidencias_propuestas_rrhh').update(propUpdates).eq('id', linkedProp.id);
            }

            // Write changelog to propuestas_changelog
            if (changelogEntries.length > 0) {
              const rows = changelogEntries.map(e => ({ propuesta_id: linkedProp.id, campo: e.campo, valor_anterior: e.valor_anterior, valor_nuevo: e.valor_nuevo, cambiado_por: manager!.name }));
              supabase.from('incidencias_propuestas_changelog').insert(rows).then(() => {}).catch(() => {});
            }
          }
        }

        await writeIncidenciasLog('editar_incidencia', recordId, null, `Editada por admin ${manager.name}`, updates);
        return okResponse({ success: true });
      }
      case 'applyAiCategoryReclassification': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId } = body;
        if (!propuestaId) return errorResponse('propuestaId required');

        // Load propuesta + record
        const { data: prop } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('id, record_id, ai_analysis')
          .eq('id', propuestaId)
          .maybeSingle();
        if (!prop) return errorResponse('Propuesta no encontrada');
        const suggested = (prop.ai_analysis as any)?.categoria_sugerida;
        if (!suggested || !String(suggested).trim()) return errorResponse('La IA no ha sugerido una categoría');

        const { data: rec } = await supabase
          .from('incidencias_records')
          .select('id, category_id, descripcion, custom_category_name, incidencias_categories(id, name)')
          .eq('id', prop.record_id)
          .maybeSingle();
        if (!rec) return errorResponse('Record no encontrado');
        const currentName = (rec as any).incidencias_categories?.name || '';
        if (currentName === suggested) return okResponse({ success: true, alreadyApplied: true });

        // Find matching active category by name (case-insensitive)
        let { data: matchingCat } = await supabase
          .from('incidencias_categories')
          .select('id, name')
          .ilike('name', suggested)
          .eq('active', true)
          .limit(1)
          .maybeSingle();
        if (!matchingCat) {
          // Auto-create category with severity suggested by AI
          const aiAnalysis = (prop.ai_analysis as any) || {};
          const currentGravedad = (rec as any).incidencias_categories?.gravedad || null;
          const rawGrav = String(aiAnalysis.gravedad_sugerida || currentGravedad || 'leve').toLowerCase();
          const gravedad = ['leve', 'grave', 'muy_grave'].includes(rawGrav) ? rawGrav : 'leve';
          const puntosMap: Record<string, number> = { leve: 1, grave: 3, muy_grave: 6 };
          const puntos = puntosMap[gravedad] ?? 1;
          const { data: maxRow } = await supabase
            .from('incidencias_categories')
            .select('sort_order')
            .order('sort_order', { ascending: false })
            .limit(1)
            .maybeSingle();
          const nextSort = ((maxRow as any)?.sort_order ?? 0) + 1;
          const newName = String(suggested).trim();
          const { data: created, error: createErr } = await supabase
            .from('incidencias_categories')
            .insert({
              name: newName,
              gravedad,
              color: '#93d600',
              active: true,
              sort_order: nextSort,
              puntos,
              es_critico: false,
            })
            .select('id, name')
            .maybeSingle();
          if (createErr || !created) return errorResponse('No se pudo crear la categoría: ' + (createErr?.message || 'desconocido'));
          matchingCat = created as any;
          await writeIncidenciasLog('crear_categoria_auto_ia', rec.id, null, `Categoría "${newName}" creada automáticamente (gravedad: ${gravedad}) por reclasificación IA aplicada por ${manager.name}`, { name: newName, gravedad, puntos });
        }

        const recUpdate: Record<string, unknown> = { category_id: matchingCat.id, updated_at: new Date().toISOString() };
        // Move custom category text into descripcion if applicable
        if ((rec as any).custom_category_name) {
          if (!(rec as any).descripcion || String((rec as any).descripcion).trim() === '') {
            recUpdate.descripcion = (rec as any).custom_category_name;
          } else {
            recUpdate.descripcion = `${(rec as any).descripcion}\n\n[Detalle del encargado (categoría "Otros")]: ${(rec as any).custom_category_name}`;
          }
          recUpdate.custom_category_name = null;
        }
        const { error: recErr } = await supabase.from('incidencias_records').update(recUpdate).eq('id', rec.id);
        if (recErr) return errorResponse('Error actualizando categoría: ' + recErr.message);

        // Patch legal documents in place: just swap the categoria badge value.
        const { data: docs } = await supabase
          .from('incidencias_legal_documents')
          .select('id, html_content')
          .eq('propuesta_id', propuestaId)
          .eq('anulado', false);
        const newName = matchingCat.name;
        const escNew = String(newName)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        const updatedDocIds: string[] = [];
        for (const d of (docs || [])) {
          const html = String((d as any).html_content || '');
          if (!html) continue;
          let next = html;
          // 1) Replace inner value of existing badge-categoria value span
          const valueRe = /(<span class="badge-categoria-value"[^>]*>)([\s\S]*?)(<\/span>)/;
          const titleRe = /(<span class="badge-categoria"[^>]*\stitle=")[^"]*(")/;
          if (valueRe.test(next)) {
            next = next.replace(valueRe, `$1${escNew}$3`);
            if (titleRe.test(next)) next = next.replace(titleRe, `$1${escNew}$2`);
          } else {
            // 2) Insert badge inside document-meta if it doesn't exist yet
            const metaRe = /(<div class="document-meta">)([\s\S]*?)(<\/div>)/;
            const badgeHtml = `<span class="badge-categoria" title="${escNew}"><span class="badge-categoria-label">Categoría</span><span class="badge-categoria-value">${escNew}</span></span>`;
            if (metaRe.test(next)) {
              next = next.replace(metaRe, (_m, a, inner, c) => `${a}${inner}${badgeHtml}${c}`);
            }
          }
          if (next !== html) {
            const { error: upErr } = await supabase
              .from('incidencias_legal_documents')
              .update({ html_content: next, updated_at: new Date().toISOString() })
              .eq('id', (d as any).id);
            if (!upErr) updatedDocIds.push((d as any).id);
          }
        }

        // Changelog
        const { data: linkedProp } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('id')
          .eq('record_id', rec.id)
          .maybeSingle();
        if (linkedProp) {
          await supabase.from('incidencias_propuestas_changelog').insert([{
            propuesta_id: (linkedProp as any).id,
            campo: 'categoria',
            valor_anterior: currentName || null,
            valor_nuevo: newName,
            cambiado_por: manager!.name,
          }]).then(() => {}).catch(() => {});
        }

        await writeIncidenciasLog('aplicar_reclasificacion_ia', rec.id, null, `Categoría "${currentName}" → "${newName}" aplicada por ${manager.name}`, { from: currentName, to: newName, docsUpdated: updatedDocIds.length });
        return okResponse({ success: true, newCategory: newName, newCategoryId: matchingCat.id, docsUpdated: updatedDocIds.length });
      }
      case 'toggleFirmada': {
        if (!isAdmin) return errorResponse('Admin only');
        const { recordId, firmada: firmadaValue } = body;
        if (!recordId) return errorResponse('recordId required');
        const { error: firmErr } = await supabase.from('incidencias_records').update({ firmada: !!firmadaValue }).eq('id', recordId);
        if (firmErr) return errorResponse('Failed to toggle firmada: ' + firmErr.message);
        return okResponse({ success: true });
      }

      case 'requestEditIncidencia': {
        const { recordId, motivo } = body;
        if (!recordId) return errorResponse('recordId required');
        if (!motivo || String(motivo).trim().length < 10) {
          return errorResponse('Motivo mínimo 10 caracteres');
        }
        const motivoClean = String(motivo).trim().slice(0, 1000);

        const { data: rec } = await supabase
          .from('incidencias_records')
          .select('id, fecha, descripcion, departamento_id, incidencias_departments(name), incidencias_record_workers(worker_name, worker_number)')
          .eq('id', recordId)
          .maybeSingle();

        if (!rec) return errorResponse('Incidencia no encontrada');

        const deptName = (rec as any).incidencias_departments?.name || 'Departamento';
        const workerNames = ((rec as any).incidencias_record_workers || [])
          .map((w: any) => w.worker_name).filter(Boolean).join(', ') || 'Sin trabajadores';

        await supabase.from('incidencias_audit_logs').insert({
          action_type: 'edit_request',
          actor_id: manager.id,
          actor_name: manager.name,
          actor_role: manager.role,
          incidencia_id: recordId,
          details: motivoClean,
          cambios_json: { worker_names: workerNames, department: deptName, fecha: (rec as any).fecha },
        });

        const { data: admins } = await supabase
          .from('managers')
          .select('id')
          .eq('role', 'admin');

        if (admins && admins.length > 0) {
          const notifs = admins.map((a: any) => ({
            user_id: a.id,
            role: 'admin',
            type: 'edit_request',
            title: `Solicitud de edición — ${manager.name}`,
            message: `${workerNames} (${deptName}): ${motivoClean}`,
            link: `/control-incidencias?tab=historico&record=${recordId}`,
          }));
          await supabase.from('incidencias_notifications').insert(notifs);
        }

        return okResponse({ success: true });
      }

      case 'adminDeleteIncidencia': {
        if (!isAdmin) return errorResponse('Admin only');
        const { recordId } = body;
        if (!recordId) return errorResponse('recordId required');

        // 1. Get affected workers before deletion (for stats recalculation)
        const { data: affectedRW } = await supabase
          .from('incidencias_record_workers')
          .select('worker_id')
          .eq('record_id', recordId);
        const affectedWorkerIds = (affectedRW || []).map(rw => rw.worker_id);

        // 2. Get department_id from the record
        const { data: recData } = await supabase
          .from('incidencias_records')
          .select('department_id')
          .eq('id', recordId)
          .maybeSingle();
        const affectedDeptId = recData?.department_id;

        // 3. Find and delete associated propuestas with FULL cascade (no traces)
        const { data: propuestas } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('id, admin_pruebas_urls')
          .eq('record_id', recordId);

        if (propuestas && propuestas.length > 0) {
          const propIds = propuestas.map(p => p.id);

          // 3a. Collect all storage paths to delete (proposal evidence)
          const storagePaths: string[] = [];
          for (const prop of propuestas) {
            const adminUrls = Array.isArray((prop as any).admin_pruebas_urls) ? (prop as any).admin_pruebas_urls : [];
            for (const url of adminUrls) {
              const m = String(url).match(/incidencias-pruebas\/([^?]+)/);
              storagePaths.push(m ? decodeURIComponent(m[1]) : url);
            }
          }

          // 3b. Get legal document IDs for firma_tasks cleanup
          const { data: legalDocs } = await supabase.from('incidencias_legal_documents').select('id').in('propuesta_id', propIds);
          const legalDocIds = (legalDocs || []).map(d => d.id);

          // 3c. Delete ALL related tables in parallel (chat messages, attachment links, changelog, firma_tasks, legal_documents, audit_logs, notifications)
          await Promise.all([
            legalDocIds.length > 0
              ? supabase.from('incidencias_firma_tasks').delete().in('legal_document_id', legalDocIds)
              : Promise.resolve(),
            supabase.from('incidencias_legal_documents').delete().in('propuesta_id', propIds),
            supabase.from('incidencias_audit_logs').delete().in('propuesta_id', propIds),
            supabase.from('incidencias_chat_messages').delete().in('propuesta_id', propIds),
            supabase.from('incidencias_attachment_links').delete().in('proposal_id', propIds),
            supabase.from('incidencias_propuestas_changelog').delete().in('propuesta_id', propIds),
          ]);

          // 3d. Delete propuestas themselves
          await supabase.from('incidencias_propuestas_rrhh').delete().in('id', propIds);

          // 3e. Delete storage files (evidence images/videos) - fire and forget
          if (storagePaths.length > 0) {
            supabase.storage.from('incidencias-pruebas').remove(storagePaths).catch(() => {});
          }
        }

        // 3f. Also delete storage evidence from the record itself
        const { data: recForPruebas } = await supabase
          .from('incidencias_records')
          .select('pruebas_urls')
          .eq('id', recordId)
          .maybeSingle();
        if (recForPruebas?.pruebas_urls) {
          const recPaths: string[] = [];
          const urls = Array.isArray(recForPruebas.pruebas_urls) ? recForPruebas.pruebas_urls : [];
          for (const url of urls) {
            const m = String(url).match(/incidencias-pruebas\/([^?]+)/);
            recPaths.push(m ? decodeURIComponent(m[1]) : String(url));
          }
          if (recPaths.length > 0) {
            supabase.storage.from('incidencias-pruebas').remove(recPaths).catch(() => {});
          }
        }

        // 4. Delete record_workers
        await supabase.from('incidencias_record_workers').delete().eq('record_id', recordId);

        // 5. Delete audit logs referencing this incidencia
        await supabase.from('incidencias_audit_logs').delete().eq('incidencia_id', recordId);

        // 6. Hard delete the record itself
        const { error } = await supabase.from('incidencias_records').delete().eq('id', recordId);
        if (error) return errorResponse('Failed to delete: ' + error.message);

        // 7. Recalculate worker stats for affected workers
        for (const wId of affectedWorkerIds) {
          const { data: remaining } = await supabase
            .from('incidencias_record_workers')
            .select('record_id')
            .eq('worker_id', wId);

          if (!remaining || remaining.length === 0) {
            // No more records → delete stats
            await supabase.from('incidencias_worker_stats').delete().eq('worker_id', wId);
          } else {
            // Recalculate: fetch records with categories AND proposals (for real applied severity)
            const remainingIds = remaining.map(r => r.record_id);
            const [recsResult, proposalsResult] = await Promise.all([
              supabase
                .from('incidencias_records')
                .select('id, fecha, created_at, incidencias_categories(gravedad)')
                .in('id', remainingIds)
                .is('deleted_at', null),
              supabase
                .from('incidencias_propuestas_rrhh')
                .select('record_id, gravedad')
                .in('record_id', remainingIds),
            ]);
            const recs = recsResult.data || [];
            const proposalMap = new Map<string, string>();
            for (const p of (proposalsResult.data || [])) {
              if (p.record_id && p.gravedad) proposalMap.set(p.record_id, p.gravedad);
            }

            const now = new Date();
            const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
            const d60 = new Date(now.getTime() - 60 * 86400000).toISOString();
            const d90 = new Date(now.getTime() - 90 * 86400000).toISOString();

            let leves = 0, graves = 0, muy_graves = 0, u30 = 0, u60 = 0, u90 = 0;
            for (const r of recs) {
              // Prefer proposal gravedad (actual applied) over category gravedad
              const g = proposalMap.get(r.id) || (r as any).incidencias_categories?.gravedad || 'leve';
              if (g === 'leve') leves++;
              else if (g === 'grave') graves++;
              else if (g === 'muy_grave') muy_graves++;
              const f = r.fecha || r.created_at;
              if (f >= d30) u30++;
              if (f >= d60) u60++;
              if (f >= d90) u90++;
            }
            const total = (recs || []).length;
            const reincidencias = total > 1 ? total - 1 : 0;
            const riesgo_score = Math.min(100, leves * 5 + graves * 20 + muy_graves * 40 + u30 * 3 + reincidencias * 10);

            await supabase.from('incidencias_worker_stats').upsert({
              worker_id: wId,
              department_id: affectedDeptId,
              total_count: total,
              leves, graves, muy_graves,
              ultimos_30: u30, ultimos_60: u60, ultimos_90: u90,
              reincidencias, riesgo_score,
              updated_at: now.toISOString(),
            }, { onConflict: 'worker_id' });
          }
        }

        // 8. Fire-and-forget: recalculate department stats via analytics cron
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        fetch(`${supabaseUrl}/functions/v1/incidencias-analytics-cron`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
        }).catch(() => {});

        await writeIncidenciasLog('eliminar_incidencia', recordId, null, `Eliminada permanentemente por admin ${manager.name}`, {});
        return okResponse({ success: true });
      }

      // =============================================
      // INCIDENCIA RECORDS
      // =============================================
      case 'createIncidencia': {
        const { departmentId, categoryId, customCategoryName, workerIds, fecha, descripcion, pruebasUrls, accionPropuesta, propuestaSuspension, propuestaFechaInicio } = body;
        if (!Array.isArray(workerIds) || workerIds.length === 0) return errorResponse('At least one worker required');

        // Strict validations (evidence is optional)
        const validPruebasUrls = Array.isArray(pruebasUrls) ? pruebasUrls : [];
        if (!fecha || isNaN(Date.parse(fecha))) {
          return errorResponse('Fecha válida obligatoria');
        }
        if (!categoryId || typeof categoryId !== 'string' || categoryId.length < 10) {
          return errorResponse('Categoría obligatoria');
        }
        const needsDescription = accionPropuesta && accionPropuesta !== 'solo_incidencia';
        if (needsDescription && (!descripcion || typeof descripcion !== 'string' || descripcion.trim().length < 20)) {
          return errorResponse('Descripción mínima de 20 caracteres');
        }

        const [{ count: recentCount }, resolvedWorkers] = await Promise.all([
          supabase
            .from('incidencias_records')
            .select('id', { count: 'exact', head: true })
            .eq('created_by_id', manager.id)
            .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()),
          resolveIncidenciaWorkers(workerIds),
        ]);

        if ((recentCount || 0) >= 30) {
          return errorResponse('Demasiadas incidencias en poco tiempo. Espera unos minutos.');
        }

        const resolvedDepartmentId = resolvedWorkers.resolvedDepartmentId || departmentId || null;
        if (!resolvedDepartmentId) {
          return errorResponse('No se ha podido determinar el departamento de la incidencia');
        }

        if (!await validateIncidenciasDeptAccess(resolvedDepartmentId)) {
          return errorResponse('Access denied to this department');
        }

        const syncedDepartment = await ensureIncidenciasDepartmentExists(resolvedDepartmentId);
        if (!syncedDepartment) {
          return errorResponse('El departamento del trabajador no está sincronizado en incidencias');
        }

        const { data: categoryData, error: categoryError } = await supabase
          .from('incidencias_categories')
          .select('id, department_id')
          .eq('id', categoryId)
          .maybeSingle();

        if (categoryError) return errorResponse('Error validando categoría: ' + categoryError.message);
        if (!categoryData) return errorResponse('Categoría no encontrada');
        if (categoryData.department_id && categoryData.department_id !== resolvedDepartmentId) {
          return errorResponse('La categoría seleccionada no pertenece al departamento del trabajador');
        }

        // Create record
        const { data: record, error: recError } = await supabase
          .from('incidencias_records')
          .insert({
            department_id: resolvedDepartmentId,
            category_id: categoryData.id,
            custom_category_name: customCategoryName?.trim() || null,
            fecha: fecha || new Date().toISOString(),
            descripcion: descripcion || null,
            estado: (accionPropuesta === 'solo_incidencia' || !accionPropuesta) ? 'archivada' : 'abierta',
            created_by_id: manager.id,
            created_by_name: manager.name,
            pruebas_urls: validPruebasUrls,
            accion_propuesta: accionPropuesta || 'solo_incidencia',
            propuesta_suspension: propuestaSuspension || false,
            propuesta_fecha_inicio: propuestaFechaInicio || null,
          })
          .select()
          .single();

        if (recError) return errorResponse('Failed to create incidencia: ' + recError.message);

        const workerRows = resolvedWorkers.workerRows.map((worker) => ({
          record_id: record.id,
          worker_id: worker.worker_id,
          worker_name: worker.worker_name,
          worker_number: worker.worker_number,
        }));

        if (workerRows.length > 0) {
          const { error: wError } = await supabase
            .from('incidencias_record_workers')
            .insert(workerRows);
          if (wError) console.error('Failed to link workers:', wError);
        }

        // Audit log (fire-and-forget)
        writeIncidenciasLog('crear_incidencia', record.id, null, `Creada por ${manager.name} con ${workerRows.length} trabajadores`, { departmentId: resolvedDepartmentId, accionPropuesta });

        // Auto-create propuesta if accionPropuesta is amonestacion or sancion
        // IMPORTANT: when there are multiple workers, create ONE INDEPENDENT propuesta
        // per worker so each person has their own approval/sanction lifecycle.
        let propuesta = null;
        const propuestasCreadas: any[] = [];
        if (accionPropuesta === 'amonestacion_escrita' || accionPropuesta === 'amonestacion' || accionPropuesta === 'sancion') {
          const isAmonestacion = accionPropuesta === 'amonestacion_escrita' || accionPropuesta === 'amonestacion';

          // Fetch gravedad once (same category for the whole record)
          let gravedad = 'leve';
          if (!isAmonestacion && categoryId) {
            const { data: catData } = await supabase
              .from('incidencias_categories')
              .select('gravedad')
              .eq('id', categoryId)
              .maybeSingle();
            if (catData?.gravedad) gravedad = catData.gravedad;
          }

          const supabaseUrlProp = Deno.env.get('SUPABASE_URL')!;
          const supabaseServiceKeyProp = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

          // Build one independent propuesta per worker (always at least one row).
          const targets = resolvedWorkers.workerRows.length > 0
            ? resolvedWorkers.workerRows
            : [{ worker_id: null, worker_name: null, worker_number: null, department_id: resolvedDepartmentId }];

          for (const wRow of targets) {
            const { data: propData, error: propError } = await supabase
              .from('incidencias_propuestas_rrhh')
              .insert({
                record_id: record.id,
                department_id: wRow.department_id || resolvedDepartmentId,
                target_worker_id: wRow.worker_id || null,
                tipo: isAmonestacion ? 'amonestacion' : 'sancion',
                gravedad: isAmonestacion ? 'leve' : gravedad,
                estado: 'pendiente',
                fecha_inicio: propuestaFechaInicio || null,
                suspension_dias: null, // AI will propose days in the draft
              })
              .select()
              .single();

            if (propError) {
              console.error('Failed to create propuesta for worker', wRow.worker_id, propError);
              continue;
            }

            propuestasCreadas.push(propData);
            if (!propuesta) propuesta = propData; // keep first as legacy return

            const targetLabel = wRow.worker_name || 'sin trabajador';
            writeIncidenciasLog(
              'crear_propuesta',
              record.id,
              propData.id,
              `Propuesta de ${isAmonestacion ? 'amonestación' : 'sanción'} creada automáticamente para ${targetLabel}`,
              { gravedad: isAmonestacion ? null : gravedad, worker_id: wRow.worker_id, worker_name: wRow.worker_name },
            );

            // Fire-and-forget: auto-analyze each proposal with AI independently
            fetch(`${supabaseUrlProp}/functions/v1/incidencias-operations`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKeyProp}`,
                'apikey': supabaseServiceKeyProp,
              },
              body: JSON.stringify({ action: 'analyzeProposal', sessionToken: body.sessionToken, propuestaId: propData.id }),
            }).catch(e => console.error('[createIncidencia] Background AI proposal analysis failed:', e));
          }
        }

        // ── Real-time escalation evaluation (synchronous) ──
        const autoEscalado: any[] = [];
        let autoPuntosForced = false;
        if (accionPropuesta === 'solo_incidencia' || !accionPropuesta) {
          try {
            // Load escalation rules (department-specific + global)
            const [{ data: deptRuleRow }, { data: globalRuleRow }] = await Promise.all([
              supabase.from('incidencias_reglas_departamento').select('*, escalado_reglas, umbral_leves, umbral_graves, umbral_muy_graves, periodo_dias_evaluacion').eq('department_id', resolvedDepartmentId).maybeSingle(),
              supabase.from('incidencias_reglas_globales').select('*, escalado_reglas, umbral_leves, umbral_graves, umbral_muy_graves, periodo_dias_evaluacion').limit(1).maybeSingle(),
            ]);

            // ── Points system evaluation ──
            const puntosActivo = (deptRuleRow?.sistema_puntos_activo ?? globalRuleRow?.sistema_puntos_activo) !== false;
            const currentCatData = await supabase.from('incidencias_categories').select('puntos, es_critico, consecuencia_critico, gravedad').eq('id', categoryData.id).maybeSingle();
            const catPuntos = currentCatData.data?.puntos ?? 1;
            const catEsCritico = currentCatData.data?.es_critico === true;
            const catConsecuencia = currentCatData.data?.consecuencia_critico || 'sancion';

            if (puntosActivo) {
              const umbralPuntos = deptRuleRow?.umbral_amonestacion_puntos ?? globalRuleRow?.umbral_amonestacion_puntos ?? 80;
              const periodoPuntosDias = deptRuleRow?.periodo_puntos_dias ?? globalRuleRow?.periodo_puntos_dias ?? 365;
              const puntosLeve = deptRuleRow?.puntos_leve ?? globalRuleRow?.puntos_leve ?? 1;
              const puntosModera = deptRuleRow?.puntos_moderada ?? globalRuleRow?.puntos_moderada ?? 10;
              const puntosGrave = deptRuleRow?.puntos_grave ?? globalRuleRow?.puntos_grave ?? 25;
              const puntosMuyGrave = deptRuleRow?.puntos_muy_grave ?? globalRuleRow?.puntos_muy_grave ?? 80;
              const puntosMap: Record<string, number> = { leve: puntosLeve, moderada: puntosModera, grave: puntosGrave, muy_grave: puntosMuyGrave };

              const periodStart = new Date(Date.now() - periodoPuntosDias * 24 * 60 * 60 * 1000).toISOString();

              for (const wRow of resolvedWorkers.workerRows) {
                // Check critico first
                if (catEsCritico) {
                  autoPuntosForced = true;
                  autoEscalado.push({
                    workerId: wRow.worker_id,
                    workerName: wRow.worker_name,
                    ruleDescription: `Categoría crítica: fuerza ${catConsecuencia === 'sancion' ? 'sanción' : 'amonestación'} directa`,
                    recommendedAction: catConsecuencia === 'sancion' ? 'sancion' : 'amonestacion',
                    urgency: 'critical',
                    periodDays: periodoPuntosDias,
                    counts: { leve: 0, grave: 0, muy_grave: 0 },
                    thresholds: { leves: 0, graves: 0, muy_graves: 0 },
                    autoPuntos: true,
                    esCritico: true,
                  });
                  continue;
                }

                // Calculate accumulated points
                const { data: workerPeriodRecs } = await supabase
                  .from('incidencias_records')
                  .select('id, incidencias_categories(gravedad, puntos)')
                  .eq('department_id', resolvedDepartmentId)
                  .gte('fecha', periodStart)
                  .is('deleted_at', null);

                if (workerPeriodRecs) {
                  const recIds = workerPeriodRecs.map((r: any) => r.id);
                  const { data: wLinks } = await supabase
                    .from('incidencias_record_workers')
                    .select('record_id')
                    .eq('worker_id', wRow.worker_id)
                    .in('record_id', recIds.length > 0 ? recIds : ['__none__']);

                  const workerRecIds = new Set((wLinks || []).map((l: any) => l.record_id));
                  let totalPuntos = 0;
                  for (const rec of workerPeriodRecs) {
                    if (!workerRecIds.has(rec.id)) continue;
                    const cat = rec.incidencias_categories as any;
                    totalPuntos += cat?.puntos ?? puntosMap[cat?.gravedad || 'leve'] ?? 1;
                  }

                  const newTotal = totalPuntos + catPuntos;
                  if (newTotal >= umbralPuntos) {
                    autoPuntosForced = true;
                    autoEscalado.push({
                      workerId: wRow.worker_id,
                      workerName: wRow.worker_name,
                      ruleDescription: `Acumulación de ${newTotal} puntos (umbral: ${umbralPuntos}) en ${periodoPuntosDias} días`,
                      recommendedAction: 'amonestacion',
                      urgency: 'critical',
                      periodDays: periodoPuntosDias,
                      counts: { leve: 0, grave: 0, muy_grave: 0 },
                      thresholds: { leves: 0, graves: 0, muy_graves: 0 },
                      autoPuntos: true,
                      totalPuntos: newTotal,
                      umbralPuntos,
                    });
                  }
                }
              }
            }

            const escaladoRules = (deptRuleRow?.escalado_reglas && Array.isArray(deptRuleRow.escalado_reglas) && deptRuleRow.escalado_reglas.length > 0)
              ? deptRuleRow.escalado_reglas as any[]
              : (globalRuleRow?.escalado_reglas && Array.isArray(globalRuleRow.escalado_reglas) ? globalRuleRow.escalado_reglas as any[] : []);

            const thresholds = {
              leves: deptRuleRow?.umbral_leves ?? globalRuleRow?.umbral_leves ?? 3,
              graves: deptRuleRow?.umbral_graves ?? globalRuleRow?.umbral_graves ?? 1,
              muy_graves: deptRuleRow?.umbral_muy_graves ?? globalRuleRow?.umbral_muy_graves ?? 1,
              periodDays: deptRuleRow?.periodo_dias_evaluacion ?? globalRuleRow?.periodo_dias_evaluacion ?? 90,
            };

            // Evaluate each worker
            for (const wRow of resolvedWorkers.workerRows) {
              // Check escalado chain rules first
              for (const rule of escaladoRules) {
                if (!rule.activa) continue;
                const periodStart = new Date(Date.now() - (rule.periodo_dias || 90) * 24 * 60 * 60 * 1000).toISOString();

                // Count matching records for this worker in period
                let query = supabase
                  .from('incidencias_records')
                  .select('id, category_id, incidencias_categories(gravedad)', { count: 'exact', head: false })
                  .eq('department_id', resolvedDepartmentId)
                  .gte('fecha', periodStart)
                  .is('deleted_at', null);

                if (rule.tipo_origen === 'incidencia') query = query.eq('tipo', 'incidencia');
                else if (rule.tipo_origen === 'amonestacion') query = query.eq('tipo', 'amonestacion');

                if (rule.categoria_id) query = query.eq('category_id', rule.categoria_id);

                // Get records and filter by worker
                let periodRecords: any[] = [];
                const { data: rawPeriodRecords } = await query;
                if (!rawPeriodRecords) continue;

                // Filter by gravedad if specified
                if (rule.gravedad_origen && rule.gravedad_origen !== 'cualquiera') {
                  periodRecords = rawPeriodRecords.filter((r: any) => (r.incidencias_categories as any)?.gravedad === rule.gravedad_origen);
                } else {
                  periodRecords = rawPeriodRecords;
                }

                const recIds = periodRecords.map((r: any) => r.id);
                if (recIds.length === 0) continue;

                const { data: workerLinks } = await supabase
                  .from('incidencias_record_workers')
                  .select('record_id')
                  .eq('worker_id', wRow.worker_id)
                  .in('record_id', recIds);

                const workerRecordCount = (workerLinks || []).length;
                const umbral = rule.umbral_cantidad || 5;

                if (workerRecordCount >= umbral) {
                  autoEscalado.push({
                    workerId: wRow.worker_id,
                    workerName: wRow.worker_name,
                    ruleDescription: `${workerRecordCount} ${rule.tipo_origen || 'registro'}(s)${rule.gravedad_origen && rule.gravedad_origen !== 'cualquiera' ? ` ${rule.gravedad_origen}` : ''} en ${rule.periodo_dias || 90} días`,
                    recommendedAction: rule.accion_resultado === 'amonestacion' ? 'amonestacion' : 'sancion',
                    accionResultado: rule.accion_resultado,
                    count: workerRecordCount,
                    threshold: umbral,
                    periodDays: rule.periodo_dias || 90,
                    counts: { leve: 0, grave: 0, muy_grave: 0 },
                    thresholds: {
                      leves: thresholds.leves,
                      graves: thresholds.graves,
                      muy_graves: thresholds.muy_graves,
                    },
                    urgency: 'critical',
                  });
                  break; // One match per worker is enough
                }
              }

              // If no escalado rule matched, check basic thresholds (approaching ≥80%)
              if (!autoEscalado.find(e => e.workerId === wRow.worker_id)) {
                const periodStart = new Date(Date.now() - thresholds.periodDays * 24 * 60 * 60 * 1000).toISOString();
                const { data: workerPeriodRecords } = await supabase
                  .from('incidencias_records')
                  .select('id, incidencias_categories(gravedad)')
                  .eq('department_id', resolvedDepartmentId)
                  .gte('fecha', periodStart)
                  .is('deleted_at', null);

                if (workerPeriodRecords && workerPeriodRecords.length > 0) {
                  const recIds = workerPeriodRecords.map((r: any) => r.id);
                  const { data: wLinks } = await supabase
                    .from('incidencias_record_workers')
                    .select('record_id')
                    .eq('worker_id', wRow.worker_id)
                    .in('record_id', recIds);

                  const workerRecIds = new Set((wLinks || []).map((l: any) => l.record_id));
                  const counts = { leve: 0, grave: 0, muy_grave: 0 };
                  for (const rec of workerPeriodRecords) {
                    if (!workerRecIds.has(rec.id)) continue;
                    const g = (rec.incidencias_categories as any)?.gravedad || 'leve';
                    counts[g as keyof typeof counts]++;
                  }

                  const pctLeve = thresholds.leves > 0 ? counts.leve / thresholds.leves : 0;
                  const pctGrave = thresholds.graves > 0 ? counts.grave / thresholds.graves : 0;
                  const pctMuyGrave = thresholds.muy_graves > 0 ? counts.muy_grave / thresholds.muy_graves : 0;
                  const maxPct = Math.max(pctLeve, pctGrave, pctMuyGrave);
                  const exceeded = pctLeve >= 1 || pctGrave >= 1 || pctMuyGrave >= 1;

                  if (maxPct >= 0.8) {
                    autoEscalado.push({
                      workerId: wRow.worker_id,
                      workerName: wRow.worker_name,
                      ruleDescription: exceeded
                        ? `Umbral superado: ${counts.leve} leves, ${counts.grave} graves, ${counts.muy_grave} muy graves en ${thresholds.periodDays} días`
                        : `Próximo al umbral: ${counts.leve} leves, ${counts.grave} graves, ${counts.muy_grave} muy graves en ${thresholds.periodDays} días`,
                      recommendedAction: 'amonestacion',
                      count: counts.leve + counts.grave + counts.muy_grave,
                      threshold: thresholds.leves,
                      periodDays: thresholds.periodDays,
                      counts,
                      thresholds: {
                        leves: thresholds.leves,
                        graves: thresholds.graves,
                        muy_graves: thresholds.muy_graves,
                      },
                      urgency: exceeded ? 'critical' : 'warning',
                    });
                  }
                }
              }
            }
          } catch (escaladoErr) {
            console.error('[createIncidencia] Escalado evaluation error:', escaladoErr);
          }
        }

        // Fire-and-forget: trigger AI evaluation in background via self-call
        if (record.id) {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          fetch(`${supabaseUrl}/functions/v1/incidencias-operations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'apikey': supabaseServiceKey,
            },
            body: JSON.stringify({ action: 'evaluateIncidencia', sessionToken: body.sessionToken, recordId: record.id }),
          }).catch(e => console.error('[createIncidencia] Background AI eval failed:', e));

          // Fire-and-forget: push notifications to managers of this department
          fetch(`${supabaseUrl}/functions/v1/incidencias-push-notify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'apikey': supabaseServiceKey,
            },
            body: JSON.stringify({
              departmentId,
              title: 'Nueva incidencia registrada',
              pushBody: `${manager.name} ha registrado una nueva incidencia`,
            }),
          }).catch(e => console.error('[createIncidencia] Push notify failed:', e));
        }

        return okResponse({ record, workerCount: workerRows.length, propuesta, propuestas: propuestasCreadas, autoEscalado: autoEscalado.length > 0 ? autoEscalado : undefined });
      }

      case 'listIncidencias': {
        const { departmentId, departmentIds: explicitDeptIds, workerTeamIds: listWorkerTeamIds, filtro, categoryId: filterCatId, limit: queryLimit, offset, accionPropuesta: filterAccion } = body;
        const deptIds = await getAccessibleDeptIds();

        let query = supabase
          .from('incidencias_records')
          .select('*, incidencias_categories(id, name, color, gravedad)')
          .is('deleted_at', null)
          .eq('worker_pending', false)
          .order('fecha', { ascending: false });

        if (departmentId) {
          if (!await validateIncidenciasDeptAccess(departmentId)) {
            return errorResponse('Access denied');
          }
          query = query.eq('department_id', departmentId);
        } else if (Array.isArray(explicitDeptIds) && explicitDeptIds.length > 0) {
          // Explicit department filter (used in preview mode / encargado context)
          query = query.in('department_id', explicitDeptIds);
        } else if (deptIds) {
          if (deptIds.length === 0) return okResponse({ records: [] });
          query = query.in('department_id', deptIds);
        }

        const now = new Date();
        if (filtro === 'hoy') {
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          query = query.gte('fecha', todayStart);
        } else if (filtro === 'semana') {
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay() + 1);
          weekStart.setHours(0, 0, 0, 0);
          query = query.gte('fecha', weekStart.toISOString());
        } else if (filtro === 'mes') {
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          query = query.gte('fecha', monthStart);
        }

        if (filterCatId) {
          query = query.eq('category_id', filterCatId);
        }

        if (filterAccion === 'propuestas') {
          query = query.neq('accion_propuesta', 'solo_incidencia');
        }

        query = query.range(offset || 0, (offset || 0) + (queryLimit || 20) - 1);

        const { data: records, error: listErr } = await query;
        if (listErr) return errorResponse('Failed to list incidencias: ' + listErr.message);

        const recordIds = (records || []).map(r => r.id);
        const recordWorkers: Record<string, Array<{ worker_name: string; worker_number: string | null; worker_id: string }>> = {};
        if (recordIds.length > 0) {
          const { data: rw } = await supabase
            .from('incidencias_record_workers')
            .select('record_id, worker_id, worker_name, worker_number')
            .in('record_id', recordIds);
          if (rw) {
            for (const w of rw) {
              if (!recordWorkers[w.record_id]) recordWorkers[w.record_id] = [];
              recordWorkers[w.record_id].push({ worker_name: w.worker_name, worker_number: w.worker_number, worker_id: w.worker_id });
            }
          }
        }

        // Filter by workerTeamIds if provided (responsable isolation)
        let filteredRecords = records || [];
        if (Array.isArray(listWorkerTeamIds) && listWorkerTeamIds.length > 0) {
          const { data: teamWorkers } = await supabase
            .from('workers')
            .select('id')
            .in('worker_team_id', listWorkerTeamIds)
            .is('deleted_at', null);
          const allowedWorkerIds = new Set((teamWorkers || []).map(w => w.id));
          // Keep only records that have at least one worker in the allowed set
          filteredRecords = filteredRecords.filter(r => {
            const rw = recordWorkers[r.id] || [];
            return rw.some(w => allowedWorkerIds.has(w.worker_id));
          });
        }

        const deptIdSet = [...new Set(filteredRecords.map(r => r.department_id))];
        let deptNames: Record<string, string> = {};
        if (deptIdSet.length > 0) {
          const { data: depts } = await supabase
            .from('incidencias_departments')
            .select('id, name')
            .in('id', deptIdSet);
          if (depts) deptNames = Object.fromEntries(depts.map(d => [d.id, d.name]));
        }

        // Enrich with linked proposal info (id + estado)
        const proposalInfoByRecordId: Record<string, { proposal_id: string; proposal_estado: string }> = {};
        const filteredRecordIds = filteredRecords.map(r => r.id);
        if (filteredRecordIds.length > 0) {
          const { data: linkedProps } = await supabase
            .from('incidencias_propuestas_rrhh')
            .select('id, record_id, estado')
            .in('record_id', filteredRecordIds)
            .neq('estado', 'rechazada')
            .order('created_at', { ascending: false });
          for (const p of (linkedProps || [])) {
            if (!proposalInfoByRecordId[p.record_id]) {
              proposalInfoByRecordId[p.record_id] = { proposal_id: p.id, proposal_estado: p.estado };
            }
          }
        }

        // Enrich with legal document info (PDF + tipo + gravedad_final)
        const legalDocByRecordId: Record<string, { id: string; pdf_url: string | null; draft_pdf_url: string | null; scanned_signed_pdf_url: string | null; tipo: string | null; gravedad_final: string | null; suspension: boolean; dias_suspension: number | null; firmado: boolean; anulado: boolean }> = {};
        const proposalIds = Object.values(proposalInfoByRecordId).map(p => p.proposal_id);
        if (proposalIds.length > 0) {
          const { data: legalDocs } = await supabase
            .from('incidencias_legal_documents')
            .select('id, propuesta_id, pdf_url, draft_pdf_url, html_content, tipo, gravedad_final, suspension, dias_suspension, firmado, anulado')
            .in('propuesta_id', proposalIds)
            .order('created_at', { ascending: false });
          // Map propuesta_id -> doc
          const docByProp: Record<string, any> = {};
          for (const d of (legalDocs || [])) {
            if (!docByProp[d.propuesta_id]) docByProp[d.propuesta_id] = d;
          }

          // Fetch scanned signed PDF paths from firma_tasks
          const docIds = Object.values(docByProp).map((d: any) => d.id);
          const scannedByDocId: Record<string, string> = {};
          if (docIds.length > 0) {
            const { data: firmaTasks } = await supabase
              .from('incidencias_firma_tasks')
              .select('legal_document_id, scanned_signed_pdf_url')
              .in('legal_document_id', docIds);
            const paths = (firmaTasks || []).filter(t => t.scanned_signed_pdf_url);
            // Generate signed URLs in parallel
            await Promise.all(paths.map(async (t) => {
              const { data: signed } = await supabase.storage
                .from('incidencias-pruebas')
                .createSignedUrl(t.scanned_signed_pdf_url, 3600);
              if (signed?.signedUrl) scannedByDocId[t.legal_document_id] = signed.signedUrl;
            }));
          }
          for (const d of Object.values(docByProp) as any[]) {
            d.scanned_signed_pdf_url = scannedByDocId[d.id] || null;
          }

          for (const [recordId, info] of Object.entries(proposalInfoByRecordId)) {
            const d = docByProp[info.proposal_id];
            if (d) legalDocByRecordId[recordId] = d;
          }
        }

        const enriched = filteredRecords.map(r => {
          const ld = legalDocByRecordId[r.id] || null;
          // Safety net: if the legal document is firmado but the record's
          // firmada flag is still false (legacy data), reflect it as true and
          // schedule a background DB sync so future calls are correct too.
          let firmadaFinal = (r as any).firmada;
          if (ld && ld.firmado === true && firmadaFinal === false) {
            firmadaFinal = true;
            supabase
              .from('incidencias_records')
              .update({ firmada: true })
              .eq('id', r.id)
              .then(() => {})
              .catch(() => {});
          }
          return {
            ...r,
            firmada: firmadaFinal,
            workers: recordWorkers[r.id] || [],
            department_name: deptNames[r.department_id] || '',
            proposal_id: proposalInfoByRecordId[r.id]?.proposal_id || null,
            proposal_estado: proposalInfoByRecordId[r.id]?.proposal_estado || null,
            legal_document: ld,
          };
        });

        return okResponse({ records: enriched });
      }

      case 'getDashboardStats': {
        const { departmentIds: explicitDashDeptIds, workerTeamIds: dashWorkerTeamIds } = body;
        let deptIds = await getAccessibleDeptIds();
        // If explicit departmentIds provided (e.g. preview mode), use those instead
        if (Array.isArray(explicitDashDeptIds) && explicitDashDeptIds.length > 0) {
          deptIds = explicitDashDeptIds;
        }

        // For responsables with workerTeamIds, get the list of worker IDs in those teams
        let responsableWorkerIds: string[] | null = null;
        if (Array.isArray(dashWorkerTeamIds) && dashWorkerTeamIds.length > 0) {
          const { data: teamWorkers } = await supabase
            .from('workers')
            .select('id')
            .in('worker_team_id', dashWorkerTeamIds)
            .is('deleted_at', null);
          responsableWorkerIds = (teamWorkers || []).map(w => w.id);
        }

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay() + 1);
        weekStart.setHours(0, 0, 0, 0);

        // Helper: get record IDs filtered by dept AND optionally by responsable's workers
        async function getFilteredRecordIds(extraFilter?: (q: any) => any): Promise<string[] | null> {
          if (!responsableWorkerIds) return null; // no worker filtering needed
          // Get records in the department
          let q = supabase.from('incidencias_records').select('id').is('deleted_at', null).eq('worker_pending', false);
          if (deptIds && deptIds.length > 0) q = q.in('department_id', deptIds);
          if (extraFilter) q = extraFilter(q);
          const { data: records } = await q;
          const recordIds = (records || []).map(r => r.id);
          if (recordIds.length === 0) return [];
          // Filter to only records that involve the responsable's workers
          const { data: rw } = await supabase
            .from('incidencias_record_workers')
            .select('record_id')
            .in('record_id', recordIds)
            .in('worker_id', responsableWorkerIds!);
          return [...new Set((rw || []).map(r => r.record_id))];
        }

        // Today count
        let todayCount = 0;
        {
          if (responsableWorkerIds) {
            const filtered = await getFilteredRecordIds((q: any) => q.gte('fecha', todayStart));
            todayCount = filtered?.length || 0;
          } else {
            let q = supabase.from('incidencias_records').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('worker_pending', false).gte('fecha', todayStart);
            if (deptIds && deptIds.length > 0) q = q.in('department_id', deptIds);
            const { count } = await q;
            todayCount = count || 0;
          }
        }

        // Week count
        let weekCount = 0;
        {
          if (responsableWorkerIds) {
            const filtered = await getFilteredRecordIds((q: any) => q.gte('fecha', weekStart.toISOString()));
            weekCount = filtered?.length || 0;
          } else {
            let q = supabase.from('incidencias_records').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('worker_pending', false).gte('fecha', weekStart.toISOString());
            if (deptIds && deptIds.length > 0) q = q.in('department_id', deptIds);
            const { count } = await q;
            weekCount = count || 0;
          }
        }

        // Total count
        let totalCount = 0;
        {
          if (responsableWorkerIds) {
            const filtered = await getFilteredRecordIds();
            totalCount = filtered?.length || 0;
          } else {
            let q = supabase.from('incidencias_records').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('worker_pending', false);
            if (deptIds && deptIds.length > 0) q = q.in('department_id', deptIds);
            const { count } = await q;
            totalCount = count || 0;
          }
        }

        // AI processed count
        let aiProcessedCount = 0;
        {
          let q = supabase.from('incidencias_records').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('worker_pending', false).not('ai_processed_at', 'is', null);
          if (deptIds && deptIds.length > 0) q = q.in('department_id', deptIds);
          const { count } = await q;
          aiProcessedCount = count || 0;
        }

        // Propuestas stats
        const propuestasStats = { pendientes: 0, aprobadas: 0, enviadas: 0, rechazadas: 0 };
        {
          const { data: allProp } = await supabase.from('incidencias_propuestas_rrhh').select('estado');
          for (const p of (allProp || [])) {
            if (p.estado === 'pendiente') propuestasStats.pendientes++;
            else if (p.estado === 'aprobada') propuestasStats.aprobadas++;
            else if (p.estado === 'enviada') propuestasStats.enviadas++;
            else if (p.estado === 'rechazada') propuestasStats.rechazadas++;
          }
        }

        // Reincidentes + topReincidentes with risk score
        let reincidentesCount = 0;
        let topReincidentes: Array<{ worker_name: string; worker_id: string; worker_number: string | null; count: number; riesgo: number }> = [];
        {
          let accessibleIds: string[] | null = null;
          if (responsableWorkerIds) {
            // Use the filtered record IDs for responsable
            accessibleIds = await getFilteredRecordIds() || [];
          } else if (deptIds && deptIds.length > 0) {
            const { data: accessibleRecords } = await supabase
              .from('incidencias_records')
              .select('id')
              .is('deleted_at', null)
              .in('department_id', deptIds);
            accessibleIds = (accessibleRecords || []).map(r => r.id);
          }

          // Skip query entirely when we know there are no accessible records
          if (accessibleIds !== null && accessibleIds.length === 0) {
            reincidentesCount = 0;
            topReincidentes = [];
          } else {
            let rwQuery = supabase.from('incidencias_record_workers').select('worker_id, worker_name, worker_number');
            if (accessibleIds !== null && accessibleIds.length > 0) {
              rwQuery = rwQuery.in('record_id', accessibleIds);
            }
            // For responsable, also filter the workers themselves
            if (responsableWorkerIds && responsableWorkerIds.length > 0) {
              rwQuery = rwQuery.in('worker_id', responsableWorkerIds);
            }

            const { data: rw } = await rwQuery;
            const workerCounts: Record<string, { name: string; number: string | null; count: number }> = {};
            for (const w of (rw || [])) {
              if (!workerCounts[w.worker_id]) {
                workerCounts[w.worker_id] = { name: w.worker_name, number: w.worker_number || null, count: 0 };
              }
              workerCounts[w.worker_id].count++;
            }
            reincidentesCount = Object.values(workerCounts).filter(c => c.count >= 3).length;
            topReincidentes = Object.entries(workerCounts)
              .map(([id, v]) => ({
                worker_id: id,
                worker_name: v.name,
                worker_number: v.number,
                count: v.count,
                riesgo: Math.min(100, Math.round((v.count / 3) * 100)),
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 10)
              .filter(w => w.count > 0);
          }
        }

        // Top category
        let topCategory = '';
        {
          let q = supabase.from('incidencias_records').select('category_id').is('deleted_at', null).eq('worker_pending', false);
          if (deptIds && deptIds.length > 0) q = q.in('department_id', deptIds);
          const { data: recs } = await q;
          const catCounts: Record<string, number> = {};
          for (const r of (recs || [])) {
            if (r.category_id) catCounts[r.category_id] = (catCounts[r.category_id] || 0) + 1;
          }
          const topCatId = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
          if (topCatId) {
            const { data: cat } = await supabase.from('incidencias_categories').select('name').eq('id', topCatId).single();
            topCategory = cat?.name || '';
          }
        }

        // Last 5 records
        let lastRecords: unknown[] = [];
        {
          let q = supabase.from('incidencias_records')
            .select('*, incidencias_categories(id, name, color, gravedad)')
            .is('deleted_at', null)
            .eq('worker_pending', false)
            .order('fecha', { ascending: false })
            .limit(5);
          if (deptIds && deptIds.length > 0) q = q.in('department_id', deptIds);
          const { data } = await q;
          const ids = (data || []).map(r => r.id);
          const rwMap: Record<string, Array<{ worker_name: string; worker_number: string | null }>> = {};
          if (ids.length > 0) {
            const { data: rw } = await supabase
              .from('incidencias_record_workers')
              .select('record_id, worker_name, worker_number')
              .in('record_id', ids);
            for (const w of (rw || [])) {
              if (!rwMap[w.record_id]) rwMap[w.record_id] = [];
              rwMap[w.record_id].push({ worker_name: w.worker_name, worker_number: w.worker_number });
            }
          }
          lastRecords = (data || []).map(r => ({ ...r, workers: rwMap[r.id] || [] }));
        }

        // By gravedad
        const byGravedad = { leve: 0, grave: 0, muy_grave: 0 };
        {
          let q = supabase.from('incidencias_records').select('category_id').is('deleted_at', null).eq('worker_pending', false);
          if (deptIds && deptIds.length > 0) q = q.in('department_id', deptIds);
          const { data: recs } = await q;
          const catIds = [...new Set((recs || []).map(r => r.category_id).filter(Boolean))];
          if (catIds.length > 0) {
            const { data: cats } = await supabase.from('incidencias_categories').select('id, gravedad').in('id', catIds);
            const catGravedad = Object.fromEntries((cats || []).map(c => [c.id, c.gravedad]));
            for (const r of (recs || [])) {
              const g = catGravedad[r.category_id] || 'leve';
              byGravedad[g as keyof typeof byGravedad] = (byGravedad[g as keyof typeof byGravedad] || 0) + 1;
            }
          }
        }

        // Active departments count
        let activeDepartments = 0;
        {
          const { count } = await supabase.from('incidencias_departments').select('id', { count: 'exact', head: true }).eq('active', true);
          activeDepartments = count || 0;
        }

        // Propuestas pendientes count (from propuestas table)
        const propuestasPendientes = propuestasStats.pendientes;

        // Weekly trend (last 4 weeks)
        let weeklyTrend: Array<{ week: string; count: number }> = [];
        {
          const fourWeeksAgo = new Date();
          fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
          let q = supabase.from('incidencias_records').select('fecha').is('deleted_at', null).eq('worker_pending', false).gte('fecha', fourWeeksAgo.toISOString());
          if (deptIds && deptIds.length > 0) q = q.in('department_id', deptIds);
          const { data: trendRecs } = await q;
          const weekBuckets: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
          for (const r of (trendRecs || [])) {
            const daysAgo = Math.floor((Date.now() - new Date(r.fecha).getTime()) / (1000 * 60 * 60 * 24));
            const weekIdx = Math.min(3, Math.floor(daysAgo / 7));
            weekBuckets[3 - weekIdx] = (weekBuckets[3 - weekIdx] || 0) + 1;
          }
          weeklyTrend = [
            { week: 'Sem -3', count: weekBuckets[0] },
            { week: 'Sem -2', count: weekBuckets[1] },
            { week: 'Sem -1', count: weekBuckets[2] },
            { week: 'Actual', count: weekBuckets[3] },
          ];
        }

        // byTipo: distribution by accion_propuesta
        const byTipo = { solo_incidencia: 0, amonestacion_escrita: 0, sancion: 0 };
        {
          let q = supabase.from('incidencias_records').select('id, accion_propuesta').is('deleted_at', null).eq('worker_pending', false);
          if (deptIds && deptIds.length > 0) q = q.in('department_id', deptIds);
          const { data: tipoRecs } = await q;
          let filteredTipoRecs = tipoRecs || [];
          if (responsableWorkerIds && responsableWorkerIds.length > 0) {
            const allFilteredIds = await getFilteredRecordIds() || [];
            const idSet = new Set(allFilteredIds);
            filteredTipoRecs = filteredTipoRecs.filter(r => idSet.has(r.id));
          }
          for (const r of filteredTipoRecs) {
            const tipo = r.accion_propuesta || 'solo_incidencia';
            if (tipo === 'amonestacion_escrita') byTipo.amonestacion_escrita++;
            else if (tipo === 'sancion') byTipo.sancion++;
            else byTipo.solo_incidencia++;
          }
        }

        // byCategoria: top 6 categories with name, color, count
        let byCategoria: Array<{ name: string; color: string; count: number }> = [];
        {
          let q = supabase.from('incidencias_records').select('id, category_id').is('deleted_at', null).eq('worker_pending', false);
          if (deptIds && deptIds.length > 0) q = q.in('department_id', deptIds);
          const { data: catRecs } = await q;
          let filteredCatRecs = catRecs || [];
          if (responsableWorkerIds && responsableWorkerIds.length > 0) {
            const allFilteredIds = await getFilteredRecordIds() || [];
            const idSet = new Set(allFilteredIds);
            filteredCatRecs = filteredCatRecs.filter(r => idSet.has(r.id));
          }
          const catCounts: Record<string, number> = {};
          for (const r of filteredCatRecs) {
            if (r.category_id) catCounts[r.category_id] = (catCounts[r.category_id] || 0) + 1;
          }
          const topCatEntries = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
          if (topCatEntries.length > 0) {
            const catIds = topCatEntries.map(([id]) => id);
            const { data: cats } = await supabase.from('incidencias_categories').select('id, name, color').in('id', catIds);
            const catMap = Object.fromEntries((cats || []).map(c => [c.id, { name: c.name, color: c.color }]));
            byCategoria = topCatEntries.map(([id, count]) => ({
              name: catMap[id]?.name || 'Sin categoría',
              color: catMap[id]?.color || '#888888',
              count,
            }));
          }
        }

        return okResponse({
          todayCount,
          weekCount,
          totalCount,
          reincidentesCount,
          topReincidentes,
          topCategory,
          lastRecords,
          byGravedad,
          activeDepartments,
          propuestasPendientes,
          aiProcessedCount,
          propuestasStats,
          weeklyTrend,
          byTipo,
          byCategoria,
        });
      }

      case 'getWorkerIncidentCount': {
        const { departmentId: wcDeptId } = body;
        if (!wcDeptId) return errorResponse('departmentId required');
        if (!await validateIncidenciasDeptAccess(wcDeptId)) {
          return errorResponse('Access denied');
        }
        const { data: deptRecords } = await supabase
          .from('incidencias_records')
          .select('id')
          .eq('department_id', wcDeptId)
          .is('deleted_at', null);
        const recIds = (deptRecords || []).map(r => r.id);
        const counts: Record<string, number> = {};
        if (recIds.length > 0) {
          const { data: rw } = await supabase
            .from('incidencias_record_workers')
            .select('worker_id')
            .in('record_id', recIds);
          for (const w of (rw || [])) {
            counts[w.worker_id] = (counts[w.worker_id] || 0) + 1;
          }
        }
        return okResponse({ counts });
      }

      // =============================================
      // EVALUATE INCIDENCIA (AI + Rules) - IMPROVED
      // =============================================
      case 'evaluateIncidencia': {
        const { recordId } = body;
        if (!recordId) return errorResponse('recordId required');

        // Fetch record, workers, and rules in parallel
        const [recRes, recWorkersRes, rulesRes] = await Promise.all([
          supabase.from('incidencias_records').select('*, incidencias_categories(name, gravedad)').eq('id', recordId).single(),
          supabase.from('incidencias_record_workers').select('worker_id, worker_name, worker_number').eq('record_id', recordId),
          supabase.from('incidencias_reglas_departamento').select('*'),
        ]);

        const rec = recRes.data;
        if (recRes.error || !rec) return errorResponse('Record not found');
        const recWorkers = recWorkersRes.data || [];

        // Find matching rule
        const rules = (rulesRes.data || []).find((r: any) => r.department_id === rec.department_id) || null;

        const periodDays = rules?.periodo_dias_evaluacion || 90;
        const periodoStart = new Date();
        periodoStart.setDate(periodoStart.getDate() - periodDays);

        // Build detailed history for ALL workers in parallel (not sequentially)
        const workerIds = recWorkers.map(w => w.worker_id);
        let maxHistory = 0;
        const historialDetallado: Array<{ fecha: string; descripcion: string; gravedad: string }> = [];
        let riesgoReincidencia = 0;
        let allWorkerRecLinks: any[] = [];
        let prevRecords: any[] = [];

        if (workerIds.length > 0) {
          // Single query: get ALL record links for all workers at once
          const { data: _links } = await supabase
            .from('incidencias_record_workers')
            .select('record_id, worker_id')
            .in('worker_id', workerIds);
          allWorkerRecLinks = _links || [];

          const allRecordIds = [...new Set(allWorkerRecLinks.map(r => r.record_id).filter(id => id !== recordId))];

          if (allRecordIds.length > 0) {
            const [_recordsRes, _proposalsRes] = await Promise.all([
              supabase
                .from('incidencias_records')
                .select('id, fecha, descripcion, incidencias_categories(name, gravedad)')
                .in('id', allRecordIds.slice(0, 100))
                .gte('fecha', periodoStart.toISOString())
                .order('fecha', { ascending: false }),
              supabase
                .from('incidencias_propuestas_rrhh')
                .select('record_id, gravedad')
                .in('record_id', allRecordIds.slice(0, 100)),
            ]);
            prevRecords = _recordsRes.data || [];
            const prevProposalMap = new Map<string, string>();
            for (const pp of (_proposalsRes.data || [])) {
              if (pp.record_id && pp.gravedad) prevProposalMap.set(pp.record_id, pp.gravedad);
            }

            // Map records to workers
            const recordsByWorker = new Map<string, any[]>();
            for (const link of allWorkerRecLinks) {
              if (link.record_id === recordId) continue;
              if (!recordsByWorker.has(link.worker_id)) recordsByWorker.set(link.worker_id, []);
              const rec2 = prevRecords.find(r => r.id === link.record_id);
              if (rec2) recordsByWorker.get(link.worker_id)!.push(rec2);
            }

            for (const w of recWorkers) {
              const wRecords = recordsByWorker.get(w.worker_id) || [];
              const periodCount = wRecords.length;
              if (periodCount > maxHistory) maxHistory = periodCount;

              for (const pr of wRecords) {
                // Prefer proposal gravedad (actual applied) over category gravedad
                const realGravedad = prevProposalMap.get(pr.id) || (pr.incidencias_categories as any)?.gravedad || 'desconocida';
                historialDetallado.push({
                  fecha: new Date(pr.fecha).toLocaleDateString('es-ES'),
                  descripcion: pr.descripcion || 'Sin descripción',
                  gravedad: realGravedad,
                });
              }

              // Calculate risk score using real applied severity
              if (rules) {
                const counts = { leve: 0, grave: 0, muy_grave: 0 };
                for (const pr of wRecords) {
                  const g = prevProposalMap.get(pr.id) || (pr.incidencias_categories as any)?.gravedad || 'leve';
                  counts[g as keyof typeof counts]++;
                }
                const maxRatio = Math.max(
                  rules.umbral_leves > 0 ? counts.leve / rules.umbral_leves : 0,
                  rules.umbral_graves > 0 ? counts.grave / rules.umbral_graves : 0,
                  rules.umbral_muy_graves > 0 ? counts.muy_grave / rules.umbral_muy_graves : 0,
                );
                riesgoReincidencia = Math.max(riesgoReincidencia, Math.min(100, Math.round(maxRatio * 100)));
              } else {
                riesgoReincidencia = Math.max(riesgoReincidencia, Math.min(100, Math.round((periodCount / 3) * 100)));
              }
            }
          }
        }

        // Call AI for classification with detailed history
        let aiData: any = null;
        try {
          const supabaseUrl2 = Deno.env.get('SUPABASE_URL')!;
          const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

          const aiRes = await fetch(`${supabaseUrl2}/functions/v1/control-incidencias-ai`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({
              action: 'clasificar',
              descripcion: rec.descripcion || '',
              categoria_encargado: rec.incidencias_categories?.name || '',
              contexto_trabajador: {
                historial_incidencias: maxHistory,
              },
              historial_detallado: historialDetallado.slice(0, 20), // limit to 20 most recent
            }),
          });

          if (aiRes.ok) {
            aiData = await aiRes.json();
            // Use AI risk if provided, otherwise use calculated
            const finalRiesgo = aiData.riesgo_reincidencia ?? riesgoReincidencia;

            await supabase
              .from('incidencias_records')
              .update({
                ai_gravedad_sugerida: aiData.gravedad_sugerida || null,
                ai_categoria_sugerida: aiData.sancion_sugerida || null,
                ai_recomendacion: aiData.tipo_recomendado || (aiData.gravedad_sugerida === 'leve' ? 'amonestacion' : 'sancion'),
                ai_motivo_legal: aiData.razonamiento || null,
                ai_dias_suspension_sugeridos: aiData.dias_suspension_sugeridos || null,
                ai_processed_at: new Date().toISOString(),
                ai_riesgo_reincidencia: finalRiesgo,
                ai_articulos_relevantes: aiData.articulos_relevantes || null,
                ai_tipo_recomendado: aiData.tipo_recomendado || null,
                ai_tipo_razonamiento: aiData.tipo_razonamiento || null,
                ai_gravedad_recomendada: aiData.gravedad_recomendada_si_sancion || null,
              })
              .eq('id', recordId);
          }
        } catch (aiErr) {
          console.error('AI classification failed (non-critical):', aiErr);
          // Still save calculated risk even if AI fails
          await supabase
            .from('incidencias_records')
            .update({ ai_riesgo_reincidencia: riesgoReincidencia })
            .eq('id', recordId);
        }

        // Evaluate department rules — reuse already-fetched data instead of re-querying
        let proposalCreated = false;
        try {
          if (rules && rules.activar_automatico && workerIds.length > 0) {
            // We already have allWorkerRecLinks and prevRecords from above — reuse them
            for (const w of recWorkers) {
              const wRecIds = (allWorkerRecLinks || []).filter(r => r.worker_id === w.worker_id).map(r => r.record_id);
              const counts = { leve: 0, grave: 0, muy_grave: 0 };
              for (const rid of wRecIds) {
                if (rid === recordId) continue;
                // Use the prevRecords we already fetched
                const pr = (prevRecords || []).find(r => r.id === rid);
                if (pr) {
                  const g = (pr.incidencias_categories as any)?.gravedad || 'leve';
                  counts[g as keyof typeof counts]++;
                }
              }

              const exceedsThreshold =
                counts.leve >= rules.umbral_leves ||
                counts.grave >= rules.umbral_graves ||
                counts.muy_grave >= rules.umbral_muy_graves;

              if (exceedsThreshold) {
                const highestGravedad = counts.muy_grave > 0 ? 'muy_grave' : counts.grave > 0 ? 'grave' : 'leve';
                const { data: newProp } = await supabase.from('incidencias_propuestas_rrhh').insert({
                  record_id: recordId,
                  department_id: rec.department_id,
                  tipo: highestGravedad === 'leve' ? 'amonestacion' : 'sancion',
                  gravedad: highestGravedad,
                  estado: 'pendiente',
                }).select().single();
                proposalCreated = true;

                if (newProp) {
                  // Fire-and-forget draft generation
                  generateProposalDraft(supabase, newProp, rec, recWorkers, aiData).catch(() => {});
                }
              }
            }
          }
        } catch (rulesErr) {
          console.error('Rules evaluation failed (non-critical):', rulesErr);
        }

        // If manager proposed sanction, create proposal
        if (!proposalCreated && rec.accion_propuesta && rec.accion_propuesta !== 'solo_incidencia') {
          const existingProposal = await supabase
            .from('incidencias_propuestas_rrhh')
            .select('id')
            .eq('record_id', recordId)
            .limit(1);

          if (!existingProposal.data || existingProposal.data.length === 0) {
            const { data: newProp } = await supabase.from('incidencias_propuestas_rrhh').insert({
              record_id: recordId,
              department_id: rec.department_id,
              tipo: rec.accion_propuesta === 'amonestacion_escrita' ? 'amonestacion' : 'sancion',
              gravedad: rec.incidencias_categories?.gravedad || 'leve',
              suspension_dias: null, // AI will propose days in the draft
              fecha_inicio: rec.propuesta_fecha_inicio || null,
              estado: 'pendiente',
            }).select().single();

            if (newProp) {
              await generateProposalDraft(supabase, newProp, rec, recWorkers || [], aiData);
            }
          }
        }

        // ── Build sanction suggestions for frontend popup ──
        const sanctionSuggestions: Array<{
          workerId: string;
          workerName: string;
          counts: { leve: number; grave: number; muy_grave: number; amonestaciones: number; sanciones_leves: number; sanciones_graves: number; sanciones_muy_graves: number };
          thresholds: { leves: number; graves: number; muy_graves: number; amonestaciones?: number; periodo_amonestaciones?: number; graves_despido?: number; muy_graves_despido?: number };
          periodDays: number;
          urgency: 'warning' | 'critical' | 'dismissal';
          recommendedAction: 'amonestacion' | 'sancion';
        }> = [];

        if (rules) {
          const alertaDespidoActiva = (rules as any).alerta_despido_activa !== false;
          const umbralGravesDespido = (rules as any).umbral_graves_despido ?? 3;
          const umbralMuyGravesDespido = (rules as any).umbral_muy_graves_despido ?? 1;
          const periodoDiasDespido = (rules as any).periodo_dias_despido ?? 365;
          const despidoStart = new Date();
          despidoStart.setDate(despidoStart.getDate() - periodoDiasDespido);

          // Single query for formal proposals instead of per-worker
          const { data: formalProps } = await supabase
            .from('incidencias_propuestas_rrhh')
            .select('id, tipo, gravedad, record_id, created_at')
            .eq('department_id', rec.department_id)
            .neq('estado', 'rechazada')
            .gte('created_at', despidoStart.toISOString());

          for (const w of recWorkers) {
            // Reuse allWorkerRecLinks instead of re-querying
            const wIds = allWorkerRecLinks.filter(r => r.worker_id === w.worker_id).map(r => r.record_id);
            
            // Count from already-fetched prevRecords
            const c = { leve: 0, grave: 0, muy_grave: 0 };
            for (const rid of wIds) {
              if (rid === recordId) continue;
              const pr = prevRecords.find(r => r.id === rid);
              if (pr) {
                const g = (pr.incidencias_categories as any)?.gravedad || 'leve';
                c[g as keyof typeof c]++;
              }
            }

            let amonestacionesCount = 0, sancionesLeves = 0, sancionesGraves = 0, sancionesMuyGraves = 0;
            for (const fp of (formalProps || [])) {
              if (!wIds.includes((fp as any).record_id)) continue;
              if (fp.tipo === 'amonestacion') amonestacionesCount++;
              else if (fp.tipo === 'sancion') {
                if (fp.gravedad === 'leve') sancionesLeves++;
                else if (fp.gravedad === 'grave') sancionesGraves++;
                else if (fp.gravedad === 'muy_grave') sancionesMuyGraves++;
              }
            }

            const pctL = rules.umbral_leves > 0 ? c.leve / rules.umbral_leves : 0;
            const pctG = rules.umbral_graves > 0 ? c.grave / rules.umbral_graves : 0;
            const pctM = rules.umbral_muy_graves > 0 ? c.muy_grave / rules.umbral_muy_graves : 0;
            const maxPct = Math.max(pctL, pctG, pctM);

            const isDismissal = alertaDespidoActiva && (sancionesGraves >= umbralGravesDespido || sancionesMuyGraves >= umbralMuyGravesDespido);

            const fullCounts = { ...c, amonestaciones: amonestacionesCount, sanciones_leves: sancionesLeves, sanciones_graves: sancionesGraves, sanciones_muy_graves: sancionesMuyGraves };
            const fullThresholds = { leves: rules.umbral_leves, graves: rules.umbral_graves, muy_graves: rules.umbral_muy_graves, amonestaciones: (rules as any).umbral_amonestaciones, periodo_amonestaciones: (rules as any).periodo_dias_amonestaciones, graves_despido: umbralGravesDespido, muy_graves_despido: umbralMuyGravesDespido };

            if (isDismissal) {
              sanctionSuggestions.push({ workerId: w.worker_id, workerName: w.worker_name, counts: fullCounts, thresholds: fullThresholds, periodDays: periodoDiasDespido, urgency: 'dismissal', recommendedAction: 'sancion' });
            } else if (maxPct >= 0.8) {
              sanctionSuggestions.push({ workerId: w.worker_id, workerName: w.worker_name, counts: fullCounts, thresholds: fullThresholds, periodDays: rules.periodo_dias_evaluacion, urgency: maxPct >= 1.0 ? 'critical' : 'warning', recommendedAction: c.muy_grave > 0 || c.grave > 0 ? 'sancion' : 'amonestacion' });
            }
          }
        }

        // Fire-and-forget audit logs
        writeAuditLog('incidencias.evaluate', 'incidencias_records', recordId, `IA clasificación: ${aiData?.gravedad_sugerida || 'N/A'}, riesgo: ${riesgoReincidencia}`, { ai_gravedad: aiData?.gravedad_sugerida, riesgo: riesgoReincidencia, proposal_created: proposalCreated });
        writeIncidenciasLog('evaluar_ia', recordId, null, `IA: ${aiData?.gravedad_sugerida || 'N/A'}, riesgo: ${riesgoReincidencia}`, { ai_gravedad: aiData?.gravedad_sugerida, riesgo: riesgoReincidencia, proposalCreated });

        return okResponse({
          evaluated: true,
          riesgo: riesgoReincidencia,
          proposalCreated,
          sanctionSuggestions: sanctionSuggestions.length > 0 ? sanctionSuggestions : undefined,
        });
      }

      // =============================================
      // PROPUESTAS RRHH
      // =============================================
      case 'listPropuestas': {
        if (!isAdmin) return errorResponse('Admin only');
        const { estado: filterEstado, departmentId: filterDeptId } = body;

        let query = supabase
          .from('incidencias_propuestas_rrhh')
          .select('*')
          .is('merged_into_id', null)
          .is('archivada_at', null)
          .neq('estado', 'fusionada')
          .neq('estado', 'archivada')
          .order('created_at', { ascending: false });

        if (filterEstado) query = query.eq('estado', filterEstado);
        if (filterDeptId) query = query.eq('department_id', filterDeptId);

        const { data: propuestas, error: propErr } = await query;
        if (propErr) return errorResponse('Failed to list propuestas');

        const recordIds = [...new Set((propuestas || []).map(p => p.record_id).filter(Boolean))];
        const recordsMap: Record<string, any> = {};
        if (recordIds.length > 0) {
          const { data: recs } = await supabase
            .from('incidencias_records')
            .select('*, incidencias_categories(name, color, gravedad)')
            .in('id', recordIds);
          for (const r of (recs || [])) recordsMap[r.id] = r;
        }

        const workersMap: Record<string, Array<{ worker_id: string; worker_name: string; worker_number: string | null }>> = {};
        if (recordIds.length > 0) {
          const { data: rw } = await supabase
            .from('incidencias_record_workers')
            .select('record_id, worker_id, worker_name, worker_number')
            .in('record_id', recordIds);
          for (const w of (rw || [])) {
            if (!workersMap[w.record_id]) workersMap[w.record_id] = [];
            workersMap[w.record_id].push({ worker_id: w.worker_id, worker_name: w.worker_name, worker_number: w.worker_number || null });
          }
        }

        const deptIdSet = [...new Set((propuestas || []).map(p => p.department_id))];
        const deptNamesMap: Record<string, string> = {};
        if (deptIdSet.length > 0) {
          const { data: depts } = await supabase
            .from('incidencias_departments')
            .select('id, name')
            .in('id', deptIdSet);
          for (const d of (depts || [])) deptNamesMap[d.id] = d.name;
        }

        const enriched = (propuestas || []).map(p => {
          const allWorkers = workersMap[p.record_id] || [];
          // If propuesta is scoped to a single target worker, only show that one.
          const scopedWorkers = (p as any).target_worker_id
            ? allWorkers.filter(w => w.worker_id === (p as any).target_worker_id)
            : allWorkers;
          return {
            ...p,
            record: recordsMap[p.record_id] || null,
            workers: scopedWorkers.length > 0 ? scopedWorkers : allWorkers,
            department_name: deptNamesMap[p.department_id] || '',
          };
        });

        return okResponse({ propuestas: enriched });
      }

      case 'approvePropuesta': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId, gravedad: apGravedad, suspension_dias: apDias } = body;
        if (!propuestaId) return errorResponse('propuestaId required');

        // Fetch propuesta to check tipo
        const { data: apProp } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('tipo, ai_analysis, record_id, gravedad, requiere_audiencia_previa, audiencia_previa_completada_at')
          .eq('id', propuestaId)
          .single();

        if (!apProp) return errorResponse('Propuesta not found');
        
        // Check AI analysis: either on propuesta or on the linked record
        let hasAiSignals = !!(apProp as any).ai_analysis;
        if (!hasAiSignals && apProp.tipo !== 'nspp' && (apProp as any).record_id) {
          const { data: apRec } = await supabase
            .from('incidencias_records')
            .select('ai_motivo_legal, ai_tipo_recomendado')
            .eq('id', (apProp as any).record_id)
            .single();
          if (apRec?.ai_motivo_legal || apRec?.ai_tipo_recomendado) hasAiSignals = true;
        }
        if (apProp.tipo !== 'nspp' && !hasAiSignals) {
          return errorResponse('Primero debe completarse el análisis IA');
        }

        const isAmonestacion = apProp?.tipo === 'amonestacion';

        // Normalize using convenio limits
        const normalized = normalizeLegalData({
          tipo: isAmonestacion ? 'amonestacion' : 'sancion',
          gravedad: isAmonestacion ? 'leve' : (apGravedad || 'leve'),
          suspension_dias: isAmonestacion ? null : (apDias ?? 0),
          sin_suspension_explicita: !isAmonestacion && Number(apDias ?? 0) === 0,
          fecha_inicio: null, // will be set later if needed
        });

        const updates: Record<string, unknown> = {
          estado: 'aprobada',
          aprobada_por: manager.name,
          aprobada_at: new Date().toISOString(),
          tipo: normalized.tipo,
          gravedad: normalized.gravedad,
          suspension_dias: normalized.suspension_dias,
          sin_suspension_explicita: normalized.sin_suspension_explicita === true,
        };

        const { error } = await supabase
          .from('incidencias_propuestas_rrhh')
          .update(updates)
          .eq('id', propuestaId);
        if (error) return errorResponse('Failed to approve: ' + error.message);

        await writeAuditLog('incidencias.approve_propuesta', 'incidencias_propuestas_rrhh', propuestaId, `Aprobada por ${manager.name}${isAmonestacion ? ' (amonestación)' : `, gravedad: ${apGravedad || 'sin cambio'}`}`, { gravedad: isAmonestacion ? null : apGravedad, dias: isAmonestacion ? null : apDias });
        await writeIncidenciasLog('aprobar_propuesta', null, propuestaId, `Aprobada por ${manager.name}`, { gravedad: isAmonestacion ? null : apGravedad, dias: isAmonestacion ? null : apDias });

        // Create notification for all admins → new task pending print
        {
          const { data: adminManagers } = await supabase
            .from('managers')
            .select('id')
            .eq('role', 'admin');
          const workerName = apProp?.tipo === 'nspp'
            ? 'trabajador'
            : 'trabajador';
          // Fetch worker name from the propuesta's record
          const { data: apPropFull } = await supabase
            .from('incidencias_propuestas_rrhh')
            .select('record_id, nspp_worker_name')
            .eq('id', propuestaId)
            .single();
          let notifWorkerName = 'Trabajador';
          if (apPropFull) {
            if (apPropFull.nspp_worker_name) {
              notifWorkerName = apPropFull.nspp_worker_name;
            } else if (apPropFull.record_id) {
              const { data: recWorkers } = await supabase
                .from('incidencias_record_workers')
                .select('worker_name')
                .eq('record_id', apPropFull.record_id)
                .limit(1);
              if (recWorkers?.[0]?.worker_name) notifWorkerName = recWorkers[0].worker_name;
            }
          }
          const tipoLabel = isAmonestacion ? 'Amonestación' : 'Sanción';
          const notifTitle = `${tipoLabel} aprobada — pendiente de imprimir`;
          const notifMessage = `${tipoLabel} para ${notifWorkerName} aprobada por ${manager.name}. Pendiente de imprimir y firmar.`;
          const notifs = (adminManagers || []).map((a: any) => ({
            user_id: a.id,
            role: 'admin',
            type: 'tarea_pendiente',
            title: notifTitle,
            message: notifMessage,
            link: '/admin?module=incidencias&tab=tareas',
          }));
          if (notifs.length > 0) {
            await supabase.from('incidencias_notifications').insert(notifs);
          }
        }

        // Re-generate email draft in background with the approved suspension days
        {
          const { data: approvedProp } = await supabase
            .from('incidencias_propuestas_rrhh')
            .select('*')
            .eq('id', propuestaId)
            .single();
          if (approvedProp) {
            const { data: approvedRec } = await supabase
              .from('incidencias_records')
              .select('*')
              .eq('id', approvedProp.record_id)
              .single();
            const { data: approvedWorkers } = await supabase
              .from('incidencias_record_workers')
              .select('worker_id, worker_name, worker_number')
              .eq('record_id', approvedProp.record_id);
            if (approvedRec && approvedWorkers && approvedWorkers.length > 0) {
              generateProposalDraft(supabase, approvedProp, approvedRec, approvedWorkers, null).catch(e =>
                console.error('[approvePropuesta] Background draft re-generation failed:', e)
              );
            }
          }
        }

        // ───────────────────────────────────────────────────────────
        // AVISO ANTICIPADO A RRHH — Sanción con suspensión de empleo y sueldo
        // Enviado automáticamente al aprobar; informativo, con doc adjunto sin firmar.
        // Se ejecuta en background con .catch para no bloquear la aprobación.
        // ───────────────────────────────────────────────────────────
        // Llamada en background al helper compartido (no bloquea la aprobación).
        sendSuspensionAvisoEmail(propuestaId, 'approvePropuesta').catch(e =>
          console.error('[approvePropuesta] sendSuspensionAvisoEmail error:', e)
        );

        return okResponse({ approved: true });
      }

      case 'rejectPropuesta': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: rejId, motivo } = body;
        if (!rejId) return errorResponse('propuestaId required');

        const { error } = await supabase
          .from('incidencias_propuestas_rrhh')
          .update({
            estado: 'rechazada',
            rechazada_por: manager.name,
            rechazada_at: new Date().toISOString(),
            rechazo_motivo: motivo || null,
          })
          .eq('id', rejId);
        if (error) return errorResponse('Failed to reject');

        await writeAuditLog('incidencias.reject_propuesta', 'incidencias_propuestas_rrhh', rejId, `Rechazada por ${manager.name}: ${motivo || 'Sin motivo'}`, { motivo });
        await writeIncidenciasLog('rechazar_propuesta', null, rejId, `Rechazada: ${motivo || 'Sin motivo'}`, { motivo });

        return okResponse({ rejected: true });
      }

      case 'duplicateProposalToWorker': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: dupPropId, newWorkerId: dupNewWorkerId } = body;
        if (!dupPropId || !dupNewWorkerId) return errorResponse('propuestaId y newWorkerId requeridos');

        // Load source proposal
        const { data: srcProp, error: srcPropErr } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('*')
          .eq('id', dupPropId)
          .single();
        if (srcPropErr || !srcProp) return errorResponse('Propuesta original no encontrada');
        if (srcProp.tipo === 'nspp') return errorResponse('No se puede duplicar una propuesta NSPP');
        if (!srcProp.record_id) return errorResponse('La propuesta no tiene incidencia vinculada');

        // Load source record
        const { data: srcRec, error: srcRecErr } = await supabase
          .from('incidencias_records')
          .select('*')
          .eq('id', srcProp.record_id)
          .single();
        if (srcRecErr || !srcRec) return errorResponse('Incidencia original no encontrada');

        if (!await validateIncidenciasDeptAccess(srcRec.department_id)) {
          return errorResponse('Sin acceso al departamento');
        }

        // Resolve new worker
        const dupResolved = await resolveIncidenciaWorkers([dupNewWorkerId]);
        const newWorkerRow = dupResolved.workerRows[0];
        if (!newWorkerRow) return errorResponse('Trabajador no encontrado');
        if (dupResolved.resolvedDepartmentId && dupResolved.resolvedDepartmentId !== srcRec.department_id) {
          return errorResponse('El trabajador debe pertenecer al mismo departamento que la incidencia original');
        }

        // 1. Clone record
        const { data: newRec, error: newRecErr } = await supabase
          .from('incidencias_records')
          .insert({
            department_id: srcRec.department_id,
            category_id: srcRec.category_id,
            custom_category_name: srcRec.custom_category_name,
            fecha: srcRec.fecha,
            descripcion: srcRec.descripcion,
            estado: 'abierta',
            created_by_id: manager.id,
            created_by_name: manager.name,
            pruebas_urls: srcRec.pruebas_urls || [],
            accion_propuesta: srcRec.accion_propuesta,
            propuesta_suspension: srcRec.propuesta_suspension,
            propuesta_fecha_inicio: srcRec.propuesta_fecha_inicio,
            duplicated_from_record_id: srcRec.id,
          })
          .select()
          .single();
        if (newRecErr || !newRec) return errorResponse('Error clonando incidencia: ' + (newRecErr?.message || ''));

        // 2. Link new worker
        const { error: rwErr } = await supabase
          .from('incidencias_record_workers')
          .insert({
            record_id: newRec.id,
            worker_id: newWorkerRow.worker_id,
            worker_name: newWorkerRow.worker_name,
            worker_number: newWorkerRow.worker_number,
          });
        if (rwErr) {
          await supabase.from('incidencias_records').delete().eq('id', newRec.id);
          return errorResponse('Error vinculando trabajador: ' + rwErr.message);
        }

        // 3. Clone proposal
        const { data: newProp, error: newPropErr } = await supabase
          .from('incidencias_propuestas_rrhh')
          .insert({
            record_id: newRec.id,
            department_id: srcProp.department_id,
            target_worker_id: newWorkerRow.worker_id,
            tipo: srcProp.tipo,
            gravedad: srcProp.gravedad,
            suspension_dias: srcProp.suspension_dias,
            suspension_fechas: srcProp.suspension_fechas,
            fecha_inicio: srcProp.fecha_inicio,
            sin_suspension_explicita: (srcProp as any).sin_suspension_explicita ?? null,
            estado: 'pendiente',
            duplicated_from_propuesta_id: srcProp.id,
          })
          .select()
          .single();
        if (newPropErr || !newProp) {
          await supabase.from('incidencias_record_workers').delete().eq('record_id', newRec.id);
          await supabase.from('incidencias_records').delete().eq('id', newRec.id);
          return errorResponse('Error clonando propuesta: ' + (newPropErr?.message || ''));
        }

        writeIncidenciasLog(
          'duplicar_propuesta',
          newRec.id,
          newProp.id,
          `Propuesta duplicada de ${srcProp.id} para ${newWorkerRow.worker_name}`,
          { source_propuesta_id: srcProp.id, source_record_id: srcRec.id, new_worker_id: newWorkerRow.worker_id, new_worker_name: newWorkerRow.worker_name },
        );

        // 4. Fire-and-forget AI analysis (will then auto-generate legal doc)
        const supaUrlDup = Deno.env.get('SUPABASE_URL')!;
        const supaKeyDup = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        fetch(`${supaUrlDup}/functions/v1/incidencias-operations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supaKeyDup}`,
            'apikey': supaKeyDup,
          },
          body: JSON.stringify({ action: 'analyzeProposal', sessionToken: body.sessionToken, propuestaId: newProp.id }),
        }).catch(e => console.error('[duplicateProposalToWorker] Background AI analysis failed:', e));

        return okResponse({ success: true, newPropuestaId: newProp.id, newRecordId: newRec.id });
      }

      case 'archivePropuesta': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: archId, motivo: archMotivo } = body;
        if (!archId) return errorResponse('propuestaId required');

        const { data: archProp } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('id, estado, record_id, archivada_at')
          .eq('id', archId)
          .single();
        if (!archProp) return errorResponse('Propuesta no encontrada');
        if (archProp.archivada_at) return errorResponse('La propuesta ya está archivada');
        if (archProp.estado !== 'pendiente' && archProp.estado !== 'rechazada') {
          return errorResponse('Solo se pueden archivar propuestas pendientes o rechazadas');
        }

        const nowIso = new Date().toISOString();
        const { error: archErr } = await supabase
          .from('incidencias_propuestas_rrhh')
          .update({
            estado: 'archivada',
            archivada_at: nowIso,
            archivada_por: manager.name,
            archivada_motivo: archMotivo || null,
          })
          .eq('id', archId);
        if (archErr) return errorResponse('Failed to archive propuesta');

        if (archProp.record_id) {
          await supabase
            .from('incidencias_records')
            .update({
              estado: 'archivada',
              archivada_at: nowIso,
              archivada_por: manager.name,
              archivada_motivo: archMotivo || null,
            })
            .eq('id', archProp.record_id);
        }

        await writeAuditLog('incidencias.archive_propuesta', 'incidencias_propuestas_rrhh', archId, `Archivada por ${manager.name}: ${archMotivo || 'Sin motivo'}`, { motivo: archMotivo });
        await writeIncidenciasLog('archivar_propuesta', archProp.record_id || null, archId, `Archivada: ${archMotivo || 'Sin motivo'}`, { motivo: archMotivo });

        return okResponse({ archived: true });
      }

      case 'restorePropuesta': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: restId } = body;
        if (!restId) return errorResponse('propuestaId required');

        const { data: restProp } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('id, record_id, archivada_at')
          .eq('id', restId)
          .single();
        if (!restProp) return errorResponse('Propuesta no encontrada');
        if (!restProp.archivada_at) return errorResponse('La propuesta no está archivada');

        const { error: restErr } = await supabase
          .from('incidencias_propuestas_rrhh')
          .update({
            estado: 'pendiente',
            archivada_at: null,
            archivada_por: null,
            archivada_motivo: null,
          })
          .eq('id', restId);
        if (restErr) return errorResponse('Failed to restore propuesta');

        if (restProp.record_id) {
          await supabase
            .from('incidencias_records')
            .update({
              estado: 'abierta',
              archivada_at: null,
              archivada_por: null,
              archivada_motivo: null,
            })
            .eq('id', restProp.record_id);
        }

        await writeAuditLog('incidencias.restore_propuesta', 'incidencias_propuestas_rrhh', restId, `Restaurada por ${manager.name}`, null);
        await writeIncidenciasLog('restaurar_propuesta', restProp.record_id || null, restId, `Restaurada por ${manager.name}`, null);

        return okResponse({ restored: true });
      }

      case 'listArchivedPropuestas': {
        if (!isAdmin) return errorResponse('Admin only');
        const { departmentId: archDeptId, search: archSearch } = body || {};

        let archQuery = supabase
          .from('incidencias_propuestas_rrhh')
          .select('*')
          .not('archivada_at', 'is', null)
          .order('archivada_at', { ascending: false });

        if (archDeptId) archQuery = archQuery.eq('department_id', archDeptId);

        const { data: archPropuestas, error: archListErr } = await archQuery;
        if (archListErr) return errorResponse('Failed to list archived propuestas');

        // Fetch related records for context
        const recordIds = Array.from(new Set((archPropuestas || []).map((p: any) => p.record_id).filter(Boolean)));
        const recordsById: Record<string, any> = {};
        if (recordIds.length > 0) {
          const { data: recs } = await supabase
            .from('incidencias_records')
            .select('id, fecha, descripcion, department_id, custom_category_name, category_id, created_by_name, accion_propuesta')
            .in('id', recordIds);
          (recs || []).forEach((r: any) => { recordsById[r.id] = r; });
        }

        let result = (archPropuestas || []).map((p: any) => ({ ...p, record: p.record_id ? recordsById[p.record_id] || null : null }));

        if (archSearch && typeof archSearch === 'string' && archSearch.trim()) {
          const needle = archSearch.trim().toLowerCase();
          result = result.filter((p: any) => {
            const name = (p.nspp_worker_name || p.record?.created_by_name || '').toLowerCase();
            const desc = (p.record?.descripcion || '').toLowerCase();
            return name.includes(needle) || desc.includes(needle);
          });
        }

        const { data: archDepts } = await supabase
          .from('incidencias_departments')
          .select('id, name')
          .eq('active', true)
          .order('name');

        return okResponse({ propuestas: result, departments: archDepts || [] });
      }

      case 'deletePropuesta': {
        // Cascading delete for proposals - v2
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: delPropId } = body;
        if (!delPropId) return errorResponse('propuestaId required');

        const { data: legalDocs, error: legalDocsError } = await supabase
          .from('incidencias_legal_documents')
          .select('id')
          .eq('propuesta_id', delPropId);
        if (legalDocsError) return errorResponse('Error al cargar documentos relacionados');

        const docIds = (legalDocs || []).map((d: any) => d.id);

        if (docIds.length > 0) {
          const { error: firmaTasksError } = await supabase
            .from('incidencias_firma_tasks')
            .delete()
            .in('legal_document_id', docIds);
          if (firmaTasksError) return errorResponse('Error al eliminar tareas de firma: ' + firmaTasksError.message);

          const { error: legalDeleteError } = await supabase
            .from('incidencias_legal_documents')
            .delete()
            .eq('propuesta_id', delPropId);
          if (legalDeleteError) return errorResponse('Error al eliminar documentos legales: ' + legalDeleteError.message);
        }

        const { error: auditDeleteError } = await supabase
          .from('incidencias_audit_logs')
          .delete()
          .eq('propuesta_id', delPropId);
        if (auditDeleteError) return errorResponse('Error al eliminar logs: ' + auditDeleteError.message);

        const { error: proposalDeleteError } = await supabase
          .from('incidencias_propuestas_rrhh')
          .delete()
          .eq('id', delPropId);
        if (proposalDeleteError) return errorResponse('Error al eliminar propuesta: ' + proposalDeleteError.message);

        await writeAuditLog('incidencias.delete_propuesta', 'incidencias_propuestas_rrhh', delPropId, `Propuesta eliminada por ${manager.name}`, null);
        await writeIncidenciasLog('eliminar_propuesta', null, delPropId, `Propuesta eliminada por ${manager.name}`, null);

        return okResponse({ deleted: true });
      }

      case 'resetPropuesta': {
        if (!isAdmin) return errorResponse('Solo admin puede restablecer');
        const { propuestaId: resetId } = body;
        if (!resetId) return errorResponse('propuestaId required');

        // Fetch current propuesta
        const { data: resetProp } = await supabase.from('incidencias_propuestas_rrhh').select('*, ai_reasoning_log').eq('id', resetId).single();
        if (!resetProp) return errorResponse('Propuesta no encontrada');
        if (resetProp.estado !== 'pendiente') return errorResponse('Solo se pueden restablecer propuestas pendientes');

        // 1. Delete legal documents + firma tasks (cascade)
        const { data: resetLegalDocs } = await supabase
          .from('incidencias_legal_documents')
          .select('id')
          .eq('propuesta_id', resetId);
        const resetDocIds = (resetLegalDocs || []).map((d: any) => d.id);
        if (resetDocIds.length > 0) {
          await supabase.from('incidencias_firma_tasks').delete().in('legal_document_id', resetDocIds);
          await supabase.from('incidencias_legal_documents').delete().eq('propuesta_id', resetId);
        }

        // 2. Build new reasoning log entry
        const existingLog = Array.isArray(resetProp.ai_reasoning_log) ? resetProp.ai_reasoning_log : [];
        const resetLogEntry = {
          action: 'reset',
          timestamp: new Date().toISOString(),
          by: manager.name,
          reason: 'Restablecimiento manual — reinicio completo del flujo',
        };

        // 3. Clear all AI/legal fields
        const { error: resetErr } = await supabase.from('incidencias_propuestas_rrhh').update({
          ai_analysis: null,
          ai_reasoning_log: [...existingLog, resetLogEntry],
          ai_borrador_generado: false,
          email_subject: null,
          email_body: null,
          email_html: null,
          tipo: 'amonestacion',
          gravedad: 'leve',
          suspension_dias: null,
          suspension_fechas: null,
          fecha_inicio: null,
          suspension_aviso_enviado_at: null,
        }).eq('id', resetId);
        if (resetErr) return errorResponse('Error al restablecer: ' + resetErr.message);

        // 4. Audit log
        await writeAuditLog('incidencias.reset_propuesta', 'incidencias_propuestas_rrhh', resetId, `Propuesta restablecida por ${manager.name}`, null);
        await writeIncidenciasLog('restablecer_propuesta', null, resetId, `Propuesta restablecida por ${manager.name} — análisis, documento y campos legales limpiados`, null);

        return okResponse({ reset: true });
      }

      case 'reopenPropuesta': {
        if (!isAdmin) return errorResponse('Solo admin puede reabrir');
        const { propuestaId: reopenId } = body;
        if (!reopenId) return errorResponse('propuestaId required');

        const { data: reopenProp } = await supabase.from('incidencias_propuestas_rrhh').select('*, ai_reasoning_log').eq('id', reopenId).single();
        if (!reopenProp) return errorResponse('Propuesta no encontrada');
        if (reopenProp.estado !== 'aprobada' && reopenProp.estado !== 'enviada') {
          return errorResponse('Solo se pueden reabrir propuestas aprobadas o enviadas');
        }

        // 1. Delete firma tasks + legal documents (cascade)
        const { data: reopenLegalDocs } = await supabase
          .from('incidencias_legal_documents')
          .select('id')
          .eq('propuesta_id', reopenId);
        const reopenDocIds = (reopenLegalDocs || []).map((d: any) => d.id);
        if (reopenDocIds.length > 0) {
          await supabase.from('incidencias_firma_tasks').delete().in('legal_document_id', reopenDocIds);
          await supabase.from('incidencias_legal_documents').delete().eq('propuesta_id', reopenId);
        }

        // 2. Reset proposal estado back to pendiente
        const existingLog = Array.isArray(reopenProp.ai_reasoning_log) ? reopenProp.ai_reasoning_log : [];
        const reopenLogEntry = {
          action: 'reopen',
          timestamp: new Date().toISOString(),
          by: manager.name,
          reason: 'Reabierta desde historial para edición',
        };

        const { error: reopenErr } = await supabase.from('incidencias_propuestas_rrhh').update({
          estado: 'pendiente',
          aprobada_por: null,
          aprobada_at: null,
          ai_reasoning_log: [...existingLog, reopenLogEntry],
          suspension_aviso_enviado_at: null,
        }).eq('id', reopenId);
        if (reopenErr) return errorResponse('Error al reabrir: ' + reopenErr.message);

        // 3. Audit
        await writeAuditLog('incidencias.reopen_propuesta', 'incidencias_propuestas_rrhh', reopenId, `Propuesta reabierta por ${manager.name}`, null);
        await writeIncidenciasLog('reabrir_propuesta', null, reopenId, `Propuesta reabierta por ${manager.name} — tareas de firma eliminadas, devuelta a pendiente`, null);

        return okResponse({ reopened: true });
      }

      case 'regenerateDraft': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: regenId } = body;
        if (!regenId) return errorResponse('propuestaId required');

        const { data: prop } = await supabase.from('incidencias_propuestas_rrhh').select('*').eq('id', regenId).single();
        if (!prop) return errorResponse('Propuesta not found');

        const { data: rec } = await supabase
          .from('incidencias_records')
          .select('*, incidencias_categories(name, gravedad)')
          .eq('id', prop.record_id)
          .single();
        if (!rec) return errorResponse('Record not found');

        const { data: recWorkers } = await supabase
          .from('incidencias_record_workers')
          .select('worker_id, worker_name, worker_number')
          .eq('record_id', prop.record_id);

        await generateProposalDraft(supabase, prop, rec, recWorkers || [], null);
        await writeIncidenciasLog('regenerar_borrador', null, regenId, `Borrador regenerado por ${manager.name}`, null);
        return okResponse({ regenerated: true });
      }

      case 'sendPropuestaEmail': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: sendId } = body;
        if (!sendId) return errorResponse('propuestaId required');

        const { data: prop } = await supabase.from('incidencias_propuestas_rrhh').select('*').eq('id', sendId).single();
        if (!prop) return errorResponse('Propuesta not found');
        if (prop.estado === 'rechazada') return errorResponse('Esta propuesta fue rechazada');

        // Use editable email_subject and email_body if available
        const emailSubject = prop.email_subject;
        const emailBody = prop.email_body;

        if (!emailSubject || !emailBody) {
          return errorResponse('Falta asunto o cuerpo del email. Genera un borrador primero.');
        }

        // Get configured recipients — use is_primary to determine TO vs CC
        const { data: emailConfigs } = await supabase
          .from('incidencias_email_config')
          .select('email, is_primary')
          .eq('activo', true)
          .order('is_primary', { ascending: false })
          .order('created_at');
        const primaryEmails = (emailConfigs || []).filter((c: any) => c.is_primary).map((c: any) => c.email);
        const ccEmails = (emailConfigs || []).filter((c: any) => !c.is_primary).map((c: any) => c.email);
        const recipients = [...primaryEmails, ...ccEmails];
        if (recipients.length === 0) {
          return errorResponse('No hay emails destinatarios configurados. Configúralos en Ajustes.');
        }

        // Fetch record & worker data for rich email
        const { data: sendRecord } = await supabase.from('incidencias_records').select('*').eq('id', prop.record_id).single();
        const { data: sendWorkers } = await supabase.from('incidencias_record_workers').select('*').eq('record_id', prop.record_id);
        const { data: sendDept } = prop.department_id ? await supabase.from('incidencias_departments').select('name').eq('id', prop.department_id).single() : { data: null };

        // Email color scheme based on tipo + gravedad
        // Amonestación → corporate green, Sanción leve → orange, Sanción grave/muy_grave → red
        const emailTheme = (() => {
          if (prop.tipo === 'amonestacion') return { headerBg: '#7bc600', headerGradient: 'linear-gradient(135deg, #7bc600, #93d600)', accent: '#7bc600', badgeBg: '#7bc600', badgeText: '#fff', subtitleColor: 'rgba(255,255,255,0.75)' };
          if (prop.gravedad === 'muy_grave') return { headerBg: '#b91c1c', headerGradient: 'linear-gradient(135deg, #991b1b, #dc2626)', accent: '#dc2626', badgeBg: '#dc2626', badgeText: '#fff', subtitleColor: 'rgba(255,255,255,0.7)' };
          if (prop.gravedad === 'grave') return { headerBg: '#c2410c', headerGradient: 'linear-gradient(135deg, #9a3412, #ea580c)', accent: '#ea580c', badgeBg: '#ea580c', badgeText: '#fff', subtitleColor: 'rgba(255,255,255,0.7)' };
          return { headerBg: '#d97706', headerGradient: 'linear-gradient(135deg, #b45309, #f59e0b)', accent: '#f59e0b', badgeBg: '#f59e0b', badgeText: '#fff', subtitleColor: 'rgba(255,255,255,0.7)' };
        })();

        const workerBadges = (sendWorkers || []).map(w => {
          const salixUrl = w.worker_number ? `https://salix.verdnatura.es/#/worker/${w.worker_number}/time-control` : '';
          return salixUrl
            ? `<a href="${salixUrl}" target="_blank" style="display:inline-block;background:${emailTheme.badgeBg};color:${emailTheme.badgeText};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;text-decoration:none;margin:0 4px 4px 0;">${w.worker_name}${w.worker_number ? ` (${w.worker_number})` : ''} ↗</a>`
            : `<span style="display:inline-block;background:${emailTheme.badgeBg};color:${emailTheme.badgeText};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;margin:0 4px 4px 0;">${w.worker_name}</span>`;
        }).join('');

        const pruebas = sendRecord && Array.isArray(sendRecord.pruebas_urls) ? sendRecord.pruebas_urls : [];
        const adminPruebasEmail = Array.isArray((prop as any).admin_pruebas_urls) ? (prop as any).admin_pruebas_urls : [];
        const todasPruebas = [...pruebas, ...adminPruebasEmail];

        // Stable long-lived attachment URLs for email and resend flows
        const IMAGE_EXT_EMAIL = /\.(jpg|jpeg|png|gif|webp)$/i;
        const imageAttachmentPaths = todasPruebas.filter((p: string) => typeof p === 'string' && IMAGE_EXT_EMAIL.test(p.split('?')[0]));
        const fileAttachmentPaths = todasPruebas.filter((p: string) => typeof p === 'string' && !IMAGE_EXT_EMAIL.test(p.split('?')[0]));
        const persistentImageUrls = await getPersistentIncidenciaAttachmentUrls(
          supabase,
          prop.id,
          imageAttachmentPaths,
          'https://vnprod.app',
        );
        const persistentFileUrls = await getPersistentIncidenciaAttachmentUrls(
          supabase,
          prop.id,
          fileAttachmentPaths,
          'https://vnprod.app',
        );

        const pruebasHtml = todasPruebas.length > 0
          ? `<div style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
              <p style="margin:0 0 12px;font-weight:600;font-size:13px;color:#475569;">Pruebas adjuntas (${todasPruebas.length})</p>
              ${persistentImageUrls.length > 0 ? `<div style="overflow:hidden;margin-bottom:12px;font-size:0;">${persistentImageUrls.map((url: string, i: number) => `<a href="${url}" target="_blank" style="text-decoration:none;"><img src="${url}" alt="Evidencia ${i+1}" style="display:inline-block;width:30%;max-width:180px;height:auto;max-height:150px;border-radius:8px;border:1px solid #e2e8f0;object-fit:cover;margin:0 8px 8px 0;cursor:pointer;"></a>`).join('')}</div>` : ''}
              ${persistentFileUrls.map((url: string, i: number) => `<a href="${url}" target="_blank" style="display:inline-block;background:#64748b;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;text-decoration:none;margin:0 4px 4px 0;">Archivo adjunto ${i + 1} ↗</a>`).join('')}
            </div>` : '';

        const logoUrl = 'https://vnprod.app/images/logo-white.png';
        const logoGreenUrl = 'https://vnprod.app/images/verdnatura-logo-green.png';

        // Compute footer badge variables
        const fechaHechosRaw = sendRecord ? new Date(sendRecord.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
        const fechaHechos = fechaHechosRaw ? fechaHechosRaw.charAt(0).toUpperCase() + fechaHechosRaw.slice(1) : '';
        const horaHechos = sendRecord ? new Date(sendRecord.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
        const tipoLabel = prop.tipo === 'sancion' ? 'Sanción' : prop.tipo === 'amonestacion' ? 'Amonestación' : prop.tipo === 'nspp' ? 'NSPP' : prop.tipo;
        const gravedadLabel = prop.gravedad === 'muy_grave' ? 'Muy grave' : prop.gravedad === 'grave' ? 'Grave' : 'Leve';
        const gravedadColor = prop.gravedad === 'muy_grave' ? '#dc2626' : prop.gravedad === 'grave' ? '#f59e0b' : '#93d600';

        // Build professional HTML email with Poppins font, corporate green, admin signature
        const adminFirstName = manager.name.split(' ')[0];
        const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Poppins','Segoe UI',Arial,sans-serif;letter-spacing:-0.01em;">
<div style="max-width:620px;margin:0 auto;padding:20px;">
  <div style="background:${emailTheme.headerGradient};border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <img src="${logoUrl}" alt="Verdnatura" width="56" height="56" style="width:56px;height:56px;margin-bottom:12px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;font-family:'Poppins','Segoe UI',sans-serif;">Control de Incidencias</h1>
    <p style="margin:4px 0 0;color:${emailTheme.subtitleColor};font-size:12px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">Comunicación disciplinaria</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;border-radius:0 0 16px 16px;">
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:${emailTheme.accent};text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Trabajador/es</p>
      ${workerBadges}
    </div>
    <div style="line-height:1.75;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;white-space:pre-wrap;letter-spacing:-0.01em;">${emailBody.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<span style="font-weight:600;color:#1e293b">$1</span>')}</div>
    ${pruebasHtml}
    <div style="margin-top:28px;line-height:1.4;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">
      <p style="margin:0 0 16px;">Muchas gracias y un saludo,</p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-right:16px;vertical-align:middle;"><img src="${logoGreenUrl}" alt="Verdnatura" width="40" height="40" style="width:40px;height:40px;display:block;"></td>
          <td style="padding-right:16px;border-right:2px solid ${emailTheme.accent};vertical-align:middle;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#1a1a1a;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.02em;line-height:1.3;">Álvaro Mas</p>
            <p style="margin:1px 0 0;font-size:12px;font-weight:400;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.3;">VerdNatura Levante S.L.</p>
          </td>
          <td style="padding-left:16px;vertical-align:middle;">
            <p style="margin:0 0 2px;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">+34 661 95 84 33</p>
            <p style="margin:0;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">Carrer Fenollar, 2, 46680 Algemesí</p>
          </td>
        </tr>
      </table>
    </div>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          ${fechaHechos ? `<td style="padding:3px 4px 3px 0;"><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${fechaHechos}</span></td>` : ''}
          <td style="padding:3px 4px;"><span style="display:inline-block;background:${gravedadColor}18;color:${gravedadColor};padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${tipoLabel} · ${gravedadLabel}</span></td>
          ${sendDept ? `<td style="padding:3px 4px;"><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${sendDept.name}</span></td>` : ''}
          ${horaHechos ? `<td style="padding:3px 4px 3px 0;"><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${horaHechos}</span></td>` : ''}
        </tr>
      </table>
    </div>
    <div style="margin-top:16px;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:6px;">
        <tr>
          <td style="width:3px;background:${emailTheme.accent};border-radius:2px;"></td>
          <td style="padding-left:10px;"><span style="font-size:11px;font-weight:600;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;">Enviado desde Control de Incidencias · Verdnatura</span></td>
        </tr>
      </table>
      <p style="margin:0;font-size:11px;color:#94a3b8;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">${(() => { const d = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return d.charAt(0).toUpperCase() + d.slice(1); })()} · Este correo es confidencial y está destinado exclusivamente a los departamentos autorizados.</p>
    </div>
  </div>
</div></body></html>`;

        // Send via Brevo — primary as TO, rest as CC
        const emailRes = await sendEmailBrevo({
          from: 'Control Incidencias <incidencias@vnprod.app>',
          to: primaryEmails.length > 0 ? primaryEmails : [recipients[0]],
          cc: primaryEmails.length > 0 ? ccEmails : (recipients.length > 1 ? recipients.slice(1) : undefined),
          subject: emailSubject,
          html: emailHtml,
        });

        const resendResponseText = await emailRes.text();
        console.log('[sendPropuestaEmail] Resend status:', emailRes.status, 'Response:', resendResponseText);

        if (!emailRes.ok) {
          console.error('[sendPropuestaEmail] Resend error:', resendResponseText);
          return errorResponse('Email send failed: ' + resendResponseText);
        }

        // Mark as enviada + aprobada (approval happens on send)
        await supabase.from('incidencias_propuestas_rrhh').update({
          estado: 'enviada',
          email_html: emailHtml,
          aprobada_at: new Date().toISOString(),
          aprobada_por: manager.name,
        }).eq('id', sendId);

        await writeIncidenciasLog('enviar_email', null, sendId, 'Email enviado por ' + manager.name + ' a ' + recipients.join(', '), { destinatarios: recipients });
        return okResponse({ sent: true });
      }

      // =============================================
      // RESEND PROPUESTA EMAIL
      // =============================================
      case 'resendPropuestaEmail': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: resendId } = body;
        if (!resendId) return errorResponse('propuestaId required');

        const { data: reProp } = await supabase.from('incidencias_propuestas_rrhh').select('*').eq('id', resendId).single();
        if (!reProp) return errorResponse('Propuesta not found');
        if (reProp.estado !== 'enviada') return errorResponse('Solo se pueden reenviar propuestas enviadas');

        const reEmailSubject = reProp.email_subject;
        const reEmailBody = reProp.email_body;
        if (!reEmailSubject || !reEmailBody) return errorResponse('Esta propuesta no tiene email generado');

        // Get configured recipients
        const { data: resendConfigs } = await supabase.from('incidencias_email_config').select('email, is_primary').eq('activo', true).order('is_primary', { ascending: false }).order('created_at');
        const resendPrimary = (resendConfigs || []).filter((c: any) => c.is_primary).map((c: any) => c.email);
        const resendCc = (resendConfigs || []).filter((c: any) => !c.is_primary).map((c: any) => c.email);
        const resendRecipients = [...resendPrimary, ...resendCc];
        if (resendRecipients.length === 0) return errorResponse('No hay emails destinatarios configurados');

        // Rebuild full HTML from current email_body (may have been edited)
        const { data: reRecord } = await supabase.from('incidencias_records').select('*').eq('id', reProp.record_id).single();
        const { data: reWorkers } = await supabase.from('incidencias_record_workers').select('*').eq('record_id', reProp.record_id);
        const { data: reDept } = reProp.department_id ? await supabase.from('incidencias_departments').select('name').eq('id', reProp.department_id).single() : { data: null };

        // Resend email color theme
        const reEmailTheme = (() => {
          if (reProp.tipo === 'amonestacion') return { headerBg: '#7bc600', headerGradient: 'linear-gradient(135deg, #7bc600, #93d600)', accent: '#7bc600', badgeBg: '#7bc600', badgeText: '#fff', subtitleColor: 'rgba(255,255,255,0.75)' };
          if (reProp.gravedad === 'muy_grave') return { headerBg: '#b91c1c', headerGradient: 'linear-gradient(135deg, #991b1b, #dc2626)', accent: '#dc2626', badgeBg: '#dc2626', badgeText: '#fff', subtitleColor: 'rgba(255,255,255,0.7)' };
          if (reProp.gravedad === 'grave') return { headerBg: '#c2410c', headerGradient: 'linear-gradient(135deg, #9a3412, #ea580c)', accent: '#ea580c', badgeBg: '#ea580c', badgeText: '#fff', subtitleColor: 'rgba(255,255,255,0.7)' };
          return { headerBg: '#d97706', headerGradient: 'linear-gradient(135deg, #b45309, #f59e0b)', accent: '#f59e0b', badgeBg: '#f59e0b', badgeText: '#fff', subtitleColor: 'rgba(255,255,255,0.7)' };
        })();

        const reWorkerBadges = (reWorkers || []).map((w: any) => {
          const salixUrl = w.worker_number ? `https://salix.verdnatura.es/#/worker/${w.worker_number}/time-control` : '';
          return salixUrl
            ? `<a href="${salixUrl}" target="_blank" style="display:inline-block;background:${reEmailTheme.badgeBg};color:${reEmailTheme.badgeText};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;text-decoration:none;margin:0 4px 4px 0;">${w.worker_name}${w.worker_number ? ` (${w.worker_number})` : ''} ↗</a>`
            : `<span style="display:inline-block;background:${reEmailTheme.badgeBg};color:${reEmailTheme.badgeText};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;margin:0 4px 4px 0;">${w.worker_name}</span>`;
        }).join('');

        const reFechaRaw = reRecord ? new Date(reRecord.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
        const reFecha = reFechaRaw ? reFechaRaw.charAt(0).toUpperCase() + reFechaRaw.slice(1) : '';
        const reHora = reRecord ? new Date(reRecord.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
        const reTipoLabel = reProp.tipo === 'sancion' ? 'Sanción' : reProp.tipo === 'amonestacion' ? 'Amonestación' : reProp.tipo === 'nspp' ? 'NSPP' : reProp.tipo;
        const reGravedadLabel = reProp.gravedad === 'muy_grave' ? 'Muy grave' : reProp.gravedad === 'grave' ? 'Grave' : 'Leve';
        const reGravedadColor = reProp.gravedad === 'muy_grave' ? '#dc2626' : reProp.gravedad === 'grave' ? '#f59e0b' : '#93d600';

        const rePruebas = reRecord && Array.isArray(reRecord.pruebas_urls) ? reRecord.pruebas_urls : [];
        const reAdminPruebas = Array.isArray((reProp as any).admin_pruebas_urls) ? (reProp as any).admin_pruebas_urls : [];
        const reTodasPruebas = [...rePruebas, ...reAdminPruebas];

        const RE_IMG_EXT = /\.(jpg|jpeg|png|gif|webp)$/i;
        const reImageAttachmentPaths = reTodasPruebas.filter((p: string) => typeof p === 'string' && RE_IMG_EXT.test(p.split('?')[0]));
        const reFileAttachmentPaths = reTodasPruebas.filter((p: string) => typeof p === 'string' && !RE_IMG_EXT.test(p.split('?')[0]));
        const rePersistentImageUrls = await getPersistentIncidenciaAttachmentUrls(
          supabase,
          resendId,
          reImageAttachmentPaths,
          'https://vnprod.app',
        );
        const rePersistentFileUrls = await getPersistentIncidenciaAttachmentUrls(
          supabase,
          resendId,
          reFileAttachmentPaths,
          'https://vnprod.app',
        );

        const rePruebasHtml = reTodasPruebas.length > 0
          ? `<div style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
              <p style="margin:0 0 12px;font-weight:600;font-size:13px;color:#475569;">Pruebas adjuntas (${reTodasPruebas.length})</p>
              ${rePersistentImageUrls.length > 0 ? `<div style="overflow:hidden;margin-bottom:12px;font-size:0;">${rePersistentImageUrls.map((url: string, i: number) => `<a href="${url}" target="_blank" style="text-decoration:none;"><img src="${url}" alt="Evidencia ${i+1}" style="display:inline-block;width:30%;max-width:180px;height:auto;max-height:150px;border-radius:8px;border:1px solid #e2e8f0;object-fit:cover;margin:0 8px 8px 0;cursor:pointer;"></a>`).join('')}</div>` : ''}
              ${rePersistentFileUrls.map((url: string, i: number) => `<a href="${url}" target="_blank" style="display:inline-block;background:#64748b;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;text-decoration:none;margin:0 4px 4px 0;">Archivo adjunto ${i + 1} ↗</a>`).join('')}
            </div>` : '';

        const reLogoUrl = 'https://vnprod.app/images/logo-white.png';
        const reLogoGreenUrl = 'https://vnprod.app/images/verdnatura-logo-green.png';

        const reEmailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Poppins','Segoe UI',Arial,sans-serif;letter-spacing:-0.01em;">
<div style="max-width:620px;margin:0 auto;padding:20px;">
  <div style="background:${reEmailTheme.headerGradient};border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <img src="${reLogoUrl}" alt="Verdnatura" width="56" height="56" style="width:56px;height:56px;margin-bottom:12px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;font-family:'Poppins','Segoe UI',sans-serif;">Control de Incidencias</h1>
    <p style="margin:4px 0 0;color:${reEmailTheme.subtitleColor};font-size:12px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">Comunicación disciplinaria</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;border-radius:0 0 16px 16px;">
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:${reEmailTheme.accent};text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Trabajador/es</p>
      ${reWorkerBadges}
    </div>
    <div style="line-height:1.75;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;white-space:pre-wrap;letter-spacing:-0.01em;">${reEmailBody.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<span style="font-weight:600;color:#1e293b">$1</span>')}</div>
    ${rePruebasHtml}
    <div style="margin-top:28px;line-height:1.4;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">
      <p style="margin:0 0 16px;">Muchas gracias y un saludo,</p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-right:16px;vertical-align:middle;"><img src="${reLogoGreenUrl}" alt="Verdnatura" width="40" height="40" style="width:40px;height:40px;display:block;"></td>
          <td style="padding-right:16px;border-right:2px solid ${reEmailTheme.accent};vertical-align:middle;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#1a1a1a;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.02em;line-height:1.3;">Álvaro Mas</p>
            <p style="margin:1px 0 0;font-size:12px;font-weight:400;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.3;">VerdNatura Levante S.L.</p>
          </td>
          <td style="padding-left:16px;vertical-align:middle;">
            <p style="margin:0 0 2px;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">+34 661 95 84 33</p>
            <p style="margin:0;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">Carrer Fenollar, 2, 46680 Algemesí</p>
          </td>
        </tr>
      </table>
    </div>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          ${reFecha ? `<td style="padding:3px 4px 3px 0;"><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${reFecha}</span></td>` : ''}
          <td style="padding:3px 4px;"><span style="display:inline-block;background:${reGravedadColor}18;color:${reGravedadColor};padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${reTipoLabel} · ${reGravedadLabel}</span></td>
          ${reDept ? `<td style="padding:3px 4px;"><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${reDept.name}</span></td>` : ''}
          ${reHora ? `<td style="padding:3px 4px 3px 0;"><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${reHora}</span></td>` : ''}
        </tr>
      </table>
    </div>
    <div style="margin-top:16px;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:6px;">
        <tr>
          <td style="width:3px;background:${reEmailTheme.accent};border-radius:2px;"></td>
          <td style="padding-left:10px;"><span style="font-size:11px;font-weight:600;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;">Reenviado desde Control de Incidencias · Verdnatura</span></td>
        </tr>
      </table>
      <p style="margin:0;font-size:11px;color:#94a3b8;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">${(() => { const d = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return d.charAt(0).toUpperCase() + d.slice(1); })()} · Este correo es confidencial y está destinado exclusivamente a los departamentos autorizados.</p>
    </div>
  </div>
</div></body></html>`;

        const resendRes = await sendEmailBrevo({
          from: 'Control Incidencias <incidencias@vnprod.app>',
          to: resendPrimary.length > 0 ? resendPrimary : [resendRecipients[0]],
          cc: resendPrimary.length > 0 ? resendCc : (resendRecipients.length > 1 ? resendRecipients.slice(1) : undefined),
          subject: reEmailSubject,
          html: reEmailHtml,
        });

        const resendResText = await resendRes.text();
        console.log('[resendPropuestaEmail] Resend status:', resendRes.status, 'Response:', resendResText);

        if (!resendRes.ok) {
          console.error('[resendPropuestaEmail] Resend error:', resendResText);
          return errorResponse('Error al reenviar email: ' + resendResText);
        }

        // Update stored email_html with the fresh version
        await supabase.from('incidencias_propuestas_rrhh').update({ email_html: reEmailHtml }).eq('id', resendId);
        await writeIncidenciasLog('reenviar_email', null, resendId, `Email reenviado por ${manager.name} a ${resendRecipients.join(', ')}`, { destinatarios: resendRecipients });
        return okResponse({ sent: true });
      }

      // =============================================
      // UPDATE PROPUESTA EMAIL FIELDS
      // =============================================
      case 'updatePropuestaEmail': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: upEmailId, email_subject: upSubject, email_body: upBody } = body;
        if (!upEmailId) return errorResponse('propuestaId required');
        const { data: upProp } = await supabase.from('incidencias_propuestas_rrhh').select('tipo, ai_analysis').eq('id', upEmailId).single();
        if (!upProp) return errorResponse('Propuesta not found');
        if (upProp.tipo !== 'nspp' && !(upProp as any).ai_analysis) return errorResponse('Primero debe completarse el análisis IA');
        const updateFields: Record<string, unknown> = {};
        if (upSubject !== undefined) updateFields.email_subject = upSubject;
        if (upBody !== undefined) updateFields.email_body = upBody;
        if (Object.keys(updateFields).length === 0) return errorResponse('No fields to update');
        const { error: upErr } = await supabase.from('incidencias_propuestas_rrhh').update(updateFields).eq('id', upEmailId);
        if (upErr) return errorResponse('Error: ' + upErr.message);
        return okResponse({ updated: true });
      }

      // =============================================
      // SEND NSPP DIRECT EMAIL (no draft needed)
      // =============================================
      case 'sendNsppDirectEmail': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: nsppSendId } = body;
        if (!nsppSendId) return errorResponse('propuestaId required');

        const { data: nsppProp } = await supabase.from('incidencias_propuestas_rrhh').select('*').eq('id', nsppSendId).single();
        if (!nsppProp) return errorResponse('Propuesta not found');
        if (nsppProp.tipo !== 'nspp') return errorResponse('Esta acción es solo para propuestas NSPP');

        const workerName = nsppProp.nspp_worker_name || '—';
        const workerNumber = nsppProp.nspp_worker_number || '—';
        const justificacion = nsppProp.nspp_justificacion || '';
        const solicitante = nsppProp.nspp_encargado_name || manager.name;

        // Get configured recipients
        const { data: nsppEmailConfigs } = await supabase
          .from('incidencias_email_config')
          .select('email, is_primary')
          .eq('activo', true)
          .order('is_primary', { ascending: false })
          .order('created_at');
        const nsppPrimaryEmails = (nsppEmailConfigs || []).filter((c: any) => c.is_primary).map((c: any) => c.email);
        const nsppCcEmails = (nsppEmailConfigs || []).filter((c: any) => !c.is_primary).map((c: any) => c.email);
        const nsppRecipients = [...nsppPrimaryEmails, ...nsppCcEmails];
        if (nsppRecipients.length === 0) return errorResponse('No hay emails destinatarios configurados. Configúralos en Ajustes.');

        const nsppToEmail = nsppPrimaryEmails[0] || nsppRecipients[0];

        // Generate email body with AI if justification exists
        let nsppEmailBody = '';
        if (justificacion.trim()) {
          try {
            const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
            if (LOVABLE_API_KEY) {
              const aiPrompt = `Redacta el cuerpo de un email informando que el trabajador ${workerName} (número ${workerNumber}) no supera el periodo de prueba (NSPP) y se solicita la extinción del contrato conforme al Art. 14.2 del Estatuto de los Trabajadores. Solicitado por: ${solicitante}. Comentarios del encargado: "${justificacion}". El email debe ser profesional y directo.`;
              const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'google/gemini-3-flash-preview',
                  messages: [
                    { role: 'system', content: 'Eres un asistente de RRHH de la empresa Verdnatura. Redacta emails profesionales, formales y concisos en español. No incluyas asunto, saludo ni despedida. Solo el cuerpo del mensaje.' },
                    { role: 'user', content: aiPrompt },
                  ],
                }),
              });
              if (aiResp.ok) {
                const aiData = await aiResp.json();
                nsppEmailBody = aiData.choices?.[0]?.message?.content || '';
              }
            }
          } catch (aiErr) { console.error('AI nspp email error:', aiErr); }
        }
        if (!nsppEmailBody) {
          nsppEmailBody = `Se comunica que el/la trabajador/a ${workerName} (número de fichar: ${workerNumber}) no supera el periodo de prueba, por lo que se solicita la extinción del contrato conforme al Art. 14.2 del Estatuto de los Trabajadores.`;
          if (justificacion.trim()) nsppEmailBody += '\n\nComentarios adicionales:\n' + justificacion.trim();
        }

        const nsppLogoUrl = "https://vnprod.app/images/logo-white.png";
        const nsppLogoGreenUrl = "https://vnprod.app/images/verdnatura-logo-green.png";
        const nsppAccentColor = '#d97706';
        const nsppSalixLink = 'https://salix.verdnatura.es/#!/worker/' + workerNumber;
        const nsppBodyHtml = nsppEmailBody.replace(/\n/g, '<br>');

        const nsppHtmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Poppins','Segoe UI',Arial,sans-serif;letter-spacing:-0.01em;">
<div style="max-width:620px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg, ${nsppAccentColor}, #b45309);border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <img src="${nsppLogoUrl}" alt="Verdnatura" width="56" height="56" style="width:56px;height:56px;margin-bottom:12px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;font-family:'Poppins','Segoe UI',sans-serif;">NSPP</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">No Supera Periodo de Prueba</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;border-radius:0 0 16px 16px;">
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:${nsppAccentColor};text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Trabajador/a</p>
      <span style="display:inline-block;background:${nsppAccentColor};color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;"><a href="${nsppSalixLink}" target="_blank" style="color:#fff;text-decoration:none;">${escapeHtml(workerName)} (${escapeHtml(workerNumber)})</a> →</span>
    </div>
    <div style="line-height:1.75;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.01em;">
      <div style="padding:16px 20px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin:0 0 16px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Solicitado por</p>
        <p style="margin:0;font-size:14px;color:#1a1a1a;font-family:'Poppins','Segoe UI',sans-serif;">${escapeHtml(solicitante)}</p>
      </div>
      <div style="padding:15px;background:#f8fafc;border-radius:12px;margin:16px 0;white-space:pre-wrap;">${nsppBodyHtml}</div>
    </div>
    <div style="margin-top:28px;line-height:1.4;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">
      <p style="margin:0 0 16px;">Muchas gracias y un saludo,</p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-right:16px;vertical-align:middle;"><img src="${nsppLogoGreenUrl}" alt="Verdnatura" width="40" height="40" style="width:40px;height:40px;display:block;"></td>
          <td style="padding-right:16px;border-right:2px solid #93d600;vertical-align:middle;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#1a1a1a;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.02em;line-height:1.3;">Álvaro Mas</p>
            <p style="margin:1px 0 0;font-size:12px;font-weight:400;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.3;">VerdNatura Levante S.L.</p>
          </td>
          <td style="padding-left:16px;vertical-align:middle;">
            <p style="margin:0 0 2px;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">+34 661 95 84 33</p>
            <p style="margin:0;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">Carrer Fenollar, 2, 46680 Algemesí</p>
          </td>
        </tr>
      </table>
    </div>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:4px 4px;">
        <tr>
          <td><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></td>
          <td><span style="display:inline-block;background:${nsppAccentColor}18;color:${nsppAccentColor};padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">NSPP</span></td>
        </tr>
      </table>
    </div>
    <div style="margin-top:20px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;">Enviado desde Control de Incidencias · Verdnatura</p>
      <p style="margin:0;font-size:11px;color:#94a3b8;font-family:'Poppins','Segoe UI',sans-serif;">Enviado por ${escapeHtml(manager.name)} · Este correo es confidencial.</p>
    </div>
  </div>
</div>
</body></html>`;

        const nsppSubject = 'NSPP - ' + workerName + ' (' + workerNumber + ')';

        const nsppEmailRes = await sendEmailBrevo({
          from: 'Incidencias <incidencias@vnprod.app>',
          to: nsppToEmail,
          subject: nsppSubject,
          html: nsppHtmlContent,
          cc: nsppCcEmails.length > 0 ? nsppCcEmails : undefined,
        });

        const nsppEmailResult = await nsppEmailRes.json();
        if (!nsppEmailRes.ok) return errorResponse(nsppEmailResult.message || 'Error sending email');

        // Update proposal status
        await supabase.from('incidencias_propuestas_rrhh').update({
          estado: 'enviada',
          aprobada_por: manager.name,
          aprobada_at: new Date().toISOString(),
        }).eq('id', nsppSendId);

        // Create an incidencias_records entry so NSPP appears in historial
        const nsppDeptId = nsppProp.department_id;
        const nsppEncargadoName = nsppProp.nspp_encargado_name || manager.name;
        const { data: nsppRecord } = await supabase
          .from('incidencias_records')
          .insert({
            department_id: nsppDeptId,
            category_id: null,
            custom_category_name: null,
            fecha: new Date().toISOString(),
            descripcion: justificacion || `No supera el periodo de prueba (Art. 14.2 ET)`,
            estado: 'archivada',
            created_by_id: manager.id,
            created_by_name: nsppEncargadoName,
            accion_propuesta: 'nspp',
            origen: 'manual',
          })
          .select()
          .single();

        if (nsppRecord) {
          // Find the worker_id from incidencias_workers by number
          let nsppWorkerId: string | null = null;
          if (workerNumber && workerNumber !== '—') {
            const { data: nsppW } = await supabase
              .from('incidencias_workers')
              .select('id')
              .eq('worker_number', workerNumber)
              .maybeSingle();
            if (nsppW) nsppWorkerId = nsppW.id;
          }
          await supabase.from('incidencias_record_workers').insert({
            record_id: nsppRecord.id,
            worker_id: nsppWorkerId || 'unknown',
            worker_name: workerName,
            worker_number: workerNumber !== '—' ? workerNumber : null,
          });
        }

        await writeIncidenciasLog('send_nspp_email', nsppRecord?.id || null, nsppSendId, `Email NSPP enviado para ${workerName} por ${manager.name}`, null);

        return okResponse({ sent: true, emailId: nsppEmailResult.id });
      }


      // =============================================
      case 'updatePropuestaGravedad': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: ugId, gravedad: ugGravedad } = body;
        if (!ugId || !ugGravedad) return errorResponse('propuestaId and gravedad required');
        if (!['leve', 'grave', 'muy_grave'].includes(ugGravedad)) return errorResponse('Invalid gravedad');
        const { data: ugProp } = await supabase.from('incidencias_propuestas_rrhh').select('gravedad, ai_analysis').eq('id', ugId).single();
        if (!ugProp) return errorResponse('Propuesta not found');
        if (!(ugProp as any).ai_analysis) return errorResponse('Primero debe completarse el análisis IA');
        const ugUpdateFields: Record<string, unknown> = { gravedad: ugGravedad };
        // If admin downgrades from muy_grave, clear the audiencia previa requirement
        if (ugGravedad !== 'muy_grave') {
          ugUpdateFields.requiere_audiencia_previa = false;
          ugUpdateFields.audiencia_previa_completada_at = null;
          ugUpdateFields.audiencia_previa_notas = null;
          ugUpdateFields.pliego_cargos_html = null;
          ugUpdateFields.pliego_cargos_generado_at = null;
        }
        const { error: ugErr } = await supabase.from('incidencias_propuestas_rrhh').update(ugUpdateFields).eq('id', ugId);
        if (ugErr) return errorResponse('Error: ' + ugErr.message);
        supabase.from('incidencias_propuestas_changelog').insert({ propuesta_id: ugId, campo: 'gravedad', valor_anterior: ugProp?.gravedad || null, valor_nuevo: ugGravedad, cambiado_por: manager!.name }).then(() => {}).catch(() => {});
        await writeIncidenciasLog('update_gravedad', null, ugId, `Gravedad cambiada a ${ugGravedad} por ${manager.name}`, null);
        return okResponse({ updated: true });
      }

      // =============================================
      // UPDATE PROPUESTA TIPO (amonestacion <-> sancion)
      // =============================================
      case 'updatePropuestaTipo': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: utId, tipo: utTipo, gravedad: utGravedad } = body;
        if (!utId || !utTipo) return errorResponse('propuestaId and tipo required');
        if (!['amonestacion', 'sancion'].includes(utTipo)) return errorResponse('Invalid tipo');

        const { data: utOld } = await supabase.from('incidencias_propuestas_rrhh').select('tipo, gravedad, ai_analysis').eq('id', utId).single();
        if (!utOld) return errorResponse('Propuesta not found');
        if (!(utOld as any).ai_analysis) return errorResponse('Primero debe completarse el análisis IA');

        const { data: utCurrent } = await supabase.from('incidencias_propuestas_rrhh').select('suspension_dias, fecha_inicio, suspension_fechas').eq('id', utId).single();

        const updateFields: Record<string, unknown> = { tipo: utTipo };
        if (utTipo === 'amonestacion') {
          updateFields.gravedad = 'leve';
          updateFields.suspension_dias = null;
          updateFields.suspension_fechas = null;
          updateFields.sin_suspension_explicita = false;
        } else {
          const newGravedad = (utGravedad && ['leve', 'grave', 'muy_grave'].includes(utGravedad)) ? utGravedad : 'leve';
          updateFields.gravedad = newGravedad;
          const normalized = normalizeLegalData({
            tipo: utTipo,
            gravedad: newGravedad,
            suspension_dias: utCurrent?.suspension_dias ?? null,
            sin_suspension_explicita: true,
            fecha_inicio: utCurrent?.fecha_inicio ?? null,
            existing_fechas: utCurrent?.suspension_fechas ?? null,
          });
          updateFields.suspension_dias = normalized.suspension_dias;
          updateFields.sin_suspension_explicita = normalized.sin_suspension_explicita === true;
          if (normalized.suspension_fechas) updateFields.suspension_fechas = normalized.suspension_fechas;
        }
        // If final gravedad is not muy_grave, clear audiencia previa flags
        if (updateFields.gravedad !== 'muy_grave') {
          updateFields.requiere_audiencia_previa = false;
          updateFields.audiencia_previa_completada_at = null;
          updateFields.audiencia_previa_notas = null;
          updateFields.pliego_cargos_html = null;
          updateFields.pliego_cargos_generado_at = null;
        }

        const { error: utErr } = await supabase.from('incidencias_propuestas_rrhh').update(updateFields).eq('id', utId);
        if (utErr) return errorResponse('Error: ' + utErr.message);
        const utChanges: Array<{ propuesta_id: string; campo: string; valor_anterior: string | null; valor_nuevo: string | null; cambiado_por: string }> = [];
        if (utOld?.tipo !== utTipo) utChanges.push({ propuesta_id: utId, campo: 'tipo', valor_anterior: utOld?.tipo || null, valor_nuevo: utTipo, cambiado_por: manager!.name });
        if (utGravedad && utOld?.gravedad !== utGravedad) utChanges.push({ propuesta_id: utId, campo: 'gravedad', valor_anterior: utOld?.gravedad || null, valor_nuevo: utGravedad, cambiado_por: manager!.name });
        if (utChanges.length > 0) supabase.from('incidencias_propuestas_changelog').insert(utChanges).then(() => {}).catch(() => {});
        await writeIncidenciasLog('update_tipo', null, utId, `Tipo cambiado a ${utTipo}${utTipo === 'sancion' && utGravedad ? ` (${utGravedad})` : ''} por ${manager.name}`, { tipo: utTipo, gravedad: utGravedad || null });
        return okResponse({ updated: true });
      }

      // =============================================
      // UPDATE PROPUESTA SUSPENSION (dates + days)
      // =============================================
      case 'updatePropuestaSuspension': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: usId, suspension_dias: usDias, suspension_fechas: usFechas, fecha_inicio: usFechaInicio, sin_suspension_explicita: usSinSuspensionExplicita } = body;
        if (!usId) return errorResponse('propuestaId required');
        const { data: usOld } = await supabase.from('incidencias_propuestas_rrhh').select('tipo, gravedad, suspension_dias, suspension_fechas, fecha_inicio, ai_analysis, sin_suspension_explicita').eq('id', usId).single();
        if (!usOld) return errorResponse('Propuesta not found');
        if (!(usOld as any).ai_analysis) return errorResponse('Primero debe completarse el análisis IA');
        const usSinSuspension = usSinSuspensionExplicita === true;
        const shouldNormalize = usDias !== undefined || usFechas !== undefined || usFechaInicio !== undefined || usSinSuspensionExplicita !== undefined;
        const normalized = shouldNormalize
          ? normalizeLegalData({
              tipo: (usOld as any).tipo || 'sancion',
              gravedad: (usOld as any).gravedad || 'leve',
              suspension_dias: usDias ?? (usOld as any).suspension_dias ?? 0,
              sin_suspension_explicita: usSinSuspension,
              fecha_inicio: usFechaInicio ?? (usOld as any).fecha_inicio ?? null,
              existing_fechas: Array.isArray(usFechas) ? usFechas : ((usOld as any).suspension_fechas || null),
            })
          : null;
        const usUpdates: Record<string, unknown> = {};
        if (normalized) {
          usUpdates.suspension_dias = normalized.suspension_dias;
          usUpdates.suspension_fechas = normalized.suspension_fechas;
          usUpdates.sin_suspension_explicita = normalized.sin_suspension_explicita === true;
        }
        if (usSinSuspensionExplicita !== undefined) {
          usUpdates.sin_suspension_explicita = usSinSuspension;
        }
        if (usFechaInicio !== undefined) usUpdates.fecha_inicio = usFechaInicio;
        const { error: usErr } = await supabase.from('incidencias_propuestas_rrhh').update(usUpdates).eq('id', usId);
        if (usErr) return errorResponse('Error: ' + usErr.message);
        const usChanges: Array<{ propuesta_id: string; campo: string; valor_anterior: string | null; valor_nuevo: string | null; cambiado_por: string }> = [];
        if (normalized && normalized.suspension_dias !== usOld?.suspension_dias) usChanges.push({ propuesta_id: usId, campo: 'suspension_dias', valor_anterior: String(usOld?.suspension_dias ?? 0), valor_nuevo: String(normalized.suspension_dias ?? 0), cambiado_por: manager!.name });
        if (normalized && JSON.stringify(normalized.suspension_fechas || []) !== JSON.stringify(usOld?.suspension_fechas || [])) usChanges.push({ propuesta_id: usId, campo: 'suspension_fechas', valor_anterior: JSON.stringify(usOld?.suspension_fechas || []), valor_nuevo: JSON.stringify(normalized.suspension_fechas || []), cambiado_por: manager!.name });
        if (usSinSuspensionExplicita !== undefined && Boolean((usOld as any).sin_suspension_explicita) !== usSinSuspension) usChanges.push({ propuesta_id: usId, campo: 'sin_suspension_explicita', valor_anterior: String(Boolean((usOld as any).sin_suspension_explicita)), valor_nuevo: String(usSinSuspension), cambiado_por: manager!.name });
        if (usChanges.length > 0) supabase.from('incidencias_propuestas_changelog').insert(usChanges).then(() => {}).catch(() => {});
        await writeIncidenciasLog('update_suspension', null, usId, `Suspensión actualizada: ${normalized?.suspension_dias ?? usDias ?? 0} días por ${manager.name}`, { ...usUpdates, sin_suspension_explicita: usSinSuspension });

        // OPTIMIZATION: Changing suspension days does NOT change the legal
        // fundamentation (tipo, gravedad, articles, motivos) — those remain
        // identical. So we DO NOT re-call the AI nor regenerate the document
        // from scratch (slow + risk of losing the curated text). Instead we
        // patch the existing HTML in-place: rewrite day count and date range.
        let documentGenerated = false;
        let documentGenerationError: string | null = null;

        try {
          const newDias = (normalized?.suspension_dias ?? usDias ?? 0) as number;
          const newFechas = (normalized?.suspension_fechas
            ?? (Array.isArray(usFechas) ? usFechas : null)
            ?? (usOld as any).suspension_fechas
            ?? null) as string[] | null;
          const newFechaInicio = (usFechaInicio ?? (usOld as any).fecha_inicio ?? null) as string | null;

          // Find all non-anulled legal documents for this propuesta (one per worker).
          const { data: existingDocs, error: existingErr } = await supabase
            .from('incidencias_legal_documents')
            .select('id, html_content, anulado, firmado')
            .eq('propuesta_id', usId)
            .eq('anulado', false);

          if (existingErr) {
            documentGenerationError = existingErr.message;
          } else if (!existingDocs || existingDocs.length === 0) {
            // No existing doc: generate from scratch.
            const supabaseAnonKeyUs = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const legalRes = await fetch(`${supabaseUrl}/functions/v1/incidencias-operations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKeyUs}` },
              body: JSON.stringify({ action: 'generateLegalDocument', sessionToken, propuestaId: usId }),
            });
            const legalData = await legalRes.json().catch(() => null);
            documentGenerated = !!(legalRes.ok && legalData?.success);
            if (!documentGenerated) documentGenerationError = legalData?.error || `HTTP ${legalRes.status}`;
          } else {
            // Surgical block rebuild: replace ONLY the "Medida disciplinaria"
            // block in unsigned docs with a freshly-built deterministic block
            // reflecting the new suspension days/dates. Everything else
            // (exposición, fundamentación, calificación, firma, footer) stays
            // exactly as it was.
            const tipo = String((usOld as any).tipo || 'sancion');
            const sinSuspExpl = (usUpdates as any).sin_suspension_explicita === true
              || (usUpdates as any).sin_suspension_explicita === undefined && Boolean((usOld as any).sin_suspension_explicita);
            const effectiveDias = sinSuspExpl ? 0 : newDias;
            const effectiveFechaInicio = sinSuspExpl ? null : newFechaInicio;

            // Build the new medida disciplinaria text deterministically.
            const sanctionLabel = tipo === 'amonestacion'
              ? 'una amonestación por escrito'
              : effectiveDias && effectiveDias > 0
                ? `una suspensión de empleo y sueldo de ${effectiveDias} día(s)`
                : 'una sanción disciplinaria formal sin suspensión de empleo y sueldo';
            const fechaInicioText = formatLegalDate(effectiveFechaInicio || undefined);
            const fechaFinText = effectiveDias && effectiveFechaInicio
              ? formatLegalDate(addDaysToDate(effectiveFechaInicio, Math.max(effectiveDias - 1, 0)))
              : '';
            const medidaText = tipo === 'amonestacion'
              ? `Como consecuencia de lo anterior, la empresa acuerda imponer ${sanctionLabel}, medida que se considera proporcionada a la entidad de la conducta. Se advierte que ulteriores incumplimientos podrán dar lugar a medidas disciplinarias de mayor intensidad.`
              : effectiveDias && effectiveDias > 0
                ? `Como consecuencia de la calificación efectuada, la empresa acuerda imponer ${sanctionLabel}${fechaInicioText ? `, con efectos desde el ${fechaInicioText}${fechaFinText ? ` hasta el ${fechaFinText}, ambos inclusive` : ''}` : ''}. Durante el período de suspensión el contrato permanecerá en situación de suspensión de empleo y sueldo.`
                : `Como consecuencia de la calificación efectuada, la empresa acuerda imponer ${sanctionLabel}. La empresa ha decidido <strong>no aplicar la suspensión de empleo y sueldo</strong>, dejando constancia formal en el expediente. Esta atenuación <strong>no constituye precedente</strong>.`;
            const medidaReinforced = reinforceMedidaDisciplinariaSemibold(
              medidaText,
              { tipo, suspensionDias: effectiveDias, fechaInicio: effectiveFechaInicio || undefined },
            );
            const badge = tipo === 'amonestacion' ? 'AMONESTACIÓN' : effectiveDias ? 'SUSPENSIÓN' : 'SANCIÓN';
            const medidaParas = String(medidaReinforced)
              .split(/\n\s*\n/)
              .map(p => p.trim())
              .filter(Boolean)
              .map(p => `<p>${p}</p>`)
              .join('');
            const newMedidaBlockInner =
              `<div style="margin-bottom:10px"><span class="badge-inline">${badge}</span></div>${medidaParas}`;

            // Regex matches: <h2>Medida disciplinaria</h2> ... <div class="advertencias"> ... </div>
            // (non-greedy, multi-line). Preserves any sidebar wrapper around it.
            const medidaBlockRegex = /(<h2>\s*Medida disciplinaria\s*<\/h2>\s*<div\s+class="advertencias"[^>]*>)([\s\S]*?)(<\/div>)/i;

            let patchedAny = false;
            let patchErr: string | null = null;
            for (const d of existingDocs) {
              if (d.firmado) continue; // immutable
              const original = (d as any).html_content as string | null;
              if (!original) continue;
              let updated = original;
              if (medidaBlockRegex.test(updated)) {
                updated = updated.replace(medidaBlockRegex, (_m, pre, _inner, post) => `${pre}${newMedidaBlockInner}${post}`);
              } else {
                // Fallback to legacy text-level substitution if the block isn't found.
                updated = enforceSuspensionDaysInText(updated, { suspensionDias: effectiveDias, fechaInicio: effectiveFechaInicio, suspensionFechas: newFechas });
              }
              if (updated !== original) {
                const { error: upErr } = await supabase
                  .from('incidencias_legal_documents')
                  .update({ html_content: updated, updated_at: new Date().toISOString() })
                  .eq('id', (d as any).id);
                if (upErr) { patchErr = upErr.message; }
                else { patchedAny = true; }
              } else {
                patchedAny = true;
              }
            }
            documentGenerated = patchedAny && !patchErr;
            if (patchErr) documentGenerationError = patchErr;
          }
        } catch (e: any) {
          documentGenerationError = e?.message || 'unknown_error';
          console.error('Patch legal doc after updatePropuestaSuspension failed:', e);
        }

        return okResponse({
          updated: true,
          analysis_regenerated: true, // analysis kept intact (no re-run needed)
          analysis_error: null,
          document_generated: documentGenerated,
          document_generation_error: documentGenerationError,
        });
      }

      // =============================================
      // APPLY AI RECOMMENDATION (tipo + gravedad + suspension + regenerate doc)
      // =============================================
      case 'applyAiRecommendationFull': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: arId } = body;
        if (!arId) return errorResponse('propuestaId required');

        const { data: arProp, error: arPropErr } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('*')
          .eq('id', arId)
          .single();
        if (arPropErr || !arProp) return errorResponse('Propuesta not found');

        let arRecord: any = null;
        if ((arProp as any).record_id) {
          const { data: arRecordData } = await supabase
            .from('incidencias_records')
            .select('fecha, propuesta_fecha_inicio, ai_tipo_recomendado, ai_gravedad_recomendada, ai_dias_suspension_sugeridos, ai_motivo_legal, ai_tipo_razonamiento')
            .eq('id', (arProp as any).record_id)
            .single();
          arRecord = arRecordData || null;
        }

        const arAnalysis = ((arProp as any).ai_analysis && typeof (arProp as any).ai_analysis === 'object')
          ? (arProp as any).ai_analysis
          : null;
        const hasAnalysisSignals = !!(
          arAnalysis?.tipo_recomendado ||
          arAnalysis?.gravedad_recomendada ||
          arAnalysis?.dias_suspension_recomendados != null ||
          arRecord?.ai_tipo_recomendado ||
          arRecord?.ai_gravedad_recomendada ||
          arRecord?.ai_dias_suspension_sugeridos != null ||
          arRecord?.ai_motivo_legal ||
          arRecord?.ai_tipo_razonamiento
        );
        if (!hasAnalysisSignals) return errorResponse('Primero debe completarse el análisis IA');

        const inferredTipo = arAnalysis?.tipo_recomendado
          || arRecord?.ai_tipo_recomendado
          || ((arAnalysis?.gravedad_recomendada || arRecord?.ai_gravedad_recomendada || arAnalysis?.dias_suspension_recomendados || arRecord?.ai_dias_suspension_sugeridos)
            ? 'sancion'
            : ((arProp as any).tipo || 'amonestacion'));
        const arTipo = inferredTipo === 'sancion' ? 'sancion' : 'amonestacion';
        const arGravedad = arTipo === 'amonestacion'
          ? 'leve'
          : (arAnalysis?.gravedad_recomendada || arRecord?.ai_gravedad_recomendada || (arProp as any).gravedad || 'leve');
        const arDias = arTipo === 'amonestacion'
          ? 0
          : (arAnalysis?.dias_suspension_recomendados ?? arRecord?.ai_dias_suspension_sugeridos ?? (arProp as any).suspension_dias ?? 0);
        const arFechaInicio = (arProp as any).fecha_inicio || arRecord?.propuesta_fecha_inicio || arRecord?.fecha?.split('T')[0] || null;

        const arNormalized = normalizeLegalData({
          tipo: arTipo,
          gravedad: arGravedad,
          suspension_dias: arDias,
          sin_suspension_explicita: arTipo === 'sancion' && Number(arDias ?? 0) === 0,
          fecha_inicio: arFechaInicio,
          existing_fechas: Array.isArray((arProp as any).suspension_fechas) ? (arProp as any).suspension_fechas : null,
        });

        const arUpdate: Record<string, unknown> = {
          tipo: arNormalized.tipo,
          gravedad: arNormalized.gravedad,
          suspension_dias: arNormalized.suspension_dias,
          suspension_fechas: arNormalized.suspension_fechas,
          sin_suspension_explicita: arNormalized.sin_suspension_explicita === true,
          fecha_inicio: arFechaInicio,
        };
        const { error: arErr } = await supabase.from('incidencias_propuestas_rrhh').update(arUpdate).eq('id', arId);
        if (arErr) return errorResponse('Error updating: ' + arErr.message);

        const arChanges: Array<{ propuesta_id: string; campo: string; valor_anterior: string | null; valor_nuevo: string | null; cambiado_por: string }> = [];
        if ((arProp as any).tipo !== arNormalized.tipo) arChanges.push({ propuesta_id: arId, campo: 'tipo', valor_anterior: (arProp as any).tipo, valor_nuevo: arNormalized.tipo, cambiado_por: manager!.name });
        if ((arProp as any).gravedad !== arNormalized.gravedad) arChanges.push({ propuesta_id: arId, campo: 'gravedad', valor_anterior: (arProp as any).gravedad, valor_nuevo: arNormalized.gravedad!, cambiado_por: manager!.name });
        if ((arProp as any).suspension_dias !== arNormalized.suspension_dias) arChanges.push({ propuesta_id: arId, campo: 'suspension_dias', valor_anterior: String((arProp as any).suspension_dias ?? 0), valor_nuevo: String(arNormalized.suspension_dias ?? 0), cambiado_por: manager!.name });
        if (arChanges.length > 0) supabase.from('incidencias_propuestas_changelog').insert(arChanges).then(() => {}).catch(() => {});
        await writeIncidenciasLog('apply_ai_recommendation', null, arId, `Recomendación IA aplicada: ${arNormalized.tipo} (${arNormalized.gravedad})${arNormalized.suspension_dias ? ` ${arNormalized.suspension_dias}d suspensión` : ''} por ${manager.name}`, arUpdate);

        const supabaseAnonKeyAr = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        let docGenerated = false;
        try {
          const legalRes = await fetch(`${supabaseUrl}/functions/v1/incidencias-operations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKeyAr}` },
            body: JSON.stringify({ action: 'generateLegalDocument', sessionToken, propuestaId: arId, force_regenerate: true }),
          });
          if (legalRes.ok) {
            const legalData = await legalRes.json();
            docGenerated = !!legalData?.success;
          }
        } catch (e) {
          console.error('Auto-generate legal doc failed:', e);
        }

        return okResponse({
          success: true,
          applied: {
            tipo: arNormalized.tipo,
            gravedad: arNormalized.gravedad,
            suspension_dias: arNormalized.suspension_dias,
            suspension_fechas: arNormalized.suspension_fechas,
            fecha_inicio: arFechaInicio,
          },
          document_generated: docGenerated,
        });
      }

      // =============================================
      // =============================================
      // ADMIN PROPOSAL IMAGE MANAGEMENT
      // =============================================
      case 'addAdminProposalImage': {
        // This is now primarily handled by handleFileUpload (multipart).
        // This JSON fallback accepts a pre-uploaded imagePath.
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: addImgPropId, imagePath, filePath: addFilePath } = body;
        const pathToAdd = addFilePath || imagePath;
        if (!addImgPropId || !pathToAdd) return errorResponse('propuestaId and imagePath required');

        const { data: addImgProp } = await supabase.from('incidencias_propuestas_rrhh').select('admin_pruebas_urls').eq('id', addImgPropId).single();
        if (!addImgProp) return errorResponse('Propuesta not found');

        const currentUrls: string[] = Array.isArray((addImgProp as any).admin_pruebas_urls) ? (addImgProp as any).admin_pruebas_urls : [];
        currentUrls.push(pathToAdd);

        const { error: updateErr } = await supabase.from('incidencias_propuestas_rrhh').update({ admin_pruebas_urls: currentUrls }).eq('id', addImgPropId);
        if (updateErr) return errorResponse('Failed to update proposal images');

        const { data: signedData } = await supabase.storage.from('incidencias-pruebas').createSignedUrl(pathToAdd, 3600);
        writeIncidenciasLog('add_admin_image', null, addImgPropId, `Admin ${manager.name} añadió imagen: ${pathToAdd}`, null);
        return okResponse({ path: pathToAdd, signedUrl: signedData?.signedUrl || '', admin_pruebas_urls: currentUrls });
      }

      case 'removeAdminProposalImage': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: rmImgPropId, imagePath: rmImagePath, filePath: rmFilePath } = body;
        const pathToRemove = rmFilePath || rmImagePath;
        if (!rmImgPropId || !pathToRemove) return errorResponse('propuestaId and filePath required');

        const { data: rmImgProp } = await supabase.from('incidencias_propuestas_rrhh').select('admin_pruebas_urls').eq('id', rmImgPropId).single();
        if (!rmImgProp) return errorResponse('Propuesta not found');

        const updatedUrls = (Array.isArray((rmImgProp as any).admin_pruebas_urls) ? (rmImgProp as any).admin_pruebas_urls : []).filter((p: string) => p !== pathToRemove);
        await supabase.from('incidencias_propuestas_rrhh').update({ admin_pruebas_urls: updatedUrls }).eq('id', rmImgPropId);
        await supabase.storage.from('incidencias-pruebas').remove([pathToRemove]);
        writeIncidenciasLog('remove_admin_image', null, rmImgPropId, `Admin ${manager.name} eliminó imagen: ${pathToRemove}`, null);
        return okResponse({ removed: true, admin_pruebas_urls: updatedUrls });
      }

      case 'toggleManagerEvidence': {
        // Soft-disable (or re-enable) a manager-uploaded evidence path so the AI ignores it
        // when generating legal documents. The original file is preserved for audit.
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: tmePropId, filePath: tmePath, disabled: tmeDisabled } = body;
        if (!tmePropId || !tmePath) return errorResponse('propuestaId and filePath required');

        const { data: tmeProp } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('disabled_manager_pruebas')
          .eq('id', tmePropId)
          .single();
        if (!tmeProp) return errorResponse('Propuesta not found');

        const currentDisabled: string[] = Array.isArray((tmeProp as any).disabled_manager_pruebas)
          ? (tmeProp as any).disabled_manager_pruebas
          : [];
        const shouldDisable = tmeDisabled !== false; // default true
        let nextDisabled: string[];
        if (shouldDisable) {
          nextDisabled = currentDisabled.includes(tmePath) ? currentDisabled : [...currentDisabled, tmePath];
        } else {
          nextDisabled = currentDisabled.filter((p: string) => p !== tmePath);
        }
        await supabase
          .from('incidencias_propuestas_rrhh')
          .update({ disabled_manager_pruebas: nextDisabled })
          .eq('id', tmePropId);
        writeIncidenciasLog(
          shouldDisable ? 'disable_manager_evidence' : 'enable_manager_evidence',
          null,
          tmePropId,
          `Admin ${manager.name} ${shouldDisable ? 'desactivó' : 'reactivó'} evidencia del encargado: ${tmePath}`,
          null,
        );
        return okResponse({ disabled_manager_pruebas: nextDisabled });
      }

      case 'saveCollageLayout': {
        // Admin saves a manual collage layout JSON. The structure is opaque to
        // the server — we only validate basic shape and persist it. This layout
        // will later be inlined verbatim by the legal-doc generator instead of
        // letting the AI auto-build the evidence collage.
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: clPropId, layout: clLayout } = body;
        if (!clPropId) return errorResponse('propuestaId required');
        if (clLayout !== null && (typeof clLayout !== 'object' || Array.isArray(clLayout))) {
          return errorResponse('layout must be an object or null');
        }
        if (clLayout && (!Array.isArray((clLayout as any).frames))) {
          return errorResponse('layout.frames must be an array');
        }
        const { error: clErr } = await supabase
          .from('incidencias_propuestas_rrhh')
          .update({ collage_layout: clLayout })
          .eq('id', clPropId);
        if (clErr) {
          console.error('saveCollageLayout failed:', clErr);
          return errorResponse(`No se pudo guardar el collage: ${clErr.message}`);
        }
        writeIncidenciasLog(
          'save_collage_layout',
          null,
          clPropId,
          clLayout
            ? `Admin ${manager.name} guardó maquetación manual del collage (${(clLayout as any).frames?.length || 0} imágenes)`
            : `Admin ${manager.name} eliminó la maquetación manual del collage`,
          null,
        );
        return okResponse({ saved: true });
      }

      case 'getProposalImageUrl': {
        // Allow both admin and encargado to view evidence images

        const { filePath: imgPath } = body;
        if (!imgPath) return errorResponse('filePath required');

        const normalizedPath = String(imgPath).trim();
        
        // Extract storage path from any URL format containing incidencias-pruebas
        let storagePath = normalizedPath;
        if (/^https?:\/\//i.test(normalizedPath)) {
          // Try to extract path from signed or public URL
          const bucketMatch = normalizedPath.match(/incidencias-pruebas\/([^?]+)/);
          if (bucketMatch) {
            storagePath = decodeURIComponent(bucketMatch[1]);
          } else {
            // Unrecognized external URL — cannot re-sign, return error
            console.error('getProposalImageUrl: unrecognized URL format', normalizedPath);
            return errorResponse('URL de archivo expirada. Re-suba el archivo.');
          }
        }

        const { data: signedData, error: signError } = await supabase.storage.from('incidencias-pruebas').createSignedUrl(storagePath, 3600);
        if (signError) {
          console.error('getProposalImageUrl signing failed', { normalizedPath, storagePath, error: signError.message });
          return errorResponse('No se pudo abrir el archivo');
        }

        return okResponse({ url: signedData?.signedUrl || '' });
      }

      // =============================================
      // GENERATE EMAIL DRAFT V2 (cercano) — with multimodal images
      // =============================================
      // =============================================
      // ANALYZE PROPOSAL WITH AI (complete analysis)
      // =============================================
      case 'analyzeProposal': {
        // When called from updatePropuestaSuspension, the admin has just
        // manually chosen suspension_dias / suspension_fechas. We MUST NOT
        // let the AI re-recommendation overwrite those values, otherwise
        // the legal document will keep showing the old number even though
        // the admin saved a new one. The narrative (motivo legal,
        // fundamentación, etc.) is still refreshed.
        const preserveUserSuspension = body?.preserve_user_suspension === true;
        // Allow both admin and encargado (for auto-analysis on creation)
        const { propuestaId: analyzePropId, instrucciones_usuario: userInstructions, use_lite_model: useLiteModel } = body;
        const analyzeStartTime = new Date();
        if (!analyzePropId) return errorResponse('propuestaId required');

        const { data: prop } = await supabase.from('incidencias_propuestas_rrhh').select('*').eq('id', analyzePropId).single();
        if (!prop) return errorResponse('Propuesta not found');

        // Get record + workers + department + clock data in parallel
        const isNspp = (prop as any).tipo === 'nspp';
        const recordId = prop.record_id;

        let rec: any = null;
        let recWorkers: any[] = [];
        let deptName = '';
        let clockEntries: any[] = [];
        let workerStats: any[] = [];

        if (isNspp) {
          // NSPP: no underlying record
          const { data: dept } = await supabase.from('incidencias_departments').select('name').eq('id', prop.department_id).single();
          deptName = dept?.name || '';
        } else if (recordId) {
          const [recRes, rwRes, deptRes, catRes] = await Promise.all([
            supabase.from('incidencias_records').select('*, incidencias_categories(name, gravedad)').eq('id', recordId).single(),
            supabase.from('incidencias_record_workers').select('worker_id, worker_name, worker_number').eq('record_id', recordId),
            supabase.from('incidencias_departments').select('name').eq('id', prop.department_id).single(),
            Promise.resolve(null),
          ]);
          rec = recRes.data;
          recWorkers = rwRes.data || [];
          deptName = deptRes.data?.name || '';

          // Get worker stats + clock entries for context
          const workerIds = recWorkers.map((w: any) => w.worker_id).filter(Boolean);
          if (workerIds.length > 0) {
            const [statsRes, clockRes] = await Promise.all([
              supabase.from('incidencias_worker_stats').select('*').in('worker_id', workerIds),
              supabase.from('clock_entries').select('*').in('worker_id', workerIds).order('punched_at', { ascending: false }).limit(20),
            ]);
            workerStats = statsRes.data || [];
            clockEntries = clockRes.data || [];
          }
        }

        // ── Prior amonestations breakdown by category (for "advertencia previa" — Art. 50.3.a / 50.3.k) ──
        // Counts include amonestations from approved/sent/sancionada proposals only (formally documented warnings).
        // Indexed by worker_id then by category name.
        const amonestacionesPorCategoriaPorTrabajador: Record<string, { por_categoria: Record<string, { count: number; ultima_fecha: string | null; ultima_descripcion: string }>; total: number }> = {};
        if (!isNspp && recWorkers.length > 0) {
          const workerIdsForWarn = recWorkers.map((w: any) => w.worker_id).filter(Boolean);
          if (workerIdsForWarn.length > 0) {
            try {
              // Find ALL prior records for these workers (excluding the current one)
              const { data: priorRecordWorkers } = await supabase
                .from('incidencias_record_workers')
                .select('worker_id, record_id')
                .in('worker_id', workerIdsForWarn);

              const priorRecIds = [...new Set((priorRecordWorkers || []).map((rw: any) => rw.record_id))]
                .filter((rid: string) => rid !== recordId);

              if (priorRecIds.length > 0) {
                // Find proposals for those records that ended as amonestaciones formales (aprobada/enviada)
                const { data: priorProps } = await supabase
                  .from('incidencias_propuestas_rrhh')
                  .select('record_id, tipo, estado, aprobada_at, created_at')
                  .in('record_id', priorRecIds)
                  .eq('tipo', 'amonestacion')
                  .in('estado', ['aprobada', 'enviada', 'sancionada']);

                const validAmonestRecIds = new Set((priorProps || []).map((p: any) => p.record_id));

                if (validAmonestRecIds.size > 0) {
                  const { data: amonestRecs } = await supabase
                    .from('incidencias_records')
                    .select('id, fecha, descripcion, incidencias_categories(name, gravedad)')
                    .in('id', [...validAmonestRecIds])
                    .is('deleted_at', null);

                  for (const wId of workerIdsForWarn) {
                    const myRecIds = new Set(
                      (priorRecordWorkers || []).filter((rw: any) => rw.worker_id === wId).map((rw: any) => rw.record_id)
                    );
                    const myAmonestRecs = (amonestRecs || []).filter((r: any) => myRecIds.has(r.id));
                    const porCategoria: Record<string, { count: number; ultima_fecha: string | null; ultima_descripcion: string }> = {};
                    let total = 0;
                    for (const r of myAmonestRecs) {
                      const catName = (r as any).incidencias_categories?.name || 'Sin categoría';
                      if (!porCategoria[catName]) porCategoria[catName] = { count: 0, ultima_fecha: null, ultima_descripcion: '' };
                      porCategoria[catName].count++;
                      total++;
                      const fechaIso = r.fecha ? new Date(r.fecha).toISOString() : null;
                      if (!porCategoria[catName].ultima_fecha || (fechaIso && fechaIso > porCategoria[catName].ultima_fecha!)) {
                        porCategoria[catName].ultima_fecha = fechaIso;
                        porCategoria[catName].ultima_descripcion = (r.descripcion || '').substring(0, 200);
                      }
                    }
                    amonestacionesPorCategoriaPorTrabajador[wId] = { por_categoria: porCategoria, total };
                  }
                }
              }
            } catch (e) {
              console.warn('[analyzeProposal] Error fetching prior amonestaciones by category:', e);
            }
          }
        }

        // Get signed URLs for evidence images
        const pruebas = rec ? (Array.isArray(rec.pruebas_urls) ? rec.pruebas_urls : []) : [];
        const adminPruebas = Array.isArray((prop as any).admin_pruebas_urls) ? (prop as any).admin_pruebas_urls : [];
        const allPaths = [...pruebas, ...adminPruebas];
        const IMAGE_EXT_ANALYZE = /\.(jpg|jpeg|png|gif|webp)$/i;
        const VIDEO_EXT_ANALYZE = /\.(mp4|mov|avi|webm|mkv|3gp)$/i;
        const imgPaths = allPaths.filter((p: string) => typeof p === 'string' && IMAGE_EXT_ANALYZE.test(p.split('?')[0])).slice(0, 10);
        const vidPaths = allPaths.filter((p: string) => typeof p === 'string' && VIDEO_EXT_ANALYZE.test(p.split('?')[0])).slice(0, 3);
        const videoCountAnalyze = vidPaths.length;
        const otherCountAnalyze = allPaths.filter((p: string) => typeof p === 'string' && !IMAGE_EXT_ANALYZE.test(p.split('?')[0]) && !VIDEO_EXT_ANALYZE.test(p.split('?')[0])).length;

        const signedImgUrls: string[] = [];
        const signedVidUrls: string[] = [];
        const cleanPathFn = (p: string) => {
          const m = p.match(/incidencias-pruebas\/([^?]+)/);
          return m ? decodeURIComponent(m[1]) : p;
        };

        // Sign image and video URLs in parallel
        const [signedImgData, signedVidData] = await Promise.all([
          imgPaths.length > 0
            ? supabase.storage.from('incidencias-pruebas').createSignedUrls(imgPaths.map(cleanPathFn), 31536000)
            : Promise.resolve({ data: null }),
          vidPaths.length > 0
            ? supabase.storage.from('incidencias-pruebas').createSignedUrls(vidPaths.map(cleanPathFn), 31536000)
            : Promise.resolve({ data: null }),
        ]);
        if (signedImgData.data) signedImgUrls.push(...signedImgData.data.filter((s: any) => s.signedUrl).map((s: any) => s.signedUrl));
        if (signedVidData.data) signedVidUrls.push(...signedVidData.data.filter((s: any) => s.signedUrl).map((s: any) => s.signedUrl));

        // Call AI for complete analysis
        const supabaseUrlAnalyze = Deno.env.get('SUPABASE_URL')!;
        const supabaseKeyAnalyze = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const workerIdsForAI = recWorkers.map((w: any) => w.worker_id).filter(Boolean);

        // Get available categories for AI reclassification
        let availableCategoryNames: string[] = [];
        {
          const { data: cats } = await supabase
            .from('incidencias_categories')
            .select('name')
            .eq('active', true)
            .neq('name', 'Otros')
            .order('name');
          availableCategoryNames = [...new Set((cats || []).map((c: any) => c.name))];
        }

        const analyzePayload: Record<string, unknown> = {
          action: 'analizar_propuesta_completa',
          tipo_actual: (prop as any).tipo,
          gravedad_actual: prop.gravedad,
          suspension_dias: prop.suspension_dias,
          departamento: deptName,
          descripcion: rec?.descripcion || (prop as any).nspp_justificacion || '',
          fecha_hechos: rec ? new Date(rec.fecha).toLocaleDateString('es-ES') : '',
          categoria: rec?.incidencias_categories?.name || (prop as any).custom_category_name || '',
          custom_category_name: rec?.custom_category_name || '',
          categorias_disponibles: availableCategoryNames,
          accion_propuesta: rec?.accion_propuesta || '',
          trabajadores: isNspp
            ? [{ nombre: (prop as any).nspp_worker_name, numero: (prop as any).nspp_worker_number }]
            : recWorkers.map((w: any) => ({ nombre: w.worker_name, numero: w.worker_number })),
          worker_ids: workerIdsForAI,
          exclude_record_id: recordId || null,
          historial_estadisticas: workerStats.map((s: any) => {
            const currentSeverity = rec?.incidencias_categories?.gravedad || 'leve';
            const isCurrentInLast30 = !!rec?.fecha && new Date(rec.fecha).getTime() >= Date.now() - 30 * 86400000;
            const isCurrentInLast60 = !!rec?.fecha && new Date(rec.fecha).getTime() >= Date.now() - 60 * 86400000;
            const adjustedTotal = Math.max(0, (s.total_count || 0) - 1);
            const adjustedLeves = Math.max(0, (s.leves || 0) - (currentSeverity === 'leve' ? 1 : 0));
            const adjustedGraves = Math.max(0, (s.graves || 0) - (currentSeverity === 'grave' ? 1 : 0));
            const adjustedMuyGraves = Math.max(0, (s.muy_graves || 0) - (currentSeverity === 'muy_grave' ? 1 : 0));
            const adjustedReincidencias = adjustedTotal > 1 ? adjustedTotal - 1 : 0;
            const adjustedRiesgo = Math.min(100, adjustedLeves * 5 + adjustedGraves * 20 + adjustedMuyGraves * 40 + Math.max(0, (s.ultimos_30 || 0) - (isCurrentInLast30 ? 1 : 0)) * 3 + adjustedReincidencias * 10);
            const wId = s.worker_id;
            const amonestData = amonestacionesPorCategoriaPorTrabajador[wId] || { por_categoria: {}, total: 0 };
            const currentCatNameForWarn = rec?.incidencias_categories?.name || (prop as any).custom_category_name || 'Sin categoría';
            const ultimaEnCategoriaActual = amonestData.por_categoria[currentCatNameForWarn] || null;
            return {
              nombre: recWorkers.find((w: any) => w.worker_id === s.worker_id)?.worker_name || '',
              total: adjustedTotal,
              leves: adjustedLeves,
              graves: adjustedGraves,
              muy_graves: adjustedMuyGraves,
              reincidencias: adjustedReincidencias,
              riesgo: adjustedRiesgo,
              ultimos_30d: Math.max(0, (s.ultimos_30 || 0) - (isCurrentInLast30 ? 1 : 0)),
              ultimos_60d: Math.max(0, (s.ultimos_60 || 0) - (isCurrentInLast60 ? 1 : 0)),
              // ── New: prior amonestaciones (warnings) breakdown — used to evaluate "advertencia debida" Vía B (Art. 50.3.a / 50.3.k) ──
              amonestaciones_total: amonestData.total,
              amonestaciones_por_categoria: Object.fromEntries(
                Object.entries(amonestData.por_categoria).map(([cat, info]) => [cat, info.count])
              ),
              ultima_amonestacion_categoria_actual: ultimaEnCategoriaActual ? {
                fecha: ultimaEnCategoriaActual.ultima_fecha,
                descripcion: ultimaEnCategoriaActual.ultima_descripcion,
                categoria: currentCatNameForWarn,
              } : null,
            };
          }),
          categoria_actual_nombre: rec?.incidencias_categories?.name || (prop as any).custom_category_name || '',
          fichajes_recientes: clockEntries.map((c: any) => ({
            tipo: c.entry_type,
            fecha: c.punched_at,
          })),
          tiene_pruebas: allPaths.length > 0,
          num_imagenes: signedImgUrls.length,
          num_videos: videoCountAnalyze,
          num_otros_archivos: otherCountAnalyze,
          imagen_urls: signedImgUrls,
          video_urls: signedVidUrls,
          is_nspp: isNspp,
          encargado_nombre: rec?.created_by_name || (prop as any).nspp_encargado_name || '',
          instrucciones_usuario: userInstructions || '',
          use_lite_model: useLiteModel || false,
        };

        const runAnalysisRequest = async () => {
          const response = await fetch(`${supabaseUrlAnalyze}/functions/v1/control-incidencias-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKeyAnalyze}` },
            body: JSON.stringify(analyzePayload),
          });

          const rawText = await response.text();
          let parsed: any = null;
          try {
            parsed = rawText ? JSON.parse(rawText) : null;
          } catch {
            parsed = null;
          }

          return { ok: response.ok, status: response.status, rawText, parsed };
        };

        const persistAnalysis = async (analysis: any) => {
          // Re-read proposal from DB to get CURRENT state (critical for background retries after resets)
          const { data: freshProp } = await supabase.from('incidencias_propuestas_rrhh').select('*, ai_reasoning_log').eq('id', analyzePropId).single();
          if (!freshProp) {
            console.error('[persistAnalysis] Proposal not found, skipping');
            return { persisted: false, reason: 'proposal_not_found' };
          }

          // Check if proposal was reset AFTER this analysis was started
          const freshLog = Array.isArray(freshProp.ai_reasoning_log) ? freshProp.ai_reasoning_log : [];
          const lastResetEntry = [...freshLog].reverse().find((e: any) => e.action === 'reset');
          if (lastResetEntry && new Date(lastResetEntry.timestamp) > analyzeStartTime) {
            console.warn('[persistAnalysis] Proposal was reset after analysis started, skipping stale result');
            return { persisted: false, reason: 'stale_after_reset' };
          }

          // Build reasoning log entry
          const reasoningEntry: Record<string, unknown> = {
            timestamp: new Date().toISOString(),
            tipo: 'analisis_completo',
            cambios: [] as Array<{ campo: string; de: string | null; a: string; razon: string }>,
          };
          const cambios = reasoningEntry.cambios as Array<{ campo: string; de: string | null; a: string; razon: string }>;

          // Always apply AI recommended tipo/gravedad/suspension automatically
          const aiModification: Record<string, unknown> = {};
          const currentTipo = (freshProp as any).tipo;
          const currentGravedad = freshProp.gravedad;
          if (analysis.tipo_recomendado && analysis.tipo_recomendado !== currentTipo) {
            aiModification.tipo_original_encargado = currentTipo;
            aiModification.tipo_ia = analysis.tipo_recomendado;
            cambios.push({ campo: 'tipo', de: currentTipo, a: analysis.tipo_recomendado, razon: analysis.justificacion_cambio || 'Recomendación IA' });
          }
          if (analysis.gravedad_recomendada && analysis.gravedad_recomendada !== currentGravedad && analysis.gravedad_recomendada !== '') {
            aiModification.gravedad_original_encargado = currentGravedad;
            aiModification.gravedad_ia = analysis.gravedad_recomendada;
            cambios.push({ campo: 'gravedad', de: currentGravedad, a: analysis.gravedad_recomendada, razon: analysis.justificacion_cambio || 'Recomendación IA' });
          }
          if (analysis.dias_suspension_recomendados && analysis.dias_suspension_recomendados > 0) {
            aiModification.dias_suspension_ia = analysis.dias_suspension_recomendados;
            const startDate = rec?.propuesta_fecha_inicio ? new Date(rec.propuesta_fecha_inicio) : (freshProp.fecha_inicio ? new Date(freshProp.fecha_inicio) : new Date());
            const fechas: string[] = [];
            const current = new Date(startDate);
            // Natural days (weekends included per Art. 5 Código Civil)
            for (let i = 0; i < analysis.dias_suspension_recomendados; i++) {
              fechas.push(current.toISOString().slice(0, 10));
              current.setDate(current.getDate() + 1);
            }
            aiModification.fechas_suspension_ia = fechas;
            cambios.push({ campo: 'dias_suspension', de: String(freshProp.suspension_dias ?? 0), a: String(analysis.dias_suspension_recomendados), razon: analysis.justificacion_dias_suspension || 'Ajuste IA' });
          }

          // Category reclassification: if AI suggests a different category (especially when "Otros")
          if (analysis.categoria_sugerida && rec) {
            const currentCatName = rec.incidencias_categories?.name || '';
            if (analysis.categoria_sugerida !== currentCatName) {
              aiModification.categoria_original = currentCatName;
              aiModification.categoria_ia = analysis.categoria_sugerida;
              aiModification.categoria_razon = analysis.categoria_razon || '';
              cambios.push({ campo: 'categoria', de: currentCatName, a: analysis.categoria_sugerida, razon: analysis.categoria_razon || 'Reclasificación automática IA' });

              // Auto-apply: find matching category and update the record
              const { data: matchingCat } = await supabase
                .from('incidencias_categories')
                .select('id, name')
                .ilike('name', analysis.categoria_sugerida)
                .eq('active', true)
                .limit(1)
                .single();

              if (matchingCat) {
                // Move custom_category_name text to descripcion if descripcion is empty
                const descUpdate: Record<string, unknown> = { category_id: matchingCat.id };
                if (rec.custom_category_name && (!rec.descripcion || rec.descripcion.trim() === '')) {
                  descUpdate.descripcion = rec.custom_category_name;
                } else if (rec.custom_category_name && rec.descripcion) {
                  descUpdate.descripcion = `${rec.descripcion}\n\n[Detalle del encargado (categoría "Otros")]: ${rec.custom_category_name}`;
                }
                descUpdate.custom_category_name = null;
                await supabase.from('incidencias_records').update(descUpdate).eq('id', rec.id);
                if (descUpdate.descripcion) {
                  cambios.push({ campo: 'descripcion', de: rec.descripcion || '(vacío)', a: descUpdate.descripcion as string, razon: 'Texto de "Otros" incorporado como descripción de hechos' });
                }
              }
            }
          }

          // Add AI reasoning summary
          reasoningEntry.resumen = analysis.resumen_ejecutivo || '';
          reasoningEntry.valoracion = analysis.valoracion_hechos || '';
          reasoningEntry.fundamentacion = analysis.fundamentacion_legal || '';

          // Build update payload
          const updatePayload: Record<string, unknown> = { ai_analysis: analysis };

          // Persist AI questions to admin (cautious decision-making system)
          const aiPreguntas = Array.isArray(analysis.preguntas_admin) ? analysis.preguntas_admin : [];
          const aiNeedsClarif = analysis.necesita_aclaracion === true && aiPreguntas.length > 0;
          updatePayload.preguntas_admin = aiNeedsClarif ? aiPreguntas : null;
          updatePayload.necesita_aclaracion = aiNeedsClarif;
          // If the AI is asking for clarification, force a conservative classification (never muy_grave)
          if (aiNeedsClarif && analysis.gravedad_recomendada === 'muy_grave') {
            console.warn('[analyzeProposal] AI asked for clarification but recommended muy_grave; downgrading to grave for safety');
            analysis.gravedad_recomendada = 'grave';
            analysis.requiere_audiencia_previa = false;
          }

          // Persist audiencia previa requirement (only set TRUE; never auto-clear an existing completion)
          if (!aiNeedsClarif && (analysis.requiere_audiencia_previa === true || analysis.gravedad_recomendada === 'muy_grave')) {
            updatePayload.requiere_audiencia_previa = true;
          }

          // Always apply AI recommendation to update payload (even if aiModification is empty, ensure tipo/gravedad from analysis are set)
          if (analysis.tipo_recomendado) updatePayload.tipo = analysis.tipo_recomendado;
          if (analysis.gravedad_recomendada) updatePayload.gravedad = analysis.gravedad_recomendada;
          // CRITICAL: when called from updatePropuestaSuspension the admin
          // just chose suspension_dias manually — do NOT let the AI clobber
          // that decision. Otherwise the legal document keeps showing the
          // old number even after the admin saved a new one.
          if (!preserveUserSuspension && analysis.dias_suspension_recomendados && analysis.dias_suspension_recomendados > 0) {
            updatePayload.suspension_dias = analysis.dias_suspension_recomendados;
          }
          if (Object.keys(aiModification).length > 0) {
            updatePayload.ai_modification = aiModification;
          }
          if (!preserveUserSuspension && (aiModification.fechas_suspension_ia as string[])?.length > 0) {
            updatePayload.suspension_fechas = aiModification.fechas_suspension_ia;
          }

          // Always normalize suspension_dias to legal range based on final gravedad
          const finalTipo = (updatePayload.tipo as string) || currentTipo;
          const finalGravedad = (updatePayload.gravedad as string) || currentGravedad;
          // When preserving the admin choice, ignore any AI-derived value and
          // always normalize starting from what the admin saved in DB.
          const finalDias = preserveUserSuspension
            ? (freshProp.suspension_dias ?? null)
            : ((updatePayload.suspension_dias as number | null) ?? freshProp.suspension_dias ?? null);
          const normalized = normalizeLegalData({
            tipo: finalTipo,
            gravedad: finalGravedad,
            suspension_dias: finalDias,
            sin_suspension_explicita: finalTipo === 'sancion' && freshProp.sin_suspension_explicita === true,
            fecha_inicio: rec?.propuesta_fecha_inicio || freshProp.fecha_inicio || null,
            existing_fechas: preserveUserSuspension
              ? (freshProp.suspension_fechas || null)
              : (freshProp.suspension_fechas || null),
          });
          updatePayload.suspension_dias = normalized.suspension_dias;
          updatePayload.sin_suspension_explicita = normalized.sin_suspension_explicita === true;
          if (normalized.suspension_fechas) updatePayload.suspension_fechas = normalized.suspension_fechas;
          // Extra safety: if preserving and DB has explicit fechas from the
          // admin, re-write them verbatim so the normalize step (which only
          // recomputes if start_date+days mismatch) cannot drop edges.
          if (preserveUserSuspension && Array.isArray(freshProp.suspension_fechas) && freshProp.suspension_fechas.length > 0) {
            updatePayload.suspension_fechas = freshProp.suspension_fechas;
            updatePayload.suspension_dias = freshProp.suspension_fechas.length;
          }

          // Append reasoning log entry
          const existingLog = Array.isArray(freshProp.ai_reasoning_log) ? freshProp.ai_reasoning_log : [];
          updatePayload.ai_reasoning_log = [...existingLog, reasoningEntry];

          const { data: persistedProposal, error: persistErr } = await supabase
            .from('incidencias_propuestas_rrhh')
            .update(updatePayload)
            .eq('id', analyzePropId)
            .select('*')
            .single();

          if (persistErr) {
            console.error('[persistAnalysis] Failed to persist ai_analysis:', persistErr);
            return { persisted: false, reason: persistErr.message || 'persist_failed' };
          }

          if (!(persistedProposal as any)?.ai_analysis) {
            console.error('[persistAnalysis] ai_analysis missing after update verification');
            return { persisted: false, reason: 'ai_analysis_missing_after_update' };
          }

          await writeIncidenciasLog('ai_analysis', null, analyzePropId, `Análisis IA completo generado por ${manager.name}${Object.keys(aiModification).length > 0 ? ' (con modificación automática)' : ''}`, aiModification);

          // ===== Propagate category reclassification to sibling proposals =====
          // When the same incidencia tiene varios trabajadores (una propuesta por
          // cada uno), la IA puede ser inconsistente y sugerir cambio de categoría
          // sólo en algunas. Si esta propuesta sugiere reclasificación, propagamos
          // la sugerencia a los hermanos cuyo propio análisis no la sugería, para
          // que el badge "Categoría reclasificada · Aplicar" aparezca también.
          try {
            const suggestedCat = (analysis as any).categoria_sugerida;
            const currentCatName = rec?.incidencias_categories?.name || '';
            if (rec?.id && suggestedCat && suggestedCat !== currentCatName) {
              const { data: siblings } = await supabase
                .from('incidencias_propuestas_rrhh')
                .select('id, ai_analysis, estado, archivada_at, merged_into_id')
                .eq('record_id', rec.id)
                .neq('id', analyzePropId);
              for (const sib of (siblings || [])) {
                if ((sib as any).archivada_at) continue;
                if ((sib as any).merged_into_id) continue;
                if (!['pendiente', 'rechazada'].includes((sib as any).estado)) continue;
                const sibAnalysis = (sib as any).ai_analysis;
                if (!sibAnalysis || typeof sibAnalysis !== 'object') continue;
                const sibSuggested = sibAnalysis.categoria_sugerida;
                // Only override siblings whose AI did NOT suggest a change
                // (i.e., its suggestion equals the current category name, or is empty).
                const sibAlreadySuggestsChange = sibSuggested && sibSuggested !== currentCatName;
                if (sibAlreadySuggestsChange) continue;
                const newAnalysis = {
                  ...sibAnalysis,
                  categoria_sugerida: suggestedCat,
                  categoria_razon: (analysis as any).categoria_razon
                    || sibAnalysis.categoria_razon
                    || 'Reclasificación propagada desde propuesta hermana',
                  categoria_propagada_desde: analyzePropId,
                };
                await supabase
                  .from('incidencias_propuestas_rrhh')
                  .update({ ai_analysis: newAnalysis })
                  .eq('id', (sib as any).id);
              }
            }
          } catch (propErr) {
            console.warn('[persistAnalysis] sibling category propagation failed:', propErr);
          }

          return { persisted: true, proposal: persistedProposal };
        };

        const analyzeAttempt = await runAnalysisRequest();

        if (analyzeAttempt.ok && analyzeAttempt.parsed && !analyzeAttempt.parsed.error) {
          const persistResult = await persistAnalysis(analyzeAttempt.parsed);
          if (!persistResult?.persisted) {
            if (persistResult?.reason === 'stale_after_reset') {
              return okResponse({
                skipped: true,
                reason: 'stale_after_reset',
                message: 'El análisis quedó invalidado porque la propuesta se restableció durante el proceso.',
              });
            }
            return errorResponse(`No se pudo guardar el análisis IA: ${persistResult?.reason || 'error desconocido'}`);
          }

          const persistedProposal = persistResult.proposal || prop;

          // Schedule background tasks with EdgeRuntime.waitUntil so they survive after response
          const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;

          // Background: generate email draft
          if (rec && recWorkers && recWorkers.length > 0) {
            const draftPromise = generateProposalDraft(supabase, persistedProposal, rec, recWorkers, analyzeAttempt.parsed).catch(e =>
              console.error('[analyzeProposal] Background draft generation failed:', e)
            );
            if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(draftPromise);
          }

          // Background: auto-generate legal document only when there is no video
          // evidence. Video frames must be decoded in the admin browser first;
          // generating here would race ahead and create a document without them.
          if (!hasVideoEvidenceForProposal(persistedProposal, rec)) {
            const legalDocPromise = generateLegalDocumentBackground(supabase, analyzePropId, manager.name).catch(e =>
              console.error('[analyzeProposal] Background legal doc generation failed:', e)
            );
            if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(legalDocPromise);
          } else {
            console.log('[analyzeProposal] Legal doc auto-generation deferred until browser extracts video frames');
          }

          return okResponse({ analysis: analyzeAttempt.parsed });
        }

        const aiMessage = analyzeAttempt.parsed?.message || analyzeAttempt.parsed?.error || 'Error en análisis IA';
        const isTransientAiError = analyzeAttempt.status === 429 || analyzeAttempt.status >= 500;

        console.error('AI analysis error:', analyzeAttempt.rawText);

        if (isTransientAiError) {
          const retryInBackground = async () => {
            for (const waitMs of [15000, 30000]) {
              await new Promise(resolve => setTimeout(resolve, waitMs));
              const retryAttempt = await runAnalysisRequest();

              if (retryAttempt.ok && retryAttempt.parsed && !retryAttempt.parsed.error) {
                const retryPersistResult = await persistAnalysis(retryAttempt.parsed);
                if (!retryPersistResult?.persisted) {
                  console.warn('[analyzeProposal] Retry persist skipped/failed:', retryPersistResult?.reason);
                  if (retryPersistResult?.reason === 'stale_after_reset') return;
                  return;
                }

                const persistedRetryProposal = retryPersistResult.proposal || prop;
                // Also trigger background tasks after successful retry
                if (rec && recWorkers && recWorkers.length > 0) {
                  generateProposalDraft(supabase, persistedRetryProposal, rec, recWorkers, retryAttempt.parsed).catch(e =>
                    console.error('[analyzeProposal] Retry draft generation failed:', e)
                  );
                }
                if (!hasVideoEvidenceForProposal(persistedRetryProposal, rec)) {
                  generateLegalDocumentBackground(supabase, analyzePropId, manager.name).catch(e =>
                    console.error('[analyzeProposal] Retry legal doc generation failed:', e)
                  );
                } else {
                  console.log('[analyzeProposal] Retry legal doc auto-generation deferred until browser extracts video frames');
                }
                return;
              }

              console.error(`[analyzeProposal] Background retry failed (${retryAttempt.status}):`, retryAttempt.rawText);

              if (retryAttempt.status !== 429 && retryAttempt.status < 500) {
                return;
              }
            }
          };

          const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
          if (edgeRuntime?.waitUntil) {
            edgeRuntime.waitUntil(retryInBackground());
          } else {
            retryInBackground().catch((retryErr) => console.error('[analyzeProposal] Background retry crashed:', retryErr));
          }

          return okResponse({
            queued: true,
            retrying: true,
            message: typeof aiMessage === 'string' && aiMessage.length > 0
              ? `${aiMessage} Reintentando automáticamente en segundo plano.`
              : 'La IA está temporalmente saturada. Reintentando automáticamente en segundo plano.',
          });
        }

        return errorResponse(typeof aiMessage === 'string' ? aiMessage : 'Error en análisis IA');
      }

      // =============================================
      // CREATE NSPP PROPOSAL (accessible by encargados)
      // =============================================
      case 'createNSPPPropuesta': {
        const { departmentId: nsppDeptId, workerName: nsppWorkerName, workerNumber: nsppWorkerNumber, startContractDate: nsppStartDate, daysRemaining: nsppDaysRemaining, justificacion: nsppJustificacion, workerFiscalId: nsppWorkerFiscalId } = body;

        if (!nsppDeptId) return errorResponse('departmentId required');
        if (!nsppWorkerName?.trim()) return errorResponse('workerName required');
        if (!nsppJustificacion?.trim()) return errorResponse('justificacion required');

        // Encargados need to have access to this department
        const hasAccess = await validateIncidenciasDeptAccess(nsppDeptId);
        if (!hasAccess) return errorResponse('Access denied to this department');

        // Try to look up fiscal_id if not provided but worker_number is known
        let resolvedNsppFiscalId: string | null = nsppWorkerFiscalId
          ? String(nsppWorkerFiscalId).trim().toUpperCase()
          : null;
        if (!resolvedNsppFiscalId && nsppWorkerNumber?.trim()) {
          const { data: wRow } = await supabase
            .from('workers')
            .select('fiscal_id')
            .eq('worker_number', nsppWorkerNumber.trim())
            .maybeSingle();
          if (wRow?.fiscal_id) resolvedNsppFiscalId = wRow.fiscal_id;
        }

        // Insert the propuesta directly (no underlying incident)
        const { data: nsppProp, error: nsppErr } = await supabase
          .from('incidencias_propuestas_rrhh')
          .insert({
            department_id: nsppDeptId,
            record_id: null,
            tipo: 'nspp',
            gravedad: 'muy_grave',
            estado: 'pendiente',
            nspp_worker_name: nsppWorkerName.trim(),
            nspp_worker_number: nsppWorkerNumber?.trim() || null,
            nspp_worker_fiscal_id: resolvedNsppFiscalId,
            nspp_start_contract_date: nsppStartDate || null,
            nspp_days_remaining: nsppDaysRemaining ?? null,
            nspp_justificacion: nsppJustificacion.trim(),
            nspp_encargado_name: manager.name,
          })
          .select()
          .single();

        if (nsppErr) return errorResponse('Error al crear propuesta NSPP: ' + nsppErr.message);

        await writeIncidenciasLog('crear_nspp', null, nsppProp.id, `NSPP creado por ${manager.name} para ${nsppWorkerName}`, { departmentId: nsppDeptId, workerName: nsppWorkerName });

        // Fire-and-forget: auto-analyze NSPP proposal with AI
        const supabaseUrlNspp = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKeyNspp = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        fetch(`${supabaseUrlNspp}/functions/v1/incidencias-operations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKeyNspp}`,
            'apikey': supabaseServiceKeyNspp,
          },
          body: JSON.stringify({ action: 'analyzeProposal', sessionToken: body.sessionToken, propuestaId: nsppProp.id }),
        }).catch(e => console.error('[createNSPPPropuesta] Background AI analysis failed:', e));

        return okResponse({ propuesta: nsppProp });
      }

      // =============================================
      // GENERATE EMAIL DRAFT V2 (cercano) — with multimodal images
      // =============================================
      case 'generateEmailDraftV2': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: draftV2Id } = body;
        if (!draftV2Id) return errorResponse('propuestaId required');

        const { data: prop } = await supabase.from('incidencias_propuestas_rrhh').select('*').eq('id', draftV2Id).single();
        if (!prop) return errorResponse('Propuesta not found');
        if ((prop as any).tipo !== 'nspp' && !(prop as any).ai_analysis) {
          return errorResponse('Primero debe completarse el análisis IA');
        }

        // ── NSPP branch: different AI action ──
        if ((prop as any).tipo === 'nspp') {
          const { data: deptResNspp } = await supabase.from('incidencias_departments').select('name').eq('id', prop.department_id).single();
          const adminPruebasNspp = Array.isArray((prop as any).admin_pruebas_urls) ? (prop as any).admin_pruebas_urls : [];

          // Build signed image URLs for admin evidence
          const IMAGE_EXT_NSPP = /\.(jpg|jpeg|png|gif|webp)$/i;
          const nsppImagePaths = adminPruebasNspp.filter((p: string) => IMAGE_EXT_NSPP.test(p.split('?')[0])).slice(0, 10);
          const nsppSignedUrls: string[] = [];
          if (nsppImagePaths.length > 0) {
            const { data: signed } = await supabase.storage.from('incidencias-pruebas').createSignedUrls(nsppImagePaths, 31536000);
            if (signed) nsppSignedUrls.push(...signed.filter((s: any) => s.signedUrl).map((s: any) => s.signedUrl));
          }

          const supabaseUrl2 = Deno.env.get('SUPABASE_URL')!;
          const supabaseAnonKey2 = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

          const draftRes = await fetch(`${supabaseUrl2}/functions/v1/control-incidencias-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey2}` },
            body: JSON.stringify({
              action: 'generar_borrador_nspp',
              trabajador_nombre: (prop as any).nspp_worker_name,
              trabajador_numero: (prop as any).nspp_worker_number,
              departamento: deptResNspp?.name || '',
              start_contract_date: (prop as any).nspp_start_contract_date,
              days_remaining: (prop as any).nspp_days_remaining,
              justificacion: (prop as any).nspp_justificacion,
              encargado_nombre: (prop as any).nspp_encargado_name,
              imagen_urls: nsppSignedUrls,
            }),
          });
          if (!draftRes.ok) return errorResponse('Error generando borrador NSPP');
          const draftData = await draftRes.json();
          const nsppSubject = draftData.asunto || `NSPP - ${(prop as any).nspp_worker_name} (${(prop as any).nspp_worker_number || ''})`;
          const nsppBody = draftData.cuerpo || '';
          await supabase.from('incidencias_propuestas_rrhh').update({ email_subject: nsppSubject, email_body: nsppBody, ai_borrador_generado: true }).eq('id', draftV2Id);
          await writeIncidenciasLog('regenerar_borrador_nspp', null, draftV2Id, `Borrador NSPP generado por ${manager.name}`, null);
          return okResponse({ subject: nsppSubject, body: nsppBody, imagenes_analizadas: nsppSignedUrls.length });
        }

        const { data: rec } = await supabase
          .from('incidencias_records')
          .select('*, incidencias_categories(name, gravedad)')
          .eq('id', prop.record_id)
          .single();
        if (!rec) return errorResponse('Record not found');

        const [recWorkersRes, deptRes, aiConfigRes] = await Promise.all([
          supabase.from('incidencias_record_workers').select('worker_id, worker_name, worker_number').eq('record_id', prop.record_id),
          supabase.from('incidencias_departments').select('name').eq('id', prop.department_id).single(),
          supabase.from('incidencias_ai_config').select('*').limit(1).single(),
        ]);

        const recWorkers = recWorkersRes.data || [];
        const workerNames = recWorkers.map((w: any) => w.worker_name).join(', ');
        const workerNumber = recWorkers[0]?.worker_number || '';
        const workerNamesWithNumbers = recWorkers.length > 1
          ? recWorkers.map((w: any) => `${w.worker_name} (${w.worker_number || ''})`).join(', ').replace(/, ([^,]+)$/, ' y $1')
          : `${recWorkers[0]?.worker_name || ''} (${recWorkers[0]?.worker_number || ''})`;
        const pruebas = Array.isArray(rec.pruebas_urls) ? rec.pruebas_urls : [];
        const adminPruebas = Array.isArray((prop as any).admin_pruebas_urls) ? (prop as any).admin_pruebas_urls : [];
        const aiConfig = aiConfigRes.data;

        // Build signed URLs for all images (encargado + admin), classify file types
        const allPaths = [...pruebas, ...adminPruebas];
        const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)$/i;
        const VIDEO_EXT = /\.(mp4|mov|avi|webm|mkv|3gp)$/i;
        const imagePaths = allPaths.filter((p: string) => typeof p === 'string' && IMAGE_EXT.test(p.split('?')[0])).slice(0, 10);
        const videoPaths = allPaths.filter((p: string) => typeof p === 'string' && VIDEO_EXT.test(p.split('?')[0])).slice(0, 3);
        const videoCount = videoPaths.length;
        const otherCount = allPaths.filter((p: string) => typeof p === 'string' && !IMAGE_EXT.test(p.split('?')[0]) && !VIDEO_EXT.test(p.split('?')[0])).length;
        
        const signedImageUrls: string[] = [];
        const signedVideoUrls: string[] = [];
        const cleanDraftPath = (p: string) => {
          const match = p.match(/\/object\/sign\/incidencias-pruebas\/(.+?)(\?|$)/);
          if (match) return decodeURIComponent(match[1]);
          const m2 = p.match(/incidencias-pruebas\/([^?]+)/);
          return m2 ? decodeURIComponent(m2[1]) : p;
        };

        const [signedImgDraft, signedVidDraft] = await Promise.all([
          imagePaths.length > 0
            ? supabase.storage.from('incidencias-pruebas').createSignedUrls(imagePaths.map(cleanDraftPath), 31536000)
            : Promise.resolve({ data: null }),
          videoPaths.length > 0
            ? supabase.storage.from('incidencias-pruebas').createSignedUrls(videoPaths.map(cleanDraftPath), 31536000)
            : Promise.resolve({ data: null }),
        ]);
        if (signedImgDraft.data) signedImageUrls.push(...signedImgDraft.data.filter((s: any) => s.signedUrl).map((s: any) => s.signedUrl));
        if (signedVidDraft.data) signedVideoUrls.push(...signedVidDraft.data.filter((s: any) => s.signedUrl).map((s: any) => s.signedUrl));

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const isAmonestacionDraft = prop.tipo === 'amonestacion';
        const suspensionDias = prop.suspension_dias;
        let instruccionesExtra = aiConfig?.instrucciones_custom || '';
        
        // Check if manager requested suspension via the record
        const recSuspension = rec.propuesta_suspension || false;
        const recFechaInicio = rec.propuesta_fecha_inicio || null;
        
        if (isAmonestacionDraft) {
          instruccionesExtra += '\n\nIMPORTANTE: Este documento es una AMONESTACIÓN ESCRITA (aviso formal). NO debe incluir clasificación de gravedad (leve/grave/muy grave) ni suspensión de empleo y sueldo. Es simplemente un aviso escrito al trabajador. No menciones grados de gravedad ni sanciones de suspensión.';
        } else if (!recSuspension && (suspensionDias === 0 || suspensionDias === null)) {
          instruccionesExtra += `\n\nIMPORTANTE: Esta sanción está tipificada como falta ${prop.gravedad === 'muy_grave' ? 'muy grave' : prop.gravedad === 'grave' ? 'grave' : 'leve'} según el convenio, pero la empresa ha decidido NO aplicar suspensión de empleo y sueldo. Debes indicar explícitamente en el documento que, pese a estar tipificada como falta ${prop.gravedad}, se ha decidido no imponer suspensión de empleo y sueldo.`;
        }

        const draftRes = await fetch(`${supabaseUrl}/functions/v1/control-incidencias-ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
           body: JSON.stringify({
            action: 'generar_borrador_sancion',
            trabajador_nombre: workerNamesWithNumbers,
            trabajador_numero: workerNumber,
            gravedad: isAmonestacionDraft ? null : prop.gravedad,
            sancion: prop.tipo,
            dias_suspension: isAmonestacionDraft ? null : prop.suspension_dias,
            descripcion_hechos: rec.descripcion || 'Sin descripción',
            articulos_referencia: rec.ai_articulos_relevantes || [],
            fecha_hechos: new Date(rec.fecha).toLocaleDateString('es-ES'),
            departamento: deptRes.data?.name || '',
            tiene_pruebas: allPaths.length > 0,
            num_fotos: imagePaths.length,
            num_videos: videoCount,
            num_otros_archivos: otherCount,
            fecha_inicio_sancion: prop.fecha_inicio ? new Date(prop.fecha_inicio).toLocaleDateString('es-ES') : null,
            instrucciones_custom: instruccionesExtra,
            tono_config: aiConfig?.tono || 'formal',
            imagen_urls: signedImageUrls,
            video_urls: signedVideoUrls,
            encargado_nombre: rec.created_by_name || '',
            propuesta_suspension: recSuspension,
            propuesta_fecha_inicio: recFechaInicio,
            worker_ids: (recWorkersRes.data || []).map((w: any) => w.worker_id),
            exclude_record_id: prop.record_id,
          }),
        });

        if (!draftRes.ok) return errorResponse('Error generando borrador IA');

        const draftData = await draftRes.json();
        const tipoLabel = prop.tipo === 'sancion' ? 'Sanción' : 'Amonestación';
        const subject = draftData.asunto || `${tipoLabel} - ${workerNamesWithNumbers}`;
        const bodyText = draftData.cuerpo || '';

        await supabase.from('incidencias_propuestas_rrhh').update({
          email_subject: subject,
          email_body: bodyText,
          ai_borrador_generado: true,
          ...(draftData.dias_suspension_propuestos != null && draftData.dias_suspension_propuestos > 0 ? { suspension_dias: draftData.dias_suspension_propuestos } : {}),
        }).eq('id', draftV2Id);

        await writeIncidenciasLog('regenerar_borrador_v2', null, draftV2Id, `Borrador V2 generado por ${manager.name} (${signedImageUrls.length} imágenes analizadas)`, null);
        return okResponse({ subject, body: bodyText, imagenes_analizadas: signedImageUrls.length, dias_suspension_propuestos: draftData.dias_suspension_propuestos || null });
      }

      // =============================================
      // EMAIL CONFIG CRUD
      // =============================================
      case 'getEmailConfig': {
        if (!isAdmin) return errorResponse('Admin only');
        const { data: emails, error } = await supabase
          .from('incidencias_email_config')
          .select('id, email, activo, created_at, is_primary, purpose')
          .order('purpose')
          .order('is_primary', { ascending: false })
          .order('created_at');

        if (error) return errorResponse(error.message);
        return okResponse({ emails: emails || [] });
      }

      case 'addEmailConfig': {
        if (!isAdmin) return errorResponse('Admin only');
        const email = String(body.email || '').trim().toLowerCase();
        const purpose = (body.purpose === 'suspension_aviso') ? 'suspension_aviso' : 'firma_entrega';
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return errorResponse('Email inválido');
        }

        // Same email is allowed in both purposes — uniqueness is per (email, purpose)
        const { data: existing } = await supabase
          .from('incidencias_email_config')
          .select('id')
          .eq('email', email)
          .eq('purpose', purpose)
          .maybeSingle();

        if (existing) return errorResponse('Ese email ya existe en esta lista');

        // First active email in this purpose becomes primary
        const { count } = await supabase
          .from('incidencias_email_config')
          .select('*', { count: 'exact', head: true })
          .eq('activo', true)
          .eq('purpose', purpose);

        const { data: inserted, error } = await supabase
          .from('incidencias_email_config')
          .insert({
            email,
            activo: true,
            is_primary: !count || count === 0,
            purpose,
          })
          .select('id, email, activo, created_at, is_primary, purpose')
          .single();

        if (error) return errorResponse(error.message);
        await writeIncidenciasLog('add_email_config', null, null, `Email RRHH añadido por ${manager.name} (${purpose}): ${email}`, null);
        return okResponse({ success: true, email: inserted });
      }

      case 'removeEmailConfig': {
        if (!isAdmin) return errorResponse('Admin only');
        const emailId = String(body.emailId || '').trim();
        if (!emailId) return errorResponse('Email ID requerido');

        const { data: target, error: targetError } = await supabase
          .from('incidencias_email_config')
          .select('id, email, is_primary, purpose')
          .eq('id', emailId)
          .maybeSingle();

        if (targetError) return errorResponse(targetError.message);
        if (!target) return errorResponse('Email no encontrado');

        const { error } = await supabase
          .from('incidencias_email_config')
          .delete()
          .eq('id', emailId);

        if (error) return errorResponse(error.message);

        // If we removed the primary in this purpose, promote the next one in the same list
        if (target.is_primary) {
          const { data: remaining } = await supabase
            .from('incidencias_email_config')
            .select('id')
            .eq('purpose', target.purpose)
            .order('created_at')
            .limit(1);

          if (remaining && remaining.length > 0) {
            await supabase
              .from('incidencias_email_config')
              .update({ is_primary: true })
              .eq('id', remaining[0].id);
          }
        }

        await writeIncidenciasLog('remove_email_config', null, null, `Email RRHH eliminado por ${manager.name} (${target.purpose}): ${target.email}`, null);
        return okResponse({ success: true });
      }

      case 'setPrimaryEmail': {
        if (!isAdmin) return errorResponse('Admin only');
        const emailId = String(body.emailId || '').trim();
        if (!emailId) return errorResponse('Email ID requerido');

        // Find the target's purpose so we only clear within the same list
        const { data: target } = await supabase
          .from('incidencias_email_config')
          .select('id, email, purpose')
          .eq('id', emailId)
          .maybeSingle();
        if (!target) return errorResponse('Email no encontrado');

        const { error: clearError } = await supabase
          .from('incidencias_email_config')
          .update({ is_primary: false })
          .eq('purpose', target.purpose);

        if (clearError) return errorResponse(clearError.message);

        const { data: updated, error } = await supabase
          .from('incidencias_email_config')
          .update({ is_primary: true })
          .eq('id', emailId)
          .select('email, purpose')
          .single();

        if (error) return errorResponse(error.message);
        await writeIncidenciasLog('set_primary_email_config', null, null, `Email principal RRHH actualizado por ${manager.name} (${updated.purpose}): ${updated.email}`, null);
        return okResponse({ success: true });
      }

      // =============================================
      // AI CONFIG CRUD
      // =============================================
      case 'getAiConfig': {
        if (!isAdmin) return errorResponse('Admin only');
        const { data: aiConf } = await supabase
          .from('incidencias_ai_config')
          .select('*')
          .limit(1)
          .single();
        return okResponse({ config: aiConf || { instrucciones_custom: '', tono: 'formal', incluir_articulos: true, idioma: 'es', memoria_empresa: '' } });
      }

      case 'saveAiConfig': {
        if (!isAdmin) return errorResponse('Admin only');
        const { instrucciones_custom: aiInstr, tono: aiTono, incluir_articulos: aiArt, memoria_empresa: aiMem } = body;
        // Upsert the single config row
        const { data: existing } = await supabase.from('incidencias_ai_config').select('id').limit(1).single();
        if (existing) {
          await supabase.from('incidencias_ai_config').update({
            instrucciones_custom: aiInstr || '',
            tono: aiTono || 'formal',
            incluir_articulos: aiArt !== false,
            memoria_empresa: aiMem || '',
            updated_at: new Date().toISOString(),
            updated_by: manager.name,
          }).eq('id', existing.id);
        } else {
          await supabase.from('incidencias_ai_config').insert({
            instrucciones_custom: aiInstr || '',
            tono: aiTono || 'formal',
            incluir_articulos: aiArt !== false,
            memoria_empresa: aiMem || '',
            updated_by: manager.name,
          });
        }
        await writeIncidenciasLog('update_ai_config', null, null, `Config IA actualizada por ${manager.name}`, null);
        return okResponse({ success: true });
      }

      // =============================================
      // AI MEMORY ENTRIES CRUD
      // =============================================
      case 'listMemoryEntries': {
        if (!isAdmin) return errorResponse('Admin only');
        const { data: entries } = await supabase
          .from('incidencias_ai_memory_entries')
          .select('*')
          .order('created_at', { ascending: true });
        return okResponse({ entries: entries || [] });
      }

      case 'addMemoryEntry': {
        if (!isAdmin) return errorResponse('Admin only');
        const { titulo, contenido, categoria } = body;
        if (!titulo?.trim() || !contenido?.trim()) return errorResponse('titulo and contenido required');
        const { data: entry, error: entryErr } = await supabase
          .from('incidencias_ai_memory_entries')
          .insert({
            titulo: titulo.trim(),
            contenido: contenido.trim(),
            categoria: categoria || 'general',
            suggested_by_ai: body.suggested_by_ai || false,
          })
          .select()
          .single();
        if (entryErr) return errorResponse('Failed to add entry: ' + entryErr.message);
        await writeIncidenciasLog('add_memory_entry', null, null, `Entrada de memoria añadida: ${titulo}`, null);
        return okResponse({ entry });
      }

      case 'updateMemoryEntry': {
        if (!isAdmin) return errorResponse('Admin only');
        const { entryId, titulo: mTitulo, contenido: mContenido, categoria: mCat } = body;
        if (!entryId) return errorResponse('entryId required');
        const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (mTitulo !== undefined) updateFields.titulo = mTitulo;
        if (mContenido !== undefined) updateFields.contenido = mContenido;
        if (mCat !== undefined) updateFields.categoria = mCat;
        const { data: updated, error: updErr } = await supabase
          .from('incidencias_ai_memory_entries')
          .update(updateFields)
          .eq('id', entryId)
          .select()
          .single();
        if (updErr) return errorResponse('Failed to update entry');
        return okResponse({ entry: updated });
      }

      case 'deleteMemoryEntry': {
        if (!isAdmin) return errorResponse('Admin only');
        const { entryId: delId } = body;
        if (!delId) return errorResponse('entryId required');
        const { error: delErr } = await supabase
          .from('incidencias_ai_memory_entries')
          .delete()
          .eq('id', delId);
        if (delErr) return errorResponse('Failed to delete entry');
        return okResponse({});
      }

      case 'suggestMemoryEntries': {
        if (!isAdmin) return errorResponse('Admin only');
        // Load existing entries to know what's already covered
        const { data: existingEntries } = await supabase
          .from('incidencias_ai_memory_entries')
          .select('titulo, contenido, categoria');
        const existingText = (existingEntries || []).map((e: any) => `[${e.categoria}] ${e.titulo}: ${e.contenido}`).join('\n');

        const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
        if (!GOOGLE_AI_API_KEY) return errorResponse('AI not configured');

        const aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GOOGLE_AI_API_KEY}` },
          body: JSON.stringify({
            model: 'gemini-2.5-flash',
            messages: [
              { role: 'system', content: `Eres un asistente que ayuda a configurar la memoria de una IA de gestión de incidencias laborales para Verdnatura (mayorista de flores y plantas). La IA necesita contexto sobre la empresa para entender mejor las incidencias, transcripciones de voz, redacción de emails a RRHH, y análisis predictivo.

Sugiere entradas de memoria que el administrador debería añadir para mejorar la comprensión de la IA. Cada sugerencia debe tener un título corto y un contenido de ejemplo que el admin pueda editar.

Categorías disponibles: departamentos, zonas, roles, turnos, procesos, terminologia, general

ENTRADAS YA EXISTENTES (no las repitas):
${existingText || '(ninguna todavía)'}

Genera entre 3 y 5 sugerencias NUEVAS y ÚTILES que no estén ya cubiertas. Prioriza lo más importante primero.` },
              { role: 'user', content: 'Sugiere entradas de memoria para mejorar el contexto de la IA.' },
            ],
            tools: [{
              type: 'function',
              function: {
                name: 'suggest_entries',
                description: 'Sugiere entradas de memoria',
                parameters: {
                  type: 'object',
                  properties: {
                    suggestions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          titulo: { type: 'string', description: 'Título corto de la entrada' },
                          contenido: { type: 'string', description: 'Contenido de ejemplo editable' },
                          categoria: { type: 'string', enum: ['departamentos', 'zonas', 'roles', 'turnos', 'procesos', 'terminologia', 'general'] },
                        },
                        required: ['titulo', 'contenido', 'categoria'],
                      },
                    },
                  },
                  required: ['suggestions'],
                },
              },
            }],
            tool_choice: { type: 'function', function: { name: 'suggest_entries' } },
          }),
        });
        const aiData = await aiRes.json();
        try {
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          const args = JSON.parse(toolCall?.function?.arguments || '{}');
          return okResponse({ suggestions: args.suggestions || [] });
        } catch {
          return errorResponse('Failed to parse AI suggestions');
        }
      }

      // =============================================
      // GLOBAL WORKERS LIST
      // =============================================
      case 'listGlobalWorkers': {
        if (!isAdmin) return errorResponse('Admin only');

        // Get all workers that have incident records
        const { data: recordWorkers } = await supabase
          .from('incidencias_record_workers')
          .select('worker_id, worker_name, worker_number, record_id');

        if (!recordWorkers || recordWorkers.length === 0) {
          // Get departments for filter
          const { data: depts } = await supabase.from('incidencias_departments').select('id, name').eq('active', true).order('name');
          return okResponse({ workers: [], departments: depts || [] });
        }

        // Get all non-deleted records
        const recordIds = [...new Set(recordWorkers.map(rw => rw.record_id))];
        const { data: records } = await supabase
          .from('incidencias_records')
          .select('id, department_id, fecha, incidencias_categories(gravedad), deleted_at')
          .in('id', recordIds)
          .is('deleted_at', null);

        // Get departments
        const { data: depts } = await supabase.from('incidencias_departments').select('id, name').eq('active', true).order('name');
        const deptMap: Record<string, string> = {};
        for (const d of (depts || [])) deptMap[d.id] = d.name;

        // Get worker stats
        const { data: stats } = await supabase.from('incidencias_worker_stats').select('*');
        const statsMap: Record<string, any> = {};
        for (const s of (stats || [])) statsMap[s.worker_id] = s;

        // Build record map
        const recordMap: Record<string, any> = {};
        for (const r of (records || [])) recordMap[r.id] = r;

        // Aggregate per worker
        const workerAgg: Record<string, WorkerAgg> = {};
        interface WorkerAgg {
          worker_id: string;
          worker_name: string;
          worker_number: string | null;
          department_id: string;
          department_name: string;
          total_count: number;
          leves: number;
          graves: number;
          muy_graves: number;
          riesgo_score: number;
          ultima_fecha: string | null;
        }

        for (const rw of recordWorkers) {
          const rec = recordMap[rw.record_id];
          if (!rec) continue;
          
          if (!workerAgg[rw.worker_id]) {
            const st = statsMap[rw.worker_id];
            workerAgg[rw.worker_id] = {
              worker_id: rw.worker_id,
              worker_name: rw.worker_name,
              worker_number: rw.worker_number,
              department_id: rec.department_id,
              department_name: deptMap[rec.department_id] || '—',
              total_count: st?.total_count || 0,
              leves: st?.leves || 0,
              graves: st?.graves || 0,
              muy_graves: st?.muy_graves || 0,
              riesgo_score: st?.riesgo_score || 0,
              ultima_fecha: null,
            };
          }
          // Track latest fecha
          if (!workerAgg[rw.worker_id].ultima_fecha || rec.fecha > workerAgg[rw.worker_id].ultima_fecha) {
            workerAgg[rw.worker_id].ultima_fecha = rec.fecha;
          }
          // Count if stats not available
          if (!statsMap[rw.worker_id]) {
            workerAgg[rw.worker_id].total_count++;
            const grav = (rec.incidencias_categories as any)?.gravedad;
            if (grav === 'leve') workerAgg[rw.worker_id].leves++;
            else if (grav === 'grave') workerAgg[rw.worker_id].graves++;
            else if (grav === 'muy_grave') workerAgg[rw.worker_id].muy_graves++;
          }
        }

        const workersList = Object.values(workerAgg).sort((a, b) => b.riesgo_score - a.riesgo_score || b.total_count - a.total_count);
        return okResponse({ workers: workersList, departments: depts || [] });
      }

      // =============================================
      // ANALYTICS DASHBOARD
      // =============================================
      case 'getAnalyticsData': {
        const { startDate, endDate, compareStartDate, compareEndDate, workerIds, workerTeamIds: analyticsWorkerTeamIds, departmentIds: explicitAnalyticsDeptIds } = body;
        if (!startDate || !endDate) return errorResponse('startDate and endDate required');

        let deptIds = await getAccessibleDeptIds();
        if (Array.isArray(explicitAnalyticsDeptIds) && explicitAnalyticsDeptIds.length > 0) {
          deptIds = explicitAnalyticsDeptIds;
        }

        // Resolve workerTeamIds to actual worker IDs for filtering
        let resolvedWorkerIds = workerIds;
        if (!resolvedWorkerIds && Array.isArray(analyticsWorkerTeamIds) && analyticsWorkerTeamIds.length > 0) {
          const { data: tw } = await supabase.from('workers').select('id').in('worker_team_id', analyticsWorkerTeamIds).is('deleted_at', null);
          resolvedWorkerIds = (tw || []).map((w: any) => w.id);
        }

        async function fetchPeriodData(sd: string, ed: string, filterWorkerIds?: string[]) {
          // 1. Fetch records in period
          let q = supabase
            .from('incidencias_records')
            .select('id, fecha, category_id, department_id')
            .is('deleted_at', null)
            .gte('fecha', sd)
            .lte('fecha', ed);
          if (deptIds && deptIds.length > 0) q = q.in('department_id', deptIds);
          const { data: records } = await q;
          const allRecords = records || [];

          // 2. Get record workers
          const recordIds = allRecords.map(r => r.id);
          const workerData: any[] = [];
          if (recordIds.length > 0) {
            // Batch in chunks of 500 to avoid query limits
            for (let i = 0; i < recordIds.length; i += 500) {
              const chunk = recordIds.slice(i, i + 500);
              const { data: rw } = await supabase
                .from('incidencias_record_workers')
                .select('record_id, worker_id, worker_name')
                .in('record_id', chunk);
              workerData.push(...(rw || []));
            }
          }

          // Filter by workerIds if provided
          let filteredRecordIds: Set<string>;
          if (filterWorkerIds && filterWorkerIds.length > 0) {
            const matchingRecordIds = new Set(
              workerData.filter(w => filterWorkerIds.includes(w.worker_id)).map(w => w.record_id)
            );
            filteredRecordIds = matchingRecordIds;
          } else {
            filteredRecordIds = new Set(recordIds);
          }

          const filteredRecords = allRecords.filter(r => filteredRecordIds.has(r.id));

          // 3. KPIs
          const totalIncidencias = filteredRecords.length;
          const start = new Date(sd);
          const end = new Date(ed);
          const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
          const mediaDiaria = Math.round((totalIncidencias / diffDays) * 100) / 100;

          // 4. Get categories for gravity
          const catIds = [...new Set(filteredRecords.map(r => r.category_id).filter(Boolean))];
          const catMap: Record<string, { name: string; gravedad: string }> = {};
          if (catIds.length > 0) {
            const { data: cats } = await supabase
              .from('incidencias_categories')
              .select('id, name, gravedad')
              .in('id', catIds);
            for (const c of (cats || [])) {
              catMap[c.id] = { name: c.name, gravedad: c.gravedad };
            }
          }

          // 5. Gravity breakdown
          const gravedad = { leve: 0, grave: 0, muy_grave: 0 };
          for (const r of filteredRecords) {
            const g = r.category_id ? catMap[r.category_id]?.gravedad : null;
            if (g === 'grave') gravedad.grave++;
            else if (g === 'muy_grave') gravedad.muy_grave++;
            else gravedad.leve++;
          }
          const gravedadDominante = totalIncidencias === 0
            ? 'ninguna'
            : gravedad.muy_grave >= gravedad.grave && gravedad.muy_grave >= gravedad.leve
            ? 'muy_grave'
            : gravedad.grave >= gravedad.leve ? 'grave' : 'leve';

          // 6. Time series (daily)
          const timeSeries: Record<string, number> = {};
          for (const r of filteredRecords) {
            const day = r.fecha.substring(0, 10);
            timeSeries[day] = (timeSeries[day] || 0) + 1;
          }
          // Fill gaps
          const timeSeriesArray: { date: string; count: number }[] = [];
          const cursor = new Date(sd);
          const endDate2 = new Date(ed);
          while (cursor <= endDate2) {
            const key = cursor.toISOString().substring(0, 10);
            timeSeriesArray.push({ date: key, count: timeSeries[key] || 0 });
            cursor.setDate(cursor.getDate() + 1);
          }

          // 7. Worker ranking
          const workerCounts: Record<string, { name: string; count: number }> = {};
          for (const w of workerData) {
            if (!filteredRecordIds.has(w.record_id)) continue;
            if (!workerCounts[w.worker_id]) {
              workerCounts[w.worker_id] = { name: w.worker_name, count: 0 };
            }
            workerCounts[w.worker_id].count++;
          }
          const ranking = Object.entries(workerCounts)
            .map(([id, v]) => ({ worker_id: id, worker_name: v.name, count: v.count }))
            .sort((a, b) => b.count - a.count);

          // 8. Day of week distribution
          const dayDist = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
          for (const r of filteredRecords) {
            const d = new Date(r.fecha).getDay(); // 0=Sun
            const idx = d === 0 ? 6 : d - 1; // Convert to Mon=0
            dayDist[idx]++;
          }

          // 9. Top categories
          const catCounts: Record<string, { name: string; count: number }> = {};
          for (const r of filteredRecords) {
            const catId = r.category_id || '_sin_categoria';
            const catName = r.category_id ? (catMap[r.category_id]?.name || 'Desconocida') : 'Sin categoría';
            if (!catCounts[catId]) catCounts[catId] = { name: catName, count: 0 };
            catCounts[catId].count++;
          }
          const topCategories = Object.entries(catCounts)
            .map(([id, v]) => ({ id, name: v.name, count: v.count, pct: totalIncidencias > 0 ? Math.round((v.count / totalIncidencias) * 100) : 0 }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);

          return {
            totalIncidencias,
            mediaDiaria,
            gravedad,
            gravedadDominante,
            timeSeries: timeSeriesArray,
            ranking,
            dayDistribution: dayDist,
            topCategories,
          };
        }

        const wIds = Array.isArray(resolvedWorkerIds) && resolvedWorkerIds.length > 0 ? resolvedWorkerIds : undefined;
        const current = await fetchPeriodData(startDate, endDate, wIds);
        let comparison = null;
        if (compareStartDate && compareEndDate) {
          comparison = await fetchPeriodData(compareStartDate, compareEndDate, wIds);
        }

        return okResponse({ current, comparison });
      }

      // =============================================
      // VIDEO EVIDENCE + FRAMES CACHE (bypasses RLS via service role)
      // =============================================
      case 'getProposalEvidencePaths': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: epPropId } = body;
        if (!epPropId) return errorResponse('propuestaId required');

        const { data: prop, error: propErr } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('admin_pruebas_urls, disabled_manager_pruebas, record_id')
          .eq('id', epPropId)
          .maybeSingle();
        if (propErr) return errorResponse(propErr.message);
        if (!prop) return errorResponse('Propuesta not found', 404);

        let recordPruebas: string[] = [];
        let descripcion = '';
        if ((prop as any).record_id) {
          const { data: rec } = await supabase
            .from('incidencias_records')
            .select('pruebas_urls, descripcion')
            .eq('id', (prop as any).record_id)
            .maybeSingle();
          recordPruebas = Array.isArray((rec as any)?.pruebas_urls) ? (rec as any).pruebas_urls : [];
          descripcion = String((rec as any)?.descripcion || '');
        }

        const adminPruebas = Array.isArray((prop as any).admin_pruebas_urls) ? (prop as any).admin_pruebas_urls : [];
        const disabledManager: string[] = Array.isArray((prop as any).disabled_manager_pruebas) ? (prop as any).disabled_manager_pruebas : [];
        const activeManagerPruebas = recordPruebas.filter((p: string) => !disabledManager.includes(p));
        const evidencePaths = [...activeManagerPruebas, ...adminPruebas].filter((p) => typeof p === 'string');
        const videoPaths = evidencePaths.filter((p: string) => VIDEO_EXT_LEGAL.test(String(p).split('?')[0]));
        return okResponse({ evidencePaths, videoPaths, descripcion });
      }

      case 'getVideoDownloadUrl': {
        if (!isAdmin) return errorResponse('Admin only');
        const { videoPath } = body;
        if (!videoPath) return errorResponse('videoPath required');
        const m = String(videoPath).match(/incidencias-pruebas\/([^?]+)/);
        const cleanPath = m ? decodeURIComponent(m[1]) : String(videoPath).split('?')[0];
        const { data: signed, error: signErr } = await supabase.storage
          .from('incidencias-pruebas')
          .createSignedUrl(cleanPath, 60 * 20);
        if (signErr || !signed?.signedUrl) return errorResponse(signErr?.message || 'No se pudo firmar el vídeo');
        return okResponse({ signedUrl: signed.signedUrl, bucketPath: cleanPath });
      }

      case 'getVideoFramesCache': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: vfPropId, videoPath: vfPath } = body;
        if (!vfPropId) return errorResponse('propuestaId required');
        let q = supabase
          .from('incidencias_video_frames')
          .select('frame_url, timestamp_seconds, ai_description, relevance_score, video_path, capture_source, source_video_name, caption, storage_path, verified_at')
          .eq('propuesta_id', vfPropId)
          .order('timestamp_seconds');
        if (vfPath) q = q.eq('video_path', vfPath);
        const { data: frames, error: vfErr } = await q;
        if (vfErr) return errorResponse(vfErr.message);
        // Only return verified V2 captures — the legacy fallback that surfaced
        // unverified storage objects has been removed for safety.
        const verified = (frames || []).filter((f: any) => isVerifiedVideoFrame(f));
        return okResponse({ frames: verified });
      }

      case 'cacheVideoFrame': {
        if (!isAdmin) return errorResponse('Admin only');
        const {
          propuestaId: cfPropId,
          videoPath: cfPath,
          frameUrl,
          frameBase64,
          timestampSeconds,
          aiDescription,
          relevanceScore,
          captureSource,
          sourceVideoName,
          caption,
          storagePath,
        } = body;
        if (!cfPropId || !cfPath || timestampSeconds === undefined || (!frameUrl && !frameBase64)) {
          return errorResponse('propuestaId, videoPath, frameUrl/frameBase64, timestampSeconds required');
        }
        // Strict V2 trace: refuse to cache anything that isn't a verified
        // browser-canvas capture stored under video-frames-v2/.
        const trustedSource = String(captureSource || '');
        const trustedPath = String(storagePath || '');
        if (trustedSource !== 'browser_canvas' || !trustedPath.startsWith('video-frames-v2/')) {
          return errorResponse('Solo se aceptan capturas verificadas (browser_canvas / video-frames-v2/)');
        }

        let persistedFrameUrl = frameUrl;
        if (!persistedFrameUrl && frameBase64) {
          const b64 = String(frameBase64).replace(/^data:image\/jpe?g;base64,/, '');
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const frameBlob = new Blob([bytes], { type: 'image/jpeg' });
          const { error: upErr } = await supabase.storage
            .from('incidencias-pruebas')
            .upload(trustedPath, frameBlob, { contentType: 'image/jpeg', upsert: true });
          if (upErr) return errorResponse(upErr.message);
          const { data: signedFrame, error: signFrameErr } = await supabase.storage
            .from('incidencias-pruebas')
            .createSignedUrl(trustedPath, 31536000);
          if (signFrameErr || !signedFrame?.signedUrl) return errorResponse(signFrameErr?.message || 'No se pudo firmar el fotograma');
          persistedFrameUrl = signedFrame.signedUrl;
        }

        const { error: cfErr } = await supabase
          .from('incidencias_video_frames')
          .upsert({
            propuesta_id: cfPropId,
            video_path: cfPath,
            frame_url: persistedFrameUrl,
            timestamp_seconds: Number(timestampSeconds),
            ai_description: aiDescription || '',
            relevance_score: Number(relevanceScore) || 0,
            capture_source: trustedSource,
            source_video_name: sourceVideoName || null,
            caption: caption || null,
            storage_path: trustedPath,
            verified_at: new Date().toISOString(),
          }, { onConflict: 'propuesta_id,video_path,timestamp_seconds' });
        if (cfErr) return errorResponse(cfErr.message);
        return okResponse({ ok: true, frameUrl: persistedFrameUrl, storagePath: trustedPath });
      }

      case 'clearVideoFramesCache': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: clPropId, videoPath: clPath } = body;
        if (!clPropId) return errorResponse('propuestaId required');
        let dq = supabase.from('incidencias_video_frames').delete().eq('propuesta_id', clPropId);
        if (clPath) dq = dq.eq('video_path', clPath);
        const { error: clErr } = await dq;
        if (clErr) return errorResponse(clErr.message);
        return okResponse({ ok: true });
      }

      // List frames currently cached for a proposal — used by the audit panel
      // so the admin can preview EXACTLY what will be inserted in the legal doc.
      // Each row carries `verified` so the UI can flag legacy/non-V2 entries.
      case 'listVideoFrames': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: lvfId } = body;
        if (!lvfId) return errorResponse('propuestaId required');
        const { data: frames, error: lvfErr } = await supabase
          .from('incidencias_video_frames')
          .select('*')
          .eq('propuesta_id', lvfId)
          .order('video_path', { ascending: true })
          .order('timestamp_seconds', { ascending: true });
        if (lvfErr) return errorResponse(lvfErr.message);
        const enriched = (frames || []).map((f: any) => ({
          ...f,
          verified: isVerifiedVideoFrame(f),
          video_name: videoFileNameFromPath(f.video_path || ''),
          timestamp_label: formatTimestampMMSS(Number(f.timestamp_seconds) || 0),
        }));
        return okResponse({ frames: enriched });
      }

      // Delete a single cached frame row (used by the audit panel).
      case 'deleteVideoFrame': {
        if (!isAdmin) return errorResponse('Admin only');
        const { frameId } = body;
        if (!frameId) return errorResponse('frameId required');
        // Best-effort: also remove the underlying storage object if it lives in v2 path
        const { data: frameRow } = await supabase
          .from('incidencias_video_frames')
          .select('storage_path')
          .eq('id', frameId)
          .maybeSingle();
        if (frameRow?.storage_path && String(frameRow.storage_path).startsWith('video-frames-v2/')) {
          await supabase.storage.from('incidencias-pruebas').remove([frameRow.storage_path]).catch(() => {});
        }
        const { error: dErr } = await supabase.from('incidencias_video_frames').delete().eq('id', frameId);
        if (dErr) return errorResponse(dErr.message);
        return okResponse({ ok: true });
      }

      // =============================================
      // LEGAL DOCUMENTS
      // =============================================
      case 'generateLegalDocument': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: legalPropId, force_regenerate } = body;
        if (!legalPropId) return errorResponse('propuestaId required');

        // Load propuesta + record + workers
        const { data: legalProp } = await supabase.from('incidencias_propuestas_rrhh').select('*').eq('id', legalPropId).single();
        if (!legalProp) return errorResponse('Propuesta not found');

        // Inherit the admin-defined default font-size offset for new documents
        const { data: aiCfgRow } = await supabase
          .from('incidencias_ai_config')
          .select('default_font_delta')
          .limit(1)
          .maybeSingle();
        const rawDefaultFontDelta = aiCfgRow?.default_font_delta;
        const defaultFontDelta = (rawDefaultFontDelta === null || rawDefaultFontDelta === undefined)
          ? 1.5
          : (Number(rawDefaultFontDelta) || 0);

        const { data: legalRecForAnalysis } = (legalProp as any).record_id
          ? await supabase
              .from('incidencias_records')
              .select('ai_motivo_legal, ai_tipo_razonamiento, ai_articulos_relevantes')
              .eq('id', (legalProp as any).record_id)
              .single()
          : { data: null };

        const hasPersistedAnalysis = !!(legalProp as any).ai_analysis;
        const hasRecordAnalysisSignals = !!(
          legalRecForAnalysis?.ai_motivo_legal ||
          legalRecForAnalysis?.ai_tipo_razonamiento ||
          (Array.isArray(legalRecForAnalysis?.ai_articulos_relevantes) && legalRecForAnalysis.ai_articulos_relevantes.length > 0)
        );

        if ((legalProp as any).tipo !== 'nspp' && !hasPersistedAnalysis && !hasRecordAnalysisSignals) {
          return errorResponse('Primero debe completarse el análisis IA');
        }

        // ── NSPP branch: generate NSPP extinction document ──
        if ((legalProp as any).tipo === 'nspp') {
          const { data: legalDeptNspp } = await supabase.from('incidencias_departments').select('id, name').eq('id', legalProp.department_id).single();
          const adminPruebasNsppLegal = Array.isArray((legalProp as any).admin_pruebas_urls) ? (legalProp as any).admin_pruebas_urls : [];
          const IMAGE_EXT_NSPP_L = /\.(jpg|jpeg|png|gif|webp)$/i;
          const nsppLegalImagePaths = adminPruebasNsppLegal.filter((p: string) => IMAGE_EXT_NSPP_L.test(p.split('?')[0])).slice(0, 10);
          const nsppLegalSignedUrls: string[] = [];
          if (nsppLegalImagePaths.length > 0) {
            const { data: signed } = await supabase.storage.from('incidencias-pruebas').createSignedUrls(nsppLegalImagePaths, 31536000);
            if (signed) nsppLegalSignedUrls.push(...signed.filter((s: any) => s.signedUrl).map((s: any) => s.signedUrl));
          }

          const supabaseAnonKeyNspp = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const aiResNspp = await fetch(`${supabaseUrl}/functions/v1/control-incidencias-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKeyNspp}` },
            body: JSON.stringify({
              action: 'generateNSPPDocument',
              worker_name: (legalProp as any).nspp_worker_name,
              worker_number: (legalProp as any).nspp_worker_number,
              worker_fiscal_id: (legalProp as any).nspp_worker_fiscal_id || '',
              department_name: legalDeptNspp?.name || '',
              start_contract_date: (legalProp as any).nspp_start_contract_date,
              days_remaining: (legalProp as any).nspp_days_remaining,
              justificacion: (legalProp as any).nspp_justificacion,
              encargado_nombre: (legalProp as any).nspp_encargado_name,
              imagen_urls: nsppLegalSignedUrls,
            }),
          });

          let nsppAiContent: any = {};
          if (aiResNspp.ok) nsppAiContent = await aiResNspp.json();

          const fechaEmisionNspp = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
          const expedienteNspp = `NSPP-${new Date().getFullYear()}-${legalPropId.substring(0, 8).toUpperCase()}`;
          const fechaContratoNspp = (legalProp as any).nspp_start_contract_date
            ? new Date((legalProp as any).nspp_start_contract_date).toLocaleDateString('es-ES')
            : '—';

          const htmlNspp = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Comunicación NSPP - ${(legalProp as any).nspp_worker_name}</title>
 <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Poppins',sans-serif;color:#1a1a1a;font-size:12.5px;font-weight:300;letter-spacing:-0.02em;line-height:1.6;max-width:800px;margin:0 auto;padding:40px 40px 80px}
h1{font-weight:600;font-size:18px;margin-bottom:0;letter-spacing:-0.03em}
h2{font-weight:600;font-size:14.5px;margin:28px 0 12px;color:#555;letter-spacing:-0.02em}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e5e5;padding-bottom:20px;margin-bottom:24px}
.header-left{display:flex;align-items:center;gap:12px;flex:1}
.header-left img{height:38px}
.header-left-text{display:flex;flex-direction:column;gap:1px}
.header-left-text p{font-size:11px;color:#888;margin:0;line-height:1.3;font-weight:300;letter-spacing:-0.03em}
.header-right{flex:1;text-align:right;font-size:11px;color:#888;line-height:1.6;font-weight:300;letter-spacing:-0.03em}
.badge{display:inline-block;padding:4px 14px;border-radius:6px;font-size:11px;font-weight:600;letter-spacing:-0.01em;color:#c45a00;background:#fff3e0;border:1.5px solid #f59e0b}
.worker-info{background:#f9f9f9;border-radius:10px;padding:16px 20px;margin:16px 0;font-size:12.5px;font-weight:300;letter-spacing:-0.03em}
.worker-info table{width:100%;border-collapse:collapse}
.worker-info td{padding:4px 0;vertical-align:top}
.worker-info td:first-child{font-weight:300;color:#888;width:160px}
.worker-info strong{font-weight:600}
.worker-id-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0;page-break-inside:avoid}
.worker-id-card{background:#f9f9f9;border-radius:10px;padding:14px 18px;font-size:12.5px;font-weight:300;letter-spacing:-0.03em;display:flex;flex-direction:column;gap:10px}
.worker-id-card .field{display:flex;flex-direction:column;gap:2px;line-height:1.45}
.worker-id-card .label{font-size:11px;color:#888;font-weight:300;letter-spacing:0.02em}
.worker-id-card .value{font-size:12.5px;color:#1a1a1a;font-weight:300}
.worker-id-card .value strong{font-weight:600}
.worker-id-extra{background:#f9f9f9;border-radius:10px;padding:12px 18px;margin:8px 0 16px;font-size:12.5px;font-weight:300;letter-spacing:-0.03em;display:flex;flex-direction:column;gap:2px;page-break-inside:avoid}
.worker-id-extra .label{font-size:11px;color:#888;font-weight:300;letter-spacing:0.02em}
.worker-id-extra .value{font-size:12.5px;color:#1a1a1a;font-weight:300}
.section{margin:20px 0;font-size:12.5px;font-weight:300;letter-spacing:-0.02em;line-height:1.6}
.section p{margin-bottom:8px}
.justificacion{background:#fff3e0;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px;margin:12px 0;font-size:12.5px;font-weight:300;letter-spacing:-0.02em;line-height:1.6}
.articulos{background:#f0f9e8;border-left:3px solid #93d600;border-radius:0 8px 8px 0;padding:14px 18px;margin:12px 0;font-size:11px;font-weight:300;letter-spacing:-0.02em;line-height:1.56}
.articulos strong{font-weight:600}
.advertencias{background:#fef3cd;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px;margin:12px 0;font-size:11px;font-weight:300;letter-spacing:-0.02em;line-height:1.56}
.firma-section{display:flex;gap:40px;margin-top:54px;page-break-inside:avoid}
.firma-box{flex:1;text-align:center;padding-top:16px;border-top:1px solid #ccc}
.firma-box p{font-size:11px;color:#888;margin-top:4px;font-weight:300;letter-spacing:-0.03em}
.footer{margin-top:60px;padding-top:12px;border-top:1px solid #e5e5e5;font-size:10px;color:#aaa;display:flex;justify-content:space-between;font-weight:300;letter-spacing:-0.03em}
@media print{body{padding:30px 30px 60px;max-width:100%}}
</style></head><body>
<div class="header">
<div class="header-left">
<img src="${LEGAL_DOCUMENT_LOGO_URL}" alt="Verdnatura">
<div class="header-left-text"><h1>Verdnatura Levante S.L.</h1><p>Comunicación de extinción en periodo de prueba</p></div>
</div>
<div class="header-right">B97367486 - Carrer Fenollar, 2, 46680, Algemesí (Valencia)<br>${fechaEmisionNspp}</div>
</div>

<div style="margin-bottom:20px">
<span class="badge">NO SUPERACIÓN PERIODO DE PRUEBA</span>
<span style="font-size:11px;color:#888;margin-left:12px">${expedienteNspp}</span>
</div>

<h2>Identificación del trabajador/a</h2>
<div class="worker-id-grid">
  <div class="worker-id-card">
    <div class="field"><span class="label">Nombre completo</span><span class="value"><strong>${(legalProp as any).nspp_worker_name}</strong></span></div>
    <div class="field"><span class="label">DNI/NIE</span><span class="value">${(legalProp as any).nspp_worker_fiscal_id || '—'}</span></div>
  </div>
  <div class="worker-id-card">
    <div class="field"><span class="label">Nº ficha</span><span class="value">${(legalProp as any).nspp_worker_number || '—'}</span></div>
    <div class="field"><span class="label">Departamento</span><span class="value">${legalDeptNspp?.name || '—'}</span></div>
  </div>
</div>
<div class="worker-id-extra">
  <span class="label">Fecha inicio contrato</span>
  <span class="value">${fechaContratoNspp}${(legalProp as any).nspp_days_remaining != null ? ` · <span style="color:#888">${(legalProp as any).nspp_days_remaining} día(s) restantes P.P.</span>` : ''}</span>
</div>

<h2>Objeto de la comunicación</h2>
<div class="section"><p>${nsppAiContent.objeto || `Por medio de la presente comunicación, Verdnatura Levante S.L. hace saber al trabajador/a identificado/a anteriormente que, en el ejercicio de la facultad reconocida en el artículo 14 del Estatuto de los Trabajadores, la empresa ha decidido no continuar con la relación laboral iniciada, habida cuenta de que el/la trabajador/a no ha superado el período de prueba pactado.`}</p></div>

<h2>Fundamentación jurídica</h2>
<div class="section"><p>${nsppAiContent.fundamentacion_juridica || `De conformidad con el artículo 14.2 del Real Decreto Legislativo 2/2015, de 23 de octubre, por el que se aprueba el Texto Refundido de la Ley del Estatuto de los Trabajadores, durante el período de prueba, cualquiera de las partes podrá desistir de la relación laboral sin necesidad de preaviso y sin derecho a indemnización alguna, salvo pacto en contrario.`}</p></div>

<h2>Motivos de no superación comunicados por el encargado</h2>
<div class="justificacion"><p style="white-space:pre-wrap">${(legalProp as any).nspp_justificacion}</p></div>

${nsppAiContent.exposicion_hechos ? `<h2>Valoración</h2><div class="section"><p>${nsppAiContent.exposicion_hechos}</p></div>` : ''}

${nsppLegalSignedUrls.length > 0 ? `<h2>Documentación adjunta</h2><div style="margin:16px 0;padding:12px;background:#f9f9f9;border-radius:8px;border:1px solid #e5e5e5"><div style="display:flex;flex-wrap:wrap;gap:12px">${nsppLegalSignedUrls.map((url, i) => `<figure style="margin:0;max-width:280px"><img src="${url}" alt="Evidencia ${i+1}" style="max-width:100%;max-height:200px;border-radius:6px;border:1px solid #ddd;display:block"></figure>`).join('')}</div></div>` : ''}

<h2>Efectos</h2>
<div class="section"><p>${nsppAiContent.efectos || `La extinción del contrato de trabajo produce efectos desde la fecha de la presente comunicación. El/la trabajador/a tiene derecho a percibir los salarios devengados hasta la fecha de extinción, así como la liquidación de los días de vacaciones proporcionales no disfrutadas.`}</p></div>

<div class="firma-section">
<div class="firma-box"><p><strong>Verdnatura Levante S.L.</strong></p><img src="${LEGAL_DOCUMENT_SIGNATURE_URL}" alt="Firma y sello" style="max-width:250px;margin:10px auto;display:block;object-fit:contain"></div>
<div class="firma-box"><p>Recibí — ${(legalProp as any).nspp_worker_name}</p></div>
</div>

<div class="footer"><span>${expedienteNspp}</span><span>Fecha emisión: ${fechaEmisionNspp}</span></div>
</body></html>`;

          // Save as a legal document (using a synthetic worker_id based on propuesta)
          const { data: nsppDoc } = await supabase.from('incidencias_legal_documents').insert({
            propuesta_id: legalPropId,
            worker_id: legalPropId, // synthetic: use propuesta id as worker_id placeholder
            worker_name: (legalProp as any).nspp_worker_name,
            worker_number: (legalProp as any).nspp_worker_number || null,
            department_id: legalProp.department_id,
            tipo: 'nspp',
            gravedad_final: 'muy_grave',
            descripcion_hechos: (legalProp as any).nspp_justificacion || '',
            fundamentacion_juridica: nsppAiContent.fundamentacion_juridica || '',
            articulos_citados: ['Art. 14.2 ET'],
            sancion_aplicada: 'nspp',
            html_content: htmlNspp,
            font_delta: defaultFontDelta,
            created_by: manager.name,
          }).select().single();

          await writeIncidenciasLog('generar_documento_nspp', null, legalPropId, `Documento NSPP generado por ${manager.name} para ${(legalProp as any).nspp_worker_name}`, null);
          return okResponse({ documents: nsppDoc ? [nsppDoc] : [] });
        }

        const { data: legalRec } = await supabase.from('incidencias_records').select('*, incidencias_categories(name, gravedad)').eq('id', legalProp.record_id).single();
        if (!legalRec) return errorResponse('Record not found');

        const { data: legalWorkers } = await supabase.from('incidencias_record_workers').select('worker_id, worker_name, worker_number').eq('record_id', legalProp.record_id);
        const targetWorkerId = (legalProp as any).target_worker_id || null;
        const legalWorkerIds = (legalWorkers || []).map((w: any) => w.worker_id).filter(Boolean);
        const legalWorkersFiscalMap: Record<string, string> = {};
        const legalWorkersFiscalByNumber: Record<string, string> = {};
        if (legalWorkerIds.length > 0) {
          const { data: wRows } = await supabase.from('workers').select('id, fiscal_id').in('id', legalWorkerIds);
          for (const r of (wRows || [])) if (r.fiscal_id) legalWorkersFiscalMap[r.id] = r.fiscal_id;
        }
        // Fallback: lookup by worker_number for workers without worker_id link
        const legalNumbersWithoutId = (legalWorkers || [])
          .filter((w: any) => !w.worker_id && w.worker_number)
          .map((w: any) => String(w.worker_number).trim());
        if (legalNumbersWithoutId.length > 0) {
          const { data: byNum } = await supabase.from('workers').select('worker_number, fiscal_id').in('worker_number', legalNumbersWithoutId);
          for (const r of (byNum || [])) if (r.fiscal_id && r.worker_number) legalWorkersFiscalByNumber[String(r.worker_number).trim()] = r.fiscal_id;
        }
        // Also fill by-number map for workers WITH id, in case number-based lookup is needed
        const legalAllNumbers = (legalWorkers || []).map((w: any) => w.worker_number).filter(Boolean).map((n: any) => String(n).trim());
        if (legalAllNumbers.length > 0 && Object.keys(legalWorkersFiscalByNumber).length === 0) {
          const { data: byNumAll } = await supabase.from('workers').select('worker_number, fiscal_id').in('worker_number', legalAllNumbers);
          for (const r of (byNumAll || [])) if (r.fiscal_id && r.worker_number) legalWorkersFiscalByNumber[String(r.worker_number).trim()] = r.fiscal_id;
        }
        const resolveFiscalId = (w: any): string => {
          if (w?.worker_id && legalWorkersFiscalMap[w.worker_id]) return legalWorkersFiscalMap[w.worker_id];
          if (w?.worker_number && legalWorkersFiscalByNumber[String(w.worker_number).trim()]) return legalWorkersFiscalByNumber[String(w.worker_number).trim()];
          return '';
        };
        const { data: legalDept } = await supabase.from('incidencias_departments').select('id, name').eq('id', legalProp.department_id).single();

        const workers = targetWorkerId
          ? (legalWorkers || []).filter((w: any) => w.worker_id === targetWorkerId)
          : (legalWorkers || []);
        if (targetWorkerId && workers.length === 0) {
          return errorResponse('No se encontró el trabajador asociado a esta propuesta');
        }
        const docs: any[] = [];

        // Check if all docs already exist (from auto-generation)
        if (!force_regenerate) {
          let existingDocsQuery = supabase
            .from('incidencias_legal_documents')
            .select('*')
            .eq('propuesta_id', legalPropId)
            .eq('anulado', false)
            .order('created_at', { ascending: false });
          if (targetWorkerId) existingDocsQuery = existingDocsQuery.eq('worker_id', targetWorkerId);
          const { data: allExistingDocs } = await existingDocsQuery;
          if (allExistingDocs && allExistingDocs.length > 0) {
            return okResponse({ documents: allExistingDocs });
          }
        }

        for (const w of workers) {
          // Force regenerate: delete existing docs and linked signature tasks first
          if (force_regenerate) {
            const deleteError = await deleteExistingLegalDocumentsForWorker(supabase, legalPropId, w.worker_id);
            if (deleteError) {
              return errorResponse(`Error al limpiar el documento anterior: ${deleteError.message}`);
            }
          }

          // Call AI to generate the legal document content
          const supabaseUrl2 = Deno.env.get('SUPABASE_URL')!;
          const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

          // Gather all visual evidences for AI analysis and final HTML.
          // Static images are handled through the AI decision. Cached video frames
          // are always injected deterministically below so the document cannot
          // omit real frames just because the AI did not return `imagenes_evidencia`.
          const recPruebasRaw = Array.isArray(legalRec.pruebas_urls) ? legalRec.pruebas_urls : [];
          const adminPruebasLegal = Array.isArray((legalProp as any).admin_pruebas_urls) ? (legalProp as any).admin_pruebas_urls : [];
          const disabledManagerLegal: string[] = Array.isArray((legalProp as any).disabled_manager_pruebas) ? (legalProp as any).disabled_manager_pruebas : [];
          const recPruebas = recPruebasRaw.filter((p: string) => !disabledManagerLegal.includes(p));
          const allLegalPaths = [...recPruebas, ...adminPruebasLegal];
          const IMAGE_EXT_LEGAL = /\.(jpg|jpeg|png|gif|webp)$/i;
          const legalVideoPaths = allLegalPaths
            .filter((p: string) => typeof p === 'string' && VIDEO_EXT_LEGAL.test(p.split('?')[0]))
            .slice(0, 3);
          const legalImagePaths = allLegalPaths.filter((p: string) => typeof p === 'string' && IMAGE_EXT_LEGAL.test(p.split('?')[0])).slice(0, 10);

          const legalSignedUrls: string[] = [];
          if (legalImagePaths.length > 0) {
            const rawPaths = legalImagePaths.map((p: string) => {
              const match = p.match(/\/object\/sign\/incidencias-pruebas\/(.+?)(\?|$)/);
              return match ? decodeURIComponent(match[1]) : p;
            });
            const { data: signedLegalData } = await supabase.storage.from('incidencias-pruebas').createSignedUrls(rawPaths, 31536000);
            if (signedLegalData) {
              for (const item of signedLegalData) {
                if (item.signedUrl) legalSignedUrls.push(item.signedUrl);
              }
            }
          }

          const { data: cachedVideoFrames, error: cachedVideoFramesError } = await supabase
            .from('incidencias_video_frames')
            .select('frame_url, timestamp_seconds, ai_description, relevance_score, video_path, capture_source, source_video_name, caption, storage_path, verified_at')
            .eq('propuesta_id', legalPropId)
            .order('video_path', { ascending: true })
            .order('timestamp_seconds', { ascending: true });
          if (cachedVideoFramesError) {
            console.warn('[generateLegalDocument] Could not load cached video frames:', cachedVideoFramesError.message);
          }

          // STRICT V2 GATE: only verified browser-canvas captures from
          // video-frames-v2/ may appear in the legal document. No fallback.
          const videoFrameEvidences = (cachedVideoFrames || [])
            .filter((frame: any) => isVerifiedVideoFrame(frame))
            .slice(0, 9)
            .map((frame: any) => ({
              url: frame.frame_url,
              descripcion: buildVideoFrameCaption(frame),
            }));

          console.log('[generateLegalDocument] Verified video frames loaded', {
            propuestaId: legalPropId,
            verified: videoFrameEvidences.length,
            totalCached: (cachedVideoFrames || []).length,
          });

          if (legalVideoPaths.length > 0 && videoFrameEvidences.length === 0) {
            return errorResponse('Hay vídeo asociado, pero no hay fotogramas reales verificados. Pulsa “Regenerar” o “Insertar fotogramas reales del vídeo” para extraerlos antes de generar el documento.');
          }

          const aiRes = await fetch(`${supabaseUrl2}/functions/v1/control-incidencias-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
            body: JSON.stringify({
              action: 'generateLegalDocument',
              worker_name: w.worker_name,
              worker_number: w.worker_number || '',
              department_name: legalDept?.name || '',
              gravedad: legalProp.gravedad,
              tipo: legalProp.tipo,
              descripcion_hechos: legalRec.descripcion || '',
              fecha_hechos: legalRec.fecha,
              suspension_dias: legalProp.suspension_dias,
              fecha_inicio: legalProp.fecha_inicio,
              sin_suspension_explicita: legalProp.tipo === 'sancion' && legalProp.sin_suspension_explicita === true,
              ai_motivo_legal: legalRec.ai_motivo_legal || '',
              ai_articulos: legalRec.ai_articulos_relevantes || [],
              categoria: legalRec.incidencias_categories?.name || '',
              custom_category_name: (legalRec as any).custom_category_name || '',
              imagen_urls: legalSignedUrls,
              ai_analysis: (legalProp as any).ai_analysis || null,
              worker_fiscal_id: resolveFiscalId(w),
            }),
          });

          let aiContent: any = {};
          if (aiRes.ok) {
            aiContent = await aiRes.json();
          }

          // Build image HTML blocks per section
          const imagesBySection: Record<string, Array<{ url: string; descripcion: string; aspectRatio?: number; layout?: string }>> = {
            exposicion_hechos: [...videoFrameEvidences],
            calificacion_falta: [],
            medida_disciplinaria: [],
          };

          if (Array.isArray(aiContent.imagenes_evidencia) && legalSignedUrls.length > 0) {
            for (const imgEv of aiContent.imagenes_evidencia) {
              if (imgEv.incluir_imagen === false) continue;
              const signedUrl = legalSignedUrls[imgEv.indice];
              const seccion = imgEv.seccion_recomendada || 'exposicion_hechos';
              if (signedUrl && imagesBySection[seccion]) {
                imagesBySection[seccion].push({
                  url: signedUrl,
                  descripcion: imgEv.descripcion,
                  layout: imgEv.layout_recomendado || undefined,
                });
              }
            }
          } else if (legalSignedUrls.length > 0) {
            // Fallback: if the AI did not return image captions (typically a 429
            // / 504 transient error), still attach the images to "exposición de
            // hechos" with a minimal caption so the document can be generated
            // and the user is not blocked.
            console.warn('[generateLegalDocument] AI returned no imagenes_evidencia, using fallback captions', {
              propuestaId: legalPropId,
              imagesCount: legalSignedUrls.length,
              aiOk: aiRes.ok,
              aiStatus: aiRes.status,
            });
            // Detect tardiness case to force "fila_grande" layout (one image per
            // row at large size) so weekly clock-in screenshots remain legible.
            const catNameForFallback = String(legalRec.incidencias_categories?.name || (legalRec as any).custom_category_name || '').toLowerCase();
            const descForFallback = String(legalRec.descripcion || '');
            const isImpuntualidadFallback = /(impuntual|retraso|tardanz|llegad[ao]s?\s+tarde)/i.test(catNameForFallback)
              || (descForFallback.match(/(?:entrada|prevista)\s*\d{1,2}[:.]\d{2}[\s\S]{0,40}?llegada\s*\d{1,2}[:.]\d{2}/gi) || []).length >= 3;
            legalSignedUrls.forEach((url, i) => {
              imagesBySection.exposicion_hechos.push({
                url,
                descripcion: isImpuntualidadFallback
                  ? `<strong>Captura semanal de fichajes ${i + 1}</strong> — registro horario aportado como prueba documental de los retrasos imputados.`
                  : `Evidencia gráfica ${i + 1}`,
                layout: isImpuntualidadFallback ? 'fila_grande' : undefined,
              });
            });
          }

          // Detect orientation per image so the renderer can switch to a
          // floating sidebar layout when there is a single vertical capture.
          await enrichImagesWithAspectRatio(supabase, imagesBySection);

          const tempDocId = crypto.randomUUID();
          const documentCode = generateDocumentCode(legalProp.tipo, tempDocId);

          // Manual collage layout (admin-saved) overrides the AI/auto pipeline.
          const manualCollageHtmlMain = await buildManualCollageHtml(
            supabase,
            (legalProp as any).collage_layout || null,
          );

          const htmlContentRaw = buildLegalDocumentHtml({
            workerName: w.worker_name,
            workerNumber: w.worker_number || '',
            workerFiscalId: resolveFiscalId(w),
            deptName: legalDept?.name || '—',
            gravedad: legalProp.gravedad,
            tipo: legalProp.tipo,
            propuestaId: legalPropId,
            documentCode,
            aiContent: { ...aiContent, exposicion_hechos: aiContent.exposicion_hechos || legalRec.descripcion || '' },
            imagesBySection,
            suspensionDias: legalProp.suspension_dias,
            suspensionFechas: Array.isArray((legalProp as any).suspension_fechas) ? (legalProp as any).suspension_fechas : null,
            fechaInicio: legalProp.fecha_inicio,
            sinSuspensionExplicita: legalProp.tipo === 'sancion' && (legalProp as any).sin_suspension_explicita === true,
            descripcionHechos: legalRec.descripcion || '',
            fechaHechos: legalRec.fecha,
            categoria: legalRec.incidencias_categories?.name || '',
            aiMotivoLegal: legalRec.ai_motivo_legal || '',
            articulosBase: legalRec.ai_articulos_relevantes || [],
            manualCollageHtml: manualCollageHtmlMain,
          });

          // El admin tiene la última palabra: forzamos coherencia narrativa
          // (badges, gravedad mencionada en el cuerpo, tipo de medida) según
          // lo que el admin marcó en el selector, no lo que la IA recomendó.
          const htmlContent = enforceLegalDocumentHtmlConsistency(htmlContentRaw, {
            tipo: legalProp.tipo,
            gravedad: legalProp.gravedad,
            suspensionDias: legalProp.suspension_dias ?? null,
            sinSuspensionExplicita: legalProp.tipo === 'sancion' && (legalProp as any).sin_suspension_explicita === true,
          });

          const { data: newDoc, error: docErr } = await supabase.from('incidencias_legal_documents').insert({
            id: tempDocId,
            propuesta_id: legalPropId,
            worker_id: w.worker_id,
            worker_name: w.worker_name,
            worker_number: w.worker_number || null,
            department_id: legalProp.department_id,
            tipo: legalProp.tipo,
            gravedad_final: legalProp.gravedad,
            descripcion_hechos: normalizeConvenioCitations(aiContent.exposicion_hechos || legalRec.descripcion || ''),
            fundamentacion_juridica: normalizeConvenioCitations(aiContent.fundamentacion_juridica || ''),
            articulos_citados: normalizeConvenioCitationList(aiContent.articulos_citados || []),
            sancion_aplicada: legalProp.tipo === 'amonestacion' ? 'amonestacion_escrita' : (legalProp.suspension_dias ? 'suspension' : 'amonestacion_escrita'),
            suspension: !!(legalProp.suspension_dias),
            dias_suspension: legalProp.suspension_dias || null,
            fecha_inicio_suspension: legalProp.fecha_inicio || null,
            plazo_alegaciones_dias: legalProp.gravedad === 'muy_grave' ? 5 : 3,
            html_content: htmlContent,
            font_delta: defaultFontDelta,
            created_by: manager.name,
            document_code: documentCode,
          }).select().single();

          // Race-condition guard: a concurrent request (background auto-gen +
          // manual click) may already have created the document for this
          // (propuesta, worker) pair. The unique partial index
          // uniq_legal_doc_per_proposal_worker raises 23505. In that case we
          // silently fetch the existing document so we never end up with two
          // sanctions/amonestaciones for the same worker on the same propuesta.
          if (docErr) {
            if ((docErr as any).code === '23505') {
              const { data: existingDoc } = await supabase
                .from('incidencias_legal_documents')
                .select('*')
                .eq('propuesta_id', legalPropId)
                .eq('worker_id', w.worker_id)
                .eq('anulado', false)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              if (existingDoc) {
                docs.push(existingDoc);
                continue;
              }
            }
            console.error('Failed to create legal document:', docErr);
            continue;
          }

          // Create firma task (idempotent: unique index uniq_firma_task_per_legal_doc)
          if (newDoc) {
            const { error: firmaErr } = await supabase.from('incidencias_firma_tasks').insert({
              legal_document_id: newDoc.id,
              worker_id: w.worker_id,
              worker_name: w.worker_name,
            });
            if (firmaErr && (firmaErr as any).code !== '23505') {
              console.error('Failed to create firma task:', firmaErr);
            }
            docs.push(newDoc);
          }
        }

        await writeIncidenciasLog('generar_documento_legal', legalRec.id, legalPropId, `Documento(s) legal(es) generado(s) por ${manager.name} para ${workers.map(w => w.worker_name).join(', ')}`, null);

        return okResponse({ documents: docs });
      }

      // =============================================
      // GENERATE PLIEGO DE CARGOS (Audiencia previa)
      // =============================================
      // Genera un documento previo al expediente sancionador para faltas
      // muy graves donde se requiere audiencia previa (5 días hábiles de
      // alegaciones). NO es la sanción definitiva.
      case 'generatePliegoCargos': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: pcPropId } = body;
        if (!pcPropId) return errorResponse('propuestaId required');

        const { data: pcProp } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('*')
          .eq('id', pcPropId)
          .single();
        if (!pcProp) return errorResponse('Propuesta not found');

        if ((pcProp as any).tipo === 'nspp') {
          return errorResponse('NSPP no requiere pliego de cargos');
        }
        if (!(pcProp as any).requiere_audiencia_previa) {
          return errorResponse('Esta propuesta no requiere audiencia previa');
        }
        if (!(pcProp as any).ai_analysis) {
          return errorResponse('Primero debe completarse el análisis IA');
        }

        const { data: pcRec } = await supabase
          .from('incidencias_records')
          .select('*, incidencias_categories(name, gravedad)')
          .eq('id', pcProp.record_id)
          .single();
        if (!pcRec) return errorResponse('Record not found');

        const { data: pcWorkers } = await supabase
          .from('incidencias_record_workers')
          .select('worker_id, worker_name, worker_number')
          .eq('record_id', pcProp.record_id);
        const { data: pcDept } = await supabase
          .from('incidencias_departments')
          .select('id, name')
          .eq('id', pcProp.department_id)
          .single();

        // Fetch fiscal_id for pliego workers (by id and fallback by number)
        const pcWorkerIds = (pcWorkers || []).map((w: any) => w.worker_id).filter(Boolean);
        const pcFiscalMap: Record<string, string> = {};
        const pcFiscalByNumber: Record<string, string> = {};
        if (pcWorkerIds.length > 0) {
          const { data: pcWf } = await supabase.from('workers').select('id, fiscal_id').in('id', pcWorkerIds);
          for (const r of (pcWf || [])) if (r.fiscal_id) pcFiscalMap[r.id] = r.fiscal_id;
        }
        const pcAllNumbers = (pcWorkers || []).map((w: any) => w.worker_number).filter(Boolean).map((n: any) => String(n).trim());
        if (pcAllNumbers.length > 0) {
          const { data: pcByNum } = await supabase.from('workers').select('worker_number, fiscal_id').in('worker_number', pcAllNumbers);
          for (const r of (pcByNum || [])) if (r.fiscal_id && r.worker_number) pcFiscalByNumber[String(r.worker_number).trim()] = r.fiscal_id;
        }
        const resolvePcFiscalId = (w: any): string => {
          if (w?.worker_id && pcFiscalMap[w.worker_id]) return pcFiscalMap[w.worker_id];
          if (w?.worker_number && pcFiscalByNumber[String(w.worker_number).trim()]) return pcFiscalByNumber[String(w.worker_number).trim()];
          return '';
        };
        const pcFiscalList = (pcWorkers || []).map((w: any) => resolvePcFiscalId(w)).filter(Boolean).join(', ');
        const pcWorkerNumbersList = (pcWorkers || []).map((w: any) => w.worker_number).filter(Boolean).join(', ');

        const ai = (pcProp as any).ai_analysis || {};
        const articulos: string[] = Array.isArray(ai.articulos_aplicables) ? ai.articulos_aplicables : [];
        const hechos = ai.valoracion_hechos || pcRec.descripcion || '';
        const fundamentacion = ai.fundamentacion_legal || '';
        const citaAdvertencia = ai.cita_advertencia_previa || '';

        // Calcular plazo de 5 días hábiles
        const today = new Date();
        const fechaLimite = new Date(today);
        let added = 0;
        while (added < 5) {
          fechaLimite.setDate(fechaLimite.getDate() + 1);
          const dow = fechaLimite.getDay();
          if (dow !== 0 && dow !== 6) added++;
        }
        const fechaEmision = today.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        const fechaLimiteStr = fechaLimite.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        const expediente = `PLIEGO-${today.getFullYear()}-${pcPropId.substring(0, 8).toUpperCase()}`;
        const workersList = (pcWorkers || []).map(w => w.worker_name).join(', ');
        const articulosHtml = articulos.length > 0
          ? articulos.map(a => `<span style="display:inline-block;background:#fff3e0;border:1px solid #f59e0b;color:#c45a00;padding:2px 10px;border-radius:6px;font-size:11px;margin:0 4px 4px 0;font-weight:600;letter-spacing:-0.01em">Art. ${a}</span>`).join('')
          : '<em style="color:#888">—</em>';

        const htmlPliego = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Pliego de cargos - ${workersList}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Poppins',sans-serif;color:#1a1a1a;font-size:12.5px;font-weight:300;letter-spacing:-0.02em;line-height:1.6;max-width:800px;margin:0 auto;padding:40px 40px 80px}
h1{font-weight:600;font-size:18px;margin-bottom:0;letter-spacing:-0.03em}
h2{font-weight:600;font-size:14.5px;margin:24px 0 10px;color:#555;letter-spacing:-0.02em}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e5e5;padding-bottom:20px;margin-bottom:24px}
.header-left{display:flex;align-items:center;gap:12px;flex:1}
.header-left img{height:38px}
.header-left-text p{font-size:11px;color:#888;margin:0;line-height:1.3;font-weight:300;letter-spacing:-0.03em}
.header-right{flex:1;text-align:right;font-size:11px;color:#888;line-height:1.6;font-weight:300;letter-spacing:-0.03em}
.badge{display:inline-block;padding:4px 14px;border-radius:6px;font-size:11px;font-weight:600;letter-spacing:-0.01em;color:#c45a00;background:#fff3e0;border:1.5px solid #f59e0b}
.worker-info{background:#f9f9f9;border-radius:10px;padding:16px 20px;margin:14px 0;font-size:12.5px;font-weight:300;letter-spacing:-0.03em}
.worker-info table{width:100%;border-collapse:collapse}
.worker-info td{padding:4px 0;vertical-align:top}
.worker-info td:first-child{font-weight:300;color:#888;width:160px}
.worker-info strong{font-weight:600}
.worker-id-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0;page-break-inside:avoid}
.worker-id-card{background:#f9f9f9;border-radius:10px;padding:14px 18px;font-size:12.5px;font-weight:300;letter-spacing:-0.03em;display:flex;flex-direction:column;gap:10px}
.worker-id-card .field{display:flex;flex-direction:column;gap:2px;line-height:1.45}
.worker-id-card .label{font-size:11px;color:#888;font-weight:300;letter-spacing:0.02em}
.worker-id-card .value{font-size:12.5px;color:#1a1a1a;font-weight:300}
.worker-id-card .value strong{font-weight:600}
.section{margin:14px 0;font-size:12.5px;font-weight:300;letter-spacing:-0.02em;line-height:1.6}
.section p{margin-bottom:8px}
.hechos{background:#f9f9f9;border-left:3px solid #888;border-radius:0 8px 8px 0;padding:14px 18px;margin:10px 0;font-size:12.5px;font-weight:300;letter-spacing:-0.02em;line-height:1.6;white-space:pre-wrap}
.advertencia{background:#fff3e0;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px;margin:10px 0;font-size:12.5px;font-weight:300;letter-spacing:-0.03em}
.plazo{background:#fef3cd;border:1.5px solid #f59e0b;border-radius:10px;padding:16px 20px;margin:18px 0;font-size:12.5px;font-weight:300;letter-spacing:-0.03em;text-align:center}
.plazo strong{font-weight:600;color:#c45a00;font-size:15px}
.firma-section{display:flex;gap:40px;margin-top:48px;page-break-inside:avoid}
.firma-box{flex:1;text-align:center;padding-top:16px;border-top:1px solid #ccc}
.firma-box p{font-size:11px;color:#888;margin-top:4px;font-weight:300;letter-spacing:-0.03em}
.footer{margin-top:50px;padding-top:12px;border-top:1px solid #e5e5e5;font-size:10px;color:#aaa;display:flex;justify-content:space-between;font-weight:300;letter-spacing:-0.03em}
@media print{body{padding:30px 30px 60px;max-width:100%}}
</style></head><body>
<div class="header">
<div class="header-left">
<img src="${LEGAL_DOCUMENT_LOGO_URL}" alt="Verdnatura">
<div class="header-left-text"><h1>Verdnatura Levante S.L.</h1><p>Pliego de cargos · Apertura de expediente disciplinario</p></div>
</div>
<div class="header-right">B97367486 - Carrer Fenollar, 2, 46680, Algemesí (Valencia)<br>${fechaEmision}</div>
</div>

<div style="margin-bottom:18px">
<span class="badge">PLIEGO DE CARGOS — AUDIENCIA PREVIA</span>
<span style="font-size:11px;color:#888;margin-left:12px">${expediente}</span>
</div>

<h2>Identificación del trabajador/a</h2>
<div class="worker-id-grid">
  <div class="worker-id-card">
    <div class="field"><span class="label">Nombre completo</span><span class="value"><strong>${workersList}</strong></span></div>
    <div class="field"><span class="label">DNI/NIE</span><span class="value">${pcFiscalList || '—'}</span></div>
  </div>
  <div class="worker-id-card">
    <div class="field"><span class="label">Nº ficha</span><span class="value">${pcWorkerNumbersList || '—'}</span></div>
    <div class="field"><span class="label">Departamento</span><span class="value">${pcDept?.name || '—'}</span></div>
  </div>
</div>
<div class="worker-id-extra" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;background:transparent;padding:0;margin:0 0 16px">
  <div style="background:#f9f9f9;border-radius:10px;padding:12px 18px;display:flex;flex-direction:column;gap:2px">
    <span style="font-size:12.5px;color:#888;letter-spacing:0.02em">Categoría incidencia</span>
    <span style="font-size:13px;color:#1a1a1a">${pcRec.incidencias_categories?.name || '—'}</span>
  </div>
  <div style="background:#fff3e0;border-radius:10px;padding:12px 18px;display:flex;flex-direction:column;gap:2px;border:1px solid #f59e0b">
    <span style="font-size:12.5px;color:#c45a00;letter-spacing:0.02em">Calificación provisional</span>
    <span style="font-size:13px;color:#c45a00;font-weight:600">Falta muy grave</span>
  </div>
</div>

<h2>Objeto del pliego de cargos</h2>
<div class="section"><p>Mediante el presente pliego de cargos, Verdnatura Levante S.L. comunica al trabajador/a la <strong>apertura de expediente disciplinario</strong> por hechos que, de resultar acreditados, podrían constituir una falta muy grave conforme al Convenio Colectivo de aplicación. Antes de adoptar la resolución sancionadora definitiva, se concede al trabajador/a el preceptivo trámite de <strong>audiencia previa</strong>, en garantía de su derecho de defensa.</p></div>

<h2>Hechos imputados</h2>
<div class="hechos">${hechos}</div>

<h2>Calificación jurídica provisional</h2>
<div class="section"><p>${fundamentacion || 'Los hechos descritos podrían constituir una falta muy grave tipificada en el Convenio Colectivo.'}</p>
<p style="margin-top:8px"><strong>Artículos invocados:</strong><br>${articulosHtml}</p>
</div>

${citaAdvertencia ? `<h2>Advertencia previa documentada</h2><div class="advertencia">${citaAdvertencia}</div>` : ''}

<h2>Trámite de audiencia previa</h2>
<div class="plazo">
Se concede al trabajador/a un plazo de <strong>5 días hábiles</strong> a contar desde la notificación del presente pliego, para formular por escrito las <strong>alegaciones</strong> que estime oportunas en defensa de sus intereses y aportar los medios de prueba que considere pertinentes.<br><br>
Fecha límite de presentación: <strong>${fechaLimiteStr}</strong>
</div>

<div class="section"><p>Transcurrido dicho plazo, con o sin alegaciones del trabajador/a, la empresa adoptará la resolución sancionadora definitiva que en derecho proceda, la cual le será notificada por escrito conforme al procedimiento legalmente establecido.</p>
<p>El presente trámite se efectúa en garantía del derecho de defensa (art. 24 CE) y conforme a la doctrina jurisprudencial aplicable al procedimiento disciplinario laboral.</p></div>

<div class="firma-section">
<div class="firma-box"><p><strong>Verdnatura Levante S.L.</strong></p><img src="${LEGAL_DOCUMENT_SIGNATURE_URL}" alt="Firma y sello" style="max-width:250px;margin:10px auto;display:block;object-fit:contain"></div>
<div class="firma-box"><p>Recibí — ${workersList}</p></div>
</div>

<div class="footer"><span>${expediente}</span><span>Fecha emisión: ${fechaEmision}</span></div>
</body></html>`;

        // Persistir HTML en la propuesta (no creamos un legal_document oficial:
        // el pliego es un trámite previo, no la sanción)
        await supabase
          .from('incidencias_propuestas_rrhh')
          .update({
            pliego_cargos_html: htmlPliego,
            pliego_cargos_generado_at: new Date().toISOString(),
          })
          .eq('id', pcPropId);

        await writeIncidenciasLog('generar_pliego_cargos', pcRec.id, pcPropId, `Pliego de cargos generado por ${manager.name} para ${workersList}`, null);

        return okResponse({ html: htmlPliego, fecha_limite: fechaLimiteStr, expediente });
      }

      // =============================================
      // MARK AUDIENCIA PREVIA AS COMPLETED
      // =============================================
      case 'markAudienciaPreviaCompleted': {
        if (!isAdmin) return errorResponse('Admin only');
        const { propuestaId: apPropId, notas } = body;
        if (!apPropId) return errorResponse('propuestaId required');

        const { data: apProp } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('id, requiere_audiencia_previa, audiencia_previa_completada_at, record_id')
          .eq('id', apPropId)
          .single();
        if (!apProp) return errorResponse('Propuesta not found');
        if (!(apProp as any).requiere_audiencia_previa) {
          return errorResponse('Esta propuesta no requiere audiencia previa');
        }

        const { error: updErr } = await supabase
          .from('incidencias_propuestas_rrhh')
          .update({
            audiencia_previa_completada_at: new Date().toISOString(),
            audiencia_previa_notas: notas || null,
          })
          .eq('id', apPropId);
        if (updErr) return errorResponse(updErr.message);

        await writeIncidenciasLog('audiencia_previa_completada', (apProp as any).record_id, apPropId, `Audiencia previa marcada como completada por ${manager.name}${notas ? ` — ${notas}` : ''}`, null);

        return okResponse({ success: true });
      }

      // =============================================
      // LIST MANAGER NSPP HISTORY
      // =============================================
      case 'listManagerNSPP': {
        let nsppQuery = supabase
          .from('incidencias_propuestas_rrhh')
          .select('id, nspp_worker_name, nspp_worker_number, nspp_justificacion, estado, created_at, nspp_days_remaining, nspp_start_contract_date, department_id, nspp_encargado_name')
          .eq('tipo', 'nspp')
          .order('created_at', { ascending: false })
          .limit(100);

        if (!isAdmin) {
          const deptIds = await getManagerIncidenciasDepartments();
          if (deptIds.length === 0) return okResponse({ propuestas: [] });
          nsppQuery = nsppQuery.in('department_id', deptIds);
        }

        const { data: nsppHistory } = await nsppQuery;
        return okResponse({ propuestas: nsppHistory || [] });
      }

      case 'getLegalDocuments': {
        const { propuestaId: getLegalPropId } = body;
        if (!getLegalPropId) return errorResponse('propuestaId required');

        const { data: getProp } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('target_worker_id')
          .eq('id', getLegalPropId)
          .maybeSingle();

        let legalDocsQuery = supabase
          .from('incidencias_legal_documents')
          .select('*')
          .eq('propuesta_id', getLegalPropId)
          .order('created_at', { ascending: false });
        if ((getProp as any)?.target_worker_id) {
          legalDocsQuery = legalDocsQuery.eq('worker_id', (getProp as any).target_worker_id);
        }
        const { data: legalDocs } = await legalDocsQuery;

        return okResponse({ documents: legalDocs || [] });
      }

      case 'updateLegalDocumentFontDelta': {
        // Persists the live preview font-size tweak so it survives reloads
        // AND is applied when the document is later opened from firma_tasks.
        // Optionally also stores it as the global default for new documents.
        if (!isAdmin) return errorResponse('Admin only');
        const {
          documentId: fdDocId,
          font_delta: rawDelta,
          set_as_default: setAsDefault,
        } = body;
        if (!fdDocId) return errorResponse('documentId required');
        const numericDelta = Number(rawDelta);
        if (!Number.isFinite(numericDelta)) return errorResponse('font_delta must be a number');
        // Clamp to the same range the UI exposes (-3 .. +4, step 0.5)
        const clamped = Math.max(-3, Math.min(4, Math.round(numericDelta * 2) / 2));

        const { error: fdErr } = await supabase
          .from('incidencias_legal_documents')
          .update({ font_delta: clamped })
          .eq('id', fdDocId);
        if (fdErr) return errorResponse('Error saving font_delta');

        if (setAsDefault) {
          // Upsert the single ai_config row so future generations inherit this size.
          const { data: cfgRow } = await supabase
            .from('incidencias_ai_config')
            .select('id')
            .limit(1)
            .maybeSingle();
          if (cfgRow?.id) {
            await supabase.from('incidencias_ai_config').update({ default_font_delta: clamped }).eq('id', cfgRow.id);
          } else {
            await supabase.from('incidencias_ai_config').insert({ default_font_delta: clamped });
          }
        }

        return okResponse({ updated: true, font_delta: clamped });
      }

      case 'updateLegalDocument': {
        if (!isAdmin) return errorResponse('Admin only');
        const { documentId: updateDocId, html_content: newHtmlContent, change_description: changeDesc, tipo_final: udTipo, gravedad_final: udGravedad, dias_suspension_final: udDias } = body;
        if (!updateDocId || !newHtmlContent) return errorResponse('documentId and html_content required');

        // Get current document
        const { data: currentDoc } = await supabase.from('incidencias_legal_documents').select('*').eq('id', updateDocId).single();
        if (!currentDoc) return errorResponse('Document not found');

        // Block edits if document is signed
        if (currentDoc.firmado_at || currentDoc.signed_photo_urls || currentDoc.negado_firmar) {
          return errorResponse('Documento firmado: no se puede editar', 403);
        }

        // Sanitize HTML to remove scripts and event handlers (defense-in-depth on top of client DOMPurify)
        const sanitizedHtml = String(newHtmlContent)
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
          .replace(/<object\b[\s\S]*?<\/object>/gi, '')
          .replace(/<embed\b[^>]*>/gi, '')
          .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
          .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
          .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
          .replace(/javascript\s*:/gi, '');

        // Get max version number
        const { data: existingVersions } = await supabase
          .from('incidencias_legal_document_versions')
          .select('version_number')
          .eq('document_id', updateDocId)
          .order('version_number', { ascending: false })
          .limit(1);
        const nextVersion = (existingVersions?.[0]?.version_number || 0) + 1;

        // Save current version to history
        await supabase.from('incidencias_legal_document_versions').insert({
          document_id: updateDocId,
          html_content: currentDoc.html_content,
          version_number: nextVersion,
          change_description: changeDesc || 'Versión anterior',
          created_by: manager.name,
        });

        // Determine final tipo/gravedad: prefer what AI explicitly returned;
        // otherwise keep what's already in the document. Then enforce HTML
        // consistency so badges and stray phrases match the final state.
        const finalTipo = (udTipo || currentDoc.tipo || 'amonestacion') as string;
        const finalGravedad = (udGravedad || currentDoc.gravedad_final || 'leve') as string;
        const finalSuspensionDias = udDias ?? currentDoc.dias_suspension ?? null;
        const finalSinSuspensionExplicita = finalTipo === 'sancion' && Number(finalSuspensionDias ?? 0) === 0;
        const consistentHtml = enforceLegalDocumentHtmlConsistency(sanitizedHtml, { tipo: finalTipo, gravedad: finalGravedad, suspensionDias: finalSuspensionDias, sinSuspensionExplicita: finalSinSuspensionExplicita });
        const docUpdates: Record<string, unknown> = { html_content: consistentHtml };

        if (udTipo || udGravedad || udDias !== undefined) {
          const normalized = normalizeLegalData({
            tipo: udTipo || currentDoc.tipo,
            gravedad: udGravedad || currentDoc.gravedad_final,
            suspension_dias: udDias ?? currentDoc.dias_suspension,
            sin_suspension_explicita: (udTipo || currentDoc.tipo) === 'sancion' && Number(udDias ?? currentDoc.dias_suspension ?? 0) === 0,
            fecha_inicio: currentDoc.fecha_inicio_suspension,
          });

          docUpdates.tipo = normalized.tipo;
          docUpdates.gravedad_final = normalized.gravedad;
          docUpdates.dias_suspension = normalized.suspension_dias;
          docUpdates.suspension = !!(normalized.suspension_dias);
          docUpdates.sancion_aplicada = normalized.tipo === 'amonestacion' ? 'amonestacion_escrita' : (normalized.suspension_dias ? 'suspension' : 'amonestacion_escrita');

          // Also sync to propuesta
          if (currentDoc.propuesta_id) {
            const propSync: Record<string, unknown> = {
              tipo: normalized.tipo,
              gravedad: normalized.gravedad,
              suspension_dias: normalized.suspension_dias,
            };
            if (normalized.suspension_fechas) {
              propSync.suspension_fechas = normalized.suspension_fechas;
            }
            await supabase.from('incidencias_propuestas_rrhh').update(propSync).eq('id', currentDoc.propuesta_id);
            console.log('[updateLegalDocument] Synced propuesta with normalized data:', propSync);
          }
        }

        // Update document
        const { error: updateErr } = await supabase
          .from('incidencias_legal_documents')
          .update(docUpdates)
          .eq('id', updateDocId);

        if (updateErr) return errorResponse('Error updating document');

        await writeIncidenciasLog('editar_documento_legal', currentDoc.propuesta_id, updateDocId, `Documento legal editado por ${manager.name}: ${changeDesc || 'Sin descripción'}`, null);

        return okResponse({ updated: true, version: nextVersion });
      }

      case 'getLegalDocumentVersions': {
        const { documentId: versDocId } = body;
        if (!versDocId) return errorResponse('documentId required');

        const { data: versions } = await supabase
          .from('incidencias_legal_document_versions')
          .select('*')
          .eq('document_id', versDocId)
          .order('version_number', { ascending: false });

        return okResponse({ versions: versions || [] });
      }

      case 'restoreLegalDocumentVersion': {
        if (!isAdmin) return errorResponse('Admin only');
        const { documentId: restoreDocId, versionId } = body;
        if (!restoreDocId || !versionId) return errorResponse('documentId and versionId required');

        const { data: version } = await supabase.from('incidencias_legal_document_versions').select('*').eq('id', versionId).single();
        if (!version) return errorResponse('Version not found');

        // Save current as new version before restoring
        const { data: curDoc } = await supabase.from('incidencias_legal_documents').select('html_content').eq('id', restoreDocId).single();
        if (curDoc) {
          const { data: maxV } = await supabase.from('incidencias_legal_document_versions').select('version_number').eq('document_id', restoreDocId).order('version_number', { ascending: false }).limit(1);
          await supabase.from('incidencias_legal_document_versions').insert({
            document_id: restoreDocId,
            html_content: curDoc.html_content,
            version_number: (maxV?.[0]?.version_number || 0) + 1,
            change_description: 'Guardado antes de restaurar versión anterior',
            created_by: manager.name,
          });
        }

        await supabase.from('incidencias_legal_documents').update({ html_content: version.html_content }).eq('id', restoreDocId);

        return okResponse({ restored: true });
      }

      case 'signLegalDocument': {
        const { documentId, signatureBase64, noConforme, negadoFirmar, testigo1, testigo2 } = body;
        if (!documentId) return errorResponse('documentId required');
        if (!negadoFirmar && !signatureBase64) return errorResponse('signatureBase64 required');

        const { data: doc } = await supabase.from('incidencias_legal_documents').select('*').eq('id', documentId).single();
        if (!doc) return errorResponse('Document not found');
        if (doc.firmado) return errorResponse('Document already signed');
        if (doc.anulado) return errorResponse('Document has been annulled');

        let sigStoredUrl: string | null = null;

        if (!negadoFirmar && signatureBase64) {
          // Upload worker signature image
          const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, '');
          const sigBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          const sigPath = `firmas/${documentId}-${Date.now()}.png`;
          const { error: uploadErr } = await supabase.storage.from('incidencias-pruebas').upload(sigPath, sigBytes, { contentType: 'image/png' });
          if (uploadErr) return errorResponse('Failed to upload signature');
          const { data: sigUrl } = await supabase.storage.from('incidencias-pruebas').createSignedUrl(sigPath, 60 * 60 * 24 * 365);
          sigStoredUrl = sigUrl?.signedUrl || sigPath;
        }

        // Upload witness signatures if present
        const witnessData: Record<string, unknown> = {};
        if (negadoFirmar && testigo1 && testigo2) {
          for (const [key, t] of Object.entries({ testigo1, testigo2 }) as [string, any][]) {
            let firmaUrl: string | null = null;
            if (t.firma) {
              const b64 = t.firma.replace(/^data:image\/\w+;base64,/, '');
              const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
              const path = `firmas/${documentId}-${key}-${Date.now()}.png`;
              await supabase.storage.from('incidencias-pruebas').upload(path, bytes, { contentType: 'image/png' });
              const { data: url } = await supabase.storage.from('incidencias-pruebas').createSignedUrl(path, 60 * 60 * 24 * 365);
              firmaUrl = url?.signedUrl || path;
            }
            witnessData[key] = { nombre: t.nombre, dni: t.dni, firma_url: firmaUrl };
          }
        }

        const now = new Date().toISOString();
        const updatePayload: Record<string, unknown> = {
          firmado: true,
          firmado_at: now,
          firmado_ip: clientIp,
        };
        if (sigStoredUrl) updatePayload.firma_trabajador_url = sigStoredUrl;

        // Store metadata (noConforme, negadoFirmar, witnesses) in articulos_citados as JSON since it's already a Json field
        // We'll use a dedicated approach: store in html_content metadata or a separate update
        // Best approach: update the document with metadata
        const existingMeta = (doc.articulos_citados as Record<string, unknown>) || {};
        updatePayload.articulos_citados = {
          ...existingMeta,
          firma_metadata: {
            no_conforme: !!noConforme,
            negado_firmar: !!negadoFirmar,
            ...(Object.keys(witnessData).length > 0 ? { testigos: witnessData } : {}),
          },
        };

        // Parallelize document update, firma task update, and audit log
        await Promise.all([
          supabase.from('incidencias_legal_documents').update(updatePayload).eq('id', documentId),
          supabase.from('incidencias_firma_tasks').update({
            status: negadoFirmar ? 'negado_firmar' : 'firmado',
            firma_url: sigStoredUrl,
            firma_ip: clientIp,
            completed_at: now,
          }).eq('legal_document_id', documentId),
        ]);

        const logDetail = negadoFirmar
          ? `Trabajador ${doc.worker_name} se niega a firmar. Testigos: ${(testigo1 as any)?.nombre || '?'}, ${(testigo2 as any)?.nombre || '?'}. IP: ${clientIp}`
          : `Documento firmado por ${doc.worker_name}${noConforme ? ' (No conforme)' : ''}, IP: ${clientIp}`;
        writeIncidenciasLog('firmar_documento_legal', null, doc.propuesta_id, logDetail, null);

        // Fire-and-forget: Insert suspension days in background (don't block response)
        if (doc.suspension === true && doc.dias_suspension > 0 && doc.fecha_inicio_suspension) {
          (async () => {
            try {
              // Parallel lookup: try worker_number and worker_id simultaneously
              const lookups = [];
              if (doc.worker_number) {
                lookups.push(supabase.from('workers').select('id, department_id').eq('worker_number', doc.worker_number).maybeSingle());
              }
              if (doc.worker_id) {
                lookups.push(supabase.from('workers').select('id, department_id').eq('id', doc.worker_id).maybeSingle());
              }
              const results = await Promise.all(lookups);
              const workerRow = results.find(r => r.data)?.data;

              if (workerRow) {
                // Source of truth: the explicit suspension_fechas chosen in
                // the calendar by the admin (may be non-consecutive). Fall
                // back to consecutive days from fecha_inicio only if no
                // explicit fechas were stored.
                let suspensionDates: string[] = [];
                if (doc.propuesta_id) {
                  const { data: propRow } = await supabase
                    .from('incidencias_propuestas_rrhh')
                    .select('suspension_fechas')
                    .eq('id', doc.propuesta_id)
                    .maybeSingle();
                  const fechas = (propRow as any)?.suspension_fechas;
                  if (Array.isArray(fechas) && fechas.length > 0) {
                    suspensionDates = fechas
                      .map((d: unknown) => typeof d === 'string' ? d.split('T')[0] : null)
                      .filter((d): d is string => !!d);
                  }
                }
                if (suspensionDates.length === 0) {
                  const startSusp = new Date(doc.fecha_inicio_suspension);
                  for (let i = 0; i < doc.dias_suspension; i++) {
                    const d = new Date(startSusp);
                    d.setDate(d.getDate() + i);
                    suspensionDates.push(d.toISOString().split('T')[0]);
                  }
                }

                // Delete-before-insert for idempotency
                await supabase
                  .from('worker_personal_calendar_days')
                  .delete()
                  .eq('worker_id', workerRow.id)
                  .eq('day_type', 'suspension')
                  .in('date', suspensionDates);

                const rows = suspensionDates.map(dateStr => ({
                  worker_id: workerRow.id,
                  department_id: workerRow.department_id,
                  date: dateStr,
                  day_type: 'suspension',
                  year: new Date(dateStr).getFullYear(),
                  half_day: false,
                }));

                await supabase.from('worker_personal_calendar_days').insert(rows);
                console.log(`[signLegalDocument] Inserted ${rows.length} suspension days for worker ${doc.worker_name} (dates: ${suspensionDates.join(', ')})`);
              }
            } catch (suspErr) {
              console.error('[signLegalDocument] Error inserting suspension days:', suspErr);
            }
          })();
        }

        // Sync incidencias_records.firmada so the historial filter (Pendientes/Firmadas)
        // reflects the actual signed state of the legal document.
        try {
          if (doc.propuesta_id) {
            const { data: signProp } = await supabase
              .from('incidencias_propuestas_rrhh')
              .select('record_id')
              .eq('id', doc.propuesta_id)
              .maybeSingle();
            if ((signProp as any)?.record_id) {
              await supabase
                .from('incidencias_records')
                .update({ firmada: true })
                .eq('id', (signProp as any).record_id);
            }
          }
        } catch (syncErr) {
          console.warn('[signLegalDocument] failed to sync record.firmada:', syncErr);
        }

        return okResponse({ signed: true });
      }

      case 'uploadSignedPdf': {
        const { documentId: pdfDocId, pdfBase64: pdfData } = body;
        if (!pdfDocId || !pdfData) return errorResponse('documentId and pdfBase64 required');

        const pdfBytes = Uint8Array.from(atob(pdfData), c => c.charCodeAt(0));
        const pdfPath = `documentos-firmados/${pdfDocId}-${Date.now()}.pdf`;
        const { error: pdfUploadErr } = await supabase.storage.from('incidencias-pruebas').upload(pdfPath, pdfBytes, { contentType: 'application/pdf' });
        if (pdfUploadErr) {
          console.error('PDF upload error:', pdfUploadErr);
          return errorResponse('Failed to upload PDF');
        }

        const { data: pdfSignedUrl } = await supabase.storage.from('incidencias-pruebas').createSignedUrl(pdfPath, 60 * 60 * 24 * 365);
        
        await supabase.from('incidencias_legal_documents').update({
          pdf_url: pdfSignedUrl?.signedUrl || pdfPath,
        }).eq('id', pdfDocId);

        return okResponse({ uploaded: true, pdf_url: pdfSignedUrl?.signedUrl || pdfPath });
      }

      case 'uploadDraftPdf': {
        // Sube el PDF del documento legal SIN firmar (borrador aprobado).
        // Se usa para adjuntarlo al email de aviso de suspensión.
        const { propuestaId: draftPropId, documentId: draftDocumentId, pdfBase64: draftPdfData } = body;
        if (!draftPropId || !draftPdfData) return errorResponse('propuestaId and pdfBase64 required');

        const { data: draftProp } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('target_worker_id')
          .eq('id', draftPropId)
          .maybeSingle();

        // Localizar exactamente el documento de esta propuesta/trabajador.
        let draftDocsQuery = supabase
          .from('incidencias_legal_documents')
          .select('id, worker_id')
          .eq('propuesta_id', draftPropId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (draftDocumentId) draftDocsQuery = draftDocsQuery.eq('id', draftDocumentId);
        if ((draftProp as any)?.target_worker_id) draftDocsQuery = draftDocsQuery.eq('worker_id', (draftProp as any).target_worker_id);
        const { data: draftDocs } = await draftDocsQuery;

        if (!draftDocs || draftDocs.length === 0) {
          return errorResponse('No legal document found for this propuesta');
        }
        const draftDocId = (draftDocs[0] as any).id;

        const draftBytes = Uint8Array.from(atob(draftPdfData), c => c.charCodeAt(0));
        const draftPath = `documentos-borrador/${draftDocId}-${Date.now()}.pdf`;
        const { error: draftUploadErr } = await supabase.storage
          .from('incidencias-pruebas')
          .upload(draftPath, draftBytes, { contentType: 'application/pdf', upsert: true });
        if (draftUploadErr) {
          console.error('Draft PDF upload error:', draftUploadErr);
          return errorResponse('Failed to upload draft PDF');
        }

        const { data: draftSignedUrl } = await supabase.storage
          .from('incidencias-pruebas')
          .createSignedUrl(draftPath, 60 * 60 * 24 * 365);

        await supabase.from('incidencias_legal_documents').update({
          draft_pdf_url: draftSignedUrl?.signedUrl || draftPath,
        }).eq('id', draftDocId);

        return okResponse({ uploaded: true, draft_pdf_url: draftSignedUrl?.signedUrl || draftPath });
      }

      case 'rejectSignature': {
        const { documentId: rejectDocId } = body;
        if (!rejectDocId) return errorResponse('documentId required');

        const { data: rejectDoc } = await supabase.from('incidencias_legal_documents').select('*').eq('id', rejectDocId).single();
        if (!rejectDoc) return errorResponse('Document not found');

        await supabase.from('incidencias_firma_tasks').update({
          status: 'rechazado',
          firma_ip: clientIp,
          completed_at: new Date().toISOString(),
        }).eq('legal_document_id', rejectDocId);

        await writeIncidenciasLog('rechazar_firma_documento', null, rejectDoc.propuesta_id, `Firma rechazada por ${rejectDoc.worker_name}, IP: ${clientIp}`, null);

        return okResponse({ rejected: true });
      }

      case 'annulLegalDocument': {
        if (!isAdmin) return errorResponse('Admin only');
        const { documentId: annulDocId, motivo: annulMotivo } = body;
        if (!annulDocId) return errorResponse('documentId required');
        if (!annulMotivo?.trim()) return errorResponse('Motivo obligatorio para anular');

        // Fetch doc BEFORE updating so we can remove suspension days
        const { data: annulDocBefore } = await supabase.from('incidencias_legal_documents')
          .select('worker_number, worker_id, suspension, dias_suspension, fecha_inicio_suspension, propuesta_id, worker_name')
          .eq('id', annulDocId).single();

        await supabase.from('incidencias_legal_documents').update({
          anulado: true,
          anulado_motivo: annulMotivo.trim(),
          anulado_por: manager.name,
          anulado_at: new Date().toISOString(),
        }).eq('id', annulDocId);

        await writeIncidenciasLog('anular_documento_legal', null, annulDocBefore?.propuesta_id || null, `Documento anulado por ${manager.name}. Motivo: ${annulMotivo}. Trabajador: ${annulDocBefore?.worker_name}`, null);

        // --- Remove suspension days from worker_personal_calendar_days ---
        if (annulDocBefore?.suspension && annulDocBefore?.dias_suspension > 0 && annulDocBefore?.fecha_inicio_suspension) {
          try {
            let annulWorkerId: string | null = null;
            if (annulDocBefore.worker_number) {
              const { data: w } = await supabase.from('workers').select('id').eq('worker_number', annulDocBefore.worker_number).maybeSingle();
              annulWorkerId = w?.id || null;
            }
            if (!annulWorkerId && annulDocBefore.worker_id) {
              annulWorkerId = annulDocBefore.worker_id;
            }
            if (annulWorkerId) {
              // Use explicit suspension_fechas from the proposal as source
              // of truth (admin may have selected non-consecutive days).
              let suspensionDates: string[] = [];
              if (annulDocBefore.propuesta_id) {
                const { data: propRow } = await supabase
                  .from('incidencias_propuestas_rrhh')
                  .select('suspension_fechas')
                  .eq('id', annulDocBefore.propuesta_id)
                  .maybeSingle();
                const fechas = (propRow as any)?.suspension_fechas;
                if (Array.isArray(fechas) && fechas.length > 0) {
                  suspensionDates = fechas
                    .map((d: unknown) => typeof d === 'string' ? d.split('T')[0] : null)
                    .filter((d): d is string => !!d);
                }
              }
              if (suspensionDates.length === 0) {
                const startSusp = new Date(annulDocBefore.fecha_inicio_suspension);
                for (let i = 0; i < annulDocBefore.dias_suspension; i++) {
                  const d = new Date(startSusp);
                  d.setDate(d.getDate() + i);
                  suspensionDates.push(d.toISOString().split('T')[0]);
                }
              }
              await supabase
                .from('worker_personal_calendar_days')
                .delete()
                .eq('worker_id', annulWorkerId)
                .eq('day_type', 'suspension')
                .in('date', suspensionDates);
              console.log(`[annulLegalDocument] Removed suspension days for worker ${annulDocBefore.worker_name} (dates: ${suspensionDates.join(', ')})`);
            }
          } catch (e) {
            console.error('[annulLegalDocument] Error removing suspension days:', e);
          }
        }

        return okResponse({ annulled: true });
      }

      case 'sendLegalDocumentCopy': {
        if (!isAdmin) return errorResponse('Admin only');
        const { documentId: emailDocId, email: recipientEmail } = body;
        if (!emailDocId) return errorResponse('documentId required');
        if (!recipientEmail?.trim()) return errorResponse('email required');

        const { data: emailDoc } = await supabase.from('incidencias_legal_documents').select('*').eq('id', emailDocId).single();
        if (!emailDoc) return errorResponse('Document not found');

        const BREVO_KEY_CHECK = Deno.env.get('BREVO_API_KEY');
        if (!BREVO_KEY_CHECK) return errorResponse('Email service not configured');

        // Fetch department name
        const { data: emailDept } = await supabase.from('incidencias_departments').select('name').eq('id', emailDoc.department_id).single();

        const fechaEmisionEmail = new Date(emailDoc.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
        const tipoLabelEmail = emailDoc.tipo === 'amonestacion' ? 'Amonestación' : 'Sanción';
        const gravedadLabelEmail = emailDoc.gravedad_final === 'muy_grave' ? 'Muy grave' : emailDoc.gravedad_final === 'grave' ? 'Grave' : 'Leve';
        const gravedadColorEmail = emailDoc.gravedad_final === 'muy_grave' ? '#dc2626' : emailDoc.gravedad_final === 'grave' ? '#f59e0b' : '#93d600';
        const adminFirstNameEmail = manager.name.split(' ')[0];
        const logoUrlEmail = 'https://vnprod.app/images/logo-white.png';
        const logoGreenUrlEmail = 'https://vnprod.app/images/verdnatura-logo-green.png';
        const workerFirstName = emailDoc.worker_name.split(' ')[0];
        const salixUrlEmail = emailDoc.worker_number ? `https://salix.verdnatura.es/#/worker/${emailDoc.worker_number}/time-control` : '';
        const workerBadgeEmail = salixUrlEmail
          ? `<a href="${salixUrlEmail}" target="_blank" style="display:inline-block;background:#93d600;color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;text-decoration:none;">${emailDoc.worker_name}${emailDoc.worker_number ? ` (${emailDoc.worker_number})` : ''} ↗</a>`
          : `<span style="display:inline-block;background:#93d600;color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;">${emailDoc.worker_name}</span>`;

        const corporateEmailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Poppins','Segoe UI',Arial,sans-serif;letter-spacing:-0.01em;">
<div style="max-width:620px;margin:0 auto;padding:20px;">
  <!-- Header with corporate green background -->
  <div style="background:#93d600;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <img src="${logoUrlEmail}" alt="Verdnatura" width="56" height="56" style="width:56px;height:56px;margin-bottom:12px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;font-family:'Poppins','Segoe UI',sans-serif;">Control de Incidencias</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">Entrega de copia de documento disciplinario</p>
  </div>

  <!-- Body -->
  <div style="background:#ffffff;padding:28px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;border-radius:0 0 16px 16px;">
    <!-- Worker badge -->
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#93d600;text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Trabajador/a</p>
      ${workerBadgeEmail}
    </div>

    <!-- Email content -->
    <div style="line-height:1.75;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.01em;">
      <p style="margin:0 0 16px;">Estimado/a ${workerFirstName},</p>
      <p style="margin:0 0 16px;">Le hacemos entrega de la copia del documento disciplinario de tipo <strong>${tipoLabelEmail.toLowerCase()}</strong> emitido con fecha ${fechaEmisionEmail}.</p>
      <p style="margin:0 0 16px;">Encontrará el documento completo firmado como archivo adjunto en formato PDF.</p>
      <p style="margin:0;">Este email se envía como constancia de la entrega de la copia al trabajador/a, conforme al Art. 49.4 del Convenio Colectivo.</p>
    </div>

    ${emailDoc.firmado ? `<div style="margin-top:20px;padding:12px 16px;background:#f0f9e8;border-radius:10px;border:1px solid #93d60030;">
      <p style="margin:0;font-size:12px;color:#475569;font-family:'Poppins','Segoe UI',sans-serif;">Documento firmado digitalmente el ${emailDoc.firmado_at ? new Date(emailDoc.firmado_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '—'}</p>
    </div>` : ''}

    <div style="margin-top:28px;line-height:1.4;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">
      <p style="margin:0 0 16px;">Muchas gracias y un saludo,</p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-right:16px;vertical-align:middle;">
            <img src="${logoGreenUrlEmail}" alt="Verdnatura" width="40" height="40" style="width:40px;height:40px;display:block;">
          </td>
          <td style="padding-right:16px;border-right:2px solid #93d600;vertical-align:middle;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#1a1a1a;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.02em;line-height:1.3;">Álvaro Mas</p>
            <p style="margin:1px 0 0;font-size:12px;font-weight:400;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.3;">VerdNatura Levante S.L.</p>
          </td>
          <td style="padding-left:16px;vertical-align:middle;">
            <p style="margin:0 0 2px;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">+34 661 95 84 33</p>
            <p style="margin:0;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">Carrer Fenollar, 2, 46680 Algemesí</p>
          </td>
        </tr>
      </table>
    </div>

    <!-- Metadata badges -->
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:4px 4px;">
        <tr>
          <td style="padding:3px 4px 3px 0;"><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${fechaEmisionEmail}</span></td>
          <td style="padding:3px 4px;"><span style="display:inline-block;background:${gravedadColorEmail}18;color:${gravedadColorEmail};padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${gravedadLabelEmail}</span></td>
          <td style="padding:3px 4px;"><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${tipoLabelEmail}</span></td>
          ${emailDept ? `<td style="padding:3px 4px 3px 0;"><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${emailDept.name}</span></td>` : ''}
        </tr>
      </table>
    </div>
  </div>

  <!-- Footer -->
  <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:20px;font-family:'Poppins','Segoe UI',sans-serif;">
    Verdnatura Levante S.L. — Control de Incidencias<br>
    Este correo es una comunicación oficial de carácter disciplinario.
  </p>
</div>
</body></html>`;

        // Build email payload
        const emailPayload: any = {
          from: 'Incidencias <incidencias@vnprod.app>',
          to: [recipientEmail.trim()],
          subject: `Entrega copia documento disciplinario — ${emailDoc.worker_name}`,
          html: corporateEmailHtml,
        };

        // If PDF is available, download from storage and attach it
        if (emailDoc.pdf_url) {
          try {
            // Extract storage path from pdf_url (could be a signed URL or a raw path)
            let storagePath = emailDoc.pdf_url;
            const pathMatch = emailDoc.pdf_url.match(/\/object\/sign\/incidencias-pruebas\/(.+?)(\?|$)/);
            if (pathMatch) {
              storagePath = decodeURIComponent(pathMatch[1]);
            } else if (emailDoc.pdf_url.startsWith('documentos-firmados/')) {
              storagePath = emailDoc.pdf_url;
            }
            console.log('Downloading PDF from storage path:', storagePath);
            
            const { data: pdfStorageData, error: pdfDlErr } = await supabase.storage
              .from('incidencias-pruebas')
              .download(storagePath);
            
            if (pdfDlErr || !pdfStorageData) {
              console.error('PDF storage download error:', pdfDlErr?.message);
              // Fallback: try fetching the URL directly (in case it's still valid)
              const pdfRes = await fetch(emailDoc.pdf_url);
              if (pdfRes.ok) {
                const pdfBuf = await pdfRes.arrayBuffer();
                const bytes = new Uint8Array(pdfBuf);
                let binary = '';
                const chunkSize = 8192;
                for (let i = 0; i < bytes.length; i += chunkSize) {
                  binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
                }
                emailPayload.attachments = [{
                  filename: `documento-disciplinario-${emailDoc.worker_name.replace(/\s+/g, '-')}.pdf`,
                  content: btoa(binary),
                }];
              } else {
                console.error('PDF URL fetch also failed:', pdfRes.status);
              }
            } else {
              const pdfBuf = await pdfStorageData.arrayBuffer();
              const bytes = new Uint8Array(pdfBuf);
              let binary = '';
              const chunkSize = 8192;
              for (let i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
              }
              const pdfB64 = btoa(binary);
              console.log('PDF converted to base64, size:', pdfB64.length);
              emailPayload.attachments = [{
                filename: `documento-disciplinario-${emailDoc.worker_name.replace(/\s+/g, '-')}.pdf`,
                content: pdfB64,
              }];
            }
          } catch (e) {
            console.error('Failed to download/convert PDF for attachment:', e?.message || e);
          }
        } else {
          console.warn('No pdf_url found for document', emailDocId);
        }

        const emailRes = await sendEmailBrevo(emailPayload);

        if (emailRes.ok) {
          await supabase.from('incidencias_legal_documents').update({
            email_enviado: true,
            email_enviado_at: new Date().toISOString(),
            email_destinatario: recipientEmail.trim(),
          }).eq('id', emailDocId);

          await writeIncidenciasLog('enviar_copia_documento', null, emailDoc.propuesta_id, `Copia enviada a ${recipientEmail} por ${manager.name}`, null);
          return okResponse({ sent: true });
        } else {
          const errText = await emailRes.text();
          return errorResponse('Failed to send email: ' + errText);
        }
      }

      case 'listSanctionsCalendar': {
        const filterDeptIds: string[] | undefined = body.departmentIds;

        let query = supabase
          .from('incidencias_legal_documents')
          .select('id, worker_name, worker_number, gravedad_final, dias_suspension, fecha_inicio_suspension, tipo, descripcion_hechos, sancion_aplicada, firmado, created_at, html_content, department_id')
          .eq('suspension', true)
          .eq('anulado', false)
          .not('fecha_inicio_suspension', 'is', null)
          .not('dias_suspension', 'is', null)
          .order('fecha_inicio_suspension', { ascending: true });

        if (filterDeptIds && filterDeptIds.length > 0) {
          query = query.in('department_id', filterDeptIds);
        }

        const { data: sanctionDocs } = await query;

        // Enrich with department name
        const deptIds = [...new Set((sanctionDocs || []).map((s: any) => s.department_id).filter(Boolean))];
        let deptMap: Record<string, string> = {};
        if (deptIds.length > 0) {
          const { data: depts } = await supabase.from('incidencias_departments').select('id, name').in('id', deptIds);
          deptMap = Object.fromEntries((depts || []).map((d: any) => [d.id, d.name]));
        }

        const enriched = (sanctionDocs || []).map((s: any) => ({
          ...s,
          department_name: deptMap[s.department_id] || '',
        }));

        return okResponse({ sanctions: enriched });
      }

      case 'downloadSignedPdfs': {
        const { documentIds } = body;
        if (!Array.isArray(documentIds) || documentIds.length === 0) return errorResponse('documentIds required');

        const results: { documentId: string; workerName: string; url: string }[] = [];
        for (const docId of documentIds) {
          const { data: doc } = await supabase
            .from('incidencias_legal_documents')
            .select('id, pdf_url, worker_name')
            .eq('id', docId)
            .single();
          if (!doc || !doc.pdf_url) continue;

          // Extract storage path from pdf_url (could be a signed URL or a raw path)
          let storagePath = doc.pdf_url;
          // If it's a signed URL, extract the path portion
          const pathMatch = doc.pdf_url.match(/\/object\/sign\/incidencias-pruebas\/(.+?)(\?|$)/);
          if (pathMatch) {
            storagePath = decodeURIComponent(pathMatch[1]);
          }

          // Generate fresh signed URL (1 hour)
          const { data: signedData } = await supabase.storage
            .from('incidencias-pruebas')
            .createSignedUrl(storagePath, 60 * 60);

          if (signedData?.signedUrl) {
            results.push({ documentId: doc.id, workerName: doc.worker_name, url: signedData.signedUrl });
          }
        }

        return okResponse({ downloads: results });
      }

      // =============================================
      // DEPARTMENT RULES
      // =============================================
      case 'listAllDepartmentRules': {
        if (!isAdmin) return errorResponse('Admin only');
        // Fetch all incidencias departments (merged ERP + silo)
        const [erpDRes, siloDRes] = await Promise.all([
          supabase.from('departments').select('id, name').order('name'),
          supabase.from('incidencias_departments').select('id, name').eq('active', true).order('name'),
        ]);
        const erpDepts = (erpDRes.data || []).map(d => ({ id: d.id, name: d.name }));
        const siloDepts = (siloDRes.data || []).map(d => ({ id: d.id, name: d.name }));
        const seenIds = new Set(erpDepts.map(d => d.id));
        const uniqueSilo = siloDepts.filter(d => !seenIds.has(d.id));
        const allDepts = [...erpDepts, ...uniqueSilo].sort((a, b) => a.name.localeCompare(b.name));

        // Fetch existing rules
        const { data: rulesData } = await supabase.from('incidencias_reglas_departamento').select('*');
        return okResponse({ departments: allDepts, rules: rulesData || [] });
      }

      case 'saveDepartmentRules': {
        if (!isAdmin) return errorResponse('Admin only');
        const { departmentId: ruleDeptId, rules: ruleData } = body;
        if (!ruleDeptId || !ruleData) return errorResponse('departmentId and rules required');
        // Strip department_id from ruleData to avoid conflicts
        const { department_id: _stripDeptId, ...cleanRuleData } = ruleData;
        // Upsert by department_id
        const { data: existing } = await supabase.from('incidencias_reglas_departamento').select('id').eq('department_id', ruleDeptId).maybeSingle();
        if (existing) {
          const { error } = await supabase.from('incidencias_reglas_departamento').update({ ...cleanRuleData, updated_at: new Date().toISOString() }).eq('department_id', ruleDeptId);
          if (error) return errorResponse(error.message);
        } else {
          const { error } = await supabase.from('incidencias_reglas_departamento').insert({ department_id: ruleDeptId, ...cleanRuleData });
          if (error) return errorResponse(error.message);
        }
        return okResponse({ saved: true });
      }

      // =============================================
      // GLOBAL RULES
      // =============================================
      case 'getGlobalRules': {
        if (!isAdmin) return errorResponse('Admin only');
        const { data: globalRule } = await supabase.from('incidencias_reglas_globales').select('*').limit(1).maybeSingle();
        return okResponse({ rule: globalRule || null });
      }

      case 'saveGlobalRules': {
        if (!isAdmin) return errorResponse('Admin only');
        const { rules: globalRuleData } = body;
        if (!globalRuleData) return errorResponse('rules required');
        const { id: _id, created_at: _ca, ...cleanGlobal } = globalRuleData;
        // Check if row exists
        const { data: existingGlobal } = await supabase.from('incidencias_reglas_globales').select('id').limit(1).maybeSingle();
        if (existingGlobal) {
          const { error } = await supabase.from('incidencias_reglas_globales').update({ ...cleanGlobal, updated_at: new Date().toISOString() }).eq('id', existingGlobal.id);
          if (error) return errorResponse(error.message);
        } else {
          const { error } = await supabase.from('incidencias_reglas_globales').insert(cleanGlobal);
          if (error) return errorResponse(error.message);
        }
        writeIncidenciasLog('save_global_rules', null, null, 'Reglas globales actualizadas');
        return okResponse({ saved: true });
      }

      // =============================================
      // VALIDATE CSV WORKERS (pre-import check)
      // =============================================
      case 'validateCSVWorkers': {
        if (!isAdmin) return errorResponse('Admin only');
        const { workerNumbers } = body;
        if (!Array.isArray(workerNumbers)) return errorResponse('workerNumbers required');

        const unique = [...new Set(workerNumbers.filter(Boolean).map(String))];
        const [siloRes, erpRes] = await Promise.all([
          supabase.from('incidencias_workers').select('id, nombre, apellidos, worker_number, department_id').in('worker_number', unique),
          supabase.from('workers').select('id, name, worker_number, department_id').in('worker_number', unique),
        ]);
        const siloWorkers = siloRes.data || [];
        const erpWorkers = erpRes.data || [];

        const result: Record<string, { found: boolean; name: string; worker_id: string | null }> = {};
        for (const wn of unique) {
          const silo = siloWorkers.find(w => w.worker_number === wn);
          const erp = erpWorkers.find(w => w.worker_number === wn);
          if (silo) {
            result[wn] = { found: true, name: [silo.nombre, silo.apellidos].filter(Boolean).join(' '), worker_id: silo.id };
          } else if (erp) {
            result[wn] = { found: true, name: erp.name || wn, worker_id: erp.id };
          } else {
            result[wn] = { found: false, name: '', worker_id: null };
          }
        }
        return okResponse({ workers: result });
      }

      // =============================================
      // CSV IMPORT
      // =============================================
      case 'importCSV': {
        if (!isAdmin) return errorResponse('Admin only');
        const { rows: csvRows } = body;
        if (!Array.isArray(csvRows) || csvRows.length === 0) return errorResponse('No rows to import');

        // Load all workers and departments for mapping
        const [workersRes, deptsRes, catsRes, tagsRes] = await Promise.all([
          supabase.from('incidencias_workers').select('id, nombre, apellidos, worker_number, department_id'),
          supabase.from('incidencias_departments').select('id, name'),
          supabase.from('incidencias_categories').select('id, name, department_id, csv_aliases, importe_rangos, gravedad, puntos'),
          supabase.from('incidencias_category_tags').select('category_id, field_name, field_value'),
        ]);
        const allWorkers = workersRes.data || [];
        const allDepts = deptsRes.data || [];
        const allCats = catsRes.data || [];
        const allTags = tagsRes.data || [];

        // Build tag lookup: category_id -> tags[]
        const tagsByCat: Record<string, any[]> = {};
        for (const t of allTags) {
          if (!tagsByCat[t.category_id]) tagsByCat[t.category_id] = [];
          tagsByCat[t.category_id].push(t);
        }

        // Also load ERP departments+workers as fallback
        const [erpDeptsRes, erpWorkersRes] = await Promise.all([
          supabase.from('departments').select('id, name'),
          supabase.from('workers').select('id, name, worker_number, department_id'),
        ]);
        const erpDepts = erpDeptsRes.data || [];
        const erpWorkers = erpWorkersRes.data || [];

        const normalize = (s: string) => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        let created = 0;
        let errors = 0;
        let skipped = 0;
        const details: string[] = [];

        for (let i = 0; i < csvRows.length; i++) {
          const row = csvRows[i];
          try {
            // Map department
            let deptId: string | null = null;
            if (row.department_name) {
              const normDept = normalize(row.department_name);
              const siloMatch = allDepts.find(d => normalize(d.name) === normDept);
              const erpMatch = erpDepts.find(d => normalize(d.name) === normDept);
              deptId = siloMatch?.id || erpMatch?.id || null;
            }

            // Map worker
            let workerId: string | null = null;
            let workerName = row.worker_name || '';
            let workerNumber = row.worker_number || '';
            
            if (workerName || workerNumber) {
              const normName = normalize(workerName);
              const match = allWorkers.find(w => 
                (workerNumber && w.worker_number === workerNumber) ||
                (normName && normalize([w.nombre, w.apellidos].filter(Boolean).join(' ')) === normName)
              );
              if (!match) {
                const erpMatch = erpWorkers.find(w =>
                  (workerNumber && w.worker_number === workerNumber) ||
                  (normName && normalize(w.name || '') === normName)
                );
                if (erpMatch) {
                  workerId = erpMatch.id;
                  workerName = workerName || erpMatch.name || '';
                  workerNumber = workerNumber || erpMatch.worker_number || '';
                  if (!deptId && erpMatch.department_id) deptId = erpMatch.department_id;
                }
              } else {
                workerId = match.id;
                workerName = workerName || [match.nombre, match.apellidos].filter(Boolean).join(' ');
                workerNumber = workerNumber || match.worker_number || '';
                if (!deptId && match.department_id) deptId = match.department_id;
              }
            }

            const isWorkerPending = row.worker_pending === true;

            if (!deptId) {
              if (isWorkerPending) {
                // For pending workers without department, create/use a fallback department
                const fallbackName = 'Pendiente de asignación';
                const { data: fallbackDept } = await supabase
                  .from('incidencias_departments')
                  .select('id')
                  .eq('name', fallbackName)
                  .single();
                if (fallbackDept) {
                  deptId = fallbackDept.id;
                } else {
                  const { data: newDept } = await supabase
                    .from('incidencias_departments')
                    .insert({ name: fallbackName, active: true })
                    .select('id')
                    .single();
                  deptId = newDept?.id || null;
                }
              }
              if (!deptId) {
                details.push(`Fila ${i + 1}: departamento no encontrado (${row.department_name || 'vacío'})`);
                skipped++;
                continue;
              }
            }

            const syncedDepartment = await ensureIncidenciasDepartmentExists(deptId);
            if (!syncedDepartment) {
              details.push(`Fila ${i + 1}: departamento no sincronizado (${row.department_name || deptId})`);
              errors++;
              continue;
            }

            if (!workerName && !workerNumber) {
              details.push(`Fila ${i + 1}: sin nombre ni número de trabajador`);
              skipped++;
              continue;
            }

            // Build description from motivo+consecuencia+devolucion if empty (Salix CSV)
            let description = row.description || '';
            if (!description && (row.motivo || row.consecuencia || row.devolucion)) {
              const parts = [row.motivo, row.consecuencia].filter(Boolean).join(': ');
              description = row.devolucion ? `${parts} [Dev: ${row.devolucion}]` : parts;
            }
            if (!description) description = 'Importado desde CSV';

            // Map category — first try csv_aliases match, then name match
            let categoryId: string | null = null;
            let effectiveGravedad: string | null = null;
            if (row.category_name) {
              const normCat = normalize(row.category_name);
              // 1. Try matching by csv_aliases
              const aliasMatch = allCats.find(c => 
                c.csv_aliases && Array.isArray(c.csv_aliases) && 
                c.csv_aliases.some((a: string) => normalize(a) === normCat) &&
                (!c.department_id || c.department_id === deptId)
              );
              if (aliasMatch) {
                categoryId = aliasMatch.id;
                // Apply importe_rangos if present
                if (aliasMatch.importe_rangos && Array.isArray(aliasMatch.importe_rangos)) {
                  const rawImp = String(row.importe || '').replace(',', '.').replace(/[^\d.]/g, '');
                  const impNum = parseFloat(rawImp);
                  if (!isNaN(impNum)) {
                    for (const rango of aliasMatch.importe_rangos) {
                      const min = rango.min ?? 0;
                      const max = rango.max ?? Infinity;
                      if (impNum >= min && impNum < max) {
                        effectiveGravedad = rango.gravedad;
                        break;
                      }
                    }
                  }
                }
              } else {
                // 2. Fallback: match by name
                const catMatch = allCats.find(c => normalize(c.name) === normCat && (!c.department_id || c.department_id === deptId));
                if (catMatch) {
                  categoryId = catMatch.id;
                  // Also apply importe_rangos for name-matched categories
                  if (catMatch.importe_rangos && Array.isArray(catMatch.importe_rangos)) {
                    const rawImp = String(row.importe || '').replace(',', '.').replace(/[^\d.]/g, '');
                    const impNum = parseFloat(rawImp);
                    if (!isNaN(impNum)) {
                      for (const rango of catMatch.importe_rangos) {
                        const min = rango.min ?? 0;
                        const max = rango.max ?? Infinity;
                        if (impNum >= min && impNum < max) {
                          effectiveGravedad = rango.gravedad;
                          break;
                        }
                      }
                    }
                  }
                }
              }
            }

            // Match csv_tag_value from category tags (e.g. Devolución field)
            let csvTagValue: string | null = null;
            if (categoryId && row.devolucion) {
              const catTags = tagsByCat[categoryId] || [];
              const devTags = catTags.filter((t: any) => normalize(t.field_name) === normalize('Devolución'));
              if (devTags.length > 0) {
                const matchingTag = devTags.find((t: any) => normalize(t.field_value) === normalize(row.devolucion));
                if (matchingTag) {
                  csvTagValue = matchingTag.field_value;
                }
              }
            }

            const accionPropuestaCsv = row.tipo?.toLowerCase()?.includes('amon') ? 'amonestacion_escrita'
              : row.tipo?.toLowerCase()?.includes('sanc') ? 'sancion'
              : 'solo_incidencia';

            // Parse date
            let fecha = new Date().toISOString().split('T')[0];
            if (row.date) {
              const parsed = new Date(row.date);
              if (!isNaN(parsed.getTime())) {
                fecha = parsed.toISOString().split('T')[0];
              }
            }

            // Create incidencias_record
            const { data: record, error: recErr } = await supabase
              .from('incidencias_records')
              .insert({
                department_id: syncedDepartment.id,
                category_id: categoryId,
                descripcion: description,
                fecha,
                estado: isWorkerPending ? 'archivada' : (accionPropuestaCsv === 'solo_incidencia' ? 'archivada' : 'abierta'),
                created_by_id: manager.id,
                created_by_name: manager.name,
                accion_propuesta: accionPropuestaCsv,
                origen: 'csv_import',
                csv_metadata: { ...row, effective_gravedad: effectiveGravedad || undefined },
                worker_pending: isWorkerPending,
                ...(effectiveGravedad ? { gravedad_override: effectiveGravedad } : {}),
                ...(csvTagValue ? { csv_tag_value: csvTagValue } : {}),
              })
              .select('id')
              .single();

            if (recErr || !record) {
              details.push(`Fila ${i + 1}: error al crear registro - ${recErr?.message || 'unknown'}`);
              errors++;
              continue;
            }

            // Link worker
            const workerIdFinal = workerId || crypto.randomUUID();
            await supabase.from('incidencias_record_workers').insert({
              record_id: record.id,
              worker_id: workerIdFinal,
              worker_name: workerName,
              worker_number: workerNumber,
            });

            // Create loss entry if importe is present
            const rawImporte = String(row.importe || '').replace(',', '.').replace(/[^\d.]/g, '');
            const importeNum = parseFloat(rawImporte);
            if (!isNaN(importeNum) && importeNum > 0) {
              await supabase.from('incidencias_losses').insert({
                record_id: record.id,
                worker_id: workerId || null,
                importe: importeNum,
                motivo: row.motivo || null,
                consecuencia: row.consecuencia || null,
                ticket_id: row.ticket_id || null,
                claim_id: row.claim_id || null,
                origen: 'csv_import',
                fecha,
              });
              // Update importe_total on the record
              await supabase.from('incidencias_records').update({ importe_total: importeNum }).eq('id', record.id);
            }

            created++;
          } catch (e) {
            details.push(`Fila ${i + 1}: error inesperado - ${String(e)}`);
            errors++;
          }
        }

        writeIncidenciasLog('csv_import', null, null, `Importación CSV: ${created} creados, ${errors} errores, ${skipped} omitidos`);
        return okResponse({ created, errors, skipped, details });
      }

      // =============================================
      // SIMULATE CSV IMPORT (dry-run)
      // =============================================
      case 'simulateCSVImport': {
        if (!isAdmin) return errorResponse('Admin only');
        const { rows: simRows } = body;
        if (!Array.isArray(simRows) || simRows.length === 0) return errorResponse('No rows to simulate');

        // Load all workers, departments, categories, tags
        const [simWorkersRes, simDeptsRes, simCatsRes, simTagsRes] = await Promise.all([
          supabase.from('incidencias_workers').select('id, nombre, apellidos, worker_number, department_id'),
          supabase.from('incidencias_departments').select('id, name'),
          supabase.from('incidencias_categories').select('id, name, department_id, csv_aliases, importe_rangos, gravedad, puntos, es_critico, consecuencia_critico'),
          supabase.from('incidencias_category_tags').select('category_id, field_name, field_value'),
        ]);
        const simAllWorkers = simWorkersRes.data || [];
        const simAllDepts = simDeptsRes.data || [];
        const simAllCats = simCatsRes.data || [];

        // ERP fallback
        const [simErpDeptsRes, simErpWorkersRes] = await Promise.all([
          supabase.from('departments').select('id, name'),
          supabase.from('workers').select('id, name, worker_number, department_id'),
        ]);
        const simErpDepts = simErpDeptsRes.data || [];
        const simErpWorkers = simErpWorkersRes.data || [];

        const simNormalize = (s: string) => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // Build tag lookup
        const simTagsByCat: Record<string, any[]> = {};
        for (const t of (simTagsRes.data || [])) {
          if (!simTagsByCat[t.category_id]) simTagsByCat[t.category_id] = [];
          simTagsByCat[t.category_id].push(t);
        }

        // Phase 1: Resolve each row → worker/dept/category
        interface SimResolvedRow {
          index: number;
          workerId: string | null;
          workerName: string;
          workerNumber: string;
          deptId: string | null;
          categoryId: string | null;
          categoryName: string;
          gravedad: string;
          puntos: number;
          esCritico: boolean;
          consecuenciaCritico: string;
          description: string;
          date: string;
          importe: number;
          error: string | null;
          original: any;
        }

        const resolvedRows: SimResolvedRow[] = [];

        for (let i = 0; i < simRows.length; i++) {
          const row = simRows[i];
          let deptId: string | null = null;
          if (row.department_name) {
            const nd = simNormalize(row.department_name);
            deptId = simAllDepts.find(d => simNormalize(d.name) === nd)?.id
              || simErpDepts.find(d => simNormalize(d.name) === nd)?.id || null;
          }

          let workerId: string | null = null;
          let workerName = row.worker_name || '';
          let workerNumber = row.worker_number || '';

          if (workerName || workerNumber) {
            const nn = simNormalize(workerName);
            const match = simAllWorkers.find(w =>
              (workerNumber && w.worker_number === workerNumber) ||
              (nn && simNormalize([w.nombre, w.apellidos].filter(Boolean).join(' ')) === nn)
            );
            if (match) {
              workerId = match.id;
              workerName = workerName || [match.nombre, match.apellidos].filter(Boolean).join(' ');
              workerNumber = workerNumber || match.worker_number || '';
              if (!deptId && match.department_id) deptId = match.department_id;
            } else {
              const erpM = simErpWorkers.find(w =>
                (workerNumber && w.worker_number === workerNumber) ||
                (nn && simNormalize(w.name || '') === nn)
              );
              if (erpM) {
                workerId = erpM.id;
                workerName = workerName || erpM.name || '';
                workerNumber = workerNumber || erpM.worker_number || '';
                if (!deptId && erpM.department_id) deptId = erpM.department_id;
              }
            }
          }

          if (!workerName && !workerNumber) {
            resolvedRows.push({ index: i, workerId: null, workerName: '', workerNumber: '', deptId: null, categoryId: null, categoryName: '', gravedad: 'leve', puntos: 0, esCritico: false, consecuenciaCritico: 'amonestacion', description: '', date: '', importe: 0, error: 'Sin trabajador', original: row });
            continue;
          }

          // Category resolution (same logic as importCSV)
          let categoryId: string | null = null;
          let effectiveGravedad: string | null = null;
          let catName = row.category_name || '';
          let catPuntos = 1;
          let catEsCritico = false;
          let catConsecuencia = 'amonestacion';

          if (catName) {
            const nc = simNormalize(catName);
            const aliasMatch = simAllCats.find(c =>
              c.csv_aliases && Array.isArray(c.csv_aliases) &&
              c.csv_aliases.some((a: string) => simNormalize(a) === nc) &&
              (!c.department_id || c.department_id === deptId)
            );
            const catMatch = aliasMatch || simAllCats.find(c => simNormalize(c.name) === nc && (!c.department_id || c.department_id === deptId));

            if (catMatch) {
              categoryId = catMatch.id;
              catName = catMatch.name;
              catPuntos = catMatch.puntos ?? 1;
              catEsCritico = catMatch.es_critico === true;
              catConsecuencia = catMatch.consecuencia_critico || 'amonestacion';

              if (catMatch.importe_rangos && Array.isArray(catMatch.importe_rangos)) {
                const rawImp = String(row.importe || '').replace(',', '.').replace(/[^\d.]/g, '');
                const impNum = parseFloat(rawImp);
                if (!isNaN(impNum)) {
                  for (const rango of catMatch.importe_rangos) {
                    if (impNum >= (rango.min ?? 0) && impNum < (rango.max ?? Infinity)) {
                      effectiveGravedad = rango.gravedad;
                      break;
                    }
                  }
                }
              }
            }
          }

          let description = row.description || '';
          if (!description && (row.motivo || row.consecuencia)) {
            description = [row.motivo, row.consecuencia].filter(Boolean).join(': ');
          }

          let fecha = '';
          if (row.date) {
            const parsed = new Date(row.date);
            if (!isNaN(parsed.getTime())) fecha = parsed.toISOString().split('T')[0];
          }

          const rawImp = String(row.importe || '').replace(',', '.').replace(/[^\d.]/g, '');
          const impNum = parseFloat(rawImp);

          resolvedRows.push({
            index: i,
            workerId,
            workerName,
            workerNumber,
            deptId,
            categoryId,
            categoryName: catName,
            gravedad: effectiveGravedad || (categoryId ? (simAllCats.find(c => c.id === categoryId)?.gravedad || 'leve') : 'leve'),
            puntos: catPuntos,
            esCritico: catEsCritico,
            consecuenciaCritico: catConsecuencia,
            description,
            date: fecha,
            importe: !isNaN(impNum) ? impNum : 0,
            error: !workerId ? 'Trabajador no encontrado' : (!deptId ? 'Departamento no encontrado' : null),
            original: row,
          });
        }

        // Phase 2: Group by worker and evaluate points
        const workerGroups: Record<string, SimResolvedRow[]> = {};
        for (const r of resolvedRows) {
          if (!r.workerId) continue;
          if (!workerGroups[r.workerId]) workerGroups[r.workerId] = [];
          workerGroups[r.workerId].push(r);
        }

        // Load rules
        const { data: simGlobalRule } = await supabase
          .from('incidencias_reglas_globales')
          .select('*, escalado_reglas, umbral_leves, umbral_graves, umbral_muy_graves, periodo_dias_evaluacion, sistema_puntos_activo, umbral_amonestacion_puntos, periodo_puntos_dias, puntos_leve, puntos_moderada, puntos_grave, puntos_muy_grave')
          .limit(1).maybeSingle();

        const workerResults: any[] = [];

        for (const [wId, wRows] of Object.entries(workerGroups)) {
          const first = wRows[0];
          const deptId = first.deptId;

          // Load dept rules
          let deptRule: any = null;
          if (deptId) {
            const { data } = await supabase
              .from('incidencias_reglas_departamento')
              .select('*, escalado_reglas, umbral_leves, umbral_graves, umbral_muy_graves, periodo_dias_evaluacion, sistema_puntos_activo, umbral_amonestacion_puntos, periodo_puntos_dias, puntos_leve, puntos_moderada, puntos_grave, puntos_muy_grave')
              .eq('department_id', deptId).maybeSingle();
            deptRule = data;
          }

          const puntosActivo = (deptRule?.sistema_puntos_activo ?? simGlobalRule?.sistema_puntos_activo) !== false;
          const umbralPuntos = deptRule?.umbral_amonestacion_puntos ?? simGlobalRule?.umbral_amonestacion_puntos ?? 80;
          const periodoPuntosDias = deptRule?.periodo_puntos_dias ?? simGlobalRule?.periodo_puntos_dias ?? 365;
          const puntosMap: Record<string, number> = {
            leve: deptRule?.puntos_leve ?? simGlobalRule?.puntos_leve ?? 1,
            moderada: deptRule?.puntos_moderada ?? simGlobalRule?.puntos_moderada ?? 10,
            grave: deptRule?.puntos_grave ?? simGlobalRule?.puntos_grave ?? 25,
            muy_grave: deptRule?.puntos_muy_grave ?? simGlobalRule?.puntos_muy_grave ?? 80,
          };

          // Calculate current points
          let puntosActuales = 0;
          if (puntosActivo) {
            const periodStart = new Date(Date.now() - periodoPuntosDias * 24 * 60 * 60 * 1000).toISOString();
            const { data: workerRecs } = await supabase
              .from('incidencias_records')
              .select('id, incidencias_categories(gravedad, puntos)')
              .gte('fecha', periodStart)
              .is('deleted_at', null);

            if (workerRecs) {
              const recIds = workerRecs.map((r: any) => r.id);
              if (recIds.length > 0) {
                const { data: wLinks } = await supabase
                  .from('incidencias_record_workers')
                  .select('record_id')
                  .eq('worker_id', wId)
                  .in('record_id', recIds);
                const workerRecIds = new Set((wLinks || []).map((l: any) => l.record_id));
                for (const rec of workerRecs) {
                  if (!workerRecIds.has(rec.id)) continue;
                  const cat = rec.incidencias_categories as any;
                  puntosActuales += cat?.puntos ?? puntosMap[cat?.gravedad || 'leve'] ?? 1;
                }
              }
            }
          }

          // Calculate new points from CSV rows
          let puntosNuevos = puntosActuales;
          let hasCritico = false;
          let criticoConsecuencia = 'amonestacion';
          for (const r of wRows) {
            puntosNuevos += r.puntos;
            if (r.esCritico) {
              hasCritico = true;
              criticoConsecuencia = r.consecuenciaCritico;
            }
          }

          let generaPropuesta = false;
          let tipoPropuesta: string | null = null;
          let reglaDescripcion = '';

          if (hasCritico) {
            generaPropuesta = true;
            tipoPropuesta = criticoConsecuencia === 'sancion' ? 'sancion' : 'amonestacion';
            reglaDescripcion = 'Categoría crítica → propuesta directa';
          } else if (puntosActivo && puntosNuevos >= umbralPuntos) {
            generaPropuesta = true;
            tipoPropuesta = 'amonestacion';
            reglaDescripcion = `${puntosNuevos} puntos ≥ umbral ${umbralPuntos}`;
          }

          workerResults.push({
            worker_id: wId,
            worker_name: first.workerName,
            worker_number: first.workerNumber,
            incidencias_count: wRows.length,
            puntos_actuales: puntosActuales,
            puntos_nuevos: puntosNuevos,
            umbral: umbralPuntos,
            genera_propuesta: generaPropuesta,
            tipo_propuesta: tipoPropuesta,
            regla_descripcion: reglaDescripcion,
            importe_total: wRows.reduce((s, r) => s + r.importe, 0),
            rows: wRows.map(r => ({
              index: r.index,
              categoryName: r.categoryName,
              gravedad: r.gravedad,
              puntos: r.puntos,
              description: r.description,
              date: r.date,
              importe: r.importe,
              esCritico: r.esCritico,
            })),
          });
        }

        // Add unresolved rows
        const unresolvedRows = resolvedRows.filter(r => !r.workerId).map(r => ({
          index: r.index,
          workerName: r.workerName,
          workerNumber: r.workerNumber,
          error: r.error,
        }));

        return okResponse({
          workers: workerResults,
          unresolved: unresolvedRows,
          summary: {
            total_workers: workerResults.length,
            total_incidencias: resolvedRows.filter(r => r.workerId).length,
            total_propuestas: workerResults.filter(w => w.genera_propuesta).length,
            total_unresolved: unresolvedRows.length,
          },
        });
      }

      // =============================================
      // GET LOSSES (Reclamaciones panel)
      // =============================================
      case 'getLosses': {
        const { dateFrom: lossDateFrom, dateTo: lossDateTo } = body;
        
        let query = supabase
          .from('incidencias_losses')
          .select('*')
          .order('fecha', { ascending: false })
          .limit(500);
        
        if (lossDateFrom) query = query.gte('fecha', lossDateFrom);
        if (lossDateTo) query = query.lte('fecha', lossDateTo);
        
        const { data: lossRows, error: lossErr } = await query;
        if (lossErr) return errorResponse(lossErr.message);

        // Enrich with worker names from record_workers
        const recordIds = [...new Set((lossRows || []).map((l: any) => l.record_id).filter(Boolean))];
        const workerMap: Record<string, { name: string; number: string }> = {};
        if (recordIds.length > 0) {
          const { data: rwData } = await supabase
            .from('incidencias_record_workers')
            .select('record_id, worker_name, worker_number')
            .in('record_id', recordIds);
          (rwData || []).forEach((rw: any) => {
            if (!workerMap[rw.record_id]) {
              workerMap[rw.record_id] = { name: rw.worker_name, number: rw.worker_number };
            }
          });
        }

        const enriched = (lossRows || []).map((l: any) => ({
          ...l,
          worker_name: workerMap[l.record_id]?.name || '—',
          worker_number: workerMap[l.record_id]?.number || '',
        }));

        return okResponse({ losses: enriched });
      }

      // =============================================
      // CHAT WITH AI ABOUT A PROPOSAL
      // =============================================
      case 'chatProposal': {
        const { propuestaId: chatPropId, messages: chatMessages } = body;
        if (!chatPropId) return errorResponse('propuestaId required');
        if (!Array.isArray(chatMessages) || chatMessages.length === 0) return errorResponse('messages required');

        // Fetch proposal + record + workers for context
        const { data: chatProp } = await supabase.from('incidencias_propuestas_rrhh').select('*').eq('id', chatPropId).single();
        if (!chatProp) return errorResponse('Propuesta not found');

        const isNsppChat = (chatProp as any).tipo === 'nspp';
        let chatRec: any = null;
        let chatWorkers: any[] = [];
        let chatDeptName = '';
        let chatWorkerStats: any[] = [];

        if (isNsppChat) {
          const { data: dept } = await supabase.from('incidencias_departments').select('name').eq('id', chatProp.department_id).single();
          chatDeptName = dept?.name || '';
        } else if (chatProp.record_id) {
          const [recRes, rwRes, deptRes] = await Promise.all([
            supabase.from('incidencias_records').select('*, incidencias_categories(name, gravedad)').eq('id', chatProp.record_id).single(),
            supabase.from('incidencias_record_workers').select('worker_id, worker_name, worker_number').eq('record_id', chatProp.record_id),
            supabase.from('incidencias_departments').select('name').eq('id', chatProp.department_id).single(),
          ]);
          chatRec = recRes.data;
          chatWorkers = rwRes.data || [];
          chatDeptName = deptRes.data?.name || '';

          const workerIds = chatWorkers.map((w: any) => w.worker_id).filter(Boolean);
          if (workerIds.length > 0) {
            const { data: stats } = await supabase.from('incidencias_worker_stats').select('*').in('worker_id', workerIds);
            chatWorkerStats = stats || [];
          }
        }

        const chatWorkerNames = isNsppChat
          ? (chatProp as any).nspp_worker_name || '—'
          : chatWorkers.map((w: any) => w.worker_name).join(', ') || '—';

        const statsStr = chatWorkerStats.map((s: any) => {
          const wName = chatWorkers.find((w: any) => w.worker_id === s.worker_id)?.worker_name || '';
          return `${wName}: Total=${s.total_count}, Leves=${s.leves}, Graves=${s.graves}, MuyGraves=${s.muy_graves}, Reincidencias=${s.reincidencias}, Riesgo=${s.riesgo_score}/100`;
        }).join('; ');

        const aiAnalysis = (chatProp as any).ai_analysis;
        const aiSummary = aiAnalysis?.resumen_ejecutivo || '';

        const propuestaContext = {
          tipo: (chatProp as any).tipo,
          gravedad: chatProp.gravedad,
          departamento: chatDeptName,
          trabajadores: chatWorkerNames,
          descripcion: chatRec?.descripcion || (chatProp as any).nspp_justificacion || '',
          fecha: chatRec ? new Date(chatRec.fecha).toLocaleDateString('es-ES') : '',
          ai_analysis_summary: aiSummary,
          estadisticas: statsStr || null,
        };

        // Load full persisted conversation history and append new messages
        const { data: existingMsgs } = await supabase
          .from('incidencias_chat_messages')
          .select('role, content')
          .eq('propuesta_id', chatPropId)
          .order('created_at', { ascending: true });

        const persistedHistory = (existingMsgs || []).map((m: any) => ({ role: m.role, content: m.content }));

        // Find new messages not yet persisted (sent from client)
        const lastUserMsg = chatMessages[chatMessages.length - 1];
        const fullHistory = [...persistedHistory];
        if (lastUserMsg && lastUserMsg.role === 'user') {
          fullHistory.push(lastUserMsg);
          // Persist the new user message
          await supabase.from('incidencias_chat_messages').insert({
            propuesta_id: chatPropId,
            role: 'user',
            content: lastUserMsg.content,
          });
        }

        // Call AI chat function with full history
        const supabaseUrlChat = Deno.env.get('SUPABASE_URL')!;
        const supabaseKeyChat = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const chatRes = await fetch(`${supabaseUrlChat}/functions/v1/control-incidencias-ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKeyChat}` },
          body: JSON.stringify({
            action: 'chat_propuesta',
            messages: fullHistory,
            propuesta_context: propuestaContext,
          }),
        });

        if (!chatRes.ok) {
          const errText = await chatRes.text();
          console.error('Chat AI error:', errText);
          return errorResponse('Error en chat IA');
        }

        const chatResult = await chatRes.json();
        const aiReply = chatResult.reply || chatResult.respuesta || '';

        // Persist the AI reply
        if (aiReply) {
          await supabase.from('incidencias_chat_messages').insert({
            propuesta_id: chatPropId,
            role: 'assistant',
            content: aiReply,
          });
        }

        return okResponse({ reply: aiReply, cambio_opinion: chatResult.cambio_opinion === true });
      }

      // =============================================
      // LOAD CHAT HISTORY FOR A PROPOSAL
      // =============================================
      case 'loadChatHistory': {
        const { propuestaId: histPropId } = body;
        if (!histPropId) return errorResponse('propuestaId required');

        const { data: histMsgs, error: histErr } = await supabase
          .from('incidencias_chat_messages')
          .select('role, content, created_at')
          .eq('propuesta_id', histPropId)
          .order('created_at', { ascending: true });

        if (histErr) return errorResponse(histErr.message);
        return okResponse({ messages: (histMsgs || []).map((m: any) => ({ role: m.role, content: m.content })) });
      }

      // =============================================
      // ANSWER AI QUESTIONS — admin replies to AI's clarification questions
      // and triggers a re-analysis with the answers as additional instructions.
      // =============================================
      case 'answerAiQuestions': {
        if (manager.role !== 'admin') return errorResponse('Solo admin puede responder preguntas de la IA', 403);
        const { propuestaId: aqPropId, respuestas } = body;
        if (!aqPropId) return errorResponse('propuestaId required');
        if (!Array.isArray(respuestas) || respuestas.length === 0) return errorResponse('respuestas required');

        const { data: aqProp } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('id, preguntas_admin, respuestas_admin, necesita_aclaracion, tipo, gravedad')
          .eq('id', aqPropId)
          .single();
        if (!aqProp) return errorResponse('Propuesta not found', 404);

        const requiredQuestions = Array.isArray((aqProp as any).preguntas_admin)
          ? (aqProp as any).preguntas_admin.filter((q: any) => q && q.opcional !== true)
          : [];

        const now = new Date().toISOString();
        const previousResp = Array.isArray((aqProp as any).respuestas_admin) ? (aqProp as any).respuestas_admin : [];
        const newResp = respuestas
          .filter((r: any) => r && typeof r.pregunta === 'string' && typeof r.respuesta === 'string' && r.respuesta.trim().length > 0)
          .map((r: any) => ({ pregunta: r.pregunta, respuesta: r.respuesta.trim(), respondida_at: now, respondida_por: manager.name }));

        if (newResp.length === 0) return errorResponse('Debes responder al menos una pregunta');

        // Validate required questions are all answered
        if (requiredQuestions.length > 0) {
          const answeredQuestions = new Set(newResp.map((r: any) => r.pregunta));
          const missing = requiredQuestions.filter((q: any) => !answeredQuestions.has(q.pregunta));
          if (missing.length > 0) {
            return errorResponse(`Faltan respuestas a ${missing.length} pregunta(s) requerida(s) por la IA`);
          }
        }

        const allResp = [...previousResp, ...newResp];

        await supabase.from('incidencias_propuestas_rrhh')
          .update({
            respuestas_admin: allResp,
            necesita_aclaracion: false,
            preguntas_admin: null,
          })
          .eq('id', aqPropId);

        const instructionsBlock = `El administrador ha respondido las siguientes preguntas que tú habías formulado. Estas respuestas son DATOS VERIFICADOS que debes incorporar a tu análisis:\n\n` +
          newResp.map((r: any) => `· Pregunta: ${r.pregunta}\n  Respuesta del admin: ${r.respuesta}`).join('\n\n') +
          `\n\nCon estas respuestas ya tienes la información necesaria. NO vuelvas a preguntar lo mismo. Emite la recomendación definitiva.`;

        await writeIncidenciasLog('ai_questions_answered', null, aqPropId, `Admin ${manager.name} respondió ${newResp.length} pregunta(s) de la IA`, {
          respuestas: newResp,
          tipo_previo: (aqProp as any).tipo || null,
          gravedad_previa: (aqProp as any).gravedad || null,
          preguntas_originales: Array.isArray((aqProp as any).preguntas_admin) ? (aqProp as any).preguntas_admin : [],
        });

        const supabaseUrlAQ = Deno.env.get('SUPABASE_URL')!;
        const supabaseKeyAQ = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const reanalyzeRes = await fetch(`${supabaseUrlAQ}/functions/v1/incidencias-operations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKeyAQ}` },
          body: JSON.stringify({
            action: 'analyzeProposal',
            sessionToken: body.sessionToken,
            propuestaId: aqPropId,
            instrucciones_usuario: instructionsBlock,
          }),
        });
        const reanalyzeJson = await reanalyzeRes.json().catch(() => ({}));
        return okResponse({ success: true, reanalyzed: reanalyzeRes.ok, analysis: reanalyzeJson?.analysis || null });
      }

      // =============================================
      // GET PROPUESTA AUDIT TRAIL — devuelve el historial de decisiones admin
      // (preguntas IA respondidas, fusiones, cambios manuales, aprobaciones).
      // Incluye también las entradas de las propuestas origen si fue fusión.
      // =============================================
      case 'getPropuestaAuditTrail': {
        if (manager.role !== 'admin') return errorResponse('Solo admin', 403);
        const { propuestaId: atPropId } = body;
        if (!atPropId) return errorResponse('propuestaId required');

        const { data: atProp } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('id, merge_source_ids, merged_into_id')
          .eq('id', atPropId)
          .single();
        if (!atProp) return errorResponse('Propuesta not found', 404);

        const ids = new Set<string>([atPropId]);
        if (Array.isArray((atProp as any).merge_source_ids)) {
          for (const s of (atProp as any).merge_source_ids) if (typeof s === 'string') ids.add(s);
        }
        if ((atProp as any).merged_into_id) ids.add((atProp as any).merged_into_id);

        const allowedActions = [
          'ai_questions_answered',
          'proposals_merged',
          'proposal_merged_into',
          'reset_propuesta',
          'manual_gravedad_change',
          'manual_tipo_change',
          'approve_propuesta',
          'reject_propuesta',
          'audiencia_previa_completada',
          'pliego_cargos_generado',
        ];

        const { data: logs, error: logsErr } = await supabase
          .from('incidencias_audit_logs')
          .select('id, action_type, actor_id, actor_name, actor_role, details, cambios_json, created_at, propuesta_id')
          .in('propuesta_id', [...ids])
          .in('action_type', allowedActions)
          .order('created_at', { ascending: true });

        if (logsErr) return errorResponse(logsErr.message);
        return okResponse({ logs: logs || [] });
      }

      // =============================================
      // MERGE PROPOSALS — fuse N proposals of the same worker into one consolidated
      // proposal and trigger a unified AI analysis.
      // =============================================
      case 'mergeProposals': {
        if (manager.role !== 'admin') return errorResponse('Solo admin puede fusionar propuestas', 403);
        const { propuestaIds, instrucciones_admin: mergeInstr, tipo_esperado: tipoEsperado } = body;
        if (!Array.isArray(propuestaIds) || propuestaIds.length < 2) return errorResponse('Se requieren al menos 2 propuestas');

        const { data: mergeProps, error: mpErr } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('id, record_id, department_id, tipo, gravedad, estado, created_at')
          .in('id', propuestaIds);
        if (mpErr) return errorResponse(mpErr.message);
        if (!mergeProps || mergeProps.length !== propuestaIds.length) return errorResponse('Alguna propuesta no existe');

        for (const p of mergeProps) {
          if (p.estado !== 'pendiente') return errorResponse(`Solo pueden fusionarse propuestas pendientes`);
          if ((p as any).tipo === 'nspp') return errorResponse('No se pueden fusionar propuestas NSPP');
        }

        // Se permite mezclar tipos (amonestación/sanción) y departamentos.
        // La IA recalificará el conjunto en el merge según la complejidad global.
        const tiposMezcla = Array.from(new Set(mergeProps.map((p: any) => p.tipo)));
        const deptMezcla = Array.from(new Set(mergeProps.map((p: any) => p.department_id).filter(Boolean)));

        const recordIds = mergeProps.map(p => p.record_id).filter(Boolean) as string[];
        if (recordIds.length === 0) return errorResponse('Las propuestas no tienen record asociado');

        const { data: rwAll } = await supabase
          .from('incidencias_record_workers')
          .select('record_id, worker_id, worker_name, worker_number')
          .in('record_id', recordIds);

        const workerSets = new Map<string, Set<string>>();
        for (const rw of rwAll || []) {
          if (!workerSets.has(rw.record_id)) workerSets.set(rw.record_id, new Set());
          workerSets.get(rw.record_id)!.add(rw.worker_id);
        }
        const firstSet = workerSets.get(recordIds[0]);
        if (!firstSet || firstSet.size !== 1) return errorResponse('Solo se pueden fusionar propuestas con un único trabajador por incidencia');
        const targetWorkerId = [...firstSet][0];
        for (const rid of recordIds) {
          const s = workerSets.get(rid);
          if (!s || s.size !== 1 || [...s][0] !== targetWorkerId) {
            return errorResponse('Todas las propuestas deben pertenecer al mismo trabajador');
          }
        }

        const { data: recsFull } = await supabase
          .from('incidencias_records')
          .select('id, fecha, descripcion, pruebas_urls, category_id, department_id')
          .in('id', recordIds)
          .order('fecha', { ascending: true });
        if (!recsFull || recsFull.length === 0) return errorResponse('No se pudieron cargar los records');

        const fmtFecha = (d: string) => {
          try { return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }); }
          catch { return d; }
        };
        const mergedDescripcion = `INCIDENCIAS FUSIONADAS (${recsFull.length} hechos):\n\n` +
          recsFull.map((r: any, i: number) => `${i + 1}. [${fmtFecha(r.fecha)}] ${r.descripcion || '(sin descripción)'}`).join('\n\n') +
          (mergeInstr ? `\n\nCONTEXTO ADICIONAL DEL ADMINISTRADOR:\n${mergeInstr}` : '');

        const allPruebas: string[] = [];
        for (const r of recsFull) {
          if (Array.isArray((r as any).pruebas_urls)) {
            for (const p of (r as any).pruebas_urls) if (typeof p === 'string') allPruebas.push(p);
          }
        }

        const latestFecha = recsFull.reduce((max: string, r: any) => (r.fecha > max ? r.fecha : max), recsFull[0].fecha);
        const firstRec: any = recsFull[0];
        const firstWorker = (rwAll || []).find(rw => rw.record_id === recordIds[0]);

        const { data: newRec, error: newRecErr } = await supabase
          .from('incidencias_records')
          .insert({
            fecha: latestFecha,
            descripcion: mergedDescripcion,
            pruebas_urls: allPruebas,
            category_id: firstRec.category_id || null,
            department_id: firstRec.department_id || mergeProps[0].department_id,
            created_by_id: manager.id,
            created_by_name: manager.name,
          } as any)
          .select('id')
          .single();
        if (newRecErr) {
          console.error('[mergeProposals] Error creating merged record:', newRecErr);
          return errorResponse('Error creando record fusionado: ' + newRecErr.message);
        }

        await supabase.from('incidencias_record_workers').insert({
          record_id: newRec.id,
          worker_id: targetWorkerId,
          worker_name: firstWorker?.worker_name || '',
          worker_number: firstWorker?.worker_number || null,
        });

        const { data: newProp, error: newPropErr } = await supabase
          .from('incidencias_propuestas_rrhh')
          .insert({
            record_id: newRec.id,
            department_id: mergeProps[0].department_id,
            tipo: tipoEsperado === 'amonestacion' ? 'amonestacion' : 'sancion',
            gravedad: tipoEsperado === 'amonestacion' ? null : 'grave',
            estado: 'pendiente',
            created_by_id: manager.id,
            created_by_name: manager.name,
            merge_source_ids: propuestaIds,
            merge_admin_context: mergeInstr || null,
          } as any)
          .select('id')
          .single();
        if (newPropErr) {
          console.error('[mergeProposals] Error creating merged proposal:', newPropErr);
          return errorResponse('Error creando propuesta fusionada: ' + newPropErr.message);
        }

        await supabase
          .from('incidencias_propuestas_rrhh')
          .update({ estado: 'fusionada', merged_into_id: newProp.id } as any)
          .in('id', propuestaIds);

        await writeIncidenciasLog('proposals_merged', null, newProp.id, `Admin ${manager.name} fusionó ${propuestaIds.length} propuestas en una nueva`, {
          source_ids: propuestaIds,
          target_id: newProp.id,
          worker_id: targetWorkerId,
          worker_name: firstWorker?.worker_name || null,
          tipo_esperado: tipoEsperado || 'auto',
          tipo_resultante: tipoEsperado === 'amonestacion' ? 'amonestacion' : 'sancion',
          instrucciones_admin: mergeInstr || null,
          fechas_origen: recsFull.map((r: any) => r.fecha),
        });
        // También loguear en cada propuesta original que fue fusionada
        for (const srcId of propuestaIds) {
          await writeIncidenciasLog('proposal_merged_into', null, srcId, `Fusionada en una nueva propuesta consolidada`, { merged_into_id: newProp.id });
        }

        const mezclaTiposNote = tiposMezcla.length > 1 ? `\n\nIMPORTANTE: Las propuestas originales mezclan tipos distintos (${tiposMezcla.join(', ')}). DEBES recalificar el conjunto desde cero según la gravedad combinada de todos los hechos y el convenio aplicable, sin sentirte limitado por las clasificaciones individuales previas.` : '';
        const mezclaDeptNote = deptMezcla.length > 1 ? `\n\nLas incidencias provienen de varios departamentos del mismo trabajador; valora el patrón transversal.` : '';
        const mergeInstrBlock = `Esta propuesta es una FUSIÓN de ${recsFull.length} incidencias del mismo trabajador. Debes analizar la conducta como un PATRÓN CONJUNTO y emitir UNA ÚNICA recomendación proporcional al conjunto de hechos. Considera todos los hechos como parte de un mismo expediente disciplinario.${mezclaTiposNote}${mezclaDeptNote}${mergeInstr ? `\n\nCONTEXTO DEL ADMINISTRADOR:\n${mergeInstr}` : ''}${tipoEsperado && tipoEsperado !== 'auto' ? `\n\nEl administrador espera una medida de tipo: ${tipoEsperado}. Respeta esa indicación salvo que el convenio exija otra cosa.` : ''}`;

        const supabaseUrlMG = Deno.env.get('SUPABASE_URL')!;
        const supabaseKeyMG = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        EdgeRuntime.waitUntil(
          fetch(`${supabaseUrlMG}/functions/v1/incidencias-operations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKeyMG}` },
            body: JSON.stringify({
              action: 'analyzeProposal',
              sessionToken: body.sessionToken,
              propuestaId: newProp.id,
              instrucciones_usuario: mergeInstrBlock,
            }),
          }).catch((err) => console.error('[mergeProposals] background analyze failed:', err))
        );

        return okResponse({ success: true, mergedPropuestaId: newProp.id, sourceCount: propuestaIds.length });
      }

      case 'createSalidaVoluntaria': {
        const { workerId, workerName, workerNumber, departmentId, departmentName, fecha, hora, firmaBase64 } = body;
        if (!workerId || !workerName || !firmaBase64) return errorResponse('Missing required fields');

        const { error: insertErr } = await supabase.from('salidas_voluntarias').insert({
          worker_id: workerId,
          worker_name: workerName,
          worker_number: workerNumber || null,
          department_id: departmentId || null,
          department_name: departmentName || null,
          manager_id: manager.id,
          manager_name: manager.name,
          fecha: fecha || new Date().toISOString().split('T')[0],
          hora: hora || new Date().toTimeString().split(' ')[0],
          firma_base64: firmaBase64,
        });
        if (insertErr) return errorResponse('Error creating record: ' + insertErr.message);
        return okResponse({ created: true });
      }

      case 'listSalidasVoluntarias': {
        const { departmentId: deptId, search: searchTerm, dateFrom: df, dateTo: dt } = body;
        let query = supabase.from('salidas_voluntarias').select('*').order('created_at', { ascending: false });

        if (!isAdmin) {
          const deptIds = await getAccessibleDeptIds();
          if (deptIds && deptIds.length > 0) {
            query = query.in('department_id', deptIds);
          }
        }

        if (deptId) query = query.eq('department_id', deptId);
        if (df) query = query.gte('fecha', df);
        if (dt) query = query.lte('fecha', dt);

        const { data: salidasData, error: salidasErr } = await query;
        if (salidasErr) return errorResponse('Error fetching: ' + salidasErr.message);

        let results = salidasData || [];
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          results = results.filter((s: any) =>
            s.worker_name?.toLowerCase().includes(term) || s.worker_number?.includes(term)
          );
        }

        return okResponse({ salidas: results });
      }

      case 'deleteSalidaVoluntaria': {
        const { salidaId } = body;
        if (!salidaId) return errorResponse('Missing salidaId');
        const { error: delErr } = await supabase.from('salidas_voluntarias').delete().eq('id', salidaId);
        if (delErr) return errorResponse('Error deleting: ' + delErr.message);
        return okResponse({ deleted: true });
      }

      case 'listNotifications': {
        const notifLimit = body.limit || 30;
        const { data: notifs, error: notifErr } = await supabase
          .from('incidencias_notifications')
          .select('*')
          .eq('user_id', manager.id)
          .order('created_at', { ascending: false })
          .limit(notifLimit);
        if (notifErr) return errorResponse('Error fetching notifications: ' + notifErr.message);
        const unreadCount = (notifs || []).filter((n: any) => !n.read_at).length;
        return okResponse({ notifications: notifs || [], unreadCount });
      }

      case 'markNotificationRead': {
        const { notificationId, markAll } = body;
        if (markAll) {
          const { error: markErr } = await supabase
            .from('incidencias_notifications')
            .update({ read_at: new Date().toISOString() })
            .eq('user_id', manager.id)
            .is('read_at', null);
          if (markErr) return errorResponse('Error marking all read: ' + markErr.message);
          return okResponse({ marked: 'all' });
        }
        if (!notificationId) return errorResponse('Missing notificationId');
        const { error: markOneErr } = await supabase
          .from('incidencias_notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', notificationId)
          .eq('user_id', manager.id);
        if (markOneErr) return errorResponse('Error marking read: ' + markOneErr.message);
        return okResponse({ marked: notificationId });
      }

      // =============================================
      // TASKS: list, complete, update status, upload signed photo
      // =============================================
      case 'listTasks': {
        const statusFilter = body.status;
        const typeFilter = body.type;

        // Fetch firma tasks with document info
        const firmaQuery = supabase
          .from('incidencias_firma_tasks')
          .select('id, legal_document_id, worker_id, worker_name, status, firma_url, created_at, completed_at, printed_at, signed_photo_url, signed_photo_urls, scanned_signed_pdf_url');
        
        const { data: firmaTasks } = await firmaQuery;
        
        // Get legal documents for firma tasks
        const ftDocIds = (firmaTasks || []).map((t: any) => t.legal_document_id).filter(Boolean);
        const ftDocsMap: Record<string, any> = {};
        if (ftDocIds.length > 0) {
          const { data: ftDocs } = await supabase
            .from('incidencias_legal_documents')
            .select('id, propuesta_id, html_content, pdf_url, firmado, anulado, worker_name, email_destinatario, gravedad_final, created_at, tipo, font_delta')
            .in('id', ftDocIds);
          for (const d of (ftDocs || [])) {
            ftDocsMap[d.id] = d;
          }
        }

        // Get propuesta info for department
        const ftPropIds = Object.values(ftDocsMap).map((d: any) => d.propuesta_id).filter(Boolean);
        const ftPropMap: Record<string, any> = {};
        if (ftPropIds.length > 0) {
          const { data: ftProps } = await supabase
            .from('incidencias_propuestas_rrhh')
            .select('id, department_id, tipo, estado, record_id, suspension_dias, fecha_inicio')
            .in('id', ftPropIds);
          for (const p of (ftProps || [])) {
            ftPropMap[p.id] = p;
          }
        }

        // Get worker numbers from record_workers
        const ftRecordIds = [...new Set(Object.values(ftPropMap).map((p: any) => p.record_id).filter(Boolean))];
        const ftWorkerNumberMap: Record<string, string> = {}; // record_id -> worker_number
        if (ftRecordIds.length > 0) {
          const { data: ftRecordWorkers } = await supabase
            .from('incidencias_record_workers')
            .select('record_id, worker_number')
            .in('record_id', ftRecordIds);
          for (const rw of (ftRecordWorkers || [])) {
            if (rw.worker_number) ftWorkerNumberMap[rw.record_id] = rw.worker_number;
          }
        }

        // Get incident date (fecha del hecho) from records — used for prescription countdown
        const ftRecordFechaMap: Record<string, string> = {}; // record_id -> fecha del hecho
        if (ftRecordIds.length > 0) {
          const { data: ftRecords } = await supabase
            .from('incidencias_records')
            .select('id, fecha, created_at')
            .in('id', ftRecordIds);
          for (const r of (ftRecords || [])) {
            ftRecordFechaMap[r.id] = r.fecha || r.created_at;
          }
        }

        // Get department names
        const ftDeptIds = [...new Set(Object.values(ftPropMap).map((p: any) => p.department_id).filter(Boolean))];
        const ftDeptMap: Record<string, string> = {};
        if (ftDeptIds.length > 0) {
          const { data: ftDeptsData } = await supabase
            .from('incidencias_departments')
            .select('id, name')
            .in('id', ftDeptIds);
          for (const d of (ftDeptsData || [])) {
            ftDeptMap[d.id] = d.name;
          }
          const { data: ftErpDepts } = await supabase
            .from('departments')
            .select('id, name')
            .in('id', ftDeptIds);
          for (const d of (ftErpDepts || [])) {
            if (!ftDeptMap[d.id]) ftDeptMap[d.id] = d.name;
          }
        }

        const ftManagerDeptIds = isAdmin ? null : managerDepartmentIds;

        const tasksList: any[] = [];
        for (const ft of (firmaTasks || [])) {
          const doc = ftDocsMap[ft.legal_document_id];
          if (!doc || doc.anulado) continue;
          const prop = doc ? ftPropMap[doc.propuesta_id] : null;
          // Skip tasks whose proposal is not yet approved (pendiente, rechazada, etc.)
          if (!prop || !prop.estado || (prop.estado !== 'aprobada' && prop.estado !== 'enviada')) continue;
          const deptId = prop?.department_id;
          
          if (ftManagerDeptIds && deptId && !ftManagerDeptIds.includes(deptId)) continue;
          
          const deptName = deptId ? (ftDeptMap[deptId] || 'Desconocido') : 'Desconocido';
          // Resolve worker number from record_workers, then html_content fallback
          const recordWorkerNumber = prop?.record_id ? ftWorkerNumberMap[prop.record_id] : null;
          const resolvedWorkerNumber = recordWorkerNumber
            || (typeof doc?.html_content === 'string'
                ? (doc.html_content.match(/data-worker-number="([^"]+)"/i)?.[1]?.trim()
                  || doc.html_content.match(/salix\.verdnatura\.es\/#!?\/worker\/(\d+)/i)?.[1]?.trim()
                  || null)
                : null);
          
          // Parse signed_photo_urls array
          const photoUrls: string[] = Array.isArray(ft.signed_photo_urls) ? ft.signed_photo_urls : [];
          
          // Map firma_tasks status to the 4-phase workflow
          let taskStatus = ft.status;
          // Normalize Spanish status to English
          if (taskStatus === 'pendiente') taskStatus = 'pending';
          if (taskStatus === 'pending' && ft.printed_at) taskStatus = 'printed';
          if (photoUrls.length > 0 && taskStatus !== 'completed') taskStatus = 'awaiting_signature';
          // Legacy: if old signed_photo_url exists but no array entries, also set awaiting_signature
          if (ft.signed_photo_url && photoUrls.length === 0 && taskStatus !== 'completed') taskStatus = 'awaiting_signature';
          
          if (statusFilter && statusFilter !== 'all' && taskStatus !== statusFilter) continue;
          if (typeFilter && typeFilter !== 'all' && typeFilter !== 'firma_documento') continue;

          tasksList.push({
            id: ft.id,
            department_id: deptId,
            department_name: deptName,
            type: 'firma_documento',
            ref_id: doc?.propuesta_id || null,
            title: `Documento: ${ft.worker_name}`,
            description: null,
            status: taskStatus,
            completed_by: null,
            completed_at: ft.completed_at,
            due_at: null,
            created_at: ft.created_at,
            worker_name: ft.worker_name,
            worker_number: resolvedWorkerNumber,
            html_content: doc?.html_content || null,
            email_destinatario: doc?.email_destinatario || null,
            firmado: doc?.firmado || false,
            legal_document_id: ft.legal_document_id,
            pdf_url: doc?.pdf_url || null,
            printed_at: ft.printed_at,
            signed_photo_url: ft.signed_photo_url,
            signed_photo_urls: photoUrls,
            scanned_signed_pdf_url: ft.scanned_signed_pdf_url || null,
            gravedad_final: doc?.gravedad_final || null,
            document_created_at: doc?.created_at || ft.created_at,
            incident_date: prop?.record_id ? (ftRecordFechaMap[prop.record_id] || null) : null,
            documento_tipo: prop?.tipo || doc?.tipo || null,
            font_delta: Number(doc?.font_delta || 0) || 0,
            suspension_dias: prop?.suspension_dias ?? null,
            suspension_fecha_inicio: prop?.fecha_inicio || null,
          });
        }

        tasksList.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const tPending = tasksList.filter((t: any) => t.status === 'pending').length;
        const tPrinted = tasksList.filter((t: any) => t.status === 'printed').length;
        const tAwaiting = tasksList.filter((t: any) => t.status === 'awaiting_signature').length;
        const tCompleted = tasksList.filter((t: any) => t.status === 'completed').length;

        return okResponse({ 
          success: true, 
          tasks: tasksList, 
          stats: { pending: tPending, printed: tPrinted, awaiting_signature: tAwaiting, completed: tCompleted, dismissed: 0 } 
        });
      }

      case 'completeTask': {
        const { taskId: ctTaskId, taskAction: ctAction } = body;
        if (!ctTaskId) return errorResponse('Missing taskId');

        const ctUpdateData: any = {};
        if (ctAction === 'complete') {
          ctUpdateData.status = 'completed';
          ctUpdateData.completed_at = new Date().toISOString();
        } else if (ctAction === 'dismiss') {
          ctUpdateData.status = 'dismissed';
          ctUpdateData.completed_at = new Date().toISOString();
        }

        const { error: ctErr } = await supabase
          .from('incidencias_firma_tasks')
          .update(ctUpdateData)
          .eq('id', ctTaskId);
        
        if (ctErr) return errorResponse('Error updating task: ' + ctErr.message);
        return okResponse({ success: true });
      }

      case 'reopenTask': {
        const { taskId: rtTaskId, targetStatus: rtTarget } = body;
        if (!rtTaskId) return errorResponse('Missing taskId');
        const allowedTargets = ['pending', 'printed', 'awaiting_signature'];
        if (!allowedTargets.includes(rtTarget)) return errorResponse('Invalid target status');

        const rtUpdateData: any = { status: rtTarget, completed_at: null };
        if (rtTarget === 'pending') {
          rtUpdateData.printed_at = null;
        }

        const { error: rtErr } = await supabase
          .from('incidencias_firma_tasks')
          .update(rtUpdateData)
          .eq('id', rtTaskId);

        if (rtErr) return errorResponse('Error reopening task: ' + rtErr.message);

        // Si la tarea vuelve a 'pending' (Imprimido → Pendiente) y la
        // sanción asociada lleva suspensión, reenviar el aviso anticipado a
        // RRHH (limpia el flag de idempotencia y dispara el helper en background).
        if (rtTarget === 'pending') {
          try {
            const { data: rtTask } = await supabase
              .from('incidencias_firma_tasks')
              .select('legal_document_id')
              .eq('id', rtTaskId)
              .single();
            const rtLegalId = (rtTask as any)?.legal_document_id;
            if (rtLegalId) {
              const { data: rtLegal } = await supabase
                .from('incidencias_legal_documents')
                .select('propuesta_id')
                .eq('id', rtLegalId)
                .single();
              const rtPropId = (rtLegal as any)?.propuesta_id;
              if (rtPropId) {
                // Limpiar flag para permitir re-envío e invocar helper.
                await supabase
                  .from('incidencias_propuestas_rrhh')
                  .update({ suspension_aviso_enviado_at: null })
                  .eq('id', rtPropId);
                sendSuspensionAvisoEmail(rtPropId, 'reopenTask').catch(e =>
                  console.error('[reopenTask] sendSuspensionAvisoEmail error:', e)
                );
              }
            }
          } catch (e) {
            console.error('[reopenTask] Error preparando reenvío aviso suspensión:', e);
          }
        }

        return okResponse({ success: true });
      }

      case 'resendSuspensionAviso': {
        if (!isAdmin) return errorResponse('Forbidden');
        const { propuestaId: rsPropId } = body;
        if (!rsPropId || typeof rsPropId !== 'string') return errorResponse('Missing propuestaId');

        // Verificar que la propuesta existe y tiene suspensión.
        const { data: rsProp } = await supabase
          .from('incidencias_propuestas_rrhh')
          .select('id, tipo, suspension_dias')
          .eq('id', rsPropId)
          .maybeSingle();
        if (!rsProp) return errorResponse('Propuesta no encontrada');
        if ((rsProp as any).tipo !== 'sancion' || !(rsProp as any).suspension_dias || Number((rsProp as any).suspension_dias) <= 0) {
          return errorResponse('La propuesta no tiene suspensión de empleo y sueldo');
        }

        // Limpiar flag de idempotencia y disparar el helper.
        await supabase
          .from('incidencias_propuestas_rrhh')
          .update({ suspension_aviso_enviado_at: null })
          .eq('id', rsPropId);

        // Esperamos al envío para devolver feedback real al admin (el helper
        // hace polling al HTML hasta ~24s, lo que cabe dentro del timeout).
        try {
          const resendResult = await sendSuspensionAvisoEmail(rsPropId, 'manualResend');
          if (!resendResult.sent) {
            return errorResponse(resendResult.reason || 'El aviso no se ha podido enviar todavía');
          }
        } catch (e: any) {
          console.error('[resendSuspensionAviso] Error:', e?.message || e);
          return errorResponse('Error enviando aviso: ' + (e?.message || 'desconocido'));
        }

        return okResponse({ success: true });
      }

      case 'markTaskPrinted': {
        const { taskId: mpTaskId } = body;
        if (!mpTaskId) return errorResponse('Missing taskId');
        
        const { error: mpErr } = await supabase
          .from('incidencias_firma_tasks')
          .update({ printed_at: new Date().toISOString() })
          .eq('id', mpTaskId);
        
        if (mpErr) return errorResponse('Error marking as printed: ' + mpErr.message);
        return okResponse({ success: true });
      }

      case 'uploadSignedPhoto': {
        const { taskId: upTaskId, photoBase64, fileName: upFileName } = body;
        if (!upTaskId || !photoBase64) return errorResponse('Missing taskId or photoBase64');
        
        const upBase64Data = photoBase64.includes(',') ? photoBase64.split(',')[1] : photoBase64;
        const upBinaryStr = atob(upBase64Data);
        const upBytes = new Uint8Array(upBinaryStr.length);
        for (let i = 0; i < upBinaryStr.length; i++) {
          upBytes[i] = upBinaryStr.charCodeAt(i);
        }
        
        const upExt = (upFileName || 'photo.jpg').split('.').pop() || 'jpg';
        const upStoragePath = `firmas-fisicas/${upTaskId}_${Date.now()}.${upExt}`;
        
        const { error: upUploadErr } = await supabase.storage
          .from('incidencias-pruebas')
          .upload(upStoragePath, upBytes, { contentType: `image/${upExt}`, upsert: true });
        
        if (upUploadErr) return errorResponse('Error uploading photo: ' + upUploadErr.message);
        
        // Get current photo urls array
        const { data: currentTask } = await supabase
          .from('incidencias_firma_tasks')
          .select('signed_photo_urls, signed_photo_url')
          .eq('id', upTaskId)
          .single();
        
        const existingUrls: string[] = Array.isArray(currentTask?.signed_photo_urls) ? currentTask.signed_photo_urls : [];
        const updatedUrls = [...existingUrls, upStoragePath];
        
        const { error: upUpdateErr } = await supabase
          .from('incidencias_firma_tasks')
          .update({ 
            signed_photo_url: currentTask?.signed_photo_url || upStoragePath, // legacy field: keep first
            signed_photo_urls: updatedUrls,
            status: 'awaiting_signature',
          })
          .eq('id', upTaskId);
        
        if (upUpdateErr) return errorResponse('Error updating task: ' + upUpdateErr.message);
        
        return okResponse({ success: true, storagePath: upStoragePath, totalPhotos: updatedUrls.length });
      }

      case 'uploadScannedSignedPdf': {
        const { taskId: spTaskId, pdfBase64: spPdfBase64, fileName: spFileName } = body;
        if (!spTaskId || !spPdfBase64) return errorResponse('Missing taskId or pdfBase64');

        const spBase64Data = spPdfBase64.includes(',') ? spPdfBase64.split(',')[1] : spPdfBase64;
        const spBinaryStr = atob(spBase64Data);
        const spBytes = new Uint8Array(spBinaryStr.length);
        for (let i = 0; i < spBinaryStr.length; i++) {
          spBytes[i] = spBinaryStr.charCodeAt(i);
        }

        const safeName = (spFileName || 'sancion-firmada.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
        const spStoragePath = `scanned-signed/${spTaskId}/${Date.now()}_${safeName}`;

        // Remove previous scanned PDF if exists (only one per task)
        const { data: existingScanTask } = await supabase
          .from('incidencias_firma_tasks')
          .select('scanned_signed_pdf_url')
          .eq('id', spTaskId)
          .single();
        if (existingScanTask?.scanned_signed_pdf_url) {
          await supabase.storage.from('incidencias-pruebas').remove([existingScanTask.scanned_signed_pdf_url]);
        }

        const { error: spUploadErr } = await supabase.storage
          .from('incidencias-pruebas')
          .upload(spStoragePath, spBytes, { contentType: 'application/pdf', upsert: true });

        if (spUploadErr) return errorResponse('Error uploading scanned PDF: ' + spUploadErr.message);

        const { error: spUpdateErr } = await supabase
          .from('incidencias_firma_tasks')
          .update({ scanned_signed_pdf_url: spStoragePath })
          .eq('id', spTaskId);

        if (spUpdateErr) return errorResponse('Error updating task: ' + spUpdateErr.message);

        return okResponse({ success: true, storagePath: spStoragePath });
      }

      case 'deleteScannedSignedPdf': {
        const { taskId: dspTaskId } = body;
        if (!dspTaskId) return errorResponse('Missing taskId');

        const { data: dspTask } = await supabase
          .from('incidencias_firma_tasks')
          .select('scanned_signed_pdf_url')
          .eq('id', dspTaskId)
          .single();

        if (dspTask?.scanned_signed_pdf_url) {
          await supabase.storage.from('incidencias-pruebas').remove([dspTask.scanned_signed_pdf_url]);
        }

        await supabase
          .from('incidencias_firma_tasks')
          .update({ scanned_signed_pdf_url: null })
          .eq('id', dspTaskId);

        return okResponse({ success: true });
      }

      case 'getScannedSignedPdfUrl': {
        const { taskId: gspdfTaskId } = body;
        if (!gspdfTaskId) return errorResponse('Missing taskId');

        const { data: gspdfTask } = await supabase
          .from('incidencias_firma_tasks')
          .select('scanned_signed_pdf_url')
          .eq('id', gspdfTaskId)
          .single();

        if (!gspdfTask?.scanned_signed_pdf_url) return okResponse({ success: true, url: null });

        const { data: gspdfSignedUrl } = await supabase.storage
          .from('incidencias-pruebas')
          .createSignedUrl(gspdfTask.scanned_signed_pdf_url, 3600);

        return okResponse({ success: true, url: gspdfSignedUrl?.signedUrl || null });
      }

      case 'saveBulkScanCorrection': {
        // Persists the result of a bulk-scan reparto so the AI learns from user corrections.
        // Requests Gemini to summarise the lessons learnt (1-3 short bullets).
        const {
          pdfFilename,
          totalPages,
          initialAssignments,
          finalAssignments,
          chat,
        } = body as {
          pdfFilename?: string;
          totalPages?: number;
          initialAssignments?: any[];
          finalAssignments?: any[];
          chat?: Array<{ role: string; content: string }>;
        };

        const managerId = manager?.id || null;

        // Build a short "lessons" string via Gemini (best-effort; if it fails we still save).
        let lessons: string | null = null;
        try {
          const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
          const lovableKey = Deno.env.get('LOVABLE_API_KEY');
          const sysPrompt = `Eres un sistema que extrae aprendizajes de correcciones humanas a un modelo de IA. La IA reparte páginas de un PDF entre tareas (cada tarea = un trabajador). El usuario ha corregido algunos repartos. Genera un resumen de 1 a 3 viñetas en español, MUY breve (cada una < 140 caracteres), con la lección aprendida (ej.: "Cuando aparece 'Mª' interpretarlo como 'María'."). Si no hubo cambios reales, devuelve cadena vacía. SOLO el texto de las viñetas, sin encabezado.`;
          const userPrompt = `Reparto inicial: ${JSON.stringify(initialAssignments || [])}\n\nReparto final tras correcciones: ${JSON.stringify(finalAssignments || [])}\n\nMensajes del usuario:\n${(chat || []).filter(m => m.role === 'user').map(m => '- ' + m.content).join('\n') || '(ninguno)'}\n\nGenera las lecciones.`;

          if (apiKey) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const r = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: sysPrompt }] },
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig: { temperature: 0.2 },
              }),
            });
            if (r.ok) {
              const d = await r.json();
              lessons = d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
            }
          } else if (lovableKey) {
            const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lovableKey}` },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: [
                  { role: 'system', content: sysPrompt },
                  { role: 'user', content: userPrompt },
                ],
              }),
            });
            if (r.ok) {
              const d = await r.json();
              lessons = d?.choices?.[0]?.message?.content?.trim() || null;
            }
          }
          if (lessons === '') lessons = null;
        } catch (e) {
          console.error('[saveBulkScanCorrection] lessons generation failed', e);
        }

        const { error: insErr } = await supabase
          .from('incidencias_bulk_scan_corrections')
          .insert({
            created_by: managerId,
            pdf_filename: pdfFilename || null,
            total_pages: totalPages || null,
            initial_assignments: initialAssignments || [],
            final_assignments: finalAssignments || [],
            correction_chat: chat || [],
            lessons,
          });

        if (insErr) {
          console.error('[saveBulkScanCorrection] insert error', insErr);
          return okResponse({ success: false, error: insErr.message });
        }
        return okResponse({ success: true, lessons });
      }

      case 'splitAndAttachScannedPdf': {
        // Splits a single multi-document PDF into per-task sub-PDFs based on the
        // assignments coming from `incidencias-bulk-scan-split`, uploads each one
        // to its task's storage path and triggers finalizeSignedTask for each.
        const { pdfBase64: splitPdfBase64, assignments: splitAssignments } = body as {
          pdfBase64?: string;
          assignments?: Array<{ taskId: string; pageStart: number; pageEnd: number }>;
        };
        if (!splitPdfBase64) return errorResponse('Missing pdfBase64');
        if (!Array.isArray(splitAssignments) || splitAssignments.length === 0) {
          return errorResponse('Missing assignments');
        }

        // Decode base64 → Uint8Array
        const cleanSplitB64 = splitPdfBase64.includes(',') ? splitPdfBase64.split(',')[1] : splitPdfBase64;
        let sourcePdfBytes: Uint8Array;
        try {
          const bin = atob(cleanSplitB64);
          sourcePdfBytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) sourcePdfBytes[i] = bin.charCodeAt(i);
        } catch {
          return errorResponse('Invalid base64 PDF');
        }

        // Load source PDF once
        let sourcePdf;
        try {
          sourcePdf = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
        } catch (e) {
          return errorResponse('No se pudo abrir el PDF: ' + (e instanceof Error ? e.message : String(e)));
        }
        const totalPages = sourcePdf.getPageCount();

        // Validate no overlapping pages between assignments (would cause docs to "come out together")
        const pageOwnership = new Map<number, string>();
        for (const a of splitAssignments) {
          for (let p = a.pageStart; p <= a.pageEnd; p++) {
            if (pageOwnership.has(p)) {
              return errorResponse(`Conflicto de páginas: la página ${p} está asignada a más de una tarea. Revisa el reparto antes de continuar.`);
            }
            pageOwnership.set(p, a.taskId);
          }
        }

        const splitResults: Array<{ taskId: string; success: boolean; error?: string }> = [];

        // Validate all task IDs belong to awaiting_signature tasks before doing any work
        const splitTaskIds = splitAssignments.map(a => a.taskId);
        const { data: splitTasksData } = await supabase
          .from('incidencias_firma_tasks')
          .select('id, status, scanned_signed_pdf_url, incidencias_legal_documents:legal_document_id(worker_name)')
          .in('id', splitTaskIds);

        const splitTaskMap = new Map<string, any>();
        (splitTasksData || []).forEach((t: any) => splitTaskMap.set(t.id, t));

        for (const assignment of splitAssignments) {
          const { taskId, pageStart, pageEnd } = assignment;
          const t = splitTaskMap.get(taskId);
          if (!t) {
            splitResults.push({ taskId, success: false, error: 'Tarea no encontrada' });
            continue;
          }
          if (t.status !== 'awaiting_signature') {
            splitResults.push({ taskId, success: false, error: 'La tarea ya no está pendiente de firma' });
            continue;
          }
          if (pageStart < 1 || pageEnd > totalPages || pageStart > pageEnd) {
            splitResults.push({ taskId, success: false, error: `Rango de páginas inválido (${pageStart}-${pageEnd}, total ${totalPages})` });
            continue;
          }

          try {
            // Build sub-PDF copying source pages AS-IS. We do NOT rotate or
            // rebuild orientation: the scanned file must reach each task's
            // attachment exactly as the admin uploaded it.
            const sub = await PDFDocument.create();
            const indices: number[] = [];
            for (let p = pageStart - 1; p <= pageEnd - 1; p++) indices.push(p);
            const copiedPages = await sub.copyPages(sourcePdf, indices);
            for (const cp of copiedPages) sub.addPage(cp);
            const subBytes = await sub.save();

            // Remove previous scanned PDF if exists
            if (t.scanned_signed_pdf_url) {
              await supabase.storage.from('incidencias-pruebas').remove([t.scanned_signed_pdf_url]);
            }

            const workerSlug = ((t.incidencias_legal_documents?.worker_name) || 'documento')
              .toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
            const splitStoragePath = `scanned-signed/${taskId}/${Date.now()}_${workerSlug}.pdf`;

            const { error: upErr } = await supabase.storage
              .from('incidencias-pruebas')
              .upload(splitStoragePath, subBytes, { contentType: 'application/pdf', upsert: true });
            if (upErr) {
              splitResults.push({ taskId, success: false, error: 'Error subiendo: ' + upErr.message });
              continue;
            }

            const { error: updErr } = await supabase
              .from('incidencias_firma_tasks')
              .update({ scanned_signed_pdf_url: splitStoragePath })
              .eq('id', taskId);
            if (updErr) {
              splitResults.push({ taskId, success: false, error: 'Error actualizando tarea: ' + updErr.message });
              continue;
            }

            // Trigger the same finalization flow as the individual scan upload
            // by calling our own edge function with finalizeSignedTask. This keeps
            // the email + status update logic in ONE place.
            try {
              const finResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/incidencias-operations`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                },
                body: JSON.stringify({ action: 'finalizeSignedTask', sessionToken, taskId }),
              });
              if (!finResp.ok) {
                console.warn(`[splitAndAttach] finalizeSignedTask failed for ${taskId}:`, finResp.status);
              }
            } catch (finErr) {
              console.warn(`[splitAndAttach] finalizeSignedTask error for ${taskId}:`, finErr);
            }

            splitResults.push({ taskId, success: true });
          } catch (e) {
            splitResults.push({ taskId, success: false, error: e instanceof Error ? e.message : String(e) });
          }
        }

        const successCount = splitResults.filter(r => r.success).length;
        return okResponse({
          success: true,
          uploaded: successCount,
          total: splitAssignments.length,
          results: splitResults,
        });
      }

      case 'finalizeSignedTask': {
        const { taskId: finTaskId } = body;
        if (!finTaskId) return errorResponse('Missing taskId');

        const { data: finTask } = await supabase
          .from('incidencias_firma_tasks')
          .select('signed_photo_urls, legal_document_id, scanned_signed_pdf_url')
          .eq('id', finTaskId)
          .single();
        
        const { error: finErr } = await supabase
          .from('incidencias_firma_tasks')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', finTaskId);
        
        if (finErr) return errorResponse('Error finalizing task: ' + finErr.message);
        
        // Mark legal document as firmado + sync record.firmada for historial filter
        if (finTask?.legal_document_id) {
          await supabase
            .from('incidencias_legal_documents')
            .update({ firmado: true, firmado_at: new Date().toISOString() })
            .eq('id', finTask.legal_document_id);
          try {
            const { data: finDocRow } = await supabase
              .from('incidencias_legal_documents')
              .select('propuesta_id')
              .eq('id', finTask.legal_document_id)
              .maybeSingle();
            if ((finDocRow as any)?.propuesta_id) {
              const { data: finPropRow } = await supabase
                .from('incidencias_propuestas_rrhh')
                .select('record_id')
                .eq('id', (finDocRow as any).propuesta_id)
                .maybeSingle();
              if ((finPropRow as any)?.record_id) {
                await supabase
                  .from('incidencias_records')
                  .update({ firmada: true })
                  .eq('id', (finPropRow as any).record_id);
              }
            }
          } catch (syncErr) {
            console.warn('[finalizeSignedTask] failed to sync record.firmada:', syncErr);
          }
        }

        // ── Auto-send notification email for all sanciones & amonestaciones ──
        try {
          if (finTask?.legal_document_id) {
            const { data: finLegalDoc } = await supabase
              .from('incidencias_legal_documents')
              .select('id, propuesta_id, worker_name, pdf_url')
              .eq('id', finTask.legal_document_id)
              .single();

            if (finLegalDoc?.propuesta_id) {
              const { data: finProp } = await supabase
                .from('incidencias_propuestas_rrhh')
                .select('id, tipo, gravedad, suspension_dias, fecha_inicio, suspension_fechas, department_id, record_id')
                .eq('id', finLegalDoc.propuesta_id)
                .single();

              // Send for all sanciones and amonestaciones
              if (finProp && (finProp.tipo === 'sancion' || finProp.tipo === 'amonestacion')) {
                const hasSuspension = finProp.tipo === 'sancion' && finProp.suspension_dias && finProp.suspension_dias > 0;
                const isAmonestacion = finProp.tipo === 'amonestacion';

                // Get record workers
                const { data: finWorkers } = await supabase
                  .from('incidencias_record_workers')
                  .select('worker_name, worker_number')
                  .eq('record_id', finProp.record_id);

                // Get department
                const { data: finDept } = finProp.department_id
                  ? await supabase.from('incidencias_departments').select('name').eq('id', finProp.department_id).single()
                  : { data: null };

                // Get email recipients
                const { data: finEmailConfigs } = await supabase
                  .from('incidencias_email_config')
                  .select('email, is_primary')
                  .eq('activo', true)
                  .order('is_primary', { ascending: false })
                  .order('created_at');

                const finPrimaryEmails = (finEmailConfigs || []).filter((c: any) => c.is_primary).map((c: any) => c.email);
                const finCcEmails = (finEmailConfigs || []).filter((c: any) => !c.is_primary).map((c: any) => c.email);
                const finAllRecipients = [...finPrimaryEmails, ...finCcEmails];

                if (finAllRecipients.length > 0) {
                  // Theme based on tipo + gravedad
                  const finTheme = (() => {
                    if (isAmonestacion) return { headerGradient: 'linear-gradient(135deg, #b45309, #f59e0b)', accent: '#f59e0b', badgeBg: '#f59e0b', badgeText: '#fff', subtitleColor: 'rgba(255,255,255,0.7)' };
                    if (finProp.gravedad === 'muy_grave') return { headerGradient: 'linear-gradient(135deg, #991b1b, #dc2626)', accent: '#dc2626', badgeBg: '#dc2626', badgeText: '#fff', subtitleColor: 'rgba(255,255,255,0.7)' };
                    if (finProp.gravedad === 'grave') return { headerGradient: 'linear-gradient(135deg, #9a3412, #ea580c)', accent: '#ea580c', badgeBg: '#ea580c', badgeText: '#fff', subtitleColor: 'rgba(255,255,255,0.7)' };
                    return { headerGradient: 'linear-gradient(135deg, #b45309, #f59e0b)', accent: '#f59e0b', badgeBg: '#f59e0b', badgeText: '#fff', subtitleColor: 'rgba(255,255,255,0.7)' };
                  })();

                  const finGravedadLabel = finProp.gravedad === 'muy_grave' ? 'Muy grave' : finProp.gravedad === 'grave' ? 'Grave' : 'Leve';
                  const finGravedadColor = finProp.gravedad === 'muy_grave' ? '#dc2626' : finProp.gravedad === 'grave' ? '#f59e0b' : '#93d600';
                  const finTipoLabel = isAmonestacion ? 'Amonestación' : 'Sanción';

                  // Worker badges
                  const finWorkerBadges = (finWorkers || []).map((w: any) => {
                    const salixUrl = w.worker_number ? `https://salix.verdnatura.es/#/worker/${w.worker_number}/time-control` : '';
                    return salixUrl
                      ? `<a href="${salixUrl}" target="_blank" style="display:inline-block;background:${finTheme.badgeBg};color:${finTheme.badgeText};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;text-decoration:none;margin:0 4px 4px 0;">${w.worker_name}${w.worker_number ? ` (${w.worker_number})` : ''} ↗</a>`
                      : `<span style="display:inline-block;background:${finTheme.badgeBg};color:${finTheme.badgeText};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;margin:0 4px 4px 0;">${w.worker_name}</span>`;
                  }).join('');

                  const workerNamesText = (finWorkers || []).map((w: any) => `${w.worker_name}${w.worker_number ? ` (${w.worker_number})` : ''}`).join(', ');

                  // Build email body based on type
                  let finEmailBody = '';
                  let finSubject = '';

                  if (hasSuspension) {
                    // Compute suspension dates text
                    let suspensionDatesText = '';
                    if (Array.isArray(finProp.suspension_fechas) && finProp.suspension_fechas.length > 0) {
                      const sortedDates = [...finProp.suspension_fechas].sort();
                      const formatDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
                      if (sortedDates.length <= 3) {
                        suspensionDatesText = sortedDates.map(formatDate).join(', ');
                      } else {
                        suspensionDatesText = `del ${formatDate(sortedDates[0])} al ${formatDate(sortedDates[sortedDates.length - 1])}`;
                      }
                    } else if (finProp.fecha_inicio) {
                      const start = new Date(finProp.fecha_inicio + 'T00:00:00');
                      const end = new Date(start);
                      end.setDate(end.getDate() + finProp.suspension_dias - 1);
                      suspensionDatesText = `del ${start.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} al ${end.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`;
                    }

                    finEmailBody = `Se comunica que el/la trabajador/a <strong>${workerNamesText}</strong> tendrá una <strong>suspensión de empleo y sueldo de ${finProp.suspension_dias} día${finProp.suspension_dias > 1 ? 's' : ''} natural${finProp.suspension_dias > 1 ? 'es' : ''}</strong>${suspensionDatesText ? `, ${suspensionDatesText}` : ''}, como consecuencia de una falta de carácter <strong>${finGravedadLabel.toLowerCase()}</strong>.\n\nEl documento de sanción ha sido firmado y se adjunta como referencia.\n\nPor favor, procedan a realizar las gestiones oportunas para hacer efectiva la suspensión en las fechas indicadas.`;
                    finSubject = `Suspensión de empleo y sueldo — ${workerNamesText}`;
                  } else if (isAmonestacion) {
                    finEmailBody = `Se comunica que se ha notificado una <strong>amonestación</strong> al/la trabajador/a <strong>${workerNamesText}</strong>, por falta de carácter <strong>${finGravedadLabel.toLowerCase()}</strong>.\n\nEl documento ha sido firmado y se adjunta como referencia.`;
                    finSubject = `Amonestación firmada — ${workerNamesText}`;
                  } else {
                    // Sancion sin suspension
                    finEmailBody = `Se comunica que se ha notificado una <strong>sanción sin suspensión de empleo y sueldo</strong> al/la trabajador/a <strong>${workerNamesText}</strong>, por falta de carácter <strong>${finGravedadLabel.toLowerCase()}</strong>.\n\nEl documento ha sido firmado y se adjunta como referencia.`;
                    finSubject = `Sanción firmada — ${workerNamesText}`;
                  }

                  const finNowDate = (() => { const d = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return d.charAt(0).toUpperCase() + d.slice(1); })();

                  const finLogoUrl = 'https://vnprod.app/images/logo-white.png';
                  const finLogoGreenUrl = 'https://vnprod.app/images/verdnatura-logo-green.png';

                  // Info box about physical document delivery
                  const finInfoBox = `<div style="margin-top:20px;padding:14px 18px;background:#f8fafc;border-left:3px solid ${finTheme.accent};border-radius:0 8px 8px 0;">
                    <p style="margin:0;font-size:12px;color:#475569;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.6;"><strong style="color:#334155;">📁 Entrega del documento original</strong><br>A finales de esta semana, se subirá el documento firmado original a su despacho para su archivo.</p>
                  </div>`;

                  const finEmailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Poppins','Segoe UI',Arial,sans-serif;letter-spacing:-0.01em;">
<div style="max-width:620px;margin:0 auto;padding:20px;">
  <div style="background:${finTheme.headerGradient};border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <img src="${finLogoUrl}" alt="Verdnatura" width="56" height="56" style="width:56px;height:56px;margin-bottom:12px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;font-family:'Poppins','Segoe UI',sans-serif;">Control de Incidencias</h1>
    <p style="margin:4px 0 0;color:${finTheme.subtitleColor};font-size:12px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">Notificación de ${finTipoLabel} — Documento firmado</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;border-radius:0 0 16px 16px;">
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:${finTheme.accent};text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Trabajador/es</p>
      ${finWorkerBadges}
    </div>
    <div style="line-height:1.75;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;white-space:pre-wrap;letter-spacing:-0.01em;">${finEmailBody.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<span style="font-weight:600;color:#1e293b">$1</span>')}</div>
    ${finInfoBox}
    <div style="margin-top:28px;line-height:1.4;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">
      <p style="margin:0 0 16px;">Muchas gracias y un saludo,</p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-right:16px;vertical-align:middle;"><img src="${finLogoGreenUrl}" alt="Verdnatura" width="40" height="40" style="width:40px;height:40px;display:block;"></td>
          <td style="padding-right:16px;border-right:2px solid ${finTheme.accent};vertical-align:middle;">
            <p style="margin:0;font-size:14px;font-weight:600;color:#1a1a1a;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.02em;line-height:1.3;">Álvaro Mas</p>
            <p style="margin:1px 0 0;font-size:12px;font-weight:400;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.3;">VerdNatura Levante S.L.</p>
          </td>
          <td style="padding-left:16px;vertical-align:middle;">
            <p style="margin:0 0 2px;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">+34 661 95 84 33</p>
            <p style="margin:0;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">Carrer Fenollar, 2, 46680 Algemesí</p>
          </td>
        </tr>
      </table>
    </div>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          ${hasSuspension ? `<td style="padding:3px 4px 3px 0;"><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${finProp.suspension_dias} día${finProp.suspension_dias > 1 ? 's' : ''} de suspensión</span></td>` : ''}
          <td style="padding:3px 4px;"><span style="display:inline-block;background:${finGravedadColor}18;color:${finGravedadColor};padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${finTipoLabel} · ${finGravedadLabel}</span></td>
          ${finDept ? `<td style="padding:3px 4px;"><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${finDept.name}</span></td>` : ''}
        </tr>
      </table>
    </div>
    <div style="margin-top:16px;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:6px;">
        <tr>
          <td style="width:3px;background:${finTheme.accent};border-radius:2px;"></td>
          <td style="padding-left:10px;"><span style="font-size:11px;font-weight:600;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;">Enviado desde Control de Incidencias · Verdnatura</span></td>
        </tr>
      </table>
      <p style="margin:0;font-size:11px;color:#94a3b8;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.4;">${finNowDate} · Este correo es confidencial y está destinado exclusivamente a los departamentos autorizados.</p>
    </div>
  </div>
</div></body></html>`;

                  // Build email payload with PDF attachment
                  const finEmailPayload: any = {
                    from: 'Control Incidencias <incidencias@vnprod.app>',
                    to: finPrimaryEmails.length > 0 ? finPrimaryEmails : [finAllRecipients[0]],
                    cc: finPrimaryEmails.length > 0 ? finCcEmails : (finAllRecipients.length > 1 ? finAllRecipients.slice(1) : undefined),
                    subject: finSubject,
                    html: finEmailHtml,
                  };

                  // Attach PDF: prefer scanned signed PDF, fallback to original generated PDF
                  const scannedPdfPath = finTask?.scanned_signed_pdf_url || null;
                  const attachmentSource: { path: string; isScanned: boolean } | null = scannedPdfPath
                    ? { path: scannedPdfPath, isScanned: true }
                    : (finLegalDoc.pdf_url
                        ? { path: extractIncidenciaStoragePath(finLegalDoc.pdf_url) || finLegalDoc.pdf_url, isScanned: false }
                        : null);

                  if (attachmentSource) {
                    try {
                      const { data: pdfData } = await supabase.storage
                        .from('incidencias-pruebas')
                        .download(attachmentSource.path);
                      if (pdfData) {
                        const pdfArrayBuffer = await pdfData.arrayBuffer();
                        const pdfBytes = new Uint8Array(pdfArrayBuffer);
                        let pdfBase64 = '';
                        const chunkSize = 8192;
                        for (let i = 0; i < pdfBytes.length; i += chunkSize) {
                          pdfBase64 += String.fromCharCode(...pdfBytes.subarray(i, i + chunkSize));
                        }
                        pdfBase64 = btoa(pdfBase64);
                        const workerFileName = (finWorkers?.[0]?.worker_name || 'documento').replace(/\s+/g, '_');
                        const fileLabel = attachmentSource.isScanned ? `${finTipoLabel}_FIRMADA_${workerFileName}.pdf` : `${finTipoLabel}_${workerFileName}.pdf`;
                        finEmailPayload.attachments = [{
                          filename: fileLabel,
                          content: pdfBase64,
                        }];
                        console.log(`[finalizeSignedTask] Attached ${attachmentSource.isScanned ? 'SCANNED SIGNED' : 'ORIGINAL'} PDF: ${attachmentSource.path}`);
                      }
                    } catch (pdfErr) {
                      console.error('[finalizeSignedTask] Error downloading PDF for attachment:', pdfErr);
                    }
                  }

                  const finEmailRes = await sendEmailBrevo(finEmailPayload);
                  const finEmailResText = await finEmailRes.text();
                  console.log('[finalizeSignedTask] Notification email sent:', finEmailRes.status, finEmailResText);

                  if (finEmailRes.ok) {
                    const logAction = hasSuspension ? 'notificacion_suspension_firmada' : `notificacion_${finProp.tipo}_firmada`;
                    await writeIncidenciasLog(logAction, null, finLegalDoc.propuesta_id, `Email de ${finTipoLabel.toLowerCase()} enviado automáticamente a ${finAllRecipients.join(', ')} para ${workerNamesText}${hasSuspension ? ` (${finProp.suspension_dias} días suspensión)` : ''}`, { destinatarios: finAllRecipients, tipo: finProp.tipo, gravedad: finProp.gravedad });
                  } else {
                    console.error('[finalizeSignedTask] Notification email failed:', finEmailResText);
                  }
                }
              }
            }
          }
        } catch (susEmailErr) {
          console.error('[finalizeSignedTask] Error sending notification email:', susEmailErr);
          // Don't fail the main task if email fails
        }
        
        return okResponse({ success: true });
      }

      case 'deliverToRRHH': {
        const { taskId: delTaskId } = body;
        if (!delTaskId) return errorResponse('Missing taskId');

        const { data: delTask } = await supabase
          .from('incidencias_firma_tasks')
          .select('id, status, legal_document_id')
          .eq('id', delTaskId)
          .single();

        if (!delTask) return errorResponse('Task not found');
        if (delTask.status !== 'completed') return errorResponse('La tarea debe estar finalizada antes de entregar a RRHH');

        const { error: delErr } = await supabase
          .from('incidencias_firma_tasks')
          .update({ status: 'delivered_rrhh' })
          .eq('id', delTaskId);

        if (delErr) return errorResponse('Error updating task: ' + delErr.message);

        // Log de auditoría (sin email: la entrega es solo cambio de estado interno)
        try {
          if (delTask.legal_document_id) {
            const { data: delDoc } = await supabase
              .from('incidencias_legal_documents')
              .select('id, propuesta_id, worker_name')
              .eq('id', delTask.legal_document_id)
              .single();

            if (delDoc?.propuesta_id) {
              await writeIncidenciasLog('documento_entregado_rrhh', null, delDoc.propuesta_id, `Documento marcado como entregado a RRHH${delDoc.worker_name ? ` (${delDoc.worker_name})` : ''}`, {});
            }
          }
        } catch (delLogErr) {
          console.error('[deliverToRRHH] Log error:', delLogErr);
        }

        return okResponse({ success: true });
      }

      case 'getSignedPhotoUrls': {
        const { storagePaths: gspPaths } = body;
        if (!gspPaths || !Array.isArray(gspPaths) || gspPaths.length === 0) return errorResponse('Missing storagePaths');
        
        const urls: { path: string; url: string }[] = [];
        for (const p of gspPaths) {
          const { data: signedUrlData } = await supabase.storage
            .from('incidencias-pruebas')
            .createSignedUrl(p, 3600);
          if (signedUrlData?.signedUrl) {
            urls.push({ path: p, url: signedUrlData.signedUrl });
          }
        }
        
        return okResponse({ success: true, urls });
      }

      case 'getSignedPhotoUrl': {
        const { storagePath: gspPath } = body;
        if (!gspPath) return errorResponse('Missing storagePath');
        
        const { data: gspSignedUrl } = await supabase.storage
          .from('incidencias-pruebas')
          .createSignedUrl(gspPath, 3600);
        
        return okResponse({ success: true, url: gspSignedUrl?.signedUrl || null });
      }

      // =============================================
      // SEARCH WORKERS GLOBALLY (for reports)
      // =============================================
      case 'searchWorkersGlobal': {
        const { query: swQuery } = body;
        if (!swQuery || swQuery.length < 2) return okResponse({ workers: [] });
        const q = `%${swQuery}%`;
        const { data: swData } = await supabase
          .from('incidencias_workers')
          .select('id, nombre, apellidos, worker_number, external_url_salix, department_id, incidencias_departments(name)')
          .or(`nombre.ilike.${q},apellidos.ilike.${q},worker_number.ilike.${q}`)
          .eq('activo', true)
          .order('nombre')
          .limit(20);
        return okResponse({ workers: (swData || []).map((w: any) => ({ ...w, department_name: w.incidencias_departments?.name || null })) });
      }

      // =============================================
      // POSITIVE CATEGORIES CRUD
      // =============================================
      case 'listPositiveCategories': {
        const { data: cats, error: catsErr } = await supabase
          .from('incidencias_positive_categories')
          .select('*')
          .order('sort_order', { ascending: true });
        if (catsErr) return errorResponse(catsErr.message);
        return okResponse({ categories: cats || [] });
      }

      case 'createPositiveCategory': {
        if (!isAdmin) return errorResponse('Admin only');
        const { name: pcName, color: pcColor } = body;
        if (!pcName?.trim()) return errorResponse('Name required');
        const { data: maxOrder } = await supabase.from('incidencias_positive_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1);
        const nextOrder = ((maxOrder?.[0] as any)?.sort_order || 0) + 1;
        const { data: newCat, error: newCatErr } = await supabase.from('incidencias_positive_categories').insert({ name: pcName.trim(), color: pcColor || '#22c55e', sort_order: nextOrder }).select().single();
        if (newCatErr) return errorResponse(newCatErr.message);
        return okResponse({ category: newCat });
      }

      case 'updatePositiveCategory': {
        if (!isAdmin) return errorResponse('Admin only');
        const { categoryId: upcId, name: upcName, color: upcColor, active: upcActive } = body;
        if (!upcId) return errorResponse('categoryId required');
        const updates: any = {};
        if (upcName !== undefined) updates.name = upcName;
        if (upcColor !== undefined) updates.color = upcColor;
        if (upcActive !== undefined) updates.active = upcActive;
        const { error: upcErr } = await supabase.from('incidencias_positive_categories').update(updates).eq('id', upcId);
        if (upcErr) return errorResponse(upcErr.message);
        return okResponse({ updated: true });
      }

      case 'deletePositiveCategory': {
        if (!isAdmin) return errorResponse('Admin only');
        const { categoryId: dpcId } = body;
        if (!dpcId) return errorResponse('categoryId required');
        const { error: dpcErr } = await supabase.from('incidencias_positive_categories').update({ active: false }).eq('id', dpcId);
        if (dpcErr) return errorResponse(dpcErr.message);
        return okResponse({ deleted: true });
      }

      // =============================================
      // POSITIVE RECORDS CRUD
      // =============================================
      case 'createPositiveRecord': {
        const { departmentId: prDeptId, categoryId: prCatId, workerIds: prWorkerIds, fecha: prFecha, descripcion: prDesc, pruebasUrls: prPruebas } = body;
        if (!prCatId) return errorResponse('categoryId required');
        if (!prWorkerIds?.length) return errorResponse('workerIds required');

        const { resolvedDepartmentId: prResolvedDept, workerRows: prWorkerRows } = await resolveIncidenciaWorkers(prWorkerIds);
        const finalDeptId = prDeptId || prResolvedDept;

        const { data: prRecord, error: prErr } = await supabase.from('incidencias_positive_records').insert({
          department_id: finalDeptId,
          category_id: prCatId,
          fecha: prFecha || new Date().toISOString().slice(0, 10),
          descripcion: prDesc || '',
          created_by_id: manager.id,
          created_by_name: manager.name,
          pruebas_urls: prPruebas || [],
        }).select().single();
        if (prErr) return errorResponse(prErr.message);

        const prWorkerInserts = prWorkerRows.map(w => ({ record_id: prRecord.id, worker_id: w.worker_id, worker_name: w.worker_name }));
        await supabase.from('incidencias_positive_record_workers').insert(prWorkerInserts);

        writeIncidenciasLog('positive_record_created', null, null, `Reconocimiento positivo: ${prWorkerRows.map(w => w.worker_name).join(', ')}`);
        return okResponse({ record: prRecord });
      }

      case 'listPositiveRecords': {
        const { departmentId: lprDeptId, workerId: lprWorkerId, fechaDesde: lprDesde, fechaHasta: lprHasta } = body;
        let query = supabase.from('incidencias_positive_records').select('*, incidencias_positive_categories(name, color), incidencias_positive_record_workers(worker_id, worker_name)').order('created_at', { ascending: false });
        if (lprDeptId) query = query.eq('department_id', lprDeptId);
        if (lprDesde) query = query.gte('fecha', lprDesde);
        if (lprHasta) query = query.lte('fecha', lprHasta);
        const { data: lprData, error: lprErr } = await query.limit(500);
        if (lprErr) return errorResponse(lprErr.message);
        let records = lprData || [];
        if (lprWorkerId) {
          records = records.filter((r: any) => r.incidencias_positive_record_workers?.some((w: any) => w.worker_id === lprWorkerId));
        }
        return okResponse({ records });
      }

      // =============================================
      // WORKER FULL STATS (positive + negative)
      // =============================================
      case 'getWorkerFullStats': {
        const { workerId: wsWorkerId, fechaDesde: wsDesde, fechaHasta: wsHasta, incluirPositivas: wsPositivas } = body;
        if (!wsWorkerId) return errorResponse('workerId required');

        const reportData = await getWorkerReportDataset(wsWorkerId, wsDesde, wsHasta, wsPositivas !== false);
        return okResponse(reportData);
      }

      // =============================================
      // GENERATE WORKER REPORT (AI)
      // =============================================
      case 'generateWorkerReport': {
        if (!isAdmin) return errorResponse('Admin only');
        const { workerId: grWorkerId, fechaDesde: grDesde, fechaHasta: grHasta, incluirPositivas: grPositivas, formato: grFormato } = body;
        if (!grWorkerId) return errorResponse('workerId required');

        const reportData = await getWorkerReportDataset(grWorkerId, grDesde, grHasta, grPositivas !== false);
        const grWorker = reportData.worker;
        if (!grWorker) return errorResponse('Worker not found');

        const allNeg = reportData.negativas_all || [];
        const soloIncidencias = reportData.negativas || [];
        const grPos = reportData.positivas || [];
        const allProposals = reportData.propuestas || [];
        const amonestaciones = reportData.amonestaciones || [];
        const sancionesR = reportData.sanciones || [];
        const allClassifiedNeg = [...soloIncidencias, ...amonestaciones, ...sancionesR];

        const workerName = [grWorker.nombre, grWorker.apellidos].filter(Boolean).join(' ');
        const deptName = grWorker.incidencias_departments?.name || '';
        const workerNum = grWorker.worker_number || '';

        // Get brief AI insight (not the full layout)
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        let aiInsight = '';
        if (LOVABLE_API_KEY) {
          try {
            const dataSummary = `Incidencias solo registro: ${soloIncidencias.length}, Amonestaciones: ${amonestaciones.length}, Sanciones: ${sancionesR.length}, Reconocimientos: ${grPos.length}. Periodo: ${grDesde || 'inicio'} a ${grHasta || 'hoy'}.`;
            const catBreakdown = allClassifiedNeg.reduce((acc: Record<string, number>, r: any) => {
              const cat = r.incidencias_categories?.name || 'Otros';
              acc[cat] = (acc[cat] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            // Collect AI analyses from proposals for richer context
            const aiAnalysesSummaries = allProposals
              .filter((p: any) => p.ai_analysis)
              .slice(0, 10) // limit to avoid prompt bloat
              .map((p: any) => {
                const a = p.ai_analysis;
                return [
                  `- Propuesta (${p.tipo}/${p.gravedad}): ${a.resumen_ejecutivo || ''}`,
                  a.valoracion_hechos ? `  Valoración: ${a.valoracion_hechos}` : '',
                  a.fundamentacion_legal ? `  Fundamentación: ${a.fundamentacion_legal}` : '',
                  a.justificacion_cambio ? `  Justificación tipo/gravedad: ${a.justificacion_cambio}` : '',
                  a.evaluacion_reincidencia ? `  Reincidencia: ${a.evaluacion_reincidencia}` : '',
                  a.riesgo_empresa ? `  Riesgo: ${a.riesgo_empresa} - ${a.riesgo_detalle || ''}` : '',
                ].filter(Boolean).join('\n');
              }).join('\n\n');

            const aiAnalysisContext = aiAnalysesSummaries
              ? `\n\nANÁLISIS IA PREVIOS DE LAS PROPUESTAS DISCIPLINARIAS:\n${aiAnalysesSummaries}`
              : '';

            const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'google/gemini-3-flash-preview',
                messages: [
                  { role: 'system', content: 'Eres un analista de RRHH experto en derecho laboral español. Escribe un análisis ejecutivo profesional (máximo 6 frases) sobre el rendimiento disciplinario de este trabajador. Fundamenta tu análisis en los datos proporcionados, incluyendo los análisis IA previos de las propuestas si los hay. Menciona patrones, riesgos legales y recomendaciones concretas. Sé objetivo, conciso y profesional. Solo texto plano, sin formato.' },
                  { role: 'user', content: `Trabajador: ${workerName}. Departamento: ${deptName}. ${dataSummary} Desglose por categorías: ${JSON.stringify(catBreakdown)}${aiAnalysisContext}` },
                ],
              }),
            });
            if (aiRes.ok) {
              const aiJson = await aiRes.json();
              aiInsight = aiJson.choices?.[0]?.message?.content?.trim() || '';
            }
          } catch { /* non-critical */ }
        }

        // Build category breakdown for charts
        const catCounts: Record<string, { count: number; color: string; gravedad: string }> = {};
        for (const r of allClassifiedNeg) {
          const cat = r.incidencias_categories?.name || 'Otros';
          if (!catCounts[cat]) catCounts[cat] = { count: 0, color: r.incidencias_categories?.color || '#94a3b8', gravedad: r.incidencias_categories?.gravedad || 'leve' };
          catCounts[cat].count++;
        }

        // Monthly evolution
        const monthlyData: Record<string, { neg: number; pos: number; amon: number; sanc: number }> = {};
        for (const r of soloIncidencias) {
          const m = (r.fecha_evento || r.fecha || '').slice(0, 7);
          if (!monthlyData[m]) monthlyData[m] = { neg: 0, pos: 0, amon: 0, sanc: 0 };
          monthlyData[m].neg++;
        }
        for (const r of grPos) {
          const m = r.fecha?.slice(0, 7) || '';
          if (!monthlyData[m]) monthlyData[m] = { neg: 0, pos: 0, amon: 0, sanc: 0 };
          monthlyData[m].pos++;
        }
        for (const p of amonestaciones) {
          const m = (p.fecha_evento || p.created_at || '').slice(0, 7);
          if (!monthlyData[m]) monthlyData[m] = { neg: 0, pos: 0, amon: 0, sanc: 0 };
          monthlyData[m].amon++;
        }
        for (const p of sancionesR) {
          const m = (p.fecha_evento || p.created_at || '').slice(0, 7);
          if (!monthlyData[m]) monthlyData[m] = { neg: 0, pos: 0, amon: 0, sanc: 0 };
          monthlyData[m].sanc++;
        }

        const sortedMonths = Object.keys(monthlyData).sort();
        const maxMonthVal = Math.max(1, ...sortedMonths.map(m => monthlyData[m].neg + monthlyData[m].amon + monthlyData[m].sanc));

        // Build SVG pie chart
        const pieData = [
          { label: 'Incidencias', count: soloIncidencias.length, color: '#f59e0b' },
          { label: 'Amonestaciones', count: amonestaciones.length, color: '#f97316' },
          { label: 'Sanciones', count: sancionesR.length, color: '#dc2626' },
          ...(grPositivas ? [{ label: 'Reconocimientos', count: grPos.length, color: '#93d600' }] : []),
        ].filter(d => d.count > 0);
        const pieTotal = pieData.reduce((s, d) => s + d.count, 0) || 1;
        let pieAngle = 0;
        const pieSlices = pieData.map(d => {
          const a1 = pieAngle;
          const sweep = (d.count / pieTotal) * 360;
          pieAngle += sweep;
          const a2 = pieAngle;
          const r = 80;
          const cx = 100, cy = 100;
          const rad1 = (a1 - 90) * Math.PI / 180;
          const rad2 = (a2 - 90) * Math.PI / 180;
          const x1 = cx + r * Math.cos(rad1), y1 = cy + r * Math.sin(rad1);
          const x2 = cx + r * Math.cos(rad2), y2 = cy + r * Math.sin(rad2);
          const large = sweep > 180 ? 1 : 0;
          if (pieData.length === 1) {
            return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${d.color}" />`;
          }
          return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${d.color}" />`;
        }).join('');

        const pieSvg = `<svg viewBox="0 0 200 200" width="180" height="180">${pieSlices}</svg>`;
        const pieLegend = pieData.map(d => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:11px;"><span style="width:10px;height:10px;border-radius:50%;background:${d.color};display:inline-block;"></span>${d.label}: <strong>${d.count}</strong></span>`).join('');

        // Build SVG bar chart for categories
        const catEntries = Object.entries(catCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 8);
        const maxCatVal = Math.max(1, ...catEntries.map(e => e[1].count));
        const barH = 24;
        const barGap = 6;
        const barChartH = catEntries.length * (barH + barGap) + 10;
        const barsSvg = catEntries.map(([name, { count, color }], i) => {
          const y = i * (barH + barGap) + 5;
          const w = Math.max(4, (count / maxCatVal) * 240);
          return `<rect x="0" y="${y}" width="${w}" height="${barH}" rx="4" fill="${color}" opacity="0.85"/>
            <text x="${w + 6}" y="${y + barH / 2 + 4}" fill="#334155" font-size="11" font-family="Poppins,sans-serif">${count}</text>
            <text x="4" y="${y + barH / 2 + 4}" fill="#fff" font-size="10" font-weight="600" font-family="Poppins,sans-serif">${name.length > 25 ? name.slice(0, 22) + '...' : name}</text>`;
        }).join('');

        // Build monthly evolution bar chart
        const monthBarW = Math.max(20, Math.min(50, 500 / Math.max(sortedMonths.length, 1)));
        const evoChartW = sortedMonths.length * (monthBarW + 4) + 20;
        const evoChartH = 140;
        const monthBars = sortedMonths.map((m, i) => {
          const d = monthlyData[m];
          const total = d.neg + d.amon + d.sanc;
          const h = Math.max(2, (total / maxMonthVal) * 100);
          const x = i * (monthBarW + 4) + 10;
          const label = m.slice(5);
          return `<rect x="${x}" y="${evoChartH - 30 - h}" width="${monthBarW}" height="${h}" rx="3" fill="#f59e0b" opacity="0.8"/>
            ${d.pos > 0 ? `<rect x="${x}" y="${evoChartH - 30 - h - Math.max(2, (d.pos / maxMonthVal) * 100)}" width="${monthBarW}" height="${Math.max(2, (d.pos / maxMonthVal) * 100)}" rx="3" fill="#93d600" opacity="0.7"/>` : ''}
            <text x="${x + monthBarW / 2}" y="${evoChartH - 14}" text-anchor="middle" fill="#64748b" font-size="9" font-family="Poppins,sans-serif">${label}</text>
            <text x="${x + monthBarW / 2}" y="${evoChartH - 34 - h}" text-anchor="middle" fill="#334155" font-size="9" font-weight="600" font-family="Poppins,sans-serif">${total}</text>`;
        }).join('');

        // Build timeline HTML
        const timelineItems = [
          ...soloIncidencias.map((r: any) => ({ type: 'inc', date: r.fecha, label: r.incidencias_categories?.name || 'Incidencia', desc: r.descripcion?.slice(0, 120) || '', color: '#f59e0b' })),
          ...amonestaciones.map((p: any) => ({ type: 'amon', date: (p.fecha_evento || p.created_at || '').slice(0, 10), label: `Amonestación (${p.gravedad || '—'})`, desc: p.descripcion?.slice(0, 120) || '', color: '#f97316' })),
          ...sancionesR.map((p: any) => ({ type: 'sanc', date: (p.fecha_evento || p.created_at || '').slice(0, 10), label: `Sanción (${p.gravedad || '—'}) · ${p.suspension_dias || 0} días`, desc: p.descripcion?.slice(0, 120) || '', color: '#dc2626' })),
          ...grPos.map((r: any) => ({ type: 'pos', date: r.fecha, label: r.incidencias_positive_categories?.name || 'Reconocimiento', desc: r.descripcion?.slice(0, 120) || '', color: '#93d600' })),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 40);

        const timelineHtml = timelineItems.map(item => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 12px;border-left:3px solid ${item.color};margin-bottom:6px;background:${item.color}08;border-radius:0 8px 8px 0;">
            <span style="font-size:11px;color:#64748b;white-space:nowrap;min-width:70px;">${item.date || '—'}</span>
            <span style="font-size:11px;font-weight:600;color:${item.color};white-space:nowrap;">${item.type === 'pos' ? '★' : item.type === 'sanc' ? '⚠' : item.type === 'amon' ? '⚡' : '●'}</span>
            <div style="flex:1;min-width:0;">
              <span style="font-size:12px;font-weight:600;color:#1e293b;">${item.label}</span>
              ${item.desc ? `<p style="margin:2px 0 0;font-size:11px;color:#64748b;line-height:1.4;">${item.desc}</p>` : ''}
            </div>
          </div>`).join('');

        const logoUrl = 'https://vnprod.app/images/logo-white.png';
        const logoGreenUrl = 'https://vnprod.app/images/verdnatura-logo-green.png';
        const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
        const periodoText = `${grDesde ? new Date(grDesde + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Inicio'} — ${grHasta ? new Date(grHasta + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Hoy'}`;
        const gradientStart = '#b54114';
        const gradientEnd = '#ff5a00';
        const neutralBg = '#eef3f8';
        const neutralCard = '#ffffff';
        const slateText = '#334155';
        const titleText = '#1f2a44';
        const mutedText = '#6b7a90';
        const borderSoft = '#d9e2ec';
        const successColor = '#93d600';
        const incidenciasColor = '#f59e0b';
        const amonColor = '#f97316';
        const sancionColor = '#dc2626';
        const positiveColor = '#7bc600';
        const isPresentacion = grFormato === 'presentacion';
        const signedWorkerUrl = workerNum ? `https://salix.verdnatura.es/#!/worker/${workerNum}/summary` : '';
        const safeWorkerName = escapeHtml(workerName || 'Trabajador');
        const safeDeptName = escapeHtml(deptName || 'Sin departamento');
        const safePeriod = escapeHtml(periodoText);
        const safeToday = escapeHtml(today);
        const safeWorkerNum = escapeHtml(workerNum || '—');
        const totalNegativas = soloIncidencias.length + amonestaciones.length + sancionesR.length;
        const totalEventos = totalNegativas + grPos.length;
        const compliancePct = totalEventos > 0
          ? Math.max(8, Math.min(96, Math.round((grPos.length / totalEventos) * 100)))
          : 100;
        const riesgoPct = totalNegativas > 0
          ? Math.max(8, Math.min(96, Math.round((sancionesR.length / totalNegativas) * 100)))
          : 0;
        const actividadPct = totalEventos > 0
          ? Math.max(8, Math.min(96, Math.round(((amonestaciones.length + sancionesR.length) / totalEventos) * 100)))
          : 0;
        const safeAiInsight = escapeHtml(aiInsight);
        const clampPct = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
        const buildRing = (value: number, color: string) => {
          const pct = clampPct(value);
          const circumference = 2 * Math.PI * 34;
          const dash = (pct / 100) * circumference;
          return `
            <svg viewBox="0 0 88 88" width="88" height="88" aria-hidden="true">
              <defs>
                <linearGradient id="ring-${color.replace(/[^a-z0-9]/gi, '')}" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="${color}" stop-opacity="0.72"></stop>
                  <stop offset="100%" stop-color="${color}"></stop>
                </linearGradient>
              </defs>
              <circle cx="44" cy="44" r="34" fill="none" stroke="#e5edf5" stroke-width="8"></circle>
              <circle cx="44" cy="44" r="34" fill="none" stroke="url(#ring-${color.replace(/[^a-z0-9]/gi, '')})" stroke-width="8" stroke-linecap="round" stroke-dasharray="${dash} ${circumference - dash}" transform="rotate(-90 44 44)"></circle>
            </svg>`;
        };
        const buildKpiCard = (label: string, value: number, color: string, tone: string) => `
          <div class="kpi-card ${tone}">
            <div class="kpi-value" style="color:${color};">${value}</div>
            <div class="kpi-label">${escapeHtml(label)}</div>
          </div>`;

        // --- Colors: desaturated, muted, elegant ---
        const cIncidencia = '#8b95a3';  // grey-blue muted
        const cAmon = '#b09060';        // muted warm tan
        const cSancion = '#8b5c5c';     // muted dusty rose
        const cPositivo = '#7a9a50';     // muted olive green
        const cBrand = '#93d600';        // corporate green

        // --- Donut chart (elegant, thin arc) ---
        const donutData = [
          { label: 'Amonestaciones', count: amonestaciones.length, color: cAmon },
          { label: 'Sanciones', count: sancionesR.length, color: cSancion },
          ...(grPositivas ? [{ label: 'Reconocimientos', count: grPos.length, color: cPositivo }] : []),
        ].filter(d => d.count > 0);
        const donutTotal = donutData.reduce((s, d) => s + d.count, 0) || 1;
        const donutR = 52, donutStroke = 10, donutCx = 66, donutCy = 66;
        const donutCircumference = 2 * Math.PI * donutR;
        let donutOffset = 0;
        const donutArcs = donutData.map(d => {
          const pct = d.count / donutTotal;
          const dash = pct * donutCircumference;
          const offset = donutOffset;
          donutOffset += dash;
          return `<circle cx="${donutCx}" cy="${donutCy}" r="${donutR}" fill="none" stroke="${d.color}" stroke-width="${donutStroke}" stroke-dasharray="${dash} ${donutCircumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${donutCx} ${donutCy})" stroke-linecap="round"/>`;
        }).join('');
        const donutSvg = donutData.length > 0 ? `<svg viewBox="0 0 132 132" width="110" height="110">${donutArcs}<text x="${donutCx}" y="${donutCy - 2}" text-anchor="middle" font-size="18" font-weight="600" fill="#3a3f47" font-family="Poppins,sans-serif">${donutTotal}</text><text x="${donutCx}" y="${donutCy + 11}" text-anchor="middle" font-size="7" fill="#9ca3af" font-family="Poppins,sans-serif">total</text></svg>` : '';

        // --- Horizontal bars for categories (muted) ---
        const catEntries2 = Object.entries(catCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
        const maxCatVal2 = Math.max(1, ...catEntries2.map(e => e[1].count));
        const catBarsHtml = catEntries2.map(([name, { count }]) => {
          const pct = Math.max(8, (count / maxCatVal2) * 100);
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:9px;color:#6b7280;width:110px;text-align:right;flex-shrink:0;font-weight:500;">${name.length > 20 ? name.slice(0,18) + '…' : name}</span>
            <div style="flex:1;height:6px;background:#f0f1f3;border-radius:3px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:#a0a8b4;border-radius:3px;"></div></div>
            <span style="font-size:10px;font-weight:600;color:#4a5060;width:18px;">${count}</span>
          </div>`;
        }).join('');

        // --- Monthly evolution mini bar chart ---
        const sortedMonths2 = Object.keys(monthlyData).sort();
        const maxMonthVal2 = Math.max(1, ...sortedMonths2.map(m => monthlyData[m].neg + monthlyData[m].amon + monthlyData[m].sanc + monthlyData[m].pos));
        const evoBarW = Math.max(16, Math.min(36, 400 / Math.max(sortedMonths2.length, 1)));
        const evoChartW2 = sortedMonths2.length * (evoBarW + 6) + 20;
        const evoChartH2 = 100;
        const evoBars = sortedMonths2.map((m, i) => {
          const d = monthlyData[m];
          const negH = Math.max(1, ((d.neg + d.amon + d.sanc) / maxMonthVal2) * 60);
          const posH = Math.max(0, (d.pos / maxMonthVal2) * 60);
          const x = i * (evoBarW + 6) + 10;
          const label = m.slice(5);
          return `<rect x="${x}" y="${evoChartH2 - 22 - negH}" width="${evoBarW}" height="${negH}" rx="2" fill="#a0a8b4" opacity="0.7"/>
            ${posH > 0 ? `<rect x="${x}" y="${evoChartH2 - 22 - negH - posH - 2}" width="${evoBarW}" height="${posH}" rx="2" fill="${cPositivo}" opacity="0.5"/>` : ''}
            <text x="${x + evoBarW / 2}" y="${evoChartH2 - 8}" text-anchor="middle" fill="#9ca3af" font-size="7" font-family="Poppins,sans-serif">${label}</text>`;
        }).join('');

        // --- Gravity distribution mini chart ---
        const gravCounts: Record<string, number> = {};
        for (const r of [...amonestaciones, ...sancionesR]) {
          const g = r.gravedad || 'sin clasificar';
          gravCounts[g] = (gravCounts[g] || 0) + 1;
        }
        const gravEntries = Object.entries(gravCounts).sort((a, b) => b[1] - a[1]);
        const gravTotal = gravEntries.reduce((s, e) => s + e[1], 0) || 1;
        const gravBarsHtml = gravEntries.map(([name, count]) => {
          const pct = Math.max(8, (count / gravTotal) * 100);
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
            <span style="font-size:9px;color:#6b7280;width:80px;text-align:right;flex-shrink:0;font-weight:500;">${name}</span>
            <div style="flex:1;height:6px;background:#f0f1f3;border-radius:3px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:#8b95a3;border-radius:3px;"></div></div>
            <span style="font-size:10px;font-weight:600;color:#4a5060;width:18px;">${count}</span>
          </div>`;
        }).join('');

        // --- Suspension days total ---
        const totalSuspDays = sancionesR.reduce((s: number, p: any) => s + (p.suspension_dias || 0), 0);

        // --- Timeline items sorted ---
        const tlItems = [
          ...soloIncidencias.map((r: any) => ({ type: 'inc', date: r.fecha, label: r.incidencias_categories?.name || 'Incidencia', desc: r.descripcion?.slice(0, 90) || '', color: cIncidencia })),
          ...amonestaciones.map((p: any) => ({ type: 'amon', date: (p.fecha_evento || p.created_at || '').slice(0, 10), label: `Amonestación (${p.gravedad || '—'})`, desc: p.descripcion?.slice(0, 90) || '', color: cAmon })),
          ...sancionesR.map((p: any) => ({ type: 'sanc', date: (p.fecha_evento || p.created_at || '').slice(0, 10), label: `Sanción (${p.gravedad || '—'}) · ${p.suspension_dias || 0} días`, desc: p.descripcion?.slice(0, 90) || '', color: cSancion })),
          ...grPos.map((r: any) => ({ type: 'pos', date: r.fecha, label: r.incidencias_positive_categories?.name || 'Reconocimiento', desc: r.descripcion?.slice(0, 90) || '', color: cPositivo })),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 30);

        // --- Disciplinary table rows ---
        const discRows = [...amonestaciones.map((p: any) => ({ ...p, _tipo: 'Amonestación', _tcolor: cAmon })), ...sancionesR.map((p: any) => ({ ...p, _tipo: 'Sanción', _tcolor: cSancion }))]
          .sort((a: any, b: any) => new Date(b.fecha_evento || b.created_at || 0).getTime() - new Date(a.fecha_evento || a.created_at || 0).getTime())
          .slice(0, 15);

        const totalPages = (tlItems.length > 0 || discRows.length > 0) ? 3 : 2;

        const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: 210mm 297mm; margin: 0; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Poppins','Helvetica Neue',sans-serif; color:#2d3340; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; font-weight:400; }
  .page { width:210mm; height:297mm; padding:18mm 20mm 16mm; margin:0 auto; position:relative; page-break-after:always; background:#fff; overflow:hidden; }
  .page:last-child { page-break-after:auto; }

  /* Header */
  .header { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
  .header-logo { width:24px; height:24px; flex-shrink:0; }
  .header-bar { width:1.5px; height:26px; background:${cBrand}; flex-shrink:0; border-radius:1px; }
  .header-titles { flex:1; }
  .header-title { font-size:15px; font-weight:600; color:${cBrand}; letter-spacing:-0.03em; }
  .header-sub { font-size:8.5px; color:#9ca3af; font-weight:400; margin-top:1px; letter-spacing:-0.01em; }
  .header-date { font-size:8px; color:#9ca3af; font-weight:400; text-align:right; flex-shrink:0; line-height:1.5; }
  .header-line { height:0.5px; background:#e5e7eb; margin-bottom:16px; }

  /* Worker card */
  .worker-card { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#f9fafb; border:1px solid #eef0f2; border-radius:10px; margin-bottom:18px; }
  .w-name { font-size:14px; font-weight:600; color:#1f2937; letter-spacing:-0.02em; }
  .w-meta { font-size:9px; color:#6b7280; font-weight:400; margin-top:2px; }
  .w-badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:8px; font-weight:500; letter-spacing:0.01em; }
  .wb-danger { background:#f5e6e6; color:#7a3b3b; }
  .wb-warn { background:#f5efe0; color:#7a6530; }
  .wb-ok { background:#eef5e0; color:#4a6530; }

  /* Section titles */
  .sec { font-size:9px; font-weight:600; color:#9ca3af; letter-spacing:-0.01em; margin-bottom:10px; margin-top:2px; }

  /* KPI grid */
  .kpi-grid { display:grid; grid-template-columns:repeat(${grPositivas !== false ? 4 : 3},1fr); gap:8px; margin-bottom:16px; }
  .kpi { text-align:center; padding:12px 4px; border:1px solid #eef0f2; border-radius:10px; background:#fff; }
  .kpi-num { font-size:22px; font-weight:600; letter-spacing:-0.04em; line-height:1; }
  .kpi-lbl { font-size:7.5px; font-weight:500; color:#9ca3af; margin-top:4px; }

  /* Secondary KPI row */
  .kpi2-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:16px; }
  .kpi2 { text-align:center; padding:10px 4px; border:1px solid #eef0f2; border-radius:10px; background:#fafbfc; }
  .kpi2-num { font-size:16px; font-weight:600; color:#4a5060; letter-spacing:-0.03em; }
  .kpi2-lbl { font-size:7px; font-weight:500; color:#9ca3af; margin-top:3px; }

  /* AI insight */
  .insight { padding:10px 14px; border-left:2px solid ${cBrand}; background:#fafcf5; border-radius:0 8px 8px 0; font-size:8.5px; line-height:1.65; color:#4b5563; margin-bottom:16px; }

  /* Charts grid */
  .charts { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px; }
  .chart-box { padding:12px 14px; border:1px solid #eef0f2; border-radius:10px; background:#fff; }
  .chart-title { font-size:10px; font-weight:600; color:#2d3340; margin-bottom:10px; letter-spacing:-0.02em; }
  .donut-legend { display:flex; gap:10px; flex-wrap:wrap; margin-top:8px; }
  .dl-item { display:flex; align-items:center; gap:4px; font-size:8px; color:#6b7280; font-weight:500; }
  .dl-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }

  /* Timeline */
  .tl { margin-bottom:16px; }
  .tl-row { display:flex; align-items:flex-start; gap:8px; padding:5px 0; border-bottom:1px solid #f3f4f6; }
  .tl-row:last-child { border-bottom:none; }
  .tl-dt { min-width:56px; font-size:8px; font-weight:500; color:#9ca3af; padding-top:1px; }
  .tl-dot { width:5px; height:5px; border-radius:50%; margin-top:3px; flex-shrink:0; }
  .tl-body { flex:1; min-width:0; }
  .tl-name { font-size:9px; font-weight:600; color:#2d3340; letter-spacing:-0.01em; }
  .tl-txt { font-size:8px; color:#6b7280; margin-top:1px; line-height:1.4; }

  /* Discipline table */
  .disc-wrap { border:1px solid #eef0f2; border-radius:10px; overflow:hidden; margin-bottom:16px; }
  .disc-table { width:100%; border-collapse:collapse; font-size:8.5px; }
  .disc-table th { text-align:left; padding:7px 10px; background:#f9fafb; font-weight:500; color:#6b7280; font-size:7.5px; border-bottom:1px solid #eef0f2; }
  .disc-table td { padding:7px 10px; border-bottom:1px solid #f3f4f6; color:#374151; }
  .disc-table tr:last-child td { border-bottom:none; }
  .disc-badge { display:inline-block; padding:2px 7px; border-radius:20px; font-size:7.5px; font-weight:500; }

  /* Footer */
  .footer { position:absolute; bottom:10mm; left:20mm; right:20mm; display:flex; justify-content:space-between; font-size:7px; color:#b0b8c4; border-top:0.5px solid #e5e7eb; padding-top:8px; }

  /* Definition boxes */
  .def-grid { display:grid; grid-template-columns:1fr; gap:10px; margin-bottom:14px; }
  .def-box { padding:12px 14px; border:1px solid #eef0f2; border-radius:10px; background:#fafbfc; }
  .def-header { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
  .def-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .def-title { font-size:10px; font-weight:600; color:#2d3340; letter-spacing:-0.02em; }
  .def-body { font-size:8px; line-height:1.6; color:#4b5563; }
  .def-legal { font-size:7.5px; color:#9ca3af; font-style:italic; margin-top:4px; line-height:1.5; }
  .def-limits { display:flex; gap:6px; margin-top:6px; flex-wrap:wrap; }
  .def-limit { font-size:7px; padding:2px 7px; border-radius:20px; background:#f0f1f3; color:#6b7280; font-weight:500; }

  .no-break { page-break-inside:avoid; }
  @media print { body { background:#fff; } .page { box-shadow:none; } }
  @media screen { body { background:#e8ecf1; } .page { box-shadow:0 0 6px rgba(0,0,0,0.05); margin:8px auto; } }
</style></head><body>

<!-- PAGE 1 -->
<div class="page">
  <div class="header">
    <img src="${logoGreenUrl}" alt="VN" class="header-logo">
    <div class="header-bar"></div>
    <div class="header-titles">
      <div class="header-title">${isPresentacion ? 'Informe de desempeño' : 'Informe disciplinario'}</div>
      <div class="header-sub">Periodo ${safePeriod}</div>
    </div>
    <div class="header-date">${safeToday}<br>Confidencial</div>
  </div>
  <div class="header-line"></div>

  <div class="worker-card no-break">
    <div>
      <div class="w-name">${safeWorkerName}</div>
      <div class="w-meta">Nº ${safeWorkerNum} · ${safeDeptName}</div>
    </div>
    <span class="w-badge ${sancionesR.length > 0 ? 'wb-danger' : amonestaciones.length > 0 ? 'wb-warn' : 'wb-ok'}">
      ${sancionesR.length > 0 ? 'Sanción activa' : amonestaciones.length > 0 ? 'Seguimiento' : 'Perfil estable'}
    </span>
  </div>

  <div class="sec">Resumen cuantitativo</div>
  <div class="kpi-grid no-break">
    <div class="kpi"><div class="kpi-num" style="color:${cIncidencia};">${soloIncidencias.length}</div><div class="kpi-lbl">Incidencias</div></div>
    <div class="kpi"><div class="kpi-num" style="color:${cAmon};">${amonestaciones.length}</div><div class="kpi-lbl">Amonestaciones</div></div>
    <div class="kpi"><div class="kpi-num" style="color:${cSancion};">${sancionesR.length}</div><div class="kpi-lbl">Sanciones</div></div>
    ${grPositivas !== false ? `<div class="kpi"><div class="kpi-num" style="color:${cPositivo};">${grPos.length}</div><div class="kpi-lbl">Reconocimientos</div></div>` : ''}
  </div>

  <div class="kpi2-grid no-break">
    <div class="kpi2"><div class="kpi2-num">${totalSuspDays}</div><div class="kpi2-lbl">Días de suspensión</div></div>
    <div class="kpi2"><div class="kpi2-num">${totalNegativas + grPos.length}</div><div class="kpi2-lbl">Eventos totales</div></div>
    <div class="kpi2"><div class="kpi2-num">${totalNegativas > 0 ? Math.round((sancionesR.length / totalNegativas) * 100) : 0}%</div><div class="kpi2-lbl">Ratio sancionador</div></div>
  </div>

  ${safeAiInsight ? `<div class="insight no-break">${safeAiInsight}</div>` : ''}

  <div class="sec">Análisis visual</div>
  <div class="charts no-break">
    <div class="chart-box">
      <div class="chart-title">Distribución por tipología</div>
      <div style="display:flex;justify-content:center;padding:4px 0;">${donutSvg}</div>
      <div class="donut-legend">${donutData.map(d => `<span class="dl-item"><span class="dl-dot" style="background:${d.color};"></span>${d.label}: ${d.count}</span>`).join('')}</div>
    </div>
    <div class="chart-box">
      <div class="chart-title">Categorías recurrentes</div>
      <div style="padding-top:6px;">${catBarsHtml || '<div style="font-size:8px;color:#9ca3af;text-align:center;padding:16px;">Sin datos</div>'}</div>
    </div>
  </div>

  <div class="charts no-break">
    <div class="chart-box">
      <div class="chart-title">Gravedad de medidas</div>
      <div style="padding-top:6px;">${gravBarsHtml || '<div style="font-size:8px;color:#9ca3af;text-align:center;padding:16px;">Sin datos</div>'}</div>
    </div>
    <div class="chart-box">
      <div class="chart-title">Evolución mensual</div>
      ${sortedMonths2.length > 1 ? `<svg viewBox="0 0 ${evoChartW2} ${evoChartH2}" width="100%" height="${evoChartH2}" style="max-width:100%;">
        <line x1="10" y1="${evoChartH2 - 22}" x2="${evoChartW2 - 10}" y2="${evoChartH2 - 22}" stroke="#e5e7eb" stroke-width="0.5"/>
        ${evoBars}
      </svg>` : '<div style="font-size:8px;color:#9ca3af;text-align:center;padding:16px;">Periodo insuficiente</div>'}
    </div>
  </div>

  <div class="footer">
    <span>VerdNatura Levante S.L. · Carrer Fenollar 2, 46680 Algemesí</span>
    <span>Página 1 de ${totalPages}</span>
  </div>
</div>

<!-- PAGE 2: Marco conceptual y definiciones -->
<div class="page">
  <div class="header">
    <img src="${logoGreenUrl}" alt="VN" class="header-logo">
    <div class="header-bar"></div>
    <div class="header-titles">
      <div class="header-title">Marco conceptual</div>
      <div class="header-sub">Definiciones y clasificación según convenio colectivo</div>
    </div>
    <div class="header-date">${safeToday}</div>
  </div>
  <div class="header-line"></div>

  <div class="sec">Clasificación de registros</div>
  <p style="font-size:8px;color:#6b7280;line-height:1.6;margin-bottom:14px;">El presente informe utiliza tres categorías diferenciadas para clasificar los eventos registrados en el expediente del trabajador. Esta clasificación responde tanto a criterios internos de gestión de VerdNatura como al marco legal vigente del convenio colectivo del sector y al Estatuto de los Trabajadores.</p>

  <div class="def-grid">
    <div class="def-box no-break">
      <div class="def-header">
        <div class="def-dot" style="background:${cIncidencia};"></div>
        <div class="def-title">Incidencia (registro interno)</div>
      </div>
      <div class="def-body">Registro interno de un evento o conducta relevante que no conlleva, por sí mismo, ninguna consecuencia disciplinaria formal. Se trata de una anotación a efectos de seguimiento y trazabilidad. Las incidencias sirven como sistema de alerta temprana: permiten detectar patrones de comportamiento antes de que se materialicen en faltas sancionables. No se comunican al trabajador ni generan derechos de alegación.</div>
      <div class="def-legal">Naturaleza: registro de gestión interna sin base sancionadora. No contemplado como medida disciplinaria en el convenio.</div>
    </div>

    <div class="def-box no-break">
      <div class="def-header">
        <div class="def-dot" style="background:${cAmon};"></div>
        <div class="def-title">Amonestación</div>
      </div>
      <div class="def-body">Medida disciplinaria formal que constituye una advertencia escrita al trabajador por una falta cometida. La amonestación queda registrada en el expediente y debe ser comunicada por escrito, incluyendo los hechos, la fecha y la calificación de la falta. El trabajador tiene derecho a formular alegaciones. Según el convenio colectivo (Art. 49), las faltas leves pueden sancionarse con amonestación verbal o escrita. Las faltas graves también pueden conllevar amonestación además de suspensión de empleo y sueldo.</div>
      <div class="def-legal">Base legal: Arts. 49-51 del Convenio Colectivo de Flores y Plantas. Art. 58 del Estatuto de los Trabajadores.</div>
    </div>

    <div class="def-box no-break">
      <div class="def-header">
        <div class="def-dot" style="background:${cSancion};"></div>
        <div class="def-title">Sanción</div>
      </div>
      <div class="def-body">Medida disciplinaria de mayor entidad que puede implicar la suspensión de empleo y sueldo durante un período determinado. Se aplica ante faltas graves o muy graves, siempre mediante comunicación escrita motivada y con derecho a alegaciones del trabajador. La graduación de la sanción debe respetar los límites establecidos por el convenio colectivo.</div>
      <div class="def-legal">Base legal: Arts. 49-51 del Convenio Colectivo. Arts. 58 y 60 del Estatuto de los Trabajadores.</div>
      <div class="def-limits">
        <span class="def-limit">Leve: 0–2 días</span>
        <span class="def-limit">Grave: 3–14 días</span>
        <span class="def-limit">Muy grave: 14–30 días</span>
      </div>
    </div>

    ${grPositivas !== false ? `
    <div class="def-box no-break">
      <div class="def-header">
        <div class="def-dot" style="background:${cPositivo};"></div>
        <div class="def-title">Reconocimiento positivo</div>
      </div>
      <div class="def-body">Registro de una conducta, actitud o acción meritoria del trabajador que la empresa desea destacar positivamente. Los reconocimientos forman parte del sistema de gestión del desempeño y sirven para equilibrar la visión del expediente, reflejando también las contribuciones positivas del trabajador. No tienen carácter normativo ni convencional.</div>
      <div class="def-legal">Naturaleza: registro de gestión del desempeño. Criterio interno de VerdNatura.</div>
    </div>` : ''}
  </div>

  <div class="sec">Niveles de gravedad</div>
  <div class="disc-wrap no-break">
    <table class="disc-table">
      <thead><tr><th>Gravedad</th><th>Descripción</th><th>Prescripción</th><th>Suspensión máxima</th></tr></thead>
      <tbody>
        <tr><td style="font-weight:600;">Leve</td><td>Faltas menores de puntualidad, descuidos leves en las obligaciones laborales</td><td>10 días</td><td>2 días</td></tr>
        <tr><td style="font-weight:600;">Grave</td><td>Reincidencia en faltas leves, ausencias injustificadas, incumplimientos relevantes</td><td>20 días</td><td>14 días</td></tr>
        <tr><td style="font-weight:600;">Muy grave</td><td>Conductas de especial gravedad, fraude, acoso, embriaguez habitual, violación de buena fe contractual</td><td>60 días</td><td>30 días o despido</td></tr>
      </tbody>
    </table>
  </div>

  <p style="font-size:7.5px;color:#9ca3af;line-height:1.5;margin-top:8px;">Los plazos de prescripción se computan desde que la empresa tiene conocimiento de la falta (Art. 60.2 ET). La empresa podrá aplicar las sanciones que considere procedentes de acuerdo con la graduación de las faltas y conforme a lo establecido en el convenio colectivo aplicable.</p>

  <div class="footer">
    <span>VerdNatura Levante S.L. · Carrer Fenollar 2, 46680 Algemesí</span>
    <span>Página 2 de ${totalPages}</span>
  </div>
</div>

${(tlItems.length > 0 || discRows.length > 0) ? `
<!-- PAGE 3: Cronología y detalle -->
<div class="page">
  <div class="header">
    <img src="${logoGreenUrl}" alt="VN" class="header-logo">
    <div class="header-bar"></div>
    <div class="header-titles">
      <div class="header-title">${safeWorkerName}</div>
      <div class="header-sub">Nº ${safeWorkerNum} · ${safeDeptName}</div>
    </div>
    <div class="header-date">${safeToday}</div>
  </div>
  <div class="header-line"></div>

  ${tlItems.length > 0 ? `
  <div class="sec">Cronología detallada</div>
  <div class="tl no-break">
    ${tlItems.slice(0, 14).map(item => `
      <div class="tl-row">
        <span class="tl-dt">${item.date || '—'}</span>
        <span class="tl-dot" style="background:${item.color};"></span>
        <div class="tl-body">
          <div class="tl-name">${item.label}</div>
          ${item.desc ? `<div class="tl-txt">${item.desc}</div>` : ''}
        </div>
      </div>`).join('')}
  </div>` : ''}

  ${discRows.length > 0 ? `
  <div class="sec">Detalle de medidas disciplinarias</div>
  <div class="disc-wrap no-break">
    <table class="disc-table">
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Gravedad</th><th>Categoría</th><th>Susp.</th></tr></thead>
      <tbody>
        ${discRows.map((p: any) => `<tr>
          <td>${(p.fecha_evento || p.created_at || '').slice(0, 10)}</td>
          <td><span class="disc-badge" style="background:${p._tcolor}18;color:${p._tcolor};">${p._tipo}</span></td>
          <td>${p.gravedad || '—'}</td>
          <td>${p.incidencias_categories?.name || p.custom_category_name || '—'}</td>
          <td>${p.suspension_dias ? p.suspension_dias + 'd' : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <div class="footer">
    <span>VerdNatura Levante S.L. · Carrer Fenollar 2, 46680 Algemesí</span>
    <span>Página ${totalPages} de ${totalPages}</span>
  </div>
</div>` : ''}

</body></html>`;

        return okResponse({
          html: htmlContent,
          stats: {
            incidencias: soloIncidencias.length,
            amonestaciones: amonestaciones.length,
            sanciones: sancionesR.length,
            positivas: grPos.length,
          },
        });
      }

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (err) {
    console.error('incidencias-operations error:', err);
    return errorResponse('Internal server error');
  }
});

// ── Auto-generate email draft V2 (subject+body+HTML) for a proposal ────────────────────
async function generateProposalDraft(
  supabase: ReturnType<typeof createClient>,
  propuesta: any,
  record: any,
  workers: Array<{ worker_id: string; worker_name: string; worker_number?: string }>,
  aiData: any,
) {
  try {
    const { data: freshProposal, error: freshProposalError } = await supabase
      .from('incidencias_propuestas_rrhh')
      .select('*')
      .eq('id', propuesta.id)
      .single();

    if (freshProposalError) {
      console.error('[autoGenerateEmailDraft] Failed to reload proposal before generating draft:', freshProposalError);
      return;
    }

    const effectiveProposal = freshProposal || propuesta;

    if ((effectiveProposal as any).tipo !== 'nspp' && !(effectiveProposal as any).ai_analysis) {
      console.warn(`[autoGenerateEmailDraft] Skipping draft for proposal ${propuesta.id}: ai_analysis is not persisted`);
      return;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { data: dept } = await supabase
      .from('incidencias_departments')
      .select('name')
      .eq('id', effectiveProposal.department_id)
      .single();

    const workerNames = workers.map(w => w.worker_name).join(', ');
    const workerNumber = (workers[0] as any)?.worker_number || '';
    const workerNamesWithNumbers = workers.length > 1
      ? workers.map((w: any) => `${w.worker_name} (${w.worker_number || ''})`).join(', ').replace(/, ([^,]+)$/, ' y $1')
      : `${workers[0]?.worker_name || ''} (${(workers[0] as any)?.worker_number || ''})`;
    const workerIds = workers.map(w => w.worker_id).filter(Boolean);

    // Classify file types from pruebas
    const pruebas = Array.isArray(record.pruebas_urls) ? record.pruebas_urls : [];
    const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)$/i;
    const VIDEO_EXT = /\.(mp4|mov|avi|webm|mkv|3gp)$/i;
    const imagePaths = pruebas.filter((p: string) => typeof p === 'string' && IMAGE_EXT.test(p.split('?')[0])).slice(0, 10);
    const videoPaths = pruebas.filter((p: string) => typeof p === 'string' && VIDEO_EXT.test(p.split('?')[0])).slice(0, 3);
    const otherCount = pruebas.filter((p: string) => typeof p === 'string' && !IMAGE_EXT.test(p.split('?')[0]) && !VIDEO_EXT.test(p.split('?')[0])).length;

    // Sign image URLs for AI analysis
    const cleanPath = (p: string) => {
      const m = p.match(/incidencias-pruebas\/([^?]+)/);
      return m ? decodeURIComponent(m[1]) : p;
    };
    const signedImageUrls: string[] = [];
    const signedVideoUrls: string[] = [];
    if (imagePaths.length > 0) {
      const { data: signed } = await supabase.storage.from('incidencias-pruebas').createSignedUrls(imagePaths.map(cleanPath), 3600);
      if (signed) signedImageUrls.push(...signed.filter((s: any) => s.signedUrl).map((s: any) => s.signedUrl));
    }
    if (videoPaths.length > 0) {
      const { data: signed } = await supabase.storage.from('incidencias-pruebas').createSignedUrls(videoPaths.map(cleanPath), 3600);
      if (signed) signedVideoUrls.push(...signed.filter((s: any) => s.signedUrl).map((s: any) => s.signedUrl));
    }

    const isAmonestacion = effectiveProposal.tipo === 'amonestacion';
    const recSuspension = record.propuesta_suspension || false;
    const recFechaInicio = record.propuesta_fecha_inicio || null;

    const draftRes = await fetch(`${supabaseUrl}/functions/v1/control-incidencias-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        action: 'generar_borrador_sancion',
        trabajador_nombre: workerNames,
        trabajador_numero: workerNumber,
        gravedad: isAmonestacion ? null : effectiveProposal.gravedad,
        sancion: effectiveProposal.tipo,
        dias_suspension: isAmonestacion ? null : effectiveProposal.suspension_dias,
        descripcion_hechos: record.descripcion || 'Sin descripción',
        articulos_referencia: aiData?.articulos_relevantes || record.ai_articulos_relevantes || [],
        fecha_hechos: new Date(record.fecha).toLocaleDateString('es-ES'),
        departamento: dept?.name || '',
        encargado_nombre: record.created_by_name || '',
        propuesta_suspension: recSuspension,
        propuesta_fecha_inicio: recFechaInicio,
        worker_ids: workerIds,
        exclude_record_id: record.id,
        tiene_pruebas: pruebas.length > 0,
        num_fotos: imagePaths.length,
        num_videos: videoPaths.length,
        num_otros_archivos: otherCount,
        imagen_urls: signedImageUrls,
        video_urls: signedVideoUrls,
      }),
    });

    if (!draftRes.ok) {
      console.error('Auto draft generation failed:', await draftRes.text());
      return;
    }

    const draftData = await draftRes.json();

    // Save V2 editable fields (subject + body)
    const tipoLabel = effectiveProposal.tipo === 'sancion' ? 'Sanción' : effectiveProposal.tipo === 'amonestacion' ? 'Amonestación' : effectiveProposal.tipo;
    const subject = draftData.asunto || `${tipoLabel} - ${workerNamesWithNumbers}`;
    const bodyText = draftData.cuerpo || '';

    // Also build HTML email for sending
    const persistentDraftUrls = await getPersistentIncidenciaAttachmentUrls(
      supabase,
      effectiveProposal.id,
      pruebas.filter((p: string) => typeof p === 'string'),
      'https://vnprod.app',
    );
    const pruebasHtml = pruebas.length > 0
      ? `<div style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
          <p style="margin:0 0 8px;font-weight:600;font-size:13px;color:#475569;">Pruebas adjuntas (${pruebas.length})</p>
          ${persistentDraftUrls.map((url: string, i: number) => `<a href="${url}" target="_blank" style="display:inline-block;background:#64748b;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;text-decoration:none;margin:0 4px 4px 0;">Prueba ${i + 1} ↗</a>`).join('')}
        </div>` : '';

    const workerBadgesDraft = workers.map(w => {
      const wNum = (w as any).worker_number;
      const salixUrl = wNum ? `https://salix.verdnatura.es/#/worker/${wNum}/time-control` : '';
      return salixUrl
        ? `<a href="${salixUrl}" target="_blank" style="display:inline-block;background:#7bc600;color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;text-decoration:none;margin:0 4px 4px 0;">${w.worker_name}${wNum ? ` (${wNum})` : ''} ↗</a>`
        : `<span style="display:inline-block;background:#7bc600;color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;margin:0 4px 4px 0;">${w.worker_name}</span>`;
    }).join('');

    const fechaDraftRaw = new Date(record.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const fechaDraft = fechaDraftRaw.charAt(0).toUpperCase() + fechaDraftRaw.slice(1);
    const gravLabel = effectiveProposal.gravedad === 'muy_grave' ? 'Muy grave' : effectiveProposal.gravedad === 'grave' ? 'Grave' : 'Leve';
    const gravColor = effectiveProposal.gravedad === 'muy_grave' ? '#dc2626' : effectiveProposal.gravedad === 'grave' ? '#f59e0b' : '#93d600';
    const deptName = dept?.name || '';
    const logoUrl = 'https://vnprod.app/images/logo-white.png';

    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Poppins','Segoe UI',Arial,sans-serif;letter-spacing:-0.01em;">
<div style="max-width:620px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg, #7bc600, #93d600);border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <img src="${logoUrl}" alt="Verdnatura" width="56" height="56" style="width:56px;height:56px;margin-bottom:12px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;font-family:'Poppins','Segoe UI',sans-serif;">${subject}</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">Borrador generado por IA · Control de Incidencias</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;border-radius:0 0 16px 16px;">
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#7bc600;text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Trabajador/es</p>
      ${workerBadgesDraft}
    </div>
    <div style="line-height:1.75;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;white-space:pre-wrap;letter-spacing:-0.01em;">${bodyText}</div>
    ${draftData.referencias_legales?.length ? `<div style="margin-top:20px;padding:14px 16px;background:#f0f9e8;border-radius:12px;border-left:4px solid #93d600;">
      <p style="margin:0 0 4px;font-weight:600;font-size:13px;color:#365314;font-family:'Poppins','Segoe UI',sans-serif;">Referencias legales</p>
      <p style="margin:0;font-size:13px;color:#4d7c0f;font-family:'Poppins','Segoe UI',sans-serif;">${(draftData.referencias_legales || []).join(', ')}</p>
    </div>` : ''}
    ${pruebasHtml}
    ${draftData.advertencias?.length ? `<div style="margin-top:16px;padding:14px 16px;background:#fef3c7;border-radius:12px;border-left:4px solid #f59e0b;">
      <p style="margin:0 0 4px;font-weight:600;font-size:13px;color:#92400e;font-family:'Poppins','Segoe UI',sans-serif;">Notas para RRHH</p>
      <ul style="margin:0;padding-left:16px;font-size:13px;color:#a16207;">${(draftData.advertencias || []).map((a: string) => `<li>${a}</li>`).join('')}</ul>
    </div>` : ''}
    <div style="margin-top:28px;line-height:1.75;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">
      <p style="margin:0;">Muchas gracias y un saludo,</p>
    </div>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:4px 4px;">
        <tr>
          <td><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:6px 14px;border-radius:8px;font-size:12px;font-family:'Poppins','Segoe UI',sans-serif;">${fechaDraft}</span></td>
          <td><span style="display:inline-block;background:${gravColor}18;color:${gravColor};padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;">${tipoLabel} · ${gravLabel}</span></td>
          ${deptName ? `<td><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:6px 14px;border-radius:8px;font-size:12px;font-family:'Poppins','Segoe UI',sans-serif;">${deptName}</span></td>` : ''}
        </tr>
      </table>
    </div>
    <div style="margin-top:24px;padding-top:0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:8px;">
        <tr>
          <td style="width:3px;background:#93d600;border-radius:2px;"></td>
          <td style="padding-left:10px;"><span style="font-size:11px;font-weight:600;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;">Enviado desde Control de Incidencias · Verdnatura</span></td>
        </tr>
      </table>
      <p style="margin:0;font-size:11px;color:#94a3b8;font-family:'Poppins','Segoe UI',sans-serif;">${(() => { const d = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return d.charAt(0).toUpperCase() + d.slice(1); })()} · ${draftData.resumen_ejecutivo || ''}</p>
    </div>
  </div>
</body></html>`;

    // Update proposal with all draft data at once
    const updateFields: any = {
      email_subject: subject,
      email_body: bodyText,
      email_html: emailHtml,
      ai_borrador_generado: true,
    };
    if (draftData.dias_suspension_propuestos != null && draftData.dias_suspension_propuestos > 0 && !effectiveProposal.suspension_dias) {
      updateFields.suspension_dias = draftData.dias_suspension_propuestos;
    }
    await supabase.from('incidencias_propuestas_rrhh').update(updateFields).eq('id', effectiveProposal.id);
    console.log(`[autoGenerateEmailDraft] Draft generated for proposal ${effectiveProposal.id}`);
  } catch (err) {
    console.error('Auto draft generation failed (non-critical):', err);
  }
}

// ── MIME and size validation constants ──────────────────
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
  // Videos
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/3gpp', 'video/x-msvideo',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
]);
const MAX_IMAGE_SIZE = 50 * 1024 * 1024;   // 50MB (already compressed client-side)
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;  // 500MB (compressed client-side via ffmpeg.wasm)
const MAX_DOC_SIZE = 50 * 1024 * 1024;     // 50MB documents

// ── File upload handler ──────────────────────────────────
async function handleFileUpload(req: Request, supabase: ReturnType<typeof createClient>) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const sessionToken = formData.get('sessionToken') as string;
    const action = formData.get('action') as string;
    const propuestaId = formData.get('propuestaId') as string;
    const disableManagerPath = (formData.get('disableManagerPath') as string) || '';

    if (!sessionToken) return errorResponse('Session token required');
    if (!file) return errorResponse('No file provided');

    // MIME type validation — allow generic application/octet-stream as a fallback
    // (some browsers send this for less-common video containers like .mkv).
    const mime = file.type || 'application/octet-stream';
    const isVideo = mime.startsWith('video/');
    const isImage = mime.startsWith('image/');
    const isAllowedMime = ALLOWED_MIME_TYPES.has(mime) || mime === 'application/octet-stream';
    if (!isAllowedMime) {
      return errorResponse(`Tipo de archivo no permitido: ${mime}`);
    }

    // Size validation
    const maxSize = isVideo ? MAX_VIDEO_SIZE : isImage ? MAX_IMAGE_SIZE : MAX_DOC_SIZE;
    if (file.size > maxSize) {
      const maxMB = Math.round(maxSize / (1024 * 1024));
      return errorResponse(`Archivo demasiado grande (${Math.round(file.size / (1024 * 1024))}MB). Máximo: ${maxMB}MB`);
    }

    const { data: session } = await supabase
      .from('manager_sessions')
      .select('manager_id, expires_at')
      .eq('token', sessionToken)
      .single();
    if (!session || new Date(session.expires_at) < new Date()) {
      return errorResponse('Invalid or expired session');
    }

    // === Admin proposal image upload ===
    if (action === 'addAdminProposalImage' && propuestaId) {
      // Validate admin role
      const { data: mgr } = await supabase.from('managers').select('role').eq('id', session.manager_id).single();
      if (!mgr || mgr.role !== 'admin') return errorResponse('Admin only');

      const ext = file.name.split('.').pop() || 'bin';
      const path = `admin-adicionales/${propuestaId}/${crypto.randomUUID()}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from('incidencias-pruebas')
        .upload(path, arrayBuffer, { contentType: mime, upsert: false });
      if (uploadError) return errorResponse('Upload failed: ' + uploadError.message);

      // Update admin_pruebas_urls on the proposal
      const { data: propuesta } = await supabase
        .from('incidencias_propuestas_rrhh')
        .select('admin_pruebas_urls, disabled_manager_pruebas')
        .eq('id', propuestaId)
        .single();

      const currentUrls: string[] = Array.isArray((propuesta as any)?.admin_pruebas_urls) ? (propuesta as any).admin_pruebas_urls : [];
      currentUrls.push(path);

      const updatePayload: Record<string, unknown> = { admin_pruebas_urls: currentUrls };

      // If we are also disabling a manager evidence path (because admin re-cropped it),
      // append it to disabled_manager_pruebas so the AI ignores the original.
      let disabledList: string[] = Array.isArray((propuesta as any)?.disabled_manager_pruebas) ? (propuesta as any).disabled_manager_pruebas : [];
      if (disableManagerPath) {
        if (!disabledList.includes(disableManagerPath)) {
          disabledList = [...disabledList, disableManagerPath];
          updatePayload.disabled_manager_pruebas = disabledList;
        }
      }

      await supabase.from('incidencias_propuestas_rrhh').update(updatePayload).eq('id', propuestaId);

      // Return signed URL for immediate display
      const { data: urlData } = await supabase.storage.from('incidencias-pruebas').createSignedUrl(path, 3600);
      return okResponse({
        path,
        signedUrl: urlData?.signedUrl || '',
        admin_pruebas_urls: currentUrls,
        disabled_manager_pruebas: disabledList,
      });
    }

    // === Default upload (encargado evidence) ===
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${crypto.randomUUID()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('incidencias-pruebas')
      .upload(path, arrayBuffer, { contentType: mime, upsert: false });

    if (uploadError) return errorResponse('Upload failed: ' + uploadError.message);

    const { data: urlData } = await supabase.storage.from('incidencias-pruebas').createSignedUrl(path, 60 * 5);
    return okResponse({ url: urlData?.signedUrl || '', path });
  } catch (err) {
    console.error('Upload error:', err);
    return errorResponse('Upload failed');
  }
}

// ── Shared legal document HTML builder ──────────────────────────────────────
/**
 * Render an admin-saved manual collage layout to HTML, mirroring exactly what
 * `renderCollageLayoutToHtml` produces in the browser. Coordinates are
 * fractions of an A4 content card (aspect 794/1000).
 *
 * Resolves storage paths to long-lived signed URLs.
 */
async function buildManualCollageHtml(
  supabase: ReturnType<typeof createClient>,
  layout: any,
): Promise<string> {
  if (!layout || !Array.isArray(layout.frames) || layout.frames.length === 0) return '';
  const paths: string[] = layout.frames
    .map((f: any) => String(f?.path || ''))
    .filter(Boolean);
  if (paths.length === 0) return '';
  const urlByPath: Record<string, string> = {};
  try {
    const { data: signed } = await supabase.storage
      .from('incidencias-pruebas')
      .createSignedUrls(paths, 31536000);
    for (let i = 0; i < (signed || []).length; i++) {
      const item = (signed || [])[i];
      if (item?.signedUrl) urlByPath[paths[i]] = item.signedUrl;
    }
  } catch (e) {
    console.warn('[buildManualCollageHtml] failed to sign urls', e);
  }
  const escAttr = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const CARD_ASPECT = (794 / 1000).toFixed(4);
  const framesHtml = layout.frames.map((f: any) => {
    const url = urlByPath[String(f.path || '')] || '';
    if (!url) return '';
    const x = (Number(f.x) || 0) * 100;
    const y = (Number(f.y) || 0) * 100;
    const w = (Number(f.w) || 0) * 100;
    const h = (Number(f.h) || 0) * 100;
    const scale = Number(f.scale) || 1;
    const flipH = f.flipH ? -1 : 1;
    const flipV = f.flipV ? -1 : 1;
    const opx = ((Number(f.objectPositionX) ?? 0.5) * 100).toFixed(1);
    const opy = ((Number(f.objectPositionY) ?? 0.5) * 100).toFixed(1);
    const caption = escAttr(String(f.caption || ''));
    return `<figure data-frame-id="${escAttr(f.id || '')}" style="position:absolute;left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;width:${w.toFixed(2)}%;height:${h.toFixed(2)}%;margin:0;background:#fff;border:1px solid #ececec;border-radius:6px;overflow:hidden;page-break-inside:avoid">
<div style="position:absolute;left:0;right:0;top:0;bottom:22px;overflow:hidden;background:#f4f4f5">
<img src="${url}" alt="" class="evidence-image" style="width:100%;height:100%;object-fit:cover;object-position:${opx}% ${opy}%;transform:scale(${scale}) scaleX(${flipH}) scaleY(${flipV});transform-origin:center center;display:block" />
</div>
<figcaption style="position:absolute;left:0;right:0;bottom:0;height:22px;padding:0 8px;display:flex;align-items:center;font-size:10px;color:#555;font-weight:300;background:#fff;border-top:1px solid #f0f0f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${caption}</figcaption>
</figure>`;
  }).filter(Boolean).join('\n');
  if (!framesHtml) return '';
  return `<section class="evidencias-graficas custom-collage" data-collage="manual" style="margin:18px 0;page-break-inside:auto">
<h2 style="font-size:13px;font-weight:600;margin:0 0 10px 0;letter-spacing:-0.01em">Evidencias gráficas</h2>
<div class="collage-canvas" style="position:relative;width:100%;aspect-ratio:${CARD_ASPECT};background:#fff;border:1px solid #ececec;border-radius:8px;padding:0">
${framesHtml}
</div>
</section>`;
}

function buildLegalDocumentHtml(params: {
  workerName: string;
  workerNumber: string;
  deptName: string;
  gravedad: string;
  tipo: string;
  propuestaId: string;
  documentCode: string;
  aiContent: any;
  imagesBySection: Record<string, Array<{ url: string; descripcion: string; aspectRatio?: number; layout?: string }>>;
  suspensionDias?: number;
  suspensionFechas?: string[] | null;
  fechaInicio?: string;
  modificationBlockHtml?: string;
  descripcionHechos?: string;
  fechaHechos?: string;
  categoria?: string;
  aiMotivoLegal?: string;
  articulosBase?: string[];
  workerFiscalId?: string;
  sinSuspensionExplicita?: boolean;
  manualCollageHtml?: string;
}): string {
  const { workerName, workerNumber, deptName, gravedad, tipo, documentCode, aiContent: rawAiContent, imagesBySection, suspensionDias: rawSuspensionDias, suspensionFechas: rawSuspensionFechas, fechaInicio: rawFechaInicio, modificationBlockHtml, descripcionHechos, fechaHechos, categoria, aiMotivoLegal, articulosBase, workerFiscalId, sinSuspensionExplicita, manualCollageHtml } = params;

  // When clemency is active, force suspensionDias=0 and drop fechaInicio so the
  // fallback content + HTML pipeline never render any suspension language.
  const suspensionDias = sinSuspensionExplicita ? 0 : rawSuspensionDias;
  const fechaInicio = sinSuspensionExplicita ? undefined : rawFechaInicio;
  const suspensionFechas = sinSuspensionExplicita ? null : (rawSuspensionFechas || null);

  // Capa de coherencia: limpiamos cualquier contradicción antes de renderizar.
  const aiContent = enforceLegalDocumentConsistency(rawAiContent, { tipo, gravedad, suspensionDias, sinSuspensionExplicita });

  const fechaEmision = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  const gravedadLabel = gravedad === 'muy_grave' ? 'MUY GRAVE' : gravedad === 'grave' ? 'GRAVE' : 'LEVE';
  const tipoLabel = tipo === 'amonestacion' ? 'AMONESTACIÓN' : `SANCIÓN ${gravedadLabel}`;
  const logoUrl = LEGAL_DOCUMENT_LOGO_URL;
  const firmaUrl = LEGAL_DOCUMENT_SIGNATURE_URL;
  const fb = buildFallbackLegalContent({ workerName, workerNumber, deptName, gravedad, tipo, descripcionHechos, fechaHechos, categoria, aiMotivoLegal, articulosBase, suspensionDias, fechaInicio, workerFiscalId });
  const rExpoBase = hasMinimumText(aiContent?.exposicion_hechos, 80) ? aiContent.exposicion_hechos : fb.exposicionHechos;
  let rExpo = ensureHighlightedFactsTimestamp(rExpoBase, fechaHechos);
  let rFund = hasMinimumText(aiContent?.fundamentacion_juridica, 60) ? aiContent.fundamentacion_juridica : fb.fundamentacionJuridica;
  let rCalif = hasMinimumText(aiContent?.calificacion_falta, 30) ? aiContent.calificacion_falta : fb.calificacionFalta;
  let rMedida = hasMinimumText(aiContent?.medida_disciplinaria, 30) ? aiContent.medida_disciplinaria : fb.medidaDisciplinaria;

  // CRÍTICO: forzar el número real de días y las fechas reales en cualquier
  // texto generado por IA. La IA tiende a "redondear" al mínimo legal del
  // convenio (p.ej. 14 días para muy grave) ignorando lo que el admin eligió.
  const enforceOpts = { suspensionDias, fechaInicio, suspensionFechas };
  rMedida = enforceSuspensionDaysInText(rMedida, enforceOpts);
  rCalif = enforceSuspensionDaysInText(rCalif, enforceOpts);
  rExpo = enforceSuspensionDaysInText(rExpo, enforceOpts);
  rFund = enforceSuspensionDaysInText(rFund, enforceOpts);

  // Parser determinista de retrasos: inyecta totales en la calificación de la
  // falta y genera un mapa semana→leyenda para reforzar las imágenes (abajo).
  const tardinessEntries = parseTardinessFromDescription(descripcionHechos);
  const tardinessWeeks = tardinessEntries.length > 0 ? groupTardinessByWeek(tardinessEntries) : [];
  if (tardinessEntries.length >= 2) {
    rCalif = appendTardinessSummaryToCalificacion(rCalif, tardinessEntries);
  }

  // Refuerzo universal de semibold en medida disciplinaria (todas las sanciones
  // y amonestaciones, no solo impuntualidad).
  rMedida = reinforceMedidaDisciplinariaSemibold(rMedida, { tipo, suspensionDias, fechaInicio });

  // Reescribe las leyendas de evidencias gráficas para impuntualidad: si la
  // IA devolvió leyendas genéricas y tenemos N capturas, asignamos la semana
  // correspondiente desde el parser. Capitaliza siempre la primera letra del
  // subtítulo.
  for (const sectionKey of Object.keys(imagesBySection)) {
    const imgs = imagesBySection[sectionKey];
    for (let i = 0; i < imgs.length; i++) {
      const current = imgs[i];
      const desc = String(current.descripcion || '');
      const isGenericTardiness = /Captura semanal de fichajes\s*\d/i.test(desc)
        || /Evidencia (gr[áa]fica|fotogr[áa]fica)/i.test(desc);
      if (isGenericTardiness && tardinessWeeks[i]) {
        imgs[i] = {
          ...current,
          descripcion: buildWeekCaption(tardinessWeeks[i]),
          layout: current.layout || 'fila_grande',
        };
      } else {
        imgs[i] = { ...current, descripcion: capitalizeCaptionSubtitle(desc) };
      }
    }
  }
  // advertencias_legales eliminado: la sección ya no se renderiza
  const rArtsRaw = Array.isArray(aiContent?.articulos_citados) && aiContent.articulos_citados.length > 0
    ? aiContent.articulos_citados
    : fb.articulosCitados;
  const rArts = compactArticulosCitados(rArtsRaw);

  // When the admin saved a manual collage layout, the auto-built collage is
  // fully bypassed: we emit the manual block exactly once (after the
  // "Exposición de hechos" section) and skip the per-section auto blocks.
  const useManualCollage = !!(manualCollageHtml && manualCollageHtml.trim());
  let manualCollageEmitted = false;
  function buildImagesHtml(
    images: Array<{ url: string; descripcion: string; aspectRatio?: number; layout?: string }>,
    options: { mode?: 'block' | 'sidebar' | 'row' } = {},
  ): string {
    if (useManualCollage) {
      if (manualCollageEmitted) return '';
      manualCollageEmitted = true;
      return manualCollageHtml as string;
    }
    if (!images || images.length === 0) return '';
    // Auto-detect "row" mode only for a single explicit large image. With 2+
    // screenshots we always compose a compact collage, otherwise each mobile
    // capture becomes a giant one-per-page block.
    const autoRow = images.some(img => img.layout === 'fila_grande');
    const mode = options.mode === 'sidebar' ? 'sidebar'
      : ((options.mode === 'row' || autoRow) && images.length === 1) ? 'row'
      : 'block';

    // Sidebar mode: a single vertical image rendered as a floating <aside> so
    // the next section's prose can wrap to its right and avoid leaving half a
    // page in white. Sober styling (no grid, no gray panel) because it lives
    // beside body text.
    if (mode === 'sidebar' && images.length === 1) {
      const img = images[0];
      const rawDesc = String(img.descripcion || '').trim();
      const titleMatch = rawDesc.match(/^<strong>([\s\S]*?)<\/strong>\s*[:.\-—]?\s*([\s\S]*)$/i);
      const titleHtml = titleMatch ? titleMatch[1].trim() : '';
      const subtitleHtml = titleMatch ? titleMatch[2].trim() : rawDesc;
      const captionHtml = titleHtml
        ? `<div style="font-size:11px;font-weight:600;color:#333;margin-bottom:3px;letter-spacing:-0.01em">${titleHtml}</div>${subtitleHtml ? `<div style="font-size:12.5px;color:#666;font-weight:300;line-height:1.55">${subtitleHtml}</div>` : ''}`
        : `<div style="font-size:12.5px;color:#666;font-weight:300;line-height:1.55">${subtitleHtml}</div>`;
      return `<aside class="evidence-aside">
<div class="evidence-aside-label">Evidencias gráficas</div>
<figure class="evidence-aside-figure">
<div class="evidence-aside-frame"><img src="${img.url}" alt="Evidencia" class="evidence-image" /></div>
<figcaption>${captionHtml}</figcaption>
</figure>
</aside>`;
    }

    // Row mode: una imagen por fila perfectamente integrada en su tarjeta:
    // sin padding interior, con esquinas superiores redondeadas reales y
    // recorte cover para que llene el marco. Pensado para capturas semanales
    // de fichajes donde el detalle es crítico y la presentación debe ser
    // editorial (no “screenshot dentro de un recuadro”).
    if (mode === 'row') {
      return `<div style="margin:22px 0;padding:18px 20px 20px;background:#fafafa;border:1px solid #ececec;border-radius:12px;page-break-inside:auto">
<p style="font-size:10px;font-weight:600;color:#888;margin:0 0 14px 0;text-transform:uppercase;letter-spacing:0.08em;font-family:'Poppins',sans-serif">Evidencias gráficas</p>
<div style="display:flex;flex-direction:column;gap:18px">
${images.map(img => {
  const rawDesc = String(img.descripcion || '').trim();
  const titleMatch = rawDesc.match(/^<strong>([\s\S]*?)<\/strong>\s*[:.\-—]?\s*([\s\S]*)$/i);
  const titleHtml = titleMatch ? titleMatch[1].trim() : '';
  const subtitleRaw = titleMatch ? titleMatch[2].trim() : rawDesc;
  const subtitleHtml = subtitleRaw.replace(/^([a-záéíóúñ])/u, (c) => c.toUpperCase());
  const captionHtml = titleHtml
    ? `<div style="font-size:12px;font-weight:600;color:#1a1a1a;margin-bottom:3px;letter-spacing:-0.01em">${titleHtml}</div>${subtitleHtml ? `<div style="font-size:11px;color:#666;font-weight:300;line-height:1.5">${subtitleHtml}</div>` : ''}`
    : `<div style="font-size:11px;color:#666;font-weight:300;line-height:1.5">${subtitleHtml}</div>`;
  // Detectar imagen vertical: usamos contain sobre fondo claro y altura
  // limitada para que no domine la página. Para imágenes apaisadas usamos
  // el aspect-ratio real con cover desde la parte superior.
  const ratio = (typeof img.aspectRatio === 'number' && img.aspectRatio > 0.2 && img.aspectRatio < 6) ? img.aspectRatio : null;
  const isVertical = ratio !== null && ratio < 0.95;
  const mediaStyle = isVertical
    ? `position:relative;width:100%;max-width:260px;margin:0 auto;height:340px;background:#f4f4f5;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:8px`
    : `position:relative;width:100%;aspect-ratio:${(ratio ?? 16/10).toFixed(3)};background:#f4f4f5;overflow:hidden`;
  const imgStyle = isVertical
    ? `max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block`
    : `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top center;display:block`;
  return `<figure style="margin:0;border-radius:10px;overflow:hidden;background:#fff;border:1px solid #ececec;page-break-inside:avoid;display:flex;flex-direction:column">
<div style="${mediaStyle};padding:${isVertical ? '14px 0' : '0'}">
<img src="${img.url}" alt="Evidencia" class="evidence-image" style="${imgStyle}">
</div>
<figcaption style="padding:10px 14px 12px;font-family:'Poppins',sans-serif;letter-spacing:0.01em;background:#fff;border-top:1px solid #f0f0f0">${captionHtml}</figcaption>
</figure>`;
}).join('')}
</div></div>`;
    }

    // Block mode (default): collage compacto con grid de miniaturas de tamaño
    // fijo. Cada imagen se RECORTA y se amplía ligeramente con object-fit:cover
    // + scale para que las capturas móviles llenen el bloque en vez de quedar
    // como una pantalla pequeña centrada dentro de un panel gigante. Con 2
    // capturas siempre se cuadran en el mismo bloque a dos columnas.
    const n = images.length;
    const colCount = n === 1 ? 1 : n === 2 ? 2 : n <= 6 ? 3 : 4;
    const thumbHeight = n === 1 ? 210 : n === 2 ? 250 : n <= 4 ? 190 : n <= 9 ? 150 : 125;
    return `<div style="margin:20px 0;padding:18px 20px;background:#fafafa;border-radius:12px;border:1px solid #ececec;page-break-inside:auto">
<p style="font-size:10px;font-weight:600;color:#888;margin:0 0 14px 0;text-transform:uppercase;letter-spacing:0.08em;font-family:'Poppins',sans-serif">Evidencias gráficas</p>
<div style="display:grid;grid-template-columns:repeat(${colCount}, 1fr);gap:10px">
${images.map(img => {
  const rawDesc = String(img.descripcion || '').trim();
  const titleMatch = rawDesc.match(/^<strong>([\s\S]*?)<\/strong>\s*[:.\-—]?\s*([\s\S]*)$/i);
  const titleHtml = titleMatch ? titleMatch[1].trim() : '';
  const subtitleHtml = titleMatch ? titleMatch[2].trim() : rawDesc;
  const captionHtml = titleHtml
    ? `<div style="font-size:10px;font-weight:600;color:#333;margin-bottom:2px;letter-spacing:-0.01em;line-height:1.3">${titleHtml}</div>${subtitleHtml ? `<div style="font-size:9px;color:#666;font-weight:300;line-height:1.4">${subtitleHtml}</div>` : ''}`
    : `<div style="font-size:9px;color:#666;font-weight:300;line-height:1.4">${subtitleHtml}</div>`;
  return `<figure style="margin:0;break-inside:avoid;page-break-inside:avoid;display:flex;flex-direction:column;border-radius:8px;overflow:hidden;background:#fff;border:1px solid #ececec">
<div style="position:relative;width:100%;height:${thumbHeight}px;background:#f4f4f5;overflow:hidden;border-top-left-radius:8px;border-top-right-radius:8px">
<img src="${img.url}" alt="Evidencia" class="evidence-image" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top center;transform:scale(1.18);transform-origin:top center;display:block">
</div>
<figcaption style="padding:7px 9px 9px;font-family:'Poppins',sans-serif;letter-spacing:0.01em;border-top:1px solid #f0f0f0;background:#fff">${captionHtml}</figcaption>
</figure>`;
}).join('')}
</div></div>`;
  }

  // Decide layout per section: single vertical image → sidebar (text wraps).
  function shouldUseSidebar(imgs: Array<{ aspectRatio?: number; layout?: string }> | undefined): boolean {
    if (!imgs || imgs.length !== 1) return false;
    // If the AI explicitly requested 'fila_grande', do NOT switch to sidebar.
    if (imgs[0].layout === 'fila_grande') return false;
    const ratio = imgs[0].aspectRatio;
    return typeof ratio === 'number' && ratio > 0 && ratio < 0.9;
  }
  // When the admin enforced a manual collage we always render in block mode
  // (sidebar / row layouts only make sense for the auto pipeline).
  const expoSidebar = !useManualCollage && shouldUseSidebar(imagesBySection.exposicion_hechos);
  const califSidebar = !useManualCollage && shouldUseSidebar(imagesBySection.calificacion_falta);
  const medidaSidebar = !useManualCollage && shouldUseSidebar(imagesBySection.medida_disciplinaria);

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Documento Disciplinario - ${escapeHtml(workerName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Poppins',sans-serif;color:#1a1a1a;font-size:12.5px;font-weight:300;letter-spacing:-0.01em;line-height:1.6;max-width:800px;margin:0 auto;padding:40px 40px 60px}
strong{font-weight:600}
h1{font-weight:600;font-size:18px;margin-bottom:0;letter-spacing:-0.03em}
h2{font-weight:600;font-size:14.5px;margin:22px 0 10px;text-transform:none;letter-spacing:-0.02em;color:#555;page-break-after:avoid}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e5e5;padding-bottom:20px;margin-bottom:24px;page-break-inside:avoid}
.header-left{display:flex;align-items:center;gap:14px;flex:1}
.header-logo{width:44px;height:44px;display:block;object-fit:contain;flex-shrink:0}
.header-left-text{display:flex;flex-direction:column;justify-content:center;min-height:44px;gap:5px}
.header-left-text h1{line-height:1.1}
.header-left-text p{font-size:11px;color:#888;margin:0;line-height:1.3;font-weight:300;letter-spacing:0.01em}
.header-right{flex:1;text-align:right;font-size:11px;color:#888;line-height:1.6;font-weight:300;letter-spacing:0.01em}
.document-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:20px}
.document-code{font-size:11px;color:#888;line-height:1.4;font-weight:300;letter-spacing:0.01em}
.badge{display:inline-block;min-width:112px;height:30px;line-height:30px;padding:0 14px;border-radius:10px;font-size:11px;text-align:center;font-weight:600;letter-spacing:0;color:#888;background:transparent;border:1.5px solid #ccc;vertical-align:middle;white-space:nowrap}
.badge-categoria{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 14px;border-radius:10px;font-size:11px;font-weight:500;letter-spacing:0.01em;color:#5a7a1f;background:#f5fbec;border:1px solid #d6ecb0;vertical-align:middle;white-space:nowrap;max-width:340px;overflow:hidden;text-overflow:ellipsis}
.badge-categoria::before{content:"";display:inline-block;width:6px;height:6px;border-radius:999px;background:#93d600;flex-shrink:0}
.badge-categoria .badge-categoria-label{font-weight:300;color:#9bb474;text-transform:uppercase;font-size:9.5px;letter-spacing:0.08em;margin-right:2px}
.badge-categoria .badge-categoria-value{font-weight:600;color:#3f5c12;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}
.badge-inline{display:inline-block;min-width:68px;height:24px;line-height:24px;padding:0 12px;border-radius:999px;font-size:10px;text-align:center;font-weight:600;letter-spacing:0;color:#555;background:#f3f3f3;border:1px solid #d0d0d0;vertical-align:middle;white-space:nowrap}
.advertencias .badge-inline{color:#b45309;background:transparent;border:1px solid #f59e0b}
.worker-info{background:#f9f9f9;border-radius:10px;padding:16px 20px;margin:16px 0;font-size:12.5px;font-weight:300;letter-spacing:0.01em;page-break-inside:avoid}
.worker-info table{width:100%;border-collapse:collapse}
.worker-info td{padding:4px 0;vertical-align:top}
.worker-info td:first-child{font-weight:300;color:#888;width:140px}
.worker-info strong{font-weight:600}
.worker-id-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0;page-break-inside:avoid}
.worker-id-card{background:#f9f9f9;border-radius:10px;padding:14px 18px;font-size:12.5px;font-weight:300;letter-spacing:0.01em;display:flex;flex-direction:column;gap:10px}
.worker-id-card .field{display:flex;flex-direction:column;gap:2px;line-height:1.45}
.worker-id-card .label{font-size:11px;color:#888;font-weight:300;letter-spacing:0.02em}
.worker-id-card .value{font-size:12.5px;color:#1a1a1a;font-weight:300}
.worker-id-card .value strong{font-weight:600}
@media print{.worker-id-grid{break-inside:avoid}.worker-id-card{break-inside:avoid}}
.section{margin:20px 0;font-size:12.5px;font-weight:300;letter-spacing:-0.01em;line-height:1.6;page-break-inside:avoid}
.section p{margin-bottom:8px}
.articulos{background:#f5fbec;border-left:3px solid #93d600;border-radius:0 6px 6px 0;padding:11px 16px;margin:10px 0;font-size:11.5px;font-weight:300;line-height:1.6;page-break-inside:avoid;color:#2c2c2c}
.articulos .articulos-label{display:block;font-weight:600;font-size:11.5px;color:#2c2c2c;margin-bottom:5px}
.articulos ul{list-style:none;margin:0;padding:0}
.articulos li{padding:1px 0 1px 10px;position:relative}
.articulos li::before{content:"·";position:absolute;left:0;color:#93d600;font-weight:600}
.advertencias{background:#fef3cd;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px;margin:12px 0;font-size:11px;font-weight:300;letter-spacing:0.01em;line-height:1.56;page-break-inside:avoid}
.firma-section{display:flex;gap:40px;margin-top:64px;page-break-inside:avoid;break-inside:avoid;min-height:240px}
.firma-page-guard{page-break-inside:avoid;break-inside:avoid}
.firma-box{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;padding-top:16px;border-top:0.75px solid #d8d8d8}
.firma-box p{font-size:11px;color:#888;margin-top:4px;font-weight:300;letter-spacing:0.01em}
.firma-box .firma-label{font-size:10px;color:#aaa;margin-top:2px;text-transform:uppercase;letter-spacing:0.04em}
.company-signature{width:auto;height:auto;max-width:320px;max-height:260px;margin:12px auto 2px;display:block;object-fit:contain}
@media print{.company-signature{max-height:260px;max-width:320px}}
.doc-footer{margin-top:24px;padding-top:10px;border-top:0.75px solid #ebebeb;font-size:10px;color:#aaa;display:flex;align-items:center;gap:12px;font-weight:300;letter-spacing:0.01em}
.doc-footer span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.doc-footer span:last-child{text-align:right}
.evidence-aside{float:left;width:44%;margin:4px 22px 14px 0;padding:14px 16px;background:#fafafa;border-radius:10px;border:1px solid #eee;font-family:'Poppins',sans-serif}
.evidence-aside-label{font-size:10px;font-weight:600;color:#999;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.06em}
.evidence-aside-figure{margin:0;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #f0f0f0;display:flex;flex-direction:column}
.evidence-aside-frame{background:#f6f6f6;display:flex;align-items:center;justify-content:center;padding:0;border-bottom:1px solid #f0f0f0}
.evidence-aside-frame img,.evidence-aside img{width:100%;height:380px;object-fit:cover;object-position:center;display:block;border-radius:0}
.evidence-aside figcaption{font-size:12.5px;color:#666;padding:10px 12px;line-height:1.55;letter-spacing:0.01em;text-align:left;background:#fff}
.section-with-aside{display:block}
.section-with-aside::after{content:"";display:block;clear:both}
.section-with-aside > h2:first-of-type,.section-with-aside > .evidence-aside + h2{margin-top:0}
@media print{body{padding:30px 30px 60px;max-width:100%}}
</style></head><body data-document-code="${escapeHtml(documentCode)}" data-tipo="${escapeHtml(tipoLabel)}" data-worker-name="${escapeHtml(workerName)}" data-worker-number="${escapeHtml(workerNumber || '')}" data-fecha="${escapeHtml(fechaEmision)}">
<div class="header">
<div class="header-left">
<img src="${logoUrl}" alt="Verdnatura" class="header-logo">
<div class="header-left-text"><h1>Verdnatura Levante S.L.</h1><p>Documento disciplinario</p></div>
</div>
<div class="header-right">B97367486 — Carrer Fenollar, 2, 46680, Algemesí (Valencia)<br>${escapeHtml(fechaEmision)}</div>
</div>

<div class="document-meta">
<span class="badge">${escapeHtml(tipoLabel)}</span>
<span class="document-code">${escapeHtml(documentCode)}</span>
${categoria && categoria.trim() ? `<span class="badge-categoria" title="${escapeHtml(categoria)}"><span class="badge-categoria-label">Categoría</span><span class="badge-categoria-value">${escapeHtml(categoria)}</span></span>` : ''}
</div>

<h2>Identificación del trabajador/a</h2>
<div class="worker-id-grid">
  <div class="worker-id-card">
    <div class="field"><span class="label">Nombre completo</span><span class="value"><strong>${escapeHtml(workerName)}</strong></span></div>
    <div class="field"><span class="label">DNI/NIE</span><span class="value">${workerFiscalId ? escapeHtml(workerFiscalId) : '—'}</span></div>
  </div>
  <div class="worker-id-card">
    <div class="field"><span class="label">Nº ficha</span><span class="value">${workerNumber ? escapeHtml(workerNumber) : '—'}</span></div>
    <div class="field"><span class="label">Departamento</span><span class="value">${escapeHtml(deptName)}</span></div>
  </div>
</div>
${modificationBlockHtml || ''}
${expoSidebar ? `
<div class="section-with-aside">
${buildImagesHtml(imagesBySection.exposicion_hechos, { mode: 'sidebar' })}
<h2>Exposición de hechos</h2>
<div class="section">${renderParagraphsHtml(rExpo, fb.exposicionHechos)}</div>
</div>
<div style="clear:both"></div>

<h2>Fundamentación jurídica</h2>
<div class="section">${renderParagraphsHtml(rFund, fb.fundamentacionJuridica)}</div>

${rArts.length ? `<div class="articulos"><span class="articulos-label">Artículos del convenio citados:</span><ul>${rArts.map((a: string) => `<li>${escapeHtml(a)}</li>`).join('')}</ul></div>` : ''}
` : `
<h2>Exposición de hechos</h2>
<div class="section">${renderParagraphsHtml(rExpo, fb.exposicionHechos)}</div>
${buildImagesHtml(imagesBySection.exposicion_hechos)}

<h2>Fundamentación jurídica</h2>
<div class="section">${renderParagraphsHtml(rFund, fb.fundamentacionJuridica)}</div>

${rArts.length ? `<div class="articulos"><span class="articulos-label">Artículos del convenio citados:</span><ul>${rArts.map((a: string) => `<li>${escapeHtml(a)}</li>`).join('')}</ul></div>` : ''}
`}

${califSidebar ? `
<div class="section-with-aside">
${buildImagesHtml(imagesBySection.calificacion_falta, { mode: 'sidebar' })}
<h2>Calificación de la falta</h2>
<div class="section"><div style="margin-bottom:10px"><span class="badge-inline">${escapeHtml(gravedadLabel)}</span></div>${renderParagraphsHtml(rCalif, fb.calificacionFalta)}</div>
</div>
<div style="clear:both"></div>

<h2>Medida disciplinaria</h2>
<div class="advertencias"><div style="margin-bottom:10px"><span class="badge-inline">${tipo === 'amonestacion' ? 'AMONESTACIÓN' : suspensionDias ? 'SUSPENSIÓN' : 'SANCIÓN'}</span></div>${renderParagraphsHtml(rMedida, fb.medidaDisciplinaria)}</div>
` : `
<h2>Calificación de la falta</h2>
<div class="section"><div style="margin-bottom:10px"><span class="badge-inline">${escapeHtml(gravedadLabel)}</span></div>${renderParagraphsHtml(rCalif, fb.calificacionFalta)}</div>
${buildImagesHtml(imagesBySection.calificacion_falta)}

${medidaSidebar ? `
<div class="section-with-aside">
${buildImagesHtml(imagesBySection.medida_disciplinaria, { mode: 'sidebar' })}
<h2>Medida disciplinaria</h2>
<div class="advertencias"><div style="margin-bottom:10px"><span class="badge-inline">${tipo === 'amonestacion' ? 'AMONESTACIÓN' : suspensionDias ? 'SUSPENSIÓN' : 'SANCIÓN'}</span></div>${renderParagraphsHtml(rMedida, fb.medidaDisciplinaria)}</div>
</div>
<div style="clear:both"></div>
` : `
<h2>Medida disciplinaria</h2>
<div class="advertencias"><div style="margin-bottom:10px"><span class="badge-inline">${tipo === 'amonestacion' ? 'AMONESTACIÓN' : suspensionDias ? 'SUSPENSIÓN' : 'SANCIÓN'}</span></div>${renderParagraphsHtml(rMedida, fb.medidaDisciplinaria)}</div>
${buildImagesHtml(imagesBySection.medida_disciplinaria)}
`}
`}

<div class="firma-page-guard">
<div class="firma-section">
<div class="firma-box">
<p class="firma-label" style="margin-bottom:4px">FIRMA Y SELLO DE LA EMPRESA</p>
<p style="margin-bottom:8px"><strong>Verdnatura Levante S.L.</strong></p>
<img src="${firmaUrl}" alt="Firma y sello de Verdnatura" class="company-signature" onerror="this.style.display='none'">
</div>
<div class="firma-box">
<p class="firma-label" style="margin-bottom:4px">FIRMA DEL/LA TRABAJADOR/A</p>
<p style="margin-bottom:8px">Recibí — <strong>${escapeHtml(workerName)}</strong></p>
<div style="height:110px"></div>
</div>
</div>
</div>

<div class="doc-footer"><span>${escapeHtml(documentCode)}</span><span>Fecha emisión: ${escapeHtml(fechaEmision)}</span></div>
</body></html>`;
}

function generateDocumentCode(tipo: string, docId: string): string {
  const prefix = tipo === 'sancion' ? 'SAN' : tipo === 'nspp' ? 'NSPP' : 'AMO';
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const suffix = docId.substring(0, 4).toUpperCase();
  return `${prefix}-${dateStr}-${suffix}`;
}

async function deleteExistingLegalDocumentsForWorker(
  supabase: ReturnType<typeof createClient>,
  propuestaId: string,
  workerId: string,
) {
  const { data: existingDocs, error: existingDocsError } = await supabase
    .from('incidencias_legal_documents')
    .select('id')
    .eq('propuesta_id', propuestaId)
    .eq('worker_id', workerId);

  if (existingDocsError) {
    console.error('[legalDocumentCleanup] Failed to list existing docs:', existingDocsError);
    return existingDocsError;
  }

  const existingDocIds = (existingDocs || []).map((doc: { id: string }) => doc.id).filter(Boolean);

  if (existingDocIds.length > 0) {
    const { error: deleteFirmaTasksError } = await supabase
      .from('incidencias_firma_tasks')
      .delete()
      .in('legal_document_id', existingDocIds);

    if (deleteFirmaTasksError) {
      console.error('[legalDocumentCleanup] Failed to delete signature tasks:', deleteFirmaTasksError);
      return deleteFirmaTasksError;
    }
  }

  const { error: deleteDocsError } = await supabase
    .from('incidencias_legal_documents')
    .delete()
    .eq('propuesta_id', propuestaId)
    .eq('worker_id', workerId);

  if (deleteDocsError) {
    console.error('[legalDocumentCleanup] Failed to delete legal docs:', deleteDocsError);
    return deleteDocsError;
  }

  return null;
}

// ── Background legal document generation (fire-and-forget) ──────────────────
async function generateLegalDocumentBackground(
  supabase: ReturnType<typeof createClient>,
  propuestaId: string,
  managerName: string,
) {
  console.log(`[generateLegalDocumentBackground] Starting for propuesta ${propuestaId}`);
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Load the propuesta (which may have been updated with AI modifications)
    const { data: prop } = await supabase.from('incidencias_propuestas_rrhh').select('*').eq('id', propuestaId).single();
    if (!prop) return;

    // Early dedup: if a non-anulado legal document already exists for this
    // propuesta, skip generation entirely. This prevents duplicates when both
    // the background task (fired from analyzeProposal) and a manual
    // generateLegalDocument click race for the same propuesta.
    const { data: existingDocsBg } = await supabase
      .from('incidencias_legal_documents')
      .select('id')
      .eq('propuesta_id', propuestaId)
      .eq('anulado', false)
      .limit(1);
    if (existingDocsBg && existingDocsBg.length > 0) {
      console.log(`[generateLegalDocumentBackground] Skipping: doc already exists for propuesta ${propuestaId}`);
      return;
    }


    // Inherit admin-defined default font-size offset for new documents
    const { data: aiCfgRowBg } = await supabase
      .from('incidencias_ai_config')
      .select('default_font_delta')
      .limit(1)
      .maybeSingle();
    const rawDefaultFontDeltaBg = aiCfgRowBg?.default_font_delta;
    const defaultFontDeltaBg = (rawDefaultFontDeltaBg === null || rawDefaultFontDeltaBg === undefined)
      ? 1.5
      : (Number(rawDefaultFontDeltaBg) || 0);

    // Guard: never generate legal doc without AI analysis
    if (!(prop as any).ai_analysis) {
      console.warn(`[generateLegalDocumentBackground] Skipping: no ai_analysis for propuesta ${propuestaId}`);
      return;
    }

    const isNspp = (prop as any).tipo === 'nspp';
    if (isNspp) return;

    const recordId = prop.record_id;
    if (!recordId) return;

    const [recRes, rwRes, deptRes] = await Promise.all([
      supabase.from('incidencias_records').select('*, incidencias_categories(name, gravedad)').eq('id', recordId).single(),
      supabase.from('incidencias_record_workers').select('worker_id, worker_name, worker_number').eq('record_id', recordId),
      supabase.from('incidencias_departments').select('id, name').eq('id', prop.department_id).single(),
    ]);

    const rec = recRes.data;
    if (!rec) return;
    const targetWorkerId = (prop as any).target_worker_id || null;
    const workers = targetWorkerId
      ? (rwRes.data || []).filter((w: any) => w.worker_id === targetWorkerId)
      : (rwRes.data || []);
    if (workers.length === 0) return;
    const deptName = deptRes.data?.name || '';

    // Fetch fiscal_id for each worker
    const workerIdsForFiscal = workers.map((w: any) => w.worker_id).filter(Boolean);
    const fiscalMap: Record<string, string> = {};
    if (workerIdsForFiscal.length > 0) {
      const { data: wf } = await supabase.from('workers').select('id, fiscal_id').in('id', workerIdsForFiscal);
      for (const r of (wf || [])) if (r.fiscal_id) fiscalMap[r.id] = r.fiscal_id;
    }

    // Gather images + extract video frames as additional evidence
    const recPruebasRaw = Array.isArray(rec.pruebas_urls) ? rec.pruebas_urls : [];
    const adminPruebas = Array.isArray((prop as any).admin_pruebas_urls) ? (prop as any).admin_pruebas_urls : [];
    const disabledManagerBg: string[] = Array.isArray((prop as any).disabled_manager_pruebas) ? (prop as any).disabled_manager_pruebas : [];
    const recPruebas = recPruebasRaw.filter((p: string) => !disabledManagerBg.includes(p));
    const allPaths = [...recPruebas, ...adminPruebas];
    const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)$/i;
    const VIDEO_EXT_LEGAL = /\.(mp4|mov|avi|webm|mkv|3gp|m4v)$/i;
    const imgPaths = allPaths.filter((p: string) => typeof p === 'string' && IMAGE_EXT.test(p.split('?')[0])).slice(0, 10);
    const videoPathsLegal = allPaths.filter((p: string) => typeof p === 'string' && VIDEO_EXT_LEGAL.test(p.split('?')[0])).slice(0, 3);

    const signedUrls: string[] = [];
    const imageMetadata: Array<{ source: 'photo' | 'video'; timestamp_s?: number; video_name?: string; description?: string }> = [];

    if (imgPaths.length > 0) {
      const rawPaths = imgPaths.map((p: string) => {
        const match = p.match(/\/object\/sign\/incidencias-pruebas\/(.+?)(\?|$)/);
        return match ? decodeURIComponent(match[1]) : p;
      });
      const { data: signed } = await supabase.storage.from('incidencias-pruebas').createSignedUrls(rawPaths, 31536000);
      if (signed) {
        for (const s of signed) {
          if (s.signedUrl) {
            signedUrls.push(s.signedUrl);
            imageMetadata.push({ source: 'photo' });
          }
        }
      }
    }

    // Real video frames are extracted client-side (browser of the admin) before
    // calling this function — see src/lib/videoFrameExtractor.ts. Here we ONLY
    // consume the cached frames from `incidencias_video_frames`. If the cache
    // is empty for a video, no evidences from that video are included.
    if (videoPathsLegal.length > 0) {
      console.log(`[generateLegalDocumentBackground] Reading verified V2 frames for ${videoPathsLegal.length} video(s)...`);
      for (const vp of videoPathsLegal) {
        if (signedUrls.length >= 16) break;
        const { data: cachedFrames } = await supabase
          .from('incidencias_video_frames')
          .select('frame_url, timestamp_seconds, ai_description, relevance_score, capture_source, source_video_name, caption, storage_path')
          .eq('propuesta_id', propuestaId)
          .eq('video_path', vp)
          .order('timestamp_seconds');
        const videoName = vp.split('/').pop()?.split('?')[0] || 'video';
        const verified = (cachedFrames || []).filter((f: any) => isVerifiedVideoFrame(f)).slice(0, 3);
        if (verified.length === 0) {
          console.log(`[generateLegalDocumentBackground] No VERIFIED frames for ${videoName} — skipping (no fallback)`);
          continue;
        }
        for (const f of verified) {
          if (signedUrls.length >= 16) break;
          signedUrls.push(f.frame_url);
          imageMetadata.push({
            source: 'video',
            timestamp_s: Number(f.timestamp_seconds) || 0,
            video_name: f.source_video_name || videoName,
            description: f.ai_description || '',
            caption: f.caption || '',
          });
        }
        console.log(`[generateLegalDocumentBackground] Added ${verified.length} verified frames from ${videoName}`);
      }
    }

    // Get AI modification data
    const aiModification = (prop as any).ai_modification || null;

    for (const w of workers) {
      // Delete existing docs and linked signature tasks before recreating
      const cleanupError = await deleteExistingLegalDocumentsForWorker(supabase, propuestaId, w.worker_id);
      if (cleanupError) {
        console.error('[generateLegalDocumentBackground] Failed to clean previous docs:', cleanupError);
        continue;
      }

      // Call AI to generate document content
      const aiRes = await fetch(`${supabaseUrl}/functions/v1/control-incidencias-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({
          action: 'generateLegalDocument',
          worker_name: w.worker_name,
          worker_number: w.worker_number || '',
          department_name: deptName,
          gravedad: prop.gravedad,
          tipo: prop.tipo,
          descripcion_hechos: rec.descripcion || '',
          fecha_hechos: rec.fecha,
          suspension_dias: prop.suspension_dias,
          fecha_inicio: prop.fecha_inicio,
          sin_suspension_explicita: prop.tipo === 'sancion' && prop.sin_suspension_explicita === true,
          ai_motivo_legal: rec.ai_motivo_legal || '',
          ai_articulos: rec.ai_articulos_relevantes || [],
          categoria: rec.incidencias_categories?.name || '',
          custom_category_name: (rec as any).custom_category_name || '',
          imagen_urls: signedUrls,
          imagen_metadata: imageMetadata,
          ai_modification: aiModification,
          ai_analysis: (prop as any).ai_analysis || null,
          worker_fiscal_id: fiscalMap[w.worker_id] || '',
        }),
      });

      let aiContent: any = {};
      if (aiRes.ok) {
        aiContent = await aiRes.json();
        console.log(`[generateLegalDocumentBackground] AI response OK for worker ${w.worker_name}`);
      } else {
        console.error(`[generateLegalDocumentBackground] AI call failed: ${aiRes.status} ${await aiRes.text().catch(() => '')}`);
      }

      // Build image HTML blocks per section
      const imagesBySection: Record<string, Array<{ url: string; descripcion: string; aspectRatio?: number; layout?: string }>> = {
        exposicion_hechos: [], calificacion_falta: [], medida_disciplinaria: [],
      };
      if (Array.isArray(aiContent.imagenes_evidencia) && signedUrls.length > 0) {
        for (const imgEv of aiContent.imagenes_evidencia) {
          if (imgEv.incluir_imagen === false) continue;
          const url = signedUrls[imgEv.indice];
          const seccion = imgEv.seccion_recomendada || 'exposicion_hechos';
          if (url && imagesBySection[seccion]) imagesBySection[seccion].push({
            url,
            descripcion: imgEv.descripcion,
            layout: imgEv.layout_recomendado || undefined,
          });
        }
      }
      if (signedUrls.length > 0 && !Array.isArray(aiContent.imagenes_evidencia)) {
        const catNameFB = String(rec.incidencias_categories?.name || (rec as any).custom_category_name || '').toLowerCase();
        const descFB = String(rec.descripcion || '');
        const isImpuntualidadFB = /(impuntual|retraso|tardanz|llegad[ao]s?\s+tarde)/i.test(catNameFB)
          || (descFB.match(/(?:entrada|prevista)\s*\d{1,2}[:.]\d{2}[\s\S]{0,40}?llegada\s*\d{1,2}[:.]\d{2}/gi) || []).length >= 3;
        imagesBySection.exposicion_hechos = signedUrls.map((url, i) => ({
          url,
          descripcion: isImpuntualidadFB
            ? `<strong>Captura semanal de fichajes ${i + 1}</strong> — registro horario aportado como prueba documental de los retrasos imputados.`
            : `Evidencia fotográfica ${i + 1} adjunta al expediente`,
          layout: isImpuntualidadFB ? 'fila_grande' : undefined,
        }));
      }

      // Detect orientation per image so the renderer can switch to a floating
      // sidebar layout when there is a single vertical capture.
      await enrichImagesWithAspectRatio(supabase, imagesBySection);

      // NOTE: The "Modificación respecto a la propuesta del encargado" block is intentionally
      // NOT rendered inside the legal document. That comparison is admin-internal context shown
      // only in the propuesta panel UI, never in the official disciplinary document.
      const modificationBlockHtml = '';

      // ── Respect admin's manual decision: use propuesta's tipo/gravedad as source of truth ──
      // The AI may suggest different values in its analysis, but once the admin manually sets
      // tipo/gravedad we must NEVER overwrite them when regenerating the legal document.
      // Only suspension_dias is normalized (clamped to convenio limits) for safety.
      const normalized = normalizeLegalData({
        tipo: prop.tipo,
        gravedad: prop.gravedad,
        suspension_dias: prop.suspension_dias,
        sin_suspension_explicita: prop.tipo === 'sancion' && prop.sin_suspension_explicita === true,
        fecha_inicio: prop.fecha_inicio,
        existing_fechas: prop.suspension_fechas,
      });

      if (normalized.clamped) {
        console.warn(`[generateLegalDocumentBackground] Days clamped: ${normalized.original_dias} → ${normalized.suspension_dias} for ${normalized.gravedad}`);
      }

      // Sync ONLY suspension data (tipo/gravedad are admin-locked once set manually)
      const propSyncUpdates: Record<string, unknown> = {};
      if (normalized.suspension_dias !== prop.suspension_dias) propSyncUpdates.suspension_dias = normalized.suspension_dias;
      if (normalized.suspension_fechas && JSON.stringify(normalized.suspension_fechas) !== JSON.stringify(prop.suspension_fechas)) {
        propSyncUpdates.suspension_fechas = normalized.suspension_fechas;
      }
      if (Object.keys(propSyncUpdates).length > 0) {
        await supabase.from('incidencias_propuestas_rrhh').update(propSyncUpdates).eq('id', propuestaId);
        console.log(`[generateLegalDocumentBackground] Synced propuesta:`, propSyncUpdates);
      }

      const tempDocId = crypto.randomUUID();
      const documentCode = generateDocumentCode(normalized.tipo, tempDocId);

      const manualCollageHtmlBg = await buildManualCollageHtml(
        supabase,
        (prop as any).collage_layout || null,
      );

      const htmlContentRaw = buildLegalDocumentHtml({
        workerName: w.worker_name,
        workerNumber: w.worker_number || '',
        workerFiscalId: fiscalMap[w.worker_id] || '',
        deptName,
        gravedad: normalized.gravedad,
        tipo: normalized.tipo,
        propuestaId,
        documentCode,
        aiContent: { ...aiContent, exposicion_hechos: aiContent.exposicion_hechos || rec.descripcion || '' },
        imagesBySection,
        suspensionDias: normalized.suspension_dias,
        suspensionFechas: Array.isArray(normalized.suspension_fechas) ? normalized.suspension_fechas : (Array.isArray((prop as any).suspension_fechas) ? (prop as any).suspension_fechas : null),
        fechaInicio: prop.fecha_inicio,
        sinSuspensionExplicita: normalized.tipo === 'sancion' && (normalized.sin_suspension_explicita === true || Number(normalized.suspension_dias ?? 0) === 0),
        modificationBlockHtml,
        descripcionHechos: rec.descripcion || '',
        fechaHechos: rec.fecha,
        categoria: rec.incidencias_categories?.name || '',
        aiMotivoLegal: rec.ai_motivo_legal || '',
        articulosBase: rec.ai_articulos_relevantes || [],
        manualCollageHtml: manualCollageHtmlBg,
      });

      // El admin tiene la última palabra: el HTML final se reescribe para que
      // coincida con la gravedad / tipo marcados por el admin, aunque la IA
      // haya recomendado otra cosa.
      const htmlContent = enforceLegalDocumentHtmlConsistency(htmlContentRaw, {
        tipo: normalized.tipo,
        gravedad: normalized.gravedad,
        suspensionDias: normalized.suspension_dias ?? null,
        sinSuspensionExplicita: normalized.tipo === 'sancion' && (normalized.sin_suspension_explicita === true || Number(normalized.suspension_dias ?? 0) === 0),
      });

      const { data: newDoc, error: docErr } = await supabase.from('incidencias_legal_documents').insert({
        id: tempDocId,
        propuesta_id: propuestaId,
        worker_id: w.worker_id,
        worker_name: w.worker_name,
        worker_number: w.worker_number || null,
        department_id: prop.department_id,
        tipo: normalized.tipo,
        gravedad_final: normalized.gravedad,
        descripcion_hechos: normalizeConvenioCitations(aiContent.exposicion_hechos || rec.descripcion || ''),
        fundamentacion_juridica: normalizeConvenioCitations(aiContent.fundamentacion_juridica || ''),
        articulos_citados: normalizeConvenioCitationList(aiContent.articulos_citados || []),
        sancion_aplicada: normalized.tipo === 'amonestacion' ? 'amonestacion_escrita' : (normalized.suspension_dias ? 'suspension' : 'amonestacion_escrita'),
        suspension: !!(normalized.suspension_dias),
        dias_suspension: normalized.suspension_dias || null,
        fecha_inicio_suspension: prop.fecha_inicio || null,
        plazo_alegaciones_dias: normalized.gravedad === 'muy_grave' ? 5 : 3,
        html_content: htmlContent,
        font_delta: defaultFontDeltaBg,
        created_by: managerName,
        document_code: documentCode,
      }).select().single();


      // Race-condition guard: a concurrent manual generateLegalDocument call
      // may already have inserted the doc for this (propuesta, worker). The
      // unique partial index uniq_legal_doc_per_proposal_worker raises 23505.
      // Treat it as success — the existing document is the source of truth.
      if (docErr) {
        if ((docErr as any).code === '23505') {
          console.log('[generateLegalDocumentBackground] Doc already exists for', propuestaId, w.worker_id, '— skipping duplicate insert');
          continue;
        }
        console.error('[generateLegalDocumentBackground] Failed to create doc:', docErr);
        continue;
      }

      if (newDoc) {
        const { error: firmaErr } = await supabase.from('incidencias_firma_tasks').insert({
          legal_document_id: newDoc.id,
          worker_id: w.worker_id,
          worker_name: w.worker_name,
        });
        if (firmaErr && (firmaErr as any).code !== '23505') {
          console.error('[generateLegalDocumentBackground] Failed to create firma task:', firmaErr);
        }
      }
    }

    console.log(`[generateLegalDocumentBackground] Legal document auto-generated for propuesta ${propuestaId}`);
  } catch (e) {
    console.error('[generateLegalDocumentBackground] Error:', e);
  }
}
