import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY");

// SECURITY: Rate limiting constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

// Helper for hashing passwords (SHA-256 for RRHH users)
async function hashPasswordSha256(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPasswordSha256(password: string, hash: string): Promise<boolean> {
  const inputHash = await hashPasswordSha256(password);
  return inputHash === hash;
}

// Bcrypt for managers (same as manager-auth)
async function verifyPasswordBcrypt(password: string, hash: string): Promise<boolean> {
  return bcrypt.compareSync(password, hash);
}

async function hashPasswordBcrypt(password: string): Promise<string> {
  return bcrypt.hashSync(password, 10);
}

// Common email styles - matching Vacaciones design
const getCommonStyles = () => {
  const verdnaturaGreen = "#93d600";
  return `
    body { font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, ${verdnaturaGreen} 0%, #7ab300 100%); padding: 40px 20px; text-align: center; }
    .logo-img { width: 80px; height: 80px; margin-bottom: 15px; }
    .header-title { color: #ffffff; font-size: 24px; font-weight: 600; margin: 0; letter-spacing: -0.5px; }
    .content { padding: 40px 30px; }
    .title { color: #1a1a1a; font-size: 20px; font-weight: 600; margin-bottom: 20px; letter-spacing: -0.3px; }
    .text { color: #666666; font-size: 15px; line-height: 1.7; margin-bottom: 15px; font-weight: 400; letter-spacing: -0.2px; }
    .info-box { background-color: #f8f9fa; padding: 20px; margin: 25px 0; border-radius: 8px; }
    .info-label { color: #1a1a1a; font-weight: 600; font-size: 13px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-value { color: #333333; font-size: 15px; margin-bottom: 15px; font-weight: 400; }
    .divider { height: 1px; background: #eee; margin: 15px 0; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .badge-medico { background-color: #dbeafe; color: #1e40af; }
    .badge-personal { background-color: #ede9fe; color: #6d28d9; }
    .badge-otro { background-color: #f3f4f6; color: #374151; }
    .badge-pending { background-color: #fef3c7; color: #92400e; }
    .badge-success { background-color: #d1fae5; color: #065f46; }
    .badge-rejected { background-color: #fee2e2; color: #991b1b; }
    .button { display: inline-block; background: linear-gradient(135deg, ${verdnaturaGreen} 0%, #7ab300 100%); color: #ffffff !important; padding: 16px 36px; text-decoration: none; border-radius: 30px; font-weight: 600; font-size: 15px; margin: 25px 0; box-shadow: 0 4px 15px rgba(147, 214, 0, 0.4); letter-spacing: -0.2px; }
    .footer { background-color: #1a1a1a; color: #ffffff; padding: 30px; text-align: center; }
    .footer-text { color: #888888; font-size: 12px; font-weight: 400; letter-spacing: -0.2px; margin: 5px 0; }
    .alert-box { background-color: #fff8e6; padding: 20px; margin: 25px 0; border-radius: 8px; }
    .success-box { background-color: #f0fdf4; padding: 20px; margin: 25px 0; border-radius: 8px; }
    .rejected-box { background-color: #fef2f2; padding: 20px; margin: 25px 0; border-radius: 8px; }
    .message-box { background-color: #eff6ff; padding: 20px; margin: 25px 0; border-radius: 8px; }
  `;
};

const logoWhiteUrl = "https://vnprod.app/images/logo-white.png";
const logoImgTag = `<img src="${logoWhiteUrl}" alt="Verdnatura" width="80" height="80" class="logo-img" style="width: 80px; height: 80px; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;">`;

const tipoLabels: Record<string, string> = {
  medico: "Médico",
  personal: "Personal",
  otro: "Otro"
};

// Helper to format date range as specific days
function formatDateRange(fechaInicio: string, fechaFin: string): string {
  if (fechaInicio === fechaFin) {
    return fechaInicio;
  }
  
  // Calculate all days in range
  const start = new Date(fechaInicio);
  const end = new Date(fechaFin);
  const days: string[] = [];
  
  const current = new Date(start);
  while (current <= end) {
    days.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  if (days.length <= 5) {
    return days.join(', ');
  }
  
  return `${fechaInicio} - ${fechaFin} (${days.length} días)`;
}

// Salix worker URL
const getSalixWorkerUrl = (workerNumber: string) => 
  `https://salix.verdnatura.es/#!/worker/${workerNumber}/summary`;

// Send notification email to RRHH and Admin
async function sendNotificationEmail(emails: string[], justificante: any, workerName: string, fileCountText: string = '') {
  if (!resendApiKey || emails.length === 0) return;
  
  const resend = new Resend(resendApiKey);
  const baseUrl = "https://vnprod.app";
  const salixUrl = getSalixWorkerUrl(justificante.worker_number);
  const datesFormatted = formatDateRange(justificante.fecha_inicio, justificante.fecha_fin);

  // Build attachments info
  const archivosAdicionales = justificante.archivos_adicionales || [];
  const totalFiles = 1 + archivosAdicionales.length;
  const allFileNames = [justificante.archivo_nombre, ...archivosAdicionales.map((f: any) => f.nombre)];
  const filesListHtml = totalFiles > 1 ? `
    <div class="divider"></div>
    <div class="info-label">Archivos Adjuntos (${totalFiles})</div>
    <div class="info-value">
      ${allFileNames.map((name: string, i: number) => `<div style="margin-bottom:4px;">📎 ${name}</div>`).join('')}
    </div>
  ` : '';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
      <style>${getCommonStyles()}</style>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
      <div class="container">
        <div class="header">
          ${logoImgTag}
          <h1 class="header-title">Nuevo Justificante Recibido</h1>
        </div>
        <div class="content">
          <p class="title">¡Hola!</p>
          <p class="text">Se ha recibido un nuevo justificante que requiere tu revisión.</p>
          
          <div class="info-box">
            <div class="info-label">Empleado</div>
            <div class="info-value">
              <a href="${salixUrl}" style="color: #93d600; text-decoration: none; font-weight: 600;">${workerName}</a>
            </div>
            
            <div class="info-label">Número de Fichar</div>
            <div class="info-value">
              <a href="${salixUrl}" style="color: #93d600; text-decoration: none;">#${justificante.worker_number}</a>
            </div>
            
            <div class="divider"></div>
            
            <div class="info-label">Tipo de Justificante</div>
            <div class="info-value">
              <span class="badge badge-${justificante.tipo}">${tipoLabels[justificante.tipo] || justificante.tipo.toUpperCase()}</span>
            </div>
            
            <div class="info-label">Días Justificados</div>
            <div class="info-value">${datesFormatted}</div>
            
            ${justificante.comentario_empleado ? `
              <div class="divider"></div>
              <div class="info-label">Comentario del Empleado</div>
              <div class="info-value">${justificante.comentario_empleado}</div>
            ` : ''}
            
            ${filesListHtml}
          </div>
          
          <p class="text">Accede directamente a este justificante para gestionarlo:</p>
          
          <div style="text-align: center;">
            <a href="${baseUrl}/admin/justificantes?id=${justificante.id}" class="button" style="color: #ffffff;">Ver Justificante</a>
          </div>
        </div>
        <div class="footer">
          <p class="footer-text">Este es un correo automático del sistema de justificantes de Verdnatura</p>
          <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await resend.emails.send({
      from: "Justificantes VNProd <justificantes@vnprod.app>",
      to: emails,
      subject: `Justificante - ${workerName} (${justificante.worker_number})${fileCountText}`,
      html: htmlContent,
    });
    console.log("Notification email sent to:", emails);
  } catch (error) {
    console.error("Error sending notification email:", error);
  }
}

// Send notification email when additional documentation is submitted
async function sendAdditionalDocsNotificationEmail(emails: string[], justificante: any, workerName: string, comentario?: string) {
  if (!resendApiKey || emails.length === 0) return;
  
  const resend = new Resend(resendApiKey);
  const baseUrl = "https://vnprod.app";
  const salixUrl = getSalixWorkerUrl(justificante.worker_number);
  const datesFormatted = formatDateRange(justificante.fecha_inicio, justificante.fecha_fin);
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
      <style>${getCommonStyles()}</style>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
      <div class="container">
        <div class="header">
          ${logoImgTag}
          <h1 class="header-title">Documentación Adicional Recibida</h1>
        </div>
        <div class="content">
          <p class="title">¡Nueva documentación!</p>
          <p class="text">El trabajador ha aportado la documentación adicional solicitada.</p>
          
          <div class="success-box">
            <p style="margin: 0; font-weight: 600; color: #065f46;">✓ Documentación recibida correctamente</p>
          </div>
          
          <div class="info-box">
            <div class="info-label">Empleado</div>
            <div class="info-value">
              <a href="${salixUrl}" style="color: #93d600; text-decoration: none; font-weight: 600;">${workerName}</a>
            </div>
            
            <div class="info-label">Número de Fichar</div>
            <div class="info-value">
              <a href="${salixUrl}" style="color: #93d600; text-decoration: none;">#${justificante.worker_number}</a>
            </div>
            
            <div class="divider"></div>
            
            <div class="info-label">Tipo de Justificante</div>
            <div class="info-value">
              <span class="badge badge-${justificante.tipo}">${tipoLabels[justificante.tipo] || justificante.tipo.toUpperCase()}</span>
            </div>
            
            <div class="info-label">Días Justificados</div>
            <div class="info-value">${datesFormatted}</div>
            
            ${comentario ? `
              <div class="divider"></div>
              <div class="info-label">Comentario del Trabajador</div>
              <div class="info-value">${comentario}</div>
            ` : ''}
          </div>
          
          <p class="text">Accede directamente para revisar la nueva documentación:</p>
          
          <div style="text-align: center;">
            <a href="${baseUrl}/admin/justificantes?id=${justificante.id}" class="button" style="color: #ffffff;">Ver Documentación</a>
          </div>
        </div>
        <div class="footer">
          <p class="footer-text">Este es un correo automático del sistema de justificantes de Verdnatura</p>
          <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await resend.emails.send({
      from: "Justificantes VNProd <justificantes@vnprod.app>",
      to: emails,
      subject: `Doc. Adicional - ${workerName} (${justificante.worker_number})`,
      html: htmlContent,
    });
    console.log("Additional docs notification email sent to:", emails);
  } catch (error) {
    console.error("Error sending additional docs notification email:", error);
  }
}

