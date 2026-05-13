import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
const serve = Deno.serve;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Total annual vacation days for all workers
const TOTAL_ANNUAL_VACATION_DAYS = 26.5;

// Helper function to sync department_availabilities and calculate max_free_days per group
async function syncVacationAvailabilities(supabase: any, departmentId: string, year: number) {
  console.log(`Syncing vacation availabilities for department ${departmentId}, year ${year}`);
  
  // Get all annual calendars for this department for the given year
  const { data: calendars } = await supabase
    .from("annual_calendars")
    .select("id")
    .eq("department_id", departmentId)
    .eq("year", year);

  if (!calendars || calendars.length === 0) {
    console.log("No annual calendar found for sync");
    return;
  }

  const calendarIds = calendars.map((c: any) => c.id);

  // Get all days marked in the annual calendar with group assignments
  const { data: allDaysData } = await supabase
    .from("annual_calendar_days")
    .select("date, day_type, group_id, group_id_2")
    .in("calendar_id", calendarIds);

  const blockedDates = new Set((allDaysData || []).map((d: any) => d.date));
  console.log(`Found ${blockedDates.size} blocked days in annual calendar`);

  // Count vacaciones_generales (applies to ALL groups)
  let generalVacationDays = 0;
  
  // Calculate vacation days per group (vacaciones_grupo type)
  const groupVacationDays: Record<string, number> = {};
  
  for (const day of (allDaysData || [])) {
    if (day.day_type === 'vacaciones_generales') {
      // General vacations apply to ALL groups
      generalVacationDays++;
    } else if (day.day_type === 'vacaciones_grupo') {
      // Count for group_id
      if (day.group_id) {
        groupVacationDays[day.group_id] = (groupVacationDays[day.group_id] || 0) + 1;
      }
      // Count for group_id_2 if different
      if (day.group_id_2 && day.group_id_2 !== day.group_id) {
        groupVacationDays[day.group_id_2] = (groupVacationDays[day.group_id_2] || 0) + 1;
      }
    }
  }

  console.log("General vacation days (applies to all):", generalVacationDays);
  console.log("Vacation days per group:", groupVacationDays);

  // NOTE: We no longer update max_free_days in work_groups table.
  // The base value (26.5) stays fixed, and remaining free days are computed
  // dynamically at runtime by subtracting calendar vacation days.
  // This ensures consistency across all workers and departments.

  console.log("Sync complete. Calendar days counted by group:");
  for (const groupId in groupVacationDays) {
    const totalUsed = (groupVacationDays[groupId] || 0) + generalVacationDays;
    console.log(`  Group ${groupId}: ${groupVacationDays[groupId]} group-specific + ${generalVacationDays} general = ${totalUsed} total, leaving ${TOTAL_ANNUAL_VACATION_DAYS - totalUsed} free days`);
  }

  // Generate all days of the year (excluding weekends - they're non-working)
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const availableDays: { date: string; half_day: boolean }[] = [];

  for (let d = new Date(yearStart); d <= yearEnd; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Skip weekends (Saturday = 6, Sunday = 0) - they are non-working
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    
    // Skip if this date is blocked by annual calendar
    if (blockedDates.has(dateStr)) continue;
    
    availableDays.push({ date: dateStr, half_day: false });
  }

  console.log(`Generated ${availableDays.length} available days for vacation`);

  // Delete existing availabilities for this department for this year
  const yearStartStr = `${year}-01-01`;
  const yearEndStr = `${year}-12-31`;
  
  await supabase
    .from("department_availabilities")
    .delete()
    .eq("department_id", departmentId)
    .gte("date", yearStartStr)
    .lte("date", yearEndStr);

  // Insert new availabilities
  if (availableDays.length > 0) {
    const toInsert = availableDays.map(d => ({
      department_id: departmentId,
      date: d.date,
      half_day: d.half_day
    }));

    // Insert in batches of 1000 to avoid limits
    const batchSize = 1000;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize);
      const { error } = await supabase
        .from("department_availabilities")
        .insert(batch);
      
      if (error) {
        console.error("Error inserting availabilities batch:", error);
      }
    }
  }

  console.log(`Successfully synced ${availableDays.length} vacation availability days`);
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, sessionToken, ...params } = await req.json();
    console.log("Annual calendar operation:", action);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate session
    const { data: session } = await supabase
      .from("manager_sessions")
      .select("manager_id, expires_at")
      .eq("token", sessionToken)
      .single();

    if (!session || new Date(session.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: "Sesión no válida" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get manager info
    const { data: manager } = await supabase
      .from("managers")
      .select("id, name, role")
      .eq("id", session.manager_id)
      .single();

    if (!manager) {
      return new Response(
        JSON.stringify({ success: false, error: "Manager no encontrado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isAdmin = manager.role === "admin";
    const isConsulta = manager.role === "consulta";

    // Get manager's assigned departments
    const { data: assignments } = await supabase
      .from("manager_department_assignments")
      .select("department_id")
      .eq("manager_id", manager.id);
    
    const assignedDepartmentIds = assignments?.map(a => a.department_id) || [];

    // Handle actions
    switch (action) {
      case "getCalendar": {
        const { departmentId, year } = params;

        // Check access
       // Allow admin and consulta roles full access, managers only to assigned departments
       if (!isAdmin && !isConsulta && !assignedDepartmentIds.includes(departmentId)) {
          return new Response(
            JSON.stringify({ success: false, error: "Sin acceso a este departamento" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get calendar
        const { data: calendar } = await supabase
          .from("annual_calendars")
          .select("*")
          .eq("department_id", departmentId)
          .eq("year", year)
          .single();

        let days: any[] = [];
        if (calendar) {
          const { data: daysData } = await supabase
            .from("annual_calendar_days")
            .select("*")
            .eq("calendar_id", calendar.id);
          days = daysData || [];
        }

        // Get work groups
        const { data: groups } = await supabase
          .from("work_groups")
          .select("*")
          .eq("department_id", departmentId)
          .order("sort_order", { ascending: true });

        // Get custom day types
        const { data: customDayTypes } = await supabase
          .from("custom_day_types")
          .select("*")
          .eq("department_id", departmentId)
          .order("sort_order", { ascending: true });

        // Get worker teams for this department
        const { data: workerTeams } = await supabase
          .from("worker_teams")
          .select("*")
          .eq("department_id", departmentId)
          .order("sort_order", { ascending: true });

        // Get work group team assignments
        const { data: workGroupTeams } = await supabase
          .from("work_group_teams")
          .select("*");

        return new Response(
          JSON.stringify({ 
            success: true, 
            calendar, 
            days, 
            groups: groups || [], 
            customDayTypes: customDayTypes || [],
            workerTeams: workerTeams || [],
            workGroupTeams: workGroupTeams || []
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "createCalendar": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden crear calendarios" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { departmentId, year, description, autoRotateGroups } = params;

        const { data: newCalendar, error } = await supabase
          .from("annual_calendars")
          .insert({
            department_id: departmentId,
            year,
            description: description || null,
            auto_rotate_groups: autoRotateGroups || false
          })
          .select()
          .single();

        if (error) {
          console.error("Error creating calendar:", error);
          return new Response(
            JSON.stringify({ success: false, error: "Error al crear calendario" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, calendar: newCalendar }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "updateCalendar": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden editar calendarios" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { calendarId, description, autoRotateGroups, infoText, infoTextAr, infoTextFr } = params;

        const updateData: any = {
          description: description || null,
          auto_rotate_groups: autoRotateGroups
        };
        
        // Only update info_text fields if they were provided in the request
        if (infoText !== undefined) {
          updateData.info_text = infoText || null;
        }
        if (infoTextAr !== undefined) {
          updateData.info_text_ar = infoTextAr || null;
        }
        if (infoTextFr !== undefined) {
          updateData.info_text_fr = infoTextFr || null;
        }

        const { error } = await supabase
          .from("annual_calendars")
          .update(updateData)
          .eq("id", calendarId);

        if (error) {
          console.error("Error updating calendar:", error);
          return new Response(
            JSON.stringify({ success: false, error: "Error al actualizar calendario" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "updateDays": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden editar días" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { calendarId, dates, dayType, legend, groupId, groupId2, customDayTypeId, autoSync } = params;

        // Get calendar info to know department and year
        const { data: calendarInfo } = await supabase
          .from("annual_calendars")
          .select("department_id, year")
          .eq("id", calendarId)
          .single();

        // Delete existing days for these dates
        await supabase
          .from("annual_calendar_days")
          .delete()
          .eq("calendar_id", calendarId)
          .in("date", dates);

        // If laboral, we just deleted - no need to insert
        if (dayType !== 'laboral') {
          const newDays = dates.map((date: string) => ({
            calendar_id: calendarId,
            date,
            day_type: dayType,
            legend: legend || null,
            group_id: groupId || null,
            group_id_2: groupId2 || null,
            custom_day_type_id: customDayTypeId || null
          }));

          const { error } = await supabase
            .from("annual_calendar_days")
            .insert(newDays);

          if (error) {
            console.error("Error inserting days:", error);
            return new Response(
              JSON.stringify({ success: false, error: "Error al actualizar días" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // Auto-sync vacation availabilities if requested
        if (autoSync && calendarInfo) {
          await syncVacationAvailabilities(supabase, calendarInfo.department_id, calendarInfo.year);
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "syncVacationAvailabilities": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden sincronizar" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { departmentId, year } = params;
        await syncVacationAvailabilities(supabase, departmentId, year);

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "createGroup": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden crear grupos" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { departmentId, name, color } = params;

        // Get max sort_order
        const { data: existingGroups } = await supabase
          .from("work_groups")
          .select("sort_order")
          .eq("department_id", departmentId)
          .order("sort_order", { ascending: false })
          .limit(1);

        const newSortOrder = (existingGroups?.[0]?.sort_order || 0) + 1;

        const { data: newGroup, error } = await supabase
          .from("work_groups")
          .insert({
            department_id: departmentId,
            name,
            color,
            sort_order: newSortOrder
          })
          .select()
          .single();

        if (error) {
          console.error("Error creating group:", error);
          return new Response(
            JSON.stringify({ success: false, error: "Error al crear grupo" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, group: newGroup }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "updateGroup": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden editar grupos" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { groupId, name, color, teamIds, maxConcurrentWorkers, freeDaysDeduction } = params;

        const updateData: any = { name, color };
        if (maxConcurrentWorkers !== undefined) {
          updateData.max_concurrent_workers = maxConcurrentWorkers;
        }
        if (freeDaysDeduction !== undefined) {
          updateData.free_days_deduction = freeDaysDeduction;
        }

        const { data: updatedGroup, error } = await supabase
          .from("work_groups")
          .update(updateData)
          .eq("id", groupId)
          .select()
          .single();

        if (error) {
          console.error("Error updating group:", error);
          return new Response(
            JSON.stringify({ success: false, error: "Error al actualizar grupo" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update team assignments if provided
        if (teamIds !== undefined) {
          // Delete existing assignments for this group
          await supabase
            .from("work_group_teams")
            .delete()
            .eq("work_group_id", groupId);

          // Insert new assignments
          if (teamIds && teamIds.length > 0) {
            const assignments = teamIds.map((teamId: string) => ({
              work_group_id: groupId,
              worker_team_id: teamId
            }));

            const { error: assignError } = await supabase
              .from("work_group_teams")
              .insert(assignments);

            if (assignError) {
              console.error("Error assigning teams to group:", assignError);
            }
          }
        }

        return new Response(
          JSON.stringify({ success: true, group: updatedGroup }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "deleteGroup": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden eliminar grupos" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { groupId } = params;

        const { error } = await supabase
          .from("work_groups")
          .delete()
          .eq("id", groupId);

        if (error) {
          console.error("Error deleting group:", error);
          return new Response(
            JSON.stringify({ success: false, error: "Error al eliminar grupo" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "createCustomDayType": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden crear categorías" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { departmentId, name, color, systemType } = params;

        // Get max sort_order
        const { data: existingTypes } = await supabase
          .from("custom_day_types")
          .select("sort_order")
          .eq("department_id", departmentId)
          .order("sort_order", { ascending: false })
          .limit(1);

        const newSortOrder = (existingTypes?.[0]?.sort_order || 0) + 1;

        const insertData: any = {
          department_id: departmentId,
          name,
          color,
          sort_order: newSortOrder
        };
        
        // Add system_type if provided (for system type color overrides)
        if (systemType) {
          insertData.system_type = systemType;
        }

        const { data: newType, error } = await supabase
          .from("custom_day_types")
          .insert(insertData)
          .select()
          .single();

        if (error) {
          console.error("Error creating custom day type:", error);
          return new Response(
            JSON.stringify({ success: false, error: "Error al crear categoría" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, customDayType: newType }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "updateCustomDayType": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden editar categorías" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { customDayTypeId, name, color } = params;

        const { error } = await supabase
          .from("custom_day_types")
          .update({ name, color })
          .eq("id", customDayTypeId);

        if (error) {
          console.error("Error updating custom day type:", error);
          return new Response(
            JSON.stringify({ success: false, error: "Error al actualizar categoría" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "deleteCustomDayType": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden eliminar categorías" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { customDayTypeId } = params;

        const { error } = await supabase
          .from("custom_day_types")
          .delete()
          .eq("id", customDayTypeId);

        if (error) {
          console.error("Error deleting custom day type:", error);
          return new Response(
            JSON.stringify({ success: false, error: "Error al eliminar categoría" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "generateNextYear": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden generar calendarios" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { calendarId } = params;

        // Get current calendar
        const { data: currentCalendar } = await supabase
          .from("annual_calendars")
          .select("*")
          .eq("id", calendarId)
          .single();

        if (!currentCalendar) {
          return new Response(
            JSON.stringify({ success: false, error: "Calendario no encontrado" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const nextYear = currentCalendar.year + 1;

        // Check if next year calendar already exists
        const { data: existing } = await supabase
          .from("annual_calendars")
          .select("id")
          .eq("department_id", currentCalendar.department_id)
          .eq("year", nextYear)
          .single();

        if (existing) {
          return new Response(
            JSON.stringify({ success: false, error: `Ya existe un calendario para ${nextYear}` }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create new calendar
        const { data: newCalendar, error: calError } = await supabase
          .from("annual_calendars")
          .insert({
            department_id: currentCalendar.department_id,
            year: nextYear,
            description: currentCalendar.description,
            auto_rotate_groups: currentCalendar.auto_rotate_groups
          })
          .select()
          .single();

        if (calError) {
          console.error("Error creating next year calendar:", calError);
          return new Response(
            JSON.stringify({ success: false, error: "Error al crear calendario" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get current days
        const { data: currentDays } = await supabase
          .from("annual_calendar_days")
          .select("*")
          .eq("calendar_id", calendarId);

        if (currentDays && currentDays.length > 0) {
          // Get groups for rotation
          const { data: groups } = await supabase
            .from("work_groups")
            .select("id, sort_order")
            .eq("department_id", currentCalendar.department_id)
            .order("sort_order", { ascending: true });

          const groupIds = groups?.map(g => g.id) || [];
          const shouldRotate = currentCalendar.auto_rotate_groups && groupIds.length > 1;

          // Create rotation map
          // Rotate so each group's days get assigned to the previous group
          // If groups are sorted [A(amarillo), B(naranja), C(azul)]
          // Days with A should get C, days with B should get A, days with C should get B
          // This makes it appear as if the vacation days "shifted" to the next group
          const rotationMap: Record<string, string> = {};
          if (shouldRotate) {
            groupIds.forEach((gid, idx) => {
              // Move to the previous group (backward rotation), wrapping around
              const prevIdx = (idx - 1 + groupIds.length) % groupIds.length;
              rotationMap[gid] = groupIds[prevIdx];
            });
            console.log("Group rotation map (backward):", rotationMap);
          }

          // Create new days
          const newDays = currentDays.map(day => {
            // Parse old date and create new date for next year
            const [year, month, dayNum] = day.date.split('-').map(Number);
            let newDate = `${nextYear}-${month.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
            
            // Handle Feb 29 in non-leap years
            if (month === 2 && dayNum === 29) {
              const isLeapYear = (nextYear % 4 === 0 && nextYear % 100 !== 0) || (nextYear % 400 === 0);
              if (!isLeapYear) {
                newDate = `${nextYear}-02-28`;
              }
            }

            // Rotate group if enabled
            let newGroupId = day.group_id;
            let newGroupId2 = day.group_id_2;
            if (shouldRotate && day.group_id && rotationMap[day.group_id]) {
              newGroupId = rotationMap[day.group_id];
            }
            if (shouldRotate && day.group_id_2 && rotationMap[day.group_id_2]) {
              newGroupId2 = rotationMap[day.group_id_2];
            }

            return {
              calendar_id: newCalendar.id,
              date: newDate,
              day_type: day.day_type,
              legend: day.legend,
              group_id: newGroupId,
              group_id_2: newGroupId2,
              custom_day_type_id: day.custom_day_type_id
            };
          });

          const { error: daysError } = await supabase
            .from("annual_calendar_days")
            .insert(newDays);

          if (daysError) {
            console.error("Error copying days:", daysError);
          }
        }

        return new Response(
          JSON.stringify({ success: true, calendar: newCalendar }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "getCalendars": {
        // Get all calendars for the accessible departments
        // Admin and Consulta can see all departments
        const departmentIds = (isAdmin || isConsulta)
          ? (await supabase.from("departments").select("id")).data?.map(d => d.id) || []
          : assignedDepartmentIds;

        const { data: calendars } = await supabase
          .from("annual_calendars")
          .select("*, departments(name)")
          .in("department_id", departmentIds)
          .order("year", { ascending: false });

        return new Response(
          JSON.stringify({ success: true, calendars: calendars || [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "deleteCalendar": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden eliminar calendarios" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { calendarId } = params;

        // Delete calendar days first (cascade should handle this, but explicit is safer)
        await supabase
          .from("annual_calendar_days")
          .delete()
          .eq("calendar_id", calendarId);

        // Delete calendar
        const { error } = await supabase
          .from("annual_calendars")
          .delete()
          .eq("id", calendarId);

        if (error) {
          console.error("Error deleting calendar:", error);
          return new Response(
            JSON.stringify({ success: false, error: "Error al eliminar calendario" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "duplicateCalendar": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden duplicar calendarios" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { calendarId, targetDepartmentId } = params;

        // Get source calendar
        const { data: sourceCalendar } = await supabase
          .from("annual_calendars")
          .select("*")
          .eq("id", calendarId)
          .single();

        if (!sourceCalendar) {
          return new Response(
            JSON.stringify({ success: false, error: "Calendario no encontrado" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Use target department or same department
        const destDepartmentId = targetDepartmentId || sourceCalendar.department_id;
        const destYear = sourceCalendar.year;
        const sourceDepartmentId = sourceCalendar.department_id;

        // Check if calendar already exists for target department and year
        const { data: existingCal } = await supabase
          .from("annual_calendars")
          .select("id")
          .eq("department_id", destDepartmentId)
          .eq("year", destYear)
          .single();

        if (existingCal) {
          return new Response(
            JSON.stringify({ success: false, error: "Ya existe un calendario para ese departamento y año" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Maps for old ID -> new ID
        const customDayTypeIdMap = new Map<string, string>();
        const workGroupIdMap = new Map<string, string>();

        // 1. Copy custom_day_types from source department to target department
        const { data: sourceCustomDayTypes } = await supabase
          .from("custom_day_types")
          .select("*")
          .eq("department_id", sourceDepartmentId)
          .order("sort_order", { ascending: true });

        if (sourceCustomDayTypes && sourceCustomDayTypes.length > 0) {
          for (const customType of sourceCustomDayTypes) {
            const { data: newCustomType, error: customTypeError } = await supabase
              .from("custom_day_types")
              .insert({
                department_id: destDepartmentId,
                name: customType.name,
                color: customType.color,
                system_type: customType.system_type,
                sort_order: customType.sort_order
              })
              .select()
              .single();

            if (!customTypeError && newCustomType) {
              customDayTypeIdMap.set(customType.id, newCustomType.id);
            } else {
              console.error("Error copying custom day type:", customTypeError);
            }
          }
        }

        // 2. Copy work_groups from source department to target department
        const { data: sourceWorkGroups } = await supabase
          .from("work_groups")
          .select("*")
          .eq("department_id", sourceDepartmentId)
          .order("sort_order", { ascending: true });

        if (sourceWorkGroups && sourceWorkGroups.length > 0) {
          for (const workGroup of sourceWorkGroups) {
            const { data: newWorkGroup, error: workGroupError } = await supabase
              .from("work_groups")
              .insert({
                department_id: destDepartmentId,
                name: workGroup.name,
                color: workGroup.color,
                sort_order: workGroup.sort_order
              })
              .select()
              .single();

            if (!workGroupError && newWorkGroup) {
              workGroupIdMap.set(workGroup.id, newWorkGroup.id);
            } else {
              console.error("Error copying work group:", workGroupError);
            }
          }
        }

        // 3. Create the new calendar
        const newDescription = sourceCalendar.description 
          ? `${sourceCalendar.description} (copia)` 
          : "Copia";

        const { data: newCalendar, error: calError } = await supabase
          .from("annual_calendars")
          .insert({
            department_id: destDepartmentId,
            year: destYear,
            description: newDescription,
            auto_rotate_groups: sourceCalendar.auto_rotate_groups
          })
          .select()
          .single();

        if (calError) {
          console.error("Error duplicating calendar:", calError);
          return new Response(
            JSON.stringify({ success: false, error: "Error al duplicar calendario" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 4. Copy all days with mapped IDs
        const { data: sourceDays } = await supabase
          .from("annual_calendar_days")
          .select("*")
          .eq("calendar_id", calendarId);

        if (sourceDays && sourceDays.length > 0) {
          const newDays = sourceDays.map(day => ({
            calendar_id: newCalendar.id,
            date: day.date,
            day_type: day.day_type,
            legend: day.legend,
            group_id: day.group_id ? workGroupIdMap.get(day.group_id) || null : null,
            group_id_2: day.group_id_2 ? workGroupIdMap.get(day.group_id_2) || null : null,
            custom_day_type_id: day.custom_day_type_id ? customDayTypeIdMap.get(day.custom_day_type_id) || null : null
          }));

          const { error: daysError } = await supabase
            .from("annual_calendar_days")
            .insert(newDays);

          if (daysError) {
            console.error("Error copying days:", daysError);
          }
        }

        return new Response(
          JSON.stringify({ success: true, calendar: newCalendar }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "generatePDF": {
        const { calendarId, lightMode } = params;

        // Get calendar with department
        const { data: calendar } = await supabase
          .from("annual_calendars")
          .select("*, departments(name)")
          .eq("id", calendarId)
          .single();

        if (!calendar) {
          return new Response(
            JSON.stringify({ success: false, error: "Calendario no encontrado" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check access for non-admins
        if (!isAdmin && !assignedDepartmentIds.includes(calendar.department_id)) {
          return new Response(
            JSON.stringify({ success: false, error: "Sin acceso a este calendario" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get days and groups
        const { data: days } = await supabase
          .from("annual_calendar_days")
          .select("*")
          .eq("calendar_id", calendarId);

        const { data: groups } = await supabase
          .from("work_groups")
          .select("*")
          .eq("department_id", calendar.department_id);

        // Get worker teams
        const { data: workerTeams } = await supabase
          .from("worker_teams")
          .select("*")
          .eq("department_id", calendar.department_id);

        // Get work group teams (assignments)
        const { data: workGroupTeams } = await supabase
          .from("work_group_teams")
          .select("*");

        // Get custom day types
        const { data: customDayTypes } = await supabase
          .from("custom_day_types")
          .select("*")
          .eq("department_id", calendar.department_id)
          .order("sort_order", { ascending: true });

        // Get department name - handle encoding properly
        const departmentName = (calendar as any).departments?.name || "Departamento";
        const groupMap = new Map(groups?.map(g => [g.id, g]) || []);
        const customTypeMap = new Map(customDayTypes?.map(t => [t.id, t]) || []);
        const teamMap = new Map(workerTeams?.map(t => [t.id, t]) || []);
        
        // Helper to get teams for a group
        const getTeamsForGroup = (groupId: string): string[] => {
          const teamIds = workGroupTeams?.filter(wgt => wgt.work_group_id === groupId).map(wgt => wgt.worker_team_id) || [];
          return teamIds.map(id => teamMap.get(id)?.name).filter(Boolean) as string[];
        };
        
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                          "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

        // Build calendar HTML for each month with circles - A3 portrait = 3 cols x 4 rows
        let monthsHtml = '';
        for (let month = 0; month < 12; month++) {
          const daysInMonth = new Date(calendar.year, month + 1, 0).getDate();
          const firstDayOfWeek = new Date(calendar.year, month, 1).getDay();
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
                const dateStr = `${calendar.year}-${(month + 1).toString().padStart(2, '0')}-${dayCount.toString().padStart(2, '0')}`;
                const dayInfo = days?.find(d => d.date === dateStr);
                const isWeekend = dow === 5 || dow === 6; // Fin de semana (dow: 0=lunes, 5=sábado, 6=domingo)
                
                let spanClass = 'day';
                let spanStyle = '';
                
                if (dayInfo) {
                  switch (dayInfo.day_type) {
                    case 'festivo':
                      // Check if it's a custom festivo type
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
                    case 'vacaciones_grupo':
                      spanClass = 'day vac-grp';
                      const group = groupMap.get(dayInfo.group_id || '');
                      const group2 = dayInfo.group_id_2 ? groupMap.get(dayInfo.group_id_2) : null;
                      if (group2) {
                        // Split circle with gradient
                        spanStyle = `background:linear-gradient(90deg,${group?.color || '#3b82f6'} 50%,${group2.color} 50%);`;
                      } else {
                        spanStyle = `background:${group?.color || '#3b82f6'};`;
                      }
                      break;
                  }
                } else if (isWeekend) {
                  spanClass = 'day we';
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

        // Build festivos list (without custom types)
        const festivos = days?.filter(d => d.day_type === 'festivo' && d.legend && !d.custom_day_type_id) || [];
        let festivosHtml = '';
        if (festivos.length > 0) {
          festivosHtml = festivos.map(f => {
            const [year, mon, day] = f.date.split('-');
            return `<div class="festivo-item"><span class="festivo-date">${parseInt(day)}/${parseInt(mon)}</span><span class="festivo-name">${f.legend}</span></div>`;
          }).join('');
        }

        // Build base legend (standard day types)
        let baseLegendHtml = `
          <div class="legend-item"><span class="legend-circle" style="background:#93d600"></span><span>Vacaciones Generales</span></div>
          <div class="legend-item"><span class="legend-circle" style="background:#dc2626"></span><span>Festivo</span></div>
          <div class="legend-item"><span class="legend-circle" style="background:${lightMode ? '#d4d4d4' : '#333'}"></span><span>Fin de semana</span></div>
        `;

        // Build custom day types legend
        let customTypesLegendHtml = '';
        if (customDayTypes && customDayTypes.length > 0) {
          customTypesLegendHtml = customDayTypes.map(t => 
            `<div class="legend-item"><span class="legend-circle" style="background:${t.color}"></span><span>${t.name}</span></div>`
          ).join('');
        }

        // Build groups legend (separate block) - format: "Nombre: Equipos"
        let groupsLegendHtml = '';
        if (groups && groups.length > 0) {
          groupsLegendHtml = groups.map(g => {
            const teamNames = getTeamsForGroup(g.id).join(', ');
            const displayText = teamNames ? `${g.name}: ${teamNames}` : g.name;
            return `<div class="legend-item"><span class="legend-circle" style="background:${g.color}"></span><span>${displayText}</span></div>`;
          }).join('');
        }

        // Manager name for footer
        const managerName = manager?.name || "Usuario";
        
        // Current date in Spanish
        const now = new Date();
        const dayNum = now.getDate();
        const monthNameSpanish = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][now.getMonth()];
        const yearNum = now.getFullYear();

        // Theme-specific styles
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

        // Build bottom section with separate panels for legend, groups, festivos, and notes
        let bottomPanels = '';
        
        // Standard legend panel
        bottomPanels += `<div class="panel"><div class="panel-header">Leyenda</div><div class="panel-content">${baseLegendHtml}${customTypesLegendHtml}</div></div>`;
        
        // Groups panel (separate)
        if (groups && groups.length > 0) {
          bottomPanels += `<div class="panel"><div class="panel-header">Grupos Vacacionales</div><div class="panel-content">${groupsLegendHtml}</div></div>`;
        }
        
        // Festivos panel
        if (festivos.length > 0) {
          bottomPanels += `<div class="panel"><div class="panel-header">Festivos</div><div class="panel-content">${festivosHtml}</div></div>`;
        }
        
        // Notes panel - use info_text (public text) for PDF notes
        if (calendar.info_text) {
          bottomPanels += `<div class="panel"><div class="panel-header">Información</div><div class="panel-content"><div class="notes-text">${calendar.info_text}</div></div></div>`;
        }

        // A3 PORTRAIT format - taller layout, 3 columns x 4 rows
        const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Calendario ${calendar.year} - ${departmentName}</title>
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
<div class="year">${calendar.year}</div>
</div>
<div class="header-right">
<div class="dept-name">${departmentName}</div>
<div class="dept-sub">Calendario Anual de Vacaciones</div>
</div>
</div>

<div class="calendar-grid">${monthsHtml}</div>

<div class="bottom-section">
${bottomPanels}
</div>

<div class="footer">Generado el ${dayNum} de ${monthNameSpanish} de ${yearNum} por ${managerName} | Verdnatura</div>
</body>
</html>`;

        // Return HTML directly without base64 encoding to preserve UTF-8
        return new Response(
          JSON.stringify({ success: true, html: html, isRaw: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } }
        );
      }

      case "getBlockedDaysByConcurrency": {
        const { departmentId, year } = params;

        // Check access
        if (!isAdmin && !assignedDepartmentIds.includes(departmentId)) {
          return new Response(
            JSON.stringify({ success: false, error: "Sin acceso a este departamento" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get department config
        const { data: department } = await supabase
          .from("departments")
          .select("auto_block_by_concurrency, max_concurrent_workers_global")
          .eq("id", departmentId)
          .single();

        const manualLimit = department?.max_concurrent_workers_global ?? null;
        console.log(`getBlockedDaysByConcurrency: auto_block=${department?.auto_block_by_concurrency}, manual_limit=${manualLimit}`);

        if (!department?.auto_block_by_concurrency) {
          return new Response(
            JSON.stringify({ success: true, blockedDays: [], overrides: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get all ACTIVE vacation requests for the year (PENDING + APPROVED)
        // IMPORTANT: This must match submit-vacation-request logic - count both PENDING and APPROVED
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;

        const { data: activeRequests } = await supabase
          .from("vacation_requests")
          .select("id, status, manager_status")
          .eq("department_id", departmentId)
          .in("status", ["PENDING", "APPROVED"]);

        // Filter out rejected by manager
        const effectiveRequests = (activeRequests || []).filter((r: any) =>
          r.status !== 'REJECTED' && r.manager_status !== 'REJECTED'
        );

        if (effectiveRequests.length === 0) {
          return new Response(
            JSON.stringify({ success: true, blockedDays: [], overrides: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const requestIds = effectiveRequests.map((r: any) => r.id);

        // Get all dates from active requests in the year
        const { data: requestDates } = await supabase
          .from("vacation_request_dates")
          .select("date, half_day")
          .in("vacation_request_id", requestIds)
          .gte("date", yearStart)
          .lte("date", yearEnd);

        // Count workers per date
        const dateCountMap: Record<string, number> = {};
        for (const rd of (requestDates || [])) {
          const count = rd.half_day ? 0.5 : 1;
          dateCountMap[rd.date] = (dateCountMap[rd.date] || 0) + count;
        }

        // ===== Dynamic concurrency limit (match submit-vacation-request logic) =====
        // Determine "Periodo Vacacional" days for this year (department_availabilities weekdays only)
        const { data: deptAvail } = await supabase
          .from("department_availabilities")
          .select("date")
          .eq("department_id", departmentId)
          .gte("date", yearStart)
          .lte("date", yearEnd);

        const availDatesAll = (deptAvail || []).map((d: any) => d.date);
        const availDates = availDatesAll.filter((ds: string) => {
          const dt = new Date(ds + "T00:00:00");
          const dow = dt.getDay();
          return dow !== 0 && dow !== 6;
        });

        if (availDates.length === 0) {
          return new Response(
            JSON.stringify({ success: true, blockedDays: [], overrides: [], threshold: null, dateCountMap }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Sum up total free days across all workers (based on their group's max_free_days)
        const { data: deptWorkers } = await supabase
          .from("workers")
          .select("worker_team_id")
          .eq("department_id", departmentId)
          .eq("is_on_leave", false);

        const allTeamIds = [...new Set((deptWorkers || []).map((w: any) => w.worker_team_id).filter(Boolean))];

        const { data: allGroupTeams } = allTeamIds.length
          ? await supabase
              .from("work_group_teams")
              .select("worker_team_id, work_group_id")
              .in("worker_team_id", allTeamIds)
          : { data: [] as any[] };

        const teamToGroup = new Map<string, string>();
        (allGroupTeams || []).forEach((t: any) => teamToGroup.set(t.worker_team_id, t.work_group_id));

        const { data: allGroups } = await supabase
          .from("work_groups")
          .select("id, max_free_days")
          .eq("department_id", departmentId);

        const groupMaxFreeDaysMap = new Map<string, number>();
        (allGroups || []).forEach((g: any) => {
          if (g.max_free_days !== null && g.max_free_days !== undefined) {
            groupMaxFreeDaysMap.set(g.id, Number(g.max_free_days));
          }
        });

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

        if (workersWithFreeDays === 0 && manualLimit === null) {
          return new Response(
            JSON.stringify({ success: true, blockedDays: [], overrides: [], threshold: null, dateCountMap }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Concurrency limit: use manual limit if set, otherwise calculate dynamically
        let threshold: number;
        if (manualLimit !== null && manualLimit > 0) {
          threshold = manualLimit;
          console.log(`Using manual threshold: ${threshold}`);
        } else {
          threshold = Math.ceil(totalFreeDays / availDates.length);
          console.log(`Calculated threshold: ${threshold} (${totalFreeDays} days / ${availDates.length} period days)`);
        }

        // Find blocked days (within Periodo Vacacional)
        const blockedDays: string[] = [];
        for (const date of availDates) {
          const count = dateCountMap[date] || 0;
          if (count >= threshold) blockedDays.push(date);
        }

        // Get overrides (manually unblocked days)
        const { data: overrides } = await supabase
          .from("department_day_overrides")
          .select("*")
          .eq("department_id", departmentId)
          .gte("date", yearStart)
          .lte("date", yearEnd);

        return new Response(
          JSON.stringify({ 
            success: true, 
            blockedDays, 
            overrides: overrides || [],
            threshold,
            dateCountMap
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "toggleDayOverride": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden gestionar overrides" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { departmentId, date, unblock } = params;

        // Get department name for audit log
        const { data: dept } = await supabase
          .from("departments")
          .select("name")
          .eq("id", departmentId)
          .single();
        const departmentName = dept?.name || "Desconocido";

        // Check if override exists
        const { data: existing } = await supabase
          .from("department_day_overrides")
          .select("id")
          .eq("department_id", departmentId)
          .eq("date", date)
          .single();

        if (unblock) {
          // Create or update override to unblock
          if (existing) {
            await supabase
              .from("department_day_overrides")
              .update({ is_unblocked: true, created_by: manager.name })
              .eq("id", existing.id);
          } else {
            await supabase
              .from("department_day_overrides")
              .insert({
                department_id: departmentId,
                date,
                is_unblocked: true,
                created_by: manager.name
              });
          }

          // Log audit for unblocking
          await supabase.from("audit_logs").insert({
            action_type: "day_unblocked_manual",
            actor_name: manager.name,
            actor_role: manager.role,
            entity_type: "day_blocking",
            entity_id: departmentId,
            entity_data: {
              date,
              department_id: departmentId,
              department_name: departmentName,
              reason: "Desbloqueo manual por administrador"
            },
            details: `Día ${date} desbloqueado manualmente en ${departmentName}`
          });
        } else {
          // Remove override (re-block)
          if (existing) {
            await supabase
              .from("department_day_overrides")
              .delete()
              .eq("id", existing.id);

            // Log audit for re-blocking
            await supabase.from("audit_logs").insert({
              action_type: "day_blocked",
              actor_name: manager.name,
              actor_role: manager.role,
              entity_type: "day_blocking",
              entity_id: departmentId,
              entity_data: {
                date,
                department_id: departmentId,
                department_name: departmentName,
                reason: "Override eliminado, vuelve a estar bloqueado por concurrencia"
              },
              details: `Día ${date} vuelto a bloquear en ${departmentName} (override eliminado)`
            });
          }
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "toggleCalendarReviewed": {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ success: false, error: "Solo administradores pueden marcar calendarios" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { calendarId, isReviewed } = params;

        const updateData: any = {
          is_reviewed: isReviewed
        };
        
        if (isReviewed) {
          updateData.reviewed_at = new Date().toISOString();
        } else {
          updateData.reviewed_at = null;
        }

        const { error } = await supabase
          .from("annual_calendars")
          .update(updateData)
          .eq("id", calendarId);

        if (error) {
          console.error("Error toggling calendar reviewed:", error);
          return new Response(
            JSON.stringify({ success: false, error: "Error al actualizar estado" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // =====================================================
      // Get full calendar data for managers (read-only access)
      // This replaces direct queries to protected tables
      // =====================================================
      case "getPublicCalendarData": {
        const { departmentId, year: requestedYear } = params;

        if (!departmentId) {
          return new Response(
            JSON.stringify({ success: false, error: "Department ID required" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check access - allow admin and consulta full access, managers only to assigned departments
        if (!isAdmin && !isConsulta && !assignedDepartmentIds.includes(departmentId)) {
          return new Response(
            JSON.stringify({ success: false, error: "Sin acceso a este departamento" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Determine which year to use
        const targetYear = requestedYear || new Date().getFullYear();

        // Fetch all calendar data in parallel using service_role
        const [calendarRes, groupsRes, teamsRes, assignmentsRes, typesRes] = await Promise.all([
          supabase.from('annual_calendars').select('*').eq('department_id', departmentId).eq('year', targetYear).maybeSingle(),
          supabase.from('work_groups').select('*').eq('department_id', departmentId).order('sort_order'),
          supabase.from('worker_teams').select('*').eq('department_id', departmentId).order('sort_order'),
          supabase.from('work_group_teams').select('*'),
          supabase.from('custom_day_types').select('*').eq('department_id', departmentId).order('sort_order'),
        ]);

        let days: any[] = [];
        if (calendarRes.data) {
          const daysRes = await supabase
            .from('annual_calendar_days')
            .select('*')
            .eq('calendar_id', calendarRes.data.id);
          days = daysRes.data || [];
        }

        return new Response(
          JSON.stringify({
            success: true,
            calendar: calendarRes.data,
            days,
            groups: groupsRes.data || [],
            workerTeams: teamsRes.data || [],
            workGroupTeams: assignmentsRes.data || [],
            customDayTypes: typesRes.data || [],
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: "Acción no válida" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: any) {
    console.error("Error in annual-calendar-operations:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
