// Utilidades para integración con Google Calendar y exportación .ics
// Usado por el módulo Candidaturas para entrevistas.

export type InterviewForCalendar = {
  id: string;
  scheduled_at: string;
  duration_minutes?: number | null;
  candidate_name: string;
  candidate_email?: string | null;
  candidate_phone?: string | null;
  room?: string | null;
  additional_info?: string | null;
  departments?: { name?: string | null } | null;
  job_positions?: { title?: string | null } | null;
};

/** Formatea una fecha a "YYYYMMDDTHHmmssZ" en UTC para Google Calendar / iCal */
function toGCalUtc(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

export function getInterviewTitle(itv: InterviewForCalendar): string {
  const dept = itv.departments?.name?.trim();
  return dept ? `${itv.candidate_name} - ${dept}` : itv.candidate_name;
}

export function getInterviewDescription(itv: InterviewForCalendar): string {
  const lines: string[] = [];
  if (itv.job_positions?.title) lines.push(`Vacante: ${itv.job_positions.title}`);
  if (itv.candidate_email) lines.push(`Email: ${itv.candidate_email}`);
  if (itv.candidate_phone) lines.push(`Teléfono: ${itv.candidate_phone}`);
  if (itv.additional_info) lines.push("", itv.additional_info);
  return lines.join("\n");
}

/** Construye la URL "Add to Google Calendar" para una entrevista */
export function buildGoogleCalendarUrl(itv: InterviewForCalendar): string {
  const start = new Date(itv.scheduled_at);
  const duration = itv.duration_minutes ?? 30;
  const end = new Date(start.getTime() + duration * 60 * 1000);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: getInterviewTitle(itv),
    dates: `${toGCalUtc(start)}/${toGCalUtc(end)}`,
    details: getInterviewDescription(itv),
  });
  if (itv.room) params.set("location", `Sala ${itv.room}`);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escapa caracteres reservados de iCalendar (RFC 5545) */
function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Construye un fichero .ics con varias entrevistas */
export function buildIcsForInterviews(interviews: InterviewForCalendar[]): string {
  const now = toGCalUtc(new Date());
  const events = interviews
    .map((itv) => {
      const start = new Date(itv.scheduled_at);
      const duration = itv.duration_minutes ?? 30;
      const end = new Date(start.getTime() + duration * 60 * 1000);
      const lines = [
        "BEGIN:VEVENT",
        `UID:interview-${itv.id}@vnvacaciones`,
        `DTSTAMP:${now}`,
        `DTSTART:${toGCalUtc(start)}`,
        `DTEND:${toGCalUtc(end)}`,
        `SUMMARY:${icsEscape(getInterviewTitle(itv))}`,
      ];
      const desc = getInterviewDescription(itv);
      if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
      if (itv.room) lines.push(`LOCATION:${icsEscape(`Sala ${itv.room}`)}`);
      lines.push("END:VEVENT");
      return lines.join("\r\n");
    })
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VN Vacaciones//Candidaturas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    events,
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Dispara la descarga de un fichero .ics en el navegador */
export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
