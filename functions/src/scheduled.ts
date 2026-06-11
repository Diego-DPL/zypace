import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import {
  resendApiKey,
  sendRaceReminderEmail,
  sendReactivationEmail,
  sendWeeklySummaryEmail,
  sendNextMesocycleReadyEmail,
  sendDailyWorkoutEmail,
  sendSundayCheckinEmail,
  WeeklyStats,
} from './emailService';
import { generateMesocycleCore } from './mesocycleCore';

const openAiApiKey = defineSecret('OPENAI_API_KEY');
const openAiModel  = defineSecret('OPENAI_MODEL');

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
 * Daily at 06:00 Madrid — auto-generates the next mesocycle for any user
 * whose current plan ends in exactly 3 days (giving them time to review before it starts).
 * Uses skipSubscriptionCheck because this is a trusted server-side operation.
 */
export const autoGenerateNextMesocycle = onSchedule(
  { schedule: '0 6 * * *', timeZone: TIMEZONE, region: REGION, secrets: [openAiApiKey, openAiModel, resendApiKey], timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const db    = getFirestore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetEnd = toISO(addDays(today, 3)); // plans ending in 3 days

    console.log(`[autoGenerateNextMesocycle] Looking for plans with mesocycle_end_date = ${targetEnd}`);

    const plansSnap = await db.collectionGroup('training_plans')
      .where('mesocycle_end_date', '==', targetEnd)
      .where('is_active', '==', true)
      .get();

    if (plansSnap.empty) {
      console.log('[autoGenerateNextMesocycle] No plans due for auto-generation.');
      return;
    }

    const apiKey = openAiApiKey.value();
    const model  = (openAiModel.value() || 'gpt-4o-mini').trim();

    for (const planDoc of plansSnap.docs) {
      const uid    = planDoc.ref.parent.parent?.id;
      const planId = planDoc.id;
      if (!uid) continue;

      try {
        console.log(`[autoGenerateNextMesocycle] Generating for uid=${uid}, planId=${planId}`);
        const result = await generateMesocycleCore(db, uid, planId, apiKey, model, { skipSubscriptionCheck: true });

        if (result.success) {
          const userDoc = await db.collection('users').doc(uid).get();
          const user    = userDoc.data();
          if (user?.email) {
            // Retrieve race name from plan doc
            const planData  = planDoc.data();
            let raceName    = '';
            if (planData?.primary_race_id) {
              const raceDoc = await db.collection('users').doc(uid).collection('races').doc(planData.primary_race_id).get();
              raceName = raceDoc.data()?.name || '';
            }
            await sendNextMesocycleReadyEmail(
              user.email,
              user.first_name || '',
              result.mesocycle_number,
              result.mesocycle_start,
              result.mesocycle_end,
              raceName,
            );
            console.log(`[autoGenerateNextMesocycle] Meso ${result.mesocycle_number} ready, email sent to ${user.email}`);
          }
        }
      } catch (err) {
        console.error(`[autoGenerateNextMesocycle] Error for uid=${uid} planId=${planId}:`, err);
      }
    }
  }
);

/**
 * Daily at 07:00 Madrid — sends today's workout to users who opted in
 * to daily workout emails (user.daily_workout_email_opt_in === true).
 */
export const dailyWorkoutEmail = onSchedule(
  { schedule: '0 7 * * *', timeZone: TIMEZONE, region: REGION, secrets: [resendApiKey] },
  async () => {
    const db      = getFirestore();
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = toISO(today);

    console.log(`[dailyWorkoutEmail] Sending workout emails for ${todayISO}`);

    const usersSnap = await db.collection('users')
      .where('daily_workout_email_opt_in', '==', true)
      .get();

    if (usersSnap.empty) return;

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      if (!user?.email) continue;
      const uid = userDoc.id;

      try {
        const workoutSnap = await db.collection('users').doc(uid)
          .collection('workouts')
          .where('workout_date', '==', todayISO)
          .limit(1)
          .get();

        if (workoutSnap.empty) continue;

        const workout = workoutSnap.docs[0].data();
        if (workout.workout_type === 'descanso') continue; // skip rest days

        await sendDailyWorkoutEmail(
          user.email,
          user.first_name || '',
          workout.description || '',
          workout.workout_type || '',
          todayISO,
        );
        console.log(`[dailyWorkoutEmail] Sent to ${user.email} — type: ${workout.workout_type}`);
      } catch (err) {
        console.error(`[dailyWorkoutEmail] Error for uid ${uid}:`, err);
      }
    }
  }
);

/**
 * Every Sunday at 18:00 Madrid — sends a check-in email with the week's
 * completion stats and a deep-link to the WeeklyAnalysis modal.
 */
export const sundayCheckinEmail = onSchedule(
  { schedule: '0 18 * * 0', timeZone: TIMEZONE, region: REGION, secrets: [resendApiKey] },
  async () => {
    const db    = getFirestore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Current week Mon–Sun
    const dayOfWeek  = today.getDay(); // 0=Sun
    const monday     = addDays(today, dayOfWeek === 0 ? -6 : -(dayOfWeek - 1));
    const monISO     = toISO(monday);
    const sunISO     = toISO(today); // today is Sunday

    const fmt       = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const weekLabel = `${fmt(monday)}–${fmt(today)}`;

    console.log(`[sundayCheckinEmail] Sending check-in for week ${weekLabel}`);

    const usersSnap = await db.collection('users').get();

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      if (!user?.email) continue;
      const uid = userDoc.id;

      try {
        const workoutSnap = await db.collection('users').doc(uid)
          .collection('workouts')
          .where('workout_date', '>=', monISO)
          .where('workout_date', '<=', sunISO)
          .get();

        if (workoutSnap.empty) continue;

        const totalWorkouts     = workoutSnap.size;
        const completedWorkouts = workoutSnap.docs.filter(d => d.data().is_completed).length;

        // Only send to users who had at least 2 planned workouts this week
        if (totalWorkouts < 2) continue;

        await sendSundayCheckinEmail(user.email, user.first_name || '', completedWorkouts, totalWorkouts, weekLabel);
        console.log(`[sundayCheckinEmail] Check-in sent to ${user.email} (${completedWorkouts}/${totalWorkouts})`);
      } catch (err) {
        console.error(`[sundayCheckinEmail] Error for uid ${uid}:`, err);
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
