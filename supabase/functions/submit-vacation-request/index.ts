import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const INTERNAL_EMAIL_SECRET = Deno.env.get("INTERNAL_EMAIL_SECRET");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to send email notification securely
async function sendEmailNotification(params: {
  to: string;
  type: string;
  requestId?: string;
  data: any;
}): Promise<void> {
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
    } else {
      console.log('Email sent successfully to:', params.to);
    }
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

interface SelectedDateInput {
  date: string;
  halfDay: boolean;
}

interface VacationRequestInput {
  token: string;
  employeeName: string;
  employeeEmail: string;
  workerNumber: string;
  notes?: string;
  signature: string;
  selectedDates: SelectedDateInput[];
}

// Simple sanitization - remove HTML tags and limit length
const sanitizeText = (text: string, maxLength: number): string => {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').trim().slice(0, maxLength);
};

// Validate email format
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate date format (YYYY-MM-DD)
const isValidDate = (dateStr: string): boolean => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
};

// Helper to return error response (always 200 so frontend can read the message)
const errorResponse = (error: string) => {
  console.error('Returning error:', error);
  return new Response(
    JSON.stringify({ success: false, error }),
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

    const input = await req.json();

    // =====================================================
    // Check if worker is admin (for admin mode in form)
    // =====================================================
    // =====================================================
    // Get department availability days (for public forms)
    // This replaces direct queries to department_availabilities table
    // =====================================================
    if (input.action === 'get-department-availability') {
      const { departmentId, year } = input;
      
      if (!departmentId) {
        return errorResponse('Department ID required');
      }
      
      let query = supabase
        .from('department_availabilities')
        .select('date, half_day')
        .eq('department_id', departmentId);
        
      if (year) {
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        query = query.gte('date', yearStart).lte('date', yearEnd);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching availability:', error);
        return errorResponse('Error fetching availability');
      }
      
      return new Response(
        JSON.stringify({ success: true, availabilities: data || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Get personal calendar availability days (for public forms)
    // This replaces direct queries to personal_calendar_availabilities table
    // =====================================================
    if (input.action === 'get-personal-calendar-availability') {
      const { personalCalendarId } = input;
      
      if (!personalCalendarId) {
        return errorResponse('Personal calendar ID required');
      }
      
      const { data, error } = await supabase
        .from('personal_calendar_availabilities')
        .select('date, half_day')
        .eq('personal_calendar_id', personalCalendarId);
      
      if (error) {
        console.error('Error fetching personal calendar availability:', error);
        return errorResponse('Error fetching availability');
      }
      
      return new Response(
        JSON.stringify({ success: true, availabilities: data || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Check if worker is admin (for admin mode in form)
    // =====================================================
    if (input.action === 'check-admin-worker') {
      const { workerNumber } = input;
      
      if (!workerNumber) {
        return new Response(
          JSON.stringify({ success: false, isAdmin: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if this worker has role = 'admin'
      const { data: worker } = await supabase
        .from('workers')
        .select('id, name, role, department_id')
        .eq('worker_number', workerNumber)
        .single();

      if (!worker) {
        return new Response(
          JSON.stringify({ success: true, isAdmin: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const isAdmin = worker.role === 'admin';
      console.log(`Worker ${workerNumber} admin check: ${isAdmin}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          isAdmin,
          adminName: isAdmin ? worker.name : null,
          adminDepartmentId: isAdmin ? worker.department_id : null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Search all workers across departments (for admin mode)
    // =====================================================
    if (input.action === 'search-all-workers') {
      const { query, limit = 20 } = input;
      
      if (!query || query.length < 2) {
        return new Response(
          JSON.stringify({ success: true, workers: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Search by worker_number or name
      const { data: workers, error: searchErr } = await supabase
        .from('workers')
        .select(`
          id,
          name,
          worker_number,
          department_id,
          worker_team_id,
          email
        `)
        .or(`worker_number.ilike.%${query}%,name.ilike.%${query}%`)
        .limit(limit);

      if (searchErr) {
        console.error('Error searching workers:', searchErr);
        return new Response(
          JSON.stringify({ success: true, workers: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get department names
      const deptIds = [...new Set((workers || []).map(w => w.department_id))];
      const { data: depts } = await supabase
        .from('departments')
        .select('id, name, public_token')
        .in('id', deptIds.length ? deptIds : ['00000000-0000-0000-0000-000000000000']);

      const deptMap = new Map((depts || []).map(d => [d.id, d]));

      const result = (workers || []).map(w => ({
        id: w.id,
        name: w.name,
        workerNumber: w.worker_number,
        email: w.email,
        departmentId: w.department_id,
        departmentName: deptMap.get(w.department_id)?.name || 'Desconocido',
        departmentToken: deptMap.get(w.department_id)?.public_token || null
      }));

      return new Response(
        JSON.stringify({ success: true, workers: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Admin submit vacation request (bypass restrictions)
    // =====================================================
    if (input.action === 'admin-submit-vacation') {
      const { 
        adminWorkerNumber, 
        targetWorkerNumber, 
        targetDepartmentId,
        selectedDates,
        notes 
      } = input;
      
      if (!adminWorkerNumber || !targetWorkerNumber || !targetDepartmentId || !selectedDates?.length) {
        return errorResponse('Faltan datos requeridos');
      }

      // Verify admin
      const { data: adminWorker } = await supabase
        .from('workers')
        .select('id, name, role')
        .eq('worker_number', adminWorkerNumber)
        .single();

      if (!adminWorker || adminWorker.role !== 'admin') {
        return errorResponse('No tienes permisos de administrador');
      }

      // Get target worker info
      const { data: targetWorker } = await supabase
        .from('workers')
        .select('id, name, email')
        .eq('worker_number', targetWorkerNumber)
        .eq('department_id', targetDepartmentId)
        .single();

      if (!targetWorker) {
        return errorResponse('Trabajador objetivo no encontrado');
      }

      // Get department info
      const { data: dept } = await supabase
        .from('departments')
        .select('id, name, manager_email')
        .eq('id', targetDepartmentId)
        .single();

      if (!dept) {
        return errorResponse('Departamento no encontrado');
      }

      // Validate dates format
      for (const dateItem of selectedDates) {
        if (!dateItem || typeof dateItem !== 'object' || !dateItem.date) {
          return errorResponse(`Formato de fecha inválido`);
        }
        if (!isValidDate(dateItem.date)) {
          return errorResponse(`Formato de fecha inválido: ${dateItem.date}`);
        }
      }

      // Create vacation request with admin flag
      const { data: request, error: insertErr } = await supabase
        .from('vacation_requests')
        .insert({
          department_id: targetDepartmentId,
          employee_name: targetWorker.name,
          employee_email: targetWorker.email || `${targetWorkerNumber}@temp.local`,
          worker_number: targetWorkerNumber,
          notes: notes ? sanitizeText(notes, 1000) : null,
          signature: 'Solicitado por administrador',
          status: 'PENDING',
          manager_status: 'PENDING',
          is_admin_request: true,
          requested_by_admin_name: adminWorker.name
        })
        .select()
        .single();

      if (insertErr) {
        console.error('Error creating admin vacation request:', insertErr);
        return errorResponse('Error al crear solicitud');
      }

      // Insert dates
      const dateInserts = selectedDates.map((d: any) => ({
        vacation_request_id: request.id,
        date: d.date,
        half_day: d.halfDay || false
      }));

      const { error: datesErr } = await supabase
        .from('vacation_request_dates')
        .insert(dateInserts);

      if (datesErr) {
        console.error('Error inserting request dates:', datesErr);
        // Rollback request
        await supabase.from('vacation_requests').delete().eq('id', request.id);
        return errorResponse('Error al guardar fechas');
      }

      // Log audit
      const totalDays = selectedDates.reduce((sum: number, d: any) => sum + (d.halfDay ? 0.5 : 1), 0);
      await supabase.from('audit_logs').insert({
        action_type: 'admin_vacation_request',
        actor_name: adminWorker.name,
        actor_role: 'admin',
        entity_type: 'vacation_request',
        entity_id: request.id,
        entity_data: {
          target_worker: targetWorker.name,
          target_worker_number: targetWorkerNumber,
          department: dept.name,
          dates: selectedDates.map((d: any) => d.date),
          total_days: totalDays
        },
        details: `Solicitud admin de ${totalDays} días para ${targetWorker.name} en ${dept.name}`
      });

      // Send email to manager
      if (dept.manager_email) {
        const emails = dept.manager_email.split(',').map((e: string) => e.trim()).filter((e: string) => e);
        const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        
        const formattedDates = selectedDates.map((d: any) => {
          const date = new Date(d.date + 'T00:00:00');
          return `${date.getDate()} de ${months[date.getMonth()]}${d.halfDay ? ' (medio día)' : ''}`;
        }).join(', ');

        for (const email of emails) {
          await sendEmailNotification({
            to: email,
            type: 'vacation_request',
            requestId: request.id,
            data: {
              employeeName: targetWorker.name,
              workerNumber: targetWorkerNumber,
              departmentName: dept.name,
              dates: formattedDates,
              notes: notes ? sanitizeText(notes, 500) : null,
              adminRequester: adminWorker.name,
              isAdminRequest: true
            }
          });
        }
      }

      console.log(`Admin ${adminWorker.name} created vacation request ${request.id} for ${targetWorker.name}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          requestId: request.id,
          message: `Solicitud creada para ${targetWorker.name}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Handle day exception request submission
    // =====================================================
    if (input.action === 'submit-day-exception-request') {
      const { departmentId, workerNumber, workerName, workerEmail, requestDate, reason } = input;
      
      if (!departmentId || !workerNumber || !workerName || !requestDate || !reason) {
        return errorResponse('Faltan datos requeridos');
      }

      // Check if already has a pending request for this date
      const { data: existing } = await supabase
        .from('day_exception_requests')
        .select('id, status')
        .eq('department_id', departmentId)
        .eq('worker_number', workerNumber)
        .eq('request_date', requestDate)
        .in('status', ['PENDING_MANAGER', 'PENDING_ADMIN'])
        .single();

      if (existing) {
        return errorResponse('Ya tienes una solicitud pendiente para este día');
      }

      // Check if worker already has an approved exception for this date
      const { data: approvedEx } = await supabase
        .from('worker_day_exceptions')
        .select('id')
        .eq('department_id', departmentId)
        .eq('worker_number', workerNumber)
        .eq('exception_date', requestDate)
        .single();

      if (approvedEx) {
        return errorResponse('Ya tienes una excepción aprobada para este día');
      }

      // Get worker ID if exists
      const { data: worker } = await supabase
        .from('workers')
        .select('id')
        .eq('department_id', departmentId)
        .eq('worker_number', workerNumber)
        .single();

      // Insert exception request
      const { data: newRequest, error: insertErr } = await supabase
        .from('day_exception_requests')
        .insert({
          department_id: departmentId,
          worker_id: worker?.id || null,
          worker_number: workerNumber,
          worker_name: workerName,
          worker_email: workerEmail || null,
          request_date: requestDate,
          reason: sanitizeText(reason, 1000),
          status: 'PENDING_MANAGER',
          manager_status: 'PENDING',
          admin_status: 'PENDING'
        })
        .select()
        .single();

      if (insertErr) {
        console.error('Error creating day exception request:', insertErr);
        return errorResponse('Error al enviar solicitud');
      }

      // Get department info for email
      const { data: dept } = await supabase
        .from('departments')
        .select('name, manager_email')
        .eq('id', departmentId)
        .single();

      // Format date for email
      const dateObj = new Date(requestDate + 'T00:00:00');
      const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const formattedDate = `${dateObj.getDate()} de ${months[dateObj.getMonth()]} de ${dateObj.getFullYear()}`;

      // Send email to manager
      if (dept?.manager_email) {
        const emails = dept.manager_email.split(',').map((e: string) => e.trim()).filter((e: string) => e);
        for (const email of emails) {
          await sendEmailNotification({
            to: email,
            type: 'day_exception_request',
            requestId: newRequest.id,
            data: {
              workerName,
              workerNumber,
              departmentName: dept.name,
              requestDate: formattedDate,
              reason: sanitizeText(reason, 500),
              managerPanelLink: 'https://vnprod.app/manager',
            }
          });
        }
      }

      // Also notify admins
      const { data: admins } = await supabase
        .from('managers')
        .select('name')
        .eq('role', 'admin');

      // Log it
      await supabase.from('audit_logs').insert({
        action_type: 'day_exception_requested',
        actor_name: workerName,
        actor_role: 'worker',
        entity_type: 'day_exception',
        entity_id: newRequest.id,
        entity_data: {
          department_id: departmentId,
          department_name: dept?.name,
          worker_number: workerNumber,
          request_date: requestDate,
          reason: sanitizeText(reason, 200)
        },
        details: `Solicitud de excepción para ${formattedDate} en ${dept?.name || 'departamento'}`
      });

      console.log(`Day exception request created: ${newRequest.id} for ${requestDate}`);

      return new Response(
        JSON.stringify({ success: true, requestId: newRequest.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Check if worker has approved exception for a day
    // =====================================================
    if (input.action === 'check-worker-exceptions') {
      const { departmentId, workerNumber } = input;
      
      if (!departmentId || !workerNumber) {
        return new Response(
          JSON.stringify({ success: true, exceptions: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: exceptions } = await supabase
        .from('worker_day_exceptions')
        .select('exception_date')
        .eq('department_id', departmentId)
        .eq('worker_number', workerNumber);

      return new Response(
        JSON.stringify({ success: true, exceptions: (exceptions || []).map(e => e.exception_date) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle group join request submission
    if (input.action === 'request-join-group') {
      const { departmentId, workerNumber, workerName, workerEmail } = input;
      
      if (!departmentId || !workerNumber || !workerName) {
        return errorResponse('Faltan datos requeridos');
      }

      // Check if already has a pending request
      const { data: existing } = await supabase
        .from('group_join_requests')
        .select('id, status')
        .eq('department_id', departmentId)
        .eq('worker_number', workerNumber)
        .eq('status', 'PENDING')
        .single();

      if (existing) {
        return errorResponse('Ya tienes una solicitud pendiente');
      }

      const { error: insertErr } = await supabase
        .from('group_join_requests')
        .insert({
          department_id: departmentId,
          worker_number: workerNumber,
          worker_name: workerName,
          worker_email: workerEmail || null,
          status: 'PENDING'
        });

      if (insertErr) {
        console.error('Error creating group join request:', insertErr);
        return errorResponse('Error al enviar solicitud');
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle department correction request submission
    if (input.action === 'submit-department-correction') {
      const { workerId, currentDepartmentId, requestedDepartmentId, workerNumber, workerName } = input;
      
      if (!workerId || !currentDepartmentId || !requestedDepartmentId || !workerNumber || !workerName) {
        return errorResponse('Faltan datos requeridos');
      }

      // Check if already has a pending correction request
      const { data: existing } = await supabase
        .from('department_correction_requests')
        .select('id, status')
        .eq('worker_id', workerId)
        .eq('status', 'PENDING')
        .single();

      if (existing) {
        return errorResponse('Ya tienes una solicitud de corrección pendiente');
      }

      const { error: insertErr } = await supabase
        .from('department_correction_requests')
        .insert({
          worker_id: workerId,
          current_department_id: currentDepartmentId,
          requested_department_id: requestedDepartmentId,
          worker_number: workerNumber,
          worker_name: workerName,
          status: 'PENDING'
        });

      if (insertErr) {
        console.error('Error creating department correction request:', insertErr);
        return errorResponse('Error al enviar solicitud de corrección');
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for pending department correction request
    if (input.action === 'check-pending-correction') {
      const { workerId } = input;
      
      if (!workerId) {
        return new Response(
          JSON.stringify({ success: true, hasPendingCorrection: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: pending } = await supabase
        .from('department_correction_requests')
        .select('id, status')
        .eq('worker_id', workerId)
        .eq('status', 'PENDING')
        .single();

      return new Response(
        JSON.stringify({ success: true, hasPendingCorrection: !!pending }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle global worker lookup (for unified entry point)
    if (input.action === 'lookup-worker-global') {
      const { workerNumber } = input;
      
      if (!workerNumber) {
        return new Response(
          JSON.stringify({ success: false, worker: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Search worker across ALL departments
      const { data: worker, error: workerErr } = await supabase
        .from('workers')
        .select(`
          id,
          name,
          worker_number,
          department_id,
          worker_team_id,
          work_group_id
        `)
        .eq('worker_number', workerNumber)
        .single();

      if (workerErr || !worker) {
        return new Response(
          JSON.stringify({ success: false, worker: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if worker has a pending department correction request
      const { data: pendingCorrection } = await supabase
        .from('department_correction_requests')
        .select('id, status')
        .eq('worker_id', worker.id)
        .eq('status', 'PENDING')
        .single();

      // Get department info
      const { data: dept } = await supabase
        .from('departments')
        .select('id, name, slug, public_token, max_days_per_employee, require_all_days')
        .eq('id', worker.department_id)
        .single();

      // Get worker team if exists
      let team = null;
      if (worker.worker_team_id) {
        const { data: teamData } = await supabase
          .from('worker_teams')
          .select('id, name')
          .eq('id', worker.worker_team_id)
          .single();
        team = teamData;
      }

      // Get work group color and max_free_days
      // First check if worker has direct work_group_id, then fall back to team assignment
      let workGroup = null;
      let workGroupId = worker.work_group_id;
      
      // If no direct assignment, check via team
      if (!workGroupId && worker.worker_team_id) {
        const { data: workGroupTeam } = await supabase
          .from('work_group_teams')
          .select('work_group_id')
          .eq('worker_team_id', worker.worker_team_id)
          .single();

        if (workGroupTeam?.work_group_id) {
          workGroupId = workGroupTeam.work_group_id;
        }
      }

      // Get the work group details
      if (workGroupId) {
        const { data: groupData } = await supabase
          .from('work_groups')
          .select('id, name, color, max_free_days')
          .eq('id', workGroupId)
          .single();
        workGroup = groupData;
      }

      // Get all departments for the correction dropdown
      const { data: allDepts } = await supabase
        .from('departments')
        .select('id, name')
        .order('name');

      return new Response(
        JSON.stringify({ 
          success: true,
          worker: worker,
          department: dept,
          team: team,
          workGroup: workGroup,
          hasPendingCorrection: !!pendingCorrection,
          allDepartments: allDepts || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle global join request (no specific department)
    if (input.action === 'request-join-group-global') {
      const { workerNumber, workerName, workerEmail } = input;
      
      if (!workerNumber || !workerName || !workerEmail) {
        return errorResponse('Faltan datos requeridos');
      }

      // Get first department as placeholder (admin will reassign)
      const { data: firstDept } = await supabase
        .from('departments')
        .select('id')
        .limit(1)
        .single();

      if (!firstDept) {
        return errorResponse('No hay departamentos configurados');
      }

      // Check if already has a pending request with this worker number
      const { data: existing } = await supabase
        .from('group_join_requests')
        .select('id, status')
        .eq('worker_number', workerNumber)
        .eq('status', 'PENDING')
        .single();

      if (existing) {
        return errorResponse('Ya tienes una solicitud pendiente');
      }

      const { error: insertErr } = await supabase
        .from('group_join_requests')
        .insert({
          department_id: firstDept.id, // Placeholder - admin assigns correct one
          worker_number: workerNumber,
          worker_name: workerName,
          worker_email: workerEmail,
          status: 'PENDING'
        });

      if (insertErr) {
        console.error('Error creating global group join request:', insertErr);
        return errorResponse('Error al enviar solicitud');
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (input.action === 'get-worker-by-number') {
      const { departmentId, workerNumber } = input;
      
      if (!departmentId || !workerNumber) {
        return new Response(
          JSON.stringify({ success: true, worker: null, notInSystem: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get worker with team and work group
      const { data: worker, error: workerErr } = await supabase
        .from('workers')
        .select(`
          id,
          name,
          worker_number,
          worker_team_id,
          role
        `)
        .eq('department_id', departmentId)
        .eq('worker_number', workerNumber)
        .single();

      if (workerErr || !worker) {
        // Worker not in system - check if exact match (not partial)
        return new Response(
          JSON.stringify({ success: true, worker: null, notInSystem: workerNumber.length >= 3, isAdmin: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if worker is admin
      const isWorkerAdmin = worker.role === 'admin';

      // Get worker team if exists
      let workerTeam = null;
      if (worker.worker_team_id) {
        const { data: teamData } = await supabase
          .from('worker_teams')
          .select('id, name')
          .eq('id', worker.worker_team_id)
          .single();
        workerTeam = teamData;
      }

      // Get work group color if worker has a team
      let workGroup = null;
      if (worker.worker_team_id) {
        const { data: workGroupTeam } = await supabase
          .from('work_group_teams')
          .select('work_group_id')
          .eq('worker_team_id', worker.worker_team_id)
          .single();

        if (workGroupTeam?.work_group_id) {
          const { data: groupData } = await supabase
            .from('work_groups')
            .select('id, name, color')
            .eq('id', workGroupTeam.work_group_id)
            .single();
          workGroup = groupData;
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          notInSystem: false,
          isAdmin: isWorkerAdmin,
          worker: {
            name: worker.name,
            workerNumber: worker.worker_number,
            team: workerTeam ? {
              id: workerTeam.id,
              name: workerTeam.name
            } : null,
            workGroup: workGroup ? {
              id: workGroup.id,
              name: workGroup.name,
              color: workGroup.color
            } : null
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Get worker's personal unlocked days (from signed modifications)
    // This allows workers to see days that admin has unblocked for them specifically
    // =====================================================
    if (input.action === 'get-worker-personal-availability') {
      const { departmentId, workerNumber } = input;
      
      if (!departmentId || !workerNumber) {
        return new Response(
          JSON.stringify({ success: true, unlockedDays: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get worker ID
      const { data: worker } = await supabase
        .from('workers')
        .select('id')
        .eq('department_id', departmentId)
        .eq('worker_number', workerNumber)
        .single();

      if (!worker) {
        return new Response(
          JSON.stringify({ success: true, unlockedDays: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get signed modifications that have removed days (these become available)
      const { data: signedMods } = await supabase
        .from('worker_calendar_modifications')
        .select('removed_group_days, added_personal_days')
        .eq('worker_id', worker.id)
        .eq('status', 'signed');

      // Collect all unlocked days from signed modifications
      const unlockedDays: string[] = [];
      (signedMods || []).forEach((mod: any) => {
        // Removed days from calendar = now available for worker to request
        if (mod.removed_group_days && Array.isArray(mod.removed_group_days)) {
          unlockedDays.push(...mod.removed_group_days);
        }
        // Added personal days are also available
        if (mod.added_personal_days && Array.isArray(mod.added_personal_days)) {
          unlockedDays.push(...mod.added_personal_days.map((d: any) => d.date));
        }
      });

      // Also check worker_personal_calendar_days for additional personal days
      const { data: personalDays } = await supabase
        .from('worker_personal_calendar_days')
        .select('date')
        .eq('worker_id', worker.id);

      (personalDays || []).forEach((pd: any) => {
        if (!unlockedDays.includes(pd.date)) {
          unlockedDays.push(pd.date);
        }
      });

      console.log(`Worker ${workerNumber} has ${unlockedDays.length} personal unlocked days`);

      return new Response(
        JSON.stringify({ success: true, unlockedDays }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle check-used-days action
    if (input.action === 'check-used-days') {
      const { departmentId, workerNumber } = input;
      
      if (!departmentId || !workerNumber) {
        return errorResponse('Faltan parámetros requeridos');
      }

      // Get department info including manual free days setting
      const { data: dept, error: deptErr } = await supabase
        .from('departments')
        .select('max_days_per_employee, require_all_days, manual_free_days_enabled, manual_free_days_value')
        .eq('id', departmentId)
        .single();

      if (deptErr || !dept) {
        return errorResponse('Departamento no encontrado');
      }

      // Check for global free days setting first (highest priority)
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('global_free_days_enabled, global_free_days_value')
        .limit(1)
        .maybeSingle();

      const globalFreeDaysEnabled = appSettings?.global_free_days_enabled ?? false;
      const globalFreeDaysValue = appSettings?.global_free_days_value ?? null;

      // Get worker's team, work group, and vacation_days_adjustment to determine maxDays
      // Priority: 1. Global setting, 2. Department manual, 3. Work group, 4. Department default
      let maxDays: number;
      if (globalFreeDaysEnabled && globalFreeDaysValue !== null) {
        maxDays = globalFreeDaysValue;
        console.log(`Using GLOBAL free days: ${maxDays}`);
      } else if (dept.manual_free_days_enabled && dept.manual_free_days_value !== null) {
        maxDays = dept.manual_free_days_value;
      } else {
        maxDays = dept.max_days_per_employee;
      }
      let vacationDaysAdjustment = 0;

      const { data: worker } = await supabase
        .from('workers')
        .select('worker_team_id, work_group_id, vacation_days_adjustment')
        .eq('worker_number', workerNumber)
        .eq('department_id', departmentId)
        .single();

      // Helper: compute remaining free days for a work group from annual calendar
      const computeRemainingFreeDays = async (workGroupId: string, groupMaxFreeDays: number) => {
        try {
          // Use the latest annual calendar available for this department
          const { data: latestCalendar } = await supabase
            .from('annual_calendars')
            .select('id, year')
            .eq('department_id', departmentId)
            .order('year', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!latestCalendar?.id) {
            return groupMaxFreeDays;
          }

          const { data: calendarDays } = await supabase
            .from('annual_calendar_days')
            .select('day_type, group_id, group_id_2')
            .eq('calendar_id', latestCalendar.id)
            .in('day_type', ['vacaciones_grupo', 'vacaciones_generales']);

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
          return Math.max(0, remaining);
        } catch (e) {
          console.error('Error computing remaining free days:', e);
          return groupMaxFreeDays;
        }
      };

      if (worker) {
        vacationDaysAdjustment = worker.vacation_days_adjustment || 0;

        // Determine work group: direct assignment first, then via team mapping
        let workGroupId: string | null = worker.work_group_id || null;

        if (!workGroupId && worker.worker_team_id) {
          const { data: workGroupTeam } = await supabase
            .from('work_group_teams')
            .select('work_group_id')
            .eq('worker_team_id', worker.worker_team_id)
            .single();

          if (workGroupTeam?.work_group_id) {
            workGroupId = workGroupTeam.work_group_id;
          }
        }

        // Only compute from work group if neither global nor manual mode is enabled
        if (workGroupId && !globalFreeDaysEnabled && !dept.manual_free_days_enabled) {
          const { data: workGroup } = await supabase
            .from('work_groups')
            .select('max_free_days, free_days_deduction')
            .eq('id', workGroupId)
            .single();

          if (workGroup?.max_free_days !== null && workGroup?.max_free_days !== undefined) {
            maxDays = await computeRemainingFreeDays(workGroupId, workGroup.max_free_days);
            // Apply group-level deduction
            if (workGroup?.free_days_deduction) {
              maxDays = maxDays - workGroup.free_days_deduction;
            }
            console.log(`Using remaining free days: ${maxDays} for worker ${workerNumber} (group ${workGroupId}, deduction: ${workGroup?.free_days_deduction || 0})`);
          }
        }
      }

      // Count days already used by this worker ACROSS ALL DEPARTMENTS (approved requests only)
      // This preserves vacation history when worker changes departments
      const { data: approvedRequests, error: approvedError } = await supabase
        .from('vacation_requests')
        .select('id')
        .eq('worker_number', workerNumber)
        .eq('status', 'APPROVED');

      if (approvedError) {
        console.error('Error checking approved requests:', approvedError);
        return errorResponse('Error al verificar solicitudes');
      }

      let usedDays = 0;
      if (approvedRequests && approvedRequests.length > 0) {
        const requestIds = approvedRequests.map(r => r.id);
        const { data: approvedDates, error: datesError } = await supabase
          .from('vacation_request_dates')
          .select('id, half_day')
          .in('vacation_request_id', requestIds);

        if (!datesError && approvedDates) {
          usedDays = approvedDates.reduce((sum, d) => sum + (d.half_day ? 0.5 : 1), 0);
        }
      }

      // Apply vacation_days_adjustment: negative values reduce available days (add to used days)
      // e.g., if adjustment is -3, worker has 3 fewer days available (as if they used 3 more)
      usedDays = usedDays - vacationDaysAdjustment;
      console.log(`Worker ${workerNumber} vacation_days_adjustment: ${vacationDaysAdjustment}, effective usedDays: ${usedDays}`);

      // Check for pending requests in current department only
      const { data: pendingRequests } = await supabase
        .from('vacation_requests')
        .select('id')
        .eq('department_id', departmentId)
        .eq('worker_number', workerNumber)
        .eq('status', 'PENDING');

      const hasPendingRequest = pendingRequests && pendingRequests.length > 0;

      return new Response(
        JSON.stringify({ 
          success: true, 
          usedDays,
          maxDays,
          requireAllDays: dept.require_all_days !== false,
          hasPendingRequest
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle get-blocked-days-by-concurrency action with AUTOMATIC CALCULATION
    if (input.action === 'get-blocked-days-by-concurrency') {
      const { departmentId, workerNumber } = input;
      
      if (!departmentId) {
        return errorResponse('Faltan parámetros requeridos');
      }

      console.log(`Calculating blocked days for department ${departmentId}, worker ${workerNumber}`);

      // Check if auto_block_by_concurrency is enabled for this department and get manual limit
      const { data: deptConfig } = await supabase
        .from('departments')
        .select('auto_block_by_concurrency, max_concurrent_workers_global')
        .eq('id', departmentId)
        .single();

      const manualLimit = deptConfig?.max_concurrent_workers_global ?? null;
      console.log(`Department config: auto_block=${deptConfig?.auto_block_by_concurrency}, manual_limit=${manualLimit}`);

      // Check for manually blocked days (is_unblocked = false in department_day_overrides)
      const { data: manuallyBlockedOverrides } = await supabase
        .from('department_day_overrides')
        .select('date')
        .eq('department_id', departmentId)
        .eq('is_unblocked', false);

      const manuallyBlockedDays = (manuallyBlockedOverrides || []).map((o: any) => o.date);

      // If auto_block_by_concurrency is disabled, only return manually blocked days
      if (deptConfig?.auto_block_by_concurrency === false) {
        console.log('auto_block_by_concurrency is disabled for this department, returning only manually blocked days:', manuallyBlockedDays.length);
        return new Response(
          JSON.stringify({ success: true, blockedDays: manuallyBlockedDays }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get the worker's group info
      let workerGroupId: string | null = null;
      
      if (workerNumber) {
        const { data: worker } = await supabase
          .from('workers')
          .select('worker_team_id')
          .eq('worker_number', workerNumber)
          .eq('department_id', departmentId)
          .single();

        if (worker?.worker_team_id) {
          const { data: workGroupTeam } = await supabase
            .from('work_group_teams')
            .select('work_group_id')
            .eq('worker_team_id', worker.worker_team_id)
            .single();

          if (workGroupTeam?.work_group_id) {
            workerGroupId = workGroupTeam.work_group_id;
          }
        }
      }

      // Determine which years we need to evaluate based on the configured vacation period
      // (department_availabilities represents the Periodo Vacacional: days that are available to request)
      const { data: deptAvail } = await supabase
        .from('department_availabilities')
        .select('date')
        .eq('department_id', departmentId);

      const availDates = (deptAvail || []).map((d: any) => d.date);
      const availDateSet = new Set(availDates);

      const years = Array.from(
        new Set(
          availDates
            .map((ds: string) => Number(String(ds).slice(0, 4)))
            .filter((y: number) => Number.isFinite(y))
        )
      );

      if (years.length === 0) {
        console.log('No department_availabilities found -> no blocking');
        return new Response(
          JSON.stringify({ success: true, blockedDays: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Precompute vacation period days per year (weekdays only)
      const vacationPeriodDaysByYear = new Map<number, number>();
      for (const y of years) {
        const count = availDates.filter((ds: string) => {
          if (!String(ds).startsWith(String(y))) return false;
          const dt = new Date(ds + 'T00:00:00');
          const dow = dt.getDay();
          return dow !== 0 && dow !== 6;
        }).length;
        vacationPeriodDaysByYear.set(y, count);
        console.log(`Vacation period days for ${y} (from department_availabilities): ${count}`);
      }

      // If there are no vacation period weekdays in any year, nothing to block
      const hasAnyPeriodDays = Array.from(vacationPeriodDaysByYear.values()).some(v => v > 0);
      if (!hasAnyPeriodDays) {
        return new Response(
          JSON.stringify({ success: true, blockedDays: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ====== CALCULATE GROUP LIMIT (per year) ======
      const groupLimitByYear = new Map<number, number>();
      if (workerGroupId) {
        // Get max_free_days and max_concurrent_workers (manual limit) for this group
        const { data: groupData } = await supabase
          .from('work_groups')
          .select('max_free_days, max_concurrent_workers')
          .eq('id', workerGroupId)
          .single();

        const groupMaxFreeDays = groupData?.max_free_days ?? null;
        const groupManualLimit = groupData?.max_concurrent_workers ?? null;

        // If manual limit is set, use it for all years
        if (groupManualLimit !== null && groupManualLimit > 0) {
          for (const y of years) {
            groupLimitByYear.set(y, groupManualLimit);
            console.log(`Group ${workerGroupId} ${y}: Using manual limit ${groupManualLimit}`);
          }
        } else if (groupMaxFreeDays !== null) {
          // Otherwise calculate dynamically
          // Count workers in this group (not on leave)
          const { data: groupTeams } = await supabase
            .from('work_group_teams')
            .select('worker_team_id')
            .eq('work_group_id', workerGroupId);

          const groupTeamIds = (groupTeams || []).map((t: any) => t.worker_team_id);

          if (groupTeamIds.length > 0) {
            const { count: groupWorkerCount } = await supabase
              .from('workers')
              .select('id', { count: 'exact', head: true })
              .eq('department_id', departmentId)
              .eq('is_on_leave', false)
              .in('worker_team_id', groupTeamIds);

            if (groupWorkerCount && groupWorkerCount > 0) {
              for (const y of years) {
                const periodDays = vacationPeriodDaysByYear.get(y) || 0;
                if (periodDays <= 0) continue;
                const limit = Math.ceil((groupWorkerCount * groupMaxFreeDays) / periodDays);
                groupLimitByYear.set(y, limit);
                console.log(`Group ${workerGroupId} ${y}: ${groupWorkerCount} workers × ${groupMaxFreeDays} days / ${periodDays} period days = limit ${limit}`);
              }
            }
          }
        }
      }

      // ====== CALCULATE DEPARTMENT LIMIT (per year) ======
      const departmentLimitByYear = new Map<number, number>();

      // Get all workers in department (not on leave) and their groups' max_free_days
      const { data: deptWorkers } = await supabase
        .from('workers')
        .select('id, worker_team_id')
        .eq('department_id', departmentId)
        .eq('is_on_leave', false);

      const deptWorkerCount = deptWorkers?.length || 0;

      if (deptWorkerCount > 0) {
        const allTeamIds = [...new Set((deptWorkers || []).map((w: any) => w.worker_team_id).filter(Boolean))];

        const { data: allGroupTeams } = allTeamIds.length
          ? await supabase
              .from('work_group_teams')
              .select('worker_team_id, work_group_id')
              .in('worker_team_id', allTeamIds)
          : { data: [] as any[] };

        const teamToGroup = new Map<string, string>();
        (allGroupTeams || []).forEach((t: any) => teamToGroup.set(t.worker_team_id, t.work_group_id));

        const { data: allGroups } = await supabase
          .from('work_groups')
          .select('id, max_free_days')
          .eq('department_id', departmentId);

        const groupMaxFreeDaysMap = new Map<string, number>();
        (allGroups || []).forEach((g: any) => {
          if (g.max_free_days !== null) groupMaxFreeDaysMap.set(g.id, g.max_free_days);
        });

        // Sum up total free days across all workers (this is year-independent in our model)
        let totalFreeDays = 0;
        let workersWithFreeDays = 0;

        for (const worker of (deptWorkers || [])) {
          if (!worker.worker_team_id) continue;
          const groupId = teamToGroup.get(worker.worker_team_id);
          if (!groupId) continue;
          const freeDays = groupMaxFreeDaysMap.get(groupId);
          if (freeDays === undefined) continue;
          totalFreeDays += freeDays;
          workersWithFreeDays++;
        }

        if (workersWithFreeDays > 0) {
          for (const y of years) {
            const periodDays = vacationPeriodDaysByYear.get(y) || 0;
            if (periodDays <= 0) continue;
            const limit = Math.ceil(totalFreeDays / periodDays);
            departmentLimitByYear.set(y, limit);
            console.log(`Department ${y}: ${workersWithFreeDays} workers with ${totalFreeDays} total days / ${periodDays} period days = limit ${limit}`);
          }
        }
      }

      // If no limits can be calculated AND no manual limit is set, no blocking
      if (groupLimitByYear.size === 0 && departmentLimitByYear.size === 0 && manualLimit === null) {
        console.log('No limits could be calculated and no manual limit, no blocking');
        return new Response(
          JSON.stringify({ success: true, blockedDays: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If manual limit is set, use it for all years
      if (manualLimit !== null && manualLimit > 0) {
        for (const y of years) {
          departmentLimitByYear.set(y, manualLimit);
          console.log(`Using manual department limit for ${y}: ${manualLimit}`);
        }
      }

      // Get all ACTIVE vacation requests for this department.
      // IMPORTANT: days must block as soon as the request is created (PENDING counts),
      // and must unblock when manager/admin rejects.
      const { data: activeRequests } = await supabase
        .from('vacation_requests')
        .select('id, worker_number, status, manager_status')
        .eq('department_id', departmentId)
        .in('status', ['PENDING', 'APPROVED']);

      const effectiveRequests = (activeRequests || []).filter((r: any) =>
        r.status !== 'REJECTED' && r.manager_status !== 'REJECTED'
      );

      if (effectiveRequests.length === 0) {
        return new Response(
          JSON.stringify({ success: true, blockedDays: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const requestIds = effectiveRequests.map((r: any) => r.id);

      // Get dates from active requests
      const { data: activeDates } = await supabase
        .from('vacation_request_dates')
        .select('date, vacation_request_id')
        .in('vacation_request_id', requestIds);

      if (!activeDates || activeDates.length === 0) {
        return new Response(
          JSON.stringify({ success: true, blockedDays: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Build a map of request_id -> worker_number
      const requestToWorker = new Map<string, string>();
      effectiveRequests.forEach((r: any) => requestToWorker.set(r.id, r.worker_number));

      // Get workers with their teams for group-based counting
      const workerNumbers = [...new Set(effectiveRequests.map((r: any) => r.worker_number))];
      const { data: workers } = await supabase
        .from('workers')
        .select('worker_number, worker_team_id')
        .eq('department_id', departmentId)
        .in('worker_number', workerNumbers);

      // Build worker -> team map
      const workerToTeam = new Map<string, string | null>();
      workers?.forEach((w: any) => workerToTeam.set(w.worker_number, w.worker_team_id));

      // Get team -> group map
      const teamIds = [...new Set((workers || []).map((w: any) => w.worker_team_id).filter(Boolean) || [])];
      const { data: workGroupTeamsData } = await supabase
        .from('work_group_teams')
        .select('worker_team_id, work_group_id')
        .in('worker_team_id', teamIds);

      const teamToGroupMap = new Map<string, string>();
      workGroupTeamsData?.forEach((wgt: any) => teamToGroupMap.set(wgt.worker_team_id, wgt.work_group_id));

      // Count workers per date (global) and per date per group
      const globalCountPerDate = new Map<string, number>();
      const groupCountPerDate = new Map<string, Map<string, number>>();

      for (const dateEntry of activeDates) {
        const date = dateEntry.date;
        const workerNum = requestToWorker.get(dateEntry.vacation_request_id);

        // Count for global limit (each request counts as 1 absence for that day, regardless of half_day)
        globalCountPerDate.set(date, (globalCountPerDate.get(date) || 0) + 1);

        // Count for group limit
        if (workerNum) {
          const teamId = workerToTeam.get(workerNum);
          if (teamId) {
            const grpId = teamToGroupMap.get(teamId);
            if (grpId) {
              if (!groupCountPerDate.has(date)) {
                groupCountPerDate.set(date, new Map());
              }
              const groupMap = groupCountPerDate.get(date)!;
              groupMap.set(grpId, (groupMap.get(grpId) || 0) + 1);
            }
          }
        }
      }

      // Determine blocked days (only within Periodo Vacacional = department_availabilities)
      const blockedDays: string[] = [];

      console.log(`get-blocked: Checking ${availDates.length} dates, workerGroupId=${workerGroupId}`);
      console.log(`get-blocked: groupLimitByYear=${JSON.stringify([...groupLimitByYear.entries()])}`);
      console.log(`get-blocked: departmentLimitByYear=${JSON.stringify([...departmentLimitByYear.entries()])}`);

      for (const date of availDates) {
        // Only consider valid YYYY-MM-DD
        const year = Number(String(date).slice(0, 4));
        if (!Number.isFinite(year)) continue;

        const deptLimitForYear = departmentLimitByYear.get(year) ?? null;
        const groupLimitForYear = workerGroupId ? (groupLimitByYear.get(year) ?? null) : null;

        // If neither limit exists for that year, can't block it
        if (!deptLimitForYear && !groupLimitForYear) continue;

        let isBlocked = false;

        const globalCount = globalCountPerDate.get(date) || 0;
        const groupMap = groupCountPerDate.get(date);
        const groupCount = workerGroupId ? (groupMap?.get(workerGroupId) || 0) : 0;

        // Department capacity check
        if (deptLimitForYear && globalCount >= deptLimitForYear) {
          isBlocked = true;
        }

        // Group capacity check (only for this worker's group)
        if (!isBlocked && groupLimitForYear && workerGroupId && groupCount >= groupLimitForYear) {
          isBlocked = true;
        }

        if (isBlocked) {
          console.log(`get-blocked: ${date} BLOCKED (globalCount=${globalCount}/${deptLimitForYear}, groupCount=${groupCount}/${groupLimitForYear})`);
          blockedDays.push(date);
        }
      }

      // Add manually blocked days (from department_day_overrides with is_unblocked = false)
      // These were already fetched at the beginning of this action
      for (const manualDate of manuallyBlockedDays) {
        if (!blockedDays.includes(manualDate)) {
          blockedDays.push(manualDate);
        }
      }

      // Check for admin overrides - remove any manually unblocked days
      const { data: overrides } = await supabase
        .from('department_day_overrides')
        .select('date')
        .eq('department_id', departmentId)
        .eq('is_unblocked', true);

      if (overrides && overrides.length > 0) {
        const overrideDates = new Set(overrides.map((o: any) => o.date));
        const filteredBlockedDays = blockedDays.filter(d => !overrideDates.has(d));
        console.log(`get-blocked: ${blockedDays.length - filteredBlockedDays.length} days unblocked by admin override`);
        
        return new Response(
          JSON.stringify({ success: true, blockedDays: filteredBlockedDays }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`get-blocked: Returning ${blockedDays.length} blocked days for worker ${workerNumber}`);

      return new Response(
        JSON.stringify({ success: true, blockedDays }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Original vacation request submission logic
    const requestInput = input as VacationRequestInput;

    console.log("Received vacation request submission for token:", requestInput.token);

    // Validate required fields with specific error messages
    const missingFields: string[] = [];
    if (!requestInput.token) missingFields.push('token');
    if (!requestInput.employeeName) missingFields.push('nombre');
    if (!requestInput.employeeEmail) missingFields.push('email');
    if (!requestInput.workerNumber) missingFields.push('número de fichar');
    if (!requestInput.signature) missingFields.push('firma');
    if (!requestInput.selectedDates?.length) missingFields.push('días seleccionados');

    if (missingFields.length > 0) {
      console.error('Missing required fields:', { 
        token: !!requestInput.token, 
        name: !!requestInput.employeeName, 
        email: !!requestInput.employeeEmail, 
        workerNumber: !!requestInput.workerNumber, 
        signature: !!requestInput.signature, 
        dates: requestInput.selectedDates?.length,
        missingFields
      });
      return errorResponse(`Faltan campos obligatorios: ${missingFields.join(', ')}`);
    }

    // Validate email format
    if (!isValidEmail(requestInput.employeeEmail)) {
      return errorResponse('Formato de email inválido');
    }

    // Validate worker number (alphanumeric, 1-20 chars)
    const sanitizedWorkerNumber = sanitizeText(requestInput.workerNumber, 20);
    if (sanitizedWorkerNumber.length < 1 || !/^[a-zA-Z0-9]+$/.test(sanitizedWorkerNumber)) {
      return errorResponse('Número de fichar inválido');
    }

    // Validate dates format - selectedDates is array of {date, halfDay}
    for (const dateItem of requestInput.selectedDates) {
      if (!dateItem || typeof dateItem !== 'object' || !dateItem.date) {
        return errorResponse(`Formato de fecha inválido: ${JSON.stringify(dateItem)}`);
      }
      if (!isValidDate(dateItem.date)) {
        return errorResponse(`Formato de fecha inválido: ${dateItem.date}`);
      }
    }

    // Validate signature size (max 500KB base64)
    if (requestInput.signature.length > 500000) {
      return errorResponse('La firma es demasiado grande');
    }

    console.log('Fetching department for token:', requestInput.token);

    // Fetch department by token (including require_all_days)
    const { data: department, error: deptError } = await supabase
      .from('departments')
      .select('id, name, max_days_per_employee, require_all_days, manager_email')
      .eq('public_token', requestInput.token)
      .single();

    if (deptError || !department) {
      console.error('Department not found for token:', requestInput.token, deptError);
      return errorResponse('Token de departamento inválido');
    }

    console.log('Department found:', department.id, department.name, 'require_all_days:', department.require_all_days);

    // Get worker's vacation_days_adjustment
    let vacationDaysAdjustment = 0;
    const { data: workerData } = await supabase
      .from('workers')
      .select('vacation_days_adjustment')
      .eq('worker_number', sanitizedWorkerNumber)
      .eq('department_id', department.id)
      .maybeSingle();
    
    if (workerData) {
      vacationDaysAdjustment = workerData.vacation_days_adjustment || 0;
    }

    // Count days already used by this worker in this department (approved requests only)
    const { data: approvedRequests, error: approvedError } = await supabase
      .from('vacation_requests')
      .select('id')
      .eq('department_id', department.id)
      .eq('worker_number', sanitizedWorkerNumber)
      .eq('status', 'APPROVED');

    if (approvedError) {
      console.error('Error checking approved requests:', approvedError);
      return errorResponse('Error al verificar solicitudes aprobadas');
    }

    let usedDays = 0;
    if (approvedRequests && approvedRequests.length > 0) {
      // Count total days from approved requests, considering half days
      const requestIds = approvedRequests.map(r => r.id);
      const { data: approvedDates, error: datesCountError } = await supabase
        .from('vacation_request_dates')
        .select('id, half_day')
        .in('vacation_request_id', requestIds);

      if (datesCountError) {
        console.error('Error counting approved dates:', datesCountError);
        return errorResponse('Error al contar días aprobados');
      }

      // Sum days: half_day = 0.5, full day = 1
      usedDays = (approvedDates || []).reduce((sum, d) => sum + (d.half_day ? 0.5 : 1), 0);
    }

    // Apply vacation_days_adjustment: negative values reduce available days (add to used days)
    // e.g., if adjustment is -3, worker has 3 fewer days available (as if they used 3 more)
    usedDays = usedDays - vacationDaysAdjustment;
    console.log(`Worker ${sanitizedWorkerNumber} vacation_days_adjustment: ${vacationDaysAdjustment}, effective usedDays: ${usedDays}`);

    const remainingDays = department.max_days_per_employee - usedDays;
    console.log(`Worker ${sanitizedWorkerNumber} has used ${usedDays} days, ${remainingDays} remaining`);

    // Check if worker has already used all days
    if (remainingDays <= 0) {
      return errorResponse(`Ya has utilizado todos tus ${department.max_days_per_employee} días de vacaciones`);
    }

    // Check if there's already a pending request
    const { data: pendingRequests, error: pendingError } = await supabase
      .from('vacation_requests')
      .select('id, status')
      .eq('department_id', department.id)
      .eq('worker_number', sanitizedWorkerNumber)
      .eq('status', 'PENDING');

    if (pendingError) {
      console.error('Error checking pending requests:', pendingError);
      return errorResponse('Error al verificar solicitudes pendientes');
    }

    if (pendingRequests && pendingRequests.length > 0) {
      return errorResponse('Ya tienes una solicitud pendiente para este departamento. Espera a que sea procesada.');
    }

    // Calculate total days being requested (considering half days)
    const totalRequestedDays = requestInput.selectedDates.reduce((sum: number, d: SelectedDateInput) => sum + (d.halfDay ? 0.5 : 1), 0);
    console.log(`Total requested days: ${totalRequestedDays}, remaining: ${remainingDays}`);

    // Validate number of dates based on require_all_days setting
    const requireAllDays = department.require_all_days !== false; // Default to true
    
    if (requireAllDays) {
      // Must select exactly the remaining days
      if (totalRequestedDays !== remainingDays) {
        return errorResponse(`Debes seleccionar exactamente ${remainingDays} días`);
      }
    } else {
      // Can select 1 to remainingDays
      if (totalRequestedDays < 0.5) {
        return errorResponse('Debes seleccionar al menos medio día');
      }
      if (totalRequestedDays > remainingDays) {
        return errorResponse(`Solo puedes seleccionar hasta ${remainingDays} días más`);
      }
    }

    // Validate all selected dates exist in department_availabilities
    const { data: availableDates, error: availError } = await supabase
      .from('department_availabilities')
      .select('date')
      .eq('department_id', department.id);

    if (availError) {
      console.error('Error fetching available dates:', availError);
      return errorResponse('Error al validar fechas');
    }

    const availableDateSet = new Set(availableDates?.map(d => d.date) || []);
    const invalidDates = requestInput.selectedDates.filter((item: SelectedDateInput) => !availableDateSet.has(item.date));

    if (invalidDates.length > 0) {
      return errorResponse(`Fechas no disponibles: ${invalidDates.map((d: SelectedDateInput) => d.date).join(', ')}`);
    }

    // Sanitize text inputs
    const sanitizedName = sanitizeText(requestInput.employeeName, 100);
    const sanitizedEmail = requestInput.employeeEmail.trim().slice(0, 255);
    const sanitizedNotes = requestInput.notes ? sanitizeText(requestInput.notes, 1000) : null;

    console.log('Validating daily capacity (group + department) before creating request...');

    try {
      const selectedDateStrs = requestInput.selectedDates.map(d => d.date);

      // Reuse the same automatic calculation rules used by get-blocked-days-by-concurrency
      // so we never exceed the limits even if the UI is stale.

      // Worker -> group
      let workerGroupId: string | null = null;
      const { data: w } = await supabase
        .from('workers')
        .select('worker_team_id')
        .eq('worker_number', sanitizedWorkerNumber)
        .eq('department_id', department.id)
        .single();

      if (w?.worker_team_id) {
        const { data: wgt } = await supabase
          .from('work_group_teams')
          .select('work_group_id')
          .eq('worker_team_id', w.worker_team_id)
          .single();
        workerGroupId = wgt?.work_group_id ?? null;
      }

      // Determine years from the selected dates (requests may target next year)
      const years = Array.from(
        new Set(
          selectedDateStrs
            .map(ds => Number(String(ds).slice(0, 4)))
            .filter(y => Number.isFinite(y))
        )
      );

      // Use department_availabilities as the canonical Periodo Vacacional
      const { data: deptAvail } = await supabase
        .from('department_availabilities')
        .select('date')
        .eq('department_id', department.id)
        .in('date', selectedDateStrs.length ? selectedDateStrs : ['0000-00-00']);

      // NOTE: above query only validates existence of selected dates in availabilities; period-day count uses full year availability
      const { data: deptAvailAll } = await supabase
        .from('department_availabilities')
        .select('date')
        .eq('department_id', department.id);

      const availAllDates = (deptAvailAll || []).map((d: any) => d.date);

       // Precompute vacation period days per year (weekdays only) using all configured Periodo Vacacional dates
      const vacationPeriodDaysByYear = new Map<number, number>();
      for (const y of years) {
        const count = availAllDates.filter((ds: string) => {
          if (!String(ds).startsWith(String(y))) return false;
          const dt = new Date(ds + 'T00:00:00');
          const dow = dt.getDay();
          return dow !== 0 && dow !== 6;
        }).length;
        vacationPeriodDaysByYear.set(y, count);
        console.log(`INSERT: Vacation period days for ${y}: ${count}`);
      }

      // If any requested year has no configured period days, fail fast (prevents using an unconfigured year like 2025)
      for (const y of years) {
        const periodDays = vacationPeriodDaysByYear.get(y) || 0;
        if (periodDays <= 0) {
          return errorResponse(`No hay período vacacional configurado para el año ${y}`);
        }
      }

      // Group limit per year
      const groupLimitByYear = new Map<number, number>();
      if (workerGroupId) {
        const { data: groupData } = await supabase
          .from('work_groups')
          .select('max_free_days')
          .eq('id', workerGroupId)
          .single();

        const groupMaxFreeDays = groupData?.max_free_days ?? null;

        const { data: groupTeams } = await supabase
          .from('work_group_teams')
          .select('worker_team_id')
          .eq('work_group_id', workerGroupId);

        const groupTeamIds = (groupTeams || []).map((t: any) => t.worker_team_id);

        if (groupTeamIds.length > 0 && groupMaxFreeDays !== null) {
          const { count: groupWorkerCount } = await supabase
            .from('workers')
            .select('id', { count: 'exact', head: true })
            .eq('department_id', department.id)
            .eq('is_on_leave', false)
            .in('worker_team_id', groupTeamIds);

          if (groupWorkerCount && groupWorkerCount > 0) {
            for (const y of years) {
              const periodDays = vacationPeriodDaysByYear.get(y) || 0;
              if (periodDays <= 0) continue;
              const limit = Math.ceil((groupWorkerCount * groupMaxFreeDays) / periodDays);
              groupLimitByYear.set(y, limit);
              console.log(`INSERT: Group ${workerGroupId} ${y}: ${groupWorkerCount} × ${groupMaxFreeDays} / ${periodDays} = ${limit}`);
            }
          }
        }
      }

      // Department limit per year
      const departmentLimitByYear = new Map<number, number>();
      const { data: deptWorkers } = await supabase
        .from('workers')
        .select('worker_number, worker_team_id')
        .eq('department_id', department.id)
        .eq('is_on_leave', false);

      if ((deptWorkers || []).length > 0) {
        const allTeamIds = [...new Set((deptWorkers || []).map((ww: any) => ww.worker_team_id).filter(Boolean))];

        const { data: allGroupTeams } = allTeamIds.length
          ? await supabase
              .from('work_group_teams')
              .select('worker_team_id, work_group_id')
              .in('worker_team_id', allTeamIds)
          : { data: [] as any[] };

        const teamToGroup = new Map<string, string>();
        (allGroupTeams || []).forEach((t: any) => teamToGroup.set(t.worker_team_id, t.work_group_id));

        const { data: allGroups } = await supabase
          .from('work_groups')
          .select('id, max_free_days')
          .eq('department_id', department.id);

        const groupMaxFreeDaysMap = new Map<string, number>();
        (allGroups || []).forEach((g: any) => {
          if (g.max_free_days !== null) groupMaxFreeDaysMap.set(g.id, g.max_free_days);
        });

        let totalFreeDays = 0;
        let workersWithFreeDays = 0;
        for (const ww of (deptWorkers || [])) {
          if (!ww.worker_team_id) continue;
          const grpId = teamToGroup.get(ww.worker_team_id);
          if (!grpId) continue;
          const freeDays = groupMaxFreeDaysMap.get(grpId);
          if (freeDays === undefined) continue;
          totalFreeDays += freeDays;
          workersWithFreeDays++;
        }

        if (workersWithFreeDays > 0) {
          for (const y of years) {
            const periodDays = vacationPeriodDaysByYear.get(y) || 0;
            if (periodDays <= 0) continue;
            const limit = Math.ceil(totalFreeDays / periodDays);
            departmentLimitByYear.set(y, limit);
            console.log(`INSERT: Department ${y}: ${totalFreeDays} / ${periodDays} = ${limit}`);
          }
        }
      }

      // Active requests (PENDING + APPROVED) that are not rejected by manager/admin
      const { data: activeRequests } = await supabase
        .from('vacation_requests')
        .select('id, worker_number, status, manager_status')
        .eq('department_id', department.id)
        .in('status', ['PENDING', 'APPROVED']);

      const effectiveRequests = (activeRequests || []).filter((r: any) =>
        r.status !== 'REJECTED' && r.manager_status !== 'REJECTED'
      );

      const requestIds = effectiveRequests.map((r: any) => r.id);

      // Only fetch relevant dates (dates we are trying to request)
      const { data: activeDates } = requestIds.length
        ? await supabase
            .from('vacation_request_dates')
            .select('date, vacation_request_id')
            .in('vacation_request_id', requestIds)
            .in('date', selectedDateStrs)
        : { data: [] as any[] };

      // Map request_id -> worker
      const requestToWorker = new Map<string, string>();
      effectiveRequests.forEach((r: any) => requestToWorker.set(r.id, r.worker_number));

      // worker -> team
      const allWorkerNumbers = [...new Set(effectiveRequests.map((r: any) => r.worker_number))];
      const { data: workers } = allWorkerNumbers.length
        ? await supabase
            .from('workers')
            .select('worker_number, worker_team_id')
            .eq('department_id', department.id)
            .in('worker_number', allWorkerNumbers)
        : { data: [] as any[] };

      const workerToTeam = new Map<string, string | null>();
      (workers || []).forEach((ww: any) => workerToTeam.set(ww.worker_number, ww.worker_team_id));

      // team -> group
      const teamIds = [...new Set((workers || []).map((ww: any) => ww.worker_team_id).filter(Boolean) || [])];
      const { data: workGroupTeamsData } = teamIds.length
        ? await supabase
            .from('work_group_teams')
            .select('worker_team_id, work_group_id')
            .in('worker_team_id', teamIds)
        : { data: [] as any[] };

      const teamToGroupMap = new Map<string, string>();
      (workGroupTeamsData || []).forEach((t: any) => teamToGroupMap.set(t.worker_team_id, t.work_group_id));

      // Counts
      const globalCountPerDate = new Map<string, number>();
      const groupCountPerDate = new Map<string, Map<string, number>>();

      for (const entry of (activeDates || [])) {
        const date = entry.date;
        const workerNum = requestToWorker.get(entry.vacation_request_id);

        globalCountPerDate.set(date, (globalCountPerDate.get(date) || 0) + 1);

        if (workerNum) {
          const teamId = workerToTeam.get(workerNum);
          if (teamId) {
            const grpId = teamToGroupMap.get(teamId);
            if (grpId) {
              if (!groupCountPerDate.has(date)) groupCountPerDate.set(date, new Map());
              const gm = groupCountPerDate.get(date)!;
              gm.set(grpId, (gm.get(grpId) || 0) + 1);
            }
          }
        }
      }

      // Validate each selected date using per-year limits
      const blockedDates: string[] = [];
      for (const date of selectedDateStrs) {
        const year = Number(String(date).slice(0, 4));
        if (!Number.isFinite(year)) continue;

        const deptLimit = departmentLimitByYear.get(year) ?? null;
        const grpLimit = workerGroupId ? (groupLimitByYear.get(year) ?? null) : null;

        if (deptLimit !== null) {
          const current = globalCountPerDate.get(date) || 0;
          if (current + 1 > deptLimit) blockedDates.push(date);
        }

        if (workerGroupId && grpLimit !== null) {
          const gm = groupCountPerDate.get(date);
          const current = gm?.get(workerGroupId) || 0;
          if (current + 1 > grpLimit) blockedDates.push(date);
        }
      }

      if (blockedDates.length > 0) {
        const uniqueBlocked = [...new Set(blockedDates)];
        return new Response(
          JSON.stringify({
            success: false,
            error: "Capacidad diaria alcanzada",
            blockedDates: uniqueBlocked,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

    } catch (e) {
      console.error('Capacity validation failed:', e);
      return errorResponse('Error al validar capacidad diaria');
    }

    console.log('Creating vacation request...');
    // Create vacation request
    const { data: request, error: requestError } = await supabase
      .from('vacation_requests')
      .insert({
        department_id: department.id,
        employee_name: sanitizedName,
        employee_email: sanitizedEmail,
        worker_number: sanitizedWorkerNumber,
        notes: sanitizedNotes,
        signature: requestInput.signature,
        status: 'PENDING',
        manager_status: 'PENDING'
      })
      .select()
      .single();

    if (requestError) {
      console.error('Error creating vacation request:', requestError);
      return errorResponse('Error al crear la solicitud');
    }

    // Insert selected dates with half_day flag
    const dateInserts = requestInput.selectedDates.map((item: SelectedDateInput) => ({
      vacation_request_id: request.id,
      date: item.date,
      half_day: item.halfDay || false
    }));

    const { error: datesError } = await supabase
      .from('vacation_request_dates')
      .insert(dateInserts);

    if (datesError) {
      console.error('Error inserting dates:', datesError);
      // Rollback the request
      await supabase.from('vacation_requests').delete().eq('id', request.id);
      return errorResponse('Error al guardar las fechas');
    }

    console.log('Vacation request created successfully:', request.id);

    // Format dates for email
    const formattedDates = requestInput.selectedDates.map((item: SelectedDateInput) => {
      const date = new Date(item.date + 'T00:00:00');
      const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const day = date.getDate();
      const month = months[date.getMonth()];
      const year = date.getFullYear();
      const formatted = `${day} de ${month} de ${year}`;
      return item.halfDay ? `${formatted} (medio día)` : formatted;
    });

    // Send confirmation email to worker (server-side)
    await sendEmailNotification({
      to: sanitizedEmail,
      type: 'submission_confirmation',
      data: {
        employeeName: sanitizedName,
        workerNumber: sanitizedWorkerNumber,
        departmentName: department.name,
        dates: formattedDates,
        requestId: request.id,
      }
    });

    // Send notification to manager if email is configured
    if (department.manager_email) {
      const emails = department.manager_email.split(',').map((e: string) => e.trim()).filter((e: string) => e);
      for (const email of emails) {
        await sendEmailNotification({
          to: email,
          type: 'new_request',
          requestId: request.id,
          data: {
            employeeName: sanitizedName,
            workerNumber: sanitizedWorkerNumber,
            departmentName: department.name,
            dates: formattedDates,
            requestId: request.id,
            managerPanelLink: 'https://vnprod.app/manager',
          }
        });
      }
    }

    // Check if any days became blocked after this submission and notify
    console.log('Checking for newly blocked days after request submission...');
    try {
      // Recalculate blocked days after the new request
      const { data: deptSettings } = await supabase
        .from('departments')
        .select('auto_block_by_concurrency, max_concurrent_workers_global')
        .eq('id', department.id)
        .single();

      if (deptSettings?.auto_block_by_concurrency !== false) {
        // Get updated counts including the new request
        const currentYear = new Date().getFullYear();
        
        // Get active requests for this department
        const { data: activeReqs } = await supabase
          .from('vacation_requests')
          .select('id, worker_number')
          .eq('department_id', department.id)
          .in('status', ['PENDING', 'APPROVED']);

        if (activeReqs && activeReqs.length > 0) {
          const reqIds = activeReqs.map(r => r.id);
          const { data: activeDates } = await supabase
            .from('vacation_request_dates')
            .select('date, vacation_request_id')
            .in('vacation_request_id', reqIds);

          // Count per date
          const countPerDate = new Map<string, number>();
          for (const d of (activeDates || [])) {
            countPerDate.set(d.date, (countPerDate.get(d.date) || 0) + 1);
          }

          // Calculate limit
          const { data: deptAvailAll } = await supabase
            .from('department_availabilities')
            .select('date')
            .eq('department_id', department.id);

          const periodDays = (deptAvailAll || []).filter((d: any) => {
            const ds = String(d.date);
            if (!ds.startsWith(String(currentYear))) return false;
            const dt = new Date(ds + 'T00:00:00');
            const dow = dt.getDay();
            return dow !== 0 && dow !== 6;
          }).length;

          const globalMaxFreeDays = deptSettings?.max_concurrent_workers_global;
          let deptLimit: number | null = null;
          if (globalMaxFreeDays && periodDays > 0) {
            deptLimit = Math.ceil(globalMaxFreeDays / periodDays);
          }

          // Check which dates from this request caused blocking
          const newlyBlockedDates: string[] = [];
          for (const dateItem of requestInput.selectedDates) {
            const count = countPerDate.get(dateItem.date) || 0;
            if (deptLimit !== null && count >= deptLimit) {
              // Check if already blocked before (count was exactly at limit means this request blocked it)
              if (count === deptLimit) {
                newlyBlockedDates.push(dateItem.date);
              }
            }
          }

          // Send notification and log for newly blocked dates
          if (newlyBlockedDates.length > 0) {
            const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
            
            for (const blockedDate of newlyBlockedDates) {
              const date = new Date(blockedDate + 'T00:00:00');
              const formattedBlockedDate = `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
              
              // Log audit for automatic blocking
              await supabase.from('audit_logs').insert({
                action_type: 'day_blocked_auto',
                actor_name: requestInput.employeeName,
                actor_role: 'worker',
                entity_type: 'day_blocking',
                entity_id: department.id,
                entity_data: {
                  date: blockedDate,
                  department_id: department.id,
                  department_name: department.name,
                  reason: `Límite de ${deptLimit} persona(s) alcanzado`,
                  worker_name: requestInput.employeeName,
                  worker_number: requestInput.workerNumber
                },
                details: `Día ${formattedBlockedDate} bloqueado automáticamente en ${department.name} (límite: ${deptLimit} personas)`
              });
              
              // Send email notification if manager email configured
              if (department.manager_email) {
                const emails = department.manager_email.split(',').map((e: string) => e.trim()).filter((e: string) => e);
                for (const email of emails) {
                  await sendEmailNotification({
                    to: email,
                    type: 'day_blocked',
                    data: {
                      departmentName: department.name,
                      dates: [formattedBlockedDate],
                      blockedDate: formattedBlockedDate,
                      blockedReason: `Se ha alcanzado el límite de ${deptLimit} persona(s) por día para este departamento.`,
                    }
                  });
                }
              }
              console.log(`Day ${blockedDate} blocked and logged`);
            }
          }
        }
      }
    } catch (blockCheckError) {
      console.error('Error checking for blocked days:', blockCheckError);
      // Don't fail the request if this check fails
    }

    // Return success with request data
    return new Response(
      JSON.stringify({ 
        success: true, 
        requestId: request.id,
        departmentName: department.name,
        usedDays: usedDays + totalRequestedDays,
        totalDays: department.max_days_per_employee
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in submit-vacation-request:', error);
    return errorResponse('Error interno del servidor');
  }
});
