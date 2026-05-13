import { serve } from "https://deno.land/std@0.190.0/http/server.ts";


const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const INTERNAL_EMAIL_SECRET = Deno.env.get("INTERNAL_EMAIL_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

interface VacationNotificationRequest {
  to: string; // Can be comma-separated for multiple emails
  type:
    | "new_request"
    | "manager_response"
    | "admin_response"
    | "request_modified"
    | "submission_confirmation"
    | "day_blocked"
    | "day_exception_approved"
    | "day_exception_rejected"
    | "group_exchange_confirmation"
    | "group_exchange_approved"
    | "group_exchange_cancelled"
    | "calendar_modification_signature"
    | "calendar_modification_signed_confirmation"
    | "manager_welcome";
  requestId?: string;
  data: {
    employeeName?: string;
    workerName?: string;
    workerNumber?: string;
    departmentName?: string;
    dates?: string[];
    requestId?: string;
    status?: string;
    rejectionReason?: string;
    editLink?: string;
    managerPanelLink?: string;
    blockedDate?: string;
    blockedReason?: string;
    requestDate?: string;
    rejectedBy?: string;
    // Group exchange fields
    year?: number;
    originalGroup?: string;
    temporaryGroup?: string;
    otherEmployee?: string;
    confirmationLink?: string;
    approvedBy?: string;
    approvedAt?: string;
    // Calendar modification fields
    adminName?: string;
    adminReason?: string;
    signatureLink?: string;
    // Calendar modification signed confirmation fields
    removedDays?: number;
    addedDays?: number;
    removedDates?: string[];
    addedDates?: string[];
    signedAt?: string;
    salixLink?: string;
  };
}

const getEmailTemplate = (type: string, data: any, baseUrl: string) => {
  const verdnaturaGreen = "#93d600";
  
  // Logo URL - usar dominio de producción que es públicamente accesible
  const logoWhiteUrl = "https://vnprod.app/images/logo-white.png";
  // Logo img tag with fixed dimensions for Outlook compatibility
  const logoImgTag = `<img src="${logoWhiteUrl}" alt="Verdnatura" width="80" height="80" class="logo-img" style="width: 80px; height: 80px; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;">`;
  
  const commonStyles = `
    body { font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, ${verdnaturaGreen} 0%, #7ab300 100%); padding: 40px 20px; text-align: center; }
    .logo-img { width: 80px; height: 80px; margin-bottom: 15px; }
    .brand-name { color: #ffffff; font-size: 18px; font-weight: 600; letter-spacing: 2px; margin-bottom: 15px; text-transform: uppercase; }
    .header-title { color: #ffffff; font-size: 24px; font-weight: 600; margin: 0; letter-spacing: -0.5px; }
    .content { padding: 40px 30px; }
    .title { color: #1a1a1a; font-size: 20px; font-weight: 600; margin-bottom: 20px; letter-spacing: -0.3px; }
    .text { color: #666666; font-size: 15px; line-height: 1.7; margin-bottom: 15px; font-weight: 400; letter-spacing: -0.2px; }
    .info-box { background-color: #f8f9fa; border-left: 4px solid ${verdnaturaGreen}; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0; }
    .info-label { color: #1a1a1a; font-weight: 600; font-size: 13px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-value { color: #333333; font-size: 15px; margin-bottom: 15px; font-weight: 400; }
    .dates-container { margin-top: 15px; }
    .date-badge { display: inline-block; background-color: #ffffff; border: 1px solid #e0e0e0; padding: 8px 14px; border-radius: 20px; font-size: 13px; color: #666666; font-weight: 400; margin: 4px; }
    .button { display: inline-block; background: linear-gradient(135deg, ${verdnaturaGreen} 0%, #7ab300 100%); color: #ffffff !important; padding: 16px 36px; text-decoration: none; border-radius: 30px; font-weight: 600; font-size: 15px; margin: 25px 0; box-shadow: 0 4px 15px rgba(147, 214, 0, 0.4); letter-spacing: -0.2px; }
    .footer { background-color: #1a1a1a; color: #ffffff; padding: 30px; text-align: center; }
    .footer-text { color: #888888; font-size: 12px; font-weight: 400; letter-spacing: -0.2px; margin: 5px 0; }
    .alert-box { background-color: #fff8e6; border-left: 4px solid #f0ad4e; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0; }
    .success-box { background-color: #f0fdf4; border-left: 4px solid ${verdnaturaGreen}; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0; }
    .rejected-box { background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0; }
    .divider { height: 1px; background: #eee; margin: 20px 0; }
  `;

  if (type === "new_request") {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>${commonStyles}</style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header">
            ${logoImgTag}
            <h1 class="header-title">Nueva Solicitud de Vacaciones</h1>
          </div>
          <div class="content">
            <p class="title">¡Hola!</p>
            <p class="text">Tienes una nueva solicitud de vacaciones pendiente de revisión.</p>
            
            <div class="info-box">
              <div class="info-label">Empleado</div>
              <div class="info-value">${data.employeeName}</div>
              
              <div class="info-label">Número de Fichar</div>
              <div class="info-value">${data.workerNumber}</div>
              
              <div class="info-label">Departamento</div>
              <div class="info-value">${data.departmentName}</div>
              
              <div class="divider"></div>
              
              <div class="info-label">Fechas Solicitadas (${data.dates.length} días)</div>
              <div class="dates-container">
                ${data.dates.map((date: string) => `<span class="date-badge">${date}</span>`).join('')}
              </div>
            </div>
            
            <p class="text">Por favor, accede a tu panel para aprobar o rechazar esta solicitud:</p>
            
            <div style="text-align: center;">
              <a href="${data.managerPanelLink}${data.requestId ? '?request=' + data.requestId : ''}" class="button" style="color: #ffffff;">Revisar Solicitud</a>
            </div>
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de vacaciones de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  if (type === "admin_response") {
    const isApproved = data.status === "APPROVED";
    const boxClass = isApproved ? "success-box" : "rejected-box";
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>${commonStyles}</style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header" style="${!isApproved ? 'background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);' : ''}">
            ${logoImgTag}
            <h1 class="header-title">${isApproved ? '¡Solicitud Aprobada!' : 'Solicitud Rechazada'}</h1>
          </div>
          <div class="content">
            <p class="title">Hola ${data.employeeName},</p>
            <p class="text">Tu solicitud de vacaciones ha sido <strong style="color: ${isApproved ? verdnaturaGreen : '#ef4444'}; font-weight: 600;">${isApproved ? 'aprobada' : 'rechazada'}</strong> por el departamento de Recursos Humanos.</p>
            
            <div class="${boxClass}">
              <div class="info-label">Departamento</div>
              <div class="info-value">${data.departmentName}</div>
              
              <div class="info-label">Número de Fichar</div>
              <div class="info-value">${data.workerNumber}</div>
              
              <div class="divider"></div>
              
              <div class="info-label">Fechas ${isApproved ? 'Aprobadas' : 'Solicitadas'}</div>
              <div class="dates-container">
                ${data.dates.map((date: string) => `<span class="date-badge">${date}</span>`).join('')}
              </div>
              
              ${!isApproved && data.rejectionReason ? `
                <div class="divider"></div>
                <div class="info-label">Motivo del Rechazo</div>
                <div class="info-value" style="color: #dc2626; font-weight: 500;">${data.rejectionReason}</div>
              ` : ''}
            </div>
            
            ${isApproved ? `
              <p class="text" style="text-align: center; color: ${verdnaturaGreen}; font-weight: 500;">Disfruta tus vacaciones</p>
            ` : `
              <p class="text">Puedes modificar las fechas y enviar una nueva solicitud:</p>
              <div style="text-align: center;">
                <a href="${data.editLink}" class="button" style="color: #ffffff; background: linear-gradient(135deg, ${verdnaturaGreen} 0%, #7ab300 100%);">Nueva Solicitud</a>
              </div>
            `}
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de vacaciones de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  if (type === "request_modified") {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>${commonStyles}</style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header">
            ${logoImgTag}
            <h1 class="header-title">Solicitud Modificada</h1>
          </div>
          <div class="content">
            <p class="title">Hola ${data.employeeName},</p>
            <p class="text">Tu solicitud de vacaciones ha sido <strong style="color: ${verdnaturaGreen}; font-weight: 600;">modificada</strong> por administración.</p>
            
            <div class="success-box">
              <div class="info-label">Departamento</div>
              <div class="info-value">${data.departmentName}</div>
              
              <div class="info-label">Número de Fichar</div>
              <div class="info-value">${data.workerNumber}</div>
              
              <div class="divider"></div>
              
              <div class="info-label">Nuevas Fechas</div>
              <div class="dates-container">
                ${data.dates.map((date: string) => `<span class="date-badge">${date}</span>`).join('')}
              </div>
            </div>
            
            <p class="text" style="text-align: center;">Si tienes alguna duda, contacta con tu encargado.</p>
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de vacaciones de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  if (type === "submission_confirmation") {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>${commonStyles}</style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header">
            ${logoImgTag}
            <h1 class="header-title">Solicitud Recibida</h1>
          </div>
          <div class="content">
            <p class="title">Hola ${data.employeeName},</p>
            <p class="text">Tu solicitud de vacaciones ha sido <strong style="color: ${verdnaturaGreen}; font-weight: 600;">registrada correctamente</strong>.</p>
            
            <div class="success-box">
              <div class="info-label">Departamento</div>
              <div class="info-value">${data.departmentName}</div>
              
              <div class="info-label">Número de Fichar</div>
              <div class="info-value">${data.workerNumber}</div>
              
              <div class="divider"></div>
              
              <div class="info-label">Fechas Solicitadas (${data.dates.length} días)</div>
              <div class="dates-container">
                ${data.dates.map((date: string) => `<span class="date-badge">${date}</span>`).join('')}
              </div>
            </div>
            
            <div class="alert-box">
              <p class="text" style="margin: 0; color: #92400e;">
                <strong>⏳ Tu solicitud está siendo revisada</strong><br><br>
                Recibirás un correo electrónico en este mismo email cuando tu encargado y el departamento de RRHH hayan procesado tu solicitud.<br><br>
                <strong>Por favor, permanece atento a tu bandeja de entrada.</strong>
              </p>
            </div>
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de vacaciones de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  if (type === "day_blocked") {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>${commonStyles}</style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
            ${logoImgTag}
            <h1 class="header-title">⚠️ Día Bloqueado</h1>
          </div>
          <div class="content">
            <p class="title">Aviso de Capacidad Alcanzada</p>
            <p class="text">Se ha alcanzado el límite de personas para el siguiente día en el departamento <strong>${data.departmentName}</strong>.</p>
            
            <div class="alert-box">
              <div class="info-label">Fecha Bloqueada</div>
              <div class="info-value" style="font-size: 18px; font-weight: 600; color: #92400e;">${data.blockedDate}</div>
              
              <div class="divider"></div>
              
              <div class="info-label">Motivo</div>
              <div class="info-value">${data.blockedReason || 'Límite de concurrencia alcanzado'}</div>
            </div>
            
            <p class="text">Este día ya no estará disponible para nuevas solicitudes de vacaciones hasta que se libere manualmente o se cancele alguna solicitud existente.</p>
            
            <p class="text" style="font-size: 13px; color: #888;">Puedes gestionar los días bloqueados desde el panel de administración del calendario anual.</p>
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de vacaciones de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  if (type === "day_exception_approved") {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>${commonStyles}</style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header">
            ${logoImgTag}
            <h1 class="header-title">✅ Excepción Aprobada</h1>
          </div>
          <div class="content">
            <p class="title">Hola ${data.workerName || data.employeeName},</p>
            <p class="text">Tu solicitud de excepción para un día bloqueado ha sido <strong style="color: ${verdnaturaGreen}; font-weight: 600;">aprobada</strong>.</p>
            
            <div class="success-box">
              <div class="info-label">Departamento</div>
              <div class="info-value">${data.departmentName}</div>
              
              <div class="divider"></div>
              
              <div class="info-label">Fecha de Excepción</div>
              <div class="info-value" style="font-size: 18px; font-weight: 600; color: ${verdnaturaGreen};">${data.requestDate}</div>
            </div>
            
            <p class="text" style="text-align: center; color: ${verdnaturaGreen}; font-weight: 500;">
              Ahora puedes seleccionar este día en tu calendario de vacaciones.
            </p>
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de vacaciones de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  if (type === "day_exception_rejected") {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>${commonStyles}</style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
            ${logoImgTag}
            <h1 class="header-title">❌ Excepción Rechazada</h1>
          </div>
          <div class="content">
            <p class="title">Hola ${data.workerName || data.employeeName},</p>
            <p class="text">Tu solicitud de excepción para un día bloqueado ha sido <strong style="color: #ef4444; font-weight: 600;">rechazada</strong> por el ${data.rejectedBy || 'administrador'}.</p>
            
            <div class="rejected-box">
              <div class="info-label">Departamento</div>
              <div class="info-value">${data.departmentName}</div>
              
              <div class="divider"></div>
              
              <div class="info-label">Fecha Solicitada</div>
              <div class="info-value" style="font-size: 18px; font-weight: 600; color: #dc2626;">${data.requestDate}</div>
              
              ${data.rejectionReason ? `
                <div class="divider"></div>
                <div class="info-label">Motivo del Rechazo</div>
                <div class="info-value" style="color: #dc2626; font-weight: 500;">${data.rejectionReason}</div>
              ` : ''}
            </div>
            
            <p class="text" style="text-align: center;">
              Por favor, selecciona otras fechas para tus vacaciones o contacta con tu encargado si tienes dudas.
            </p>
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de vacaciones de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Group Exchange Confirmation Email
  if (type === "group_exchange_confirmation") {
    const year = data?.year ?? new Date().getFullYear();

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>${commonStyles}</style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header">
            ${logoImgTag}
            <h1 class="header-title">Intercambio de Grupo</h1>
          </div>
          <div class="content">
            <p class="title">Hola ${data.employeeName},</p>
            <p class="text">Se ha creado un intercambio de grupo de vacaciones para el año <strong>${year}</strong>.</p>
            
            <div class="info-box">
              <div class="info-label">Intercambio con</div>
              <div class="info-value" style="font-size: 16px; font-weight: 600;">${data.otherEmployee}</div>
              
              <div class="divider"></div>
              
              <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 20px;">
                <div>
                  <div class="info-label">Tu grupo actual</div>
                  <div class="info-value">${data.originalGroup}</div>
                </div>
                <div style="display: flex; align-items: center; color: #888;">→</div>
                <div>
                  <div class="info-label">Grupo temporal (${year})</div>
                  <div class="info-value" style="color: ${verdnaturaGreen}; font-weight: 600;">${data.temporaryGroup}</div>
                </div>
              </div>
            </div>

            ${data.futureVacationDates && data.futureVacationDates.length > 0 ? `
            <div class="info-box" style="margin-top: 16px;">
              <div class="info-label">📅 Tus días de vacaciones con el grupo ${data.temporaryGroup} (a partir de hoy)</div>
              <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;">
                ${data.futureVacationDates.map((d: string) => `<span style="display: inline-block; background: ${verdnaturaGreen}22; color: ${verdnaturaGreen}; border: 1px solid ${verdnaturaGreen}44; border-radius: 6px; padding: 3px 8px; font-size: 13px; font-weight: 600;">${d}</span>`).join('')}
              </div>
              <p style="margin: 10px 0 0; font-size: 12px; color: #888;">Total: <strong>${data.futureVacationDates.length} días</strong> pendientes</p>
            </div>
            ` : ''}
            
            <div class="alert-box">
              <p class="text" style="margin: 0; color: #92400e;">
                <strong>Importante:</strong> Este intercambio es temporal y solo afecta al año ${year}. Tu grupo real no cambia.
              </p>
            </div>
            
            <p class="text">Pulsa el botón para revisar los detalles, firmar y confirmar:</p>
            
            <div style="text-align: center;">
              <a href="${data.confirmationLink}" class="button" style="color: #ffffff;">Revisar y Confirmar</a>
            </div>
            
            <p class="text" style="font-size: 13px; color: #888; text-align: center;">
              Cuando ambos empleados firmen, el intercambio se aplicará automáticamente.
            </p>
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de vacaciones de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Group Exchange Approved Email
  if (type === "group_exchange_approved") {
    const year = data?.year ?? new Date().getFullYear();
    const approvedAt = data?.approvedAt ? new Date(data.approvedAt) : null;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>${commonStyles}</style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header">
            ${logoImgTag}
            <h1 class="header-title">✅ Intercambio Aprobado</h1>
          </div>
          <div class="content">
            <p class="title">Hola ${data.employeeName},</p>
            <p class="text">Tu intercambio temporal de grupo para el año <strong>${year}</strong> ha sido <strong style="color: ${verdnaturaGreen}; font-weight: 600;">aprobado</strong> por administración.</p>

            <div class="success-box">
              <div class="info-label">Intercambio con</div>
              <div class="info-value" style="font-size: 16px; font-weight: 600;">${data.otherEmployee}</div>

              <div class="divider"></div>

              <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 20px;">
                <div>
                  <div class="info-label">Tu grupo actual</div>
                  <div class="info-value">${data.originalGroup}</div>
                </div>
                <div style="display: flex; align-items: center; color: #888;">→</div>
                <div>
                  <div class="info-label">Grupo temporal (${year})</div>
                  <div class="info-value" style="color: ${verdnaturaGreen}; font-weight: 600;">${data.temporaryGroup}</div>
                </div>
              </div>

              <div class="divider"></div>

              <div class="info-label">Aprobado por</div>
              <div class="info-value">${data.approvedBy || 'Administración'}${approvedAt ? ` el ${approvedAt.toLocaleDateString('es-ES')}` : ''}</div>
            </div>

            <p class="text" style="font-size: 13px; color: #888; text-align: center;">
              Este intercambio solo afecta al calendario del año ${year}.
            </p>
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de vacaciones de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Group Exchange Cancelled Email
  if (type === "group_exchange_cancelled") {
    const year = data?.year ?? new Date().getFullYear();
    const cancelledAt = data?.cancelledAt ? new Date(data.cancelledAt) : null;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>${commonStyles}</style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header">
            ${logoImgTag}
            <h1 class="header-title">❌ Intercambio Cancelado</h1>
          </div>
          <div class="content">
            <p class="title">Hola ${data.employeeName},</p>
            <p class="text">El intercambio temporal de grupo para el año <strong>${year}</strong> ha sido <strong style="color: #dc2626; font-weight: 600;">cancelado</strong> por administración.</p>

            <div class="info-box">
              <div class="info-label">Intercambio con</div>
              <div class="info-value" style="font-size: 16px; font-weight: 600;">${data.otherEmployee}</div>

              <div class="divider"></div>

              <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 20px;">
                <div>
                  <div class="info-label">Tu grupo original</div>
                  <div class="info-value">${data.originalGroup}</div>
                </div>
                <div style="display: flex; align-items: center; color: #888;">→</div>
                <div>
                  <div class="info-label">Grupo que tenías asignado</div>
                  <div class="info-value" style="text-decoration: line-through; color: #888;">${data.temporaryGroup}</div>
                </div>
              </div>

              <div class="divider"></div>

              <div class="info-label">Cancelado por</div>
              <div class="info-value">${data.cancelledBy || 'Administración'}${cancelledAt ? ` el ${cancelledAt.toLocaleDateString('es-ES')}` : ''}</div>

              ${data.cancellationReason ? `
                <div class="divider"></div>
                <div class="info-label">Motivo</div>
                <div class="info-value">${data.cancellationReason}</div>
              ` : ''}
            </div>

            <p class="text" style="font-size: 13px; color: #888; text-align: center;">
              Vuelves a tu grupo original para el calendario del año ${year}.
            </p>
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de vacaciones de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Calendar Modification Signature Request Email
  if (type === "calendar_modification_signature") {
    const year = data?.year ?? new Date().getFullYear();

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>${commonStyles}</style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header">
            ${logoImgTag}
            <h1 class="header-title">Modificación de Calendario</h1>
          </div>
          <div class="content">
            <p class="title">Hola ${data.workerName},</p>
            <p class="text">Desde <strong>Recursos Humanos</strong> se ha realizado un <strong style="color: ${verdnaturaGreen}; font-weight: 600;">cambio extraordinario</strong> en tu calendario personal de vacaciones.</p>

            <div class="info-box">
              <div class="info-label">Año</div>
              <div class="info-value" style="font-size: 18px; font-weight: 600; color: ${verdnaturaGreen};">${year}</div>
              
              <div class="info-label">Número de Fichar</div>
              <div class="info-value">${data.workerNumber || '—'}</div>
              
              <div class="info-label">Departamento</div>
              <div class="info-value">${data.departmentName || '—'}</div>
              
              <div class="divider"></div>
              
              <div class="info-label">Motivo del cambio</div>
              <div class="info-value" style="font-size: 14px; font-style: italic;">"${data.adminReason || 'Necesidades operativas'}"</div>
              
              <div class="divider"></div>
              
              <div class="info-label">Gestionado por</div>
              <div class="info-value">${(data.adminName || 'Administración').split(' ')[0]}</div>
            </div>

            <div class="alert-box">
              <p class="text" style="margin: 0; color: #92400e;">
                <strong>Acción requerida</strong><br><br>
                Para que este cambio sea efectivo, necesitas revisar los detalles y <strong>firmar tu conformidad</strong> haciendo clic en el botón de abajo.<br><br>
                Si no estás de acuerdo, podrás rechazar la modificación indicando el motivo.
              </p>
            </div>

            <div style="text-align: center;">
              <a href="${data.signatureLink}" class="button" style="color: #ffffff;">Revisar y Firmar</a>
            </div>

            <p class="text" style="font-size: 13px; color: #888; margin-top: 20px; text-align: center;">
              Este enlace te llevará a una página segura donde podrás ver todos los cambios propuestos.
            </p>
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de vacaciones de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  if (type === "calendar_modification_signed_confirmation") {
    const removedDays = data.removedDays || (data.removedDates?.length ?? 0) || 0;
    const addedDays = data.addedDays || (data.addedDates?.length ?? 0) || 0;
    const removedDates = Array.isArray(data.removedDates) ? data.removedDates : [];
    const addedDates = Array.isArray(data.addedDates) ? data.addedDates : [];

    const signedDate = data.signedAt ? new Date(data.signedAt).toLocaleString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) : 'Fecha desconocida';

    const renderDates = (dates: string[], color: string) => {
      if (!dates || dates.length === 0) return '';
      return `
        <div class="dates-container">
          ${dates
            .slice()
            .sort()
            .map(d => `<span class="date-badge" style="border-color: ${color}; color: ${color};">${d}</span>`)
            .join('')}
        </div>
      `;
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>${commonStyles}</style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header">
            ${logoImgTag}
            <h1 class="header-title">Modificación de Calendario Firmada</h1>
          </div>
          <div class="content">
            <p class="title">Confirmación de Firma</p>
            <p class="text">El trabajador <strong>${data.workerName || 'Sin nombre'}</strong> (${data.workerNumber || 'Sin número'}) ha firmado la modificación de su calendario.</p>

            <div class="success-box">
              <div class="info-label">Departamento</div>
              <div class="info-value">${data.departmentName}</div>

              <div class="info-label">Año</div>
              <div class="info-value">${data.year || new Date().getFullYear()}</div>

              <div class="divider"></div>

              <div class="info-label">Días eliminados del grupo (${removedDays})</div>
              <div class="info-value" style="color: #ef4444; font-weight: 500;">
                ${removedDays > 0 ? 'Se eliminan días del grupo vacacional' : '—'}
                ${renderDates(removedDates, '#ef4444')}
              </div>

              <div class="divider"></div>

              <div class="info-label">Días añadidos (${addedDays})</div>
              <div class="info-value" style="color: ${verdnaturaGreen}; font-weight: 500;">
                ${addedDays > 0 ? 'Se añaden días al calendario personal' : '—'}
                ${renderDates(addedDates, verdnaturaGreen)}
              </div>

              <div class="divider"></div>

              <div class="info-label">Creado por</div>
              <div class="info-value">${data.adminName || 'Administrador'}</div>

              <div class="info-label">Firmado el</div>
              <div class="info-value" style="font-weight: 600; color: ${verdnaturaGreen};">${signedDate}</div>
            </div>

            ${data.salixLink ? `
              <div style="text-align: center;">
                <a class="button" href="${data.salixLink}" target="_blank" rel="noopener noreferrer">Abrir calendario en Sálix</a>
              </div>
            ` : ''}

            <p class="text" style="text-align: center; font-size: 13px; color: #888;">
              Los cambios ya han sido aplicados automáticamente al calendario del trabajador.
            </p>
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de vacaciones de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  if (type === "manager_welcome") {
    const setupUrl = `${baseUrl}/setup-password?token=${data.setupToken}`;
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>${commonStyles}</style>
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div class="container">
          <div class="header">
            ${logoImgTag}
            <div class="brand-name">VERDNATURA</div>
            <h1 class="header-title">Bienvenido/a al sistema de gestión</h1>
          </div>
          <div class="content">
            <p class="title">¡Hola ${data.managerName}!</p>
            <p class="text">Se te ha creado una cuenta en el sistema de gestión de Verdnatura. Para empezar a usarla, solo necesitas configurar tu contraseña.</p>
            
            <div class="info-box">
              <div class="info-label">Nombre</div>
              <div class="info-value">${data.managerName}</div>
              
              <div class="info-label">Email de acceso</div>
              <div class="info-value">${data.managerEmail}</div>
            </div>
            
            <p class="text">Pulsa el botón de abajo para configurar tu contraseña y activar tu cuenta:</p>
            
            <div style="text-align: center;">
              <a href="${setupUrl}" class="button" style="color: #ffffff;">Configurar mi contraseña</a>
            </div>
            
            <p class="text" style="font-size: 13px; color: #888; text-align: center; margin-top: 30px;">
              Si no esperabas este correo, puedes ignorarlo. El enlace es de un solo uso.
            </p>
          </div>
          <div class="footer">
            <p class="footer-text">Este es un correo automático del sistema de gestión de Verdnatura</p>
            <p class="footer-text">© ${new Date().getFullYear()} Verdnatura. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  return "";
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate internal secret to prevent unauthorized email sending
  const internalSecret = req.headers.get("x-internal-secret");
  if (!INTERNAL_EMAIL_SECRET || internalSecret !== INTERNAL_EMAIL_SECRET) {
    console.error("Unauthorized: Invalid or missing internal secret");
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { to, type, requestId, data }: VacationNotificationRequest = await req.json();

    console.log("Received email request - to:", to, "type:", type, "requestId:", requestId);

    // Validate required fields
    if (!to || !type || !data) {
      console.error("Missing required fields");
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: to, type, data" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse multiple emails (comma-separated)
    const emails = to.split(',').map(e => e.trim()).filter(e => e);
    
    // Validate email format for all emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(email => !emailRegex.test(email));
    
    if (emails.length === 0) {
      console.error("No valid emails provided");
      return new Response(
        JSON.stringify({ success: false, error: "No valid emails provided" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (invalidEmails.length > 0) {
      console.warn("Some invalid email formats ignored:", invalidEmails);
    }
    
    const validEmails = emails.filter(email => emailRegex.test(email));

    console.log("Validation passed, sending email via Resend to:", validEmails.join(', '));

    const safeYear = data?.year ?? new Date().getFullYear();

    const subject = type === "manager_welcome"
      ? `🔑 Configura tu contraseña - Verdnatura`
      : type === "new_request" 
      ? `📋 Nueva Solicitud de Vacaciones - ${data.employeeName}`
      : type === "submission_confirmation"
      ? `✅ Solicitud de Vacaciones Recibida - ${data.departmentName}`
      : type === "request_modified"
      ? `✏️ Solicitud de Vacaciones Modificada - ${data.departmentName}`
      : type === "day_blocked"
      ? `⚠️ Día Bloqueado - ${data.departmentName}`
      : type === "day_exception_approved"
      ? `✅ Excepción de Día Aprobada - ${data.departmentName}`
      : type === "day_exception_rejected"
      ? `❌ Excepción de Día Rechazada - ${data.departmentName}`
      : type === "group_exchange_confirmation"
      ? `Confirmación de Intercambio de Grupo (${safeYear})`
      : type === "group_exchange_approved"
      ? `✅ Intercambio de Grupo Aprobado (${safeYear})`
      : type === "group_exchange_cancelled"
      ? `❌ Intercambio de Grupo Cancelado (${safeYear})`
      : type === "calendar_modification_signature"
      ? `Modificación de Calendario - Firma Requerida (${safeYear})`
      : type === "calendar_modification_signed_confirmation"
      ? `Modificación de Calendario Firmada - ${data.workerName || 'Trabajador'} (${data.workerNumber || '—'})`
      : data.status === "APPROVED"
      ? `✅ Solicitud de Vacaciones Aprobada - ${data.departmentName}`
      : `❌ Solicitud de Vacaciones Rechazada - ${data.departmentName}`;

    // Base URL (production)
    const baseUrl = "https://vnprod.app";
    const htmlContent = getEmailTemplate(type, data, baseUrl);

    if (!htmlContent) {
      console.error("Invalid email type:", type);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email type" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email using Resend API
    console.log("Sending email via Resend...");

    const resendBody: any = {
      from: "Vacaciones Verdnatura <vacaciones@vnprod.app>",
      to: validEmails,
      subject,
      html: htmlContent,
    };
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendBody),
    });

    const responseText = await response.text();
    console.log("Resend API raw response status:", response.status);
    console.log("Resend API raw response:", responseText);

    let emailResponse;
    try {
      emailResponse = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse Resend response:", responseText);
      emailResponse = { raw: responseText };
    }

    if (!response.ok) {
      console.error("Error sending email via Resend - Status:", response.status, "Response:", emailResponse);
      return new Response(
        JSON.stringify({ success: false, error: emailResponse.message || "Failed to send email", details: emailResponse }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully via Resend:", JSON.stringify(emailResponse));

    return new Response(JSON.stringify({ success: true, ...emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-vacation-notification:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
