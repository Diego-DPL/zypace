import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

interface ExportICSRequest {
  plan_id?: string;
  from_date?: string; // ISO date, defaults to today
  to_date?: string;   // ISO date, defaults to 90 days from now
}

function escapeICS(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function foldLine(line: string): string {
  // RFC 5545 §3.1: fold lines longer than 75 octets
  if (line.length <= 75) return line;
  let result = '';
  while (line.length > 75) {
    result += line.substring(0, 75) + '\r\n ';
    line = line.substring(75);
  }
  return result + line;
}

function dateToICSDate(iso: string): string {
  // "2026-06-11" → "20260611"
  return iso.replace(/-/g, '');
}

// Returns the plan workouts as an ICS calendar string.
export const exportCalendarICS = onCall(
  { region: 'europe-west1', cors: true, invoker: 'public' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const { plan_id: planId, from_date, to_date } = (request.data ?? {}) as ExportICSRequest;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromISO = from_date ?? today.toISOString().substring(0, 10);
    const toDate  = to_date ? new Date(to_date) : new Date(today.getTime() + 90 * 86400000);
    const toISO   = toDate.toISOString().substring(0, 10);

    const db = getFirestore();
    let workoutsQuery = db.collection('users').doc(uid).collection('workouts')
      .where('workout_date', '>=', fromISO)
      .where('workout_date', '<=', toISO);

    if (planId) {
      workoutsQuery = workoutsQuery.where('plan_id', '==', planId) as typeof workoutsQuery;
    }

    const snap = await workoutsQuery.orderBy('workout_date', 'asc').get();

    if (snap.empty) throw new HttpsError('not-found', 'No hay entrenamientos en el rango especificado');

    const now        = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15) + 'Z';
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Zypace//Training Plan//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Zypace — Plan de entrenamiento',
      'X-WR-TIMEZONE:Europe/Madrid',
    ];

    for (const docSnap of snap.docs) {
      const w = docSnap.data();
      const dateStr    = (w.workout_date as string).replace(/-/g, '');
      const type       = w.explanation_json?.type || w.workout_type || 'entrenamiento';
      const distKm     = w.distance_km ? ` · ${w.distance_km} km` : '';
      const durMin     = w.duration_min ? ` · ${w.duration_min} min` : '';
      const summary    = escapeICS(`Zypace: ${type}${distKm}${durMin}`);
      const desc       = escapeICS((w.description || '').substring(0, 500));
      const uid_event  = `${docSnap.id}@zypace.com`;

      lines.push('BEGIN:VEVENT');
      lines.push(foldLine(`UID:${uid_event}`));
      lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
      lines.push(`DTEND;VALUE=DATE:${dateStr}`);
      lines.push(`DTSTAMP:${now}`);
      lines.push(foldLine(`SUMMARY:${summary}`));
      if (desc) lines.push(foldLine(`DESCRIPTION:${desc}`));
      if (w.is_completed) lines.push('STATUS:COMPLETED');
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    const icsContent = lines.map(foldLine).join('\r\n');

    return {
      ics: icsContent,
      filename: `zypace-plan-${fromISO}.ics`,
      workout_count: snap.size,
    };
  }
);
