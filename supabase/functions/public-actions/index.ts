import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * PUBLIC-ACTIONS Edge Function
 * 
 * SECURITY: This function handles ONLY public token-validated actions.
 * NO session tokens required - authentication is done via cryptographic tokens.
 * 
 * These actions are typically triggered by email links where workers 
 * confirm/reject exchanges or sign calendar modifications.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Rate limiting: max requests per IP per minute
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;
const requestCounts = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);
  
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCounts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  
  entry.count++;
  return true;
}

function escapeHtml(value: string | null | undefined): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAttachmentLandingPage(params: { fileName: string; rawUrl: string; downloadUrl: string; pdfUrl: string; isPdf: boolean; isHtml: boolean }): string {
  const title = escapeHtml(params.fileName || 'documento');
  const previewSrc = escapeHtml(params.rawUrl);
  const preview = (params.isPdf || params.isHtml)
    ? `<iframe src="${previewSrc}" title="${title}" style="width:100%;height:72vh;border:1px solid #e2e8f0;border-radius:14px;background:#fff;"></iframe>`
    : `<div style="padding:28px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;color:#475569;">Vista previa no disponible. Usa el botón para descargar el archivo.</div>`;
  // Botón primario: descargar PDF.
  // - Para HTML legal: usa mode=pdf (abre página que lanza window.print() automático con A4).
  // - Para PDF nativo: el propio raw es ya un PDF, mode=download fuerza adjunto.
  // - Otros tipos: cae a mode=download.
  const primaryHref = params.isHtml
    ? escapeHtml(params.pdfUrl)
    : escapeHtml(params.downloadUrl);
  const primaryLabel = params.isHtml || params.isPdf ? 'Descargar PDF' : 'Descargar archivo';
  const previewWithId = (params.isPdf || params.isHtml)
    ? `<iframe id="lovable-doc-frame" src="${previewSrc}" title="${title}" style="width:100%;height:72vh;border:1px solid #e2e8f0;border-radius:14px;background:#fff;"></iframe>`
    : preview;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#f1f5f9;color:#0f172a;font-family:Poppins,Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:980px;margin:0 auto;padding:28px 18px 36px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 18px 60px rgba(15,23,42,.12);overflow:hidden}.head{padding:22px 24px;background:linear-gradient(135deg,#b45309,#f59e0b);color:#fff}.head h1{margin:0;font-size:20px;line-height:1.25;font-weight:700;letter-spacing:0}.head p{margin:6px 0 0;font-size:13px;opacity:.85}.body{padding:22px 24px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 18px}.btn{display:inline-block;padding:11px 18px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px}.primary{background:#d97706;color:#fff}.secondary{background:#f8fafc;color:#334155;border:1px solid #cbd5e1}@media(max-width:640px){.wrap{padding:14px 10px}.head,.body{padding:18px}.head h1{font-size:17px}}</style></head><body><main class="wrap"><section class="card"><div class="head"><h1>${title}</h1><p>Documento definitivo, pendiente de firma del trabajador.</p></div><div class="body"><div class="actions"><a class="btn primary" href="${primaryHref}" target="_blank" rel="noopener">${primaryLabel}</a><a class="btn secondary" href="${previewSrc}" target="_blank" rel="noopener">Abrir en nueva pestaña</a></div>${previewWithId}</div></section></main></body></html>`;
}

