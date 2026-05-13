import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertRequest {
  checkPeriodDays?: number;
}

interface WorkerIncident {
  workerId: string;
  workerName: string;
  workerNumber: string;
  departmentName: string;
  delays: number;
  absences: number;
  totalDelayMinutes: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { checkPeriodDays = 7 }: AlertRequest = await req.json().catch(() => ({}));

    // Fetch settings
    const { data: settings, error: settingsError } = await supabase
      .from("labor_module_settings")
      .select("*")
      .limit(1)
      .single();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ error: "No settings configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settings.alerts_enabled || !settings.alert_email) {
      return new Response(
        JSON.stringify({ message: "Alerts not enabled or no email configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const delayThreshold = settings.delay_threshold_minutes || 10;
    const alertDelays = settings.alert_threshold_delays || 3;
    const alertAbsences = settings.alert_threshold_absences || 2;
    const alertEmail = settings.alert_email;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - checkPeriodDays);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // Fetch workers with departments
    const { data: workers } = await supabase
      .from("workers")
      .select("id, name, worker_number, department_id, departments(name)")
      .is("deleted_at", null);

    if (!workers || workers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No workers found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch time entries for the period
    const { data: entries } = await supabase
      .from("time_entries")
      .select("worker_id, delay_minutes, is_absence")
      .gte("entry_date", startDateStr)
      .lte("entry_date", endDateStr);

    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ message: "No time entries found for period" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch already sent alerts for this period
    const { data: sentAlerts } = await supabase
      .from("labor_incident_alerts")
      .select("worker_id, alert_type")
      .gte("period_start", startDateStr)
      .lte("period_end", endDateStr);

    const sentAlertSet = new Set(
      (sentAlerts || []).map((a) => `${a.worker_id}-${a.alert_type}`)
    );

    // Calculate incidents per worker
    const workerIncidents: WorkerIncident[] = [];

    for (const worker of workers) {
      const workerEntries = entries.filter((e) => e.worker_id === worker.id);
      
      const delays = workerEntries.filter(
        (e) => (e.delay_minutes || 0) >= delayThreshold
      ).length;
      
      const absences = workerEntries.filter((e) => e.is_absence).length;
      
      const totalDelayMinutes = workerEntries.reduce(
        (sum, e) => sum + (e.delay_minutes || 0),
        0
      );

      const deptData = worker.departments as unknown as { name: string } | null;

      if (delays >= alertDelays || absences >= alertAbsences) {
        workerIncidents.push({
          workerId: worker.id,
          workerName: worker.name,
          workerNumber: worker.worker_number,
          departmentName: deptData?.name || "Sin departamento",
          delays,
          absences,
          totalDelayMinutes,
        });
      }
    }

    // Filter out already alerted workers
    const newIncidents = workerIncidents.filter((w) => {
      const hasDelayAlert = sentAlertSet.has(`${w.workerId}-delays`);
      const hasAbsenceAlert = sentAlertSet.has(`${w.workerId}-absences`);
      
      return (
        (w.delays >= alertDelays && !hasDelayAlert) ||
        (w.absences >= alertAbsences && !hasAbsenceAlert)
      );
    });

    if (newIncidents.length === 0) {
      return new Response(
        JSON.stringify({ message: "No new incidents to alert" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build email HTML
    const formatMinutes = (mins: number) => {
      const hours = Math.floor(mins / 60);
      const minutes = mins % 60;
      return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };

    const incidentRows = newIncidents
      .map(
        (w) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e5e5;">
            <strong>${w.workerName}</strong><br/>
            <span style="color: #666; font-size: 12px;">#${w.workerNumber}</span>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; color: #666;">
            ${w.departmentName}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">
            ${
              w.delays >= alertDelays
                ? `<span style="background: #fef3c7; color: #d97706; padding: 4px 8px; border-radius: 4px; font-weight: 600;">${w.delays}</span>`
                : w.delays
            }
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center; color: #666;">
            ${formatMinutes(w.totalDelayMinutes)}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">
            ${
              w.absences >= alertAbsences
                ? `<span style="background: #fee2e2; color: #dc2626; padding: 4px 8px; border-radius: 4px; font-weight: 600;">${w.absences}</span>`
                : w.absences
            }
          </td>
        </tr>
      `
      )
      .join("");

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; margin: 0;">
        <div style="max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #68a33e 0%, #4a7c2a 100%); padding: 30px; text-align: center;">
            <img src="https://www.verdnatura.es/vn-logo-w.png" alt="Verdnatura" style="height: 40px; margin-bottom: 15px;" />
            <h1 style="color: white; margin: 0; font-size: 24px;">Alerta de Incidencias Laborales</h1>
          </div>
          
          <div style="padding: 30px;">
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              Se han detectado trabajadores que superan los umbrales de incidencias configurados en los últimos <strong>${checkPeriodDays} días</strong>:
            </p>
            
            <ul style="color: #666; font-size: 14px; margin: 15px 0;">
              <li>Umbral de retrasos: <strong>${alertDelays} o más</strong></li>
              <li>Umbral de ausencias: <strong>${alertAbsences} o más</strong></li>
              <li>Se considera retraso: <strong>≥${delayThreshold} minutos</strong></li>
            </ul>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <thead>
                <tr style="background: #f9f9f9;">
                  <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e5e5;">Trabajador</th>
                  <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e5e5;">Departamento</th>
                  <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e5e5;">Retrasos</th>
                  <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e5e5;">Tiempo</th>
                  <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e5e5;">Ausencias</th>
                </tr>
              </thead>
              <tbody>
                ${incidentRows}
              </tbody>
            </table>
            
            <p style="color: #999; font-size: 12px; margin-top: 30px; text-align: center;">
              Este es un mensaje automático del sistema de control horario.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email
    const emailResponse = await resend.emails.send({
      from: "Verdnatura Control Horario <vacaciones@vnprod.app>",
      to: [alertEmail],
      subject: `⚠️ Alerta: ${newIncidents.length} trabajador(es) con incidencias`,
      html: emailHtml,
    });

    console.log("Email sent:", emailResponse);

    // Record sent alerts
    const alertRecords = [];
    for (const incident of newIncidents) {
      if (incident.delays >= alertDelays) {
        alertRecords.push({
          worker_id: incident.workerId,
          alert_type: "delays",
          period_start: startDateStr,
          period_end: endDateStr,
          incident_count: incident.delays,
        });
      }
      if (incident.absences >= alertAbsences) {
        alertRecords.push({
          worker_id: incident.workerId,
          alert_type: "absences",
          period_start: startDateStr,
          period_end: endDateStr,
          incident_count: incident.absences,
        });
      }
    }

    if (alertRecords.length > 0) {
      await supabase.from("labor_incident_alerts").insert(alertRecords);
    }

    return new Response(
      JSON.stringify({
        success: true,
        alertsSent: newIncidents.length,
        emailId: emailResponse?.data?.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-labor-alert:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
