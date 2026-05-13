import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

async function sendEmailBrevo(params: { from: string; to: string | string[]; subject: string; html: string }): Promise<Response> {
  const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_KEY) throw new Error('RESEND_API_KEY not configured');
  const toArr = Array.isArray(params.to) ? params.to : [params.to];
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: params.from, to: toArr, subject: params.subject, html: params.html }),
  });
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const errorResponse = (message: string, status = 200) => {
  // Return 200 with error field to ensure client receives the message
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
};

// Hash password with SHA-256 (for sync with justificantes tool)
async function hashPasswordSha256(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Send welcome email using Brevo
const sendWelcomeEmail = async (email: string, workerName: string) => {
  const brevoApiKey = Deno.env.get("BREVO_API_KEY");
  if (!brevoApiKey) {
    console.log("BREVO_API_KEY not configured, skipping welcome email");
    return;
  }

  try {
    const verdnaturaGreen = "#93d600";
    const logoWhiteUrl = "https://vnprod.app/images/logo-white.png";
    const logoImgTag = `<img src="${logoWhiteUrl}" alt="Verdnatura" width="80" height="80" class="logo-img" style="width: 80px; height: 80px; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;">`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, ${verdnaturaGreen} 0%, #7ab300 100%); padding: 40px 20px; text-align: center; }
          .logo-img { width: 80px; height: 80px; margin-bottom: 15px; }
          .header-title { color: #ffffff; font-size: 24px; font-weight: 600; margin: 0; letter-spacing: -0.5px; }
          .content { padding: 40px 30px; }
          .title { color: #1a1a1a; font-size: 20px; font-weight: 600; margin-bottom: 20px; letter-spacing: -0.3px; }
          .text { color: #666666; font-size: 15px; line-height: 1.7; margin-bottom: 15px; font-weight: 400; letter-spacing: -0.2px; }
          .success-box { background-color: #f0fdf4; border-left: 4px solid ${verdnaturaGreen}; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0; }
          .info-label { color: #1a1a1a; font-weight: 600; font-size: 13px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          .feature-list { list-style: none; padding: 0; margin: 0; }
          .feature-list li { padding: 8px 0; color: #333333; font-size: 14px; display: flex; align-items: center; gap: 10px; }
          .feature-list li:before { content: "✓"; color: ${verdnaturaGreen}; font-weight: bold; }
          .footer { background-color: #1a1a1a; color: #ffffff; padding: 30px; text-align: center; }
          .footer-text { color: #888888; font-size: 12px; font-weight: 400; letter-spacing: -0.2px; margin: 5px 0; }
        </style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header">
            ${logoImgTag}
            <h1 class="header-title">¡Bienvenido a Verdnatura!</h1>
          </div>
          <div class="content">
            <p class="title">Hola ${workerName},</p>
            <p class="text">Tu cuenta ha sido creada correctamente. Ahora puedes acceder al formulario de vacaciones usando tu número de fichar y la contraseña que has establecido.</p>
            
            <div class="success-box">
              <div class="info-label">Con tu cuenta podrás:</div>
              <ul class="feature-list">
                <li>Solicitar tus días de vacaciones</li>
                <li>Ver el calendario anual de tu departamento</li>
                <li>Consultar los grupos de vacaciones</li>
              </ul>
            </div>
            
            <p class="text">Si tienes alguna duda, contacta con tu responsable de departamento.</p>
            <p class="text" style="color: ${verdnaturaGreen}; font-weight: 500;">¡Gracias por formar parte del equipo!</p>
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de vacaciones de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const response = await sendEmailBrevo({
      from: "Vacaciones Verdnatura <vacaciones@vnprod.app>",
      to: [email],
      subject: "¡Bienvenido! Tu cuenta ha sido creada",
      html: htmlContent,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Resend API error:", errorText);
    } else {
      console.log(`Welcome email sent to ${email}`);
    }
  } catch (error) {
    console.error("Error sending welcome email:", error);
    // Don't fail registration if email fails
  }
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, ...params } = await req.json();
    console.log(`Worker auth action: ${action}`);

    // Check if worker is registered (has user_id)
    if (action === 'checkRegistration') {
      const { workerId } = params;
      
      const { data: worker, error } = await supabase
        .from('workers')
        .select('id, name, email, user_id')
        .eq('id', workerId)
        .single();

      if (error || !worker) {
        return errorResponse('Worker not found');
      }

      // SECURITY: Do not return full email or full name to unauthenticated callers.
      // Provide a masked email hint so the UI can confirm which account is being used
      // without exposing the full address to anyone able to guess a worker UUID.
      const maskEmail = (e: string | null | undefined): string | null => {
        if (!e || typeof e !== 'string') return null;
        const [local, domain] = e.split('@');
        if (!local || !domain) return null;
        const visible = local.slice(0, 1);
        const maskedLocal = visible + '***';
        const domainParts = domain.split('.');
        const tld = domainParts.length > 1 ? '.' + domainParts.slice(1).join('.') : '';
        const domainName = domainParts[0] || '';
        const maskedDomain = (domainName.slice(0, 1) || '') + '***' + tld;
        return `${maskedLocal}@${maskedDomain}`;
      };

      return new Response(JSON.stringify({
        isRegistered: !!worker.user_id,
        hasEmail: !!worker.email,
        // Keep workerName for backwards UI compatibility but only return first name token.
        workerName: (worker.name || '').split(' ')[0] || null,
        workerEmailMasked: maskEmail(worker.email)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Register worker (create auth user and link)
    if (action === 'register') {
      const { workerId, email, password } = params;

      // Validate inputs
      if (!workerId || !email || !password) {
        return errorResponse('Faltan campos obligatorios');
      }

      if (password.length < 8) {
        return errorResponse('La contraseña debe tener al menos 8 caracteres');
      }

      // Get worker
      const { data: worker, error: workerError } = await supabase
        .from('workers')
        .select('id, name, user_id, department_id')
        .eq('id', workerId)
        .single();

      if (workerError || !worker) {
        return errorResponse('Trabajador no encontrado');
      }

      if (worker.user_id) {
        return errorResponse('Este trabajador ya tiene una cuenta registrada');
      }

      // Check if email is already used by another worker in our workers table
      const { data: existingWorker } = await supabase
        .from('workers')
        .select('id')
        .eq('email', email)
        .neq('id', workerId)
        .single();

      if (existingWorker) {
        return errorResponse('Este email ya está siendo usado por otro trabajador');
      }

      // Check if email already exists in auth.users
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const emailExists = existingUsers?.users?.some(u => u.email?.toLowerCase() === email.toLowerCase());
      
      if (emailExists) {
        return errorResponse('Este email ya está registrado en el sistema. Usa otro email o contacta con el administrador.');
      }

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          worker_id: workerId,
          worker_name: worker.name,
          department_id: worker.department_id
        }
      });

      if (authError) {
        console.error('Auth error:', authError);
        if (authError.message.includes('already been registered') || authError.code === 'email_exists') {
          return errorResponse('Este email ya está registrado. Usa otro email diferente.');
        }
        return errorResponse('Error al crear la cuenta: ' + authError.message);
      }

      // Link auth user to worker, update email, and save SHA-256 hash for justificantes sync
      const passwordHash = await hashPasswordSha256(password);
      const { error: updateError } = await supabase
        .from('workers')
        .update({ 
          user_id: authData.user.id,
          email: email,
          password_hash: passwordHash
        })
        .eq('id', workerId);

      if (updateError) {
        console.error('Update error:', updateError);
        // Rollback: delete the created auth user
        await supabase.auth.admin.deleteUser(authData.user.id);
        return errorResponse('Error al vincular la cuenta');
      }

      console.log(`Worker ${workerId} registered successfully with user ${authData.user.id}`);

      // Send welcome email (non-blocking)
      sendWelcomeEmail(email, worker.name);

      return new Response(JSON.stringify({
        success: true,
        message: 'Cuenta creada correctamente'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Login worker
    if (action === 'login') {
      const { workerId, password } = params;
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

      // SECURITY: Rate limiting - check failed attempts in last 15 minutes
      const MAX_ATTEMPTS = 5;
      const LOCKOUT_MINUTES = 15;
      const cutoffTime = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000).toISOString();
      const identifier = `worker_${workerId}`;

      const { count: failedCount } = await supabase
        .from('login_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_identifier', identifier)
        .eq('success', false)
        .gte('attempted_at', cutoffTime);

      if ((failedCount || 0) >= MAX_ATTEMPTS) {
        return new Response(JSON.stringify({
          success: false,
          error: `Demasiados intentos fallidos. Espera ${LOCKOUT_MINUTES} minutos.`,
          locked: true,
          lockoutMinutes: LOCKOUT_MINUTES,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get worker with user_id and role
      const { data: worker, error: workerError } = await supabase
        .from('workers')
        .select('id, name, email, user_id, department_id, role')
        .eq('id', workerId)
        .single();

      if (workerError || !worker) {
        return errorResponse('Trabajador no encontrado');
      }

      if (!worker.user_id || !worker.email) {
        return errorResponse('El trabajador no está registrado');
      }

      // Attempt login with email and password
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: worker.email,
        password
      });

      if (authError) {
        // Record failed attempt
        await supabase.from('login_attempts').insert({
          user_identifier: identifier,
          ip_address: clientIp,
          success: false,
        });
        const remaining = Math.max(0, MAX_ATTEMPTS - (failedCount || 0) - 1);
        console.error('Login error:', authError);
        return new Response(JSON.stringify({
          success: false,
          error: 'Contraseña incorrecta',
          remainingAttempts: remaining,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Record successful attempt
      await supabase.from('login_attempts').insert({
        user_identifier: identifier,
        ip_address: clientIp,
        success: true,
      });

      // Verify this auth user is linked to this worker
      if (authData.user.id !== worker.user_id) {
        return errorResponse('Error de vinculación de cuenta');
      }

      const isWorkerAdmin = worker.role === 'admin';
      console.log(`Worker ${workerId} logged in successfully (admin: ${isWorkerAdmin})`);

      return new Response(JSON.stringify({
        success: true,
        session: authData.session,
        worker: {
          id: worker.id,
          name: worker.name,
          email: worker.email,
          departmentId: worker.department_id,
          isAdmin: isWorkerAdmin
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Request password reset (send email)
    if (action === 'requestPasswordReset') {
      const { workerId, siteUrl } = params;

      // Get worker
      const { data: worker, error: workerError } = await supabase
        .from('workers')
        .select('id, email, user_id')
        .eq('id', workerId)
        .single();

      if (workerError || !worker) {
        return errorResponse('Trabajador no encontrado');
      }

      if (!worker.user_id || !worker.email) {
        return errorResponse('El trabajador no está registrado');
      }

      // Send password reset email
      const redirectTo = siteUrl ? `${siteUrl}/reset-password` : undefined;
      
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(worker.email, {
        redirectTo
      });

      if (resetError) {
        console.error('Reset error:', resetError);
        return errorResponse('Error al enviar el email de recuperación');
      }

      console.log(`Password reset email sent to ${worker.email}`);

      return new Response(JSON.stringify({
        success: true,
        message: 'Email de recuperación enviado'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin: Reset worker credentials
    if (action === 'adminResetCredentials') {
      const { workerId, adminSessionToken } = params;

      // Validate admin session (reuse manager auth logic)
      const { data: session, error: sessionError } = await supabase
        .from('manager_sessions')
        .select('manager_id, expires_at, managers!inner(role)')
        .eq('token', adminSessionToken)
        .single();

      if (sessionError || !session) {
        return errorResponse('Sesión de administrador no válida', 401);
      }

      if (new Date(session.expires_at) < new Date()) {
        return errorResponse('Sesión expirada', 401);
      }

      const managerRole = (session.managers as any)?.role;
      if (managerRole !== 'admin') {
        return errorResponse('Se requiere acceso de administrador', 403);
      }

      // Get worker
      const { data: worker, error: workerError } = await supabase
        .from('workers')
        .select('id, email, user_id')
        .eq('id', workerId)
        .single();

      if (workerError || !worker) {
        return errorResponse('Trabajador no encontrado');
      }

      if (!worker.user_id) {
        return errorResponse('El trabajador no tiene cuenta registrada');
      }

      // Delete the auth user (this will set user_id to null due to ON DELETE SET NULL)
      const { error: deleteError } = await supabase.auth.admin.deleteUser(worker.user_id);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        return errorResponse('Error al resetear credenciales');
      }

      // Clear worker's user_id
      const { error: updateError } = await supabase
        .from('workers')
        .update({ user_id: null })
        .eq('id', workerId);

      if (updateError) {
        console.error('Update error:', updateError);
      }

      console.log(`Admin reset credentials for worker ${workerId}`);

      return new Response(JSON.stringify({
        success: true,
        message: 'Credenciales reseteadas. El trabajador deberá registrarse de nuevo.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin: Delete auth user(s) by email and clear from workers
    if (action === 'adminDeleteUserByEmail') {
      const { email, adminSessionToken } = params;

      if (!email || typeof email !== 'string') {
        return errorResponse('Email no válido');
      }

      // Validate admin session
      const { data: session, error: sessionError } = await supabase
        .from('manager_sessions')
        .select('manager_id, expires_at, managers!inner(role)')
        .eq('token', adminSessionToken)
        .single();

      if (sessionError || !session) {
        return errorResponse('Sesión de administrador no válida', 401);
      }

      if (new Date(session.expires_at) < new Date()) {
        return errorResponse('Sesión expirada', 401);
      }

      const managerRole = (session.managers as any)?.role;
      if (managerRole !== 'admin') {
        return errorResponse('Se requiere acceso de administrador', 403);
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Find auth users with that email (list & filter)
      const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) {
        console.error('List users error:', listError);
        return errorResponse('No se pudo comprobar el email en el sistema');
      }

      const matches = (usersData?.users || []).filter(
        (u) => (u.email || '').toLowerCase() === normalizedEmail
      );

      let deletedCount = 0;
      for (const u of matches) {
        const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
        if (delErr) {
          console.error('Delete user error:', delErr);
        } else {
          deletedCount += 1;
        }
      }

      // Clear from workers table if present
      const { error: clearErr } = await supabase
        .from('workers')
        .update({ email: null, user_id: null })
        .ilike('email', normalizedEmail);

      if (clearErr) {
        console.error('Clear worker email error:', clearErr);
      }

      console.log(`Admin deleted ${deletedCount} auth user(s) for email ${normalizedEmail}`);

      return new Response(
        JSON.stringify({
          success: true,
          deletedCount,
          message:
            deletedCount > 0
              ? 'Email liberado correctamente'
              : 'No se encontró ninguna cuenta con ese email (ya estaba libre)'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    return errorResponse('Acción no válida');

  } catch (error) {
    console.error('Worker auth error:', error);
    return errorResponse('Error interno del servidor', 500);
  }
});
