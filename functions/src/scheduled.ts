import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import {
  resendApiKey,
  sendRaceReminderEmail,
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
