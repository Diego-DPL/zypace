"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhookHandler = exports.stripeWebhookSecret = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
/* eslint-disable @typescript-eslint/no-require-imports */
const Stripe = require('stripe');
const stripe_1 = require("./stripe");
const emailService_1 = require("./emailService");
const REGION = 'europe-west1';
exports.stripeWebhookSecret = (0, params_1.defineSecret)('STRIPE_WEBHOOK_SECRET');
// ── Helper: find uid by Stripe customer ID ─────────────────────────────
async function uidByCustomer(db, customerId) {
    const snap = await db
        .collection('users')
        .where('stripe_customer_id', '==', customerId)
        .limit(1)
        .get();
    return snap.empty ? null : snap.docs[0].id;
}
// ── Helper: period end Timestamp from subscription items ───────────────
function periodEndTs(subscription) {
    var _a, _b, _c;
    const end = (_c = (_b = (_a = subscription === null || subscription === void 0 ? void 0 : subscription.items) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.current_period_end;
    return end ? firestore_1.Timestamp.fromMillis(end * 1000) : null;
}
// ── stripeWebhookHandler ───────────────────────────────────────────────
exports.stripeWebhookHandler = (0, https_1.onRequest)({ region: REGION, secrets: [stripe_1.stripeSecretKey, exports.stripeWebhookSecret, emailService_1.resendApiKey] }, async (req, res) => {
    var _a, _b, _c, _d, _e;
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    const sig = req.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string') {
        res.status(400).send('Missing stripe-signature header');
        return;
    }
    const stripe = new Stripe(stripe_1.stripeSecretKey.value(), { apiVersion: '2026-04-22.dahlia' });
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, exports.stripeWebhookSecret.value());
    }
    catch (err) {
        console.error('[stripeWebhook] Signature verification failed:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    console.log(`[stripeWebhook] Processing event: ${event.type}`);
    const db = (0, firestore_1.getFirestore)();
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                if (session.mode !== 'subscription')
                    break;
                const uid = (_a = session.metadata) === null || _a === void 0 ? void 0 : _a.uid;
                if (!uid) {
                    console.error('[stripeWebhook] No uid in checkout session metadata');
                    break;
                }
                const subscriptionId = session.subscription;
                const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
                    expand: ['items'],
                });
                const periodEnd = periodEndTs(subscription);
                await db.collection('users').doc(uid).update(Object.assign({ subscription_status: subscription.status, subscription_id: subscriptionId, stripe_customer_id: session.customer, admin_promo_code: null }, (periodEnd ? { subscription_current_period_end: periodEnd } : {})));
                console.log(`[stripeWebhook] Subscription activated — uid: ${uid}, status: ${subscription.status}`);
                // Send trial start email when subscription begins in trial mode
                if (subscription.status === 'trialing' && subscription.trial_end) {
                    try {
                        const userSnap = await db.collection('users').doc(uid).get();
                        const userData = userSnap.data();
                        if (userData === null || userData === void 0 ? void 0 : userData.email) {
                            const trialEndMs = subscription.trial_end * 1000;
                            await (0, emailService_1.sendTrialStartEmail)(userData.email, userData.first_name || '', trialEndMs);
                            console.log(`[stripeWebhook] Trial start email sent to: ${userData.email}`);
                        }
                    }
                    catch (err) {
                        console.error('[stripeWebhook] Failed to send trial start email:', err);
                    }
                }
                break;
            }
            case 'customer.subscription.updated': {
                const sub = event.data.object;
                let uid = (_b = sub.metadata) === null || _b === void 0 ? void 0 : _b.uid;
                if (!uid)
                    uid = (_c = (await uidByCustomer(db, sub.customer))) !== null && _c !== void 0 ? _c : undefined;
                if (!uid) {
                    console.error('[stripeWebhook] Cannot resolve uid for subscription.updated');
                    break;
                }
                const periodEnd = periodEndTs(sub);
                await db.collection('users').doc(uid).update(Object.assign({ subscription_status: sub.status }, (periodEnd ? { subscription_current_period_end: periodEnd } : {})));
                console.log(`[stripeWebhook] Subscription updated — uid: ${uid}, status: ${sub.status}`);
                break;
            }
            case 'customer.subscription.deleted': {
                const sub = event.data.object;
                let uid = (_d = sub.metadata) === null || _d === void 0 ? void 0 : _d.uid;
                if (!uid)
                    uid = (_e = (await uidByCustomer(db, sub.customer))) !== null && _e !== void 0 ? _e : undefined;
                if (!uid) {
                    console.error('[stripeWebhook] Cannot resolve uid for subscription.deleted');
                    break;
                }
                await db.collection('users').doc(uid).update({
                    subscription_status: 'canceled',
                    subscription_id: null,
                });
                console.log(`[stripeWebhook] Subscription canceled — uid: ${uid}`);
                break;
            }
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const customerId = invoice.customer;
                const uid = await uidByCustomer(db, customerId);
                if (!uid)
                    break;
                await db.collection('users').doc(uid).update({ subscription_status: 'past_due' });
                console.log(`[stripeWebhook] Payment failed — uid: ${uid}`);
                break;
            }
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                const customerId = invoice.customer;
                if (!invoice.subscription)
                    break;
                const uid = await uidByCustomer(db, customerId);
                if (!uid)
                    break;
                await db.collection('users').doc(uid).update({ subscription_status: 'active' });
                console.log(`[stripeWebhook] Invoice paid — uid: ${uid}`);
                break;
            }
            default:
                console.log(`[stripeWebhook] Unhandled event type: ${event.type}`);
        }
    }
    catch (err) {
        console.error('[stripeWebhook] Error processing event:', err);
    }
    res.status(200).send('OK');
});
//# sourceMappingURL=stripeWebhook.js.map