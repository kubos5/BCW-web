// Esportazione nel Calendario (iOS, macOS, Google, Outlook…) in formato iCalendar (.ics).

import { addDays, dayKey } from './util.js';

const pad = (n) => String(n).padStart(2, '0');

function utc(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

const dateOnly = (date) => dayKey(date).replace(/-/g, '');

function escapeText(text) {
  return (text ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Le righe più lunghe di 75 byte vanno spezzate (RFC 5545). */
function fold(line) {
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    if (bytes + size > 73) {
      parts.push(current);
      current = ' ';
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n');
}

function eventTitle(event) {
  const prefix = event.kind === 'test' ? 'Verifica' : event.kind === 'homework' ? 'Compiti' : '';
  return [prefix, event.title].filter(Boolean).join(' · ');
}

function vevent(event, reminderHour) {
  const allDay = event.isFullDay || event.kind === 'homework';
  const lines = [
    'BEGIN:VEVENT',
    `UID:bcw-${event.id}@bcw`,
    `DTSTAMP:${utc(new Date())}`,
    `SUMMARY:${escapeText(eventTitle(event))}`,
    `DESCRIPTION:${escapeText(event.notes)}`,
  ];
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(event.begin)}`, `DTEND;VALUE=DATE:${dateOnly(addDays(event.begin, 1))}`);
  } else {
    const end = event.end > event.begin ? event.end : new Date(event.begin.getTime() + 3_600_000);
    lines.push(`DTSTART:${utc(event.begin)}`, `DTEND:${utc(end)}`);
  }
  if (reminderHour != null && event.kind !== 'event') {
    // Avviso la sera prima, all'orario scelto nelle impostazioni.
    const fire = addDays(event.day, -1);
    fire.setHours(reminderHour, 0, 0, 0);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(eventTitle(event))}`,
      `TRIGGER;VALUE=DATE-TIME:${utc(fire)}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

export function makeICS(events, { reminderHour = null, name = 'BCW' } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BCW//Better ClasseViVa//IT', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(name)}`];
  for (const event of events) lines.push(...vevent(event, reminderHour));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadFile(content, name, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function addToCalendar(event) {
  downloadFile(makeICS([event]), `${eventTitle(event).replace(/[^\p{L}\p{N} ._-]/gu, '') || 'evento'}.ics`, 'text/calendar');
}
