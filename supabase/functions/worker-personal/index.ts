import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type WorkerRow = {
  id: string;
  name: string;
  worker_number: string;
  department_id: string;
  work_group_id: string | null;
  worker_team_id: string | null;
  user_id: string | null;
};

const isTestWorker = (workerLike: { name?: string | null; worker_number?: string | null } | null | undefined) => {
  if (!workerLike) return false;

  const normalizedName = (workerLike.name || "").trim().toUpperCase();
  const normalizedWorkerNumber = (workerLike.worker_number || "").trim();

  return normalizedWorkerNumber === "0000" || normalizedName.startsWith("[TEST]");
};

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const err = (message: string, status = 200) => ok({ success: false, error: message }, status);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return err("Invalid session", 401);

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) return err("Invalid session", 401);

    const user = userData.user;

    const input = await req.json().catch(() => ({}));
    const action = input?.action as string | undefined;
    const viewAsWorkerNumber = input?.viewAsWorkerNumber as string | undefined;

    // Check if admin impersonation is requested
    let worker: WorkerRow | null = null;
    let isAdminViewAs = false;

    if (viewAsWorkerNumber) {
      // Verify that the requesting user is an admin
      const { data: managerData } = await supabase
        .from("managers")
        .select("id, role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!managerData || managerData.role !== "admin") {
        return err("No tienes permisos para ver como otro trabajador", 403);
      }

      // Find the worker by number
      const { data: targetWorker, error: targetErr } = await supabase
        .from("workers")
        .select("id, name, worker_number, department_id, work_group_id, worker_team_id, user_id")
        .eq("worker_number", viewAsWorkerNumber)
        .maybeSingle<WorkerRow>();

      if (targetErr) return err("Error loading worker", 500);
      if (!targetWorker) return err("Trabajador no encontrado", 404);

      worker = targetWorker;
      isAdminViewAs = true;
      console.log(`[Admin ViewAs] Admin ${user.email} viewing as worker ${worker.name} (#${worker.worker_number})`);
    } else {
      // Normal flow: get worker linked to authenticated user
      const { data: userWorker, error: workerErr } = await supabase
        .from("workers")
        .select("id, name, worker_number, department_id, work_group_id, worker_team_id, user_id")
        .eq("user_id", user.id)
        .maybeSingle<WorkerRow>();

      if (workerErr) return err("Error loading worker", 500);
      if (!userWorker) return err("Worker not linked", 403);
      
      worker = userWorker;
    }

    if (action === "getCalendar") {
      // Resolve effective department for responsables (team leads use their team's dept)
      let effectiveDeptId = worker.department_id;
      let effectiveTeamId = worker.worker_team_id;
      const { data: leadTeamCal } = await supabase
        .from("worker_teams")
        .select("id, department_id")
        .eq("responsable_worker_id", worker.id)
        .limit(1)
        .maybeSingle();
      if (leadTeamCal) {
        effectiveDeptId = leadTeamCal.department_id;
        effectiveTeamId = effectiveTeamId || leadTeamCal.id;
        console.log(`[getCalendar] Responsable override: dept ${worker.department_id} -> ${effectiveDeptId}`);
      }

      // Department with manual free days setting + public_token for vacation form
      const { data: dept } = await supabase
        .from("departments")
        .select("id, name, manual_free_days_enabled, manual_free_days_value, max_days_per_employee, public_token, require_all_days, slug")
        .eq("id", effectiveDeptId)
        .maybeSingle();
      
      // Get worker's adjustment (vacation_days_adjustment) for accurate calculation
      const { data: workerFull } = await supabase
        .from("workers")
        .select("vacation_days_adjustment, pending_vacation_days")
        .eq("id", worker.id)
        .maybeSingle();

      // Determine work group - either directly assigned or through team
      let workGroupId = worker.work_group_id;
      let groupSource = workGroupId ? "direct" : "none";
      
      // If no direct group but has team, look up group through work_group_teams
      if (!workGroupId && effectiveTeamId) {
        const { data: teamGroup } = await supabase
          .from("work_group_teams")
          .select("work_group_id")
          .eq("worker_team_id", effectiveTeamId)
          .maybeSingle();
        
        if (teamGroup) {
          workGroupId = teamGroup.work_group_id;
          groupSource = "team_mapping";
        }
      }
      
      console.log(`[getCalendar] Worker ${worker.name} (#${worker.worker_number}): direct_group=${worker.work_group_id || 'null'}, team=${worker.worker_team_id || 'null'}, resolved_group=${workGroupId || 'null'} (source: ${groupSource})`);

      // Group (including max_free_days and free_days_deduction)
      const { data: group } = workGroupId
        ? await supabase
            .from("work_groups")
            .select("id, name, color, max_free_days, free_days_deduction")
            .eq("id", workGroupId)
            .maybeSingle()
        : { data: null };

      // Calendar selection: current year, else latest
      const currentYear = new Date().getFullYear();
      let { data: calendar } = await supabase
        .from("annual_calendars")
        .select("id, year, info_text, info_text_ar, info_text_fr")
        .eq("department_id", effectiveDeptId)
        .eq("year", currentYear)
        .maybeSingle();

      if (!calendar) {
        const { data: latest } = await supabase
          .from("annual_calendars")
          .select("id, year, info_text, info_text_ar, info_text_fr")
          .eq("department_id", effectiveDeptId)
          .order("year", { ascending: false })
          .limit(1)
          .maybeSingle();
        calendar = latest || null;
      }

      const calendarId = calendar?.id;

      const { data: days } = calendarId
        ? await supabase
            .from("annual_calendar_days")
            .select("id, date, day_type, legend, group_id, group_id_2, custom_day_type_id")
            .eq("calendar_id", calendarId)
        : { data: [] };

      const { data: customTypes } = await supabase
        .from("custom_day_types")
        .select("id, name, color, system_type")
        .eq("department_id", effectiveDeptId)
        .order("sort_order");

      // Fetch worker personal calendar days overrides - unlocked_by_admin entries remove group days
      const { data: personalOverrides } = await supabase
        .from("worker_personal_calendar_days")
        .select("date, day_type, half_day")
        .eq("worker_id", worker.id)
        .eq("year", calendar?.year ?? new Date().getFullYear());

      // CRITICAL: Also fetch signed modifications to ensure unlockedDates and added_personal_days are complete
      // This handles "legacy" modifications that may not have been backfilled
      const { data: signedModifications } = await supabase
        .from("worker_calendar_modifications")
        .select("id, removed_group_days, added_personal_days")
        .eq("worker_id", worker.id)
        .eq("status", "signed")
        .eq("year", calendar?.year ?? new Date().getFullYear());

      // Build set of unlocked dates from personal overrides
      const unlockedFromOverrides = new Set<string>();
      const addedFromOverrides = new Set<string>();
      (personalOverrides || []).forEach((po: any) => {
        if (po.day_type === "unlocked_by_admin") {
          unlockedFromOverrides.add(po.date);
        }
        if (po.day_type === "admin_assigned" || po.day_type === "libre_configuracion" || po.day_type === "free_assignment") {
          addedFromOverrides.add(po.date);
        }
      });

      // Build set of unlocked dates from signed modifications (source of truth)
      const unlockedFromModifications = new Set<string>();
      const addedFromModifications = new Set<string>();
      const modificationsToBackfill: { id: string; removedDates: string[]; addedDays: any[] }[] = [];
      
      (signedModifications || []).forEach((mod: any) => {
        let needsBackfill = false;
        const removedDates: string[] = [];
        const addedDays: any[] = [];
        
        if (mod.removed_group_days && Array.isArray(mod.removed_group_days)) {
          const dates = mod.removed_group_days.map((d: any) => typeof d === 'string' ? d : d.date);
          dates.forEach((d: string) => unlockedFromModifications.add(d));
          
          // Check if any removed date is missing from overrides
          const missingRemoved = dates.filter((d: string) => !unlockedFromOverrides.has(d));
          if (missingRemoved.length > 0) {
            needsBackfill = true;
            removedDates.push(...mod.removed_group_days);
          }
        }
        
        if (mod.added_personal_days && Array.isArray(mod.added_personal_days)) {
          mod.added_personal_days.forEach((d: any) => {
            const dateStr = typeof d === 'string' ? d : d.date;
            addedFromModifications.add(dateStr);
          });
          
          // Check if any added date is missing from overrides
          const missingAdded = mod.added_personal_days.filter((d: any) => {
            const dateStr = typeof d === 'string' ? d : d.date;
            return !addedFromOverrides.has(dateStr);
          });
          if (missingAdded.length > 0) {
            needsBackfill = true;
            addedDays.push(...mod.added_personal_days);
          }
        }
        
        if (needsBackfill) {
          modificationsToBackfill.push({ id: mod.id, removedDates, addedDays });
        }
      });

      // Merge both sources - union of unlocked dates
      const unlockedDates = new Set<string>([...unlockedFromOverrides, ...unlockedFromModifications]);

      // Perform idempotent backfill if needed (auto-repair legacy modifications)
      if (modificationsToBackfill.length > 0) {
        console.log(`[getCalendar] Backfilling ${modificationsToBackfill.length} legacy modifications for worker ${worker.worker_number}`);
        
        for (const mod of modificationsToBackfill) {
          // Delete existing entries for this modification (idempotency)
          await supabase
            .from("worker_personal_calendar_days")
            .delete()
            .eq("modification_id", mod.id);
          
          const toInsert: any[] = [];
          
          // Insert all removed dates as unlocked_by_admin
          mod.removedDates.forEach((rd: any) => {
            toInsert.push({
              worker_id: worker.id,
              department_id: worker.department_id,
              modification_id: mod.id,
              date: typeof rd === 'string' ? rd : rd.date,
              day_type: 'unlocked_by_admin',
              half_day: false,
              year: calendar?.year ?? new Date().getFullYear(),
            });
          });
          
          // Insert all added days with their correct type
          mod.addedDays.forEach((ad: any) => {
            const dateStr = typeof ad === 'string' ? ad : ad.date;
            const dayType = (typeof ad === 'object' && ad.assignmentType) ? ad.assignmentType : 'admin_assigned';
            const halfDay = (typeof ad === 'object' && ad.halfDay) ? ad.halfDay : false;
            toInsert.push({
              worker_id: worker.id,
              department_id: worker.department_id,
              modification_id: mod.id,
              date: dateStr,
              day_type: dayType,
              half_day: halfDay,
              year: calendar?.year ?? new Date().getFullYear(),
            });
          });
          
          if (toInsert.length > 0) {
            await supabase
              .from("worker_personal_calendar_days")
              .insert(toInsert);
            
            console.log(`[getCalendar] Backfilled ${toInsert.length} dates for modification ${mod.id}`);
          }
        }
      }

      console.log(`[getCalendar] Worker ${worker.name} (#${worker.worker_number}) has ${unlockedDates.size} total unlocked dates (${unlockedFromOverrides.size} from overrides, ${unlockedFromModifications.size} from signed mods)`);

      // Approved vacation dates for this worker - CRITICAL: include half_day for accurate calculation
      const { data: approvedRequests } = await supabase
        .from("vacation_requests")
        .select("id, vacation_request_dates(date, half_day)")
        .eq("worker_number", worker.worker_number)
        .eq("department_id", effectiveDeptId)
        .eq("status", "APPROVED");

      const approvedDates: string[] = [];
      let approvedDaysTotal = 0; // Track actual days including half-days
      (approvedRequests || []).forEach((req: any) => {
        (req?.vacation_request_dates || []).forEach((d: any) => {
          if (d?.date) {
            approvedDates.push(d.date);
            approvedDaysTotal += d.half_day ? 0.5 : 1;
          }
        });
      });

      // Pending vacation dates for this worker (PENDING status)
      const { data: pendingRequests } = await supabase
        .from("vacation_requests")
        .select("id, vacation_request_dates(date, half_day)")
        .eq("worker_number", worker.worker_number)
        .eq("department_id", effectiveDeptId)
        .eq("status", "PENDING");

      const pendingDates: string[] = [];
      (pendingRequests || []).forEach((req: any) => {
        (req?.vacation_request_dates || []).forEach((d: any) => {
          if (d?.date) pendingDates.push(d.date);
        });
      });
      
      // RECONCILIATION: Clean up orphaned free_assignment entries
      // A free_assignment entry is orphaned if its DATE is not in the set of currently approved dates
      const approvedDateSet = new Set<string>();
      approvedDates.forEach(d => approvedDateSet.add(d));
      
      // Find free_assignment entries that are NOT in the approved dates set
      const existingFreeAssignment = (personalOverrides || []).filter(
        (po: any) => po.day_type === 'free_assignment'
      );
      
      const orphanedFreeAssignmentDates = existingFreeAssignment.filter(
        (po: any) => !approvedDateSet.has(po.date)
      );
      
      if (orphanedFreeAssignmentDates.length > 0) {
        console.log(`[getCalendar] RECONCILIATION: Found ${orphanedFreeAssignmentDates.length} orphaned free_assignment dates`);
        
        // Get IDs of orphaned entries to delete
        const { data: orphanedWithIds } = await supabase
          .from("worker_personal_calendar_days")
          .select("id, date, modification_id")
          .eq("worker_id", worker.id)
          .eq("year", calendar?.year ?? new Date().getFullYear())
          .eq("day_type", "free_assignment");
        
        const orphanedIds = (orphanedWithIds || [])
          .filter((d: any) => !approvedDateSet.has(d.date))
          .map((d: any) => d.id);
        
        for (const orphanedId of orphanedIds) {
          await supabase
            .from("worker_personal_calendar_days")
            .delete()
            .eq("id", orphanedId);
        }
        
        // Refresh personalOverrides after cleanup
        const { data: refreshedOverrides } = await supabase
          .from("worker_personal_calendar_days")
          .select("date, day_type, half_day")
          .eq("worker_id", worker.id)
          .eq("year", calendar?.year ?? new Date().getFullYear());
        
        if (refreshedOverrides) {
          (personalOverrides as any[]).length = 0;
          refreshedOverrides.forEach((po: any) => (personalOverrides as any[]).push(po));
        }
        
        console.log(`[getCalendar] RECONCILIATION: Cleanup complete`);
      }
      
      // BACKFILL: Check if approved requests have corresponding entries in worker_personal_calendar_days
      // This repairs old approvals that didn't get applied correctly
      const approvedRequestIds = (approvedRequests || []).map((r: any) => r.id);
      if (approvedRequestIds.length > 0) {
        // Get all dates that should exist in personal days
        const allApprovedDatesWithHalfDay: { date: string; half_day: boolean }[] = [];
        (approvedRequests || []).forEach((req: any) => {
          (req?.vacation_request_dates || []).forEach((d: any) => {
            if (d?.date) {
              allApprovedDatesWithHalfDay.push({ date: d.date, half_day: d.half_day || false });
            }
          });
        });
        
        // Check which ones are missing from freeAssignmentDates
        const existingFreeAssignment = new Set<string>();
        (personalOverrides || []).forEach((po: any) => {
          if (po.day_type === 'free_assignment') {
            existingFreeAssignment.add(po.date);
          }
        });
        
        const missingDates = allApprovedDatesWithHalfDay.filter(d => !existingFreeAssignment.has(d.date));
        
        if (missingDates.length > 0) {
          console.log(`[getCalendar] BACKFILL: Found ${missingDates.length} approved dates missing from worker_personal_calendar_days`);
          
          // Get the first date's year for the modification record
          const year = calendar?.year ?? new Date().getFullYear();
          
          // Create a modification record for backfill
          const { data: backfillMod, error: backfillModError } = await supabase
            .from("worker_calendar_modifications")
            .insert({
              worker_id: worker.id,
              department_id: worker.department_id,
              year,
              modification_type: 'add_personal_days',
              admin_name: 'Sistema (Backfill)',
              admin_reason: `Backfill automático de ${missingDates.length} día(s) de libre configuración aprobados`,
              status: 'signed',
              signature: 'BACKFILL_SISTEMA',
              signed_at: new Date().toISOString(),
              added_personal_days: missingDates.map(d => ({
                date: d.date,
                half_day: d.half_day,
                assignmentType: 'free_assignment'
              })),
            })
            .select('id')
            .single();
          
          if (backfillModError) {
            console.error('[getCalendar] BACKFILL: Error creating modification:', backfillModError);
          } else if (backfillMod) {
            // Insert the missing personal days
            const toInsert = missingDates.map(d => ({
              worker_id: worker.id,
              department_id: worker.department_id,
              modification_id: backfillMod.id,
              date: d.date,
              half_day: d.half_day,
              day_type: 'free_assignment',
              year,
            }));
            
            const { error: insertErr } = await supabase
              .from("worker_personal_calendar_days")
              .insert(toInsert);
            
            if (insertErr) {
              console.error('[getCalendar] BACKFILL: Error inserting personal days:', insertErr);
            } else {
              console.log(`[getCalendar] BACKFILL: Successfully inserted ${toInsert.length} missing free_assignment days`);
              // Add to personalOverrides so they will be included in freeAssignmentDates later
              toInsert.forEach(d => {
                (personalOverrides as any[]).push(d);
              });
            }
          }
        }
      }

      // Count group vacation days and general vacation days from calendar
      // SKIP days that are in unlockedDates (removed by admin modification)
      let groupVacationDays = 0;
      let generalVacationDays = 0;
      const otherGroupVacationDays: string[] = [];
      
      (days || []).forEach((day: any) => {
        // Skip days that have been unlocked by admin
        if (unlockedDates.has(day.date)) {
          return;
        }
        
        if (day.day_type === "vacaciones_generales") {
          generalVacationDays++;
        } else if (day.day_type === "vacaciones_grupo" || day.day_type === "vacaciones") {
          if (workGroupId) {
            const isWorkerGroup = day.group_id === workGroupId || day.group_id_2 === workGroupId;
            if (isWorkerGroup) {
              groupVacationDays++;
            } else if (day.group_id || day.group_id_2) {
              // Other group is on vacation - mark as non-vacation period for this worker
              otherGroupVacationDays.push(day.date);
            }
          } else if (day.group_id || day.group_id_2) {
            // Worker has no group, any group vacation is non-vacation period
            otherGroupVacationDays.push(day.date);
          }
        }
      });

      // Build personal day sets (added days must be visible)
      const libreConfigDates: string[] = [];
      const adminAssignedDates: string[] = [];
      const freeAssignmentDates: string[] = [];

      (personalOverrides || []).forEach((po: any) => {
        if (!po?.date) return;
        if (po.day_type === 'libre_configuracion') libreConfigDates.push(po.date);
        if (po.day_type === 'admin_assigned') adminAssignedDates.push(po.date);
        if (po.day_type === 'free_assignment') freeAssignmentDates.push(po.date);
      });

      return ok({
        success: true,
        worker: {
          id: worker.id,
          name: worker.name,
          worker_number: worker.worker_number,
          department_id: worker.department_id,
          work_group_id: workGroupId, // Return resolved group ID
        },
        departmentName: dept?.name || "",
        departmentPublicToken: dept?.public_token || "",
        departmentMaxDays: dept?.max_days_per_employee || 0,
        departmentRequireAllDays: dept?.require_all_days ?? false,
        departmentSlug: dept?.slug || "",
        workGroup: group,
        calendar: calendar
          ? { 
              id: calendar.id, 
              year: calendar.year, 
              info_text: calendar.info_text,
              info_text_ar: calendar.info_text_ar,
              info_text_fr: calendar.info_text_fr
            }
          : null,
        calendarDays: days || [],
        customDayTypes: customTypes || [],
        approvedDates,
        pendingDates,
        otherGroupVacationDays, // Days when other groups are on vacation
        unlockedDates: Array.from(unlockedDates), // Days unlocked by admin modification
        personalDays: personalOverrides,
        libreConfigDates,
        adminAssignedDates,
        freeAssignmentDates,
        vacationSummary: await (async () => {
          // Check for global free days setting first (highest priority)
          const { data: appSettings } = await supabase
            .from("app_settings")
            .select("global_free_days_enabled, global_free_days_value")
            .limit(1)
            .maybeSingle();

          const globalFreeDaysEnabled = appSettings?.global_free_days_enabled ?? false;
          const globalFreeDaysValue = appSettings?.global_free_days_value ?? null;

          // Calculate free assignment days:
          // Priority: 1. Global setting, 2. Department manual, 3. Work group automatic
          const adjustment = workerFull?.vacation_days_adjustment ?? 0;
          const freeDaysDeduction = group?.free_days_deduction ?? 0;
          
          let totalFreeAssignment: number;
          if (globalFreeDaysEnabled && globalFreeDaysValue !== null) {
            // Global mode: use global value (still apply deduction)
            totalFreeAssignment = globalFreeDaysValue - freeDaysDeduction;
          } else if (dept?.manual_free_days_enabled && dept?.manual_free_days_value != null) {
            // Manual mode: the value IS the total free assignment days (still apply deduction)
            totalFreeAssignment = dept.manual_free_days_value - freeDaysDeduction;
          } else {
            // Automatic mode: use group's max_free_days as base, then subtract assigned vacation days
            const baseDays = group?.max_free_days ?? workerFull?.pending_vacation_days ?? dept?.max_days_per_employee ?? 22;
            totalFreeAssignment = baseDays - groupVacationDays - generalVacationDays + adjustment - freeDaysDeduction;
          }
          
          // Use approvedDaysTotal which accounts for half-days correctly
          const freeAssignmentUsed = approvedDaysTotal;
          const freeAssignmentRemaining = Math.max(0, totalFreeAssignment - freeAssignmentUsed);
          
          return {
            groupVacationDays,
            generalVacationDays,
            approvedRequestDays: approvedDaysTotal, // Use correct half-day count
            totalVacationDays: groupVacationDays + generalVacationDays + approvedDaysTotal,
            totalFreeAssignment: Math.max(0, totalFreeAssignment),
            freeAssignmentUsed,
            freeAssignmentRemaining,
          };
        })(),
      });
    }

    if (action === "getSchedule") {
      const weekNumber = Number(input?.weekNumber);
      const year = Number(input?.year);

      if (!Number.isFinite(weekNumber) || !Number.isFinite(year)) {
        return err("Invalid week", 400);
      }

      // Resolve effective department for responsables
      let effectiveSchedDeptId = worker.department_id;
      let effectiveSchedTeamId = worker.worker_team_id;
      const { data: leadTeamSched } = await supabase
        .from("worker_teams")
        .select("id, department_id")
        .eq("responsable_worker_id", worker.id)
        .limit(1)
        .maybeSingle();
      if (leadTeamSched) {
        effectiveSchedDeptId = leadTeamSched.department_id;
        effectiveSchedTeamId = leadTeamSched.id;
        console.log(`[getSchedule] Responsable override: dept ${worker.department_id} -> ${effectiveSchedDeptId}, team -> ${effectiveSchedTeamId}`);
      }

      const { data: dept } = await supabase
        .from("departments")
        .select("id, name, schedule_configured")
        .eq("id", effectiveSchedDeptId)
        .maybeSingle();

      // =====================================================
      // PRIORITY 1: Check for PERSONAL SCHEDULE first
      // Personal schedules always take precedence over group schedules
      // =====================================================
      const { data: personalSchedule } = await supabase
        .from("personal_work_schedules")
        .select(`
          id,
          schedule_template,
          rotation_group_id,
          rotation_position,
          is_active,
          personal_schedule_rotation_groups (
            id,
            name,
            rotation_enabled,
            base_week,
            base_year
          )
        `)
        .eq("worker_id", worker.id)
        .eq("is_active", true)
        .maybeSingle();

      // If worker has a personal schedule, use it with rotation logic
      if (personalSchedule) {
        console.log(`[getSchedule] Worker ${worker.name} has PERSONAL schedule (precedence over group)`);

        let finalTemplate = personalSchedule.schedule_template;
        let rotationApplied = false;
        let rotationInfo: { groupName: string; memberCount: number; weekOffset: number } | null = null;

        // Check if rotation should be applied
        const rotationGroup = personalSchedule.personal_schedule_rotation_groups as any;
        if (rotationGroup && rotationGroup.rotation_enabled && personalSchedule.rotation_group_id) {
          // Fetch all schedules in this rotation group
          const { data: groupSchedules } = await supabase
            .from("personal_work_schedules")
            .select("id, worker_id, schedule_template, rotation_position")
            .eq("rotation_group_id", personalSchedule.rotation_group_id)
            .eq("is_active", true)
            .order("rotation_position");

          if (groupSchedules && groupSchedules.length > 1) {
            const baseWeek = rotationGroup.base_week;
            const baseYear = rotationGroup.base_year;
            const weeksSinceBase = (year - baseYear) * 52 + (weekNumber - baseWeek);
            const rotationOffset = ((weeksSinceBase % groupSchedules.length) + groupSchedules.length) % groupSchedules.length;

            // Find this worker's position and calculate which template to use
            const workerPosition = groupSchedules.findIndex((s: any) => s.worker_id === worker.id);
            if (workerPosition >= 0) {
              const templateIndex = (workerPosition - rotationOffset + groupSchedules.length) % groupSchedules.length;
              finalTemplate = groupSchedules[templateIndex]?.schedule_template || finalTemplate;
              rotationApplied = true;
              rotationInfo = {
                groupName: rotationGroup.name,
                memberCount: groupSchedules.length,
                weekOffset: rotationOffset,
              };
              console.log(`[getSchedule] Rotation applied: offset=${rotationOffset}, using template from position ${templateIndex}`);
            }
          }
        }

        // Fetch shifts for display
        const { data: shifts } = await supabase
          .from("department_shifts")
          .select("id, name, shift_key, color, start_time, end_time, is_rest")
          .eq("department_id", effectiveSchedDeptId)
          .order("sort_order");

        // Build a "virtual" schedule configuration from personal template
        // Personal schedules are stored as { dayKey: { type, start, end } }
        // We need to convert to team-based format that the frontend expects
        const personalConfig: Record<string, Record<string, { type: string; startTime?: string; endTime?: string }>> = {};
        const template = finalTemplate as Record<string, { type: string; start: string | null; end: string | null }>;
        
        // Create a virtual team ID for personal schedule display
        const virtualTeamId = `personal_${worker.id}`;
        
        for (const dayKey of ["0", "1", "2", "3", "4", "5", "6"]) {
          const entry = template[dayKey] || { type: "rest", start: null, end: null };
          personalConfig[dayKey] = {
            [virtualTeamId]: {
              type: entry.type,
              startTime: entry.start || undefined,
              endTime: entry.end || undefined,
            },
          };
        }

        return ok({
          success: true,
          worker: {
            id: worker.id,
            name: worker.name,
            worker_number: worker.worker_number,
            department_id: worker.department_id,
            work_group_id: worker.work_group_id,
            worker_team_id: worker.worker_team_id,
          },
          departmentName: dept?.name || "",
          scheduleConfigured: true,
          workGroup: null,
          workerTeam: { id: virtualTeamId, name: "Horario Personal" },
          shifts: shifts || [],
          weekReviewed: true, // Personal schedules are always "reviewed" since admin sets them
          isPersonalSchedule: true,
          rotationApplied,
          rotationInfo,
          schedule: {
            id: personalSchedule.id,
            week_number: weekNumber,
            year: year,
            configuration: personalConfig,
          },
        });
      }

      // =====================================================
      // PRIORITY 2: Fall back to GROUP SCHEDULE
      // =====================================================
      // Determine work group - either directly assigned or through team (same logic as getCalendar)
      let scheduleWorkGroupId = worker.work_group_id;
      let scheduleGroupSource = scheduleWorkGroupId ? "direct" : "none";
      
      if (!scheduleWorkGroupId && effectiveSchedTeamId) {
        const { data: teamGroup } = await supabase
          .from("work_group_teams")
          .select("work_group_id")
          .eq("worker_team_id", effectiveSchedTeamId)
          .maybeSingle();
        
        if (teamGroup) {
          scheduleWorkGroupId = teamGroup.work_group_id;
          scheduleGroupSource = "team_mapping";
        }
      }
      
      console.log(`[getSchedule] Worker ${worker.name} (#${worker.worker_number}): using GROUP schedule, resolved_group=${scheduleWorkGroupId || 'null'} (source: ${scheduleGroupSource})`);

      const { data: group } = scheduleWorkGroupId
        ? await supabase
            .from("work_groups")
            .select("id, name, color")
            .eq("id", scheduleWorkGroupId)
            .maybeSingle()
        : { data: null };

      const { data: team } = effectiveSchedTeamId
        ? await supabase
            .from("worker_teams")
            .select("id, name")
            .eq("id", effectiveSchedTeamId)
            .maybeSingle()
        : { data: null };

      const { data: shifts } = await supabase
        .from("department_shifts")
        .select("id, name, shift_key, color, start_time, end_time, is_rest")
        .eq("department_id", effectiveSchedDeptId)
        .order("sort_order");

      const { data: schedule } = await supabase
        .from("weekly_schedules")
        .select("id, week_number, year, configuration, is_reviewed")
        .eq("department_id", effectiveSchedDeptId)
        .eq("week_number", weekNumber)
        .eq("year", year)
        .maybeSingle();

      // Check if schedule is reviewed - workers can only see reviewed schedules
      // Exception: on Friday+ they can also see next week if reviewed
      const now = new Date();
      const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 5 = Friday
      const isFridayOrLater = dayOfWeek >= 5 || dayOfWeek === 0;
      
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
      
      const currentWeekInfo = getIsoWeekInfo(now);
      const nextWeekDate = new Date(now);
      nextWeekDate.setDate(nextWeekDate.getDate() + 7);
      const nextWeekInfo = getIsoWeekInfo(nextWeekDate);
      
      const isReviewed = schedule?.is_reviewed ?? false;
      const isRequestingCurrentWeek = weekNumber === currentWeekInfo.week && year === currentWeekInfo.year;
      const isRequestingNextWeek = weekNumber === nextWeekInfo.week && year === nextWeekInfo.year;
      const isRequestingPastWeek = year < currentWeekInfo.year || 
        (year === currentWeekInfo.year && weekNumber < currentWeekInfo.week);
      
      let canViewSchedule = false;
      if (isRequestingPastWeek || isRequestingCurrentWeek) {
        canViewSchedule = isReviewed;
      } else if (isRequestingNextWeek && isFridayOrLater) {
        canViewSchedule = isReviewed;
      }
      
      console.log(`[getSchedule] Week ${weekNumber}/${year}: is_reviewed=${isReviewed}, canView=${canViewSchedule}, isFriday+=${isFridayOrLater}`);

      // The legacy department-level flag `schedule_configured` is no longer the source of truth.
      // Workers should be allowed to see schedules week-by-week when they exist (and are reviewed).
      const weekHasScheduleRow = !!schedule?.id;
      const scheduleConfigured = (dept?.schedule_configured ?? false) || weekHasScheduleRow;

      return ok({
        success: true,
        worker: {
          id: worker.id,
          name: worker.name,
          worker_number: worker.worker_number,
          department_id: worker.department_id,
          work_group_id: scheduleWorkGroupId, // Return resolved group ID
          worker_team_id: worker.worker_team_id,
        },
        departmentName: dept?.name || "",
        scheduleConfigured,
        workGroup: group,
        workerTeam: team,
        shifts: shifts || [],
        weekReviewed: isReviewed,
        schedule: canViewSchedule && schedule
          ? {
              id: schedule.id,
              week_number: schedule.week_number,
              year: schedule.year,
              configuration: schedule.configuration as Json,
            }
          : null,
      });
    }

    // ─── GET MY GROUP (for /mi-grupo page) ───────────────────────────────────
    if (action === "getMyGroup") {
      // Resolve effective department/team for responsables (can lead teams in other departments)
      let effectiveDeptId = worker.department_id;
      let effectiveTeamId = worker.worker_team_id;

      const { data: leadTeam } = await supabase
        .from("worker_teams")
        .select("id, department_id")
        .eq("responsable_worker_id", worker.id)
        .limit(1)
        .maybeSingle();

      if (leadTeam) {
        effectiveDeptId = leadTeam.department_id;
        // For responsables, always prioritize the team they lead (not their profile team)
        effectiveTeamId = leadTeam.id;
      }

      // Team + responsable info
      let workerTeamData: { id: string; name: string; display_name: string | null } | null = null;
      let responsableData: { name: string } | null = null;
      let responsableWorkerId: string | null = null;

      if (effectiveTeamId) {
        const { data: teamInfo } = await supabase
          .from("worker_teams")
          .select("id, name, display_name, department_id, responsable_worker_id")
          .eq("id", effectiveTeamId)
          .maybeSingle();

        if (teamInfo) {
          workerTeamData = {
            id: teamInfo.id,
            name: teamInfo.name,
            display_name: teamInfo.display_name,
          };
          effectiveDeptId = teamInfo.department_id || effectiveDeptId;
          responsableWorkerId = teamInfo.responsable_worker_id || null;

          if (teamInfo.responsable_worker_id) {
            const { data: respWorker } = await supabase
              .from("workers")
              .select("name, worker_number")
              .eq("id", teamInfo.responsable_worker_id)
              .maybeSingle();

            if (respWorker && !isTestWorker(respWorker)) {
              responsableData = { name: respWorker.name };
            }
          }
        }
      }

      // Resolve vacation group (for color/header info)
      let workGroupId = worker.work_group_id;

      if (!workGroupId && effectiveTeamId) {
        const { data: teamMapping } = await supabase
          .from("work_group_teams")
          .select("work_group_id")
          .eq("worker_team_id", effectiveTeamId)
          .maybeSingle();

        if (teamMapping) {
          workGroupId = teamMapping.work_group_id;
        }
      }

      const { data: workGroup } = workGroupId
        ? await supabase
            .from("work_groups")
            .select("id, name, color")
            .eq("id", workGroupId)
            .maybeSingle()
        : { data: null };

      // Get team members (all workers in current team)
      let teamMembers: { id: string; name: string; worker_number: string }[] = [];

      if (effectiveTeamId) {
        const { data: members } = await supabase
          .from("workers")
          .select("id, name, worker_number")
          .eq("department_id", effectiveDeptId)
          .eq("worker_team_id", effectiveTeamId)
          .eq("is_on_leave", false)
          .is("deleted_at", null)
          .order("name");

        teamMembers = (members || [])
          .filter((m) => !isTestWorker(m))
          .map((m) => ({
            id: m.id,
            name: m.name,
            worker_number: m.worker_number,
          }));
      }

      // Exclude ALL responsables (from any team in the department) from regular members list
      const { data: allDeptTeams } = await supabase
        .from("worker_teams")
        .select("responsable_worker_id")
        .eq("department_id", effectiveDeptId)
        .not("responsable_worker_id", "is", null);

      const allResponsableIds = new Set(
        (allDeptTeams || []).map((t: any) => t.responsable_worker_id)
      );
      teamMembers = teamMembers.filter((m) => !allResponsableIds.has(m.id));

      const subgroups = workerTeamData
        ? [
            {
              teamId: workerTeamData.id,
              teamName: workerTeamData.display_name || workerTeamData.name,
              isCurrentWorkerTeam: true,
              members: teamMembers,
            },
          ]
        : [];

      return ok({
        success: true,
        workerName: worker.name,
        workerNumber: worker.worker_number,
        departmentId: effectiveDeptId,
        workGroup: workGroup
          ? {
              id: workGroup.id,
              name: workGroup.name,
              color: workGroup.color,
            }
          : null,
        workerTeam: workerTeamData,
        responsable: responsableData,
        subgroups,
      });
    }


    return err("Unknown action", 400);
  } catch (e) {
    console.error("worker-personal error:", e);
    return err("Internal error", 500);
  }
});
