import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import {
  resendApiKey,
  sendWelcomeEmail,
  sendIncidentReplyEmail,
  sendIncidentResolvedEmail,
  sendPlanReadyEmail,
} from './emailService';

/**
 * Sends a welcome email when a new user document is created in Firestore.
 * Fires on: users/{uid} creation (triggered by RegisterPage on sign-up).
 */
export const onUserCreated = onDocumentCreated(
  { document: 'users/{uid}', region: 'europe-west1', secrets: [resendApiKey] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const uid       = event.params.uid;
    const email     = data.email as string | undefined;
    const firstName = (data.first_name as string | undefined) || '';

    if (!email) {
      console.warn('[onUserCreated] No email found for uid:', uid);
      return;
    }

    const db = getFirestore();

    // ── Check invite: if this email was pre-invited, grant is_exempt ──
    try {
      const inviteDoc = await db.collection('invites').doc(email.toLowerCase()).get();
      if (inviteDoc.exists && inviteDoc.data()?.is_exempt) {
        await db.collection('users').doc(uid).update({ is_exempt: true });
        await db.collection('invites').doc(email.toLowerCase()).update({
          used:    true,
          used_at: new Date(),
          used_by: uid,
        });
        console.log('[onUserCreated] Invited user granted is_exempt:', email);
      }
    } catch (err) {
      console.error('[onUserCreated] Failed to apply invite exemption:', err);
    }

    // ── Send welcome email ────────────────────────────────────────────
    try {
      await sendWelcomeEmail(email, firstName);
      console.log('[onUserCreated] Welcome email sent to:', email);
    } catch (err) {
      console.error('[onUserCreated] Failed to send welcome email:', err);
    }
  }
);

/**
 * Sends a "plan ready" email when a new training plan is created.
 * Fires on: users/{uid}/training_plans/{planId} creation.
 */
export const onPlanCreated = onDocumentCreated(
  { document: 'users/{uid}/training_plans/{planId}', region: 'europe-west1', secrets: [resendApiKey] },
  async (event) => {
    const plan = event.data?.data();
    if (!plan) return;

    const uid = event.params.uid;
    const db  = getFirestore();

    try {
      // Get user email and name
      const userDoc = await db.collection('users').doc(uid).get();
      const user    = userDoc.data();
      if (!user?.email) return;

      // Get race info if available
      let raceName = '';
      let raceDate = '';
      if (plan.race_id) {
        const raceDoc = await db.collection('users').doc(uid).collection('races').doc(plan.race_id).get();
        if (raceDoc.exists) {
          raceName = raceDoc.data()?.name  || '';
          raceDate = raceDoc.data()?.date  || '';
        }
      }

      await sendPlanReadyEmail(
        user.email,
        user.first_name || '',
        plan.goal       || '',
        plan.total_weeks ?? 0,
        raceName,
        raceDate,
      );
      console.log('[onPlanCreated] Plan ready email sent to:', user.email);
    } catch (err) {
      console.error('[onPlanCreated] Failed to send plan ready email:', err);
    }
  }
);

/**
 * Sends a notification email when an admin replies to an incident
 * or when an incident is marked as resolved.
 */
export const onIncidentUpdated = onDocumentUpdated(
  { document: 'incidents/{incidentId}', region: 'europe-west1', secrets: [resendApiKey] },
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();
    if (!before || !after) return;

    const userEmail = after.user_email as string | undefined;
    const subject   = (after.subject as string) || 'Sin asunto';

    if (!userEmail) return;

    const messagesBefore: any[] = before.messages  || [];
    const messagesAfter:  any[] = after.messages   || [];

    // ── New admin reply ───────────────────────────────────────────────
    if (messagesAfter.length > messagesBefore.length) {
      const lastMsg = messagesAfter[messagesAfter.length - 1];
      if (lastMsg?.sender === 'admin' && lastMsg?.text) {
        try {
          await sendIncidentReplyEmail(userEmail, subject, lastMsg.text);
          console.log('[onIncidentUpdated] Reply email sent to:', userEmail);
        } catch (err) {
          console.error('[onIncidentUpdated] Failed to send reply email:', err);
        }
        return; // don't also send resolved if both happened at once
      }
    }

    // ── Status changed to resolved ────────────────────────────────────
    if (before.status !== 'resuelta' && after.status === 'resuelta') {
      try {
        await sendIncidentResolvedEmail(userEmail, subject);
        console.log('[onIncidentUpdated] Resolved email sent to:', userEmail);
      } catch (err) {
        console.error('[onIncidentUpdated] Failed to send resolved email:', err);
      }
    }
  }
);
