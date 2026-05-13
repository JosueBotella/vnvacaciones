import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
// v3 - added team config backups

const INTERNAL_EMAIL_SECRET = Deno.env.get("INTERNAL_EMAIL_SECRET");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendEmailBrevo(params: { from: string; to: string | string[]; subject: string; html: string; cc?: string[]; attachments?: Array<{ filename: string; content: string }> }): Promise<Response> {
  const BREVO_KEY = Deno.env.get('BREVO_API_KEY');
  if (!BREVO_KEY) throw new Error('BREVO_API_KEY not configured');

  const parseAddress = (value: string) => {
    const match = String(value).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (match) return { name: match[1].replace(/^['"]|['"]$/g, ''), email: match[2].trim() };
    return { email: String(value).trim() };
  };

  const toArr = Array.isArray(params.to) ? params.to : [params.to];
  const body: any = {
    sender: parseAddress(params.from),
    to: toArr.filter(Boolean).map((email) => parseAddress(email)),
    subject: params.subject,
    htmlContent: params.html,
  };
  if (params.cc?.length) body.cc = params.cc.filter(Boolean).map((email) => parseAddress(email));
  if (params.attachments?.length) {
    body.attachment = params.attachments.map((file) => ({ name: file.filename, content: file.content }));
  }

  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Build the corporate-styled HTML body for an Alta email.
// Used both by the original send (sendOperativaAlta) and the silent resend (resendAltaFromHistory).
function buildAltaEmailHtml(params: {
  nombre: string;
  iban?: string | null;
  telefono?: string | null;
  workerEmail?: string | null;
  fechaAltaStr?: string | null;
  dept?: string | null;
  grupoStr?: string | null;
  solicitante?: string | null;
  infoAdicional?: string | null;
  filesCount: number;
  managerName: string;
}): string {
  const accentColor = '#93d600';
  const logoUrl = 'https://vnprod.app/images/logo-white.png';
  const logoGreenUrl = 'https://vnprod.app/images/verdnatura-logo-green.png';
  const { nombre, iban, telefono, workerEmail, fechaAltaStr, dept, grupoStr, solicitante, infoAdicional, filesCount, managerName } = params;

  const infoItems: { label: string; value: string; isLink?: boolean; href?: string }[] = [];
  infoItems.push({ label: 'Nombre completo', value: nombre });
  if (fechaAltaStr) infoItems.push({ label: 'Fecha de alta deseada', value: fechaAltaStr });
  if (dept) infoItems.push({ label: 'Departamento', value: dept });
  if (grupoStr) infoItems.push({ label: 'Grupo / Equipo', value: grupoStr });
  if (telefono) infoItems.push({ label: 'Teléfono', value: telefono, isLink: true, href: 'tel:' + telefono });
  if (workerEmail) infoItems.push({ label: 'Email', value: workerEmail, isLink: true, href: 'mailto:' + workerEmail });
  if (iban) infoItems.push({ label: 'IBAN / Cuenta bancaria', value: iban });

  const infoRowsHtml = infoItems.map(item => {
    const valHtml = item.isLink
      ? `<a href="${item.href}" style="color:${accentColor};text-decoration:none;font-weight:500;">${item.value}</a>`
      : item.value;
    return `<p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">${item.label}</p>
    <p style="margin:0 0 14px;font-size:14px;color:#1a1a1a;font-family:'Poppins','Segoe UI',sans-serif;">${valHtml}</p>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Poppins','Segoe UI',Arial,sans-serif;letter-spacing:-0.01em;">
<div style="max-width:620px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg, ${accentColor}, #7ab300);border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <img src="${logoUrl}" alt="Verdnatura" width="56" height="56" style="width:56px;height:56px;margin-bottom:12px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;font-family:'Poppins','Segoe UI',sans-serif;">Alta de trabajador</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">Solicitud de incorporación</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;border-radius:0 0 16px 16px;">
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:${accentColor};text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Nuevo trabajador/a</p>
      <span style="display:inline-block;background:${accentColor};color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;">${nombre}</span>
    </div>
    <div style="line-height:1.75;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.01em;">
      <p style="margin:0 0 16px;">${solicitante ? `Se solicita por <span style="font-weight:600;color:#1a1a1a;">${String(solicitante).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span> el alta del siguiente trabajador:` : 'Se solicita el alta del siguiente trabajador:'}</p>
      <div style="padding:16px 20px;background:#f8fafc;border-radius:12px;margin:16px 0;">
        ${infoRowsHtml}
      </div>
      ${infoAdicional && String(infoAdicional).trim() ? `<div style="margin:16px 0;padding:16px 20px;background:#fffbeb;border-radius:12px;border:1px solid #fde68a;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Información adicional</p>
        <p style="margin:0;font-size:14px;color:#1a1a1a;font-family:'Poppins','Segoe UI',sans-serif;line-height:1.6;white-space:pre-wrap;">${String(infoAdicional).trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}</p>
      </div>` : ''}
      <div style="margin:16px 0;padding:14px 16px;background:#f0f9e8;border-radius:12px;border:1px solid ${accentColor}30;">
        <p style="margin:0;font-size:13px;color:#4d7c0f;font-family:'Poppins','Segoe UI',sans-serif;">📎 Los documentos se encuentran adjuntos a este correo (${filesCount} archivo${filesCount > 1 ? 's' : ''}).</p>
      </div>
    </div>
    <div style="margin-top:28px;line-height:1.4;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">
      <p style="margin:0 0 16px;">Muchas gracias y un saludo,</p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-right:16px;vertical-align:middle;"><img src="${logoGreenUrl}" alt="Verdnatura" width="40" height="40" style="width:40px;height:40px;display:block;"></td>
          <td style="padding-right:16px;border-right:2px solid ${accentColor};vertical-align:middle;">
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
          <td><span style="display:inline-block;background:${accentColor}18;color:${accentColor};padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">Alta</span></td>
          ${fechaAltaStr ? `<td><span style="display:inline-block;background:#fef3c7;color:#92400e;padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${fechaAltaStr}</span></td>` : ''}
          ${dept ? `<td><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${dept}</span></td>` : ''}
        </tr>
      </table>
    </div>
    <div style="margin-top:20px;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:8px;">
        <tr>
          <td style="width:3px;background:${accentColor};border-radius:2px;"></td>
          <td style="padding-left:10px;"><span style="font-size:11px;font-weight:600;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;">Enviado desde Operativa · Verdnatura</span></td>
        </tr>
      </table>
      <p style="margin:0;font-size:11px;color:#94a3b8;font-family:'Poppins','Segoe UI',sans-serif;">Enviado por ${managerName} · Este correo es confidencial.</p>
    </div>
  </div>
</div>
</body></html>`;
}

// Helper function to send email notification securely
async function sendEmailNotification(params: {
  to: string;
  type: string;
  requestId?: string;
  data: any;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-vacation-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_EMAIL_SECRET || '',
      },
      body: JSON.stringify(params),
    });

    const result = await response.json();
    if (!result.success) {
      console.error('Email send failed:', result.error);
      return { success: false, error: result.error };
    }
    console.log('Email sent successfully to:', params.to);
    return { success: true };
  } catch (error: any) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, sessionToken, data } = await req.json();

    console.log(`Admin operation: ${action}`);

    // SECURITY: Public actions have been moved to a dedicated edge function (public-actions)
    // If any client tries to call these here, redirect them or reject
    const deprecatedPublicActions = [
      'getExchangeByToken',
      'respondToExchange',
      'getCalendarModificationByToken',
      'signCalendarModification',
      'rejectCalendarModification',
    ];
    
    if (deprecatedPublicActions.includes(action)) {
      console.log(`Rejected deprecated public action in admin-operations: ${action}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Esta acción ha sido movida. Usa public-actions.',
          redirectTo: 'public-actions' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    // Only sendTestCalendarModificationEmail remains as a special case (internal testing)
    const isPublicAction = ['sendTestCalendarModificationEmail', 'sendTestCalendarSignatureRequestEmail'].includes(action);

    // Default manager for public actions (keeps type non-null across file)
    let manager: { id: string; name: string; role: string } = {
      id: 'public',
      name: 'Public',
      role: 'public',
    };
    let isAdmin = false;

    if (!isPublicAction) {
      // Validate session and check if admin
      if (!sessionToken) {
        return new Response(
          JSON.stringify({ success: false, error: 'No session token' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      const { data: session, error: sessionError } = await supabase
        .from('manager_sessions')
        .select('manager_id, expires_at')
        .eq('token', sessionToken)
        .single();

      if (sessionError || !session) {
        console.log('Invalid session token');
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid session' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      if (new Date(session.expires_at) < new Date()) {
        console.log('Session expired');
        return new Response(
          JSON.stringify({ success: false, error: 'Session expired' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      // Get manager info
      const { data: managerRow, error: managerError } = await supabase
        .from('managers')
        .select('id, name, role, worker_team_id')
        .eq('id', session.manager_id)
        .single();

      if (managerError || !managerRow) {
        console.log('Manager not found for session.manager_id:', session.manager_id, 'Error:', managerError?.message);
        // If manager is not found but session was valid, return 401 to trigger re-login
        return new Response(
          JSON.stringify({ success: false, error: 'Session invalid - please login again' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      manager = managerRow;
      isAdmin = manager.role === 'admin';
      const isResponsable = manager.role === 'responsable';

      // Actions that are allowed for both admins and managers
      const managerAllowedActions = [
        'getVacationRequests',
        'updateVacationRequestStatus',
        'getAuditLogs',
        'getManagerDepartments',
        'getManagerAnnualCalendars',
        'getManagerWorkerGroups',
        'getCalendarReviewAlerts',
        'resolveCalendarReviewAlert',
        'resolveAllCalendarReviewAlerts',
        'getDepartmentConfigs',
        'getAllWorkerTeams',
        'getDepartmentShifts',
        'updateDepartmentShift',
        'initializeDepartmentShifts',
        'addDepartmentShift',
        'deleteDepartmentShift',
        // Weekly shift configs (per-week independent)
        'getWeeklyShifts',
        'initializeWeeklyShifts',
        'updateWeeklyShift',
        'addWeeklyShift',
        'deleteWeeklyShift',
        'reorderWeeklyShifts',
        // Labor schedules
        'getWeeklySchedule',
        'saveWeeklySchedule',
        'getScheduleHistory',
        'removeVacationFromCalendar',
        // Trial periods
        'getManagerTrialPeriodWorkers',
       // Personal schedules
       'getPersonalSchedules',
       'createPersonalScheduleRotationGroup',
       'updatePersonalScheduleRotationGroup',
       'deletePersonalScheduleRotationGroup',
       'createPersonalWorkSchedule',
       'updatePersonalWorkSchedule',
       'deletePersonalWorkSchedule',
       'getWorkerPersonalScheduleForWeek',
       // Workforce
       'getWorkforceForDay',
        // Performance thresholds
        'getPerformanceThresholds',
        // Job positions (vacantes)
        'list_job_positions',
        'create_job_position',
        'update_job_position',
        'toggle_job_position',
        'delete_job_position',
        'set_default_job_position',
        'list_applications',
        'update_application',
        'get_cv_signed_url',
      ];

      // Actions allowed for consulta role (read-only access)
      const consultaAllowedActions = [
        'markDepartmentReviewed',
        'getAllWorkerGroups',
        'getVacationRequests',
        // Schedules - view only
        'getWeeklySchedule',
        'getDepartmentConfigs',
        'getDepartmentShifts',
        'getWeeklyShifts',
        // Candidaturas / Vacantes - full management (same as admin)
        'list_job_positions',
        'create_job_position',
        'update_job_position',
        'toggle_job_position',
        'delete_job_position',
        'set_default_job_position',
        'list_applications',
        'update_application',
        'get_cv_signed_url',
      ];
      
      // SECURITY: Actions that ONLY admin_principal can perform
      // These are the most critical actions that could compromise the system
      const adminPrincipalOnlyActions = [
        'createManager',
        'deleteManager',
        'updateManagerRole',
        'updateManagerCandidaturasOnly',
        'deleteDepartment',
        'deleteAllData',
        'bulkDeleteWorkers',
        'repairSignedModifications',
      ];
      
      // SECURITY: Check if action requires admin_principal role
      if (adminPrincipalOnlyActions.includes(action)) {
        // Verify the manager has admin_principal role in system_user_roles
        const { data: systemRole } = await supabase
          .from('system_user_roles')
          .select('role')
          .eq('user_identifier', manager.id)
          .eq('user_type', 'manager')
          .single();
        
        const hasAdminPrincipal = systemRole?.role === 'admin_principal';
        
        // Fallback: also accept legacy admin role from managers table
        if (!hasAdminPrincipal && manager.role !== 'admin') {
          // Log security event inline (can't use helper yet as it's defined later)
          const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
          try {
            await supabase.from('security_events').insert({
              event_type: 'ADMIN_ONLY_ACTION_DENIED',
              severity: 'critical',
              actor_id: manager.id,
              actor_type: 'manager',
              ip_address: clientIp,
              user_agent: req.headers.get('user-agent') || null,
              details: {
                action,
                actorId: manager.id,
                actorName: manager.name,
                actorRole: manager.role,
                systemRole: systemRole?.role || 'none'
              }
            });
          } catch (e) {
            console.error('Failed to log security event:', e);
          }
          console.log(`SECURITY: Denied admin-only action ${action} for ${manager.name} (role: ${manager.role})`);
          return new Response(
            JSON.stringify({ success: false, error: 'Solo el administrador principal puede realizar esta acción' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
          );
        }
      }

      // Check if action requires admin-only access
      const isManagerAllowedAction = managerAllowedActions.includes(action);
      const isConsultaAllowedAction = consultaAllowedActions.includes(action);
      const isConsulta = manager.role === 'consulta';

      // Responsables have same permissions as managers for allowed actions
      if (!isAdmin && !isManagerAllowedAction && !(isConsulta && isConsultaAllowedAction) && !isResponsable) {
        // Responsables can use the same actions as managers
        if (!(isResponsable && managerAllowedActions.includes(action))) {
          console.log('Not authorized, action not allowed:', action);
          return new Response(
            JSON.stringify({ success: false, error: 'Access denied' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
          );
        }
      }

      console.log(`${isAdmin ? 'Admin' : isResponsable ? 'Responsable' : 'Manager'} ${manager.name} performing action: ${action}`);
    } else {
      console.log(`Public action (no session required): ${action}`);
    }

    // Helper function to generate slug from name
    const generateSlug = (name: string): string => {
      return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9]+/g, '') // Remove non-alphanumeric
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
    };

    // Helper function to log audit events
    const logAudit = async (
      actionType: string,
      entityType: string,
      entityId: string | null,
      entityData: any,
      details: string
    ) => {
      try {
        await supabase.from('audit_logs').insert({
          action_type: actionType,
          actor_name: manager.name,
          actor_role: manager.role,
          entity_type: entityType,
          entity_id: entityId,
          entity_data: entityData,
          details: details
        });
        console.log(`Audit logged: ${actionType} on ${entityType} by ${manager.name}`);
      } catch (err) {
        console.error('Failed to log audit:', err);
      }
    };

    // Handle different admin operations

    // SECURITY: Helper to log security events
    const logSecurityEvent = async (
      eventType: string,
      severity: 'info' | 'warning' | 'critical',
      details: Record<string, any>
    ) => {
      try {
        const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        await supabase.from('security_events').insert({
          event_type: eventType,
          severity,
          actor_id: manager.id,
          actor_type: manager.role === 'public' ? 'public' : 'manager',
          ip_address: clientIp,
          user_agent: req.headers.get('user-agent') || null,
          details
        });
      } catch (e) {
        console.error('Failed to log security event:', e);
      }
    };
    
    // Create manager - SECURITY: Only admin can create managers with elevated roles
    if (action === 'createManager') {
      const { name, role: requestedRole, worker_id: reqWorkerId, worker_team_id: reqWorkerTeamId } = data;
      
      if (!name) {
        return new Response(
          JSON.stringify({ success: false, error: 'Manager name required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Email is required for non-responsable roles
      const managerEmail = data.email ? data.email.trim().toLowerCase() : null;
      if (!managerEmail && requestedRole !== 'responsable') {
        return new Response(
          JSON.stringify({ success: false, error: 'El email es obligatorio para crear un encargado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // SECURITY: Enforce role restrictions
      // Only admin can create admins or consulta roles
      // Default to 'manager' if no role specified
      let safeRole = 'manager';
      
      if (requestedRole) {
        if (requestedRole === 'admin' || requestedRole === 'consulta') {
          // Only admins can create users with elevated roles
          if (!isAdmin) {
            await logSecurityEvent('PRIVILEGE_ESCALATION_ATTEMPT', 'critical', {
              attemptedAction: 'createManager',
              attemptedRole: requestedRole,
              actorRole: manager.role,
              actorName: manager.name
            });
            return new Response(
              JSON.stringify({ success: false, error: 'Solo administradores pueden crear usuarios con roles elevados' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
            );
          }
          safeRole = requestedRole;
        } else if (requestedRole === 'manager') {
          safeRole = 'manager';
        } else if (requestedRole === 'responsable') {
          // Responsable role - requires admin to create
          if (!isAdmin) {
            await logSecurityEvent('PRIVILEGE_ESCALATION_ATTEMPT', 'critical', {
              attemptedAction: 'createManager',
              attemptedRole: requestedRole,
              actorRole: manager.role,
              actorName: manager.name
            });
            return new Response(
              JSON.stringify({ success: false, error: 'Solo administradores pueden crear responsables' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
            );
          }
          safeRole = 'responsable';
        } else {
          // Unknown role, default to manager
          console.log(`Unknown role requested: ${requestedRole}, defaulting to manager`);
          safeRole = 'manager';
        }
      }

      // Generate setup token for password configuration (only if email provided)
      const setupToken = managerEmail ? crypto.randomUUID() : null;
      
      const insertData: any = {
          name,
          role: safeRole,
          password_hash: null,
          email: managerEmail || null,
          setup_token: setupToken,
          candidaturas_only: !!data.candidaturas_only,
          department_id: data.department_id || null,
        };

      // For responsable role, add worker_id, worker_team_id and parent_manager_id
      if (safeRole === 'responsable' && reqWorkerId) {
        insertData.worker_id = reqWorkerId;
        insertData.worker_team_id = reqWorkerTeamId || null;
        if (data.parent_manager_id) {
          insertData.parent_manager_id = data.parent_manager_id;
        }
      }

      const { data: newManager, error: createError } = await supabase
        .from('managers')
        .insert(insertData)
        .select()
        .single();

      if (createError) {
        console.error('Error creating manager:', createError);
        if (createError.code === '23505') {
          return new Response(
            JSON.stringify({ success: false, error: 'Ya existe un encargado con ese nombre o email' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create manager' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      if (safeRole === 'manager' && data.department_id) {
        await supabase
          .from('manager_department_assignments')
          .upsert(
            { manager_id: newManager.id, department_id: data.department_id },
            { onConflict: 'manager_id,department_id' }
          );
      }

      // Create system role entry
      await supabase.from('system_user_roles').insert({
        user_identifier: newManager.id,
        user_type: 'manager',
        role: safeRole === 'admin' ? 'admin_principal' : safeRole === 'consulta' ? 'consulta' : 'encargado',
        assigned_by: manager.name
      });

      // Send welcome email with setup link (only if email provided)
      if (managerEmail && setupToken) {
        try {
          await sendEmailNotification({
            to: managerEmail,
            type: 'manager_welcome',
            data: {
              managerName: name,
              managerEmail: managerEmail,
              setupToken: setupToken,
            }
          });
          console.log('Welcome email sent to:', managerEmail);
        } catch (emailErr) {
          console.error('Failed to send welcome email (manager created anyway):', emailErr);
        }
      }

      await logAudit('CREATE', 'manager', newManager.id, { name, role: safeRole, email: managerEmail }, `Manager created by ${manager.name}`);
      console.log(`Manager ${newManager.id} created successfully with role ${safeRole}`);
      
      return new Response(
        JSON.stringify({ success: true, manager: newManager }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Block/unblock manager
    if (action === 'blockManager') {
      const { managerId: targetId, blocked } = data;
      
      if (!targetId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Manager ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Cannot block yourself
      if (targetId === manager.id) {
        return new Response(
          JSON.stringify({ success: false, error: 'No puedes bloquearte a ti mismo' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error: blockError } = await supabase
        .from('managers')
        .update({ is_blocked: !!blocked })
        .eq('id', targetId);

      if (blockError) {
        console.error('Error blocking manager:', blockError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update block status' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // If blocking, also delete all their sessions to kick them out immediately
      if (blocked) {
        await supabase
          .from('manager_sessions')
          .delete()
          .eq('manager_id', targetId);
        console.log(`Manager ${targetId} BLOCKED and all sessions deleted`);
      } else {
        console.log(`Manager ${targetId} UNBLOCKED`);
      }

      await logAudit(blocked ? 'BLOCK' : 'UNBLOCK', 'manager', targetId, { blocked }, `Manager ${blocked ? 'blocked' : 'unblocked'} by ${manager.name}`);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete manager
    if (action === 'deleteManager') {
      const { managerId } = data;
      
      if (!managerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Manager ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Delete system role entry
      await supabase
        .from('system_user_roles')
        .delete()
        .eq('user_identifier', managerId);

      // Delete manager sessions first
      await supabase
        .from('manager_sessions')
        .delete()
        .eq('manager_id', managerId);

      // Delete manager department assignments
      await supabase
        .from('manager_department_assignments')
        .delete()
        .eq('manager_id', managerId);

      // Delete the manager
      const { error: deleteError } = await supabase
        .from('managers')
        .delete()
        .eq('id', managerId);

      if (deleteError) {
        console.error('Error deleting manager:', deleteError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to delete manager' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Manager ${managerId} deleted successfully`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update manager department assignment
    if (action === 'updateManagerDepartment') {
      const { managerId, departmentId } = data;
      
      if (!managerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Manager ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Delete existing assignments
      await supabase
        .from('manager_department_assignments')
        .delete()
        .eq('manager_id', managerId);

      // Create new assignment if departmentId provided
      if (departmentId) {
        const { error: insertError } = await supabase
          .from('manager_department_assignments')
          .insert({ manager_id: managerId, department_id: departmentId });

        if (insertError) {
          console.error('Error assigning department:', insertError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to assign department' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
      }

      console.log(`Manager ${managerId} department updated`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update manager with multiple department assignments
    if (action === 'updateManagerDepartments') {
      const { managerId, departmentIds } = data;
      
      if (!managerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Manager ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Delete existing assignments
      const { error: deleteError } = await supabase
        .from('manager_department_assignments')
        .delete()
        .eq('manager_id', managerId);

      if (deleteError) {
        console.error('Error deleting existing assignments:', deleteError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update department assignments' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Create new assignments if departmentIds provided
      if (departmentIds && Array.isArray(departmentIds) && departmentIds.length > 0) {
        const assignmentsToInsert = departmentIds.map((deptId: string) => ({
          manager_id: managerId,
          department_id: deptId
        }));

        const { error: insertError } = await supabase
          .from('manager_department_assignments')
          .insert(assignmentsToInsert);

        if (insertError) {
          console.error('Error inserting department assignments:', insertError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to assign departments' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
      }

      console.log(`Manager ${managerId} updated with ${departmentIds?.length || 0} department(s)`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Toggle "candidaturas only" restricted access for a manager (admin only)
    if (action === 'updateManagerCandidaturasOnly') {
      const { managerId, value } = data;
      if (!managerId || typeof value !== 'boolean') {
        return new Response(
          JSON.stringify({ success: false, error: 'managerId and boolean value required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      const { error: updErr } = await supabase
        .from('managers')
        .update({ candidaturas_only: value })
        .eq('id', managerId);
      if (updErr) {
        console.error('Error updating candidaturas_only:', updErr);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update access' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
      // Invalidate all sessions of this manager so the change takes effect immediately
      await supabase.from('manager_sessions').delete().eq('manager_id', managerId);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'createDepartment') {
      const { name, description, max_days_per_employee, manager_email, manager_id } = data;
      
      if (!name) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department name required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Generate slug from name
      let slug = generateSlug(name);
      
      // Check if slug exists and make unique if needed
      const { data: existing } = await supabase
        .from('departments')
        .select('slug')
        .eq('slug', slug);
      
      if (existing && existing.length > 0) {
        slug = `${slug}${Date.now().toString().slice(-4)}`;
      }

      // Create department with slug
      const { data: newDept, error: createError } = await supabase
        .from('departments')
        .insert({
          name,
          description: description || null,
          max_days_per_employee: max_days_per_employee || 5,
          manager_email: manager_email || null,
          slug,
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating department:', createError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create department' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Assign manager if provided
      if (manager_id && newDept) {
        await supabase
          .from('manager_department_assignments')
          .insert({
            manager_id: manager_id,
            department_id: newDept.id,
          });
      }

      console.log(`Department ${newDept.id} created successfully`);
      return new Response(
        JSON.stringify({ success: true, department: newDept }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'deleteDepartment') {
      const departmentId = data.departmentId;
      
      if (!departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Delete in correct order to respect foreign keys
      
      // 1. Delete manager assignments
      await supabase
        .from('manager_department_assignments')
        .delete()
        .eq('department_id', departmentId);

      // 2. Delete department availabilities
      await supabase
        .from('department_availabilities')
        .delete()
        .eq('department_id', departmentId);

      // 3. Get vacation requests for this department
      const { data: requests } = await supabase
        .from('vacation_requests')
        .select('id')
        .eq('department_id', departmentId);

      // 4. Delete vacation request dates
      if (requests && requests.length > 0) {
        for (const req of requests) {
          await supabase
            .from('vacation_request_dates')
            .delete()
            .eq('vacation_request_id', req.id);
        }
      }

      // 5. Delete vacation requests
      await supabase
        .from('vacation_requests')
        .delete()
        .eq('department_id', departmentId);

      // 6. Finally delete the department
      const { error: deleteError } = await supabase
        .from('departments')
        .delete()
        .eq('id', departmentId);

      if (deleteError) {
        console.error('Error deleting department:', deleteError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to delete department' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Department ${departmentId} deleted successfully`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'deleteVacationRequest') {
      const requestId = data.requestId;
      
      if (!requestId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Request ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get request data before deleting for audit
      const { data: requestData } = await supabase
        .from('vacation_requests')
        .select(`
          *,
          vacation_request_dates(date, half_day)
        `)
        .eq('id', requestId)
        .single();

      // Get department name
      let deptName = 'Desconocido';
      if (requestData?.department_id) {
        const { data: dept } = await supabase
          .from('departments')
          .select('name')
          .eq('id', requestData.department_id)
          .single();
        deptName = dept?.name || 'Desconocido';
      }

      // Delete request dates first
      await supabase
        .from('vacation_request_dates')
        .delete()
        .eq('vacation_request_id', requestId);

      // Delete the request
      const { error: deleteError } = await supabase
        .from('vacation_requests')
        .delete()
        .eq('id', requestId);

      if (deleteError) {
        console.error('Error deleting request:', deleteError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to delete request' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Log audit
      await logAudit(
        'delete_vacation_request',
        'vacation_request',
        requestId,
        requestData,
        `Solicitud de vacaciones de ${requestData?.employee_name || 'Desconocido'} (${requestData?.worker_number || 'N/A'}) en ${deptName} eliminada`
      );

      console.log(`Request ${requestId} deleted successfully`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'updateRequestStatus') {
      const { requestId, status, rejectionReason } = data;
      
      if (!requestId || !status) {
        return new Response(
          JSON.stringify({ success: false, error: 'Request ID and status required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const updateData: any = { status };
      if (status === 'REJECTED' && rejectionReason) {
        updateData.admin_rejection_reason = rejectionReason;
      }

      const { error: updateError } = await supabase
        .from('vacation_requests')
        .update(updateData)
        .eq('id', requestId);

      if (updateError) {
        console.error('Error updating request:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update request' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Request ${requestId} updated to ${status}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'updateDepartment') {
      const { departmentId, name, description, max_days_per_employee, require_all_days, manager_email, manager_id, slug, max_concurrent_workers_global, auto_block_by_concurrency, manual_free_days_enabled, manual_free_days_value } = data;
      
      if (!departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check if slug is unique if provided
      if (slug) {
        const { data: existingSlug } = await supabase
          .from('departments')
          .select('id')
          .eq('slug', slug)
          .neq('id', departmentId);
        
        if (existingSlug && existingSlug.length > 0) {
          return new Response(
            JSON.stringify({ success: false, error: 'Esta URL ya está en uso por otro departamento' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
      }

      // Update department
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (max_days_per_employee !== undefined) updateData.max_days_per_employee = max_days_per_employee;
      if (require_all_days !== undefined) updateData.require_all_days = require_all_days;
      if (manager_email !== undefined) updateData.manager_email = manager_email;
      if (slug !== undefined) updateData.slug = slug;
      if (max_concurrent_workers_global !== undefined) updateData.max_concurrent_workers_global = max_concurrent_workers_global;
      if (auto_block_by_concurrency !== undefined) updateData.auto_block_by_concurrency = auto_block_by_concurrency;
      if (manual_free_days_enabled !== undefined) updateData.manual_free_days_enabled = manual_free_days_enabled;
      if (manual_free_days_value !== undefined) updateData.manual_free_days_value = manual_free_days_value;

      const { error: updateError } = await supabase
        .from('departments')
        .update(updateData)
        .eq('id', departmentId);

      if (updateError) {
        console.error('Error updating department:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update department' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Update manager assignment if provided
      if (manager_id !== undefined) {
        // Delete existing assignments for this department
        await supabase
          .from('manager_department_assignments')
          .delete()
          .eq('department_id', departmentId);

        // Create new assignment if manager_id provided
        if (manager_id) {
          await supabase
            .from('manager_department_assignments')
            .insert({ manager_id: manager_id, department_id: departmentId });
        }
      }

      console.log(`Department ${departmentId} updated successfully`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'duplicateDepartment') {
      const { departmentId } = data;
      
      if (!departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get original department
      const { data: originalDept, error: fetchError } = await supabase
        .from('departments')
        .select('*')
        .eq('id', departmentId)
        .single();

      if (fetchError || !originalDept) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Generate new slug
      const baseSlug = generateSlug(originalDept.name + ' copia');
      let newSlug = baseSlug;
      const { data: existingSlug } = await supabase
        .from('departments')
        .select('slug')
        .eq('slug', baseSlug);
      
      if (existingSlug && existingSlug.length > 0) {
        newSlug = `${baseSlug}${Date.now().toString().slice(-4)}`;
      }

      // Create new department
      const { data: newDept, error: createError } = await supabase
        .from('departments')
        .insert({
          name: originalDept.name + ' (copia)',
          description: originalDept.description,
          max_days_per_employee: originalDept.max_days_per_employee,
          manager_email: originalDept.manager_email,
          slug: newSlug,
        })
        .select()
        .single();

      if (createError || !newDept) {
        console.error('Error duplicating department:', createError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to duplicate department' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Copy availabilities
      const { data: availabilities } = await supabase
        .from('department_availabilities')
        .select('date')
        .eq('department_id', departmentId);

      if (availabilities && availabilities.length > 0) {
        const newAvailabilities = availabilities.map(a => ({
          department_id: newDept.id,
          date: a.date,
        }));
        
        await supabase
          .from('department_availabilities')
          .insert(newAvailabilities);
      }

      // Copy manager assignments
      const { data: assignments } = await supabase
        .from('manager_department_assignments')
        .select('manager_id')
        .eq('department_id', departmentId);

      if (assignments && assignments.length > 0) {
        const newAssignments = assignments.map(a => ({
          department_id: newDept.id,
          manager_id: a.manager_id,
        }));
        
        await supabase
          .from('manager_department_assignments')
          .insert(newAssignments);
      }

      console.log(`Department ${departmentId} duplicated to ${newDept.id}`);
      return new Response(
        JSON.stringify({ success: true, department: newDept }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'updateDepartmentAvailabilities') {
      const { departmentId, dates } = data;
      
      if (!departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Delete existing availabilities
      const { error: deleteError } = await supabase
        .from('department_availabilities')
        .delete()
        .eq('department_id', departmentId);

      if (deleteError) {
        console.error('Error deleting availabilities:', deleteError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update calendar' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Insert new dates if provided
      if (dates && dates.length > 0) {
        // Handle both formats: array of strings or array of {date, half_day} objects
        const inserts = dates.map((item: string | { date: string; half_day?: boolean }) => {
          if (typeof item === 'string') {
            return {
              department_id: departmentId,
              date: item,
              half_day: false,
            };
          } else {
            return {
              department_id: departmentId,
              date: item.date,
              half_day: item.half_day || false,
            };
          }
        });

        const { error: insertError } = await supabase
          .from('department_availabilities')
          .insert(inserts);

        if (insertError) {
          console.error('Error inserting availabilities:', insertError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to save dates' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
      }

      console.log(`Department ${departmentId} availabilities updated: ${dates?.length || 0} dates`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get department availabilities for admin panel
    if (action === 'getDepartmentAvailabilities') {
      const { departmentId } = data;
      
      if (!departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: availabilities, error: availError } = await supabase
        .from('department_availabilities')
        .select('date, half_day')
        .eq('department_id', departmentId);

      if (availError) {
        console.error('Error fetching availabilities:', availError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch availabilities' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, availabilities: availabilities || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all managers with departments for admin panel
    if (action === 'getManagers') {
      const { data: managersData, error: managersError } = await supabase
        .from('managers')
        .select(`
          id,
          name,
          role,
          department_id,
          password_hash,
          is_blocked,
          email,
          avatar_url,
          worker_id,
          worker_team_id,
          parent_manager_id,
          candidaturas_only,
          departments(name),
          manager_department_assignments(department_id, departments(id, name))
        `)
        .order('name');

      if (managersError) {
        console.error('Error fetching managers:', managersError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch managers' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Fetched ${managersData?.length || 0} managers`);
      return new Response(
        JSON.stringify({ success: true, managers: managersData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get workers marked as responsable for creating responsable managers
    if (action === 'getResponsableWorkers') {
      const { data: workers, error: workersError } = await supabase
        .from('workers')
        .select('id, name, worker_number, worker_team_id')
        .eq('is_responsable', true)
        .is('deleted_at', null)
        .order('name');

      if (workersError) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch workers' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Get worker's own team as fallback, but prefer the teams where they are assigned as responsable
      const teamIds = workers?.filter(w => w.worker_team_id).map(w => w.worker_team_id!) || [];
      let teamsMap: Record<string, { name: string; display_name: string | null; department_id: string | null }> = {};
      if (teamIds.length > 0) {
        const { data: teams } = await supabase
          .from('worker_teams')
          .select('id, name, display_name, department_id')
          .in('id', teamIds);
        teams?.forEach(t => { teamsMap[t.id] = { name: t.name, display_name: t.display_name, department_id: t.department_id }; });
      }

      const workerIds = workers?.map(w => w.id) || [];
      let responsableTeamsMap: Record<string, Array<{ id: string; name: string; display_name: string | null; department_id: string | null }>> = {};
      if (workerIds.length > 0) {
        const { data: responsableTeams } = await supabase
          .from('worker_teams')
          .select('id, name, display_name, department_id, responsable_worker_id')
          .in('responsable_worker_id', workerIds);

        responsableTeams?.forEach(team => {
          if (!team.responsable_worker_id) return;
          if (!responsableTeamsMap[team.responsable_worker_id]) {
            responsableTeamsMap[team.responsable_worker_id] = [];
          }
          responsableTeamsMap[team.responsable_worker_id].push({
            id: team.id,
            name: team.name,
            display_name: team.display_name,
            department_id: team.department_id,
          });
        });
      }

      // Check which workers already have a manager account
      let managerMap: Record<string, { id: string; email: string | null; password_hash: string | null; is_blocked: boolean }> = {};
      if (workerIds.length > 0) {
        const { data: existingManagers } = await supabase
          .from('managers')
          .select('id, worker_id, email, password_hash, is_blocked')
          .in('worker_id', workerIds)
          .eq('role', 'responsable');
        existingManagers?.forEach(m => {
          if (m.worker_id) managerMap[m.worker_id] = { id: m.id, email: m.email, password_hash: m.password_hash, is_blocked: m.is_blocked || false };
        });
      }

      const enrichedWorkers = workers?.map(w => {
        const ownTeam = w.worker_team_id ? teamsMap[w.worker_team_id] : null;
        const responsableTeams = (responsableTeamsMap[w.id] || []).sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );
        const responsableDisplayNames = Array.from(
          new Set(
            responsableTeams
              .map(team => team.display_name?.trim() || team.name.replace(/\s*-\s*\d+\s*$/, '').trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        const displayTeams = responsableTeams.length > 0 ? responsableTeams : (ownTeam ? [{ id: w.worker_team_id!, name: ownTeam.name, department_id: ownTeam.department_id }] : []);

        return {
          ...w,
          worker_team_name: displayTeams.length > 0 ? displayTeams.map(team => team.name).join(', ') : null,
          department_id: displayTeams[0]?.department_id || ownTeam?.department_id || null,
          responsable_team_names: responsableTeams.map(team => team.name),
          responsable_group_names: responsableDisplayNames,
          responsable_team_ids: responsableTeams.map(team => team.id),
          manager_account: managerMap[w.id] || null,
        };
      }) || [];

      return new Response(
        JSON.stringify({ success: true, workers: enrichedWorkers }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'getDepartments') {
      const { data: departmentsData, error: departmentsError } = await supabase
        .from('departments')
        .select('*')
        .order('name');

      if (departmentsError) {
        console.error('Error fetching departments:', departmentsError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch departments' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Fetched ${departmentsData?.length || 0} departments`);
      return new Response(
        JSON.stringify({ success: true, departments: departmentsData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all manager-department assignments for admin panel
    if (action === 'getAssignments') {
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('manager_department_assignments')
        .select('manager_id, department_id, managers(name, role)');

      if (assignmentsError) {
        console.error('Error fetching assignments:', assignmentsError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch assignments' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Fetched ${assignmentsData?.length || 0} assignments`);
      return new Response(
        JSON.stringify({ success: true, assignments: assignmentsData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get vacation requests - secure endpoint for admin/manager dashboards
    if (action === 'getVacationRequests') {
      const { departmentIds, departmentId, status, managerStatus } = data || {};
      
      // For non-admin managers, validate they can only see their assigned departments
      let allowedDepartmentIds: string[] = [];
      if (!isAdmin) {
        const { data: assignments } = await supabase
          .from('manager_department_assignments')
          .select('department_id')
          .eq('manager_id', manager.id);
        
        allowedDepartmentIds = (assignments || []).map(a => a.department_id);
        
        // If manager has no departments assigned, return empty
        if (allowedDepartmentIds.length === 0) {
          console.log(`Manager ${manager.name} has no department assignments`);
          return new Response(
            JSON.stringify({ success: true, requests: [] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      // Build the query
      let query = supabase
        .from('vacation_requests')
        .select(`
          id,
          employee_name,
          employee_email,
          worker_number,
          notes,
          status,
          manager_status,
          manager_rejection_reason,
          manager_action_by,
          admin_rejection_reason,
          created_at,
          department_id,
          edit_request_reason,
          edit_request_status,
          edit_request_by,
          edit_request_at,
          is_admin_request,
          requested_by_admin_name,
          vacation_request_dates(id, date)
        `)
        .order('created_at', { ascending: false });

      // For non-admin managers, restrict to their assigned departments
      if (!isAdmin) {
        // If departmentIds provided, validate they're in allowed list
        if (departmentIds && departmentIds.length > 0) {
          const validIds = departmentIds.filter((id: string) => allowedDepartmentIds.includes(id));
          if (validIds.length === 0) {
            return new Response(
              JSON.stringify({ success: true, requests: [] }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          query = query.in('department_id', validIds);
        } else {
          query = query.in('department_id', allowedDepartmentIds);
        }
      } else {
        // Admin can filter by specific department IDs
        if (departmentIds && departmentIds.length > 0) {
          query = query.in('department_id', departmentIds);
        }
        
        // Filter by single department (for admin filtering)
        if (departmentId && departmentId !== 'all') {
          query = query.eq('department_id', departmentId);
        }
      }
      
      // Filter by status
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }
      
      // Filter by manager_status
      if (managerStatus && managerStatus !== 'all') {
        query = query.eq('manager_status', managerStatus);
      }

      const { data: requestsData, error: requestsError } = await query;

      if (requestsError) {
        console.error('Error fetching vacation requests:', requestsError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch vacation requests' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Get department info to add to requests
      const { data: deptsData } = await supabase
        .from('departments')
        .select('id, name, manager_email, public_token');
      
      const deptsMap = new Map((deptsData || []).map((d: any) => [d.id, { 
        name: d.name, 
        manager_email: d.manager_email,
        public_token: d.public_token 
      }]));

      // Get workers with their teams - include all fields needed
      const { data: workersData } = await supabase
        .from('workers')
        .select('id, worker_number, department_id, worker_team_id');
      
      console.log(`Fetched ${workersData?.length || 0} workers`);
      
      // Get worker teams
      const { data: teamsData } = await supabase
        .from('worker_teams')
        .select('id, name, department_id');
      
      console.log(`Fetched ${teamsData?.length || 0} teams`);
      
      const teamsMap = new Map((teamsData || []).map((t: any) => [t.id, { id: t.id, name: t.name }]));

      // Get work groups
      const { data: groupsData } = await supabase
        .from('work_groups')
        .select('id, name, color, department_id');
      
      console.log(`Fetched ${groupsData?.length || 0} work groups`);
      
      // Get work group teams (team -> group assignments)
      const { data: workGroupTeamsData } = await supabase
        .from('work_group_teams')
        .select('work_group_id, worker_team_id');
      
      console.log(`Fetched ${workGroupTeamsData?.length || 0} work group team assignments`);

      // Create a map from team_id to work_group
      const teamToGroupMap = new Map<string, any>();
      for (const wgt of (workGroupTeamsData || [])) {
        const group = (groupsData || []).find((g: any) => g.id === wgt.work_group_id);
        if (group) {
          teamToGroupMap.set(wgt.worker_team_id, { id: group.id, name: group.name, color: group.color });
        }
      }

      // Create worker number -> worker info map (grouped by department)
      // Use lowercase worker_number for case-insensitive matching
      const workerInfoMap = new Map<string, { team: any; workGroup: any }>();
      for (const w of (workersData || [])) {
        const key = `${w.worker_number.toLowerCase()}_${w.department_id}`;
        const team = w.worker_team_id ? teamsMap.get(w.worker_team_id) : null;
        const workGroup = w.worker_team_id ? teamToGroupMap.get(w.worker_team_id) : null;
        workerInfoMap.set(key, { team, workGroup });
      }

      // Get manager assignments for departments
      const { data: assignmentsData } = await supabase
        .from('manager_department_assignments')
        .select('department_id, manager_id');
      
      const { data: managersData } = await supabase
        .from('managers')
        .select('id, name');
      
      const managerMap = new Map((managersData || []).map((m: any) => [m.id, m.name]));
      const deptManagerMap = new Map<string, string>();
      for (const a of (assignmentsData || [])) {
        const managerName = managerMap.get(a.manager_id);
        if (managerName) {
          deptManagerMap.set(a.department_id, managerName);
        }
      }

      // Map department data to requests
      const requestsWithDepts = (requestsData || []).map((r: any) => {
        const workerKey = `${r.worker_number.toLowerCase()}_${r.department_id}`;
        const workerInfo = workerInfoMap.get(workerKey);
        const deptInfo = deptsMap.get(r.department_id) || { name: 'Desconocido', manager_email: null, public_token: '' };
        const managerName = deptManagerMap.get(r.department_id) || null;
        
        return {
          ...r,
          departments: { ...deptInfo, manager_name: managerName },
          worker_team: workerInfo?.team || null,
          work_group: workerInfo?.workGroup || null
        };
      });

      console.log(`Fetched ${requestsWithDepts.length} vacation requests`);
      return new Response(
        JSON.stringify({ success: true, requests: requestsWithDepts }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update vacation request status (secure endpoint)
    if (action === 'updateVacationRequestStatus') {
      const { requestId, updates } = data;
      
      if (!requestId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Request ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // For non-admin managers, verify they can update this request
      if (!isAdmin) {
        // Get the request's department
        const { data: request } = await supabase
          .from('vacation_requests')
          .select('department_id')
          .eq('id', requestId)
          .single();
        
        if (!request) {
          return new Response(
            JSON.stringify({ success: false, error: 'Request not found' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          );
        }

        // Check if manager is assigned to this department
        const { data: assignment } = await supabase
          .from('manager_department_assignments')
          .select('id')
          .eq('manager_id', manager.id)
          .eq('department_id', request.department_id)
          .maybeSingle();
        
        if (!assignment) {
          console.log(`Manager ${manager.name} not authorized to update request in department ${request.department_id}`);
          return new Response(
            JSON.stringify({ success: false, error: 'Not authorized for this department' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
          );
        }

        // Managers can only update manager_status related fields, not admin fields
        const allowedFields = ['manager_status', 'manager_rejection_reason', 'manager_approved_at', 'manager_action_by', 'edit_request_reason', 'edit_request_status', 'edit_request_by', 'edit_request_at'];
        const updateKeys = Object.keys(updates || {});
        const hasRestrictedFields = updateKeys.some(key => !allowedFields.includes(key));
        
        if (hasRestrictedFields) {
          console.log(`Manager ${manager.name} tried to update restricted fields`);
          return new Response(
            JSON.stringify({ success: false, error: 'Cannot update admin-only fields' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
          );
        }
        
        // Auto-set manager_action_by when manager_status changes
        if (updates.manager_status && updates.manager_status !== 'PENDING') {
          updates.manager_action_by = manager.name;
        }
      }

      // Get current request data for audit - CRITICAL: include half_day for proper calculation
      const { data: currentRequest } = await supabase
        .from('vacation_requests')
        .select('*, vacation_request_dates(date, half_day)')
        .eq('id', requestId)
        .single();

      const { error: updateError } = await supabase
        .from('vacation_requests')
        .update(updates)
        .eq('id', requestId);

      if (updateError) {
        console.error('Error updating vacation request:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update vacation request' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // CRITICAL: Handle status transitions for free_assignment sync
      // When request changes FROM APPROVED to another status, remove the calendar entries
      const previousStatus = currentRequest?.status;
      const newStatus = updates.status;
      
      if (previousStatus === 'APPROVED' && newStatus && newStatus !== 'APPROVED' && currentRequest) {
        console.log(`[updateVacationRequestStatus] Request ${requestId} changing from APPROVED to ${newStatus}, removing calendar entries`);
        
        // Find the worker
        const { data: worker } = await supabase
          .from('workers')
          .select('id')
          .eq('worker_number', currentRequest.worker_number)
          .eq('department_id', currentRequest.department_id)
          .single();
        
        if (worker) {
          // Find modifications linked to this request
          const { data: linkedMods } = await supabase
            .from('worker_calendar_modifications')
            .select('id')
            .eq('worker_id', worker.id)
            .or(`admin_reason.ilike.%${requestId}%,admin_reason.ilike.%Backfill%`);
          
          if (linkedMods && linkedMods.length > 0) {
            for (const mod of linkedMods) {
              // Check if this modification is specifically for this request
              // by checking if the dates match
              const { data: modDetails } = await supabase
                .from('worker_calendar_modifications')
                .select('admin_reason, added_personal_days')
                .eq('id', mod.id)
                .single();
              
              if (modDetails?.admin_reason?.includes(requestId)) {
                // Delete the personal days linked to this modification
                const { error: deleteErr } = await supabase
                  .from('worker_personal_calendar_days')
                  .delete()
                  .eq('modification_id', mod.id);
                
                if (deleteErr) {
                  console.error(`[updateVacationRequestStatus] Error deleting personal days for mod ${mod.id}:`, deleteErr);
                } else {
                  console.log(`[updateVacationRequestStatus] Deleted personal days for modification ${mod.id}`);
                }
                
                // Delete the modification itself
                await supabase
                  .from('worker_calendar_modifications')
                  .delete()
                  .eq('id', mod.id);
                
                console.log(`[updateVacationRequestStatus] Deleted modification ${mod.id} for rejected request ${requestId}`);
              }
            }
          }
        }
      }
      
      // When request is APPROVED, insert the days into worker_personal_calendar_days
      if (updates.status === 'APPROVED' && currentRequest) {
        const vacationRequestDates = currentRequest.vacation_request_dates || [];
        
        if (vacationRequestDates.length > 0) {
          // Find the worker by worker_number and department_id
          const { data: worker } = await supabase
            .from('workers')
            .select('id')
            .eq('worker_number', currentRequest.worker_number)
            .eq('department_id', currentRequest.department_id)
            .single();
          
          if (worker) {
            // Determine the year from the first date
            const firstDate = vacationRequestDates[0].date;
            const year = parseInt(firstDate.split('-')[0], 10);
            
            // Check if modification already exists for this worker/year/reason to avoid duplicates
            const { data: existingMod } = await supabase
              .from('worker_calendar_modifications')
              .select('id')
              .eq('worker_id', worker.id)
              .eq('year', year)
              .eq('signature', 'APROBADO_POR_ADMIN')
              .ilike('admin_reason', `Aprobación de solicitud%${requestId}%`)
              .maybeSingle();
            
            if (existingMod) {
              console.log(`Modification already exists for request ${requestId}, skipping duplicate creation`);
            } else {
              // Calculate total days for the reason text (accounting for half days)
              const totalDays = vacationRequestDates.reduce((sum: number, d: any) => sum + (d.half_day ? 0.5 : 1), 0);
              
              // Create a calendar modification record to link the personal days
              const { data: modification, error: modError } = await supabase
                .from('worker_calendar_modifications')
                .insert({
                  worker_id: worker.id,
                  department_id: currentRequest.department_id,
                  year,
                  modification_type: 'add_personal_days',
                  admin_name: manager.name,
                  admin_reason: `Aprobación de solicitud de vacaciones (${requestId}) - ${totalDays} día(s)`,
                  status: 'signed',
                  signature: 'APROBADO_POR_ADMIN',
                  signed_at: new Date().toISOString(),
                  added_personal_days: vacationRequestDates.map((d: any) => ({ 
                    date: d.date, 
                    half_day: d.half_day || false,
                    assignmentType: 'free_assignment'
                  })),
                })
                .select('id')
                .single();
              
              if (modError) {
                console.error('Error creating modification for approved request:', modError);
              } else if (modification) {
                // Insert the personal days for each approved date with CORRECT half_day values
                const personalDaysToInsert = vacationRequestDates.map((d: any) => ({
                  worker_id: worker.id,
                  department_id: currentRequest.department_id,
                  modification_id: modification.id,
                  date: d.date,
                  half_day: d.half_day || false,
                  day_type: 'free_assignment',
                  year,
                }));
                
                const { error: insertErr } = await supabase
                  .from('worker_personal_calendar_days')
                  .insert(personalDaysToInsert);
                
                if (insertErr) {
                  console.error('Error inserting approved vacation days:', insertErr);
                } else {
                  console.log(`Inserted ${personalDaysToInsert.length} approved vacation days (${totalDays} total) for worker ${worker.id}`);
                }
              }
            }
          } else {
            console.log(`Worker not found for worker_number=${currentRequest.worker_number}, department_id=${currentRequest.department_id}`);
          }
        }
      }

      // Log audit for status changes
      const changedFields = Object.keys(updates);
      let details = `Solicitud de ${currentRequest?.employee_name || 'Desconocido'} actualizada: `;
      if (updates.status) {
        details += `estado → ${updates.status}`;
      } else if (updates.manager_status) {
        details += `estado encargado → ${updates.manager_status}`;
      } else {
        details += changedFields.join(', ');
      }

      await logAudit(
        'update_vacation_request',
        'vacation_request',
        requestId,
        { before: currentRequest, after: updates },
        details
      );

      console.log(`Vacation request ${requestId} updated by ${isAdmin ? 'admin' : 'manager'} ${manager.name}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete vacation request dates and insert new ones (for edit functionality)
    if (action === 'updateVacationRequestDates') {
      const { requestId, dates } = data;
      
      if (!requestId || !dates) {
        return new Response(
          JSON.stringify({ success: false, error: 'Request ID and dates required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Delete existing dates
      await supabase
        .from('vacation_request_dates')
        .delete()
        .eq('vacation_request_id', requestId);
      
      // Insert new dates
      const newDates = dates.map((date: string) => ({
        vacation_request_id: requestId,
        date: date
      }));

      const { error: insertError } = await supabase
        .from('vacation_request_dates')
        .insert(newDates);

      if (insertError) {
        console.error('Error inserting vacation request dates:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update dates' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Vacation request ${requestId} dates updated`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============ PERSONAL CALENDARS ============

    // Get all personal calendars
    if (action === 'getPersonalCalendars') {
      const { data: calendarsData, error: calendarsError } = await supabase
        .from('personal_calendars')
        .select('*')
        .order('created_at', { ascending: false });

      if (calendarsError) {
        console.error('Error fetching personal calendars:', calendarsError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch personal calendars' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Fetched ${calendarsData?.length || 0} personal calendars`);
      return new Response(
        JSON.stringify({ success: true, calendars: calendarsData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get single personal calendar
    if (action === 'getPersonalCalendar') {
      const { calendarId } = data;
      
      if (!calendarId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Calendar ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: calendarData, error: calendarError } = await supabase
        .from('personal_calendars')
        .select('*')
        .eq('id', calendarId)
        .single();

      if (calendarError) {
        console.error('Error fetching personal calendar:', calendarError);
        return new Response(
          JSON.stringify({ success: false, error: 'Calendar not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Also fetch worker email from workers table by worker_number + department
      let workerEmail: string | null = null;
      if (calendarData.worker_number && calendarData.department_id) {
        const { data: workerRow } = await supabase
          .from('workers')
          .select('email')
          .eq('worker_number', calendarData.worker_number)
          .eq('department_id', calendarData.department_id)
          .is('deleted_at', null)
          .maybeSingle();
        workerEmail = workerRow?.email || null;
      }

      return new Response(
        JSON.stringify({ success: true, calendar: { ...calendarData, worker_email: workerEmail } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create personal calendar
    if (action === 'createPersonalCalendar') {
      const { department_id, worker_name, worker_number, max_days } = data;
      
      if (!department_id || !worker_name || !worker_number) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID, worker name, and worker number are required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Generate slug from worker name
      const baseSlug = worker_name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      let slug = baseSlug;
      const { data: existingSlug } = await supabase
        .from('personal_calendars')
        .select('slug')
        .eq('slug', baseSlug);
      
      if (existingSlug && existingSlug.length > 0) {
        slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
      }

      const { data: newCalendar, error: createError } = await supabase
        .from('personal_calendars')
        .insert({
          department_id,
          worker_name,
          worker_number,
          max_days: max_days || 5,
          slug,
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating personal calendar:', createError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create personal calendar' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Personal calendar ${newCalendar.id} created for ${worker_name}`);
      return new Response(
        JSON.stringify({ success: true, calendar: newCalendar }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update personal calendar
    if (action === 'updatePersonalCalendar') {
      const { calendarId, worker_name, worker_number, max_days, slug, department_id, worker_email } = data;
      
      if (!calendarId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Calendar ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check if slug is unique if provided
      if (slug) {
        const { data: existingSlug } = await supabase
          .from('personal_calendars')
          .select('id')
          .eq('slug', slug)
          .neq('id', calendarId);
        
        if (existingSlug && existingSlug.length > 0) {
          return new Response(
            JSON.stringify({ success: false, error: 'Esta URL ya está en uso' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
      }

      const updateData: any = {};
      if (worker_name !== undefined) updateData.worker_name = worker_name;
      if (worker_number !== undefined) updateData.worker_number = worker_number;
      if (max_days !== undefined) updateData.max_days = max_days;
      if (slug !== undefined) updateData.slug = slug;
      if (department_id !== undefined) updateData.department_id = department_id;

      const { error: updateError } = await supabase
        .from('personal_calendars')
        .update(updateData)
        .eq('id', calendarId);

      // Also update the worker's email in the workers table if provided
      if (worker_email !== undefined && worker_number) {
        const targetDeptId = department_id || (await supabase.from('personal_calendars').select('department_id').eq('id', calendarId).single()).data?.department_id;
        if (targetDeptId) {
          await supabase
            .from('workers')
            .update({ email: worker_email || null })
            .eq('worker_number', worker_number)
            .eq('department_id', targetDeptId)
            .is('deleted_at', null);
        }
      }

      if (updateError) {
        console.error('Error updating personal calendar:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update personal calendar' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Personal calendar ${calendarId} updated`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete personal calendar
    if (action === 'deletePersonalCalendar') {
      const { calendarId } = data;
      
      if (!calendarId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Calendar ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Delete availabilities first
      await supabase
        .from('personal_calendar_availabilities')
        .delete()
        .eq('personal_calendar_id', calendarId);

      const { error: deleteError } = await supabase
        .from('personal_calendars')
        .delete()
        .eq('id', calendarId);

      if (deleteError) {
        console.error('Error deleting personal calendar:', deleteError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to delete personal calendar' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Personal calendar ${calendarId} deleted`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get personal calendar availabilities
    if (action === 'getPersonalCalendarAvailabilities') {
      const { calendarId } = data;
      
      if (!calendarId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Calendar ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: availData, error: availError } = await supabase
        .from('personal_calendar_availabilities')
        .select('date, half_day')
        .eq('personal_calendar_id', calendarId);

      if (availError) {
        console.error('Error fetching availabilities:', availError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch availabilities' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, availabilities: availData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update personal calendar availabilities
    if (action === 'updatePersonalCalendarAvailabilities') {
      const { calendarId, dates } = data;
      
      if (!calendarId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Calendar ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Delete existing availabilities
      await supabase
        .from('personal_calendar_availabilities')
        .delete()
        .eq('personal_calendar_id', calendarId);

      // Insert new dates if provided - dates can be strings or { date, halfDay } objects
      if (dates && dates.length > 0) {
        const inserts = dates.map((item: string | { date: string; halfDay?: boolean }) => {
          if (typeof item === 'string') {
            return {
              personal_calendar_id: calendarId,
              date: item,
              half_day: false,
            };
          }
          return {
            personal_calendar_id: calendarId,
            date: item.date,
            half_day: item.halfDay || false,
          };
        });

        const { error: insertError } = await supabase
          .from('personal_calendar_availabilities')
          .insert(inserts);

        if (insertError) {
          console.error('Error inserting availabilities:', insertError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to save dates' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
      }

      console.log(`Personal calendar ${calendarId} availabilities updated: ${dates?.length || 0} dates`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get worker history - all requests grouped by worker for tracking days used
    if (action === 'getWorkerHistory') {
      const { departmentId } = data || {};
      
      // Build the query - get all requests regardless of status
      let query = supabase
        .from('vacation_requests')
        .select(`
          id,
          employee_name,
          worker_number,
          status,
          created_at,
          department_id,
          vacation_request_dates(id, date)
        `)
        .order('created_at', { ascending: false });

      // Filter by department if specified
      if (departmentId && departmentId !== 'all') {
        query = query.eq('department_id', departmentId);
      }

      const { data: requestsData, error: requestsError } = await query;

      if (requestsError) {
        console.error('Error fetching worker history:', requestsError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch worker history' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Get departments for name mapping
      const { data: deptsData } = await supabase
        .from('departments')
        .select('id, name, max_days_per_employee, require_all_days');
      
      const deptsMap = new Map((deptsData || []).map((d: any) => [d.id, { 
        name: d.name, 
        max_days_per_employee: d.max_days_per_employee,
        require_all_days: d.require_all_days
      }]));

      console.log(`Fetched ${requestsData?.length || 0} requests for worker history`);
      return new Response(
        JSON.stringify({ success: true, requests: requestsData, departments: Object.fromEntries(deptsMap) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============ WORKER TEAMS & WORKERS ============

    // Get worker groups data for a department
    if (action === 'getWorkerGroupsData') {
      const { departmentId } = data;
      
      if (!departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get worker teams
      const { data: workerTeams } = await supabase
        .from('worker_teams')
        .select('*, display_name')
        .eq('department_id', departmentId)
        .order('sort_order');

      // Get workers (exclude deleted)
      const { data: workers } = await supabase
        .from('workers')
        .select('*')
        .eq('department_id', departmentId)
        .is('deleted_at', null)
        .order('name');

      // Get work groups (vacation color groups)
      const { data: workGroups } = await supabase
        .from('work_groups')
        .select('*')
        .eq('department_id', departmentId)
        .order('sort_order');

      // Get work group team assignments
      const { data: workGroupTeams } = await supabase
        .from('work_group_teams')
        .select('*');

      // Filter workGroupTeams to only those related to this department's teams
      const teamIds = (workerTeams || []).map(t => t.id);
      const filteredWorkGroupTeams = (workGroupTeams || []).filter(wgt => 
        teamIds.includes(wgt.worker_team_id)
      );

      return new Response(
        JSON.stringify({ 
          success: true, 
          workerTeams: workerTeams || [],
          workers: workers || [],
          workGroups: workGroups || [],
          workGroupTeams: filteredWorkGroupTeams
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search worker by number or name across all departments
    if (action === 'searchWorkerByNumber') {
      const { workerNumber, query } = data;
      const searchQuery = query || workerNumber;
      
      if (!searchQuery) {
        return new Response(
          JSON.stringify({ success: false, error: 'Search query required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Search workers by worker_number, name, or worker_code (partial match) - exclude deleted
      const [res1, res2, res3] = await Promise.all([
        supabase
          .from('workers')
          .select('*')
          .ilike('worker_number', `%${searchQuery}%`)
          .is('deleted_at', null)
          .order('worker_number')
          .limit(25),
        supabase
          .from('workers')
          .select('*')
          .ilike('name', `%${searchQuery}%`)
          .is('deleted_at', null)
          .order('name')
          .limit(25),
        supabase
          .from('workers')
          .select('*')
          .ilike('worker_code', `%${searchQuery}%`)
          .is('deleted_at', null)
          .order('name')
          .limit(25),
      ]);

      if (res1.error && res2.error && res3.error) {
        console.error('Error searching workers:', res1.error || res2.error || res3.error);
        return new Response(
          JSON.stringify({ success: false, error: 'Search failed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Combine and deduplicate results
      const combinedMap = new Map();
      for (const w of [...(res1.data || []), ...(res2.data || []), ...(res3.data || [])]) {
        if (!combinedMap.has(w.id)) {
          combinedMap.set(w.id, w);
        }
      }
      const workers = Array.from(combinedMap.values());

      // Get department names for all found workers
      const departmentIds = [...new Set(workers.map(w => w.department_id))];
      const { data: departments } = await supabase
        .from('departments')
        .select('id, name')
        .in('id', departmentIds.length > 0 ? departmentIds : ['none']);

      const deptMap = new Map((departments || []).map(d => [d.id, d.name]));

      const workersWithDept = workers.map(w => ({
        ...w,
        departmentName: deptMap.get(w.department_id) || 'Desconocido'
      }));

      return new Response(
        JSON.stringify({ success: true, workers: workersWithDept }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create worker team
    if (action === 'createWorkerTeam') {
      const { departmentId, name } = data;
      
      if (!departmentId || !name) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID and name required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get max sort order
      const { data: existing } = await supabase
        .from('worker_teams')
        .select('sort_order')
        .eq('department_id', departmentId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const maxOrder = existing?.[0]?.sort_order || 0;

      const { data: newTeam, error: createError } = await supabase
        .from('worker_teams')
        .insert({
          department_id: departmentId,
          name: name,
          sort_order: maxOrder + 1
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating worker team:', createError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create team' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Worker team ${newTeam.id} created`);
      return new Response(
        JSON.stringify({ success: true, team: newTeam }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update worker team
    if (action === 'updateWorkerTeam') {
      const { teamId, name } = data;
      
      if (!teamId || !name) {
        return new Response(
          JSON.stringify({ success: false, error: 'Team ID and name required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: updatedTeam, error: updateError } = await supabase
        .from('worker_teams')
        .update({ name })
        .eq('id', teamId)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating worker team:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update team' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Worker team ${teamId} updated`);
      return new Response(
        JSON.stringify({ success: true, team: updatedTeam }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Toggle worker team schedule lock
    if (action === 'toggleTeamScheduleLock') {
      const { teamId, isLocked } = data;
      
      if (!teamId || isLocked === undefined) {
        return new Response(
          JSON.stringify({ success: false, error: 'Team ID and isLocked required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: updatedTeam, error: updateError } = await supabase
        .from('worker_teams')
        .update({ is_schedule_locked: isLocked })
        .eq('id', teamId)
        .select()
        .single();

      if (updateError) {
        console.error('Error toggling team schedule lock:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to toggle schedule lock' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Worker team ${teamId} schedule lock set to ${isLocked}`);
      return new Response(
        JSON.stringify({ success: true, team: updatedTeam }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // Reorder worker teams (update sort_order)
    if (action === 'reorderTeams') {
      const { teamOrders } = data;
      
      if (!teamOrders || !Array.isArray(teamOrders)) {
        return new Response(
          JSON.stringify({ success: false, error: 'teamOrders array required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Update each team's sort_order
      for (const item of teamOrders) {
        const { teamId, sortOrder } = item;
        if (!teamId || sortOrder === undefined) continue;
        
        const { error: updateError } = await supabase
          .from('worker_teams')
          .update({ sort_order: sortOrder })
          .eq('id', teamId);

        if (updateError) {
          console.error('Error updating team sort order:', updateError);
        }
      }

      console.log(`Reordered ${teamOrders.length} teams`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete worker team
    if (action === 'deleteWorkerTeam') {
      const { teamId } = data;
      
      if (!teamId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Team ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Remove team assignments from work_group_teams
      await supabase
        .from('work_group_teams')
        .delete()
        .eq('worker_team_id', teamId);

      // Set workers' team to null
      await supabase
        .from('workers')
        .update({ worker_team_id: null })
        .eq('worker_team_id', teamId);

      // Delete the team
      const { error: deleteError } = await supabase
        .from('worker_teams')
        .delete()
        .eq('id', teamId);

      if (deleteError) {
        console.error('Error deleting worker team:', deleteError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to delete team' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Worker team ${teamId} deleted`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create worker
    if (action === 'createWorker') {
      const { departmentId, name, workerNumber, workerTeamId } = data;
      
      if (!departmentId || !name || !workerNumber) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID, name, and worker number required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: newWorker, error: createError } = await supabase
        .from('workers')
        .insert({
          department_id: departmentId,
          name: name,
          worker_number: workerNumber,
          worker_team_id: workerTeamId || null
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating worker:', createError);
        if (createError.code === '23505') {
          return new Response(
            JSON.stringify({ success: false, error: 'Ya existe un trabajador con ese número de fichar en este departamento' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create worker' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Worker ${newWorker.id} created`);
      return new Response(
        JSON.stringify({ success: true, worker: newWorker }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update worker
    if (action === 'updateWorker') {
      let { workerId, name, workerNumber, workerTeamId, workGroupId, email, isOnLeave, isOnVacation, isAltillo, departmentId, vacationDaysAdjustment, workerCode } = data;
      
      if (!workerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get current worker data to check if team or department changed
      const { data: currentWorker } = await supabase
        .from('workers')
        .select('*, worker_teams!workers_worker_team_id_fkey(name)')
        .eq('id', workerId)
        .single();

      if (!currentWorker) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Fallback to existing values when caller only sends partial updates (e.g. solo DNI)
      if (name === undefined || name === null || name === '') name = currentWorker.name;
      if (workerNumber === undefined || workerNumber === null || workerNumber === '') workerNumber = currentWorker.worker_number;
      if (workerTeamId === undefined) workerTeamId = currentWorker.worker_team_id;
      if (workGroupId === undefined) workGroupId = currentWorker.work_group_id;
      if (email === undefined) email = currentWorker.email;
      if (isOnLeave === undefined) isOnLeave = currentWorker.is_on_leave;
      if (isOnVacation === undefined) isOnVacation = currentWorker.is_on_vacation;
      if (isAltillo === undefined) isAltillo = currentWorker.is_altillo;
      if (vacationDaysAdjustment === undefined) vacationDaysAdjustment = currentWorker.vacation_days_adjustment;

      const oldTeamId = currentWorker?.worker_team_id;
      const oldDepartmentId = currentWorker?.department_id;
      const teamChanged = oldTeamId !== (workerTeamId || null);
      const departmentChanged = departmentId && departmentId !== oldDepartmentId;

      // Determine final department and team for conflict check
      const finalDepartmentId = departmentChanged ? departmentId : oldDepartmentId;
      const finalTeamId = workerTeamId || null;

      // Check if this is a Cámara department (uses direct work_group_id assignment)
      const { data: deptInfo } = await supabase
        .from('departments')
        .select('name')
        .eq('id', finalDepartmentId)
        .single();
      const isCamaraDepartment = deptInfo?.name?.toLowerCase() === 'cámara';

      // For non-Cámara departments: if team has a group mapping, force work_group_id to null
      // This prevents conflicts where direct assignment overrides team inheritance
      let finalWorkGroupId = workGroupId || null;
      
      if (!isCamaraDepartment && finalTeamId) {
        const { data: teamMapping } = await supabase
          .from('work_group_teams')
          .select('work_group_id')
          .eq('worker_team_id', finalTeamId)
          .maybeSingle();
        
        if (teamMapping) {
          // Team has a mapping - worker should inherit from team, not have direct assignment
          if (workGroupId && workGroupId !== teamMapping.work_group_id) {
            console.log(`Auto-clearing conflicting work_group_id for worker ${workerId}. Team ${finalTeamId} maps to ${teamMapping.work_group_id}, but direct assignment was ${workGroupId}`);
          }
          finalWorkGroupId = null; // Let worker inherit from team
        }
      }

      // Build update object
      const updateData: any = {
        name,
        worker_number: workerNumber,
        worker_team_id: finalTeamId,
        work_group_id: finalWorkGroupId,
        email: email || null,
        is_on_leave: isOnLeave === true,
        is_on_vacation: isOnVacation === true,
        is_altillo: isAltillo === true,
        vacation_days_adjustment: typeof vacationDaysAdjustment === 'number' ? vacationDaysAdjustment : 0
      };

      // Support worker_code update (can come as workerCode or worker_code)
      if (workerCode !== undefined) updateData.worker_code = workerCode || null;
      if (data.worker_code !== undefined) updateData.worker_code = data.worker_code || null;

      // Support fiscal_id update (DNI/NIE) - normalize to uppercase trim
      const normFiscal = (v: any) => (v == null ? null : String(v).trim().toUpperCase() || null);
      if (data.fiscalId !== undefined) updateData.fiscal_id = normFiscal(data.fiscalId);
      if (data.fiscal_id !== undefined) updateData.fiscal_id = normFiscal(data.fiscal_id);

      // Support is_responsable (can come as isResponsable or is_responsable)
      if (data.isResponsable !== undefined) updateData.is_responsable = data.isResponsable === true;
      if (data.is_responsable !== undefined) updateData.is_responsable = data.is_responsable === true;

      // If department is being changed, update it and clear team if changing department
      if (departmentChanged) {
        updateData.department_id = departmentId;
        // If team is not explicitly set for new department, clear it
        if (!workerTeamId) {
          updateData.worker_team_id = null;
        }
      }

      const { data: updatedWorker, error: updateError } = await supabase
        .from('workers')
        .update(updateData)
        .eq('id', workerId)
        .select('*, worker_teams!workers_worker_team_id_fkey(name), work_groups(id, name, color)')
        .single();

      if (updateError) {
        console.error('Error updating worker:', updateError);
        if (updateError.code === '23505') {
          return new Response(
            JSON.stringify({ success: false, error: 'Ya existe un trabajador con ese número de fichar en este departamento' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update worker' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // If team changed and we have email, send notification
      if (teamChanged && (email || updatedWorker?.email)) {
        const workerEmail = email || updatedWorker?.email;
        try {
          const brevoKey = Deno.env.get('BREVO_API_KEY');
          if (brevoKey && workerEmail) {
            // Get department info including slug
            const { data: department } = await supabase
              .from('departments')
              .select('id, name, slug')
              .eq('id', updatedWorker.department_id)
              .single();

            // Get new team info and work group
            let newTeamName = updatedWorker?.worker_teams?.name || null;
            let workGroupName = null;
            let workGroupColor = '#93d600';

            if (workerTeamId) {
              const { data: wgt } = await supabase
                .from('work_group_teams')
                .select('work_group_id')
                .eq('worker_team_id', workerTeamId)
                .maybeSingle();

              if (wgt) {
                const { data: workGroup } = await supabase
                  .from('work_groups')
                  .select('name, color')
                  .eq('id', wgt.work_group_id)
                  .single();
                  
                if (workGroup) {
                  workGroupName = workGroup.name;
                  workGroupColor = workGroup.color;
                }
              }
            }

            const vacationFormUrl = 'https://vnprod.app/vacaciones';
            const verdnaturaGreen = '#93d600';

            // Use department slug for calendar URL
            const calendarPdfUrl = department?.slug ? `https://vnprod.app/calendario/${department.slug}` : vacationFormUrl;

            const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, ${verdnaturaGreen} 0%, #7ab300 100%); padding: 40px 20px; text-align: center; }
    .header img { height: 60px; margin-bottom: 10px; }
    .header-title { color: #ffffff; font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.5px; }
    .content { padding: 40px 30px; }
    .title { color: #1a1a1a; font-size: 20px; font-weight: 600; margin-bottom: 20px; letter-spacing: -0.3px; }
    .text { color: #666666; font-size: 15px; line-height: 1.7; margin-bottom: 15px; font-weight: 400; }
    .info-box { background-color: #f8f9fa; border-left: 4px solid ${verdnaturaGreen}; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0; }
    .info-row { display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid #eee; gap: 15px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #1a1a1a; font-size: 14px; font-weight: 600; min-width: 140px; }
    .info-value { color: #666666; font-size: 14px; font-weight: 400; display: flex; align-items: center; }
    .color-dot { width: 16px; height: 16px; border-radius: 50%; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.15); margin-right: 12px; flex-shrink: 0; }
    .button-row { text-align: center; margin: 30px 0; }
    .button-row table { margin: 0 auto; }
    .button { display: inline-block; background: linear-gradient(135deg, ${verdnaturaGreen} 0%, #7ab300 100%); color: #ffffff !important; padding: 14px 24px; text-decoration: none; border-radius: 30px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 15px rgba(147, 214, 0, 0.4); letter-spacing: -0.2px; min-width: 160px; text-align: center; }
    .footer { background-color: #1a1a1a; color: #ffffff; padding: 25px; text-align: center; }
    .footer-text { color: #888888; font-size: 12px; font-weight: 400; margin: 5px 0; }
    .highlight { color: ${verdnaturaGreen}; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://vnprod.app/images/logo-white.png" alt="Verdnatura" />
      <h1 class="header-title">Cambio de grupo</h1>
    </div>
    <div class="content">
      <p class="title">Hola ${name},</p>
      <p class="text">Te informamos de que tu asignación ha sido <span class="highlight">actualizada</span> en el sistema de gestión de vacaciones de Verdnatura.</p>
      
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Departamento:</span>
          <span class="info-value">${department?.name || 'No asignado'}</span>
        </div>
        ${newTeamName ? `
        <div class="info-row">
          <span class="info-label">Equipo:</span>
          <span class="info-value">${newTeamName}</span>
        </div>
        ` : ''}
        ${workGroupName ? `
        <div class="info-row">
          <span class="info-label">Grupo vacacional:</span>
          <span class="info-value">
            <span class="color-dot" style="background-color: ${workGroupColor};"></span>
            ${workGroupName}
          </span>
        </div>
        ` : ''}
      </div>
      
      <p class="text" style="text-align: center; margin-top: 25px;">Consulta tu calendario actualizado y solicita tus vacaciones:</p>
      
      <div class="button-row">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding: 0 8px;">
              <a href="${vacationFormUrl}" class="button" style="color: #ffffff;">Solicitar Vacaciones</a>
            </td>
            <td style="padding: 0 8px;">
              <a href="${calendarPdfUrl}" class="button" style="color: #ffffff;">Ver Calendario</a>
            </td>
          </tr>
        </table>
      </div>
    </div>
    <div class="footer">
      <p class="footer-text">Este es un correo automático del sistema de vacaciones</p>
      <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
    </div>
  </div>
</body>
</html>`;

            const emailResponse = await sendEmailBrevo({
                from: 'Vacaciones Verdnatura <vacaciones@vnprod.app>',
                to: [workerEmail],
                subject: 'Cambio de grupo - Verdnatura',
                html: emailHtml
            });

            const emailResult = await emailResponse.json();
            console.log('Worker team change email sent:', emailResult);
          }
        } catch (emailErr) {
          console.error('Error sending worker team change email:', emailErr);
        }
      }

      console.log(`Worker ${workerId} updated${teamChanged ? ' (team changed, email sent)' : ''}`);
      return new Response(
        JSON.stringify({ success: true, worker: updatedWorker }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Soft delete worker (mark as deleted but keep in database)
    if (action === 'deleteWorker') {
      const { workerId, reason } = data;
      
      if (!workerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error: deleteError } = await supabase
        .from('workers')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: manager.name,
          deletion_reason: reason || 'Eliminado desde sistema'
        })
        .eq('id', workerId);

      if (deleteError) {
        console.error('Error soft-deleting worker:', deleteError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to delete worker' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Worker ${workerId} soft-deleted by ${manager.name}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Restore deleted worker
    if (action === 'restoreWorker') {
      const { workerId } = data;
      
      if (!workerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error: restoreError } = await supabase
        .from('workers')
        .update({
          deleted_at: null,
          deleted_by: null,
          deletion_reason: null
        })
        .eq('id', workerId);

      if (restoreError) {
        console.error('Error restoring worker:', restoreError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to restore worker' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Worker ${workerId} restored by ${manager.name}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get deleted workers (for history panel)
    if (action === 'getDeletedWorkers') {
      const departmentId = data?.departmentId;
      
      let query = supabase
        .from('workers')
        .select(`
          id,
          worker_number,
          name,
          email,
          department_id,
          deleted_at,
          deleted_by,
          deletion_reason,
          departments:department_id(name),
          worker_teams:worker_team_id(name)
        `)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }

      const { data: deletedWorkers, error } = await query;

      if (error) {
        console.error('Error fetching deleted workers:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch deleted workers' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, deletedWorkers }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Permanently delete worker (hard delete)
    if (action === 'permanentlyDeleteWorker') {
      const { workerId } = data;
      
      if (!workerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error: deleteError } = await supabase
        .from('workers')
        .delete()
        .eq('id', workerId);

      if (deleteError) {
        console.error('Error permanently deleting worker:', deleteError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to permanently delete worker' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Worker ${workerId} permanently deleted by ${manager.name}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get worker by worker number (for public form autocomplete)
    if (action === 'getWorkerByNumber') {
      const { departmentId, workerNumber } = data;
      
      if (!departmentId || !workerNumber) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID and worker number required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: worker } = await supabase
        .from('workers')
        .select(`
          *,
          worker_teams(id, name)
        `)
        .eq('department_id', departmentId)
        .eq('worker_number', workerNumber)
        .is('deleted_at', null)
        .maybeSingle();

      if (!worker) {
        return new Response(
          JSON.stringify({ success: true, worker: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get work group (vacation color) for this worker's team
      let workGroup = null;
      if (worker.worker_team_id) {
        const { data: wgt } = await supabase
          .from('work_group_teams')
          .select('work_group_id')
          .eq('worker_team_id', worker.worker_team_id)
          .maybeSingle();
        
        if (wgt) {
          const { data: wg } = await supabase
            .from('work_groups')
            .select('*')
            .eq('id', wgt.work_group_id)
            .maybeSingle();
          workGroup = wg;
        }
      }

      return new Response(
        JSON.stringify({ success: true, worker, workGroup }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get department correction requests
    if (action === 'getDepartmentCorrectionRequests') {
      const { data: requests, error } = await supabase
        .from('department_correction_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching department correction requests:', error);
        return new Response(JSON.stringify({ success: false, error: 'Error al obtener solicitudes' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get department names
      const deptIds = [...new Set([
        ...(requests || []).map(r => r.current_department_id),
        ...(requests || []).map(r => r.requested_department_id)
      ])];
      const { data: depts } = await supabase.from('departments').select('id, name').in('id', deptIds);
      const deptMap = new Map((depts || []).map(d => [d.id, d.name]));

      const enriched = (requests || []).map(r => ({
        ...r,
        current_department_name: deptMap.get(r.current_department_id) || 'Desconocido',
        requested_department_name: deptMap.get(r.requested_department_id) || 'Desconocido'
      }));

      return new Response(
        JSON.stringify({ success: true, requests: enriched }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process department correction request
    if (action === 'processDepartmentCorrectionRequest') {
      const { requestId, workerId, approve, newDepartmentId, newTeamId } = data;
      
      if (!requestId || !workerId) {
        return new Response(JSON.stringify({ success: false, error: 'Datos requeridos faltantes' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get worker info for email notification
      const { data: worker } = await supabase
        .from('workers')
        .select('name, email, worker_number')
        .eq('id', workerId)
        .single();

      if (approve && newDepartmentId) {
        // Move worker to new department
        const { error: updateErr } = await supabase
          .from('workers')
          .update({ 
            department_id: newDepartmentId,
            worker_team_id: newTeamId || null
          })
          .eq('id', workerId);

        if (updateErr) {
          console.error('Error updating worker:', updateErr);
          return new Response(JSON.stringify({ success: false, error: 'Error al mover trabajador' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // Update request status
      const { error: reqErr } = await supabase
        .from('department_correction_requests')
        .update({
          status: approve ? 'APPROVED' : 'REJECTED',
          processed_at: new Date().toISOString(),
          processed_by: manager.name
        })
        .eq('id', requestId);

      if (reqErr) {
        console.error('Error updating request:', reqErr);
        return new Response(JSON.stringify({ success: false, error: 'Error al actualizar solicitud' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Send email notification if approved and worker has email
      if (approve && worker?.email && newDepartmentId) {
        try {
          const brevoKey = Deno.env.get('BREVO_API_KEY');
          if (brevoKey) {
            // Get new department info
            const { data: newDept } = await supabase
              .from('departments')
              .select('id, name, slug')
              .eq('id', newDepartmentId)
              .single();

            // Get work group color if team assigned
            let workGroupColor = null;
            let workGroupName = null;
            if (newTeamId) {
              const { data: workGroupTeam } = await supabase
                .from('work_group_teams')
                .select('work_group_id')
                .eq('worker_team_id', newTeamId)
                .single();
              
              if (workGroupTeam?.work_group_id) {
                const { data: workGroup } = await supabase
                  .from('work_groups')
                  .select('name, color')
                  .eq('id', workGroupTeam.work_group_id)
                  .single();
                if (workGroup) {
                  workGroupColor = workGroup.color;
                  workGroupName = workGroup.name;
                }
              }
            }

            const verdnaturaGreen = '#93d600';
            const colorHex = workGroupColor || verdnaturaGreen;
            const deptNameFormatted = newDept?.name ? newDept.name.charAt(0).toUpperCase() + newDept.name.slice(1).toLowerCase() : 'tu nuevo departamento';
            const calendarUrl = newDept?.slug ? `https://vnprod.app/calendario/${newDept.slug}` : null;

            const emailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${verdnaturaGreen}; padding: 30px 40px; text-align: center;">
              <img src="https://vnprod.app/images/verdnatura-logo-white.png" alt="Verdnatura" style="height: 40px; width: auto;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 600; color: #1a1a1a;">
                ¡Tu departamento ha sido actualizado!
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #444;">
                Hola <strong>${worker.name}</strong>, tu solicitud de cambio de departamento ha sido <strong style="color: ${verdnaturaGreen};">aprobada</strong>.
              </p>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #444;">
                Tu nuevo departamento es:
              </p>
              <div style="background-color: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  ${workGroupColor ? `<span style="display: inline-block; width: 16px; height: 16px; border-radius: 50%; background-color: ${colorHex}; vertical-align: middle; margin-right: 8px;"></span>` : ''}
                  <span style="font-size: 18px; font-weight: 600; color: #1a1a1a;">${deptNameFormatted}</span>
                  ${workGroupName ? `<span style="font-size: 14px; color: #666; margin-left: 8px;">(${workGroupName})</span>` : ''}
                </div>
              </div>
              <!-- Buttons -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px;">
                    <a href="https://vnprod.app/vacaciones" style="display: inline-block; padding: 14px 32px; background-color: ${verdnaturaGreen}; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
                      Solicitar Vacaciones
                    </a>
                  </td>
                </tr>
                ${calendarUrl ? `
                <tr>
                  <td align="center" style="padding: 8px;">
                    <a href="${calendarUrl}" style="display: inline-block; padding: 14px 32px; background-color: #f0f0f0; color: #333333; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
                      Ver Calendario
                    </a>
                  </td>
                </tr>
                ` : ''}
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 30px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                Este es un mensaje automático de Verdnatura.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

            const emailResponse = await sendEmailBrevo({
                from: 'Vacaciones Verdnatura <vacaciones@vnprod.app>',
                to: [worker.email],
                subject: 'Tu departamento ha sido actualizado',
                html: emailHtml
            });

            if (emailResponse.ok) {
              console.log('Department correction email sent successfully to:', worker.email);
            } else {
              const errText = await emailResponse.text();
              console.error('Failed to send department correction email:', errText);
            }
          }
        } catch (emailErr) {
          console.error('Error sending department correction email:', emailErr);
          // Don't fail the request if email fails
        }
      }

      // Send rejection email notification
      if (!approve && worker?.email) {
        try {
          const brevoKey = Deno.env.get('BREVO_API_KEY');
          if (brevoKey) {
            // Get the requested department info
            const { data: request } = await supabase
              .from('department_correction_requests')
              .select('requested_department_id, current_department_id')
              .eq('id', requestId)
              .single();

            // Get current department name
            const { data: currentDept } = await supabase
              .from('departments')
              .select('name')
              .eq('id', request?.current_department_id)
              .single();

            const verdnaturaRed = '#dc2626';
            const verdnaturaGreen = '#93d600';
            const currentDeptName = currentDept?.name ? currentDept.name.charAt(0).toUpperCase() + currentDept.name.slice(1).toLowerCase() : 'tu departamento actual';

            const rejectionEmailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${verdnaturaRed}; padding: 30px 40px; text-align: center;">
              <img src="https://vnprod.app/images/verdnatura-logo-white.png" alt="Verdnatura" style="height: 40px; width: auto;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 600; color: #1a1a1a;">
                Solicitud de cambio de departamento rechazada
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #444;">
                Hola <strong>${worker.name}</strong>, tu solicitud de cambio de departamento ha sido <strong style="color: ${verdnaturaRed};">rechazada</strong>.
              </p>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #444;">
                Continúas asignado a:
              </p>
              <div style="background-color: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <span style="font-size: 18px; font-weight: 600; color: #1a1a1a;">${currentDeptName}</span>
              </div>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #666;">
                Si crees que esto es un error, contacta con tu encargado.
              </p>
              <!-- Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px;">
                    <a href="https://vnprod.app/vacaciones" style="display: inline-block; padding: 14px 32px; background-color: ${verdnaturaGreen}; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
                      Solicitar Vacaciones
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 30px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                Este es un mensaje automático de Verdnatura.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

            const emailResponse = await sendEmailBrevo({
                from: 'Vacaciones Verdnatura <vacaciones@vnprod.app>',
                to: [worker.email],
                subject: 'Tu solicitud de cambio de departamento ha sido rechazada',
                html: rejectionEmailHtml
            });

            if (emailResponse.ok) {
              console.log('Department correction rejection email sent successfully to:', worker.email);
            } else {
              const errText = await emailResponse.text();
              console.error('Failed to send department correction rejection email:', errText);
            }
          }
        } catch (emailErr) {
          console.error('Error sending department correction rejection email:', emailErr);
          // Don't fail the request if email fails
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete department correction request
    if (action === 'deleteDepartmentCorrectionRequest') {
      const { requestId } = data;
      
      const { error } = await supabase
        .from('department_correction_requests')
        .delete()
        .eq('id', requestId);

      if (error) {
        return new Response(JSON.stringify({ success: false, error: 'Error al eliminar solicitud' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get group join requests
    if (action === 'getGroupJoinRequests') {
      const { data: requests, error } = await supabase
        .from('group_join_requests')
        .select(`
          id,
          worker_number,
          worker_name,
          worker_email,
          department_id,
          status,
          assigned_team_id,
          assigned_work_group_id,
          created_at,
          processed_at,
          processed_by
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching group join requests:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al cargar solicitudes' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Get departments for mapping
      const { data: departments } = await supabase.from('departments').select('id, name');
      const { data: teams } = await supabase.from('worker_teams').select('id, name');
      const { data: workGroups } = await supabase.from('work_groups').select('id, name, color');

      const enriched = requests.map(r => ({
        ...r,
        department_name: departments?.find(d => d.id === r.department_id)?.name || 'Desconocido',
        team_name: teams?.find(t => t.id === r.assigned_team_id)?.name || null,
        work_group: workGroups?.find(wg => wg.id === r.assigned_work_group_id) || null
      }));

      return new Response(
        JSON.stringify({ success: true, requests: enriched }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process group join request (approve/reject)
    if (action === 'processGroupJoinRequest') {
      const { requestId, status, teamId, workGroupId } = data;
      
      if (!requestId || !status) {
        return new Response(
          JSON.stringify({ success: false, error: 'Faltan datos requeridos' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get the request
      const { data: request, error: reqErr } = await supabase
        .from('group_join_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (reqErr || !request) {
        return new Response(
          JSON.stringify({ success: false, error: 'Solicitud no encontrada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      if (status === 'APPROVED') {
        // Create or update worker in workers table
        const { data: existingWorker } = await supabase
          .from('workers')
          .select('id')
          .eq('department_id', request.department_id)
          .eq('worker_number', request.worker_number)
          .single();

        if (existingWorker) {
          // Update existing worker
          await supabase
            .from('workers')
            .update({ 
              name: request.worker_name,
              worker_team_id: teamId || null
            })
            .eq('id', existingWorker.id);
        } else {
          // Create new worker
          await supabase
            .from('workers')
            .insert({
              department_id: request.department_id,
              worker_number: request.worker_number,
              name: request.worker_name,
              worker_team_id: teamId || null
            });
        }
      }

      // Update request status
      const { error: updateErr } = await supabase
        .from('group_join_requests')
        .update({
          status,
          assigned_team_id: teamId || null,
          assigned_work_group_id: workGroupId || null,
          processed_at: new Date().toISOString(),
          processed_by: manager.name
        })
        .eq('id', requestId);

      if (updateErr) {
        console.error('Error updating group join request:', updateErr);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al actualizar solicitud' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete group join request
    if (action === 'deleteGroupJoinRequest') {
      const { requestId } = data;
      
      if (!requestId) {
        return new Response(
          JSON.stringify({ success: false, error: 'ID requerido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get request data before deleting for audit
      const { data: requestData } = await supabase
        .from('group_join_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      const { error } = await supabase
        .from('group_join_requests')
        .delete()
        .eq('id', requestId);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: 'Error al eliminar' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Log audit
      await logAudit(
        'delete_group_join_request',
        'group_join_request',
        requestId,
        requestData,
        `Solicitud de grupo de ${requestData?.worker_name || 'Desconocido'} (${requestData?.worker_number || 'N/A'}) eliminada`
      );

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Complete group join request - add worker and send email
    if (action === 'completeGroupJoinRequest') {
      const { 
        requestId, 
        workerNumber, 
        workerName, 
        departmentId, 
        teamId, 
        workGroupId,
        departmentName,
        teamName,
        workGroupName,
        workGroupColor
      } = data;
      
      if (!requestId || !workerNumber || !workerName || !departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Faltan datos requeridos' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get the original request to get the worker email
      const { data: originalRequest } = await supabase
        .from('group_join_requests')
        .select('worker_email')
        .eq('id', requestId)
        .single();

      const workerEmail = originalRequest?.worker_email;

      // Check if worker already exists
      const { data: existingWorker } = await supabase
        .from('workers')
        .select('id')
        .eq('department_id', departmentId)
        .eq('worker_number', workerNumber)
        .single();

      if (existingWorker) {
        // Update existing worker (including email if provided)
        await supabase
          .from('workers')
          .update({ 
            name: workerName,
            worker_team_id: teamId || null,
            email: workerEmail || null
          })
          .eq('id', existingWorker.id);
      } else {
        // Create new worker (including email if provided)
        await supabase
          .from('workers')
          .insert({
            department_id: departmentId,
            worker_number: workerNumber,
            name: workerName,
            worker_team_id: teamId || null,
            email: workerEmail || null
          });
      }

      // Update request status
      const { error: updateErr } = await supabase
        .from('group_join_requests')
        .update({
          status: 'PROCESSED',
          assigned_team_id: teamId || null,
          assigned_work_group_id: workGroupId || null,
          processed_at: new Date().toISOString(),
          processed_by: manager.name
        })
        .eq('id', requestId);

      if (updateErr) {
        console.error('Error updating group join request:', updateErr);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al actualizar solicitud' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Send notification email to worker if we have their email
      if (workerEmail) {
        try {
          const brevoKey = Deno.env.get('BREVO_API_KEY');
          if (brevoKey) {
            const colorHex = workGroupColor || '#93d600';
            const verdnaturaGreen = '#93d600';
            
            const vacationFormUrl = `https://vnprod.app/vacaciones`;
            
            // Get department slug for calendar URL
            const { data: deptData } = await supabase
              .from('departments')
              .select('slug')
              .eq('id', departmentId)
              .single();
            
            const calendarPdfUrl = deptData?.slug ? `https://vnprod.app/calendario/${deptData.slug}` : vacationFormUrl;
            console.log(`Calendar PDF URL for department ${departmentId}: ${calendarPdfUrl}`);
            
            const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, ${verdnaturaGreen} 0%, #7ab300 100%); padding: 40px 20px; text-align: center; }
    .header img { height: 60px; margin-bottom: 10px; }
    .header-title { color: #ffffff; font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.5px; }
    .content { padding: 40px 30px; }
    .title { color: #1a1a1a; font-size: 20px; font-weight: 600; margin-bottom: 20px; letter-spacing: -0.3px; }
    .text { color: #666666; font-size: 15px; line-height: 1.7; margin-bottom: 15px; font-weight: 400; }
    .info-box { background-color: #f8f9fa; border-left: 4px solid ${verdnaturaGreen}; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0; }
    .info-row { display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid #eee; gap: 15px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #1a1a1a; font-size: 14px; font-weight: 600; min-width: 140px; }
    .info-value { color: #666666; font-size: 14px; font-weight: 400; display: flex; align-items: center; }
    .color-dot { width: 16px; height: 16px; border-radius: 50%; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.15); margin-right: 12px; flex-shrink: 0; }
    .button-row { text-align: center; margin: 30px 0; }
    .button-row table { margin: 0 auto; }
    .button { display: inline-block; background: linear-gradient(135deg, ${verdnaturaGreen} 0%, #7ab300 100%); color: #ffffff !important; padding: 14px 24px; text-decoration: none; border-radius: 30px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 15px rgba(147, 214, 0, 0.4); letter-spacing: -0.2px; min-width: 160px; text-align: center; }
    .footer { background-color: #1a1a1a; color: #ffffff; padding: 25px; text-align: center; }
    .footer-text { color: #888888; font-size: 12px; font-weight: 400; margin: 5px 0; }
    .highlight { color: ${verdnaturaGreen}; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://vnprod.app/images/logo-white.png" alt="Verdnatura" />
      <h1 class="header-title">¡Bienvenido a tu grupo!</h1>
    </div>
    <div class="content">
      <p class="title">Hola ${workerName},</p>
      <p class="text">Tu solicitud de incorporación ha sido <span class="highlight">aprobada</span>. Ya formas parte del sistema de gestión de vacaciones de Verdnatura.</p>
      
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Departamento:</span>
          <span class="info-value">${departmentName}</span>
        </div>
        ${teamName ? `
        <div class="info-row">
          <span class="info-label">Equipo:</span>
          <span class="info-value">${teamName}</span>
        </div>
        ` : ''}
        ${workGroupName ? `
        <div class="info-row">
          <span class="info-label">Grupo vacacional:</span>
          <span class="info-value">
            <span class="color-dot" style="background-color: ${colorHex};"></span>
            ${workGroupName}
          </span>
        </div>
        ` : ''}
      </div>
      
      <p class="text" style="text-align: center; margin-top: 25px;">Ya puedes solicitar tus vacaciones y consultar el calendario de tu departamento:</p>
      
      <div class="button-row">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding: 0 8px;">
              <a href="${vacationFormUrl}" class="button" style="color: #ffffff;">Solicitar Vacaciones</a>
            </td>
            <td style="padding: 0 8px;">
              <a href="${calendarPdfUrl || vacationFormUrl}" class="button" style="color: #ffffff;">Ver Calendario</a>
            </td>
          </tr>
        </table>
      </div>
    </div>
    <div class="footer">
      <p class="footer-text">Este es un correo automático del sistema de vacaciones</p>
      <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
    </div>
  </div>
</body>
</html>`;

            const emailResponse = await sendEmailBrevo({
                from: 'Vacaciones Verdnatura <vacaciones@vnprod.app>',
                to: [workerEmail],
                subject: '¡Bienvenido a tu grupo de trabajo! - Verdnatura',
                html: emailHtml
            });

            const emailResult = await emailResponse.json();
            console.log('Group assignment email sent:', emailResult);
          }
        } catch (emailErr) {
          console.error('Error sending group assignment email:', emailErr);
          // Don't fail the request if email fails
        }
      }

      // Log audit
      await logAudit(
        'complete_group_join_request',
        'group_join_request',
        requestId,
        { workerNumber, workerName, departmentId, departmentName, teamId, teamName, workGroupId, workGroupName, workGroupColor },
        `Trabajador ${workerName} (${workerNumber}) añadido a ${departmentName}, equipo ${teamName || 'ninguno'}, grupo ${workGroupName || 'ninguno'}`
      );

      console.log(`Worker ${workerName} (${workerNumber}) added to department ${departmentName}, team ${teamName || 'none'}, work group ${workGroupName || 'none'} (${workGroupColor || 'no color'})`);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get audit logs
    if (action === 'getAuditLogs') {
      const { entityType, departmentId, limit: queryLimit } = data || {};
      
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (entityType && entityType !== 'all') {
        query = query.eq('entity_type', entityType);
      }

      // Filter by department if specified (for day_blocking type)
      if (departmentId) {
        query = query.eq('entity_id', departmentId);
      }

      query = query.limit(queryLimit || 100);

      const { data: logs, error: logsError } = await query;

      if (logsError) {
        console.error('Error fetching audit logs:', logsError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch audit logs' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, logs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get manager's assigned departments (for manager dashboard)
    if (action === 'getManagerDepartments') {
      // Allow admins to view as any manager (preview mode)
      const targetManagerId = (isAdmin && data?.managerId) ? data.managerId : manager.id;
      
      // Check if target manager is a responsable
      const { data: targetMgr } = await supabase
        .from('managers')
        .select('role, worker_id, worker_team_id, department_id, candidaturas_only')
        .eq('id', targetManagerId)
        .single();

      let departmentIds: string[] = [];

      if (targetMgr?.role === 'consulta') {
        // Consulta role: read-only access to ALL departments
        const { data: allDepts } = await supabase
          .from('departments')
          .select('id, name, public_token, slug');
        return new Response(
          JSON.stringify({ success: true, departments: allDepts || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (targetMgr?.role === 'responsable') {
        // PRIORITY: teams they LEAD via responsable_worker_id
        if (targetMgr.worker_id) {
          const { data: ledTeams } = await supabase
            .from('worker_teams')
            .select('id, department_id')
            .eq('responsable_worker_id', targetMgr.worker_id);

          if (ledTeams && ledTeams.length > 0) {
            departmentIds = [...new Set(ledTeams.map((team) => team.department_id))];
          }
        }

        // Fallback: their own worker_team_id only if they don't lead any team
        if (departmentIds.length === 0 && targetMgr.worker_team_id) {
          const { data: team } = await supabase
            .from('worker_teams')
            .select('department_id')
            .eq('id', targetMgr.worker_team_id)
            .single();
          if (team?.department_id) {
            departmentIds = [team.department_id];
          }
        }
      } else {
        // For regular managers: use department assignments
        const { data: assignments, error: assignmentsError } = await supabase
          .from('manager_department_assignments')
          .select('department_id')
          .eq('manager_id', targetManagerId);

        if (assignmentsError) {
          console.error('Error fetching assignments:', assignmentsError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to fetch assignments' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        departmentIds = assignments?.map(a => a.department_id) || [];

        if (departmentIds.length === 0 && targetMgr?.department_id) {
          departmentIds = [targetMgr.department_id];
        }
      }

      if (departmentIds.length === 0) {
        return new Response(
          JSON.stringify({ success: true, departments: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get department details
      const { data: departments, error: deptsError } = await supabase
        .from('departments')
        .select('id, name, public_token, slug')
        .in('id', departmentIds);

      if (deptsError) {
        console.error('Error fetching departments:', deptsError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch departments' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, departments: departments || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get annual calendars for manager's departments
    if (action === 'getManagerAnnualCalendars') {
      // Allow admins to view as any manager (preview mode)
      const targetManagerId = (isAdmin && data?.managerId) ? data.managerId : manager.id;
      
      // Check if target is a responsable
      const { data: targetMgr } = await supabase
        .from('managers')
        .select('role, worker_id, worker_team_id')
        .eq('id', targetManagerId)
        .single();

      let departmentIds: string[] = [];
      if (targetMgr?.role === 'responsable') {
        // PRIORITY: departments of teams they lead
        if (targetMgr.worker_id) {
          const { data: ledTeams } = await supabase
            .from('worker_teams')
            .select('id, department_id')
            .eq('responsable_worker_id', targetMgr.worker_id);
          if (ledTeams && ledTeams.length > 0) {
            departmentIds = [...new Set(ledTeams.map((team) => team.department_id))];
          }
        }

        // Fallback: own team only if they lead none
        if (departmentIds.length === 0 && targetMgr.worker_team_id) {
          const { data: team } = await supabase.from('worker_teams').select('department_id').eq('id', targetMgr.worker_team_id).single();
          if (team?.department_id) departmentIds = [team.department_id];
        }
      } else {
        const { data: assignments } = await supabase
          .from('manager_department_assignments')
          .select('department_id')
          .eq('manager_id', targetManagerId);
        departmentIds = assignments?.map(a => a.department_id) || [];
      }
      
      if (departmentIds.length === 0) {
        return new Response(
          JSON.stringify({ success: true, calendars: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get annual calendars for those departments
      const { data: calendars, error: calendarsError } = await supabase
        .from('annual_calendars')
        .select('id, year, description, department_id, created_at')
        .in('department_id', departmentIds)
        .order('year', { ascending: false });

      if (calendarsError) {
        return new Response(
          JSON.stringify({ success: false, error: 'Error fetching calendars' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Get department names
      const { data: departments } = await supabase
        .from('departments')
        .select('id, name, slug')
        .in('id', departmentIds);

      const enrichedCalendars = calendars?.map(cal => ({
        ...cal,
        department_name: departments?.find(d => d.id === cal.department_id)?.name || 'Desconocido',
        department_slug: departments?.find(d => d.id === cal.department_id)?.slug || null
      })) || [];

      return new Response(
        JSON.stringify({ success: true, calendars: enrichedCalendars }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get workers with their groups for a department
    if (action === 'getWorkersWithGroups') {
      const { departmentId } = data || {};
      
      if (!departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get department to check for manual free days setting
      const { data: department } = await supabase
        .from('departments')
        .select('manual_free_days_enabled, manual_free_days_value')
        .eq('id', departmentId)
        .single();

      // Get workers with work_group_id for direct color assignment (exclude deleted)
      const { data: workers, error: workersError } = await supabase
        .from('workers')
        .select('id, name, worker_number, worker_team_id, work_group_id')
        .eq('department_id', departmentId)
        .is('deleted_at', null)
        .order('name');

      if (workersError) {
        console.error('Error fetching workers:', workersError);
        return new Response(
          JSON.stringify({ success: false, error: 'Error fetching workers' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Get worker teams
      const { data: teams } = await supabase
        .from('worker_teams')
        .select('id, name')
        .eq('department_id', departmentId);

      // Get work groups with max_free_days and free_days_deduction
      const { data: workGroups } = await supabase
        .from('work_groups')
        .select('id, name, color, max_free_days, free_days_deduction')
        .eq('department_id', departmentId);

      // Get team-to-group assignments
      const { data: teamGroupAssignments } = await supabase
        .from('work_group_teams')
        .select('worker_team_id, work_group_id');

      // Use the latest annual calendar available for this department
      const { data: latestCalendar } = await supabase
        .from('annual_calendars')
        .select('id, year')
        .eq('department_id', departmentId)
        .order('year', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      // Calculate vacation days per group from calendar
      const groupVacationDays: Record<string, number> = {};
      let generalVacationDays = 0;
      
      if (latestCalendar?.id) {
        const { data: calendarDays } = await supabase
          .from('annual_calendar_days')
          .select('day_type, group_id, group_id_2')
          .eq('calendar_id', latestCalendar.id)
          .in('day_type', ['vacaciones_grupo', 'vacaciones_generales']);
        
        if (calendarDays) {
          calendarDays.forEach(day => {
            if (day.day_type === 'vacaciones_generales') {
              generalVacationDays++;
              return;
            }
            if (day.day_type === 'vacaciones_grupo') {
              if (day.group_id) {
                groupVacationDays[day.group_id] = (groupVacationDays[day.group_id] || 0) + 1;
              }
              if (day.group_id_2) {
                groupVacationDays[day.group_id_2] = (groupVacationDays[day.group_id_2] || 0) + 1;
              }
            }
          });
        }
      }

      // Map teams to groups
      const teamToGroup: Record<string, string> = {};
      teamGroupAssignments?.forEach(a => {
        teamToGroup[a.worker_team_id] = a.work_group_id;
      });

      // Enrich workers with team and group info
      const enrichedWorkers = workers?.map(w => {
        const team = teams?.find(t => t.id === w.worker_team_id);
        // Worker can have direct work_group_id or inherit from team
        const groupId = w.work_group_id || (w.worker_team_id ? teamToGroup[w.worker_team_id] : null);
        const group = groupId ? workGroups?.find(g => g.id === groupId) : null;
        
        // Calculate remaining free days
        // If manual mode is enabled, use the manual value for all workers
        let remainingFreeDays: number | null = null;
        const groupDeduction = group?.free_days_deduction || 0;
        if (department?.manual_free_days_enabled && department.manual_free_days_value !== null) {
          remainingFreeDays = department.manual_free_days_value - groupDeduction;
        } else if (group && group.max_free_days !== null) {
          // Automatic calculation: max_free_days - (group vacation days + general vacation days) - deduction
          const usedDays = (groupVacationDays[group.id] || 0) + generalVacationDays;
          remainingFreeDays = Math.max(0, group.max_free_days - usedDays - groupDeduction);
        }
        
        return {
          id: w.id,
          name: w.name,
          worker_number: w.worker_number,
          team_name: team?.name || null,
          group_name: group?.name || null,
          group_color: group?.color || null,
          max_free_days: remainingFreeDays,
        };
      }) || [];

      return new Response(
        JSON.stringify({ success: true, workers: enrichedWorkers }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get worker groups for manager's departments
    if (action === 'getManagerWorkerGroups') {
      // Allow admins to view as any manager (preview mode)
      const targetManagerId = (isAdmin && data?.managerId) ? data.managerId : manager.id;
      
      // Check if target is a responsable
      const { data: targetMgr } = await supabase
        .from('managers')
        .select('role, worker_team_id')
        .eq('id', targetManagerId)
        .single();

      let departmentIds: string[] = [];
      let responsableTeamIds: string[] = [];

      if (targetMgr?.role === 'responsable') {
        // Resolve teams where this manager's worker_id is the responsable
        const { data: targetMgrFull } = await supabase
          .from('managers')
          .select('worker_id')
          .eq('id', targetManagerId)
          .single();
        
        if (targetMgrFull?.worker_id) {
          const { data: ledTeams } = await supabase
            .from('worker_teams')
            .select('id, department_id')
            .eq('responsable_worker_id', targetMgrFull.worker_id);
          
          if (ledTeams && ledTeams.length > 0) {
            responsableTeamIds = ledTeams.map(t => t.id);
            departmentIds = [...new Set(ledTeams.map(t => t.department_id))];
          }
        }
        
        // Fallback: if no teams found via responsable_worker_id, try worker_team_id
        if (responsableTeamIds.length === 0 && targetMgr.worker_team_id) {
          responsableTeamIds = [targetMgr.worker_team_id];
          const { data: team } = await supabase.from('worker_teams').select('department_id').eq('id', targetMgr.worker_team_id).single();
          if (team?.department_id) departmentIds = [team.department_id];
        }
      } else if (targetMgr?.role === 'consulta') {
        // Consulta role: global read access to ALL departments
        const { data: allDepts } = await supabase.from('departments').select('id');
        departmentIds = (allDepts || []).map((d: any) => d.id);
      } else {
        const { data: assignments, error: assignmentsError } = await supabase
          .from('manager_department_assignments')
          .select('department_id')
          .eq('manager_id', targetManagerId);

        if (assignmentsError) {
          return new Response(
            JSON.stringify({ success: false, error: 'Error fetching assignments' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        departmentIds = assignments?.map(a => a.department_id) || [];
      }
      
      if (departmentIds.length === 0) {
        return new Response(
          JSON.stringify({ success: true, workGroups: [], workerTeams: [], workers: [], departments: [], responsableTeamIds: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get work groups for those departments
      const { data: workGroups } = await supabase
        .from('work_groups')
        .select('id, name, color, department_id, sort_order')
        .in('department_id', departmentIds)
        .order('sort_order');

      // Get work group team assignments
      const { data: workGroupTeams } = await supabase
        .from('work_group_teams')
        .select('work_group_id, worker_team_id');

      let workerTeamsQuery = supabase
        .from('worker_teams')
        .select('id, name, display_name, department_id, sort_order, responsable_worker_id, label_id')
        .in('department_id', departmentIds)
        .order('sort_order');

      // For responsable, get only their led teams
      if (responsableTeamIds.length > 0) {
        workerTeamsQuery = supabase
          .from('worker_teams')
          .select('id, name, display_name, department_id, sort_order, responsable_worker_id, label_id')
          .in('id', responsableTeamIds)
          .order('sort_order');
      }

      const { data: workerTeams } = await workerTeamsQuery;

      // Get workers - for responsable, workers in their led teams
      let workersQuery = supabase
        .from('workers')
        .select('id, name, worker_number, worker_code, fiscal_id, worker_team_id, work_group_id, department_id, is_on_leave, is_responsable, start_contract_date')
        .is('deleted_at', null)
        .order('worker_number');

      if (responsableTeamIds.length > 0) {
        workersQuery = workersQuery.in('worker_team_id', responsableTeamIds);
      } else {
        workersQuery = workersQuery.in('department_id', departmentIds);
      }

      const { data: workers } = await workersQuery;

      // Get department names
      const { data: departments } = await supabase
        .from('departments')
        .select('id, name')
        .in('id', departmentIds);

      // Enrich worker teams with their work group assignment
      const enrichedTeams = workerTeams?.map(team => {
        const groupAssignment = workGroupTeams?.find(wgt => wgt.worker_team_id === team.id);
        const workGroup = groupAssignment ? workGroups?.find(wg => wg.id === groupAssignment.work_group_id) : null;
        return {
          ...team,
          work_group_id: groupAssignment?.work_group_id || null,
          work_group_name: workGroup?.name || null,
          work_group_color: workGroup?.color || null,
          department_name: departments?.find(d => d.id === team.department_id)?.name || 'Desconocido'
        };
      }) || [];

      return new Response(
        JSON.stringify({ 
          success: true, 
          workGroups: workGroups || [],
          workerTeams: enrichedTeams,
          workers: workers || [],
          departments: departments || [],
          isResponsable: responsableTeamIds.length > 0,
          responsableTeamIds: responsableTeamIds.length > 0 ? responsableTeamIds : undefined
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
 
    // Get ALL worker groups for consulta dashboard (no department filter)
    if (action === 'getAllWorkerGroups') {
      // Get ALL work groups
      const { data: workGroups } = await supabase
        .from('work_groups')
        .select('id, name, color, department_id, sort_order')
        .order('sort_order');
 
      // Get ALL worker teams
      const { data: workerTeams } = await supabase
        .from('worker_teams')
        .select('id, name, display_name, department_id, sort_order, responsable_worker_id')
        .order('sort_order');
 
      // Get work group team assignments
      const { data: workGroupTeams } = await supabase
        .from('work_group_teams')
        .select('work_group_id, worker_team_id');
 
      // Get ALL active workers
      const { data: workers } = await supabase
        .from('workers')
        .select('id, name, worker_number, worker_team_id, work_group_id, department_id, is_on_leave, start_contract_date, is_responsable')
        .is('deleted_at', null)
        .order('worker_number');
 
      // Get ALL department names
      const { data: departments } = await supabase
        .from('departments')
        .select('id, name');
 
      // Enrich worker teams with their work group assignment
      const enrichedTeams = workerTeams?.map(team => {
        const groupAssignment = workGroupTeams?.find(wgt => wgt.worker_team_id === team.id);
        const workGroup = groupAssignment ? workGroups?.find(wg => wg.id === groupAssignment.work_group_id) : null;
        return {
          ...team,
          work_group_id: groupAssignment?.work_group_id || null,
          work_group_name: workGroup?.name || null,
          work_group_color: workGroup?.color || null,
          department_name: departments?.find(d => d.id === team.department_id)?.name || 'Desconocido'
        };
      }) || [];
 
      return new Response(
        JSON.stringify({ 
          success: true, 
          workGroups: workGroups || [],
          workerTeams: enrichedTeams,
          workers: workers || [],
          departments: departments || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get worker comments
    if (action === 'getWorkerComments') {
      const { workerId } = data;
      
      if (!workerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: comments, error } = await supabase
        .from('worker_comments')
        .select('*')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching comments:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch comments' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, comments: comments || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add worker comment
    if (action === 'addWorkerComment') {
      const { workerId, comment } = data;
      
      if (!workerId || !comment) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID and comment required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: newComment, error } = await supabase
        .from('worker_comments')
        .insert({
          worker_id: workerId,
          comment: comment.trim()
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding comment:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to add comment' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Comment added to worker ${workerId}`);
      return new Response(
        JSON.stringify({ success: true, comment: newComment }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve worker comment
    if (action === 'resolveWorkerComment') {
      const { commentId } = data;
      
      if (!commentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Comment ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error } = await supabase
        .from('worker_comments')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString()
        })
        .eq('id', commentId);

      if (error) {
        console.error('Error resolving comment:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to resolve comment' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Comment ${commentId} resolved`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete worker comment
    if (action === 'deleteWorkerComment') {
      const { commentId } = data;
      
      if (!commentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Comment ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error } = await supabase
        .from('worker_comments')
        .delete()
        .eq('id', commentId);

      if (error) {
        console.error('Error deleting comment:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to delete comment' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Comment ${commentId} deleted`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all workers with active comments (for UI indicators) - now includes latest comment text
    if (action === 'getWorkersWithActiveComments') {
      const { data: activeComments, error } = await supabase
        .from('worker_comments')
        .select('worker_id, comment, created_at')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching active comments:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch active comments' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Get unique worker IDs and their latest comment
      const workerIds: string[] = [];
      const latestComments: { [workerId: string]: string } = {};
      
      for (const c of activeComments || []) {
        if (!workerIds.includes(c.worker_id)) {
          workerIds.push(c.worker_id);
          latestComments[c.worker_id] = c.comment;
        }
      }

      return new Response(
        JSON.stringify({ success: true, workerIds, latestComments }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get workers on vacation today (from annual calendar and approved requests)
    if (action === 'getWorkersOnVacation') {
      const today = new Date().toISOString().split('T')[0];
      
      // 1. Get workers whose work group has vacation days in annual calendar today
      // First, get all annual calendar days for today with group assignments
      const { data: calendarDays } = await supabase
        .from('annual_calendar_days')
        .select('group_id, group_id_2, calendar_id, day_type')
        .eq('date', today)
        .in('day_type', ['vacaciones_grupo', 'vacaciones_generales']);

      // Get the group IDs that have vacation today
      const groupIdsOnVacation = new Set<string>();
      let hasGeneralVacation = false;
      
      for (const day of calendarDays || []) {
        if (day.day_type === 'vacaciones_generales') {
          hasGeneralVacation = true;
        }
        if (day.group_id) groupIdsOnVacation.add(day.group_id);
        if (day.group_id_2) groupIdsOnVacation.add(day.group_id_2);
      }

      // Get department IDs from calendars with vacation days today
      const calendarIds = [...new Set((calendarDays || []).map(d => d.calendar_id))];
      let departmentIdsWithVacation: string[] = [];
      
      if (calendarIds.length > 0) {
        const { data: calendars } = await supabase
          .from('annual_calendars')
          .select('department_id')
          .in('id', calendarIds);
        departmentIdsWithVacation = calendars?.map(c => c.department_id) || [];
      }

      // Get team IDs that belong to these vacation groups
      const groupIdArray = Array.from(groupIdsOnVacation);
      let teamIdsOnVacation: string[] = [];
      
      if (groupIdArray.length > 0) {
        const { data: groupTeams } = await supabase
          .from('work_group_teams')
          .select('worker_team_id')
          .in('work_group_id', groupIdArray);
        teamIdsOnVacation = groupTeams?.map(gt => gt.worker_team_id) || [];
      }

      // Get worker IDs who belong to these teams (vacation from calendar groups)
      let workerIdsFromCalendar: string[] = [];
      if (teamIdsOnVacation.length > 0) {
        const { data: workersFromTeams } = await supabase
          .from('workers')
          .select('id')
          .in('worker_team_id', teamIdsOnVacation);
        workerIdsFromCalendar = workersFromTeams?.map(w => w.id) || [];
      }

      // If general vacation, get all workers from those departments
      let workerIdsFromGeneralVacation: string[] = [];
      if (hasGeneralVacation && departmentIdsWithVacation.length > 0) {
        const { data: workersGeneral } = await supabase
          .from('workers')
          .select('id')
          .in('department_id', departmentIdsWithVacation);
        workerIdsFromGeneralVacation = workersGeneral?.map(w => w.id) || [];
      }

      // 2. Get workers with approved vacation requests for today
      const { data: approvedRequestDates } = await supabase
        .from('vacation_request_dates')
        .select('vacation_request_id')
        .eq('date', today);

      let workerIdsFromApprovedRequests: string[] = [];
      if (approvedRequestDates && approvedRequestDates.length > 0) {
        const requestIds = approvedRequestDates.map(d => d.vacation_request_id);
        
        // Get approved requests
        const { data: approvedRequests } = await supabase
          .from('vacation_requests')
          .select('worker_number, department_id')
          .in('id', requestIds)
          .eq('status', 'APPROVED');

        // Get worker IDs from worker_number
        if (approvedRequests && approvedRequests.length > 0) {
          for (const req of approvedRequests) {
            const { data: worker } = await supabase
              .from('workers')
              .select('id')
              .eq('worker_number', req.worker_number)
              .eq('department_id', req.department_id)
              .single();
            
            if (worker) {
              workerIdsFromApprovedRequests.push(worker.id);
            }
          }
        }
      }

      // Combine all worker IDs on vacation
      const allWorkerIdsOnVacation = [...new Set([
        ...workerIdsFromCalendar,
        ...workerIdsFromGeneralVacation,
        ...workerIdsFromApprovedRequests
      ])];

      console.log(`Workers on vacation today: ${allWorkerIdsOnVacation.length} (calendar: ${workerIdsFromCalendar.length}, general: ${workerIdsFromGeneralVacation.length}, approved: ${workerIdsFromApprovedRequests.length})`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          workerIds: allWorkerIdsOnVacation,
          fromCalendar: workerIdsFromCalendar,
          fromGeneral: workerIdsFromGeneralVacation,
          fromApproved: workerIdsFromApprovedRequests
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send vacation notification email (secure internal endpoint)
    if (action === 'sendVacationEmail') {
      const { to, type, requestId, emailData } = data;
      
      if (!to || !type || !emailData) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing email parameters' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const result = await sendEmailNotification({
        to,
        type,
        requestId,
        data: emailData,
      });

      return new Response(
        JSON.stringify({ success: result.success, error: result.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all workers for CSV import (simplified list for duplicate checking)
    if (action === 'getAllWorkersForImport') {
      if (manager.role !== 'admin') {
        return new Response(
          JSON.stringify({ success: false, error: 'Admin access required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      // Get ALL workers including soft-deleted ones for CSV import to detect conflicts
      const { data: workers, error: workersError } = await supabase
        .from('workers')
        .select('id, worker_number, department_id, worker_team_id, name, is_on_leave, is_on_vacation, pending_vacation_days, role, start_contract_date, deleted_at, worker_code, lines_hour, fiscal_id');

      if (workersError) {
        console.error('Error fetching workers:', workersError);
        return new Response(
          JSON.stringify({ success: false, error: workersError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, workers }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all teams from all departments for CSV import
    if (action === 'getAllTeamsForImport') {
      if (manager.role !== 'admin') {
        return new Response(
          JSON.stringify({ success: false, error: 'Admin access required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const { data: teams, error: teamsError } = await supabase
        .from('worker_teams')
        .select('id, name, department_id, sort_order');

      if (teamsError) {
        console.error('Error fetching teams:', teamsError);
        return new Response(
          JSON.stringify({ success: false, error: teamsError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Fetched ${teams?.length || 0} teams for CSV import`);

      return new Response(
        JSON.stringify({ success: true, teams }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Import a single worker (create or update)
    if (action === 'importWorker') {
      if (manager.role !== 'admin') {
        return new Response(
          JSON.stringify({ success: false, error: 'Admin access required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const { workerNumber, name, departmentId, teamId, teamName, role, isOnLeave, isOnVacation, existingWorkerId, isUpdate, pendingVacationDays, previousDepartmentId, startContractDate, workerCode, linesHour, fiscalId } = data;

      if (!workerNumber || !name || !departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing required fields' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Normalize role - only applicable for CAMARA department
      const normalizedRole = role ? role.trim().toUpperCase() : null;
      const normalizedWorkerCode = workerCode ? workerCode.trim().toUpperCase() : null;
      const normalizedFiscalId = fiscalId ? String(fiscalId).trim().toUpperCase() : null;

      // Resolve or create team if teamName is provided but teamId is missing
      let resolvedTeamId = teamId || null;
      if (!resolvedTeamId && teamName && teamName.trim()) {
        const normalizedTeamName = teamName.trim().toUpperCase();
        
        // Check if team already exists for this department
        const { data: existingTeam } = await supabase
          .from('worker_teams')
          .select('id')
          .eq('department_id', departmentId)
          .ilike('name', normalizedTeamName)
          .maybeSingle();

        if (existingTeam) {
          resolvedTeamId = existingTeam.id;
          console.log(`Found existing team "${normalizedTeamName}" with id ${resolvedTeamId}`);
        } else {
          // Create new team for this department
          const { data: newTeam, error: teamError } = await supabase
            .from('worker_teams')
            .insert({
              department_id: departmentId,
              name: normalizedTeamName,
              sort_order: 0
            })
            .select()
            .single();

          if (teamError) {
            console.error('Error creating team:', teamError);
            // Continue without team if creation fails
          } else {
            resolvedTeamId = newTeam.id;
            console.log(`Created new team "${normalizedTeamName}" with id ${resolvedTeamId}`);
            
            // Log audit for team creation
            await supabase.from('audit_logs').insert({
              action_type: 'CREATE',
              entity_type: 'worker_team',
              entity_id: newTeam.id,
              actor_name: manager.name,
              actor_role: manager.role,
              details: `CSV Import: Auto-created team "${normalizedTeamName}" for department ${departmentId}`,
            });
          }
        }
      }

      // Helper function to create calendar review alert
      const createCalendarReviewAlert = async (workerId: string, workerNumber: string, workerName: string, deptId: string, reason: string) => {
        try {
          // Check if an unresolved alert already exists for this worker
          const { data: existingAlert } = await supabase
            .from('calendar_review_alerts')
            .select('id')
            .eq('worker_id', workerId)
            .eq('is_resolved', false)
            .maybeSingle();

          if (!existingAlert) {
            await supabase.from('calendar_review_alerts').insert({
              worker_id: workerId,
              department_id: deptId,
              worker_number: workerNumber,
              worker_name: workerName,
              reason,
            });
            console.log(`Created calendar review alert for worker ${workerNumber}`);
          } else {
            console.log(`Calendar review alert already exists for worker ${workerNumber}`);
          }
        } catch (err) {
          console.error('Error creating calendar review alert:', err);
        }
      };

      try {
        // Enforce de-facto GLOBAL uniqueness for worker_number by auto-merging any existing duplicates.
        // (DB constraint is per-department; this keeps data consistent with your rule: no duplicates anywhere.)

        const { data: sameNumberWorkers, error: sameNumberError } = await supabase
          .from('workers')
          .select('id, department_id, updated_at')
          .eq('worker_number', workerNumber);

        if (sameNumberError) {
          console.error('Error fetching workers by worker_number:', sameNumberError);
          return new Response(
            JSON.stringify({ success: false, error: sameNumberError.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        // Decide canonical worker:
        // 1) If a worker already exists in target department, keep that one (avoids dept+number conflict)
        // 2) Else keep existingWorkerId if present
        // 3) Else keep the first found
        const inTargetDept = (sameNumberWorkers || []).find(w => w.department_id === departmentId);
        const canonicalId = inTargetDept?.id || existingWorkerId || (sameNumberWorkers?.[0]?.id ?? null);

        const mergeWorkerRefs = async (fromWorkerId: string, toWorkerId: string) => {
          // Move all known references from one worker id to the canonical id
          await Promise.all([
            supabase.from('calendar_review_alerts').update({ worker_id: toWorkerId }).eq('worker_id', fromWorkerId),
            supabase.from('worker_comments').update({ worker_id: toWorkerId }).eq('worker_id', fromWorkerId),
            supabase.from('day_exception_requests').update({ worker_id: toWorkerId }).eq('worker_id', fromWorkerId),
            supabase.from('vacation_group_exchanges').update({ employee_a_id: toWorkerId }).eq('employee_a_id', fromWorkerId),
            supabase.from('vacation_group_exchanges').update({ employee_b_id: toWorkerId }).eq('employee_b_id', fromWorkerId),
          ]);

          // Delete the duplicate worker row
          const { error: delErr } = await supabase.from('workers').delete().eq('id', fromWorkerId);
          if (delErr) {
            console.error('Error deleting duplicate worker:', delErr);
            throw delErr;
          }
        };

        if (canonicalId) {
          // Merge all duplicates into canonical
          const duplicates = (sameNumberWorkers || []).filter(w => w.id !== canonicalId);
          if (duplicates.length > 0) {
            console.log(`Merging ${duplicates.length} duplicate worker(s) for worker_number ${workerNumber} into ${canonicalId}`);
            for (const dup of duplicates) {
              await mergeWorkerRefs(dup.id, canonicalId);
            }

            await supabase.from('audit_logs').insert({
              action_type: 'UPDATE',
              entity_type: 'worker',
              entity_id: canonicalId,
              actor_name: manager.name,
              actor_role: manager.role,
              details: `CSV Import: Auto-merged ${duplicates.length} duplicate record(s) for worker_number ${workerNumber}`,
            });
          }

          // After merge, update canonical worker (may include department/team change)
          const currentDepartmentId = (inTargetDept?.department_id) || (sameNumberWorkers?.find(w => w.id === canonicalId)?.department_id ?? null);
          const departmentChanged = !!(currentDepartmentId && currentDepartmentId !== departmentId);
          // Check if worker is soft-deleted and needs restoration
          const { data: currentWorkerData } = await supabase
            .from('workers')
            .select('deleted_at')
            .eq('id', canonicalId)
            .single();
          
          const isRestoring = !!currentWorkerData?.deleted_at;
          
          const updatePayload: Record<string, any> = {
              name,
              department_id: departmentId,
              worker_team_id: resolvedTeamId,
              role: normalizedRole,
              is_on_leave: isOnLeave || false,
              is_on_vacation: isOnVacation || false,
              pending_vacation_days: pendingVacationDays || 0,
              updated_at: new Date().toISOString(),
            };
          
          // Update worker_code if provided
          if (normalizedWorkerCode) {
            updatePayload.worker_code = normalizedWorkerCode;
          }
          // Update fiscal_id if provided
          if (normalizedFiscalId) {
            updatePayload.fiscal_id = normalizedFiscalId;
          }
          
          // lines_hour removed from worker CSV import - now handled by importPerformanceCSV
          
          // Clear deleted_at if restoring a soft-deleted worker
          if (isRestoring) {
            updatePayload.deleted_at = null;
            console.log(`Restoring soft-deleted worker ${workerNumber}`);
          }
          
          // Only update start_contract_date if provided
          if (startContractDate) {
            updatePayload.start_contract_date = startContractDate;
          }

          const { error: updateError } = await supabase
            .from('workers')
            .update(updatePayload)
            .eq('id', canonicalId);

          if (updateError) {
            console.error('Error updating worker:', updateError);
            return new Response(
              JSON.stringify({ success: false, error: updateError.message }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
            );
          }

          if (departmentChanged) {
            await createCalendarReviewAlert(
              canonicalId,
              workerNumber,
              name,
              departmentId,
              'Empleado asignado a nuevo departamento - calendario de vacaciones pendiente de revisar'
            );
          }

          // lines_hour history removed from worker CSV import - now handled by importPerformanceCSV

          await supabase.from('audit_logs').insert({
            action_type: isRestoring ? 'RESTORE' : 'UPDATE',
            entity_type: 'worker',
            entity_id: canonicalId,
            actor_name: manager.name,
            actor_role: manager.role,
            details: isRestoring 
              ? `CSV Import: Restored soft-deleted worker ${workerNumber} - ${name}` 
              : `CSV Import: Updated worker ${workerNumber} - ${name}${departmentChanged ? ' (department changed)' : ''}`,
          });

          return new Response(
            JSON.stringify({ success: true, action: isRestoring ? 'restored' : 'updated', workerId: canonicalId, departmentChanged }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // No existing worker with this number, create a new one (in this department)
        // (If a duplicate exists, canonicalId would have been set.)
        const insertPayload: Record<string, any> = {
            worker_number: workerNumber,
            name,
            department_id: departmentId,
            worker_team_id: resolvedTeamId,
            role: normalizedRole,
            is_on_leave: isOnLeave || false,
            is_on_vacation: isOnVacation || false,
            pending_vacation_days: pendingVacationDays || 0,
          };
        
        // Set worker_code if provided
        if (normalizedWorkerCode) {
          insertPayload.worker_code = normalizedWorkerCode;
        }
        // Set fiscal_id if provided
        if (normalizedFiscalId) {
          insertPayload.fiscal_id = normalizedFiscalId;
        }
        
        // lines_hour removed from worker CSV import - now handled by importPerformanceCSV
        
        // Only set start_contract_date if provided
        if (startContractDate) {
          insertPayload.start_contract_date = startContractDate;
        }

        const { data: newWorker, error: createError } = await supabase
          .from('workers')
          .insert(insertPayload)
          .select()
          .single();

        if (createError) {
          console.error('Error creating worker:', createError);
          return new Response(
            JSON.stringify({ success: false, error: createError.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        // Create calendar review alert for new employee
        await createCalendarReviewAlert(
          newWorker.id, 
          workerNumber, 
          name, 
          departmentId, 
          'Nuevo empleado - calendario de vacaciones pendiente de revisar'
        );

        // lines_hour history removed from worker CSV import - now handled by importPerformanceCSV

        // Log audit
        await supabase.from('audit_logs').insert({
          action_type: 'CREATE',
          entity_type: 'worker',
          entity_id: newWorker.id,
          actor_name: manager.name,
          actor_role: manager.role,
          details: `CSV Import: Created worker ${workerNumber} - ${name}`,
        });

        return new Response(
          JSON.stringify({ success: true, action: 'created', workerId: newWorker.id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: any) {
        console.error('Error in importWorker:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    }


    // =====================================================
    // Get day exception requests for admin panel
    // =====================================================
    if (action === 'getDayExceptionRequests') {
      const { departmentId, status } = data || {};
      
      let query = supabase
        .from('day_exception_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }
      if (status) {
        query = query.eq('status', status);
      }

      const { data: requests, error } = await query;

      if (error) {
        console.error('Error fetching day exception requests:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Get department names
      const deptIds = [...new Set((requests || []).map(r => r.department_id))];
      const { data: depts } = await supabase
        .from('departments')
        .select('id, name')
        .in('id', deptIds);

      const deptMap = new Map((depts || []).map(d => [d.id, d.name]));

      const enrichedRequests = (requests || []).map(r => ({
        ...r,
        department_name: deptMap.get(r.department_id) || 'Desconocido'
      }));

      return new Response(
        JSON.stringify({ success: true, requests: enrichedRequests }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Approve/reject day exception request by manager
    // =====================================================
    if (action === 'managerActionDayException') {
      const { requestId, approved, rejectionReason } = data || {};
      
      if (!requestId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing request ID' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: request, error: fetchErr } = await supabase
        .from('day_exception_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (fetchErr || !request) {
        return new Response(
          JSON.stringify({ success: false, error: 'Request not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      if (request.status !== 'PENDING_MANAGER') {
        return new Response(
          JSON.stringify({ success: false, error: 'Request is not pending manager approval' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get department for email
      const { data: dept } = await supabase
        .from('departments')
        .select('name, manager_email')
        .eq('id', request.department_id)
        .single();

      const dateObj = new Date(request.request_date + 'T00:00:00');
      const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const formattedDate = `${dateObj.getDate()} de ${months[dateObj.getMonth()]} de ${dateObj.getFullYear()}`;

      if (approved) {
        // Manager approves - pass to admin
        const { error: updateErr } = await supabase
          .from('day_exception_requests')
          .update({
            status: 'PENDING_ADMIN',
            manager_status: 'APPROVED',
            manager_action_by: manager.name
          })
          .eq('id', requestId);

        if (updateErr) {
          return new Response(
            JSON.stringify({ success: false, error: updateErr.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        // Log audit
        await supabase.from('audit_logs').insert({
          action_type: 'day_exception_manager_approved',
          actor_name: manager.name,
          actor_role: manager.role,
          entity_type: 'day_exception',
          entity_id: requestId,
          entity_data: { ...request, department_name: dept?.name },
          details: `Manager aprobó excepción para ${request.worker_name} el ${formattedDate}`
        });

        // Notify admin (send to all admins or main admin email)
        // For now, log that it needs admin attention
        console.log(`Day exception ${requestId} approved by manager, pending admin`);

        return new Response(
          JSON.stringify({ success: true, message: 'Aprobado por encargado, pendiente de admin' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Manager rejects
        const { error: updateErr } = await supabase
          .from('day_exception_requests')
          .update({
            status: 'REJECTED',
            manager_status: 'REJECTED',
            manager_action_by: manager.name,
            manager_rejection_reason: rejectionReason || null
          })
          .eq('id', requestId);

        if (updateErr) {
          return new Response(
            JSON.stringify({ success: false, error: updateErr.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        // Log audit
        await supabase.from('audit_logs').insert({
          action_type: 'day_exception_manager_rejected',
          actor_name: manager.name,
          actor_role: manager.role,
          entity_type: 'day_exception',
          entity_id: requestId,
          entity_data: { ...request, department_name: dept?.name, rejection_reason: rejectionReason },
          details: `Manager rechazó excepción para ${request.worker_name} el ${formattedDate}: ${rejectionReason || 'Sin motivo'}`
        });

        // Notify worker if email available
        if (request.worker_email) {
          await sendEmailNotification({
            to: request.worker_email,
            type: 'day_exception_rejected',
            requestId: requestId,
            data: {
              workerName: request.worker_name,
              departmentName: dept?.name,
              requestDate: formattedDate,
              rejectionReason: rejectionReason || 'No se proporcionó motivo',
              rejectedBy: 'encargado'
            }
          });
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Rechazado por encargado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // =====================================================
    // Approve/reject day exception request by admin
    // =====================================================
    if (action === 'adminActionDayException') {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: 'Only admins can perform this action' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const { requestId, approved, rejectionReason } = data || {};
      
      if (!requestId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing request ID' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: request, error: fetchErr } = await supabase
        .from('day_exception_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (fetchErr || !request) {
        return new Response(
          JSON.stringify({ success: false, error: 'Request not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Admin can approve/reject requests pending admin OR still pending manager (skip manager step).
      if (request.status !== 'PENDING_ADMIN' && request.status !== 'PENDING_MANAGER') {
        return new Response(
          JSON.stringify({ success: false, error: 'Request is not pending approval' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get department for email
      const { data: dept } = await supabase
        .from('departments')
        .select('name')
        .eq('id', request.department_id)
        .single();

      const dateObj = new Date(request.request_date + 'T00:00:00');
      const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const formattedDate = `${dateObj.getDate()} de ${months[dateObj.getMonth()]} de ${dateObj.getFullYear()}`;

      if (approved) {
        // Admin approves - create worker_day_exception
        const { error: exceptionErr } = await supabase
          .from('worker_day_exceptions')
          .insert({
            department_id: request.department_id,
            worker_number: request.worker_number,
            worker_name: request.worker_name,
            exception_date: request.request_date,
            exception_request_id: requestId,
            approved_by: manager.name
          });

        if (exceptionErr) {
          console.error('Error creating worker exception:', exceptionErr);
          return new Response(
            JSON.stringify({ success: false, error: exceptionErr.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        // Update request status
        const updatePayload: Record<string, any> = {
          status: 'APPROVED',
          admin_status: 'APPROVED',
          admin_action_by: manager.name,
          admin_action_at: new Date().toISOString(),
        };

        // If admin approves directly while still pending manager, mark manager step as skipped.
        if (request.status === 'PENDING_MANAGER') {
          updatePayload.manager_status = request.manager_status || 'SKIPPED';
        }

        const { error: updateErr } = await supabase
          .from('day_exception_requests')
          .update(updatePayload)
          .eq('id', requestId);

        if (updateErr) {
          return new Response(
            JSON.stringify({ success: false, error: updateErr.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        // Log audit
        await supabase.from('audit_logs').insert({
          action_type: 'day_exception_admin_approved',
          actor_name: manager.name,
          actor_role: manager.role,
          entity_type: 'day_exception',
          entity_id: requestId,
          entity_data: { ...request, department_name: dept?.name },
          details: `Admin aprobó excepción para ${request.worker_name} el ${formattedDate}`
        });

        // Notify worker if email available
        if (request.worker_email) {
          await sendEmailNotification({
            to: request.worker_email,
            type: 'day_exception_approved',
            requestId: requestId,
            data: {
              workerName: request.worker_name,
              departmentName: dept?.name,
              requestDate: formattedDate
            }
          });
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Excepción aprobada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Admin rejects
        const { error: updateErr } = await supabase
          .from('day_exception_requests')
          .update({
            status: 'REJECTED',
            admin_status: 'REJECTED',
            admin_action_by: manager.name,
            admin_action_at: new Date().toISOString(),
            admin_rejection_reason: rejectionReason || null
          })
          .eq('id', requestId);

        if (updateErr) {
          return new Response(
            JSON.stringify({ success: false, error: updateErr.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        // Log audit
        await supabase.from('audit_logs').insert({
          action_type: 'day_exception_admin_rejected',
          actor_name: manager.name,
          actor_role: manager.role,
          entity_type: 'day_exception',
          entity_id: requestId,
          entity_data: { ...request, department_name: dept?.name, rejection_reason: rejectionReason },
          details: `Admin rechazó excepción para ${request.worker_name} el ${formattedDate}: ${rejectionReason || 'Sin motivo'}`
        });

        // Notify worker if email available
        if (request.worker_email) {
          await sendEmailNotification({
            to: request.worker_email,
            type: 'day_exception_rejected',
            requestId: requestId,
            data: {
              workerName: request.worker_name,
              departmentName: dept?.name,
              requestDate: formattedDate,
              rejectionReason: rejectionReason || 'No se proporcionó motivo',
              rejectedBy: 'administrador'
            }
          });
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Excepción rechazada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Delete day exception request (admin only)
    if (action === 'deleteDayExceptionRequest') {
      const { requestId } = data;
      
      if (!requestId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Request ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // First delete any worker_day_exceptions linked to this request
      await supabase
        .from('worker_day_exceptions')
        .delete()
        .eq('exception_request_id', requestId);

      // Then delete the request itself
      const { error } = await supabase
        .from('day_exception_requests')
        .delete()
        .eq('id', requestId);

      if (error) {
        console.error('Error deleting day exception request:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al eliminar solicitud' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Day exception request ${requestId} deleted by ${manager.name}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate real row count from functional tables
    if (action === 'calculateRowCount') {
      console.log('Calculating real row count from functional tables...');
      
      // Tables that count as usage (functional tables)
      const functionalTables = [
        'vacation_requests',
        'vacation_request_dates',
        'day_exception_requests',
        'worker_day_exceptions',
        'work_groups',
        'work_group_teams',
        'workers',
        'worker_teams',
        'worker_comments',
        'departments',
        'department_availabilities',
        'department_day_overrides',
        'department_correction_requests',
        'personal_calendars',
        'personal_calendar_availabilities',
        'annual_calendars',
        'annual_calendar_days',
        'custom_day_types',
        'group_join_requests'
      ];

      let totalRows = 0;
      const tableCounts: Record<string, number> = {};

      for (const table of functionalTables) {
        try {
          const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });
          
          if (!error && count !== null) {
            tableCounts[table] = count;
            totalRows += count;
          }
        } catch (err) {
          console.error(`Error counting ${table}:`, err);
        }
      }

      console.log('Row counts by table:', tableCounts);
      console.log('Total rows:', totalRows);

      // Get current app settings
      const { data: currentSettings } = await supabase
        .from('app_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (currentSettings) {
        // Update current_rows
        const updateData: any = { current_rows: totalRows };
        
        // Auto-lock if limit reached
        if (totalRows >= currentSettings.max_rows && !currentSettings.is_locked) {
          updateData.is_locked = true;
          updateData.lock_reason = 'Límite del plan gratuito alcanzado';
          console.log('Auto-locking app: limit reached');
        }

        await supabase
          .from('app_settings')
          .update(updateData)
          .eq('id', currentSettings.id);

        // Get updated settings
        const { data: updatedSettings } = await supabase
          .from('app_settings')
          .select('*')
          .eq('id', currentSettings.id)
          .single();

        return new Response(
          JSON.stringify({ 
            success: true, 
            totalRows, 
            tableCounts,
            settings: updatedSettings
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, totalRows, tableCounts }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update app settings (admin only)
    if (action === 'updateAppSettings') {
      const { id, max_rows, warning_threshold, is_locked, lock_reason } = data;
      
      if (!id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Settings ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error: updateError } = await supabase
        .from('app_settings')
        .update({
          max_rows,
          warning_threshold,
          is_locked,
          lock_reason
        })
        .eq('id', id);

      if (updateError) {
        console.error('Error updating app settings:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al actualizar configuración' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Log audit
      await logAudit(
        is_locked ? 'app_locked' : 'app_settings_updated',
        'app_settings',
        id,
        { max_rows, warning_threshold, is_locked, lock_reason },
        is_locked 
          ? `Aplicación bloqueada: ${lock_reason || 'Sin motivo'}` 
          : `Configuración actualizada: máx ${max_rows} filas, umbral ${warning_threshold}%`
      );

      console.log(`App settings updated by ${manager.name}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =============================================
    // GROUP EXCHANGE OPERATIONS
    // =============================================

    // Get group exchanges for a department (or all departments)
    if (action === 'getGroupExchanges') {
      const { departmentId } = data;

      // Fetch exchanges — optionally filtered by department
      let exchangesQuery = supabase
        .from('vacation_group_exchanges')
        .select('*')
        .order('created_at', { ascending: false });

      if (departmentId) {
        exchangesQuery = exchangesQuery.eq('department_id', departmentId);
      }

      const { data: exchanges, error: exchangesError } = await exchangesQuery;

      if (exchangesError) {
        console.error('Error fetching exchanges:', exchangesError);
        return new Response(
          JSON.stringify({ success: false, error: 'Error fetching exchanges' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Collect unique department IDs from exchanges to fetch relevant workers/groups
      const deptIds = [...new Set((exchanges || []).map((e: any) => e.department_id))];
      if (departmentId && !deptIds.includes(departmentId)) {
        deptIds.push(departmentId);
      }

      // Fetch workers for relevant departments
      let workersQuery = supabase
        .from('workers')
        .select('id, name, worker_number, email, work_group_id, worker_team_id, department_id');
      if (departmentId) {
        workersQuery = workersQuery.eq('department_id', departmentId);
      } else if (deptIds.length > 0) {
        workersQuery = workersQuery.in('department_id', deptIds);
      }
      const { data: workers } = await workersQuery;

      // Fetch work groups
      let workGroupsQuery = supabase
        .from('work_groups')
        .select('id, name, color, department_id');
      if (departmentId) {
        workGroupsQuery = workGroupsQuery.eq('department_id', departmentId);
      } else if (deptIds.length > 0) {
        workGroupsQuery = workGroupsQuery.in('department_id', deptIds);
      }
      const { data: workGroups } = await workGroupsQuery;

      // Fetch work group teams
      const { data: workGroupTeams } = await supabase
        .from('work_group_teams')
        .select('work_group_id, worker_team_id');

      return new Response(
        JSON.stringify({ 
          success: true, 
          exchanges: exchanges || [],
          workers: workers || [],
          workGroups: workGroups || [],
          workGroupTeams: workGroupTeams || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a new group exchange
    if (action === 'createGroupExchange') {
      const { departmentId, employeeAId, employeeBId, originalGroupAId, originalGroupBId, temporaryGroupAId, temporaryGroupBId, year } = data;

      // Validate required fields
      if (!departmentId || !employeeAId || !employeeBId || !year) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing required fields' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check for existing exchange in same year
      const { data: existing } = await supabase
        .from('vacation_group_exchanges')
        .select('id')
        .eq('year', year)
        .neq('status', 'cancelled')
        .or(`employee_a_id.eq.${employeeAId},employee_b_id.eq.${employeeAId},employee_a_id.eq.${employeeBId},employee_b_id.eq.${employeeBId}`)
        .limit(1);

      if (existing && existing.length > 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Uno de los empleados ya tiene un intercambio activo para este año' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Create the exchange
      const { data: newExchange, error: createError } = await supabase
        .from('vacation_group_exchanges')
        .insert({
          department_id: departmentId,
          employee_a_id: employeeAId,
          employee_b_id: employeeBId,
          original_group_a_id: originalGroupAId,
          original_group_b_id: originalGroupBId,
          temporary_group_a_id: temporaryGroupAId,
          temporary_group_b_id: temporaryGroupBId,
          year,
          status: 'draft',
          created_by: manager.name
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating exchange:', createError);
        return new Response(
          JSON.stringify({ success: false, error: 'Error creating exchange' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Log audit
      await logAudit(
        'create_group_exchange',
        'vacation_group_exchange',
        newExchange.id,
        newExchange,
        `Intercambio de grupo creado para año ${year}`
      );

      return new Response(
        JSON.stringify({ success: true, exchange: newExchange }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send exchange confirmation emails
    if (action === 'sendExchangeEmails') {
      const { exchangeId, baseUrl: clientBaseUrl } = data;

      const { data: exchange, error: fetchError } = await supabase
        .from('vacation_group_exchanges')
        .select('*')
        .eq('id', exchangeId)
        .single();

      if (fetchError || !exchange) {
        return new Response(
          JSON.stringify({ success: false, error: 'Exchange not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Get employee info
      const { data: employeeA } = await supabase
        .from('workers')
        .select('name, email')
        .eq('id', exchange.employee_a_id)
        .single();

      const { data: employeeB } = await supabase
        .from('workers')
        .select('name, email')
        .eq('id', exchange.employee_b_id)
        .single();

      // Get group info
      const { data: groupA } = await supabase
        .from('work_groups')
        .select('name')
        .eq('id', exchange.original_group_a_id)
        .single();

      const { data: groupB } = await supabase
        .from('work_groups')
        .select('name')
        .eq('id', exchange.original_group_b_id)
        .single();

      // Fetch future vacation days for each worker's TEMPORARY group
      const todayStr = new Date().toISOString().split('T')[0];
      
      // Get the annual calendar for this department and year
      const { data: annualCalendar } = await supabase
        .from('annual_calendars')
        .select('id')
        .eq('department_id', exchange.department_id)
        .eq('year', exchange.year)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let futureVacationDaysA: string[] = [];
      let futureVacationDaysB: string[] = [];
      let generalVacationDays: string[] = [];

      if (annualCalendar?.id) {
        // Fetch all future vacation days (group + general) in one query
        const { data: vacDays } = await supabase
          .from('annual_calendar_days')
          .select('date, day_type, group_id, group_id_2')
          .eq('calendar_id', annualCalendar.id)
          .in('day_type', ['vacaciones_grupo', 'vacaciones_generales'])
          .gte('date', todayStr)
          .order('date');

        if (vacDays) {
          for (const day of vacDays) {
            if (day.day_type === 'vacaciones_generales') {
              generalVacationDays.push(day.date);
            } else if (day.day_type === 'vacaciones_grupo') {
              // Employee A gets group B's vacation days (temporary group)
              if (day.group_id === exchange.original_group_b_id || day.group_id_2 === exchange.original_group_b_id) {
                futureVacationDaysA.push(day.date);
              }
              // Employee B gets group A's vacation days (temporary group)
              if (day.group_id === exchange.original_group_a_id || day.group_id_2 === exchange.original_group_a_id) {
                futureVacationDaysB.push(day.date);
              }
            }
          }
        }
      }

      // Format dates for display (dd/MM)
      const formatVacDates = (dates: string[]): string[] => {
        return dates.map(d => {
          const parts = d.split('-');
          return `${parts[2]}/${parts[1]}`;
        });
      };

      const allVacDaysA = [...new Set([...generalVacationDays, ...futureVacationDaysA])].sort();
      const allVacDaysB = [...new Set([...generalVacationDays, ...futureVacationDaysB])].sort();

      const normalizeBaseUrl = (url: unknown): string => {
        if (typeof url !== 'string') return '';
        const trimmed = url.trim().replace(/\/+$/, '');
        if (!trimmed) return '';
        if (!/^https?:\/\//i.test(trimmed)) return '';
        return trimmed;
      };

      const baseUrl =
        normalizeBaseUrl(clientBaseUrl) ||
        normalizeBaseUrl(Deno.env.get('SITE_URL')) ||
        'https://vnprod.app';

      // Send emails
      const emailPromises = [];

      if (employeeA?.email) {
        emailPromises.push(
          sendEmailNotification({
            to: employeeA.email,
            type: 'group_exchange_confirmation',
            data: {
              employeeName: employeeA.name,
              year: exchange.year,
              originalGroup: groupA?.name || 'Tu grupo',
              temporaryGroup: groupB?.name || 'Nuevo grupo',
              otherEmployee: employeeB?.name || 'Otro empleado',
              confirmationLink: `${baseUrl}/confirmar-intercambio?token=${exchange.token_a}`,
              futureVacationDates: formatVacDates(allVacDaysA),
            },
          })
        );
      }

      if (employeeB?.email) {
        emailPromises.push(
          sendEmailNotification({
            to: employeeB.email,
            type: 'group_exchange_confirmation',
            data: {
              employeeName: employeeB.name,
              year: exchange.year,
              originalGroup: groupB?.name || 'Tu grupo',
              temporaryGroup: groupA?.name || 'Nuevo grupo',
              otherEmployee: employeeA?.name || 'Otro empleado',
              confirmationLink: `${baseUrl}/confirmar-intercambio?token=${exchange.token_b}`,
              futureVacationDates: formatVacDates(allVacDaysB),
            },
          })
        );
      }

      await Promise.all(emailPromises);

      // Update status
      await supabase
        .from('vacation_group_exchanges')
        .update({ status: 'pending_employee_acceptance' })
        .eq('id', exchangeId);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Approve group exchange
    if (action === 'approveGroupExchange') {
      const { exchangeId } = data;

      const { data: exchange, error: fetchError } = await supabase
        .from('vacation_group_exchanges')
        .select('*')
        .eq('id', exchangeId)
        .single();

      if (fetchError || !exchange) {
        return new Response(
          JSON.stringify({ success: false, error: 'Exchange not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      if (exchange.status !== 'accepted_by_employees') {
        return new Response(
          JSON.stringify({ success: false, error: 'Exchange must be accepted by both employees first' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const approvedAt = new Date().toISOString();

      await supabase
        .from('vacation_group_exchanges')
        .update({
          status: 'approved',
          approved_by_admin: true,
          approved_by: manager.name,
          approved_at: approvedAt,
        })
        .eq('id', exchangeId);

      // Apply temporary group swap to workers
      const swapResults = await Promise.all([
        supabase.from('workers')
          .update({ work_group_id: exchange.temporary_group_a_id })
          .eq('id', exchange.employee_a_id),
        supabase.from('workers')
          .update({ work_group_id: exchange.temporary_group_b_id })
          .eq('id', exchange.employee_b_id),
      ]);
      console.log('[GROUP_EXCHANGE] Applied temporary group swap for exchange', exchangeId,
        'A:', exchange.employee_a_id, '->', exchange.temporary_group_a_id,
        'B:', exchange.employee_b_id, '->', exchange.temporary_group_b_id);

      // Log audit
      await logAudit(
        'approve_group_exchange',
        'vacation_group_exchange',
        exchangeId,
        { ...exchange, swap_applied: true },
        `Intercambio de grupo aprobado para año ${exchange.year}. Grupos intercambiados automáticamente.`
      );

      // Notify both employees that the exchange is approved
      try {
        const [{ data: employeeA }, { data: employeeB }, { data: groupA }, { data: groupB }] = await Promise.all([
          supabase.from('workers').select('id, name, email').eq('id', exchange.employee_a_id).maybeSingle(),
          supabase.from('workers').select('id, name, email').eq('id', exchange.employee_b_id).maybeSingle(),
          exchange.original_group_a_id
            ? supabase.from('work_groups').select('id, name').eq('id', exchange.original_group_a_id).maybeSingle()
            : Promise.resolve({ data: null }),
          exchange.original_group_b_id
            ? supabase.from('work_groups').select('id, name').eq('id', exchange.original_group_b_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        const emailPromises: Promise<any>[] = [];

        if (employeeA?.email) {
          emailPromises.push(
            sendEmailNotification({
              to: employeeA.email,
              type: 'group_exchange_approved',
              data: {
                employeeName: employeeA.name,
                year: exchange.year,
                originalGroup: groupA?.name || 'Tu grupo',
                temporaryGroup: groupB?.name || 'Nuevo grupo',
                otherEmployee: employeeB?.name || 'Otro empleado',
                approvedBy: manager.name,
                approvedAt,
              },
            })
          );
        }

        if (employeeB?.email) {
          emailPromises.push(
            sendEmailNotification({
              to: employeeB.email,
              type: 'group_exchange_approved',
              data: {
                employeeName: employeeB.name,
                year: exchange.year,
                originalGroup: groupB?.name || 'Tu grupo',
                temporaryGroup: groupA?.name || 'Nuevo grupo',
                otherEmployee: employeeA?.name || 'Otro empleado',
                approvedBy: manager.name,
                approvedAt,
              },
            })
          );
        }

        await Promise.all(emailPromises);
      } catch (err) {
        console.error('Failed to send group exchange approved emails:', err);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cancel group exchange
    if (action === 'cancelGroupExchange') {
      const { exchangeId, reason } = data;

      const { data: exchange } = await supabase
        .from('vacation_group_exchanges')
        .select('*')
        .eq('id', exchangeId)
        .single();

      if (!exchange) {
        return new Response(
          JSON.stringify({ success: false, error: 'Exchange not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      const wasApproved = exchange.status === 'approved';

      await supabase
        .from('vacation_group_exchanges')
        .update({
          status: 'cancelled',
          cancelled_by: manager.name,
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || 'Cancelado por administrador'
        })
        .eq('id', exchangeId);

      // If the exchange was approved, revert group swap and send cancellation emails
      if (wasApproved) {
        // Revert work_group_id to originals
        await Promise.all([
          supabase.from('workers')
            .update({ work_group_id: exchange.original_group_a_id })
            .eq('id', exchange.employee_a_id),
          supabase.from('workers')
            .update({ work_group_id: exchange.original_group_b_id })
            .eq('id', exchange.employee_b_id),
        ]);
        console.log('[GROUP_EXCHANGE] Reverted group swap for cancelled exchange', exchangeId);
        // Get workers info
        const { data: employeeA } = await supabase
          .from('workers')
          .select('id, name, email, worker_number')
          .eq('id', exchange.employee_a_id)
          .single();

        const { data: employeeB } = await supabase
          .from('workers')
          .select('id, name, email, worker_number')
          .eq('id', exchange.employee_b_id)
          .single();

        // Get work groups info
        const { data: workGroups } = await supabase
          .from('work_groups')
          .select('id, name')
          .in('id', [
            exchange.original_group_a_id,
            exchange.original_group_b_id,
            exchange.temporary_group_a_id,
            exchange.temporary_group_b_id
          ].filter(Boolean));

        const getGroupName = (id: string | null) => {
          if (!id) return 'Sin grupo';
          return workGroups?.find(g => g.id === id)?.name || 'Desconocido';
        };

        // Send email to employee A
        if (employeeA?.email) {
          sendEmailNotification({
            to: employeeA.email,
            type: 'group_exchange_cancelled',
            data: {
              employeeName: employeeA.name,
              otherEmployee: employeeB?.name || 'Desconocido',
              originalGroup: getGroupName(exchange.original_group_a_id),
              temporaryGroup: getGroupName(exchange.temporary_group_a_id),
              year: exchange.year,
              cancelledBy: manager.name,
              cancelledAt: new Date().toISOString(),
              cancellationReason: reason || 'Cancelado por administrador'
            }
          });
          console.log('Cancellation email sent to employee A:', employeeA.email);
        }

        // Send email to employee B
        if (employeeB?.email) {
          sendEmailNotification({
            to: employeeB.email,
            type: 'group_exchange_cancelled',
            data: {
              employeeName: employeeB.name,
              otherEmployee: employeeA?.name || 'Desconocido',
              originalGroup: getGroupName(exchange.original_group_b_id),
              temporaryGroup: getGroupName(exchange.temporary_group_b_id),
              year: exchange.year,
              cancelledBy: manager.name,
              cancelledAt: new Date().toISOString(),
              cancellationReason: reason || 'Cancelado por administrador'
            }
          });
          console.log('Cancellation email sent to employee B:', employeeB.email);
        }
      }

      // Log audit
      await logAudit(
        'cancel_group_exchange',
        'vacation_group_exchange',
        exchangeId,
        exchange,
        `Intercambio de grupo cancelado: ${reason || 'Sin motivo'}`
      );

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete group exchange (only cancelled exchanges)
    if (action === 'deleteGroupExchange') {
      const { exchangeId } = data;

      const { data: exchange, error: fetchError } = await supabase
        .from('vacation_group_exchanges')
        .select('*')
        .eq('id', exchangeId)
        .single();

      if (fetchError || !exchange) {
        return new Response(
          JSON.stringify({ success: false, error: 'Exchange not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      if (exchange.status !== 'cancelled') {
        return new Response(
          JSON.stringify({ success: false, error: 'Solo se pueden eliminar intercambios cancelados' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error: deleteError } = await supabase
        .from('vacation_group_exchanges')
        .delete()
        .eq('id', exchangeId);

      if (deleteError) {
        console.error('Error deleting exchange:', deleteError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to delete exchange' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Log audit
      await logAudit(
        'delete_group_exchange',
        'vacation_group_exchange',
        exchangeId,
        exchange,
        `Intercambio de grupo eliminado (año ${exchange.year})`
      );

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get exchange by token (PUBLIC - no auth required for this action)
    if (action === 'getExchangeByToken') {
      const { token } = data;

      if (!token) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Try to find by token_a or token_b
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
            alreadyRejected: exchange.status === 'cancelled'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Respond to exchange (PUBLIC - no auth required)
    if (action === 'respondToExchange') {
      const { token, accept, signature } = data;

      if (!token) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token required' }),
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

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Acceptance
      const updateData: any = {};
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
        updateData.status = 'accepted_by_employees';
      }

      await supabase
        .from('vacation_group_exchanges')
        .update(updateData)
        .eq('id', exchange.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate exchange authorization document HTML
    if (action === 'generateExchangeDocument') {
      const { exchangeId } = data;

      const { data: exchange, error: fetchErr } = await supabase
        .from('vacation_group_exchanges')
        .select('*')
        .eq('id', exchangeId)
        .single();

      if (fetchErr || !exchange) {
        return new Response(
          JSON.stringify({ success: false, error: 'Intercambio no encontrado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Fetch workers, groups, department
      const [{ data: workerA }, { data: workerB }, { data: dept }] = await Promise.all([
        supabase.from('workers').select('id, name, worker_number, email').eq('id', exchange.employee_a_id).maybeSingle(),
        supabase.from('workers').select('id, name, worker_number, email').eq('id', exchange.employee_b_id).maybeSingle(),
        supabase.from('departments').select('id, name').eq('id', exchange.department_id).maybeSingle(),
      ]);

      const groupIds = [exchange.original_group_a_id, exchange.original_group_b_id, exchange.temporary_group_a_id, exchange.temporary_group_b_id].filter(Boolean);
      const { data: groups } = groupIds.length > 0
        ? await supabase.from('work_groups').select('id, name, color').in('id', groupIds)
        : { data: [] };

      const getGroupName = (id: string | null) => {
        if (!id) return '—';
        return (groups || []).find((g: any) => g.id === id)?.name || '—';
      };

      function escH(text: string | null | undefined): string {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      const fechaEmision = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
      const refCode = `INT-${exchange.year}-${exchangeId.slice(0, 8).toUpperCase()}`;

      const firmaADate = exchange.accepted_by_a_at ? new Date(exchange.accepted_by_a_at).toLocaleString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      const firmaBDate = exchange.accepted_by_b_at ? new Date(exchange.accepted_by_b_at).toLocaleString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      const approvedDate = exchange.approved_at ? new Date(exchange.approved_at).toLocaleString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

      const htmlContent = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Autorización Intercambio de Grupo - ${escH(workerA?.name)} / ${escH(workerB?.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:25mm 20mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Poppins',sans-serif;font-size:13px;line-height:1.7;color:#000;background:#fff;padding:40px 50px;max-width:793px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid #000;margin-bottom:24px}
.header-left{display:flex;align-items:center;gap:14px}
.header-left img{height:38px}
.header-left-text h1{font-size:15px;font-weight:600;letter-spacing:0.3px}
.header-left-text p{font-size:10px;color:#555;margin-top:1px}
.header-right{text-align:right;font-size:10px;color:#555;line-height:1.5}
.badge{display:inline-block;background:#e8f5e9;color:#2e7d32;font-size:11px;font-weight:600;padding:4px 14px;border-radius:4px;letter-spacing:0.5px;border:1px solid #c8e6c9}
h2{font-size:13px;font-weight:600;margin:22px 0 8px;color:#000;letter-spacing:0.2px}
.worker-info{margin-bottom:18px}
.worker-info table{width:100%;border-collapse:collapse}
.worker-info td{padding:5px 10px;font-size:12px;border:1px solid #e0e0e0}
.worker-info td:first-child{width:160px;background:#f9f9f9;font-weight:400;color:#555}
.section{background:#fafafa;border:1px solid #eee;border-radius:4px;padding:12px 16px;margin-bottom:14px;font-size:12px}
.exchange-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px}
.exchange-card{border:1px solid #e0e0e0;border-radius:6px;padding:14px;background:#fafafa}
.exchange-card h3{font-size:12px;font-weight:600;margin-bottom:8px;color:#333}
.group-badge{display:inline-block;font-size:11px;font-weight:600;padding:2px 10px;border-radius:12px;border:1px solid #ccc}
.arrow{text-align:center;font-size:16px;color:#888;margin:4px 0}
.auth-text{background:#f0faf0;border:1px solid #c8e6c9;border-radius:4px;padding:14px 18px;margin:18px 0;font-size:12px;line-height:1.8}
.firma-section{display:flex;justify-content:space-between;gap:20px;margin-top:30px;page-break-inside:avoid;page-break-before:auto}
.firma-box{flex:1;text-align:center;padding:16px;border:1px solid #e0e0e0;border-radius:4px;min-height:140px}
.firma-box p{font-size:11px;font-weight:600;margin-bottom:8px}
.firma-box img{max-width:200px;max-height:70px;margin:8px auto;display:block}
.firma-meta{font-size:10px;color:#777;margin-top:4px}
.footer{display:flex;justify-content:space-between;font-size:9px;color:#888;border-top:1px solid #ddd;padding-top:10px;margin-top:40px;page-break-inside:avoid}
@media print{body{padding:20px 40px;margin:0}}
</style></head><body>

<div class="header">
<div class="header-left">
<img src="https://vnvacaciones.lovable.app/images/verdnatura-logo-green.png" alt="Verdnatura">
<div class="header-left-text"><h1>Verdnatura Levante S.L.</h1><p>Autorización de intercambio de grupo de vacaciones</p></div>
</div>
<div class="header-right">B97367486 - Carrer Fenollar, 2, 46680, Algemesí (Valencia)<br>${escH(fechaEmision)}</div>
</div>

<div style="margin-bottom:20px">
<span class="badge">INTERCAMBIO DE GRUPO DE VACACIONES</span>
<span style="font-size:11px;color:#888;margin-left:12px">${escH(refCode)}</span>
</div>

<h2>Datos del intercambio</h2>
<div class="worker-info"><table>
<tr><td>Departamento</td><td><strong>${escH(dept?.name)}</strong></td></tr>
<tr><td>Año</td><td><strong>${exchange.year}</strong></td></tr>
<tr><td>Estado</td><td><strong>${exchange.status === 'approved' ? 'Aprobado' : exchange.status === 'cancelled' ? 'Cancelado' : 'Pendiente'}</strong></td></tr>
${exchange.approved_by ? `<tr><td>Aprobado por</td><td>${escH(exchange.approved_by)} — ${escH(approvedDate)}</td></tr>` : ''}
</table></div>

<h2>Trabajadores implicados</h2>
<div class="exchange-grid">
<div class="exchange-card">
<h3>Trabajador A</h3>
<div class="worker-info"><table>
<tr><td>Nombre</td><td><strong>${escH(workerA?.name)}</strong></td></tr>
<tr><td>Nº ficha</td><td>${escH(workerA?.worker_number)}</td></tr>
<tr><td>Grupo original</td><td><span class="group-badge">${escH(getGroupName(exchange.original_group_a_id))}</span></td></tr>
<tr><td>Grupo temporal</td><td><span class="group-badge" style="background:#e8f5e9">${escH(getGroupName(exchange.temporary_group_a_id))}</span></td></tr>
</table></div>
</div>
<div class="exchange-card">
<h3>Trabajador B</h3>
<div class="worker-info"><table>
<tr><td>Nombre</td><td><strong>${escH(workerB?.name)}</strong></td></tr>
<tr><td>Nº ficha</td><td>${escH(workerB?.worker_number)}</td></tr>
<tr><td>Grupo original</td><td><span class="group-badge">${escH(getGroupName(exchange.original_group_b_id))}</span></td></tr>
<tr><td>Grupo temporal</td><td><span class="group-badge" style="background:#e8f5e9">${escH(getGroupName(exchange.temporary_group_b_id))}</span></td></tr>
</table></div>
</div>
</div>

<div class="auth-text">
<strong>Autorización expresa de intercambio de grupo:</strong><br>
Los trabajadores abajo firmantes, <strong>${escH(workerA?.name)}</strong> (Nº ficha: ${escH(workerA?.worker_number)}) y <strong>${escH(workerB?.name)}</strong> (Nº ficha: ${escH(workerB?.worker_number)}), 
pertenecientes al departamento de <strong>${escH(dept?.name)}</strong>, declaran su conformidad con el intercambio temporal de sus respectivos grupos de vacaciones 
para el año <strong>${exchange.year}</strong>, pasando el primero del grupo <strong>${escH(getGroupName(exchange.original_group_a_id))}</strong> al grupo <strong>${escH(getGroupName(exchange.temporary_group_a_id))}</strong>, 
y el segundo del grupo <strong>${escH(getGroupName(exchange.original_group_b_id))}</strong> al grupo <strong>${escH(getGroupName(exchange.temporary_group_b_id))}</strong>.
<br><br>
Ambas partes aceptan que este intercambio es voluntario y que los días de vacaciones correspondientes se ajustarán conforme al calendario del nuevo grupo asignado.
</div>

<div class="firma-section">
<div class="firma-box">
<p>Verdnatura Levante S.L.</p>
<img src="https://vnvacaciones.lovable.app/images/firma_juanvi.png" alt="Firma y sello" onerror="this.style.display='none'">
${exchange.approved_at ? `<p class="firma-meta">${escH(approvedDate)}</p>` : ''}
</div>
<div class="firma-box">
<p>${escH(workerA?.name)}</p>
${exchange.signature_a && String(exchange.signature_a).startsWith('data:image') ? `<img src="${exchange.signature_a}" alt="Firma trabajador A">` : exchange.accepted_by_a ? '<p style="color:#2e7d32;font-size:10px;margin-top:20px;font-weight:600">✓ Aceptado digitalmente</p>' : '<p style="color:#999;font-size:10px;margin-top:30px">Pendiente de firma</p>'}
${exchange.accepted_by_a_at ? `<p class="firma-meta">${escH(firmaADate)}</p>` : ''}
</div>
<div class="firma-box">
<p>${escH(workerB?.name)}</p>
${exchange.signature_b && String(exchange.signature_b).startsWith('data:image') ? `<img src="${exchange.signature_b}" alt="Firma trabajador B">` : exchange.accepted_by_b ? '<p style="color:#2e7d32;font-size:10px;margin-top:20px;font-weight:600">✓ Aceptado digitalmente</p>' : '<p style="color:#999;font-size:10px;margin-top:30px">Pendiente de firma</p>'}
${exchange.accepted_by_b_at ? `<p class="firma-meta">${escH(firmaBDate)}</p>` : ''}
</div>
</div>

<div class="footer"><span>${escH(refCode)}</span><span>Fecha emisión: ${escH(fechaEmision)}</span></div>
</body></html>`;

      return new Response(
        JSON.stringify({ success: true, html: htmlContent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // Get calendar review alerts
    if (action === 'getCalendarReviewAlerts') {
      const { data: alerts, error } = await supabase
        .from('calendar_review_alerts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error?.message || 'Error fetching alerts' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Get departments for mapping
      const { data: departments } = await supabase.from('departments').select('id, name');
      const enriched = (alerts || []).map(a => ({
        ...a,
        department_name: departments?.find(d => d.id === a.department_id)?.name || 'Desconocido'
      }));

      return new Response(
        JSON.stringify({ success: true, alerts: enriched }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve calendar review alert
    if (action === 'resolveCalendarReviewAlert') {
      const { alertId } = data;

      const { error } = await supabase
        .from('calendar_review_alerts')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: manager.name,
        })
        .eq('id', alertId);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error?.message || 'Error resolving alert' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Log audit
      await supabase.from('audit_logs').insert({
        action_type: 'RESOLVE',
        entity_type: 'calendar_review_alert',
        entity_id: alertId,
        actor_name: manager.name,
        actor_role: manager.role,
        details: 'Calendario revisado',
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve all calendar review alerts at once
    if (action === 'resolveAllCalendarReviewAlerts') {
      const { alertIds } = data;

      if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'No alert IDs provided' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error } = await supabase
        .from('calendar_review_alerts')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: manager.name,
        })
        .in('id', alertIds);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error?.message || 'Error resolving alerts' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Log audit
      await supabase.from('audit_logs').insert({
        action_type: 'RESOLVE_ALL',
        entity_type: 'calendar_review_alert',
        entity_id: null,
        entity_data: { alertIds, count: alertIds.length },
        actor_name: manager.name,
        actor_role: manager.role,
        details: `Resueltas ${alertIds.length} alertas de calendario`,
      });

      console.log(`Resolved ${alertIds.length} calendar review alerts by ${manager.name}`);

      return new Response(
        JSON.stringify({ success: true, resolvedCount: alertIds.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get department role aliases
    if (action === 'getDepartmentRoleAliases') {
      const { departmentId } = data;

      const { data: aliases, error } = await supabase
        .from('department_role_aliases')
        .select('*')
        .eq('department_id', departmentId)
        .order('alias_name', { ascending: true });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, aliases: aliases || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add department role alias
    if (action === 'addDepartmentRoleAlias') {
      const { departmentId, aliasName } = data;

      if (!departmentId || !aliasName?.trim()) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID and alias name required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: newAlias, error } = await supabase
        .from('department_role_aliases')
        .insert({
          department_id: departmentId,
          alias_name: aliasName.trim(),
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return new Response(
            JSON.stringify({ success: false, error: 'Este alias ya existe para este departamento' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Added role alias "${aliasName}" to department ${departmentId}`);

      return new Response(
        JSON.stringify({ success: true, alias: newAlias }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete department role alias
    if (action === 'deleteDepartmentRoleAlias') {
      const { aliasId } = data;

      if (!aliasId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Alias ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error } = await supabase
        .from('department_role_aliases')
        .delete()
        .eq('id', aliasId);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Deleted role alias ${aliasId}`);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all role aliases for CSV import
    if (action === 'getAllRoleAliases') {
      const { data: aliases, error } = await supabase
        .from('department_role_aliases')
        .select('id, department_id, alias_name');

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, aliases: aliases || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update worker vacation days (bulk update)
    if (action === 'updateWorkerVacationDays') {
      const { workerId, pendingVacationDays } = data;

      if (!workerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: updateResult, error: updateError } = await supabase
        .from('workers')
        .update({
          pending_vacation_days: pendingVacationDays || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workerId)
        .select('id, name, worker_number, pending_vacation_days')
        .single();

      if (updateError || !updateResult) {
        console.error('Error updating worker vacation days:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: updateError?.message || 'Error updating vacation days' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      const workerResult = updateResult as { id: string; name: string; worker_number: string; pending_vacation_days: number };
      console.log(`Updated vacation days for worker ${workerResult.worker_number}: ${pendingVacationDays}`);

      // Log audit
      await supabase.from('audit_logs').insert({
        action_type: 'UPDATE',
        entity_type: 'worker_vacation_days',
        entity_id: workerId,
        actor_name: manager.name,
        actor_role: manager.role,
        details: `Actualizado días pendientes: ${pendingVacationDays}`,
        entity_data: { worker_number: workerResult.worker_number, pending_vacation_days: pendingVacationDays },
      });

      return new Response(
        JSON.stringify({ success: true, worker: workerResult }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update worker contract date (for trial period tracking)
    if (action === 'updateWorkerContractDate') {
      const { workerId, startContractDate } = data;

      if (!workerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: updateResult, error: updateError } = await supabase
        .from('workers')
        .update({
          start_contract_date: startContractDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workerId)
        .select('id, name, worker_number, start_contract_date')
        .single();

      if (updateError || !updateResult) {
        console.error('Error updating worker contract date:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: updateError?.message || 'Error updating contract date' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      const workerResult = updateResult as { id: string; name: string; worker_number: string; start_contract_date: string | null };
      console.log(`Updated contract date for worker ${workerResult.worker_number}: ${startContractDate}`);

      // Log audit
      await supabase.from('audit_logs').insert({
        action_type: 'UPDATE',
        entity_type: 'worker_contract_date',
        entity_id: workerId,
        actor_name: manager.name,
        actor_role: manager.role,
        details: `Actualizada fecha de contrato: ${startContractDate}`,
        entity_data: { worker_number: workerResult.worker_number, start_contract_date: startContractDate },
      });

      return new Response(
        JSON.stringify({ success: true, worker: workerResult }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all workers for labor module
    if (action === 'getWorkers') {
      const { data: workersData, error } = await supabase
        .from('workers')
        .select('id, worker_number, name, email, role, typology, department_id, worker_team_id, work_group_id, is_on_leave, is_on_vacation, is_altillo, deleted_at, start_contract_date, lines_hour')
        .is('deleted_at', null)
        .order('name');

      if (error) {
        console.error('Error fetching workers:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, workers: workersData || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get performance thresholds
    if (action === 'getPerformanceThresholds') {
      const { data: thresholds, error } = await supabase
        .from('performance_thresholds')
        .select('*');

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, thresholds: thresholds || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert performance threshold
    if (action === 'upsertPerformanceThreshold') {
      if (manager.role !== 'admin') {
        return new Response(
          JSON.stringify({ success: false, error: 'Admin access required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const { departmentId, greenMin, yellowMin } = data;
      if (!departmentId || greenMin === undefined || yellowMin === undefined) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing required fields' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error } = await supabase
        .from('performance_thresholds')
        .upsert({
          department_id: departmentId,
          green_min: greenMin,
          yellow_min: yellowMin,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'department_id' });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update worker (full update with all fields)
    if (action === 'updateWorker') {
      const { workerId, name, workerNumber, email, workerTeamId, workGroupId, isOnLeave, isOnVacation, isAltillo, updates } = data;

      if (!workerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Build update object - support both new format and legacy format
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      // New format fields
      if (name !== undefined) updateData.name = name;
      if (workerNumber !== undefined) updateData.worker_number = workerNumber;
      if (email !== undefined) updateData.email = email;
      if (workerTeamId !== undefined) updateData.worker_team_id = workerTeamId;
      if (workGroupId !== undefined) updateData.work_group_id = workGroupId;
      if (isOnLeave !== undefined) updateData.is_on_leave = isOnLeave;
      if (isOnVacation !== undefined) updateData.is_on_vacation = isOnVacation;
      if (isAltillo !== undefined) updateData.is_altillo = isAltillo;
      // Support is_responsable
      if (data.isResponsable !== undefined) updateData.is_responsable = data.isResponsable;
      if (data.is_responsable !== undefined) updateData.is_responsable = data.is_responsable;
      // Support fiscal_id (DNI/NIE)
      const _normFid = (v: any) => (v == null ? null : String(v).trim().toUpperCase() || null);
      if (data.fiscalId !== undefined) updateData.fiscal_id = _normFid(data.fiscalId);
      if (data.fiscal_id !== undefined) updateData.fiscal_id = _normFid(data.fiscal_id);

      // Legacy format - spread updates object
      if (updates && typeof updates === 'object') {
        Object.assign(updateData, updates);
      }

      const { data: updateResult, error: updateError } = await supabase
        .from('workers')
        .update(updateData)
        .eq('id', workerId)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating worker:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: updateError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Updated worker ${workerId}`);
      return new Response(
        JSON.stringify({ success: true, worker: updateResult }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get labor dashboard data (workers, time entries, settings)
    if (action === 'getLaborDashboardData') {
      const { startDate, endDate } = data || {};
      
      // Fetch workers
      const { data: workers, error: workersError } = await supabase
        .from('workers')
        .select('id, name, worker_number, department_id, is_on_leave, is_on_vacation')
        .is('deleted_at', null);
      
      if (workersError) {
        console.error('Error fetching workers:', workersError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch workers' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Fetch departments
      const { data: departments, error: deptsError } = await supabase
        .from('departments')
        .select('id, name');
      
      if (deptsError) {
        console.error('Error fetching departments:', deptsError);
      }

      // Fetch time entries with date filter (include clock_in, clock_out, observation for detail view)
      let entriesQuery = supabase
        .from('time_entries')
        .select('id, worker_id, entry_date, clock_in, clock_out, delay_minutes, is_absence, observation')
        .order('entry_date', { ascending: false });
      
      if (startDate) {
        entriesQuery = entriesQuery.gte('entry_date', startDate);
      }
      if (endDate) {
        entriesQuery = entriesQuery.lte('entry_date', endDate);
      }
      
      const { data: entries, error: entriesError } = await entriesQuery;
      
      if (entriesError) {
        console.error('Error fetching time entries:', entriesError);
      }

      // Fetch labor module settings
      const { data: settings, error: settingsError } = await supabase
        .from('labor_module_settings')
        .select('delay_threshold_minutes')
        .limit(1)
        .maybeSingle();
      
      if (settingsError) {
        console.error('Error fetching settings:', settingsError);
      }

      console.log(`Labor dashboard data: ${workers?.length || 0} workers, ${entries?.length || 0} entries`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          workers: workers || [],
          departments: departments || [],
          entries: entries || [],
          settings: settings || { delay_threshold_minutes: 10 }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== Get department configs (schedule_configured + schedule_locked_for_managers fields) =====
    if (action === 'getDepartmentConfigs') {
      const { data: deptData, error: deptError } = await supabase
        .from('departments')
        .select('id, schedule_configured, schedule_locked_for_managers, schedule_auto_rotate_teams');

      if (deptError) {
        console.error('Error fetching department configs:', deptError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch department configs' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      const configs: Record<string, boolean> = {};
      const locks: Record<string, boolean> = {};
      const autoRotate: Record<string, boolean> = {};
      for (const dept of deptData || []) {
        configs[dept.id] = dept.schedule_configured ?? false;
        locks[dept.id] = dept.schedule_locked_for_managers ?? false;
        autoRotate[dept.id] = dept.schedule_auto_rotate_teams ?? false;
      }

      return new Response(
        JSON.stringify({ success: true, configs, locks, autoRotate }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== Get all worker teams (for Labor module) =====
    // This returns worker teams accessible via service_role since RLS is now admin-only
    if (action === 'getAllWorkerTeams') {
      const { data: teamsData, error: teamsError } = await supabase
        .from('worker_teams')
        .select('id, name, department_id, sort_order, is_schedule_locked, display_name, label_id')
        .order('sort_order');

      if (teamsError) {
        console.error('Error fetching worker teams:', teamsError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch worker teams' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, teams: teamsData || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== Worker Team Labels (lugar/función rotable) =====
    if (action === 'listTeamLabels') {
      const { departmentId } = data || {};
      if (!departmentId) {
        return new Response(JSON.stringify({ success: false, error: 'departmentId required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const { data: labels, error } = await supabase
        .from('worker_team_labels')
        .select('id, department_id, name, color, icon, sort_order, inherit_team_color, excluded_shift_keys')
        .eq('department_id', departmentId)
        .order('sort_order')
        .order('name');
      if (error) {
        console.error('listTeamLabels error', error);
        return new Response(JSON.stringify({ success: false, error: 'Failed to list labels' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true, labels: labels || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'createTeamLabel') {
      const { departmentId, name, color, icon, inheritTeamColor } = data || {};
      if (!departmentId || !name || !String(name).trim()) {
        return new Response(JSON.stringify({ success: false, error: 'departmentId and name required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      // Compute next sort_order
      const { data: maxRow } = await supabase
        .from('worker_team_labels')
        .select('sort_order')
        .eq('department_id', departmentId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextOrder = (maxRow?.sort_order ?? -1) + 1;
      const { data: created, error } = await supabase
        .from('worker_team_labels')
        .insert({
          department_id: departmentId,
          name: String(name).trim(),
          color: color || null,
          icon: icon || null,
          sort_order: nextOrder,
          inherit_team_color: !!inheritTeamColor,
        })
        .select()
        .single();
      if (error) {
        console.error('createTeamLabel error', error);
        return new Response(JSON.stringify({ success: false, error: error.message || 'Failed to create label' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true, label: created }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'updateTeamLabel') {
      const { labelId, name, color, icon, sortOrder, inheritTeamColor, excludedShiftKeys } = data || {};
      if (!labelId) {
        return new Response(JSON.stringify({ success: false, error: 'labelId required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = String(name).trim();
      if (color !== undefined) patch.color = color || null;
      if (icon !== undefined) patch.icon = icon || null;
      if (sortOrder !== undefined) patch.sort_order = sortOrder;
      if (inheritTeamColor !== undefined) patch.inherit_team_color = !!inheritTeamColor;
      if (excludedShiftKeys !== undefined) {
        patch.excluded_shift_keys = Array.isArray(excludedShiftKeys)
          ? excludedShiftKeys.filter((k: unknown) => typeof k === 'string' && k.length > 0)
          : [];
      }
      // Only run UPDATE if patch has fields (avoid 0-rows when nothing to update)
      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await supabase
          .from('worker_team_labels')
          .update(patch)
          .eq('id', labelId);
        if (updErr) {
          console.error('updateTeamLabel update error', updErr);
          return new Response(JSON.stringify({ success: false, error: updErr.message || 'Failed to update label' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }
      }
      // Re-fetch the row separately so we always return current state
      const { data: updated, error: selErr } = await supabase
        .from('worker_team_labels')
        .select('id, department_id, name, color, icon, sort_order, inherit_team_color, excluded_shift_keys')
        .eq('id', labelId)
        .maybeSingle();
      if (selErr) {
        console.error('updateTeamLabel select error', selErr);
        return new Response(JSON.stringify({ success: false, error: selErr.message || 'Failed to read label' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      if (!updated) {
        return new Response(JSON.stringify({ success: false, error: 'Etiqueta no encontrada' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 });
      }
      return new Response(JSON.stringify({ success: true, label: updated }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'deleteTeamLabel') {
      const { labelId } = data || {};
      if (!labelId) {
        return new Response(JSON.stringify({ success: false, error: 'labelId required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const { error } = await supabase.from('worker_team_labels').delete().eq('id', labelId);
      if (error) {
        console.error('deleteTeamLabel error', error);
        return new Response(JSON.stringify({ success: false, error: 'Failed to delete label' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'assignTeamLabel') {
      const { teamId, labelId } = data || {};
      if (!teamId) {
        return new Response(JSON.stringify({ success: false, error: 'teamId required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const { data: updated, error } = await supabase
        .from('worker_teams')
        .update({ label_id: labelId || null })
        .eq('id', teamId)
        .select('id, label_id')
        .single();
      if (error) {
        console.error('assignTeamLabel error', error);
        return new Response(JSON.stringify({ success: false, error: 'Failed to assign label' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true, team: updated }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'bulkAssignTeamLabels') {
      const { assignments } = data || {};
      if (!Array.isArray(assignments)) {
        return new Response(JSON.stringify({ success: false, error: 'assignments must be an array' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const results: Array<{ teamId: string; ok: boolean }> = [];
      for (const a of assignments) {
        if (!a?.teamId) continue;
        const { error } = await supabase
          .from('worker_teams')
          .update({ label_id: a.labelId || null })
          .eq('id', a.teamId);
        results.push({ teamId: a.teamId, ok: !error });
        if (error) console.error('bulkAssignTeamLabels item error', a.teamId, error);
      }
      return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ===== Department Shifts Management =====
    if (action === 'getDepartmentShifts') {
      const { departmentId } = data || {};

      if (!departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId es obligatorio' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: shiftsData, error: shiftsError } = await supabase
        .from('department_shifts')
        .select('*')
        .eq('department_id', departmentId)
        .order('sort_order');

      if (shiftsError) {
        console.error('Error fetching department shifts:', shiftsError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch shifts' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, shifts: shiftsData || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'updateDepartmentShift') {
      const { shiftId, updates } = data || {};

      if (!shiftId || !updates) {
        return new Response(
          JSON.stringify({ success: false, error: 'shiftId y updates son obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Only allow specific fields to be updated
      const allowedFields = ['name', 'start_time', 'end_time', 'color', 'sort_order', 'is_rest'];
      const safeUpdates: Record<string, any> = {};
      for (const key of Object.keys(updates)) {
        if (allowedFields.includes(key)) {
          safeUpdates[key] = updates[key];
        }
      }

      const { error: updateError } = await supabase
        .from('department_shifts')
        .update(safeUpdates)
        .eq('id', shiftId);

      if (updateError) {
        console.error('Error updating department shift:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update shift' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'initializeDepartmentShifts') {
      const { departmentId, defaultShifts } = data || {};

      if (!departmentId || !defaultShifts) {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId y defaultShifts son obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check if shifts already exist for this department
      const { data: existingShifts } = await supabase
        .from('department_shifts')
        .select('id')
        .eq('department_id', departmentId)
        .limit(1);

      if (existingShifts && existingShifts.length > 0) {
        // Shifts already exist, return them
        const { data: allShifts } = await supabase
          .from('department_shifts')
          .select('*')
          .eq('department_id', departmentId)
          .order('sort_order');
        
        return new Response(
          JSON.stringify({ success: true, shifts: allShifts || [], alreadyExists: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Insert default shifts
      const shiftsToInsert = defaultShifts.map((s: any) => ({
        ...s,
        department_id: departmentId,
      }));

      const { data: insertedShifts, error: insertError } = await supabase
        .from('department_shifts')
        .insert(shiftsToInsert)
        .select();

      if (insertError) {
        console.error('Error initializing department shifts:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to initialize shifts' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, shifts: insertedShifts || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'addDepartmentShift') {
      const { departmentId, shiftData } = data || {};

      if (!departmentId || !shiftData) {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId y shiftData son obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: newShift, error: insertError } = await supabase
        .from('department_shifts')
        .insert({
          department_id: departmentId,
          name: shiftData.name || 'Nuevo Turno',
          shift_key: shiftData.shift_key || `custom_${Date.now()}`,
          start_time: shiftData.start_time || '09:00',
          end_time: shiftData.end_time || '17:00',
          color: shiftData.color || '#93d600',
          sort_order: shiftData.sort_order || 0,
          is_rest: shiftData.is_rest || false,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error adding department shift:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to add shift' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, shift: newShift }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'deleteDepartmentShift') {
      const { shiftId } = data || {};

      if (!shiftId) {
        return new Response(
          JSON.stringify({ success: false, error: 'shiftId es obligatorio' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check if it's a core shift before deleting
      const { data: shiftData } = await supabase
        .from('department_shifts')
        .select('shift_key')
        .eq('id', shiftId)
        .single();

      if (shiftData && ['morning', 'afternoon', 'night', 'rest'].includes(shiftData.shift_key)) {
        return new Response(
          JSON.stringify({ success: false, error: 'No se pueden eliminar los turnos principales' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error: deleteError } = await supabase
        .from('department_shifts')
        .delete()
        .eq('id', shiftId);

      if (deleteError) {
        console.error('Error deleting department shift:', deleteError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to delete shift' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== Weekly Shift Configurations (per-week independent shifts) =====
    if (action === 'getWeeklyShifts') {
      const { departmentId, year, week } = data || {};

      if (!departmentId || !year || !week) {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId, year y week son obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check if weekly shifts exist for this specific week
      const { data: weeklyShifts, error: wsError } = await supabase
        .from('weekly_shift_configs')
        .select('*')
        .eq('department_id', departmentId)
        .eq('year', year)
        .eq('week', week)
        .order('sort_order');

      if (wsError) {
        console.error('Error fetching weekly shifts:', wsError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch weekly shifts' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // If no weekly shifts for this week, return empty (will be initialized on demand)
      return new Response(
        JSON.stringify({ success: true, shifts: weeklyShifts || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'initializeWeeklyShifts') {
      const { departmentId, year, week, defaultShifts } = data || {};

      if (!departmentId || !year || !week || !defaultShifts) {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId, year, week y defaultShifts son obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check if already exists
      const { data: existing } = await supabase
        .from('weekly_shift_configs')
        .select('id')
        .eq('department_id', departmentId)
        .eq('year', year)
        .eq('week', week)
        .limit(1);

      if (existing && existing.length > 0) {
        // Already exists, return current shifts
        const { data: allShifts } = await supabase
          .from('weekly_shift_configs')
          .select('*')
          .eq('department_id', departmentId)
          .eq('year', year)
          .eq('week', week)
          .order('sort_order');

        return new Response(
          JSON.stringify({ success: true, shifts: allShifts || [], alreadyExists: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Try to copy from department_shifts first (as base template)
      const { data: deptShifts } = await supabase
        .from('department_shifts')
        .select('*')
        .eq('department_id', departmentId)
        .order('sort_order');

      let shiftsToUse = defaultShifts;
      if (deptShifts && deptShifts.length > 0) {
        // Use department's configured shifts as base
        shiftsToUse = deptShifts.map((s: any) => ({
          name: s.name,
          shift_key: s.shift_key,
          start_time: s.start_time,
          end_time: s.end_time,
          color: s.color,
          sort_order: s.sort_order,
          is_rest: s.is_rest,
          icon_key: s.icon_key,
        }));
      }

      // Insert weekly shifts
      const shiftsToInsert = shiftsToUse.map((s: any) => ({
        department_id: departmentId,
        year,
        week,
        shift_key: s.shift_key,
        name: s.name,
        start_time: s.start_time,
        end_time: s.end_time,
        color: s.color,
        sort_order: s.sort_order,
        is_rest: s.is_rest || false,
        icon_key: s.icon_key || null,
      }));

      const { data: insertedShifts, error: insertError } = await supabase
        .from('weekly_shift_configs')
        .insert(shiftsToInsert)
        .select();

      if (insertError) {
        console.error('Error initializing weekly shifts:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to initialize weekly shifts' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, shifts: insertedShifts || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'updateWeeklyShift') {
      const { shiftId, updates } = data || {};

      if (!shiftId || !updates) {
        return new Response(
          JSON.stringify({ success: false, error: 'shiftId y updates son obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const allowedFields = ['name', 'start_time', 'end_time', 'color', 'sort_order', 'is_rest', 'icon_key'];
      const safeUpdates: Record<string, any> = {};
      for (const key of Object.keys(updates)) {
        if (allowedFields.includes(key)) {
          safeUpdates[key] = updates[key];
        }
      }

      const { error: updateError } = await supabase
        .from('weekly_shift_configs')
        .update(safeUpdates)
        .eq('id', shiftId);

      if (updateError) {
        console.error('Error updating weekly shift:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update weekly shift' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'reorderWeeklyShifts') {
      const { shifts: shiftUpdates } = data || {};
      if (!shiftUpdates || !Array.isArray(shiftUpdates)) {
        return new Response(
          JSON.stringify({ success: false, error: 'shifts array is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      for (const item of shiftUpdates) {
        if (item.id && typeof item.sort_order === 'number') {
          await supabase
            .from('weekly_shift_configs')
            .update({ sort_order: item.sort_order })
            .eq('id', item.id);
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'addWeeklyShift') {
      const { departmentId, year, week, shiftData } = data || {};

      if (!departmentId || !year || !week || !shiftData) {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId, year, week y shiftData son obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: newShift, error: insertError } = await supabase
        .from('weekly_shift_configs')
        .insert({
          department_id: departmentId,
          year,
          week,
          shift_key: shiftData.shift_key || `custom_${Date.now()}`,
          name: shiftData.name || 'Nuevo Turno',
          start_time: shiftData.start_time || '09:00',
          end_time: shiftData.end_time || '17:00',
          color: shiftData.color || '#93d600',
          sort_order: shiftData.sort_order || 0,
          is_rest: shiftData.is_rest || false,
          icon_key: shiftData.icon_key || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error adding weekly shift:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to add weekly shift' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, shift: newShift }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'deleteWeeklyShift') {
      const { shiftId } = data || {};

      if (!shiftId) {
        return new Response(
          JSON.stringify({ success: false, error: 'shiftId es obligatorio' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Fetch shift data for logging
      const { data: shiftData } = await supabase
        .from('weekly_shift_configs')
        .select('shift_key, name')
        .eq('id', shiftId)
        .single();

      const { error: deleteError } = await supabase
        .from('weekly_shift_configs')
        .delete()
        .eq('id', shiftId);

      if (deleteError) {
        console.error('Error deleting weekly shift:', deleteError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to delete weekly shift' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== Labor schedules (weekly_schedules) =====
    if (action === 'getWeeklySchedule') {
      const { departmentId, year, weekNumber } = data || {};

      if (!departmentId || !year || !weekNumber) {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId, year y weekNumber son obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: scheduleRow, error: scheduleError } = await supabase
        .from('weekly_schedules')
        .select('*')
        .eq('department_id', departmentId)
        .eq('year', year)
        .eq('week_number', weekNumber)
        .maybeSingle();

      if (scheduleError) {
        console.error('Error fetching weekly schedule:', scheduleError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch weekly schedule' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // === VACATION DATA FROM ANNUAL CALENDAR ===
      // Calculate the date range for this week (ISO week starts on Monday)
      const getIsoWeekStart = (y: number, w: number): Date => {
        const jan4 = new Date(y, 0, 4);
        const dayOfWeek = jan4.getDay() || 7;
        const firstMonday = new Date(jan4);
        firstMonday.setDate(jan4.getDate() - dayOfWeek + 1);
        const result = new Date(firstMonday);
        result.setDate(firstMonday.getDate() + (w - 1) * 7);
        return result;
      };

      const weekStart = getIsoWeekStart(year, weekNumber);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const startStr = weekStart.toISOString().split('T')[0];
      const endStr = weekEnd.toISOString().split('T')[0];

      console.log(`Fetching vacation days for dept ${departmentId}, week ${weekNumber} (${startStr} to ${endStr})`);

      // Get the annual calendar for this department and year
      const { data: calendarData } = await supabase
        .from('annual_calendars')
        .select('id')
        .eq('department_id', departmentId)
        .eq('year', year)
        .maybeSingle();

      let vacationDays: { date: string; group_id: string | null; group_id_2: string | null; day_type: string }[] = [];

      if (calendarData?.id) {
        // Fetch vacation days (both group-specific and general vacations)
        const { data: daysData, error: daysError } = await supabase
          .from('annual_calendar_days')
          .select('date, group_id, group_id_2, day_type')
          .eq('calendar_id', calendarData.id)
          .in('day_type', ['vacaciones_grupo', 'vacaciones_generales'])
          .gte('date', startStr)
          .lte('date', endStr);

        if (daysError) {
          console.error('Error fetching vacation days:', daysError);
        } else {
          vacationDays = daysData || [];
          console.log(`Found ${vacationDays.length} vacation days for the week`);
        }
      }

      // Get the mapping between work_groups (vacation groups) and worker_teams (schedule teams)
      // IMPORTANT: Only get mappings for this department's work groups
      const { data: workGroupsData } = await supabase
        .from('work_groups')
        .select('id, name, department_id')
        .eq('department_id', departmentId);
      
      const workGroupIds = (workGroupsData || []).map(wg => wg.id);
      
      let groupTeamsData: { work_group_id: string; worker_team_id: string }[] = [];
      if (workGroupIds.length > 0) {
        const { data: gtData, error: gtError } = await supabase
          .from('work_group_teams')
          .select('work_group_id, worker_team_id')
          .in('work_group_id', workGroupIds);
        
        if (gtError) {
          console.error('Error fetching group-team mapping:', gtError);
        } else {
          groupTeamsData = gtData || [];
        }
      }
      
      console.log(`Found ${workGroupIds.length} work groups and ${groupTeamsData.length} group-team mappings for department ${departmentId}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          schedule: scheduleRow || null,
          vacationDays: vacationDays || [],
          groupTeamMap: groupTeamsData,
          workGroups: workGroupsData || [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'upsertWeeklySchedule') {
      const { departmentId, year, weekNumber, configuration, notes, copyShiftsFrom } = data || {};

      if (!departmentId || !year || !weekNumber || !configuration) {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId, year, weekNumber y configuration son obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check if department is locked for managers (only applies to non-admin roles)
      if (manager.role === 'manager') {
        const { data: deptLock } = await supabase
          .from('departments')
          .select('schedule_locked_for_managers')
          .eq('id', departmentId)
          .single();
        
        if (deptLock?.schedule_locked_for_managers) {
          return new Response(
            JSON.stringify({ success: false, error: 'El horario de este departamento está bloqueado para modificaciones' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
          );
        }
      }

      // Try to find existing row
      const { data: existing, error: existingError } = await supabase
        .from('weekly_schedules')
        .select('id')
        .eq('department_id', departmentId)
        .eq('year', year)
        .eq('week_number', weekNumber)
        .maybeSingle();

      if (existingError) {
        console.error('Error checking existing weekly schedule:', existingError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save weekly schedule' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      const payload = {
        department_id: departmentId,
        year,
        week_number: weekNumber,
        configuration,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      };

      let scheduleId: string;
      let resultSchedule: any;

      if (existing?.id) {
        scheduleId = existing.id;
        const { data: updated, error: updateError } = await supabase
          .from('weekly_schedules')
          .update(payload)
          .eq('id', existing.id)
          .select('*')
          .single();

        if (updateError) {
          console.error('Error updating weekly schedule:', updateError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to update weekly schedule' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
        resultSchedule = updated;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('weekly_schedules')
          .insert(payload)
          .select('*')
          .single();

        if (insertError) {
          console.error('Error inserting weekly schedule:', insertError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to create weekly schedule' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
        scheduleId = inserted.id;
        resultSchedule = inserted;
      }

      // Save a version for history
      const { error: versionError } = await supabase
        .from('weekly_schedule_versions')
        .insert({
          schedule_id: scheduleId,
          configuration,
          notes: notes || null,
          created_by: manager.name,
        });

      if (versionError) {
        console.error('Error saving schedule version:', versionError);
        // Don't fail the save, just log the error
      }

      // If copyShiftsFrom is provided, copy weekly_shift_configs from source week to target week
      if (copyShiftsFrom && copyShiftsFrom.sourceYear && copyShiftsFrom.sourceWeek) {
        const { sourceYear, sourceWeek } = copyShiftsFrom;
        
        // Fetch source week's shift configs
        const { data: sourceShifts } = await supabase
          .from('weekly_shift_configs')
          .select('*')
          .eq('department_id', departmentId)
          .eq('year', sourceYear)
          .eq('week', sourceWeek)
          .order('sort_order');
        
        if (sourceShifts && sourceShifts.length > 0) {
          // Delete existing shift configs for target week
          await supabase
            .from('weekly_shift_configs')
            .delete()
            .eq('department_id', departmentId)
            .eq('year', year)
            .eq('week', weekNumber);
          
          // Insert copies of source shifts for target week
          const shiftsToInsert = sourceShifts.map((s: any) => ({
            department_id: departmentId,
            year,
            week: weekNumber,
            shift_key: s.shift_key,
            name: s.name,
            start_time: s.start_time,
            end_time: s.end_time,
            color: s.color,
            sort_order: s.sort_order,
            is_rest: s.is_rest,
            icon_key: s.icon_key,
          }));
          
          const { error: shiftCopyError } = await supabase
            .from('weekly_shift_configs')
            .insert(shiftsToInsert);
          
          if (shiftCopyError) {
            console.error('Error copying weekly shift configs:', shiftCopyError);
            // Don't fail the whole operation, schedule is already saved
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, schedule: resultSchedule }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get schedule history/versions
    if (action === 'getScheduleHistory') {
      const { scheduleId } = data || {};

      if (!scheduleId) {
        return new Response(
          JSON.stringify({ success: false, error: 'scheduleId es obligatorio' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: versions, error: versionsError } = await supabase
        .from('weekly_schedule_versions')
        .select('*')
        .eq('schedule_id', scheduleId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (versionsError) {
        console.error('Error fetching schedule versions:', versionsError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch schedule history' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, versions: versions || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Remove vacation from annual calendar (bidirectional sync from labor schedules)
    if (action === 'removeVacationFromCalendar') {
      const { departmentId, date, year: calYear } = data || {};

      if (!departmentId || !date) {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId y date son obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      console.log(`Removing vacation from calendar: dept=${departmentId}, date=${date}`);

      // Find the calendar for this department and year
      const dateYear = calYear || new Date(date).getFullYear();
      const { data: calendar, error: calError } = await supabase
        .from('annual_calendars')
        .select('id')
        .eq('department_id', departmentId)
        .eq('year', dateYear)
        .maybeSingle();

      if (calError) {
        console.error('Error finding calendar:', calError);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al buscar calendario' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      if (!calendar) {
        return new Response(
          JSON.stringify({ success: false, error: 'No se encontró calendario para este año' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Delete or update the day to remove vacation type
      // We'll update the day to 'laboral' (working day) instead of deleting
      const { data: existingDay, error: dayCheckError } = await supabase
        .from('annual_calendar_days')
        .select('id, day_type')
        .eq('calendar_id', calendar.id)
        .eq('date', date)
        .maybeSingle();

      if (dayCheckError) {
        console.error('Error checking day:', dayCheckError);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al verificar día' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      if (existingDay) {
        // If it's a vacation day, update to 'laboral'
        if (existingDay.day_type === 'vacaciones_grupo' || existingDay.day_type === 'vacaciones_generales') {
          const { error: updateError } = await supabase
            .from('annual_calendar_days')
            .update({ 
              day_type: 'laboral',
              group_id: null,
              group_id_2: null,
            })
            .eq('id', existingDay.id);

          if (updateError) {
            console.error('Error updating day:', updateError);
            return new Response(
              JSON.stringify({ success: false, error: 'Error al actualizar día' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
            );
          }

          console.log(`Removed vacation from ${date} in calendar ${calendar.id}`);

          // Log the action
          await supabase.from('audit_logs').insert({
            action_type: 'vacation_removed_from_calendar',
            actor_name: manager.name,
            actor_role: manager.role,
            entity_type: 'annual_calendar_days',
            entity_id: existingDay.id,
            details: `Vacaciones eliminadas del día ${date} via sincronización con horario semanal`,
          });
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Vacaciones eliminadas del calendario anual' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get schedule group colors for a department
    if (action === 'getScheduleGroupColors') {
      const { departmentId } = data || {};

      if (!departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: colors, error } = await supabase
        .from('schedule_group_colors')
        .select('*')
        .eq('department_id', departmentId);

      if (error) {
        console.error('Error fetching group colors:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch group colors' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, colors: colors || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert schedule group color
    if (action === 'upsertScheduleGroupColor') {
      const { departmentId, groupLetter, color } = data || {};

      if (!departmentId || !groupLetter || !color) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID, group letter, and color required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check if exists
      const { data: existing } = await supabase
        .from('schedule_group_colors')
        .select('id')
        .eq('department_id', departmentId)
        .eq('group_letter', groupLetter)
        .maybeSingle();

      if (existing) {
        // Update
        const { data: updated, error } = await supabase
          .from('schedule_group_colors')
          .update({ color })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          console.error('Error updating group color:', error);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to update group color' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        console.log(`Updated group color ${groupLetter} to ${color} for dept ${departmentId}`);
        return new Response(
          JSON.stringify({ success: true, color: updated }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Insert
        const { data: inserted, error } = await supabase
          .from('schedule_group_colors')
          .insert({ department_id: departmentId, group_letter: groupLetter, color })
          .select()
          .single();

        if (error) {
          console.error('Error inserting group color:', error);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to insert group color' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        console.log(`Created group color ${groupLetter} = ${color} for dept ${departmentId}`);
        return new Response(
          JSON.stringify({ success: true, color: inserted }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get schedule rules for a department
    if (action === 'getScheduleRules') {
      const { departmentId } = data || {};

      if (!departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: rules, error } = await supabase
        .from('department_schedule_rules')
        .select('*')
        .eq('department_id', departmentId)
        .order('sort_order');

      if (error) {
        console.error('Error fetching schedule rules:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch schedule rules' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, rules: rules || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save schedule rules for a department
    if (action === 'saveScheduleRules') {
      const { departmentId, config } = data || {};

      if (!departmentId || !config) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID and config required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Delete existing rules for this department
      await supabase
        .from('department_schedule_rules')
        .delete()
        .eq('department_id', departmentId);

      // Insert the combined rule config
      const { data: inserted, error } = await supabase
        .from('department_schedule_rules')
        .insert({
          department_id: departmentId,
          rule_type: 'combined',
          rule_config: config,
          is_active: true,
          sort_order: 0,
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving schedule rules:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save schedule rules' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Saved schedule rules for department ${departmentId}`);
      return new Response(
        JSON.stringify({ success: true, rule: inserted }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Toggle schedule_configured for a department
    if (action === 'toggleDepartmentScheduleConfigured') {
      const { departmentId, configured } = data || {};

      if (!departmentId || typeof configured !== 'boolean') {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId and configured (boolean) are required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: updated, error } = await supabase
        .from('departments')
        .update({ schedule_configured: configured })
        .eq('id', departmentId)
        .select()
        .single();

      if (error) {
        console.error('Error updating schedule_configured:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update department' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Updated schedule_configured for department ${departmentId} to ${configured}`);
      return new Response(
        JSON.stringify({ success: true, department: updated }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Toggle schedule_locked_for_managers for a department (admin only)
    if (action === 'toggleScheduleLockedForManagers') {
      const { departmentId, locked } = data || {};

      if (!departmentId || typeof locked !== 'boolean') {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId and locked (boolean) are required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Only admins can toggle the lock
      if (manager.role !== 'admin') {
        return new Response(
          JSON.stringify({ success: false, error: 'Solo administradores pueden bloquear/desbloquear horarios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const { data: updated, error } = await supabase
        .from('departments')
        .update({ schedule_locked_for_managers: locked })
        .eq('id', departmentId)
        .select()
        .single();

      if (error) {
        console.error('Error updating schedule_locked_for_managers:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update department lock' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Updated schedule_locked_for_managers for department ${departmentId} to ${locked}`);
      return new Response(
        JSON.stringify({ success: true, department: updated }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Toggle schedule_auto_rotate_teams for a department (admin only)
    if (action === 'toggleScheduleAutoRotateTeams') {
      const { departmentId, enabled } = data || {};

      if (!departmentId || typeof enabled !== 'boolean') {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId and enabled (boolean) are required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      if (manager.role !== 'admin') {
        return new Response(
          JSON.stringify({ success: false, error: 'Solo administradores pueden cambiar esta configuración' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const { error } = await supabase
        .from('departments')
        .update({ schedule_auto_rotate_teams: enabled })
        .eq('id', departmentId);

      if (error) {
        console.error('Error updating schedule_auto_rotate_teams:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update auto-rotate setting' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Toggle weekly schedule as reviewed (per-week review status)
    if (action === 'toggleWeeklyScheduleReviewed') {
      const { departmentId, year, weekNumber, isReviewed } = data || {};

      if (!departmentId || !year || !weekNumber || typeof isReviewed !== 'boolean') {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId, year, weekNumber and isReviewed (boolean) are required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Find existing schedule
      const { data: existing } = await supabase
        .from('weekly_schedules')
        .select('id')
        .eq('department_id', departmentId)
        .eq('year', year)
        .eq('week_number', weekNumber)
        .maybeSingle();

      if (!existing?.id) {
        return new Response(
          JSON.stringify({ success: false, error: 'No existe horario para esta semana. Guárdalo primero.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      const updateData: Record<string, any> = {
        is_reviewed: isReviewed,
        reviewed_at: isReviewed ? new Date().toISOString() : null,
        reviewed_by: isReviewed ? manager.name : null,
      };

      const { data: updated, error } = await supabase
        .from('weekly_schedules')
        .update(updateData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating weekly schedule is_reviewed:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update schedule review status' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Marked week ${weekNumber}/${year} for department ${departmentId} as ${isReviewed ? 'reviewed' : 'not reviewed'} by ${manager.name}`);
      return new Response(
        JSON.stringify({ success: true, schedule: updated }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Bulk save schedules for multiple weeks (for monthly save)
    if (action === 'bulkSaveWeeklySchedules') {
      const { departmentId, schedules } = data || {};

      if (!departmentId || !Array.isArray(schedules) || schedules.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'departmentId and schedules array are required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const results = [];
      let successCount = 0;
      let errorCount = 0;

      for (const scheduleData of schedules) {
        const { year, weekNumber, configuration, notes } = scheduleData;
        
        if (!year || !weekNumber || !configuration) {
          errorCount++;
          continue;
        }

        // Try to find existing row
        const { data: existing } = await supabase
          .from('weekly_schedules')
          .select('id')
          .eq('department_id', departmentId)
          .eq('year', year)
          .eq('week_number', weekNumber)
          .maybeSingle();

        const payload = {
          department_id: departmentId,
          year,
          week_number: weekNumber,
          configuration,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        };

        let scheduleId: string;

        if (existing?.id) {
          scheduleId = existing.id;
          const { error: updateError } = await supabase
            .from('weekly_schedules')
            .update(payload)
            .eq('id', existing.id);

          if (updateError) {
            console.error('Error updating weekly schedule:', updateError);
            errorCount++;
            continue;
          }
        } else {
          const { data: inserted, error: insertError } = await supabase
            .from('weekly_schedules')
            .insert(payload)
            .select('id')
            .single();

          if (insertError) {
            console.error('Error inserting weekly schedule:', insertError);
            errorCount++;
            continue;
          }
          scheduleId = inserted.id;
        }

        // Save a version for history
        await supabase
          .from('weekly_schedule_versions')
          .insert({
            schedule_id: scheduleId,
            configuration,
            notes: notes || null,
            created_by: manager.name,
          });

        successCount++;
        results.push({ year, weekNumber, success: true });
      }

      console.log(`Bulk saved ${successCount} schedules for department ${departmentId}`);
      return new Response(
        JSON.stringify({ success: true, successCount, errorCount, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================
    // WORKER CALENDAR MODIFICATIONS
    // ========================

    // Get worker calendar modification data (worker info, calendar, groups, etc.)
    if (action === 'getWorkerCalendarModificationData') {
      const { workerId, year } = data || {};

      if (!workerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const targetYear = year || new Date().getFullYear();

      // Fetch worker data
      const { data: workerData, error: workerError } = await supabase
        .from('workers')
        .select('*, departments(id, name)')
        .eq('id', workerId)
        .single();

      if (workerError || !workerData) {
        console.error('Worker not found:', workerError);
        return new Response(
          JSON.stringify({ success: false, error: 'Worker not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Enrich worker with inherited work_group_id from team if not directly assigned
      let effectiveWorkGroupId = workerData.work_group_id;
      if (!effectiveWorkGroupId && workerData.worker_team_id) {
        const { data: teamGroup } = await supabase
          .from('work_group_teams')
          .select('work_group_id')
          .eq('worker_team_id', workerData.worker_team_id)
          .single();
        if (teamGroup) {
          effectiveWorkGroupId = teamGroup.work_group_id;
        }
      }

      const worker = {
        ...workerData,
        work_group_id: effectiveWorkGroupId
      };

      // Fetch work groups for the department (include max_free_days and free_days_deduction)
      const { data: workGroups } = await supabase
        .from('work_groups')
        .select('id, name, color, department_id, max_free_days, free_days_deduction')
        .eq('department_id', worker.department_id)
        .order('sort_order');

      // Fetch department settings
      const { data: departmentData } = await supabase
        .from('departments')
        .select('id, name, max_days_per_employee, manual_free_days_enabled, manual_free_days_value')
        .eq('id', worker.department_id)
        .single();

      // Fetch the annual calendar for this department and year
      const { data: calendar } = await supabase
        .from('annual_calendars')
        .select('id, info_text')
        .eq('department_id', worker.department_id)
        .eq('year', targetYear)
        .single();

      let calendarDays: any[] = [];
      if (calendar) {
        const { data: days } = await supabase
          .from('annual_calendar_days')
          .select('*')
          .eq('calendar_id', calendar.id);
        calendarDays = days || [];
      }

      // Fetch custom day types for the department (CRITICAL for correct colors)
      const { data: customDayTypes } = await supabase
        .from('custom_day_types')
        .select('id, name, color, system_type, sort_order')
        .eq('department_id', worker.department_id)
        .order('sort_order');

      // Fetch approved vacation requests for this worker (to show "Mis Vacaciones")
      // CRITICAL: Use UPPERCASE status 'APPROVED' to match the actual database values
      const { data: approvedRequests } = await supabase
        .from('vacation_requests')
        .select(`
          id,
          vacation_request_dates(date, half_day)
        `)
        .eq('department_id', worker.department_id)
        .eq('worker_number', worker.worker_number)
        .eq('status', 'APPROVED');

      // Flatten approved dates
      const approvedDates: { date: string; half_day: boolean }[] = [];
      if (approvedRequests) {
        for (const req of approvedRequests) {
          if (req.vacation_request_dates) {
            for (const d of req.vacation_request_dates) {
              approvedDates.push({ date: d.date, half_day: d.half_day });
            }
          }
        }
      }

      // Fetch pending vacation requests for this worker
      // CRITICAL: Use UPPERCASE status 'PENDING' to match the actual database values
      const { data: pendingRequests } = await supabase
        .from('vacation_requests')
        .select(`
          id,
          vacation_request_dates(date, half_day)
        `)
        .eq('department_id', worker.department_id)
        .eq('worker_number', worker.worker_number)
        .eq('status', 'PENDING');

      // Flatten pending dates
      const pendingDates: { date: string; half_day: boolean }[] = [];
      if (pendingRequests) {
        for (const req of pendingRequests) {
          if (req.vacation_request_dates) {
            for (const d of req.vacation_request_dates) {
              pendingDates.push({ date: d.date, half_day: d.half_day });
            }
          }
        }
      }

      // Fetch any existing modifications for this worker/year
      const { data: existingModifications } = await supabase
        .from('worker_calendar_modifications')
        .select('*')
        .eq('worker_id', workerId)
        .eq('year', targetYear)
        .order('created_at', { ascending: false });

      // Fetch personal calendar days for this worker/year
      const { data: personalDays } = await supabase
        .from('worker_personal_calendar_days')
        .select('*')
        .eq('worker_id', workerId)
        .eq('year', targetYear);

      // CRITICAL: Calculate unlockedDates using same logic as getWorkerCalendarPreview
      // Build set of unlocked dates from personal overrides
      const unlockedFromOverrides = new Set<string>();
      (personalDays || []).forEach((po: any) => {
        if (po.day_type === 'unlocked_by_admin') {
          unlockedFromOverrides.add(po.date);
        }
      });

      // Build set of unlocked dates from signed modifications (source of truth)
      const unlockedFromModifications = new Set<string>();
      const signedMods = (existingModifications || []).filter((m: any) => m.status === 'signed');
      signedMods.forEach((mod: any) => {
        if (mod.removed_group_days && Array.isArray(mod.removed_group_days)) {
          mod.removed_group_days.forEach((d: any) => {
            const dateStr = typeof d === 'string' ? d : d.date;
            unlockedFromModifications.add(dateStr);
          });
        }
      });

      // Merge both sources - union of unlocked dates
      const unlockedDates = new Set<string>([...unlockedFromOverrides, ...unlockedFromModifications]);
      console.log(`[getWorkerCalendarModificationData] Worker ${workerId} has ${unlockedDates.size} unlocked dates (${unlockedFromOverrides.size} overrides, ${unlockedFromModifications.size} signed mods)`);

      // RECONCILIATION: Clean up orphaned free_assignment entries
      // A free_assignment entry is orphaned if its DATE is not in the set of currently approved dates
      // This handles cases where requests were rejected after approval, regardless of how the original entry was created
      
      // Get all currently approved dates from approved requests
      const approvedDateSet = new Set<string>();
      approvedDates.forEach(d => approvedDateSet.add(d.date));
      
      // Find free_assignment entries that are NOT in the approved dates set
      const existingFreeAssignmentPersonalDays = (personalDays || []).filter(
        (pd: any) => pd.day_type === 'free_assignment'
      );
      
      const orphanedFreeAssignmentDates = existingFreeAssignmentPersonalDays.filter(
        (pd: any) => !approvedDateSet.has(pd.date)
      );
      
      if (orphanedFreeAssignmentDates.length > 0) {
        console.log(`[getWorkerCalendarModificationData] RECONCILIATION: Found ${orphanedFreeAssignmentDates.length} orphaned free_assignment dates to clean up`);
        console.log(`[getWorkerCalendarModificationData] Approved dates: ${Array.from(approvedDateSet).sort().join(', ')}`);
        console.log(`[getWorkerCalendarModificationData] Orphaned dates: ${orphanedFreeAssignmentDates.map((d: any) => d.date).sort().join(', ')}`);
        
        // Delete the orphaned personal days
        const orphanedIds = orphanedFreeAssignmentDates.map((d: any) => d.id);
        for (const orphanedId of orphanedIds) {
          await supabase
            .from('worker_personal_calendar_days')
            .delete()
            .eq('id', orphanedId);
        }
        
        // Also clean up any modifications that now have no remaining personal days
        const modificationIds = [...new Set(orphanedFreeAssignmentDates.map((d: any) => d.modification_id).filter(Boolean))];
        for (const modId of modificationIds) {
          const { data: remainingDays } = await supabase
            .from('worker_personal_calendar_days')
            .select('id')
            .eq('modification_id', modId)
            .limit(1);
          
          if (!remainingDays || remainingDays.length === 0) {
            // No remaining days, delete the modification
            await supabase
              .from('worker_calendar_modifications')
              .delete()
              .eq('id', modId);
            console.log(`[getWorkerCalendarModificationData] Deleted empty modification ${modId}`);
          }
        }
        
        // Refresh personalDays after cleanup
        const { data: refreshedPersonalDays } = await supabase
          .from('worker_personal_calendar_days')
          .select('*')
          .eq('worker_id', workerId)
          .eq('year', targetYear);
        
        // Replace personalDays with refreshed data
        (personalDays as any[]).length = 0;
        if (refreshedPersonalDays) {
          refreshedPersonalDays.forEach(d => (personalDays as any[]).push(d));
        }
        
        console.log(`[getWorkerCalendarModificationData] RECONCILIATION: Cleanup complete, ${refreshedPersonalDays?.length || 0} personal days remain`);
      }
      
      // BACKFILL: Check if approved requests have corresponding entries in worker_personal_calendar_days
      // This repairs old approvals that didn't get applied correctly
      const existingFreeAssignment = new Set<string>();
      (personalDays || []).forEach((po: any) => {
        if (po.day_type === 'free_assignment') {
          existingFreeAssignment.add(po.date);
        }
      });
      
      const missingApprovedDates = approvedDates.filter(d => !existingFreeAssignment.has(d.date));
      
      if (missingApprovedDates.length > 0) {
        console.log(`[getWorkerCalendarModificationData] BACKFILL: Found ${missingApprovedDates.length} approved dates missing from worker_personal_calendar_days`);
        
        // Create a modification record for backfill
        const { data: backfillMod, error: backfillModError } = await supabase
          .from('worker_calendar_modifications')
          .insert({
            worker_id: workerId,
            department_id: worker.department_id,
            year: targetYear,
            modification_type: 'add_personal_days',
            admin_name: 'Sistema (Backfill Admin)',
            admin_reason: `Backfill automático de ${missingApprovedDates.length} día(s) de libre configuración aprobados`,
            status: 'signed',
            signature: 'BACKFILL_SISTEMA',
            signed_at: new Date().toISOString(),
            added_personal_days: missingApprovedDates.map(d => ({
              date: d.date,
              half_day: d.half_day,
              assignmentType: 'free_assignment'
            })),
          })
          .select('id')
          .single();
        
        if (backfillModError) {
          console.error('[getWorkerCalendarModificationData] BACKFILL: Error creating modification:', backfillModError);
        } else if (backfillMod) {
          // Insert the missing personal days
          const toInsert = missingApprovedDates.map(d => ({
            worker_id: workerId,
            department_id: worker.department_id,
            modification_id: backfillMod.id,
            date: d.date,
            half_day: d.half_day,
            day_type: 'free_assignment',
            year: targetYear,
          }));
          
          const { error: insertErr } = await supabase
            .from('worker_personal_calendar_days')
            .insert(toInsert);
          
          if (insertErr) {
            console.error('[getWorkerCalendarModificationData] BACKFILL: Error inserting personal days:', insertErr);
          } else {
            console.log(`[getWorkerCalendarModificationData] BACKFILL: Successfully inserted ${toInsert.length} missing free_assignment days`);
            // Add to personalDays array for this request's response
            toInsert.forEach(d => {
              (personalDays || []).push(d);
            });
          }
        }
      }

      // Calculate available days using EXACT same logic as check-used-days in submit-vacation-request
      // Step 0: Check GLOBAL free days setting first (highest priority)
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('global_free_days_enabled, global_free_days_value')
        .limit(1)
        .maybeSingle();

      const globalFreeDaysEnabled = appSettings?.global_free_days_enabled ?? false;
      const globalFreeDaysValue = appSettings?.global_free_days_value ?? null;
      let skipGroupCalculation = false;

      // Step 1: Determine base maxDays with priority: Global > Manual Dept > Group > Default
      let maxDays: number;
      if (globalFreeDaysEnabled && globalFreeDaysValue !== null) {
        // Priority 1: Global setting (highest priority)
        maxDays = globalFreeDaysValue;
        skipGroupCalculation = true;
        console.log(`Using GLOBAL free days: ${maxDays}`);
      } else if (departmentData?.manual_free_days_enabled && departmentData?.manual_free_days_value !== null) {
        // Priority 2: Department manual setting
        maxDays = departmentData.manual_free_days_value;
        skipGroupCalculation = true;
        console.log(`Using DEPARTMENT MANUAL free days: ${maxDays}`);
      } else {
        // Priority 3 & 4: Will be calculated from group or department default
        maxDays = departmentData?.max_days_per_employee || 0;
      }

      // Helper: compute remaining free days for a work group from annual calendar
      const computeRemainingFreeDays = async (workGroupId: string, groupMaxFreeDays: number) => {
        try {
          if (!calendar?.id) {
            return groupMaxFreeDays;
          }

          let generalVacationDays = 0;
          const groupVacationDays: Record<string, number> = {};

          (calendarDays || []).forEach((day: any) => {
            if (day.day_type === 'vacaciones_generales') {
              generalVacationDays++;
              return;
            }
            if (day.day_type === 'vacaciones_grupo') {
              if (day.group_id) {
                groupVacationDays[day.group_id] = (groupVacationDays[day.group_id] || 0) + 1;
              }
              if (day.group_id_2) {
                groupVacationDays[day.group_id_2] = (groupVacationDays[day.group_id_2] || 0) + 1;
              }
            }
          });

          const usedFromCalendar = (groupVacationDays[workGroupId] || 0) + generalVacationDays;
          const remaining = groupMaxFreeDays - usedFromCalendar;
          console.log(`computeRemainingFreeDays: group ${workGroupId}, base=${groupMaxFreeDays}, general=${generalVacationDays}, groupSpecific=${groupVacationDays[workGroupId] || 0}, remaining=${remaining}`);
          return Math.max(0, remaining);
        } catch (e) {
          console.error('Error computing remaining free days:', e);
          return groupMaxFreeDays;
        }
      };

      // Step 2: If no global/manual setting and worker has a group, compute from work group
      if (effectiveWorkGroupId && !skipGroupCalculation) {
        const groupData = (workGroups || []).find((g: any) => g.id === effectiveWorkGroupId);
        console.log(`Worker group: ${effectiveWorkGroupId}, found groupData: ${groupData?.name}, max_free_days: ${groupData?.max_free_days}, free_days_deduction: ${groupData?.free_days_deduction}`);
        if (groupData?.max_free_days !== null && groupData?.max_free_days !== undefined) {
          maxDays = await computeRemainingFreeDays(effectiveWorkGroupId, groupData.max_free_days);
          // Apply group-level deduction
          if (groupData?.free_days_deduction) {
            maxDays = maxDays - groupData.free_days_deduction;
          }
        }
      }

      // Step 3: Calculate used days from approved requests (ACROSS ALL DEPARTMENTS like check-used-days does)
      const { data: allApprovedRequests } = await supabase
        .from('vacation_requests')
        .select('id')
        .eq('worker_number', worker.worker_number)
        .eq('status', 'APPROVED');

      let usedDays = 0;
      if (allApprovedRequests && allApprovedRequests.length > 0) {
        const requestIds = allApprovedRequests.map(r => r.id);
        const { data: allApprovedDates } = await supabase
          .from('vacation_request_dates')
          .select('id, half_day')
          .in('vacation_request_id', requestIds);

        if (allApprovedDates) {
          usedDays = allApprovedDates.reduce((sum, d) => sum + (d.half_day ? 0.5 : 1), 0);
        }
      }

      // Step 4: Apply vacation_days_adjustment (negative reduces available, positive increases)
      const vacationDaysAdjustment = worker.vacation_days_adjustment || 0;
      usedDays = usedDays - vacationDaysAdjustment;

      // Step 5: Calculate final available days
      const availableDays = Math.max(0, maxDays - usedDays);

      // Step 6: Calculate general vacation days for display
      let generalVacationDaysCount = 0;
      (calendarDays || []).forEach((day: any) => {
        if (day.day_type === 'vacaciones_generales') {
          generalVacationDaysCount++;
        }
      });

      // Step 7: Collect days when OTHER groups are on vacation (to mark as "Periodo No Vacacional")
      const otherGroupVacationDays: string[] = [];
      (calendarDays || []).forEach((day: any) => {
        if (day.day_type === 'vacaciones_grupo' || day.day_type === 'vacaciones') {
          // Check if this group vacation day does NOT include the worker's group
          const includesWorkerGroup = 
            day.group_id === effectiveWorkGroupId || 
            day.group_id_2 === effectiveWorkGroupId;
          
          if (!includesWorkerGroup && (day.group_id || day.group_id_2)) {
            // This is a day when OTHER groups are on vacation, but not this worker's group
            otherGroupVacationDays.push(day.date);
          }
        }
      });

      console.log(`Fetched calendar modification data for worker ${workerId}, availableDays: ${availableDays} (maxDays: ${maxDays}, usedDays: ${usedDays}), generalVacationDays: ${generalVacationDaysCount}, otherGroupVacationDays: ${otherGroupVacationDays.length}, unlockedDates: ${unlockedDates.size}`);
      return new Response(
        JSON.stringify({
          success: true,
          worker,
          department: departmentData,
          workGroups: workGroups || [],
          calendarDays,
          customDayTypes: customDayTypes || [],
          approvedDates,
          pendingDates,
          existingModifications: existingModifications || [],
          personalDays: personalDays || [],
          availableDays, // The exact number the worker sees
          maxDays,
          usedDays,
          generalVacationDays: generalVacationDaysCount, // Display count
          otherGroupVacationDays, // Dates when other groups are on vacation
          unlockedDates: Array.from(unlockedDates), // CRITICAL: Days already unlocked by signed modifications
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create or update a worker calendar modification
    if (action === 'saveWorkerCalendarModification') {
      const {
        modificationId, // If provided, update existing
        workerId,
        year,
        modificationType, // 'group_change', 'add_personal_days', 'remove_group_days', 'combined'
        adminReason,
        originalGroupId,
        newGroupId,
        removedGroupDays, // Array of dates to exclude from group
        addedPersonalDays, // Array of { date, dayType, halfDay }
        sendEmail,
      } = data || {};

      if (!workerId || !adminReason) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID and admin reason required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const targetYear = year || new Date().getFullYear();

      // Normalize legacy modification types and validate
      const allowedModificationTypes = new Set(['remove_group_days', 'add_personal_days', 'change_group', 'mixed']);
      let normalizedModificationType = modificationType || 'mixed';
      if (normalizedModificationType === 'remove_days') normalizedModificationType = 'remove_group_days';
      if (normalizedModificationType === 'combined') normalizedModificationType = 'mixed';
      if (normalizedModificationType === 'group_change') normalizedModificationType = 'change_group';
      if (!allowedModificationTypes.has(normalizedModificationType)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid modification type' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      // Validate worker exists
      const { data: worker, error: workerError } = await supabase
        .from('workers')
        .select('*, departments(id, name)')
        .eq('id', workerId)
        .single();

      if (workerError || !worker) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      let modification: any;
      const accessToken = crypto.randomUUID();

      if (modificationId) {
        // Update existing modification
        const { data: updated, error: updateError } = await supabase
          .from('worker_calendar_modifications')
           .update({
             modification_type: normalizedModificationType,
             admin_reason: adminReason,
            original_group_id: originalGroupId || null,
            new_group_id: newGroupId || null,
            removed_group_days: removedGroupDays || null,
            added_personal_days: addedPersonalDays || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', modificationId)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating modification:', updateError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to update modification' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
        modification = updated;
      } else {
        // Create new modification
        const { data: created, error: createError } = await supabase
          .from('worker_calendar_modifications')
           .insert({
             worker_id: workerId,
             department_id: worker.department_id,
             year: targetYear,
             modification_type: normalizedModificationType,
             admin_name: manager.name,
             admin_reason: adminReason,
            original_group_id: originalGroupId || null,
            new_group_id: newGroupId || null,
            removed_group_days: removedGroupDays || null,
            added_personal_days: addedPersonalDays || null,
            access_token: accessToken,
            status: sendEmail ? 'pending_signature' : 'draft',
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating modification:', createError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to create modification' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
        modification = created;

        // AUTO-SYNC: Immediately create personal calendar days for removed days
        // This makes removed days instantly available for the worker without waiting for signature
        const removedDaysData = data?.removedDays || [];
        if (removedDaysData.length > 0) {
          // Delete any existing personal days for this modification
          await supabase
            .from('worker_personal_calendar_days')
            .delete()
            .eq('modification_id', modification.id);

          // Insert new personal days for removed days
          const personalDaysToInsert = removedDaysData.map((rd: { date: string; originalType: string }) => ({
            worker_id: workerId,
            department_id: worker.department_id,
            modification_id: modification.id,
            date: rd.date,
            day_type: 'unlocked_by_admin',
            half_day: false,
            year: targetYear,
          }));

          const { error: insertError } = await supabase
            .from('worker_personal_calendar_days')
            .insert(personalDaysToInsert);

          if (insertError) {
            console.error('Error inserting personal calendar days:', insertError);
          } else {
            console.log(`Auto-synced ${personalDaysToInsert.length} personal days for worker ${workerId}`);
          }
        }

        // Also auto-sync added personal days
        const addedDays = addedPersonalDays || [];
        if (addedDays.length > 0) {
          const addedDaysToInsert = addedDays.map((ad: { date: string; halfDay?: boolean; assignmentType?: string }) => ({
            worker_id: workerId,
            department_id: worker.department_id,
            modification_id: modification.id,
            date: ad.date,
            day_type: ad.assignmentType || 'admin_assigned',
            half_day: ad.halfDay || false,
            year: targetYear,
          }));

          const { error: addInsertError } = await supabase
            .from('worker_personal_calendar_days')
            .insert(addedDaysToInsert);

          if (addInsertError) {
            console.error('Error inserting added personal calendar days:', addInsertError);
          } else {
            console.log(`Auto-synced ${addedDaysToInsert.length} added personal days for worker ${workerId}`);
          }
        }
      }

      // Send email if requested and worker has email
      if (sendEmail && worker.email) {
        console.log(`Sending calendar modification email to ${worker.email} for modification ${modification.id}`);
        
        const emailResult = await sendEmailNotification({
          to: worker.email,
          type: 'calendar_modification_signature',
          data: {
            workerName: worker.name,
            workerNumber: worker.worker_number,
            departmentName: (worker as any).departments?.name || 'Departamento',
            adminName: manager.name,
            adminReason: adminReason,
            year: targetYear,
            signatureLink: `https://vnprod.app/firmar-calendario/${modification.access_token}`,
          },
        });

        if (emailResult.success) {
          // Only update email_sent_at if email was actually sent successfully
          await supabase
            .from('worker_calendar_modifications')
            .update({ 
              email_sent_at: new Date().toISOString(),
              status: 'pending_signature'
            })
            .eq('id', modification.id);
          console.log(`Calendar modification email sent successfully for ${modification.id}`);
        } else {
          console.error(`Failed to send calendar modification email for ${modification.id}: ${emailResult.error}`);
          // Still return success for the modification creation, but note email failure
          return new Response(
            JSON.stringify({ 
              success: true, 
              modification,
              emailError: emailResult.error,
              warning: 'Modificación guardada pero el correo no se pudo enviar. Puedes reenviarlo más tarde.'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Log audit
      await logAudit(
        modificationId ? 'update_calendar_modification' : 'create_calendar_modification',
        'worker_calendar_modification',
        modification.id,
        { workerId, modificationType, adminReason },
        `${manager.name} ${modificationId ? 'actualizó' : 'creó'} modificación de calendario para ${worker.name}`
      );

      console.log(`Calendar modification ${modificationId ? 'updated' : 'created'} for worker ${workerId}`);
      return new Response(
        JSON.stringify({ success: true, modification }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Apply calendar modification directly without worker signature (admin applies immediately)
    if (action === 'applyCalendarModificationDirectly') {
      const {
        modificationId,
        workerId,
        year,
        modificationType,
        adminReason,
        originalGroupId,
        newGroupId,
        removedDays,
        removedGroupDays,
        addedPersonalDays,
      } = data || {};

      // If modificationId provided, apply existing modification
      if (modificationId) {
        const { data: modification, error: modError } = await supabase
          .from('worker_calendar_modifications')
          .select('*, workers(id, name, worker_number, department_id)')
          .eq('id', modificationId)
          .single();

        if (modError || !modification) {
          return new Response(
            JSON.stringify({ success: false, error: 'Modification not found' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          );
        }

        const workerData = (modification as any).workers;
        const targetWorkerId = modification.worker_id;
        const targetDepartmentId = modification.department_id;
        const targetYear = modification.year;

        // Clear any existing entries for this modification (idempotency)
        await supabase
          .from('worker_personal_calendar_days')
          .delete()
          .eq('modification_id', modification.id);

        let applyErrors: string[] = [];

        // Process removed_group_days - insert as unlocked_by_admin
        const removedDaysArray = modification.removed_group_days || [];
        if (Array.isArray(removedDaysArray) && removedDaysArray.length > 0) {
          const removedDateStrings = removedDaysArray
            .map((rd: any) => (typeof rd === 'string' ? rd : rd?.date))
            .filter(Boolean);

          // IMPORTANT: If these dates already have overrides (admin_assigned/libre_configuracion/free_assignment)
          // they will continue rendering as such even after inserting unlocked_by_admin.
          // Clean up any existing overrides for the target dates first so the UI reflects the removal.
          if (removedDateStrings.length > 0) {
            const { error: cleanupErr } = await supabase
              .from('worker_personal_calendar_days')
              .delete()
              .eq('worker_id', targetWorkerId)
              .in('date', removedDateStrings)
              .in('day_type', ['unlocked_by_admin', 'admin_assigned', 'libre_configuracion', 'free_assignment']);

            if (cleanupErr) {
              console.error('Error cleaning overrides for removed days:', cleanupErr);
              applyErrors.push(`Error limpiando overrides: ${cleanupErr.message}`);
            }
          }

          const removedDaysToInsert = removedDaysArray.map((rd: any) => ({
            worker_id: targetWorkerId,
            department_id: targetDepartmentId,
            modification_id: modification.id,
            date: typeof rd === 'string' ? rd : rd.date,
            day_type: 'unlocked_by_admin',
            half_day: false,
            year: targetYear,
          }));

          const { error: insertRemoveError } = await supabase
            .from('worker_personal_calendar_days')
            .insert(removedDaysToInsert);
          
          if (insertRemoveError) {
            console.error('Error inserting removed days:', insertRemoveError);
            applyErrors.push(`Error quitando días: ${insertRemoveError.message}`);
          } else {
            console.log(`Inserted ${removedDaysToInsert.length} removed_group_days as unlocked_by_admin for modification ${modification.id}`);
          }
        }

        // Process added_personal_days - insert as libre_configuracion or admin_assigned
        const addedDaysArray = modification.added_personal_days || [];
        if (Array.isArray(addedDaysArray) && addedDaysArray.length > 0) {
          const addedDateStrings = addedDaysArray
            .map((ad: any) => (typeof ad === 'string' ? ad : ad?.date))
            .filter(Boolean);

          // Idempotency + conflict resolution: clear any previous override types for these dates.
          if (addedDateStrings.length > 0) {
            const { error: cleanupAddedErr } = await supabase
              .from('worker_personal_calendar_days')
              .delete()
              .eq('worker_id', targetWorkerId)
              .in('date', addedDateStrings)
              .in('day_type', ['unlocked_by_admin', 'admin_assigned', 'libre_configuracion', 'free_assignment']);

            if (cleanupAddedErr) {
              console.error('Error cleaning overrides for added days:', cleanupAddedErr);
              applyErrors.push(`Error limpiando overrides (añadir): ${cleanupAddedErr.message}`);
            }
          }

          const addedDaysToInsert = addedDaysArray.map((ad: any) => ({
            worker_id: targetWorkerId,
            department_id: targetDepartmentId,
            modification_id: modification.id,
            date: typeof ad === 'string' ? ad : ad.date,
            day_type: (typeof ad === 'object' && ad.assignmentType) ? ad.assignmentType : 'libre_configuracion',
            half_day: (typeof ad === 'object' && ad.halfDay) ? ad.halfDay : false,
            year: targetYear,
          }));

          const { error: insertAddError } = await supabase
            .from('worker_personal_calendar_days')
            .insert(addedDaysToInsert);
          
          if (insertAddError) {
            console.error('Error inserting added days:', insertAddError);
            applyErrors.push(`Error añadiendo días: ${insertAddError.message}`);
          } else {
            console.log(`Inserted ${addedDaysToInsert.length} added_personal_days for modification ${modification.id}`);
          }
        }

        // If there were errors applying, return error without marking as signed
        if (applyErrors.length > 0) {
          console.error('Errors applying modification directly:', applyErrors);
          return new Response(
            JSON.stringify({ success: false, error: `Error aplicando cambios: ${applyErrors.join('; ')}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        // Mark as signed (by admin)
        await supabase
          .from('worker_calendar_modifications')
          .update({
            status: 'signed',
            signed_at: new Date().toISOString(),
            signature: 'APLICADO_POR_ADMIN',
            signed_ip: 'admin',
          })
          .eq('id', modificationId);

        // Log audit
        await logAudit(
          'apply_calendar_modification_directly',
          'worker_calendar_modification',
          modificationId,
          { workerId: targetWorkerId, appliedBy: manager.name },
          `${manager.name} aplicó directamente la modificación de calendario para ${workerData?.name || 'trabajador'}`
        );

        console.log(`Calendar modification ${modificationId} applied directly by admin with ${removedDaysArray.length} removed days and ${addedDaysArray.length} added days`);
        return new Response(
          JSON.stringify({ success: true, message: 'Modification applied directly' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create new modification and apply directly (no signature required)
      if (!workerId || !adminReason) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID and admin reason required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const targetYear = year || new Date().getFullYear();

      // Validate worker
      const { data: worker, error: workerError } = await supabase
        .from('workers')
        .select('*, departments(id, name)')
        .eq('id', workerId)
        .single();

      if (workerError || !worker) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Normalize modification type
      const allowedModificationTypes = new Set(['remove_group_days', 'add_personal_days', 'change_group', 'mixed']);
      let normalizedModificationType = modificationType || 'mixed';
      if (normalizedModificationType === 'remove_days') normalizedModificationType = 'remove_group_days';
      if (normalizedModificationType === 'combined') normalizedModificationType = 'mixed';
      if (normalizedModificationType === 'group_change') normalizedModificationType = 'change_group';
      if (!allowedModificationTypes.has(normalizedModificationType)) {
        normalizedModificationType = 'mixed';
      }

      // Create the modification with signed status directly
      const accessToken = crypto.randomUUID();
      const { data: modification, error: createError } = await supabase
        .from('worker_calendar_modifications')
        .insert({
          worker_id: workerId,
          department_id: worker.department_id,
          year: targetYear,
          modification_type: normalizedModificationType,
          admin_name: manager.name,
          admin_reason: adminReason,
          original_group_id: originalGroupId || null,
          new_group_id: newGroupId || null,
          removed_group_days: removedGroupDays || null,
          added_personal_days: addedPersonalDays || null,
          access_token: accessToken,
          status: 'signed',
          signed_at: new Date().toISOString(),
          signature: 'APLICADO_POR_ADMIN',
          signed_ip: 'admin',
        })
        .select()
        .single();

      if (createError || !modification) {
        console.error('Error creating direct modification:', createError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create modification' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Insert personal calendar days for removed days
      // Use removedDays if available (objects with {date, originalType}), otherwise fall back to removedGroupDays (strings)
      let removedDaysData: { date: string; originalType?: string }[] = [];
      if (removedDays && Array.isArray(removedDays) && removedDays.length > 0) {
        removedDaysData = removedDays;
      } else if (removedGroupDays && Array.isArray(removedGroupDays) && removedGroupDays.length > 0) {
        // removedGroupDays is array of date strings
        removedDaysData = removedGroupDays.map((d: string) => ({ date: d }));
      }
      
      console.log(`applyCalendarModificationDirectly: removedDaysData=${JSON.stringify(removedDaysData)}, removedDays=${JSON.stringify(removedDays)}, removedGroupDays=${JSON.stringify(removedGroupDays)}`);
      
      if (removedDaysData.length > 0) {
        const datesToRemove = removedDaysData.map((rd: { date: string }) => rd.date);
        
        // Idempotent: Delete existing entries for these dates to avoid duplicates
        const { error: deleteExistingError } = await supabase
          .from('worker_personal_calendar_days')
          .delete()
          .eq('worker_id', workerId)
          .in('date', datesToRemove)
          .in('day_type', ['unlocked_by_admin', 'admin_assigned', 'libre_configuracion', 'free_assignment']);
        
        if (deleteExistingError) {
          console.warn('applyCalendarModificationDirectly: Error deleting existing unlocked_by_admin days (non-fatal):', deleteExistingError);
        }
        
        const personalDaysToInsert = removedDaysData.map((rd: { date: string; originalType?: string }) => ({
          worker_id: workerId,
          department_id: worker.department_id,
          modification_id: modification.id,
          date: rd.date,
          day_type: 'unlocked_by_admin',
          half_day: false,
          year: targetYear,
        }));

        console.log(`applyCalendarModificationDirectly: Inserting ${personalDaysToInsert.length} unlocked_by_admin days`);
        
        const { error: insertRemoveError } = await supabase
          .from('worker_personal_calendar_days')
          .insert(personalDaysToInsert);
          
        if (insertRemoveError) {
          console.error('applyCalendarModificationDirectly: Error inserting removed days:', insertRemoveError);
          return new Response(
            JSON.stringify({ success: false, error: `Error al quitar días: ${insertRemoveError.message}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
        
        console.log(`applyCalendarModificationDirectly: Successfully inserted ${personalDaysToInsert.length} unlocked_by_admin days`);
      }

      // Insert added personal days
      const addedDays = addedPersonalDays || [];
      if (addedDays.length > 0) {
        const datesToAdd = addedDays.map((ad: { date: string }) => ad.date);
        
        // Idempotent: Delete existing entries for these dates to avoid duplicates
        const { error: deleteExistingAddedError } = await supabase
          .from('worker_personal_calendar_days')
          .delete()
          .eq('worker_id', workerId)
          .in('date', datesToAdd)
          .in('day_type', ['unlocked_by_admin', 'admin_assigned', 'libre_configuracion', 'free_assignment']);
        
        if (deleteExistingAddedError) {
          console.warn('applyCalendarModificationDirectly: Error deleting existing added days (non-fatal):', deleteExistingAddedError);
        }
        
        const addedDaysToInsert = addedDays.map((ad: { date: string; halfDay?: boolean; assignmentType?: string }) => ({
          worker_id: workerId,
          department_id: worker.department_id,
          modification_id: modification.id,
          date: ad.date,
          day_type: ad.assignmentType || 'admin_assigned',
          half_day: ad.halfDay || false,
          year: targetYear,
        }));

        console.log(`applyCalendarModificationDirectly: Inserting ${addedDaysToInsert.length} added personal days`);
        
        const { error: insertAddError } = await supabase
          .from('worker_personal_calendar_days')
          .insert(addedDaysToInsert);
          
        if (insertAddError) {
          console.error('applyCalendarModificationDirectly: Error inserting added days:', insertAddError);
          return new Response(
            JSON.stringify({ success: false, error: `Error al añadir días: ${insertAddError.message}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
        
        console.log(`applyCalendarModificationDirectly: Successfully inserted ${addedDaysToInsert.length} added personal days`);
      }

      // Log audit
      await logAudit(
        'apply_calendar_modification_directly',
        'worker_calendar_modification',
        modification.id,
        { workerId, modificationType: normalizedModificationType, adminReason },
        `${manager.name} creó y aplicó directamente modificación de calendario para ${worker.name}`
      );

      console.log(`Direct calendar modification created and applied for worker ${workerId}`);
      return new Response(
        JSON.stringify({ success: true, modification }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send calendar modification email
    if (action === 'sendCalendarModificationEmail') {
      const { modificationId } = data || {};

      if (!modificationId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Modification ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: modification, error: modError } = await supabase
        .from('worker_calendar_modifications')
        .select('*, workers(id, name, email, worker_number), departments(name)')
        .eq('id', modificationId)
        .single();

      if (modError || !modification) {
        return new Response(
          JSON.stringify({ success: false, error: 'Modification not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      const worker = (modification as any).workers;
      if (!worker?.email) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker has no email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      console.log(`Sending calendar modification email to ${worker.email} for modification ${modificationId}`);
      
      const emailResult = await sendEmailNotification({
        to: worker.email,
        type: 'calendar_modification_signature',
        data: {
          workerName: worker.name,
          workerNumber: worker.worker_number,
          departmentName: (modification as any).departments?.name || 'Departamento',
          adminName: modification.admin_name,
          adminReason: modification.admin_reason,
          year: modification.year,
          signatureLink: `https://vnprod.app/firmar-calendario/${modification.access_token}`,
        },
      });

      if (!emailResult.success) {
        console.error(`Failed to send calendar modification email for ${modificationId}: ${emailResult.error}`);
        return new Response(
          JSON.stringify({ success: false, error: emailResult.error || 'Failed to send email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Update email_sent_at and status to pending_signature only after successful email send
      await supabase
        .from('worker_calendar_modifications')
        .update({ 
          email_sent_at: new Date().toISOString(),
          status: 'pending_signature'
        })
        .eq('id', modificationId);

      console.log(`Calendar modification email sent successfully for ${modificationId}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get calendar modification by access token (public - for worker signature)
    if (action === 'getCalendarModificationByToken') {
      const { token } = data || {};

      if (!token) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token required' }),
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
          JSON.stringify({ success: false, error: 'Modification not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      console.log(`Fetched modification by token: ${modification.id}`);
      return new Response(
        JSON.stringify({ success: true, modification }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sign calendar modification (worker approval)
    if (action === 'signCalendarModification') {
      const { token, signature, signedIp } = data || {};

      if (!token || !signature) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token and signature required' }),
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
          JSON.stringify({ success: false, error: 'Modification not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      if (modification.status !== 'pending' && modification.status !== 'pending_signature') {
        return new Response(
          JSON.stringify({ success: false, error: 'Modification already processed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const worker = (modification as any).workers;

      // Apply changes BEFORE marking as signed - so if apply fails, we don't have orphan signed records
      // First clear any existing entries for this modification (idempotency)
      const { error: deleteError } = await supabase
        .from('worker_personal_calendar_days')
        .delete()
        .eq('modification_id', modification.id);
      
      if (deleteError) {
        console.error('Error clearing existing personal days:', deleteError);
      }

      let applyErrors: string[] = [];

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

      // 2. Add personal calendar days if specified - CRITICAL: these MUST be inserted for days to be effective
      const addedDays = modification.added_personal_days as any[];
      if (addedDays && addedDays.length > 0) {
        console.log(`Processing ${addedDays.length} added_personal_days for modification ${modification.id}`);
        
        // Insert each day individually to avoid bulk insert failures
        let insertedCount = 0;
        let skippedCount = 0;
        
        for (const day of addedDays) {
          const dateStr = typeof day === 'string' ? day : day.date;
          const dayType = (typeof day === 'object' && day.dayType) ? day.dayType : 
                          (typeof day === 'object' && day.assignmentType) ? day.assignmentType : 'libre_configuracion';
          const halfDay = (typeof day === 'object' && day.halfDay) ? day.halfDay : false;
          
          // Check if already exists
          const { data: existing } = await supabase
            .from('worker_personal_calendar_days')
            .select('id')
            .eq('worker_id', worker.id)
            .eq('date', dateStr)
            .eq('modification_id', modification.id)
            .maybeSingle();
          
          if (existing) {
            skippedCount++;
            continue;
          }
          
          const { error: insertErr } = await supabase
            .from('worker_personal_calendar_days')
            .insert({
              worker_id: worker.id,
              department_id: modification.department_id,
              modification_id: modification.id,
              date: dateStr,
              day_type: dayType,
              half_day: halfDay,
              year: modification.year,
            });
          
          if (insertErr) {
            console.error(`Error inserting added day ${dateStr}:`, insertErr);
            applyErrors.push(`Error día ${dateStr}: ${insertErr.message}`);
          } else {
            insertedCount++;
          }
        }
        
        console.log(`Added personal days: ${insertedCount} inserted, ${skippedCount} skipped (already existed)`);
      }

      // 3. Insert removed group days as unlocked_by_admin - THIS IS CRITICAL for the calendar to reflect changes
      const removedDays = modification.removed_group_days as any[];
      if (removedDays && removedDays.length > 0) {
        console.log(`Processing ${removedDays.length} removed_group_days for modification ${modification.id}`);
        
        let insertedCount = 0;
        let skippedCount = 0;
        
        for (const rd of removedDays) {
          const dateStr = typeof rd === 'string' ? rd : rd.date;
          
          // Check if already exists
          const { data: existing } = await supabase
            .from('worker_personal_calendar_days')
            .select('id')
            .eq('worker_id', worker.id)
            .eq('date', dateStr)
            .eq('modification_id', modification.id)
            .maybeSingle();
          
          if (existing) {
            skippedCount++;
            continue;
          }
          
          const { error: insertErr } = await supabase
            .from('worker_personal_calendar_days')
            .insert({
              worker_id: worker.id,
              department_id: modification.department_id,
              modification_id: modification.id,
              date: dateStr,
              day_type: 'unlocked_by_admin',
              half_day: false,
              year: modification.year,
            });
          
          if (insertErr) {
            console.error(`Error inserting removed day ${dateStr}:`, insertErr);
            applyErrors.push(`Error día eliminado ${dateStr}: ${insertErr.message}`);
          } else {
            insertedCount++;
          }
        }
        
        console.log(`Removed group days: ${insertedCount} inserted as unlocked_by_admin, ${skippedCount} skipped`);
      }

      // If there were critical errors, DO NOT mark as signed - return error
      if (applyErrors.length > 0) {
        console.error('Errors applying modification, not marking as signed:', applyErrors);
        return new Response(
          JSON.stringify({ success: false, error: `Error aplicando cambios: ${applyErrors.join('; ')}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Now mark as signed since apply succeeded
      const signedAtTimestamp = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('worker_calendar_modifications')
        .update({
          status: 'signed',
          signature,
          signed_at: signedAtTimestamp,
          signed_ip: signedIp || null,
        })
        .eq('id', modification.id);

      if (updateError) {
        console.error('Error signing modification:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Cambios aplicados pero error guardando firma' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Calendar modification signed for worker ${worker.id} with ${addedDays?.length || 0} added days and ${removedDays?.length || 0} removed days`);

      // Send confirmation email to department manager
      try {
        const { data: dept } = await supabase
          .from('departments')
          .select('name, manager_email')
          .eq('id', modification.department_id)
          .single();

        if (dept?.manager_email) {
          console.log(`Sending signature confirmation email to manager: ${dept.manager_email}`);
           await sendEmailNotification({
             to: dept.manager_email,
             type: 'calendar_modification_signed_confirmation',
             data: {
               workerName: worker.name,
               workerNumber: worker.worker_number,
               departmentName: dept.name,
               year: modification.year,
               adminName: modification.admin_name,
               removedDays: removedDays?.length || 0,
               addedDays: addedDays?.length || 0,
               removedDates: (removedDays || []).map((d: any) => typeof d === 'string' ? d : d.date),
               addedDates: (addedDays || []).map((d: any) => typeof d === 'string' ? d : d.date),
               signedAt: signedAtTimestamp,
               // Direct link to open the worker calendar in Sálix
               salixLink: `https://salix.verdnatura.es/#/worker/${worker.worker_number}/calendar`,
             }
           });
        } else {
          console.log('No manager_email configured for department, skipping signature confirmation email');
        }
      } catch (emailErr) {
        // Don't fail the signature if email fails
        console.error('Error sending signature confirmation email (non-blocking):', emailErr);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Repair signed calendar modifications (re-apply all changes for signed modifications that may have failed before constraint fix)
    if (action === 'repairSignedCalendarModifications') {
      const { departmentId, year } = data || {};
      const targetYear = year || new Date().getFullYear();

      let query = supabase
        .from('worker_calendar_modifications')
        .select('*, workers(id, name, worker_number, department_id)')
        .eq('status', 'signed');
      
      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }
      if (targetYear) {
        query = query.eq('year', targetYear);
      }

      const { data: signedMods, error: fetchError } = await query;

      if (fetchError) {
        console.error('Error fetching signed modifications for repair:', fetchError);
        return new Response(
          JSON.stringify({ success: false, error: 'Error fetching modifications' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      let repaired = 0;
      let skipped = 0;
      let errors: string[] = [];

      for (const mod of signedMods || []) {
        const worker = (mod as any).workers;
        if (!worker) {
          errors.push(`Modification ${mod.id}: worker not found`);
          continue;
        }

        // Check if entries already exist
        const { data: existingEntries } = await supabase
          .from('worker_personal_calendar_days')
          .select('id')
          .eq('modification_id', mod.id)
          .limit(1);

        // Count expected entries
        const removedDays = mod.removed_group_days as any[] || [];
        const addedDays = mod.added_personal_days as any[] || [];
        const expectedCount = removedDays.length + addedDays.length;

        if (existingEntries && existingEntries.length > 0) {
          // Already has entries, skip
          skipped++;
          continue;
        }

        if (expectedCount === 0) {
          // No days to insert
          skipped++;
          continue;
        }

        // Insert removed days as unlocked_by_admin
        if (removedDays.length > 0) {
          const removedToInsert = removedDays.map((rd: any) => ({
            worker_id: worker.id,
            department_id: mod.department_id,
            modification_id: mod.id,
            date: typeof rd === 'string' ? rd : rd.date,
            day_type: 'unlocked_by_admin',
            half_day: false,
            year: mod.year,
          }));

          const { error: insertErr } = await supabase
            .from('worker_personal_calendar_days')
            .insert(removedToInsert);

          if (insertErr) {
            errors.push(`Modification ${mod.id}: error inserting removed days - ${insertErr.message}`);
            continue;
          }
        }

        // Insert added personal days
        if (addedDays.length > 0) {
          const addedToInsert = addedDays.map((ad: any) => ({
            worker_id: worker.id,
            department_id: mod.department_id,
            modification_id: mod.id,
            date: typeof ad === 'string' ? ad : ad.date,
            day_type: (typeof ad === 'object' && ad.assignmentType) ? ad.assignmentType : 'libre_configuracion',
            half_day: (typeof ad === 'object' && ad.halfDay) ? ad.halfDay : false,
            year: mod.year,
          }));

          const { error: insertErr } = await supabase
            .from('worker_personal_calendar_days')
            .insert(addedToInsert);

          if (insertErr) {
            errors.push(`Modification ${mod.id}: error inserting added days - ${insertErr.message}`);
            continue;
          }
        }

        repaired++;
        console.log(`Repaired modification ${mod.id} for worker ${worker.name}`);
      }

      console.log(`Repair complete: ${repaired} repaired, ${skipped} skipped, ${errors.length} errors`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          repaired, 
          skipped, 
          total: signedMods?.length || 0,
          errors: errors.length > 0 ? errors : undefined 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Reject calendar modification
    if (action === 'rejectCalendarModification') {
      const { token, rejectionReason } = data || {};

      if (!token || !rejectionReason) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token and rejection reason required' }),
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
          JSON.stringify({ success: false, error: 'Modification not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      if (modification.status !== 'pending' && modification.status !== 'pending_signature') {
        return new Response(
          JSON.stringify({ success: false, error: 'Modification already processed' }),
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
          JSON.stringify({ success: false, error: 'Failed to reject modification' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Calendar modification rejected: ${modification.id}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get pending calendar modifications (for admin dashboard)
    if (action === 'getPendingCalendarModifications') {
      const { departmentId } = data || {};

      let query = supabase
        .from('worker_calendar_modifications')
        .select(`
          *,
          workers(id, name, worker_number),
          departments(id, name)
        `)
        .order('created_at', { ascending: false });

      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }

      const { data: modifications, error } = await query;

      if (error) {
        console.error('Error fetching modifications:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch modifications' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, modifications: modifications || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete calendar modification
    if (action === 'deleteCalendarModification') {
      const { modificationId } = data || {};

      if (!modificationId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Modification ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // First delete any personal days linked to this modification
      await supabase
        .from('worker_personal_calendar_days')
        .delete()
        .eq('modification_id', modificationId);

      // Then delete the modification
      const { error } = await supabase
        .from('worker_calendar_modifications')
        .delete()
        .eq('id', modificationId);

      if (error) {
        console.error('Error deleting modification:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to delete modification' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Deleted calendar modification: ${modificationId}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search workers by name or number
    if (action === 'searchWorkers') {
      const { query, departmentId } = data || {};

      if (!query || query.length < 2) {
        return new Response(
          JSON.stringify({ success: true, workers: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let queryBuilder = supabase
        .from('workers')
        .select('id, name, worker_number')
        .is('deleted_at', null)
        .or(`name.ilike.%${query}%,worker_number.ilike.%${query}%`)
        .limit(10);

      if (departmentId) {
        queryBuilder = queryBuilder.eq('department_id', departmentId);
      }

      const { data: workers, error } = await queryBuilder;

      if (error) {
        console.error('Error searching workers:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to search workers' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, workers: workers || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update worker vacation days adjustment
    if (action === 'updateWorkerVacationAdjustment') {
      const { workerId, adjustment } = data || {};

      if (!workerId || typeof adjustment !== 'number') {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID and adjustment required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get current adjustment
      const { data: workerData, error: fetchError } = await supabase
        .from('workers')
        .select('vacation_days_adjustment')
        .eq('id', workerId)
        .single();

      if (fetchError) {
        console.error('Error fetching worker:', fetchError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch worker' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      const currentAdjustment = workerData?.vacation_days_adjustment || 0;
      const newAdjustment = currentAdjustment + adjustment;

      const { error: updateError } = await supabase
        .from('workers')
        .update({ vacation_days_adjustment: newAdjustment })
        .eq('id', workerId);

      if (updateError) {
        console.error('Error updating worker:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update worker' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Updated vacation adjustment for worker ${workerId}: ${newAdjustment}`);
      return new Response(
        JSON.stringify({ success: true, newAdjustment }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Assign a team to a vacation group (work_group_teams mapping)
    if (action === 'assignTeamToVacationGroup') {
      const { teamId, workGroupId } = data || {};

      if (!teamId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Team ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // First, delete any existing mapping for this team
      await supabase
        .from('work_group_teams')
        .delete()
        .eq('worker_team_id', teamId);

      // If a new workGroupId is provided, create the mapping
      if (workGroupId) {
        const { error: insertError } = await supabase
          .from('work_group_teams')
          .insert({
            worker_team_id: teamId,
            work_group_id: workGroupId
          });

        if (insertError) {
          console.error('Error assigning team to vacation group:', insertError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to assign team to vacation group' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        // Get the team and group names for logging
        const { data: team } = await supabase.from('worker_teams').select('name').eq('id', teamId).single();
        const { data: group } = await supabase.from('work_groups').select('name').eq('id', workGroupId).single();
        
        console.log(`Assigned team "${team?.name || teamId}" to vacation group "${group?.name || workGroupId}"`);
      } else {
        console.log(`Removed vacation group mapping for team ${teamId}`);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark department as reviewed by consulta user
    if (action === 'markDepartmentReviewed') {
      const { departmentId, reviewedAt, reviewedBy } = data;

      if (!departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { error: updateError } = await supabase
        .from('departments')
        .update({
          consulta_reviewed_at: reviewedAt,
          consulta_reviewed_by: reviewedBy,
        })
        .eq('id', departmentId);

      if (updateError) {
        console.error('Error updating department review status:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update review status' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Department ${departmentId} review status updated by ${manager.name}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get worker profile with all related data
    if (action === 'getWorkerProfile') {
      const { workerId } = data || {};

      if (!workerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: worker, error: workerError } = await supabase
        .from('workers')
        .select('*')
        .eq('id', workerId)
        .is('deleted_at', null)
        .single();

      if (workerError || !worker) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Fetch related data in parallel
      const [deptRes, teamsRes, groupsRes, allWorkersRes] = await Promise.all([
        supabase.from('departments').select('id, name, slug').eq('id', worker.department_id).single(),
        supabase.from('worker_teams').select('*').eq('department_id', worker.department_id).order('sort_order'),
        supabase.from('work_groups').select('*').eq('department_id', worker.department_id).order('sort_order'),
        supabase.from('workers').select('id, name, worker_number, department_id').is('deleted_at', null).limit(500),
      ]);

      return new Response(
        JSON.stringify({
          success: true,
          worker,
          department: deptRes.data,
          workerTeams: teamsRes.data || [],
          workGroups: groupsRes.data || [],
          allWorkers: allWorkersRes.data || [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve effective department for a worker (responsable override)
    if (action === 'resolveWorkerEffectiveDepartment') {
      const { workerId: resolveWorkerId } = data || {};
      if (!resolveWorkerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: resolveWorker } = await supabase
        .from('workers')
        .select('id, department_id')
        .eq('id', resolveWorkerId)
        .maybeSingle();

      if (!resolveWorker) {
        return new Response(
          JSON.stringify({ success: true, effectiveDepartmentId: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: resolveLeadTeam } = await supabase
        .from('worker_teams')
        .select('id, department_id')
        .eq('responsable_worker_id', resolveWorkerId)
        .limit(1)
        .maybeSingle();

      if (resolveLeadTeam && resolveLeadTeam.department_id !== resolveWorker.department_id) {
        const { data: effectiveDept } = await supabase
          .from('departments')
          .select('id, name')
          .eq('id', resolveLeadTeam.department_id)
          .maybeSingle();

        return new Response(
          JSON.stringify({ 
            success: true, 
            effectiveDepartmentId: resolveLeadTeam.department_id,
            effectiveDepartmentName: effectiveDept?.name || '',
            effectiveTeamId: resolveLeadTeam.id,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, effectiveDepartmentId: resolveWorker.department_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Full calendar preview for admin popup - mirrors worker-personal:getCalendar
    if (action === 'getWorkerCalendarPreview') {
      const { workerId } = data || {};

      if (!workerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const currentYear = new Date().getFullYear();

      // Get worker with all needed fields
      const { data: worker, error: workerError } = await supabase
        .from('workers')
        .select('id, name, worker_number, work_group_id, department_id, worker_team_id, vacation_days_adjustment, pending_vacation_days')
        .eq('id', workerId)
        .is('deleted_at', null)
        .single();

      if (workerError || !worker) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Resolve effective department (responsable leads use their team's department)
      let effectiveDeptId = worker.department_id;
      let effectiveTeamId = worker.worker_team_id;
      const { data: leadTeam } = await supabase
        .from('worker_teams')
        .select('id, department_id')
        .eq('responsable_worker_id', worker.id)
        .limit(1)
        .maybeSingle();
      if (leadTeam) {
        effectiveDeptId = leadTeam.department_id;
        effectiveTeamId = effectiveTeamId || leadTeam.id;
        console.log(`[getWorkerCalendarPreview] Responsable override: dept ${worker.department_id} -> ${effectiveDeptId}`);
      }

      // Get department
      const { data: dept } = await supabase
        .from('departments')
        .select('name, max_days_per_employee, manual_free_days_enabled, manual_free_days_value')
        .eq('id', effectiveDeptId)
        .maybeSingle();

      // Resolve work group (direct or through team, using effective team)
      let workGroupId = worker.work_group_id;
      const resolvedTeamId = effectiveTeamId;
      if (!workGroupId && resolvedTeamId) {
        const { data: teamGroup } = await supabase
          .from('work_group_teams')
          .select('work_group_id')
          .eq('worker_team_id', resolvedTeamId)
          .maybeSingle();
        if (teamGroup) {
          workGroupId = teamGroup.work_group_id;
        }
      }

      // Get work group with free days info
      const { data: workGroup } = workGroupId
        ? await supabase
            .from('work_groups')
            .select('id, name, color, max_free_days, free_days_deduction')
            .eq('id', workGroupId)
            .maybeSingle()
        : { data: null };

      // Get calendar for current year
      let { data: calendar } = await supabase
        .from('annual_calendars')
        .select('id, year, info_text')
        .eq('department_id', effectiveDeptId)
        .eq('year', currentYear)
        .maybeSingle();

      if (!calendar) {
        const { data: latest } = await supabase
          .from('annual_calendars')
          .select('id, year, info_text')
          .eq('department_id', effectiveDeptId)
          .order('year', { ascending: false })
          .limit(1)
          .maybeSingle();
        calendar = latest || null;
      }

      // Parallel fetch all related data including worker personal calendar days overrides
      const [calendarDaysRes, customTypesRes, approvedRequestsRes, pendingRequestsRes, workGroupsRes, personalOverridesRes, signedModificationsRes] = await Promise.all([
        calendar?.id 
          ? supabase.from('annual_calendar_days').select('id, date, day_type, legend, group_id, group_id_2, custom_day_type_id').eq('calendar_id', calendar.id)
          : Promise.resolve({ data: [] }),
        supabase.from('custom_day_types').select('id, name, color, system_type').eq('department_id', effectiveDeptId).order('sort_order'),
        supabase.from('vacation_requests').select('id, vacation_request_dates(date)').eq('worker_number', worker.worker_number).eq('department_id', effectiveDeptId).eq('status', 'APPROVED'),
        supabase.from('vacation_requests').select('id, vacation_request_dates(date)').eq('worker_number', worker.worker_number).eq('department_id', effectiveDeptId).eq('status', 'PENDING'),
        supabase.from('work_groups').select('id, name, color').eq('department_id', effectiveDeptId).order('sort_order'),
        // Fetch worker personal calendar days overrides - this is where unlocked_by_admin entries are stored
        supabase.from('worker_personal_calendar_days').select('date, day_type, half_day').eq('worker_id', worker.id).eq('year', calendar?.year ?? currentYear),
        // CRITICAL: Also fetch signed modifications to ensure unlockedDates is complete (handles legacy mods)
        supabase.from('worker_calendar_modifications').select('id, removed_group_days').eq('worker_id', worker.id).eq('status', 'signed').eq('year', calendar?.year ?? currentYear),
      ]);

      const calendarDays = calendarDaysRes.data || [];
      const customDayTypes = customTypesRes.data || [];
      const workGroups = workGroupsRes.data || [];
      const personalOverrides = personalOverridesRes.data || [];
      const signedModifications = signedModificationsRes.data || [];

      // Build set of unlocked dates from personal overrides
      const unlockedFromOverrides = new Set<string>();
      (personalOverrides || []).forEach((po: any) => {
        if (po.day_type === 'unlocked_by_admin') {
          unlockedFromOverrides.add(po.date);
        }
      });

      // Build set of unlocked dates from signed modifications (source of truth)
      const unlockedFromModifications = new Set<string>();
      const modificationsToBackfill: { id: string; dates: any[] }[] = [];
      
      (signedModifications || []).forEach((mod: any) => {
        if (mod.removed_group_days && Array.isArray(mod.removed_group_days)) {
          const dates = mod.removed_group_days.map((d: any) => typeof d === 'string' ? d : d.date);
          dates.forEach((d: string) => unlockedFromModifications.add(d));
          
          // Check if any date is missing from overrides - if so, needs backfill
          const missingDates = dates.filter((d: string) => !unlockedFromOverrides.has(d));
          if (missingDates.length > 0) {
            modificationsToBackfill.push({ id: mod.id, dates: mod.removed_group_days });
          }
        }
      });

      // Merge both sources - union of unlocked dates
      const unlockedDates = new Set<string>([...unlockedFromOverrides, ...unlockedFromModifications]);

      // Perform idempotent backfill if needed (auto-repair legacy modifications)
      if (modificationsToBackfill.length > 0) {
        console.log(`[getWorkerCalendarPreview] Backfilling ${modificationsToBackfill.length} legacy modifications for worker ${worker.id}`);
        
        for (const mod of modificationsToBackfill) {
          // Delete existing entries for this modification (idempotency)
          await supabase
            .from('worker_personal_calendar_days')
            .delete()
            .eq('modification_id', mod.id);
          
          // Insert all removed dates as unlocked_by_admin
          const toInsert = mod.dates.map((rd: any) => ({
            worker_id: worker.id,
            department_id: worker.department_id,
            modification_id: mod.id,
            date: typeof rd === 'string' ? rd : rd.date,
            day_type: 'unlocked_by_admin',
            half_day: false,
            year: calendar?.year ?? currentYear,
          }));
          
          await supabase
            .from('worker_personal_calendar_days')
            .insert(toInsert);
          
          console.log(`[getWorkerCalendarPreview] Backfilled ${toInsert.length} dates for modification ${mod.id}`);
        }
      }

      console.log(`[getWorkerCalendarPreview] Worker ${worker.id} has ${unlockedDates.size} total unlocked dates (${unlockedFromOverrides.size} from overrides, ${unlockedFromModifications.size} from signed mods)`);

      // Extract approved and pending dates
      const approvedDates: string[] = [];
      (approvedRequestsRes.data || []).forEach((req: any) => {
        (req?.vacation_request_dates || []).forEach((d: any) => {
          if (d?.date) approvedDates.push(d.date);
        });
      });

      const pendingDates: string[] = [];
      (pendingRequestsRes.data || []).forEach((req: any) => {
        (req?.vacation_request_dates || []).forEach((d: any) => {
          if (d?.date) pendingDates.push(d.date);
        });
      });

      // Calculate vacation stats, respecting unlocked dates
      let groupVacationDays = 0;
      let generalVacationDays = 0;
      const otherGroupVacationDays: string[] = [];

      calendarDays.forEach((day: any) => {
        // Skip days that have been unlocked by admin modification
        if (unlockedDates.has(day.date)) {
          return;
        }
        
        if (day.day_type === 'vacaciones_generales') {
          generalVacationDays++;
        } else if (day.day_type === 'vacaciones_grupo' || day.day_type === 'vacaciones') {
          if (workGroupId) {
            const isWorkerGroup = day.group_id === workGroupId || day.group_id_2 === workGroupId;
            if (isWorkerGroup) {
              groupVacationDays++;
            } else if (day.group_id || day.group_id_2) {
              otherGroupVacationDays.push(day.date);
            }
          } else if (day.group_id || day.group_id_2) {
            otherGroupVacationDays.push(day.date);
          }
        }
      });

      // Calculate vacation summary
      const adjustment = worker.vacation_days_adjustment ?? 0;
      const freeDaysDeduction = workGroup?.free_days_deduction ?? 0;
      let totalFreeAssignment: number;

      if (dept?.manual_free_days_enabled && dept?.manual_free_days_value != null) {
        totalFreeAssignment = dept.manual_free_days_value - freeDaysDeduction;
      } else {
        const baseDays = workGroup?.max_free_days ?? worker.pending_vacation_days ?? dept?.max_days_per_employee ?? 22;
        totalFreeAssignment = baseDays - groupVacationDays - generalVacationDays + adjustment - freeDaysDeduction;
      }

      const freeAssignmentUsed = approvedDates.length;

      const vacationSummary = {
        groupVacationDays,
        generalVacationDays,
        approvedRequestDays: approvedDates.length,
        totalVacationDays: groupVacationDays + generalVacationDays + approvedDates.length,
        totalFreeAssignment: Math.max(0, totalFreeAssignment),
        freeAssignmentUsed,
        freeAssignmentRemaining: Math.max(0, totalFreeAssignment - freeAssignmentUsed),
      };

      // Build personal day sets (added days that must appear on calendar)
      const libreConfigDates: string[] = [];
      const adminAssignedDates: string[] = [];
      const freeAssignmentDates: string[] = [];

      (personalOverrides || []).forEach((po: any) => {
        if (!po?.date) return;
        if (po.day_type === 'libre_configuracion') libreConfigDates.push(po.date);
        if (po.day_type === 'admin_assigned') adminAssignedDates.push(po.date);
        if (po.day_type === 'free_assignment') freeAssignmentDates.push(po.date);
      });

      // Build suspension dates set
      const suspensionDates: string[] = [];
      (personalOverrides || []).forEach((po: any) => {
        if (po?.day_type === 'suspension') suspensionDates.push(po.date);
      });

      const payload = {
        worker: {
          id: worker.id,
          name: worker.name,
          worker_number: worker.worker_number,
          department_id: worker.department_id,
          work_group_id: workGroupId,
        },
        departmentName: dept?.name || '',
        workGroup,
        year: calendar?.year ?? currentYear,
        calendarDays,
        customDayTypes,
        workGroups,
        approvedDates,
        pendingDates,
        otherGroupVacationDays,
        unlockedDates: Array.from(unlockedDates), // Include unlocked dates for UI filtering
        personalDays: personalOverrides,
        libreConfigDates,
        adminAssignedDates,
        freeAssignmentDates,
        suspensionDates,
        vacationSummary,
      };

      return new Response(
        JSON.stringify({ success: true, payload }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    if (action === 'getWorkerComments') {
      const { workerId } = data || {};

      if (!workerId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: comments, error } = await supabase
        .from('worker_comments')
        .select('*')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching comments:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch comments' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, comments: comments || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get worker schedule for admin view
    if (action === 'getWorkerSchedule') {
      const { workerId, workerTeamId, departmentId, weekNumber, year } = data || {};

      // Resolve effective department for responsables
      let effectiveScheduleDeptId = departmentId;
      let effectiveScheduleTeamId = workerTeamId;
      if (workerId) {
        const { data: leadTeam } = await supabase
          .from('worker_teams')
          .select('id, department_id')
          .eq('responsable_worker_id', workerId)
          .limit(1)
          .maybeSingle();
        if (leadTeam) {
          effectiveScheduleDeptId = leadTeam.department_id;
          effectiveScheduleTeamId = effectiveScheduleTeamId || leadTeam.id;
          console.log(`[getWorkerSchedule] Responsable override: dept ${departmentId} -> ${effectiveScheduleDeptId}`);
        }
      }

      if (!effectiveScheduleDeptId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Department ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check if schedule is configured (department-level flag still needed for global enable/disable)
      const { data: deptData } = await supabase
        .from('departments')
        .select('schedule_configured')
        .eq('id', effectiveScheduleDeptId)
        .single();

      const scheduleConfigured = deptData?.schedule_configured ?? false;

      if (!scheduleConfigured) {
        return new Response(
          JSON.stringify({ success: true, scheduleConfigured: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get worker team info
      let workerTeam = null;
      if (effectiveScheduleTeamId) {
        const { data: teamData } = await supabase
          .from('worker_teams')
          .select('id, name')
          .eq('id', effectiveScheduleTeamId)
          .single();
        workerTeam = teamData;
      }

      // Workers can see current week if it's reviewed, OR next week if today is Friday or later
      // Determine which week to show based on today's date
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday, 5 = Friday
      const isFridayOrLater = dayOfWeek >= 5 || dayOfWeek === 0; // Friday, Saturday, Sunday

      // Calculate current ISO week
      const getIsoWeekInfo = (date: Date): { week: number; year: number } => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return {
          week: Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7),
          year: d.getUTCFullYear(),
        };
      };

      const currentWeekInfo = getIsoWeekInfo(today);
      
      // Calculate next week
      const nextWeekDate = new Date(today);
      nextWeekDate.setDate(nextWeekDate.getDate() + 7);
      const nextWeekInfo = getIsoWeekInfo(nextWeekDate);

      // Get shifts
      const { data: shiftsData } = await supabase
        .from('department_shifts')
        .select('*')
        .eq('department_id', effectiveScheduleDeptId)
        .order('sort_order');

      // Fetch the requested schedule
      const { data: scheduleData } = await supabase
        .from('weekly_schedules')
        .select('*')
        .eq('department_id', effectiveScheduleDeptId)
        .eq('week_number', weekNumber)
        .eq('year', year)
        .single();

      // Check if requested week is reviewed
      const isRequestedWeekReviewed = scheduleData?.is_reviewed ?? false;

      // Logic: 
      // - If requesting next week and today is Friday+, show it if reviewed
      // - If requesting current week, show it if reviewed
      // - If requesting a past week, show it if reviewed
      // - Otherwise, don't show it
      const isRequestingCurrentWeek = weekNumber === currentWeekInfo.week && year === currentWeekInfo.year;
      const isRequestingNextWeek = weekNumber === nextWeekInfo.week && year === nextWeekInfo.year;
      const isRequestingPastWeek = year < currentWeekInfo.year || 
        (year === currentWeekInfo.year && weekNumber < currentWeekInfo.week);

      let canViewSchedule = false;
      
      if (isRequestingPastWeek || isRequestingCurrentWeek) {
        // Past or current week: show if reviewed
        canViewSchedule = isRequestedWeekReviewed;
      } else if (isRequestingNextWeek && isFridayOrLater) {
        // Next week from Friday onwards: show if reviewed
        canViewSchedule = isRequestedWeekReviewed;
      }
      // Future weeks (beyond next) or next week before Friday: don't show

      return new Response(
        JSON.stringify({
          success: true,
          scheduleConfigured: true,
          workerTeam,
          shifts: shiftsData || [],
          schedule: canViewSchedule ? scheduleData : null,
          weekReviewed: isRequestedWeekReviewed,
          canViewNextWeek: isFridayOrLater,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete a calendar modification
    if (action === 'deleteCalendarModification') {
      const { modificationId } = data || {};
      if (!modificationId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Modification ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Also clean up any related personal calendar days that were created
      const { data: mod } = await supabase
        .from('worker_calendar_modifications')
        .select('id, worker_id, added_dates, status')
        .eq('id', modificationId)
        .single();

      if (mod && mod.status === 'signed' && mod.added_dates) {
        // Remove personal calendar days that were added by this modification
        const addedDates = mod.added_dates as string[];
        if (addedDates.length > 0) {
          await supabase
            .from('worker_personal_calendar_days')
            .delete()
            .eq('worker_id', mod.worker_id)
            .in('date', addedDates);
        }
      }

      const { error: delError } = await supabase
        .from('worker_calendar_modifications')
        .delete()
        .eq('id', modificationId);

      if (delError) {
        console.error('Error deleting modification:', delError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to delete modification' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Deleted calendar modification ${modificationId} by ${manager.name}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all calendar modifications for admin panel
    if (action === 'getCalendarModifications') {
      // Fetch all modifications with related data
      const { data: modifications, error } = await supabase
        .from('worker_calendar_modifications')
        .select(`
          *,
          worker:workers!worker_calendar_modifications_worker_id_fkey(id, name, worker_number, email, deleted_at),
          department:departments!worker_calendar_modifications_department_id_fkey(id, name),
          original_group:work_groups!worker_calendar_modifications_original_group_id_fkey(id, name, color),
          new_group:work_groups!worker_calendar_modifications_new_group_id_fkey(id, name, color)
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error fetching calendar modifications:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch modifications' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Filter out modifications where the worker has been deleted
      const activeModifications = (modifications || []).filter((m: any) => !m.worker?.deleted_at);

      return new Response(
        JSON.stringify({ success: true, modifications: activeModifications }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resend calendar modification email
    if (action === 'resendCalendarModificationEmail') {
      const { modificationId } = data || {};

      if (!modificationId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Modification ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get the modification with worker and department info
      const { data: modification, error: modError } = await supabase
        .from('worker_calendar_modifications')
        .select(`
          *,
          worker:workers!worker_calendar_modifications_worker_id_fkey(id, name, worker_number, email),
          department:departments!worker_calendar_modifications_department_id_fkey(id, name)
        `)
        .eq('id', modificationId)
        .single();

      if (modError || !modification) {
        console.error('Error fetching modification:', modError);
        return new Response(
          JSON.stringify({ success: false, error: 'Modification not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Check if it's pending signature or signed (allow resend for both)
      if (modification.status !== 'pending_signature' && modification.status !== 'signed') {
        return new Response(
          JSON.stringify({ success: false, error: 'Cannot resend email - modification must be pending or signed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const workerEmail = modification.worker?.email;
      if (!workerEmail) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker email not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Build the signature link
      const baseUrl = 'https://vnprod.app';
      const signatureLink = `${baseUrl}/firmar-calendario/${modification.access_token}`;

      // Send the email
      const emailResult = await sendEmailNotification({
        to: workerEmail,
        type: 'calendar_modification_signature',
        data: {
          workerName: modification.worker?.name || 'Trabajador',
          workerNumber: modification.worker?.worker_number || '',
          departmentName: modification.department?.name || 'Departamento',
          adminName: modification.admin_name,
          adminReason: modification.admin_reason,
          year: modification.year,
          signatureLink,
        }
      });

      if (!emailResult.success) {
        return new Response(
          JSON.stringify({ success: false, error: emailResult.error || 'Failed to send email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Update email_sent_at
      await supabase
        .from('worker_calendar_modifications')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', modificationId);

      console.log(`Resent calendar modification email to ${workerEmail}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get count of recent modifications for badge
    if (action === 'getCalendarModificationsCount') {
      // Get pending modifications, excluding deleted workers (consistent with getCalendarModifications)
      const { data: pendingMods } = await supabase
        .from('worker_calendar_modifications')
        .select('id, worker:workers!worker_calendar_modifications_worker_id_fkey(deleted_at)')
        .eq('status', 'pending_signature');

      const pendingCount = (pendingMods || []).filter((m: any) => !m.worker?.deleted_at).length;

      return new Response(
        JSON.stringify({
          success: true,
          pendingCount,
          recentSignedCount: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate legal PDF document for a calendar modification
    if (action === 'generateCalendarModificationDocument') {
      const { modificationId } = data || {};
      if (!modificationId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Modification ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: mod, error: modErr } = await supabase
        .from('worker_calendar_modifications')
        .select(`
          *,
          worker:workers!worker_calendar_modifications_worker_id_fkey(id, name, worker_number, email),
          department:departments!worker_calendar_modifications_department_id_fkey(id, name),
          original_group:work_groups!worker_calendar_modifications_original_group_id_fkey(id, name),
          new_group:work_groups!worker_calendar_modifications_new_group_id_fkey(id, name)
        `)
        .eq('id', modificationId)
        .single();

      if (modErr || !mod) {
        return new Response(
          JSON.stringify({ success: false, error: 'Modification not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      function escHtml(text: string | null | undefined): string {
        if (!text) return '';
        const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, c => map[c] || c);
      }

      const fechaEmision = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
      const refCode = `MOD-${mod.year}-${(mod.worker?.worker_number || '000').padStart(5, '0')}-${mod.id.substring(0, 6).toUpperCase()}`;

      // Format dates
      const removedDates = (mod.removed_dates || []) as string[];
      const addedDates = (mod.added_dates || []) as string[];
      const formatDate = (d: string) => {
        try {
          return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        } catch { return d; }
      };

      const removedList = removedDates.map(d => `<li>${escHtml(formatDate(d))}</li>`).join('');
      const addedList = addedDates.map(d => `<li>${escHtml(formatDate(d))}</li>`).join('');

      let modTypeDesc = '';
      if (mod.modification_type === 'remove_group_days') modTypeDesc = 'Eliminación de días de grupo de vacaciones';
      else if (mod.modification_type === 'add_personal_days') modTypeDesc = 'Asignación de días libres personales';
      else if (mod.modification_type === 'change_group') modTypeDesc = `Cambio de grupo de vacaciones (de "${escHtml(mod.original_group?.name)}" a "${escHtml(mod.new_group?.name)}")`;
      else if (mod.modification_type === 'mixed') modTypeDesc = 'Modificación mixta (eliminación y adición de días)';
      else modTypeDesc = 'Modificación de calendario de vacaciones';

      const firmaFecha = mod.signed_at ? new Date(mod.signed_at).toLocaleString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

      const htmlContent = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Autorización Modificación Vacaciones - ${escHtml(mod.worker?.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:25mm 20mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Poppins',sans-serif;font-size:13px;line-height:1.7;color:#000;background:#fff;padding:40px 50px;max-width:793px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid #000;margin-bottom:24px}
.header-left{display:flex;align-items:center;gap:14px}
.header-left img{height:38px}
.header-left-text h1{font-size:15px;font-weight:600;letter-spacing:0.3px}
.header-left-text p{font-size:10px;color:#555;margin-top:1px}
.header-right{text-align:right;font-size:10px;color:#555;line-height:1.5}
.badge{display:inline-block;background:#e8f5e9;color:#2e7d32;font-size:11px;font-weight:600;padding:4px 14px;border-radius:4px;letter-spacing:0.5px;border:1px solid #c8e6c9}
h2{font-size:13px;font-weight:600;margin:22px 0 8px;color:#000;letter-spacing:0.2px}
.worker-info{margin-bottom:18px}
.worker-info table{width:100%;border-collapse:collapse}
.worker-info td{padding:5px 10px;font-size:12px;border:1px solid #e0e0e0}
.worker-info td:first-child{width:160px;background:#f9f9f9;font-weight:400;color:#555}
.section{background:#fafafa;border:1px solid #eee;border-radius:4px;padding:12px 16px;margin-bottom:14px;font-size:12px}
.dates-list{list-style:none;padding:0;margin:0}
.dates-list li{padding:3px 0;font-size:12px;border-bottom:1px solid #f0f0f0}
.dates-list li:last-child{border-bottom:none}
.dates-list li::before{content:'📅 ';margin-right:4px}
.auth-text{background:#f0faf0;border:1px solid #c8e6c9;border-radius:4px;padding:14px 18px;margin:18px 0;font-size:12px;line-height:1.8}
.firma-section{display:flex;justify-content:space-between;gap:30px;margin-top:30px;page-break-inside:avoid;page-break-before:auto}
.firma-box{flex:1;text-align:center;padding:16px;border:1px solid #e0e0e0;border-radius:4px;min-height:140px}
.firma-box p{font-size:11px;font-weight:600;margin-bottom:8px}
.firma-box img{max-width:220px;max-height:80px;margin:8px auto;display:block}
.firma-meta{font-size:10px;color:#777;margin-top:4px}
.footer{display:flex;justify-content:space-between;font-size:9px;color:#888;border-top:1px solid #ddd;padding-top:10px;margin-top:40px;page-break-inside:avoid}
@media print{body{padding:20px 40px;margin:0}}
</style></head><body>

<div class="header">
<div class="header-left">
<img src="https://vnvacaciones.lovable.app/images/verdnatura-logo-green.png" alt="Verdnatura">
<div class="header-left-text"><h1>Verdnatura Levante S.L.</h1><p>Autorización de modificación de vacaciones</p></div>
</div>
<div class="header-right">B97367486 - Carrer Fenollar, 2, 46680, Algemesí (Valencia)<br>${escHtml(fechaEmision)}</div>
</div>

<div style="margin-bottom:20px">
<span class="badge">AUTORIZACIÓN DE MODIFICACIÓN DE VACACIONES</span>
<span style="font-size:11px;color:#888;margin-left:12px">${escHtml(refCode)}</span>
</div>

<h2>Identificación del trabajador/a</h2>
<div class="worker-info"><table>
<tr><td>Nombre completo</td><td><strong>${escHtml(mod.worker?.name)}</strong></td></tr>
<tr><td>Nº ficha</td><td>${escHtml(mod.worker?.worker_number)}</td></tr>
<tr><td>Departamento</td><td>${escHtml(mod.department?.name)}</td></tr>
<tr><td>Año del calendario</td><td>${mod.year}</td></tr>
</table></div>

<h2>Tipo de modificación</h2>
<div class="section"><p>${modTypeDesc}</p></div>

${removedDates.length > 0 ? `<h2>Días eliminados del calendario (${removedDates.length})</h2>
<div class="section"><ul class="dates-list">${removedList}</ul></div>` : ''}

${addedDates.length > 0 ? `<h2>Días añadidos al calendario (${addedDates.length})</h2>
<div class="section"><ul class="dates-list">${addedList}</ul></div>` : ''}

<h2>Motivo de la modificación</h2>
<div class="section"><p>${escHtml(mod.admin_reason)}</p><p style="font-size:11px;color:#777;margin-top:6px">Solicitado por: ${escHtml(mod.admin_name)}</p></div>

<div class="auth-text">
<strong>Autorización expresa del trabajador/a:</strong><br>
El/la trabajador/a <strong>${escHtml(mod.worker?.name)}</strong>, con número de ficha <strong>${escHtml(mod.worker?.worker_number)}</strong>, 
declara haber sido informado/a de la modificación de su calendario de vacaciones correspondiente al año <strong>${mod.year}</strong> 
y autoriza expresamente dicha modificación conforme a los términos descritos en el presente documento.
${mod.signed_at ? `<br><br>Firmado digitalmente el <strong>${escHtml(firmaFecha)}</strong>${mod.signed_ip ? ` desde la dirección IP <strong>${escHtml(mod.signed_ip)}</strong>` : ''}.` : ''}
</div>

<div class="firma-section">
<div class="firma-box">
<p>Verdnatura Levante S.L.</p>
<img src="https://vnvacaciones.lovable.app/images/firma_juanvi.png" alt="Firma y sello" onerror="this.style.display='none'">
</div>
<div class="firma-box">
<p>Recibí — ${escHtml(mod.worker?.name)}</p>
${mod.signature && mod.signature.startsWith('data:image') ? `<img src="${mod.signature}" alt="Firma del trabajador" style="max-width:220px;max-height:80px;margin:8px auto;display:block">` : mod.signed_at ? '<p style="color:#2e7d32;font-size:10px;margin-top:20px;font-weight:600">✓ Aplicado directamente por administración</p>' : '<p style="color:#999;font-size:10px;margin-top:30px">Pendiente de firma</p>'}
${mod.signed_at ? `<p class="firma-meta">${escHtml(firmaFecha)}</p>` : ''}
</div>
</div>

<div class="footer"><span>${escHtml(refCode)}</span><span>Fecha emisión: ${escHtml(fechaEmision)}</span></div>
</body></html>`;

      return new Response(
        JSON.stringify({ success: true, html: htmlContent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send test email for calendar modification signed confirmation (admin action)
    if (action === 'sendTestCalendarModificationEmail') {
      const { email, workerName, workerNumber, departmentName, year, adminName, removedDays, addedDays } = data || {};
      
      if (!email) {
        return new Response(
          JSON.stringify({ success: false, error: 'Email is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      console.log(`Sending test calendar modification email to ${email}`);
      
      const sampleYear = year || new Date().getFullYear();
      const sampleWorkerNumber = workerNumber || '00000';

      const emailResult = await sendEmailNotification({
        to: email,
        type: 'calendar_modification_signed_confirmation',
        data: {
          workerName: workerName || 'Trabajador de Ejemplo',
          workerNumber: sampleWorkerNumber,
          departmentName: departmentName || 'Departamento de Prueba',
          year: sampleYear,
          adminName: adminName || 'Administrador',
          removedDays: removedDays ?? 5,
          addedDays: addedDays ?? 9,
          removedDates: [
            `${sampleYear}-03-10`,
            `${sampleYear}-03-11`,
            `${sampleYear}-03-12`,
            `${sampleYear}-03-13`,
            `${sampleYear}-03-14`,
          ],
          addedDates: [
            `${sampleYear}-03-17`,
            `${sampleYear}-03-18`,
            `${sampleYear}-03-19`,
            `${sampleYear}-03-20`,
            `${sampleYear}-03-21`,
            `${sampleYear}-03-24`,
            `${sampleYear}-03-25`,
            `${sampleYear}-03-26`,
            `${sampleYear}-03-27`,
          ],
          signedAt: new Date().toISOString(),
          salixLink: `https://salix.verdnatura.es/#/worker/${sampleWorkerNumber}/calendar`,
        }
      });

      if (!emailResult.success) {
        console.error('Failed to send test email:', emailResult.error);
        return new Response(
          JSON.stringify({ success: false, error: emailResult.error || 'Failed to send email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Test email sent successfully to ${email}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send test email for calendar modification signature request (admin action)
    if (action === 'sendTestCalendarSignatureRequestEmail') {
      const { email, workerName, workerNumber, departmentName, year, adminReason, adminName, signatureLink } = data || {};
      
      if (!email) {
        return new Response(
          JSON.stringify({ success: false, error: 'Email is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      console.log(`Sending test calendar signature request email to ${email}`);
      
      // Try to find an existing modification with pending_signature status to use its real token
      // This allows testing the full flow with a working link
      let realSignatureLink = signatureLink;
      let realWorkerName = workerName;
      let realWorkerNumber = workerNumber;
      let realDepartmentName = departmentName;
      let realAdminReason = adminReason;
      let realAdminName = adminName;
      const desiredYear = new Date().getFullYear();
      // Force current year for tests to avoid outdated 2025 content lingering in templates
      let realYear = desiredYear;

      if (!signatureLink) {
        const { data: existingMod } = await supabase
          .from('worker_calendar_modifications')
          .select(`
            access_token, admin_reason, admin_name, year,
            workers(name, worker_number),
            departments(name)
          `)
          .eq('status', 'pending_signature')
          // Avoid reusing old pending tokens from previous years
          .eq('year', desiredYear)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingMod?.access_token) {
          realSignatureLink = `https://vnprod.app/firmar-calendario/${existingMod.access_token}`;
          realWorkerName = (existingMod.workers as any)?.name || realWorkerName;
          realWorkerNumber = (existingMod.workers as any)?.worker_number || realWorkerNumber;
          realDepartmentName = (existingMod.departments as any)?.name || realDepartmentName;
          realAdminReason = existingMod.admin_reason || realAdminReason;
          realAdminName = existingMod.admin_name || realAdminName;
          realYear = existingMod.year || realYear;
          console.log(`Using real modification token for test: ${existingMod.access_token}`);
        } else {
          // Fallback: create a temporary test modification
          const testAccessToken = crypto.randomUUID();
          
          // Get a random worker for the test
          const { data: testWorker } = await supabase
            .from('workers')
            .select('id, name, worker_number, department_id, departments(name)')
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle();

          if (testWorker) {
            const currentYear = desiredYear;
            const { data: newMod } = await supabase
              .from('worker_calendar_modifications')
              .insert({
                worker_id: testWorker.id,
                department_id: testWorker.department_id,
                year: currentYear,
                modification_type: 'remove_group_days',
                admin_name: 'Test Admin',
                admin_reason: 'Prueba de firma de modificación de calendario',
                removed_group_days: [
                  `${currentYear}-07-01`,
                  `${currentYear}-07-02`,
                  `${currentYear}-07-03`,
                ],
                access_token: testAccessToken,
                status: 'pending_signature',
              })
              .select()
              .single();

            if (newMod) {
              realSignatureLink = `https://vnprod.app/firmar-calendario/${testAccessToken}`;
              realWorkerName = testWorker.name;
              realWorkerNumber = testWorker.worker_number;
              realDepartmentName = (testWorker.departments as any)?.name || 'Departamento';
              realYear = currentYear;
              console.log(`Created test modification with token: ${testAccessToken}`);
            }
          }
        }
      }

      const sampleYear = realYear;
      const sampleWorkerNumber = realWorkerNumber || '0000';

      const emailResult = await sendEmailNotification({
        to: email,
        type: 'calendar_modification_signature',
        data: {
          workerName: realWorkerName || '[TEST] Usuario de Prueba',
          workerNumber: sampleWorkerNumber,
          departmentName: realDepartmentName || 'Departamento de Prueba',
          year: sampleYear,
          adminReason: realAdminReason || 'Cambio solicitado por necesidades operativas del departamento.',
          adminName: realAdminName || 'Administrador de Prueba',
          signatureLink: realSignatureLink || `https://vnprod.app/firmar-calendario/test-fallback`,
        }
      });

      if (!emailResult.success) {
        console.error('Failed to send test signature request email:', emailResult.error);
        return new Response(
          JSON.stringify({ success: false, error: emailResult.error || 'Failed to send email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`Test signature request email sent successfully to ${email}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get backup history (admin only)
    if (action === 'getBackupHistory') {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: 'Solo administradores pueden ver el historial de backups' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const { data: backups, error } = await supabase
        .from('backup_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching backup history:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al cargar historial de backups' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, backups: backups || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Regenerate backup download URL
    // =====================================================
    if (action === 'regenerateBackupUrl') {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: 'Solo administradores pueden regenerar enlaces' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const fileName = data?.file_name;
      if (!fileName) {
        return new Response(
          JSON.stringify({ success: false, error: 'file_name requerido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('backups')
        .createSignedUrl(fileName, 86400);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error('Error generating signed URL:', signedUrlError);
        return new Response(
          JSON.stringify({ success: false, error: 'No se pudo generar el enlace. ¿Existe el archivo?' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      const expiresAt = new Date(Date.now() + 86400 * 1000).toISOString();

      await supabase
        .from('backup_history')
        .update({ download_url: signedUrlData.signedUrl, expires_at: expiresAt })
        .eq('file_name', fileName);

      return new Response(
        JSON.stringify({ success: true, download_url: signedUrlData.signedUrl, expires_at: expiresAt }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get worker by worker_number (for calendar preview from requests)
    if (action === 'getWorkerByNumberForCalendar') {
      const inputWorkerNumber = data?.workerNumber;

      if (!inputWorkerNumber) {
        return new Response(
          JSON.stringify({ success: false, error: 'Worker number required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: worker, error: workerError } = await supabase
        .from('workers')
        .select('id, name, worker_number, department_id')
        .eq('worker_number', inputWorkerNumber)
        .is('deleted_at', null)
        .single();

      if (workerError || !worker) {
        console.error('Worker not found for worker_number:', inputWorkerNumber, workerError);
        return new Response(
          JSON.stringify({ success: false, error: 'Trabajador no encontrado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, worker }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Get global free days settings
    // =====================================================
    if (action === 'getGlobalFreeDaysSettings') {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: 'Solo administradores pueden ver esta configuración' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const { data: settings, error } = await supabase
        .from('app_settings')
        .select('global_free_days_enabled, global_free_days_value')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching global free days settings:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al cargar configuración' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          enabled: settings?.global_free_days_enabled ?? false,
          value: settings?.global_free_days_value ?? null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Update global free days settings
    // =====================================================
    if (action === 'updateGlobalFreeDaysSettings') {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: 'Solo administradores pueden modificar esta configuración' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const enabled = data?.enabled ?? false;
      const value = data?.value ?? null;

      console.log(`Updating global free days: enabled=${enabled}, value=${value}`);

      // Get the app_settings ID first
      const { data: currentSettings } = await supabase
        .from('app_settings')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (!currentSettings?.id) {
        return new Response(
          JSON.stringify({ success: false, error: 'No se encontró la configuración de la aplicación' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      const { error } = await supabase
        .from('app_settings')
        .update({
          global_free_days_enabled: enabled,
          global_free_days_value: enabled ? value : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentSettings.id);

      if (error) {
        console.error('Error updating global free days settings:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al guardar configuración' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log('Global free days settings updated successfully');

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Get global free days impact preview
    // =====================================================
    if (action === 'getGlobalFreeDaysImpactPreview') {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: 'Solo administradores' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const proposedValue = data?.value ?? 0;
      console.log(`Calculating global free days impact for value: ${proposedValue}`);

      // Get all active workers with their approved days count
      const { data: workers, error: workersError } = await supabase
        .from('workers')
        .select('id, name, worker_number, department_id')
        .is('deleted_at', null)
        .order('name');

      if (workersError) {
        console.error('Error fetching workers for impact preview:', workersError);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al obtener trabajadores' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Get all approved vacation requests with their dates
      const { data: approvedRequests } = await supabase
        .from('vacation_requests')
        .select('id, worker_number')
        .eq('status', 'APPROVED');

      const requestIds = (approvedRequests || []).map(r => r.id);
      
      // Get all approved dates with half_day info
      let approvedDatesByWorkerNumber: Record<string, number> = {};
      
      if (requestIds.length > 0) {
        const { data: approvedDates } = await supabase
          .from('vacation_request_dates')
          .select('vacation_request_id, half_day')
          .in('vacation_request_id', requestIds);

        // Group by worker_number
        const requestToWorker: Record<string, string> = {};
        (approvedRequests || []).forEach(r => {
          requestToWorker[r.id] = r.worker_number;
        });

        (approvedDates || []).forEach(d => {
          const workerNumber = requestToWorker[d.vacation_request_id];
          if (workerNumber) {
            const dayValue = d.half_day ? 0.5 : 1;
            approvedDatesByWorkerNumber[workerNumber] = (approvedDatesByWorkerNumber[workerNumber] || 0) + dayValue;
          }
        });
      }

      // Get department names for context
      const { data: departments } = await supabase
        .from('departments')
        .select('id, name');

      const deptMap: Record<string, string> = {};
      (departments || []).forEach(d => {
        deptMap[d.id] = d.name;
      });

      // Build impact preview
      const impactPreview = (workers || []).map(w => {
        const usedDays = approvedDatesByWorkerNumber[w.worker_number] || 0;
        const remainingDays = Math.max(0, proposedValue - usedDays);
        return {
          workerId: w.id,
          workerName: w.name,
          workerNumber: w.worker_number,
          departmentName: deptMap[w.department_id] || '-',
          usedDays,
          remainingDays,
          wouldHaveZero: remainingDays === 0 && proposedValue > 0
        };
      });

      // Calculate summary stats
      const totalWorkers = impactPreview.length;
      const workersWithZero = impactPreview.filter(w => w.wouldHaveZero).length;
      const workersWithRemainingDays = impactPreview.filter(w => w.remainingDays > 0).length;

      return new Response(
        JSON.stringify({ 
          success: true, 
          preview: impactPreview,
          summary: {
            totalWorkers,
            workersWithZero,
            workersWithRemainingDays,
            proposedValue
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get workers in trial period for manager dashboard
    if (action === 'getManagerTrialPeriodWorkers') {
      const targetManagerId = data?.managerId || manager.id;
      
      // Get departments assigned to this manager
      const { data: assignments, error: assignError } = await supabase
        .from('manager_department_assignments')
        .select('department_id')
        .eq('manager_id', targetManagerId);

      if (assignError) {
        console.error('Error fetching manager assignments:', assignError);
        return new Response(
          JSON.stringify({ success: false, error: assignError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      const departmentIds = (assignments || []).map(a => a.department_id);
      
      if (departmentIds.length === 0) {
        return new Response(
          JSON.stringify({ success: true, workers: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get workers with start_contract_date in the manager's departments
      const { data: workers, error: workersError } = await supabase
        .from('workers')
        .select(`
          id,
          name,
          worker_number,
          department_id,
          worker_team_id,
          work_group_id,
          start_contract_date,
          departments:department_id(name),
          worker_teams:worker_team_id(name),
          work_groups:work_group_id(name)
        `)
        .in('department_id', departmentIds)
        .is('deleted_at', null)
        .not('start_contract_date', 'is', null)
        .order('start_contract_date', { ascending: false });

      if (workersError) {
        console.error('Error fetching workers:', workersError);
        return new Response(
          JSON.stringify({ success: false, error: workersError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Calculate trial period and filter those still in trial
      const today = new Date();
      const workersInTrial = (workers || [])
        .map((w: any) => {
          const contractDate = new Date(w.start_contract_date);
          const daysSince = Math.floor((today.getTime() - contractDate.getTime()) / (1000 * 60 * 60 * 24));
          const daysRemaining = 30 - daysSince;
          
          return {
            id: w.id,
            name: w.name,
            worker_number: w.worker_number,
            department_id: w.department_id,
            department_name: w.departments?.name || null,
            worker_team_name: w.worker_teams?.name || null,
            work_group_name: w.work_groups?.name || null,
            start_contract_date: w.start_contract_date,
            daysRemaining,
            isCritical: daysRemaining > 0 && daysRemaining <= 5,
          };
        })
        .filter((w: any) => w.daysRemaining > 0)
        .sort((a: any, b: any) => a.daysRemaining - b.daysRemaining);

      return new Response(
        JSON.stringify({ success: true, workers: workersInTrial }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Personal Schedules - Get all data
    // =====================================================
    if (action === 'getPersonalSchedules') {
       const departmentId = data?.departmentId;
       if (!departmentId) {
         return new Response(
           JSON.stringify({ success: false, error: 'Department ID required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       console.log(`Fetching personal schedules for department: ${departmentId}`);
 
       // Get rotation groups for this department
       const { data: rotationGroups, error: groupsError } = await supabase
         .from('personal_schedule_rotation_groups')
         .select('*')
         .eq('department_id', departmentId)
         .order('created_at');
 
       if (groupsError) {
         console.error('Error fetching rotation groups:', groupsError);
         return new Response(
           JSON.stringify({ success: false, error: groupsError.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }
 
       // Get workers in this department (used for reference + legacy UIs)
       const { data: workers, error: workersError } = await supabase
         .from('workers')
         .select('id, name, worker_number')
         .eq('department_id', departmentId)
         .is('deleted_at', null)
         .order('name');
 
       if (workersError) {
         console.error('Error fetching workers:', workersError);
         return new Response(
           JSON.stringify({ success: false, error: workersError.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }
 
       const departmentWorkerIds = (workers || []).map((w: any) => w.id);
       const rotationGroupIds = (rotationGroups || []).map((g: any) => g.id);

       // Get personal schedules for:
       // - workers in this department (ungrouped)
       // - schedules explicitly attached to rotation groups of this department (even if worker belongs to another department)
       let schedules: any[] = [];
       if (rotationGroupIds.length > 0 && departmentWorkerIds.length > 0) {
         const { data: sched, error: schedulesError } = await supabase
           .from('personal_work_schedules')
           .select('*')
           .or(
             `rotation_group_id.in.(${rotationGroupIds.join(',')}),and(rotation_group_id.is.null,worker_id.in.(${departmentWorkerIds.join(',')}))`
           )
           .order('rotation_position');

         if (schedulesError) {
           console.error('Error fetching personal schedules:', schedulesError);
           return new Response(
             JSON.stringify({ success: false, error: schedulesError.message }),
             { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
           );
         }
         schedules = sched || [];
       } else if (rotationGroupIds.length > 0) {
         const { data: sched, error: schedulesError } = await supabase
           .from('personal_work_schedules')
           .select('*')
           .in('rotation_group_id', rotationGroupIds)
           .order('rotation_position');

         if (schedulesError) {
           console.error('Error fetching personal schedules:', schedulesError);
           return new Response(
             JSON.stringify({ success: false, error: schedulesError.message }),
             { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
           );
         }
         schedules = sched || [];
       } else if (departmentWorkerIds.length > 0) {
         const { data: sched, error: schedulesError } = await supabase
           .from('personal_work_schedules')
           .select('*')
           .in('worker_id', departmentWorkerIds)
           .order('rotation_position');

         if (schedulesError) {
           console.error('Error fetching personal schedules:', schedulesError);
           return new Response(
             JSON.stringify({ success: false, error: schedulesError.message }),
             { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
           );
         }
         schedules = sched || [];
       }

       // Attach worker info to schedules (fetch workers for all schedule worker_ids)
       const scheduleWorkerIds = Array.from(new Set((schedules || []).map((s: any) => s.worker_id))).filter(Boolean);
       const workerMap: Record<string, any> = {};
       if (scheduleWorkerIds.length > 0) {
         const { data: scheduleWorkers, error: scheduleWorkersError } = await supabase
           .from('workers')
           .select('id, name, worker_number, department_id')
           .in('id', scheduleWorkerIds);

         if (scheduleWorkersError) {
           console.error('Error fetching workers for schedules:', scheduleWorkersError);
           return new Response(
             JSON.stringify({ success: false, error: scheduleWorkersError.message }),
             { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
           );
         }
         (scheduleWorkers || []).forEach((w: any) => { workerMap[w.id] = w; });
       }

       const personalSchedules = (schedules || []).map((s: any) => ({
         ...s,
         worker: workerMap[s.worker_id] || null,
       }));
 
       return new Response(
         JSON.stringify({
           success: true,
           rotationGroups: rotationGroups || [],
           personalSchedules,
           workers: workers || [],
         }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // =====================================================
     // Personal Schedules - Create Rotation Group
     // =====================================================
     if (action === 'createPersonalScheduleRotationGroup') {
       const { departmentId, name } = data || {};
       if (!departmentId || !name) {
         return new Response(
           JSON.stringify({ success: false, error: 'Department ID and name required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       const currentWeek = Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000);
       const currentYear = new Date().getFullYear();
 
       const { data: newGroup, error } = await supabase
         .from('personal_schedule_rotation_groups')
         .insert({
           department_id: departmentId,
           name,
           rotation_enabled: true,
           base_week: currentWeek,
           base_year: currentYear,
         })
         .select()
         .single();
 
       if (error) {
         console.error('Error creating rotation group:', error);
         return new Response(
           JSON.stringify({ success: false, error: error.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }
 
       console.log(`Created rotation group: ${name}`);
       return new Response(
         JSON.stringify({ success: true, group: newGroup }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // =====================================================
     // Personal Schedules - Update Rotation Group
     // =====================================================
     if (action === 'updatePersonalScheduleRotationGroup') {
       const { groupId, rotationEnabled, name } = data || {};
       if (!groupId) {
         return new Response(
           JSON.stringify({ success: false, error: 'Group ID required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       const updateData: any = {};
       if (typeof rotationEnabled === 'boolean') updateData.rotation_enabled = rotationEnabled;
       if (name) updateData.name = name;
 
       const { error } = await supabase
         .from('personal_schedule_rotation_groups')
         .update(updateData)
         .eq('id', groupId);
 
       if (error) {
         console.error('Error updating rotation group:', error);
         return new Response(
           JSON.stringify({ success: false, error: error.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }
 
       console.log(`Updated rotation group: ${groupId}`);
       return new Response(
         JSON.stringify({ success: true }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // =====================================================
     // Personal Schedules - Delete Rotation Group
     // =====================================================
     if (action === 'deletePersonalScheduleRotationGroup') {
       const groupId = data?.groupId;
       if (!groupId) {
         return new Response(
           JSON.stringify({ success: false, error: 'Group ID required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       // The ON DELETE SET NULL will handle unlinking schedules
       const { error } = await supabase
         .from('personal_schedule_rotation_groups')
         .delete()
         .eq('id', groupId);
 
       if (error) {
         console.error('Error deleting rotation group:', error);
         return new Response(
           JSON.stringify({ success: false, error: error.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }
 
       console.log(`Deleted rotation group: ${groupId}`);
       return new Response(
         JSON.stringify({ success: true }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // =====================================================
     // Personal Schedules - Create Personal Work Schedule
     // =====================================================
     if (action === 'createPersonalWorkSchedule') {
       const { workerId, rotationGroupId } = data || {};
       if (!workerId) {
         return new Response(
           JSON.stringify({ success: false, error: 'Worker ID required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       // If adding to a group, get the next rotation position
       let rotationPosition = 0;
       if (rotationGroupId) {
         const { data: existingSchedules } = await supabase
           .from('personal_work_schedules')
           .select('rotation_position')
           .eq('rotation_group_id', rotationGroupId)
           .order('rotation_position', { ascending: false })
           .limit(1);
 
         if (existingSchedules && existingSchedules.length > 0) {
           rotationPosition = (existingSchedules[0] as any).rotation_position + 1;
         }
       }
 
       // Default schedule template (all rest days)
       const defaultTemplate: Record<string, { type: string; start: string | null; end: string | null }> = {};
       for (let i = 0; i <= 6; i++) {
         defaultTemplate[String(i)] = { type: 'rest', start: null, end: null };
       }
 
       const { data: newSchedule, error } = await supabase
         .from('personal_work_schedules')
         .insert({
           worker_id: workerId,
           rotation_group_id: rotationGroupId || null,
           rotation_position: rotationPosition,
           schedule_template: defaultTemplate,
           is_active: true,
         })
         .select()
         .single();
 
       if (error) {
         console.error('Error creating personal schedule:', error);
         return new Response(
           JSON.stringify({ success: false, error: error.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }
 
       console.log(`Created personal schedule for worker: ${workerId}`);
       return new Response(
         JSON.stringify({ success: true, schedule: newSchedule }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // =====================================================
     // Personal Schedules - Update Personal Work Schedule
     // =====================================================
     if (action === 'updatePersonalWorkSchedule') {
       const { scheduleId, scheduleTemplate, rotationGroupId, isActive, notes } = data || {};
       if (!scheduleId) {
         return new Response(
           JSON.stringify({ success: false, error: 'Schedule ID required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       const updateData: any = {};
       if (scheduleTemplate !== undefined) updateData.schedule_template = scheduleTemplate;
       if (rotationGroupId !== undefined) {
         updateData.rotation_group_id = rotationGroupId || null;
         // Reset rotation position when moving to new group
         if (rotationGroupId) {
           const { data: existingSchedules } = await supabase
             .from('personal_work_schedules')
             .select('rotation_position')
             .eq('rotation_group_id', rotationGroupId)
             .order('rotation_position', { ascending: false })
             .limit(1);
 
           updateData.rotation_position = existingSchedules && existingSchedules.length > 0 
             ? (existingSchedules[0] as any).rotation_position + 1 
             : 0;
         } else {
           updateData.rotation_position = 0;
         }
       }
       if (typeof isActive === 'boolean') updateData.is_active = isActive;
       if (notes !== undefined) updateData.notes = notes;
 
       const { error } = await supabase
         .from('personal_work_schedules')
         .update(updateData)
         .eq('id', scheduleId);
 
       if (error) {
         console.error('Error updating personal schedule:', error);
         return new Response(
           JSON.stringify({ success: false, error: error.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }
 
       console.log(`Updated personal schedule: ${scheduleId}`);
       return new Response(
         JSON.stringify({ success: true }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // =====================================================
     // Personal Schedules - Delete Personal Work Schedule
     // =====================================================
     if (action === 'deletePersonalWorkSchedule') {
       const scheduleId = data?.scheduleId;
       if (!scheduleId) {
         return new Response(
           JSON.stringify({ success: false, error: 'Schedule ID required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       const { error } = await supabase
         .from('personal_work_schedules')
         .delete()
         .eq('id', scheduleId);
 
       if (error) {
         console.error('Error deleting personal schedule:', error);
         return new Response(
           JSON.stringify({ success: false, error: error.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }
 
       console.log(`Deleted personal schedule: ${scheduleId}`);
       return new Response(
         JSON.stringify({ success: true }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // =====================================================
     // Personal Schedules - Get worker's schedule for a specific week (with rotation)
     // =====================================================
     if (action === 'getWorkerPersonalScheduleForWeek') {
       const { workerId, weekNumber, year } = data || {};
       if (!workerId || !weekNumber || !year) {
         return new Response(
           JSON.stringify({ success: false, error: 'Worker ID, week number and year required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       // Get worker's personal schedule
       const { data: schedule, error: scheduleError } = await supabase
         .from('personal_work_schedules')
         .select('*, personal_schedule_rotation_groups(*)')
         .eq('worker_id', workerId)
         .eq('is_active', true)
         .single();
 
       if (scheduleError) {
         // No personal schedule - return null (worker uses team schedule)
         return new Response(
           JSON.stringify({ success: true, hasPersonalSchedule: false, schedule: null }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
 
       const rotationGroup = schedule.personal_schedule_rotation_groups;
       
       // If no rotation group or rotation disabled, return base template
       if (!rotationGroup || !rotationGroup.rotation_enabled) {
         return new Response(
           JSON.stringify({
             success: true,
             hasPersonalSchedule: true,
             schedule: schedule.schedule_template,
             rotationApplied: false,
           }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
 
       // Get all schedules in this rotation group
       const { data: groupSchedules, error: groupError } = await supabase
         .from('personal_work_schedules')
         .select('id, worker_id, rotation_position, schedule_template')
         .eq('rotation_group_id', rotationGroup.id)
         .eq('is_active', true)
         .order('rotation_position');
 
       if (groupError || !groupSchedules || groupSchedules.length < 2) {
         // Not enough members for rotation
         return new Response(
           JSON.stringify({
             success: true,
             hasPersonalSchedule: true,
             schedule: schedule.schedule_template,
             rotationApplied: false,
           }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
 
       // Calculate rotation offset based on week difference from base
       const baseWeek = rotationGroup.base_week;
       const baseYear = rotationGroup.base_year;
       const weeksSinceBase = (year - baseYear) * 52 + (weekNumber - baseWeek);
       const rotationOffset = ((weeksSinceBase % groupSchedules.length) + groupSchedules.length) % groupSchedules.length;
 
       // Find this worker's position and calculate which template to use
       const workerPosition = (groupSchedules as any[]).findIndex((s: any) => s.worker_id === workerId);
       const templateIndex = (workerPosition - rotationOffset + groupSchedules.length) % groupSchedules.length;
       const templateToUse = groupSchedules[templateIndex]?.schedule_template || schedule.schedule_template;
 
       return new Response(
         JSON.stringify({
           success: true,
           hasPersonalSchedule: true,
           schedule: templateToUse,
           rotationApplied: true,
           rotationInfo: {
             groupName: rotationGroup.name,
             memberCount: groupSchedules.length,
             weekOffset: rotationOffset,
           },
         }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }

    // =====================================================
    // Search all workers (for personal schedules)
    // =====================================================
    if (action === 'searchAllWorkers') {
      console.log('Searching all workers for personal schedules');
      
      // Fetch all active workers with their departments
      const { data: workers, error: workersError } = await supabase
        .from('workers')
        .select('id, name, worker_number, worker_code, email, work_group_id, worker_team_id, department_id, departments:department_id(name)')
        .is('deleted_at', null)
        .order('name')
        .limit(2000);

      if (workersError) {
        console.error('Error fetching workers:', workersError);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al buscar trabajadores' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Fallback: if relation doesn't hydrate for any reason, resolve department names in one query.
      const deptIds = Array.from(
        new Set((workers || []).map((w: any) => w.department_id).filter(Boolean))
      );

      const deptNameById = new Map<string, string>();
      if (deptIds.length > 0) {
        const { data: depts } = await supabase
          .from('departments')
          .select('id, name')
          .in('id', deptIds as string[]);
        (depts || []).forEach((d: any) => deptNameById.set(d.id, d.name));
      }

      const mapped = (workers || []).map((w: any) => {
        // Handle department relation - can be object or array depending on Supabase
        let deptName: string | null = null;
        if (w.departments) {
          if (Array.isArray(w.departments) && w.departments.length > 0) {
            deptName = w.departments[0]?.name || null;
          } else if (typeof w.departments === 'object') {
            deptName = w.departments.name || null;
          }
        }

        if (!deptName && w.department_id) {
          deptName = deptNameById.get(w.department_id) || null;
        }

        return {
          id: w.id,
          name: w.name,
          worker_number: w.worker_number,
          worker_code: w.worker_code || null,
          email: w.email || null,
          work_group_id: w.work_group_id || null,
          worker_team_id: w.worker_team_id || null,
          department_id: w.department_id,
          department_name: deptName,
        };
      });

      console.log(`Found ${mapped.length} workers`);

      return new Response(
        JSON.stringify({ success: true, workers: mapped }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

     // =====================================================
     // Search workers by query (for autocomplete)
     // =====================================================
     if (action === 'searchWorkers') {
       const q = String(data?.query || '').trim();
       const limit = Math.min(Number(data?.limit || 50) || 50, 200);
       const departmentId = data?.departmentId ? String(data.departmentId) : null;

       if (!q) {
         return new Response(
           JSON.stringify({ success: true, workers: [] }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }

        console.log(`[searchWorkers] query="${q}" limit=${limit} dept=${departmentId ?? 'all'}`);

       // Accent-insensitive search: rely on ILIKE (best effort) + client-side normalization.
       // Keep query simple and safe.
       let query = supabase
         .from('workers')
         .select('id, name, worker_number, department_id, departments:department_id(name)')
         .is('deleted_at', null);

       if (departmentId) {
         query = query.eq('department_id', departmentId);
       }

       // Name match OR number match
       query = query
         .or(`name.ilike.%${q}%,worker_number.ilike.%${q}%`)
         .order('name')
         .limit(limit);

        const { data: workers, error: workersError } = await query;

        // Debug: confirm query shape (helps diagnose missing department fields)
        if (workers && workers.length > 0) {
          console.log('[searchWorkers] sample keys:', Object.keys(workers[0] as any));
        }

       if (workersError) {
         console.error('Error searching workers:', workersError);
         return new Response(
           JSON.stringify({ success: false, error: 'Error al buscar trabajadores' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }

        // Fallback: resolve departments in one query to ensure department_name is always present
        const deptIds = Array.from(
          new Set((workers || []).map((w: any) => w.department_id).filter(Boolean))
        );

        const deptNameById = new Map<string, string>();
        if (deptIds.length > 0) {
          const { data: depts } = await supabase
            .from('departments')
            .select('id, name')
            .in('id', deptIds as string[]);
          (depts || []).forEach((d: any) => deptNameById.set(d.id, d.name));
        }

        const mapped = (workers || []).map((w: any) => {
          // Handle department relation - can be object or array depending on Supabase
          let deptName: string | null = null;
          if (w.departments) {
            if (Array.isArray(w.departments) && w.departments.length > 0) {
              deptName = w.departments[0]?.name || null;
            } else if (typeof w.departments === 'object') {
              deptName = w.departments.name || null;
            }
          }

          if (!deptName && w.department_id) {
            deptName = deptNameById.get(w.department_id) || null;
          }

          return {
            id: w.id,
            name: w.name,
            worker_number: w.worker_number,
            department_id: w.department_id,
            department_name: deptName,
          };
        });

       return new Response(
         JSON.stringify({ success: true, workers: mapped }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }

     // =====================================================
     // Personal Annual Calendars - Get all
     // =====================================================
     if (action === 'getPersonalAnnualCalendars') {
       console.log('Fetching personal annual calendars');
       
       const { data: calendars, error } = await supabase
         .from('personal_annual_calendars')
         .select('*')
         .order('year', { ascending: false })
         .order('name');
 
       if (error) {
         console.error('Error fetching personal annual calendars:', error);
         return new Response(
           JSON.stringify({ success: false, error: error.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }
 
       return new Response(
         JSON.stringify({ success: true, calendars: calendars || [] }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // =====================================================
     // Personal Annual Calendars - Get details (workers + groups)
     // =====================================================
     if (action === 'getPersonalAnnualCalendarDetails') {
       const { calendarId } = data || {};
       if (!calendarId) {
         return new Response(
           JSON.stringify({ success: false, error: 'Calendar ID required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       // Get calendar
       const { data: calendar, error: calError } = await supabase
         .from('personal_annual_calendars')
         .select('*')
         .eq('id', calendarId)
         .single();
 
       if (calError || !calendar) {
         return new Response(
           JSON.stringify({ success: false, error: 'Calendar not found' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
         );
       }
 
       // Get workers assigned to this calendar
       const { data: workers } = await supabase
         .from('personal_annual_calendar_workers')
         .select('*')
         .eq('personal_calendar_id', calendarId)
         .order('sort_order');
 
       // Get work groups from the source department (for mapping)
       const { data: workGroups } = await supabase
         .from('work_groups')
         .select('id, name, color')
         .eq('department_id', calendar.department_id)
         .order('sort_order');
 
       return new Response(
         JSON.stringify({ 
           success: true, 
           calendar,
           workers: workers || [],
           workGroups: workGroups || []
         }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // =====================================================
     // Personal Annual Calendars - Create
     // =====================================================
     if (action === 'createPersonalAnnualCalendar') {
       if (!isAdmin) {
         return new Response(
           JSON.stringify({ success: false, error: 'Admin required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
         );
       }
 
       const { departmentId, name, year } = data || {};
       if (!departmentId || !name || !year) {
         return new Response(
           JSON.stringify({ success: false, error: 'Department, name, and year required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       // Find the source annual calendar for this department/year
       const { data: sourceCalendar } = await supabase
         .from('annual_calendars')
         .select('id')
         .eq('department_id', departmentId)
         .eq('year', year)
         .single();
 
       const { data: calendar, error } = await supabase
         .from('personal_annual_calendars')
         .insert({
           department_id: departmentId,
           name,
           year,
           source_calendar_id: sourceCalendar?.id || null
         })
         .select()
         .single();
 
       if (error) {
         console.error('Error creating personal annual calendar:', error);
         return new Response(
           JSON.stringify({ success: false, error: error.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }
 
       console.log(`Created personal annual calendar: ${calendar.id}`);
       return new Response(
         JSON.stringify({ success: true, calendar }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // =====================================================
     // Personal Annual Calendars - Delete
     // =====================================================
     if (action === 'deletePersonalAnnualCalendar') {
       if (!isAdmin) {
         return new Response(
           JSON.stringify({ success: false, error: 'Admin required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
         );
       }
 
       const { calendarId } = data || {};
       if (!calendarId) {
         return new Response(
           JSON.stringify({ success: false, error: 'Calendar ID required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       const { error } = await supabase
         .from('personal_annual_calendars')
         .delete()
         .eq('id', calendarId);
 
       if (error) {
         console.error('Error deleting personal annual calendar:', error);
         return new Response(
           JSON.stringify({ success: false, error: error.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }
 
       console.log(`Deleted personal annual calendar: ${calendarId}`);
       return new Response(
         JSON.stringify({ success: true }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
      }

      // =====================================================
      // Personal Annual Calendars - Rename
      // =====================================================
      if (action === 'renamePersonalAnnualCalendar') {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: 'Admin required' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
          );
        }

        const { calendarId, name } = data || {};
        if (!calendarId || !name?.trim()) {
          return new Response(
            JSON.stringify({ success: false, error: 'Calendar ID and name required' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        const { error } = await supabase
          .from('personal_annual_calendars')
          .update({ name: name.trim(), updated_at: new Date().toISOString() })
          .eq('id', calendarId);

        if (error) {
          console.error('Error renaming personal annual calendar:', error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        console.log(`Renamed personal annual calendar: ${calendarId} -> ${name.trim()}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Personal Annual Calendars - Add worker
      // =====================================================
      if (action === 'addPersonalAnnualCalendarWorker') {
        if (!isAdmin) {
         return new Response(
           JSON.stringify({ success: false, error: 'Admin required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
         );
       }
 
       const { calendarId, workerId, workerName, workerNumber, sourceGroupId, color } = data || {};
       if (!calendarId || !workerName || !workerNumber) {
         return new Response(
           JSON.stringify({ success: false, error: 'Calendar ID and worker info required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       // Get next sort order
       const { data: existingWorkers } = await supabase
         .from('personal_annual_calendar_workers')
         .select('sort_order')
         .eq('personal_calendar_id', calendarId)
         .order('sort_order', { ascending: false })
         .limit(1);
 
       const nextOrder = existingWorkers && existingWorkers.length > 0 
         ? (existingWorkers[0] as any).sort_order + 1 
         : 0;
 
       const { data: worker, error } = await supabase
         .from('personal_annual_calendar_workers')
         .insert({
           personal_calendar_id: calendarId,
           worker_id: workerId || null,
           worker_name: workerName,
           worker_number: workerNumber,
           source_group_id: sourceGroupId || null,
           color: color || '#3b82f6',
           sort_order: nextOrder
         })
         .select()
         .single();

       if (error) {
         console.error('Error adding worker to personal calendar:', error);
         return new Response(
           JSON.stringify({ success: false, error: error.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }

       // Auto-mark vacation days from inherited group
       if (sourceGroupId && worker) {
         try {
           // Get source calendar from personal annual calendar
           const { data: personalCal } = await supabase
             .from('personal_annual_calendars')
             .select('source_calendar_id')
             .eq('id', calendarId)
             .single();

           if (personalCal?.source_calendar_id) {
             // Get vacation days for this group from the annual calendar
             const { data: groupVacationDays } = await supabase
               .from('annual_calendar_days')
               .select('date')
               .eq('calendar_id', personalCal.source_calendar_id)
               .eq('day_type', 'vacaciones_grupo')
               .or(`group_id.eq.${sourceGroupId},group_id_2.eq.${sourceGroupId}`);

             if (groupVacationDays && groupVacationDays.length > 0) {
               const daysToInsert = groupVacationDays.map((d: any) => ({
                 personal_calendar_id: calendarId,
                 personal_calendar_worker_id: worker.id,
                 date: d.date,
               }));

               const { error: insertDaysError } = await supabase
                 .from('personal_annual_calendar_days')
                 .insert(daysToInsert);

               if (insertDaysError) {
                 console.error('Error auto-marking vacation days:', insertDaysError);
               } else {
                 console.log(`Auto-marked ${daysToInsert.length} vacation days for worker ${worker.id} from group ${sourceGroupId}`);
               }
             }
           }
         } catch (autoMarkErr) {
           console.error('Failed to auto-mark vacation days:', autoMarkErr);
         }
       }

       console.log(`Added worker to personal annual calendar: ${worker.id}`);
       return new Response(
         JSON.stringify({ success: true, worker }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // =====================================================
     // Personal Annual Calendars - Remove worker
     // =====================================================
     if (action === 'removePersonalAnnualCalendarWorker') {
       if (!isAdmin) {
         return new Response(
           JSON.stringify({ success: false, error: 'Admin required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
         );
       }
 
       const { workerId } = data || {};
       if (!workerId) {
         return new Response(
           JSON.stringify({ success: false, error: 'Worker ID required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       const { error } = await supabase
         .from('personal_annual_calendar_workers')
         .delete()
         .eq('id', workerId);
 
       if (error) {
         console.error('Error removing worker from personal calendar:', error);
         return new Response(
           JSON.stringify({ success: false, error: error.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }
 
       console.log(`Removed worker from personal annual calendar: ${workerId}`);
       return new Response(
         JSON.stringify({ success: true }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // =====================================================
     // Personal Annual Calendars - Update worker (color, group)
     // =====================================================
     if (action === 'updatePersonalAnnualCalendarWorker') {
       if (!isAdmin) {
         return new Response(
           JSON.stringify({ success: false, error: 'Admin required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
         );
       }
 
       const { workerId, color, sourceGroupId } = data || {};
       if (!workerId) {
         return new Response(
           JSON.stringify({ success: false, error: 'Worker ID required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       // Get current worker info before update
       const { data: currentWorker } = await supabase
         .from('personal_annual_calendar_workers')
         .select('id, personal_calendar_id, source_group_id')
         .eq('id', workerId)
         .single();

       const updateData: any = {};
       if (color !== undefined) updateData.color = color;
       if (sourceGroupId !== undefined) updateData.source_group_id = sourceGroupId || null;

       const { error } = await supabase
         .from('personal_annual_calendar_workers')
         .update(updateData)
         .eq('id', workerId);

       if (error) {
         console.error('Error updating personal calendar worker:', error);
         return new Response(
           JSON.stringify({ success: false, error: error.message }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
         );
       }

       // If group changed, update vacation days from the new group
       if (sourceGroupId !== undefined && currentWorker && sourceGroupId !== currentWorker.source_group_id) {
         try {
           const calendarId = currentWorker.personal_calendar_id;

           // Get source calendar
           const { data: personalCal } = await supabase
             .from('personal_annual_calendars')
             .select('source_calendar_id')
             .eq('id', calendarId)
             .single();

           // Remove existing auto-marked days for this worker
           await supabase
             .from('personal_annual_calendar_days')
             .delete()
             .eq('personal_calendar_worker_id', workerId);

           // If new group assigned, add its vacation days
           if (sourceGroupId && personalCal?.source_calendar_id) {
             const { data: groupVacationDays } = await supabase
               .from('annual_calendar_days')
               .select('date')
               .eq('calendar_id', personalCal.source_calendar_id)
               .eq('day_type', 'vacaciones_grupo')
               .or(`group_id.eq.${sourceGroupId},group_id_2.eq.${sourceGroupId}`);

             if (groupVacationDays && groupVacationDays.length > 0) {
               const daysToInsert = groupVacationDays.map((d: any) => ({
                 personal_calendar_id: calendarId,
                 personal_calendar_worker_id: workerId,
                 date: d.date,
               }));

               await supabase
                 .from('personal_annual_calendar_days')
                 .insert(daysToInsert);

               console.log(`Updated ${daysToInsert.length} vacation days for worker ${workerId} from new group ${sourceGroupId}`);
             }
           }
         } catch (syncErr) {
           console.error('Failed to sync vacation days on group change:', syncErr);
         }
       }

       console.log(`Updated personal annual calendar worker: ${workerId}`);
       return new Response(
         JSON.stringify({ success: true }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
    }

    // =====================================================
    // Personal Annual Calendars - Get full data for calendar UI
    // =====================================================
    if (action === 'getPersonalAnnualCalendarFullData') {
      const { calendarId, departmentId } = data || {};
      if (!calendarId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Calendar ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get calendar to find source_calendar_id
      const { data: calendar } = await supabase
        .from('personal_annual_calendars')
        .select('source_calendar_id, department_id')
        .eq('id', calendarId)
        .single();

      // Get calendar days from source calendar
      const { data: calendarDays } = await supabase
        .from('annual_calendar_days')
        .select('*')
        .eq('calendar_id', calendar?.source_calendar_id || '');

      // Get custom day types
      const { data: customDayTypes } = await supabase
        .from('custom_day_types')
        .select('id, name, color, system_type')
        .eq('department_id', calendar?.department_id || departmentId);

      // Get personal calendar days (individual worker vacations)
      const { data: personalDays } = await supabase
        .from('personal_annual_calendar_days')
        .select('*')
        .eq('personal_calendar_id', calendarId);

      return new Response(
        JSON.stringify({
          success: true,
          calendarDays: calendarDays || [],
          customDayTypes: customDayTypes || [],
          personalDays: personalDays || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Personal Annual Calendars - Add day for worker
    // =====================================================
    if (action === 'addPersonalCalendarDay') {
      const { calendarId, workerId, date } = data || {};
      if (!calendarId || !workerId || !date) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing required fields' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: day, error } = await supabase
        .from('personal_annual_calendar_days')
        .insert({
          personal_calendar_id: calendarId,
          personal_calendar_worker_id: workerId,
          date
        })
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Keep worker personal calendar synchronized (this calendar prevails).
      // We maintain one modification per personal annual calendar worker per year.
      try {
        const { data: cal } = await supabase
          .from('personal_annual_calendars')
          .select('id, year, department_id')
          .eq('id', calendarId)
          .single();

        const { data: paw } = await supabase
          .from('personal_annual_calendar_workers')
          .select('id, worker_id')
          .eq('id', workerId)
          .single();

        const realWorkerId = paw?.worker_id;
        if (cal?.year && cal?.department_id && realWorkerId) {
          const adminReason = `SYNC_PERSONAL_ANNUAL:${calendarId}:${workerId}`;

          // Find or create the sync modification
          const { data: existingMod } = await supabase
            .from('worker_calendar_modifications')
            .select('id, added_personal_days')
            .eq('worker_id', realWorkerId)
            .eq('department_id', cal.department_id)
            .eq('year', cal.year)
            .eq('modification_type', 'personal_annual_sync')
            .eq('admin_reason', adminReason)
            .maybeSingle();

          const currentAdded = Array.isArray(existingMod?.added_personal_days)
            ? (existingMod?.added_personal_days as any[])
            : [];

          const nextAdded = currentAdded.some((d: any) => (typeof d === 'string' ? d : d?.date) === date)
            ? currentAdded
            : [...currentAdded, { date, assignmentType: 'free_assignment', halfDay: false }];

          let modificationId = existingMod?.id as string | undefined;

          if (!modificationId) {
            const { data: createdMod, error: createModError } = await supabase
              .from('worker_calendar_modifications')
              .insert({
                worker_id: realWorkerId,
                department_id: cal.department_id,
                modification_type: 'personal_annual_sync',
                removed_group_days: [],
                added_personal_days: nextAdded,
                original_group_id: null,
                new_group_id: null,
                admin_reason: adminReason,
                admin_name: manager.name,
                status: 'signed',
                access_token: crypto.randomUUID(),
                year: cal.year,
              })
              .select('id')
              .single();

            if (!createModError) modificationId = createdMod?.id;
          } else {
            await supabase
              .from('worker_calendar_modifications')
              .update({
                added_personal_days: nextAdded,
                status: 'signed',
              })
              .eq('id', modificationId);
          }

          if (modificationId) {
            // Rebuild worker_personal_calendar_days for this modification (idempotent)
            await supabase
              .from('worker_personal_calendar_days')
              .delete()
              .eq('modification_id', modificationId);

            const toInsert = (nextAdded || []).map((ad: any) => ({
              worker_id: realWorkerId,
              department_id: cal.department_id,
              modification_id: modificationId,
              date: typeof ad === 'string' ? ad : ad.date,
              day_type: (typeof ad === 'object' && ad && 'assignmentType' in ad) ? ad.assignmentType : 'free_assignment',
              half_day: (typeof ad === 'object' && ad && 'halfDay' in ad) ? !!ad.halfDay : false,
              year: cal.year,
            }));
            if (toInsert.length > 0) {
              await supabase.from('worker_personal_calendar_days').insert(toInsert);
            }
          }
        }
      } catch (syncErr) {
        console.error('Failed to sync worker personal calendar from personal annual:', syncErr);
      }

      return new Response(
        JSON.stringify({ success: true, day }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Personal Annual Calendars - Remove day
    // =====================================================
    if (action === 'removePersonalCalendarDay') {
      const { dayId } = data || {};
      if (!dayId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Day ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Load row for synchronization before deleting
      const { data: existingDay } = await supabase
        .from('personal_annual_calendar_days')
        .select('id, personal_calendar_id, personal_calendar_worker_id, date')
        .eq('id', dayId)
        .single();

      await supabase
        .from('personal_annual_calendar_days')
        .delete()
        .eq('id', dayId);

      // Keep worker personal calendar synchronized
      try {
        if (existingDay?.personal_calendar_id && existingDay?.personal_calendar_worker_id && existingDay?.date) {
          const { data: cal } = await supabase
            .from('personal_annual_calendars')
            .select('id, year, department_id')
            .eq('id', existingDay.personal_calendar_id)
            .single();

          const { data: paw } = await supabase
            .from('personal_annual_calendar_workers')
            .select('id, worker_id')
            .eq('id', existingDay.personal_calendar_worker_id)
            .single();

          const realWorkerId = paw?.worker_id;
          if (cal?.year && cal?.department_id && realWorkerId) {
            const adminReason = `SYNC_PERSONAL_ANNUAL:${existingDay.personal_calendar_id}:${existingDay.personal_calendar_worker_id}`;

            const { data: mod } = await supabase
              .from('worker_calendar_modifications')
              .select('id, added_personal_days')
              .eq('worker_id', realWorkerId)
              .eq('department_id', cal.department_id)
              .eq('year', cal.year)
              .eq('modification_type', 'personal_annual_sync')
              .eq('admin_reason', adminReason)
              .maybeSingle();

            if (mod?.id) {
              const currentAdded = Array.isArray(mod.added_personal_days) ? (mod.added_personal_days as any[]) : [];
              const nextAdded = currentAdded.filter((d: any) => (typeof d === 'string' ? d : d?.date) !== existingDay.date);

              await supabase
                .from('worker_calendar_modifications')
                .update({ added_personal_days: nextAdded, status: 'signed' })
                .eq('id', mod.id);

              // Rebuild worker_personal_calendar_days for this modification
              await supabase
                .from('worker_personal_calendar_days')
                .delete()
                .eq('modification_id', mod.id);

              const toInsert = (nextAdded || []).map((ad: any) => ({
                worker_id: realWorkerId,
                department_id: cal.department_id,
                modification_id: mod.id,
                date: typeof ad === 'string' ? ad : ad.date,
                day_type: (typeof ad === 'object' && ad && 'assignmentType' in ad) ? ad.assignmentType : 'free_assignment',
                half_day: (typeof ad === 'object' && ad && 'halfDay' in ad) ? !!ad.halfDay : false,
                year: cal.year,
              }));
              if (toInsert.length > 0) {
                await supabase.from('worker_personal_calendar_days').insert(toInsert);
              }
            }
          }
        }
      } catch (syncErr) {
        console.error('Failed to sync worker personal calendar from personal annual (remove):', syncErr);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Personal Annual Calendars - Generate PDF
    // =====================================================
    if (action === 'generatePersonalAnnualCalendarPDF') {
       const { calendarId, lightMode = true } = data || {};
       if (!calendarId) {
         return new Response(
           JSON.stringify({ success: false, error: 'Calendar ID required' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }
 
       // Get calendar
       const { data: calendar, error: calError } = await supabase
         .from('personal_annual_calendars')
         .select('*')
         .eq('id', calendarId)
         .single();
 
       if (calError || !calendar) {
         return new Response(
           JSON.stringify({ success: false, error: 'Calendar not found' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
         );
       }

       // Get department name
       const { data: dept } = await supabase
         .from('departments')
         .select('name')
         .eq('id', calendar.department_id)
         .single();

       // Get workers
       const { data: workers } = await supabase
         .from('personal_annual_calendar_workers')
         .select('*')
         .eq('personal_calendar_id', calendarId)
         .order('sort_order');

       if (!workers || workers.length === 0) {
         return new Response(
           JSON.stringify({ success: false, error: 'No workers assigned to this calendar' }),
           { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
         );
       }

       // Get calendar days from source calendar
       const { data: calendarDays } = await supabase
         .from('annual_calendar_days')
         .select('*')
         .eq('calendar_id', calendar.source_calendar_id);

       // Get personal vacation days
       const { data: personalDays } = await supabase
         .from('personal_annual_calendar_days')
         .select('*')
         .eq('personal_calendar_id', calendarId);

       // Get custom day types
       const { data: customTypes } = await supabase
         .from('custom_day_types')
         .select('*')
         .eq('department_id', calendar.department_id)
         .order('sort_order');

       // Build maps
       const customTypeMap = new Map((customTypes || []).map((t: any) => [t.id, t]));
       const workerMap = new Map((workers || []).map((w: any) => [w.id, w]));
       
       // Build personal days lookup: date -> worker_ids with vacation
       const personalDaysLookup = new Map<string, string[]>();
       for (const pd of (personalDays || [])) {
         const existing = personalDaysLookup.get(pd.date) || [];
         existing.push(pd.personal_calendar_worker_id);
         personalDaysLookup.set(pd.date, existing);
       }

       const year = calendar.year;
       const departmentName = dept?.name || 'Departamento';
       const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                         "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

       const getDayInfo = (dateStr: string) => calendarDays?.find((d: any) => d.date === dateStr);

       // Build months HTML - identical structure to department calendar
       let monthsHtml = '';
       for (let month = 0; month < 12; month++) {
         const daysInMonth = new Date(year, month + 1, 0).getDate();
         const firstDayOfWeek = new Date(year, month, 1).getDay();
         const adjustedFirstDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
         
         let weeksHtml = '';
         let dayCount = 1;
         
         for (let week = 0; week < 6; week++) {
           if (dayCount > daysInMonth) break;
           
           let daysHtml = '';
           for (let dow = 0; dow < 7; dow++) {
             if ((week === 0 && dow < adjustedFirstDay) || dayCount > daysInMonth) {
               daysHtml += '<td><span class="empty"></span></td>';
             } else {
               const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${dayCount.toString().padStart(2, '0')}`;
               const dayInfo = getDayInfo(dateStr);
               const isWeekend = dow === 5 || dow === 6;
               
               // Get workers with personal vacation on this day
               const workerIdsWithVacation = personalDaysLookup.get(dateStr) || [];
               const workersWithVacation = workerIdsWithVacation.map(id => workerMap.get(id)).filter(Boolean);
               
               let spanClass = 'day';
               let spanStyle = '';
               
               if (dayInfo) {
                 switch (dayInfo.day_type) {
                   case 'festivo':
                     if (dayInfo.custom_day_type_id) {
                       const customType = customTypeMap.get(dayInfo.custom_day_type_id);
                       if (customType) {
                         spanClass = 'day custom';
                         spanStyle = `background:${customType.color};`;
                       } else {
                         spanClass = 'day festivo';
                       }
                     } else {
                       spanClass = 'day festivo';
                     }
                     break;
                   case 'vacaciones_generales':
                     spanClass = 'day vac-gen';
                     break;
                   default:
                     // Check for personal vacation days
                     if (workersWithVacation.length > 0) {
                       spanClass = 'day vac-grp';
                       if (workersWithVacation.length === 1) {
                         spanStyle = `background:${workersWithVacation[0].color};`;
                       } else if (workersWithVacation.length === 2) {
                         spanStyle = `background:linear-gradient(90deg,${workersWithVacation[0].color} 50%,${workersWithVacation[1].color} 50%);`;
                       } else {
                         // Multiple workers - gradient of first 2
                         spanStyle = `background:linear-gradient(90deg,${workersWithVacation[0].color} 50%,${workersWithVacation[1].color} 50%);`;
                       }
                     } else if (isWeekend) {
                       spanClass = 'day we';
                     }
                     break;
                 }
               } else {
                 // No dayInfo from source calendar, check personal days
                 if (workersWithVacation.length > 0) {
                   spanClass = 'day vac-grp';
                   if (workersWithVacation.length === 1) {
                     spanStyle = `background:${workersWithVacation[0].color};`;
                   } else if (workersWithVacation.length === 2) {
                     spanStyle = `background:linear-gradient(90deg,${workersWithVacation[0].color} 50%,${workersWithVacation[1].color} 50%);`;
                   } else {
                     spanStyle = `background:linear-gradient(90deg,${workersWithVacation[0].color} 50%,${workersWithVacation[1].color} 50%);`;
                   }
                 } else if (isWeekend) {
                   spanClass = 'day we';
                 }
               }
               
               const styleAttr = spanStyle ? ` style="${spanStyle}"` : '';
               daysHtml += `<td><span class="${spanClass}"${styleAttr}>${dayCount}</span></td>`;
               dayCount++;
             }
           }
           weeksHtml += `<tr>${daysHtml}</tr>`;
         }
         
         monthsHtml += `<div class="month"><div class="month-name">${monthNames[month]}</div><table><thead><tr><th>L</th><th>M</th><th>X</th><th>J</th><th>V</th><th>S</th><th>D</th></tr></thead><tbody>${weeksHtml}</tbody></table></div>`;
       }

       // Build festivos list
       const festivos = (calendarDays || [])
         .filter((d: any) => d.day_type === 'festivo' && d.legend)
         .sort((a: any, b: any) => a.date.localeCompare(b.date));

       let festivosHtml = festivos.map((d: any) => {
         const dateObj = new Date(d.date + 'T12:00:00');
         const dayNum = dateObj.getDate();
         const monthNum = dateObj.getMonth() + 1;
         return `<div class="festivo-item"><span class="festivo-date">${dayNum}/${monthNum}</span><span class="festivo-name">${d.legend}</span></div>`;
       }).join('');

       // Build base legend
       let baseLegendHtml = `
         <div class="legend-item"><span class="legend-circle" style="background:#93d600"></span><span>Vacaciones Generales</span></div>
         <div class="legend-item"><span class="legend-circle" style="background:#dc2626"></span><span>Festivo</span></div>
         <div class="legend-item"><span class="legend-circle" style="background:${lightMode ? '#d4d4d4' : '#333'}"></span><span>Fin de semana</span></div>
       `;

       // Custom day types legend
       let customTypesLegendHtml = '';
       if (customTypes && customTypes.length > 0) {
         customTypesLegendHtml = customTypes.map((t: any) => 
           `<div class="legend-item"><span class="legend-circle" style="background:${t.color}"></span><span>${t.name}</span></div>`
         ).join('');
       }

       // Workers legend (replaces groups legend)
       let workersLegendHtml = '';
       if (workers && workers.length > 0) {
         workersLegendHtml = workers.map((w: any) => 
           `<div class="legend-item"><span class="legend-circle" style="background:${w.color}"></span><span>${w.worker_name}</span></div>`
         ).join('');
       }

       // Manager name and date
       const managerName = manager?.name || "Usuario";
       const now = new Date();
       const dayNum = now.getDate();
       const monthNameSpanish = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][now.getMonth()];
       const yearNum = now.getFullYear();

       // Theme-specific styles (identical to department calendar)
       const themeStyles = lightMode ? `
html,body{height:100%;background:#ffffff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
body{font-family:'Poppins',sans-serif;color:#171717;padding:10mm;font-size:11px}

.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;margin-bottom:20px;border-bottom:1px solid rgba(147,214,0,0.4)}
.header-left{display:flex;align-items:center;gap:16px}
.logo{height:44px;width:auto}
.year{font-size:52px;font-weight:200;color:#93d600;letter-spacing:-2px;line-height:1}
.header-right{text-align:right}
.dept-name{font-size:26px;font-weight:500;color:#171717}
.dept-sub{font-size:12px;color:#737373;font-weight:400;margin-top:4px}

.calendar-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px}
.month{background:#fafafa;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden}
.month-name{background:#f5f5f5;color:#93d600;text-align:center;padding:10px;font-weight:500;font-size:13px;letter-spacing:0.3px}
table{width:100%;border-collapse:collapse;padding:8px}
thead th{color:#737373;font-size:10px;font-weight:400;padding:8px 0 6px;text-align:center}
tbody td{text-align:center;vertical-align:middle;padding:3px}
.day{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;font-size:11px;font-weight:400;color:#262626}
.day.we{color:#a3a3a3}
.day.festivo{background:#dc2626!important;color:#fff!important;font-weight:500}
.day.vac-gen{background:#93d600!important;color:#0a0a0a!important;font-weight:500}
.day.vac-grp{color:#fff!important;font-weight:500}
.day.custom{color:#fff!important;font-weight:500}
.empty{width:28px;height:28px;display:inline-block}

.bottom-section{display:flex;gap:16px;flex-wrap:wrap}
.panel{background:#fafafa;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;flex:1;min-width:180px}
.panel-header{padding:12px 16px;font-weight:500;font-size:12px;background:#f5f5f5;color:#404040;letter-spacing:0.3px}
.panel-content{padding:14px 16px}
.legend-item{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:11px;color:#404040}
.legend-circle{width:16px;height:16px;border-radius:50%;flex-shrink:0}
.festivo-item{display:flex;gap:10px;padding:6px 0;font-size:11px;border-bottom:1px solid #e5e5e5}
.festivo-item:last-child{border:none}
.festivo-date{color:#dc2626;font-weight:500;min-width:40px}
.festivo-name{color:#525252;font-weight:400}
.notes-text{color:#525252;font-weight:400;font-size:11px;line-height:1.6}

.footer{margin-top:16px;text-align:center;color:#737373;font-size:10px;font-weight:400}

@media print{
  html,body{background:#ffffff!important}
  .panel,.month{break-inside:avoid}
}
` : `
html,body{height:100%;background:#0a0a0a!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
body{font-family:'Poppins',sans-serif;color:#fafafa;padding:10mm;font-size:11px}

.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;margin-bottom:20px;border-bottom:1px solid rgba(147,214,0,0.25)}
.header-left{display:flex;align-items:center;gap:16px}
.logo{height:44px;width:auto}
.year{font-size:52px;font-weight:200;color:#93d600;letter-spacing:-2px;line-height:1}
.header-right{text-align:right}
.dept-name{font-size:26px;font-weight:500;color:#fafafa}
.dept-sub{font-size:12px;color:#71717a;font-weight:400;margin-top:4px}

.calendar-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px}
.month{background:#111;border:1px solid #262626;border-radius:12px;overflow:hidden}
.month-name{background:#161616;color:#93d600;text-align:center;padding:10px;font-weight:500;font-size:13px;letter-spacing:0.3px}
table{width:100%;border-collapse:collapse;padding:8px}
thead th{color:#525252;font-size:10px;font-weight:400;padding:8px 0 6px;text-align:center}
tbody td{text-align:center;vertical-align:middle;padding:3px}
.day{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;font-size:11px;font-weight:400;color:#e5e5e5}
.day.we{color:#404040}
.day.festivo{background:#dc2626!important;color:#fff!important;font-weight:500}
.day.vac-gen{background:#93d600!important;color:#0a0a0a!important;font-weight:500}
.day.vac-grp{color:#fff!important;font-weight:500}
.day.custom{color:#fff!important;font-weight:500}
.empty{width:28px;height:28px;display:inline-block}

.bottom-section{display:flex;gap:16px;flex-wrap:wrap}
.panel{background:#111;border:1px solid #262626;border-radius:12px;overflow:hidden;flex:1;min-width:180px}
.panel-header{padding:12px 16px;font-weight:500;font-size:12px;background:#161616;color:#d4d4d4;letter-spacing:0.3px}
.panel-content{padding:14px 16px}
.legend-item{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:11px;color:#d4d4d8}
.legend-circle{width:16px;height:16px;border-radius:50%;flex-shrink:0}
.festivo-item{display:flex;gap:10px;padding:6px 0;font-size:11px;border-bottom:1px solid #262626}
.festivo-item:last-child{border:none}
.festivo-date{color:#ef4444;font-weight:500;min-width:40px}
.festivo-name{color:#a1a1aa;font-weight:400}
.notes-text{color:#a1a1aa;font-weight:400;font-size:11px;line-height:1.6}

.footer{margin-top:16px;text-align:center;color:#525252;font-size:10px;font-weight:400}

@media print{
  html,body{background:#0a0a0a!important}
  .panel,.month{break-inside:avoid}
}
`;

       const logoUrl = "https://vnprod.app/images/verdnatura-logo-green.png";

       // Build bottom section with panels
       let bottomPanels = '';
       
       // Standard legend panel
       bottomPanels += `<div class="panel"><div class="panel-header">Leyenda</div><div class="panel-content">${baseLegendHtml}${customTypesLegendHtml}</div></div>`;
       
       // Workers panel (replaces "Grupos Vacacionales")
       if (workers && workers.length > 0) {
         bottomPanels += `<div class="panel"><div class="panel-header">Trabajadores</div><div class="panel-content">${workersLegendHtml}</div></div>`;
       }
       
       // Festivos panel
       if (festivos.length > 0) {
         bottomPanels += `<div class="panel"><div class="panel-header">Festivos</div><div class="panel-content">${festivosHtml}</div></div>`;
       }

       // A3 PORTRAIT format - identical to department calendar
       const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${calendar.name} - ${year}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@200;300;400;500;600&display=swap" rel="stylesheet">
<style>
@page{size:A3 portrait;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
${themeStyles}
</style>
</head>
<body>
<div class="header">
<div class="header-left">
<img src="${logoUrl}" alt="Verdnatura" class="logo" onerror="this.style.display='none'"/>
<div class="year">${year}</div>
</div>
<div class="header-right">
<div class="dept-name">${calendar.name}</div>
<div class="dept-sub">${departmentName} • Calendario Personalizado</div>
</div>
</div>

<div class="calendar-grid">${monthsHtml}</div>

<div class="bottom-section">
${bottomPanels}
</div>

<div class="footer">Generado el ${dayNum} de ${monthNameSpanish} de ${yearNum} por ${managerName} | Verdnatura</div>
</body>
</html>`;

       console.log(`Generated PDF for personal annual calendar: ${calendarId}`);
       return new Response(
         JSON.stringify({ success: true, html }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } }
       );
     }
 
    // ===== WORKFORCE FOR DAY (Plantilla del día) =====
    if (action === 'getWorkforceForDay') {
      let { date, departmentIds, workerTeamIds } = data || {};

      // For non-admin managers, filter departmentIds to only their assigned departments
      // (skip for responsables who use workerTeamIds)
      if (!isAdmin && !(workerTeamIds && workerTeamIds.length > 0)) {
        const { data: managerDepts } = await supabase
          .from('manager_department_assignments')
          .select('department_id')
          .eq('manager_id', manager.id);
        
        const assignedIds = (managerDepts || []).map((d: any) => d.department_id);
        departmentIds = (departmentIds || []).filter((id: string) => assignedIds.includes(id));
      }
      if (!date || !departmentIds || !Array.isArray(departmentIds) || departmentIds.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'date y departmentIds son obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // If workerTeamIds provided (responsable), we'll filter workers to only those teams
      const filterByTeamIds = Array.isArray(workerTeamIds) && workerTeamIds.length > 0 ? workerTeamIds : null;

      console.log(`getWorkforceForDay: date=${date}, departments=${departmentIds.length}, workerTeamIds=${filterByTeamIds?.length || 0}`);

      // Calculate ISO week and year for the date
      const targetDate = new Date(date + 'T12:00:00Z');
      const getISOWeekAndYear = (d: Date): { week: number; year: number } => {
        const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        return { week: weekNo, year: tmp.getUTCFullYear() };
      };

      const { week: isoWeek, year: isoYear } = getISOWeekAndYear(targetDate);
      
      // Day of week index (Sunday=0 convention used in schedules)
      const jsDow = targetDate.getUTCDay(); // 0=Sun, 1=Mon, ...
      const dayKey = String(jsDow);

      console.log(`ISO week=${isoWeek}, year=${isoYear}, dayKey=${dayKey} (${jsDow})`);

      const results: any[] = [];

      for (const deptId of departmentIds) {
        // 1. Get department name
        const { data: dept } = await supabase
          .from('departments')
          .select('id, name')
          .eq('id', deptId)
          .single();

        if (!dept) continue;

        // 2. Get active workers in this department (optionally filtered by team)
        let workersQuery = supabase
          .from('workers')
          .select('id, name, worker_number, worker_team_id, work_group_id, is_on_leave, is_on_vacation')
          .eq('department_id', deptId)
          .is('deleted_at', null);
        
        if (filterByTeamIds) {
          workersQuery = workersQuery.in('worker_team_id', filterByTeamIds);
        }
        
        const { data: workers } = await workersQuery;

        if (!workers || workers.length === 0) {
          results.push({
            id: deptId,
            name: dept.name,
            teams: [],
            totalWorking: 0,
            totalWorkers: 0,
          });
          continue;
        }

        // 3. Get weekly schedule for this week
        const { data: scheduleRow } = await supabase
          .from('weekly_schedules')
          .select('configuration')
          .eq('department_id', deptId)
          .eq('year', isoYear)
          .eq('week_number', isoWeek)
          .maybeSingle();

        const config = scheduleRow?.configuration as Record<string, Record<string, any>> | null;

        // 4. Get weekly shift configs for shift names
        const { data: shiftConfigs } = await supabase
          .from('weekly_shift_configs')
          .select('shift_key, name, is_rest')
          .eq('department_id', deptId)
          .eq('year', isoYear)
          .eq('week', isoWeek);

        // Fallback to department_shifts if no weekly configs
        let shiftMap: Record<string, { name: string; is_rest: boolean }> = {};
        if (shiftConfigs && shiftConfigs.length > 0) {
          for (const sc of shiftConfigs) {
            shiftMap[sc.shift_key] = { name: sc.name, is_rest: sc.is_rest };
          }
        } else {
          const { data: baseShifts } = await supabase
            .from('department_shifts')
            .select('shift_key, name, is_rest')
            .eq('department_id', deptId);
          for (const bs of (baseShifts || [])) {
            shiftMap[bs.shift_key] = { name: bs.name, is_rest: bs.is_rest };
          }
        }

        // 5. Get annual calendar vacation days for this date
        const { data: calendarData } = await supabase
          .from('annual_calendars')
          .select('id')
          .eq('department_id', deptId)
          .eq('year', targetDate.getUTCFullYear())
          .maybeSingle();

        let vacationGroupIds = new Set<string>();
        if (calendarData?.id) {
          const { data: vacDays } = await supabase
            .from('annual_calendar_days')
            .select('group_id, group_id_2, day_type')
            .eq('calendar_id', calendarData.id)
            .eq('date', date)
            .in('day_type', ['vacaciones_grupo', 'vacaciones_generales']);

          for (const vd of (vacDays || [])) {
            if (vd.day_type === 'vacaciones_generales') {
              // Everyone on vacation
              vacationGroupIds.add('__ALL__');
            }
            if (vd.group_id) vacationGroupIds.add(vd.group_id);
            if (vd.group_id_2) vacationGroupIds.add(vd.group_id_2);
          }
        }

        // 6. Get teams for this department
        const { data: teams } = await supabase
          .from('worker_teams')
          .select('id, name, sort_order')
          .eq('department_id', deptId)
          .order('sort_order', { ascending: true });

        // 7. Get work_group -> team mapping
        const { data: wgData } = await supabase
          .from('work_groups')
          .select('id')
          .eq('department_id', deptId);
        const wgIds = (wgData || []).map(w => w.id);
        let groupTeamMap: Record<string, string[]> = {};
        if (wgIds.length > 0) {
          const { data: gtData } = await supabase
            .from('work_group_teams')
            .select('work_group_id, worker_team_id')
            .in('work_group_id', wgIds);
          for (const gt of (gtData || [])) {
            if (!groupTeamMap[gt.worker_team_id]) groupTeamMap[gt.worker_team_id] = [];
            groupTeamMap[gt.worker_team_id].push(gt.work_group_id);
          }
        }

        // 8. Process each worker
        const teamMap: Record<string, { id: string; name: string; workers: any[]; workingCount: number; totalCount: number }> = {};
        const noTeamKey = '__no_team__';

        for (const t of (teams || [])) {
          teamMap[t.id] = { id: t.id, name: t.name, workers: [], workingCount: 0, totalCount: 0 };
        }
        teamMap[noTeamKey] = { id: noTeamKey, name: 'Sin equipo', workers: [], workingCount: 0, totalCount: 0 };

        for (const w of workers) {
          const teamId = w.worker_team_id || noTeamKey;
          if (!teamMap[teamId]) {
            teamMap[teamId] = { id: teamId, name: teamId, workers: [], workingCount: 0, totalCount: 0 };
          }

          let status = 'working';
          let reason = '';
          let shiftName = '';

          // Check leave
          if (w.is_on_leave) {
            status = 'leave';
            reason = 'Baja';
          }
          // Check vacation flag
          else if (w.is_on_vacation) {
            status = 'vacation';
            reason = 'Vacaciones';
          }
          // Check annual calendar vacation for this worker's group
          else if (vacationGroupIds.has('__ALL__')) {
            status = 'vacation';
            reason = 'Vacaciones generales';
          }
          else if (w.work_group_id && vacationGroupIds.has(w.work_group_id)) {
            status = 'vacation';
            reason = 'Vacaciones grupo';
          }
          // Check schedule - is it a rest day?
          else if (config && config[dayKey] && config[dayKey][teamId]) {
            const cell = config[dayKey][teamId];
            const cellType = cell.type || cell;
            // Check if rest by type
            if (cellType === 'rest') {
              status = 'rest';
              reason = 'Descanso';
            } else {
              // Check if the shift_key is a rest shift
              const shiftInfo = shiftMap[cellType];
              if (shiftInfo?.is_rest) {
                status = 'rest';
                reason = 'Descanso';
              } else {
                shiftName = shiftInfo?.name || cellType;
              }
            }
          } else if (!config) {
            // No schedule published for this week
            shiftName = 'Sin horario';
          }

          teamMap[teamId].workers.push({
            id: w.id,
            name: w.name,
            worker_number: w.worker_number,
            status,
            reason,
            shift: shiftName,
          });
          teamMap[teamId].totalCount++;
          if (status === 'working') teamMap[teamId].workingCount++;
        }

        // Filter out empty teams
        const teamsList = Object.values(teamMap).filter(t => t.totalCount > 0);
        const totalWorking = teamsList.reduce((sum, t) => sum + t.workingCount, 0);
        const totalWorkers = teamsList.reduce((sum, t) => sum + t.totalCount, 0);

        results.push({
          id: deptId,
          name: dept.name,
          teams: teamsList,
          totalWorking,
          totalWorkers,
        });
      }

      // Compute aggregate totals across all departments
      const aggWorking = results.reduce((s: number, d: any) => s + d.totalWorking, 0);
      const aggTotal = results.reduce((s: number, d: any) => s + d.totalWorkers, 0);
      // Count statuses from all workers across all departments
      let aggOnLeave = 0, aggOnVacation = 0, aggResting = 0;
      for (const dept of results) {
        for (const team of (dept.teams || [])) {
          for (const w of (team.workers || [])) {
            if (w.status === 'leave') aggOnLeave++;
            else if (w.status === 'vacation') aggOnVacation++;
            else if (w.status === 'rest') aggResting++;
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, departments: results, working: aggWorking, total: aggTotal, onLeave: aggOnLeave, onVacation: aggOnVacation, resting: aggResting }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== TEAM CONFIG DRAFTS ====================
    if (action === 'saveTeamDraft') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admins' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }
      const { departmentId, snapshot, draftId, label, changeLog } = data;
      if (!departmentId || !snapshot) {
        return new Response(JSON.stringify({ success: false, error: 'Faltan datos' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      if (draftId) {
        // Update existing draft
        const updateData: any = { snapshot, created_by: manager.name };
        if (label !== undefined) updateData.label = label;
        if (changeLog !== undefined) updateData.change_log = changeLog;
        const { error } = await supabase
          .from('team_config_drafts')
          .update(updateData)
          .eq('id', draftId)
          .eq('is_applied', false);
        if (error) {
          console.error('Error updating draft:', error);
          return new Response(JSON.stringify({ success: false, error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }
        return new Response(JSON.stringify({ success: true, draftId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } else {
        // Create new draft
        const insertData: any = { department_id: departmentId, snapshot, created_by: manager.name };
        if (label) insertData.label = label;
        if (changeLog) insertData.change_log = changeLog;
        const { data: newDraft, error } = await supabase
          .from('team_config_drafts')
          .insert(insertData)
          .select('id')
          .single();
        if (error) {
          console.error('Error creating draft:', error);
          return new Response(JSON.stringify({ success: false, error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }
        return new Response(JSON.stringify({ success: true, draftId: newDraft.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (action === 'getAllResponsables') {
      if (!isAdmin && !isManager) {
        return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }
      const { data: responsables, error } = await supabase
        .from('workers')
        .select('id, name, department_id')
        .eq('is_responsable', true)
        .order('name');
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      // Fetch department names
      const deptIds = [...new Set((responsables || []).map(r => r.department_id).filter(Boolean))];
      let deptMap: Record<string, string> = {};
      if (deptIds.length > 0) {
        const { data: depts } = await supabase.from('departments').select('id, name').in('id', deptIds);
        if (depts) deptMap = Object.fromEntries(depts.map(d => [d.id, d.name]));
      }
      const result = (responsables || []).map(r => ({
        id: r.id,
        name: r.name,
        department_name: deptMap[r.department_id] || undefined,
      }));
      return new Response(JSON.stringify({ success: true, responsables: result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'listTeamDrafts') {
      if (!isAdmin && !isManager) {
        return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }
      const { departmentId } = data;
      if (!departmentId) {
        return new Response(JSON.stringify({ success: false, error: 'Falta departmentId' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const { data: drafts, error } = await supabase
        .from('team_config_drafts')
        .select('*')
        .eq('department_id', departmentId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) {
        console.error('Error listing drafts:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true, drafts: drafts || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'deleteTeamDraft') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admins' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }
      const { draftId } = data;
      if (!draftId) {
        return new Response(JSON.stringify({ success: false, error: 'Falta draftId' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const { error } = await supabase
        .from('team_config_drafts')
        .delete()
        .eq('id', draftId)
        .eq('is_applied', false);
      if (error) {
        console.error('Error deleting draft:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // =====================================================
    // Save team config backup (snapshot of LIVE state)
    // =====================================================
    if (action === 'saveTeamConfigBackup') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admins' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }
      const { departmentId, label } = data || {};
      if (!departmentId) {
        return new Response(JSON.stringify({ success: false, error: 'departmentId requerido' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      try {
        const { data: currentTeams } = await supabase.from('worker_teams').select('id, name, display_name, sort_order, responsable_worker_id').eq('department_id', departmentId);
        const { data: currentGroups } = await supabase.from('work_groups').select('id, name, color').eq('department_id', departmentId);
        const { data: currentWGT } = await supabase.from('work_group_teams').select('id, work_group_id, worker_team_id');
        const { data: currentWorkers } = await supabase.from('workers').select('id, worker_team_id, work_group_id').eq('department_id', departmentId);
        const deptTeamIds = new Set((currentTeams || []).map(t => t.id));
        const relevantWGT = (currentWGT || []).filter(wgt => deptTeamIds.has(wgt.worker_team_id));
        const snapshot = {
          teams: (currentTeams || []).map(t => ({ id: t.id, name: t.name, display_name: t.display_name, sort_order: t.sort_order })),
          work_groups: (currentGroups || []).map(g => ({ id: g.id, name: g.name, color: g.color })),
          work_group_teams: relevantWGT.map(wgt => ({ work_group_id: wgt.work_group_id, worker_team_id: wgt.worker_team_id })),
          worker_assignments: (currentWorkers || []).map(w => ({ worker_id: w.id, worker_team_id: w.worker_team_id, work_group_id: w.work_group_id })),
          team_responsables: (currentTeams || []).map(t => ({ team_id: t.id, responsable_worker_id: t.responsable_worker_id || null })),
        };
        const { data: newBackup, error } = await supabase.from('team_config_backups').insert({
          department_id: departmentId,
          label: label || 'Backup manual',
          snapshot,
          created_by: manager.name,
        }).select('id, created_at').single();
        if (error) throw error;
        await supabase.from('audit_logs').insert({
          action_type: 'team_config_backup_saved',
          actor_name: manager.name,
          actor_role: manager.role,
          entity_type: 'team_config_backup',
          entity_id: departmentId,
          details: `Backup de configuración guardado: ${label || 'Backup manual'}. ${snapshot.teams.length} equipos, ${snapshot.worker_assignments.length} asignaciones.`,
        });
        return new Response(JSON.stringify({ success: true, backup: newBackup }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err: any) {
        console.error('Error saving team config backup:', err);
        return new Response(JSON.stringify({ success: false, error: err.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
    }

    // =====================================================
    // List team config backups
    // =====================================================
    if (action === 'listTeamConfigBackups') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admins' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }
      const { departmentId } = data || {};
      if (!departmentId) {
        return new Response(JSON.stringify({ success: false, error: 'departmentId requerido' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const { data: backups, error } = await supabase.from('team_config_backups')
        .select('id, department_id, label, created_at, created_by, snapshot')
        .eq('department_id', departmentId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true, backups: backups || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // =====================================================
    // Restore team config from backup (applies it to DB)
    // =====================================================
    if (action === 'restoreTeamConfigBackup') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admins' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }
      const { departmentId, backupId } = data || {};
      if (!departmentId || !backupId) {
        return new Response(JSON.stringify({ success: false, error: 'departmentId y backupId requeridos' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      try {
        // 1. Fetch the backup
        const { data: backup, error: bErr } = await supabase.from('team_config_backups')
          .select('*').eq('id', backupId).single();
        if (bErr || !backup) throw new Error('Backup no encontrado');
        const snapshot = backup.snapshot as any;

        // 2. First save current state as a new backup before restoring
        const { data: currentTeams } = await supabase.from('worker_teams').select('id, name, display_name, sort_order, responsable_worker_id').eq('department_id', departmentId);
        const { data: currentGroups } = await supabase.from('work_groups').select('id, name, color').eq('department_id', departmentId);
        const { data: currentWGT } = await supabase.from('work_group_teams').select('id, work_group_id, worker_team_id');
        const { data: currentWorkers } = await supabase.from('workers').select('id, worker_team_id, work_group_id').eq('department_id', departmentId);
        const deptTeamIds = new Set((currentTeams || []).map(t => t.id));
        const relevantWGT = (currentWGT || []).filter(wgt => deptTeamIds.has(wgt.worker_team_id));
        await supabase.from('team_config_backups').insert({
          department_id: departmentId,
          label: `Auto-backup antes de restaurar (${backup.label})`,
          snapshot: {
            teams: (currentTeams || []).map(t => ({ id: t.id, name: t.name, display_name: t.display_name, sort_order: t.sort_order })),
            work_groups: (currentGroups || []).map(g => ({ id: g.id, name: g.name, color: g.color })),
            work_group_teams: relevantWGT.map(wgt => ({ work_group_id: wgt.work_group_id, worker_team_id: wgt.worker_team_id })),
            worker_assignments: (currentWorkers || []).map(w => ({ worker_id: w.id, worker_team_id: w.worker_team_id, work_group_id: w.work_group_id })),
            team_responsables: (currentTeams || []).map(t => ({ team_id: t.id, responsable_worker_id: t.responsable_worker_id || null })),
          },
          created_by: 'sistema',
        });

        // 3. Apply the backup snapshot (same logic as applyTeamConfig)
        const existingTeamIds = new Set((currentTeams || []).map(t => t.id));
        const snapshotTeamIds = new Set((snapshot.teams || []).map((t: any) => t.id));
        // Delete removed teams
        for (const t of (currentTeams || [])) {
          if (!snapshotTeamIds.has(t.id)) {
            await supabase.from('worker_teams').delete().eq('id', t.id);
          }
        }
        // Create/update teams
        for (const t of (snapshot.teams || [])) {
          if (existingTeamIds.has(t.id)) {
            await supabase.from('worker_teams').update({ name: t.name, display_name: t.display_name || null, sort_order: t.sort_order }).eq('id', t.id);
          } else {
            await supabase.from('worker_teams').insert({ id: t.id, department_id: departmentId, name: t.name, display_name: t.display_name || null, sort_order: t.sort_order });
          }
        }
        // Work groups
        const existingGroupIds = new Set((currentGroups || []).map(g => g.id));
        for (const g of (snapshot.work_groups || [])) {
          if (existingGroupIds.has(g.id)) {
            await supabase.from('work_groups').update({ name: g.name, color: g.color }).eq('id', g.id);
          }
        }
        // Work group teams
        for (const teamId of deptTeamIds) {
          await supabase.from('work_group_teams').delete().eq('worker_team_id', teamId);
        }
        for (const t of (snapshot.teams || [])) {
          if (!deptTeamIds.has(t.id)) {
            await supabase.from('work_group_teams').delete().eq('worker_team_id', t.id);
          }
        }
        if (snapshot.work_group_teams && snapshot.work_group_teams.length > 0) {
          await supabase.from('work_group_teams').insert(snapshot.work_group_teams.map((wgt: any) => ({
            work_group_id: wgt.work_group_id, worker_team_id: wgt.worker_team_id,
          })));
        }
        // Worker assignments
        for (const wa of (snapshot.worker_assignments || [])) {
          await supabase.from('workers').update({
            worker_team_id: wa.worker_team_id, work_group_id: wa.work_group_id,
          }).eq('id', wa.worker_id);
        }
        // Team responsables
        if (snapshot.team_responsables) {
          for (const tr of snapshot.team_responsables) {
            await supabase.from('worker_teams').update({
              responsable_worker_id: tr.responsable_worker_id || null,
            }).eq('id', tr.team_id);
          }
        }
        // Audit log
        await supabase.from('audit_logs').insert({
          action_type: 'team_config_restored',
          actor_name: manager.name,
          actor_role: manager.role,
          entity_type: 'team_config_backup',
          entity_id: departmentId,
          details: `Configuración restaurada desde backup: ${backup.label}`,
        });
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err: any) {
        console.error('Error restoring team config backup:', err);
        return new Response(JSON.stringify({ success: false, error: err.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
    }

    // =====================================================
    // Delete team config backup
    // =====================================================
    if (action === 'deleteTeamConfigBackup') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admins' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }
      const { backupId } = data || {};
      if (!backupId) {
        return new Response(JSON.stringify({ success: false, error: 'backupId requerido' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const { error } = await supabase.from('team_config_backups').delete().eq('id', backupId);
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'applyTeamConfig') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admins' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }
      const { departmentId, snapshot, draftId, changeLog } = data;
      if (!departmentId || !snapshot) {
        return new Response(JSON.stringify({ success: false, error: 'Faltan datos' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      try {
        // 1. Create auto-backup of current state
        const { data: currentTeams } = await supabase.from('worker_teams').select('id, name, display_name, sort_order, responsable_worker_id').eq('department_id', departmentId);
        const { data: currentGroups } = await supabase.from('work_groups').select('id, name, color').eq('department_id', departmentId);
        const { data: currentWGT } = await supabase.from('work_group_teams').select('id, work_group_id, worker_team_id');
        const { data: currentWorkers } = await supabase.from('workers').select('id, worker_team_id, work_group_id').eq('department_id', departmentId);

        // Filter WGT to only include those relevant to this department's teams
        const deptTeamIds = new Set((currentTeams || []).map(t => t.id));
        const relevantWGT = (currentWGT || []).filter(wgt => deptTeamIds.has(wgt.worker_team_id));

        const backupSnapshot = {
          teams: (currentTeams || []).map(t => ({ id: t.id, name: t.name, display_name: t.display_name, sort_order: t.sort_order, responsable_worker_id: t.responsable_worker_id })),
          work_groups: (currentGroups || []).map(g => ({ id: g.id, name: g.name, color: g.color })),
          work_group_teams: relevantWGT.map(wgt => ({ work_group_id: wgt.work_group_id, worker_team_id: wgt.worker_team_id })),
          worker_assignments: (currentWorkers || []).map(w => ({ worker_id: w.id, worker_team_id: w.worker_team_id, work_group_id: w.work_group_id })),
        };

        await supabase.from('team_config_drafts').insert({
          department_id: departmentId,
          snapshot: backupSnapshot,
          is_applied: true,
          applied_at: new Date().toISOString(),
          applied_by: manager.name,
          created_by: manager.name,
          label: 'Auto-backup antes de aplicar',
          change_log: changeLog && Array.isArray(changeLog) && changeLog.length > 0 ? changeLog : null,
        });

        // 2. Apply team changes (create/update/delete)
        const existingTeamIds = new Set((currentTeams || []).map(t => t.id));
        const snapshotTeamIds = new Set(snapshot.teams.map((t: any) => t.id));

        // Delete removed teams
        for (const t of (currentTeams || [])) {
          if (!snapshotTeamIds.has(t.id)) {
            await supabase.from('worker_teams').delete().eq('id', t.id);
          }
        }

        // Create/update teams
        for (const t of snapshot.teams) {
          if (existingTeamIds.has(t.id)) {
            await supabase.from('worker_teams').update({ name: t.name, display_name: t.display_name || null, sort_order: t.sort_order }).eq('id', t.id);
          } else {
            await supabase.from('worker_teams').insert({ id: t.id, department_id: departmentId, name: t.name, display_name: t.display_name || null, sort_order: t.sort_order });
          }
        }

        // 3. Apply work group changes
        const existingGroupIds = new Set((currentGroups || []).map(g => g.id));
        for (const g of snapshot.work_groups) {
          if (existingGroupIds.has(g.id)) {
            await supabase.from('work_groups').update({ name: g.name, color: g.color }).eq('id', g.id);
          }
        }

        // 4. Apply work_group_teams mappings
        // Delete existing mappings for this dept's teams, then re-insert
        for (const teamId of deptTeamIds) {
          await supabase.from('work_group_teams').delete().eq('worker_team_id', teamId);
        }
        // Also for new teams
        for (const t of snapshot.teams) {
          if (!deptTeamIds.has(t.id)) {
            await supabase.from('work_group_teams').delete().eq('worker_team_id', t.id);
          }
        }
        if (snapshot.work_group_teams && snapshot.work_group_teams.length > 0) {
          const mappingsToInsert = snapshot.work_group_teams.map((wgt: any) => ({
            work_group_id: wgt.work_group_id,
            worker_team_id: wgt.worker_team_id,
          }));
          await supabase.from('work_group_teams').insert(mappingsToInsert);
        }

        // 5. Apply worker assignments
        for (const wa of snapshot.worker_assignments) {
          await supabase.from('workers').update({
            worker_team_id: wa.worker_team_id,
            work_group_id: wa.work_group_id,
          }).eq('id', wa.worker_id);
        }

        // 5b. Apply team responsables
        if (snapshot.team_responsables && Array.isArray(snapshot.team_responsables)) {
          for (const tr of snapshot.team_responsables) {
            await supabase.from('worker_teams').update({
              responsable_worker_id: tr.responsable_worker_id || null,
            }).eq('id', tr.team_id);
          }
        }

        // 6. Mark draft as applied
        if (draftId) {
          await supabase.from('team_config_drafts').update({
            is_applied: true,
            applied_at: new Date().toISOString(),
            applied_by: manager.name,
          }).eq('id', draftId);
        }

        // 7. Audit log
        await supabase.from('audit_logs').insert({
          action_type: 'apply_team_config',
          actor_name: manager.name,
          actor_role: manager.role,
          entity_type: 'team_config',
          entity_id: departmentId,
          details: `Configuración de equipos aplicada. ${snapshot.teams.length} equipos, ${snapshot.worker_assignments.length} asignaciones.`,
        });

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err: any) {
        console.error('Error applying team config:', err);
        return new Response(JSON.stringify({ success: false, error: err.message || 'Error interno' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
    }

    // =====================================================
    // Get worker performance history
    // =====================================================
    if (action === 'getWorkerPerformanceHistory') {
      const { workerId } = data || {};
      if (!workerId) {
        return new Response(JSON.stringify({ success: false, error: 'workerId requerido' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      try {
        const [historyRes, workerRes, thresholdsRes] = await Promise.all([
          supabase.from('worker_performance_history')
            .select('id, lines_hour, recorded_at, import_source, created_at')
            .eq('worker_id', workerId)
            .order('recorded_at', { ascending: false })
            .limit(100),
          supabase.from('workers')
            .select('id, name, worker_number, lines_hour, department_id')
            .eq('id', workerId)
            .single(),
          supabase.from('performance_thresholds')
            .select('*'),
        ]);

        const worker = workerRes.data;
        const history = historyRes.data || [];
        const thresholds = thresholdsRes.data || [];
        const workerThreshold = worker ? thresholds.find((t: any) => t.department_id === worker.department_id) : null;

        return new Response(JSON.stringify({
          success: true,
          history,
          worker: worker ? { id: worker.id, name: worker.name, worker_number: worker.worker_number, lines_hour: worker.lines_hour, department_id: worker.department_id } : null,
          threshold: workerThreshold || null,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
    }

    // =====================================================
    // Get performance dashboard data
    // =====================================================
    if (action === 'getPerformanceDashboard') {
      try {
        const { departmentId } = data || {};

        // Fetch workers with lines_hour
        let workersQuery = supabase.from('workers')
          .select('id, name, worker_number, department_id, lines_hour')
          .not('lines_hour', 'is', null);
        if (departmentId && departmentId !== 'all') {
          workersQuery = workersQuery.eq('department_id', departmentId);
        }
        const { data: perfWorkers } = await workersQuery;

        const workerIds = (perfWorkers || []).map((w: any) => w.id);

        // Fetch history and thresholds in parallel
        const [historyRes, thresholdsRes, deptsRes] = await Promise.all([
          workerIds.length > 0
            ? supabase.from('worker_performance_history')
                .select('worker_id, lines_hour, recorded_at')
                .in('worker_id', workerIds)
                .order('recorded_at', { ascending: false })
                .limit(2000)
            : Promise.resolve({ data: [] }),
          supabase.from('performance_thresholds').select('*'),
          supabase.from('departments').select('id, name'),
        ]);

        return new Response(JSON.stringify({
          success: true,
          workers: perfWorkers || [],
          history: historyRes.data || [],
          thresholds: thresholdsRes.data || [],
          departments: deptsRes.data || [],
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
    }

    // ==================== importPerformanceCSV ====================
    if (action === 'importPerformanceCSV') {
      try {
        const { entries, date } = data;
        
        if (!entries || !Array.isArray(entries) || entries.length === 0) {
          return new Response(JSON.stringify({ success: false, error: 'No entries provided' }), 
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        }

        const importDate = date || new Date().toISOString().split('T')[0];
        let matched = 0;
        let notFound = 0;
        const notFoundList: string[] = [];

        // Fetch all workers for matching
        const { data: allWorkers } = await supabase
          .from('workers')
          .select('id, worker_number, name')
          .is('deleted_at', null);

        const workerMap = new Map<string, { id: string; name: string }>();
        for (const w of (allWorkers || [])) {
          workerMap.set(w.worker_number, { id: w.id, name: w.name });
        }

        for (const entry of entries) {
          const { workerNumber, linesHour, workerName } = entry;
          const worker = workerMap.get(String(workerNumber));

          if (!worker) {
            notFound++;
            notFoundList.push(`${workerNumber} (${workerName || 'desconocido'})`);
            continue;
          }

          // Update workers.lines_hour
          await supabase
            .from('workers')
            .update({ lines_hour: Number(linesHour) })
            .eq('id', worker.id);

          // Insert into performance history
          // Upsert by worker_id + recorded_at to avoid duplicates for same day
          const { data: existing } = await supabase
            .from('worker_performance_history')
            .select('id')
            .eq('worker_id', worker.id)
            .eq('recorded_at', importDate)
            .eq('import_source', 'performance-csv')
            .limit(1);

          if (existing && existing.length > 0) {
            await supabase
              .from('worker_performance_history')
              .update({ lines_hour: Number(linesHour) })
              .eq('id', existing[0].id);
          } else {
            await supabase.from('worker_performance_history').insert({
              worker_id: worker.id,
              lines_hour: Number(linesHour),
              recorded_at: importDate,
              import_source: 'performance-csv',
            });
          }

          matched++;
        }

        await logAudit('IMPORT', 'performance', null, { matched, notFound, date: importDate }, 
          `Performance CSV import: ${matched} matched, ${notFound} not found`);

        return new Response(JSON.stringify({ 
          success: true, matched, notFound, notFoundList: notFoundList.slice(0, 20),
          total: entries.length, date: importDate
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
    }

    // ── Create test exchange (admin only) ──
    if (action === 'createTestExchange') {
      console.log('[TEST] Starting createTestExchange...');
      const { testEmail } = data;
      const targetEmail = testEmail || 'alvaromt@verdnatura.es';

      try {
      // Find a department with work groups
      console.log('[TEST] Fetching work groups...');
      // Use Preservado department which is known to have 4 groups
      const targetDeptId = 'b1b8284a-8c24-4c4c-aaf0-bb75820e7ea2';
      const { data: allGroups, error: grpErr } = await supabase
        .from('work_groups')
        .select('id, name, color, department_id')
        .eq('department_id', targetDeptId)
        .limit(4);
      console.log('[TEST] Groups:', allGroups?.length, 'err:', grpErr?.message);

      if (!allGroups || allGroups.length < 2) {
        return new Response(JSON.stringify({ success: false, error: 'No hay suficientes grupos en Preservado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      const deptId = targetDeptId;
      const groupA = allGroups[0];
      const groupB = allGroups[1];

      // Find two workers from that department
      const { data: deptWorkers } = await supabase
        .from('workers')
        .select('id, name, worker_number')
        .eq('department_id', deptId)
        .limit(2);

      if (!deptWorkers || deptWorkers.length < 2) {
        return new Response(JSON.stringify({ success: false, error: 'Departamento sin suficientes trabajadores' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      const workerA = deptWorkers[0];
      const workerB = deptWorkers[1];
      const year = new Date().getFullYear();

      console.log('[TEST] Inserting exchange:', workerA.name, 'vs', workerB.name, groupA.name, 'vs', groupB.name);

      // Create the exchange record
      const { data: newExchange, error: createErr } = await supabase
        .from('vacation_group_exchanges')
        .insert({
          department_id: deptId,
          employee_a_id: workerA.id,
          employee_b_id: workerB.id,
          original_group_a_id: groupA.id,
          original_group_b_id: groupB.id,
          temporary_group_a_id: groupB.id,
          temporary_group_b_id: groupA.id,
          year,
          status: 'draft',
          created_by: `TEST - ${manager.name}`
        })
        .select()
        .single();

      console.log('[TEST] Insert result:', createErr?.message || 'OK', newExchange?.id);

      if (createErr || !newExchange) {
        console.error('Error creating test exchange:', createErr);
        return new Response(JSON.stringify({ success: false, error: createErr?.message || 'Error creating test exchange' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      console.log('Test exchange created:', newExchange.id, 'tokens:', newExchange.token_a, newExchange.token_b);

      // Build base URL
      const normalizeBaseUrl = (url: unknown): string => {
        if (typeof url !== 'string') return '';
        const trimmed = url.trim().replace(/\/+$/, '');
        if (!trimmed) return '';
        if (!/^https?:\/\//i.test(trimmed)) return '';
        return trimmed;
      };
      const baseUrl = normalizeBaseUrl(data.baseUrl) || normalizeBaseUrl(Deno.env.get('SITE_URL')) || 'https://vnvacaciones.lovable.app';

      // Send emails to test address
      const emailResults = await Promise.all([
        sendEmailNotification({
          to: targetEmail,
          type: 'group_exchange_confirmation',
          data: {
            employeeName: workerA.name,
            year,
            originalGroup: groupA.name,
            temporaryGroup: groupB.name,
            otherEmployee: workerB.name,
            confirmationLink: `${baseUrl}/confirmar-intercambio?token=${newExchange.token_a}`,
          },
        }),
        sendEmailNotification({
          to: targetEmail,
          type: 'group_exchange_confirmation',
          data: {
            employeeName: workerB.name,
            year,
            originalGroup: groupB.name,
            temporaryGroup: groupA.name,
            otherEmployee: workerA.name,
            confirmationLink: `${baseUrl}/confirmar-intercambio?token=${newExchange.token_b}`,
          },
        }),
      ]);

      // Update status to pending
      await supabase
        .from('vacation_group_exchanges')
        .update({ status: 'pending_employee_acceptance' })
        .eq('id', newExchange.id);

      console.log('Test exchange emails sent to:', targetEmail, 'results:', emailResults);

      return new Response(JSON.stringify({
        success: true,
        exchange: newExchange,
        linkA: `${baseUrl}/confirmar-intercambio?token=${newExchange.token_a}`,
        linkB: `${baseUrl}/confirmar-intercambio?token=${newExchange.token_b}`,
        workerA: workerA.name,
        workerB: workerB.name,
        groupA: groupA.name,
        groupB: groupB.name,
        emailSentTo: targetEmail,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      } catch (testErr: any) {
        console.error('[TEST] Caught error in createTestExchange:', testErr?.message || testErr);
        return new Response(JSON.stringify({ success: false, error: testErr?.message || 'Error interno en createTestExchange' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
    }

    // ========== OPERATIVA DIARIA — Justificantes ==========
    if (action === 'getOperativaJustificanteConfig') {
      const { data: config, error } = await supabase
        .from('operativa_justificante_config')
        .select('id, emails, primary_email')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching operativa config:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true, emails: config?.emails || [], primary_email: config?.primary_email || null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'updateOperativaJustificanteConfig') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admin puede configurar' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }

      const rawEmails: string[] = Array.isArray(data?.emails) ? data.emails : [];
      const emails = Array.from(
        new Set(
          rawEmails
            .map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
            .filter((e) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        )
      );
      const primary_email = typeof data?.primary_email === 'string' ? data.primary_email.trim().toLowerCase() || null : null;

      const { data: existing, error: existingError } = await supabase
        .from('operativa_justificante_config')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingError) {
        console.error('Error finding operativa config:', existingError);
        return new Response(JSON.stringify({ success: false, error: existingError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      if (existing) {
        const { error: updateError } = await supabase
          .from('operativa_justificante_config')
          .update({ emails, primary_email, updated_at: new Date().toISOString() })
          .eq('id', existing.id);

        if (updateError) {
          console.error('Error updating operativa config:', updateError);
          return new Response(JSON.stringify({ success: false, error: updateError.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }
      } else {
        const { error: insertError } = await supabase
          .from('operativa_justificante_config')
          .insert({ emails, primary_email });

        if (insertError) {
          console.error('Error creating operativa config:', insertError);
          return new Response(JSON.stringify({ success: false, error: insertError.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }
      }

      return new Response(JSON.stringify({ success: true, emails, primary_email }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'sendOperativaJustificante') {
      const { workerId, workerName, workerNumber, fileName, fileType, fileBase64, additionalFiles, comment } = data || {};

      if (!workerId || !workerName || !workerNumber || !fileBase64 || !fileName) {
        return new Response(JSON.stringify({ success: false, error: 'Faltan campos obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      // Get configured emails
      const { data: config, error: configError } = await supabase
        .from('operativa_justificante_config')
        .select('emails, primary_email')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (configError) {
        return new Response(JSON.stringify({ success: false, error: configError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      const allEmails: string[] = config?.emails || [];
      const primaryEmail: string | null = config?.primary_email || null;
      
      // Determine TO and CC
      const toEmail = primaryEmail || allEmails[0];
      if (!toEmail) {
        return new Response(JSON.stringify({ success: false, error: 'No hay emails destinatarios configurados' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const ccEmails = allEmails.filter(e => e !== toEmail);

      // Upload all files to storage bucket
      const allFiles = [{ fileName, fileType, fileBase64 }, ...(Array.isArray(additionalFiles) ? additionalFiles : [])];
      for (const f of allFiles) {
        try {
          const buf = Uint8Array.from(atob(f.fileBase64), c => c.charCodeAt(0));
          const path = `operativa/${workerId}/${Date.now()}_${f.fileName}`;
          await supabase.storage.from('justificantes').upload(path, buf, { contentType: f.fileType || 'application/octet-stream' });
        } catch (upErr) {
          console.error('Upload error:', upErr);
        }
      }

      // Build email HTML — corporate style matching Control de Incidencias
      const logoUrl = 'https://vnprod.app/images/logo-white.png';
      const logoGreenUrl = 'https://vnprod.app/images/verdnatura-logo-green.png';
      const accentColor = '#93d600';
      const firstName = workerName.split(' ')[0];

      const filesListHtml = allFiles.map(f => f.fileName).join(', ');

      const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Poppins','Segoe UI',Arial,sans-serif;letter-spacing:-0.01em;">
<div style="max-width:620px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg, ${accentColor}, #7ab300);border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <img src="${logoUrl}" alt="Verdnatura" width="56" height="56" style="width:56px;height:56px;margin-bottom:12px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;font-family:'Poppins','Segoe UI',sans-serif;">Justificante</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">Documentación adjunta</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;border-radius:0 0 16px 16px;">
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:${accentColor};text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Trabajador/a</p>
      <span style="display:inline-block;background:${accentColor};color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;"><a href="https://salix.verdnatura.es/#!/worker/${workerNumber}/summary" target="_blank" style="color:#fff;text-decoration:none;">${workerName} (${workerNumber})</a> →</span>
    </div>
    <div style="line-height:1.75;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.01em;">
      <p style="margin:0 0 16px;">Se adjunta el justificante del trabajador/a <strong>${workerName} (${workerNumber})</strong>.</p>
      ${allFiles.length > 0 ? `<div style="margin:16px 0;padding:14px 16px;background:#f0f9e8;border-radius:12px;border:1px solid ${accentColor}30;">
        <p style="margin:0 0 4px;font-weight:600;font-size:13px;color:#365314;font-family:'Poppins','Segoe UI',sans-serif;">Archivos adjuntos (${allFiles.length})</p>
        <p style="margin:0;font-size:13px;color:#4d7c0f;font-family:'Poppins','Segoe UI',sans-serif;">${filesListHtml}</p>
      </div>` : ''}
      ${comment ? `<div style="margin:16px 0;padding:14px 16px;background:#f8fafc;border-radius:12px;border-left:4px solid ${accentColor};">
        <p style="margin:0 0 4px;font-weight:600;font-size:12px;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;text-transform:uppercase;letter-spacing:0.5px;">Comentario</p>
        <p style="margin:0;font-size:14px;color:#334155;font-family:'Poppins','Segoe UI',sans-serif;">${comment}</p>
      </div>` : ''}
    </div>
    <div style="margin-top:28px;line-height:1.4;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">
      <p style="margin:0 0 16px;">Muchas gracias y un saludo,</p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-right:16px;vertical-align:middle;"><img src="${logoGreenUrl}" alt="Verdnatura" width="40" height="40" style="width:40px;height:40px;display:block;"></td>
          <td style="padding-right:16px;border-right:2px solid ${accentColor};vertical-align:middle;">
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
          <td><span style="display:inline-block;background:${accentColor}18;color:${accentColor};padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">Justificante</span></td>
          <td><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${allFiles.length} archivo${allFiles.length > 1 ? 's' : ''}</span></td>
        </tr>
      </table>
    </div>
    <div style="margin-top:20px;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:8px;">
        <tr>
          <td style="width:3px;background:${accentColor};border-radius:2px;"></td>
          <td style="padding-left:10px;"><span style="font-size:11px;font-weight:600;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;">Enviado desde Operativa · Verdnatura</span></td>
        </tr>
      </table>
      <p style="margin:0;font-size:11px;color:#94a3b8;font-family:'Poppins','Segoe UI',sans-serif;">Enviado por ${manager.name} · Este correo es confidencial.</p>
    </div>
  </div>
</div>
</body></html>`;

      // Send email via Brevo with attachment
      const BREVO_KEY_CHECK = Deno.env.get('BREVO_API_KEY');
      if (!BREVO_KEY_CHECK) {
        return new Response(JSON.stringify({ success: false, error: 'Email service not configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      const subject = 'Justificante - ' + workerName + ' (' + workerNumber + ')' + (allFiles.length > 1 ? ' · ' + allFiles.length + ' archivos' : '');

      const emailPayload: any = {
        from: 'Justificantes <justificantes@vnprod.app>',
        to: [toEmail],
        subject,
        html: htmlContent,
        attachments: allFiles.map(f => ({
          filename: f.fileName,
          content: f.fileBase64,
        })),
      };
      if (ccEmails.length > 0) {
        emailPayload.cc = ccEmails;
      }

      const emailResp = await sendEmailBrevo(emailPayload);

      const emailResult = await emailResp.json();
      console.log('Resend justificante response:', emailResp.status, JSON.stringify(emailResult));

      if (!emailResp.ok) {
        return new Response(JSON.stringify({ success: false, error: emailResult.message || 'Error sending email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      // Save to history
      try {
        await supabase.from('operativa_envios_history').insert({
          tipo: 'justificante',
          sent_by: manager.name,
          destinatarios: allEmails,
          datos: { workerName, workerNumber, fileName, totalFiles: allFiles.length, fileNames: allFiles.map(f => f.fileName), comment: comment || null },
          email_id: emailResult.id || null,
        });
      } catch (histErr) {
        console.error('Failed to save justificante history:', histErr);
      }

      return new Response(JSON.stringify({ success: true, emailId: emailResult.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ========== OPERATIVA — Identificar trabajador con IA ==========
    if (action === 'identifyWorkerFromDocument') {
      const { fileBase64, fileType } = data || {};
      if (!fileBase64) {
        return new Response(JSON.stringify({ success: true, match: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
      if (!GOOGLE_AI_API_KEY) {
        console.error('GOOGLE_AI_API_KEY not configured');
        return new Response(JSON.stringify({ success: true, match: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      try {
        // Determine mime type for Gemini
        let mimeType = fileType || 'image/jpeg';
        if (mimeType === 'application/pdf') mimeType = 'application/pdf';
        else if (!mimeType.startsWith('image/')) mimeType = 'image/jpeg';

        // Call Gemini vision
        const geminiResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    text: 'Analiza este documento (puede ser un justificante médico, parte de baja/alta, documento oficial, receta, etc). Este documento lo presenta un TRABAJADOR de una empresa para justificar una ausencia laboral.\n\nREGLAS DE IDENTIFICACIÓN:\n1. En un PARTE MÉDICO DE INCAPACIDAD TEMPORAL o parte de baja/alta: el trabajador es SIEMPRE la persona en "DATOS DEL TRABAJADOR" o "Nombre y apellidos" de la sección superior. NO es el médico/facultativo.\n2. En justificantes de acompañamiento: busca "a petición de", "acompañante", "solicitado por". La persona que SOLICITA es el trabajador.\n3. En otros documentos: el paciente/interesado suele ser el trabajador, SALVO que haya indicación de que es un familiar.\n4. IGNORA SIEMPRE: nombres de doctores, médicos, facultativos, profesionales sanitarios, firmas institucionales, inspectores médicos.\n\nDevuelve SOLO un JSON válido: {"nombres": ["Nombre Apellido1 Apellido2", ...], "probable_trabajador": "Nombre Apellido1 Apellido2"}\n- "nombres": TODOS los nombres de personas NO médicas\n- "probable_trabajador": el nombre que MÁS probablemente es el trabajador\nSi no puedes leer ningún nombre: {"nombres": [], "probable_trabajador": null}\nNo incluyas explicaciones, solo el JSON.'
                  },
                  {
                    inlineData: {
                      mimeType,
                      data: fileBase64
                    }
                  }
                ]
              }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 500,
              }
            })
          }
        );

        if (!geminiResp.ok) {
          console.error('Gemini API error:', geminiResp.status, await geminiResp.text());
          return new Response(JSON.stringify({ success: true, match: null }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const geminiData = await geminiResp.json();
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log('Gemini raw response:', rawText);

        // Parse JSON from response (handle markdown code blocks)
        let nombres: string[] = [];
        let probableTrabajador: string | null = null;
        try {
          const cleanJson = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          nombres = parsed.nombres || [];
          probableTrabajador = parsed.probable_trabajador || null;
        } catch (parseErr) {
          console.error('Failed to parse Gemini response:', parseErr);
          return new Response(JSON.stringify({ success: true, match: null }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // If AI identified a probable worker, put it first in the list
        if (probableTrabajador) {
          nombres = [probableTrabajador, ...nombres.filter(n => n !== probableTrabajador)];
        }

        if (nombres.length === 0) {
          return new Response(JSON.stringify({ success: true, match: null }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        console.log('Extracted names:', nombres, 'Probable worker:', probableTrabajador);

        // Fetch all workers
        const { data: workers } = await supabase
          .from('workers')
          .select('id, name, worker_number, worker_code');

        if (!workers || workers.length === 0) {
          return new Response(JSON.stringify({ success: true, match: null }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Normalize function: remove accents, lowercase, trim
        const normalize = (s: string) => (s || '').toLowerCase().trim()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // Find best match
        let bestMatch: any = null;
        let bestScore = 0;

        for (const nombre of nombres) {
          const normNombre = normalize(nombre);
          const nombreParts = normNombre.split(/\s+/).filter(Boolean);

          for (const worker of workers) {
            const normWorker = normalize(worker.name);
            const workerParts = normWorker.split(/\s+/).filter(Boolean);

            // Score: count matching parts bidirectionally
            let matchFromDoc = 0;
            for (const part of nombreParts) {
              if (part.length < 2) continue;
              if (workerParts.some(wp => wp === part || (part.length >= 3 && (wp.includes(part) || part.includes(wp))))) {
                matchFromDoc++;
              }
            }

            let matchFromWorker = 0;
            for (const wp of workerParts) {
              if (wp.length < 2) continue;
              if (nombreParts.some(part => part === wp || (wp.length >= 3 && (part.includes(wp) || wp.includes(part))))) {
                matchFromWorker++;
              }
            }

            // Also check if full name contains
            if (normWorker.includes(normNombre) || normNombre.includes(normWorker)) {
              matchFromDoc = nombreParts.length;
              matchFromWorker = workerParts.length;
            }

            const significantNombreParts = nombreParts.filter(p => p.length >= 2).length;
            const significantWorkerParts = workerParts.filter(p => p.length >= 2).length;
            const scoreFromDoc = significantNombreParts > 0 ? matchFromDoc / significantNombreParts : 0;
            const scoreFromWorker = significantWorkerParts > 0 ? matchFromWorker / significantWorkerParts : 0;
            const score = Math.max(scoreFromDoc, scoreFromWorker);

            const isPreferred = probableTrabajador && normalize(probableTrabajador) === normNombre;
            const adjustedScore = isPreferred ? score + 0.05 : score;

            if (adjustedScore > bestScore && score >= 0.4) {
              bestScore = adjustedScore;
              bestMatch = {
                workerId: worker.id,
                workerName: worker.name,
                workerNumber: worker.worker_number,
                confidence: Math.round(score * 100),
                matchedName: nombre,
              };
            }
          }
        }

        console.log('Best match:', bestMatch);

        return new Response(JSON.stringify({ success: true, match: bestMatch }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      } catch (aiErr: any) {
        console.error('AI identification error:', aiErr);
        return new Response(JSON.stringify({ success: true, match: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ========== OPERATIVA DIARIA — Altas ==========
    if (action === 'getOperativaAltasConfig') {
      const { data: config, error } = await supabase
        .from('operativa_altas_config')
        .select('id, emails, primary_email')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching altas config:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true, emails: config?.emails || [], primary_email: config?.primary_email || null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'updateOperativaAltasConfig') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admin puede configurar' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }

      const rawEmails: string[] = Array.isArray(data?.emails) ? data.emails : [];
      const emails = Array.from(
        new Set(
          rawEmails
            .map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
            .filter((e) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        )
      );
      const primary_email = typeof data?.primary_email === 'string' ? data.primary_email.trim().toLowerCase() || null : null;

      const { data: existing } = await supabase
        .from('operativa_altas_config')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('operativa_altas_config')
          .update({ emails, primary_email, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('operativa_altas_config')
          .insert({ emails, primary_email });
      }

      return new Response(JSON.stringify({ success: true, emails, primary_email }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'extractAltaDataFromDocument') {
      const { fileBase64, fileType } = data || {};
      if (!fileBase64) {
        return new Response(JSON.stringify({ success: true, extracted: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
      if (!GOOGLE_AI_API_KEY) {
        return new Response(JSON.stringify({ success: true, extracted: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      try {
        let mimeType = fileType || 'image/jpeg';
        if (mimeType === 'application/pdf') mimeType = 'application/pdf';
        else if (!mimeType.startsWith('image/')) mimeType = 'image/jpeg';

        const geminiResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    text: 'Analiza este documento. Puede ser un DNI, NIE, tarjeta SIP, documento bancario, o similar. Extrae la siguiente información si está disponible:\n- Nombre completo de la persona (no el médico ni el emisor)\n- IBAN o número de cuenta bancaria\n\nDevuelve SOLO un JSON válido con este formato exacto: {"nombre": "Nombre Apellido1 Apellido2", "iban": "ES00 0000 0000 0000 0000 0000"}. Si no encuentras algún dato, pon null en ese campo. No incluyas explicaciones, solo el JSON.'
                  },
                  {
                    inlineData: { mimeType, data: fileBase64 }
                  }
                ]
              }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
            })
          }
        );

        if (!geminiResp.ok) {
          console.error('Gemini API error:', geminiResp.status);
          return new Response(JSON.stringify({ success: true, extracted: null }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const geminiData = await geminiResp.json();
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log('Gemini alta extraction:', rawText);

        const cleanJson = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        return new Response(JSON.stringify({
          success: true,
          extracted: {
            nombre: parsed.nombre || null,
            iban: parsed.iban || null,
          }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      } catch (err: any) {
        console.error('AI extraction error:', err);
        return new Response(JSON.stringify({ success: true, extracted: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (action === 'extractFromWhatsappScreenshot') {
      const { fileBase64, fileType, context, capturas } = data || {};
      // Support both single image (fileBase64) and multi-image (capturas array)
      const screenshotList: { base64: string; fileType: string }[] = [];
      if (capturas && Array.isArray(capturas) && capturas.length > 0) {
        for (const cap of capturas) {
          if (cap.base64) screenshotList.push({ base64: cap.base64, fileType: cap.fileType || 'image/jpeg' });
        }
      } else if (fileBase64) {
        screenshotList.push({ base64: fileBase64, fileType: fileType || 'image/jpeg' });
      }

      if (screenshotList.length === 0 || !context) {
        return new Response(JSON.stringify({ success: false, errorCode: 'missing_data', extracted: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
      if (!GOOGLE_AI_API_KEY) {
        return new Response(JSON.stringify({ success: false, errorCode: 'no_api_key', extracted: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Safe JSON parse helper with cleanup
      const safeJsonParse = (raw: string): any => {
        if (!raw || !raw.trim()) return null;
        let text = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        text = text.replace(/[\x00-\x1f]/g, (ch) => ch === '\n' || ch === '\r' || ch === '\t' ? ' ' : '');
        try { return JSON.parse(text); } catch (_) {}
        try {
          const fixed = text.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
          return JSON.parse(fixed);
        } catch (_) {}
        const m = text.match(/\{[\s\S]*\}/);
        if (m) {
          try { return JSON.parse(m[0].replace(/[\x00-\x1f]/g, ' ')); } catch (_) {}
        }
        return null;
      };

      try {

        let promptText = '';
        let responseSchema: any = null;

        if (context === 'alta') {
          const numCaptures = screenshotList.length;
          promptText = `Analiza ${numCaptures > 1 ? 'estas ' + numCaptures + ' capturas de WhatsApp juntas' : 'esta captura de WhatsApp'}. Se notifica un ALTA de trabajador.

ROLES:
- "solicitante": nombre del CONTACTO en la BARRA SUPERIOR del chat (quien envía).
- "nombre": nombre del TRABAJADOR mencionado DENTRO del mensaje (quien será dado de alta).
Si solo hay un nombre visible, pon el mismo en ambos.

${numCaptures > 1 ? 'IMPORTANTE: Las capturas son partes consecutivas de la MISMA conversación. Combina la información de TODAS las capturas para extraer todos los datos posibles.' : ''}

Extrae: nombre, iban, telefono, email, departamento, fechaAlta (dd/MM/yyyy o "asap" si dice "lo antes posible"/"cuanto antes"/"ya"/"mañana"), solicitante.
Devuelve JSON con esos campos. Pon null en los no encontrados. Sin explicaciones ni markdown.`;
          responseSchema = {
            type: "OBJECT",
            properties: {
              nombre: { type: "STRING", nullable: true },
              iban: { type: "STRING", nullable: true },
              telefono: { type: "STRING", nullable: true },
              email: { type: "STRING", nullable: true },
              departamento: { type: "STRING", nullable: true },
              fechaAlta: { type: "STRING", nullable: true },
              solicitante: { type: "STRING", nullable: true }
            },
            required: ["nombre", "solicitante"]
          };
        } else if (context === 'anticipo') {
          promptText = `Analiza esta captura de WhatsApp para un ANTICIPO de nómina.

Reglas CRÍTICAS:
1) "solicitante" = nombre EXACTO del contacto que aparece en la BARRA SUPERIOR del chat.
2) "workerName" = trabajador afectado mencionado DENTRO del mensaje (no el saludo).
3) Si el mensaje contiene saludo tipo "Hola José" y luego "... Javi Valderrama", el trabajador es "Javi Valderrama".
4) Extrae "bodyNames" como lista ordenada de nombres detectados dentro del mensaje (de izquierda a derecha / arriba a abajo).

Campos a devolver:
- headerContact
- bodyNames
- workerName
- workerNumber
- cantidad (solo número, sin símbolo €)
- solicitante (igual que headerContact)

Devuelve SOLO JSON válido, sin markdown ni texto adicional.`;
          responseSchema = {
            type: "OBJECT",
            properties: {
              headerContact: { type: "STRING", nullable: true },
              bodyNames: {
                type: "ARRAY",
                nullable: true,
                items: { type: "STRING" }
              },
              workerName: { type: "STRING", nullable: true },
              workerNumber: { type: "STRING", nullable: true },
              cantidad: { type: "STRING", nullable: true },
              solicitante: { type: "STRING", nullable: true }
            },
            required: ["headerContact", "workerName", "cantidad", "solicitante"]
          };
        } else {
          return new Response(JSON.stringify({ success: false, errorCode: 'invalid_context', extracted: null }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const makeGeminiCall = async () => {
          // Build parts: prompt text + all screenshot images
          const parts: any[] = [{ text: promptText }];
          for (const ss of screenshotList) {
            let mime = ss.fileType || 'image/jpeg';
            if (!mime.startsWith('image/')) mime = 'image/jpeg';
            parts.push({ inlineData: { mimeType: mime, data: ss.base64 } });
          }

          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                  temperature: 0,
                  maxOutputTokens: 1024,
                  responseMimeType: 'application/json',
                  responseSchema
                }
              })
            }
          );
          if (!resp.ok) {
            const errBody = await resp.text();
            console.error('Gemini API error:', resp.status, errBody);
            return null;
          }
          const gd = await resp.json();
          const raw = gd?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          console.log('Gemini WhatsApp extraction raw:', raw.substring(0, 200));
          return raw;
        };

        // First attempt
        let rawText = await makeGeminiCall();
        if (!rawText) {
          return new Response(JSON.stringify({ success: false, errorCode: 'gemini_error', extracted: null }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        let parsed = safeJsonParse(rawText);

        // Retry once if parse failed
        if (!parsed) {
          console.log('First parse failed, retrying...');
          rawText = await makeGeminiCall();
          if (rawText) parsed = safeJsonParse(rawText);
        }

        if (!parsed) {
          console.error('WhatsApp extraction: all parse attempts failed');
          return new Response(JSON.stringify({ success: false, errorCode: 'parse_error', extracted: null }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const normalizeName = (value: any) =>
          String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const cleanName = (value: any) => {
          const str = String(value || '').replace(/\s+/g, ' ').trim();
          return str.length ? str : null;
        };

        const chooseBodyWorkerName = (bodyNames: any, headerContact: string | null) => {
          const headerNorm = normalizeName(headerContact);
          const names = Array.isArray(bodyNames)
            ? bodyNames.map(cleanName).filter(Boolean) as string[]
            : [];

          if (!names.length) return null;

          const filtered = names.filter((name) => {
            const n = normalizeName(name);
            if (!n) return false;
            if (!headerNorm) return true;
            return !(n === headerNorm || n.includes(headerNorm) || headerNorm.includes(n));
          });

          const pool = filtered.length ? filtered : names;
          const multiWord = pool.filter((name) => normalizeName(name).split(' ').filter(Boolean).length >= 2);
          return cleanName((multiWord.length ? multiWord[multiWord.length - 1] : pool[pool.length - 1]) || null);
        };

        let extracted: Record<string, any> = parsed;

        if (context === 'anticipo') {
          const headerContact = cleanName(parsed?.headerContact) || cleanName(parsed?.solicitante);
          const bodyWorker = chooseBodyWorkerName(parsed?.bodyNames, headerContact);
          const rawWorker = cleanName(parsed?.workerName);
          const rawWorkerNorm = normalizeName(rawWorker);
          const headerNorm = normalizeName(headerContact);
          const rawWorkerTokens = rawWorkerNorm.split(' ').filter(Boolean);

          let finalWorker = rawWorker;
          const isRawWorkerWeak = !rawWorker || rawWorkerTokens.length < 2 || (headerNorm && rawWorkerNorm === headerNorm);
          if (isRawWorkerWeak && bodyWorker) finalWorker = bodyWorker;

          extracted = {
            workerName: cleanName(finalWorker),
            workerNumber: cleanName(parsed?.workerNumber),
            cantidad: cleanName(parsed?.cantidad),
            solicitante: cleanName(headerContact),
          };
        }

        return new Response(JSON.stringify({ success: true, extracted }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      } catch (err: any) {
        console.error('WhatsApp extraction error:', err);
        return new Response(JSON.stringify({ success: false, errorCode: 'exception', extracted: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (action === 'sendOperativaAlta') {
      const { nombre, iban, telefono, email: workerEmail, fechaAlta: fechaAltaStr, departamento: dept, grupo: grupoStr, files: filesData, solicitante, infoAdicional, capturas, capturaBase64, capturaType } = data || {};

      if (!nombre || !filesData || filesData.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Faltan campos obligatorios (nombre y archivos)' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      // Get configured emails
      const { data: config } = await supabase
        .from('operativa_altas_config')
        .select('emails, primary_email')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const allEmails: string[] = config?.emails || [];
      const primaryEmailAddr: string | null = config?.primary_email || null;
      const toEmail = primaryEmailAddr || allEmails[0];
      if (!toEmail) {
        return new Response(JSON.stringify({ success: false, error: 'No hay emails destinatarios configurados' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const ccEmails = allEmails.filter(e => e !== toEmail);

      const htmlContent = buildAltaEmailHtml({
        nombre,
        iban,
        telefono,
        workerEmail,
        fechaAltaStr,
        dept,
        grupoStr,
        solicitante,
        infoAdicional,
        filesCount: filesData.length,
        managerName: manager.name,
      });


      // Send email via Brevo
      const BREVO_KEY_CHECK2 = Deno.env.get('BREVO_API_KEY');
      if (!BREVO_KEY_CHECK2) {
        return new Response(JSON.stringify({ success: false, error: 'Email service not configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      const subject = 'Alta - ' + nombre;

      const attachments = filesData.map((f: any) => ({
        filename: f.name,
        content: f.base64,
      }));

      const emailPayload: any = {
        from: 'Altas <altas@vnprod.app>',
        to: [toEmail],
        subject,
        html: htmlContent,
        attachments,
      };
      if (ccEmails.length > 0) {
        emailPayload.cc = ccEmails;
      }

      let emailResp: Response;
      try {
        emailResp = await sendEmailBrevo(emailPayload);
      } catch (emailErr) {
        console.error('sendEmailBrevo threw:', emailErr);
        return new Response(JSON.stringify({ success: false, error: 'Error de conexión al enviar email: ' + (emailErr as Error).message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      let emailResult: any;
      try {
        emailResult = await emailResp.json();
      } catch {
        emailResult = { message: 'No response body' };
      }
      console.log('Brevo alta response:', emailResp.status, JSON.stringify(emailResult));

      if (!emailResp.ok) {
        console.error('Alta email failed:', emailResp.status, JSON.stringify(emailResult));
        return new Response(JSON.stringify({ success: false, error: emailResult.message || 'Error sending email (status ' + emailResp.status + ')' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      // Upload WhatsApp screenshots as proof if provided
      const capturaUrls: string[] = [];
      const screenshotsToUpload = capturas || (capturaBase64 ? [{ base64: capturaBase64, fileType: capturaType }] : []);
      for (const cap of screenshotsToUpload) {
        try {
          const ext = (cap.fileType || 'image/jpeg').split('/')[1] || 'jpg';
          const capturaPath = `alta/${crypto.randomUUID()}.${ext}`;
          const binaryData = Uint8Array.from(atob(cap.base64), c => c.charCodeAt(0));
          const { error: uploadErr } = await supabase.storage
            .from('operativa-capturas')
            .upload(capturaPath, binaryData, { contentType: cap.fileType || 'image/jpeg' });
          if (!uploadErr) {
            capturaUrls.push(capturaPath);
          } else {
            console.error('Failed to upload captura:', uploadErr);
          }
        } catch (capErr) {
          console.error('Captura upload error:', capErr);
        }
      }

      // Save to history (with attachments persisted to storage so the alta can be resent silently)
      const historyId = crypto.randomUUID();
      const adjuntos: { name: string; path: string; contentType: string }[] = [];
      try {
        for (const f of filesData) {
          try {
            const safeName = String(f.name || 'archivo').replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `altas-adjuntos/${historyId}/${crypto.randomUUID()}-${safeName}`;
            const ct = f.contentType || f.type || 'application/octet-stream';
            const bytes = Uint8Array.from(atob(f.base64), c => c.charCodeAt(0));
            const { error: upErr } = await supabase.storage
              .from('operativa-capturas')
              .upload(path, bytes, { contentType: ct });
            if (!upErr) adjuntos.push({ name: f.name, path, contentType: ct });
            else console.error('Failed to persist alta adjunto:', upErr);
          } catch (e) {
            console.error('Adjunto upload error:', e);
          }
        }
      } catch (e) {
        console.error('Adjuntos persistence loop failed:', e);
      }

      try {
        const fileNamesList = filesData.map((f: any) => f.name);
        await supabase.from('operativa_envios_history').insert({
          id: historyId,
          tipo: 'alta',
          sent_by: manager.name,
          destinatarios: allEmails,
          datos: { nombre, iban, telefono, email: workerEmail, fechaAlta: fechaAltaStr, departamento: dept, grupo: grupoStr || null, archivos: fileNamesList, solicitante: solicitante || null, infoAdicional: infoAdicional || null, capturaUrls: capturaUrls.length > 0 ? capturaUrls : undefined, adjuntos: adjuntos.length > 0 ? adjuntos : undefined, primaryEmail: toEmail, ccEmails },
          email_id: emailResult.id || null,
        });
      } catch (histErr) {
        console.error('Failed to save alta history:', histErr);
      }

      return new Response(JSON.stringify({ success: true, emailId: emailResult.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ========== OPERATIVA DIARIA — Reenviar Alta desde historial (sin re-adjuntar) ==========
    if (action === 'resendAltaFromHistory') {
      const { historyId } = data || {};
      if (!historyId) {
        return new Response(JSON.stringify({ success: false, error: 'historyId requerido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      const { data: row, error: rowErr } = await supabase
        .from('operativa_envios_history')
        .select('id, tipo, destinatarios, datos')
        .eq('id', historyId)
        .maybeSingle();

      if (rowErr || !row) {
        return new Response(JSON.stringify({ success: false, error: 'Alta no encontrada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 });
      }
      if (row.tipo !== 'alta') {
        return new Response(JSON.stringify({ success: false, error: 'Tipo no soportado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      const d: any = row.datos || {};
      const adjuntosStored: { name: string; path: string; contentType?: string }[] = Array.isArray(d.adjuntos) ? d.adjuntos : [];
      if (adjuntosStored.length === 0) {
        // Old altas pre-dating attachment persistence — frontend should fall back to manual reattach.
        return new Response(JSON.stringify({ success: false, requiresReattach: true, error: 'Esta alta no tiene los documentos guardados. Vuelve a adjuntarlos.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      // Download attachments from storage and convert to base64
      const attachments: { filename: string; content: string }[] = [];
      for (const a of adjuntosStored) {
        try {
          const { data: file, error: dlErr } = await supabase.storage.from('operativa-capturas').download(a.path);
          if (dlErr || !file) {
            console.error('Failed to download alta adjunto:', a.path, dlErr);
            return new Response(JSON.stringify({ success: false, error: 'No se pudo recuperar un adjunto del alta original' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
          }
          const buf = new Uint8Array(await file.arrayBuffer());
          let binary = '';
          for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
          const base64 = btoa(binary);
          attachments.push({ filename: a.name, content: base64 });
        } catch (e) {
          console.error('Adjunto download error:', e);
          return new Response(JSON.stringify({ success: false, error: 'Error al recuperar adjuntos' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }
      }

      // Determine recipients: prefer originally-stored split, fall back to destinatarios array
      const destinatarios: string[] = Array.isArray(row.destinatarios) ? row.destinatarios : [];
      const toEmail: string = d.primaryEmail || destinatarios[0];
      const ccEmails: string[] = Array.isArray(d.ccEmails) ? d.ccEmails : destinatarios.filter((e: string) => e !== toEmail);
      if (!toEmail) {
        return new Response(JSON.stringify({ success: false, error: 'No hay destinatarios en la alta original' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      const htmlContent = buildAltaEmailHtml({
        nombre: d.nombre,
        iban: d.iban,
        telefono: d.telefono,
        workerEmail: d.email,
        fechaAltaStr: d.fechaAlta,
        dept: d.departamento,
        grupoStr: d.grupo,
        solicitante: d.solicitante,
        infoAdicional: d.infoAdicional,
        filesCount: attachments.length,
        managerName: manager.name,
      });

      const emailPayload: any = {
        from: 'Altas <altas@vnprod.app>',
        to: [toEmail],
        subject: 'Alta - ' + (d.nombre || ''),
        html: htmlContent,
        attachments,
      };
      if (ccEmails.length > 0) emailPayload.cc = ccEmails;

      let emailResp: Response;
      try {
        emailResp = await sendEmailBrevo(emailPayload);
      } catch (emailErr) {
        return new Response(JSON.stringify({ success: false, error: 'Error de conexión: ' + (emailErr as Error).message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      let emailResult: any;
      try { emailResult = await emailResp.json(); } catch { emailResult = {}; }
      console.log('Brevo alta RESEND response:', emailResp.status, JSON.stringify(emailResult));
      if (!emailResp.ok) {
        return new Response(JSON.stringify({ success: false, error: emailResult.message || 'Error reenviando email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      // Update existing row (no new alta is created)
      try {
        await supabase.from('operativa_envios_history')
          .update({ sent_at: new Date().toISOString(), email_id: emailResult.id || null, sent_by: manager.name })
          .eq('id', historyId);
      } catch (e) {
        console.error('Failed to update history on resend:', e);
      }

      return new Response(JSON.stringify({ success: true, emailId: emailResult.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }


    // ========== OPERATIVA DIARIA — Anticipos ==========
    if (action === 'getOperativaAnticiposConfig') {
      const { data: config, error } = await supabase
        .from('operativa_anticipos_config')
        .select('id, emails, primary_email')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching anticipos config:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true, emails: config?.emails || [], primary_email: config?.primary_email || null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'updateOperativaAnticiposConfig') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admin puede configurar' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }

      const rawEmails: string[] = Array.isArray(data?.emails) ? data.emails : [];
      const emails = Array.from(
        new Set(
          rawEmails
            .map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
            .filter((e) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        )
      );
      const primary_email = typeof data?.primary_email === 'string' ? data.primary_email.trim().toLowerCase() || null : null;

      const { data: existing } = await supabase
        .from('operativa_anticipos_config')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('operativa_anticipos_config')
          .update({ emails, primary_email, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('operativa_anticipos_config')
          .insert({ emails, primary_email });
      }

      return new Response(JSON.stringify({ success: true, emails, primary_email }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'sendOperativaAnticipo') {
      const { workerId: wId, workerName, workerNumber, cantidad: cantidadNum, solicitante, capturas, capturaBase64, capturaType } = data || {};

      if (!workerName || !workerNumber || !cantidadNum) {
        return new Response(JSON.stringify({ success: false, error: 'Faltan campos obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      // Get configured emails
      const { data: config } = await supabase
        .from('operativa_anticipos_config')
        .select('emails, primary_email')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const allEmails: string[] = config?.emails || [];
      const primaryEmailAddr: string | null = config?.primary_email || null;
      const toEmail = primaryEmailAddr || allEmails[0];
      if (!toEmail) {
        return new Response(JSON.stringify({ success: false, error: 'No hay emails destinatarios configurados' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const ccEmails = allEmails.filter(e => e !== toEmail);

      const accentColor = '#93d600';
      const logoUrl = 'https://vnprod.app/images/logo-white.png';
      const logoGreenUrl = 'https://vnprod.app/images/verdnatura-logo-green.png';
      const salixLink = 'https://salix.verdnatura.es/#!/worker/' + workerNumber + '/summary';
      const formattedAmount = Number(cantidadNum).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Poppins','Segoe UI',Arial,sans-serif;letter-spacing:-0.01em;">
<div style="max-width:620px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg, ${accentColor}, #7ab300);border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <img src="${logoUrl}" alt="Verdnatura" width="56" height="56" style="width:56px;height:56px;margin-bottom:12px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;font-family:'Poppins','Segoe UI',sans-serif;">Anticipo</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">Aprobación de anticipo de nómina</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;border-radius:0 0 16px 16px;">
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:${accentColor};text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Trabajador/a</p>
      <span style="display:inline-block;background:${accentColor};color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;"><a href="${salixLink}" target="_blank" style="color:#fff;text-decoration:none;">${workerName} (${workerNumber})</a> →</span>
    </div>
    <div style="line-height:1.75;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.01em;">
      <p style="margin:0 0 16px;">Se aprueba el siguiente anticipo de nómina:</p>
      <div style="padding:16px 20px;background:#f8fafc;border-radius:12px;margin:0 0 16px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Cantidad aprobada</p>
        <p style="margin:0;font-size:22px;font-weight:600;color:${accentColor};font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.02em;">${formattedAmount} €</p>
      </div>
    </div>
    <div style="margin-top:28px;line-height:1.4;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">
      <p style="margin:0 0 16px;">Muchas gracias y un saludo,</p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-right:16px;vertical-align:middle;"><img src="${logoGreenUrl}" alt="Verdnatura" width="40" height="40" style="width:40px;height:40px;display:block;"></td>
          <td style="padding-right:16px;border-right:2px solid ${accentColor};vertical-align:middle;">
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
          <td><span style="display:inline-block;background:${accentColor}18;color:${accentColor};padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">Anticipo</span></td>
          <td><span style="display:inline-block;background:#f1f5f9;color:#475569;padding:5px 10px;border-radius:8px;font-size:11px;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">${formattedAmount} €</span></td>
        </tr>
      </table>
    </div>
    <div style="margin-top:20px;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:8px;">
        <tr>
          <td style="width:3px;background:#94a3b8;border-radius:2px;"></td>
          <td style="padding-left:10px;"><span style="font-size:11px;font-weight:600;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;">Enviado desde Operativa · Verdnatura</span></td>
        </tr>
      </table>
      <p style="margin:0;font-size:11px;color:#94a3b8;font-family:'Poppins','Segoe UI',sans-serif;">Enviado por ${manager.name} · Este correo es confidencial.</p>
    </div>
  </div>
</div>
</body></html>`;

      // Send email via Brevo
      const BREVO_KEY_CHECK3 = Deno.env.get('BREVO_API_KEY');
      if (!BREVO_KEY_CHECK3) {
        return new Response(JSON.stringify({ success: false, error: 'Email service not configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      const subject = 'Anticipo - ' + workerName + ' (' + workerNumber + ')';

      const emailPayload: any = {
        from: 'Anticipos <anticipos@vnprod.app>',
        to: [toEmail],
        subject,
        html: htmlContent,
      };
      if (ccEmails.length > 0) {
        emailPayload.cc = ccEmails;
      }

      const emailResp = await sendEmailBrevo(emailPayload);

      const emailResult = await emailResp.json();
      console.log('Resend anticipo response:', emailResp.status, JSON.stringify(emailResult));

      if (!emailResp.ok) {
        return new Response(JSON.stringify({ success: false, error: emailResult.message || 'Error sending email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      // Upload WhatsApp screenshots as proof if provided
      const capturaUrls: string[] = [];
      const screenshotsToUpload = capturas || (capturaBase64 ? [{ base64: capturaBase64, fileType: capturaType }] : []);
      for (const cap of screenshotsToUpload) {
        try {
          const ext = (cap.fileType || 'image/jpeg').split('/')[1] || 'jpg';
          const capturaPath = `anticipo/${crypto.randomUUID()}.${ext}`;
          const binaryData = Uint8Array.from(atob(cap.base64), c => c.charCodeAt(0));
          const { error: uploadErr } = await supabase.storage
            .from('operativa-capturas')
            .upload(capturaPath, binaryData, { contentType: cap.fileType || 'image/jpeg' });
          if (!uploadErr) {
            capturaUrls.push(capturaPath);
          } else {
            console.error('Failed to upload captura:', uploadErr);
          }
        } catch (capErr) {
          console.error('Captura upload error:', capErr);
        }
      }

      // Save to history
      try {
        await supabase.from('operativa_envios_history').insert({
          tipo: 'anticipo',
          sent_by: manager.name,
          destinatarios: allEmails,
          datos: { workerId: wId, workerName, workerNumber, cantidad: cantidadNum, solicitante: solicitante || null, capturaUrls: capturaUrls.length > 0 ? capturaUrls : undefined },
          email_id: emailResult.id || null,
        });
      } catch (histErr) {
        console.error('Failed to save anticipo history:', histErr);
      }

      return new Response(JSON.stringify({ success: true, emailId: emailResult.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ========== OPERATIVA DIARIA — NSPP ==========
    if (action === 'getOperativaNsppConfig') {
      const { data: config, error } = await supabase
        .from('operativa_nspp_config')
        .select('id, emails, primary_email')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching nspp config:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true, emails: config?.emails || [], primary_email: config?.primary_email || null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'updateOperativaNsppConfig') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admin puede configurar' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }

      const rawEmails: string[] = Array.isArray(data?.emails) ? data.emails : [];
      const emails = Array.from(
        new Set(
          rawEmails
            .map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
            .filter((e) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        )
      );
      const primary_email = typeof data?.primary_email === 'string' ? data.primary_email.trim().toLowerCase() || null : null;

      const { data: existing } = await supabase
        .from('operativa_nspp_config')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('operativa_nspp_config')
          .update({ emails, primary_email, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('operativa_nspp_config')
          .insert({ emails, primary_email });
      }

      return new Response(JSON.stringify({ success: true, emails, primary_email }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'sendOperativaNspp') {
      const { workerId: wId, workerName, workerNumber, contexto, fecha, hora, esHoy, capturas, pruebas: pruebasData, solicitante } = data || {};

      if (!workerName || !workerNumber) {
        return new Response(JSON.stringify({ success: false, error: 'Faltan campos obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      // Get configured emails
      const { data: config } = await supabase
        .from('operativa_nspp_config')
        .select('emails, primary_email')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const allEmails: string[] = config?.emails || [];
      const primaryEmailAddr: string | null = config?.primary_email || null;
      const toEmail = primaryEmailAddr || allEmails[0];
      if (!toEmail) {
        return new Response(JSON.stringify({ success: false, error: 'No hay emails destinatarios configurados' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const ccEmails = allEmails.filter(e => e !== toEmail);

      // Build date/time text for email
      let fechaHoraText = '';
      if (fecha && esHoy) {
        fechaHoraText = hora ? `Se solicita para hoy antes de las ${hora}.` : 'Se solicita para hoy.';
      } else if (fecha) {
        fechaHoraText = hora ? `Se solicita para el ${fecha} antes de las ${hora}.` : `Se solicita para el ${fecha}.`;
      } else if (hora) {
        fechaHoraText = `Se necesita antes de las ${hora}.`;
      }

      // Generate email body
      let emailBodyText = '';
      if (contexto && contexto.trim()) {
        try {
          const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
          if (LOVABLE_API_KEY) {
            const solicitanteText = solicitante ? ` Solicitado por: ${solicitante}.` : '';
            const aiPrompt = `Redacta el cuerpo de un email informando que el trabajador ${workerName} (número ${workerNumber}) no supera el periodo de prueba (NSPP) y se solicita la extinción del contrato conforme al Art. 14.2 del Estatuto de los Trabajadores.${solicitanteText}${fechaHoraText ? ' ' + fechaHoraText : ''} Comentarios del encargado: "${contexto}". El email debe ser profesional y directo.`;
            const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
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
              emailBodyText = aiData.choices?.[0]?.message?.content || '';
            }
          }
        } catch (aiErr) {
          console.error('AI email generation error:', aiErr);
        }
      }

      if (!emailBodyText) {
        emailBodyText = `Se comunica que el/la trabajador/a ${workerName} (número de fichar: ${workerNumber}) no supera el periodo de prueba, por lo que se solicita la extinción del contrato conforme al Art. 14.2 del Estatuto de los Trabajadores.`;
        if (fechaHoraText) emailBodyText += '\n\n' + fechaHoraText;
        if (contexto && contexto.trim()) emailBodyText += '\n\nComentarios adicionales:\n' + contexto.trim();
      }

      // Upload pruebas (evidence images) BEFORE building email to include signed URLs
      const pruebasUrls: string[] = [];
      const pruebasSignedUrls: string[] = [];
      const pruebasToUpload = pruebasData || [];
      for (const prueba of pruebasToUpload) {
        try {
          const ext = (prueba.fileType || 'image/jpeg').split('/')[1] || 'jpg';
          const pruebaPath = `nspp-pruebas/${crypto.randomUUID()}.${ext}`;
          const binaryData = Uint8Array.from(atob(prueba.base64), c => c.charCodeAt(0));
          const { error: uploadErr } = await supabase.storage
            .from('operativa-capturas')
            .upload(pruebaPath, binaryData, { contentType: prueba.fileType || 'image/jpeg' });
          if (!uploadErr) {
            pruebasUrls.push(pruebaPath);
          } else {
            console.error('Failed to upload prueba:', uploadErr);
          }
        } catch (prErr) {
          console.error('Prueba upload error:', prErr);
        }
      }

      // Get signed URLs for pruebas to include in email
      if (pruebasUrls.length > 0) {
        const { data: signedData } = await supabase.storage
          .from('operativa-capturas')
          .createSignedUrls(pruebasUrls, 31536000); // 1 year
        if (signedData) {
          for (const s of signedData) {
            if (s.signedUrl) pruebasSignedUrls.push(s.signedUrl);
          }
        }
      }

      // Build pruebas HTML section for email (matching incidencias style)
      const pruebasHtml = pruebasSignedUrls.length > 0
        ? `<div style="margin-top:20px;padding:16px;background:#fffbeb;border-radius:12px;border:1px solid #d9770630;">
          <p style="margin:0 0 12px;font-weight:600;font-size:13px;color:#92400e;font-family:'Poppins','Segoe UI',sans-serif;">Pruebas adjuntas (${pruebasSignedUrls.length})</p>
          <div style="overflow:hidden;font-size:0;">
          ${pruebasSignedUrls.map((url, i) => `<a href="${url}" target="_blank" style="text-decoration:none;"><img src="${url}" alt="Evidencia ${i+1}" style="display:inline-block;width:30%;max-width:180px;height:auto;max-height:150px;border-radius:8px;border:1px solid #d9770640;object-fit:cover;margin:0 8px 8px 0;cursor:pointer;"></a>`).join('')}
          </div></div>`
        : '';

      const nsppAccentColor = '#d97706';
      const logoUrl = 'https://vnprod.app/images/logo-white.png';
      const logoGreenUrl = 'https://vnprod.app/images/verdnatura-logo-green.png';
      const salixLink = 'https://salix.verdnatura.es/#!/worker/' + workerNumber;
      const bodyHtml = emailBodyText.replace(/\n/g, '<br>');

      const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Poppins','Segoe UI',Arial,sans-serif;letter-spacing:-0.01em;">
<div style="max-width:620px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg, ${nsppAccentColor}, #b45309);border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <img src="${logoUrl}" alt="Verdnatura" width="56" height="56" style="width:56px;height:56px;margin-bottom:12px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;font-family:'Poppins','Segoe UI',sans-serif;">NSPP</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">No Supera Periodo de Prueba</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;border-radius:0 0 16px 16px;">
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:${nsppAccentColor};text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Trabajador/a</p>
      <span style="display:inline-block;background:${nsppAccentColor};color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;"><a href="${salixLink}" target="_blank" style="color:#fff;text-decoration:none;">${workerName} (${workerNumber})</a> →</span>
    </div>
    <div style="line-height:1.75;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.01em;">
      <div style="padding:16px 20px;background:#fffbeb;border-radius:12px;border:1px solid #fde68a;margin:0 0 16px;">
        ${fechaHoraText ? `<p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Plazo</p>
        <p style="margin:0 0 14px;font-size:14px;color:#1a1a1a;font-family:'Poppins','Segoe UI',sans-serif;">${fechaHoraText}</p>` : ''}
        ${solicitante ? `<p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Solicitado por</p>
        <p style="margin:0;font-size:14px;color:#1a1a1a;font-family:'Poppins','Segoe UI',sans-serif;">${solicitante}</p>` : ''}
      </div>
      <div style="padding:15px;background:#f8fafc;border-radius:12px;margin:16px 0;white-space:pre-wrap;">${bodyHtml}</div>
    </div>
    ${pruebasHtml}
    <div style="margin-top:28px;line-height:1.4;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">
      <p style="margin:0 0 16px;">Muchas gracias y un saludo,</p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-right:16px;vertical-align:middle;"><img src="${logoGreenUrl}" alt="Verdnatura" width="40" height="40" style="width:40px;height:40px;display:block;"></td>
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
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:8px;">
        <tr>
          <td style="width:3px;background:${nsppAccentColor};border-radius:2px;"></td>
          <td style="padding-left:10px;"><span style="font-size:11px;font-weight:600;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;">Enviado desde Operativa · Verdnatura</span></td>
        </tr>
      </table>
      <p style="margin:0;font-size:11px;color:#94a3b8;font-family:'Poppins','Segoe UI',sans-serif;">Enviado por ${solicitante || manager.name} · Este correo es confidencial.</p>
    </div>
  </div>
</div>
</body></html>`;

      // Send email via Brevo
      const BREVO_KEY_CHECK4 = Deno.env.get('BREVO_API_KEY');
      if (!BREVO_KEY_CHECK4) {
        return new Response(JSON.stringify({ success: false, error: 'Email service not configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      const subject = 'NSPP - ' + workerName + ' (' + workerNumber + ')';

      const emailPayload: any = {
        from: 'NSPP <nspp@vnprod.app>',
        to: [toEmail],
        subject,
        html: htmlContent,
      };
      if (ccEmails.length > 0) {
        emailPayload.cc = ccEmails;
      }

      const emailResp = await sendEmailBrevo(emailPayload);

      const emailResult = await emailResp.json();
      console.log('Resend nspp response:', emailResp.status, JSON.stringify(emailResult));

      if (!emailResp.ok) {
        return new Response(JSON.stringify({ success: false, error: emailResult.message || 'Error sending email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      // Upload WhatsApp screenshots as proof
      const capturaUrls: string[] = [];
      const screenshotsToUpload = capturas || [];
      for (const cap of screenshotsToUpload) {
        try {
          const ext = (cap.fileType || 'image/jpeg').split('/')[1] || 'jpg';
          const capturaPath = `nspp/${crypto.randomUUID()}.${ext}`;
          const binaryData = Uint8Array.from(atob(cap.base64), c => c.charCodeAt(0));
          const { error: uploadErr } = await supabase.storage
            .from('operativa-capturas')
            .upload(capturaPath, binaryData, { contentType: cap.fileType || 'image/jpeg' });
          if (!uploadErr) capturaUrls.push(capturaPath);
          else console.error('Failed to upload captura:', uploadErr);
        } catch (capErr) {
          console.error('Captura upload error:', capErr);
        }
      }

      // Save to history
      try {
        await supabase.from('operativa_envios_history').insert({
          tipo: 'nspp',
          sent_by: manager.name,
          destinatarios: allEmails,
          datos: { workerId: wId, workerName, workerNumber, contexto: contexto || null, fecha: fecha || null, hora: hora || null, solicitante: solicitante || null, capturaUrls: capturaUrls.length > 0 ? capturaUrls : undefined, pruebasUrls: pruebasUrls.length > 0 ? pruebasUrls : undefined },
          email_id: emailResult.id || null,
        });
      } catch (histErr) {
        console.error('Failed to save nspp history:', histErr);
      }

      return new Response(JSON.stringify({ success: true, emailId: emailResult.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ========== OPERATIVA DIARIA — Despidos ==========
    if (action === 'getOperativaDespidosConfig') {
      const { data: config, error } = await supabase
        .from('operativa_despidos_config')
        .select('id, emails, primary_email')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching despidos config:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true, emails: config?.emails || [], primary_email: config?.primary_email || null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'updateOperativaDespidosConfig') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admin puede configurar' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }

      const rawEmails: string[] = Array.isArray(data?.emails) ? data.emails : [];
      const emails = Array.from(
        new Set(
          rawEmails
            .map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
            .filter((e) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        )
      );
      const primary_email = typeof data?.primary_email === 'string' ? data.primary_email.trim().toLowerCase() || null : null;

      const { data: existing } = await supabase
        .from('operativa_despidos_config')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('operativa_despidos_config')
          .update({ emails, primary_email, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('operativa_despidos_config')
          .insert({ emails, primary_email });
      }

      return new Response(JSON.stringify({ success: true, emails, primary_email }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'sendOperativaDespido') {
      const { workerId: wId, workerName, workerNumber, contexto, capturas } = data || {};

      if (!workerName || !workerNumber) {
        return new Response(JSON.stringify({ success: false, error: 'Faltan campos obligatorios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      // Get configured emails
      const { data: config } = await supabase
        .from('operativa_despidos_config')
        .select('emails, primary_email')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const allEmails: string[] = config?.emails || [];
      const primaryEmailAddr: string | null = config?.primary_email || null;
      const toEmail = primaryEmailAddr || allEmails[0];
      if (!toEmail) {
        return new Response(JSON.stringify({ success: false, error: 'No hay emails destinatarios configurados' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const ccEmails = allEmails.filter(e => e !== toEmail);

      // Generate email body - use AI if context provided
      let emailBodyText = '';
      if (contexto && contexto.trim()) {
        try {
          const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
          if (LOVABLE_API_KEY) {
            const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-3-flash-preview',
                messages: [
                  { role: 'system', content: 'Eres un asistente de RRHH de la empresa Verdnatura. Redacta emails profesionales, formales y concisos en español. No incluyas asunto, saludo ni despedida. Solo el cuerpo del mensaje explicando la solicitud de despido.' },
                  { role: 'user', content: `Redacta el cuerpo de un email solicitando el despido del trabajador ${workerName} (número ${workerNumber}). Contexto proporcionado por el encargado: "${contexto}". El email debe ser profesional y directo.` },
                ],
              }),
            });

            if (aiResp.ok) {
              const aiData = await aiResp.json();
              emailBodyText = aiData.choices?.[0]?.message?.content || '';
            }
          }
        } catch (aiErr) {
          console.error('AI email generation error:', aiErr);
        }
      }

      if (!emailBodyText) {
        emailBodyText = `Se solicita el despido del trabajador ${workerName} (número de fichar: ${workerNumber}).`;
        if (contexto && contexto.trim()) {
          emailBodyText += `\n\nMotivo / Información adicional:\n${contexto.trim()}`;
        }
      }

      const despidoAccentColor = '#dc2626';
      const logoUrl = 'https://vnprod.app/images/logo-white.png';
      const logoGreenUrl = 'https://vnprod.app/images/verdnatura-logo-green.png';
      const salixLink = 'https://salix.verdnatura.es/#!/worker/' + workerNumber;
      const bodyHtml = emailBodyText.replace(/\n/g, '<br>');

      const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Poppins','Segoe UI',Arial,sans-serif;letter-spacing:-0.01em;">
<div style="max-width:620px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg, ${despidoAccentColor}, #b91c1c);border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <img src="${logoUrl}" alt="Verdnatura" width="56" height="56" style="width:56px;height:56px;margin-bottom:12px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;font-family:'Poppins','Segoe UI',sans-serif;">Solicitud de Despido</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">Comunicación urgente</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;border-radius:0 0 16px 16px;">
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:${despidoAccentColor};text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins','Segoe UI',sans-serif;">Trabajador/a</p>
      <span style="display:inline-block;background:${despidoAccentColor};color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;"><a href="${salixLink}" target="_blank" style="color:#fff;text-decoration:none;">${workerName} (${workerNumber})</a> →</span>
    </div>
    <div style="line-height:1.75;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;letter-spacing:-0.01em;">
      <div style="padding:15px;background:#fef2f2;border-radius:12px;margin:0 0 16px;white-space:pre-wrap;">${bodyHtml}</div>
    </div>
    <div style="margin-top:28px;line-height:1.4;color:#334155;font-size:14px;font-weight:400;font-family:'Poppins','Segoe UI',sans-serif;">
      <p style="margin:0 0 16px;">Muchas gracias y un saludo,</p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-right:16px;vertical-align:middle;"><img src="${logoGreenUrl}" alt="Verdnatura" width="40" height="40" style="width:40px;height:40px;display:block;"></td>
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
          <td><span style="display:inline-block;background:${despidoAccentColor}18;color:${despidoAccentColor};padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;font-family:'Poppins','Segoe UI',sans-serif;white-space:nowrap;">Despido</span></td>
        </tr>
      </table>
    </div>
    <div style="margin-top:20px;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:8px;">
        <tr>
          <td style="width:3px;background:${despidoAccentColor};border-radius:2px;"></td>
          <td style="padding-left:10px;"><span style="font-size:11px;font-weight:600;color:#64748b;font-family:'Poppins','Segoe UI',sans-serif;">Enviado desde Operativa · Verdnatura</span></td>
        </tr>
      </table>
      <p style="margin:0;font-size:11px;color:#94a3b8;font-family:'Poppins','Segoe UI',sans-serif;">Enviado por ${manager.name} · Este correo es confidencial.</p>
    </div>
  </div>
</div>
</body></html>`;

      // Send email via Brevo
      const BREVO_KEY_CHECK5 = Deno.env.get('BREVO_API_KEY');
      if (!BREVO_KEY_CHECK5) {
        return new Response(JSON.stringify({ success: false, error: 'Email service not configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      const subject = 'Despido - ' + workerName + ' (' + workerNumber + ')';

      const emailPayload: any = {
        from: 'Despidos <despidos@vnprod.app>',
        to: [toEmail],
        subject,
        html: htmlContent,
      };
      if (ccEmails.length > 0) {
        emailPayload.cc = ccEmails;
      }

      const emailResp = await sendEmailBrevo(emailPayload);

      const emailResult = await emailResp.json();
      console.log('Resend despido response:', emailResp.status, JSON.stringify(emailResult));

      if (!emailResp.ok) {
        return new Response(JSON.stringify({ success: false, error: emailResult.message || 'Error sending email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      // Upload WhatsApp screenshots as proof
      const capturaUrls: string[] = [];
      const screenshotsToUpload = capturas || [];
      for (const cap of screenshotsToUpload) {
        try {
          const ext = (cap.fileType || 'image/jpeg').split('/')[1] || 'jpg';
          const capturaPath = `despido/${crypto.randomUUID()}.${ext}`;
          const binaryData = Uint8Array.from(atob(cap.base64), c => c.charCodeAt(0));
          const { error: uploadErr } = await supabase.storage
            .from('operativa-capturas')
            .upload(capturaPath, binaryData, { contentType: cap.fileType || 'image/jpeg' });
          if (!uploadErr) capturaUrls.push(capturaPath);
          else console.error('Failed to upload captura:', uploadErr);
        } catch (capErr) {
          console.error('Captura upload error:', capErr);
        }
      }

      // Save to history
      try {
        await supabase.from('operativa_envios_history').insert({
          tipo: 'despido',
          sent_by: manager.name,
          destinatarios: allEmails,
          datos: { workerId: wId, workerName, workerNumber, contexto: contexto || null, capturaUrls: capturaUrls.length > 0 ? capturaUrls : undefined },
          email_id: emailResult.id || null,
        });
      } catch (histErr) {
        console.error('Failed to save despido history:', histErr);
      }

      return new Response(JSON.stringify({ success: true, emailId: emailResult.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'getOperativaHistory') {
      const tipo = data?.tipo || 'justificante';
      const limit = Math.min(data?.limit || 500, 2000);

      const { data: rows, error } = await supabase
        .from('operativa_envios_history')
        .select('*')
        .eq('tipo', tipo)
        .order('sent_at', { ascending: false })
        .limit(limit);

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      return new Response(JSON.stringify({ success: true, history: rows || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'deleteOperativaHistory') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admin puede eliminar' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }

      const id = data?.id;
      if (!id) {
        return new Response(JSON.stringify({ success: false, error: 'ID requerido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      const { error } = await supabase
        .from('operativa_envios_history')
        .delete()
        .eq('id', id);

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    /* ── importSalixClock ── */
    if (action === 'importSalixClock') {
      const entries = data?.entries;
      if (!Array.isArray(entries) || entries.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'No entries provided' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      const batchId = data?.batchId || crypto.randomUUID();

      // Get all workers for matching
      const { data: allWorkers } = await supabase
        .from('workers')
        .select('id, worker_number');
      const workerMap = new Map((allWorkers || []).map((w: any) => [w.worker_number, w.id]));

      const toUpsert = entries.map((e: any) => ({
        worker_number: String(e.worker_number),
        worker_name: e.worker_name || '',
        department_name: e.department_name || '',
        punch_date: e.punch_date,
        punch_time: e.punch_time,
        direction: e.direction,
        worker_id: workerMap.get(String(e.worker_number)) || null,
        import_batch_id: batchId,
      }));

      // Upsert in chunks of 500
      let imported = 0;
      let errors = 0;
      for (let i = 0; i < toUpsert.length; i += 500) {
        const chunk = toUpsert.slice(i, i + 500);
        const { error } = await supabase
          .from('salix_clock_entries')
          .upsert(chunk, { onConflict: 'worker_number,punch_date,punch_time', ignoreDuplicates: false });
        if (error) {
          console.error('Upsert chunk error:', error.message);
          errors += chunk.length;
        } else {
          imported += chunk.length;
        }
      }

      const matched = toUpsert.filter((e: any) => e.worker_id).length;
      const unmatched = toUpsert.length - matched;

      return new Response(JSON.stringify({
        success: true,
        imported,
        errors,
        matched,
        unmatched,
        batchId,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    /* ── getSalixClockEntries ── */
    if (action === 'getSalixClockEntries') {
      const { punchDate, departmentName } = data || {};
      if (!punchDate) {
        return new Response(JSON.stringify({ success: false, error: 'punchDate required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      let query = supabase
        .from('salix_clock_entries')
        .select('*')
        .eq('punch_date', punchDate)
        .order('worker_name')
        .order('punch_time', { ascending: true });

      if (departmentName && departmentName !== 'all') {
        query = query.eq('department_name', departmentName);
      }

      const { data: entries, error } = await query;
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      // Get unique dates available
      const { data: dates } = await supabase
        .from('salix_clock_entries')
        .select('punch_date')
        .order('punch_date', { ascending: false })
        .limit(100);

      const uniqueDates = [...new Set((dates || []).map((d: any) => d.punch_date))];

      // Get unique departments
      const { data: depts } = await supabase
        .from('salix_clock_entries')
        .select('department_name')
        .eq('punch_date', punchDate);
      const uniqueDepts = [...new Set((depts || []).map((d: any) => d.department_name))].sort();

      return new Response(JSON.stringify({
        success: true,
        entries: entries || [],
        availableDates: uniqueDates,
        availableDepartments: uniqueDepts,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    /* ── getSalixAvailableDates ── */
    if (action === 'getSalixAvailableDates') {
      const { data: dates } = await supabase
        .from('salix_clock_entries')
        .select('punch_date')
        .order('punch_date', { ascending: false })
        .limit(1000);

      const uniqueDates = [...new Set((dates || []).map((d: any) => d.punch_date))];

      return new Response(JSON.stringify({ success: true, dates: uniqueDates }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'syncEmailsToIncidencias') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Solo admin' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
      }

      const rawEmails: string[] = Array.isArray(data?.emails) ? data.emails : [];
      const emails = Array.from(
        new Set(
          rawEmails
            .map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
            .filter((e) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        )
      );
      const primary_email = typeof data?.primary_email === 'string' ? data.primary_email.trim().toLowerCase() || null : null;

      // Delete all existing incidencias email configs
      const { error: delErr } = await supabase
        .from('incidencias_email_config')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows

      if (delErr) {
        console.error('Error clearing incidencias_email_config:', delErr);
        return new Response(JSON.stringify({ success: false, error: delErr.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      // Insert new emails
      if (emails.length > 0) {
        const rows = emails.map((email) => ({
          email,
          activo: true,
          is_primary: email === primary_email,
        }));
        const { error: insErr } = await supabase
          .from('incidencias_email_config')
          .insert(rows);
        if (insErr) {
          console.error('Error inserting incidencias_email_config:', insErr);
          return new Response(JSON.stringify({ success: false, error: insErr.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }
      }

      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Update worker email directly
    if (action === 'updateWorkerEmail') {
      const { workerId, email } = data;
      if (!workerId) {
        return new Response(JSON.stringify({ success: false, error: 'Worker ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const { error: updateErr } = await supabase
        .from('workers')
        .update({ email: email || null })
        .eq('id', workerId);
      if (updateErr) {
        console.error('Error updating worker email:', updateErr);
        return new Response(JSON.stringify({ success: false, error: updateErr.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ===== APPLICATIONS (Candidaturas) =====
    if (action === 'list_applications') {
      const {
        page = 0,
        pageSize = 50,
        showRejected = false,
        showErrors = false,
        statusFilter = 'all',
        search = '',
      } = data || {};

      let query = supabase
        .from('applications')
        .select('*, job_positions(title, department_id)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (!showRejected) query = query.not('ai_status', 'eq', 'rejected');
      if (showErrors) query = query.eq('ai_status', 'error');
      if (statusFilter !== 'all') query = query.eq('admin_status', statusFilter);
      if (search?.trim()) {
        const s = search.trim().replace(/[,()]/g, '');
        query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%`);
      }

      // Non-admin/consulta: filter by their departments via job_positions.department_id
      if (!isAdmin && manager.role !== 'consulta') {
        let deptIds: string[] = [];
        const mgr = manager as any;
        if (mgr.role === 'responsable' && mgr.worker_team_id) {
          const { data: team } = await supabase
            .from('worker_teams')
            .select('department_id')
            .eq('id', mgr.worker_team_id)
            .single();
          if (team?.department_id) deptIds = [team.department_id];
        } else {
          const { data: assignments } = await supabase
            .from('manager_department_assignments')
            .select('department_id')
            .eq('manager_id', manager.id);
          deptIds = assignments?.map((a: any) => a.department_id) || [];
        }
        if (deptIds.length === 0) {
          return new Response(JSON.stringify({ success: true, applications: [], total: 0 }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Get job positions in those departments
        const { data: jps } = await supabase
          .from('job_positions')
          .select('id')
          .in('department_id', deptIds);
        const jpIds = (jps || []).map((j: any) => j.id);
        if (jpIds.length === 0) {
          return new Response(JSON.stringify({ success: true, applications: [], total: 0 }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        query = query.in('job_position_id', jpIds);
      }

      const { data: apps, error: appsErr, count } = await query;
      if (appsErr) {
        return new Response(JSON.stringify({ success: false, error: appsErr.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true, applications: apps || [], total: count || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'update_application') {
      const { id, admin_status, admin_notes } = data || {};
      if (!id) {
        return new Response(JSON.stringify({ success: false, error: 'ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const payload: any = {};
      if (admin_status !== undefined) payload.admin_status = admin_status;
      if (admin_notes !== undefined) payload.admin_notes = admin_notes;
      const { error: upErr } = await supabase.from('applications').update(payload).eq('id', id);
      if (upErr) {
        return new Response(JSON.stringify({ success: false, error: upErr.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'get_cv_signed_url') {
      const { path } = data || {};
      if (!path) {
        return new Response(JSON.stringify({ success: false, error: 'path required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const { data: signed, error: signErr } = await supabase.storage.from('cvs').createSignedUrl(path, 300);
      if (signErr || !signed) {
        return new Response(JSON.stringify({ success: false, error: signErr?.message || 'Error' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true, signedUrl: signed.signedUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ===== JOB POSITIONS (Vacantes) CRUD =====
    if (action === 'list_job_positions') {
      let query = supabase
        .from('job_positions')
        .select('*, applications(count)')
        .order('created_at', { ascending: false });

      // For non-admin/consulta managers, filter by their departments
      if (!isAdmin && manager.role !== 'consulta') {
        // Get manager's department assignments
        let deptIds: string[] = [];
        const mgr = manager as any;
        if (mgr.role === 'responsable' && mgr.worker_team_id) {
          const { data: team } = await supabase
            .from('worker_teams')
            .select('department_id')
            .eq('id', mgr.worker_team_id)
            .single();
          if (team?.department_id) deptIds = [team.department_id];
        } else {
          const { data: assignments } = await supabase
            .from('manager_department_assignments')
            .select('department_id')
            .eq('manager_id', manager.id);
          deptIds = assignments?.map((a: any) => a.department_id) || [];
        }
        if (deptIds.length === 0) {
          return new Response(JSON.stringify({ success: true, positions: [] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        query = query.in('department_id', deptIds);
      }

      const { data: positions, error: listErr } = await query;
      if (listErr) {
        return new Response(JSON.stringify({ success: false, error: listErr.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true, positions }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'create_job_position') {
      const { title, description, criteria, department_id } = data;
      if (!title?.trim()) {
        return new Response(JSON.stringify({ success: false, error: 'Title required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const insertPayload: any = { title: title.trim(), description: description?.trim() || '', criteria: criteria || {} };
      if (department_id) insertPayload.department_id = department_id;
      const { data: created, error: createErr } = await supabase
        .from('job_positions')
        .insert(insertPayload)
        .select()
        .single();
      if (createErr) {
        return new Response(JSON.stringify({ success: false, error: createErr.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      await logAudit('create', 'job_position', created.id, created, `Vacante creada: ${title}`);
      return new Response(JSON.stringify({ success: true, position: created }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'update_job_position') {
      const { id, title, description, criteria, department_id } = data;
      if (!id) {
        return new Response(JSON.stringify({ success: false, error: 'ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const updatePayload: any = {};
      if (title !== undefined) updatePayload.title = title.trim();
      if (description !== undefined) updatePayload.description = description.trim();
      if (criteria !== undefined) updatePayload.criteria = criteria;
      if (department_id !== undefined) updatePayload.department_id = department_id;
      const { error: updateErr } = await supabase
        .from('job_positions')
        .update(updatePayload)
        .eq('id', id);
      if (updateErr) {
        return new Response(JSON.stringify({ success: false, error: updateErr.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      await logAudit('update', 'job_position', id, updatePayload, `Vacante actualizada: ${title || id}`);
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'set_default_job_position') {
      const { id } = data;
      if (!id) {
        return new Response(JSON.stringify({ success: false, error: 'ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      // Clear all defaults first, then set this one
      const { error: clearErr } = await supabase
        .from('job_positions')
        .update({ is_default: false })
        .eq('is_default', true);
      if (clearErr) {
        return new Response(JSON.stringify({ success: false, error: clearErr.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      const { error: setErr } = await supabase
        .from('job_positions')
        .update({ is_default: true })
        .eq('id', id);
      if (setErr) {
        return new Response(JSON.stringify({ success: false, error: setErr.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      await logAudit('update', 'job_position', id, { is_default: true }, `Vacante marcada como predeterminada`);
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'toggle_job_position') {
      const { id, is_active } = data;
      if (!id) {
        return new Response(JSON.stringify({ success: false, error: 'ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const { error: toggleErr } = await supabase
        .from('job_positions')
        .update({ is_active: !is_active })
        .eq('id', id);
      if (toggleErr) {
        return new Response(JSON.stringify({ success: false, error: toggleErr.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'delete_job_position') {
      const { id } = data;
      if (!id) {
        return new Response(JSON.stringify({ success: false, error: 'ID required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const { error: delErr } = await supabase
        .from('job_positions')
        .delete()
        .eq('id', id);
      if (delErr) {
        return new Response(JSON.stringify({ success: false, error: delErr.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      await logAudit('delete', 'job_position', id, null, `Vacante eliminada`);
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'getWorkersByIds') {
      const { workerIds } = data;
      if (!workerIds || !Array.isArray(workerIds) || workerIds.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'workerIds required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
      const { data: wkrs, error: wkrErr } = await supabase
        .from('workers')
        .select('id, name, worker_number, worker_team_id, work_group_id, department_id')
        .in('id', workerIds.slice(0, 50));
      if (wkrErr) {
        return new Response(JSON.stringify({ success: false, error: wkrErr.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }
      return new Response(JSON.stringify({ success: true, workers: wkrs || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Unknown action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  } catch (error) {
    console.error('Admin operations error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
