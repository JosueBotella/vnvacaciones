import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Session duration: 30 days absolute max, 2 hours inactivity timeout
const SESSION_DURATION_DAYS = 30;
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

// SECURITY: Rate limiting constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

// Helper to return error response (always 200 so frontend can read the message)
const errorResponse = (error: string, extra?: Record<string, any>) => {
  console.error('Returning error:', error);
  return new Response(
    JSON.stringify({ success: false, error, ...extra }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const body = await req.json();
    const { action, managerId, password, newPassword, sessionToken, email, testEmail, origin: bodyOrigin } = body;
    
    // Get client IP for rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    
    console.log(`Manager auth action: ${action} for manager: ${managerId}`);

    // SECURITY: Helper to log security events
    async function logSecurityEvent(
      eventType: string,
      severity: 'info' | 'warning' | 'critical',
      details: Record<string, any>
    ) {
      try {
        await supabase.from('security_events').insert({
          event_type: eventType,
          severity,
          actor_id: managerId || null,
          actor_type: 'manager',
          ip_address: clientIp,
          user_agent: req.headers.get('user-agent') || null,
          details
        });
      } catch (e) {
        console.error('Failed to log security event:', e);
      }
    }

    // SECURITY: Check rate limiting for login attempts
    async function checkRateLimit(identifier: string): Promise<{ allowed: boolean; remainingAttempts: number }> {
      const cutoffTime = new Date(Date.now() - LOCKOUT_DURATION_MINUTES * 60 * 1000).toISOString();
      
      const { count, error } = await supabase
        .from('login_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_identifier', identifier)
        .eq('success', false)
        .gte('attempted_at', cutoffTime);

      if (error) {
        console.error('Rate limit check error:', error);
        return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
      }

      const failedAttempts = count || 0;
      return {
        allowed: failedAttempts < MAX_LOGIN_ATTEMPTS,
        remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - failedAttempts)
      };
    }

    // SECURITY: Record login attempt
    async function recordLoginAttempt(identifier: string, success: boolean) {
      try {
        await supabase.from('login_attempts').insert({
          user_identifier: identifier,
          ip_address: clientIp,
          success
        });
      } catch (e) {
        console.error('Failed to record login attempt:', e);
      }
    }

    // Helper function to validate session and return manager data
    async function validateSession(token: string): Promise<{ valid: boolean; manager?: any; error?: string }> {
      if (!token) {
        return { valid: false, error: 'No session token provided' };
      }

      const { data: session, error } = await supabase
        .from('manager_sessions')
        .select('manager_id, expires_at, last_activity')
        .eq('token', token)
        .single();

      if (error || !session) {
        return { valid: false, error: 'Invalid session token' };
      }

      // Check if session expired (absolute expiry)
      if (new Date(session.expires_at) < new Date()) {
        await supabase.from('manager_sessions').delete().eq('token', token);
        return { valid: false, error: 'Session expired' };
      }

      // Check inactivity timeout (2 hours)
      const lastActivity = new Date(session.last_activity).getTime();
      const now = Date.now();
      if (now - lastActivity > INACTIVITY_TIMEOUT_MS) {
        await supabase.from('manager_sessions').delete().eq('token', token);
        return { valid: false, error: 'Session expired' };
      }

      // Get manager data
      const { data: manager, error: managerError } = await supabase
        .from('managers')
        .select('id, name, role, department_id, is_blocked, worker_team_id, candidaturas_only')
        .eq('id', session.manager_id)
        .single();

      if (managerError || !manager) {
        return { valid: false, error: 'Manager not found' };
      }

      // SECURITY: Check if manager is blocked
      if (manager.is_blocked) {
        await supabase.from('manager_sessions').delete().eq('token', token);
        return { valid: false, error: 'Tu cuenta ha sido bloqueada. Contacta con un administrador.' };
      }

      // Update last_activity timestamp (keep session alive while active)
      await supabase
        .from('manager_sessions')
        .update({ last_activity: new Date().toISOString() })
        .eq('token', token);

      return { valid: true, manager };
    }

    // Action: Check if manager needs to set password
    if (action === 'checkNeedsPassword') {
      const { data: manager, error } = await supabase
        .from('managers')
        .select('id, password_hash')
        .eq('id', managerId)
        .single();

      // SECURITY: Use neutral error message to prevent user enumeration
      if (error || !manager) {
        return errorResponse('Credenciales no válidas');
      }

      // Check if password is set and valid bcrypt format
      const hasValidPassword = manager.password_hash && manager.password_hash.startsWith('$2');
      
      return new Response(
        JSON.stringify({ success: true, needsPassword: !hasValidPassword }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Validate an existing session
    if (action === 'validateSession') {
      const result = await validateSession(sessionToken);
      
      if (!result.valid) {
        return errorResponse(result.error || 'Sesión no válida');
      }

      return new Response(
        JSON.stringify({ success: true, manager: result.manager }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Login
    if (action === 'login') {
      // SECURITY: Check rate limiting before processing login
      const rateLimitCheck = await checkRateLimit(managerId);
      if (!rateLimitCheck.allowed) {
        await logSecurityEvent('LOGIN_RATE_LIMIT_EXCEEDED', 'warning', {
          managerId,
          ip: clientIp
        });
        return errorResponse(`Demasiados intentos fallidos. Espera ${LOCKOUT_DURATION_MINUTES} minutos.`);
      }

      // Fetch manager with password hash
      const { data: manager, error } = await supabase
        .from('managers')
        .select('id, name, role, department_id, password_hash, is_blocked, worker_team_id')
        .eq('id', managerId)
        .single();

      // SECURITY: Use neutral error message to prevent user enumeration
      if (error || !manager) {
        await recordLoginAttempt(managerId, false);
        console.log('Manager not found:', error);
        return errorResponse('Credenciales no válidas');
      }

      // SECURITY: Check if manager is blocked
      if (manager.is_blocked) {
        await logSecurityEvent('BLOCKED_LOGIN_ATTEMPT', 'warning', {
          managerId: manager.id,
          managerName: manager.name,
          ip: clientIp
        });
        return errorResponse('Tu cuenta ha sido bloqueada. Contacta con un administrador.');
      }

      if (!manager.password_hash) {
        console.log('Manager has no password set');
        return new Response(
          JSON.stringify({ success: false, error: 'No tiene contraseña establecida', needsPassword: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify password with bcrypt - check if password_hash is valid bcrypt format
      let isValid = false;
      try {
        if (manager.password_hash.startsWith('$2')) {
          isValid = await bcrypt.compare(password, manager.password_hash);
        } else {
          // Password hash is not in bcrypt format - it's corrupted
          console.log('Invalid password hash format for manager:', managerId);
          return new Response(
            JSON.stringify({ success: false, error: 'Contraseña corrupta, necesita resetear', needsPassword: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (e) {
        console.error('Error comparing password:', e);
        return errorResponse('Error verificando contraseña');
      }
      
      if (!isValid) {
        await recordLoginAttempt(managerId, false);
        console.log('Invalid password for manager:', managerId);
        // SECURITY: Use neutral error message
        return errorResponse('Credenciales no válidas', { 
          remainingAttempts: rateLimitCheck.remainingAttempts - 1 
        });
      }

      // SECURITY: Record successful login
      await recordLoginAttempt(managerId, true);

      // Generate a cryptographically secure session token
      const newSessionToken = crypto.randomUUID() + '-' + crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

      // Clean up only expired/inactive sessions for this manager (allow multiple active sessions)
      await supabase
        .from('manager_sessions')
        .delete()
        .eq('manager_id', manager.id)
        .lt('last_activity', new Date(Date.now() - INACTIVITY_TIMEOUT_MS).toISOString());

      // Store the session token in the database
      const { error: sessionError } = await supabase
        .from('manager_sessions')
        .insert({
          manager_id: manager.id,
          token: newSessionToken,
          expires_at: expiresAt.toISOString()
        });

      if (sessionError) {
        console.error('Error creating session:', sessionError);
        return errorResponse('Error al crear sesión');
      }

      // Log successful login
      await logSecurityEvent('LOGIN_SUCCESS', 'info', {
        managerId: manager.id,
        managerName: manager.name,
        role: manager.role
      });
      
      console.log('Login successful for manager:', manager.name);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          manager: {
            id: manager.id,
            name: manager.name,
            role: manager.role,
            department_id: manager.department_id,
            worker_team_id: manager.worker_team_id || null
          },
          sessionToken: newSessionToken
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Action: Set initial password (only for managers without a password)
    if (action === 'setPassword') {
      // Fetch manager to verify it exists and has no password
      const { data: manager, error } = await supabase
        .from('managers')
        .select('id, password_hash')
        .eq('id', managerId)
        .single();

      if (error || !manager) {
        console.log('Manager not found for password set:', error);
        return errorResponse('Usuario no encontrado');
      }

      // Check if password_hash is valid bcrypt or empty/null
      const hasValidPassword = manager.password_hash && manager.password_hash.startsWith('$2');
      
      if (hasValidPassword) {
        console.log('Manager already has valid password, cannot set new one this way');
        return errorResponse('Ya tiene contraseña establecida');
      }

      // SECURITY: Validate new password (minimum 8 characters per security best practices)
      if (!newPassword || newPassword.length < 8) {
        return errorResponse('La contraseña debe tener al menos 8 caracteres');
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      // Update the password
      const { error: updateError } = await supabase
        .from('managers')
        .update({ password_hash: hashedPassword })
        .eq('id', managerId);

      if (updateError) {
        console.log('Error updating password:', updateError);
        return errorResponse('Error al establecer contraseña');
      }

      await logSecurityEvent('PASSWORD_SET', 'info', { managerId });
      console.log('Password set successfully for manager:', managerId);
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Reset password (REQUIRES ADMIN SESSION)
    if (action === 'resetPassword') {
      // SECURITY: Validate that caller has a valid admin session
      const sessionResult = await validateSession(sessionToken);
      
      if (!sessionResult.valid) {
        await logSecurityEvent('UNAUTHORIZED_PASSWORD_RESET_ATTEMPT', 'warning', {
          targetManagerId: managerId,
          reason: 'invalid_session'
        });
        console.log('Unauthorized resetPassword attempt - invalid session');
        return errorResponse('Sesión no válida');
      }

      if (sessionResult.manager?.role !== 'admin') {
        await logSecurityEvent('UNAUTHORIZED_PASSWORD_RESET_ATTEMPT', 'critical', {
          actorId: sessionResult.manager?.id,
          actorRole: sessionResult.manager?.role,
          targetManagerId: managerId,
          reason: 'not_admin'
        });
        console.log('Unauthorized resetPassword attempt - not admin');
        return errorResponse('Solo administradores pueden resetear contraseñas');
      }

      // Invalidate all sessions for the target manager (security measure)
      await supabase
        .from('manager_sessions')
        .delete()
        .eq('manager_id', managerId);

      // If newPassword is null/empty, reset to null so manager can set new password
      // Otherwise, hash the new password
      const hashedPassword = newPassword ? await bcrypt.hash(newPassword, 10) : null;
      
      const { error: updateError } = await supabase
        .from('managers')
        .update({ password_hash: hashedPassword })
        .eq('id', managerId);

      if (updateError) {
        console.log('Error resetting password:', updateError);
        return errorResponse('Error al resetear contraseña');
      }

      await logSecurityEvent('PASSWORD_RESET_BY_ADMIN', 'info', {
        adminId: sessionResult.manager.id,
        adminName: sessionResult.manager.name,
        targetManagerId: managerId
      });
      console.log('Password reset successfully for manager:', managerId);
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Logout (invalidate session)
    if (action === 'logout') {
      if (sessionToken) {
        await supabase
          .from('manager_sessions')
          .delete()
          .eq('token', sessionToken);
      }
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Logout from all devices (invalidate ALL sessions for this manager)
    if (action === 'logoutAll') {
      // First validate the current session
      const sessionResult = await validateSession(sessionToken);
      
      if (!sessionResult.valid) {
        return errorResponse('Sesión no válida');
      }

      // Delete ALL sessions for this manager
      const { error } = await supabase
        .from('manager_sessions')
        .delete()
        .eq('manager_id', sessionResult.manager.id);

      if (error) {
        console.error('Error deleting all sessions:', error);
        return errorResponse('Error al cerrar sesiones');
      }

      await logSecurityEvent('LOGOUT_ALL_SESSIONS', 'info', {
        managerId: sessionResult.manager.id,
        managerName: sessionResult.manager.name
      });
      console.log('All sessions deleted for manager:', sessionResult.manager.name);
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Check if email account needs password setup
    if (action === 'checkEmailNeedsPassword') {
      if (!email) {
        return errorResponse('Email requerido');
      }
      const normalizedEmail = email.trim().toLowerCase();
      const { data: mgr } = await supabase
        .from('managers')
        .select('id, password_hash, is_blocked')
        .ilike('email', normalizedEmail)
        .single();

      if (!mgr) {
        // Don't reveal if email exists or not
        return new Response(
          JSON.stringify({ success: true, needsPassword: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (mgr.is_blocked) {
        return new Response(
          JSON.stringify({ success: true, needsPassword: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const needsPassword = !mgr.password_hash || !mgr.password_hash.startsWith('$2');
      return new Response(
        JSON.stringify({ success: true, needsPassword }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Login by email
    if (action === 'loginByEmail') {
      if (!email || !password) {
        return errorResponse('Credenciales no válidas');
      }

      const normalizedEmail = email.trim().toLowerCase();

      // SECURITY: Check rate limiting by email
      const rateLimitCheck = await checkRateLimit(normalizedEmail);
      if (!rateLimitCheck.allowed) {
        await logSecurityEvent('LOGIN_RATE_LIMIT_EXCEEDED', 'warning', {
          email: normalizedEmail,
          ip: clientIp
        });
        return errorResponse(`Demasiados intentos fallidos. Espera ${LOCKOUT_DURATION_MINUTES} minutos.`, { locked: true });
      }

      // Find manager by email (case-insensitive)
      const { data: mgr, error: findError } = await supabase
        .from('managers')
        .select('id, name, role, department_id, password_hash, is_blocked, worker_team_id, candidaturas_only')
        .ilike('email', normalizedEmail)
        .single();

      if (findError || !mgr) {
        await recordLoginAttempt(normalizedEmail, false);
        return errorResponse('Credenciales no válidas', {
          remainingAttempts: rateLimitCheck.remainingAttempts - 1
        });
      }

      // SECURITY: Check if manager is blocked
      if (mgr.is_blocked) {
        await logSecurityEvent('BLOCKED_LOGIN_ATTEMPT', 'warning', {
          managerId: mgr.id,
          managerName: mgr.name,
          ip: clientIp
        });
        return errorResponse('Tu cuenta ha sido bloqueada. Contacta con un administrador.');
      }

      if (!mgr.password_hash) {
        return errorResponse('Tu cuenta no tiene contraseña configurada. Contacta con el administrador.', { needsPassword: true });
      }

      // Verify password
      let isValid = false;
      try {
        if (mgr.password_hash.startsWith('$2')) {
          isValid = await bcrypt.compare(password, mgr.password_hash);
        } else {
          return errorResponse('Contraseña corrupta, contacta con el administrador.', { needsPassword: true });
        }
      } catch (e) {
        console.error('Error comparing password:', e);
        return errorResponse('Error verificando contraseña');
      }

      if (!isValid) {
        await recordLoginAttempt(normalizedEmail, false);
        return errorResponse('Credenciales no válidas', {
          remainingAttempts: rateLimitCheck.remainingAttempts - 1
        });
      }

      // SECURITY: Record successful login
      await recordLoginAttempt(normalizedEmail, true);

      // Generate session token
      const newSessionToken = crypto.randomUUID() + '-' + crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

      // Clean up expired/inactive sessions
      await supabase
        .from('manager_sessions')
        .delete()
        .eq('manager_id', mgr.id)
        .lt('last_activity', new Date(Date.now() - INACTIVITY_TIMEOUT_MS).toISOString());

      // Store session
      const { error: sessionError } = await supabase
        .from('manager_sessions')
        .insert({
          manager_id: mgr.id,
          token: newSessionToken,
          expires_at: expiresAt.toISOString()
        });

      if (sessionError) {
        console.error('Error creating session:', sessionError);
        return errorResponse('Error al crear sesión');
      }

      await logSecurityEvent('LOGIN_SUCCESS', 'info', {
        managerId: mgr.id,
        managerName: mgr.name,
        role: mgr.role,
        method: 'email'
      });

      return new Response(
        JSON.stringify({
          success: true,
          manager: {
            id: mgr.id,
            name: mgr.name,
            role: mgr.role,
            department_id: mgr.department_id,
            worker_team_id: mgr.worker_team_id || null,
            candidaturas_only: !!(mgr as any).candidaturas_only
          },
          sessionToken: newSessionToken
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Update manager email (admin only, used from admin-operations too)
    if (action === 'updateManagerEmail') {
      // Validate admin session
      const sessionResult = await validateSession(sessionToken);
      if (!sessionResult.valid || sessionResult.manager?.role !== 'admin') {
        return errorResponse('Solo administradores pueden realizar esta acción');
      }

      const targetId = managerId;
      const newEmail = email?.trim().toLowerCase();

      if (!targetId || !newEmail) {
        return errorResponse('ID y email requeridos');
      }

      // Simple email format validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return errorResponse('Formato de email no válido');
      }

      // Check uniqueness
      const { data: existing } = await supabase
        .from('managers')
        .select('id')
        .ilike('email', newEmail)
        .neq('id', targetId)
        .maybeSingle();

      if (existing) {
        return errorResponse('Este email ya está en uso por otro usuario');
      }

      const { error: updateError } = await supabase
        .from('managers')
        .update({ email: newEmail })
        .eq('id', targetId);

      if (updateError) {
        console.error('Error updating email:', updateError);
        return errorResponse('Error al actualizar email');
      }

      await logSecurityEvent('EMAIL_UPDATED', 'info', {
        adminId: sessionResult.manager.id,
        targetManagerId: targetId,
        newEmail
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Validate a setup token to get the associated email
    if (action === 'validateSetupToken') {
      const tokenToValidate = password; // token comes in the password field

      if (!tokenToValidate) {
        return errorResponse('Token requerido');
      }

      const { data: mgr, error: findErr } = await supabase
        .from('managers')
        .select('email, name')
        .eq('setup_token', tokenToValidate)
        .single();

      if (findErr || !mgr) {
        return errorResponse('El enlace no es válido o ya ha sido utilizado');
      }

      return new Response(
        JSON.stringify({ success: true, email: mgr.email, name: mgr.name }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Setup password using a setup token (from welcome email)
    if (action === 'setupPasswordByToken') {
      const token = sessionToken; // we'll pass token in sessionToken field
      const pwd = newPassword || password;

      if (!token) {
        return errorResponse('Token requerido');
      }

      if (!pwd || pwd.length < 8) {
        return errorResponse('La contraseña debe tener al menos 8 caracteres');
      }

      // Find manager by setup token
      const { data: mgr, error: findErr } = await supabase
        .from('managers')
        .select('id, email, name')
        .eq('setup_token', token)
        .single();

      if (findErr || !mgr) {
        return errorResponse('El enlace no es válido o ya ha sido utilizado');
      }

      // Hash and save password, consume token
      const hashedPassword = await bcrypt.hash(pwd, 10);
      
      const { error: updateErr } = await supabase
        .from('managers')
        .update({ password_hash: hashedPassword, setup_token: null })
        .eq('id', mgr.id);

      if (updateErr) {
        console.error('Error setting password by token:', updateErr);
        return errorResponse('Error al configurar la contraseña');
      }

      await logSecurityEvent('PASSWORD_SET_BY_TOKEN', 'info', {
        managerId: mgr.id,
        managerName: mgr.name
      });

      return new Response(
        JSON.stringify({ success: true, email: mgr.email }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Set password by email (for users without password)
    if (action === 'setPasswordByEmail') {
      const normalizedEmail = email?.trim()?.toLowerCase();
      if (!normalizedEmail || !newPassword) {
        return errorResponse('Email y contraseña son obligatorios');
      }

      if (newPassword.length < 8) {
        return errorResponse('La contraseña debe tener al menos 8 caracteres');
      }

      // Rate limit check on email
      const rateLimitCheck = await checkRateLimit(normalizedEmail);
      if (!rateLimitCheck.allowed) {
        return errorResponse(`Demasiados intentos. Espera ${LOCKOUT_DURATION_MINUTES} minutos.`);
      }

      const { data: mgr, error: findError } = await supabase
        .from('managers')
        .select('id, name, email, password_hash, is_blocked')
        .ilike('email', normalizedEmail)
        .single();

      if (findError || !mgr) {
        return errorResponse('No se encontró una cuenta con ese email');
      }

      if (mgr.is_blocked) {
        return errorResponse('Tu cuenta ha sido bloqueada. Contacta con un administrador.');
      }

      // SECURITY: Only allow if user truly has no valid password
      if (mgr.password_hash && mgr.password_hash.startsWith('$2')) {
        return errorResponse('Esta cuenta ya tiene contraseña configurada. Usa el login normal.');
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      const { error: updateErr } = await supabase
        .from('managers')
        .update({ password_hash: hashedPassword })
        .eq('id', mgr.id);

      if (updateErr) {
        return errorResponse('Error al configurar la contraseña');
      }

      await logSecurityEvent('PASSWORD_SET_BY_EMAIL', 'info', {
        managerId: mgr.id,
        managerName: mgr.name,
        email: normalizedEmail
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Send invitation email to a manager (admin only) - generates fresh setup_token
    if (action === 'sendInvitationEmail') {
      const sessionResult = await validateSession(sessionToken);
      if (!sessionResult.valid || sessionResult.manager?.role !== 'admin') {
        return errorResponse('Solo administradores pueden enviar invitaciones');
      }

      if (!managerId) {
        return errorResponse('ID del encargado requerido');
      }

      const { data: mgr, error: mgrErr } = await supabase
        .from('managers')
        .select('id, name, email, candidaturas_only, role')
        .eq('id', managerId)
        .single();

      if (mgrErr || !mgr) {
        return errorResponse('Encargado no encontrado');
      }

      if (!mgr.email) {
        return errorResponse('El encargado no tiene email configurado');
      }

      // Generate a fresh setup token (overwrites any existing)
      const newSetupToken = crypto.randomUUID() + '-' + crypto.randomUUID();

      const { error: tokenErr } = await supabase
        .from('managers')
        .update({ setup_token: newSetupToken, password_hash: null })
        .eq('id', managerId);

      if (tokenErr) {
        console.error('Error generating setup token:', tokenErr);
        return errorResponse('Error al generar el enlace de configuración');
      }

      // Build URLs — siempre el dominio de producción, nunca preview de Lovable
      const appOrigin = 'https://vnprod.app';

      // After setup → redirect to candidaturas login with email pre-filled (if candidaturas_only)
      // Otherwise → general manager login
      const redirectPath = mgr.candidaturas_only
        ? `/admin/candidaturas/login`
        : `/login`;

      const setupUrl = `${appOrigin}/setup-password?token=${encodeURIComponent(newSetupToken)}&redirect=${encodeURIComponent(redirectPath)}&email=${encodeURIComponent(mgr.email)}`;

      // Recipient: real email or test email override
      const recipient = (testEmail && typeof testEmail === 'string' && testEmail.trim())
        ? testEmail.trim().toLowerCase()
        : mgr.email;

      const isTest = recipient !== mgr.email;

      // Build branded HTML
      const verdnaturaGreen = '#93d600';
      const blueAccent = '#3b82f6';
      const logoWhiteUrl = 'https://vnprod.app/images/logo-white.png';

      // Icono SVG (triangle alert) inline en data-URI para sustituir el emoji ⚠️
      const warningIconDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%23b45309" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`
          .replace(/%23/g, '#')
      )}`;

      // Tipografía Poppins (semibold para títulos / light para cuerpo) + tracking negativo
      const fontStack = `'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

      const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Configura tu cuenta de Candidaturas</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    body, p, h1, h2, h3, a, div, span, code { font-family: ${fontStack} !important; }
  </style>
</head>
<body style="margin:0;padding:20px;background-color:#f5f5f5;font-family:${fontStack};">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg, ${blueAccent} 0%, #1d4ed8 100%);padding:40px 20px;text-align:center;">
      <img src="${logoWhiteUrl}" alt="Verdnatura" width="72" height="72" style="width:72px;height:72px;margin-bottom:14px;display:block;margin-left:auto;margin-right:auto;">
      <h1 style="color:#ffffff;font-size:22px;font-weight:600;margin:0;letter-spacing:-0.6px;font-family:${fontStack};">Bienvenido al panel de Candidaturas</h1>
    </div>
    <div style="padding:36px 30px;">
      ${isTest ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin-bottom:20px;border-radius:0 8px 8px 0;color:#92400e;font-size:13px;font-weight:300;letter-spacing:-0.2px;display:flex;align-items:center;gap:8px;"><img src="${warningIconDataUri}" alt="" width="16" height="16" style="vertical-align:middle;display:inline-block;margin-right:6px;"><span style="font-weight:600;">Email de prueba</span> &nbsp;—&nbsp; destinatario real: <code style="font-family:${fontStack};font-weight:600;">${mgr.email}</code></div>` : ''}
      <p style="color:#1a1a1a;font-size:18px;font-weight:600;margin:0 0 18px;letter-spacing:-0.5px;font-family:${fontStack};">Hola ${mgr.name},</p>
      <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 18px;font-weight:300;letter-spacing:-0.2px;font-family:${fontStack};">Se ha creado una cuenta para que puedas acceder al panel de <strong style="font-weight:600;">Candidaturas</strong> de Verdnatura, donde podrás revisar entrevistas y gestionar candidatos.</p>
      <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 28px;font-weight:300;letter-spacing:-0.2px;font-family:${fontStack};">Para empezar, configura tu contraseña haciendo clic en el botón:</p>
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${setupUrl}" style="display:inline-block;background:${blueAccent};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;letter-spacing:-0.3px;font-family:${fontStack};">Configurar mi contraseña</a>
      </div>
      <div style="background:#f0f9ff;border-left:4px solid ${blueAccent};padding:16px 18px;margin:0 0 24px;border-radius:0 8px 8px 0;">
        <p style="margin:0 0 6px;color:#1a1a1a;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;font-family:${fontStack};">Tu email de acceso</p>
        <p style="margin:0;color:${blueAccent};font-size:15px;font-weight:600;letter-spacing:-0.2px;font-family:${fontStack};">${mgr.email}</p>
      </div>
      <p style="color:#888;font-size:13px;line-height:1.6;margin:0 0 8px;font-weight:300;letter-spacing:-0.1px;font-family:${fontStack};">Si el botón no funciona, copia y pega esta dirección en tu navegador:</p>
      <p style="word-break:break-all;color:${blueAccent};font-size:12px;margin:0 0 24px;font-weight:400;font-family:${fontStack};">${setupUrl}</p>
      <p style="color:#999;font-size:12px;line-height:1.5;margin:0;font-weight:300;letter-spacing:-0.1px;font-family:${fontStack};">Este enlace es personal y de un solo uso. Si no esperabas este correo, puedes ignorarlo.</p>
    </div>
    <div style="background:#1a1a1a;color:#888;padding:24px;text-align:center;font-size:12px;font-weight:300;letter-spacing:-0.1px;font-family:${fontStack};">
      <p style="margin:0 0 4px;font-family:${fontStack};">© ${new Date().getFullYear()} Verdnatura — Panel de Candidaturas</p>
    </div>
  </div>
</body>
</html>`;

      // Send via Resend
      const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
      if (!RESEND_KEY) {
        console.error('RESEND_API_KEY not configured');
        return errorResponse('El servicio de email no está configurado. Contacta con el administrador.');
      }

      try {
        const resendResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Verdnatura Candidaturas <candidaturas@vnprod.app>',
            to: [recipient],
            subject: isTest
              ? `[PRUEBA] Configura tu cuenta de Candidaturas`
              : `Configura tu cuenta de Candidaturas`,
            html: htmlContent,
          }),
        });

        if (!resendResp.ok) {
          const errText = await resendResp.text();
          console.error('Resend error:', resendResp.status, errText);
          return errorResponse(`Error al enviar el email: ${resendResp.status}`);
        }

        await logSecurityEvent('INVITATION_EMAIL_SENT', 'info', {
          adminId: sessionResult.manager.id,
          targetManagerId: managerId,
          targetEmail: mgr.email,
          actualRecipient: recipient,
          isTest,
        });

        return new Response(
          JSON.stringify({ success: true, sentTo: recipient, isTest, realEmail: mgr.email }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        console.error('Error sending invitation email:', e);
        return errorResponse('Error al enviar el email de invitación');
      }
    }

    // Action: Update profile (avatar and/or email)
    // - Self: any authenticated manager updates their own profile.
    // - Admin: can update any manager's profile by passing managerId.
    if (action === 'updateProfile') {
      const sessionResult = await validateSession(sessionToken);
      if (!sessionResult.valid) return errorResponse('Sesión no válida');

      const isAdmin = sessionResult.manager?.role === 'admin';
      const targetId = (isAdmin && managerId) ? managerId : sessionResult.manager.id;

      const { avatarBase64, avatarMimeType, removeAvatar } = body as any;
      const updates: Record<string, any> = {};

      // Email update (optional)
      if (typeof email === 'string' && email.trim()) {
        const normalizedEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
          return errorResponse('Formato de email no válido');
        }
        const { data: existing } = await supabase
          .from('managers')
          .select('id')
          .ilike('email', normalizedEmail)
          .neq('id', targetId)
          .maybeSingle();
        if (existing) return errorResponse('Este email ya está en uso por otro usuario');
        updates.email = normalizedEmail;
      }

      // Avatar update (optional). avatarBase64 can be a data URL.
      if (removeAvatar) {
        // Best-effort: remove existing avatar file
        const { data: cur } = await supabase.from('managers').select('avatar_url').eq('id', targetId).maybeSingle();
        if (cur?.avatar_url) {
          // Path is the part after the bucket public URL: derive filename
          try {
            const url = new URL(cur.avatar_url);
            const idx = url.pathname.indexOf('/manager-avatars/');
            if (idx >= 0) {
              const path = url.pathname.substring(idx + '/manager-avatars/'.length);
              await supabase.storage.from('manager-avatars').remove([path]);
            }
          } catch { /* ignore */ }
        }
        updates.avatar_url = null;
      } else if (avatarBase64 && typeof avatarBase64 === 'string') {
        try {
          const clean = avatarBase64.includes(',') ? avatarBase64.split(',')[1] : avatarBase64;
          const binary = atob(clean);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

          const mime = (avatarMimeType && typeof avatarMimeType === 'string') ? avatarMimeType : 'image/jpeg';
          const ext = mime.includes('png') ? 'png' : (mime.includes('webp') ? 'webp' : 'jpg');
          const path = `${targetId}/${crypto.randomUUID()}.${ext}`;

          const { error: upErr } = await supabase.storage
            .from('manager-avatars')
            .upload(path, bytes, { contentType: mime, upsert: true });
          if (upErr) {
            console.error('Avatar upload error:', upErr);
            return errorResponse('Error al subir la imagen');
          }
          const { data: pub } = supabase.storage.from('manager-avatars').getPublicUrl(path);
          updates.avatar_url = pub.publicUrl;
        } catch (e) {
          console.error('Avatar decode error:', e);
          return errorResponse('Error procesando la imagen');
        }
      }

      if (Object.keys(updates).length === 0) {
        return new Response(
          JSON.stringify({ success: true, noop: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: updated, error: updErr } = await supabase
        .from('managers')
        .update(updates)
        .eq('id', targetId)
        .select('id, name, email, avatar_url')
        .single();

      if (updErr) {
        console.error('Profile update error:', updErr);
        return errorResponse('Error al actualizar el perfil');
      }

      await logSecurityEvent('PROFILE_UPDATED', 'info', {
        actorId: sessionResult.manager.id,
        targetId,
        fields: Object.keys(updates),
      });

      return new Response(
        JSON.stringify({ success: true, manager: updated }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Change password (self requires current password; admin can force without it)
    if (action === 'changePassword') {
      const sessionResult = await validateSession(sessionToken);
      if (!sessionResult.valid) return errorResponse('Sesión no válida');

      const isAdmin = sessionResult.manager?.role === 'admin';
      const targetId = (isAdmin && managerId) ? managerId : sessionResult.manager.id;

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        return errorResponse('La contraseña debe tener al menos 8 caracteres');
      }

      // Self-change requires verifying current password
      if (!isAdmin || targetId === sessionResult.manager.id) {
        if (!password || typeof password !== 'string') {
          return errorResponse('Debes introducir tu contraseña actual');
        }
        const { data: cur } = await supabase
          .from('managers')
          .select('password_hash')
          .eq('id', targetId)
          .single();
        if (!cur?.password_hash || !cur.password_hash.startsWith('$2')) {
          return errorResponse('No hay contraseña configurada');
        }
        const ok = await bcrypt.compare(password, cur.password_hash);
        if (!ok) return errorResponse('La contraseña actual no es correcta');
      }

      const hashed = await bcrypt.hash(newPassword, 10);
      const { error: updErr } = await supabase
        .from('managers')
        .update({ password_hash: hashed })
        .eq('id', targetId);
      if (updErr) return errorResponse('Error al cambiar la contraseña');

      await logSecurityEvent('PASSWORD_CHANGED', 'info', {
        actorId: sessionResult.manager.id,
        targetId,
        bySelf: targetId === sessionResult.manager.id,
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return errorResponse('Acción no válida');

  } catch (error) {
    console.error('Error in manager-auth:', error);
    return errorResponse('Error interno del servidor');
  }
});