// Send simple notification email to department managers (no button, just info)
async function sendManagerNotificationEmail(emails: string[], justificante: any, workerName: string) {
  if (!resendApiKey || emails.length === 0) return;
  
  const resend = new Resend(resendApiKey);
  const salixUrl = getSalixWorkerUrl(justificante.worker_number);
  const datesFormatted = formatDateRange(justificante.fecha_inicio, justificante.fecha_fin);
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
      <style>${getCommonStyles()}</style>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
      <div class="container">
        <div class="header">
          ${logoImgTag}
          <h1 class="header-title">Justificante de Ausencia</h1>
        </div>
        <div class="content">
          <p class="title">¡Hola!</p>
          <p class="text">Un trabajador de tu departamento ha justificado una ausencia.</p>
          
          <div class="info-box">
            <div class="info-label">Empleado</div>
            <div class="info-value">
              <a href="${salixUrl}" style="color: #93d600; text-decoration: none; font-weight: 600;">${workerName}</a>
            </div>
            
            <div class="info-label">Número de Fichar</div>
            <div class="info-value">
              <a href="${salixUrl}" style="color: #93d600; text-decoration: none;">#${justificante.worker_number}</a>
            </div>
            
            <div class="divider"></div>
            
            <div class="info-label">Tipo de Justificante</div>
            <div class="info-value">
              <span class="badge badge-${justificante.tipo}">${tipoLabels[justificante.tipo] || justificante.tipo.toUpperCase()}</span>
            </div>
            
            <div class="info-label">Días Justificados</div>
            <div class="info-value">${datesFormatted}</div>
          </div>
          
          <p class="text" style="text-align: center; color: #888; font-size: 13px;">Este es un mensaje informativo. El departamento de RRHH gestionará este justificante.</p>
        </div>
        <div class="footer">
          <p class="footer-text">Este es un correo automático del sistema de justificantes de Verdnatura</p>
          <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await resend.emails.send({
      from: "Justificantes VNProd <justificantes@vnprod.app>",
      to: emails,
      subject: `Justificante - ${workerName} (${justificante.worker_number})`,
      html: htmlContent,
    });
    console.log("Manager notification email sent to:", emails);
  } catch (error) {
    console.error("Error sending manager notification email:", error);
  }
}

// Send email to worker about status update
async function sendWorkerStatusEmail(workerEmail: string, justificante: any, estado: string, comentario: string | null, gestorName: string) {
  if (!resendApiKey || !workerEmail) return;
  
  const resend = new Resend(resendApiKey);
  const verdnaturaGreen = "#93d600";
  
  const isApproved = estado === "gestionado";
  const headerStyle = isApproved 
    ? `background: linear-gradient(135deg, ${verdnaturaGreen} 0%, #7ab300 100%);` 
    : `background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);`;
  const boxClass = isApproved ? "success-box" : "rejected-box";
  const statusText = isApproved ? "Gestionado" : "Rechazado";
  const statusColor = isApproved ? verdnaturaGreen : "#ef4444";
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
      <style>${getCommonStyles()}</style>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
      <div class="container">
        <div class="header" style="${headerStyle}">
          ${logoImgTag}
          <h1 class="header-title">${isApproved ? '¡Justificante Gestionado!' : 'Justificante Rechazado'}</h1>
        </div>
        <div class="content">
          <p class="title">¡Hola!</p>
          <p class="text">Tu justificante ha sido <strong style="color: ${statusColor}; font-weight: 600;">${statusText.toLowerCase()}</strong> por el departamento de RRHH.</p>
          
          <div class="${boxClass}">
            <div class="info-label">Tipo de Justificante</div>
            <div class="info-value">
              <span class="badge badge-${justificante.tipo}">${tipoLabels[justificante.tipo] || justificante.tipo.toUpperCase()}</span>
            </div>
            
            <div class="info-label">Fechas</div>
            <div class="info-value">${justificante.fecha_inicio}${justificante.fecha_inicio !== justificante.fecha_fin ? ` - ${justificante.fecha_fin}` : ''}</div>
            
            <div class="divider"></div>
            
            <div class="info-label">Gestionado por</div>
            <div class="info-value">${gestorName}</div>
            
            ${comentario ? `
              <div class="divider"></div>
              <div class="info-label">${isApproved ? 'Comentario' : 'Motivo del Rechazo'}</div>
              <div class="info-value" style="${!isApproved ? 'color: #dc2626; font-weight: 500;' : ''}">${comentario}</div>
            ` : ''}
          </div>
          
          ${isApproved ? `
            <p class="text" style="text-align: center; color: ${verdnaturaGreen}; font-weight: 500;">¡Gracias por tu documentación!</p>
          ` : `
            <p class="text" style="text-align: center;">Si tienes alguna duda, contacta con el departamento de RRHH.</p>
          `}
        </div>
        <div class="footer">
          <p class="footer-text">Este es un correo automático del sistema de justificantes de Verdnatura</p>
          <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await resend.emails.send({
      from: "Justificantes VNProd <justificantes@vnprod.app>",
      to: [workerEmail],
      subject: `Tu justificante ha sido ${statusText.toLowerCase()}`,
      html: htmlContent,
    });
    console.log("Worker status email sent to:", workerEmail);
  } catch (error) {
    console.error("Error sending worker status email:", error);
  }
}

