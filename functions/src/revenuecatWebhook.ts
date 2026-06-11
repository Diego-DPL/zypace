import { onRequest }    from 'firebase-functions/v2/https';
import { defineSecret }  from 'firebase-functions/params';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const REGION = 'europe-west1';

export const revenuecatWebhookSecret = defineSecret('REVENUECAT_WEBHOOK_SECRET');

export const revenuecatWebhookHandler = onRequest(
  { region: REGION, secrets: [revenuecatWebhookSecret] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const authHeader = req.headers.authorization ?? '';
    if (authHeader !== `Bearer ${revenuecatWebhookSecret.value()}`) {
      res.status(401).send('Unauthorized');
      return;
    }

    const event = req.body?.event;
    if (!event?.type || !event?.app_user_id) {
      res.status(200).send('OK');
      return;
    }

    const uid          = event.app_user_id as string;
    const expirationMs = event.expiration_at_ms as number | null;
    const periodEnd    = expirationMs ? Timestamp.fromMillis(expirationMs) : null;
    const db           = getFirestore();

    console.log(`[revenuecatWebhook] type=${event.type} uid=${uid}`);

    try {
      switch (event.type as string) {

        case 'INITIAL_PURCHASE':
        case 'RENEWAL':
        case 'TRIAL_CONVERTED':
        case 'NON_RENEWING_PURCHASE': {
          const isTrial = event.period_type === 'TRIAL';
          await db.collection('users').doc(uid).update({
            subscription_status:               isTrial ? 'trialing' : 'active',
            subscription_cancel_at_period_end: false,
            ...(periodEnd ? { subscription_current_period_end: periodEnd } : {}),
          });
          break;
        }

        case 'TRIAL_STARTED': {
          await db.collection('users').doc(uid).update({
            subscription_status:               'trialing',
            subscription_cancel_at_period_end: false,
            ...(periodEnd ? { subscription_current_period_end: periodEnd } : {}),
          });
          break;
        }

        case 'CANCELLATION': {
          await db.collection('users').doc(uid).update({
            subscription_cancel_at_period_end: true,
            ...(periodEnd ? { subscription_current_period_end: periodEnd } : {}),
          });
          break;
        }

        case 'EXPIRATION': {
          await db.collection('users').doc(uid).update({
            subscription_status:               'canceled',
            subscription_cancel_at_period_end: false,
          });
          break;
        }

        case 'BILLING_ISSUE': {
          await db.collection('users').doc(uid).update({ subscription_status: 'past_due' });
          break;
        }

        default:
          console.log(`[revenuecatWebhook] Unhandled event type: ${event.type}`);
      }
    } catch (err) {
      console.error('[revenuecatWebhook] Error processing event:', err);
    }

    res.status(200).send('OK');
  },
);
