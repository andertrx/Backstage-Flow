/**
 * Reuniões → Google Agenda (43.7), sem login nem chave: um link "Adicionar ao Google Agenda" e um arquivo .ics
 * (que o Google Agenda, o Outlook e o Apple Calendar abrem). É um evento avulso: mudar a reunião depois no CRM
 * não muda o que já foi adicionado na agenda. A sincronização automática exige conectar a conta Google (fase seguinte).
 */
export interface CalendarEvent {
  title: string;
  /** ISO. */
  startsAt: string;
  durationMin: number;
  location?: string | null;
  details?: string | null;
  /** Identificador estável (o .ics usa para não duplicar ao importar de novo). */
  uid: string;
}

/** AAAAMMDDTHHMMSSZ, em UTC. */
export function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function endOf(e: CalendarEvent): string {
  return new Date(new Date(e.startsAt).getTime() + e.durationMin * 60_000).toISOString();
}

/** Link do Google Agenda para criar o evento já preenchido (a pessoa confirma lá). */
export function googleCalendarUrl(e: CalendarEvent): string {
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${icsDate(e.startsAt)}/${icsDate(endOf(e))}` });
  if (e.details?.trim()) p.set("details", e.details.trim().slice(0, 1500));
  if (e.location?.trim()) p.set("location", e.location.trim().slice(0, 300));
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Linhas com mais de 75 bytes são quebradas (regra do formato .ics). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

/** Texto de um arquivo .ics com um evento. */
export function buildIcs(e: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Backstage Flow//Reunioes//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${e.uid}@backstageflow.com.br`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `DTSTART:${icsDate(e.startsAt)}`,
    `DTEND:${icsDate(endOf(e))}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.location?.trim() ? [`LOCATION:${esc(e.location.trim())}`] : []),
    ...(e.details?.trim() ? [`DESCRIPTION:${esc(e.details.trim())}`] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
