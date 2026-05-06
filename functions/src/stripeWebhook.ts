import { onRequest }    from 'firebase-functions/v2/https';
import { defineSecret }  from 'firebase-functions/params';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
/* eslint-disable @typescript-eslint/no-require-imports */
const Stripe = require('stripe');
import { stripeSecretKey } from './stripe';

const REGION = 'europe-west1';

export const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

// ── Helper: find uid by Stripe customer ID ─────────────────────────────
async function uidByCustomer(
  db:         FirebaseFirestore.Firestore,
  customerId: string,
): Promise<string | null> {
  const snap = await db
    .collection('users')
    .where('stripe_customer_id', '==', customerId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

// ── Helper: period end Timestamp from subscription items ───────────────
function periodEndTs(subscription: any): Timestamp | null {
  const end = subscription?.items?.data?.[0]?.current_period_end as number | undefined;
  return end ? Timestamp.fromMillis(end * 1000) : null;
}

// ── stripeWebhookHandler ───────────────────────────────────────────────
export const stripeWebhookHandler = onRequest(
  { region: REGION, secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const sig = req.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string') {
      res.status(400).send('Missing stripe-signature header');
      return;
    }

    const stripe = new Stripe(stripeSecretKey.value(), { apiVersion: '2026-04-22.dahlia' });
    let event: any;

    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, stripeWebhookSecret.value());
    } catch (err: any) {
      console.error('[stripeWebhook] Signature verification failed:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    console.log(`[stripeWebhook] Processing event: ${event.type}`);

    const db = getFirestore();

    try {
      switch (event.type) {

        case 'checkout.session.completed': {
          const session = event.data.object;
          if (session.mode !== 'subscription') break;

          const uid = session.metadata?.uid as string | undefined;
          if (!uid) { console.error('[stripeWebhook] No uid in checkout session metadata'); break; }

          const subscriptionId = session.subscription as string;
          const subscription   = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['items'],
          });

          const periodEnd = periodEndTs(subscription);

          await db.collection('users').doc(uid).update({
            subscription_status:  subscription.status,
            subscription_id:      subscriptionId,
            stripe_customer_id:   session.customer as string,
            admin_promo_code:     null, // clear after use
            ...(periodEnd ? { subscription_current_period_end: periodEnd } : {}),
          });

          console.log(`[stripeWebhook] Subscription activated — uid: ${uid}`);
          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object;

          let uid = sub.metadata?.uid as string | undefined;
          if (!uid) uid = (await uidByCustomer(db, sub.customer as string)) ?? undefined;
          if (!uid) { console.error('[stripeWebhook] Cannot resolve uid for subscription.updated'); break; }

          const periodEnd = periodEndTs(sub);

          await db.collection('users').doc(uid).update({
            subscription_status: sub.status,
            ...(periodEnd ? { subscription_current_period_end: periodEnd } : {}),
          });

          console.log(`[stripeWebhook] Subscription updated — uid: ${uid}, status: ${sub.status}`);
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object;

          let uid = sub.metadata?.uid as string | undefined;
          if (!uid) uid = (await uidByCustomer(db, sub.customer as string)) ?? undefined;
          if (!uid) { console.error('[stripeWebhook] Cannot resolve uid for subscription.deleted'); break; }

          await db.collection('users').doc(uid).update({
            subscription_status: 'canceled',
            subscription_id:     null,
          });

          console.log(`[stripeWebhook] Subscription canceled — uid: ${uid}`);
          break;
        }

        case 'invoice.payment_failed': {
          const invoice    = event.data.object;
          const customerId = invoice.customer as string;

          const uid = await uidByCustomer(db, customerId);
          if (!uid) break;

          await db.collection('users').doc(uid).update({ subscription_status: 'past_due' });
          console.log(`[stripeWebhook] Payment failed — uid: ${uid}`);
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice    = event.data.object;
          const customerId = invoice.customer as string;
          if (!invoice.subscription) break;

          const uid = await uidByCustomer(db, customerId);
          if (!uid) break;

          await db.collection('users').doc(uid).update({ subscription_status: 'active' });
          console.log(`[stripeWebhook] Invoice paid — uid: ${uid}`);
          break;
        }

        default:
          console.log(`[stripeWebhook] Unhandled event type: ${event.type}`);
      }
    } catch (err) {
      console.error('[stripeWebhook] Error processing event:', err);
    }

    res.status(200).send('OK');
  },
);
