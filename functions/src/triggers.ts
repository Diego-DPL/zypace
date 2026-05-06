import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import {
  resendApiKey,
  sendWelcomeEmail,
  sendIncidentReplyEmail,
  sendIncidentResolvedEmail,
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

    const email     = data.email as string | undefined;
    const firstName = (data.first_name as string | undefined) || '';

    if (!email) {
      console.warn('[onUserCreated] No email found for uid:', event.params.uid);
      return;
    }

    try {
      await sendWelcomeEmail(email, firstName);
      console.log('[onUserCreated] Welcome email sent to:', email);
    } catch (err) {
      console.error('[onUserCreated] Failed to send welcome email:', err);
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