// Send email to worker requesting additional documentation
async function sendRequestDocumentationEmail(workerEmail: string, justificante: any, mensaje: string, token: string, gestorName: string) {
  if (!resendApiKey || !workerEmail) return;
  
  const resend = new Resend(resendApiKey);
  const baseUrl = "https://vnprod.app";
  const uploadUrl = `${baseUrl}/justificantes/adicional?token=${token}`;
  const verdnaturaGreen = "#93d600";
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
      <style>${getCommonStyles()}</style>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
      <div class="container">
        <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
          ${logoImgTag}
          <h1 class="header-title">Documentación Adicional Requerida</h1>
        </div>
        <div class="content">
          <div class="alert-box">
            <p style="font-weight: 600; color: #92400e; margin: 0 0 8px 0; font-size: 16px;">⚠️ Se necesita más documentación</p>
            <p class="text" style="color: #92400e; margin: 0;">El departamento de RRHH necesita que aportes documentación adicional para procesar tu justificante.</p>
          </div>
          
          <div class="info-box">
            <div class="info-label">Tipo de Justificante</div>
            <div class="info-value">
              <span class="badge badge-${justificante.tipo}">${tipoLabels[justificante.tipo] || justificante.tipo.toUpperCase()}</span>
            </div>
            
            <div class="info-label">Fechas</div>
            <div class="info-value">${justificante.fecha_inicio}${justificante.fecha_inicio !== justificante.fecha_fin ? ` - ${justificante.fecha_fin}` : ''}</div>
            
            <div class="divider"></div>
            
            <div class="info-label">Solicitado por</div>
            <div class="info-value">${gestorName}</div>
          </div>
          
          <div class="message-box">
            <p style="font-weight: 600; color: #1d4ed8; margin: 0 0 8px 0;">Mensaje del gestor:</p>
            <p class="text" style="color: #1d4ed8; margin: 0; white-space: pre-wrap;">${mensaje}</p>
          </div>
          
          <p class="text">Por favor, accede al siguiente enlace para subir la documentación solicitada:</p>
          
          <div style="text-align: center;">
            <a href="${uploadUrl}" class="button" style="color: #ffffff; background: linear-gradient(135deg, ${verdnaturaGreen} 0%, #7ab300 100%);">Subir Documentación Adicional</a>
          </div>
        </div>
        <div class="footer">
          <p class="footer-text">Este es un correo automático del sistema de justificantes de Verdnatura</p>
          <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await resend.emails.send({
      from: "Justificantes VNProd <justificantes@vnprod.app>",
      to: [workerEmail],
      subject: `Documentación adicional requerida - Justificante ${tipoLabels[justificante.tipo] || justificante.tipo}`,
      html: htmlContent,
    });
    console.log("Request documentation email sent to:", workerEmail);
  } catch (error) {
    console.error("Error sending request documentation email:", error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { action, data } = await req.json();

    // ============= EMPLOYEE ACTIONS =============
    
    // Check if worker exists and has password (either local hash or supabase auth)
    if (action === "checkWorker") {
      const { workerNumber } = data;
      
      const { data: worker, error } = await supabase
        .from("workers")
        .select("id, name, worker_number, department_id, password_hash, email, user_id")
        .eq("worker_number", workerNumber)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;

      if (!worker) {
        return new Response(
          JSON.stringify({ success: false, error: "Trabajador no encontrado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Worker has password if:
      // 1. Has user_id (registered in vacation system with Supabase Auth)
      // 2. OR has password_hash (local SHA-256 password)
      const hasPassword = !!worker.user_id || !!worker.password_hash;

      return new Response(
        JSON.stringify({ 
          success: true, 
          worker: {
            id: worker.id,
            name: worker.name,
            workerNumber: worker.worker_number,
            hasPassword,
            usesSupabaseAuth: !!worker.user_id,
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Set password for worker (syncs with Supabase Auth if worker has account)
    if (action === "setWorkerPassword") {
      const { workerNumber, password } = data;
      
      if (!password || password.length < 4) {
        return new Response(
          JSON.stringify({ success: false, error: "La contraseña debe tener al menos 4 caracteres" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get worker to check if they have Supabase Auth account
      const { data: worker, error: workerError } = await supabase
        .from("workers")
        .select("id, user_id, email")
        .eq("worker_number", workerNumber)
        .is("deleted_at", null)
        .maybeSingle();

      if (workerError) throw workerError;
      if (!worker) {
        return new Response(
          JSON.stringify({ success: false, error: "Trabajador no encontrado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Always save SHA-256 hash locally
      const passwordHash = await hashPasswordSha256(password);
      const { error: updateError } = await supabase
        .from("workers")
        .update({ password_hash: passwordHash })
        .eq("id", worker.id);

      if (updateError) throw updateError;

      // If worker has Supabase Auth account, also update that password
      if (worker.user_id) {
        try {
          await supabase.auth.admin.updateUserById(worker.user_id, { password });
          console.log(`Synced password to Supabase Auth for worker ${worker.id}`);
        } catch (authError) {
          console.error("Error syncing to Supabase Auth:", authError);
          // Don't fail - local hash was saved successfully
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Login worker with password (supports both Supabase Auth and local hash)
    if (action === "loginWorker") {
      const { workerNumber, password } = data;

      // SECURITY: Rate limiting
      const identifier = `justificantes_worker_${workerNumber}`;
      const cutoffTime = new Date(Date.now() - LOCKOUT_DURATION_MINUTES * 60 * 1000).toISOString();
      const { count: failedCount } = await supabase
        .from('login_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_identifier', identifier)
        .eq('success', false)
        .gte('attempted_at', cutoffTime);

      if ((failedCount || 0) >= MAX_LOGIN_ATTEMPTS) {
        return new Response(
          JSON.stringify({ success: false, error: `Demasiados intentos fallidos. Espera ${LOCKOUT_DURATION_MINUTES} minutos.`, locked: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: worker, error } = await supabase
        .from("workers")
        .select("id, name, worker_number, department_id, password_hash, email, user_id")
        .eq("worker_number", workerNumber)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;

      if (!worker) {
        return new Response(
          JSON.stringify({ success: false, error: "Trabajador no encontrado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let isValid = false;

      if (worker.user_id && worker.email) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: worker.email,
          password
        });
        isValid = !authError;
      } 
      else if (worker.password_hash) {
        isValid = await verifyPasswordSha256(password, worker.password_hash);
      } 
      else {
        return new Response(
          JSON.stringify({ success: false, error: "Debes crear una contraseña primero" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!isValid) {
        await supabase.from('login_attempts').insert({ user_identifier: identifier, ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown', success: false });
        const remaining = Math.max(0, MAX_LOGIN_ATTEMPTS - (failedCount || 0) - 1);
        return new Response(
          JSON.stringify({ success: false, error: "Contraseña incorrecta", remainingAttempts: remaining }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Record successful login
      await supabase.from('login_attempts').insert({ user_identifier: identifier, ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown', success: true });

      // Get department name
      const { data: dept } = await supabase
        .from("departments")
        .select("name")
        .eq("id", worker.department_id)
        .single();

      return new Response(
        JSON.stringify({ 
          success: true, 
          worker: {
            id: worker.id,
            name: worker.name,
            workerNumber: worker.worker_number,
            departmentId: worker.department_id,
            departmentName: dept?.name || "",
            email: worker.email,
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get worker's justificantes
    if (action === "getMyJustificantes") {
      const { workerId } = data;

      const { data: justificantes, error } = await supabase
        .from("justificantes")
        .select("*")
        .eq("worker_id", workerId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, justificantes }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Submit justificante
    if (action === "submitJustificante") {
      const { workerId, workerNumber, workerName, departmentId, tipo, fechaInicio, fechaFin, comentario, archivoUrl, archivoNombre, archivoTipo, archivosAdicionales } = data;

      // Find matching absence entries
      const { data: absences } = await supabase
        .from("time_entries")
        .select("id")
        .eq("worker_id", workerId)
        .eq("is_absence", true)
        .gte("entry_date", fechaInicio)
        .lte("entry_date", fechaFin)
        .limit(1);

      const timeEntryId = absences && absences.length > 0 ? absences[0].id : null;

      // Build additional files array
      const additionalFilesJson = Array.isArray(archivosAdicionales) && archivosAdicionales.length > 0
        ? archivosAdicionales.map((f: any) => ({
            url: f.url,
            nombre: f.nombre,
            tipo: f.tipo,
          }))
        : [];

      const { data: justificante, error } = await supabase
        .from("justificantes")
        .insert({
          worker_id: workerId,
          worker_number: workerNumber,
          worker_name: workerName,
          department_id: departmentId,
          tipo,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          comentario_empleado: comentario || null,
          archivo_url: archivoUrl,
          archivo_nombre: archivoNombre,
          archivo_tipo: archivoTipo,
          estado: "pendiente",
          time_entry_id: timeEntryId,
          archivos_adicionales: additionalFilesJson,
        })
        .select()
        .single();

      if (error) throw error;

      // Build file count for email
      const totalFiles = 1 + additionalFilesJson.length;
      const fileCountText = totalFiles > 1 ? ` (${totalFiles} archivos adjuntos)` : '';

      // Send notification emails
      const { data: settings } = await supabase
        .from("justificantes_settings")
        .select("notification_emails")
        .single();

      if (settings?.notification_emails && settings.notification_emails.length > 0) {
        await sendNotificationEmail(settings.notification_emails, justificante, workerName, fileCountText);
      }
      
      const { data: department } = await supabase
        .from("departments")
        .select("manager_email")
        .eq("id", departmentId)
        .single();
      
      if (department?.manager_email) {
        const managerEmails = department.manager_email
          .split(",")
          .map((e: string) => e.trim())
          .filter((e: string) => e && e.includes("@"));
        
        const rrhhEmails = settings?.notification_emails || [];
        const uniqueManagerEmails = managerEmails.filter((e: string) => !rrhhEmails.includes(e));
        
        if (uniqueManagerEmails.length > 0) {
          await sendManagerNotificationEmail(uniqueManagerEmails, justificante, workerName);
        }
      }
      
      const { data: fullSettings } = await supabase
        .from("justificantes_settings")
        .select("manager_notifications_enabled, manager_notification_emails")
        .single();
      
      if (fullSettings?.manager_notifications_enabled && fullSettings?.manager_notification_emails) {
        const enabledManagers = (fullSettings.manager_notification_emails as any[])
          .filter((m: any) => m.enabled && m.email);
        
        if (enabledManagers.length > 0) {
          const managerEmails = enabledManagers.map((m: any) => m.email);
          await sendManagerNotificationEmail(managerEmails, justificante, workerName);
        }
      }

      // Log audit entry
      const { data: deptData } = await supabase.from("departments").select("name").eq("id", departmentId).single();
      await supabase.from("justificante_audit_logs").insert({
        justificante_id: justificante.id,
        action_type: "created",
        actor_name: workerName,
        actor_role: "Trabajador",
        worker_name: workerName,
        worker_number: workerNumber,
        department_name: deptData?.name || "",
        tipo_justificante: tipo,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        details: `Justificante subido por el trabajador${fileCountText}`
      });

      return new Response(
        JSON.stringify({ success: true, justificante }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Generate signed URL for file upload - REQUIRES worker authentication
    if (action === "getUploadUrl") {
      const { workerId, fileName, workerNumber, password } = data;
      
      // SECURITY: Validate worker authentication before allowing upload
      if (!workerNumber || !password) {
        return new Response(
          JSON.stringify({ success: false, error: "Autenticación requerida para subir archivos" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify worker credentials
      const { data: worker, error: workerError } = await supabase
        .from("workers")
        .select("id, worker_number, password_hash")
        .eq("worker_number", workerNumber)
        .maybeSingle();

      if (workerError || !worker) {
        return new Response(
          JSON.stringify({ success: false, error: "Trabajador no encontrado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify password
      if (worker.password_hash) {
        const isValidPassword = await verifyPasswordSha256(password, worker.password_hash);
        if (!isValidPassword) {
          return new Response(
            JSON.stringify({ success: false, error: "Contraseña incorrecta" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // SECURITY: Ensure workerId matches the authenticated worker
      if (workerId && workerId !== worker.id) {
        console.error("SECURITY: Upload URL requested for different worker");
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado para subir archivos de otro trabajador" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // SECURITY: Validate file extension
      const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'gif', 'webp'];
      const extension = fileName.split('.').pop()?.toLowerCase() || '';
      if (!allowedExtensions.includes(extension)) {
        return new Response(
          JSON.stringify({ success: false, error: `Tipo de archivo no permitido. Extensiones válidas: ${allowedExtensions.join(', ')}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // SECURITY: Sanitize file name
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
      const filePath = `${worker.id}/${Date.now()}_${sanitizedFileName}`;
      
      const { data: signedData, error } = await supabase.storage
        .from("justificantes")
        .createSignedUploadUrl(filePath);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, signedUrl: signedData.signedUrl, path: signedData.path }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get public URL for file
    if (action === "getFileUrl") {
      const { filePath } = data;
      
      const { data: signedData, error } = await supabase.storage
        .from("justificantes")
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, url: signedData.signedUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= ADMIN/RRHH ACTIONS =============
    
    // SECURITY: Verify admin or RRHH session - NO inline tokens allowed
    const verifyAdminOrRrhhSession = async (sessionToken: string) => {
      if (!sessionToken) return null;

      // SECURITY REMOVED: Inline token patterns (rrhh_*, admin_*) are no longer accepted
      // All sessions MUST be validated against the manager_sessions table
      if (sessionToken.startsWith("rrhh_") || sessionToken.startsWith("admin_")) {
        console.error("SECURITY: Rejected inline token pattern - these are no longer accepted");
        return null;
      }
      
      // Check manager_sessions table
      const { data: session, error } = await supabase
        .from("manager_sessions")
        .select("manager_id, expires_at")
        .eq("token", sessionToken)
        .maybeSingle();

      if (error || !session) return null;
      if (new Date(session.expires_at) < new Date()) return null;

      // Check if it's an admin manager
      const { data: manager } = await supabase
        .from("managers")
        .select("id, name, role")
        .eq("id", session.manager_id)
        .single();

      if (manager && manager.role === "admin") {
        return { ...manager, isRrhh: false };
      }

      // Check if it's an RRHH user
      const { data: rrhhUser } = await supabase
        .from("rrhh_users")
        .select("id, name, role, is_active")
        .eq("id", session.manager_id)
        .eq("is_active", true)
        .single();

      if (rrhhUser) {
        return { id: rrhhUser.id, name: rrhhUser.name, role: rrhhUser.role, isRrhh: true };
      }

      return null;
    };

    // Legacy function for admin-only actions
    const verifyAdminSession = async (sessionToken: string) => {
      const user = await verifyAdminOrRrhhSession(sessionToken);
      if (!user) return null;
      // Both admin managers and admin_principal RRHH users have admin access
      if (user.isRrhh && user.role !== "admin_principal") return null;
      if (!user.isRrhh && user.role !== "admin") return null;
      return user;
    };

    // Get all justificantes (admin)
    if (action === "getAllJustificantes") {
      const { sessionToken, filters } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let query = supabase
        .from("justificantes")
        .select(`
          *,
          departments:department_id (name),
          documentos:justificante_documentos (id, tipo_mensaje, created_at)
        `)
        .order("created_at", { ascending: false });

      // Apply filters
      if (filters?.estado && filters.estado !== "all") {
        query = query.eq("estado", filters.estado);
      }
      if (filters?.departmentId && filters.departmentId !== "all") {
        query = query.eq("department_id", filters.departmentId);
      }
      if (filters?.fechaDesde) {
        query = query.gte("fecha_inicio", filters.fechaDesde);
      }
      if (filters?.fechaHasta) {
        query = query.lte("fecha_fin", filters.fechaHasta);
      }

      const { data: justificantes, error } = await query;

      if (error) throw error;

      // Enrich with worker vacation account info
      const workerIds = [...new Set(justificantes.map(j => j.worker_id))];
      const { data: workersInfo } = await supabase
        .from("workers")
        .select("id, user_id")
        .in("id", workerIds);

      const workerVacationMap = new Map(
        (workersInfo || []).map(w => [w.id, !!w.user_id])
      );

      // Get latest gestion comment for each justificante
      const justificanteIds = justificantes.map(j => j.id);
      const { data: gestiones } = await supabase
        .from("justificante_gestiones")
        .select("justificante_id, comentario_gestor, accion, created_at")
        .in("justificante_id", justificanteIds)
        .order("created_at", { ascending: false });

      // Create a map with the latest gestion for each justificante
      const latestGestionMap = new Map<string, { comentario_gestor: string | null; accion: string }>();
      for (const g of gestiones || []) {
        if (!latestGestionMap.has(g.justificante_id)) {
          latestGestionMap.set(g.justificante_id, { 
            comentario_gestor: g.comentario_gestor, 
            accion: g.accion 
          });
        }
      }

      const enrichedJustificantes = justificantes.map(j => ({
        ...j,
        has_vacation_account: workerVacationMap.get(j.worker_id) || false,
        last_gestion_comment: latestGestionMap.get(j.id)?.comentario_gestor || null
      }));

      return new Response(
        JSON.stringify({ success: true, justificantes: enrichedJustificantes }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update justificante status (admin)
    if (action === "updateJustificanteStatus") {
      const { sessionToken, justificanteId, estado, comentarioGestor } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the justificante and worker info for email
      const { data: justificante, error: getError } = await supabase
        .from("justificantes")
        .select("*, workers:worker_id (email)")
        .eq("id", justificanteId)
        .single();

      if (getError) throw getError;

      // Update justificante
      const { error: updateError } = await supabase
        .from("justificantes")
        .update({ estado, updated_at: new Date().toISOString() })
        .eq("id", justificanteId);

      if (updateError) throw updateError;

      // Log the action
      const { error: logError } = await supabase
        .from("justificante_gestiones")
        .insert({
          justificante_id: justificanteId,
          gestionado_por_user_id: null,
          gestionado_por_nombre: admin.name,
          accion: estado,
          comentario_gestor: comentarioGestor || null,
        });

      if (logError) throw logError;

      // Send email to worker if they have an email
      if (justificante?.workers?.email) {
        await sendWorkerStatusEmail(
          justificante.workers.email,
          justificante,
          estado,
          comentarioGestor || null,
          admin.name
        );
      }

      // Get department name for audit log
      const { data: deptData } = await supabase.from("departments").select("name").eq("id", justificante.department_id).single();
      
      // Log audit entry
      const actionLabel = estado === "gestionado" ? "aprobado" : estado === "rechazado" ? "rechazado" : estado;
      await supabase.from("justificante_audit_logs").insert({
        justificante_id: justificanteId,
        action_type: actionLabel,
        actor_name: admin.name,
        actor_role: admin.isRrhh ? "RRHH" : "Admin",
        worker_name: justificante.worker_name,
        worker_number: justificante.worker_number,
        department_name: deptData?.name || "",
        tipo_justificante: justificante.tipo,
        fecha_inicio: justificante.fecha_inicio,
        fecha_fin: justificante.fecha_fin,
        details: comentarioGestor || `Estado cambiado a ${actionLabel} por ${admin.name}`
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete justificante (admin only - not RRHH)
    if (action === "deleteJustificante") {
      const { sessionToken, justificanteId } = data;
      
      // Only admin managers can delete, not RRHH users
      const user = await verifyAdminOrRrhhSession(sessionToken);
      if (!user) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Check if user is admin (not regular RRHH)
      const isFullAdmin = (!user.isRrhh && user.role === "admin") || (user.isRrhh && user.role === "admin_principal");
      if (!isFullAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: "Solo los administradores pueden eliminar justificantes" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get justificante info for audit log
      const { data: justificante, error: getError } = await supabase
        .from("justificantes")
        .select("*, departments:department_id (name)")
        .eq("id", justificanteId)
        .single();

      if (getError) throw getError;

      // Delete the file(s) from storage
      const filesToDelete: string[] = [];
      if (justificante.archivo_url) filesToDelete.push(justificante.archivo_url);
      if (justificante.archivos_adicionales && Array.isArray(justificante.archivos_adicionales)) {
        justificante.archivos_adicionales.forEach((f: any) => {
          if (f.url) filesToDelete.push(f.url);
        });
      }
      if (filesToDelete.length > 0) {
        await supabase.storage.from("justificantes").remove(filesToDelete);
      }

      // Delete gestiones (history entries)
      await supabase.from("justificante_gestiones").delete().eq("justificante_id", justificanteId);

      // Delete the justificante
      const { error: deleteError } = await supabase
        .from("justificantes")
        .delete()
        .eq("id", justificanteId);

      if (deleteError) throw deleteError;

      // Log audit entry
      await supabase.from("justificante_audit_logs").insert({
        justificante_id: justificanteId,
        action_type: "deleted",
        actor_name: user.name,
        actor_role: user.isRrhh ? "Admin Principal" : "Admin",
        worker_name: justificante.worker_name,
        worker_number: justificante.worker_number,
        department_name: justificante.departments?.name || "",
        tipo_justificante: justificante.tipo,
        fecha_inicio: justificante.fecha_inicio,
        fecha_fin: justificante.fecha_fin,
        details: `Justificante eliminado por ${user.name}`
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Request additional documentation (admin)
    if (action === "requestDocumentation") {
      const { sessionToken, justificanteId, mensaje, gestionadoPor } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!mensaje || mensaje.trim().length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "El mensaje es obligatorio" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the justificante and worker info
      const { data: justificante, error: getError } = await supabase
        .from("justificantes")
        .select("*, workers:worker_id (email)")
        .eq("id", justificanteId)
        .single();

      if (getError) throw getError;

      if (!justificante?.workers?.email) {
        return new Response(
          JSON.stringify({ success: false, error: "El trabajador no tiene email configurado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate a unique token for the upload link
      const token = crypto.randomUUID();
      const actorName = gestionadoPor || admin.name;

      // Update justificante with pending_docs status and store last request message
      const { error: updateError } = await supabase
        .from("justificantes")
        .update({ 
          estado: "pendiente_docs",
          pending_docs_request: true,
          last_doc_request_message: mensaje,
          updated_at: new Date().toISOString()
        })
        .eq("id", justificanteId);

      if (updateError) throw updateError;

      // Log the action in gestiones
      const { error: logError } = await supabase
        .from("justificante_gestiones")
        .insert({
          justificante_id: justificanteId,
          gestionado_por_user_id: null,
          gestionado_por_nombre: actorName,
          accion: "pendiente_docs",
          comentario_gestor: mensaje,
        });

      if (logError) throw logError;

      // Also insert into justificante_documentos for the chat history
      await supabase
        .from("justificante_documentos")
        .insert({
          justificante_id: justificanteId,
          tipo_mensaje: "solicitud_docs",
          mensaje: mensaje,
          actor_nombre: actorName,
          actor_rol: admin.isRrhh ? "rrhh" : "admin",
        });

      // Send email to worker
      await sendRequestDocumentationEmail(
        justificante.workers.email,
        justificante,
        mensaje,
        `${justificanteId}_${token}`,
        actorName
      );

      // Get department name for audit log
      const { data: deptData } = await supabase.from("departments").select("name").eq("id", justificante.department_id).single();
      
      // Log audit entry
      await supabase.from("justificante_audit_logs").insert({
        justificante_id: justificanteId,
        action_type: "documentacion_solicitada",
        actor_name: actorName,
        actor_role: admin.isRrhh ? "RRHH" : "Admin",
        worker_name: justificante.worker_name,
        worker_number: justificante.worker_number,
        department_name: deptData?.name || "",
        tipo_justificante: justificante.tipo,
        fecha_inicio: justificante.fecha_inicio,
        fecha_fin: justificante.fecha_fin,
        details: mensaje
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get full historial (documentos + gestiones) for chat view
    if (action === "getFullHistorial") {
      const { sessionToken, justificanteId } = data;
      
      const user = await verifyAdminOrRrhhSession(sessionToken);
      if (!user) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get documentos
      const { data: documentos, error: docError } = await supabase
        .from("justificante_documentos")
        .select("*")
        .eq("justificante_id", justificanteId)
        .order("created_at", { ascending: true });

      if (docError) throw docError;

      // Get gestiones
      const { data: gestiones, error: gestError } = await supabase
        .from("justificante_gestiones")
        .select("id, accion, comentario_gestor, gestionado_por_nombre, created_at")
        .eq("justificante_id", justificanteId)
        .order("created_at", { ascending: true });

      if (gestError) throw gestError;

      // Mark this justificante as viewed (update last_viewed_at)
      await supabase
        .from("justificantes")
        .update({ last_viewed_at: new Date().toISOString() })
        .eq("id", justificanteId);

      return new Response(
        JSON.stringify({ success: true, documentos: documentos || [], gestiones: gestiones || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get justificante history (admin)
    if (action === "getJustificanteHistory") {
      const { sessionToken, justificanteId } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: history, error } = await supabase
        .from("justificante_gestiones")
        .select("*")
        .eq("justificante_id", justificanteId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, history }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get matching absences for a justificante
    if (action === "getMatchingAbsences") {
      const { sessionToken, workerId, fechaInicio, fechaFin } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: absences, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("worker_id", workerId)
        .eq("is_absence", true)
        .gte("entry_date", fechaInicio)
        .lte("entry_date", fechaFin)
        .order("entry_date");

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, absences }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= RRHH LOGIN =============

    // Get public list of RRHH users + admins (for login dropdown)
    if (action === "getPublicRrhhUsers") {
      // Get RRHH users
      const { data: rrhhUsers, error: rrhhError } = await supabase
        .from("rrhh_users")
        .select("id, name, role, is_active")
        .eq("is_active", true)
        .order("name");

      if (rrhhError) throw rrhhError;

      // Only get admin "Álvaro" (not all managers)
      const { data: adminManagers, error: managersError } = await supabase
        .from("managers")
        .select("id, name, role, password_hash")
        .eq("role", "admin")
        .ilike("name", "%Álvaro%");

      if (managersError) throw managersError;

      // Combine: admins first, then RRHH users
      const combinedUsers = [
        ...(adminManagers || []).map(m => ({
          id: m.id,
          name: m.name,
          role: "admin_manager",
          is_active: true,
          type: "manager"
        })),
        ...(rrhhUsers || []).map(u => ({
          ...u,
          type: "rrhh"
        }))
      ];

      return new Response(
        JSON.stringify({ success: true, users: combinedUsers }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user needs to create password (before login)
    if (action === "checkNeedsPassword") {
      const { userId, userType } = data;

      if (userType === "manager") {
        const { data: manager } = await supabase
          .from("managers")
          .select("id, password_hash")
          .eq("id", userId)
          .maybeSingle();

        return new Response(
          JSON.stringify({ 
            success: true, 
            needsPassword: !manager?.password_hash 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // RRHH user
      const { data: user } = await supabase
        .from("rrhh_users")
        .select("id, password_hash")
        .eq("id", userId)
        .maybeSingle();

      return new Response(
        JSON.stringify({ 
          success: true, 
          needsPassword: !user?.password_hash 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate RRHH session for auto-login
    if (action === "validateRrhhSession") {
      const { sessionToken } = data;
      
      if (!sessionToken) {
        return new Response(
          JSON.stringify({ success: false, error: "No session token" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if it's a manager session
      const { data: session, error: sessionError } = await supabase
        .from("manager_sessions")
        .select("manager_id, expires_at")
        .eq("token", sessionToken)
        .maybeSingle();

      if (sessionError || !session) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid session" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if expired
      if (new Date(session.expires_at) < new Date()) {
        await supabase.from("manager_sessions").delete().eq("token", sessionToken);
        return new Response(
          JSON.stringify({ success: false, error: "Session expired" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Try to find the user - could be admin manager or RRHH
      const { data: manager } = await supabase
        .from("managers")
        .select("id, name, role")
        .eq("id", session.manager_id)
        .eq("role", "admin")
        .maybeSingle();

      if (manager) {
        return new Response(
          JSON.stringify({ success: true, user: { ...manager, type: "manager" } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Try RRHH user
      const { data: rrhhUser } = await supabase
        .from("rrhh_users")
        .select("id, name, role, is_active")
        .eq("id", session.manager_id)
        .maybeSingle();

      if (rrhhUser && rrhhUser.is_active) {
        return new Response(
          JSON.stringify({ success: true, user: { ...rrhhUser, type: "rrhh" } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Login RRHH user or admin manager
    if (action === "loginRrhhUser") {
      const { userId, password, userType } = data;

      // SECURITY: Rate limiting
      const rlIdentifier = `justificantes_rrhh_${userId}`;
      const rlCutoff = new Date(Date.now() - LOCKOUT_DURATION_MINUTES * 60 * 1000).toISOString();
      const { count: rlFailedCount } = await supabase
        .from('login_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_identifier', rlIdentifier)
        .eq('success', false)
        .gte('attempted_at', rlCutoff);

      if ((rlFailedCount || 0) >= MAX_LOGIN_ATTEMPTS) {
        return new Response(
          JSON.stringify({ success: false, error: `Demasiados intentos fallidos. Espera ${LOCKOUT_DURATION_MINUTES} minutos.`, locked: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

      // Try admin manager first if userType is manager
      if (userType === "manager") {
        const { data: manager, error } = await supabase
          .from("managers")
          .select("id, name, role, password_hash")
          .eq("id", userId)
          .eq("role", "admin")
          .maybeSingle();

        if (error) throw error;

        if (!manager) {
          return new Response(
            JSON.stringify({ success: false, error: "Administrador no encontrado" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!manager.password_hash) {
          return new Response(
            JSON.stringify({ success: false, error: "Administrador sin contraseña configurada" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const isValid = await verifyPasswordBcrypt(password, manager.password_hash);
        if (!isValid) {
          await supabase.from('login_attempts').insert({ user_identifier: rlIdentifier, ip_address: clientIp, success: false });
          const remaining = Math.max(0, MAX_LOGIN_ATTEMPTS - (rlFailedCount || 0) - 1);
          return new Response(
            JSON.stringify({ success: false, error: "Contraseña incorrecta", remainingAttempts: remaining }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabase.from('login_attempts').insert({ user_identifier: rlIdentifier, ip_address: clientIp, success: true });

        // SECURITY: Create session for manager (30 days instead of 10 years)
        const sessionToken = crypto.randomUUID() + "-" + crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const { error: sessionError } = await supabase
          .from("manager_sessions")
          .insert({
            manager_id: manager.id,
            token: sessionToken,
            expires_at: expiresAt,
          });

        // SECURITY: If session creation fails, return error instead of insecure fallback
        if (sessionError) {
          console.error("Session creation error:", sessionError);
          return new Response(
            JSON.stringify({ success: false, error: "Error al crear sesión. Intenta de nuevo." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            user: { id: manager.id, name: manager.name, role: "admin", type: "manager" },
            sessionToken,
            isAdmin: true
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Otherwise, try RRHH user
      const { data: user, error } = await supabase
        .from("rrhh_users")
        .select("id, name, email, role, password_hash, is_active")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;

      if (!user) {
        return new Response(
          JSON.stringify({ success: false, error: "Usuario no encontrado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!user.is_active) {
        return new Response(
          JSON.stringify({ success: false, error: "Usuario desactivado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!user.password_hash) {
        // User needs to set password on first login
        return new Response(
          JSON.stringify({ 
            success: true, 
            needsPassword: true,
            user: { id: user.id, name: user.name, role: user.role, type: "rrhh" }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isValid = await verifyPasswordSha256(password, user.password_hash);
      if (!isValid) {
        await supabase.from('login_attempts').insert({ user_identifier: rlIdentifier, ip_address: clientIp, success: false });
        const remaining = Math.max(0, MAX_LOGIN_ATTEMPTS - (rlFailedCount || 0) - 1);
        return new Response(
          JSON.stringify({ success: false, error: "Contraseña incorrecta", remainingAttempts: remaining }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase.from('login_attempts').insert({ user_identifier: rlIdentifier, ip_address: clientIp, success: true });

      // SECURITY: Create a session token for RRHH user (30 days instead of 10 years)
      const sessionToken = crypto.randomUUID() + "-" + crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { error: sessionError } = await supabase
        .from("manager_sessions")
        .insert({
          manager_id: user.id,
          token: sessionToken,
          expires_at: expiresAt,
        });

      // SECURITY: If session creation fails, return error instead of insecure fallback
      if (sessionError) {
        console.error("Session creation error:", sessionError);
        return new Response(
          JSON.stringify({ success: false, error: "Error al crear sesión. Intenta de nuevo." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          user: { id: user.id, name: user.name, role: user.role, type: "rrhh" },
          sessionToken
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Set password for RRHH user (first login)
    if (action === "setRrhhPassword") {
      const { userId, password } = data;

      if (!password || password.length < 4) {
        return new Response(
          JSON.stringify({ success: false, error: "La contraseña debe tener al menos 4 caracteres" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify user exists and doesn't have password yet
      const { data: user, error: fetchError } = await supabase
        .from("rrhh_users")
        .select("id, name, role, password_hash, is_active")
        .eq("id", userId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!user || !user.is_active) {
        return new Response(
          JSON.stringify({ success: false, error: "Usuario no encontrado o desactivado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (user.password_hash) {
        return new Response(
          JSON.stringify({ success: false, error: "El usuario ya tiene contraseña" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const passwordHash = await hashPasswordSha256(password);
      
      const { error: updateError } = await supabase
        .from("rrhh_users")
        .update({ password_hash: passwordHash })
        .eq("id", userId);

      if (updateError) throw updateError;

      // Create session after setting password
      const sessionToken = crypto.randomUUID() + "-" + crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await supabase.from("manager_sessions").insert({
        manager_id: user.id,
        token: sessionToken,
        expires_at: expiresAt,
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          user: { id: user.id, name: user.name, role: user.role, type: "rrhh" },
          sessionToken
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= RRHH USER MANAGEMENT =============

    // Get RRHH users
    if (action === "getRrhhUsers") {
      const { sessionToken } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: users, error } = await supabase
        .from("rrhh_users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, users }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create RRHH user
    if (action === "createRrhhUser") {
      const { sessionToken, name, email, password, role } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Password is optional on create - users set it on first login
      const passwordHash = password && password.length >= 4 
        ? await hashPasswordSha256(password) 
        : null;

      const { data: user, error } = await supabase
        .from("rrhh_users")
        .insert({
          name,
          email: email || null,
          role: role || "rrhh",
          password_hash: passwordHash,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, user }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update RRHH user
    if (action === "updateRrhhUser") {
      const { sessionToken, userId, name, email, password, isActive, role } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updateData: any = {
        name,
        email: email || null,
        is_active: isActive,
        role: role || "rrhh",
        updated_at: new Date().toISOString(),
      };

      if (password && password.length >= 4) {
        updateData.password_hash = await hashPasswordSha256(password);
      }

      const { error } = await supabase
        .from("rrhh_users")
        .update(updateData)
        .eq("id", userId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reset RRHH user password (admin only)
    if (action === "resetRrhhPassword") {
      const { sessionToken, userId } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabase
        .from("rrhh_users")
        .update({ password_hash: null, updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete RRHH user
    if (action === "deleteRrhhUser") {
      const { sessionToken, userId } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabase
        .from("rrhh_users")
        .delete()
        .eq("id", userId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= SETTINGS =============

    // Get settings
    if (action === "getSettings") {
      const { sessionToken } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: settings, error } = await supabase
        .from("justificantes_settings")
        .select("*")
        .single();

      if (error) throw error;

      // Also fetch manager_email for each department
      const { data: departments } = await supabase
        .from("departments")
        .select("id, name, manager_email")
        .order("name");

      // Merge department manager_email into department_notifications if not already set
      const existingNotifications = settings?.department_notifications || [];
      const enrichedNotifications = departments?.map((dept: any) => {
        const existing = existingNotifications.find((n: any) => n.department_id === dept.id);
        // Parse manager_email (can be comma-separated)
        const managerEmails = dept.manager_email 
          ? dept.manager_email.split(",").map((e: string) => e.trim()).filter((e: string) => e)
          : [];
        
        return {
          department_id: dept.id,
          department_name: dept.name,
          enabled: existing?.enabled ?? false,
          email: existing?.email ?? "",
          manager_emails: managerEmails, // Current emails from department table
        };
      }) || [];

      return new Response(
        JSON.stringify({ 
          success: true, 
          settings: {
            ...settings,
            department_notifications: enrichedNotifications
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update settings
    if (action === "updateSettings") {
      const { sessionToken, notificationEmails, managerNotificationsEnabled, managerNotificationEmails, departmentNotifications } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the single settings row
      const { data: existingSettings } = await supabase
        .from("justificantes_settings")
        .select("id")
        .single();

      // Prepare department_notifications for storage (without manager_emails)
      const cleanDepartmentNotifications = departmentNotifications?.map((n: any) => ({
        department_id: n.department_id,
        department_name: n.department_name,
        enabled: n.enabled,
        email: n.email,
      })) || [];

      const updateData: any = {
        notification_emails: notificationEmails,
        updated_at: new Date().toISOString()
      };
      
      if (managerNotificationsEnabled !== undefined) {
        updateData.manager_notifications_enabled = managerNotificationsEnabled;
      }
      if (managerNotificationEmails !== undefined) {
        updateData.manager_notification_emails = managerNotificationEmails;
      }
      if (departmentNotifications !== undefined) {
        updateData.department_notifications = cleanDepartmentNotifications;
      }

      if (existingSettings) {
        const { error } = await supabase
          .from("justificantes_settings")
          .update(updateData)
          .eq("id", existingSettings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("justificantes_settings")
          .insert({ 
            notification_emails: notificationEmails,
            manager_notifications_enabled: managerNotificationsEnabled || false,
            manager_notification_emails: managerNotificationEmails || [],
            department_notifications: cleanDepartmentNotifications
          });

        if (error) throw error;
      }

      // Also update manager_email in departments table for each enabled department
      if (departmentNotifications && Array.isArray(departmentNotifications)) {
        for (const notification of departmentNotifications) {
          if (notification.enabled && notification.email) {
            // Get current manager_email
            const { data: dept } = await supabase
              .from("departments")
              .select("manager_email")
              .eq("id", notification.department_id)
              .single();

            const currentEmails = dept?.manager_email 
              ? dept.manager_email.split(",").map((e: string) => e.trim()).filter((e: string) => e)
              : [];
            
            // Add the new email if not already present
            if (!currentEmails.includes(notification.email)) {
              currentEmails.push(notification.email);
              await supabase
                .from("departments")
                .update({ manager_email: currentEmails.join(", ") })
                .eq("id", notification.department_id);
            }
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get managers list
    if (action === "getManagers") {
      const { sessionToken } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: managers, error } = await supabase
        .from("managers")
        .select("id, name, department_id")
        .order("name");

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, managers }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get audit logs
    if (action === "getAuditLogs") {
      const { sessionToken } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: logs, error } = await supabase
        .from("justificante_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, logs }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete audit logs (admin only)
    if (action === "deleteAuditLogs") {
      const { sessionToken, logIds } = data;
      
      const admin = await verifyAdminSession(sessionToken);
      if (!admin) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado - Solo administradores" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "No se proporcionaron IDs para eliminar" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabase
        .from("justificante_audit_logs")
        .delete()
        .in("id", logIds);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, deleted: logIds.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get justificantes with documentation history
    if (action === "getJustificantesWithDocs") {
      const user = await verifyAdminOrRrhhSession(data?.sessionToken);
      if (!user) {
        return new Response(
          JSON.stringify({ success: false, error: "No autorizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get justificantes that have documentation history
      const { data: justificantes, error } = await supabase
        .from("justificantes")
        .select(`
          id, worker_name, worker_number, tipo, fecha_inicio, fecha_fin, estado,
          archivo_url, archivo_nombre, archivo_tipo, created_at,
          departments(name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get documentation history for each
      const justificantesWithDocs = await Promise.all(
        (justificantes || []).map(async (j: any) => {
          const { data: docs } = await supabase
            .from("justificante_documentos")
            .select("*")
            .eq("justificante_id", j.id)
            .order("created_at", { ascending: true });
          
          return {
            ...j,
            department_name: j.departments?.name,
            documentos: docs || []
          };
        })
      );

      // Filter to only those with docs
      const filtered = justificantesWithDocs.filter(j => j.documentos.length > 0);

      return new Response(
        JSON.stringify({ success: true, justificantes: filtered }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get departments list
    if (action === "getDepartments") {
      const { data: departments, error } = await supabase
        .from("departments")
        .select("id, name")
        .order("name");

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, departments }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify additional documentation token (public - no auth required)
    if (action === "verifyAdditionalDocsToken") {
      const { token } = data;
      
      if (!token) {
        return new Response(
          JSON.stringify({ success: false, error: "Token no proporcionado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parse token: format is justificanteId_uuid
      const parts = token.split("_");
      if (parts.length < 2) {
        return new Response(
          JSON.stringify({ success: false, error: "Token no válido" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const justificanteId = parts[0];
      
      // Get justificante with worker info
      const { data: justificante, error: getError } = await supabase
        .from("justificantes")
        .select("id, tipo, fecha_inicio, fecha_fin, worker_name, worker_number, worker_id, estado")
        .eq("id", justificanteId)
        .single();

      if (getError || !justificante) {
        return new Response(
          JSON.stringify({ success: false, error: "Justificante no encontrado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if status is pending_docs
      if (justificante.estado !== "pendiente_docs") {
        return new Response(
          JSON.stringify({ success: false, error: "Este justificante ya no está pendiente de documentación" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the latest pending_docs action to get the message
      const { data: lastAction } = await supabase
        .from("justificante_gestiones")
        .select("comentario_gestor")
        .eq("justificante_id", justificanteId)
        .eq("accion", "pendiente_docs")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      return new Response(
        JSON.stringify({ 
          success: true, 
          justificante: {
            id: justificante.id,
            tipo: justificante.tipo,
            fecha_inicio: justificante.fecha_inicio,
            fecha_fin: justificante.fecha_fin,
            worker_name: justificante.worker_name,
            worker_number: justificante.worker_number,
            worker_id: justificante.worker_id,
            mensaje_gestor: lastAction?.comentario_gestor || ""
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Submit additional documentation (public - token based auth)
    if (action === "submitAdditionalDocumentation") {
      const { token, archivoUrl, archivoNombre, archivoTipo, comentario } = data;
      
      if (!token || !archivoUrl || !archivoNombre || !archivoTipo) {
        return new Response(
          JSON.stringify({ success: false, error: "Datos incompletos" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parse token: format is justificanteId_uuid
      const parts = token.split("_");
      if (parts.length < 2) {
        return new Response(
          JSON.stringify({ success: false, error: "Token no válido" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const justificanteId = parts[0];
      
      // Get original justificante
      const { data: original, error: getError } = await supabase
        .from("justificantes")
        .select("*")
        .eq("id", justificanteId)
        .single();

      if (getError || !original) {
        return new Response(
          JSON.stringify({ success: false, error: "Justificante no encontrado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (original.estado !== "pendiente_docs") {
        return new Response(
          JSON.stringify({ success: false, error: "Este justificante ya no está pendiente de documentación" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert the document into justificante_documentos for chat history
      await supabase
        .from("justificante_documentos")
        .insert({
          justificante_id: justificanteId,
          tipo_mensaje: "respuesta_docs",
          mensaje: comentario || null,
          archivo_url: archivoUrl,
          archivo_nombre: archivoNombre,
          archivo_tipo: archivoTipo,
          actor_nombre: original.worker_name,
          actor_rol: "trabajador",
        });

      // Update justificante back to pending and mark as having new docs
      const { error: updateError } = await supabase
        .from("justificantes")
        .update({ 
          estado: "pendiente",
          pending_docs_request: false,
          updated_at: new Date().toISOString()
        })
        .eq("id", justificanteId);

      if (updateError) throw updateError;

      // Log the action in gestiones
      await supabase
        .from("justificante_gestiones")
        .insert({
          justificante_id: justificanteId,
          gestionado_por_nombre: original.worker_name,
          accion: "pendiente",
          comentario_gestor: "Documentación adicional aportada por el trabajador",
        });

      // Get department name for audit log and emails
      const { data: deptData } = await supabase.from("departments").select("name").eq("id", original.department_id).single();
      
      // Log audit entry
      await supabase.from("justificante_audit_logs").insert({
        justificante_id: justificanteId,
        action_type: "documentacion_aportada",
        actor_name: original.worker_name,
        actor_role: "Trabajador",
        worker_name: original.worker_name,
        worker_number: original.worker_number,
        department_name: deptData?.name || "",
        tipo_justificante: original.tipo,
        fecha_inicio: original.fecha_inicio,
        fecha_fin: original.fecha_fin,
        details: comentario || "Documentación adicional subida por el trabajador"
      });

      // Get notification emails for admin/RRHH
      const { data: settings } = await supabase
        .from("justificantes_settings")
        .select("notification_emails")
        .single();
      
      // Also get emails from active RRHH users
      const { data: rrhhUsers } = await supabase
        .from("rrhh_users")
        .select("email")
        .eq("is_active", true)
        .not("email", "is", null);
      
      // Combine all notification emails
      const settingsEmails = settings?.notification_emails || [];
      const rrhhEmails = rrhhUsers?.map(u => u.email).filter(Boolean) || [];
      const notificationEmails = [...new Set([...settingsEmails, ...rrhhEmails])];
      
      // Send notification email to admin/RRHH
      if (notificationEmails.length > 0) {
        console.log("Sending additional docs notification to:", notificationEmails);
        await sendAdditionalDocsNotificationEmail(notificationEmails, original, original.worker_name, comentario);
      } else {
        console.log("No notification emails configured for additional docs");
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Acción no válida" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in justificantes-operations:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Error desconocido" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
