import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import {
  resendApiKey,
  sendRaceReminderEmail,
  sendReactivationEmail,
  sendWeeklySummaryEmail,
  WeeklyStats,
} from './emailService';

const REGION    = 'europe-west1';
const TIMEZONE  = 'Europe/Madrid';

// ── Helpers ───────────────────────────────────────────────────────────
function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Daily at 09:00 Madrid — checks if any user has a race in exactly 7 days
 * and sends a reminder email.
 */
export const dailyRaceReminder = onSchedule(
  { schedule: '0 9 * * *', timeZone: TIMEZONE, region: REGION, secrets: [resendApiKey] },
  async () => {
    const db         = getFirestore();
    const today      = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = addDays(today, 7);
    const targetISO  = toISO(targetDate);

    console.log(`[dailyRaceReminder] Checking races on ${targetISO}`);

    // Collection group query across all users' races
    const racesSnap = await db
      .collectionGroup('races')
      .where('date', '==', targetISO)
      .get();

    if (racesSnap.empty) {
      console.log('[dailyRaceReminder] No races in 7 days.');
      return;
    }

    for (const raceDoc of racesSnap.docs) {
      // users/{uid}/races/{raceId}  →  parent.parent.id = uid
      const uid = raceDoc.ref.parent.parent?.id;
      if (!uid) continue;

      const race = raceDoc.data();

      try {
        const userDoc = await db.collection('users').doc(uid).get();
        const user    = userDoc.data();
        if (!user?.email) continue;

        await sendRaceReminderEmail(
          user.email,
          user.first_name || '',
          race.name       || 'Tu carrera',
          race.date       || targetISO,
          7,
        );
        console.log(`[dailyRaceReminder] Reminder sent to ${user.email} for "${race.name}"`);
      } catch (err) {
        console.error(`[dailyRaceReminder] Error for uid ${uid}:`, err);
      }
    }
  }
);

/**
 * Daily at 10:00 Madrid — sends a reactivation email to users who cancelled
 * exactly 30 days ago and haven't received one yet.
 */
export const reactivationEmailJob = onSchedule(
  { schedule: '0 10 * * *', timeZone: TIMEZONE, region: REGION, secrets: [resendApiKey] },
  async () => {
    const db    = getFirestore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Window: cancelled between 29 and 31 days ago
    const from = new Date(today); from.setDate(from.getDate() - 31);
    const to   = new Date(today); to.setDate(to.getDate()   - 29);

    console.log(`[reactivationEmailJob] Checking cancellations between ${from.toISOString()} and ${to.toISOString()}`);

    const snap = await db.collection('cancellations')
      .where('cancelled_at', '>=', from)
      .where('cancelled_at', '<=', to)
      .where('reactivation_sent', '==', false)
      .get();

    // Also check docs that don't have the field yet (first run)
    const snapMissing = await db.collection('cancellations')
      .where('cancelled_at', '>=', from)
      .where('cancelled_at', '<=', to)
      .get();

    const docs = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    for (const d of [...snap.docs, ...snapMissing.docs]) {
      if (!docs.has(d.id) && !d.data().reactivation_sent) docs.set(d.id, d);
    }

    if (docs.size === 0) {
      console.log('[reactivationEmailJob] No eligible cancellations.');
      return;
    }

    for (const [, cancDoc] of docs) {
      const data = cancDoc.data() as Record<string, any> | undefined;
      if (!data?.email) continue;

      try {
        await sendReactivationEmail(data.email as string, (data.first_name as string) || '');
        await cancDoc.ref.update({ reactivation_sent: true });
        console.log(`[reactivationEmailJob] Reactivation email sent to: ${data.email}`);
      } catch (err) {
        console.error(`[reactivationEmailJob] Error for ${data.email}:`, err);
      }
    }
  }
);

/**
 * Every Monday at 08:00 Madrid — sends a weekly training summary
 * to all users who had at least one scheduled workout last week.
 */
export const weeklyEmailSummary = onSchedule(
  { schedule: '0 8 * * 1', timeZone: TIMEZONE, region: REGION, secrets: [resendApiKey] },
  async () => {
    const db    = getFirestore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Last week: Mon–Sun
    const lastMonday = addDays(today, -7);
    const lastSunday = addDays(today, -1);
    const lastMonISO = toISO(lastMonday);
    const lastSunISO = toISO(lastSunday);

    // Next week: Mon–Sun
    const nextMonday = today;
    const nextSunday = addDays(today, 6);
    const nextMonISO = toISO(nextMonday);
    const nextSunISO = toISO(nextSunday);

    // Week label for subject e.g. "28 abr – 4 may"
    const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const weekLabel = `${fmt(lastMonday)}–${fmt(lastSunday)}`;

    console.log(`[weeklyEmailSummary] Sending summary for week ${weekLabel}`);

    // Get all users
    const usersSnap = await db.collection('users').get();

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      if (!user?.email) continue;

      const uid = userDoc.id;

      try {
        // Workouts last week
        const lastWeekSnap = await db
          .collection('users').doc(uid)
          .collection('workouts')
          .where('workout_date', '>=', lastMonISO)
          .where('workout_date', '<=', lastSunISO)
          .get();

        if (lastWeekSnap.empty) continue; // skip inactive users

        const totalWorkouts     = lastWeekSnap.size;
        const completedWorkouts = lastWeekSnap.docs.filter(d => d.data().is_completed).length;

        // Workouts next week
        const nextWeekSnap = await db
          .collection('users').doc(uid)
          .collection('workouts')
          .where('workout_date', '>=', nextMonISO)
          .where('workout_date', '<=', nextSunISO)
          .get();

        const stats: WeeklyStats = {
          completedWorkouts,
          totalWorkouts,
          nextWeekWorkouts: nextWeekSnap.size,
          weekLabel,
        };

        await sendWeeklySummaryEmail(user.email, user.first_name || '', stats);
        console.log(`[weeklyEmailSummary] Summary sent to ${user.email}`);
      } catch (err) {
        console.error(`[weeklyEmailSummary] Error for uid ${uid}:`, err);
      }
    }
  }
);