function buildPdfPrintPage(params: { title: string; htmlContent: string }): string {
  // Página que renderiza el HTML legal y dispara window.print() automáticamente.
  // Configura @page A4 / 16mm para que el PDF resultante sea idéntico al
  // documento que se imprime físicamente.
  const safeTitle = escapeHtml(params.title || 'documento');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${safeTitle}</title><style>@page{size:A4;margin:16mm}html,body{margin:0;padding:0;background:#fff}@media screen{body{background:#f1f5f9;padding:20px}.doc-wrap{max-width:794px;margin:0 auto;background:#fff;box-shadow:0 4px 24px rgba(15,23,42,.08);padding:24px}.hint{max-width:794px;margin:0 auto 12px;font-family:Poppins,Inter,system-ui,sans-serif;font-size:13px;color:#475569;text-align:center}}@media print{.hint{display:none}.doc-wrap{box-shadow:none;padding:0;max-width:none}}</style><script>window.addEventListener('load',function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},400);});</script></head><body><div class="hint">Si el diálogo de impresión no se abre, pulsa Ctrl/Cmd + P y elige "Guardar como PDF".</div><div class="doc-wrap">${params.htmlContent}</div></body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  // Rate limiting check
  if (!checkRateLimit(clientIp)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Too many requests. Please try again later.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = req.method === 'GET' ? {} : await req.json();
    const { action, data } = body as { action?: string; data?: any };

    console.log(`Public action: ${action} from IP: ${clientIp}`);

    // Direct attachment delivery by token (for email links)
    const attachmentToken = new URL(req.url).searchParams.get('attachmentToken');
    if (req.method === 'GET' && attachmentToken) {
      const url = new URL(req.url);
      const mode = url.searchParams.get('mode') || 'view';
      if (attachmentToken.length < 32) {
        return new Response('Token inválido', { status: 400, headers: corsHeaders });
      }

      const { data: linkRow, error: linkError } = await supabase
        .from('incidencias_attachment_links')
        .select('token, storage_path, file_name, expires_at')
        .eq('token', attachmentToken)
        .single();

      if (linkError || !linkRow) {
        return new Response('Archivo no encontrado', { status: 404, headers: corsHeaders });
      }

      if (linkRow.expires_at && new Date(linkRow.expires_at).getTime() < Date.now()) {
        return new Response('El enlace ha expirado', { status: 410, headers: corsHeaders });
      }

      await supabase.rpc('touch_incidencias_attachment_link', { _token: attachmentToken }).then(() => {}).catch(() => {});

      const { data: signedData, error: signedError } = await supabase
        .storage
        .from('incidencias-pruebas')
        .createSignedUrl(linkRow.storage_path, 60);

      if (signedError || !signedData?.signedUrl) {
        console.error('attachmentToken signing failed', signedError);
        return new Response('No se pudo abrir el archivo', { status: 500, headers: corsHeaders });
      }

      const fileRes = await fetch(signedData.signedUrl);
      if (!fileRes.ok) {
        return new Response('No se pudo descargar el archivo', { status: 502, headers: corsHeaders });
      }

      const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
      const safeFileName = (linkRow.file_name || linkRow.storage_path.split('/').pop() || 'adjunto').replace(/[\r\n"]/g, '');

      const lowerNameForType = safeFileName.toLowerCase();
      const isPdfFile = contentType === 'application/pdf' || lowerNameForType.endsWith('.pdf');
      const isHtmlFile = contentType.startsWith('text/html') || lowerNameForType.endsWith('.html') || lowerNameForType.endsWith('.htm');

      if (mode === 'page') {
        const rawUrl = `${url.origin}${url.pathname}?attachmentToken=${encodeURIComponent(attachmentToken)}&mode=raw`;
        const downloadUrl = `${url.origin}${url.pathname}?attachmentToken=${encodeURIComponent(attachmentToken)}&mode=download`;
        const pdfUrl = `${url.origin}${url.pathname}?attachmentToken=${encodeURIComponent(attachmentToken)}&mode=pdf`;
        return new Response(buildAttachmentLandingPage({
          fileName: safeFileName,
          rawUrl,
          downloadUrl,
          pdfUrl,
          isPdf: isPdfFile,
          isHtml: isHtmlFile,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }

      // mode=pdf: para HTML legal, devolver una página que renderiza el doc
      // y dispara window.print() automático con @page A4. Para PDFs reales o
      // cualquier otro tipo, cae a comportamiento de descarga.
      if (mode === 'pdf' && isHtmlFile) {
        const htmlText = await fileRes.text();
        return new Response(buildPdfPrintPage({
          title: safeFileName,
          htmlContent: htmlText,
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            // CSP permisiva (igual que para HTML legal): logo, firmas, fuentes.
            'Content-Security-Policy': "default-src 'none'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; style-src 'unsafe-inline'; font-src https: data:; script-src 'unsafe-inline';",
          },
        });
      }

      const forceDownload = mode === 'download' || mode === 'pdf';
      const lowerNameRaw = (linkRow.file_name || linkRow.storage_path || '').toLowerCase();
      const isHtmlDoc = contentType.startsWith('text/html') || lowerNameRaw.endsWith('.html') || lowerNameRaw.endsWith('.htm');
      const dispositionType = forceDownload ? 'attachment' : (contentType.startsWith('image/') || contentType.startsWith('video/') || contentType === 'application/pdf' || isHtmlDoc ? 'inline' : 'attachment');
      // For HTML legal documents we need to allow remote images (logo, firma)
      // and inline styles. We keep scripts blocked (default-src 'none').
      const csp = isHtmlDoc
        ? "default-src 'none'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; style-src 'unsafe-inline'; font-src https: data:;"
        : "default-src 'none'; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'unsafe-inline';";

      return new Response(fileRes.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Security-Policy': csp,
          'Content-Disposition': `${dispositionType}; filename="${safeFileName}"`,
        },
      });
    }

    // Validate action is in allowed public actions list
    const allowedPublicActions = [
      'getExchangeByToken',
      'respondToExchange',
      'getCalendarModificationByToken',
      'signCalendarModification',
      'rejectCalendarModification',
    ];

    if (!allowedPublicActions.includes(action)) {
      console.log(`Rejected invalid public action: ${action}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid action' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // ============================================
    // GET EXCHANGE BY TOKEN
    // ============================================
    if (action === 'getExchangeByToken') {
      const { token } = data;

      if (!token || typeof token !== 'string' || token.length < 32) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token inválido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Find exchange by token_a or token_b
      const { data: exchange } = await supabase
        .from('vacation_group_exchanges')
        .select('*')
        .or(`token_a.eq.${token},token_b.eq.${token}`)
        .single();

      if (!exchange) {
        return new Response(
          JSON.stringify({ success: false, error: 'Intercambio no encontrado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      const isEmployeeA = exchange.token_a === token;
      const employeeId = isEmployeeA ? exchange.employee_a_id : exchange.employee_b_id;
      const otherEmployeeId = isEmployeeA ? exchange.employee_b_id : exchange.employee_a_id;
      const originalGroupId = isEmployeeA ? exchange.original_group_a_id : exchange.original_group_b_id;
      const temporaryGroupId = isEmployeeA ? exchange.temporary_group_a_id : exchange.temporary_group_b_id;
      const alreadyAccepted = isEmployeeA ? exchange.accepted_by_a : exchange.accepted_by_b;

      // Get employee info
      const { data: employee } = await supabase
        .from('workers')
        .select('name, worker_number')
        .eq('id', employeeId)
        .single();

      const { data: otherEmployee } = await supabase
        .from('workers')
        .select('name')
        .eq('id', otherEmployeeId)
        .single();

      // Get group info
      const { data: originalGroup } = await supabase
        .from('work_groups')
        .select('name, color')
        .eq('id', originalGroupId)
        .single();

      const { data: temporaryGroup } = await supabase
        .from('work_groups')
        .select('name, color')
        .eq('id', temporaryGroupId)
        .single();

      // Get vacation dates for both groups
      // Find the annual calendar for this department+year
      const { data: calendar } = await supabase
        .from('annual_calendars')
        .select('id')
        .eq('department_id', exchange.department_id)
        .eq('year', exchange.year)
        .single();

      let originalGroupDates: string[] = [];
      let temporaryGroupDates: string[] = [];

      if (calendar) {
        const { data: origDays } = await supabase
          .from('annual_calendar_days')
          .select('date')
          .eq('calendar_id', calendar.id)
          .eq('group_id', originalGroupId)
          .eq('day_type', 'vacation')
          .order('date');

        const { data: tempDays } = await supabase
          .from('annual_calendar_days')
          .select('date')
          .eq('calendar_id', calendar.id)
          .eq('group_id', temporaryGroupId)
          .eq('day_type', 'vacation')
          .order('date');

        originalGroupDates = (origDays || []).map((d: any) => d.date);
        temporaryGroupDates = (tempDays || []).map((d: any) => d.date);
      }

      return new Response(
        JSON.stringify({
          success: true,
          exchange: {
            id: exchange.id,
            year: exchange.year,
            status: exchange.status,
            employee: {
              name: employee?.name || 'Desconocido',
              workerNumber: employee?.worker_number || ''
            },
            originalGroup: {
              name: originalGroup?.name || 'Desconocido',
              color: originalGroup?.color || '#888'
            },
            temporaryGroup: {
              name: temporaryGroup?.name || 'Desconocido',
              color: temporaryGroup?.color || '#888'
            },
            otherEmployee: {
              name: otherEmployee?.name || 'Desconocido'
            },
            alreadyAccepted,
            alreadyRejected: exchange.status === 'cancelled',
            originalGroupDates,
            temporaryGroupDates
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // RESPOND TO EXCHANGE
    // ============================================
    if (action === 'respondToExchange') {
      const { token, accept, signature } = data;

      if (!token || typeof token !== 'string' || token.length < 32) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token inválido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Find exchange
      const { data: exchange } = await supabase
        .from('vacation_group_exchanges')
        .select('*')
        .or(`token_a.eq.${token},token_b.eq.${token}`)
        .single();

      if (!exchange) {
        return new Response(
          JSON.stringify({ success: false, error: 'Intercambio no encontrado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      if (exchange.status === 'cancelled' || exchange.status === 'approved') {
        return new Response(
          JSON.stringify({ success: false, error: 'Este intercambio ya no puede ser modificado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const isEmployeeA = exchange.token_a === token;

      if (!accept) {
        // Rejection - cancel the whole exchange
        await supabase
          .from('vacation_group_exchanges')
          .update({
            status: 'cancelled',
            cancelled_by: isEmployeeA ? 'Empleado A' : 'Empleado B',
            cancelled_at: new Date().toISOString(),
            cancellation_reason: 'Rechazado por empleado'
          })
          .eq('id', exchange.id);

        // Log security event
        await supabase.from('security_events').insert({
          event_type: 'EXCHANGE_REJECTED',
          severity: 'info',
          actor_type: 'worker',
          ip_address: clientIp,
          details: { exchangeId: exchange.id, employee: isEmployeeA ? 'A' : 'B' }
        });

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Acceptance
      const updateData: Record<string, unknown> = {};
      if (isEmployeeA) {
        updateData.accepted_by_a = true;
        updateData.accepted_by_a_at = new Date().toISOString();
        if (signature) updateData.signature_a = signature;
      } else {
        updateData.accepted_by_b = true;
        updateData.accepted_by_b_at = new Date().toISOString();
        if (signature) updateData.signature_b = signature;
      }

      // Check if both have now accepted
      const otherAccepted = isEmployeeA ? exchange.accepted_by_b : exchange.accepted_by_a;
      if (otherAccepted) {
        // Both signed — auto-approve and apply group swap
        updateData.status = 'approved';
        updateData.approved_at = new Date().toISOString();
        updateData.approved_by = 'auto_both_signed';
      }

      await supabase
        .from('vacation_group_exchanges')
        .update(updateData)
        .eq('id', exchange.id);

      // If both signed, apply the group swap on workers
      if (otherAccepted) {
        // Swap work_group_id for both employees
        await supabase
          .from('workers')
          .update({ work_group_id: exchange.temporary_group_a_id })
          .eq('id', exchange.employee_a_id);

        await supabase
          .from('workers')
          .update({ work_group_id: exchange.temporary_group_b_id })
          .eq('id', exchange.employee_b_id);

        // Get employee names for notification
        const { data: empA } = await supabase.from('workers').select('name').eq('id', exchange.employee_a_id).single();
        const { data: empB } = await supabase.from('workers').select('name').eq('id', exchange.employee_b_id).single();

        // Notify admin via email
        try {
          const internalSecret = Deno.env.get('INTERNAL_EMAIL_SECRET');
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

          // Get admin managers for this department
          const { data: admins } = await supabase
            .from('managers')
            .select('email')
            .eq('role', 'admin');

          const adminEmails = (admins || []).map((a: any) => a.email).filter(Boolean);

          if (adminEmails.length > 0 && internalSecret) {
            const signAAt = isEmployeeA ? new Date().toISOString() : exchange.accepted_by_a_at;
            const signBAt = isEmployeeA ? exchange.accepted_by_b_at : new Date().toISOString();

            await fetch(`${supabaseUrl}/functions/v1/send-vacation-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-internal-secret': internalSecret,
              },
              body: JSON.stringify({
                to: adminEmails[0],
                subject: `✅ Intercambio de vacaciones completado — ${empA?.name || 'Empleado A'} ↔ ${empB?.name || 'Empleado B'} (${exchange.year})`,
                html: `
                  <h2>Intercambio de vacaciones completado</h2>
                  <p>Ambos empleados han firmado el intercambio de grupo de vacaciones para el año <strong>${exchange.year}</strong>.</p>
                  <ul>
                    <li><strong>${empA?.name || 'Empleado A'}</strong> — firmó el ${new Date(signAAt!).toLocaleString('es-ES')}</li>
                    <li><strong>${empB?.name || 'Empleado B'}</strong> — firmó el ${new Date(signBAt!).toLocaleString('es-ES')}</li>
                  </ul>
                  <p>El cambio de grupo ya se ha aplicado automáticamente.</p>
                `,
              }),
            });
          }
        } catch (emailErr) {
          console.error('Error sending admin notification:', emailErr);
        }
      }

      // Log security event
      await supabase.from('security_events').insert({
        event_type: 'EXCHANGE_ACCEPTED',
        severity: 'info',
        actor_type: 'worker',
        ip_address: clientIp,
        details: { exchangeId: exchange.id, employee: isEmployeeA ? 'A' : 'B', autoApproved: !!otherAccepted }
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // GET CALENDAR MODIFICATION BY TOKEN
    // ============================================
    if (action === 'getCalendarModificationByToken') {
      const { token } = data || {};

      if (!token || typeof token !== 'string' || token.length < 32) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token inválido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: modification, error: modError } = await supabase
        .from('worker_calendar_modifications')
        .select(`
          *,
          workers(id, name, worker_number, email, work_group_id),
          departments(id, name),
          original_group:work_groups!worker_calendar_modifications_original_group_id_fkey(id, name, color),
          new_group:work_groups!worker_calendar_modifications_new_group_id_fkey(id, name, color)
        `)
        .eq('access_token', token)
        .single();

      if (modError || !modification) {
        console.error('Modification not found by token:', modError);
        return new Response(
          JSON.stringify({ success: false, error: 'Enlace inválido o expirado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      console.log(`Fetched modification by token: ${modification.id}`);
      return new Response(
        JSON.stringify({ success: true, modification }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // SIGN CALENDAR MODIFICATION
    // ============================================
    if (action === 'signCalendarModification') {
      const { token, signature, signedIp } = data || {};

      if (!token || typeof token !== 'string' || token.length < 32) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token inválido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      if (!signature) {
        return new Response(
          JSON.stringify({ success: false, error: 'Firma requerida' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get modification by token
      const { data: modification, error: modError } = await supabase
        .from('worker_calendar_modifications')
        .select('*, workers(id, name, worker_number, work_group_id, department_id)')
        .eq('access_token', token)
        .single();

      if (modError || !modification) {
        return new Response(
          JSON.stringify({ success: false, error: 'Enlace inválido o expirado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      if (modification.status !== 'pending' && modification.status !== 'pending_signature') {
        return new Response(
          JSON.stringify({ success: false, error: 'Esta modificación ya ha sido procesada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const worker = (modification as any).workers;

      // Clear existing entries for this modification (idempotency)
      await supabase
        .from('worker_personal_calendar_days')
        .delete()
        .eq('modification_id', modification.id);

      const applyErrors: string[] = [];

      // 1. Change work group if specified
      if (modification.new_group_id && modification.new_group_id !== worker.work_group_id) {
        const { error: groupError } = await supabase
          .from('workers')
          .update({ work_group_id: modification.new_group_id })
          .eq('id', worker.id);
        if (groupError) {
          console.error('Error changing worker group:', groupError);
          applyErrors.push(`Error cambiando grupo: ${groupError.message}`);
        }
      }

      // 2. Process removed_group_days - insert as unlocked_by_admin
      const removedDaysArray = modification.removed_group_days || [];
      if (Array.isArray(removedDaysArray) && removedDaysArray.length > 0) {
        const removedDaysToInsert = removedDaysArray.map((rd: unknown) => ({
          worker_id: worker.id,
          department_id: modification.department_id,
          modification_id: modification.id,
          date: typeof rd === 'string' ? rd : (rd as { date: string }).date,
          day_type: 'unlocked_by_admin',
          half_day: false,
          year: modification.year,
        }));

        const { error: insertRemoveError } = await supabase
          .from('worker_personal_calendar_days')
          .insert(removedDaysToInsert);
        
        if (insertRemoveError) {
          console.error('Error inserting removed days:', insertRemoveError);
          applyErrors.push(`Error quitando días: ${insertRemoveError.message}`);
        }
      }

      // 3. Process added_personal_days
      const addedDaysArray = modification.added_personal_days || [];
      if (Array.isArray(addedDaysArray) && addedDaysArray.length > 0) {
        const addedDaysToInsert = addedDaysArray.map((ad: unknown) => ({
          worker_id: worker.id,
          department_id: modification.department_id,
          modification_id: modification.id,
          date: typeof ad === 'string' ? ad : (ad as { date: string }).date,
          day_type: (typeof ad === 'object' && ad && 'assignmentType' in ad) 
            ? (ad as { assignmentType: string }).assignmentType 
            : 'libre_configuracion',
          half_day: (typeof ad === 'object' && ad && 'halfDay' in ad) 
            ? (ad as { halfDay: boolean }).halfDay 
            : false,
          year: modification.year,
        }));

        const { error: insertAddError } = await supabase
          .from('worker_personal_calendar_days')
          .insert(addedDaysToInsert);
        
        if (insertAddError) {
          console.error('Error inserting added days:', insertAddError);
          applyErrors.push(`Error añadiendo días: ${insertAddError.message}`);
        }
      }

      // 4. Sync Personal Annual Calendars with the worker personal calendar (worker + personal annual prevail)
      // We mirror worker_personal_calendar_days (excluding unlocked_by_admin) into personal_annual_calendar_days
      // for any personal annual calendars that include this worker for the same year.
      try {
        const { data: personalAnnualWorkers } = await supabase
          .from('personal_annual_calendar_workers')
          .select('id, personal_calendar_id, personal_annual_calendars!inner(year)')
          .eq('worker_id', worker.id)
          .eq('personal_annual_calendars.year', modification.year);

        if (personalAnnualWorkers && personalAnnualWorkers.length > 0) {
          const { data: effectivePersonalDays } = await supabase
            .from('worker_personal_calendar_days')
            .select('date')
            .eq('worker_id', worker.id)
            .eq('year', modification.year)
            .neq('day_type', 'unlocked_by_admin');

          const dates = (effectivePersonalDays || []).map((d: any) => d.date);

          for (const paw of personalAnnualWorkers as any[]) {
            // Replace worker's personal annual days for this calendar worker with the effective set
            await supabase
              .from('personal_annual_calendar_days')
              .delete()
              .eq('personal_calendar_worker_id', paw.id);

            if (dates.length > 0) {
              await supabase
                .from('personal_annual_calendar_days')
                .insert(dates.map((dateStr: string) => ({
                  personal_calendar_id: paw.personal_calendar_id,
                  personal_calendar_worker_id: paw.id,
                  date: dateStr,
                })));
            }
          }
        }
      } catch (syncErr) {
        console.error('Failed to sync personal annual calendar days from worker personal calendar:', syncErr);
      }

      if (applyErrors.length > 0) {
        return new Response(
          JSON.stringify({ success: false, error: `Errores aplicando cambios: ${applyErrors.join('; ')}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Mark as signed
      await supabase
        .from('worker_calendar_modifications')
        .update({
          status: 'signed',
          signed_at: new Date().toISOString(),
          signature,
          signed_ip: signedIp || clientIp,
        })
        .eq('id', modification.id);

      // Log security event
      await supabase.from('security_events').insert({
        event_type: 'CALENDAR_MODIFICATION_SIGNED',
        severity: 'info',
        actor_type: 'worker',
        target_id: modification.id,
        target_type: 'calendar_modification',
        ip_address: clientIp,
        details: { workerId: worker.id, workerName: worker.name }
      });

      console.log(`Calendar modification ${modification.id} signed successfully`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // REJECT CALENDAR MODIFICATION
    // ============================================
    if (action === 'rejectCalendarModification') {
      const { token, rejectionReason } = data || {};

      if (!token || typeof token !== 'string' || token.length < 32) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token inválido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      if (!rejectionReason) {
        return new Response(
          JSON.stringify({ success: false, error: 'Motivo de rechazo requerido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: modification, error: modError } = await supabase
        .from('worker_calendar_modifications')
        .select('id, status')
        .eq('access_token', token)
        .single();

      if (modError || !modification) {
        return new Response(
          JSON.stringify({ success: false, error: 'Enlace inválido o expirado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      if (modification.status !== 'pending' && modification.status !== 'pending_signature') {
        return new Response(
          JSON.stringify({ success: false, error: 'Esta modificación ya ha sido procesada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error: updateError } = await supabase
        .from('worker_calendar_modifications')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason,
          rejected_at: new Date().toISOString(),
        })
        .eq('id', modification.id);

      if (updateError) {
        console.error('Error rejecting modification:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al rechazar la modificación' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Log security event
      await supabase.from('security_events').insert({
        event_type: 'CALENDAR_MODIFICATION_REJECTED',
        severity: 'info',
        actor_type: 'worker',
        target_id: modification.id,
        target_type: 'calendar_modification',
        ip_address: clientIp,
        details: { rejectionReason }
      });

      console.log(`Calendar modification rejected: ${modification.id}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Should never reach here due to action validation above
    return new Response(
      JSON.stringify({ success: false, error: 'Action not handled' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error: unknown) {
    console.error('Public action error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
